import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const port = Number(process.env.CAISSA_BOARD_TEST_PORT || 8175);
const allowedMappings = Object.freeze([
    { prefix: '/tests/fixtures/caissa-board/', root: resolve(repositoryRoot, 'tests/fixtures/caissa-board') },
    { prefix: '/js/board/', root: resolve(repositoryRoot, 'js/board') },
    { exact: '/css/caissa-board.css', file: resolve(repositoryRoot, 'css/caissa-board.css') },
    { prefix: '/img/chesspieces/wikipedia/', root: resolve(repositoryRoot, 'img/chesspieces/wikipedia') }
]);
const contentTypes = Object.freeze({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png'
});

function resolveAllowedPath(pathname) {
    for (const mapping of allowedMappings) {
        if (mapping.exact === pathname) return mapping.file;
        if (!mapping.prefix || !pathname.startsWith(mapping.prefix)) continue;
        const candidate = resolve(mapping.root, pathname.slice(mapping.prefix.length));
        if (candidate === mapping.root || candidate.startsWith(`${mapping.root}${sep}`)) return candidate;
    }
    return null;
}

const server = http.createServer(async (request, response) => {
    try {
        const url = new URL(request.url, `http://127.0.0.1:${port}`);
        const pathname = decodeURIComponent(url.pathname === '/' ? '/tests/fixtures/caissa-board/index.html' : url.pathname);
        const filePath = resolveAllowedPath(pathname);
        if (!['GET', 'HEAD'].includes(request.method) || !filePath) {
            response.writeHead(request.method === 'GET' || request.method === 'HEAD' ? 404 : 405);
            response.end();
            return;
        }
        const content = await readFile(filePath);
        response.writeHead(200, {
            'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        });
        if (request.method === 'HEAD') response.end();
        else response.end(content);
    } catch (error) {
        response.writeHead(error?.code === 'ENOENT' ? 404 : 500);
        response.end();
    }
});

server.listen(port, '127.0.0.1', () => {
    console.log(`CAISSA board test harness: http://127.0.0.1:${port}`);
});
