// ============= verifier-fetcher.js =============
// Verifier Fetcher tab for the Ops dashboard.

const VERIFIER_SCRATCHPAD_WIDTH_KEY = 'fleet-ux:verifier-fetcher-scratchpad-width';
const VERIFIER_SCRATCHPAD_OPEN_KEY = 'fleet-ux:verifier-fetcher-scratchpad-open';
const VERIFIER_SCRATCHPAD_TEXT_KEY = 'fleet-ux:verifier-fetcher-scratchpad-text';
const VERIFIER_SCRATCHPAD_DEFAULT_WIDTH = 320;
const VERIFIER_SCRATCHPAD_MIN_WIDTH = 200;
const VERIFIER_SCRATCHPAD_MIN_CODE_WIDTH = 240;
const VERIFIER_SCRATCHPAD_TEXT_SAVE_MS = 400;

function verifierFetcherPageWindow() {
    return Context.getPageWindow ? Context.getPageWindow() : window;
}

function readVerifierScratchpadWidthPref() {
    try {
        const raw = verifierFetcherPageWindow().localStorage.getItem(VERIFIER_SCRATCHPAD_WIDTH_KEY);
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n) || n < VERIFIER_SCRATCHPAD_MIN_WIDTH) return VERIFIER_SCRATCHPAD_DEFAULT_WIDTH;
        return n;
    } catch (_e) {
        return VERIFIER_SCRATCHPAD_DEFAULT_WIDTH;
    }
}

function writeVerifierScratchpadWidthPref(widthPx) {
    try {
        const clamped = Math.max(VERIFIER_SCRATCHPAD_MIN_WIDTH, Math.round(widthPx));
        verifierFetcherPageWindow().localStorage.setItem(VERIFIER_SCRATCHPAD_WIDTH_KEY, String(clamped));
    } catch (err) {
        Logger.warn('verifier-fetcher: failed to write scratchpad width pref', err);
    }
}

function readVerifierScratchpadOpenPref() {
    try {
        return verifierFetcherPageWindow().localStorage.getItem(VERIFIER_SCRATCHPAD_OPEN_KEY) === '1';
    } catch (_e) {
        return false;
    }
}

function writeVerifierScratchpadOpenPref(open) {
    try {
        verifierFetcherPageWindow().localStorage.setItem(VERIFIER_SCRATCHPAD_OPEN_KEY, open ? '1' : '0');
    } catch (err) {
        Logger.warn('verifier-fetcher: failed to write scratchpad open pref', err);
    }
}

function readVerifierScratchpadTextPref() {
    try {
        return verifierFetcherPageWindow().localStorage.getItem(VERIFIER_SCRATCHPAD_TEXT_KEY) || '';
    } catch (_e) {
        return '';
    }
}

function writeVerifierScratchpadTextPref(text) {
    try {
        verifierFetcherPageWindow().localStorage.setItem(VERIFIER_SCRATCHPAD_TEXT_KEY, text || '');
    } catch (err) {
        Logger.warn('verifier-fetcher: failed to write scratchpad text pref', err);
    }
}

function clampVerifierScratchpadWidth(root, widthPx) {
    const rootW = root ? root.getBoundingClientRect().width : 0;
    const fallbackW = 960;
    const basis = rootW > 0 ? rootW : fallbackW;
    const handleReserve = 16;
    const max = Math.max(
        VERIFIER_SCRATCHPAD_MIN_WIDTH,
        basis - VERIFIER_SCRATCHPAD_MIN_CODE_WIDTH - handleReserve
    );
    return Math.round(Math.max(VERIFIER_SCRATCHPAD_MIN_WIDTH, Math.min(max, widthPx)));
}

function applyVerifierScratchpadLayout(modal, openOverride) {
    if (!modal) return;
    const outputWrap = modal.querySelector('#wf-ops-verifier-output-wrap');
    const scratchpadPane = modal.querySelector('#wf-ops-verifier-scratchpad-pane');
    const splitHandle = modal.querySelector('#wf-ops-verifier-scratchpad-split-handle');
    const toggleBtn = modal.querySelector('#wf-ops-verifier-scratchpad-toggle');
    if (!outputWrap || !scratchpadPane || !splitHandle || !toggleBtn) return;

    const open = openOverride != null ? Boolean(openOverride) : readVerifierScratchpadOpenPref();
    const width = clampVerifierScratchpadWidth(outputWrap, readVerifierScratchpadWidthPref());

    scratchpadPane.style.display = open ? 'flex' : 'none';
    splitHandle.style.display = open ? 'block' : 'none';
    if (open) {
        scratchpadPane.style.width = width + 'px';
        scratchpadPane.style.minWidth = VERIFIER_SCRATCHPAD_MIN_WIDTH + 'px';
        scratchpadPane.style.maxWidth = width + 'px';
    }

    toggleBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
    toggleBtn.textContent = open ? 'Hide scratchpad' : 'Scratchpad';
}

