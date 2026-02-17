# TextEx CLI

The CLI allowing headless compilation, project scaffolding, and export operations.

## Build

```bash
# Build the CLI
npm run build:cli
```

## Usage

```bash
# Compile a .tex file to PDF
textex compile paper.tex

# Compile with watch mode
textex compile paper.tex --watch

# Compile quietly (no log output)
textex compile paper.tex --quiet

# Output to a specific directory
textex compile paper.tex --output build/

# Scaffold a new project from a template
textex init article

# Export to another format
textex export paper.tex --format docx

# List available templates
textex templates
```

Note: You may need to link the command locally (e.g., `npm link`) or run it via `node out/cli/cli/index.js` if not installed globally.
