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

## Other Commands

```bash
# Lint
npm run lint

# Format
npm run format

# Test
npm run test
```
