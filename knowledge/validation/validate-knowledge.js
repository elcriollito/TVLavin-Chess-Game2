import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import {
    KNOWLEDGE_RELATIONSHIP_TYPES, KNOWLEDGE_STATUSES,
    SUPPORTED_KNOWLEDGE_SCHEMA_VERSIONS, TRANSLATION_STATUSES
} from '../schema/knowledge-unit.js';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const LOCALE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|\d{3})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_ARRAYS = ['themes', 'skills', 'learningObjectives', 'masteryCriteria'];
const PUBLIC_STATUSES = new Set(['approved', 'published']);

const issue = (code, unitId, path, message) => ({ code, unitId: unitId ?? '', path, message });
const text = value => typeof value === 'string' && value.trim().length > 0;
const duplicates = values => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

function validateUnit(unit) {
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
    if (!unit?.education || !text(unit.education.knowledgeType) || !text(unit.education.difficulty) || !text(unit.education.expectedLearnerLevel)) {
        errors.push(issue('required-education', id, 'education', 'Educational classification is incomplete'));
    }
    for (const field of REQUIRED_ARRAYS) {
        if (!Array.isArray(unit?.education?.[field]) || unit.education[field].length === 0 || unit.education[field].some(value => !text(value))) {
            errors.push(issue('required-education', id, `education.${field}`, `${field} must contain values`));
        }
    }
    const localization = unit?.localization;
    if (!localization || !text(localization.defaultLocale) || !Array.isArray(localization.availableLocales) || !localization.availableLocales.length) {
        errors.push(issue('invalid-locale-metadata', id, 'localization', 'A default and at least one available locale are required'));
    } else {
        if (duplicates(localization.availableLocales).length || !localization.availableLocales.includes(localization.defaultLocale)) {
            errors.push(issue('invalid-locale-metadata', id, 'localization.availableLocales', 'Locales must be unique and include the default'));
        }
        for (const locale of localization.availableLocales) {
            const localized = localization.content?.[locale];
            if (!LOCALE.test(locale) || !TRANSLATION_STATUSES.includes(localization.translationStatus?.[locale]) ||
                !localized || ['title', 'summary', 'explanation'].some(field => !text(localized[field]))) {
                errors.push(issue('invalid-locale-metadata', id, `localization.${locale}`, `Locale ${locale} is incomplete or invalid`));
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
            if (position?.fen) {
                const result = ChessRulesFacade.validateFen(position.fen);
                if (!result.valid) errors.push(issue('invalid-fen', id, `${path}.fen`, 'FEN is syntactically or legally invalid'));
                else if (ChessRulesFacade.fromFen(position.fen).sideToMove() !== position.sideToMove) {
                    errors.push(issue('invalid-side-to-move', id, `${path}.sideToMove`, 'sideToMove does not match FEN'));
                }
            }
        });
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

export function validateKnowledgeRepository(units) {
    const source = Array.isArray(units) ? units : [];
    const errors = source.flatMap(validateUnit);
    const ids = source.map(unit => unit?.id).filter(text);
    for (const id of duplicates(ids).sort()) errors.push(issue('duplicate-id', id, 'id', `Duplicate id: ${id}`));
    const slugKeys = source.map(unit => text(unit?.slug) && text(unit?.domain) ? `${unit.domain}:${unit.slug}` : null).filter(Boolean);
    for (const key of duplicates(slugKeys).sort()) errors.push(issue('duplicate-slug', '', 'slug', `Duplicate domain slug: ${key}`));
    const known = new Set(ids);
    for (const unit of source) {
        const relationships = [
            ...(unit?.education?.prerequisites ?? []).map(targetId => ({ type: 'prerequisite', targetId })),
            ...(unit?.relationships ?? [])
        ];
        const keys = relationships.map(edge => `${edge.type}:${edge.targetId}`);
        for (const key of duplicates(keys)) errors.push(issue('duplicate-relationship', unit?.id, 'relationships', `Duplicate relationship: ${key}`));
        for (const edge of relationships) {
            if (!KNOWLEDGE_RELATIONSHIP_TYPES.includes(edge.type) || !text(edge.targetId)) {
                errors.push(issue('invalid-relationships', unit?.id, 'relationships', 'Relationship type and target are required'));
            } else if (edge.targetId === unit?.id) {
                errors.push(issue('self-reference', unit.id, 'relationships', `Self-reference is not allowed: ${edge.type}`));
            } else if (!known.has(edge.targetId)) {
                errors.push(issue('invalid-relationship-target', unit?.id, 'relationships', `Unknown target: ${edge.targetId}`));
            }
        }
    }
    for (const cycle of prerequisiteCycles(source)) errors.push(issue('prerequisite-cycle', '', 'relationships', cycle));
    errors.sort((a, b) => [a.unitId, a.path, a.code, a.message].join('|').localeCompare([b.unitId, b.path, b.code, b.message].join('|')));
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors.map(Object.freeze)) });
}
