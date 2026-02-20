/// <reference types="vite/client" />

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
