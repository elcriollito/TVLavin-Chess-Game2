const entry = (id, label, definition, options = {}) => ({ id, label, definition, status: 'active', aliases: [], ...options });
const registry = (id, entries) => ({ id, entries });

export const TAXONOMY_VERSION = '1.4.0';
export const TAXONOMY_ENTRY_STATUSES = Object.freeze(['active', 'proposed', 'deprecated']);

const source = {
    domains: registry('domains', [
        entry('endgames', 'Endgames', 'Knowledge about positions with substantially reduced material.')
    ]),
    knowledgeTypes: registry('knowledge-types', [
        entry('decision-rule', 'Decision rule', 'A bounded procedure used to make a chess decision.'),
        entry('pattern', 'Pattern', 'A recognizable arrangement whose geometry carries instructional meaning.'),
        entry('principle', 'Principle', 'A bounded planning idea that guides choices while allowing exceptions.'),
        entry('technique', 'Technique', 'A reusable coordination procedure applied through move choices.')
    ]),
    endgameFamilies: registry('endgame-families', [
        entry('pawn-endgames', 'Pawn endgames', 'Endgames whose principal educational material is kings and pawns.', { domainScope: 'endgames' })
    ]),
    themes: registry('themes', [
        entry('king-activity', 'King activity', 'Effective use of the king as an active piece.', { domainScope: 'endgames' }),
        entry('key-squares', 'Key squares', 'Target squares from which a king can support a pawn objective.', { domainScope: 'endgames' }),
        entry('opposition', 'Opposition', 'King geometry in which tempo determines access around the opposing king.', { domainScope: 'endgames' }),
        entry('pawn-support', 'Pawn support', 'Coordination of king and pawn during controlled advancement.', { domainScope: 'endgames' }),
        entry('pawn-races', 'Pawn races', 'Tempo and geometry in competing promotion or interception paths.', { domainScope: 'endgames' }),
        entry('pawn-structure', 'Pawn structure', 'The relationships among pawn chains, contacts, weaknesses, and transformation possibilities.', { domainScope: 'endgames' }),
        entry('passed-pawns', 'Passed pawns', 'Pawns with no opposing pawn able to stop them on their file or adjacent files.', { domainScope: 'endgames' }),
        entry('zugzwang', 'Zugzwang', 'Positions in which the obligation to move worsens the moving side’s situation.', { domainScope: 'endgames' }),
        entry('diversion', 'Diversion', 'Use of a remote threat to draw a defender away from another target.', { domainScope: 'endgames' }),
        entry('pawn-breakthrough', 'Pawn breakthrough', 'A calculated pawn sacrifice or sequence that transforms a restrained structure into a surviving passed pawn.', { domainScope: 'endgames' }),
        entry('pawn-majority', 'Pawn majority', 'A local numerical pawn advantage whose usefulness depends on mobility and resulting exchanges.', { domainScope: 'endgames' }),
        entry('fixed-weakness', 'Fixed weakness', 'A structural target whose useful advance or exchange has been restrained.', { domainScope: 'endgames' }),
        entry('restraint', 'Restraint', 'Restriction of an opposing pawn advance, exchange, or liberating break.', { domainScope: 'endgames' }),
        entry('isolated-pawn', 'Isolated pawn', 'A pawn with no friendly pawn on either neighboring file.', { domainScope: 'endgames' }),
        entry('backward-pawn', 'Backward pawn', 'A pawn held behind neighboring pawns because it cannot advance safely.', { domainScope: 'endgames' }),
        entry('pawn-tension', 'Pawn tension', 'Unresolved pawn contact in which captures or advances transform the structure.', { domainScope: 'endgames' }),
        entry('exchange-decision', 'Exchange decision', 'Before-and-after evaluation of an irreversible pawn exchange.', { domainScope: 'endgames' }),
        entry('capture-order', 'Capture order', 'The structural effect of choosing a sequence and direction of captures.', { domainScope: 'endgames' }),
        entry('divided-defense', 'Divided defense', 'A defensive burden created by targets too separated for one route to cover in time.', { domainScope: 'endgames' }),
        entry('favorable-simplification', 'Favorable simplification', 'An exchange transition whose resulting king ending preserves or improves concrete advantages.', { domainScope: 'endgames' }),
        entry('tempo', 'Tempo', 'The instructional effect of whose turn it is and available waiting moves.', { domainScope: 'endgames' }),
        entry('candidate-endgame-theme', 'Candidate endgame theme', 'Reserved for explicit draft taxonomy workflow.', { domainScope: 'endgames', status: 'proposed' }),
        entry('pawn-race', 'Pawn race', 'Deprecated singular identifier retained for migration diagnostics.', { domainScope: 'endgames', status: 'deprecated', replacementId: 'pawn-races' })
    ]),
    skills: registry('skills', [
        entry('board-geometry', 'Board geometry', 'Recognition and comparison of square-based distances.'),
        entry('calculation', 'Calculation', 'Concrete analysis of move sequences and tempos.'),
        entry('move-order', 'Move order', 'Selection of an action sequence whose order preserves access or tempi.'),
        entry('pattern-recognition', 'Pattern recognition', 'Identification of meaningful recurring chess geometry.'),
        entry('planning', 'Planning', 'Selection of a useful objective before calculating concrete moves.')
    ]),
    difficulties: registry('difficulty-levels', [
        entry('foundation', 'Foundation', 'Introductory knowledge with minimal prerequisite depth.'),
        entry('developing', 'Developing', 'Knowledge requiring reliable use of foundational ideas.'),
        entry('intermediate', 'Intermediate', 'Knowledge requiring combined concepts and calculation.'),
        entry('advanced', 'Advanced', 'Knowledge requiring precise synthesis and exceptions.'),
        entry('expert', 'Expert', 'Specialized knowledge with substantial prerequisite depth.')
    ]),
    learnerLevels: registry('learner-levels', [
        entry('foundation-rules-aware', 'Rules-aware foundation', 'Learners who know legal movement and basic game rules.')
    ]),
    positionRoles: registry('instructional-position-roles', [
        entry('assessment', 'Assessment', 'A position used for independent evidence of mastery.'),
        entry('clean-demonstration', 'Clean demonstration', 'A minimal position that isolates the primary concept.'),
        entry('contrast', 'Contrast', 'A near or opposing case that clarifies the concept boundary.'),
        entry('recognition-example', 'Recognition example', 'A position used to recognize or delimit a concept.'),
        entry('transfer', 'Transfer', 'A changed geometry requiring the learner to reuse the concept.')
    ]),
    learningObjectTypes: registry('learning-object-types', [
        entry('demonstrations', 'Demonstrations', 'Authored demonstrations of knowledge.'),
        entry('guidedPractice', 'Guided practice', 'Supported learner practice.'),
        entry('exercises', 'Exercises', 'Learner tasks with assessable actions.'),
        entry('checksForUnderstanding', 'Checks for understanding', 'Short checks of current understanding.'),
        entry('assessments', 'Assessments', 'Formal mastery evidence.'),
        entry('reviewItems', 'Review items', 'Retention and recall activities.')
    ]),
    relationshipTypes: registry('relationship-types', [
        entry('prerequisite', 'Prerequisite', 'The target knowledge is required first.'),
        entry('related', 'Related', 'The target is conceptually associated.'),
        entry('contrast', 'Contrast', 'Comparison with the target clarifies a boundary.'),
        entry('progression', 'Progression', 'The target is a continuation after this unit.'),
        entry('remediation', 'Remediation', 'The target addresses a likely weakness.'),
        entry('recommendation', 'Recommendation', 'The target is an authored continuation option.')
    ]),
    verificationStates: registry('verification-states', [
        entry('unverified', 'Unverified', 'Verification has not begun.'),
        entry('in-progress', 'In progress', 'Verification is underway.'),
        entry('verified', 'Verified', 'Required verification has passed.'),
        entry('revoked', 'Revoked', 'Prior verification is no longer valid.')
    ]),
    editorialStatuses: registry('editorial-statuses', [
        entry('draft', 'Draft', 'Editorial work is incomplete.'),
        entry('in-review', 'In review', 'Editorial review is underway.'),
        entry('approved', 'Approved', 'Editorial review has passed.'),
        entry('changes-requested', 'Changes requested', 'Review requires revision.')
    ]),
    translationStatuses: registry('translation-statuses', [
        entry('draft', 'Draft', 'Translation is incomplete.'),
        entry('review', 'Review', 'Translation is under review.'),
        entry('ready', 'Ready', 'Translation is approved for use.')
    ]),
    integrationCapabilities: registry('integration-capabilities', [
        entry('academy-compatible', 'Academy compatible', 'May be referenced by a future Academy adapter.'),
        entry('deterministic-coaching-prompts', 'Deterministic coaching prompts', 'Provides authored prompts without live classification.'),
        entry('mastery-criteria', 'Mastery criteria', 'Declares stable mastery criteria.'),
        entry('recommendation-entry-unit', 'Recommendation entry unit', 'May be considered as an entry unit.'),
        entry('training-memory-theme-link', 'Training Memory theme link', 'Declares stable theme aggregation identifiers.')
    ])
};

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
}

export const TAXONOMY_REGISTRIES = deepFreeze(source);
export const TAXONOMY_LOOKUPS = Object.freeze(Object.fromEntries(
    Object.entries(TAXONOMY_REGISTRIES).map(([name, value]) => [name, new Map(value.entries.map(item => [item.id, item]))])
));
