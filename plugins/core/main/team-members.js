// ============= team-members.js =============
// Team Members tab for the Ops dashboard.

const TEAM_MEMBERS_NUMERIC_FIELDS = [
    { id: 'tasks_submitted', label: 'Tasks Submitted' },
    { id: 'tasks_reviewed', label: 'Tasks Reviewed' },
    { id: 'submission_ar', label: 'Submission AR (%)' },
    { id: 'qa_ar', label: 'QA AR (%)' },
    { id: 'avg_writing_time', label: 'Avg Writing Time (min)' },
    { id: 'avg_qa_time', label: 'Avg QA Time (min)' }
];

const TEAM_MEMBERS_COMPARATORS = [
    { id: 'gt', label: '>' },
    { id: 'gte', label: '>=' },
    { id: 'lt', label: '<' },
    { id: 'lte', label: '<=' },
    { id: 'eq', label: '=' },
    { id: 'neq', label: '≠' }
];

const TEAM_MEMBERS_PAGE_SIZE_KEY = 'fleet-ux:team-members-page-size';
const TEAM_MEMBERS_PAGE_SIZE_DEFAULT = 25;
const TEAM_MEMBERS_BADGE_SCOPE = 'team-members-badges';
const TEAM_MEMBERS_BADGE_FILTER_ITEMS = [
    { id: 'ui', label: 'UI' },
    { id: 'verticals', label: 'Verticals' },
    { id: 'epic', label: 'Epic' },
    { id: 'fellows', label: 'Fellows' }
];

function dashEscHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function teamMembersNumericFieldOptionsHtml(selectedId) {
    const sel = selectedId || 'tasks_submitted';
    return TEAM_MEMBERS_NUMERIC_FIELDS.map((f) => {
        const selected = f.id === sel ? ' selected' : '';
        return '<option value="' + dashEscHtml(f.id) + '"' + selected + '>' + dashEscHtml(f.label) + '</option>';
    }).join('');
}

function teamMembersComparatorOptionsHtml(selectedId) {
    const sel = selectedId || 'gte';
    return TEAM_MEMBERS_COMPARATORS.map((c) => {
        const selected = c.id === sel ? ' selected' : '';
        return '<option value="' + dashEscHtml(c.id) + '"' + selected + '>' + dashEscHtml(c.label) + '</option>';
    }).join('');
}

function teamMembersNumericFilterRowHtml(opts) {
    const options = opts || {};
    const field = options.field || 'tasks_submitted';
    const comparator = options.comparator || 'gte';
    const value = options.value != null ? String(options.value) : '';
    const selectStyle = options.selectStyle || '';
    const inputStyle = options.inputStyle || '';
    const removeBtnStyle = options.removeBtnStyle || '';
    return '<div data-wf-team-numeric-row="1" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">'
        + '<select data-wf-team-numeric-field="1" style="' + selectStyle + ' flex: 1; min-width: 120px;">'
        + teamMembersNumericFieldOptionsHtml(field)
        + '</select>'
        + '<select data-wf-team-numeric-comparator="1" style="' + selectStyle + ' width: 52px; flex-shrink: 0;">'
        + teamMembersComparatorOptionsHtml(comparator)
        + '</select>'
        + '<input type="number" data-wf-team-numeric-value="1" placeholder="Value" step="any" value="' + dashEscHtml(value) + '" style="' + inputStyle + ' width: 72px; flex-shrink: 0;">'
        + '<button type="button" data-wf-team-numeric-remove="1" title="Remove filter" style="' + removeBtnStyle + ' flex-shrink: 0; padding: 4px 8px; font-size: 14px; line-height: 1; color: var(--muted-foreground, #64748b); background: transparent; border: 1px solid var(--border, #e2e8f0); border-radius: 4px; cursor: pointer;">×</button>'
        + '</div>';
}

function teamMembersPagerChevronSvg(dir) {
    const path = dir === 'prev' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6';
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
}

const TEAM_MEMBERS_CONSTRAINT_SCOPES = ['team-members-teams', 'team-members-permissions'];
const TEAM_MEMBERS_MS_SCOPES = TEAM_MEMBERS_CONSTRAINT_SCOPES.concat([TEAM_MEMBERS_BADGE_SCOPE]);

