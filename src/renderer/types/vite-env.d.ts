/// <reference types="vite/client" />

declare const __APP_VERSION__: string

declare module '*?url' {
  const url: string
  export default url
}

interface VimModeInstance {
  dispose(): void
}

interface Window {
  vimMode?: VimModeInstance | null
}
