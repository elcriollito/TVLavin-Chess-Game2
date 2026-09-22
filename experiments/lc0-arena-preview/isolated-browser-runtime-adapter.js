// EAE-013 preview-only Arena participant. ArenaRuntimeManager owns this adapter;
// the durable relay and isolated EAE-012 engine page own all real engine work.
(function () {
    const ID = 'lc0-maia-1100-preview';
    const EXPECTED = Object.freeze({
        providerClass: 'lc0-browser-experimental',
        version: 'v0.33.0-dev+git.482bb4a',
        sourceCommit: '482bb4a830287b726ebe7d42f14ab7f5f17c18a0',
        uciName: 'Lc0 v0.33.0-dev+git.482bb4a',
        uciAuthor: 'The LCZero Authors.',
        backend: 'cpu-wasm',
        networkId: 'CSSLab Maia 1100 v1.0',
        networkSha256: 'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4',
        manifestSha256: 'b1a28b43918980191d62fc9c67892a00a5458126a1005ea139615c9c9b633c2a'
    });
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

    function checkIdentity(value) {
        return !!value && Object.entries(EXPECTED).every(([key, expected]) => value[key] === expected)
            && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value.runtimeInstanceId || '');
    }

    function legalMove(fen, uci) {
        const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci || '');
        if (!match || typeof Chess !== 'function') return false;
        try {
            const game = new Chess();
            if (game.load(fen) === false) return false;
            return !!game.move({ from: match[1], to: match[2], promotion: match[3] || 'q' });
        } catch { return false; }
    }

    class IsolatedBrowserRuntimeAdapter {
        constructor(provider, options, coordinator) {
            this.id = provider.id;
            this.providerId = provider.id;
            this.requestedEngineId = provider.id;
            this.workerPath = provider.workerPath;
            this.owner = options.owner;
            this.role = /^arena:(white|black)$/.exec(options.owner || '')?.[1] || null;
            this.onRuntimeUnavailable = options.onRuntimeUnavailable;
            this.coordinator = coordinator;
            this.asyncLifecycle = true;
            this.ready = false;
            this.analyzing = false;
            this.closed = false;
            this.terminating = false;
            this.onLine = null;
            this.onInfo = null;
            this.onBestMove = null;
            this.onError = null;
            this.events = [];
            this.eventSerial = 0;
            this.waiters = [];
            this.cursor = 0;
            this.seq = 0;
            this.sessionId = null;
            this.active = null;
            this.lastSearchId = null;
            this.lastPhase = 'CREATED';
            this.gameId = crypto.randomUUID();
            this.identity = null;
            this.streamController = null;
            this.streamTask = null;
            this.heartbeatTimer = null;
            this.mainLeaseEpoch = 0;
            this.searchPromise = null;
            this.stopPromise = null;
            this.terminatePromise = null;
            this.createdAt = performance.now();
            this.metrics = { selectionToReadyMs: null, stopMs: [], cleanupMs: null,
                firstSearchAfterMatchStartMs: null, infoReceived: 0, infoPresented: 0,
                cleanupFailureClassification: null, cleanupEvidence: null };
            if (!this.role) throw new Error('LC0_ARENA_ROLE_INVALID');
            coordinator.adapter = this;
        }

        status(value) { this.coordinator.status(value); }

        async api(action, { body, sessionId = this.sessionId, cursor, signal } = {}) {
            const token = await window.CAISSA_AUTH?.getToken?.();
            if (!token) throw new Error('CAISSA_SIGN_IN_REQUIRED');
            const url = new URL('/api/eae011', location.origin);
            url.searchParams.set('action', action);
            if (sessionId) url.searchParams.set('sessionId', sessionId);
            if (cursor != null) url.searchParams.set('cursor', String(cursor));
            const response = await fetch(url, { method: body ? 'POST' : 'GET',
                headers: { Authorization: `Bearer ${token}`,
                    ...(body ? { 'Content-Type': 'application/json' } : {}) },
                ...(body ? { body: JSON.stringify(body) } : {}),
                ...(signal ? { signal } : {}) });
            if (!response.ok) {
                const value = await response.json().catch(() => ({}));
                const error = new Error(value.error || `RELAY_HTTP_${response.status}`);
                error.status = response.status;
                throw error;
            }
            return action === 'stream_main' ? response : response.json();
        }

        waitEvent(predicate, from = this.eventSerial, timeoutMs = 12_000) {
            const found = this.events.find(item => item._localSeq > from && predicate(item));
            if (found) return Promise.resolve(found);
            return new Promise((resolve, reject) => {
                const waiter = { predicate, resolve, reject, timer: setTimeout(() => {
                    this.waiters.splice(this.waiters.indexOf(waiter), 1);
                    reject(new Error('LC0_RELAY_EVENT_TIMEOUT'));
                }, timeoutMs) };
                this.waiters.push(waiter);
            });
        }

        dispatch(value) {
            value._localSeq = ++this.eventSerial;
            this.events.push(value);
            if (this.events.length > 160) this.events.splice(0, this.events.length - 120);
            if (value.type === 'READY') {
                if (!checkIdentity(value.identity) ||
                    (this.identity && this.identity.runtimeInstanceId !== value.identity.runtimeInstanceId))
                    return this.fail(new Error('LC0_RUNTIME_IDENTITY_INVALID'));
                this.identity = Object.freeze({ ...value.identity });
                this.ready = true;
                this.lastPhase = 'READY';
                this.status('Ready — verified Lc0 / Maia 1100');
            } else if (value.type === 'INFO' && this.active?.searchId === value.searchId) {
                this.metrics.infoReceived += 1;
                if (performance.now() - (this.lastInfoPresentedAt || 0) >= 250) {
                    this.lastInfoPresentedAt = performance.now();
                    this.metrics.infoPresented += 1;
                    const normalized = { depth: value.depth, nodes: value.nodes,
                        score: value.score / 100, pv: String(value.pv || '').split(/\s+/).filter(Boolean) };
                    this.onInfo?.(normalized);
                    this.coordinator.info(normalized, this.active.fen);
                }
            } else if (value.type === 'BESTMOVE' && this.active?.searchId === value.searchId) {
                this.active.bestmove = value.move;
            } else if (value.type === 'STOPPED' && this.active?.searchId === value.searchId) {
                this.lastPhase = 'STOPPED';
            } else if (value.type === 'CLEANUP') {
                this.lastPhase = 'CLEANED';
                this.terminating = true;
            } else if (value.type === 'ERROR') {
                this.fail(new Error(value.code || 'LC0_RELAY_FAILURE'));
            }
            for (const waiter of [...this.waiters]) {
                if (!waiter.predicate(value)) continue;
                clearTimeout(waiter.timer);
                this.waiters.splice(this.waiters.indexOf(waiter), 1);
                waiter.resolve(value);
            }
        }

        reconcile(state) {
            if (!checkIdentity(state.identity) ||
                state.identity.runtimeInstanceId !== this.identity?.runtimeInstanceId)
                throw new Error('LC0_RECONNECT_IDENTITY_INVALID');
            // An operation exists before RESET/POSITION/GO. The broker may
            // still own the prior search then; only a GO-acknowledged search
            // has an active generation to reconcile.
            if (!this.active?.started) return;
            if (state.activeSearchId !== this.active.searchId)
                throw new Error('LC0_RECONNECT_SEARCH_MISMATCH');
            this.active.transportUncertain = true;
            // The EAE-012 engine client stops locally on transport loss.
            // Never send GO again; resolve or safely abort this same search.
            this.stop().catch(error => this.fail(error));
        }

        heartbeatError(error, epoch, controller) {
            // A heartbeat from the replaced SSE epoch may resolve after the
            // replacement is already healthy. It has no authority to revoke
            // this session (especially during Pause -> Resume).
            if (this.closed || this.terminating || this.streamController !== controller ||
                this.mainLeaseEpoch !== epoch) return;
            if (error.status === 410) this.fail(error);
            else controller.abort(); // Inspect and reconnect within the durable lease.
        }

        async consumeStream() {
            while (!this.closed && !this.terminating) {
                const controller = new AbortController();
                this.streamController = controller;
                try {
                    const response = await this.api('stream_main', { cursor: this.cursor,
                        signal: controller.signal });
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    while (!this.closed && !this.terminating) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        let boundary;
                        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
                            const frame = buffer.slice(0, boundary);
                            buffer = buffer.slice(boundary + 2);
                            const dataLine = frame.split('\n').find(line => line.startsWith('data: '));
                            const idLine = frame.split('\n').find(line => line.startsWith('id: '));
                            if (frame.startsWith('event: lease') && dataLine) {
                                const epoch = JSON.parse(dataLine.slice(6)).epoch;
                                this.mainLeaseEpoch = epoch;
                                clearInterval(this.heartbeatTimer);
                                let inFlight = false;
                                this.heartbeatTimer = setInterval(() => {
                                    if (inFlight) return;
                                    inFlight = true;
                                    this.api('heartbeat_main', { body: { epoch, cursor: this.cursor } })
                                        .catch(error => this.heartbeatError(error, epoch, controller))
                                        .finally(() => { inFlight = false; });
                                }, 1_500);
                            } else if (dataLine && idLine) {
                                const id = Number(idLine.slice(4));
                                if (id > this.cursor) {
                                    this.cursor = id;
                                    this.dispatch(JSON.parse(dataLine.slice(6)));
                                }
                            } else if (dataLine) {
                                const event = JSON.parse(dataLine.slice(6));
                                if (event.type === 'ERROR') throw new Error(event.code);
                            }
                        }
                    }
                } catch (error) {
                    if (this.closed || this.terminating) break;
                    if (error.name !== 'AbortError')
                        this.status(`Relay reconnecting: ${error.message}`);
                } finally { clearInterval(this.heartbeatTimer); }
                if (this.closed || this.terminating) break;
                try {
                    const inspected = await this.api('inspect');
                    this.reconcile(inspected.state);
                } catch (error) { this.fail(error); break; }
                await pause(250);
            }
        }

        async command(type, rest = {}) {
            if (this.closed) throw new Error('LC0_ARENA_CLOSED');
            const from = this.eventSerial;
            const seq = this.seq + 1;
            await this.api('command', { body: { type, seq, ...rest } });
            this.seq = seq;
            await this.waitEvent(item => item.type === 'ACK' && item.command === type &&
                item.commandSeq === seq, from);
            return seq;
        }

        async phase(expected, timeoutMs = 30_000) {
            const began = performance.now();
            while (performance.now() - began < timeoutMs) {
                const state = (await this.api('inspect')).state;
                this.lastPhase = state.phase;
                if (state.phase === expected) return state;
                await pause(180);
            }
            throw new Error(`LC0_RELAY_PHASE_TIMEOUT_${expected}`);
        }

        async start() {
            try {
                this.status('Connecting…');
                await window.CAISSA_AUTH?.whenReady?.();
                if (!window.CAISSA_AUTH?.isSignedIn) throw new Error('CAISSA_SIGN_IN_REQUIRED');
                const created = await this.api('create', { sessionId: null,
                    body: { competitionId: `arena_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`,
                        participantRole: this.role } });
                this.sessionId = created.sessionId;
                if (this.closed) {
                    await this.api('terminate', { body: { reason: 'startup-cancelled' } });
                    throw new Error('LC0_ARENA_CLOSED');
                }
                this.status('Open the isolated Lc0 window to claim the session…');
                const popup = await this.coordinator.waitForPopup(this);
                if (this.closed) throw new Error('LC0_ARENA_CLOSED');
                const url = new URL('/experiments/lc0-preview-relay/engine/index.html',
                    this.coordinator.config.engineOrigin);
                url.hash = new URLSearchParams({ sessionId: this.sessionId,
                    claimToken: created.claimToken }).toString();
                this.status('Claiming isolated runtime…');
                popup.opener = null;
                popup.location.replace(url.href);
                // Isolation severs the window reference; no opener, message or cookie
                // is used after this one-way navigation.
                this.streamTask = this.consumeStream();
                await this.phase('CLAIMED', 28_000);
                this.status('Verifying Maia network and initializing Lc0…');
                const from = this.eventSerial;
                await this.command('HELLO');
                const ready = await this.waitEvent(item => item.type === 'READY', from, 40_000);
                if (!checkIdentity(ready.identity)) throw new Error('LC0_RUNTIME_IDENTITY_INVALID');
                this.identity = Object.freeze({ ...ready.identity });
                this.ready = true;
                this.metrics.selectionToReadyMs = performance.now() - this.createdAt;
                this.onLine?.('uciok');
                this.onLine?.('readyok');
                return this;
            } catch (error) {
                this.startFailed = true;
                throw error;
            }
        }

        async reuse(newGame = false) {
            if (!this.lastSearchId || this.lastPhase !== 'STOPPED') return;
            const previous = this.lastSearchId;
            const from = this.eventSerial;
            await this.command('RESET', { searchId: previous, ...(newGame ? { newGame: true } : {}) });
            await this.waitEvent(item => item.type === 'READY' && checkIdentity(item.identity), from);
            const gate = await this.api('advance', { body: { mode: 'reuse', searchId: previous } });
            if (!gate.advanceAllowed) throw new Error('LC0_REUSE_GATE_CLOSED');
            this.lastSearchId = null;
            this.lastPhase = 'READY';
        }

        async newGame() {
            if (this.active) await this.stop();
            await this.reuse(true);
            this.gameId = crypto.randomUUID();
            return true;
        }

        send(command) {
            if (command !== 'isready') throw new Error('LC0_ARBITRARY_UCI_FORBIDDEN');
            this.api('inspect').then(value => {
                if (!checkIdentity(value.state.identity) ||
                    value.state.identity.runtimeInstanceId !== this.identity?.runtimeInstanceId ||
                    !['READY', 'REUSE_READY'].includes(value.state.phase))
                    throw new Error('LC0_READY_STATE_INVALID');
                this.onLine?.('readyok');
            }).catch(error => this.fail(error));
        }

        getBestMove(fen, callback, options = {}) {
            if (!this.ready || this.closed) throw new Error('LC0_ARENA_NOT_READY');
            if (this.active || this.searchPromise) throw new Error('LC0_SEARCH_ALREADY_ACTIVE');
            if (typeof callback !== 'function') throw new Error('LC0_BESTMOVE_CALLBACK_REQUIRED');
            const searchId = `search_${crypto.randomUUID()}`;
            const operation = { searchId, gameId: this.gameId, fen, callback,
                started: false, stopRequested: false, bestmove: null, transportUncertain: false };
            this.active = operation;
            this.searchPromise = (async () => {
                await this.reuse();
                await this.command('POSITION', { fen, moves: [] });
                await this.command('GO', { searchId, mode: 'infinite' });
                if (this.metrics.firstSearchAfterMatchStartMs === null &&
                    this.coordinator.matchStartAt != null)
                    this.metrics.firstSearchAfterMatchStartMs = performance.now() -
                        this.coordinator.matchStartAt;
                operation.started = true;
                this.analyzing = true;
                if (!operation.stopRequested)
                    await Promise.race([pause(Math.max(250, Math.min(2_000, options.movetime || 1_200))),
                        new Promise(resolve => { operation.wakeStop = resolve; })]);
                await this.stop();
            })().catch(error => this.fail(error)).finally(() => { this.searchPromise = null; });
        }

        stop() {
            const operation = this.active;
            if (!operation) return Promise.resolve(true);
            operation.stopRequested = true;
            operation.wakeStop?.();
            if (this.stopPromise) return this.stopPromise;
            this.stopPromise = (async () => {
                const began = performance.now();
                while (!operation.started && this.active === operation && !this.closed) await pause(40);
                if (this.closed || this.active !== operation) throw new Error('LC0_STOP_LOST_OWNERSHIP');
                const from = this.eventSerial;
                await this.command('STOP', { searchId: operation.searchId });
                const stopped = await this.waitEvent(item => item.type === 'STOPPED' &&
                    item.searchId === operation.searchId, from, 8_000);
                if (!stopped || !legalMove(operation.fen, operation.bestmove))
                    throw new Error('LC0_BESTMOVE_ILLEGAL');
                this.metrics.stopMs.push(performance.now() - began);
                this.analyzing = false;
                this.lastSearchId = operation.searchId;
                this.lastPhase = 'STOPPED';
                this.active = null;
                if (operation.gameId === this.gameId && !this.closed)
                    operation.callback(operation.bestmove);
                return true;
            })().finally(() => { this.stopPromise = null; });
            return this.stopPromise;
        }

        isReady() { return this.ready && !this.closed; }

        getRuntimeIdentity() {
            return Object.freeze({ id: this.id, providerId: ID, requestedEngineId: ID,
                workerAsset: this.workerPath, status: this.ready && !this.closed ? 'ready' : 'terminated',
                identityValidated: this.ready && checkIdentity(this.identity),
                runtimeInstanceId: this.identity?.runtimeInstanceId || null,
                reportedUciName: this.identity?.uciName || null,
                reportedAuthor: this.identity?.uciAuthor || null,
                version: this.identity?.version || null,
                sourceCommit: this.identity?.sourceCommit || null,
                backend: this.identity?.backend || null,
                networkId: this.identity?.networkId || null,
                networkSha256: this.identity?.networkSha256 || null,
                manifestSha256: this.identity?.manifestSha256 || null });
        }

        async terminate(reason = 'arena-exit') {
            if (this.terminatePromise) return this.terminatePromise;
            this.terminatePromise = (async () => {
                const began = performance.now();
                if (this.coordinator.pendingPopup?.adapter === this) {
                    this.coordinator.pendingPopup.reject(new Error('LC0_ARENA_CLOSED'));
                    this.coordinator.pendingPopup = null;
                }
                if (!this.sessionId) { this.closed = true; return true; }
                if (this.startFailed && !this.ready) {
                    // A vanished window cannot produce local CLEANUP evidence.
                    // Fail closed and revoke the durable relay claim immediately;
                    // report the missing evidence instead of claiming success.
                    this.metrics.cleanupFailureClassification =
                        'STARTUP_ABORTED_NO_LOCAL_CLEANUP_EVIDENCE';
                    try {
                        await this.api('terminate', { body: { reason: 'startup-failed' } })
                            .catch(error => { if (error.status !== 410) throw error; });
                    } finally {
                        this.closed = true;
                        this.ready = false;
                        clearInterval(this.heartbeatTimer);
                        this.streamController?.abort();
                    }
                    throw new Error('LC0_CLEANUP_UNVERIFIED_STARTUP_ABORTED');
                }
                if (this.active) await this.stop();
                if (this.lastPhase === 'CLAIMED') {
                    // A claimed engine may still be validating assets. Never
                    // delete its relay session before cooperative cleanup.
                    await this.phase('READY', 45_000);
                }
                if (['STOPPED', 'READY', 'REUSE_READY'].includes(this.lastPhase)) {
                    const from = this.eventSerial;
                    await this.command('QUIT');
                    let cleanup;
                    try {
                        cleanup = await this.waitEvent(item => item.type === 'CLEANUP', from, 15_000);
                    } catch (error) {
                        const durable = await this.api('inspect').catch(() => null);
                        this.metrics.cleanupFailureClassification = durable?.state?.phase === 'CLEANED'
                            ? 'DURABLE_CLEANED_BUT_TAIL_EVENT_MISSING'
                            : durable?.state?.phase === 'QUIT_ACKED'
                                ? 'LOCAL_CLEANUP_NOT_ACKNOWLEDGED'
                                : durable ? `DURABLE_PHASE_${durable.state.phase}` : 'DURABLE_STATE_UNAVAILABLE';
                        throw new Error(`LC0_CLEANUP_UNVERIFIED_${this.metrics.cleanupFailureClassification}`);
                    }
                    const evidence = cleanup.evidence;
                    this.metrics.cleanupEvidence = evidence;
                    if (evidence?.parentWorkers !== 0 || evidence?.pthreadWorkers !== 0 ||
                        evidence?.runtimeState !== 'TERMINATED' || evidence?.forcedTerminations !== 0 ||
                        evidence?.cleanupAcknowledged !== true)
                        throw new Error('LC0_CLEANUP_EVIDENCE_INVALID');
                    const state = (await this.api('inspect')).state;
                    if (state.completedSearchId) {
                        const gate = await this.api('advance', { body: { mode: 'release',
                            searchId: state.completedSearchId } });
                        if (!gate.advanceAllowed) throw new Error('LC0_RELEASE_GATE_CLOSED');
                    }
                }
                await this.api('terminate', { body: { reason } });
                this.metrics.cleanupMs = performance.now() - began;
                this.terminating = true;
                this.closed = true;
                this.ready = false;
                clearInterval(this.heartbeatTimer);
                this.streamController?.abort();
                this.status('Lc0 cleaned');
                return true;
            })();
            return this.terminatePromise;
        }

        fail(error) {
            if (this.closed || this.terminating) return;
            this.ready = false;
            this.closed = true;
            this.status(`Lc0 unavailable: ${error.message}`);
            window.EngineRegistry?.markArenaProviderUnavailable?.(ID, error.message);
            this.onError?.(error);
            this.onRuntimeUnavailable?.(error);
            for (const waiter of this.waiters.splice(0)) {
                clearTimeout(waiter.timer);
                waiter.reject(error);
            }
            clearInterval(this.heartbeatTimer);
            this.streamController?.abort();
            if (this.sessionId) this.api('terminate', { body: {} }).catch(() => {});
        }
    }

    window.IsolatedBrowserRuntimeAdapter = IsolatedBrowserRuntimeAdapter;
    window.Eae013Identity = EXPECTED;
})();
