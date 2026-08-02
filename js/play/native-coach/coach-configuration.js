(function installNativeCoachConfiguration(root) {
    'use strict';
    const LEVELS = Object.freeze(['light', 'standard', 'more-help']);
    const FOCUSES = Object.freeze(['balanced', 'tactics', 'safety', 'time-awareness']);
    const TIMINGS = Object.freeze(['on-request']);
    const TIMES = Object.freeze([Object.freeze({ id: 'blitz-5', seconds: 300, label: '5+0' }),
        Object.freeze({ id: 'rapid-10', seconds: 600, label: '10+0' })]);
    const COLORS = Object.freeze(['white', 'black']);
    const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    function validate(value = {}) {
        const valid = LEVELS.includes(value.level) && FOCUSES.includes(value.focus)
            && TIMINGS.includes(value.timing) && TIMES.some(item => item.id === value.timeControl)
            && COLORS.includes(value.color);
        return freeze({ valid, errors: valid ? [] : ['Choose a supported assistance and game configuration.'] });
    }
    root.CaissaNativeCoachConfiguration = freeze({ schemaVersion: '1.0.0', levels: LEVELS, focuses: FOCUSES,
        timings: TIMINGS, timeControls: TIMES, colors: COLORS, defaults: freeze({ level: 'standard', focus: 'balanced',
            timing: 'on-request', timeControl: 'blitz-5', color: 'white' }), validate });
})(typeof window !== 'undefined' ? window : globalThis);
