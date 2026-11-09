import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.js',
  // Tests share one database and some of them create data: run them one after another.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1280, height: 720 },
    storageState: '.auth/state.json',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // E2E_VIDEO=1 records every test to e2e/test-results/**/video.webm
    video: process.env.E2E_VIDEO ? 'on' : 'off',
  },
})
