import { createDecipheriv, createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'scanner', 'fixtures', 'private-real-corpus-v1');
const descriptor = JSON.parse(await readFile(join(fixtureRoot, 'manifest.json'), 'utf8'));
const encryptedPath = join(fixtureRoot, descriptor.archive.file);
const destination = resolve(process.env.SCANNER_CORPUS_DESTINATION || join(root, '..'));
const temporaryArchive = join(root, `.scanner-corpus-${process.pid}.tar.gz`);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();

function fail(message) {
  throw new Error(`Scanner corpus provisioning failed: ${message}`);
}

function run(command, args) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? accept() : reject(new Error(`${command} exited ${code}`)));
  });
}

const encodedKey = process.env.SCANNER_CORPUS_ARCHIVE_KEY;
if (!encodedKey) fail('SCANNER_CORPUS_ARCHIVE_KEY is not configured');
const key = Buffer.from(encodedKey, 'base64');
if (key.length !== 32) fail('SCANNER_CORPUS_ARCHIVE_KEY has an invalid format');

const encrypted = await readFile(encryptedPath);
if (sha256(encrypted) !== descriptor.archive.encryptedSha256) fail('encrypted archive checksum mismatch');
const magic = Buffer.from('CAISSA-SCANNER-CORPUS-V1\0', 'ascii');
if (!encrypted.subarray(0, magic.length).equals(magic)) fail('encrypted archive header mismatch');
const nonce = encrypted.subarray(magic.length, magic.length + 12);
const tag = encrypted.subarray(magic.length + 12, magic.length + 28);
const payload = encrypted.subarray(magic.length + 28);
const decipher = createDecipheriv('aes-256-gcm', key, nonce);
decipher.setAuthTag(tag);

try {
  const archive = Buffer.concat([decipher.update(payload), decipher.final()]);
  if (sha256(archive) !== descriptor.archive.plaintextSha256) fail('decrypted archive checksum mismatch');
  await writeFile(temporaryArchive, archive, { mode: 0o600 });
  await run('tar', ['-xzf', temporaryArchive, '-C', destination]);
  for (const [relativePath, expectedHash] of Object.entries(descriptor.expected.keyFiles)) {
    const bytes = await readFile(join(destination, ...relativePath.split('/')));
    if (sha256(bytes) !== expectedHash) fail(`key file checksum mismatch: ${relativePath}`);
  }
  console.log(`Provisioned ${descriptor.expected.auditedBoards} audited Scanner boards from authenticated encrypted fixture.`);
} finally {
  key.fill(0);
  await rm(temporaryArchive, { force: true });
}
