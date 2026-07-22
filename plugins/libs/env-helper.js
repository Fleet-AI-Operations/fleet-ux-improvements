// ============= env-helper.js (library) =============
// Env Helper for non-VNC external env pages (no-vnc archetype when #noVNC_clipboard_text is absent).
// Floating modal: Prompt (from qa-comp-use cache) + scratchpad. No clipboard / RFB bridging.

const ROOT_ID = 'fleet-env-helper';
const TAB_ID = 'fleet-env-helper-tab';
const Z_INDEX = '2147483646';
const SHOW_PANEL_SUBOPTION_ID = 'show-panel';
const NOVNC_CLIPBOARD_ID = 'noVNC_clipboard_text';
/** Shared with vnc-helper / vnc-prompt-writer so QA prompt cache fills Env Helper too. */
const PROMPT_STORAGE_KEY = 'vnc-helper-prompt';
const PROMPT_TS_STORAGE_KEY = 'vnc-helper-prompt-ts';
const PROMPT_TTL_MS = 2 * 60 * 60 * 1000;
const LINE_HEIGHT_PX = 20;
const DEFAULT_LINES = 2;
const PROMPT_DEFAULT_LINES = 5;
const DEFAULT_MODAL_WIDTH = 320;
const DEFAULT_MODAL_HEIGHT = 360;
const MIN_MODAL_WIDTH = 260;
const MIN_MODAL_HEIGHT = 180;

const LAYOUT_STORAGE_KEYS = {
    left: 'env-helper-layout-left',
    top: 'env-helper-layout-top',
    width: 'env-helper-layout-width',
    height: 'env-helper-layout-height'
};

const SHOW_PANEL_SUBOPTION = {
    id: SHOW_PANEL_SUBOPTION_ID,
    name: 'Show panel',
    description: 'When off, hides the Env Helper modal.',
    enabledByDefault: true
};

