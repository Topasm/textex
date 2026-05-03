import { describe, expect, it } from 'vitest'
import { buildClaudeTerminalCommand, getClaudeTerminalLaunchSpecs } from '../../main/ai'

describe('Claude terminal launcher', () => {
  it('builds a bash command for macOS and Linux', () => {
    expect(buildClaudeTerminalCommand('/tmp/my paper', true, 'darwin')).toBe(
      "cd '/tmp/my paper' && claude --resume"
    )
  })

  it('builds a cmd command for Windows', () => {
    expect(buildClaudeTerminalCommand('C:\\Users\\me\\paper', false, 'win32')).toBe(
      'cd /d "C:\\Users\\me\\paper" && claude'
    )
  })

  it('uses Terminal via osascript on macOS', () => {
    const specs = getClaudeTerminalLaunchSpecs('darwin', '/tmp/paper', true)

    expect(specs).toHaveLength(1)
    expect(specs[0].command).toBe('osascript')
    expect(specs[0].args.join(' ')).toContain('claude --resume')
  })

  it('uses cmd start on Windows', () => {
    const specs = getClaudeTerminalLaunchSpecs('win32', 'C:\\paper', true)

    expect(specs).toHaveLength(1)
    expect(specs[0]).toEqual({
      command: 'cmd.exe',
      args: [
        '/c',
        'start',
        'Textex Claude Code',
        'cmd.exe',
        '/k',
        'cd /d "C:\\paper" && claude --resume'
      ]
    })
  })

  it('tries common Linux terminal emulators', () => {
    const specs = getClaudeTerminalLaunchSpecs('linux', '/tmp/paper', false)

    expect(specs.map((spec) => spec.command)).toEqual([
      'x-terminal-emulator',
      'gnome-terminal',
      'konsole',
      'xfce4-terminal'
    ])
  })
})
