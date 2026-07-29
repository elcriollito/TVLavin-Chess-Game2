(function installMentorSummaryTemplates(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const STYLES = Object.freeze(['concise', 'balanced', 'detailed', 'socratic']);
    const labels = Object.freeze({
        'tactical-awareness': 'tactical awareness', 'material-safety': 'material safety',
        'king-safety': 'king safety', development: 'development',
        calculation: 'calculation', 'candidate-moves': 'candidate moves',
        simplification: 'simplification', 'transition-awareness': 'transition awareness',
        'endgame-awareness': 'endgame awareness', 'passed-pawn': 'passed-pawn play',
        'promotion-race': 'promotion races', 'defensive-awareness': 'defensive awareness',
        unknown: 'the reviewed position'
    });
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const conceptLabel = id => labels[id] || labels.unknown;
    const fixed = Object.freeze({
        insufficient: 'This review did not find enough evidence for a focused learning conclusion.',
        partial: 'This summary uses a partial technical review.',
        strength: id => `You handled this reviewed ${conceptLabel(id)} moment well.`,
        improvement: id => `This game suggests reviewing ${conceptLabel(id)}.`,
        replay: 'Replay the reviewed position once more before starting another game.',
        analyze: 'Use Analyze to inspect the reviewed game in more detail.',
        concept: id => `Review ${conceptLabel(id)} before your rematch.`,
        rematch: id => `In the rematch, focus on ${conceptLabel(id)}.`,
        goal: Object.freeze({
            'tactical-awareness': 'Calculate checks, captures, and threats before moving.',
            'defensive-awareness': 'Check the opponent’s threats before every move.',
            'material-safety': 'Keep loose pieces protected.',
            development: 'Complete development before repeated queen moves.',
            simplification: 'Compare the resulting position before simplifying.',
            'transition-awareness': 'Compare the resulting position before simplifying.',
            'endgame-awareness': 'Activate the king in simplified positions.',
            'passed-pawn': 'Calculate the promotion race before advancing.',
            'promotion-race': 'Count the tempi in every promotion race.',
            'candidate-moves': 'Name candidate moves before choosing one.',
            unknown: 'Check the opponent’s reply before every move.'
        })
    });
    function render(kind, conceptId, style = 'balanced') {
        const selected = STYLES.includes(style) ? style : 'balanced';
        let text = kind === 'strength' ? fixed.strength(conceptId)
            : kind === 'improvement' ? fixed.improvement(conceptId)
            : kind === 'review-concept' ? fixed.concept(conceptId)
            : kind === 'replay' ? fixed.replay
            : kind === 'analyze' ? fixed.analyze
            : kind === 'rematch' ? fixed.rematch(conceptId)
            : kind === 'goal' ? fixed.goal[conceptId] || fixed.goal.unknown
            : kind === 'partial' ? fixed.partial : fixed.insufficient;
        if (selected === 'socratic' && ['strength', 'improvement'].includes(kind))
            text = `What did you notice about ${conceptLabel(conceptId)} in this reviewed position?`;
        return freeze({ schemaVersion: SCHEMA_VERSION, templateId: `${kind}-${selected}-v1`,
            style: selected, text: text.slice(0, 220) });
    }
    global.CaissaMentorSummaryTemplates = freeze({
        schemaVersion: SCHEMA_VERSION, styles: STYLES, labels,
        conceptLabel, render
    });
})(typeof window !== 'undefined' ? window : globalThis);
