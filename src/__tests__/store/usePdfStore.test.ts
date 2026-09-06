import { describe, it, expect, beforeEach } from 'vitest'
import { usePdfStore } from '../../renderer/store/usePdfStore'
beforeEach(() => usePdfStore.setState({ splitRatio: 0.5, zoomLevel: 100, synctexHighlight: null }))

describe('usePdfStore', () => {
  describe('setSynctexHighlight', () => {
    it('sets highlight with timestamp', () => {
      const before = Date.now()
      usePdfStore.getState().setSynctexHighlight({ page: 1, x: 100, y: 200 })
      const after = Date.now()
      const highlight = usePdfStore.getState().synctexHighlight
      expect(highlight).not.toBeNull()
      expect(highlight!.page).toBe(1)
      expect(highlight!.x).toBe(100)
      expect(highlight!.y).toBe(200)
      expect(highlight!.timestamp).toBeGreaterThanOrEqual(before)
      expect(highlight!.timestamp).toBeLessThanOrEqual(after)
    })

    it('sets highlight to null', () => {
      usePdfStore.getState().setSynctexHighlight({ page: 1, x: 0, y: 0 })
      usePdfStore.getState().setSynctexHighlight(null)
      expect(usePdfStore.getState().synctexHighlight).toBeNull()
    })
  })

  describe('setZoomLevel', () => {
    it('sets zoom level', () => {
      usePdfStore.getState().setZoomLevel(150)
      expect(usePdfStore.getState().zoomLevel).toBe(150)
    })

    it('rounds fractional zoom levels to an integer percentage', () => {
      usePdfStore.getState().setZoomLevel(92.00965826511386)
      expect(usePdfStore.getState().zoomLevel).toBe(92)
    })

    it('clamps zoom level to minimum of 25', () => {
      usePdfStore.getState().setZoomLevel(10)
      expect(usePdfStore.getState().zoomLevel).toBe(25)
    })

    it('clamps zoom level to maximum of 400', () => {
      usePdfStore.getState().setZoomLevel(500)
      expect(usePdfStore.getState().zoomLevel).toBe(400)
    })

    it('clamps after rounding fractional values', () => {
      usePdfStore.getState().setZoomLevel(24.6)
      expect(usePdfStore.getState().zoomLevel).toBe(25)

      usePdfStore.getState().setZoomLevel(400.6)
      expect(usePdfStore.getState().zoomLevel).toBe(400)
    })
  })

  describe('pdf persist migration', () => {
    it('normalizes persisted fractional zoom during migration', async () => {
      const migrate = usePdfStore.persist.getOptions().migrate
      expect(migrate).toBeTypeOf('function')

      const migrated = await migrate?.(
        {
          zoomLevel: 92.00965826511386,
          splitRatio: 0.5,
          savedScrollPositions: {}
        },
        0
      )

      expect(migrated).toMatchObject({ zoomLevel: 92 })
    })
  })

  describe('zoomIn', () => {
    it('increases zoom by 25', () => {
      usePdfStore.getState().zoomIn()
      expect(usePdfStore.getState().zoomLevel).toBe(125)
    })

    it('does not exceed maximum of 400', () => {
      usePdfStore.setState({ zoomLevel: 400 })
      usePdfStore.getState().zoomIn()
      expect(usePdfStore.getState().zoomLevel).toBe(400)
    })
  })

  describe('zoomOut', () => {
    it('decreases zoom by 25', () => {
      usePdfStore.getState().zoomOut()
      expect(usePdfStore.getState().zoomLevel).toBe(75)
    })

    it('does not go below minimum of 25', () => {
      usePdfStore.setState({ zoomLevel: 25 })
      usePdfStore.getState().zoomOut()
      expect(usePdfStore.getState().zoomLevel).toBe(25)
    })
  })

  describe('resetZoom', () => {
    it('resets zoom to 100', () => {
      usePdfStore.setState({ zoomLevel: 250 })
      usePdfStore.getState().resetZoom()
      expect(usePdfStore.getState().zoomLevel).toBe(100)
    })
  })
})
