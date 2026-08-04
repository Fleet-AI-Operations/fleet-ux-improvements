// fos-embedded-watcher.js
// Parent-page watcher: detects FOS env instances via orchestrator + latch, authorizes embedded iframe clipboard bridge.

const FOS_ENV_HOST_PATTERN = /\.env\.[^.]+(?:\.[^.]+)*\.fleetai\.com$/;
const FOS_ORCHESTRATOR_INSTANCES_URL = 'https://orchestrator.fleetai.com/v1/env/instances';
const FOS_CHILD_READY_TYPE = 'fleet-fos-child-ready';
const FOS_EMBEDDED_READY_TYPE = 'fleet-fos-embedded-ready';
const FOS_CLIPBOARD_ALLOW_TOKENS = ['clipboard-read *', 'clipboard-write *'];

function fosInstanceIdFromHostname(hostname) {
    return String(hostname || '').split('.')[0] || '';
}

function fosIsFosEnvKey(envKey) {
    return String(envKey || '').includes('fos');
}

/** Any env-subdomain GET whose path includes "timestamp" (readiness probe path varies by FOS env). */
function fosIsEnvTimestampProbe(meta) {
    return (
        meta.method === 'GET' &&
        !!meta.urlObj &&
        FOS_ENV_HOST_PATTERN.test(meta.urlObj.hostname) &&
        meta.urlObj.pathname.includes('timestamp')
    );
}

function fosHostnameFromIframe(iframe) {
    if (!iframe) {
        return '';
    }
    const candidates = [iframe.src, iframe.getAttribute('src')];
    for (let i = 0; i < candidates.length; i++) {
        const raw = candidates[i];
        if (!raw) {
            continue;
        }
        try {
            return new URL(raw, window.location.href).hostname;
        } catch (_e) {
            /* ignore */
        }
    }
    return '';
}

function fosIsEnvIframe(iframe) {
    return FOS_ENV_HOST_PATTERN.test(fosHostnameFromIframe(iframe));
}

function fosAllowHasClipboardFeature(allowValue, feature) {
    const tokens = String(allowValue || '')
        .split(';')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    return tokens.some((t) => t === feature || t.startsWith(feature + ' '));
}

/**
 * Ensure cross-origin clipboard Permissions Policy is delegated on the iframe.
 * Returns true when the allow attribute was changed.
 */
function fosEnsureClipboardAllow(iframe) {
    if (!iframe || iframe.tagName !== 'IFRAME') {
        return false;
    }
    const current = iframe.getAttribute('allow') || iframe.allow || '';
    const missing = FOS_CLIPBOARD_ALLOW_TOKENS.filter((token) => {
        const feature = token.split(/\s+/)[0].toLowerCase();
        return !fosAllowHasClipboardFeature(current, feature);
    });
    if (missing.length === 0) {
        return false;
    }
    const next = [current.trim(), ...missing].filter(Boolean).join('; ');
    iframe.setAttribute('allow', next);
    try {
        iframe.allow = next;
    } catch (_e) {
        /* ignore */
    }
    return true;
}

function fosFindIframeForSource(source) {
    if (!source) {
        return null;
    }
    const frames = document.querySelectorAll('iframe');
    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        try {
            if (frame.contentWindow === source) {
                return frame;
            }
        } catch (_e) {
            /* cross-origin access to contentWindow identity still works for === */
        }
    }
    return null;
}

function fosFindEnvIframeByHostname(hostname) {
    const want = String(hostname || '');
    if (!want) {
        return null;
    }
    const frames = document.querySelectorAll('iframe');
    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        if (fosHostnameFromIframe(frame) === want) {
            return frame;
        }
    }
    return null;
}

