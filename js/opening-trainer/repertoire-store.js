import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';

const SCHEMA_VERSION = 'CaissaOpeningRepertoire@1.0.0';
export const REPERTOIRE_STORAGE_KEY = 'caissa.opening-trainer.repertoires.v1';

const clone = value => JSON.parse(JSON.stringify(value));
const isUci = value => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(String(value || ''));

function normalizeMove(move, index) {
    const uci = String(move?.uci || `${move?.from || ''}${move?.to || ''}${move?.promotion || ''}`).toLowerCase();
    if (!isUci(uci)) throw new TypeError(`Invalid repertoire move at ply ${index + 1}.`);
    return Object.freeze({
        uci,
        san: String(move?.san || uci),
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.slice(4, 5) || null,
        color: move?.color === 'b' ? 'b' : 'w',
        fenBefore: String(move?.fenBefore || ''),
        fenAfter: String(move?.fenAfter || move?.fen || '')
    });
}

function normalizeLine(line) {
    if (!Array.isArray(line) || line.length === 0) throw new TypeError('A repertoire line must contain moves.');
    return Object.freeze(line.map(normalizeMove));
}

function normalizeRepertoire(input, existing = null) {
    const color = input?.color === 'black' || input?.color === 'b' ? 'black' : 'white';
    const uniqueLines = new Map();
    for (const rawLine of input?.lines || []) {
        const line = normalizeLine(rawLine);
        const replay = new Chess(input?.initialFen || existing?.initialFen || undefined);
        for (let ply = 0; ply < line.length; ply += 1) {
            const move = line[ply];
            let applied = null;
            try {
                applied = replay.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
            } catch {
                applied = null;
            }
            if (!applied) throw new TypeError(`Repertoire line contains an illegal move at ply ${ply + 1}.`);
            if (move.color !== applied.color) throw new TypeError(`Repertoire line has an invalid side at ply ${ply + 1}.`);
        }
        uniqueLines.set(line.map(move => move.uci).join(' '), line);
    }
    if (!uniqueLines.size) throw new TypeError('Select at least one analysis line before saving.');
    const now = new Date().toISOString();
    const progressSource = input?.progress || existing?.progress || {};
    const generatedId = globalThis.crypto?.randomUUID?.()
        || `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    return Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        id: String(existing?.id || input?.id || generatedId),
        name: String(input?.name || existing?.name || `${input?.opening || 'Opening'} repertoire`).trim().slice(0, 100),
        color,
        eco: String(input?.eco || existing?.eco || '').slice(0, 3),
        opening: String(input?.opening || existing?.opening || 'Custom opening').trim().slice(0, 160),
        initialFen: String(input?.initialFen || existing?.initialFen || ''),
        lines: Object.freeze([...uniqueLines.values()]),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        progress: Object.freeze({
            sessions: Number(progressSource.sessions) || 0,
            completed: Number(progressSource.completed) || 0,
            attempts: Number(progressSource.attempts) || 0,
            correct: Number(progressSource.correct) || 0,
            hints: Number(progressSource.hints) || 0,
            reveals: Number(progressSource.reveals) || 0,
            lastTrainedAt: progressSource.lastTrainedAt || null
        })
    });
}

export class SavedRepertoireStore {
    #storage;
    #key;
    #memory = [];

    constructor({ storage = globalThis.localStorage, key = REPERTOIRE_STORAGE_KEY } = {}) {
        this.#storage = storage || null;
        this.#key = key;
    }

    #read() {
        try {
            const raw = this.#storage?.getItem?.(this.#key);
            const parsed = raw ? JSON.parse(raw) : this.#memory;
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return this.#memory;
        }
    }

    #write(items) {
        this.#memory = clone(items);
        try {
            this.#storage?.setItem?.(this.#key, JSON.stringify(items));
        } catch {
            // Private browsing and quota failures keep an in-memory session copy.
        }
    }

    list() {
        return Object.freeze(this.#read()
            .filter(item => item?.schemaVersion === SCHEMA_VERSION)
            .map(item => Object.freeze(clone(item)))
            .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))));
    }

    get(id) {
        const found = this.#read().find(item => item?.id === id && item?.schemaVersion === SCHEMA_VERSION);
        return found ? Object.freeze(clone(found)) : null;
    }

    save(input) {
        const items = this.#read();
        const existingIndex = items.findIndex(item => item?.id === input?.id);
        const existing = existingIndex >= 0 ? items[existingIndex] : null;
        const next = normalizeRepertoire(input, existing);
        if (existingIndex >= 0) items.splice(existingIndex, 1, next);
        else items.push(next);
        this.#write(items);
        return Object.freeze(clone(next));
    }

    mergeRemote(remoteItems = []) {
        const items = this.#read();
        const byId = new Map(items.map(item => [item?.id, item]));
        for (const input of Array.isArray(remoteItems) ? remoteItems : []) {
            try {
                const local = byId.get(input?.id) || null;
                if (local && String(local.updatedAt || '') >= String(input?.updatedAt || '')) continue;
                const normalized = normalizeRepertoire(input, null);
                byId.set(normalized.id, Object.freeze({
                    ...normalized,
                    createdAt: input.createdAt || normalized.createdAt,
                    updatedAt: input.updatedAt || normalized.updatedAt
                }));
            } catch {
                // Ignore malformed cloud records and retain the last valid local copy.
            }
        }
        const merged = [...byId.values()];
        this.#write(merged);
        return this.list();
    }

    recordSession(id, result = {}) {
        const items = this.#read();
        const index = items.findIndex(item => item?.id === id);
        if (index < 0) return null;
        const current = items[index];
        const progress = {
            sessions: (Number(current.progress?.sessions) || 0) + 1,
            completed: (Number(current.progress?.completed) || 0) + (result.completed ? 1 : 0),
            attempts: (Number(current.progress?.attempts) || 0) + (Number(result.attempts) || 0),
            correct: (Number(current.progress?.correct) || 0) + (Number(result.correct) || 0),
            hints: (Number(current.progress?.hints) || 0) + (Number(result.hints) || 0),
            reveals: (Number(current.progress?.reveals) || 0) + (Number(result.reveals) || 0),
            lastTrainedAt: new Date().toISOString()
        };
        items[index] = { ...current, progress, updatedAt: new Date().toISOString() };
        this.#write(items);
        return Object.freeze(clone(items[index]));
    }

    remove(id) {
        const items = this.#read();
        const next = items.filter(item => item?.id !== id);
        if (next.length === items.length) return false;
        this.#write(next);
        return true;
    }
}

export default SavedRepertoireStore;
