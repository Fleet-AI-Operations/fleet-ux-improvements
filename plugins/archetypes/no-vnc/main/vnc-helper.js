// ============= vnc-helper.js =============
// Archetype: no-vnc (noVNC remote desktop on fleet environment subdomains).
// VNC Helper modal: Prompt (from qa-comp-use cache), scratchpad, clipboard bridge buttons, and
// ⌘C/⌘V + Ctrl+Shift+C/F shortcuts. Replaces novnc-clipboard-bridge.js.

const ROOT_ID = 'fleet-vnc-helper';
const TAB_ID = 'fleet-vnc-helper-tab';
const Z_INDEX = '2147483646';
const SHOW_PANEL_SUBOPTION_ID = 'show-panel';
const NOVNC_CLIPBOARD_ID = 'noVNC_clipboard_text';
const PROMPT_STORAGE_KEY = 'fleet-vnc-helper-prompt';
const PROMPT_TS_STORAGE_KEY = 'fleet-vnc-helper-prompt-ts';
const PROMPT_TTL_MS = 2 * 60 * 60 * 1000;
const LINE_HEIGHT_PX = 20;
const DEFAULT_LINES = 2;
const PROMPT_MAX_VISIBLE_LINES = 5;

const SHOW_PANEL_SUBOPTION = {
    id: SHOW_PANEL_SUBOPTION_ID,
    name: 'Show panel',
    description: 'When off, hides the VNC Helper modal; ⌘C/⌘V and Ctrl+Shift+C/F still work.',
    enabledByDefault: true
};

