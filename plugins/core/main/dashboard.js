// ============= dashboard.js =============
// Worker Output Search (Ops dashboard): search output, team members, verifier fetch.
//
// This is the live port of the local prototype in local/dashboard. All data is
// PostgREST table/query shapes come from the encrypted ops bundle (Context.opsTab).
// which reuses the exact same Supabase runtime config + session token gathering as the
// people lookup tool (cookies / sb-*-auth-token JWT). No secrets are hardcoded here.
//
// Porting notes / oddities live in local/dashboard/reference/dashboard-live-port-handoff.md.

const DASH_BOOTSTRAP_STORAGE_KEY = 'fleet-ux:dashboard-bootstrap';
const DASH_SEARCH_DEPTH_STORAGE_KEY = 'fleet-ux:dashboard-search-depth';
const DASH_RESULTS_PAGE_SIZE_KEY = 'fleet-ux:dashboard-results-page-size';
const DASH_HYDRATE_TAB_BG = '#64748b';
const DASH_CARD_KIND_TAB_HEIGHT = '24px';
const DASH_CARD_KIND_TAB_SLOT_WIDTH = '7.75rem';
const DASH_CARD_KIND_TAB_GAP = '0.25rem';
const DASH_HYDRATE_TASK_CHUNK = 25;
const DASH_RESULTS_PAGE_SIZE_DEFAULT = 100;
const DASH_BOOTSTRAP_VERSION = 2;
const DASH_BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const DASH_FLEET_ORIGIN = 'https://www.fleetai.com';
const DASH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DASH_TASKS_PAGE_SIZE = 100;
const DASH_QA_PAGE_SIZE = 50;
const DASH_DISPUTES_PAGE_SIZE = 50;
const DASH_DISPUTES_MAX_PAGES = 100;
/** Stop disputes bulk pagination after this many pages with zero date-filter matches (client-side filter). */
const DASH_DISPUTES_DATE_FILTER_MAX_EMPTY_PAGES = 3;
const DASH_FLEET_WEB_API = DASH_FLEET_ORIGIN + '/api';

const DASH_KIND_LABELS = {
    task_creation: 'Task Creation',
    qa: 'QA',
    dispute: 'Disputes'
};

const DASH_OUTPUT_KIND_CONFIG = {
    task_creation: {
        label: 'Task Creation',
        tabBg: '#16a34a',
        toggleActive: 'border: 2px solid #16a34a; color: #15803d; background: transparent;',
        textHighlight: 'font-weight: 600; color: #15803d;'
    },
    qa: {
        label: 'QA',
        tabBg: '#2563eb',
        toggleActive: 'border: 2px solid #2563eb; color: #1d4ed8; background: transparent;',
        textHighlight: 'font-weight: 600; color: #1d4ed8;'
    },
    dispute: {
        label: 'Disputes',
        tabBg: '#7c3aed',
        toggleActive: 'border: 2px solid #7c3aed; color: #6d28d9; background: transparent;',
        textHighlight: 'font-weight: 600; color: #6d28d9;'
    }
};

const DASH_TOGGLE_INACTIVE = 'border: 2px solid var(--border, #e2e8f0); color: var(--muted-foreground, #64748b); background: transparent; opacity: 0.6;';
const DASH_SEARCH_DEPTH_TOGGLE_ACTIVE = 'border: 2px solid #ca8a04; color: #a16207; background: transparent;';
const DASH_FLAGGED_COLOR = '#a16207';
const DASH_FLAGGED_BORDER = '#ca8a04';
const DASH_FLAGGED_BG = 'color-mix(in srgb, #ca8a04 14%, transparent)';

const DASH_SEARCH_DEPTH_HINTS = {
    quick: 'Fast results from the initial API response. Hydrate cards for full prompt history and feedback.',
    deep: 'Same fast search, then hydrates every result before showing cards (slower, full timelines).'
};

/** Tab strip order when one task matches multiple output kinds. */
const DASH_KIND_MERGE_ORDER = ['task_creation', 'qa', 'dispute'];

const DASH_FILTER_SCOPES = [
    { scopeKey: 'filter-prompt-history', optionsKey: 'promptHistory', draftKey: 'promptHistory' },
    { scopeKey: 'filter-teams', optionsKey: 'teams', draftKey: 'teamIds' },
    { scopeKey: 'filter-projects', optionsKey: 'projects', draftKey: 'projectIds' },
    { scopeKey: 'filter-envs', optionsKey: 'envs', draftKey: 'envKeys' },
    { scopeKey: 'filter-statuses', optionsKey: 'statuses', draftKey: 'statuses' },
    { scopeKey: 'filter-contributors', optionsKey: 'contributors', draftKey: 'contributorIds' },
    { scopeKey: 'filter-prompt-ratings', optionsKey: 'promptRatings', draftKey: 'promptRatings' },
    { scopeKey: 'filter-task-issues', optionsKey: 'taskIssues', draftKey: 'taskIssues' },
    { scopeKey: 'filter-return-types', optionsKey: 'returnTypes', draftKey: 'returnTypes' }
];
const DASH_TEAM_MEMBERS_MS_KEYS = ['team-members-teams', 'team-members-permissions'];

function dashIsTeamMembersMsKey(scopeKey) {
    return DASH_TEAM_MEMBERS_MS_KEYS.includes(scopeKey);
}

function dashLib() {
    return Context.dashboardLib;
}

function dashPgInFilter(values) {
    return dashLib().pgInFilter(values);
}

function dashPgInChunks(values) {
    return dashLib().pgInChunks(values);
}

function dashDateInputValue(date) {
    return dashLib().dateInputValue(date);
}

function dashQuickDatePresetRange(preset) {
    return dashLib().quickDatePresetRange(preset);
}

function dashValidateCreatedAtRange(afterLocal, beforeLocal) {
    return dashLib().validateCreatedAtRange(afterLocal, beforeLocal);
}

function dashQaTextBlockLabel(label, isPositive) {
    return dashLib().qaTextBlockLabel(label, isPositive);
}

// ── Fleet URLs (ported from lib/fleetUrls.js) ──

function dashFleetExpertUrl(profileId) {
    const id = String(profileId || '').trim();
    return id ? `${DASH_FLEET_ORIGIN}/dashboard/data/experts/${encodeURIComponent(id)}` : '';
}
function dashFleetTaskUrl(taskId) {
    const id = String(taskId || '').trim();
    return id ? `${DASH_FLEET_ORIGIN}/dashboard/data/tasks/${encodeURIComponent(id)}` : '';
}
function dashFleetProjectUrl(projectId) {
    const id = String(projectId || '').trim();
    return id ? `${DASH_FLEET_ORIGIN}/dashboard/data/projects/${encodeURIComponent(id)}` : '';
}
function dashFleetDisputeUrl(disputeId) {
    const id = String(disputeId || '').trim();
    return id ? `${DASH_FLEET_ORIGIN}/work/problems/disputes/${encodeURIComponent(id)}` : '';
}

// ── Formatting ──

function dashFormatCreatedAt(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function dashRelativeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return '';
    const diffMs = Math.max(0, Date.now() - then.getTime());
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const parts = [];
    if (days > 0) parts.push(days + ' day' + (days === 1 ? '' : 's'));
    parts.push(hours + ' hour' + (hours === 1 ? '' : 's'));
    return parts.join(', ') + ' ago';
}

/** PostgREST may return an embed as one object or an array — normalize to a single row. */
function dashFirstEmbed(embed) {
    if (!embed) return null;
    if (Array.isArray(embed)) return embed[0] || null;
    if (typeof embed === 'object') return embed;
    return null;
}

// ── HTML escaping ──

