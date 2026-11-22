import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import handler from '../../api/online.js';
import { projectOnlineArenaState } from '../../api/_lib/online-public-projection.js';

const migrationUrl = new URL('../../supabase/migrations/20261122183216_caissa_tournaments_hfx_005.sql', import.meta.url);
const indexMigrationUrl = new URL('../../supabase/migrations/20261122191500_caissa_tournaments_hfx_005_fk_index.sql', import.meta.url);

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
    assert.match(page, /\/online\/tournaments/u);
    assert.match(page, /searchParams\.set\('tournament', tournamentId\)/u);
    assert.match(css, /width:min\(1320px/u);
    assert.match(css, /#f29a2e/u);
});
