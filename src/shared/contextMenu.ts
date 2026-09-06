export const CONTEXT_MENU_EVENT = 'context-menu-selection'
export const CONTEXT_MENU_ID_PREFIX = 'textex.context.'

/** Serializable presentation only. File and reference operations keep their own authority checks. */
export interface NativeContextMenuRequest {
  /** Logical coordinates relative to the window's content area. */
  x: number
  y: number
  items: Array<{ id: string; label: string; disabled?: boolean }>
}
