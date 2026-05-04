// src/services/quizService.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import type { Quiz } from '../types/quiz'

const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)

const DEFAULT_LIMIT = 50

const parseChoices = (rawChoices: unknown): string[] => {
  if (Array.isArray(rawChoices)) return rawChoices

  if (typeof rawChoices === 'string') {
    try {
      const parsed = JSON.parse(rawChoices)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

export const getAllQuizzes = async (limit = DEFAULT_LIMIT): Promise<Quiz[]> => {
  const res = await dynamo.send(
    new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: '#gsi1pk = :quiz',
      ExpressionAttributeNames: {
        '#gsi1pk': 'GSI1PK',
      },
      ExpressionAttributeValues: {
        ':quiz': 'QUIZ',
      },
      ScanIndexForward: false, // GSI1SK = publishedAt の降順
      Limit: limit,
    })
  )

  const items = res.Items ?? []

  return items.map((item) => ({
    id: item.PK ?? '',
    question: item.question ?? '',
    choices: parseChoices(item.choices),
    answerIndex: Number(item.answerIndex ?? 0),
    rationale: item.rationale ?? '',
    difficulty: item.difficulty ?? '',
    content: item.content ?? '',
    title: item.title ?? '(タイトル未設定)',
    url: item.url ?? '',
    publishedAt: item.publishedAt ?? '',
    source: item.source ?? 'other',
    newsId: item.newsId ?? '',
  }))
}
