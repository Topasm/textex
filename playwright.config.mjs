import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '*.spec.mjs',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5193', trace: 'retain-on-failure' },
  webServer: {
    command:
      'npx vite build --config tests/browser/vite.config.mjs && npx vite preview --config tests/browser/vite.config.mjs',
    url: 'http://127.0.0.1:5193',
    reuseExistingServer: false
  }
})
