import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

test('Yahoo Classic reuses the canonical legacy Quiet Drag adapter', () => {
    const html = read('yahoo-classic.html');
    const source = read('js/yahoo-classic-section.js');
    const adapter = read('js/board/caissa-legacy-quiet-drag-adapter.js');

    assert.equal((html.match(/caissa-legacy-quiet-drag\.css/g) || []).length, 1);
    assert.match(source, /LEGACY_QUIET_DRAG_URL\s*=\s*'\/js\/board\/caissa-legacy-quiet-drag-adapter\.js'/);
    assert.match(source, /import\(LEGACY_QUIET_DRAG_URL\)/);
    assert.match(source, /module\.create\(container, quietDragOptions\)/);
    assert.doesNotMatch(source, /class\s+CaissaYahooQuietDrag/);
    assert.match(adapter, /onTap:\s*square\s*=>\s*this\.#options\.onTap/);
});

test('Yahoo Classic disables the vendor loop and keeps drop semantics in FICS', () => {
    const source = read('js/yahoo-classic-section.js');
    assert.match(source, /detachLegacyInput\(\);[\s\S]*import\(LEGACY_QUIET_DRAG_URL\)/);
    assert.match(source, /onDrop:\s*config\.onDrop/);
    assert.match(source, /client\.onDrop\(source, target, options\)/);
    assert.match(source, /options\?\.caissaQuietDrag\s*!==\s*true/);
    assert.match(source, /this\.board\?\.position\?\.\(fen, false\)/);
    assert.match(source, /client\?\.handleBoardTap/);
    assert.match(source, /client\?\.completePromotionSelection/);
});

test('Yahoo board lifecycle owns teardown and the audit records the required pipeline', () => {
    const source = read('js/yahoo-classic-section.js');
    const audit = read('docs/standards/CAISSA_QUIET_DRAG_PHASE_2B_YAHOO_AUDIT.md');
    assert.match(source, /onExit\(\)[\s\S]*this\.destroyClassicBoard\(\)/);
    assert.match(source, /closeTable\(sendUnobserve = true\)[\s\S]*this\.destroyClassicBoard\(\)/);
    assert.match(source, /quietDrag\?\.destroy\?\.\(\)/);
    assert.match(source, /cancelAnimationFrame\(this\.boardResizeFrame\)/);
    for (const heading of ['YAHOO DRAG PIPELINE', 'DROP OWNER', 'BOARD LIFECYCLE', 'ROOM DIFFERENCES']) {
        assert.match(audit, new RegExp(`## ${heading}`));
    }
    assert.match(audit, /08dfb3bd113ee58ed117996f02cbb591e4d69a1a/);
    assert.match(audit, /24dc9c4/);
});
