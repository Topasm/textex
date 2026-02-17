import { execFile } from 'child_process'
import path from 'path'
import { promisify } from 'util'

const exec = promisify(execFile)

interface GitStatusResult {
  branch: string
  files: { path: string; index: string; working_dir: string }[]
  staged: string[]
  modified: string[]
  not_added: string[]
}

interface GitLogEntry {
  hash: string
  date: string
  message: string
  author: string
}

async function git(workDir: string, args: string[]): Promise<string> {
  if (!path.isAbsolute(workDir)) {
    throw new Error('workDir must be an absolute path')
  }
  const { stdout } = await exec('git', args, { cwd: workDir, maxBuffer: 10 * 1024 * 1024 })
  return stdout
}

export async function isGitRepo(workDir: string): Promise<boolean> {
  try {
    await git(workDir, ['rev-parse', '--is-inside-work-tree'])
    return true
  } catch {
    return false
  }
}

export async function initGit(workDir: string): Promise<{ success: boolean }> {
  await git(workDir, ['init'])
  return { success: true }
}

export async function getGitStatus(workDir: string): Promise<GitStatusResult> {
  let branch = ''
  try {
    branch = (await git(workDir, ['branch', '--show-current'])).trim()
    if (!branch) {
      // Empty string means detached HEAD state
      branch = 'detached'
    }
  } catch {
    branch = 'detached'
  }

  const porcelain = await git(workDir, ['status', '--porcelain=v1'])
  const files: GitStatusResult['files'] = []
  const staged: string[] = []
  const modified: string[] = []
  const not_added: string[] = []

  for (const line of porcelain.split('\n')) {
    if (!line) continue
    const index = line[0]
    const working_dir = line[1]
    const filePath = line.substring(3).trim()

    files.push({ path: filePath, index, working_dir })

    if (index !== ' ' && index !== '?') {
      staged.push(filePath)
    }
    if (working_dir === 'M' || working_dir === 'D') {
      modified.push(filePath)
    }
    if (index === '?' && working_dir === '?') {
      not_added.push(filePath)
    }
  }

  return { branch, files, staged, modified, not_added }
}

export async function stageFile(
  workDir: string,
  filePath: string
): Promise<{ success: boolean }> {
  await git(workDir, ['add', filePath])
  return { success: true }
}

export async function unstageFile(
  workDir: string,
  filePath: string
): Promise<{ success: boolean }> {
  try {
    await git(workDir, ['reset', 'HEAD', filePath])
  } catch {
    // might fail if no commits yet
    await git(workDir, ['rm', '--cached', filePath])
  }
  return { success: true }
}

export async function gitCommit(
  workDir: string,
  message: string
): Promise<{ success: boolean }> {
  await git(workDir, ['commit', '-m', message])
  return { success: true }
}

export async function getDiff(workDir: string): Promise<string> {
  return git(workDir, ['diff'])
}

export async function getLog(workDir: string): Promise<GitLogEntry[]> {
  try {
    const output = await git(workDir, [
      'log',
      '--pretty=format:%H|%aI|%an|%s',
      '-20'
    ])
    return output
      .trim()
      .split('\n')
      .filter((l) => l)
      .map((line) => {
        const [hash, date, author, ...messageParts] = line.split('|')
        return { hash, date, author, message: messageParts.join('|') }
      })
  } catch {
    return []
  }
}

export async function getFileLog(workDir: string, filePath: string): Promise<GitLogEntry[]> {
  try {
    const relative = path.relative(workDir, filePath)
    const output = await git(workDir, [
      'log',
      '--follow',
      '--pretty=format:%H|%aI|%an|%s',
      '-50',
      '--',
      relative
    ])
    return output
      .trim()
      .split('\n')
      .filter((l) => l)
      .map((line) => {
        const [hash, date, author, ...messageParts] = line.split('|')
        return { hash, date, author, message: messageParts.join('|') }
      })
  } catch {
    return []
  }
}
