import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('physical-device plan is versioned, honest, complete, and contains no machine address', () => {
    const plan = read('docs/architecture/PLAY_V2_PHYSICAL_DEVICE_QA_PLAN.md');
    assert.match(plan, /PlayV2PhysicalDeviceQAPlan@1\.0\.0/);
    assert.match(plan, /NOT PHYSICALLY TESTED/);
    for (const heading of ['Secure local testing architecture', 'iPhone Safari checklist', 'Android Chrome checklist',
        'Tablet portrait and landscape checklist', 'Cross-platform mode matrix', 'Severity and certification rules', 'Automated pre-QA support'])
        assert.match(plan, new RegExp(`## ${heading}`));
    for (const prefix of ['IOS-', 'AND-', 'TAB-', 'MODE-', 'SEC-']) assert.match(plan, new RegExp(prefix));
    const numericUrls = plan.match(/https?:\/\/(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?/g) || [];
    assert.ok(numericUrls.every(url => /^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(url)),
        `only an HTTP loopback URL may be numeric: ${numericUrls.join(', ')}`);
    assert.doesNotMatch(plan, /ngrok|cloudflare tunnel|localtunnel/i);
});

test('evidence schema requires complete attributed results without sensitive identifiers', () => {
    const schema = JSON.parse(read('docs/architecture/evidence/PLAY_V2_PHYSICAL_DEVICE_QA_TEMPLATE.json'));
    assert.equal(schema.$id, 'PlayV2PhysicalDeviceQAEvidence@1.0.0');
    assert.deepEqual(schema.required, ['schemaVersion', 'session', 'results', 'issues', 'certification']);
    const sessionRequired = schema.properties.session.required;
    for (const field of ['sessionId','testerId','startedAt','device','browser','viewport','orientation','networkContext','build','gateStage'])
        assert.ok(sessionRequired.includes(field));
    const resultRequired = schema.$defs.result.required;
    for (const field of ['testCaseId','status','observedBehavior','expectedBehavior','evidenceFiles','issueSeverity','reproductionSteps','retestStatus'])
        assert.ok(resultRequired.includes(field));
    const source = JSON.stringify(schema);
    assert.doesNotMatch(source, /serialNumber|advertisingId|ipAddress|credential|password/i);
    assert.deepEqual(schema.examples, []);
});

test('local server defaults to loopback while internal beta remains exact-stage gated', () => {
    const server = read('server.js'); const gate = read('js/play/play-v2-beta-entry-gate.js');
    assert.match(server, /process\.env\.CAISSA_SERVER_HOST \|\| '127\.0\.0\.1'/);
    assert.match(server, /server\.listen\(PORT, HOST/);
    assert.match(gate, /CAISSA_PLAY_V2_BETA_STAGE/); assert.match(gate, /=== PLAY_V2_BETA_ENTRY\.currentStage/);
    assert.doesNotMatch(server, /0\.0\.0\.0|firewall|tunnel/i);
});

test('issue template owns severity, reproduction, evidence and retest without fabricated observation', () => {
    const issue = read('docs/architecture/evidence/PLAY_V2_PHYSICAL_DEVICE_ISSUE_TEMPLATE.md');
    for (const term of ['Issue ID', 'Test-case ID', 'Severity', 'Reproduction steps', 'Expected behavior',
        'Observed behavior', 'Evidence filenames', 'Retest']) assert.match(issue, new RegExp(term, 'i'));
    assert.match(issue, /P0 \/ P1 \/ P2 \/ P3/);
});
