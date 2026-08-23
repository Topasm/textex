'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { generateSeed, verifySeed } = require('./prepare-tectonic-cache-seed.js')

async function withTemp(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-seed-test-'))
  try {
    await callback(root)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

test('generates a deterministic sorted manifest and verifies copied files', async () => {
  await withTemp(async (root) => {
    const source = path.join(root, 'source')
    const output = path.join(root, 'output')
    await fs.mkdir(path.join(source, 'bundle'), { recursive: true })
    await fs.writeFile(path.join(source, 'z-last'), 'z')
    await fs.writeFile(path.join(source, 'bundle', 'a-first'), 'alpha')

    const manifest = await generateSeed(source, output, 'fixture-v1')
    assert.deepEqual(
      manifest.files.map((file) => file.path),
      ['bundle/a-first', 'z-last']
    )
    assert.equal(manifest.totalBytes, 6)
    assert.deepEqual(await verifySeed(output), manifest)
  })
})

test('verification rejects a modified staged support file', async () => {
  await withTemp(async (root) => {
    const source = path.join(root, 'source')
    const output = path.join(root, 'output')
    await fs.mkdir(source)
    await fs.writeFile(path.join(source, 'bundle.bin'), 'expected')
    await generateSeed(source, output, 'fixture-v1')
    await fs.writeFile(path.join(output, 'files', 'bundle.bin'), 'tampered')
    await assert.rejects(verifySeed(output), /do not match/)
  })
})

test('generation rejects symlinks and overlapping output', async (context) => {
  await withTemp(async (root) => {
    const source = path.join(root, 'source')
    await fs.mkdir(source)
    await fs.writeFile(path.join(source, 'target'), 'data')
    try {
      await fs.symlink(path.join(source, 'target'), path.join(source, 'link'))
    } catch (error) {
      if (process.platform === 'win32' && error?.code === 'EPERM') {
        context.skip('symlink creation is unavailable')
        return
      }
      throw error
    }
    await assert.rejects(
      generateSeed(source, path.join(root, 'output'), 'fixture-v1'),
      /symlink/
    )
    await assert.rejects(
      generateSeed(source, path.join(source, 'nested-output'), 'fixture-v1'),
      /must not overlap/
    )
  })
})
