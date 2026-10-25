import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Chess } from 'chess.js';
import {
  ORIENTATION_INFERENCE_VERSION,
  ORIENTATION_THRESHOLDS,
  ORIENTATION_WEIGHTS,
  canonicalFenForOrientation,
  inferOrientation
} from '../scanner/orientation/scanner-orientation-inference.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e3 0 1';
const MIDGAME = 'r3k2r/pp1n1ppp/2pbpn2/q7/2BPP3/2N2N2/PPQ2PPP/R3K2R w KQkq e6 7 12';
const VIDEO_CANONICAL = '4k2r/ppp2ppp/2np4/4p3/3PP3/2N5/PPP2PPP/R3K3 w Kq e6 0 12';

function physicalFen(canonicalFen, orientation) {
  return orientation === 'black-bottom'
    ? canonicalFenForOrientation(canonicalFen, 'black-bottom')
    : canonicalFen;
}

function fenFromLabels(labels) {
  const ranks = [];
  for (let row = 0; row < 8; row += 1) {
    let rank = '';
    let empty = 0;
    for (const label of labels.slice(row * 8, row * 8 + 8)) {
      if (label === 'empty') empty += 1;
      else {
        if (empty) rank += empty;
        rank += label;
        empty = 0;
      }
    }
    ranks.push(rank + (empty || ''));
  }
  return `${ranks.join('/')} w - - 0 1`;
}

test('orientation contract is versioned, deterministic, documented, and local', () => {
  assert.equal(ORIENTATION_INFERENCE_VERSION, 'caissa-scanner-orientation-inference/1');
  assert.equal(Object.values(ORIENTATION_WEIGHTS).reduce((sum, value) => sum + value, 0), 1);
  assert.equal(ORIENTATION_THRESHOLDS.highMinimumPawns, 4);
  assert.deepEqual(inferOrientation(START), inferOrientation(START));
});

test('both hypotheses are exact bijective 180-degree mappings without recoloring', () => {
  const black = canonicalFenForOrientation(MIDGAME, 'black-bottom');
  const twice = canonicalFenForOrientation(black, 'black-bottom');
  assert.equal(twice, `${MIDGAME.split(' ')[0]} w - - 7 12`);
  assert.equal(canonicalFenForOrientation(MIDGAME, 'white-bottom'), `${MIDGAME.split(' ')[0]} w - - 7 12`);
  const pieces = (fen) => fen.split(' ')[0].replace(/[1-8/]/g, '').split('').sort();
  assert.deepEqual(pieces(black), pieces(MIDGAME));
  assert.equal(black.split(' ')[1], 'w');
  assert.equal(black.split(' ')[2], '-');
  assert.equal(black.split(' ')[3], '-');
});

test('starting position and normal middlegame select either physical orientation with high confidence', () => {
  for (const fen of [START, MIDGAME]) {
    for (const truth of ['white-bottom', 'black-bottom']) {
      const result = inferOrientation(physicalFen(fen, truth));
      assert.equal(result.recommendedOrientation, truth);
      assert.equal(result.orientationConfidence, 'HIGH');
      assert.equal(result.autoSelected, true);
      assert.match(result.orientationEvidence[0], /PAWN_DIRECTION_STRONG/);
    }
  }
});

test('video-observed black-bottom fixture scores black materially higher and maps bottom-left to h8', () => {
  const raw = physicalFen(VIDEO_CANONICAL, 'black-bottom');
  const result = inferOrientation(raw);
  assert.equal(result.recommendedOrientation, 'black-bottom');
  assert.equal(result.orientationConfidence, 'HIGH');
  assert.ok(result.blackBottomScore - result.whiteBottomScore >= ORIENTATION_THRESHOLDS.highMinimumMargin);
  assert.equal(result.canonicalFens['black-bottom'], `${VIDEO_CANONICAL.split(' ')[0]} w - - 0 12`);
  const bottomLeftCanonical = result.recommendedOrientation === 'black-bottom' ? 'h8' : 'a1';
  assert.equal(bottomLeftCanonical, 'h8');
});

test('pawn ranks dominate while piece-side distribution cannot create high confidence alone', () => {
  const pawnRich = inferOrientation('4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3 w - - 0 1');
  assert.equal(pawnRich.orientationConfidence, 'HIGH');
  assert.ok(pawnRich.hypotheses['white-bottom'].features.pawnDirection
    > pawnRich.hypotheses['black-bottom'].features.pawnDirection);

  const noPawns = inferOrientation('rr2k3/8/8/8/8/8/8/3K2RR w - - 0 1');
  assert.notEqual(noPawns.orientationConfidence, 'HIGH');
  assert.equal(noPawns.autoSelected, false);
  assert.ok(noPawns.hypotheses['white-bottom'].features.pieceSideDistribution
    > noPawns.hypotheses['black-bottom'].features.pieceSideDistribution);
});