const plugin = {
    id: 'vncHelper',
    name: 'VNC Helper',
    description:
        'VNC Helper modal with prompt cache, scratchpad, and clipboard bridge for noVNC sessions',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    subOptions: [SHOW_PANEL_SUBOPTION],
    initialState: {
        bridgeStarted: false,
        waitObserverAttached: false,
        waitObserver: null,
        minimized: false
    },

    isPanelEnabled() {
        return Storage.getSubOptionEnabled(this.id, SHOW_PANEL_SUBOPTION_ID, true);
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
        Logger.log('vncHelper: waiting for noVNC clipboard element (MutationObserver)');
    },

    readCachedPrompt() {
        try {
            const text = localStorage.getItem(PROMPT_STORAGE_KEY);
            const tsRaw = localStorage.getItem(PROMPT_TS_STORAGE_KEY);
            if (!text || !tsRaw) {
                return '';
            }
            const ts = parseInt(tsRaw, 10);
            if (Number.isNaN(ts) || Date.now() - ts > PROMPT_TTL_MS) {
                localStorage.removeItem(PROMPT_STORAGE_KEY);
                localStorage.removeItem(PROMPT_TS_STORAGE_KEY);
                Logger.debug('vncHelper: cached prompt expired or invalid, cleared');
                return '';
            }
            return text;
        } catch (e) {
            Logger.warn('vncHelper: failed to read cached prompt', e);
            return '';
        }
    },

    lineCountForText(text) {
        if (!text) {
            return DEFAULT_LINES;
        }
        return Math.max(1, String(text).split('\n').length);
    },

    textareaHeightForLines(lineCount) {
        const lines = Math.max(DEFAULT_LINES, lineCount);
        return `${lines * LINE_HEIGHT_PX + 16}px`;
    },

    applyPromptTextareaSizing(textarea, promptText) {
        const visibleLines = promptText
            ? Math.min(PROMPT_MAX_VISIBLE_LINES, this.lineCountForText(promptText))
            : DEFAULT_LINES;
        textarea.style.height = this.textareaHeightForLines(visibleLines);
        textarea.style.minHeight = this.textareaHeightForLines(DEFAULT_LINES);
        textarea.style.maxHeight = this.textareaHeightForLines(PROMPT_MAX_VISIBLE_LINES);
        textarea.style.overflowY = promptText && this.lineCountForText(promptText) > PROMPT_MAX_VISIBLE_LINES
            ? 'auto'
            : 'auto';
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

    makeSectionHeader(label, onToggle) {
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

        let collapsed = false;
        toggleBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            collapsed = !collapsed;
            toggleBtn.textContent = collapsed ? '▶' : '▼';
            onToggle(collapsed);
            Logger.log(`vncHelper: ${label} section ${collapsed ? 'hidden' : 'shown'}`);
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
                Logger.warn('vncHelper: error disconnecting wait observer', eDisc);
            }
            state.waitObserver = null;
        }

        state.bridgeStarted = true;
        Logger.log('vncHelper: noVNC clipboard element detected, initialising VNC Helper');

        const oldRoot = document.getElementById(ROOT_ID);
        const oldTab = document.getElementById(TAB_ID);
        if (oldRoot || oldTab) {
            if (window.__fleetVncHelperTeardown) {
                try {
                    window.__fleetVncHelperTeardown();
                } catch (e4) {
                    Logger.warn('vncHelper: prior teardown failed', e4);
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
                restoreTab.textContent = 'VNC Helper';
                restoreTab.setAttribute('aria-label', 'Restore VNC Helper');
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
                    Logger.log('vncHelper: modal restored from minimized tab');
                });
                document.body.appendChild(restoreTab);
            }
            Logger.log('vncHelper: modal minimized');
        };

        if (showPanel) {
            root = document.createElement('div');
            root.id = ROOT_ID;
            root.style.cssText = `position:fixed;left:16px;top:120px;width:320px;z-index:${Z_INDEX};font:13px/1.45 system-ui,Segoe UI,sans-serif;color:#e8e8e8;background:linear-gradient(160deg,#1e1e24 0%,#121218 100%);border:1px solid rgba(255,255,255,0.12);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.55);overflow:hidden;user-select:none;`;

            const headerEl = document.createElement('div');
            headerEl.style.cssText =
                'display:flex;align-items:center;gap:8px;padding:8px 10px 8px 12px;font-weight:600;font-size:12px;letter-spacing:0.02em;color:#fff;background:rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.08);';
            const headerTitle = document.createElement('div');
            headerTitle.textContent = 'VNC Helper';
            headerTitle.style.cssText =
                'flex:1;min-width:0;cursor:grab;padding:2px 0;font-weight:600;font-size:12px;';
            const minimizeBtn = document.createElement('button');
            minimizeBtn.type = 'button';
            minimizeBtn.textContent = 'Minimize';
            minimizeBtn.setAttribute('aria-label', 'Minimize VNC Helper');
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
            bodyEl.style.cssText = 'padding:0 0 12px 0;user-select:text;';

            // Prompt section
            const promptBody = document.createElement('div');
            promptBody.style.cssText = 'padding:0 12px 8px 12px;';
            const promptTextarea = document.createElement('textarea');
            promptTextarea.setAttribute('aria-label', 'Prompt');
            promptTextarea.spellcheck = false;
            const cachedPrompt = this.readCachedPrompt();
            if (cachedPrompt) {
                promptTextarea.value = cachedPrompt;
                Logger.log(`vncHelper: loaded cached prompt (${cachedPrompt.length} chars)`);
            }
            this.applyPromptTextareaSizing(promptTextarea, cachedPrompt);
            promptBody.appendChild(promptTextarea);

            const promptSection = this.makeSectionHeader('Prompt', (collapsed) => {
                promptBody.style.display = collapsed ? 'none' : '';
            });
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
            clipSection.style.cssText =
                'padding:0 0 4px 0;border-top:1px solid rgba(255,255,255,0.08);user-select:text;';

            const clipHeader = document.createElement('div');
            clipHeader.textContent = 'VM Clipboard';
            clipHeader.style.cssText =
                'padding:8px 12px 4px 12px;font-size:11px;font-weight:600;color:#b0b0b8;letter-spacing:0.03em;text-transform:uppercase;user-select:none;';

            const clipBody = document.createElement('div');
            clipBody.style.cssText = 'padding:0 12px 8px 12px;';

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:8px;';

            function makeBtn(label) {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = label;
                b.style.cssText =
                    'flex:1;margin:0;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#f2f2f2;font:inherit;font-size:11px;font-weight:500;cursor:pointer;';
                b.onmouseenter = () => {
                    b.style.background = 'rgba(255,255,255,0.14)';
                };
                b.onmouseleave = () => {
                    b.style.background = 'rgba(255,255,255,0.08)';
                };
                return b;
            }

            const bExtract = makeBtn('Extract');
            const bOverwrite = makeBtn('Overwrite');
            const shortcutHint = document.createElement('div');
            shortcutHint.textContent = '⌘C/⌘V · Ctrl+Shift+C/F';
            shortcutHint.style.cssText = 'font-size:11px;color:#a5a5ad;text-align:center;margin-top:8px;';

            btnRow.appendChild(bExtract);
            btnRow.appendChild(bOverwrite);
            clipBody.appendChild(btnRow);
            clipBody.appendChild(shortcutHint);
            clipSection.appendChild(clipHeader);
            clipSection.appendChild(clipBody);
            bodyEl.appendChild(clipSection);

            root.appendChild(headerEl);
            root.appendChild(bodyEl);
            document.body.appendChild(root);

            bExtract.addEventListener('click', () => {
                clipQueue = clipQueue
                    .then(() => extractVmTextToOs())
                    .catch(() => {});
            });
            bOverwrite.addEventListener('click', () => {
                clipQueue = clipQueue.then(runOverwriteFromShortcut).catch(() => {});
            });

            minimizeBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                onUp();
                minimizeModal();
            });

            let drag = false;
            let ox = 0;
            let oy = 0;
            onMove = (ev) => {
                if (!drag || !root) {
                    return;
                }
                root.style.left = `${Math.max(0, ev.clientX - ox)}px`;
                root.style.top = `${Math.max(0, ev.clientY - oy)}px`;
            };
            onUp = () => {
                drag = false;
                headerTitle.style.cursor = 'grab';
                document.removeEventListener('mousemove', onMove, true);
                document.removeEventListener('mouseup', onUp, true);
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
                e.preventDefault();
                e.stopPropagation();
                clipQueue = clipQueue.then(runCopyVmToHost).catch(() => {});
                return;
            }
            if (e.metaKey && !e.ctrlKey && !e.altKey && key === 'v') {
                e.preventDefault();
                e.stopPropagation();
                clipQueue = clipQueue.then(runPasteFromClipboard).catch(() => {});
            }
        };
        document.addEventListener('keydown', window._vncHelperKeydown, true);

        window.__fleetVncHelperTeardown = () => {
            document.removeEventListener('mousemove', onMove, true);
            document.removeEventListener('mouseup', onUp, true);
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
            Logger.log('vncHelper: modal and keyboard shortcuts active');
            toast('VNC Helper ready — drag the title bar. ⌘C/⌘V, Ctrl+Shift+C/F.');
        } else {
            Logger.log('vncHelper: keyboard shortcuts active (panel hidden via settings)');
            toast('VNC Helper ready — ⌘C/⌘V, Ctrl+Shift+C/F. Panel is hidden in settings.');
        }
    },

    onMutation(state) {
        if (state.bridgeStarted) {
            return;
        }
        this.installWaitObserver(state);
    },

    destroy(state) {
        if (state.waitObserver) {
            try {
                state.waitObserver.disconnect();
            } catch (e) {
                Logger.warn('vncHelper: wait observer disconnect in destroy', e);
            }
            state.waitObserver = null;
        }
        if (typeof window.__fleetVncHelperTeardown === 'function') {
            try {
                window.__fleetVncHelperTeardown();
            } catch (eTeardown) {
                Logger.error('vncHelper: teardown failed', eTeardown);
            }
            window.__fleetVncHelperTeardown = undefined;
        }
        state.waitObserverAttached = false;
        state.bridgeStarted = false;
        state.minimized = false;
        Logger.log('vncHelper: destroyed');
    }
};

