import { expect, test } from '@playwright/test';
import { createAnnotatorServer } from '../../tools/scanner-localization-annotator/serve.mjs';

let running;

test.beforeAll(async () => {
  running = await createAnnotatorServer({ port: 0 });
});

test.afterAll(async () => {
  await running?.close();
});

test('dev-only annotator verifies a local image, maps four clicks, and writes only the annotation manifest', async ({ page }) => {
  await page.addInitScript(() => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#eee"/><path d="M20 20H180V180H20Z" fill="#8b6"/></svg>';
    window.__annotationWrites = {};

    class FakeFileHandle {
      constructor(name, getFile, writable = false) {
        this.kind = 'file';
        this.name = name;
        this._getFile = getFile;
        this._writable = writable;
      }
      async getFile() { return this._getFile(); }
      async createWritable() {
        if (!this._writable) throw new DOMException('Read only', 'NotAllowedError');
        let value = '';
        return {
          write: async (next) => { value = String(next); },
          close: async () => { window.__annotationWrites[this.name] = value; }
        };
      }
    }

    window.showDirectoryPicker = async () => {
      const imageFile = new File([svg], 'sample.svg', { type: 'image/svg+xml' });
      const digest = await crypto.subtle.digest('SHA-256', await imageFile.arrayBuffer());
      const checksum = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
      const manifest = {
        corpus: 'caissa-scanner-real-localization-corpus-v0.1',
        status: 'annotation-pending',
        samples: [{
          sampleId: 'browser-real-001',
          originalFile: 'originals/sample.svg',
          originalSha256: checksum,
          provenance: 'Browser test fixture',
          permissionUseCategory: 'test-only',
          boardPresent: true,
          referenceSystem: 'Chessvision',
          referenceOutcome: 'success',
          difficultyTags: ['digital-screen-clean'],
          split: null
        }]
      };
      const manifestFile = new File([`${JSON.stringify(manifest, null, 2)}\n`], 'manifest-starter.json', { type: 'application/json' });
      const outputHandle = new FakeFileHandle('localization-hard-v0.1.annotated.json', () => new File([], 'localization-hard-v0.1.annotated.json'), true);
      const originals = {
        kind: 'directory',
        name: 'originals',
        getFileHandle: async (name) => {
          if (name !== 'sample.svg') throw new DOMException('Missing', 'NotFoundError');
          return new FakeFileHandle(name, () => imageFile);
        }
      };
      return {
        kind: 'directory',
        name: 'fixture-corpus',
        getDirectoryHandle: async (name) => {
          if (name !== 'originals') throw new DOMException('Missing', 'NotFoundError');
          return originals;
        },
        getFileHandle: async (name, options = {}) => {
          if (name === 'manifest-starter.json') return new FakeFileHandle(name, () => manifestFile);
          if (name === 'localization-hard-v0.1.annotated.json' && options.create) return outputHandle;
          throw new DOMException('Missing', 'NotFoundError');
        }
      };
    };
  });

  await page.goto(running.url);
  await page.getByRole('button', { name: 'Open corpus folder' }).click();
  await expect(page.locator('#checksum')).toContainText('SHA-256 verified');
  const image = page.locator('#source-image');
  await expect(image).toBeVisible();
  const box = await image.boundingBox();
  expect(box).toBeTruthy();
  const click = (x, y) => image.click({ position: { x: box.width * x, y: box.height * y } });
  await click(.1, .1);
  await click(.9, .1);
  await click(.9, .9);
  await click(.1, .9);
  await expect(page.locator('.corner-point')).toHaveCount(4);
  await expect(page.getByText('Review the quadrilateral, then Confirm')).toBeVisible();
  await page.getByRole('button', { name: /Confirm/ }).click();
  await expect(page.locator('#message')).toContainText('Saved locally');

  const writes = await page.evaluate(() => window.__annotationWrites);
  expect(Object.keys(writes)).toEqual(['localization-hard-v0.1.annotated.json']);
  const output = JSON.parse(writes['localization-hard-v0.1.annotated.json']);
  expect(output.status).toBe('annotation-complete');
  expect(output.samples[0].annotation.cornerOrder).toBe('tl-tr-br-bl');
  expect(Object.keys(output.samples[0].groundTruth.playableBoardCorners)).toEqual([
    'topLeft', 'topRight', 'bottomRight', 'bottomLeft'
  ]);
  expect(output.samples[0].split).toBeNull();
});

