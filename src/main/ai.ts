import { loadSettings } from './settings'

interface GenerateLatexOptions {
  input: string
  provider: 'openai' | 'anthropic'
  model: string
}

const GENERATE_SYSTEM_PROMPT = `You are a LaTeX document generator. Given markdown, plain text notes, or an outline, produce a complete, compilable LaTeX document. Output ONLY the LaTeX source code — no explanations, no commentary. The document must include \\documentclass, \\begin{document}, and \\end{document}. Use appropriate packages for the content (e.g., amsmath for equations, graphicx for figures, hyperref for links). Structure the document with proper sections, subsections, and formatting.`

export function stripCodeFences(text: string): string {
  let result = text.trim()
  // Remove opening fence: ```latex or ```tex or ```
  result = result.replace(/^```(?:latex|tex)?\s*\n?/, '')
  // Remove closing fence
  result = result.replace(/\n?```\s*$/, '')
  return result.trim()
}

async function callOpenAI(input: string, model: string, apiKey: string, systemPrompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
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

async function callAnthropic(input: string, model: string, apiKey: string, systemPrompt: string): Promise<string> {
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
      system: systemPrompt,
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
    return callOpenAI(options.input, options.model, apiKey, GENERATE_SYSTEM_PROMPT)
  } else if (options.provider === 'anthropic') {
    return callAnthropic(options.input, options.model, apiKey, GENERATE_SYSTEM_PROMPT)
  }
  throw new Error(`Unknown AI provider: ${options.provider}`)
}

export async function processText(action: 'fix' | 'academic' | 'summarize', text: string, provider?: string, model?: string): Promise<string> {
  const settings = await loadSettings()
  // Use passed provider/model or fallback to settings
  const activeProvider = provider || settings.aiProvider
  const activeModel = model || settings.aiModel

  if (!activeProvider) throw new Error('No AI provider configured')

  const apiKey = settings.aiApiKey
  if (!apiKey) throw new Error(`No API key configured for ${activeProvider}`)

  const prompts = {
    fix: "Fix grammar and spelling in the following LaTeX text. Do not remove LaTeX commands. Return ONLY the fixed text.",
    academic: "Rewrite the following text to be more formal and academic suitable for a research paper. Preserve LaTeX commands. Return ONLY the rewritten text.",
    summarize: "Summarize the following text briefly. Return ONLY the summary."
  };

  const systemPrompt = "You are a helpful academic assistant expert in LaTeX."
  const userPrompt = `${prompts[action]}:\n\n${text}`

  if (activeProvider === 'openai') {
    return callOpenAI(userPrompt, activeModel, apiKey, systemPrompt)
  } else if (activeProvider === 'anthropic') {
    return callAnthropic(userPrompt, activeModel, apiKey, systemPrompt)
  }
  throw new Error(`Unknown AI provider: ${activeProvider}`)
}
