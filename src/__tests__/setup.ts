import '@testing-library/jest-dom'

// Mock window.api for all tests
Object.defineProperty(window, 'api', {
  value: {
    openFile: vi.fn(),
    saveFile: vi.fn(),
    saveFileAs: vi.fn(),
    compile: vi.fn(),
    cancelCompile: vi.fn(),
    onCompileLog: vi.fn(),
    removeCompileLogListener: vi.fn(),
    onDiagnostics: vi.fn(),
    removeDiagnosticsListener: vi.fn(),
    synctexForward: vi.fn(),
    synctexInverse: vi.fn()
  },
  writable: true
})
