# Development

## Setup

```bash
# Install the exact dependency graph from package-lock.json
npm ci
```

Use `npm install` only when intentionally changing dependencies or the lockfile.

## Running

```bash
# Start dev mode with hot reload
npm run dev
```

## Building

```bash
# Build for production
npm run build

# Package for your platform
npm run package:linux
npm run package:mac        # Apple Silicon by default
npm run package:win
```

Requires Node.js 22.13+ and a Tectonic binary in `resources/bin/{linux,mac,win}/`.
The macOS Apple Silicon binaries live in `resources/bin/mac/arm64/`; see
[PACKAGING.md](PACKAGING.md) for downloading or replacing platform binaries.

Bundled and generated open-source notice artifacts are kept in
`resources/licenses/` and are committed in the repository alongside the app.

## All Commands

```bash
# Development
npm run dev              # Start Electron with Vite HMR
npm run build            # Compile main/preload/renderer to out/

# Type Checking
npm run typecheck        # Run tsc --noEmit (all targets)

# Testing
npm run test             # Run the complete Vitest suite
npm run test:watch       # Run Vitest in watch mode

# Verification gates
npm run check            # Fast type/lint/format checks; skips tests
npm run pre-commit       # Full type/lint/format/test commit gate

# Linting & Formatting
npm run lint             # Run ESLint on src/
npm run lint:fix         # Auto-fix ESLint issues
npm run format           # Format with Prettier
npm run format:check     # Check formatting without modifying
npm run licenses:generate # Regenerate bundled third-party notice files

# Packaging
npm run package:linux    # Build + create AppImage
npm run package:mac      # Build + create Apple Silicon DMG
npm run package:mac:x64  # Build + create Intel DMG
npm run package:mac:universal # Build + create universal DMG
npm run package:win      # Build + create NSIS installer

# CLI & MCP
npm run build:cli        # Compile CLI to out/cli/
npm run build:mcp        # Compile MCP server to out/mcp/
npm run mcp              # Start the MCP server (stdio transport)
```

## License Notices

Run `npm run licenses:generate` after dependency or license changes, and before
packaging or release preparation if the bundled notice artifacts changed. This
refreshes `resources/licenses/THIRD-PARTY-NOTICES.txt` and the copied
Electron/Chromium notices file.

## Check Suite

Use the quick suite while iterating:

```bash
npm run check
```

Before every commit, run the full gate, which includes tests:

```bash
npm run pre-commit
```

Changes to versions, dependencies, native modules, sidecars, packaging, updater
metadata, or GitHub Actions must also follow the blocking steps in
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). In particular, validate a release
commit on `main` across Linux, Windows, and macOS universal before creating its
version tag.

## Maintainer Handoff

When another person will take over development or repository administration,
follow [HANDOFF.md](HANDOFF.md). It covers GitHub access, a clean local setup,
the first verification run, current release responsibilities, branch cleanup,
and safe removal of the previous maintainer's access.
