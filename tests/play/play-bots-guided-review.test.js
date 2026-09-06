import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/bots/bots-guided-review-presentation.js', import.meta.url), 'utf8');
const policySource = fs.readFileSync(new URL('../../js/play/analyze-review-policy-v1-1.js', import.meta.url), 'utf8');

function load() {
    const window = { document: {}, CaissaBotsReviewContext: { isBotsReview: value => value?.sourceMode === 'bots' } };
    window.window = window; window.globalThis = window;
    const context = { window, globalThis: window, Object, Array, Number, String, Math };
    vm.runInNewContext(policySource, context); vm.runInNewContext(source, context);
    return window.CaissaBotsGuidedReviewPresentation;
}

const results = [
    { moveIndex: 0, quality: 'Book', annotation: 'book', evalAfter: .2, bookEvidence: { name: 'English Opening' } },
    { moveIndex: 1, quality: 'Inaccuracy', annotation: '?!', evalAfter: .8,
        recommendationAvailable: true, bestMoveSan: 'e5' },
    { moveIndex: 2, quality: 'Acceptable', annotation: '', evalAfter: .7 },
    { moveIndex: 3, quality: 'Mistake', annotation: '?', evalAfter: 1.6,
        recommendationAvailable: true, bestMoveSan: 'Nf6' },
    { moveIndex: 4, quality: 'Blunder', annotation: '??', evalAfter: -2.1 }
];

function analyze(index = 1) {
    return { currentMoveIndex: index, analysisResults: results,
        getLoadedMoves: () => ['c4', 'd5', 'cxd5', 'Qxd5', 'Nc3'] };
}

test('Bots review moments include both colors and use AnalyzeSection currentMoveIndex', () => {
    const api = load(); const owner = analyze(1);
    assert.deepEqual([...api.findReviewMoments(owner)], [1, 3, 4]);
    assert.equal(api.findNextReviewMoment(owner), 3);
    owner.currentMoveIndex = 3;
    assert.equal(api.findNextReviewMoment(owner), 4);
    assert.equal(api.getSnapshot().reviewPlyOwner, 'AnalyzeSection.currentMoveIndex');
});

test('guided copy uses completed evidence without technical engine metadata', () => {
    const api = load();
    const model = api.createGuidedModel({ analyze: analyze(1),
        handoff: { payload: { playerColor: 'white' } } });
    assert.equal(model.quality, 'Inaccuracy');
    assert.equal(model.move, 'd5');
    assert.match(model.message, /opponent played d5/i);
    assert.match(model.message, /e5 was the stronger continuation/i);
    assert.doesNotMatch(`${model.message} ${model.detail}`, /centipawn|depth|nodes|hash|threads|multipv/i);
});

test('Bots presentation normalizes Mistake and Blunder symbols without reclassifying evidence', () => {
    const api = load();
    assert.equal(api.presentationAnnotation({ quality: 'Mistake', annotation: '!' }), '?');
    assert.equal(api.presentationAnnotation({ quality: 'Blunder', annotation: '!' }), '??');
    assert.equal(api.presentationAnnotation({ quality: 'Inaccuracy', annotation: '?!' }), '?!');
    assert.equal(api.presentationAnnotation({ quality: 'Book', annotation: '' }), '📖');
    assert.equal(api.presentationAnnotation({ quality: 'Mistake', annotation: '?', unavailable: true }), '');
});

test('presentation declares no duplicate chess, PGN, result, classifier, or engine owner', () => {
    assert.doesNotMatch(source, /new\s+Chess|new\s+Worker|reviewMoveIndex|botReviewIndex|App\.(?:moveHistory|game)\s*=|classifyMove|startAnalysis\(/);
    assert.match(source, /reviewPlyOwner: 'AnalyzeSection\.currentMoveIndex'/);
    assert.match(source, /analysisResultsOwner: 'AnalyzeSection\.analysisResults'/);
    assert.match(source, /mounted\.analyze\.jumpToMove/);
});

test('Bots Analysis shares read-only snapshots with the production floating Mentor shell', () => {
    const postGame = fs.readFileSync(new URL('../../js/play/post-game-core.js', import.meta.url), 'utf8');
    assert.match(postGame, /sourceMode === 'bots'[\s\S]*requestMentorStudy[\s\S]*this\.#analyze\(\)/);
    assert.doesNotMatch(source, /data-bots-mentor-study|mentorAnswer|mentorActions|mentorMessage/);
    assert.match(source, /CaissaMentorFloatingShell/);
    assert.match(source, /setContext\(\{ source: 'bots-analysis-study', fen: state\.currentFen/);
    assert.match(source, /CaissaBotsAnalysisExploration\?\.getSnapshot/);
    assert.match(source, /mounted\?\.analyze\?\.analysisResults/);
    assert.match(source, /stopMentorSharing\(\); root\.CaissaBotsAnalysisExploration\?\.leave/);
    assert.doesNotMatch(source, /(?:const|let|var)\s+mentor(?:MoveIndex|Fen|Pgn|Engine|Board)\b/i);
    assert.doesNotMatch(source, /new\s+Chess|new\s+Worker|createBoard|Chessboard\s*\(/);
});

test('Study source projects authoritative annotations while temporary moves remain unclassified', () => {
    assert.match(source, /kind === 'source' \? mounted\.analyze\.analysisResults\?\.\[move\.index\]/);
    assert.match(source, /kind === 'source' && symbol/);
    assert.match(source, /data-bots-exploration-annotation/);
    assert.doesNotMatch(source, /kind === 'temporary'[\s\S]{0,120}data-bots-exploration-annotation/);
});
