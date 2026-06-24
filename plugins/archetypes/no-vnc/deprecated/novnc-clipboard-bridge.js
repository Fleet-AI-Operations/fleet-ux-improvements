// ============= novnc-clipboard-bridge.js =============
// Archetype: no-vnc (noVNC remote desktop on fleet environment subdomains).
// Bridges the host clipboard and noVNC’s hidden #noVNC_clipboard_text field: optional draggable panel (Extract /
// Overwrite), plus ⌘C / ⌘V, Ctrl+Shift+C (extract VM clipboard to host), and Ctrl+Shift+F (push host clipboard into VM).
// Settings sub-option “Show floating banner” hides the panel while keeping shortcuts. Legacy implementation lives in
// deprecated/clipboard-bridge.js; bookmarklet variant: bookmarklet-clipboard-floater.js.

const ROOT_ID = 'fleet-novnc-clipboard-floater';
const Z_INDEX = '2147483646';
const SHOW_FLOATING_BANNER_SUBOPTION_ID = 'show-floating-banner';
const NOVNC_CLIPBOARD_ID = 'noVNC_clipboard_text';

const SHOW_FLOATING_BANNER_SUBOPTION = {
    id: SHOW_FLOATING_BANNER_SUBOPTION_ID,
    name: 'Show floating banner',
    description: 'When off, hides the draggable panel; ⌘C/⌘V and Ctrl+Shift+C/F still work.',
    enabledByDefault: true
};

