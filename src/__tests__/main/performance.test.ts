import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  getAppMetrics: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getAppMetrics: electronMock.getAppMetrics },
  ipcMain: { handle: electronMock.handle }
}))

import { registerPerformanceHandlers } from '../../main/ipc/performance'

describe('performance IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    electronMock.getAppMetrics.mockReturnValue([
      {
        pid: 10,
        type: 'Browser',
        cpu: { percentCPUUsage: 1.5 },
        memory: {
          workingSetSize: 100,
          peakWorkingSetSize: 120,
          privateBytes: 70,
          sharedBytes: 30
        }
      },
      {
        pid: 11,
        type: 'Tab',
        cpu: { percentCPUUsage: 2.5 },
        memory: {
          workingSetSize: 80,
          peakWorkingSetSize: 90,
          privateBytes: 50,
          sharedBytes: 30
        }
      }
    ])
  })

  it('returns a serializable aggregate without exposing Electron objects', () => {
    registerPerformanceHandlers()
    expect(electronMock.handle).toHaveBeenCalledWith('performance:memory', expect.any(Function))

    const handler = electronMock.handle.mock.calls[0][1] as () => unknown
    expect(handler()).toMatchObject({
      totalWorkingSetKiB: 180,
      totalPrivateKiB: 120,
      processes: [
        {
          pid: 10,
          type: 'Browser',
          cpuPercent: 1.5,
          workingSetKiB: 100,
          peakWorkingSetKiB: 120,
          privateKiB: 70,
          sharedKiB: 30
        },
        {
          pid: 11,
          type: 'Tab',
          cpuPercent: 2.5,
          workingSetKiB: 80,
          peakWorkingSetKiB: 90,
          privateKiB: 50,
          sharedKiB: 30
        }
      ]
    })
  })
})
