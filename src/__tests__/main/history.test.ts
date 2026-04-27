import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { getHistoryList, loadSnapshot, saveSnapshot } from '../../main/history'

describe('main history snapshots', () => {
  it('loads snapshots only from the active file history directory', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-history-'))
    const texFile = path.join(projectDir, 'paper.tex')
    const otherFile = path.join(projectDir, 'other.tex')

    try {
      await saveSnapshot(texFile, 'first')
      const snapshots = await getHistoryList(texFile)
      expect(snapshots).toHaveLength(1)
      await expect(loadSnapshot(texFile, snapshots[0].path)).resolves.toBe('first')
      await expect(loadSnapshot(otherFile, snapshots[0].path)).rejects.toThrow(
        'Snapshot path must be inside the file history directory'
      )
      await expect(loadSnapshot(texFile, path.join(projectDir, 'paper.tex'))).rejects.toThrow(
        'Invalid snapshot path'
      )
    } finally {
      await fs.rm(projectDir, { recursive: true, force: true })
    }
  })
})
