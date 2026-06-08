// ============= team-members.js =============
// Team Members tab for the Ops dashboard.

// ============= dashboard.js =============
// Worker Output Search (Ops dashboard): search output, team members, verifier fetch.
//
// This is the live port of the local prototype in local/dashboard. All data is
// PostgREST table/query shapes come from the encrypted ops bundle (Context.opsTab).
// which reuses the exact same Supabase runtime config + session token gathering as the
// people lookup tool (cookies / sb-*-auth-token JWT). No secrets are hardcoded here.
//
// Porting notes / oddities live in local/dashboard/reference/dashboard-live-port-handoff.md.

const DASH_SIDE_PANEL_WIDTH_STORAGE_KEY = 'fleet-ux:dashboard-side-panel-width';
const DASH_SIDE_PANEL_MIN_WIDTH = 320;
const DASH_SIDE_PANEL_MIN_RESULTS_WIDTH = 280;
const DASH_SIDE_PANEL_MAX_VIEWPORT_RATIO = 0.5;
const DASH_TEAM_MEMBERS_MS_KEYS = ['team-members-teams', 'team-members-permissions'];
const DASH_MS_HOVER_OPEN_MS = 300;
const DASH_MS_HOVER_CLOSE_MS = 100;
const DASH_MS_FLYOUT_ANIM_MS = 140;
const DASH_MS_FLYOUT_WIDTH = 'min(280px, 42vw)';

function dashIsTeamMembersMsKey(scopeKey) {
    return DASH_TEAM_MEMBERS_MS_KEYS.includes(scopeKey);
}

function dashIsFilterMsKey(scopeKey) {
    return Boolean(scopeKey && scopeKey.startsWith('filter-'));
}


function dashLib() {
    return Context.dashboardLib;
}

function dashEscHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const teamMembersMethods = {
    _renderTeamMemberConstraintLists(opts) {
        const options = opts || {};
        const loading = Boolean(options.loading);
        const emptySel = { include: new Set(), exclude: new Set() };
        const preserveSelections = options.preserveSelections !== false;
        const prevTeams = preserveSelections
            ? this._readDualConstraintSelection('team-members-teams')
            : emptySel;
        const prevPerms = preserveSelections
            ? this._readDualConstraintSelection('team-members-permissions')
            : emptySel;
        if (!loading) {
            for (const key of DASH_TEAM_MEMBERS_MS_KEYS) {
                delete this._state.msDropdownFilter[key];
                const input = this._q('[data-wf-dash-ms-filter="' + key + '"]');
                if (input) input.value = '';
            }
        }
        this._renderDualConstraintMsList(
            'team-members-teams',
            options.teamItems || [],
            'In',
            'Not in',
            loading ? 'Loading…' : 'No teams available',
            prevTeams,
            { loading }
        );
        this._renderDualConstraintMsList(
            'team-members-permissions',
            options.permItems || [],
            'Has',
            "Doesn't Have",
            loading ? 'Loading…' : 'No permissions available',
            prevPerms,
            { loading }
        );
    },

    _resetTeamMemberConstraintState() {
        for (const key of DASH_TEAM_MEMBERS_MS_KEYS) {
            delete this._state.msDropdownFilter[key];
            const input = this._q('[data-wf-dash-ms-filter="' + key + '"]');
            if (input) input.value = '';
            const itemsEl = this._msItemsEl(key);
            if (itemsEl) {
                itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
            }
            this._updateMsCount(key);
        }
    },

    _resetTeamMemberMsDropdowns() {
        for (const key of DASH_TEAM_MEMBERS_MS_KEYS) {
            delete this._state.msDropdownOpen[key];
            delete this._state.msDropdownFilter[key];
            const input = this._q('[data-wf-dash-ms-filter="' + key + '"]');
            if (input) input.value = '';
            const itemsEl = this._msItemsEl(key);
            if (itemsEl) {
                const labels = key === 'team-members-teams'
                    ? ['In', 'Not in']
                    : ['Has', "Doesn't Have"];
                itemsEl.innerHTML = this._dualConstraintItemsHtml(
                    key, [], labels[0], labels[1], 'Run search to enable', false
                );
            }
            this._updateMsCount(key);
            this._syncMsDropdown(key, { immediate: true });
        }
    },

    _onTeamMemberMsChange(modal) {
        teamMembersOnMsChange(modal);
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
        // panelHtml receives the loader plugin; shared UI helpers live on Context.dashboard.
        const dash = Context.dashboard;
        const box = dash && typeof dash.panelBoxStyle === 'function' ? dash.panelBoxStyle() : 'border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--card, #ffffff);';
        const label = dash && typeof dash.labelStyle === 'function' ? dash.labelStyle() : 'font-size: 11px; font-weight: 600; color: var(--muted-foreground, #64748b);';
        const hint = dash && typeof dash.hintStyle === 'function' ? dash.hintStyle() : 'font-size: 11px; color: var(--muted-foreground, #64748b);';
        const input = dash && typeof dash.inputStyle === 'function' ? dash.inputStyle() : 'padding: 8px 12px; font-size: 13px; border: 1px solid var(--border, #e5e5e5); border-radius: 6px; background: var(--background, white); color: var(--foreground, #333); box-sizing: border-box;';
        const navBtn = dash && typeof dash.navBtnPrimaryStyle === 'function' ? dash.navBtnPrimaryStyle() : 'padding: 8px 14px; font-size: 12px; font-weight: 600; color: var(--brand, #4f46e5); background: var(--background, white); border: 1px solid var(--border, #e5e5e5); border-radius: 6px; cursor: pointer;';
        const msTeams = dash && typeof dash.multiSelectHtml === 'function'
            ? dash.multiSelectHtml('team-members-teams', 'Teams', 'Run search to load teams', false)
            : '';
        const msPerms = dash && typeof dash.multiSelectHtml === 'function'
            ? dash.multiSelectHtml('team-members-permissions', 'Permissions', 'All permissions', false)
            : '';
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
                                <button type="button" id="wf-ops-team-search-btn" class="wf-ops-action-btn" style="${navBtn} flex-shrink: 0;">Search</button>
                            </div>
                        </div>
                        <div id="wf-ops-team-filter-wrap" style="display: none; flex: 1; min-height: 0; overflow: hidden; flex-direction: column;">
                            <div id="wf-ops-team-left-scroll" style="flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 0 14px 14px; display: flex; flex-direction: column; gap: 14px;">
                                <div>
                                    <div style="${label} margin-bottom: 8px; font-weight: 600; color: var(--foreground, #0f172a);">Narrow results</div>
                                    <p style="${hint} margin: 0 0 8px 0;">Use In / Not in (teams) and Has / Doesn't Have (permissions). Leave all unchecked to show everyone.</p>
                                    <div style="display: flex; flex-direction: column; gap: 12px;">
                                        ${msTeams}
                                        ${msPerms}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>`;
        const rightHtml = `
                <div style="flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; ${box}">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;">
                        <div id="wf-ops-team-search-status-row" style="display: none; align-items: center; justify-content: space-between; gap: 8px;">
                            <div id="wf-ops-team-search-status" style="flex: 1; min-width: 0; font-size: 12px; color: var(--muted-foreground, #666); line-height: 1.45;"></div>
                            <div style="display: flex; gap: 6px; flex-shrink: 0; align-items: center;">
                                <button type="button" id="wf-ops-team-expand-all-btn" style="
                                    display: none;
                                    padding: 2px 10px;
                                    font-size: 11px;
                                    font-weight: 500;
                                    color: var(--muted-foreground, #666);
                                    background: var(--background, white);
                                    border: 1px solid var(--border, #e5e5e5);
                                    border-radius: 4px;
                                    cursor: pointer;
                                ">Collapse All</button>
                                <button type="button" id="wf-ops-team-search-clear-btn" style="
                                    display: none;
                                    padding: 2px 10px;
                                    font-size: 11px;
                                    font-weight: 500;
                                    color: var(--muted-foreground, #666);
                                    background: var(--background, white);
                                    border: 1px solid var(--border, #e5e5e5);
                                    border-radius: 4px;
                                    cursor: pointer;
                                ">Clear</button>
                            </div>
                        </div>
                        <div id="wf-ops-team-search-status-placeholder" style="font-size: 13px; font-weight: 600; color: var(--foreground, #0f172a);">
                            Results
                            <span style="display: block; font-size: 11px; font-weight: 400; color: var(--muted-foreground, #64748b); margin-top: 4px;">Run a search to list team members.</span>
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
    if (!modal.dataset.wfOpsMemberDetailsToggle && typeof ops.attachTeamMemberDetailsToggle === 'function') {
        ops.attachTeamMemberDetailsToggle(modal);
    }
    if (!modal.dataset.wfOpsMemberEditDelegation && typeof ops.attachTeamMemberEditDelegation === 'function') {
        ops.attachTeamMemberEditDelegation(modal);
    }
    if (typeof ops.restoreTeamTabState === 'function') ops.restoreTeamTabState(modal);
}

function teamMembersOnMsChange(modal) {
    const ops = Context.opsTab;
    if (ops && typeof ops.filterTeamSearchCards === 'function') ops.filterTeamSearchCards(modal);
}

const plugin = {
    id: 'team-members',
    name: 'Team Members',
    description: 'Team member search tab for the Ops dashboard',
    _version: '1.1',
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
