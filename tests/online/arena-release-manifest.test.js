import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, 'PUBLIC_RELEASE_ARTIFACT_MANIFEST.json'),
    'utf8'
));
const manifestPaths = new Set(manifest.files.map(entry => entry.path));

function relativeModuleImports(modulePath) {
    const source = fs.readFileSync(path.join(repositoryRoot, modulePath), 'utf8');
    const imports = [];
    const pattern = /(?:\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/gu;
    for (const match of source.matchAll(pattern)) {
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(modulePath), match[1]));
        imports.push(path.posix.extname(resolved) ? resolved : `${resolved}.js`);
    }
    return imports;
}

function moduleGraph(entrypoints) {
    const visited = new Set();
    const queue = [...entrypoints];
    while (queue.length) {
        const modulePath = queue.shift();
        if (visited.has(modulePath)) continue;
        visited.add(modulePath);
        for (const dependency of relativeModuleImports(modulePath)) {
            if (fs.existsSync(path.join(repositoryRoot, dependency))) queue.push(dependency);
        }
    }
    return visited;
}

test('the Vercel public artifact contains every Arena Online runtime module', () => {
    const runtimeModules = moduleGraph([
        'api/online.js',
        'js/online/online-page.js',
        'js/online/online-tournaments.js'
    ]);
    assert.ok(runtimeModules.has('api/_lib/online-arena.js'));
    assert.ok(runtimeModules.has('js/online/online-tournaments.js'));
    for (const modulePath of runtimeModules) {
        assert.equal(manifestPaths.has(modulePath), true, `${modulePath} is absent from the public artifact`);
    }
});
