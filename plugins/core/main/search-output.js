// ============= search-output.js =============
// Worker Output Search tab for the Ops dashboard.

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
const DASH_RESULTS_MODE_STORAGE_KEY = 'fleet-ux:dashboard-results-mode';
const DASH_RESULTS_PAGE_SIZE_KEY = 'fleet-ux:dashboard-results-page-size';
const DASH_HYDRATE_TAB_BG = '#64748b';
const DASH_CARD_TAB_HEIGHT = '24px';
const DASH_CARD_BORDER = '2px solid color-mix(in srgb, var(--foreground, #0f172a) 28%, var(--border, #cbd5e1))';
const DASH_CARD_TAB_BORDER = '1px solid color-mix(in srgb, var(--foreground, #0f172a) 28%, var(--border, #cbd5e1))';
const DASH_TASK_CARD_BG = '#121212';
const DASH_HYDRATE_TASK_CHUNK = 25;
const DASH_HYDRATE_BATCH_MAX = 100;
const DASH_HELPFULNESS_BATCH_CHUNK = 100;
const DASH_RESULTS_PAGE_SIZE_DEFAULT = 100;
const DASH_BOOTSTRAP_VERSION = 3;
const DASH_BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const DASH_FLEET_ORIGIN = 'https://www.fleetai.com';
const DASH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Fleet eval_tasks.key shape, e.g. task_iyasykc1wvkn_1781012033021_oyzfvsbk0 */
const DASH_TASK_KEY_RE = /^task_[A-Za-z0-9_]+$/;
const DASH_TASKS_PAGE_SIZE = 100;
const DASH_QA_PAGE_SIZE = 50;
const DASH_DISPUTES_PAGE_SIZE = 100;
const DASH_DISPUTES_MAX_PAGES = 100;
const DASH_DISPUTES_TASK_FETCH_CONCURRENCY = 5;
const DASH_FLEET_FLAGS_PATH = '/task-flags';
const DASH_FLEET_SENIOR_REVIEW_REFERER = DASH_FLEET_ORIGIN + '/work/problems/senior-review';
const DASH_PREFETCH_KINDS = ['openDisputes', 'resolvedDisputes', 'pendingFlags', 'resolvedFlags'];
/** Stop disputes bulk pagination after this many pages with zero date-filter matches (client-side filter). */
const DASH_DISPUTES_DATE_FILTER_MAX_EMPTY_PAGES = 3;
const DASH_FLEET_WEB_API = DASH_FLEET_ORIGIN + '/api';

const DASH_KIND_LABELS = {
    task_creation: 'Task Creation',
    qa: 'QA',
    dispute: 'Disputes',
    senior_review: 'Sr Review'
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
    },
    senior_review: {
        label: 'Sr Review',
        tabBg: '#ca8a04',
        toggleActive: 'border: 2px solid #ca8a04; color: #a16207; background: transparent;',
        textHighlight: 'font-weight: 600; color: #a16207;'
    }
};

const DASH_TOGGLE_INACTIVE = 'border: 2px solid var(--border, #e2e8f0); color: var(--muted-foreground, #64748b); background: transparent; opacity: 0.6;';
const DASH_SEARCH_DEPTH_TOGGLE_ACTIVE = 'border: 2px solid #ca8a04; color: #a16207; background: transparent;';
const DASH_FLAGGED_COLOR = '#a16207';
const DASH_FLAGGED_BORDER = '#ca8a04';
const DASH_FLAGGED_BG = 'color-mix(in srgb, #ca8a04 14%, transparent)';

const DASH_SEARCH_DEPTH_HINTS = {
    quick: 'Faster results, task history hydration only on demand.',
    deep: 'Slower results with complete task history for each card.'
};
const DASH_RESULTS_MODE_HINTS = {
    clear: 'Clears previous results and replaces with new search results.',
    add: 'Adds new search results to previous ones (deduplicated).'
};
const DASH_SUBSTRING_FILTER_HELP = 'Matches task key, prompt, QA feedback, and dispute text.';
const DASH_NONE_SELECTED_HINT = 'None selected = all.';

const DASH_SORT_DEFAULT = 'task_submitted:desc';
const DASH_SORT_METRICS = [
    { id: 'task_submitted', label: 'Task created' },
    { id: 'task_revised', label: 'Task revised' },
    { id: 'feedback_given', label: 'Feedback given' },
    { id: 'dispute_submitted', label: 'Dispute submitted' },
    { id: 'dispute_resolved', label: 'Dispute resolved' }
];
const DASH_SORT_OPTIONS = DASH_SORT_METRICS.flatMap((metric) => ([
    { value: metric.id + ':desc', label: metric.label + ' (newest first)', sortMetric: metric.id, sortOrder: 'desc' },
    { value: metric.id + ':asc', label: metric.label + ' (oldest first)', sortMetric: metric.id, sortOrder: 'asc' }
]));

/** Tab strip order when one task matches multiple output kinds. */
const DASH_KIND_MERGE_ORDER = ['task_creation', 'qa', 'dispute', 'senior_review'];

const DASH_FILTER_SCOPES = [
    { scopeKey: 'filter-contributors', optionsKey: 'contributors', draftKey: 'contributorIds' },
    { scopeKey: 'filter-statuses', optionsKey: 'statuses', draftKey: 'statuses' },
    { scopeKey: 'filter-envs', optionsKey: 'envs', draftKey: 'envKeys' },
    { scopeKey: 'filter-projects', optionsKey: 'projects', draftKey: 'projectIds' },
    { scopeKey: 'filter-prompt-ratings', optionsKey: 'promptRatings', draftKey: 'promptRatings' },
    { scopeKey: 'filter-qa-helpfulness', optionsKey: 'qaHelpfulness', draftKey: 'qaHelpfulness' },
    { scopeKey: 'filter-return-types', optionsKey: 'returnTypes', draftKey: 'returnTypes' },
    { scopeKey: 'filter-task-issues', optionsKey: 'taskIssues', draftKey: 'taskIssues' },
    { scopeKey: 'filter-prompt-history', optionsKey: 'promptHistory', draftKey: 'promptHistory' },
    { scopeKey: 'filter-teams', optionsKey: 'teams', draftKey: 'teamIds' }
];

const DASH_OUTPUT_MANUAL_FILTER_FIELDS = [
    { id: 'prompt_version_count', label: 'Unique Task Versions †', type: 'number', hydrateHint: true },
    { id: 'prompt_word_count', label: 'Prompt Length (words)', type: 'number' },
    { id: 'rejection_issue_count', label: 'Unique Task Issues', type: 'number' }
];

const DASH_MANUAL_FILTER_DEFAULT_FIELD = 'prompt_version_count';

const DASH_OUTPUT_NUM_COMPARATORS = [
    { id: 'gt', label: '>' },
    { id: 'gte', label: '>=' },
    { id: 'lt', label: '<' },
    { id: 'lte', label: '<=' },
    { id: 'eq', label: '=' },
    { id: 'neq', label: '≠' }
];

const DASH_OUTPUT_DATE_COMPARATORS = [
    { id: 'gt', label: 'After' },
    { id: 'gte', label: 'On or after' },
    { id: 'lt', label: 'Before' },
    { id: 'lte', label: 'On or before' },
    { id: 'eq', label: 'On' },
    { id: 'neq', label: 'Not on' }
];

function dashManualFilterWordCount(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
}

function dashManualFilterFieldOptionsHtml(selectedId) {
    const sel = selectedId || DASH_MANUAL_FILTER_DEFAULT_FIELD;
    return DASH_OUTPUT_MANUAL_FILTER_FIELDS.map((f) => {
        const selected = f.id === sel ? ' selected' : '';
        return '<option value="' + dashEscHtml(f.id) + '"' + selected + '>' + dashEscHtml(f.label) + '</option>';
    }).join('');
}

function dashManualComparatorOptionsHtml(fieldType, selectedId) {
    const list = fieldType === 'date' ? DASH_OUTPUT_DATE_COMPARATORS : DASH_OUTPUT_NUM_COMPARATORS;
    const sel = selectedId || list[0].id;
    return list.map((c) => {
        const selected = c.id === sel ? ' selected' : '';
        return '<option value="' + dashEscHtml(c.id) + '"' + selected + '>' + dashEscHtml(c.label) + '</option>';
    }).join('');
}

