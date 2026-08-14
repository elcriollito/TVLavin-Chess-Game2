import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { auditHttpsExternalScripts } from './supply-chain-script-tags.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clerkUrl = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js';
const clerkIntegrity = 'sha384-hDYzybzZL06dXvUhFHr0WXKf/sBfpbnhOwxF4xa/m4/hOYAAgZrNpO1n6eJ5np47';
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
    failures.push(...auditHttpsExternalScripts(source, {
        relative,
        allowedUrl: clerkUrl,
        requiredIntegrity: clerkIntegrity
    }));
}

const authSource = fs.readFileSync(path.join(root, 'js/caissa-auth.js'), 'utf8');
if (!authSource.includes(`CLERK_SDK_URL = '${clerkUrl}'`) || !authSource.includes(`CLERK_SDK_INTEGRITY = '${clerkIntegrity}'`)
    || !authSource.includes('script.integrity = CLERK_SDK_INTEGRITY')) failures.push('dynamic Clerk loader is not pinned with SRI');

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
for (const [name, version] of Object.entries({ lodash: '4.18.1', nanoid: '3.3.18', qs: '6.15.3', undici: '7.29.0' })) {
    if (packageJson.overrides?.[name] !== version) failures.push(`override drift: ${name}`);
}
if (packageJson.dependencies?.['adm-zip'] !== '0.6.0' || packageJson.devDependencies?.sharp !== '0.35.3')
    failures.push('direct remediation version drift');

if (failures.length) {
    failures.forEach(failure => console.error(`SUPPLY_CHAIN_POLICY: ${failure}`));
    process.exitCode = 1;
} else {
    console.log(`Supply-chain policy passed (${runtimeFiles.length} runtime files; ${Object.keys(lock.packages).length - 1} locked package entries).`);
}
