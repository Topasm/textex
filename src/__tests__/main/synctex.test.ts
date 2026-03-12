import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildLineMap, clearSyncTexCache, forwardSync, inverseSync } from '../../main/synctex'

const createdDirs: string[] = []

async function createProject(): Promise<{ rootFile: string; chapterFile: string }> {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-synctex-'))
  createdDirs.push(projectDir)

  const rootFile = path.join(projectDir, 'main.tex')
  const chapterDir = path.join(projectDir, 'chapters')
  const chapterFile = path.join(chapterDir, 'chapter1.tex')

  await fs.mkdir(chapterDir, { recursive: true })
  await fs.writeFile(rootFile, '\\input{chapters/chapter1}\n', 'utf-8')
  await fs.writeFile(
    chapterFile,
    '%! TeX root = ../main.tex\n\\section{Intro}\nBody\n',
    'utf-8'
  )
  await fs.writeFile(
    path.join(projectDir, 'main.synctex'),
    [
      'SyncTeX Version:1',
      'Input:1:chapters/chapter1.tex',
      'X Offset:0',
      'Y Offset:0',
      '{1',
      '[1,2:0,100000:100000,50000,0',
      'x1,2:0,100000:100000',
      ']',
      '}1'
    ].join('\n'),
    'utf-8'
  )

  return { rootFile, chapterFile }
}

afterEach(async () => {
  clearSyncTexCache()
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('main synctex root resolution', () => {
  it('uses the compiled root synctex for forward sync from a subfile', async () => {
    const { chapterFile } = await createProject()

    await expect(forwardSync(chapterFile, 2)).resolves.toEqual(
      expect.objectContaining({ page: 1, x: 0, y: expect.any(Number) })
    )
  })

  it('builds a line map for a subfile using root-relative SyncTeX paths', async () => {
    const { chapterFile } = await createProject()

    await expect(buildLineMap(chapterFile)).resolves.toEqual([
      expect.objectContaining({ line: 2, page: 1, y: expect.any(Number) })
    ])
  })

  it('resolves inverse sync paths relative to the compiled root file', async () => {
    const { chapterFile } = await createProject()

    await expect(inverseSync(chapterFile, 1, 0.5, 1.2)).resolves.toEqual({
      file: chapterFile,
      line: 2,
      column: 0
    })
  })
})