const teamMembersMethods = {
    _teamMembersPage: 0,
    _teamMembersPageSize: TEAM_MEMBERS_PAGE_SIZE_DEFAULT,

    _withTeamMembersModal(modal, fn) {
        const root = modal || this._modal;
        if (!root || typeof fn !== 'function') return;
        const prev = this._modal;
        this._modal = root;
        try {
            fn(root);
        } finally {
            this._modal = prev;
        }
    },

    _resetTeamMemberNumericFilters(modal) {
        const root = modal || this._modal;
        if (!root) return;
        const rowsEl = root.querySelector('#wf-ops-team-numeric-rows');
        if (rowsEl) rowsEl.innerHTML = '';
        const andOrToggle = root.querySelector('#wf-ops-team-numeric-andor');
        if (andOrToggle) andOrToggle.checked = false;
    },

    _resetTeamMemberFilters(modal) {
        this._resetTeamMemberNumericFilters(modal);
        this._resetTeamMemberConstraintState(modal);
        this.resetTeamMembersPage();
    },

    _resetTeamMemberMsDropdowns(modal) {
        this._resetTeamMemberNumericFilters(modal || this._modal);
        this._resetTeamMemberConstraintState(modal);
        this.resetTeamMembersPage();
    },

    _resetTeamMemberConstraintState(modal) {
        this._withTeamMembersModal(modal, (root) => {
            if (!this._state) return;
            TEAM_MEMBERS_MS_SCOPES.forEach((scopeKey) => {
                delete this._state.msDropdownOpen[scopeKey];
                delete this._state.msDropdownToggled[scopeKey];
                const wrap = root.querySelector('[data-wf-dash-ms-wrap="' + scopeKey + '"]');
                const panel = root.querySelector('#wf-dash-' + scopeKey + '-list');
                const itemsEl = panel ? panel.querySelector('[data-wf-dash-ms-items]') : null;
                const emptyHint = panel ? (panel.getAttribute('data-wf-dash-empty') || 'Run a search first') : 'Run a search first';
                if (scopeKey === TEAM_MEMBERS_BADGE_SCOPE) {
                    if (typeof this._renderTeamMemberBadgeFilter === 'function') {
                        this._renderTeamMemberBadgeFilter(modal);
                    }
                } else if (itemsEl) {
                    itemsEl.innerHTML = '<p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">'
                        + dashEscHtml(emptyHint) + '</p>';
                }
                if (wrap) wrap.removeAttribute('data-wf-dash-ms-open');
                if (panel) {
                    panel.style.display = 'block';
                    panel.style.maxHeight = '0';
                    panel.style.opacity = '0';
                }
                const countEl = root.querySelector('#wf-dash-' + scopeKey + '-count');
                if (countEl) {
                    countEl.textContent = '';
                    countEl.style.display = 'none';
                }
                const chevron = root.querySelector('[data-wf-dash-ms-chevron="' + scopeKey + '"]');
                if (chevron) chevron.textContent = '▸';
                const toggles = wrap ? wrap.querySelectorAll('[data-wf-dash-ms-toggle="' + scopeKey + '"]') : [];
                toggles.forEach((toggle) => toggle.setAttribute('aria-expanded', 'false'));
            });
            Logger.debug('team-members: constraint filter state reset');
        });
    },

    _renderTeamMemberBadgeFilter(modal) {
        const dash = Context.dashboard;
        if (!dash || typeof dash.renderMsList !== 'function') return;
        dash.renderMsList(TEAM_MEMBERS_BADGE_SCOPE, TEAM_MEMBERS_BADGE_FILTER_ITEMS, '', new Set());
    },

    _syncTeamMemberConstraintListsUi(modal) {
        this._withTeamMembersModal(modal, (root) => {
            TEAM_MEMBERS_CONSTRAINT_SCOPES.forEach((scopeKey) => {
                const itemsEl = typeof this._msItemsEl === 'function' ? this._msItemsEl(scopeKey) : null;
                const rowCount = itemsEl ? itemsEl.querySelectorAll('[data-wf-dash-ms-dual-row]').length : -1;
                const open = Boolean(this._state && this._state.msDropdownOpen[scopeKey]);
                Logger.debug('team-members: ' + scopeKey + ' rows=' + rowCount + ' open=' + open);
                if (rowCount === 0 && itemsEl) {
                    Logger.warn('team-members: constraint list empty after populate — ' + scopeKey);
                }
                if (typeof this._syncMsDropdown === 'function') {
                    this._syncMsDropdown(scopeKey, { immediate: true });
                }
            });
        });
    },

    _renderTeamMemberConstraintLists(opts) {
        const options = opts || {};
        const loading = Boolean(options.loading);
        const preserve = options.preserveSelections !== false;
        const modal = options.modal || null;
        this._withTeamMembersModal(modal, () => {
            const teamPrev = preserve && typeof this._readDualConstraintSelection === 'function'
                ? this._readDualConstraintSelection('team-members-teams')
                : { include: new Set(), exclude: new Set() };
            const permPrev = preserve && typeof this._readDualConstraintSelection === 'function'
                ? this._readDualConstraintSelection('team-members-permissions')
                : { include: new Set(), exclude: new Set() };
            if (typeof this._renderDualConstraintMsList !== 'function') {
                Logger.warn('team-members: _renderDualConstraintMsList unavailable');
                return;
            }
            this._renderDualConstraintMsList(
                'team-members-teams', options.teamItems || [],
                'Include', 'Exclude', 'Run a search first', teamPrev, { loading }
            );
            this._renderDualConstraintMsList(
                'team-members-permissions', options.permItems || [],
                'Include', 'Exclude', 'Run a search first', permPrev, { loading }
            );
            if (!loading) {
                this._syncTeamMemberConstraintListsUi(modal);
            }
            Logger.log('team-members: constraint lists rendered'
                + (loading ? ' (loading)' : ' — ' + (options.teamItems || []).length + ' teams, '
                    + (options.permItems || []).length + ' permissions'));
        });
    },

    _onTeamMemberMsChange(modal) {
        const ops = Context.opsTab;
        if (!ops || typeof ops.filterTeamSearchCards !== 'function') return;
        this.resetTeamMembersPage();
        ops.filterTeamSearchCards(modal || this._modal);
    },

    resetTeamMembersPage() {
        this._teamMembersPage = 0;
    },

    _readTeamMembersPageSizePref() {
        try {
            const v = this._pageWindow().localStorage.getItem(TEAM_MEMBERS_PAGE_SIZE_KEY);
            if (v === '10' || v === '25' || v === '50' || v === 'all') return v;
        } catch (_e) { /* ignore */ }
        return null;
    },

    _persistTeamMembersPageSizePref(value) {
        try {
            const v = String(value || TEAM_MEMBERS_PAGE_SIZE_DEFAULT);
            this._pageWindow().localStorage.setItem(TEAM_MEMBERS_PAGE_SIZE_KEY, v);
        } catch (e) {
            Logger.debug('team-members: could not persist page size', e);
        }
    },

    _getEffectiveTeamMembersPageSize() {
        const ps = this._teamMembersPageSize;
        if (ps === 'all') return Infinity;
        const n = Number(ps);
        return Number.isFinite(n) && n > 0 ? n : TEAM_MEMBERS_PAGE_SIZE_DEFAULT;
    },

    _syncTeamMembersPageSizeUi(modal) {
        const root = modal || this._modal;
        if (!root) return;
        const sel = root.querySelector('#wf-ops-team-page-size');
        if (!sel) return;
        const ps = this._teamMembersPageSize;
        sel.value = ps === 'all' ? 'all' : String(ps);
    },

    _getTeamMembersPaginationMeta(total) {
        const count = Number(total) || 0;
        const size = this._getEffectiveTeamMembersPageSize();
        if (count === 0 || size === Infinity) {
            return { total: count, totalPages: 1, page: 0, canPrev: false, canNext: false, showNav: false };
        }
        const totalPages = Math.max(1, Math.ceil(count / size));
        let page = this._teamMembersPage || 0;
        if (page >= totalPages) page = totalPages - 1;
        this._teamMembersPage = page;
        return {
            total: count,
            totalPages,
            page,
            canPrev: page > 0,
            canNext: page < totalPages - 1,
            showNav: totalPages > 1
        };
    },

    _getTeamMembersRangeLabel(total) {
        const count = Number(total) || 0;
        if (count === 0) return '0 members';
        const meta = this._getTeamMembersPaginationMeta(count);
        const suffix = count === 1 ? ' member' : ' members';
        if (!meta.showNav) {
            return '1–' + count + ' of ' + count + suffix;
        }
        const size = this._getEffectiveTeamMembersPageSize();
        const start = meta.page * size + 1;
        const end = Math.min((meta.page + 1) * size, count);
        return start + '–' + end + ' of ' + count + suffix;
    },

    getTeamMembersPageSlice(members) {
        const list = Array.isArray(members) ? members : [];
        const size = this._getEffectiveTeamMembersPageSize();
        if (size === Infinity) return list;
        const meta = this._getTeamMembersPaginationMeta(list.length);
        const start = meta.page * size;
        return list.slice(start, start + size);
    },

    syncTeamMembersPagerUi(modal, total, searchDone) {
        const root = modal || this._modal;
        if (!root) return;
        this._teamMembersPagerTotal = Number(total) || 0;
        const row = root.querySelector('#wf-ops-team-pager-row');
        const countEl = root.querySelector('#wf-ops-team-range-count');
        const prevBtn = root.querySelector('#wf-ops-team-prev');
        const nextBtn = root.querySelector('#wf-ops-team-next');
        const showPager = Boolean(searchDone) && (Number(total) || 0) > 0;
        if (row) row.style.display = showPager ? 'flex' : 'none';
        if (countEl) countEl.textContent = showPager ? this._getTeamMembersRangeLabel(total) : '';
        const meta = showPager ? this._getTeamMembersPaginationMeta(total) : null;
        if (prevBtn) prevBtn.disabled = !meta || !meta.canPrev;
        if (nextBtn) nextBtn.disabled = !meta || !meta.canNext;
    },

    _goTeamMembersPage(modal, delta) {
        const meta = this._getTeamMembersPaginationMeta(
            this._teamMembersPagerTotal != null ? this._teamMembersPagerTotal : 0
        );
        if (!meta.showNav) return;
        const next = meta.page + delta;
        if (next < 0 || next >= meta.totalPages) return;
        this._teamMembersPage = next;
        Logger.log('team-members: page — ' + (next + 1) + ' / ' + meta.totalPages);
        const ops = Context.opsTab;
        if (ops && typeof ops.filterTeamSearchCards === 'function') {
            ops.filterTeamSearchCards(modal || this._modal);
        }
    },

    _buildNumericFilterRow(modal, opts) {
        const root = modal || this._modal;
        if (!root) return;
        const rowsEl = root.querySelector('#wf-ops-team-numeric-rows');
        if (!rowsEl) return;
        const dash = Context.dashboard;
        const inputStyle = dash && typeof dash.inputStyle === 'function'
            ? dash.inputStyle() + ' padding: 4px 8px; font-size: 11px;'
            : 'padding: 4px 8px; font-size: 11px; border: 1px solid var(--border, #e5e5e5); border-radius: 4px;';
        const selectStyle = inputStyle;
        const removeBtnStyle = '';
        const row = document.createElement('div');
        row.innerHTML = teamMembersNumericFilterRowHtml({
            field: opts && opts.field,
            comparator: opts && opts.comparator,
            value: opts && opts.value,
            selectStyle,
            inputStyle,
            removeBtnStyle
        });
        const rowEl = row.firstElementChild;
        if (rowEl) rowsEl.appendChild(rowEl);
        Logger.debug('team-members: numeric filter row added');
    },

    _readNumericFilters(modal) {
        const root = modal || this._modal;
        if (!root) return { rows: [], andOr: 'and' };
        const rowsEl = root.querySelector('#wf-ops-team-numeric-rows');
        const andOrToggle = root.querySelector('#wf-ops-team-numeric-andor');
        const andOr = andOrToggle && andOrToggle.checked ? 'or' : 'and';
        const rows = [];
        if (!rowsEl) return { rows, andOr };
        rowsEl.querySelectorAll('[data-wf-team-numeric-row]').forEach((rowEl) => {
            const fieldEl = rowEl.querySelector('[data-wf-team-numeric-field]');
            const compEl = rowEl.querySelector('[data-wf-team-numeric-comparator]');
            const valueEl = rowEl.querySelector('[data-wf-team-numeric-value]');
            const field = fieldEl ? fieldEl.value : '';
            const comparator = compEl ? compEl.value : '';
            const raw = valueEl ? valueEl.value.trim() : '';
            if (!field || !comparator || raw === '') return;
            const value = Number(raw);
            if (!Number.isFinite(value)) return;
            rows.push({ field, comparator, value });
        });
        return { rows, andOr };
    },

    _onTeamMembersApply(modal) {
        const ops = Context.opsTab;
        if (ops && typeof ops.applyTeamFilters === 'function') {
            void ops.applyTeamFilters(modal);
        }
    },

    _captureTeamMembersState(modal) {
        const ops = Context.opsTab;
        if (ops && typeof ops.captureTeamTabState === 'function') ops.captureTeamTabState(modal);
    },

    _restoreTeamMembersState(modal) {
        const ops = Context.opsTab;
        if (ops && typeof ops.restoreTeamTabState === 'function') ops.restoreTeamTabState(modal);
    }
};

