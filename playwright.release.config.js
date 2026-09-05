import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/release',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://www.caissa-chess.org',
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  }
});
