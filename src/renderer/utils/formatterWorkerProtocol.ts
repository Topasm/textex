export interface FormatOptions {
  printWidth?: number
  tabWidth?: number
  useTabs?: boolean
}

export interface FormatterWorkerRequest {
  readonly type: 'format'
  readonly requestId: number
  readonly code: string
  readonly options: FormatOptions
}

export type FormatterWorkerResponse =
  | {
      readonly type: 'format-result'
      readonly requestId: number
      readonly formatted: string
    }
  | {
      readonly type: 'format-error'
      readonly requestId: number
      readonly message: string
    }