function ensureVerifierScratchpadResizeStyles(modal) {
    if (!modal || modal.querySelector('#wf-ops-verifier-scratchpad-resize-style')) return;
    const style = document.createElement('style');
    style.id = 'wf-ops-verifier-scratchpad-resize-style';
    style.textContent = [
        '#wf-ops-verifier-scratchpad-split-handle:hover,',
        '#wf-ops-verifier-scratchpad-split-handle:active {',
        '  background: color-mix(in srgb, var(--border, #e2e8f0) 55%, var(--brand, var(--primary, #2563eb)));',
        '}'
    ].join('');
    modal.appendChild(style);
}

function attachVerifierScratchpadResize(modal) {
    if (!modal || modal.dataset.wfVerifierScratchpadResizeAttached === '1') return;
    modal.dataset.wfVerifierScratchpadResizeAttached = '1';
    ensureVerifierScratchpadResizeStyles(modal);

    modal.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('#wf-ops-verifier-scratchpad-split-handle');
        if (!handle || !modal.contains(handle)) return;
        if (!readVerifierScratchpadOpenPref()) return;
        e.preventDefault();

        const outputWrap = modal.querySelector('#wf-ops-verifier-output-wrap');
        const scratchpadPane = modal.querySelector('#wf-ops-verifier-scratchpad-pane');
        if (!outputWrap || !scratchpadPane) return;

        const startX = e.clientX;
        const startWidth = scratchpadPane.getBoundingClientRect().width;
        const doc = document;

        const onMove = (ev) => {
            const next = clampVerifierScratchpadWidth(outputWrap, startWidth + (startX - ev.clientX));
            scratchpadPane.style.width = next + 'px';
            scratchpadPane.style.maxWidth = next + 'px';
        };

        const onUp = () => {
            doc.removeEventListener('mousemove', onMove);
            doc.removeEventListener('mouseup', onUp);
            doc.body.style.cursor = '';
            doc.body.style.userSelect = '';
            const finalWidth = clampVerifierScratchpadWidth(outputWrap, scratchpadPane.getBoundingClientRect().width);
            writeVerifierScratchpadWidthPref(finalWidth);
            applyVerifierScratchpadLayout(modal, true);
            Logger.log('verifier-fetcher: scratchpad width set to ' + finalWidth + 'px');
        };

        doc.body.style.cursor = 'col-resize';
        doc.body.style.userSelect = 'none';
        doc.addEventListener('mousemove', onMove);
        doc.addEventListener('mouseup', onUp);
    });
}

function restoreVerifierScratchpadState(modal) {
    if (!modal) return;
    const textarea = modal.querySelector('#wf-ops-verifier-scratchpad');
    if (textarea && !textarea.dataset.wfScratchpadRestored) {
        textarea.value = readVerifierScratchpadTextPref();
        textarea.dataset.wfScratchpadRestored = '1';
    }
    applyVerifierScratchpadLayout(modal);
}

function syncVerifierOutputToolbar(modal) {
    if (!modal) return;
    applyVerifierScratchpadLayout(modal);
}

function captureVerifierScratchpadTabState(modal) {
    if (!modal) return null;
    const textarea = modal.querySelector('#wf-ops-verifier-scratchpad');
    return {
        open: readVerifierScratchpadOpenPref(),
        text: textarea ? textarea.value : readVerifierScratchpadTextPref()
    };
}

function restoreVerifierScratchpadTabState(modal, state) {
    if (!modal) return;
    const textarea = modal.querySelector('#wf-ops-verifier-scratchpad');
    if (state && state.open != null) {
        writeVerifierScratchpadOpenPref(Boolean(state.open));
    }
    if (textarea) {
        const text = state && state.text != null ? String(state.text) : readVerifierScratchpadTextPref();
        textarea.value = text;
        textarea.dataset.wfScratchpadRestored = '1';
        writeVerifierScratchpadTextPref(text);
    }
    applyVerifierScratchpadLayout(modal);
}

