#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const ARTIFACT_DIRECTORY_PATTERN = /(?:^|\/)TextEx-Tauri-(linux|mac-arm64|mac-x64|win)(?:\/|$)/

function generateReleaseFiles({
  artifactsDir,
  outputDir,
  version,
  tag,
  repository,
  publishedAt = new Date()
}) {
  if (tag !== `v${version}`) {
    throw new Error(`Tag ${tag} does not match package version ${version}`)
  }

  const files = listFiles(artifactsDir)
  const linuxAppImage = selectTarget(
    'linux-x86_64-appimage',
    files,
    (file) => file.endsWith('.AppImage') && artifactPlatform(file) === 'linux'
  )
  const updateTargets = [
    { ...linuxAppImage, platform: 'linux-x86_64' },
    linuxAppImage,
    selectTarget(
      'linux-x86_64-deb',
      files,
      (file) => file.endsWith('.deb') && artifactPlatform(file) === 'linux'
    ),
    selectTarget(
      'darwin-aarch64',
      files,
      (file) => file.endsWith('.app.tar.gz') && artifactPlatform(file) === 'mac-arm64'
    ),
    selectTarget(
      'darwin-x86_64',
      files,
      (file) => file.endsWith('.app.tar.gz') && artifactPlatform(file) === 'mac-x64'
    ),
    selectTarget('windows-x86_64', files, (file) => file.endsWith('.exe'))
  ]

  prepareOutputDirectory(outputDir)
  const releaseNames = new Map()
  for (const file of files) {
    if (!isReleaseArtifact(file)) continue
    const platform = artifactPlatform(file)
    if (!platform) {
      throw new Error(`Release artifact is missing its platform directory: ${file}`)
    }
    const releaseName = `${platform}-${path.basename(file)}`
    const destination = path.join(outputDir, releaseName)
    if (fs.existsSync(destination)) {
      throw new Error(`Duplicate release artifact name: ${releaseName}`)
    }
    fs.copyFileSync(file, destination)
    releaseNames.set(file, releaseName)
  }

  const platforms = Object.fromEntries(
    updateTargets.map(({ platform, artifact, signature }) => {
      const releaseName = releaseNames.get(artifact)
      if (!releaseName) throw new Error(`Updater artifact was not copied: ${artifact}`)
      return [
        platform,
        {
          signature: fs.readFileSync(signature, 'utf8').trim(),
          url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(releaseName)}`
        }
      ]
    })
  )

  const manifest = {
    version,
    notes: `TextEx ${version}`,
    pub_date: publishedAt.toISOString(),
    platforms
  }
  fs.writeFileSync(path.join(outputDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  const releaseFiles = listFiles(outputDir).sort()
  const checksums = releaseFiles
    .map((file) => `${sha256(file)}  ${path.basename(file)}`)
    .join('\n')
  fs.writeFileSync(path.join(outputDir, 'checksums.txt'), `${checksums}\n`)

  return manifest
}

function selectTarget(platform, candidates, predicate) {
  const matches = candidates.filter(
    (file) => predicate(normalized(file)) && !file.endsWith('.sig')
  )
  if (matches.length !== 1) {
    throw new Error(`Expected one ${platform} updater artifact, found ${matches.length}`)
  }
  const artifact = matches[0]
  const signature = candidates.find((file) => file === `${artifact}.sig`)
  if (!signature) throw new Error(`Missing updater signature for ${artifact}`)
  if (!fs.readFileSync(signature, 'utf8').trim()) {
    throw new Error(`Updater signature is empty for ${artifact}`)
  }
  return { platform, artifact, signature }
}

function artifactPlatform(file) {
  return normalized(file).match(ARTIFACT_DIRECTORY_PATTERN)?.[1] ?? null
}

function isReleaseArtifact(file) {
  return /\.(AppImage|deb|dmg|exe|sig|tar\.gz)$/.test(file)
}

function prepareOutputDirectory(directory) {
  if (fs.existsSync(directory) && fs.readdirSync(directory).length > 0) {
    throw new Error(`Output directory is not empty: ${directory}`)
  }
  fs.mkdirSync(directory, { recursive: true })
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) throw new Error(`Artifact directory does not exist: ${directory}`)
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(entryPath))
    else if (entry.isFile()) files.push(entryPath)
  }
  return files
}

function normalized(file) {
  return file.split(path.sep).join('/')
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

if (require.main === module) {
  const [artifactsArg = 'artifacts', outputArg = 'release-artifacts'] = process.argv.slice(2)
  const rootDir = path.resolve(__dirname, '..')
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
  generateReleaseFiles({
    artifactsDir: path.resolve(rootDir, artifactsArg),
    outputDir: path.resolve(rootDir, outputArg),
    version: packageJson.version,
    tag: process.env.GITHUB_REF_NAME || `v${packageJson.version}`,
    repository: process.env.GITHUB_REPOSITORY || 'Topasm/textex'
  })
}

module.exports = { generateReleaseFiles }
