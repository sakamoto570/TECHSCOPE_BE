// src/utils/extractArticleText.ts
import * as cheerio from 'cheerio'

export const extractArticleText = async (url: string): Promise<string> => {
  if (!url) return ''

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TechQuizBot/1.0)',
    },
  })

  if (!res.ok) {
    console.warn(`Failed to fetch article: ${url} status=${res.status}`)
    return ''
  }

  const html = await res.text()
  const $ = cheerio.load(html)
  const hostname = new URL(url).hostname

  let text = ''

  // 媒体ごとのざっくりセレクタ
  if (hostname.endsWith('zenn.dev')) {
    // Zenn: 基本 <article> に本文入ってる
    text = $('article').text()
  } else if (hostname.endsWith('qiita.com')) {
    // Qiita: <article> or .it-MdContent
    text = $('article').text() || $('.it-MdContent').text()
  } else if (hostname.includes('codezine.jp')) {
    // CodeZine: 記事本文のコンテナクラスがだいたいこの辺
    text = $('div.article-body').text() || $('article').text()
  } else if (hostname.includes('publickey1.jp')) {
    // Publickey: エントリ本文の div
    text = $('div.entry-body').text() || $('article').text()
  }

  // 上のどれでも十分取れなかったときのフォールバック
  if (!text || text.trim().length < 100) {
    text = $('article').text() || $('main').text() || $('body').text()
  }

  return text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ') // nbsp をスペースに
    .replace(/[ \t]+\n/g, '\n') // 行末スペース削除
    .replace(/\n{3,}/g, '\n\n') // 改行詰める
    .trim()
}
