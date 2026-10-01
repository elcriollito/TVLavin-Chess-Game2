import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const adapter = fs.readFileSync(new URL('../js/board/caissa-legacy-quiet-drag-adapter.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const boardView = fs.readFileSync(new URL('../js/fics-board-view.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/caissa-legacy-quiet-drag.css', import.meta.url), 'utf8');
const vendor = fs.readFileSync(new URL('../assets/vendor/chessboard.js/chessboard-1.0.0.min.js', import.meta.url), 'utf8');

test('legacy adapter is a shared presentation layer with no game or transport authority', () => {
    assert.match(adapter, /CaissaPointerController/);
    assert.match(adapter, /translate3d\(/);
    assert.match(adapter, /getBoardRect/);
    assert.match(adapter, /getCoalescedEvents|coalescedSamples|CaissaPointerController/);
    assert.doesNotMatch(adapter, /WebSocket|Style12|pendingMove|whiteClock|blackClock|gameNumber/);
    assert.doesNotMatch(adapter, /sendMove|fetch\(|XMLHttpRequest/);
});

test('FICS integration is gated to playable relation and delegates existing callbacks', () => {
    assert.match(client, /this\.gameActive === true/);
    assert.match(client, /this\.liveGame\?\.observedGame !== true/);
    assert.match(client, /Number\(this\.liveGame\?\.relation\) === 1/);
    assert.match(client, /onDragStart: config\.onDragStart/);
    assert.match(client, /onDrop: config\.onDrop/);
    assert.match(client, /onSnapEnd: config\.onSnapEnd/);
    assert.match(client, /quietDrag\?\.destroy\?\.\(\)/);
});

test('single-piece quiet presentation moves the original and keeps localhost-only comparison explicit', () => {
    assert.match(adapter, /drag\.node\.style\.transform/);
    assert.doesNotMatch(adapter, /cloneNode|append\(clone\)|visibility\s*=\s*['"]hidden/);
    assert.match(css, /caissa-legacy-quiet-drag-piece[^}]*filter:\s*none/s);
    assert.match(css, /caissa-legacy-quiet-drag-piece[^}]*transition:\s*none/s);
    assert.match(css, /caissa-legacy-quiet-drag-piece[^}]*animation:\s*none/s);
    assert.doesNotMatch(adapter, /\.style\.(?:left|top)\s*=/);
    assert.match(adapter, /LOCAL_HOSTS/);
    assert.match(adapter, /quiet-drag-lab/);
    assert.match(boardView, /caissa-legacy-quiet-drag-adapter\.js/);
    assert.doesNotMatch(index, /<script[^>]+caissa-legacy-quiet-drag-adapter/);
    assert.match(index, /caissa-legacy-quiet-drag\.css/);
});

test('Quiet mode owns input exclusively and commits drops without legacy animation', () => {
    assert.match(client, /detachLegacyInput\(\)/);
    assert.match(client, /onEnabledChange:\s*enabled\s*=>\s*enabled\s*\?\s*detachLegacyInput\(\)/);
    assert.match(client, /options\?\.caissaQuietDrag\s*!==\s*true/);
    assert.match(adapter, /startImmediately:\s*true/);
    assert.match(adapter, /caissaQuietDrag:\s*true/);
});

test('vendored Chessboard.js remains the pristine upstream artifact', () => {
    assert.equal(crypto.createHash('sha256').update(vendor).digest('hex'),
        '68d033595ff24f38a50534b0da8fa14a76b8c0f3b3e6b7d2636bfa26c47f6675');
    assert.match(vendor, /chessboard\.js v1\.0\.0/);
});
