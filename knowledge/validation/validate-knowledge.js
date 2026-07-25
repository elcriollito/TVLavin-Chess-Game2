import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import {
    KNOWLEDGE_STATUSES, SUPPORTED_KNOWLEDGE_SCHEMA_VERSIONS
} from '../schema/knowledge-unit.js';
import { TAXONOMY_LOOKUPS, TAXONOMY_REGISTRIES } from '../taxonomy/registries.js';
import { validateTaxonomyRegistries } from '../taxonomy/validate-taxonomy.js';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const LOCALE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|\d{3})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_ARRAYS = ['themes', 'skills', 'learningObjectives', 'masteryCriteria'];
const PUBLIC_STATUSES = new Set(['approved', 'published']);

const issue = (code, unitId, path, message) => ({ code, unitId: unitId ?? '', path, message });
const text = value => typeof value === 'string' && value.trim().length > 0;
const hasHtml = value => typeof value === 'string' && /<[^>]+>/.test(value);
const duplicates = values => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

function taxonomyIssue(unit, path, value, registryName, options) {
    const record = TAXONOMY_LOOKUPS[registryName]?.get(value);
    const expected = TAXONOMY_REGISTRIES[registryName]?.id ?? registryName;
    if (!record) return issue('unknown-taxonomy-value', unit?.id, path, `Unknown value "${value}"; expected registry "${expected}"`);
    if (record.domainScope && record.domainScope !== unit?.domain) {
        return issue('taxonomy-scope-mismatch', unit?.id, path, `Value "${value}" is scoped to domain "${record.domainScope}"`);
    }
    if (record.status === 'deprecated') {
        return issue('deprecated-taxonomy-value', unit?.id, path, `Value "${value}" is deprecated${record.replacementId ? `; use "${record.replacementId}"` : ''}`);
    }
    if (record.status === 'proposed' && !(options.allowProposedTaxonomy === true && unit?.status === 'draft')) {
        return issue('proposed-taxonomy-value', unit?.id, path, `Value "${value}" is proposed and allowed only in explicit draft validation`);
    }
    return null;
}

function checkTaxonomy(errors, unit, path, value, registryName, options) {
    if (typeof value !== 'string') {
        errors.push(issue('malformed-taxonomy-value', unit?.id, path,
            `Malformed value "${String(value)}"; expected registry "${TAXONOMY_REGISTRIES[registryName]?.id ?? registryName}"`));
        return;
    }
    const error = taxonomyIssue(unit, path, value, registryName, options);
    if (error) errors.push(error);
}

