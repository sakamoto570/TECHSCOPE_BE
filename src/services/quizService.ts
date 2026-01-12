// src/services/quizService.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'
import type { Quiz } from '../types/quiz'

const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)

const DEFAULT_LIMIT = 50

export const getAllQuizzes = async (limit = DEFAULT_LIMIT): Promise<Quiz[]> => {
  const res = await dynamo.send(
    new ScanCommand({
      TableName: process.env.TABLE_NAME,
      FilterExpression: 'begins_with(#pk, :quiz)',
      ExpressionAttributeNames: { '#pk': 'PK' },
      ExpressionAttributeValues: { ':quiz': 'QUIZ#' },
    })
  )

  const items = res.Items ?? []

  // PK = "QUIZ#NEWS#2025-12-18T10:00:00.000Z"
  const parsePublishedAt = (pk: string): string => {
    const parts = pk.split('#')
    return parts[2] ?? '' // 3番目が日時
  }

  const quizzes: Quiz[] = []

  for (const item of items) {
    const sk = item.SK as string
    if (!sk.startsWith('Q#')) continue // META などは無視

    const pk = item.PK as string
    const publishedAt = parsePublishedAt(pk)

    // choices の型ゆらぎ吸収
    const rawChoices = (item as any).choices
    let choices: string[] = []

    if (Array.isArray(rawChoices)) {
      choices = rawChoices
    } else if (typeof rawChoices === 'string') {
      try {
        choices = JSON.parse(rawChoices)
      } catch {
        choices = []
      }
    }

    quizzes.push({
      id: pk,
      question: item.question as string,
      choices,
      answerIndex: Number((item as any).answerIndex ?? 0),
      rationale: (item as any).rationale ?? '',
      difficulty: (item as any).difficulty ?? '',
      content: (item as any).content ?? '',
      title: (item as any).title ?? '(タイトル未設定)',
      url: (item as any).url ?? '',
      publishedAt,
    })
  }

  // 最新順にして limit で切る
  return quizzes
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .slice(0, limit)
}