function verifierFetcherPanelHtml() {
    const dash = Context.dashboard;
    const btnClass = (variant, size) => (dash && typeof dash.dashBtnClass === 'function'
        ? dash.dashBtnClass(variant, size)
        : 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size);
    return `
            <div id="wf-ops-verifier-panel" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;">
                <div style="flex-shrink: 0;">
                    <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: var(--foreground, #0f172a);">
                        Verifier Code Fetcher
                    </h3>
                    <p style="font-size: 12px; color: var(--muted-foreground, #666); margin: 0 0 10px 0; line-height: 1.45;">
                        Paste a task key, task URL, verifier key, verifier ID, or copied seed data. Press Enter to fetch.
                    </p>
                    <div style="display: flex; gap: 8px; align-items: stretch;">
                        <input type="text" id="wf-ops-verifier-input" placeholder="Paste here" autocomplete="off" style="
                            flex: 1;
                            min-width: 0;
                            padding: 8px 12px;
                            font-size: 12px;
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                            background: var(--background, white);
                            color: var(--foreground, #333);
                            box-sizing: border-box;
                            font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
                        ">
                        <button type="button" id="wf-ops-fetch-verifier" class="${btnClass('primary', 'regular')}" style="flex-shrink: 0;">Fetch</button>
                    </div>
                    <div id="wf-ops-verifier-status-row" style="display: none; margin-top: 8px;">
                        <div id="wf-ops-verifier-status" style="font-size: 12px; color: var(--muted-foreground, #666); line-height: 1.45;"></div>
                    </div>
                    <select id="wf-ops-verifier-version" aria-label="Verifier version" style="
                        display: none;
                        width: 100%;
                        margin-top: 8px;
                        padding: 8px 12px;
                        font-size: 12px;
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        background: var(--background, white);
                        color: var(--foreground, #333);
                        box-sizing: border-box;
                        font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
                    "></select>
                </div>
                <div id="wf-ops-verifier-output-toolbar" style="
                    display: none;
                    width: 100%;
                    margin-top: 8px;
                    flex-shrink: 0;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 8px;
                    flex-wrap: nowrap;
                    box-sizing: border-box;
                ">
                    <div id="wf-ops-verifier-content-search-wrap" style="
                        display: flex;
                        flex-shrink: 0;
                        align-self: flex-start;
                        width: 30%;
                        max-width: 30%;
                        min-width: 12rem;
                        gap: 6px;
                        align-items: center;
                        flex-wrap: wrap;
                        flex-direction: row;
                        justify-content: flex-start;
                        box-sizing: border-box;
                    ">
                        <label for="wf-ops-verifier-content-search" style="font-size: 11px; font-weight: 600; color: var(--muted-foreground, #64748b); white-space: nowrap; flex-shrink: 0;">Search in code:</label>
                        <span style="display: flex; flex: 1 1 8rem; min-width: 0; gap: 4px; align-items: center;">
                            <input type="text" id="wf-ops-verifier-content-search" placeholder="Find in verifier…" autocomplete="off" style="
                                flex: 1;
                                min-width: 0;
                                width: 100%;
                                padding: 6px 10px;
                                font-size: 12px;
                                border: 1px solid var(--border, #e5e5e5);
                                border-radius: 6px;
                                background: var(--background, white);
                                color: var(--foreground, #333);
                                box-sizing: border-box;
                                font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
                            ">
                            <button type="button" id="wf-ops-verifier-content-search-clear" title="Clear search" aria-label="Clear search" class="${btnClass('basic', 'icon')}" style="display: none;">&times;</button>
                        </span>
                        <span id="wf-ops-verifier-content-match-count" style="font-size: 11px; color: var(--muted-foreground, #64748b); white-space: nowrap; flex-shrink: 0;"></span>
                        <button type="button" id="wf-ops-verifier-content-prev" class="${btnClass('basic', 'nav')}" style="flex-shrink: 0;">Prev</button>
                        <button type="button" id="wf-ops-verifier-content-next" class="${btnClass('basic', 'nav')}" style="flex-shrink: 0;">Next</button>
                        <button type="button" id="wf-ops-copy-verifier" class="${btnClass('secondary', 'nav')}" style="display: none; flex-shrink: 0;">Copy</button>
                    </div>
                    <button type="button" id="wf-ops-verifier-scratchpad-toggle" class="${btnClass('basic', 'nav')}" aria-pressed="false" style="flex-shrink: 0;">Scratchpad</button>
                </div>
                <div id="wf-ops-verifier-output-wrap" style="
                    display: none;
                    flex: 1;
                    min-height: 0;
                    width: 100%;
                    margin-top: 8px;
                    flex-direction: row;
                    overflow: hidden;
                    box-sizing: border-box;
                ">
                    <div id="wf-ops-verifier-code-pane" style="
                        flex: 1;
                        min-width: 0;
                        min-height: 0;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    ">
                        <pre style="
                            flex: 1;
                            min-height: 0;
                            width: 100%;
                            margin: 0;
                            padding: 8px 12px;
                            font-size: 12px;
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                            background: transparent;
                            color: var(--foreground, #333);
                            box-sizing: border-box;
                            overflow: auto;
                            overflow-x: auto;
                            white-space: pre;
                            word-break: normal;
                            font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
                        "><code id="wf-ops-verifier-output" class="language-python"></code></pre>
                    </div>
                    <div id="wf-ops-verifier-scratchpad-split-handle" role="separator" aria-orientation="vertical" aria-label="Resize scratchpad" tabindex="0" title="Drag to resize scratchpad" style="
                        display: none;
                        flex-shrink: 0;
                        width: 8px;
                        margin: 0 4px;
                        align-self: stretch;
                        cursor: col-resize;
                        border-radius: 4px;
                        background: transparent;
                        touch-action: none;
                        box-sizing: border-box;
                    "></div>
                    <aside id="wf-ops-verifier-scratchpad-pane" style="
                        display: none;
                        flex-shrink: 0;
                        min-height: 0;
                        flex-direction: column;
                        overflow: hidden;
                        box-sizing: border-box;
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        background: transparent;
                    ">
                        <div style="
                            flex-shrink: 0;
                            padding: 6px 10px;
                            font-size: 11px;
                            font-weight: 600;
                            color: var(--muted-foreground, #64748b);
                            border-bottom: 1px solid var(--border, #e5e5e5);
                        ">Scratchpad</div>
                        <textarea id="wf-ops-verifier-scratchpad" placeholder="Notes…" autocomplete="off" spellcheck="true" style="
                            flex: 1;
                            min-height: 0;
                            width: 100%;
                            margin: 0;
                            padding: 8px 10px;
                            font-size: 12px;
                            border: none;
                            border-radius: 0 0 6px 6px;
                            background: transparent;
                            color: var(--foreground, #333);
                            resize: none;
                            box-sizing: border-box;
                            font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
                            outline: none;
                        "></textarea>
                    </aside>
                </div>
            </div>`;
}

