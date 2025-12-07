import { FastifyInstance } from 'fastify'
import {
  getNewsListSchema,
  getNewsDetailSchema,
  createNewsSchema,
  deleteNewsSchema,
} from '../schemas/newsSchemas.js'
import * as newsService from '../services/newsService.js'

export default async function newsRoutes(app: FastifyInstance) {
  // 記事一覧
  app.get('/', { schema: getNewsListSchema }, async () => {
    return await newsService.getNewsList()
  })

  // 記事詳細（記事 + クイズ + メモ すべて）
  app.get('/:articleId', { schema: getNewsDetailSchema }, async (req) => {
    const { articleId } = req.params as any
    return await newsService.getNewsDetail(articleId)
  })

  // 新規記事作成
  app.post('/', { schema: createNewsSchema }, async (req) => {
    const body = req.body as any
    return await newsService.createNews(body)
  })

  // 記事削除
  app.delete('/:articleId', { schema: deleteNewsSchema }, async (req) => {
    const { articleId } = req.params as any
    return await newsService.deleteNews(articleId)
  })
}
