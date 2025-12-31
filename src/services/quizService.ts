// services/quizzes.ts
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb'

const dynamo = new DynamoDBClient({})

export const getAllQuizzes = async () => {
  const response = await dynamo.send(
    new ScanCommand({
      TableName: process.env.TABLE_NAME!,
      FilterExpression: 'begins_with(PK, :quiz)',
      ExpressionAttributeValues: {
        ':quiz': { S: 'QUIZ#' },
      },
    })
  )

  const items = response.Items ?? []
  const grouped: Record<string, any> = {}

  for (const item of items) {
    const pk = item.PK.S!
    const sk = item.SK.S!

    if (!grouped[pk]) grouped[pk] = {}

    if (sk === 'META') {
      grouped[pk].title = item.title.S
      grouped[pk].url = item.link.S
      grouped[pk].publishedAt = item.publishedAt.S
    } else if (sk === 'Q#1') {
      grouped[pk].question = item.question.S
      grouped[pk].choices = JSON.parse(item.choices.S!)
      grouped[pk].answerIndex = Number(item.answerIndex.N)
      grouped[pk].rationale = item.rationale.S
      grouped[pk].difficulty = item.difficulty.S
      grouped[pk].content = item.content.S
    }
  }

  const quizzes = Object.entries(grouped)
    .filter(([_, q]) => q.title && q.question)
    .map(([id, q]) => ({
      id,
      ...q,
    }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

  return quizzes
}
