// ============= env-helper.js (library) =============
// External Env Helper for non-VNC external env pages (no-vnc when #noVNC_clipboard_text is absent).
// Floating modal: Prompt (from qa-comp-use cache) + scratchpad. No clipboard / RFB bridging.

const ROOT_ID = 'fleet-env-helper';
const TAB_ID = 'fleet-env-helper-tab';
const Z_INDEX = '2147483646';
const SHOW_PANEL_SUBOPTION_ID = 'show-panel';
const FORCE_DARK_SUBOPTION_ID = 'force-dark-mode';
const NOVNC_CLIPBOARD_ID = 'noVNC_clipboard_text';
/** Shared with vnc-helper / vnc-prompt-writer so QA prompt cache fills External Env Helper too. */
const PROMPT_STORAGE_KEY = 'vnc-helper-prompt';
const PROMPT_TS_STORAGE_KEY = 'vnc-helper-prompt-ts';
/** 'qa' | 'non-qa' — host sets from last Fleet archetype; helpers only prefill when 'qa'. */
const PROMPT_CONTEXT_STORAGE_KEY = 'vnc-helper-prompt-context';
const PROMPT_TTL_MS = 2 * 60 * 60 * 1000;
const LINE_HEIGHT_PX = 20;
const DEFAULT_LINES = 2;
const PROMPT_DEFAULT_LINES = 5;
const DEFAULT_MODAL_LEFT = 16;
const DEFAULT_MODAL_TOP = 120;
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
    description: 'Hide the External Env Helper panel',
    enabledByDefault: true
};

const FORCE_DARK_SUBOPTION = {
    id: FORCE_DARK_SUBOPTION_ID,
    name: 'Force dark mode',
    description: 'Overrides Preferred Visual Mode for this helper panel only.',
    enabledByDefault: false
};

