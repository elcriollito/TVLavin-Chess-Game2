import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibraryRelease } from '../knowledge/consumer/library-reader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseId = 'rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84';
const releaseHash = 'da0b332b45933135eede26894ab8d23ece9f674299071bc8847e2da6a2811f37';
const selections = Object.freeze([
  { unitId: 'ku:endgames:pawn-foundations:direct-opposition', positionId: 'pos:direct-opposition:file', title: 'Recognize direct opposition', legend: 'White to move. Compare the kings on the e-file before choosing a route.', purpose: 'Recognize direct king opposition and the importance of the move.', arrows: ['e4d4'], squares: ['e4', 'e6'] },
  { unitId: 'ku:endgames:pawn-foundations:rule-of-the-square', positionId: 'pos:rule-square:a-pawn-white-king-outside', title: 'Test the pawn’s square', legend: 'White to move. Estimate whether the king can enter the pawn’s catching square.', purpose: 'Use board geometry to estimate a king-and-pawn race.', arrows: ['h1g2'], squares: ['a4', 'd4', 'd1'] },
  { unitId: 'ku:endgames:pawn-foundations:key-squares', positionId: 'pos:key-squares:central-pawn-route', title: 'Approach the key squares', legend: 'White to move. Identify a useful supporting square before advancing the pawn.', purpose: 'Turn king activity into a concrete supporting-square plan.', arrows: ['d3c3'], squares: ['c3', 'd3', 'e3'] },
  { unitId: 'ku:endgames:pawn-transformations:pawn-breakthrough', positionId: 'pos:pawn-breakthrough:three-versus-three', title: 'See the pawn breakthrough', legend: 'White to move. Trace the forcing sequence that creates a surviving passed pawn.', purpose: 'Study a forcing pawn transformation and its surviving passer.', arrows: ['b5b6', 'c5c6', 'a5a6'], squares: ['a7', 'b7', 'c7'], moveSequence: ['b6', 'axb6', 'c6', 'bxc6', 'a6'] }
]);

const reader = await loadLibraryRelease({ releasesDirectory: path.join(root, 'knowledge/releases'), releaseId });
if (reader.getReleaseFingerprint() !== releaseHash) throw new Error('INTERACTIVE_DIAGRAMS_RELEASE_FINGERPRINT_MISMATCH');
const diagrams = selections.map((selection, order) => {
  const unit = reader.getUnitById(selection.unitId);
  const position = unit?.positions.find(item => item.id === selection.positionId);
  const summary = reader.listUnitSummaries().find(item => item.id === selection.unitId);
  if (!unit || unit.status !== 'published' || summary?.verificationState !== 'verified') throw new Error(`INTERACTIVE_DIAGRAMS_UNIT_INELIGIBLE: ${selection.unitId}`);
  if (!position?.fen || position.validation.structural !== 'valid' || position.validation.educational !== 'verified') throw new Error(`INTERACTIVE_DIAGRAMS_POSITION_INELIGIBLE: ${selection.positionId}`);
  return { order: order + 1, diagramId: `icd-pilot-${order + 1}`, sourceUnitId: unit.id, sourcePositionId: position.id, releaseId, releaseHash, title: selection.title, legend: selection.legend, purpose: selection.purpose, fen: position.fen, sideToMove: position.sideToMove, arrows: selection.arrows, squares: selection.squares, moveSequence: selection.moveSequence || [], provenance: { sourceType: 'immutable-public-knowledge-release', contentHash: summary.contentHash }, buttons: false, playMode: false };
});
const manifest = { schema: 'CaissaInteractiveDiagramManifest@1.0.0', collectionId: 'caissa-knowledge-diagram-pilot', releaseId, releaseHash, maxDiagrams: 4, diagrams };
const output = `(function (global) {\n  'use strict';\n  global.CaissaInteractiveDiagramsManifest = Object.freeze(${JSON.stringify(manifest, null, 2)});\n}(window));\n`;
fs.writeFileSync(path.join(root, 'js/interactive-diagrams-manifest.js'), output);
console.log(`Generated ${manifest.schema}: ${diagrams.length} diagrams`);
