import { chromium } from '@playwright/test';
import { readdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const privateRoot = resolve(args['private-root'] || '');
const output = resolve(args.write || '');
const baseUrl = String(args.url || 'http://127.0.0.1:8000').replace(/\/$/, '');
if (!args['private-root'] || !args.write) {
  throw new Error('Usage: node browser-evaluate-cohort.mjs --private-root=<external-folder> --write=<external-json> [--url=http://127.0.0.1:8000]');
}
const names = (await readdir(join(privateRoot, 'originals')))
  .filter((name) => ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(name).toLowerCase())).sort();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`${baseUrl}/scanner/index.html`);
await page.waitForFunction(() => Boolean(window.CaissaScannerImageDecode && window.CaissaScannerRecognitionRuntime));
await page.evaluate(() => {
  const input = document.createElement('input');
  input.type = 'file';
  input.id = 'fieldHardAuditInput';
  document.body.append(input);
});
const samples = [];
try {
  for (const [index, name] of names.entries()) {
    await page.locator('#fieldHardAuditInput').setInputFiles(join(privateRoot, 'originals', name));
    const sample = await page.evaluate(async ({ generation, sampleId }) => {
      const file = document.querySelector('#fieldHardAuditInput').files[0];
      const runtime = window.CaissaScannerRecognitionRuntime.create({ isGenerationCurrent: () => true });
      const started = performance.now();
      try {
        const result = await runtime.processImage(file, generation);
        const candidates = result.diagnostics?.candidateSummaries || [];
        const accepted = candidates.filter((candidate) => candidate.accepted);
        return {
          sampleId,
          ok: true,
          errorCode: null,
          preprocessing: result.metadata,
          selectedCorners: result.board.corners,
          candidateCount: candidates.length,
          acceptedCandidateCount: accepted.length,
          selectedCandidateScore: accepted[0]?.candidateScore ?? candidates[0]?.candidateScore ?? null,
          runnerUpCandidateScore: accepted[1]?.candidateScore ?? candidates[1]?.candidateScore ?? null,
          scoreMargin: accepted[0] && accepted[1]
            ? accepted[0].candidateScore - accepted[1].candidateScore : null,
          selectedSource: accepted[0]?.source ?? candidates[0]?.source ?? null,
          geometryScore: accepted[0]?.geometryScore ?? candidates[0]?.geometryScore ?? null,
          gridScore: accepted[0]?.gridEvidenceScore ?? candidates[0]?.gridEvidenceScore ?? null,
          checkerScore: accepted[0]?.checkerEvidenceScore ?? candidates[0]?.checkerEvidenceScore ?? null,
          gridPhaseScore: accepted[0]?.gridPhaseEvidenceScore ?? candidates[0]?.gridPhaseEvidenceScore ?? null,
          supportBoundary: result.diagnostics?.supportBoundary || null,
          candidateSummaries: candidates,
          timing: result.timing,
          measuredWallMs: performance.now() - started
        };
      } catch (error) {
        const candidates = error.diagnostics?.candidateSummaries || [];
        const accepted = candidates.filter((candidate) => candidate.accepted);
        return {
          sampleId,
          ok: false,
          errorCode: error.code || error.message,
          preprocessing: null,
          selectedCorners: accepted[0]?.corners ?? candidates[0]?.corners ?? null,
          candidateCount: candidates.length,
          acceptedCandidateCount: accepted.length,
          selectedCandidateScore: accepted[0]?.candidateScore ?? candidates[0]?.candidateScore ?? null,
          runnerUpCandidateScore: accepted[1]?.candidateScore ?? candidates[1]?.candidateScore ?? null,
          scoreMargin: accepted[0] && accepted[1]
            ? accepted[0].candidateScore - accepted[1].candidateScore : null,
          selectedSource: accepted[0]?.source ?? candidates[0]?.source ?? null,
          geometryScore: accepted[0]?.geometryScore ?? candidates[0]?.geometryScore ?? null,
          gridScore: accepted[0]?.gridEvidenceScore ?? candidates[0]?.gridEvidenceScore ?? null,
          checkerScore: accepted[0]?.checkerEvidenceScore ?? candidates[0]?.checkerEvidenceScore ?? null,
          gridPhaseScore: accepted[0]?.gridPhaseEvidenceScore ?? candidates[0]?.gridPhaseEvidenceScore ?? null,
          supportBoundary: error.diagnostics?.supportBoundary || null,
          candidateSummaries: candidates,
          timing: error.timing || null,
          measuredWallMs: performance.now() - started
        };
      } finally {
        runtime.dispose();
      }
    }, { generation: index + 1, sampleId: name.replace(/\.[^.]+$/, '') });
    samples.push(sample);
  }
} finally {
  await browser.close();
}
const report = {
  schemaVersion: 'caissa-scanner-localization-field-hard-browser-diagnostics/1',
  runtime: 'chromium-browser-production-decode-and-worker',
  sampleCount: samples.length,
  returnedBoard: samples.filter((sample) => sample.ok).length,
  abstained: samples.filter((sample) => !sample.ok).length,
  meanWallMs: samples.reduce((sum, sample) => sum + sample.measuredWallMs, 0) / samples.length,
  samples
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ sampleCount: report.sampleCount, returnedBoard: report.returnedBoard,
  abstained: report.abstained, meanWallMs: report.meanWallMs, output }));
