import { ruleOfTheSquare } from '../domains/endgames/pawn-foundations/rule-of-the-square/unit.js';
import { activateTheKing } from '../domains/endgames/pawn-foundations/activate-the-king/unit.js';
import { directOpposition } from '../domains/endgames/pawn-foundations/direct-opposition/unit.js';
import { keySquares } from '../domains/endgames/pawn-foundations/key-squares/unit.js';
import { convertWithKingSupport } from '../domains/endgames/pawn-foundations/convert-with-king-support/unit.js';
import { reserveTempo } from '../domains/endgames/pawn-transformations/reserve-tempo/unit.js';
import { protectedPassedPawn } from '../domains/endgames/pawn-transformations/protected-passed-pawn/unit.js';
import { outsidePassedPawn } from '../domains/endgames/pawn-transformations/outside-passed-pawn/unit.js';
import { pawnBreakthrough } from '../domains/endgames/pawn-transformations/pawn-breakthrough/unit.js';

export const KNOWLEDGE_MANIFEST_VERSION = '1.0.0';

// Explicit imports make discovery reviewable and deterministic in every runtime.
export const KNOWLEDGE_UNIT_REGISTRY = Object.freeze([
    ruleOfTheSquare, activateTheKing, directOpposition, keySquares, convertWithKingSupport,
    reserveTempo, protectedPassedPawn, outsidePassedPawn, pawnBreakthrough
]);

export const KNOWLEDGE_MANIFEST = Object.freeze(KNOWLEDGE_UNIT_REGISTRY.map(unit => Object.freeze({
    id: unit.id,
    slug: unit.slug,
    domain: unit.domain,
    status: unit.status,
    schemaVersion: unit.schemaVersion,
    contentVersion: unit.contentVersion,
    defaultLocale: unit.localization.defaultLocale,
    availableLocales: Object.freeze([...unit.localization.availableLocales]),
    knowledgeType: unit.education.knowledgeType,
    endgameFamily: unit.education.endgameFamily,
    themes: Object.freeze([...unit.education.themes]),
    skills: Object.freeze([...unit.education.skills]),
    difficulty: unit.education.difficulty,
    expectedLearnerLevel: unit.education.expectedLearnerLevel,
    prerequisites: Object.freeze([...unit.education.prerequisites]),
    title: unit.localization.content[unit.localization.defaultLocale].title,
    summary: unit.localization.content[unit.localization.defaultLocale].summary,
    updatedAt: unit.editorial.updatedAt,
    deprecation: unit.editorial.deprecation ? Object.freeze({ ...unit.editorial.deprecation }) : null
})).sort((a, b) => a.id.localeCompare(b.id)));
