export type SubmissionCheckSeverity = 'error' | 'warning' | 'info'

export interface SubmissionCheckRequest {
  rootFile: string
}

export interface SubmissionCheckFinding {
  severity: SubmissionCheckSeverity
  code: string
  message: string
  file: string
  line: number
}

export interface SubmissionCheckSummary {
  errors: number
  warnings: number
  info: number
}

/** A deterministic snapshot of checks that can be proven from local project sources. */
export interface SubmissionCheckResult {
  rootFile: string
  scannedFiles: number
  findings: SubmissionCheckFinding[]
  summary: SubmissionCheckSummary
}
