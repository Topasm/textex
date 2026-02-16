import commander from 'commander'
import path from 'path'
import { exportDocument, getPandocPath, getPandocFormats } from '../../shared/pandoc'

function resolvePandocPath(): string {
  // __dirname is out/cli/cli/commands/ at runtime, project root is 4 levels up
  const devBasePath = path.join(__dirname, '../../../../resources/bin')
  return getPandocPath({ isDev: true, devBasePath })
}

export function registerExportCommand(program: commander.Command): void {
  const validFormats = getPandocFormats().map((f) => f.ext)

  program
    .command('export <file>')
    .description('Export a LaTeX file to another format via Pandoc')
    .requiredOption('-f, --format <format>', `Output format (${validFormats.join(', ')})`)
    .option('-o, --output <path>', 'Output file path')
    .action(async (file: string, opts: { format: string; output?: string }) => {
      if (!validFormats.includes(opts.format)) {
        console.error(`Invalid format: "${opts.format}". Valid formats: ${validFormats.join(', ')}`)
        process.exit(1)
      }

      const inputPath = path.resolve(file)
      const outputPath = opts.output
        ? path.resolve(opts.output)
        : inputPath.replace(/\.tex$/, `.${opts.format}`)

      try {
        const result = await exportDocument(inputPath, outputPath, opts.format, resolvePandocPath())
        console.log(`Exported to ${result.outputPath}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Export failed: ${msg}`)
        process.exit(1)
      }
    })
}
