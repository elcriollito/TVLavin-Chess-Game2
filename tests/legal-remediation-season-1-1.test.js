import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../docs/legal-remediation-season-1-1/', import.meta.url);
const expected = [
  'CAISSA_REMEDIATION_EXECUTIVE_REPORT.md',
  'CAISSA_AUTH004_RELEASE_READINESS.md',
  'CAISSA_AGE_ELIGIBILITY_DECISION.md',
  'CAISSA_SCANNER_PRIVACY_REMEDIATION.md',
  'CAISSA_SECURITY_REMEDIATION.md',
  'CAISSA_DATA_RIGHTS_RUNBOOK.md',
  'CAISSA_RETENTION_SCHEDULE_PROPOSAL.md',
  'CAISSA_IP_LICENSE_PROVENANCE.md',
  'CAISSA_COMMUNITY_POLICY_READINESS.md',
  'CAISSA_FUTURE_ACTIVATION_GATES.md',
  'CAISSA_RELEASE_DEPENDENCY_MAP.md',
  'CAISSA_HUMAN_APPROVAL_REGISTER.md'
];

test('Season 1.1 package contains every required independently reviewable report', () => {
  assert.deepEqual(fs.readdirSync(root).sort(), expected.sort());
  for (const name of expected) {
    const body = fs.readFileSync(new URL(name, root), 'utf8');
    assert.match(body, /(IMPLEMENTED|TESTED|READY FOR|BLOCKED|NOT STARTED)/);
    assert.doesNotMatch(body, /PENDING_[A-Z_]+/);
  }
});

test('coordination package does not claim forbidden production actions', () => {
  const combined = expected.map(name => fs.readFileSync(new URL(name, root), 'utf8')).join('\n');
  assert.match(combined, /Production changes?[\s\S]*NONE|makes no production change/i);
  assert.match(combined, /migration[\s\S]*(NOT DEPLOYED|NOT APPLIED)/i);
  assert.match(combined, /Market Reader[\s\S]*(NOT STARTED|untouched|work are NOT STARTED)/i);
});
