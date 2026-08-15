import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { auditHttpsExternalScripts, findHttpsExternalScriptTags } from '../scripts/supply-chain-script-tags.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clerk = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js';

const urls = source => findHttpsExternalScriptTags(source).map(item => item.url);

test('iframe sources never become external scripts', () => {
    for (const source of [
        '<iframe src="https://fritz.chessbase.com"></iframe>',
        '<iframe src="https://play.chessbase.com/en/Play"></iframe>',
        '<iframe\n title="Play"\n src="https://fritz.chessbase.com"\n></iframe>'
    ]) assert.deepEqual(urls(source), []);
});

test('script tags cannot borrow src from a later iframe', () => {
    for (const source of [
        '<script></script><iframe src="https://fritz.chessbase.com"></iframe>',
        '<script type="module"></script>\n<iframe src="https://play.chessbase.com/en/Play"></iframe>'
    ]) assert.deepEqual(urls(source), []);
});

test('same-tag external scripts are detected across supported layouts', () => {
    const cases = [
        '<script src="https://evil.example/runtime.js"></script>',
        '<script defer src = \'https://evil.example/defer.js\' crossorigin="anonymous"></script>',
        '<script\n integrity="sha384-example"\n src="https://evil.example/multiline.js"\n></script>'
    ];
    assert.deepEqual(cases.map(source => urls(source)[0]), [
        'https://evil.example/runtime.js',
        'https://evil.example/defer.js',
        'https://evil.example/multiline.js'
    ]);
});

test('registered script remains discoverable with its complete tag for SRI enforcement', () => {
    const [entry] = findHttpsExternalScriptTags(`<script crossorigin="anonymous" src="${clerk}" integrity="sha384-example"></script>`);
    assert.equal(entry.url, clerk);
    assert.match(entry.tag, /integrity="sha384-example"/);
    assert.match(entry.tag, /crossorigin="anonymous"/);
});

test('unregistered scripts fail while the registered script remains SRI-governed', () => {
    const options = { relative: 'fixture.html', allowedUrl: clerk, requiredIntegrity: 'sha384-required' };
    assert.deepEqual(auditHttpsExternalScripts('<script src="https://evil.example/app.js"></script>', options), [
        'fixture.html: unregistered external script https://evil.example/app.js'
    ]);
    assert.deepEqual(auditHttpsExternalScripts(`<script src="${clerk}"></script>`, options), [
        `fixture.html: registered script SRI/crossorigin missing for ${clerk}`
    ]);
    assert.deepEqual(auditHttpsExternalScripts(
        `<script crossorigin="anonymous" integrity="sha384-required" src="${clerk}"></script>`, options
    ), []);
});

test('first-party scripts and neighboring iframes retain distinct resource types', () => {
    const source = '<script src="/js/app.js"></script><iframe src="https://fritz.chessbase.com"></iframe>';
    assert.deepEqual(urls(source), []);
    assert.match(source, /<script src="\/js\/app\.js">/);
});

test('valid external script and iframe coexist without resource confusion', () => {
    const source = `<script src="${clerk}"></script><iframe src="https://fritz.chessbase.com"></iframe>`;
    assert.deepEqual(urls(source), [clerk]);
});

test('production audit still scans public HTML and rejects no iframe as a script', () => {
    const audit = spawnSync(process.execPath, ['scripts/audit-supply-chain.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(audit.status, 0, `${audit.stdout}\n${audit.stderr}`);
    assert.match(audit.stdout, /Supply-chain policy passed \(\d+ runtime files;/);
    assert.doesNotMatch(`${audit.stdout}\n${audit.stderr}`, /chessbase\.com/);
    for (const page of ['fritz.html', 'playchess.html']) assert.equal(fs.existsSync(path.join(root, page)), true, page);
});

test('production audit retains exact allowlist and SRI policy', () => {
    const source = fs.readFileSync(path.join(root, 'scripts/audit-supply-chain.mjs'), 'utf8');
    assert.match(source, /externalScriptRegistry/);
    assert.match(source, /pgn\.chessbase\.com\/jquery-3\.0\.0\.min\.js/);
    assert.match(source, /pgn\.chessbase\.com\/cbreplay\.js/);
    assert.doesNotMatch(source, /\*\.chessbase\.com|fritz\.chessbase\.com|play\.chessbase\.com/);
});
