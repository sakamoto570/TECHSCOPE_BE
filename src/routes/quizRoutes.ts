import { FastifyInstance } from 'fastify'
import { createQuizSchema, updateQuizSchema } from '../schemas/quizSchemas'
import { quizService } from '../services/quizService'
import { QuizBody } from '../schemas/quizSchemas'

export default async function quizRoutes(app: FastifyInstance) {
  // Create
  app.post('/news/:newsId/quiz', { schema: createQuizSchema }, async (req, reply) => {
    const { newsId } = req.params as { newsId: string }
    const body = req.body as QuizBody
    const item = await quizService.create(newsId, body)
    return reply.send(item)
  })

  // List
  app.get('/news/:newsId/quiz', async (req, reply) => {
    const { newsId } = req.params as { newsId: string }
    const items = await quizService.list(newsId)
    return reply.send(items)
  })

  // Detail
  app.get('/news/:newsId/quiz/:quizId', async (req, reply) => {
    const { newsId, quizId } = req.params as { newsId: string; quizId: string }
    const item = await quizService.get(newsId, quizId)
    return reply.send(item)
  })

  // Update
  app.put('/news/:newsId/quiz/:quizId', { schema: updateQuizSchema }, async (req, reply) => {
    const { newsId, quizId } = req.params as { newsId: string; quizId: string }
    const body = req.body as QuizBody
    const item = await quizService.update(newsId, quizId, body)
    return reply.send(item)
  })

  // Delete
  app.delete('/news/:newsId/quiz/:quizId', async (req, reply) => {
    const { newsId, quizId } = req.params as { newsId: string; quizId: string }
    const result = await quizService.remove(newsId, quizId)
    return reply.send(result)
  })
}
