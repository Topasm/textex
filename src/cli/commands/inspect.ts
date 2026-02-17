import commander from 'commander'
import path from 'path'
import fs from 'fs/promises'
import { parseDocumentStructure, listPapers } from '../../shared/structure'
import { SectionNode } from '../../shared/types'

function printOutline(nodes: SectionNode[], depth: number): void {
  for (const node of nodes) {
    const indent = '  '.repeat(node.level)
    const star = node.starred ? '*' : ''
    console.log(`  ${indent}${node.title}${star}`)
    if (node.children.length > 0) {
      printOutline(node.children, depth + 1)
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

export function registerInspectCommand(program: commander.Command): void {
  program
    .command('inspect <file-or-dir>')
    .description('Display metadata and structure of a LaTeX document')
    .action(async (fileOrDir: string) => {
      try {
        const mainFile = await resolveMainFile(fileOrDir)
        const structure = await parseDocumentStructure(mainFile)
        const { metadata } = structure

        console.log(`Title:    ${metadata.title ?? '(none)'}`)
        console.log(`Author:   ${metadata.author ?? '(none)'}`)
        console.log(`Date:     ${metadata.date ?? '(none)'}`)
        console.log(`Class:    ${metadata.documentClass}`)
        if (metadata.documentClassOptions.length > 0) {
          console.log(`Options:  ${metadata.documentClassOptions.join(', ')}`)
        }
        if (metadata.abstract) {
          console.log(`Abstract: ${metadata.abstract}`)
        }
        if (metadata.packages.length > 0) {
          console.log(`Packages: ${metadata.packages.join(', ')}`)
        }
        console.log(`Files:    ${structure.files.length}`)

        if (structure.outline.length > 0) {
          console.log('\nOutline:')
          printOutline(structure.outline, 0)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Error: ${msg}`)
        process.exit(1)
      }
    })
}
