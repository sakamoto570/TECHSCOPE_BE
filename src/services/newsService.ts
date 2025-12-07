import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
  BatchWriteItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { randomUUID } from 'crypto'

const client = new DynamoDBClient({})
const TABLE_NAME = process.env.TABLE_NAME!

// ===========================================
// 記事一覧
// ===========================================
export async function getNewsList() {
  // PK が NEWS# で始まるものの METADATA のみ取得
  const cmd = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: undefined, // GSI不要
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :meta)',
    ExpressionAttributeValues: marshall({
      ':pk': 'NEWS#LIST', // 一覧用 "一覧キー"
      ':meta': 'ITEM#', // 実データの並び
    }),
  })

  const res = await client.send(cmd)
  return res.Items?.map((i) => unmarshall(i))
}

// ===========================================
// 記事詳細（記事 + クイズ + メモ 全部）
// ===========================================
export async function getNewsDetail(articleId: string) {
  const pk = `NEWS#${articleId}`

  const cmd = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: marshall({
      ':pk': pk,
    }),
  })

  const res = await client.send(cmd)
  const items = res.Items?.map((i) => unmarshall(i)) ?? []

  const article = items.find((x) => x.SK === 'METADATA')
  const quizzes = items.filter((x) => x.SK.startsWith('QUIZ#'))
  const memos = items.filter((x) => x.SK.startsWith('MEMO#'))

  return { article, quizzes, memos }
}

// ===========================================
// 記事作成
// ===========================================
export async function createNews(body: any) {
  const articleId = randomUUID()

  const item = {
    PK: `NEWS#${articleId}`,
    SK: 'METADATA',
    articleId,
    title: body.title,
    url: body.url,
    summary: body.summary ?? '',
    tags: body.tags ?? [],
    createdAt: new Date().toISOString(),
  }

  const cmd = new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item),
  })

  await client.send(cmd)
  return { articleId, status: 'OK' }
}

// ===========================================
// 記事削除（記事＋クイズ＋メモ 全削除）
// ===========================================
export async function deleteNews(articleId: string) {
  const pk = `NEWS#${articleId}`

  // まず全取得
  const query = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: marshall({ ':pk': pk }),
  })

  const res = await client.send(query)
  const items = res.Items ?? []

  if (items.length === 0) return { status: 'NOT_FOUND' }

  // BatchWrite 用に変形
  const deleteRequests = items.map((i) => {
    const u = unmarshall(i)
    return {
      DeleteRequest: {
        Key: marshall({
          PK: u.PK,
          SK: u.SK,
        }),
      },
    }
  })

  // 25件ごとに分割（Dynamoの制限）
  const chunks = []
  for (let i = 0; i < deleteRequests.length; i += 25) {
    chunks.push(deleteRequests.slice(i, i + 25))
  }

  for (const chunk of chunks) {
    const batch = new BatchWriteItemCommand({
      RequestItems: { [TABLE_NAME]: chunk },
    })
    await client.send(batch)
  }

  return { status: 'DELETED' }
}
