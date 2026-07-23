import { createHash } from 'node:crypto';

export function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
    }
    return value;
}

export const canonicalJson = (value, spacing = 0) => JSON.stringify(canonicalize(value), null, spacing);
export const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
