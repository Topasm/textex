import commander from 'commander'
import { templates } from '../../shared/templates'

export function registerTemplatesCommand(program: commander.Command): void {
  program
    .command('templates')
    .description('List available LaTeX templates')
    .action(() => {
      console.log('Available templates:\n')
      for (const t of templates) {
        const id = t.name.toLowerCase().replace(/[\s/]+/g, '-')
        console.log(`  ${id}`)
        console.log(`    ${t.description}\n`)
      }
      console.log('Use "textex init <template-name>" to create a new file from a template.')
    })
}
