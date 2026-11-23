import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import handler from '../../api/online.js';
import { projectOnlineArenaState } from '../../api/_lib/online-public-projection.js';

const migrationUrl = new URL('../../supabase/migrations/20261122183216_caissa_tournaments_hfx_005.sql', import.meta.url);
const indexMigrationUrl = new URL('../../supabase/migrations/20261122191500_caissa_tournaments_hfx_005_fk_index.sql', import.meta.url);
const SaturdaysAuditMigrationUrl = new URL('../../supabase/migrations/20261123024955_caissa_saturdays_operator_audit_hardening.sql', import.meta.url);

function response() {
    return {
        statusCode: 200, headers: {}, body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }, end() { return this; }
    };
}

function command(eventType, payload = {}) {
    return { method: 'POST', query: {}, headers: {}, body: {
        protocolVersion: '1.0.0', eventType,
        eventId: `${eventType.replaceAll('.', '-')}:hfx005123456`,
        gameId: null, clientSentAt: Date.now(), payload
    } };
}

const env = {
    CAISSA_ONLINE_ROLLOUT: 'preview',
    CAISSA_ONLINE_TOURNAMENTS: '1',
    CAISSA_ONLINE_ARENA: '1',
    CAISSA_ONLINE_RECURRING_TOURNAMENTS: '1'
};

test('Arena completion persists a non-pairable rest and Next is idempotent and service-only', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    assert.match(sql, /state in \('registered','waiting','playing','resting','withdrawn','disconnected'\)/u);
    assert.match(sql, /then 'resting'/u);
    assert.match(sql, /create or replace function public\.caissa_online_arena_next/u);
    assert.match(sql, /pg_advisory_xact_lock/u);
    assert.match(sql, /participant\.rest-ended/u);
    assert.match(sql, /on conflict\(tournament_id,event_id\) do nothing/u);
    assert.match(sql, /revoke all on function public\.caissa_online_arena_next\(text,uuid,text\) from public,anon,authenticated/u);
    assert.match(sql, /grant execute on function public\.caissa_online_arena_next\(text,uuid,text\) to service_role/u);
});

