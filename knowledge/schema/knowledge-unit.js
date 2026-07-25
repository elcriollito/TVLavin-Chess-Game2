/**
 * CAISSA Knowledge Unit schema 1.0.0.
 *
 * Required production fields are intentionally represented separately from
 * editorial and integration metadata in the object shape.
 *
 * @typedef {'draft'|'verification'|'review'|'approved'|'published'|'deprecated'} KnowledgeStatus
 * @typedef {'white'|'black'} Side
 * @typedef {'foundation'|'developing'|'intermediate'|'advanced'|'expert'} DifficultyBand
 * @typedef {'prerequisite'|'related'|'contrast'|'progression'|'remediation'|'recommendation'} RelationshipType
 *
 * @typedef {Object} LocalizedInstruction
 * @property {string} title
 * @property {string} summary
 * @property {string} explanation
 * @property {string[]} keyIdeas
 * @property {string[]} misconceptions
 * @property {string[]} practicalRules
 * @property {string[]} decisionProcess
 * @property {string[]} coachingPrompts
 * @property {string[]} reflectionPrompts
 *
 * @typedef {Object} KnowledgeUnit
 * @property {string} id
 * @property {string} slug
 * @property {string} domain
 * @property {KnowledgeStatus} status
 * @property {string} schemaVersion
 * @property {string} contentVersion
 * @property {{knowledgeType:string,endgameFamily?:string,themes:string[],skills:string[],difficulty:DifficultyBand,expectedLearnerLevel:string,prerequisites:string[],learningObjectives:string[],masteryCriteria:string[]}} education
 * @property {{defaultLocale:string,availableLocales:string[],translationStatus:Record<string,'draft'|'review'|'ready'>,content:Record<string,LocalizedInstruction>}} localization
 * @property {Array<{id:string,fen?:string,sideToMove:Side,role:string,expectedConcepts:string[],principalIdeas?:Array<{moves:string[],purpose:string}>,validation:{structural:'pending'|'valid'|'invalid',educational:'pending'|'verified'|'rejected',notes?:string}}>} positions
 * @property {{demonstrations:Array<object>,guidedPractice:Array<object>,exercises:Array<object>,checksForUnderstanding:Array<object>,assessments:Array<object>,reviewItems:Array<object>}} learningObjects
 * @property {Array<object>} [activityItems] Versioned, authored and deterministically evaluable activity items.
 * @property {Array<{type:RelationshipType,targetId:string,reason:string}>} relationships
 * @property {{capabilities:string[],coaching?:object,trainingMemory?:object,mastery?:object,recommendation?:object,academy?:object}} integrations
 * @property {{owner:string,reviewer?:string,createdAt:string,updatedAt:string,reviewStatus:'draft'|'in-review'|'approved'|'changes-requested',provenance:{kind:'caissa-original'|'inspired',notes:string,inspirationReferences:Array<object>},copyrightNotes:string,originalityDeclaration:string,verificationState:'unverified'|'in-progress'|'verified'|'revoked',deprecation?:{reason:string,replacementId?:string,effectiveAt:string}}} editorial
 */

export const KNOWLEDGE_SCHEMA_VERSION = '1.1.0';
export const SUPPORTED_KNOWLEDGE_SCHEMA_VERSIONS = Object.freeze(['1.0.0', KNOWLEDGE_SCHEMA_VERSION]);
export const KNOWLEDGE_STATUSES = Object.freeze(['draft', 'verification', 'review', 'approved', 'published', 'deprecated']);
export const KNOWLEDGE_RELATIONSHIP_TYPES = Object.freeze(['prerequisite', 'related', 'contrast', 'progression', 'remediation', 'recommendation']);
export const TRANSLATION_STATUSES = Object.freeze(['draft', 'review', 'ready']);
