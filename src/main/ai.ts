import { loadSettings } from './settings'

interface GenerateLatexOptions {
  input: string
  provider: 'openai' | 'anthropic'
  model: string
}

const SYSTEM_PROMPT = `You are a LaTeX document generator. Given markdown, plain text notes, or an outline, produce a complete, compilable LaTeX document. Output ONLY the LaTeX source code — no explanations, no commentary. The document must include \\documentclass, \\begin{document}, and \\end{document}. Use appropriate packages for the content (e.g., amsmath for equations, graphicx for figures, hyperref for links). Structure the document with proper sections, subsections, and formatting.`

export function stripCodeFences(text: string): string {
  let result = text.trim()
  // Remove opening fence: ```latex or ```tex or ```
  result = result.replace(/^```(?:latex|tex)?\s*\n?/, '')
  // Remove closing fence
  result = result.replace(/\n?```\s*$/, '')
  return result.trim()
}

async function callOpenAI(input: string, model: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input }
      ],
      temperature: 0.3
    }),
    signal: AbortSignal.timeout(120_000)
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OpenAI API error ${response.status}: ${body}`)
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('No content in OpenAI response')
  return stripCodeFences(content)
}

async function callAnthropic(input: string, model: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: input }],
      temperature: 0.3
    }),
    signal: AbortSignal.timeout(120_000)
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Anthropic API error ${response.status}: ${body}`)
  }

  const data = (await response.json()) as {
    content: { type: string; text: string }[]
  }
  const text = data.content?.find((b) => b.type === 'text')?.text
  if (!text) throw new Error('No text in Anthropic response')
  return stripCodeFences(text)
}

export async function generateLatex(options: GenerateLatexOptions): Promise<string> {
  const settings = await loadSettings()
  const apiKey = settings.aiApiKey
  if (!apiKey) {
    throw new Error(`No API key configured for ${options.provider}`)
  }

  if (options.provider === 'openai') {
    return callOpenAI(options.input, options.model, apiKey)
  } else if (options.provider === 'anthropic') {
    return callAnthropic(options.input, options.model, apiKey)
  }
  throw new Error(`Unknown AI provider: ${options.provider}`)
}