test('Next Arena Game delegates only the authenticated subject and tournament id', async () => {
    const tournamentId = '6575b2b1-550d-4309-ad85-ed47cff44204';
    let input;
    const res = response();
    await handler(command('tournament.next', { tournamentId }), res, {
        env,
        rateLimit: () => ({ allowed: true }),
        authenticate: async () => ({ authenticated: true, userId: 'user_member_hfx005', guest: false }),
        service: {
            async checkRateLimit() { return { allowed: true }; },
            async requestNextArenaGame(value) {
                input = value;
                return { tournaments: [], current: { id: tournamentId, myState: 'waiting' } };
            },
            async getState() { return { game: null, recentGames: [] }; }
        }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(input.clerkId, 'user_member_hfx005');
    assert.equal(input.tournamentId, tournamentId);
    assert.match(input.eventId, /^tournament-next:/u);
});

test('organizer subject is resolved to a public nickname and removed from API output', async () => {
    const arena = {
        tournaments: [{ id: 'event-a', source: 'community', organizerClerkId: 'user_owner' }],
        current: { id: 'event-a', source: 'community', organizerClerkId: 'user_owner', standings: [], games: [] }
    };
    const projected = await projectOnlineArenaState(arena, async subjects => {
        assert.deepEqual(subjects, ['user_owner']);
        return { user_owner: { role: 'member', displayName: 'TournamentHost' } };
    });
    assert.equal(projected.current.organizerDisplayName, 'TournamentHost');
    assert.equal(projected.tournaments[0].organizerDisplayName, 'TournamentHost');
    assert.equal(JSON.stringify(projected).includes('user_owner'), false);
});

test('official recurrence is non-public, audited, and does not alter Saturdays occurrence keys', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    const indexSql = await readFile(indexMigrationUrl, 'utf8');
    assert.match(sql, /caissa_online_series_operator_audit/u);
    assert.match(sql, /enable row level security/u);
    assert.match(sql, /public\.caissa_online_official_series_operator/u);
    assert.match(sql, /jsonb_object_keys\(p_payload\)/u);
    assert.match(sql, /key not in\('actor','slug','title'/u);
    assert.match(sql, /revoke all on function public\.caissa_online_official_series_operator\(text,text,jsonb\) from public,anon,authenticated/u);
    assert.match(sql, /where enabled and series_kind='official' and slug='saturdays-of-chess-s001'/u);
    assert.match(sql, /v_series\.slug\|\|':'\|\|v_date::text\|\|':'\|\|\(v_slot->>'id'\)/u);
    assert.match(sql, /official_flexible_generate/u);
    assert.match(sql, /frequency_unit='daily'/u);
    assert.match(indexSql, /caissa_online_series_operator_audit_series_idx/u);
    assert.match(sql, /frequency_unit='weekly'/u);
});

test('public UI removes recurrence controls and exposes Share Info Manage and larger orange directory affordances', async () => {
    const [html, css, page] = await Promise.all([
        readFile(new URL('../../online.html', import.meta.url), 'utf8'),
        readFile(new URL('../../css/online.css', import.meta.url), 'utf8'),
        readFile(new URL('../../js/online/online-page.js', import.meta.url), 'utf8')
    ]);
    assert.doesNotMatch(html, /Repeat Tournament|Calendar recurrence/u);
    assert.match(html, /arena-detail-info-toggle/u);
    assert.match(html, /arena-detail-share/u);
    assert.match(html, /arena-detail-manage-toggle/u);
    assert.match(html, /tournament-share-dialog/u);
    assert.doesNotMatch(html, /weekly-admin-controls|weekly-enable|weekly-config-form|arena-manage-series/u);
    assert.doesNotMatch(page, /manageWeeklySeries|renderWeeklyAdmin|weekly-admin-controls|arena-manage-series/u);
    assert.match(page, /\/online\/tournaments/u);
    assert.match(page, /searchParams\.set\('tournament', tournamentId\)/u);
    assert.match(css, /width:min\(1480px/u);
    assert.match(css, /grid-template-columns:minmax\(320px,1fr\) 150px 160px 210px 230px/u);
    assert.match(css, /#f29a2e/u);
    assert.match(page, /function syncTournamentCreationAccess\(\)/u);
    assert.match(page, /model\.tournamentOrganizer[\s\S]+capabilities\?\.tournamentCreation === true/u);
});

test('Saturdays administration remains on its dedicated server-authorized service path', async () => {
    const [migration, auditMigration, operator, api, service] = await Promise.all([
        readFile(new URL('../../supabase/migrations/20261121042618_caissa_tournaments_expansion_weekly_daily_s001.sql', import.meta.url), 'utf8'),
        readFile(SaturdaysAuditMigrationUrl, 'utf8'),
        readFile(new URL('../../scripts/manage-saturdays-of-chess.mjs', import.meta.url), 'utf8'),
        readFile(new URL('../../api/online.js', import.meta.url), 'utf8'),
        readFile(new URL('../../api/_lib/online-service.js', import.meta.url), 'utf8')
    ]);
    assert.match(migration, /revoke all on function public\.caissa_online_weekly_admin\(text,text,text,jsonb\) from public,anon,authenticated/u);
    assert.match(migration, /grant execute on function public\.caissa_online_weekly_admin\(text,text,text,jsonb\) to service_role/u);
    assert.match(api, /CAISSA_ONLINE_TOURNAMENT_ADMINS/u);
    assert.match(service, /rpc\(db, 'caissa_online_weekly_admin'/u);
    assert.match(auditMigration, /caissa_online_series_operator_audit/u);
    assert.match(auditMigration, /where event_id=p_event_id[\s\S]+payload->>'operator'='saturdays-of-chess'/u);
    assert.match(auditMigration, /raise exception 'CAISSA_ONLINE_SERIES_EVENT_ID_CONFLICT'/u);
    assert.match(auditMigration, /'operator','saturdays-of-chess','requestedAction',p_action/u);
    assert.match(auditMigration, /v_audit_action:=case when p_action='enable' then 'resume' else p_action end/u);
    assert.match(auditMigration, /revoke all on function public\.caissa_online_weekly_admin\(text,text,text,jsonb\)[\s\S]+from public,anon,authenticated/u);
    assert.match(auditMigration, /grant execute on function public\.caissa_online_weekly_admin\(text,text,text,jsonb\)[\s\S]+to service_role/u);
    assert.match(operator, /CAISSA_OPERATOR_EXPECTED_PROJECT_REF/u);
    assert.match(operator, /CAISSA_OPERATOR_SERVICE_ROLE_KEY/u);
    assert.match(operator, /client\.rpc\('caissa_online_weekly_admin'/u);
    assert.doesNotMatch(operator, /process\.env\.(?:NEXT_PUBLIC|VITE|PUBLIC)_/u);
});
