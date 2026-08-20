import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RuntimePerformanceRecorder,
  summarizePerformanceSamples
} from '../../renderer/services/runtimePerformance'

function createHarness() {
  let now = 0
  let epochNow = 1_700_000_000_000
  const frames: FrameRequestCallback[] = []
  const recorder = new RuntimePerformanceRecorder({
    enabled: true,
    clock: {
      now: () => now,
      epochNow: () => epochNow,
      requestFrame: (callback) => {
        frames.push(callback)
        return frames.length
      }
    }
  })

  return {
    recorder,
    frames,
    setNow: (value: number) => {
      now = value
    },
    setEpochNow: (value: number) => {
      epochNow = value
    },
    runFrame: (value: number) => {
      now = value
      const callback = frames.shift()
      if (!callback) throw new Error('No animation frame was scheduled')
      callback(value)
    }
  }
}

describe('runtime performance recorder', () => {
  beforeEach(() => {
    vi.mocked(window.api.getPerformanceMemory).mockResolvedValue({
      sampledAtEpochMs: 1_700_000_000_000,
      totalWorkingSetKiB: 120,
      totalPrivateKiB: 80,
      processes: [
        {
          pid: 42,
          type: 'Browser',
          cpuPercent: 1,
          workingSetKiB: 120,
          peakWorkingSetKiB: 140,
          privateKiB: 80,
          sharedKiB: 40
        }
      ]
    })
  })

  it('computes stable p50 and p95 summaries', () => {
    expect(summarizePerformanceSamples([100, 10, 30, 20])).toEqual({
      count: 4,
      minMs: 10,
      meanMs: 40,
      p50Ms: 20,
      p95Ms: 100,
      maxMs: 100
    })
  })

  it('records startup, input-to-frame, edit-to-PDF, and active scroll frames', async () => {
    const harness = createHarness()

    harness.setNow(12)
    harness.recorder.recordShellInteractive()
    harness.setNow(20)
    harness.recorder.recordShellInteractive()
    harness.recorder.recordEditorInteractive()

    harness.setNow(30)
    harness.recorder.beginInput()
    harness.setNow(35)
    harness.recorder.recordDocumentChange()
    harness.runFrame(46)
    harness.recorder.recordPdfPageRendered(1, 100)
    harness.recorder.recordPdfPageRendered(1, 110)

    harness.recorder.recordPdfScrollEvent(200)
    harness.runFrame(216)
    harness.runFrame(232)
    harness.runFrame(400)

    const report = await harness.recorder.report()
    expect(report.samples).toMatchObject({
      'startup.shellInteractive': [12],
      'startup.editorInteractive': [20],
      'editor.inputToFrame': [16],
      'pipeline.editToPdfPage': [65],
      'pdf.scrollFrame': [16, 16]
    })
    expect(report.memory.application).toHaveLength(1)
    expect(report.memory.application[0].totalPrivateKiB).toBe(80)
  })

  it('caps invalid samples and resets recorded state', async () => {
    const harness = createHarness()
    harness.recorder.recordDuration('editor.inputToFrame', -1)
    harness.recorder.recordDuration('editor.inputToFrame', Number.NaN)
    harness.recorder.recordDuration('editor.inputToFrame', 8.125)
    harness.recorder.reset()
    harness.setEpochNow(1_800_000_000_000)

    const report = await harness.recorder.report()
    expect(report.samples).toEqual({})
    expect(report.generatedAt).toBe(new Date(1_800_000_000_000).toISOString())
  })
})
