// search-output.js — Worker Output Search tab (core orchestration).

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
const DASH_RESULTS_MODE_STORAGE_KEY = 'fleet-ux:dashboard-results-mode';
const DASH_INITIAL_HYDRATE_CAP = 500;
const DASH_RESULTS_PAGE_SIZE_KEY = 'fleet-ux:dashboard-results-page-size';
const DASH_HYDRATE_TAB_BG = '#64748b';
const DASH_CARD_TAB_HEIGHT = '24px';
const DASH_CARD_BORDER = '2px solid color-mix(in srgb, var(--foreground, #0f172a) 28%, var(--border, #cbd5e1))';
const DASH_CARD_TAB_BORDER = '1px solid color-mix(in srgb, var(--foreground, #0f172a) 28%, var(--border, #cbd5e1))';
const DASH_TASK_CARD_BG = '#121212';
const DASH_HYDRATE_BATCH_MAX = 100;
const DASH_HYDRATE_BATCH_CONCURRENCY = 5;
const DASH_SEARCH_FETCH_CONCURRENCY = 8;
const DASH_HELPFULNESS_BATCH_CHUNK = 100;
const DASH_RESULTS_PAGE_SIZE_DEFAULT = 100;
const DASH_BOOTSTRAP_VERSION = 3;
const DASH_BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const DASH_FLEET_ORIGIN = 'https://www.fleetai.com';
const DASH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Fleet eval_tasks.key shape, e.g. task_iyasykc1wvkn_1781012033021_oyzfvsbk0 */
const DASH_TASK_KEY_RE = /^task_[A-Za-z0-9_]+$/;
const DASH_TASKS_PAGE_SIZE = 100;
const DASH_QA_PAGE_SIZE = 100;
const DASH_DISPUTES_PAGE_SIZE = 100;
const DASH_DISPUTES_MAX_PAGES = 100;
const DASH_DISPUTES_TASK_FETCH_CONCURRENCY = 5;
const DASH_FLEET_FLAGS_PATH = '/task-flags';
const DASH_QA_SCREENSHOT_VIEW_URLS_PATH = '/orchestrator-private/v1/qa-feedback/screenshots/view-urls';
const DASH_FLEET_SENIOR_REVIEW_REFERER = DASH_FLEET_ORIGIN + '/work/problems/senior-review';
const DASH_FLAG_CREATE_REASON_KEYS = [
    'ai_generated',
    'poor_feedback_from_previous_qa',
    'possible_duplicate',
    'other'
];
const DASH_DISPUTE_RESOLUTION_OPTIONS = [
    {
        key: 'flag_bugged_accept_dispute',
        label: 'Flag As Bugged (Accept Dispute)',
        status: 'approved',
        skipWorkflowSignal: true,
        flagAsBugged: true
    },
    {
        key: 'flag_bugged_reject_dispute',
        label: 'Flag As Bugged (Reject Dispute)',
        status: 'rejected',
        skipWorkflowSignal: true,
        flagAsBugged: true
    },
    { key: 'rejected', label: 'Reject Dispute', status: 'rejected' },
    { key: 'approved_with_revisions', label: 'Approve & Return to Writer', status: 'approved_with_revisions' },
    { key: 'approved', label: 'Approve Dispute', status: 'approved' },
    { key: 'approved_and_accepted', label: 'Approve & Accept Task', status: 'approved_and_accepted' }
];
/** Fleet dispute “Flag as Bug” categories (labels sent in resolutionReason brackets). */
const DASH_DISPUTE_BUG_CATEGORIES = [
    { key: 'environment_broken', label: 'Environment is broken or misconfigured' },
    { key: 'impossible_story', label: 'User story is impossible to complete' },
    { key: 'missing_data', label: 'Required data/state is missing from environment' },
    { key: 'conflicting_requirements', label: 'User story has conflicting requirements' },
    { key: 'unsupported_actions', label: 'App does not support required actions' },
    { key: 'grading_broken', label: 'Task cannot be graded correctly' },
    { key: 'other', label: 'Other' }
];
const DASH_AUTO_GROW_TEXTAREA_MIN_PX = 48;
const DASH_DISPUTE_RESOLUTION_REASON_MIN_CHARS = 50;
const DASH_AUTO_GROW_TEXTAREA_ATTR = 'data-wf-dash-auto-grow';
const DASH_PREFETCH_KINDS = ['openDisputes', 'resolvedDisputes', 'pendingFlags', 'resolvedFlags'];
/** Stop disputes bulk pagination after this many pages with zero date-filter matches (client-side filter). */
const DASH_DISPUTES_DATE_FILTER_MAX_EMPTY_PAGES = 3;
const DASH_FLEET_WEB_API = DASH_FLEET_ORIGIN + '/api';
const DASH_FLEET_INTERNAL_API = 'https://api.internal.fleet-platform.fleetai.com/v1';
const DASH_DISPUTE_REVIEWS_HISTORY_PAGE_SIZE = 50;
const DASH_DISPUTE_REVIEWS_HISTORY_MAX_PAGES = 3;
const SO_ROLLING_OVERLAY_OUTSET = 6;

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
const DASH_FLAGGED_COLOR = '#a16207';
const DASH_FLAGGED_BORDER = '#ca8a04';
const DASH_FLAGGED_BG = 'color-mix(in srgb, #ca8a04 14%, transparent)';
const DASH_VERSION_MODE_CONTRIBUTOR = 'contributor_match';
const DASH_VERSION_MODE_V1 = 'all_v1';
const DASH_VERSION_MODE_FINAL = 'all_final';

function dashFilterScopes() {
    const lib = Context.dashboardLib;
    return (lib && lib.filterScopes) || [];
}

function dashSortDefault() {
    const lib = Context.dashboardLib;
    return (lib && lib.sortDefault) || 'task_submitted:desc';
}

function dashSortOptions() {
    const lib = Context.dashboardLib;
    return (lib && lib.sortOptions) || [];
}

function dashSortMetrics() {
    const lib = Context.dashboardLib;
    return (lib && lib.sortMetrics) || [];
}

function dashKindMergeOrder() {
    const lib = Context.dashboardLib;
    return (lib && lib.outputKindMergeOrder) || [];
}

function dashKindLabels() {
    const lib = Context.dashboardLib;
    return (lib && lib.outputKindLabels) || {};
}

function dashManualFilterFields() {
    const lib = Context.dashboardLib;
    return (lib && lib.manualFilterFields) || [];
}

function dashDefaultManualFilterStageRows() {
    const lib = Context.dashboardLib;
    return lib && typeof lib.defaultManualFilterStageRows === 'function'
        ? lib.defaultManualFilterStageRows()
        : [];
}

function dashManualFilterWordCount(text) {
    const lib = Context.dashboardLib;
    return lib && typeof lib.manualFilterWordCount === 'function'
        ? lib.manualFilterWordCount(text)
        : 0;
}

function dashNoneSelectedHint() {
    const lib = Context.dashboardLib;
    return (lib && lib.noneSelectedHint) || 'None selected = all.';
}

function dashSubstringFilterHelp() {
    const lib = Context.dashboardLib;
    return (lib && lib.substringFilterHelp) || '';
}

function dashResultsModeHints() {
    const lib = Context.dashboardLib;
    return (lib && lib.resultsModeHints) || {};
}

function dashLib() {
    return Context.dashboardLib;
}

function dashEscHtml(value) {
    const lib = dashLib();
    return lib && lib.escHtml ? lib.escHtml(value) : String(value == null ? '' : value);
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
    const lib = dashLib();
    return lib && lib.formatCreatedAt ? lib.formatCreatedAt(iso) : String(iso || '—');
}

function dashProblemCreationDurationText(seconds) {
    const total = Math.round(Number(seconds));
    if (!Number.isFinite(total) || total < 0) return '';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const parts = [];
    if (h > 0) parts.push(h + (h === 1 ? ' hr' : ' hrs'));
    if (m > 0) parts.push(m + (m === 1 ? ' min' : ' mins'));
    if (parts.length === 0 && total > 0) return '< 1 min';
    return parts.join(', ');
}

function dashTimestampWithDurationParts(iso, durationSeconds) {
    const formatted = dashFormatCreatedAt(iso);
    const ago = dashLib().relativeAgo(iso, { style: 'compact' });
    const durationSec = durationSeconds != null ? Number(durationSeconds) : NaN;
    const durationText = Number.isFinite(durationSec) && durationSec >= 0
        ? dashProblemCreationDurationText(durationSec)
        : '';
    return { formatted, ago, durationText };
}

