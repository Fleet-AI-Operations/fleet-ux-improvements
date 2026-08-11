// ============= team-members.js =============
// Team Members tab for the Ops dashboard.
// Panel controller (search/cards/filters/edit) lives on Context.teamMembers;
// platform fetch/mutate stays on Context.opsTab.

const TEAM_MEMBERS_FLEET_FELLOWS_LABEL = 'Fleet Fellows';
const TEAM_MEMBERS_UI_BADGE_EXCLUDED_LABELS = new Set(['Tryouts', TEAM_MEMBERS_FLEET_FELLOWS_LABEL]);
const TEAM_MEMBERS_VERTICALS_ONLY_LABEL = 'Fellows - SMB Banking Project';
const TEAM_MEMBERS_EPIC_EXPERTS_LABEL = 'Fleet: Epic Experts';
const TEAM_MEMBERS_EPIC_TRYOUTS_LABEL = 'Fleet: Epic Tryouts';
const TEAM_MEMBERS_EPIC_LABELS = new Set([TEAM_MEMBERS_EPIC_EXPERTS_LABEL, TEAM_MEMBERS_EPIC_TRYOUTS_LABEL]);
const TEAM_MEMBERS_EXPERT_STATS_HYDRATE_CONCURRENCY = 5;

/** All known permissions in Fleet UI order: [apiKey, displayLabel]. */
const TEAM_MEMBERS_ALL_PERMISSIONS = [
    ['QA_CUA_TASKS', 'QA CUA Tasks'],
    ['MAKE_CUA_TASKS', 'Make CUA Tasks'],
    ['QA_TOOL_USE_TASKS', 'QA Tool Use Tasks'],
    ['MAKE_TOOL_USE_TASKS', 'Make Tool Use Tasks'],
    ['MAKE_TAIGA_TASKS', 'Make Tundra Tasks'],
    ['QA_CUA_ENVS', 'QA CUA Environments'],
    ['QA_TOOL_USE_ENVS', 'QA Tool Use Environments'],
    ['QA_SESSIONS', 'QA Agent Sessions'],
    ['COMMENT_AGENT_SESSIONS', 'Comment Agent Sessions'],
    ['REVIEW_DISPUTES', 'Review Disputes (Senior QA)'],
    ['VIEW_OWN_TASK_RESULTS', 'View Own Task Results'],
    ['REVIEW_CONTRACTOR_APPLICATIONS', 'Contractor Review']
];
const TEAM_MEMBERS_PERMISSION_LABEL_BY_KEY = Object.fromEntries(TEAM_MEMBERS_ALL_PERMISSIONS);

