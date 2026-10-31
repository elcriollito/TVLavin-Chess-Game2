const EXPORT_RPC = 'export_caissa_account_data_page';
const SCANNER_PUBLIC_EXPORT_RPC = 'export_caissa_scanner_public_data_page';
const OPENING_REPERTOIRE_EXPORT_RPC = 'export_caissa_opening_repertoire_data_page';
const SUPPLEMENTAL_EXPORT_RPC = 'export_caissa_account_supplemental_data_page';
const PAGE_SIZE = 100;
const OPENING_REPERTOIRE_PAGE_SIZE = 10;
const SCANNER_PUBLIC_PAGE_SIZE = 2;
const DEFAULT_EXPORT_WORK_LIMITS = Object.freeze({
    rpcCalls: 128,
    rows: 10_000,
    bodyBytes: 16 * 1024 * 1024
});
const SCANNER_PUBLIC_SECTIONS = new Set([
    'scannerPublicScans',
    'scannerPublicFeedback',
    'scannerPublicCertifications',
    'scannerPublicReviewEvents'
]);
const SCANNER_LEGACY_SECTIONS = new Set([
    'scannerScans',
    'scannerFeedback',
    'scannerFailures',
    'scannerCorrections'
]);
const SUPPLEMENTAL_SECTIONS = new Set([
    ...SCANNER_LEGACY_SECTIONS,
    'playerAlbumEntitlements',
    'identityEnrollmentDecisions'
]);

export class AccountExportStreamError extends Error {
    constructor(code, message = code) {
        super(message);
        this.name = 'AccountExportStreamError';
        this.code = code;
    }
}

