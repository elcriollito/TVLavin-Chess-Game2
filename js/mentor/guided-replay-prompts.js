(function installGuidedReplayPrompts(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const PROMPT_TYPES = Object.freeze(['play-move', 'choose-move', 'reflect']);
    const TEMPLATES = Object.freeze({
        opening: Object.freeze({ id: 'opening-development', type: 'play-move',
            text: 'How would you continue your development here?' }),
        tactical: Object.freeze({ id: 'tactical-forcing-moves', type: 'play-move',
            text: 'Look at checks, captures, and threats. What move would you choose?' }),
        strategic: Object.freeze({ id: 'strategic-improvement', type: 'play-move',
            text: 'Which move best improves your position?' }),
        transition: Object.freeze({ id: 'transition-decision', type: 'play-move',
            text: 'Would you simplify, maintain tension, or change the position?' }),
        endgame: Object.freeze({ id: 'endgame-priority', type: 'play-move',
            text: 'What is the most important priority in this position?' }),
        decision: Object.freeze({ id: 'general-decision', type: 'play-move',
            text: 'What would you play in this position?' }),
        terminal: Object.freeze({ id: 'terminal-decision', type: 'play-move',
            text: 'What move would you choose in this final position?' }),
        reflect: Object.freeze({ id: 'technical-reflection', type: 'reflect',
            text: 'Review the position and acknowledge the technical change.' })
    });
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function resolve(category, options = {}) {
        const base = TEMPLATES[category] || TEMPLATES.decision;
        const template = options.reflect === true ? TEMPLATES.reflect : base;
        return freeze({ schemaVersion: SCHEMA_VERSION, templateId: template.id,
            promptType: template.type, text: template.text,
            style: ['concise', 'balanced', 'detailed', 'socratic'].includes(options.style)
                ? options.style : 'balanced' });
    }
    global.CaissaGuidedReplayPrompts = freeze({
        schemaVersion: SCHEMA_VERSION, promptTypes: PROMPT_TYPES, templates: TEMPLATES, resolve
    });
})(typeof window !== 'undefined' ? window : globalThis);
