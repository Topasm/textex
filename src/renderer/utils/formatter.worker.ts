import type { Plugin } from 'prettier'
import * as prettier from 'prettier/standalone'
// @ts-expect-error: the package publishes declarations outside its exports map
import * as latexPlugin from 'prettier-plugin-latex'
import type { FormatterWorkerRequest, FormatterWorkerResponse } from './formatterWorkerProtocol'

interface FormatterWorkerScope {
  onmessage: ((event: MessageEvent<FormatterWorkerRequest>) => void) | null
  postMessage(message: FormatterWorkerResponse): void
}

const workerScope = self as unknown as FormatterWorkerScope

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

workerScope.onmessage = (event) => {
  const request = event.data
  if (request.type !== 'format') return

  void prettier
    .format(request.code, {
      parser: 'latex-parser',
      plugins: [latexPlugin as unknown as Plugin],
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
      ...request.options
    })
    .then((formatted) => {
      workerScope.postMessage({
        type: 'format-result',
        requestId: request.requestId,
        formatted
      })
    })
    .catch((error: unknown) => {
      workerScope.postMessage({
        type: 'format-error',
        requestId: request.requestId,
        message: errorMessage(error)
      })
    })
}
