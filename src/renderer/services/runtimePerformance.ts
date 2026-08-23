import type {
  PerformanceMemorySample,
  PerformanceMetricSummary,
  RendererMemorySample,
  RuntimePerformanceMetric,
  RuntimePerformanceReport
} from '../../shared/performance'
import { getDesktopCapabilities } from '../platform/capabilities'

const MAX_SAMPLES_PER_METRIC = 2_000
const MAX_MEMORY_SAMPLES = 120
const SCROLL_IDLE_MS = 150
const MEMORY_SAMPLE_INTERVAL_MS = 30_000

interface ChromiumPerformanceMemory {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

interface RecorderClock {
  now(): number
  epochNow(): number
  requestFrame(callback: FrameRequestCallback): number
}

interface RuntimePerformanceOptions {
  enabled: boolean
  clock?: RecorderClock
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function summarizePerformanceSamples(samples: readonly number[]): PerformanceMetricSummary {
  if (samples.length === 0) {
    return { count: 0, minMs: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 }
  }

  const sorted = [...samples].sort((left, right) => left - right)
  const total = sorted.reduce((sum, value) => sum + value, 0)
  return {
    count: sorted.length,
    minMs: round(sorted[0]),
    meanMs: round(total / sorted.length),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(sorted[sorted.length - 1])
  }
}

function defaultClock(): RecorderClock {
  return {
    now: () => performance.now(),
    epochNow: () => Date.now(),
    requestFrame: (callback) => requestAnimationFrame(callback)
  }
}

export class RuntimePerformanceRecorder {
  readonly #enabled: boolean
  readonly #clock: RecorderClock
  readonly #samples = new Map<RuntimePerformanceMetric, number[]>()
  readonly #recordedOnce = new Set<RuntimePerformanceMetric>()
  readonly #rendererMemory: RendererMemorySample[] = []
  readonly #applicationMemory: PerformanceMemorySample[] = []

  #pendingInputAt: number | null = null
  #latestEditAt: number | null = null
  #lastMeasuredPdfRevision: number | null = null
  #scrollActive = false
  #lastScrollAt = 0
  #lastScrollFrameAt = 0
  #longTaskObserver: PerformanceObserver | null = null
  #memoryTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: RuntimePerformanceOptions) {
    this.#enabled = options.enabled
    this.#clock = options.clock ?? defaultClock()
  }

  get enabled(): boolean {
    return this.#enabled
  }

  start(): void {
    if (!this.#enabled || this.#memoryTimer) return

    if (
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('longtask')
    ) {
      this.#longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordDuration('renderer.longTask', entry.duration)
        }
      })
      this.#longTaskObserver.observe({ entryTypes: ['longtask'] })
    }

