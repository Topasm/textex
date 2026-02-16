#!/usr/bin/env node
import commander from 'commander'
import { registerCompileCommand } from './commands/compile'
import { registerInitCommand } from './commands/init'
import { registerExportCommand } from './commands/export'
import { registerTemplatesCommand } from './commands/templates'

const program = new commander.Command()

program.name('textex')
program.description('TextEx — LaTeX compilation and project management CLI')
program.version('1.0.0')

registerCompileCommand(program)
registerInitCommand(program)
registerExportCommand(program)
registerTemplatesCommand(program)

program.parse()
