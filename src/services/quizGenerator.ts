// src/services/quizGenerator.ts
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

const bedrock = new BedrockRuntimeClient({
  region: 'ap-northeast-1',
})

type ArticleInput = {
  title: string
  url: string
  articleText: string
  mode: 'full' | 'snippet'
}

type Quiz = {
  question: string
  choices: string[]
  answerIndex: number
  rationale: string
  difficulty: 'easy' | 'normal' | 'hard'
}

const bannedChoicePattern = /(上記|すべて|全て|全部|いずれも|all of the above|none of the above)/i

// Retry with exponential backoff (Bedrock API用)
async function invokeWithRetry(command: InvokeModelCommand, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await bedrock.send(command)
    } catch (error: any) {
      const isThrottling = error.name === 'ThrottlingException'
      const isLastTry = i === maxRetries - 1

      if (!isThrottling || isLastTry) {
        console.error(`❌ Bedrock invoke failed:`, error)
        throw error
      }

      const delay = Math.pow(2, i) * 1000
      console.warn(`⚠️ Throttled. Retrying after ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

// 文字列からJSON部分だけ抜き出す
function extractJson(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model output')
  }
  return text.slice(start, end + 1)
}

// クイズのバリデーション
function validateQuiz(quiz: any): Quiz {
  if (typeof quiz.question !== 'string') throw new Error('Invalid question')
  if (!Array.isArray(quiz.choices) || quiz.choices.length !== 4) {
    throw new Error('Invalid choices length')
  }
  if (typeof quiz.answerIndex !== 'number' || quiz.answerIndex < 0 || quiz.answerIndex > 3) {
    throw new Error('Invalid answerIndex')
  }
  if (typeof quiz.rationale !== 'string') throw new Error('Invalid rationale')
  if (!['easy', 'normal', 'hard'].includes(quiz.difficulty)) {
    throw new Error('Invalid difficulty')
  }

  const hasBanned = quiz.choices.some((c: string) => bannedChoicePattern.test(c))
  if (hasBanned) {
    throw new Error('Banned choice detected')
  }

  return quiz as Quiz
}

function buildPrompt(article: ArticleInput): string {
  const { title, url, articleText, mode } = article

  const baseInstruction = `
あなたは技術記事の内容に基づいてクイズを作成するAIです。
以下に記事の本文があります。本文に書かれている内容のみを使って、4択クイズを1問だけ作成してください。

【厳守ルール】
- 正解は必ず1つだけにしてください（複数正解は禁止）
- 「上記すべて」「すべて当てはまる」「すべて正しい」「AとBの両方」などの選択肢は絶対に使用しないでください
- 複数の理由・要因・目的が本文に並列で書かれている場合、「理由は何か？」のような設問形式は禁止します
- 設問は、本文中の単一の記述から一意に正解が確定するものにしてください
- 記事に書かれていない内容、推測、一般論は禁止です
- 正解の根拠は本文の記述に基づいて説明してください
- クイズは技術に関する内容に限定してください
`

  const modeInstruction =
    mode === 'full'
      ? `
この記事は十分な長さの本文が含まれています。

【追加ルール】
- 「理由」「目的」「背景」を問う設問を作る場合は、本文中で単一の理由だけが明確に述べられている場合に限ります
- 複数の理由が列挙されている場合は、以下の形式を使ってください：
  ・特定の技術名
  ・ツール名
  ・アーキテクチャ
  ・数値
  ・時期
  ・手法
  ・用語の定義
`
      : `
この記事の本文は一部のみであり、完全な全文ではない可能性があります（mode=snippet）。

【追加ルール】
- 本文に明確に書かれている事実だけを使用してください
- 背景・理由・意図を推測する設問は禁止します
- 技術用語・ツール名・機能・仕様など本文に明示されている情報を問う問題に限定してください
- 難易度は easy または normal にしてください
`

  return `
${baseInstruction}
${modeInstruction}

記事タイトル: ${title}
記事URL: ${url}

<article>
${articleText}
</article>

出力は 次のJSON形式のみ とし、余計な文章は一切出力しないでください。

{
  "question": "...",
  "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
  "answerIndex": 0,
  "rationale": "なぜその回答が正しいのか（本文のどの記述が根拠かを説明）",
  "difficulty": "easy | normal | hard"
}
`
}

async function callModel(prompt: string): Promise<string> {
  const command = new InvokeModelCommand({
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }],
        },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    }),
  })

  const response = await invokeWithRetry(command)

  if (!response) {
    throw new Error('Bedrock response is undefined')
  }

  const decoded = JSON.parse(new TextDecoder().decode(response.body))
  return decoded?.content?.[0]?.text ?? ''
}

export async function generateQuizFromArticle(
  article: ArticleInput,
  maxAttempts = 3
): Promise<Quiz> {
  const prompt = buildPrompt(article)

  let lastError: any = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const rawText = await callModel(prompt)
      const jsonText = extractJson(rawText)
      const parsed = JSON.parse(jsonText)
      const quiz = validateQuiz(parsed)

      return quiz
    } catch (err) {
      lastError = err
      console.warn(`⚠️ Quiz generation failed (attempt ${attempt}/${maxAttempts}):`, err)
    }
  }

  console.error('❌ Quiz generation failed after max attempts')
  throw lastError
}