    void this.captureMemory()
    this.#memoryTimer = setInterval(() => void this.captureMemory(), MEMORY_SAMPLE_INTERVAL_MS)
  }

  dispose(): void {
    this.#longTaskObserver?.disconnect()
    this.#longTaskObserver = null
    if (this.#memoryTimer) clearInterval(this.#memoryTimer)
    this.#memoryTimer = null
  }

  recordShellInteractive(at: number = this.#clock.now()): void {
    this.#recordOnce('startup.shellInteractive', at)
  }

  recordEditorInteractive(at: number = this.#clock.now()): void {
    this.#recordOnce('startup.editorInteractive', at)
  }

  beginInput(at: number = this.#clock.now()): void {
    if (!this.#enabled) return
    this.#pendingInputAt = at
  }

  recordDocumentChange(at: number = this.#clock.now()): void {
    if (!this.#enabled) return

    this.#latestEditAt = at
    const inputAt = this.#pendingInputAt
    this.#pendingInputAt = null
    if (inputAt === null) return

    this.#clock.requestFrame(() => {
      this.recordDuration('editor.inputToFrame', this.#clock.now() - inputAt)
    })
  }

  recordPdfPageRendered(pdfRevision: number, at: number = this.#clock.now()): void {
    if (!this.#enabled || this.#latestEditAt === null) return
    if (this.#lastMeasuredPdfRevision === pdfRevision) return

    this.#lastMeasuredPdfRevision = pdfRevision
    this.recordDuration('pipeline.editToPdfPage', at - this.#latestEditAt)
    this.#latestEditAt = null
  }

  recordPdfScrollEvent(at: number = this.#clock.now()): void {
    if (!this.#enabled) return
    this.#lastScrollAt = at
    if (this.#scrollActive) return

    this.#scrollActive = true
    this.#lastScrollFrameAt = at
    this.#clock.requestFrame((frameAt) => this.#sampleScrollFrame(frameAt))
  }

  recordDuration(metric: RuntimePerformanceMetric, durationMs: number): void {
    if (!this.#enabled || !Number.isFinite(durationMs) || durationMs < 0) return
    const samples = this.#samples.get(metric) ?? []
    samples.push(durationMs)
    if (samples.length > MAX_SAMPLES_PER_METRIC) {
      samples.splice(0, samples.length - MAX_SAMPLES_PER_METRIC)
    }
    this.#samples.set(metric, samples)
  }

  async captureMemory(): Promise<void> {
    if (!this.#enabled) return

    const rendererMemory = (performance as Performance & { memory?: ChromiumPerformanceMemory })
      .memory
    if (rendererMemory) {
      this.#appendMemory(this.#rendererMemory, {
        sampledAtEpochMs: this.#clock.epochNow(),
        usedJsHeapBytes: rendererMemory.usedJSHeapSize,
        totalJsHeapBytes: rendererMemory.totalJSHeapSize,
        jsHeapLimitBytes: rendererMemory.jsHeapSizeLimit
      })
    }

    if (!getDesktopCapabilities().performanceMemory) return

    try {
      const sample = await window.api.getPerformanceMemory()
      this.#appendMemory(this.#applicationMemory, sample)
    } catch {
      // The experimental Tauri backend does not expose process metrics yet.
    }
  }

  async report(): Promise<RuntimePerformanceReport> {
    await this.captureMemory()
    const samples: RuntimePerformanceReport['samples'] = {}
    const summary: RuntimePerformanceReport['summary'] = {}

    for (const [metric, values] of this.#samples) {
      samples[metric] = values.map(round)
      summary[metric] = summarizePerformanceSamples(values)
    }

    return {
      schemaVersion: 1,
      generatedAt: new Date(this.#clock.epochNow()).toISOString(),
      runtime: {
        userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
        platform: typeof navigator === 'undefined' ? 'unknown' : navigator.platform,
        hardwareConcurrency:
          typeof navigator === 'undefined' || !navigator.hardwareConcurrency
            ? null
            : navigator.hardwareConcurrency
      },
      samples,
      summary,
      memory: {
        renderer: this.#rendererMemory.map((sample) => ({ ...sample })),
        application: this.#applicationMemory.map((sample) => ({
          ...sample,
          processes: sample.processes.map((process) => ({ ...process }))
        }))
      }
    }
  }

  reset(): void {
    this.#samples.clear()
    this.#recordedOnce.clear()
    this.#rendererMemory.length = 0
    this.#applicationMemory.length = 0
    this.#pendingInputAt = null
    this.#latestEditAt = null
    this.#lastMeasuredPdfRevision = null
    this.#scrollActive = false
  }

  #recordOnce(metric: RuntimePerformanceMetric, durationMs: number): void {
    if (!this.#enabled || this.#recordedOnce.has(metric)) return
    this.#recordedOnce.add(metric)
    this.recordDuration(metric, durationMs)
  }

  #sampleScrollFrame(frameAt: number): void {
    if (!this.#scrollActive) return
    const frameDuration = frameAt - this.#lastScrollFrameAt
    const scrollIsActive = frameAt - this.#lastScrollAt <= SCROLL_IDLE_MS
    if (frameDuration > 0 && scrollIsActive) {
      this.recordDuration('pdf.scrollFrame', frameDuration)
    }
    this.#lastScrollFrameAt = frameAt

    if (scrollIsActive) {
      this.#clock.requestFrame((nextFrameAt) => this.#sampleScrollFrame(nextFrameAt))
    } else {
      this.#scrollActive = false
    }
  }

  #appendMemory<T>(target: T[], sample: T): void {
    target.push(sample)
    if (target.length > MAX_MEMORY_SAMPLES) {
      target.splice(0, target.length - MAX_MEMORY_SAMPLES)
    }
  }
}

function performanceMeasurementEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return (
    import.meta.env.DEV || new URLSearchParams(window.location.search).get('performance') === '1'
  )
}

export const runtimePerformance = new RuntimePerformanceRecorder({
  enabled: performanceMeasurementEnabled()
})

export function installRuntimePerformance(): void {
  if (!runtimePerformance.enabled) return
  runtimePerformance.start()
  window.textexPerformance = {
    enabled: true,
    report: () => runtimePerformance.report(),
    download: async () => {
      const report = await runtimePerformance.report()
      const timestamp = report.generatedAt.replace(/[:.]/g, '-')
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      )
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `textex-runtime-${timestamp}.json`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      return report
    },
    reset: () => runtimePerformance.reset(),
    captureMemory: () => runtimePerformance.captureMemory()
  }
}
