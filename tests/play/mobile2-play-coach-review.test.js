import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const read = file => fs.readFileSync(`${process.cwd()}/${file}`, 'utf8');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(`${process.cwd()}/${file}`)).digest('hex');

test('M2-003H Coach presentation assets remain byte-identical to production', () => {
    const expected = new Map([
        ['css/play-coach-review.css', 'b0599f107dec3cecbec9d6cdaa83763eb3fad9b321022f7dff82bb015b593059'],
        ['js/play/native-coach/coach-panel.js', 'c53ffe3395fa27b0463cb4173797e46771d7f63161406b21f4e40d48829f4bcc'],
        ['js/play/native-coach/coach-game-over-presentation.js', '6eee3135d10502a7fce3f38a77a44d4b79fddc1bf0d7737fd09715c1b81a19e1'],
        ['js/play/native-coach/coach-review-presentation.js', '3b18ad117d431ff0ef14e8e840060361e7f8e4ba1d101ed3b6297bce66d79ea0']
    ]);
    for (const [file, digest] of expected) assert.equal(sha256(file), digest, file);
});

test('M2-003C Play and Bots reuse one canonical review navigation block and move no renderer owner', () => {
    const games = read('js/play/bots/bots-guided-review-presentation.js');
    const shell = read('js/play/simplified-play-shell.js');
    assert.match(games, /destination\.append\(mounted\.ui\.navigation\)/);
    assert.match(games, /ui\.navigation\.addEventListener\('click'/);
    assert.doesNotMatch(games, /new\s+(?:Worker|Chessboard|CaissaPersistentRenderer)/);
    assert.doesNotMatch(shell, /replaceChildren\([^)]*(?:chessboard|caissa-board)/i);
});

test('M2-003H excludes the unapproved Coach first-paint experiment', () => {
    const html = read('index.html');
    assert.equal(fs.existsSync(`${process.cwd()}/js/play/mobile-initial-paint.js`), false);
    assert.doesNotMatch(html, /mobile-initial-paint\.js|caissa-initial-phone-coach/);
    assert.doesNotMatch(read('css/play-simplified-shell.css'), /caissa-initial-phone-coach/);
    assert.doesNotMatch(read('js/play/simplified-play-shell.js'), /caissa-initial-phone-coach/);
});

test('M2-003C phone square cells opt out of the global 44px control minimum', () => {
    const css = read('css/play-simplified-shell.css');
    assert.match(css, /\.caissa-play-persistent-board \.caissa-board__square\.square-55d63[\s\S]*min-width: 0 !important;[\s\S]*min-height: 0 !important;/);
    assert.match(css, /\[data-mobile-review-navigation\][\s\S]*repeat\(4/);
});

test('M2-003H gates Mobile 2.0 layout mechanics to Play and Bots', () => {
    const shell = read('js/play/simplified-play-shell.js');
    const css = read('css/play-simplified-shell.css');
    assert.match(shell, /isMobile2ReleaseMode = mode => mode === 'games' \|\| mode === 'bots'/);
    assert.match(shell, /mobile2Release = isMobile2ReleaseMode\(mode\) \? 'approved' : 'hold'/);
    assert.match(shell, /phone = isMobile2ReleaseMode\(this\.#mode\) && isPhoneLayout/);
    assert.doesNotMatch(shell, /ResizeObserver|scheduleLayout|caissa-initial-phone-coach/);
    assert.doesNotMatch(css, /caissa-initial-phone-coach/);
});

test('M2-003H excludes the unapproved Coach CTA clearance patch', () => {
    assert.equal(sha256('css/play-coach-review.css'),
        'b0599f107dec3cecbec9d6cdaa83763eb3fad9b321022f7dff82bb015b593059');
    assert.doesNotMatch(read('css/play-coach-review.css'),
        /padding-bottom:\s*calc\(44px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});

test('M2-003H hides the visual phone Play/Bots heading and keeps Coach on hold', () => {
    const css = read('css/play-simplified-shell.css');
    const shell = read('js/play/simplified-play-shell.js');
    const registry = read('js/play/performance/play-load-registry.js');
    assert.match(css, /\[data-mobile2-release="approved"\]\[data-layout\^="phone-"\][\s\S]*\.caissa-simplified-shell__preview[\s\S]*position:\s*absolute !important;[\s\S]*clip-path:\s*inset\(50%\)/);
    assert.doesNotMatch(css, /\.caissa-simplified-shell__purpose\s*\{[^}]*display:\s*none/s);
    assert.match(shell, /mobile2Release = isMobile2ReleaseMode\(mode\) \? 'approved' : 'hold'/);
    assert.match(registry, /play-coach-review\.css\?v=1\.7\.0/);
    assert.match(registry, /coach-review-presentation\.js\?v=1\.7\.0/);
    assert.match(registry, /native-coach\/coach-panel\.js\?v=2\.7\.0/);
});