function dashTimestampWithDurationHtml(iso, durationSeconds) {
    const { formatted, ago, durationText } = dashTimestampWithDurationParts(iso, durationSeconds);
    const muted = 'font-size: 11px; color: var(--muted-foreground, #64748b);';
    const regular = 'color: var(--foreground, #0f172a);';
    const parts = [`<span style="${regular}">${dashEscHtml(formatted)}</span>`];
    if (ago) {
        parts.push(`<span style="${muted}">(${dashEscHtml(ago)})</span>`);
    }
    if (durationText) {
        parts.push(`<span style="${muted}"> in </span><span style="${regular}">${dashEscHtml(durationText)}</span>`);
    }
    return `<span style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">${parts.join('')}</span>`;
}

function dashLabeledTimestampWithDurationPlainText(label, iso, durationSeconds) {
    const { formatted, ago, durationText } = dashTimestampWithDurationParts(iso, durationSeconds);
    let text = String(label || '').trim();
    if (text) text += ' ';
    text += formatted;
    if (ago) text += ` (${ago})`;
    if (durationText) text += ` in ${durationText}`;
    return text;
}

/** PostgREST may return an embed as one object or an array — normalize to a single row. */
function dashFirstEmbed(embed) {
    if (!embed) return null;
    if (Array.isArray(embed)) return embed[0] || null;
    if (typeof embed === 'object') return embed;
    return null;
}

// ── HTML escaping ──



