// src/functions/fetchRss.ts
import Parser from 'rss-parser'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { generateQuizFromArticle } from '../services/quizGenerator'
import { rssSources } from '../constans/rssSources'
import { extractArticleText } from '../utils/extractArticleText'
import { judgeArticleMode, type ArticleMode } from '../utils/articleMode'

const parser = new Parser()
const dynamo = new DynamoDBClient({})

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

      if (!link) {
        console.log('リンクがないためスキップ:', title)
        continue
      }

      // PK 用のID
      const id = `NEWS#${publishedAt}`

      // 公開日時チェック（ざっくり「昨日以降」だけ処理）
      let pubDate: Date | null = null
      if (item.pubDate) {
        const d = new Date(item.pubDate)
        if (!isNaN(d.getTime())) {
          pubDate = d
        }
      } else if (item.isoDate) {
        const d = new Date(item.isoDate)
        if (!isNaN(d.getTime())) {
          pubDate = d
        }
      }

      if (pubDate) {
        const now = new Date()
        const yesterday = new Date(now)
        yesterday.setDate(now.getDate() - 1)
        yesterday.setHours(0, 0, 0, 0)

        if (pubDate < yesterday) {
          console.log('古い記事のためスキップ:', title, publishedAt)
          continue
        }
      }

      // ① 記事本文を取得
      let articleText = ''
      try {
        articleText = await extractArticleText(link)
      } catch (e) {
        console.error('記事本文取得失敗:', link, e)
      }

      // 本文が空なら RSS の description などでフォロー
      if (!articleText || articleText.trim().length === 0) {
        const fallback = (item.contentSnippet ?? item.content ?? '').toString().trim()
        if (fallback) {
          console.log('本文が空のため RSS スニペットを利用:', title)
          articleText = fallback
        }
      }

      // ② 記事の長さからモード判定
      const mode: ArticleMode = judgeArticleMode(articleText)

      if (mode === 'skip') {
        console.log('内容不足のためクイズ生成スキップ:', title, link)
        continue
      }

      // ③ Claude (Bedrock) でクイズ生成
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
        continue
      }

      if (!quiz) {
        console.error('クイズ生成結果が空:', link)
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
            },
          })
        )
      } catch (e) {
        console.error('クイズ保存失敗:', title, link, e)
        // ニュースメタだけは保存しておいても良いので、処理は続行
      }

      // ⑤ ニュース本体のメタ情報も保存
      try {
        await dynamo.send(
          new PutItemCommand({
            TableName: process.env.TABLE_NAME!,
            Item: {
              PK: { S: id },
              SK: { S: 'META' },
              title: { S: title },
              link: { S: link },
              publishedAt: { S: publishedAt },
            },
          })
        )
      } catch (e) {
        console.error('ニュースメタ保存失敗:', title, link, e)
      }
    }
  }

  return { status: 'ok' }
}
