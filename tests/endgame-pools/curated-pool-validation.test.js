import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    validateAuthoredPoolSource, validatePublishedPoolArtifact
} from '../../js/endgame-trainer/v2/curated-pool-validator.js';

const source = JSON.parse(await readFile(new URL(
    '../../endgame-pools/authoring/pools/caissa-king-pawn-decisions-1.0.0.json',
    import.meta.url
), 'utf8'));
const artifact = JSON.parse(await readFile(new URL(
    '../../public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json',
    import.meta.url
), 'utf8'));

function changed(operation) {
    const copy = structuredClone(source);
    operation(copy);
    return validateAuthoredPoolSource(copy);
}

test('reviewed authored source validates with ten explicit positions', () => {
    const result = validateAuthoredPoolSource(source);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(source.positions.length, 10);
});

test('source validator rejects schema, provenance, duplicate, objective, hint, and alternative defects', () => {
    assert.equal(changed((copy) => { copy.schemaVersion = '99.0.0'; }).errors[0].code, 'unsupported-pool-schema');
    assert.ok(changed((copy) => { copy.positions[0].provenance = {}; }).errors.some(({ code }) => code === 'missing-provenance'));
    assert.ok(changed((copy) => { copy.positions[1].positionId = copy.positions[0].positionId; }).errors.some(({ code }) => code === 'duplicate-position-id'));
    assert.ok(changed((copy) => { copy.positions[0].objective.type = 'win'; }).errors.some(({ code }) => code === 'unsupported-objective'));
    assert.ok(changed((copy) => { copy.positions[0].hintStages[0].text = '<b>hint</b>'; }).errors.some(({ code }) => code === 'invalid-hint-stage'));
    assert.ok(changed((copy) => { copy.positions[0].acceptedAlternatives = ['a1a8']; }).errors.some(({ code }) => code === 'illegal-accepted-alternative'));
});

test('chess validation rejects malformed FEN, illegal answer, and side mismatch', () => {
    assert.ok(changed((copy) => { copy.positions[0].fen = 'invalid'; }).errors.some(({ code }) => code === 'invalid-fen'));
    assert.ok(changed((copy) => { copy.positions[0].expectedMove = 'a1a8'; }).errors.some(({ code }) => code === 'illegal-expected-move'));
    assert.ok(changed((copy) => { copy.positions[0].sideToMove = 'black'; }).errors.some(({ code }) => code === 'side-to-move-mismatch'));
});

test('published artifact validates membership, fingerprint, and truthful eligibility', () => {
    assert.equal(validatePublishedPoolArtifact(artifact).valid, true);
    const altered = structuredClone(artifact);
    altered.positions[0].expectedSan = 'Ka1';
    const result = validatePublishedPoolArtifact(altered);
    assert.ok(result.errors.some(({ code }) => code === 'expected-san-mismatch'));
    assert.ok(result.errors.some(({ code }) => code === 'content-fingerprint-mismatch'));
});

test('tablebase status requires a real reference and is absent from reviewed pool', () => {
    assert.equal(artifact.verificationSummary.tablebaseVerifiedCount, 0);
    assert.ok(changed((copy) => {
        copy.positions[0].verification.tablebaseVerified = true;
    }).errors.some(({ code }) => code === 'unsubstantiated-tablebase-claim'));
});
