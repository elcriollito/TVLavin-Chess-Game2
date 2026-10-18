export const ACCOUNT_SYSTEM_MODES = Object.freeze({
    legacy: 'legacy',
    maintenance: 'maintenance',
    cleanStart: 'clean_start',
    invalid: 'invalid'
});

export function resolveAccountSystemMode(env = process.env) {
    const value = String(env.CAISSA_ACCOUNT_SYSTEM_MODE || '').trim().toLowerCase();
    if (!value || value === ACCOUNT_SYSTEM_MODES.legacy) return ACCOUNT_SYSTEM_MODES.legacy;
    if (value === ACCOUNT_SYSTEM_MODES.maintenance) return ACCOUNT_SYSTEM_MODES.maintenance;
    if (value === ACCOUNT_SYSTEM_MODES.cleanStart) return ACCOUNT_SYSTEM_MODES.cleanStart;
    return ACCOUNT_SYSTEM_MODES.invalid;
}

export function cleanStartTokenCutoff(env = process.env) {
    const raw = String(env.CAISSA_ACCOUNT_TOKEN_NOT_BEFORE || '').trim();
    if (!raw) return null;

    if (/^[0-9]{10}$/.test(raw)) {
        const seconds = Number(raw);
        return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
    }

    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw)) return null;
    const milliseconds = Date.parse(raw);
    return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : null;
}

export function publicAccountSystemState(env = process.env) {
    const resolved = resolveAccountSystemMode(env);
    const mode = resolved === ACCOUNT_SYSTEM_MODES.invalid
        ? ACCOUNT_SYSTEM_MODES.maintenance
        : resolved;
    return Object.freeze({
        mode,
        registrationOpen: mode !== ACCOUNT_SYSTEM_MODES.maintenance,
        resetNotice: mode === ACCOUNT_SYSTEM_MODES.cleanStart
            && String(env.CAISSA_ACCOUNT_RESET_NOTICE || '').trim().toLowerCase() === 'enabled'
    });
}
