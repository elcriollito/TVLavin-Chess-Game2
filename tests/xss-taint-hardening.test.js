import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mentor = fs.readFileSync(new URL('../mentor-ai.js', import.meta.url), 'utf8');
const fics = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const analyze = fs.readFileSync(new URL('../js/analyze-section.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('LLM output escapes raw HTML before limited Markdown formatting', () => assert.match(mentor, /String\(content \?\? ''\)[\s\S]*replace\(\/<\/g, '&lt;'\)/));
test('Mentor errors use text nodes rather than tainted innerHTML', () => assert.match(mentor, /errorDiv\.append\(icon, document\.createTextNode/));
test('javascript and data links are not created by the limited Markdown formatter', () => assert.doesNotMatch(mentor.slice(mentor.indexOf('formatMessageContent'), mentor.indexOf('setLoading')), /<a\b|href\s*=/i));
test('FICS multiline status constructs text and br nodes', () => assert.match(fics, /gameStatus\.replaceChildren\(\)[\s\S]*createTextNode\(line\)/));
test('FICS console uses textContent for external multiline data', () => assert.match(fics, /console\.textContent = this\.messageBuffer\.join/));
test('FICS player and table values are escaped before template insertion', () => assert.match(fics, /escapeHtml\(row\.players\)/));
test('PGN header rendering escapes White and Black names', () => assert.match(analyze, /escapeHtml\(game\.white\)[\s\S]*escapeHtml\(game\.black\)/));
test('PGN result and metadata rendering are escaped', () => assert.match(analyze, /escapeHtml\(game\.source\)[\s\S]*escapeHtml\(game\.result\)/));
test('Chess.com and Lichess usernames are encoded into fixed URLs', () => assert.match(app, /link\.href = `\$\{selectedLink\.base\}\$\{encodeURIComponent\(username\)\}/));
test('import fallback links use noopener and textContent', () => { assert.match(app, /link\.rel = 'noopener noreferrer'/); assert.match(app, /link\.textContent = selectedLink\.label/); });
test('unknown import provider creates no URL', () => assert.match(app, /corsProviderLink\.textContent = 'Import provider'/));
test('query and hash are not rendered by Mentor', () => assert.doesNotMatch(mentor, /location\.(?:search|hash)|URLSearchParams/));
test('dangerous dynamic code construction is absent from taint handlers', () => assert.doesNotMatch(mentor + fics + analyze, /\b(?:eval|Function)\s*\(|createContextualFragment|document\.write/));
test('known tainted sinks do not rely on CSP for sanitization', () => assert.doesNotMatch(mentor + fics, /securitypolicyviolation|Content-Security-Policy/));
test('BYO public config and tainted renderers have no shared secret property', () => assert.doesNotMatch(mentor + fics + analyze, /LLMProvider\.config\.apiKey/));
