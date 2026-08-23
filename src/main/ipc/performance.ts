import { app, ipcMain } from 'electron'
import type { PerformanceMemorySample } from '../../shared/performance'

/**
 * Returns a small serializable snapshot rather than exposing Electron process
 * objects to the renderer. Electron reports all memory values in KiB.
 */
export function registerPerformanceHandlers(): void {
  ipcMain.handle('performance:memory', (): PerformanceMemorySample => {
    const processes = app.getAppMetrics().map((metric) => ({
      pid: metric.pid,
      type: metric.type,
      cpuPercent: metric.cpu.percentCPUUsage,
      workingSetKiB: metric.memory.workingSetSize,
      peakWorkingSetKiB: metric.memory.peakWorkingSetSize,
      privateKiB: metric.memory.privateBytes ?? 0,
      // Newer Electron types omit sharedBytes, but older runtimes/platforms may
      // still report it. Preserve the metric when present.
      sharedKiB: (metric.memory as { sharedBytes?: number }).sharedBytes ?? 0
    }))

    return {
      sampledAtEpochMs: Date.now(),
      totalWorkingSetKiB: processes.reduce((total, process) => total + process.workingSetKiB, 0),
      totalPrivateKiB: processes.reduce((total, process) => total + process.privateKiB, 0),
      processes
    }
  })
}
