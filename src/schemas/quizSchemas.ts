import { FromSchema } from 'json-schema-to-ts'
import { z } from 'zod'

export const createQuizSchema = {
  body: {
    type: 'object',
    required: ['question', 'choices', 'answerIndex', 'rationale', 'difficulty'],
    properties: {
      question: { type: 'string' },
      choices: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 3,
      },
      answerIndex: {
        type: 'integer',
        minimum: 0,
        maximum: 2,
      },
      rationale: { type: 'string' },
      difficulty: {
        type: 'string',
        enum: ['easy', 'medium', 'hard'],
      },
    },
  },
} as const

export const updateQuizSchema = {
  body: {
    type: 'object',
    required: [],
    properties: {
      question: { type: 'string' },
      choices: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 3,
      },
      answerIndex: {
        type: 'integer',
        minimum: 0,
        maximum: 2,
      },
      rationale: { type: 'string' },
      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
    },
  },
} as const

export type CreateQuizBody = FromSchema<typeof createQuizSchema.body>
export type UpdateQuizBody = FromSchema<typeof updateQuizSchema.body>

export const quizBodySchema = z.object({
  question: z.string(),
  choices: z.array(z.string()).length(3),
  answerIndex: z.number().int().min(0).max(2),
  rationale: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
})

export type QuizBody = z.infer<typeof quizBodySchema>
