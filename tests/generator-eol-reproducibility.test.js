import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  normalizeEol,
  readCanonicalText,
  serializeCanonicalText,
  writeCanonicalText
} from '../scripts/lib/canonical-text.mjs';
import {
  PLAY_V2_PUBLIC_BETA_DOCUMENT,
  PLAY_V2_UNAVAILABLE_DOCUMENT
} from '../api/_lib/play-v2-public-beta-document.js';

function renderDocument(source, fragment) {
  return normalizeEol(source).replace(
    '<!-- GENERATED SECTION -->',
    normalizeEol(fragment).trimEnd()
  );
}

test('equivalent LF and CRLF generator inputs produce identical output', () => {
  const lfSource = '<main>\n<!-- GENERATED SECTION -->\n</main>\n';
  const lfFragment = '<section>\n  Generated\n</section>\n';
  const crlfSource = lfSource.replaceAll('\n', '\r\n');
  const crlfFragment = lfFragment.replaceAll('\n', '\r\n');

  const lfOutput = renderDocument(lfSource, lfFragment);
  const crlfOutput = renderDocument(crlfSource, crlfFragment);

  assert.equal(crlfOutput, lfOutput);
  assert.equal(crlfOutput.includes('\r'), false);
});

test('serialized generated documents contain canonical escaped LF newlines', () => {
  const lfDocument = '<!doctype html>\n<p>CAISSA</p>\n';
  const crlfDocument = lfDocument.replaceAll('\n', '\r\n');

  const lfSerialized = serializeCanonicalText(lfDocument);
  const crlfSerialized = serializeCanonicalText(crlfDocument);

  assert.equal(crlfSerialized, lfSerialized);
  assert.equal(crlfSerialized.includes('\\r\\n'), false);
  assert.equal(crlfSerialized.includes('\\n'), true);
});

test('bare carriage returns are normalized without changing trailing-newline intent', () => {
  assert.equal(normalizeEol('one\rtwo\r'), 'one\ntwo\n');
  assert.equal(normalizeEol('one\r\ntwo'), 'one\ntwo');
});

test('canonical file boundaries ignore checkout EOL and emit LF bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'caissa-generator-eol-'));
  const lfPath = join(directory, 'source-lf.html');
  const crlfPath = join(directory, 'source-crlf.html');
  const outputPath = join(directory, 'generated.html');
  const source = '<main>\n  CAISSA\n</main>\n';

  try {
    await writeFile(lfPath, source, 'utf8');
    await writeFile(crlfPath, source.replaceAll('\n', '\r\n'), 'utf8');

    assert.equal(await readCanonicalText(crlfPath), await readCanonicalText(lfPath));
    await writeCanonicalText(outputPath, source.replaceAll('\n', '\r\n'));
    assert.deepEqual(await readFile(outputPath), Buffer.from(source));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('serialized Play documents match canonical generated HTML inputs', async () => {
  const [publicBetaHtml, unavailableHtml] = await Promise.all([
    readCanonicalText(new URL('../play-v2-public-beta.html', import.meta.url)),
    readCanonicalText(new URL('../play-v2-unavailable.html', import.meta.url))
  ]);

  assert.equal(PLAY_V2_PUBLIC_BETA_DOCUMENT, publicBetaHtml);
  assert.equal(PLAY_V2_UNAVAILABLE_DOCUMENT, unavailableHtml);
});
