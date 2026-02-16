# NeuroTeX — Compiler Service (`src/main/compiler.ts`)

## Purpose

Wraps the bundled Tectonic binary. Handles:
- Locating the correct platform binary (dev vs. packaged).
- Spawning the child process with the right arguments.
- Streaming stderr to the renderer for live log display.
- Reading the resulting PDF on successful compilation.

---

## Binary Resolution

```
getTectonicPath()
│
├─ process.platform
│   ├─ win32  → "tectonic.exe"
│   ├─ darwin → "tectonic"
│   └─ linux  → "tectonic"
│
├─ app.isPackaged?
│   ├─ false (dev)  → <project-root>/resources/bin/<platform>/tectonic[.exe]
│   └─ true  (prod) → <process.resourcesPath>/bin/tectonic[.exe]
│
└─ return absolute path
```

**Important:** On macOS and Linux, the binary must have execute permission
(`chmod +x`). The build script should ensure this. On macOS, the binary may need
to be ad-hoc signed or the app notarized to avoid Gatekeeper blocks.

---

## Reference Implementation

```typescript
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { app, BrowserWindow } from 'electron';

const isDev = !app.isPackaged;

function getTectonicPath(): string {
  const platform = process.platform;
  const binName = platform === 'win32' ? 'tectonic.exe' : 'tectonic';

  const platformDir =
    platform === 'win32' ? 'win' :
    platform === 'darwin' ? 'mac' : 'linux';

  const basePath = isDev
    ? path.join(__dirname, '../../resources/bin', platformDir)
    : path.join(process.resourcesPath, 'bin');

  return path.join(basePath, binName);
}

export interface CompileResult {
  pdfBase64: string;
}

export async function compileLatex(
  filePath: string,
  win: BrowserWindow
): Promise<CompileResult> {
  const binary = getTectonicPath();
  const workDir = path.dirname(filePath);

  return new Promise((resolve, reject) => {
    const args = ['-X', 'compile', filePath];
    const child: ChildProcess = spawn(binary, args, { cwd: workDir });

    let stderr = '';

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      // Stream logs to renderer in real time
      win.webContents.send('latex:log', text);
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start tectonic: ${err.message}`));
    });

    child.on('close', async (code) => {
      if (code === 0) {
        const pdfPath = filePath.replace(/\.tex$/, '.pdf');
        try {
          const pdfBuffer = await fs.readFile(pdfPath);
          resolve({ pdfBase64: pdfBuffer.toString('base64') });
        } catch (err) {
          reject(new Error(`Compilation succeeded but PDF not found at ${pdfPath}`));
        }
      } else {
        reject(new Error(stderr || `tectonic exited with code ${code}`));
      }
    });
  });
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
graphicx, etc.) downloads ~50–150 MB. Subsequent compiles are fully offline.

---

## Error Handling Strategy

1. **Binary not found** — Check path exists before spawn. Show user-friendly
   error: "LaTeX engine not found. The application may be corrupted."
2. **Spawn failure** — Catch `error` event (e.g., permission denied on Unix).
3. **Non-zero exit** — Surface stderr in the LogPanel. Common issues:
   - Undefined control sequence → syntax error in .tex
   - Missing package → Tectonic will auto-download if online
   - Font not found → may need OS-level font installation
4. **PDF not generated** — Even with exit code 0, verify the .pdf file exists
   before attempting to read it.

---

## Future Enhancements

- **SyncTeX support** — Pass `--synctex` flag, parse the `.synctex.gz` output
  to enable click-to-jump between source and PDF.
- **Compilation queue** — If the user triggers a new compile while one is
  running, kill the old process and start fresh.
- **Incremental compilation** — Keep intermediates and only recompile changed
  files in multi-file projects.