function teamMembersPanelHtml(_loader) {
    const dash = Context.dashboard;
    const box = dash && typeof dash.panelBoxStyle === 'function' ? dash.panelBoxStyle() : 'border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--card, #ffffff);';
    const label = dash && typeof dash.labelStyle === 'function' ? dash.labelStyle() : 'font-size: 11px; font-weight: 600; color: var(--muted-foreground, #64748b);';
    const hint = dash && typeof dash.hintStyle === 'function' ? dash.hintStyle() : 'font-size: 11px; color: var(--muted-foreground, #64748b);';
    const input = dash && typeof dash.inputStyle === 'function' ? dash.inputStyle() : 'padding: 8px 12px; font-size: 13px; border: 1px solid var(--border, #e5e5e5); border-radius: 6px; background: var(--background, white); color: var(--foreground, #333); box-sizing: border-box;';
    const btnClass = (variant, size) => (dash && typeof dash.dashBtnClass === 'function'
        ? dash.dashBtnClass(variant, size)
        : 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size);
    const splitPanel = dash && typeof dash.splitPanelSectionHtml === 'function'
        ? dash.splitPanelSectionHtml.bind(dash)
        : null;

    const leftHtml = `
                    <div style="${box} display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                        <div style="padding: 14px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px;">
                            <div>
                                <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 6px 0; color: var(--foreground, #0f172a);">
                                    Team Member Search
                                </h3>
                                <p style="${hint} margin: 0; line-height: 1.45;">
                                    Search the Computer Use team by name or email. Leave blank to list all members.
                                </p>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: stretch;">
                                <input type="text" id="wf-ops-team-search-input" placeholder="Name or email…" autocomplete="off" style="${input} flex: 1; min-width: 0;">
                                <button type="button" id="wf-ops-team-search-btn" class="${btnClass('primary', 'regular')}" style="flex-shrink: 0;">Search</button>
                            </div>
                        </div>
                        <div id="wf-ops-team-filter-wrap" style="display: none; flex: 1; min-height: 0; overflow: hidden; flex-direction: column;">
                            <div id="wf-ops-team-left-scroll" style="flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 0 14px 14px; display: flex; flex-direction: column; gap: 14px;">
                                <div>
                                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
                                        <div style="${label} font-weight: 600; color: var(--foreground, #0f172a);">Numeric filters</div>
                                        <label style="display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--muted-foreground, #64748b); cursor: pointer; flex-shrink: 0;">
                                            <input type="checkbox" id="wf-ops-team-numeric-andor" style="margin: 0;">
                                            <span>Match any (OR)</span>
                                        </label>
                                    </div>
                                    <p style="${hint} margin: 0 0 8px 0;">Stage filters below, then press Apply. Stats load after search. Default matches all conditions (AND).</p>
                                    <div id="wf-ops-team-numeric-rows" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;"></div>
                                    <button type="button" id="wf-ops-team-numeric-add" class="${btnClass('basic', 'nav')} wf-dash-btn--full" style="padding: 6px 10px;">+ Add filter</button>
                                </div>
                                ${dash && typeof dash.multiSelectHtml === 'function'
        ? `<div>
                                    <div style="${label} font-weight: 600; margin-bottom: 8px; color: var(--foreground, #0f172a);">Narrow results</div>
                                    <p style="${hint} margin: 0 0 8px 0;">Include requires a match; exclude removes matches. None selected = all.</p>
                                    <div style="display: flex; flex-direction: column; gap: 12px;">
                                        ${dash.multiSelectHtml(TEAM_MEMBERS_BADGE_SCOPE, 'Member badge', '', false)}
                                        ${dash.multiSelectHtml('team-members-teams', 'Team', 'Run a search first', false)}
                                        ${dash.multiSelectHtml('team-members-permissions', 'Permission', 'Run a search first', false)}
                                    </div>
                                </div>`
        : ''}
                                <button type="button" id="wf-ops-team-apply-filters" class="${btnClass('primary', 'nav')} wf-dash-btn--full">Apply</button>
                            </div>
                        </div>
                    </div>`;
    const rightHtml = `
                <div style="flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; ${box}">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;">
                        <div id="wf-ops-team-search-status-row" style="display: none; align-items: center; justify-content: space-between; gap: 8px;">
                            <div id="wf-ops-team-search-status" style="flex: 1; min-width: 0; font-size: 12px; color: var(--muted-foreground, #666); line-height: 1.45;"></div>
                            <div style="display: flex; gap: 6px; flex-shrink: 0; align-items: center;">
                                <button type="button" id="wf-ops-team-expand-all-btn" class="${btnClass('basic', 'compact')}" style="display: none;">Collapse All</button>
                                <button type="button" id="wf-ops-team-search-clear-btn" class="${btnClass('basic', 'compact')}" style="display: none;">Clear</button>
                            </div>
                        </div>
                        <div id="wf-ops-team-search-status-placeholder" style="font-size: 13px; font-weight: 600; color: var(--foreground, #0f172a);">
                            Results
                            <span style="display: block; font-size: 11px; font-weight: 400; color: var(--muted-foreground, #64748b); margin-top: 4px;">Run a search to list team members.</span>
                        </div>
                        <div id="wf-ops-team-pager-row" style="display: none; margin-top: 10px; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
                            <label style="${label} display: inline-flex; align-items: center; gap: 6px; margin: 0;">
                                <span>Show</span>
                                <select id="wf-ops-team-page-size" style="${input} width: auto; padding: 4px 8px; font-size: 11px; cursor: pointer;">
                                    <option value="10">10</option>
                                    <option value="25">25</option>
                                    <option value="50">50</option>
                                    <option value="all">All</option>
                                </select>
                            </label>
                            <span id="wf-ops-team-range-count" style="${label} white-space: nowrap;"></span>
                            <button type="button" id="wf-ops-team-prev" aria-label="Previous page" title="Previous page" class="${btnClass('basic', 'icon')}">${teamMembersPagerChevronSvg('prev')}</button>
                            <button type="button" id="wf-ops-team-next" aria-label="Next page" title="Next page" class="${btnClass('basic', 'icon')}">${teamMembersPagerChevronSvg('next')}</button>
                        </div>
                    </div>
                    <div id="wf-ops-team-search-output-wrap" style="display: none; flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px;">
                        <div id="wf-ops-team-search-cards"></div>
                    </div>
                </div>`;

    if (splitPanel) {
        return '<div id="wf-dash-team-members-inner" style="width: 100%; flex: 1; min-height: 0; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;">'
            + splitPanel(leftHtml, rightHtml) + '</div>';
    }

    return '<div id="wf-dash-team-members-inner" style="width: 100%; flex: 1; min-height: 0; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;">'
        + '<section style="display: flex; flex: 1; min-height: 0; gap: 16px; overflow: hidden; width: 100%;">'
        + '<aside style="width: 320px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">'
        + leftHtml
        + '</aside>'
        + rightHtml
        + '</section></div>';
}

