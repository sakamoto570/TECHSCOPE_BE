import Parser from 'rss-parser'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'

const parser = new Parser()
const dynamo = new DynamoDBClient({})

export const handler = async () => {
  const RSS_URL = 'https://techcrunch.com/feed/' // 例：後で変更可

  const feed = await parser.parseURL(RSS_URL)

  for (const item of feed.items) {
    const id = `NEWS#${item.isoDate ?? item.pubDate}`
    const sk = 'META'

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

  return { status: 'ok', count: feed.items.length }
}
