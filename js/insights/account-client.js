(function installInsightsAccount(global) {
    'use strict';
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    function create(options = {}) {
        const auth = options.auth || global.CAISSA_AUTH;
        const storage = options.storage || global.localStorage;
        const fetchFn = options.fetch || global.fetch.bind(global);
        const ownerOf = () => auth?.isSignedIn && auth.userId ? auth.userId : null;
        let owner = ownerOf(), generation = 0, abort = new AbortController();
        const key = value => `caissa_insights_workspace_v1:${encodeURIComponent(value)}`;
        function syncOwner() {
            const next = ownerOf();
            if (next === owner) return;
            abort.abort(); abort = new AbortController(); generation++; owner = next;
            options.onOwnerChange?.(owner);
        }
        const unsubscribe = auth?.onAuthStateChange?.(syncOwner);
        function assertOwner(expected, epoch) {
            syncOwner();
            if (!expected || owner !== expected || epoch !== generation) throw Object.assign(new Error('Account changed. Open your report from the original account.'), { code: 'ACCOUNT_CHANGED' });
        }
        async function request(path, init = {}, context = { owner, generation }) {
            assertOwner(context.owner, context.generation);
            const token = await auth.getToken();
            assertOwner(context.owner, context.generation);
            if (!token) throw Object.assign(new Error('Sign in to save and recover reports.'), { code: 'AUTH_REQUIRED' });
            const response = await fetchFn(`/api/insights/${path}`, { ...init, cache: 'no-store', signal: abort.signal,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
            const payload = await response.json().catch(() => null);
            assertOwner(context.owner, context.generation);
            if (!response.ok || !payload) throw Object.assign(new Error(payload?.error || 'Report service unavailable. Your report has not been saved.'), { code: payload?.code || 'SAVE_FAILED' });
            if (payload.accountId !== context.owner || payload.persistent !== true) throw new Error('The server did not confirm account persistence.');
            return payload;
        }
        function readWorkspace() {
            syncOwner(); if (!owner) return null;
            try { const data = JSON.parse(storage.getItem(key(owner))); return data?.ownerId === owner ? data : null; }
            catch { return null; }
        }
        function writeWorkspace(data) {
            syncOwner(); if (!owner) return false;
            try { storage.setItem(key(owner), JSON.stringify({ ...data, ownerId: owner })); return true; }
            catch { return false; }
        }
        function clearWorkspace() {
            syncOwner(); if (owner) storage.removeItem(key(owner));
        }
        async function save(dataset, snapshot, operationId) {
            syncOwner();
            const context = { owner, generation };
            if (!UUID.test(operationId || '')) throw new Error('Missing report operation ID');
            const imported = await request('datasets', { method: 'POST', body: JSON.stringify({ rawText: dataset.rawText,
                subject: { provider: dataset.subject.provider, username: dataset.subject.username }, importMetadata: dataset.importMetadata || [] }) }, context);
            const result = await request('reports', { method: 'POST', body: JSON.stringify({ datasetId: imported.datasetId, operationId, snapshot }) }, context);
            if (!UUID.test(result.reportId || '') || !Number.isFinite(Date.parse(result.createdAt))) throw new Error('The server did not confirm a saved report.');
            return result;
        }
        return { ownerId: () => { syncOwner(); return owner; }, readWorkspace, writeWorkspace, clearWorkspace, save,
            list: cursor => request(`reports${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
            recover: id => { if (!UUID.test(id)) throw new Error('Invalid report ID'); return request(`reports/${id}`); },
            remove: id => { if (!UUID.test(id)) throw new Error('Invalid report ID'); return request(`reports/${id}`, { method: 'DELETE' }); },
            dispose: () => { abort.abort(); unsubscribe?.(); } };
    }
    global.CaissaInsightsAccount = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
