export const getNewsListSchema = {
  tags: ['News'],
  summary: '記事一覧を取得',
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          articleId: { type: 'string' },
          title: { type: 'string' },
          date: { type: 'string' },
          summary: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

export const getNewsDetailSchema = {
  tags: ['News'],
  summary: '記事詳細取得',
  params: {
    type: 'object',
    properties: {
      articleId: { type: 'string' },
    },
    required: ['articleId'],
  },
  response: {
    200: {
      type: 'object',
      properties: {
        article: { type: 'object' },
        quizzes: { type: 'array' },
        memos: { type: 'array' },
      },
    },
  },
}

export const createNewsSchema = {
  tags: ['News'],
  summary: '記事の新規登録',
  body: {
    type: 'object',
    required: ['title', 'url'],
    properties: {
      title: { type: 'string' },
      url: { type: 'string' },
      summary: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
  },
  response: { 200: { type: 'object' } },
}

export const deleteNewsSchema = {
  tags: ['News'],
  summary: '記事削除',
  params: {
    type: 'object',
    properties: {
      articleId: { type: 'string' },
    },
    required: ['articleId'],
  },
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string' },
      },
    },
  },
}
