import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/analyze-v2-shell.css', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../js/analyze-v2-shell.js', import.meta.url), 'utf8');
const analyze = fs.readFileSync(new URL('../js/analyze-section.js', import.meta.url), 'utf8');
const registry = fs.readFileSync(new URL('../js/engine-registry.js', import.meta.url), 'utf8');
const adapter = fs.readFileSync(new URL('../js/engine-adapter.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const legacyShells = [
    'index.html',
    'play-v2.html',
    'play-v2-public-beta.html',
    'play-v2-promotion-qa.html',
    'play-v2-ipad-analyze-diagnostic.html',
    'yahoo-classic.html'
].map(file => ({ file, source: fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8') }));

test('A1 exposes one two-region Analyze V2 shell and one authoritative board host', () => {
    assert.equal((html.match(/data-caissa-analyze-v2(?:\s|>)/g) || []).length, 1);
    assert.equal((html.match(/class="analyze-main caissa-analyze-v2__stage"/g) || []).length, 1);
    assert.equal((html.match(/class="caissa-analyze-v2__workspace"/g) || []).length, 1);
    assert.equal((html.match(/id="analyzeChessboard"/g) || []).length, 1);
    assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) clamp\(390px, 31vw, 480px\)/);
});

test('A1 workspace has the approved tabs and compact bottom navigation', () => {
    for (const view of ['analysis', 'games', 'setup']) {
        assert.match(html, new RegExp(`data-analyze-v2-tab="${view}"`));
        assert.match(html, new RegExp(`data-analyze-v2-panel="${view}"`));
    }
    assert.match(html, /<footer class="caissa-analyze-v2__footer">/);
    for (const id of ['analyzeNavFirst', 'analyzeNavPrev', 'analyzeNavNext', 'analyzeNavLast']) {
        assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
    }
});

test('A1 preserves every existing AnalyzeSection DOM contract exactly once', () => {
    const ids = [
        'analyzeProvider', 'analyzeUsername', 'analyzeGameCount', 'analyzeFetchBtn',
        'analyzeFetchedGames', 'analyzePgnInput', 'analyzePgnFile', 'analyzePgnFileName',
        'analyzeLoadPgnBtn', 'analyzeOpenLibrary', 'analyzeGameSource', 'analyzeWhitePlayer',
        'analyzeBlackPlayer', 'analyzeGameResult', 'analyzeTermination', 'analyzeStatus',
        'analyzeStartBtn', 'analyzeStopBtn', 'analyzeProgressBar', 'analyzeProgressFill',
        'analyzeProgressText', 'analyzeMoveEvidence', 'analyzeEvalBar', 'analyzeEvalFill',
        'analyzeEvalScore', 'analyzeReviewSummary', 'analyzeCriticalMoments', 'analyzeMoveList',
        'analyzeEngineToggle', 'analyzeUndoMove', 'analyzeResetBoard', 'analyzeFlipBoard'
    ];
    for (const id of ids) {
        assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
    }
});

test('A1 shell is presentation-only and cannot create competing chess authorities', () => {
    for (const forbidden of [
        /new\s+Chess\s*\(/, /new\s+Worker\s*\(/, /analysisEngine\s*=/,
        /loadedGame\s*=/, /currentMoveIndex\s*=/, /moveHistory\s*=/,
        /localStorage|sessionStorage/, /fetch\s*\(/, /history\.(?:pushState|replaceState)/
    ]) assert.doesNotMatch(shell, forbidden);
    assert.doesNotMatch(css, /(^|\n)\s*(?:html|body|\.analyze-layout)\s*\{/);
});

test('A1.1 exposes only the minimal Analysis presentation while preserving hidden contracts', () => {
    const analysisPanel = html.slice(
        html.indexOf('id="analyzeV2PanelAnalysis"'),
        html.indexOf('id="analyzeV2PanelGames"')
    );
    for (const id of ['analyzeEngineToggle', 'analyzeV2EngineLines', 'analyzeV2OpeningLabel', 'analyzeMoveList']) {
        assert.equal((analysisPanel.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
    }
    assert.match(analysisPanel, /class="caissa-analyze-v2__preserved-controls" hidden/);
    assert.doesNotMatch(analysisPanel, /caissa-analyze-v2__(?:status-card|moves-card|game-card)/);
    assert.match(html, /class="caissa-analyze-v2__actions"/);
    for (const label of ['New', 'Save', 'Review']) assert.match(html, new RegExp(`<span>${label}</span>`));
    assert.match(shell, /\.slice\(0, 4\)/);
    assert.doesNotMatch(shell, /setoption\s+name\s+MultiPV/i);
});

test('A1.3 streams four attributed lines through the existing Analyze engine owner', () => {
    assert.match(analyze, /liveMultiPvCount:\s*4/);
    assert.match(analyze, /startInfiniteAnalysisAttributed\?\.\(fen,/);
    assert.match(analyze, /multiPv:\s*this\.liveMultiPvCount/);
    assert.match(analyze, /liveUiThrottleMs:\s*140/);
    assert.match(analyze, /liveEngineDebounceMs:\s*350/);
    assert.match(analyze, /},\s*this\.liveEngineDebounceMs\);/);
    assert.match(analyze, /generation !== this\.liveEngineGenerationId/);
    assert.match(analyze, /handleWorkspaceViewChange\(view\)/);
    assert.doesNotMatch(analyze, /analyzeLiveMultiPvPosition/);
    assert.doesNotMatch(analyze, /analysisEngine\s*=\s*new\s+/);
    assert.match(shell, /engine-line--\$\{isPrimary \? 'primary' : 'secondary'\}/);
    assert.match(css, /engine-line--primary[\s\S]*?margin-bottom:\s*9px/);
});

test('A1 assets are registered once after the legacy base styles', () => {
    assert.equal((html.match(/analyze-v2-shell\.css/g) || []).length, 1);
    assert.equal((html.match(/analyze-v2-shell\.js/g) || []).length, 1);
    assert.ok(html.indexOf('caissa-mobile-foundation.css') < html.indexOf('analyze-v2-shell.css'));
});

test('A1.4 isolates Analyze on the versioned Stockfish 18 provider', () => {
    assert.match(analyze, /createAnalyzeEngine\('stockfish-18-lite'/);
    assert.doesNotMatch(analyze, /createEngine\('stockfish'/);
    assert.match(registry, /stockfish-18-lite-single\.js/);
    assert.match(registry, /stockfish-18-lite-single\.wasm/);
    assert.match(registry, /name:\s*'Stockfish 18 Lite WASM'/);
    assert.match(registry, /expectedUci:/);
    assert.match(adapter, /ENGINE_IDENTITY_MISMATCH/);
    assert.match(server, /'\.wasm':\s*'application\/wasm'/);
});

test('A1.4 preserves the legacy worker and exposes only honest legacy labels to Arena', () => {
    assert.equal((registry.match(/workerPath:\s*'\/engine\/stockfish-working\.js'/g) || []).length, 2);
    assert.match(registry, /name:\s*'Stockfish 2019 MV'/);
    assert.doesNotMatch(registry, /name:\s*'Stockfish 16'/);
    assert.match(registry, /list\(\)\s*\{\s*return Object\.values\(ENGINES\)/);
    assert.match(registry, /getAnalyze\(id\)/);
    assert.match(html, /Stockfish 2019 MV \| Depth 0 \| Classical/);
    assert.doesNotMatch(html, /Stockfish 16 \| Depth 0 \| NNUE/);
});

test('A1.4 removes false Stockfish 16/17/NNUE labels from every legacy shell', () => {
    for (const { file, source } of legacyShells) {
        assert.doesNotMatch(source, /Stockfish (?:16|17)|Stockfish Lite|Depth 0 \| NNUE/, file);
        assert.match(source, /Stockfish 2019 MV/, file);
    }
});