export async function streamAccountExport({
    res,
    db,
    userId,
    bindingId,
    now = () => new Date(),
    workLimits = DEFAULT_EXPORT_WORK_LIMITS
}) {
    if (!db || typeof db.rpc !== 'function' || typeof res.write !== 'function') {
        throw new AccountExportStreamError('CAISSA_ACCOUNT_EXPORT_UNAVAILABLE');
    }

    const generatedAt = now().toISOString();
    const budget = createWorkBudget(workLimits);
    const exportOptions = { db, userId, bindingId, generatedAt, budget };
    // Validate ownership before committing response headers. The database repeats
    // the same fail-closed ownership/state check on every bounded page.
    const account = await readSingleton({ ...exportOptions, section: 'account' });

    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="caissa-account-data-${generatedAt.slice(0, 10)}.json"`);
    res.setHeader('X-CAISSA-Export-Schema', 'caissa.account-export.v1');

    try {
        const write = chunk => writeChunk(res, chunk, budget);
        const writeValue = value => writeJson(res, value, budget);
        const readOne = section => readSingleton({ ...exportOptions, section });
        const writeList = section => writeArray(res, { ...exportOptions, section });

        await write('{"schemaVersion":"caissa.account-export.v1","generatedAt":');
        await writeValue(generatedAt);
        await write(',"account":');
        await writeValue(account);
        await write(',"publicIdentity":');
        await writeValue(await readOne('publicIdentity'));
        await write(',"identitySecurity":{"enrollmentDecisions":');
        await writeList('identityEnrollmentDecisions');

        await write('},"puzzleTraining":{"progress":');
        await writeValue(await readOne('puzzleProgress'));
        await write(',"attempts":');
        await writeList('puzzleAttempts');
        await write('},"library":{"positions":');
        await writeList('libraryPositions');
        await write(',"collections":');
        await writeList('libraryCollections');
        await write('},"openingTrainer":{"repertoires":');
        await writeList('openingRepertoires');
        await write('},"scanner":{"scans":');
        await writeList('scannerScans');
        await write(',"feedback":');
        await writeList('scannerFeedback');
        await write(',"failures":');
        await writeList('scannerFailures');
        await write(',"corrections":');
        await writeList('scannerCorrections');
        await write(',"publicScans":');
        await writeList('scannerPublicScans');
        await write(',"publicFeedback":');
        await writeList('scannerPublicFeedback');
        await write(',"certifications":');
        await writeList('scannerPublicCertifications');
        await write(',"reviewEvents":');
        await writeList('scannerPublicReviewEvents');
        await write('},"mentor":{"results":');
        await writeList('mentorResults');
        await write('},"betaActivity":');
        await writeList('betaActivity');

        await write(',"online":{"profile":');
        await writeValue(await readOne('onlineProfile'));
        await write(',"ratings":');
        await writeList('onlineRatings');
        await write(',"gameCount":');
        await writeValue(await readOne('onlineGameCount') ?? 0);

        await write('},"insights":{"datasets":');
        await writeList('insightDatasets');
        await write(',"reports":');
        await writeList('insightReports');
        await write(',"contentNotice":');
        await writeValue('Analysis metadata is included. Imported PGN and report content may contain third-party data and are not included in this owner export.');

        await write('},"economy":{"creditEvents":');
        await writeList('creditEvents');
        await write(',"productEntitlements":');
        await writeList('productEntitlements');
        await write(',"userEntitlements":');
        await writeList('userEntitlements');
        await write(',"playerAlbumEntitlements":');
        await writeList('playerAlbumEntitlements');
        await write(',"creditReservations":');
        await writeList('creditReservations');
        await write(',"usageEvents":');
        await writeList('usageEvents');
        await write(',"billingRecordCount":');
        await writeValue(await readOne('billingRecordCount') ?? 0);
        await write('},"localDataNotice":');
        await writeValue('Browser-local libraries remain on the device and are not transferred to the server export.');
        await write(',"sharedHistoryNotice":');
        await writeValue('Shared games are counted but third-party player data is not included.');
        await write('}');
        res.end();
    } catch (error) {
        if (typeof res.destroy === 'function') res.destroy(error);
        if (error instanceof AccountExportStreamError) throw error;
        throw new AccountExportStreamError('CAISSA_ACCOUNT_EXPORT_STREAM_FAILED');
    }
}

async function readSingleton(options) {
    const page = await readPage({ ...options, offset: 0, limit: 1 });
    return page.length ? page[0] : null;
}

async function writeArray(res, options) {
    await writeChunk(res, '[', options.budget);
    let offset = 0;
    let first = true;
    const pageSize = SCANNER_PUBLIC_SECTIONS.has(options.section) || SCANNER_LEGACY_SECTIONS.has(options.section)
        ? SCANNER_PUBLIC_PAGE_SIZE
        : options.section === 'openingRepertoires' ? OPENING_REPERTOIRE_PAGE_SIZE : PAGE_SIZE;
    while (true) {
        const page = await readPage({ ...options, offset, limit: pageSize });
        for (const item of page) {
            if (!first) await writeChunk(res, ',', options.budget);
            await writeJson(res, item, options.budget);
            first = false;
        }
        if (page.length < pageSize) break;
        offset += page.length;
    }
    await writeChunk(res, ']', options.budget);
}

async function readPage({ db, userId, bindingId, generatedAt, section, offset, limit, budget }) {
    const rpc = section === 'openingRepertoires'
        ? OPENING_REPERTOIRE_EXPORT_RPC
        : SCANNER_PUBLIC_SECTIONS.has(section) ? SCANNER_PUBLIC_EXPORT_RPC
            : SUPPLEMENTAL_SECTIONS.has(section) ? SUPPLEMENTAL_EXPORT_RPC : EXPORT_RPC;
    chargeRpc(budget);
    const { data, error } = await db.rpc(rpc, {
        p_user_id: userId,
        p_binding_id: bindingId,
        p_section: section,
        p_offset: offset,
        p_limit: limit,
        p_snapshot_at: generatedAt
    });
    if (error) throw new AccountExportStreamError('CAISSA_ACCOUNT_EXPORT_UPSTREAM_FAILED');
    if (!Array.isArray(data) || data.length > limit) {
        throw new AccountExportStreamError('CAISSA_ACCOUNT_EXPORT_INVALID_PAGE');
    }
    const page = data.map(row => Object.hasOwn(row || {}, 'data') ? row.data : row);
    chargeRows(budget, page.length);
    return page;
}

async function writeJson(res, value, budget) {
    await writeChunk(res, JSON.stringify(value), budget);
}

async function writeChunk(res, chunk, budget) {
    chargeBodyBytes(budget, chunk);
    if (res.write(chunk) !== false || typeof res.once !== 'function') return;
    await new Promise((resolve, reject) => {
        res.once('drain', resolve);
        res.once('error', reject);
    });
}

function createWorkBudget(limits) {
    const configured = limits && typeof limits === 'object' ? limits : {};
    const rpcCalls = positiveLimit(configured.rpcCalls, DEFAULT_EXPORT_WORK_LIMITS.rpcCalls);
    const rows = positiveLimit(configured.rows, DEFAULT_EXPORT_WORK_LIMITS.rows);
    const bodyBytes = positiveLimit(configured.bodyBytes, DEFAULT_EXPORT_WORK_LIMITS.bodyBytes);
    return { rpcCalls: 0, rows: 0, bodyBytes: 0, limits: { rpcCalls, rows, bodyBytes } };
}

function positiveLimit(value, fallback) {
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function chargeRpc(budget) {
    if (!budget || budget.rpcCalls >= budget.limits.rpcCalls) throw workBudgetExceeded();
    budget.rpcCalls += 1;
}

function chargeRows(budget, rows) {
    if (!budget || budget.rows + rows > budget.limits.rows) throw workBudgetExceeded();
    budget.rows += rows;
}

function chargeBodyBytes(budget, chunk) {
    const bytes = Buffer.isBuffer(chunk)
        ? chunk.length
        : Buffer.byteLength(String(chunk), 'utf8');
    if (!budget || budget.bodyBytes + bytes > budget.limits.bodyBytes) throw workBudgetExceeded();
    budget.bodyBytes += bytes;
}

function workBudgetExceeded() {
    return new AccountExportStreamError('CAISSA_ACCOUNT_EXPORT_WORK_BUDGET_EXCEEDED');
}
