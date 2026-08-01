import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const modules = ['play-analytics-contracts.js', 'play-analytics-privacy-policy.js',
    'play-analytics-dispatcher.js', 'play-mode-selection-analytics.js', 'play-game-start-analytics.js',
    'play-completion-analytics.js', 'play-postgame-analytics.js', 'play-mentor-engagement-analytics.js',
    'play-analytics-governance.js'];
const sources = modules.map(file => [file, fs.readFileSync(`js/play/analytics/${file}`, 'utf8')]);

test('analytics modules own no network, persistence, cookies, resources, game, or user interface', () => {
    for (const [file, source] of sources) for (const pattern of [/fetch\s*\(/, /XMLHttpRequest/, /sendBeacon/,
        /WebSocket/, /localStorage|sessionStorage/, /document\.cookie/, /new\s+Worker/, /setTimeout|setInterval/,
        /requestAnimationFrame/, /createElement|innerHTML/, /\bApp\.(?:game|board)/, /FairPlayPolicy/])
        assert.doesNotMatch(source, pattern, file);
});

test('production registration is exact, ordered, unique, and test fixtures never register', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(page, 'utf8');
        for (const file of modules) assert.equal(html.match(new RegExp(file.replaceAll('.', '\\.'), 'g'))?.length, 1, `${page}:${file}`);
        assert(html.indexOf('play-analytics-contracts.js') < html.indexOf('play-route-controller.js'));
        assert(html.indexOf('play-mode-selection-analytics.js') > html.indexOf('play-lazy-loader.js'));
        assert.doesNotMatch(html, /play-analytics.*(?:fixture|test)/i);
    }
});

test('analytics change leaves protected architecture, dependencies, and lockfile untouched', () => {
    const changed = execFileSync('git', ['diff', '--name-only', '88223cb20fc4803fbc02237db44a2e4554eb6221'], { encoding: 'utf8' });
    for (const file of ['docs/architecture/PLAY_CURRENT_STATE_AUDIT.md', 'docs/architecture/CAISSA_SIMPLIFIED_PLAY_ARCHITECTURE.md',
        'docs/architecture/PLAY_MIGRATION_AND_COMPATIBILITY_PLAN.md', 'package-lock.json']) assert(!changed.includes(file), file);
    const baseline = JSON.parse(execFileSync('git', ['show', '88223cb20fc4803fbc02237db44a2e4554eb6221:package.json'], { encoding: 'utf8' }));
    const current = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    assert.deepEqual(current.dependencies, baseline.dependencies); assert.deepEqual(current.devDependencies, baseline.devDependencies);
});
