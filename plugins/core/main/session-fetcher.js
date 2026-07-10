// ============= session-fetcher.js =============
// Dev-only Session Fetcher tab for the Ops dashboard (raw JSON exploration).

const SF_STATE_KEY = 'fleet-ux:session-fetcher-state';
const SF_MONO_FONT = 'font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);';
const SF_DEFAULT_LIMIT = 100;
const SF_MAX_LIMIT = 1000;
const SF_STYLE_ID = 'wf-session-fetcher-styles';

const SF_TABLES = {
    sessions: {
        label: 'sessions',
        allKey: 'sessions.select_all',
        slimKey: 'sessions.select_slim'
    },
    qa_session_results: {
        label: 'qa_session_results',
        allKey: 'qa_session_results.select_all',
        slimKey: 'qa_session_results.select_slim'
    }
};

function sfDefaultState() {
    return {
        table: 'sessions',
        mode: 'latest',
        select: 'slim',
        idField: 'id',
        idValue: '',
        since: '',
        limit: SF_DEFAULT_LIMIT,
        lastJson: '',
        lastStatus: ''
    };
}

function sfReadState() {
    const defaults = sfDefaultState();
    try {
        const raw = Storage.getData(SF_STATE_KEY, null);
        if (!raw) return defaults;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || typeof parsed !== 'object') return defaults;
        return Object.assign(defaults, parsed);
    } catch (_e) {
        return defaults;
    }
}

function sfWriteState(state) {
    try {
        Storage.setData(SF_STATE_KEY, JSON.stringify(state || sfDefaultState()));
    } catch (err) {
        Logger.warn('session-fetcher: failed to persist state', err);
    }
}

