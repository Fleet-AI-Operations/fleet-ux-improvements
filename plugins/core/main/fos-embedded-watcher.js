// fos-embedded-watcher.js
// Parent-page watcher: detects FOS desktop envs via orchestrator + latch + either
// env_key "fos" substring or noVNC/child shape, authorizes embedded iframe clipboard
// bridge, and hosts VM Clipboard UI (system clipboard I/O stays on the parent).
// Bar hosts on CU creation/QA claim UI via Context.fosEmbedded; floating panel mounts only when no host claimed.

const FOS_ENV_HOST_PATTERN = /\.env\.[^.]+(?:\.[^.]+)*\.fleetai\.com$/;
const FOS_ORCHESTRATOR_INSTANCES_URL = 'https://orchestrator.fleetai.com/v1/env/instances';
const FOS_CHILD_READY_TYPE = 'fleet-fos-child-ready';
const FOS_EMBEDDED_READY_TYPE = 'fleet-fos-embedded-ready';
const FOS_EMBEDDED_ACK_TYPE = 'fleet-fos-embedded-ack';
const FOS_PUSH_TYPE = 'fleet-fos-push-clipboard';
const FOS_PUSH_RESULT_TYPE = 'fleet-fos-push-result';
const FOS_EXTRACT_REQ_TYPE = 'fleet-fos-extract-request';
const FOS_EXTRACT_RESULT_TYPE = 'fleet-fos-extract-result';
const FOS_CLIPBOARD_ALLOW_TOKENS = ['clipboard-read *', 'clipboard-write *'];
const FOS_PANEL_ATTR = 'data-fleet-fos-vm-clipboard';
const FOS_CLIP_FLASH_MS = 600;
const FOS_CLIPBOARD_MAX_CHARS = 262144;
const FOS_PARENT_ORIGINS = new Set(['https://www.fleetai.com', 'https://fleetai.com']);

function fosRandomNonce() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fosIsExactEnvOrigin(origin) {
    try {
        const hostname = new URL(origin).hostname;
        return FOS_ENV_HOST_PATTERN.test(hostname) && new URL(origin).protocol === 'https:';
    } catch (_e) {
        return false;
    }
}

function fosEnsureInstanceNonce(rec) {
    if (!rec.bridgeNonce) {
        rec.bridgeNonce = fosRandomNonce();
    }
    return rec.bridgeNonce;
}

function fosInstanceIdFromHostname(hostname) {
    return String(hostname || '').split('.')[0] || '';
}

/** Case-insensitive: env_key contains "fos" (codename path; concurrent with desktop shape). */
function fosIsFosEnvKey(envKey) {
    return String(envKey || '').toLowerCase().includes('fos');
}

/**
 * FOS desktop / noVNC fetch shape (concurrent with env_key name check).
 * Root /api/v1/env/timestamp alone is NOT sufficient — single-app web envs use it too.
 */
function fosIsDesktopShapePath(pathname) {
    const path = String(pathname || '');
    if (!path) {
        return false;
    }
    if (path === '/websockify' || path.endsWith('/websockify')) {
        return true;
    }
    if (path === '/core/rfb.js' || path.endsWith('/core/rfb.js')) {
        return true;
    }
    if (path === '/app/ui.js' || path.endsWith('/app/ui.js')) {
        return true;
    }
    return false;
}

function fosIsEnvDesktopShapeRequest(meta) {
    return (
        !!meta.urlObj &&
        FOS_ENV_HOST_PATTERN.test(meta.urlObj.hostname) &&
        fosIsDesktopShapePath(meta.urlObj.pathname)
    );
}

/** Any env-subdomain GET whose path includes "timestamp" (readiness probe path varies by env). */
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
 * Returns true when the allow attribute was changed. (Does not unlock read without reload.)
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

