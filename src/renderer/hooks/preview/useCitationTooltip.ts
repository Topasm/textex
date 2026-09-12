import { useState, useEffect, useCallback, useRef, type RefObject } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import type { BibEntry } from '../../../shared/types'
import { resolvePdfCitation, resolvePdfCitationLabel } from '../../services/pdfCitations'

export interface CitationTooltipData {
  entries: BibEntry[]
  anchorRect: DOMRect
  containerRect: DOMRect
  pinned: boolean
}

/** Resolve PDF.js annotation IDs before its link handler can scroll the document. */
export function useCitationTooltip(
  containerRef: RefObject<HTMLDivElement | null>,
  pdfRevision: number
) {
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const bibEntries = useProjectStore((state) => state.bibEntries)
  const auxCitationMap = useProjectStore((state) => state.auxCitationMap)
  const [tooltipData, setTooltipData] = useState<CitationTooltipData | null>(null)
  const annotationsRef = useRef(new Map<number, Map<string, unknown>>())
  const scopeRef = useRef({ projectRoot, pdfRevision })
  scopeRef.current = { projectRoot, pdfRevision }
  const targetRef = useRef<HTMLElement | null>(null)
  const pinnedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(
    (restoreFocus = false) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (restoreFocus && pinnedRef.current) {
        const target = targetRef.current
        const focusTarget =
          target?.isConnected && target.matches('a') ? target : containerRef.current
        focusTarget?.focus({ preventScroll: true })
      }
      pinnedRef.current = false
      targetRef.current = null
      setTooltipData(null)
    },
    [containerRef]
  )

  useEffect(() => {
    annotationsRef.current.clear()
  }, [projectRoot, pdfRevision])

  const registerPageAnnotations = useCallback(
    (revision: number, pageNumber: number, annotations: unknown[]) => {
      if (
        revision !== pdfRevision ||
        scopeRef.current.pdfRevision !== revision ||
        scopeRef.current.projectRoot !== projectRoot
      )
        return
      const destinations = new Map<string, unknown>()
      for (const annotation of annotations) {
        if (!annotation || typeof annotation !== 'object') continue
        const item = annotation as { id?: unknown; dest?: unknown }
        if (typeof item.id === 'string') destinations.set(item.id, item.dest)
      }
      annotationsRef.current.set(pageNumber, destinations)
    },
    [projectRoot, pdfRevision]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    dismiss()
    let pointerStart: { x: number; y: number } | null = null

    const resolve = (node: EventTarget | null) => {
      if (!(node instanceof Element)) return null
      const target = node.closest<HTMLElement>(
        '.annotationLayer a, .textLayer span[role="presentation"]'
      )
      if (
        !target ||
        target.closest('[data-pdf-generation]')?.getAttribute('data-pdf-generation') !==
          String(pdfRevision)
      )
        return null
      if (target.matches('a')) {
        const page = Number(target.closest('[data-page-number]')?.getAttribute('data-page-number'))
        const id = target.closest('[data-annotation-id]')?.getAttribute('data-annotation-id')
        const destination = id ? annotationsRef.current.get(page)?.get(id) : undefined
        // React-PDF uses href="#" for every internal link, so annotation metadata
        // is authoritative. Fragment fallback supports older renderers.
        const href = target.getAttribute('href') ?? ''
        const entries =
          resolvePdfCitation(destination, bibEntries) ??
          resolvePdfCitation(target.getAttribute('data-dest'), bibEntries) ??
          (href.startsWith('#') ? resolvePdfCitation(href, bibEntries) : null)
        return entries ? { target, entries } : null
      }
      const entries = resolvePdfCitationLabel(target.textContent ?? '', bibEntries, auxCitationMap)
      return entries ? { target, entries } : null
    }

    const show = (resolved: { target: HTMLElement; entries: BibEntry[] }, pinned: boolean) => {
      if (!resolved.target.isConnected) return
      if (timerRef.current) clearTimeout(timerRef.current)
      targetRef.current = resolved.target
      pinnedRef.current = pinned
      setTooltipData({
        entries: resolved.entries,
        anchorRect: resolved.target.getBoundingClientRect(),
        containerRect: container.getBoundingClientRect(),
        pinned
      })
    }

    const hover = (event: MouseEvent) => {
      if (pinnedRef.current || event.buttons) return
      const resolved = resolve(event.target)
      if (!resolved) return
      if (timerRef.current) clearTimeout(timerRef.current)
      targetRef.current = resolved.target
      timerRef.current = setTimeout(() => {
        if (targetRef.current === resolved.target) show(resolved, false)
      }, 150)
    }
    const leave = (event: MouseEvent) => {
      if (pinnedRef.current) return
      if (event.relatedTarget instanceof Node && targetRef.current?.contains(event.relatedTarget))
        return
      dismiss()
    }
    const pointerDown = (event: MouseEvent) => {
      pointerStart = { x: event.clientX, y: event.clientY }
    }
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
        return
      if (
        event.detail &&
        pointerStart &&
        Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4
      )
        return
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed && container.contains(selection.anchorNode)) return
      const resolved = resolve(event.target)
      if (!resolved) return
      event.preventDefault()
      event.stopPropagation()
      show(resolved, true)
    }
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('.citation-tooltip')) return
      if (!targetRef.current?.contains(event.target)) dismiss()
    }
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !targetRef.current) return
      event.preventDefault()
      event.stopPropagation()
      dismiss(true)
    }
    const close = () => dismiss()

    container.addEventListener('mouseover', hover)
    container.addEventListener('mouseout', leave)
    container.addEventListener('mousedown', pointerDown)
    container.addEventListener('click', click, true)
    container.addEventListener('scroll', close, { passive: true })
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', keyDown, true)
    window.addEventListener('resize', close)
    const observer = new ResizeObserver(close)
    observer.observe(container)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      container.removeEventListener('mouseover', hover)
      container.removeEventListener('mouseout', leave)
      container.removeEventListener('mousedown', pointerDown)
      container.removeEventListener('click', click, true)
      container.removeEventListener('scroll', close)
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', keyDown, true)
      window.removeEventListener('resize', close)
      observer.disconnect()
    }
  }, [containerRef, pdfRevision, projectRoot, bibEntries, auxCitationMap, dismiss])

  return { tooltipData, dismiss, registerPageAnnotations }
}