function sfEnsureStyles() {
    if (document.getElementById(SF_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = SF_STYLE_ID;
    style.textContent = [
        '#wf-dash-modal .sf-seg-group {',
        '  display: inline-flex;',
        '  border-radius: 6px;',
        '  overflow: hidden;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: var(--background, #fff);',
        '}',
        '#wf-dash-modal .sf-seg-btn {',
        '  padding: 5px 12px;',
        '  font-size: 12px;',
        '  font-weight: 600;',
        '  border: none;',
        '  cursor: pointer;',
        '  background: transparent;',
        '  color: var(--foreground, #0f172a);',
        '  line-height: 1.4;',
        '}',
        '#wf-dash-modal .sf-seg-btn--divider {',
        '  border-right: 1px solid var(--border, #e2e8f0);',
        '}',
        '#wf-dash-modal .sf-seg-btn[aria-pressed="true"] {',
        '  background: var(--brand, var(--primary, #2563eb));',
        '  color: #ffffff;',
        '}',
        '#wf-dash-modal .sf-seg-btn:not([aria-pressed="true"]):hover {',
        '  background: color-mix(in srgb, var(--foreground, #0f172a) 6%, transparent);',
        '}'
    ].join('\n');
    document.head.appendChild(style);
}

function sfSegBtn(attrName, value, label, active, divider) {
    const divCls = divider ? ' sf-seg-btn--divider' : '';
    return `<button type="button" ${attrName}="${value}" class="sf-seg-btn${divCls}" aria-pressed="${active ? 'true' : 'false'}">${label}</button>`;
}

function sfToggleCell(labelStyle, title, innerHtml) {
    return `<div style="display:flex;flex-direction:column;gap:6px;min-width:0;">
        <div style="${labelStyle}">${title}</div>
        ${innerHtml}
    </div>`;
}

function sfBtnClass(variant, size) {
    if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
        return Context.uiLib.btnClass(variant, size);
    }
    const dash = Context.dashboard;
    return dash && typeof dash.dashBtnClass === 'function'
        ? dash.dashBtnClass(variant, size)
        : 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size;
}

function sfPanelStyles() {
    const loader = Context.dashboard && Context.dashboard._loader;
    return {
        input: loader && typeof loader._inputStyle === 'function'
            ? loader._inputStyle()
            : 'width: 100%; padding: 7px 10px; font-size: 12px; border: 1px solid var(--input, #cbd5e1); border-radius: 6px; background: var(--background, #fff); color: var(--foreground, #0f172a); box-sizing: border-box;',
        hint: loader && typeof loader._hintStyle === 'function'
            ? loader._hintStyle()
            : 'font-size: 11px; font-weight: 400; color: var(--muted-foreground, #64748b); letter-spacing: -0.01em;',
        label: loader && typeof loader._labelStyle === 'function'
            ? loader._labelStyle()
            : 'font-size: 11px; font-weight: 500; color: var(--muted-foreground, #64748b); letter-spacing: -0.01em;'
    };
}

function sessionFetcherPanelHtml() {
    sfEnsureStyles();
    const state = sfReadState();
    const styles = sfPanelStyles();
    const monoInput = styles.input + ' ' + SF_MONO_FONT;
    const table = SF_TABLES[state.table] ? state.table : 'sessions';
    const mode = state.mode === 'by_id' || state.mode === 'since' ? state.mode : 'latest';
    const select = state.select === 'all' ? 'all' : 'slim';
    const idField = state.idField === 'session_id' ? 'session_id' : 'id';
    const limit = Math.min(SF_MAX_LIMIT, Math.max(1, parseInt(state.limit, 10) || SF_DEFAULT_LIMIT));

    return `
            <div id="wf-ops-session-fetcher-panel" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; gap: 10px;">
                <div style="flex-shrink: 0;">
                    <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: var(--foreground, #0f172a);">
                        Session Fetcher
                    </h3>
                    <p style="${styles.hint} margin: 0 0 12px 0; line-height: 1.45;">
                        Explore <code>sessions</code> / <code>qa_session_results</code> via PostgREST. Results render as raw JSON.
                    </p>
                    <div style="display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: flex-end; margin-bottom: 10px;">
                        ${sfToggleCell(styles.label, 'Table', `<div class="sf-seg-group">${sfSegBtn('data-sf-table', 'sessions', 'sessions', table === 'sessions', true)}${sfSegBtn('data-sf-table', 'qa_session_results', 'qa_session_results', table === 'qa_session_results', false)}</div>`)}
                        ${sfToggleCell(styles.label, 'Mode', `<div class="sf-seg-group">${sfSegBtn('data-sf-mode', 'by_id', 'By ID', mode === 'by_id', true)}${sfSegBtn('data-sf-mode', 'latest', 'Latest', mode === 'latest', true)}${sfSegBtn('data-sf-mode', 'since', 'Since date', mode === 'since', false)}</div>`)}
                        ${sfToggleCell(styles.label, 'Select', `<div class="sf-seg-group">${sfSegBtn('data-sf-select', 'all', '*', select === 'all', true)}${sfSegBtn('data-sf-select', 'slim', 'slim', select === 'slim', false)}</div>`)}
                        <div id="wf-sf-id-field-wrap" style="display: ${table === 'qa_session_results' && mode === 'by_id' ? 'flex' : 'none'}; flex-direction: column; gap: 6px; min-width: 0;">
                            <div style="${styles.label}">ID field</div>
                            <div class="sf-seg-group">${sfSegBtn('data-sf-id-field', 'id', 'id', idField === 'id', true)}${sfSegBtn('data-sf-id-field', 'session_id', 'session_id', idField === 'session_id', false)}</div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px; width: 5.5rem;">
                            <label for="wf-sf-limit" style="${styles.label}">Limit</label>
                            <input type="number" id="wf-sf-limit" min="1" max="${SF_MAX_LIMIT}" value="${limit}" style="${styles.input}">
                        </div>
                    </div>
                    <div id="wf-sf-id-row" style="display: ${mode === 'by_id' ? 'flex' : 'none'}; gap: 8px; align-items: stretch; margin-bottom: 8px;">
                        <input type="text" id="wf-sf-id-input" placeholder="UUID" autocomplete="off" value="${String(state.idValue || '').replace(/"/g, '&quot;')}" style="${monoInput} flex: 1; min-width: 0;">
                    </div>
                    <div id="wf-sf-since-row" style="display: ${mode === 'since' ? 'flex' : 'none'}; gap: 8px; align-items: stretch; margin-bottom: 8px;">
                        <input type="date" id="wf-sf-since-input" value="${String(state.since || '').replace(/"/g, '&quot;')}" style="${styles.input} flex: 1; min-width: 0; max-width: 16rem;">
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <button type="button" id="wf-sf-fetch" class="${sfBtnClass('primary', 'regular')}" style="flex-shrink: 0;">Fetch</button>
                        <button type="button" id="wf-sf-copy" class="${sfBtnClass('secondary', 'nav')}" style="flex-shrink: 0; display: ${state.lastJson ? 'inline-flex' : 'none'};">Copy JSON</button>
                        <span id="wf-sf-status" style="${styles.hint} line-height: 1.45;">${String(state.lastStatus || '').replace(/</g, '&lt;')}</span>
                    </div>
                </div>
                <pre id="wf-sf-output" style="
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
                    white-space: pre;
                    ${SF_MONO_FONT}
                ">${String(state.lastJson || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>
            </div>`;
}

function sfCollectUiState(modal) {
    const state = sfReadState();
    if (!modal) return state;

    const pressed = (attr) => {
        const btn = modal.querySelector(`[${attr}][aria-pressed="true"]`);
        return btn ? btn.getAttribute(attr) : null;
    };

    const table = pressed('data-sf-table') || state.table;
    const mode = pressed('data-sf-mode') || state.mode;
    const select = pressed('data-sf-select') || state.select;
    const idField = pressed('data-sf-id-field') || state.idField;
    const idInput = modal.querySelector('#wf-sf-id-input');
    const sinceInput = modal.querySelector('#wf-sf-since-input');
    const limitInput = modal.querySelector('#wf-sf-limit');
    const output = modal.querySelector('#wf-sf-output');
    const status = modal.querySelector('#wf-sf-status');

    let limit = parseInt(limitInput && limitInput.value, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = SF_DEFAULT_LIMIT;
    limit = Math.min(SF_MAX_LIMIT, limit);

    return {
        table: SF_TABLES[table] ? table : 'sessions',
        mode: mode === 'by_id' || mode === 'since' ? mode : 'latest',
        select: select === 'all' ? 'all' : 'slim',
        idField: idField === 'session_id' ? 'session_id' : 'id',
        idValue: idInput ? String(idInput.value || '').trim() : '',
        since: sinceInput ? String(sinceInput.value || '').trim() : '',
        limit,
        lastJson: output ? output.textContent : state.lastJson,
        lastStatus: status ? status.textContent : state.lastStatus
    };
}

function sfSyncModeFields(modal) {
    if (!modal) return;
    const state = sfCollectUiState(modal);
    const idRow = modal.querySelector('#wf-sf-id-row');
    const sinceRow = modal.querySelector('#wf-sf-since-row');
    const idFieldWrap = modal.querySelector('#wf-sf-id-field-wrap');
    if (idRow) idRow.style.display = state.mode === 'by_id' ? 'flex' : 'none';
    if (sinceRow) sinceRow.style.display = state.mode === 'since' ? 'flex' : 'none';
    if (idFieldWrap) {
        idFieldWrap.style.display = (state.table === 'qa_session_results' && state.mode === 'by_id')
            ? 'flex'
            : 'none';
    }
}

function sfSetSegGroup(modal, attrName, value) {
    modal.querySelectorAll(`[${attrName}]`).forEach((btn) => {
        btn.setAttribute('aria-pressed', btn.getAttribute(attrName) === value ? 'true' : 'false');
    });
}

function sfSetStatus(modal, text) {
    const el = modal.querySelector('#wf-sf-status');
    if (el) el.textContent = text || '';
}

function sfSetOutput(modal, jsonText) {
    const output = modal.querySelector('#wf-sf-output');
    const copyBtn = modal.querySelector('#wf-sf-copy');
    if (output) output.textContent = jsonText || '';
    if (copyBtn) copyBtn.style.display = jsonText ? 'inline-flex' : 'none';
}

function sfPersistFromModal(modal) {
    const state = sfCollectUiState(modal);
    sfWriteState(state);
    return state;
}

function sfTimeColumn(table) {
    // sessions: started_at; qa_session_results: created_at (see local/PostgREST/message-2.md)
    return table === 'qa_session_results' ? 'created_at' : 'started_at';
}

function sfBuildQuery(state) {
    const tableCfg = SF_TABLES[state.table] || SF_TABLES.sessions;
    const queryKey = state.select === 'all' ? tableCfg.allKey : tableCfg.slimKey;
    const overrides = {};
    const timeCol = sfTimeColumn(state.table);

    if (state.mode === 'by_id') {
        const id = String(state.idValue || '').trim();
        if (!id) {
            throw new Error('Enter a UUID for By ID mode.');
        }
        const field = (state.table === 'qa_session_results' && state.idField === 'session_id')
            ? 'session_id'
            : 'id';
        overrides[field] = 'eq.' + id;
        overrides.limit = Math.min(SF_MAX_LIMIT, Math.max(1, state.limit || SF_DEFAULT_LIMIT));
    } else if (state.mode === 'since') {
        const since = String(state.since || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
            throw new Error('Enter a date (YYYY-MM-DD) for Since date mode.');
        }
        overrides[timeCol] = 'gte.' + since;
        overrides.order = timeCol + '.desc';
        overrides.limit = Math.min(SF_MAX_LIMIT, Math.max(1, state.limit || SF_DEFAULT_LIMIT));
    } else {
        overrides.order = timeCol + '.desc';
        overrides.limit = Math.min(SF_MAX_LIMIT, Math.max(1, state.limit || SF_DEFAULT_LIMIT));
    }

    return { queryKey, overrides };
}

async function sfHandleFetch(modal) {
    const ops = Context.opsTab;
    if (!ops || typeof ops.postgrestQuery !== 'function') {
        sfSetStatus(modal, 'Ops PostgREST client unavailable. Unlock Ops and try again.');
        Logger.warn('session-fetcher: fetch aborted — opsTab.postgrestQuery missing');
        return;
    }

    const state = sfCollectUiState(modal);
    let queryKey;
    let overrides;
    try {
        ({ queryKey, overrides } = sfBuildQuery(state));
    } catch (err) {
        sfSetStatus(modal, err && err.message ? err.message : String(err));
        Logger.warn('session-fetcher: invalid query options — ' + (err && err.message ? err.message : err));
        return;
    }

    const fetchBtn = modal.querySelector('#wf-sf-fetch');
    if (fetchBtn) fetchBtn.disabled = true;
    sfSetStatus(modal, 'Fetching…');
    Logger.log('session-fetcher: fetch start — ' + queryKey + ' mode=' + state.mode);

    try {
        if (typeof ops.whenOpsBundleReady === 'function') {
            await ops.whenOpsBundleReady({ timeoutMs: 15000 });
        }
        const rows = await ops.postgrestQuery(queryKey, overrides);
        const list = Array.isArray(rows) ? rows : (rows ? [rows] : []);
        const jsonText = JSON.stringify(list, null, 2);
        sfSetOutput(modal, jsonText);
        const status = list.length + ' row' + (list.length === 1 ? '' : 's');
        sfSetStatus(modal, status);
        sfPersistFromModal(modal);
        Logger.log('session-fetcher: fetch ok — ' + status + ' via ' + queryKey);
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        sfSetStatus(modal, msg);
        Logger.error('session-fetcher: fetch failed — ' + msg, err);
        if (ops.isSessionRefreshRequiredError && ops.isSessionRefreshRequiredError(err)) {
            Logger.warn('session-fetcher: Fleet session token not yet captured');
        }
    } finally {
        if (fetchBtn) fetchBtn.disabled = false;
    }
}

async function sfHandleCopy(modal, button) {
    const output = modal.querySelector('#wf-sf-output');
    const text = output ? output.textContent : '';
    if (!text || !String(text).trim()) {
        Logger.warn('session-fetcher: copy skipped — empty payload');
        if (Context.buttonFeedback && typeof Context.buttonFeedback.flashFailure === 'function') {
            Context.buttonFeedback.flashFailure(button, { includeBorder: true });
        }
        return;
    }
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            throw new Error('clipboard unavailable');
        }
        Logger.log('session-fetcher: copied ' + text.length + ' chars');
        if (Context.buttonFeedback && typeof Context.buttonFeedback.flashSuccess === 'function') {
            Context.buttonFeedback.flashSuccess(button, { includeBorder: true });
        }
    } catch (err) {
        Logger.error('session-fetcher: copy failed', err);
        if (Context.buttonFeedback && typeof Context.buttonFeedback.flashFailure === 'function') {
            Context.buttonFeedback.flashFailure(button, { includeBorder: true });
        }
    }
}

