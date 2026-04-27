import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import path from 'path'
import { loadSettings } from './settings'
import {
  AiContextEntry,
  AiCustomProcessRequest,
  AiLightContext,
  AiProcessRequest,
  UserSettings
} from '../shared/types'
import { hashTextContent } from '../shared/hash'

interface GenerateLatexOptions {
  input: string
  provider: 'openai' | 'anthropic' | 'gemini' | 'claude-cli'
  model: string
}

interface ThinkingConfig {
  enabled: boolean
  budget: number // 0 = provider default, >0 = token budget
}

// ---- Default models ----

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-5.4',
  anthropic: 'claude-sonnet-4-6',
  gemini: 'gemini-3.1-pro-preview',
  'claude-cli': 'sonnet'
}

// ---- Default prompts (used when user hasn't customized) ----

const DEFAULT_GENERATE_PROMPT = `You are a LaTeX document generator. Given markdown, plain text notes, or an outline, produce a complete, compilable LaTeX document. Output ONLY the LaTeX source code — no explanations, no commentary. The document must include \\documentclass, \\begin{document}, and \\end{document}. Use appropriate packages for the content (e.g., amsmath for equations, graphicx for figures, hyperref for links). Structure the document with proper sections, subsections, and formatting.`

const DEFAULT_ACTION_SYSTEM = 'You are a helpful academic assistant expert in LaTeX.'
const DEFAULT_CUSTOM_ACTION_PROMPT =
  'Apply the user instruction to the provided LaTeX text. Preserve LaTeX commands and structure unless the instruction explicitly asks to change them. Return ONLY the transformed text with no explanation.'
const DEFAULT_CONTEXT_SYSTEM =
  'You create concise working summaries for LaTeX documents. Focus on purpose, structure, terminology, and writing style. Return ONLY the summary text.'

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

function formatLightContext(lightContext: AiLightContext): string {
  const outline =
    lightContext.outline.length > 0
      ? lightContext.outline.map((item) => `- ${item}`).join('\n')
      : '- (none)'
  const sectionPath =
    lightContext.sectionPath.length > 0 ? lightContext.sectionPath.join(' > ') : '(unknown)'
  const beforeSelection = lightContext.beforeSelection.trim() || '(none)'
  const afterSelection = lightContext.afterSelection.trim() || '(none)'

  return [
    `File: ${lightContext.filePath}`,
    `Current section path: ${sectionPath}`,
    'Outline summary:',
    outline,
    'Context before selection:',
    beforeSelection,
    'Context after selection:',
    afterSelection
  ].join('\n')
}

function buildSelectionPrompt(
  instruction: string,
  selectedText: string,
  lightContext: AiLightContext,
  summaryContext: AiContextEntry | null
): string {
  const parts = [
    instruction,
    'Return ONLY the output for the selected text. Use document context only as supporting information.',
    'Selected text:',
    selectedText,
    'Document context:',
    formatLightContext(lightContext)
  ]

  if (summaryContext?.summary.trim()) {
    parts.push('Document summary cache:', summaryContext.summary.trim())
  }

  return parts.join('\n\n')
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

// ---- Claude CLI ----

const execFileAsync = promisify(execFile)

function getCliEnv(): NodeJS.ProcessEnv {
  const extraPaths = [
    path.join(os.homedir(), '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ]
  const currentPath = process.env.PATH || ''
  return {
    ...process.env,
    PATH: [...extraPaths, currentPath].join(path.delimiter)
  }
}

function callClaudeCli(input: string, model: string, systemPrompt: string): Promise<string> {
  const modelArg = model || DEFAULT_MODELS['claude-cli']
  const combinedPrompt = `${systemPrompt}\n\n${input}`

  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', combinedPrompt, '--model', modelArg], {
      env: getCliEnv(),
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Claude CLI timed out after 120s'))
    }, 120_000)

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve(stripCodeFences(stdout))
      } else {
        reject(new Error(stderr.trim() || `Claude CLI exited with code ${code}`))
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    // Close stdin so the CLI doesn't wait for input
    child.stdin.end()
  })
}

export async function checkClaudeCliAvailable(): Promise<boolean> {
  try {
    await execFileAsync('claude', ['--version'], {
      env: getCliEnv(),
      timeout: 5_000
    })
    return true
  } catch {
    return false
  }
}

