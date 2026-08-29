import type {
  editor as monacoEditor,
  IDisposable,
  IPosition,
  IRange,
  MarkerSeverity
} from 'monaco-editor'
import type {
  EditorAdapter,
  EditorDecoration,
  EditorDiagnostic,
  EditorDisposable,
  EditorDocumentBuffer,
  EditorDocumentChange,
  EditorPosition,
  EditorRange,
  EditorRevealOptions,
  EditorSelection,
  EditorSnapshot,
  EditorTextChange,
  EditorTextEdit,
  EditorVisibleLineRange
} from './EditorAdapter'

type MonacoInstance = typeof import('monaco-editor')

interface DecorationEntry {
  collection: monacoEditor.IEditorDecorationsCollection
  generation: number
}

function toEditorPosition(position: { lineNumber: number; column: number }): EditorPosition {
  return { line: position.lineNumber, column: position.column }
}

function toMonacoPosition(position: EditorPosition): IPosition {
  return { lineNumber: position.line, column: position.column }
}

function toEditorRange(range: IRange): EditorRange {
  return {
    start: { line: range.startLineNumber, column: range.startColumn },
    end: { line: range.endLineNumber, column: range.endColumn }
  }
}

function toMonacoRange(range: EditorRange): IRange {
  return {
    startLineNumber: range.start.line,
    startColumn: range.start.column,
    endLineNumber: range.end.line,
    endColumn: range.end.column
  }
}

function noOpDisposable(): EditorDisposable {
  return { dispose: () => {} }
}

/** Monaco implementation of the renderer's editor-engine contract. */
export class MonacoEditorAdapter implements EditorAdapter {
  private documentId: string | null
  private engineRevision = 0
  private disposed = false
  private readonly listeners = new Set<(event: EditorDocumentChange) => void>()
  private readonly decorations = new Map<string, DecorationEntry>()
  private readonly contentDisposable: IDisposable

  constructor(
    private readonly editor: monacoEditor.IStandaloneCodeEditor,
    private readonly monaco: MonacoInstance,
    documentId: string | null = null
  ) {
    this.documentId = documentId
    this.contentDisposable = editor.onDidChangeModelContent((event) => {
      this.engineRevision += 1
      if (this.listeners.size === 0) return

      const changes: readonly EditorTextChange[] = Object.freeze(
        event.changes.map((change) =>
          Object.freeze({
            range: toEditorRange(change.range),
            rangeOffset: change.rangeOffset,
            rangeLength: change.rangeLength,
            text: change.text
          })
        )
      )
      const adapterEvent: EditorDocumentChange = Object.freeze({
        documentId: this.documentId,
        revision: this.engineRevision,
        changes,
        isFlush: event.isFlush
      })
      for (const listener of this.listeners) listener(adapterEvent)
    })
  }

  setDocumentId(documentId: string | null): void {
    if (this.documentId === documentId) return
    this.documentId = documentId
    // A document switch invalidates work based on the prior engine snapshot.
    this.engineRevision += 1
  }

  getDocumentId(): string | null {
    return this.documentId
  }

  getText(range?: EditorRange): string {
    const model = this.editor.getModel()
    if (!model) return ''
    return range ? model.getValueInRange(toMonacoRange(range)) : model.getValue()
  }

  getEngineRevision(): number {
    return this.engineRevision
  }

  materializeSnapshot(): EditorSnapshot {
    return Object.freeze({
      documentId: this.documentId,
      engineRevision: this.engineRevision,
      text: this.getText()
    })
  }

  getDocumentBuffer(): EditorDocumentBuffer | null {
    const model = this.editor.getModel()
    const documentId = this.documentId
    if (!model || !documentId) return null
    return Object.freeze({
      documentId,
      getText: () => model.getValue(),
      replaceText: (text: string) => model.setValue(text),
      applyEdits: (_source: string, edits: readonly EditorTextEdit[]) => {
        model.pushEditOperations(
          null,
          edits.map((edit) => ({
            range: toMonacoRange(edit.range),
            text: edit.text,
            forceMoveMarkers: edit.forceMoveMarkers
          })),
          () => null
        )
        return true
      }
    })
  }

  getLineCount(): number {
    return this.editor.getModel()?.getLineCount() ?? 0
  }

  getLineMaxColumn(line: number): number {
    const model = this.editor.getModel()
    if (!model || model.getLineCount() === 0) return 1
    const safeLine = Math.min(Math.max(Math.trunc(line), 1), model.getLineCount())
    return model.getLineMaxColumn(safeLine)
  }

  getPosition(): EditorPosition | null {
    const position = this.editor.getPosition()
    return position ? toEditorPosition(position) : null
  }

  getSelection(): EditorSelection | null {
    const selection = this.editor.getSelection()
    if (!selection) return null
    return {
      ...toEditorRange(selection),
      anchor: {
        line: selection.selectionStartLineNumber,
        column: selection.selectionStartColumn
      },
      active: {
        line: selection.positionLineNumber,
        column: selection.positionColumn
      },
      isEmpty: selection.isEmpty()
    }
  }

