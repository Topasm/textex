import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface PdfGeneration {
  revision: number
  path: string
  file: { data: Uint8Array }
  numPages: number | null
  document?: PDFDocumentProxy
}

interface RequestedPdfGeneration {
  revision: number
  path: string
}

export interface PdfGenerationState {
  requested: RequestedPdfGeneration | null
  displayed: PdfGeneration | null
  pending: PdfGeneration | null
}

export type PdfGenerationAction =
  | { type: 'clear' }
  | { type: 'request'; revision: number; path: string }
  | { type: 'loaded'; generation: PdfGeneration }
  | { type: 'documentLoaded'; revision: number; numPages: number; document?: PDFDocumentProxy }
  | { type: 'ready'; revision: number }
  | { type: 'failed'; revision: number }

export const initialPdfGenerationState: PdfGenerationState = {
  requested: null,
  displayed: null,
  pending: null
}

/**
 * Keeps the last rendered PDF visible while a newer generation loads. Actions
 * from superseded asynchronous reads and renders are ignored by revision.
 */
export function reducePdfGeneration(
  state: PdfGenerationState,
  action: PdfGenerationAction
): PdfGenerationState {
  switch (action.type) {
    case 'clear':
      return initialPdfGenerationState
    case 'request':
      return {
        requested: { revision: action.revision, path: action.path },
        displayed: state.displayed,
        pending: null
      }
    case 'loaded': {
      const { generation } = action
      if (
        state.requested?.revision !== generation.revision ||
        state.requested.path !== generation.path
      ) {
        return state
      }
      if (!state.displayed) {
        return { ...state, displayed: generation, pending: null }
      }
      return { ...state, pending: generation }
    }
    case 'documentLoaded': {
      if (state.displayed?.revision === action.revision) {
        return {
          ...state,
          displayed: {
            ...state.displayed,
            numPages: action.numPages,
            ...(action.document ? { document: action.document } : {})
          }
        }
      }
      if (state.pending?.revision === action.revision) {
        return {
          ...state,
          pending: {
            ...state.pending,
            numPages: action.numPages,
            ...(action.document ? { document: action.document } : {})
          }
        }
      }
      return state
    }
    case 'ready':
      if (
        state.requested?.revision !== action.revision ||
        state.pending?.revision !== action.revision ||
        state.pending.numPages === null
      ) {
        return state
      }
      return { ...state, displayed: state.pending, pending: null }
    case 'failed':
      if (state.pending?.revision !== action.revision) return state
      return { ...state, pending: null }
  }
}
