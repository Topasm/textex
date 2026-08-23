/**
 * Performance report contracts shared by the Tauri backend, renderer tooling,
 * and benchmark runners.
 */

export type RuntimePerformanceMetric =
  | 'startup.shellInteractive'
  | 'startup.editorInteractive'
  | 'editor.inputToFrame'
  | 'pipeline.editToPdfPage'
  | 'pdf.scrollFrame'
  | 'renderer.longTask'

export interface PerformanceMetricSummary {
  count: number
  minMs: number
  meanMs: number
  p50Ms: number
  p95Ms: number
  maxMs: number
}

export interface ProcessMemoryMetric {
  pid: number
  type: string
  cpuPercent: number
  workingSetKiB: number
  peakWorkingSetKiB: number
  privateKiB: number
  sharedKiB: number
}

export interface PerformanceMemorySample {
  sampledAtEpochMs: number
  totalWorkingSetKiB: number
  totalPrivateKiB: number
  processes: ProcessMemoryMetric[]
}

export interface RendererMemorySample {
  sampledAtEpochMs: number
  usedJsHeapBytes: number
  totalJsHeapBytes: number
  jsHeapLimitBytes: number
}

export interface RuntimePerformanceReport {
  schemaVersion: 1
  generatedAt: string
  runtime: {
    userAgent: string
    platform: string
    hardwareConcurrency: number | null
  }
  samples: Partial<Record<RuntimePerformanceMetric, number[]>>
  summary: Partial<Record<RuntimePerformanceMetric, PerformanceMetricSummary>>
  memory: {
    renderer: RendererMemorySample[]
    application: PerformanceMemorySample[]
  }
}
