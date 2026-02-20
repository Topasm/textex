# Development

## Setup

```bash
# Install dependencies
npm install
```

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
npm run package:mac
npm run package:win
```

Requires Node.js 20+ and a Tectonic binary in `resources/bin/{linux,mac,win}/`. The Linux binary is included; see [PACKAGING.md](PACKAGING.md) for downloading Windows/macOS binaries.

## All Commands

```bash
# Development
npm run dev              # Start Electron with Vite HMR
npm run build            # Compile main/preload/renderer to out/

# Type Checking
npm run typecheck        # Run tsc --noEmit (all targets)

# Testing
npm run test             # Run Vitest (133 tests, 9 files)
npm run test:watch       # Run Vitest in watch mode

# Linting & Formatting
npm run lint             # Run ESLint on src/
npm run lint:fix         # Auto-fix ESLint issues
npm run format           # Format with Prettier
npm run format:check     # Check formatting without modifying

# Packaging
npm run package:linux    # Build + create AppImage
npm run package:mac      # Build + create DMG
npm run package:win      # Build + create NSIS installer

# CLI & MCP
npm run build:cli        # Compile CLI to out/cli/
npm run build:mcp        # Compile MCP server to out/mcp/
npm run mcp              # Start the MCP server (stdio transport)
```

## Check Suite

Run these commands before committing to catch issues early:

```bash
# 1. Type check
npm run typecheck

# 2. Lint
npm run lint

# 3. Format check (non-destructive)
npm run format:check

# 4. Tests
npm run test
```

Or as a single one-liner:

```bash
npm run typecheck && npm run lint && npm run format:check && npm run test
```
