import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const analyze = fs.readFileSync(new URL('../js/analyze-section.js', import.meta.url), 'utf8');
const registry = fs.readFileSync(new URL('../js/play/performance/play-load-registry.js', import.meta.url), 'utf8');
const gamesPanel = html.slice(html.indexOf('id="analyzeV2PanelGames"'), html.indexOf('id="analyzeV2PanelSetup"'));

test('A3 Games presents Game URL, Chess.com, and Lichess as separate mental models', () => {
    for (const source of ['game-url', 'chess.com', 'lichess']) {
        assert.equal((gamesPanel.match(new RegExp(`data-source="${source}"`, 'g')) || []).length, 1);
    }
    assert.match(gamesPanel, /data-source="game-url"[^>]*class=|class="analyze-tab active"[^>]*data-source="game-url"/);
    assert.match(gamesPanel, /id="analyzeGameUrl" type="url"/);
    assert.match(gamesPanel, /id="analyzeGameUrlMessage"[^>]*role="status"[^>]*aria-live="polite"/);
    assert.match(gamesPanel, /id="analyzeGameUrlLoad"/);
    assert.doesNotMatch(gamesPanel, /<textarea|PGN Paste|data-source="pgn"|data-source="online"|My Games/);
});

test('A3 keeps independent account-history forms while sharing fetchOnlineGames', () => {
    for (const id of [
        'analyzeUsername', 'analyzeGameCount', 'analyzeFetchBtn', 'analyzeFetchedGames',
        'analyzeLichessUsername', 'analyzeLichessGameCount', 'analyzeLichessFetchBtn', 'analyzeLichessFetchedGames'
    ]) assert.equal((gamesPanel.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
    assert.equal((analyze.match(/async fetchOnlineGames\(/g) || []).length, 1);
    assert.match(analyze, /fetchOnlineGames\('chess\.com'\)/);
    assert.match(analyze, /fetchOnlineGames\('lichess'\)/);
    assert.match(analyze, /getAccountImportContext\(provider\)/);
});

test('A3 converges URL and account imports on the existing PGN/session pipeline', () => {
    assert.match(analyze, /importGameUrl\(\)[\s\S]*?this\.loadGameFromPgn\(resolved\.pgn, resolved\.source/);
    assert.match(analyze, /selectFetchedGame\(index\)[\s\S]*?this\.loadGameFromPgn\(game\.pgn, game\.source, game\)/);
    assert.match(analyze, /loadGameFromPgn\(pgn, source, metadata = \{\}\)[\s\S]*?CaissaAnalyzeSession\?\.createSession/);
    assert.match(analyze, /const loadedGame = \{[\s\S]*?this\.session = session;[\s\S]*?this\.loadedGame = loadedGame;/);
    assert.doesNotMatch(analyze, /importGameUrl\(\)[\s\S]{0,2400}new\s+(?:Chess|Worker)/);
});

test('A3 lazy-loads the isolated importer before AnalyzeSection', () => {
    assert.equal((registry.match(/js\/analyze-game-import\.js\?v=1\.0\.0/g) || []).length, 2);
    for (const branch of registry.match(/sources:\s*Object\.freeze\([^]*?\]\)/g) || []) {
        if (!branch.includes('analyze-section.js')) continue;
        assert.ok(branch.indexOf('analyze-game-import.js') < branch.indexOf('analyze-section.js'));
    }
});

test('A3 validates Chess.com archive URLs before provider-result fetching', () => {
    assert.match(analyze, /getTrustedChessComArchiveUrl\(archiveUrl, username\)/);
    assert.match(analyze, /url\.hostname !== 'api\.chess\.com'/);
    assert.doesNotMatch(analyze, /fetch\(archiveUrl/);
});

