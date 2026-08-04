// fos-embedded-watcher.js
// Parent-page watcher: detects FOS env instances via orchestrator + latch, authorizes embedded
// iframe clipboard bridge, and hosts VM Clipboard UI (system clipboard I/O stays on the parent).

const FOS_ENV_HOST_PATTERN = /\.env\.[^.]+(?:\.[^.]+)*\.fleetai\.com$/;
const FOS_ORCHESTRATOR_INSTANCES_URL = 'https://orchestrator.fleetai.com/v1/env/instances';
const FOS_CHILD_READY_TYPE = 'fleet-fos-child-ready';
const FOS_EMBEDDED_READY_TYPE = 'fleet-fos-embedded-ready';
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
        'Detects embedded FOS env instances, signals the iframe child, and hosts parent-side VM Clipboard controls',
    _version: '1.3',
    phase: 'core',
    enabledByDefault: true,
    initialState: {
        fosInstances: null,
        pendingChildren: null,
        clipboardPanels: null,
        pendingRequests: null,
        messageListenerInstalled: false,
        resultListenerInstalled: false,
        iframeObserverInstalled: false,
        layoutListenersInstalled: false,
        activationLogged: false,
        clipboardPatchedLogged: false,
        panelMountedLogged: false
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
        this._subscribeOrchestrator(state);
        this._subscribeLatch(state);
        this._listenChildReady(state);
        this._listenClipboardResults(state);
        this._watchEnvIframes(state);
        this._installLayoutListeners(state);
        Logger.debug('fosEmbeddedWatcher: parent watchers registered');
    },

    _ensureInstance(state, instanceId) {
        if (!state.fosInstances.has(instanceId)) {
            state.fosInstances.set(instanceId, {
                envKey: null,
                latchReady: false,
                child: null
            });
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
        return iframe;
    },

    _scanEnvIframes(state) {
        const frames = document.querySelectorAll('iframe');
        for (let i = 0; i < frames.length; i++) {
            this._patchIframeClipboardAllow(state, frames[i]);
        }
        this._repositionAllPanels(state);
        this._pruneMissingPanels(state);
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
            self._pruneMissingPanels(state);
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

    _pruneMissingPanels(state) {
        const toRemove = [];
        state.clipboardPanels.forEach((entry, instanceId) => {
            if (!entry || !entry.iframe || !entry.iframe.isConnected) {
                toRemove.push(instanceId);
            }
        });
        toRemove.forEach((id) => {
            this._teardownPanel(state, id);
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
        Logger.debug('fosEmbeddedWatcher: VM Clipboard panel removed for ' + instanceId);
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
            const entry = state.clipboardPanels.get(instanceId);
            if (!entry || !entry.child || !entry.child.source) {
                fosFlashBtn(bOverwrite, false);
                Logger.warn('fosEmbeddedWatcher: overwrite failed — child missing for ' + instanceId);
                return;
            }
            const requestId = fosNextRequestId();
            const readPromise = (async () => {
                try {
                    return await navigator.clipboard.readText();
                } catch (e) {
                    Logger.warn('fosEmbeddedWatcher: overwrite failed — could not read system clipboard', e);
                    return null;
                }
            })();
            readPromise
                .then(async (text) => {
                    if (text == null) {
                        fosFlashBtn(bOverwrite, false);
                        return;
                    }
                    const resultPromise = self._waitForChildResult(state, requestId, 8000);
                    try {
                        entry.child.source.postMessage(
                            { type: FOS_PUSH_TYPE, text: String(text), requestId },
                            entry.child.origin || '*'
                        );
                    } catch (ePost) {
                        state.pendingRequests.delete(requestId);
                        fosFlashBtn(bOverwrite, false);
                        Logger.warn('fosEmbeddedWatcher: push postMessage failed', ePost);
                        return;
                    }
                    const result = await resultPromise;
                    fosFlashBtn(bOverwrite, !!(result && result.ok));
                    if (result && result.ok) {
                        Logger.log('fosEmbeddedWatcher: overwrite ok for ' + instanceId);
                    } else {
                        Logger.warn('fosEmbeddedWatcher: overwrite failed for ' + instanceId);
                    }
                })
                .catch(() => {
                    fosFlashBtn(bOverwrite, false);
                });
        });

        bExtract.addEventListener('click', () => {
            const entry = state.clipboardPanels.get(instanceId);
            if (!entry || !entry.child || !entry.child.source) {
                fosFlashBtn(bExtract, false);
                Logger.warn('fosEmbeddedWatcher: extract failed — child missing for ' + instanceId);
                return;
            }
            const requestId = fosNextRequestId();
            const resultPromise = self._waitForChildResult(state, requestId, 8000);
            try {
                entry.child.source.postMessage(
                    { type: FOS_EXTRACT_REQ_TYPE, requestId },
                    entry.child.origin || '*'
                );
            } catch (ePost) {
                state.pendingRequests.delete(requestId);
                fosFlashBtn(bExtract, false);
                Logger.warn('fosEmbeddedWatcher: extract postMessage failed', ePost);
                return;
            }
            resultPromise
                .then(async (result) => {
                    if (!result || !result.ok || typeof result.text !== 'string' || !result.text) {
                        fosFlashBtn(bExtract, false);
                        Logger.warn('fosEmbeddedWatcher: extract failed for ' + instanceId);
                        return;
                    }
                    try {
                        await navigator.clipboard.writeText(result.text);
                        fosFlashBtn(bExtract, true);
                        Logger.log('fosEmbeddedWatcher: extract ok for ' + instanceId);
                    } catch (eWrite) {
                        fosFlashBtn(bExtract, false);
                        Logger.warn(
                            'fosEmbeddedWatcher: extract failed — could not write system clipboard',
                            eWrite
                        );
                    }
                })
                .catch(() => {
                    fosFlashBtn(bExtract, false);
                });
        });

        closeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            self._teardownPanel(state, instanceId);
            Logger.log('fosEmbeddedWatcher: VM Clipboard panel dismissed for ' + instanceId);
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
        // Keep userMoved in sync for reposition skip
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
            Logger.log('fosEmbeddedWatcher: mounted parent VM Clipboard for ' + instanceId);
        } else {
            Logger.debug('fosEmbeddedWatcher: mounted VM Clipboard for ' + instanceId);
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
                this._mountClipboardPanel(state, instanceId, child, iframe);
            }
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
            Logger.debug('fosEmbeddedWatcher: child-ready from ' + instanceId);
            if (!self._tryNotifyChild(state, instanceId, child)) {
                state.pendingChildren.set(instanceId, child);
                Logger.debug('fosEmbeddedWatcher: child queued pending latch for ' + instanceId);
            }
        });
    }
};
