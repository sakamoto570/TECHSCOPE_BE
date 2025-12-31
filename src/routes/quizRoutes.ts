// routes/quizRoutes.ts
import type { FastifyPluginAsync } from 'fastify'
import { getAllQuizzes } from '../services/quizService'
import { quizListSchema } from '../schemas/quizSchemas'

export const quizRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/quizzes',
    {
      schema: {
        response: {
          200: quizListSchema,
        },
      },
    },
    async (_request, _reply) => {
      const data = await getAllQuizzes()
      return data
    }
  )
}
