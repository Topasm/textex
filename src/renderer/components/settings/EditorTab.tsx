import { EditorSettings } from './EditorSettings'
import { CompilerSettings } from './CompilerSettings'

/** Writing preferences: typography, editing behavior, compiler, spell check. */
export const EditorTab = () => (
  <div className="settings-tab-content settings-animate-in">
    <EditorSettings />
    <CompilerSettings />
  </div>
)