function validateUnit(unit, options) {
    const id = unit?.id;
    const errors = [];
    for (const field of ['id', 'slug', 'domain', 'status', 'schemaVersion', 'contentVersion']) {
        if (!text(unit?.[field])) errors.push(issue('required-field', id, field, `${field} is required`));
    }
    if (text(unit?.schemaVersion) && !SUPPORTED_KNOWLEDGE_SCHEMA_VERSIONS.includes(unit.schemaVersion)) {
        errors.push(issue('unsupported-schema-version', id, 'schemaVersion', `Unsupported schema version: ${unit.schemaVersion}`));
    }
    if (text(unit?.contentVersion) && !SEMVER.test(unit.contentVersion)) {
        errors.push(issue('invalid-content-version', id, 'contentVersion', 'contentVersion must be SemVer'));
    }
    if (text(unit?.status) && !KNOWLEDGE_STATUSES.includes(unit.status)) {
        errors.push(issue('invalid-status', id, 'status', `Invalid status: ${unit.status}`));
    }
    checkTaxonomy(errors, unit, 'domain', unit?.domain, 'domains', options);
    if (!unit?.education || !text(unit.education.knowledgeType) || !text(unit.education.difficulty) || !text(unit.education.expectedLearnerLevel)) {
        errors.push(issue('required-education', id, 'education', 'Educational classification is incomplete'));
    }
    for (const field of REQUIRED_ARRAYS) {
        if (!Array.isArray(unit?.education?.[field]) || unit.education[field].length === 0 || unit.education[field].some(value => !text(value))) {
            errors.push(issue('required-education', id, `education.${field}`, `${field} must contain values`));
        }
    }
    checkTaxonomy(errors, unit, 'education.knowledgeType', unit?.education?.knowledgeType, 'knowledgeTypes', options);
    if (unit?.education?.endgameFamily) checkTaxonomy(errors, unit, 'education.endgameFamily', unit.education.endgameFamily, 'endgameFamilies', options);
    (unit?.education?.themes ?? []).forEach((value, index) => checkTaxonomy(errors, unit, `education.themes[${index}]`, value, 'themes', options));
    (unit?.education?.skills ?? []).forEach((value, index) => checkTaxonomy(errors, unit, `education.skills[${index}]`, value, 'skills', options));
    checkTaxonomy(errors, unit, 'education.difficulty', unit?.education?.difficulty, 'difficulties', options);
    checkTaxonomy(errors, unit, 'education.expectedLearnerLevel', unit?.education?.expectedLearnerLevel, 'learnerLevels', options);
    const localization = unit?.localization;
    if (!localization || !text(localization.defaultLocale) || !Array.isArray(localization.availableLocales) || !localization.availableLocales.length) {
        errors.push(issue('invalid-locale-metadata', id, 'localization', 'A default and at least one available locale are required'));
    } else {
        if (duplicates(localization.availableLocales).length || !localization.availableLocales.includes(localization.defaultLocale)) {
            errors.push(issue('invalid-locale-metadata', id, 'localization.availableLocales', 'Locales must be unique and include the default'));
        }
        for (const locale of localization.availableLocales) {
            const localized = localization.content?.[locale];
            if (!LOCALE.test(locale) || !text(localization.translationStatus?.[locale]) ||
                !localized || ['title', 'summary', 'explanation'].some(field => !text(localized[field]))) {
                errors.push(issue('invalid-locale-metadata', id, `localization.${locale}`, `Locale ${locale} is incomplete or invalid`));
            }
            if (PUBLIC_STATUSES.has(unit?.status)) {
                for (const field of ['keyIdeas', 'misconceptions', 'practicalRules', 'decisionProcess', 'coachingPrompts', 'reflectionPrompts']) {
                    if (!Array.isArray(localized?.[field]) || localized[field].length === 0 || localized[field].some(value => !text(value))) {
                        errors.push(issue('required-instructional-content', id, `localization.content.${locale}.${field}`, `Published instruction requires ${field}`));
                    }
                }
            }
        }
        const undeclared = Object.keys(localization.content ?? {}).filter(locale => !localization.availableLocales.includes(locale));
        if (undeclared.length) errors.push(issue('invalid-locale-metadata', id, 'localization.content', `Undeclared locale content: ${undeclared.join(', ')}`));
    }
    if (!Array.isArray(unit?.positions) || unit.positions.length === 0) {
        errors.push(issue('invalid-position', id, 'positions', 'At least one instructional position is required'));
    } else {
        const positionIds = unit.positions.map(position => position?.id);
        if (duplicates(positionIds).length) errors.push(issue('invalid-position', id, 'positions', 'Position ids must be unique'));
        unit.positions.forEach((position, index) => {
            const path = `positions[${index}]`;
            if (!text(position?.id) || !['white', 'black'].includes(position?.sideToMove) || !text(position?.role) ||
                !Array.isArray(position?.expectedConcepts) || !position.expectedConcepts.length || !position.validation) {
                errors.push(issue('invalid-position', id, path, 'Instructional position structure is invalid'));
            }
            checkTaxonomy(errors, unit, `${path}.role`, position?.role, 'positionRoles', options);
            if (position?.fen) {
                const result = ChessRulesFacade.validateFen(position.fen);
                if (!result.valid) errors.push(issue('invalid-fen', id, `${path}.fen`, 'FEN is syntactically or legally invalid'));
                else if (ChessRulesFacade.fromFen(position.fen).sideToMove() !== position.sideToMove) {
                    errors.push(issue('invalid-side-to-move', id, `${path}.sideToMove`, 'sideToMove does not match FEN'));
                } else {
                    for (const [ideaIndex, idea] of (position.principalIdeas ?? []).entries()) {
                        try {
                            const game = ChessRulesFacade.fromFen(position.fen);
                            for (const move of idea.moves ?? []) game.move(move);
                        } catch {
                            errors.push(issue('invalid-principal-sequence', id, `${path}.principalIdeas[${ideaIndex}].moves`, 'Principal move sequence must be legal from the position FEN'));
                        }
                    }
                }
            }
        });
    }
    for (const key of Object.keys(unit?.learningObjects ?? {})) {
        checkTaxonomy(errors, unit, `learningObjects.${key}`, key, 'learningObjectTypes', options);
    }
    for (const expected of TAXONOMY_REGISTRIES.learningObjectTypes.entries.map(value => value.id)) {
        if (!Array.isArray(unit?.learningObjects?.[expected])) {
            errors.push(issue('invalid-learning-object-type', id, `learningObjects.${expected}`, `Expected array for registered learning object type "${expected}"`));
        }
    }
    const learningObjectIds = Object.values(unit?.learningObjects ?? {}).flatMap(items =>
        Array.isArray(items) ? items.map(value => value?.id).filter(text) : []);
    for (const duplicate of duplicates(learningObjectIds)) {
        errors.push(issue('duplicate-learning-object-id', id, 'learningObjects', `Duplicate learning object id: ${duplicate}`));
    }
    const activityItems = unit?.activityItems;
    if (unit?.schemaVersion === '1.1.0' && (!Array.isArray(activityItems) || activityItems.length === 0)) {
        errors.push(issue('missing-activity-items', id, 'activityItems', 'Schema 1.1.0 requires authored activity items'));
    }
    if (activityItems !== undefined && !Array.isArray(activityItems)) {
        errors.push(issue('invalid-activity-items', id, 'activityItems', 'activityItems must be an array'));
    }
    const activityIds = Array.isArray(activityItems) ? activityItems.map(item => item?.id) : [];
    for (const duplicate of duplicates(activityIds)) {
        errors.push(issue('duplicate-activity-id', id, 'activityItems', `Duplicate activity item id: ${duplicate}`));
    }
    for (const [activityIndex, item] of (activityItems ?? []).entries()) {
        const path = `activityItems[${activityIndex}]`;
        const responseTypes = ['exact-move', 'single-choice', 'plan-choice'];
        const activityTypes = ['independent-practice', 'assessment'];
        if (!text(item?.id) || item?.itemSchemaVersion !== '1.0.0' || item?.authoredStatus !== 'verified'
            || !activityTypes.includes(item?.activityType) || !responseTypes.includes(item?.responseType)
            || !text(item?.title) || !text(item?.instruction) || !text(item?.objective)
            || !learningObjectIds.includes(item?.sourceLearningObjectId)) {
            errors.push(issue('invalid-activity-contract', id, path, 'Activity identity, prompt, type, or source object is invalid'));
        }
        const authoredText = [
            item?.title, item?.instruction, item?.objective,
            ...Object.values(item?.feedback ?? {}).filter(value => typeof value === 'string'),
            ...(item?.answer?.choices ?? []).map(choice => choice?.label)
        ];
        if (authoredText.some(hasHtml)) {
            errors.push(issue('raw-html-rejected', id, path, 'Authored activity text must not contain raw HTML'));
        }
        const position = unit.positions?.find(candidate => candidate.id === item?.positionId);
        if (!position) errors.push(issue('invalid-activity-position', id, `${path}.positionId`, 'Activity position must exist in the unit'));
        if (!item?.answer || !text(item.answer.evaluatorType) || item.answer.expected === undefined
            || !Array.isArray(item.answer.acceptedAlternatives) || !Array.isArray(item.answer.misconceptionMappings)
            || !item.feedback || !item.evidence?.reviewResolution) {
            errors.push(issue('invalid-activity-answer', id, `${path}.answer`, 'Activity answer, feedback, evidence, and resolution are required'));
            continue;
        }
        if (item.responseType === 'exact-move' && position?.fen) {
            for (const [moveIndex, move] of [item.answer.expected, ...item.answer.acceptedAlternatives].entries()) {
                try { ChessRulesFacade.fromFen(position.fen).move(move); }
                catch { errors.push(issue('invalid-activity-move', id, `${path}.answer[${moveIndex}]`, 'Expected and alternative moves must be legal')); }
            }
        } else if (['single-choice', 'plan-choice'].includes(item.responseType)) {
            const choices = item.answer.choices;
            const choiceIds = Array.isArray(choices) ? choices.map(choice => choice?.id) : [];
            if (!Array.isArray(choices) || choices.length < 2 || duplicates(choiceIds).length
                || !choiceIds.includes(item.answer.expected) || choices.some(choice => !text(choice?.id) || !text(choice?.label))) {
                errors.push(issue('invalid-activity-choices', id, `${path}.answer.choices`, 'Choice IDs must be unique and include the expected answer'));
            }
            for (const mapping of item.answer.misconceptionMappings) {
                const sourceMisconceptions = unit.localization?.content?.[unit.localization.defaultLocale]?.misconceptions ?? [];
                if (!choiceIds.includes(mapping?.responseId) || !text(mapping?.misconceptionId)
                    || !Number.isSafeInteger(mapping?.sourceMisconceptionIndex)
                    || !sourceMisconceptions[mapping.sourceMisconceptionIndex]
                    || !activityIds.includes(mapping?.resolutionActivityId) || !text(mapping?.explanation)) {
                    errors.push(issue('invalid-misconception-mapping', id, `${path}.answer.misconceptionMappings`, 'Mapping must reference a choice, authored misconception, and resolution activity'));
                }
            }
        }
        if (item.activityType === 'assessment' && item.hintPolicy?.finalAnswerBeforeSubmission !== false) {
            errors.push(issue('invalid-assessment-hint-policy', id, `${path}.hintPolicy`, 'Assessment cannot reveal the final answer before submission'));
        }
    }
    if (!unit?.editorial || !text(unit.editorial.owner) || !DATE.test(unit.editorial.createdAt ?? '') ||
        !DATE.test(unit.editorial.updatedAt ?? '') || !text(unit.editorial.provenance?.notes) ||
        !Array.isArray(unit.editorial.provenance?.inspirationReferences) || !text(unit.editorial.copyrightNotes) ||
        !text(unit.editorial.originalityDeclaration)) {
        errors.push(issue('invalid-editorial-metadata', id, 'editorial', 'Editorial provenance and originality fields are required'));
    }
    if (PUBLIC_STATUSES.has(unit?.status) &&
        (unit.editorial?.reviewStatus !== 'approved' || unit.editorial?.verificationState !== 'verified' ||
         unit.localization?.translationStatus?.[unit.localization?.defaultLocale] !== 'ready')) {
        errors.push(issue('editorial-status-inconsistent', id, 'editorial', 'Approved/published units require approved, verified, locale-ready metadata'));
    }
    checkTaxonomy(errors, unit, 'editorial.reviewStatus', unit?.editorial?.reviewStatus, 'editorialStatuses', options);
    checkTaxonomy(errors, unit, 'editorial.verificationState', unit?.editorial?.verificationState, 'verificationStates', options);
    for (const [locale, value] of Object.entries(unit?.localization?.translationStatus ?? {})) {
        checkTaxonomy(errors, unit, `localization.translationStatus.${locale}`, value, 'translationStatuses', options);
    }
    if (!Array.isArray(unit?.integrations?.capabilities)) {
        errors.push(issue('required-integration-capabilities', id, 'integrations.capabilities', 'Integration capabilities must be an array'));
    } else {
        for (const value of duplicates(unit.integrations.capabilities)) {
            errors.push(issue('duplicate-taxonomy-value', id, 'integrations.capabilities', `Duplicate integration capability: ${value}`));
        }
        unit.integrations.capabilities.forEach((value, index) =>
            checkTaxonomy(errors, unit, `integrations.capabilities[${index}]`, value, 'integrationCapabilities', options));
    }
    if (unit?.status === 'deprecated') {
        if (!text(unit.editorial?.deprecation?.reason) || !DATE.test(unit.editorial?.deprecation?.effectiveAt ?? '')) {
            errors.push(issue('deprecation-inconsistent', id, 'editorial.deprecation', 'Deprecated units require reason and effective date'));
        }
    } else if (unit?.editorial?.deprecation) {
        errors.push(issue('deprecation-inconsistent', id, 'editorial.deprecation', 'Only deprecated units may declare deprecation metadata'));
    }
    if (!Array.isArray(unit?.relationships)) errors.push(issue('invalid-relationships', id, 'relationships', 'relationships must be an array'));
    return errors;
}
function prerequisiteCycles(units) {
    const edges = new Map(units.map(unit => [unit.id, [
        ...(unit.education?.prerequisites ?? []),
        ...(unit.relationships ?? []).filter(edge => edge.type === 'prerequisite').map(edge => edge.targetId)
    ]]));
    const visiting = new Set(), visited = new Set(), cycles = new Set();
    function visit(id, trail = []) {
        if (visiting.has(id)) { cycles.add([...trail.slice(trail.indexOf(id)), id].join(' -> ')); return; }
        if (visited.has(id)) return;
        visiting.add(id);
        for (const target of edges.get(id) ?? []) if (edges.has(target)) visit(target, [...trail, id]);
        visiting.delete(id); visited.add(id);
    }
    for (const id of [...edges.keys()].sort()) visit(id);
    return [...cycles].sort();
}

