import Parser from 'rss-parser'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { generateQuizFromArticle } from '../services/quizGenerator'
import { rssSources } from '../constans/rssSources'

const parser = new Parser()
const dynamo = new DynamoDBClient({})

export const handler = async () => {
  for (const url of rssSources) {
    const feed = await parser.parseURL(url)

    for (const item of feed.items) {
      const id = `NEWS#${item.isoDate ?? item.pubDate}`
      const sk = 'META'
      const pubDate = new Date(item.pubDate ?? '')
      const now = new Date()
      const yesterday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
      )
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(0, 0, 0, 0) // 日付のみ比較するため時刻をリセット

      if (pubDate < yesterday) {
        console.log('古い記事のためスキップ:', item.title)
        continue // Bedrock処理をスキップ
      }

      // Claude に URL を渡して、本文抽出＋クイズ生成を実行（本文抽出もClaudeに委譲）
      let quiz
      try {
        quiz = await generateQuizFromArticle({
          title: item.title ?? '',
          url: item.link ?? '',
        })
      } catch (err) {
        console.error('クイズ生成失敗:', item.link, err)
        continue
      }

      // クイズを保存
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
            content: { S: quiz.content },
            url: { S: item.link ?? '' },
          },
        })
      )

      // ニュース本体も保存
      await dynamo.send(
        new PutItemCommand({
          TableName: process.env.TABLE_NAME!,
          Item: {
            PK: { S: id },
            SK: { S: sk },
            title: { S: item.title ?? '' },
            link: { S: item.link ?? '' },
            publishedAt: { S: item.isoDate ?? item.pubDate ?? '' },
          },
        })
      )
    }
  }

  return { status: 'ok' }
}
