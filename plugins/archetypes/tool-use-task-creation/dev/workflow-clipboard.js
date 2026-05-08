// ============= workflow-clipboard.js =============
// Floating popup that captures, names, browses, copies, and pastes workflow snapshots
// across tool-use pages (view-tool-use, create-tool-use). No URL match checking — saved
// workflows are page-agnostic and stored in a shared GM_storage list.
//
// Capture / apply logic mirrors plugins/archetypes/tool-use-task-creation/main/workflow-cache.js
// so saved snapshots are interoperable with the existing workflow-cache feature.

const plugin = {
    id: 'workflowClipboard',
    name: 'Workflow Clipboard',
    description: 'Capture, name, browse, copy, and paste workflow snapshots across tool-use pages. Toggle button sits above Show Logs; all controls live in the popup. Saved workflows are not URL-matched.',
    _version: '1.0',
    enabledByDefault: false,
    phase: 'mutation',

    storageKeys: {
        savedList: 'wf-clipboard-saves',
        popupOpen: 'wf-clipboard-popup-open'
    },

    initialState: {
        toggleButton: null,
        popup: null,
        listEl: null,
        nameInput: null,
        statusEl: null,
        applyInProgress: false,
        guardInterval: null,
        missingPanelLogged: false,
        toolPanelMissingLogged: false
    },

    selectors: {
        workflowPanel: '[data-ui="workflow-panel"]',
        workflowStepsContainer: '[data-ui="workflow-steps-container"]',
        workflowStep: '[data-ui="workflow-step"]',
        stepHeader: '[data-ui="step-header"]',
        stepParameters: '[data-ui="step-parameters"]',
        workflowToolbar: '[data-ui="workflow-toolbar"]',
        workflowClear: '[data-ui="workflow-clear"]',
        toolCard: '[data-ui="workflow-step"]',
        toolCardFallback: 'div.rounded-lg.border.transition-colors',
        toolHeader: '[data-ui="step-header"]',
        toolHeaderFallback: 'div.flex.items-center.gap-3.p-3.cursor-pointer.hover\\:bg-muted\\/30',
        stableParent: '[data-ui="workflow-steps-container"]',
        stableParentFallback: '.flex-1.px-16.py-4.max-w-screen-md.mx-auto',
        toolsContainer: '.space-y-3',
        workflowToolbarFallback: '.border-b.h-9',
        toolSearchInput: '[data-ui="tools-search"]',
        toolSearchInputFallback: 'input[placeholder="Search tools, descriptions, parameters..."]',
        toolClearButton: 'button.wf-clear-search-btn',
        toolTabList: '[role="tablist"]',
        toolTab: 'button[role="tab"]',
        toolListRoot: '[data-ui="tools-list"]',
        toolListRootFallback: 'div.p-2.space-y-1',
        toolListItem: '[data-ui="tool-item"]',
        toolListItemFallback: 'button.group\\/tool',
        toolAddToWorkflow: '[data-ui="tool-add-to-workflow"]'
    },

    onMutation(state, _context) {
        this._ensureUI(state);
    },

    // ─── UI ────────────────────────────────────────────────────────────────

    _ensureUI(state) {
        if (!document.body) return;
        const togglePresent = state.toggleButton && document.body.contains(state.toggleButton);
        const popupPresent = state.popup && document.body.contains(state.popup);
        if (togglePresent && popupPresent) return;

        this._teardownUI(state);
        this._buildUI(state);
        this._renderList(state);
        if (!state.guardInterval) {
            state.guardInterval = setInterval(() => this._ensureUI(state), 1500);
        }
        Logger.log(`${this.id}: ✓ UI mounted`);
    },

    _teardownUI(state) {
        if (state.toggleButton && state.toggleButton.parentNode) state.toggleButton.parentNode.removeChild(state.toggleButton);
        if (state.popup && state.popup.parentNode) state.popup.parentNode.removeChild(state.popup);
        state.toggleButton = null;
        state.popup = null;
        state.listEl = null;
        state.nameInput = null;
        state.statusEl = null;
    },

    _buildUI(state) {
        const toggle = document.createElement('button');
        toggle.id = 'wf-clipboard-toggle';
        toggle.type = 'button';
        toggle.textContent = 'Workflows';
        toggle.title = 'Workflow Clipboard — capture, save, browse, copy, paste workflows';
        Object.assign(toggle.style, {
            position: 'fixed',
            left: '20px',
            bottom: '120px',
            zIndex: '2147483646',
            padding: '6px 10px',
            fontSize: '12px',
            fontWeight: '600',
            borderRadius: '10px',
            border: '1px solid rgba(0,0,0,0.2)',
            background: '#1e3a8a',
            color: '#f9fafb',
            cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            userSelect: 'none'
        });
        toggle.addEventListener('click', () => this._togglePopup(state));

        const popup = this._buildPopup(state);

        document.body.appendChild(toggle);
        document.body.appendChild(popup);

        state.toggleButton = toggle;
        state.popup = popup;

        const initiallyOpen = Storage.get(this.storageKeys.popupOpen, false);
        popup.style.display = initiallyOpen ? 'flex' : 'none';
    },

    _buildPopup(state) {
        const popup = document.createElement('div');
        popup.id = 'wf-clipboard-popup';
        Object.assign(popup.style, {
            position: 'fixed',
            left: '20px',
            bottom: '160px',
            zIndex: '2147483646',
            width: '380px',
            maxHeight: '70vh',
            background: 'rgba(16, 18, 24, 0.97)',
            color: '#e5e7eb',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            display: 'none',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        });

        const header = document.createElement('div');
        Object.assign(header.style, {
            flex: '0 0 auto',
            padding: '8px 10px',
            fontSize: '12px',
            fontWeight: '700',
            background: 'rgba(255,255,255,0.06)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        });

        const title = document.createElement('span');
        title.textContent = 'Workflow Clipboard';

        const closeBtn = this._smallButton('×', 'Close');
        closeBtn.style.fontSize = '14px';
        closeBtn.addEventListener('click', () => this._togglePopup(state, false));

        header.appendChild(title);
        header.appendChild(closeBtn);

        const captureRow = document.createElement('div');
        Object.assign(captureRow.style, {
            flex: '0 0 auto',
            padding: '8px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            gap: '6px',
            alignItems: 'center'
        });

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Name…';
        Object.assign(nameInput.style, {
            flex: '1 1 auto',
            fontSize: '11px',
            padding: '5px 8px',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(15, 23, 42, 0.6)',
            color: '#e5e7eb',
            outline: 'none'
        });
        nameInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                this._captureCurrent(state);
            }
        });

        const captureBtn = this._smallButton('Capture current', 'Save the current workflow snapshot');
        captureBtn.addEventListener('click', () => this._captureCurrent(state));

        captureRow.appendChild(nameInput);
        captureRow.appendChild(captureBtn);

        const importRow = document.createElement('div');
        Object.assign(importRow.style, {
            flex: '0 0 auto',
            padding: '8px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
        });

        const importHint = document.createElement('div');
        importHint.textContent = 'Import workflow JSON:';
        importHint.style.fontSize = '10px';
        importHint.style.color = 'rgba(255,255,255,0.65)';

        const importTextarea = document.createElement('textarea');
        importTextarea.placeholder = '[ { "tool_name": { "param": "value" } }, … ]';
        importTextarea.rows = 3;
        Object.assign(importTextarea.style, {
            width: '100%',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '10px',
            padding: '5px 8px',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(15, 23, 42, 0.6)',
            color: '#e5e7eb',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box'
        });

        const importBtn = this._smallButton('Import as new save', 'Parse the JSON and save as new entry');
        importBtn.addEventListener('click', () => this._importFromText(state, importTextarea));

        importRow.appendChild(importHint);
        importRow.appendChild(importTextarea);
        importRow.appendChild(importBtn);

        const statusEl = document.createElement('div');
        Object.assign(statusEl.style, {
            flex: '0 0 auto',
            padding: '4px 10px',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.6)',
            minHeight: '16px',
            borderBottom: '1px solid rgba(255,255,255,0.05)'
        });

        const listEl = document.createElement('div');
        Object.assign(listEl.style, {
            flex: '1 1 auto',
            overflow: 'auto',
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
        });

        popup.appendChild(header);
        popup.appendChild(captureRow);
        popup.appendChild(importRow);
        popup.appendChild(statusEl);
        popup.appendChild(listEl);

        state.nameInput = nameInput;
        state.listEl = listEl;
        state.statusEl = statusEl;

        return popup;
    },

    _smallButton(text, title) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        if (title) btn.title = title;
        Object.assign(btn.style, {
            fontSize: '11px',
            padding: '4px 8px',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.05)',
            color: '#e5e7eb',
            cursor: 'pointer',
            fontWeight: '500',
            whiteSpace: 'nowrap'
        });
        btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.12)'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.05)'; });
        return btn;
    },

    _togglePopup(state, forceValue) {
        if (!state.popup) return;
        const isOpen = state.popup.style.display !== 'none';
        const next = (typeof forceValue === 'boolean') ? forceValue : !isOpen;
        state.popup.style.display = next ? 'flex' : 'none';
        Storage.set(this.storageKeys.popupOpen, next);
        if (next) {
            this._renderList(state);
            this._setStatus(state, '');
        }
        Logger.log(`${this.id}: popup ${next ? 'opened' : 'closed'}`);
    },

    _setStatus(state, msg, color) {
        if (!state.statusEl) return;
        state.statusEl.textContent = msg || '';
        state.statusEl.style.color = color || 'rgba(255,255,255,0.6)';
    },

    _flashStatus(state, msg, color, ms) {
        this._setStatus(state, msg, color);
        if (state._statusTimeout) clearTimeout(state._statusTimeout);
        state._statusTimeout = setTimeout(() => this._setStatus(state, ''), ms || 2200);
    },

    // ─── List rendering ────────────────────────────────────────────────────

    _renderList(state) {
        if (!state.listEl) return;
        const saves = this._loadSaves();
        state.listEl.innerHTML = '';

        if (saves.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No saved workflows yet. Capture the current page or import JSON above.';
            Object.assign(empty.style, {
                fontSize: '11px',
                color: 'rgba(255,255,255,0.45)',
                padding: '12px 6px',
                textAlign: 'center'
            });
            state.listEl.appendChild(empty);
            return;
        }

        saves.forEach((entry) => {
            state.listEl.appendChild(this._buildEntryRow(state, entry));
        });
    },

    _buildEntryRow(state, entry) {
        const row = document.createElement('div');
        Object.assign(row.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '6px 8px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '6px'
        });

        const topLine = document.createElement('div');
        Object.assign(topLine.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
        });

        const nameEl = document.createElement('input');
        nameEl.type = 'text';
        nameEl.value = entry.name || '(unnamed)';
        Object.assign(nameEl.style, {
            flex: '1 1 auto',
            fontSize: '11px',
            fontWeight: '600',
            padding: '3px 6px',
            borderRadius: '4px',
            border: '1px solid transparent',
            background: 'transparent',
            color: '#e5e7eb',
            outline: 'none'
        });
        nameEl.addEventListener('focus', () => { nameEl.style.border = '1px solid rgba(255,255,255,0.2)'; nameEl.style.background = 'rgba(15, 23, 42, 0.6)'; });
        nameEl.addEventListener('blur', () => {
            nameEl.style.border = '1px solid transparent';
            nameEl.style.background = 'transparent';
            const newName = (nameEl.value || '').trim() || '(unnamed)';
            if (newName !== entry.name) {
                this._renameEntry(state, entry.id, newName);
            }
        });
        nameEl.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); nameEl.blur(); }
            if (ev.key === 'Escape') { ev.preventDefault(); nameEl.value = entry.name; nameEl.blur(); }
        });

        const countBadge = document.createElement('span');
        const toolCount = Array.isArray(entry.snapshot) ? entry.snapshot.length : 0;
        countBadge.textContent = `${toolCount} tool${toolCount === 1 ? '' : 's'}`;
        Object.assign(countBadge.style, {
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '999px',
            background: 'rgba(99, 102, 241, 0.25)',
            color: '#c7d2fe',
            whiteSpace: 'nowrap'
        });

        topLine.appendChild(nameEl);
        topLine.appendChild(countBadge);

        const metaLine = document.createElement('div');
        Object.assign(metaLine.style, {
            fontSize: '9px',
            color: 'rgba(255,255,255,0.4)',
            paddingLeft: '6px',
            wordBreak: 'break-all'
        });
        const dateStr = entry.savedAt ? new Date(entry.savedAt).toLocaleString() : '';
        metaLine.textContent = dateStr;

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, {
            display: 'flex',
            gap: '4px',
            flexWrap: 'wrap'
        });

        const applyBtn = this._smallButton('Paste', 'Apply this workflow to the current page');
        applyBtn.addEventListener('click', () => this._applyEntry(state, entry, applyBtn));

        const copyBtn = this._smallButton('Copy JSON', 'Copy the snapshot as JSON to clipboard');
        copyBtn.addEventListener('click', () => this._copyEntryJson(state, entry, copyBtn));

        const overwriteBtn = this._smallButton('Overwrite', 'Replace this snapshot with the current page workflow');
        overwriteBtn.addEventListener('click', () => this._overwriteEntry(state, entry));

        const delBtn = this._smallButton('Delete', 'Delete this saved workflow');
        delBtn.style.color = '#fca5a5';
        delBtn.addEventListener('click', () => this._deleteEntry(state, entry));

        btnRow.appendChild(applyBtn);
        btnRow.appendChild(copyBtn);
        btnRow.appendChild(overwriteBtn);
        btnRow.appendChild(delBtn);

        row.appendChild(topLine);
        if (dateStr) row.appendChild(metaLine);
        row.appendChild(btnRow);

        return row;
    },

    // ─── Persistence ───────────────────────────────────────────────────────

    _loadSaves() {
        const raw = Storage.get(this.storageKeys.savedList, '[]');
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            Logger.error(`${this.id}: failed to parse saved list, resetting`, e);
            return [];
        }
    },

    _writeSaves(saves) {
        Storage.set(this.storageKeys.savedList, JSON.stringify(saves));
    },

    _newId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },

    _captureCurrent(state) {
        const panel = this.findWorkflowPanel();
        const stableParent = this.findStableParent(panel);
        const container = stableParent ? this.getToolsContainer(stableParent) : null;
        if (!container) {
            this._flashStatus(state, 'No workflow on this page to capture.', '#fca5a5');
            Logger.warn(`${this.id}: capture failed, no workflow container found`);
            return;
        }

        const snapshot = this.captureSnapshot(container);
        if (!snapshot.length) {
            this._flashStatus(state, 'Workflow is empty — nothing to save.', '#fca5a5');
            return;
        }

        const userName = (state.nameInput && state.nameInput.value || '').trim();
        const name = userName || this._suggestName(snapshot);
        const entry = {
            id: this._newId(),
            name,
            snapshot,
            savedAt: new Date().toISOString(),
            sourceUrl: window.location.href
        };

        const saves = this._loadSaves();
        saves.unshift(entry);
        this._writeSaves(saves);
        if (state.nameInput) state.nameInput.value = '';
        this._renderList(state);
        this._flashStatus(state, `Saved "${name}" (${snapshot.length} tools).`, '#86efac');
        Logger.log(`${this.id}: ✓ captured "${name}" with ${snapshot.length} tools`);
    },

    _suggestName(snapshot) {
        const names = (snapshot || []).map(entry => Object.keys(entry || {})[0]).filter(Boolean);
        const head = names.slice(0, 2).join(' + ');
        const dt = new Date().toISOString().replace(/[T:]/g, ' ').slice(0, 16);
        if (head) return `${head} — ${dt}`;
        return `Workflow — ${dt}`;
    },

    _renameEntry(state, id, newName) {
        const saves = this._loadSaves();
        const idx = saves.findIndex(s => s.id === id);
        if (idx < 0) return;
        saves[idx].name = newName;
        this._writeSaves(saves);
        Logger.log(`${this.id}: renamed entry to "${newName}"`);
    },

    _overwriteEntry(state, entry) {
        const panel = this.findWorkflowPanel();
        const stableParent = this.findStableParent(panel);
        const container = stableParent ? this.getToolsContainer(stableParent) : null;
        if (!container) {
            this._flashStatus(state, 'No workflow on this page to capture.', '#fca5a5');
            return;
        }
        const snapshot = this.captureSnapshot(container);
        if (!snapshot.length) {
            this._flashStatus(state, 'Workflow is empty — nothing to save.', '#fca5a5');
            return;
        }
        const saves = this._loadSaves();
        const idx = saves.findIndex(s => s.id === entry.id);
        if (idx < 0) return;
        saves[idx].snapshot = snapshot;
        saves[idx].savedAt = new Date().toISOString();
        saves[idx].sourceUrl = window.location.href;
        this._writeSaves(saves);
        this._renderList(state);
        this._flashStatus(state, `Overwrote "${saves[idx].name}" (${snapshot.length} tools).`, '#86efac');
        Logger.log(`${this.id}: ✓ overwrote "${saves[idx].name}"`);
    },

    _deleteEntry(state, entry) {
        const saves = this._loadSaves().filter(s => s.id !== entry.id);
        this._writeSaves(saves);
        this._renderList(state);
        this._flashStatus(state, `Deleted "${entry.name}".`, '#fca5a5');
        Logger.log(`${this.id}: deleted "${entry.name}"`);
    },

    async _copyEntryJson(state, entry, btn) {
        const text = JSON.stringify(entry.snapshot, null, 2);
        const originalBg = btn ? btn.style.background : null;
        try {
            await navigator.clipboard.writeText(text);
            if (btn) {
                btn.style.background = 'rgba(34,197,94,0.35)';
                setTimeout(() => { if (originalBg !== null) btn.style.background = originalBg; }, 1000);
            }
            Logger.log(`${this.id}: ✓ copied "${entry.name}" (${text.length} chars)`);
        } catch (e) {
            if (btn) {
                btn.style.background = 'rgba(239,68,68,0.45)';
                setTimeout(() => { if (originalBg !== null) btn.style.background = originalBg; }, 500);
            }
            Logger.error(`${this.id}: clipboard write failed`, e);
        }
    },

    _importFromText(state, textarea) {
        const text = (textarea && textarea.value || '').trim();
        if (!text) {
            this._flashStatus(state, 'Paste workflow JSON first.', '#fca5a5');
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            this._flashStatus(state, 'Invalid JSON.', '#fca5a5');
            Logger.warn(`${this.id}: import JSON parse failed`, e);
            return;
        }
        if (!Array.isArray(parsed)) {
            this._flashStatus(state, 'JSON must be an array of {toolName: params}.', '#fca5a5');
            return;
        }
        const userName = (state.nameInput && state.nameInput.value || '').trim();
        const name = userName || this._suggestName(parsed);
        const entry = {
            id: this._newId(),
            name,
            snapshot: parsed,
            savedAt: new Date().toISOString(),
            sourceUrl: ''
        };
        const saves = this._loadSaves();
        saves.unshift(entry);
        this._writeSaves(saves);
        textarea.value = '';
        if (state.nameInput) state.nameInput.value = '';
        this._renderList(state);
        this._flashStatus(state, `Imported "${name}" (${parsed.length} tools).`, '#86efac');
        Logger.log(`${this.id}: ✓ imported "${name}" with ${parsed.length} tools`);
    },

    async _applyEntry(state, entry, btn) {
        if (state.applyInProgress) {
            this._flashStatus(state, 'Apply already in progress…', '#fcd34d');
            return;
        }
        const originalBg = btn ? btn.style.background : null;
        if (btn) btn.style.background = 'rgba(59,130,246,0.35)';
        try {
            await this.applyCachedWorkflow(state, entry.snapshot);
            this._flashStatus(state, `Applied "${entry.name}".`, '#86efac');
            if (btn) btn.style.background = 'rgba(34,197,94,0.35)';
        } catch (e) {
            Logger.error(`${this.id}: apply failed`, e);
            this._flashStatus(state, `Apply failed: ${e.message || e}`, '#fca5a5');
            if (btn) btn.style.background = 'rgba(239,68,68,0.45)';
        } finally {
            setTimeout(() => { if (btn && originalBg !== null) btn.style.background = originalBg; }, 1000);
        }
    },

    // ─── Capture (mirrors workflow-cache.js) ───────────────────────────────

    getToolsContainer(stableParent) {
        if (!stableParent) return null;
        if (stableParent.getAttribute && stableParent.getAttribute('data-ui') === 'workflow-steps-container') {
            const spaceY3 = stableParent.querySelector(':scope > ' + this.selectors.toolsContainer);
            return spaceY3 || stableParent;
        }
        return stableParent.querySelector(':scope > ' + this.selectors.toolsContainer) ||
            stableParent.querySelector(this.selectors.toolsContainer);
    },

    captureSnapshot(container) {
        if (!container) return [];
        let cards = container.querySelectorAll(this.selectors.toolCard);
        if (!cards.length) cards = container.querySelectorAll(this.selectors.toolCardFallback);
        if (!cards.length) return [];
        const out = [];
        cards.forEach((card) => {
            const name = this.getToolNameFromCard(card);
            const params = this.getParamsFromCard(card);
            const filteredParams = {};
            Object.keys(params).forEach(k => {
                const v = params[k];
                if (this.hasValue(v)) filteredParams[k] = v;
            });
            const toolKey = name || '(unknown)';
            out.push({ [toolKey]: filteredParams });
        });
        return out;
    },

    hasValue(v) {
        if (v === null || v === undefined) return false;
        if (typeof v === 'string') return v.length > 0;
        if (typeof v === 'number') return !Number.isNaN(v);
        if (typeof v === 'boolean') return v === true;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return true;
    },

    getToolNameFromCard(card) {
        const byDataUi = card.getAttribute('data-ui-name');
        if (byDataUi) return byDataUi.trim();
        const header = card.querySelector(this.selectors.toolHeader) || card.querySelector(this.selectors.toolHeaderFallback);
        if (!header) return '';
        const span = header.querySelector('span.font-mono.text-sm.font-medium');
        return span ? span.textContent.trim() : '';
    },

    getParamsFromCard(card) {
        const params = {};
        let spaceY3 = card.querySelector(this.selectors.stepParameters);
        if (!spaceY3) {
            const content = card.querySelector('div[data-state="open"] div.px-3.pb-3.space-y-3');
            if (!content) return params;
            spaceY3 = content.querySelector('div.space-y-3');
            if (!spaceY3) return params;
        }
        const blocks = spaceY3.querySelectorAll('[data-param]');
        const blockList = blocks.length ? Array.from(blocks) : Array.from(spaceY3.children).filter(el => el.nodeType === Node.ELEMENT_NODE && el.matches && (el.matches('div.flex.flex-col.gap-1\\.5') || el.matches('div.flex.flex-col.gap-2')));
        blockList.forEach(block => {
            const name = this.getParamNameFromBlock(block);
            if (!name) return;
            const typeLabel = this.getParamTypeFromBlock(block);
            const value = this.getParamValueFromBlock(block, typeLabel);
            if (value !== undefined) params[name] = value;
        });
        return params;
    },

    getParamNameFromBlock(block) {
        const byDataParam = block.getAttribute('data-param');
        if (byDataParam) return byDataParam.trim();
        const code = block.querySelector('code.text-xs.font-mono');
        if (code) return code.textContent.trim();
        const label = block.querySelector('label[for^="param-"]');
        if (label) return label.textContent.trim();
        return '';
    },

    getParamTypeFromBlock(block) {
        const byDataParamType = block.getAttribute('data-param-type');
        if (byDataParamType) return (byDataParamType || '').trim().toLowerCase().replace(/\s+/g, '');
        const typeDiv = block.querySelector('div.inline-flex.whitespace-nowrap.rounded-md.border.font-medium');
        if (!typeDiv) return '';
        const raw = (typeDiv.textContent || '').trim().toLowerCase();
        return raw.replace(/\s+/g, '');
    },

    getParamValueFromBlock(block, typeLabel) {
        if (!typeLabel) return this.getParamValueFromBlockInferred(block);
        if (typeLabel === 'string') {
            const input = block.querySelector('input[type="text"]');
            if (input) return input.value.trim() || undefined;
            const textarea = block.querySelector('textarea');
            if (textarea) return textarea.value.trim() || undefined;
            return undefined;
        }
        if (typeLabel === 'object') {
            const obj = this.getObjectValueFromBlock(block);
            if (obj !== undefined) return obj;
            const input = block.querySelector('input[type="text"]');
            if (input) return input.value.trim() || undefined;
            const textarea = block.querySelector('textarea');
            if (textarea) return textarea.value.trim() || undefined;
            return undefined;
        }
        if (typeLabel === 'integer' || typeLabel === 'number') {
            const input = block.querySelector('input[type="number"]');
            if (!input) return undefined;
            const s = input.value.trim();
            if (s === '') return undefined;
            const n = Number(s);
            return Number.isNaN(n) ? s : n;
        }
        if (typeLabel === 'boolean') {
            const btn = block.querySelector('button[role="checkbox"]');
            if (!btn) return undefined;
            return btn.getAttribute('data-state') === 'checked';
        }
        if (typeLabel === 'enum') {
            const btn = block.querySelector('button[role="combobox"]');
            if (!btn) return undefined;
            const span = btn.querySelector('span.flex-1.flex') || btn.querySelector('span[style*="pointer-events"]');
            const text = span ? (span.textContent || '').trim() : '';
            return text || undefined;
        }
        if (typeLabel === 'enum[]' || typeLabel.includes('enum[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1');
            if (!wrap) return undefined;
            const combos = wrap.querySelectorAll('button[role="combobox"]');
            const arr = [];
            combos.forEach(btn => {
                const span = btn.querySelector('span.flex-1.flex') || btn.querySelector('span[style*="pointer-events"]');
                const text = span ? (span.textContent || '').trim() : '';
                if (text) arr.push(text);
            });
            return arr.length ? arr : undefined;
        }
        if (typeLabel === 'string[]' || typeLabel.includes('string[]') || typeLabel === 'any[]' || typeLabel.includes('any[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1');
            if (!wrap) return undefined;
            const inputs = wrap.querySelectorAll('div.flex.items-center.gap-2 input[type="text"]');
            const arr = [];
            inputs.forEach(inp => {
                const v = inp.value.trim();
                if (v) arr.push(v);
            });
            return arr.length ? arr : undefined;
        }
        if (typeLabel === 'integer[]' || typeLabel.includes('integer[]') || typeLabel === 'number[]' || typeLabel.includes('number[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1');
            if (!wrap) return undefined;
            const inputs = wrap.querySelectorAll('div.flex.items-center.gap-2 input[type="number"]');
            const arr = [];
            inputs.forEach(inp => {
                const s = inp.value.trim();
                if (s === '') return;
                const n = Number(s);
                arr.push(Number.isNaN(n) ? s : n);
            });
            return arr.length ? arr : undefined;
        }
        if (typeLabel === 'object[]' || typeLabel.includes('object[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1') || block;
            const items = Array.from(wrap.children).filter(el => el.nodeType === Node.ELEMENT_NODE && el.matches && el.matches('div.relative.border.rounded-md.p-3[class*="bg-muted"]'));
            if (!items.length) return undefined;
            const arr = [];
            items.forEach(item => {
                const innerBlocks = this.getNestedBlocksFromObjectItem(item);
                if (!innerBlocks.length) return;
                const obj = this.buildObjectFromBlocks(innerBlocks);
                if (this.hasValue(obj)) arr.push(obj);
            });
            return arr.length ? arr : undefined;
        }
        return undefined;
    },

    getParamValueFromBlockInferred(block) {
        const input = block.querySelector('input[type="text"]');
        if (input) return input.value.trim() || undefined;
        const textarea = block.querySelector('textarea');
        if (textarea) return textarea.value.trim() || undefined;
        const numInput = block.querySelector('input[type="number"]');
        if (numInput) {
            const s = numInput.value.trim();
            if (s === '') return undefined;
            const n = Number(s);
            return Number.isNaN(n) ? s : n;
        }
        return undefined;
    },

    getObjectValueFromBlock(block) {
        const innerBlocks = this.getNestedBlocksFromObjectBlock(block);
        if (!innerBlocks.length) return undefined;
        const obj = this.buildObjectFromBlocks(innerBlocks);
        return this.hasValue(obj) ? obj : undefined;
    },

    buildObjectFromBlocks(blocks) {
        const obj = {};
        blocks.forEach(innerBlock => {
            const name = this.getParamNameFromBlock(innerBlock);
            if (!name) return;
            const innerType = this.getParamTypeFromBlock(innerBlock);
            const val = this.getParamValueFromBlock(innerBlock, innerType);
            if (val !== undefined && this.hasValue(val)) obj[name] = val;
        });
        return obj;
    },

    getNestedBlocksFromObjectBlock(block) {
        const nestedContainer =
            block.querySelector('div.ml-4.pl-3.border-l-2') ||
            block.querySelector('div.ml-4.pl-3') ||
            block.querySelector('div.space-y-3');
        if (!nestedContainer) return [];
        return Array.from(nestedContainer.children).filter(el => el.nodeType === Node.ELEMENT_NODE && el.matches && el.matches('div.flex.flex-col.gap-1\\.5'));
    },

    getNestedBlocksFromObjectItem(item) {
        const innerSpace = item.querySelector('div.space-y-3');
        if (!innerSpace) return [];
        return Array.from(innerSpace.children).filter(el => el.nodeType === Node.ELEMENT_NODE && el.matches && el.matches('div.flex.flex-col.gap-1\\.5'));
    },

    // ─── Apply (mirrors workflow-cache.js) ─────────────────────────────────

    async applyCachedWorkflow(state, entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            throw new Error('snapshot is empty');
        }
        if (state.applyInProgress) throw new Error('apply already in progress');

        const panel = this.findWorkflowPanel();
        const stableParent = this.findStableParent(panel);
        if (!panel || !stableParent) throw new Error('workflow panel not found');

        const toolPanelRoot = this.findToolPanelRoot();
        if (!toolPanelRoot) throw new Error('tool panel not found (view-only page?)');

        state.applyInProgress = true;
        Logger.info(`${this.id}: apply started (${entries.length} tools)`);

        try {
            this.clearToolSearch(toolPanelRoot);
            const tabInfo = await this.buildToolTabMap(toolPanelRoot);
            if (!tabInfo || Object.keys(tabInfo.toolToTab).length === 0) {
                throw new Error('no tools indexed in tool panel');
            }

            const toolsContainer = this.getToolsContainer(stableParent);
            await this.clearWorkflowTools(panel, toolsContainer);

            for (const entry of entries) {
                if (!entry || typeof entry !== 'object') continue;
                const keys = Object.keys(entry);
                if (keys.length !== 1) continue;
                const toolName = keys[0].trim();
                if (!toolName) continue;
                const params = entry[toolName] || {};

                const tabName = tabInfo.toolToTab[toolName];
                if (!tabName) {
                    Logger.warn(`${this.id}: tool not found in panel: ${toolName}`);
                    continue;
                }
                await this.switchToToolTab(tabInfo, tabName, toolPanelRoot);

                const callBtn = this.findToolCallButton(toolPanelRoot, toolName);
                if (!callBtn) {
                    Logger.warn(`${this.id}: call button not found for ${toolName}`);
                    continue;
                }

                const currentContainer = this.getToolsContainer(stableParent);
                const prevCount = currentContainer ? this._queryToolCards(currentContainer).length : 0;
                callBtn.click();

                const newCard = await this.waitForNewToolCard(stableParent, prevCount);
                if (!newCard) {
                    Logger.warn(`${this.id}: tool card did not appear for ${toolName}`);
                    continue;
                }
                await this.applyParamsToCard(newCard, params);
            }
            Logger.info(`${this.id}: apply finished`);
        } finally {
            state.applyInProgress = false;
        }
    },

    findToolPanelRoot() {
        let input = document.querySelector(this.selectors.toolSearchInput);
        if (!input) input = document.querySelector(this.selectors.toolSearchInputFallback);
        if (!input) return null;
        const toolsPanel = input.closest('[data-ui="tools-panel"]');
        if (toolsPanel) return toolsPanel;
        let el = input.parentElement;
        while (el && el !== document.body) {
            if (el.querySelector(this.selectors.toolTabList) || el.querySelector(this.selectors.toolListRoot) || el.querySelector(this.selectors.toolListRootFallback)) {
                return el;
            }
            el = el.parentElement;
        }
        return input.closest('[data-panel-id][data-panel]') || input.closest('[data-panel]') || input.parentElement;
    },

    clearToolSearch(toolPanelRoot) {
        if (!toolPanelRoot) return;
        const input = toolPanelRoot.querySelector(this.selectors.toolSearchInput) || toolPanelRoot.querySelector(this.selectors.toolSearchInputFallback);
        if (!input) return;
        const clearBtn = toolPanelRoot.querySelector(this.selectors.toolClearButton);
        if (clearBtn && clearBtn.offsetParent !== null) {
            clearBtn.click();
            return;
        }
        this.setInputValue(input, '');
    },

    async buildToolTabMap(toolPanelRoot) {
        const toolToTab = {};
        const tabButtons = {};
        const tabList = toolPanelRoot.querySelector(this.selectors.toolTabList);
        const tabs = tabList ? Array.from(tabList.querySelectorAll(this.selectors.toolTab)) : [];

        if (!tabs.length) {
            const tools = this.readToolList(toolPanelRoot);
            tools.forEach(tool => { toolToTab[tool.name] = '(single)'; });
            return { toolToTab, tabButtons };
        }

        const listRoot = toolPanelRoot.querySelector(this.selectors.toolListRoot) || toolPanelRoot.querySelector(this.selectors.toolListRootFallback);
        for (const tab of tabs) {
            const tabName = this.getTabLabel(tab);
            if (!tabName) continue;
            tabButtons[tabName] = tab;
            const prevNames = listRoot ? this.readToolNamesFromList(listRoot) : [];
            this.activateTab(tab);
            await this.waitForTabActive(tab);
            if (listRoot) await this.waitForToolListChange(listRoot, prevNames);
            else await this.waitForAnimationFrame();
            const tools = this.readToolList(toolPanelRoot);
            tools.forEach(tool => { toolToTab[tool.name] = tabName; });
        }
        return { toolToTab, tabButtons };
    },

    getTabLabel(tabBtn) {
        if (!tabBtn) return '';
        const countEl = tabBtn.querySelector('div.inline-flex.items-center.whitespace-nowrap.rounded-md.border');
        const countText = countEl ? countEl.textContent.trim() : '';
        let label = tabBtn.textContent.trim();
        if (countText) label = label.replace(countText, '').trim();
        return label;
    },

    activateTab(tabBtn) {
        if (!tabBtn) return;
        tabBtn.focus();
        tabBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
        tabBtn.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
    },

    async switchToToolTab(tabInfo, tabName, toolPanelRoot) {
        if (!tabInfo || !tabInfo.tabButtons || !tabInfo.tabButtons[tabName]) return;
        const tab = tabInfo.tabButtons[tabName];
        const listRoot = toolPanelRoot ? (toolPanelRoot.querySelector(this.selectors.toolListRoot) || toolPanelRoot.querySelector(this.selectors.toolListRootFallback)) : null;
        const prevNames = listRoot ? this.readToolNamesFromList(listRoot) : [];
        this.activateTab(tab);
        await this.waitForTabActive(tab);
        if (listRoot) await this.waitForToolListChange(listRoot, prevNames);
        else await this.waitForAnimationFrame();
    },

    readToolList(toolPanelRoot) {
        const listRoot = toolPanelRoot.querySelector(this.selectors.toolListRoot) || toolPanelRoot.querySelector(this.selectors.toolListRootFallback);
        if (!listRoot) return [];
        let items = Array.from(listRoot.querySelectorAll(this.selectors.toolListItem));
        if (!items.length) items = Array.from(listRoot.querySelectorAll(this.selectors.toolListItemFallback));
        const tools = [];
        for (const item of items) {
            const name = this.getToolNameFromListItem(item);
            if (!name) continue;
            tools.push({ name, item });
        }
        return tools;
    },

    getToolNameFromListItem(item) {
        const byDataUi = item.getAttribute('data-ui-name');
        if (byDataUi) return this.normalizeToolName(byDataUi);
        const primary = item.querySelector('span.text-xs.font-medium.text-foreground span span');
        const fallback = item.querySelector('span.text-xs.font-medium.text-foreground');
        const text = primary ? primary.textContent : (fallback ? fallback.textContent : item.textContent);
        return this.normalizeToolName(text);
    },

    findToolCallButton(toolPanelRoot, toolName) {
        const listRoot = toolPanelRoot.querySelector(this.selectors.toolListRoot) || toolPanelRoot.querySelector(this.selectors.toolListRootFallback);
        if (!listRoot) return null;
        let items = Array.from(listRoot.querySelectorAll(this.selectors.toolListItem));
        if (!items.length) items = Array.from(listRoot.querySelectorAll(this.selectors.toolListItemFallback));
        const target = this.normalizeToolName(toolName);
        for (const item of items) {
            const name = this.getToolNameFromListItem(item);
            if (!name || name !== target) continue;
            const callBtn = item.querySelector(this.selectors.toolAddToWorkflow);
            if (callBtn) return callBtn;
            const btns = Array.from(item.querySelectorAll('button'));
            return btns.find(btn => btn.textContent.trim() === 'Call') || null;
        }
        return null;
    },

    normalizeToolName(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    },

    readToolNamesFromList(listRoot) {
        let items = Array.from(listRoot.querySelectorAll(this.selectors.toolListItem));
        if (!items.length) items = Array.from(listRoot.querySelectorAll(this.selectors.toolListItemFallback));
        return items.map(item => this.getToolNameFromListItem(item)).filter(Boolean);
    },

    waitForTabActive(tabBtn, timeoutMs = 50) {
        if (!tabBtn) return Promise.resolve(false);
        const isActive = () => tabBtn.getAttribute('data-state') === 'active' || tabBtn.getAttribute('aria-selected') === 'true';
        if (isActive()) return Promise.resolve(true);
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                if (isActive()) { observer.disconnect(); resolve(true); }
            });
            observer.observe(tabBtn, { attributes: true, attributeFilter: ['data-state', 'aria-selected'] });
            setTimeout(() => { observer.disconnect(); resolve(isActive()); }, timeoutMs);
        });
    },

    waitForToolListChange(listRoot, prevNames, timeoutMs = 50) {
        if (!listRoot) return Promise.resolve(false);
        const prevKey = (prevNames || []).join('|');
        const isChanged = () => this.readToolNamesFromList(listRoot).join('|') !== prevKey;
        if (isChanged()) return Promise.resolve(true);
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                if (isChanged()) { observer.disconnect(); resolve(true); }
            });
            observer.observe(listRoot, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); resolve(isChanged()); }, timeoutMs);
        });
    },

    async clearWorkflowTools(panel, toolsContainer) {
        if (!toolsContainer) return;
        let clearBtn = panel.querySelector(this.selectors.workflowClear);
        if (!clearBtn) {
            const toolbar = panel.querySelector(this.selectors.workflowToolbar) || panel.querySelector(this.selectors.workflowToolbarFallback);
            if (!toolbar) return;
            clearBtn = Array.from(toolbar.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Clear');
        }
        if (!clearBtn) return;
        clearBtn.click();
        await this.waitForContainerEmpty(toolsContainer);
    },

    _queryToolCards(container) {
        let cards = container.querySelectorAll(this.selectors.toolCard);
        if (!cards.length) cards = container.querySelectorAll(this.selectors.toolCardFallback);
        return cards;
    },

    async waitForContainerEmpty(container, timeoutMs = 50) {
        if (!container) return true;
        if (this._queryToolCards(container).length === 0) return true;
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                if (this._queryToolCards(container).length === 0) { observer.disconnect(); resolve(true); }
            });
            observer.observe(container, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); resolve(false); }, timeoutMs);
        });
    },

    async waitForNewToolCard(stableParent, previousCount, timeoutMs = 50) {
        if (!stableParent) return null;
        const container = this.getToolsContainer(stableParent);
        if (container) {
            const cards = this._queryToolCards(container);
            if (cards.length > previousCount) return cards[previousCount] ?? null;
        }
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const c = this.getToolsContainer(stableParent);
                if (!c) return;
                const updated = this._queryToolCards(c);
                if (updated.length > previousCount) { observer.disconnect(); resolve(updated[previousCount] ?? null); }
            });
            observer.observe(stableParent, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
        });
    },

    async applyParamsToCard(card, entry) {
        if (!card || !entry) return;
        this.ensureCardExpanded(card);

        let spaceY3 = card.querySelector(this.selectors.stepParameters);
        if (!spaceY3) {
            const content = card.querySelector('div[data-state="open"] div.px-3.pb-3.space-y-3');
            if (!content) return;
            spaceY3 = content.querySelector('div.space-y-3');
            if (!spaceY3) return;
        }

        const paramBlocks = spaceY3.querySelectorAll('[data-param]');
        const blocks = paramBlocks.length ? Array.from(paramBlocks) : Array.from(spaceY3.children).filter(el => el.nodeType === Node.ELEMENT_NODE && el.matches && (el.matches('div.flex.flex-col.gap-1\\.5') || el.matches('div.flex.flex-col.gap-2')));
        const blockMap = {};
        for (const block of blocks) {
            const name = this.getParamNameFromBlock(block);
            if (name) blockMap[name] = block;
        }

        for (const key of Object.keys(entry)) {
            const block = blockMap[key];
            if (!block) {
                Logger.warn(`${this.id}: parameter not found: ${key}`);
                continue;
            }
            const typeLabel = this.getParamTypeFromBlock(block);
            await this.applyValueToBlock(block, typeLabel, entry[key]);
        }
    },

    ensureCardExpanded(card) {
        const openContent = card.querySelector('div[data-state="open"]');
        if (openContent) return;
        const header = card.querySelector(this.selectors.toolHeader) || card.querySelector(this.selectors.toolHeaderFallback);
        if (header) header.click();
    },

    async applyValueToBlock(block, typeLabel, value) {
        if (!typeLabel) {
            await this.applyValueToBlockInferred(block, value);
            return;
        }
        if (typeLabel === 'object') {
            if (!value || typeof value !== 'object') return;
            const innerBlocks = this.getNestedBlocksFromObjectBlock(block);
            if (!innerBlocks.length) {
                const input = block.querySelector('input[type="text"]');
                const textarea = block.querySelector('textarea');
                const textValue = (value === null || value === undefined) ? '' : (typeof value === 'string' ? value : JSON.stringify(value));
                if (input) this.setInputValue(input, textValue);
                else if (textarea) this.setInputValue(textarea, textValue);
                return;
            }
            const innerMap = {};
            innerBlocks.forEach(innerBlock => {
                const name = this.getParamNameFromBlock(innerBlock);
                if (name) innerMap[name] = innerBlock;
            });
            for (const key of Object.keys(value)) {
                const innerBlock = innerMap[key];
                if (!innerBlock) continue;
                const innerType = this.getParamTypeFromBlock(innerBlock);
                await this.applyValueToBlock(innerBlock, innerType, value[key]);
            }
            return;
        }
        if (typeLabel === 'string') {
            const input = block.querySelector('input[type="text"]');
            const textarea = block.querySelector('textarea');
            const textValue = (value === null || value === undefined) ? '' : (typeof value === 'string' ? value : JSON.stringify(value));
            if (input) this.setInputValue(input, textValue);
            else if (textarea) this.setInputValue(textarea, textValue);
            return;
        }
        if (typeLabel === 'integer' || typeLabel === 'number') {
            const input = block.querySelector('input[type="number"]');
            if (!input) return;
            const numValue = (value === null || value === undefined) ? '' : String(value);
            this.setInputValue(input, numValue);
            return;
        }
        if (typeLabel === 'boolean') {
            const btn = block.querySelector('button[role="checkbox"]');
            if (!btn) return;
            const isChecked = btn.getAttribute('data-state') === 'checked' || btn.getAttribute('aria-checked') === 'true';
            const target = !!value;
            if (target !== isChecked) btn.click();
            return;
        }
        if (typeLabel === 'enum') {
            const btn = block.querySelector('button[role="combobox"]');
            if (!btn) return;
            await this.selectComboboxOption(btn, value);
            return;
        }
        if (typeLabel === 'enum[]' || typeLabel.includes('enum[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1');
            if (!wrap || !Array.isArray(value)) return;
            await this.ensureArrayItems(wrap, value.length);
            const combos = Array.from(wrap.querySelectorAll('button[role="combobox"]'));
            for (let i = 0; i < value.length; i++) await this.selectComboboxOption(combos[i], value[i]);
            return;
        }
        if (typeLabel === 'string[]' || typeLabel.includes('string[]') || typeLabel === 'any[]' || typeLabel.includes('any[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1');
            if (!wrap || !Array.isArray(value)) return;
            await this.ensureArrayItems(wrap, value.length);
            const inputs = Array.from(wrap.querySelectorAll('div.flex.items-center.gap-2 input[type="text"]'));
            for (let i = 0; i < value.length; i++) if (inputs[i]) this.setInputValue(inputs[i], value[i]);
            return;
        }
        if (typeLabel === 'integer[]' || typeLabel.includes('integer[]') || typeLabel === 'number[]' || typeLabel.includes('number[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1');
            if (!wrap || !Array.isArray(value)) return;
            await this.ensureArrayItems(wrap, value.length);
            const inputs = Array.from(wrap.querySelectorAll('div.flex.items-center.gap-2 input[type="number"]'));
            for (let i = 0; i < value.length; i++) if (inputs[i]) this.setInputValue(inputs[i], (value[i] === null || value[i] === undefined) ? '' : String(value[i]));
            return;
        }
        if (typeLabel === 'object[]' || typeLabel.includes('object[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1') || block;
            if (!Array.isArray(value)) return;
            await this.ensureArrayItems(wrap, value.length);
            const items = Array.from(wrap.children).filter(el => el.nodeType === Node.ELEMENT_NODE && el.matches && el.matches('div.relative.border.rounded-md.p-3[class*="bg-muted"]'));
            for (let i = 0; i < value.length; i++) {
                const item = items[i];
                const obj = value[i];
                if (!item || !obj || typeof obj !== 'object') continue;
                const innerBlocks = this.getNestedBlocksFromObjectItem(item);
                const innerMap = {};
                innerBlocks.forEach(innerBlock => {
                    const name = this.getParamNameFromBlock(innerBlock);
                    if (name) innerMap[name] = innerBlock;
                });
                for (const key of Object.keys(obj)) {
                    const innerBlock = innerMap[key];
                    if (!innerBlock) continue;
                    const innerType = this.getParamTypeFromBlock(innerBlock);
                    await this.applyValueToBlock(innerBlock, innerType, obj[key]);
                }
            }
        }
    },

    async applyValueToBlockInferred(block, value) {
        const textValue = (value === null || value === undefined) ? '' : (typeof value === 'string' ? value : String(value));
        const input = block.querySelector('input[type="text"]');
        if (input) { this.setInputValue(input, textValue); return; }
        const textarea = block.querySelector('textarea');
        if (textarea) { this.setInputValue(textarea, textValue); return; }
        const numInput = block.querySelector('input[type="number"]');
        if (numInput) this.setInputValue(numInput, (value === null || value === undefined) ? '' : String(value));
    },

    async ensureArrayItems(wrap, count) {
        if (!wrap || count <= 0) return;
        const addBtn = Array.from(wrap.querySelectorAll('button')).find(btn => btn.textContent.trim().startsWith('Add '));
        if (!addBtn) return;
        const getItemCount = () => {
            const inputs = wrap.querySelectorAll('input[type="text"], input[type="number"], button[role="combobox"], div.relative.border.rounded-md.p-3');
            return inputs.length;
        };
        let current = getItemCount();
        while (current < count) {
            addBtn.click();
            await this.waitForAnimationFrame();
            current = getItemCount();
        }
    },

    async selectComboboxOption(btn, value) {
        if (!btn || value === undefined || value === null) return;
        const desired = String(value).trim();
        if (!desired) return;
        btn.focus();
        await this.wait(5);
        await this.pressKey(btn, 'Enter');
        await this.wait(30);
        const listbox = await this.waitForListbox(btn, 500);
        if (!listbox) return;
        await this.wait(30);
        const options = Array.from(listbox.querySelectorAll('[role="option"]'));
        const norm = (s) => (s || '').trim().replace(/\s+/g, ' ');
        let targetIndex = options.findIndex(opt => norm(opt.textContent) === norm(desired));
        if (targetIndex < 0) targetIndex = options.findIndex(opt => norm(opt.textContent).toLowerCase() === norm(desired).toLowerCase());
        if (targetIndex < 0) return;
        let currentIndex = this.getHighlightedOptionIndex(listbox);
        let delta;
        if (currentIndex < 0) delta = targetIndex + 1;
        else delta = targetIndex - currentIndex;
        let keyTarget = document.activeElement;
        for (let k = 0; k < Math.abs(delta); k++) {
            await this.pressKey(keyTarget, delta > 0 ? 'ArrowDown' : 'ArrowUp');
            await this.wait(5);
            keyTarget = document.activeElement;
        }
        await this.wait(5);
        await this.pressKey(document.activeElement, 'Enter');
        await this.wait(30);
    },

    wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },

    waitForListbox(dropdown, maxWaitMs = 500) {
        const id = dropdown && dropdown.getAttribute('aria-controls');
        if (!id) return Promise.resolve(null);
        const start = Date.now();
        const poll = () => {
            const el = document.getElementById(id);
            if (el) return Promise.resolve(el);
            if (Date.now() - start >= maxWaitMs) return Promise.resolve(null);
            return this.wait(5).then(poll);
        };
        return poll();
    },

    async pressKey(target, key) {
        if (!target) return;
        const code = key === 'Enter' ? 'Enter' : key === 'ArrowDown' ? 'ArrowDown' : key === 'ArrowUp' ? 'ArrowUp' : key === 'Escape' ? 'Escape' : key;
        target.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }));
        await this.wait(2);
        target.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true, cancelable: true }));
    },

    getHighlightedOptionIndex(listbox) {
        if (!listbox) return -1;
        const options = Array.from(listbox.querySelectorAll('[role="option"]'));
        const idx = options.findIndex(opt => opt.hasAttribute('data-highlighted') || opt.getAttribute('aria-selected') === 'true');
        return idx >= 0 ? idx : -1;
    },

    waitForAnimationFrame() { return new Promise(resolve => requestAnimationFrame(() => resolve())); },

    setInputValue(el, value) {
        const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value') && Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    },

    findWorkflowPanel() {
        const byDataUi = document.querySelector(this.selectors.workflowPanel);
        if (byDataUi) return byDataUi;
        const panels = Context.dom.queryAll('[data-panel-id][data-panel]', { context: `${this.id}.panels` });
        for (const candidate of panels) {
            const toolbar = candidate.querySelector(this.selectors.workflowToolbarFallback);
            if (toolbar) {
                const workflowText = Array.from(toolbar.querySelectorAll('span')).find(span => span.textContent.trim() === 'Workflow');
                if (workflowText) return candidate;
            }
        }
        return null;
    },

    findStableParent(panel) {
        if (!panel) return null;
        const byDataUi = panel.querySelector(this.selectors.stableParent);
        if (byDataUi) return byDataUi;
        const scrollables = panel.querySelectorAll('.overflow-y-auto');
        for (const scrollable of scrollables) {
            const stable = scrollable.querySelector(this.selectors.stableParentFallback);
            if (stable) return stable;
        }
        const scrollable = panel.querySelector('.overflow-y-auto');
        if (scrollable && scrollable.querySelector(this.selectors.toolsContainer)) return scrollable;
        return null;
    }
};
