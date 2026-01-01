// src/routes/quizRoutes.ts
import type { FastifyPluginAsync } from 'fastify'
import { getAllQuizzes } from '../services/quizService'
import { quizListSchema } from '../schemas/quizSchemas'

type QuizListQuerystring = {
  limit?: number
}

export const quizRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuizListQuerystring
  }>(
    '/quizzes',
    {
      schema: {
        summary: 'クイズ一覧取得',
        tags: ['quiz'],
        querystring: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              description: '取得件数（デフォルト 50, 最大 100）',
            },
          },
        },
        response: {
          200: quizListSchema,
        },
      },
    },
    async (request, reply) => {
      const { limit } = request.query

      // 変な値が来たらデフォルト側に寄せる
      const safeLimit = typeof limit === 'number' ? Math.max(1, Math.min(limit, 100)) : undefined

      try {
        const data = await getAllQuizzes(safeLimit)
        return data
      } catch (err) {
        fastify.log.error({ err }, 'getAllQuizzes failed')
        // 本番運用なら詳細はログだけにして、メッセージはざっくりでOK
        return reply.status(500).send({ message: 'Internal Server Error' })
      }
    }
  )
}
