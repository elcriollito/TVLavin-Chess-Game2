import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const read = file => fs.readFileSync(`${process.cwd()}/${file}`, 'utf8');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(`${process.cwd()}/${file}`)).digest('hex');

test('Coach phase-shell integration leaves the game-over domain owner byte-identical', () => {
    const expected = new Map([
        ['js/play/native-coach/coach-game-over-presentation.js', '6eee3135d10502a7fce3f38a77a44d4b79fddc1bf0d7737fd09715c1b81a19e1']
    ]);
    for (const [file, digest] of expected) assert.equal(sha256(file), digest, file);
});

test('COACH-C1R gives Play, Bots, and Coach one shared review-navigation placement owner', () => {
    const games = read('js/play/bots/bots-guided-review-presentation.js');
    const coach = read('js/play/native-coach/coach-review-presentation.js');
    const shell = read('js/play/simplified-play-shell.js');
    assert.equal((shell.match(/placeReviewNavigation\(options = \{\}\)/g) || []).length, 1);
    assert.equal((shell.match(/destination\.append\(navigation\)/g) || []).length, 1);
    assert.match(games, /shell\?\.placeReviewNavigation\?\.\(\{ navigation: mounted\.ui\.navigation/);
    assert.match(coach, /shell\?\.placeReviewNavigation\?\.\(\{ navigation: mounted\.navigation\.node/);
    assert.match(coach, /navigation: mounted\.guided\.explorationNavigation/);
    assert.match(games, /ui\.navigation\.addEventListener\('click'/);
    assert.match(coach, /guided\.explorationNavigation\.addEventListener\('click'/);
    assert.doesNotMatch(coach, /cloneNode|new\s+(?:Worker|Chessboard|CaissaPersistentRenderer)/);
    assert.doesNotMatch(games, /new\s+(?:Worker|Chessboard|CaissaPersistentRenderer)/);
    assert.doesNotMatch(shell, /replaceChildren\([^)]*(?:chessboard|caissa-board)/i);
});

test('COACH-C1 marks phone Coach before first paint and hands off to runtime composition', () => {
    const html = read('index.html');
    assert.equal(fs.existsSync(`${process.cwd()}/js/play/mobile-initial-paint.js`), true);
    assert.match(html, /<meta name="viewport"[^>]*>\s*<script src="js\/play\/mobile-initial-paint\.js\?v=1\.0\.0"><\/script>/);
    assert.match(read('js/play/mobile-initial-paint.js'), /caissa-initial-phone-coach/);
    assert.match(read('css/play-simplified-shell.css'), /html\.caissa-initial-phone-coach/);
    assert.match(read('js/play/simplified-play-shell.js'), /classList\.remove\('caissa-initial-phone-coach'\)/);
});

test('M2-003C phone square cells opt out of the global 44px control minimum', () => {
    const css = read('css/play-simplified-shell.css');
    assert.match(css, /\.caissa-play-persistent-board \.caissa-board__square\.square-55d63[\s\S]*min-width: 0 !important;[\s\S]*min-height: 0 !important;/);
    assert.match(css, /\[data-mobile-review-navigation\][\s\S]*repeat\(4/);
});

test('Coach phone composition implements the approved hybrid production contract', () => {
    const shell = read('js/play/simplified-play-shell.js');
    const panel = read('js/play/native-coach/coach-panel.js');
    const css = read('css/play-coach-review.css');
    assert.match(shell, /isMobile2ReleaseMode = mode => mode === 'games' \|\| mode === 'bots' \|\| mode === 'coach'/);
    assert.match(shell, /usesMobileComposition = mode => isMobile2ReleaseMode\(mode\) \|\| mode === 'coach'/);
    assert.match(shell, /mobile2Release = isMobile2ReleaseMode\(mode\) \? 'approved' : 'hold'/);
    assert.match(shell, /phone = usesMobileComposition\(this\.#mode\) && isPhoneLayout/);
    assert.match(panel, /shell\.dataset\.scrollOwner = this\.#mobilePhaseShell \? 'document' : 'coach-body'/);
    assert.match(shell, /data-caissa-phase-action-slot/);
    assert.match(shell, /data-caissa-coach-foot-wrap/);
    assert.match(panel, /data-caissa-coach-head-wrap/);
    assert.match(panel, /data-caissa-coach-body-wrap/);
    assert.match(panel, /setMobilePhaseShell/);
    assert.match(css, /data-mode="coach"\]\[data-layout\^="phone-"\]/);
    assert.match(css, /#mainContent\.content-area[\s\S]*overflow-y:\s*auto !important/);
    assert.match(css, /native-coach-panel__phase[\s\S]*overflow-y:\s*visible/);
    assert.doesNotMatch(shell, /ResizeObserver|scheduleLayout/);
});

test('Coach phone uses one natural page scroller with only the mode FOOT fixed', () => {
    const css = read('css/play-coach-review.css');
    assert.match(css, /grid-template-areas:\s*"board" "context"/);
    assert.match(css, /grid-template-rows:\s*auto auto/);
    assert.match(css, /data-caissa-coach-foot-wrap[\s\S]*position:\s*fixed/);
    assert.match(css, /padding-bottom:\s*calc\(76px \+ env\(safe-area-inset-bottom/);
    assert.doesNotMatch(css, /coach-mobile-head-size/);
    assert.match(css, /min-height:\s*44px/);
});

test('M2-003H hides the visual phone heading for approved Play, Bots, and Coach', () => {
    const css = read('css/play-simplified-shell.css');
    const shell = read('js/play/simplified-play-shell.js');
    const registry = read('js/play/performance/play-load-registry.js');
    assert.match(css, /\[data-mobile2-release="approved"\]\[data-layout\^="phone-"\][\s\S]*\.caissa-simplified-shell__preview[\s\S]*position:\s*absolute !important;[\s\S]*clip-path:\s*inset\(50%\)/);
    assert.doesNotMatch(css, /\.caissa-simplified-shell__purpose\s*\{[^}]*display:\s*none/s);
    assert.match(shell, /mobile2Release = isMobile2ReleaseMode\(mode\) \? 'approved' : 'hold'/);
    assert.match(registry, /play-coach-review\.css\?v=1\.13\.0/);
    assert.match(registry, /coach-review-exploration\.js\?v=1\.2\.0/);
    assert.match(registry, /coach-review-presentation\.js\?v=1\.16\.2/);
    assert.match(registry, /native-coach\/coach-panel\.js\?v=2\.8\.2/);
});
