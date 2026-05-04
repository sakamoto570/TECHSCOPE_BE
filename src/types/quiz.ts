export type Quiz = {
  id: string
  question: string
  choices: string[]
  answerIndex: number
  rationale: string
  difficulty: string
  content: string
  title: string
  url: string
  publishedAt: string
  source?: string
  newsId?: string
}
