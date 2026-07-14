// ============= dashboard.js =============
// Ops dashboard loader: modal shell, tab registry, shared multi-select UI.
// Tab modules: search-output.js, diff-viewer.js, team-members.js, verifier-fetcher.js
//
// This is the live port of the local prototype in local/dashboard. All data is
// PostgREST table/query shapes come from the encrypted ops bundle (Context.opsTab).
// which reuses the exact same Supabase runtime config + session token gathering as the
// people lookup tool (cookies / sb-*-auth-token JWT). No secrets are hardcoded here.
//
// Porting notes / oddities live in local/dashboard/reference/dashboard-live-port-handoff.md.

const DASH_SIDE_PANEL_WIDTH_STORAGE_KEY = 'fleet-ux:dashboard-side-panel-width';
const DASH_RESULTS_PANEL_MAX_WIDTH_STORAGE_KEY = 'fleet-ux:dashboard-results-panel-max-width';
const DASH_RESULTS_PANEL_HIDDEN_STORAGE_KEY = 'fleet-ux:dashboard-results-panel-hidden';
const DASH_STATS_PANEL_HIDDEN_STORAGE_KEY = 'fleet-ux:dashboard-stats-panel-hidden';
const DASH_STATS_PANEL_WIDTH_STORAGE_KEY = 'fleet-ux:dashboard-stats-panel-width';
const DASH_RESULTS_PANEL_FULL_WIDTH_TOLERANCE_PX = 8;
const DASH_DIFF_VIEWER_SIDE_PANEL_WIDTH_KEY = 'fleet-ux:diff-viewer-side-panel-width';
const DASH_DIFF_VIEWER_SIDE_PANEL_DEFAULT_RATIO = 0.25;
const DASH_SIDE_PANEL_MIN_WIDTH = 320;
const DASH_SIDE_PANEL_MIN_RESULTS_WIDTH = 280;
const DASH_STATS_PANEL_MIN_WIDTH = 280;
const DASH_STATS_PANEL_DEFAULT_WIDTH = 320;
const DASH_STATS_PANEL_COLLAPSED_WIDTH = 44;
const DASH_RESULTS_STATS_HANDLE_WIDTH = 18;
const DASH_SIDE_PANEL_MAX_VIEWPORT_RATIO = 0.5;
const DASH_TEAM_MEMBERS_MS_KEYS = ['team-members-teams', 'team-members-permissions', 'team-members-badges'];
const DASH_TEAM_MEMBERS_DUAL_CONSTRAINT_MS_KEYS = ['team-members-teams', 'team-members-permissions'];
const DASH_SEARCH_MS_KEYS = ['search-envs', 'search-projects', 'search-teams'];
const DASH_RESULTS_PAGE_SIZE_DEFAULT = 100;
const DASH_MS_HOVER_OPEN_MS = 300;
const DASH_TASK_CARD_BG = '#121212';
const DASH_CARD_BORDER = '2px solid color-mix(in srgb, var(--foreground, #0f172a) 28%, var(--border, #cbd5e1))';
const DASH_MS_HOVER_CLOSE_MS = 300;
const DASH_MS_FLYOUT_ANIM_MS = 140;
const DASH_MS_FLYOUT_WIDTH = 'min(280px, 42vw)';

function dashIsTeamMembersMsKey(scopeKey) {
    return DASH_TEAM_MEMBERS_MS_KEYS.includes(scopeKey);
}

function dashIsTeamMembersDualConstraintMsKey(scopeKey) {
    return DASH_TEAM_MEMBERS_DUAL_CONSTRAINT_MS_KEYS.includes(scopeKey);
}

function dashIsFilterMsKey(scopeKey) {
    return Boolean(scopeKey && scopeKey.startsWith('filter-'));
}

function dashIsSearchMsKey(scopeKey) {
    return DASH_SEARCH_MS_KEYS.includes(scopeKey);
}

function dashIsStatsChartFilterMsKey(scopeKey) {
    return Boolean(scopeKey && scopeKey.startsWith('stats-chart-filter-'));
}

function dashIsFlyoutMsKey(scopeKey) {
    return dashIsFilterMsKey(scopeKey) || dashIsSearchMsKey(scopeKey) || dashIsStatsChartFilterMsKey(scopeKey);
}

function dashFilterScopes() {
    const lib = Context.dashboardLib;
    return (lib && lib.filterScopes) || [];
}

function dashAllFlyoutMsKeys(modal) {
    const keys = dashFilterScopes().map((s) => s.scopeKey).concat(DASH_SEARCH_MS_KEYS);
    if (modal) keys.push(...dashStatsChartFilterMsKeys(modal));
    return keys;
}

function dashStatsChartFilterMsKeys(modal) {
    if (!modal) return [];
    const keys = [];
    modal.querySelectorAll('[data-wf-dash-ms-wrap]').forEach((wrap) => {
        const key = wrap.getAttribute('data-wf-dash-ms-wrap');
        if (key && key.startsWith('stats-chart-filter-')) keys.push(key);
    });
    return keys;
}

function dashLib() {
    return Context.dashboardLib;
}

