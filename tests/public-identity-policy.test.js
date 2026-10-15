import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PUBLIC_NICKNAME_POLICY_VERSION,
    countGraphemes,
    normalizePublicNickname,
    publicNicknameKey,
    validatePublicNickname
} from '../js/identity/public-nickname-policy.js';

test('normalization collapses whitespace and NFC/NFD accents share a key', () => {
    assert.equal(normalizePublicNickname('  Café   Knight  '), 'Café Knight');
    assert.equal(publicNicknameKey('Cafe\u0301 Knight'), publicNicknameKey('Café Knight'));
    assert.equal(validatePublicNickname('Cafe\u0301 Knight').policyVersion, PUBLIC_NICKNAME_POLICY_VERSION);
});

test('NFKC and Unicode lowercase define the versioned collision key without claiming full case folding', () => {
    assert.equal(publicNicknameKey('ＫＮＩＧＨＴ'), publicNicknameKey('knight'));
    assert.equal(publicNicknameKey('ÉCHECS'), publicNicknameKey('échecs'));
    assert.notEqual(publicNicknameKey('Straße'), publicNicknameKey('STRASSE'));
});

test('international single-script nicknames and Japanese script families are accepted', () => {
    for (const name of ['ÉchecsRoyal', 'Шахматист', 'شطرنجی', 'チェス棋士', '한棋士']) {
        assert.equal(validatePublicNickname(name).ok, true, name);
    }
});

test('mixed scripts, markup, invisible controls, bidi overrides, and reserved aliases are rejected', () => {
    const cases = [
        ['АdminKnight', 'NICKNAME_MIXED_SCRIPTS'],
        ['<img src=x>', 'NICKNAME_CHARACTERS'],
        ['Knight\u200BHidden', 'NICKNAME_INVISIBLE_CHARACTER'],
        ['Knight\u202Evil', 'NICKNAME_INVISIBLE_CHARACTER'],
        ['Knight\u2066evil', 'NICKNAME_INVISIBLE_CHARACTER'],
        ['Admin\u034F', 'NICKNAME_INVISIBLE_CHARACTER'],
        ['Admin\uFE0F', 'NICKNAME_INVISIBLE_CHARACTER'],
        ['Knight\u3164Player', 'NICKNAME_INVISIBLE_CHARACTER'],
        [`Knight${String.fromCodePoint(0xE0100)}`, 'NICKNAME_INVISIBLE_CHARACTER'],
        ['Safe\uFEFFKnight', 'NICKNAME_INVISIBLE_CHARACTER'],
        ['\uFEFFSafeKnight', 'NICKNAME_INVISIBLE_CHARACTER'],
        ['Player-ABCDEF1234567890', 'NICKNAME_RESERVED'],
        ['admin', 'NICKNAME_RESERVED']
    ];
    for (const [name, code] of cases) assert.equal(validatePublicNickname(name).code, code, name);
});

test('length uses grapheme clusters at the 2/3/24/25 boundaries', () => {
    assert.equal(countGraphemes('e\u0301e\u0301e\u0301'), 3);
    assert.equal(validatePublicNickname('ab').code, 'NICKNAME_LENGTH');
    assert.equal(validatePublicNickname('abc').ok, true);
    assert.equal(validatePublicNickname('a'.repeat(24)).ok, true);
    assert.equal(validatePublicNickname('a'.repeat(25)).code, 'NICKNAME_LENGTH');
    assert.deepEqual(validatePublicNickname('', { allowEmpty: true }), {
        ok: true, value: null, key: null, graphemes: 0, scripts: [], policyVersion: 1
    });
});

test('combining marks remain attached and repeated punctuation is rejected', () => {
    assert.equal(validatePublicNickname('A\u030Angstrom').ok, true);
    assert.equal(validatePublicNickname('Knight___One').code, 'NICKNAME_CHARACTERS');
    assert.equal(validatePublicNickname('Knight---One').code, 'NICKNAME_CHARACTERS');
});

test('the policy fails closed when Intl.Segmenter is unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
    Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
    try {
        assert.equal(countGraphemes('Knight'), null);
        assert.equal(validatePublicNickname('Knight').code, 'NICKNAME_POLICY_UNAVAILABLE');
    } finally {
        Object.defineProperty(Intl, 'Segmenter', descriptor);
    }
});
