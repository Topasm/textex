import { beforeEach, expect, it, vi } from 'vitest'
import type { Diagnostic } from '../../shared/types'
import { fixDiagnosticInline } from '../../renderer/services/inlineDiagnosticFix'
import { documentRegistry } from '../../renderer/models/documentRegistry'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

const path = '/project/main.tex'
const source = 'Heading\nBroken command\nLast line'
let diagnostic: Diagnostic
beforeEach(() => {
  useEditorStore.getState().resetEditor()
  useEditorStore.getState().openFileInTab(path, source)
  useProjectStore.setState({ projectRoot: '/project' })
  useSettingsStore.setState((state) => ({ settings: { ...state.settings, aiEnabled: true } }))
  diagnostic = {
    file: 'main.tex',
    line: 2,
    severity: 'error',
    message: 'Undefined control sequence'
  }
  useCompileStore.setState({ diagnostics: [diagnostic], compileStatus: 'error', pdfRevision: 0 })
  vi.mocked(window.api.readFile).mockReset().mockResolvedValue({ filePath: path, content: source })
  vi.mocked(window.api.aiProcessCustom)
    .mockReset()
    .mockResolvedValue('Heading\nFixed command\nLast line')
})

it('applies a direct AI correction as an unsaved editor edit', async () => {
  expect(await fixDiagnosticInline(diagnostic)).toMatchObject({ status: 'applied' })
  expect(documentRegistry.snapshot(path)?.text).toBe('Heading\nFixed command\nLast line')
  expect(documentRegistry.getModel(path)?.isDirty).toBe(true)
  expect(useEditorStore.getState().pendingJump).toMatchObject({
    line: 2,
    target: { documentId: path, revision: documentRegistry.getModel(path)?.revision }
  })
  expect(window.api.aiProcessCustom).toHaveBeenCalledWith(
    expect.objectContaining({
      filePath: path,
      selectedText: source,
      command: expect.stringContaining('Undefined control sequence')
    })
  )
})

it('limits the edit to the diagnostic neighborhood', async () => {
  const lines = Array.from({ length: 40 }, (_, i) => `Line ${i + 1}`)
  useEditorStore.getState().updateActiveDocument(lines.join('\n'))
  diagnostic.line = 20
  vi.mocked(window.api.aiProcessCustom).mockImplementation(async (request) =>
    request.selectedText.replace('Line 20', 'Fixed 20')
  )
  expect(await fixDiagnosticInline(diagnostic)).toMatchObject({ status: 'applied' })
  expect(vi.mocked(window.api.aiProcessCustom).mock.calls[0][0].selectedText).toBe(
    lines.slice(9, 30).join('\n')
  )
  expect(documentRegistry.snapshot(path)?.text).toBe(
    lines.join('\n').replace('Line 20', 'Fixed 20')
  )
})

it.each(['edit', 'project', 'compile', 'close'] as const)(
  'discards the result after %s changes',
  async (change) => {
    let resolve!: (value: string) => void
    vi.mocked(window.api.aiProcessCustom).mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    const pending = fixDiagnosticInline(diagnostic)
    await vi.waitFor(() => expect(window.api.aiProcessCustom).toHaveBeenCalled())
    if (change === 'edit') useEditorStore.getState().updateActiveDocument('newer text')
    if (change === 'project') useProjectStore.setState({ projectRoot: '/other' })
    if (change === 'compile') useCompileStore.setState({ diagnostics: [] })
    if (change === 'close') useEditorStore.getState().resetEditor()
    resolve('obsolete text')
    expect(await pending).toMatchObject({ status: 'stale' })
    expect(documentRegistry.snapshot(path)?.text).not.toBe('obsolete text')
  }
)

it.each(['', '```latex\nwrong wrapper\n```'])('rejects invalid AI output %j', async (output) => {
  vi.mocked(window.api.aiProcessCustom).mockResolvedValue(output)
  await expect(fixDiagnosticInline(diagnostic)).rejects.toThrow()
  expect(documentRegistry.snapshot(path)?.text).toBe(source)
})

it('rejects paths outside the project before reading or sending source', async () => {
  diagnostic.file = '../outside.tex'
  await expect(fixDiagnosticInline(diagnostic)).rejects.toThrow()
  expect(window.api.readFile).not.toHaveBeenCalled()
  expect(window.api.aiProcessCustom).not.toHaveBeenCalled()
})

it('does not submit a second repair while one is running', async () => {
  let resolve!: (value: string) => void
  vi.mocked(window.api.aiProcessCustom).mockReturnValue(
    new Promise((done) => {
      resolve = done
    })
  )
  const pending = fixDiagnosticInline(diagnostic)
  await vi.waitFor(() => expect(window.api.aiProcessCustom).toHaveBeenCalled())
  expect(await fixDiagnosticInline(diagnostic)).toMatchObject({ status: 'stale' })
  resolve(source)
  expect(await pending).toMatchObject({ status: 'unchanged' })
  expect(window.api.aiProcessCustom).toHaveBeenCalledTimes(1)
})

it('undoes an applied fix but never overwrites subsequent edits', async () => {
  const first = await fixDiagnosticInline(diagnostic)
  expect(first.undo?.()).toBe(true)
  expect(documentRegistry.snapshot(path)?.text).toBe(source)
  const second = await fixDiagnosticInline(diagnostic)
  useEditorStore.getState().updateActiveDocument('user edit')
  expect(second.undo?.()).toBe(false)
  expect(documentRegistry.snapshot(path)?.text).toBe('user edit')
})