// ---- Provider calls ----

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

function callOpenAI(
  input: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  thinking: ThinkingConfig
): Promise<string> {
  const modelId = model || DEFAULT_MODELS.openai
  const isReasoning = /^(o1|o3|o4|gpt-5)/.test(modelId)

  const body: Record<string, unknown> = {
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
    (data) => (data as OpenAIResponse)?.choices?.[0]?.message?.content
  )
}

function callAnthropic(
  input: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  thinking: ThinkingConfig
): Promise<string> {
  const body: Record<string, unknown> = {
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
    (data) => (data as AnthropicResponse)?.content?.find((b) => b.type === 'text')?.text
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

  const generationConfig: Record<string, unknown> = {
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
    (data) => (data as GeminiResponse)?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text
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
    case 'claude-cli':
      return callClaudeCli(input, model, systemPrompt)
    default:
      throw new Error(`Unknown AI provider: ${provider}`)
  }
}

// ---- Public API ----

export async function generateLatex(options: GenerateLatexOptions): Promise<string> {
  const settings = await loadSettings()
  const apiKey = settings.aiApiKey ?? ''
  if (options.provider !== 'claude-cli' && !apiKey) {
    throw new Error(`No API key configured for ${options.provider}`)
  }

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
  request: AiProcessRequest,
  provider?: string,
  model?: string
): Promise<string> {
  const settings = await loadSettings()
  const activeProvider = provider || settings.aiProvider
  const activeModel = model || settings.aiModel

  if (!activeProvider) throw new Error('No AI provider configured')

  const apiKey = settings.aiApiKey ?? ''
  if (activeProvider !== 'claude-cli' && !apiKey) {
    throw new Error(`No API key configured for ${activeProvider}`)
  }

  const actionPrompt = getActionPrompt(request.action, settings)
  const userPrompt = buildSelectionPrompt(
    actionPrompt,
    request.selectedText,
    request.lightContext,
    request.summaryContext
  )
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

export async function processTextWithCommand(
  request: AiCustomProcessRequest,
  provider?: string,
  model?: string
): Promise<string> {
  const settings = await loadSettings()
  const activeProvider = provider || settings.aiProvider
  const activeModel = model || settings.aiModel

  if (!activeProvider) throw new Error('No AI provider configured')

  const apiKey = settings.aiApiKey ?? ''
  if (activeProvider !== 'claude-cli' && !apiKey) {
    throw new Error(`No API key configured for ${activeProvider}`)
  }

  const trimmedCommand = request.command.trim()
  if (!trimmedCommand) throw new Error('AI command is required')

  const userPrompt = buildSelectionPrompt(
    `Instruction: ${trimmedCommand}`,
    request.selectedText,
    request.lightContext,
    request.summaryContext
  )
  const thinking = getThinkingConfig(settings)

  return callProvider(
    activeProvider,
    userPrompt,
    activeModel,
    apiKey,
    DEFAULT_CUSTOM_ACTION_PROMPT,
    thinking
  )
}

export async function updateDocumentContext(
  filePath: string,
  content: string,
  provider?: string,
  model?: string
): Promise<AiContextEntry> {
  const settings = await loadSettings()
  const activeProvider = provider || settings.aiProvider
  const activeModel = model || settings.aiModel

  if (!activeProvider) throw new Error('No AI provider configured')

  const apiKey = settings.aiApiKey ?? ''
  if (activeProvider !== 'claude-cli' && !apiKey) {
    throw new Error(`No API key configured for ${activeProvider}`)
  }

  const thinking = getThinkingConfig(settings)
  const summary = await callProvider(
    activeProvider,
    [
      'Create a compact working summary for future selection-level editing.',
      'Capture the document purpose, major sections, terminology, notation, tone, and any important local conventions.',
      'Do not quote long passages. Keep it concise and practical.',
      `File: ${filePath}`,
      'Document content:',
      content
    ].join('\n\n'),
    activeModel,
    apiKey,
    DEFAULT_CONTEXT_SYSTEM,
    thinking
  )

  return {
    filePath,
    contentHash: hashTextContent(content),
    generatedAt: new Date().toISOString(),
    summary
  }
}
