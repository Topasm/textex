import { loadSettings } from './settings'
import { UserSettings } from '../shared/types'

interface GenerateLatexOptions {
  input: string
  provider: 'openai' | 'anthropic' | 'gemini'
  model: string
}

interface ThinkingConfig {
  enabled: boolean
  budget: number // 0 = provider default, >0 = token budget
}

// ---- Default models ----

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5-20250929',
  gemini: 'gemini-2.5-flash'
}

// ---- Default prompts (used when user hasn't customized) ----

const DEFAULT_GENERATE_PROMPT = `You are a LaTeX document generator. Given markdown, plain text notes, or an outline, produce a complete, compilable LaTeX document. Output ONLY the LaTeX source code — no explanations, no commentary. The document must include \\documentclass, \\begin{document}, and \\end{document}. Use appropriate packages for the content (e.g., amsmath for equations, graphicx for figures, hyperref for links). Structure the document with proper sections, subsections, and formatting.`

const DEFAULT_ACTION_SYSTEM = 'You are a helpful academic assistant expert in LaTeX.'

const DEFAULT_PROMPTS: Record<string, string> = {
  fix: 'Fix grammar and spelling in the following LaTeX text. Do not remove LaTeX commands. Return ONLY the fixed text.',
  academic:
    'Rewrite the following text to be more formal and academic suitable for a research paper. Preserve LaTeX commands. Return ONLY the rewritten text.',
  summarize: 'Summarize the following text briefly. Return ONLY the summary.',
  longer:
    'Paraphrase the following text to be longer and more detailed, expanding on the key points. Preserve all LaTeX commands. Return ONLY the paraphrased text.',
  shorter:
    'Paraphrase the following text to be shorter and more concise, keeping only the essential points. Preserve all LaTeX commands. Return ONLY the paraphrased text.'
}

// ---- Helpers ----

export function stripCodeFences(text: string): string {
  let result = text.trim()
  result = result.replace(/^```(?:latex|tex)?\s*\n?/, '')
  result = result.replace(/\n?```\s*$/, '')
  return result.trim()
}

function getThinkingConfig(settings: UserSettings): ThinkingConfig {
  return {
    enabled: !!settings.aiThinkingEnabled,
    budget: settings.aiThinkingBudget ?? 0
  }
}

function getActionPrompt(action: string, settings: UserSettings): string {
  const customMap: Record<string, string | undefined> = {
    fix: settings.aiPromptFix,
    academic: settings.aiPromptAcademic,
    summarize: settings.aiPromptSummarize,
    longer: settings.aiPromptLonger,
    shorter: settings.aiPromptShorter
  }
  return customMap[action]?.trim() || DEFAULT_PROMPTS[action] || ''
}

// ---- Common API call ----

async function callAIAPI(
  url: string,
  body: object,
  headers: Record<string, string>,
  providerName: string,
  responseExtractor: (data: unknown) => string | undefined
): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000)
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${providerName} API error ${response.status}: ${text}`)
  }

  const data = await response.json()
  const text = responseExtractor(data)
  if (!text) throw new Error(`No text in ${providerName} response`)
  return stripCodeFences(text)
}

// ---- Provider calls ----

function callOpenAI(
  input: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  thinking: ThinkingConfig
): Promise<string> {
  const modelId = model || DEFAULT_MODELS.openai
  const isReasoning = /^(o1|o3|o4)/.test(modelId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input }
    ]
  }

  if (isReasoning && thinking.enabled) {
    body.reasoning_effort = 'high'
  } else {
    body.temperature = 0.3
  }

  return callAIAPI(
    'https://api.openai.com/v1/chat/completions',
    body,
    { Authorization: `Bearer ${apiKey}` },
    'OpenAI',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any) => data?.choices?.[0]?.message?.content
  )
}

function callAnthropic(
  input: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  thinking: ThinkingConfig
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model: model || DEFAULT_MODELS.anthropic,
    system: systemPrompt,
    messages: [{ role: 'user', content: input }]
  }

  if (thinking.enabled) {
    const budgetTokens = thinking.budget > 0 ? thinking.budget : 10240
    body.thinking = {
      type: 'enabled',
      budget_tokens: budgetTokens
    }
    body.max_tokens = budgetTokens + 8192
    // Anthropic requires temperature=1 when thinking is enabled (omit temperature)
  } else {
    body.max_tokens = 4096
    body.temperature = 0.3
  }

  return callAIAPI(
    'https://api.anthropic.com/v1/messages',
    body,
    { 'x-api-key': apiKey, 'anthropic-version': '2025-04-15' },
    'Anthropic',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any) => data?.content?.find((b: any) => b.type === 'text')?.text
  )
}

function callGemini(
  input: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  thinking: ThinkingConfig
): Promise<string> {
  const modelId = model || DEFAULT_MODELS.gemini

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generationConfig: Record<string, any> = {
    temperature: 0.3
  }

  if (thinking.enabled) {
    generationConfig.thinkingConfig = {
      thinkingBudget: thinking.budget > 0 ? thinking.budget : 8192
    }
  }

  return callAIAPI(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: input }] }],
      generationConfig
    },
    {},
    'Gemini',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any) => data?.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text
  )
}

// ---- Dispatch helpers ----

function callProvider(
  provider: string,
  input: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  thinking: ThinkingConfig
): Promise<string> {
  switch (provider) {
    case 'openai':
      return callOpenAI(input, model, apiKey, systemPrompt, thinking)
    case 'anthropic':
      return callAnthropic(input, model, apiKey, systemPrompt, thinking)
    case 'gemini':
      return callGemini(input, model, apiKey, systemPrompt, thinking)
    default:
      throw new Error(`Unknown AI provider: ${provider}`)
  }
}

// ---- Public API ----

export async function generateLatex(options: GenerateLatexOptions): Promise<string> {
  const settings = await loadSettings()
  const apiKey = settings.aiApiKey
  if (!apiKey) throw new Error(`No API key configured for ${options.provider}`)

  const systemPrompt = settings.aiPromptGenerate?.trim() || DEFAULT_GENERATE_PROMPT
  const thinking = getThinkingConfig(settings)

  return callProvider(
    options.provider,
    options.input,
    options.model,
    apiKey,
    systemPrompt,
    thinking
  )
}

export async function processText(
  action: 'fix' | 'academic' | 'summarize' | 'longer' | 'shorter',
  text: string,
  provider?: string,
  model?: string
): Promise<string> {
  const settings = await loadSettings()
  const activeProvider = provider || settings.aiProvider
  const activeModel = model || settings.aiModel

  if (!activeProvider) throw new Error('No AI provider configured')

  const apiKey = settings.aiApiKey
  if (!apiKey) throw new Error(`No API key configured for ${activeProvider}`)

  const actionPrompt = getActionPrompt(action, settings)
  const userPrompt = `${actionPrompt}:\n\n${text}`
  const thinking = getThinkingConfig(settings)

  return callProvider(
    activeProvider,
    userPrompt,
    activeModel,
    apiKey,
    DEFAULT_ACTION_SYSTEM,
    thinking
  )
}
