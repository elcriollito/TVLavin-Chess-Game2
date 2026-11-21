import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/browser',
    testMatch: ['online-native.spec.js', 'online-arena.spec.js', 'online-access-denied.spec.js',
        'online-tournament-expansion.spec.js'],
    timeout: 30_000,
    expect: { timeout: 7_000 },
    workers: 1,
    reporter: 'line',
    use: { baseURL: 'http://127.0.0.1:8017', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    webServer: {
        command: 'node server.js',
        env: { ...process.env, PORT: '8017', NODE_ENV: 'test', CAISSA_ONLINE_ROLLOUT: 'preview', CAISSA_ONLINE_RATED: '1', CAISSA_ONLINE_TOURNAMENTS: '1', CAISSA_ONLINE_ARENA: '1' },
        url: 'http://127.0.0.1:8017/online',
        reuseExistingServer: false,
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
