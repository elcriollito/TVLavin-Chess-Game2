const EXPORT_RPC = 'export_caissa_account_data_page';
const SCANNER_PUBLIC_EXPORT_RPC = 'export_caissa_scanner_public_data_page';
const PAGE_SIZE = 100;
const SCANNER_PUBLIC_SECTIONS = new Set([
    'scannerPublicScans',
    'scannerPublicFeedback',
    'scannerPublicCertifications',
    'scannerPublicReviewEvents'
]);

export class AccountExportStreamError extends Error {
    constructor(code, message = code) {
        super(message);
        this.name = 'AccountExportStreamError';
        this.code = code;
    }
}

export async function streamAccountExport({ res, db, userId, bindingId, now = () => new Date() }) {
    if (!db || typeof db.rpc !== 'function' || typeof res.write !== 'function') {
        throw new AccountExportStreamError('CAISSA_ACCOUNT_EXPORT_UNAVAILABLE');
    }

    const generatedAt = now().toISOString();
    // Validate ownership before committing response headers. The database repeats
    // the same fail-closed ownership/state check on every bounded page.
    const account = await readSingleton({ db, userId, bindingId, generatedAt, section: 'account' });

    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="caissa-account-data-${generatedAt.slice(0, 10)}.json"`);
    res.setHeader('X-CAISSA-Export-Schema', 'caissa.account-export.v1');

    try {
        await writeChunk(res, '{"schemaVersion":"caissa.account-export.v1","generatedAt":');
        await writeJson(res, generatedAt);
        await writeChunk(res, ',"account":');
        await writeJson(res, account);
        await writeChunk(res, ',"publicIdentity":');
        await writeJson(res, await readSingleton({ db, userId, bindingId, generatedAt, section: 'publicIdentity' }));

        await writeChunk(res, ',"puzzleTraining":{"progress":');
        await writeJson(res, await readSingleton({ db, userId, bindingId, generatedAt, section: 'puzzleProgress' }));
        await writeChunk(res, ',"attempts":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'puzzleAttempts' });
        await writeChunk(res, '},"library":{"positions":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'libraryPositions' });
        await writeChunk(res, ',"collections":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'libraryCollections' });
        await writeChunk(res, '},"scanner":{"scans":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'scannerScans' });
        await writeChunk(res, ',"publicScans":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'scannerPublicScans' });
        await writeChunk(res, ',"publicFeedback":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'scannerPublicFeedback' });
        await writeChunk(res, ',"certifications":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'scannerPublicCertifications' });
        await writeChunk(res, ',"reviewEvents":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'scannerPublicReviewEvents' });
        await writeChunk(res, '},"mentor":{"results":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'mentorResults' });
        await writeChunk(res, '},"betaActivity":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'betaActivity' });

        await writeChunk(res, ',"online":{"profile":');
        await writeJson(res, await readSingleton({ db, userId, bindingId, generatedAt, section: 'onlineProfile' }));
        await writeChunk(res, ',"ratings":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'onlineRatings' });
        await writeChunk(res, ',"gameCount":');
        await writeJson(res, await readSingleton({ db, userId, bindingId, generatedAt, section: 'onlineGameCount' }) ?? 0);

        await writeChunk(res, '},"insights":{"datasets":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'insightDatasets' });
        await writeChunk(res, ',"reports":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'insightReports' });

        await writeChunk(res, '},"economy":{"creditEvents":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'creditEvents' });
        await writeChunk(res, ',"productEntitlements":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'productEntitlements' });
        await writeChunk(res, ',"userEntitlements":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'userEntitlements' });
        await writeChunk(res, ',"creditReservations":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'creditReservations' });
        await writeChunk(res, ',"usageEvents":');
        await writeArray(res, { db, userId, bindingId, generatedAt, section: 'usageEvents' });
        await writeChunk(res, ',"billingRecordCount":');
        await writeJson(res, await readSingleton({ db, userId, bindingId, generatedAt, section: 'billingRecordCount' }) ?? 0);
        await writeChunk(res, '},"localDataNotice":');
        await writeJson(res, 'Browser-local libraries remain on the device and are not transferred to the server export.');
        await writeChunk(res, ',"sharedHistoryNotice":');
        await writeJson(res, 'Shared games are counted but third-party player data is not included.');
        await writeChunk(res, '}');
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
    await writeChunk(res, '[');
    let offset = 0;
    let first = true;
    while (true) {
        const page = await readPage({ ...options, offset, limit: PAGE_SIZE });
        for (const item of page) {
            if (!first) await writeChunk(res, ',');
            await writeJson(res, item);
            first = false;
        }
        if (page.length < PAGE_SIZE) break;
        offset += page.length;
    }
    await writeChunk(res, ']');
}

async function readPage({ db, userId, bindingId, generatedAt, section, offset, limit }) {
    const rpc = SCANNER_PUBLIC_SECTIONS.has(section) ? SCANNER_PUBLIC_EXPORT_RPC : EXPORT_RPC;
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
    return data.map(row => Object.hasOwn(row || {}, 'data') ? row.data : row);
}

async function writeJson(res, value) {
    await writeChunk(res, JSON.stringify(value));
}

async function writeChunk(res, chunk) {
    if (res.write(chunk) !== false || typeof res.once !== 'function') return;
    await new Promise((resolve, reject) => {
        res.once('drain', resolve);
        res.once('error', reject);
    });
}
