// src/schemas/quizSchemas.ts
export const quizItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    url: { type: 'string' },
    publishedAt: { type: 'string' },
    question: { type: 'string' },
    choices: {
      type: 'array',
      items: { type: 'string' },
    },
    answerIndex: { type: 'number' },
    rationale: { type: 'string' },
    difficulty: { type: 'string' },
    content: { type: 'string' },
  },
  required: ['id', 'question', 'choices', 'answerIndex'],
} as const

export const quizListSchema = {
  type: 'array',
  items: quizItemSchema,
} as const