const plugin = {
    id: 'fosEmbeddedWatcher',
    name: 'FOS Embedded Watcher',
    description:
        'Detects embedded FOS env instances on the parent page and signals the iframe child when the env timestamp probe succeeds',
    _version: '1.2',
    phase: 'core',
    enabledByDefault: true,
    initialState: {
        fosInstances: null,
        pendingChildren: null,
        messageListenerInstalled: false,
        iframeObserverInstalled: false,
        activationLogged: false,
        clipboardPatchedLogged: false
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
        this._watchEnvIframes(state);
        Logger.debug('fosEmbeddedWatcher: parent watchers registered');
    },

    _ensureInstance(state, instanceId) {
        if (!state.fosInstances.has(instanceId)) {
            state.fosInstances.set(instanceId, { envKey: null, latchReady: false });
        }
        return state.fosInstances.get(instanceId);
    },

    _logClipboardPatched(state, iframe) {
        const host = fosHostnameFromIframe(iframe) || 'unknown';
        if (!state.clipboardPatchedLogged) {
            state.clipboardPatchedLogged = true;
            Logger.log('fosEmbeddedWatcher: enabled clipboard permissions on env iframe ' + host);
        } else {
            Logger.debug('fosEmbeddedWatcher: clipboard permissions patched on ' + host);
        }
    },

    _patchIframeClipboardAllow(state, iframe) {
        if (!iframe || !fosIsEnvIframe(iframe)) {
            return false;
        }
        if (!fosEnsureClipboardAllow(iframe)) {
            return false;
        }
        this._logClipboardPatched(state, iframe);
        return true;
    },

    _patchIframeForChild(state, child, hostname) {
        let iframe = fosFindIframeForSource(child && child.source);
        if (!iframe && hostname) {
            iframe = fosFindEnvIframeByHostname(hostname);
        }
        if (iframe) {
            this._patchIframeClipboardAllow(state, iframe);
        }
    },

    _scanEnvIframes(state) {
        const frames = document.querySelectorAll('iframe');
        for (let i = 0; i < frames.length; i++) {
            this._patchIframeClipboardAllow(state, frames[i]);
        }
    },

    _watchEnvIframes(state) {
        if (state.iframeObserverInstalled) {
            return;
        }
        state.iframeObserverInstalled = true;
        const self = this;
        const scan = () => {
            self._scanEnvIframes(state);
        };
        scan();
        const target = document.documentElement || document.body;
        if (!target) {
            return;
        }
        const observer = new MutationObserver((mutations) => {
            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];
                if (m.type === 'attributes' && m.target && m.target.tagName === 'IFRAME') {
                    self._patchIframeClipboardAllow(state, m.target);
                    continue;
                }
                if (m.type !== 'childList') {
                    continue;
                }
                const nodes = m.addedNodes;
                for (let j = 0; j < nodes.length; j++) {
                    const node = nodes[j];
                    if (!node || node.nodeType !== 1) {
                        continue;
                    }
                    if (node.tagName === 'IFRAME') {
                        self._patchIframeClipboardAllow(state, node);
                    } else if (typeof node.querySelectorAll === 'function') {
                        const nested = node.querySelectorAll('iframe');
                        for (let k = 0; k < nested.length; k++) {
                            self._patchIframeClipboardAllow(state, nested[k]);
                        }
                    }
                }
            }
        });
        observer.observe(target, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'allow']
        });
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerObserver) {
            CleanupRegistry.registerObserver(observer);
        }
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
                return fosIsEnvTimestampProbe(meta);
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
                    Logger.log(
                        'fosEmbeddedWatcher: env ready for instance ' +
                            instanceId +
                            ' (' +
                            meta.urlObj.pathname +
                            ')'
                    );
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
            self._patchIframeForChild(state, child, hostname);
            Logger.debug('fosEmbeddedWatcher: child-ready from ' + instanceId);
            if (!self._tryNotifyChild(state, instanceId, child)) {
                state.pendingChildren.set(instanceId, child);
                Logger.debug('fosEmbeddedWatcher: child queued pending latch for ' + instanceId);
            }
        });
    }
};
