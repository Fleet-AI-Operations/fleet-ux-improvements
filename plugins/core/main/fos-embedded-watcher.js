// fos-embedded-watcher.js
// Parent-page watcher: detects FOS desktop envs via orchestrator + latch + noVNC/child shape
// (not env_key name substrings), authorizes embedded iframe clipboard bridge, and hosts
// VM Clipboard UI (system clipboard I/O stays on the parent).
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
const FOS_CLIP_BTN_BG = 'rgba(255,255,255,0.08)';

function fosInstanceIdFromHostname(hostname) {
    return String(hostname || '').split('.')[0] || '';
}

/**
 * FOS desktop / noVNC fetch shape (not env_key names).
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
    if (btn._fosClipResetTimeout) {
        clearTimeout(btn._fosClipResetTimeout);
    }
    if (ok) {
        btn.style.transition = '';
        btn.style.background = 'rgb(34, 197, 94)';
        btn.style.color = '#ffffff';
        btn._fosClipResetTimeout = setTimeout(() => {
            btn._fosClipResetTimeout = null;
            btn.style.background = FOS_CLIP_BTN_BG;
            btn.style.color = '#f2f2f2';
        }, FOS_CLIP_FLASH_MS);
        return;
    }
    const prevT = btn.style.transition;
    btn.style.transition = 'none';
    btn.style.background = 'rgb(239, 68, 68)';
    btn.style.color = '#ffffff';
    void btn.offsetHeight;
    btn.style.transition =
        'background ' + FOS_CLIP_FLASH_MS + 'ms ease-out, color ' + FOS_CLIP_FLASH_MS + 'ms ease-out';
    btn.style.background = FOS_CLIP_BTN_BG;
    btn.style.color = '#f2f2f2';
    btn._fosClipResetTimeout = setTimeout(() => {
        btn.style.transition = prevT || '';
        btn._fosClipResetTimeout = null;
    }, FOS_CLIP_FLASH_MS);
}

const plugin = {
    id: 'fosEmbeddedWatcher',
    name: 'FOS Embedded Watcher',
    description:
        'Detects embedded FOS desktop envs (noVNC/child shape), signals the iframe child, and hosts parent-side VM Clipboard controls',
    _version: '4.0',
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
        const requestId = fosNextRequestId();
        const resultPromise = this._waitForChildResult(state, requestId, 8000);
        try {
            child.source.postMessage(
                { type: FOS_PUSH_TYPE, text: String(text), requestId },
                child.origin || '*'
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
        const resultPromise = this._waitForChildResult(state, requestId, 8000);
        try {
            child.source.postMessage(
                { type: FOS_EXTRACT_REQ_TYPE, requestId },
                child.origin || '*'
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

    _waitForChildResult(state, requestId, timeoutMs) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                state.pendingRequests.delete(requestId);
                resolve({ ok: false, timedOut: true });
            }, timeoutMs || 8000);
            state.pendingRequests.set(requestId, {
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
        const root = document.createElement('div');
        root.setAttribute(FOS_PANEL_ATTR, instanceId);
        root.style.cssText =
            'position:fixed;z-index:2147483646;min-width:220px;max-width:280px;padding:0;' +
            'border-radius:10px;border:1px solid rgba(255,255,255,0.14);' +
            'background:rgba(28,28,32,0.96);color:#f2f2f2;' +
            'font:500 12px/1.4 system-ui,-apple-system,sans-serif;' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.45);user-select:none;';

        const clipHeader = document.createElement('div');
        clipHeader.style.cssText =
            'display:flex;align-items:center;justify-content:space-between;' +
            'padding:6px 8px 4px 12px;cursor:grab;';

        const clipTitle = document.createElement('div');
        clipTitle.textContent = 'VM Clipboard';
        clipTitle.style.cssText =
            'font-size:11px;font-weight:600;color:#b0b0b8;' +
            'letter-spacing:0.03em;text-transform:uppercase;flex:1;min-width:0;';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close VM Clipboard');
        closeBtn.textContent = '\u00d7';
        closeBtn.style.cssText =
            'margin:0;padding:0 4px;border:none;background:transparent;' +
            'color:#a5a5ad;font:inherit;font-size:16px;line-height:1;cursor:pointer;border-radius:4px;';
        closeBtn.onmouseenter = () => {
            closeBtn.style.color = '#f2f2f2';
        };
        closeBtn.onmouseleave = () => {
            closeBtn.style.color = '#a5a5ad';
        };

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
            b.style.cssText =
                'flex:1;margin:0;padding:6px 8px;border-radius:6px;' +
                'border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);' +
                'color:#f2f2f2;font:inherit;font-size:11px;font-weight:500;cursor:pointer;';
            b.onmouseenter = () => {
                if (!b._fosClipResetTimeout) {
                    b.style.background = 'rgba(255,255,255,0.14)';
                }
            };
            b.onmouseleave = () => {
                if (!b._fosClipResetTimeout) {
                    b.style.background = FOS_CLIP_BTN_BG;
                }
            };
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
        if (!rec || !rec.latchReady || !rec.envKey || !rec.isFosDesktop) {
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
        let originHostname = '';
        try {
            originHostname = new URL(event.origin).hostname;
        } catch (_e) {
            return;
        }
        if (!FOS_ENV_HOST_PATTERN.test(originHostname)) {
            return;
        }
        if (!event.data || event.data.ok !== true) {
            Logger.warn('embedded ack rejected from ' + originHostname);
            return;
        }
        const instanceId = fosInstanceIdFromHostname(originHostname);
        if (!instanceId) {
            return;
        }
        const rec = state.fosInstances.get(instanceId);
        const child =
            (rec && rec.child && rec.child.source === event.source && rec.child) ||
            { source: event.source, origin: event.origin };
        if (rec) {
            rec.child = child;
        }
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
            if (!event.data || typeof event.data.type !== 'string') {
                return;
            }
            const type = event.data.type;
            if (type !== FOS_PUSH_RESULT_TYPE && type !== FOS_EXTRACT_RESULT_TYPE) {
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
            const requestId = event.data.requestId;
            if (!requestId || !state.pendingRequests.has(requestId)) {
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
