#!/usr/bin/env node
/*
 * CAISSA Production Validation Suite
 *
 * Lightweight deployment smoke validation for the production FICS flow.
 * This script drives a real browser through Chrome DevTools Protocol and
 * checks the production site without modifying application code or data.
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const DEFAULT_URL = 'https://www.caissa-chess.org';
const url = process.env.CAISSA_PVS_URL || DEFAULT_URL;
const browserPath = process.env.CAISSA_PVS_BROWSER || findBrowser();
const port = Number(process.env.CAISSA_PVS_PORT || 9333);
const headless = process.env.CAISSA_PVS_HEADLESS !== '0';
const keepBrowser = process.env.CAISSA_PVS_KEEP_BROWSER === '1';
const profileDir = path.join(os.tmpdir(), `caissa-pvs-${Date.now()}`);

const CHECKS = [
    ['guestLogin', 'Guest Login'],
    ['lobby', 'Lobby'],
    ['watch', 'Watch'],
    ['style12', 'Style12'],
    ['promotion', 'Promotion'],
    ['console', 'Console'],
    ['disconnect', 'Disconnect'],
    ['reconnect', 'Reconnect']
];

function findBrowser() {
    const candidates = process.platform === 'win32'
        ? [
            path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
            path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
            path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
            path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/Application/msedge.exe')
        ]
        : process.platform === 'darwin'
            ? [
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
                '/Applications/Chromium.app/Contents/MacOS/Chromium'
            ]
            : [
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable',
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
                '/usr/bin/microsoft-edge'
            ];

    return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function getJson(targetUrl) {
    return new Promise((resolve, reject) => {
        const req = http.get(targetUrl, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(error);
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
            req.destroy(new Error(`Timed out reading ${targetUrl}`));
        });
    });
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevtools() {
    const started = Date.now();
    while (Date.now() - started < 15000) {
        try {
            return await getJson(`http://127.0.0.1:${port}/json/list`);
        } catch (error) {
            await wait(300);
        }
    }
    throw new Error(`Browser DevTools endpoint did not start on port ${port}`);
}

function launchBrowser() {
    if (!browserPath) {
        throw new Error('No Chrome/Edge browser found. Set CAISSA_PVS_BROWSER to a Chromium browser path.');
    }

    fs.mkdirSync(profileDir, { recursive: true });
    const args = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--disable-default-apps',
        '--window-size=1440,1100',
        'about:blank'
    ];
    if (headless) args.unshift('--headless=new');

    return spawn(browserPath, args, {
        stdio: 'ignore',
        detached: process.platform !== 'win32'
    });
}

async function connectPage() {
    const pages = await waitForDevtools();
    const page = pages.find((candidate) => candidate.type === 'page') || pages[0];
    if (!page?.webSocketDebuggerUrl) {
        throw new Error('Could not find a browser page DevTools websocket.');
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const pending = new Map();
    const consoleErrors = [];
    const exceptions = [];
    let nextId = 0;

    ws.on('message', (raw) => {
        const message = JSON.parse(raw);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
            return;
        }
        if (message.method === 'Runtime.consoleAPICalled'
            && ['error', 'assert'].includes(message.params.type)) {
            const text = (message.params.args || [])
                .map((arg) => arg.value || arg.description || '')
                .join(' ');
            if (!/favicon|Clerk|ERR_BLOCKED_BY_CLIENT/i.test(text)) {
                consoleErrors.push(text);
            }
        }
        if (message.method === 'Runtime.exceptionThrown') {
            exceptions.push(
                message.params.exceptionDetails?.exception?.description
                || message.params.exceptionDetails?.text
                || 'Uncaught exception'
            );
        }
    });

    await new Promise((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
    });

    function send(method, params = {}) {
        return new Promise((resolve) => {
            const id = ++nextId;
            pending.set(id, resolve);
            ws.send(JSON.stringify({ id, method, params }));
        });
    }

    await send('Runtime.enable');
    await send('Page.enable');
    return { ws, send, consoleErrors, exceptions };
}

async function runBrowserValidation(send) {
    await send('Page.navigate', { url });
    await wait(2500);

    const expression = `
        (async () => {
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const waitFor = async (fn, timeout = 35000, step = 250) => {
                const started = Date.now();
                while (Date.now() - started < timeout) {
                    try {
                        if (fn()) return true;
                    } catch (error) {}
                    await sleep(step);
                }
                return false;
            };
            const visible = (element) => !!element && !!(
                element.offsetWidth || element.offsetHeight || element.getClientRects().length
            );
            const click = (selector) => {
                const element = document.querySelector(selector);
                if (element) element.click();
                return !!element;
            };
            const setInput = (selector, value) => {
                const element = document.querySelector(selector);
                if (!element) return false;
                element.value = value;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            };
            const text = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
            const snapshot = () => ({
                authenticated: !!window.CaissaFICSClient?.authenticated,
                connected: !!window.CaissaFICSClient?.connected,
                observed: !!window.CaissaFICSClient?.liveGame?.observedGame,
                gameNumber: window.CaissaFICSClient?.liveGame?.gameNumber || null,
                hasFen: !!window.CaissaFICSClient?.liveGame?.currentFen,
                connectionState: window.CaissaFICSClient?.connectionState,
                gameStatus: text('#ficsGameStatus'),
                roomStatus: text('#ficsRoomStatus')
            });
            const results = {
                guestLogin: false,
                lobby: false,
                watch: false,
                style12: false,
                promotion: false,
                console: false,
                disconnect: false,
                reconnect: false
            };
            const details = {};

            await waitFor(() => document.readyState === 'complete', 20000);
            click('[data-section="fics"]');
            await waitFor(() => visible(document.querySelector('#ficsConnectBtn')), 10000);

            click('#ficsConnectBtn');
            results.guestLogin = await waitFor(() => window.CaissaFICSClient?.authenticated === true, 35000);

            click('#ficsRefreshLobbyBtn');
            await waitFor(() => [...document.querySelectorAll('#ficsLobbyRows button')].some(visible), 25000);
            const rows = [...document.querySelectorAll('#ficsLobbyRows .fics-lobby-row')];
            const buttons = [...document.querySelectorAll('#ficsLobbyRows button')].filter(visible);
            const aligned = rows.every((row) => {
                const players = row.querySelector('.fics-lobby-players')?.getBoundingClientRect();
                const action = row.querySelector('button')?.getBoundingClientRect();
                return !players || !action || action.left >= players.right;
            });
            results.lobby = rows.length > 0 && buttons.length > 0 && aligned;
            details.lobbyRows = rows.length;
            details.lobbyButtons = buttons.map((button) => button.textContent.trim());

            const watchButtons = buttons.filter((button) => /^Watch$/i.test(button.textContent.trim()));
            const firstWatch = watchButtons[0];
            if (firstWatch) {
                firstWatch.click();
                results.watch = await waitFor(() => (
                    window.CaissaFICSClient?.liveGame?.observedGame === true
                    && !!window.CaissaFICSClient?.liveGame?.currentFen
                ), 30000);
            }
            const moveListInitial = text('#ficsMoveList');
            results.style12 = results.watch
                && !!window.CaissaFICSClient?.liveGame?.currentFen
                && !/Moves will appear here/i.test(moveListInitial);
            details.moveList = moveListInitial.slice(0, 120);

            results.promotion = document.querySelector('#ficsPromotionSelector')?.hidden === true;

            setInput('#ficsCommandInput', 'date');
            click('#ficsSendCommandBtn');
            const beforeConsole = text('#ficsConsole');
            results.console = await waitFor(() => {
                const current = text('#ficsConsole');
                return current.includes('> date') && current.length >= beforeConsole.length;
            }, 10000);

            click('#ficsDisconnectBtn');
            results.disconnect = await waitFor(() => {
                const state = window.CaissaFICSClient;
                return state
                    && !state.authenticated
                    && !state.connected
                    && !state.liveGame?.observedGame
                    && !state.liveGame?.currentFen;
            }, 15000);
            details.afterDisconnect = snapshot();

            click('#ficsConnectBtn');
            const reconnected = await waitFor(() => window.CaissaFICSClient?.authenticated === true, 35000);
            click('#ficsRefreshLobbyBtn');
            const lobbyAfterReconnect = await waitFor(() => (
                [...document.querySelectorAll('#ficsLobbyRows button')].some(visible)
            ), 25000);
            results.reconnect = reconnected && lobbyAfterReconnect;
            details.afterReconnect = snapshot();

            try {
                window.CaissaFICSClient?.disconnect?.();
            } catch (error) {}

            return { results, details };
        })()
    `;

    const response = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        timeout: 180000
    });

    if (response.error) {
        throw new Error(response.error.message || 'Chrome DevTools Runtime.evaluate failed.');
    }
    if (response.result?.exceptionDetails) {
        throw new Error(
            response.result.exceptionDetails.exception?.description
            || response.result.exceptionDetails.text
            || 'Browser validation failed.'
        );
    }
    if (!response.result?.result) {
        throw new Error('Chrome DevTools returned an empty Runtime.evaluate response.');
    }
    return response.result.result.value;
}

function printReport(results, details = {}, diagnostic = null) {
    const failed = CHECKS.filter(([key]) => !results[key]);
    console.log('CAISSA Production Validation');
    console.log('');
    for (const [key, label] of CHECKS) {
        console.log(`${label} .... ${results[key] ? 'PASS' : 'FAIL'}`);
    }
    console.log('');
    console.log(`Overall .... ${failed.length ? 'FAIL' : 'PASS'}`);

    if (details.lobbyRows !== undefined) {
        console.log('');
        console.log(`Lobby rows: ${details.lobbyRows}`);
        console.log(`Lobby actions: ${(details.lobbyButtons || []).join(', ') || 'none'}`);
    }
    if (diagnostic?.length) {
        console.log('');
        console.log('Diagnostics:');
        diagnostic.forEach((line) => console.log(`- ${line}`));
    }
}

async function main() {
    let browser;
    let page;
    const diagnostics = [];

    try {
        browser = launchBrowser();
        page = await connectPage();
        const { results, details } = await runBrowserValidation(page.send);
        if (page.consoleErrors.length) {
            diagnostics.push(`Console errors: ${page.consoleErrors.slice(0, 3).join(' | ')}`);
        }
        if (page.exceptions.length) {
            diagnostics.push(`Browser exceptions: ${page.exceptions.slice(0, 3).join(' | ')}`);
        }
        const finalResults = {
            ...results,
            console: results.console && page.consoleErrors.length === 0 && page.exceptions.length === 0
        };
        printReport(finalResults, details, diagnostics);
        process.exitCode = Object.values(finalResults).every(Boolean) ? 0 : 1;
    } catch (error) {
        printReport(Object.fromEntries(CHECKS.map(([key]) => [key, false])), {}, [error.message]);
        process.exitCode = 1;
    } finally {
        try {
            await page?.send?.('Browser.close');
        } catch (error) {}
        try {
            page?.ws?.close();
        } catch (error) {}
        if (browser && !keepBrowser) {
            try {
                browser.kill();
            } catch (error) {}
        }
        if (!keepBrowser) {
            for (let attempt = 0; attempt < 5; attempt += 1) {
                try {
                    fs.rmSync(profileDir, { recursive: true, force: true });
                    break;
                } catch (error) {
                    if (attempt === 4) break;
                    await wait(300);
                }
            }
        }
    }
}

main();
