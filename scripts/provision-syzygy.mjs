import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const sha256File = async (path) =>
    createHash('sha256').update(await readFile(path)).digest('hex');

export async function provisionSyzygy({ targetDirectory, inventory, fetchImpl = fetch }) {
    if (!targetDirectory) throw Object.assign(new Error('missing-syzygy-directory'), { code: 'missing-syzygy-directory' });
    const target = resolve(targetDirectory);
    await mkdir(target, { recursive: true });
    const installed = [];
    for (const file of inventory.files || []) {
        if (!/^https:\/\//.test(file.url) || !/^[a-f0-9]{64}$/.test(file.sha256))
            throw Object.assign(new Error('invalid-syzygy-inventory'), { code: 'invalid-syzygy-inventory' });
        const path = resolve(target, basename(file.name));
        const existing = await stat(path).catch(() => null);
        if (!existing) {
            const response = await fetchImpl(file.url);
            if (!response.ok) throw Object.assign(new Error('syzygy-download-failed'), { code: 'syzygy-download-failed' });
            await writeFile(path, new Uint8Array(await response.arrayBuffer()));
        }
        if (await sha256File(path) !== file.sha256)
            throw Object.assign(new Error('syzygy-checksum-mismatch'), { code: 'syzygy-checksum-mismatch' });
        installed.push({ name: file.name, bytes: (await stat(path)).size, sha256: file.sha256 });
    }
    return { targetDirectory: target, installedCoverage: inventory.coverage || 'unspecified', installed };
}
