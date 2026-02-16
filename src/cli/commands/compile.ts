import commander from 'commander'
import path from 'path'
import { getTectonicPath, compileLatex } from '../../shared/compiler'

function resolveTectonicPath(): string {
  // __dirname is out/cli/cli/commands/ at runtime, project root is 4 levels up
  const devBasePath = path.join(__dirname, '../../../../resources/bin')
  return getTectonicPath({ isDev: true, devBasePath })
}

export function registerCompileCommand(program: commander.Command): void {
  program
    .command('compile <file>')
    .description('Compile a LaTeX file with Tectonic')
    .option('-o, --output <dir>', 'Output directory')
    .option('-w, --watch', 'Watch for file changes and recompile')
    .option('-q, --quiet', 'Suppress compilation output')
    .action(async (file: string, opts: { output?: string; watch?: boolean; quiet?: boolean }) => {
      const filePath = path.resolve(file)

      const doCompile = async (): Promise<boolean> => {
        if (!opts.quiet) {
          console.log(`Compiling ${filePath}...`)
        }

        try {
          await compileLatex(filePath, {
            tectonicPath: resolveTectonicPath(),
            onLog: opts.quiet ? undefined : (text: string) => process.stdout.write(text),
            synctex: false,
            reruns: 2
          })

          if (!opts.quiet) {
            console.log('Compilation successful.')
          }

          // Move PDF to output directory if specified
          if (opts.output) {
            const fs = await import('fs/promises')
            const pdfName = path.basename(filePath).replace(/\.tex$/, '.pdf')
            const srcPdf = filePath.replace(/\.tex$/, '.pdf')
            const destPdf = path.join(path.resolve(opts.output), pdfName)
            await fs.mkdir(path.resolve(opts.output), { recursive: true })
            await fs.copyFile(srcPdf, destPdf)
            if (!opts.quiet) {
              console.log(`PDF copied to ${destPdf}`)
            }
          }

          return true
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (!opts.quiet) {
            console.error(`Compilation failed: ${msg}`)
          }
          return false
        }
      }

      if (opts.watch) {
        const { watch } = await import('chokidar')
        // Initial compile
        await doCompile()

        const dir = path.dirname(filePath)
        if (!opts.quiet) {
          console.log(`\nWatching ${dir} for changes...`)
        }

        const watcher = watch(dir, {
          ignoreInitial: true,
          ignored: [/\.pdf$/, /\.synctex/, /\.aux$/, /\.log$/]
        })

        let debounceTimer: ReturnType<typeof setTimeout> | null = null

        watcher.on('change', (changedPath: string) => {
          if (!changedPath.endsWith('.tex') && !changedPath.endsWith('.bib')) {
            return
          }
          if (debounceTimer) {
            clearTimeout(debounceTimer)
          }
          debounceTimer = setTimeout(async () => {
            if (!opts.quiet) {
              console.log(`\nFile changed: ${changedPath}`)
            }
            await doCompile()
          }, 500)
        })

        // Keep the process alive
        process.on('SIGINT', () => {
          watcher.close()
          process.exit(0)
        })
      } else {
        const success = await doCompile()
        if (!success) {
          process.exit(1)
        }
      }
    })
}
