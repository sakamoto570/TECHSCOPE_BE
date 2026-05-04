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

// 「上記」単体だと誤爆しやすいので少し絞る
const bannedChoicePattern =
  /(上記すべて|上記のすべて|上記全て|すべて正しい|全て正しい|全部正しい|すべて当てはまる|全て当てはまる|いずれも正しい|どれも正しい|all of the above|none of the above)/i

async function invokeWithRetry(command: InvokeModelCommand, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await bedrock.send(command)
    } catch (error: any) {
      const isThrottling = error.name === 'ThrottlingException'
      const isLastTry = i === maxRetries - 1

      if (!isThrottling || isLastTry) {
        console.error('❌ Bedrock invoke failed:', error)
        throw error
      }

      const delay = Math.pow(2, i) * 1000
      console.warn(`⚠️ Throttled. Retrying after ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw new Error('Bedrock invoke failed unexpectedly')
}

function extractJson(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model output')
  }

  return text.slice(start, end + 1)
}

function validateQuiz(quiz: any): Quiz {
  if (typeof quiz.question !== 'string' || quiz.question.trim().length === 0) {
    throw new Error('Invalid question')
  }

  if (!Array.isArray(quiz.choices) || quiz.choices.length !== 4) {
    throw new Error('Invalid choices length')
  }

  for (const choice of quiz.choices) {
    if (typeof choice !== 'string' || choice.trim().length === 0) {
      throw new Error('Invalid choice')
    }

    if (bannedChoicePattern.test(choice)) {
      throw new Error(`Banned choice detected: ${choice}`)
    }
  }

  const uniqueChoices = new Set(quiz.choices.map((c: string) => c.trim()))
  if (uniqueChoices.size !== 4) {
    throw new Error('Duplicate choices detected')
  }

  if (
    typeof quiz.answerIndex !== 'number' ||
    !Number.isInteger(quiz.answerIndex) ||
    quiz.answerIndex < 0 ||
    quiz.answerIndex > 3
  ) {
    throw new Error('Invalid answerIndex')
  }

  if (typeof quiz.rationale !== 'string' || quiz.rationale.trim().length === 0) {
    throw new Error('Invalid rationale')
  }

  if (!['easy', 'normal', 'hard'].includes(quiz.difficulty)) {
    throw new Error('Invalid difficulty')
  }

  return {
    question: quiz.question.trim(),
    choices: quiz.choices.map((c: string) => c.trim()),
    answerIndex: quiz.answerIndex,
    rationale: quiz.rationale.trim(),
    difficulty: quiz.difficulty,
  }
}

function buildPrompt(article: ArticleInput, retryInstruction = ''): string {
  const { title, url, articleText, mode } = article

  const baseInstruction = `
あなたは技術記事の内容に基づいて、日本語の4択クイズを作成するAIです。
記事が英語の場合でも、出題・選択肢・解説はすべて自然な日本語で作成してください。

以下に記事の本文があります。本文に書かれている内容のみを使って、4択クイズを1問だけ作成してください。

【厳守ルール】
- 出力は必ず日本語にしてください
- 正解は必ず1つだけにしてください
- 選択肢は必ず4つにしてください
- 「上記すべて」「すべて正しい」「すべて当てはまる」「AとBの両方」「該当なし」系の選択肢は禁止です
- choices の各要素は、単独で意味が通る具体的な選択肢にしてください
- 複数の理由・要因・目的が本文に並列で書かれている場合、「理由は何か？」のような設問は禁止します
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
- 複数の理由が列挙されている場合は、以下のような事実確認型の設問にしてください：
  ・特定の技術名
  ・ツール名
  ・アーキテクチャ
  ・数値
  ・時期
  ・手法
  ・用語の定義
  ・追加された機能
`
      : `
この記事の本文は一部のみであり、完全な全文ではない可能性があります。

【追加ルール】
- 本文に明確に書かれている事実だけを使用してください
- 背景・理由・意図を推測する設問は禁止します
- 技術用語・ツール名・機能・仕様など本文に明示されている情報を問う問題に限定してください
- 難易度は easy または normal にしてください
`

  return `
${baseInstruction}

${modeInstruction}

${retryInstruction}

記事タイトル: ${title}
記事URL: ${url}

<article>
${articleText}
</article>

出力は次のJSON形式のみとし、余計な文章は一切出力しないでください。

{
  "question": "...",
  "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
  "answerIndex": 0,
  "rationale": "なぜその回答が正しいのかを、本文の記述に基づいて説明してください",
  "difficulty": "easy"
}
`
}

function buildRetryInstruction(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('Banned choice detected')) {
    return `
【前回の失敗理由】
choices に禁止された選択肢が含まれていました。

【再生成ルール】
- 「上記すべて」「すべて正しい」「すべて当てはまる」「該当なし」に類する選択肢を絶対に使わないでください
- 4つの選択肢は、すべて具体的な技術名・機能名・仕様・数値・用語にしてください
- 正解以外の3つも、本文内容と混同しうる自然な誤答にしてください
`
  }

  if (message.includes('Duplicate choices')) {
    return `
【前回の失敗理由】
choices に重複した選択肢が含まれていました。

【再生成ルール】
- 4つの選択肢はすべて異なる内容にしてください
- 言い換えただけの実質同じ選択肢も禁止です
`
  }

  if (message.includes('Invalid choices length')) {
    return `
【前回の失敗理由】
choices の数が4つではありませんでした。

【再生成ルール】
- choices は必ず4要素の配列にしてください
`
  }

  return `
【前回の出力はバリデーションに失敗しました】
JSON形式、選択肢数、answerIndex、difficulty を厳密に守って再生成してください。
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

  const decoded = JSON.parse(new TextDecoder().decode(response.body))
  return decoded?.content?.[0]?.text ?? ''
}

export async function generateQuizFromArticle(
  article: ArticleInput,
  maxAttempts = 3
): Promise<Quiz> {
  let lastError: unknown = null
  let retryInstruction = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let rawText = ''

    try {
      const prompt = buildPrompt(article, retryInstruction)

      rawText = await callModel(prompt)

      const jsonText = extractJson(rawText)
      const parsed = JSON.parse(jsonText)
      const quiz = validateQuiz(parsed)

      return quiz
    } catch (err) {
      lastError = err

      console.warn(`⚠️ Quiz generation failed (attempt ${attempt}/${maxAttempts}):`, err)

      if (rawText) {
        console.warn('⚠️ LLM raw output on failure:', rawText.slice(0, 2000))
      }

      retryInstruction = buildRetryInstruction(err)
    }
  }

  console.error('❌ Quiz generation failed after max attempts')
  throw lastError
}
