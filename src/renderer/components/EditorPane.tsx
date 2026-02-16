import Editor, { OnMount } from '@monaco-editor/react'
import { useRef } from 'react'
import { useAppStore } from '../store/useAppStore'

function EditorPane(): JSX.Element {
  const content = useAppStore((s) => s.content)
  const setContent = useAppStore((s) => s.setContent)
  const setCursorPosition = useAppStore((s) => s.setCursorPosition)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor

    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition(e.position.lineNumber, e.position.column)
    })
  }

  const handleChange = (value: string | undefined): void => {
    if (value !== undefined) {
      setContent(value)
    }
  }

  return (
    <div className="h-full">
      <Editor
        height="100%"
        defaultLanguage="latex"
        theme="vs-dark"
        value={content}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          wordWrap: 'on',
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 8 }
        }}
      />
    </div>
  )
}

export default EditorPane