const EnvHelperApi = {
    id: 'envHelper',
    name: 'Env Helper',
    description: 'Env Helper modal with prompt cache and scratchpad for non-VNC env pages',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    subOptions: [SHOW_PANEL_SUBOPTION],
    initialState: {
        panelStarted: false,
        waitObserverAttached: false,
        waitObserver: null,
        minimized: false
    },

    isPanelEnabled() {
        return Storage.getSubOptionEnabled(this.id, SHOW_PANEL_SUBOPTION_ID, true);
    },

    hasNovncClipboard() {
        return !!document.getElementById(NOVNC_CLIPBOARD_ID);
    },

    loadSavedLayout() {
        return {
            left: Storage.get(LAYOUT_STORAGE_KEYS.left, null),
            top: Storage.get(LAYOUT_STORAGE_KEYS.top, null),
            width: Storage.get(LAYOUT_STORAGE_KEYS.width, DEFAULT_MODAL_WIDTH),
            height: Storage.get(LAYOUT_STORAGE_KEYS.height, DEFAULT_MODAL_HEIGHT)
        };
    },

    saveLayout(root) {
        if (!root) {
            return;
        }
        const rect = root.getBoundingClientRect();
        Storage.set(LAYOUT_STORAGE_KEYS.left, rect.left);
        Storage.set(LAYOUT_STORAGE_KEYS.top, rect.top);
        Storage.set(LAYOUT_STORAGE_KEYS.width, rect.width);
        Storage.set(LAYOUT_STORAGE_KEYS.height, rect.height);
    },

    makeSmallHeaderButton(label, ariaLabel) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.setAttribute('aria-label', ariaLabel);
        btn.style.cssText =
            'margin:0;padding:2px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#d0d0d8;font:inherit;font-size:10px;font-weight:500;cursor:pointer;';
        btn.onmouseenter = () => {
            btn.style.background = 'rgba(255,255,255,0.14)';
        };
        btn.onmouseleave = () => {
            btn.style.background = 'rgba(255,255,255,0.08)';
        };
        return btn;
    },

    /**
     * Inverse of VNC Helper: start when noVNC clipboard is absent; tear down if it appears later.
     */
    installWaitObserver(state) {
        if (state.waitObserverAttached) {
            return;
        }
        state.waitObserverAttached = true;

        const self = this;
        const sync = () => {
            if (self.hasNovncClipboard()) {
                if (state.panelStarted) {
                    Logger.log('envHelper: noVNC clipboard appeared — tearing down Env Helper');
                    self.destroy(state);
                    self.installWaitObserver(state);
                }
                return;
            }
            if (!document.body) {
                return;
            }
            if (state.panelStarted) {
                return;
            }
            self.startPanel(state);
        };

        sync();

        const target = document.body || document.documentElement;
        const observer = new MutationObserver(() => {
            sync();
        });
        observer.observe(target, { childList: true, subtree: true });
        CleanupRegistry.registerObserver(observer);
        state.waitObserver = observer;
        if (!state.panelStarted) {
            Logger.log('envHelper: watching for non-VNC page (no #noVNC_clipboard_text)');
        }
    },

    readCachedPrompt() {
        try {
            const text = Storage.get(PROMPT_STORAGE_KEY, '');
            const tsRaw = Storage.get(PROMPT_TS_STORAGE_KEY, '');
            if (!text || !tsRaw) {
                Logger.log('envHelper: no cached prompt in storage');
                return '';
            }
            const ts = parseInt(tsRaw, 10);
            if (Number.isNaN(ts) || Date.now() - ts > PROMPT_TTL_MS) {
                Storage.delete(PROMPT_STORAGE_KEY);
                Storage.delete(PROMPT_TS_STORAGE_KEY);
                Logger.log('envHelper: cached prompt expired, cleared');
                return '';
            }
            Logger.log(`envHelper: loaded cached prompt (${text.length} chars)`);
            return text;
        } catch (e) {
            Logger.warn('envHelper: failed to read cached prompt', e);
            return '';
        }
    },

    textareaHeightForLines(lineCount) {
        const lines = Math.max(DEFAULT_LINES, lineCount);
        return `${lines * LINE_HEIGHT_PX + 16}px`;
    },

    applyPromptTextareaSizing(textarea, promptText) {
        const initialLines = promptText ? PROMPT_DEFAULT_LINES : DEFAULT_LINES;
        textarea.style.height = this.textareaHeightForLines(initialLines);
        textarea.style.minHeight = this.textareaHeightForLines(DEFAULT_LINES);
        textarea.style.overflowY = 'auto';
        textarea.style.resize = 'vertical';
        textarea.style.boxSizing = 'border-box';
        textarea.style.width = '100%';
        textarea.style.padding = '8px';
        textarea.style.borderRadius = '6px';
        textarea.style.border = '1px solid rgba(255,255,255,0.15)';
        textarea.style.background = 'rgba(0,0,0,0.25)';
        textarea.style.color = '#f2f2f2';
        textarea.style.font = 'inherit';
        textarea.style.lineHeight = `${LINE_HEIGHT_PX}px`;
    },

    applyScratchpadTextareaSizing(textarea) {
        textarea.style.height = this.textareaHeightForLines(DEFAULT_LINES);
        textarea.style.minHeight = this.textareaHeightForLines(DEFAULT_LINES);
        textarea.style.overflowY = 'auto';
        textarea.style.resize = 'vertical';
        textarea.style.boxSizing = 'border-box';
        textarea.style.width = '100%';
        textarea.style.padding = '8px';
        textarea.style.borderRadius = '6px';
        textarea.style.border = '1px solid rgba(255,255,255,0.15)';
        textarea.style.background = 'rgba(0,0,0,0.25)';
        textarea.style.color = '#f2f2f2';
        textarea.style.font = 'inherit';
        textarea.style.lineHeight = `${LINE_HEIGHT_PX}px`;
    },

    makeSectionHeader(label, onToggle, trailingEl) {
        const header = document.createElement('div');
        header.style.cssText =
            'display:flex;align-items:center;gap:6px;padding:8px 12px 4px 12px;font-size:11px;font-weight:600;color:#b0b0b8;letter-spacing:0.03em;text-transform:uppercase;user-select:none;';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = '▼';
        toggleBtn.setAttribute('aria-label', `Toggle ${label} section`);
        toggleBtn.style.cssText =
            'margin:0;padding:0 4px;border:none;background:transparent;color:#b0b0b8;font:inherit;font-size:11px;cursor:pointer;line-height:1;';

        const title = document.createElement('span');
        title.textContent = label;
        title.style.flex = '1';

        header.appendChild(toggleBtn);
        header.appendChild(title);
        if (trailingEl) {
            header.appendChild(trailingEl);
        }

        let collapsed = false;
        toggleBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            collapsed = !collapsed;
            toggleBtn.textContent = collapsed ? '▶' : '▼';
            onToggle(collapsed);
            Logger.log(`envHelper: ${label} section ${collapsed ? 'hidden' : 'shown'}`);
        });

        return {
            header,
            setCollapsed: (next) => {
                collapsed = next;
                toggleBtn.textContent = collapsed ? '▶' : '▼';
                onToggle(collapsed);
            }
        };
    },

    startPanel(state) {
        if (state.panelStarted) {
            return;
        }
        if (this.hasNovncClipboard()) {
            return;
        }

        if (state.waitObserver) {
            try {
                state.waitObserver.disconnect();
            } catch (eDisc) {
                Logger.warn('envHelper: error disconnecting wait observer', eDisc);
            }
            state.waitObserver = null;
        }

        // Keep watching so we tear down if noVNC appears later on a slow load.
        const self = this;
        const handoffTarget = document.body || document.documentElement;
        const handoffObserver = new MutationObserver(() => {
            if (!self.hasNovncClipboard()) {
                return;
            }
            Logger.log('envHelper: noVNC clipboard appeared after start — tearing down');
            self.destroy(state);
            self.installWaitObserver(state);
        });
        handoffObserver.observe(handoffTarget, { childList: true, subtree: true });
        CleanupRegistry.registerObserver(handoffObserver);
        state.waitObserver = handoffObserver;
        state.waitObserverAttached = true;

        state.panelStarted = true;
        Logger.log('envHelper: non-VNC env page detected, initialising Env Helper');

        const oldRoot = document.getElementById(ROOT_ID);
        const oldTab = document.getElementById(TAB_ID);
        if (oldRoot || oldTab) {
            if (window.__fleetEnvHelperTeardown) {
                try {
                    window.__fleetEnvHelperTeardown();
                } catch (e4) {
                    Logger.warn('envHelper: prior teardown failed', e4);
                }
            }
            if (oldRoot) {
                oldRoot.remove();
            }
            if (oldTab) {
                oldTab.remove();
            }
        }

        const showPanel = this.isPanelEnabled();
        let root = null;
        let restoreTab = null;
        let onMove = () => {};
        let onUp = () => {};
        let onResizeMove = () => {};
        let onResizeUp = () => {};

        const minimizeModal = () => {
            if (!root) {
                return;
            }
            root.style.display = 'none';
            state.minimized = true;
            if (!restoreTab) {
                restoreTab = document.createElement('button');
                restoreTab.id = TAB_ID;
                restoreTab.type = 'button';
                restoreTab.textContent = 'Env Helper';
                restoreTab.setAttribute('aria-label', 'Restore Env Helper');
                restoreTab.style.cssText =
                    'position:fixed;left:20px;bottom:124px;z-index:2147483646;padding:6px 10px;font-size:12px;border-radius:10px;border:1px solid rgba(0,0,0,0.2);background:#111827;color:#f9fafb;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,0.35);';
                restoreTab.addEventListener('click', () => {
                    if (root) {
                        root.style.display = '';
                    }
                    if (restoreTab && restoreTab.parentNode) {
                        restoreTab.parentNode.removeChild(restoreTab);
                    }
                    restoreTab = null;
                    state.minimized = false;
                    Logger.log('envHelper: modal restored from minimized tab');
                });
                document.body.appendChild(restoreTab);
            }
            Logger.log('envHelper: modal minimized');
        };

        if (showPanel) {
            const savedLayout = this.loadSavedLayout();
            root = document.createElement('div');
            root.id = ROOT_ID;
            root.style.cssText = `position:fixed;left:${savedLayout.left ?? 16}px;top:${savedLayout.top ?? 120}px;width:${savedLayout.width}px;height:${savedLayout.height}px;min-width:${MIN_MODAL_WIDTH}px;min-height:${MIN_MODAL_HEIGHT}px;display:flex;flex-direction:column;z-index:${Z_INDEX};font:13px/1.45 system-ui,Segoe UI,sans-serif;color:#e8e8e8;background:linear-gradient(160deg,#1e1e24 0%,#121218 100%);border:1px solid rgba(255,255,255,0.12);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.55);overflow:hidden;user-select:none;`;

            const headerEl = document.createElement('div');
            headerEl.style.cssText =
                'display:flex;align-items:center;gap:8px;padding:8px 10px 8px 12px;font-weight:600;font-size:12px;letter-spacing:0.02em;color:#fff;background:rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;';
            const headerTitle = document.createElement('div');
            headerTitle.textContent = 'Env Helper';
            headerTitle.style.cssText =
                'flex:1;min-width:0;cursor:grab;padding:2px 0;font-weight:600;font-size:12px;';
            const minimizeBtn = document.createElement('button');
            minimizeBtn.type = 'button';
            minimizeBtn.textContent = 'Minimize';
            minimizeBtn.setAttribute('aria-label', 'Minimize Env Helper');
            minimizeBtn.style.cssText =
                'flex-shrink:0;margin:0;padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#e8e8e8;font:inherit;font-size:11px;font-weight:500;cursor:pointer;';
            minimizeBtn.onmouseenter = () => {
                minimizeBtn.style.background = 'rgba(255,255,255,0.16)';
            };
            minimizeBtn.onmouseleave = () => {
                minimizeBtn.style.background = 'rgba(255,255,255,0.1)';
            };
            headerEl.appendChild(headerTitle);
            headerEl.appendChild(minimizeBtn);

            const bodyEl = document.createElement('div');
            bodyEl.style.cssText =
                'flex:1;min-height:0;overflow-y:auto;padding:0 0 12px 0;user-select:text;';

            const promptBody = document.createElement('div');
            promptBody.style.cssText = 'padding:0 12px 8px 12px;';
            const promptTextarea = document.createElement('textarea');
            promptTextarea.setAttribute('aria-label', 'Prompt');
            promptTextarea.spellcheck = false;
            const cachedPrompt = this.readCachedPrompt();
            const initialPromptText = cachedPrompt;
            if (cachedPrompt) {
                promptTextarea.value = cachedPrompt;
            }
            this.applyPromptTextareaSizing(promptTextarea, cachedPrompt);
            promptBody.appendChild(promptTextarea);

            let resetPromptBtn = null;
            if (cachedPrompt) {
                resetPromptBtn = this.makeSmallHeaderButton('Reset', 'Reset prompt to page-load state');
                resetPromptBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    promptTextarea.value = initialPromptText;
                    this.applyPromptTextareaSizing(promptTextarea, initialPromptText);
                    Logger.log('envHelper: prompt reset to page-load state');
                });
            }

            const promptSection = this.makeSectionHeader('Prompt', (collapsed) => {
                promptBody.style.display = collapsed ? 'none' : '';
            }, resetPromptBtn);
            bodyEl.appendChild(promptSection.header);
            bodyEl.appendChild(promptBody);

            const scratchBody = document.createElement('div');
            scratchBody.style.cssText = 'padding:0 12px 8px 12px;';
            const scratchTextarea = document.createElement('textarea');
            scratchTextarea.setAttribute('aria-label', 'Scratchpad');
            scratchTextarea.placeholder = 'Scratchpad…';
            scratchTextarea.spellcheck = false;
            this.applyScratchpadTextareaSizing(scratchTextarea);
            scratchBody.appendChild(scratchTextarea);

            const scratchSection = this.makeSectionHeader('Scratchpad', (collapsed) => {
                scratchBody.style.display = collapsed ? 'none' : '';
            });
            bodyEl.appendChild(scratchSection.header);
            bodyEl.appendChild(scratchBody);

            const resizeHandle = document.createElement('div');
            resizeHandle.setAttribute('aria-label', 'Resize Env Helper');
            resizeHandle.style.cssText =
                'position:absolute;right:2px;bottom:2px;width:14px;height:14px;cursor:se-resize;background:transparent;border-right:2px solid rgba(255,255,255,0.25);border-bottom:2px solid rgba(255,255,255,0.25);border-radius:0 0 8px 0;z-index:1;';

            root.appendChild(headerEl);
            root.appendChild(bodyEl);
            root.appendChild(resizeHandle);
            document.body.appendChild(root);

            minimizeBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                onUp();
                minimizeModal();
            });

            let drag = false;
            let resizing = false;
            let ox = 0;
            let oy = 0;
            let resizeStartX = 0;
            let resizeStartY = 0;
            let resizeStartW = 0;
            let resizeStartH = 0;

            onMove = (ev) => {
                if (!drag || !root) {
                    return;
                }
                root.style.left = `${Math.max(0, ev.clientX - ox)}px`;
                root.style.top = `${Math.max(0, ev.clientY - oy)}px`;
            };
            onResizeMove = (ev) => {
                if (!resizing || !root) {
                    return;
                }
                const nextW = Math.max(MIN_MODAL_WIDTH, resizeStartW + (ev.clientX - resizeStartX));
                const nextH = Math.max(MIN_MODAL_HEIGHT, resizeStartH + (ev.clientY - resizeStartY));
                root.style.width = `${nextW}px`;
                root.style.height = `${nextH}px`;
            };
            onUp = () => {
                if (!drag) {
                    return;
                }
                drag = false;
                headerTitle.style.cursor = 'grab';
                document.removeEventListener('mousemove', onMove, true);
                document.removeEventListener('mouseup', onUp, true);
                if (root) {
                    this.saveLayout(root);
                    const rect = root.getBoundingClientRect();
                    Logger.log(`envHelper: modal moved to ${Math.round(rect.left)},${Math.round(rect.top)}`);
                }
            };
            onResizeUp = () => {
                if (!resizing) {
                    return;
                }
                resizing = false;
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', onResizeMove, true);
                document.removeEventListener('mouseup', onResizeUp, true);
                if (root) {
                    this.saveLayout(root);
                    const rect = root.getBoundingClientRect();
                    Logger.log(`envHelper: modal resized to ${Math.round(rect.width)}×${Math.round(rect.height)}`);
                }
            };
            headerTitle.addEventListener('mousedown', (ev) => {
                if (ev.button !== 0) {
                    return;
                }
                drag = true;
                headerTitle.style.cursor = 'grabbing';
                const r = root.getBoundingClientRect();
                ox = ev.clientX - r.left;
                oy = ev.clientY - r.top;
                document.addEventListener('mousemove', onMove, true);
                document.addEventListener('mouseup', onUp, true);
                ev.preventDefault();
            });
            resizeHandle.addEventListener('mousedown', (ev) => {
                if (ev.button !== 0) {
                    return;
                }
                ev.preventDefault();
                ev.stopPropagation();
                resizing = true;
                const r = root.getBoundingClientRect();
                resizeStartX = ev.clientX;
                resizeStartY = ev.clientY;
                resizeStartW = r.width;
                resizeStartH = r.height;
                document.body.style.userSelect = 'none';
                document.addEventListener('mousemove', onResizeMove, true);
                document.addEventListener('mouseup', onResizeUp, true);
            });
        }

        window.__fleetEnvHelperTeardown = () => {
            document.removeEventListener('mousemove', onMove, true);
            document.removeEventListener('mouseup', onUp, true);
            document.removeEventListener('mousemove', onResizeMove, true);
            document.removeEventListener('mouseup', onResizeUp, true);
            document.body.style.userSelect = '';
            if (root && root.parentNode) {
                root.parentNode.removeChild(root);
            }
            if (restoreTab && restoreTab.parentNode) {
                restoreTab.parentNode.removeChild(restoreTab);
            }
            root = null;
            restoreTab = null;
        };

        if (showPanel) {
            Logger.log('envHelper: modal active');
            toast('Env Helper ready — drag title bar, resize corner.');
        } else {
            Logger.log('envHelper: panel hidden via settings');
        }
    },

    run(state) {
        if (state.panelStarted) {
            return;
        }
        this.installWaitObserver(state);
    },

    destroy(state) {
        if (state.waitObserver) {
            try {
                state.waitObserver.disconnect();
            } catch (e) {
                Logger.warn('envHelper: wait observer disconnect in destroy', e);
            }
            state.waitObserver = null;
        }
        if (typeof window.__fleetEnvHelperTeardown === 'function') {
            try {
                window.__fleetEnvHelperTeardown();
            } catch (eTeardown) {
                Logger.error('envHelper: teardown failed', eTeardown);
            }
            window.__fleetEnvHelperTeardown = undefined;
        }
        state.waitObserverAttached = false;
        state.panelStarted = false;
        state.minimized = false;
        Logger.log('envHelper: destroyed');
    }
};

const plugin = {
    id: 'envHelperLib',
    name: 'Env Helper (library)',
    description: 'Shared API for Env Helper panel on non-VNC env pages',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.envHelper = {
            run: (s, options) => {
                const impl = Object.create(EnvHelperApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }
                return EnvHelperApi.run.call(impl, s, options);
            },
            destroy: (s, options) => {
                const impl = Object.create(EnvHelperApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }
                return EnvHelperApi.destroy.call(impl, s);
            }
        };
        if (!state.registered) {
            Logger.log('envHelperLib: module registered (Context.envHelper)');
            state.registered = true;
        }
    }
};

function toast(message) {
    const d = document.createElement('div');
    d.textContent = message;
    d.style.cssText = `position:fixed;top:12px;right:12px;z-index:${Z_INDEX};background:rgba(0,0,0,0.88);color:#fff;font:12px/1.4 system-ui,Segoe UI,sans-serif;padding:10px 12px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.35);max-width:min(420px,92vw);word-break:break-word;white-space:pre-wrap;`;
    document.body.appendChild(d);
    setTimeout(() => {
        d.remove();
    }, 2200);
}