function attachTeamMembersListeners(modal, dash) {
    const ops = Context.opsTab;
    if (!ops) return;
    if (modal.dataset.wfTeamMembersListenersAttached === '1') {
        if (typeof ops.restoreTeamTabState === 'function') ops.restoreTeamTabState(modal);
        return;
    }
    modal.dataset.wfTeamMembersListenersAttached = '1';
    if (typeof dash._renderTeamMemberBadgeFilter === 'function') {
        dash._renderTeamMemberBadgeFilter(modal);
    }
    if (typeof ops.injectSpinnerStyle === 'function') ops.injectSpinnerStyle();

    const teamSearchBtn = modal.querySelector('#wf-ops-team-search-btn');
    const teamSearchInput = modal.querySelector('#wf-ops-team-search-input');
    if (teamSearchBtn && typeof ops.handleTeamSearch === 'function') {
        teamSearchBtn.addEventListener('click', () => { void ops.handleTeamSearch(modal); });
    }
    if (teamSearchInput && typeof ops.handleTeamSearch === 'function') {
        teamSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); void ops.handleTeamSearch(modal); }
        });
        teamSearchInput.addEventListener('input', () => {
            if (typeof ops.captureTeamTabState === 'function') ops.captureTeamTabState(modal);
        });
    }
    const teamSearchClearBtn = modal.querySelector('#wf-ops-team-search-clear-btn');
    if (teamSearchClearBtn && typeof ops.clearTeamSearchResults === 'function') {
        teamSearchClearBtn.addEventListener('click', () => ops.clearTeamSearchResults(modal));
    }
    const teamExpandAllBtn = modal.querySelector('#wf-ops-team-expand-all-btn');
    if (teamExpandAllBtn && typeof ops.toggleTeamExpandAll === 'function') {
        teamExpandAllBtn.addEventListener('click', () => ops.toggleTeamExpandAll(modal));
    }
    const applyBtn = modal.querySelector('#wf-ops-team-apply-filters');
    if (applyBtn && typeof dash._onTeamMembersApply === 'function') {
        applyBtn.addEventListener('click', () => dash._onTeamMembersApply(modal));
    }
    const addNumericBtn = modal.querySelector('#wf-ops-team-numeric-add');
    if (addNumericBtn && typeof dash._buildNumericFilterRow === 'function') {
        addNumericBtn.addEventListener('click', () => dash._buildNumericFilterRow(modal));
    }
    const numericRows = modal.querySelector('#wf-ops-team-numeric-rows');
    if (numericRows) {
        numericRows.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('[data-wf-team-numeric-remove]');
            if (!removeBtn) return;
            const row = removeBtn.closest('[data-wf-team-numeric-row]');
            if (row) row.remove();
        });
    }
    const pageSizeSel = modal.querySelector('#wf-ops-team-page-size');
    if (pageSizeSel) {
        const pref = typeof dash._readTeamMembersPageSizePref === 'function'
            ? dash._readTeamMembersPageSizePref()
            : null;
        if (pref) {
            dash._teamMembersPageSize = pref === 'all' ? 'all' : (Number(pref) || TEAM_MEMBERS_PAGE_SIZE_DEFAULT);
        }
        if (typeof dash._syncTeamMembersPageSizeUi === 'function') dash._syncTeamMembersPageSizeUi(modal);
        pageSizeSel.addEventListener('change', () => {
            const val = pageSizeSel.value;
            dash._teamMembersPageSize = val === 'all' ? 'all' : (Number(val) || TEAM_MEMBERS_PAGE_SIZE_DEFAULT);
            if (typeof dash._persistTeamMembersPageSizePref === 'function') dash._persistTeamMembersPageSizePref(val);
            if (typeof dash.resetTeamMembersPage === 'function') dash.resetTeamMembersPage();
            Logger.log('team-members: page size — ' + val);
            if (ops && typeof ops.filterTeamSearchCards === 'function') ops.filterTeamSearchCards(modal);
        });
    }
    const teamPrev = modal.querySelector('#wf-ops-team-prev');
    const teamNext = modal.querySelector('#wf-ops-team-next');
    if (teamPrev && typeof dash._goTeamMembersPage === 'function') {
        teamPrev.addEventListener('click', () => dash._goTeamMembersPage(modal, -1));
    }
    if (teamNext && typeof dash._goTeamMembersPage === 'function') {
        teamNext.addEventListener('click', () => dash._goTeamMembersPage(modal, 1));
    }
    if (!modal.dataset.wfOpsMemberDetailsToggle && typeof ops.attachTeamMemberDetailsToggle === 'function') {
        ops.attachTeamMemberDetailsToggle(modal);
    }
    if (!modal.dataset.wfOpsMemberEditDelegation && typeof ops.attachTeamMemberEditDelegation === 'function') {
        ops.attachTeamMemberEditDelegation(modal);
    }
    if (typeof ops.restoreTeamTabState === 'function') ops.restoreTeamTabState(modal);
}

const plugin = {
    id: 'team-members',
    name: 'Team Members',
    description: 'Team member search tab for the Ops dashboard',
    _version: '3.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            Logger.error('team-members: dashboard loader not registered');
            return;
        }
        Object.assign(loader, teamMembersMethods);
        Context.dashboard.registerTab({
            id: 'team-members',
            label: 'Team Members',
            panelHtml(dash) { return teamMembersPanelHtml(dash); },
            attachListeners(modal, dash) { attachTeamMembersListeners(modal, dash); },
            onActivate(modal, dash) {
                if (typeof dash._restoreTeamMembersState === 'function') dash._restoreTeamMembersState(modal);
                requestAnimationFrame(() => dash._applyAllSidePanelWidths());
            },
            captureState(modal, dash) {
                if (typeof dash._captureTeamMembersState === 'function') dash._captureTeamMembersState(modal);
            }
        });
        Logger.log('team-members: tab registered');
    }

};
