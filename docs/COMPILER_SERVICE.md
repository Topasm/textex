# TextEx — Compiler Service (`src/main/compiler.ts`)

## Purpose

Wraps the bundled Tectonic binary. Handles:
- Locating the correct platform binary (dev vs. packaged).
- Verifying the binary exists and is executable before spawning.
- Cancelling any in-progress compilation before starting a new one.
- Spawning the child process with the right arguments.
- Streaming both stdout and stderr to the renderer for live log display.
- Reading the resulting PDF on successful compilation.

---

## Binary Resolution

```
getTectonicPath()
|
+- process.platform
|   +- win32  -> "tectonic.exe"
|   +- darwin -> "tectonic"
|   +- linux  -> "tectonic"
|
+- app.isPackaged?
|   +- false (dev)  -> <project-root>/resources/bin/<platform>/tectonic[.exe]
|   +- true  (prod) -> <process.resourcesPath>/bin/tectonic[.exe]
|
+- return absolute path
```

**Important:** On macOS and Linux, the binary must have execute permission
(`chmod +x`). The build script should ensure this. On macOS, the binary may need
to be ad-hoc signed or the app notarized to avoid Gatekeeper blocks.

---

## Compilation Cancellation

The module tracks the active child process in a module-level `activeProcess`
variable. Before each new compilation, `cancelCompilation()` kills any running
process. The `close` handler checks for a signal to distinguish cancellation
from normal exit:

- If `signal` is set (process was killed), the promise rejects with
  `"Compilation was cancelled"`.
- The renderer's auto-compile hook silently ignores cancellation errors so
  the user is not shown spurious error messages.

The `cancelCompilation()` function is also exported and registered as the
`latex:cancel` IPC handler in `ipc.ts`.

---

## Reference Implementation

```typescript
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { app, BrowserWindow } from 'electron'

const isDev = !app.isPackaged

let activeProcess: ChildProcess | null = null

export function cancelCompilation(): boolean {
  if (activeProcess) {
    activeProcess.kill()
    activeProcess = null
    return true
  }
  return false
}

function getTectonicPath(): string {
  const platform = process.platform
  const binName = platform === 'win32' ? 'tectonic.exe' : 'tectonic'

  const platformDir =
    platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux'

  const basePath = isDev
    ? path.join(__dirname, '../../resources/bin', platformDir)
    : path.join(process.resourcesPath!, 'bin')

  return path.join(basePath, binName)
}

export interface CompileResult {
  pdfBase64: string
}

export async function compileLatex(
  filePath: string,
  win: BrowserWindow
): Promise<CompileResult> {
  const binary = getTectonicPath()
  const workDir = path.dirname(filePath)

  // Verify binary exists
  try {
    await fs.access(binary, fs.constants.X_OK)
  } catch {
    throw new Error(
      `LaTeX engine not found at ${binary}. The application may need to be reinstalled.`
    )
  }

  // Kill any running compilation before starting a new one
  cancelCompilation()

  return new Promise((resolve, reject) => {
    const args = ['-X', 'compile', filePath]
    const child: ChildProcess = spawn(binary, args, { cwd: workDir })
    activeProcess = child

    let output = ''

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      win.webContents.send('latex:log', text)
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      win.webContents.send('latex:log', text)
    })

    child.on('error', (err) => {
      activeProcess = null
      reject(new Error(`Failed to start tectonic: ${err.message}`))
    })

    child.on('close', async (code, signal) => {
      activeProcess = null

      if (signal) {
        reject(new Error('Compilation was cancelled'))
        return
      }

      if (code === 0) {
        const pdfPath = filePath.replace(/\.tex$/, '.pdf')
        try {
          const pdfBuffer = await fs.readFile(pdfPath)
          resolve({ pdfBase64: pdfBuffer.toString('base64') })
        } catch {
          reject(new Error(`Compilation succeeded but PDF not found at ${pdfPath}`))
        }
      } else {
        reject(new Error(output || `tectonic exited with code ${code}`))
      }
    })
  })
}
```

---

## Tectonic CLI Quick Reference

| Command | Description |
|---|---|
| `tectonic -X compile file.tex` | Compile a .tex file to PDF |
| `tectonic --help` | Show help |
| `tectonic -X compile --keep-intermediates file.tex` | Keep .aux, .log, etc. |
| `tectonic -X compile --synctex file.tex` | Generate SyncTeX data (for inverse search) |

---

## Tectonic Cache

On first compile, Tectonic downloads LaTeX packages to a local cache:

| OS | Default cache location |
|---|---|
| Linux | `~/.cache/Tectonic/` |
| macOS | `~/Library/Caches/Tectonic/` |
| Windows | `%LOCALAPPDATA%\Tectonic\` |

The first compile of a document using common packages (article class, amsmath,
graphicx, etc.) downloads ~50-150 MB. Subsequent compiles are fully offline.

---

## Error Handling Strategy

1. **Invalid file path** -- `validateFilePath()` in `ipc.ts` rejects non-string,
   empty, or relative paths before `compileLatex()` is called.
2. **Binary not found** -- `fs.access` with `X_OK` flag checks existence and
   execute permission before spawn. Shows: "LaTeX engine not found at {path}.
   The application may need to be reinstalled."
3. **Spawn failure** -- Catch `error` event (e.g., permission denied on Unix).
4. **Non-zero exit** -- Surface combined stdout+stderr in the LogPanel. Common issues:
   - Undefined control sequence -> syntax error in .tex
   - Missing package -> Tectonic will auto-download if online
   - Font not found -> may need OS-level font installation
5. **PDF not generated** -- Even with exit code 0, verify the .pdf file exists
   before attempting to read it.
6. **Cancellation** -- When a new compile starts while one is running, the old
   process is killed. The signal-based rejection is caught and silently ignored
   by the auto-compile hook.

---

## Future Enhancements

- **SyncTeX support** -- Pass `--synctex` flag, parse the `.synctex.gz` output
  to enable click-to-jump between source and PDF.
- **Incremental compilation** -- Keep intermediates and only recompile changed
  files in multi-file projects.
