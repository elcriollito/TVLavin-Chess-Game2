import test from 'node:test';
import assert from 'node:assert/strict';
import { mountEndgameTrainerPage, unmountEndgameTrainerPage, getEndgameTrainerPageState } from '../../js/endgame-trainer/endgame-trainer-page.js';

class Classes { constructor() { this.values = new Set(); } toggle(v, on) { on === undefined ? (this.values.has(v) ? this.values.delete(v) : this.values.add(v)) : on ? this.values.add(v) : this.values.delete(v); } remove(v) { this.values.delete(v); } contains(v) { return this.values.has(v); } }
class Element extends EventTarget { constructor(key = '') { super(); this.dataset = key ? { navKey: key } : {}; this.classList = new Classes(); this.attrs = {}; this.value = key; this.textContent = ''; this.focused = 0; } setAttribute(k, v) { this.attrs[k] = String(v); } removeAttribute(k) { delete this.attrs[k]; } focus() { this.focused++; } contains(target) { return target === this; } querySelector() { return this.link; } }
function fixture(search = '') {
    const toggle = new Element(), nav = new Element(), state = new Element(), preview = new Element(), cta = new Element(); nav.link = new Element();
    const items = ['play', 'endgame-trainer', 'academy'].map(k => new Element(k)); const controls = [new Element('White')];
    const root = { dataset: {}, classList: new Classes(), querySelector(s) { return ({ '[data-mobile-nav]': nav, '[data-mobile-nav-toggle]': toggle, '[data-diagnostic-state]': state, '[data-preview-message]': preview, '[data-preview-cta]': cta })[s] ?? null; }, querySelectorAll(s) { return s === '[data-nav-key]' ? items : s === '[data-preview-option]' ? controls : []; } };
    const doc = new EventTarget(); doc.querySelector = () => root; const win = new EventTarget(); win.location = { search }; win.innerWidth = 390;
    return { root, doc, win, toggle, nav, state, preview, cta, items, controls };
}
function mount(search = '') { unmountEndgameTrainerPage(); const f = fixture(search); mountEndgameTrainerPage({ root: f.root, document: f.doc, window: f.win }); return f; }
const click = el => el.dispatchEvent(new Event('click'));
const escape = doc => { const event = new Event('keydown'); Object.defineProperty(event, 'key', { value: 'Escape' }); doc.dispatchEvent(event); };

