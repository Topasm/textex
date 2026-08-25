import { describe, expect, it } from 'vitest'
import {
  APP_COMMAND_MANIFEST,
  RENDERER_SHORTCUT_MANIFEST,
  type ShortcutBinding
} from '../../shared/appCommandManifest'

const EXPECTED_APP_COMMAND_IDS = [
  'file.open',
  'file.openFolder',
  'file.save',
  'file.saveAs',
  'file.newTemplate',
  'file.export.html',
  'file.export.docx',
  'file.export.odt',
  'file.export.epub',
  'compile.run',
  'compile.submissionCheck',
  'ai.draft',
  'edit.find',
  'view.toggleSidebar',
  'view.toggleResearchPanel',
  'view.toggleLog',
  'view.toggleTerminal',
  'view.search.citations',
  'view.search.pdf',
  'pdf.zoomIn',
  'pdf.zoomOut',
  'pdf.zoomReset',
  'pdf.fitWidth',
  'pdf.fitHeight',
  'app.settings',
  'app.checkUpdates',
  'app.quit',
  'window.close'
]

function bindingSignatures(binding: ShortcutBinding): string[] {
  const keys = Array.isArray(binding.key) ? binding.key : [binding.key]
  return keys.map((key) =>
    [binding.mod, binding.alt === true, binding.shift === true, key.toLowerCase()].join(':')
  )
}

describe('app command manifest', () => {
  it('preserves the complete public command ID contract', () => {
    const commandIds = APP_COMMAND_MANIFEST.map((command) => command.id)

    expect(commandIds).toEqual(EXPECTED_APP_COMMAND_IDS)
    expect(new Set(commandIds).size).toBe(commandIds.length)
  })

  it('provides pure display and search metadata for every palette command', () => {
    for (const command of APP_COMMAND_MANIFEST) {
      expect(command.label.trim(), command.id).not.toBe('')
      expect(command.group.trim(), command.id).not.toBe('')
      expect(command.keywords.length, command.id).toBeGreaterThan(0)
      expect(
        command.keywords.every((keyword) => keyword.trim().length > 0),
        command.id
      ).toBe(true)
    }
  })

  it('has no shortcut collisions across app and renderer-local commands', () => {
    const owners = new Map<string, string>()
    const collisions: string[] = []

    const registerBinding = (id: string, binding: ShortcutBinding): void => {
      for (const signature of bindingSignatures(binding)) {
        const previousOwner = owners.get(signature)
        if (previousOwner && previousOwner !== id) {
          collisions.push(`${signature}: ${previousOwner} / ${id}`)
        } else {
          owners.set(signature, id)
        }
      }
    }

    for (const command of APP_COMMAND_MANIFEST) {
      if ('shortcut' in command) registerBinding(command.id, command.shortcut)
    }
    for (const command of RENDERER_SHORTCUT_MANIFEST) {
      registerBinding(command.id, command.shortcut)
    }

    expect(collisions).toEqual([])
    expect(RENDERER_SHORTCUT_MANIFEST.map(({ id }) => id)).toContain('commandPalette.open')
  })
})
