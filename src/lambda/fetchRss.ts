// src/functions/fetchRss.ts
import Parser from 'rss-parser'
import crypto from 'crypto'
import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { generateQuizFromArticle } from '../services/quizGenerator'
import { rssSources } from '../constans/rssSources'
import { extractArticleText } from '../utils/extractArticleText'
import { judgeArticleMode, type ArticleMode } from '../utils/articleMode'

const parser = new Parser()
const dynamo = new DynamoDBClient({})

type SourceType = 'qiita' | 'zenn' | 'codezine' | 'publickey' | 'medium' | 'other'

const getSourceType = (feedUrl: string, link: string): SourceType => {
  const target = `${feedUrl} ${link}`

  if (target.includes('qiita.com')) return 'qiita'
  if (target.includes('zenn.dev')) return 'zenn'
  if (target.includes('codezine.jp')) return 'codezine'
  if (target.includes('publickey1.jp')) return 'publickey'
  if (target.includes('medium.com')) return 'medium'

  return 'other'
}

const createNewsId = (link: string): string => {
  const hash = crypto.createHash('sha256').update(link).digest('hex')
  return `NEWS#${hash}`
}

const parsePublishedDate = (item: Parser.Item): Date | null => {
  const raw = item.isoDate ?? item.pubDate
  if (!raw) return null

  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

const isTargetPublishedDate = (pubDate: Date | null): boolean => {
  // 日付が取れない記事は一旦処理対象にする
  if (!pubDate) return true

  const now = new Date()
  const yesterday = new Date(now)

  // Lambda/EventBridgeはUTC基準になりやすいので、
  // 「昨日以降」をUTC基準で見る
  yesterday.setUTCDate(now.getUTCDate() - 1)
  yesterday.setUTCHours(0, 0, 0, 0)

  return pubDate >= yesterday
}

const getRssFallbackText = (item: Parser.Item): string => {
  return (item.contentSnippet ?? item.content ?? '').toString().trim()
}

const saveNewsMeta = async (params: {
  id: string
  title: string
  link: string
  publishedAt: string
  publishedAtRaw: string
  sourceType: SourceType
  status: string
  reason?: string
}) => {
  const item: Record<string, any> = {
    PK: { S: params.id },
    SK: { S: 'META' },
    title: { S: params.title },
    link: { S: params.link },
    publishedAt: { S: params.publishedAt },
    publishedAtRaw: { S: params.publishedAtRaw },
    source: { S: params.sourceType },
    status: { S: params.status },
    updatedAt: { S: new Date().toISOString() },
  }

  if (params.reason) {
    item.reason = { S: params.reason }
  }

  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.TABLE_NAME!,
      Item: item,
    })
  )
}