// ---- Clipboard / noVNC helpers (declarations hoisted; used by plugin methods above) ----

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
    const d = document.createElement('div');
    d.textContent = message;
    d.style.cssText = `position:fixed;top:12px;right:12px;z-index:${Z_INDEX};background:rgba(0,0,0,0.88);color:#fff;font:12px/1.4 system-ui,Segoe UI,sans-serif;padding:10px 12px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.35);max-width:min(420px,92vw);word-break:break-word;white-space:pre-wrap;`;
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
        focusVncTarget();
        return;
    }
    const el = clipEl();
    if (!el) {
        toast('PASTE fail (noVNC el)');
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
    focusVncTarget();
}

async function runOverwriteFromShortcut() {
    try {
        const t = await readClipboardText();
        await pushOsTextToVmClipboard(typeof t === 'string' ? t : '');
    } catch (eOw) {
        toast('Overwrite failed: could not read system clipboard.');
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
            focusVncTarget();
            return;
        }
    }
    toast(`COPY \u2192 ${truncKey(val)}`);
    focusVncTarget();
}

/** Push plain text to the virtual machine via noVNC (no Ctrl+V — updates remote clipboard only). */
async function pushOsTextToVmClipboard(text) {
    const el = clipEl();
    if (!el) {
        toast('Overwrite failed: noVNC clipboard field (#noVNC_clipboard_text) not found.');
        focusVncTarget();
        return;
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
    focusVncTarget();
    toast(`Virtual machine clipboard updated from this computer.\n\u2192 ${truncPreview(merged)}`);
}

async function extractVmTextToOs() {
    const el = clipEl();
    if (!el) {
        toast('Extract failed: noVNC clipboard field not found.');
        focusVncTarget();
        return;
    }
    const v = el.value || '';
    if (!v) {
        toast('Nothing to extract yet. Copy inside the virtual machine first, then try again.');
        focusVncTarget();
        return;
    }
    try {
        await navigator.clipboard.writeText(v);
        toast(`Copied virtual machine clipboard to this computer.\n\u2192 ${truncPreview(v)}`);
        focusVncTarget();
    } catch (e3) {
        toast('Extract failed: could not write to system clipboard.');
        focusVncTarget();
    }
}
