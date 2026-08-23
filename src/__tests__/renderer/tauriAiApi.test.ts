import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTauriApi } from '../../renderer/platform/tauriApi'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class {
    onmessage: (message: unknown) => void = () => {}
  }
}))

describe('Tauri AI DesktopApi adapter', () => {
  beforeEach(() => invokeMock.mockReset())

  it('maps generation, editing, context, credentials, and CLI commands', async () => {
    invokeMock.mockResolvedValue(undefined)
    const api = createTauriApi()
    const context = {
      filePath: '/project/main.tex',
      sectionPath: ['Introduction'],
      outline: ['Introduction'],
      beforeSelection: 'before',
      afterSelection: 'after'
    }
    const processRequest = {
      action: 'fix' as const,
      selectedText: 'teh result',
      filePath: '/project/main.tex',
      lightContext: context,
      summaryContext: null
    }
    const customRequest = {
      command: 'Make this concise',
      selectedText: 'long result',
      filePath: '/project/main.tex',
      lightContext: context,
      summaryContext: null
    }

    await api.aiGenerate('outline', 'openai', 'gpt-5.4')
    await api.aiProcess(processRequest)
    await api.aiProcessCustom(customRequest)
    await api.aiUpdateContext('/project/main.tex', '\\section{Introduction}')
    await api.aiSaveApiKey('openai', 'secret')
    await api.aiHasApiKey('openai')
    await api.aiCheckCli()
    await api.aiCheckCodexCli()
    await api.aiOpenClaudeTerminal({ workDir: '/project', resume: true })
    await api.aiOpenCodexTerminal({ workDir: '/project' })

    expect(invokeMock.mock.calls).toEqual([
      ['ai_generate', { input: 'outline', provider: 'openai', model: 'gpt-5.4' }],
      ['ai_process', { request: processRequest }],
      ['ai_process_custom', { request: customRequest }],
      ['ai_update_context', { filePath: '/project/main.tex', content: '\\section{Introduction}' }],
      ['ai_save_api_key', { provider: 'openai', apiKey: 'secret' }],
      ['ai_has_api_key', { provider: 'openai' }],
      ['ai_check_cli'],
      ['ai_check_codex_cli'],
      ['ai_open_claude_terminal', { request: { workDir: '/project', resume: true } }],
      ['ai_open_codex_terminal', { request: { workDir: '/project' } }]
    ])
  })
})