function attachVerifierFetcherListeners(modal, dash) {
    const ops = Context.opsTab;
    if (!ops) return;
    if (modal.dataset.wfVerifierFetcherListenersAttached === '1') {
        restoreVerifierScratchpadState(modal);
        syncVerifierOutputToolbar(modal);
        if (typeof ops.restoreVerifierTabState === 'function') ops.restoreVerifierTabState(modal);
        return;
    }
    modal.dataset.wfVerifierFetcherListenersAttached = '1';
    if (typeof ops.injectSpinnerStyle === 'function') ops.injectSpinnerStyle();

    const verifierFetchBtn = modal.querySelector('#wf-ops-fetch-verifier');
    const verifierCopyBtn = modal.querySelector('#wf-ops-copy-verifier');
    const verifierInput = modal.querySelector('#wf-ops-verifier-input');
    const verifierVersionSelect = modal.querySelector('#wf-ops-verifier-version');
    const verifierContentSearch = modal.querySelector('#wf-ops-verifier-content-search');
    const verifierContentClear = modal.querySelector('#wf-ops-verifier-content-search-clear');
    const verifierContentPrev = modal.querySelector('#wf-ops-verifier-content-prev');
    const verifierContentNext = modal.querySelector('#wf-ops-verifier-content-next');
    const scratchpadToggle = modal.querySelector('#wf-ops-verifier-scratchpad-toggle');
    const scratchpadTextarea = modal.querySelector('#wf-ops-verifier-scratchpad');

    attachVerifierScratchpadResize(modal);
    restoreVerifierScratchpadState(modal);

    if (scratchpadToggle) {
        scratchpadToggle.addEventListener('click', () => {
            const nextOpen = !readVerifierScratchpadOpenPref();
            writeVerifierScratchpadOpenPref(nextOpen);
            applyVerifierScratchpadLayout(modal, nextOpen);
            Logger.log('verifier-fetcher: scratchpad ' + (nextOpen ? 'shown' : 'hidden'));
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
    }

    if (scratchpadTextarea) {
        let saveTimer = null;
        scratchpadTextarea.addEventListener('input', () => {
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                writeVerifierScratchpadTextPref(scratchpadTextarea.value);
                if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
            }, VERIFIER_SCRATCHPAD_TEXT_SAVE_MS);
        });
    }

    if (verifierFetchBtn && typeof ops.handleVerifierFetch === 'function') {
        verifierFetchBtn.addEventListener('click', () => { void ops.handleVerifierFetch(modal); });
    }
    if (verifierInput && typeof ops.handleVerifierFetch === 'function') {
        verifierInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); void ops.handleVerifierFetch(modal); }
        });
        const onVerifierInput = () => {
            if (typeof ops.setVerifierStatus === 'function') ops.setVerifierStatus(modal, '');
            if (typeof ops.clearVerifierVersionPicker === 'function') ops.clearVerifierVersionPicker(modal);
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        };
        verifierInput.addEventListener('paste', () => requestAnimationFrame(onVerifierInput));
        verifierInput.addEventListener('input', onVerifierInput);
    }
    if (verifierContentClear && typeof ops.clearVerifierContentSearch === 'function') {
        verifierContentClear.addEventListener('click', () => ops.clearVerifierContentSearch(modal));
    }
    if (verifierContentSearch && typeof ops.applyVerifierContentSearch === 'function') {
        verifierContentSearch.addEventListener('input', () => {
            ops.applyVerifierContentSearch(modal, verifierContentSearch.value);
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
        verifierContentSearch.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (typeof ops.stepVerifierContentMatch === 'function') ops.stepVerifierContentMatch(modal, e.shiftKey ? -1 : 1);
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
    }
    if (verifierContentPrev && typeof ops.stepVerifierContentMatch === 'function') {
        verifierContentPrev.addEventListener('click', () => {
            ops.stepVerifierContentMatch(modal, -1);
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
    }
    if (verifierContentNext && typeof ops.stepVerifierContentMatch === 'function') {
        verifierContentNext.addEventListener('click', () => {
            ops.stepVerifierContentMatch(modal, 1);
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
    }
    if (verifierVersionSelect && typeof ops.handleVerifierVersionChange === 'function') {
        verifierVersionSelect.addEventListener('change', () => { void ops.handleVerifierVersionChange(modal); });
    }
    if (verifierCopyBtn && typeof ops.copyVerifierCode === 'function') {
        verifierCopyBtn.addEventListener('click', () => { void ops.copyVerifierCode(modal, verifierCopyBtn); });
    }
    if (typeof ops.restoreVerifierTabState === 'function') ops.restoreVerifierTabState(modal);
}

const plugin = {
    id: 'verifier-fetcher',
    name: 'Verifier Fetcher',
    description: 'Verifier code fetch tab for the Ops dashboard',
    _version: '1.6',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            Logger.error('verifier-fetcher: dashboard loader not registered');
            return;
        }
        Context.verifierFetcherUi = {
            syncOutputToolbar: (modal) => syncVerifierOutputToolbar(modal),
            restoreScratchpad: (modal) => restoreVerifierScratchpadState(modal),
            captureScratchpadTabState: (modal) => captureVerifierScratchpadTabState(modal),
            restoreScratchpadTabState: (modal, state) => restoreVerifierScratchpadTabState(modal, state)
        };
        Context.dashboard.registerTab({
            id: 'verifier-fetcher',
            label: 'Verifier Fetcher',
            panelHtml() { return verifierFetcherPanelHtml(); },
            attachListeners(modal, dash) { attachVerifierFetcherListeners(modal, dash); },
            captureState(modal, dash) {
                const ops = Context.opsTab;
                if (ops && typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
            }
        });
        Logger.log('verifier-fetcher: tab registered');
    }
};
