import Fastify from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

import newsRoutes from './routes/newsRoutes'
import quizRoutes from './routes/quizRoutes'
// import memoRoutes from './routes/memoRoutes'

const app = Fastify()

// CORS
app.register(cors)

// Swagger
app.register(swagger, {
  swagger: {
    info: {
      title: 'Techscope API',
      description: '技術ニュース × AIクイズ API',
      version: '1.0.0',
    },
  },
})
app.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
  },
})

// Routes
app.register(newsRoutes, { prefix: '/news' })
app.register(quizRoutes, { prefix: '/news' }) // nested
// app.register(memoRoutes, { prefix: '/news' })

export default app