function attachSessionFetcherListeners(modal) {
    if (!modal) return;
    if (modal.dataset.wfSessionFetcherListenersAttached === '1') {
        sfSyncModeFields(modal);
        return;
    }
    modal.dataset.wfSessionFetcherListenersAttached = '1';
    sfEnsureStyles();
    sfSyncModeFields(modal);

    modal.addEventListener('click', (e) => {
        const tableBtn = e.target.closest('[data-sf-table]');
        if (tableBtn && modal.contains(tableBtn)) {
            sfSetSegGroup(modal, 'data-sf-table', tableBtn.getAttribute('data-sf-table'));
            sfSyncModeFields(modal);
            sfPersistFromModal(modal);
            return;
        }
        const modeBtn = e.target.closest('[data-sf-mode]');
        if (modeBtn && modal.contains(modeBtn)) {
            sfSetSegGroup(modal, 'data-sf-mode', modeBtn.getAttribute('data-sf-mode'));
            sfSyncModeFields(modal);
            sfPersistFromModal(modal);
            return;
        }
        const selectBtn = e.target.closest('[data-sf-select]');
        if (selectBtn && modal.contains(selectBtn)) {
            sfSetSegGroup(modal, 'data-sf-select', selectBtn.getAttribute('data-sf-select'));
            sfPersistFromModal(modal);
            return;
        }
        const idFieldBtn = e.target.closest('[data-sf-id-field]');
        if (idFieldBtn && modal.contains(idFieldBtn)) {
            sfSetSegGroup(modal, 'data-sf-id-field', idFieldBtn.getAttribute('data-sf-id-field'));
            sfPersistFromModal(modal);
        }
    });

    const fetchBtn = modal.querySelector('#wf-sf-fetch');
    const copyBtn = modal.querySelector('#wf-sf-copy');
    const idInput = modal.querySelector('#wf-sf-id-input');
    const sinceInput = modal.querySelector('#wf-sf-since-input');
    const limitInput = modal.querySelector('#wf-sf-limit');

    if (fetchBtn) {
        fetchBtn.addEventListener('click', () => { void sfHandleFetch(modal); });
    }
    if (copyBtn) {
        copyBtn.addEventListener('click', () => { void sfHandleCopy(modal, copyBtn); });
    }
    const onEnterFetch = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void sfHandleFetch(modal);
        }
    };
    if (idInput) {
        idInput.addEventListener('keydown', onEnterFetch);
        idInput.addEventListener('change', () => sfPersistFromModal(modal));
    }
    if (sinceInput) {
        sinceInput.addEventListener('keydown', onEnterFetch);
        sinceInput.addEventListener('change', () => sfPersistFromModal(modal));
    }
    if (limitInput) {
        limitInput.addEventListener('change', () => sfPersistFromModal(modal));
    }
}

const plugin = {
    id: 'session-fetcher',
    name: 'Session Fetcher',
    description: 'Dev-only PostgREST session / QA session results explorer for the Ops dashboard',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        if (!Context.isDevBranch) {
            Logger.debug('session-fetcher: skipped — not a dev branch build');
            return;
        }
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            Logger.error('session-fetcher: dashboard loader not registered');
            return;
        }
        Context.dashboard.registerTab({
            id: 'session-fetcher',
            label: 'Session Fetcher',
            panelHtml() { return sessionFetcherPanelHtml(); },
            attachListeners(modal) { attachSessionFetcherListeners(modal); },
            captureState(modal) {
                sfPersistFromModal(modal);
            }
        });
        this.initialState.registered = true;
        Logger.log('session-fetcher: tab registered');
    }
};
