// search-output-dive.js — Dive tab (dev builds only): mass per-person export.

const DIVE_SCHEMA_VERSION = '1.0';
const DIVE_TOGGLE_INACTIVE = 'border: 2px solid var(--border, #e2e8f0); color: var(--muted-foreground, #64748b); background: transparent; opacity: 0.6;';
const DIVE_OUTPUT_KIND_CONFIG = {
    task_creation: {
        toggleActive: 'border: 2px solid #16a34a; color: #15803d; background: transparent;'
    },
    qa: {
        toggleActive: 'border: 2px solid #2563eb; color: #1d4ed8; background: transparent;'
    },
    dispute: {
        toggleActive: 'border: 2px solid #7c3aed; color: #6d28d9; background: transparent;'
    },
    senior_review: {
        toggleActive: 'border: 2px solid #ca8a04; color: #a16207; background: transparent;'
    }
};

function diveEscHtml(value) {
    const lib = Context.dashboardLib;
    if (lib && typeof lib.escHtml === 'function') return lib.escHtml(value);
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function diveDashLib() {
    return Context.dashboardLib;
}

function diveValidateCreatedAtRange(afterLocal, beforeLocal) {
    const lib = diveDashLib();
    if (lib && typeof lib.validateCreatedAtRange === 'function') {
        return lib.validateCreatedAtRange(afterLocal, beforeLocal);
    }
    return { valid: true, error: '', afterIso: '', beforeIso: '' };
}

function diveQuickDatePresetRange(preset) {
    const lib = diveDashLib();
    return lib && typeof lib.quickDatePresetRange === 'function'
        ? lib.quickDatePresetRange(preset)
        : null;
}

function diveDateInputValue(date) {
    const lib = diveDashLib();
    return lib && typeof lib.dateInputValue === 'function'
        ? lib.dateInputValue(date)
        : '';
}

function divePanelHtml(dash) {
    const box = dash && typeof dash._panelBoxStyle === 'function'
        ? dash._panelBoxStyle()
        : 'border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--card, #ffffff);';
    const label = dash && typeof dash._labelStyle === 'function'
        ? dash._labelStyle()
        : 'font-size: 11px; font-weight: 500; color: var(--muted-foreground, #64748b);';
    const hint = dash && typeof dash._hintStyle === 'function'
        ? dash._hintStyle()
        : 'font-size: 11px; color: var(--muted-foreground, #64748b);';
    const input = dash && typeof dash._inputStyle === 'function'
        ? dash._inputStyle()
        : 'width: 100%; padding: 7px 10px; font-size: 12px; border: 1px solid var(--input, #cbd5e1); border-radius: 6px; box-sizing: border-box;';
    const btn = (variant, size) => (dash && typeof dash._dashBtnClass === 'function'
        ? dash._dashBtnClass(variant, size)
        : 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size);
    const clearBtn = dash && typeof dash._inputClearBtnStyle === 'function'
        ? dash._inputClearBtnStyle()
        : 'flex-shrink: 0; width: 32px; height: 32px; border-radius: 6px; cursor: pointer;';
    const section = 'background: color-mix(in srgb, var(--muted-foreground, #64748b) 8%, var(--card, #ffffff)); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 14px; box-sizing: border-box;';
    const multi = (scopeKey, lbl, emptyHint) => (dash && typeof dash._multiSelectHtml === 'function'
        ? dash._multiSelectHtml(scopeKey, lbl, emptyHint, true)
        : '');

    return `
        <div style="display: flex; flex-direction: column; gap: 14px; height: 100%; min-height: 0; overflow: hidden; padding: 14px; box-sizing: border-box;">
            <div style="${section} flex-shrink: 0; max-height: 55%; overflow-y: auto;">
                <div style="${label} font-weight: 600;">Dive Export</div>
                <p style="${hint} margin: 0; line-height: 1.45;">
                    Iterates each contributor, fetches + fully hydrates all matching results (no 500 cap), then downloads one JSON file per person.
                    Leave Contributors blank to expand every member of the selected teams (or all teams).
                </p>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    <button type="button" id="wf-dive-toggle-tasks" aria-pressed="true" data-wf-dive-kind="tasks">Task Creation</button>
                    <button type="button" id="wf-dive-toggle-qa" aria-pressed="true" data-wf-dive-kind="qa">QA</button>
                    <button type="button" id="wf-dive-toggle-disputes" aria-pressed="false" data-wf-dive-kind="disputes">Disputes</button>
                    <button type="button" id="wf-dive-toggle-senior-review" aria-pressed="false" data-wf-dive-kind="senior_review">Sr Review</button>
                </div>
                <div>
                    <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Contributors</label>
                    <div id="wf-dive-author-box" style="${input} display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 36px; cursor: text;">
                        <input type="text" id="wf-dive-author-input" autocomplete="off" placeholder="Name, email, or UUID — Enter to resolve" style="flex: 1; min-width: 120px; border: none; outline: none; background: transparent; font-size: 12px; color: var(--foreground, #0f172a); padding: 2px 0;">
                    </div>
                    <div id="wf-dive-author-error" style="display: none; font-size: 11px; color: var(--destructive, #dc2626); margin-top: 4px;"></div>
                    <div id="wf-dive-author-candidates" style="display: none; margin-top: 6px; ${box}"></div>
                    <div style="${hint} margin-top: 4px;">Blank = every member of selected teams (deduped). Named tokens = only those people.</div>
                </div>
                <div>
                    <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Quick range</label>
                    <select id="wf-dive-quick-range" style="${input} width: 100%; cursor: pointer;">
                        <option value="">Custom</option>
                        <option value="all-time">All Time</option>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="3d">Last 3 Days</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="last-week">Last Calendar Week</option>
                        <option value="this-month">This Month</option>
                        <option value="last-month">Last Calendar Month</option>
                        <option value="this-year">This Year</option>
                        <option value="last-year">Last Calendar Year</option>
                    </select>
                </div>
                <div style="display: flex; align-items: flex-end; gap: 8px; min-width: 0;">
                    <div style="flex: 1; min-width: 0;">
                        <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">After</label>
                        <input type="date" id="wf-dive-after" style="${input} min-width: 0;">
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Before</label>
                        <input type="date" id="wf-dive-before" style="${input} min-width: 0;">
                    </div>
                    <button type="button" id="wf-dive-clear-dates" aria-label="Clear dates" title="Clear dates" style="${clearBtn} display: none;">&times;</button>
                </div>
                <div id="wf-dive-range-error" style="display: none; font-size: 11px; color: var(--destructive, #dc2626);"></div>
                <div>
                    <div style="${label} margin-bottom: 6px; font-weight: 600;">Team, projects, environments</div>
                    <div style="${hint} margin-bottom: 8px;">Empty selection = all.</div>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${multi('dive-envs', 'Environment', 'All environments')}
                        ${multi('dive-projects', 'Project', 'All projects')}
                        ${multi('dive-teams', 'Team', 'All teams')}
                    </div>
                </div>
                <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                    <input type="checkbox" id="wf-dive-include-content">
                    Include full content (prompts, notes to QA, review text, dispute/flag bodies)
                </label>
                <div style="${hint} margin: 0;">Default is metadata-only cards — safer for bulk analysis pipelines.</div>
                <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
                    <button type="button" id="wf-dive-reset" class="${btn('basic', 'nav')}">Reset</button>
                    <button type="button" id="wf-dive-cancel" class="${btn('basic', 'nav')}" style="display: none;">Cancel</button>
                    <button type="button" id="wf-dive-start" class="${btn('primary', 'nav')}">Start Dive</button>
                </div>
            </div>
            <div style="${box} flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;">
                <div id="wf-dive-progress" style="padding: 10px 12px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px; color: var(--muted-foreground, #64748b); flex-shrink: 0;">
                    Idle — configure params and press Start Dive.
                </div>
                <div id="wf-dive-log" style="flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; line-height: 1.45;"></div>
            </div>
        </div>
    `;
}

const diveMethods = {
    _ensureDiveState() {
        if (!this._diveState) {
            this._diveState = {
                draftTokens: [],
                includeTasks: true,
                includeQa: true,
                includeDisputes: false,
                includeSeniorReview: false,
                includeContent: false,
                running: false,
                cancelRequested: false,
                applyingQuickDate: false,
                catalogSynced: false,
                activationLogged: false,
                logLines: []
            };
        }
        return this._diveState;
    },

    _diveQ(sel) {
        const root = this._modal;
        return root ? root.querySelector(sel) : null;
    },

    _diveBtnToggleStyle(active, colorKind) {
        const base = 'padding: 7px 14px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer;';
        if (active) {
            const cfg = DIVE_OUTPUT_KIND_CONFIG[colorKind];
            return base + ' ' + (cfg ? cfg.toggleActive : DIVE_TOGGLE_INACTIVE);
        }
        return base + ' ' + DIVE_TOGGLE_INACTIVE;
    },

    _syncDiveOutputToggleUi() {
        const s = this._ensureDiveState();
        const map = [
            ['#wf-dive-toggle-tasks', s.includeTasks, 'task_creation'],
            ['#wf-dive-toggle-qa', s.includeQa, 'qa'],
            ['#wf-dive-toggle-disputes', s.includeDisputes, 'dispute'],
            ['#wf-dive-toggle-senior-review', s.includeSeniorReview, 'senior_review']
        ];
        for (const [sel, on, kind] of map) {
            const btn = this._diveQ(sel);
            if (!btn) continue;
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            btn.style.cssText = this._diveBtnToggleStyle(on, kind);
        }
    },

    _toggleDiveOutputType(kind) {
        const s = this._ensureDiveState();
        if (kind === 'tasks') s.includeTasks = !s.includeTasks;
        else if (kind === 'qa') s.includeQa = !s.includeQa;
        else if (kind === 'disputes') s.includeDisputes = !s.includeDisputes;
        else if (kind === 'senior_review') s.includeSeniorReview = !s.includeSeniorReview;
        this._syncDiveOutputToggleUi();
        this._validateDiveRangeUi();
        Logger.log('search-output-dive: output type toggled — ' + kind);
    },

    _divePersonDisplayLabel(person) {
        if (!person) return '';
        const id = String(person.id || '').trim();
        const rawName = String(person.full_name || person.name || '').trim();
        const email = String(person.email || '').trim();
        const nameLooksLikeId = rawName && id && rawName.toLowerCase() === id.toLowerCase();
        const name = nameLooksLikeId ? '' : rawName;
        return name || email || id;
    },

    _renderDiveAuthorTokens() {
        const s = this._ensureDiveState();
        const box = this._diveQ('#wf-dive-author-box');
        const input = this._diveQ('#wf-dive-author-input');
        if (!box || !input) return;
        box.querySelectorAll('[data-wf-dive-author-token]').forEach((el) => el.remove());
        for (const t of s.draftTokens) {
            const chip = document.createElement('span');
            chip.setAttribute('data-wf-dive-author-token', t.id);
            chip.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--brand, #4f46e5) 12%, transparent); border: 1px solid color-mix(in srgb, var(--brand, #4f46e5) 35%, transparent); font-size: 11px;';
            const label = document.createElement('span');
            label.textContent = this._divePersonDisplayLabel(t);
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.setAttribute('aria-label', 'Remove');
            remove.textContent = '×';
            remove.style.cssText = 'border: none; background: transparent; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 2px; color: var(--muted-foreground, #64748b);';
            remove.addEventListener('click', (e) => {
                e.stopPropagation();
                this._removeDiveAuthorToken(t.id);
            });
            chip.appendChild(label);
            chip.appendChild(remove);
            box.insertBefore(chip, input);
        }
    },

    _setDiveAuthorError(text) {
        const el = this._diveQ('#wf-dive-author-error');
        if (!el) return;
        if (text) {
            el.textContent = text;
            el.style.display = 'block';
        } else {
            el.textContent = '';
            el.style.display = 'none';
        }
    },

    _hideDiveAuthorCandidates() {
        const el = this._diveQ('#wf-dive-author-candidates');
        if (!el) return;
        el.style.display = 'none';
        el.innerHTML = '';
    },

    _showDiveAuthorCandidates(results) {
        const el = this._diveQ('#wf-dive-author-candidates');
        if (!el) return;
        el.innerHTML = (results || []).map((c) => {
            const label = this._divePersonDisplayLabel(c);
            const email = String(c.email || '').trim();
            return '<button type="button" data-wf-dive-author-candidate="' + diveEscHtml(c.id) + '" style="display:block;width:100%;text-align:left;padding:6px 8px;border:none;background:transparent;cursor:pointer;font-size:12px;">'
                + diveEscHtml(label)
                + (email && email !== label ? ' <span style="color:var(--muted-foreground,#64748b);">' + diveEscHtml(email) + '</span>' : '')
                + '</button>';
        }).join('');
        el.style.display = 'block';
        el.querySelectorAll('[data-wf-dive-author-candidate]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-wf-dive-author-candidate');
                const person = (results || []).find((r) => String(r.id) === String(id));
                if (person) this._addDiveAuthorToken(person);
            });
        });
    },

    _addDiveAuthorToken(person) {
        const s = this._ensureDiveState();
        if (!person || !person.id) return;
        if (s.draftTokens.some((t) => t.id === person.id)) return;
        s.draftTokens.push({
            id: String(person.id),
            full_name: person.full_name || person.name || '',
            email: person.email || ''
        });
        this._hideDiveAuthorCandidates();
        this._setDiveAuthorError('');
        const input = this._diveQ('#wf-dive-author-input');
        if (input) input.value = '';
        this._renderDiveAuthorTokens();
        this._validateDiveRangeUi();
        Logger.log('search-output-dive: author token added — ' + this._divePersonDisplayLabel(person));
    },

    _removeDiveAuthorToken(id) {
        const s = this._ensureDiveState();
        s.draftTokens = s.draftTokens.filter((t) => t.id !== id);
        this._renderDiveAuthorTokens();
        this._validateDiveRangeUi();
    },

    async _resolveDiveAuthorToken(raw) {
        const query = String(raw || '').trim();
        if (!query) return 'empty';
        const s = this._ensureDiveState();
        if (s.draftTokens.some((t) => t.full_name === query || t.email === query || t.id === query)) {
            const input = this._diveQ('#wf-dive-author-input');
            if (input) input.value = '';
            return 'resolved';
        }
        this._setDiveAuthorError('');
        this._hideDiveAuthorCandidates();
        try {
            if (typeof this._searchPersons !== 'function') {
                this._setDiveAuthorError('Author lookup unavailable — Search Output not loaded.');
                return 'error';
            }
            const tokenIds = new Set(s.draftTokens.map((t) => String(t.id || '').trim().toLowerCase()).filter(Boolean));
            const allResults = await this._searchPersons(query);
            const results = allResults.filter((p) => !tokenIds.has(String(p.id || '').trim().toLowerCase()));
            const input = this._diveQ('#wf-dive-author-input');
            if (results.length === 0) {
                if (allResults.length > 0) {
                    this._setDiveAuthorError('Already added.');
                    return 'duplicate';
                }
                this._setDiveAuthorError('No match for "' + query + '"');
                return 'none';
            }
            if (results.length === 1) {
                this._addDiveAuthorToken(results[0]);
                if (input) input.value = '';
                return 'resolved';
            }
            if (input) input.value = '';
            this._showDiveAuthorCandidates(results);
            return 'multiple';
        } catch (err) {
            this._setDiveAuthorError('Lookup failed: ' + (err && err.message ? err.message : String(err)));
            Logger.warn('search-output-dive: author lookup failed', err);
            return 'error';
        }
    },

    async _flushDivePendingAuthorInput() {
        const input = this._diveQ('#wf-dive-author-input');
        const query = (input && input.value || '').trim();
        if (!query) return null;
        const outcome = await this._resolveDiveAuthorToken(query);
        if (outcome === 'resolved' || outcome === 'empty') return null;
        if (outcome === 'multiple') return 'Multiple author matches — pick one from the list below.';
        if (outcome === 'duplicate') return 'All matches for that query are already added.';
        if (outcome === 'none') return 'No author match for "' + query + '".';
        return 'Author lookup failed — try again.';
    },

    _applyDiveQuickDatePreset(preset) {
        const s = this._ensureDiveState();
        const range = diveQuickDatePresetRange(preset);
        if (!range) {
            Logger.warn('search-output-dive: unknown quick date preset — ' + preset);
            return;
        }
        s.applyingQuickDate = true;
        try {
            const afterEl = this._diveQ('#wf-dive-after');
            const beforeEl = this._diveQ('#wf-dive-before');
            if (range.clear) {
                if (afterEl) afterEl.value = '';
                if (beforeEl) beforeEl.value = '';
            } else {
                if (afterEl) afterEl.value = diveDateInputValue(range.after);
                if (beforeEl) beforeEl.value = diveDateInputValue(range.before);
            }
        } finally {
            s.applyingQuickDate = false;
        }
        this._validateDiveRangeUi();
        Logger.log('search-output-dive: quick date preset — ' + range.label);
    },

    _clearDiveDateRangeFields() {
        ['#wf-dive-after', '#wf-dive-before'].forEach((sel) => {
            const el = this._diveQ(sel);
            if (el) el.value = '';
        });
        const quickRange = this._diveQ('#wf-dive-quick-range');
        if (quickRange) quickRange.value = '';
        this._validateDiveRangeUi();
    },

    _syncDiveFieldClearButtons() {
        const after = (this._diveQ('#wf-dive-after') || {}).value || '';
        const before = (this._diveQ('#wf-dive-before') || {}).value || '';
        const clearDates = this._diveQ('#wf-dive-clear-dates');
        if (clearDates) clearDates.style.display = (after || before) ? '' : 'none';
    },

    _validateDiveRangeUi() {
        const s = this._ensureDiveState();
        const after = (this._diveQ('#wf-dive-after') || {}).value || '';
        const before = (this._diveQ('#wf-dive-before') || {}).value || '';
        const check = diveValidateCreatedAtRange(after, before);
        const el = this._diveQ('#wf-dive-range-error');
        if (el) {
            if (!check.valid && (after || before)) {
                el.textContent = check.error;
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        }
        const startBtn = this._diveQ('#wf-dive-start');
        if (startBtn) {
            const noOutputTypes = !s.includeTasks && !s.includeQa
                && !s.includeDisputes && !s.includeSeniorReview;
            startBtn.disabled = s.running
                || noOutputTypes
                || ((after || before) && !check.valid);
        }
        const cancelBtn = this._diveQ('#wf-dive-cancel');
        if (cancelBtn) cancelBtn.style.display = s.running ? '' : 'none';
        this._syncDiveFieldClearButtons();
        return { check };
    },

    _renderDiveTeamsList() {
        const scopeKey = 'dive-teams';
        if (typeof this._renderMsList !== 'function' || typeof this._getSearchableTeamCatalog !== 'function') return;
        const prevSelected = new Set(this._selectedFromList(scopeKey));
        const items = this._getSearchableTeamCatalog().map(([id, lbl]) => ({ id, label: lbl }));
        this._renderMsList(scopeKey, items, 'All teams', prevSelected);
        if (typeof this._setMsBulkToggleMode === 'function') {
            this._setMsBulkToggleMode(scopeKey, prevSelected.size === 0 ? 'all' : 'none');
            this._applyMsBulkToggleLabel(scopeKey);
        }
    },

    _renderDiveProjectsList() {
        const scopeKey = 'dive-projects';
        if (typeof this._renderMsList !== 'function' || typeof this._availableSearchProjects !== 'function') return;
        const prevSelected = new Set(this._selectedFromList(scopeKey));
        const loading = this._state && this._state.bootstrapStatus === 'loading';
        const items = this._availableSearchProjects().map((p) => ({ id: p.id, label: p.name }));
        const hint = this._state && this._state.catalog ? 'All projects' : 'Bootstrapping…';
        this._renderMsList(scopeKey, items, hint, prevSelected, { loading });
        if (typeof this._setMsBulkToggleMode === 'function') {
            this._setMsBulkToggleMode(scopeKey, prevSelected.size === 0 ? 'all' : 'none');
            this._applyMsBulkToggleLabel(scopeKey);
        }
    },

    _renderDiveEnvsList() {
        const scopeKey = 'dive-envs';
        if (typeof this._renderMsList !== 'function') return;
        const prevSelected = new Set(this._selectedFromList(scopeKey));
        const loading = this._state && this._state.bootstrapStatus === 'loading';
        const envs = (this._state && this._state.catalog && this._state.catalog.environments) || [];
        const items = envs.map((e) => ({ id: e.env_key, label: e.name || e.env_key }));
        const hint = this._state && this._state.catalog ? 'All environments' : 'Bootstrapping…';
        this._renderMsList(scopeKey, items, hint, prevSelected, { loading });
        if (typeof this._setMsBulkToggleMode === 'function') {
            this._setMsBulkToggleMode(scopeKey, prevSelected.size === 0 ? 'all' : 'none');
            this._applyMsBulkToggleLabel(scopeKey);
        }
    },

    _syncDiveCatalogLists() {
        this._renderDiveTeamsList();
        this._renderDiveProjectsList();
        this._renderDiveEnvsList();
        const s = this._ensureDiveState();
        s.catalogSynced = Boolean(this._state && this._state.catalog);
    },

    _resetDiveForm() {
        const s = this._ensureDiveState();
        if (s.running) return;
        s.draftTokens = [];
        s.includeTasks = true;
        s.includeQa = true;
        s.includeDisputes = false;
        s.includeSeniorReview = false;
        s.includeContent = false;
        this._renderDiveAuthorTokens();
        this._hideDiveAuthorCandidates();
        this._setDiveAuthorError('');
        this._syncDiveOutputToggleUi();
        const contentCb = this._diveQ('#wf-dive-include-content');
        if (contentCb) contentCb.checked = false;
        this._clearDiveDateRangeFields();
        ['dive-teams', 'dive-projects', 'dive-envs'].forEach((key) => {
            const itemsEl = typeof this._msItemsEl === 'function' ? this._msItemsEl(key) : null;
            if (itemsEl) itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
            if (typeof this._setMsBulkToggleMode === 'function') {
                this._setMsBulkToggleMode(key, 'all');
                this._applyMsBulkToggleLabel(key);
            }
            if (typeof this._updateMsCount === 'function') this._updateMsCount(key);
        });
        this._renderDiveProjectsList();
        this._setDiveProgress('Idle — configure params and press Start Dive.');
        s.logLines = [];
        this._renderDiveLog();
        this._validateDiveRangeUi();
        Logger.log('search-output-dive: form reset');
    },

    _setDiveProgress(text) {
        const el = this._diveQ('#wf-dive-progress');
        if (el) el.textContent = text;
    },

    _appendDiveLog(line) {
        const s = this._ensureDiveState();
        const stamp = new Date().toISOString().slice(11, 19);
        s.logLines.push('[' + stamp + '] ' + line);
        if (s.logLines.length > 500) s.logLines = s.logLines.slice(-500);
        this._renderDiveLog();
    },

    _renderDiveLog() {
        const s = this._ensureDiveState();
        const el = this._diveQ('#wf-dive-log');
        if (!el) return;
        el.textContent = s.logLines.join('\n');
        el.scrollTop = el.scrollHeight;
    },

    async _buildDiveSearchApiScope() {
        const teamCatalog = typeof this._getSearchableTeamCatalog === 'function'
            ? this._getSearchableTeamCatalog()
            : [];
        const allTeamIds = teamCatalog.map(([id]) => id);
        const selectedTeams = this._selectedFromList('dive-teams');
        const teamIds = selectedTeams.length > 0 ? selectedTeams : allTeamIds;

        const envCatalog = (this._state && this._state.catalog && this._state.catalog.environments) || [];
        const allEnvKeys = envCatalog.map((e) => e.env_key);
        const selectedEnvs = this._selectedFromList('dive-envs');
        const envKeys = selectedEnvs.length > 0 ? selectedEnvs : allEnvKeys;

        const availableProjects = typeof this._availableSearchProjects === 'function'
            ? this._availableSearchProjects()
            : [];
        const allProjectIds = availableProjects.map((p) => p.id);
        const selectedProjects = this._selectedFromList('dive-projects');
        const projectIds = selectedProjects.length > 0 ? selectedProjects : allProjectIds;
        const hasProjectFilter = selectedProjects.length > 0;
        let targetIds = [];
        if (hasProjectFilter && typeof this._fetchTargetIdsForProjects === 'function') {
            targetIds = await this._fetchTargetIdsForProjects(projectIds, null);
        }

        return {
            teamIds,
            envKeys,
            projectIds,
            targetIds,
            hasProjectFilter,
            narrowedTeams: selectedTeams.length > 0,
            narrowedEnvs: selectedEnvs.length > 0,
            narrowedProjects: hasProjectFilter
        };
    },

    async _resolveDiveAuthorList(scope) {
        const s = this._ensureDiveState();
        if (s.draftTokens.length > 0) {
            return s.draftTokens.map((t) => ({
                id: String(t.id),
                full_name: t.full_name || '',
                email: t.email || ''
            }));
        }

        const ops = Context.opsTab;
        if (!ops) throw new Error('Ops tab not available.');
        const userId = typeof ops.getCurrentUserId === 'function' ? ops.getCurrentUserId() : null;
        if (!userId) throw new Error('No user ID found. Open Fleet while logged in and try again.');
        if (typeof ops.hasTeamSearchCredentials === 'function' && !ops.hasTeamSearchCredentials()) {
            throw new Error('Team search credentials missing. Open the Team page in Fleet, then retry Dive.');
        }
        if (typeof ops.fetchTeamSearchAllMembers !== 'function') {
            throw new Error('Team member search API unavailable.');
        }

        let teamCatalog = typeof ops.getUserTeamCatalog === 'function' ? ops.getUserTeamCatalog() : [];
        if (!teamCatalog.length && typeof ops.fetchUserTeamCatalog === 'function') {
            await ops.fetchUserTeamCatalog(userId);
            teamCatalog = ops.getUserTeamCatalog() || [];
        }
        if (!teamCatalog.length) throw new Error('No teams found for your account.');

        const selectedTeamIds = new Set(scope.narrowedTeams ? scope.teamIds : []);
        const teamsToSearch = scope.narrowedTeams
            ? teamCatalog.filter(([id]) => selectedTeamIds.has(id))
            : teamCatalog;
        if (teamsToSearch.length === 0) {
            throw new Error('No selected teams available to expand for blank Contributor search.');
        }

        this._setDiveProgress('Resolving team members across ' + teamsToSearch.length + ' team(s)…');
        this._appendDiveLog('Blank contributors — expanding ' + teamsToSearch.length + ' team(s)');
        Logger.log('search-output-dive: blank author mode — fetching members for ' + teamsToSearch.length + ' team(s)');

        const memberMap = new Map();
        await Promise.all(teamsToSearch.map(async ([teamId, teamLabel]) => {
            if (s.cancelRequested) return;
            try {
                const members = await ops.fetchTeamSearchAllMembers(teamId, userId, '', null, null);
                for (const member of members || []) {
                    if (!member || !member.id || memberMap.has(member.id)) continue;
                    memberMap.set(member.id, {
                        id: String(member.id),
                        full_name: member.full_name || '',
                        email: member.email || ''
                    });
                }
                Logger.debug('search-output-dive: team members from ' + teamLabel + ' — ' + (members || []).length);
            } catch (e) {
                Logger.warn('search-output-dive: team member fetch failed for ' + teamLabel, e);
                this._appendDiveLog('WARN team fetch failed (' + teamLabel + '): ' + (e && e.message ? e.message : String(e)));
            }
        }));

        const list = [...memberMap.values()].sort((a, b) =>
            this._divePersonDisplayLabel(a).localeCompare(this._divePersonDisplayLabel(b)));
        Logger.log('search-output-dive: expanded author list — ' + list.length + ' unique member(s)');
        this._appendDiveLog('Expanded ' + list.length + ' unique member(s)');
        return list;
    },

    _stripDiveContentFields(item) {
        if (!item || typeof item !== 'object') return item;
        const task = item.task;
        if (task && typeof task === 'object') {
            if (Object.prototype.hasOwnProperty.call(task, 'prompt')) task.prompt = '';
            if (Array.isArray(task.promptVersions)) {
                for (const v of task.promptVersions) {
                    if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'prompt')) {
                        v.prompt = '';
                    }
                }
            }
            if (Array.isArray(task.allFeedback)) {
                for (const fb of task.allFeedback) this._stripDiveFeedbackEntry(fb);
            }
        }
        if (Array.isArray(item.allFeedback)) {
            for (const fb of item.allFeedback) this._stripDiveFeedbackEntry(fb);
        }
        if (item.qaFeedback) this._stripDiveFeedbackEntry(item.qaFeedback);
        if (Array.isArray(item.disputes)) {
            for (const d of item.disputes) this._stripDiveDisputeOrFlag(d);
        }
        if (Array.isArray(item.flags)) {
            for (const f of item.flags) this._stripDiveDisputeOrFlag(f);
        }
        return item;
    },

    _stripDiveFeedbackEntry(fb) {
        if (!fb || typeof fb !== 'object') return;
        const drop = ['notes', 'reviewContent', 'displayPayload', 'feedback_content', 'feedback_data', 'content'];
        for (const key of drop) {
            if (Object.prototype.hasOwnProperty.call(fb, key)) delete fb[key];
        }
        if (fb.display && typeof fb.display === 'object') {
            if (Array.isArray(fb.display.textBlocks)) fb.display.textBlocks = [];
            if (Object.prototype.hasOwnProperty.call(fb.display, 'notes')) delete fb.display.notes;
            if (Object.prototype.hasOwnProperty.call(fb.display, 'reviewContent')) delete fb.display.reviewContent;
        }
        if (Array.isArray(fb.textBlocks)) fb.textBlocks = [];
    },

    _stripDiveDisputeOrFlag(row) {
        if (!row || typeof row !== 'object') return;
        const drop = [
            'content', 'note', 'resolution_note', 'resolution_reason', 'dispute_reason',
            'reason', 'body', 'description'
        ];
        for (const key of drop) {
            if (Object.prototype.hasOwnProperty.call(row, key)) delete row[key];
        }
    },

    _cloneDiveJson(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            Logger.error('search-output-dive: JSON clone failed', e);
            return null;
        }
    },

    _downloadDiveTextFile(filename, content, mime) {
        if (typeof this._downloadTextFile === 'function') {
            this._downloadTextFile(filename, content, mime);
            return;
        }
        try {
            const blob = new Blob([content], { type: mime || 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            Logger.error('search-output-dive: download failed', e);
            throw e;
        }
    },

    _buildDivePersonPayload(person, items, searchParams, includeContent) {
        const cloned = (items || [])
            .map((it) => this._cloneDiveJson(it))
            .filter(Boolean)
            .map((it) => (includeContent ? it : this._stripDiveContentFields(it)));
        return {
            schemaVersion: DIVE_SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            author: {
                id: String(person.id || ''),
                name: person.full_name || person.name || '',
                email: person.email || ''
            },
            searchParams,
            includeContent: Boolean(includeContent),
            totalItems: cloned.length,
            items: cloned
        };
    },

    async _exportDivePerson(person, params) {
        const s = this._ensureDiveState();
        const label = this._divePersonDisplayLabel(person);
        if (typeof this._fetchWorkerOutputSearch !== 'function') {
            throw new Error('Search fetch unavailable — Search Output not loaded.');
        }
        if (typeof this._hydrateItemsInBulkBatches !== 'function') {
            throw new Error('Hydrate unavailable — Search Output not loaded.');
        }

        const searchResult = await this._fetchWorkerOutputSearch({
            authorIds: [person.id],
            includeTaskCreation: params.includeTaskCreation,
            includeQa: params.includeQa,
            includeDisputes: params.includeDisputes,
            includeSeniorReview: params.includeSeniorReview,
            afterIso: params.afterIso,
            beforeIso: params.beforeIso,
            scope: params.scope
        });
        if (s.cancelRequested) return { cancelled: true };

        const items = (searchResult && searchResult.items) || [];
        this._setDiveProgress(
            'Processing ' + params.index + ' of ' + params.total
            + ': ' + label + ' — hydrating ' + items.length + ' item(s)…'
        );

        if (items.length > 0) {
            await this._hydrateItemsInBulkBatches(items, {
                prefetchedFeedbackRows: searchResult.allFeedbackRows,
                shouldCancel: () => s.cancelRequested,
                onProgress: (done, total) => {
                    this._setDiveProgress(
                        'Processing ' + params.index + ' of ' + params.total
                        + ': ' + label + ' — hydrating ' + done + '/' + total + '…'
                    );
                }
            });
        }
        if (s.cancelRequested) return { cancelled: true };

        const payload = this._buildDivePersonPayload(person, items, {
            afterIso: params.afterIso || null,
            beforeIso: params.beforeIso || null,
            includeTaskCreation: params.includeTaskCreation,
            includeQa: params.includeQa,
            includeDisputes: params.includeDisputes,
            includeSeniorReview: params.includeSeniorReview,
            teamIds: params.scope.teamIds || [],
            projectIds: params.scope.projectIds || [],
            envKeys: params.scope.envKeys || []
        }, params.includeContent);

        const filename = String(person.id) + '.json';
        const json = JSON.stringify(payload, null, 2);
        this._downloadDiveTextFile(filename, json, 'application/json;charset=utf-8');
        Logger.log('search-output-dive: exported ' + label + ' — ' + payload.totalItems
            + ' item(s) · ' + filename + (params.includeContent ? ' · full content' : ' · metadata'));
        this._appendDiveLog(
            'OK ' + label + ' → ' + filename + ' (' + payload.totalItems + ' items'
            + (params.includeContent ? ', full' : ', metadata') + ')'
        );
        return { cancelled: false, count: payload.totalItems, filename };
    },

    async _startDive() {
        const s = this._ensureDiveState();
        if (s.running) return;
        if (!Context.isDevBranch) {
            Logger.warn('search-output-dive: start skipped — not a dev build');
            return;
        }

        const flushErr = await this._flushDivePendingAuthorInput();
        if (flushErr) {
            this._setDiveAuthorError(flushErr);
            return;
        }

        const { check } = this._validateDiveRangeUi();
        if (!check.valid) return;
        if (!s.includeTasks && !s.includeQa && !s.includeDisputes && !s.includeSeniorReview) {
            this._setDiveProgress('Select at least one output type.');
            return;
        }

        if (typeof this._doBootstrap === 'function' && (!this._state || !this._state.catalog)) {
            this._setDiveProgress('Bootstrapping catalogs…');
            try {
                await this._doBootstrap();
            } catch (e) {
                Logger.error('search-output-dive: bootstrap failed', e);
                this._setDiveProgress('Bootstrap failed: ' + (e && e.message ? e.message : String(e)));
                return;
            }
            this._syncDiveCatalogLists();
        }

        const contentCb = this._diveQ('#wf-dive-include-content');
        s.includeContent = Boolean(contentCb && contentCb.checked);

        s.running = true;
        s.cancelRequested = false;
        this._validateDiveRangeUi();
        s.logLines = [];
        this._renderDiveLog();

        try {
            const scope = await this._buildDiveSearchApiScope();
            const authors = await this._resolveDiveAuthorList(scope);
            if (s.cancelRequested) {
                this._setDiveProgress('Cancelled.');
                this._appendDiveLog('Cancelled before export loop');
                return;
            }
            if (!authors.length) {
                this._setDiveProgress('No authors to export.');
                this._appendDiveLog('No authors resolved');
                Logger.warn('search-output-dive: no authors to export');
                return;
            }

            Logger.info('search-output-dive: starting — ' + authors.length + ' author(s)'
                + (s.includeContent ? ' · full content' : ' · metadata-only'));
            this._appendDiveLog('Starting dive — ' + authors.length + ' author(s)');

            let okCount = 0;
            let failCount = 0;
            for (let i = 0; i < authors.length; i++) {
                if (s.cancelRequested) {
                    this._appendDiveLog('Cancelled after ' + okCount + ' export(s)');
                    break;
                }
                const person = authors[i];
                const label = this._divePersonDisplayLabel(person);
                this._setDiveProgress('Processing ' + (i + 1) + ' of ' + authors.length + ': ' + label + ' — fetching…');
                try {
                    const result = await this._exportDivePerson(person, {
                        index: i + 1,
                        total: authors.length,
                        includeTaskCreation: s.includeTasks,
                        includeQa: s.includeQa,
                        includeDisputes: s.includeDisputes,
                        includeSeniorReview: s.includeSeniorReview,
                        afterIso: check.afterIso || null,
                        beforeIso: check.beforeIso || null,
                        scope,
                        includeContent: s.includeContent
                    });
                    if (result && result.cancelled) {
                        this._appendDiveLog('Cancelled during ' + label);
                        break;
                    }
                    okCount++;
                } catch (e) {
                    failCount++;
                    Logger.error('search-output-dive: export failed for ' + label, e);
                    this._appendDiveLog('FAIL ' + label + ': ' + (e && e.message ? e.message : String(e)));
                }
            }

            if (s.cancelRequested) {
                this._setDiveProgress('Cancelled — ' + okCount + ' exported, ' + failCount + ' failed.');
                Logger.info('search-output-dive: cancelled — exported ' + okCount + ', failed ' + failCount);
            } else {
                this._setDiveProgress('Done — ' + okCount + ' exported, ' + failCount + ' failed of ' + authors.length + '.');
                this._appendDiveLog('Complete — ' + okCount + ' ok / ' + failCount + ' failed / ' + authors.length + ' total');
                Logger.info('search-output-dive: complete — ' + okCount + ' exported, ' + failCount + ' failed');
            }
        } catch (e) {
            Logger.error('search-output-dive: dive failed', e);
            this._setDiveProgress('Failed: ' + (e && e.message ? e.message : String(e)));
            this._appendDiveLog('FATAL ' + (e && e.message ? e.message : String(e)));
        } finally {
            s.running = false;
            s.cancelRequested = false;
            this._validateDiveRangeUi();
        }
    },

    _cancelDive() {
        const s = this._ensureDiveState();
        if (!s.running) return;
        s.cancelRequested = true;
        this._setDiveProgress('Cancelling…');
        Logger.log('search-output-dive: cancel requested');
        this._appendDiveLog('Cancel requested');
    },

    _onDiveTabOpen() {
        const s = this._ensureDiveState();
        if (!s.activationLogged) {
            s.activationLogged = true;
            Logger.log('search-output-dive: Dive tab opened (dev build)');
        }
        if (typeof this._doBootstrap === 'function' && (!this._state || !this._state.catalog)) {
            void this._doBootstrap().then(() => this._syncDiveCatalogLists()).catch((e) => {
                Logger.warn('search-output-dive: bootstrap on open failed', e);
            });
        } else {
            this._syncDiveCatalogLists();
        }
        this._syncDiveOutputToggleUi();
        this._renderDiveAuthorTokens();
        this._validateDiveRangeUi();
    }
};

function attachDiveListeners(modal, dash) {
    if (!modal || !dash) return;
    dash._ensureDiveState();

    [
        ['#wf-dive-toggle-tasks', 'tasks'],
        ['#wf-dive-toggle-qa', 'qa'],
        ['#wf-dive-toggle-disputes', 'disputes'],
        ['#wf-dive-toggle-senior-review', 'senior_review']
    ].forEach(([sel, kind]) => {
        const btn = modal.querySelector(sel);
        if (btn) btn.addEventListener('click', () => dash._toggleDiveOutputType(kind));
    });

    const authorBox = modal.querySelector('#wf-dive-author-box');
    const authorInput = modal.querySelector('#wf-dive-author-input');
    if (authorBox && authorInput) {
        authorBox.addEventListener('click', () => authorInput.focus());
        authorInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void dash._resolveDiveAuthorToken(authorInput.value);
            } else if (e.key === 'Backspace' && !authorInput.value) {
                const s = dash._ensureDiveState();
                if (s.draftTokens.length > 0) {
                    dash._removeDiveAuthorToken(s.draftTokens[s.draftTokens.length - 1].id);
                }
            }
        });
        authorInput.addEventListener('input', () => {
            if (authorInput.value.endsWith(',')) {
                const query = authorInput.value.slice(0, -1).trim();
                authorInput.value = '';
                if (query) void dash._resolveDiveAuthorToken(query);
            }
            dash._setDiveAuthorError('');
            dash._hideDiveAuthorCandidates();
        });
    }

    ['#wf-dive-after', '#wf-dive-before'].forEach((sel) => {
        const el = modal.querySelector(sel);
        if (el) {
            el.addEventListener('change', () => {
                const s = dash._ensureDiveState();
                if (!s.applyingQuickDate) {
                    const quick = modal.querySelector('#wf-dive-quick-range');
                    if (quick) quick.value = '';
                }
                dash._validateDiveRangeUi();
            });
        }
    });

    const clearDates = modal.querySelector('#wf-dive-clear-dates');
    if (clearDates) clearDates.addEventListener('click', () => dash._clearDiveDateRangeFields());

    const quickRange = modal.querySelector('#wf-dive-quick-range');
    if (quickRange) {
        quickRange.addEventListener('change', () => {
            const preset = quickRange.value;
            if (!preset) return;
            dash._applyDiveQuickDatePreset(preset);
        });
    }

    const contentCb = modal.querySelector('#wf-dive-include-content');
    if (contentCb) {
        contentCb.addEventListener('change', () => {
            const s = dash._ensureDiveState();
            s.includeContent = contentCb.checked;
            Logger.log('search-output-dive: include content — ' + (contentCb.checked ? 'on' : 'off'));
        });
    }

    const startBtn = modal.querySelector('#wf-dive-start');
    if (startBtn) startBtn.addEventListener('click', () => { void dash._startDive(); });
    const cancelBtn = modal.querySelector('#wf-dive-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => dash._cancelDive());
    const resetBtn = modal.querySelector('#wf-dive-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => dash._resetDiveForm());

    dash._syncDiveOutputToggleUi();
    dash._validateDiveRangeUi();
}

const plugin = {
    id: 'search-output-dive',
    name: 'Search Output Dive',
    description: 'Dev-only Dive tab: mass per-person hydrated task-card JSON export',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        if (state && state.registered) {
            Logger.debug('search-output-dive: already registered — skipping re-init');
            return;
        }
        if (!Context.isDevBranch) {
            Logger.debug('search-output-dive: skipped — main-like branch');
            if (state) state.registered = true;
            return;
        }
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            Logger.error('search-output-dive: dashboard loader not registered');
            return;
        }
        Object.assign(loader, diveMethods);
        Context.dashboard.registerTab({
            id: 'dive',
            label: 'Dive',
            panelHtml(dash) { return divePanelHtml(dash); },
            attachListeners(modal, dash) { attachDiveListeners(modal, dash); },
            onOpen(dash) {
                if (dash && typeof dash._onDiveTabOpen === 'function') dash._onDiveTabOpen();
            },
            onActivate(modal, dash) {
                if (dash && typeof dash._onDiveTabOpen === 'function') dash._onDiveTabOpen();
            },
            onBuilt(modal, dash) {
                if (dash && typeof dash._syncDiveOutputToggleUi === 'function') dash._syncDiveOutputToggleUi();
                if (dash && typeof dash._validateDiveRangeUi === 'function') dash._validateDiveRangeUi();
            }
        });
        if (state) state.registered = true;
        Logger.log('search-output-dive: Dive tab registered (dev build)');
    }
};