const teamMembersController = {
    _opsTeamSearchActive: null,
    _opsTeamSearchAbortController: null,
    _opsTeamSearchMemberCache: null,
    /** Last-applied team member filters (categorical + numeric); null = show all */
    _opsTeamActiveFilters: null,
    /** Legacy Fellows-search gate; team member search uses all user teams. */
    _opsFellowsSearchComplete: null,
    /** memberId → staged edit session while permissions tray is in edit mode */
    _opsMemberEditState: null,
    /** memberId → { loading?, creator?, qa?, error? } */
    _opsExpertStatsCache: null,
    _opsExpertStatsHydrateGen: 0,
    /** Set of member IDs whose card details are open; null = all-expanded default */
    _opsMemberDetailsOpenIds: null,
    _tabState: {
        teamSearchQuery: '',
        teamSearchStatus: '',
        teamSearchStatusIsError: false
    },

    handleTeamSearch(modal) { return this._handleOpsTeamSearch(modal); },
    clearTeamSearchResults(modal) { this._clearOpsTeamSearchResults(modal); },
    filterTeamSearchCards(modal) { this._filterOpsTeamSearchCards(modal); },
    applyTeamFilters(modal) { this._applyOpsTeamFilters(modal); },
    populateTeamMemberConstraintLists(teams, opts) { this._populateOpsTeamMemberConstraintLists(teams, opts); },
    toggleTeamExpandAll(modal) { this._toggleOpsTeamExpandAll(modal); },
    attachTeamMemberDetailsToggle(modal) { this._attachOpsTeamMemberDetailsToggle(modal); },
    attachTeamMemberEditDelegation(modal) { this._attachOpsTeamMemberEditDelegation(modal); },
    captureTeamTabState(modal) { this._captureOpsTeamTabState(modal); },
    restoreTeamTabState(modal) { this._restoreOpsTeamTabState(modal); },
    setTeamSearchStaleRetryStatus(modal, message) { this._setOpsTeamSearchStaleRetryStatus(modal, message); },
    handleTeamSearchCredentialRetry(modal) { return this._handleOpsTeamSearchCredentialRetry(modal); },
    hydrateStatsForVisible(modal) { return this._hydrateOpsTeamMemberStatsForVisible(modal); },
    abortSearchInFlight(reason) { this._abortOpsTeamSearchInFlight(reason); },
    getSearchSessionId() { return this._opsTeamSearchActive; },
    isSearchSessionActive(sessionId) {
        return sessionId != null && this._opsTeamSearchActive === sessionId;
    },
    hasMemberSearchCache() { return !!this._opsTeamSearchMemberCache; },
    clearExpertStatsCache() {
        this._opsExpertStatsHydrateGen++;
        if (this._opsExpertStatsCache) this._opsExpertStatsCache.clear();
    },
    onModalClosed() {
        this._abortOpsTeamSearchInFlight('modal closed');
        this._opsTeamSearchActive = null;
        this._clearOpsMemberEditState();
        if (this._opsExpertStatsCache) this._opsExpertStatsCache.clear();
    },

    _opsFormatDurationMinutes(seconds) {
        const s = Number(seconds);
        if (!Number.isFinite(s) || s <= 0) return '—';
        return Math.max(1, Math.round(s / 60)) + 'm';
    },

    _opsExpertQaAcceptanceRatePercent(data) {
        if (!data || typeof data !== 'object') return null;
        if (data.acceptanceRate != null) {
            const rate = Number(data.acceptanceRate);
            if (Number.isFinite(rate)) return Math.round(rate);
        }
        const accepted = data.acceptedReviews ?? data.acceptedCount ?? data.qaAccepted;
        const rejected = data.rejectedReviews ?? data.rejectedCount ?? data.qaRejected;
        if (accepted != null && rejected != null) {
            const total = Number(accepted) + Number(rejected);
            if (Number.isFinite(total) && total > 0) {
                return Math.round((Number(accepted) / total) * 100);
            }
        }
        return null;
    },

    _opsExpertCreatorStatsColumns(data) {
        if (!data || typeof data !== 'object') return ['Creator', '—', '—', '—'];
        return [
            'Creator',
            data.totalSubmissions != null ? data.totalSubmissions + ' submitted' : '—',
            data.acceptanceRate != null ? data.acceptanceRate + '% AR' : '—',
            data.avgCreationTimeSeconds != null
                ? '~' + this._opsFormatDurationMinutes(data.avgCreationTimeSeconds) + ' avg'
                : '—'
        ];
    },

    _opsExpertQaStatsColumns(data) {
        if (!data || typeof data !== 'object') return ['QA', '—', '—', '—'];
        const reviews = data.reviewsCompleted ?? data.totalReviews ?? data.tasksReviewed ?? data.tasksCompleted;
        const avgSec = data.avgReviewTimeSeconds ?? data.avgQaTimeSeconds ?? data.avgTimePerQaSeconds
            ?? data.avgReviewDurationSeconds;
        const arPercent = this._opsExpertQaAcceptanceRatePercent(data);
        return [
            'QA',
            reviews != null ? reviews + ' reviews' : '—',
            arPercent != null ? arPercent + '% AR' : '—',
            avgSec != null ? '~' + this._opsFormatDurationMinutes(avgSec) + ' avg' : '—'
        ];
    },

    _opsExpertStatsStatusColumns(role, message) {
        return [role, message, '—', '—'];
    },

    _opsExpertStatsCredRefreshBtnHtml(memberId) {
        const id = String(memberId || '').trim();
        if (!id) return '';
        const attrId = this._opsEscapeAttr(id);
        const title = 'Open expert profile to refresh stats';
        const icon = (Context.uiLib && Context.uiLib.externalLinkIconSvg)
            ? Context.uiLib.externalLinkIconSvg()
            : '';
        return '<button type="button" class="wf-ops-profile-link-btn ' + this._opsDashBtnClass('basic', 'icon') + '" ' +
            'data-ops-action="expert-stats-cred-refresh" data-ops-member-id="' + attrId + '" ' +
            'title="' + this._opsEscapeHtml(title) + '" aria-label="' + this._opsEscapeHtml(title) + '">' +
            icon + '</button>';
    },

    _opsExpertStatsUnavailableHtml(memberId) {
        return '<div class="wf-ops-member-stats-grid wf-ops-member-stats-grid--plain" data-ops-member-stats-grid>' +
            '<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
            this._opsEscapeHtml('Stats unavailable (open expert profile once)') +
            this._opsExpertStatsCredRefreshBtnHtml(memberId) +
            '</span></div>';
    },

    _opsExpertStatsGridHtml(creatorCols, qaCols, opts) {
        const plain = !!(opts && opts.plain);
        const gridClass = plain
            ? 'wf-ops-member-stats-grid wf-ops-member-stats-grid--plain'
            : 'wf-ops-member-stats-grid';
        const rows = plain ? creatorCols : creatorCols.concat(qaCols);
        const cells = rows.map((col) => '<span>' + this._opsEscapeHtml(col || '—') + '</span>').join('');
        return '<div class="' + gridClass + '" data-ops-member-stats-grid>' + cells + '</div>';
    },

    _renderOpsTeamMemberStatsInnerHtml(entry, memberId) {
        if (!Context.opsTab.hasExpertStatsCredentials()) {
            return this._opsExpertStatsUnavailableHtml(memberId);
        }
        if (!entry || entry.loading || entry.error === 'missing-credentials') {
            const msg = 'Loading stats…';
            return this._opsExpertStatsGridHtml(
                this._opsExpertStatsStatusColumns('Creator', msg),
                this._opsExpertStatsStatusColumns('QA', msg)
            );
        }
        if (entry.error) {
            const msg = 'Stats unavailable';
            return this._opsExpertStatsGridHtml(
                this._opsExpertStatsStatusColumns('Creator', msg),
                this._opsExpertStatsStatusColumns('QA', msg)
            );
        }
        return this._opsExpertStatsGridHtml(
            this._opsExpertCreatorStatsColumns(entry.creator),
            this._opsExpertQaStatsColumns(entry.qa)
        );
    },

    _renderOpsTeamMemberStatsHtml(memberId) {
        const entry = this._opsExpertStatsCache && this._opsExpertStatsCache.get(memberId);
        return '<div data-ops-member-stats style="margin-top:6px;font-size:10px;line-height:1.5;color:var(--muted-foreground,#666);">' +
            this._renderOpsTeamMemberStatsInnerHtml(entry, memberId) +
        '</div>';
    },

    _patchOpsTeamMemberCard(modal, memberId) {
        const tile = modal.querySelector('[data-ops-member-tile="' + this._opsEscapeAttr(String(memberId)) + '"]');
        if (!tile) return;
        const entry = this._opsExpertStatsCache && this._opsExpertStatsCache.get(memberId);
        const statsSlot = tile.querySelector('[data-ops-member-stats]');
        if (statsSlot) statsSlot.innerHTML = this._renderOpsTeamMemberStatsInnerHtml(entry, memberId);
    },

    _patchOpsTeamMemberStats(modal, memberId) {
        this._patchOpsTeamMemberCard(modal, memberId);
    },

    _getVisibleTeamMemberIds(modal, cache) {
        if (!cache || !cache.memberMap) return [];
        const active = this._opsTeamActiveFilters;
        const numericRows = active && active.numericFilters ? active.numericFilters : [];
        const andOr = active ? active.andOr : 'and';
        return [...cache.memberMap.values()]
            .filter((m) => this._opsMemberMatchesNumericFilters(m, numericRows, andOr))
            .map((m) => m.id)
            .filter(Boolean);
    },

    async _hydrateOpsTeamMemberStatsForVisible(modal) {
        if (!modal || !this._opsExpertStatsCache) return;
        const cache = this._opsTeamSearchMemberCache;
        if (!cache) return;

        const memberIds = this._getVisibleTeamMemberIds(modal, cache);
        const hasStats = Context.opsTab.hasExpertStatsCredentials();
        const toFetch = memberIds.filter((id) => {
            const entry = this._opsExpertStatsCache.get(id);
            if (!entry) return true;
            if (entry.loading) return false;
            if (entry.creator || entry.qa) return false;
            if (entry.error === 'missing-credentials') return hasStats;
            return !entry.error;
        });
        if (toFetch.length === 0) return;

        if (!hasStats) {
            for (const id of toFetch) {
                this._opsExpertStatsCache.set(id, { error: 'missing-credentials' });
                this._patchOpsTeamMemberCard(modal, id);
            }
            return;
        }

        const gen = ++this._opsExpertStatsHydrateGen;
        for (const id of toFetch) {
            this._opsExpertStatsCache.set(id, { loading: true });
            this._patchOpsTeamMemberCard(modal, id);
        }

        let cursor = 0;
        const worker = async () => {
            while (cursor < toFetch.length) {
                if (gen !== this._opsExpertStatsHydrateGen) return;
                const id = toFetch[cursor++];
                try {
                    const [creator, qa] = await Promise.all([
                        hasStats ? Context.opsTab.fetchExpertStats(id, false) : Promise.resolve(null),
                        hasStats ? Context.opsTab.fetchExpertStats(id, true) : Promise.resolve(null)
                    ]);
                    if (gen !== this._opsExpertStatsHydrateGen) return;
                    this._opsExpertStatsCache.set(id, { creator, qa });
                    Logger.debug('expert card data loaded for ' + id.slice(0, 8) + '…');
                } catch (e) {
                    if (gen !== this._opsExpertStatsHydrateGen) return;
                    Logger.warn('expert card data failed for ' + id.slice(0, 8) + '…', e);
                    this._opsExpertStatsCache.set(id, { error: e.message || String(e) });
                }
                this._patchOpsTeamMemberCard(modal, id);
            }
        };

        const poolSize = Math.min(TEAM_MEMBERS_EXPERT_STATS_HYDRATE_CONCURRENCY, toFetch.length);
        await Promise.all(Array.from({ length: poolSize }, () => worker()));

        if (this._opsTeamActiveFilters && this._opsTeamActiveFilters.numericFilters
            && this._opsTeamActiveFilters.numericFilters.length > 0) {
            this._filterOpsTeamSearchCards(modal);
        }
    },

    _populateOpsTeamMemberConstraintLists(allTeams, options) {
        const dash = Context.dashboard;
        if (!dash || typeof dash.renderTeamMemberConstraintLists !== 'function') return;
        const opts = options || {};
        const modal = opts.modal || null;
        if (opts.loading) {
            dash.renderTeamMemberConstraintLists({ loading: true, preserveSelections: false, modal });
            return;
        }
        const teamItems = (allTeams || [])
            .map(([, label]) => ({ id: label, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
        const permItems = TEAM_MEMBERS_ALL_PERMISSIONS.map(([id, label]) => ({ id, label }));
        dash.renderTeamMemberConstraintLists({
            loading: false,
            teamItems,
            permItems,
            preserveSelections: opts.preserveSelections !== false,
            modal
        });
    },

    _indexOpsTeamMemberFiltersFromResults(memberMap, options) {
        const dash = Context.dashboard;
        if (!dash || typeof dash.renderTeamMemberConstraintLists !== 'function') return;
        const opts = options || {};
        const modal = opts.modal || null;
        const teamLabels = new Set();
        const permKeys = new Set();
        if (memberMap) {
            for (const member of memberMap.values()) {
                const labels = member.teamLabels;
                if (labels) {
                    for (const label of labels) teamLabels.add(label);
                }
                for (const key of this._opsMemberPermissionKeys(member)) permKeys.add(key);
            }
        }
        const teamItems = [...teamLabels].sort((a, b) => a.localeCompare(b))
            .map((label) => ({ id: label, label }));
        const permItems = [...permKeys].sort((a, b) => a.localeCompare(b))
            .map((key) => ({ id: key, label: TEAM_MEMBERS_PERMISSION_LABEL_BY_KEY[key] || key }));
        dash.renderTeamMemberConstraintLists({
            loading: false,
            teamItems,
            permItems,
            preserveSelections: opts.preserveSelections !== false,
            modal
        });
        Logger.debug('team member filters indexed — ' + teamItems.length + ' teams, ' + permItems.length + ' permissions');
    },

    _getOpsInvokerPermissionKeys() {
        const userId = Context.opsTab.getCurrentUserId();
        const cache = this._opsTeamSearchMemberCache;
        if (!userId || !cache || !cache.memberMap) return [];
        const invoker = cache.memberMap.get(userId);
        return invoker ? this._opsMemberPermissionKeys(invoker) : [];
    },

    _renderOpsTeamSearchActionRefreshBannerHtml() {
        this._ensureOpsAlertBannerStyles();
        const ab = this._opsAlertBannerClasses();
        return [
            '<div id="wf-ops-team-search-action-refresh-banner" class="' + ab.root + ' ' + ab.danger + '">',
            '<div style="display: flex; align-items: flex-start; margin-bottom: 10px;">',
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 10px; color: #dc2626; flex-shrink: 0; margin-top: 2px;">',
            '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>',
            '<line x1="12" y1="9" x2="12" y2="13"></line>',
            '<line x1="12" y1="17" x2="12.01" y2="17"></line>',
            '</svg>',
            '<div style="flex: 1;">',
            '<h3 class="' + ab.title + '" style="font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">Team Search Unavailable</h3>',
            '<p class="' + ab.body + '" style="font-size: 13px; margin: 0; line-height: 1.5;">',
            'Team search credentials are missing or out of date after a Fleet update. ',
            'Click <strong>Refresh credentials</strong> to open the Team page in a new tab — ',
            'credentials refresh automatically and the tab closes on its own.',
            '</p>',
            '<p id="wf-ops-team-search-stale-retry-status" class="' + ab.body + '" style="display: none; font-size: 12px; margin: 8px 0 0 0; line-height: 1.45;"></p>',
            '</div>',
            '</div>',
            '<div class="' + ab.footer + '">',
            '<button type="button" id="wf-ops-team-search-open-team" class="' + ab.btnSecondary + '">Refresh credentials</button>',
            '<button type="button" id="wf-ops-team-search-retry-btn" class="' + ab.btnPrimary + '">Retry search</button>',
            '</div>',
            '</div>'
        ].join('');
    },

    _setOpsTeamSearchStaleRetryStatus(modal, message) {
        const banner = this._opsQuery(modal, '#wf-ops-team-search-action-refresh-banner', 'teamSearchStaleRetryStatus');
        if (!banner) return;
        const statusEl = banner.querySelector('#wf-ops-team-search-stale-retry-status');
        if (!statusEl) return;
        if (message) {
            statusEl.textContent = message;
            statusEl.style.display = 'block';
        } else {
            statusEl.textContent = '';
            statusEl.style.display = 'none';
        }
    },

    _clearOpsTeamSearchStaleBanner(modal) {
        const cards = this._opsQuery(modal, '#wf-ops-team-search-cards', 'teamSearchStaleClear');
        const placeholder = this._opsQuery(modal, '#wf-ops-team-search-status-placeholder', 'teamSearchStalePlaceholderRestore');
        if (cards) cards.innerHTML = '';
        if (placeholder) placeholder.style.display = '';
    },

    _showOpsTeamSearchActionRefreshBanner(modal) {
        const outputWrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchStaleBanner');
        const filterWrap = this._opsQuery(modal, '#wf-ops-team-filter-wrap', 'teamFilterWrapStaleHide');
        const placeholder = this._opsQuery(modal, '#wf-ops-team-search-status-placeholder', 'teamSearchStalePlaceholder');
        if (filterWrap) filterWrap.style.display = 'none';
        if (placeholder) placeholder.style.display = 'none';
        if (outputWrap) {
            outputWrap.style.display = 'block';
            let cards = this._opsQuery(modal, '#wf-ops-team-search-cards', 'teamSearchStaleCards');
            if (!cards) {
                cards = document.createElement('div');
                cards.id = 'wf-ops-team-search-cards';
                outputWrap.innerHTML = '';
                outputWrap.appendChild(cards);
            }
            cards.innerHTML = this._renderOpsTeamSearchActionRefreshBannerHtml();
            const self = this;
            const openTeamBtn = cards.querySelector('#wf-ops-team-search-open-team');
            if (openTeamBtn) {
                openTeamBtn.addEventListener('click', () => {
                    Context.opsTab.openTeamPageForCredRefresh(modal);
                });
            }
            const retryBtn = cards.querySelector('#wf-ops-team-search-retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    void self._handleOpsTeamSearchCredentialRetry(modal);
                });
            }
        } else {
            this._setOpsTeamSearchStatus(
                modal,
                'Team search credentials are missing or out of date. Open the Team page in Fleet, then retry.',
                true,
                false,
                false
            );
            Logger.warn('team search refresh banner fallback — output wrap missing');
            Logger.info('team search refresh banner shown — open Team page then retry');
            return;
        }
        this._setOpsTeamSearchStatus(modal, '', false, false, false);
        Logger.info('team search refresh banner shown — open Team page then retry');
    },

    _opsTeamSearchLikelyStaleEmptyResults(query, memberMap, allTeams) {
        if (!allTeams || allTeams.length === 0) return false;
        if (memberMap && memberMap.size > 0) return false;
        const q = String(query || '').trim();
        return q === '';
    },

    async _handleOpsTeamSearchCredentialRetry(modal) {
        this._setOpsTeamSearchStaleRetryStatus(modal, '');
        const hasSearchAction = Context.opsTab.reloadTeamDashboardActionsFromStorage();
        if (!hasSearchAction) {
            this._setOpsTeamSearchStaleRetryStatus(modal,
                'Credentials not ready yet — wait for the Team page to finish loading, then retry.');
            Logger.debug('team search credential retry — no action in storage yet');
            return;
        }
        Logger.log('team search credentials reloaded from storage — retrying search');
        await this._handleOpsTeamSearch(modal);
    },

    _abortOpsTeamSearchInFlight(reason) {
        if (this._opsTeamSearchAbortController) {
            this._opsTeamSearchAbortController.abort();
            this._opsTeamSearchAbortController = null;
            Logger.debug('team search in-flight requests aborted — ' + reason);
        }
    },

    _isOpsTeamSearchAbortError(err) {
        return !!(err && (err.name === 'AbortError' || err.code === 20));
    },

    _mergeOpsTeamSearchMembers(memberMap, members, teamLabel) {
        if (!members || !members.length) return;
        for (const member of members) {
            if (!memberMap.has(member.id)) {
                memberMap.set(member.id, { ...member, teamLabels: new Set() });
            }
            memberMap.get(member.id).teamLabels.add(teamLabel);
        }
    },

    _getOpsPermissionDisplayLabel(permKey) {
        return TEAM_MEMBERS_PERMISSION_LABEL_BY_KEY[permKey] || String(permKey || '').replace(/_/g, ' ');
    },

    _opsMemberPermissionKeys(member) {
        return Array.isArray(member.permissions) ? member.permissions : [];
    },

    _opsMemberKnownPermissionCount(member) {
        const keys = new Set(this._opsMemberPermissionKeys(member));
        return TEAM_MEMBERS_ALL_PERMISSIONS.reduce((count, [key]) => count + (keys.has(key) ? 1 : 0), 0);
    },

    _setOpsTeamSearchStatus(modal, message, isError, isHtml, showClear) {
        const row = this._opsQuery(modal, '#wf-ops-team-search-status-row', 'teamSearchStatusRow');
        const status = this._opsQuery(modal, '#wf-ops-team-search-status', 'teamSearchStatus');
        const clearBtn = this._opsQuery(modal, '#wf-ops-team-search-clear-btn', 'teamSearchClearBtn');
        const expandAllBtn = this._opsQuery(modal, '#wf-ops-team-expand-all-btn', 'teamSearchExpandAllBtn');
        const placeholder = this._opsQuery(modal, '#wf-ops-team-search-status-placeholder', 'teamSearchStatusPlaceholder');
        if (!status) return;
        if (!message) {
            if (row) row.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'none';
            if (expandAllBtn) expandAllBtn.style.display = 'none';
            if (placeholder) placeholder.style.display = '';
            return;
        }
        if (row) row.style.display = 'flex';
        if (placeholder) placeholder.style.display = 'none';
        status.style.color = isError ? '#dc2626' : 'var(--muted-foreground, #666)';
        if (isHtml) { status.innerHTML = message; } else { status.textContent = message; }
        if (clearBtn) clearBtn.style.display = showClear ? 'inline-block' : 'none';
        if (expandAllBtn) expandAllBtn.style.display = showClear ? 'inline-block' : 'none';
    },

    _syncOpsExpandAllBtn(modal) {
        const btn = this._opsQuery(modal, '#wf-ops-team-expand-all-btn', 'teamSearchExpandAllBtnSync');
        if (!btn || btn.style.display === 'none') return;
        const cards = this._opsQuery(modal, '#wf-ops-team-search-cards', 'teamSearchExpandAllCards');
        if (!cards) return;
        const details = cards.querySelectorAll('.wf-ops-member-details');
        const anyOpen = Array.from(details).some((d) => d.open);
        btn.textContent = anyOpen ? 'Collapse All' : 'Expand All';
    },

    _clearOpsTeamSearchResults(modal) {
        this._abortOpsTeamSearchInFlight('results cleared');
        this._opsTeamSearchActive = null;
        this._opsTeamSearchMemberCache = null;
        this._opsTeamActiveFilters = null;
        this._opsMemberDetailsOpenIds = null;
        this._opsFellowsSearchComplete = null;
        this._opsExpertStatsHydrateGen++;
        if (this._opsExpertStatsCache) this._opsExpertStatsCache.clear();
        this._clearOpsMemberEditState();
        this._setOpsTeamSearchStatus(modal, '', false, false, false);

        const filterWrap = this._opsQuery(modal, '#wf-ops-team-filter-wrap', 'teamFilterWrapClear');
        const outputWrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchOutputClear');
        const btn = this._opsQuery(modal, '#wf-ops-team-search-btn', 'teamSearchBtnClear');

        if (filterWrap) filterWrap.style.display = 'none';
        if (Context.dashboard && typeof Context.dashboard.resetTeamMemberFilters === 'function') {
            Context.dashboard.resetTeamMemberFilters(modal);
        } else if (Context.dashboard && typeof Context.dashboard.resetTeamMemberMsDropdowns === 'function') {
            Context.dashboard.resetTeamMemberMsDropdowns(modal);
        }
        if (outputWrap) {
            outputWrap.style.display = 'none';
            const cards = this._opsQuery(modal, '#wf-ops-team-search-cards', 'teamSearchCardsClear');
            if (cards) cards.innerHTML = '';
        }
        const placeholder = this._opsQuery(modal, '#wf-ops-team-search-status-placeholder', 'teamSearchPlaceholderClear');
        if (placeholder) placeholder.style.display = '';
        if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
        Context.opsTab.captureState(modal);
        Logger.log('team search results cleared');
    },

    _getOpsTeamMemberTeamConstraints() {
        const dash = Context.dashboard;
        if (dash && typeof dash.readTeamMemberConstraints === 'function') {
            return dash.readTeamMemberConstraints('team-members-teams');
        }
        return { include: new Set(), exclude: new Set() };
    },

    _getOpsTeamMemberPermConstraints() {
        const dash = Context.dashboard;
        if (dash && typeof dash.readTeamMemberConstraints === 'function') {
            return dash.readTeamMemberConstraints('team-members-permissions');
        }
        return { include: new Set(), exclude: new Set() };
    },

    _opsMemberMatchesTeamConstraints(member, constraints) {
        const include = constraints && constraints.include ? constraints.include : new Set();
        const exclude = constraints && constraints.exclude ? constraints.exclude : new Set();
        const teamLabels = member.teamLabels || new Set();
        if (include.size > 0) {
            let matched = false;
            for (const label of include) {
                if (teamLabels.has(label)) {
                    matched = true;
                    break;
                }
            }
            if (!matched) return false;
        }
        for (const label of exclude) {
            if (teamLabels.has(label)) return false;
        }
        return true;
    },

    _opsMemberMatchesPermConstraints(member, constraints) {
        const include = constraints && constraints.include ? constraints.include : new Set();
        const exclude = constraints && constraints.exclude ? constraints.exclude : new Set();
        const memberPerms = new Set(this._opsMemberPermissionKeys(member));
        if (include.size > 0) {
            let matched = false;
            for (const key of include) {
                if (memberPerms.has(key)) {
                    matched = true;
                    break;
                }
            }
            if (!matched) return false;
        }
        for (const key of exclude) {
            if (memberPerms.has(key)) return false;
        }
        return true;
    },

    _opsMemberHasActiveConstraints(constraints) {
        if (!constraints) return false;
        return (constraints.include && constraints.include.size > 0)
            || (constraints.exclude && constraints.exclude.size > 0);
    },

    _opsTeamSearchHasActiveFilters() {
        const active = this._opsTeamActiveFilters;
        if (active && active.numericFilters && active.numericFilters.length > 0) return true;
        const tc = this._getOpsTeamMemberTeamConstraints();
        const pc = this._getOpsTeamMemberPermConstraints();
        const bc = this._getOpsTeamMemberBadgeConstraints();
        return (tc.include.size > 0 || tc.exclude.size > 0 || pc.include.size > 0 || pc.exclude.size > 0
            || bc.size > 0);
    },

    _opsTeamMemberNumericFieldValue(memberId, field) {
        const entry = this._opsExpertStatsCache && this._opsExpertStatsCache.get(memberId);
        if (!entry || entry.loading || entry.error) return null;
        if (!entry.creator && !entry.qa) return null;
        switch (field) {
            case 'tasks_submitted':
                return entry.creator && entry.creator.totalSubmissions != null
                    ? Number(entry.creator.totalSubmissions) : null;
            case 'tasks_reviewed': {
                if (!entry.qa) return null;
                const reviews = entry.qa.reviewsCompleted ?? entry.qa.totalReviews
                    ?? entry.qa.tasksReviewed ?? entry.qa.tasksCompleted;
                return reviews != null ? Number(reviews) : null;
            }
            case 'submission_ar':
                return entry.creator && entry.creator.acceptanceRate != null
                    ? Number(entry.creator.acceptanceRate) : null;
            case 'qa_ar':
                return this._opsExpertQaAcceptanceRatePercent(entry.qa);
            case 'avg_writing_time':
                return entry.creator && entry.creator.avgCreationTimeSeconds != null
                    ? Number(entry.creator.avgCreationTimeSeconds) / 60 : null;
            case 'avg_qa_time': {
                if (!entry.qa) return null;
                const avgSec = entry.qa.avgReviewTimeSeconds ?? entry.qa.avgQaTimeSeconds
                    ?? entry.qa.avgTimePerQaSeconds ?? entry.qa.avgReviewDurationSeconds;
                return avgSec != null ? Number(avgSec) / 60 : null;
            }
            default:
                return null;
        }
    },

    _opsEvaluateNumericComparison(actual, comparator, expected) {
        if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
        switch (comparator) {
            case 'gt': return actual > expected;
            case 'gte': return actual >= expected;
            case 'lt': return actual < expected;
            case 'lte': return actual <= expected;
            case 'eq': return actual === expected;
            case 'neq': return actual !== expected;
            default: return true;
        }
    },

    _opsMemberMatchesNumericFilters(member, rows, andOr) {
        if (!rows || rows.length === 0) return true;
        const results = rows.map((row) => {
            const actual = this._opsTeamMemberNumericFieldValue(member.id, row.field);
            if (actual == null || !Number.isFinite(actual)) return null;
            return this._opsEvaluateNumericComparison(actual, row.comparator, row.value);
        });
        if (results.some((r) => r === null)) return true;
        if (andOr === 'or') return results.some((r) => r === true);
        return results.every((r) => r === true);
    },

    _opsCountTeamMembersPendingNumericStats(members, numericRows) {
        if (!numericRows || numericRows.length === 0 || !members || !members.length) return 0;
        let pending = 0;
        for (const member of members) {
            let needsStats = false;
            for (const row of numericRows) {
                const actual = this._opsTeamMemberNumericFieldValue(member.id, row.field);
                if (actual == null || !Number.isFinite(actual)) {
                    needsStats = true;
                    break;
                }
            }
            if (needsStats) pending++;
        }
        return pending;
    },

    _applyOpsTeamFilters(modal) {
        const cache = this._opsTeamSearchMemberCache;
        if (!cache) {
            Logger.warn('team filters apply skipped — no search cache');
            return;
        }
        const dash = Context.dashboard;
        if (dash && typeof dash.logApiClick === 'function') {
            dash.logApiClick('team-filters-apply');
        }
        const numeric = dash && typeof dash.readTeamMembersNumericFilters === 'function'
            ? dash.readTeamMembersNumericFilters(modal)
            : { rows: [], andOr: 'and' };
        const teamC = this._getOpsTeamMemberTeamConstraints();
        const permC = this._getOpsTeamMemberPermConstraints();
        this._opsTeamActiveFilters = {
            numericFilters: numeric.rows || [],
            andOr: numeric.andOr || 'and',
            teamConstraints: teamC,
            permConstraints: permC
        };
        if (dash && typeof dash.resetTeamMembersPage === 'function') dash.resetTeamMembersPage();
        this._renderOpsTeamSearchCards(modal, cache.memberMap, cache.allTeams, 0);
        void this._hydrateOpsTeamMemberStatsForVisible(modal);
        Logger.log('team filters applied — '
            + this._opsTeamActiveFilters.numericFilters.length + ' numeric, mode '
            + this._opsTeamActiveFilters.andOr
            + ', team constraints ' + (teamC.include.size + teamC.exclude.size)
            + ', perm constraints ' + (permC.include.size + permC.exclude.size));
    },

    _opsMemberQualifiesForUiBadge(member) {
        const teamLabels = member.teamLabels;
        if (!teamLabels || teamLabels.size === 0) return false;
        if (teamLabels.has(TEAM_MEMBERS_FLEET_FELLOWS_LABEL)) return false;
        for (const label of teamLabels) {
            if (!TEAM_MEMBERS_UI_BADGE_EXCLUDED_LABELS.has(label)) return true;
        }
        return false;
    },

    _opsMemberEmailDomainHasFleet(member) {
        const email = String(member && member.email || '');
        const at = email.lastIndexOf('@');
        if (at < 0) return false;
        return email.slice(at + 1).toLowerCase().includes('fleet');
    },

    _opsMemberBadgeCategory(member) {
        // Fleet-domain emails always get MTS, regardless of team labels.
        if (this._opsMemberEmailDomainHasFleet(member)) return 'mts';
        const teamLabels = member.teamLabels || new Set();
        if (teamLabels.has(TEAM_MEMBERS_FLEET_FELLOWS_LABEL)) return 'fellows';
        for (const label of teamLabels) {
            if (TEAM_MEMBERS_EPIC_LABELS.has(label)) return 'epic';
        }
        if (teamLabels.size === 1 && teamLabels.has(TEAM_MEMBERS_VERTICALS_ONLY_LABEL)) return 'verticals';
        if (this._opsMemberQualifiesForUiBadge(member)) return 'ui';
        return 'fellows';
    },

    _opsMemberBadgeHtml(category) {
        const styles = {
            mts: 'background:var(--foreground, #0f172a);color:var(--background, #fff);',
            ui: 'background:var(--brand,#4f46e5);color:#fff;',
            verticals: 'background:#0d9488;color:#fff;',
            epic: 'background:#7c3aed;color:#fff;',
            fellows: 'background:#64748b;color:#fff;'
        };
        const labels = {
            mts: 'MTS',
            ui: 'UI',
            verticals: 'VERTICALS',
            epic: 'EPIC',
            fellows: 'FELLOWS'
        };
        const key = labels[category] ? category : 'fellows';
        return '<span style="display:inline-block;font-size:9px;font-weight:700;letter-spacing:0.04em;padding:1px 5px;border-radius:3px;'
            + (styles[key] || styles.fellows)
            + 'line-height:1.4;flex-shrink:0;">'
            + labels[key] + '</span>';
    },

    _getOpsTeamMemberBadgeConstraints() {
        const dash = Context.dashboard;
        if (dash && typeof dash.selectedMsValues === 'function') {
            return new Set(dash.selectedMsValues('team-members-badges'));
        }
        return new Set();
    },

    _opsMemberMatchesBadgeConstraints(member, selectedBadges) {
        const selected = selectedBadges || new Set();
        if (selected.size === 0) return true;
        return selected.has(this._opsMemberBadgeCategory(member));
    },

    _opsMemberEditStateMap() {
        if (!(this._opsMemberEditState instanceof Map)) {
            this._opsMemberEditState = new Map();
        }
        return this._opsMemberEditState;
    },

    _clearOpsMemberEditState() {
        this._opsMemberEditState = new Map();
    },

    _opsCloneStringSet(setOrArray) {
        if (setOrArray instanceof Set) return new Set(setOrArray);
        if (Array.isArray(setOrArray)) return new Set(setOrArray);
        return new Set();
    },

    _opsSetsEqual(a, b) {
        if (!a || !b || a.size !== b.size) return false;
        for (const value of a) {
            if (!b.has(value)) return false;
        }
        return true;
    },

    _getOpsMemberEditSession(memberId) {
        return this._opsMemberEditStateMap().get(memberId) || null;
    },

    _startOpsMemberEdit(member) {
        const memberId = member.id;
        const session = {
            editing: true,
            email: member.email || '',
            baselineTeams: this._opsCloneStringSet(member.teamLabels),
            baselinePerms: this._opsCloneStringSet(this._opsMemberPermissionKeys(member)),
            stagedTeams: this._opsCloneStringSet(member.teamLabels),
            stagedPerms: this._opsCloneStringSet(this._opsMemberPermissionKeys(member)),
            applying: false
        };
        this._opsMemberEditStateMap().set(memberId, session);
        Logger.log('member edit started for ' + (member.email || memberId));
        return session;
    },

    _cancelOpsMemberEdit(memberId) {
        if (this._opsMemberEditStateMap().has(memberId)) {
            this._opsMemberEditStateMap().delete(memberId);
            Logger.log('member edit cancelled for ' + memberId);
        }
    },

    _opsMemberEditHasChanges(session) {
        if (!session) return false;
        return !this._opsSetsEqual(session.baselineTeams, session.stagedTeams) ||
            !this._opsSetsEqual(session.baselinePerms, session.stagedPerms);
    },

    _toggleOpsMemberEditTeam(session, label) {
        if (!session || !label) return;
        if (session.stagedTeams.has(label)) {
            session.stagedTeams.delete(label);
        } else {
            session.stagedTeams.add(label);
        }
    },

    _toggleOpsMemberEditPermission(session, permKey) {
        if (!session) return;
        if (session.stagedPerms.has(permKey)) {
            session.stagedPerms.delete(permKey);
        } else {
            session.stagedPerms.add(permKey);
        }
    },

    _captureOpsOpenMemberDetails(modal) {
        const openIds = new Set();
        const wrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchOpenCapture');
        if (!wrap) return openIds;
        wrap.querySelectorAll('.wf-ops-member-details[open][data-member-id]').forEach((el) => {
            const id = el.getAttribute('data-member-id');
            if (id) openIds.add(id);
        });
        return openIds;
    },

    _getOpsMemberFromCache(memberId) {
        const cache = this._opsTeamSearchMemberCache;
        if (!cache || !cache.memberMap) return null;
        return cache.memberMap.get(memberId) || null;
    },

    _updateOpsMemberTileDom(modal, memberId, forceOpen) {
        const cache = this._opsTeamSearchMemberCache;
        const member = this._getOpsMemberFromCache(memberId);
        if (!cache || !member) return;

        const wrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchTileUpdate');
        if (!wrap) return;

        const attrId = this._opsEscapeAttr(memberId);
        const tileEl = wrap.querySelector('[data-ops-member-tile="' + attrId + '"]');
        const detailsEl = tileEl ? tileEl.querySelector('.wf-ops-member-details') : null;
        const wasOpen = forceOpen === true || (detailsEl && detailsEl.open);
        const html = this._renderOpsTeamMemberTileHtml(member, cache.allTeams, wasOpen);

        if (tileEl) {
            tileEl.outerHTML = html;
        }
    },

    async _applyOpsMemberEditChanges(modal, memberId) {
        const session = this._getOpsMemberEditSession(memberId);
        const member = this._getOpsMemberFromCache(memberId);
        const cache = this._opsTeamSearchMemberCache;
        if (!session || !member || !cache || session.applying) return;
        if (!this._opsMemberEditHasChanges(session)) return;

        const teamAdds = [...session.stagedTeams].filter((label) => !session.baselineTeams.has(label));
        const teamRemovals = [...session.baselineTeams].filter((label) => !session.stagedTeams.has(label));
        const permAdds = [...session.stagedPerms].filter((key) => !session.baselinePerms.has(key));
        const permRemovals = [...session.baselinePerms].filter((key) => !session.stagedPerms.has(key));

        if (teamAdds.length && !Context.opsTab.hasTeamAddMemberCredentials()) {
            this._setOpsTeamSearchStatus(modal,
                'Cannot add to team: add-member credentials missing. Open ' +
                '<a href="' + this._opsEscapeAttr(Context.opsTab.getTeamDashboardUrl()) + '" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">' +
                'Fleet /dashboard/team</a> and add a member once, then retry.',
                true, true, true);
            return;
        }

        const addMemberPerms = [...session.stagedPerms];
        if (!addMemberPerms.length) {
            addMemberPerms.push(...this._getOpsInvokerPermissionKeys());
        }

        session.applying = true;
        this._updateOpsMemberTileDom(modal, memberId, true);

        try {
            for (const label of teamAdds) {
                const teamId = Context.opsTab.getTeamUuidByLabel(label);
                if (!teamId) throw new Error('No team UUID for "' + label + '"');
                await Context.opsTab.addMemberToTeam(teamId, session.email, addMemberPerms);
            }
            for (const label of teamRemovals) {
                const teamId = Context.opsTab.getTeamUuidByLabel(label);
                if (!teamId) throw new Error('No team UUID for "' + label + '"');
                await Context.opsTab.removeMemberFromTeam(teamId, session.email);
            }
            const permAddsToApply = teamAdds.length
                ? permAdds.filter((key) => !addMemberPerms.includes(key))
                : permAdds;
            for (const permKey of permAddsToApply) {
                await Context.opsTab.modifyMemberPermission(memberId, permKey, 'add');
            }
            for (const permKey of permRemovals) {
                await Context.opsTab.modifyMemberPermission(memberId, permKey, 'remove');
            }

            member.teamLabels = this._opsCloneStringSet(session.stagedTeams);
            member.permissions = [...session.stagedPerms];
            this._cancelOpsMemberEdit(memberId);

            Logger.log('member edit applied for ' + session.email +
                ' (teams +' + teamAdds.length + ' -' + teamRemovals.length +
                ', perms +' + permAddsToApply.length + ' -' + permRemovals.length + ')');

            const openIds = this._captureOpsOpenMemberDetails(modal);
            openIds.add(memberId);
            this._renderOpsTeamSearchCards(modal, cache.memberMap, cache.allTeams, 0, openIds);
        } catch (e) {
            session.applying = false;
            Logger.error('member edit failed for ' + memberId, e);
            this._setOpsTeamSearchStatus(modal,
                'Failed to apply changes: ' + (e && e.message ? e.message : String(e)), true, false, true);
            this._updateOpsMemberTileDom(modal, memberId, true);
        }
    },

    _handleOpsMemberEditClick(e, modal) {
        const actionEl = e.target.closest('[data-ops-action][data-ops-member-id]');
        if (!actionEl || !modal.contains(actionEl)) return;
        if (!actionEl.closest('#wf-ops-team-search-output-wrap')) return;

        e.preventDefault();
        e.stopPropagation();

        const memberId = actionEl.getAttribute('data-ops-member-id');
        const action = actionEl.getAttribute('data-ops-action');
        if (!memberId || !action) return;

        if (action === 'expert-stats-cred-refresh') {
            Context.opsTab.openExpertProfileForCredRefresh(modal, memberId);
            return;
        }

        const member = this._getOpsMemberFromCache(memberId);
        if (!member) {
            Logger.warn('member edit action skipped — member not in cache');
            return;
        }

        if (action === 'search-worker-output') {
            this._openMemberInWorkerSearch(member);
            return;
        }

        if (action === 'edit') {
            this._startOpsMemberEdit(member);
            this._updateOpsMemberTileDom(modal, memberId, true);
            return;
        }

        const session = this._getOpsMemberEditSession(memberId);
        if (!session) return;

        if (action === 'cancel') {
            if (session.applying) return;
            this._cancelOpsMemberEdit(memberId);
            this._updateOpsMemberTileDom(modal, memberId, true);
            return;
        }

        if (action === 'confirm') {
            if (session.applying || !this._opsMemberEditHasChanges(session)) return;
            void this._applyOpsMemberEditChanges(modal, memberId);
            return;
        }

        if (session.applying) return;

        if (action === 'toggle-team') {
            const label = actionEl.getAttribute('data-ops-team-label');
            if (!label) return;
            this._toggleOpsMemberEditTeam(session, label);
            this._updateOpsMemberTileDom(modal, memberId, true);
            return;
        }

        if (action === 'toggle-perm') {
            const permKey = actionEl.getAttribute('data-ops-perm-key');
            if (!permKey) return;
            this._toggleOpsMemberEditPermission(session, permKey);
            this._updateOpsMemberTileDom(modal, memberId, true);
        }
    },

    _renderOpsMemberEditActionsHtml(memberId, session) {
        const attrId = this._opsEscapeAttr(memberId);
        if (session && session.editing) {
            const hasChanges = this._opsMemberEditHasChanges(session);
            const confirmDisabled = !hasChanges || session.applying;
            return '<span class="wf-ops-member-edit-actions" style="gap:6px;flex-shrink:0;margin-left:8px;align-items:center;">' +
                '<button type="button" class="' + this._opsDashBtnClass('success', 'compact') + '" data-ops-member-id="' + attrId + '" data-ops-action="confirm"' +
                    (confirmDisabled ? ' disabled' : '') + '>Confirm</button>' +
                '<button type="button" class="' + this._opsDashBtnClass('danger', 'compact') + '" data-ops-member-id="' + attrId + '" data-ops-action="cancel"' +
                    (session.applying ? ' disabled' : '') + '>Cancel</button>' +
                '</span>';
        }
        return '<span class="wf-ops-member-edit-actions" style="flex-shrink:0;margin-left:8px;align-items:center;">' +
            '<button type="button" class="' + this._opsDashBtnClass('warning', 'compact') + '" data-ops-member-id="' + attrId + '" data-ops-action="edit">Edit</button>' +
            '</span>';
    },

    _opsProfileLinkHtml(profileUrl, title) {
        const url = String(profileUrl || '').trim();
        if (!url) return '';
        const label = title || 'Open profile in Fleet';
        const icon = (Context.uiLib && Context.uiLib.externalLinkIconSvg)
            ? Context.uiLib.externalLinkIconSvg()
            : '';
        return '<a href="' + this._opsEscapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="wf-ops-profile-link-btn ' + this._opsDashBtnClass('basic', 'icon') + '" ' +
            'title="' + this._opsEscapeHtml(label) + '" aria-label="' + this._opsEscapeHtml(label) + '">' +
            icon + '</a>';
    },

    _opsSearchWorkerOutputBtnHtml(memberId) {
        const attrId = this._opsEscapeAttr(memberId);
        const icon = (Context.uiLib && Context.uiLib.eyeIconSvg)
            ? Context.uiLib.eyeIconSvg()
            : '';
        return '<button type="button" class="' + this._opsDashBtnClass('secondary', 'nav') + ' wf-ops-search-output-btn" data-ops-action="search-worker-output" data-ops-member-id="' + attrId + '" ' +
            'style="flex-shrink:0;white-space:nowrap;gap:6px;">Search Worker Output' + icon + '</button>';
    },

    _opsMemberToAuthorPerson(member) {
        if (!member || !member.id) return null;
        return {
            id: member.id,
            full_name: member.full_name,
            email: member.email
        };
    },

    _openMemberInWorkerSearch(member) {
        const person = this._opsMemberToAuthorPerson(member);
        if (!person) {
            Logger.warn('Search Worker Output skipped — missing member id');
            return;
        }
        const dash = Context.dashboard;
        if (!dash || typeof dash.runContributorWorkerOutputDeepDive !== 'function') {
            Logger.warn('Search Worker Output skipped — dashboard deep dive unavailable');
            return;
        }
        Logger.log('Search Worker Output deep dive for ' + (person.full_name || person.id));
        void dash.runContributorWorkerOutputDeepDive(person, { activeTab: 'search-output' });
    },

    _renderOpsMemberTeamRowHtml(label, member, session) {
        const memberId = member.id || '';
        const attrId = this._opsEscapeAttr(memberId);
        const attrLabel = this._opsEscapeAttr(label);
        const editing = session && session.editing;
        const teamLabels = member.teamLabels || new Set();
        const inBaseline = editing ? session.baselineTeams.has(label) : teamLabels.has(label);
        const inStaged = editing ? session.stagedTeams.has(label) : inBaseline;

        if (editing) {
            if (!inBaseline) {
                const changed = inStaged;
                const stagedClass = changed ? ' wf-ops-staged-add' : '';
                const icon = changed ? '✅ ' : '<span style="opacity:0.35;">—</span> ';
                const color = changed ? 'var(--foreground,#333)' : 'var(--muted-foreground,#999)';
                return '<button type="button" class="wf-ops-edit-item-btn' + stagedClass + '" data-ops-action="toggle-team" data-ops-member-id="' +
                    attrId + '" data-ops-team-label="' + attrLabel + '" style="font-size:11px;color:' + color + ';">' +
                    icon + this._opsEscapeHtml(label) + '</button>';
            }
            const changed = inStaged !== inBaseline;
            const stagedClass = changed ? ' wf-ops-staged-remove' : '';
            const icon = changed ? '❌ ' : '✅ ';
            const color = 'var(--foreground,#333)';
            return '<button type="button" class="wf-ops-edit-item-btn' + stagedClass + '" data-ops-action="toggle-team" data-ops-member-id="' +
                attrId + '" data-ops-team-label="' + attrLabel + '" style="font-size:11px;color:' + color + ';">' +
                icon + this._opsEscapeHtml(label) + '</button>';
        }

        return '<div style="font-size:11px;padding:2px 0;color:' +
            (inBaseline ? 'var(--foreground,#333)' : 'var(--muted-foreground,#999)') + ';">' +
            (inBaseline ? '✅ ' : '<span style="opacity:0.35;">—</span> ') +
            this._opsEscapeHtml(label) + '</div>';
    },

    _renderOpsMemberPermRowHtml(permKey, permLabel, member, session) {
        const memberId = member.id || '';
        const attrId = this._opsEscapeAttr(memberId);
        const attrPerm = this._opsEscapeAttr(permKey);
        const editing = session && session.editing;
        const permissionKeys = new Set(this._opsMemberPermissionKeys(member));
        const inBaseline = editing ? session.baselinePerms.has(permKey) : permissionKeys.has(permKey);
        const inStaged = editing ? session.stagedPerms.has(permKey) : inBaseline;

        if (editing) {
            const changed = inStaged !== inBaseline;
            const stagedClass = changed ? (inStaged ? ' wf-ops-staged-add' : ' wf-ops-staged-remove') : '';
            let icon;
            if (changed) {
                icon = inStaged ? '✅ ' : '❌ ';
            } else {
                icon = inStaged ? '✅ ' : '<span style="opacity:0.35;">—</span> ';
            }
            const color = inStaged || changed ? 'var(--foreground,#333)' : 'var(--muted-foreground,#999)';
            return '<button type="button" class="wf-ops-edit-item-btn' + stagedClass + '" data-ops-action="toggle-perm" data-ops-member-id="' +
                attrId + '" data-ops-perm-key="' + attrPerm + '" style="font-size:11px;color:' + color + ';">' +
                icon + this._opsEscapeHtml(permLabel) + '</button>';
        }

        return '<div style="font-size:11px;padding:2px 0;color:' +
            (inBaseline ? 'var(--foreground,#333)' : 'var(--muted-foreground,#999)') + ';">' +
            (inBaseline ? '✅ ' : '<span style="opacity:0.35;">—</span> ') +
            this._opsEscapeHtml(permLabel) + '</div>';
    },

    _renderOpsTeamMemberPersonChipsHtml(member) {
        const dash = Context.dashboard;
        const memberId = String(member.id || '').trim();
        if (dash && typeof dash.personChipsHtml === 'function') {
            let html = dash.personChipsHtml(member.full_name, member.email, member.id, 'Open profile in Fleet');
            if (memberId && typeof dash.copyChipHtml === 'function') {
                html = html.replace(/(<a href)/, dash.copyChipHtml(memberId) + '$1');
            }
            return html;
        }
        const name = this._opsEscapeHtml(member.full_name || 'Unknown');
        const email = this._opsEscapeHtml(member.email || '');
        const profileUrl = Context.opsTab.getFleetOrigin() + '/dashboard/data/experts/' + encodeURIComponent(memberId);
        const idChip = memberId && dash && typeof dash.copyChipHtml === 'function'
            ? dash.copyChipHtml(memberId)
            : (memberId ? '<span style="font-size:11px;color:var(--muted-foreground,#666);">' + this._opsEscapeHtml(memberId) + '</span>' : '');
        return '<span style="display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;max-width:100%;min-width:0;">' +
            '<span style="font-size:13px;font-weight:600;color:var(--foreground,#333);">' + name + '</span>' +
            (email ? '<span style="font-size:11px;color:var(--muted-foreground,#666);">' + email + '</span>' : '') +
            idChip +
            this._opsProfileLinkHtml(profileUrl, 'Open profile in Fleet') +
        '</span>';
    },

    _renderOpsTeamMemberTileHtml(member, allTeams, isOpen, teamsSearchComplete = true) {
        const memberId = member.id || '';
        const personChipsHtml = this._renderOpsTeamMemberPersonChipsHtml(member);
        const teamLabels = member.teamLabels || new Set();
        const session = this._getOpsMemberEditSession(memberId);
        const displayTeamLabels = session ? session.stagedTeams : teamLabels;
        const displayPermKeys = session ? session.stagedPerms : new Set(this._opsMemberPermissionKeys(member));
        const knownPermCount = TEAM_MEMBERS_ALL_PERMISSIONS.reduce((count, [key]) => count + (displayPermKeys.has(key) ? 1 : 0), 0);
        const memberBadgeHtml = teamsSearchComplete
            ? this._opsMemberBadgeHtml(this._opsMemberBadgeCategory(member))
            : '';

        const teamsColHtml = allTeams.map(([, label]) =>
            this._renderOpsMemberTeamRowHtml(label, member, session)).join('');

        const permsColHtml = TEAM_MEMBERS_ALL_PERMISSIONS.map(([permKey, permLabel]) =>
            this._renderOpsMemberPermRowHtml(permKey, permLabel, member, session)).join('');

        const summaryLabel = 'Teams (' + displayTeamLabels.size + '/' + allTeams.length + ')  ·  Permissions (' +
            knownPermCount + '/' + TEAM_MEMBERS_ALL_PERMISSIONS.length + ')';

        const colHeader = (text) =>
            '<div style="font-size:10px;font-weight:600;color:var(--muted-foreground,#999);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">' +
            text + '</div>';

        const openAttr = isOpen !== false ? ' open' : '';

        return '<div data-ops-member-tile="' + this._opsEscapeAttr(memberId) + '" style="border:1px solid var(--border,#e5e5e5);border-radius:6px;padding:10px 12px;margin-bottom:8px;background:var(--card,#fafafa);">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
                '<div style="min-width:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1;">' +
                    memberBadgeHtml +
                    personChipsHtml +
                '</div>' +
                this._opsSearchWorkerOutputBtnHtml(memberId) +
            '</div>' +
            this._renderOpsTeamMemberStatsHtml(memberId) +
            '<details class="wf-ops-member-details" data-member-id="' + this._opsEscapeAttr(memberId) + '" style="margin-top:8px;"' + openAttr + '>' +
                '<summary style="font-size:11px;cursor:pointer;color:var(--muted-foreground,#666);list-style:none;user-select:none;display:flex;align-items:center;gap:8px;">' +
                    '<span style="min-width:0;flex:1;">▾ ' + this._opsEscapeHtml(summaryLabel) + '</span>' +
                    this._renderOpsMemberEditActionsHtml(memberId, session) +
                '</summary>' +
                '<div style="margin-top:6px;padding:6px 8px;background:var(--background,white);border:1px solid var(--border,#e5e5e5);border-radius:4px;' +
                    'display:grid;grid-template-columns:1fr 1fr;gap:0 16px;">' +
                    '<div>' + colHeader('Teams') + teamsColHtml + '</div>' +
                    '<div>' + colHeader('Permissions') + permsColHtml + '</div>' +
                '</div>' +
            '</details>' +
        '</div>';
    },

    _filterOpsTeamSearchCards(modal) {
        const cache = this._opsTeamSearchMemberCache;
        if (!cache) return;
        this._renderOpsTeamSearchCards(modal, cache.memberMap, cache.allTeams, 0);
        void this._hydrateOpsTeamMemberStatsForVisible(modal);
    },

    _renderOpsTeamSearchCards(modal, memberMap, allTeams, pendingCount, openMemberIds) {
        const wrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchCards');
        const cards = this._opsQuery(modal, '#wf-ops-team-search-cards', 'teamSearchCardsInner');
        if (!wrap || !cards) return;

        const totalCount = memberMap.size;
        let members = [...memberMap.values()];

        const active = this._opsTeamActiveFilters;
        const numericRows = active && active.numericFilters ? active.numericFilters : [];
        const andOr = active ? active.andOr : 'and';
        members = members.filter((m) => this._opsMemberMatchesNumericFilters(m, numericRows, andOr));

        const teamC = this._getOpsTeamMemberTeamConstraints();
        const permC = this._getOpsTeamMemberPermConstraints();
        const badgeC = this._getOpsTeamMemberBadgeConstraints();
        members = members.filter((m) => this._opsMemberMatchesTeamConstraints(m, teamC));
        members = members.filter((m) => this._opsMemberMatchesPermConstraints(m, permC));
        members = members.filter((m) => this._opsMemberMatchesBadgeConstraints(m, badgeC));

        let resolvedOpenIds;
        if (this._opsMemberDetailsOpenIds !== null) {
            resolvedOpenIds = this._opsMemberDetailsOpenIds;
        } else if (openMemberIds instanceof Set) {
            resolvedOpenIds = openMemberIds;
        } else if (pendingCount === 0 && members.length > 0) {
            resolvedOpenIds = new Set(members.map((m) => m.id));
        } else {
            resolvedOpenIds = this._captureOpsOpenMemberDetails(modal);
        }

        if (members.length === 0) {
            if (pendingCount > 0) {
                wrap.style.display = 'none';
            } else {
                wrap.style.display = 'block';
                let msg = 'No members found.';
                const hasNumericFilters = numericRows && numericRows.length > 0;
                const hasConstraintFilters = (teamC.include.size > 0 || teamC.exclude.size > 0
                    || permC.include.size > 0 || permC.exclude.size > 0 || badgeC.size > 0);
                if (hasNumericFilters || hasConstraintFilters) msg = 'No results match filters.';
                cards.innerHTML = '<div style="text-align:center;padding:12px 0;font-size:12px;color:var(--muted-foreground,#666);">' + this._opsEscapeHtml(msg) + '</div>';
            }
            const dashEmpty = Context.dashboard;
            if (dashEmpty && typeof dashEmpty.syncTeamMembersPagerUi === 'function') {
                dashEmpty.syncTeamMembersPagerUi(modal, 0, pendingCount === 0);
            }
            return;
        }

        members.sort((a, b) => {
            const diff = (b.teamLabels ? b.teamLabels.size : 0) - (a.teamLabels ? a.teamLabels.size : 0);
            return diff !== 0 ? diff : (a.full_name || '').localeCompare(b.full_name || '');
        });

        const totalFiltered = members.length;
        const dash = Context.dashboard;
        if (dash && typeof dash.syncTeamMembersPagerUi === 'function') {
            dash.syncTeamMembersPagerUi(modal, totalFiltered, pendingCount === 0);
        }
        if (dash && typeof dash.getTeamMembersPageSlice === 'function') {
            members = dash.getTeamMembersPageSlice(members);
        }

        wrap.style.display = 'block';
        const teamsSearchComplete = pendingCount === 0;
        cards.innerHTML = members.map((m) =>
            this._renderOpsTeamMemberTileHtml(m, allTeams, resolvedOpenIds.has(m.id), teamsSearchComplete)).join('');

        this._syncOpsExpandAllBtn(modal);

        if (pendingCount === 0) {
            if (this._opsTeamSearchHasActiveFilters()) {
                let statusMsg = members.length + ' of ' + totalCount + ' member'
                    + (totalCount !== 1 ? 's' : '') + ' match filters.';
                const pendingStats = this._opsCountTeamMembersPendingNumericStats(members, numericRows);
                if (pendingStats > 0) {
                    statusMsg += ' Stats still loading for ' + pendingStats + ' member'
                        + (pendingStats !== 1 ? 's' : '') + '; results will update.';
                }
                this._setOpsTeamSearchStatus(modal, statusMsg, false, false, true);
            } else if (totalCount > 0) {
                this._setOpsTeamSearchStatus(modal,
                    totalCount + ' unique member' + (totalCount !== 1 ? 's' : '')
                        + ' across ' + allTeams.length + ' teams.',
                    false, false, true);
            }
            void this._hydrateOpsTeamMemberStatsForVisible(modal);
        }
    },

    async _handleOpsTeamSearch(modal) {
        const input = this._opsQuery(modal, '#wf-ops-team-search-input', 'teamSearchInput');
        const btn = this._opsQuery(modal, '#wf-ops-team-search-btn', 'teamSearchBtn');
        const query = input ? input.value.trim() : '';
        const dashLog = Context.dashboard;

        const userId = Context.opsTab.getCurrentUserId();
        if (!userId) {
            if (dashLog && typeof dashLog.logApiSkip === 'function') dashLog.logApiSkip('team-search', 'no user id');
            this._setOpsTeamSearchStatus(modal, 'No user ID found. Open Fleet while logged in and try again.', true);
            return;
        }

        let allTeams = Context.opsTab.getUserTeamCatalog();
        if (!allTeams.length) {
            try {
                await Context.opsTab.fetchUserTeamCatalog(userId);
                allTeams = Context.opsTab.getUserTeamCatalog();
            } catch (e) {
                Logger.warn('team search — failed to load user team catalog', e);
                this._setOpsTeamSearchStatus(modal, 'Failed to load your teams: ' + (e.message || String(e)), true);
                return;
            }
        }
        if (!allTeams.length) {
            this._setOpsTeamSearchStatus(modal, 'No teams found for your account.', true);
            return;
        }

        Context.opsTab.reloadTeamDashboardActionsFromStorage();
        if (!Context.opsTab.hasTeamSearchCredentials()) {
            this._showOpsTeamSearchActionRefreshBanner(modal);
            return;
        }

        this._clearOpsTeamSearchStaleBanner(modal);
        Context.opsTab.injectSpinnerStyle();

        this._abortOpsTeamSearchInFlight('new search started');
        const abortController = new AbortController();
        this._opsTeamSearchAbortController = abortController;

        const sessionId = Date.now();
        this._opsTeamSearchActive = sessionId;
        this._opsTeamSearchMemberCache = null;
        this._opsTeamActiveFilters = null;
        this._opsMemberDetailsOpenIds = null;
        this._opsExpertStatsHydrateGen++;
        if (this._opsExpertStatsCache) this._opsExpertStatsCache.clear();
        this._clearOpsMemberEditState();

        if (btn) { btn.disabled = true; btn.textContent = 'Searching...'; }

        const filterWrap = this._opsQuery(modal, '#wf-ops-team-filter-wrap', 'teamFilterWrapShow');
        if (filterWrap) filterWrap.style.display = 'flex';
        if (Context.dashboard && typeof Context.dashboard.resetTeamMemberFilters === 'function') {
            Context.dashboard.resetTeamMemberFilters(modal);
        }
        this._populateOpsTeamMemberConstraintLists(allTeams, { loading: false, preserveSelections: false, modal });
        if (Context.dashboard && typeof Context.dashboard.resetTeamMembersPage === 'function') {
            Context.dashboard.resetTeamMembersPage();
        }
        if (Context.dashboard && typeof Context.dashboard.syncTeamMemberConstraintListsUi === 'function') {
            Context.dashboard.syncTeamMemberConstraintListsUi(modal);
        }

        const memberMap = new Map();
        let pendingCount = allTeams.length;
        let doneCount = 0;
        let staleActionDetected = false;

        this._opsFellowsSearchComplete = true;

        if (dashLog && typeof dashLog.logApiClick === 'function') {
            dashLog.logApiClick('team-search', (query ? '"' + query + '" · ' : '') + allTeams.length + ' team(s)');
        }

        const spinnerHtml = Context.uiLib && typeof Context.uiLib.spinnerHtml === 'function'
            ? Context.uiLib.spinnerHtml(10).replace('class="fleet-ui-spinner"', 'class="fleet-ui-spinner" style="vertical-align:middle;margin-right:5px;"')
            : '<span style="display:inline-block;width:10px;height:10px;border:2px solid rgba(79,70,229,0.2);border-top-color:var(--brand,#4f46e5);border-radius:50%;animation:fleet-ui-spin 0.7s linear infinite;vertical-align:middle;margin-right:5px;"></span>';
        this._setOpsTeamSearchStatus(modal, spinnerHtml + 'Searching ' + allTeams.length + ' teams…', false, true, false);

        const finishTeamSearch = (_teamLabel) => {
            pendingCount--;
            doneCount++;
            if (this._opsTeamSearchActive !== sessionId) return;
            this._renderOpsTeamSearchCards(modal, memberMap, allTeams, pendingCount);
            if (pendingCount > 0) {
                this._setOpsTeamSearchStatus(modal,
                    spinnerHtml + doneCount + '/' + allTeams.length + ' teams searched, ' + memberMap.size + ' member' + (memberMap.size !== 1 ? 's' : '') + ' so far…',
                    false, true, false);
            } else {
                this._setOpsTeamSearchStatus(modal,
                    memberMap.size + ' unique member' + (memberMap.size !== 1 ? 's' : '') + ' across ' + allTeams.length + ' teams.',
                    false, false, true);
                Logger.log('team search complete — ' + memberMap.size + ' unique members, ' + allTeams.length + ' teams');
            }
        };

        const searches = allTeams.map(async ([teamId, teamLabel]) => {
            try {
                const members = await Context.opsTab.fetchTeamSearchAllMembers(
                    teamId, userId, query, sessionId, abortController.signal);
                if (this._opsTeamSearchActive !== sessionId) return;
                if (staleActionDetected) return;
                this._mergeOpsTeamSearchMembers(memberMap, members, teamLabel);
                Logger.debug('team search got ' + members.length + ' members from ' + teamLabel);
            } catch (e) {
                if (this._isOpsTeamSearchAbortError(e)) return;
                if (Context.opsTab.isTeamSearchActionStaleError(e)) {
                    staleActionDetected = true;
                    Logger.warn('team search credentials stale for ' + teamLabel);
                } else {
                    Logger.warn('team search failed for ' + teamLabel, e);
                }
            } finally {
                finishTeamSearch(teamLabel);
            }
        });

        await Promise.allSettled(searches);

        if (this._opsTeamSearchActive === sessionId) {
            this._opsTeamSearchAbortController = null;
            if (!staleActionDetected && this._opsTeamSearchLikelyStaleEmptyResults(query, memberMap, allTeams)) {
                staleActionDetected = true;
                Context.opsTab.clearTeamSearchActionCache();
                Logger.warn('team search returned zero members for all teams — treating credentials as stale');
            }
            if (staleActionDetected) {
                this._showOpsTeamSearchActionRefreshBanner(modal);
                this._opsTeamSearchMemberCache = null;
            } else {
                this._opsTeamSearchMemberCache = { memberMap, allTeams };
                this._indexOpsTeamMemberFiltersFromResults(memberMap, { preserveSelections: true, modal });
                this._renderOpsTeamSearchCards(modal, memberMap, allTeams, 0);
                void this._hydrateOpsTeamMemberStatsForVisible(modal);
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
            Context.opsTab.captureState(modal);
        }
    },

    _captureOpsTeamTabState(modal) {
        if (!modal) return;
        const teamSearchInput = this._opsQuery(modal, '#wf-ops-team-search-input', 'teamSearchInputCapture');
        const teamSearchStatusRow = this._opsQuery(modal, '#wf-ops-team-search-status-row', 'teamSearchStatusRowCapture');
        const teamSearchStatus = this._opsQuery(modal, '#wf-ops-team-search-status', 'teamSearchStatusCapture');
        if (!this._tabState) this._tabState = {};
        this._tabState.teamSearchQuery = teamSearchInput ? teamSearchInput.value : '';
        this._tabState.teamSearchStatus = teamSearchStatusRow && teamSearchStatusRow.style.display !== 'none' && teamSearchStatus
            ? (teamSearchStatus.textContent || '')
            : '';
        this._tabState.teamSearchStatusIsError = teamSearchStatus ? teamSearchStatus.style.color === '#dc2626' : false;
    },

    _restoreOpsTeamTabState(modal) {
        if (!modal) return;
        const state = this._tabState;
        if (!state) return;
        const teamSearchInput = this._opsQuery(modal, '#wf-ops-team-search-input', 'teamSearchInputRestore');
        if (teamSearchInput && state.teamSearchQuery != null) {
            teamSearchInput.value = state.teamSearchQuery;
        }
        if (state.teamSearchStatus) {
            const showClear = /unique member/.test(state.teamSearchStatus) && /across/.test(state.teamSearchStatus);
            this._setOpsTeamSearchStatus(modal, state.teamSearchStatus, state.teamSearchStatusIsError, false, showClear);
        }
    },

    _toggleOpsTeamExpandAll(modal) {
        const cards = this._opsQuery(modal, '#wf-ops-team-search-cards', 'teamSearchExpandAllCards');
        if (!cards) return;
        const details = [...cards.querySelectorAll('.wf-ops-member-details')];
        const anyOpen = details.some((d) => d.open);
        const shouldOpen = !anyOpen;
        if (this._opsMemberDetailsOpenIds === null) {
            this._opsMemberDetailsOpenIds = new Set();
        }
        details.forEach((d) => {
            d.open = shouldOpen;
            const memberId = d.getAttribute('data-member-id');
            if (!memberId) return;
            if (shouldOpen) this._opsMemberDetailsOpenIds.add(memberId);
            else this._opsMemberDetailsOpenIds.delete(memberId);
        });
        this._syncOpsExpandAllBtn(modal);
        Logger.log('team member cards ' + (shouldOpen ? 'expanded' : 'collapsed') + ' (' + details.length + ')');
    },

    _attachOpsTeamMemberDetailsToggle(modal) {
        if (!modal || modal.dataset.wfOpsMemberDetailsToggle === '1') return;
        modal.dataset.wfOpsMemberDetailsToggle = '1';
        modal.addEventListener('toggle', (e) => {
            const detailsEl = e.target;
            if (!detailsEl || !detailsEl.classList.contains('wf-ops-member-details')) return;
            const memberId = detailsEl.getAttribute('data-member-id');
            if (!memberId) return;
            if (this._opsMemberDetailsOpenIds === null) {
                const cache = this._opsTeamSearchMemberCache;
                const allIds = cache ? [...cache.memberMap.keys()] : [];
                this._opsMemberDetailsOpenIds = new Set(allIds);
            }
            if (detailsEl.open) this._opsMemberDetailsOpenIds.add(memberId);
            else this._opsMemberDetailsOpenIds.delete(memberId);
            this._syncOpsExpandAllBtn(modal);
        }, true);
    },

    _attachOpsTeamMemberEditDelegation(modal) {
        if (!modal || modal.dataset.wfOpsMemberEditDelegation === '1') return;
        modal.dataset.wfOpsMemberEditDelegation = '1';
        modal.addEventListener('click', (e) => {
            this._handleOpsMemberEditClick(e, modal);
        });
    },

    _opsQuery(modal, selector, contextSuffix) {
        if (!modal) return null;
        if (Context.dom && typeof Context.dom.query === 'function') {
            return Context.dom.query(selector, {
                root: modal,
                context: 'team-members.' + (contextSuffix || 'query')
            });
        }
        return modal.querySelector(selector);
    },

    _opsEscapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _opsEscapeAttr(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    },

    _opsDashBtnClass(variant, size) {
        if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
            return Context.uiLib.btnClass(variant, size);
        }
        const dash = Context.dashboard;
        if (dash && typeof dash.dashBtnClass === 'function') return dash.dashBtnClass(variant, size);
        return 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size;
    },

    _ensureOpsAlertBannerStyles() {
        if (Context.uiLib && typeof Context.uiLib.ensureAlertBannerStyles === 'function') {
            Context.uiLib.ensureAlertBannerStyles();
        }
    },

    _opsAlertBannerClasses() {
        return (Context.uiLib && Context.uiLib.ALERT_BANNER_CLASSES) || {
            root: 'fleet-ui-alert-banner',
            danger: 'fleet-ui-alert-banner--danger',
            amber: 'fleet-ui-alert-banner--amber',
            amberSoft: 'fleet-ui-alert-banner--amber-soft',
            title: 'fleet-ui-alert-banner__title',
            body: 'fleet-ui-alert-banner__body',
            footer: 'fleet-ui-alert-banner__footer',
            btnSecondary: 'fleet-ui-alert-banner__btn-secondary',
            btnPrimary: 'fleet-ui-alert-banner__btn-primary'
        };
    },
};


const TEAM_MEMBERS_NUMERIC_FIELDS = [
    { id: 'tasks_submitted', label: 'Tasks Submitted' },
    { id: 'tasks_reviewed', label: 'Tasks Reviewed' },
    { id: 'submission_ar', label: 'Submission AR (%)' },
    { id: 'qa_ar', label: 'QA AR (%)' },
    { id: 'avg_writing_time', label: 'Avg Writing Time (min)' },
    { id: 'avg_qa_time', label: 'Avg QA Time (min)' }
];

const TEAM_MEMBERS_PAGE_SIZE_KEY = 'fleet-ux:team-members-page-size';
const TEAM_MEMBERS_PAGE_SIZE_DEFAULT = 25;
const TEAM_MEMBERS_BADGE_SCOPE = 'team-members-badges';
const TEAM_MEMBERS_BADGE_FILTER_ITEMS = [
    { id: 'mts', label: 'MTS' },
    { id: 'ui', label: 'UI' },
    { id: 'verticals', label: 'Verticals' },
    { id: 'epic', label: 'Epic' },
    { id: 'fellows', label: 'Fellows' }
];

// Align with DASH_TEAM_MEMBERS_DUAL_CONSTRAINT_MS_KEYS / DASH_TEAM_MEMBERS_MS_KEYS in dashboard.js
const TEAM_MEMBERS_DUAL_CONSTRAINT_MS_KEYS = ['team-members-teams', 'team-members-permissions'];
const TEAM_MEMBERS_MS_KEYS = TEAM_MEMBERS_DUAL_CONSTRAINT_MS_KEYS.concat([TEAM_MEMBERS_BADGE_SCOPE]);

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
            TEAM_MEMBERS_MS_KEYS.forEach((scopeKey) => {
                delete this._state.msDropdownOpen[scopeKey];
                delete this._state.msDropdownToggled[scopeKey];
                const panel = root.querySelector('#wf-dash-' + scopeKey + '-list');
                const emptyHint = panel ? (panel.getAttribute('data-wf-dash-empty') || 'Run a search first') : 'Run a search first';
                if (scopeKey === TEAM_MEMBERS_BADGE_SCOPE) {
                    if (typeof this._renderTeamMemberBadgeFilter === 'function') {
                        this._renderTeamMemberBadgeFilter(modal);
                    }
                } else {
                    const itemsEl = panel ? panel.querySelector('[data-wf-dash-ms-items]') : null;
                    if (itemsEl) {
                        itemsEl.innerHTML = this._msHintHtml(emptyHint);
                    }
                }
                if (typeof this._updateMsCount === 'function') {
                    this._updateMsCount(scopeKey);
                }
                if (typeof this._syncMsDropdown === 'function') {
                    this._syncMsDropdown(scopeKey, { immediate: true });
                }
            });
            Logger.debug('constraint filter state reset');
        });
    },

    _renderTeamMemberBadgeFilter(modal) {
        const dash = Context.dashboard;
        if (!dash || typeof dash.renderMsList !== 'function') return;
        dash.renderMsList(TEAM_MEMBERS_BADGE_SCOPE, TEAM_MEMBERS_BADGE_FILTER_ITEMS, '', new Set());
    },

    _syncTeamMemberConstraintListsUi(modal) {
        this._withTeamMembersModal(modal, (root) => {
            TEAM_MEMBERS_DUAL_CONSTRAINT_MS_KEYS.forEach((scopeKey) => {
                const itemsEl = typeof this._msItemsEl === 'function' ? this._msItemsEl(scopeKey) : null;
                const rowCount = itemsEl ? itemsEl.querySelectorAll('[data-wf-dash-ms-dual-row]').length : -1;
                const open = Boolean(this._state && this._state.msDropdownOpen[scopeKey]);
                Logger.debug('' + scopeKey + ' rows=' + rowCount + ' open=' + open);
                if (rowCount === 0 && itemsEl) {
                    Logger.warn('constraint list empty after populate — ' + scopeKey);
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
                Logger.warn('_renderDualConstraintMsList unavailable');
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
            Logger.log('constraint lists rendered'
                + (loading ? ' (loading)' : ' — ' + (options.teamItems || []).length + ' teams, '
                    + (options.permItems || []).length + ' permissions'));
        });
    },

    _onTeamMemberMsChange(modal) {
        const tm = Context.teamMembers;
        if (!tm || typeof tm.filterTeamSearchCards !== 'function') return;
        this.resetTeamMembersPage();
        tm.filterTeamSearchCards(modal || this._modal);
    },

    resetTeamMembersPage() {
        this._teamMembersPage = 0;
    },

    _readTeamMembersPageSizePref() {
        try {
            const v = Storage.getData(TEAM_MEMBERS_PAGE_SIZE_KEY, null);
            if (v === '10' || v === '25' || v === '50' || v === 'all') return v;
        } catch (_e) { /* ignore */ }
        return null;
    },

    _persistTeamMembersPageSizePref(value) {
        try {
            const v = String(value || TEAM_MEMBERS_PAGE_SIZE_DEFAULT);
            Storage.setData(TEAM_MEMBERS_PAGE_SIZE_KEY, v);
        } catch (e) {
            Logger.debug('could not persist page size', e);
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
        const pageHolder = { page: this._teamMembersPage || 0 };
        const meta = this._paginationMeta(total, this._getEffectiveTeamMembersPageSize(), pageHolder);
        this._teamMembersPage = pageHolder.page;
        return meta;
    },

    _getTeamMembersRangeLabel(total) {
        const meta = this._getTeamMembersPaginationMeta(total);
        return this._rangeLabel(meta, { singular: 'member', plural: 'members' });
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
        const showPager = Boolean(searchDone) && (Number(total) || 0) > 0;
        const meta = showPager ? this._getTeamMembersPaginationMeta(total) : null;
        this._syncPagerNavUi({
            show: showPager,
            rowEl: root.querySelector('#wf-ops-team-pager-row'),
            rangeEl: root.querySelector('#wf-ops-team-range-count'),
            prevBtn: root.querySelector('#wf-ops-team-prev'),
            nextBtn: root.querySelector('#wf-ops-team-next'),
            meta,
            rangeLabel: showPager ? this._getTeamMembersRangeLabel(total) : ''
        });
    },

    _goTeamMembersPage(modal, delta) {
        const meta = this._getTeamMembersPaginationMeta(
            this._teamMembersPagerTotal != null ? this._teamMembersPagerTotal : 0
        );
        if (!meta.showNav) return;
        const next = meta.page + delta;
        if (next < 0 || next >= meta.totalPages) return;
        this._teamMembersPage = next;
        Logger.log('page — ' + (next + 1) + ' / ' + meta.totalPages);
        const tm = Context.teamMembers;
        if (tm && typeof tm.filterTeamSearchCards === 'function') {
            tm.filterTeamSearchCards(modal || this._modal);
        }
    },

    _buildNumericFilterRow(modal, opts) {
        const root = modal || this._modal;
        if (!root) return;
        const rowsEl = root.querySelector('#wf-ops-team-numeric-rows');
        if (!rowsEl) return;
        const inputStyle = this._inputStyle() + ' padding: 4px 8px; font-size: 11px;';
        const selectStyle = inputStyle;
        const row = document.createElement('div');
        row.innerHTML = this._numericFilterRowHtml({
            fields: TEAM_MEMBERS_NUMERIC_FIELDS,
            field: opts && opts.field,
            comparator: opts && opts.comparator,
            value: opts && opts.value,
            rowAttr: 'data-wf-team-numeric-row',
            fieldAttr: 'data-wf-team-numeric-field',
            comparatorAttr: 'data-wf-team-numeric-comparator',
            valueAttr: 'data-wf-team-numeric-value',
            removeAttr: 'data-wf-team-numeric-remove',
            selectStyle,
            inputStyle
        });
        const rowEl = row.firstElementChild;
        if (rowEl) rowsEl.appendChild(rowEl);
        Logger.debug('numeric filter row added');
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
        const tm = Context.teamMembers;
        if (tm && typeof tm.applyTeamFilters === 'function') {
            void tm.applyTeamFilters(modal);
        }
    },

    _captureTeamMembersState(modal) {
        const tm = Context.teamMembers;
        if (tm && typeof tm.captureTeamTabState === 'function') tm.captureTeamTabState(modal);
    },

    _restoreTeamMembersState(modal) {
        const tm = Context.teamMembers;
        if (tm && typeof tm.restoreTeamTabState === 'function') tm.restoreTeamTabState(modal);
    }
};

function teamMembersPanelHtml() {
    const dash = Context.dashboard;
    const box = dash && typeof dash.panelBoxStyle === 'function' ? dash.panelBoxStyle() : 'border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--card, #ffffff);';
    const label = dash && typeof dash.labelStyle === 'function' ? dash.labelStyle() : 'font-size: 11px; font-weight: 600; color: var(--muted-foreground, #64748b);';
    const hint = dash && typeof dash.hintStyle === 'function' ? dash.hintStyle() : 'font-size: 11px; color: var(--muted-foreground, #64748b);';
    const input = dash && typeof dash.inputStyle === 'function' ? dash.inputStyle() : 'padding: 8px 12px; font-size: 13px; border: 1px solid var(--border, #e5e5e5); border-radius: 6px; background: var(--background, white); color: var(--foreground, #333); box-sizing: border-box;';
    const btnClass = (variant, size) => {
        if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
            return Context.uiLib.btnClass(variant, size);
        }
        return dash && typeof dash.dashBtnClass === 'function'
            ? dash.dashBtnClass(variant, size)
            : 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size;
    };
    const pagerChevron = (dir) => (dash && typeof dash.pagerChevronSvg === 'function' ? dash.pagerChevronSvg(dir) : '');

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
                            <button type="button" id="wf-ops-team-prev" aria-label="Previous page" title="Previous page" class="${btnClass('basic', 'icon')}">${pagerChevron('prev')}</button>
                            <button type="button" id="wf-ops-team-next" aria-label="Next page" title="Next page" class="${btnClass('basic', 'icon')}">${pagerChevron('next')}</button>
                        </div>
                    </div>
                    <div id="wf-ops-team-search-output-wrap" style="display: none; flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px;">
                        <div id="wf-ops-team-search-cards"></div>
                    </div>
                </div>`;

    return '<div id="wf-dash-team-members-inner" style="width: 100%; flex: 1; min-height: 0; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;">'
        + dash.splitPanelSectionHtml(leftHtml, rightHtml, 'team-members') + '</div>';
}

function attachTeamMembersListeners(modal, dash) {
    const tm = Context.teamMembers;
    const ops = Context.opsTab;
    if (!tm) return;
    if (modal.dataset.wfTeamMembersListenersAttached === '1') {
        if (typeof tm.restoreTeamTabState === 'function') tm.restoreTeamTabState(modal);
        return;
    }
    modal.dataset.wfTeamMembersListenersAttached = '1';
    if (typeof dash._renderTeamMemberBadgeFilter === 'function') {
        dash._renderTeamMemberBadgeFilter(modal);
    }
    if (ops && typeof ops.injectSpinnerStyle === 'function') ops.injectSpinnerStyle();

    const teamSearchBtn = modal.querySelector('#wf-ops-team-search-btn');
    const teamSearchInput = modal.querySelector('#wf-ops-team-search-input');
    if (teamSearchBtn && typeof tm.handleTeamSearch === 'function') {
        teamSearchBtn.addEventListener('click', () => { void tm.handleTeamSearch(modal); });
    }
    if (teamSearchInput && typeof tm.handleTeamSearch === 'function') {
        teamSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); void tm.handleTeamSearch(modal); }
        });
        teamSearchInput.addEventListener('input', () => {
            if (typeof tm.captureTeamTabState === 'function') tm.captureTeamTabState(modal);
        });
    }
    const teamSearchClearBtn = modal.querySelector('#wf-ops-team-search-clear-btn');
    if (teamSearchClearBtn && typeof tm.clearTeamSearchResults === 'function') {
        teamSearchClearBtn.addEventListener('click', () => tm.clearTeamSearchResults(modal));
    }
    const teamExpandAllBtn = modal.querySelector('#wf-ops-team-expand-all-btn');
    if (teamExpandAllBtn && typeof tm.toggleTeamExpandAll === 'function') {
        teamExpandAllBtn.addEventListener('click', () => tm.toggleTeamExpandAll(modal));
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
            Logger.log('page size — ' + val);
            if (tm && typeof tm.filterTeamSearchCards === 'function') tm.filterTeamSearchCards(modal);
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
    if (!modal.dataset.wfOpsMemberDetailsToggle && typeof tm.attachTeamMemberDetailsToggle === 'function') {
        tm.attachTeamMemberDetailsToggle(modal);
    }
    if (!modal.dataset.wfOpsMemberEditDelegation && typeof tm.attachTeamMemberEditDelegation === 'function') {
        tm.attachTeamMemberEditDelegation(modal);
    }
    if (typeof tm.restoreTeamTabState === 'function') tm.restoreTeamTabState(modal);
}

const plugin = {
    id: 'team-members',
    name: 'Team Members',
    description: 'Team member search tab for the Ops dashboard',
    _version: '5.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            Logger.error('dashboard loader not registered');
            return;
        }
        Object.assign(loader, teamMembersMethods);
        if (!teamMembersController._opsExpertStatsCache) {
            teamMembersController._opsExpertStatsCache = new Map();
        }
        Context.teamMembers = teamMembersController;
        Context.dashboard.registerTab({
            id: 'team-members',
            label: 'Team Members',
            panelHtml() { return teamMembersPanelHtml(); },
            attachListeners(modal, dash) { attachTeamMembersListeners(modal, dash); },
            onActivate(modal, dash) {
                if (typeof dash._restoreTeamMembersState === 'function') dash._restoreTeamMembersState(modal);
                requestAnimationFrame(() => dash._applyAllSidePanelWidths());
            },
            captureState(modal, dash) {
                if (typeof dash._captureTeamMembersState === 'function') dash._captureTeamMembersState(modal);
            }
        });
        Logger.log('module registered (Context.teamMembers)');
        Logger.log('tab registered');
    }

};
