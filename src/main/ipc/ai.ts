import { ipcMain } from 'electron'
import {
  generateLatex,
  processText,
  processTextWithCommand,
  updateDocumentContext,
  checkClaudeCliAvailable
} from '../ai'
import { loadSettings, saveSettings } from '../settings'
import type { AiCustomProcessRequest, AiProcessRequest } from '../../shared/types'

export function registerAiHandlers(): void {
  ipcMain.handle('ai:generate', async (_event, input: string, provider: string, model: string) => {
    if (!input || typeof input !== 'string') throw new Error('Input text is required')
    if (
      provider !== 'openai' &&
      provider !== 'anthropic' &&
      provider !== 'gemini' &&
      provider !== 'claude-cli'
    ) {
      throw new Error('Provider must be "openai", "anthropic", "gemini", or "claude-cli"')
    }
    const latex = await generateLatex({ input, provider, model: model || '' })
    return { latex }
  })

  ipcMain.handle('ai:process', async (_event, request: AiProcessRequest) => {
    if (!request || typeof request !== 'object') throw new Error('AI request is required')
    return processText(request)
  })

  ipcMain.handle('ai:process-custom', async (_event, request: AiCustomProcessRequest) => {
    if (!request || typeof request !== 'object') throw new Error('AI request is required')
    if (!request.command || typeof request.command !== 'string') {
      throw new Error('AI command is required')
    }
    if (!request.selectedText || typeof request.selectedText !== 'string') {
      throw new Error('Input text is required')
    }
    return processTextWithCommand(request)
  })

  ipcMain.handle('ai:update-context', async (_event, filePath: string, content: string) => {
    if (!filePath || typeof filePath !== 'string') throw new Error('File path is required')
    if (!content || typeof content !== 'string') throw new Error('Document content is required')
    return updateDocumentContext(filePath, content)
  })

  ipcMain.handle('ai:save-api-key', async (_event, provider: string, apiKey: string) => {
    await saveSettings({
      aiApiKey: apiKey,
      aiProvider: provider as 'openai' | 'anthropic' | 'gemini' | 'claude-cli' | ''
    })
    return { success: true }
  })

  ipcMain.handle('ai:has-api-key', async (_event, provider: string) => {
    const settings = await loadSettings()
    return !!settings.aiApiKey && settings.aiProvider === provider
  })

  ipcMain.handle('ai:check-cli', async () => {
    return checkClaudeCliAvailable()
  })
}
