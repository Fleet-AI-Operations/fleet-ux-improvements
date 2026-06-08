// ============= verifier-fetcher.js =============
// Verifier Fetcher tab for the Ops dashboard.

function verifierFetcherPanelHtml() {
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
                        <button type="button" id="wf-ops-fetch-verifier" class="wf-ops-action-btn" style="
                            flex-shrink: 0;
                            padding: 8px 14px;
                            font-size: 12px;
                            font-weight: 600;
                            color: var(--brand, #4f46e5);
                            background: var(--background, white);
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                        ">Fetch</button>
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
                <div id="wf-ops-verifier-content-search-wrap" style="
                    display: none;
                    flex-shrink: 0;
                    align-self: flex-start;
                    width: 30%;
                    max-width: 30%;
                    min-width: 12rem;
                    margin-top: 8px;
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
                        <button type="button" id="wf-ops-verifier-content-search-clear" title="Clear search" aria-label="Clear search" style="
                            display: none;
                            flex-shrink: 0;
                            width: 26px;
                            height: 26px;
                            padding: 0;
                            font-size: 16px;
                            line-height: 1;
                            font-weight: 600;
                            color: var(--muted-foreground, #64748b);
                            background: var(--background, white);
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                            cursor: pointer;
                            align-items: center;
                            justify-content: center;
                        ">&times;</button>
                    </span>
                    <span id="wf-ops-verifier-content-match-count" style="font-size: 11px; color: var(--muted-foreground, #64748b); white-space: nowrap; flex-shrink: 0;"></span>
                    <button type="button" id="wf-ops-verifier-content-prev" class="wf-ops-action-btn" style="
                        flex-shrink: 0;
                        padding: 6px 10px;
                        font-size: 11px;
                        font-weight: 600;
                        color: var(--foreground, #333);
                        background: var(--background, white);
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                    ">Prev</button>
                    <button type="button" id="wf-ops-verifier-content-next" class="wf-ops-action-btn" style="
                        flex-shrink: 0;
                        padding: 6px 10px;
                        font-size: 11px;
                        font-weight: 600;
                        color: var(--foreground, #333);
                        background: var(--background, white);
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                    ">Next</button>
                    <button type="button" id="wf-ops-copy-verifier" style="
                        display: none;
                        flex-shrink: 0;
                        padding: 6px 10px;
                        font-size: 11px;
                        font-weight: 500;
                        color: var(--muted-foreground, #666);
                        background: var(--background, white);
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        cursor: pointer;
                        transition: background 0.2s, color 0.2s;
                    ">Copy</button>
                </div>
                <div id="wf-ops-verifier-output-wrap" style="
                    display: none;
                    flex: 1;
                    min-height: 0;
                    width: 100%;
                    margin-top: 8px;
                    flex-direction: column;
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
                        background: var(--card, #fafafa);
                        color: var(--foreground, #333);
                        box-sizing: border-box;
                        overflow: auto;
                        white-space: pre-wrap;
                        word-break: break-word;
                        font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
                    "><code id="wf-ops-verifier-output" class="language-python"></code></pre>
                </div>
            </div>`;
}

function attachVerifierFetcherListeners(modal, dash) {
    const ops = Context.opsTab;
    if (!ops) return;
    if (modal.dataset.wfVerifierFetcherListenersAttached === '1') {
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
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            Logger.error('verifier-fetcher: dashboard loader not registered');
            return;
        }
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