test('1 invalid root', () => assert.throws(() => mountEndgameTrainerPage({ root: {}, document: {}, window: {} }), /invalid-root/));
test('2 mount success', () => { mount(); assert.equal(getEndgameTrainerPageState().mounted, true); });
test('3 mount twice', () => { const f = mount(); assert.deepEqual(mountEndgameTrainerPage({ root: f.root, document: f.doc, window: f.win }), getEndgameTrainerPageState()); });
test('4 active nav item', () => { const f = mount(); assert.ok(f.items[1].classList.contains('is-active')); });
test('5 only one aria-current', () => { const f = mount(); assert.equal(f.items.filter(x => x.attrs['aria-current'] === 'page').length, 1); });
for (const [n, state] of [[6, 'empty'], [7, 'loading'], [8, 'error'], [9, 'completed']]) test(`${n} diagnostic ${state}`, () => { const f = mount(`?state=${state}`); assert.equal(f.root.dataset.state, state); });
test('10 invalid diagnostic state fallback', () => { const f = mount('?state=bad'); assert.equal(f.root.dataset.state, 'empty'); });
test('11 mobile nav open', () => { const f = mount(); click(f.toggle); assert.equal(getEndgameTrainerPageState().navOpen, true); });
test('12 mobile nav close', () => { const f = mount(); click(f.toggle); click(f.toggle); assert.equal(getEndgameTrainerPageState().navOpen, false); });
test('13 Escape close', () => { const f = mount(); click(f.toggle); escape(f.doc); assert.equal(getEndgameTrainerPageState().navOpen, false); });
test('14 click outside close', () => { const f = mount(); click(f.toggle); f.doc.dispatchEvent(new Event('click')); assert.equal(getEndgameTrainerPageState().navOpen, false); });
test('15 aria-expanded', () => { const f = mount(); click(f.toggle); assert.equal(f.toggle.attrs['aria-expanded'], 'true'); });
test('16 focus return', () => { const f = mount(); click(f.toggle); escape(f.doc); assert.equal(f.toggle.focused, 1); });
test('17 preview option state', () => { const f = mount(); f.controls[0].dispatchEvent(new Event('change')); assert.equal(getEndgameTrainerPageState().previewSelection, 'White'); });
test('18 CTA preview message', () => { const f = mount(); click(f.cta); assert.equal(f.preview.textContent, 'Runtime integration coming next.'); });
test('19 controls disabled contract is static markup concern', () => { const f = mount(); assert.equal(f.controls.length, 1); });
test('20 unmount', () => { mount(); assert.equal(unmountEndgameTrainerPage(), true); });
test('21 unmount idempotent', () => { mount(); unmountEndgameTrainerPage(); assert.equal(unmountEndgameTrainerPage(), false); });
test('22 remount no duplicate listeners', () => { const f = mount(); unmountEndgameTrainerPage(); mountEndgameTrainerPage({ root: f.root, document: f.doc, window: f.win }); click(f.toggle); assert.equal(getEndgameTrainerPageState().navOpen, true); });
test('23 snapshot immutable', () => { mount(); const s = getEndgameTrainerPageState(); s.mounted = false; assert.equal(getEndgameTrainerPageState().mounted, true); });
test('24 no runtime imports', async () => { const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../../js/endgame-trainer/endgame-trainer-page.js', import.meta.url), 'utf8')); assert.doesNotMatch(source, /endgame-trainer-runtime|SafeEngineAdapter|Worker/); });
test('25 root-scoped product queries', async () => { const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../../js/endgame-trainer/endgame-trainer-page.js', import.meta.url), 'utf8')); assert.equal((source.match(/doc\?\.querySelector/g) ?? []).length, 1); });
test('26 metadata and canonical contract', async () => { const html = await import('node:fs/promises').then(fs => fs.readFile(new URL('../../endgame-trainer.html', import.meta.url), 'utf8')); assert.match(html, /<link rel="canonical" href="https:\/\/www\.caissa-chess\.org\/endgame-trainer">/); assert.equal((html.match(/<title>/g) ?? []).length, 1); });
test('27 complete standalone links', async () => { const html = await import('node:fs/promises').then(fs => fs.readFile(new URL('../../endgame-trainer.html', import.meta.url), 'utf8')); for (const label of ['Mentor','Insights','Spectator TV','Cheater Insight','Polyglot Tool','Opening Database','ECO Codes','Game Library','History','DOS Chess','Vault','Blog','Help Videos','Contact / Feedback','Settings']) assert.match(html, new RegExp(`>${label}<`)); });
test('28 assets are root-relative', async () => { const html = await import('node:fs/promises').then(fs => fs.readFile(new URL('../../endgame-trainer.html', import.meta.url), 'utf8')); assert.match(html, /href="\/css\/endgame-trainer\.css"/); assert.match(html, /src="\/js\/endgame-trainer\/endgame-trainer-page\.js"/); });
test('29 auth uses real sign-in destination', async () => { const html = await import('node:fs/promises').then(fs => fs.readFile(new URL('../../endgame-trainer.html', import.meta.url), 'utf8')); assert.match(html, /class="endgame-trainer-page__auth" href="\/signin"/); });
test('30 resize to desktop closes mobile nav', () => { const f = mount(); click(f.toggle); f.win.innerWidth = 1024; f.win.dispatchEvent(new Event('resize')); assert.equal(getEndgameTrainerPageState().navOpen, false); });
