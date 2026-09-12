import { defineConfig } from '@playwright/test';

const port = Number(process.env.CAISSA_BOARD_TEST_PORT || 8175);

export default defineConfig({
    testDir: './tests/browser',
    timeout: 45_000,
    expect: { timeout: 8_000 },
    fullyParallel: false,
    workers: 1,
    reporter: 'line',
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        headless: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off'
    },
    webServer: {
        command: 'node tests/board/board-test-server.mjs',
        url: `http://127.0.0.1:${port}/tests/fixtures/caissa-board/index.html`,
        reuseExistingServer: false,
        timeout: 15_000,
        stdout: 'ignore',
        stderr: 'pipe'
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
        { name: 'webkit', use: { browserName: 'webkit' } }
    ]
});
