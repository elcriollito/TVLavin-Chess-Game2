const STORAGE_PREFIX = 'caissa-online:lobby-preferences:v1:';
const DEFAULTS = Object.freeze({ muteInvitationPopups: false });

export function createOnlineLobbyPreferenceStore(options = {}) {
    const storage = options.storage === undefined ? readGlobalCapability('localStorage') : options.storage;
    const crypto = options.crypto === undefined ? readGlobalCapability('crypto') : options.crypto;
    return {
        async load(auth) {
            const key = await storageKey(auth, crypto);
            if (!key || !storage) return { ...DEFAULTS };
            try {
                const parsed = JSON.parse(storage.getItem(key) || '{}');
                return { muteInvitationPopups: parsed.muteInvitationPopups === true };
            } catch (_) {
                return { ...DEFAULTS };
            }
        },
        async save(auth, preferences) {
            const key = await storageKey(auth, crypto);
            if (!key || !storage) return false;
            try {
                storage.setItem(key, JSON.stringify({
                    muteInvitationPopups: preferences?.muteInvitationPopups === true
                }));
                return true;
            } catch (_) {
                return false;
            }
        }
    };
}

function readGlobalCapability(name) {
    try {
        return globalThis[name] || null;
    } catch (_) {
        return null;
    }
}

async function storageKey(auth, crypto) {
    if (!auth?.isSignedIn || !auth.userId) return `${STORAGE_PREFIX}anonymous`;
    if (!crypto?.subtle || typeof TextEncoder === 'undefined') return null;
    const authority = auth.isGuest ? 'guest' : 'member';
    const input = new TextEncoder().encode(`${authority}:${auth.userId}`);
    const digest = await crypto.subtle.digest('SHA-256', input);
    const opaqueScope = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
    return `${STORAGE_PREFIX}${authority}:${opaqueScope}`;
}

export const ONLINE_LOBBY_PREFERENCE_DEFAULTS = DEFAULTS;
