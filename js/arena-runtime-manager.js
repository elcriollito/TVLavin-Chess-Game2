/*
 * ArenaRuntimeManager - explicit ownership and lifecycle for Arena workers.
 */

(function () {
    const ROLES = Object.freeze(['white', 'black', 'evaluator']);
    const STATES = Object.freeze({
        CREATED: 'CREATED',
        INITIALIZING: 'INITIALIZING',
        READY: 'READY',
        THINKING: 'THINKING',
        STOPPING: 'STOPPING',
        IDLE: 'IDLE',
        FAILED: 'FAILED',
        TERMINATED: 'TERMINATED'
    });
    const TRANSITIONS = Object.freeze({
        [STATES.CREATED]: new Set([STATES.INITIALIZING, STATES.FAILED, STATES.TERMINATED]),
        [STATES.INITIALIZING]: new Set([STATES.READY, STATES.FAILED, STATES.TERMINATED]),
        [STATES.READY]: new Set([
            STATES.INITIALIZING, STATES.THINKING, STATES.STOPPING, STATES.IDLE,
            STATES.FAILED, STATES.TERMINATED
        ]),
        [STATES.THINKING]: new Set([
            STATES.READY, STATES.STOPPING, STATES.IDLE, STATES.FAILED, STATES.TERMINATED
        ]),
        [STATES.STOPPING]: new Set([STATES.IDLE, STATES.FAILED, STATES.TERMINATED]),
        [STATES.IDLE]: new Set([
            STATES.INITIALIZING, STATES.READY, STATES.THINKING, STATES.STOPPING,
            STATES.FAILED, STATES.TERMINATED
        ]),
        [STATES.FAILED]: new Set([STATES.TERMINATED]),
        [STATES.TERMINATED]: new Set()
    });

    function lifecycleError(code, message) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    class ArenaRuntimeManager {
        constructor(options = {}) {
            this.registry = options.registry || window.EngineRegistry;
            if (!this.registry || typeof this.registry.createArenaEngine !== 'function') {
                throw lifecycleError('ARENA_RUNTIME_REGISTRY_MISSING',
                    'Arena runtime manager requires the engine provider registry.');
            }
            this.now = typeof options.now === 'function' ? options.now : () => performance.now();
            this.onFailure = typeof options.onFailure === 'function' ? options.onFailure : null;
            this.records = new Map();
            this.roleGenerations = new Map(ROLES.map(role => [role, 0]));
            this.failureByGeneration = new Map();
            this.lastFailures = new Map();
            this.timingHistory = [];
            this.terminationHistory = [];
            this.diagnostics = {
                acquisitions: 0,
                reuses: 0,
                replacements: 0,
                stops: 0,
                terminations: 0,
                failures: 0,
                staleAcquisitions: 0,
                peakActiveWorkers: 0
            };
        }

        assertRole(role) {
            if (!ROLES.includes(role)) {
                throw lifecycleError('ARENA_RUNTIME_ROLE_INVALID', `Unknown Arena runtime role: ${role}`);
            }
        }

        transition(record, nextState) {
            if (!record || record.state === nextState) return;
            if (!TRANSITIONS[record.state]?.has(nextState)) {
                throw lifecycleError('ARENA_RUNTIME_TRANSITION_INVALID',
                    `${record.role} cannot transition from ${record.state} to ${nextState}`);
            }
            record.state = nextState;
            record.updatedAt = this.now();
        }

        nextGeneration(role) {
            const generation = (this.roleGenerations.get(role) || 0) + 1;
            this.roleGenerations.set(role, generation);
            return generation;
        }

        isCurrent(record) {
            return !!record
                && this.records.get(record.role) === record
                && this.roleGenerations.get(record.role) === record.generation;
        }

        identityMatches(record) {
            const identity = record?.instance?.getRuntimeIdentity?.();
            return !!identity
                && identity.providerId === record.providerId
                && identity.requestedEngineId === record.providerId
                && identity.workerAsset === record.provider.workerPath
                && identity.identityValidated === true
                && identity.status === 'ready';
        }

        bindImmutableIdentity(instance, providerId) {
            for (const property of ['providerId', 'requestedEngineId']) {
                if (instance[property] !== providerId) {
                    throw lifecycleError('ARENA_RUNTIME_IDENTITY_INVALID',
                        `${property} does not match requested provider ${providerId}`);
                }
                Object.defineProperty(instance, property, {
                    value: providerId,
                    enumerable: true,
                    writable: false,
                    configurable: false
                });
            }
        }

        recordTiming(record) {
            const timing = Object.freeze({
                role: record.role,
                providerId: record.providerId,
                runtimeInstanceId: record.runtimeInstanceId,
                createToUciOkMs: record.uciOkAt == null ? null : record.uciOkAt - record.createdAt,
                uciOkToReadyOkMs: record.uciOkAt == null || record.readyOkAt == null
                    ? null : record.readyOkAt - record.uciOkAt,
                acquireMs: record.readyOkAt == null ? record.updatedAt - record.createdAt
                    : record.readyOkAt - record.createdAt
            });
            this.timingHistory.push(timing);
            if (this.timingHistory.length > 50) this.timingHistory.shift();
        }

        recordTermination(record, reason, startedAt, runtimeInstanceId = null) {
            const endedAt = this.now();
            this.terminationHistory.push(Object.freeze({
                role: record.role,
                providerId: record.providerId,
                runtimeInstanceId: runtimeInstanceId || record.runtimeInstanceId || null,
                reason,
                terminationMs: endedAt - startedAt,
                lifetimeMs: endedAt - record.createdAt
            }));
            if (this.terminationHistory.length > 50) this.terminationHistory.shift();
        }

        handleFailure(record, failure) {
            if (!record || !this.isCurrent(record)) return;
            if (record.state === STATES.FAILED && record.instance?.asyncLifecycle) return;
            const identity = record.instance?.getRuntimeIdentity?.() || null;
            if (record.state !== STATES.FAILED && record.state !== STATES.TERMINATED) {
                this.transition(record, STATES.FAILED);
            }
            const diagnostic = Object.freeze({
                role: record.role,
                providerId: record.providerId,
                generation: record.generation,
                runtimeInstanceId: identity?.runtimeInstanceId || record.runtimeInstanceId || null,
                code: failure?.code || 'ENGINE_UNAVAILABLE',
                message: failure?.message || 'Engine unavailable',
                at: this.now()
            });
            if (record.acquirePromise) {
                this.failureByGeneration.set(`${record.role}:${record.generation}`, diagnostic);
            }
            this.lastFailures.set(record.role, diagnostic);
            this.diagnostics.failures += 1;
            if (record.instance?.asyncLifecycle) {
                this.onFailure?.(diagnostic);
                // A relay-backed role remains owned until its cleanup or expiry is
                // observed. Do not publish a synthetic TERMINATED state here.
                this.terminate(record.role, 'arena-runtime-failure').catch(() => {});
                return;
            }
            const terminationStartedAt = this.now();
            record.instance?.terminate?.('arena-runtime-failure');
            this.recordTermination(record, 'arena-runtime-failure', terminationStartedAt,
                diagnostic.runtimeInstanceId);
            this.diagnostics.terminations += 1;
            this.records.delete(record.role);
            this.nextGeneration(record.role);
            this.onFailure?.(diagnostic);
        }

        async acquire(role, providerId) {
            this.assertRole(role);
            const provider = this.registry.getArenaProvider?.(providerId);
            if (!provider || provider.enabled === false || !provider.workerPath) {
                throw lifecycleError('ARENA_RUNTIME_PROVIDER_INVALID',
                    `Arena provider is unavailable or malformed: ${providerId}`);
            }

            const current = this.records.get(role);
            if (current?.providerId === providerId) {
                if (current.acquirePromise) {
                    this.diagnostics.reuses += 1;
                    return current.acquirePromise;
                }
                if (current.instance?.isReady?.() && this.identityMatches(current)) {
                    this.diagnostics.reuses += 1;
                    if (current.state === STATES.IDLE) this.transition(current, STATES.READY);
                    return current.instance;
                }
            }

            if (current) {
                this.diagnostics.replacements += 1;
                const ended = this.terminate(role, 'provider-replaced');
                if (ended && typeof ended.then === 'function') await ended;
            }

            const generation = this.nextGeneration(role);
            const createdAt = this.now();
            let record = null;
            const instance = this.registry.createArenaEngine(providerId, {
                autoStart: false,
                owner: `arena:${role}`,
                onRuntimeUnavailable: failure => this.handleFailure(record, failure)
            });
            if (!instance) {
                throw lifecycleError('ARENA_RUNTIME_CONSTRUCTION_FAILED',
                    `Arena provider could not create a runtime: ${providerId}`);
            }
            this.bindImmutableIdentity(instance, providerId);
            record = {
                role,
                providerId,
                provider,
                instance,
                generation,
                state: STATES.CREATED,
                createdAt,
                updatedAt: createdAt,
                uciOkAt: null,
                readyOkAt: null,
                runtimeInstanceId: null,
                acquirePromise: null
            };
            instance.onLine = line => {
                const value = String(line || '').trim();
                if (value === 'uciok' && record.uciOkAt == null) record.uciOkAt = this.now();
                if (value === 'readyok' && record.readyOkAt == null) record.readyOkAt = this.now();
            };
            this.records.set(role, record);
            this.transition(record, STATES.INITIALIZING);
            this.diagnostics.acquisitions += 1;
            this.diagnostics.peakActiveWorkers = Math.max(
                this.diagnostics.peakActiveWorkers,
                this.records.size
            );

            record.acquirePromise = (async () => {
                try {
                    await instance.start();
                    if (!this.isCurrent(record)) {
                        this.diagnostics.staleAcquisitions += 1;
                        instance.terminate?.('stale-acquire-completed');
                        return null;
                    }
                    if (!this.identityMatches(record)) {
                        throw lifecycleError('ARENA_RUNTIME_IDENTITY_INVALID',
                            `Runtime identity does not match ${providerId}`);
                    }
                    record.runtimeInstanceId = instance.getRuntimeIdentity().runtimeInstanceId;
                    this.transition(record, STATES.READY);
                    this.recordTiming(record);
                    return instance;
                } catch (error) {
                    const recordedFailure = this.lastFailures.get(role);
                    const failure = this.failureByGeneration.get(`${role}:${generation}`)
                        || (recordedFailure?.generation === generation ? recordedFailure : null);
                    this.failureByGeneration.delete(`${role}:${generation}`);
                    if (!this.isCurrent(record)) {
                        if (failure) throw Object.assign(new Error(failure.message), { code: failure.code });
                        this.diagnostics.staleAcquisitions += 1;
                        return null;
                    }
                    this.handleFailure(record, error);
                    throw error;
                } finally {
                    if (this.isCurrent(record)) record.acquirePromise = null;
                }
            })();
            return record.acquirePromise;
        }

        replace(role, providerId) {
            return this.acquire(role, providerId);
        }

        release(role, reason = 'role-released') {
            return this.terminate(role, reason);
        }

        stop(role, expectedInstance = null) {
            this.assertRole(role);
            const record = this.records.get(role);
            if (!record) return false;
            if (expectedInstance && record.instance !== expectedInstance) return false;
            if ([STATES.CREATED, STATES.INITIALIZING].includes(record.state)) {
                const pending = record.instance.stop?.();
                this.diagnostics.stops += 1;
                return record.instance.asyncLifecycle ? Promise.resolve(pending).then(() => true) : true;
            }
            if (![STATES.FAILED, STATES.TERMINATED].includes(record.state)) {
                this.transition(record, STATES.STOPPING);
                if (record.instance.asyncLifecycle) {
                    if (record.stopPromise) return record.stopPromise;
                    record.stopPromise = Promise.resolve().then(() => record.instance.stop?.())
                        .then(() => {
                            if (this.isCurrent(record) && record.state === STATES.STOPPING)
                                this.transition(record, STATES.IDLE);
                            return true;
                        }).catch(error => {
                            this.handleFailure(record, error);
                            throw error;
                        }).finally(() => { record.stopPromise = null; });
                    this.diagnostics.stops += 1;
                    return record.stopPromise;
                }
                record.instance.stop?.();
                this.transition(record, STATES.IDLE);
                this.diagnostics.stops += 1;
            }
            return true;
        }

        stopAll() {
            const results = ROLES.map(role => this.stop(role));
            return results.some(result => result && typeof result.then === 'function')
                ? Promise.all(results) : undefined;
        }

        terminate(role, reason = 'role-terminated') {
            this.assertRole(role);
            const record = this.records.get(role);
            if (!record) {
                this.nextGeneration(role);
                return false;
            }
            if (record.instance.asyncLifecycle) {
                if (record.terminationPromise) return record.terminationPromise;
                const terminationStartedAt = this.now();
                record.terminationPromise = Promise.resolve().then(() => record.instance.terminate?.(reason))
                    .then(() => {
                        if (this.isCurrent(record)) {
                            this.transition(record, STATES.TERMINATED);
                            this.records.delete(role);
                            this.nextGeneration(role);
                        }
                        this.recordTermination(record, reason, terminationStartedAt);
                        this.diagnostics.terminations += 1;
                        return true;
                    }).catch(error => {
                        if (this.isCurrent(record)) {
                            if (record.state !== STATES.FAILED) this.transition(record, STATES.FAILED);
                            this.records.delete(role);
                            this.nextGeneration(role);
                        }
                        this.lastFailures.set(role, Object.freeze({ role, providerId: record.providerId,
                            generation: record.generation, code: error.code || 'CLEANUP_UNVERIFIED',
                            message: error.message, at: this.now() }));
                        throw error;
                    });
                return record.terminationPromise;
            }
            if (record.state !== STATES.TERMINATED) {
                if (record.state === STATES.FAILED) this.transition(record, STATES.TERMINATED);
                else this.transition(record, STATES.TERMINATED);
            }
            this.records.delete(role);
            this.nextGeneration(role);
            const terminationStartedAt = this.now();
            record.instance.terminate?.(reason);
            this.recordTermination(record, reason, terminationStartedAt);
            record.acquirePromise = null;
            this.diagnostics.terminations += 1;
            return true;
        }

        terminateAll(reason = 'arena-terminated') {
            const results = ROLES.map(role => this.terminate(role, reason));
            return results.some(result => result && typeof result.then === 'function')
                ? Promise.all(results) : undefined;
        }

        newGame(role) {
            this.assertRole(role);
            const record = this.records.get(role);
            if (!record?.instance?.isReady?.()) return false;
            if (record.instance.asyncLifecycle) {
                return (async () => {
                    if ([STATES.THINKING, STATES.READY, STATES.STOPPING].includes(record.state))
                        await this.stop(role);
                    if (!this.isCurrent(record)) throw new Error('Arena runtime changed during new game');
                    this.transition(record, STATES.INITIALIZING);
                    await record.instance.newGame?.();
                    if (!this.markReady(role)) throw new Error('Arena runtime did not become ready');
                    return true;
                })().catch(error => {
                    this.handleFailure(record, error);
                    throw error;
                });
            }
            if ([STATES.THINKING, STATES.READY].includes(record.state)) this.stop(role);
            this.transition(record, STATES.INITIALIZING);
            record.instance.newGame?.();
            return true;
        }

        markReady(role) {
            this.assertRole(role);
            const record = this.records.get(role);
            if (!record) return false;
            if (record.instance?.isReady?.() && this.identityMatches(record)) {
                this.transition(record, STATES.READY);
                return true;
            }
            return false;
        }

        markThinking(role, expectedInstance = null) {
            this.assertRole(role);
            const record = this.records.get(role);
            if (!record || !record.instance?.isReady?.()) return false;
            if (expectedInstance && record.instance !== expectedInstance) return false;
            if (record.state === STATES.INITIALIZING) this.transition(record, STATES.READY);
            this.transition(record, STATES.THINKING);
            return true;
        }

        markIdle(role, expectedInstance = null) {
            this.assertRole(role);
            const record = this.records.get(role);
            if (!record || [STATES.FAILED, STATES.TERMINATED].includes(record.state)) return false;
            if (expectedInstance && record.instance !== expectedInstance) return false;
            if (record.state !== STATES.IDLE) this.transition(record, STATES.IDLE);
            return true;
        }

        getInstance(role) {
            this.assertRole(role);
            return this.records.get(role)?.instance || null;
        }

        getActiveInstances() {
            return Object.freeze(ROLES.flatMap(role => {
                const record = this.records.get(role);
                return record ? [Object.freeze({ role, providerId: record.providerId, instance: record.instance })] : [];
            }));
        }

        getResourceSnapshot() {
            const roles = {};
            let estimatedHashMiB = 0;
            let hashEstimateComplete = true;
            const wasmAssets = new Map();
            const workerAssets = new Map();
            for (const role of ROLES) {
                const record = this.records.get(role);
                if (!record) {
                    roles[role] = null;
                    continue;
                }
                const identity = record.instance.getRuntimeIdentity?.() || null;
                const resource = record.provider.resource || {};
                const state = record.instance.analyzing
                    ? STATES.THINKING
                    : (record.state === STATES.THINKING ? STATES.IDLE : record.state);
                const hash = resource.defaultHashMiB;
                if (hash != null && Number.isFinite(Number(hash))) {
                    estimatedHashMiB += Number(hash);
                } else {
                    hashEstimateComplete = false;
                }
                if (record.provider.wasmPath) {
                    wasmAssets.set(record.provider.wasmPath, Number(resource.wasmBytes) || 0);
                }
                workerAssets.set(record.provider.workerPath, Number(resource.workerBytes) || 0);
                roles[role] = Object.freeze({
                    providerId: record.providerId,
                    runtimeInstanceId: identity?.runtimeInstanceId || record.runtimeInstanceId,
                    state,
                    workerAsset: identity?.workerAsset || record.provider.workerPath,
                    reportedUciName: identity?.reportedUciName || null,
                    identityValidated: identity?.identityValidated === true,
                    generation: record.generation,
                    resources: Object.freeze({ ...resource })
                });
            }
            return Object.freeze({
                activeWorkers: this.records.size,
                activeRuntimeRecords: this.records.size,
                roles: Object.freeze(roles),
                estimatedHashMiB,
                hashEstimateComplete,
                wasmAssets: Object.freeze(Array.from(wasmAssets, ([path, bytes]) => Object.freeze({ path, bytes }))),
                workerAssets: Object.freeze(Array.from(workerAssets, ([path, bytes]) => Object.freeze({ path, bytes }))),
                liveRuntimeIds: Object.freeze(Object.values(roles).filter(Boolean)
                    .map(record => record.runtimeInstanceId).filter(Boolean)),
                historicalTimingCount: this.timingHistory.length,
                latestTimings: Object.freeze(this.timingHistory.slice(-3)),
                historicalTerminationCount: this.terminationHistory.length,
                latestTerminations: Object.freeze(this.terminationHistory.slice(-3)),
                lastFailures: Object.freeze(Object.fromEntries(this.lastFailures)),
                diagnostics: Object.freeze({ ...this.diagnostics })
            });
        }
    }

    ArenaRuntimeManager.ROLES = ROLES;
    ArenaRuntimeManager.STATES = STATES;
    window.ArenaRuntimeManager = ArenaRuntimeManager;
})();
