import { KNOWLEDGE_SCHEMA_VERSION } from '../schema/knowledge-unit.js';
import { TAXONOMY_REGISTRIES } from '../taxonomy/registries.js';

const values = name => TAXONOMY_REGISTRIES[name].entries
    .filter(value => value.status === 'active')
    .map(value => value.id)
    .sort();

export const AUTHORING_TAXONOMY = Object.freeze({
    domains: values('domains'),
    knowledgeTypes: values('knowledgeTypes'),
    endgameFamilies: values('endgameFamilies'),
    themes: values('themes'),
    skills: values('skills'),
    difficulties: values('difficulties'),
    learnerLevels: values('learnerLevels'),
    positionRoles: values('positionRoles'),
    relationshipTypes: values('relationshipTypes'),
    integrationCapabilities: values('integrationCapabilities')
});

export function createDraftKnowledgeUnitScaffold({ id, slug, domain = 'endgames' }) {
    return {
        id, slug, domain, status: 'draft', schemaVersion: KNOWLEDGE_SCHEMA_VERSION, contentVersion: '0.1.0',
        education: {
            knowledgeType: '', endgameFamily: '', themes: [], skills: [], difficulty: '',
            expectedLearnerLevel: '', prerequisites: [], learningObjectives: [], masteryCriteria: []
        },
        localization: {
            defaultLocale: 'en-US', availableLocales: ['en-US'], translationStatus: { 'en-US': 'draft' },
            content: {
                'en-US': {
                    title: '', summary: '', explanation: '', keyIdeas: [], misconceptions: [],
                    practicalRules: [], decisionProcess: [], coachingPrompts: [], reflectionPrompts: []
                }
            }
        },
        positions: [],
        learningObjects: {
            demonstrations: [], guidedPractice: [], exercises: [],
            checksForUnderstanding: [], assessments: [], reviewItems: []
        },
        relationships: [],
        integrations: { capabilities: [] },
        editorial: {
            owner: '', createdAt: '', updatedAt: '', reviewStatus: 'draft',
            provenance: { kind: 'caissa-original', notes: '', inspirationReferences: [] },
            copyrightNotes: '', originalityDeclaration: '', verificationState: 'unverified'
        }
    };
}