function fosNextRequestId() {
    return 'fos-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function fosFlashBtn(btn, ok) {
    if (!btn) {
        return;
    }
    if (Context.buttonFeedback) {
        if (ok && typeof Context.buttonFeedback.flashSuccess === 'function') {
            Context.buttonFeedback.flashSuccess(btn);
            return;
        }
        if (!ok && typeof Context.buttonFeedback.flashFailure === 'function') {
            Context.buttonFeedback.flashFailure(btn);
            return;
        }
    }
    if (btn._fosClipResetTimeout) {
        clearTimeout(btn._fosClipResetTimeout);
    }
    btn.style.background = ok ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';
    btn.style.color = '#ffffff';
    btn._fosClipResetTimeout = setTimeout(() => {
        btn._fosClipResetTimeout = null;
        btn.style.background = '';
        btn.style.color = '';
    }, FOS_CLIP_FLASH_MS);
}

const plugin = {
    id: 'fosEmbeddedWatcher',
    name: 'FOS Embedded Watcher',
    description:
        'Detects FOS desktop envs and hosts the VM Clipboard bridge (Safe UX Build: nonce-bound messaging)',
    _version: '5.5',
    phase: 'core',
    enabledByDefault: true,
    initialState: {
        fosInstances: null,
        pendingChildren: null,
        clipboardPanels: null,
        pendingRequests: null,
        readyInstances: null,
        uiHosts: null,
        readinessListeners: null,
        desktopListeners: null,
        messageListenerInstalled: false,
        resultListenerInstalled: false,
        ackListenerInstalled: false,
        iframeObserverInstalled: false,
        layoutListenersInstalled: false,
        activationLogged: false,
        clipboardPatchedLogged: false,
        panelMountedLogged: false,
        apiRegistered: false
    },

    init(state, _context) {
        if (!state.fosInstances) {
            state.fosInstances = new Map();
        }
        if (!state.pendingChildren) {
            state.pendingChildren = new Map();
        }
        if (!state.clipboardPanels) {
            state.clipboardPanels = new Map();
        }
        if (!state.pendingRequests) {
            state.pendingRequests = new Map();
        }
        if (!state.readyInstances) {
            state.readyInstances = new Map();
        }
        if (!state.uiHosts) {
            state.uiHosts = new Set();
        }
        if (!state.readinessListeners) {
            state.readinessListeners = new Set();
        }
        if (!state.desktopListeners) {
            state.desktopListeners = new Set();
        }
        this._state = state;
        this._exposeApi(state);
        this._subscribeOrchestrator(state);
        this._subscribeDesktopShape(state);
        this._subscribeLatch(state);
        this._listenChildReady(state);
        this._listenEmbeddedAck(state);
        this._listenClipboardResults(state);
        this._watchEnvIframes(state);
        this._installLayoutListeners(state);
        Logger.debug('parent watchers registered');
    },

    _exposeApi(state) {
        const self = this;
        Context.fosEmbedded = {
            claimUiHost(ownerId) {
                const id = String(ownerId || '');
                if (!id) {
                    return;
                }
                const wasEmpty = state.uiHosts.size === 0;
                state.uiHosts.add(id);
                if (wasEmpty && state.uiHosts.size > 0) {
                    self._teardownAllPanels(state);
                    Logger.log('UI host claimed — floating VM Clipboard suppressed');
                }
            },
            releaseUiHost(ownerId) {
                const id = String(ownerId || '');
                if (!id) {
                    return;
                }
                state.uiHosts.delete(id);
                if (state.uiHosts.size === 0) {
                    Logger.log('UI hosts cleared — floating VM Clipboard allowed');
                    state.readyInstances.forEach((entry, instanceId) => {
                        if (entry && entry.iframe && entry.child) {
                            self._mountClipboardPanel(state, instanceId, entry.child, entry.iframe);
                        }
                    });
                }
            },
            subscribe(listener) {
                if (typeof listener !== 'function') {
                    return () => {};
                }
                state.readinessListeners.add(listener);
                state.readyInstances.forEach((_entry, instanceId) => {
                    try {
                        listener({ instanceId, ready: true });
                    } catch (_e) {
                        /* ignore */
                    }
                });
                return () => {
                    state.readinessListeners.delete(listener);
                };
            },
            isFosDesktop(instanceId) {
                const id = String(instanceId || '');
                if (!id) {
                    return false;
                }
                const rec = state.fosInstances.get(id);
                return !!(rec && rec.isFosDesktop);
            },
            subscribeDesktop(listener) {
                if (typeof listener !== 'function') {
                    return () => {};
                }
                state.desktopListeners.add(listener);
                state.fosInstances.forEach((rec, instanceId) => {
                    if (rec && rec.isFosDesktop) {
                        try {
                            listener({ instanceId, isFosDesktop: true });
                        } catch (_e) {
                            /* ignore */
                        }
                    }
                });
                return () => {
                    state.desktopListeners.delete(listener);
                };
            },
            getReadyInstances() {
                return self._getReadyInstancesList(state);
            },
            overwrite(instanceId) {
                return self._overwriteInstance(state, instanceId);
            },
            extract(instanceId) {
                return self._extractInstance(state, instanceId);
            },
            hasUiHost() {
                return state.uiHosts.size > 0;
            }
        };
        if (!state.apiRegistered) {
            state.apiRegistered = true;
            Logger.log('Context.fosEmbedded registered');
        }
    },

    _getReadyInstancesList(state) {
        const list = [];
        state.readyInstances.forEach((entry, instanceId) => {
            if (!entry || !entry.iframe || !entry.iframe.isConnected || !entry.child) {
                return;
            }
            list.push({
                instanceId,
                iframe: entry.iframe,
                child: entry.child
            });
        });
        return list;
    },

    _notifyReadiness(state, instanceId, ready) {
        state.readinessListeners.forEach((listener) => {
            try {
                listener({ instanceId: String(instanceId), ready: !!ready });
            } catch (e) {
                Logger.warn('readiness listener threw', e);
            }
        });
    },

    _notifyDesktopIdentification(state, instanceId) {
        const id = String(instanceId || '');
        if (!id || !state.desktopListeners) {
            return;
        }
        state.desktopListeners.forEach((listener) => {
            try {
                listener({ instanceId: id, isFosDesktop: true });
            } catch (e) {
                Logger.warn('desktop listener threw', e);
            }
        });
    },

    _markInstanceReady(state, instanceId, child, iframe) {
        const id = String(instanceId);
        const prev = state.readyInstances.get(id);
        const wasReady = !!(prev && prev.iframe && prev.iframe.isConnected);
        state.readyInstances.set(id, { instanceId: id, child, iframe });
        if (!wasReady) {
            this._notifyReadiness(state, id, true);
        }
    },

    _unmarkInstanceReady(state, instanceId) {
        const id = String(instanceId);
        if (!state.readyInstances.has(id)) {
            return;
        }
        state.readyInstances.delete(id);
        this._notifyReadiness(state, id, false);
    },

    _resolveChild(state, instanceId) {
        const ready = state.readyInstances.get(String(instanceId));
        if (ready && ready.child && ready.child.source) {
            return ready.child;
        }
        const panel = state.clipboardPanels.get(String(instanceId));
        if (panel && panel.child && panel.child.source) {
            return panel.child;
        }
        const rec = state.fosInstances.get(String(instanceId));
        if (rec && rec.child && rec.child.source) {
            return rec.child;
        }
        return null;
    },

    _childFailureDetail(result, emptyFallback) {
        if (!result) {
            return 'no result';
        }
        if (result.timedOut) {
            return 'timed out';
        }
        if (result.reason) {
            const err =
                result.error != null && String(result.error)
                    ? String(result.error)
                    : '';
            return err ? result.reason + ': ' + err : String(result.reason);
        }
        if (emptyFallback && result.text === '') {
            return 'VM clipboard empty';
        }
        return 'unknown';
    },

    async _overwriteInstance(state, instanceId) {
        const id = String(instanceId || '');
        const child = this._resolveChild(state, id);
        if (!child || !child.source) {
            Logger.warn('overwrite failed — child missing for ' + id);
            return false;
        }
        let text;
        try {
            text = await navigator.clipboard.readText();
        } catch (e) {
            Logger.warn('overwrite failed — could not read system clipboard', e);
            return false;
        }
        if (text == null) {
            return false;
        }
        if (typeof text !== 'string' || text.length > FOS_CLIPBOARD_MAX_CHARS) {
            Logger.warn('overwrite skipped — clipboard text missing or too large');
            return false;
        }
        const requestId = fosNextRequestId();
        const nonce = fosEnsureInstanceNonce(this._ensureInstance(state, id));
        const resultPromise = this._waitForChildResult(state, requestId, 8000, nonce);
        if (!child.origin || child.origin === '*') {
            state.pendingRequests.delete(requestId);
            Logger.warn('overwrite failed — child origin missing for ' + id);
            return false;
        }
        try {
            child.source.postMessage(
                {
                    type: FOS_PUSH_TYPE,
                    text: String(text).slice(0, FOS_CLIPBOARD_MAX_CHARS),
                    requestId,
                    nonce,
                    instanceId: id
                },
                child.origin
            );
        } catch (ePost) {
            state.pendingRequests.delete(requestId);
            Logger.warn('push postMessage failed', ePost);
            return false;
        }
        const result = await resultPromise;
        if (result && result.ok) {
            Logger.log('overwrite ok for ' + id);
            return true;
        }
        Logger.warn('overwrite failed for ' + id + ' — ' + this._childFailureDetail(result, false));
        return false;
    },

    async _extractInstance(state, instanceId) {
        const id = String(instanceId || '');
        const child = this._resolveChild(state, id);
        if (!child || !child.source) {
            Logger.warn('extract failed — child missing for ' + id);
            return false;
        }
        const requestId = fosNextRequestId();
        const nonce = fosEnsureInstanceNonce(this._ensureInstance(state, id));
        const resultPromise = this._waitForChildResult(state, requestId, 8000, nonce);
        if (!child.origin || child.origin === '*') {
            state.pendingRequests.delete(requestId);
            Logger.warn('extract failed — child origin missing for ' + id);
            return false;
        }
        try {
            child.source.postMessage(
                { type: FOS_EXTRACT_REQ_TYPE, requestId, nonce, instanceId: id },
                child.origin
            );
        } catch (ePost) {
            state.pendingRequests.delete(requestId);
            Logger.warn('extract postMessage failed', ePost);
            return false;
        }
        const result = await resultPromise;
        if (!result || !result.ok || typeof result.text !== 'string' || !result.text) {
            Logger.warn('extract failed for ' + id + ' — ' + this._childFailureDetail(result, true));
            return false;
        }
        try {
            await navigator.clipboard.writeText(result.text);
            Logger.log('extract ok for ' + id);
            return true;
        } catch (eWrite) {
            Logger.warn('extract failed — could not write system clipboard', eWrite);
            return false;
        }
    },

    _ensureInstance(state, instanceId) {
        if (!state.fosInstances.has(instanceId)) {
            state.fosInstances.set(instanceId, {
                envKey: null,
                latchReady: false,
                isFosDesktop: false,
                child: null
            });
        }
        return state.fosInstances.get(instanceId);
    },

    _markFosDesktop(state, instanceId, reason) {
        const id = String(instanceId || '');
        if (!id) {
            return false;
        }
        const rec = this._ensureInstance(state, id);
        if (rec.isFosDesktop) {
            return false;
        }
        rec.isFosDesktop = true;
        Logger.log('FOS desktop shape for instance ' +
                id +
                (reason ? ' (' + reason + ')' : '')
        );
        this._notifyDesktopIdentification(state, id);
        this._onInstanceProgress(state, id);
        return true;
    },

    _logClipboardPatched(state, iframe) {
        const host = fosHostnameFromIframe(iframe) || 'unknown';
        if (!state.clipboardPatchedLogged) {
            state.clipboardPatchedLogged = true;
            Logger.log('enabled clipboard permissions on env iframe ' + host);
        } else {
            Logger.debug('clipboard permissions patched on ' + host);
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
        return iframe;
    },

    _scanEnvIframes(state) {
        const frames = document.querySelectorAll('iframe');
        for (let i = 0; i < frames.length; i++) {
            this._patchIframeClipboardAllow(state, frames[i]);
        }
        this._repositionAllPanels(state);
        this._pruneMissingReady(state);
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
            self._repositionAllPanels(state);
            self._pruneMissingReady(state);
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

    _installLayoutListeners(state) {
        if (state.layoutListenersInstalled) {
            return;
        }
        state.layoutListenersInstalled = true;
        const self = this;
        const onLayout = () => {
            self._repositionAllPanels(state);
        };
        window.addEventListener('resize', onLayout, true);
        window.addEventListener('scroll', onLayout, true);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerEventListener) {
            CleanupRegistry.registerEventListener(window, 'resize', onLayout, true);
            CleanupRegistry.registerEventListener(window, 'scroll', onLayout, true);
        }
    },

    _positionPanel(panel, iframe) {
        if (!panel || !iframe || !iframe.isConnected) {
            return;
        }
        const rect = iframe.getBoundingClientRect();
        const left = Math.max(8, Math.round(rect.left + 16));
        const top = Math.max(8, Math.round(rect.bottom - 16 - panel.offsetHeight));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.bottom = 'auto';
    },

    _repositionAllPanels(state) {
        state.clipboardPanels.forEach((entry) => {
            if (!entry || !entry.root || !entry.iframe) {
                return;
            }
            if (entry.userMoved) {
                return;
            }
            this._positionPanel(entry.root, entry.iframe);
        });
    },

    _pruneMissingReady(state) {
        const toRemove = [];
        state.readyInstances.forEach((entry, instanceId) => {
            if (!entry || !entry.iframe || !entry.iframe.isConnected) {
                toRemove.push(instanceId);
            }
        });
        // Also prune floating panels whose iframe is gone even if not in readyInstances
        state.clipboardPanels.forEach((entry, instanceId) => {
            if (!entry || !entry.iframe || !entry.iframe.isConnected) {
                if (toRemove.indexOf(instanceId) === -1) {
                    toRemove.push(instanceId);
                }
            }
        });
        toRemove.forEach((id) => {
            this._teardownPanel(state, id);
            this._unmarkInstanceReady(state, id);
        });
    },

    _teardownPanel(state, instanceId) {
        const entry = state.clipboardPanels.get(instanceId);
        if (!entry) {
            return;
        }
        if (entry.root && entry.root.parentNode) {
            entry.root.parentNode.removeChild(entry.root);
        }
        state.clipboardPanels.delete(instanceId);
        Logger.debug('VM Clipboard panel removed for ' + instanceId);
    },

    _teardownAllPanels(state) {
        const ids = [];
        state.clipboardPanels.forEach((_entry, instanceId) => {
            ids.push(instanceId);
        });
        ids.forEach((id) => {
            this._teardownPanel(state, id);
        });
    },

    _waitForChildResult(state, requestId, timeoutMs, nonce) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                state.pendingRequests.delete(requestId);
                resolve({ ok: false, timedOut: true });
            }, timeoutMs || 8000);
            state.pendingRequests.set(requestId, {
                nonce: nonce || null,
                resolve: (payload) => {
                    clearTimeout(timer);
                    resolve(payload);
                }
            });
        });
    },

    _mountClipboardPanel(state, instanceId, child, iframe) {
        if (state.uiHosts.size > 0) {
            return;
        }
        if (!iframe || !child || !child.source) {
            return;
        }
        const existing = state.clipboardPanels.get(instanceId);
        if (existing && existing.root && existing.root.isConnected) {
            existing.child = child;
            existing.iframe = iframe;
            this._positionPanel(existing.root, iframe);
            return;
        }
        if (existing) {
            this._teardownPanel(state, instanceId);
        }

        if (!document.body) {
            return;
        }

        const self = this;
        if (Context.uiLib && typeof Context.uiLib.ensurePanelStyles === 'function') {
            Context.uiLib.ensurePanelStyles();
        }
        const pc = (Context.uiLib && Context.uiLib.PANEL_CLASSES) || {};
        const root = document.createElement('div');
        root.setAttribute(FOS_PANEL_ATTR, instanceId);
        root.className = pc.root || '';
        root.style.cssText =
            'position:fixed;z-index:2147483646;min-width:220px;max-width:280px;padding:0;user-select:none;';

        const clipHeader = document.createElement('div');
        clipHeader.className = pc.header || '';
        clipHeader.style.cssText =
            'display:flex;align-items:center;justify-content:space-between;' +
            'padding:6px 8px 4px 12px;cursor:grab;';

        const clipTitle = document.createElement('div');
        clipTitle.textContent = 'VM Clipboard';
        clipTitle.className = pc.sectionLabel || '';
        clipTitle.style.cssText = 'flex:1;min-width:0;';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close VM Clipboard');
        closeBtn.textContent = '×';
        closeBtn.className = pc.muted || '';
        closeBtn.style.cssText =
            'margin:0;padding:0 4px;border:none;background:transparent;' +
            'font:inherit;font-size:16px;line-height:1;cursor:pointer;border-radius:4px;color:inherit;';

        clipHeader.appendChild(clipTitle);
        clipHeader.appendChild(closeBtn);

        const clipBody = document.createElement('div');
        clipBody.style.cssText = 'padding:0 12px 10px 12px;';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;';

        function makeBtn(label) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.className = pc.btn || '';
            b.style.flex = '1';
            return b;
        }

        const bExtract = makeBtn('Extract');
        const bOverwrite = makeBtn('Overwrite');

        bOverwrite.addEventListener('click', () => {
            self._overwriteInstance(state, instanceId).then((ok) => {
                fosFlashBtn(bOverwrite, !!ok);
            });
        });

        bExtract.addEventListener('click', () => {
            self._extractInstance(state, instanceId).then((ok) => {
                fosFlashBtn(bExtract, !!ok);
            });
        });

        closeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            self._teardownPanel(state, instanceId);
            Logger.log('VM Clipboard panel dismissed for ' + instanceId);
        });

        btnRow.appendChild(bExtract);
        btnRow.appendChild(bOverwrite);
        clipBody.appendChild(btnRow);
        root.appendChild(clipHeader);
        root.appendChild(clipBody);
        document.body.appendChild(root);

        let dragging = false;
        let dragOx = 0;
        let dragOy = 0;
        let userMoved = false;

        function onDragMove(ev) {
            if (!dragging) {
                return;
            }
            root.style.left = Math.max(0, ev.clientX - dragOx) + 'px';
            root.style.top = Math.max(0, ev.clientY - dragOy) + 'px';
            userMoved = true;
        }

        function onDragUp() {
            if (!dragging) {
                return;
            }
            dragging = false;
            clipHeader.style.cursor = 'grab';
            document.removeEventListener('mousemove', onDragMove, true);
            document.removeEventListener('mouseup', onDragUp, true);
        }

        clipHeader.addEventListener('mousedown', (ev) => {
            if (ev.button !== 0 || closeBtn.contains(ev.target)) {
                return;
            }
            ev.preventDefault();
            const r = root.getBoundingClientRect();
            dragging = true;
            dragOx = ev.clientX - r.left;
            dragOy = ev.clientY - r.top;
            clipHeader.style.cursor = 'grabbing';
            document.addEventListener('mousemove', onDragMove, true);
            document.addEventListener('mouseup', onDragUp, true);
        });

        const entry = {
            root,
            iframe,
            child,
            userMoved: false,
            get moved() {
                return userMoved;
            }
        };
        Object.defineProperty(entry, 'userMoved', {
            get() {
                return userMoved;
            },
            set(v) {
                userMoved = !!v;
            }
        });

        state.clipboardPanels.set(instanceId, entry);
        this._positionPanel(root, iframe);

        if (!state.panelMountedLogged) {
            state.panelMountedLogged = true;
            Logger.log('mounted parent VM Clipboard for ' + instanceId);
        } else {
            Logger.debug('mounted VM Clipboard for ' + instanceId);
        }
    },

    _tryNotifyChild(state, instanceId, child) {
        const rec = state.fosInstances.get(instanceId);
        if (!rec || !rec.latchReady || !rec.envKey) {
            return false;
        }
        if (!rec.isFosDesktop) {
            if (!fosIsFosEnvKey(rec.envKey)) {
                return false;
            }
            // Codename hit: mark here without _markFosDesktop (avoids re-entrant flush).
            rec.isFosDesktop = true;
            Logger.log('FOS desktop shape for instance ' +
                    instanceId +
                    ' (env-key)'
            );
            this._notifyDesktopIdentification(state, instanceId);
        }
        if (!child || !child.source || typeof child.source.postMessage !== 'function') {
            return false;
        }
        if (!child.origin || child.origin === '*') {
            return false;
        }
        const nonce = fosEnsureInstanceNonce(rec);
        try {
            child.source.postMessage(
                {
                    type: FOS_EMBEDDED_READY_TYPE,
                    envKey: rec.envKey,
                    nonce,
                    instanceId
                },
                child.origin
            );
            rec.child = child;
            const hostname =
                (child.origin && (() => {
                    try {
                        return new URL(child.origin).hostname;
                    } catch (_e) {
                        return '';
                    }
                })()) ||
                '';
            const iframe =
                fosFindIframeForSource(child.source) ||
                (hostname ? fosFindEnvIframeByHostname(hostname) : null);
            if (iframe) {
                this._patchIframeClipboardAllow(state, iframe);
            }
            // Ready UI waits for fleet-fos-embedded-ack so push/extract are not offered before auth.
            if (!state.activationLogged) {
                state.activationLogged = true;
                Logger.log('signaled embedded FOS iframe for instance ' +
                        instanceId +
                        ' (' +
                        rec.envKey +
                        ')'
                );
            } else {
                Logger.debug('signaled instance ' + instanceId);
            }
            return true;
        } catch (e) {
            Logger.warn('postMessage to child failed for ' + instanceId, e);
            return false;
        }
    },

    _onEmbeddedAck(state, event) {
        if (!fosIsExactEnvOrigin(event.origin)) {
            return;
        }
        if (!fosFindIframeForSource(event.source)) {
            Logger.warn('embedded ack ignored — source is not a page iframe');
            return;
        }
        if (!event.data || event.data.ok !== true) {
            Logger.warn('embedded ack rejected from ' + event.origin);
            return;
        }
        let originHostname = '';
        try {
            originHostname = new URL(event.origin).hostname;
        } catch (_e) {
            return;
        }
        const instanceId = String(event.data.instanceId || fosInstanceIdFromHostname(originHostname));
        if (!instanceId) {
            return;
        }
        const rec = state.fosInstances.get(instanceId);
        if (!rec || !rec.bridgeNonce || event.data.nonce !== rec.bridgeNonce) {
            Logger.warn('embedded ack ignored — nonce mismatch for ' + instanceId);
            return;
        }
        const child =
            (rec.child && rec.child.source === event.source && rec.child) ||
            { source: event.source, origin: event.origin };
        rec.child = child;
        const iframe =
            fosFindIframeForSource(event.source) ||
            fosFindEnvIframeByHostname(originHostname);
        if (!iframe) {
            Logger.warn('embedded ack for ' + instanceId + ' — iframe not found');
            return;
        }
        this._patchIframeClipboardAllow(state, iframe);
        this._markInstanceReady(state, instanceId, child, iframe);
        this._mountClipboardPanel(state, instanceId, child, iframe);
        Logger.log('embedded bridge authorized for ' + instanceId);
    },

    _listenEmbeddedAck(state) {
        if (state.ackListenerInstalled) {
            return;
        }
        state.ackListenerInstalled = true;
        const self = this;
        window.addEventListener('message', (event) => {
            if (!event.data || event.data.type !== FOS_EMBEDDED_ACK_TYPE) {
                return;
            }
            self._onEmbeddedAck(state, event);
        });
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
            Logger.warn('NetworkObserver unavailable; orchestrator capture skipped');
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
                        if (!body || !body.instance_id || body.env_key == null || body.env_key === '') {
                            return;
                        }
                        const instanceId = String(body.instance_id);
                        const rec = self._ensureInstance(state, instanceId);
                        rec.envKey = String(body.env_key);
                        Logger.log('env instance registered ' +
                                instanceId +
                                ' env=' +
                                rec.envKey
                        );
                        if (fosIsFosEnvKey(rec.envKey)) {
                            self._markFosDesktop(state, instanceId, 'env-key');
                        }
                        self._onInstanceProgress(state, instanceId);
                    })
                    .catch(() => { /* ignore non-JSON */ });
            }
        });
    },

    _subscribeDesktopShape(state) {
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.warn('NetworkObserver unavailable; desktop shape capture skipped');
            return;
        }
        const self = this;
        Context.networkObserver.subscribe({
            id: 'fos-embedded-watcher-desktop-shape',
            matches(meta) {
                return fosIsEnvDesktopShapeRequest(meta);
            },
            onRequest(meta) {
                const instanceId = fosInstanceIdFromHostname(meta.urlObj.hostname);
                if (!instanceId) {
                    return;
                }
                self._markFosDesktop(state, instanceId, meta.urlObj.pathname);
            },
            onResponse(meta, _response) {
                const instanceId = fosInstanceIdFromHostname(meta.urlObj.hostname);
                if (!instanceId) {
                    return;
                }
                self._markFosDesktop(state, instanceId, meta.urlObj.pathname);
            }
        });
    },

    _subscribeLatch(state) {
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.warn('NetworkObserver unavailable; latch capture skipped');
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
                    Logger.log('env ready for instance ' +
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

    _listenClipboardResults(state) {
        if (state.resultListenerInstalled) {
            return;
        }
        state.resultListenerInstalled = true;
        window.addEventListener('message', (event) => {
            if (!event.data || typeof event.data !== 'object' || typeof event.data.type !== 'string') {
                return;
            }
            const type = event.data.type;
            if (type !== FOS_PUSH_RESULT_TYPE && type !== FOS_EXTRACT_RESULT_TYPE) {
                return;
            }
            if (!fosIsExactEnvOrigin(event.origin) || !fosFindIframeForSource(event.source)) {
                return;
            }
            const requestId = event.data.requestId;
            if (!requestId || !state.pendingRequests.has(requestId)) {
                return;
            }
            const instanceId = String(event.data.instanceId || '');
            const rec = instanceId ? state.fosInstances.get(instanceId) : null;
            const pendingReq = state.pendingRequests.get(requestId);
            const nonceOk =
                !!rec &&
                (event.data.nonce === rec.bridgeNonce ||
                    (pendingReq && pendingReq.nonce && event.data.nonce === pendingReq.nonce));
            if (!nonceOk) {
                Logger.warn('clipboard result ignored — nonce/instance mismatch (instance ' +
                    (instanceId || '?') + ', known=' + (rec ? 'yes' : 'no') + ')');
                return;
            }
            if (rec.child && rec.child.source && rec.child.source !== event.source) {
                Logger.warn('clipboard result ignored — source does not match bound iframe');
                return;
            }
            if (type === FOS_EXTRACT_RESULT_TYPE && typeof event.data.text === 'string' &&
                event.data.text.length > FOS_CLIPBOARD_MAX_CHARS) {
                Logger.warn('clipboard extract ignored — text too large');
                return;
            }
            const pending = state.pendingRequests.get(requestId);
            state.pendingRequests.delete(requestId);
            if (pending && typeof pending.resolve === 'function') {
                pending.resolve(event.data);
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
            if (!fosIsExactEnvOrigin(event.origin) || !fosFindIframeForSource(event.source)) {
                return;
            }
            let originHostname = '';
            try {
                originHostname = new URL(event.origin).hostname;
            } catch (_e) {
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
            self._markFosDesktop(state, instanceId, 'child-ready');
            Logger.debug('child-ready from ' + instanceId);
            // Iframe navigated/reloaded: clear prior ready until the new document acks.
            self._teardownPanel(state, instanceId);
            self._unmarkInstanceReady(state, instanceId);
            if (!self._tryNotifyChild(state, instanceId, child)) {
                state.pendingChildren.set(instanceId, child);
                Logger.debug('child queued pending latch for ' + instanceId);
            }
        });
    }
};
