import { describe, expect, it } from 'vitest'
import {
  canOpenExclusiveAppOverlay,
  containsRenderedBlockingOverlay,
  getTopmostAppOverlay,
  hasBlockingModalOverlay,
  hasRenderedBlockingOverlay,
  hasRenderedFeatureModal,
  shouldSuppressBackgroundSurfaces,
  type AppOverlaySnapshot
} from '../../renderer/services/appOverlayPolicy'

const EMPTY_OVERLAYS: AppOverlaySnapshot = {
  commandPalette: false,
  settings: false,
  aiDraft: false,
  templateGallery: false,
  featureModal: false
}

describe('appOverlayPolicy', () => {
  it('blocks the command palette for every modal owner, including lazy loading surfaces', () => {
    for (const surface of ['settings', 'aiDraft', 'templateGallery'] as const) {
      const snapshot = { ...EMPTY_OVERLAYS, [surface]: true }
      expect(hasBlockingModalOverlay(snapshot)).toBe(true)
      expect(canOpenExclusiveAppOverlay('commandPalette', snapshot)).toBe(false)
      expect(shouldSuppressBackgroundSurfaces(snapshot)).toBe(true)
    }
  })

  it('allows a modal to replace the palette but not another modal', () => {
    const palette = { ...EMPTY_OVERLAYS, commandPalette: true }
    expect(canOpenExclusiveAppOverlay('settings', palette)).toBe(true)

    const settings = { ...EMPTY_OVERLAYS, settings: true }
    expect(canOpenExclusiveAppOverlay('aiDraft', settings)).toBe(false)
    expect(canOpenExclusiveAppOverlay('settings', settings)).toBe(true)
  })

  it('chooses a modal over a stale palette flag deterministically', () => {
    const snapshot = {
      ...EMPTY_OVERLAYS,
      commandPalette: true,
      settings: true,
      templateGallery: true
    }

    expect(getTopmostAppOverlay(snapshot)).toBe('templateGallery')
  })

  it('allows the palette only when no modal workflow owns the surface', () => {
    expect(canOpenExclusiveAppOverlay('commandPalette', EMPTY_OVERLAYS)).toBe(true)
    expect(shouldSuppressBackgroundSurfaces(EMPTY_OVERLAYS)).toBe(false)
  })

  it('detects feature-owned modal surfaces outside the central App state', () => {
    const root = document.createElement('div')
    expect(hasRenderedBlockingOverlay(root)).toBe(false)

    root.innerHTML = '<div class="table-editor-overlay"></div>'
    expect(hasRenderedBlockingOverlay(root)).toBe(true)
    expect(hasRenderedFeatureModal(root)).toBe(true)
    expect(containsRenderedBlockingOverlay(root.firstElementChild as Element)).toBe(true)

    root.innerHTML =
      '<div data-app-overlay-owner="settings"><section aria-modal="true"></section></div>'
    expect(hasRenderedBlockingOverlay(root)).toBe(true)
    expect(hasRenderedFeatureModal(root)).toBe(false)
  })

  it('blocks every App-owned surface while a feature modal is active', () => {
    const snapshot = { ...EMPTY_OVERLAYS, featureModal: true }
    expect(hasBlockingModalOverlay(snapshot)).toBe(true)
    expect(shouldSuppressBackgroundSurfaces(snapshot)).toBe(true)
    for (const target of ['commandPalette', 'settings', 'aiDraft', 'templateGallery'] as const) {
      expect(canOpenExclusiveAppOverlay(target, snapshot)).toBe(false)
    }
  })
})
