import { Menu, type MenuItemConstructorOptions } from 'electron'
import type { AppCommandId } from '../shared/types'

const DOCS_URL = 'https://github.com/Topasm/textex#readme'
const ISSUE_URL = 'https://github.com/Topasm/textex/issues'

interface BuildAppMenuOptions {
  appName?: string
  platform?: NodeJS.Platform
  openExternal: (url: string) => void
  openOpenSourceLicenses: () => void
  sendCommand: (command: AppCommandId) => void
}

function commandItem(
  label: string,
  command: AppCommandId,
  sendCommand: (command: AppCommandId) => void,
  accelerator?: string
): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    click: () => sendCommand(command)
  }
}

export function createAppMenuTemplate({
  appName = 'TextEx',
  platform = process.platform,
  openExternal,
  openOpenSourceLicenses,
  sendCommand
}: BuildAppMenuOptions): MenuItemConstructorOptions[] {
  const fileSubmenu: MenuItemConstructorOptions[] = [
    commandItem('Open File', 'file.open', sendCommand, 'CmdOrCtrl+O'),
    commandItem('Open Folder', 'file.openFolder', sendCommand, 'CmdOrCtrl+Shift+O'),
    { type: 'separator' },
    commandItem('Save', 'file.save', sendCommand, 'CmdOrCtrl+S'),
    commandItem('Save As', 'file.saveAs', sendCommand, 'CmdOrCtrl+Shift+S'),
    { type: 'separator' },
    commandItem('New from Template', 'file.newTemplate', sendCommand, 'CmdOrCtrl+Shift+N'),
    {
      label: 'Export',
      submenu: [
        commandItem('HTML', 'file.export.html', sendCommand),
        commandItem('Word (DOCX)', 'file.export.docx', sendCommand),
        commandItem('OpenDocument (ODT)', 'file.export.odt', sendCommand),
        commandItem('EPUB', 'file.export.epub', sendCommand)
      ]
    },
    { type: 'separator' },
    commandItem('Settings', 'app.settings', sendCommand, 'CmdOrCtrl+,')
  ]

  const editSubmenu: MenuItemConstructorOptions[] = [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'selectAll' },
    { type: 'separator' },
    commandItem('Find', 'edit.find', sendCommand, 'CmdOrCtrl+F')
  ]

  const viewSubmenu: MenuItemConstructorOptions[] = [
    commandItem('Toggle Sidebar', 'view.toggleSidebar', sendCommand, 'CmdOrCtrl+B'),
    commandItem('Toggle Log', 'view.toggleLog', sendCommand, 'CmdOrCtrl+L'),
    { type: 'separator' },
    commandItem('Focus Citation Search', 'view.search.citations', sendCommand, 'CmdOrCtrl+Shift+C'),
    commandItem('Focus PDF Search', 'view.search.pdf', sendCommand, 'CmdOrCtrl+Shift+F'),
    { type: 'separator' },
    commandItem('PDF Zoom In', 'pdf.zoomIn', sendCommand, 'CmdOrCtrl+='),
    commandItem('PDF Zoom Out', 'pdf.zoomOut', sendCommand, 'CmdOrCtrl+-'),
    commandItem('PDF Actual Size', 'pdf.zoomReset', sendCommand),
    commandItem('Fit Width', 'pdf.fitWidth', sendCommand, 'CmdOrCtrl+0'),
    commandItem('Fit Height', 'pdf.fitHeight', sendCommand, 'CmdOrCtrl+9')
  ]

  const windowSubmenu: MenuItemConstructorOptions[] =
    platform === 'darwin'
      ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
      : [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }]

  const helpSubmenu: MenuItemConstructorOptions[] = [
    {
      label: 'Open Documentation',
      click: () => openExternal(DOCS_URL)
    },
    {
      label: 'Open Source Licenses',
      click: () => openOpenSourceLicenses()
    },
    {
      label: 'Report Issue',
      click: () => openExternal(ISSUE_URL)
    },
    { type: 'separator' },
    commandItem('Check for Updates', 'app.checkUpdates', sendCommand)
  ]

  const template: MenuItemConstructorOptions[] = [
    { label: 'File', submenu: fileSubmenu },
    { label: 'Edit', submenu: editSubmenu },
    { label: 'View', submenu: viewSubmenu },
    { label: 'Window', submenu: windowSubmenu },
    { label: 'Help', submenu: helpSubmenu }
  ]

  if (platform === 'darwin') {
    template.unshift({
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  return template
}

export function buildAppMenu(options: BuildAppMenuOptions): Menu {
  return Menu.buildFromTemplate(createAppMenuTemplate(options))
}
