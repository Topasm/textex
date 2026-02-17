#!/usr/bin/env node
import commander from 'commander'
import { registerCompileCommand } from './commands/compile'
import { registerInitCommand } from './commands/init'
import { registerExportCommand } from './commands/export'
import { registerTemplatesCommand } from './commands/templates'
import { registerOutlineCommand } from './commands/outline'
import { registerInspectCommand } from './commands/inspect'
import { registerReadCommand } from './commands/read'
import { registerEditCommand } from './commands/edit'

const program = new commander.Command()

program.name('textex')
program.description('TextEx — LaTeX compilation and project management CLI')
program.version('1.0.0')

registerCompileCommand(program)
registerInitCommand(program)
registerExportCommand(program)
registerTemplatesCommand(program)
registerOutlineCommand(program)
registerInspectCommand(program)
registerReadCommand(program)
registerEditCommand(program)

program.parse()
