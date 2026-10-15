import {
    PUBLIC_NICKNAME_POLICY_VERSION,
    validatePublicNickname
} from '../../js/identity/public-nickname-policy.js';
import { getSupabase } from './supabase.js';

export function createPublicIdentityStore(options = {}) {
    const db = options.db || getSupabase();
    return Object.freeze({
        getOrCreate(clerkId) {
            return rpc(db, 'caissa_public_identity_get_or_create', { p_clerk_id: clerkId });
        },
        checkNickname(clerkId, contract) {
            const checked = requirePolicyContract(contract, { allowEmpty: false });
            return rpc(db, 'caissa_public_identity_check_nickname', {
                p_clerk_id: clerkId,
                p_nickname: checked.value,
                p_nickname_key: checked.key,
                p_policy_version: checked.policyVersion
            });
        },
        update(clerkId, contract, expectedVersion) {
            const checked = requirePolicyContract(contract, { allowEmpty: true });
            return rpc(db, 'caissa_public_identity_update', {
                p_clerk_id: clerkId,
                p_nickname: checked.value,
                p_nickname_key: checked.key,
                p_policy_version: checked.policyVersion,
                p_expected_version: expectedVersion
            });
        }
    });
}

export async function resolvePublicIdentity(authenticatedSubject, options = {}) {
    const clerkId = String(authenticatedSubject || '').trim();
    if (!clerkId) throw identityError('PUBLIC_IDENTITY_INVALID_SUBJECT');
    const store = options.store || createPublicIdentityStore(options);
    const identity = await store.getOrCreate(clerkId);
    if (!identity || !isSafePresentation(identity.displayName)) {
        throw identityError('PUBLIC_IDENTITY_UNAVAILABLE');
    }
    return sanitizeIdentity(identity);
}

export function validateNicknameRequest(value, options = {}) {
    return validatePublicNickname(value, options);
}

export function sanitizeIdentity(value) {
    const fallbackAlias = String(value?.fallbackAlias || '');
    const nicknameCheck = value?.nickname == null
        ? { ok: true, value: null }
        : validatePublicNickname(value.nickname);
    const version = Number(value?.version);
    const policyVersion = Number(value?.policyVersion);
    const expectedDisplay = nicknameCheck.value || fallbackAlias;
    const expectedCustomState = nicknameCheck.value !== null;
    if (!/^Player-[0-9A-F]{16}$/u.test(fallbackAlias)
        || !nicknameCheck.ok
        || String(value?.displayName || '') !== expectedDisplay
        || value?.hasCustomNickname !== expectedCustomState
        || policyVersion !== PUBLIC_NICKNAME_POLICY_VERSION
        || !Number.isInteger(version) || version < 1) {
        throw identityError('PUBLIC_IDENTITY_INVALID_RECORD');
    }
    return Object.freeze({
        displayName: expectedDisplay,
        nickname: nicknameCheck.value,
        fallbackAlias,
        hasCustomNickname: value.hasCustomNickname === true,
        policyVersion,
        version,
        updatedAt: value.updatedAt ? String(value.updatedAt) : null
    });
}

function requirePolicyContract(contract, options) {
    if (!contract?.ok || contract.policyVersion !== PUBLIC_NICKNAME_POLICY_VERSION) {
        throw identityError('PUBLIC_IDENTITY_POLICY_CONTRACT_REQUIRED');
    }
    const checked = validatePublicNickname(contract.value, options);
    if (!checked.ok || checked.value !== contract.value || checked.key !== contract.key
        || checked.policyVersion !== contract.policyVersion) {
        throw identityError('PUBLIC_IDENTITY_POLICY_CONTRACT_INVALID');
    }
    return checked;
}

async function rpc(db, name, args) {
    const { data, error } = await db.rpc(name, args);
    if (error) {
        const code = String(error.message || '').match(/CAISSA_IDENTITY_[A-Z_]+/)?.[0]
            || 'PUBLIC_IDENTITY_STORE_FAILED';
        throw identityError(code, error);
    }
    return data;
}

function isSafePresentation(value) {
    const text = String(value || '');
    return text.length >= 3 && text.length <= 192 && !/[<>\u0000-\u001f\u007f]/u.test(text);
}

export function identityError(code, cause) {
    const error = new Error(code);
    error.code = code;
    error.cause = cause;
    return error;
}
