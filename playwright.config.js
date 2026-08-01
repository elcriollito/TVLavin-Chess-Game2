import { defineConfig } from '@playwright/test';

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
    testDir: './tests/browser',
    timeout: 45_000,
    expect: { timeout: 8_000 },
    fullyParallel: false,
    workers: 1,
    reporter: 'line',
    use: {
        baseURL: externalBaseUrl || 'http://127.0.0.1:8000',
        headless: true,
        trace: 'off',
        screenshot: 'off',
        video: 'off'
    },
    webServer: externalBaseUrl ? undefined : {
        command: 'node server.js',
        env: { ...process.env, CAISSA_PLAY_V2_BETA_STAGE: 'internal' },
        url: 'http://127.0.0.1:8000/endgame-trainer',
        reuseExistingServer: true,
        timeout: 30_000,
        stdout: 'ignore',
        stderr: 'pipe'
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
        { name: 'firefox', use: { browserName: 'firefox' } },
        { name: 'webkit', use: { browserName: 'webkit' } }
    ]
});
