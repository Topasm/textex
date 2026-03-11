import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: vi.fn((template) => ({ items: template }))
  }
}))

import { createAppMenuTemplate } from '../../main/menu'

describe('createAppMenuTemplate', () => {
  it('includes the macOS app menu and standard sections on darwin', () => {
    const template = createAppMenuTemplate({
      appName: 'TextEx',
      platform: 'darwin',
      openExternal: vi.fn(),
      sendCommand: vi.fn()
    })

    expect(template.map((item) => item.label)).toEqual([
      'TextEx',
      'File',
      'Edit',
      'View',
      'Window',
      'Help'
    ])
    expect(template[0].submenu).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'about' })])
    )
  })

  it('builds the shared File/View menus on non-mac platforms', () => {
    const template = createAppMenuTemplate({
      platform: 'linux',
      openExternal: vi.fn(),
      sendCommand: vi.fn()
    })

    expect(template.map((item) => item.label)).toEqual(['File', 'Edit', 'View', 'Window', 'Help'])

    const fileMenu = template.find((item) => item.label === 'File')
    const viewMenu = template.find((item) => item.label === 'View')
    const helpMenu = template.find((item) => item.label === 'Help')

    expect(fileMenu?.submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Open File', accelerator: 'CmdOrCtrl+O' }),
        expect.objectContaining({ label: 'Open Folder', accelerator: 'CmdOrCtrl+Shift+O' }),
        expect.objectContaining({ label: 'Save', accelerator: 'CmdOrCtrl+S' }),
        expect.objectContaining({ label: 'Settings', accelerator: 'CmdOrCtrl+,' })
      ])
    )

    expect(viewMenu?.submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B' }),
        expect.objectContaining({
          label: 'Focus Citation Search',
          accelerator: 'CmdOrCtrl+Shift+C'
        }),
        expect.objectContaining({ label: 'PDF Zoom In', accelerator: 'CmdOrCtrl+=' }),
        expect.objectContaining({ label: 'Fit Width', accelerator: 'CmdOrCtrl+0' }),
        expect.objectContaining({ label: 'Fit Height', accelerator: 'CmdOrCtrl+9' })
      ])
    )

    expect(helpMenu?.submenu).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Check for Updates' })])
    )
  })
})
