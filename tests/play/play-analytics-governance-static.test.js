import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const production = fs.readdirSync('js/play/analytics').filter(file => file.endsWith('.js'))
    .map(file => [file, fs.readFileSync(`js/play/analytics/${file}`, 'utf8')]);
const governance = fs.readFileSync('js/play/analytics/play-analytics-governance.js', 'utf8');

test('governed analytics owns no network, storage, cookies, timers, workers, sockets, endpoints, or UI', () => {
    for (const [file, source] of production) for (const pattern of [/\bfetch\s*\(/,/XMLHttpRequest/,/sendBeacon/,/WebSocket/,
        /localStorage|sessionStorage/,/document\.cookie/,/new\s+Worker/,/setTimeout|setInterval/,/requestAnimationFrame/,
        /https?:\/\//,/createElement|innerHTML/]) assert.doesNotMatch(source, pattern, file);
});

test('governance contains no executable policy values, arbitrary sink, or production override', () => {
    assert.doesNotMatch(governance, /callback|functionValue|endpointUrl|registerSink|productionEligible:\s*true/);
    assert.match(governance, /networkEligible:\s*false/); assert.match(governance, /externalTransportEligible:\s*false/);
    assert.match(governance, /trustedIds:\s*\['local-diagnostics','qa-test'\]/);
});

test('production pages register governance once after the dispatcher and before route ownership', () => {
    for (const page of ['index.html','yahoo-classic.html']) { const html = fs.readFileSync(page, 'utf8');
        assert.equal(html.match(/play-analytics-governance\.js/g)?.length, 1);
        assert(html.indexOf('play-analytics-dispatcher.js') < html.indexOf('play-analytics-governance.js'));
        assert(html.indexOf('play-analytics-governance.js') < html.indexOf('play-route-controller.js'));
        assert.doesNotMatch(html, /play-analytics-governance.*(?:fixture|test)/i); }
});
