import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { prepareLesson } from '../js/mentor/mentor-lessons.js';
import { createMentorInsights } from '../js/mentor/mentor-insights.js';

function harness() {
    const html = fs.readFileSync(new URL('../mentor.html', import.meta.url), 'utf8');
    const nodes = new Map();
    function element(id = '') {
        const handlers = new Map(), attrs = {};
        return { id, attrs, handlers, dataset: {}, hidden: false, value: '', disabled: false, textContent: '',
            setAttribute(key, value) { attrs[key] = value; }, getAttribute(key) { return attrs[key]; },
            addEventListener(key, fn) { handlers.set(key, fn); }, fire(key, detail = {}) { handlers.get(key)?.({ preventDefault() {}, ...detail }); },
            append() {}, replaceChildren() {}, focus() {}, showModal() {}, close() {} };
    }
    for (const match of html.matchAll(/id="([^"]+)"/g)) nodes.set(match[1], element(match[1]));
    const tabs = [...html.matchAll(/<button id="(tab-[^"]+)"[^>]*aria-controls="([^"]+)"/g)].map(match => {
        const node = nodes.get(match[1]); node.attrs['aria-controls'] = match[2]; return node;
    });
    const input = element(), send = element(), authLink = element();
    const windowHandlers = new Map(), messages = [];
    let networkCalls = 0;
    const shell = { setContext() {}, open() {}, close() { messages.length = 0; },
        appendStudyMessage(message) { messages.push(message); return true; }, clearStudyMessages() { messages.length = 0; } };
    const window = { CAISSA_AUTH: { isLoaded: true, isSignedIn: true, userId: 'owner-one' },
        CaissaMentorFloatingShell: shell, addEventListener(key, fn) { windowHandlers.set(key, fn); },
        fetch() { networkCalls++; } };
    const document = { getElementById: id => nodes.get(id), createElement: () => element(),
        querySelectorAll: query => query === '[role=tab]' ? tabs : [],
        querySelector: query => query === '.sign-in' ? authLink : query.endsWith('textarea') ? input : send };
    const board = { setPosition() {}, clearSelection() {}, getMetrics() { return {}; } };
    const source = fs.readFileSync(new URL('../js/mentor/mentor-page.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
    vm.runInNewContext(source, { Chess, prepareLesson, createMentorInsights, create: () => board, document, window,
        localStorage: { getItem() { return null; }, setItem() {} } });
    return { nodes, tabs, input, send, messages, window, emit: (key, detail) => windowHandlers.get(key)({ detail }), networkCalls: () => networkCalls };
}
const summary = { ownerId: 'owner-one', status: 'completed', verified: true, source: 'chesscom', username: 'Alex', analysisId: 'analysis-10', completedGames: 10, themes: [{ theme: 'tactics', sampleGames: 4 }] };

test('four tabs preserve chat drafts and show an unread idea once on entering Chat without network', () => {
    const h = harness();
    assert.deepEqual(h.tabs.map(tab => tab.id), ['tab-chat', 'tab-learn', 'tab-openings', 'tab-account']);
    h.input.value = 'My draft'; h.nodes.get('tab-learn').fire('click');
    h.emit('caissa:account-analysis-completed', summary);
    assert.equal(h.nodes.get('chat-idea-indicator').hidden, false);
    assert.equal(h.messages.length, 0);
    h.nodes.get('tab-chat').fire('click');
    assert.equal(h.nodes.get('chat-idea-indicator').hidden, true);
    assert.match(h.messages[0], /10 Chess.com games/);
    assert.equal(h.input.value, 'My draft');
    h.nodes.get('tab-account').fire('click'); h.nodes.get('tab-chat').fire('click');
    h.emit('caissa:account-analysis-completed', summary);
    assert.equal(h.messages.length, 1);
    h.nodes.get('idea-plan').fire('click'); assert.equal(h.input.value, 'My draft');
    h.input.value = ''; h.nodes.get('idea-plan').fire('click'); assert.match(h.input.value, /training plan/);
    assert.equal(h.networkCalls(), 0);
});

test('saving usernames creates no idea; completed evidence in active Chat appears and clears on owner change', () => {
    const h = harness(); h.nodes.get('chesscom-user').value = 'Alex'; h.nodes.get('account-form').fire('submit');
    assert.equal(h.messages.length, 0); assert.equal(h.window.CaissaMentorPage.inspect().unreadIdea, false);
    h.emit('caissa:account-analysis-completed', summary); assert.equal(h.messages.length, 1);
    h.emit('caissa-auth-change', { isLoaded: true, isSignedIn: true, userId: 'owner-two' });
    assert.equal(h.messages.length, 0); assert.equal(h.nodes.get('idea-plan').hidden, true);
    h.emit('caissa:account-analysis-completed', summary); assert.equal(h.messages.length, 0);
});
