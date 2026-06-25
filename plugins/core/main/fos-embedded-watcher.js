// fos-embedded-watcher.js
// Parent-page watcher: detects FOS env instances via orchestrator + latch, authorizes embedded iframe clipboard bridge.

const FOS_ENV_HOST_PATTERN = /\.env\.[^.]+(?:\.[^.]+)*\.fleetai\.com$/;
const FOS_ORCHESTRATOR_INSTANCES_URL = 'https://orchestrator.fleetai.com/v1/env/instances';
const FOS_LATCH_TIMESTAMP_PATH = '/latch/api/v1/env/timestamp';
const FOS_CHILD_READY_TYPE = 'fleet-fos-child-ready';
const FOS_EMBEDDED_READY_TYPE = 'fleet-fos-embedded-ready';

function fosInstanceIdFromHostname(hostname) {
    return String(hostname || '').split('.')[0] || '';
}

function fosIsFosEnvKey(envKey) {
    return String(envKey || '').includes('fos');
}

const plugin = {
    id: 'fosEmbeddedWatcher',
    name: 'FOS Embedded Watcher',
    description:
        'Detects embedded FOS env instances on the parent page and signals the iframe child when latch is ready',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: {
        fosInstances: null,
        pendingChildren: null,
        messageListenerInstalled: false,
        activationLogged: false
    },

    init(state, _context) {
        if (!state.fosInstances) {
            state.fosInstances = new Map();
        }
        if (!state.pendingChildren) {
            state.pendingChildren = new Map();
        }
        this._subscribeOrchestrator(state);
        this._subscribeLatch(state);
        this._listenChildReady(state);
        Logger.debug('fosEmbeddedWatcher: parent watchers registered');
    },

    _ensureInstance(state, instanceId) {
        if (!state.fosInstances.has(instanceId)) {
            state.fosInstances.set(instanceId, { envKey: null, latchReady: false });
        }
        return state.fosInstances.get(instanceId);
    },

    _tryNotifyChild(state, instanceId, child) {
        const rec = state.fosInstances.get(instanceId);
        if (!rec || !rec.latchReady || !rec.envKey || !fosIsFosEnvKey(rec.envKey)) {
            return false;
        }
        if (!child || !child.source || typeof child.source.postMessage !== 'function') {
            return false;
        }
        try {
            child.source.postMessage(
                { type: FOS_EMBEDDED_READY_TYPE, envKey: rec.envKey },
                child.origin || '*'
            );
            if (!state.activationLogged) {
                state.activationLogged = true;
                Logger.log(
                    'fosEmbeddedWatcher: signaled embedded FOS iframe for instance ' +
                        instanceId +
                        ' (' +
                        rec.envKey +
                        ')'
                );
            } else {
                Logger.debug('fosEmbeddedWatcher: signaled instance ' + instanceId);
            }
            return true;
        } catch (e) {
            Logger.warn('fosEmbeddedWatcher: postMessage to child failed for ' + instanceId, e);
            return false;
        }
    },

    _flushPendingChild(state, instanceId) {
        const pending = state.pendingChildren.get(instanceId);
        if (!pending) {
            return;
        }
        if (this._tryNotifyChild(state, instanceId, pending)) {
            state.pendingChildren.delete(instanceId);
        }
    },

    _onInstanceProgress(state, instanceId) {
        this._flushPendingChild(state, instanceId);
    },

    _subscribeOrchestrator(state) {
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.warn('fosEmbeddedWatcher: NetworkObserver unavailable; orchestrator capture skipped');
            return;
        }
        const self = this;
        Context.networkObserver.subscribe({
            id: 'fos-embedded-watcher-orchestrator',
            matches(meta) {
                return (
                    meta.method === 'POST' &&
                    !!meta.urlObj &&
                    meta.urlObj.href.startsWith(FOS_ORCHESTRATOR_INSTANCES_URL)
                );
            },
            onResponse(meta, response) {
                if (!response.ok) {
                    return;
                }
                response
                    .json()
                    .then((body) => {
                        if (!body || !body.instance_id || !fosIsFosEnvKey(body.env_key)) {
                            return;
                        }
                        const instanceId = String(body.instance_id);
                        const rec = self._ensureInstance(state, instanceId);
                        rec.envKey = String(body.env_key);
                        Logger.log(
                            'fosEmbeddedWatcher: FOS instance registered ' +
                                instanceId +
                                ' env=' +
                                rec.envKey
                        );
                        self._onInstanceProgress(state, instanceId);
                    })
                    .catch(() => { /* ignore non-JSON */ });
            }
        });
    },

    _subscribeLatch(state) {
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.warn('fosEmbeddedWatcher: NetworkObserver unavailable; latch capture skipped');
            return;
        }
        const self = this;
        Context.networkObserver.subscribe({
            id: 'fos-embedded-watcher-latch',
            matches(meta) {
                return (
                    meta.method === 'GET' &&
                    !!meta.urlObj &&
                    meta.urlObj.pathname === FOS_LATCH_TIMESTAMP_PATH &&
                    FOS_ENV_HOST_PATTERN.test(meta.urlObj.hostname)
                );
            },
            onResponse(meta, response) {
                if (response.status !== 200) {
                    return;
                }
                const instanceId = fosInstanceIdFromHostname(meta.urlObj.hostname);
                if (!instanceId) {
                    return;
                }
                const rec = self._ensureInstance(state, instanceId);
                if (!rec.latchReady) {
                    rec.latchReady = true;
                    Logger.log('fosEmbeddedWatcher: latch ready for instance ' + instanceId);
                }
                self._onInstanceProgress(state, instanceId);
            }
        });
    },

    _listenChildReady(state) {
        if (state.messageListenerInstalled) {
            return;
        }
        state.messageListenerInstalled = true;
        const self = this;
        window.addEventListener('message', (event) => {
            if (!event.data || event.data.type !== FOS_CHILD_READY_TYPE) {
                return;
            }
            let originHostname = '';
            try {
                originHostname = new URL(event.origin).hostname;
            } catch (_e) {
                return;
            }
            if (!FOS_ENV_HOST_PATTERN.test(originHostname)) {
                return;
            }
            const hostname = String(event.data.hostname || originHostname);
            if (!FOS_ENV_HOST_PATTERN.test(hostname)) {
                return;
            }
            const instanceId = fosInstanceIdFromHostname(hostname);
            if (!instanceId) {
                return;
            }
            const child = { source: event.source, origin: event.origin };
            Logger.debug('fosEmbeddedWatcher: child-ready from ' + instanceId);
            if (!self._tryNotifyChild(state, instanceId, child)) {
                state.pendingChildren.set(instanceId, child);
                Logger.debug('fosEmbeddedWatcher: child queued pending latch for ' + instanceId);
            }
        });
    }
};
