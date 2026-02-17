import commander from 'commander'
import path from 'path'
import fs from 'fs/promises'
import { updateSectionContent, listPapers } from '../../shared/structure'

async function resolveMainFile(fileOrDir: string): Promise<string> {
  const resolved = path.resolve(fileOrDir)
  const stat = await fs.stat(resolved)
  if (stat.isFile()) return resolved

  const papers = await listPapers(resolved)
  if (papers.length === 0) {
    throw new Error(`No LaTeX documents found in ${resolved}`)
  }
  return papers[0].mainFile
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (chunk) => {
      data += chunk
    })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

export function registerEditCommand(program: commander.Command): void {
  program
    .command('edit <file-or-dir> <section-path>')
    .description('Replace a section\'s content with stdin input')
    .action(async (fileOrDir: string, sectionPath: string) => {
      try {
        const mainFile = await resolveMainFile(fileOrDir)
        const newContent = await readStdin()
        const result = await updateSectionContent(mainFile, sectionPath, newContent.trimEnd())

        console.log(`Updated ${result.file} lines ${result.startLine}-${result.endLine}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Error: ${msg}`)
        process.exit(1)
      }
    })
}
