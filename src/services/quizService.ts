// services/quizService.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)

type QuizMetaItem = {
  PK: string
  SK: 'META'
  title: string
  link: string
  publishedAt: string
}

type QuizQuestionItem = {
  PK: string
  SK: string // 'Q#1' とか
  question: string
  choices: string // JSON文字列前提（["A","B",...]）
  answerIndex: number
  rationale: string
  difficulty: string
  content: string
}

type Quiz = {
  id: string
  title: string
  url: string
  publishedAt: string
  question: string
  choices: string[]
  answerIndex: number
  rationale: string
  difficulty: string
  content: string
}

export const getAllQuizzes = async (): Promise<Quiz[]> => {
  const response = await dynamo.send(
    new ScanCommand({
      TableName: process.env.TABLE_NAME!,
      // PK が "QUIZ#" で始まるレコードだけ拾う
      FilterExpression: 'begins_with(#pk, :quiz)',
      ExpressionAttributeNames: {
        '#pk': 'PK',
      },
      ExpressionAttributeValues: {
        ':quiz': 'QUIZ#',
      },
    })
  )

  const items = response.Items ?? []
  const grouped: Record<string, Partial<Quiz>> = {}

  for (const raw of items) {
    const item = raw as any
    const pk = item.PK as string
    const sk = item.SK as string

    if (!grouped[pk]) grouped[pk] = {}

    if (sk === 'META') {
      const meta = item as QuizMetaItem
      grouped[pk].title = meta.title
      grouped[pk].url = meta.link
      grouped[pk].publishedAt = meta.publishedAt
    } else if (sk === 'Q#1') {
      const q = item as QuizQuestionItem
      grouped[pk].question = q.question
      grouped[pk].choices = JSON.parse(q.choices) // ← JSON文字列前提
      grouped[pk].answerIndex = Number(q.answerIndex)
      grouped[pk].rationale = q.rationale
      grouped[pk].difficulty = q.difficulty
      grouped[pk].content = q.content
    }
  }

  const quizzes: Quiz[] = Object.entries(grouped)
    // META + Q#1 両方そろってるやつだけ残す
    .filter(([_, q]) => q.title && q.question)
    .map(([id, q]) => ({
      id,
      title: q.title!,
      url: q.url!,
      publishedAt: q.publishedAt!,
      question: q.question!,
      choices: q.choices as string[],
      answerIndex: q.answerIndex!,
      rationale: q.rationale!,
      difficulty: q.difficulty!,
      content: q.content!,
    }))
    // 新しい順にソート
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

  return quizzes
}