function dashEscHtml(value) {
    const lib = Context.dashboardLib;
    if (lib && typeof lib.escHtml === 'function') return lib.escHtml(value);
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


const plugin = {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Ops dashboard loader: modal shell, tab registry, shared UI primitives',
    _version: '11.7',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    _overlay: null,
    _modal: null,
    _built: false,
    _state: null,
    _tabs: null,
    _tabsById: null,
    _onKeydown: null,
    _keydownDoc: null,
    _splitResizeAttached: false,
    _flyoutResizeTimer: null,
    _activeTabFallbackLogged: false,

    init(state) {
        if (state && state.loaderRegistered) {
            Logger.debug('dashboard: loader already registered — skipping re-init');
            return;
        }
        this._state = this._createInitialState();
        this._tabs = [];
        this._tabsById = {};
        const self = this;
        Context.dashboard = {
            _loader: self,
            registerTab(def) {
                if (!def || !def.id) {
                    Logger.warn('dashboard: registerTab skipped — missing id');
                    return;
                }
                const isNew = !self._tabsById[def.id];
                self._tabsById[def.id] = def;
                const idx = self._tabs.findIndex((t) => t.id === def.id);
                if (idx >= 0) self._tabs[idx] = def;
                else self._tabs.push(def);
                Logger.log('dashboard: tab registered — ' + def.id);
                if (isNew && self._built && self._overlay && self._overlay.isConnected) {
                    const wasOpen = self._isOpen();
                    self._built = false;
                    if (wasOpen) {
                        self._ensureBuilt();
                        self._setActiveTab(self._resolveActiveTabId(self._state.activeTab));
                        self._syncIncompleteTabsBanner();
                    }
                }
            },
            open: () => self.open(),
            close: () => self.close(),
            toggle: () => self.toggle(),
            isOpen: () => self._isOpen(),
            isReady: () => self._isDashboardReady(),
            copyChipHtml: (text) => self._copyChipHtml(text),
            personChipsHtml: (name, email, id, linkTitle) => self._personChipsHtml(name, email, id, linkTitle),
            panelBoxStyle: () => self._panelBoxStyle(),
            taskCardBoxStyle: () => self._taskCardBoxStyle(),
            labelStyle: () => self._labelStyle(),
            hintStyle: () => self._hintStyle(),
            inputStyle: () => self._inputStyle(),
            dashBtnClass: (variant, size) => self._dashBtnClass(variant, size),
            logApiClick: (action, detail) => self._logDashApiClick(action, detail),
            logApiSkip: (action, reason, detail) => self._logDashApiSkip(action, reason, detail),
            multiSelectHtml: (scopeKey, label, emptyHint, bulkActions) => self._multiSelectHtml(scopeKey, label, emptyHint, bulkActions),
            renderMsList: (scopeKey, items, emptyHint, preserveSelected, opts) =>
                self._renderMsList(scopeKey, items, emptyHint, preserveSelected, opts),
            selectedMsValues: (scopeKey) => self._selectedFromList(scopeKey),
            splitPanelSectionHtml: (leftHtml, rightHtml, scopeKey, statsHtml) =>
                self._splitPanelSectionHtml(leftHtml, rightHtml, scopeKey, statsHtml),
            readStatsPanelHiddenPref: () => self._readStatsPanelHiddenPref(),
            writeStatsPanelHiddenPref: (hidden) => self._writeStatsPanelHiddenPref(hidden),
            applyStatsPanelLayout: (root) => self._applyStatsPanelLayout(root),
            readResultsPanelHiddenPref: () => self._readResultsPanelHiddenPref(),
            writeResultsPanelHiddenPref: (hidden) => self._writeResultsPanelHiddenPref(hidden),
            applyResultsPanelLayout: (root) => self._applyResultsPanelLayout(root),
            scheduleSplitLayoutSync: () => self._scheduleSplitLayoutSync(),
            pagerChevronSvg: (dir) => self._pagerChevronSvg(dir),
            paginationMeta: (total, pageSize, pageHolder) => self._paginationMeta(total, pageSize, pageHolder),
            rangeLabel: (meta, options) => self._rangeLabel(meta, options),
            syncPagerNavUi: (opts) => self._syncPagerNavUi(opts),
            numericFilterRowHtml: (opts) => self._numericFilterRowHtml(opts),
            setAuthorTokens: (persons, options) => {
                if (typeof self._setAuthorTokens === 'function') return self._setAuthorTokens(persons, options);
                Logger.warn('dashboard: setAuthorTokens unavailable — search-output tab not loaded');
            },
            runContributorWorkerOutputDeepDive: (person, options) => {
                if (typeof self._runContributorWorkerOutputDeepDive === 'function') {
                    return self._runContributorWorkerOutputDeepDive(person, options);
                }
                Logger.warn('dashboard: runContributorWorkerOutputDeepDive unavailable — search-output tab not loaded');
            },
            switchFleetTeam: (teamId) => {
                if (typeof self._switchFleetTeam === 'function') return self._switchFleetTeam(teamId);
                Logger.warn('dashboard: switchFleetTeam unavailable — search-output tab not loaded');
            },
            renderTeamMemberConstraintLists: (opts) => {
                if (typeof self._renderTeamMemberConstraintLists === 'function') return self._renderTeamMemberConstraintLists(opts);
                Logger.warn('dashboard: renderTeamMemberConstraintLists unavailable — team-members tab not loaded');
            },
            readTeamMemberConstraints: (scopeKey) => {
                if (typeof self._readDualConstraintSelection === 'function') return self._readDualConstraintSelection(scopeKey);
                return { include: new Set(), exclude: new Set() };
            },
            resetTeamMemberConstraintState: (modal) => {
                if (typeof self._resetTeamMemberConstraintState === 'function') self._resetTeamMemberConstraintState(modal);
            },
            resetTeamMemberMsDropdowns: (modal) => {
                if (typeof self._resetTeamMemberMsDropdowns === 'function') self._resetTeamMemberMsDropdowns(modal);
            },
            resetTeamMemberFilters: (modal) => {
                if (typeof self._resetTeamMemberFilters === 'function') self._resetTeamMemberFilters(modal);
            },
            readTeamMembersNumericFilters: (modal) => {
                if (typeof self._readNumericFilters === 'function') return self._readNumericFilters(modal);
                return { rows: [], andOr: 'and' };
            },
            resetTeamMembersPage: () => {
                if (typeof self.resetTeamMembersPage === 'function') self.resetTeamMembersPage();
            },
            getTeamMembersPageSlice: (members) => {
                if (typeof self.getTeamMembersPageSlice === 'function') return self.getTeamMembersPageSlice(members);
                return members;
            },
            syncTeamMembersPagerUi: (modal, total, searchDone) => {
                if (typeof self.syncTeamMembersPagerUi === 'function') self.syncTeamMembersPagerUi(modal, total, searchDone);
            },
            syncTeamMemberConstraintListsUi: (modal) => {
                if (typeof self._syncTeamMemberConstraintListsUi === 'function') self._syncTeamMemberConstraintListsUi(modal);
            },
            captureTabState: (modal) => {
                for (const tab of self._tabs) {
                    if (typeof tab.captureState === 'function') tab.captureState(modal, self);
                }
            }
        };
        if (state) state.loaderRegistered = true;
        Logger.log('dashboard: loader registered (Context.dashboard)');
    },

    _createInitialState() {
        return {
            catalog: null,
            bootstrapStatus: 'idle',
            bootstrapError: null,
            sessionRefreshRequired: false,
            draftTokens: [],
            resultsKindTab: 'all',
            hydrateUi: {},
            cardRehydrating: {},
            cardRescuing: {},
            hydrateBulkActive: false,
            hydrateFetchActive: false,
            autoHydrateActive: false,
            pageHydrateScheduled: false,
            pageHydratePending: false,
            autoHydratePassId: 0,
            timeFilterUserPicked: false,
            resultsPageSize: DASH_RESULTS_PAGE_SIZE_DEFAULT,
            resultsPage: 0,
            activeTab: 'search-output',
            leftTab: 'search',
            statsTab: 'stats',
            statsUseFiltered: true,
            ratingsHideProvisional: false,
            ratingsSortKey: null,
            ratingsNameFilter: '',
            ratingsExpandedScores: null,
            ratingsFromResults: false,
            statsCharts: null,
            statsLayout: null,
            statsViewMode: 'dashboard',
            statsBuilderDraft: null,
            statsBuilderEditId: null,
            statsBuilderDashboardId: null,
            cachedItems: null,
            filteredItems: null,
            hasSearched: false,
            loading: false,
            searchLoadPhase: '',
            searchLoadLog: [],
            searchError: null,
            disputesBulkIncomplete: false,
            flagsBulkIncomplete: false,
            openDisputesByTaskId: null,
            resolvedDisputeTaskIds: null,
            resolvedDisputeAtByTaskId: null,
            resolverDisputeTaskIds: null,
            prefetch: null,
            activeSearchScope: null,
            activeSearchAfterIso: null,
            activeSearchBeforeIso: null,
            activeSearchAuthorIds: null,
            bootstrapRunPromise: null,
            committed: null,
            appliedFilters: null,
            filterSelectionOrder: [],
            filterListOptions: null,
            cardUi: {},
            taskOpenUi: {},
            disputeClaimUi: {},
            helpfulnessUi: {},
            flagResolutionUi: {},
            flagCreateUi: {},
            actionBlockUi: {},
            userStoryUi: {},
            sessionQaUi: {},
            verifierOutputUi: {},
            supplementalActionMsgUi: {},
            screenshotUi: {},
            includeTasks: true,
            includeQa: true,
            includeDisputes: false,
            includeSeniorReview: false,
            includeSessions: false,
            searchLimit: null,
            searchFetchActive: false,
            searchGeneration: 0,
            targetIdsCacheKey: '',
            targetIdsCache: null,
            msDropdownOpen: {},
            msDropdownFilter: {},
            msDropdownPinned: {},
            msDropdownToggled: {},
            msDropdownHoverTimers: {},
            msHoverDisarmed: {},
            msDropdownRefreshActive: false,
            msBulkToggleMode: {},
            filterExpandAllIntent: 'expand',
            retrieveInput: ''
        };
    },

    // ── Storage helpers ──,

    _pageWindow() {
        try {
            if (typeof Context !== 'undefined' && Context.getPageWindow) {
                return Context.getPageWindow() || window;
            }
        } catch (_e) { /* fall through */ }
        return window;
    },

    _logDashApiClick(action, detail) {
        const label = String(action || 'unknown').trim();
        const suffix = detail != null && String(detail).trim() ? ' — ' + String(detail).trim() : '';
        Logger.log('dashboard: api ' + label + suffix);
    },

    _logDashApiSkip(action, reason, detail) {
        const label = String(action || 'unknown').trim();
        const why = String(reason || 'blocked').trim();
        const suffix = detail != null && String(detail).trim() ? ' — ' + String(detail).trim() : '';
        Logger.warn('dashboard: api ' + label + ' skipped — ' + why + suffix);
    },

    _isOpen() {
        return Boolean(this._overlay && this._overlay.style.display !== 'none');
    },

    _isDashboardReady() {
        const required = ['search-output', 'team-members', 'verifier-fetcher', 'diff-viewer'];
        return required.every((id) => Boolean(this._tabsById && this._tabsById[id]));
    },

    _resolveActiveTabId(preferred) {
        const preferredId = String(preferred || '').trim();
        if (preferredId && this._tabsById && this._tabsById[preferredId]) {
            return preferredId;
        }
        if (this._tabs && this._tabs.length > 0) {
            const firstId = this._tabs[0].id;
            if (preferredId && preferredId !== firstId) {
                this._logActiveTabFallbackIfNeeded(preferredId, firstId);
            }
            return firstId;
        }
        return preferredId || 'search-output';
    },

    _logActiveTabFallbackIfNeeded(preferred, resolved) {
        if (this._activeTabFallbackLogged) return;
        this._activeTabFallbackLogged = true;
        Logger.warn('dashboard: active tab ' + preferred + ' unavailable — showing ' + resolved);
    },

    _syncIncompleteTabsBanner() {
        if (!this._modal) return;
        const banner = this._modal.querySelector('#wf-dash-incomplete-banner');
        if (!banner) return;
        const show = !this._isDashboardReady();
        banner.style.display = show ? 'block' : 'none';
        if (!show) return;
        const missing = ['search-output', 'team-members', 'verifier-fetcher', 'diff-viewer']
            .filter((id) => !this._tabsById || !this._tabsById[id]);
        banner.textContent = missing.length > 0
            ? 'Some dashboard modules failed to load (' + missing.join(', ') + '). Check the console or refresh the page.'
            : 'Some dashboard modules failed to load. Check the console or refresh the page.';
        Logger.warn('dashboard: incomplete — missing tab(s): ' + (missing.join(', ') || 'unknown'));
    },

    open() {
        const doOpen = () => {
            try {
                try {
                    if (Context.networkObserver && typeof Context.networkObserver.refreshFromPage === 'function') {
                        Context.networkObserver.refreshFromPage(this._pageWindow());
                    }
                } catch (e) {
                    Logger.debug('dashboard: refreshFromPage on open failed', e);
                }
                this._ensureBuilt();
                if (!this._overlay) {
                    throw new Error('dashboard overlay missing after build');
                }
                this._overlay.style.display = 'flex';
                try {
                    if (Context.settingsUi && typeof Context.settingsUi.closeModal === 'function') {
                        Context.settingsUi.closeModal();
                        Logger.log('dashboard: closed settings modal on dashboard open');
                    } else {
                        const doc = this._pageWindow().document;
                        const settingsModal = doc.getElementById('wf-settings-modal');
                        if (settingsModal && typeof settingsModal.close === 'function' && settingsModal.open) {
                            settingsModal.close();
                            Logger.log('dashboard: closed settings modal on dashboard open');
                        }
                    }
                } catch (e) {
                    Logger.debug('dashboard: could not close settings modal', e);
                }
                this._setActiveTab(this._resolveActiveTabId(this._state.activeTab));
                this._syncIncompleteTabsBanner();
                for (const tab of this._tabs) {
                    if (typeof tab.onOpen === 'function') {
                        try {
                            tab.onOpen(this);
                        } catch (e) {
                            Logger.error('dashboard: onOpen failed for tab ' + tab.id, e);
                        }
                    }
                }
                this._scheduleSplitLayoutSync();
                Logger.log('dashboard: opened');
            } catch (e) {
                Logger.error('dashboard: open failed', e);
                throw e;
            }
        };

        const prepOpen = async () => {
            try {
                if (typeof Context.ensureOpsDashboardPluginsLoaded === 'function') {
                    await Context.ensureOpsDashboardPluginsLoaded();
                }
            } catch (e) {
                Logger.warn('dashboard: ensureOpsDashboardPluginsLoaded failed', e);
            }
            try {
                if (Context.opsTab && typeof Context.opsTab.ensureOpsSessionReady === 'function') {
                    await Context.opsTab.ensureOpsSessionReady(this._modal);
                }
            } catch (e) {
                Logger.debug('dashboard: ensureOpsSessionReady failed', e);
            }
            doOpen();
        };
        void prepOpen();
    },

    close() {
        if (!this._overlay) return;
        if (this._modal) {
            if (Context.dashboard && typeof Context.dashboard.captureTabState === 'function') {
                Context.dashboard.captureTabState(this._modal);
            }
            if (Context.opsTab && typeof Context.opsTab.captureTaskLinkState === 'function') {
                Context.opsTab.captureTaskLinkState(this._modal);
            }
        }
        this._overlay.style.display = 'none';
        if (Context.opsTab && typeof Context.opsTab.onModalClosed === 'function') {
            Context.opsTab.onModalClosed();
        }
        Logger.log('dashboard: closed');
    },

    toggle() {
        if (this._isOpen()) this.close();
        else this.open();
    },

    _ensureBuilt() {
        if (this._built && this._overlay && this._overlay.isConnected) return;
        this._build();
    },

    _removeKeydownListener() {
        if (this._onKeydown && this._keydownDoc) {
            this._keydownDoc.removeEventListener('keydown', this._onKeydown, true);
        }
        this._onKeydown = null;
        this._keydownDoc = null;
    },

    // ── DOM construction ──,

    _build() {
        this._removeKeydownListener();
        const doc = this._pageWindow().document;
        let overlay = null;
        try {
            overlay = doc.createElement('div');
            overlay.id = 'wf-dash-overlay';
            overlay.style.cssText = [
                'position: fixed', 'inset: 0', 'z-index: 2147483600',
                'display: none', 'align-items: center', 'justify-content: center',
                'background: rgba(0,0,0,0.5)', 'padding: 12px', 'box-sizing: border-box'
            ].join(';');

            const modal = doc.createElement('div');
            modal.id = 'wf-dash-modal';
            modal.style.cssText = [
                'position: relative', 'display: flex', 'flex-direction: column',
                'width: 100vw', 'height: 100vh', 'max-width: 100vw', 'max-height: 100vh',
                'background: var(--background, #ffffff)', 'color: var(--foreground, #0f172a)',
                'border: 1px solid var(--border, #e2e8f0)', 'border-radius: 12px',
                'box-shadow: 0 20px 60px rgba(0,0,0,0.35)', 'overflow: hidden',
                'font-family: var(--font-sans, ui-sans-serif, system-ui, -apple-system, sans-serif)',
                'font-size: 13px', 'box-sizing: border-box'
            ].join(';');
            modal.innerHTML = this._modalHtml();

            overlay.appendChild(modal);
            doc.body.appendChild(overlay);

            overlay.addEventListener('mousedown', (e) => {
                if (e.target === overlay) this.close();
            });

            this._keydownDoc = doc;
            this._onKeydown = (e) => {
                if (e.key === 'Escape' && this._isOpen()) {
                    e.stopPropagation();
                    this.close();
                }
            };
            doc.addEventListener('keydown', this._onKeydown, true);

            this._overlay = overlay;
            this._modal = modal;
            this._built = true;
            this._splitResizeAttached = false;
            this._resultsWidthResizeAttached = false;
            this._attachListeners();
            this._ensureSpinnerKeyframes();
            this._ensureMsOptionStyles();
            this._ensureHeaderActionStyles();
            this._ensureDashButtonStyles();
            this._ensureUserStoryStyles();
            this._ensureSplitPanelResizeStyles();
            this._attachSplitPanelResize();
            this._attachResultsPanelWidthResize();
            this._applyAllSidePanelWidths();
            this._applyAllResultsPanelMaxWidths();
            this._syncIncompleteTabsBanner();
            this._syncAllMsDropdowns();
            for (const tab of this._tabs) {
                if (typeof tab.onBuilt === 'function') {
                    try {
                        tab.onBuilt(this._modal, this);
                    } catch (e) {
                        Logger.error('dashboard: onBuilt failed for tab ' + tab.id, e);
                    }
                }
            }
            Logger.log('dashboard: popup built');
        } catch (e) {
            Logger.error('dashboard: build failed', e);
            if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            this._overlay = null;
            this._modal = null;
            this._built = false;
            this._splitResizeAttached = false;
            throw e;
        }
    },

    _loadingSpinnerHtml(sizePx) {
        return Context.uiLib && typeof Context.uiLib.spinnerHtml === 'function'
            ? Context.uiLib.spinnerHtml(sizePx)
            : `<span aria-hidden="true" style="display: inline-block; width: ${sizePx || 16}px; height: ${sizePx || 16}px; border: 2px solid color-mix(in srgb, var(--brand, var(--primary, #2563eb)) 22%, transparent); border-top-color: var(--brand, var(--primary, #2563eb)); border-radius: 50%; animation: fleet-ui-spin 0.7s linear infinite; flex-shrink: 0;"></span>`;
    },

    _ensureSpinnerKeyframes() {
        if (Context.uiLib && typeof Context.uiLib.ensureStyles === 'function') {
            Context.uiLib.ensureStyles();
        }
    },

    _dashCloseIconSvg() {
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    },

    _ensureHeaderActionStyles() {
        if (!this._modal || this._modal.querySelector('#wf-dash-header-btn-style')) return;
        const style = this._pageWindow().document.createElement('style');
        style.id = 'wf-dash-header-btn-style';
        style.textContent = [
            '#wf-dash-modal #wf-dash-header-ops {',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  flex-shrink: 0;',
            '  gap: 8px;',
            '}',
            '#wf-dash-modal .wf-dash-header-btn {',
            '  appearance: none !important;',
            '  -webkit-appearance: none !important;',
            '  box-sizing: border-box !important;',
            '  margin: 0 !important;',
            '  height: 32px !important;',
            '  min-height: 32px !important;',
            '  max-height: 32px !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  line-height: 1 !important;',
            '  vertical-align: middle !important;',
            '  flex-shrink: 0;',
            '  border-radius: 6px;',
            '  cursor: pointer;',
            '  border: 1px solid var(--border, #e2e8f0);',
            '  font-family: inherit;',
            '}',
            '#wf-dash-modal #wf-dash-open-settings.wf-dash-header-btn,',
            '#wf-dash-modal #wf-ops-grade-assessments.wf-dash-header-btn {',
            '  padding: 0 12px !important;',
            '  font-size: 11px !important;',
            '  font-weight: 600 !important;',
            '}',
            '#wf-dash-modal #wf-dash-close.wf-dash-header-btn {',
            '  width: 32px !important;',
            '  min-width: 32px !important;',
            '  padding: 0 !important;',
            '  color: var(--muted-foreground, #64748b);',
            '  background: transparent;',
            '}',
            '#wf-dash-modal #wf-dash-close.wf-dash-header-btn svg {',
            '  display: block;',
            '  flex-shrink: 0;',
            '}',
            '#wf-dash-modal a.wf-dash-header-btn {',
            '  text-decoration: none !important;',
            '}'
        ].join('\n');
        this._modal.appendChild(style);
    },

    _ensureMsOptionStyles() {
        if (!this._modal || this._modal.querySelector('#wf-dash-ms-option-style')) return;
        const style = this._pageWindow().document.createElement('style');
        style.id = 'wf-dash-ms-option-style';
        style.textContent = [
            '#wf-dash-modal label[data-wf-dash-ms-option][data-wf-dash-ms-filter-hidden="1"],',
            '#wf-dash-modal tr[data-wf-dash-ms-option][data-wf-dash-ms-filter-hidden="1"] {',
            '  display: none !important;',
            '}',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] {',
            '  border: none;',
            '  border-collapse: collapse;',
            '  width: 100%;',
            '  table-layout: auto;',
            '  font-size: 11px;',
            '  color: var(--foreground, #0f172a);',
            '}',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] col[data-wf-dash-ms-option-col="cb"],',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] col[data-wf-dash-ms-option-col="count"],',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] col[data-wf-dash-ms-option-col="pct"] {',
            '  width: 1%;',
            '}',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] td {',
            '  border: none;',
            '  padding: 4px 6px;',
            '  vertical-align: middle;',
            '}',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] td[data-wf-dash-ms-option-col="cb"],',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] td[data-wf-dash-ms-option-col="count"],',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] td[data-wf-dash-ms-option-col="pct"] {',
            '  width: 1%;',
            '  white-space: nowrap;',
            '}',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] td[data-wf-dash-ms-option-col="cb"] {',
            '  padding-left: 8px;',
            '  padding-right: 2px;',
            '}',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] td[data-wf-dash-ms-option-col="count"],',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] td[data-wf-dash-ms-option-col="pct"] {',
            '  padding-left: 5px;',
            '  padding-right: 5px;',
            '}',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] td[data-wf-dash-ms-option-col="label"] {',
            '  width: auto;',
            '  padding-right: 8px;',
            '}',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] tr[data-wf-dash-ms-option] {',
            '  cursor: pointer;',
            '}',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] [data-wf-dash-ms-option-count-num],',
            '#wf-dash-modal table[data-wf-dash-ms-option-table] [data-wf-dash-ms-option-count-pct] {',
            '  font-size: 10px;',
            '  font-weight: 600;',
            '  font-variant-numeric: tabular-nums;',
            '  color: var(--muted-foreground, #64748b);',
            '  white-space: nowrap;',
            '}',
            '#wf-dash-modal label[data-wf-dash-ms-option] {',
            '  display: grid !important;',
            '  grid-template-columns: auto max-content minmax(0, 1fr);',
            '  column-gap: 8px;',
            '  align-items: start;',
            '  width: 100%;',
            '  box-sizing: border-box;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-option-cb] {',
            '  grid-column: 1;',
            '  display: flex;',
            '  align-items: flex-start;',
            '  padding-top: 1px;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-option-count] {',
            '  grid-column: 2;',
            '  flex-shrink: 0;',
            '  align-self: start;',
            '  display: inline-flex;',
            '  align-items: center;',
            '  justify-content: center;',
            '  width: max-content;',
            '  min-width: calc(3ch + 8px);',
            '  padding: 0 4px;',
            '  font-size: 10px;',
            '  font-weight: 600;',
            '  line-height: 1.35;',
            '  font-variant-numeric: tabular-nums;',
            '  text-align: center;',
            '  border-radius: 999px;',
            '  background: var(--muted, #f1f5f9);',
            '  color: var(--muted-foreground, #64748b);',
            '  box-sizing: border-box;',
            '}',
            '#wf-dash-modal label[data-wf-dash-ms-option] input[type="checkbox"] {',
            '  display: inline-block !important;',
            '  width: auto !important;',
            '  max-width: none !important;',
            '  flex: none !important;',
            '  margin: 0 !important;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-option-text] {',
            '  grid-column: 3;',
            '  min-width: 0;',
            '  overflow-wrap: break-word;',
            '  word-break: normal;',
            '}',
            '#wf-dash-modal label[data-wf-dash-ms-option]:not(:has([data-wf-dash-ms-option-count])) {',
            '  grid-template-columns: auto minmax(0, 1fr);',
            '}',
            '#wf-dash-modal label[data-wf-dash-ms-option]:not(:has([data-wf-dash-ms-option-count])) [data-wf-dash-ms-option-text] {',
            '  grid-column: 2;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-option-name] {',
            '  overflow-wrap: break-word;',
            '  word-break: normal;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-option-email] {',
            '  overflow-wrap: break-word;',
            '  word-break: normal;',
            '  color: var(--muted-foreground, #64748b);',
            '  font-size: 10px;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-sticky] {',
            '  position: sticky;',
            '  top: 0;',
            '  z-index: 2;',
            '  background: var(--card, #ffffff);',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-toolbar] {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 6px;',
            '  padding: 4px 8px;',
            '  border-bottom: 1px solid var(--border, #e2e8f0);',
            '  box-sizing: border-box;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-bulk-toggle] {',
            '  flex-shrink: 0;',
            '  min-width: 2.75rem;',
            '  text-align: center;',
            '  font-size: 10px;',
            '  font-weight: 600;',
            '  padding: 4px 8px;',
            '  border: 1px solid var(--border, #e2e8f0);',
            '  border-radius: 6px;',
            '  background: var(--card, #ffffff);',
            '  cursor: pointer;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-filter-wrap] {',
            '  flex: 1;',
            '  min-width: 0;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-filter-wrap] input {',
            '  width: 100%;',
            '  box-sizing: border-box;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-flyout="1"] {',
            '  position: relative;',
            '  overflow: visible;',
            '  z-index: 1;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-flyout="1"][data-wf-dash-ms-open="1"] {',
            '  z-index: 4;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-flyout="1"] [data-wf-dash-ms-panel] {',
            '  position: fixed;',
            '  width: ' + DASH_MS_FLYOUT_WIDTH + ';',
            '  min-width: 12rem;',
            '  max-width: calc(100vw - 48px);',
            '  z-index: 2147483601;',
            '  border: 1px solid var(--border, #e2e8f0);',
            '  border-radius: 10px;',
            '  background: var(--card, #ffffff);',
            '  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);',
            '  box-sizing: border-box;',
            '  opacity: 0;',
            '  visibility: hidden;',
            '  transform: translateX(-8px) scale(0.98);',
            '  transform-origin: left top;',
            '  transition:',
            '    opacity ' + DASH_MS_FLYOUT_ANIM_MS + 'ms ease,',
            '    transform ' + DASH_MS_FLYOUT_ANIM_MS + 'ms ease,',
            '    visibility 0s linear ' + DASH_MS_FLYOUT_ANIM_MS + 'ms;',
            '  pointer-events: none;',
            '  overflow: hidden;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-flyout="1"] [data-wf-dash-ms-panel][data-wf-dash-ms-flyout-flip="1"] {',
            '  transform: translateX(8px) scale(0.98);',
            '  transform-origin: right top;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-flyout="1"][data-wf-dash-ms-open="1"] [data-wf-dash-ms-panel] {',
            '  opacity: 1;',
            '  visibility: visible;',
            '  transform: translateX(0) scale(1);',
            '  transition:',
            '    opacity ' + DASH_MS_FLYOUT_ANIM_MS + 'ms ease,',
            '    transform ' + DASH_MS_FLYOUT_ANIM_MS + 'ms ease,',
            '    visibility 0s;',
            '  pointer-events: auto;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-flyout="1"][data-wf-dash-ms-open="1"] [data-wf-dash-ms-panel][data-wf-dash-ms-flyout-flip="1"] {',
            '  transform: translateX(0) scale(1);',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-flyout="1"][data-wf-dash-ms-toggled="1"] {',
            '  z-index: 1;',
            '  overflow: hidden;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-flyout="1"][data-wf-dash-ms-toggled="1"] [data-wf-dash-ms-panel] {',
            '  position: static !important;',
            '  width: auto !important;',
            '  min-width: 0 !important;',
            '  max-width: none !important;',
            '  transform: none !important;',
            '  visibility: visible !important;',
            '  box-shadow: none;',
            '  border-radius: 0;',
            '  border: none;',
            '  pointer-events: none;',
            '  opacity: 0;',
            '  max-height: 0;',
            '  overflow: hidden;',
            '  background: transparent;',
            '  transition:',
            '    max-height ' + DASH_MS_FLYOUT_ANIM_MS + 'ms ease,',
            '    opacity ' + DASH_MS_FLYOUT_ANIM_MS + 'ms ease;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-flyout="1"][data-wf-dash-ms-toggled="1"][data-wf-dash-ms-open="1"] [data-wf-dash-ms-panel] {',
            '  max-height: min(480px, 55vh);',
            '  opacity: 1;',
            '  pointer-events: auto;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-flyout="1"][data-wf-dash-ms-toggled="1"][data-wf-dash-ms-open="1"] [data-wf-dash-ms-items] {',
            '  max-height: min(320px, 45vh);',
            '  overflow-y: auto;',
            '  overflow-x: hidden;',
            '  -webkit-overflow-scrolling: touch;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-dual-row][data-wf-dash-ms-filter-hidden="1"] {',
            '  display: none !important;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-dual-header],',
            '#wf-dash-modal [data-wf-dash-ms-dual-row] {',
            '  display: grid !important;',
            '  grid-template-columns: minmax(0, 1fr) 2.5rem 5.5rem;',
            '  column-gap: 8px;',
            '  align-items: center;',
            '  width: 100%;',
            '  box-sizing: border-box;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-dual-header] {',
            '  padding: 4px 8px;',
            '  font-size: 10px;',
            '  font-weight: 600;',
            '  color: var(--muted-foreground, #64748b);',
            '  text-transform: uppercase;',
            '  letter-spacing: 0.04em;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-dual-row] {',
            '  padding: 4px 8px;',
            '  font-size: 11px;',
            '  color: var(--foreground, #0f172a);',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-dual-label] {',
            '  grid-column: 1;',
            '  min-width: 0;',
            '  overflow-wrap: break-word;',
            '  word-break: normal;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-dual-col] {',
            '  display: flex;',
            '  justify-content: center;',
            '  align-items: center;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-dual-col="include"] { grid-column: 2; }',
            '#wf-dash-modal [data-wf-dash-ms-dual-col="exclude"] { grid-column: 3; }',
            '#wf-dash-modal [data-wf-dash-ms-dual-header] [data-wf-dash-ms-dual-col] {',
            '  text-align: center;',
            '  white-space: nowrap;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-dual-row] input[type="checkbox"] {',
            '  display: inline-block !important;',
            '  width: auto !important;',
            '  margin: 0 !important;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap]:not([data-wf-dash-ms-flyout="1"]) [data-wf-dash-ms-panel] {',
            '  overflow: hidden;',
            '  max-height: 0;',
            '  opacity: 0;',
            '  border-top: 1px solid transparent;',
            '  transition:',
            '    max-height ' + DASH_MS_FLYOUT_ANIM_MS + 'ms ease,',
            '    opacity ' + DASH_MS_FLYOUT_ANIM_MS + 'ms ease,',
            '    border-color ' + DASH_MS_FLYOUT_ANIM_MS + 'ms ease;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap]:not([data-wf-dash-ms-flyout="1"])[data-wf-dash-ms-open="1"] [data-wf-dash-ms-panel] {',
            '  max-height: min(480px, 55vh);',
            '  opacity: 1;',
            '  border-top-color: var(--border, #e2e8f0);',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-open="1"]:not([data-wf-dash-ms-flyout="1"]) [data-wf-dash-ms-items] {',
            '  max-height: min(320px, 45vh);',
            '  overflow-y: auto;',
            '  overflow-x: hidden;',
            '  -webkit-overflow-scrolling: touch;',
            '}',
            '#wf-dash-left-panel-search > div [data-wf-dash-ms-wrap][data-wf-dash-ms-open="1"] [data-wf-dash-ms-panel],',
            '#wf-dash-left-panel-search > div [data-wf-dash-ms-wrap][data-wf-dash-ms-open="1"] [data-wf-dash-ms-items],',
            '#wf-ops-team-left-scroll [data-wf-dash-ms-wrap][data-wf-dash-ms-open="1"] [data-wf-dash-ms-panel],',
            '#wf-ops-team-left-scroll [data-wf-dash-ms-wrap][data-wf-dash-ms-open="1"] [data-wf-dash-ms-items] {',
            '  max-height: none;',
            '  overflow-y: visible;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-open="1"]:not([data-wf-dash-ms-flyout="1"]) [data-wf-dash-ms-sticky] {',
            '  box-shadow: 0 1px 0 var(--border, #e2e8f0);',
            '}'
        ].join('\n');
        this._modal.appendChild(style);
    },

    _modalHtml() {
        const ops = Context.opsTab;
        const tabs = this._tabs.length > 0
            ? this._tabs.map((t) => ({ id: t.id, label: t.label || t.id }))
            : [
                { id: 'search-output', label: 'Search Output' },
                { id: 'diff-viewer', label: 'Diff Viewer' },
                { id: 'team-members', label: 'Team Members' },
                { id: 'verifier-fetcher', label: 'Verifier Fetcher' }
            ];
        const tabBtns = tabs.map((t) => `
            <button type="button" class="wf-dash-tab" data-wf-dash-tab="${t.id}" style="
                position: relative; padding: 3px 14px; font-size: 13px; font-weight: 500;
                background: transparent; border: none; border-bottom: 2px solid transparent;
                margin-bottom: -1px; cursor: pointer; color: var(--muted-foreground, #64748b);
            ">${t.label}</button>`).join('');
        const taskLinkBar = ops && typeof ops.renderTaskLinkBar === 'function' ? ops.renderTaskLinkBar() : '';
        const gradeAssessmentsLink = ops && typeof ops.renderGradeAssessmentsHeaderLink === 'function'
            ? ops.renderGradeAssessmentsHeaderLink()
            : '';
        const activeTabId = this._resolveActiveTabId(
            this._state.activeTab || (tabs[0] ? tabs[0].id : 'search-output')
        );
        const panelHtml = tabs.map((t) => {
            const def = this._tabsById[t.id];
            let inner = '';
            if (def && typeof def.panelHtml === 'function') {
                try {
                    inner = def.panelHtml(this);
                } catch (e) {
                    Logger.error('dashboard: panelHtml failed for ' + t.id, e);
                    inner = '<p style="padding: 12px; color: #dc2626;">Tab failed to render.</p>';
                }
            }
            const display = t.id === activeTabId ? 'flex' : 'none';
            return `<div data-wf-dash-panel="${t.id}" style="flex: 1; min-height: 0; display: ${display}; flex-direction: column; overflow: hidden;">${inner}</div>`;
        }).join('');

        return `
            <div style="display: flex; align-items: center; width: 100%; box-sizing: border-box; padding: 3px 18px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;">
                <div id="wf-dash-header-tabs" style="display: flex; align-items: center; gap: 0; flex-shrink: 0; min-width: 0;">
                    <div style="font-size: 15px; font-weight: 600; color: var(--foreground, #0f172a); margin-right: 12px; flex-shrink: 0;">Dashboard</div>
                    <nav style="display: flex; gap: 0; min-width: 0; overflow: hidden;" aria-label="Dashboard sections">
                        ${tabBtns}
                    </nav>
                </div>
                <div id="wf-dash-header-task-link" style="flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; padding: 0 12px; box-sizing: border-box; overflow: hidden;">
                    <div style="display: flex; justify-content: center; align-items: center; width: 100%; min-width: 0;">${taskLinkBar}</div>
                </div>
                <div id="wf-dash-header-ops" style="flex-shrink: 0; margin-left: auto;">
                    ${gradeAssessmentsLink}
                    <button type="button" id="wf-dash-open-settings" class="wf-dash-header-btn wf-dash-btn wf-dash-btn--basic wf-dash-btn--nav">Open Settings</button>
                    <button type="button" id="wf-dash-close" class="wf-dash-header-btn" aria-label="Close dashboard" title="Close">${this._dashCloseIconSvg()}</button>
                </div>
            </div>
            <div id="wf-dash-body" style="flex: 1; min-height: 0; overflow: hidden; padding: 16px 18px; display: flex; flex-direction: column;">
                <div id="wf-dash-incomplete-banner" style="display: none; margin-bottom: 12px; padding: 10px 12px; font-size: 12px; color: #92400e; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; flex-shrink: 0;"></div>
                ${panelHtml}
            </div>
        `;
    },

    _panelBoxStyle() {
        return 'border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--card, #ffffff);';
    },

    _taskCardBoxStyle() {
        return 'border: ' + DASH_CARD_BORDER + '; border-radius: 10px; background: ' + DASH_TASK_CARD_BG + ';';
    },

    _labelStyle() {
        return 'font-size: 11px; font-weight: 500; color: var(--muted-foreground, #64748b); letter-spacing: -0.01em;';
    },

    _hintStyle() {
        return 'font-size: 11px; font-weight: 400; color: var(--muted-foreground, #64748b); letter-spacing: -0.01em;';
    },

    _inputStyle() {
        return 'width: 100%; padding: 7px 10px; font-size: 12px; border: 1px solid var(--input, #cbd5e1); border-radius: 6px; background: var(--background, #fff); color: var(--foreground, #0f172a); box-sizing: border-box;';
    },

    _inputClearBtnStyle() {
        return 'flex-shrink: 0; width: 32px; height: 32px; padding: 0; font-size: 17px; line-height: 1; font-weight: 600; border-radius: 6px; cursor: pointer; border: 1px solid var(--border, #e2e8f0); background: var(--background, #fff); color: var(--muted-foreground, #64748b);';
    },

    _msHintParagraphStyle() {
        return 'padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);';
    },

    _msHintHtml(text) {
        return `<p style="${this._msHintParagraphStyle()}">${dashEscHtml(text)}</p>`;
    },

    _msOptionTextHtml(displayName, email, label, dimStyle) {
        if (email) {
            return `<span data-wf-dash-ms-option-text="1" style="${dimStyle}">
                    <div data-wf-dash-ms-option-name="1">${dashEscHtml(displayName)}</div>
                    <div data-wf-dash-ms-option-email="1">${dashEscHtml(email)}</div>
                </span>`;
        }
        return `<span data-wf-dash-ms-option-text="1" style="${dimStyle}">${dashEscHtml(label)}</span>`;
    },

    _pagerChevronSvg(dir) {
        const path = dir === 'prev' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6';
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
    },

    _paginationMeta(total, pageSize, pageHolder) {
        const count = Number(total) || 0;
        const size = pageSize === Infinity || pageSize === 'all' ? Infinity : Number(pageSize);
        const effectiveSize = Number.isFinite(size) && size > 0 ? size : Infinity;
        if (count === 0 || effectiveSize === Infinity) {
            if (pageHolder) pageHolder.page = 0;
            return { total: count, totalPages: 1, page: 0, canPrev: false, canNext: false, showNav: false, pageSize: effectiveSize };
        }
        const totalPages = Math.max(1, Math.ceil(count / effectiveSize));
        let page = pageHolder && Number.isFinite(pageHolder.page) ? pageHolder.page : 0;
        if (page >= totalPages) page = totalPages - 1;
        if (page < 0) page = 0;
        if (pageHolder) pageHolder.page = page;
        return {
            total: count,
            totalPages,
            page,
            canPrev: page > 0,
            canNext: page < totalPages - 1,
            showNav: totalPages > 1,
            pageSize: effectiveSize
        };
    },

    _rangeLabel(meta, options) {
        const opts = options || {};
        const total = meta ? meta.total : 0;
        const singular = opts.singular || 'result';
        const plural = opts.plural || (singular + 's');
        const suffix = total === 1 ? singular : plural;
        if (total === 0) return '0 ' + plural;
        if (!meta || !meta.showNav) {
            return '1–' + total + ' of ' + total + ' ' + suffix;
        }
        const size = meta.pageSize;
        const start = meta.page * size + 1;
        const end = Math.min((meta.page + 1) * size, total);
        return start + '–' + end + ' of ' + total + ' ' + suffix;
    },

    _syncPagerNavUi(opts) {
        const options = opts || {};
        const show = Boolean(options.show);
        if (options.rowEl) options.rowEl.style.display = show ? (options.rowDisplay || 'flex') : 'none';
        if (options.pagerEl) options.pagerEl.style.display = show ? (options.pagerDisplay || 'inline-flex') : 'none';
        if (options.rangeEl) options.rangeEl.textContent = show && options.rangeLabel ? options.rangeLabel : '';
        if (options.prevBtn) options.prevBtn.disabled = !show || !options.meta || !options.meta.canPrev;
        if (options.nextBtn) options.nextBtn.disabled = !show || !options.meta || !options.meta.canNext;
    },

    _numericFilterOptionsHtml(items, selectedId) {
        const list = Array.isArray(items) ? items : [];
        const sel = selectedId != null ? String(selectedId) : '';
        return list.map((item) => {
            const id = String(item.id != null ? item.id : '');
            const label = String(item.label != null ? item.label : id);
            const selected = id === sel ? ' selected' : '';
            return '<option value="' + dashEscHtml(id) + '"' + selected + '>' + dashEscHtml(label) + '</option>';
        }).join('');
    },

    _numericComparatorOptionsHtml(fieldType, selectedId) {
        const lib = dashLib();
        const list = fieldType === 'date'
            ? (lib && lib.DATE_COMPARATORS) || []
            : (lib && lib.NUMERIC_COMPARATORS) || [];
        const sel = selectedId || (list[0] ? list[0].id : 'gte');
        return list.map((c) => {
            const selected = c.id === sel ? ' selected' : '';
            return '<option value="' + dashEscHtml(c.id) + '"' + selected + '>' + dashEscHtml(c.label) + '</option>';
        }).join('');
    },

    _numericFilterRowHtml(opts) {
        const options = opts || {};
        const rowAttr = options.rowAttr || 'data-wf-dash-manual-row';
        const fieldAttr = options.fieldAttr || 'data-wf-dash-manual-field';
        const comparatorAttr = options.comparatorAttr || 'data-wf-dash-manual-comparator';
        const valueAttr = options.valueAttr || 'data-wf-dash-manual-value';
        const removeAttr = options.removeAttr || 'data-wf-dash-manual-remove';
        const fields = options.fields || [];
        const field = options.field || (fields[0] ? fields[0].id : '');
        const fieldMeta = fields.find((f) => f.id === field) || fields[0] || { id: field, type: 'number' };
        const isDate = fieldMeta.type === 'date';
        const comparator = options.comparator || 'gte';
        const value = options.value != null ? String(options.value) : '';
        const selectStyle = options.selectStyle || '';
        const inputStyle = options.inputStyle || '';
        const removeBtnStyle = options.removeBtnStyle || '';
        const compWidth = isDate ? '96px' : '52px';
        const valueWidth = isDate ? '118px' : '72px';
        const inputType = isDate ? 'date' : 'number';
        return '<div ' + rowAttr + '="1" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">'
            + '<select ' + fieldAttr + '="1" style="' + selectStyle + ' flex: 1; min-width: 120px;">'
            + this._numericFilterOptionsHtml(fields, field)
            + '</select>'
            + '<select ' + comparatorAttr + '="1" style="' + selectStyle + ' width: ' + compWidth + '; flex-shrink: 0;">'
            + this._numericComparatorOptionsHtml(isDate ? 'date' : 'number', comparator)
            + '</select>'
            + '<input type="' + inputType + '" ' + valueAttr + '="1" placeholder="Value" step="any" value="'
            + dashEscHtml(value) + '" style="' + inputStyle + ' width: ' + valueWidth + '; flex-shrink: 0;">'
            + '<button type="button" ' + removeAttr + '="1" title="Remove filter" style="' + removeBtnStyle
            + ' flex-shrink: 0; padding: 4px 8px; font-size: 14px; line-height: 1; color: var(--muted-foreground, #64748b); background: transparent; border: 1px solid var(--border, #e2e8f0); border-radius: 4px; cursor: pointer;">×</button>'
            + '</div>';
    },

    _dashBtnClass(variant, size) {
        if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
            return Context.uiLib.btnClass(variant, size);
        }
        return 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size;
    },

    _ensureDashButtonStyles() {
        if (!this._modal) return;
        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles('#wf-dash-modal', this._modal);
        }
    },

    _sidePanelWidthStorageKey(scopeKey) {
        return scopeKey === 'diff-viewer' ? DASH_DIFF_VIEWER_SIDE_PANEL_WIDTH_KEY : DASH_SIDE_PANEL_WIDTH_STORAGE_KEY;
    },

    _defaultSidePanelWidthForScope(scopeKey) {
        if (scopeKey === 'diff-viewer') {
            const viewportW = this._pageWindow().innerWidth || 1200;
            const basis = this._modal ? this._modal.getBoundingClientRect().width : viewportW;
            const target = Math.round(basis * DASH_DIFF_VIEWER_SIDE_PANEL_DEFAULT_RATIO);
            return Math.max(DASH_SIDE_PANEL_MIN_WIDTH, target);
        }
        return DASH_SIDE_PANEL_MIN_WIDTH;
    },

    _readSidePanelWidthPref(scopeKey) {
        const scope = scopeKey || 'dashboard';
        try {
            const raw = Storage.getData(this._sidePanelWidthStorageKey(scope), null);
            const n = parseInt(raw, 10);
            if (Number.isFinite(n) && n >= DASH_SIDE_PANEL_MIN_WIDTH) return n;
        } catch (_e) { /* fall through */ }
        return this._defaultSidePanelWidthForScope(scope);
    },

    _writeSidePanelWidthPref(widthPx, scopeKey) {
        const scope = scopeKey || 'dashboard';
        try {
            const clamped = Math.max(DASH_SIDE_PANEL_MIN_WIDTH, Math.round(widthPx));
            Storage.setData(this._sidePanelWidthStorageKey(scope), String(clamped));
        } catch (e) {
            Logger.warn('dashboard: failed to write side panel width pref (' + scope + ')', e);
        }
    },

    _parseResultsPanelMaxWidthPref(raw) {
        if (raw == null || raw === '') return null;
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n >= DASH_SIDE_PANEL_MIN_RESULTS_WIDTH) return n;
        return null;
    },

    _readResultsPanelMaxWidthPref() {
        try {
            const parsed = this._parseResultsPanelMaxWidthPref(
                Storage.getData(DASH_RESULTS_PANEL_MAX_WIDTH_STORAGE_KEY, null)
            );
            if (parsed != null) return parsed;
        } catch (_e) { /* fall through */ }
        return null;
    },

    _writeResultsPanelMaxWidthPref(widthPx) {
        try {
            if (widthPx == null) {
                Storage.deleteData(DASH_RESULTS_PANEL_MAX_WIDTH_STORAGE_KEY);
                Storage.deleteData('fleet-ux:dashboard-results-panel-max-width-stats-hidden');
                return;
            }
            const clamped = Math.max(DASH_SIDE_PANEL_MIN_RESULTS_WIDTH, Math.round(widthPx));
            Storage.setData(DASH_RESULTS_PANEL_MAX_WIDTH_STORAGE_KEY, String(clamped));
        } catch (e) {
            Logger.warn('dashboard: failed to write results panel max width pref', e);
        }
    },

    _readStatsPanelHiddenPref() {
        try {
            const raw = Storage.getData(DASH_STATS_PANEL_HIDDEN_STORAGE_KEY, null);
            return raw === 'true';
        } catch (_e) { /* fall through */ }
        return false;
    },

    _writeStatsPanelHiddenPref(hidden) {
        try {
            Storage.setData(DASH_STATS_PANEL_HIDDEN_STORAGE_KEY, hidden ? 'true' : 'false');
        } catch (e) {
            Logger.warn('dashboard: failed to write stats panel hidden pref', e);
        }
    },

    _readResultsPanelHiddenPref() {
        try {
            const raw = Storage.getData(DASH_RESULTS_PANEL_HIDDEN_STORAGE_KEY, null);
            return raw === 'true';
        } catch (_e) { /* fall through */ }
        return false;
    },

    _writeResultsPanelHiddenPref(hidden) {
        try {
            Storage.setData(DASH_RESULTS_PANEL_HIDDEN_STORAGE_KEY, hidden ? 'true' : 'false');
        } catch (e) {
            Logger.warn('dashboard: failed to write results panel hidden pref', e);
        }
    },

    _readStatsPanelWidthPref() {
        try {
            const raw = Storage.getData(DASH_STATS_PANEL_WIDTH_STORAGE_KEY, null);
            const n = parseInt(raw, 10);
            if (Number.isFinite(n) && n >= DASH_STATS_PANEL_MIN_WIDTH) return n;
        } catch (_e) { /* fall through */ }
        return DASH_STATS_PANEL_DEFAULT_WIDTH;
    },

    _writeStatsPanelWidthPref(widthPx) {
        try {
            const clamped = Math.max(DASH_STATS_PANEL_MIN_WIDTH, Math.round(widthPx));
            Storage.setData(DASH_STATS_PANEL_WIDTH_STORAGE_KEY, String(clamped));
        } catch (e) {
            Logger.warn('dashboard: failed to write stats panel width pref', e);
        }
    },

    _splitPanelHandleStyle() {
        return 'flex-shrink: 0; width: 10px; margin: 0 4px; align-self: stretch; cursor: col-resize;'
            + ' border-radius: 4px; background: transparent; touch-action: none; box-sizing: border-box;'
            + ' display: flex; align-items: center; justify-content: center;';
    },

    _splitPanelHandleGripHtml() {
        return '<span class="wf-dash-split-grip" aria-hidden="true">'
            + '<span class="wf-dash-split-grip-dot"></span>'
            + '<span class="wf-dash-split-grip-dot"></span>'
            + '<span class="wf-dash-split-grip-dot"></span>'
            + '</span>';
    },

    _splitPanelHandleHtml() {
        return '<div data-wf-dash-split-handle role="separator" aria-orientation="vertical"'
            + ' aria-label="Resize side panel" tabindex="0" title="Drag to resize side panel"'
            + ' style="' + this._splitPanelHandleStyle() + '">' + this._splitPanelHandleGripHtml() + '</div>';
    },

    _resultsPanelWidthHandleHtml() {
        return '<div data-wf-dash-results-width-handle role="separator" aria-orientation="vertical"'
            + ' aria-label="Resize results panel max width" tabindex="0" title="Drag to set results panel max width"'
            + ' style="' + this._splitPanelHandleStyle() + '">' + this._splitPanelHandleGripHtml() + '</div>';
    },

    _resultsCollapseSliverHtml() {
        return '<div data-wf-dash-results-collapse-sliver aria-hidden="true"></div>';
    },

    _splitPanelAsideStyle(widthPx) {
        const w = Math.max(DASH_SIDE_PANEL_MIN_WIDTH, Math.round(widthPx || DASH_SIDE_PANEL_MIN_WIDTH));
        return 'width: ' + w + 'px; min-width: ' + DASH_SIDE_PANEL_MIN_WIDTH + 'px; flex-shrink: 0;'
            + ' display: flex; flex-direction: column; min-height: 0; overflow: hidden; box-sizing: border-box;';
    },

    _splitPanelStatsColumnStyle(widthPx) {
        const w = Math.max(DASH_STATS_PANEL_MIN_WIDTH, Math.round(widthPx || DASH_STATS_PANEL_DEFAULT_WIDTH));
        return 'width: ' + w + 'px; min-width: ' + DASH_STATS_PANEL_MIN_WIDTH + 'px; flex-shrink: 0;'
            + ' display: flex; flex-direction: column; min-height: 0; overflow: hidden; box-sizing: border-box;';
    },

    _splitPanelRightHtml(rightHtml, scopeKey, statsHtml) {
        if (scopeKey !== 'dashboard') {
            return '<div data-wf-dash-split-right style="flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden;">'
                + rightHtml + '</div>';
        }
        const statsWidth = this._readStatsPanelWidthPref();
        const statsBlock = statsHtml
            ? ('<aside data-wf-dash-stats-column style="' + this._splitPanelStatsColumnStyle(statsWidth) + '">' + statsHtml + '</aside>')
            : '';
        return '<div data-wf-dash-split-right style="flex: 1; min-width: 0; display: flex; flex-direction: row; overflow: hidden;">'
            + '<div data-wf-dash-results-column style="flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden;">'
            + rightHtml + '</div>'
            + this._resultsPanelWidthHandleHtml()
            + statsBlock
            + '</div>';
    },

    _splitPanelSectionHtml(leftHtml, rightHtml, scopeKey, statsHtml) {
        const scope = scopeKey || 'dashboard';
        const width = this._readSidePanelWidthPref(scope);
        const resultsSliver = scope === 'dashboard' ? this._resultsCollapseSliverHtml() : '';
        return '<section data-wf-dash-split-root data-wf-dash-split-scope="' + dashEscHtml(scope) + '" style="display: flex; flex: 1; min-height: 0; overflow: hidden; width: 100%;">'
            + '<aside data-wf-dash-split-left style="' + this._splitPanelAsideStyle(width) + '">' + leftHtml + '</aside>'
            + this._splitPanelHandleHtml()
            + resultsSliver
            + this._splitPanelRightHtml(rightHtml, scope, statsHtml)
            + '</section>';
    },

    splitPanelSectionHtml(leftHtml, rightHtml, scopeKey, statsHtml) {
        return this._splitPanelSectionHtml(leftHtml, rightHtml, scopeKey, statsHtml);
    },

    _splitPanelHandleReserve(scopeKey) {
        return scopeKey === 'dashboard' ? 32 : 16;
    },

    _splitRootMetrics(root) {
        const rootW = root ? root.getBoundingClientRect().width : 0;
        const fallbackW = this._modal ? this._modal.getBoundingClientRect().width : 960;
        const basis = rootW > 0 ? rootW : fallbackW;
        const left = root ? root.querySelector('[data-wf-dash-split-left]') : null;
        const leftW = left ? left.getBoundingClientRect().width : DASH_SIDE_PANEL_MIN_WIDTH;
        const scope = root ? (root.getAttribute('data-wf-dash-split-scope') || 'dashboard') : 'dashboard';
        const handleReserve = this._splitPanelHandleReserve(scope);
        const statsW = this._statsColumnEffectiveWidth(root);
        const resultsSliverW = this._resultsSliverEffectiveWidth(root);
        return { basis, scope, handleReserve, leftW, statsW, resultsSliverW };
    },

    _resultsSliverEffectiveWidth(root) {
        if (!root) return 0;
        const scope = root.getAttribute('data-wf-dash-split-scope') || 'dashboard';
        if (scope !== 'dashboard') return 0;
        if (this._readResultsPanelHiddenPref()) return DASH_STATS_PANEL_COLLAPSED_WIDTH;
        return 0;
    },

    _statsColumnEffectiveWidth(root) {
        if (!root) return 0;
        const scope = root.getAttribute('data-wf-dash-split-scope') || 'dashboard';
        if (scope !== 'dashboard') return 0;
        const statsCol = root.querySelector('[data-wf-dash-stats-column]');
        if (!statsCol) return 0;
        if (this._readStatsPanelHiddenPref()) return DASH_STATS_PANEL_COLLAPSED_WIDTH;
        return DASH_STATS_PANEL_MIN_WIDTH;
    },

    _scheduleSplitLayoutSync() {
        requestAnimationFrame(() => {
            this._applyAllSidePanelWidths();
            this._applyAllResultsPanelLayouts();
            this._applyAllStatsPanelLayouts();
            this._applyAllResultsPanelMaxWidths();
        });
    },

    _beginColResizeDrag(e, handlers) {
        e.preventDefault();
        const doc = this._pageWindow().document;
        const onMove = (ev) => handlers.onMove(ev);
        const onUp = () => {
            doc.removeEventListener('mousemove', onMove);
            doc.removeEventListener('mouseup', onUp);
            doc.body.style.cursor = '';
            doc.body.style.userSelect = '';
            handlers.onUp();
        };
        doc.body.style.cursor = 'col-resize';
        doc.body.style.userSelect = 'none';
        doc.addEventListener('mousemove', onMove);
        doc.addEventListener('mouseup', onUp);
    },

    _availableResultsPanelWidth(root) {
        const { basis, handleReserve, leftW, statsW, resultsSliverW } = this._splitRootMetrics(root);
        return Math.max(
            DASH_SIDE_PANEL_MIN_RESULTS_WIDTH,
            Math.round(basis - leftW - handleReserve - statsW - resultsSliverW)
        );
    },

    _clampResultsPanelMaxWidth(root, widthPx) {
        const available = this._availableResultsPanelWidth(root);
        return Math.round(Math.max(DASH_SIDE_PANEL_MIN_RESULTS_WIDTH, Math.min(available, widthPx)));
    },

    _clampResultsPanelWidthForDrag(root, widthPx, splitRight, statsHidden) {
        if (!splitRight) {
            return Math.round(Math.max(DASH_SIDE_PANEL_MIN_RESULTS_WIDTH, widthPx));
        }
        const splitRightW = splitRight.getBoundingClientRect().width;
        const statsReserve = statsHidden ? DASH_STATS_PANEL_COLLAPSED_WIDTH : DASH_STATS_PANEL_MIN_WIDTH;
        const maxResults = Math.max(
            DASH_SIDE_PANEL_MIN_RESULTS_WIDTH,
            splitRightW - DASH_RESULTS_STATS_HANDLE_WIDTH - statsReserve
        );
        return Math.round(Math.max(DASH_SIDE_PANEL_MIN_RESULTS_WIDTH, Math.min(maxResults, widthPx)));
    },

    _maxResultsPanelWidthForDrag(splitRight, statsHidden) {
        if (!splitRight) return DASH_SIDE_PANEL_MIN_RESULTS_WIDTH;
        const splitRightW = splitRight.getBoundingClientRect().width;
        const statsReserve = statsHidden ? DASH_STATS_PANEL_COLLAPSED_WIDTH : DASH_STATS_PANEL_MIN_WIDTH;
        return Math.max(
            DASH_SIDE_PANEL_MIN_RESULTS_WIDTH,
            Math.round(splitRightW - DASH_RESULTS_STATS_HANDLE_WIDTH - statsReserve)
        );
    },

    _clampSidePanelWidth(root, widthPx) {
        const { basis, handleReserve, statsW, resultsSliverW } = this._splitRootMetrics(root);
        const viewportW = this._pageWindow().innerWidth || basis;
        const viewportCap = Math.floor(viewportW * DASH_SIDE_PANEL_MAX_VIEWPORT_RATIO);
        const max = Math.max(
            DASH_SIDE_PANEL_MIN_WIDTH,
            Math.min(
                basis - DASH_SIDE_PANEL_MIN_RESULTS_WIDTH - handleReserve - statsW - resultsSliverW,
                viewportCap
            )
        );
        return Math.round(Math.max(DASH_SIDE_PANEL_MIN_WIDTH, Math.min(max, widthPx)));
    },

    _applySidePanelWidth(root, widthPx) {
        if (!root) return;
        const left = root.querySelector('[data-wf-dash-split-left]');
        if (!left) return;
        const clamped = this._clampSidePanelWidth(root, widthPx);
        left.style.width = clamped + 'px';
        left.style.minWidth = DASH_SIDE_PANEL_MIN_WIDTH + 'px';
        left.style.maxWidth = clamped + 'px';
    },

    _applyAllSidePanelWidths() {
        if (!this._modal) return;
        this._modal.querySelectorAll('[data-wf-dash-split-root]').forEach((root) => {
            const scope = root.getAttribute('data-wf-dash-split-scope') || 'dashboard';
            const pref = this._readSidePanelWidthPref(scope);
            this._applySidePanelWidth(root, pref);
        });
    },

    _clampSharedResultsPanelPrefToState(widthPx, splitRight, statsHidden) {
        if (widthPx == null) return null;
        const maxResults = this._maxResultsPanelWidthForDrag(splitRight, statsHidden);
        return Math.round(Math.max(DASH_SIDE_PANEL_MIN_RESULTS_WIDTH, Math.min(maxResults, widthPx)));
    },

    _applyResultsPanelMaxWidth(root, statsHiddenOverride) {
        if (!root) return;
        const scope = root.getAttribute('data-wf-dash-split-scope') || 'dashboard';
        if (scope !== 'dashboard') return;
        if (this._readResultsPanelHiddenPref()) return;
        const col = root.querySelector('[data-wf-dash-results-column]');
        if (!col) return;
        const statsHidden = statsHiddenOverride != null
            ? statsHiddenOverride
            : this._readStatsPanelHiddenPref();
        const splitRight = root.querySelector('[data-wf-dash-split-right]');
        const maxResults = this._maxResultsPanelWidthForDrag(splitRight, statsHidden);
        const pref = this._readResultsPanelMaxWidthPref();
        if (!pref) {
            if (!statsHidden && splitRight) {
                const maxOpen = this._maxResultsPanelWidthForDrag(splitRight, false);
                const currentW = col.getBoundingClientRect().width;
                if (currentW > maxOpen + DASH_RESULTS_PANEL_FULL_WIDTH_TOLERANCE_PX) {
                    col.style.flex = '0 0 auto';
                    col.style.minWidth = DASH_SIDE_PANEL_MIN_RESULTS_WIDTH + 'px';
                    col.style.width = maxOpen + 'px';
                    col.style.maxWidth = maxOpen + 'px';
                    return;
                }
            }
            col.style.flex = '1';
            col.style.minWidth = '0';
            col.style.width = '';
            col.style.maxWidth = '';
            return;
        }
        const clamped = this._clampSharedResultsPanelPrefToState(pref, splitRight, statsHidden);
        col.style.flex = '0 0 auto';
        col.style.minWidth = DASH_SIDE_PANEL_MIN_RESULTS_WIDTH + 'px';
        col.style.width = clamped + 'px';
        col.style.maxWidth = clamped + 'px';
    },

    _applyAllResultsPanelMaxWidths() {
        if (!this._modal) return;
        this._modal.querySelectorAll('[data-wf-dash-split-root][data-wf-dash-split-scope="dashboard"]').forEach((root) => {
            this._applyResultsPanelMaxWidth(root);
        });
    },

    _applyStatsPanelWidth(root) {
        if (!root) return;
        const scope = root.getAttribute('data-wf-dash-split-scope') || 'dashboard';
        if (scope !== 'dashboard') return;
        const statsCol = root.querySelector('[data-wf-dash-stats-column]');
        if (!statsCol) return;
        const hidden = this._readStatsPanelHiddenPref();
        if (hidden) {
            statsCol.style.width = DASH_STATS_PANEL_COLLAPSED_WIDTH + 'px';
            statsCol.style.minWidth = DASH_STATS_PANEL_COLLAPSED_WIDTH + 'px';
            statsCol.style.maxWidth = DASH_STATS_PANEL_COLLAPSED_WIDTH + 'px';
            statsCol.style.flex = '0 0 auto';
            return;
        }
        statsCol.style.flex = '1 1 0';
        statsCol.style.minWidth = DASH_STATS_PANEL_MIN_WIDTH + 'px';
        statsCol.style.width = '';
        statsCol.style.maxWidth = '';
    },

    _applyStatsPanelLayout(root) {
        if (!root) return;
        const scope = root.getAttribute('data-wf-dash-split-scope') || 'dashboard';
        if (scope !== 'dashboard') return;
        const statsCol = root.querySelector('[data-wf-dash-stats-column]');
        const splitRight = root.querySelector('[data-wf-dash-split-right]');
        if (!statsCol) return;
        const wasHidden = statsCol.getAttribute('data-wf-dash-stats-collapsed') === 'true';
        const hidden = this._readStatsPanelHiddenPref();
        const collapsedVal = hidden ? 'true' : 'false';
        statsCol.setAttribute('data-wf-dash-stats-collapsed', collapsedVal);
        if (splitRight) splitRight.setAttribute('data-wf-dash-stats-collapsed', collapsedVal);
        this._applyResultsPanelMaxWidth(root, hidden);
        this._applyStatsPanelWidth(root);
        if (typeof this._syncStatsPanelCollapseUi === 'function') {
            this._syncStatsPanelCollapseUi();
        }
        if (wasHidden && !hidden) {
            requestAnimationFrame(() => {
                this._applyResultsPanelMaxWidth(root, false);
                this._applyStatsPanelWidth(root);
            });
        }
    },

    _applyAllStatsPanelLayouts() {
        if (!this._modal) return;
        this._modal.querySelectorAll('[data-wf-dash-split-root][data-wf-dash-split-scope="dashboard"]').forEach((root) => {
            this._applyStatsPanelLayout(root);
        });
    },

    _applyResultsPanelLayout(root) {
        if (!root) return;
        const scope = root.getAttribute('data-wf-dash-split-scope') || 'dashboard';
        if (scope !== 'dashboard') return;
        const splitRight = root.querySelector('[data-wf-dash-split-right]');
        const sliver = root.querySelector('[data-wf-dash-results-collapse-sliver]');
        const wasHidden = root.getAttribute('data-wf-dash-results-collapsed') === 'true';
        const hidden = this._readResultsPanelHiddenPref();
        const collapsedVal = hidden ? 'true' : 'false';
        root.setAttribute('data-wf-dash-results-collapsed', collapsedVal);
        if (splitRight) splitRight.setAttribute('data-wf-dash-results-collapsed', collapsedVal);
        if (sliver) sliver.setAttribute('aria-hidden', hidden ? 'false' : 'true');
        this._applyStatsPanelWidth(root);
        if (!hidden) {
            this._applyResultsPanelMaxWidth(root);
        }
        if (typeof this._syncResultsPanelCollapseUi === 'function') {
            this._syncResultsPanelCollapseUi();
        }
        if (wasHidden && !hidden) {
            requestAnimationFrame(() => {
                this._applyResultsPanelMaxWidth(root);
                this._applyStatsPanelWidth(root);
            });
        }
    },

    _applyAllResultsPanelLayouts() {
        if (!this._modal) return;
        this._modal.querySelectorAll('[data-wf-dash-split-root][data-wf-dash-split-scope="dashboard"]').forEach((root) => {
            this._applyResultsPanelLayout(root);
        });
    },

    _ensureUserStoryStyles() {
        if (!this._modal) return;
        let style = this._modal.querySelector('#wf-dash-user-story-style');
        if (!style) {
            style = this._pageWindow().document.createElement('style');
            style.id = 'wf-dash-user-story-style';
            this._modal.appendChild(style);
        }
        style.textContent = [
            '#wf-dash-modal .wf-dash-user-story-block {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 14px;',
            '  margin-top: 8px;',
            '}',
            '#wf-dash-modal .wf-dash-user-story-field-header {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 6px;',
            '  margin-bottom: 4px;',
            '}',
            '#wf-dash-modal .wf-dash-user-story-field-body {',
            '  margin: 0;',
            '  padding: 6px 0 2px 12px;',
            '  border-left: 3px solid var(--border, #e2e8f0);',
            '  white-space: pre-wrap;',
            '  word-break: break-word;',
            '  line-height: 1.5;',
            '  font-size: 12px;',
            '  font-family: inherit;',
            '  color: var(--muted-foreground, #64748b);',
            '}',
            '#wf-dash-modal .wf-dash-user-story-empty {',
            '  margin: 0;',
            '  line-height: 1.45;',
            '  font-size: 12px;',
            '  font-family: inherit;',
            '  color: var(--muted-foreground, #64748b);',
            '}',
            '#wf-dash-modal [data-wf-dash-supplemental-controls] {',
            '  display: flex;',
            '  flex-wrap: wrap;',
            '  align-items: center;',
            '  gap: 8px;',
            '  width: 100%;',
            '}',
            '#wf-dash-modal [data-wf-dash-supplemental-controls-btns] {',
            '  display: flex;',
            '  flex-wrap: wrap;',
            '  align-items: center;',
            '  gap: 8px;',
            '  min-width: 0;',
            '}',
            '#wf-dash-modal [data-wf-dash-supplemental-action-msg] {',
            '  margin: 0 0 0 auto;',
            '  max-width: min(100%, 28rem);',
            '  text-align: right;',
            '  line-height: 1.45;',
            '  font-size: 12px;',
            '  font-family: inherit;',
            '  color: var(--muted-foreground, #64748b);',
            '}',
            '#wf-dash-modal [data-wf-dash-supplemental-action-msg][data-tone="error"] {',
            '  color: #b91c1c;',
            '}',
            '#wf-dash-modal .wf-dash-session-qa-block {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0;',
            '  margin-top: 8px;',
            '}',
            '#wf-dash-modal .wf-dash-verifier-output-block {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0;',
            '  margin-top: 8px;',
            '}',
            '#wf-dash-modal [data-wf-dash-user-story-panel],',
            '#wf-dash-modal [data-wf-dash-verifier-output-panel],',
            '#wf-dash-modal [data-wf-dash-session-qa-panel] {',
            '  display: grid;',
            '  grid-template-rows: 0fr;',
            '  transition: grid-template-rows 160ms ease-out;',
            '}',
            '#wf-dash-modal [data-wf-dash-user-story-panel][data-open="1"],',
            '#wf-dash-modal [data-wf-dash-verifier-output-panel][data-open="1"],',
            '#wf-dash-modal [data-wf-dash-session-qa-panel][data-open="1"] {',
            '  grid-template-rows: 1fr;',
            '}',
            '#wf-dash-modal [data-wf-dash-user-story-panel][data-open="0"],',
            '#wf-dash-modal [data-wf-dash-verifier-output-panel][data-open="0"],',
            '#wf-dash-modal [data-wf-dash-session-qa-panel][data-open="0"] {',
            '  grid-template-rows: 0fr;',
            '  max-height: 0;',
            '  overflow: hidden;',
            '}',
            '#wf-dash-modal [data-wf-dash-user-story-panel] > [data-wf-dash-user-story-inner],',
            '#wf-dash-modal [data-wf-dash-verifier-output-panel] > [data-wf-dash-verifier-output-inner],',
            '#wf-dash-modal [data-wf-dash-session-qa-panel] > [data-wf-dash-session-qa-inner] {',
            '  overflow: hidden;',
            '  min-height: 0;',
            '}',
            '#wf-dash-modal [data-wf-dash-user-story-inner],',
            '#wf-dash-modal [data-wf-dash-verifier-output-inner],',
            '#wf-dash-modal [data-wf-dash-session-qa-inner] {',
            '  opacity: 0;',
            '  transition: opacity 120ms ease-out;',
            '}',
            '#wf-dash-modal [data-wf-dash-user-story-panel][data-open="1"] [data-wf-dash-user-story-inner],',
            '#wf-dash-modal [data-wf-dash-verifier-output-panel][data-open="1"] [data-wf-dash-verifier-output-inner],',
            '#wf-dash-modal [data-wf-dash-session-qa-panel][data-open="1"] [data-wf-dash-session-qa-inner] {',
            '  opacity: 1;',
            '  transition: opacity 180ms ease-in 40ms;',
            '}',
            '#wf-dash-modal [data-wf-dash-action-block-toggle] {',
            '  cursor: pointer;',
            '}'
        ].join('\n');
    },

    _ensureCardActionStyles() {
        if (!this._modal) return;
        const css = [
            '#wf-dash-modal .wf-dash-card-shell {',
            '  position: relative;',
            '}',
            '#wf-dash-modal .wf-dash-card-action-row {',
            '  position: absolute;',
            '  top: -24px;',
            '  right: 8px;',
            '  z-index: 1;',
            '  display: flex;',
            '  justify-content: flex-end;',
            '  align-items: flex-start;',
            '  height: 24px;',
            '  overflow: visible;',
            '  pointer-events: none;',
            '}',
            '#wf-dash-modal .wf-dash-card-action-area {',
            '  display: flex;',
            '  align-items: flex-start;',
            '  justify-content: flex-end;',
            '  gap: 0.25rem;',
            '  flex-wrap: wrap;',
            '  flex-shrink: 0;',
            '  margin-left: 6px;',
            '  pointer-events: auto;',
            '}',
            '#wf-dash-modal [data-wf-dash-task-card] > .wf-dash-card-shell > .wf-dash-task-card-article {',
            '  position: relative;',
            '  z-index: 2;',
            '}',
            '#wf-dash-modal .wf-dash-card-action {',
            '  width: 2rem;',
            '  height: 24px;',
            '  padding: 0;',
            '  border: none;',
            '  border-radius: 6px 6px 0 0;',
            '  cursor: pointer;',
            '  flex-shrink: 0;',
            '  font-family: inherit;',
            '  transition: background 0.15s, border-color 0.15s, color 0.15s;',
            '}',
            '#wf-dash-modal .wf-dash-card-action--remove {',
            '  background: #dc2626;',
            '  color: #fff;',
            '}',
            '#wf-dash-modal .wf-dash-card-action--get-verifier,',
            '#wf-dash-modal .wf-dash-card-action--add-to-diff,',
            '#wf-dash-modal .wf-dash-card-action--rehydrate {',
            '  width: auto;',
            '  min-width: 0;',
            '  border: 1px solid var(--brand, var(--primary, #2563eb));',
            '  background: #000;',
            '  color: #fff;',
            '  padding: 0 8px;',
            '}',
            '#wf-dash-modal .wf-dash-card-action--rescue {',
            '  width: auto;',
            '  min-width: 0;',
            '  border: 1px solid #b45309;',
            '  background: #92400e;',
            '  color: #fff7ed;',
            '  padding: 0 8px;',
            '}',
            '#wf-dash-modal .wf-dash-card-action--get-verifier:hover,',
            '#wf-dash-modal .wf-dash-card-action--add-to-diff:hover,',
            '#wf-dash-modal .wf-dash-card-action--rehydrate:hover {',
            '  background: color-mix(in srgb, var(--brand, #2563eb) 10%, var(--background, #fff));',
            '  border-color: var(--brand, var(--primary, #2563eb));',
            '  color: var(--brand, var(--primary, #2563eb));',
            '}',
            '#wf-dash-modal .wf-dash-card-action--rescue:hover {',
            '  background: #78350f;',
            '  border-color: #92400e;',
            '  color: #fff7ed;',
            '}',
            '#wf-dash-modal .wf-dash-card-action--rehydrate:disabled,',
            '#wf-dash-modal .wf-dash-card-action--rescue:disabled {',
            '  opacity: 0.65;',
            '  cursor: wait;',
            '}',
            '#wf-dash-modal .wf-dash-card-action--remove:hover {',
            '  background: #b91c1c;',
            '}',
            '#wf-dash-modal .wf-dash-card-action-inner {',
            '  display: flex;',
            '  align-items: center;',
            '  justify-content: center;',
            '  height: 24px;',
            '  min-height: 24px;',
            '  box-sizing: border-box;',
            '}',
            '#wf-dash-modal .wf-dash-card-action-icon,',
            '#wf-dash-modal .wf-dash-card-action-label {',
            '  opacity: 1;',
            '  line-height: 1;',
            '  white-space: nowrap;',
            '}',
            '#wf-dash-modal .wf-dash-card-action-icon {',
            '  font-size: 14px;',
            '  font-weight: 700;',
            '}',
            '#wf-dash-modal .wf-dash-card-action-label {',
            '  font-size: 10px;',
            '  font-weight: 600;',
            '}',
            '#wf-dash-modal .wf-dash-card-tabs-row {',
            '  display: flex;',
            '  align-items: flex-end;',
            '  justify-content: space-between;',
            '  gap: 8px;',
            '  flex-wrap: nowrap;',
            '  padding: 0 8px;',
            '  margin-bottom: 0;',
            '  padding-right: calc(16rem + 14px);',
            '  box-sizing: border-box;',
            '  overflow: hidden;',
            '}',
            '#wf-dash-modal .wf-dash-card-tabs-left {',
            '  display: flex;',
            '  align-items: flex-end;',
            '  gap: 4px;',
            '  min-width: 0;',
            '  flex: 1 1 auto;',
            '  flex-wrap: nowrap;',
            '  overflow-x: auto;',
            '  overflow-y: hidden;',
            '  -webkit-overflow-scrolling: touch;',
            '}',
            '#wf-dash-modal .wf-dash-card-tabs-left > * {',
            '  flex-shrink: 0;',
            '}',
            '#wf-dash-modal .wf-dash-card-key-tab {',
            '  flex: 0 0 auto;',
            '  min-width: 0;',
            '  max-width: none;',
            '  justify-content: flex-start;',
            '  overflow: visible;',
            '}',
            '#wf-dash-modal .wf-dash-card-key-tab-inner {',
            '  display: inline-flex;',
            '  align-items: stretch;',
            '  min-width: 0;',
            '  max-width: 100%;',
            '}',
            '#wf-dash-modal .wf-dash-card-key-copy {',
            '  display: block;',
            '  min-width: 0;',
            '  flex: 0 1 auto;',
            '  max-width: 100%;',
            '  padding: 3px 8px;',
            '  border: none;',
            '  border-radius: 6px;',
            '  font-size: 11px;',
            '  color: var(--foreground, #0f172a);',
            '  background: transparent;',
            '  text-align: left;',
            '  cursor: pointer;',
            '  overflow: hidden;',
            '  text-overflow: ellipsis;',
            '  white-space: nowrap;',
            '  direction: rtl;',
            '  unicode-bidi: isolate;',
            '  box-sizing: border-box;',
            '}',
            '#wf-dash-modal .wf-dash-card-key-copy--empty {',
            '  display: inline-block;',
            '  padding: 3px 8px;',
            '  border: none;',
            '  border-radius: 6px;',
            '  font-size: 11px;',
            '  color: var(--muted-foreground, #64748b);',
            '  opacity: 0.6;',
            '  direction: ltr;',
            '}',
            '#wf-dash-modal .wf-dash-card-key-copy-text {',
            '  direction: ltr;',
            '  unicode-bidi: embed;',
            '  display: inline-block;',
            '  min-width: 100%;',
            '  vertical-align: top;',
            '  text-align: left;',
            '}'
        ].join('\n');
        let style = this._modal.querySelector('#wf-dash-card-action-style');
        if (style) {
            style.textContent = css;
            return;
        }
        style = this._pageWindow().document.createElement('style');
        style.id = 'wf-dash-card-action-style';
        style.textContent = css;
        this._modal.appendChild(style);
    },

    _ensureSplitPanelResizeStyles() {
        if (!this._modal || this._modal.querySelector('#wf-dash-split-resize-style')) return;
        const style = this._pageWindow().document.createElement('style');
        style.id = 'wf-dash-split-resize-style';
        style.textContent = [
            '.wf-dash-split-grip {',
            '  display: flex;',
            '  flex-direction: column;',
            '  align-items: center;',
            '  justify-content: center;',
            '  gap: 3px;',
            '  pointer-events: none;',
            '}',
            '.wf-dash-split-grip-dot {',
            '  width: 3px;',
            '  height: 3px;',
            '  border-radius: 50%;',
            '  background: color-mix(in srgb, var(--muted-foreground, #64748b) 45%, transparent);',
            '}',
            '[data-wf-dash-split-handle]:hover .wf-dash-split-grip-dot,',
            '[data-wf-dash-split-handle]:active .wf-dash-split-grip-dot,',
            '[data-wf-dash-results-width-handle]:hover .wf-dash-split-grip-dot,',
            '[data-wf-dash-results-width-handle]:active .wf-dash-split-grip-dot {',
            '  background: var(--muted-foreground, #64748b);',
            '}',
            '[data-wf-dash-split-handle]:hover,',
            '[data-wf-dash-split-handle]:active,',
            '[data-wf-dash-results-width-handle]:hover,',
            '[data-wf-dash-results-width-handle]:active {',
            '  background: color-mix(in srgb, var(--border, #e2e8f0) 55%, var(--brand, var(--primary, #2563eb)));',
            '}',
            '[data-wf-dash-split-right] {',
            '  position: relative;',
            '}',
            '[data-wf-dash-split-right][data-wf-dash-stats-collapsed="true"] {',
            '  padding-right: ' + DASH_STATS_PANEL_COLLAPSED_WIDTH + 'px;',
            '  box-sizing: border-box;',
            '}',
            '[data-wf-dash-stats-column][data-wf-dash-stats-collapsed="true"] {',
            '  position: absolute !important;',
            '  top: 0 !important;',
            '  right: 0 !important;',
            '  bottom: 0 !important;',
            '  flex: 0 0 ' + DASH_STATS_PANEL_COLLAPSED_WIDTH + 'px !important;',
            '  min-width: ' + DASH_STATS_PANEL_COLLAPSED_WIDTH + 'px !important;',
            '  max-width: ' + DASH_STATS_PANEL_COLLAPSED_WIDTH + 'px !important;',
            '  width: ' + DASH_STATS_PANEL_COLLAPSED_WIDTH + 'px !important;',
            '  overflow: hidden !important;',
            '  z-index: 2;',
            '}',
            '[data-wf-dash-stats-column][data-wf-dash-stats-collapsed="true"] [data-wf-dash-stats-body] {',
            '  display: none !important;',
            '}',
            '[data-wf-dash-stats-sliver] {',
            '  display: none;',
            '}',
            '[data-wf-dash-stats-column][data-wf-dash-stats-collapsed="true"] [data-wf-dash-stats-sliver] {',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '  align-items: flex-end !important;',
            '  justify-content: flex-start !important;',
            '  width: 100% !important;',
            '  height: 100% !important;',
            '  min-height: 100% !important;',
            '  padding: 6px 2px 6px 0 !important;',
            '  box-sizing: border-box !important;',
            '}',
            '[data-wf-dash-stats-column][data-wf-dash-stats-collapsed="true"] [data-wf-dash-stats-toggle] {',
            '  writing-mode: vertical-rl !important;',
            '  text-orientation: mixed !important;',
            '  white-space: nowrap !important;',
            '  height: auto !important;',
            '  min-height: 3.5rem !important;',
            '  padding: 8px 4px !important;',
            '}',
            '[data-wf-dash-results-collapse-sliver] {',
            '  display: none;',
            '}',
            '[data-wf-dash-split-root][data-wf-dash-results-collapsed="true"] [data-wf-dash-results-collapse-sliver] {',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '  align-items: flex-start !important;',
            '  justify-content: flex-start !important;',
            '  flex-shrink: 0 !important;',
            '  width: ' + DASH_STATS_PANEL_COLLAPSED_WIDTH + 'px !important;',
            '  min-width: ' + DASH_STATS_PANEL_COLLAPSED_WIDTH + 'px !important;',
            '  max-width: ' + DASH_STATS_PANEL_COLLAPSED_WIDTH + 'px !important;',
            '  height: 100% !important;',
            '  min-height: 100% !important;',
            '  padding: 6px 0 6px 2px !important;',
            '  box-sizing: border-box !important;',
            '}',
            '[data-wf-dash-split-root][data-wf-dash-results-collapsed="true"] [data-wf-dash-results-toggle] {',
            '  writing-mode: vertical-rl !important;',
            '  text-orientation: mixed !important;',
            '  white-space: nowrap !important;',
            '  height: auto !important;',
            '  min-height: 3.5rem !important;',
            '  padding: 8px 4px !important;',
            '}',
            '[data-wf-dash-split-root][data-wf-dash-results-collapsed="true"] [data-wf-dash-results-column],',
            '[data-wf-dash-split-root][data-wf-dash-results-collapsed="true"] [data-wf-dash-results-width-handle] {',
            '  display: none !important;',
            '}'
        ].join('\n');
        this._modal.appendChild(style);
    },

    _attachSplitPanelResize() {
        if (!this._modal || this._splitResizeAttached) return;
        this._splitResizeAttached = true;
        this._modal.addEventListener('mousedown', (e) => {
            const handle = e.target.closest('[data-wf-dash-split-handle]');
            if (!handle || !this._modal.contains(handle)) return;
            const root = handle.closest('[data-wf-dash-split-root]');
            const left = root ? root.querySelector('[data-wf-dash-split-left]') : null;
            if (!root || !left) return;
            const scope = root.getAttribute('data-wf-dash-split-scope') || 'dashboard';
            const startX = e.clientX;
            const startWidth = left.getBoundingClientRect().width;
            this._beginColResizeDrag(e, {
                onMove: (ev) => {
                    const next = this._clampSidePanelWidth(root, startWidth + (ev.clientX - startX));
                    this._applySidePanelWidth(root, next);
                    if (scope === 'dashboard') {
                        this._applyStatsPanelWidth(root);
                        if (!this._readResultsPanelHiddenPref()) {
                            this._applyResultsPanelMaxWidth(root);
                        }
                    }
                },
                onUp: () => {
                    const finalWidth = this._clampSidePanelWidth(root, left.getBoundingClientRect().width);
                    this._writeSidePanelWidthPref(finalWidth, scope);
                    this._applySidePanelWidth(root, finalWidth);
                    if (scope === 'dashboard') {
                        this._applyStatsPanelWidth(root);
                        if (!this._readResultsPanelHiddenPref()) {
                            this._applyResultsPanelMaxWidth(root);
                        }
                    }
                    Logger.log('dashboard: side panel width set to ' + finalWidth + 'px (' + scope + ')');
                }
            });
        });
    },

    _attachResultsPanelWidthResize() {
        if (!this._modal || this._resultsWidthResizeAttached) return;
        this._resultsWidthResizeAttached = true;
        this._modal.addEventListener('mousedown', (e) => {
            const handle = e.target.closest('[data-wf-dash-results-width-handle]');
            if (!handle || !this._modal.contains(handle)) return;
            const root = handle.closest('[data-wf-dash-split-root]');
            const col = root ? root.querySelector('[data-wf-dash-results-column]') : null;
            if (!root || !col) return;
            if (this._readResultsPanelHiddenPref()) return;
            const colLeft = col.getBoundingClientRect().left;
            const splitRight = root.querySelector('[data-wf-dash-split-right]');
            const statsCol = root.querySelector('[data-wf-dash-stats-column]');
            const statsHidden = this._readStatsPanelHiddenPref();
            let lastMoveX = e.clientX;
            this._beginColResizeDrag(e, {
                onMove: (ev) => {
                    lastMoveX = ev.clientX;
                    const next = this._clampResultsPanelWidthForDrag(root, ev.clientX - colLeft, splitRight, statsHidden);
                    col.style.flex = '0 0 auto';
                    col.style.minWidth = DASH_SIDE_PANEL_MIN_RESULTS_WIDTH + 'px';
                    col.style.width = next + 'px';
                    col.style.maxWidth = next + 'px';
                    if (statsCol && !statsHidden) {
                        statsCol.style.flex = '1 1 0';
                        statsCol.style.minWidth = DASH_STATS_PANEL_MIN_WIDTH + 'px';
                        statsCol.style.width = '';
                        statsCol.style.maxWidth = '';
                    }
                },
                onUp: () => {
                    const rawIntent = Math.round(lastMoveX - colLeft);
                    const maxClosed = this._maxResultsPanelWidthForDrag(splitRight, true);
                    if (statsHidden && rawIntent >= maxClosed - DASH_RESULTS_PANEL_FULL_WIDTH_TOLERANCE_PX) {
                        this._writeResultsPanelMaxWidthPref(maxClosed);
                        this._applyResultsPanelMaxWidth(root, true);
                        Logger.log('dashboard: results panel max width set to ' + maxClosed + 'px (hidden full width)');
                    } else {
                        const sharedPref = Math.round(
                            Math.max(DASH_SIDE_PANEL_MIN_RESULTS_WIDTH, Math.min(maxClosed, rawIntent))
                        );
                        this._writeResultsPanelMaxWidthPref(sharedPref);
                        this._applyResultsPanelMaxWidth(root, statsHidden);
                        Logger.log('dashboard: results panel max width set to ' + sharedPref + 'px');
                    }
                    if (statsCol) {
                        this._applyStatsPanelWidth(root);
                    }
                }
            });
        });
    },

    _msScopeHasFilterBox(scopeKey) {
        return scopeKey.startsWith('filter-') || scopeKey.startsWith('search-') || scopeKey.startsWith('team-members-');
    },

    _msToolbarHtml(scopeKey, bulkActions) {
        const hasFilterBox = this._msScopeHasFilterBox(scopeKey);
        if (!bulkActions && !hasFilterBox) return '';
        const bulkToggle = bulkActions
            ? `<button type="button" data-wf-dash-ms-bulk-toggle="${dashEscHtml(scopeKey)}" aria-label="Select all">All</button>`
            : '';
        const filterInput = hasFilterBox
            ? `<div data-wf-dash-ms-filter-wrap="${dashEscHtml(scopeKey)}" style="display: none;">
                        <input type="text" data-wf-dash-ms-filter="${dashEscHtml(scopeKey)}" placeholder="Filter options…" autocomplete="off" style="${this._inputStyle()} padding: 4px 8px; font-size: 11px;">
                    </div>`
            : '';
        return `
                    <div data-wf-dash-ms-toolbar="${dashEscHtml(scopeKey)}" style="display: none;">
                        ${bulkToggle}
                        ${filterInput}
                    </div>`;
    },

    _multiSelectHtml(scopeKey, label, emptyHint, bulkActions) {
        const isFlyout = dashIsFlyoutMsKey(scopeKey);
        const toolbar = this._msToolbarHtml(scopeKey, bulkActions);
        const flyoutAttr = isFlyout ? ' data-wf-dash-ms-flyout="1"' : '';
        const panelInitialStyle = isFlyout
            ? 'display: none;'
            : 'display: block; max-height: 0; opacity: 0; overflow: hidden; border-top: 1px solid transparent; background: var(--card, #ffffff);';
        return `
            <div data-wf-dash-ms-wrap="${dashEscHtml(scopeKey)}"${flyoutAttr}${bulkActions ? ' data-wf-dash-ms-bulk-actions="1"' : ''} style="${this._panelBoxStyle()} min-width: 0; max-width: 100%; overflow: visible;">
                <div data-wf-dash-ms-sticky="${dashEscHtml(scopeKey)}">
                    <div data-wf-dash-ms-header="${dashEscHtml(scopeKey)}" style="display: flex; align-items: center; width: 100%; padding: 6px 10px; gap: 8px; box-sizing: border-box;">
                        <button type="button" data-wf-dash-ms-toggle="${dashEscHtml(scopeKey)}" aria-expanded="false" style="flex: 1; min-width: 0; display: block; padding: 0; border: none; background: transparent; cursor: pointer; font: inherit; color: inherit; text-align: left;">
                            <span style="font-size: 11px; font-weight: 600; color: var(--foreground, #0f172a);">${dashEscHtml(label)}</span>
                        </button>
                        <span id="wf-dash-${scopeKey}-count" style="display: none; flex-shrink: 0; font-size: 10px; font-weight: 600; color: var(--brand, var(--primary, #2563eb));"></span>
                        <button type="button" data-wf-dash-ms-toggle="${dashEscHtml(scopeKey)}" aria-hidden="true" tabindex="-1" style="flex-shrink: 0; padding: 0; border: none; background: transparent; cursor: pointer; font: inherit; color: inherit;">
                            <span data-wf-dash-ms-chevron="${dashEscHtml(scopeKey)}" style="font-size: 11px; color: var(--muted-foreground, #64748b);">▸</span>
                        </button>
                    </div>
                </div>
                <div id="wf-dash-${scopeKey}-list" data-wf-dash-ms-panel="${dashEscHtml(scopeKey)}" data-wf-dash-empty="${dashEscHtml(emptyHint)}" style="${panelInitialStyle}">
                    ${toolbar}
                    <div data-wf-dash-ms-items="${dashEscHtml(scopeKey)}" style="${this._msItemsContainerStyle()}">
                        ${this._msHintHtml(emptyHint)}
                    </div>
                </div>
            </div>
        `;
    },

    _q(selector) {
        return this._modal ? this._modal.querySelector(selector) : null;
    },

    // ── Listener wiring ──,

    _attachListeners() {
        const modal = this._modal;
        if (!modal) return;

        const closeBtn = this._q('#wf-dash-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.close());

        const openSettingsBtn = this._q('#wf-dash-open-settings');
        if (openSettingsBtn) {
            openSettingsBtn.addEventListener('click', () => {
                this.close();
                if (Context.settingsUi && typeof Context.settingsUi.openModal === 'function') {
                    Context.settingsUi.openModal({ forceSettings: true });
                    Logger.log('dashboard: closed dashboard and opened extension settings');
                } else {
                    Logger.warn('dashboard: Context.settingsUi.openModal unavailable');
                }
            });
        }

        for (const tab of this._tabs) {
            if (typeof tab.attachListeners === 'function') tab.attachListeners(modal, this);
        }

        if (Context.opsTab && typeof Context.opsTab.attachTaskLinkListeners === 'function') {
            Context.opsTab.attachTaskLinkListeners(modal);
        }

        modal.querySelectorAll('[data-wf-dash-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this._setActiveTab(btn.getAttribute('data-wf-dash-tab'));
            });
        });

        modal.addEventListener('input', (e) => {
            const filterEl = e.target;
            if (filterEl && filterEl.matches('[data-wf-dash-ms-filter]') && modal.contains(filterEl)) {
                this._applyMsDropdownFilter(filterEl.getAttribute('data-wf-dash-ms-filter'), filterEl.value);
            }
        });

        modal.addEventListener('mouseover', (e) => {
            const panel = e.target.closest('[data-wf-dash-ms-panel]');
            if (panel && modal.contains(panel)) {
                const panelScope = panel.getAttribute('data-wf-dash-ms-panel');
                if (dashIsFlyoutMsKey(panelScope)) {
                    this._clearMsHoverTimers(panelScope);
                    if (!this._isMsDropdownOpen(panelScope) && !this._state.msDropdownToggled[panelScope]) {
                        this._scheduleMsHoverOpen(panelScope);
                    }
                    return;
                }
            }
            const wrap = e.target.closest('[data-wf-dash-ms-wrap]');
            if (!wrap || !modal.contains(wrap)) return;
            if (wrap.contains(e.relatedTarget)) return;
            const scopeKey = wrap.getAttribute('data-wf-dash-ms-wrap');
            if (!dashIsFlyoutMsKey(scopeKey)) return;
            this._scheduleMsHoverOpen(scopeKey);
        });

        modal.addEventListener('mouseout', (e) => {
            const panel = e.target.closest('[data-wf-dash-ms-panel]');
            if (panel && modal.contains(panel)) {
                const panelScope = panel.getAttribute('data-wf-dash-ms-panel');
                if (dashIsFlyoutMsKey(panelScope)) {
                    if (panel.contains(e.relatedTarget)) return;
                    const wrap = this._msWrapEl(panelScope);
                    if (wrap && wrap.contains(e.relatedTarget)) return;
                    this._scheduleMsHoverClose(panelScope);
                    return;
                }
            }
            const wrap = e.target.closest('[data-wf-dash-ms-wrap]');
            if (!wrap || !modal.contains(wrap)) return;
            if (wrap.contains(e.relatedTarget)) return;
            const scopeKey = wrap.getAttribute('data-wf-dash-ms-wrap');
            if (!dashIsFlyoutMsKey(scopeKey)) return;
            if (!wrap.contains(e.relatedTarget)) {
                if (this._state.msHoverDisarmed) delete this._state.msHoverDisarmed[scopeKey];
            }
            this._scheduleMsHoverClose(scopeKey);
        });

        const win = this._pageWindow();
        if (win && typeof win.addEventListener === 'function' && !this._resizeListenerAttached) {
            this._resizeListenerAttached = true;
            win.addEventListener('resize', () => {
                if (this._flyoutResizeTimer) clearTimeout(this._flyoutResizeTimer);
                this._flyoutResizeTimer = setTimeout(() => {
                    this._flyoutResizeTimer = null;
                    if (this._isOpen()) {
                        this._repositionOpenFlyouts();
                        this._scheduleSplitLayoutSync();
                    }
                }, 100);
            }, { passive: true });
        }

        modal.addEventListener('change', (e) => {
            const cb = e.target;
            if (!cb || cb.type !== 'checkbox') return;
            const msKey = cb.getAttribute('data-wf-dash-ms');
            if (!msKey) return;
            if (dashIsTeamMembersDualConstraintMsKey(msKey) && cb.checked) {
                this._enforceDualConstraintPolarity(msKey, cb);
            }
            this._updateMsCount(msKey);
            if (msKey === 'search-teams') this._renderSearchProjectsList();
            if (msKey.startsWith('search-')) this._validateRangeUi();
            if (dashIsTeamMembersMsKey(msKey) && typeof this._onTeamMemberMsChange === 'function') {
                this._onTeamMemberMsChange(this._modal);
            }
            if (msKey.startsWith('filter-') && this._state.cachedItems) {
                if (typeof this._updateFilterSelectionOrder === 'function') {
                    this._updateFilterSelectionOrder(msKey);
                }
                this._keepFilterMsDropdownOpen(msKey);
                this._renderFilterLists();
                if (typeof this._maybeLiveApplyFilterMsChange === 'function') {
                    this._maybeLiveApplyFilterMsChange(msKey);
                }
            }
            if (msKey.startsWith('filter-')) this._updateApplyFiltersUi();
        });

        modal.addEventListener('mousedown', (e) => {
            if (this._isInsideOpenMsFlyout(e.target)) return;
            this._closeFlyoutMsDropdowns();
        });

        for (const panelId of ['#wf-dash-left-panel-search', '#wf-dash-left-panel-filters']) {
            const scrollPanel = this._q(panelId);
            if (!scrollPanel) continue;
            scrollPanel.addEventListener('scroll', () => {
                this._closeFlyoutMsDropdowns();
                this._repositionOpenFlyouts();
            }, { passive: true });
        }

        modal.addEventListener('click', (e) => {
            const msToggle = e.target.closest('[data-wf-dash-ms-toggle]');
            if (msToggle && modal.contains(msToggle)) {
                this._toggleMsDropdown(msToggle.getAttribute('data-wf-dash-ms-toggle'));
                return;
            }
            const msOptionRow = e.target.closest('tr[data-wf-dash-ms-option]');
            if (msOptionRow && modal.contains(msOptionRow)) {
                if (e.target.closest('input[type="checkbox"]')) return;
                const cb = msOptionRow.querySelector('input[type="checkbox"][data-wf-dash-ms]');
                if (cb) {
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
                return;
            }
            const msBulkToggle = e.target.closest('[data-wf-dash-ms-bulk-toggle]');
            if (msBulkToggle && modal.contains(msBulkToggle)) {
                const key = msBulkToggle.getAttribute('data-wf-dash-ms-bulk-toggle');
                this._keepFilterMsDropdownOpen(key);
                this._toggleMsBulkSelection(key);
                if (key.startsWith('search-teams')) this._renderSearchProjectsList();
                if (key.startsWith('search-')) this._validateRangeUi();
                if (key.startsWith('filter-') && this._state.cachedItems) {
                    if (typeof this._updateFilterSelectionOrder === 'function') {
                        this._updateFilterSelectionOrder(key);
                    }
                    this._renderFilterLists();
                    if (typeof this._maybeLiveApplyFilterMsChange === 'function') {
                        this._maybeLiveApplyFilterMsChange(key);
                    }
                }
                if (key.startsWith('filter-')) this._updateApplyFiltersUi();
                if (dashIsTeamMembersMsKey(key) && typeof this._onTeamMemberMsChange === 'function') {
                    this._onTeamMemberMsChange(this._modal);
                }
                return;
            }
        });
    },

    _msPanelEl(scopeKey) {
        return this._q('#wf-dash-' + scopeKey + '-list');
    },

    _msItemsEl(scopeKey) {
        const panel = this._msPanelEl(scopeKey);
        return panel ? panel.querySelector('[data-wf-dash-ms-items]') : null;
    },

    _msWrapEl(scopeKey) {
        return this._q('[data-wf-dash-ms-wrap="' + scopeKey + '"]');
    },

    _isMsDropdownOpen(scopeKey) {
        return Boolean(this._state.msDropdownOpen[scopeKey]);
    },

    _finalizeHiddenPanelAfterTransition(panel, finalize, propNames, scopeKey) {
        const props = Array.isArray(propNames) ? propNames : [propNames];
        const onEnd = (e) => {
            if (e.target !== panel) return;
            if (!props.includes(e.propertyName)) return;
            finalize();
        };
        panel.addEventListener('transitionend', onEnd, { once: true });
        const fallback = setTimeout(finalize, DASH_MS_FLYOUT_ANIM_MS + 50);
        if (scopeKey != null) {
            const timers = this._state.msDropdownHoverTimers[scopeKey] || {};
            timers.flyoutFallback = fallback;
            this._state.msDropdownHoverTimers[scopeKey] = timers;
        }
    },

    _msChevronForScope(scopeKey, open) {
        if (dashIsFlyoutMsKey(scopeKey) && !this._state.msDropdownToggled[scopeKey]) return open ? '◂' : '▸';
        return open ? '▾' : '▸';
    },

    _setMsDropdownToggledAttr(scopeKey, toggled) {
        const wrap = this._msWrapEl(scopeKey);
        if (!wrap) return;
        if (toggled) wrap.setAttribute('data-wf-dash-ms-toggled', '1');
        else wrap.removeAttribute('data-wf-dash-ms-toggled');
    },

    _clearMsFlyoutAnimFallback(scopeKey) {
        const timers = (this._state.msDropdownHoverTimers || {})[scopeKey];
        if (!timers || !timers.flyoutFallback) return;
        clearTimeout(timers.flyoutFallback);
        delete timers.flyoutFallback;
    },

    _resetMsFlyoutPanelPosition(panel, scopeKey) {
        if (!panel) return;
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        panel.removeAttribute('data-wf-dash-ms-flyout-flip');
        const itemsEl = scopeKey ? this._msItemsEl(scopeKey) : panel.querySelector('[data-wf-dash-ms-items]');
        if (itemsEl) {
            itemsEl.style.maxHeight = '';
            itemsEl.style.overflowY = '';
        }
    },

    _repositionOpenFlyouts() {
        for (const scopeKey of dashAllFlyoutMsKeys(this._modal)) {
            if (this._isMsDropdownOpen(scopeKey) && !this._state.msDropdownToggled[scopeKey]) {
                this._positionMsFlyoutPanel(scopeKey);
            }
        }
    },

    _isInsideOpenMsFlyout(target) {
        if (!target || !this._modal || !this._modal.contains(target)) return false;
        const wrap = target.closest('[data-wf-dash-ms-wrap]');
        if (wrap) {
            const scopeKey = wrap.getAttribute('data-wf-dash-ms-wrap');
            if (dashIsFlyoutMsKey(scopeKey) && this._isMsDropdownOpen(scopeKey)) return true;
        }
        const panel = target.closest('[data-wf-dash-ms-panel]');
        if (panel) {
            const scopeKey = panel.getAttribute('data-wf-dash-ms-panel');
            if (dashIsFlyoutMsKey(scopeKey) && this._isMsDropdownOpen(scopeKey)) return true;
        }
        return false;
    },

    _flyoutVerticalViewBottom(scopeKey, modalRect, gap) {
        let viewBottom = modalRect.bottom - gap;
        if (scopeKey && scopeKey.startsWith('search-')) {
            const retrieveSection = this._q('#wf-dash-section-retrieve');
            if (retrieveSection) {
                const retrieveTop = retrieveSection.getBoundingClientRect().top - gap;
                if (retrieveTop > modalRect.top + gap) {
                    viewBottom = Math.min(viewBottom, retrieveTop);
                }
            }
        }
        return viewBottom;
    },

    _applyMsFlyoutVerticalLayout(scopeKey, panel, headerRect, modalRect, gap) {
        const itemsEl = this._msItemsEl(scopeKey);
        if (!itemsEl) return;
        itemsEl.style.maxHeight = '';
        itemsEl.style.overflowY = '';
        const naturalHeight = panel.scrollHeight;
        const chromeHeight = Math.max(0, naturalHeight - itemsEl.scrollHeight);
        const viewTop = modalRect.top + gap;
        const viewBottom = this._flyoutVerticalViewBottom(scopeKey, modalRect, gap);
        const headerTop = headerRect.top;
        const spaceBelow = viewBottom - headerTop;
        const spaceAbove = headerTop - viewTop;
        let panelTop = headerTop;
        let panelBudget = Math.min(naturalHeight, spaceBelow);
        if (naturalHeight > panelBudget) {
            const totalSpace = spaceBelow + spaceAbove;
            panelBudget = Math.min(naturalHeight, totalSpace);
            const growUp = panelBudget - spaceBelow;
            if (growUp > 0) panelTop = headerTop - growUp;
        }
        panel.style.top = panelTop + 'px';
        const itemsBudget = Math.max(0, panelBudget - chromeHeight);
        itemsEl.style.maxHeight = itemsBudget + 'px';
        itemsEl.style.overflowY = naturalHeight > panelBudget ? 'auto' : 'hidden';
    },

    _positionMsFlyoutPanel(scopeKey) {
        const wrap = this._msWrapEl(scopeKey);
        const panel = this._msPanelEl(scopeKey);
        const header = wrap ? wrap.querySelector('[data-wf-dash-ms-header]') : null;
        if (!wrap || !panel || !header || !this._modal) return;
        const gap = 4;
        const modalRect = this._modal.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        panel.style.left = '';
        panel.style.right = '';
        panel.removeAttribute('data-wf-dash-ms-flyout-flip');
        panel.style.top = headerRect.top + 'px';
        if (dashIsStatsChartFilterMsKey(scopeKey)) {
            panel.setAttribute('data-wf-dash-ms-flyout-flip', '1');
            panel.style.left = (headerRect.left - gap) + 'px';
            let panelRect = panel.getBoundingClientRect();
            panel.style.left = (headerRect.left - gap - panelRect.width) + 'px';
            panelRect = panel.getBoundingClientRect();
            if (panelRect.left < modalRect.left + gap) {
                panel.removeAttribute('data-wf-dash-ms-flyout-flip');
                panel.style.left = (headerRect.right + gap) + 'px';
            }
        } else {
            panel.style.left = (headerRect.right + gap) + 'px';
            let panelRect = panel.getBoundingClientRect();
            if (panelRect.right > modalRect.right - gap) {
                panel.setAttribute('data-wf-dash-ms-flyout-flip', '1');
                panel.style.left = (headerRect.left - gap - panelRect.width) + 'px';
            }
        }
        this._applyMsFlyoutVerticalLayout(scopeKey, panel, headerRect, modalRect, gap);
    },

    _setMsFlyoutPanelVisible(scopeKey, visible, immediate) {
        const wrap = this._msWrapEl(scopeKey);
        const panel = this._msPanelEl(scopeKey);
        if (!wrap || !panel) return;
        this._clearMsFlyoutAnimFallback(scopeKey);
        if (visible) {
            panel.style.display = 'block';
            panel.style.top = '0px';
            panel.removeAttribute('data-wf-dash-ms-flyout-flip');
            if (immediate) {
                wrap.setAttribute('data-wf-dash-ms-open', '1');
                this._positionMsFlyoutPanel(scopeKey);
                return;
            }
            wrap.removeAttribute('data-wf-dash-ms-open');
            requestAnimationFrame(() => {
                this._positionMsFlyoutPanel(scopeKey);
                requestAnimationFrame(() => {
                    wrap.setAttribute('data-wf-dash-ms-open', '1');
                });
            });
            return;
        }
        if (immediate || !wrap.hasAttribute('data-wf-dash-ms-open')) {
            wrap.removeAttribute('data-wf-dash-ms-open');
            panel.style.display = 'none';
            this._resetMsFlyoutPanelPosition(panel, scopeKey);
            return;
        }
        this._positionMsFlyoutPanel(scopeKey);
        wrap.removeAttribute('data-wf-dash-ms-open');
        const finalize = () => {
            if (this._isMsDropdownOpen(scopeKey)) return;
            panel.style.display = 'none';
            this._resetMsFlyoutPanelPosition(panel, scopeKey);
        };
        this._finalizeHiddenPanelAfterTransition(panel, finalize, ['opacity', 'transform'], scopeKey);
    },

    _clearMsAccordionPanelInlineOpenStyles(panel) {
        if (!panel) return;
        panel.style.removeProperty('max-height');
        panel.style.removeProperty('opacity');
        panel.style.removeProperty('overflow');
        panel.style.removeProperty('border-top');
    },

    _setMsAccordionPanelVisible(scopeKey, visible, immediate) {
        const wrap = this._msWrapEl(scopeKey);
        const panel = this._msPanelEl(scopeKey);
        if (!wrap || !panel) return;
        if (visible) {
            panel.style.display = 'block';
            this._clearMsAccordionPanelInlineOpenStyles(panel);
            if (immediate) {
                wrap.setAttribute('data-wf-dash-ms-open', '1');
                return;
            }
            wrap.removeAttribute('data-wf-dash-ms-open');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    wrap.setAttribute('data-wf-dash-ms-open', '1');
                });
            });
            return;
        }
        if (immediate || !wrap.hasAttribute('data-wf-dash-ms-open')) {
            wrap.removeAttribute('data-wf-dash-ms-open');
            panel.style.display = 'none';
            return;
        }
        wrap.removeAttribute('data-wf-dash-ms-open');
        const finalize = () => {
            if (this._isMsDropdownOpen(scopeKey)) return;
            panel.style.display = 'none';
        };
        this._finalizeHiddenPanelAfterTransition(panel, finalize, 'max-height');
    },

    _msItemsContainerStyle() {
        return 'padding: 4px; display: flex; flex-direction: column; align-items: stretch; width: 100%; min-width: 0; overflow-x: hidden; box-sizing: border-box;';
    },

    _msOptionCount(scopeKey) {
        const itemsEl = this._msItemsEl(scopeKey);
        if (!itemsEl) return 0;
        if (dashIsTeamMembersDualConstraintMsKey(scopeKey)) {
            return itemsEl.querySelectorAll('[data-wf-dash-ms-dual-row]').length;
        }
        return itemsEl.querySelectorAll('input[type="checkbox"][data-wf-dash-ms]').length;
    },

    _msBulkToggleMode(scopeKey) {
        const mode = (this._state.msBulkToggleMode || {})[scopeKey];
        return mode === 'none' ? 'none' : 'all';
    },

    _setMsBulkToggleMode(scopeKey, mode) {
        if (!this._state.msBulkToggleMode) this._state.msBulkToggleMode = {};
        this._state.msBulkToggleMode[scopeKey] = mode === 'all' ? 'all' : 'none';
    },

    _applyMsBulkToggleLabel(scopeKey) {
        const btn = this._q('[data-wf-dash-ms-bulk-toggle="' + scopeKey + '"]');
        if (!btn) return;
        const intentAll = this._msBulkToggleMode(scopeKey) === 'all';
        btn.textContent = intentAll ? 'All' : 'None';
        btn.setAttribute('aria-label', intentAll ? 'Select all' : 'Deselect all');
        btn.style.color = intentAll
            ? 'var(--brand, var(--primary, #2563eb))'
            : 'var(--muted-foreground, #64748b)';
    },

    _toggleMsBulkSelection(scopeKey) {
        const intentAll = this._msBulkToggleMode(scopeKey) === 'all';
        this._setMultiselectChecked(scopeKey, intentAll);
        this._setMsBulkToggleMode(scopeKey, intentAll ? 'none' : 'all');
        this._applyMsBulkToggleLabel(scopeKey);
    },

    _syncMsDropdownChrome(scopeKey) {
        const optionCount = this._msOptionCount(scopeKey);
        const open = this._isMsDropdownOpen(scopeKey);
        const wrap = this._msWrapEl(scopeKey);
        const hasBulkActions = Boolean(wrap && wrap.getAttribute('data-wf-dash-ms-bulk-actions') === '1');
        const filterWrap = this._q('[data-wf-dash-ms-filter-wrap="' + scopeKey + '"]');
        const showBulkToggle = open && hasBulkActions && optionCount > 1;
        const showFilter = open && filterWrap && optionCount >= 5;
        const showToolbar = showBulkToggle || showFilter;
        const toolbar = this._q('[data-wf-dash-ms-toolbar="' + scopeKey + '"]');
        if (toolbar) toolbar.style.display = showToolbar ? 'flex' : 'none';
        if (filterWrap) {
            if (!showFilter) {
                const input = filterWrap.querySelector('[data-wf-dash-ms-filter]');
                if (input && input.value) {
                    input.value = '';
                    this._applyMsDropdownFilter(scopeKey, '');
                }
            }
            filterWrap.style.display = showFilter ? '' : 'none';
        }
        const bulkToggle = this._q('[data-wf-dash-ms-bulk-toggle="' + scopeKey + '"]');
        if (bulkToggle) bulkToggle.style.display = showBulkToggle ? '' : 'none';
        if (showBulkToggle) this._applyMsBulkToggleLabel(scopeKey);
        if (open && dashIsFlyoutMsKey(scopeKey) && !this._state.msDropdownToggled[scopeKey]) {
            requestAnimationFrame(() => this._positionMsFlyoutPanel(scopeKey));
        }
    },

    _syncMsDropdown(scopeKey, options) {
        const immediate = Boolean(options && options.immediate);
        const open = this._isMsDropdownOpen(scopeKey);
        const wrap = this._msWrapEl(scopeKey);
        const toggles = wrap ? wrap.querySelectorAll('[data-wf-dash-ms-toggle="' + scopeKey + '"]') : [];
        const chevron = this._q('[data-wf-dash-ms-chevron="' + scopeKey + '"]');
        if (dashIsFlyoutMsKey(scopeKey)) {
            if (this._state.msDropdownToggled[scopeKey]) {
                const panel = this._msPanelEl(scopeKey);
                if (panel) this._resetMsFlyoutPanelPosition(panel, scopeKey);
                this._setMsAccordionPanelVisible(scopeKey, open, immediate);
            } else {
                this._setMsFlyoutPanelVisible(scopeKey, open, immediate);
            }
        } else {
            this._setMsAccordionPanelVisible(scopeKey, open, immediate);
        }
        if (wrap) wrap.style.width = '';
        toggles.forEach((toggle) => toggle.setAttribute('aria-expanded', open ? 'true' : 'false'));
        if (chevron) chevron.textContent = this._msChevronForScope(scopeKey, open);
        this._syncMsDropdownChrome(scopeKey);
    },

    _syncAllMsDropdowns(options) {
        const keys = dashAllFlyoutMsKeys(this._modal).concat(DASH_TEAM_MEMBERS_MS_KEYS);
        for (const key of keys) this._syncMsDropdown(key, options);
    },

    _filterMsOpenKeys() {
        return dashFilterScopes().map((s) => s.scopeKey).filter((key) => this._isMsDropdownOpen(key));
    },

    _isPointerOverMsDropdown(scopeKey) {
        const wrap = this._msWrapEl(scopeKey);
        const panel = this._msPanelEl(scopeKey);
        if (!wrap || !this._isMsDropdownOpen(scopeKey)) return false;
        if (wrap.matches(':hover')) return true;
        return Boolean(panel && panel.matches(':hover'));
    },

    _keepFilterMsDropdownOpen(scopeKey) {
        if (!dashIsFilterMsKey(scopeKey)) return;
        this._clearMsHoverTimers(scopeKey);
        this._state.msDropdownOpen[scopeKey] = true;
        this._syncMsDropdown(scopeKey);
    },

    _beginFilterMsDropdownRefresh() {
        const openKeys = this._filterMsOpenKeys();
        for (const key of openKeys) this._clearMsHoverTimers(key);
        this._state.msDropdownRefreshActive = true;
        return openKeys;
    },

    _endFilterMsDropdownRefresh(openKeys) {
        for (const key of openKeys) {
            this._state.msDropdownOpen[key] = true;
            this._syncMsDropdown(key);
        }
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this._state.msDropdownRefreshActive = false;
                for (const key of openKeys) {
                    if (!this._isPointerOverMsDropdown(key)) continue;
                    this._clearMsHoverTimers(key);
                    this._state.msDropdownOpen[key] = true;
                    this._syncMsDropdown(key);
                }
            });
        });
    },

    _clearMsHoverTimers(scopeKey) {
        const store = this._state.msDropdownHoverTimers || {};
        const timers = store[scopeKey];
        if (!timers) return;
        if (timers.open) clearTimeout(timers.open);
        if (timers.close) clearTimeout(timers.close);
        delete timers.open;
        delete timers.close;
        if (Object.keys(timers).length === 0) delete store[scopeKey];
    },

    _clearAllMsHoverTimers() {
        for (const key of Object.keys(this._state.msDropdownHoverTimers || {})) {
            this._clearMsHoverTimers(key);
        }
    },

    _disarmMsHover(scopeKey) {
        if (!this._state.msHoverDisarmed) this._state.msHoverDisarmed = {};
        this._state.msHoverDisarmed[scopeKey] = true;
        this._clearMsHoverTimers(scopeKey);
    },

    _scheduleMsHoverOpen(scopeKey) {
        if (!dashIsFlyoutMsKey(scopeKey)) return;
        if (this._state.msHoverDisarmed && this._state.msHoverDisarmed[scopeKey]) return;
        if (this._state.msDropdownToggled[scopeKey]) return;
        this._clearMsHoverTimers(scopeKey);
        const timers = this._state.msDropdownHoverTimers[scopeKey] || {};
        timers.open = setTimeout(() => {
            delete timers.open;
            if (this._state.msDropdownToggled[scopeKey]) return;
            this._openMsDropdownHover(scopeKey);
        }, DASH_MS_HOVER_OPEN_MS);
        this._state.msDropdownHoverTimers[scopeKey] = timers;
    },

    _scheduleMsHoverClose(scopeKey) {
        if (!dashIsFlyoutMsKey(scopeKey)) return;
        if (this._state.msDropdownToggled[scopeKey]) return;
        if (this._state.msDropdownRefreshActive) return;
        this._clearMsHoverTimers(scopeKey);
        const timers = this._state.msDropdownHoverTimers[scopeKey] || {};
        timers.close = setTimeout(() => {
            delete timers.close;
            if (!this._isMsDropdownOpen(scopeKey)) return;
            if (this._state.msDropdownToggled[scopeKey]) return;
            if (this._state.msDropdownRefreshActive) return;
            if (this._isPointerOverMsDropdown(scopeKey)) return;
            delete this._state.msDropdownOpen[scopeKey];
            this._syncMsDropdown(scopeKey);
        }, DASH_MS_HOVER_CLOSE_MS);
        this._state.msDropdownHoverTimers[scopeKey] = timers;
    },

    _openMsDropdownHover(scopeKey) {
        if (!dashIsFlyoutMsKey(scopeKey)) return;
        for (const key of dashAllFlyoutMsKeys(this._modal)) {
            if (key === scopeKey) continue;
            if (this._state.msDropdownToggled[key]) continue;
            if (this._isMsDropdownOpen(key)) {
                delete this._state.msDropdownOpen[key];
                this._syncMsDropdown(key);
            }
            this._clearMsHoverTimers(key);
        }
        this._state.msDropdownOpen[scopeKey] = true;
        this._syncMsDropdown(scopeKey);
        this._scrollOpenedMsDropdownIntoView(scopeKey);
    },

    _closeAllMsDropdowns() {
        this._clearAllMsHoverTimers();
        this._state.msDropdownOpen = {};
        this._state.msDropdownFilter = {};
        this._state.msDropdownPinned = {};
        this._state.msDropdownToggled = {};
        this._state.filterExpandAllIntent = 'expand';
        for (const scopeKey of dashAllFlyoutMsKeys(this._modal)) {
            this._setMsDropdownToggledAttr(scopeKey, false);
        }
        const scopeKeys = dashAllFlyoutMsKeys(this._modal)
            .concat(DASH_TEAM_MEMBERS_MS_KEYS);
        for (const scopeKey of scopeKeys) {
            const input = this._q('[data-wf-dash-ms-filter="' + scopeKey + '"]');
            if (input) input.value = '';
            this._applyMsDropdownFilter(scopeKey, '');
        }
        this._syncAllMsDropdowns({ immediate: true });
        this._applyFilterExpandAllButtonLabel();
    },

    _closeFlyoutMsDropdowns() {
        const anyFlyoutOpen = dashAllFlyoutMsKeys(this._modal).some((key) => {
            return this._isMsDropdownOpen(key) && !this._state.msDropdownToggled[key];
        });
        if (!anyFlyoutOpen) return;
        this._clearAllMsHoverTimers();
        for (const scopeKey of dashAllFlyoutMsKeys(this._modal)) {
            if (!this._isMsDropdownOpen(scopeKey)) continue;
            if (this._state.msDropdownToggled[scopeKey]) continue;
            delete this._state.msDropdownOpen[scopeKey];
            this._syncMsDropdown(scopeKey, { immediate: true });
        }
    },

    _msDropdownScrollEl(scopeKey) {
        const panelId = (scopeKey && scopeKey.startsWith('filter-'))
            ? '#wf-dash-left-panel-filters'
            : (scopeKey && scopeKey.startsWith('search-') ? '#wf-dash-left-panel-search'
                : (scopeKey && scopeKey.startsWith('stats-chart-filter-') ? '[data-wf-dash-stats-body]'
                    : (scopeKey && scopeKey.startsWith('team-members-') ? '#wf-ops-team-left-scroll' : null)));
        if (!panelId) return null;
        const panel = this._q(panelId);
        if (!panel || panel.style.display === 'none') return null;
        for (const child of panel.children) {
            if (!(child instanceof this._pageWindow().HTMLElement)) continue;
            const oy = this._pageWindow().getComputedStyle(child).overflowY;
            if (oy === 'auto' || oy === 'scroll') return child;
        }
        return null;
    },

    _scrollOpenedMsDropdownIntoView(scopeKey) {
        if (dashIsFlyoutMsKey(scopeKey) && !this._state.msDropdownToggled[scopeKey]) {
            this._positionMsFlyoutPanel(scopeKey);
            return;
        }
        const wrap = this._msWrapEl(scopeKey);
        const scrollEl = this._msDropdownScrollEl(scopeKey);
        if (!wrap || !scrollEl) return;
        requestAnimationFrame(() => {
            const scrollRect = scrollEl.getBoundingClientRect();
            const wrapRect = wrap.getBoundingClientRect();
            const extendsBelow = wrapRect.bottom > scrollRect.bottom + 1;
            if (!extendsBelow) return;
            const delta = wrapRect.top - scrollRect.top;
            if (Math.abs(delta) < 1) return;
            const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
            const next = Math.max(0, Math.min(scrollEl.scrollTop + delta, maxScroll));
            if (next !== scrollEl.scrollTop) {
                scrollEl.scrollTop = next;
                Logger.debug('dashboard: scrolled filter menu into view — ' + scopeKey);
            }
        });
    },

    _applyFilterExpandAllButtonLabel() {
        const btn = this._q('#wf-dash-filter-expand-all');
        if (!btn) return;
        const collapse = this._state.filterExpandAllIntent === 'collapse';
        btn.textContent = collapse ? 'Collapse All' : 'Expand All';
        btn.setAttribute('aria-label', collapse ? 'Collapse all filter menus' : 'Expand all filter menus');
    },

    _filterScopeHasOptions(scopeKey) {
        const wrap = this._msWrapEl(scopeKey);
        if (!wrap || wrap.style.display === 'none') return false;
        return this._msOptionCount(scopeKey) > 0;
    },

    _toggleFilterExpandAll() {
        const intent = this._state.filterExpandAllIntent === 'collapse' ? 'collapse' : 'expand';
        if (intent === 'expand') {
            for (const { scopeKey } of dashFilterScopes()) {
                if (!this._filterScopeHasOptions(scopeKey)) continue;
                this._state.msDropdownToggled[scopeKey] = true;
                this._state.msDropdownOpen[scopeKey] = true;
                this._setMsDropdownToggledAttr(scopeKey, true);
                this._syncMsDropdown(scopeKey);
            }
            this._state.filterExpandAllIntent = 'collapse';
            Logger.log('search-output: filter menus — expanded all');
        } else {
            for (const { scopeKey } of dashFilterScopes()) {
                if (!this._state.msDropdownToggled[scopeKey]) continue;
                delete this._state.msDropdownOpen[scopeKey];
                delete this._state.msDropdownToggled[scopeKey];
                this._setMsDropdownToggledAttr(scopeKey, false);
                this._syncMsDropdown(scopeKey);
            }
            this._state.filterExpandAllIntent = 'expand';
            Logger.log('search-output: filter menus — collapsed all');
        }
        this._applyFilterExpandAllButtonLabel();
    },

    _toggleMsDropdown(scopeKey) {
        const wasOpen = this._isMsDropdownOpen(scopeKey);
        if (dashIsTeamMembersMsKey(scopeKey)) {
            if (wasOpen) delete this._state.msDropdownOpen[scopeKey];
            else this._state.msDropdownOpen[scopeKey] = true;
            this._syncMsDropdown(scopeKey);
            if (!wasOpen) this._scrollOpenedMsDropdownIntoView(scopeKey);
            return;
        }
        this._clearMsHoverTimers(scopeKey);
        if (dashIsFlyoutMsKey(scopeKey)) {
            const wasToggled = Boolean(this._state.msDropdownToggled[scopeKey]);
            if (wasToggled && wasOpen) {
                delete this._state.msDropdownOpen[scopeKey];
                delete this._state.msDropdownToggled[scopeKey];
                this._setMsDropdownToggledAttr(scopeKey, false);
                this._disarmMsHover(scopeKey);
                this._syncMsDropdown(scopeKey);
                return;
            }
            if (!wasToggled && wasOpen) {
                this._state.msDropdownToggled[scopeKey] = true;
                this._setMsDropdownToggledAttr(scopeKey, true);
                this._syncMsDropdown(scopeKey);
                return;
            }
            for (const key of dashAllFlyoutMsKeys(this._modal)) {
                if (key === scopeKey) continue;
                if (this._state.msDropdownToggled[key]) continue;
                if (this._isMsDropdownOpen(key)) {
                    delete this._state.msDropdownOpen[key];
                    this._syncMsDropdown(key);
                }
                this._clearMsHoverTimers(key);
            }
            this._state.msDropdownToggled[scopeKey] = true;
            this._state.msDropdownOpen[scopeKey] = true;
            this._setMsDropdownToggledAttr(scopeKey, true);
            this._syncMsDropdown(scopeKey);
            this._scrollOpenedMsDropdownIntoView(scopeKey);
            return;
        }
        this._state.msDropdownOpen = {};
        const opening = !wasOpen;
        if (opening) this._state.msDropdownOpen[scopeKey] = true;
        this._syncAllMsDropdowns();
        if (opening) this._scrollOpenedMsDropdownIntoView(scopeKey);
    },

    _msDropdownFilterMatchText(label, lib, q) {
        const parts = [label.getAttribute('data-wf-dash-ms-label') || ''];
        const nameEl = label.querySelector('[data-wf-dash-ms-option-name]');
        const emailEl = label.querySelector('[data-wf-dash-ms-option-email]');
        if (nameEl) parts.push(nameEl.textContent || '');
        if (emailEl) parts.push(emailEl.textContent || '');
        const text = parts.filter(Boolean).join(' ');
        return lib.textMatchesQuery(text, q, true, false);
    },

    _syncMsNoMatchEl(itemsEl, query, visibleCount) {
        let noMatchEl = itemsEl.querySelector('[data-wf-dash-ms-no-match]');
        if (query && visibleCount === 0) {
            if (!noMatchEl) {
                noMatchEl = document.createElement('p');
                noMatchEl.setAttribute('data-wf-dash-ms-no-match', '1');
                noMatchEl.style.cssText = this._msHintParagraphStyle();
                noMatchEl.textContent = 'No matches';
                itemsEl.appendChild(noMatchEl);
            }
            noMatchEl.style.display = '';
        } else if (noMatchEl) {
            noMatchEl.style.display = 'none';
        }
    },

    _applyMsDropdownFilter(scopeKey, query) {
        if (!scopeKey) return;
        this._state.msDropdownFilter[scopeKey] = query || '';
        const itemsEl = this._msItemsEl(scopeKey);
        if (!itemsEl) return;
        const q = String(query || '').trim();
        const dualRows = itemsEl.querySelectorAll('[data-wf-dash-ms-dual-row]');
        if (dualRows.length > 0) {
            const qLower = q.toLowerCase();
            let visible = 0;
            dualRows.forEach((row) => {
                const text = row.getAttribute('data-wf-dash-ms-label') || '';
                const show = !q || text.toLowerCase().includes(qLower);
                if (show) row.removeAttribute('data-wf-dash-ms-filter-hidden');
                else row.setAttribute('data-wf-dash-ms-filter-hidden', '1');
                if (show) visible += 1;
            });
            this._syncMsNoMatchEl(itemsEl, q, visible);
            return;
        }
        const optionLabels = itemsEl.querySelectorAll('[data-wf-dash-ms-option]');
        if (optionLabels.length === 0) return;
        const lib = dashLib();
        let visible = 0;
        optionLabels.forEach((label) => {
            const show = !q || this._msDropdownFilterMatchText(label, lib, q);
            if (show) label.removeAttribute('data-wf-dash-ms-filter-hidden');
            else label.setAttribute('data-wf-dash-ms-filter-hidden', '1');
            if (show) visible += 1;
        });
        this._syncMsNoMatchEl(itemsEl, q, visible);
    },

    _syncMsDropdownFilterUi(scopeKey) {
        const stored = this._state.msDropdownFilter[scopeKey] || '';
        const input = this._q('[data-wf-dash-ms-filter="' + scopeKey + '"]');
        if (input && input.value !== stored) input.value = stored;
        this._applyMsDropdownFilter(scopeKey, stored);
    },

    _setMultiselectChecked(scopeKey, checked) {
        const items = this._msItemsEl(scopeKey);
        if (!items) return;
        items.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = checked; });
        this._updateMsCount(scopeKey);
    },

    _setActiveTab(tabId) {
        tabId = this._resolveActiveTabId(tabId);
        this._state.activeTab = tabId;
        this._modal.querySelectorAll('[data-wf-dash-tab]').forEach((btn) => {
            const id = btn.getAttribute('data-wf-dash-tab');
            const active = id === tabId;
            btn.style.color = active ? 'var(--foreground, #0f172a)' : 'var(--muted-foreground, #64748b)';
            btn.style.borderBottomColor = active ? 'var(--brand, var(--primary, #2563eb))' : 'transparent';
        });
        const flexPanels = new Set(['search-output', 'team-members', 'verifier-fetcher', 'diff-viewer', 'session-fetcher']);
        this._modal.querySelectorAll('[data-wf-dash-panel]').forEach((panel) => {
            const active = panel.getAttribute('data-wf-dash-panel') === tabId;
            if (flexPanels.has(tabId)) {
                panel.style.display = active ? 'flex' : 'none';
            } else {
                panel.style.display = active ? '' : 'none';
            }
        });
        const tabDef = this._tabsById[tabId];
        if (tabDef && typeof tabDef.onActivate === 'function') {
            tabDef.onActivate(this._modal, this);
        }
        if (Context.opsTab && typeof Context.opsTab.revalidateOnDashboardTabActivated === 'function') {
            Context.opsTab.revalidateOnDashboardTabActivated(this._modal);
        }
        if (tabId === 'search-output' || tabId === 'team-members' || tabId === 'diff-viewer') {
            this._scheduleSplitLayoutSync();
        }
    },

    // ── Author tokens ──,

    _selectedFromList(scopeKey) {
        const items = this._msItemsEl(scopeKey);
        if (!items) return [];
        return [...items.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.value);
    },

    _allFromList(scopeKey) {
        const items = this._msItemsEl(scopeKey);
        if (!items) return [];
        return [...items.querySelectorAll('input[type="checkbox"]')].map((cb) => cb.value);
    },

    _formatFilterOptionCountParts(count, filteredTotalCount, optionsInScope) {
        if (count == null) return { countText: '', pctText: '' };
        const countNum = Number(count);
        if (!Number.isFinite(countNum)) return { countText: String(count), pctText: '' };
        const countText = String(countNum);
        if (optionsInScope === 1 || countNum === 0) return { countText, pctText: '' };
        const totalNum = Number(filteredTotalCount);
        if (!Number.isFinite(totalNum) || totalNum <= 0) return { countText, pctText: '' };
        const pct = (countNum / totalNum) * 100;
        const lib = dashLib();
        const pctStr = lib && typeof lib.formatPercent === 'function'
            ? lib.formatPercent(pct)
            : (pct < 1 ? String(parseFloat(pct.toFixed(2))) : String(Math.round(pct)));
        return { countText, pctText: pctStr + '%' };
    },

    _formatFilterOptionCountLabel(count, filteredTotalCount, optionsInScope) {
        const parts = this._formatFilterOptionCountParts(count, filteredTotalCount, optionsInScope);
        if (!parts.countText) return '';
        if (!parts.pctText) return parts.countText;
        return parts.countText + ' / ' + parts.pctText;
    },

    _filterOptionTableRowHtml(scopeKey, it, opts) {
        const {
            defaultChecked,
            dimStyle,
            countParts,
            email,
            displayName
        } = opts;
        const countNumHtml = countParts.countText
            ? `<span data-wf-dash-ms-option-count-num="1" style="${dimStyle}">${dashEscHtml(countParts.countText)}</span>`
            : '';
        const countPctHtml = countParts.pctText
            ? `<span data-wf-dash-ms-option-count-pct="1" style="${dimStyle}">${dashEscHtml(countParts.pctText)}</span>`
            : '';
        const ariaCount = this._formatFilterOptionCountLabel(
            countParts.countText === '' ? null : Number(countParts.countText),
            opts.filteredTotalCount,
            opts.optionsInScope
        );
        const ariaSuffix = ariaCount.includes('%') ? ' of filtered' : '';
        const textHtml = this._msOptionTextHtml(displayName, email, it.label, dimStyle);
        return `
            <tr data-wf-dash-ms-option="1" data-wf-dash-ms-label="${dashEscHtml(it.label)}"${ariaCount ? ' aria-label="' + dashEscHtml(ariaCount + ariaSuffix) + '"' : ''}>
                <td data-wf-dash-ms-option-col="cb" align="center">
                    <input type="checkbox" value="${dashEscHtml(it.id)}" data-wf-dash-ms="${dashEscHtml(scopeKey)}"${defaultChecked ? ' checked' : ''}>
                </td>
                <td data-wf-dash-ms-option-col="count" align="center">${countNumHtml}</td>
                <td data-wf-dash-ms-option-col="pct" align="center">${countPctHtml}</td>
                <td data-wf-dash-ms-option-col="label" align="left">${textHtml}</td>
            </tr>`;
    },

    _multiSelectItemsHtml(scopeKey, items, emptyHint, loading, defaultChecked, irrelevantIds, optionCounts, filteredTotalCount) {
        if (loading) return this._msHintHtml('Loading…');
        if (items.length === 0) return this._msHintHtml(emptyHint);
        const irrelevant = irrelevantIds || null;
        const counts = optionCounts instanceof Map ? optionCounts : null;
        const optionsInScope = items.length;
        const useFilterTable = counts != null;
        const rows = items.map((it) => {
            const dim = irrelevant && irrelevant.has(it.id);
            const dimStyle = dim ? ' color: var(--muted-foreground, #64748b); opacity: 0.5;' : '';
            const email = String(it.email || '').trim();
            const displayName = String(it.name || it.label || '').trim();
            if (useFilterTable) {
                const countParts = counts.has(it.id)
                    ? this._formatFilterOptionCountParts(counts.get(it.id), filteredTotalCount, optionsInScope)
                    : { countText: '', pctText: '' };
                return this._filterOptionTableRowHtml(scopeKey, it, {
                    defaultChecked,
                    dimStyle,
                    countParts,
                    email,
                    displayName,
                    filteredTotalCount,
                    optionsInScope
                });
            }
            const textHtml = this._msOptionTextHtml(displayName, email, it.label, dimStyle);
            return `
            <label data-wf-dash-ms-option="1" data-wf-dash-ms-label="${dashEscHtml(it.label)}" style="padding: 4px 8px; font-size: 11px; border-radius: 4px; cursor: pointer; color: var(--foreground, #0f172a);">
                <span data-wf-dash-ms-option-cb="1"><input type="checkbox" value="${dashEscHtml(it.id)}" data-wf-dash-ms="${dashEscHtml(scopeKey)}"${defaultChecked ? ' checked' : ''}></span>
                ${textHtml}
            </label>`;
        }).join('');
        if (useFilterTable) {
            return '<table data-wf-dash-ms-option-table="1" cellpadding="0" cellspacing="0" role="presentation">'
                + '<colgroup>'
                + '<col data-wf-dash-ms-option-col="cb">'
                + '<col data-wf-dash-ms-option-col="count">'
                + '<col data-wf-dash-ms-option-col="pct">'
                + '<col data-wf-dash-ms-option-col="label">'
                + '</colgroup><tbody>' + rows + '</tbody></table>';
        }
        return rows;
    },

    _enforceDualConstraintPolarity(scopeKey, cb) {
        const itemsEl = this._msItemsEl(scopeKey);
        if (!itemsEl || !cb) return;
        const polarity = cb.getAttribute('data-wf-dash-ms-polarity');
        if (polarity !== 'include' && polarity !== 'exclude') return;
        const opposite = polarity === 'include' ? 'exclude' : 'include';
        itemsEl.querySelectorAll('input[type="checkbox"][data-wf-dash-ms-polarity="' + opposite + '"]').forEach((other) => {
            if (other.value === cb.value) other.checked = false;
        });
    },

    _readDualConstraintSelection(scopeKey) {
        const itemsEl = this._msItemsEl(scopeKey);
        const include = new Set();
        const exclude = new Set();
        if (!itemsEl) return { include, exclude };
        itemsEl.querySelectorAll('input[type="checkbox"][data-wf-dash-ms-polarity="include"]:checked').forEach((cb) => {
            if (cb.value) include.add(cb.value);
        });
        itemsEl.querySelectorAll('input[type="checkbox"][data-wf-dash-ms-polarity="exclude"]:checked').forEach((cb) => {
            if (cb.value) exclude.add(cb.value);
        });
        return { include, exclude };
    },

    _dualConstraintItemsHtml(scopeKey, items, colIncludeLabel, colExcludeLabel, emptyHint, loading) {
        if (loading) {
            return this._msHintHtml('Loading…');
        }
        if (!items || items.length === 0) {
            return this._msHintHtml(emptyHint);
        }
        const header = '<div data-wf-dash-ms-dual-header="1">' +
            '<span data-wf-dash-ms-dual-label="1"></span>' +
            '<span data-wf-dash-ms-dual-col="include">' + dashEscHtml(colIncludeLabel) + '</span>' +
            '<span data-wf-dash-ms-dual-col="exclude">' + dashEscHtml(colExcludeLabel) + '</span>' +
            '</div>';
        const rows = items.map((it) => {
            const id = String(it.id || '').trim();
            const label = String(it.label || id).trim();
            return '<div data-wf-dash-ms-dual-row="1" data-wf-dash-ms-label="' + dashEscHtml(label) + '">' +
                '<span data-wf-dash-ms-dual-label="1">' + dashEscHtml(label) + '</span>' +
                '<span data-wf-dash-ms-dual-col="include"><input type="checkbox" value="' + dashEscHtml(id) + '" data-wf-dash-ms="' + dashEscHtml(scopeKey) + '" data-wf-dash-ms-polarity="include"></span>' +
                '<span data-wf-dash-ms-dual-col="exclude"><input type="checkbox" value="' + dashEscHtml(id) + '" data-wf-dash-ms="' + dashEscHtml(scopeKey) + '" data-wf-dash-ms-polarity="exclude"></span>' +
                '</div>';
        }).join('');
        return header + rows;
    },

    _renderDualConstraintMsList(scopeKey, items, colIncludeLabel, colExcludeLabel, emptyHint, preserve, opts) {
        const itemsEl = this._msItemsEl(scopeKey);
        if (!itemsEl) {
            Logger.warn('dashboard: dual constraint list panel missing — ' + scopeKey);
            return;
        }
        const options = opts || {};
        const loading = Boolean(options.loading);
        const prev = preserve || { include: new Set(), exclude: new Set() };
        itemsEl.innerHTML = this._dualConstraintItemsHtml(
            scopeKey, items, colIncludeLabel, colExcludeLabel, emptyHint, loading
        );
        if (!loading) {
            itemsEl.querySelectorAll('input[type="checkbox"][data-wf-dash-ms-polarity="include"]').forEach((cb) => {
                if (prev.include.has(cb.value)) cb.checked = true;
            });
            itemsEl.querySelectorAll('input[type="checkbox"][data-wf-dash-ms-polarity="exclude"]').forEach((cb) => {
                if (prev.exclude.has(cb.value)) cb.checked = true;
            });
        }
        this._updateMsCount(scopeKey);
        if (dashIsTeamMembersMsKey(scopeKey)) {
            if (!loading && items && items.length > 0) {
                this._state.msDropdownOpen[scopeKey] = true;
            } else if (loading) {
                delete this._state.msDropdownOpen[scopeKey];
            }
        } else if (!loading && items && items.length > 0) {
            this._state.msDropdownOpen[scopeKey] = true;
        }
        this._syncMsDropdown(scopeKey, { immediate: true });
        this._syncMsDropdownFilterUi(scopeKey);
    },

    _updateMsCount(scopeKey) {
        const countEl = this._q('#wf-dash-' + scopeKey + '-count');
        if (!countEl) return;
        if (dashIsTeamMembersDualConstraintMsKey(scopeKey)) {
            const sel = this._readDualConstraintSelection(scopeKey);
            const n = sel.include.size + sel.exclude.size;
            countEl.textContent = String(n);
            countEl.style.display = n > 0 ? 'inline' : 'none';
            this._syncMsDropdownChrome(scopeKey);
            return;
        }
        if (scopeKey === 'team-members-badges') {
            const n = this._selectedFromList(scopeKey).length;
            countEl.textContent = String(n);
            countEl.style.display = n > 0 ? 'inline' : 'none';
            this._syncMsDropdownChrome(scopeKey);
            return;
        }
        const all = this._allFromList(scopeKey);
        const n = this._selectedFromList(scopeKey).length;
        if (scopeKey.startsWith('search-') || scopeKey.startsWith('filter-') || dashIsStatsChartFilterMsKey(scopeKey)) {
            const unrestricted = all.length === 0 || n === 0 || n >= all.length;
            countEl.textContent = unrestricted ? (all.length + '/' + all.length) : (n + '/' + all.length);
            countEl.style.display = all.length > 0 ? 'inline' : 'none';
            if (all.length > 1) {
                this._setMsBulkToggleMode(scopeKey, n === 0 ? 'all' : 'none');
                this._applyMsBulkToggleLabel(scopeKey);
            }
        } else {
            countEl.textContent = n + '/' + all.length;
            countEl.style.display = all.length > 0 ? 'inline' : 'none';
        }
        this._syncMsDropdownChrome(scopeKey);
    },

    _renderMsList(scopeKey, items, emptyHint, preserveSelected, opts) {
        const itemsEl = this._msItemsEl(scopeKey);
        if (!itemsEl) return;
        const options = opts || {};
        const prev = preserveSelected instanceof Set
            ? preserveSelected
            : new Set(this._selectedFromList(scopeKey));
        const loading = Boolean(options.loading);
        const irrelevantIds = options.irrelevantIds || null;
        const optionCounts = options.optionCounts instanceof Map ? options.optionCounts : null;
        const filteredTotalCount = options.filteredTotalCount != null ? options.filteredTotalCount : null;
        itemsEl.innerHTML = this._multiSelectItemsHtml(
            scopeKey, items, emptyHint, loading, false, irrelevantIds, optionCounts, filteredTotalCount
        );
        itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            if (prev.has(cb.value)) cb.checked = true;
        });
        this._updateMsCount(scopeKey);
        this._syncMsDropdown(scopeKey);
        this._syncMsDropdownFilterUi(scopeKey);
    }
};
