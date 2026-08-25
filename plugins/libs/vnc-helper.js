// ============= vnc-helper.js (library) =============
// Shared External VNC Helper for no-vnc (external env tabs).
// Modal: Prompt (from qa-comp-use cache), scratchpad, clipboard bridge buttons, and
// ⌘C/⌘V + Ctrl+Shift+C/F shortcuts. Replaces novnc-clipboard-bridge.js.

const ROOT_ID = 'fleet-vnc-helper';
const TAB_ID = 'fleet-vnc-helper-tab';
const Z_INDEX = '2147483646';
const SHOW_PANEL_SUBOPTION_ID = 'show-panel';
const FORCE_DARK_SUBOPTION_ID = 'force-dark-mode';
const NOVNC_CLIPBOARD_ID = 'noVNC_clipboard_text';
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
const DEFAULT_MODAL_HEIGHT = 420;
const MIN_MODAL_WIDTH = 260;
const MIN_MODAL_HEIGHT = 180;

const LAYOUT_STORAGE_KEYS = {
    left: 'vnc-helper-layout-left',
    top: 'vnc-helper-layout-top',
    width: 'vnc-helper-layout-width',
    height: 'vnc-helper-layout-height'
};

const SHOW_PANEL_SUBOPTION = {
    id: SHOW_PANEL_SUBOPTION_ID,
    name: 'Show panel',
    description: 'Hide the External VNC Helper panel (keyboard clipboard shortcuts still work)',
    enabledByDefault: true
};

const FORCE_DARK_SUBOPTION = {
    id: FORCE_DARK_SUBOPTION_ID,
    name: 'Force dark mode',
    description: 'Overrides Preferred Visual Mode for this helper panel only.',
    enabledByDefault: false
};

