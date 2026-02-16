import commander from 'commander'
import path from 'path'
import fs from 'fs/promises'
import { templates } from '../../shared/templates'

export function registerInitCommand(program: commander.Command): void {
  program
    .command('init [template]')
    .description('Scaffold a new LaTeX project from a built-in template')
    .action(async (templateName?: string) => {
      if (!templateName) {
        console.log('Available templates:')
        for (const t of templates) {
          console.log(`  ${t.name.toLowerCase().replace(/[\s/]+/g, '-')} — ${t.description}`)
        }
        console.log('\nUsage: textex init <template-name>')
        return
      }

      const normalized = templateName.toLowerCase().replace(/[\s/]+/g, '-')
      const template = templates.find(
        (t) => t.name.toLowerCase().replace(/[\s/]+/g, '-') === normalized
      )

      if (!template) {
        console.error(`Unknown template: "${templateName}"`)
        console.log('Available templates:')
        for (const t of templates) {
          console.log(`  ${t.name.toLowerCase().replace(/[\s/]+/g, '-')}`)
        }
        process.exit(1)
      }

      const fileName = `${normalized}.tex`
      const outputPath = path.resolve(fileName)

      try {
        await fs.access(outputPath)
        console.error(`File already exists: ${outputPath}`)
        process.exit(1)
      } catch {
        // File doesn't exist, good
      }

      await fs.writeFile(outputPath, template.content, 'utf-8')
      console.log(`Created ${fileName} from "${template.name}" template.`)
    })
}
