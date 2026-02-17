import { ipcMain } from 'electron'
import { generateLatex, processText } from '../ai'
import { loadSettings, saveSettings } from '../settings'

export function registerAiHandlers(): void {
  ipcMain.handle('ai:generate', async (_event, input: string, provider: string, model: string) => {
    if (!input || typeof input !== 'string') throw new Error('Input text is required')
    if (provider !== 'openai' && provider !== 'anthropic' && provider !== 'gemini') {
      throw new Error('Provider must be "openai", "anthropic", or "gemini"')
    }
    const latex = await generateLatex({ input, provider, model: model || '' })
    return { latex }
  })

  ipcMain.handle(
    'ai:process',
    async (
      _event,
      action: 'fix' | 'academic' | 'summarize' | 'longer' | 'shorter',
      text: string
    ) => {
      // Use configured settings for provider/model
      return processText(action, text)
    }
  )

  ipcMain.handle('ai:save-api-key', async (_event, provider: string, apiKey: string) => {
    await saveSettings({
      aiApiKey: apiKey,
      aiProvider: provider as 'openai' | 'anthropic' | 'gemini' | ''
    })
    return { success: true }
  })

  ipcMain.handle('ai:has-api-key', async (_event, provider: string) => {
    const settings = await loadSettings()
    return !!settings.aiApiKey && settings.aiProvider === provider
  })
}