const EnvHelperApi = {
    id: 'envHelper',
    name: 'External Env Helper',
    description: 'External Env Helper modal with prompt cache and scratchpad for non-VNC env pages',
    _version: '2.8',
    enabledByDefault: true,
    phase: 'mutation',
    subOptions: [SHOW_PANEL_SUBOPTION, FORCE_DARK_SUBOPTION],
    initialState: {
        panelStarted: false,
        waitObserverAttached: false,
        waitObserver: null,
        minimized: true
    },

    isPanelEnabled() {
        return Storage.getSubOptionEnabled(this.id, SHOW_PANEL_SUBOPTION_ID, true);
    },

    isForceDarkEnabled() {
        return Storage.getSubOptionEnabled(this.id, FORCE_DARK_SUBOPTION_ID, false);
    },

    helperChromeColors() {
        const forceDark = this.isForceDarkEnabled();
        const ui = Context.uiLib;
        const preferredDark = !!(ui && typeof ui.isFleetDark === 'function' && ui.isFleetDark());
        const dark = forceDark || preferredDark;
        if (!forceDark && ui && typeof ui.chromeColors === 'function') {
            const c = ui.chromeColors();
            return {
                bg: c.bg,
                fg: c.fg,
                border: c.border,
                headerBg: c.hover || c.card,
                inputBg: c.bg,
                dark: preferredDark,
                fromPreferred: true
            };
        }
        if (dark) {
            return {
                bg: '#1c1c1e',
                fg: '#e5e7eb',
                border: '#3f3f46',
                headerBg: 'rgba(255,255,255,0.06)',
                inputBg: '#121212',
                dark: true,
                fromPreferred: false
            };
        }
        return {
            bg: '#ffffff',
            fg: '#0f172a',
            border: '#e2e8f0',
            headerBg: '#f1f5f9',
            inputBg: '#ffffff',
            dark: false,
            fromPreferred: false
        };
    },

    ensurePreferredThemeSubscription() {
        if (this._preferredThemeUnsub) return;
        const ui = Context.uiLib;
        if (!ui || typeof ui.onThemeChange !== 'function') return;
        this._preferredThemeUnsub = ui.onThemeChange(() => {
            this.applyHelperChromeToMounted();
        });
    },

    applyHelperChrome(root, chip) {
        this.ensurePreferredThemeSubscription();
        const forceDark = this.isForceDarkEnabled();
        const c = this.helperChromeColors();
        const theme = c.dark ? 'dark' : 'light';
        if (!forceDark && c.fromPreferred) {
            const clearInline = (el) => {
                if (!el) return;
                el.style.background = '';
                el.style.color = '';
                el.style.border = '';
                el.style.borderRadius = '';
                el.style.boxShadow = '';
                el.style.borderBottom = '';
            };
            if (root) {
                root.dataset.fleetHelperTheme = theme;
                clearInline(root);
                const header = root.querySelector('.fleet-ui-panel__header') || root.firstElementChild;
                clearInline(header);
                root.querySelectorAll('textarea, input, button').forEach(clearInline);
            }
            if (chip) {
                chip.dataset.fleetHelperTheme = theme;
                clearInline(chip);
                chip.querySelectorAll('button').forEach(clearInline);
            }
            return;
        }
        const shadow = c.dark
            ? '0 12px 40px rgba(0,0,0,0.55)'
            : '0 12px 40px rgba(15,23,42,0.18)';
        if (root) {
            root.dataset.fleetHelperTheme = theme;
            root.style.background = c.bg;
            root.style.color = c.fg;
            root.style.border = '1px solid ' + c.border;
            root.style.borderRadius = '10px';
            root.style.boxShadow = shadow;
            const header = root.querySelector('.fleet-ui-panel__header') || root.firstElementChild;
            if (header) {
                header.style.background = c.headerBg;
                header.style.borderBottom = '1px solid ' + c.border;
                header.style.color = c.fg;
            }
            root.querySelectorAll('textarea, input').forEach((el) => {
                el.style.background = c.inputBg;
                el.style.color = c.fg;
                el.style.border = '1px solid ' + c.border;
            });
            root.querySelectorAll('button').forEach((el) => {
                if (!el.style.background || el.style.background === 'transparent' || el.style.background === '') {
                    el.style.background = c.bg;
                }
                el.style.color = c.fg;
                if (!el.style.border || el.style.border === 'none') {
                    el.style.border = '1px solid ' + c.border;
                }
            });
        }
        if (chip) {
            chip.dataset.fleetHelperTheme = theme;
            chip.style.background = '';
            chip.style.boxShadow = '';
            chip.style.color = c.fg;
            chip.style.border = '1px solid ' + c.border;
            chip.style.borderRadius = '10px';
            chip.querySelectorAll('button').forEach((el) => {
                el.style.background = 'transparent';
                el.style.color = c.fg;
            });
        }
    },

    applyHelperChromeToMounted() {
        this.applyHelperChrome(
            document.getElementById(ROOT_ID),
            document.getElementById(TAB_ID)
        );
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

    clearSavedLayout() {
        Storage.delete(LAYOUT_STORAGE_KEYS.left);
        Storage.delete(LAYOUT_STORAGE_KEYS.top);
        Storage.delete(LAYOUT_STORAGE_KEYS.width);
        Storage.delete(LAYOUT_STORAGE_KEYS.height);
    },

    applyDefaultLayout(root) {
        if (!root) {
            return;
        }
        root.style.left = `${DEFAULT_MODAL_LEFT}px`;
        root.style.top = `${DEFAULT_MODAL_TOP}px`;
        root.style.width = `${DEFAULT_MODAL_WIDTH}px`;
        root.style.height = `${DEFAULT_MODAL_HEIGHT}px`;
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
        const pc = (Context.uiLib && Context.uiLib.PANEL_CLASSES) || {};
        btn.className = pc.ghostBtn || '';
        return btn;
    },

    /**
     * Inverse of External VNC Helper: start when noVNC clipboard is absent; tear down if it appears later.
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
                    Logger.log('noVNC clipboard appeared — tearing down External Env Helper');
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
            Logger.debug('watching for non-VNC page (no #noVNC_clipboard_text)');
        }
    },

    readCachedPrompt() {
        try {
            const context = Storage.get(PROMPT_CONTEXT_STORAGE_KEY, '');
            if (context !== 'qa') {
                Logger.debug(
                    `envHelper: skipping cached prompt (context=${context || 'unset'}; last page was not QA)`
                );
                return '';
            }
            const text = Storage.get(PROMPT_STORAGE_KEY, '');
            const tsRaw = Storage.get(PROMPT_TS_STORAGE_KEY, '');
            if (!text || !tsRaw) {
                Logger.debug('no cached prompt in storage');
                return '';
            }
            const ts = parseInt(tsRaw, 10);
            if (Number.isNaN(ts) || Date.now() - ts > PROMPT_TTL_MS) {
                Storage.delete(PROMPT_STORAGE_KEY);
                Storage.delete(PROMPT_TS_STORAGE_KEY);
                Logger.debug('cached prompt expired, cleared');
                return '';
            }
            Logger.debug(`loaded cached prompt (${text.length} chars)`);
            return text;
        } catch (e) {
            Logger.warn('failed to read cached prompt', e);
            return '';
        }
    },

    textareaHeightForLines(lineCount) {
        const lines = Math.max(DEFAULT_LINES, lineCount);
        return `${lines * LINE_HEIGHT_PX + 16}px`;
    },

    applyPromptTextareaSizing(textarea, promptText) {
        const initialLines = promptText ? PROMPT_DEFAULT_LINES : DEFAULT_LINES;
        const pc = (Context.uiLib && Context.uiLib.PANEL_CLASSES) || {};
        textarea.className = pc.textarea || '';
        textarea.style.height = this.textareaHeightForLines(initialLines);
        textarea.style.minHeight = this.textareaHeightForLines(DEFAULT_LINES);
        textarea.style.lineHeight = `${LINE_HEIGHT_PX}px`;
    },

    applyScratchpadTextareaSizing(textarea) {
        const pc = (Context.uiLib && Context.uiLib.PANEL_CLASSES) || {};
        textarea.className = pc.textarea || '';
        textarea.style.height = this.textareaHeightForLines(DEFAULT_LINES);
        textarea.style.minHeight = this.textareaHeightForLines(DEFAULT_LINES);
        textarea.style.lineHeight = `${LINE_HEIGHT_PX}px`;
    },

    makeSectionHeader(label, onToggle, trailingEl) {
        const header = document.createElement('div');
        const pc = (Context.uiLib && Context.uiLib.PANEL_CLASSES) || {};
        header.className = pc.sectionLabel || '';
        header.style.cssText =
            'display:flex;align-items:center;gap:6px;padding:8px 12px 4px 12px;';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = '▼';
        toggleBtn.setAttribute('aria-label', `Toggle ${label} section`);
        toggleBtn.className = pc.muted || '';
        toggleBtn.style.cssText =
            'margin:0;padding:0 4px;border:none;background:transparent;font:inherit;font-size:11px;cursor:pointer;line-height:1;color:inherit;';

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
            Logger.log(`${label} section ${collapsed ? 'hidden' : 'shown'}`);
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
                Logger.warn('error disconnecting wait observer', eDisc);
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
            Logger.log('noVNC clipboard appeared after start — tearing down');
            self.destroy(state);
            self.installWaitObserver(state);
        });
        handoffObserver.observe(handoffTarget, { childList: true, subtree: true });
        CleanupRegistry.registerObserver(handoffObserver);
        state.waitObserver = handoffObserver;
        state.waitObserverAttached = true;

        state.panelStarted = true;
        Logger.debug('non-VNC env page detected, initialising External Env Helper');

        const oldRoot = document.getElementById(ROOT_ID);
        const oldTab = document.getElementById(TAB_ID);
        if (oldRoot || oldTab) {
            if (window.__fleetEnvHelperTeardown) {
                try {
                    window.__fleetEnvHelperTeardown();
                } catch (e4) {
                    Logger.warn('prior teardown failed', e4);
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

        /** Persistent tab: stays mounted while the modal is open or minimized. */
        const ensureRestoreTab = () => {
            if (restoreTab) {
                return;
            }
            if (Context.uiLib && typeof Context.uiLib.ensurePanelStyles === 'function') {
                Context.uiLib.ensurePanelStyles();
            }
            const pc = (Context.uiLib && Context.uiLib.PANEL_CLASSES) || {};
            restoreTab = document.createElement('div');
            restoreTab.id = TAB_ID;
            restoreTab.className = pc.chip || '';
            restoreTab.style.cssText =
                'position:fixed;left:20px;bottom:124px;z-index:2147483646;';

            const openBtn = document.createElement('button');
            openBtn.type = 'button';
            openBtn.textContent = 'Helper';
            openBtn.setAttribute('aria-label', 'Toggle Helper');
            openBtn.addEventListener('click', () => {
                if (!root) {
                    return;
                }
                if (root.style.display === 'none') {
                    root.style.display = '';
                    state.minimized = false;
                    Logger.log('modal restored from minimized tab');
                } else {
                    minimizeModal();
                }
            });

            const refreshBtn = document.createElement('button');
            refreshBtn.type = 'button';
            const refreshGlyph = document.createElement('span');
            refreshGlyph.textContent = '\u21BB';
            refreshGlyph.style.cssText = 'display:inline-block;transform:rotate(90deg);';
            refreshBtn.appendChild(refreshGlyph);
            refreshBtn.setAttribute('aria-label', 'Reset Helper to default position');
            refreshBtn.title = 'Reset to default position';
            refreshBtn.className = pc.chipSep || '';
            refreshBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (!root) {
                    return;
                }
                self.clearSavedLayout();
                self.applyDefaultLayout(root);
                root.style.display = '';
                state.minimized = false;
                Logger.log('modal reset to default position');
            });

            restoreTab.appendChild(openBtn);
            restoreTab.appendChild(refreshBtn);
            document.body.appendChild(restoreTab);
            self.applyHelperChrome(root, restoreTab);
        };

        const minimizeModal = () => {
            if (!root) {
                return;
            }
            root.style.display = 'none';
            state.minimized = true;
            ensureRestoreTab();
            Logger.log('modal minimized');
        };

        if (showPanel) {
            if (Context.uiLib && typeof Context.uiLib.ensurePanelStyles === 'function') {
                Context.uiLib.ensurePanelStyles();
            }
            const pc = (Context.uiLib && Context.uiLib.PANEL_CLASSES) || {};
            const savedLayout = this.loadSavedLayout();
            root = document.createElement('div');
            root.id = ROOT_ID;
            root.className = pc.root || '';
            root.style.cssText = `position:fixed;left:${savedLayout.left ?? DEFAULT_MODAL_LEFT}px;top:${savedLayout.top ?? DEFAULT_MODAL_TOP}px;width:${savedLayout.width}px;height:${savedLayout.height}px;min-width:${MIN_MODAL_WIDTH}px;min-height:${MIN_MODAL_HEIGHT}px;display:flex;flex-direction:column;z-index:${Z_INDEX};user-select:none;`;

            const headerEl = document.createElement('div');
            headerEl.className = pc.header || '';
            const headerTitle = document.createElement('div');
            headerTitle.textContent = 'Helper';
            headerTitle.className = pc.title || '';
            headerTitle.style.cursor = 'grab';
            headerTitle.style.padding = '2px 0';
            const minimizeBtn = document.createElement('button');
            minimizeBtn.type = 'button';
            minimizeBtn.textContent = 'Minimize';
            minimizeBtn.setAttribute('aria-label', 'Minimize External Env Helper');
            minimizeBtn.className = pc.btn || '';
            minimizeBtn.style.flexShrink = '0';
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
            if (Context.promptTextCounter && typeof Context.promptTextCounter.attach === 'function') {
                Context.promptTextCounter.attach(promptTextarea, { mountParent: promptBody });
            }

            let resetPromptBtn = null;
            if (cachedPrompt) {
                resetPromptBtn = this.makeSmallHeaderButton('Reset', 'Reset prompt to page-load state');
                resetPromptBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    promptTextarea.value = initialPromptText;
                    this.applyPromptTextareaSizing(promptTextarea, initialPromptText);
                    promptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                    Logger.log('prompt reset to page-load state');
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
            resizeHandle.setAttribute('aria-label', 'Resize External Env Helper');
            resizeHandle.className = pc.resize || '';

            root.appendChild(headerEl);
            root.appendChild(bodyEl);
            root.appendChild(resizeHandle);
            document.body.appendChild(root);
            self.applyHelperChrome(root, null);

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
                    Logger.debug(`modal moved to ${Math.round(rect.left)},${Math.round(rect.top)}`);
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
                    Logger.debug(`modal resized to ${Math.round(rect.width)}×${Math.round(rect.height)}`);
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
            minimizeModal();
            Logger.log('modal active (starts minimized)');
            toast('External Env Helper ready — open from the tab.');
        } else {
            Logger.debug('panel hidden via settings');
        }
    },

    run(state) {
        if (state.panelStarted) {
            this.applyHelperChromeToMounted();
            return;
        }
        this.installWaitObserver(state);
    },

    destroy(state) {
        if (state.waitObserver) {
            try {
                state.waitObserver.disconnect();
            } catch (e) {
                Logger.warn('wait observer disconnect in destroy', e);
            }
            state.waitObserver = null;
        }
        if (typeof window.__fleetEnvHelperTeardown === 'function') {
            try {
                window.__fleetEnvHelperTeardown();
            } catch (eTeardown) {
                Logger.error('teardown failed', eTeardown);
            }
            window.__fleetEnvHelperTeardown = undefined;
        }
        state.waitObserverAttached = false;
        state.panelStarted = false;
        state.minimized = false;
        Logger.log('destroyed');
    }
};

const plugin = {
    id: 'envHelperLib',
    name: 'External Env Helper (library)',
    description: 'Shared External Env Helper panel for non-VNC env pages',
    _version: '2.8',
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
    if (Context.uiLib && typeof Context.uiLib.ensurePanelStyles === 'function') {
        Context.uiLib.ensurePanelStyles();
    }
    const pc = (Context.uiLib && Context.uiLib.PANEL_CLASSES) || {};
    const d = document.createElement('div');
    d.textContent = message;
    d.className = pc.toast || '';
    d.style.cssText = `position:fixed;top:12px;right:12px;z-index:${Z_INDEX};`;
    document.body.appendChild(d);
    setTimeout(() => {
        d.remove();
    }, 2200);
}
