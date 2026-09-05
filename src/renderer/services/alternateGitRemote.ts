export function alternateGitRemote(url: string): string | undefined {
  const trimmed = url.trim().replace(/\/$/u, '')
  const https = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/iu)
  if (https) return `git@github.com:${https[1]}/${https[2]}.git`
  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/iu)
  if (ssh) return `https://github.com/${ssh[1]}/${ssh[2]}`
  return undefined
}