const plugin = {
    id: 'clipboard-bridge',
    name: 'noVNC Clipboard Bridge',
    description:
        'Floating clipboard bridge panel with ⌘C/⌘V and Ctrl+Shift+C/F shortcuts for noVNC sessions',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    subOptions: [SHOW_FLOATING_BANNER_SUBOPTION],
    initialState: {
        bridgeStarted: false,
        waitObserverAttached: false,
        waitObserver: null
    },

    isFloatingBannerEnabled() {
        return Storage.getSubOptionEnabled(this.id, SHOW_FLOATING_BANNER_SUBOPTION_ID, true);
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
        Logger.log('clipboard-bridge: waiting for noVNC clipboard element (MutationObserver)');
    },

    startBridge(state) {
        if (state.bridgeStarted) {
            return;
        }
        if (state.waitObserver) {
            try {
                state.waitObserver.disconnect();
            } catch (eDisc) {
                Logger.warn('clipboard-bridge: error disconnecting wait observer', eDisc);
            }
            state.waitObserver = null;
        }

        state.bridgeStarted = true;
        Logger.log('clipboard-bridge: noVNC clipboard element detected, initialising bridge');

        const old = document.getElementById(ROOT_ID);
        if (old) {
            if (window.__fleetClipFloaterTeardown) {
                try {
                    window.__fleetClipFloaterTeardown();
                } catch (e4) {
                    Logger.warn('clipboard-bridge: prior teardown failed', e4);
                }
            }
            old.remove();
        }
        if (window._v) {
            document.removeEventListener('keydown', window._v, true);
        }

        /** Serialize paste, overwrite, and extract so clipboard I/O does not interleave. */
        let clipQueue = Promise.resolve();

        const showFloatingBanner = this.isFloatingBannerEnabled();
        let root = null;
        let headerEl = null;
        let onMove = () => {};
        let onUp = () => {};

        if (showFloatingBanner) {
            root = document.createElement('div');
            root.id = ROOT_ID;
            root.style.cssText = `position:fixed;left:16px;top:120px;width:280px;z-index:${Z_INDEX};font:13px/1.45 system-ui,Segoe UI,sans-serif;color:#e8e8e8;background:linear-gradient(160deg,#1e1e24 0%,#121218 100%);border:1px solid rgba(255,255,255,0.12);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.55);overflow:hidden;user-select:none;`;

            headerEl = document.createElement('div');
            headerEl.style.cssText =
                'display:flex;align-items:center;gap:8px;padding:8px 10px 8px 12px;font-weight:600;font-size:12px;letter-spacing:0.02em;color:#fff;background:rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.08);';
            const headerTitle = document.createElement('div');
            headerTitle.textContent = 'Clipboard bridge';
            headerTitle.style.cssText =
                'flex:1;min-width:0;cursor:grab;padding:2px 0;font-weight:600;font-size:12px;';
            const hideBtn = document.createElement('button');
            hideBtn.type = 'button';
            hideBtn.textContent = 'Hide';
            hideBtn.setAttribute('aria-label', 'Hide clipboard bridge panel');
            hideBtn.style.cssText =
                'flex-shrink:0;margin:0;padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#e8e8e8;font:inherit;font-size:11px;font-weight:500;cursor:pointer;';
            hideBtn.onmouseenter = () => {
                hideBtn.style.background = 'rgba(255,255,255,0.16)';
            };
            hideBtn.onmouseleave = () => {
                hideBtn.style.background = 'rgba(255,255,255,0.1)';
            };
            headerEl.appendChild(headerTitle);
            headerEl.appendChild(hideBtn);

            const bodyEl = document.createElement('div');
            bodyEl.style.cssText = 'padding:12px;user-select:text;';
            bodyEl.style.userSelect = 'text';

            function makeBtn(label) {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = label;
                b.style.cssText =
                    'display:block;width:100%;margin:0 0 8px 0;padding:9px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#f2f2f2;font:inherit;font-weight:500;cursor:pointer;';
                b.onmouseenter = () => {
                    b.style.background = 'rgba(255,255,255,0.14)';
                };
                b.onmouseleave = () => {
                    b.style.background = 'rgba(255,255,255,0.08)';
                };
                return b;
            }

            const bExtract = makeBtn('Extract VM Clipboard');
            const bOverwrite = makeBtn('Overwrite VM Clipboard');

            const details = document.createElement('details');
            details.style.cssText =
                'margin:4px 0 0 0;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;';
            const summaryEl = document.createElement('summary');
            summaryEl.textContent = 'How this works';
            summaryEl.style.cssText =
                'cursor:pointer;font-size:12px;color:#b0b0b8;outline:none;user-select:none;';
            const help = document.createElement('div');
            help.style.cssText =
                'margin-top:10px;font-size:11px;color:#a5a5ad;line-height:1.55;user-select:text;';

            function pBlock(strongLabel, rest) {
                const p = document.createElement('p');
                p.style.margin = '0 0 8px 0';
                const s = document.createElement('strong');
                s.style.color = '#ddd';
                s.textContent = strongLabel;
                p.appendChild(s);
                p.appendChild(document.createTextNode(` ${rest}`));
                return p;
            }
            help.appendChild(
                pBlock(
                    'Extract Clipboard',
                    'copies the text noVNC currently holds for the virtual machine into this computer\u2019s system clipboard. Use the virtual machine\u2019s normal copy first so that buffer fills, then click Extract.'
                )
            );
            help.appendChild(
                pBlock(
                    'Overwrite Clipboard',
                    'takes plain text from this computer\u2019s clipboard and pushes it into noVNC\u2019s virtual machine clipboard buffer. Then use the virtual machine\u2019s normal paste.'
                )
            );
            help.appendChild(
                pBlock(
                    'Keyboard',
                    '\u2318+C sends Ctrl+C to the virtual machine, then copies noVNC\u2019s buffer to this computer. \u2318+V pushes this computer\u2019s clipboard into the virtual machine and sends Ctrl+V. Ctrl+Shift+F is the same as Overwrite VM Clipboard. Ctrl+Shift+C is the same as Extract VM Clipboard.'
                )
            );
            const p3 = document.createElement('p');
            p3.style.margin = '0';
            p3.textContent =
                'Always combine these controls with the virtual machine\u2019s native copy/paste: copy in the virtual machine \u2192 Extract (or Ctrl+Shift+C) to the host; copy on the host \u2192 Overwrite (or Ctrl+Shift+F) \u2192 paste in the virtual machine (or \u2318+V).';
            help.appendChild(p3);

            details.appendChild(summaryEl);
            details.appendChild(help);
            bodyEl.appendChild(bExtract);
            bodyEl.appendChild(bOverwrite);
            bodyEl.appendChild(details);
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

            hideBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                onUp();
                if (root && root.parentNode) {
                    root.parentNode.removeChild(root);
                }
                root = null;
                headerEl = null;
                Logger.log(
                    'clipboard-bridge: floating panel hidden by user (reload page to show panel again)'
                );
            });
        }

        window._v = async (e) => {
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
        document.addEventListener('keydown', window._v, true);

        window.__fleetClipFloaterTeardown = () => {
            document.removeEventListener('mousemove', onMove, true);
            document.removeEventListener('mouseup', onUp, true);
            if (window._v) {
                document.removeEventListener('keydown', window._v, true);
                window._v = null;
            }
            if (root && root.parentNode) {
                root.parentNode.removeChild(root);
            }
        };

        if (showFloatingBanner) {
            Logger.log('clipboard-bridge: floating panel and keyboard shortcuts active');
            toast('Clipboard bridge ready \u2014 drag the title bar. \u2318C/\u2318V, Ctrl+Shift+C/F.');
        } else {
            Logger.log('clipboard-bridge: keyboard shortcuts active (floating banner hidden via settings)');
            toast(
                'Clipboard bridge ready \u2014 \u2318C/\u2318V, Ctrl+Shift+C/F. Floating panel is hidden in settings.'
            );
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
                Logger.warn('clipboard-bridge: wait observer disconnect in destroy', e);
            }
            state.waitObserver = null;
        }
        if (typeof window.__fleetClipFloaterTeardown === 'function') {
            try {
                window.__fleetClipFloaterTeardown();
            } catch (eTeardown) {
                Logger.error('clipboard-bridge: teardown failed', eTeardown);
            }
            window.__fleetClipFloaterTeardown = undefined;
        }
        state.waitObserverAttached = false;
        state.bridgeStarted = false;
        Logger.log('clipboard-bridge: destroyed');
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
