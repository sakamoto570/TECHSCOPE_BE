import Fastify from 'fastify'
import cors from '@fastify/cors'
import healthRoute from './routes/health'

const app = Fastify()

app.register(cors)
app.register(healthRoute)

export default app