test('v0.3 folder opens with negatives complete and incomplete filter limited to pending positives', async ({ page }) => {
  await page.addInitScript(() => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ddd"/></svg>';
    const image = new File([svg], 'sample.svg', { type: 'image/svg+xml' });
    window.__annotationWrites = {};
    window.showDirectoryPicker = async () => {
      const digest = await crypto.subtle.digest('SHA-256', await image.arrayBuffer());
      const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
      const base = { originalSha256: hash, provenance: 'user-provided-internal-evaluation',
        difficultyTags: [], split: null };
      const manifest = { corpus: 'scanner-localization-hard-v0.3', corpusVersion: 'scanner-localization-hard-v0.3',
        samples: [
          { ...base, sampleId: 'real-v03-positive-001', originalFile: 'originals/sample.svg',
            boardPresent: true, annotationStatus: 'pending' },
          { ...base, sampleId: 'real-v03-negative-001', originalFile: 'hard-negatives/sample.svg',
            boardPresent: false, annotationStatus: 'verified-negative' }
        ] };
      const manifestFile = new File([`${JSON.stringify(manifest, null, 2)}\n`], 'manifest-starter-v0.3.json');
      const fileHandle = (name, content, writable = false) => ({
        kind: 'file', name, getFile: async () => content,
        createWritable: async () => {
          if (!writable) throw new DOMException('Read only', 'NotAllowedError');
          let value = '';
          return { write: async (next) => { value = String(next); },
            close: async () => { window.__annotationWrites[name] = value; } };
        }
      });
      const imageDirectory = { kind: 'directory', getFileHandle: async (name) => {
        if (name !== 'sample.svg') throw new DOMException('Missing', 'NotFoundError');
        return fileHandle(name, image);
      } };
      return { kind: 'directory', getDirectoryHandle: async (name) => {
        if (!['originals', 'hard-negatives'].includes(name)) throw new DOMException('Missing', 'NotFoundError');
        return imageDirectory;
      }, getFileHandle: async (name, options = {}) => {
        if (name === 'manifest-starter-v0.3.json') return fileHandle(name, manifestFile);
        if (name === 'localization-hard-v0.3.annotated.json' && options.create) {
          return fileHandle(name, new File([], name), true);
        }
        throw new DOMException('Missing', 'NotFoundError');
      } };
    };
  });
  await page.goto(running.url);
  await page.getByRole('button', { name: 'Open corpus folder' }).click();
  await expect(page.locator('#checksum')).toContainText('SHA-256 verified');
  await expect(page.locator('#progress')).toContainText('1 / 2 completed');
  await page.locator('#incomplete-only').check();
  await expect(page.locator('#sample-select option')).toHaveCount(1);
  await expect(page.locator('#sample-select')).toHaveValue('real-v03-positive-001');
  const image = page.locator('#source-image');
  const box = await image.boundingBox();
  for (const [x, y] of [[.1, .1], [.9, .1], [.9, .9], [.1, .9]]) {
    await image.click({ position: { x: box.width * x, y: box.height * y } });
  }
  await page.getByRole('button', { name: /Confirm/ }).click();
  await expect(page.locator('#progress')).toContainText('2 / 2 completed');
  const writes = await page.evaluate(() => window.__annotationWrites);
  expect(Object.keys(writes)).toEqual(['localization-hard-v0.3.annotated.json']);
  const output = JSON.parse(writes['localization-hard-v0.3.annotated.json']);
  expect(output.sourceManifest.file).toBe('manifest-starter-v0.3.json');
  expect(output.samples[1].annotationStatus).toBe('verified-negative');
  expect(output.samples[1].groundTruth).toBeUndefined();
});

test('loopback server exposes static files only and refuses writes', async ({ request }) => {
  const root = await request.get(running.url);
  expect(root.status()).toBe(200);
  const post = await request.post(running.url, { data: 'forbidden' });
  expect(post.status()).toBe(405);
  const missing = await request.get(`${running.url}/api/corpus`);
  expect(missing.status()).toBe(404);
});

test('main CAISSA server does not expose the developer annotator', async ({ request }) => {
  const response = await request.get('/tools/scanner-localization-annotator/index.html');
  expect(response.status()).toBe(404);
});
