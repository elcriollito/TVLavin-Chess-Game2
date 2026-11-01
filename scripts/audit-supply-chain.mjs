import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { auditHttpsExternalScripts } from './supply-chain-script-tags.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clerkUrl = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js';
const clerkIntegrity = 'sha384-hDYzybzZL06dXvUhFHr0WXKf/sBfpbnhOwxF4xa/m4/hOYAAgZrNpO1n6eJ5np47';
const clerkUiUrl = 'https://cdn.jsdelivr.net/npm/@clerk/ui@1.30.1/dist/ui.browser.js';
const clerkUiIntegrity = 'sha384-BX9kdfAv6/55jYgfyaZcddR1/MJYO/idlamutUDyTEv0YUL56a9Wx7IHgfEnbL82';
const externalScriptRegistry = Object.freeze(new Map([
    [clerkUrl, clerkIntegrity],
    ['https://pgn.chessbase.com/jquery-3.0.0.min.js', 'sha384-THPy051/pYDQGanwU6poAc/hOdQxjnOEXzbT+OuUAFqNqFjL+4IGLBgCJC3ZOShY'],
    ['https://pgn.chessbase.com/cbreplay.js', 'sha384-z0jdjKWWyB3ocje/Y6yELBaAqgMK4JZD8VNzvISMneMW7j9Uhw+2DKhD9/h60WN5']
]));
const failures = [];

function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        if (['.git', 'node_modules', 'history'].includes(entry.name)) return [];
        const absolute = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(absolute) : [absolute];
    });
}

const runtimeFiles = walk(root).filter(file => {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    return relative.endsWith('.html') || relative.startsWith('js/') || relative.startsWith('client/public/');
});

for (const file of runtimeFiles) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const source = fs.readFileSync(file, 'utf8');
    if (/@(?:latest|next)(?:\/|\b)/i.test(source)) failures.push(`${relative}: floating runtime version`);
    if (/\bhttp:\/\/[^\s'"<>]+\.(?:js|mjs|wasm)(?:[?'"\s<]|$)/i.test(source))
        failures.push(`${relative}: insecure executable dependency`);
    failures.push(...auditHttpsExternalScripts(source, { relative, registry: externalScriptRegistry }));
}

const authSource = fs.readFileSync(path.join(root, 'js/caissa-auth.js'), 'utf8');
const clerkLoaderContract = [
    "CLERK_UI_VERSION = '1.30.1'",
    "CLERK_JS_VERSION = '6.28.1'",
    `CLERK_UI_INTEGRITY = '${clerkUiIntegrity}'`,
    `CLERK_JS_INTEGRITY = '${clerkIntegrity}'`,
    'CLERK_UI_CDN_URL',
    'CLERK_JS_CDN_URL',
    '/npm/@clerk/ui@${CLERK_UI_VERSION}/dist/ui.browser.js',
    '/npm/@clerk/clerk-js@${CLERK_JS_VERSION}/dist/clerk.browser.js',
    '{ integrity: CLERK_UI_INTEGRITY }',
    '{ integrity: CLERK_JS_INTEGRITY, publishableKey }',
    'script.integrity = integrity'
];
if (!authSource.includes(clerkUiUrl.replace('@1.30.1', '@${CLERK_UI_VERSION}'))
    || !authSource.includes(clerkUrl.replace('@6.28.1', '@${CLERK_JS_VERSION}'))
    || clerkLoaderContract.some(contract => !authSource.includes(contract))) {
    failures.push('dynamic Clerk UI/JS loaders are not pinned with reviewed SRI on every approved source');
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const trackedFiles = execFileSync('git', ['ls-files', '--cached'], { cwd: root, encoding: 'utf8' }).replaceAll('\\', '/').split(/\r?\n/);
if (!trackedFiles.includes('package-lock.json')) failures.push('package-lock.json must be tracked');
if (lock.lockfileVersion !== 3) failures.push('package-lock version must remain 3');
for (const [location, record] of Object.entries(lock.packages || {})) {
    if (record.resolved && !record.resolved.startsWith('https://registry.npmjs.org/'))
        failures.push(`${location}: unexpected package source`);
    if (record.resolved && !record.integrity) failures.push(`${location}: registry package lacks integrity`);
}
for (const [name, version] of Object.entries({
    lodash: '4.18.1',
    nanoid: '3.3.18',
    qs: '6.16.0',
    undici: '7.30.1',
    zod: '4.6.6',
})) {
    if (packageJson.overrides?.[name] !== version) failures.push(`override drift: ${name}`);
}
if (packageJson.dependencies?.['adm-zip'] !== '0.6.1' || packageJson.devDependencies?.sharp !== '0.35.5')
    failures.push('direct remediation version drift');

if (failures.length) {
    failures.forEach(failure => console.error(`SUPPLY_CHAIN_POLICY: ${failure}`));
    process.exitCode = 1;
} else {
    console.log(`Supply-chain policy passed (${runtimeFiles.length} runtime files; ${Object.keys(lock.packages).length - 1} locked package entries).`);
}