const searchOutputCoreMethods = {
    _readBootstrapCache() {
        try {
            const raw = Storage.getData(DASH_BOOTSTRAP_STORAGE_KEY, null);
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
            Storage.setData(DASH_BOOTSTRAP_STORAGE_KEY, JSON.stringify(entry));
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
        const lib = dashLib();
        return lib && typeof lib.projectDisplayLabel === 'function'
            ? lib.projectDisplayLabel(projectId, projects)
            : String(projectId).trim().slice(0, 8);
    },

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

    async _fleetInternalGet(path, queryParams, teamId) {
        const pageWindow = this._pageWindow();
        const ops = this._dashOpsTab();
        const jwt = typeof ops.getFleetUserJwt === 'function' ? ops.getFleetUserJwt(pageWindow) : '';
        if (!jwt) {
            throw new Error('Fleet session token not yet captured. Navigate to a Fleet data page, then retry.');
        }
        const team = String(teamId || this._dashGetCookie('current-team-id') || '').trim();
        if (!team || !DASH_UUID_RE.test(team)) {
            throw new Error('Fleet team context not available.');
        }
        const url = new URL(DASH_FLEET_INTERNAL_API + path);
        Object.entries(queryParams || {}).forEach(([key, value]) => {
            if (value != null && value !== '') url.searchParams.set(key, String(value));
        });
        const requestFetch = pageWindow.fetch || fetch;
        const res = await requestFetch.call(pageWindow, url.toString(), {
            method: 'GET',
            credentials: 'omit',
            headers: {
                accept: '*/*',
                'content-type': 'application/json',
                'x-jwt-token': jwt,
                'x-team-id': team,
                origin: DASH_FLEET_ORIGIN,
                referer: DASH_FLEET_ORIGIN + '/'
            }
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error('Fleet internal API ' + res.status + ': ' + (text || res.statusText));
        }
        return res.json();
    },

    async _fetchUserResolvedDisputeHistoryPage(userId, teamId, offset, limit) {
        const uid = String(userId || '').trim();
        if (!uid) return { disputes: [], total_count: 0 };
        return this._fleetInternalGet('/dispute-reviews/history', {
            user_id: uid,
            limit: String(limit != null ? limit : DASH_DISPUTE_REVIEWS_HISTORY_PAGE_SIZE),
            offset: String(offset != null ? offset : 0)
        }, teamId);
    },

    _disputeIdsMatch(leftId, rightId) {
        return String(leftId || '').trim() === String(rightId || '').trim();
    },

    _findOpenDisputePrefetchRow(disputeId, taskId) {
        const tid = String(taskId || '').trim();
        if (!tid) return null;
        const rows = this._getPrefetchCache('openDisputes').get(tid) || [];
        return rows.find((row) => this._disputeIdsMatch(row && row.id, disputeId)) || null;
    },

    async _fetchLiveDashboardResolvedDispute(disputeId, userId, teamId) {
        const did = String(disputeId || '').trim();
        const uid = String(userId || '').trim();
        if (!did || !uid) return null;
        const limit = DASH_DISPUTE_REVIEWS_HISTORY_PAGE_SIZE;
        let offset = 0;
        for (let page = 0; page < DASH_DISPUTE_REVIEWS_HISTORY_MAX_PAGES; page++) {
            const payload = await this._fetchUserResolvedDisputeHistoryPage(uid, teamId, offset, limit);
            const rows = (payload && Array.isArray(payload.disputes)) ? payload.disputes : [];
            const found = rows.find((row) => this._disputeIdsMatch(row && row.id, did));
            if (found) return found;
            const totalCount = payload && payload.total_count != null ? Number(payload.total_count) : rows.length;
            offset += limit;
            if (rows.length < limit || offset >= totalCount) break;
        }
        Logger.warn('search-output: dispute ' + did + ' not found in review history after '
            + DASH_DISPUTE_REVIEWS_HISTORY_MAX_PAGES + ' page(s)');
        return null;
    },

    _mergeDashboardResolvedDisputeRow({ historyRow, openRow, resolveContext, taskId }) {
        const option = resolveContext && resolveContext.option;
        const reason = resolveContext && resolveContext.reason;
        const ui = resolveContext && resolveContext.ui;
        if (!option || !String(reason || '').trim()) return null;

        const hist = historyRow || {};
        const open = openRow || {};
        const tid = String(taskId || '').trim();
        const resolverId = this._dashGetCurrentUserId();
        const body = this._buildDisputeResolveRequestBody(ui || {}, option, reason);
        const disputeData = Object.assign({}, open.dispute_data || {}, hist.dispute_data || {});
        if (body.disputeReviewDurationSeconds != null) {
            disputeData.dispute_review_duration_seconds = body.disputeReviewDurationSeconds;
        }

        let feedbackId = open.feedback_id;
        if (feedbackId == null && hist.dispute_data && hist.dispute_data.feedbackId != null) {
            feedbackId = hist.dispute_data.feedbackId;
        }

        const merged = {
            id: hist.id != null ? hist.id : open.id,
            eval_task_id: hist.eval_task_id || open.eval_task_id || tid,
            team_id: open.team_id || hist.team_id || null,
            created_at: hist.created_at || open.created_at,
            dispute_status: hist.dispute_status || option.status,
            dispute_data: disputeData,
            dispute_reason: open.dispute_reason || hist.dispute_reason || '',
            resolved_at: hist.resolved_at || new Date().toISOString(),
            resolved_by: resolverId,
            resolution_reason: body.resolutionReason,
            feedback_id: feedbackId,
            original_feedback_created_at: open.original_feedback_created_at || null,
            eval_task: open.eval_task || null,
            creator: open.creator || null,
            resolver: open.resolver || null
        };
        return this._stripResolvedDisputeRow(merged);
    },

    _removeDisputeFromOpenPrefetch(disputeId, taskId) {
        const did = String(disputeId || '').trim();
        const tid = String(taskId || '').trim();
        if (!did || !tid) return;

        const filterMap = (map) => {
            if (!map || typeof map.get !== 'function') return;
            const rows = map.get(tid);
            if (!rows || !rows.length) return;
            const next = rows.filter((row) => !this._disputeIdsMatch(row && row.id, did));
            if (next.length) map.set(tid, next);
            else map.delete(tid);
        };

        filterMap(this._getPrefetchCache('openDisputes'));
        filterMap(this._state.openDisputesByTaskId);
    },

    _upsertDisputeInResolvedPrefetch(strippedRow, taskId) {
        const tid = String(taskId || '').trim();
        if (!strippedRow || !tid) return;
        const cache = this._getPrefetchCache('resolvedDisputes');
        const did = String(strippedRow.id || '').trim();
        const bucket = cache.get(tid) || [];
        const next = bucket.filter((row) => !this._disputeIdsMatch(row && row.id, did));
        next.push(strippedRow);
        cache.set(tid, next);

        if (!this._state.resolvedDisputeTaskIds) this._state.resolvedDisputeTaskIds = new Set();
        this._state.resolvedDisputeTaskIds.add(tid);
        if (!this._state.resolverDisputeTaskIds) this._state.resolverDisputeTaskIds = new Set();
        this._state.resolverDisputeTaskIds.add(tid);

        const at = String(strippedRow.resolved_at || '');
        if (at) {
            if (!this._state.resolvedDisputeAtByTaskId) {
                this._state.resolvedDisputeAtByTaskId = new Map();
            }
            const prev = this._state.resolvedDisputeAtByTaskId.get(tid);
            if (!prev || at > prev) this._state.resolvedDisputeAtByTaskId.set(tid, at);
        }
    },

    async _syncDashboardDisputeResolvePrefetch(disputeId, itemId, resolveContext) {
        const id = String(disputeId || '').trim();
        const iid = String(itemId || '').trim();
        if (!id || !iid) return;

        const item = this._findCachedItem(iid);
        if (!item || !item.task || !item.task.id) {
            Logger.warn('search-output: dispute resolve cache sync skipped — item not found ' + iid);
            return;
        }
        const taskId = item.task.id;
        const openRow = this._findOpenDisputePrefetchRow(id, taskId);

        const userId = this._dashGetCurrentUserId();
        const teamId = this._dashGetCookie('current-team-id');
        let historyRow = null;
        try {
            historyRow = await this._fetchLiveDashboardResolvedDispute(id, userId, teamId);
        } catch (e) {
            Logger.warn('search-output: dispute review history fetch failed — ' + id, e);
        }

        if (!historyRow && !openRow) {
            Logger.warn('search-output: dispute resolve cache sync skipped — no history or open row for ' + id);
            return;
        }

        const stripped = this._mergeDashboardResolvedDisputeRow({
            historyRow,
            openRow,
            resolveContext,
            taskId
        });
        if (!stripped || !stripped.id) {
            Logger.warn('search-output: dispute resolve cache sync skipped — merge failed for ' + id);
            return;
        }

        this._removeDisputeFromOpenPrefetch(id, taskId);
        this._upsertDisputeInResolvedPrefetch(stripped, taskId);
        Logger.log('search-output: dispute resolve cache synced — ' + id
            + ' task ' + String(taskId).slice(0, 8)
            + (historyRow ? '' : ' (degraded merge)'));
    },

    _parseFleetWebPostErrorBody(err) {
        const msg = err && err.message != null ? String(err.message) : '';
        const prefix = msg.match(/^Fleet web API \d+: (.+)$/s);
        const raw = prefix ? prefix[1].trim() : msg.trim();
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_e) {
            return null;
        }
    },

    _flagResolveApiPath(flagId) {
        return DASH_FLEET_FLAGS_PATH + '/' + encodeURIComponent(String(flagId)) + '/resolve';
    },

    _disputeClaimApiPath(disputeId) {
        return '/disputes/' + encodeURIComponent(String(disputeId)) + '/claim';
    },

    _disputeResolveApiPath(disputeId) {
        return '/disputes/' + encodeURIComponent(String(disputeId)) + '/resolve';
    },

    _flagBuggedApiPath(evalTaskId) {
        return '/flag-bugged/' + encodeURIComponent(String(evalTaskId));
    },

    _disputeReleaseApiPath(disputeId) {
        return '/disputes/' + encodeURIComponent(String(disputeId)) + '/release';
    },

    _disputeResolveReferer(disputeId) {
        const id = String(disputeId || '').trim();
        return id
            ? (DASH_FLEET_ORIGIN + '/work/problems/disputes/' + encodeURIComponent(id))
            : (DASH_FLEET_ORIGIN + '/work/problems/disputes');
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
        const ops = this._dashOpsTab();
        if (ops && typeof ops.getCurrentUserId === 'function') {
            const fromOps = String(ops.getCurrentUserId() || '').trim();
            if (fromOps && DASH_UUID_RE.test(fromOps)) return fromOps;
        }
        const fromCookie = this._dashGetCookie('current-user-id');
        if (fromCookie && DASH_UUID_RE.test(fromCookie)) return fromCookie;
        try {
            const stored = Storage.getData('fleet-ux:ops-current-user-id', null);
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
                item.task.systemFeedbackIdRemap = remap;
                this._applyTaskShellFromEnrichment(item.task, hist);
                if (hist.initialCreationTimeSeconds != null) {
                    item.task.initialCreationTimeSeconds = hist.initialCreationTimeSeconds;
                } else {
                    delete item.task.initialCreationTimeSeconds;
                }
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
        void this._reoverlayAllCachedItems().then(() => {
            this._renderRatingsPanel();
        });
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

    _getAllCachedOpenDisputeRows(taskId) {
        return this._filterDisputeRowsForTask(this._getCachedOpenDisputeRows(taskId), taskId);
    },

    _getAllCachedResolvedDisputeRows(taskId) {
        return this._filterDisputeRowsForTask(this._getCachedResolvedDisputeRows(taskId), taskId);
    },

    _getAllCachedFlagRows(taskId) {
        const pendingCache = this._getPrefetchCache('pendingFlags');
        const resolvedCache = this._getPrefetchCache('resolvedFlags');
        const pending = pendingCache ? (pendingCache.get(taskId) || []) : [];
        const resolved = resolvedCache ? (resolvedCache.get(taskId) || []) : [];
        return [...pending, ...resolved];
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
                hydrated: false
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
            const flags = rows.map((row) => lib.buildFlagDisplay(row, profilesMap));
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
                hydrated: false
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

    async _runConcurrentWorkers(items, concurrency, worker) {
        if (!items || items.length === 0) return;
        let idx = 0;
        const cap = Math.min(concurrency, items.length);
        const runWorker = async () => {
            while (idx < items.length) {
                if (this._shouldStopSearch()) return;
                const item = items[idx++];
                await worker(item);
            }
        };
        await Promise.all(Array.from({ length: cap }, () => runWorker()));
    },

    async _fetchPaginatedQueryVariants(options) {
        const {
            variants,
            pageSize,
            queryKey,
            channel,
            buildQs,
            onPage
        } = options;
        if (!variants || variants.length === 0) return;
        let pageNum = 0;
        await this._runConcurrentWorkers(variants, DASH_SEARCH_FETCH_CONCURRENCY, async (variant) => {
            let offset = 0;
            while (true) {
                if (this._shouldStopSearch()) break;
                const qs = buildQs(variant, offset);
                if (!qs) break;
                const page = await this._pgQuery(queryKey, qs, channel);
                pageNum++;
                Logger.debug('dashboard: ' + queryKey + ' page ' + pageNum + ' — ' + page.length + ' rows (offset ' + offset + ')');
                if (onPage) onPage(page, variant, offset);
                if (page.length < pageSize) break;
                offset += pageSize;
            }
        });
    },

    _flagRowsToDisplays(rows, profilesMap) {
        const lib = dashLib();
        return (rows || []).map((row) => lib.buildFlagDisplay(row, profilesMap));
    },

    _mergeBulkFlagsOntoItem(item, bulkRows, profilesMap) {
        const displays = this._flagRowsToDisplays(bulkRows, profilesMap);
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

        const openRows = this._getAllCachedOpenDisputeRows(taskId);
        let resolvedRows = this._getAllCachedResolvedDisputeRows(taskId);
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
                item.kinds.sort((a, b) => dashKindMergeOrder().indexOf(a) - dashKindMergeOrder().indexOf(b));
            }
            changed = true;
        }

        const flagRows = this._getAllCachedFlagRows(taskId);
        if (flagRows.length > 0) {
            const flagProfileIds = [];
            for (const row of flagRows) {
                if (row && row.flagger_id) flagProfileIds.push(row.flagger_id);
                if (row && row.resolved_by) flagProfileIds.push(row.resolved_by);
            }
            if (flagProfileIds.length > 0) {
                await this._supplementProfilesMap(profilesMap, flagProfileIds);
            }
            this._mergeBulkFlagsOntoItem(item, flagRows, profilesMap);
            if (!item.kinds.includes('senior_review')) {
                item.kinds.push('senior_review');
                item.kinds.sort((a, b) => dashKindMergeOrder().indexOf(a) - dashKindMergeOrder().indexOf(b));
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
        const total = profileIds.length;
        const chunkResults = await Promise.all(chunks.map((chunk) => {
            if (this._shouldStopSearch()) return Promise.resolve([]);
            return this._pgQuery('profiles.select_person', {
                id: dashPgInFilter(chunk)
            }, logContext || 'search').catch((e) => {
                Logger.warn('dashboard: profile lookup chunk failed', e);
                return [];
            });
        }));
        const all = [];
        for (const rows of chunkResults) {
            all.push(...rows);
            if (loadTracker) loadTracker.setCount(all.length, total);
        }
        return all;
    },

    async _fetchTargetProjectMap(targetIds, loadTracker) {
        if (!targetIds || targetIds.length === 0) return new Map();
        const map = new Map();
        const total = targetIds.length;
        const chunks = dashPgInChunks(targetIds);
        const chunkResults = await Promise.all(chunks.map((chunk) => {
            if (this._shouldStopSearch()) return Promise.resolve([]);
            return this._pgQuery('task_project_targets.select_project_map', {
                id: dashPgInFilter(chunk),
                limit: String(chunk.length)
            }, 'search').catch((e) => { Logger.warn('dashboard: target→project lookup failed', e); return []; });
        }));
        for (const rows of chunkResults) {
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
            if (this._state.pageHydratePending && this._isOpen()) {
                this._schedulePageHydrate();
            }
        }
    },

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
        const variants = [];
        for (const authorChunk of authorVariants) {
            for (const scopeOverride of scopeVariants) {
                variants.push({ authorChunk, scopeOverride });
            }
        }
        await this._fetchPaginatedQueryVariants({
            variants,
            pageSize: DASH_TASKS_PAGE_SIZE,
            queryKey: 'tasks.select_search',
            channel: 'search',
            buildQs: (variant, offset) => {
                const qs = {
                    order: 'created_at.desc',
                    offset: String(offset),
                    limit: String(DASH_TASKS_PAGE_SIZE)
                };
                if (variant.authorChunk) {
                    const f = dashPgInFilter(variant.authorChunk);
                    if (!f) return null;
                    qs.created_by = f;
                }
                if (!this._applyTaskScopeToQs(qs, scope, variant.scopeOverride)) return null;
                this._addCreatedAtRange(qs, afterIso, beforeIso);
                return qs;
            },
            onPage: (page) => {
                for (const row of page) if (row && row.id) byId.set(row.id, row);
                if (loadTracker) loadTracker.setCount(byId.size);
            }
        });
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
        const jobs = [];
        for (const chunk of dashPgInChunks(taskIds)) {
            for (const scopeOverride of scopeVariants) {
                jobs.push({ chunk, scopeOverride });
            }
        }
        await this._runConcurrentWorkers(jobs, DASH_SEARCH_FETCH_CONCURRENCY, async ({ chunk, scopeOverride }) => {
            const qs = {
                id: dashPgInFilter(chunk),
                limit: String(chunk.length)
            };
            if (!this._applyTaskScopeToQs(qs, scope, scopeOverride)) return;
            const page = await this._pgQuery('tasks.select_search', qs, pgChannel);
            Logger.debug('dashboard: tasks by id chunk — ' + page.length + ' rows');
            for (const row of page) if (row && row.id) byId.set(row.id, row);
            if (loadTracker) loadTracker.setCount(byId.size, totalIds);
        });
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
        const qaQueryKey = useTaskScopeEmbed ? 'qa_feedback.select_row_scoped' : 'qa_feedback.select_row';
        const authorVariants = this._authorQueryVariants(authorIds);
        const scopeVariants = useTaskScopeEmbed ? this._scopeQueryVariants(scope) : [{}];
        const variants = [];
        for (const authorChunk of authorVariants) {
            for (const scopeOverride of scopeVariants) {
                variants.push({ authorChunk, scopeOverride });
            }
        }
        await this._fetchPaginatedQueryVariants({
            variants,
            pageSize: DASH_QA_PAGE_SIZE,
            queryKey: qaQueryKey,
            channel: 'search',
            buildQs: (variant, offset) => {
                const qs = {
                    order: 'created_at.desc',
                    offset: String(offset),
                    limit: String(DASH_QA_PAGE_SIZE)
                };
                if (variant.authorChunk) {
                    const f = dashPgInFilter(variant.authorChunk);
                    if (!f) return null;
                    qs.created_by = f;
                }
                if (useTaskScopeEmbed && !this._applyTaskScopeToQaQs(qs, scope, variant.scopeOverride)) return null;
                this._addCreatedAtRange(qs, afterIso, beforeIso);
                return qs;
            },
            onPage: (page) => {
                for (const row of page) {
                    if (!row || !row.id || seenFeedbackIds.has(row.id)) continue;
                    seenFeedbackIds.add(row.id);
                    allFeedback.push(row);
                }
                if (loadTracker) loadTracker.setCount(allFeedback.length);
            }
        });
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
                flags: [],
                hydrated: false
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
            flags: [],
            hydrated: false
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
            authorIds
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
        scope
    }) {
        this._state.activeSearchScope = scope;
        this._state.activeSearchAfterIso = afterIso;
        this._state.activeSearchBeforeIso = beforeIso;
        this._state.activeSearchAuthorIds = authorIds || [];
        this._state.versionMode = authorIds.length > 0
            ? DASH_VERSION_MODE_CONTRIBUTOR
            : DASH_VERSION_MODE_FINAL;

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
            authorIds
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
                    flags: [],
                    hydrated: item.hydrated === true
                };
                byTask.set(taskId, merged);
            } else {
                merged.hydrated = merged.hydrated === true && item.hydrated === true;
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
            const mergedVers = (merged.task.promptVersions || []).length;
            const itemVers = (item.task.promptVersions || []).length;
            if (itemVers > mergedVers) merged.task = item.task;
        }
        const mergedItems = [...byTask.values()].map((merged) => {
            const kinds = dashKindMergeOrder().filter((k) => merged.kinds.has(k));
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
                hydrated: merged.hydrated === true
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
            qaHelpfulness: (opts.qaHelpfulness || []).map((h) => h.id),
            v1CreationTimeMinutes: (opts.v1CreationTimeMinutes || []).map((h) => h.id),
            qaTimeMinutes: (opts.qaTimeMinutes || []).map((h) => h.id),
            disputeResolutionTimeMinutes: (opts.disputeResolutionTimeMinutes || []).map((h) => h.id)
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

    _buildTimeBucketFilterOptions(scopeItems, bucketFn) {
        const lib = dashLib();
        const present = new Set();
        for (const item of scopeItems || []) {
            for (const bucketId of bucketFn(item)) {
                present.add(bucketId);
            }
        }
        return (lib.V1_CREATION_TIME_BUCKET_ORDER || [])
            .filter((id) => present.has(id))
            .map((id) => ({
                id,
                label: (lib.V1_CREATION_TIME_BUCKET_LABELS && lib.V1_CREATION_TIME_BUCKET_LABELS[id]) || id
            }));
    },

    _buildV1CreationTimeFilterOptions(scopeItems) {
        const lib = dashLib();
        return this._buildTimeBucketFilterOptions(scopeItems, (item) => lib.itemV1CreationTimeBuckets(item));
    },

    _buildQaTimeFilterOptions(scopeItems) {
        const lib = dashLib();
        return this._buildTimeBucketFilterOptions(scopeItems, (item) => lib.itemQaTimeMinutesBuckets(item));
    },

    _buildDisputeResolutionTimeFilterOptions(scopeItems) {
        const lib = dashLib();
        return this._buildTimeBucketFilterOptions(scopeItems, (item) => lib.itemDisputeResolutionTimeMinutesBuckets(item));
    },

    _refreshHelpfulnessFilterUi() {
        if (!this._state.cachedItems) return;
        this._refreshResultsView({ filterSource: 'results-mutate', reindexFilters: true });
    },

    _isDimensionUnrestricted(selected, boundIds) {
        const bounds = boundIds || [];
        if (bounds.length === 0) return true;
        const sel = selected || [];
        return sel.length === 0;
    },

    _isDimensionAllSelected(selected, boundIds) {
        const bounds = boundIds || [];
        if (bounds.length === 0) return false;
        const sel = selected || [];
        return sel.length >= bounds.length;
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
        for (const { draftKey } of dashFilterScopes()) {
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
        this._state.pageHydrateScheduled = false;
        this._state.pageHydratePending = false;
        this._state.autoHydratePassId = (this._state.autoHydratePassId || 0) + 1;

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
        if (sortEl) sortEl.value = dashSortDefault();
        this._resetManualFilters();
        this._resetFilterDraftsFromResults(mergedItems || this._state.cachedItems || []);
        this._applyResultsPageSizeForNewSearch();
        this._state.resultsKindTab = 'all';
        this._state.resultsPage = 0;
    },

    _preferRicherSearchResultItem(a, b) {
        if (!a) return b;
        if (!b) return a;
        const aHydr = a.hydrated === true;
        const bHydr = b.hydrated === true;
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
            authorCount: 0,
            authorLabels: [],
            searchKinds: dashKindMergeOrder().filter((k) => kindSet.has(k))
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

    _getFilterScopeItems() {
        if (!this._state.cachedItems) return [];
        return this._filterItemsByResultsKindTab(this._state.cachedItems);
    },

    _filterScopeWrapEl(scopeKey) {
        return this._modal ? this._modal.querySelector('[data-wf-dash-ms-wrap="' + scopeKey + '"]') : null;
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
        options.v1CreationTimeMinutes = this._buildV1CreationTimeFilterOptions(scopeItems);
        options.qaTimeMinutes = this._buildQaTimeFilterOptions(scopeItems);
        options.disputeResolutionTimeMinutes = this._buildDisputeResolutionTimeFilterOptions(scopeItems);
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
            case 'v1_creation_time_minutes':
                if (!item.hydrated) return null;
                return dashLib().itemV1CreationTimeMinutes(item);
            case 'qa_time_minutes':
                return dashLib().itemQaTimeMinutes(item);
            case 'dispute_resolution_time_minutes':
                return dashLib().itemDisputeResolutionTimeMinutes(item);
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

    _pruneFiltersToBounds(filters, bounds) {
        const next = Object.assign({}, filters);
        const b = bounds || {};
        for (const { draftKey } of dashFilterScopes()) {
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
            v1CreationTimeMinutes: [],
            qaTimeMinutes: [],
            disputeResolutionTimeMinutes: [],
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
        const value = String(raw || dashSortDefault());
        const match = dashSortOptions().find((opt) => opt.value === value);
        if (match) {
            return { sortMetric: match.sortMetric, sortOrder: match.sortOrder, label: match.label };
        }
        const [metric, order] = value.split(':');
        const known = dashSortMetrics().some((m) => m.id === metric);
        const sortMetric = known ? metric : 'task_submitted';
        const sortOrder = order === 'asc' ? 'asc' : 'desc';
        const metricLabel = (dashSortMetrics().find((m) => m.id === sortMetric) || {}).label || sortMetric;
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
        const selected = String(selectedValue || dashSortDefault());
        return dashSortOptions().map((opt) =>
            `<option value="${dashEscHtml(opt.value)}"${opt.value === selected ? ' selected' : ''}>${dashEscHtml(opt.label)}</option>`
        ).join('');
    },

    _refreshResultsView({ resetPage = false, reindexFilters = false, filterSource = 'client', prehydrateInitialBatch = false } = {}) {
        const lib = dashLib();
        if (this._state.cachedItems === null) {
            this._state.filteredItems = null;
            this._updateResultsStatus();
            this._renderResults();
            this._updateResultsKindTabsUi();
            this._syncResultsToolbarDerivedUi();
            return Promise.resolve(false);
        }

        if (this._ensureValidResultsKindTab()) {
            resetPage = true;
            reindexFilters = true;
            if (filterSource === 'client') filterSource = 'tab-reset';
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
                return Promise.resolve(false);
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

        const finishRender = () => {
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
            this._validateRangeUi();
        };

        if (prehydrateInitialBatch && (this._state.resultsPage || 0) === 0) {
            const batch = this._getInitialHydrateBatch();
            if (batch.length > 0) {
                this._setSearchLoadPhase('Hydrating results…', batch.length);
                this._syncSearchLoadPhaseUi();
                return this._prehydrateInitialBatchBeforeDisplay().then((hydrated) => {
                    this._state.searchLoadPhase = '';
                    this._state.loading = false;
                    if (hydrated > 0) {
                        Logger.log('search-output: initial hydrate batch complete — ' + hydrated + ' card(s)');
                    }
                    finishRender();
                    return true;
                }).catch((err) => {
                    Logger.warn('search-output: initial hydrate batch failed', err);
                    this._state.searchLoadPhase = '';
                    this._state.loading = false;
                    finishRender();
                    return true;
                });
            }
            this._state.searchLoadPhase = '';
            this._state.loading = false;
        }

        finishRender();
        return Promise.resolve(true);
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

    _findCachedItem(itemId) {
        return (this._state.cachedItems || []).find((it) => it.id === itemId) || null;
    },

    _applyTaskShellFromEnrichment(task, hist) {
        if (!task || !hist) return;
        if (hist.key) task.key = hist.key;
        if (hist.status) task.status = hist.status;
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
                    item.task.systemFeedbackIdRemap = remap;
                    this._applyTaskShellFromEnrichment(item.task, hist);
                    if (hist.initialCreationTimeSeconds != null) {
                        item.task.initialCreationTimeSeconds = hist.initialCreationTimeSeconds;
                    } else {
                        delete item.task.initialCreationTimeSeconds;
                    }
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

    async _hydrateItemsInBulkBatches(items, options) {
        const opts = options || {};
        const toHydrate = (items || []).filter((it) => it && !it.hydrated);
        if (toHydrate.length === 0) return 0;

        const enrichOptions = {
            prefetchedFeedbackRows: opts.prefetchedFeedbackRows,
            skipFeedbackFetch: Boolean(opts.skipFeedbackFetch)
        };
        const total = toHydrate.length;
        let hydratedTotal = 0;
        let completedCards = 0;

        for (let i = 0; i < toHydrate.length; i += DASH_HYDRATE_BATCH_MAX) {
            if (typeof opts.shouldCancel === 'function' && opts.shouldCancel()) break;
            if (this._shouldStopSearch && this._shouldStopSearch()) break;

            const chunk = toHydrate.slice(i, i + DASH_HYDRATE_BATCH_MAX);
            if (typeof opts.onChunkStart === 'function') {
                opts.onChunkStart(chunk, i);
            }

            const subBatches = [];
            const subSize = Math.ceil(chunk.length / DASH_HYDRATE_BATCH_CONCURRENCY);
            for (let j = 0; j < chunk.length; j += subSize) {
                subBatches.push({
                    items: chunk.slice(j, j + subSize),
                    batchIndex: subBatches.length
                });
            }

            const subResults = new Array(subBatches.length).fill(0);
            await this._runConcurrentWorkers(subBatches, DASH_HYDRATE_BATCH_CONCURRENCY, async (batch) => {
                if (typeof opts.shouldCancel === 'function' && opts.shouldCancel()) return;
                if (this._shouldStopSearch && this._shouldStopSearch()) return;
                subResults[batch.batchIndex] = await this._hydrateItems(batch.items, enrichOptions);
            });

            const chunkHydrated = subResults.reduce((sum, count) => sum + count, 0);
            hydratedTotal += chunkHydrated;
            completedCards += chunk.length;
            if (typeof opts.onProgress === 'function') {
                opts.onProgress(completedCards, total);
            }
            if (typeof opts.onChunkComplete === 'function') {
                opts.onChunkComplete(chunk, i + chunk.length);
            }
        }

        if (typeof opts.onProgress === 'function'
            && !(typeof opts.shouldCancel === 'function' && opts.shouldCancel())
            && !(this._shouldStopSearch && this._shouldStopSearch())) {
            opts.onProgress(total, total);
        }
        return hydratedTotal;
    },

    async _hydrateAllSearchResults(items, options) {
        const opts = options || {};
        const toHydrate = (items || []).filter((it) => it && !it.hydrated);
        if (toHydrate.length === 0) return 0;

        if (!Context.dashboardData || typeof Context.dashboardData.enrichTasksWithHistory !== 'function') {
            throw new Error('Dashboard helpers not loaded. Reload the page and try again.');
        }

        Logger.log('dashboard: deep search hydrating all results — ' + toHydrate.length + ' card(s)');
        const hydratedTotal = await this._hydrateItemsInBulkBatches(toHydrate, {
            prefetchedFeedbackRows: opts.prefetchedFeedbackRows,
            skipFeedbackFetch: Boolean(opts.skipFeedbackFetch),
            shouldCancel: () => this._shouldStopSearch(),
            onProgress: opts.onProgress
        });
        if (hydratedTotal > 0) {
            this._onScopeDataEnriched();
        }
        Logger.log('dashboard: deep search hydrate complete — ' + hydratedTotal + ' card(s)');
        return hydratedTotal;
    },

    async _hydrateCard(itemId) {
        const item = this._findCachedItem(itemId);
        if (!item || item.hydrated) {
            this._logDashApiSkip('hydrate-card', item && item.hydrated ? 'already hydrated' : 'item not found', String(itemId || ''));
            return;
        }
        if (!Context.dashboardData || typeof Context.dashboardData.enrichTasksWithHistory !== 'function') {
            this._logDashApiSkip('hydrate-card', 'dashboardData not loaded', String(itemId || ''));
            return;
        }
        const ui = this._getHydrateUi(itemId);
        if (ui.status === 'loading') {
            this._logDashApiSkip('hydrate-card', 'already loading', String(itemId || ''));
            return;
        }
        this._logDashApiClick('hydrate-card', String(itemId || ''));
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

    async _prehydrateInitialBatchBeforeDisplay() {
        if (this._state.committed && this._state.committed.retrieveMode) return 0;
        const batch = this._getInitialHydrateBatch();
        if (batch.length === 0) return 0;
        if (!Context.dashboardData || typeof Context.dashboardData.enrichTasksWithHistory !== 'function') {
            Logger.warn('search-output: initial hydrate batch skipped — dashboardData not loaded');
            return 0;
        }
        const contextKey = this._autoHydrateContextKey();
        Logger.log('search-output: prehydrating initial batch before display — ' + batch.length + ' card(s)');

        this._state.autoHydrateActive = true;
        this._syncResultsHydrateBannerUi();
        const loadEntryId = this._beginSearchLoadEntry('Hydrating results');
        try {
            const hydrated = await this._hydrateItemsInBulkBatches(batch, {
                shouldCancel: () => this._autoHydrateContextKey() !== contextKey,
                onProgress: (done, total) => {
                    this._setSearchLoadPhase('Hydrating results…', done, total);
                    if (loadEntryId != null) {
                        this._updateSearchLoadEntry(
                            loadEntryId,
                            this._searchLoadMessage('Hydrating results', done, total)
                        );
                    }
                }
            });
            if (loadEntryId != null) {
                this._resolveSearchLoadEntry(
                    loadEntryId,
                    this._searchLoadMessage('Hydrating results', hydrated, batch.length)
                );
            }
            if (hydrated > 0) this._onScopeDataEnriched();
            return hydrated;
        } catch (err) {
            if (loadEntryId != null) {
                this._resolveSearchLoadEntry(loadEntryId, 'Hydrating results — failed');
            }
            throw err;
        } finally {
            this._state.autoHydrateActive = false;
            this._syncResultsHydrateBannerUi();
        }
    },

    async _hydrateCurrentPage() {
        if (!this._bulkHydrateShowable() || this._state.autoHydrateActive || this._state.hydrateBulkActive || this._state.loading) {
            return;
        }
        const onPage = this._getUnhydratedOnPage();
        if (onPage.length === 0) return;
        if (this._state.committed && this._state.committed.retrieveMode) return;
        if (!Context.dashboardData || typeof Context.dashboardData.enrichTasksWithHistory !== 'function') {
            return;
        }

        const contextKey = this._autoHydrateContextKey();
        const meta = this._getResultsPaginationMeta();
        Logger.log('search-output: page hydrate — ' + onPage.length + ' card(s)'
            + (meta ? ' (page ' + (meta.page + 1) + '/' + meta.totalPages + ')' : ''));

        this._state.autoHydrateActive = true;
        this._syncResultsHydrateBannerUi();
        try {
            const hydrated = await this._hydrateItemsInBulkBatches(onPage, {
                shouldCancel: () => this._autoHydrateContextKey() !== contextKey
            });
            if (this._autoHydrateContextKey() !== contextKey) {
                Logger.debug('search-output: page hydrate cancelled — view changed');
                return;
            }
            if (hydrated > 0) {
                this._onScopeDataEnriched();
                this._renderResults();
                Logger.log('search-output: page hydrate complete — ' + hydrated + ' card(s)');
            }
        } catch (err) {
            if (!this._handleDashSessionRefreshError(err)) {
                Logger.warn('search-output: page hydrate failed', err);
            }
        } finally {
            this._state.autoHydrateActive = false;
            this._syncResultsHydrateBannerUi();
            this._syncBulkHydrateUi();
        }
    },

    _resetFilterDraftsFromResults(_items) {
        return this._reindexFilterListsFromScope(true);
    },

    _clearResults() {
        this._state.cachedItems = null;
        this._state.filteredItems = null;
        this._state.appliedFilters = null;
        this._state.hasSearched = false;
        this._state.committed = null;
        this._state.cardUi = {};
        this._state.versionMode = DASH_VERSION_MODE_FINAL;
        this._state.activeSearchAuthorIds = [];
        this._state.disputeClaimUi = {};
        this._state.hydrateUi = {};
        this._state.actionBlockUi = {};
        this._state.userStoryUi = {};
        this._state.screenshotUi = {};
        this._state.taskOpenUi = {};
        this._state.resultsKindTab = 'all';
        this._state.resultsPage = 0;
        this._state.hydrateBulkActive = false;
        this._state.hydrateFetchActive = false;
        this._state.autoHydrateActive = false;
        this._state.pageHydrateScheduled = false;
        this._state.pageHydratePending = false;
        this._state.disputesBulkIncomplete = false;
        this._state.filterSelectionOrder = [];
        this._resetFilterLists();
        this._updateResultsKindTabsUi();
        this._syncBulkHydrateUi();
        const prompt = this._q('#wf-dash-prompt');
        if (prompt) prompt.value = '';
        const sortEl = this._q('#wf-dash-sort');
        if (sortEl) sortEl.value = dashSortDefault();
        ['#wf-dash-case', '#wf-dash-fuzzy', '#wf-dash-regex'].forEach((sel) => { const el = this._q(sel); if (el) el.checked = false; });
        this._updateResultsStatus();
        this._updateSubstringErrorUi();
        this._renderResults();
        Logger.log('dashboard: results cleared');
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

    _searchPanelHtml() {
        return this._splitPanelSectionHtml(
            this._leftPanelHtml(),
            this._resultsPanelHtml(),
            'dashboard',
            this._statsPanelHtml()
        );
    },
};

function attachSearchOutputListeners(modal, dash) {
    if (!modal || !dash) return;
    if (modal.dataset.wfSearchOutputListenersAttached === '1') return;
    modal.dataset.wfSearchOutputListenersAttached = '1';

        const manualRowsSeed = dash._q('#wf-dash-manual-rows');
        if (manualRowsSeed && !manualRowsSeed.querySelector('[data-wf-dash-manual-row]')) {
            dash._resetManualFilters();
        }

        const bulkHydrate = dash._q('#wf-dash-bulk-hydrate');
        if (bulkHydrate) bulkHydrate.addEventListener('click', () => { void dash._bulkHydrateVisible(); });

        modal.querySelectorAll('[data-wf-dash-results-mode]').forEach((btn) => {
            btn.addEventListener('click', () => {
                dash._setResultsMode(btn.getAttribute('data-wf-dash-results-mode'));
            });
        });

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

        const versionModeSel = dash._q('#wf-dash-version-mode');
        if (versionModeSel) {
            versionModeSel.addEventListener('change', () => {
                dash._applyVersionModeChange(versionModeSel.value);
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
                    dash._markTimeFilterUserPicked();
                    const quick = dash._q('#wf-dash-quick-range');
                    if (quick) quick.value = '';
                }
            });
        });

        const clearDates = dash._q('#wf-dash-clear-dates');
        if (clearDates) clearDates.addEventListener('click', () => {
            dash._markTimeFilterUserPicked();
            dash._clearDateRangeFields();
        });

        [
            ['#wf-dash-toggle-tasks', 'tasks'],
            ['#wf-dash-toggle-qa', 'qa'],
            ['#wf-dash-toggle-disputes', 'disputes'],
            ['#wf-dash-toggle-senior-review', 'senior_review']
        ].forEach(([selector, kind]) => {
            const toggle = dash._q(selector);
            if (toggle) toggle.addEventListener('click', () => {
                dash._toggleOutputType(kind);
                dash._validateRangeUi();
            });
        });

        const prompt = dash._q('#wf-dash-prompt');
        if (prompt) {
            prompt.addEventListener('input', () => {
                dash._syncPromptFilterHeight(prompt);
                dash._updateSubstringErrorUi();
                dash._syncFieldClearButtons();
                dash._maybeLiveApplyPromptFilter();
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
                dash._maybeLiveApplyPromptFilter();
            });
        }
        const fuzzyEl = dash._q('#wf-dash-fuzzy');
        const regexEl = dash._q('#wf-dash-regex');
        if (fuzzyEl) {
            fuzzyEl.addEventListener('change', () => {
                if (fuzzyEl.checked && regexEl) regexEl.checked = false;
                dash._updateSubstringErrorUi();
                dash._maybeLiveApplyPromptFilter();
            });
        }
        if (regexEl) {
            regexEl.addEventListener('change', () => {
                if (regexEl.checked && fuzzyEl) fuzzyEl.checked = false;
                dash._updateSubstringErrorUi();
                if (!regexEl.checked) dash._maybeLiveApplyPromptFilter();
            });
        }
        const caseEl = dash._q('#wf-dash-case');
        if (caseEl) {
            caseEl.addEventListener('change', () => {
                dash._updateSubstringErrorUi();
                dash._maybeLiveApplyPromptFilter();
            });
        }
        const applyFilters = dash._q('#wf-dash-apply-filters');
        if (applyFilters) applyFilters.addEventListener('click', () => dash._applyFiltersAndRender());
        const resetFilters = dash._q('#wf-dash-reset-filters');
        if (resetFilters) resetFilters.addEventListener('click', () => { void dash._resetFiltersToDefaults(); });

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
                const meta = dashManualFilterFields().find((f) => f.id === field);
                const isDate = meta && meta.type === 'date';
                const compSel = row.querySelector('[data-wf-dash-manual-comparator]');
                const valueInp = row.querySelector('[data-wf-dash-manual-value]');
                if (compSel) {
                    compSel.innerHTML = dash._numericComparatorOptionsHtml(isDate ? 'date' : 'number', 'gte');
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
                dash._markTimeFilterUserPicked();
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
        const dropIncluded = dash._q('#wf-dash-drop-included');
        if (dropIncluded) dropIncluded.addEventListener('click', () => dash._dropIncludedResults());
        const diffIncluded = dash._q('#wf-dash-diff-included');
        if (diffIncluded) diffIncluded.addEventListener('click', () => dash._diffIncludedResults());
        const dropExcluded = dash._q('#wf-dash-drop-excluded');
        if (dropExcluded) dropExcluded.addEventListener('click', () => dash._dropExcludedResults());
        const clearResults = dash._q('#wf-dash-clear-results');
        if (clearResults) clearResults.addEventListener('click', () => dash._clearResults());

        modal.querySelectorAll('[data-wf-dash-left-tab]').forEach((btn) => {
            btn.addEventListener('click', () => dash._setLeftTab(btn.getAttribute('data-wf-dash-left-tab')));
        });
        modal.querySelectorAll('[data-wf-dash-stats-tab]').forEach((btn) => {
            btn.addEventListener('click', () => dash._setStatsTab(btn.getAttribute('data-wf-dash-stats-tab')));
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
        dash._applyStatsPanelLayoutOnOpen(modal);
    modal.addEventListener('click', (e) => {
            const exportBtn = e.target.closest('[data-wf-dash-rating-export]');
            if (exportBtn && modal.contains(exportBtn)) {
                const workerId = exportBtn.getAttribute('data-wf-dash-rating-worker');
                const format = exportBtn.getAttribute('data-wf-dash-rating-export');
                if (workerId && format) dash._handleRatingExport(workerId, format);
                return;
            }
            const stopSearchBtn = e.target.closest('[data-wf-dash-stop-search]');
            if (stopSearchBtn && modal.contains(stopSearchBtn)) {
                dash._requestStopSearchFetches();
                return;
            }
            const deepDiveBtn = e.target.closest('[data-wf-dash-contributor-deep-dive]');
            if (deepDiveBtn && modal.contains(deepDiveBtn)) {
                const person = {
                    id: deepDiveBtn.getAttribute('data-wf-dash-person-id'),
                    full_name: deepDiveBtn.getAttribute('data-wf-dash-person-name'),
                    email: deepDiveBtn.getAttribute('data-wf-dash-person-email')
                };
                const historyKind = deepDiveBtn.getAttribute('data-wf-dash-history-kind');
                void dash._runContributorHistoryDeepDive(person, historyKind);
                return;
            }
            const copyEl = e.target.closest('[data-wf-dash-copy]');
            if (copyEl && modal.contains(copyEl)) {
                void dash._copyWithFeedback(copyEl, copyEl.getAttribute('data-wf-dash-copy'));
                return;
            }
            const actionBlockToggle = e.target.closest('[data-wf-dash-action-block-toggle]');
            if (actionBlockToggle && modal.contains(actionBlockToggle) && e.target === actionBlockToggle) {
                const blockId = actionBlockToggle.getAttribute('data-wf-dash-action-block-toggle');
                if (blockId) dash._toggleActionBlockCollapse(blockId);
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
                const item = dash._findCachedItem(itemId) || dash._findResultItem(itemId);
                const versionCount = item && item.task && item.task.promptVersions
                    ? item.task.promptVersions.length
                    : 0;
                dash._ensureRollingUiOnExpand(taskId, versionCount);
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
                const rollingUi = dash._getRollingUi(taskId);
                rollingUi.rollingLeft = 0;
                dash._patchTaskCard(itemId);
                return;
            }
            const feedbackBulkBtn = e.target.closest('[data-wf-dash-feedback-bulk]');
            if (feedbackBulkBtn && modal.contains(feedbackBulkBtn)) {
                const itemId = feedbackBulkBtn.getAttribute('data-item-id');
                const item = dash._findCachedItem(itemId) || dash._findResultItem(itemId);
                if (item) {
                    const rollingUi = dash._getRollingUi(item.task.id);
                    dash._setFeedbackBulkCollapsed(item, !rollingUi.feedbackBulkCollapsed);
                    dash._patchTaskCard(itemId);
                }
                return;
            }
            const rollingModalityBtn = e.target.closest('[data-wf-dash-rolling-modality]');
            if (rollingModalityBtn && modal.contains(rollingModalityBtn)) {
                const card = rollingModalityBtn.closest('[data-wf-dash-task-card]');
                const itemId = card && card.getAttribute('data-item-id');
                const item = itemId ? (dash._findCachedItem(itemId) || dash._findResultItem(itemId)) : null;
                if (item) {
                    const modality = rollingModalityBtn.getAttribute('data-wf-dash-rolling-modality');
                    if (modality === 'differences' || modality === 'similarities') {
                        dash._getRollingUi(item.task.id).highlightModality = modality;
                        dash._patchTaskCard(itemId);
                    }
                }
                return;
            }
            const rollingHighlightsBtn = e.target.closest('[data-wf-dash-rolling-highlights]');
            if (rollingHighlightsBtn && modal.contains(rollingHighlightsBtn)) {
                const card = rollingHighlightsBtn.closest('[data-wf-dash-task-card]');
                const itemId = card && card.getAttribute('data-item-id');
                const item = itemId ? (dash._findCachedItem(itemId) || dash._findResultItem(itemId)) : null;
                if (item) {
                    const val = rollingHighlightsBtn.getAttribute('data-wf-dash-rolling-highlights');
                    dash._getRollingUi(item.task.id).showHighlights = val === 'on';
                    dash._patchTaskCard(itemId);
                }
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
            const disputeOpenEnvBtn = e.target.closest('[data-wf-dash-dispute-open-env]');
            if (disputeOpenEnvBtn && modal.contains(disputeOpenEnvBtn)) {
                const disputeId = disputeOpenEnvBtn.getAttribute('data-dispute-id');
                const url = disputeId ? dashFleetDisputeUrl(disputeId) : '';
                if (url) dash._pageWindow().open(url, '_blank', 'noopener,noreferrer');
                return;
            }
            const disputeReleaseBtn = e.target.closest('[data-wf-dash-dispute-release]');
            if (disputeReleaseBtn && modal.contains(disputeReleaseBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const disputeId = disputeReleaseBtn.getAttribute('data-dispute-id');
                const itemId = disputeReleaseBtn.getAttribute('data-item-id');
                if (disputeId && itemId) void dash._handleDisputeRelease(disputeId, itemId);
                return;
            }
            const disputeResolveBtn = e.target.closest('[data-wf-dash-dispute-resolve]');
            if (disputeResolveBtn && modal.contains(disputeResolveBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const disputeId = disputeResolveBtn.getAttribute('data-dispute-id');
                const itemId = disputeResolveBtn.getAttribute('data-item-id');
                if (disputeId && itemId) void dash._handleDisputeResolve(disputeId, itemId);
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
            const flagCreateToggleBtn = e.target.closest('[data-wf-dash-flag-create-toggle]');
            if (flagCreateToggleBtn && modal.contains(flagCreateToggleBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const itemId = flagCreateToggleBtn.getAttribute('data-item-id');
                if (itemId) dash._toggleFlagCreatePanel(itemId, true);
                return;
            }
            const flagCreateCancelBtn = e.target.closest('[data-wf-dash-flag-create-cancel]');
            if (flagCreateCancelBtn && modal.contains(flagCreateCancelBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const itemId = flagCreateCancelBtn.getAttribute('data-item-id');
                if (itemId) dash._toggleFlagCreatePanel(itemId, false);
                return;
            }
            const flagCreateSubmitBtn = e.target.closest('[data-wf-dash-flag-create-submit]');
            if (flagCreateSubmitBtn && modal.contains(flagCreateSubmitBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const itemId = flagCreateSubmitBtn.getAttribute('data-item-id');
                if (itemId) void dash._handleFlagCreateSubmit(itemId);
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
            const loadScreenshotsBtn = e.target.closest('[data-wf-dash-load-screenshots]');
            if (loadScreenshotsBtn && modal.contains(loadScreenshotsBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const kind = loadScreenshotsBtn.getAttribute('data-screenshot-kind');
                const entityId = loadScreenshotsBtn.getAttribute('data-screenshot-id');
                const itemId = loadScreenshotsBtn.getAttribute('data-item-id');
                if (kind && entityId && itemId) void dash._handleLoadScreenshots(kind, entityId, itemId);
                return;
            }
            const screenshotThumb = e.target.closest('[data-wf-dash-screenshot-thumb]');
            if (screenshotThumb && modal.contains(screenshotThumb)) {
                e.stopPropagation();
                e.preventDefault();
                const url = screenshotThumb.getAttribute('data-screenshot-url');
                const img = screenshotThumb.querySelector('img');
                const alt = img && img.getAttribute('alt');
                if (url) dash._openScreenshotLightbox(url, alt);
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
                dash._syncAutoGrowTextarea(flagTa, DASH_AUTO_GROW_TEXTAREA_MIN_PX);
                return;
            }
            const flagCreateNote = e.target.closest('[data-wf-dash-flag-create-note]');
            if (flagCreateNote && modal.contains(flagCreateNote)) {
                const itemId = flagCreateNote.getAttribute('data-item-id');
                if (itemId) dash._handleFlagCreateInput(itemId, { note: flagCreateNote.value });
                dash._syncAutoGrowTextarea(flagCreateNote, DASH_AUTO_GROW_TEXTAREA_MIN_PX);
                return;
            }
            const disputeResolutionInput = e.target.closest('[data-wf-dash-dispute-resolution-input]');
            if (disputeResolutionInput && modal.contains(disputeResolutionInput)) {
                const disputeId = disputeResolutionInput.getAttribute('data-dispute-id');
                const itemId = disputeResolutionInput.getAttribute('data-item-id');
                if (disputeId && itemId) {
                    dash._handleDisputeResolutionInput(disputeId, itemId, disputeResolutionInput.value);
                }
                dash._syncAutoGrowTextarea(disputeResolutionInput, DASH_AUTO_GROW_TEXTAREA_MIN_PX);
                return;
            }
        });
        modal.addEventListener('change', (e) => {
            const disputeResolutionStatus = e.target.closest('[data-wf-dash-dispute-resolution-status]');
            if (disputeResolutionStatus && modal.contains(disputeResolutionStatus)) {
                const disputeId = disputeResolutionStatus.getAttribute('data-dispute-id');
                const itemId = disputeResolutionStatus.getAttribute('data-item-id');
                if (disputeId && itemId) {
                    dash._handleDisputeResolutionStatusChange(disputeId, itemId, disputeResolutionStatus.value);
                }
                return;
            }
            const disputeBugCategory = e.target.closest('[data-wf-dash-dispute-bug-category]');
            if (disputeBugCategory && modal.contains(disputeBugCategory)) {
                const disputeId = disputeBugCategory.getAttribute('data-dispute-id');
                const itemId = disputeBugCategory.getAttribute('data-item-id');
                if (disputeId && itemId) {
                    dash._handleDisputeBugCategoryChange(disputeId, itemId, disputeBugCategory.value);
                }
                return;
            }
            const flagCreateReason = e.target.closest('[data-wf-dash-flag-create-reason]');
            if (flagCreateReason && modal.contains(flagCreateReason)) {
                const itemId = flagCreateReason.getAttribute('data-item-id');
                if (itemId) dash._handleFlagCreateInput(itemId, { reason: flagCreateReason.value });
            }
        });
}

const plugin = {
    id: 'search-output',
    name: 'Search Output',
    description: 'Worker Output Search tab core: bootstrap, search, prefetch, filter engine',
    _version: '7.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        if (state && state.registered) {
            Logger.debug('search-output: tab already registered — skipping re-init');
            return;
        }
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            const err = new Error('search-output: dashboard loader not registered');
            Logger.error(err.message);
            throw err;
        }
        try {
            Object.assign(loader, searchOutputCoreMethods);
            if (Context.searchOutputLeftPaneMethods) Object.assign(loader, Context.searchOutputLeftPaneMethods);
            if (Context.searchOutputResultsPaneMethods) Object.assign(loader, Context.searchOutputResultsPaneMethods);
            if (Context.searchOutputStatsPaneMethods) Object.assign(loader, Context.searchOutputStatsPaneMethods);
        } catch (e) {
            Logger.error('search-output: attach to dashboard loader failed', e);
            throw e;
        }
        try {
            const de = Context.diffEngine;
            if (de && typeof de.onFleetThemeChange === 'function') {
                de.onFleetThemeChange(() => {
                    if (typeof loader._renderResults === 'function') loader._renderResults();
                });
            }
            if (loader._state && loader._state.catalog == null && typeof loader._readBootstrapCache === 'function') {
                loader._state.catalog = loader._readBootstrapCache();
            }
        } catch (e) {
            Logger.warn('search-output: pre-register setup failed', e);
        }
        Context.dashboard.registerTab({
            id: 'search-output',
            label: 'Search Output',
            panelHtml(dash) { return dash._searchPanelHtml(); },
            attachListeners(modal, dash) { attachSearchOutputListeners(modal, dash); },
            onOpen(dash) {
                void dash._doBootstrap();
                dash._refreshCatalogDependentUi();
                requestAnimationFrame(() => {
                    dash._applyAllSidePanelWidths();
                    if (typeof dash._applyStatsPanelLayoutOnOpen === 'function') {
                        dash._applyStatsPanelLayoutOnOpen(dash._modal);
                    }
                });
            },
            onBuilt(modal, dash) {
                dash._syncOutputToggleUi();
                dash._syncLeftTabUi();
                dash._refreshCatalogDependentUi();
                dash._updateResultsStatus();
                dash._updateSubstringErrorUi();
                dash._validateRangeUi();
                dash._syncFieldClearButtons();
                dash._resetTimeFilterUserPicked();
                dash._applyDefaultSearchDates();
                dash._state.resultsMode = dash._readResultsModePref();
                dash._syncResultsModeUi();
                const pagePref = dash._readResultsPageSizePref();
                dash._state.resultsPageSize = pagePref === 'all' ? 'all' : (Number(pagePref) || DASH_RESULTS_PAGE_SIZE_DEFAULT);
                dash._state.resultsPage = 0;
                dash._syncResultsPageSizeUi();
                dash._syncResultsPagerUi();
                if (typeof dash._applyStatsPanelLayoutOnOpen === 'function') {
                    dash._applyStatsPanelLayoutOnOpen(modal);
                }
            },
            onActivate(modal, dash) {
                requestAnimationFrame(() => {
                    dash._applyAllSidePanelWidths();
                    if (typeof dash._applyStatsPanelLayoutOnOpen === 'function') {
                        dash._applyStatsPanelLayoutOnOpen(modal);
                    }
                });
            }
        });
        if (state) state.registered = true;
        Logger.log('search-output: tab registered');
    }

};