test('structural guardrails and promotion plausibility are scored on both hypotheses', () => {
  const backRankPawn = inferOrientation('P3k3/8/8/8/8/8/8/4K2p w - - 0 1');
  for (const orientation of ['white-bottom', 'black-bottom']) {
    const hypothesis = backRankPawn.hypotheses[orientation];
    assert.equal(hypothesis.structuralStatus, 'REVIEW_REQUIRED');
    assert.ok(hypothesis.structuralWarningCodes.some((code) => code.includes('PAWN_ON_BACK_RANK')));
    assert.ok(hypothesis.features.structuralGuardrails < 1);
    assert.ok(hypothesis.features.promotionPlausibility < 1);
  }
});

test('advanced-pawn and promotion-race positions abstain instead of confidently choosing wrong', () => {
  const cases = [
    '7k/P7/8/8/8/8/7p/K7 w - - 0 1',
    '8/2P2k2/8/8/8/8/2K2p2/8 b - - 0 52',
    '8/3k4/2p2P2/3P4/4p3/2K5/8/8 w - - 0 40'
  ];
  for (const fen of cases) {
    assert.notEqual(inferOrientation(fen).orientationConfidence, 'HIGH');
  }
});

test('governed heuristic corpus has zero high-confidence wrong orientations', () => {
  const corpus = [
    ['starting position', START, 'white-bottom'],
    ['normal middlegame', MIDGAME, 'black-bottom'],
    ['endgame advanced king', '8/3k4/2p2p2/3Pp3/4P3/2K5/8/8 w - - 0 40', 'white-bottom'],
    ['advanced passed pawns', '6k1/2P3pp/8/8/8/8/PP4p1/6K1 w - - 0 38', 'black-bottom'],
    ['promotion race', '7k/P7/8/8/8/8/7p/K7 w - - 0 1', 'white-bottom'],
    ['opposite-side attack', '2kr3r/ppp2ppp/2n5/7Q/7q/2N5/PPP2PPP/R3K2R w - - 0 18', 'black-bottom'],
    ['material imbalance', '4k3/ppp2ppp/8/8/8/8/PPP2PPP/R2QK2R w - - 0 20', 'white-bottom'],
    ['multiple promoted pieces', 'qq2k2r/pp3ppp/8/8/8/8/PPP3PP/R2QK1QR w - - 0 32', 'black-bottom'],
    ['composition-like', 'K7/8/8/3q4/4Q3/8/8/7k w - - 0 1', 'white-bottom'],
    ['sparse endgame', '8/8/3k4/8/8/4K3/8/8 w - - 0 70', 'black-bottom']
  ];
  const outcomes = corpus.map(([name, fen, truth]) => {
    const result = inferOrientation(physicalFen(fen, truth));
    return { name, truth, result };
  });
  const high = outcomes.filter(({ result }) => result.orientationConfidence === 'HIGH');
  const wrong = high.filter(({ truth, result }) => result.recommendedOrientation !== truth);
  const ambiguous = outcomes.filter(({ result }) => result.orientationConfidence === 'LOW_AMBIGUOUS');
  assert.ok(high.length >= 4);
  assert.equal(wrong.length, 0);
  assert.ok(ambiguous.length >= 1);
});

test('governed real-development truth has zero high-confidence wrong orientations', async () => {
  const corpus = JSON.parse(await readFile(new URL('../scanner/recognition/datasets/real-development/real-development-v0.2-certified.json', import.meta.url)));
  const outcomes = corpus.samples.map((sample) => {
    // Certified labels are canonical; reconstruct the physical image grid for the declared view.
    const physicalLabels = sample.orientation === 'black-at-bottom' ? [...sample.labels].reverse() : sample.labels;
    return {
      truth: sample.orientation.replace('-at-', '-'),
      result: inferOrientation(fenFromLabels(physicalLabels))
    };
  });
  const high = outcomes.filter(({ result }) => result.orientationConfidence === 'HIGH');
  const wrong = high.filter(({ truth, result }) => result.recommendedOrientation !== truth);
  const ambiguous = outcomes.filter(({ result }) => result.orientationConfidence === 'LOW_AMBIGUOUS');
  assert.equal(corpus.sourceRole, 'development-only');
  assert.equal(outcomes.length, 41);
  assert.equal(high.length, 28);
  assert.equal(wrong.length, 0);
  assert.equal(ambiguous.length, 7);
});

test('promotion, SAN and UCI remain canonical under either view', () => {
  const whiteFen = '7k/P7/8/8/8/8/8/K7 w - - 0 1';
  const blackFen = '7k/8/8/8/8/8/p7/7K b - - 0 1';
  const white = new Chess(whiteFen).moves({ square: 'a7', verbose: true });
  const black = new Chess(blackFen).moves({ square: 'a2', verbose: true });
  assert.deepEqual(white.map((move) => move.to), ['a8', 'a8', 'a8', 'a8']);
  assert.deepEqual(black.map((move) => move.to), ['a1', 'a1', 'a1', 'a1']);
  assert.ok(white.every((move) => move.san.includes('a8=')));
  assert.ok(black.every((move) => move.san.includes('a1=')));
  assert.ok(white.every((move) => move.from + move.to + move.promotion === `a7a8${move.promotion}`));
  assert.ok(black.every((move) => move.from + move.to + move.promotion === `a2a1${move.promotion}`));
});
