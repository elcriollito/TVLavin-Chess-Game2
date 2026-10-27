const REQUEST_TYPES = new Set([
  'access',
  'export',
  'correction',
  'deletion',
  'account_closure',
  'consent_withdrawal'
]);

function requireOpaqueId(value, field) {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(normalized)) {
    throw new Error(`${field.toUpperCase()}_INVALID`);
  }
  return normalized;
}

function step(system, action, mode, dependencies = []) {
  return Object.freeze({ system, action, mode, dependencies: Object.freeze([...dependencies]) });
}

export function buildDataRightsPlan(input = {}) {
  if (!REQUEST_TYPES.has(input.requestType)) throw new Error('REQUEST_TYPE_INVALID');

  const requestId = requireOpaqueId(input.requestId, 'request_id');
  const clerkUserId = requireOpaqueId(input.clerkUserId, 'clerk_user_id');
  const supabaseUserId = requireOpaqueId(input.supabaseUserId, 'supabase_user_id');
  const legalHold = input.legalHold === true;
  const destructive = new Set(['deletion', 'account_closure', 'consent_withdrawal']).has(input.requestType);

  const steps = [
    step('operator', 'verify_requester_identity_without_requesting_password_or_token', 'human_review'),
    step('clerk', `inventory_identity_and_sessions:${clerkUserId}`, 'read_only', [0]),
    step('supabase', `inventory_account_rows:${supabaseUserId}`, 'read_only', [0]),
    step('scanner-storage', `inventory_private_objects:${supabaseUserId}`, 'read_only', [2]),
    step('processors', 'inventory_provider_logs_and_supported_rights_channels', 'read_only', [0])
  ];

  if (input.requestType === 'access' || input.requestType === 'export') {
    steps.push(step('operator', 'assemble_minimized_machine_readable_export', 'human_review', [1, 2, 3, 4]));
    steps.push(step('operator', 'deliver_through_verified_private_channel', 'human_review', [5]));
  } else if (input.requestType === 'correction') {
    steps.push(step('operator', 'validate_requested_corrections_and_authoritative_sources', 'human_review', [1, 2]));
    steps.push(step('supabase', `prepare_owner_scoped_correction:${supabaseUserId}`, 'dry_run_only', [5]));
  } else {
    steps.push(step('operator', 'classify_retention_exceptions_and_legal_hold', 'human_review', [1, 2, 3, 4]));
    steps.push(step('clerk', `prepare_session_revocation_and_account_action:${clerkUserId}`, 'dry_run_only', [5]));
    steps.push(step('supabase', `prepare_owner_scoped_row_action:${supabaseUserId}`, 'dry_run_only', [5]));
    steps.push(step('scanner-storage', `prepare_private_object_action:${supabaseUserId}`, 'dry_run_only', [3, 5]));
    steps.push(step('operator', 'prepare_processor_follow_up_and_completion_record', 'human_review', [6, 7, 8]));
  }

  return Object.freeze({
    schemaVersion: 'caissa-data-rights-plan/1',
    requestId,
    requestType: input.requestType,
    destructive,
    executionAuthorized: false,
    legalHold,
    disposition: legalHold && destructive ? 'partial_retention_requires_counsel_review' : 'ready_for_human_review',
    steps: Object.freeze(steps)
  });
}

function sanitizeForCli(value) {
  const plan = buildDataRightsPlan(value);
  return JSON.stringify(plan, null, 2);
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const encoded = process.argv[2];
  if (!encoded) {
    console.error('Usage: node tools/data-rights/plan-request.mjs <base64url-json>');
    process.exitCode = 2;
  } else {
    try {
      const input = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      console.log(sanitizeForCli(input));
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'PLAN_INPUT_INVALID');
      process.exitCode = 1;
    }
  }
}
