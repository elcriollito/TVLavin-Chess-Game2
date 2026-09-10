import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const fixtureUrl = new URL('./fixtures/fics/players/rd009-live-sanitized.json', import.meta.url);
const evidence = JSON.parse(fs.readFileSync(fixtureUrl, 'utf8'));
const shell = fs.readFileSync(new URL('../js/fics-layout-shell.js', import.meta.url), 'utf8');

const terseFooter = /(\d+) players displayed \(of (\d+)\)\. \(\*\) indicates system administrator\./i;
const verboseFooter = /\|\s+(\d+) Players Displayed\s+\|/;

test('RD-009 fixture is sanitized evidence, not authentication or conversational content', () => {
    assert.equal(evidence.schemaVersion, 'rd009-evidence-1');
    assert.equal(evidence.capturePolicy.serializedOneCommandAtATime, true);
    assert.equal(evidence.capturePolicy.authenticationTranscriptIncluded, false);
    assert.equal(evidence.capturePolicy.unrelatedRemoteTextIncluded, false);
    const source = fs.readFileSync(fixtureUrl, 'utf8');
    assert.doesNotMatch(source, /tells you|password:|Starting FICS session|Guest[A-Z]{4}/i);
});

test('two full, free, and available terse samples retain exact documented footers', () => {
    assert.deepEqual(evidence.terseSamples.map(sample => sample.command),
        ['who', 'who f', 'who a', 'who', 'who f', 'who a']);
    const counts = evidence.terseSamples.map(sample => {
        const match = sample.response.match(terseFooter);
        assert.ok(match, sample.id);
        assert.equal(sample.boundary, 'fics%');
        assert.ok(sample.response.endsWith('fics%'));
        return [Number(match[1]), Number(match[2])];
    });
    assert.deepEqual(counts, [[173, 173], [119, 173], [82, 173], [173, 173], [117, 173], [82, 173]]);
});

test('verbose and registration filters preserve the observed 175-user partition', () => {
    assert.deepEqual(evidence.verboseSamples.map(sample => sample.command), ['who v', 'who av', 'who U', 'who R']);
    const [all, available, unregistered, registered] = evidence.verboseSamples;
    assert.equal(Number(all.response.match(verboseFooter)[1]), 175);
    assert.equal(Number(available.response.match(verboseFooter)[1]), 82);
    const unregisteredCounts = unregistered.response.match(terseFooter);
    const registeredCounts = registered.response.match(terseFooter);
    assert.deepEqual([Number(unregisteredCounts[1]), Number(unregisteredCounts[2])], [57, 175]);
    assert.deepEqual([Number(registeredCounts[1]), Number(registeredCounts[2])], [118, 175]);
    assert.equal(Number(unregisteredCounts[1]) + Number(registeredCounts[1]), 175);
});

test('captured server help proves grammar and marker meanings without parser guesses', () => {
    const help = evidence.serverHelpPages.map(page => page.response).join('\n');
    const variables = evidence.serverVariableHelp.map(page => page.response).join('\n');
    for (const statement of [
        'who    -- lists all users logged on',
        'a: Only available players (open & free).',
        'The format is <rating> <status> <handle>.',
        '++++ means that the user is unregistered',
        '^   involved in a game',
        ':   not open for a match',
        '#   examining a game',
        '&   involved in a tournament',
        'o -- observing a game',
        'Idle -- (in hours/minutes) how the player has been idle'
    ]) assert.ok(help.includes(statement), statement);
    assert.match(variables, /ratings would\s+\r?be displayed as 1500, 1500P or 1500E/);
    assert.match(variables, /":" designation next to their handles in "who" displays/);
});

test('live rows preserve ratings, status, suffix, verbose flags, and LFCR boundaries', () => {
    const terse = evidence.terseSamples[0].response;
    const verbose = evidence.verboseSamples[0].response;
    assert.match(terse, /(?:\d{3,4}|----|\+\+\+\+)[ \^:#.&]P[0-9X]+(?:\([A-Z*]+\))*/);
    assert.match(terse, /\(C\)|\(TD\)|\(U\)/);
    assert.match(verbose, /^\r \|        User\s+Standard\s+Blitz\s+Lightning\s+On for\s+Idle \|/m);
    assert.match(verbose, /^\r \|.{8}P[0-9X]+(?:\S*)\s+(?:\d{3,4}|----|\+\+\+\+)/m);
    assert.ok(terse.includes('\n\r'));
    assert.equal(evidence.transport.lineBreakSequenceObserved, 'LFCR');
});

test('capture metadata proves responses can cross transport chunks', () => {
    const chunks = Object.fromEntries([...evidence.terseSamples, ...evidence.verboseSamples]
        .map(sample => [sample.id, sample.tcpChunkByteLengths]));
    assert.deepEqual(chunks.WHO_1, [1420, 2638]);
    assert.deepEqual(chunks.WHO_2, [2840, 1218]);
    assert.deepEqual(chunks.WHO_VERBOSE, [1420, 12780, 468]);
    assert.deepEqual(chunks.WHO_AVAILABLE_VERBOSE, [1420, 5680, 35]);
});

test('unsolicited prompt-bearing traffic is recorded structurally and excluded from responses', () => {
    assert.deepEqual(evidence.interleavingObservation.sanitizedStructure,
        ['REMOTE_TEXT_REDACTED', 'SERVER_NOTICE', 'REMOTE_TEXT_REDACTED']);
    assert.equal(evidence.interleavingObservation.promptObservedAfterEach, true);
    assert.equal(evidence.interleavingObservation.insideCommandResponseObserved, false);
});

test('RD-009 leaves the production Players body unavailable and introduces no parser', () => {
    assert.match(shell, /Player directory unavailable\./);
    assert.doesNotMatch(shell, /rd009-live-sanitized|FICS_PLAYERS_PROTOCOL_EVIDENCE/);
    assert.doesNotMatch(shell, /function\s+(?:parse|render)Who|who\s+v/);
});
