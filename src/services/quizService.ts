// src/services/quizService.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'
import type { Quiz } from '../types/quiz'

const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)

const DEFAULT_LIMIT = 50

export const getAllQuizzes = async (limit = DEFAULT_LIMIT): Promise<Quiz[]> => {
  console.log('TABLE_NAME:', process.env.TABLE_NAME)

  const res = await dynamo.send(
    new ScanCommand({
      TableName: process.env.TABLE_NAME,
      FilterExpression: 'begins_with(#pk, :quiz)',
      ExpressionAttributeNames: {
        '#pk': 'PK',
      },
      ExpressionAttributeValues: {
        ':quiz': 'QUIZ#',
      },
    })
  )

  const items = res.Items ?? []
  console.log('scan items count:', items.length)

  const grouped: Record<string, Partial<Quiz>> = {}

  for (const item of items) {
    const pk = item.PK as string
    const sk = item.SK as string

    if (!grouped[pk]) grouped[pk] = {}

    // --- META 行（ニュース記事情報） ---
    if (sk === 'META') {
      grouped[pk].title = item.title as string | undefined
      // Dynamo のフィールド名が url 前提（違ってたらここだけ合わせればOK）
      grouped[pk].url = (item as any).url as string | undefined
      grouped[pk].publishedAt = item.publishedAt as string | undefined
      continue
    }

    // --- 質問行（Q#1, Q#2, ...）---
    if (typeof sk === 'string' && sk.startsWith('Q#')) {
      // すでに質問が入っていたらスキップ（Q#1 優先）
      if (grouped[pk].question) continue

      const rawChoices = (item as any).choices
      let choices: string[] = []

      if (Array.isArray(rawChoices)) {
        choices = rawChoices as string[]
      } else if (typeof rawChoices === 'string') {
        try {
          choices = JSON.parse(rawChoices)
        } catch {
          choices = []
        }
      }

      grouped[pk].question = item.question as string | undefined
      grouped[pk].choices = choices
      grouped[pk].answerIndex = Number((item as any).answerIndex)
      grouped[pk].rationale = item.rationale as string | undefined
      grouped[pk].difficulty = item.difficulty as string | undefined
      grouped[pk].content = item.content as string | undefined
    }
  }

  let quizzes: Quiz[] = Object.entries(grouped)
    // 少なくとも question があるものだけを残す
    .filter(([_, q]) => q.question)
    .map(([id, q]) => ({
      id,
      title: q.title ?? '(タイトル未設定)',
      url: q.url ?? '',
      publishedAt: q.publishedAt ?? '',
      question: q.question!,
      choices: (q.choices ?? []) as string[],
      answerIndex: q.answerIndex ?? 0,
      rationale: q.rationale ?? '',
      difficulty: q.difficulty ?? '',
      content: q.content ?? '',
    }))
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))

  console.log('grouped quizzes count:', quizzes.length)

  // limit 分だけ返す（最新順）
  quizzes = quizzes.slice(0, limit)
  console.log('limited quizzes count:', quizzes.length)

  return quizzes
}
