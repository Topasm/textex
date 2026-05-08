import os from 'os'
import path from 'path'

const EXTRA_PATHS = [
  path.join(os.homedir(), '.local', 'bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin'
]

export function getCliEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const currentPath = process.env.PATH || ''
  return {
    ...process.env,
    PATH: [...EXTRA_PATHS, currentPath].join(path.delimiter),
    ...(extra || {})
  }
}
