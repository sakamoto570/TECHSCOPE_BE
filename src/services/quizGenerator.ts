// src/services/quizGenerator.ts
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

const bedrock = new BedrockRuntimeClient({
  region: 'ap-northeast-1',
})

// Retry with exponential backoff
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

      const delay = Math.pow(2, i) * 1000 // 1s, 2s, 4s
      console.warn(`⚠️ Throttled. Retrying after ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

export async function generateQuizFromArticle(article: { title: string; url: string }) {
  const prompt = `
あなたは技術記事の要点をもとに、クイズを作成するAIです。

以下のURLの記事を**自動で読み取り・要点を理解**し、**4択クイズを1問だけ**作成してください。

クイズには記事の内容を正しく理解していないと答えられないようにしてください

出力は **次のJSON形式のみ** とし、余計な文章は一切出力しないでください。

{
  "question": "...",
  "choices": ["選択肢1", "選択肢2", "選択肢3"],
  "answerIndex": 0,
  "rationale": "なぜその回答が正しいのか",
  "difficulty": "難易度",
  "content": "URLの記事本文"
}

記事タイトル: ${article.title}
記事URL: ${article.url}
`

  const command = new InvokeModelCommand({
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.4,
    }),
  })

  const response = await invokeWithRetry(command)

  if (!response) {
    console.error('❌ Bedrock response  is undefined')
    throw new Error('Bedrock response  is undefined')
  }

  const decoded = JSON.parse(new TextDecoder().decode(response.body))
  const text = decoded?.content?.[0]?.text ?? ''

  try {
    return JSON.parse(text)
  } catch (e) {
    console.error('❌ Quiz JSON parse error:', text)
    throw e
  }
}
