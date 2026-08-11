import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Readable } from 'node:stream';

process.env.PORT = '0';
const bootstrapLog = console.log;
console.log = () => {};
const { handleMentorChat, server } = await import('../server.js');
console.log = bootstrapLog;
const { default: addCreditsHandler } = await import('../api/credits/add.js');

after(() => new Promise(resolve => server.close(resolve)));

const MESSAGES = [{ role: 'user', content: 'test' }];

function nodeResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: '',
        writeHead(statusCode, headers = {}) {
            this.statusCode = statusCode;
            this.headers = headers;
        },
        end(body = '') { this.body += body; }
    };
}

async function invokeMentor(body, fetchImpl = async () => {
    throw new Error('Unexpected outbound fetch');
}) {
    const originalFetch = globalThis.fetch;
    const originalLog = console.log;
    globalThis.fetch = fetchImpl;
    console.log = () => {};
    const req = Readable.from([JSON.stringify(body)]);
    req.method = 'POST';
    const res = nodeResponse();
    try {
        await handleMentorChat(req, res);
        return { status: res.statusCode, body: JSON.parse(res.body) };
    } finally {
        globalThis.fetch = originalFetch;
        console.log = originalLog;
    }
}

for (const endpoint of [
    'https://example.invalid/',
    'http://127.0.0.1:1234/',
    'http://169.254.169.254/'
]) {
    test(`legacy custom provider rejects ${endpoint} without fetch`, async () => {
        let fetches = 0;
        const result = await invokeMentor({
            provider: 'custom',
            endpoint,
            apiKey: 'TEST_SECRET_DO_NOT_USE',
            messages: MESSAGES
        }, async () => { fetches += 1; });

        assert.equal(result.status, 400);
        assert.equal(result.body.code, 'CUSTOM_PROVIDER_DISABLED');
        assert.equal(fetches, 0);
        assert.doesNotMatch(JSON.stringify(result), /TEST_SECRET_DO_NOT_USE|example\.invalid|127\.0\.0\.1|169\.254\.169\.254/);
    });
}

test('legacy unknown provider is rejected without fallback', async () => {
    let fetches = 0;
    const result = await invokeMentor({
        provider: 'unknown',
        apiKey: 'TEST_SECRET_DO_NOT_USE',
        messages: MESSAGES
    }, async () => { fetches += 1; });

    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'UNKNOWN_PROVIDER');
    assert.equal(fetches, 0);
});

test('legacy local provider cannot trigger a server loopback fetch', async () => {
    let fetches = 0;
    const result = await invokeMentor({ provider: 'local', messages: MESSAGES }, async () => { fetches += 1; });

    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'LOCAL_PROVIDER_DISABLED');
    assert.equal(fetches, 0);
});

for (const [provider, expectedUrl, keyHeader] of [
    ['together', 'https://api.together.xyz/v1/chat/completions', 'Authorization'],
    ['llama', 'https://api.llama.com/v1/chat/completions', 'Authorization'],
    ['openai', 'https://api.openai.com/v1/chat/completions', 'Authorization'],
    ['anthropic', 'https://api.anthropic.com/v1/messages', 'x-api-key']
]) {
    test(`legacy ${provider} uses only its fixed endpoint and rejects redirects`, async () => {
        const calls = [];
        const result = await invokeMentor({
            provider,
            endpoint: 'https://example.invalid/steal',
            apiKey: 'TEST_SECRET_DO_NOT_USE',
            messages: MESSAGES
        }, async (...args) => {
            calls.push(args);
            return provider === 'anthropic'
                ? { ok: true, status: 200, json: async () => ({ content: [{ text: 'ok' }], usage: {} }) }
                : { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
        });

        assert.equal(result.status, 200);
        assert.equal(calls.length, 1);
        assert.equal(calls[0][0], expectedUrl);
        assert.equal(calls[0][1].redirect, 'error');
        assert.equal(calls[0][1].headers[keyHeader], keyHeader === 'Authorization'
            ? 'Bearer TEST_SECRET_DO_NOT_USE' : 'TEST_SECRET_DO_NOT_USE');
        assert.notEqual(calls[0][0], 'https://example.invalid/steal');
    });
}

function apiResponse() {
    return {
        statusCode: 200,
        payload: undefined,
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
        end() { return this; }
    };
}

for (const body of [
    { amount: 1, reason: 'self-grant' },
    { amount: 10000, reason: 'self-grant' },
    { amount: 10000, reason: 'purchase_complete' },
    { amount: 10000, reason: 'self-grant', role: 'admin' },
    { amount: 10000, reason: 'self-grant', isPremium: true },
    { clerkId: 'another-user', amount: 10000, reason: 'self-grant' }
]) {
    test(`credit grant endpoint denies untrusted body: ${JSON.stringify(body)}`, async () => {
        const res = apiResponse();
        await addCreditsHandler({ method: 'POST', headers: {}, body }, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.payload.code, 'CREDIT_GRANTS_DISABLED');
        assert.equal(res.payload.credits, undefined);
    });
}

test('credit grant endpoint also denies unauthenticated requests', async () => {
    const res = apiResponse();
    await addCreditsHandler({ method: 'POST', headers: {}, body: { amount: 1, reason: 'test' } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.code, 'CREDIT_GRANTS_DISABLED');
});

test('static guards prevent request-controlled legacy routing and browser-authorized credit mutation', () => {
    const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    const creditSource = fs.readFileSync(new URL('../api/credits/add.js', import.meta.url), 'utf8');

    assert.doesNotMatch(serverSource, /apiUrl\s*=\s*data\.endpoint|fetch\s*\(\s*data\.endpoint/);
    assert.doesNotMatch(serverSource, /localhost:1234\/v1\/chat\/completions/);
    assert.doesNotMatch(creditSource, /req\.body|add_credits|getSupabase|\.rpc\s*\(/);
    assert.match(creditSource, /CREDIT_GRANTS_DISABLED/);
});
