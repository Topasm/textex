#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import path from 'path'
import { getTectonicPath, compileLatex } from '../shared/compiler.js'

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

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Server is now running and listening on stdio
}

main().catch((err) => {
  console.error('MCP server error:', err)
  process.exit(1)
})