export function validateKnowledgeRepository(units, options = {}) {
    const source = Array.isArray(units) ? units : [];
    const taxonomyValidation = validateTaxonomyRegistries();
    const errors = taxonomyValidation.errors.map(error =>
        issue('invalid-taxonomy-registry', '', `taxonomy.${error.registry}.${error.path}`, error.message));
    errors.push(...source.flatMap(unit => validateUnit(unit, options)));
    const ids = source.map(unit => unit?.id).filter(text);
    for (const id of duplicates(ids).sort()) errors.push(issue('duplicate-id', id, 'id', `Duplicate id: ${id}`));
    const slugKeys = source.map(unit => text(unit?.slug) && text(unit?.domain) ? `${unit.domain}:${unit.slug}` : null).filter(Boolean);
    for (const key of duplicates(slugKeys).sort()) errors.push(issue('duplicate-slug', '', 'slug', `Duplicate domain slug: ${key}`));
    const known = new Set(ids);
    const byId = new Map(source.map(unit => [unit?.id, unit]));
    for (const unit of source) {
        const relationships = [
            ...(unit?.education?.prerequisites ?? []).map(targetId => ({ type: 'prerequisite', targetId })),
            ...(unit?.relationships ?? [])
        ];
        const keys = relationships.map(edge => `${edge.type}:${edge.targetId}`);
        for (const key of duplicates(keys)) errors.push(issue('duplicate-relationship', unit?.id, 'relationships', `Duplicate relationship: ${key}`));
        for (const edge of relationships) {
            checkTaxonomy(errors, unit, 'relationships.type', edge.type, 'relationshipTypes', options);
            if (!text(edge.type) || !text(edge.targetId)) {
                errors.push(issue('invalid-relationships', unit?.id, 'relationships', 'Relationship type and target are required'));
            } else if (!text(edge.reason) && !unit?.education?.prerequisites?.includes(edge.targetId)) {
                errors.push(issue('empty-relationship-reason', unit?.id, 'relationships', `Relationship reason is required: ${edge.type}:${edge.targetId}`));
            } else if (edge.targetId === unit?.id) {
                errors.push(issue('self-reference', unit.id, 'relationships', `Self-reference is not allowed: ${edge.type}`));
            } else if (!known.has(edge.targetId)) {
                errors.push(issue('invalid-relationship-target', unit?.id, 'relationships', `Unknown target: ${edge.targetId}`));
            } else if (unit?.status === 'published' && edge.type === 'prerequisite' && byId.get(edge.targetId)?.status !== 'published') {
                errors.push(issue('published-prerequisite-not-published', unit?.id, 'education.prerequisites', `Published prerequisite must target published unit: ${edge.targetId}`));
            } else if (PUBLIC_STATUSES.has(unit?.status) && byId.get(edge.targetId)?.status === 'draft') {
                errors.push(issue('production-relationship-to-draft', unit?.id, 'relationships', `Production unit cannot target draft: ${edge.targetId}`));
            }
        }
    }
    for (const cycle of prerequisiteCycles(source)) errors.push(issue('prerequisite-cycle', '', 'relationships', cycle));
    errors.sort((a, b) => [a.unitId, a.path, a.code, a.message].join('|').localeCompare([b.unitId, b.path, b.code, b.message].join('|')));
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors.map(Object.freeze)) });
}
