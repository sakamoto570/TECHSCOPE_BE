// src/utils/articleMode.ts
export type ArticleMode = 'full' | 'snippet' | 'skip'

const MIN_SNIPPET_CHARS = 150
const MIN_FULL_ARTICLE_CHARS = 800

export const judgeArticleMode = (text: string): ArticleMode => {
  const len = text.length

  if (len < MIN_SNIPPET_CHARS) return 'skip'
  if (len < MIN_FULL_ARTICLE_CHARS) return 'snippet'
  return 'full'
}
