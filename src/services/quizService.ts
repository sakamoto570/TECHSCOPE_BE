import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { CreateQuizBody, UpdateQuizBody } from '../schemas/quizSchemas'

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)
const TABLE_NAME = process.env.TABLE_NAME!

export const quizService = {
  async create(newsId: string, body: CreateQuizBody) {
    const quizId = crypto.randomUUID()
    const now = new Date().toISOString()

    const item = {
      PK: `NEWS#${newsId}`,
      SK: `QUIZ#${quizId}`,
      newsId,
      quizId,
      createdAt: now,
      updatedAt: now,
      ...body,
    }

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    )

    return item
  },

  async list(newsId: string) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `NEWS#${newsId}`,
          ':sk': 'QUIZ#',
        },
      })
    )
    return res.Items || []
  },

  async get(newsId: string, quizId: string) {
    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `NEWS#${newsId}`,
          SK: `QUIZ#${quizId}`,
        },
      })
    )
    return res.Item
  },

  async update(newsId: string, quizId: string, body: UpdateQuizBody) {
    const now = new Date().toISOString()

    const UpdateExpr = []
    const AttrVals: Record<string, any> = {}

    for (const [k, v] of Object.entries(body)) {
      UpdateExpr.push(`${k} = :${k}`)
      AttrVals[`:${k}`] = v
    }

    UpdateExpr.push('updatedAt = :updatedAt')
    AttrVals[':updatedAt'] = now

    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `NEWS#${newsId}`,
          SK: `QUIZ#${quizId}`,
        },
        UpdateExpression: `SET ${UpdateExpr.join(', ')}`,
        ExpressionAttributeValues: AttrVals,
        ReturnValues: 'ALL_NEW',
      })
    )
    return res.Attributes
  },

  async remove(newsId: string, quizId: string) {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `NEWS#${newsId}`,
          SK: `QUIZ#${quizId}`,
        },
      })
    )
    return { deleted: true }
  },
}
