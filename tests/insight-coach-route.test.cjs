const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const setup = source.slice(
    source.indexOf('let coachReportData = null;'),
    source.indexOf('// Show specific coach section')
);

function harness(profile = { games: [{}] }, fail = false) {
    const nodes = new Map();
    const events = [];
    let reports = 0;

    const node = id => {
        if (!nodes.has(id)) {
            nodes.set(id, {
                id,
                dataset: {},
                listeners: {},
                value: id === 'coachGameCount' ? '10' : 'both',
                querySelectorAll: () => [],
                addEventListener(type, fn) {
                    (this.listeners[type] ||= []).push(fn);
                },
                async fire(type, extra = {}) {
                    for (const fn of this.listeners[type] || []) {
                        await fn({
                            target: this,
                            preventDefault() {},
                            stopPropagation() {},
                            ...extra
                        });
                    }
                }
            });
        }
        return nodes.get(id);
    };

    node('coachModal').querySelectorAll = () => [node('close')];
    const context = vm.createContext({
        document: { getElementById: node },
        window: { addEventListener() {} },
        AbortController,
        insightProfile: profile,
        console: { log() {}, warn() {}, error() {} },
        hideModal: id => events.push(['hide', id]),
        showModal: id => events.push(['show', id]),
        showCoachSection: id => events.push(['section', id]),
        showErrorNotification: message => events.push(['error', message]),
        async generateCoachReport(count, color) {
            reports += 1;
            assert.equal(count, 10);
            assert.equal(color, 'both');
            if (fail) throw new Error('Engine unavailable');
        }
    });

    vm.runInContext(setup, context);
    return { context, node, events, reports: () => reports };
}

test('Coach initializes before deferred Play and opens configuration exactly once', async () => {
    assert.ok(source.indexOf('    setupCoachModal();') < source.indexOf("    ensurePlayInitialized('bootstrap');"));
    const h = harness();
    h.context.setupCoachModal();
    h.context.setupCoachModal();
    await h.node('insightCoachBtn').fire('click');
    assert.deepEqual(h.events, [
        ['hide', 'insightModal'],
        ['show', 'coachModal'],
        ['section', 'config']
    ]);
});

test('no imported games produces a visible error without opening Coach', async () => {
    const h = harness(null);
    h.context.setupCoachModal();
    await h.node('insightCoachBtn').fire('click');
    assert.deepEqual(h.events, [['error', 'Please analyze games in Caissa Insight first']]);
});

test('one explicit generate invokes report once then shows report', async () => {
    const h = harness();
    h.context.setupCoachModal();
    h.context.setupCoachModal();
    await h.node('coachGenerateBtn').fire('click');
    assert.equal(h.reports(), 1);
    assert.deepEqual(h.events, [['section', 'progress'], ['section', 'report']]);
});

test('generation failure shows error and returns to configuration', async () => {
    const h = harness(undefined, true);
    h.context.setupCoachModal();
    await h.node('coachGenerateBtn').fire('click');
    assert.deepEqual(h.events, [
        ['section', 'progress'],
        ['error', 'Failed to generate coach report: Engine unavailable'],
        ['section', 'config']
    ]);
});

test('Coach closes via X, backdrop and Escape independently of Play', async () => {
    const h = harness();
    h.context.setupCoachModal();
    h.context.setupCoachModal();
    await h.node('close').fire('click');
    await h.node('coachModal').fire('click');
    await h.node('coachModal').fire('keydown', { key: 'Escape' });
    assert.deepEqual(h.events, [
        ['hide', 'coachModal'],
        ['hide', 'coachModal'],
        ['hide', 'coachModal']
    ]);
});
