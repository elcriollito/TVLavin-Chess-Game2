import { readFile, writeFile } from 'node:fs/promises';

export function normalizeEol(text) {
  return text.replace(/\r\n?/g, '\n');
}

export async function readCanonicalText(path) {
  return normalizeEol(await readFile(path, 'utf8'));
}

export function serializeCanonicalText(text) {
  return JSON.stringify(normalizeEol(text));
}

export async function writeCanonicalText(path, text) {
  await writeFile(path, normalizeEol(text), 'utf8');
}
