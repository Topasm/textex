import { describe, expect, it } from 'vitest'
import { alternateGitRemote } from '../../renderer/services/alternateGitRemote'

describe('alternate Git remote', () => {
  it('converts GitHub HTTPS and SSH remotes without credentials', () => {
    expect(alternateGitRemote('https://github.com/openai/codex')).toBe(
      'git@github.com:openai/codex.git'
    )
    expect(alternateGitRemote('git@github.com:openai/codex.git')).toBe(
      'https://github.com/openai/codex'
    )
    expect(alternateGitRemote('ssh://private.example/repo')).toBeUndefined()
  })
})