const VncHelperApi = {
    id: 'vncHelper',
    name: 'External VNC Helper',
    description:
        'External VNC Helper modal with prompt cache, scratchpad, and clipboard bridge for noVNC sessions',
    _version: '3.9',
    enabledByDefault: true,
    phase: 'mutation',
    subOptions: [SHOW_PANEL_SUBOPTION, FORCE_DARK_SUBOPTION],
    initialState: {
        bridgeStarted: false,
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
        // When following Preferred mode (force-dark off), clear inline overpaint so
        // PANEL_CLASSES + data-fleet-ux-theme own the chrome.
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

    makeClipboardHelpDetails() {
        const details = document.createElement('details');
        const pc = (Context.uiLib && Context.uiLib.PANEL_CLASSES) || {};
        details.className = pc.divider || '';
        details.style.cssText = 'margin:10px 0 0 0;padding-top:10px;';

        const summaryEl = document.createElement('summary');
        summaryEl.textContent = 'How this works';
        summaryEl.className = pc.muted || '';
        summaryEl.style.cssText = 'cursor:pointer;font-size:12px;outline:none;user-select:none;';

        const help = document.createElement('div');
        help.className = pc.muted || '';
        help.style.cssText = 'margin-top:10px;font-size:11px;line-height:1.55;user-select:text;';

        function pBlock(strongLabel, rest) {
            const p = document.createElement('p');
            p.style.margin = '0 0 8px 0';
            const s = document.createElement('strong');
            s.className = pc.strong || '';
            s.textContent = strongLabel;
            p.appendChild(s);
            p.appendChild(document.createTextNode(` ${rest}`));
            return p;
        }

        help.appendChild(
            pBlock(
                'Extract',
                'copies the text noVNC currently holds for the virtual machine into this computer\u2019s system clipboard. Use the virtual machine\u2019s normal copy first so that buffer fills, then click Extract.'
            )
        );
        help.appendChild(
            pBlock(
                'Overwrite',
                'takes plain text from this computer\u2019s clipboard and pushes it into noVNC\u2019s virtual machine clipboard buffer. Then use the virtual machine\u2019s normal paste.'
            )
        );
        help.appendChild(
            pBlock(
                'Keyboard',
                '\u2318+C sends Ctrl+C to the virtual machine, then copies noVNC\u2019s buffer to this computer. \u2318+V pushes this computer\u2019s clipboard into the virtual machine and sends Ctrl+V. Ctrl+Shift+F is the same as Overwrite. Ctrl+Shift+C is the same as Extract.'
            )
        );
        const p3 = document.createElement('p');
        p3.style.margin = '0';
        p3.textContent =
            'Always combine these controls with the virtual machine\u2019s native copy/paste: copy in the virtual machine \u2192 Extract (or Ctrl+Shift+C) to the host; copy on the host \u2192 Overwrite (or Ctrl+Shift+F) \u2192 paste in the virtual machine (or \u2318+V).';
        help.appendChild(p3);

        details.appendChild(summaryEl);
        details.appendChild(help);
        return details;
    },

    installWaitObserver(state) {
        if (state.waitObserverAttached) {
            return;
        }
        state.waitObserverAttached = true;

        const self = this;
        const tryStart = () => {
            if (state.bridgeStarted) {
                return;
            }
            if (!document.getElementById(NOVNC_CLIPBOARD_ID)) {
                return;
            }
            self.startBridge(state);
        };

        tryStart();
        if (state.bridgeStarted) {
            return;
        }

        const target = document.body || document.documentElement;
        const observer = new MutationObserver(() => {
            tryStart();
        });
        observer.observe(target, { childList: true, subtree: true });
        CleanupRegistry.registerObserver(observer);
        state.waitObserver = observer;
        Logger.debug('waiting for noVNC clipboard element (MutationObserver)');
    },

    readCachedPrompt() {
        try {
            const context = Storage.get(PROMPT_CONTEXT_STORAGE_KEY, '');
            if (context !== 'qa') {
                Logger.debug(
                    `vncHelper: skipping cached prompt (context=${context || 'unset'}; last page was not QA)`
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

        return { header, setCollapsed: (next) => {
            collapsed = next;
            toggleBtn.textContent = collapsed ? '▶' : '▼';
            onToggle(collapsed);
        } };
    },

    startBridge(state) {
        if (state.bridgeStarted) {
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

        state.bridgeStarted = true;
        Logger.debug('noVNC clipboard element detected, initialising External VNC Helper');

        const oldRoot = document.getElementById(ROOT_ID);
        const oldTab = document.getElementById(TAB_ID);
        if (oldRoot || oldTab) {
            if (window.__fleetVncHelperTeardown) {
                try {
                    window.__fleetVncHelperTeardown();
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
        if (window._vncHelperKeydown) {
            document.removeEventListener('keydown', window._vncHelperKeydown, true);
        }

        /** Serialize paste, overwrite, and extract so clipboard I/O does not interleave. */
        let clipQueue = Promise.resolve();

        const showPanel = this.isPanelEnabled();
        let root = null;
        let restoreTab = null;
        let onMove = () => {};
        let onUp = () => {};
        let onResizeMove = () => {};
        let onResizeUp = () => {};

        const self = this;

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
            minimizeBtn.setAttribute('aria-label', 'Minimize External VNC Helper');
            minimizeBtn.className = pc.btn || '';
            minimizeBtn.style.flexShrink = '0';
            headerEl.appendChild(headerTitle);
            headerEl.appendChild(minimizeBtn);

            const bodyEl = document.createElement('div');
            bodyEl.style.cssText =
                'flex:1;min-height:0;overflow-y:auto;padding:0 0 12px 0;user-select:text;';

            // Prompt section
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

            // Scratchpad section
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

            // VM Clipboard buttons section
            const clipSection = document.createElement('div');
            clipSection.className = pc.divider || '';
            clipSection.style.cssText = 'padding:0 0 4px 0;user-select:text;';

            const clipHeader = document.createElement('div');
            clipHeader.textContent = 'VM Clipboard';
            clipHeader.className = pc.sectionLabel || '';
            clipHeader.style.cssText = 'padding:8px 12px 4px 12px;';

            const clipBody = document.createElement('div');
            clipBody.style.cssText = 'padding:0 12px 8px 12px;';

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
            const shortcutHint = document.createElement('div');
            shortcutHint.textContent = '⌘C/⌘V · Ctrl+Shift+C/F';
            shortcutHint.className = pc.muted || '';
            shortcutHint.style.cssText = 'font-size:11px;text-align:center;margin-top:8px;';

            btnRow.appendChild(bExtract);
            btnRow.appendChild(bOverwrite);
            clipBody.appendChild(btnRow);
            clipBody.appendChild(shortcutHint);
            clipBody.appendChild(this.makeClipboardHelpDetails());
            clipSection.appendChild(clipHeader);
            clipSection.appendChild(clipBody);
            bodyEl.appendChild(clipSection);

            const resizeHandle = document.createElement('div');
            resizeHandle.setAttribute('aria-label', 'Resize External VNC Helper');
            resizeHandle.className = pc.resize || '';

            root.appendChild(headerEl);
            root.appendChild(bodyEl);
            root.appendChild(resizeHandle);
            document.body.appendChild(root);
            self.applyHelperChrome(root, null);

            bExtract.addEventListener('click', () => {
                clipQueue = clipQueue
                    .then(async () => {
                        const ok = await extractVmTextToOs({ deferFocus: true });
                        if (ok) flashClipBtnSuccess(bExtract);
                        else flashClipBtnFailure(bExtract);
                        focusVncTarget();
                    })
                    .catch((err) => {
                        Logger.error('Extract click failed', err);
                        flashClipBtnFailure(bExtract);
                        focusVncTarget();
                    });
            });
            bOverwrite.addEventListener('click', () => {
                clipQueue = clipQueue
                    .then(async () => {
                        try {
                            const t = await readClipboardText();
                            const ok = await pushOsTextToVmClipboard(typeof t === 'string' ? t : '', {
                                deferFocus: true
                            });
                            if (ok) flashClipBtnSuccess(bOverwrite);
                            else flashClipBtnFailure(bOverwrite);
                        } catch (eOw) {
                            toast('Overwrite failed: could not read system clipboard.');
                            Logger.warn('Overwrite failed — could not read system clipboard', eOw);
                            flashClipBtnFailure(bOverwrite);
                        }
                        focusVncTarget();
                    })
                    .catch((err) => {
                        Logger.error('Overwrite click failed', err);
                        flashClipBtnFailure(bOverwrite);
                        focusVncTarget();
                    });
            });

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

        window._vncHelperKeydown = async (e) => {
            const key = (e.key || '').toLowerCase();
            if (e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.code === 'KeyF') {
                if (e.repeat) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                clipQueue = clipQueue.then(runOverwriteFromShortcut).catch(() => {});
                return;
            }
            if (e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.code === 'KeyC') {
                if (e.repeat) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                clipQueue = clipQueue.then(() => extractVmTextToOs()).catch(() => {});
                return;
            }
            if (e.metaKey && !e.ctrlKey && !e.altKey && key === 'c') {
                if (isTypingTarget(document.activeElement)) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                clipQueue = clipQueue.then(runCopyVmToHost).catch(() => {});
                return;
            }
            if (e.metaKey && !e.ctrlKey && !e.altKey && key === 'v') {
                if (isTypingTarget(document.activeElement)) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                clipQueue = clipQueue.then(runPasteFromClipboard).catch(() => {});
            }
        };
        document.addEventListener('keydown', window._vncHelperKeydown, true);

        window.__fleetVncHelperTeardown = () => {
            document.removeEventListener('mousemove', onMove, true);
            document.removeEventListener('mouseup', onUp, true);
            document.removeEventListener('mousemove', onResizeMove, true);
            document.removeEventListener('mouseup', onResizeUp, true);
            document.body.style.userSelect = '';
            if (window._vncHelperKeydown) {
                document.removeEventListener('keydown', window._vncHelperKeydown, true);
                window._vncHelperKeydown = null;
            }
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
            Logger.log('modal and keyboard shortcuts active (starts minimized)');
            toast('External VNC Helper ready — open from the tab. ⌘C/⌘V, Ctrl+Shift+C/F.');
        } else {
            Logger.debug('keyboard shortcuts active (panel hidden via settings)');
            toast('External VNC Helper ready — ⌘C/⌘V, Ctrl+Shift+C/F. Panel is hidden in settings.');
        }
    },

    run(state, options) {
        if (state.bridgeStarted) {
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
        if (typeof window.__fleetVncHelperTeardown === 'function') {
            try {
                window.__fleetVncHelperTeardown();
            } catch (eTeardown) {
                Logger.error('teardown failed', eTeardown);
            }
            window.__fleetVncHelperTeardown = undefined;
        }
        state.waitObserverAttached = false;
        state.bridgeStarted = false;
        state.minimized = false;
        Logger.log('destroyed');
    }
};

const plugin = {
    id: 'vncHelperLib',
    name: 'External VNC Helper (library)',
    description: 'Shared External VNC Helper panel and clipboard helpers',
    _version: '3.9',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.vncHelper = {
            run: (s, options) => {
                const impl = Object.create(VncHelperApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }
                return VncHelperApi.run.call(impl, s, options);
            },
            destroy: (s, options) => {
                const impl = Object.create(VncHelperApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }
                return VncHelperApi.destroy.call(impl, s);
            }
        };
        if (!state.registered) {
            Logger.log('vncHelperLib: module registered (Context.vncHelper)');
            state.registered = true;
        }
    }
};

// ---- Clipboard / noVNC helpers (declarations hoisted; used by plugin methods above) ----

const CLIP_BTN_FLASH_MS = 600;

function flashClipBtnSuccess(btn) {
    if (!btn) return;
    if (Context.buttonFeedback && typeof Context.buttonFeedback.flashSuccess === 'function') {
        Context.buttonFeedback.flashSuccess(btn);
        return;
    }
    if (btn._fleetClipFlashTimeout) clearTimeout(btn._fleetClipFlashTimeout);
    btn.style.background = 'rgb(34, 197, 94)';
    btn.style.color = '#ffffff';
    btn._fleetClipFlashTimeout = setTimeout(() => {
        btn._fleetClipFlashTimeout = null;
        btn.style.background = '';
        btn.style.color = '';
    }, CLIP_BTN_FLASH_MS);
}

function flashClipBtnFailure(btn) {
    if (!btn) return;
    if (Context.buttonFeedback && typeof Context.buttonFeedback.flashFailure === 'function') {
        Context.buttonFeedback.flashFailure(btn);
        return;
    }
    if (btn._fleetClipFlashTimeout) clearTimeout(btn._fleetClipFlashTimeout);
    btn.style.background = 'rgb(239, 68, 68)';
    btn.style.color = '#ffffff';
    btn._fleetClipFlashTimeout = setTimeout(() => {
        btn._fleetClipFlashTimeout = null;
        btn.style.background = '';
        btn.style.color = '';
    }, CLIP_BTN_FLASH_MS);
}
function clipEl() {
    return document.getElementById(NOVNC_CLIPBOARD_ID);
}

function getRfb() {
    return (
        window.rfb ||
        window._rfb ||
        (window.UI && window.UI.rfb) ||
        (window.APP && window.APP.rfb) ||
        (window.noVNC && window.noVNC.rfb) ||
        null
    );
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function focusVncTarget() {
    const rfb = getRfb();
    if (rfb && typeof rfb.focus === 'function') {
        try {
            rfb.focus();
            return;
        } catch (e0) {
            /* ignore */
        }
    }
    const c = document.querySelector('canvas');
    if (c && typeof c.focus === 'function') {
        try {
            c.focus();
        } catch (e1) {
            /* ignore */
        }
    }
}

/** True when focus is in a field that should get native ⌘C/⌘V (Prompt/Scratchpad, etc.). */
function isTypingTarget(el) {
    if (!el || el === document.body || el === document.documentElement) {
        return false;
    }
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'SELECT') {
        return true;
    }
    if (tag === 'INPUT') {
        const type = String(el.type || 'text').toLowerCase();
        return (
            type === '' ||
            type === 'text' ||
            type === 'search' ||
            type === 'url' ||
            type === 'tel' ||
            type === 'email' ||
            type === 'password' ||
            type === 'number' ||
            type === 'date' ||
            type === 'datetime-local' ||
            type === 'month' ||
            type === 'week' ||
            type === 'time'
        );
    }
    return !!el.isContentEditable;
}

/** Truncation for button toasts; empty becomes "(empty)". */
function truncPreview(t) {
    if (t == null || String(t).length === 0) {
        return '(empty)';
    }
    t = String(t);
    return t.length > 40 ? `${t.slice(0, 40)}\u2026` : t;
}

/** Truncation for Cmd+C / Cmd+V bridge toasts; empty stays blank. */
function truncKey(t) {
    t = t == null ? '' : String(t);
    if (!t.length) {
        return '';
    }
    return t.length > 40 ? `${t.slice(0, 40)}\u2026` : t;
}

function fireKey(target, type, opts) {
    target.dispatchEvent(
        new KeyboardEvent(type, Object.assign({ bubbles: true, cancelable: true, composed: true }, opts))
    );
}

function sendCtrlDom(k) {
    const t =
        document.activeElement ||
        document.querySelector('canvas') ||
        document.body ||
        document.documentElement;
    fireKey(t, 'keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true });
    fireKey(t, 'keydown', { key: k, code: `Key${k.toUpperCase()}`, ctrlKey: true });
    fireKey(t, 'keyup', { key: k, code: `Key${k.toUpperCase()}`, ctrlKey: true });
    fireKey(t, 'keyup', { key: 'Control', code: 'ControlLeft' });
}

function sendCtrlRfb(k) {
    const rf = getRfb();
    if (!rf || typeof rf.sendKey !== 'function') {
        return false;
    }
    const ctrl = 0xffe3;
    const ch = k.toLowerCase().charCodeAt(0);
    rf.sendKey(ctrl, 'ControlLeft', true);
    rf.sendKey(ch, `Key${k.toUpperCase()}`, true);
    rf.sendKey(ch, `Key${k.toUpperCase()}`, false);
    rf.sendKey(ctrl, 'ControlLeft', false);
    return true;
}

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

/** Prefer text/plain blob (tabs/line breaks); used for Cmd+V and Overwrite. */
async function readClipboardText() {
    try {
        const items = await navigator.clipboard.read();
        for (let i = 0; i < items.length; i++) {
            const types = items[i].types || [];
            for (let j = 0; j < types.length; j++) {
                if (types[j] === 'text/plain') {
                    const blob = await items[i].getType('text/plain');
                    return await blob.text();
                }
            }
        }
    } catch (e2) {
        /* fall through */
    }
    return await navigator.clipboard.readText();
}

async function syncRemoteClipboard(el, merged, caret, editingClipboard) {
    if (editingClipboard) {
        try {
            el.focus();
        } catch (eFocus) {
            /* ignore */
        }
    }
    const rf = getRfb();
    if (rf && typeof rf.clipboardPasteFrom === 'function') {
        el.value = merged;
        if (editingClipboard && typeof el.setSelectionRange === 'function') {
            try {
                el.setSelectionRange(caret, caret);
            } catch (eSel) {
                /* ignore */
            }
        }
        rf.clipboardPasteFrom('');
        await sleep(12);
        rf.clipboardPasteFrom(merged);
        return;
    }
    el.value = '';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(12);
    el.value = merged;
    if (editingClipboard && typeof el.setSelectionRange === 'function') {
        try {
            el.setSelectionRange(caret, caret);
        } catch (eSel2) {
            /* ignore */
        }
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function runPasteFromClipboard() {
    const elSnap = clipEl();
    const editingClipboard = !!(elSnap && document.activeElement === elSnap);
    let text = '';
    try {
        text = await readClipboardText();
    } catch (err) {
        toast('PASTE fail (clipboard)');
        Logger.warn('PASTE failed — could not read system clipboard', err);
        focusVncTarget();
        return;
    }
    const el = clipEl();
    if (!el) {
        toast('PASTE fail (noVNC el)');
        Logger.warn('PASTE failed — noVNC clipboard element missing');
        focusVncTarget();
        return;
    }
    const cur = el.value || '';
    let merged;
    let caret;
    if (editingClipboard) {
        let start = typeof el.selectionStart === 'number' ? el.selectionStart : cur.length;
        let end = typeof el.selectionEnd === 'number' ? el.selectionEnd : cur.length;
        if (start > end) {
            const swap = start;
            start = end;
            end = swap;
        }
        merged = cur.slice(0, start) + text + cur.slice(end);
        caret = start + text.length;
    } else {
        merged = text;
        caret = text.length;
    }
    await syncRemoteClipboard(el, merged, caret, editingClipboard);
    await sleep(75);
    const ok = sendCtrlRfb('v');
    if (!ok) {
        sendCtrlDom('v');
    }
    toast(`${ok ? 'PASTE ' : 'PASTE? '}\u2192 ${truncKey(merged)}`);
    if (ok) {
        Logger.log(`PASTE ok (${merged.length} chars)`);
    } else {
        Logger.warn(`PASTE uncertain — Ctrl+V RFB send failed (${merged.length} chars)`);
    }
    focusVncTarget();
}

async function runOverwriteFromShortcut() {
    try {
        const t = await readClipboardText();
        await pushOsTextToVmClipboard(typeof t === 'string' ? t : '');
    } catch (eOw) {
        toast('Overwrite failed: could not read system clipboard.');
        Logger.warn('Overwrite failed — could not read system clipboard', eOw);
        focusVncTarget();
    }
}

async function runCopyVmToHost() {
    if (!sendCtrlRfb('c')) {
        sendCtrlDom('c');
    }
    await sleep(150);
    const el = clipEl();
    const val = el ? el.value || '' : '';
    if (val) {
        try {
            await navigator.clipboard.writeText(val);
        } catch (eW) {
            toast('COPY fail (could not write system clipboard)');
            Logger.error('COPY failed — could not write system clipboard', eW);
            focusVncTarget();
            return;
        }
    }
    toast(`COPY \u2192 ${truncKey(val)}`);
    Logger.log(`COPY ok (${val.length} chars)`);
    focusVncTarget();
}

/** Push plain text to the virtual machine via noVNC (no Ctrl+V — updates remote clipboard only). */
async function pushOsTextToVmClipboard(text, opts) {
    const deferFocus = !!(opts && opts.deferFocus);
    const el = clipEl();
    if (!el) {
        toast('Overwrite failed: noVNC clipboard field (#noVNC_clipboard_text) not found.');
        Logger.warn('Overwrite failed — noVNC clipboard field not found');
        if (!deferFocus) focusVncTarget();
        return false;
    }
    const merged = text;
    const rfb = getRfb();
    el.value = merged;
    if (rfb && typeof rfb.clipboardPasteFrom === 'function') {
        rfb.clipboardPasteFrom('');
        await sleep(12);
        rfb.clipboardPasteFrom(merged);
    } else {
        el.value = '';
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(12);
        el.value = merged;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    toast(`Virtual machine clipboard updated from this computer.\n\u2192 ${truncPreview(merged)}`);
    Logger.log(`Overwrite ok (${String(merged || '').length} chars)`);
    if (!deferFocus) focusVncTarget();
    return true;
}

async function extractVmTextToOs(opts) {
    const deferFocus = !!(opts && opts.deferFocus);
    const el = clipEl();
    if (!el) {
        toast('Extract failed: noVNC clipboard field not found.');
        Logger.warn('Extract failed — noVNC clipboard field not found');
        if (!deferFocus) focusVncTarget();
        return false;
    }
    const v = el.value || '';
    if (!v) {
        toast('Nothing to extract yet. Copy inside the virtual machine first, then try again.');
        Logger.warn('Extract failed — VM clipboard empty');
        if (!deferFocus) focusVncTarget();
        return false;
    }
    try {
        await navigator.clipboard.writeText(v);
        toast(`Copied virtual machine clipboard to this computer.\n\u2192 ${truncPreview(v)}`);
        Logger.log(`Extract ok (${v.length} chars)`);
        if (!deferFocus) focusVncTarget();
        return true;
    } catch (e3) {
        toast('Extract failed: could not write to system clipboard.');
        Logger.error('Extract failed — could not write system clipboard', e3);
        if (!deferFocus) focusVncTarget();
        return false;
    }
}
