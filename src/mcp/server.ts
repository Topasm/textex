#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import path from 'path'
import { getTectonicPath, compileLatex } from '../shared/compiler.js'
import {
  listPapers,
  parseDocumentStructure,
  getSectionContent,
  updateSectionContent
} from '../shared/structure.js'

// Store last compilation log for get_compile_log tool
let lastCompileLog = ''
let lastCompileFile = ''

function resolveTectonicPath(): string {
  // __dirname is out/mcp/mcp/ at runtime, project root is 3 levels up
  const devBasePath = path.join(__dirname, '../../../resources/bin')
  return getTectonicPath({ isDev: true, devBasePath })
}

const server = new McpServer(
  {
    name: 'textex',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
)

// compile_latex tool
server.tool(
  'compile_latex',
  'Compile a LaTeX file using the Tectonic engine. Returns the path to the generated PDF on success.',
  {
    file_path: z.string().describe('Absolute path to the .tex file to compile')
  },
  async ({ file_path: filePath }) => {
    const resolvedPath = path.resolve(filePath)
    lastCompileLog = ''
    lastCompileFile = resolvedPath

    try {
      await compileLatex(resolvedPath, {
        tectonicPath: resolveTectonicPath(),
        onLog: (text: string) => {
          lastCompileLog += text
        },
        synctex: false
      })

      const pdfPath = resolvedPath.replace(/\.tex$/, '.pdf')
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, pdfPath })
          }
        ]
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: message })
          }
        ],
        isError: true
      }
    }
  }
)

// get_compile_log tool
server.tool(
  'get_compile_log',
  'Returns the stdout/stderr output from the last LaTeX compilation. Useful for diagnosing compilation errors.',
  async () => {
    if (!lastCompileLog) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'No compilation has been run yet.'
          }
        ]
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Last compile: ${lastCompileFile}\n\n${lastCompileLog}`
        }
      ]
    }
  }
)

// list_papers tool
server.tool(
  'list_papers',
  'List LaTeX documents (papers with \\documentclass) in a directory. Returns title, main file path, and document class for each.',
  {
    directory_path: z
      .string()
      .optional()
      .describe('Directory to scan for .tex files (defaults to current working directory)')
  },
  async ({ directory_path: dirPath }) => {
    try {
      const resolved = dirPath ? path.resolve(dirPath) : process.cwd()
      const papers = await listPapers(resolved)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(papers, null, 2)
          }
        ]
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
        isError: true
      }
    }
  }
)

// get_paper_info tool
server.tool(
  'get_paper_info',
  'Get full metadata and section outline of a LaTeX document. Returns document class, title, author, date, abstract, packages, and hierarchical section tree.',
  {
    file_path: z.string().describe('Absolute path to the main .tex file')
  },
  async ({ file_path: filePath }) => {
    try {
      const structure = await parseDocumentStructure(path.resolve(filePath))
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(structure, null, 2)
          }
        ]
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
        isError: true
      }
    }
  }
)

// get_outline tool
server.tool(
  'get_outline',
  'Get the section outline (tree of chapters/sections/subsections) of a LaTeX document.',
  {
    file_path: z.string().describe('Absolute path to the main .tex file')
  },
  async ({ file_path: filePath }) => {
    try {
      const structure = await parseDocumentStructure(path.resolve(filePath))
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(structure.outline, null, 2)
          }
        ]
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
        isError: true
      }
    }
  }
)

// get_section tool
server.tool(
  'get_section',
  'Read the LaTeX content of a specific section by its title path (e.g. "Related Work/Deep Learning").',
  {
    file_path: z.string().describe('Absolute path to the main .tex file'),
    section_path: z
      .string()
      .describe(
        'Slash-separated section title path (e.g. "Introduction" or "Methods/Data Collection")'
      )
  },
  async ({ file_path: filePath, section_path: sectionPath }) => {
    try {
      const result = await getSectionContent(path.resolve(filePath), sectionPath)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2)
          }
        ]
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
        isError: true
      }
    }
  }
)

// update_section tool
server.tool(
  'update_section',
  'Replace the body content of a specific section. The section heading is preserved; only the body between this heading and the next is replaced.',
  {
    file_path: z.string().describe('Absolute path to the main .tex file'),
    section_path: z
      .string()
      .describe(
        'Slash-separated section title path (e.g. "Introduction" or "Methods/Data Collection")'
      ),
    content: z.string().describe('New LaTeX content to replace the section body with')
  },
  async ({ file_path: filePath, section_path: sectionPath, content }) => {
    try {
      const result = await updateSectionContent(path.resolve(filePath), sectionPath, content)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, ...result }, null, 2)
          }
        ]
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ success: false, error: message }) }
        ],
        isError: true
      }
    }
  }
)

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Server is now running and listening on stdio
}

main().catch((err) => {
  console.error('MCP server error:', err)
  process.exit(1)
})
