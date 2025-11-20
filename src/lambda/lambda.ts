import app from '../app'
import awsLambdaFastify from '@fastify/aws-lambda'

export const handler = awsLambdaFastify(app)
