import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 180_000,
  expect: { timeout: 5_000 },
  workers: 1,
  fullyParallel: false,
  reporter: 'line',
  use: { browserName: 'chromium', headless: true, baseURL: 'http://127.0.0.1:8791',
    trace: 'retain-on-failure' },
  webServer: {
    command: 'node server.mjs',
    url: 'http://127.0.0.1:8791/health',
    reuseExistingServer: false,
    timeout: 15_000,
    stdout: 'pipe', stderr: 'pipe'
  }
});