function dashEscHtml(value) {
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
    description: 'Ops dashboard: worker output search, team members, verifier fetch; PostgREST via Context.opsTab',
    _version: '4.30',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    // Persistent across the page load (statefulness requirement). The popup DOM is
    // built once and toggled, so closing/reopening shows the same state.
    _overlay: null,
    _modal: null,
    _built: false,
    _state: null,
    _onKeydown: null,
    _keydownDoc: null,

    init() {
        this._state = this._createInitialState();
        Context.dashboard = {
            open: () => this.open(),
            close: () => this.close(),
            toggle: () => this.toggle(),
            isOpen: () => this._isOpen(),
            switchFleetTeam: (teamId) => this._switchFleetTeam(teamId),
            setAuthorTokens: (persons, options) => this._setAuthorTokens(persons, options),
            copyChipHtml: (text) => this._copyChipHtml(text),
            personChipsHtml: (name, email, id, linkTitle) => this._personChipsHtml(name, email, id, linkTitle),
            panelBoxStyle: () => this._panelBoxStyle(),
            labelStyle: () => this._labelStyle(),
            hintStyle: () => this._hintStyle(),
            inputStyle: () => this._inputStyle(),
            navBtnStyle: () => this._navBtnStyle(),
            navBtnPrimaryStyle: () => this._navBtnPrimaryStyle(),
            multiSelectHtml: (scopeKey, label, emptyHint, bulkActions) => this._multiSelectHtml(scopeKey, label, emptyHint, bulkActions),
            renderMsList: (scopeKey, items, emptyHint, preserveSelected) => this._renderMsList(scopeKey, items, emptyHint, preserveSelected),
            resetTeamMemberMsDropdowns: () => this._resetTeamMemberMsDropdowns(),
            openTeamMemberMsDropdowns: () => this._openTeamMemberMsDropdowns(),
            selectedMsValues: (scopeKey) => this._selectedFromList(scopeKey)
        };
        Logger.log('dashboard: module registered (Context.dashboard)');
    },

    _createInitialState() {
        return {
            catalog: this._readBootstrapCache(),
            bootstrapStatus: 'idle',
            bootstrapError: null,
            sessionRefreshRequired: false,
            draftTokens: [],
            searchDepth: 'quick',
            resultsKindTab: 'all',
            hydrateUi: {},
            hydrateBulkActive: false,
            hydrateFetchActive: false,
            autoHydrateActive: false,
            autoHydrateScheduled: false,
            autoHydratePending: false,
            autoHydratePendingLogged: false,
            resultsPageSize: DASH_RESULTS_PAGE_SIZE_DEFAULT,
            resultsPage: 0,
            activeTab: 'search-output',
            leftTab: 'search',
            cachedItems: null,
            filteredItems: null,
            hasSearched: false,
            loading: false,
            searchLoadPhase: '',
            searchError: null,
            disputesBulkIncomplete: false,
            committed: null,
            appliedFilters: null,
            filterListOptions: null,
            cardUi: {},
            taskOpenUi: {},
            disputeClaimUi: {},
            includeTasks: true,
            includeQa: true,
            includeDisputes: false,
            searchFetchActive: false,
            targetIdsCacheKey: '',
            targetIdsCache: null,
            msDropdownOpen: {},
            msDropdownFilter: {}
        };
    },

    // ── Storage helpers ──

    _pageWindow() {
        try {
            if (typeof Context !== 'undefined' && Context.getPageWindow) {
                return Context.getPageWindow() || window;
            }
        } catch (_e) { /* fall through */ }
        return window;
    },

    _readBootstrapCache() {
        try {
            const raw = this._pageWindow().localStorage.getItem(DASH_BOOTSTRAP_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.version !== DASH_BOOTSTRAP_VERSION) return null;
            const currentProfileId = this._dashGetCurrentUserId();
            if (parsed.profileId && currentProfileId && parsed.profileId !== currentProfileId) {
                Logger.debug('dashboard: bootstrap cache discarded (profile mismatch)');
                return null;
            }
            if (parsed.updatedAt) {
                const ageMs = Date.now() - Date.parse(parsed.updatedAt);
                if (!Number.isNaN(ageMs) && ageMs > DASH_BOOTSTRAP_TTL_MS) {
                    Logger.debug('dashboard: bootstrap cache expired (age ' + Math.round(ageMs / 3600000) + 'h)');
                    return null;
                }
            }
            if (parsed.profileId && Array.isArray(parsed.teams) && Context.opsTab
                && typeof Context.opsTab.hydrateUserTeamCatalog === 'function') {
                Context.opsTab.hydrateUserTeamCatalog(parsed.profileId, parsed.teams);
            }
            return parsed;
        } catch (_e) {
            return null;
        }
    },

    _writeBootstrapCache(data) {
        const entry = {
            version: DASH_BOOTSTRAP_VERSION,
            updatedAt: new Date().toISOString(),
            profileId: data.profileId || '',
            teams: data.teams || [],
            projects: data.projects,
            environments: data.environments
        };
        try {
            this._pageWindow().localStorage.setItem(DASH_BOOTSTRAP_STORAGE_KEY, JSON.stringify(entry));
        } catch (e) {
            Logger.warn('dashboard: failed to write bootstrap cache', e);
        }
        this._state.targetIdsCacheKey = '';
        this._state.targetIdsCache = null;
        return entry;
    },

    _clearTargetIdsCache() {
        this._state.targetIdsCacheKey = '';
        this._state.targetIdsCache = null;
    },

    // ── Catalog / team helpers ──

    _dashFormatTeamDisplayLabel(name) {
        if (Context.opsTab && typeof Context.opsTab.formatTeamDisplayLabel === 'function') {
            return Context.opsTab.formatTeamDisplayLabel(name);
        }
        const full = String(name || '').trim();
        const prefix = 'Task Designers - ';
        return full.startsWith(prefix) ? full.slice(prefix.length).trim() : full;
    },

    _dashIsTaskDesignersTeam(name) {
        if (Context.opsTab && typeof Context.opsTab.isTaskDesignersTeam === 'function') {
            return Context.opsTab.isTaskDesignersTeam(name);
        }
        return String(name || '').startsWith('Task Designers - ');
    },

    _getTeamCatalog() {
        const fromCatalog = this._state.catalog && Array.isArray(this._state.catalog.teams)
            ? this._state.catalog.teams
            : null;
        if (fromCatalog && fromCatalog.length > 0) {
            return fromCatalog
                .map((t) => [t.id, t.displayName || this._dashFormatTeamDisplayLabel(t.name)])
                .filter((pair) => Array.isArray(pair) && pair[0] && pair[1]);
        }
        try {
            if (Context.opsTab && typeof Context.opsTab.getUserTeamCatalog === 'function') {
                return Context.opsTab.getUserTeamCatalog();
            }
        } catch (e) {
            Logger.debug('dashboard: team catalog read failed', e);
        }
        return [];
    },

    _getSearchableTeamCatalog() {
        const fromCatalog = this._state.catalog && Array.isArray(this._state.catalog.teams)
            ? this._state.catalog.teams
            : null;
        if (fromCatalog && fromCatalog.length > 0) {
            return fromCatalog
                .filter((t) => this._dashIsTaskDesignersTeam(t.name))
                .map((t) => [t.id, t.displayName || this._dashFormatTeamDisplayLabel(t.name)])
                .filter((pair) => pair[0] && pair[1]);
        }
        try {
            if (Context.opsTab && typeof Context.opsTab.getUserTeamCatalog === 'function') {
                return Context.opsTab.getUserTeamCatalog();
            }
        } catch (e) {
            Logger.debug('dashboard: searchable team catalog read failed', e);
        }
        return [];
    },

    _teamName(teamId) {
        if (!teamId) return '';
        const found = this._getTeamCatalog().find(([id]) => id === teamId);
        return found ? found[1] : '';
    },

    _projectName(projectId) {
        if (!projectId) return '';
        const projects = (this._state.catalog && this._state.catalog.projects) || [];
        const found = projects.find((p) => p.id === projectId);
        return found ? found.name : '';
    },

    // ── PostgREST data layer (reuses ops-tab session/token gathering) ──

    _dashOpsTab() {
        if (!Context.opsTab) {
            throw new Error('Ops tab unavailable. Enable the Ops tab in Settings and unlock it.');
        }
        return Context.opsTab;
    },

    async _pgQuery(queryKey, overrides, channel) {
        const ops = this._dashOpsTab();
        if (typeof ops.postgrestQuery !== 'function') {
            throw new Error('Ops dashboard PostgREST client unavailable. Unlock the Ops dashboard and try again.');
        }
        const needsActiveSearch = channel === 'search' || channel === 'hydrate';
        if (needsActiveSearch && !this._state.searchFetchActive && !this._state.hydrateFetchActive) {
            Logger.warn('dashboard: blocked PostgREST call outside search/hydrate — ' + queryKey);
            throw new Error('PostgREST call blocked: data is cached until a new search.');
        }
        const rows = await ops.postgrestQuery(queryKey, overrides || {});
        return Array.isArray(rows) ? rows : (rows ? [rows] : []);
    },

    _dashFleetWebPath(key) {
        return this._dashOpsTab().getFleetWebPath(key);
    },

    // ── Fleet web API (session cookies; same-origin) ──

    async _fleetWebGet(path, channel) {
        if (channel === 'search' && !this._state.searchFetchActive) {
            Logger.warn('dashboard: blocked Fleet web API call outside search — ' + path);
            throw new Error('Fleet web API call blocked: data is cached until a new search.');
        }
        const url = path.startsWith('http') ? path : DASH_FLEET_WEB_API + path;
        const pageWindow = this._pageWindow();
        const requestFetch = pageWindow.fetch || fetch;
        const res = await requestFetch.call(pageWindow, url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                accept: 'application/json',
                referer: DASH_FLEET_ORIGIN + '/'
            }
        });
        if (res.status === 404) return null;
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error('Fleet web API ' + res.status + ': ' + (text || res.statusText));
        }
        return res.json();
    },

    _fleetWebGetSearch(path) {
        return this._fleetWebGet(path, 'search');
    },

    async _fleetWebPost(path) {
        const url = path.startsWith('http') ? path : DASH_FLEET_WEB_API + path;
        const pageWindow = this._pageWindow();
        const requestFetch = pageWindow.fetch || fetch;
        const res = await requestFetch.call(pageWindow, url, {
            method: 'POST',
            credentials: 'include',
            headers: {
                accept: '*/*',
                referer: DASH_FLEET_ORIGIN + '/work/problems/disputes'
            }
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error('Fleet web API ' + res.status + ': ' + (text || res.statusText));
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return res.json().catch(() => null);
        }
        return null;
    },

    _disputeClaimApiPath(disputeId) {
        return '/disputes/' + encodeURIComponent(String(disputeId)) + '/claim';
    },

    _dashGetCookie(name) {
        try {
            const win = this._pageWindow();
            const cookie = (win.document && win.document.cookie) || '';
            if (!cookie) return '';
            for (const part of cookie.split(/;\s*/)) {
                const eq = part.indexOf('=');
                if (eq < 0) continue;
                if (part.slice(0, eq).trim() === name) {
                    return decodeURIComponent(part.slice(eq + 1));
                }
            }
        } catch (e) {
            Logger.debug('dashboard: cookie read failed for ' + name, e);
        }
        return '';
    },

    _dashSetCookie(name, value) {
        try {
            const win = this._pageWindow();
            const doc = win.document;
            if (!doc) return;
            const secure = win.location && win.location.protocol === 'https:' ? '; Secure' : '';
            doc.cookie = name + '=' + encodeURIComponent(value) + '; path=/' + secure + '; SameSite=Lax';
        } catch (e) {
            Logger.warn('dashboard: cookie write failed for ' + name, e);
        }
    },

    _dashGetCurrentUserId() {
        const fromCookie = this._dashGetCookie('current-user-id');
        if (fromCookie && DASH_UUID_RE.test(fromCookie)) return fromCookie;
        try {
            const stored = this._pageWindow().localStorage.getItem('fleet-ux:ops-current-user-id');
            if (stored && DASH_UUID_RE.test(stored)) return stored;
        } catch (_e) { /* ignore */ }
        return '';
    },

    _dashEnsureRuntimeAccess() {
        const access = Context.networkObserver && typeof Context.networkObserver.getRuntimeAccess === 'function'
            ? Context.networkObserver.getRuntimeAccess() || {}
            : {};
        const baseUrl = access.supabaseRestBaseUrl;
        const anonKey = access.supabaseAnonKey;
        if (!baseUrl || !anonKey) {
            throw new Error('Supabase API config not yet discovered. Open a Fleet data page, then retry.');
        }
        return { baseUrl, anonKey };
    },

    async _dashPostgrestObjectGet(table, params) {
        const { baseUrl, anonKey } = this._dashEnsureRuntimeAccess();
        const ops = this._dashOpsTab();
        const pageWindow = this._pageWindow();
        const jwt = typeof ops.getFleetUserJwt === 'function' ? ops.getFleetUserJwt(pageWindow) : '';
        if (!jwt) {
            throw new Error('Fleet session token not yet captured. Navigate to a Fleet data page, then retry.');
        }
        const url = new URL(baseUrl + '/' + table);
        Object.entries(params || {}).forEach(([key, value]) => {
            if (value != null && value !== '') url.searchParams.set(key, String(value));
        });
        const requestFetch = pageWindow.fetch || fetch;
        const res = await requestFetch.call(pageWindow, url.toString(), {
            method: 'GET',
            headers: {
                accept: 'application/vnd.pgrst.object+json',
                'accept-profile': 'public',
                apikey: anonKey,
                authorization: 'Bearer ' + jwt,
                'x-client-info': 'fleet-ux-dashboard/' + this._version
            },
            credentials: 'omit'
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error('Supabase API ' + res.status + ': ' + (text || res.statusText));
        }
        return res.json();
    },

    async _switchFleetTeam(teamId) {
        const id = String(teamId || '').trim();
        if (!id) throw new Error('Missing team id');
        const userId = this._dashGetCurrentUserId();
        if (!userId) throw new Error('Fleet user id unavailable. Open Fleet while logged in.');
        const teamLabel = this._teamName(id) || id.slice(0, 8) + '…';
        Logger.log('dashboard: switching active team to ' + teamLabel);
        this._dashSetCookie('current-team-id', id);
        const membership = await this._dashPostgrestObjectGet('team_member', {
            select: 'role',
            profile_id: 'eq.' + userId,
            team_id: 'eq.' + id
        });
        if (membership && membership.role) {
            this._dashSetCookie('current-team-role', String(membership.role));
        }
        Logger.log('dashboard: active team set to ' + teamLabel);
        return membership;
    },

    _getTaskOpenUi(taskId) {
        const id = String(taskId || '').trim();
        if (!id) return { status: 'idle' };
        if (!this._state.taskOpenUi[id]) {
            this._state.taskOpenUi[id] = { status: 'idle' };
        }
        return this._state.taskOpenUi[id];
    },

    async _openTaskInFleet(taskId, teamId, itemId) {
        const id = String(taskId || '').trim();
        const url = dashFleetTaskUrl(id);
        if (!url) return;
        const ui = this._getTaskOpenUi(id);
        if (ui.status === 'switching') return;

        const targetTeamId = String(teamId || '').trim();
        const currentTeamId = this._dashGetCookie('current-team-id');
        if (!targetTeamId || targetTeamId === currentTeamId) {
            this._pageWindow().open(url, '_blank', 'noopener,noreferrer');
            Logger.log('dashboard: opened task ' + id.slice(0, 8) + '… in Fleet');
            return;
        }

        ui.status = 'switching';
        this._patchTaskCard(itemId);
        try {
            await this._switchFleetTeam(targetTeamId);
            this._pageWindow().open(url, '_blank', 'noopener,noreferrer');
            Logger.log('dashboard: switched team and opened task ' + id.slice(0, 8) + '…');
        } catch (e) {
            Logger.warn('dashboard: team switch failed before opening task ' + id.slice(0, 8) + '…', e);
        } finally {
            ui.status = 'idle';
            this._patchTaskCard(itemId);
        }
    },

    _dashNormProfileId(id) {
        return String(id == null ? '' : id).trim().toLowerCase();
    },

    _disputeInCreatedAtRange(createdAt, afterIso, beforeIso) {
        if (!createdAt) return false;
        const ts = Date.parse(createdAt);
        if (Number.isNaN(ts)) return false;
        if (afterIso && ts < Date.parse(afterIso)) return false;
        if (beforeIso && ts > Date.parse(beforeIso)) return false;
        return true;
    },

    /** Contributor search on disputes matches who resolved them (resolved_by), not who filed (user_id). */
    _disputeMatchesContributorFilter(row, contributorSet) {
        if (!contributorSet || contributorSet.size === 0) return true;
        const resolverId = row && row.resolved_by ? String(row.resolved_by).trim() : '';
        if (!resolverId) return false;
        return contributorSet.has(resolverId) || contributorSet.has(this._dashNormProfileId(resolverId));
    },

    _disputeInSearchDateRange(row, afterIso, beforeIso, contributorSet) {
        const filterByResolver = contributorSet && contributorSet.size > 0;
        const timestamp = filterByResolver
            ? (row && row.resolved_at ? String(row.resolved_at) : '')
            : (row && row.created_at ? String(row.created_at) : '');
        if (filterByResolver && !timestamp) return false;
        return this._disputeInCreatedAtRange(timestamp, afterIso, beforeIso);
    },

    async _fetchDisputesBulkPages(teamIds, statusParam, afterIso, beforeIso, contributorSet) {
        const allRows = [];
        let offset = 0;
        let pageNum = 0;
        let lastPageLen = 0;
        const useDateEarlyExit = Boolean(afterIso || beforeIso);
        let consecutiveEmptyFilteredPages = 0;
        while (pageNum < DASH_DISPUTES_MAX_PAGES) {
            const qs = new URLSearchParams({
                teamIds: teamIds.join(','),
                limit: String(DASH_DISPUTES_PAGE_SIZE),
                offset: String(offset)
            });
            if (statusParam) qs.set('status', statusParam);
            // Fleet /api/disputes does not document server-side date filters; send optional
            // params so they apply if the API supports them without breaking if ignored.
            if (afterIso) qs.set('createdAfter', afterIso);
            if (beforeIso) qs.set('createdBefore', beforeIso);
            let page;
            try {
                page = await this._fleetWebGetSearch(this._dashFleetWebPath('disputes_list') + '?' + qs.toString());
            } catch (e) {
                Logger.warn('dashboard: disputes bulk fetch failed' + (statusParam ? ' (' + statusParam + ')' : ''), e);
                break;
            }
            const rows = (page && Array.isArray(page.disputes)) ? page.disputes : [];
            pageNum++;
            Logger.debug('dashboard: disputes bulk page ' + pageNum
                + (statusParam ? ' [' + statusParam + ']' : ' [open]')
                + ' — ' + rows.length + ' rows (offset ' + offset + ')');
            allRows.push(...rows);
            lastPageLen = rows.length;
            if (useDateEarlyExit && rows.length > 0) {
                const passing = rows.filter((row) => (
                    row && row.eval_task_id
                    && this._disputeMatchesContributorFilter(row, contributorSet)
                    && this._disputeInSearchDateRange(row, afterIso, beforeIso, contributorSet)
                ));
                if (passing.length === 0) {
                    consecutiveEmptyFilteredPages++;
                    if (consecutiveEmptyFilteredPages >= DASH_DISPUTES_DATE_FILTER_MAX_EMPTY_PAGES) {
                        Logger.debug('dashboard: disputes bulk early stop — '
                            + consecutiveEmptyFilteredPages + ' pages with no rows in date range');
                        break;
                    }
                } else {
                    consecutiveEmptyFilteredPages = 0;
                }
            }
            if (rows.length < DASH_DISPUTES_PAGE_SIZE) break;
            offset += DASH_DISPUTES_PAGE_SIZE;
        }
        const capped = pageNum >= DASH_DISPUTES_MAX_PAGES && lastPageLen >= DASH_DISPUTES_PAGE_SIZE;
        if (capped) {
            Logger.warn('dashboard: disputes bulk pagination capped at ' + DASH_DISPUTES_MAX_PAGES
                + ' pages — results may be incomplete; narrow the date range');
        }
        return { rows: allRows, capped };
    },

    async _fetchDisputesBulkForSearch(authorIds, afterIso, beforeIso, scope) {
        const teamIds = (scope && scope.teamIds) || [];
        if (teamIds.length === 0) {
            Logger.debug('dashboard: disputes bulk skipped — no team scope');
            return { byTaskId: new Map(), rows: [], bulkIncomplete: false };
        }
        const contributorSet = authorIds.length > 0
            ? new Set(authorIds.flatMap((id) => {
                const raw = String(id).trim();
                if (!raw) return [];
                const norm = this._dashNormProfileId(raw);
                return norm === raw ? [raw] : [raw, norm];
            }))
            : null;
        let openRows = [];
        let resolvedRows = [];
        let bulkIncomplete = false;
        if (contributorSet) {
            const resolvedResult = await this._fetchDisputesBulkPages(
                teamIds, 'resolved', afterIso, beforeIso, contributorSet
            );
            resolvedRows = resolvedResult.rows;
            bulkIncomplete = resolvedResult.capped;
        } else {
            const [openResult, resolvedResult] = await Promise.all([
                this._fetchDisputesBulkPages(teamIds, null, afterIso, beforeIso, contributorSet),
                this._fetchDisputesBulkPages(teamIds, 'resolved', afterIso, beforeIso, contributorSet)
            ]);
            openRows = openResult.rows;
            resolvedRows = resolvedResult.rows;
            bulkIncomplete = openResult.capped || resolvedResult.capped;
        }
        const seenIds = new Set();
        const allRows = [];
        for (const row of [...openRows, ...resolvedRows]) {
            if (!row || row.id == null || seenIds.has(row.id)) continue;
            seenIds.add(row.id);
            allRows.push(row);
        }
        const filtered = allRows.filter((row) => {
            if (!row || !row.eval_task_id) return false;
            if (!this._disputeMatchesContributorFilter(row, contributorSet)) return false;
            if (!this._disputeInSearchDateRange(row, afterIso, beforeIso, contributorSet)) return false;
            return true;
        });
        const byTaskId = new Map();
        for (const row of filtered) {
            const taskId = row.eval_task_id;
            const bucket = byTaskId.get(taskId);
            if (bucket) bucket.push(row);
            else byTaskId.set(taskId, [row]);
        }
        Logger.log('dashboard: disputes bulk — ' + openRows.length + ' open, ' + resolvedRows.length
            + ' resolved, ' + filtered.length + ' after filter'
            + (contributorSet ? ' (resolver resolved_by + resolved_at)' : ' (created_at)')
            + ' across ' + byTaskId.size + ' task(s)'
            + (bulkIncomplete ? ' · bulk pagination capped' : ''));
        if (bulkIncomplete) {
            Logger.warn('dashboard: disputes bulk incomplete — narrow the date range or team scope');
        }
        return { byTaskId, rows: filtered, bulkIncomplete };
    },

    _disputeRowsToDisplays(rows, profilesMap) {
        const lib = dashLib();
        return (rows || []).map((row) => lib.buildDisputeDisplay(row, profilesMap));
    },

    _addCreatedAtRange(qs, afterIso, beforeIso) {
        // PostgREST cannot repeat the `created_at` key in a flat param object, so a two-sided
        // range is expressed with the and=() group. Single-sided uses the plain operator.
        if (afterIso && beforeIso) {
            qs['and'] = `(created_at.gte.${afterIso},created_at.lte.${beforeIso})`;
        } else if (afterIso) {
            qs['created_at'] = `gte.${afterIso}`;
        } else if (beforeIso) {
            qs['created_at'] = `lte.${beforeIso}`;
        }
        return qs;
    },

    _projectIdFromTargetId(targetId, targetToProjectId) {
        if (!targetId) return '';
        return (targetToProjectId && targetToProjectId.get(targetId)) || '';
    },

    /** When any scope `in.(…)` list exceeds PG_IN_MAX, return override objects to fan out requests. */
    _scopeQueryVariants(scope) {
        const max = dashLib().PG_IN_MAX;
        let variants = [{}];
        const multiply = (field, values, active) => {
            if (!active || !values || values.length <= max) return;
            const chunks = dashPgInChunks(values);
            const next = [];
            for (const base of variants) {
                for (const chunk of chunks) {
                    next.push(Object.assign({}, base, { [field]: chunk }));
                }
            }
            variants = next;
        };
        multiply('teamIds', scope.teamIds, scope.teamIds.length > 0);
        multiply('envKeys', scope.envKeys, scope.narrowedEnvs && scope.envKeys.length > 0);
        multiply('targetIds', scope.targetIds, scope.hasProjectFilter && scope.targetIds.length > 0);
        return variants;
    },

    _authorQueryVariants(authorIds) {
        const ids = [...new Set((authorIds || []).filter(Boolean))];
        if (ids.length === 0) return [null];
        return dashPgInChunks(ids);
    },

    async _fetchProfilesByIds(profileIds, logContext) {
        const chunks = dashPgInChunks(profileIds);
        if (chunks.length === 0) return [];
        const all = [];
        for (const chunk of chunks) {
            const rows = await this._pgQuery('profiles.select_person', {
                id: dashPgInFilter(chunk)
            }, logContext || 'search').catch((e) => {
                Logger.warn('dashboard: profile lookup chunk failed', e);
                return [];
            });
            all.push(...rows);
        }
        return all;
    },

    async _fetchTargetProjectMap(targetIds) {
        if (!targetIds || targetIds.length === 0) return new Map();
        const map = new Map();
        for (const chunk of dashPgInChunks(targetIds)) {
            const rows = await this._pgQuery('task_project_targets.select_project_map', {
                id: dashPgInFilter(chunk),
                limit: String(chunk.length)
            }, 'search').catch((e) => { Logger.warn('dashboard: target→project lookup failed', e); return []; });
            for (const r of rows) if (r.id && r.project_id) map.set(r.id, r.project_id);
        }
        Logger.debug('dashboard: target→project map built (' + map.size + ' / ' + targetIds.length + ' targets resolved)');
        return map;
    },

    _buildProfilesMap(profileRows) {
        const map = new Map();
        for (const p of profileRows) map.set(p.id, { full_name: p.full_name, email: p.email });
        return map;
    },

    async _supplementProfilesMap(profilesMap, extraIds) {
        const missing = [...new Set((extraIds || []).filter(Boolean))]
            .filter((id) => !profilesMap.has(id));
        if (missing.length === 0) return;
        const rows = await this._fetchProfilesByIds(missing, 'search');
        for (const [id, profile] of this._buildProfilesMap(rows)) {
            profilesMap.set(id, profile);
        }
        Logger.debug('dashboard: supplemental profiles resolved (' + rows.length + ' / ' + missing.length + ')');
    },

    _rowToTask(row, profilesMap, versionOverride, targetToProjectId) {
        const version = versionOverride || dashFirstEmbed(row.eval_task_versions);
        const profile = profilesMap.get(row.created_by) || null;
        const projectId = this._projectIdFromTargetId(row.task_project_target_id, targetToProjectId);
        const prompt = (version && version.prompt) || '';
        if (!prompt) {
            Logger.debug('dashboard: empty prompt — task ' + (row.id || '?')
                + ' · version ' + (version && version.id ? version.id.slice(0, 8) + '…' : 'none')
                + ' · source ' + (versionOverride ? 'version-at-feedback' : 'current-version-embed'));
        }
        return {
            id: row.id,
            key: row.key || '',
            author: {
                id: row.created_by || '',
                name: profile ? this._personChipName(profile, row.created_by) : '',
                email: (profile && profile.email) || ''
            },
            prompt,
            environment: (version && version.env_key) || row.env_key || '',
            project: this._projectName(projectId),
            team: this._teamName(row.team_id),
            teamId: row.team_id || '',
            projectId: projectId || '',
            envKey: (version && version.env_key) || row.env_key || '',
            createdAt: row.created_at || '',
            status: row.task_lifecycle_status || ''
        };
    },

    // ── Person search for author tokens ──

    async _searchPersons(query) {
        const q = (query || '').trim();
        if (!q) return [];
        if (DASH_UUID_RE.test(q)) {
            const rows = await this._pgQuery('profiles.select_person', { id: 'eq.' + q, limit: 1 }, 'author');
            return rows.map((p) => ({ id: p.id, full_name: p.full_name, email: p.email }));
        }
        const safe = q.replace(/[(),*]/g, ' ').trim();
        if (!safe) return [];
        const rows = await this._pgQuery('profiles.select_person', {
            or: `(full_name.ilike.*${safe}*,email.ilike.*${safe}*)`,
            order: 'full_name.asc',
            limit: 50
        }, 'author');
        const mapped = rows.map((p) => ({ id: p.id, full_name: p.full_name, email: p.email }));
        return this._filterAndRankPersons(mapped, q);
    },

    _personRawName(person) {
        return String(person && (person.full_name ?? person.name) || '').trim();
    },

    _personNameLooksLikeId(rawName, id) {
        return Boolean(rawName && id && rawName.toLowerCase() === id.toLowerCase());
    },

    /** Name field for person chips (email shown separately when name is absent). */
    _personChipName(profile, personId) {
        if (!profile) return '';
        const rawName = this._personRawName(profile);
        const id = String(personId || profile.id || '').trim();
        return this._personNameLooksLikeId(rawName, id) ? '' : rawName;
    },

    /** Display label for a person: name when present, else email, else id. */
    _personDisplayLabel(person) {
        if (!person) return '';
        const id = String(person.id || '').trim();
        const rawName = this._personRawName(person);
        const email = String(person.email || '').trim();
        const name = this._personNameLooksLikeId(rawName, id) ? '' : rawName;
        return name || email || id;
    },

    _personSearchHaystack(person) {
        return `${person.full_name || ''} ${person.email || ''}`.toLowerCase();
    },

    _personMatchesQuery(person, query) {
        const q = String(query || '').trim();
        if (!q) return false;
        if (DASH_UUID_RE.test(q)) return person.id.toLowerCase() === q.toLowerCase();
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        if (words.length === 0) return false;
        const haystack = this._personSearchHaystack(person);
        return words.every((word) => haystack.includes(word));
    },

    _scorePersonMatch(person, query) {
        const q = String(query || '').trim().toLowerCase();
        const name = String(person.full_name || '').toLowerCase();
        const email = String(person.email || '').toLowerCase();
        if (!q) return 0;
        if (name === q) return 100;
        if (email === q) return 95;
        if (name.startsWith(q)) return 90;
        if (email.startsWith(q)) return 85;
        if (name.includes(q)) return 80;
        if (email.includes(q)) return 75;
        const words = q.split(/\s+/).filter(Boolean);
        if (words.length > 1 && words.every((w) => name.includes(w))) return 70;
        if (words.every((w) => this._personSearchHaystack(person).includes(w))) return 60;
        return 0;
    },

    _filterAndRankPersons(persons, query) {
        return persons
            .filter((p) => this._personMatchesQuery(p, query))
            .sort((a, b) => this._scorePersonMatch(b, query) - this._scorePersonMatch(a, query))
            .slice(0, 20);
    },

    // ── Bootstrap (projects + environments) ──

    async _runBootstrap() {
        const ops = this._dashOpsTab();
        const profileId = this._dashGetCurrentUserId();
        if (!profileId) {
            throw new Error('Fleet user id unavailable. Open Fleet while logged in.');
        }

        const projectsParams = {
            status: 'neq.archived',
            order: 'created_at.desc',
            limit: '400'
        };

        const userTeams = await ops.fetchUserTeamCatalog(profileId);
        const teams = userTeams.map((t) => ({
            id: t.id,
            name: t.name,
            displayName: t.displayName || this._dashFormatTeamDisplayLabel(t.name)
        }));
        const teamIds = userTeams
            .filter((t) => this._dashIsTaskDesignersTeam(t.name))
            .map((t) => t.id);

        const fetchBootstrapProjects = async () => {
            if (teamIds.length === 0) {
                return this._pgQuery('task_projects.select_bootstrap', projectsParams, 'bootstrap');
            }
            const teamChunks = dashPgInChunks(teamIds);
            const merged = [];
            for (const chunk of teamChunks) {
                const params = Object.assign({}, projectsParams, { team_id: dashPgInFilter(chunk) });
                const page = await this._pgQuery('task_projects.select_bootstrap', params, 'bootstrap').catch((e) => {
                    Logger.warn('dashboard: bootstrap projects fetch failed', e);
                    return [];
                });
                merged.push(...page);
            }
            return merged;
        };

        const [projectPages, environments] = await Promise.all([
            fetchBootstrapProjects(),
            this._pgQuery('environments.select_bootstrap', {
                deleted_at: 'is.null',
                order: 'env_key.asc'
            }, 'bootstrap')
        ]);
        const projectsById = new Map();
        const projectRows = Array.isArray(projectPages) ? projectPages : [];
        for (const row of projectRows) if (!projectsById.has(row.id)) projectsById.set(row.id, row);
        const projects = Array.from(projectsById.values());
        return this._writeBootstrapCache({ profileId, teams, projects, environments });
    },

    async _doBootstrap() {
        this._state.bootstrapStatus = 'loading';
        this._state.bootstrapError = null;
        this._refreshCatalogDependentUi();
        try {
            const result = await this._runBootstrap();
            this._state.catalog = result;
            this._state.bootstrapStatus = 'done';
            this._state.sessionRefreshRequired = false;
            Logger.log('dashboard: bootstrap complete (' + (result.teams ? result.teams.length : 0) + ' teams, '
                + result.projects.length + ' projects, ' + result.environments.length + ' environments)');
        } catch (err) {
            if (this._handleDashSessionRefreshError(err)) {
                this._state.bootstrapError = null;
            } else {
                this._state.bootstrapError = err.message;
                this._state.sessionRefreshRequired = false;
            }
            this._state.bootstrapStatus = 'error';
            Logger.warn('dashboard: bootstrap failed', err);
        } finally {
            this._refreshCatalogDependentUi();
            if (this._state.autoHydratePending && this._isOpen()) {
                this._scheduleAutoHydrateVisiblePage();
            }
        }
    },

    // ── Worker output search ──

    async _fetchTargetIdsForProjects(projectIds) {
        if (!projectIds || projectIds.length === 0) return [];
        const ids = [];
        for (const chunk of dashPgInChunks(projectIds)) {
            const rows = await this._pgQuery('task_project_targets.select_ids', {
                project_id: dashPgInFilter(chunk),
                limit: '500'
            }, 'search').catch((e) => { Logger.warn('dashboard: project→target lookup failed', e); return []; });
            for (const r of rows) if (r.id) ids.push(r.id);
        }
        Logger.debug('dashboard: project→target ids (' + ids.length + ' for ' + projectIds.length + ' project(s))');
        return ids;
    },

    _availableSearchProjects() {
        const catalog = this._state.catalog;
        if (!catalog || !catalog.projects) return [];
        const selectedTeams = this._selectedFromList('search-teams');
        if (selectedTeams.length === 0) return catalog.projects;
        const filtered = catalog.projects.filter((p) => selectedTeams.includes(p.team_id));
        return filtered.length > 0 ? filtered : catalog.projects;
    },

    async _buildSearchApiScope() {
        const teamCatalog = this._getSearchableTeamCatalog();
        const allTeamIds = teamCatalog.map(([id]) => id);
        const selectedTeams = this._selectedFromList('search-teams');
        const teamIds = selectedTeams.length > 0 ? selectedTeams : allTeamIds;

        const envCatalog = (this._state.catalog && this._state.catalog.environments) || [];
        const allEnvKeys = envCatalog.map((e) => e.env_key);
        const selectedEnvs = this._selectedFromList('search-envs');
        const envKeys = selectedEnvs.length > 0 ? selectedEnvs : allEnvKeys;

        const availableProjects = this._availableSearchProjects();
        const allProjectIds = availableProjects.map((p) => p.id);
        const selectedProjects = this._selectedFromList('search-projects');
        const projectIds = selectedProjects.length > 0 ? selectedProjects : allProjectIds;
        const hasProjectFilter = selectedProjects.length > 0;
        let targetIds = [];
        if (hasProjectFilter) {
            const cacheKey = projectIds.slice().sort().join(',');
            if (this._state.targetIdsCacheKey === cacheKey && Array.isArray(this._state.targetIdsCache)) {
                targetIds = this._state.targetIdsCache;
                Logger.debug('dashboard: project→target ids from cache (' + targetIds.length + ' targets)');
            } else {
                this._setSearchLoadPhase('Resolving project targets…');
                targetIds = await this._fetchTargetIdsForProjects(projectIds);
                this._state.targetIdsCacheKey = cacheKey;
                this._state.targetIdsCache = targetIds;
            }
        }

        const scope = { teamIds, envKeys, projectIds, targetIds, hasProjectFilter,
            narrowedTeams: selectedTeams.length > 0,
            narrowedEnvs: selectedEnvs.length > 0,
            narrowedProjects: hasProjectFilter
        };
        Logger.debug('dashboard: search API scope — teams ' + teamIds.length
            + ', envs ' + envKeys.length + ', projects ' + projectIds.length
            + (hasProjectFilter ? ', targets ' + targetIds.length : ''));
        return scope;
    },

    _applyTaskScopeToQs(qs, scope, scopeOverrides) {
        const o = scopeOverrides || {};
        const teamIds = o.teamIds !== undefined ? o.teamIds : scope.teamIds;
        const envKeys = o.envKeys !== undefined ? o.envKeys : scope.envKeys;
        const targetIds = o.targetIds !== undefined ? o.targetIds : scope.targetIds;
        if (teamIds.length > 0) {
            const f = dashPgInFilter(teamIds);
            if (!f) return false;
            qs.team_id = f;
        }
        if (scope.narrowedEnvs && envKeys.length > 0) {
            const f = dashPgInFilter(envKeys);
            if (!f) return false;
            qs.env_key = f;
        }
        if (scope.hasProjectFilter) {
            if (targetIds.length === 0) return false;
            const f = dashPgInFilter(targetIds);
            if (!f) return false;
            qs.task_project_target_id = f;
        }
        return true;
    },

    _applyTaskScopeToQaQs(qs, scope, scopeOverrides) {
        const ops = this._dashOpsTab();
        const o = scopeOverrides || {};
        const teamIds = o.teamIds !== undefined ? o.teamIds : scope.teamIds;
        const envKeys = o.envKeys !== undefined ? o.envKeys : scope.envKeys;
        const targetIds = o.targetIds !== undefined ? o.targetIds : scope.targetIds;
        if (teamIds.length > 0) {
            const f = dashPgInFilter(teamIds);
            if (!f) return false;
            qs[ops.getScopedField('qa_embed_team')] = f;
        }
        if (scope.narrowedEnvs && envKeys.length > 0) {
            const f = dashPgInFilter(envKeys);
            if (!f) return false;
            qs[ops.getScopedField('qa_embed_env')] = f;
        }
        if (scope.hasProjectFilter) {
            if (targetIds.length === 0) return false;
            const f = dashPgInFilter(targetIds);
            if (!f) return false;
            qs[ops.getScopedField('qa_embed_target')] = f;
        }
        return true;
    },

    async _fetchTaskRowsForSearch(authorIds, afterIso, beforeIso, scope) {
        if (scope.hasProjectFilter && scope.targetIds.length === 0) {
            Logger.debug('dashboard: tasks skipped — project filter matched no targets');
            return [];
        }
        Logger.debug('dashboard: fetching tasks — ' + (authorIds.length > 0 ? authorIds.length + ' author(s)' : 'all authors')
            + (scope.teamIds.length > 0 ? ' · ' + scope.teamIds.length + ' team(s)' : '')
            + (afterIso ? ' · after ' + afterIso : '') + (beforeIso ? ' · before ' + beforeIso : ''));
        const byId = new Map();
        const authorVariants = this._authorQueryVariants(authorIds);
        const scopeVariants = this._scopeQueryVariants(scope);
        let pageNum = 0;
        for (const authorChunk of authorVariants) {
            for (const scopeOverride of scopeVariants) {
                let offset = 0;
                while (true) {
                    const qs = {
                        order: 'created_at.desc',
                        offset: String(offset),
                        limit: String(DASH_TASKS_PAGE_SIZE)
                    };
                    if (authorChunk) {
                        const f = dashPgInFilter(authorChunk);
                        if (!f) continue;
                        qs.created_by = f;
                    }
                    if (!this._applyTaskScopeToQs(qs, scope, scopeOverride)) continue;
                    this._addCreatedAtRange(qs, afterIso, beforeIso);
                    const page = await this._pgQuery('tasks.select_search', qs, 'search');
                    pageNum++;
                    Logger.debug('dashboard: tasks page ' + pageNum + ' — ' + page.length + ' rows (offset ' + offset + ')');
                    for (const row of page) if (row && row.id) byId.set(row.id, row);
                    if (page.length < DASH_TASKS_PAGE_SIZE) break;
                    offset += DASH_TASKS_PAGE_SIZE;
                }
            }
        }
        const allRows = [...byId.values()];
        Logger.debug('dashboard: tasks fetched (' + allRows.length + ' rows)');
        return allRows;
    },

    async _fetchTaskRowsByIds(taskIds, scope) {
        if (!taskIds || taskIds.length === 0) return [];
        const scopeVariants = this._scopeQueryVariants(scope);
        const byId = new Map();
        for (const chunk of dashPgInChunks(taskIds)) {
            for (const scopeOverride of scopeVariants) {
                const qs = {
                    id: dashPgInFilter(chunk),
                    limit: String(chunk.length)
                };
                if (!this._applyTaskScopeToQs(qs, scope, scopeOverride)) continue;
                const page = await this._pgQuery('tasks.select_search', qs, 'search');
                Logger.debug('dashboard: tasks by id chunk — ' + page.length + ' rows');
                for (const row of page) if (row && row.id) byId.set(row.id, row);
            }
        }
        return [...byId.values()];
    },

    async _fetchQaFeedbackRowsForSearch(authorIds, afterIso, beforeIso, scope) {
        if (scope.hasProjectFilter && scope.targetIds.length === 0) {
            Logger.debug('dashboard: QA skipped — project filter matched no targets');
            return [];
        }
        const useTaskScopeEmbed = scope.teamIds.length > 0;
        Logger.debug('dashboard: fetching QA feedback — ' + (authorIds.length > 0 ? authorIds.length + ' author(s)' : 'all authors')
            + (afterIso ? ' · after ' + afterIso : '') + (beforeIso ? ' · before ' + beforeIso : '')
            + (useTaskScopeEmbed ? ' · task scope embed (teams)' : ''));
        const seenFeedbackIds = new Set();
        const allFeedback = [];
        let pageNum = 0;
        const qaQueryKey = useTaskScopeEmbed ? 'qa_feedback.select_row_scoped' : 'qa_feedback.select_row';
        const authorVariants = this._authorQueryVariants(authorIds);
        const scopeVariants = useTaskScopeEmbed ? this._scopeQueryVariants(scope) : [{}];
        for (const authorChunk of authorVariants) {
            for (const scopeOverride of scopeVariants) {
                let offset = 0;
                while (true) {
                    const qs = {
                        order: 'created_at.desc',
                        offset: String(offset),
                        limit: String(DASH_QA_PAGE_SIZE)
                    };
                    if (authorChunk) {
                        const f = dashPgInFilter(authorChunk);
                        if (!f) continue;
                        qs.created_by = f;
                    }
                    if (useTaskScopeEmbed && !this._applyTaskScopeToQaQs(qs, scope, scopeOverride)) continue;
                    this._addCreatedAtRange(qs, afterIso, beforeIso);
                    const page = await this._pgQuery(qaQueryKey, qs, 'search');
                    pageNum++;
                    Logger.debug('dashboard: QA feedback page ' + pageNum + ' — ' + page.length + ' rows (offset ' + offset + ')');
                    for (const row of page) {
                        if (!row || !row.id || seenFeedbackIds.has(row.id)) continue;
                        seenFeedbackIds.add(row.id);
                        allFeedback.push(row);
                    }
                    if (page.length < DASH_QA_PAGE_SIZE) break;
                    offset += DASH_QA_PAGE_SIZE;
                }
            }
        }
        Logger.debug('dashboard: QA feedback rows fetched (' + allFeedback.length + ' total)');
        return allFeedback;
    },

    async _fetchQaFeedbackRowsForTaskIds(taskIds, scope) {
        if (!taskIds || taskIds.length === 0) return [];
        if (scope.hasProjectFilter && scope.targetIds.length === 0) return [];
        const allFeedback = [];
        const seenFeedbackIds = new Set();
        for (const chunk of dashPgInChunks(taskIds)) {
            const qs = {
                eval_task_id: dashPgInFilter(chunk),
                order: 'created_at.desc',
                limit: '500'
            };
            const page = await this._pgQuery('qa_feedback.select_row', qs, 'search');
            Logger.debug('dashboard: QA feedback by task id chunk — ' + page.length + ' rows');
            for (const row of page) {
                if (!row || !row.id || seenFeedbackIds.has(row.id)) continue;
                seenFeedbackIds.add(row.id);
                allFeedback.push(row);
            }
        }
        return allFeedback;
    },

    async _buildQuickTasksById(taskRows, feedbackRows) {
        const taskById = new Map(taskRows.map((row) => [row.id, row]));
        const profileIds = new Set();
        for (const row of taskRows) if (row.created_by) profileIds.add(row.created_by);
        for (const fb of feedbackRows) if (fb.created_by) profileIds.add(fb.created_by);

        const uniqueTargetIds = [...new Set(taskRows.map((r) => r.task_project_target_id).filter(Boolean))];
        const profileIdsArr = [...profileIds];
        const [profileRows, targetToProjectId] = await Promise.all([
            profileIdsArr.length > 0 ? this._fetchProfilesByIds(profileIdsArr, 'search') : [],
            this._fetchTargetProjectMap(uniqueTargetIds)
        ]);
        const profilesMap = this._buildProfilesMap(profileRows);
        Logger.debug('dashboard: quick search profiles resolved (' + profileRows.length + ' / ' + profileIds.size + ')');

        const quickTasksById = new Map();
        for (const taskId of taskById.keys()) {
            const taskRow = taskById.get(taskId);
            if (!taskRow) continue;
            const task = this._rowToTask(taskRow, profilesMap, null, targetToProjectId);
            task.promptVersions = [];
            task.allFeedback = [];
            quickTasksById.set(taskId, task);
        }
        return { enrichedTasksById: quickTasksById, profilesMap };
    },

    _qaItemsFromFeedbackRows(feedbackRows, enrichedTasksById, profilesMap) {
        const items = [];
        for (const feedback of feedbackRows) {
            const task = enrichedTasksById.get(feedback.eval_task_id);
            if (!task) continue;
            const feedbackEntry = (task.allFeedback || []).find((f) => f.id === feedback.id);
            let qaFeedback = feedbackEntry ? feedbackEntry.display : null;
            if (!qaFeedback) {
                const qaReviewerProfile = profilesMap.get(feedback.created_by) || null;
                const rawLike = (task.promptVersions || []).map((v) => ({
                    id: v.id,
                    version_no: v.versionNo,
                    created_at: v.createdAt,
                    prompt: v.prompt,
                    env_key: v.envKey
                }));
                const versionInfo = dashLib().resolveVersionAtFeedback(rawLike, feedback.created_at);
                qaFeedback = dashLib().buildQaFeedbackDisplay(feedback, versionInfo, {
                    id: feedback.created_by,
                    name: qaReviewerProfile ? this._personChipName(qaReviewerProfile, feedback.created_by) : '',
                    email: (qaReviewerProfile && qaReviewerProfile.email) || ''
                });
            }
            items.push({
                id: 'qa-' + feedback.id,
                kind: 'qa',
                sortAt: feedback.created_at,
                task,
                selectedFeedbackId: feedback.id,
                qaFeedback,
                disputes: []
            });
        }
        items.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));
        const positiveCount = items.filter((it) => it.qaFeedback && it.qaFeedback.isPositive).length;
        Logger.log('dashboard: QA items built — ' + items.length + ' total (' + positiveCount + ' accepted, ' + (items.length - positiveCount) + ' returned)');
        return items;
    },

    _taskCreationItemsFromTasks(tasks) {
        return tasks.map((task) => ({
            id: 'task-' + task.id,
            kind: 'task_creation',
            sortAt: task.createdAt,
            task,
            selectedFeedbackId: null,
            qaFeedback: null,
            disputes: []
        }));
    },

    _disputeItemsFromRows(disputeByTaskId, enrichedTasksById, profilesMap) {
        const items = [];
        for (const [taskId, rows] of disputeByTaskId) {
            const task = enrichedTasksById.get(taskId);
            if (!task || !rows || rows.length === 0) continue;
            let sortAt = rows[0].resolved_at || rows[0].created_at || '';
            for (const row of rows) {
                const candidate = row.resolved_at || row.created_at;
                if (candidate && candidate > sortAt) sortAt = candidate;
            }
            const linkedFeedbackId = rows.find((r) => r.feedback_id != null);
            items.push({
                id: 'dispute-' + taskId,
                kind: 'dispute',
                sortAt,
                task,
                selectedFeedbackId: linkedFeedbackId ? String(linkedFeedbackId.feedback_id) : null,
                qaFeedback: null,
                disputes: this._disputeRowsToDisplays(rows, profilesMap)
            });
        }
        items.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));
        Logger.log('dashboard: dispute items built — ' + items.length);
        return items;
    },

    _mergeBulkDisputesOntoItem(item, bulkRows, profilesMap) {
        const displays = this._disputeRowsToDisplays(bulkRows, profilesMap);
        const existing = item.disputes || [];
        const seen = new Set(existing.map((d) => d.id).filter(Boolean));
        const merged = [...existing];
        for (const d of displays) {
            if (!d.id || seen.has(d.id)) continue;
            seen.add(d.id);
            merged.push(d);
        }
        item.disputes = merged;
    },

    _attachDisputesToMergedItems(mergedItems, bulkByTaskId, profilesMap) {
        if (!mergedItems || mergedItems.length === 0 || !bulkByTaskId || bulkByTaskId.size === 0) {
            return mergedItems;
        }
        let attached = 0;
        let skipped = 0;
        for (const item of mergedItems) {
            const taskId = item.task.id;
            const bulkRows = bulkByTaskId.get(taskId);
            if (!bulkRows || bulkRows.length === 0) {
                skipped++;
                continue;
            }
            this._mergeBulkDisputesOntoItem(item, bulkRows, profilesMap);
            if (!item.kinds.includes('dispute')) item.kinds.push('dispute');
            item.kinds.sort((a, b) => DASH_KIND_MERGE_ORDER.indexOf(a) - DASH_KIND_MERGE_ORDER.indexOf(b));
            attached++;
        }
        Logger.log('dashboard: disputes attached from bulk — ' + attached + ' card(s)');
        Logger.debug('dashboard: disputes bulk attach skipped — ' + skipped + ' card(s) with no in-scope dispute');
        return mergedItems;
    },

    async _fetchWorkerOutputSearch({ authorIds, includeTaskCreation, includeQa, includeDisputes, afterIso, beforeIso, scope, searchDepth }) {
        this._state.disputesBulkIncomplete = false;
        this._setSearchLoadPhase(this._searchFetchSourcesLabel({
            includeTaskCreation,
            includeQa,
            includeDisputes
        }));
        const disputesPromise = includeDisputes
            ? this._fetchDisputesBulkForSearch(authorIds, afterIso, beforeIso, scope)
            : Promise.resolve({ byTaskId: new Map(), rows: [], bulkIncomplete: false });
        const tasksPromise = includeTaskCreation
            ? this._fetchTaskRowsForSearch(authorIds, afterIso, beforeIso, scope)
            : Promise.resolve([]);
        const qaPromise = includeQa
            ? this._fetchQaFeedbackRowsForSearch(authorIds, afterIso, beforeIso, scope)
            : Promise.resolve([]);

        const [disputesBulk, creationRows, feedbackRows] = await Promise.all([
            disputesPromise,
            tasksPromise,
            qaPromise
        ]);
        const bulkByTaskId = disputesBulk.byTaskId;
        this._state.disputesBulkIncomplete = Boolean(includeDisputes && disputesBulk.bulkIncomplete);

        const disputeTaskIds = includeDisputes ? [...bulkByTaskId.keys()] : [];

        const creationIds = new Set(creationRows.map((r) => r.id));
        const qaTaskIds = [...new Set(feedbackRows.map((f) => f.eval_task_id).filter(Boolean))];
        const missingQaTaskIds = qaTaskIds.filter((id) => !creationIds.has(id));
        const missingDisputeTaskIds = disputeTaskIds.filter((id) => !creationIds.has(id) && !qaTaskIds.includes(id));
        if (missingQaTaskIds.length > 0 || missingDisputeTaskIds.length > 0) {
            this._setSearchLoadPhase('Loading tasks linked from QA and disputes…');
        }
        const [qaOnlyRows, disputeOnlyRows] = await Promise.all([
            missingQaTaskIds.length > 0
                ? this._fetchTaskRowsByIds(missingQaTaskIds, scope)
                : [],
            missingDisputeTaskIds.length > 0
                ? this._fetchTaskRowsByIds(missingDisputeTaskIds, scope)
                : []
        ]);

        const allTaskRows = [...creationRows];
        const seenIds = new Set(creationIds);
        for (const row of qaOnlyRows) {
            if (!seenIds.has(row.id)) {
                seenIds.add(row.id);
                allTaskRows.push(row);
            }
        }
        for (const row of disputeOnlyRows) {
            if (!seenIds.has(row.id)) {
                seenIds.add(row.id);
                allTaskRows.push(row);
            }
        }

        let allFeedbackRows = [...feedbackRows];
        if (includeDisputes && disputeTaskIds.length > 0 && !includeQa) {
            this._setSearchLoadPhase('Loading QA feedback for dispute tasks…');
            const disputeQaRows = await this._fetchQaFeedbackRowsForTaskIds(disputeTaskIds, scope);
            const seenFb = new Set(allFeedbackRows.map((f) => f.id));
            for (const fb of disputeQaRows) {
                if (!seenFb.has(fb.id)) {
                    seenFb.add(fb.id);
                    allFeedbackRows.push(fb);
                }
            }
        }

        this._setSearchLoadPhase('Assembling results…');
        const { enrichedTasksById, profilesMap } = await this._buildQuickTasksById(allTaskRows, allFeedbackRows);
        if (includeDisputes && disputesBulk.rows.length > 0) {
            this._setSearchLoadPhase('Loading dispute resolver profiles…');
            await this._supplementProfilesMap(profilesMap, disputesBulk.rows.map((row) => row.resolved_by));
        }

        const items = [];
        if (includeTaskCreation) {
            const creationTasks = creationRows
                .map((row) => enrichedTasksById.get(row.id))
                .filter(Boolean);
            items.push(...this._taskCreationItemsFromTasks(creationTasks));
            Logger.log('dashboard: task creation items built — ' + creationTasks.length);
        }
        if (includeQa && feedbackRows.length > 0) {
            items.push(...this._qaItemsFromFeedbackRows(feedbackRows, enrichedTasksById, profilesMap));
        }
        if (includeDisputes && bulkByTaskId.size > 0) {
            const scopedBulk = new Map();
            for (const [taskId, rows] of bulkByTaskId) {
                if (enrichedTasksById.has(taskId)) scopedBulk.set(taskId, rows);
            }
            const disputeItems = this._disputeItemsFromRows(scopedBulk, enrichedTasksById, profilesMap);
            const existingTaskIds = new Set(items.map((it) => it.task.id));
            for (const disputeItem of disputeItems) {
                if (!existingTaskIds.has(disputeItem.task.id)) {
                    existingTaskIds.add(disputeItem.task.id);
                    items.push(disputeItem);
                }
            }
        }

        this._setSearchLoadPhase('Assembling result cards…');
        let mergedItems = this._mergeWorkerOutputItemsByTask(items);

        if (includeDisputes && mergedItems.length > 0 && bulkByTaskId.size > 0) {
            this._setSearchLoadPhase('Attaching disputes from bulk results…');
            mergedItems = this._attachDisputesToMergedItems(
                mergedItems,
                bulkByTaskId,
                profilesMap
            );
        }

        const resultItems = mergedItems.map((item) => Object.assign({}, item, { hydrated: false }));
        return {
            items: resultItems,
            allFeedbackRows,
            includeQa,
            includeDisputes
        };
    },

    _mergeWorkerOutputItemsByTask(items) {
        const byTask = new Map();
        for (const item of items) {
            const taskId = item.task.id;
            let merged = byTask.get(taskId);
            if (!merged) {
                merged = {
                    id: 'task-' + taskId,
                    kinds: new Set(),
                    sortAt: item.sortAt,
                    task: item.task,
                    selectedFeedbackId: null,
                    qaFeedback: null,
                    qaSortAt: '',
                    disputes: []
                };
                byTask.set(taskId, merged);
            }
            merged.kinds.add(item.kind);
            if (item.sortAt > merged.sortAt) merged.sortAt = item.sortAt;
            if (item.kind === 'qa') {
                if (!merged.selectedFeedbackId || item.sortAt >= merged.qaSortAt) {
                    merged.selectedFeedbackId = item.selectedFeedbackId || null;
                    merged.qaFeedback = item.qaFeedback || null;
                    merged.qaSortAt = item.sortAt;
                }
            }
            if (item.disputes && item.disputes.length > 0) {
                const seen = new Set(merged.disputes.map((d) => d.id));
                for (const d of item.disputes) {
                    if (!seen.has(d.id)) {
                        seen.add(d.id);
                        merged.disputes.push(d);
                    }
                }
            }
            if (item.hydrated === false) merged.hydrated = false;
            else if (merged.hydrated === undefined) merged.hydrated = item.hydrated !== false;
        }
        const mergedItems = [...byTask.values()].map((merged) => {
            const kinds = DASH_KIND_MERGE_ORDER.filter((k) => merged.kinds.has(k));
            return {
                id: merged.id,
                kind: kinds[0] || 'task_creation',
                kinds,
                sortAt: merged.sortAt,
                task: merged.task,
                selectedFeedbackId: merged.selectedFeedbackId,
                qaFeedback: merged.qaFeedback,
                disputes: merged.disputes,
                hydrated: merged.hydrated !== false
            };
        });
        const folded = items.length - mergedItems.length;
        if (folded > 0) {
            Logger.log('dashboard: merged duplicate task hits — ' + folded + ' row(s) folded into ' + mergedItems.length + ' card(s)');
        }
        return mergedItems;
    },

    _listBoundsFromOptions(options) {
        const opts = options || {};
        return {
            teamIds: (opts.teams || []).map((t) => t.id),
            projectIds: (opts.projects || []).map((p) => p.id),
            envKeys: (opts.envs || []).map((e) => e.id),
            statuses: (opts.statuses || []).map((s) => s.id),
            contributorIds: (opts.contributors || []).map((c) => c.id),
            promptRatings: (opts.promptRatings || []).map((r) => r.id),
            taskIssues: (opts.taskIssues || []).map((i) => i.id),
            returnTypes: (opts.returnTypes || []).map((r) => r.id),
            promptHistory: (opts.promptHistory || []).map((h) => h.id)
        };
    },

    _isDimensionAllSelected(selected, boundIds) {
        const bounds = boundIds || [];
        if (bounds.length === 0) return true;
        return (selected || []).length >= bounds.length;
    },

    _expandAppliedForBoundsGrowth(applied, prevBounds, newBounds) {
        const next = Object.assign({}, applied);
        for (const { draftKey } of DASH_FILTER_SCOPES) {
            const prevLen = (prevBounds[draftKey] || []).length;
            const newLen = (newBounds[draftKey] || []).length;
            if (prevLen === 0 && newLen > 0) {
                next[draftKey] = [...(newBounds[draftKey] || [])];
            }
        }
        return next;
    },

    _checkedIdsForFilterScope(draftKey, optionIds, applied, prevBounds, listBounds, prevSelected, syncFromApplied) {
        const boundIds = listBounds[draftKey] || [];
        const appliedSel = (applied && applied[draftKey]) || [];
        const prevBoundIds = (prevBounds && prevBounds[draftKey]) || [];

        if (syncFromApplied && applied) {
            if (this._isDimensionAllSelected(appliedSel, boundIds)) {
                return new Set(optionIds);
            }
            return new Set(appliedSel.filter((id) => optionIds.includes(id)));
        }

        if (prevBoundIds.length === 0 && boundIds.length > 0 && appliedSel.length === 0) {
            return new Set(optionIds);
        }

        if (prevSelected !== null && prevBoundIds.length > 0) {
            return prevSelected;
        }

        if (applied && this._isDimensionAllSelected(appliedSel, boundIds)) {
            return new Set(optionIds);
        }

        if (appliedSel.length > 0) {
            return new Set(appliedSel.filter((id) => optionIds.includes(id)));
        }

        return new Set();
    },

    _readSearchDepthPref() {
        try {
            const v = this._pageWindow().localStorage.getItem(DASH_SEARCH_DEPTH_STORAGE_KEY);
            if (v === 'deep' || v === 'quick') return v;
        } catch (_e) { /* ignore */ }
        return 'quick';
    },

    _persistSearchDepthPref(depth) {
        try {
            this._pageWindow().localStorage.setItem(DASH_SEARCH_DEPTH_STORAGE_KEY, depth === 'deep' ? 'deep' : 'quick');
        } catch (e) {
            Logger.debug('dashboard: could not persist search depth', e);
        }
    },

    _getSearchDepthFromUi() {
        const deepBtn = this._q('#wf-dash-depth-deep');
        return deepBtn && deepBtn.getAttribute('aria-pressed') === 'true' ? 'deep' : 'quick';
    },

    _btnDepthSegmentStyle(active) {
        const base = 'flex: 1; padding: 7px 14px; font-size: 12px; font-weight: 600; cursor: pointer; border-radius: 6px;';
        if (active) {
            return base + ' ' + DASH_SEARCH_DEPTH_TOGGLE_ACTIVE;
        }
        return base + ' ' + DASH_TOGGLE_INACTIVE;
    },

    _syncSearchDepthHint() {
        const hintEl = this._q('#wf-dash-search-depth-hint');
        if (!hintEl) return;
        const depth = this._state.searchDepth || 'quick';
        const hint = this._hintStyle();
        hintEl.innerHTML = `<span style="${hint} line-height: 1.4;">${dashEscHtml(DASH_SEARCH_DEPTH_HINTS[depth] || '')}</span>`;
    },

    _syncSearchDepthUi() {
        const depth = this._state.searchDepth || this._readSearchDepthPref();
        this._state.searchDepth = depth;
        const quickBtn = this._q('#wf-dash-depth-quick');
        const deepBtn = this._q('#wf-dash-depth-deep');
        if (quickBtn) {
            const active = depth === 'quick';
            quickBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
            quickBtn.style.cssText = this._btnDepthSegmentStyle(active);
        }
        if (deepBtn) {
            const active = depth === 'deep';
            deepBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
            deepBtn.style.cssText = this._btnDepthSegmentStyle(active);
        }
        this._syncSearchDepthHint();
    },

    _setSearchDepth(depth) {
        const next = depth === 'deep' ? 'deep' : 'quick';
        this._state.searchDepth = next;
        this._persistSearchDepthPref(next);
        this._syncSearchDepthUi();
        Logger.log('dashboard: search depth — ' + next);
    },

    _committedSearchKinds(committed) {
        if (!committed) return [];
        const kinds = [];
        if (committed.includeTaskCreation) kinds.push('task_creation');
        if (committed.includeQa) kinds.push('qa');
        if (committed.includeDisputes) kinds.push('dispute');
        return kinds;
    },

    _resultsKindTabsMeta(committed) {
        const kinds = this._committedSearchKinds(committed);
        if (kinds.length === 0) return [];
        if (kinds.length === 1) {
            const kind = kinds[0];
            const singleLabels = {
                task_creation: 'All/Task Creation',
                qa: 'All/QA',
                dispute: 'All/Disputes'
            };
            return [{ id: 'all', label: singleLabels[kind] || 'All' }];
        }
        const tabs = [{ id: 'all', label: 'All' }];
        for (const kind of DASH_KIND_MERGE_ORDER) {
            if (kinds.includes(kind)) {
                const cfg = DASH_OUTPUT_KIND_CONFIG[kind];
                tabs.push({ id: kind, label: (cfg && cfg.label) || kind });
            }
        }
        return tabs;
    },

    _itemHasOutputKind(item, kind) {
        return ((item.kinds && item.kinds.length) ? item.kinds : [item.kind]).includes(kind);
    },

    _filterItemsByResultsKindTab(items) {
        const committed = this._state.committed;
        const kinds = this._committedSearchKinds(committed);
        if (!items || kinds.length <= 1) return items || [];
        const tab = this._state.resultsKindTab || 'all';
        if (tab === 'all') return items;
        return items.filter((item) => this._itemHasOutputKind(item, tab));
    },

    _getViewItems() {
        // filteredItems is always tab-scoped + sidebar-filtered (see _refreshResultsView).
        return this._state.filteredItems;
    },

    /** Items in the active results kind tab (search cache, before sidebar filters). */
    _getFilterScopeItems() {
        if (!this._state.cachedItems) return [];
        return this._filterItemsByResultsKindTab(this._state.cachedItems);
    },

    _filterScopeWrapEl(scopeKey) {
        return this._modal ? this._modal.querySelector('[data-wf-dash-ms-wrap="' + scopeKey + '"]') : null;
    },

    _isFilterScopeVisible(scopeKey) {
        const wrap = this._filterScopeWrapEl(scopeKey);
        return Boolean(wrap && wrap.style.display !== 'none');
    },

    _reindexFilterListsFromScope(resetDrafts) {
        const lib = dashLib();
        const scopeItems = this._getFilterScopeItems();
        if (!this._state.cachedItems) {
            this._resetFilterLists();
            return null;
        }
        const prevBounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        const options = lib.buildFilterListOptions(
            scopeItems,
            this._state.catalog,
            this._getTeamCatalog()
        );
        this._state.filterListOptions = options;
        const newBounds = this._listBoundsFromOptions(options);
        this._state.filterListBoundsPrev = prevBounds;
        if (!resetDrafts && this._state.appliedFilters) {
            this._state.appliedFilters = this._expandAppliedForBoundsGrowth(
                this._state.appliedFilters, prevBounds, newBounds
            );
        }
        const tab = this._state.resultsKindTab || 'all';
        Logger.log('dashboard: filter lists reindexed — ' + scopeItems.length + ' item(s) in scope'
            + (tab !== 'all' ? ' · tab ' + tab : ''));
        return newBounds;
    },

    _isFilterDraftValid(draft, listBounds) {
        if (!draft) return false;
        const bounds = listBounds || {};
        for (const { draftKey } of DASH_FILTER_SCOPES) {
            const all = (bounds[draftKey] || []).length;
            if (all === 0) continue;
            if ((draft[draftKey] || []).length === 0) return false;
        }
        return true;
    },

    _syncResultsToolbarDerivedUi() {
        this._syncResultsRangeCountUi();
        this._syncBulkHydrateUi();
    },

    _syncResultsListDerivedUi({ reindexFilters } = {}) {
        if (reindexFilters && this._state.cachedItems) {
            this._reindexFilterListsFromScope(false);
        }
    },

    _resultsToolbarReady() {
        const committed = this._state.committed;
        const resultsReady = this._state.filteredItems !== null && this._state.cachedItems !== null;
        return Boolean(this._state.hasSearched && committed && !this._state.loading && resultsReady);
    },

    _onResultsKindTabChanged() {
        this._refreshResultsView({ resetPage: true, reindexFilters: true, filterSource: 'tab-reset' });
    },

    _filtersAllSelectedFromBounds(bounds) {
        const b = bounds || {};
        return {
            teamIds: [...(b.teamIds || [])],
            projectIds: [...(b.projectIds || [])],
            envKeys: [...(b.envKeys || [])],
            statuses: [...(b.statuses || [])],
            contributorIds: [...(b.contributorIds || [])],
            promptRatings: [...(b.promptRatings || [])],
            taskIssues: [...(b.taskIssues || [])],
            returnTypes: [...(b.returnTypes || [])],
            promptHistory: [...(b.promptHistory || [])],
            promptText: (this._q('#wf-dash-prompt') || {}).value || '',
            fuzzy: Boolean((this._q('#wf-dash-fuzzy') || {}).checked),
            regex: Boolean((this._q('#wf-dash-regex') || {}).checked),
            caseSensitive: Boolean((this._q('#wf-dash-case') || {}).checked),
            searchHiddenVersions: Boolean((this._q('#wf-dash-hidden-versions') || {}).checked),
            sortOrder: ((this._q('#wf-dash-sort') || {}).value || 'desc') === 'asc' ? 'asc' : 'desc'
        };
    },

    _refreshResultsView({ resetPage = false, reindexFilters = false, filterSource = 'client' } = {}) {
        const lib = dashLib();
        if (this._state.cachedItems === null) {
            this._state.filteredItems = null;
            this._updateResultsStatus();
            this._renderResults();
            this._updateResultsKindTabsUi();
            this._syncResultsToolbarDerivedUi();
            return false;
        }

        let bounds;
        const resetDrafts = reindexFilters && (filterSource === 'tab-reset' || filterSource === 'search-defaults');
        if (reindexFilters) {
            bounds = this._reindexFilterListsFromScope(resetDrafts);
        } else {
            bounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        }

        let filters;
        if (filterSource === 'search-defaults' || filterSource === 'tab-reset' || filterSource === 'filter-reset') {
            filters = this._filtersAllSelectedFromBounds(bounds);
        } else {
            filters = this._currentClientFilters();
            const filterInvalid = lib.isPromptFilterInvalid(filters.promptText, filters.caseSensitive, filters.regex);
            if (filterInvalid.invalid) {
                this._updateSubstringErrorUi();
                return false;
            }
        }

        if (resetPage) this._state.resultsPage = 0;

        const scopeItems = this._getFilterScopeItems();
        const sortOrder = filters.sortOrder;
        const result = lib.applyFiltersAndSort(scopeItems, filters, bounds, sortOrder);
        this._state.filteredItems = result;
        this._state.appliedFilters = Object.assign({}, filters, { sortOrder });

        const tab = this._state.resultsKindTab || 'all';
        if (filterSource === 'client') {
            Logger.log('dashboard: filters applied — ' + result.length + ' / ' + scopeItems.length + ' item(s) in tab scope'
                + (sortOrder === 'asc' ? ' · sort asc' : ' · sort desc'));
        } else if (filterSource === 'filter-reset') {
            Logger.log('dashboard: filters reset — ' + result.length + ' / ' + scopeItems.length + ' item(s) in tab scope');
        } else {
            Logger.log('dashboard: results view ready — ' + result.length + ' / ' + scopeItems.length + ' · tab ' + tab);
        }

        if (filterSource === 'client') {
            this._syncResultsListDerivedUi();
        }
        this._updateResultsStatus();
        this._updateSubstringErrorUi();
        this._updateApplyFiltersUi();
        this._renderResults();
        this._updateResultsKindTabsUi();
        this._renderFilterLists({
            syncDraftFromApplied: filterSource !== 'client' || Boolean(this._state.appliedFilters)
        });
        this._syncResultsToolbarDerivedUi();
        return true;
    },

    _readResultsPageSizePref() {
        try {
            const v = this._pageWindow().localStorage.getItem(DASH_RESULTS_PAGE_SIZE_KEY);
            if (v === '10' || v === '25' || v === '50' || v === '100' || v === 'all') return v;
        } catch (_e) { /* ignore */ }
        return null;
    },

    _persistResultsPageSizePref(value) {
        try {
            const v = String(value || DASH_RESULTS_PAGE_SIZE_DEFAULT);
            this._pageWindow().localStorage.setItem(DASH_RESULTS_PAGE_SIZE_KEY, v);
        } catch (e) {
            Logger.debug('dashboard: could not persist results page size', e);
        }
    },

    _getEffectiveResultsPageSize() {
        const ps = this._state.resultsPageSize;
        if (ps === 'all') return Infinity;
        const n = Number(ps);
        return Number.isFinite(n) && n > 0 ? n : DASH_RESULTS_PAGE_SIZE_DEFAULT;
    },

    _applyResultsPageSizeForNewSearch() {
        const pref = this._readResultsPageSizePref();
        if (pref === 'all') {
            this._state.resultsPageSize = DASH_RESULTS_PAGE_SIZE_DEFAULT;
        } else if (pref) {
            this._state.resultsPageSize = Number(pref) || DASH_RESULTS_PAGE_SIZE_DEFAULT;
        } else {
            this._state.resultsPageSize = DASH_RESULTS_PAGE_SIZE_DEFAULT;
        }
        this._state.resultsPage = 0;
        this._syncResultsPageSizeUi();
    },

    _syncResultsPageSizeUi() {
        const sel = this._q('#wf-dash-results-page-size');
        if (!sel) return;
        const ps = this._state.resultsPageSize;
        if (ps === 'all') {
            sel.value = 'all';
        } else {
            sel.value = String(ps);
        }
    },

    _getPaginatedViewItems() {
        const viewItems = this._getViewItems();
        if (!viewItems || viewItems.length === 0) return [];
        const size = this._getEffectiveResultsPageSize();
        if (size === Infinity) return viewItems;
        const totalPages = Math.max(1, Math.ceil(viewItems.length / size));
        let page = this._state.resultsPage || 0;
        if (page >= totalPages) page = totalPages - 1;
        this._state.resultsPage = page;
        const start = page * size;
        return viewItems.slice(start, start + size);
    },

    _getResultsPaginationMeta() {
        const viewItems = this._getViewItems() || [];
        const total = viewItems.length;
        const size = this._getEffectiveResultsPageSize();
        if (total === 0 || size === Infinity) {
            return { total, totalPages: 1, page: 0, canPrev: false, canNext: false, showNav: false };
        }
        const totalPages = Math.max(1, Math.ceil(total / size));
        let page = this._state.resultsPage || 0;
        if (page >= totalPages) page = totalPages - 1;
        this._state.resultsPage = page;
        return {
            total,
            totalPages,
            page,
            canPrev: page > 0,
            canNext: page < totalPages - 1,
            showNav: totalPages > 1
        };
    },

    _getResultsRangeLabel() {
        const viewItems = this._getViewItems() || [];
        const total = viewItems.length;
        if (total === 0) return '0 results';
        const meta = this._getResultsPaginationMeta();
        const suffix = total === 1 ? ' result' : ' results';
        if (!meta.showNav) {
            return '1–' + total + ' of ' + total + suffix;
        }
        const size = this._getEffectiveResultsPageSize();
        const start = meta.page * size + 1;
        const end = Math.min((meta.page + 1) * size, total);
        return start + '–' + end + ' of ' + total + suffix;
    },

    _pagerNavBtnStyle(disabled) {
        const base = 'width: 28px; height: 28px; padding: 0; font-size: 15px; font-weight: 600; line-height: 1; border-radius: 6px; flex-shrink: 0;';
        if (disabled) {
            return base + ' border: 1px solid var(--border, #e2e8f0); background: var(--muted, #f1f5f9); color: var(--muted-foreground, #94a3b8); cursor: not-allowed; opacity: 0.75;';
        }
        return base + ' border: 1px solid var(--border, #e2e8f0); background: var(--background, #fff); color: var(--foreground, #0f172a); cursor: pointer;';
    },

    _goResultsPage(delta) {
        const meta = this._getResultsPaginationMeta();
        if (!meta.showNav) return;
        const next = meta.page + delta;
        if (next < 0 || next >= meta.totalPages) return;
        this._state.resultsPage = next;
        Logger.log('dashboard: results page — ' + (next + 1) + ' / ' + meta.totalPages);
        this._renderResults();
        this._syncResultsPagerUi();
    },

    _syncResultsPagerUi() {
        const pager = this._q('#wf-dash-results-pager');
        const kindSlot = this._q('#wf-dash-results-pager-slot-kind');
        const showPager = this._resultsToolbarReady();

        if (showPager) {
            const row2 = this._q('#wf-dash-results-toolbar-row2');
            if (row2) row2.style.display = 'flex';
        }

        if (pager) {
            pager.style.display = showPager ? 'inline-flex' : 'none';
            if (showPager && kindSlot && pager.parentElement !== kindSlot) {
                kindSlot.appendChild(pager);
            }
        }

        const countEl = this._q('#wf-dash-results-range-count');
        if (countEl) countEl.textContent = showPager ? this._getResultsRangeLabel() : '';

        const meta = showPager ? this._getResultsPaginationMeta() : null;
        const prevBtn = this._q('#wf-dash-results-prev');
        const nextBtn = this._q('#wf-dash-results-next');
        if (prevBtn) {
            prevBtn.disabled = !meta || !meta.canPrev;
            prevBtn.style.cssText = this._pagerNavBtnStyle(prevBtn.disabled);
        }
        if (nextBtn) {
            nextBtn.disabled = !meta || !meta.canNext;
            nextBtn.style.cssText = this._pagerNavBtnStyle(nextBtn.disabled);
        }
    },

    _syncResultsRangeCountUi() {
        this._syncResultsPagerUi();
    },

    _onScopeDataEnriched() {
        const lib = dashLib();
        if (this._state.cachedItems === null) return false;
        const newBounds = this._reindexFilterListsFromScope(false);
        if (!newBounds) return false;
        const applied = this._state.appliedFilters;
        if (!applied) return false;
        const filters = Object.assign({}, applied);
        const filterInvalid = lib.isPromptFilterInvalid(
            filters.promptText, filters.caseSensitive, filters.regex
        );
        if (!filterInvalid.invalid) {
            const sortOrder = filters.sortOrder;
            const scopeItems = this._getFilterScopeItems();
            const result = lib.applyFiltersAndSort(scopeItems, filters, newBounds, sortOrder);
            this._state.filteredItems = result;
            Logger.debug('dashboard: scope data enriched — ' + result.length + ' / ' + scopeItems.length + ' item(s) after reindex');
        }
        this._updateResultsStatus();
        this._renderFilterLists({ syncDraftFromApplied: true });
        this._syncResultsToolbarDerivedUi();
        this._updateApplyFiltersUi();
        return !filterInvalid.invalid;
    },

    _applySortAndRender() {
        const lib = dashLib();
        const applied = this._state.appliedFilters;
        if (this._state.cachedItems === null || !applied) return;
        const sortOrder = ((this._q('#wf-dash-sort') || {}).value || 'desc') === 'asc' ? 'asc' : 'desc';
        if (applied.sortOrder === sortOrder) return;
        const filters = Object.assign({}, applied, { sortOrder });
        this._state.resultsPage = 0;
        const bounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        const scopeItems = this._getFilterScopeItems();
        const result = lib.applyFiltersAndSort(scopeItems, filters, bounds, sortOrder);
        this._state.filteredItems = result;
        this._state.appliedFilters = filters;
        Logger.log('dashboard: sort applied — ' + (sortOrder === 'asc' ? 'oldest first' : 'newest first'));
        this._updateResultsStatus();
        this._syncResultsListDerivedUi();
        this._renderResults();
        this._updateApplyFiltersUi();
    },

    _findCachedItem(itemId) {
        return (this._state.cachedItems || []).find((it) => it.id === itemId) || null;
    },

    _getHydrateUi(itemId) {
        const id = String(itemId || '');
        if (!id) return { status: 'idle' };
        if (!this._state.hydrateUi[id]) {
            this._state.hydrateUi[id] = { status: 'idle' };
        }
        return this._state.hydrateUi[id];
    },

    _profilesMapFromHydrateItems(items) {
        const profilesMap = new Map();
        for (const item of items || []) {
            const task = item && item.task;
            if (!task) continue;
            if (task.author && task.author.id) {
                profilesMap.set(task.author.id, {
                    full_name: task.author.name || '',
                    email: task.author.email || ''
                });
            }
        }
        return profilesMap;
    },

    async _hydrateItems(items, enrichOptions) {
        const toHydrate = (items || []).filter((it) => it && !it.hydrated);
        if (toHydrate.length === 0) return 0;

        const taskIds = [...new Set(toHydrate.map((it) => it.task.id).filter(Boolean))];
        const profilesMap = this._profilesMapFromHydrateItems(toHydrate);
        const opts = enrichOptions || {};
        const taskKeysByTaskId = {};
        for (const it of toHydrate) {
            if (it && it.task && it.task.id && it.task.key) {
                taskKeysByTaskId[it.task.id] = it.task.key;
            }
        }

        this._state.hydrateFetchActive = true;
        let updated = 0;
        try {
            const enrichment = await Context.dashboardData.enrichTasksWithHistory(taskIds, profilesMap, {
                prefetchedFeedbackRows: opts.prefetchedFeedbackRows,
                skipFeedbackFetch: Boolean(opts.skipFeedbackFetch),
                taskKeysByTaskId
            });
            for (const item of this._state.cachedItems || []) {
                if (!taskIds.includes(item.task.id) || item.hydrated) continue;
                const hist = enrichment.get(item.task.id);
                if (hist) {
                    item.task.promptVersions = hist.promptVersions || [];
                    item.task.allFeedback = hist.allFeedback || [];
                    if (item.selectedFeedbackId) {
                        const entry = (item.task.allFeedback || []).find((f) => f.id === item.selectedFeedbackId);
                        if (entry && entry.display) item.qaFeedback = entry.display;
                    }
                }
                item.hydrated = true;
                updated++;
            }
            Logger.log('dashboard: hydrated ' + updated + ' card(s)');
            return updated;
        } finally {
            this._state.hydrateFetchActive = false;
        }
    },

    async _hydrateAllSearchResults(items, options) {
        const opts = options || {};
        const toHydrate = (items || []).filter((it) => it && !it.hydrated);
        if (toHydrate.length === 0) return 0;

        if (!Context.dashboardData || typeof Context.dashboardData.enrichTasksWithHistory !== 'function') {
            throw new Error('Dashboard helpers not loaded. Reload the page and try again.');
        }

        const enrichOptions = {
            prefetchedFeedbackRows: opts.prefetchedFeedbackRows,
            skipFeedbackFetch: Boolean(opts.skipFeedbackFetch)
        };
        const total = toHydrate.length;
        let hydratedTotal = 0;
        Logger.log('dashboard: deep search hydrating all results — ' + total + ' card(s)');

        for (let i = 0; i < toHydrate.length; i += DASH_HYDRATE_TASK_CHUNK) {
            const chunk = toHydrate.slice(i, i + DASH_HYDRATE_TASK_CHUNK);
            const done = i;
            if (typeof opts.onProgress === 'function') {
                opts.onProgress(done, total);
            }
            hydratedTotal += await this._hydrateItems(chunk, enrichOptions);
        }
        if (typeof opts.onProgress === 'function') {
            opts.onProgress(total, total);
        }
        if (hydratedTotal > 0) {
            this._onScopeDataEnriched();
        }
        Logger.log('dashboard: deep search hydrate complete — ' + hydratedTotal + ' card(s)');
        return hydratedTotal;
    },

    async _hydrateCard(itemId) {
        const item = this._findCachedItem(itemId);
        if (!item || item.hydrated) return;
        if (!Context.dashboardData || typeof Context.dashboardData.enrichTasksWithHistory !== 'function') {
            Logger.warn('dashboard: card hydrate skipped — dashboardData not loaded');
            return;
        }
        const ui = this._getHydrateUi(itemId);
        if (ui.status === 'loading') return;
        ui.status = 'loading';
        this._patchTaskCard(itemId);
        try {
            await this._hydrateItems([item]);
            this._onScopeDataEnriched();
            this._patchTaskCard(itemId);
            Logger.log('dashboard: card hydrated in place — ' + itemId);
        } catch (err) {
            if (!this._handleDashSessionRefreshError(err)) {
                Logger.warn('dashboard: card hydrate failed — ' + itemId, err);
            }
        } finally {
            ui.status = 'idle';
            this._patchTaskCard(itemId);
            this._syncBulkHydrateUi();
        }
    },

    _getUnhydratedInView() {
        return (this._getViewItems() || []).filter((it) => !it.hydrated);
    },

    _getUnhydratedOnPage() {
        return this._getPaginatedViewItems().filter((it) => !it.hydrated);
    },

    _autoHydrateContextKey() {
        const tab = this._state.resultsKindTab || 'all';
        const page = this._state.resultsPage || 0;
        const total = (this._getViewItems() || []).length;
        return page + '|' + tab + '|' + total;
    },

    _scheduleAutoHydrateVisiblePage() {
        if (this._state.autoHydrateScheduled || this._state.autoHydrateActive) return;
        if (!this._bulkHydrateShowable()) {
            this._state.autoHydratePending = false;
            return;
        }
        if (this._getUnhydratedOnPage().length === 0) {
            this._state.autoHydratePending = false;
            return;
        }
        if (!Context.dashboardData || typeof Context.dashboardData.enrichTasksWithHistory !== 'function') {
            if (!this._state.autoHydratePendingLogged) {
                Logger.debug('dashboard: auto-hydrate deferred — dashboardData not ready');
                this._state.autoHydratePendingLogged = true;
            }
            this._state.autoHydratePending = true;
            return;
        }
        this._state.autoHydratePending = false;
        this._state.autoHydratePendingLogged = false;
        this._state.autoHydrateScheduled = true;
        queueMicrotask(() => {
            this._state.autoHydrateScheduled = false;
            void this._autoHydrateVisiblePage();
        });
    },

    async _autoHydrateVisiblePage() {
        if (!this._bulkHydrateShowable() || this._state.autoHydrateActive || this._state.hydrateBulkActive) return;
        if (!Context.dashboardData || typeof Context.dashboardData.enrichTasksWithHistory !== 'function') {
            Logger.warn('dashboard: auto-hydrate skipped — dashboardData not loaded');
            return;
        }
        const contextKey = this._autoHydrateContextKey();
        const toHydrate = this._getUnhydratedOnPage();
        if (toHydrate.length === 0) return;

        const meta = this._getResultsPaginationMeta();
        Logger.log('dashboard: auto-hydrate page — ' + toHydrate.length + ' card(s)'
            + (meta ? ' (page ' + (meta.page + 1) + '/' + meta.totalPages + ')' : ''));

        this._state.autoHydrateActive = true;
        let hydratedTotal = 0;
        try {
            for (let i = 0; i < toHydrate.length; i += DASH_HYDRATE_TASK_CHUNK) {
                if (this._autoHydrateContextKey() !== contextKey) {
                    Logger.debug('dashboard: auto-hydrate cancelled — results page or tab changed');
                    break;
                }
                const chunk = toHydrate.slice(i, i + DASH_HYDRATE_TASK_CHUNK);
                for (const item of chunk) {
                    this._getHydrateUi(item.id).status = 'loading';
                    this._patchTaskCard(item.id);
                }
                hydratedTotal += await this._hydrateItems(chunk);
                for (const item of chunk) {
                    this._getHydrateUi(item.id).status = 'idle';
                    this._patchTaskCard(item.id);
                }
            }
            if (hydratedTotal > 0) {
                this._onScopeDataEnriched();
                if (this._autoHydrateContextKey() === contextKey) {
                    this._renderResults();
                }
                Logger.log('dashboard: auto-hydrate page complete — ' + hydratedTotal + ' card(s)');
            }
        } catch (err) {
            for (const item of toHydrate) {
                this._getHydrateUi(item.id).status = 'idle';
                this._patchTaskCard(item.id);
            }
            if (!this._handleDashSessionRefreshError(err)) {
                Logger.warn('dashboard: auto-hydrate page failed', err);
            }
        } finally {
            this._state.autoHydrateActive = false;
            this._syncBulkHydrateUi();
        }
    },

    _bulkHydrateShowable() {
        const committed = this._state.committed;
        const resultsReady = this._state.filteredItems !== null && this._state.cachedItems !== null;
        return Boolean(
            committed
            && committed.searchDepth === 'quick'
            && this._state.hasSearched
            && !this._state.loading
            && resultsReady
        );
    },

    _kindLabelForHydrate(tab, kinds) {
        if (kinds.length === 1) {
            if (kinds[0] === 'task_creation') return 'task creation';
            if (kinds[0] === 'qa') return 'QA';
            return 'disputes';
        }
        if (tab === 'all') return 'all';
        if (tab === 'task_creation') return 'task creation';
        if (tab === 'qa') return 'QA';
        return 'disputes';
    },

    _bulkHydrateBaseLabel() {
        if (!this._bulkHydrateShowable()) return null;
        const committed = this._state.committed;
        const kinds = this._committedSearchKinds(committed);
        const tab = this._state.resultsKindTab || 'all';
        const kindPart = this._kindLabelForHydrate(tab, kinds);
        return 'Hydrate ' + kindPart + ' results';
    },

    _bulkHydrateLabel() {
        const base = this._bulkHydrateBaseLabel();
        if (!base) return null;
        const unhydrated = this._getUnhydratedInView();
        if (unhydrated.length > 0) {
            return base + ' (' + unhydrated.length + ' remaining)';
        }
        return base;
    },

    _syncBulkHydrateUi() {
        const btn = this._q('#wf-dash-bulk-hydrate');
        if (!btn) return;
        const committed = this._state.committed;
        const canLabel = Boolean(
            committed
            && committed.searchDepth === 'quick'
            && this._state.filteredItems !== null
            && this._state.cachedItems !== null
        );
        if (canLabel) {
            const kinds = this._committedSearchKinds(committed);
            const tab = this._state.resultsKindTab || 'all';
            const base = 'Hydrate ' + this._kindLabelForHydrate(tab, kinds) + ' results';
            const unhydratedCount = this._getUnhydratedInView().length;
            btn.textContent = unhydratedCount > 0
                ? base + ' (' + unhydratedCount + ' remaining)'
                : base;
        }
        if (!this._bulkHydrateShowable()) {
            btn.style.display = 'none';
            return;
        }
        const unhydratedCount = this._getUnhydratedInView().length;
        if (unhydratedCount === 0) {
            btn.style.display = 'none';
            return;
        }
        btn.style.display = '';
        btn.disabled = this._state.hydrateBulkActive || this._state.autoHydrateActive;
    },

    _setBulkHydrateProgress(done, total) {
        const btn = this._q('#wf-dash-bulk-hydrate');
        if (!btn || !this._state.hydrateBulkActive) return;
        const base = this._bulkHydrateBaseLabel() || 'Hydrate results';
        btn.textContent = total > 0 ? base + ' (' + done + '/' + total + ')' : base;
    },

    _updateResultsKindTabsUi() {
        const row2 = this._q('#wf-dash-results-toolbar-row2');
        const buttonsWrap = this._q('#wf-dash-results-kind-tab-buttons');
        if (!row2 || !buttonsWrap) return;
        if (!this._resultsToolbarReady()) {
            row2.style.display = 'none';
            buttonsWrap.innerHTML = '';
            this._syncResultsRangeCountUi();
            return;
        }
        row2.style.display = 'flex';
        row2.style.alignItems = 'center';
        row2.style.justifyContent = 'space-between';
        row2.style.width = '100%';
        row2.style.gap = '12px';
        const committed = this._state.committed;
        const tabs = this._resultsKindTabsMeta(committed);
        if (tabs.length <= 1) {
            buttonsWrap.innerHTML = '';
        } else {
            const activeTab = this._state.resultsKindTab || 'all';
            const tabButtons = tabs.map((tab) => {
                const active = tab.id === activeTab;
                const style = this._btnResultsKindTabStyle(active, tab.id);
                return `<button type="button" data-wf-dash-results-kind-tab="${dashEscHtml(tab.id)}" style="${style}">${dashEscHtml(tab.label)}</button>`;
            }).join('');
            buttonsWrap.style.display = 'flex';
            buttonsWrap.style.flexWrap = 'wrap';
            buttonsWrap.style.gap = '6px';
            buttonsWrap.style.minWidth = '0';
            buttonsWrap.innerHTML = tabButtons;
            buttonsWrap.querySelectorAll('[data-wf-dash-results-kind-tab]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    this._state.resultsKindTab = btn.getAttribute('data-wf-dash-results-kind-tab') || 'all';
                    Logger.log('dashboard: results kind tab — ' + this._state.resultsKindTab);
                    this._updateResultsKindTabsUi();
                    this._onResultsKindTabChanged();
                });
            });
        }
        this._syncResultsRangeCountUi();
    },

    async _bulkHydrateVisible() {
        if (!this._bulkHydrateShowable() || this._state.hydrateBulkActive || this._state.autoHydrateActive) return;
        if (!Context.dashboardData || typeof Context.dashboardData.enrichTasksWithHistory !== 'function') {
            Logger.warn('dashboard: bulk hydrate skipped — dashboardData not loaded');
            return;
        }
        const toHydrate = this._getUnhydratedInView();
        if (toHydrate.length === 0) return;

        this._state.hydrateBulkActive = true;
        this._syncBulkHydrateUi();
        this._setBulkHydrateProgress(0, toHydrate.length);
        let hydratedTotal = 0;
        try {
            for (let i = 0; i < toHydrate.length; i += DASH_HYDRATE_TASK_CHUNK) {
                const chunk = toHydrate.slice(i, i + DASH_HYDRATE_TASK_CHUNK);
                for (const item of chunk) {
                    this._getHydrateUi(item.id).status = 'loading';
                    this._patchTaskCard(item.id);
                }
                const doneBefore = i;
                this._setBulkHydrateProgress(doneBefore, toHydrate.length);
                hydratedTotal += await this._hydrateItems(chunk);
                for (const item of chunk) {
                    this._getHydrateUi(item.id).status = 'idle';
                    this._patchTaskCard(item.id);
                }
                this._setBulkHydrateProgress(Math.min(i + chunk.length, toHydrate.length), toHydrate.length);
            }
            this._onScopeDataEnriched();
            const meta = this._getResultsPaginationMeta();
            if (meta && meta.page >= meta.totalPages) {
                this._state.resultsPage = 0;
            }
            this._renderResults();
            Logger.log('dashboard: bulk hydrate complete — ' + hydratedTotal + ' card(s) in tab');
        } catch (err) {
            for (const item of toHydrate) {
                this._getHydrateUi(item.id).status = 'idle';
                this._patchTaskCard(item.id);
            }
            if (!this._handleDashSessionRefreshError(err)) {
                Logger.warn('dashboard: bulk hydrate failed', err);
            }
        } finally {
            this._state.hydrateBulkActive = false;
            this._syncBulkHydrateUi();
            this._syncResultsRangeCountUi();
        }
    },

    _resetFilterDraftsFromResults(_items) {
        return this._reindexFilterListsFromScope(true);
    },

    // ── Popup lifecycle ──

    _isOpen() {
        return Boolean(this._overlay && this._overlay.style.display !== 'none');
    },

    open() {
        try {
            if (Context.networkObserver && typeof Context.networkObserver.refreshFromPage === 'function') {
                Context.networkObserver.refreshFromPage(this._pageWindow());
            }
        } catch (e) {
            Logger.debug('dashboard: refreshFromPage on open failed', e);
        }
        this._ensureBuilt();
        this._overlay.style.display = 'flex';
        // Close the regular settings modal if it is open
        try {
            const doc = this._pageWindow().document;
            const settingsModal = doc.getElementById('wf-settings-modal');
            if (settingsModal && typeof settingsModal.close === 'function' && settingsModal.open) {
                settingsModal.close();
                Logger.log('dashboard: closed settings modal on dashboard open');
            }
        } catch (e) {
            Logger.debug('dashboard: could not close settings modal', e);
        }
        void this._doBootstrap();
        this._refreshCatalogDependentUi();
        this._syncDashboardUpdateMode();
        this._setSearchDepth('quick');
        Logger.log('dashboard: opened');
    },

    close() {
        if (!this._overlay) return;
        if (this._modal && Context.opsTab && typeof Context.opsTab.captureState === 'function') {
            Context.opsTab.captureState(this._modal);
        }
        this._overlay.style.display = 'none';
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

    // ── DOM construction ──

    _build() {
        this._removeKeydownListener();
        const doc = this._pageWindow().document;
        const overlay = doc.createElement('div');
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
        this._attachListeners();
        this._ensureSpinnerKeyframes();
        this._ensureMsOptionStyles();
        this._ensureHeaderActionStyles();
        this._syncDashboardUpdateMode();
        this._syncOutputToggleUi();
        this._syncLeftTabUi();
        this._refreshCatalogDependentUi();
        this._updateResultsStatus();
        this._updateSubstringErrorUi();
        this._validateRangeUi();
        this._syncFieldClearButtons();
        this._syncAllMsDropdowns();
        this._applyDefaultSearchDates();
        this._state.searchDepth = 'quick';
        this._syncSearchDepthUi();
        const pagePref = this._readResultsPageSizePref();
        this._state.resultsPageSize = pagePref === 'all' ? 'all' : (Number(pagePref) || DASH_RESULTS_PAGE_SIZE_DEFAULT);
        this._state.resultsPage = 0;
        this._syncResultsPageSizeUi();
        this._syncResultsPagerUi();
        Logger.log('dashboard: popup built');
    },

    _applyDefaultSearchDates() {
        const afterEl = this._q('#wf-dash-after');
        const beforeEl = this._q('#wf-dash-before');
        if (!afterEl || !beforeEl) return;
        if (afterEl.value || beforeEl.value) return;
        this._applyQuickDatePreset('today');
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = 'today';
    },

    _loadingSpinnerHtml(sizePx) {
        const size = sizePx || 16;
        return `<span aria-hidden="true" style="display: inline-block; width: ${size}px; height: ${size}px; border: 2px solid color-mix(in srgb, var(--brand, var(--primary, #2563eb)) 22%, transparent); border-top-color: var(--brand, var(--primary, #2563eb)); border-radius: 50%; animation: wf-dash-spin 0.7s linear infinite; flex-shrink: 0;"></span>`;
    },

    _ensureSpinnerKeyframes() {
        if (!this._modal || this._modal.querySelector('#wf-dash-spinner-style')) return;
        const style = this._pageWindow().document.createElement('style');
        style.id = 'wf-dash-spinner-style';
        style.textContent = '@keyframes wf-dash-spin { to { transform: rotate(360deg); } }';
        this._modal.appendChild(style);
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
            '  color: var(--foreground, #0f172a);',
            '  background: var(--background, #fff);',
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
            '#wf-dash-modal label[data-wf-dash-ms-option] {',
            '  display: grid !important;',
            '  grid-template-columns: auto minmax(0, 1fr);',
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
            '#wf-dash-modal label[data-wf-dash-ms-option] input[type="checkbox"] {',
            '  display: inline-block !important;',
            '  width: auto !important;',
            '  max-width: none !important;',
            '  flex: none !important;',
            '  margin: 0 !important;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-option-text] {',
            '  grid-column: 2;',
            '  min-width: 0;',
            '  overflow-wrap: break-word;',
            '  word-break: normal;',
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
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-open="1"] [data-wf-dash-ms-items] {',
            '  max-height: min(320px, 45vh);',
            '  overflow-y: auto;',
            '  overflow-x: hidden;',
            '  -webkit-overflow-scrolling: touch;',
            '}',
            '#wf-dash-modal [data-wf-dash-ms-wrap][data-wf-dash-ms-open="1"] [data-wf-dash-ms-sticky] {',
            '  box-shadow: 0 1px 0 var(--border, #e2e8f0);',
            '}'
        ].join('\n');
        this._modal.appendChild(style);
    },

    _shouldShowDashboardUpdateTab() {
        if (Context.settingsUi && typeof Context.settingsUi.shouldShowUpdateBanner === 'function') {
            return Context.settingsUi.shouldShowUpdateBanner();
        }
        return Boolean(Context.isOutdated && Context.latestVersion);
    },

    _dashboardUpdateBannerHtml() {
        if (!this._shouldShowDashboardUpdateTab()) return '';
        if (Context.settingsUi && typeof Context.settingsUi.createUpdateNotificationHTML === 'function') {
            return Context.settingsUi.createUpdateNotificationHTML();
        }
        return '';
    },

    _syncDashboardUpdateMode() {
        if (!this._modal) return;
        const updateActive = this._shouldShowDashboardUpdateTab();
        const updateTab = this._modal.querySelector('[data-wf-dash-tab="update"]');
        const updatePanel = this._modal.querySelector('[data-wf-dash-panel="update"]');
        const headerTask = this._modal.querySelector('#wf-dash-header-task-link');
        const headerOps = this._modal.querySelector('#wf-dash-header-ops');
        const normalTabs = this._modal.querySelectorAll('[data-wf-dash-tab]:not([data-wf-dash-tab="update"])');
        const normalPanels = this._modal.querySelectorAll('[data-wf-dash-panel]:not([data-wf-dash-panel="update"])');

        if (updateActive) {
            normalTabs.forEach((btn) => { btn.style.display = 'none'; });
            normalPanels.forEach((panel) => { panel.style.display = 'none'; });
            if (updateTab) updateTab.style.display = '';
            if (updatePanel) updatePanel.style.display = 'flex';
            if (headerTask) headerTask.style.display = 'none';
            if (headerOps) headerOps.style.display = 'none';
            this._setActiveTab('update');
            Logger.info('dashboard: update tab active — other sections hidden');
            return;
        }

        if (updateTab) updateTab.style.display = 'none';
        if (updatePanel) updatePanel.style.display = 'none';
        normalTabs.forEach((btn) => { btn.style.display = ''; });
        if (headerTask) headerTask.style.display = '';
        if (headerOps) headerOps.style.display = '';
        const restoreTab = this._state.activeTab === 'update' ? 'search-output' : this._state.activeTab;
        this._setActiveTab(restoreTab || 'search-output');
    },

    _modalHtml() {
        const ops = Context.opsTab;
        const tabs = [
            { id: 'search-output', label: 'Search Output' },
            { id: 'team-members', label: 'Team Members' },
            { id: 'verifier-fetcher', label: 'Verifier Fetcher' }
        ];
        const tabBtns = tabs.map((t) => `
            <button type="button" class="wf-dash-tab" data-wf-dash-tab="${t.id}" style="
                position: relative; padding: 10px 14px; font-size: 13px; font-weight: 500;
                background: transparent; border: none; border-bottom: 2px solid transparent;
                margin-bottom: -1px; cursor: pointer; color: var(--muted-foreground, #64748b);
            ">${t.label}</button>`).join('');
        const updateTabBtn = `<button type="button" class="wf-dash-tab" data-wf-dash-tab="update" style="
                display: none; position: relative; padding: 10px 14px; font-size: 13px; font-weight: 600;
                background: transparent; border: none; border-bottom: 2px solid transparent;
                margin-bottom: -1px; cursor: pointer; color: #991b1b;
            ">Update</button>`;
        const updatePanelHtml = this._dashboardUpdateBannerHtml();
        const taskLinkBar = ops && typeof ops.renderTaskLinkBar === 'function' ? ops.renderTaskLinkBar() : '';
        const gradeAssessmentsLink = ops && typeof ops.renderGradeAssessmentsHeaderLink === 'function'
            ? ops.renderGradeAssessmentsHeaderLink()
            : '';
        const teamPanel = ops && typeof ops.renderTeamMembersPanel === 'function' ? ops.renderTeamMembersPanel() : '';
        const verifierPanel = ops && typeof ops.renderVerifierFetcherPanel === 'function' ? ops.renderVerifierFetcherPanel() : '';

        return `
            <div style="display: flex; align-items: center; width: 100%; box-sizing: border-box; padding: 10px 18px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;">
                <div id="wf-dash-header-tabs" style="display: flex; align-items: center; gap: 0; flex-shrink: 0; min-width: 0;">
                    <div style="font-size: 15px; font-weight: 600; color: var(--foreground, #0f172a); margin-right: 12px; flex-shrink: 0;">Dashboard</div>
                    <nav style="display: flex; gap: 0; min-width: 0; overflow: hidden;" aria-label="Dashboard sections">
                        ${tabBtns}
                        ${updateTabBtn}
                    </nav>
                </div>
                <div id="wf-dash-header-task-link" style="flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; padding: 0 12px; box-sizing: border-box; overflow: hidden;">
                    <div style="display: flex; justify-content: center; align-items: center; width: 100%; min-width: 0;">${taskLinkBar}</div>
                </div>
                <div id="wf-dash-header-ops" style="flex-shrink: 0; margin-left: auto;">
                    ${gradeAssessmentsLink}
                    <button type="button" id="wf-dash-open-settings" class="wf-dash-header-btn">Open Settings</button>
                    <button type="button" id="wf-dash-close" class="wf-dash-header-btn" aria-label="Close dashboard" title="Close">${this._dashCloseIconSvg()}</button>
                </div>
            </div>
            <div id="wf-dash-body" style="flex: 1; min-height: 0; overflow: hidden; padding: 16px 18px; display: flex; flex-direction: column;">
                <div data-wf-dash-panel="search-output" style="flex: 1; min-height: 0; display: flex; flex-direction: column;">${this._searchPanelHtml()}</div>
                <div data-wf-dash-panel="team-members" style="flex: 1; min-height: 0; display: none; flex-direction: column; overflow: hidden;">
                    <div id="wf-dash-team-members-inner" style="width: 100%; flex: 1; min-height: 0; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;">${teamPanel}</div>
                </div>
                <div data-wf-dash-panel="verifier-fetcher" style="flex: 1; min-height: 0; display: none; flex-direction: column;">${verifierPanel}</div>
                <div data-wf-dash-panel="update" style="flex: 1; min-height: 0; display: none; flex-direction: column; overflow-y: auto; align-items: center; padding: 8px 0;">
                    <div style="width: 100%; max-width: 720px; box-sizing: border-box;">${updatePanelHtml}</div>
                </div>
            </div>
        `;
    },

    _panelBoxStyle() {
        return 'border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--card, #ffffff);';
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
    _btnStyle() {
        return 'padding: 7px 14px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer; border: 1px solid var(--border, #e2e8f0); background: var(--background, #fff); color: var(--foreground, #0f172a);';
    },
    _btnPrimaryStyle() {
        return 'padding: 7px 16px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer; border: 1px solid var(--brand, var(--primary, #2563eb)); background: var(--brand, var(--primary, #2563eb)); color: var(--primary-foreground, #ffffff);';
    },
    _inputClearBtnStyle() {
        return 'flex-shrink: 0; width: 32px; height: 32px; padding: 0; font-size: 17px; line-height: 1; font-weight: 600; border-radius: 6px; cursor: pointer; border: 1px solid var(--border, #e2e8f0); background: var(--background, #fff); color: var(--muted-foreground, #64748b);';
    },
    _inputClearBtnOverlayStyle() {
        return this._inputClearBtnStyle() + ' position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 26px; height: 26px; font-size: 15px;';
    },
    _btnPrimaryDisabledStyle() {
        return 'padding: 7px 16px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: not-allowed; border: 1px solid var(--border, #e2e8f0); background: var(--muted, #f1f5f9); color: var(--muted-foreground, #94a3b8); opacity: 0.85;';
    },
    _navBtnStyle() {
        return 'padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; cursor: pointer; border: 1px solid var(--border, #e2e8f0); background: var(--background, #fff); color: var(--foreground, #0f172a);';
    },
    _navBtnPrimaryStyle() {
        return 'padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; cursor: pointer; border: 1px solid var(--brand, var(--primary, #2563eb)); background: var(--brand, var(--primary, #2563eb)); color: var(--primary-foreground, #ffffff);';
    },
    _navBtnPrimaryDisabledStyle() {
        return 'padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; cursor: not-allowed; border: 1px solid var(--border, #e2e8f0); background: var(--muted, #f1f5f9); color: var(--muted-foreground, #94a3b8); opacity: 0.85;';
    },

    _btnToggleStyle(active, colorKind) {
        const base = 'padding: 7px 14px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer;';
        if (active) {
            const cfg = DASH_OUTPUT_KIND_CONFIG[colorKind];
            return base + ' ' + (cfg ? cfg.toggleActive : DASH_TOGGLE_INACTIVE);
        }
        return base + ' ' + DASH_TOGGLE_INACTIVE;
    },

    _btnResultsKindTabStyle(active, tabId) {
        const base = 'padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; cursor: pointer;';
        if (active) {
            if (tabId === 'all') {
                return base + ' ' + DASH_SEARCH_DEPTH_TOGGLE_ACTIVE;
            }
            const cfg = DASH_OUTPUT_KIND_CONFIG[tabId];
            return base + ' ' + (cfg ? cfg.toggleActive : DASH_TOGGLE_INACTIVE);
        }
        return base + ' ' + DASH_TOGGLE_INACTIVE;
    },

    _cardKindTabSlotHtml(kind, present) {
        const cfg = DASH_OUTPUT_KIND_CONFIG[kind];
        const shell = 'width: ' + DASH_CARD_KIND_TAB_SLOT_WIDTH + '; height: ' + DASH_CARD_KIND_TAB_HEIGHT
            + '; flex-shrink: 0; border-radius: 6px 6px 0 0; display: inline-flex; align-items: center; justify-content: center;'
            + ' font-size: 10px; font-weight: 600; padding: 0 8px; box-sizing: border-box; overflow: hidden; white-space: nowrap;';
        if (!present || !cfg) {
            return '<div style="' + shell + ' visibility: hidden;" aria-hidden="true"></div>';
        }
        return '<div style="' + shell + ' background: ' + cfg.tabBg + '; color: #fff;" title="' + dashEscHtml(cfg.label) + '" aria-label="' + dashEscHtml(cfg.label) + '">' + dashEscHtml(cfg.label) + '</div>';
    },

    _leftTabStyle(active) {
        const base = 'padding: 8px 12px; font-size: 12px; font-weight: 600; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; background: transparent;';
        return active
            ? base + ' color: var(--foreground, #0f172a); border-bottom-color: var(--brand, var(--primary, #2563eb));'
            : base + ' color: var(--muted-foreground, #64748b);';
    },

    _searchPanelHtml() {
        const box = this._panelBoxStyle();
        const label = this._labelStyle();
        const hint = this._hintStyle();
        const input = this._inputStyle();
        const leftTab = this._state ? this._state.leftTab : 'search';
        return `
            <section style="display: flex; flex: 1; min-height: 0; gap: 16px; overflow: hidden;">
                <aside style="width: min(320px, 34%); flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
                    <div style="${box} display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                        <nav style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;" aria-label="Search and filters">
                            <div style="display: flex; gap: 0; min-width: 0;">
                                <button type="button" data-wf-dash-left-tab="search" style="${this._leftTabStyle(leftTab === 'search')}">Search</button>
                                <button type="button" data-wf-dash-left-tab="filters" style="${this._leftTabStyle(leftTab === 'filters')}">Filters</button>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                                <div id="wf-dash-actions-search" style="display: ${leftTab === 'search' ? 'flex' : 'none'}; align-items: center; gap: 8px;">
                                    <button type="button" id="wf-dash-clear-params" style="${this._navBtnStyle()}">Reset</button>
                                    <button type="button" id="wf-dash-search" style="${this._navBtnPrimaryStyle()}">Search</button>
                                </div>
                                <div id="wf-dash-actions-filters" style="display: ${leftTab === 'filters' ? 'flex' : 'none'}; align-items: center; gap: 8px;">
                                    <button type="button" id="wf-dash-reset-filters" style="${this._navBtnStyle()}">Reset</button>
                                    <button type="button" id="wf-dash-apply-filters" style="${this._navBtnPrimaryStyle()}">Apply</button>
                                </div>
                            </div>
                        </nav>
                        <div id="wf-dash-left-messages" style="display: none; flex-shrink: 0; padding: 8px 14px; border-bottom: 1px solid var(--border, #e2e8f0); background: var(--card, #ffffff); font-size: 11px; line-height: 1.4; flex-direction: column; gap: 6px;">
                            <div id="wf-dash-session-refresh-banner" style="display: none;"></div>
                            <div id="wf-dash-bootstrap-error" style="display: none; font-size: 12px; color: var(--destructive, #dc2626);"></div>
                            <div id="wf-dash-universal-hint" style="display: none; font-weight: 400; color: var(--muted-foreground, #64748b);"></div>
                            <div id="wf-dash-range-error" style="display: none; color: var(--destructive, #dc2626);"></div>
                            <div id="wf-dash-search-error" style="display: none; font-size: 12px; color: var(--destructive, #dc2626);"></div>
                            <div id="wf-dash-substring-error" style="display: none; color: var(--destructive, #dc2626);"></div>
                            <div id="wf-dash-apply-hint" style="display: none; color: var(--muted-foreground, #64748b);"></div>
                        </div>

                        <div id="wf-dash-left-panel-search" style="display: ${leftTab === 'search' ? 'flex' : 'none'}; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                            <div style="flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto;">
                                <div id="wf-dash-search-fields" style="padding: 14px; display: flex; flex-direction: column; gap: 14px;">
                                    <div>
                                        <div style="${label} margin-bottom: 8px; font-weight: 600;">Contributor search</div>
                                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                            <button type="button" id="wf-dash-toggle-tasks" aria-pressed="true" style="${this._btnToggleStyle(true, 'task_creation')}">Task Creation</button>
                                            <button type="button" id="wf-dash-toggle-qa" aria-pressed="true" style="${this._btnToggleStyle(true, 'qa')}">QA</button>
                                            <button type="button" id="wf-dash-toggle-disputes" aria-pressed="false" style="${this._btnToggleStyle(false, 'dispute')}">Disputes</button>
                                        </div>
                                    </div>
                                    <div>
                                        <div style="${label} margin-bottom: 6px; font-weight: 600;">Search depth</div>
                                        <div style="display: flex; width: 100%; gap: 8px;">
                                            <button type="button" id="wf-dash-depth-quick" aria-pressed="true" style="${this._btnDepthSegmentStyle(true)}">Quick</button>
                                            <button type="button" id="wf-dash-depth-deep" aria-pressed="false" style="${this._btnDepthSegmentStyle(false)}">Deep</button>
                                        </div>
                                        <div id="wf-dash-search-depth-hint" style="margin-top: 8px;"></div>
                                    </div>
                                    <div>
                                        <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Contributors</label>
                                        <div id="wf-dash-author-box" style="${input} display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 36px; cursor: text;">
                                            <input type="text" id="wf-dash-author-input" autocomplete="off" placeholder="Name, email, or UUID — Enter to resolve" style="flex: 1; min-width: 120px; border: none; outline: none; background: transparent; font-size: 12px; color: var(--foreground, #0f172a); padding: 2px 0;">
                                        </div>
                                        <div id="wf-dash-author-error" style="display: none; font-size: 11px; color: var(--destructive, #dc2626); margin-top: 4px;"></div>
                                        <div id="wf-dash-author-candidates" style="display: none; margin-top: 6px; ${box}"></div>
                                        <div style="${hint} margin-top: 4px;">Empty = all workers.</div>
                                    </div>
                                    <div>
                                        <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Quick range</label>
                                        <select id="wf-dash-quick-range" style="${input} width: 100%; cursor: pointer;">
                                            <option value="">Custom</option>
                                            <option value="all-time">All Time</option>
                                            <option value="today">Today</option>
                                            <option value="yesterday">Yesterday</option>
                                            <option value="3d">Last 3 Days</option>
                                            <option value="7d">Last 7 Days</option>
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
                                            <input type="date" id="wf-dash-after" style="${input} min-width: 0;">
                                        </div>
                                        <div style="flex: 1; min-width: 0;">
                                            <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Before</label>
                                            <input type="date" id="wf-dash-before" style="${input} min-width: 0;">
                                        </div>
                                        <button type="button" id="wf-dash-clear-dates" aria-label="Clear dates" title="Clear dates" style="${this._inputClearBtnStyle()} display: none;">&times;</button>
                                    </div>
                                    <div>
                                        <div style="${label} margin-bottom: 6px; font-weight: 600;">Team, projects, environments</div>
                                        <div style="${hint} margin-bottom: 8px;">None selected = all.</div>
                                        <div style="display: flex; flex-direction: column; gap: 12px;">
                                            ${this._multiSelectHtml('search-teams', 'Team', 'All teams', false)}
                                            ${this._multiSelectHtml('search-projects', 'Projects', 'All projects', false)}
                                            ${this._multiSelectHtml('search-envs', 'Environments', 'All environments', false)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="wf-dash-left-panel-filters" style="display: ${leftTab === 'filters' ? 'flex' : 'none'}; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                            <div style="flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 14px; display: flex; flex-direction: column; gap: 14px;">
                                <p style="${hint} margin: 0;">Refine loaded results. Press Apply to update the results pane.</p>
                                <div>
                                    <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Substring</label>
                                    <div style="position: relative; min-width: 0;">
                                        <input type="text" id="wf-dash-prompt" placeholder="Filter by substring/RegEx" style="${input} padding-right: 34px;">
                                        <button type="button" id="wf-dash-clear-prompt" aria-label="Clear substring" title="Clear substring" style="${this._inputClearBtnOverlayStyle()} display: none;">&times;</button>
                                    </div>
                                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 8px;">
                                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                            <input type="checkbox" id="wf-dash-case"> Case sensitive
                                        </label>
                                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                            <input type="checkbox" id="wf-dash-fuzzy"> Fuzzy
                                        </label>
                                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                            <input type="checkbox" id="wf-dash-regex"> RegEx (ECMAScript)
                                        </label>
                                    </div>
                                    <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; margin-top: 8px;">
                                        <input type="checkbox" id="wf-dash-hidden-versions"> Search hidden versions (requires hydrated results)
                                    </label>
                                </div>
                                <div id="wf-dash-filter-lists-wrap">
                                    <div style="${label} margin-bottom: 8px; font-weight: 600;">Narrow results</div>
                                    <div id="wf-dash-filter-lists" style="display: flex; flex-direction: column; gap: 12px;">
                                        ${DASH_FILTER_SCOPES.map((s) => this._multiSelectHtml(s.scopeKey, this._filterScopeLabel(s.scopeKey), 'Run a search to enable', true)).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>

                <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; ${box}">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                            <div style="display: flex; align-items: baseline; gap: 10px; min-width: 0; flex: 1; flex-wrap: wrap;">
                                <span style="font-size: 13px; font-weight: 600; color: var(--foreground, #0f172a); flex-shrink: 0;">Results</span>
                                <span id="wf-dash-results-status" style="${label} margin: 0;">Set search parameters on the left, then press Search.</span>
                            </div>
                            <div style="display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap;">
                                <button type="button" id="wf-dash-bulk-hydrate" style="${this._btnStyle()} display: none; font-size: 11px;">Hydrate results</button>
                                <button type="button" id="wf-dash-clear-results" style="${this._btnStyle()} font-size: 11px;">Clear Results</button>
                            </div>
                        </div>
                        <div id="wf-dash-results-toolbar-row2" style="display: none; margin-top: 10px; align-items: center; justify-content: space-between; gap: 12px; width: 100%; flex-wrap: wrap;">
                            <div id="wf-dash-results-kind-tab-buttons" style="display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; flex: 1;"></div>
                            <div id="wf-dash-results-pager-slot-kind" style="flex-shrink: 0; margin-left: auto;">
                                <div id="wf-dash-results-pager" style="display: none; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap;">
                                    <label style="${label} display: inline-flex; align-items: center; gap: 6px; margin: 0;">
                                        <span>Sort</span>
                                        <select id="wf-dash-sort" style="${input} width: auto; padding: 4px 8px; font-size: 11px; cursor: pointer;">
                                            <option value="desc">Newest first</option>
                                            <option value="asc">Oldest first</option>
                                        </select>
                                    </label>
                                    <label style="${label} display: inline-flex; align-items: center; gap: 6px; margin: 0;">
                                        <span>Show</span>
                                        <select id="wf-dash-results-page-size" style="${input} width: auto; padding: 4px 8px; font-size: 11px; cursor: pointer;">
                                            <option value="10">10</option>
                                            <option value="25">25</option>
                                            <option value="50">50</option>
                                            <option value="100">100</option>
                                            <option value="all">All</option>
                                        </select>
                                    </label>
                                    <span id="wf-dash-results-range-count" style="${label} white-space: nowrap;"></span>
                                    <button type="button" id="wf-dash-results-prev" aria-label="Previous page" title="Previous page" style="${this._pagerNavBtnStyle(true)}">&lt;</button>
                                    <button type="button" id="wf-dash-results-next" aria-label="Next page" title="Next page" style="${this._pagerNavBtnStyle(true)}">&gt;</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="wf-dash-results" style="flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 24px;"></div>
                </div>
            </section>
        `;
    },

    _filterScopeLabel(scopeKey) {
        const labels = {
            'filter-prompt-history': 'Prompt History',
            'filter-teams': 'Team',
            'filter-projects': 'Projects',
            'filter-envs': 'Environments',
            'filter-statuses': 'Current task status',
            'filter-contributors': 'Contributor',
            'filter-prompt-ratings': 'Prompt rating',
            'filter-task-issues': 'Task issues',
            'filter-return-types': 'Return types'
        };
        return labels[scopeKey] || scopeKey;
    },

    _multiSelectHtml(scopeKey, label, emptyHint, bulkActions) {
        const bulk = bulkActions ? `
                        <button type="button" data-wf-dash-ms-all="${dashEscHtml(scopeKey)}" style="font-size: 10px; font-weight: 600; padding: 0 4px; border: none; background: transparent; color: var(--brand, var(--primary, #2563eb)); cursor: pointer;">All</button>
                        <button type="button" data-wf-dash-ms-none="${dashEscHtml(scopeKey)}" style="font-size: 10px; font-weight: 600; padding: 0 4px; border: none; background: transparent; color: var(--muted-foreground, #64748b); cursor: pointer;">None</button>` : '';
        const filterRow = (scopeKey.startsWith('filter-') || scopeKey.startsWith('search-') || scopeKey.startsWith('team-members-')) ? `
                    <div data-wf-dash-ms-filter-wrap="${dashEscHtml(scopeKey)}" style="display: none; padding: 4px 8px; border-bottom: 1px solid var(--border, #e2e8f0);">
                        <input type="text" data-wf-dash-ms-filter="${dashEscHtml(scopeKey)}" placeholder="Filter options…" autocomplete="off" style="${this._inputStyle()} padding: 4px 8px; font-size: 11px;">
                    </div>` : '';
        return `
            <div data-wf-dash-ms-wrap="${dashEscHtml(scopeKey)}"${bulkActions ? ' data-wf-dash-ms-bulk-actions="1"' : ''} style="${this._panelBoxStyle()} min-width: 0; max-width: 100%; overflow: visible;">
                <div data-wf-dash-ms-sticky="${dashEscHtml(scopeKey)}">
                    <div data-wf-dash-ms-header="${dashEscHtml(scopeKey)}" style="display: flex; align-items: center; width: 100%; padding: 6px 10px; gap: 8px; box-sizing: border-box;">
                        <button type="button" data-wf-dash-ms-toggle="${dashEscHtml(scopeKey)}" aria-expanded="false" style="flex: 1; min-width: 0; display: block; padding: 0; border: none; background: transparent; cursor: pointer; font: inherit; color: inherit; text-align: left;">
                            <span style="font-size: 11px; font-weight: 600; color: var(--foreground, #0f172a);">${dashEscHtml(label)}</span>
                        </button>
                        <span data-wf-dash-ms-bulk="${dashEscHtml(scopeKey)}" style="display: none; align-items: center; gap: 6px; flex-shrink: 0;">
                            ${bulk}
                        </span>
                        <span id="wf-dash-${scopeKey}-count" style="display: none; flex-shrink: 0; font-size: 10px; font-weight: 600; color: var(--brand, var(--primary, #2563eb));"></span>
                        <button type="button" data-wf-dash-ms-toggle="${dashEscHtml(scopeKey)}" aria-hidden="true" tabindex="-1" style="flex-shrink: 0; padding: 0; border: none; background: transparent; cursor: pointer; font: inherit; color: inherit;">
                            <span data-wf-dash-ms-chevron="${dashEscHtml(scopeKey)}" style="font-size: 11px; color: var(--muted-foreground, #64748b);">▸</span>
                        </button>
                    </div>
                    ${filterRow}
                </div>
                <div id="wf-dash-${scopeKey}-list" data-wf-dash-ms-panel="${dashEscHtml(scopeKey)}" data-wf-dash-empty="${dashEscHtml(emptyHint)}" style="display: none;">
                    <div data-wf-dash-ms-items="${dashEscHtml(scopeKey)}" style="${this._msItemsContainerStyle()}">
                        <p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">${dashEscHtml(emptyHint)}</p>
                    </div>
                </div>
            </div>
        `;
    },

    _q(selector) {
        return this._modal ? this._modal.querySelector(selector) : null;
    },

    // ── Listener wiring ──

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

        if (Context.opsTab && typeof Context.opsTab.attachDashboardListeners === 'function') {
            Context.opsTab.attachDashboardListeners(modal, this);
        }

        if (Context.settingsUi && typeof Context.settingsUi.attachUpdateBannerListeners === 'function') {
            Context.settingsUi.attachUpdateBannerListeners(modal, 'dashboard');
        }

        modal.querySelectorAll('[data-wf-dash-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (this._shouldShowDashboardUpdateTab() && btn.getAttribute('data-wf-dash-tab') !== 'update') return;
                this._setActiveTab(btn.getAttribute('data-wf-dash-tab'));
            });
        });

        const depthQuick = this._q('#wf-dash-depth-quick');
        const depthDeep = this._q('#wf-dash-depth-deep');
        if (depthQuick) depthQuick.addEventListener('click', () => this._setSearchDepth('quick'));
        if (depthDeep) depthDeep.addEventListener('click', () => this._setSearchDepth('deep'));

        const bulkHydrate = this._q('#wf-dash-bulk-hydrate');
        if (bulkHydrate) bulkHydrate.addEventListener('click', () => { void this._bulkHydrateVisible(); });

        const pageSizeSel = this._q('#wf-dash-results-page-size');
        if (pageSizeSel) {
            pageSizeSel.addEventListener('change', () => {
                const val = pageSizeSel.value;
                this._state.resultsPageSize = val === 'all' ? 'all' : (Number(val) || DASH_RESULTS_PAGE_SIZE_DEFAULT);
                this._persistResultsPageSizePref(val);
                this._state.resultsPage = 0;
                Logger.log('dashboard: results page size — ' + val);
                this._renderResults();
                this._syncResultsPagerUi();
            });
        }

        const sortSel = this._q('#wf-dash-sort');
        if (sortSel) {
            sortSel.addEventListener('change', () => this._applySortAndRender());
        }

        const resultsPrev = this._q('#wf-dash-results-prev');
        const resultsNext = this._q('#wf-dash-results-next');
        if (resultsPrev) resultsPrev.addEventListener('click', () => this._goResultsPage(-1));
        if (resultsNext) resultsNext.addEventListener('click', () => this._goResultsPage(1));

        // Author token input
        const authorBox = this._q('#wf-dash-author-box');
        const authorInput = this._q('#wf-dash-author-input');
        if (authorBox && authorInput) {
            authorBox.addEventListener('click', () => authorInput.focus());
            authorInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const query = authorInput.value.trim();
                    if (query) void this._resolveAuthorToken(query);
                } else if (e.key === 'Backspace' && authorInput.value === '' && this._state.draftTokens.length > 0) {
                    this._removeAuthorToken(this._state.draftTokens[this._state.draftTokens.length - 1].id);
                }
            });
            authorInput.addEventListener('input', () => {
                if (authorInput.value.endsWith(',')) {
                    const query = authorInput.value.slice(0, -1).trim();
                    authorInput.value = '';
                    if (query) void this._resolveAuthorToken(query);
                }
                this._setAuthorError('');
                this._hideAuthorCandidates();
            });
        }

        // Inputs affecting search (only when unlocked)
        ['#wf-dash-after', '#wf-dash-before'].forEach((sel) => {
            const el = this._q(sel);
            if (el) el.addEventListener('change', () => {
                this._validateRangeUi();
                if (!this._applyingQuickDate) {
                    const quick = this._q('#wf-dash-quick-range');
                    if (quick) quick.value = '';
                }
            });
        });

        const clearDates = this._q('#wf-dash-clear-dates');
        if (clearDates) clearDates.addEventListener('click', () => this._clearDateRangeFields());

        const toggleTasks = this._q('#wf-dash-toggle-tasks');
        const toggleQa = this._q('#wf-dash-toggle-qa');
        const toggleDisputes = this._q('#wf-dash-toggle-disputes');
        if (toggleTasks) toggleTasks.addEventListener('click', () => {
            this._toggleOutputType('tasks');
            this._validateRangeUi();
        });
        if (toggleQa) toggleQa.addEventListener('click', () => {
            this._toggleOutputType('qa');
            this._validateRangeUi();
        });
        if (toggleDisputes) toggleDisputes.addEventListener('click', () => {
            this._toggleOutputType('disputes');
            this._validateRangeUi();
        });

        const prompt = this._q('#wf-dash-prompt');
        if (prompt) {
            prompt.addEventListener('input', () => {
                this._updateSubstringErrorUi();
                this._syncFieldClearButtons();
            });
            prompt.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._applyFiltersAndRender();
                }
            });
        }
        const clearPrompt = this._q('#wf-dash-clear-prompt');
        if (clearPrompt) {
            clearPrompt.addEventListener('click', () => {
                if (prompt) prompt.value = '';
                this._updateSubstringErrorUi();
                this._syncFieldClearButtons();
            });
        }
        const fuzzyEl = this._q('#wf-dash-fuzzy');
        const regexEl = this._q('#wf-dash-regex');
        if (fuzzyEl) {
            fuzzyEl.addEventListener('change', () => {
                if (fuzzyEl.checked && regexEl) regexEl.checked = false;
                this._updateSubstringErrorUi();
            });
        }
        if (regexEl) {
            regexEl.addEventListener('change', () => {
                if (regexEl.checked && fuzzyEl) fuzzyEl.checked = false;
                this._updateSubstringErrorUi();
            });
        }
        const caseEl = this._q('#wf-dash-case');
        if (caseEl) caseEl.addEventListener('change', () => this._updateSubstringErrorUi());
        const hiddenVersions = this._q('#wf-dash-hidden-versions');
        if (hiddenVersions) hiddenVersions.addEventListener('change', () => this._updateApplyFiltersUi());
        const applyFilters = this._q('#wf-dash-apply-filters');
        if (applyFilters) applyFilters.addEventListener('click', () => this._applyFiltersAndRender());
        const resetFilters = this._q('#wf-dash-reset-filters');
        if (resetFilters) resetFilters.addEventListener('click', () => this._resetFiltersToDefaults());

        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) {
            quickRange.addEventListener('change', () => {
                const preset = quickRange.value;
                if (!preset) return;
                this._applyQuickDatePreset(preset);
            });
        }

        const search = this._q('#wf-dash-search');
        if (search) search.addEventListener('click', () => { void this._submitSearch(); });
        const clearParams = this._q('#wf-dash-clear-params');
        if (clearParams) clearParams.addEventListener('click', () => this._clearParameters());
        const clearResults = this._q('#wf-dash-clear-results');
        if (clearResults) clearResults.addEventListener('click', () => this._clearResults());

        modal.querySelectorAll('[data-wf-dash-left-tab]').forEach((btn) => {
            btn.addEventListener('click', () => this._setLeftTab(btn.getAttribute('data-wf-dash-left-tab')));
        });

        modal.addEventListener('input', (e) => {
            const filterEl = e.target;
            if (filterEl && filterEl.matches('[data-wf-dash-ms-filter]') && modal.contains(filterEl)) {
                this._applyMsDropdownFilter(filterEl.getAttribute('data-wf-dash-ms-filter'), filterEl.value);
            }
        });

        modal.addEventListener('change', (e) => {
            const cb = e.target;
            if (!cb || cb.type !== 'checkbox') return;
            const msKey = cb.getAttribute('data-wf-dash-ms');
            if (!msKey) return;
            this._updateMsCount(msKey);
            if (msKey === 'search-teams') this._renderSearchProjectsList();
            if (msKey.startsWith('search-')) this._validateRangeUi();
            if (msKey.startsWith('team-members-') && Context.opsTab && typeof Context.opsTab.onTeamMemberMsChange === 'function') {
                Context.opsTab.onTeamMemberMsChange(this._modal);
            }
            if (msKey.startsWith('filter-') && this._state.cachedItems) {
                this._renderFilterLists();
            }
            if (msKey.startsWith('filter-')) this._updateApplyFiltersUi();
        });

        // Delegated copy, card UI, candidate selection handlers
        modal.addEventListener('click', (e) => {
            const msToggle = e.target.closest('[data-wf-dash-ms-toggle]');
            if (msToggle && modal.contains(msToggle)) {
                this._toggleMsDropdown(msToggle.getAttribute('data-wf-dash-ms-toggle'));
                return;
            }
            const copyEl = e.target.closest('[data-wf-dash-copy]');
            if (copyEl && modal.contains(copyEl)) {
                void this._copyWithFeedback(copyEl, copyEl.getAttribute('data-wf-dash-copy'));
                return;
            }
            const candidate = e.target.closest('[data-wf-dash-candidate]');
            if (candidate && modal.contains(candidate)) {
                const id = candidate.getAttribute('data-wf-dash-candidate');
                const cand = (this._state._candidates || []).find((c) => c.id === id);
                if (cand) { this._addAuthorToken(cand); if (authorInput) authorInput.value = ''; }
                return;
            }
            const removeTok = e.target.closest('[data-wf-dash-remove-token]');
            if (removeTok && modal.contains(removeTok)) {
                e.stopPropagation();
                this._removeAuthorToken(removeTok.getAttribute('data-wf-dash-remove-token'));
                return;
            }
            const msAll = e.target.closest('[data-wf-dash-ms-all]');
            if (msAll && modal.contains(msAll)) {
                const key = msAll.getAttribute('data-wf-dash-ms-all');
                this._setMultiselectChecked(key, true);
                if (key.startsWith('filter-') && this._state.cachedItems) this._renderFilterLists();
                if (key.startsWith('filter-')) this._updateApplyFiltersUi();
                if (key.startsWith('team-members-') && Context.opsTab && typeof Context.opsTab.onTeamMemberMsChange === 'function') {
                    Context.opsTab.onTeamMemberMsChange(this._modal);
                }
                return;
            }
            const msNone = e.target.closest('[data-wf-dash-ms-none]');
            if (msNone && modal.contains(msNone)) {
                const key = msNone.getAttribute('data-wf-dash-ms-none');
                this._setMultiselectChecked(key, false);
                if (key.startsWith('filter-') && this._state.cachedItems) this._renderFilterLists();
                if (key.startsWith('filter-')) this._updateApplyFiltersUi();
                if (key.startsWith('team-members-') && Context.opsTab && typeof Context.opsTab.onTeamMemberMsChange === 'function') {
                    Context.opsTab.onTeamMemberMsChange(this._modal);
                }
                return;
            }
            const reviewerBadge = e.target.closest('[data-wf-dash-reviewer-badge]');
            if (reviewerBadge && modal.contains(reviewerBadge)) {
                const itemId = reviewerBadge.getAttribute('data-item-id');
                const taskId = reviewerBadge.getAttribute('data-task-id');
                const displayNo = parseInt(reviewerBadge.getAttribute('data-display-no'), 10);
                const ui = this._getCardUi(taskId);
                ui.expanded = false;
                ui.selectedDisplayNo = displayNo;
                this._patchTaskCard(itemId);
                return;
            }
            const showAllBtn = e.target.closest('[data-wf-dash-card-show-all]');
            if (showAllBtn && modal.contains(showAllBtn)) {
                const itemId = showAllBtn.getAttribute('data-item-id');
                const taskId = showAllBtn.getAttribute('data-task-id');
                const ui = this._getCardUi(taskId);
                ui.expanded = true;
                this._patchTaskCard(itemId);
                return;
            }
            const collapseBtn = e.target.closest('[data-wf-dash-card-collapse]');
            if (collapseBtn && modal.contains(collapseBtn)) {
                const itemId = collapseBtn.getAttribute('data-item-id');
                const taskId = collapseBtn.getAttribute('data-task-id');
                const ui = this._getCardUi(taskId);
                ui.expanded = false;
                ui.selectedDisplayNo = null;
                this._patchTaskCard(itemId);
                return;
            }
            const timelineToggle = e.target.closest('[data-wf-dash-timeline-order]');
            if (timelineToggle && modal.contains(timelineToggle)) {
                const itemId = timelineToggle.getAttribute('data-item-id');
                const taskId = timelineToggle.getAttribute('data-task-id');
                const ui = this._getCardUi(taskId);
                ui.timelineNewestFirst = !ui.timelineNewestFirst;
                this._patchTaskCard(itemId);
                return;
            }
            const openTaskBtn = e.target.closest('[data-wf-dash-open-task]');
            if (openTaskBtn && modal.contains(openTaskBtn)) {
                const taskId = openTaskBtn.getAttribute('data-task-id');
                const teamId = openTaskBtn.getAttribute('data-team-id');
                const itemId = openTaskBtn.getAttribute('data-item-id');
                if (taskId && itemId) void this._openTaskInFleet(taskId, teamId, itemId);
                return;
            }
            const disputeClaimBtn = e.target.closest('[data-wf-dash-dispute-claim]');
            if (disputeClaimBtn && modal.contains(disputeClaimBtn)) {
                const disputeId = disputeClaimBtn.getAttribute('data-dispute-id');
                const itemId = disputeClaimBtn.getAttribute('data-item-id');
                if (disputeId && itemId) void this._claimDispute(disputeId, itemId);
                return;
            }
            const hydrateBtn = e.target.closest('[data-wf-dash-hydrate]');
            if (hydrateBtn && modal.contains(hydrateBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const itemId = hydrateBtn.getAttribute('data-item-id');
                if (itemId) void this._hydrateCard(itemId);
                return;
            }
            if (!e.target.closest('[data-wf-dash-ms-wrap]') && Object.keys(this._state.msDropdownOpen).length > 0) {
                this._closeAllMsDropdowns();
            }
        });

        modal.addEventListener('change', (e) => {
            const sel = e.target;
            if (!sel || !sel.matches('[data-wf-dash-card-version-select]')) return;
            const itemId = sel.getAttribute('data-item-id');
            const taskId = sel.getAttribute('data-task-id');
            const displayNo = parseInt(sel.value, 10);
            const ui = this._getCardUi(taskId);
            ui.expanded = false;
            ui.selectedDisplayNo = displayNo;
            this._patchTaskCard(itemId);
        });
    },

    _toggleOutputType(kind) {
        if (kind === 'tasks') {
            this._state.includeTasks = !this._state.includeTasks;
            this._syncOutputToggleUi();
            Logger.log('dashboard: Task Creation ' + (this._state.includeTasks ? 'on' : 'off'));
        } else if (kind === 'qa') {
            this._state.includeQa = !this._state.includeQa;
            this._syncOutputToggleUi();
            Logger.log('dashboard: QA ' + (this._state.includeQa ? 'on' : 'off'));
        } else if (kind === 'disputes') {
            this._state.includeDisputes = !this._state.includeDisputes;
            this._syncOutputToggleUi();
            Logger.log('dashboard: Disputes ' + (this._state.includeDisputes ? 'on' : 'off'));
        }
    },

    _syncOutputToggleUi() {
        const tasksBtn = this._q('#wf-dash-toggle-tasks');
        const qaBtn = this._q('#wf-dash-toggle-qa');
        const disputesBtn = this._q('#wf-dash-toggle-disputes');
        if (tasksBtn) {
            tasksBtn.setAttribute('aria-pressed', this._state.includeTasks ? 'true' : 'false');
            tasksBtn.style.cssText = this._btnToggleStyle(this._state.includeTasks, 'task_creation');
        }
        if (qaBtn) {
            qaBtn.setAttribute('aria-pressed', this._state.includeQa ? 'true' : 'false');
            qaBtn.style.cssText = this._btnToggleStyle(this._state.includeQa, 'qa');
        }
        if (disputesBtn) {
            disputesBtn.setAttribute('aria-pressed', this._state.includeDisputes ? 'true' : 'false');
            disputesBtn.style.cssText = this._btnToggleStyle(this._state.includeDisputes, 'dispute');
        }
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

    _msPanelOpenStyle() {
        return 'display: block; width: 100%; min-width: 0; overflow-x: hidden; overflow-y: visible; border-top: 1px solid var(--border, #e2e8f0); background: var(--card, #ffffff);';
    },

    _msItemsContainerStyle() {
        return 'padding: 4px; display: flex; flex-direction: column; align-items: stretch; width: 100%; min-width: 0; overflow-x: hidden; box-sizing: border-box;';
    },

    _msOptionCount(scopeKey) {
        const itemsEl = this._msItemsEl(scopeKey);
        if (!itemsEl) return 0;
        return itemsEl.querySelectorAll('input[type="checkbox"][data-wf-dash-ms]').length;
    },

    _syncMsDropdownChrome(scopeKey) {
        const optionCount = this._msOptionCount(scopeKey);
        const open = this._isMsDropdownOpen(scopeKey);
        const wrap = this._msWrapEl(scopeKey);
        const hasBulkActions = Boolean(wrap && wrap.getAttribute('data-wf-dash-ms-bulk-actions') === '1');
        const filterWrap = this._q('[data-wf-dash-ms-filter-wrap="' + scopeKey + '"]');
        if (filterWrap) {
            const showFilter = open && optionCount >= 5;
            if (!showFilter) {
                const input = filterWrap.querySelector('[data-wf-dash-ms-filter]');
                if (input && input.value) {
                    input.value = '';
                    this._applyMsDropdownFilter(scopeKey, '');
                }
            }
            filterWrap.style.display = showFilter ? '' : 'none';
        }
        const bulkEl = this._q('[data-wf-dash-ms-bulk="' + scopeKey + '"]');
        if (bulkEl) {
            const showBulk = open && hasBulkActions && optionCount > 1;
            bulkEl.style.display = showBulk ? 'inline-flex' : 'none';
        }
        const itemsEl = this._msItemsEl(scopeKey);
        if (itemsEl) {
            const singleOption = optionCount === 1;
            itemsEl.querySelectorAll('label[data-wf-dash-ms-option]').forEach((label) => {
                const cb = label.querySelector('input[type="checkbox"]');
                if (!cb) return;
                if (singleOption) {
                    cb.checked = true;
                    cb.disabled = true;
                    label.style.cursor = 'default';
                    label.style.opacity = '0.85';
                } else {
                    cb.disabled = false;
                    label.style.cursor = 'pointer';
                    label.style.opacity = '';
                }
            });
        }
    },

    _syncMsDropdown(scopeKey) {
        const open = this._isMsDropdownOpen(scopeKey);
        const panel = this._msPanelEl(scopeKey);
        const wrap = this._msWrapEl(scopeKey);
        const toggles = wrap ? wrap.querySelectorAll('[data-wf-dash-ms-toggle="' + scopeKey + '"]') : [];
        const chevron = this._q('[data-wf-dash-ms-chevron="' + scopeKey + '"]');
        if (panel) panel.style.cssText = open ? this._msPanelOpenStyle() : 'display: none;';
        if (wrap) {
            wrap.style.width = '';
            if (open) wrap.setAttribute('data-wf-dash-ms-open', '1');
            else wrap.removeAttribute('data-wf-dash-ms-open');
        }
        toggles.forEach((toggle) => toggle.setAttribute('aria-expanded', open ? 'true' : 'false'));
        if (chevron) chevron.textContent = open ? '▾' : '▸';
        this._syncMsDropdownChrome(scopeKey);
    },

    _syncAllMsDropdowns() {
        const keys = DASH_FILTER_SCOPES.map((s) => s.scopeKey)
            .concat(['search-teams', 'search-projects', 'search-envs', ...DASH_TEAM_MEMBERS_MS_KEYS]);
        for (const key of keys) this._syncMsDropdown(key);
    },

    _closeAllMsDropdowns() {
        this._state.msDropdownOpen = {};
        this._state.msDropdownFilter = {};
        const scopeKeys = DASH_FILTER_SCOPES.map((s) => s.scopeKey)
            .concat(['search-teams', 'search-projects', 'search-envs', ...DASH_TEAM_MEMBERS_MS_KEYS]);
        for (const scopeKey of scopeKeys) {
            const input = this._q('[data-wf-dash-ms-filter="' + scopeKey + '"]');
            if (input) input.value = '';
            this._applyMsDropdownFilter(scopeKey, '');
        }
        this._syncAllMsDropdowns();
    },

    _msDropdownScrollEl(scopeKey) {
        const panelId = (scopeKey && scopeKey.startsWith('filter-'))
            ? '#wf-dash-left-panel-filters'
            : (scopeKey && scopeKey.startsWith('search-') ? '#wf-dash-left-panel-search'
                : (scopeKey && scopeKey.startsWith('team-members-') ? '#wf-ops-team-left-scroll' : null));
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

    _toggleMsDropdown(scopeKey) {
        const wasOpen = this._isMsDropdownOpen(scopeKey);
        if (dashIsTeamMembersMsKey(scopeKey)) {
            if (wasOpen) delete this._state.msDropdownOpen[scopeKey];
            else this._state.msDropdownOpen[scopeKey] = true;
            this._syncMsDropdown(scopeKey);
            if (!wasOpen) this._scrollOpenedMsDropdownIntoView(scopeKey);
            return;
        }
        this._state.msDropdownOpen = {};
        const opening = !wasOpen;
        if (opening) this._state.msDropdownOpen[scopeKey] = true;
        this._syncAllMsDropdowns();
        if (opening) this._scrollOpenedMsDropdownIntoView(scopeKey);
    },

    _applyMsDropdownFilter(scopeKey, query) {
        if (!scopeKey) return;
        this._state.msDropdownFilter[scopeKey] = query || '';
        const itemsEl = this._msItemsEl(scopeKey);
        if (!itemsEl) return;
        const q = String(query || '').trim();
        const optionLabels = itemsEl.querySelectorAll('label[data-wf-dash-ms-option]');
        if (optionLabels.length === 0) return;
        const lib = dashLib();
        let visible = 0;
        optionLabels.forEach((label) => {
            const text = label.getAttribute('data-wf-dash-ms-label') || '';
            const show = !q || lib.textMatchesQuery(text, q, true, false);
            label.style.display = show ? '' : 'none';
            if (show) visible += 1;
        });
        let noMatchEl = itemsEl.querySelector('[data-wf-dash-ms-no-match]');
        if (q && visible === 0) {
            if (!noMatchEl) {
                noMatchEl = document.createElement('p');
                noMatchEl.setAttribute('data-wf-dash-ms-no-match', '1');
                noMatchEl.style.cssText = 'padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);';
                noMatchEl.textContent = 'No matches';
                itemsEl.appendChild(noMatchEl);
            }
            noMatchEl.style.display = '';
        } else if (noMatchEl) {
            noMatchEl.style.display = 'none';
        }
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
        if (this._shouldShowDashboardUpdateTab() && tabId !== 'update') {
            tabId = 'update';
        }
        this._state.activeTab = tabId;
        this._modal.querySelectorAll('[data-wf-dash-tab]').forEach((btn) => {
            const id = btn.getAttribute('data-wf-dash-tab');
            const active = id === tabId;
            if (id === 'update') {
                btn.style.color = active ? '#991b1b' : '#b91c1c';
                btn.style.borderBottomColor = active ? '#dc2626' : 'transparent';
            } else {
                btn.style.color = active ? 'var(--foreground, #0f172a)' : 'var(--muted-foreground, #64748b)';
                btn.style.borderBottomColor = active ? 'var(--brand, var(--primary, #2563eb))' : 'transparent';
            }
        });
        const flexPanels = new Set(['search-output', 'team-members', 'verifier-fetcher', 'update']);
        this._modal.querySelectorAll('[data-wf-dash-panel]').forEach((panel) => {
            const active = panel.getAttribute('data-wf-dash-panel') === tabId;
            if (flexPanels.has(tabId)) {
                panel.style.display = active ? 'flex' : 'none';
            } else {
                panel.style.display = active ? '' : 'none';
            }
        });
        if (Context.opsTab && typeof Context.opsTab.onDashboardTabActivated === 'function') {
            Context.opsTab.onDashboardTabActivated(this._modal, tabId);
        }
    },

    // ── Author tokens ──

    async _resolveAuthorToken(raw) {
        const query = (raw || '').trim();
        if (!query) return 'empty';
        const tokens = this._state.draftTokens;
        if (tokens.some((t) => t.full_name === query || t.email === query || t.id === query)) {
            const input = this._q('#wf-dash-author-input');
            if (input) input.value = '';
            return 'resolved';
        }
        this._setAuthorError('');
        this._hideAuthorCandidates();
        try {
            const results = await this._searchPersons(query);
            const input = this._q('#wf-dash-author-input');
            if (results.length === 0) {
                this._setAuthorError(`No match for "${query}"`);
                return 'none';
            }
            if (results.length === 1) {
                this._addAuthorToken(results[0]);
                if (input) input.value = '';
                return 'resolved';
            }
            if (input) input.value = '';
            this._showAuthorCandidates(results);
            return 'multiple';
        } catch (err) {
            if (!this._handleDashSessionRefreshError(err)) {
                this._setAuthorError('Lookup failed: ' + err.message);
            } else {
                this._setAuthorError('');
            }
            Logger.warn('dashboard: author lookup failed', err);
            return 'error';
        }
    },

    async _flushPendingAuthorInput() {
        const input = this._q('#wf-dash-author-input');
        const query = (input && input.value || '').trim();
        if (!query) return null;
        const outcome = await this._resolveAuthorToken(query);
        if (outcome === 'resolved' || outcome === 'empty') return null;
        if (outcome === 'multiple') {
            return 'Multiple author matches — pick one from the list below.';
        }
        if (outcome === 'none') {
            return `No author match for "${query}".`;
        }
        return 'Author lookup failed — try again.';
    },

    _normalizeAuthorPerson(person) {
        const id = String(person && person.id || '').trim();
        if (!id) return null;
        return {
            id,
            full_name: person.full_name,
            email: person.email
        };
    },

    _setAuthorTokens(persons, options) {
        if (!this._modal) {
            Logger.warn('dashboard: setAuthorTokens skipped — modal not open');
            return;
        }
        const opts = options || {};
        const replace = opts.replace !== false;
        const activeTab = opts.activeTab;
        const normalized = (Array.isArray(persons) ? persons : [])
            .map((p) => this._normalizeAuthorPerson(p))
            .filter(Boolean);
        if (replace) {
            this._state.draftTokens = normalized;
        } else {
            for (const person of normalized) {
                if (!this._state.draftTokens.some((t) => t.id === person.id)) {
                    this._state.draftTokens.push(person);
                }
            }
        }
        this._hideAuthorCandidates();
        this._setAuthorError('');
        const input = this._q('#wf-dash-author-input');
        if (input) input.value = '';
        this._renderAuthorTokens();
        this._validateRangeUi();
        if (activeTab) this._setActiveTab(activeTab);
        const label = normalized.map((p) => this._personDisplayLabel(p)).join(', ') || '(none)';
        Logger.log('dashboard: author tokens ' + (replace ? 'replaced' : 'merged') + ' (' + label + ')');
    },

    _addAuthorToken(person) {
        if (this._state.draftTokens.some((t) => t.id === person.id)) return;
        this._state.draftTokens.push(person);
        this._hideAuthorCandidates();
        this._setAuthorError('');
        this._renderAuthorTokens();
        this._validateRangeUi();
        Logger.log('dashboard: author token added (' + this._personDisplayLabel(person) + ')');
    },

    _removeAuthorToken(id) {
        this._state.draftTokens = this._state.draftTokens.filter((t) => t.id !== id);
        this._renderAuthorTokens();
        this._validateRangeUi();
    },

    _renderAuthorTokens() {
        const box = this._q('#wf-dash-author-box');
        const input = this._q('#wf-dash-author-input');
        if (!box || !input) return;
        box.querySelectorAll('[data-wf-dash-token]').forEach((el) => el.remove());
        const frag = this._pageWindow().document.createDocumentFragment();
        for (const t of this._state.draftTokens) {
            const chip = this._pageWindow().document.createElement('span');
            chip.setAttribute('data-wf-dash-token', t.id);
            chip.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: color-mix(in srgb, var(--brand, var(--primary, #2563eb)) 12%, transparent); color: var(--brand, var(--primary, #2563eb));';
            const tokenLabel = this._personDisplayLabel(t);
            chip.innerHTML = `${dashEscHtml(tokenLabel)}<button type="button" data-wf-dash-remove-token="${dashEscHtml(t.id)}" aria-label="Remove ${dashEscHtml(tokenLabel)}" style="border: none; background: transparent; color: inherit; cursor: pointer; font-size: 13px; line-height: 1; padding: 0 0 0 2px;">&times;</button>`;
            frag.appendChild(chip);
        }
        box.insertBefore(frag, input);
        input.placeholder = this._state.draftTokens.length === 0 ? 'Name, email, or UUID — Enter to resolve' : '';
    },

    _setAuthorError(text) {
        const el = this._q('#wf-dash-author-error');
        if (!el) return;
        el.textContent = text || '';
        el.style.display = text ? 'block' : 'none';
    },

    _showAuthorCandidates(results) {
        this._state._candidates = results;
        const wrap = this._q('#wf-dash-author-candidates');
        if (!wrap) return;
        wrap.innerHTML = `
            <p style="padding: 6px 10px; font-size: 11px; color: var(--muted-foreground, #64748b); border-bottom: 1px solid var(--border, #e2e8f0);">Multiple matches — pick one:</p>
            <div style="max-height: 180px; overflow-y: auto; padding: 4px;">
                ${results.map((c) => {
                    const label = this._personDisplayLabel(c);
                    const showEmail = c.email && label !== c.email;
                    return `
                    <button type="button" data-wf-dash-candidate="${dashEscHtml(c.id)}" style="display: block; width: 100%; text-align: left; padding: 6px 8px; font-size: 11px; background: transparent; border: none; border-radius: 4px; cursor: pointer; color: var(--foreground, #0f172a);">
                        <span style="font-weight: 600;">${dashEscHtml(label)}</span>
                        ${showEmail ? `<span style="margin-left: 8px; color: var(--muted-foreground, #64748b);">${dashEscHtml(c.email)}</span>` : ''}
                    </button>`;
                }).join('')}
            </div>`;
        wrap.style.display = 'block';
    },

    _hideAuthorCandidates() {
        const wrap = this._q('#wf-dash-author-candidates');
        if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
        this._state._candidates = [];
    },

    // ── Multiselect rendering / reading ──

    _isDashSessionRefreshError(err) {
        const ops = Context.opsTab;
        return !!(ops && typeof ops.isSessionRefreshRequiredError === 'function' && ops.isSessionRefreshRequiredError(err));
    },

    _handleDashSessionRefreshError(err) {
        if (!this._isDashSessionRefreshError(err)) return false;
        this._state.sessionRefreshRequired = true;
        this._syncDashSessionRefreshBanner();
        return true;
    },

    _renderDashSessionRefreshBannerHtml() {
        return [
            '<div style="',
            'padding: 12px;background: #fee2e2;border: 2px solid #dc2626;border-radius: 8px;">',
            '<div style="display: flex; align-items: flex-start; gap: 10px;">',
            '<span style="color: #dc2626; font-size: 16px; line-height: 1.2;" aria-hidden="true">⚠</span>',
            '<div style="flex: 1; min-width: 0;">',
            '<div style="font-size: 13px; font-weight: 600; color: #991b1b; margin-bottom: 6px;">Fleet session token not yet captured</div>',
            '<p style="font-size: 12px; color: #991b1b; margin: 0; line-height: 1.45;">',
            'Navigate to a Fleet data page (e.g. Tasks or QA), then close and reopen the dashboard or retry your search.',
            '</p>',
            '</div>',
            '</div>',
            '<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #fecaca; text-align: center;">',
            '<a href="', dashEscHtml(DASH_FLEET_ORIGIN), '/" target="_blank" rel="noopener noreferrer" id="wf-dash-session-reload" style="',
            'display: inline-block;padding: 8px 14px;font-size: 12px;font-weight: 600;',
            'color: #991b1b;background: #fef2f2;border: 1px solid #dc2626;border-radius: 6px;',
            'cursor: pointer;text-decoration: none;">Reload Fleet</a>',
            '</div>',
            '</div>'
        ].join('');
    },

    _syncDashSessionRefreshBanner() {
        const banner = this._q('#wf-dash-session-refresh-banner');
        const errEl = this._q('#wf-dash-bootstrap-error');
        const show = !!this._state.sessionRefreshRequired;
        if (banner) {
            if (show) {
                banner.innerHTML = this._renderDashSessionRefreshBannerHtml();
                banner.style.display = 'block';
                const reload = banner.querySelector('#wf-dash-session-reload');
                if (reload && !reload.dataset.wfDashWired) {
                    reload.dataset.wfDashWired = '1';
                    reload.addEventListener('click', () => {
                        Logger.log('dashboard: session refresh banner — Reload Fleet link opened');
                    });
                }
            } else {
                banner.innerHTML = '';
                banner.style.display = 'none';
            }
        }
        if (errEl && show) {
            errEl.style.display = 'none';
            errEl.textContent = '';
        }
        this._syncLeftMessagesBar();
    },

    _refreshCatalogDependentUi() {
        if (!this._built) return;
        this._syncDashSessionRefreshBanner();
        const status = this._state.bootstrapStatus;
        const errEl = this._q('#wf-dash-bootstrap-error');
        if (errEl) {
            if (status === 'error' && !this._state.sessionRefreshRequired) {
                errEl.textContent = 'Bootstrap failed: ' + (this._state.bootstrapError || 'unknown') + '. Filters may be empty.';
                errEl.style.display = 'block';
            } else if (!this._state.sessionRefreshRequired) {
                errEl.style.display = 'none';
            }
        }
        this._renderSearchTeamsList();
        this._renderSearchProjectsList();
        this._renderSearchEnvsList();
        this._syncLeftMessagesBar();
    },

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

    _multiSelectItemsHtml(scopeKey, items, emptyHint, loading, defaultChecked, irrelevantIds) {
        if (loading) return `<p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">Loading…</p>`;
        if (items.length === 0) return `<p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">${dashEscHtml(emptyHint)}</p>`;
        const irrelevant = irrelevantIds || null;
        const singleOption = items.length === 1;
        return items.map((it) => {
            const dim = irrelevant && irrelevant.has(it.id);
            const dimStyle = dim ? ' color: var(--muted-foreground, #64748b); opacity: 0.5;' : '';
            const email = String(it.email || '').trim();
            const displayName = String(it.name || it.label || '').trim();
            const textHtml = email
                ? `<span data-wf-dash-ms-option-text="1" style="${dimStyle}">
                    <div data-wf-dash-ms-option-name="1">${dashEscHtml(displayName)}</div>
                    <div data-wf-dash-ms-option-email="1">${dashEscHtml(email)}</div>
                </span>`
                : `<span data-wf-dash-ms-option-text="1" style="${dimStyle}">${dashEscHtml(it.label)}</span>`;
            const labelCursor = singleOption ? 'default' : 'pointer';
            const labelOpacity = singleOption ? '0.85' : '';
            const checked = singleOption || defaultChecked;
            const disabledAttr = singleOption ? ' disabled' : '';
            return `
            <label data-wf-dash-ms-option="1" data-wf-dash-ms-label="${dashEscHtml(it.label)}" style="padding: 4px 8px; font-size: 11px; border-radius: 4px; cursor: ${labelCursor}; color: var(--foreground, #0f172a);${labelOpacity ? ' opacity: ' + labelOpacity + ';' : ''}">
                <span data-wf-dash-ms-option-cb="1"><input type="checkbox" value="${dashEscHtml(it.id)}" data-wf-dash-ms="${dashEscHtml(scopeKey)}"${checked ? ' checked' : ''}${disabledAttr}></span>
                ${textHtml}
            </label>`;
        }).join('');
    },

    _updateMsCount(scopeKey) {
        const countEl = this._q('#wf-dash-' + scopeKey + '-count');
        if (!countEl) return;
        const all = this._allFromList(scopeKey);
        const n = this._selectedFromList(scopeKey).length;
        if (scopeKey.startsWith('search-')) {
            countEl.textContent = String(n);
            countEl.style.display = n > 0 ? 'inline' : 'none';
        } else {
            countEl.textContent = n + '/' + all.length;
            countEl.style.display = all.length > 0 ? 'inline' : 'none';
        }
        this._syncMsDropdownChrome(scopeKey);
    },

    _renderMsList(scopeKey, items, emptyHint, preserveSelected) {
        const itemsEl = this._msItemsEl(scopeKey);
        if (!itemsEl) return;
        const prev = preserveSelected instanceof Set
            ? preserveSelected
            : new Set(this._selectedFromList(scopeKey));
        itemsEl.innerHTML = this._multiSelectItemsHtml(scopeKey, items, emptyHint, false, false);
        itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            if (prev.has(cb.value)) cb.checked = true;
        });
        this._updateMsCount(scopeKey);
        this._syncMsDropdown(scopeKey);
        this._syncMsDropdownFilterUi(scopeKey);
    },

    _openTeamMemberMsDropdowns() {
        for (const key of DASH_TEAM_MEMBERS_MS_KEYS) {
            this._state.msDropdownOpen[key] = true;
            this._syncMsDropdown(key);
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
                itemsEl.innerHTML = this._multiSelectItemsHtml(key, [], 'Run search to enable', false, false);
            }
            this._updateMsCount(key);
            this._syncMsDropdown(key);
        }
    },

    _renderSearchTeamsList() {
        const itemsEl = this._msItemsEl('search-teams');
        if (!itemsEl) return;
        const prevSelected = new Set(this._selectedFromList('search-teams'));
        const items = this._getSearchableTeamCatalog().map(([id, label]) => ({ id, label }));
        itemsEl.innerHTML = this._multiSelectItemsHtml('search-teams', items, 'All teams', false, false);
        itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (prevSelected.has(cb.value)) cb.checked = true; });
        this._updateMsCount('search-teams');
        this._syncMsDropdown('search-teams');
        this._syncMsDropdownFilterUi('search-teams');
    },

    _renderSearchProjectsList() {
        const itemsEl = this._msItemsEl('search-projects');
        if (!itemsEl) return;
        const prevSelected = new Set(this._selectedFromList('search-projects'));
        const loading = this._state.bootstrapStatus === 'loading';
        const items = this._availableSearchProjects().map((p) => ({ id: p.id, label: p.name }));
        const hint = this._state.catalog ? 'All projects' : 'Bootstrapping…';
        itemsEl.innerHTML = this._multiSelectItemsHtml('search-projects', items, hint, loading, false);
        itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (prevSelected.has(cb.value)) cb.checked = true; });
        this._updateMsCount('search-projects');
        this._syncMsDropdown('search-projects');
        this._syncMsDropdownFilterUi('search-projects');
    },

    _renderSearchEnvsList() {
        const itemsEl = this._msItemsEl('search-envs');
        if (!itemsEl) return;
        const prevSelected = new Set(this._selectedFromList('search-envs'));
        const loading = this._state.bootstrapStatus === 'loading';
        const envs = (this._state.catalog && this._state.catalog.environments) || [];
        const items = envs.map((e) => ({ id: e.env_key, label: e.name || e.env_key }));
        const hint = this._state.catalog ? 'All environments' : 'Bootstrapping…';
        itemsEl.innerHTML = this._multiSelectItemsHtml('search-envs', items, hint, loading, false);
        itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (prevSelected.has(cb.value)) cb.checked = true; });
        this._updateMsCount('search-envs');
        this._syncMsDropdown('search-envs');
        this._syncMsDropdownFilterUi('search-envs');
    },

    _getFilterDraft() {
        const draft = {};
        for (const { scopeKey, draftKey } of DASH_FILTER_SCOPES) {
            draft[draftKey] = this._selectedFromList(scopeKey);
        }
        return draft;
    },

    _resetFilterLists() {
        this._state.filterListOptions = {
            teams: [], projects: [], envs: [],
            statuses: [], contributors: [], promptRatings: [], taskIssues: [], returnTypes: [],
            promptHistory: []
        };
        for (const { scopeKey } of DASH_FILTER_SCOPES) {
            const panel = this._msPanelEl(scopeKey);
            const itemsEl = this._msItemsEl(scopeKey);
            if (!panel || !itemsEl) continue;
            const hint = panel.getAttribute('data-wf-dash-empty') || 'Run a search to enable';
            itemsEl.innerHTML = `<p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">${dashEscHtml(hint)}</p>`;
            this._updateMsCount(scopeKey);
            this._syncMsDropdown(scopeKey);
        }
    },

    _renderFilterLists({ syncDraftFromApplied = false } = {}) {
        const scopeItems = this._getFilterScopeItems();
        const options = this._state.filterListOptions;
        if (!this._state.cachedItems || !options) {
            this._resetFilterLists();
            this._updateApplyFiltersUi();
            return;
        }
        const listBounds = this._listBoundsFromOptions(options);
        const prevBounds = this._state.filterListBoundsPrev || {};
        const applied = this._state.appliedFilters;
        const draft = (syncDraftFromApplied && applied)
            ? applied
            : this._getFilterDraft();
        const lib = dashLib();
        const irrelevance = scopeItems.length > 0 && this._isFilterDraftValid(draft, listBounds)
            ? lib.computeFilterIrrelevance(scopeItems, draft, listBounds, options)
            : lib.emptyFilterIrrelevance();

        for (const { scopeKey, optionsKey, draftKey } of DASH_FILTER_SCOPES) {
            const itemsEl = this._msItemsEl(scopeKey);
            const wrap = this._filterScopeWrapEl(scopeKey);
            if (!itemsEl) continue;
            const optionItems = options[optionsKey] || [];
            if (optionItems.length === 0) {
                if (wrap) wrap.style.display = 'none';
                continue;
            }
            if (wrap) wrap.style.display = '';
            const emptyHint = optionItems.length === 0 ? 'No ' + this._filterScopeLabel(scopeKey).toLowerCase() + ' in results' : 'Run a search to enable';
            const irrelevantSet = irrelevance[draftKey] || new Set();
            const optionIds = optionItems.map((it) => it.id);
            const prevSelected = syncDraftFromApplied
                ? null
                : new Set(this._selectedFromList(scopeKey));
            const checkedIds = this._checkedIdsForFilterScope(
                draftKey, optionIds, applied, prevBounds, listBounds, prevSelected, syncDraftFromApplied
            );
            itemsEl.innerHTML = this._multiSelectItemsHtml(
                scopeKey,
                optionItems,
                emptyHint,
                false,
                false,
                irrelevantSet
            );
            itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                cb.checked = checkedIds.has(cb.value);
            });
            this._updateMsCount(scopeKey);
            this._syncMsDropdown(scopeKey);
            if (scopeKey.startsWith('filter-')) this._syncMsDropdownFilterUi(scopeKey);
        }
        this._state.filterListBoundsPrev = listBounds;
        this._updateApplyFiltersUi();
        Logger.debug('dashboard: filter lists rendered');
    },

    _getCardUi(taskId) {
        if (!this._state.cardUi[taskId]) {
            this._state.cardUi[taskId] = {
                expanded: false,
                timelineNewestFirst: false,
                selectedDisplayNo: null
            };
        }
        return this._state.cardUi[taskId];
    },

    _findResultItem(itemId) {
        const items = this._state.filteredItems || [];
        return items.find((it) => it.id === itemId) || null;
    },

    _getDisputeClaimUi(disputeId) {
        const id = String(disputeId || '').trim();
        if (!id) return { status: 'idle' };
        if (!this._state.disputeClaimUi[id]) {
            this._state.disputeClaimUi[id] = { status: 'idle' };
        }
        return this._state.disputeClaimUi[id];
    },

    async _claimDispute(disputeId, itemId) {
        const id = String(disputeId || '').trim();
        if (!id || !itemId) return;
        const ui = this._getDisputeClaimUi(id);
        if (ui.status === 'claiming' || ui.status === 'claimed') return;
        ui.status = 'claiming';
        this._patchTaskCard(itemId);
        try {
            await this._fleetWebPost(this._disputeClaimApiPath(id));
            ui.status = 'claimed';
            const url = dashFleetDisputeUrl(id);
            Logger.log('dashboard: dispute ' + id + ' claimed — opening ' + url);
            if (url) {
                this._pageWindow().open(url, '_blank', 'noopener,noreferrer');
            }
        } catch (e) {
            ui.status = 'idle';
            Logger.warn('dashboard: dispute claim failed — ' + id, e);
        } finally {
            this._patchTaskCard(itemId);
        }
    },

    _patchTaskCard(itemId) {
        const wrap = this._q('#wf-dash-results');
        if (!wrap || !itemId) return;
        const item = this._findCachedItem(itemId) || this._findResultItem(itemId);
        if (!item) return;
        const cards = wrap.querySelectorAll('[data-wf-dash-task-card]');
        let existing = null;
        for (const el of cards) {
            if (el.getAttribute('data-item-id') === itemId) {
                existing = el;
                break;
            }
        }
        const html = this._resultCardHtml(item);
        const doc = this._pageWindow().document;
        const temp = doc.createElement('div');
        temp.innerHTML = html;
        const newCard = temp.firstElementChild;
        if (!newCard) return;
        if (existing) {
            existing.replaceWith(newCard);
        } else {
            wrap.appendChild(newCard);
        }
    },

    _setLeftTab(tab) {
        this._state.leftTab = tab;
        this._closeAllMsDropdowns();
        this._syncLeftTabUi();
    },

    _syncLeftTabUi() {
        const tab = this._state.leftTab;
        const searchPanel = this._q('#wf-dash-left-panel-search');
        const filtersPanel = this._q('#wf-dash-left-panel-filters');
        if (searchPanel) searchPanel.style.display = tab === 'search' ? 'flex' : 'none';
        if (filtersPanel) filtersPanel.style.display = tab === 'filters' ? 'flex' : 'none';
        const searchActions = this._q('#wf-dash-actions-search');
        const filterActions = this._q('#wf-dash-actions-filters');
        if (searchActions) searchActions.style.display = tab === 'search' ? 'flex' : 'none';
        if (filterActions) filterActions.style.display = tab === 'filters' ? 'flex' : 'none';
        this._modal.querySelectorAll('[data-wf-dash-left-tab]').forEach((btn) => {
            const active = btn.getAttribute('data-wf-dash-left-tab') === tab;
            btn.style.cssText = this._leftTabStyle(active);
        });
        this._syncLeftMessagesBar();
    },

    _isMessageElVisible(el) {
        if (!el || el.style.display === 'none') return false;
        return Boolean((el.textContent || '').trim()) || el.children.length > 0;
    },

    _syncLeftMessagesBar() {
        const bar = this._q('#wf-dash-left-messages');
        if (!bar) return;
        const tab = this._state.leftTab || 'search';
        const sessionBanner = this._q('#wf-dash-session-refresh-banner');
        const bootstrapErr = this._q('#wf-dash-bootstrap-error');
        const universal = this._q('#wf-dash-universal-hint');
        const rangeErr = this._q('#wf-dash-range-error');
        const searchErr = this._q('#wf-dash-search-error');
        const substringErr = this._q('#wf-dash-substring-error');
        const applyHint = this._q('#wf-dash-apply-hint');
        const sharedVisible = this._isMessageElVisible(sessionBanner) || this._isMessageElVisible(bootstrapErr);
        const searchVisible = sharedVisible
            || this._isMessageElVisible(universal)
            || this._isMessageElVisible(rangeErr)
            || this._isMessageElVisible(searchErr);
        const filtersVisible = sharedVisible
            || this._isMessageElVisible(substringErr)
            || this._isMessageElVisible(applyHint);
        const show = tab === 'filters' ? filtersVisible : searchVisible;
        if (show) {
            bar.style.display = 'flex';
        } else {
            bar.style.display = 'none';
        }
    },

    // ── Dirty / range validation ──

    _applyQuickDatePreset(preset) {
        const range = dashQuickDatePresetRange(preset);
        if (!range) {
            Logger.warn('dashboard: unknown quick date preset — ' + preset);
            return;
        }
        if (range.clear) {
            this._applyingQuickDate = true;
            try {
                const afterEl = this._q('#wf-dash-after');
                const beforeEl = this._q('#wf-dash-before');
                if (afterEl) afterEl.value = '';
                if (beforeEl) beforeEl.value = '';
            } finally {
                this._applyingQuickDate = false;
            }
            this._validateRangeUi();
            Logger.log('dashboard: quick date preset applied (' + range.label + ')');
            return;
        }
        this._applyingQuickDate = true;
        try {
            const afterEl = this._q('#wf-dash-after');
            const beforeEl = this._q('#wf-dash-before');
            if (afterEl) afterEl.value = dashDateInputValue(range.after);
            if (beforeEl) beforeEl.value = dashDateInputValue(range.before);
        } finally {
            this._applyingQuickDate = false;
        }
        this._validateRangeUi();
        Logger.log('dashboard: quick date preset applied (' + range.label + ')');
    },

    _clearDateRangeFields() {
        ['#wf-dash-after', '#wf-dash-before'].forEach((sel) => { const el = this._q(sel); if (el) el.value = ''; });
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = '';
        this._validateRangeUi();
        this._syncFieldClearButtons();
    },

    _syncFieldClearButtons() {
        const prompt = this._q('#wf-dash-prompt');
        const clearPrompt = this._q('#wf-dash-clear-prompt');
        if (clearPrompt) {
            clearPrompt.style.display = (prompt && prompt.value.trim()) ? '' : 'none';
        }
        const after = (this._q('#wf-dash-after') || {}).value || '';
        const before = (this._q('#wf-dash-before') || {}).value || '';
        const clearDates = this._q('#wf-dash-clear-dates');
        if (clearDates) {
            clearDates.style.display = (after || before) ? '' : 'none';
        }
    },

    _validateRangeUi() {
        const after = (this._q('#wf-dash-after') || {}).value || '';
        const before = (this._q('#wf-dash-before') || {}).value || '';
        const check = dashValidateCreatedAtRange(after, before);
        const el = this._q('#wf-dash-range-error');
        if (el) {
            if (!check.valid && (after || before)) {
                el.textContent = check.error;
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        }
        const lib = dashLib();
        const quickPreset = ((this._q('#wf-dash-quick-range') || {}).value || '');
        const isAllTime = quickPreset === 'all-time';
        const isUniversal = lib.isUniversalSearchParams({
            authorCount: this._state.draftTokens.length,
            searchTeamIds: this._selectedFromList('search-teams'),
            searchProjectIds: this._selectedFromList('search-projects'),
            searchEnvKeys: this._selectedFromList('search-envs')
        });
        const universalCheck = isAllTime
            ? { allowed: true, message: '' }
            : lib.validateUniversalSearchRange(after, before);
        const blankBlocked = isUniversal && !universalCheck.allowed;
        const hintEl = this._q('#wf-dash-universal-hint');
        if (hintEl) {
            if (isAllTime && isUniversal) {
                hintEl.textContent = 'All Time — no date bound on this search.';
                hintEl.style.display = 'block';
            } else if (blankBlocked) {
                hintEl.textContent = lib.UNIVERSAL_SEARCH_RANGE_MESSAGE;
                hintEl.style.display = 'block';
            } else {
                hintEl.style.display = 'none';
            }
        }
        const searchBtn = this._q('#wf-dash-search');
        if (searchBtn) {
            const noOutputTypes = !this._state.includeTasks && !this._state.includeQa && !this._state.includeDisputes;
            const searchDisabled = this._state.loading
                || blankBlocked
                || noOutputTypes
                || ((after || before) && !check.valid);
            searchBtn.disabled = searchDisabled;
            searchBtn.style.cssText = searchDisabled
                ? this._navBtnPrimaryDisabledStyle()
                : this._navBtnPrimaryStyle();
        }
        this._syncFieldClearButtons();
        this._syncLeftMessagesBar();
        return { check, isUniversal, blankBlocked };
    },

    _isFilterSelectionValid() {
        if (!this._state.cachedItems) return false;
        const applied = this._state.appliedFilters;
        const options = this._state.filterListOptions;
        const listBounds = options ? this._listBoundsFromOptions(options) : {};
        for (const { scopeKey, draftKey } of DASH_FILTER_SCOPES) {
            if (!this._isFilterScopeVisible(scopeKey)) continue;
            const all = this._allFromList(scopeKey);
            if (all.length === 0) continue;
            if (this._selectedFromList(scopeKey).length > 0) continue;
            const boundIds = listBounds[draftKey] || [];
            const appliedSel = (applied && applied[draftKey]) || [];
            if (this._isDimensionAllSelected(appliedSel, boundIds)) continue;
            return false;
        }
        return true;
    },

    _filterArraysEqual(a, b) {
        const left = [...(a || [])].sort();
        const right = [...(b || [])].sort();
        if (left.length !== right.length) return false;
        for (let i = 0; i < left.length; i++) {
            if (left[i] !== right[i]) return false;
        }
        return true;
    },

    _filtersDraftDiffersFromApplied() {
        const applied = this._state.appliedFilters;
        if (!applied) return this._state.cachedItems !== null;
        const draft = this._currentClientFilters();
        if ((draft.promptText || '').trim() !== (applied.promptText || '').trim()) return true;
        if (Boolean(draft.fuzzy) !== Boolean(applied.fuzzy)) return true;
        if (Boolean(draft.regex) !== Boolean(applied.regex)) return true;
        if (Boolean(draft.caseSensitive) !== Boolean(applied.caseSensitive)) return true;
        if (Boolean(draft.searchHiddenVersions) !== Boolean(applied.searchHiddenVersions)) return true;
        const keys = [
            'teamIds', 'projectIds', 'envKeys', 'statuses', 'contributorIds',
            'promptRatings', 'taskIssues', 'returnTypes', 'promptHistory'
        ];
        for (const key of keys) {
            if (!this._filterArraysEqual(draft[key], applied[key])) return true;
        }
        return false;
    },

    _updateApplyFiltersUi() {
        const promptText = (this._q('#wf-dash-prompt') || {}).value || '';
        const caseSensitive = Boolean((this._q('#wf-dash-case') || {}).checked);
        const regex = Boolean((this._q('#wf-dash-regex') || {}).checked);
        const lib = dashLib();
        const filterInvalid = lib.isPromptFilterInvalid(promptText, caseSensitive, regex);
        const el = this._q('#wf-dash-substring-error');
        if (el) {
            if (filterInvalid.invalid) {
                el.textContent = filterInvalid.message;
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        }
        const selectionValid = this._isFilterSelectionValid();
        const hasPendingChanges = this._filtersDraftDiffersFromApplied();
        const applyBtn = this._q('#wf-dash-apply-filters');
        const resetFiltersBtn = this._q('#wf-dash-reset-filters');
        const noResults = !this._state.cachedItems;
        const disabled = noResults || filterInvalid.invalid || !selectionValid || !hasPendingChanges;
        if (applyBtn) {
            applyBtn.disabled = disabled;
            applyBtn.style.cssText = disabled ? this._navBtnPrimaryDisabledStyle() : this._navBtnPrimaryStyle();
        }
        if (resetFiltersBtn) {
            resetFiltersBtn.disabled = noResults || Boolean(this._state.loading);
        }
        const applyHint = this._q('#wf-dash-apply-hint');
        if (applyHint) {
            if (disabled && this._state.cachedItems && !selectionValid) {
                applyHint.textContent = 'Select at least one option in each filter group.';
                applyHint.style.display = 'block';
            } else {
                applyHint.style.display = 'none';
            }
        }
        this._syncFieldClearButtons();
        this._syncLeftMessagesBar();
    },

    _updateSubstringErrorUi() {
        this._updateApplyFiltersUi();
    },

    // ── Search submit / clear ──

    async _submitSearch() {
        try {
            const authorFlushError = await this._flushPendingAuthorInput();
            if (authorFlushError) {
                this._setSearchError(authorFlushError);
                return;
            }

            const includeTasks = this._state.includeTasks;
            const includeQa = this._state.includeQa;
            const includeDisputes = this._state.includeDisputes;
            if (!includeTasks && !includeQa && !includeDisputes) {
                this._setSearchError('Enable at least one contributor search area: Task Creation, QA, or Disputes.');
                return;
            }
            const searchDepth = this._getSearchDepthFromUi();
            this._persistSearchDepthPref(searchDepth);
            this._state.searchDepth = searchDepth;
            const after = (this._q('#wf-dash-after') || {}).value || '';
            const before = (this._q('#wf-dash-before') || {}).value || '';
            const rangeCheck = dashValidateCreatedAtRange(after, before);
            if (!rangeCheck.valid) {
                this._setSearchError(rangeCheck.error);
                return;
            }
            const lib = dashLib();
            if (!lib) {
                this._setSearchError('Dashboard helpers not loaded. Reload the page and try again.');
                return;
            }
            if (lib.isUniversalSearchParams({
                authorCount: this._state.draftTokens.length,
                searchTeamIds: this._selectedFromList('search-teams'),
                searchProjectIds: this._selectedFromList('search-projects'),
                searchEnvKeys: this._selectedFromList('search-envs')
            })) {
                const quickPreset = ((this._q('#wf-dash-quick-range') || {}).value || '');
                const isAllTime = quickPreset === 'all-time';
                if (!isAllTime && !lib.validateUniversalSearchRange(after, before).allowed) {
                    this._setSearchError(lib.UNIVERSAL_SEARCH_RANGE_MESSAGE);
                    return;
                }
            }

            const authorIds = this._state.draftTokens.map((t) => t.id);
            const authorLabels = this._state.draftTokens.map((t) => this._personDisplayLabel(t));
            this._state.committed = {
                authorIds,
                authorCount: authorIds.length,
                authorLabels,
                includeTaskCreation: includeTasks,
                includeQa,
                includeDisputes,
                afterLocal: after,
                beforeLocal: before,
                searchDepth,
                searchKinds: [
                    includeTasks ? 'task_creation' : null,
                    includeQa ? 'qa' : null,
                    includeDisputes ? 'dispute' : null
                ].filter(Boolean)
            };
            this._state.resultsKindTab = 'all';
            this._state.resultsPage = 0;
            this._state.hasSearched = true;
            this._state.loading = true;
            this._state.cachedItems = null;
            this._state.filteredItems = null;
            this._state.appliedFilters = null;
            this._state.hydrateBulkActive = false;
            this._state.autoHydrateActive = false;
            this._state.autoHydrateScheduled = false;
            this._state.autoHydratePending = false;
            this._state.autoHydratePendingLogged = false;
            this._state.disputesBulkIncomplete = false;
            this._state.searchLoadPhase = 'Building search scope…';
            this._setSearchError('');
            this._setSearchButtonLoading(true);
            this._updateResultsKindTabsUi();
            this._syncResultsToolbarDerivedUi();
            this._updateResultsStatus();
            this._renderResults();

            this._state.searchFetchActive = true;
            try {
                const scope = await this._buildSearchApiScope();
                Logger.info('dashboard: search started — '
                    + (authorIds.length > 0 ? authorIds.length + ' author(s)' : 'all authors')
                    + ' · types: ' + [includeTasks ? 'tasks' : null, includeQa ? 'QA' : null, includeDisputes ? 'disputes' : null].filter(Boolean).join('+')
                    + (after ? ' · after ' + after : '') + (before ? ' · before ' + before : ''));
                const searchResult = await this._fetchWorkerOutputSearch({
                    authorIds,
                    includeTaskCreation: includeTasks,
                    includeQa,
                    includeDisputes,
                    afterIso: rangeCheck.afterIso,
                    beforeIso: rangeCheck.beforeIso,
                    scope,
                    searchDepth
                });
                const items = searchResult.items;
                this._state.cachedItems = items;
                if (searchDepth === 'deep' && items.length > 0) {
                    await this._hydrateAllSearchResults(items, {
                        prefetchedFeedbackRows: searchResult.allFeedbackRows,
                        skipFeedbackFetch: !searchResult.includeQa && !searchResult.includeDisputes,
                        onProgress: (done, total) => {
                            this._setSearchLoadPhase(
                                'Hydrating results (' + done + '/' + total + ')…'
                            );
                        }
                    });
                }
                this._setSearchLoadPhase('Applying filters…');
                Logger.log('dashboard: search loaded ' + items.length + ' item(s)'
                    + (searchDepth === 'deep' ? ' (deep, fully hydrated)' : ''));
                const prompt = this._q('#wf-dash-prompt');
                if (prompt) prompt.value = '';
                const hidden = this._q('#wf-dash-hidden-versions');
                if (hidden) hidden.checked = false;
                const caseEl = this._q('#wf-dash-case');
                if (caseEl) caseEl.checked = false;
                const fuzzyEl = this._q('#wf-dash-fuzzy');
                if (fuzzyEl) fuzzyEl.checked = false;
                const regexEl = this._q('#wf-dash-regex');
                if (regexEl) regexEl.checked = false;
                const sortEl = this._q('#wf-dash-sort');
                if (sortEl) sortEl.value = 'desc';
                this._resetFilterDraftsFromResults(items);
                this._applyResultsPageSizeForNewSearch();
                if (items.length > 0) {
                    this._setLeftTab('filters');
                }
            } catch (err) {
                if (this._handleDashSessionRefreshError(err)) {
                    this._setSearchError('');
                } else {
                    this._setSearchError(err.message || String(err));
                }
                this._state.cachedItems = null;
                this._state.filteredItems = null;
                this._state.appliedFilters = null;
                Logger.warn('dashboard: search failed', err);
            } finally {
                this._state.searchFetchActive = false;
                this._state.loading = false;
                this._state.searchLoadPhase = '';
                this._setSearchButtonLoading(false);
                this._updateSubstringErrorUi();
                this._updateApplyFiltersUi();
                if (this._state.cachedItems !== null) {
                    this._refreshResultsView({ filterSource: 'search-defaults' });
                } else {
                    this._updateResultsStatus();
                    this._renderResults();
                    this._updateResultsKindTabsUi();
                    this._syncResultsToolbarDerivedUi();
                }
            }
        } catch (err) {
            if (!this._handleDashSessionRefreshError(err)) {
                this._setSearchError(err.message || String(err));
            }
            Logger.error('dashboard: search submit failed', err);
        }
    },

    _clearParameters() {
        this._state.draftTokens = [];
        this._state.includeTasks = true;
        this._state.includeQa = true;
        this._state.includeDisputes = false;
        ['#wf-dash-after', '#wf-dash-before'].forEach((sel) => { const el = this._q(sel); if (el) el.value = ''; });
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = '';
        ['search-teams', 'search-projects', 'search-envs'].forEach((key) => {
            const itemsEl = this._msItemsEl(key);
            if (itemsEl) itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
            this._updateMsCount(key);
        });
        this._syncOutputToggleUi();
        this._renderSearchProjectsList();
        this._renderAuthorTokens();
        this._hideAuthorCandidates();
        this._setAuthorError('');
        this._setSearchError('');
        this._state.sessionRefreshRequired = false;
        this._syncDashSessionRefreshBanner();
        this._validateRangeUi();
        Logger.log('dashboard: search parameters reset');
    },

    _clearFilterUiFields() {
        const prompt = this._q('#wf-dash-prompt');
        if (prompt) prompt.value = '';
        const hidden = this._q('#wf-dash-hidden-versions');
        if (hidden) hidden.checked = false;
        const sortEl = this._q('#wf-dash-sort');
        if (sortEl) sortEl.value = 'desc';
        ['#wf-dash-case', '#wf-dash-fuzzy', '#wf-dash-regex'].forEach((sel) => {
            const el = this._q(sel);
            if (el) el.checked = false;
        });
        this._updateSubstringErrorUi();
        this._syncFieldClearButtons();
    },

    _resetFiltersToDefaults() {
        if (!this._state.cachedItems) {
            Logger.debug('dashboard: filter reset skipped — no results loaded');
            return;
        }
        this._clearFilterUiFields();
        const ok = this._refreshResultsView({ resetPage: true, filterSource: 'filter-reset' });
        if (ok) {
            Logger.log('dashboard: filters reset to defaults (all options selected)');
        }
    },

    _clearResults() {
        this._state.cachedItems = null;
        this._state.filteredItems = null;
        this._state.appliedFilters = null;
        this._state.hasSearched = false;
        this._state.committed = null;
        this._state.cardUi = {};
        this._state.disputeClaimUi = {};
        this._state.hydrateUi = {};
        this._state.resultsKindTab = 'all';
        this._state.resultsPage = 0;
        this._state.hydrateBulkActive = false;
        this._state.hydrateFetchActive = false;
        this._state.autoHydrateActive = false;
        this._state.autoHydrateScheduled = false;
        this._state.autoHydratePending = false;
        this._state.autoHydratePendingLogged = false;
        this._state.disputesBulkIncomplete = false;
        this._resetFilterLists();
        this._updateResultsKindTabsUi();
        this._syncBulkHydrateUi();
        const prompt = this._q('#wf-dash-prompt');
        if (prompt) prompt.value = '';
        const hidden = this._q('#wf-dash-hidden-versions');
        if (hidden) hidden.checked = false;
        const sortEl = this._q('#wf-dash-sort');
        if (sortEl) sortEl.value = 'desc';
        ['#wf-dash-case', '#wf-dash-fuzzy', '#wf-dash-regex'].forEach((sel) => { const el = this._q(sel); if (el) el.checked = false; });
        this._updateResultsStatus();
        this._updateSubstringErrorUi();
        this._renderResults();
        Logger.log('dashboard: results cleared');
    },

    _currentClientFilters() {
        const draft = this._getFilterDraft();
        return Object.assign({}, draft, {
            promptText: (this._q('#wf-dash-prompt') || {}).value || '',
            fuzzy: Boolean((this._q('#wf-dash-fuzzy') || {}).checked),
            regex: Boolean((this._q('#wf-dash-regex') || {}).checked),
            caseSensitive: Boolean((this._q('#wf-dash-case') || {}).checked),
            searchHiddenVersions: Boolean((this._q('#wf-dash-hidden-versions') || {}).checked),
            sortOrder: ((this._q('#wf-dash-sort') || {}).value || 'desc') === 'asc' ? 'asc' : 'desc'
        });
    },

    _hasActiveFilters() {
        const applied = this._state.appliedFilters;
        const bounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        if (!applied) return false;
        const lib = dashLib();
        return applied.teamIds.length < bounds.teamIds.length
            || applied.projectIds.length < bounds.projectIds.length
            || applied.envKeys.length < bounds.envKeys.length
            || (applied.statuses || []).length < bounds.statuses.length
            || (applied.contributorIds || []).length < bounds.contributorIds.length
            || (applied.promptRatings || []).length < bounds.promptRatings.length
            || (applied.taskIssues || []).length < bounds.taskIssues.length
            || (applied.returnTypes || []).length < bounds.returnTypes.length
            || (applied.promptHistory || []).length < bounds.promptHistory.length
            || (applied.regex && lib.isRegexQueryActive(applied.promptText))
            || (!applied.regex && !lib.isQueryEmpty(applied.promptText, applied.caseSensitive));
    },

    _applyFiltersAndRender() {
        this._refreshResultsView({ resetPage: true, filterSource: 'client' });
    },

    // ── Status text ──

    _setSearchError(text) {
        this._state.searchError = text || null;
        if (text) {
            this._state.sessionRefreshRequired = false;
            this._syncDashSessionRefreshBanner();
        }
        const el = this._q('#wf-dash-search-error');
        if (el) { el.textContent = text ? 'Error: ' + text : ''; el.style.display = text ? 'block' : 'none'; }
        this._syncLeftMessagesBar();
        this._updateResultsStatus();
        this._renderResults();
    },

    _searchStatusDetail(committed) {
        if (!committed) return '';
        const parts = [];
        if (committed.authorLabels && committed.authorLabels.length > 0) {
            parts.push('contributors: ' + committed.authorLabels.join(', '));
        } else {
            parts.push('all contributors');
        }
        const types = [];
        if (committed.includeTaskCreation) types.push('tasks');
        if (committed.includeQa) types.push('QA');
        if (committed.includeDisputes) types.push('disputes');
        if (types.length > 0) parts.push('types: ' + types.join('+'));
        if (committed.afterLocal) parts.push('after ' + committed.afterLocal);
        if (committed.beforeLocal) parts.push('before ' + committed.beforeLocal);
        return parts.join(' · ');
    },

    _setSearchButtonLoading(loading) {
        const btn = this._q('#wf-dash-search');
        if (!btn) return;
        btn.textContent = loading ? 'Loading…' : 'Search';
        this._validateRangeUi();
        const clearParams = this._q('#wf-dash-clear-params');
        if (clearParams) clearParams.disabled = loading;
    },

    _setSearchLoadPhase(message) {
        if (!this._state || !this._state.loading) return;
        this._state.searchLoadPhase = String(message || '').trim();
    },

    _searchFetchSourcesLabel({ includeTaskCreation, includeQa, includeDisputes }) {
        const parts = [];
        if (includeTaskCreation) parts.push('task creations');
        if (includeQa) parts.push('QA feedback');
        if (includeDisputes) parts.push('disputes');
        if (parts.length === 0) return 'Fetching data…';
        if (parts.length === 1) return 'Fetching ' + parts[0] + '…';
        if (parts.length === 2) return 'Fetching ' + parts[0] + ' and ' + parts[1] + '…';
        return 'Fetching ' + parts[0] + ', ' + parts[1] + ', and ' + parts[2] + '…';
    },

    _updateResultsStatus() {
        const el = this._q('#wf-dash-results-status');
        if (!el) return;
        const s = this._state;
        const label = this._labelStyle();

        if (s.loading) {
            const detail = this._searchStatusDetail(s.committed);
            el.innerHTML = detail
                ? `<span style="${label}">Searching — ${dashEscHtml(detail)}</span>`
                : `<span style="${label}">Searching…</span>`;
            return;
        }
        if (s.searchError && !s.cachedItems) {
            el.textContent = '';
            return;
        }
        if (!s.hasSearched) {
            el.textContent = 'Set search parameters on the left, then press Search.';
            return;
        }
        if (s.filteredItems !== null && s.cachedItems !== null && s.committed) {
            const committed = s.committed;
            const authorLabel = committed.authorLabels && committed.authorLabels.length > 0
                ? committed.authorLabels.join(', ')
                : (committed.authorCount > 0 ? committed.authorCount + ' contributor(s)' : 'all contributors');
            const scopeTotal = this._getFilterScopeItems().length;
            const tabs = this._resultsKindTabsMeta(committed);
            const activeTab = s.resultsKindTab || 'all';
            let tabNote = '';
            if (tabs.length > 1 && activeTab !== 'all') {
                const activeMeta = tabs.find((t) => t.id === activeTab);
                if (activeMeta) tabNote = ' in ' + activeMeta.label;
            }
            const countLabel = s.filteredItems.length === scopeTotal
                ? s.filteredItems.length + ' result(s)' + tabNote
                : s.filteredItems.length + ' of ' + scopeTotal + ' result(s)' + tabNote;
            const modes = [];
            if (committed.includeTaskCreation) modes.push({ kind: 'task_creation', label: 'tasks' });
            if (committed.includeQa) modes.push({ kind: 'qa', label: 'QA' });
            if (committed.includeDisputes) modes.push({ kind: 'dispute', label: 'disputes' });
            const modeHtml = modes.map((mode, index) => {
                const cfg = DASH_OUTPUT_KIND_CONFIG[mode.kind];
                const hl = cfg ? cfg.textHighlight : '';
                return (index > 0 ? ' + ' : '') + `<span style="${hl}">${dashEscHtml(mode.label)}</span>`;
            }).join('');
            const filterNote = this._hasActiveFilters() ? ' · filters active' : '';
            const depthNote = committed.searchDepth === 'deep' ? ' · deep search' : ' · quick search';
            const disputesNote = s.disputesBulkIncomplete
                ? ' · disputes list may be incomplete (narrow date range)'
                : '';
            el.innerHTML = `<span style="${label}">${dashEscHtml(countLabel)} — ${dashEscHtml(authorLabel)} · ${modeHtml}${dashEscHtml(filterNote)}${dashEscHtml(depthNote)}${dashEscHtml(disputesNote)}</span>`;
            return;
        }
        el.textContent = '';
    },

    // ── Results rendering ──

    _renderResults() {
        const wrap = this._q('#wf-dash-results');
        if (!wrap) return;
        const s = this._state;
        const muted = 'font-size: 12px; color: var(--muted-foreground, #64748b);';

        if (s.loading) {
            if (wrap.querySelector('[data-wf-dash-results-loading]')) return;
            wrap.innerHTML = `<div data-wf-dash-results-loading="1" style="display: flex; align-items: center; justify-content: center; padding: 48px 16px; min-height: 120px;">
                ${this._loadingSpinnerHtml(20)}
            </div>`;
            return;
        }
        if (s.searchError && !s.cachedItems) {
            wrap.innerHTML = '';
            return;
        }
        if (!s.hasSearched) {
            wrap.innerHTML = `<p style="${muted}">Results will appear here after you run a search.</p>`;
            return;
        }
        if (s.filteredItems === null) {
            wrap.innerHTML = '';
            return;
        }
        const viewItems = this._getViewItems();
        if (!viewItems || viewItems.length === 0) {
            const scopeTotal = this._getFilterScopeItems().length;
            const msg = (s.cachedItems && s.cachedItems.length === 0)
                ? 'No results matched this search.'
                : scopeTotal === 0
                    ? 'No results in this tab.'
                    : 'No results match the current filters.';
            wrap.innerHTML = `<p style="font-size: 12px; color: var(--muted-foreground, #64748b);">${msg}</p>`;
            this._syncResultsToolbarDerivedUi();
            return;
        }
        const pageItems = this._getPaginatedViewItems();
        wrap.innerHTML = pageItems.map((item) => this._resultCardHtml(item)).join('');
        this._syncResultsToolbarDerivedUi();
        this._scheduleAutoHydrateVisiblePage();
    },

    _copyChipHtml(text) {
        const value = String(text == null ? '' : text).trim();
        if (!value) {
            return `<span style="display: inline-block; padding: 3px 8px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; font-size: 11px; color: var(--muted-foreground, #64748b); opacity: 0.6;">—</span>`;
        }
        return `<button type="button" data-wf-dash-copy="${dashEscHtml(value)}" title="Click to copy" style="display: inline-block; max-width: 100%; padding: 3px 8px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; font-size: 11px; color: var(--foreground, #0f172a); background: transparent; text-align: left; overflow-wrap: anywhere; cursor: pointer;">${dashEscHtml(value)}</button>`;
    },

    _copyIconHtml(text) {
        const value = String(text == null ? '' : text);
        return `<button type="button" data-wf-dash-copy="${dashEscHtml(value)}" title="Copy" aria-label="Copy" style="display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border-radius: 6px; border: none; background: transparent; color: var(--muted-foreground, #64748b); cursor: pointer;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>`;
    },

    _extLinkIconSvg(active) {
        const stroke = active ? 'currentColor' : 'var(--muted-foreground, #94a3b8)';
        const opacity = active ? '1' : '0.45';
        return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: ${opacity}; flex-shrink: 0;"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>`;
    },

    _extLinkHtml(href, title) {
        const url = String(href || '').trim();
        if (!url) return '';
        return `<a href="${dashEscHtml(url)}" target="_blank" rel="noopener noreferrer" title="${dashEscHtml(title)}" aria-label="${dashEscHtml(title)}" style="display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border-radius: 6px; color: var(--muted-foreground, #64748b); text-decoration: none;">
            ${this._extLinkIconSvg(true)}
        </a>`;
    },

    _extLinkButtonStyle() {
        return 'display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; color: var(--muted-foreground, #64748b); border: none; background: transparent; padding: 0; cursor: pointer;';
    },

    _taskOpenLinkHtml(task, itemId) {
        const taskId = String(task && task.id || '').trim();
        if (!taskId) return '';
        const teamId = String(task.teamId || '').trim();
        const ui = this._getTaskOpenUi(taskId);
        const title = 'Open task in Fleet';
        if (ui.status === 'switching') {
            const teamLabel = this._teamName(teamId) || 'team';
            return `<button type="button" disabled aria-busy="true" title="${dashEscHtml(title)}" style="${this._extLinkButtonStyle()} gap: 6px; width: auto; max-width: 100%; padding: 2px 8px; cursor: wait; opacity: 0.9;">`
                + `${this._loadingSpinnerHtml(14)}`
                + `<span style="font-size: 11px; font-weight: 500; white-space: nowrap;">Switching to ${dashEscHtml(teamLabel)}</span>`
                + `</button>`;
        }
        return `<button type="button" data-wf-dash-open-task="1" data-task-id="${dashEscHtml(taskId)}" data-team-id="${dashEscHtml(teamId)}" data-item-id="${dashEscHtml(itemId)}" title="${dashEscHtml(title)}" aria-label="${dashEscHtml(title)}" style="${this._extLinkButtonStyle()} width: 26px; height: 26px; flex-shrink: 0;">`
            + `${this._extLinkIconSvg(true)}`
            + `</button>`;
    },

    _labelSpan(text) {
        return `<span style="${this._labelStyle()}">${dashEscHtml(text)}</span>`;
    },

    /** "Prompt Version" copies task id; version suffix is display-only. */
    _promptVersionLabelHtml(taskId, versionNo, totalVersions) {
        const id = String(taskId || '').trim();
        const suffix = ` ${versionNo} of ${totalVersions}`;
        const labelStyle = this._labelStyle();
        const suffixSpan = `<span style="${labelStyle}">${dashEscHtml(suffix)}</span>`;
        if (!id) {
            return `<span style="display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 4px;">${this._labelSpan('Prompt Version')}${suffixSpan}</span>`;
        }
        const title = 'Copy task ID: ' + id;
        const btnStyle = labelStyle + ' border: none; background: transparent; padding: 0; cursor: pointer; text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--muted-foreground, #64748b) 45%, transparent); text-underline-offset: 2px;';
        return `<span style="display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 4px;">
            <button type="button" data-wf-dash-copy="${dashEscHtml(id)}" title="${dashEscHtml(title)}" aria-label="${dashEscHtml(title)}" style="${btnStyle}">Prompt Version</button>${suffixSpan}
        </span>`;
    },

    /** Label + value group: tight label→data gap; use in rows with larger gap between groups. */
    _fieldGroupHtml(label, valueHtml) {
        return `<div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; max-width: 100%; min-width: 0;">${this._labelSpan(label)}<span style="min-width: 0; max-width: 100%; display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap;">${valueHtml}</span></div>`;
    },

    _plainTimestampHtml(iso) {
        const formatted = dashFormatCreatedAt(iso);
        const ago = dashRelativeAgo(iso);
        const agoHtml = ago
            ? `<span style="font-size: 11px; color: var(--muted-foreground, #64748b);">(${dashEscHtml(ago)})</span>`
            : '';
        const formattedSpan = `<span style="color: var(--foreground, #0f172a);">${dashEscHtml(formatted)}</span>`;
        return ago ? `${formattedSpan} ${agoHtml}` : formattedSpan;
    },

    _dashHighlightSegmentsHtml(text, query, caseSensitive, fuzzy, regex) {
        const segments = dashLib().buildHighlightSegments(text, query, {
            caseSensitive,
            fuzzy: Boolean(fuzzy),
            regex: Boolean(regex)
        });
        return segments.map((seg) => (
            seg.match
                ? `<mark style="background: color-mix(in srgb, #facc15 45%, transparent); color: inherit; padding: 0 1px; border-radius: 2px;">${dashEscHtml(seg.text)}</mark>`
                : dashEscHtml(seg.text)
        )).join('');
    },

    _dashSplitMarkdownLinkParts(text) {
        const source = String(text ?? '');
        const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
        const parts = [];
        let lastIndex = 0;
        let match;
        while ((match = re.exec(source)) !== null) {
            if (match.index > lastIndex) {
                parts.push({ type: 'text', value: source.slice(lastIndex, match.index) });
            }
            parts.push({ type: 'link', label: match[1], url: match[2] });
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < source.length) {
            parts.push({ type: 'text', value: source.slice(lastIndex) });
        }
        if (parts.length === 0) {
            parts.push({ type: 'text', value: source });
        }
        return parts;
    },

    _dashHighlightedHtml(text, query, caseSensitive, fuzzy, regex) {
        const linkStyle = 'color: var(--brand, var(--primary, #2563eb)); text-decoration: underline;';
        return this._dashSplitMarkdownLinkParts(text).map((part) => {
            if (part.type === 'link') {
                const labelHtml = this._dashHighlightSegmentsHtml(part.label, query, caseSensitive, fuzzy, regex);
                return `<a href="${dashEscHtml(part.url)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">${labelHtml}</a>`;
            }
            return this._dashHighlightSegmentsHtml(part.value, query, caseSensitive, fuzzy, regex);
        }).join('');
    },

    _dataValueHtml(text) {
        const display = String(text == null ? '' : text).trim() || '—';
        return `<span style="color: var(--foreground, #0f172a);">${dashEscHtml(display)}</span>`;
    },

    _dismissedBadgeHtml() {
        return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #7c3aed; background: color-mix(in srgb, #7c3aed 12%, transparent); letter-spacing: 0.04em;">DISMISSED FROM FLEET</span>`;
    },

    _personChipsHtml(name, email, id, linkTitle) {
        if (!name && !email) return this._dismissedBadgeHtml();
        const nameChip = name ? this._copyChipHtml(name) : '';
        const emailChip = email ? this._copyChipHtml(email) : '';
        const link = this._extLinkHtml(dashFleetExpertUrl(id), linkTitle);
        return `<span style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; max-width: 100%; min-width: 0;">${nameChip}${emailChip}${link}</span>`;
    },

    _statusBadgeHtml(status) {
        const key = (status || 'unknown').toLowerCase();
        let color = 'var(--muted-foreground, #64748b)';
        let bg = 'color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent)';
        let label = status || '—';
        if (key.includes('production')) { color = '#15803d'; bg = 'color-mix(in srgb, #16a34a 14%, transparent)'; }
        else if (key === 'bugged') { color = DASH_FLAGGED_COLOR; bg = DASH_FLAGGED_BG; label = 'Bugged'; }
        else if (key.includes('review')) { color = '#b45309'; bg = 'color-mix(in srgb, #d97706 14%, transparent)'; }
        return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: ${color}; background: ${bg};">${dashEscHtml(label)}</span>`;
    },

    _qaAlertBadgeStyle() {
        return 'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #fff7ed; background: #9a3412; border: 1px solid #7c2d12;';
    },

    _qaFlaggedChipStyle(fontWeight) {
        const weight = fontWeight || '700';
        return `display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: ${weight}; color: ${DASH_FLAGGED_COLOR}; background: ${DASH_FLAGGED_BG};`;
    },

    _qaFlaggedBadgeStyle() {
        return this._qaFlaggedChipStyle('700');
    },

    _qaFlaggedIssueBadgeStyle() {
        return this._qaFlaggedChipStyle('600');
    },

    _disputeBlockStyle() {
        return {
            border: '1px solid #7c3aed',
            background: 'color-mix(in srgb, #7c3aed 24%, var(--card, #ffffff))'
        };
    },

    _disputeCategoryBadgeHtml(category) {
        const label = String(category || '').trim();
        if (!label) return '';
        return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; color: #3b0764; background: color-mix(in srgb, #ffffff 78%, #ede9fe); border: 1px solid #6d28d9;">${dashEscHtml(label)}</span>`;
    },

    _qaYellowBlockStyle() {
        return {
            border: '1px solid #9a3412',
            background: 'color-mix(in srgb, #c2410c 32%, var(--card, #ffffff))'
        };
    },

    _qaFlaggedBlockStyle() {
        return {
            border: `1px solid ${DASH_FLAGGED_BORDER}`,
            background: `color-mix(in srgb, ${DASH_FLAGGED_BORDER} 18%, var(--card, #ffffff))`
        };
    },

    _qaBlockHtml(qa, highlightQuery, caseSensitive, highlightFuzzy, highlightRegex) {
        const positive = qa.isPositive;
        const isVerifierFailure = Boolean(qa.isVerifierFailure);
        const isSystem = Boolean(qa.isSystemFeedback);
        const isFlagged = Boolean(qa.isFlaggedAsBugged);
        const isEscalatedBlock = isSystem || isVerifierFailure || qa.isEscalated;
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        let border;
        let bg;
        if (isFlagged) {
            const flagged = this._qaFlaggedBlockStyle();
            border = flagged.border;
            bg = flagged.background;
        } else if (isEscalatedBlock) {
            const yellow = this._qaYellowBlockStyle();
            border = yellow.border;
            bg = yellow.background;
        } else {
            border = positive ? 'color-mix(in srgb, #16a34a 35%, transparent)' : 'color-mix(in srgb, #dc2626 40%, transparent)';
            bg = positive ? 'color-mix(in srgb, #16a34a 8%, transparent)' : 'color-mix(in srgb, #dc2626 8%, transparent)';
        }
        const alertBadge = this._qaAlertBadgeStyle();
        const flaggedBadge = this._qaFlaggedBadgeStyle();
        const statusLabel = isVerifierFailure
            ? `<span style="${alertBadge}">Verifier Generation Error</span>`
            : (isSystem
            ? ''
            : (positive
                ? `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #15803d; background: color-mix(in srgb, #16a34a 14%, transparent);">Accepted</span>`
                : (qa.isEscalated
                    ? `<span style="${alertBadge}">Escalated for Fleet Review</span>`
                    : (isFlagged
                        ? `<span style="${flaggedBadge}">Flagged as Bugged</span>`
                        : `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #b91c1c; background: color-mix(in srgb, #dc2626 14%, transparent);">Returned for Revision</span>`))));
        const issueBadgeStyle = isFlagged
            ? this._qaFlaggedIssueBadgeStyle()
            : (isEscalatedBlock
                ? this._qaAlertBadgeStyle().replace('font-weight: 700', 'font-weight: 600')
                : 'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: #b45309; background: color-mix(in srgb, #d97706 14%, transparent);');
        const rejectionBadges = qa.rejectionBadges || [];
        const badges = rejectionBadges.length > 0
            ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Issues')}${rejectionBadges.map((l) => `<span style="${issueBadgeStyle}">${dashEscHtml(l)}</span>`).join('')}</div>`
            : '';
        const blocks = (qa.textBlocks || []).map((b) => {
            const blockLabel = (isSystem || isVerifierFailure) ? b.label : dashQaTextBlockLabel(b.label, positive);
            const body = b.text
                ? this._dashHighlightedHtml(b.text, hq, cs, fz, rx)
                : '—';
            return `
            <div>
                <div style="display: flex; align-items: center; gap: 6px;">${this._labelSpan(blockLabel)}${this._copyIconHtml(b.text)}</div>
                <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${body}</p>
            </div>`;
        }).join('');
        const submittedHtml = qa.feedbackAt
            ? this._fieldGroupHtml('Submitted', this._plainTimestampHtml(qa.feedbackAt))
            : '';
        const promptRatingHtml = (!isSystem && qa.qualityRating)
            ? `<div style="display: inline-flex; align-items: center; gap: 6px;">${this._labelSpan('Prompt Rating')}<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: var(--muted-foreground, #64748b); background: color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent);">${dashEscHtml(qa.qualityRating)}</span></div>`
            : '';
        const blockTitle = isSystem ? 'System Feedback' : 'QA Feedback';
        const reviewerHtml = (!isSystem && qa.qaReviewerId)
            ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">${this._personChipsHtml(qa.qaReviewerName, qa.qaReviewerEmail, qa.qaReviewerId, 'Open reviewer in Fleet')}</div>`
            : '';
        return `
            <div style="margin-top: 12px; padding: 10px 12px; border: 1px solid ${border}; border-radius: 8px; background: ${bg}; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 16px; min-width: 0;">
                        <span style="font-weight: 600; color: var(--foreground, #0f172a);">${dashEscHtml(blockTitle)}</span>
                        ${submittedHtml}
                        ${promptRatingHtml}
                    </div>
                    ${statusLabel ? `<div style="flex-shrink: 0; margin-left: auto;">${statusLabel}</div>` : ''}
                </div>
                ${reviewerHtml}
                ${badges ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 16px;">${badges}</div>` : ''}
                ${blocks}
            </div>`;
    },

    _reviewerBadgeHtml(entry, active, taskId, itemId) {
        const isVerifierFailure = Boolean(entry.isVerifierFailure || (entry.display && entry.display.isVerifierFailure));
        const isSystem = Boolean(entry.isSystemFeedback || (entry.display && entry.display.isSystemFeedback))
            || isVerifierFailure;
        const name = isSystem ? 'System' : (entry.reviewer.name || entry.reviewer.email || 'Reviewer');
        let label = 'Returned';
        let cls = 'color: #b91c1c; background: color-mix(in srgb, #dc2626 14%, transparent);';
        if (isSystem) {
            label = 'System';
            cls = this._qaAlertBadgeStyle() + ' padding: 2px 8px; font-size: 10px;';
        } else if (entry.isPositive) {
            label = 'Accepted';
            cls = 'color: #15803d; background: color-mix(in srgb, #16a34a 14%, transparent);';
        } else if (entry.isEscalated) {
            label = 'Escalated';
            cls = this._qaAlertBadgeStyle() + ' padding: 1px 6px; font-size: 10px;';
        } else if (entry.isFlaggedAsBugged) {
            label = 'Flagged';
            cls = this._qaFlaggedBadgeStyle() + ' padding: 1px 6px; font-size: 10px;';
        }
        const border = active ? 'border: 1px solid color-mix(in srgb, var(--foreground, #0f172a) 25%, transparent); background: var(--accent, #f1f5f9);' : 'border: 1px solid var(--border, #e2e8f0); background: transparent;';
        if (isSystem) {
            return `<button type="button" data-wf-dash-reviewer-badge="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(taskId)}" data-display-no="${entry.linkedDisplayVersionNo}" title="Show version ${entry.linkedDisplayVersionNo}" style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; cursor: pointer; ${border}">
                <span style="${cls}">System</span>
            </button>`;
        }
        return `<button type="button" data-wf-dash-reviewer-badge="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(taskId)}" data-display-no="${entry.linkedDisplayVersionNo}" title="Show version ${entry.linkedDisplayVersionNo}" style="display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 6px; font-size: 10px; cursor: pointer; ${border}">
            <span style="font-weight: 600; color: var(--foreground, #0f172a);">${dashEscHtml(name)}</span>
            <span style="display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 10px; ${cls}">${dashEscHtml(label)}</span>
        </button>`;
    },

    _disputeClaimControlHtml(display, itemId) {
        if (display.resolutionAt) return '';
        const disputeId = String(display.id || '').trim();
        if (!disputeId) return '';
        const ui = this._getDisputeClaimUi(disputeId);
        const url = dashFleetDisputeUrl(disputeId);
        const baseStyle = this._btnStyle()
            + ' padding: 4px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;';
        if (ui.status === 'claimed' && url) {
            return `<a href="${dashEscHtml(url)}" target="_blank" rel="noopener noreferrer" title="Open dispute in Fleet" aria-label="Open dispute in Fleet" style="${baseStyle} text-decoration: none;">`
                + `<span>Claim and Resolve</span>${this._extLinkIconSvg(true)}</a>`;
        }
        if (ui.status === 'claiming') {
            return `<button type="button" disabled aria-busy="true" style="${baseStyle} opacity: 0.85; cursor: wait;">`
                + `${this._loadingSpinnerHtml(14)}`
                + `<span>Leasing dispute...</span>`
                + `</button>`;
        }
        return `<button type="button" data-wf-dash-dispute-claim="1" data-dispute-id="${dashEscHtml(disputeId)}" data-item-id="${dashEscHtml(itemId)}" title="Claim this dispute" style="${baseStyle}">`
            + `<span>Claim and Resolve</span>${this._extLinkIconSvg(false)}</button>`;
    },

    _disputeBlockHtml(display, highlightQuery, caseSensitive, highlightFuzzy, itemId, highlightRegex) {
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        const purple = this._disputeBlockStyle();
        const border = purple.border;
        const bg = purple.background;
        const reasonBody = display.reason
            ? this._dashHighlightedHtml(display.reason, hq, cs, fz, rx)
            : '—';
        const submittedHtml = display.submittedAt
            ? this._fieldGroupHtml('Submitted', this._plainTimestampHtml(display.submittedAt))
            : '';
        const categoryHtml = display.category ? this._disputeCategoryBadgeHtml(display.category) : '';
        let resolutionHtml = '';
        if (display.resolutionAt) {
            let resBorder;
            let resBg;
            let statusLabel;
            if (display.isApproved) {
                resBorder = 'color-mix(in srgb, #16a34a 35%, transparent)';
                resBg = 'color-mix(in srgb, #16a34a 8%, transparent)';
                statusLabel = '<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #15803d; background: color-mix(in srgb, #16a34a 14%, transparent);">Approved</span>';
            } else if (display.isRejected) {
                resBorder = 'color-mix(in srgb, #dc2626 40%, transparent)';
                resBg = 'color-mix(in srgb, #dc2626 8%, transparent)';
                statusLabel = '<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #b91c1c; background: color-mix(in srgb, #dc2626 14%, transparent);">Rejected</span>';
            } else {
                resBorder = 'color-mix(in srgb, var(--muted-foreground, #64748b) 35%, transparent)';
                resBg = 'color-mix(in srgb, var(--muted-foreground, #64748b) 8%, transparent)';
                statusLabel = `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: var(--muted-foreground, #64748b); background: color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent);">${dashEscHtml(display.status || 'Resolved')}</span>`;
            }
            const resolutionBody = display.resolutionText
                ? this._dashHighlightedHtml(display.resolutionText, hq, cs, fz, rx)
                : '—';
            const resolvedHtml = this._fieldGroupHtml('Resolved', this._plainTimestampHtml(display.resolutionAt));
            const resolverHtml = display.resolverId
                ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">${this._personChipsHtml(display.resolverName, display.resolverEmail, display.resolverId, 'Open resolver in Fleet')}</div>`
                : '';
            resolutionHtml = `
                <div style="margin-top: 8px; border-radius: 6px; background: var(--card, #ffffff);">
                    <div style="padding: 8px 10px; border: 1px solid ${resBorder}; border-radius: 6px; background: ${resBg}; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
                            <span style="font-weight: 600; color: var(--foreground, #0f172a);">Resolution</span>
                            ${resolvedHtml}
                            ${statusLabel}
                        </div>
                        ${resolverHtml}
                        <div>
                            <div style="display: flex; align-items: center; gap: 6px;">${this._labelSpan('Reason')}${this._copyIconHtml(display.resolutionText)}</div>
                            <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${resolutionBody}</p>
                        </div>
                    </div>
                </div>`;
        }
        const claimControlHtml = this._disputeClaimControlHtml(display, itemId);
        return `
            <div style="margin-top: 8px; padding: 10px 12px; border: ${border}; border-radius: 8px; background: ${bg}; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                        <span style="font-weight: 600; color: var(--foreground, #0f172a);">Dispute</span>
                        ${submittedHtml}
                        ${categoryHtml}
                    </div>
                    ${claimControlHtml}
                </div>
                <div>
                    <div style="display: flex; align-items: center; gap: 6px;">${this._labelSpan('Reason')}${this._copyIconHtml(display.reason)}</div>
                    <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${reasonBody}</p>
                </div>
                ${resolutionHtml}
            </div>`;
    },

    _orphanDisputesByDisplayNo(disputes, allFeedback, promptVersions) {
        const lib = dashLib();
        const feedbackIds = new Set(allFeedback.map((f) => String(f.id)));
        const orphans = (disputes || []).filter((d) => !d.feedbackId || !feedbackIds.has(d.feedbackId));
        const byDisplayNo = new Map();
        if (orphans.length === 0) return byDisplayNo;
        const rawLike = (promptVersions || []).map((v) => ({
            id: v.id,
            version_no: v.versionNo,
            created_at: v.createdAt,
            prompt: v.prompt,
            env_key: v.envKey
        }));
        const firstNegative = allFeedback.find((f) => !f.isPositive && !f.isSystemFeedback && !f.isVerifierFailure);
        const fallbackNo = firstNegative
            ? firstNegative.linkedDisplayVersionNo
            : (promptVersions.length ? promptVersions[promptVersions.length - 1].displayVersionNo : 1);
        for (const dispute of orphans) {
            let displayNo = fallbackNo;
            if (dispute.originalFeedbackCreatedAt && rawLike.length) {
                const versionInfo = lib.resolveVersionAtFeedback(rawLike, dispute.originalFeedbackCreatedAt);
                if (versionInfo && versionInfo.displayVersionNo) displayNo = versionInfo.displayVersionNo;
            }
            const list = byDisplayNo.get(displayNo) || [];
            list.push(dispute);
            byDisplayNo.set(displayNo, list);
        }
        return byDisplayNo;
    },

    _versionSectionHtml(taskId, version, totalVersions, feedbackEntries, highlightQuery, caseSensitive, highlightFuzzy, showVersionLabel, fallbackFeedback, orphanDisputes, itemId, highlightRegex) {
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        const promptBody = version.prompt
            ? this._dashHighlightedHtml(version.prompt, hq, cs, fz, rx)
            : '—';
        const promptLabel = showVersionLabel
            ? this._promptVersionLabelHtml(taskId, version.displayVersionNo, totalVersions)
            : this._labelSpan('Prompt');
        const feedbackHtml = feedbackEntries.map((entry) => {
            const qaHtml = this._qaBlockHtml(entry.display, hq, cs, fz, rx);
            const linkedDisputes = (entry.disputes || []).map((d) => this._disputeBlockHtml(d, hq, cs, fz, itemId, rx)).join('');
            return qaHtml + linkedDisputes;
        }).join('');
        const fallbackHtml = fallbackFeedback ? this._qaBlockHtml(fallbackFeedback, hq, cs, fz, rx) : '';
        const orphanHtml = (orphanDisputes || []).map((d) => this._disputeBlockHtml(d, hq, cs, fz, itemId, rx)).join('');
        return `
            <div>
                <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;">
                    <div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 3px; min-width: 0;">
                        ${promptLabel}${this._copyIconHtml(version.prompt)}
                    </div>
                </div>
                <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${promptBody}</p>
                ${feedbackHtml}${fallbackHtml}${orphanHtml}
            </div>`;
    },

    _resultCardHtml(item) {
        if (!item) return '';
        if (item.hydrated === false) return this._quickResultCardHtml(item);
        return this._taskCardHtml(item);
    },

    _quickResultCardHtml(item) {
        const task = item.task;
        const itemId = item.id;
        const hq = item.highlightQuery || '';
        const cs = Boolean(item.highlightCaseSensitive);
        const fz = Boolean(item.highlightFuzzy);
        const rx = Boolean(item.highlightRegex);
        const projectLink = task.projectId ? this._extLinkHtml(dashFleetProjectUrl(task.projectId), 'Open project in Fleet') : '';
        const promptText = task.prompt || '';
        const promptBody = promptText
            ? this._dashHighlightedHtml(promptText, hq, cs, fz, rx)
            : '—';
        let bodyHtml = `
            <div>
                <div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 3px; min-width: 0;">
                    ${this._labelSpan('Prompt')}${this._copyIconHtml(promptText)}
                </div>
                <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${promptBody}</p>
            </div>`;
        if (item.qaFeedback) {
            bodyHtml = this._qaBlockHtml(item.qaFeedback, hq, cs, fz, rx);
        }
        const disputes = item.disputes || [];
        if (disputes.length > 0) {
            bodyHtml += disputes.map((d) => this._disputeBlockHtml(d, hq, cs, fz, itemId, rx)).join('');
        }
        const cardHtml = `
            <article style="position: relative; border: 2px solid color-mix(in srgb, var(--foreground, #0f172a) 28%, var(--border, #cbd5e1)); border-radius: 10px; background: var(--card, #ffffff); overflow: hidden;">
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 10px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">
                    ${this._statusBadgeHtml(task.status)}
                    <div style="flex: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 16px; min-width: 0;">
                        ${this._fieldGroupHtml('Team', this._dataValueHtml(task.team))}
                        ${this._fieldGroupHtml('Project', this._dataValueHtml(task.project) + projectLink)}
                        ${this._fieldGroupHtml('Environment', this._dataValueHtml(task.environment))}
                    </div>
                    <div style="display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;">
                        ${this._fieldGroupHtml('Key', this._copyChipHtml(task.key))}
                        ${this._taskOpenLinkHtml(task, itemId)}
                    </div>
                </div>
                <div style="display: flex; flex-wrap: wrap; align-items: start; gap: 8px 24px; padding: 8px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">
                    ${this._fieldGroupHtml('Author', this._personChipsHtml(task.author.name, task.author.email, task.author.id, 'Open author in Fleet'))}
                </div>
                <div style="padding: 12px 14px; font-size: 12px;">${bodyHtml}</div>
            </article>`;
        return this._resultCardOuterWrap(item, cardHtml);
    },

    _resultCardOuterWrap(item, cardHtml) {
        const itemId = item.id;
        const kinds = (item.kinds && item.kinds.length) ? item.kinds : [item.kind];
        const kindSet = new Set(kinds);
        const kindTabsHtml = DASH_KIND_MERGE_ORDER.map((kind) => this._cardKindTabSlotHtml(kind, kindSet.has(kind))).join('');
        const showHydrateTab = item.hydrated === false
            && this._state.committed
            && this._state.committed.searchDepth === 'quick';
        let hydrateTabHtml = '';
        if (showHydrateTab) {
            const ui = this._getHydrateUi(itemId);
            const loading = ui.status === 'loading';
            const tabInner = loading
                ? `<span style="display: inline-flex; align-items: center; gap: 5px; pointer-events: none;">${this._loadingSpinnerHtml(12)}<span>Hydrating…</span></span>`
                : 'Hydrate';
            hydrateTabHtml = `<button type="button" data-wf-dash-hydrate="1" data-item-id="${dashEscHtml(itemId)}" style="flex-shrink: 0; min-width: 5.5rem; height: 24px; padding: 0 8px; font-size: 10px; font-weight: 600; border: none; border-radius: 6px 6px 0 0; background: ${DASH_HYDRATE_TAB_BG}; color: #fff; cursor: ${loading ? 'wait' : 'pointer'};" title="${loading ? 'Hydrating…' : 'Hydrate'}">${tabInner}</button>`;
        }
        const tabsRow = `<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; padding: 0 16px; margin-bottom: 0;">
                <div style="display: flex; align-items: flex-end; gap: ${DASH_CARD_KIND_TAB_GAP}; min-width: 0;">${kindTabsHtml}</div>
                ${hydrateTabHtml}
            </div>`;
        return `
            <div data-wf-dash-task-card="1" data-item-id="${dashEscHtml(itemId)}" style="display: flex; flex-direction: column;">
                ${tabsRow}
                ${cardHtml}
            </div>`;
    },

    _taskCardHtml(item) {
        const task = item.task;
        const itemId = item.id;
        const allFeedback = task.allFeedback || [];
        const highlightQuery = item.highlightQuery || '';
        const caseSensitive = Boolean(item.highlightCaseSensitive);
        const highlightFuzzy = Boolean(item.highlightFuzzy);
        const highlightRegex = Boolean(item.highlightRegex);
        const extraVisibleVersionNos = item.extraVisibleVersionNos || [];

        let versions = task.promptVersions && task.promptVersions.length
            ? task.promptVersions
            : [{ id: '', displayVersionNo: 1, prompt: task.prompt, envKey: task.envKey, createdAt: task.createdAt }];
        const totalVersions = versions.length;
        const hasTimeline = totalVersions > 1;

        let defaultDisplayNo = versions[versions.length - 1].displayVersionNo;
        if (item.selectedFeedbackId) {
            const entry = allFeedback.find((f) => f.id === item.selectedFeedbackId);
            if (entry) defaultDisplayNo = entry.linkedDisplayVersionNo;
        }

        const ui = this._getCardUi(task.id);
        const selectedDisplayNo = ui.selectedDisplayNo != null ? ui.selectedDisplayNo : defaultDisplayNo;
        const expanded = ui.expanded;

        const versionByDisplayNo = new Map(versions.map((v) => [v.displayVersionNo, v]));
        const feedbackByDisplayNo = new Map();
        const disputes = item.disputes || [];
        const attachedDisputeIds = new Set();
        for (const entry of allFeedback) {
            const linked = disputes.filter((d) => d.feedbackId && d.feedbackId === String(entry.id));
            for (const d of linked) attachedDisputeIds.add(d.id);
            const list = feedbackByDisplayNo.get(entry.linkedDisplayVersionNo) || [];
            list.push(Object.assign({}, entry, { disputes: linked }));
            feedbackByDisplayNo.set(entry.linkedDisplayVersionNo, list);
        }
        const orphanDisputesByDisplayNo = this._orphanDisputesByDisplayNo(
            disputes.filter((d) => !attachedDisputeIds.has(d.id)),
            allFeedback,
            task.promptVersions || versions
        );

        let renderedVersions;
        if (expanded) {
            renderedVersions = [...versions].sort((a, b) => (
                ui.timelineNewestFirst
                    ? b.displayVersionNo - a.displayVersionNo
                    : a.displayVersionNo - b.displayVersionNo
            ));
        } else {
            const extras = [...new Set(extraVisibleVersionNos)]
                .filter((n) => n !== selectedDisplayNo)
                .sort((a, b) => b - a);
            const nos = [selectedDisplayNo, ...extras];
            renderedVersions = nos.map((n) => versionByDisplayNo.get(n)).filter(Boolean);
        }

        const selectedVersion = versionByDisplayNo.get(selectedDisplayNo) || versions[versions.length - 1];
        const projectLink = task.projectId ? this._extLinkHtml(dashFleetProjectUrl(task.projectId), 'Open project in Fleet') : '';

        const reviewerBadges = allFeedback.length > 0
            ? `<div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Reviewers')}${[...allFeedback].reverse().map((entry) => this._reviewerBadgeHtml(entry, !expanded && entry.linkedDisplayVersionNo === selectedDisplayNo, task.id, itemId)).join('')}</div>`
            : '';

        let row3Left;
        if (expanded) {
            row3Left = `<div style="display: inline-flex; align-items: center; gap: 8px;">${this._labelSpan('Timeline')}<button type="button" data-wf-dash-timeline-order="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(task.id)}" style="${this._btnStyle()} padding: 2px 8px; font-size: 11px;">${ui.timelineNewestFirst ? 'Newest first' : 'Oldest first'}</button></div>`;
        } else {
            row3Left = this._fieldGroupHtml('Submitted', this._plainTimestampHtml(selectedVersion && selectedVersion.createdAt));
        }

        let versionControls = '';
        if (hasTimeline) {
            const versionOptions = [...versions]
                .sort((a, b) => b.displayVersionNo - a.displayVersionNo)
                .map((v) => `<option value="${v.displayVersionNo}"${v.displayVersionNo === selectedDisplayNo ? ' selected' : ''}>v${v.displayVersionNo} of ${totalVersions}</option>`)
                .join('');
            versionControls = `
                <div style="margin-left: auto; display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    <button type="button" data-wf-dash-card-${expanded ? 'collapse' : 'show-all'}="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(task.id)}" style="${this._btnStyle()} padding: 2px 8px; font-size: 11px;">${expanded ? 'Collapse' : 'Show All'}</button>
                    ${expanded ? '' : `<select data-wf-dash-card-version-select="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(task.id)}" style="${this._inputStyle()} width: auto; padding: 2px 8px; font-size: 11px; cursor: pointer;" aria-label="Select prompt version">${versionOptions}</select>`}
                </div>`;
        }

        const versionSections = renderedVersions.map((version) => {
            const feedbackEntries = feedbackByDisplayNo.get(version.displayVersionNo) || [];
            const fallback = !hasTimeline && allFeedback.length === 0 ? item.qaFeedback : null;
            const orphanDisputes = orphanDisputesByDisplayNo.get(version.displayVersionNo) || [];
            return this._versionSectionHtml(
                task.id, version, totalVersions, feedbackEntries,
                highlightQuery, caseSensitive, highlightFuzzy, hasTimeline, fallback,
                orphanDisputes, itemId, highlightRegex
            );
        }).join('');

        const cardHtml = `
            <article style="position: relative; border: 2px solid color-mix(in srgb, var(--foreground, #0f172a) 28%, var(--border, #cbd5e1)); border-radius: 10px; background: var(--card, #ffffff); overflow: hidden;">
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 10px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">
                    ${this._statusBadgeHtml(task.status)}
                    <div style="flex: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 16px; min-width: 0;">
                        ${this._fieldGroupHtml('Team', this._dataValueHtml(task.team))}
                        ${this._fieldGroupHtml('Project', this._dataValueHtml(task.project) + projectLink)}
                        ${this._fieldGroupHtml('Environment', this._dataValueHtml(task.environment))}
                    </div>
                    <div style="display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;">
                        ${this._fieldGroupHtml('Key', this._copyChipHtml(task.key))}
                        ${this._taskOpenLinkHtml(task, itemId)}
                    </div>
                </div>
                <div style="display: flex; flex-wrap: wrap; align-items: start; gap: 8px 24px; padding: 8px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">
                    ${this._fieldGroupHtml('Author', this._personChipsHtml(task.author.name, task.author.email, task.author.id, 'Open author in Fleet'))}
                    ${reviewerBadges}
                </div>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 8px 14px; font-size: 12px;">
                    ${row3Left}
                    ${versionControls}
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px; padding: 12px 14px; font-size: 12px;">
                    ${versionSections}
                </div>
            </article>`;

        return this._resultCardOuterWrap(item, cardHtml);
    },

    // ── Copy feedback (color-only: 1s green / 0.5s red pulse) ──

    async _copyText(text) {
        if (!text) return false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (_e) { /* fall through to execCommand */ }
        try {
            const doc = this._pageWindow().document;
            const ta = doc.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            doc.body.appendChild(ta);
            ta.select();
            const ok = doc.execCommand('copy');
            doc.body.removeChild(ta);
            return ok;
        } catch (_e2) {
            return false;
        }
    },

    async _copyWithFeedback(el, text) {
        const value = String(text == null ? '' : text).trim();
        if (!value) { this._flashCopyFail(el); Logger.warn('dashboard: copy skipped (empty value)'); return false; }
        const ok = await this._copyText(value);
        if (ok) {
            this._flashCopySuccess(el);
            Logger.log('dashboard: copied ' + value.length + ' chars');
        } else {
            this._flashCopyFail(el);
            Logger.warn('dashboard: copy failed');
        }
        return ok;
    },

    _flashCopySuccess(el) {
        if (el._wfDashCopyTimeout) clearTimeout(el._wfDashCopyTimeout);
        const prevBg = el.style.backgroundColor;
        const prevColor = el.style.color;
        const prevTransition = el.style.transition;
        el.style.transition = 'none';
        el.style.backgroundColor = 'rgb(34, 197, 94)';
        el.style.color = '#ffffff';
        el._wfDashCopyTimeout = setTimeout(() => {
            el.style.backgroundColor = prevBg;
            el.style.color = prevColor;
            el.style.transition = prevTransition;
            el._wfDashCopyTimeout = null;
        }, 1000);
    },

    _flashCopyFail(el) {
        if (el._wfDashCopyTimeout) clearTimeout(el._wfDashCopyTimeout);
        const prevBg = el.style.backgroundColor;
        const prevColor = el.style.color;
        const prevTransition = el.style.transition;
        el.style.transition = 'none';
        el.style.backgroundColor = 'rgb(239, 68, 68)';
        el.style.color = '#ffffff';
        void el.offsetWidth;
        el.style.transition = 'background-color 0.5s ease, color 0.5s ease';
        el.style.backgroundColor = prevBg;
        el.style.color = prevColor;
        el._wfDashCopyTimeout = setTimeout(() => {
            el.style.transition = prevTransition;
            el._wfDashCopyTimeout = null;
        }, 500);
    }
};
