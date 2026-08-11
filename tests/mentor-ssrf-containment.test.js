import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import mentorChatHandler from '../api/mentor/chat.js';

const VALID_MESSAGES = [{ role: 'user', content: 'Test request' }];

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        payload: undefined,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
        end() { return this; }
    };
}

async function invoke(body, fetchImpl = async () => {
    throw new Error('Unexpected outbound fetch');
}) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    const res = createResponse();
    try {
        await mentorChatHandler({ method: 'POST', headers: {}, body }, res);
        return res;
    } finally {
        globalThis.fetch = originalFetch;
    }
}

for (const endpoint of [
    'https://example.invalid/test',
    'http://127.0.0.1:1234',
    'http://169.254.169.254/',
    'http://10.0.0.1/'
]) {
    test(`custom provider cannot fetch ${endpoint}`, async () => {
        let fetchCalls = 0;
        const res = await invoke({
            provider: 'custom',
            endpoint,
            apiKey: 'TEST_SECRET_DO_NOT_USE',
            messages: VALID_MESSAGES
        }, async () => { fetchCalls += 1; });

        assert.equal(res.statusCode, 400);
        assert.equal(res.payload.code, 'CUSTOM_PROVIDER_DISABLED');
        assert.equal(fetchCalls, 0);
        assert.doesNotMatch(JSON.stringify(res.payload), /TEST_SECRET_DO_NOT_USE|example\.invalid|127\.0\.0\.1|169\.254\.169\.254|10\.0\.0\.1/);
    });
}

test('unknown provider is rejected without fallback or outbound fetch', async () => {
    let fetchCalls = 0;
    const res = await invoke({
        provider: 'not-a-provider',
        apiKey: 'TEST_SECRET_DO_NOT_USE',
        messages: VALID_MESSAGES
    }, async () => { fetchCalls += 1; });

    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.code, 'UNKNOWN_PROVIDER');
    assert.equal(fetchCalls, 0);
});

test('local provider cannot make a server-side loopback request', async () => {
    let fetchCalls = 0;
    const res = await invoke({ provider: 'local', messages: VALID_MESSAGES }, async () => { fetchCalls += 1; });

    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.code, 'LOCAL_PROVIDER_DISABLED');
    assert.equal(fetchCalls, 0);
});

test('OpenAI BYO maps to its fixed endpoint, ignores endpoint input, and rejects redirects', async () => {
    const calls = [];
    const res = await invoke({
        provider: 'openai',
        endpoint: 'https://example.invalid/steal',
        apiKey: 'TEST_SECRET_DO_NOT_USE',
        messages: VALID_MESSAGES
    }, async (...args) => {
        calls.push(args);
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    });

    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'https://api.openai.com/v1/chat/completions');
    assert.equal(calls[0][1].headers.Authorization, 'Bearer TEST_SECRET_DO_NOT_USE');
    assert.equal(calls[0][1].redirect, 'error');
    assert.notEqual(calls[0][0], 'https://example.invalid/steal');
});

test('Anthropic BYO uses only the fixed endpoint and provider-specific key header', async () => {
    const calls = [];
    await invoke({
        provider: 'anthropic',
        endpoint: 'http://10.0.0.1/',
        apiKey: 'TEST_SECRET_DO_NOT_USE',
        messages: VALID_MESSAGES
    }, async (...args) => {
        calls.push(args);
        return { ok: true, status: 200, json: async () => ({ content: [{ text: 'ok' }], usage: {} }) };
    });

    assert.equal(calls[0][0], 'https://api.anthropic.com/v1/messages');
    assert.equal(calls[0][1].headers['x-api-key'], 'TEST_SECRET_DO_NOT_USE');
    assert.equal(calls[0][1].headers.Authorization, undefined);
    assert.equal(calls[0][1].redirect, 'error');
});

for (const [provider, expectedEndpoint] of [
    ['together', 'https://api.together.xyz/v1/chat/completions'],
    ['llama', 'https://api.llama.com/v1/chat/completions']
]) {
    test(`${provider} BYO maps to its fixed endpoint`, async () => {
        const calls = [];
        await invoke({
            provider,
            endpoint: 'https://example.invalid/steal',
            apiKey: 'TEST_SECRET_DO_NOT_USE',
            messages: VALID_MESSAGES
        }, async (...args) => {
            calls.push(args);
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
        });

        assert.equal(calls[0][0], expectedEndpoint);
        assert.equal(calls[0][1].headers.Authorization, 'Bearer TEST_SECRET_DO_NOT_USE');
        assert.equal(calls[0][1].redirect, 'error');
    });
}

test('static guards prevent request-controlled server destinations and custom browser streaming', () => {
    const serverSource = fs.readFileSync(new URL('../api/mentor/chat.js', import.meta.url), 'utf8');
    const clientSource = fs.readFileSync(new URL('../llm-provider.js', import.meta.url), 'utf8');

    assert.doesNotMatch(serverSource, /fetch\s*\(\s*(?:endpoint|body\.endpoint)/);
    assert.doesNotMatch(serverSource, /apiUrl\s*=\s*endpoint/);
    assert.doesNotMatch(serverSource, /const\s*\{[^}]*\bendpoint\b[^}]*\}\s*=\s*req\.body/s);
    assert.doesNotMatch(clientSource, /this\.config\.endpoint\s*\|\|/);
    assert.match(clientSource, /Custom AI endpoints are temporarily unavailable\./);
});
