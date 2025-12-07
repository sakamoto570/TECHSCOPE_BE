import { FastifyInstance } from 'fastify'
import {
  getMemoListSchema,
  createMemoSchema,
  updateMemoSchema,
  deleteMemoSchema,
} from '../schemas/memoSchemas.js'
import * as memoService from '../services/memoService'

export default async function memoRoutes(app: FastifyInstance) {
  app.get('/:articleId/memos', { schema: getMemoListSchema }, async (req) => {
    const { articleId } = req.params as any
    return await memoService.getMemos(articleId)
  })

  app.post('/:articleId/memos', { schema: createMemoSchema }, async (req) => {
    const { articleId } = req.params as any
    return await memoService.createMemo(articleId, req.body as any)
  })

  app.put('/:articleId/memos/:memoId', { schema: updateMemoSchema }, async (req) => {
    const { articleId, memoId } = req.params as any
    return await memoService.updateMemo(articleId, memoId, req.body as any)
  })

  app.delete('/:articleId/memos/:memoId', { schema: deleteMemoSchema }, async (req) => {
    const { articleId, memoId } = req.params as any
    return await memoService.deleteMemo(articleId, memoId)
  })
}