  getPositionAtClientPoint(clientX: number, clientY: number): EditorPosition | null {
    const position = this.editor.getTargetAtClientPoint(clientX, clientY)?.position
    return position ? toEditorPosition(position) : null
  }

  setPosition(position: EditorPosition): void {
    this.editor.setPosition(toMonacoPosition(position))
  }

  revealPosition(position: EditorPosition, options: EditorRevealOptions = {}): void {
    if (options.center) {
      this.editor.revealLineInCenter(position.line)
    } else {
      this.editor.revealPosition(toMonacoPosition(position))
    }
    this.setPosition(position)
    if (options.focus) this.focus()
  }

  applyEdits(source: string, edits: readonly EditorTextEdit[]): boolean {
    return this.editor.executeEdits(
      source,
      edits.map((edit) => ({
        range: toMonacoRange(edit.range),
        text: edit.text,
        forceMoveMarkers: edit.forceMoveMarkers
      }))
    )
  }

  setDiagnostics(owner: string, diagnostics: readonly EditorDiagnostic[]): void {
    const model = this.editor.getModel()
    if (!model) return

    const markers: monacoEditor.IMarkerData[] = diagnostics.map((diagnostic) => {
      const range = this.normalizeRange(diagnostic.range, model)
      return {
        ...toMonacoRange(range),
        severity: this.toMonacoSeverity(diagnostic.severity),
        message: diagnostic.message,
        source: diagnostic.source,
        code: diagnostic.code
      }
    })
    this.monaco.editor.setModelMarkers(model, owner, markers)
  }

  setDecorations(owner: string, decorations: readonly EditorDecoration[]): EditorDisposable {
    if (this.disposed) return noOpDisposable()

    const mapped: monacoEditor.IModelDeltaDecoration[] = decorations.map((decoration) => ({
      range: toMonacoRange(decoration.range),
      options: {
        isWholeLine: decoration.isWholeLine,
        className: decoration.className,
        inlineClassName: decoration.inlineClassName,
        marginClassName: decoration.marginClassName,
        hoverMessage: decoration.hoverMessage ? { value: decoration.hoverMessage } : undefined
      }
    }))

    let entry = this.decorations.get(owner)
    if (entry) {
      entry.generation += 1
      entry.collection.set(mapped)
    } else {
      entry = {
        collection: this.editor.createDecorationsCollection(mapped),
        generation: 1
      }
      this.decorations.set(owner, entry)
    }

    const generation = entry.generation
    return {
      dispose: () => {
        const current = this.decorations.get(owner)
        if (current === entry && current.generation === generation) {
          current.collection.clear()
        }
      }
    }
  }

  clearDecorations(owner: string): void {
    const entry = this.decorations.get(owner)
    if (!entry) return
    entry.generation += 1
    entry.collection.clear()
  }

  onDidChangeDocument(listener: (event: EditorDocumentChange) => void): EditorDisposable {
    if (this.disposed) return noOpDisposable()
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }

  onDidScroll(listener: () => void): EditorDisposable {
    if (this.disposed) return noOpDisposable()
    return this.editor.onDidScrollChange(listener)
  }

  getVisibleLineRange(): EditorVisibleLineRange | null {
    const range = this.editor.getVisibleRanges()[0]
    if (!range) return null
    return { startLine: range.startLineNumber, endLine: range.endLineNumber }
  }

  scrollToLine(line: number): void {
    this.editor.setScrollTop(this.editor.getTopForLineNumber(line))
  }

  focus(): void {
    this.editor.focus()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.contentDisposable.dispose()
    this.listeners.clear()
    for (const entry of this.decorations.values()) entry.collection.clear()
    this.decorations.clear()
  }

  private normalizeRange(range: EditorRange, model: monacoEditor.ITextModel): EditorRange {
    const lineCount = Math.max(model.getLineCount(), 1)
    const startLine = Math.min(Math.max(Math.trunc(range.start.line), 1), lineCount)
    const endLine = Math.min(Math.max(Math.trunc(range.end.line), startLine), lineCount)
    const startMaxColumn = model.getLineMaxColumn(startLine)
    const endMaxColumn = model.getLineMaxColumn(endLine)
    const startColumn = Math.min(Math.max(Math.trunc(range.start.column), 1), startMaxColumn)
    const requestedEndColumn = Math.min(Math.max(Math.trunc(range.end.column), 1), endMaxColumn)
    const endColumn =
      endLine === startLine ? Math.max(requestedEndColumn, startColumn) : requestedEndColumn
    return {
      start: { line: startLine, column: startColumn },
      end: { line: endLine, column: endColumn }
    }
  }

  private toMonacoSeverity(severity: EditorDiagnostic['severity']): MarkerSeverity {
    switch (severity) {
      case 'error':
        return this.monaco.MarkerSeverity.Error
      case 'warning':
        return this.monaco.MarkerSeverity.Warning
      case 'hint':
        return this.monaco.MarkerSeverity.Hint
      case 'info':
        return this.monaco.MarkerSeverity.Info
    }
  }
}
