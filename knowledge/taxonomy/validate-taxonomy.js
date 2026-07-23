import { TAXONOMY_ENTRY_STATUSES, TAXONOMY_REGISTRIES } from './registries.js';

const text = value => typeof value === 'string' && value.trim().length > 0;
const issue = (code, registry, entryId, path, message) => ({ code, registry, entryId: entryId ?? '', path, message });
const duplicates = values => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))].sort();

function cycles(entries, field) {
    const links = new Map(entries.map(value => [value.id, value[field]]));
    const found = new Set();
    function walk(id, trail = []) {
        const next = links.get(id);
        if (!next) return;
        if (trail.includes(next)) {
            const cycle = [...trail.slice(trail.indexOf(next)), next];
            found.add(cycle.join(' -> '));
            return;
        }
        walk(next, [...trail, next]);
    }
    for (const id of [...links.keys()].sort()) walk(id, [id]);
    return [...found].sort();
}

export function validateTaxonomyRegistries(registries = TAXONOMY_REGISTRIES) {
    const errors = [];
    const domainIds = new Set(registries.domains?.entries?.map(value => value.id) ?? []);
    for (const [name, registry] of Object.entries(registries).sort(([a], [b]) => a.localeCompare(b))) {
        const entries = registry?.entries ?? [];
        const ids = entries.map(value => value?.id).filter(text);
        for (const id of duplicates(ids)) errors.push(issue('duplicate-taxonomy-id', name, id, 'id', `Duplicate taxonomy id: ${id}`));
        const known = new Set(ids);
        const aliases = entries.flatMap(value => value.aliases ?? []);
        for (const alias of duplicates(aliases)) errors.push(issue('duplicate-taxonomy-alias', name, '', 'aliases', `Duplicate alias: ${alias}`));
        for (const alias of aliases.filter(value => known.has(value)).sort()) {
            errors.push(issue('taxonomy-alias-id-collision', name, alias, 'aliases', `Alias collides with a canonical id: ${alias}`));
        }
        for (const value of entries) {
            if (!text(value?.id) || !text(value?.label) || !text(value?.definition) || !TAXONOMY_ENTRY_STATUSES.includes(value?.status)) {
                errors.push(issue('malformed-taxonomy-entry', name, value?.id, '', 'Taxonomy entry requires id, label, definition, and valid status'));
            }
            if (value.parentId && !known.has(value.parentId)) errors.push(issue('unknown-taxonomy-parent', name, value.id, 'parentId', `Unknown parent: ${value.parentId}`));
            if (value.domainScope && !domainIds.has(value.domainScope)) errors.push(issue('taxonomy-scope-mismatch', name, value.id, 'domainScope', `Unknown domain scope: ${value.domainScope}`));
            if (value.status === 'deprecated') {
                if (!text(value.replacementId) || !known.has(value.replacementId) || value.replacementId === value.id) {
                    errors.push(issue('invalid-taxonomy-replacement', name, value.id, 'replacementId', `Invalid replacement: ${value.replacementId ?? ''}`));
                }
            } else if (value.replacementId) {
                errors.push(issue('invalid-taxonomy-replacement', name, value.id, 'replacementId', 'Only deprecated values may declare replacements'));
            }
        }
        for (const cycle of cycles(entries, 'parentId')) errors.push(issue('taxonomy-parent-cycle', name, '', 'parentId', cycle));
        for (const cycle of cycles(entries, 'replacementId')) errors.push(issue('taxonomy-replacement-cycle', name, '', 'replacementId', cycle));
    }
    errors.sort((a, b) => [a.registry, a.entryId, a.path, a.code, a.message].join('|').localeCompare([b.registry, b.entryId, b.path, b.code, b.message].join('|')));
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors.map(Object.freeze)) });
}
