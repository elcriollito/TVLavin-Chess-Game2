import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/analyze-v2-shell.css', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../js/analyze-v2-shell.js', import.meta.url), 'utf8');

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
    assert.match(shell, /\.slice\(0, 3\)/);
    assert.doesNotMatch(shell, /setoption\s+name\s+MultiPV/i);
});

test('A1 assets are registered once after the legacy base styles', () => {
    assert.equal((html.match(/analyze-v2-shell\.css/g) || []).length, 1);
    assert.equal((html.match(/analyze-v2-shell\.js/g) || []).length, 1);
    assert.ok(html.indexOf('caissa-mobile-foundation.css') < html.indexOf('analyze-v2-shell.css'));
});
