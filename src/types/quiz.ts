// types/quiz.ts
export interface Quiz {
  id: string
  title: string
  url: string
  publishedAt: string
  question: string
  choices: string[]
  answerIndex: number
  rationale: string
  difficulty: string
  content: string
}
