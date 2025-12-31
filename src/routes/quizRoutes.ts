// routes/quizzes.ts
import { FastifyInstance } from 'fastify'
import { getAllQuizzes } from '../services/quizService'
import { quizListSchema } from '../schemas/quizSchemas'

export async function quizRoutes(fastify: FastifyInstance) {
  fastify.get('/quizzes', {
    schema: {
      response: {
        200: quizListSchema,
      },
    },
    handler: async (_request, reply) => {
      const data = await getAllQuizzes()
      reply.send(data)
    },
  })
}
