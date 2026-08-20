import { describe, expect, it } from 'vitest'
import {
  buildClaudeTerminalCommand,
  buildCodexExecArgs,
  buildCodexTerminalCommand,
  getClaudeTerminalLaunchSpecs,
  getCodexTerminalLaunchSpecs
} from '../../main/ai'

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

  it('builds Codex terminal commands', () => {
    expect(buildCodexTerminalCommand('/tmp/my paper', true, 'linux')).toBe(
      "cd '/tmp/my paper' && codex resume"
    )
    expect(buildCodexTerminalCommand('C:\\Users\\me\\paper', false, 'win32')).toBe(
      'cd /d "C:\\Users\\me\\paper" && codex'
    )
  })

  it('uses a Codex terminal title on Windows', () => {
    const specs = getCodexTerminalLaunchSpecs('win32', 'C:\\paper', true)

    expect(specs).toHaveLength(1)
    expect(specs[0]).toEqual({
      command: 'cmd.exe',
      args: ['/c', 'start', 'Textex Codex', 'cmd.exe', '/k', 'cd /d "C:\\paper" && codex resume']
    })
  })

  it('builds a supported, read-only Codex exec invocation', () => {
    expect(buildCodexExecArgs('gpt-5.6-terra', '/tmp/last-message.txt')).toEqual([
      'exec',
      '--model',
      'gpt-5.6-terra',
      '--skip-git-repo-check',
      '--ephemeral',
      '--sandbox',
      'read-only',
      '--color',
      'never',
      '--output-last-message',
      '/tmp/last-message.txt',
      '-'
    ])
  })

  it('uses the configured Codex default when no model is selected', () => {
    const args = buildCodexExecArgs('  ', '/tmp/last-message.txt')

    expect(args).not.toContain('--model')
    expect(args).not.toContain('--ask-for-approval')
  })
})
