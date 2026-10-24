import {
  EDITOR_PANE_MIN_WIDTH,
  PREVIEW_PANE_MIN_WIDTH,
  RESEARCH_PANEL_WIDTH_MAX,
  RESEARCH_PANEL_WIDTH_MIN,
  SPLIT_DIVIDER_WIDTH
} from '../constants'

/**
 * How the research panel shares the workspace row with the editor and the PDF.
 *
 * - `side`: three panes side by side; the panel takes `researchWidth` px.
 * - `stacked`: the row is too narrow for three columns, so the panel sits in
 *   the PDF column behind a PDF ↔ Research tab strip and the PDF stays mounted.
 * - `hidden`: the panel is closed (or the PDF workspace hides its tools).
 */
export type ResearchLayoutMode = 'side' | 'stacked' | 'hidden'

/** Which surface the PDF column shows while the panel is stacked. */
export type StackedView = 'preview' | 'research'

export interface WorkspaceLayoutInput {
  /** Width of the row the panes share, or null before the first measurement. */
  availableWidth: number | null
  /** The research panel is open and allowed to take part in the layout. */
  researchOpen: boolean
  /** The user's stored research panel width. */
  researchWidth: number
  /** False in the PDF workspace, where the editor column is hidden. */
  editorVisible: boolean
}

export interface WorkspaceLayout {
  mode: ResearchLayoutMode
  /** Width reserved for the panel in side mode; 0 otherwise. */
  researchWidth: number
  /** Widest the panel may be dragged while the other panes keep their minimums. */
  maxResearchWidth: number
}

/** Width the editor and preview columns need before the panel can join the row. */
export function minimumPaneRowWidth(editorVisible: boolean): number {
  return (editorVisible ? EDITOR_PANE_MIN_WIDTH + SPLIT_DIVIDER_WIDTH : 0) + PREVIEW_PANE_MIN_WIDTH
}

export function resolveWorkspaceLayout(input: WorkspaceLayoutInput): WorkspaceLayout {
  const { availableWidth, researchOpen, researchWidth, editorVisible } = input
  if (!researchOpen) {
    return { mode: 'hidden', researchWidth: 0, maxResearchWidth: RESEARCH_PANEL_WIDTH_MAX }
  }

  const otherPanes = minimumPaneRowWidth(editorVisible)
  // Before the row is measured assume the common case so the panel does not
  // flash through the stacked layout on its way to the side-by-side one.
  const room = availableWidth === null ? Number.POSITIVE_INFINITY : availableWidth - otherPanes
  if (room < RESEARCH_PANEL_WIDTH_MIN) {
    return { mode: 'stacked', researchWidth: 0, maxResearchWidth: RESEARCH_PANEL_WIDTH_MIN }
  }

  const maxResearchWidth = Math.min(RESEARCH_PANEL_WIDTH_MAX, Math.floor(room))
  const width = Math.min(maxResearchWidth, Math.max(RESEARCH_PANEL_WIDTH_MIN, researchWidth))
  return { mode: 'side', researchWidth: width, maxResearchWidth }
}
