import type { Plugin } from 'prettier'
import type { FormatOptions } from './formatterWorkerProtocol'

interface FormatterModules {
  prettier: typeof import('prettier/standalone')
  latexPlugin: Plugin
}

let formatterModulesPromise: Promise<FormatterModules> | null = null

function loadFormatterModules(): Promise<FormatterModules> {
  if (!formatterModulesPromise) {
    formatterModulesPromise = Promise.all([
      import('prettier/standalone'),
      // @ts-expect-error: the package publishes declarations outside its exports map
      import('prettier-plugin-latex')
    ])
      .then(([prettier, latexPlugin]) => ({
        prettier,
        latexPlugin: latexPlugin as unknown as Plugin
      }))
      .catch((error: unknown) => {
        formatterModulesPromise = null
        throw error
      })
  }
  return formatterModulesPromise
}

export async function formatLatexDirect(
  code: string,
  options: FormatOptions = {}
): Promise<string> {
  const { prettier, latexPlugin } = await loadFormatterModules()
  return prettier.format(code, {
    parser: 'latex-parser',
    plugins: [latexPlugin],
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    ...options
  })
}
