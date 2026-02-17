import commander from 'commander'
import path from 'path'
import fs from 'fs/promises'
import { getSectionContent, listPapers } from '../../shared/structure'

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

export function registerReadCommand(program: commander.Command): void {
  program
    .command('read <file-or-dir> <section-path>')
    .description('Output the LaTeX content of a section')
    .option('-m, --metadata', 'Prepend file and line info as comments')
    .action(
      async (fileOrDir: string, sectionPath: string, opts: { metadata?: boolean }) => {
        try {
          const mainFile = await resolveMainFile(fileOrDir)
          const result = await getSectionContent(mainFile, sectionPath)

          if (opts.metadata) {
            console.log(`% file: ${result.file}`)
            console.log(`% lines: ${result.startLine}-${result.endLine}`)
          }
          console.log(result.content)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`Error: ${msg}`)
          process.exit(1)
        }
      }
    )
}
