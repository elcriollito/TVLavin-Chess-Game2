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
    const TRANSPORT_RECONNECT_MS = 20_000;
    const TRANSPORT_RETRY_MAX_MS = 2_000;
    const COMMAND_ACK_TIMEOUT_MS = TRANSPORT_RECONNECT_MS + 2_000;

    function checkIdentity(value, manifestSha256 = EXPECTED.manifestSha256) {
        return !!value && Object.entries(EXPECTED).every(([key, expected]) =>
            key === 'manifestSha256' || value[key] === expected)
            && value.manifestSha256 === manifestSha256
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
            this.competitionId = null;
            this.transportState = 'CONNECTING';
            this.transportTrace = [];
            this.lifecycleTrace = [];
            this.lastRequest = null;
            this.searchPromise = null;
            this.stopPromise = null;
            this.terminatePromise = null;
            this.createdAt = performance.now();
            this.metrics = { selectionToReadyMs: null, stopMs: [], cleanupMs: null,
                firstSearchAfterMatchStartMs: null, infoReceived: 0, infoPresented: 0,
                cleanupFailureClassification: null, cleanupEvidence: null,
                transportSuspended: 0, reconnectSuccess: 0, reconnectFailure: 0,
                durableEventRecoveries: {},
                localCleanupObserved: false, brokerCleanupAcknowledged: false,
                brokerCleanupAckMissing: 0, forcedTerminations: 0 };
            if (!this.role) throw new Error('LC0_ARENA_ROLE_INVALID');
            coordinator.adapter = this;
        }

        status(value) { this.coordinator.status(value); }

        recordTransport(event, detail = {}) {
            const entry = Object.freeze({ at: Date.now(), event,
                online: typeof navigator === 'undefined' || navigator.onLine !== false,
                visibility: typeof document === 'undefined'
                    ? 'unknown' : document.visibilityState || 'unknown', ...detail });
            this.transportTrace.push(entry);
            if (this.transportTrace.length > 120) this.transportTrace.splice(0, 40);
            return entry;
        }

        recordLifecycle(event, detail = {}) {
            const entry = Object.freeze({ at: Date.now(), event, role: this.role,
                competitionId: this.competitionId, gameId: this.gameId,
                runtimeInstanceId: this.identity?.runtimeInstanceId || null,
                searchId: this.active?.searchId || this.lastSearchId || null,
                relayState: this.lastPhase, transportState: this.transportState,
                lastCommandSeq: this.seq, ...detail });
            this.lifecycleTrace.push(entry);
            if (this.lifecycleTrace.length > 240) this.lifecycleTrace.splice(0, 80);
            return entry;
        }

        async api(action, { body, sessionId = this.sessionId, cursor, signal } = {}) {
            const token = await window.CAISSA_AUTH?.getToken?.();
            if (!token) throw new Error('CAISSA_SIGN_IN_REQUIRED');
            const url = new URL('/api/eae011', this.coordinator.config.relayOrigin || location.origin);
            url.searchParams.set('action', action);
            if (sessionId) url.searchParams.set('sessionId', sessionId);
            if (cursor != null) url.searchParams.set('cursor', String(cursor));
            const request = { action, method: body ? 'POST' : 'GET', direction: 'main-to-relay',
                startedAt: Date.now(), correlationId: null, status: null, error: null };
            this.lastRequest = request;
            let response;
            try {
                response = await fetch(url, { method: body ? 'POST' : 'GET',
                    headers: { Authorization: `Bearer ${token}`,
                        ...(body ? { 'Content-Type': 'application/json' } : {}) },
                    ...(body ? { body: JSON.stringify(body) } : {}),
                    ...(signal ? { signal } : {}) });
                request.status = response.status;
                request.correlationId = response.headers.get('x-vercel-id') ||
                    response.headers.get('x-request-id');
            } catch (error) {
                request.error = error?.message || String(error);
                request.errorName = error?.name || 'Error';
                request.errorCode = error?.code || null;
                this.recordTransport('REQUEST_FAILED', { ...request });
                throw error;
            }
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

        identityValid(value) {
            return checkIdentity(value, this.coordinator.config?.manifestSha256);
        }

        dispatch(value) {
            value._localSeq = ++this.eventSerial;
            this.events.push(value);
            if (this.events.length > 160) this.events.splice(0, this.events.length - 120);
            if (value.type === 'READY') {
                if (!this.identityValid(value.identity) ||
                    (this.identity && this.identity.runtimeInstanceId !== value.identity.runtimeInstanceId))
                    return this.fail(new Error('LC0_RUNTIME_IDENTITY_INVALID'));
                this.identity = Object.freeze({ ...value.identity });
                this.ready = true;
                this.lastPhase = 'READY';
                this.status('Ready — verified Lc0 / Maia 1100');
            } else if (value.type === 'INFO' && this.active?.searchId === value.searchId) {
                this.metrics.infoReceived += 1;
                if (!this.active.infoSeen) {
                    this.active.infoSeen = true;
                    this.recordLifecycle('INFO_RECEIVED', { searchId: value.searchId });
                }
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
                this.recordLifecycle('BESTMOVE_RECEIVED', {
                    searchId: value.searchId, move: value.move
                });
            } else if (value.type === 'STOPPED' && this.active?.searchId === value.searchId) {
                this.lastPhase = 'STOPPED';
                this.recordLifecycle('STOPPED', { searchId: value.searchId });
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
            if (!this.identityValid(state.identity) ||
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

        async waitEventOrDurable(predicate, durable, from = this.eventSerial,
            timeoutMs = 12_000, eventType = 'UNKNOWN') {
            const deadline = performance.now() + timeoutMs;
            let lastInspectError = null;
            while (!this.closed && performance.now() < deadline) {
                const found = this.events.find(item => item._localSeq > from && predicate(item));
                if (found) return found;
                try {
                    const state = (await this.api('inspect')).state;
                    const recovered = durable?.(state);
                    if (recovered) {
                        this.metrics.durableEventRecoveries[eventType] =
                            (this.metrics.durableEventRecoveries[eventType] || 0) + 1;
                        this.recordTransport('DURABLE_EVENT_RECOVERED', { eventType,
                            relayPhase: state.phase, lastAck: state.lastAck || null });
                        return recovered;
                    }
                    lastInspectError = null;
                } catch (error) {
                    if (error.status === 410) throw error;
                    lastInspectError = error;
                }
                await pause(500);
            }
            const error = new Error('LC0_RELAY_EVENT_TIMEOUT');
            if (lastInspectError) error.cause = lastInspectError;
            throw error;
        }

        setTransportState(state, detail = {}) {
            if (state === this.transportState && state !== 'TRANSPORT_SUSPENDED') return;
            this.transportState = state;
            this.recordTransport(state, detail);
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
                    const recovered = this.transportState === 'TRANSPORT_SUSPENDED';
                    this.setTransportState('CONNECTED', { action: 'stream_main' });
                    if (recovered) this.metrics.reconnectSuccess += 1;
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
                                }, 5_000);
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
                    if (error.name !== 'AbortError') {
                        this.status(`Relay reconnecting: ${error.message}`);
                        this.recordTransport('STREAM_FAILED', {
                            errorName: error.name, errorCode: error.code || null,
                            error: error.message, action: 'stream_main'
                        });
                    }
                } finally { clearInterval(this.heartbeatTimer); }
                if (this.closed || this.terminating) break;
                this.metrics.transportSuspended += 1;
                this.setTransportState('TRANSPORT_SUSPENDED', {
                    action: this.lastRequest?.action || 'stream_main',
                    errorName: this.lastRequest?.errorName || null,
                    errorCode: this.lastRequest?.errorCode || null,
                    error: this.lastRequest?.error || null
                });
                const deadline = performance.now() + TRANSPORT_RECONNECT_MS;
                let retryMs = 250;
                let reconciled = false;
                let lastError = null;
                while (!this.closed && !this.terminating && performance.now() < deadline) {
                    try {
                        const inspected = await this.api('inspect');
                        this.reconcile(inspected.state);
                        reconciled = true;
                        break;
                    } catch (error) {
                        lastError = error;
                        if (error.status === 410) break;
                        await pause(retryMs);
                        retryMs = Math.min(TRANSPORT_RETRY_MAX_MS, retryMs * 2);
                    }
                }
                if (!reconciled) {
                    this.metrics.reconnectFailure += 1;
                    const failure = new Error(lastError?.status === 410
                        ? lastError.message : 'LC0_TRANSPORT_RECONNECT_EXHAUSTED');
                    failure.code = lastError?.status === 410
                        ? 'LC0_TRANSPORT_LEASE_EXPIRED' : 'LC0_TRANSPORT_RECONNECT_EXHAUSTED';
                    this.setTransportState('TRANSPORT_FAILED', {
                        errorName: lastError?.name || null, errorCode: failure.code,
                        error: lastError?.message || failure.message
                    });
                    this.fail(failure);
                    break;
                }
                await pause(250);
            }
        }

        async command(type, rest = {}) {
            if (this.closed) throw new Error('LC0_ARENA_CLOSED');
            if (this.transportState === 'TRANSPORT_SUSPENDED' &&
                !['STOP', 'QUIT'].includes(type))
                await this.waitForTransportConnected();
            const from = this.eventSerial;
            const seq = this.seq + 1;
            this.recordLifecycle('COMMAND_REQUESTED', { command: type, commandSeq: seq,
                searchId: rest.searchId || this.active?.searchId || null });
            const body = { type, seq, ...rest };
            try {
                await this.api('command', { body });
            } catch (error) {
                await this.reconcileCommandDelivery(body, error);
            }
            this.seq = seq;
            await this.waitEventOrDurable(item => item.type === 'ACK' && item.command === type &&
                item.commandSeq === seq, state => state.lastAck?.command === type &&
                state.lastAck?.seq === seq ? { type: 'ACK', command: type,
                    commandSeq: seq, searchId: state.lastAck.searchId || null } : null,
            from, COMMAND_ACK_TIMEOUT_MS, `ACK_${type}`);
            this.recordLifecycle('COMMAND_ACKNOWLEDGED', { command: type, commandSeq: seq,
                searchId: rest.searchId || this.active?.searchId || null });
            return seq;
        }

        async reconcileCommandDelivery(command, initialError) {
            this.metrics.transportSuspended += 1;
            this.setTransportState('TRANSPORT_SUSPENDED', { action: 'command',
                command: command.type, commandSeq: command.seq,
                errorName: initialError?.name || null, errorCode: initialError?.code || null,
                error: initialError?.message || String(initialError) });
            const deadline = performance.now() + TRANSPORT_RECONNECT_MS;
            let retryMs = 250;
            let retryAllowed = true;
            let lastError = initialError;
            while (!this.closed && performance.now() < deadline) {
                try {
                    const state = (await this.api('inspect')).state;
                    if (state.lastCommandSeq === command.seq) {
                        this.metrics.reconnectSuccess += 1;
                        this.setTransportState('CONNECTED', { action: 'command-reconcile',
                            command: command.type, commandSeq: command.seq, accepted: true });
                        return true;
                    }
                    if (state.lastCommandSeq > command.seq)
                        throw new Error('LC0_COMMAND_RECONCILE_SEQUENCE_ADVANCED');
                    if (state.lastCommandSeq === command.seq - 1 && !state.pending && retryAllowed) {
                        retryAllowed = false;
                        try {
                            await this.api('command', { body: command });
                            this.metrics.reconnectSuccess += 1;
                            this.setTransportState('CONNECTED', { action: 'command-reconcile',
                                command: command.type, commandSeq: command.seq,
                                accepted: true, retried: true });
                            return true;
                        } catch (error) {
                            // A lost first response can race this retry. Inspect again;
                            // the durable sequence decides whether either request committed.
                            lastError = error;
                        }
                    }
                } catch (error) {
                    if (error.status === 410) throw error;
                    if (error.message === 'LC0_COMMAND_RECONCILE_SEQUENCE_ADVANCED') throw error;
                    lastError = error;
                }
                await pause(retryMs);
                retryMs = Math.min(TRANSPORT_RETRY_MAX_MS, retryMs * 2);
            }
            this.metrics.reconnectFailure += 1;
            const failure = new Error('LC0_TRANSPORT_RECONNECT_EXHAUSTED');
            failure.code = 'LC0_TRANSPORT_RECONNECT_EXHAUSTED';
            failure.cause = lastError;
            this.setTransportState('TRANSPORT_FAILED', { action: 'command-reconcile',
                command: command.type, commandSeq: command.seq,
                errorName: lastError?.name || null, errorCode: failure.code,
                error: lastError?.message || failure.message });
            throw failure;
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

        async waitForTransportConnected(timeoutMs = TRANSPORT_RECONNECT_MS) {
            const deadline = performance.now() + timeoutMs;
            while (!this.closed && performance.now() < deadline) {
                if (this.transportState === 'CONNECTED') return true;
                if (this.transportState === 'TRANSPORT_FAILED')
                    throw new Error('LC0_TRANSPORT_RECONNECT_EXHAUSTED');
                await pause(50);
            }
            throw new Error(this.closed ? 'LC0_ARENA_CLOSED' :
                'LC0_TRANSPORT_RECONNECT_EXHAUSTED');
        }

        async start() {
            try {
                this.status('Connecting…');
                await window.CAISSA_AUTH?.whenReady?.();
                if (!window.CAISSA_AUTH?.isSignedIn) throw new Error('CAISSA_SIGN_IN_REQUIRED');
                this.competitionId = `arena_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
                const created = await this.api('create', { sessionId: null,
                    body: { competitionId: this.competitionId,
                        participantRole: this.role } });
                this.sessionId = created.sessionId;
                if (this.closed) {
                    await this.api('terminate', { body: { reason: 'startup-cancelled' } });
                    throw new Error('LC0_ARENA_CLOSED');
                }
                this.status('Open the isolated Lc0 window to claim the session…');
                const popup = await this.coordinator.waitForPopup(this);
                if (this.closed) throw new Error('LC0_ARENA_CLOSED');
                const url = new URL(this.coordinator.config.enginePath ||
                    '/experiments/lc0-preview-relay/engine/index.html',
                this.coordinator.config.engineOrigin);
                url.hash = new URLSearchParams({ sessionId: this.sessionId,
                    claimToken: created.claimToken,
                    relayOrigin: this.coordinator.config.relayOrigin,
                    mainOrigin: location.origin }).toString();
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
                const ready = await this.waitEventOrDurable(item => item.type === 'READY',
                    state => state.phase === 'READY' && this.identityValid(state.identity)
                        ? { type: 'READY', identity: state.identity } : null,
                    from, 75_000, 'READY');
                if (!this.identityValid(ready.identity)) throw new Error('LC0_RUNTIME_IDENTITY_INVALID');
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
            await this.waitEventOrDurable(item => item.type === 'READY' &&
                this.identityValid(item.identity), state => state.phase === 'REUSE_READY' &&
                state.reuseReadyFor === previous && this.identityValid(state.identity)
                ? { type: 'READY', identity: state.identity } : null,
            from, 12_000, 'REUSE_READY');
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
                if (!this.identityValid(value.state.identity) ||
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
                started: false, stopRequested: false, bestmove: null, transportUncertain: false,
                infoSeen: false };
            this.active = operation;
            this.recordLifecycle('SEARCH_ALLOCATED', { searchId, fen });
            this.searchPromise = (async () => {
                await this.waitForTransportConnected();
                await this.reuse();
                await this.command('POSITION', { fen, moves: [] });
                this.recordLifecycle('POSITION_SENT', { searchId, fen });
                await this.command('GO', { searchId, mode: 'infinite' });
                if (this.metrics.firstSearchAfterMatchStartMs === null &&
                    this.coordinator.matchStartAt != null)
                    this.metrics.firstSearchAfterMatchStartMs = performance.now() -
                        this.coordinator.matchStartAt;
                operation.started = true;
                this.analyzing = true;
                this.recordLifecycle('SEARCH_STARTED', { searchId });
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
            this.recordLifecycle('STOP_REQUESTED', { searchId: operation.searchId });
            operation.wakeStop?.();
            if (this.stopPromise) return this.stopPromise;
            this.stopPromise = (async () => {
                const began = performance.now();
                while (!operation.started && this.active === operation && !this.closed) await pause(40);
                if (this.closed || this.active !== operation) throw new Error('LC0_STOP_LOST_OWNERSHIP');
                const from = this.eventSerial;
                await this.command('STOP', { searchId: operation.searchId });
                const stopped = await this.waitEventOrDurable(item => item.type === 'STOPPED' &&
                    item.searchId === operation.searchId, state => state.phase === 'STOPPED' &&
                    state.completedSearchId === operation.searchId && state.stopped === true &&
                    typeof state.bestmove === 'string' ? { type: 'STOPPED',
                        searchId: operation.searchId, move: state.bestmove } : null,
                from, 8_000, 'STOPPED');
                operation.bestmove ||= stopped.move || null;
                if (!stopped || !legalMove(operation.fen, operation.bestmove))
                    throw new Error('LC0_BESTMOVE_ILLEGAL');
                this.metrics.stopMs.push(performance.now() - began);
                this.analyzing = false;
                this.lastSearchId = operation.searchId;
                this.lastPhase = 'STOPPED';
                this.active = null;
                this.recordLifecycle('STOP_COMPLETE', { searchId: operation.searchId,
                    bestmove: operation.bestmove });
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
                identityValidated: this.ready && this.identityValid(this.identity),
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
                if (this.transportState === 'TRANSPORT_FAILED') {
                    // The isolated engine page owns the local failsafe. Main-side
                    // relay loss cannot truthfully claim broker CLEANUP.
                    this.metrics.cleanupFailureClassification =
                        'LOCAL_CLEANUP_DELEGATED_BROKER_ACK_MISSING';
                    this.metrics.brokerCleanupAckMissing += 1;
                    this.terminating = true;
                    this.closed = true;
                    this.ready = false;
                    clearInterval(this.heartbeatTimer);
                    this.streamController?.abort();
                    return true;
                }
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
                        cleanup = await this.waitEventOrDurable(item => item.type === 'CLEANUP',
                            state => state.phase === 'CLEANED' && state.cleanupEvidence
                                ? { type: 'CLEANUP', evidence: state.cleanupEvidence } : null,
                            from, 15_000, 'CLEANUP');
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
                    this.metrics.localCleanupObserved = true;
                    this.metrics.brokerCleanupAcknowledged = true;
                    this.metrics.forcedTerminations += evidence.forcedTerminations;
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
            // On transport exhaustion the broker lease is authoritative and the
            // isolated page performs local cleanup. Deleting the row here would
            // fabricate neither a CLEANUP acknowledgement nor its evidence.
            if (this.sessionId && !String(error?.code || '').startsWith('LC0_TRANSPORT_'))
                this.api('terminate', { body: { reason: 'adapter-failure' } }).catch(() => {});
        }
    }

    window.IsolatedBrowserRuntimeAdapter = IsolatedBrowserRuntimeAdapter;
    window.Eae013Identity = EXPECTED;
})();