const updateNewsStatus = async (params: {
  id: string
  status: string
  reason?: string
  articleTextLength?: number
  mode?: ArticleMode
}) => {
  const expressionAttributeNames: Record<string, string> = {
    '#status': 'status',
    '#updatedAt': 'updatedAt',
  }

  const expressionAttributeValues: Record<string, any> = {
    ':status': { S: params.status },
    ':updatedAt': { S: new Date().toISOString() },
  }

  const updateExpressions = ['#status = :status', '#updatedAt = :updatedAt']

  if (params.reason) {
    expressionAttributeNames['#reason'] = 'reason'
    expressionAttributeValues[':reason'] = { S: params.reason }
    updateExpressions.push('#reason = :reason')
  }

  if (typeof params.articleTextLength === 'number') {
    expressionAttributeNames['#articleTextLength'] = 'articleTextLength'
    expressionAttributeValues[':articleTextLength'] = {
      N: params.articleTextLength.toString(),
    }
    updateExpressions.push('#articleTextLength = :articleTextLength')
  }

  if (params.mode) {
    expressionAttributeNames['#mode'] = 'mode'
    expressionAttributeValues[':mode'] = { S: params.mode }
    updateExpressions.push('#mode = :mode')
  }

  await dynamo.send(
    new UpdateItemCommand({
      TableName: process.env.TABLE_NAME!,
      Key: {
        PK: { S: params.id },
        SK: { S: 'META' },
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  )
}

export const handler = async () => {
  for (const feedUrl of rssSources) {
    console.log('Fetch RSS:', feedUrl)

    let feed
    try {
      feed = await parser.parseURL(feedUrl)
    } catch (e) {
      console.error('RSS取得に失敗:', feedUrl, e)
      continue
    }

    for (const item of feed.items) {
      const title = item.title ?? ''
      const link = item.link ?? ''
      const publishedAt = item.isoDate ?? item.pubDate ?? ''
      const publishedAtRaw = item.pubDate ?? item.isoDate ?? ''

      if (!link) {
        console.log('リンクがないためスキップ:', title)
        continue
      }

      const id = createNewsId(link)
      const sourceType = getSourceType(feedUrl, link)
      const pubDate = parsePublishedDate(item)

      if (!isTargetPublishedDate(pubDate)) {
        console.log('古い記事のためスキップ:', title, publishedAt)
        continue
      }

      // RSSで拾えた時点でメタ保存
      try {
        await saveNewsMeta({
          id,
          title,
          link,
          publishedAt,
          publishedAtRaw,
          sourceType,
          status: 'RSS_FETCHED',
        })
      } catch (e) {
        console.error('ニュースメタ保存失敗:', title, link, e)
        // メタ保存できないなら後続も管理しづらいのでスキップ
        continue
      }

      // ① 記事本文を取得
      let articleText = ''

      try {
        articleText = await extractArticleText(link)
      } catch (e) {
        console.error('記事本文取得失敗:', link, e)
      }

      // 本文が空なら RSS の description/contentSnippet/content でフォロー
      if (!articleText || articleText.trim().length === 0) {
        const fallback = getRssFallbackText(item)

        if (fallback) {
          console.log('本文が空のため RSS スニペットを利用:', title)
          articleText = fallback
        }
      }

      console.log({
        title,
        link,
        sourceType,
        articleTextLength: articleText.length,
        articleTextPreview: articleText.slice(0, 200),
      })

      // ② 記事の長さからモード判定
      const mode: ArticleMode = judgeArticleMode(articleText)

      if (mode === 'skip') {
        const reason =
          sourceType === 'medium'
            ? '本文不足。Medium会員限定またはRSS抜粋のみの可能性'
            : '本文不足のためクイズ生成スキップ'

        console.log(reason, title, link)

        await updateNewsStatus({
          id,
          status: sourceType === 'medium' ? 'READ_CANDIDATE' : 'CONTENT_TOO_SHORT',
          reason,
          articleTextLength: articleText.length,
          mode,
        })

        continue
      }

      await updateNewsStatus({
        id,
        status: 'CONTENT_EXTRACTED',
        articleTextLength: articleText.length,
        mode,
      })

      // ③ Claude / Bedrock でクイズ生成
      let quiz
      try {
        quiz = await generateQuizFromArticle({
          title,
          url: link,
          articleText,
          mode,
        })
      } catch (err) {
        console.error('クイズ生成失敗:', link, err)

        await updateNewsStatus({
          id,
          status: 'QUIZ_FAILED',
          reason: err instanceof Error ? err.message : String(err),
          articleTextLength: articleText.length,
          mode,
        })

        continue
      }

      if (!quiz) {
        console.error('クイズ生成結果が空:', link)

        await updateNewsStatus({
          id,
          status: 'QUIZ_EMPTY',
          reason: 'クイズ生成結果が空',
          articleTextLength: articleText.length,
          mode,
        })

        continue
      }

      // ④ クイズを DynamoDB に保存
      try {
        await dynamo.send(
          new PutItemCommand({
            TableName: process.env.TABLE_NAME!,
            Item: {
              PK: { S: `QUIZ#${id}` },
              SK: { S: 'Q#1' },
              question: { S: quiz.question },
              choices: { S: JSON.stringify(quiz.choices) },
              answerIndex: { N: quiz.answerIndex.toString() },
              rationale: { S: quiz.rationale },
              difficulty: { S: quiz.difficulty },
              title: { S: title },
              url: { S: link },
              source: { S: sourceType },
              newsId: { S: id },
              createdAt: { S: new Date().toISOString() },
            },
          })
        )

        await updateNewsStatus({
          id,
          status: 'QUIZ_CREATED',
          articleTextLength: articleText.length,
          mode,
        })
      } catch (e) {
        console.error('クイズ保存失敗:', title, link, e)

        await updateNewsStatus({
          id,
          status: 'QUIZ_SAVE_FAILED',
          reason: e instanceof Error ? e.message : String(e),
          articleTextLength: articleText.length,
          mode,
        })
      }
    }
  }

  return { status: 'ok' }
}