function dashManualFilterRowHtml(opts) {
    const options = opts || {};
    const field = options.field || DASH_MANUAL_FILTER_DEFAULT_FIELD;
    const fieldMeta = DASH_OUTPUT_MANUAL_FILTER_FIELDS.find((f) => f.id === field)
        || DASH_OUTPUT_MANUAL_FILTER_FIELDS.find((f) => f.id === DASH_MANUAL_FILTER_DEFAULT_FIELD)
        || DASH_OUTPUT_MANUAL_FILTER_FIELDS[0];
    const isDate = fieldMeta.type === 'date';
    const comparator = options.comparator || (isDate ? 'gte' : 'gte');
    const value = options.value != null ? String(options.value) : '';
    const selectStyle = options.selectStyle || '';
    const inputStyle = options.inputStyle || '';
    const removeBtnStyle = options.removeBtnStyle || '';
    const compWidth = isDate ? '96px' : '52px';
    return '<div data-wf-dash-manual-row="1" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">'
        + '<select data-wf-dash-manual-field="1" style="' + selectStyle + ' flex: 1; min-width: 120px;">'
        + dashManualFilterFieldOptionsHtml(field)
        + '</select>'
        + '<select data-wf-dash-manual-comparator="1" style="' + selectStyle + ' width: ' + compWidth + '; flex-shrink: 0;">'
        + dashManualComparatorOptionsHtml(isDate ? 'date' : 'number', comparator)
        + '</select>'
        + '<input type="' + (isDate ? 'date' : 'number') + '" data-wf-dash-manual-value="1" placeholder="Value" step="any" value="'
        + dashEscHtml(value) + '" style="' + inputStyle + ' width: ' + (isDate ? '118px' : '72px') + '; flex-shrink: 0;">'
        + '<button type="button" data-wf-dash-manual-remove="1" title="Remove filter" style="' + removeBtnStyle
        + ' flex-shrink: 0; padding: 4px 8px; font-size: 14px; line-height: 1; color: var(--muted-foreground, #64748b); background: transparent; border: 1px solid var(--border, #e2e8f0); border-radius: 4px; cursor: pointer;">×</button>'
        + '</div>';
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


const searchOutputMethods = {
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

    // ── Catalog / team helpers ──,

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

    // ── PostgREST data layer (reuses ops-tab session/token gathering) ──,

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

    // ── Fleet web API (session cookies; same-origin) ──,

    async _fleetWebGet(path, channel) {
        const allowed = channel === 'search'
            ? this._state.searchFetchActive
            : channel === 'hydrate'
                ? this._state.hydrateFetchActive
                : true;
        if ((channel === 'search' || channel === 'hydrate') && !allowed) {
            Logger.warn('dashboard: blocked Fleet web API call outside search/hydrate — ' + path);
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

    _fleetWebGetHydrate(path) {
        return this._fleetWebGet(path, 'hydrate');
    },

    async _fleetWebPost(path, options) {
        const opts = options || {};
        const url = path.startsWith('http') ? path : DASH_FLEET_WEB_API + path;
        const pageWindow = this._pageWindow();
        const requestFetch = pageWindow.fetch || fetch;
        const headers = {
            accept: '*/*',
            referer: opts.referer || (DASH_FLEET_ORIGIN + '/work/problems/disputes')
        };
        if (opts.body != null) {
            headers['content-type'] = 'application/json';
        }
        const fetchInit = {
            method: 'POST',
            credentials: 'include',
            headers
        };
        if (opts.body != null) {
            fetchInit.body = JSON.stringify(opts.body);
        }
        const res = await requestFetch.call(pageWindow, url, fetchInit);
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error('Fleet web API ' + res.status + ': ' + (text || res.statusText));
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const json = await res.json().catch(() => null);
            if (json && json.success === false) {
                throw new Error('Fleet web API reported failure');
            }
            return json;
        }
        return null;
    },

    _flagResolveApiPath(flagId) {
        return DASH_FLEET_FLAGS_PATH + '/' + encodeURIComponent(String(flagId)) + '/resolve';
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

    async _dashPostgrestListGet(table, params) {
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
                accept: 'application/json',
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
        const body = await res.json();
        return Array.isArray(body) ? body : (body ? [body] : []);
    },

    async _dashFetchUserTeamCatalog(profileId) {
        const id = String(profileId || this._dashGetCurrentUserId() || '').trim();
        if (!id || !DASH_UUID_RE.test(id)) {
            throw new Error('Fleet user id unavailable. Open Fleet while logged in.');
        }
        const rows = await this._dashPostgrestListGet('team_member', {
            select: 'role,team(id,name,logo_url)',
            profile_id: 'eq.' + id,
            status: 'eq.ACTIVE'
        });
        const teams = rows
            .map((row) => {
                const team = row && row.team;
                if (!team || !team.id || !team.name) return null;
                return {
                    id: team.id,
                    name: team.name,
                    displayName: this._dashFormatTeamDisplayLabel(team.name),
                    role: row.role || null
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
        const ops = this._dashOpsTab();
        if (typeof ops.hydrateUserTeamCatalog === 'function') {
            ops.hydrateUserTeamCatalog(id, teams);
        }
        Logger.log('dashboard: user team catalog fetched (' + teams.length + ' teams, profile=' + id.slice(0, 8) + '…)');
        return teams;
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

    async _dashPostgrestUpsert(table, conflictCols, body) {
        const { baseUrl, anonKey } = this._dashEnsureRuntimeAccess();
        const ops = this._dashOpsTab();
        const pageWindow = this._pageWindow();
        const jwt = typeof ops.getFleetUserJwt === 'function' ? ops.getFleetUserJwt(pageWindow) : '';
        if (!jwt) {
            throw new Error('Fleet session token not yet captured. Navigate to a Fleet data page, then retry.');
        }
        const url = new URL(baseUrl + '/' + table);
        url.searchParams.set('on_conflict', conflictCols);
        const requestFetch = pageWindow.fetch || fetch;
        const res = await requestFetch.call(pageWindow, url.toString(), {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                'content-profile': 'public',
                prefer: 'resolution=merge-duplicates',
                apikey: anonKey,
                authorization: 'Bearer ' + jwt,
                'x-client-info': 'fleet-ux-dashboard/' + this._version
            },
            credentials: 'omit',
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error('Supabase API ' + res.status + ': ' + (text || res.statusText));
        }
    },

    _shouldShowHelpfulness(qa, feedbackId) {
        if (!feedbackId || !qa) return false;
        if (qa.isSystemFeedback || qa.isVerifierFailure) return false;
        const userId = this._dashGetCurrentUserId();
        const reviewerId = String(qa.qaReviewerId || '').trim();
        if (userId && reviewerId && userId === reviewerId) return false;
        return true;
    },

    _helpfulnessFeedbackIdInFilter(ids) {
        const numeric = (ids || [])
            .map((id) => Number(String(id).trim()))
            .filter((n) => Number.isFinite(n) && n > 0);
        if (numeric.length === 0) return '';
        return 'in.(' + numeric.join(',') + ')';
    },

    _getHelpfulnessUi(feedbackId) {
        const id = String(feedbackId || '').trim();
        if (!id) {
            return {
                isHelpful: null,
                reportText: null,
                localText: '',
                loaded: false,
                submitting: false,
                confirmingRemove: false,
                dirty: false
            };
        }
        if (!this._state.helpfulnessUi[id]) {
            this._state.helpfulnessUi[id] = {
                isHelpful: null,
                reportText: null,
                localText: '',
                loaded: false,
                submitting: false,
                confirmingRemove: false,
                dirty: false
            };
        }
        return this._state.helpfulnessUi[id];
    },

    _helpfulnessThumbSvg(direction) {
        if (direction === 'up') {
            return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; flex-shrink: 0;"><path d="M7 10v12"></path><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"></path></svg>';
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; flex-shrink: 0;"><path d="M17 14V2"></path><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"></path></svg>';
    },

    _helpfulnessThumbBtnStyle(direction, active) {
        const base = 'display: inline-flex; align-items: center; justify-content: center; padding: 4px 8px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: opacity 0.15s;';
        if (direction === 'up' && active) {
            return base + ' border: 1px solid #10b981; background: color-mix(in srgb, #10b981 8%, var(--card, #ffffff)); color: #047857;';
        }
        if (direction === 'down' && active) {
            return base + ' border: 1px solid #ef4444; background: color-mix(in srgb, #ef4444 8%, var(--card, #ffffff)); color: #b91c1c;';
        }
        return base + ' border: 1px solid var(--border, #e2e8f0); background: var(--card, #ffffff); color: var(--muted-foreground, #64748b);';
    },

    _helpfulnessBlockHtml(feedbackId) {
        const fid = String(feedbackId || '').trim();
        const ui = this._getHelpfulnessUi(fid);
        const escId = dashEscHtml(fid);
        const upActive = ui.isHelpful === true;
        const downActive = ui.isHelpful === false;
        const submittedText = ui.reportText != null ? String(ui.reportText) : '';
        const localText = ui.localText != null ? String(ui.localText) : '';
        const hasSubmitted = ui.reportText != null;
        const submitLabel = hasSubmitted ? 'Update' : 'Submit';
        const canSubmit = localText.trim().length > 0 && localText !== submittedText && !ui.submitting;
        const submitClass = this._dashBtnClass('primary', 'compact');
        const basicClass = this._dashBtnClass('basic', 'compact');
        const submitDisabled = !canSubmit ? ' disabled' : '';
        const submitStyle = !canSubmit ? ' opacity: 0.45; cursor: not-allowed;' : '';
        const textareaStyle = this._inputStyle()
            + ' flex: 1; min-width: 120px; height: 28px; min-height: 28px; max-height: 200px; resize: vertical; overflow-y: auto; padding: 4px 8px; font-size: 12px; line-height: 1.4;';

        let removeHtml = '';
        if (ui.confirmingRemove) {
            removeHtml = `<span style="font-size: 11px; color: var(--muted-foreground, #64748b); white-space: nowrap; flex-shrink: 0;">Are you sure?</span>
                <button type="button" data-wf-dash-qa-review-confirm="1" data-wf-dash-feedback-id="${escId}" class="${basicClass}" style="flex-shrink: 0; white-space: nowrap;"${ui.submitting ? ' disabled' : ''}>Confirm</button>
                <button type="button" data-wf-dash-qa-review-cancel="1" data-wf-dash-feedback-id="${escId}" class="${basicClass}" style="flex-shrink: 0; white-space: nowrap;"${ui.submitting ? ' disabled' : ''}>Cancel</button>`;
        } else if (hasSubmitted) {
            removeHtml = `<button type="button" data-wf-dash-qa-review-remove="1" data-wf-dash-feedback-id="${escId}" class="${basicClass}" style="flex-shrink: 0; white-space: nowrap;"${ui.submitting ? ' disabled' : ''}>Remove Review</button>`;
        }

        return `
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
                <span style="font-weight: 600; color: var(--foreground, #0f172a); flex-shrink: 0;">Helpfulness</span>
                <div style="display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;">
                    <button type="button" data-wf-dash-thumb="up" data-wf-dash-feedback-id="${escId}" title="Helpful" style="${this._helpfulnessThumbBtnStyle('up', upActive)}"${ui.submitting ? ' disabled' : ''}>${this._helpfulnessThumbSvg('up')}</button>
                    <button type="button" data-wf-dash-thumb="down" data-wf-dash-feedback-id="${escId}" title="Not Helpful" style="${this._helpfulnessThumbBtnStyle('down', downActive)}"${ui.submitting ? ' disabled' : ''}>${this._helpfulnessThumbSvg('down')}</button>
                </div>
                <textarea data-wf-dash-qa-review-input="1" data-wf-dash-feedback-id="${escId}" rows="1" placeholder="Write a review…" style="${textareaStyle}"${ui.submitting ? ' disabled' : ''}>${dashEscHtml(localText)}</textarea>
                <button type="button" data-wf-dash-qa-review-submit="1" data-wf-dash-feedback-id="${escId}" class="${submitClass}" style="flex-shrink: 0;${submitStyle}"${submitDisabled}>${dashEscHtml(submitLabel)}</button>
                ${removeHtml}
            </div>`;
    },

    _patchHelpfulnessBlock(feedbackId) {
        const fid = String(feedbackId || '').trim();
        if (!fid || !this._modal) return;
        let wrap = null;
        for (const el of this._modal.querySelectorAll('[data-wf-dash-helpfulness]')) {
            if (el.getAttribute('data-wf-dash-helpfulness') === fid) {
                wrap = el;
                break;
            }
        }
        if (!wrap) return;
        const ta = wrap.querySelector('[data-wf-dash-qa-review-input]');
        const hadFocus = ta && this._pageWindow().document.activeElement === ta;
        const selStart = hadFocus ? ta.selectionStart : null;
        const selEnd = hadFocus ? ta.selectionEnd : null;
        wrap.innerHTML = this._helpfulnessBlockHtml(fid);
        if (hadFocus) {
            const newTa = wrap.querySelector('[data-wf-dash-qa-review-input]');
            if (newTa) {
                newTa.focus();
                try {
                    if (selStart != null && selEnd != null) newTa.setSelectionRange(selStart, selEnd);
                } catch (_e) { /* ignore */ }
            }
        }
    },

    async _fetchHelpfulnessRatingsBatch(feedbackIds) {
        const userId = this._dashGetCurrentUserId();
        if (!userId) {
            Logger.warn('search-output: helpfulness batch skipped — no user id');
            return;
        }
        const unique = [...new Set((feedbackIds || []).map((id) => String(id).trim()).filter(Boolean))];
        if (unique.length === 0) return;

        const rowsByFeedbackId = new Map();
        for (let i = 0; i < unique.length; i += DASH_HELPFULNESS_BATCH_CHUNK) {
            const chunk = unique.slice(i, i + DASH_HELPFULNESS_BATCH_CHUNK);
            const inFilter = this._helpfulnessFeedbackIdInFilter(chunk);
            if (!inFilter) continue;
            const rows = await this._dashPostgrestListGet('feedback_helpfulness_ratings', {
                select: 'feedback_id,is_helpful,report_text',
                feedback_id: inFilter,
                user_id: 'eq.' + userId
            });
            for (const row of rows) {
                if (row && row.feedback_id != null) {
                    rowsByFeedbackId.set(String(row.feedback_id), row);
                }
            }
        }

        for (const fid of unique) {
            const ui = this._getHelpfulnessUi(fid);
            const row = rowsByFeedbackId.get(fid);
            ui.loaded = true;
            if (row) {
                ui.isHelpful = row.is_helpful === true ? true : (row.is_helpful === false ? false : null);
                ui.reportText = row.report_text != null ? String(row.report_text) : null;
                if (!ui.dirty) {
                    ui.localText = ui.reportText != null ? String(ui.reportText) : '';
                }
            } else {
                ui.isHelpful = null;
                ui.reportText = null;
                if (!ui.dirty) ui.localText = '';
            }
        }
        Logger.debug('search-output: helpfulness batch loaded for ' + unique.length + ' feedback row(s)');
    },

    _helpfulnessUpsertBody(feedbackId, fields) {
        const userId = this._dashGetCurrentUserId();
        if (!userId) throw new Error('Fleet user id unavailable. Open Fleet while logged in.');
        const feedbackNum = Number(String(feedbackId).trim());
        if (!Number.isFinite(feedbackNum) || feedbackNum <= 0) {
            throw new Error('Invalid feedback id');
        }
        return Object.assign({
            feedback_id: feedbackNum,
            user_id: userId
        }, fields || {});
    },

    async _handleThumbClick(feedbackId, direction) {
        const fid = String(feedbackId || '').trim();
        if (!fid || (direction !== 'up' && direction !== 'down')) return;
        const ui = this._getHelpfulnessUi(fid);
        if (ui.submitting) return;

        const wantHelpful = direction === 'up';
        const prev = ui.isHelpful;
        let next;
        if (prev === wantHelpful) next = null;
        else next = wantHelpful;

        ui.isHelpful = next;
        ui.submitting = true;
        this._patchHelpfulnessBlock(fid);
        try {
            await this._dashPostgrestUpsert(
                'feedback_helpfulness_ratings',
                'feedback_id,user_id',
                this._helpfulnessUpsertBody(fid, { is_helpful: next })
            );
            Logger.log('search-output: helpfulness ' + (next === true ? 'up' : next === false ? 'down' : 'cleared') + ' — feedback ' + fid);
        } catch (e) {
            ui.isHelpful = prev;
            Logger.warn('search-output: helpfulness update failed — feedback ' + fid, e);
        } finally {
            ui.submitting = false;
            this._patchHelpfulnessBlock(fid);
            this._refreshHelpfulnessFilterUi();
        }
    },

    _handleQaReviewInput(feedbackId, value) {
        const fid = String(feedbackId || '').trim();
        if (!fid) return;
        const ui = this._getHelpfulnessUi(fid);
        ui.localText = String(value || '');
        ui.dirty = true;
        this._patchHelpfulnessBlock(fid);
    },

    async _handleQaReviewSubmit(feedbackId) {
        const fid = String(feedbackId || '').trim();
        if (!fid) return;
        const ui = this._getHelpfulnessUi(fid);
        const text = String(ui.localText || '').trim();
        const submittedText = ui.reportText != null ? String(ui.reportText) : '';
        if (!text || text === submittedText || ui.submitting) return;

        ui.submitting = true;
        this._patchHelpfulnessBlock(fid);
        try {
            await this._dashPostgrestUpsert(
                'feedback_helpfulness_ratings',
                'feedback_id,user_id',
                this._helpfulnessUpsertBody(fid, {
                    is_helpful: ui.isHelpful,
                    report_text: text
                })
            );
            ui.reportText = text;
            ui.dirty = false;
            Logger.log('search-output: QA review submitted — feedback ' + fid + ' (' + text.length + ' chars)');
        } catch (e) {
            Logger.warn('search-output: QA review submit failed — feedback ' + fid, e);
        } finally {
            ui.submitting = false;
            this._patchHelpfulnessBlock(fid);
            this._refreshHelpfulnessFilterUi();
        }
    },

    _handleQaReviewRemovePrompt(feedbackId) {
        const fid = String(feedbackId || '').trim();
        if (!fid) return;
        const ui = this._getHelpfulnessUi(fid);
        if (ui.submitting || ui.reportText == null) return;
        ui.confirmingRemove = true;
        this._patchHelpfulnessBlock(fid);
    },

    _handleQaReviewRemoveCancel(feedbackId) {
        const fid = String(feedbackId || '').trim();
        if (!fid) return;
        const ui = this._getHelpfulnessUi(fid);
        ui.confirmingRemove = false;
        this._patchHelpfulnessBlock(fid);
    },

    async _handleQaReviewRemoveConfirm(feedbackId) {
        const fid = String(feedbackId || '').trim();
        if (!fid) return;
        const ui = this._getHelpfulnessUi(fid);
        if (ui.submitting) return;

        ui.submitting = true;
        this._patchHelpfulnessBlock(fid);
        try {
            await this._dashPostgrestUpsert(
                'feedback_helpfulness_ratings',
                'feedback_id,user_id',
                this._helpfulnessUpsertBody(fid, { report_text: null })
            );
            ui.reportText = null;
            ui.localText = '';
            ui.dirty = false;
            ui.confirmingRemove = false;
            Logger.log('search-output: QA review removed — feedback ' + fid);
        } catch (e) {
            Logger.warn('search-output: QA review remove failed — feedback ' + fid, e);
        } finally {
            ui.submitting = false;
            this._patchHelpfulnessBlock(fid);
            this._refreshHelpfulnessFilterUi();
        }
    },

    _getFlagResolutionUi(flagId) {
        const id = String(flagId || '').trim();
        if (!id) {
            return { localNote: '', submitting: false };
        }
        if (!this._state.flagResolutionUi[id]) {
            this._state.flagResolutionUi[id] = {
                localNote: '',
                submitting: false
            };
        }
        return this._state.flagResolutionUi[id];
    },

    _flagResolutionBlockHtml(flagId, itemId) {
        const fid = String(flagId || '').trim();
        const escFlagId = dashEscHtml(fid);
        const escItemId = dashEscHtml(String(itemId || '').trim());
        const ui = this._getFlagResolutionUi(fid);
        const localNote = ui.localNote != null ? String(ui.localNote) : '';
        const confirmClass = this._dashBtnClass('primary', 'compact');
        const dismissClass = this._dashBtnClass('basic', 'compact');
        const disabled = ui.submitting ? ' disabled' : '';
        const textareaStyle = this._inputStyle()
            + ' flex: 1; min-width: 120px; height: 28px; min-height: 28px; max-height: 200px; resize: vertical; overflow-y: auto; padding: 4px 8px; font-size: 12px; line-height: 1.4;';
        return `
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
                <span style="font-weight: 600; color: var(--foreground, #0f172a); flex-shrink: 0;">Resolution</span>
                <textarea data-wf-dash-flag-resolution-input="1" data-wf-dash-flag-id="${escFlagId}" data-item-id="${escItemId}" rows="1" placeholder="Resolution note…" style="${textareaStyle}"${disabled}>${dashEscHtml(localNote)}</textarea>
                <button type="button" data-wf-dash-flag-confirm="1" data-wf-dash-flag-id="${escFlagId}" data-item-id="${escItemId}" class="${confirmClass}" style="flex-shrink: 0; white-space: nowrap;"${disabled}>Confirm</button>
                <button type="button" data-wf-dash-flag-dismiss="1" data-wf-dash-flag-id="${escFlagId}" data-item-id="${escItemId}" class="${dismissClass}" style="flex-shrink: 0; white-space: nowrap;"${disabled}>Dismiss</button>
            </div>`;
    },

    _patchFlagResolutionBlock(flagId) {
        const fid = String(flagId || '').trim();
        if (!fid || !this._modal) return;
        let wrap = null;
        for (const el of this._modal.querySelectorAll('[data-wf-dash-flag-resolution]')) {
            if (el.getAttribute('data-wf-dash-flag-resolution') === fid) {
                wrap = el;
                break;
            }
        }
        if (!wrap) return;
        const itemId = wrap.getAttribute('data-wf-dash-item-id') || '';
        const ta = wrap.querySelector('[data-wf-dash-flag-resolution-input]');
        const hadFocus = ta && this._pageWindow().document.activeElement === ta;
        const selStart = hadFocus ? ta.selectionStart : null;
        const selEnd = hadFocus ? ta.selectionEnd : null;
        wrap.innerHTML = this._flagResolutionBlockHtml(fid, itemId);
        if (hadFocus) {
            const newTa = wrap.querySelector('[data-wf-dash-flag-resolution-input]');
            if (newTa) {
                newTa.focus();
                try {
                    if (selStart != null && selEnd != null) newTa.setSelectionRange(selStart, selEnd);
                } catch (_e) { /* ignore */ }
            }
        }
    },

    _handleFlagResolutionInput(flagId, value) {
        const fid = String(flagId || '').trim();
        if (!fid) return;
        const ui = this._getFlagResolutionUi(fid);
        ui.localNote = String(value || '');
        this._patchFlagResolutionBlock(fid);
    },

    async _refreshFlagPrefetchCaches() {
        this._resetPrefetchForRetry('pendingFlags');
        this._resetPrefetchForRetry('resolvedFlags');
        await Promise.all([
            this._ensurePrefetch('pendingFlags'),
            this._ensurePrefetch('resolvedFlags')
        ]);
    },

    async _rehydrateCard(itemId) {
        const item = this._findCachedItem(itemId);
        if (!item || !item.task || !item.task.id) return;
        if (!Context.dashboardData || typeof Context.dashboardData.enrichTasksWithHistory !== 'function') {
            Logger.warn('search-output: card rehydrate skipped — dashboardData not loaded');
            return;
        }
        const taskId = item.task.id;
        const profilesMap = this._profilesMapFromHydrateItems([item]);
        this._state.hydrateFetchActive = true;
        try {
            const enrichment = await Context.dashboardData.enrichTasksWithHistory([taskId], profilesMap, {});
            const hist = enrichment.get(taskId);
            if (hist) {
                const remap = hist.systemFeedbackIdRemap || {};
                if (item.selectedFeedbackId && remap[item.selectedFeedbackId]) {
                    item.selectedFeedbackId = remap[item.selectedFeedbackId];
                }
                item.task.promptVersions = hist.promptVersions || [];
                item.task.allFeedback = hist.allFeedback || [];
                if (item.selectedFeedbackId) {
                    const entry = (item.task.allFeedback || []).find((f) => f.id === item.selectedFeedbackId);
                    if (entry && entry.display) item.qaFeedback = entry.display;
                }
            }
            item.disputes = [];
            item.flags = [];
            await this._overlayDisputesAndFlags([item], profilesMap);
            this._patchTaskCard(itemId);
            this._onScopeDataEnriched();
            Logger.log('search-output: card rehydrated — ' + itemId);
        } catch (e) {
            if (!this._handleDashSessionRefreshError(e)) {
                Logger.warn('search-output: card rehydrate failed — ' + itemId, e);
            }
        } finally {
            this._state.hydrateFetchActive = false;
        }
    },

    async _handleFlagResolution(flagId, itemId, resolution) {
        const fid = String(flagId || '').trim();
        const iid = String(itemId || '').trim();
        if (!fid || !iid || (resolution !== 'confirmed' && resolution !== 'dismissed')) return;
        const ui = this._getFlagResolutionUi(fid);
        if (ui.submitting) return;

        ui.submitting = true;
        this._patchFlagResolutionBlock(fid);
        try {
            await this._fleetWebPost(this._flagResolveApiPath(fid), {
                body: {
                    resolution,
                    note: String(ui.localNote || '').trim()
                },
                referer: DASH_FLEET_SENIOR_REVIEW_REFERER
            });
            Logger.log('search-output: flag ' + resolution + ' — flag ' + fid);
            delete this._state.flagResolutionUi[fid];
            await this._refreshFlagPrefetchCaches();
            await this._rehydrateCard(iid);
        } catch (e) {
            Logger.warn('search-output: flag resolution failed — flag ' + fid, e);
        } finally {
            if (this._state.flagResolutionUi[fid]) {
                ui.submitting = false;
                this._patchFlagResolutionBlock(fid);
            }
        }
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


    _profileIdMatchesContributorSet(profileId, contributorSet) {
        if (!contributorSet || contributorSet.size === 0) return true;
        const id = profileId != null ? String(profileId).trim() : '';
        if (!id) return false;
        return contributorSet.has(id) || contributorSet.has(this._dashNormProfileId(id));
    },

    _disputeMatchesContributorFilter(row, contributorSet) {
        if (!contributorSet || contributorSet.size === 0) return true;
        const writerId = row && row.eval_task && row.eval_task.created_by
            ? String(row.eval_task.created_by).trim()
            : '';
        const resolverId = row && row.resolved_by ? String(row.resolved_by).trim() : '';
        return this._profileIdMatchesContributorSet(writerId, contributorSet)
            || this._profileIdMatchesContributorSet(resolverId, contributorSet);
    },

    _flagMatchesContributorFilter(row, contributorSet) {
        if (!contributorSet || contributorSet.size === 0) return true;
        const writerId = row && row.task && row.task.created_by
            ? String(row.task.created_by).trim()
            : '';
        const resolverId = row && row.resolved_by ? String(row.resolved_by).trim() : '';
        return this._profileIdMatchesContributorSet(writerId, contributorSet)
            || this._profileIdMatchesContributorSet(resolverId, contributorSet);
    },

    _disputeInSearchDateRange(row, afterIso, beforeIso, contributorSet) {
        if (!afterIso && !beforeIso) return true;
        if (!row) return false;
        if (contributorSet && contributorSet.size > 0) {
            const timestamps = [];
            const writerId = row.eval_task && row.eval_task.created_by
                ? String(row.eval_task.created_by).trim()
                : '';
            const resolverId = row.resolved_by ? String(row.resolved_by).trim() : '';
            if (this._profileIdMatchesContributorSet(resolverId, contributorSet) && row.resolved_at) {
                timestamps.push(String(row.resolved_at));
            }
            if (this._profileIdMatchesContributorSet(writerId, contributorSet) && row.created_at) {
                timestamps.push(String(row.created_at));
            }
            if (timestamps.length === 0) return false;
            return timestamps.some((ts) => this._disputeInCreatedAtRange(ts, afterIso, beforeIso));
        }
        const timestamp = row.created_at ? String(row.created_at) : '';
        return this._disputeInCreatedAtRange(timestamp, afterIso, beforeIso);
    },

    _flagInSearchDateRange(row, afterIso, beforeIso, contributorSet) {
        if (!afterIso && !beforeIso) return true;
        if (!row) return false;
        if (contributorSet && contributorSet.size > 0) {
            const timestamps = [];
            const writerId = row.task && row.task.created_by ? String(row.task.created_by).trim() : '';
            const resolverId = row.resolved_by ? String(row.resolved_by).trim() : '';
            if (this._profileIdMatchesContributorSet(resolverId, contributorSet) && row.resolved_at) {
                timestamps.push(String(row.resolved_at));
            }
            if (this._profileIdMatchesContributorSet(writerId, contributorSet) && row.created_at) {
                timestamps.push(String(row.created_at));
            }
            if (timestamps.length === 0) return false;
            return timestamps.some((ts) => this._disputeInCreatedAtRange(ts, afterIso, beforeIso));
        }
        const timestamp = row.created_at ? String(row.created_at) : '';
        return this._disputeInCreatedAtRange(timestamp, afterIso, beforeIso);
    },


    _disputeRowInSearchDateRange(row, afterIso, beforeIso, preferResolvedAt) {
        if (!afterIso && !beforeIso) return true;
        if (!row) return false;
        const timestamp = preferResolvedAt
            ? String(row.resolved_at || row.created_at || '')
            : String(row.created_at || '');
        if (!timestamp) return false;
        return this._disputeInCreatedAtRange(timestamp, afterIso, beforeIso);
    },

    _collectCardSearchTimestamps(item, allFeedbackRows, openDisputesByTaskId, resolvedDisputeAtByTaskId) {
        const timestamps = [];
        const taskId = item && item.task && item.task.id;
        if (!taskId) return timestamps;
        if (item.task.createdAt) timestamps.push(String(item.task.createdAt));
        for (const fb of allFeedbackRows || []) {
            if (fb && fb.eval_task_id === taskId && fb.created_at) {
                timestamps.push(String(fb.created_at));
            }
        }
        const openRows = (openDisputesByTaskId && openDisputesByTaskId.get(taskId)) || [];
        for (const row of openRows) {
            if (row.created_at) timestamps.push(String(row.created_at));
            if (row.resolved_at) timestamps.push(String(row.resolved_at));
        }
        const resolvedAt = resolvedDisputeAtByTaskId && resolvedDisputeAtByTaskId.get(taskId);
        if (resolvedAt) timestamps.push(String(resolvedAt));
        for (const d of item.disputes || []) {
            if (d.submittedAt) timestamps.push(String(d.submittedAt));
            if (d.resolutionAt) timestamps.push(String(d.resolutionAt));
            if (d.originalFeedbackCreatedAt) timestamps.push(String(d.originalFeedbackCreatedAt));
        }
        for (const f of item.flags || []) {
            if (f.createdAt) timestamps.push(String(f.createdAt));
            if (f.resolutionAt) timestamps.push(String(f.resolutionAt));
        }
        return timestamps;
    },

    _cardHasDateInSearchRange(item, afterIso, beforeIso, allFeedbackRows, openDisputesByTaskId, resolvedDisputeAtByTaskId) {
        if (!afterIso && !beforeIso) return true;
        const timestamps = this._collectCardSearchTimestamps(
            item, allFeedbackRows, openDisputesByTaskId, resolvedDisputeAtByTaskId
        );
        if (timestamps.length === 0) return false;
        return timestamps.some((ts) => this._disputeInCreatedAtRange(ts, afterIso, beforeIso));
    },

    _filterCardsBySearchDateRange(items, afterIso, beforeIso, allFeedbackRows, openDisputesByTaskId, resolvedDisputeAtByTaskId) {
        if (!afterIso && !beforeIso) return { items: items || [], discarded: 0 };
        const kept = [];
        let discarded = 0;
        for (const item of items || []) {
            if (this._cardHasDateInSearchRange(
                item, afterIso, beforeIso, allFeedbackRows, openDisputesByTaskId, resolvedDisputeAtByTaskId
            )) {
                kept.push(item);
            } else {
                discarded++;
            }
        }
        if (discarded > 0) {
            Logger.log('dashboard: discarded ' + discarded + ' card(s) — no dates within search range');
        }
        return { items: kept, discarded };
    },

    _filterFeedbackRowsForTaskIds(feedbackRows, taskIds) {
        const idSet = taskIds instanceof Set ? taskIds : new Set(taskIds || []);
        if (idSet.size === 0) return [];
        return (feedbackRows || []).filter((fb) => fb && idSet.has(fb.eval_task_id));
    },

    async _fetchDisputesBulkPages(teamIds, statusParam, afterIso, beforeIso, contributorSet, options) {
        const fleetWebChannel = (options && Object.prototype.hasOwnProperty.call(options, 'fleetWebChannel'))
            ? options.fleetWebChannel
            : 'search';
        const allRows = [];
        let offset = 0;
        let pageNum = 0;
        let lastPageLen = 0;
        const useDateEarlyExit = Boolean(afterIso || beforeIso);
        let consecutiveEmptyFilteredPages = 0;
        while (pageNum < DASH_DISPUTES_MAX_PAGES) {
            if (this._shouldStopSearch()) break;
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
                page = await this._fleetWebGet(
                    this._dashFleetWebPath('disputes_list') + '?' + qs.toString(),
                    fleetWebChannel
                );
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
            if (options.loadTracker) {
                options.loadTracker.setCount(allRows.length);
            }
            if (typeof options.onPage === 'function') {
                try {
                    options.onPage(rows, pageNum, { offset });
                } catch (e) {
                    Logger.warn('dashboard: disputes onPage callback failed', e);
                }
            }
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

    _contributorSetFromAuthorIds(authorIds) {
        if (!authorIds || authorIds.length === 0) return null;
        return new Set(authorIds.flatMap((id) => {
            const raw = String(id).trim();
            if (!raw) return [];
            const norm = this._dashNormProfileId(raw);
            return norm === raw ? [raw] : [raw, norm];
        }));
    },

    _disputeRowEvalTaskId(row) {
        if (!row || row.eval_task_id == null || row.eval_task_id === '') return '';
        return String(row.eval_task_id);
    },

    _disputeRowMatchesTaskId(row, taskId) {
        const rowTaskId = this._disputeRowEvalTaskId(row);
        const target = taskId != null ? String(taskId) : '';
        if (!rowTaskId || !target) return false;
        return rowTaskId === target;
    },

    _logDisputeRowMismatch(row, targetTaskId) {
        const disputeId = row && row.id != null ? String(row.id) : '?';
        const rowTaskId = this._disputeRowEvalTaskId(row) || '?';
        const target = targetTaskId != null ? String(targetTaskId) : '?';
        Logger.warn('dashboard: dropped dispute row for mismatched task — dispute '
            + disputeId + ', row task ' + rowTaskId + ', target task ' + target);
    },

    _filterDisputeRowsForTask(rows, taskId) {
        const out = [];
        for (const row of rows || []) {
            if (this._disputeRowMatchesTaskId(row, taskId)) out.push(row);
            else if (row) this._logDisputeRowMismatch(row, taskId);
        }
        return out;
    },

    _stripResolvedDisputeRow(row) {
        if (!row) return null;
        return {
            id: row.id,
            eval_task_id: row.eval_task_id,
            team_id: row.team_id,
            created_at: row.created_at,
            dispute_status: row.dispute_status,
            dispute_data: row.dispute_data,
            dispute_reason: row.dispute_reason,
            resolved_at: row.resolved_at,
            resolved_by: row.resolved_by,
            resolution_reason: row.resolution_reason,
            feedback_id: row.feedback_id,
            original_feedback_created_at: row.original_feedback_created_at,
            eval_task: row.eval_task || null,
            creator: row.creator || null,
            resolver: row.resolver || null
        };
    },

    _indexResolvedDisputeRows(rows) {
        const byTaskId = new Map();
        for (const raw of rows || []) {
            const stripped = this._stripResolvedDisputeRow(raw);
            if (!stripped) continue;
            const taskId = this._disputeRowEvalTaskId(stripped);
            if (!taskId) continue;
            if (!this._disputeRowMatchesTaskId(stripped, taskId)) {
                this._logDisputeRowMismatch(stripped, taskId);
                continue;
            }
            const bucket = byTaskId.get(taskId);
            if (bucket) bucket.push(stripped);
            else byTaskId.set(taskId, [stripped]);
        }
        return byTaskId;
    },

    _createPrefetchSlot() {
        return {
            byTaskId: new Map(),
            status: 'idle',
            promise: null,
            started: false,
            bulkIncomplete: false
        };
    },

    _ensurePrefetchState() {
        if (!this._state.prefetch) {
            this._state.prefetch = {
                openDisputes: this._createPrefetchSlot(),
                resolvedDisputes: this._createPrefetchSlot(),
                pendingFlags: this._createPrefetchSlot(),
                resolvedFlags: this._createPrefetchSlot()
            };
        }
        return this._state.prefetch;
    },

    _getPrefetchSlot(kind) {
        return this._ensurePrefetchState()[kind];
    },

    _getPrefetchCache(kind) {
        const slot = this._getPrefetchSlot(kind);
        return slot ? slot.byTaskId : new Map();
    },

    _isPrefetchIncomplete(kind) {
        const slot = this._getPrefetchSlot(kind);
        return Boolean(slot && slot.bulkIncomplete);
    },

    _isAnyPrefetchIncomplete(kinds) {
        return (kinds || DASH_PREFETCH_KINDS).some((kind) => this._isPrefetchIncomplete(kind));
    },

    _ensurePrefetch(kind, loadTracker) {
        const slot = this._getPrefetchSlot(kind);
        if (!slot) return Promise.resolve(0);
        if (slot.status === 'done' || slot.status === 'error') {
            return Promise.resolve(slot.byTaskId.size);
        }
        if (!slot.promise) {
            slot.promise = this._runPrefetch(kind, loadTracker);
        }
        return slot.promise;
    },

    _startPrefetchesOnce() {
        for (const kind of DASH_PREFETCH_KINDS) {
            const slot = this._getPrefetchSlot(kind);
            if (slot.started) continue;
            slot.started = true;
            void this._ensurePrefetch(kind);
        }
    },

    _resetPrefetchForRetry(kind) {
        const slot = this._getPrefetchSlot(kind);
        if (!slot) return;
        slot.started = false;
        slot.status = 'idle';
        slot.promise = null;
    },

    _resetAllPrefetchesForRetry() {
        for (const kind of DASH_PREFETCH_KINDS) {
            this._resetPrefetchForRetry(kind);
        }
    },

    _prefetchLabel(kind) {
        const labels = {
            openDisputes: 'open disputes',
            resolvedDisputes: 'resolved disputes',
            pendingFlags: 'pending flags',
            resolvedFlags: 'resolved flags'
        };
        return labels[kind] || kind;
    },

    async _awaitBootstrapForPrefetch() {
        if (this._state.bootstrapStatus === 'done') return true;
        if (this._state.bootstrapStatus === 'error') return false;
        if (!this._state.bootstrapRunPromise) {
            await this._doBootstrap();
        }
        if (this._state.bootstrapRunPromise) {
            try {
                await this._state.bootstrapRunPromise;
            } catch (_e) { /* logged in _doBootstrap */ }
        }
        return this._state.bootstrapStatus === 'done';
    },

    _onPrefetchComplete(kind) {
        if (!this._state.cachedItems || this._state.cachedItems.length === 0) return;
        void this._reoverlayAllCachedItems();
    },

    async _runPrefetch(kind, loadTracker) {
        const slot = this._getPrefetchSlot(kind);
        if (!slot) return 0;
        slot.status = 'loading';
        try {
            const ready = await this._awaitBootstrapForPrefetch();
            if (!ready) {
                if (this._state.bootstrapStatus === 'error') {
                    Logger.warn('dashboard: ' + this._prefetchLabel(kind) + ' prefetch skipped — bootstrap failed');
                } else {
                    Logger.debug('dashboard: ' + this._prefetchLabel(kind) + ' prefetch skipped — bootstrap not ready');
                }
                slot.byTaskId = new Map();
                this._resetPrefetchForRetry(kind);
                return 0;
            }
            const teamIds = this._getSearchableTeamCatalog().map(([id]) => id);
            if (teamIds.length === 0) {
                Logger.debug('dashboard: ' + this._prefetchLabel(kind) + ' prefetch skipped — no team scope');
                slot.byTaskId = new Map();
                slot.status = 'done';
                return 0;
            }
            Logger.log('dashboard: ' + this._prefetchLabel(kind) + ' prefetch started — ' + teamIds.length + ' team(s)');
            let rows = [];
            let capped = false;
            if (kind === 'openDisputes') {
                ({ rows, capped } = await this._fetchDisputesBulkPages(
                    teamIds, null, null, null, null, { fleetWebChannel: null, loadTracker }
                ));
                slot.byTaskId = this._indexOpenDisputeRows(rows);
            } else if (kind === 'resolvedDisputes') {
                ({ rows, capped } = await this._fetchDisputesBulkPages(
                    teamIds, 'resolved', null, null, null, { fleetWebChannel: null, loadTracker }
                ));
                slot.byTaskId = this._indexResolvedDisputeRows(rows);
            } else if (kind === 'pendingFlags') {
                ({ rows, capped } = await this._fetchFlagsBulkPages(
                    teamIds, 'pending', { fleetWebChannel: null, loadTracker }
                ));
                slot.byTaskId = this._indexFlagRows(rows);
            } else if (kind === 'resolvedFlags') {
                const [confirmed, dismissed] = await Promise.all([
                    this._fetchFlagsBulkPages(teamIds, 'confirmed', { fleetWebChannel: null, loadTracker }),
                    this._fetchFlagsBulkPages(teamIds, 'dismissed', { fleetWebChannel: null, loadTracker })
                ]);
                rows = [...(confirmed.rows || []), ...(dismissed.rows || [])];
                capped = Boolean(confirmed.capped || dismissed.capped);
                slot.byTaskId = this._indexFlagRows(rows);
            } else {
                slot.byTaskId = new Map();
            }
            slot.bulkIncomplete = capped;
            slot.status = 'done';
            Logger.info('dashboard: ' + this._prefetchLabel(kind) + ' prefetch complete — ' + rows.length
                + ' row(s), ' + slot.byTaskId.size + ' task(s)'
                + (capped ? ' · pagination capped' : ''));
            if (capped) {
                Logger.warn('dashboard: ' + this._prefetchLabel(kind) + ' prefetch incomplete — pagination capped');
            }
            this._onPrefetchComplete(kind);
            return slot.byTaskId.size;
        } catch (e) {
            Logger.warn('dashboard: ' + this._prefetchLabel(kind) + ' prefetch failed', e);
            slot.byTaskId = new Map();
            slot.status = 'error';
            return 0;
        }
    },

    async _fetchFlagsBulkPages(teamIds, statusParam, options) {
        const qs = new URLSearchParams({
            status: statusParam,
            teamIds: teamIds.join(',')
        });
        let page;
        try {
            page = await this._fleetWebGet(
                DASH_FLEET_FLAGS_PATH + '?' + qs.toString(),
                (options && Object.prototype.hasOwnProperty.call(options, 'fleetWebChannel'))
                    ? options.fleetWebChannel
                    : null
            );
        } catch (e) {
            Logger.warn('dashboard: flags bulk fetch failed (' + statusParam + ')', e);
            return { rows: [], capped: false };
        }
        const rows = (page && Array.isArray(page.flags)) ? page.flags : [];
        Logger.debug('dashboard: flags bulk [' + statusParam + '] — ' + rows.length + ' row(s)');
        if (options && options.loadTracker) {
            options.loadTracker.setCount(rows.length);
        }
        const totalCount = page && page.totalCount != null ? Number(page.totalCount) : rows.length;
        const capped = totalCount > rows.length;
        if (capped) {
            Logger.warn('dashboard: flags bulk may be incomplete — ' + rows.length + '/' + totalCount + ' row(s) returned');
        }
        return { rows, capped };
    },

    _stripFlagRow(row) {
        if (!row) return null;
        const task = row.task && typeof row.task === 'object' ? row.task : {};
        return {
            id: row.id,
            task_id: row.task_id,
            team_id: task.team_id || row.team_id || null,
            flagger_id: row.flagger_id,
            reason: row.reason,
            note: row.note,
            resolution: row.resolution,
            resolved_at: row.resolved_at,
            resolved_by: row.resolved_by,
            resolution_note: row.resolution_note,
            created_at: row.created_at,
            updated_at: row.updated_at,
            flagger: row.flagger || null,
            resolver: row.resolver || null,
            task: row.task || null
        };
    },

    _indexFlagRows(rows) {
        const byTaskId = new Map();
        for (const raw of rows || []) {
            const stripped = this._stripFlagRow(raw);
            if (!stripped || !stripped.task_id) continue;
            const taskId = String(stripped.task_id);
            const bucket = byTaskId.get(taskId);
            if (bucket) bucket.push(stripped);
            else byTaskId.set(taskId, [stripped]);
        }
        return byTaskId;
    },

    _indexOpenDisputeRows(rows) {
        const byTaskId = new Map();
        for (const row of rows || []) {
            const taskId = this._disputeRowEvalTaskId(row);
            if (!taskId) continue;
            if (!this._disputeRowMatchesTaskId(row, taskId)) {
                this._logDisputeRowMismatch(row, taskId);
                continue;
            }
            const bucket = byTaskId.get(taskId);
            if (bucket) bucket.push(row);
            else byTaskId.set(taskId, [row]);
        }
        return byTaskId;
    },

    _flagRowInTeamScope(row, teamIds) {
        if (!row) return false;
        const scope = teamIds || [];
        if (scope.length === 0) return true;
        const teamId = row.team_id ? String(row.team_id) : '';
        return teamId && scope.includes(teamId);
    },

    _flagRowInSearchDateRange(row, afterIso, beforeIso, preferResolvedAt) {
        if (!afterIso && !beforeIso) return true;
        if (!row) return false;
        const timestamp = preferResolvedAt
            ? String(row.resolved_at || row.created_at || '')
            : String(row.created_at || '');
        if (!timestamp) return false;
        return this._disputeInCreatedAtRange(timestamp, afterIso, beforeIso);
    },

    _disputeRowInTeamScope(row, teamIds) {
        if (!row) return false;
        const scope = teamIds || [];
        if (scope.length === 0) return true;
        const teamId = row.team_id ? String(row.team_id) : '';
        return teamId && scope.includes(teamId);
    },

    _deriveResolvedDisputeMeta(scope, afterIso, beforeIso, contributorSet) {
        const cache = this._getPrefetchCache('resolvedDisputes');
        const scopeTeamIds = (scope && scope.teamIds) || [];
        const resolvedDisputeTaskIds = new Set();
        const resolvedDisputeAtByTaskId = new Map();
        const filterByContributor = contributorSet && contributorSet.size > 0;
        for (const rows of cache.values()) {
            for (const row of rows) {
                if (!row || !row.eval_task_id) continue;
                if (!this._disputeRowInTeamScope(row, scopeTeamIds)) continue;
                if (filterByContributor) {
                    if (!this._disputeMatchesContributorFilter(row, contributorSet)) continue;
                    if (!this._disputeInSearchDateRange(row, afterIso, beforeIso, contributorSet)) continue;
                } else if (!this._disputeRowInSearchDateRange(row, afterIso, beforeIso, true)) {
                    continue;
                }
                const taskId = row.eval_task_id;
                resolvedDisputeTaskIds.add(taskId);
                const at = String(row.resolved_at || row.created_at || '');
                if (at) {
                    const prev = resolvedDisputeAtByTaskId.get(taskId);
                    if (!prev || at > prev) resolvedDisputeAtByTaskId.set(taskId, at);
                }
            }
        }
        return { resolvedDisputeTaskIds, resolvedDisputeAtByTaskId };
    },

    _deriveOpenDisputeMeta(scope, afterIso, beforeIso, contributorSet) {
        const cache = this._getPrefetchCache('openDisputes');
        const scopeTeamIds = (scope && scope.teamIds) || [];
        const openDisputesByTaskId = new Map();
        const filterByContributor = contributorSet && contributorSet.size > 0;
        for (const [taskId, rows] of cache) {
            const filtered = (rows || []).filter((row) => {
                if (!this._disputeRowInTeamScope(row, scopeTeamIds)) return false;
                if (filterByContributor) {
                    if (!this._disputeMatchesContributorFilter(row, contributorSet)) return false;
                    return this._disputeInSearchDateRange(row, afterIso, beforeIso, contributorSet);
                }
                return this._disputeRowInSearchDateRange(row, afterIso, beforeIso, false);
            });
            if (filtered.length > 0) openDisputesByTaskId.set(taskId, filtered);
        }
        return { openDisputesByTaskId };
    },

    _deriveDisputeBootstrap(scope, afterIso, beforeIso, contributorSet) {
        const openMeta = this._deriveOpenDisputeMeta(scope, afterIso, beforeIso, contributorSet || null);
        const resolvedMeta = this._deriveResolvedDisputeMeta(scope, afterIso, beforeIso, contributorSet || null);
        const bulkIncomplete = this._isAnyPrefetchIncomplete(['openDisputes', 'resolvedDisputes']);
        Logger.log('dashboard: disputes bootstrap — ' + openMeta.openDisputesByTaskId.size
            + ' open task(s), ' + resolvedMeta.resolvedDisputeTaskIds.size
            + ' resolved task id(s) in search date range'
            + (bulkIncomplete ? ' · prefetch pagination capped' : ''));
        if (bulkIncomplete) {
            Logger.warn('dashboard: disputes bootstrap incomplete — narrow team scope or date range');
        }
        return {
            openDisputesByTaskId: openMeta.openDisputesByTaskId,
            resolvedDisputeTaskIds: resolvedMeta.resolvedDisputeTaskIds,
            resolvedDisputeAtByTaskId: resolvedMeta.resolvedDisputeAtByTaskId,
            bulkIncomplete
        };
    },

    _getCachedResolvedDisputeRows(taskId) {
        const cache = this._getPrefetchCache('resolvedDisputes');
        if (!cache) return [];
        return cache.get(taskId) || [];
    },

    _getCachedOpenDisputeRows(taskId) {
        const cache = this._getPrefetchCache('openDisputes');
        if (!cache) return [];
        return cache.get(taskId) || [];
    },

    _getFilteredOpenDisputeRows(taskId, scope, afterIso, beforeIso) {
        const scopeTeamIds = (scope && scope.teamIds) || [];
        return this._filterDisputeRowsForTask(
            (this._getCachedOpenDisputeRows(taskId) || []).filter((row) => (
                this._disputeRowInTeamScope(row, scopeTeamIds)
                && this._disputeRowInSearchDateRange(row, afterIso, beforeIso, false)
            )),
            taskId
        );
    },

    _getFilteredResolvedDisputeRows(taskId, scope, afterIso, beforeIso, contributorSet) {
        const scopeTeamIds = (scope && scope.teamIds) || [];
        const filterByResolver = contributorSet && contributorSet.size > 0;
        const rows = (this._getCachedResolvedDisputeRows(taskId) || []).filter((row) => {
            if (!this._disputeRowInTeamScope(row, scopeTeamIds)) return false;
            if (filterByResolver) {
                return this._disputeMatchesContributorFilter(row, contributorSet)
                    && this._disputeInSearchDateRange(row, afterIso, beforeIso, contributorSet);
            }
            return this._disputeRowInSearchDateRange(row, afterIso, beforeIso, true);
        });
        return this._filterDisputeRowsForTask(rows, taskId);
    },

    _getFilteredFlagRows(taskId, scope, afterIso, beforeIso) {
        const scopeTeamIds = (scope && scope.teamIds) || [];
        const pending = (this._getPrefetchCache('pendingFlags').get(taskId) || []).filter((row) => (
            this._flagRowInTeamScope(row, scopeTeamIds)
            && this._flagRowInSearchDateRange(row, afterIso, beforeIso, false)
        ));
        const resolved = (this._getPrefetchCache('resolvedFlags').get(taskId) || []).filter((row) => (
            this._flagRowInTeamScope(row, scopeTeamIds)
            && this._flagRowInSearchDateRange(row, afterIso, beforeIso, true)
        ));
        return [...pending, ...resolved];
    },

    async _awaitPrefetchKindsForSearch(options) {
        const opts = options || {};
        const kinds = [];
        if (opts.includeDisputes) {
            kinds.push('openDisputes', 'resolvedDisputes');
        }
        if (opts.includeSeniorReview) {
            kinds.push('pendingFlags', 'resolvedFlags');
        }
        if (kinds.length === 0) return;
        await Promise.all(kinds.map((kind) => this._trackSearchLoadPromise(
            'Prefetch ' + this._prefetchLabel(kind),
            (tracker) => this._ensurePrefetch(kind, tracker)
        )));
    },

    _prefetchEmbedMatchesProjectScope(embed, scope) {
        if (!scope || !scope.hasProjectFilter) return true;
        const targetId = embed && embed.task_project_target && embed.task_project_target.id
            ? String(embed.task_project_target.id)
            : '';
        if (!targetId) return false;
        return (scope.targetIds || []).includes(targetId);
    },

    _prefetchDisputeRowPassesFilters(row, scope, afterIso, beforeIso, contributorSet, preferResolvedAt) {
        if (!row || !row.eval_task_id) return false;
        if (!this._disputeRowInTeamScope(row, (scope && scope.teamIds) || [])) return false;
        if (contributorSet && contributorSet.size > 0) {
            if (!this._disputeMatchesContributorFilter(row, contributorSet)) return false;
            return this._disputeInSearchDateRange(row, afterIso, beforeIso, contributorSet);
        }
        return this._disputeRowInSearchDateRange(row, afterIso, beforeIso, preferResolvedAt);
    },

    _prefetchFlagRowPassesFilters(row, scope, afterIso, beforeIso, contributorSet, preferResolvedAt) {
        if (!row || !row.task_id) return false;
        if (!this._flagRowInTeamScope(row, (scope && scope.teamIds) || [])) return false;
        if (contributorSet && contributorSet.size > 0) {
            if (!this._flagMatchesContributorFilter(row, contributorSet)) return false;
            return this._flagInSearchDateRange(row, afterIso, beforeIso, contributorSet);
        }
        return this._flagRowInSearchDateRange(row, afterIso, beforeIso, preferResolvedAt);
    },

    _scanPrefetchDisputeRows(scope, afterIso, beforeIso, contributorSet) {
        const grouped = new Map();
        const ingest = (rows, preferResolvedAt) => {
            for (const row of rows || []) {
                if (!this._prefetchDisputeRowPassesFilters(row, scope, afterIso, beforeIso, contributorSet, preferResolvedAt)) {
                    continue;
                }
                const taskId = this._disputeRowEvalTaskId(row);
                if (!taskId) continue;
                const bucket = grouped.get(taskId) || [];
                bucket.push(row);
                grouped.set(taskId, bucket);
            }
        };
        for (const rows of this._getPrefetchCache('openDisputes').values()) ingest(rows, false);
        for (const rows of this._getPrefetchCache('resolvedDisputes').values()) ingest(rows, true);
        return grouped;
    },

    _scanPrefetchFlagRows(scope, afterIso, beforeIso, contributorSet) {
        const grouped = new Map();
        const ingest = (rows, preferResolvedAt) => {
            for (const row of rows || []) {
                if (!this._prefetchFlagRowPassesFilters(row, scope, afterIso, beforeIso, contributorSet, preferResolvedAt)) {
                    continue;
                }
                const taskId = String(row.task_id || '');
                if (!taskId) continue;
                const bucket = grouped.get(taskId) || [];
                bucket.push(row);
                grouped.set(taskId, bucket);
            }
        };
        for (const rows of this._getPrefetchCache('pendingFlags').values()) ingest(rows, false);
        for (const rows of this._getPrefetchCache('resolvedFlags').values()) ingest(rows, true);
        return grouped;
    },

    _collectPrefetchDisputeProfileIds(groupedRows) {
        const ids = new Set();
        for (const rows of groupedRows.values()) {
            for (const row of rows) {
                if (row.resolved_by) ids.add(row.resolved_by);
                if (row.eval_task && row.eval_task.created_by) ids.add(row.eval_task.created_by);
            }
        }
        return [...ids];
    },

    _collectPrefetchFlagProfileIds(groupedRows) {
        const ids = new Set();
        for (const rows of groupedRows.values()) {
            for (const row of rows) {
                if (row.resolved_by) ids.add(row.resolved_by);
                if (row.flagger_id) ids.add(row.flagger_id);
                if (row.task && row.task.created_by) ids.add(row.task.created_by);
            }
        }
        return [...ids];
    },

    _taskFromFleetTaskEmbed(embed, profilesMap, options) {
        if (!embed || !embed.id) return null;
        const opt = options || {};
        const teamId = opt.teamId || embed.team_id || '';
        const projectTarget = embed.task_project_target;
        const projectId = projectTarget && projectTarget.project ? String(projectTarget.project.id || '') : '';
        const projectName = projectTarget && projectTarget.project ? String(projectTarget.project.name || '') : '';
        const version = dashFirstEmbed(embed.eval_task_versions);
        const creator = embed.creator || opt.creator || null;
        const authorId = embed.created_by || (creator && creator.id) || '';
        const profile = authorId ? profilesMap.get(authorId) : null;
        const authorName = creator && creator.full_name
            ? String(creator.full_name)
            : (profile ? this._personChipName(profile, authorId) : '');
        const authorEmail = creator && creator.email
            ? String(creator.email)
            : ((profile && profile.email) || '');
        const prompt = version && version.prompt ? String(version.prompt) : '';
        const createdAt = embed.created_at || (version && version.created_at) || '';
        const promptVersions = version ? [{
            id: version.id != null ? String(version.id) : '',
            displayVersionNo: 1,
            versionNo: 1,
            prompt,
            envKey: version.env_key || '',
            createdAt: version.created_at || createdAt
        }] : [];
        return {
            id: String(embed.id),
            key: embed.key || '',
            author: {
                id: authorId || '',
                name: authorName,
                email: authorEmail
            },
            prompt,
            environment: (version && version.env_key) || '',
            project: projectName || this._projectName(projectId),
            team: this._teamName(teamId),
            teamId: teamId || '',
            projectId: projectId || '',
            envKey: (version && version.env_key) || '',
            createdAt: createdAt || '',
            status: embed.task_lifecycle_status || '',
            promptVersions,
            allFeedback: []
        };
    },

    _buildPrefetchHydratedDisputeItems(groupedRows, profilesMap, scope) {
        const items = [];
        for (const [taskId, rows] of groupedRows) {
            if (!rows || rows.length === 0) continue;
            let embed = null;
            for (const row of rows) {
                if (row && row.eval_task && row.eval_task.id) {
                    embed = row.eval_task;
                    break;
                }
            }
            if (!embed) {
                Logger.warn('search-output: dispute prefetch missing eval_task embed — task ' + String(taskId).slice(0, 8));
                continue;
            }
            if (!this._prefetchEmbedMatchesProjectScope(embed, scope)) continue;
            const teamId = rows[0].team_id || embed.team_id || '';
            const task = this._taskFromFleetTaskEmbed(embed, profilesMap, { teamId });
            if (!task) continue;
            const disputes = this._disputeRowsToDisplays(rows, profilesMap);
            let sortAt = task.createdAt || '';
            for (const row of rows) {
                const ts = String(row.resolved_at || row.created_at || '');
                if (ts && ts > sortAt) sortAt = ts;
            }
            const linked = rows.find((r) => r.feedback_id != null);
            items.push({
                id: 'dispute-' + taskId,
                kind: 'dispute',
                kinds: ['dispute'],
                sortAt,
                task,
                selectedFeedbackId: linked ? String(linked.feedback_id) : null,
                qaFeedback: null,
                disputes,
                flags: [],
                hydrated: true
            });
        }
        items.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));
        Logger.log('search-output: prefetch dispute items — ' + items.length);
        return items;
    },

    _buildPrefetchHydratedFlagItems(groupedRows, profilesMap, scope) {
        const lib = dashLib();
        const items = [];
        for (const [taskId, rows] of groupedRows) {
            if (!rows || rows.length === 0) continue;
            const embedRow = rows.find((r) => r.task && r.task.id);
            const embed = embedRow ? embedRow.task : null;
            if (!embed) {
                Logger.warn('search-output: flag prefetch missing task embed — task ' + String(taskId).slice(0, 8));
                continue;
            }
            if (!this._prefetchEmbedMatchesProjectScope(embed, scope)) continue;
            const teamId = embed.team_id || rows[0].team_id || '';
            const task = this._taskFromFleetTaskEmbed(embed, profilesMap, { teamId, creator: embed.creator });
            if (!task) continue;
            const flags = rows.map((row) => lib.buildFlagDisplay(row));
            let sortAt = task.createdAt || '';
            for (const row of rows) {
                const ts = String(row.resolved_at || row.created_at || '');
                if (ts && ts > sortAt) sortAt = ts;
            }
            items.push({
                id: 'senior-review-' + taskId,
                kind: 'senior_review',
                kinds: ['senior_review'],
                sortAt,
                task,
                selectedFeedbackId: null,
                qaFeedback: null,
                disputes: [],
                flags,
                hydrated: true
            });
        }
        items.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));
        Logger.log('search-output: prefetch flag items — ' + items.length);
        return items;
    },

    async _fetchDisputeResolverTaskIds(authorIds, afterIso, beforeIso, scope) {
        const teamIds = (scope && scope.teamIds) || [];
        const resolverIds = new Set();
        const resolverDisputeAtByTaskId = new Map();
        if (teamIds.length === 0 || !authorIds || authorIds.length === 0) {
            return { resolverDisputeTaskIds: resolverIds, resolverDisputeAtByTaskId, bulkIncomplete: false };
        }
        await this._ensurePrefetch('resolvedDisputes');
        const contributorSet = this._contributorSetFromAuthorIds(authorIds);
        const meta = this._deriveResolvedDisputeMeta(scope, afterIso, beforeIso, contributorSet);
        Logger.log('dashboard: dispute resolver discovery — ' + meta.resolvedDisputeTaskIds.size + ' task id(s)'
            + (this._isPrefetchIncomplete('resolvedDisputes') ? ' · prefetch pagination capped' : ''));
        return {
            resolverDisputeTaskIds: meta.resolvedDisputeTaskIds,
            resolverDisputeAtByTaskId: meta.resolvedDisputeAtByTaskId,
            bulkIncomplete: this._isPrefetchIncomplete('resolvedDisputes')
        };
    },

    _allDisputeTaskIdSet(openDisputesByTaskId, resolvedDisputeTaskIds, resolverDisputeTaskIds) {
        const ids = new Set();
        if (openDisputesByTaskId) {
            for (const taskId of openDisputesByTaskId.keys()) ids.add(taskId);
        }
        if (resolvedDisputeTaskIds) {
            for (const taskId of resolvedDisputeTaskIds) ids.add(taskId);
        }
        if (resolverDisputeTaskIds) {
            for (const taskId of resolverDisputeTaskIds) ids.add(taskId);
        }
        return ids;
    },

    _trimOpenDisputesToTarget(targetTaskIds) {
        const openMap = this._state.openDisputesByTaskId;
        if (!openMap || openMap.size === 0 || !targetTaskIds || targetTaskIds.size === 0) {
            if (openMap) this._state.openDisputesByTaskId = new Map();
            return;
        }
        const trimmed = new Map();
        let dropped = 0;
        for (const [taskId, rows] of openMap) {
            if (targetTaskIds.has(taskId)) trimmed.set(taskId, rows);
            else dropped++;
        }
        this._state.openDisputesByTaskId = trimmed;
        if (dropped > 0) {
            Logger.debug('dashboard: trimmed open dispute cache — kept ' + trimmed.size
                + ' task(s), dropped ' + dropped);
        }
    },

    async _fetchTaskDisputesForTask(taskId) {
        const qs = new URLSearchParams({ taskId: String(taskId) });
        const page = await this._fleetWebGetHydrate('/disputes/task-disputes?' + qs.toString());
        return (page && Array.isArray(page.disputes)) ? page.disputes : [];
    },

    async _fetchTaskDisputesBatch(taskIds) {
        const byTaskId = new Map();
        const ids = [...new Set((taskIds || []).filter(Boolean))];
        if (ids.length === 0) return byTaskId;
        let idx = 0;
        const concurrency = Math.min(DASH_DISPUTES_TASK_FETCH_CONCURRENCY, ids.length);
        const worker = async () => {
            while (idx < ids.length) {
                const taskId = ids[idx++];
                try {
                    const rows = await this._fetchTaskDisputesForTask(taskId);
                    const validRows = this._filterDisputeRowsForTask(rows, taskId);
                    if (validRows.length > 0) byTaskId.set(String(taskId), validRows);
                } catch (e) {
                    Logger.warn('dashboard: task-disputes failed — task ' + String(taskId).slice(0, 8), e);
                }
            }
        };
        await Promise.all(Array.from({ length: concurrency }, () => worker()));
        Logger.log('dashboard: task-disputes batch — ' + byTaskId.size + '/' + ids.length + ' task(s) with resolved history');
        return byTaskId;
    },

    _flagRowsToDisplays(rows) {
        const lib = dashLib();
        return (rows || []).map((row) => lib.buildFlagDisplay(row));
    },

    _mergeBulkFlagsOntoItem(item, bulkRows) {
        const displays = this._flagRowsToDisplays(bulkRows);
        const existing = item.flags || [];
        const seen = new Set(existing.map((f) => f.id).filter(Boolean));
        const merged = [...existing];
        for (const f of displays) {
            if (!f.id || seen.has(f.id)) continue;
            seen.add(f.id);
            merged.push(f);
        }
        item.flags = merged;
    },

    async _overlayDisputesAndFlagsForItem(item, profilesMap, scope, afterIso, beforeIso, contributorSet) {
        if (!item || !item.task || !item.task.id) return false;
        const taskId = item.task.id;
        let changed = false;

        const openRows = this._getFilteredOpenDisputeRows(taskId, scope, afterIso, beforeIso);
        let resolvedRows = this._getFilteredResolvedDisputeRows(taskId, scope, afterIso, beforeIso, contributorSet);
        const resolvedSlot = this._getPrefetchSlot('resolvedDisputes');
        const prefetchFailed = resolvedSlot && resolvedSlot.status === 'error';
        const cacheIncomplete = this._isPrefetchIncomplete('resolvedDisputes');
        if (resolvedRows.length === 0 && (prefetchFailed || cacheIncomplete)) {
            const fetched = await this._fetchTaskDisputesBatch([taskId]);
            resolvedRows = this._filterDisputeRowsForTask(fetched.get(String(taskId)) || [], taskId);
        }
        const combinedDisputes = [...openRows, ...resolvedRows];
        if (combinedDisputes.length > 0) {
            const resolverProfileIds = [];
            for (const row of resolvedRows) {
                if (row && row.resolved_by) resolverProfileIds.push(row.resolved_by);
            }
            if (resolverProfileIds.length > 0) {
                await this._supplementProfilesMap(profilesMap, resolverProfileIds);
            }
            this._mergeBulkDisputesOntoItem(item, combinedDisputes, profilesMap);
            if (!item.kinds.includes('dispute')) {
                item.kinds.push('dispute');
                item.kinds.sort((a, b) => DASH_KIND_MERGE_ORDER.indexOf(a) - DASH_KIND_MERGE_ORDER.indexOf(b));
            }
            changed = true;
        }

        const flagRows = this._getFilteredFlagRows(taskId, scope, afterIso, beforeIso);
        if (flagRows.length > 0) {
            this._mergeBulkFlagsOntoItem(item, flagRows);
            if (!item.kinds.includes('senior_review')) {
                item.kinds.push('senior_review');
                item.kinds.sort((a, b) => DASH_KIND_MERGE_ORDER.indexOf(a) - DASH_KIND_MERGE_ORDER.indexOf(b));
            }
            changed = true;
        }
        return changed;
    },

    async _overlayDisputesAndFlags(items, profilesMap) {
        const list = (items || []).filter((it) => it && it.task && it.task.id);
        if (list.length === 0) return 0;
        const scope = this._state.activeSearchScope || {};
        const afterIso = this._state.activeSearchAfterIso || null;
        const beforeIso = this._state.activeSearchBeforeIso || null;
        const authorIds = this._state.activeSearchAuthorIds
            || (this._state.committed && this._state.committed.authorIds)
            || [];
        const contributorSet = authorIds.length > 0
            ? this._contributorSetFromAuthorIds(authorIds)
            : null;
        let attached = 0;
        for (const item of list) {
            if (await this._overlayDisputesAndFlagsForItem(
                item, profilesMap, scope, afterIso, beforeIso, contributorSet
            )) {
                attached++;
            }
        }
        if (attached > 0) {
            Logger.log('dashboard: dispute/flag overlay — ' + attached + ' card(s)');
        }
        return attached;
    },

    async _reoverlayAllCachedItems() {
        const items = (this._state.cachedItems || []).filter((it) => it && it.hydrated);
        if (items.length === 0) return;
        const profilesMap = this._profilesMapFromHydrateItems(items);
        const changedIds = [];
        for (const item of items) {
            const beforeDisputes = (item.disputes || []).length;
            const beforeFlags = (item.flags || []).length;
            await this._overlayDisputesAndFlags([item], profilesMap);
            const afterDisputes = (item.disputes || []).length;
            const afterFlags = (item.flags || []).length;
            if (afterDisputes !== beforeDisputes || afterFlags !== beforeFlags) {
                changedIds.push(item.id);
            }
        }
        for (const id of changedIds) this._patchTaskCard(id);
        if (changedIds.length > 0) {
            Logger.log('dashboard: prefetch re-overlay — ' + changedIds.length + ' card(s)');
        }
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

    async _fetchProfilesByIds(profileIds, logContext, loadTracker) {
        const chunks = dashPgInChunks(profileIds);
        if (chunks.length === 0) return [];
        const all = [];
        const total = profileIds.length;
        for (const chunk of chunks) {
            if (this._shouldStopSearch()) break;
            const rows = await this._pgQuery('profiles.select_person', {
                id: dashPgInFilter(chunk)
            }, logContext || 'search').catch((e) => {
                Logger.warn('dashboard: profile lookup chunk failed', e);
                return [];
            });
            all.push(...rows);
            if (loadTracker) loadTracker.setCount(all.length, total);
        }
        return all;
    },

    async _fetchTargetProjectMap(targetIds, loadTracker) {
        if (!targetIds || targetIds.length === 0) return new Map();
        const map = new Map();
        const total = targetIds.length;
        for (const chunk of dashPgInChunks(targetIds)) {
            if (this._shouldStopSearch()) break;
            const rows = await this._pgQuery('task_project_targets.select_project_map', {
                id: dashPgInFilter(chunk),
                limit: String(chunk.length)
            }, 'search').catch((e) => { Logger.warn('dashboard: target→project lookup failed', e); return []; });
            for (const r of rows) if (r.id && r.project_id) map.set(r.id, r.project_id);
            if (loadTracker) loadTracker.setCount(map.size, total);
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

    // ── Person search for author tokens ──,

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


    _personChipName(profile, personId) {
        if (!profile) return '';
        const rawName = this._personRawName(profile);
        const id = String(personId || profile.id || '').trim();
        return this._personNameLooksLikeId(rawName, id) ? '' : rawName;
    },


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

    // ── Bootstrap (projects + environments) ──,

    async _runBootstrap() {
        const profileId = this._dashGetCurrentUserId();
        if (!profileId) {
            throw new Error('Fleet user id unavailable. Open Fleet while logged in.');
        }

        const projectsParams = {
            status: 'neq.archived',
            order: 'created_at.desc',
            limit: '400'
        };

        const userTeams = await this._dashFetchUserTeamCatalog(profileId);
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
        if (this._state.bootstrapRunPromise) return this._state.bootstrapRunPromise;
        this._state.bootstrapRunPromise = this._runBootstrapSession();
        return this._state.bootstrapRunPromise;
    },

    async _runBootstrapSession() {
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
            if (this._state.prefetch && DASH_PREFETCH_KINDS.some((k) => {
                const slot = this._state.prefetch[k];
                return slot && slot.status !== 'done';
            })) {
                this._resetAllPrefetchesForRetry();
            }
            this._startPrefetchesOnce();
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

    // ── Worker output search ──,

    async _fetchTargetIdsForProjects(projectIds, loadTracker) {
        if (!projectIds || projectIds.length === 0) return [];
        const ids = [];
        for (const chunk of dashPgInChunks(projectIds)) {
            if (this._shouldStopSearch()) break;
            const rows = await this._pgQuery('task_project_targets.select_ids', {
                project_id: dashPgInFilter(chunk),
                limit: '500'
            }, 'search').catch((e) => { Logger.warn('dashboard: project→target lookup failed', e); return []; });
            for (const r of rows) if (r.id) ids.push(r.id);
            if (loadTracker) loadTracker.setCount(ids.length);
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
                targetIds = await this._trackSearchLoadPromise(
                    'Project targets for ' + projectIds.length + ' project(s)',
                    (tracker) => this._fetchTargetIdsForProjects(projectIds, tracker)
                );
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

    async _fetchTaskRowsForSearch(authorIds, afterIso, beforeIso, scope, loadTracker) {
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
            if (this._shouldStopSearch()) break;
            for (const scopeOverride of scopeVariants) {
                if (this._shouldStopSearch()) break;
                let offset = 0;
                while (true) {
                    if (this._shouldStopSearch()) break;
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
                    if (loadTracker) loadTracker.setCount(byId.size);
                    if (page.length < DASH_TASKS_PAGE_SIZE) break;
                    offset += DASH_TASKS_PAGE_SIZE;
                }
            }
        }
        const allRows = [...byId.values()];
        Logger.debug('dashboard: tasks fetched (' + allRows.length + ' rows)');
        return allRows;
    },

    async _fetchTaskRowsByIds(taskIds, scope, channel, loadTracker) {
        if (!taskIds || taskIds.length === 0) return [];
        const pgChannel = channel || 'search';
        const scopeVariants = this._scopeQueryVariants(scope);
        const byId = new Map();
        const totalIds = taskIds.length;
        for (const chunk of dashPgInChunks(taskIds)) {
            if (this._shouldStopSearch()) break;
            for (const scopeOverride of scopeVariants) {
                if (this._shouldStopSearch()) break;
                const qs = {
                    id: dashPgInFilter(chunk),
                    limit: String(chunk.length)
                };
                if (!this._applyTaskScopeToQs(qs, scope, scopeOverride)) continue;
                const page = await this._pgQuery('tasks.select_search', qs, pgChannel);
                Logger.debug('dashboard: tasks by id chunk — ' + page.length + ' rows');
                for (const row of page) if (row && row.id) byId.set(row.id, row);
                if (loadTracker) loadTracker.setCount(byId.size, totalIds);
            }
        }
        return [...byId.values()];
    },

    async _fetchQaFeedbackRowsForSearch(authorIds, afterIso, beforeIso, scope, loadTracker) {
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
            if (this._shouldStopSearch()) break;
            for (const scopeOverride of scopeVariants) {
                if (this._shouldStopSearch()) break;
                let offset = 0;
                while (true) {
                    if (this._shouldStopSearch()) break;
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
                    if (loadTracker) loadTracker.setCount(allFeedback.length);
                    if (page.length < DASH_QA_PAGE_SIZE) break;
                    offset += DASH_QA_PAGE_SIZE;
                }
            }
        }
        Logger.debug('dashboard: QA feedback rows fetched (' + allFeedback.length + ' total)');
        return allFeedback;
    },

    async _fetchQaFeedbackRowsForTaskIds(taskIds, scope, channel, loadTracker) {
        if (!taskIds || taskIds.length === 0) return [];
        if (scope.hasProjectFilter && scope.targetIds.length === 0) return [];
        const pgChannel = channel || 'search';
        const allFeedback = [];
        const seenFeedbackIds = new Set();
        for (const chunk of dashPgInChunks(taskIds)) {
            if (this._shouldStopSearch()) break;
            const qs = {
                eval_task_id: dashPgInFilter(chunk),
                order: 'created_at.desc',
                limit: '500'
            };
            const page = await this._pgQuery('qa_feedback.select_row', qs, pgChannel);
            Logger.debug('dashboard: QA feedback by task id chunk — ' + page.length + ' rows');
            for (const row of page) {
                if (!row || !row.id || seenFeedbackIds.has(row.id)) continue;
                seenFeedbackIds.add(row.id);
                allFeedback.push(row);
            }
            if (loadTracker) loadTracker.setCount(allFeedback.length);
        }
        return allFeedback;
    },

    async _buildQuickTasksById(taskRows, feedbackRows, options) {
        const opts = options || {};
        const track = opts.trackSearchLoad
            ? (message, promise) => this._trackSearchLoadPromise(message, promise)
            : (_message, promise) => Promise.resolve(promise);
        const taskById = new Map(taskRows.map((row) => [row.id, row]));
        const profileIds = new Set();
        for (const row of taskRows) if (row.created_by) profileIds.add(row.created_by);
        for (const fb of feedbackRows) if (fb.created_by) profileIds.add(fb.created_by);

        const uniqueTargetIds = [...new Set(taskRows.map((r) => r.task_project_target_id).filter(Boolean))];
        const profileIdsArr = [...profileIds];
        const [profileRows, targetToProjectId] = await Promise.all([
            profileIdsArr.length > 0
                ? track(
                    'Contributor profiles (' + profileIdsArr.length + ')',
                    (tracker) => this._fetchProfilesByIds(profileIdsArr, 'search', tracker)
                )
                : Promise.resolve([]),
            uniqueTargetIds.length > 0
                ? track(
                    'Target→project map (' + uniqueTargetIds.length + ')',
                    (tracker) => this._fetchTargetProjectMap(uniqueTargetIds, tracker)
                )
                : Promise.resolve(new Map())
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
        for (const fb of feedbackRows || []) {
            const task = quickTasksById.get(fb.eval_task_id);
            if (!task || !fb.created_at) continue;
            task.allFeedback.push({
                id: String(fb.id || ''),
                feedbackAt: String(fb.created_at || '')
            });
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
                disputes: [],
                flags: []
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
            disputes: [],
            flags: []
        }));
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

    _mergeSupplementalTaskRows(creationRows, qaOnlyRows) {
        const allTaskRows = [...(creationRows || [])];
        const seenIds = new Set(allTaskRows.map((r) => r.id));
        for (const row of qaOnlyRows || []) {
            if (row && row.id && !seenIds.has(row.id)) {
                seenIds.add(row.id);
                allTaskRows.push(row);
            }
        }
        return allTaskRows;
    },

    async _assembleWorkerOutputSearchResult(options) {
        const opts = options || {};
        const {
            includeTaskCreation,
            includeQa,
            includeDisputes,
            includeSeniorReview,
            creationRows,
            feedbackRows,
            qaOnlyRows,
            prefetchDisputeItems,
            prefetchFlagItems,
            afterIso,
            beforeIso,
            openDisputesByTaskId,
            resolvedDisputeAtByTaskId,
            scope,
            authorIds,
            searchDepth
        } = opts;
        const allTaskRows = this._mergeSupplementalTaskRows(creationRows, qaOnlyRows);
        let allFeedbackRows = Array.isArray(opts.allFeedbackRows)
            ? opts.allFeedbackRows.slice()
            : [...(feedbackRows || [])];

        const items = [];
        const prefetchItems = [
            ...(prefetchDisputeItems || []),
            ...(prefetchFlagItems || [])
        ];
        if (prefetchItems.length > 0) {
            items.push(...prefetchItems);
        }

        if (allTaskRows.length > 0 || allFeedbackRows.length > 0) {
            this._setSearchLoadPhase('Assembling results…', allTaskRows.length);
            const { enrichedTasksById, profilesMap } = await this._buildQuickTasksById(allTaskRows, allFeedbackRows, {
                trackSearchLoad: true
            });

            if (includeTaskCreation) {
                const creationTasks = (creationRows || [])
                    .map((row) => enrichedTasksById.get(row.id))
                    .filter(Boolean);
                items.push(...this._taskCreationItemsFromTasks(creationTasks));
                Logger.log('dashboard: task creation items built — ' + creationTasks.length);
            }
            if (includeQa && (feedbackRows || []).length > 0) {
                items.push(...this._qaItemsFromFeedbackRows(feedbackRows, enrichedTasksById, profilesMap));
            }
        } else if (items.length > 0) {
            this._setSearchLoadPhase('Assembling results…', items.length);
        }

        this._setSearchLoadPhase('Assembling result cards…', items.length);
        let mergedItems = this._mergeWorkerOutputItemsByTask(items);
        const dateFilter = this._filterCardsBySearchDateRange(
            mergedItems,
            afterIso,
            beforeIso,
            allFeedbackRows,
            openDisputesByTaskId || new Map(),
            resolvedDisputeAtByTaskId || new Map()
        );
        mergedItems = dateFilter.items;
        const keptTaskIds = new Set(mergedItems.map((it) => it.task.id));
        allFeedbackRows = this._filterFeedbackRowsForTaskIds(allFeedbackRows, keptTaskIds);
        this._trimOpenDisputesToTarget(keptTaskIds);

        const resultItems = mergedItems.map((item) => Object.assign({}, item, {
            hydrated: item.hydrated === true,
            flags: item.flags || []
        }));

        return {
            items: resultItems,
            allFeedbackRows,
            includeQa,
            includeDisputes,
            includeSeniorReview
        };
    },

    async _fetchWorkerOutputSearch({
        authorIds,
        includeTaskCreation,
        includeQa,
        includeDisputes,
        includeSeniorReview,
        afterIso,
        beforeIso,
        scope,
        searchDepth
    }) {
        this._state.activeSearchScope = scope;
        this._state.activeSearchAfterIso = afterIso;
        this._state.activeSearchBeforeIso = beforeIso;
        this._state.activeSearchAuthorIds = authorIds || [];

        const preserveDisputeState = this._isAdditiveResultsMode()
            && Array.isArray(this._state.resultsLoadSnapshot)
            && this._state.resultsLoadSnapshot.length > 0;
        if (!preserveDisputeState) {
            this._state.disputesBulkIncomplete = false;
            this._state.flagsBulkIncomplete = false;
            this._state.openDisputesByTaskId = new Map();
            this._state.resolvedDisputeTaskIds = new Set();
            this._state.resolvedDisputeAtByTaskId = new Map();
            this._state.resolverDisputeTaskIds = new Set();
        }

        this._setSearchLoadPhase(this._searchFetchSourcesLabel({
            includeTaskCreation,
            includeQa,
            includeDisputes,
            includeSeniorReview
        }));

        await this._awaitPrefetchKindsForSearch({ includeDisputes, includeSeniorReview });

        if (searchDepth === 'deep') {
            const extraKinds = DASH_PREFETCH_KINDS.filter((kind) => {
                if (includeDisputes && (kind === 'openDisputes' || kind === 'resolvedDisputes')) return false;
                if (includeSeniorReview && (kind === 'pendingFlags' || kind === 'resolvedFlags')) return false;
                return true;
            });
            if (extraKinds.length > 0) {
                await Promise.all(extraKinds.map((kind) => this._trackSearchLoadPromise(
                    'Prefetch ' + this._prefetchLabel(kind),
                    (tracker) => this._ensurePrefetch(kind, tracker)
                )));
            }
        }

        const contributorSet = authorIds.length > 0 ? this._contributorSetFromAuthorIds(authorIds) : null;

        let prefetchDisputeItems = [];
        let prefetchFlagItems = [];
        let disputeBootstrap = null;

        if (includeDisputes) {
            const groupedDisputes = this._scanPrefetchDisputeRows(scope, afterIso, beforeIso, contributorSet);
            const disputeProfileIds = this._collectPrefetchDisputeProfileIds(groupedDisputes);
            const disputeProfiles = disputeProfileIds.length > 0
                ? await this._trackSearchLoadPromise(
                    'Contributor profiles for disputes (' + disputeProfileIds.length + ')',
                    (tracker) => this._fetchProfilesByIds(disputeProfileIds, 'search', tracker)
                )
                : [];
            prefetchDisputeItems = this._buildPrefetchHydratedDisputeItems(
                groupedDisputes,
                this._buildProfilesMap(disputeProfiles),
                scope
            );
            disputeBootstrap = this._deriveDisputeBootstrap(scope, afterIso, beforeIso, contributorSet);
            this._state.openDisputesByTaskId = disputeBootstrap.openDisputesByTaskId;
            this._state.resolvedDisputeTaskIds = disputeBootstrap.resolvedDisputeTaskIds;
            this._state.resolvedDisputeAtByTaskId = disputeBootstrap.resolvedDisputeAtByTaskId;
            this._state.disputesBulkIncomplete = disputeBootstrap.bulkIncomplete;
            this._state.resolverDisputeTaskIds = new Set(disputeBootstrap.resolvedDisputeTaskIds);
        }

        if (includeSeniorReview) {
            const groupedFlags = this._scanPrefetchFlagRows(scope, afterIso, beforeIso, contributorSet);
            const flagProfileIds = this._collectPrefetchFlagProfileIds(groupedFlags);
            const flagProfiles = flagProfileIds.length > 0
                ? await this._trackSearchLoadPromise(
                    'Contributor profiles for flags (' + flagProfileIds.length + ')',
                    (tracker) => this._fetchProfilesByIds(flagProfileIds, 'search', tracker)
                )
                : [];
            prefetchFlagItems = this._buildPrefetchHydratedFlagItems(
                groupedFlags,
                this._buildProfilesMap(flagProfiles),
                scope
            );
            this._state.flagsBulkIncomplete = this._isAnyPrefetchIncomplete(['pendingFlags', 'resolvedFlags']);
        }

        const tasksPromise = includeTaskCreation
            ? this._trackSearchLoadPromise(
                'Task creation rows',
                (tracker) => this._fetchTaskRowsForSearch(authorIds, afterIso, beforeIso, scope, tracker)
            )
            : Promise.resolve([]);
        const qaPromise = includeQa
            ? this._trackSearchLoadPromise(
                'QA feedback rows',
                (tracker) => this._fetchQaFeedbackRowsForSearch(authorIds, afterIso, beforeIso, scope, tracker)
            )
            : Promise.resolve([]);

        const [creationRows, feedbackRows] = await Promise.all([tasksPromise, qaPromise]);

        const assembleBase = {
            includeTaskCreation,
            includeQa,
            includeDisputes,
            includeSeniorReview,
            creationRows: creationRows || [],
            feedbackRows: feedbackRows || [],
            prefetchDisputeItems,
            prefetchFlagItems,
            afterIso,
            beforeIso,
            scope,
            authorIds,
            searchDepth
        };

        if (this._shouldStopSearch()) {
            const emptyBootstrap = {
                openDisputesByTaskId: new Map(),
                resolvedDisputeAtByTaskId: new Map()
            };
            const partialBootstrap = disputeBootstrap || emptyBootstrap;
            return this._assembleWorkerOutputSearchResult(Object.assign({}, assembleBase, {
                qaOnlyRows: [],
                allFeedbackRows: feedbackRows || [],
                openDisputesByTaskId: partialBootstrap.openDisputesByTaskId || new Map(),
                resolvedDisputeAtByTaskId: partialBootstrap.resolvedDisputeAtByTaskId || new Map()
            }));
        }

        const creationIds = new Set((creationRows || []).map((r) => r.id));
        const qaTaskIds = [...new Set((feedbackRows || []).map((f) => f.eval_task_id).filter(Boolean))];
        const missingQaTaskIds = qaTaskIds.filter((id) => !creationIds.has(id));
        if (missingQaTaskIds.length > 0) {
            this._setSearchLoadPhase('Loading linked tasks…', missingQaTaskIds.length);
        }
        const qaOnlyRows = missingQaTaskIds.length > 0 && !this._shouldStopSearch()
            ? await this._trackSearchLoadPromise(
                'Tasks from QA (' + missingQaTaskIds.length + ' id(s))',
                (tracker) => this._fetchTaskRowsByIds(missingQaTaskIds, scope, undefined, tracker)
            )
            : [];

        return this._assembleWorkerOutputSearchResult(Object.assign({}, assembleBase, {
            qaOnlyRows,
            allFeedbackRows: feedbackRows || [],
            openDisputesByTaskId: disputeBootstrap
                ? disputeBootstrap.openDisputesByTaskId
                : (this._state.openDisputesByTaskId || new Map()),
            resolvedDisputeAtByTaskId: disputeBootstrap
                ? disputeBootstrap.resolvedDisputeAtByTaskId
                : (this._state.resolvedDisputeAtByTaskId || new Map())
        }));
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
                    disputes: [],
                    flags: []
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
            if (item.flags && item.flags.length > 0) {
                const seenFlags = new Set(merged.flags.map((f) => f.id));
                for (const f of item.flags) {
                    if (!f.id || seenFlags.has(f.id)) continue;
                    seenFlags.add(f.id);
                    merged.flags.push(f);
                }
            }
            if (item.hydrated === false) {
                if (merged.hydrated !== true) merged.hydrated = false;
            } else if (item.hydrated !== false) {
                merged.hydrated = true;
                const mergedVers = (merged.task.promptVersions || []).length;
                const itemVers = (item.task.promptVersions || []).length;
                if (itemVers > mergedVers) merged.task = item.task;
            } else if (merged.hydrated === undefined) {
                merged.hydrated = item.hydrated !== false;
            }
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
                flags: merged.flags,
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
            promptHistory: (opts.promptHistory || []).map((h) => h.id),
            qaHelpfulness: (opts.qaHelpfulness || []).map((h) => h.id)
        };
    },

    _buildQaHelpfulnessFilterOptions(scopeItems) {
        const lib = dashLib();
        const uiMap = this._state.helpfulnessUi || {};
        const present = new Set();
        for (const item of scopeItems || []) {
            for (const flag of lib.itemQaHelpfulness(item, uiMap, this._dashGetCurrentUserId())) {
                present.add(flag);
            }
        }
        return (lib.QA_HELPFULNESS_ORDER || [])
            .filter((id) => present.has(id))
            .map((id) => ({
                id,
                label: (lib.QA_HELPFULNESS_LABELS && lib.QA_HELPFULNESS_LABELS[id]) || id
            }));
    },

    _refreshHelpfulnessFilterUi() {
        if (!this._state.cachedItems) return;
        this._refreshResultsView({ filterSource: 'results-mutate', reindexFilters: true });
    },

    _isDimensionUnrestricted(selected, boundIds) {
        const bounds = boundIds || [];
        if (bounds.length === 0) return true;
        const sel = selected || [];
        return sel.length === 0 || sel.length >= bounds.length;
    },

    _isDimensionAllSelected(selected, boundIds) {
        return this._isDimensionUnrestricted(selected, boundIds);
    },

    _normalizeFilterDimensionSelection(selected, boundIds) {
        return this._isDimensionUnrestricted(selected, boundIds) ? [] : [...(selected || [])];
    },

    _filterDimensionEquivalent(draftSel, appliedSel, boundIds) {
        const draftNorm = this._normalizeFilterDimensionSelection(draftSel, boundIds);
        const appliedNorm = this._normalizeFilterDimensionSelection(appliedSel, boundIds);
        return this._filterArraysEqual(draftNorm, appliedNorm);
    },

    _expandAppliedForBoundsGrowth(applied, prevBounds, newBounds) {
        const next = Object.assign({}, applied);
        for (const { draftKey } of DASH_FILTER_SCOPES) {
            const prevBoundIds = prevBounds[draftKey] || [];
            const newBoundIds = newBounds[draftKey] || [];
            const appliedSel = (applied[draftKey] || []);
            if (this._isDimensionUnrestricted(appliedSel, prevBoundIds)) {
                next[draftKey] = [];
                continue;
            }
            if (prevBoundIds.length === 0 && newBoundIds.length > 0) {
                next[draftKey] = [];
            } else if (newBoundIds.length > prevBoundIds.length) {
                next[draftKey] = appliedSel.filter((id) => newBoundIds.includes(id));
            }
        }
        return next;
    },

    _checkedIdsForFilterScope(draftKey, optionIds, applied, prevBounds, listBounds, prevSelected, syncFromApplied) {
        const boundIds = listBounds[draftKey] || [];
        const appliedSel = (applied && applied[draftKey]) || [];

        if (!syncFromApplied && prevSelected !== null) {
            return prevSelected;
        }

        if (this._isDimensionUnrestricted(appliedSel, boundIds)) {
            return new Set();
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

    _readResultsModePref() {
        try {
            const v = this._pageWindow().localStorage.getItem(DASH_RESULTS_MODE_STORAGE_KEY);
            if (v === 'add' || v === 'clear') return v;
        } catch (_e) { /* ignore */ }
        return 'clear';
    },

    _persistResultsModePref(mode) {
        try {
            this._pageWindow().localStorage.setItem(
                DASH_RESULTS_MODE_STORAGE_KEY,
                mode === 'add' ? 'add' : 'clear'
            );
        } catch (e) {
            Logger.debug('dashboard: could not persist results mode', e);
        }
    },

    _isAdditiveResultsMode() {
        return (this._state && this._state.resultsMode) === 'add';
    },

    _resultsModeToggleHtml(hintKey) {
        const label = this._labelStyle();
        return `<div style="margin-top: 4px; margin-bottom: 10px;">
            <div style="${label} margin-bottom: 6px; font-weight: 600;">Results mode</div>
            <div style="display: flex; width: 100%; gap: 8px;">
                <button type="button" data-wf-dash-results-mode="clear" aria-pressed="true" style="${this._btnDepthSegmentStyle(true)}">Clear</button>
                <button type="button" data-wf-dash-results-mode="add" aria-pressed="false" style="${this._btnDepthSegmentStyle(false)}">Add</button>
            </div>
            <div data-wf-dash-results-mode-hint="${dashEscHtml(hintKey)}" style="margin-top: 8px;"></div>
        </div>`;
    },

    _syncResultsModeHint() {
        const mode = this._state.resultsMode || 'clear';
        const hint = this._hintStyle();
        const text = DASH_RESULTS_MODE_HINTS[mode] || '';
        const modal = this._modal;
        if (!modal) return;
        modal.querySelectorAll('[data-wf-dash-results-mode-hint]').forEach((el) => {
            el.innerHTML = `<span style="${hint} line-height: 1.4;">${dashEscHtml(text)}</span>`;
        });
    },

    _syncResultsModeUi() {
        const mode = this._state.resultsMode || this._readResultsModePref();
        this._state.resultsMode = mode === 'add' ? 'add' : 'clear';
        const modal = this._modal;
        if (!modal) return;
        modal.querySelectorAll('[data-wf-dash-results-mode]').forEach((btn) => {
            const btnMode = btn.getAttribute('data-wf-dash-results-mode');
            const active = btnMode === this._state.resultsMode;
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.style.cssText = this._btnDepthSegmentStyle(active);
        });
        this._syncResultsModeHint();
    },

    _setResultsMode(mode) {
        const next = mode === 'add' ? 'add' : 'clear';
        this._state.resultsMode = next;
        this._persistResultsModePref(next);
        this._syncResultsModeUi();
        Logger.log('dashboard: results mode — ' + next);
    },

    _cloneOpenDisputesMap(map) {
        const src = map || new Map();
        const out = new Map();
        for (const [taskId, rows] of src) {
            out.set(taskId, Array.isArray(rows) ? rows.slice() : rows);
        }
        return out;
    },

    _snapshotDisputeState() {
        const open = this._state.openDisputesByTaskId;
        const resolvedAt = this._state.resolvedDisputeAtByTaskId;
        return {
            openDisputesByTaskId: open ? this._cloneOpenDisputesMap(open) : null,
            resolvedDisputeTaskIds: this._state.resolvedDisputeTaskIds
                ? new Set(this._state.resolvedDisputeTaskIds) : null,
            resolvedDisputeAtByTaskId: resolvedAt ? new Map(resolvedAt) : null,
            resolverDisputeTaskIds: this._state.resolverDisputeTaskIds
                ? new Set(this._state.resolverDisputeTaskIds) : null,
            disputesBulkIncomplete: Boolean(this._state.disputesBulkIncomplete),
            flagsBulkIncomplete: Boolean(this._state.flagsBulkIncomplete)
        };
    },

    _mergeOpenDisputesMaps(baseMap, extraMap) {
        const out = this._cloneOpenDisputesMap(baseMap || new Map());
        for (const [taskId, rows] of (extraMap || new Map())) {
            const bucket = out.get(taskId) || [];
            const seen = new Set(bucket.map((r) => r && r.id).filter(Boolean));
            for (const row of rows || []) {
                if (row && row.id != null && !seen.has(row.id)) {
                    seen.add(row.id);
                    bucket.push(row);
                }
            }
            if (bucket.length > 0) out.set(taskId, bucket);
        }
        return out;
    },

    _mergeDisputeStateSnapshot(snapshot, current) {
        const snap = snapshot || {};
        const cur = current || {};
        const openBase = snap.openDisputesByTaskId || new Map();
        const openExtra = cur.openDisputesByTaskId || new Map();
        this._state.openDisputesByTaskId = this._mergeOpenDisputesMaps(openBase, openExtra);

        const resolvedIds = new Set([
            ...(snap.resolvedDisputeTaskIds || []),
            ...(cur.resolvedDisputeTaskIds || [])
        ]);
        this._state.resolvedDisputeTaskIds = resolvedIds;

        const resolverIds = new Set([
            ...(snap.resolverDisputeTaskIds || []),
            ...(cur.resolverDisputeTaskIds || [])
        ]);
        this._state.resolverDisputeTaskIds = resolverIds;

        const atMap = new Map(snap.resolvedDisputeAtByTaskId || []);
        for (const [taskId, at] of (cur.resolvedDisputeAtByTaskId || new Map())) {
            const prev = atMap.get(taskId);
            if (!prev || at > prev) atMap.set(taskId, at);
        }
        this._state.resolvedDisputeAtByTaskId = atMap;
        this._state.disputesBulkIncomplete = Boolean(snap.disputesBulkIncomplete || cur.disputesBulkIncomplete);
        this._state.flagsBulkIncomplete = Boolean(snap.flagsBulkIncomplete || cur.flagsBulkIncomplete);
    },

    _restoreDisputeStateSnapshot(snapshot) {
        if (!snapshot) return;
        this._state.openDisputesByTaskId = snapshot.openDisputesByTaskId
            ? this._cloneOpenDisputesMap(snapshot.openDisputesByTaskId) : null;
        this._state.resolvedDisputeTaskIds = snapshot.resolvedDisputeTaskIds
            ? new Set(snapshot.resolvedDisputeTaskIds) : null;
        this._state.resolvedDisputeAtByTaskId = snapshot.resolvedDisputeAtByTaskId
            ? new Map(snapshot.resolvedDisputeAtByTaskId) : null;
        this._state.resolverDisputeTaskIds = snapshot.resolverDisputeTaskIds
            ? new Set(snapshot.resolverDisputeTaskIds) : null;
        this._state.disputesBulkIncomplete = Boolean(snapshot.disputesBulkIncomplete);
        this._state.flagsBulkIncomplete = Boolean(snapshot.flagsBulkIncomplete);
    },

    _beginResultsLoad() {
        const additive = this._isAdditiveResultsMode();
        this._state.resultsKindTab = 'all';
        this._state.resultsPage = 0;
        this._state.hasSearched = true;
        this._state.loading = true;
        this._state.hydrateBulkActive = false;
        this._state.autoHydrateActive = false;
        this._state.autoHydrateScheduled = false;
        this._state.autoHydratePending = false;
        this._state.autoHydratePendingLogged = false;

        if (additive && this._state.cachedItems && this._state.cachedItems.length > 0) {
            this._state.resultsLoadSnapshot = this._state.cachedItems.slice();
            this._state.disputeLoadSnapshot = this._snapshotDisputeState();
        } else {
            this._state.resultsLoadSnapshot = null;
            this._state.disputeLoadSnapshot = null;
            this._state.cachedItems = null;
            this._state.filteredItems = null;
            this._state.appliedFilters = null;
            this._state.disputesBulkIncomplete = false;
            this._state.flagsBulkIncomplete = false;
            this._state.openDisputesByTaskId = null;
            this._state.resolvedDisputeTaskIds = null;
            this._state.resolvedDisputeAtByTaskId = null;
            this._state.resolverDisputeTaskIds = null;
        }
    },

    _restoreResultsLoadSnapshotOnError() {
        if (this._isAdditiveResultsMode() && Array.isArray(this._state.resultsLoadSnapshot)) {
            this._state.cachedItems = this._state.resultsLoadSnapshot.slice();
            this._restoreDisputeStateSnapshot(this._state.disputeLoadSnapshot);
        } else {
            this._state.cachedItems = null;
            this._state.filteredItems = null;
            this._state.appliedFilters = null;
        }
        this._state.resultsLoadSnapshot = null;
        this._state.disputeLoadSnapshot = null;
    },

    _resetResultsLoadFilterUi(mergedItems) {
        const prompt = this._q('#wf-dash-prompt');
        if (prompt) prompt.value = '';
        const caseEl = this._q('#wf-dash-case');
        if (caseEl) caseEl.checked = false;
        const fuzzyEl = this._q('#wf-dash-fuzzy');
        if (fuzzyEl) fuzzyEl.checked = false;
        const regexEl = this._q('#wf-dash-regex');
        if (regexEl) regexEl.checked = false;
        const sortEl = this._q('#wf-dash-sort');
        if (sortEl) sortEl.value = DASH_SORT_DEFAULT;
        this._resetManualFilters();
        this._resetFilterDraftsFromResults(mergedItems || this._state.cachedItems || []);
        this._applyResultsPageSizeForNewSearch();
        this._state.resultsKindTab = 'all';
        this._state.resultsPage = 0;
    },

    _preferRicherSearchResultItem(a, b) {
        if (!a) return b;
        if (!b) return a;
        const aHydr = a.hydrated !== false;
        const bHydr = b.hydrated !== false;
        if (aHydr && !bHydr) return a;
        if (bHydr && !aHydr) return b;
        const aVers = (a.task && a.task.promptVersions) ? a.task.promptVersions.length : 0;
        const bVers = (b.task && b.task.promptVersions) ? b.task.promptVersions.length : 0;
        if (bVers > aVers) return b;
        if (aVers > bVers) return a;
        return b;
    },

    _mergeAdditiveSearchResults(previous, incoming) {
        const prev = previous || [];
        const inc = incoming || [];
        if (prev.length === 0) return this._mergeWorkerOutputItemsByTask(inc.slice());
        if (inc.length === 0) return this._mergeWorkerOutputItemsByTask(prev.slice());
        const incomingTaskIds = new Set(inc.map((it) => it && it.task && it.task.id).filter(Boolean));
        const prevOnly = prev.filter((it) => it && it.task && !incomingTaskIds.has(it.task.id));
        const dedupedIncoming = [];
        const seenIncoming = new Map();
        for (const item of inc) {
            if (!item || !item.task || !item.task.id) continue;
            const taskId = item.task.id;
            const existing = seenIncoming.get(taskId);
            seenIncoming.set(taskId, existing ? this._preferRicherSearchResultItem(existing, item) : item);
        }
        for (const item of seenIncoming.values()) dedupedIncoming.push(item);
        return this._mergeWorkerOutputItemsByTask([...prevOnly, ...dedupedIncoming]);
    },

    _kindsUnionFromItems(items) {
        const kindSet = new Set();
        for (const item of items || []) {
            for (const k of ((item && item.kinds && item.kinds.length) ? item.kinds : [item && item.kind])) {
                if (k) kindSet.add(k);
            }
        }
        return kindSet;
    },

    _syncCommittedFromCachedItems() {
        const items = this._state.cachedItems || [];
        const kindSet = this._kindsUnionFromItems(items);
        const prev = this._state.committed || {};
        this._state.committed = {
            accumulatedResults: true,
            retrieveMode: false,
            includeTaskCreation: kindSet.has('task_creation'),
            includeQa: kindSet.has('qa'),
            includeDisputes: kindSet.has('dispute'),
            includeSeniorReview: kindSet.has('senior_review'),
            searchDepth: prev.searchDepth || this._state.searchDepth || 'quick',
            authorCount: 0,
            authorLabels: [],
            searchKinds: DASH_KIND_MERGE_ORDER.filter((k) => kindSet.has(k))
        };
    },

    _finalizeResultsLoad(newItems, options) {
        const opts = options || {};
        const snapshot = this._state.resultsLoadSnapshot;
        const additive = this._isAdditiveResultsMode() && Array.isArray(snapshot);
        let merged;
        if (additive) {
            merged = this._mergeAdditiveSearchResults(snapshot, newItems || []);
            this._mergeDisputeStateSnapshot(this._state.disputeLoadSnapshot, this._snapshotDisputeState());
        } else {
            merged = newItems || [];
        }
        this._state.cachedItems = merged;
        this._state.resultsLoadSnapshot = null;
        this._state.disputeLoadSnapshot = null;

        if (additive && snapshot.length > 0) {
            this._syncCommittedFromCachedItems();
        } else if (opts.committed) {
            this._state.committed = opts.committed;
        }

        this._resetResultsLoadFilterUi(merged);
        if (merged.length > 0 && !opts.skipFiltersTab) {
            this._setLeftTab('filters');
        }
        return merged;
    },

    _committedSearchKinds(committed) {
        if (!committed) return [];
        const kinds = [];
        if (committed.includeTaskCreation) kinds.push('task_creation');
        if (committed.includeQa) kinds.push('qa');
        if (committed.includeDisputes) kinds.push('dispute');
        if (committed.includeSeniorReview) kinds.push('senior_review');
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
                dispute: 'All/Disputes',
                senior_review: 'All/Sr Review'
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
            this._getSearchableTeamCatalog()
        );
        options.qaHelpfulness = this._buildQaHelpfulnessFilterOptions(scopeItems);
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

    _isFilterDraftValid(draft) {
        return Boolean(draft);
    },

    _buildManualFilterRow(opts) {
        const rowsEl = this._q('#wf-dash-manual-rows');
        if (!rowsEl) return;
        const inputStyle = this._inputStyle() + ' padding: 4px 8px; font-size: 11px;';
        const selectStyle = inputStyle;
        const row = document.createElement('div');
        row.innerHTML = dashManualFilterRowHtml({
            field: opts && opts.field,
            comparator: opts && opts.comparator,
            value: opts && opts.value,
            selectStyle,
            inputStyle,
            removeBtnStyle: ''
        });
        const rowEl = row.firstElementChild;
        if (rowEl) rowsEl.appendChild(rowEl);
        Logger.debug('search-output: manual filter row added');
    },

    _resetManualFilters() {
        const rowsEl = this._q('#wf-dash-manual-rows');
        if (rowsEl) rowsEl.innerHTML = '';
        const andOrToggle = this._q('#wf-dash-manual-andor');
        if (andOrToggle) andOrToggle.checked = false;
        this._buildManualFilterRow({ field: DASH_MANUAL_FILTER_DEFAULT_FIELD });
    },

    _readSearchOutputManualFilters() {
        const rowsEl = this._q('#wf-dash-manual-rows');
        const andOrToggle = this._q('#wf-dash-manual-andor');
        const andOr = andOrToggle && andOrToggle.checked ? 'or' : 'and';
        const rows = [];
        if (!rowsEl) return { rows, andOr };
        const lib = dashLib();
        rowsEl.querySelectorAll('[data-wf-dash-manual-row]').forEach((rowEl) => {
            const fieldEl = rowEl.querySelector('[data-wf-dash-manual-field]');
            const compEl = rowEl.querySelector('[data-wf-dash-manual-comparator]');
            const valueEl = rowEl.querySelector('[data-wf-dash-manual-value]');
            const field = fieldEl ? fieldEl.value : '';
            const comparator = compEl ? compEl.value : '';
            const raw = valueEl ? valueEl.value.trim() : '';
            if (!field || !comparator || raw === '') return;
            const fieldMeta = DASH_OUTPUT_MANUAL_FILTER_FIELDS.find((f) => f.id === field);
            const isDate = fieldMeta && fieldMeta.type === 'date';
            let value;
            if (isDate) {
                const iso = lib.dateLocalToIso(raw, 'after');
                if (!iso) return;
                value = Date.parse(iso);
                if (!Number.isFinite(value)) return;
                rows.push({ field, comparator, value, valueType: 'date', dateLocal: raw });
            } else {
                value = Number(raw);
                if (!Number.isFinite(value)) return;
                rows.push({ field, comparator, value, valueType: 'number' });
            }
        });
        return { rows, andOr };
    },

    _displayPromptVersionCount(task) {
        const versions = (task && task.promptVersions) || [];
        if (versions.length === 0) return 1;
        const lib = dashLib();
        if (versions[0].displayVersionNo != null) {
            return versions.length;
        }
        const rawLike = versions.map((v) => ({
            id: v.id,
            version_no: v.version_no != null ? v.version_no : v.versionNo,
            created_at: v.created_at != null ? v.created_at : v.createdAt,
            prompt: v.prompt,
            env_key: v.env_key != null ? v.env_key : v.envKey
        }));
        return lib.computeDisplayVersions(rawLike).length;
    },

    _searchOutputManualFilterValue(item, fieldId) {
        const task = item && item.task;
        if (!task) return null;
        switch (fieldId) {
            case 'prompt_word_count':
                return dashManualFilterWordCount(task.prompt);
            case 'rejection_issue_count':
                return ((item.qaFeedback && item.qaFeedback.rejectionBadges) || []).length;
            case 'prompt_version_count':
                if (!item.hydrated) return 1;
                return this._displayPromptVersionCount(task);
            default:
                return null;
        }
    },

    _manualFilterSameLocalDay(actualMs, filterDayStartMs) {
        const a = new Date(actualMs);
        const b = new Date(filterDayStartMs);
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    },

    _manualFilterDayEndMs(dayStartMs) {
        const d = new Date(dayStartMs);
        d.setHours(23, 59, 59, 999);
        return d.getTime();
    },

    _evaluateManualFilterComparator(actual, comparator, expected, valueType) {
        if (actual == null || !Number.isFinite(actual)) return null;
        if (!Number.isFinite(expected)) return false;
        if (valueType === 'date') {
            const dayEnd = this._manualFilterDayEndMs(expected);
            switch (comparator) {
                case 'gt': return actual > dayEnd;
                case 'gte': return actual >= expected;
                case 'lt': return actual < expected;
                case 'lte': return actual <= dayEnd;
                case 'eq': return this._manualFilterSameLocalDay(actual, expected);
                case 'neq': return !this._manualFilterSameLocalDay(actual, expected);
                default: return true;
            }
        }
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

    _itemPassesManualFilters(item, rows, andOr) {
        if (!rows || rows.length === 0) return true;
        const results = rows.map((row) => {
            const actual = this._searchOutputManualFilterValue(item, row.field);
            if (actual == null || !Number.isFinite(actual)) return null;
            return this._evaluateManualFilterComparator(
                actual, row.comparator, row.value, row.valueType || 'number'
            );
        });
        if (results.some((r) => r === null)) return true;
        if (andOr === 'or') return results.some((r) => r === true);
        return results.every((r) => r === true);
    },

    _applyManualFiltersToResult(items, manualRows, andOr) {
        if (!manualRows || manualRows.length === 0) return items;
        return items.filter((item) => this._itemPassesManualFilters(item, manualRows, andOr));
    },

    _manualFilterRowsEqual(a, b) {
        const left = a || [];
        const right = b || [];
        if (left.length !== right.length) return false;
        for (let i = 0; i < left.length; i++) {
            const l = left[i];
            const r = right[i];
            if (l.field !== r.field || l.comparator !== r.comparator || l.value !== r.value) return false;
        }
        return true;
    },

    _syncResultsToolbarDerivedUi() {
        this._syncResultsRangeCountUi();
        this._syncBulkHydrateUi();
        this._syncDropExcludedUi();
    },

    _syncDropExcludedUi() {
        const btn = this._q('#wf-dash-drop-excluded');
        if (!btn) return;
        const cached = this._state.cachedItems;
        const filtered = this._state.filteredItems;
        const show = !this._state.loading
            && cached !== null && filtered !== null
            && this._hasActiveFilters()
            && filtered.length < cached.length;
        btn.style.display = show ? '' : 'none';
    },

    _dropExcludedResults() {
        const filtered = this._state.filteredItems;
        const cached = this._state.cachedItems;
        if (!filtered || !cached || filtered.length >= cached.length) return;
        const dropped = cached.length - filtered.length;
        const keptIds = new Set(filtered.map((it) => it.id));
        this._state.cachedItems = filtered.slice();
        const newHydrateUi = {};
        for (const id of Object.keys(this._state.hydrateUi || {})) {
            if (keptIds.has(id)) newHydrateUi[id] = this._state.hydrateUi[id];
        }
        this._state.hydrateUi = newHydrateUi;
        const newUserStoryUi = {};
        for (const id of Object.keys(this._state.userStoryUi || {})) {
            if (keptIds.has(id)) newUserStoryUi[id] = this._state.userStoryUi[id];
        }
        this._state.userStoryUi = newUserStoryUi;
        this._refreshResultsView({ resetPage: true, reindexFilters: true, filterSource: 'search-defaults' });
        Logger.log('search-output: dropped ' + dropped + ' excluded result(s) from cache — '
            + filtered.length + ' remaining');
    },

    _dropResultFromSearch(itemId) {
        const id = String(itemId || '').trim();
        if (!id) return;
        const cached = this._state.cachedItems;
        if (!cached) return;
        const item = cached.find((it) => it.id === id);
        if (!item) return;
        this._state.cachedItems = cached.filter((it) => it.id !== id);
        if (this._state.hydrateUi) delete this._state.hydrateUi[id];
        if (this._state.userStoryUi) delete this._state.userStoryUi[id];
        const taskId = item.task && item.task.id;
        if (taskId && this._state.cardUi) {
            const stillHasTask = this._state.cachedItems.some((it) => it.task && it.task.id === taskId);
            if (!stillHasTask) delete this._state.cardUi[taskId];
        }
        this._refreshResultsView({ reindexFilters: true, filterSource: 'results-mutate' });
        Logger.log('search-output: removed result from search — ' + id);
    },

    _pruneFiltersToBounds(filters, bounds) {
        const next = Object.assign({}, filters);
        const b = bounds || {};
        for (const { draftKey } of DASH_FILTER_SCOPES) {
            const boundIds = b[draftKey] || [];
            const sel = (filters && filters[draftKey]) || [];
            if (boundIds.length === 0) {
                next[draftKey] = [];
            } else if (this._isDimensionUnrestricted(sel, boundIds)) {
                next[draftKey] = [];
            } else {
                next[draftKey] = sel.filter((id) => boundIds.includes(id));
            }
        }
        return next;
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
        const sort = this._readDashSortFromUi();
        return {
            teamIds: [],
            projectIds: [],
            envKeys: [],
            statuses: [],
            contributorIds: [],
            promptRatings: [],
            taskIssues: [],
            returnTypes: [],
            promptHistory: [],
            qaHelpfulness: [],
            promptText: (this._q('#wf-dash-prompt') || {}).value || '',
            fuzzy: Boolean((this._q('#wf-dash-fuzzy') || {}).checked),
            regex: Boolean((this._q('#wf-dash-regex') || {}).checked),
            caseSensitive: Boolean((this._q('#wf-dash-case') || {}).checked),
            sortMetric: sort.sortMetric,
            sortOrder: sort.sortOrder,
            manualFilters: [],
            manualAndOr: 'and'
        };
    },

    _parseDashSortValue(raw) {
        const value = String(raw || DASH_SORT_DEFAULT);
        const match = DASH_SORT_OPTIONS.find((opt) => opt.value === value);
        if (match) {
            return { sortMetric: match.sortMetric, sortOrder: match.sortOrder, label: match.label };
        }
        const [metric, order] = value.split(':');
        const known = DASH_SORT_METRICS.some((m) => m.id === metric);
        const sortMetric = known ? metric : 'task_submitted';
        const sortOrder = order === 'asc' ? 'asc' : 'desc';
        const metricLabel = (DASH_SORT_METRICS.find((m) => m.id === sortMetric) || {}).label || sortMetric;
        return {
            sortMetric,
            sortOrder,
            label: metricLabel + (sortOrder === 'asc' ? ' (oldest first)' : ' (newest first)')
        };
    },

    _readDashSortFromUi() {
        const el = this._q('#wf-dash-sort');
        return this._parseDashSortValue(el && el.value);
    },

    _dashSortContext() {
        return {
            openDisputesByTaskId: this._getPrefetchCache('openDisputes'),
            resolvedDisputesByTaskId: this._getPrefetchCache('resolvedDisputes'),
            helpfulnessUi: this._state.helpfulnessUi || {},
            currentUserId: this._dashGetCurrentUserId()
        };
    },

    _prefetchLoadingActive() {
        this._ensurePrefetchState();
        return DASH_PREFETCH_KINDS.some((kind) => {
            const slot = this._state.prefetch[kind];
            return slot && slot.status === 'loading';
        });
    },

    _dashSortSelectOptionsHtml(selectedValue) {
        const selected = String(selectedValue || DASH_SORT_DEFAULT);
        return DASH_SORT_OPTIONS.map((opt) =>
            `<option value="${dashEscHtml(opt.value)}"${opt.value === selected ? ' selected' : ''}>${dashEscHtml(opt.label)}</option>`
        ).join('');
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
        } else if (filterSource === 'results-mutate') {
            const applied = this._state.appliedFilters;
            filters = applied
                ? this._pruneFiltersToBounds(applied, bounds)
                : this._filtersAllSelectedFromBounds(bounds);
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
        const sortMetric = filters.sortMetric || 'task_submitted';
        const checkboxResult = lib.applyFiltersAndSort(scopeItems, filters, bounds, this._dashSortContext());
        const manual = filterSource === 'results-mutate'
            ? { rows: filters.manualFilters || [], andOr: filters.manualAndOr || 'and' }
            : this._readSearchOutputManualFilters();
        const result = this._applyManualFiltersToResult(checkboxResult, manual.rows, manual.andOr);
        this._state.filteredItems = result;
        this._state.appliedFilters = Object.assign({}, filters, {
            sortMetric,
            sortOrder,
            manualFilters: manual.rows,
            manualAndOr: manual.andOr
        });

        const tab = this._state.resultsKindTab || 'all';
        if (filterSource === 'client') {
            Logger.log('dashboard: filters applied — ' + result.length + ' / ' + scopeItems.length + ' item(s) in tab scope'
                + (manual.rows.length > 0 ? ' · ' + manual.rows.length + ' manual' : '')
                + ' · ' + this._parseDashSortValue(sortMetric + ':' + sortOrder).label);
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
            syncDraftFromApplied: filterSource === 'results-mutate'
                || filterSource !== 'client'
                || Boolean(this._state.appliedFilters)
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

    _getQuickHydrateBatchSize() {
        const ps = this._state.resultsPageSize;
        if (ps === 'all') return DASH_HYDRATE_BATCH_MAX;
        const n = Number(ps);
        const display = Number.isFinite(n) && n > 0 ? n : DASH_RESULTS_PAGE_SIZE_DEFAULT;
        return Math.min(display, DASH_HYDRATE_BATCH_MAX);
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
        }
        if (nextBtn) {
            nextBtn.disabled = !meta || !meta.canNext;
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
            const checkboxResult = lib.applyFiltersAndSort(scopeItems, filters, newBounds, this._dashSortContext());
            const manualRows = filters.manualFilters || [];
            const manualAndOr = filters.manualAndOr || 'and';
            const result = this._applyManualFiltersToResult(checkboxResult, manualRows, manualAndOr);
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
        const { sortMetric, sortOrder, label } = this._readDashSortFromUi();
        if (applied.sortMetric === sortMetric && applied.sortOrder === sortOrder) return;
        const filters = Object.assign({}, applied, { sortMetric, sortOrder });
        this._state.resultsPage = 0;
        const bounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        const scopeItems = this._getFilterScopeItems();
        const checkboxResult = lib.applyFiltersAndSort(scopeItems, filters, bounds, this._dashSortContext());
        const manualRows = filters.manualFilters || [];
        const manualAndOr = filters.manualAndOr || 'and';
        const result = this._applyManualFiltersToResult(checkboxResult, manualRows, manualAndOr);
        this._state.filteredItems = result;
        this._state.appliedFilters = filters;
        Logger.log('dashboard: sort applied — ' + (label || (sortMetric + ' ' + sortOrder)));
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

    _getUserStoryUi(itemId) {
        const id = String(itemId || '');
        if (!id) return { status: 'idle', visible: false, userStory: null, message: null };
        if (!this._state.userStoryUi[id]) {
            this._state.userStoryUi[id] = {
                status: 'idle',
                visible: false,
                userStory: null,
                message: null
            };
        }
        return this._state.userStoryUi[id];
    },

    _userStoryEmptyMessage(reason) {
        if (reason === 'no_scenario_id') return 'No scenario linked to this task.';
        if (reason === 'scenario_not_found') return 'Scenario not found.';
        if (reason === 'task_not_found') return 'Task not found.';
        return 'No user story for this task.';
    },

    _userStoryHasContent(ui) {
        return ui.userStory != null && String(ui.userStory).trim().length > 0;
    },

    _userStoryIsAbsent(ui) {
        return (ui.status === 'loaded' || ui.status === 'error') && !this._userStoryHasContent(ui);
    },

    _userStoryEmptyHtml(ui) {
        const text = ui.message || 'No user story for this task.';
        return `<p class="wf-dash-user-story-empty">${dashEscHtml(text)}</p>`;
    },

    _userStoryBodyText(ui) {
        return ui.userStory != null && String(ui.userStory).trim()
            ? dashEscHtml(String(ui.userStory))
            : dashEscHtml(ui.message || 'No user story for this task.');
    },

    _userStoryBtnLabel(ui) {
        if (ui.status === 'loading') return 'Fetching user story…';
        if (ui.status === 'loaded' || ui.status === 'error') {
            return ui.visible ? 'Hide User Story' : 'Show User Story';
        }
        return 'Fetch User Story';
    },

    _userStorySectionHtml(itemId) {
        const ui = this._getUserStoryUi(itemId);
        if (this._userStoryIsAbsent(ui)) {
            return `
            <div style="padding: 8px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;" data-wf-dash-user-story-section data-wf-dash-user-story-absent="1" data-item-id="${dashEscHtml(itemId)}">
                ${this._userStoryEmptyHtml(ui)}
            </div>`;
        }
        const btnLabel = this._userStoryBtnLabel(ui);
        const btnDisabled = ui.status === 'loading';
        const hasPanel = this._userStoryHasContent(ui) && (ui.status === 'loaded' || ui.status === 'error');
        const panelOpen = ui.visible && !ui.animateOpen;
        const panelHtml = hasPanel
            ? `<div data-wf-dash-user-story-panel data-open="${panelOpen ? '1' : '0'}" aria-hidden="${panelOpen ? 'false' : 'true'}">`
                + `<div data-wf-dash-user-story-inner><p class="wf-dash-user-story-body">${this._userStoryBodyText(ui)}</p></div>`
                + '</div>'
            : '';
        return `
            <div style="padding: 8px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;" data-wf-dash-user-story-section data-item-id="${dashEscHtml(itemId)}">
                <button type="button" class="wf-dash-user-story-btn ${this._dashBtnClass('basic', 'nav')}" data-wf-dash-user-story="1" data-item-id="${dashEscHtml(itemId)}"${btnDisabled ? ' disabled aria-busy="true"' : ''}>${dashEscHtml(btnLabel)}</button>
                ${panelHtml}
            </div>`;
    },

    _findUserStorySection(itemId) {
        const wrap = this._q('#wf-dash-results');
        if (!wrap || !itemId) return null;
        for (const card of wrap.querySelectorAll('[data-wf-dash-task-card]')) {
            if (card.getAttribute('data-item-id') !== itemId) continue;
            return card.querySelector('[data-wf-dash-user-story-section]');
        }
        return null;
    },

    _animateUserStoryOpen(itemId) {
        const section = this._findUserStorySection(itemId);
        const panel = section ? section.querySelector('[data-wf-dash-user-story-panel]') : null;
        if (!panel) return;
        panel.setAttribute('data-open', '0');
        panel.setAttribute('aria-hidden', 'true');
        const win = this._pageWindow();
        win.requestAnimationFrame(() => {
            win.requestAnimationFrame(() => {
                panel.setAttribute('data-open', '1');
                panel.setAttribute('aria-hidden', 'false');
            });
        });
    },

    _patchUserStorySection(itemId) {
        this._ensureUserStoryStyles();
        const section = this._findUserStorySection(itemId);
        if (!section) return false;
        const ui = this._getUserStoryUi(itemId);
        if (this._userStoryIsAbsent(ui)) {
            section.setAttribute('data-wf-dash-user-story-absent', '1');
            section.innerHTML = this._userStoryEmptyHtml(ui);
            return true;
        }
        section.removeAttribute('data-wf-dash-user-story-absent');
        let btn = section.querySelector('[data-wf-dash-user-story]');
        if (!btn) {
            section.innerHTML = `<button type="button" class="wf-dash-user-story-btn ${this._dashBtnClass('basic', 'nav')}" data-wf-dash-user-story="1" data-item-id="${dashEscHtml(itemId)}"></button>`;
            btn = section.querySelector('[data-wf-dash-user-story]');
        }
        if (btn) {
            btn.textContent = this._userStoryBtnLabel(ui);
            if (ui.status === 'loading') {
                btn.disabled = true;
                btn.setAttribute('aria-busy', 'true');
            } else {
                btn.disabled = false;
                btn.removeAttribute('aria-busy');
            }
        }
        const hasPanel = this._userStoryHasContent(ui) && (ui.status === 'loaded' || ui.status === 'error');
        let panel = section.querySelector('[data-wf-dash-user-story-panel]');
        if (!hasPanel) {
            if (panel) panel.remove();
            return true;
        }
        const bodyText = this._userStoryBodyText(ui);
        if (!panel) {
            section.insertAdjacentHTML('beforeend',
                `<div data-wf-dash-user-story-panel data-open="0" aria-hidden="true">`
                + `<div data-wf-dash-user-story-inner"><p class="wf-dash-user-story-body">${bodyText}</p></div>`
                + '</div>');
            panel = section.querySelector('[data-wf-dash-user-story-panel]');
        } else {
            const body = panel.querySelector('.wf-dash-user-story-body');
            if (body) body.innerHTML = bodyText;
        }
        if (panel) {
            panel.setAttribute('data-open', ui.visible ? '1' : '0');
            panel.setAttribute('aria-hidden', ui.visible ? 'false' : 'true');
        }
        return true;
    },

    async _getVerifierFromCard(itemId) {
        const id = String(itemId || '').trim();
        if (!id) return;
        const item = this._findCachedItem(id) || this._findResultItem(id);
        if (!item || !item.task) {
            Logger.warn('dashboard: get verifier — no task on card ' + id);
            return;
        }
        const taskKey = String(item.task.key || '').trim();
        const taskId = String(item.task.id || '').trim();
        const inputValue = taskKey || taskId;
        if (!inputValue) {
            Logger.warn('dashboard: get verifier — missing task key/id on card ' + id);
            return;
        }
        const opsTab = Context.opsTab;
        if (!opsTab || typeof opsTab.handleVerifierFetch !== 'function') {
            Logger.warn('dashboard: get verifier unavailable — ops module missing');
            return;
        }
        this._setActiveTab('verifier-fetcher');
        const input = this._q('#wf-ops-verifier-input');
        if (input) input.value = inputValue;
        Logger.log('dashboard: get verifier from card — ' + (taskKey || taskId.slice(0, 8) + '…'));
        await opsTab.handleVerifierFetch(this._modal);
    },

    async _toggleUserStory(itemId) {
        const id = String(itemId || '').trim();
        if (!id) return;
        const item = this._findCachedItem(id) || this._findResultItem(id);
        if (!item || !item.task) return;
        const ui = this._getUserStoryUi(id);

        if (ui.status === 'loaded' || ui.status === 'error') {
            if (!this._userStoryHasContent(ui)) return;
            ui.visible = !ui.visible;
            Logger.log('dashboard: user story ' + (ui.visible ? 'shown' : 'hidden') + ' — ' + id);
            if (!this._patchUserStorySection(id)) this._patchTaskCard(id);
            return;
        }
        if (ui.status === 'loading') return;

        const opsTab = Context.opsTab;
        if (!opsTab || typeof opsTab.fetchTaskUserStory !== 'function') {
            ui.status = 'error';
            ui.message = 'User story unavailable (ops module not loaded).';
            ui.visible = false;
            Logger.warn('dashboard: user story fetch unavailable — ops module missing');
            this._patchTaskCard(id);
            return;
        }

        ui.status = 'loading';
        if (!this._patchUserStorySection(id)) this._patchTaskCard(id);

        const taskKey = String(item.task.key || '').trim();
        const taskId = String(item.task.id || '').trim();
        Logger.log('dashboard: fetching user story — ' + (taskKey || taskId.slice(0, 8) + '…'));
        try {
            const result = await opsTab.fetchTaskUserStory({ taskKey, taskId });
            const userStory = result && result.userStory != null ? String(result.userStory) : '';
            if (!userStory.trim()) {
                const reason = result && result.reason ? result.reason : 'empty';
                ui.userStory = null;
                ui.message = this._userStoryEmptyMessage(reason);
                Logger.warn('dashboard: user story empty — ' + id + ' (' + reason + ')');
            } else {
                ui.userStory = userStory;
                ui.message = null;
                Logger.log('dashboard: user story fetched — ' + id + ' (' + userStory.length + ' chars)');
            }
            ui.status = 'loaded';
            ui.visible = Boolean(userStory.trim());
            if (ui.visible) ui.animateOpen = true;
        } catch (err) {
            ui.status = 'error';
            ui.userStory = null;
            ui.message = this._isDashSessionRefreshError(err)
                ? 'Session expired — refresh Fleet and unlock Ops, then reload.'
                : 'Could not load user story.';
            ui.visible = false;
            Logger.warn('dashboard: user story fetch failed — ' + id, err);
        }
        this._patchTaskCard(id);
        if (ui.animateOpen) {
            delete ui.animateOpen;
            this._animateUserStoryOpen(id);
        }
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
        this._state.hydrateFetchActive = true;
        let updated = 0;
        try {
            const enrichment = await Context.dashboardData.enrichTasksWithHistory(taskIds, profilesMap, {
                prefetchedFeedbackRows: opts.prefetchedFeedbackRows,
                skipFeedbackFetch: Boolean(opts.skipFeedbackFetch)
            });
            const taskIdSet = new Set(taskIds);
            const hydratedItems = (this._state.cachedItems || []).filter(
                (it) => taskIdSet.has(it.task.id) && !it.hydrated
            );
            const feedbackIdsToLoad = [];
            for (const item of this._state.cachedItems || []) {
                if (!taskIdSet.has(item.task.id) || item.hydrated) continue;
                const hist = enrichment.get(item.task.id);
                if (hist) {
                    const remap = hist.systemFeedbackIdRemap || {};
                    if (item.selectedFeedbackId && remap[item.selectedFeedbackId]) {
                        item.selectedFeedbackId = remap[item.selectedFeedbackId];
                    }
                    item.task.promptVersions = hist.promptVersions || [];
                    item.task.allFeedback = hist.allFeedback || [];
                    for (const entry of hist.allFeedback || []) {
                        if (entry.id && entry.display && this._shouldShowHelpfulness(entry.display, entry.id)) {
                            feedbackIdsToLoad.push(entry.id);
                        }
                    }
                    if (item.selectedFeedbackId) {
                        const entry = (item.task.allFeedback || []).find((f) => f.id === item.selectedFeedbackId);
                        if (entry && entry.display) item.qaFeedback = entry.display;
                        if (entry && entry.display && this._shouldShowHelpfulness(entry.display, item.selectedFeedbackId)) {
                            feedbackIdsToLoad.push(item.selectedFeedbackId);
                        }
                    }
                }
                item.hydrated = true;
                updated++;
            }
            try {
                const overlaid = await this._overlayDisputesAndFlags(hydratedItems, profilesMap);
                if (overlaid > 0) {
                    for (const item of hydratedItems) {
                        if ((item.disputes && item.disputes.length > 0)
                            || (item.flags && item.flags.length > 0)) {
                            this._patchTaskCard(item.id);
                        }
                    }
                }
            } catch (e) {
                Logger.warn('search-output: dispute/flag overlay failed', e);
            }
            const uniqueFeedbackIds = [...new Set(feedbackIdsToLoad.map((id) => String(id).trim()).filter(Boolean))];
            if (uniqueFeedbackIds.length > 0) {
                try {
                    await this._fetchHelpfulnessRatingsBatch(uniqueFeedbackIds);
                    for (const id of uniqueFeedbackIds) this._patchHelpfulnessBlock(id);
                    this._refreshHelpfulnessFilterUi();
                } catch (e) {
                    Logger.warn('search-output: helpfulness hydration failed', e);
                }
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
            if (this._shouldStopSearch()) break;
            const chunk = toHydrate.slice(i, i + DASH_HYDRATE_TASK_CHUNK);
            const done = i;
            if (typeof opts.onProgress === 'function') {
                opts.onProgress(done, total);
            }
            hydratedTotal += await this._hydrateItems(chunk, enrichOptions);
            if (this._shouldStopSearch()) break;
        }
        if (!this._shouldStopSearch() && typeof opts.onProgress === 'function') {
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
        const batchSize = this._getQuickHydrateBatchSize();
        try {
            for (let i = 0; i < toHydrate.length; i += batchSize) {
                if (this._autoHydrateContextKey() !== contextKey) {
                    Logger.debug('dashboard: auto-hydrate cancelled — results page or tab changed');
                    break;
                }
                const chunk = toHydrate.slice(i, i + batchSize);
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
        const batchSize = this._getQuickHydrateBatchSize();
        try {
            for (let i = 0; i < toHydrate.length; i += batchSize) {
                const chunk = toHydrate.slice(i, i + batchSize);
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

    // ── Popup lifecycle ──,

    _applyDefaultSearchDates() {
        const afterEl = this._q('#wf-dash-after');
        const beforeEl = this._q('#wf-dash-before');
        if (!afterEl || !beforeEl) return;
        if (afterEl.value || beforeEl.value) return;
        this._applyQuickDatePreset('today');
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = 'today';
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

    _taskInitialCreatedAt(task) {
        if (!task) return '';
        const versions = task.promptVersions || [];
        if (versions.length) {
            const first = [...versions].sort((a, b) => a.displayVersionNo - b.displayVersionNo)[0];
            if (first && first.createdAt) return first.createdAt;
        }
        return task.createdAt || '';
    },

    _cardTabShellBase() {
        return 'height: ' + DASH_CARD_TAB_HEIGHT
            + '; flex-shrink: 0; border-radius: 6px 6px 0 0; display: inline-flex; align-items: center; justify-content: center;'
            + ' font-size: 10px; font-weight: 600; padding: 0 8px; box-sizing: border-box; overflow: hidden; white-space: nowrap;';
    },

    _cardSurfaceTabHtml(innerHtml, title) {
        const shell = this._cardTabShellBase()
            + ' background: var(--card, #ffffff); font-weight: 400;'
            + ' border: ' + DASH_CARD_TAB_BORDER + '; border-bottom: none;';
        const label = String(title || '');
        return '<div style="' + shell + '"'
            + (label ? ' title="' + dashEscHtml(label) + '" aria-label="' + dashEscHtml(label) + '"' : '')
            + '>' + innerHtml + '</div>';
    },

    _cardCreatedTabHtml(task) {
        const iso = this._taskInitialCreatedAt(task);
        const formatted = dashFormatCreatedAt(iso);
        const ago = dashRelativeAgo(iso);
        const label = ago ? `Created ${formatted} (${ago})` : `Created ${formatted}`;
        return this._cardSurfaceTabHtml(this._plainTimestampHtml(iso, 'Created'), label);
    },

    _cardKeyTabHtml(task, itemId, highlightOpts) {
        const key = String(task && task.key || '').trim();
        const inner = `<span style="display: inline-flex; align-items: center; gap: 6px;">`
            + this._copyChipHtml(key, highlightOpts || {})
            + this._taskOpenLinkHtml(task, itemId)
            + '</span>';
        return this._cardSurfaceTabHtml(inner, key ? ('Task key: ' + key) : 'Task key');
    },

    _cardStatusTabHtml(task) {
        const meta = this._statusDisplayMeta(task.status);
        const shell = this._cardTabShellBase() + ' background: ' + meta.bg + '; color: ' + meta.color + ';';
        return '<div style="' + shell + '" title="' + dashEscHtml(meta.label) + '" aria-label="' + dashEscHtml(meta.label) + '">' + dashEscHtml(meta.label) + '</div>';
    },

    _cardActionAreaHtml(itemId) {
        return `<div class="wf-dash-card-action-area" aria-label="Card actions">
            <button type="button" class="wf-dash-card-action wf-dash-card-action--add-to-diff" data-wf-dash-add-to-diff="1" data-item-id="${dashEscHtml(itemId)}" title="Add to Diff Viewer" aria-label="Add to Diff Viewer">
                <span class="wf-dash-card-action-inner">
                    <span class="wf-dash-card-action-label">Add to Diff</span>
                </span>
            </button>
            <button type="button" class="wf-dash-card-action wf-dash-card-action--get-verifier" data-wf-dash-get-verifier="1" data-item-id="${dashEscHtml(itemId)}" title="Get verifier" aria-label="Get verifier">
                <span class="wf-dash-card-action-inner">
                    <span class="wf-dash-card-action-label">Get Verifier</span>
                </span>
            </button>
            <button type="button" class="wf-dash-card-action wf-dash-card-action--remove" data-wf-dash-remove-result="1" data-item-id="${dashEscHtml(itemId)}" title="Completely remove result from search" aria-label="Completely remove result from search">
                <span class="wf-dash-card-action-inner">
                    <span class="wf-dash-card-action-icon" aria-hidden="true">×</span>
                </span>
            </button>
        </div>`;
    },

    _addToDiffFromCard(itemId) {
        const item = this._findCachedItem(itemId);
        if (!item || !item.task) {
            Logger.warn('search-output: Add to Diff — item not found: ' + itemId);
            return;
        }
        if (!Context.diffViewer || typeof Context.diffViewer.addTask !== 'function') {
            Logger.warn('search-output: Add to Diff — Context.diffViewer not ready');
            return;
        }
        const seed = {
            taskId: item.task.id,
            key: item.task.key || '',
            authorName: (item.task.author && item.task.author.name) || '',
            authorEmail: (item.task.author && item.task.author.email) || ''
        };
        Context.diffViewer.addTask(seed);
        Logger.log('search-output: added task to diff viewer — ' + (seed.key || seed.taskId));
    },

    _leftTabStyle(active) {
        const base = 'padding: 8px 12px; font-size: 12px; font-weight: 600; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; background: transparent;';
        return active
            ? base + ' color: var(--foreground, #0f172a); border-bottom-color: var(--brand, var(--primary, #2563eb));'
            : base + ' color: var(--muted-foreground, #64748b);';
    },

    _searchSectionStyle() {
        return 'background: color-mix(in srgb, var(--muted-foreground, #64748b) 8%, var(--card, #ffffff)); border-radius: 10px; padding: 14px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; box-sizing: border-box;';
    },

    _searchPanelHtml() {
        const box = this._panelBoxStyle();
        const label = this._labelStyle();
        const hint = this._hintStyle();
        const input = this._inputStyle();
        const section = this._searchSectionStyle();
        const retrieveInputVal = dashEscHtml((this._state && this._state.retrieveInput) || '');
        const leftTab = this._state ? this._state.leftTab : 'search';
        const leftHtml = `
                    <div style="${box} display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                        <nav style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;" aria-label="Search and filters">
                            <div style="display: flex; gap: 0; min-width: 0;">
                                <button type="button" data-wf-dash-left-tab="search" style="${this._leftTabStyle(leftTab === 'search')}">Search</button>
                                <button type="button" data-wf-dash-left-tab="filters" style="${this._leftTabStyle(leftTab === 'filters')}">Filters</button>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                                <div id="wf-dash-actions-filters" style="display: ${leftTab === 'filters' ? 'flex' : 'none'}; align-items: center; gap: 8px;">
                                    <button type="button" id="wf-dash-reset-filters" class="${this._dashBtnClass('basic', 'nav')}">Reset</button>
                                    <button type="button" id="wf-dash-apply-filters" class="${this._dashBtnClass('primary', 'nav')}">Apply</button>
                                </div>
                            </div>
                        </nav>

                        <div id="wf-dash-left-panel-search" style="display: ${leftTab === 'search' ? 'flex' : 'none'}; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 14px; gap: 12px;">
                            <div id="wf-dash-section-contributor" style="${section}">
                                <div style="${label} font-weight: 600;">Contributor Search</div>
                                <div id="wf-dash-search-fields" style="display: flex; flex-direction: column; gap: 14px;">
                                    <div>
                                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                            <button type="button" id="wf-dash-toggle-tasks" aria-pressed="true" style="${this._btnToggleStyle(true, 'task_creation')}">Task Creation</button>
                                            <button type="button" id="wf-dash-toggle-qa" aria-pressed="true" style="${this._btnToggleStyle(true, 'qa')}">QA</button>
                                            <button type="button" id="wf-dash-toggle-disputes" aria-pressed="false" style="${this._btnToggleStyle(false, 'dispute')}">Disputes</button>
                                            <button type="button" id="wf-dash-toggle-senior-review" aria-pressed="false" style="${this._btnToggleStyle(false, 'senior_review')}">Sr Review</button>
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
                                        <div style="${hint} margin-bottom: 8px;">${dashEscHtml(DASH_NONE_SELECTED_HINT)}</div>
                                        <div style="display: flex; flex-direction: column; gap: 12px;">
                                            ${this._multiSelectHtml('search-envs', 'Environment', 'All environments', true)}
                                            ${this._multiSelectHtml('search-projects', 'Project', 'All projects', true)}
                                            ${this._multiSelectHtml('search-teams', 'Team', 'All teams', true)}
                                        </div>
                                    </div>
                                </div>
                                ${this._resultsModeToggleHtml('contributor')}
                                <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 4px;">
                                    <button type="button" id="wf-dash-clear-params" class="${this._dashBtnClass('basic', 'nav')}">Reset</button>
                                    <button type="button" id="wf-dash-search" class="${this._dashBtnClass('primary', 'nav')}">Search</button>
                                </div>
                            </div>
                            <div id="wf-dash-section-retrieve" style="${section}">
                                <div style="${label} font-weight: 600;">Retrieve Task</div>
                                <p style="${hint} margin: 0; line-height: 1.45;">Enter a task ID, version ID, or task key. Full Fleet URLs are also accepted.</p>
                                <input type="text" id="wf-dash-retrieve-input" value="${retrieveInputVal}" autocomplete="off" placeholder="Task ID, version ID, task key, or URL" style="${input}">
                                <div id="wf-dash-retrieve-error" style="display: none; font-size: 11px; color: var(--destructive, #dc2626);"></div>
                                ${this._resultsModeToggleHtml('retrieve')}
                                <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 4px;">
                                    <button type="button" id="wf-dash-retrieve-clear" class="${this._dashBtnClass('basic', 'nav')}">Clear</button>
                                    <button type="button" id="wf-dash-retrieve-btn" class="${this._dashBtnClass('primary', 'nav')}">Retrieve</button>
                                </div>
                            </div>
                        </div>

                        <div id="wf-dash-left-panel-filters" style="display: ${leftTab === 'filters' ? 'flex' : 'none'}; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                            <div style="flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 0 14px 14px 14px; display: flex; flex-direction: column; gap: 14px;">
                                <p style="${hint} margin: 0;">Refine loaded results. Press Apply to update the results pane.</p>
                                <div>
                                    <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Substring</label>
                                    <p style="${hint} margin: 0 0 8px 0; line-height: 1.45;">${dashEscHtml(DASH_SUBSTRING_FILTER_HELP)}</p>
                                    <div style="position: relative; min-width: 0;">
                                        <textarea id="wf-dash-prompt" rows="1" placeholder="Filter by substring/RegEx" style="${input} padding-right: 34px; resize: none; overflow: hidden; line-height: 1.4; min-height: 36px;"></textarea>
                                        <button type="button" id="wf-dash-clear-prompt" aria-label="Clear substring" title="Clear substring" style="${this._inputClearBtnStyle()} position: absolute; right: 4px; top: 4px; width: 26px; height: 26px; font-size: 15px; display: none;">&times;</button>
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
                                </div>
                                <div id="wf-dash-filter-lists-wrap">
                                    <div style="${label} margin-bottom: 6px; font-weight: 600; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                        <span>Narrow results</span>
                                        <button type="button" id="wf-dash-filter-expand-all" aria-label="Expand all filter menus" style="flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 2px 8px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; background: transparent; color: var(--muted-foreground, #64748b); cursor: pointer;">Expand All</button>
                                    </div>
                                    <div style="${hint} margin-bottom: 8px;">${dashEscHtml(DASH_NONE_SELECTED_HINT)}</div>
                                    <div id="wf-dash-filter-lists" style="display: flex; flex-direction: column; gap: 12px;">
                                        ${DASH_FILTER_SCOPES.map((s) => this._multiSelectHtml(s.scopeKey, this._filterScopeLabel(s.scopeKey), 'Run a search to enable', true)).join('')}
                                    </div>
                                </div>
                                <div id="wf-dash-manual-filter-wrap">
                                    <div style="${label} margin-bottom: 8px; font-weight: 600; color: var(--foreground, #0f172a);">Manual filters</div>
                                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
                                        <span style="${hint} margin: 0;">Stage rows below, then press Apply. Default matches all conditions (AND).</span>
                                        <label style="display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--muted-foreground, #64748b); cursor: pointer; flex-shrink: 0;">
                                            <input type="checkbox" id="wf-dash-manual-andor" style="margin: 0;">
                                            <span>Match any (OR)</span>
                                        </label>
                                    </div>
                                    <div id="wf-dash-manual-rows" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;"></div>
                                    <button type="button" id="wf-dash-manual-add" class="${this._dashBtnClass('basic', 'nav')} wf-dash-btn--full" style="padding: 6px 10px;">+ Add filter</button>
                                </div>
                            </div>
                        </div>
                        <div id="wf-dash-left-messages" style="display: none; flex-shrink: 0; padding: 8px 14px; border-top: 1px solid var(--border, #e2e8f0); background: var(--card, #ffffff); font-size: 11px; line-height: 1.4; flex-direction: column; gap: 6px;">
                            <div id="wf-dash-session-refresh-banner" style="display: none;"></div>
                            <div id="wf-dash-bootstrap-error" style="display: none; font-size: 12px; color: var(--destructive, #dc2626);"></div>
                            <div id="wf-dash-universal-hint" style="display: none; font-weight: 400; color: var(--muted-foreground, #64748b);"></div>
                            <div id="wf-dash-range-error" style="display: none; color: var(--destructive, #dc2626);"></div>
                            <div id="wf-dash-search-error" style="display: none; font-size: 12px; color: var(--destructive, #dc2626);"></div>
                            <div id="wf-dash-substring-error" style="display: none; color: var(--destructive, #dc2626);"></div>
                            <div id="wf-dash-apply-hint" style="display: none; color: var(--muted-foreground, #64748b);"></div>
                        </div>
                    </div>`;
        const rightHtml = `
                <div style="flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; ${box}">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                            <div style="display: flex; align-items: baseline; gap: 10px; min-width: 0; flex: 1; flex-wrap: wrap;">
                                <span style="font-size: 13px; font-weight: 600; color: var(--foreground, #0f172a); flex-shrink: 0;">Results</span>
                                <span id="wf-dash-results-status" style="${label} margin: 0;">Set search parameters on the left, then press Search.</span>
                            </div>
                            <div style="display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap;">
                                <button type="button" id="wf-dash-bulk-hydrate" class="${this._dashBtnClass('secondary', 'nav')}" style="display: none;">Hydrate results</button>
                                <button type="button" id="wf-dash-drop-excluded" title="May be helpful for performance" class="${this._dashBtnClass('basic', 'nav')}" style="display: none;">Drop Excluded Results</button>
                                <button type="button" id="wf-dash-clear-results" class="${this._dashBtnClass('basic', 'nav')}">Clear Results</button>
                            </div>
                        </div>
                        <div id="wf-dash-results-toolbar-row2" style="display: none; margin-top: 10px; align-items: center; justify-content: space-between; gap: 12px; width: 100%; flex-wrap: wrap;">
                            <div id="wf-dash-results-kind-tab-buttons" style="display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; flex: 1;"></div>
                            <div id="wf-dash-results-pager-slot-kind" style="flex-shrink: 0; margin-left: auto;">
                                <div id="wf-dash-results-pager" style="display: none; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap;">
                                    <label style="${label} display: inline-flex; align-items: center; gap: 6px; margin: 0;">
                                        <span>Sort</span>
                                        <select id="wf-dash-sort" style="${input} width: auto; min-width: 13rem; max-width: 18rem; padding: 4px 8px; font-size: 11px; cursor: pointer;">
                                            ${this._dashSortSelectOptionsHtml(DASH_SORT_DEFAULT)}
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
                                    <button type="button" id="wf-dash-results-prev" aria-label="Previous page" title="Previous page" class="${this._dashBtnClass('basic', 'icon')}">${this._pagerChevronSvg('prev')}</button>
                                    <button type="button" id="wf-dash-results-next" aria-label="Next page" title="Next page" class="${this._dashBtnClass('basic', 'icon')}">${this._pagerChevronSvg('next')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="wf-dash-results" style="flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 24px;"></div>
                </div>`;
        return this._splitPanelSectionHtml(leftHtml, rightHtml);
    },

    _filterScopeLabel(scopeKey) {
        const labels = {
            'filter-prompt-history': 'Task Lifecycle History',
            'filter-teams': 'Team',
            'filter-projects': 'Project',
            'filter-envs': 'Environment',
            'filter-statuses': 'Current task status',
            'filter-contributors': 'Contributor',
            'filter-prompt-ratings': 'Prompt rating',
            'filter-qa-helpfulness': 'QA Helpfulness',
            'filter-task-issues': 'Task issues',
            'filter-return-types': 'Return types'
        };
        return labels[scopeKey] || scopeKey;
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
        } else if (kind === 'senior_review') {
            this._state.includeSeniorReview = !this._state.includeSeniorReview;
            this._syncOutputToggleUi();
            Logger.log('dashboard: Sr Review ' + (this._state.includeSeniorReview ? 'on' : 'off'));
        }
    },

    _syncOutputToggleUi() {
        const tasksBtn = this._q('#wf-dash-toggle-tasks');
        const qaBtn = this._q('#wf-dash-toggle-qa');
        const disputesBtn = this._q('#wf-dash-toggle-disputes');
        const seniorReviewBtn = this._q('#wf-dash-toggle-senior-review');
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
        if (seniorReviewBtn) {
            seniorReviewBtn.setAttribute('aria-pressed', this._state.includeSeniorReview ? 'true' : 'false');
            seniorReviewBtn.style.cssText = this._btnToggleStyle(this._state.includeSeniorReview, 'senior_review');
        }
    },

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
            const tokenIds = new Set(tokens.map((t) => String(t.id || '').trim().toLowerCase()).filter(Boolean));
            const allResults = await this._searchPersons(query);
            const results = allResults.filter((p) => !tokenIds.has(String(p.id || '').trim().toLowerCase()));
            const input = this._q('#wf-dash-author-input');
            if (results.length === 0) {
                if (allResults.length > 0) {
                    this._setAuthorError('Already added.');
                    return 'duplicate';
                }
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
        if (outcome === 'duplicate') {
            return 'All matches for that query are already in Contributors.';
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

    // ── Multiselect rendering / reading ──,

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

    _renderSearchTeamsList() {
        const itemsEl = this._msItemsEl('search-teams');
        if (!itemsEl) return;
        const prevSelected = new Set(this._selectedFromList('search-teams'));
        const items = this._getSearchableTeamCatalog().map(([id, label]) => ({ id, label }));
        itemsEl.innerHTML = this._multiSelectItemsHtml('search-teams', items, 'All teams', false, false);
        itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (prevSelected.has(cb.value)) cb.checked = true; });
        this._setMsBulkToggleMode('search-teams', prevSelected.size === 0 ? 'all' : 'none');
        this._applyMsBulkToggleLabel('search-teams');
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
        this._setMsBulkToggleMode('search-projects', prevSelected.size === 0 ? 'all' : 'none');
        this._applyMsBulkToggleLabel('search-projects');
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
        this._setMsBulkToggleMode('search-envs', prevSelected.size === 0 ? 'all' : 'none');
        this._applyMsBulkToggleLabel('search-envs');
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
            promptHistory: [], qaHelpfulness: []
        };
        this._resetManualFilters();
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
        const filterOptions = Object.assign({}, options, {
            helpfulnessUi: this._state.helpfulnessUi || {},
            currentUserId: this._dashGetCurrentUserId()
        });
        const irrelevance = scopeItems.length > 0 && this._isFilterDraftValid(draft)
            ? lib.computeFilterIrrelevance(scopeItems, draft, listBounds, filterOptions)
            : lib.emptyFilterIrrelevance();
        const optionCounts = scopeItems.length > 0
            ? lib.computeFilterOptionCounts(scopeItems, draft, listBounds, filterOptions)
            : lib.emptyFilterOptionCounts();

        const openFilterKeys = this._beginFilterMsDropdownRefresh();
        try {
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
                const countsForScope = optionCounts[draftKey] || new Map();
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
                    irrelevantSet,
                    countsForScope
                );
                itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                    cb.checked = checkedIds.has(cb.value);
                });
                this._updateMsCount(scopeKey);
                this._syncMsDropdown(scopeKey);
                if (scopeKey.startsWith('filter-')) this._syncMsDropdownFilterUi(scopeKey);
            }
        } finally {
            this._endFilterMsDropdownRefresh(openFilterKeys);
        }
        this._state.filterListBoundsPrev = listBounds;
        this._updateApplyFiltersUi();
        this._repositionOpenFlyouts();
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
        const filterActions = this._q('#wf-dash-actions-filters');
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
        const retrieveErr = this._q('#wf-dash-retrieve-error');
        const substringErr = this._q('#wf-dash-substring-error');
        const applyHint = this._q('#wf-dash-apply-hint');
        const sharedVisible = this._isMessageElVisible(sessionBanner) || this._isMessageElVisible(bootstrapErr);
        const searchVisible = sharedVisible
            || this._isMessageElVisible(universal)
            || this._isMessageElVisible(rangeErr)
            || this._isMessageElVisible(searchErr)
            || this._isMessageElVisible(retrieveErr);
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

    // ── Dirty / range validation ──,

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
        this._syncPromptFilterHeight(prompt);
        const after = (this._q('#wf-dash-after') || {}).value || '';
        const before = (this._q('#wf-dash-before') || {}).value || '';
        const clearDates = this._q('#wf-dash-clear-dates');
        if (clearDates) {
            clearDates.style.display = (after || before) ? '' : 'none';
        }
    },

    _syncPromptFilterHeight(el) {
        const prompt = el || this._q('#wf-dash-prompt');
        if (!prompt || String(prompt.tagName || '').toUpperCase() !== 'TEXTAREA') return;
        prompt.style.height = 'auto';
        const minHeight = 36;
        prompt.style.height = Math.max(minHeight, prompt.scrollHeight) + 'px';
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
        const hintEl = this._q('#wf-dash-universal-hint');
        if (hintEl) {
            if (isAllTime && isUniversal) {
                hintEl.textContent = 'All Time — no date bound on this search.';
                hintEl.style.display = 'block';
            } else {
                hintEl.style.display = 'none';
            }
        }
        const searchBtn = this._q('#wf-dash-search');
        if (searchBtn) {
            const noOutputTypes = !this._state.includeTasks && !this._state.includeQa
                && !this._state.includeDisputes && !this._state.includeSeniorReview;
            const searchDisabled = this._state.loading
                || noOutputTypes
                || ((after || before) && !check.valid);
            searchBtn.disabled = searchDisabled;
        }
        const retrieveBtn = this._q('#wf-dash-retrieve-btn');
        const retrieveInputEl = this._q('#wf-dash-retrieve-input');
        if (retrieveBtn) {
            if (this._state.loading) {
                retrieveBtn.disabled = true;
            } else if (retrieveBtn.textContent === 'Retrieve') {
                const retrieveInput = (retrieveInputEl && retrieveInputEl.value) || '';
                const retrieveDisabled = !String(retrieveInput).trim();
                retrieveBtn.disabled = retrieveDisabled;
            }
        }
        if (retrieveInputEl) retrieveInputEl.disabled = this._state.loading;
        this._syncFieldClearButtons();
        this._syncLeftMessagesBar();
        return { check, isUniversal };
    },

    _isFilterSelectionValid() {
        return Boolean(this._state.cachedItems);
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
        const bounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        if ((draft.promptText || '').trim() !== (applied.promptText || '').trim()) return true;
        if (Boolean(draft.fuzzy) !== Boolean(applied.fuzzy)) return true;
        if (Boolean(draft.regex) !== Boolean(applied.regex)) return true;
        if (Boolean(draft.caseSensitive) !== Boolean(applied.caseSensitive)) return true;
        const keys = [
            'teamIds', 'projectIds', 'envKeys', 'statuses', 'contributorIds',
            'promptRatings', 'taskIssues', 'returnTypes', 'promptHistory', 'qaHelpfulness'
        ];
        for (const key of keys) {
            const boundIds = bounds[key] || [];
            if (!this._filterDimensionEquivalent(draft[key], applied[key], boundIds)) return true;
        }
        const manual = this._readSearchOutputManualFilters();
        if ((applied.manualAndOr || 'and') !== manual.andOr) return true;
        if (!this._manualFilterRowsEqual(applied.manualFilters, manual.rows)) return true;
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
        }
        if (resetFiltersBtn) {
            resetFiltersBtn.disabled = noResults || Boolean(this._state.loading);
        }
        const applyHint = this._q('#wf-dash-apply-hint');
        if (applyHint) {
            applyHint.style.display = 'none';
        }
        this._syncFieldClearButtons();
        this._syncLeftMessagesBar();
    },

    _updateSubstringErrorUi() {
        this._updateApplyFiltersUi();
    },

    // ── Retrieve task ──,

    _parseRetrieveInput(raw) {
        const text = String(raw || '').trim();
        if (!text) return null;

        const classifySegment = (seg) => {
            if (!seg) return null;
            if (DASH_UUID_RE.test(seg)) return { kind: 'id', value: seg };
            if (DASH_TASK_KEY_RE.test(seg)) return { kind: 'key', value: seg };
            return null;
        };

        if (/^https?:\/\//i.test(text) || text.startsWith('/')) {
            try {
                const url = new URL(text, DASH_FLEET_ORIGIN);
                const segments = url.pathname.split('/').filter(Boolean).concat([...url.searchParams.values()]);
                for (const seg of segments) {
                    const parsed = classifySegment(seg);
                    if (parsed) return parsed;
                }
            } catch (_e) { /* not a URL */ }
        }

        const direct = classifySegment(text);
        if (direct) return direct;

        const uuidMatch = text.match(DASH_UUID_RE);
        if (uuidMatch) return { kind: 'id', value: uuidMatch[0] };

        const keyMatch = text.match(/task_[A-Za-z0-9_]+/);
        if (keyMatch) return { kind: 'key', value: keyMatch[0] };

        return null;
    },

    async _fetchTaskRowForRetrieve(parsed) {
        if (parsed.kind === 'key') {
            const rows = await this._pgQuery('tasks.select_search', { key: 'eq.' + parsed.value, limit: '1' }, 'search');
            return { row: rows[0] || null, versionOverride: null };
        }
        let rows = await this._pgQuery('tasks.select_search', { id: 'eq.' + parsed.value, limit: '1' }, 'search');
        if (rows.length) return { row: rows[0], versionOverride: null };
        const versionRows = await this._pgQuery('task_versions.select_history', { id: 'eq.' + parsed.value, limit: '1' }, 'search');
        if (!versionRows.length) return { row: null, versionOverride: null };
        const versionRow = versionRows[0];
        const taskId = versionRow.task_id;
        if (!taskId) return { row: null, versionOverride: null };
        rows = await this._pgQuery('tasks.select_search', { id: 'eq.' + taskId, limit: '1' }, 'search');
        return { row: rows[0] || null, versionOverride: versionRow };
    },

    async _buildRetrieveTaskItem(taskRow, versionOverride) {
        const profileIds = taskRow.created_by ? [taskRow.created_by] : [];
        const targetIds = taskRow.task_project_target_id ? [taskRow.task_project_target_id] : [];
        const [profileRows, targetToProjectId] = await Promise.all([
            profileIds.length > 0
                ? this._fetchProfilesByIds(profileIds, 'search')
                : Promise.resolve([]),
            targetIds.length > 0
                ? this._fetchTargetProjectMap(targetIds)
                : Promise.resolve(new Map())
        ]);
        const profilesMap = this._buildProfilesMap(profileRows);
        const task = this._rowToTask(taskRow, profilesMap, versionOverride, targetToProjectId);
        task.promptVersions = [];
        task.allFeedback = [];
        const items = this._taskCreationItemsFromTasks([task]);
        return Object.assign({}, items[0], { hydrated: false });
    },

    _setRetrieveError(text) {
        const el = this._q('#wf-dash-retrieve-error');
        if (el) {
            el.textContent = text ? 'Error: ' + text : '';
            el.style.display = text ? 'block' : 'none';
        }
        this._syncLeftMessagesBar();
    },

    _setRetrieveButtonLoading(loading) {
        const btn = this._q('#wf-dash-retrieve-btn');
        if (btn) {
            btn.textContent = loading ? 'Loading…' : 'Retrieve';
            btn.disabled = loading;
        }
        const clearBtn = this._q('#wf-dash-retrieve-clear');
        if (clearBtn) clearBtn.disabled = loading;
        const input = this._q('#wf-dash-retrieve-input');
        if (input) input.disabled = loading;
    },

    _clearRetrieveInput() {
        this._state.retrieveInput = '';
        const input = this._q('#wf-dash-retrieve-input');
        if (input) input.value = '';
        this._setRetrieveError('');
        Logger.log('search-output: retrieve task input cleared');
    },

    async _submitRetrieveTask() {
        const inputEl = this._q('#wf-dash-retrieve-input');
        const raw = inputEl ? inputEl.value : (this._state.retrieveInput || '');
        this._state.retrieveInput = String(raw || '').trim();
        const parsed = this._parseRetrieveInput(raw);
        if (!parsed) {
            this._setRetrieveError('Enter a valid task ID, version ID, task key, or Fleet URL.');
            return;
        }
        this._setRetrieveError('');
        this._setSearchError('');

        const retrieveCommitted = {
            retrieveMode: true,
            retrieveLabel: parsed.value,
            includeTaskCreation: true,
            includeQa: false,
            includeDisputes: false,
            searchDepth: 'deep',
            authorCount: 0,
            authorLabels: [],
            searchKinds: ['task_creation']
        };
        this._beginResultsLoad();
        this._resetSearchLoadLog();
        this._state.searchLoadPhase = 'Retrieving task…';
        this._state.committed = retrieveCommitted;
        this._setRetrieveButtonLoading(true);
        this._setSearchButtonLoading(false);
        this._updateResultsKindTabsUi();
        this._syncResultsToolbarDerivedUi();
        this._updateResultsStatus();
        this._renderResults();

        this._state.searchFetchActive = true;
        try {
            Logger.info('search-output: retrieve task started — ' + parsed.kind + ' ' + parsed.value);
            const { row, versionOverride } = await this._fetchTaskRowForRetrieve(parsed);
            if (!row) {
                this._setRetrieveError('No task found for that identifier.');
                this._restoreResultsLoadSnapshotOnError();
                return;
            }
            const item = await this._buildRetrieveTaskItem(row, versionOverride);
            this._state.cachedItems = [item];
            this._setSearchLoadPhase('Hydrating task…', 1);
            await this._hydrateAllSearchResults([item], { skipFeedbackFetch: false });
            this._setSearchLoadPhase('Applying filters…', 1);
            Logger.log('search-output: retrieve task loaded — ' + row.id + ' (fully hydrated)');
            const additive = this._isAdditiveResultsMode()
                && Array.isArray(this._state.resultsLoadSnapshot)
                && this._state.resultsLoadSnapshot.length > 0;
            this._finalizeResultsLoad([item], {
                committed: additive ? null : retrieveCommitted
            });
        } catch (err) {
            if (this._handleDashSessionRefreshError(err)) {
                this._setRetrieveError('');
            } else {
                this._setRetrieveError(err.message || String(err));
            }
            this._restoreResultsLoadSnapshotOnError();
            Logger.warn('search-output: retrieve task failed', err);
        } finally {
            this._state.searchFetchActive = false;
            this._state.loading = false;
            this._state.searchLoadPhase = '';
            this._resetSearchLoadLog();
            this._setRetrieveButtonLoading(false);
            this._validateRangeUi();
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
    },

    // ── Search submit / clear ──,

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
            const includeSeniorReview = this._state.includeSeniorReview;
            if (!includeTasks && !includeQa && !includeDisputes && !includeSeniorReview) {
                this._setSearchError('Enable at least one contributor search area: Task Creation, QA, Disputes, or Sr Review.');
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

            const authorIds = this._state.draftTokens.map((t) => t.id);
            const authorLabels = this._state.draftTokens.map((t) => this._personDisplayLabel(t));
            const searchCommitted = {
                authorIds,
                authorCount: authorIds.length,
                authorLabels,
                includeTaskCreation: includeTasks,
                includeQa,
                includeDisputes,
                includeSeniorReview,
                afterLocal: after,
                beforeLocal: before,
                searchDepth,
                searchKinds: [
                    includeTasks ? 'task_creation' : null,
                    includeQa ? 'qa' : null,
                    includeDisputes ? 'dispute' : null,
                    includeSeniorReview ? 'senior_review' : null
                ].filter(Boolean)
            };
            this._state.committed = searchCommitted;
            this._beginResultsLoad();
            this._state.searchStopRequested = false;
            this._resetSearchLoadLog();
            this._state.searchLoadPhase = 'Building search scope…';
            this._setSearchError('');
            this._setSearchButtonLoading(true);
            this._updateResultsKindTabsUi();
            this._syncResultsToolbarDerivedUi();
            this._updateResultsStatus();
            this._renderResults();

            this._state.searchFetchActive = true;
            const gen = (this._state.searchGeneration = (this._state.searchGeneration || 0) + 1);
            const hadPriorResults = this._isAdditiveResultsMode()
                && Array.isArray(this._state.resultsLoadSnapshot)
                && this._state.resultsLoadSnapshot.length > 0;
            try {
                const scope = await this._buildSearchApiScope();
                if (this._shouldStopSearch()) {
                    this._finishStoppedSearch([]);
                    return;
                }
                if (gen !== this._state.searchGeneration) { Logger.debug('dashboard: stale search gen ' + gen + ' dropped'); return; }
                Logger.info('dashboard: search started — '
                    + (authorIds.length > 0 ? authorIds.length + ' author(s)' : 'all authors')
                    + ' · types: ' + [includeTasks ? 'tasks' : null, includeQa ? 'QA' : null, includeDisputes ? 'disputes' : null, includeSeniorReview ? 'Sr Review' : null].filter(Boolean).join('+')
                    + (after ? ' · after ' + after : '') + (before ? ' · before ' + before : ''));
                const searchResult = await this._fetchWorkerOutputSearch({
                    authorIds,
                    includeTaskCreation: includeTasks,
                    includeQa,
                    includeDisputes,
                    includeSeniorReview,
                    afterIso: rangeCheck.afterIso,
                    beforeIso: rangeCheck.beforeIso,
                    scope,
                    searchDepth
                });
                const items = searchResult.items;
                this._state.cachedItems = items;
                if (this._shouldStopSearch()) {
                    this._finishStoppedSearch(items);
                    return;
                }
                if (gen !== this._state.searchGeneration) { Logger.debug('dashboard: stale search gen ' + gen + ' dropped after fetch'); return; }
                if (searchDepth === 'deep' && items.length > 0) {
                    this._setSearchLoadPhase('Hydrating results…', 0, items.length);
                    const hydrateLogId = this._beginSearchLoadEntry('Deep hydration (0/' + items.length + ')');
                    await this._hydrateAllSearchResults(items, {
                        prefetchedFeedbackRows: searchResult.allFeedbackRows,
                        skipFeedbackFetch: false,
                        onProgress: (done, total) => {
                            this._setSearchLoadPhase('Hydrating results…', done, total);
                            if (hydrateLogId != null) {
                                this._updateSearchLoadEntry(hydrateLogId, 'Deep hydration (' + done + '/' + total + ')');
                            }
                        }
                    });
                    if (hydrateLogId != null && !this._shouldStopSearch()) {
                        this._resolveSearchLoadEntry(
                            hydrateLogId,
                            'Deep hydration (' + items.length + '/' + items.length + ')'
                        );
                    }
                }
                if (this._shouldStopSearch()) {
                    this._finishStoppedSearch(items);
                    return;
                }
                if (gen !== this._state.searchGeneration) { Logger.debug('dashboard: stale search gen ' + gen + ' dropped after hydrate'); return; }
                this._setSearchLoadPhase('Applying filters…', items.length);
                Logger.log('dashboard: search loaded ' + items.length + ' item(s)'
                    + (searchDepth === 'deep' ? ' (deep, fully hydrated)' : '')
                    + (hadPriorResults ? ' (add mode)' : ''));
                this._finalizeResultsLoad(items, {
                    committed: hadPriorResults ? null : searchCommitted
                });
            } catch (err) {
                if (gen !== this._state.searchGeneration) {
                    Logger.debug('dashboard: stale search gen ' + gen + ' dropped in catch');
                    return;
                }
                if (this._handleDashSessionRefreshError(err)) {
                    this._setSearchError('');
                } else {
                    this._setSearchError(err.message || String(err));
                }
                this._restoreResultsLoadSnapshotOnError();
                Logger.warn('dashboard: search failed', err);
            } finally {
                if (gen !== this._state.searchGeneration) {
                    Logger.debug('dashboard: stale search gen ' + gen + ' skipped finally');
                    return;
                }
                this._state.searchFetchActive = false;
                this._state.loading = false;
                this._state.searchLoadPhase = '';
                this._resetSearchLoadLog();
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
        this._state.includeSeniorReview = false;
        ['#wf-dash-after', '#wf-dash-before'].forEach((sel) => { const el = this._q(sel); if (el) el.value = ''; });
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = '';
        ['search-teams', 'search-projects', 'search-envs'].forEach((key) => {
            const itemsEl = this._msItemsEl(key);
            if (itemsEl) itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
            this._setMsBulkToggleMode(key, 'all');
            this._applyMsBulkToggleLabel(key);
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
        const sortEl = this._q('#wf-dash-sort');
        if (sortEl) sortEl.value = DASH_SORT_DEFAULT;
        ['#wf-dash-case', '#wf-dash-fuzzy', '#wf-dash-regex'].forEach((sel) => {
            const el = this._q(sel);
            if (el) el.checked = false;
        });
        this._updateSubstringErrorUi();
        this._syncFieldClearButtons();
        this._resetManualFilters();
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
        this._state.userStoryUi = {};
        this._state.taskOpenUi = {};
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
        const sortEl = this._q('#wf-dash-sort');
        if (sortEl) sortEl.value = DASH_SORT_DEFAULT;
        ['#wf-dash-case', '#wf-dash-fuzzy', '#wf-dash-regex'].forEach((sel) => { const el = this._q(sel); if (el) el.checked = false; });
        this._updateResultsStatus();
        this._updateSubstringErrorUi();
        this._renderResults();
        Logger.log('dashboard: results cleared');
    },

    _currentClientFilters() {
        const bounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        const draft = this._getFilterDraft();
        const checkboxFilters = {};
        for (const { draftKey } of DASH_FILTER_SCOPES) {
            const sel = draft[draftKey] || [];
            const boundIds = bounds[draftKey] || [];
            checkboxFilters[draftKey] = this._normalizeFilterDimensionSelection(sel, boundIds);
        }
        const sort = this._readDashSortFromUi();
        return Object.assign({}, checkboxFilters, {
            promptText: (this._q('#wf-dash-prompt') || {}).value || '',
            fuzzy: Boolean((this._q('#wf-dash-fuzzy') || {}).checked),
            regex: Boolean((this._q('#wf-dash-regex') || {}).checked),
            caseSensitive: Boolean((this._q('#wf-dash-case') || {}).checked),
            sortMetric: sort.sortMetric,
            sortOrder: sort.sortOrder
        });
    },

    _hasActiveFilters() {
        const applied = this._state.appliedFilters;
        const bounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        if (!applied) return false;
        const lib = dashLib();
        const dims = [
            ['teamIds', bounds.teamIds],
            ['projectIds', bounds.projectIds],
            ['envKeys', bounds.envKeys],
            ['statuses', bounds.statuses],
            ['contributorIds', bounds.contributorIds],
            ['promptRatings', bounds.promptRatings],
            ['taskIssues', bounds.taskIssues],
            ['returnTypes', bounds.returnTypes],
            ['promptHistory', bounds.promptHistory],
            ['qaHelpfulness', bounds.qaHelpfulness]
        ];
        for (const [key, boundIds] of dims) {
            if (!this._isDimensionUnrestricted(applied[key] || [], boundIds || [])) return true;
        }
        return (applied.regex && lib.isRegexQueryActive(applied.promptText))
            || (!applied.regex && !lib.isQueryEmpty(applied.promptText, applied.caseSensitive))
            || ((applied.manualFilters || []).length > 0);
    },

    _applyFiltersAndRender() {
        this._refreshResultsView({ resetPage: true, filterSource: 'client' });
    },

    // ── Status text ──,

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
        if (committed.retrieveMode) return 'task: ' + (committed.retrieveLabel || '');
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
        if (committed.includeSeniorReview) types.push('Sr Review');
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

    _canShowStopSearchButton() {
        const s = this._state;
        return Boolean(s && s.loading && s.committed && !s.committed.retrieveMode);
    },

    _shouldStopSearch() {
        const s = this._state;
        return Boolean(s && s.loading && s.searchStopRequested && s.committed && !s.committed.retrieveMode);
    },

    _requestStopSearchFetches() {
        if (!this._canShowStopSearchButton()) return;
        Logger.log('search-output: stop fetches requested');
        this._state.searchStopRequested = true;
        this._state.searchGeneration = (this._state.searchGeneration || 0) + 1;
    },

    _finishStoppedSearch(items) {
        const list = items || [];
        const hydratedCount = list.filter((it) => it && it.hydrated).length;
        Logger.info('search-output: search stopped — ' + list.length + ' item(s)'
            + (hydratedCount > 0 ? ', ' + hydratedCount + ' hydrated' : ''));
        const hadPrior = this._isAdditiveResultsMode()
            && Array.isArray(this._state.resultsLoadSnapshot)
            && this._state.resultsLoadSnapshot.length > 0;
        this._finalizeResultsLoad(list, {
            committed: hadPrior ? null : this._state.committed,
            skipFiltersTab: list.length === 0
        });
        this._state.searchFetchActive = false;
        this._state.loading = false;
        this._state.searchLoadPhase = '';
        this._state.searchStopRequested = false;
        this._resetSearchLoadLog();
        this._setSearchButtonLoading(false);
        this._updateSubstringErrorUi();
        this._updateApplyFiltersUi();
        this._refreshResultsView({ filterSource: 'search-defaults' });
    },

    _stopSearchButtonHtml() {
        if (!this._canShowStopSearchButton()) return '';
        const cls = this._dashBtnClass('basic', 'compact');
        return `<button type="button" data-wf-dash-stop-search="1" class="${cls}" style="margin-bottom: 10px;">Stop Fetches</button>`;
    },

    _resetSearchLoadLog() {
        if (!this._state) return;
        this._state.searchLoadLog = [];
        this._searchLoadEntrySeq = 0;
    },

    _beginSearchLoadEntry(message) {
        if (!this._state || !this._state.loading) return null;
        const id = ++this._searchLoadEntrySeq;
        const entry = { id, message: String(message || '').trim(), resolved: false };
        if (!Array.isArray(this._state.searchLoadLog)) this._state.searchLoadLog = [];
        this._state.searchLoadLog.unshift(entry);
        this._syncSearchLoadPhaseUi();
        return id;
    },

    _updateSearchLoadEntry(id, message) {
        if (!this._state || id == null) return;
        const log = this._state.searchLoadLog;
        if (!Array.isArray(log)) return;
        const entry = log.find((e) => e.id === id);
        if (!entry || entry.resolved) return;
        entry.message = String(message || '').trim();
        this._syncSearchLoadPhaseUi();
    },

    _resolveSearchLoadEntry(id, message) {
        if (!this._state || id == null) return;
        const log = this._state.searchLoadLog;
        if (!Array.isArray(log)) return;
        const entry = log.find((e) => e.id === id);
        if (!entry) return;
        entry.resolved = true;
        if (message) entry.message = String(message).trim();
        this._syncSearchLoadPhaseUi();
    },

    _searchLoadMessage(base, count, total) {
        const label = String(base || '').trim();
        if (count == null || Number.isNaN(Number(count))) return label;
        const n = Number(count);
        if (total != null && !Number.isNaN(Number(total)) && Number(total) !== n) {
            return label + ' (' + n + '/' + total + ')';
        }
        return label + ' (' + n + ')';
    },

    _trackSearchLoadPromise(message, promiseOrFn) {
        const base = String(message || '').trim();
        const id = this._beginSearchLoadEntry(this._searchLoadMessage(base, 0));
        const tracker = {
            setCount: (count, total) => {
                this._updateSearchLoadEntry(id, this._searchLoadMessage(base, count, total));
            },
            setMessage: (text) => {
                this._updateSearchLoadEntry(id, String(text || '').trim());
            },
            resolve: (count, total) => {
                this._resolveSearchLoadEntry(
                    id,
                    count != null ? this._searchLoadMessage(base, count, total) : undefined
                );
            }
        };
        const run = typeof promiseOrFn === 'function' ? promiseOrFn(tracker) : promiseOrFn;
        return Promise.resolve(run).then(
            (value) => {
                const log = this._state.searchLoadLog;
                const entry = Array.isArray(log) ? log.find((e) => e.id === id) : null;
                if (!entry || entry.resolved) return value;
                if (Array.isArray(value)) {
                    tracker.resolve(value.length);
                } else if (value instanceof Map) {
                    tracker.resolve(value.size);
                } else if (typeof value === 'number' && !Number.isNaN(value)) {
                    tracker.resolve(value);
                } else if (value && typeof value === 'object') {
                    if (Array.isArray(value.rows)) {
                        tracker.resolve(value.rows.length);
                    } else if (value.openDisputesByTaskId instanceof Map) {
                        let rowCount = 0;
                        for (const rows of value.openDisputesByTaskId.values()) rowCount += rows.length;
                        tracker.resolve(rowCount);
                    } else if (value.resolverDisputeTaskIds instanceof Set) {
                        tracker.resolve(value.resolverDisputeTaskIds.size);
                    } else {
                        tracker.resolve();
                    }
                } else {
                    tracker.resolve();
                }
                return value;
            },
            (err) => {
                this._resolveSearchLoadEntry(id, base + ' — failed');
                throw err;
            }
        );
    },

    _visibleSearchLoadLogEntries() {
        const log = Array.isArray(this._state.searchLoadLog) ? this._state.searchLoadLog : [];
        const unresolvedEntries = log.filter((e) => !e.resolved);
        const resolvedEntries = log.filter((e) => e.resolved);
        const cap = Math.max(unresolvedEntries.length, 5);
        return [...unresolvedEntries, ...resolvedEntries].slice(0, cap);
    },

    _searchLoadLogHtml() {
        const entries = this._visibleSearchLoadLogEntries();
        if (entries.length === 0) return '';
        const rowStyle = 'display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 400;'
            + ' line-height: 1.5; min-width: 0;';
        const lines = entries.map((e) => {
            const failed = e.resolved && String(e.message || '').endsWith('— failed');
            const textStyle = e.resolved
                ? (failed ? 'color: var(--destructive, #dc2626);' : 'color: var(--success, #16a34a);')
                : 'color: var(--muted-foreground, #64748b);';
            const mark = e.resolved
                ? '<span aria-hidden="true" style="flex-shrink: 0; width: 12px; text-align: center;">✅</span>'
                : this._loadingSpinnerHtml(12);
            return `<div data-wf-dash-results-load-log-line="${e.id}" style="${rowStyle}${textStyle}">${mark}<span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${dashEscHtml(e.message)}</span></div>`;
        }).join('');
        return `<div data-wf-dash-results-load-log style="margin-top: 8px; max-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px;">${lines}</div>`;
    },

    _syncSearchLoadPhaseUi() {
        const wrap = this._q('#wf-dash-results');
        if (!wrap || !this._state || !this._state.loading) return;
        const phase = String(this._state.searchLoadPhase || '').trim();
        const phaseStyle = 'font-size: 13px; font-weight: 500; color: var(--foreground, #0f172a); line-height: 1.45;';
        const colStyle = 'display: flex; flex-direction: column; align-items: flex-start; min-width: 0; max-width: min(420px, 100%);';
        const stopBtnHtml = this._stopSearchButtonHtml();
        const logHtml = this._searchLoadLogHtml();
        let loadingEl = wrap.querySelector('[data-wf-dash-results-loading]');
        if (!loadingEl) {
            wrap.innerHTML = `<div data-wf-dash-results-loading="1" style="display: flex; align-items: flex-start; justify-content: center; gap: 10px; padding: 48px 16px; min-height: 120px;">
                ${this._loadingSpinnerHtml(20)}
                <div data-wf-dash-results-load-col style="${colStyle}">
                    ${stopBtnHtml}
                    <span data-wf-dash-results-load-phase style="${phaseStyle}${phase ? '' : ' display: none;'}">${dashEscHtml(phase)}</span>
                    ${logHtml}
                </div>
            </div>`;
            return;
        }
        const colEl = loadingEl.querySelector('[data-wf-dash-results-load-col]');
        let stopBtn = colEl ? colEl.querySelector('[data-wf-dash-stop-search]') : null;
        if (stopBtnHtml) {
            if (!stopBtn && colEl) {
                colEl.insertAdjacentHTML('afterbegin', stopBtnHtml);
            }
        } else if (stopBtn) {
            stopBtn.remove();
        }
        const phaseEl = loadingEl.querySelector('[data-wf-dash-results-load-phase]');
        if (phaseEl) {
            phaseEl.textContent = phase;
            phaseEl.style.display = phase ? '' : 'none';
        }
        const logEl = loadingEl.querySelector('[data-wf-dash-results-load-log]');
        if (logEl) logEl.remove();
        if (logHtml && colEl) colEl.insertAdjacentHTML('beforeend', logHtml);
    },

    _setSearchLoadPhase(message, count, total) {
        if (!this._state || !this._state.loading) return;
        this._state.searchLoadPhase = this._searchLoadMessage(String(message || '').trim(), count, total);
        this._syncSearchLoadPhaseUi();
    },

    _searchFetchSourcesLabel({ includeTaskCreation, includeQa, includeDisputes, includeSeniorReview }) {
        const parts = [];
        if (includeTaskCreation) parts.push('task creations');
        if (includeQa) parts.push('QA feedback');
        if (includeDisputes) parts.push('disputes');
        if (includeSeniorReview) parts.push('Sr Review flags');
        if (parts.length === 0) return 'Fetching data…';
        if (parts.length === 1) return 'Fetching ' + parts[0] + '…';
        if (parts.length === 2) return 'Fetching ' + parts[0] + ' and ' + parts[1] + '…';
        if (parts.length === 3) {
            return 'Fetching ' + parts[0] + ', ' + parts[1] + ', and ' + parts[2] + '…';
        }
        return 'Fetching ' + parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1] + '…';
    },

    _updateResultsStatus() {
        const el = this._q('#wf-dash-results-status');
        if (!el) return;
        const s = this._state;
        const label = this._labelStyle();

        if (s.loading) {
            const committed = s.committed;
            const retrieving = committed && committed.retrieveMode;
            const detail = retrieving
                ? ('task: ' + (committed.retrieveLabel || ''))
                : this._searchStatusDetail(committed);
            const verb = retrieving ? 'Retrieving' : 'Searching';
            el.innerHTML = detail
                ? `<span style="${label}">${verb} — ${dashEscHtml(detail)}</span>`
                : `<span style="${label}">${verb}…</span>`;
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
            if (committed.accumulatedResults) {
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
                const filterNote = this._hasActiveFilters() ? ' · filters active' : '';
                el.innerHTML = `<span style="${label}">${dashEscHtml(countLabel)} — accumulated results${dashEscHtml(filterNote)}</span>`;
                return;
            }
            if (committed.retrieveMode) {
                const scopeTotal = this._getFilterScopeItems().length;
                const countLabel = s.filteredItems.length === scopeTotal
                    ? s.filteredItems.length + ' result(s)'
                    : s.filteredItems.length + ' of ' + scopeTotal + ' result(s)';
                const filterNote = this._hasActiveFilters() ? ' · filters active' : '';
                el.innerHTML = `<span style="${label}">${dashEscHtml(countLabel)} — retrieved task ${dashEscHtml(committed.retrieveLabel || '')} · fully hydrated${dashEscHtml(filterNote)}</span>`;
                return;
            }
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
            if (committed.includeSeniorReview) modes.push({ kind: 'senior_review', label: 'Sr Review' });
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
            const flagsNote = s.flagsBulkIncomplete
                ? ' · Sr Review list may be incomplete (narrow date range)'
                : '';
            const prefetchLoadingNote = this._prefetchLoadingActive()
                ? ' · loading prefetch caches…'
                : '';
            el.innerHTML = `<span style="${label}">${dashEscHtml(countLabel)} — ${dashEscHtml(authorLabel)} · ${modeHtml}${dashEscHtml(filterNote)}${dashEscHtml(depthNote)}${dashEscHtml(disputesNote)}${dashEscHtml(flagsNote)}${dashEscHtml(prefetchLoadingNote)}</span>`;
            return;
        }
        el.textContent = '';
    },

    // ── Results rendering ──,

    _renderResults() {
        const wrap = this._q('#wf-dash-results');
        if (!wrap) return;
        const s = this._state;
        const muted = 'font-size: 12px; color: var(--muted-foreground, #64748b);';

        if (s.loading) {
            this._syncSearchLoadPhaseUi();
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

    _copyChipHtml(text, highlight) {
        const value = String(text == null ? '' : text).trim();
        if (!value) {
            return `<span style="display: inline-block; padding: 3px 8px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; font-size: 11px; color: var(--muted-foreground, #64748b); opacity: 0.6;">—</span>`;
        }
        const inner = (highlight && highlight.query)
            ? this._dashHighlightedHtml(value, highlight.query, highlight.caseSensitive, highlight.fuzzy, highlight.regex)
            : dashEscHtml(value);
        return `<button type="button" data-wf-dash-copy="${dashEscHtml(value)}" title="Click to copy" style="display: inline-block; max-width: 100%; padding: 3px 8px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; font-size: 11px; color: var(--foreground, #0f172a); background: transparent; text-align: left; overflow-wrap: anywhere; cursor: pointer;">${inner}</button>`;
    },

    _copyIconHtml(text) {
        const value = String(text == null ? '' : text);
        return `<button type="button" data-wf-dash-copy="${dashEscHtml(value)}" title="Copy" aria-label="Copy" style="display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border-radius: 6px; border: none; background: transparent; color: var(--muted-foreground, #64748b); cursor: pointer;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>`;
    },

    _pagerChevronSvg(dir) {
        const path = dir === 'prev' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6';
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
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
        return `<button type="button" data-wf-dash-open-task="1" data-task-id="${dashEscHtml(taskId)}" data-team-id="${dashEscHtml(teamId)}" data-item-id="${dashEscHtml(itemId)}" title="${dashEscHtml(title)}" aria-label="${dashEscHtml(title)}" class="${this._dashBtnClass('basic', 'icon')}">`
            + `${this._extLinkIconSvg(true)}`
            + `</button>`;
    },

    _labelSpan(text) {
        return `<span style="${this._labelStyle()}">${dashEscHtml(text)}</span>`;
    },


    _promptVersionCountHtml(versionNo, totalVersions) {
        const labelStyle = this._labelStyle();
        return `<span style="${labelStyle}">${dashEscHtml(' ' + versionNo + ' of ' + totalVersions)}</span>`;
    },

    _collapsedVersionPickerHtml(itemId, taskId, versions, selectedDisplayNo, totalVersions) {
        const versionOptions = [...versions]
            .sort((a, b) => a.displayVersionNo - b.displayVersionNo)
            .map((v) => `<option value="${v.displayVersionNo}"${v.displayVersionNo === selectedDisplayNo ? ' selected' : ''}>v${v.displayVersionNo} of ${totalVersions}</option>`)
            .join('');
        return `<span style="display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <select data-wf-dash-card-version-select="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(taskId)}" style="${this._inputStyle()} width: auto; padding: 2px 8px; font-size: 11px; cursor: pointer;" aria-label="Select prompt version">${versionOptions}</select>
            <button type="button" data-wf-dash-card-show-all="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(taskId)}" class="${this._dashBtnClass('basic', 'compact')}">Show All</button>
        </span>`;
    },

    _expandedVersionHeaderHtml(itemId, taskId, displayVersionNo, totalVersions) {
        return `<span style="display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${this._promptVersionCountHtml(displayVersionNo, totalVersions)}
            <button type="button" data-wf-dash-card-collapse="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(taskId)}" data-display-no="${displayVersionNo}" class="${this._dashBtnClass('basic', 'compact')}">Collapse</button>
        </span>`;
    },


    _fieldGroupHtml(label, valueHtml) {
        return `<div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; max-width: 100%; min-width: 0;">${this._labelSpan(label)}<span style="min-width: 0; max-width: 100%; display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap;">${valueHtml}</span></div>`;
    },

    _plainTimestampHtml(iso, prefixLabel) {
        const formatted = dashFormatCreatedAt(iso);
        const ago = dashRelativeAgo(iso);
        const parts = [];
        if (prefixLabel) {
            parts.push(`<span style="${this._labelStyle()}">${dashEscHtml(prefixLabel)}</span>`);
        }
        parts.push(`<span style="color: var(--foreground, #0f172a);">${dashEscHtml(formatted)}</span>`);
        if (ago) {
            parts.push(`<span style="font-size: 11px; color: var(--muted-foreground, #64748b);">(${dashEscHtml(ago)})</span>`);
        }
        return `<span style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: nowrap;">${parts.join('')}</span>`;
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

    _statusDisplayMeta(status) {
        const key = (status || 'unknown').toLowerCase();
        let color = 'var(--muted-foreground, #64748b)';
        let bg = 'color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent)';
        let label = status || '—';
        if (key.includes('production')) { color = '#15803d'; bg = 'color-mix(in srgb, #16a34a 14%, transparent)'; }
        else if (key === 'bugged') { color = DASH_FLAGGED_COLOR; bg = DASH_FLAGGED_BG; label = 'Bugged'; }
        else if (key.includes('review')) { color = '#b45309'; bg = 'color-mix(in srgb, #d97706 14%, transparent)'; }
        return { color, bg, label };
    },

    _statusBadgeHtml(status) {
        const meta = this._statusDisplayMeta(status);
        return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: ${meta.color}; background: ${meta.bg};">${dashEscHtml(meta.label)}</span>`;
    },

    _qaAlertBadgeStyle() {
        return 'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #fff7ed; background: #9a3412; border: 1px solid #7c2d12;';
    },

    _qaAlertIssueBadgeStyle() {
        return this._qaAlertBadgeStyle().replace('font-weight: 700', 'font-weight: 600');
    },

    _qaAcceptedBlockStyle() {
        return {
            border: '1px solid color-mix(in srgb, #16a34a 35%, transparent)',
            background: 'color-mix(in srgb, #16a34a 8%, transparent)'
        };
    },

    _qaReturnedBlockStyle() {
        return {
            border: '1px solid color-mix(in srgb, #dc2626 40%, transparent)',
            background: 'color-mix(in srgb, #dc2626 8%, transparent)'
        };
    },

    _qaOtherBlockStyle() {
        return {
            border: '1px solid color-mix(in srgb, #c2410c 45%, transparent)',
            background: 'color-mix(in srgb, #c2410c 32%, var(--card, #ffffff))'
        };
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

    _qaBlockHtml(qa, highlightQuery, caseSensitive, highlightFuzzy, highlightRegex, feedbackId) {
        const positive = qa.isPositive;
        const isVerifierFailure = Boolean(qa.isVerifierFailure);
        const isSystem = Boolean(qa.isSystemFeedback);
        const isFlagged = Boolean(qa.isFlaggedAsBugged);
        const isOther = isSystem || isVerifierFailure || qa.isEscalated || isFlagged;
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        let blockStyle;
        if (positive && !isOther) {
            blockStyle = this._qaAcceptedBlockStyle();
        } else if (!positive && !isOther) {
            blockStyle = this._qaReturnedBlockStyle();
        } else {
            blockStyle = this._qaOtherBlockStyle();
        }
        const border = blockStyle.border;
        const bg = blockStyle.background;
        const alertBadge = this._qaAlertBadgeStyle();
        const statusLabel = isVerifierFailure
            ? `<span style="${alertBadge}">Verifier Generation Error</span>`
            : (isSystem
            ? ''
            : (positive
                ? `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #15803d; background: color-mix(in srgb, #16a34a 14%, transparent);">Accepted</span>`
                : (qa.isEscalated
                    ? `<span style="${alertBadge}">Escalated for Fleet Review</span>`
                    : (isFlagged
                        ? `<span style="${alertBadge}">Flagged as Bugged</span>`
                        : `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #b91c1c; background: color-mix(in srgb, #dc2626 14%, transparent);">Returned for Revision</span>`))));
        const issueBadgeStyle = isOther
            ? this._qaAlertIssueBadgeStyle()
            : 'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: #b45309; background: color-mix(in srgb, #d97706 14%, transparent);';
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
        const helpfulnessHtml = this._shouldShowHelpfulness(qa, feedbackId)
            ? `<div style="margin-top: 8px; border-radius: 6px; background: var(--card, #ffffff);">
                <div style="padding: 8px 10px; background: var(--card, #ffffff); border-radius: 6px; display: flex; flex-direction: column; gap: 6px;" data-wf-dash-helpfulness="${dashEscHtml(String(feedbackId))}">
                    ${this._helpfulnessBlockHtml(String(feedbackId))}
                </div>
            </div>`
            : '';
        return `
            <div style="margin-top: 12px; padding: 10px 12px; border: ${border}; border-radius: 8px; background: ${bg}; display: flex; flex-direction: column; gap: 8px;">
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
                ${helpfulnessHtml}
            </div>`;
    },

    _feedbackActionBadgeHtml(entry, compact) {
        if (!entry) return '';
        const isVerifierFailure = Boolean(entry.isVerifierFailure || (entry.display && entry.display.isVerifierFailure));
        const isSystem = Boolean(entry.isSystemFeedback || (entry.display && entry.display.isSystemFeedback))
            || isVerifierFailure;
        let label = 'Returned';
        if (isSystem) label = 'System';
        else if (entry.isPositive) label = 'Accepted';
        else if (entry.isEscalated) label = 'Escalated';
        else if (entry.isFlaggedAsBugged) label = 'Flagged';

        if (isSystem || entry.isEscalated || entry.isFlaggedAsBugged) {
            let style = this._qaAlertBadgeStyle();
            if (compact) {
                style = style.replace('padding: 2px 8px', 'padding: 1px 6px').replace('border-radius: 6px', 'border-radius: 4px');
            }
            return `<span style="${style}">${dashEscHtml(label)}</span>`;
        }
        const pad = compact ? '1px 6px' : '2px 8px';
        const radius = compact ? '4px' : '6px';
        const cls = entry.isPositive
            ? 'color: #15803d; background: color-mix(in srgb, #16a34a 14%, transparent);'
            : 'color: #b91c1c; background: color-mix(in srgb, #dc2626 14%, transparent);';
        return `<span style="display: inline-flex; align-items: center; padding: ${pad}; border-radius: ${radius}; font-size: 10px; font-weight: 700; ${cls}">${dashEscHtml(label)}</span>`;
    },

    _reviewerBadgeHtml(entry, active, taskId, itemId) {
        const isVerifierFailure = Boolean(entry.isVerifierFailure || (entry.display && entry.display.isVerifierFailure));
        const isSystem = Boolean(entry.isSystemFeedback || (entry.display && entry.display.isSystemFeedback))
            || isVerifierFailure;
        const name = isSystem ? 'System' : (entry.reviewer.name || entry.reviewer.email || 'Reviewer');
        const actionBadge = this._feedbackActionBadgeHtml(entry, true);
        const border = active ? 'border: 1px solid color-mix(in srgb, var(--foreground, #0f172a) 25%, transparent); background: var(--accent, #f1f5f9);' : 'border: 1px solid var(--border, #e2e8f0); background: transparent;';
        if (isSystem) {
            return `<button type="button" data-wf-dash-reviewer-badge="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(taskId)}" data-display-no="${entry.linkedDisplayVersionNo}" title="Show version ${entry.linkedDisplayVersionNo}" style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; cursor: pointer; ${border}">
                ${actionBadge}
            </button>`;
        }
        return `<button type="button" data-wf-dash-reviewer-badge="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(taskId)}" data-display-no="${entry.linkedDisplayVersionNo}" title="Show version ${entry.linkedDisplayVersionNo}" style="display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 6px; font-size: 10px; cursor: pointer; ${border}">
            <span style="font-weight: 600; color: var(--foreground, #0f172a);">${dashEscHtml(name)}</span>
            ${actionBadge}
        </button>`;
    },

    _disputeClaimControlHtml(display, itemId) {
        if (display.resolutionAt) return '';
        const disputeId = String(display.id || '').trim();
        if (!disputeId) return '';
        const ui = this._getDisputeClaimUi(disputeId);
        const url = dashFleetDisputeUrl(disputeId);
        const baseClass = this._dashBtnClass('secondary', 'nav');
        const baseStyle = ' padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;';
        if (ui.status === 'claimed' && url) {
            return `<a href="${dashEscHtml(url)}" target="_blank" rel="noopener noreferrer" title="Open dispute in Fleet" aria-label="Open dispute in Fleet" class="${baseClass}" style="${baseStyle} text-decoration: none;">`
                + `<span>Claim and Resolve</span>${this._extLinkIconSvg(true)}</a>`;
        }
        if (ui.status === 'claiming') {
            return `<button type="button" disabled aria-busy="true" class="${baseClass}" style="${baseStyle} cursor: wait;">`
                + `${this._loadingSpinnerHtml(14)}`
                + `<span>Leasing dispute...</span>`
                + `</button>`;
        }
        return `<button type="button" data-wf-dash-dispute-claim="1" data-dispute-id="${dashEscHtml(disputeId)}" data-item-id="${dashEscHtml(itemId)}" title="Claim this dispute" class="${baseClass}" style="${baseStyle}">`
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
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0;">
                                <span style="font-weight: 600; color: var(--foreground, #0f172a);">Resolution</span>
                                ${resolvedHtml}
                            </div>
                            <div style="flex-shrink: 0; margin-left: auto;">${statusLabel}</div>
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
        const disputeRightHtml = (categoryHtml || claimControlHtml)
            ? `<div style="display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: auto;">${categoryHtml}${claimControlHtml}</div>`
            : '';
        return `
            <div style="margin-top: 8px; padding: 10px 12px; border: ${border}; border-radius: 8px; background: ${bg}; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0;">
                        <span style="font-weight: 600; color: var(--foreground, #0f172a);">Dispute</span>
                        ${submittedHtml}
                    </div>
                    ${disputeRightHtml}
                </div>
                <div>
                    <div style="display: flex; align-items: center; gap: 6px;">${this._labelSpan('Reason')}${this._copyIconHtml(display.reason)}</div>
                    <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${reasonBody}</p>
                </div>
                ${resolutionHtml}
            </div>`;
    },

    _noneProvidedBadgeHtml() {
        return '<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: var(--muted-foreground, #64748b); background: color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent); letter-spacing: 0.04em;">NONE PROVIDED</span>';
    },

    _flagBlockHtml(display, highlightQuery, caseSensitive, highlightFuzzy, highlightRegex, itemId) {
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        const blockStyle = this._qaOtherBlockStyle();
        const alertBadge = this._qaAlertBadgeStyle();
        const issueBadgeStyle = this._qaAlertIssueBadgeStyle();
        const border = blockStyle.border;
        const bg = blockStyle.background;
        const submittedHtml = display.createdAt
            ? this._fieldGroupHtml('Submitted', this._plainTimestampHtml(display.createdAt))
            : '';
        const reasonLabel = display.reason || display.reasonKey || 'Unknown';
        const issuesHtml = `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Issues')}<span style="${issueBadgeStyle}">${dashEscHtml(reasonLabel)}</span></div>`;
        const noteText = String(display.note || '').trim();
        const reviewerNoteHtml = noteText
            ? `<div>
                <div style="display: flex; align-items: center; gap: 6px;">${this._labelSpan('Reviewer Note')}${this._copyIconHtml(noteText)}</div>
                <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${this._dashHighlightedHtml(noteText, hq, cs, fz, rx)}</p>
            </div>`
            : `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Reviewer Note')}${this._noneProvidedBadgeHtml()}</div>`;
        let resolutionHtml = '';
        if (display.resolutionAt) {
            let resBorder;
            let resBg;
            let statusLabel;
            if (display.isConfirmed) {
                resBorder = 'color-mix(in srgb, #16a34a 35%, transparent)';
                resBg = 'color-mix(in srgb, #16a34a 8%, transparent)';
                statusLabel = '<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #15803d; background: color-mix(in srgb, #16a34a 14%, transparent);">Confirmed</span>';
            } else if (display.isDismissed) {
                resBorder = 'color-mix(in srgb, #dc2626 40%, transparent)';
                resBg = 'color-mix(in srgb, #dc2626 8%, transparent)';
                statusLabel = '<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #b91c1c; background: color-mix(in srgb, #dc2626 14%, transparent);">Dismissed</span>';
            } else {
                resBorder = 'color-mix(in srgb, var(--muted-foreground, #64748b) 35%, transparent)';
                resBg = 'color-mix(in srgb, var(--muted-foreground, #64748b) 8%, transparent)';
                statusLabel = `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: var(--muted-foreground, #64748b); background: color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent);">${dashEscHtml(display.status || 'Resolved')}</span>`;
            }
            const resolutionBody = display.resolutionNote
                ? this._dashHighlightedHtml(display.resolutionNote, hq, cs, fz, rx)
                : '—';
            const resolvedHtml = this._fieldGroupHtml('Resolved', this._plainTimestampHtml(display.resolutionAt));
            const resolverHtml = display.resolverId
                ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">${this._personChipsHtml(display.resolverName, display.resolverEmail, display.resolverId, 'Open resolver in Fleet')}</div>`
                : '';
            resolutionHtml = `
                <div style="margin-top: 8px; border-radius: 6px; background: var(--card, #ffffff);">
                    <div style="padding: 8px 10px; border: 1px solid ${resBorder}; border-radius: 6px; background: ${resBg}; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0;">
                                <span style="font-weight: 600; color: var(--foreground, #0f172a);">Resolution</span>
                                ${resolvedHtml}
                            </div>
                            <div style="flex-shrink: 0; margin-left: auto;">${statusLabel}</div>
                        </div>
                        ${resolverHtml}
                        <div>
                            <div style="display: flex; align-items: center; gap: 6px;">${this._labelSpan('Resolution Note')}${this._copyIconHtml(display.resolutionNote)}</div>
                            <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${resolutionBody}</p>
                        </div>
                    </div>
                </div>`;
        }
        const flagResolutionInputHtml = (display.isPending && itemId)
            ? `<div style="margin-top: 8px; border-radius: 6px; background: var(--card, #ffffff);">
                <div style="padding: 8px 10px; background: var(--card, #ffffff); border-radius: 6px; display: flex; flex-direction: column; gap: 6px;" data-wf-dash-flag-resolution="${dashEscHtml(String(display.id || ''))}" data-wf-dash-item-id="${dashEscHtml(String(itemId))}">
                    ${this._flagResolutionBlockHtml(display.id, itemId)}
                </div>
            </div>`
            : '';
        return `
            <div style="margin-top: 8px; padding: 10px 12px; border: ${border}; border-radius: 8px; background: ${bg}; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0;">
                        <span style="font-weight: 600; color: var(--foreground, #0f172a);">Senior Review Flag</span>
                        ${submittedHtml}
                    </div>
                    <div style="flex-shrink: 0; margin-left: auto;"><span style="${alertBadge}">Flagged for Review</span></div>
                </div>
                ${issuesHtml}
                ${reviewerNoteHtml}
                ${resolutionHtml}
                ${flagResolutionInputHtml}
            </div>`;
    },

    _orphanFallbackDisplayNo(allFeedback, promptVersions) {
        const firstNegative = allFeedback.find((f) => !f.isPositive && !f.isSystemFeedback && !f.isVerifierFailure);
        if (firstNegative) return firstNegative.linkedDisplayVersionNo;
        const vers = promptVersions || [];
        return vers.length ? vers[vers.length - 1].displayVersionNo : 1;
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

    _feedbackEntryAt(entry) {
        return String(entry.feedbackAt || (entry.display && entry.display.feedbackAt) || '');
    },

    _feedbackEntriesOldestFirst(entries) {
        return [...(entries || [])].sort((a, b) => {
            const aAt = this._feedbackEntryAt(a);
            const bAt = this._feedbackEntryAt(b);
            return aAt < bAt ? -1 : aAt > bAt ? 1 : 0;
        });
    },

    _sortTaskActionBlocksByDate(blocks) {
        return [...(blocks || [])].sort((a, b) => {
            const aAt = String(a.sortAt || '');
            const bAt = String(b.sortAt || '');
            return aAt < bAt ? -1 : aAt > bAt ? 1 : 0;
        });
    },

    _versionTaskActionsHtml(feedbackEntries, fallbackFeedback, orphanDisputes, orphanFlags, highlightQuery, caseSensitive, highlightFuzzy, highlightRegex, itemId) {
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        const blocks = [];
        const orderedFeedback = this._feedbackEntriesOldestFirst(feedbackEntries);
        for (const entry of orderedFeedback) {
            if (entry.display) {
                blocks.push({
                    sortAt: this._feedbackEntryAt(entry),
                    html: this._qaBlockHtml(entry.display, hq, cs, fz, rx, entry.id)
                });
            }
            for (const dispute of entry.disputes || []) {
                blocks.push({
                    sortAt: String(dispute.submittedAt || ''),
                    html: this._disputeBlockHtml(dispute, hq, cs, fz, itemId, rx)
                });
            }
        }
        if (fallbackFeedback) {
            blocks.push({
                sortAt: String(fallbackFeedback.feedbackAt || ''),
                html: this._qaBlockHtml(fallbackFeedback, hq, cs, fz, rx, null)
            });
        }
        for (const dispute of orphanDisputes || []) {
            blocks.push({
                sortAt: String(dispute.submittedAt || ''),
                html: this._disputeBlockHtml(dispute, hq, cs, fz, itemId, rx)
            });
        }
        for (const flag of orphanFlags || []) {
            blocks.push({
                sortAt: String(flag.createdAt || ''),
                html: this._flagBlockHtml(flag, hq, cs, fz, rx, itemId)
            });
        }
        return this._sortTaskActionBlocksByDate(blocks).map((block) => block.html).join('');
    },

    _quickTaskActionsHtml(item, highlightQuery, caseSensitive, highlightFuzzy, highlightRegex) {
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        const itemId = item.id;
        const blocks = [];
        if (item.qaFeedback) {
            blocks.push({
                sortAt: String(item.qaFeedback.feedbackAt || ''),
                html: this._qaBlockHtml(item.qaFeedback, hq, cs, fz, rx, item.selectedFeedbackId || null)
            });
        }
        for (const dispute of item.disputes || []) {
            blocks.push({
                sortAt: String(dispute.submittedAt || ''),
                html: this._disputeBlockHtml(dispute, hq, cs, fz, itemId, rx)
            });
        }
        for (const flag of item.flags || []) {
            blocks.push({
                sortAt: String(flag.createdAt || ''),
                html: this._flagBlockHtml(flag, hq, cs, fz, rx, itemId)
            });
        }
        return this._sortTaskActionBlocksByDate(blocks).map((block) => block.html).join('');
    },

    _versionSectionHtml(taskId, version, totalVersions, feedbackEntries, highlightQuery, caseSensitive, highlightFuzzy, showVersionLabel, fallbackFeedback, orphanDisputes, orphanFlags, itemId, highlightRegex, versionHeaderControls) {
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        const orderedFeedback = this._feedbackEntriesOldestFirst(feedbackEntries);
        const promptBody = version.prompt
            ? this._dashHighlightedHtml(version.prompt, hq, cs, fz, rx)
            : '—';
        let promptLabel;
        if (versionHeaderControls) {
            promptLabel = versionHeaderControls;
        } else if (showVersionLabel) {
            promptLabel = this._promptVersionCountHtml(version.displayVersionNo, totalVersions);
        } else {
            promptLabel = this._labelSpan('Prompt');
        }
        const showPromptCopy = !showVersionLabel && !versionHeaderControls;
        const versionActionEntry = orderedFeedback.length ? orderedFeedback[orderedFeedback.length - 1] : null;
        const versionActionBadge = this._feedbackActionBadgeHtml(versionActionEntry);
        const taskActionsHtml = this._versionTaskActionsHtml(
            feedbackEntries, fallbackFeedback, orphanDisputes, orphanFlags,
            hq, cs, fz, rx, itemId
        );
        const submittedHtml = this._fieldGroupHtml('Submitted', this._plainTimestampHtml(version.createdAt));
        return `
            <div>
                <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;">
                    <div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0;">
                        ${promptLabel}${showPromptCopy ? this._copyIconHtml(version.prompt) : ''}${submittedHtml}
                    </div>
                    ${versionActionBadge ? `<div style="flex-shrink: 0; margin-left: auto;">${versionActionBadge}</div>` : ''}
                </div>
                <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${promptBody}</p>
                ${taskActionsHtml}
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
                <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;">
                    <div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 3px; min-width: 0;">
                        ${this._labelSpan('Prompt')}${this._copyIconHtml(promptText)}
                    </div>
                    <div style="flex-shrink: 0; margin-left: auto;">${this._fieldGroupHtml('Submitted', this._plainTimestampHtml(task.createdAt))}</div>
                </div>
                <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${promptBody}</p>
            </div>`;
        const taskActionsHtml = this._quickTaskActionsHtml(item, hq, cs, fz, rx);
        if (item.qaFeedback) {
            bodyHtml = taskActionsHtml;
        } else {
            bodyHtml += taskActionsHtml;
        }
        const cardHtml = `
            <article class="wf-dash-task-card-article" style="position: relative; border: ${DASH_CARD_BORDER}; border-radius: 10px; background: ${DASH_TASK_CARD_BG}; overflow: hidden;">
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 10px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">
                    <div style="display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;">
                        ${this._fieldGroupHtml('Author', this._personChipsHtml(task.author.name, task.author.email, task.author.id, 'Open author in Fleet'))}
                    </div>
                    <div style="flex: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 16px; min-width: 0; margin-left: auto;">
                        ${this._fieldGroupHtml('Team', this._dataValueHtml(task.team))}
                        ${this._fieldGroupHtml('Project', this._dataValueHtml(task.project) + projectLink)}
                        ${this._fieldGroupHtml('Environment', this._dataValueHtml(task.environment))}
                    </div>
                </div>
                ${this._userStorySectionHtml(itemId)}
                <div style="padding: 12px 14px; font-size: 12px;">${bodyHtml}</div>
            </article>`;
        return this._resultCardOuterWrap(item, cardHtml);
    },

    _resultCardOuterWrap(item, cardHtml) {
        this._ensureCardActionStyles();
        const itemId = item.id;
        const createdTabHtml = this._cardCreatedTabHtml(item.task);
        const statusTabHtml = this._cardStatusTabHtml(item.task);
        const keyTabHtml = this._cardKeyTabHtml(item.task, itemId, {
            query: item.highlightQuery || '',
            caseSensitive: Boolean(item.highlightCaseSensitive),
            fuzzy: Boolean(item.highlightFuzzy),
            regex: Boolean(item.highlightRegex)
        });
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
                <div style="display: flex; align-items: flex-end; gap: 4px; min-width: 0;">${statusTabHtml}${createdTabHtml}${keyTabHtml}</div>
                ${hydrateTabHtml}
            </div>`;
        const actionRow = `<div class="wf-dash-card-action-row">${this._cardActionAreaHtml(itemId)}</div>`;
        return `
            <div data-wf-dash-task-card="1" data-item-id="${dashEscHtml(itemId)}" style="display: flex; flex-direction: column;">
                ${tabsRow}
                <div class="wf-dash-card-shell">
                    ${actionRow}
                    ${cardHtml}
                </div>
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
        const orphanFallbackDisplayNo = this._orphanFallbackDisplayNo(allFeedback, task.promptVersions || versions);
        const orphanFlags = item.flags || [];

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

        const projectLink = task.projectId ? this._extLinkHtml(dashFleetProjectUrl(task.projectId), 'Open project in Fleet') : '';

        const reviewerBadges = allFeedback.length > 0
            ? `<div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Reviewers')}${[...allFeedback].reverse().map((entry) => this._reviewerBadgeHtml(entry, !expanded && entry.linkedDisplayVersionNo === selectedDisplayNo, task.id, itemId)).join('')}</div>`
            : '';

        let row3Html = '';
        if (expanded) {
            row3Html = `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 8px 14px; font-size: 12px;">
                    <button type="button" data-wf-dash-timeline-order="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(task.id)}" class="${this._dashBtnClass('basic', 'compact')}">${ui.timelineNewestFirst ? 'Newest first' : 'Oldest first'}</button>
                </div>`;
        }

        const versionSections = renderedVersions.map((version) => {
            const feedbackEntries = feedbackByDisplayNo.get(version.displayVersionNo) || [];
            const fallback = !hasTimeline && allFeedback.length === 0 ? item.qaFeedback : null;
            const orphanDisputes = orphanDisputesByDisplayNo.get(version.displayVersionNo) || [];
            const orphanFlagsForVersion = version.displayVersionNo === orphanFallbackDisplayNo ? orphanFlags : [];
            let versionHeaderControls = '';
            if (hasTimeline && !expanded && version.displayVersionNo === selectedDisplayNo) {
                versionHeaderControls = this._collapsedVersionPickerHtml(itemId, task.id, versions, selectedDisplayNo, totalVersions);
            } else if (hasTimeline && expanded) {
                versionHeaderControls = this._expandedVersionHeaderHtml(itemId, task.id, version.displayVersionNo, totalVersions);
            }
            return this._versionSectionHtml(
                task.id, version, totalVersions, feedbackEntries,
                highlightQuery, caseSensitive, highlightFuzzy, hasTimeline, fallback,
                orphanDisputes, orphanFlagsForVersion, itemId, highlightRegex, versionHeaderControls
            );
        }).join('');

        const row2Html = reviewerBadges
            ? `<div style="display: flex; flex-wrap: wrap; align-items: start; justify-content: flex-start; gap: 8px 24px; padding: 8px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">
                    ${reviewerBadges}
                </div>`
            : '';

        const cardHtml = `
            <article class="wf-dash-task-card-article" style="position: relative; border: ${DASH_CARD_BORDER}; border-radius: 10px; background: ${DASH_TASK_CARD_BG}; overflow: hidden;">
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 10px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">
                    <div style="display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;">
                        ${this._fieldGroupHtml('Author', this._personChipsHtml(task.author.name, task.author.email, task.author.id, 'Open author in Fleet'))}
                    </div>
                    <div style="flex: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 16px; min-width: 0; margin-left: auto;">
                        ${this._fieldGroupHtml('Team', this._dataValueHtml(task.team))}
                        ${this._fieldGroupHtml('Project', this._dataValueHtml(task.project) + projectLink)}
                        ${this._fieldGroupHtml('Environment', this._dataValueHtml(task.environment))}
                    </div>
                </div>
                ${row2Html}
                ${this._userStorySectionHtml(itemId)}
                ${row3Html}
                <div style="display: flex; flex-direction: column; gap: 12px; padding: 12px 14px; font-size: 12px;">
                    ${versionSections}
                </div>
            </article>`;

        return this._resultCardOuterWrap(item, cardHtml);
    },

    // ── Copy feedback (color-only: 1s green / 0.5s red pulse) ──,

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

function attachSearchOutputListeners(modal, dash) {
    if (!modal || !dash) return;
    if (modal.dataset.wfSearchOutputListenersAttached === '1') return;
    modal.dataset.wfSearchOutputListenersAttached = '1';

        const depthQuick = dash._q('#wf-dash-depth-quick');
        const depthDeep = dash._q('#wf-dash-depth-deep');
        if (depthQuick) depthQuick.addEventListener('click', () => dash._setSearchDepth('quick'));
        if (depthDeep) depthDeep.addEventListener('click', () => dash._setSearchDepth('deep'));

        modal.querySelectorAll('[data-wf-dash-results-mode]').forEach((btn) => {
            btn.addEventListener('click', () => {
                dash._setResultsMode(btn.getAttribute('data-wf-dash-results-mode'));
            });
        });

        const bulkHydrate = dash._q('#wf-dash-bulk-hydrate');
        if (bulkHydrate) bulkHydrate.addEventListener('click', () => { void dash._bulkHydrateVisible(); });

        const pageSizeSel = dash._q('#wf-dash-results-page-size');
        if (pageSizeSel) {
            pageSizeSel.addEventListener('change', () => {
                const val = pageSizeSel.value;
                dash._state.resultsPageSize = val === 'all' ? 'all' : (Number(val) || DASH_RESULTS_PAGE_SIZE_DEFAULT);
                dash._persistResultsPageSizePref(val);
                dash._state.resultsPage = 0;
                Logger.log('dashboard: results page size — ' + val);
                dash._renderResults();
                dash._syncResultsPagerUi();
            });
        }

        const sortSel = dash._q('#wf-dash-sort');
        if (sortSel) {
            sortSel.addEventListener('change', () => dash._applySortAndRender());
        }

        const resultsPrev = dash._q('#wf-dash-results-prev');
        const resultsNext = dash._q('#wf-dash-results-next');
        if (resultsPrev) resultsPrev.addEventListener('click', () => dash._goResultsPage(-1));
        if (resultsNext) resultsNext.addEventListener('click', () => dash._goResultsPage(1));

        // Author token input
        const authorBox = dash._q('#wf-dash-author-box');
        const authorInput = dash._q('#wf-dash-author-input');
        if (authorBox && authorInput) {
            authorBox.addEventListener('click', () => authorInput.focus());
            authorInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const query = authorInput.value.trim();
                    if (query) void dash._resolveAuthorToken(query);
                } else if (e.key === 'Backspace' && authorInput.value === '' && dash._state.draftTokens.length > 0) {
                    dash._removeAuthorToken(dash._state.draftTokens[dash._state.draftTokens.length - 1].id);
                }
            });
            authorInput.addEventListener('input', () => {
                if (authorInput.value.endsWith(',')) {
                    const query = authorInput.value.slice(0, -1).trim();
                    authorInput.value = '';
                    if (query) void dash._resolveAuthorToken(query);
                }
                dash._setAuthorError('');
                dash._hideAuthorCandidates();
            });
        }

        // Inputs affecting search (only when unlocked)
        ['#wf-dash-after', '#wf-dash-before'].forEach((sel) => {
            const el = dash._q(sel);
            if (el) el.addEventListener('change', () => {
                dash._validateRangeUi();
                if (!dash._applyingQuickDate) {
                    const quick = dash._q('#wf-dash-quick-range');
                    if (quick) quick.value = '';
                }
            });
        });

        const clearDates = dash._q('#wf-dash-clear-dates');
        if (clearDates) clearDates.addEventListener('click', () => dash._clearDateRangeFields());

        const toggleTasks = dash._q('#wf-dash-toggle-tasks');
        const toggleQa = dash._q('#wf-dash-toggle-qa');
        const toggleDisputes = dash._q('#wf-dash-toggle-disputes');
        if (toggleTasks) toggleTasks.addEventListener('click', () => {
            dash._toggleOutputType('tasks');
            dash._validateRangeUi();
        });
        if (toggleQa) toggleQa.addEventListener('click', () => {
            dash._toggleOutputType('qa');
            dash._validateRangeUi();
        });
        if (toggleDisputes) toggleDisputes.addEventListener('click', () => {
            dash._toggleOutputType('disputes');
            dash._validateRangeUi();
        });
        const toggleSeniorReview = dash._q('#wf-dash-toggle-senior-review');
        if (toggleSeniorReview) toggleSeniorReview.addEventListener('click', () => {
            dash._toggleOutputType('senior_review');
            dash._validateRangeUi();
        });

        const prompt = dash._q('#wf-dash-prompt');
        if (prompt) {
            prompt.addEventListener('input', () => {
                dash._syncPromptFilterHeight(prompt);
                dash._updateSubstringErrorUi();
                dash._syncFieldClearButtons();
            });
            prompt.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    dash._applyFiltersAndRender();
                }
            });
        }
        const clearPrompt = dash._q('#wf-dash-clear-prompt');
        if (clearPrompt) {
            clearPrompt.addEventListener('click', () => {
                if (prompt) prompt.value = '';
                dash._updateSubstringErrorUi();
                dash._syncFieldClearButtons();
            });
        }
        const fuzzyEl = dash._q('#wf-dash-fuzzy');
        const regexEl = dash._q('#wf-dash-regex');
        if (fuzzyEl) {
            fuzzyEl.addEventListener('change', () => {
                if (fuzzyEl.checked && regexEl) regexEl.checked = false;
                dash._updateSubstringErrorUi();
            });
        }
        if (regexEl) {
            regexEl.addEventListener('change', () => {
                if (regexEl.checked && fuzzyEl) fuzzyEl.checked = false;
                dash._updateSubstringErrorUi();
            });
        }
        const caseEl = dash._q('#wf-dash-case');
        if (caseEl) caseEl.addEventListener('change', () => dash._updateSubstringErrorUi());
        const applyFilters = dash._q('#wf-dash-apply-filters');
        if (applyFilters) applyFilters.addEventListener('click', () => dash._applyFiltersAndRender());
        const resetFilters = dash._q('#wf-dash-reset-filters');
        if (resetFilters) resetFilters.addEventListener('click', () => dash._resetFiltersToDefaults());

        const manualAdd = dash._q('#wf-dash-manual-add');
        if (manualAdd) manualAdd.addEventListener('click', () => dash._buildManualFilterRow());
        const manualAndOr = dash._q('#wf-dash-manual-andor');
        if (manualAndOr) manualAndOr.addEventListener('change', () => dash._updateApplyFiltersUi());
        const manualRows = dash._q('#wf-dash-manual-rows');
        if (manualRows) {
            manualRows.addEventListener('change', (e) => {
                const fieldSel = e.target.closest('[data-wf-dash-manual-field]');
                if (!fieldSel) return;
                const row = fieldSel.closest('[data-wf-dash-manual-row]');
                if (!row) return;
                const field = fieldSel.value;
                const meta = DASH_OUTPUT_MANUAL_FILTER_FIELDS.find((f) => f.id === field);
                const isDate = meta && meta.type === 'date';
                const compSel = row.querySelector('[data-wf-dash-manual-comparator]');
                const valueInp = row.querySelector('[data-wf-dash-manual-value]');
                if (compSel) {
                    compSel.innerHTML = dashManualComparatorOptionsHtml(isDate ? 'date' : 'number', isDate ? 'gte' : 'gte');
                }
                if (valueInp) {
                    valueInp.type = isDate ? 'date' : 'number';
                    valueInp.value = '';
                }
                dash._updateApplyFiltersUi();
            });
            manualRows.addEventListener('input', () => dash._updateApplyFiltersUi());
            manualRows.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('[data-wf-dash-manual-remove]');
                if (!removeBtn || !manualRows.contains(removeBtn)) return;
                const row = removeBtn.closest('[data-wf-dash-manual-row]');
                if (row) row.remove();
                dash._updateApplyFiltersUi();
            });
        }

        const quickRange = dash._q('#wf-dash-quick-range');
        if (quickRange) {
            quickRange.addEventListener('change', () => {
                const preset = quickRange.value;
                if (!preset) return;
                dash._applyQuickDatePreset(preset);
            });
        }

        const search = dash._q('#wf-dash-search');
        if (search) search.addEventListener('click', () => { void dash._submitSearch(); });
        const clearParams = dash._q('#wf-dash-clear-params');
        if (clearParams) clearParams.addEventListener('click', () => dash._clearParameters());
        const retrieveBtn = dash._q('#wf-dash-retrieve-btn');
        if (retrieveBtn) retrieveBtn.addEventListener('click', () => { void dash._submitRetrieveTask(); });
        const retrieveClear = dash._q('#wf-dash-retrieve-clear');
        if (retrieveClear) retrieveClear.addEventListener('click', () => dash._clearRetrieveInput());
        const retrieveInput = dash._q('#wf-dash-retrieve-input');
        if (retrieveInput) {
            retrieveInput.addEventListener('input', () => {
                dash._state.retrieveInput = retrieveInput.value;
                dash._validateRangeUi();
            });
            retrieveInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    void dash._submitRetrieveTask();
                }
            });
        }
        const dropExcluded = dash._q('#wf-dash-drop-excluded');
        if (dropExcluded) dropExcluded.addEventListener('click', () => dash._dropExcludedResults());
        const clearResults = dash._q('#wf-dash-clear-results');
        if (clearResults) clearResults.addEventListener('click', () => dash._clearResults());

        modal.querySelectorAll('[data-wf-dash-left-tab]').forEach((btn) => {
            btn.addEventListener('click', () => dash._setLeftTab(btn.getAttribute('data-wf-dash-left-tab')));
        });
        const filterExpandAll = dash._q('#wf-dash-filter-expand-all');
        if (filterExpandAll) {
            filterExpandAll.addEventListener('click', () => dash._toggleFilterExpandAll());
            dash._applyFilterExpandAllButtonLabel();
        }
        const filtersScroll = dash._q('#wf-dash-left-panel-filters > div');
        if (filtersScroll) {
            filtersScroll.addEventListener('scroll', () => {
                dash._repositionOpenFlyouts();
            }, { passive: true });
        }
    modal.addEventListener('click', (e) => {
            const stopSearchBtn = e.target.closest('[data-wf-dash-stop-search]');
            if (stopSearchBtn && modal.contains(stopSearchBtn)) {
                dash._requestStopSearchFetches();
                return;
            }
            const copyEl = e.target.closest('[data-wf-dash-copy]');
            if (copyEl && modal.contains(copyEl)) {
                void dash._copyWithFeedback(copyEl, copyEl.getAttribute('data-wf-dash-copy'));
                return;
            }
            const candidate = e.target.closest('[data-wf-dash-candidate]');
            if (candidate && modal.contains(candidate)) {
                const id = candidate.getAttribute('data-wf-dash-candidate');
                const cand = (dash._state._candidates || []).find((c) => c.id === id);
                if (cand) { dash._addAuthorToken(cand); if (authorInput) authorInput.value = ''; }
                return;
            }
            const removeTok = e.target.closest('[data-wf-dash-remove-token]');
            if (removeTok && modal.contains(removeTok)) {
                e.stopPropagation();
                dash._removeAuthorToken(removeTok.getAttribute('data-wf-dash-remove-token'));
                return;
            }
            const reviewerBadge = e.target.closest('[data-wf-dash-reviewer-badge]');
            if (reviewerBadge && modal.contains(reviewerBadge)) {
                const itemId = reviewerBadge.getAttribute('data-item-id');
                const taskId = reviewerBadge.getAttribute('data-task-id');
                const displayNo = parseInt(reviewerBadge.getAttribute('data-display-no'), 10);
                const ui = dash._getCardUi(taskId);
                ui.expanded = false;
                ui.selectedDisplayNo = displayNo;
                dash._patchTaskCard(itemId);
                return;
            }
            const showAllBtn = e.target.closest('[data-wf-dash-card-show-all]');
            if (showAllBtn && modal.contains(showAllBtn)) {
                const itemId = showAllBtn.getAttribute('data-item-id');
                const taskId = showAllBtn.getAttribute('data-task-id');
                const ui = dash._getCardUi(taskId);
                ui.expanded = true;
                dash._patchTaskCard(itemId);
                return;
            }
            const collapseBtn = e.target.closest('[data-wf-dash-card-collapse]');
            if (collapseBtn && modal.contains(collapseBtn)) {
                const itemId = collapseBtn.getAttribute('data-item-id');
                const taskId = collapseBtn.getAttribute('data-task-id');
                const displayNo = parseInt(collapseBtn.getAttribute('data-display-no'), 10);
                const ui = dash._getCardUi(taskId);
                ui.expanded = false;
                ui.selectedDisplayNo = Number.isFinite(displayNo) ? displayNo : ui.selectedDisplayNo;
                dash._patchTaskCard(itemId);
                return;
            }
            const timelineToggle = e.target.closest('[data-wf-dash-timeline-order]');
            if (timelineToggle && modal.contains(timelineToggle)) {
                const itemId = timelineToggle.getAttribute('data-item-id');
                const taskId = timelineToggle.getAttribute('data-task-id');
                const ui = dash._getCardUi(taskId);
                ui.timelineNewestFirst = !ui.timelineNewestFirst;
                dash._patchTaskCard(itemId);
                return;
            }
            const openTaskBtn = e.target.closest('[data-wf-dash-open-task]');
            if (openTaskBtn && modal.contains(openTaskBtn)) {
                const taskId = openTaskBtn.getAttribute('data-task-id');
                const teamId = openTaskBtn.getAttribute('data-team-id');
                const itemId = openTaskBtn.getAttribute('data-item-id');
                if (taskId && itemId) void dash._openTaskInFleet(taskId, teamId, itemId);
                return;
            }
            const disputeClaimBtn = e.target.closest('[data-wf-dash-dispute-claim]');
            if (disputeClaimBtn && modal.contains(disputeClaimBtn)) {
                const disputeId = disputeClaimBtn.getAttribute('data-dispute-id');
                const itemId = disputeClaimBtn.getAttribute('data-item-id');
                if (disputeId && itemId) void dash._claimDispute(disputeId, itemId);
                return;
            }
            const thumbBtn = e.target.closest('[data-wf-dash-thumb]');
            if (thumbBtn && modal.contains(thumbBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const fid = thumbBtn.getAttribute('data-wf-dash-feedback-id');
                const dir = thumbBtn.getAttribute('data-wf-dash-thumb');
                if (fid && dir) void dash._handleThumbClick(fid, dir);
                return;
            }
            const qaReviewSubmitBtn = e.target.closest('[data-wf-dash-qa-review-submit]');
            if (qaReviewSubmitBtn && modal.contains(qaReviewSubmitBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const fid = qaReviewSubmitBtn.getAttribute('data-wf-dash-feedback-id');
                if (fid) void dash._handleQaReviewSubmit(fid);
                return;
            }
            const qaReviewRemoveBtn = e.target.closest('[data-wf-dash-qa-review-remove]');
            if (qaReviewRemoveBtn && modal.contains(qaReviewRemoveBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const fid = qaReviewRemoveBtn.getAttribute('data-wf-dash-feedback-id');
                if (fid) dash._handleQaReviewRemovePrompt(fid);
                return;
            }
            const qaReviewConfirmBtn = e.target.closest('[data-wf-dash-qa-review-confirm]');
            if (qaReviewConfirmBtn && modal.contains(qaReviewConfirmBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const fid = qaReviewConfirmBtn.getAttribute('data-wf-dash-feedback-id');
                if (fid) void dash._handleQaReviewRemoveConfirm(fid);
                return;
            }
            const qaReviewCancelBtn = e.target.closest('[data-wf-dash-qa-review-cancel]');
            if (qaReviewCancelBtn && modal.contains(qaReviewCancelBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const fid = qaReviewCancelBtn.getAttribute('data-wf-dash-feedback-id');
                if (fid) dash._handleQaReviewRemoveCancel(fid);
                return;
            }
            const flagConfirmBtn = e.target.closest('[data-wf-dash-flag-confirm]');
            if (flagConfirmBtn && modal.contains(flagConfirmBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const flagId = flagConfirmBtn.getAttribute('data-wf-dash-flag-id');
                const itemId = flagConfirmBtn.getAttribute('data-item-id');
                if (flagId && itemId) void dash._handleFlagResolution(flagId, itemId, 'confirmed');
                return;
            }
            const flagDismissBtn = e.target.closest('[data-wf-dash-flag-dismiss]');
            if (flagDismissBtn && modal.contains(flagDismissBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const flagId = flagDismissBtn.getAttribute('data-wf-dash-flag-id');
                const itemId = flagDismissBtn.getAttribute('data-item-id');
                if (flagId && itemId) void dash._handleFlagResolution(flagId, itemId, 'dismissed');
                return;
            }
            const addToDiffBtn = e.target.closest('[data-wf-dash-add-to-diff]');
            if (addToDiffBtn && modal.contains(addToDiffBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const itemId = addToDiffBtn.getAttribute('data-item-id');
                if (itemId) dash._addToDiffFromCard(itemId);
                return;
            }
            const getVerifierBtn = e.target.closest('[data-wf-dash-get-verifier]');
            if (getVerifierBtn && modal.contains(getVerifierBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const itemId = getVerifierBtn.getAttribute('data-item-id');
                if (itemId) void dash._getVerifierFromCard(itemId);
                return;
            }
            const removeResultBtn = e.target.closest('[data-wf-dash-remove-result]');
            if (removeResultBtn && modal.contains(removeResultBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const itemId = removeResultBtn.getAttribute('data-item-id');
                if (itemId) dash._dropResultFromSearch(itemId);
                return;
            }
            const hydrateBtn = e.target.closest('[data-wf-dash-hydrate]');
            if (hydrateBtn && modal.contains(hydrateBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const itemId = hydrateBtn.getAttribute('data-item-id');
                if (itemId) void dash._hydrateCard(itemId);
                return;
            }
            const userStoryBtn = e.target.closest('[data-wf-dash-user-story]');
            if (userStoryBtn && modal.contains(userStoryBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const itemId = userStoryBtn.getAttribute('data-item-id');
                if (itemId) void dash._toggleUserStory(itemId);
                return;
            }
    });
        modal.addEventListener('change', (e) => {
            const sel = e.target;
            if (!sel || !sel.matches('[data-wf-dash-card-version-select]')) return;
            const itemId = sel.getAttribute('data-item-id');
            const taskId = sel.getAttribute('data-task-id');
            const displayNo = parseInt(sel.value, 10);
            const ui = dash._getCardUi(taskId);
            ui.expanded = false;
            ui.selectedDisplayNo = displayNo;
            dash._patchTaskCard(itemId);
        });
        modal.addEventListener('input', (e) => {
            const ta = e.target.closest('[data-wf-dash-qa-review-input]');
            if (ta && modal.contains(ta)) {
                const fid = ta.getAttribute('data-wf-dash-feedback-id');
                if (fid) dash._handleQaReviewInput(fid, ta.value);
                return;
            }
            const flagTa = e.target.closest('[data-wf-dash-flag-resolution-input]');
            if (flagTa && modal.contains(flagTa)) {
                const flagId = flagTa.getAttribute('data-wf-dash-flag-id');
                if (flagId) dash._handleFlagResolutionInput(flagId, flagTa.value);
            }
        });
}

const plugin = {
    id: 'search-output',
    name: 'Search Output',
    description: 'Worker Output Search tab: bootstrap, search, hydrate, filters, results cards',
    _version: '2.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            Logger.error('search-output: dashboard loader not registered');
            return;
        }
        Object.assign(loader, searchOutputMethods);
        if (loader._state && loader._state.catalog == null && typeof loader._readBootstrapCache === 'function') {
            loader._state.catalog = loader._readBootstrapCache();
        }
        Context.dashboard.registerTab({
            id: 'search-output',
            label: 'Search Output',
            panelHtml(dash) { return dash._searchPanelHtml(); },
            attachListeners(modal, dash) { attachSearchOutputListeners(modal, dash); },
            onOpen(dash) {
                void dash._doBootstrap();
                dash._refreshCatalogDependentUi();
                dash._setSearchDepth('quick');
                requestAnimationFrame(() => dash._applyAllSidePanelWidths());
            },
            onBuilt(modal, dash) {
                dash._syncOutputToggleUi();
                dash._syncLeftTabUi();
                dash._refreshCatalogDependentUi();
                dash._updateResultsStatus();
                dash._updateSubstringErrorUi();
                dash._validateRangeUi();
                dash._syncFieldClearButtons();
                dash._applyDefaultSearchDates();
                dash._state.searchDepth = 'quick';
                dash._syncSearchDepthUi();
                dash._state.resultsMode = dash._readResultsModePref();
                dash._syncResultsModeUi();
                const pagePref = dash._readResultsPageSizePref();
                dash._state.resultsPageSize = pagePref === 'all' ? 'all' : (Number(pagePref) || DASH_RESULTS_PAGE_SIZE_DEFAULT);
                dash._state.resultsPage = 0;
                dash._syncResultsPageSizeUi();
                dash._syncResultsPagerUi();
            },
            onActivate(modal, dash) {
                requestAnimationFrame(() => dash._applyAllSidePanelWidths());
            }
        });
        Logger.log('search-output: tab registered');
    }

};
