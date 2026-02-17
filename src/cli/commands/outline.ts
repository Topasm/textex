import commander from 'commander'
import path from 'path'
import fs from 'fs/promises'
import { parseDocumentStructure, listPapers } from '../../shared/structure'
import { SectionNode } from '../../shared/types'

function printOutline(nodes: SectionNode[], depth: number, maxDepth: number): void {
  for (const node of nodes) {
    const indent = '  '.repeat(node.level)
    const star = node.starred ? '*' : ''
    console.log(`${indent}${node.title}${star}`)
    if (node.children.length > 0 && node.level < maxDepth) {
      printOutline(node.children, depth + 1, maxDepth)
    }
  }
}

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

export function registerOutlineCommand(program: commander.Command): void {
  program
    .command('outline <file-or-dir>')
    .description('Print the section outline of a LaTeX document')
    .option('-d, --depth <n>', 'Maximum section depth to display', '3')
    .action(async (fileOrDir: string, opts: { depth: string }) => {
      try {
        const mainFile = await resolveMainFile(fileOrDir)
        const structure = await parseDocumentStructure(mainFile)
        const maxDepth = parseInt(opts.depth, 10)

        if (structure.outline.length === 0) {
          console.log('No sections found.')
        } else {
          printOutline(structure.outline, 0, maxDepth)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Error: ${msg}`)
        process.exit(1)
      }
    })
}
