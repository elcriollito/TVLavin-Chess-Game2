import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleOfTheSquare } from '../../knowledge/domains/endgames/pawn-foundations/rule-of-the-square/unit.js';
import { createKnowledgeLoader, KnowledgeRepositoryError } from '../../knowledge/loaders/knowledge-loader.js';
import { validateKnowledgeRepository } from '../../knowledge/validation/validate-knowledge.js';

const unit = () => {
    const value = structuredClone(ruleOfTheSquare);
    value.education.prerequisites = [];
    value.relationships = [];
    return value;
};
const codes = units => validateKnowledgeRepository(units).errors.map(error => error.code);

test('accepts a valid Knowledge Unit and the production exemplar', () => {
    assert.deepEqual(validateKnowledgeRepository([unit()]), { valid: true, errors: [] });
});
test('rejects missing required identity and educational fields', () => {
    const value = unit();
    delete value.id;
    value.education.learningObjectives = [];
    assert.ok(codes([value]).includes('required-field'));
    assert.ok(codes([value]).includes('required-education'));
});

test('rejects duplicate ids', () => {
    const second = unit();
    second.slug = 'another-slug';
    assert.ok(codes([unit(), second]).includes('duplicate-id'));
});

test('rejects duplicate slugs within a domain', () => {
    const second = unit();
    second.id = 'ku:endgames:pawn-foundations:second';
    assert.ok(codes([unit(), second]).includes('duplicate-slug'));
});

test('rejects unsupported schema versions', () => {
    const value = unit();
    value.schemaVersion = '2.0.0';
    assert.ok(codes([value]).includes('unsupported-schema-version'));
});

test('rejects unknown relationship targets', () => {
    const value = unit();
    value.relationships.push({ type: 'related', targetId: 'ku:endgames:missing', reason: 'test' });
    assert.ok(codes([value]).includes('invalid-relationship-target'));
});

test('rejects self-references', () => {
    const value = unit();
    value.education.prerequisites.push(value.id);
    assert.ok(codes([value]).includes('self-reference'));
});

test('rejects invalid FEN', () => {
    const value = unit();
    value.positions[0].fen = 'not a fen';
    assert.ok(codes([value]).includes('invalid-fen'));
});

test('rejects invalid locale declarations', () => {
    const value = unit();
    value.localization.availableLocales = ['en-US', 'en-US'];
    assert.ok(codes([value]).includes('invalid-locale-metadata'));
});

test('production loader excludes drafts unless explicitly included', () => {
    const draft = unit();
    draft.status = 'draft';
    assert.equal(createKnowledgeLoader({ units: [draft] }).loadAll().length, 0);
    assert.equal(createKnowledgeLoader({ units: [draft], includeDrafts: true }).loadAll().length, 1);
});

test('loader ordering is deterministic and independent of manifest order', () => {
    const first = unit();
    first.id = 'ku:endgames:z';
    first.slug = 'z';
    const second = unit();
    second.id = 'ku:endgames:a';
    second.slug = 'a';
    assert.deepEqual(createKnowledgeLoader({ units: [first, second] }).loadAll().map(value => value.id), ['ku:endgames:a', 'ku:endgames:z']);
    assert.deepEqual(createKnowledgeLoader({ units: [second, first] }).loadAll().map(value => value.id), ['ku:endgames:a', 'ku:endgames:z']);
});

test('loads successfully by id and scoped slug', () => {
    const loader = createKnowledgeLoader();
    assert.equal(loader.loadById(ruleOfTheSquare.id)?.slug, ruleOfTheSquare.slug);
    assert.equal(loader.loadBySlug(ruleOfTheSquare.slug, 'endgames')?.id, ruleOfTheSquare.id);
});

test('loader clearly reports malformed repositories', () => {
    assert.throws(() => createKnowledgeLoader({ units: [unit(), unit()] }), KnowledgeRepositoryError);
});
