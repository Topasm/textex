import { useState, useRef, useEffect } from 'react'
import { registerTableEditorCodeLens } from '../../components/editor/editorCodeLens'
import type { editor as monacoEditor, IDisposable, IRange } from 'monaco-editor'

type MonacoInstance = typeof import('monaco-editor')

export interface TableEditorState {
  tableModal: { isOpen: boolean; latex: string; range: IRange | null }
  setTableModal: React.Dispatch<
    React.SetStateAction<{ isOpen: boolean; latex: string; range: IRange | null }>
  >
  registerTableEditor: (editor: monacoEditor.IStandaloneCodeEditor, monaco: MonacoInstance) => void
  disposeTableEditor: () => void
}

export function useTableEditor(): TableEditorState {
  const [tableModal, setTableModal] = useState<{
    isOpen: boolean
    latex: string
    range: IRange | null
  }>({
    isOpen: false,
    latex: '',
    range: null
  })

  const disposablesRef = useRef<IDisposable[]>([])

  const registerTableEditor = (
    editor: monacoEditor.IStandaloneCodeEditor,
    monaco: MonacoInstance
  ) => {
    disposablesRef.current.push(...registerTableEditorCodeLens(editor, monaco, setTableModal))
  }

  const disposeTableEditor = () => {
    for (const d of disposablesRef.current) d.dispose()
    disposablesRef.current = []
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => disposeTableEditor()
  }, [])

  return {
    tableModal,
    setTableModal,
    registerTableEditor,
    disposeTableEditor
  }
}
