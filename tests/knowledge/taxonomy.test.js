import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleOfTheSquare } from '../../knowledge/domains/endgames/pawn-foundations/rule-of-the-square/unit.js';
import { TAXONOMY_REGISTRIES } from '../../knowledge/taxonomy/registries.js';
import { validateTaxonomyRegistries } from '../../knowledge/taxonomy/validate-taxonomy.js';
import { validateKnowledgeRepository } from '../../knowledge/validation/validate-knowledge.js';

const registries = () => structuredClone(TAXONOMY_REGISTRIES);
const unit = () => structuredClone(ruleOfTheSquare);
const taxonomyCodes = value => validateTaxonomyRegistries(value).errors.map(error => error.code);
const unitCodes = (value, options) => validateKnowledgeRepository([value], options).errors.map(error => error.code);

test('accepts the production taxonomy registry', () => {
    assert.deepEqual(validateTaxonomyRegistries(), { valid: true, errors: [] });
});

test('rejects duplicate taxonomy ids', () => {
    const value = registries();
    value.skills.entries.push(structuredClone(value.skills.entries[0]));
    assert.ok(taxonomyCodes(value).includes('duplicate-taxonomy-id'));
});

test('rejects unknown parents and parent cycles', () => {
    const unknown = registries();
    unknown.skills.entries[0].parentId = 'missing';
    assert.ok(taxonomyCodes(unknown).includes('unknown-taxonomy-parent'));
    const cycle = registries();
    cycle.skills.entries[0].parentId = cycle.skills.entries[1].id;
    cycle.skills.entries[1].parentId = cycle.skills.entries[0].id;
    assert.ok(taxonomyCodes(cycle).includes('taxonomy-parent-cycle'));
});

test('rejects duplicate aliases', () => {
    const value = registries();
    value.skills.entries[0].aliases = ['shared'];
    value.skills.entries[1].aliases = ['shared'];
    assert.ok(taxonomyCodes(value).includes('duplicate-taxonomy-alias'));
});

test('rejects invalid replacements and replacement cycles', () => {
    const invalid = registries();
    invalid.themes.entries.find(value => value.id === 'pawn-race').replacementId = 'missing';
    assert.ok(taxonomyCodes(invalid).includes('invalid-taxonomy-replacement'));
    const cycle = registries();
    const active = cycle.themes.entries.find(value => value.id === 'pawn-races');
    active.status = 'deprecated';
    active.replacementId = 'pawn-race';
    assert.ok(taxonomyCodes(cycle).includes('taxonomy-replacement-cycle'));
});

test('rejects invalid domain scope', () => {
    const value = registries();
    value.skills.entries[0].domainScope = 'missing-domain';
    assert.ok(taxonomyCodes(value).includes('taxonomy-scope-mismatch'));
});

test('rejects unknown and deprecated Knowledge Unit taxonomy values', () => {
    const unknown = unit();
    unknown.education.skills = ['unknown-skill'];
    assert.ok(unitCodes(unknown).includes('unknown-taxonomy-value'));
    const deprecated = unit();
    deprecated.education.themes = ['pawn-race'];
    assert.ok(unitCodes(deprecated).includes('deprecated-taxonomy-value'));
});

test('allows proposed taxonomy only for explicit editorial draft validation', () => {
    const value = unit();
    value.status = 'draft';
    value.education.themes = ['candidate-endgame-theme'];
    assert.ok(unitCodes(value).includes('proposed-taxonomy-value'));
    assert.equal(unitCodes(value, { allowProposedTaxonomy: true }).includes('proposed-taxonomy-value'), false);
});
