import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'path'

const packageVersion = (
  JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }
).version

// These suites have no browser state or renderer setup requirements.
const nodeTests = [
  'src/__tests__/shared/!(learnCatalog).test.ts',
  'src/__tests__/tauri/**/*.test.ts',
  'src/__tests__/renderer/{designTokens,flatUi,shellStyles,responsiveLayout,monacoFeatureSelection}.test.ts'
]

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion)
  },
  plugins: [react()],
  test: {
    root: resolve(__dirname),
    globals: true,
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: nodeTests }
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          setupFiles: ['./src/__tests__/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, ...nodeTests]
        }
      }
    ]
  }
})
