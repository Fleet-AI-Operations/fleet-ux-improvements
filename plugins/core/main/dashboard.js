// ============= dashboard.js =============
// Worker Output Search dashboard, opened as a popup from the Ops tab
// ("Open Dashboard" button under Team Member Search).
//
// This is the live port of the local prototype in local/dashboard. All data is
// gathered from documented Fleet PostgREST endpoints via Context.opsTab.postgrestGet,
// which reuses the exact same Supabase runtime config + session token gathering as the
// people lookup tool (cookies / sb-*-auth-token JWT). No secrets are hardcoded here.
//
// Porting notes / oddities live in docs/dashboard-live-port-handoff.md.

const DASH_BOOTSTRAP_STORAGE_KEY = 'fleet-ux:dashboard-bootstrap';
const DASH_BOOTSTRAP_VERSION = 1;
const DASH_FLEET_ORIGIN = 'https://www.fleetai.com';
const DASH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DASH_TASKS_PAGE_SIZE = 100;
const DASH_QA_PAGE_SIZE = 50;

const DASH_KIND_LABELS = {
    task_creation: 'Task Creation',
    qa: 'QA'
};

// ── Pure text-search helpers (ported from local/dashboard/src/lib/promptSearch.js) ──

function dashPrepareText(value, caseSensitive) {
    const trimmed = (value || '').replace(/\s+/g, ' ').trim();
    return caseSensitive ? trimmed : trimmed.toLowerCase();
}

function dashIsQueryEmpty(value, caseSensitive) {
    return dashPrepareText(value, caseSensitive).length === 0;
}

function dashLevenshtein(a, b, maxDistance) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
    const prev = new Array(b.length + 1);
    const curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j += 1) prev[j] = j;
    for (let i = 1; i <= a.length; i += 1) {
        curr[0] = i;
        let minRow = curr[0];
        const aChar = a.charCodeAt(i - 1);
        for (let j = 1; j <= b.length; j += 1) {
            const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
            const val = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            curr[j] = val;
            if (val < minRow) minRow = val;
        }
        if (minRow > maxDistance) return maxDistance + 1;
        for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
    }
    return prev[b.length];
}

function dashIsFuzzyMatch(query, candidate) {
    if (!query) return true;
    if (candidate.includes(query)) return true;
    const maxDistance = query.length <= 6 ? 1 : Math.max(2, Math.floor(query.length * 0.2));
    if (dashLevenshtein(query, candidate, maxDistance) <= maxDistance) return true;
    const queryWords = query.split(' ');
    const candidateWords = candidate.split(' ');
    return queryWords.every((queryWord) => {
        const wordMax = queryWord.length <= 5 ? 1 : 2;
        return candidateWords.some((candidateWord) => (
            candidateWord.includes(queryWord)
            || dashLevenshtein(queryWord, candidateWord, wordMax) <= wordMax
        ));
    });
}

function dashTextMatchesQuery(text, queryText, fuzzy, caseSensitive) {
    const query = dashPrepareText(queryText, caseSensitive);
    if (!query) return false;
    const candidate = dashPrepareText(text, caseSensitive);
    return fuzzy ? dashIsFuzzyMatch(query, candidate) : candidate.includes(query);
}

// ── Date range validation (ported from lib/dateRange.js) ──

function dashDateInputValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dashParseDateInput(dateLocal) {
    const raw = String(dateLocal || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const parts = raw.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const date = new Date(y, m, d);
    if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
    return date;
}

/** Convert YYYY-MM-DD to ISO UTC: After = start of local day, Before = end of local day. */
function dashDateLocalToIso(dateLocal, bound) {
    const date = dashParseDateInput(dateLocal);
    if (!date) return '';
    if (bound === 'before') {
        date.setHours(23, 59, 59, 999);
    } else {
        date.setHours(0, 0, 0, 0);
    }
    return date.toISOString();
}

function dashStartOfLocalDay(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date;
}

/** Local calendar preset → { after, before, label }. Week starts Sunday (US calendar week). */
function dashQuickDatePresetRange(preset) {
    const today = dashStartOfLocalDay(new Date());
    const y = today.getFullYear();
    const m = today.getMonth();
    switch (preset) {
        case 'today':
            return { after: today, before: today, label: 'Today' };
        case 'yesterday': {
            const day = new Date(today);
            day.setDate(day.getDate() - 1);
            return { after: day, before: day, label: 'Yesterday' };
        }
        case '3d': {
            const after = new Date(today);
            after.setDate(after.getDate() - 3);
            return { after, before: today, label: 'Last 3 Days' };
        }
        case '7d': {
            const after = new Date(today);
            after.setDate(after.getDate() - 7);
            return { after, before: today, label: 'Last 7 Days' };
        }
        case 'last-week': {
            const thisWeekStart = new Date(today);
            thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay());
            const lastWeekEnd = new Date(thisWeekStart);
            lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
            const lastWeekStart = new Date(lastWeekEnd);
            lastWeekStart.setDate(lastWeekStart.getDate() - 6);
            return { after: lastWeekStart, before: lastWeekEnd, label: 'Last Calendar Week' };
        }
        case 'this-month':
            return { after: new Date(y, m, 1), before: today, label: 'This Month' };
        case 'last-month': {
            const after = new Date(y, m - 1, 1);
            const before = new Date(y, m, 0);
            return { after, before, label: 'Last Calendar Month' };
        }
        case 'this-year':
            return { after: new Date(y, 0, 1), before: today, label: 'This Year' };
        case 'last-year':
            return { after: new Date(y - 1, 0, 1), before: new Date(y - 1, 11, 31), label: 'Last Calendar Year' };
        default:
            return null;
    }
}

function dashValidateCreatedAtRange(afterLocal, beforeLocal) {
    const afterIso = afterLocal ? dashDateLocalToIso(afterLocal, 'after') : '';
    const beforeIso = beforeLocal ? dashDateLocalToIso(beforeLocal, 'before') : '';
    if (afterLocal && !afterIso) {
        return { valid: false, error: 'After is not a valid date.', afterIso: '', beforeIso };
    }
    if (beforeLocal && !beforeIso) {
        return { valid: false, error: 'Before is not a valid date.', afterIso, beforeIso: '' };
    }
    if (afterIso && beforeIso && afterIso > beforeIso) {
        return { valid: false, error: 'After must be on or before Before.', afterIso, beforeIso };
    }
    return { valid: true, error: '', afterIso, beforeIso };
}

// ── Version-at-feedback resolution (ported from lib/versionAtFeedback.js) ──

function dashResolveVersionAtFeedback(versions, feedbackCreatedAt) {
    if (!versions || !versions.length) {
        return { version: null, versionNo: 1, totalVersions: 0 };
    }
    const sorted = [...versions].sort((a, b) => a.version_no - b.version_no);
    const feedbackTs = Date.parse(feedbackCreatedAt);
    let matched = sorted[0];
    for (const version of sorted) {
        const versionTs = Date.parse(version.created_at);
        if (Number.isNaN(versionTs) || versionTs <= feedbackTs) {
            matched = version;
        } else {
            break;
        }
    }
    return {
        version: matched,
        versionNo: (matched && matched.version_no) || 1,
        totalVersions: sorted.length
    };
}

// ── QA feedback display (ported from lib/qaFeedbackDisplay.js) ──

function dashParseFeedbackData(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch (_e) { return {}; }
    }
    return {};
}

function dashMapPromptQualityRating(rating) {
    if (rating == null || rating === '') return 'Average';
    const key = String(rating).toLowerCase();
    if (key.includes('top')) return 'Top 10%';
    if (key.includes('bottom')) return 'Bottom 10%';
    return 'Average';
}

function dashNormalizeNewlines(text) {
    return String(text).replace(/\\n/g, '\n');
}

function dashBuildQaFeedbackDisplay(feedbackRow, versionInfo, qaReviewer) {
    const data = dashParseFeedbackData(feedbackRow.feedback_data);
    const textBlocks = [];
    if (data.attempted_actions) textBlocks.push({ label: 'Attempted Actions', text: dashNormalizeNewlines(data.attempted_actions) });
    if (data.task_feedback) textBlocks.push({ label: 'Task Feedback', text: dashNormalizeNewlines(data.task_feedback) });
    if (data.environment_feedback) textBlocks.push({ label: 'Environment Feedback', text: dashNormalizeNewlines(data.environment_feedback) });
    const labels = Array.isArray(data.rejection_reason_labels)
        ? data.rejection_reason_labels.map(String)
        : (data.rejection_reason_label ? [String(data.rejection_reason_label)] : []);
    return {
        isPositive: Boolean(feedbackRow.is_positive_feedback),
        qualityRating: dashMapPromptQualityRating(data.prompt_quality_rating),
        versionNo: versionInfo.versionNo,
        totalVersions: versionInfo.totalVersions,
        textBlocks,
        rejectionBadges: labels.filter(Boolean),
        feedbackAt: String(feedbackRow.created_at || ''),
        qaReviewerId: String((qaReviewer && qaReviewer.id) || feedbackRow.created_by || ''),
        qaReviewerName: String((qaReviewer && qaReviewer.name) || ''),
        qaReviewerEmail: String((qaReviewer && qaReviewer.email) || '')
    };
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

function dashQaTextBlockLabel(label, isPositive) {
    if (isPositive && label === 'Task Feedback') return 'Approval Feedback';
    return label;
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
    description: 'Worker Output Search dashboard popup (task creations + QA reviews) opened from the Ops tab; all data via documented Fleet PostgREST endpoints',
    _version: '2.2',
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
            isOpen: () => this._isOpen()
        };
        Logger.log('dashboard: module registered (Context.dashboard)');
    },

    _createInitialState() {
        return {
            catalog: this._readBootstrapCache(),
            bootstrapStatus: 'idle',
            bootstrapError: null,
            autoBootstrapped: false,
            draftTokens: [],
            activeTab: 'tasks',
            cachedItems: null,
            filteredItems: null,
            hasSearched: false,
            loading: false,
            searchError: null,
            committed: null,
            searchParamsLocked: false,
            includeTasks: true,
            includeQa: true
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
            return parsed;
        } catch (_e) {
            return null;
        }
    },

    _writeBootstrapCache(data) {
        const entry = {
            version: DASH_BOOTSTRAP_VERSION,
            updatedAt: new Date().toISOString(),
            projects: data.projects,
            environments: data.environments
        };
        try {
            this._pageWindow().localStorage.setItem(DASH_BOOTSTRAP_STORAGE_KEY, JSON.stringify(entry));
        } catch (e) {
            Logger.warn('dashboard: failed to write bootstrap cache', e);
        }
        return entry;
    },

    // ── Catalog / team helpers ──

    _getTeamCatalog() {
        try {
            const secrets = Context.opsTab && typeof Context.opsTab.getSecrets === 'function'
                ? Context.opsTab.getSecrets()
                : null;
            if (secrets && Array.isArray(secrets['team-uuids'])) {
                return secrets['team-uuids'].filter((pair) => Array.isArray(pair) && pair[0] && pair[1]);
            }
        } catch (e) {
            Logger.debug('dashboard: team catalog read failed', e);
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

    async _pgGet(table, params) {
        if (!Context.opsTab || typeof Context.opsTab.postgrestGet !== 'function') {
            throw new Error('Ops tab PostgREST client unavailable. Unlock the Ops tab and try again.');
        }
        const rows = await Context.opsTab.postgrestGet(table, params || {});
        return Array.isArray(rows) ? rows : (rows ? [rows] : []);
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

    _evalTasksSelect() {
        // eval_task_projects embed was removed: project association goes through
        // task_project_target_id (column on eval_tasks, returned via *) → task_project_targets → project_id.
        return [
            '*',
            'eval_task_versions!eval_tasks_current_version_fk(id,prompt,env_key,version_no,created_at)'
        ].join(',');
    },

    _projectIdFromTargetId(targetId, targetToProjectId) {
        if (!targetId) return '';
        return (targetToProjectId && targetToProjectId.get(targetId)) || '';
    },

    async _fetchTargetProjectMap(targetIds) {
        if (!targetIds || targetIds.length === 0) return new Map();
        const map = new Map();
        for (let i = 0; i < targetIds.length; i += 50) {
            const chunk = targetIds.slice(i, i + 50);
            const rows = await this._pgGet('task_project_targets', {
                select: 'id,project_id',
                id: chunk.length === 1 ? 'eq.' + chunk[0] : 'in.(' + chunk.join(',') + ')',
                limit: String(chunk.length)
            }).catch((e) => { Logger.warn('dashboard: target→project lookup failed', e); return []; });
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
                name: (profile && profile.full_name) || '',
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
            const rows = await this._pgGet('profiles', { select: 'id,full_name,email', id: 'eq.' + q, limit: 1 });
            return rows.map((p) => ({ id: p.id, full_name: p.full_name, email: p.email }));
        }
        const safe = q.replace(/[(),*]/g, ' ').trim();
        if (!safe) return [];
        const rows = await this._pgGet('profiles', {
            select: 'id,full_name,email',
            or: `(full_name.ilike.*${safe}*,email.ilike.*${safe}*)`,
            order: 'full_name.asc',
            limit: 20
        });
        return rows.map((p) => ({ id: p.id, full_name: p.full_name, email: p.email }));
    },

    // ── Bootstrap (projects + environments) ──

    async _runBootstrap() {
        const teamCatalog = this._getTeamCatalog();
        const projectsById = new Map();
        if (teamCatalog.length > 0) {
            const pages = await Promise.all(teamCatalog.map(([teamId]) => this._pgGet('task_projects', {
                select: 'id,name,description,status,project_key,created_at,team_id',
                status: 'neq.archived',
                order: 'created_at.desc',
                team_id: 'eq.' + teamId,
                limit: 200
            }).catch((e) => {
                Logger.debug('dashboard: bootstrap projects failed for team ' + teamId.slice(0, 8), e);
                return [];
            })));
            for (const page of pages) {
                for (const row of page) if (!projectsById.has(row.id)) projectsById.set(row.id, row);
            }
        } else {
            const page = await this._pgGet('task_projects', {
                select: 'id,name,description,status,project_key,created_at,team_id',
                status: 'neq.archived',
                order: 'created_at.desc',
                limit: 400
            });
            for (const row of page) if (!projectsById.has(row.id)) projectsById.set(row.id, row);
        }
        const projects = Array.from(projectsById.values());
        const environments = await this._pgGet('environments', {
            select: 'env_key,name',
            deleted_at: 'is.null',
            order: 'env_key.asc'
        });
        return this._writeBootstrapCache({ projects, environments });
    },

    async _doBootstrap() {
        this._state.bootstrapStatus = 'loading';
        this._state.bootstrapError = null;
        this._refreshCatalogDependentUi();
        try {
            const result = await this._runBootstrap();
            this._state.catalog = result;
            this._state.bootstrapStatus = 'done';
            Logger.log('dashboard: bootstrap complete (' + result.projects.length + ' projects, ' + result.environments.length + ' environments)');
        } catch (err) {
            this._state.bootstrapError = err.message;
            this._state.bootstrapStatus = 'error';
            Logger.warn('dashboard: bootstrap failed', err);
        } finally {
            this._refreshCatalogDependentUi();
        }
    },

    // ── Worker output search ──

    async _fetchTargetIdsForProjects(projectIds) {
        if (!projectIds || projectIds.length === 0) return [];
        const ids = [];
        for (let i = 0; i < projectIds.length; i += 50) {
            const chunk = projectIds.slice(i, i + 50);
            const rows = await this._pgGet('task_project_targets', {
                select: 'id',
                project_id: chunk.length === 1 ? 'eq.' + chunk[0] : 'in.(' + chunk.join(',') + ')',
                limit: '500'
            }).catch((e) => { Logger.warn('dashboard: project→target lookup failed', e); return []; });
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
        const teamCatalog = this._getTeamCatalog();
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
        const targetIds = hasProjectFilter ? await this._fetchTargetIdsForProjects(projectIds) : [];

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

    _applyTaskScopeToQs(qs, scope) {
        if (scope.teamIds.length > 0) {
            qs.team_id = scope.teamIds.length === 1 ? 'eq.' + scope.teamIds[0] : 'in.(' + scope.teamIds.join(',') + ')';
        }
        if (scope.narrowedEnvs && scope.envKeys.length > 0) {
            qs.env_key = scope.envKeys.length === 1 ? 'eq.' + scope.envKeys[0] : 'in.(' + scope.envKeys.join(',') + ')';
        }
        if (scope.hasProjectFilter) {
            if (scope.targetIds.length === 0) return false;
            qs.task_project_target_id = scope.targetIds.length === 1
                ? 'eq.' + scope.targetIds[0]
                : 'in.(' + scope.targetIds.join(',') + ')';
        }
        return true;
    },

    _applyTaskScopeToQaQs(qs, scope) {
        if (scope.teamIds.length > 0) {
            qs['eval_tasks.team_id'] = scope.teamIds.length === 1 ? 'eq.' + scope.teamIds[0] : 'in.(' + scope.teamIds.join(',') + ')';
        }
        if (scope.narrowedEnvs && scope.envKeys.length > 0) {
            qs['eval_tasks.env_key'] = scope.envKeys.length === 1 ? 'eq.' + scope.envKeys[0] : 'in.(' + scope.envKeys.join(',') + ')';
        }
        if (scope.hasProjectFilter) {
            if (scope.targetIds.length === 0) return false;
            qs['eval_tasks.task_project_target_id'] = scope.targetIds.length === 1
                ? 'eq.' + scope.targetIds[0]
                : 'in.(' + scope.targetIds.join(',') + ')';
        }
        return true;
    },

    async _fetchTasksForSearch(authorIds, afterIso, beforeIso, scope) {
        if (scope.hasProjectFilter && scope.targetIds.length === 0) {
            Logger.debug('dashboard: tasks skipped — project filter matched no targets');
            return [];
        }
        Logger.debug('dashboard: fetching tasks — ' + (authorIds.length > 0 ? authorIds.length + ' author(s)' : 'all authors')
            + (scope.teamIds.length > 0 ? ' · ' + scope.teamIds.length + ' team(s)' : '')
            + (afterIso ? ' · after ' + afterIso : '') + (beforeIso ? ' · before ' + beforeIso : ''));
        const allRows = [];
        let offset = 0;
        let pageNum = 0;
        while (true) {
            const qs = {
                select: this._evalTasksSelect(),
                order: 'created_at.desc.nullslast',
                offset: String(offset),
                limit: String(DASH_TASKS_PAGE_SIZE)
            };
            if (authorIds.length === 1) qs.created_by = 'eq.' + authorIds[0];
            else if (authorIds.length > 1) qs.created_by = 'in.(' + authorIds.join(',') + ')';
            if (!this._applyTaskScopeToQs(qs, scope)) return [];
            this._addCreatedAtRange(qs, afterIso, beforeIso);
            const page = await this._pgGet('eval_tasks', qs);
            pageNum++;
            Logger.debug('dashboard: tasks page ' + pageNum + ' — ' + page.length + ' rows (offset ' + offset + ')');
            allRows.push(...page);
            if (page.length < DASH_TASKS_PAGE_SIZE) break;
            offset += DASH_TASKS_PAGE_SIZE;
        }
        Logger.debug('dashboard: tasks fetched (' + allRows.length + ' rows) — resolving profiles + project targets');
        const uniqueCreatedBy = [...new Set(allRows.map((r) => r.created_by).filter(Boolean))];
        const profileRows = uniqueCreatedBy.length > 0
            ? await this._pgGet('profiles', { select: 'id,full_name,email', id: 'in.(' + uniqueCreatedBy.join(',') + ')' })
            : [];
        const profilesMap = this._buildProfilesMap(profileRows);
        Logger.debug('dashboard: tasks profiles resolved (' + profileRows.length + ' / ' + uniqueCreatedBy.length + ')');

        const uniqueTargetIds = [...new Set(allRows.map((r) => r.task_project_target_id).filter(Boolean))];
        const targetToProjectId = await this._fetchTargetProjectMap(uniqueTargetIds);

        return allRows.map((row) => this._rowToTask(row, profilesMap, null, targetToProjectId));
    },

    _taskCreationItemsFromTasks(tasks) {
        return tasks.map((task) => ({
            id: 'task-' + task.id,
            kind: 'task_creation',
            sortAt: task.createdAt,
            task,
            qaFeedback: null
        }));
    },

    async _fetchQaFeedbackForSearch(authorIds, afterIso, beforeIso, scope) {
        if (scope.hasProjectFilter && scope.targetIds.length === 0) {
            Logger.debug('dashboard: QA skipped — project filter matched no targets');
            return [];
        }
        const useTaskEmbed = scope.narrowedTeams || scope.narrowedEnvs || scope.hasProjectFilter;
        Logger.debug('dashboard: fetching QA feedback — ' + (authorIds.length > 0 ? authorIds.length + ' author(s)' : 'all authors')
            + (afterIso ? ' · after ' + afterIso : '') + (beforeIso ? ' · before ' + beforeIso : '')
            + (useTaskEmbed ? ' · task scope embed' : ''));
        const allFeedback = [];
        let offset = 0;
        let pageNum = 0;
        while (true) {
            const qs = {
                select: useTaskEmbed
                    ? 'id,created_at,eval_task_id,is_positive_feedback,is_system_feedback,created_by,feedback_data,eval_tasks!inner(id,team_id,env_key,task_project_target_id)'
                    : 'id,created_at,eval_task_id,is_positive_feedback,is_system_feedback,created_by,feedback_data',
                is_system_feedback: 'not.eq.true',
                order: 'created_at.desc',
                offset: String(offset),
                limit: String(DASH_QA_PAGE_SIZE)
            };
            if (authorIds.length === 1) qs.created_by = 'eq.' + authorIds[0];
            else if (authorIds.length > 1) qs.created_by = 'in.(' + authorIds.join(',') + ')';
            if (useTaskEmbed && !this._applyTaskScopeToQaQs(qs, scope)) return [];
            this._addCreatedAtRange(qs, afterIso, beforeIso);
            const page = await this._pgGet('eval_task_qa_feedback', qs);
            pageNum++;
            Logger.debug('dashboard: QA feedback page ' + pageNum + ' — ' + page.length + ' rows (offset ' + offset + ')');
            allFeedback.push(...page);
            if (page.length < DASH_QA_PAGE_SIZE) break;
            offset += DASH_QA_PAGE_SIZE;
        }
        if (allFeedback.length === 0) {
            Logger.debug('dashboard: QA feedback — 0 rows, skipping task/version lookups');
            return [];
        }
        Logger.debug('dashboard: QA feedback — ' + allFeedback.length + ' rows total, fetching parent tasks');

        const taskIds = [...new Set(allFeedback.map((f) => f.eval_task_id).filter(Boolean))];
        Logger.debug('dashboard: QA — ' + taskIds.length + ' unique task(s) to fetch');
        const taskRows = [];
        for (let i = 0; i < taskIds.length; i += DASH_QA_PAGE_SIZE) {
            const chunk = taskIds.slice(i, i + DASH_QA_PAGE_SIZE);
            const qs = {
                select: this._evalTasksSelect(),
                id: chunk.length === 1 ? 'eq.' + chunk[0] : 'in.(' + chunk.join(',') + ')',
                limit: String(chunk.length)
            };
            if (!this._applyTaskScopeToQs(qs, scope)) continue;
            const page = await this._pgGet('eval_tasks', qs);
            taskRows.push(...page);
            Logger.debug('dashboard: QA tasks chunk — ' + page.length + ' rows');
        }
        const taskById = new Map(taskRows.map((row) => [row.id, row]));

        Logger.debug('dashboard: QA — fetching version history for ' + taskIds.length + ' task(s)');
        const versionsByTaskId = new Map();
        await Promise.all(taskIds.map(async (taskId) => {
            const versions = await this._pgGet('eval_task_versions', {
                select: 'id,version_no,created_at,prompt,env_key',
                task_id: 'eq.' + taskId,
                order: 'version_no.asc'
            });
            versionsByTaskId.set(taskId, versions);
        }));

        const profileIds = new Set();
        for (const row of taskRows) if (row.created_by) profileIds.add(row.created_by);
        for (const fb of allFeedback) if (fb.created_by) profileIds.add(fb.created_by);
        const profileRows = profileIds.size > 0
            ? await this._pgGet('profiles', { select: 'id,full_name,email', id: 'in.(' + [...profileIds].join(',') + ')' })
            : [];
        const profilesMap = this._buildProfilesMap(profileRows);
        Logger.debug('dashboard: QA profiles resolved (' + profileRows.length + ' / ' + profileIds.size + ')');

        const uniqueTargetIds = [...new Set(taskRows.map((r) => r.task_project_target_id).filter(Boolean))];
        const targetToProjectId = await this._fetchTargetProjectMap(uniqueTargetIds);

        const items = [];
        for (const feedback of allFeedback) {
            const taskRow = taskById.get(feedback.eval_task_id);
            if (!taskRow) continue;
            const versions = versionsByTaskId.get(feedback.eval_task_id) || [];
            const versionInfo = dashResolveVersionAtFeedback(versions, feedback.created_at);
            const task = this._rowToTask(taskRow, profilesMap, versionInfo.version, targetToProjectId);
            const qaReviewerProfile = profilesMap.get(feedback.created_by) || null;
            const qaFeedback = dashBuildQaFeedbackDisplay(feedback, versionInfo, {
                id: feedback.created_by,
                name: (qaReviewerProfile && qaReviewerProfile.full_name) || '',
                email: (qaReviewerProfile && qaReviewerProfile.email) || ''
            });
            items.push({ id: 'qa-' + feedback.id, kind: 'qa', sortAt: feedback.created_at, task, qaFeedback });
        }
        items.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));
        const positiveCount = items.filter((it) => it.qaFeedback && it.qaFeedback.isPositive).length;
        const negativeCount = items.length - positiveCount;
        Logger.log('dashboard: QA items built — ' + items.length + ' total (' + positiveCount + ' accepted, ' + negativeCount + ' returned)');
        return items;
    },

    async _fetchWorkerOutputSearch({ authorIds, includeTaskCreation, includeQa, afterIso, beforeIso, scope }) {
        const fetches = [];
        if (includeTaskCreation) {
            fetches.push(this._fetchTasksForSearch(authorIds, afterIso, beforeIso, scope).then((t) => this._taskCreationItemsFromTasks(t)));
        }
        if (includeQa) {
            fetches.push(this._fetchQaFeedbackForSearch(authorIds, afterIso, beforeIso, scope));
        }
        const parts = await Promise.all(fetches);
        const merged = parts.flat();
        return merged;
    },

    _sortItems(items, sortOrder) {
        const sorted = [...items];
        sorted.sort((a, b) => {
            const cmp = a.sortAt < b.sortAt ? -1 : a.sortAt > b.sortAt ? 1 : 0;
            return sortOrder === 'asc' ? cmp : -cmp;
        });
        return sorted;
    },

    // ── Client-side filters (Filters panel — applied via Apply, not on Search) ──

    _applyClientFilters(items, filters) {
        let result = items;
        const teamIds = filters.teamIds || [];
        const projectIds = filters.projectIds || [];
        const envKeys = filters.envKeys || [];
        if (teamIds.length > 0) {
            const set = new Set(teamIds);
            result = result.filter((it) => it.task.teamId && set.has(it.task.teamId));
        } else if (this._allFromList('filter-teams').length > 0) {
            result = [];
        }
        if (projectIds.length > 0) {
            const set = new Set(projectIds);
            result = result.filter((it) => it.task.projectId && set.has(it.task.projectId));
        } else if (this._allFromList('filter-projects').length > 0) {
            result = [];
        }
        if (envKeys.length > 0) {
            const set = new Set(envKeys);
            result = result.filter((it) => it.task.envKey && set.has(it.task.envKey));
        } else if (this._allFromList('filter-envs').length > 0) {
            result = [];
        }
        if (!dashIsQueryEmpty(filters.promptText, filters.caseSensitive)) {
            result = result.filter((it) => dashTextMatchesQuery(it.task.prompt, filters.promptText, filters.fuzzy, filters.caseSensitive));
        }
        return result;
    },

    // ── Popup lifecycle ──

    _isOpen() {
        return Boolean(this._overlay && this._overlay.style.display !== 'none');
    },

    open() {
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
        if (!this._state.autoBootstrapped && !this._state.catalog) {
            this._state.autoBootstrapped = true;
            void this._doBootstrap();
        } else {
            this._refreshCatalogDependentUi();
        }
        Logger.log('dashboard: opened');
    },

    close() {
        if (!this._overlay) return;
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
            'background: rgba(0,0,0,0.5)', 'padding: 24px', 'box-sizing: border-box'
        ].join(';');

        const modal = doc.createElement('div');
        modal.id = 'wf-dash-modal';
        modal.style.cssText = [
            'position: relative', 'display: flex', 'flex-direction: column',
            'width: min(1120px, 94vw)', 'height: min(880px, 90vh)',
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
        this._setActiveTab(this._state.activeTab);
        this._syncOutputToggleUi();
        this._refreshCatalogDependentUi();
        this._updateStatusFromState();
        Logger.log('dashboard: popup built');
    },

    _modalHtml() {
        const tabs = [
            { id: 'overview', label: 'Overview' },
            { id: 'tasks', label: 'Tasks' },
            { id: 'qa', label: 'QA' },
            { id: 'sessions', label: 'Sessions' }
        ];
        const tabBtns = tabs.map((t) => `
            <button type="button" class="wf-dash-tab" data-wf-dash-tab="${t.id}" style="
                position: relative; padding: 10px 14px; font-size: 13px; font-weight: 500;
                background: transparent; border: none; border-bottom: 2px solid transparent;
                margin-bottom: -1px; cursor: pointer; color: var(--muted-foreground, #64748b);
            ">${t.label}</button>`).join('');

        return `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;">
                <div style="min-width: 0;">
                    <div style="font-size: 15px; font-weight: 600; color: var(--foreground, #0f172a);">Dashboard</div>
                    <div style="font-size: 11px; color: var(--muted-foreground, #64748b); margin-top: 2px;">Worker output search — task creations and QA reviews via Fleet APIs.</div>
                </div>
                <button type="button" id="wf-dash-close" aria-label="Close dashboard" title="Close" style="
                    flex-shrink: 0; width: 32px; height: 32px; display: inline-flex; align-items: center;
                    justify-content: center; font-size: 20px; line-height: 1; border-radius: 6px;
                    color: var(--muted-foreground, #64748b); background: transparent;
                    border: 1px solid var(--border, #e2e8f0); cursor: pointer;
                ">&times;</button>
            </div>
            <nav style="display: flex; gap: 0; padding: 0 14px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;">
                ${tabBtns}
            </nav>
            <div id="wf-dash-body" style="flex: 1; min-height: 0; overflow-y: auto; padding: 16px 18px;">
                <div data-wf-dash-panel="overview" style="display: none; font-size: 12px; color: var(--muted-foreground, #64748b);">Overview content coming soon.</div>
                <div data-wf-dash-panel="tasks">${this._searchPanelHtml()}</div>
                <div data-wf-dash-panel="qa" style="display: none; font-size: 12px; color: var(--muted-foreground, #64748b);">QA content coming soon.</div>
                <div data-wf-dash-panel="sessions" style="display: none; font-size: 12px; color: var(--muted-foreground, #64748b);">Sessions content coming soon.</div>
            </div>
        `;
    },

    _panelBoxStyle() {
        return 'border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--card, #ffffff);';
    },
    _labelStyle() {
        return 'font-size: 11px; font-weight: 500; color: var(--muted-foreground, #64748b); letter-spacing: -0.01em;';
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

    _btnToggleStyle(active) {
        const base = 'padding: 7px 14px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer; border: 1px solid var(--border, #e2e8f0);';
        if (active) {
            return base + ' background: var(--brand, var(--primary, #2563eb)); color: var(--primary-foreground, #ffffff); border-color: var(--brand, var(--primary, #2563eb));';
        }
        return base + ' background: var(--background, #fff); color: var(--foreground, #0f172a); opacity: 0.75;';
    },

    _searchPanelHtml() {
        const box = this._panelBoxStyle();
        const label = this._labelStyle();
        const input = this._inputStyle();
        return `
            <section style="display: flex; flex-direction: column; gap: 12px;">
                <div style="${box}">
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--border, #e2e8f0);">
                        <div style="min-width: 0;">
                            <div style="font-size: 13px; font-weight: 600; color: var(--foreground, #0f172a);">Worker Output Search</div>
                            <div style="${label} margin-top: 4px; line-height: 1.45;">Configure search parameters and press Search. Parameters lock until you Clear. Use Filters below to refine loaded results.</div>
                        </div>
                        <button type="button" id="wf-dash-refresh" style="${this._btnStyle()} flex-shrink: 0;" title="Refresh teams, projects, and environment lists">Refresh catalogs</button>
                    </div>
                    <div id="wf-dash-search-fields" style="padding: 14px; display: flex; flex-direction: column; gap: 14px;">
                        <div id="wf-dash-bootstrap-error" style="display: none; font-size: 12px; color: var(--destructive, #dc2626);"></div>

                        <div>
                            <div style="${label} margin-bottom: 6px; font-weight: 600;">Output types</div>
                            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                <button type="button" id="wf-dash-toggle-tasks" aria-pressed="true" style="${this._btnToggleStyle(true)}">Task Creation</button>
                                <button type="button" id="wf-dash-toggle-qa" aria-pressed="true" style="${this._btnToggleStyle(true)}">QA</button>
                            </div>
                        </div>

                        <div>
                            <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Authors</label>
                            <div id="wf-dash-author-box" style="${input} display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 36px; cursor: text;">
                                <input type="text" id="wf-dash-author-input" autocomplete="off" placeholder="Name, email, or UUID — Enter to resolve" style="flex: 1; min-width: 160px; border: none; outline: none; background: transparent; font-size: 12px; color: var(--foreground, #0f172a); padding: 2px 0;">
                            </div>
                            <div id="wf-dash-author-error" style="display: none; font-size: 11px; color: var(--destructive, #dc2626); margin-top: 4px;"></div>
                            <div id="wf-dash-author-candidates" style="display: none; margin-top: 6px; ${box}"></div>
                            <div style="${label} margin-top: 4px;">Empty = all workers.</div>
                        </div>

                        <div style="display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px;">
                            <div style="flex-shrink: 0;">
                                <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Quick range</label>
                                <select id="wf-dash-quick-range" style="${input} width: auto; min-width: 168px; cursor: pointer;">
                                    <option value="">Custom</option>
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
                            <div style="flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; min-width: 220px;">
                                <div>
                                    <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">After</label>
                                    <input type="date" id="wf-dash-after" style="${input}">
                                </div>
                                <div>
                                    <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Before</label>
                                    <input type="date" id="wf-dash-before" style="${input}">
                                </div>
                            </div>
                        </div>
                        <div id="wf-dash-range-error" style="display: none; font-size: 11px; color: var(--destructive, #dc2626);"></div>

                        <div>
                            <div style="${label} margin-bottom: 6px; font-weight: 600;">Teams, projects, environments</div>
                            <div style="${label} margin-bottom: 8px;">None selected = all. Sent to the API on Search.</div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                                ${this._multiSelectHtml('search-teams', 'Teams', 'All teams', false)}
                                ${this._multiSelectHtml('search-projects', 'Projects', 'All projects', false)}
                                ${this._multiSelectHtml('search-envs', 'Environments', 'All environments', false)}
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 0 14px 14px;">
                        <button type="button" id="wf-dash-search" style="${this._btnPrimaryStyle()}">Search</button>
                        <button type="button" id="wf-dash-clear" style="${this._btnStyle()}">Clear</button>
                    </div>

                    <div id="wf-dash-error" style="display: none; font-size: 12px; color: var(--destructive, #dc2626); padding: 0 14px 10px;"></div>
                    <div id="wf-dash-status" style="font-size: 12px; color: var(--muted-foreground, #64748b); padding: 0 14px 14px;"></div>
                </div>

                <div style="${box} padding: 14px; display: flex; flex-direction: column; gap: 14px;">
                    <div>
                        <div style="font-size: 13px; font-weight: 600; color: var(--foreground, #0f172a);">Filters</div>
                        <div style="${label} margin-top: 4px;">Refine loaded results. Filter changes apply instantly.</div>
                    </div>

                    <div>
                        <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Substring</label>
                        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px;">
                            <input type="text" id="wf-dash-prompt" placeholder="Filter by prompt substring" style="${input} flex: 1; min-width: 200px;">
                            <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--foreground, #0f172a); cursor: pointer;">
                                <input type="checkbox" id="wf-dash-case"> Case sensitive
                            </label>
                            <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--foreground, #0f172a); cursor: pointer;">
                                <input type="checkbox" id="wf-dash-fuzzy"> Fuzzy
                            </label>
                        </div>
                    </div>

                    <div style="max-width: 280px;">
                        <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Sort</label>
                        <select id="wf-dash-sort" style="${input} cursor: pointer;">
                            <option value="desc">Created — newest first</option>
                            <option value="asc">Created — oldest first</option>
                        </select>
                    </div>

                    <div id="wf-dash-filter-scope-wrap" style="display: none;">
                        <div style="${label} margin-bottom: 8px; font-weight: 600;">Narrow results</div>
                        <div style="${label} margin-bottom: 8px;">Uncheck to hide; all checked shows everything from the search.</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                            ${this._multiSelectHtml('filter-teams', 'Teams', 'Search first to filter', true)}
                            ${this._multiSelectHtml('filter-projects', 'Projects', 'Search first to filter', true)}
                            ${this._multiSelectHtml('filter-envs', 'Environments', 'Search first to filter', true)}
                        </div>
                    </div>

                    <div>
                        <button type="button" id="wf-dash-apply-filters" style="${this._btnPrimaryStyle()}">Apply</button>
                    </div>
                </div>

                <div id="wf-dash-results" style="display: flex; flex-direction: column; gap: 8px;"></div>
            </section>
        `;
    },

    _multiSelectHtml(scopeKey, label, emptyHint, bulkActions) {
        const bulk = bulkActions ? `
                    <span style="display: inline-flex; gap: 6px;">
                        <button type="button" data-wf-dash-ms-all="${dashEscHtml(scopeKey)}" style="font-size: 10px; font-weight: 600; padding: 0 4px; border: none; background: transparent; color: var(--brand, var(--primary, #2563eb)); cursor: pointer;">All</button>
                        <button type="button" data-wf-dash-ms-none="${dashEscHtml(scopeKey)}" style="font-size: 10px; font-weight: 600; padding: 0 4px; border: none; background: transparent; color: var(--muted-foreground, #64748b); cursor: pointer;">None</button>
                    </span>` : '';
        return `
            <div style="${this._panelBoxStyle()}">
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid var(--border, #e2e8f0); gap: 6px;">
                    <span style="font-size: 11px; font-weight: 600; color: var(--foreground, #0f172a);">${dashEscHtml(label)}</span>
                    <span style="display: inline-flex; align-items: center; gap: 6px;">
                        ${bulk}
                        <span id="wf-dash-${scopeKey}-count" style="display: none; font-size: 10px; font-weight: 600; color: var(--brand, var(--primary, #2563eb));"></span>
                    </span>
                </div>
                <div id="wf-dash-${scopeKey}-list" data-wf-dash-empty="${dashEscHtml(emptyHint)}" style="max-height: 150px; overflow-y: auto; padding: 4px;">
                    <p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">${dashEscHtml(emptyHint)}</p>
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

        modal.querySelectorAll('[data-wf-dash-tab]').forEach((btn) => {
            btn.addEventListener('click', () => this._setActiveTab(btn.getAttribute('data-wf-dash-tab')));
        });

        const refresh = this._q('#wf-dash-refresh');
        if (refresh) refresh.addEventListener('click', () => { void this._doBootstrap(); });

        // Author token input
        const authorBox = this._q('#wf-dash-author-box');
        const authorInput = this._q('#wf-dash-author-input');
        if (authorBox && authorInput) {
            authorBox.addEventListener('click', () => authorInput.focus());
            authorInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const parts = authorInput.value.split(/[,\s]+/).filter(Boolean);
                    if (parts.length > 0) void this._resolveAuthorToken(parts[0]);
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

        const toggleTasks = this._q('#wf-dash-toggle-tasks');
        const toggleQa = this._q('#wf-dash-toggle-qa');
        if (toggleTasks) toggleTasks.addEventListener('click', () => this._toggleOutputType('tasks'));
        if (toggleQa) toggleQa.addEventListener('click', () => this._toggleOutputType('qa'));

        const prompt = this._q('#wf-dash-prompt');
        if (prompt) {
            let promptFilterTimer = null;
            const schedulePromptFilter = () => {
                if (!this._state.cachedItems) return;
                if (promptFilterTimer) clearTimeout(promptFilterTimer);
                promptFilterTimer = setTimeout(() => this._applyFiltersAndRender(), 250);
            };
            prompt.addEventListener('input', schedulePromptFilter);
            prompt.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (promptFilterTimer) clearTimeout(promptFilterTimer);
                    this._applyFiltersAndRender();
                }
            });
        }
        const applyFilters = this._q('#wf-dash-apply-filters');
        if (applyFilters) applyFilters.addEventListener('click', () => this._applyFiltersAndRender());
        const sortEl = this._q('#wf-dash-sort');
        if (sortEl) {
            sortEl.addEventListener('change', () => {
                if (this._state.cachedItems) this._applyFiltersAndRender();
            });
        }
        ['#wf-dash-case', '#wf-dash-fuzzy'].forEach((sel) => {
            const el = this._q(sel);
            if (el) {
                el.addEventListener('change', () => {
                    if (this._state.cachedItems) this._applyFiltersAndRender();
                });
            }
        });

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
        const clear = this._q('#wf-dash-clear');
        if (clear) clear.addEventListener('click', () => this._clearSearch());

        modal.addEventListener('change', (e) => {
            const cb = e.target;
            if (!cb || cb.type !== 'checkbox') return;
            const msKey = cb.getAttribute('data-wf-dash-ms');
            if (!msKey) return;
            this._updateMsCount(msKey);
            if (msKey === 'search-teams') this._renderSearchProjectsList();
            if (msKey.startsWith('filter-') && this._state.cachedItems) {
                this._applyFiltersAndRender();
            }
        });

        // Delegated copy + candidate selection handlers
        modal.addEventListener('click', (e) => {
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
                if (!this._state.searchParamsLocked) {
                    this._removeAuthorToken(removeTok.getAttribute('data-wf-dash-remove-token'));
                }
                return;
            }
            const msAll = e.target.closest('[data-wf-dash-ms-all]');
            if (msAll && modal.contains(msAll)) {
                this._setMultiselectChecked(msAll.getAttribute('data-wf-dash-ms-all'), true);
                return;
            }
            const msNone = e.target.closest('[data-wf-dash-ms-none]');
            if (msNone && modal.contains(msNone)) {
                this._setMultiselectChecked(msNone.getAttribute('data-wf-dash-ms-none'), false);
            }
        });
    },

    _toggleOutputType(kind) {
        if (this._state.searchParamsLocked) return;
        if (kind === 'tasks') {
            this._state.includeTasks = !this._state.includeTasks;
            this._syncOutputToggleUi();
            Logger.log('dashboard: Task Creation ' + (this._state.includeTasks ? 'on' : 'off'));
        } else if (kind === 'qa') {
            this._state.includeQa = !this._state.includeQa;
            this._syncOutputToggleUi();
            Logger.log('dashboard: QA ' + (this._state.includeQa ? 'on' : 'off'));
        }
    },

    _syncOutputToggleUi() {
        const tasksBtn = this._q('#wf-dash-toggle-tasks');
        const qaBtn = this._q('#wf-dash-toggle-qa');
        if (tasksBtn) {
            tasksBtn.setAttribute('aria-pressed', this._state.includeTasks ? 'true' : 'false');
            tasksBtn.style.cssText = this._btnToggleStyle(this._state.includeTasks);
        }
        if (qaBtn) {
            qaBtn.setAttribute('aria-pressed', this._state.includeQa ? 'true' : 'false');
            qaBtn.style.cssText = this._btnToggleStyle(this._state.includeQa);
        }
    },

    _setSearchParamsLocked(locked) {
        this._state.searchParamsLocked = locked;
        const fields = this._q('#wf-dash-search-fields');
        if (fields) {
            fields.style.opacity = locked ? '0.55' : '';
            fields.style.pointerEvents = locked ? 'none' : '';
        }
        const refreshBtn = this._q('#wf-dash-refresh');
        if (refreshBtn) refreshBtn.disabled = locked || this._state.bootstrapStatus === 'loading';
        const searchBtn = this._q('#wf-dash-search');
        if (searchBtn) searchBtn.disabled = locked || this._state.loading;
        Logger.debug('dashboard: search params ' + (locked ? 'locked' : 'unlocked'));
    },

    _setMultiselectChecked(scopeKey, checked) {
        const list = this._q('#wf-dash-' + scopeKey + '-list');
        if (!list) return;
        list.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = checked; });
        this._updateMsCount(scopeKey);
    },

    _setActiveTab(tabId) {
        this._state.activeTab = tabId;
        this._modal.querySelectorAll('[data-wf-dash-tab]').forEach((btn) => {
            const active = btn.getAttribute('data-wf-dash-tab') === tabId;
            btn.style.color = active ? 'var(--foreground, #0f172a)' : 'var(--muted-foreground, #64748b)';
            btn.style.borderBottomColor = active ? 'var(--brand, var(--primary, #2563eb))' : 'transparent';
        });
        this._modal.querySelectorAll('[data-wf-dash-panel]').forEach((panel) => {
            panel.style.display = panel.getAttribute('data-wf-dash-panel') === tabId ? '' : 'none';
        });
    },

    // ── Author tokens ──

    async _resolveAuthorToken(raw) {
        const query = (raw || '').trim();
        if (!query) return;
        const tokens = this._state.draftTokens;
        if (tokens.some((t) => t.full_name === query || t.email === query || t.id === query)) {
            const input = this._q('#wf-dash-author-input');
            if (input) input.value = '';
            return;
        }
        this._setAuthorError('');
        this._hideAuthorCandidates();
        try {
            const results = await this._searchPersons(query);
            if (results.length === 0) {
                this._setAuthorError(`No match for "${query}"`);
            } else if (results.length === 1) {
                this._addAuthorToken(results[0]);
                const input = this._q('#wf-dash-author-input');
                if (input) input.value = '';
            } else {
                this._showAuthorCandidates(results);
            }
        } catch (err) {
            this._setAuthorError('Lookup failed: ' + err.message);
            Logger.warn('dashboard: author lookup failed', err);
        }
    },

    _addAuthorToken(person) {
        if (this._state.searchParamsLocked) return;
        if (this._state.draftTokens.some((t) => t.id === person.id)) return;
        this._state.draftTokens.push(person);
        this._hideAuthorCandidates();
        this._setAuthorError('');
        this._renderAuthorTokens();
        Logger.log('dashboard: author token added (' + (person.full_name || person.id) + ')');
    },

    _removeAuthorToken(id) {
        if (this._state.searchParamsLocked) return;
        this._state.draftTokens = this._state.draftTokens.filter((t) => t.id !== id);
        this._renderAuthorTokens();
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
            chip.innerHTML = `${dashEscHtml(t.full_name || t.id)}<button type="button" data-wf-dash-remove-token="${dashEscHtml(t.id)}" aria-label="Remove ${dashEscHtml(t.full_name || t.id)}" style="border: none; background: transparent; color: inherit; cursor: pointer; font-size: 13px; line-height: 1; padding: 0 0 0 2px;">&times;</button>`;
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
                ${results.map((c) => `
                    <button type="button" data-wf-dash-candidate="${dashEscHtml(c.id)}" style="display: block; width: 100%; text-align: left; padding: 6px 8px; font-size: 11px; background: transparent; border: none; border-radius: 4px; cursor: pointer; color: var(--foreground, #0f172a);">
                        <span style="font-weight: 600;">${dashEscHtml(c.full_name)}</span>
                        <span style="margin-left: 8px; color: var(--muted-foreground, #64748b);">${dashEscHtml(c.email)}</span>
                    </button>`).join('')}
            </div>`;
        wrap.style.display = 'block';
    },

    _hideAuthorCandidates() {
        const wrap = this._q('#wf-dash-author-candidates');
        if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
        this._state._candidates = [];
    },

    // ── Multiselect rendering / reading ──

    _refreshCatalogDependentUi() {
        if (!this._built) return;
        const status = this._state.bootstrapStatus;
        const errEl = this._q('#wf-dash-bootstrap-error');
        if (errEl) {
            if (status === 'error') {
                errEl.textContent = 'Bootstrap failed: ' + (this._state.bootstrapError || 'unknown') + '. Filters may be empty.';
                errEl.style.display = 'block';
            } else {
                errEl.style.display = 'none';
            }
        }
        const refreshBtn = this._q('#wf-dash-refresh');
        if (refreshBtn) {
            refreshBtn.disabled = status === 'loading';
            refreshBtn.textContent = status === 'loading' ? 'Refreshing…' : 'Refresh catalogs';
        }
        this._renderSearchTeamsList();
        this._renderSearchProjectsList();
        this._renderSearchEnvsList();
    },

    _selectedFromList(scopeKey) {
        const list = this._q('#wf-dash-' + scopeKey + '-list');
        if (!list) return [];
        return [...list.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.value);
    },

    _allFromList(scopeKey) {
        const list = this._q('#wf-dash-' + scopeKey + '-list');
        if (!list) return [];
        return [...list.querySelectorAll('input[type="checkbox"]')].map((cb) => cb.value);
    },

    _multiSelectItemsHtml(scopeKey, items, emptyHint, loading, defaultChecked) {
        if (loading) return `<p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">Loading…</p>`;
        if (items.length === 0) return `<p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">${dashEscHtml(emptyHint)}</p>`;
        return items.map((it) => `
            <label style="display: flex; align-items: center; gap: 8px; padding: 4px 8px; font-size: 11px; border-radius: 4px; cursor: pointer; color: var(--foreground, #0f172a);">
                <input type="checkbox" value="${dashEscHtml(it.id)}" data-wf-dash-ms="${dashEscHtml(scopeKey)}"${defaultChecked ? ' checked' : ''}>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${dashEscHtml(it.label)}</span>
            </label>`).join('');
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
    },

    _renderSearchTeamsList() {
        const list = this._q('#wf-dash-search-teams-list');
        if (!list) return;
        const prevSelected = new Set(this._selectedFromList('search-teams'));
        const items = this._getTeamCatalog().map(([id, label]) => ({ id, label }));
        list.innerHTML = this._multiSelectItemsHtml('search-teams', items, 'All teams', false, false);
        list.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (prevSelected.has(cb.value)) cb.checked = true; });
        this._updateMsCount('search-teams');
    },

    _renderSearchProjectsList() {
        const list = this._q('#wf-dash-search-projects-list');
        if (!list) return;
        const prevSelected = new Set(this._selectedFromList('search-projects'));
        const loading = this._state.bootstrapStatus === 'loading';
        const items = this._availableSearchProjects().map((p) => ({ id: p.id, label: p.name }));
        const hint = this._state.catalog ? 'All projects' : 'Bootstrapping…';
        list.innerHTML = this._multiSelectItemsHtml('search-projects', items, hint, loading, false);
        list.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (prevSelected.has(cb.value)) cb.checked = true; });
        this._updateMsCount('search-projects');
    },

    _renderSearchEnvsList() {
        const list = this._q('#wf-dash-search-envs-list');
        if (!list) return;
        const prevSelected = new Set(this._selectedFromList('search-envs'));
        const loading = this._state.bootstrapStatus === 'loading';
        const envs = (this._state.catalog && this._state.catalog.environments) || [];
        const items = envs.map((e) => ({ id: e.env_key, label: e.name || e.env_key }));
        const hint = this._state.catalog ? 'All environments' : 'Bootstrapping…';
        list.innerHTML = this._multiSelectItemsHtml('search-envs', items, hint, loading, false);
        list.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (prevSelected.has(cb.value)) cb.checked = true; });
        this._updateMsCount('search-envs');
    },

    _getResultFilterSets() {
        const items = this._state.cachedItems;
        if (!items) return null;
        return {
            teamIds: new Set(items.map((i) => i.task.teamId).filter(Boolean)),
            projectIds: new Set(items.map((i) => i.task.projectId).filter(Boolean)),
            envKeys: new Set(items.map((i) => i.task.envKey).filter(Boolean))
        };
    },

    _resetFilterScopeLists() {
        const wrap = this._q('#wf-dash-filter-scope-wrap');
        if (wrap) wrap.style.display = 'none';
        ['filter-teams', 'filter-projects', 'filter-envs'].forEach((scopeKey) => {
            const list = this._q('#wf-dash-' + scopeKey + '-list');
            if (!list) return;
            const hint = list.getAttribute('data-wf-dash-empty') || 'Search first to filter';
            list.innerHTML = `<p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">${dashEscHtml(hint)}</p>`;
            this._updateMsCount(scopeKey);
        });
    },

    _renderFilterScopeLists() {
        const wrap = this._q('#wf-dash-filter-scope-wrap');
        const items = this._state.cachedItems;
        if (!wrap) return;
        if (!items || items.length === 0) {
            this._resetFilterScopeLists();
            return;
        }
        wrap.style.display = '';
        const sets = this._getResultFilterSets();
        const prevTeams = new Set(this._selectedFromList('filter-teams'));
        const prevProjects = new Set(this._selectedFromList('filter-projects'));
        const prevEnvs = new Set(this._selectedFromList('filter-envs'));
        const hadFilterLists = prevTeams.size > 0 || prevProjects.size > 0 || prevEnvs.size > 0;

        const teamItems = this._getTeamCatalog()
            .filter(([id]) => sets.teamIds.has(id))
            .map(([id, label]) => ({ id, label }));
        const projectItems = ((this._state.catalog && this._state.catalog.projects) || [])
            .filter((p) => sets.projectIds.has(p.id))
            .map((p) => ({ id: p.id, label: p.name }));
        const envItems = ((this._state.catalog && this._state.catalog.environments) || [])
            .filter((e) => sets.envKeys.has(e.env_key))
            .map((e) => ({ id: e.env_key, label: e.name || e.env_key }));

        const teamsList = this._q('#wf-dash-filter-teams-list');
        if (teamsList) {
            teamsList.innerHTML = this._multiSelectItemsHtml('filter-teams', teamItems, 'No teams in results', false, !hadFilterLists);
            if (hadFilterLists) {
                teamsList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                    cb.checked = prevTeams.has(cb.value);
                });
            }
            this._updateMsCount('filter-teams');
        }
        const projectsList = this._q('#wf-dash-filter-projects-list');
        if (projectsList) {
            projectsList.innerHTML = this._multiSelectItemsHtml('filter-projects', projectItems, 'No projects in results', false, !hadFilterLists);
            if (hadFilterLists) {
                projectsList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                    cb.checked = prevProjects.has(cb.value);
                });
            }
            this._updateMsCount('filter-projects');
        }
        const envsList = this._q('#wf-dash-filter-envs-list');
        if (envsList) {
            envsList.innerHTML = this._multiSelectItemsHtml('filter-envs', envItems, 'No environments in results', false, !hadFilterLists);
            if (hadFilterLists) {
                envsList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                    cb.checked = prevEnvs.has(cb.value);
                });
            }
            this._updateMsCount('filter-envs');
        }
        Logger.debug('dashboard: filter scope lists rendered — teams ' + teamItems.length
            + ', projects ' + projectItems.length + ', envs ' + envItems.length);
    },

    // ── Dirty / range validation ──

    _applyQuickDatePreset(preset) {
        const range = dashQuickDatePresetRange(preset);
        if (!range) {
            Logger.warn('dashboard: unknown quick date preset — ' + preset);
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
        const searchBtn = this._q('#wf-dash-search');
        if (searchBtn) searchBtn.disabled = (Boolean(after || before) && !check.valid) || this._state.loading || this._state.searchParamsLocked;
        return check;
    },

    // ── Search submit / clear ──

    async _submitSearch() {
        if (this._state.searchParamsLocked) return;
        const includeTasks = this._state.includeTasks;
        const includeQa = this._state.includeQa;
        if (!includeTasks && !includeQa) {
            this._setSearchError('Enable at least one output type: Task Creation or QA.');
            return;
        }
        const after = (this._q('#wf-dash-after') || {}).value || '';
        const before = (this._q('#wf-dash-before') || {}).value || '';
        const rangeCheck = dashValidateCreatedAtRange(after, before);
        if (!rangeCheck.valid) {
            this._setSearchError(rangeCheck.error);
            return;
        }

        const authorIds = this._state.draftTokens.map((t) => t.id);
        const scope = await this._buildSearchApiScope();
        Logger.info('dashboard: search started — '
            + (authorIds.length > 0 ? authorIds.length + ' author(s)' : 'all authors')
            + ' · types: ' + [includeTasks ? 'tasks' : null, includeQa ? 'QA' : null].filter(Boolean).join('+')
            + (after ? ' · after ' + after : '') + (before ? ' · before ' + before : ''));
        this._state.committed = {
            authorIds,
            taskCreation: includeTasks,
            qa: includeQa,
            afterLocal: after,
            beforeLocal: before,
            scopeSummary: {
                teams: scope.narrowedTeams ? scope.teamIds.length : 'all',
                projects: scope.narrowedProjects ? scope.projectIds.length : 'all',
                envs: scope.narrowedEnvs ? scope.envKeys.length : 'all'
            }
        };
        this._state.hasSearched = true;
        this._state.loading = true;
        this._setSearchError('');
        this._setSearchParamsLocked(true);
        this._setStatus('Loading…');
        this._setSearchButtonLoading(true);
        this._renderResults();

        try {
            const items = await this._fetchWorkerOutputSearch({
                authorIds,
                includeTaskCreation: includeTasks,
                includeQa,
                afterIso: rangeCheck.afterIso,
                beforeIso: rangeCheck.beforeIso,
                scope
            });
            this._state.cachedItems = items;
            Logger.log('dashboard: search loaded ' + items.length + ' item(s)');
            this._renderFilterScopeLists();
            this._applyFiltersAndRender();
        } catch (err) {
            this._setSearchError(err.message);
            this._state.cachedItems = null;
            this._state.filteredItems = null;
            Logger.warn('dashboard: search failed', err);
        } finally {
            this._state.loading = false;
            this._setSearchButtonLoading(false);
            this._setSearchParamsLocked(true);
            this._updateStatusFromState();
            this._renderResults();
        }
    },

    _clearSearch() {
        this._state.draftTokens = [];
        this._state.cachedItems = null;
        this._state.filteredItems = null;
        this._state.hasSearched = false;
        this._state.committed = null;
        this._state.includeTasks = true;
        this._state.includeQa = true;
        ['#wf-dash-after', '#wf-dash-before', '#wf-dash-prompt'].forEach((sel) => { const el = this._q(sel); if (el) el.value = ''; });
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = '';
        const sortEl = this._q('#wf-dash-sort');
        if (sortEl) sortEl.value = 'desc';
        ['#wf-dash-case', '#wf-dash-fuzzy'].forEach((sel) => { const el = this._q(sel); if (el) el.checked = false; });
        ['search-teams', 'search-projects', 'search-envs'].forEach((key) => {
            const list = this._q('#wf-dash-' + key + '-list');
            if (list) list.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
            this._updateMsCount(key);
        });
        this._syncOutputToggleUi();
        this._renderSearchProjectsList();
        this._resetFilterScopeLists();
        this._renderAuthorTokens();
        this._hideAuthorCandidates();
        this._setAuthorError('');
        this._setSearchError('');
        this._validateRangeUi();
        this._setSearchParamsLocked(false);
        this._setStatus('Set search parameters, then press Search. Use Filters to refine loaded results.');
        this._renderResults();
        Logger.log('dashboard: search cleared — parameters unlocked');
    },

    _currentClientFilters() {
        return {
            promptText: (this._q('#wf-dash-prompt') || {}).value || '',
            fuzzy: Boolean((this._q('#wf-dash-fuzzy') || {}).checked),
            caseSensitive: Boolean((this._q('#wf-dash-case') || {}).checked),
            teamIds: this._selectedFromList('filter-teams'),
            projectIds: this._selectedFromList('filter-projects'),
            envKeys: this._selectedFromList('filter-envs'),
            sortOrder: ((this._q('#wf-dash-sort') || {}).value || 'desc') === 'asc' ? 'asc' : 'desc'
        };
    },

    _applyFiltersAndRender() {
        if (this._state.cachedItems === null) {
            this._state.filteredItems = null;
            this._updateStatusFromState();
            this._renderResults();
            return;
        }
        const filters = this._currentClientFilters();
        const before = this._state.cachedItems.length;
        let result = this._applyClientFilters(this._state.cachedItems, filters);
        result = this._sortItems(result, filters.sortOrder);
        this._state.filteredItems = result;
        const after = result.length;
        Logger.log('dashboard: filters applied — ' + after + ' / ' + before + ' items'
            + (filters.sortOrder === 'asc' ? ' · sort asc' : ' · sort desc'));
        this._updateStatusFromState();
        this._renderResults();
    },

    // ── Status text ──

    _setStatus(text) {
        const el = this._q('#wf-dash-status');
        if (el) el.textContent = text || '';
    },

    _setSearchError(text) {
        this._state.searchError = text || null;
        const el = this._q('#wf-dash-error');
        if (el) { el.textContent = text ? 'Error: ' + text : ''; el.style.display = text ? 'block' : 'none'; }
        if (text && text.startsWith('Enable at least')) this._setStatus('');
    },

    _setSearchButtonLoading(loading) {
        const btn = this._q('#wf-dash-search');
        if (!btn) return;
        btn.disabled = loading;
        btn.textContent = loading ? 'Loading…' : 'Search';
        const clear = this._q('#wf-dash-clear');
        if (clear) clear.disabled = loading;
    },

    _updateStatusFromState() {
        const s = this._state;
        if (!s.hasSearched) {
            this._setStatus('Set search parameters, then press Search. Use Filters to refine loaded results.');
            return;
        }
        if (s.loading) { this._setStatus('Loading…'); return; }
        if (s.searchError && !s.cachedItems) { this._setStatus(''); return; }
        if (s.filteredItems !== null && s.cachedItems !== null) {
            const committed = s.committed || { authorIds: [], taskCreation: false, qa: false };
            const authorLabel = committed.authorIds.length > 0 ? committed.authorIds.length + ' author(s)' : 'all authors';
            const modeParts = [];
            if (committed.taskCreation) modeParts.push('tasks');
            if (committed.qa) modeParts.push('QA');
            const countLabel = s.filteredItems.length === s.cachedItems.length
                ? s.filteredItems.length + ' result(s)'
                : s.filteredItems.length + ' of ' + s.cachedItems.length + ' result(s)';
            const f = this._currentClientFilters();
            const hasFilters = f.teamIds.length < this._allFromList('filter-teams').length
                || f.projectIds.length < this._allFromList('filter-projects').length
                || f.envKeys.length < this._allFromList('filter-envs').length
                || !dashIsQueryEmpty(f.promptText, f.caseSensitive);
            this._setStatus(countLabel + ' — ' + authorLabel + ' · ' + modeParts.join(' + ')
                + (hasFilters ? ' · filters active' : '') + ' · search locked (Clear to edit)');
        }
    },

    // ── Results rendering ──

    _renderResults() {
        const wrap = this._q('#wf-dash-results');
        if (!wrap) return;
        const s = this._state;
        if (!s.hasSearched || s.loading || (s.searchError && s.searchError.startsWith('Enable at least')) || s.filteredItems === null) {
            wrap.innerHTML = '';
            return;
        }
        if (s.filteredItems.length === 0) {
            const msg = (s.cachedItems && s.cachedItems.length === 0)
                ? 'No results matched this search.'
                : 'No results match the current filters.';
            wrap.innerHTML = `<p style="font-size: 12px; color: var(--muted-foreground, #64748b);">${msg}</p>`;
            return;
        }
        wrap.innerHTML = s.filteredItems.map((item) => this._taskCardHtml(item)).join('');
    },

    _copyChipHtml(text) {
        const value = String(text == null ? '' : text).trim();
        if (!value) {
            return `<span style="display: inline-block; padding: 3px 8px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; font-size: 11px; color: var(--muted-foreground, #64748b); opacity: 0.6;">—</span>`;
        }
        return `<button type="button" data-wf-dash-copy="${dashEscHtml(value)}" title="Click to copy" style="display: inline-block; max-width: 100%; padding: 3px 8px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; font-size: 11px; color: var(--foreground, #0f172a); background: transparent; text-align: left; word-break: break-all; cursor: pointer;">${dashEscHtml(value)}</button>`;
    },

    _copyIconHtml(text) {
        const value = String(text == null ? '' : text);
        return `<button type="button" data-wf-dash-copy="${dashEscHtml(value)}" title="Copy" aria-label="Copy" style="display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border-radius: 6px; border: none; background: transparent; color: var(--muted-foreground, #64748b); cursor: pointer;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>`;
    },

    _extLinkHtml(href, title) {
        const url = String(href || '').trim();
        if (!url) return '';
        return `<a href="${dashEscHtml(url)}" target="_blank" rel="noopener noreferrer" title="${dashEscHtml(title)}" aria-label="${dashEscHtml(title)}" style="display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border-radius: 6px; color: var(--muted-foreground, #64748b); text-decoration: none;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>
        </a>`;
    },

    _labelSpan(text) {
        return `<span style="${this._labelStyle()}">${dashEscHtml(text)}</span>`;
    },

    /** Label + value group: tight label→data gap; use in rows with larger gap between groups. */
    _fieldGroupHtml(label, valueHtml) {
        return `<div style="display: inline-flex; align-items: center; gap: 3px; flex-wrap: wrap;">${this._labelSpan(label)}${valueHtml}</div>`;
    },

    _timestampWithAgoHtml(iso) {
        const formatted = dashFormatCreatedAt(iso);
        const ago = dashRelativeAgo(iso);
        const agoHtml = ago
            ? `<span style="font-size: 11px; color: var(--muted-foreground, #64748b);">(${dashEscHtml(ago)})</span>`
            : '';
        return this._copyChipHtml(formatted) + agoHtml;
    },

    _dismissedBadgeHtml() {
        return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #7c3aed; background: color-mix(in srgb, #7c3aed 12%, transparent); letter-spacing: 0.04em;">DISMISSED FROM FLEET</span>`;
    },

    _personChipsHtml(name, email, id, linkTitle) {
        if (!name && !email) return this._dismissedBadgeHtml();
        return this._copyChipHtml(name) + this._copyChipHtml(email) + this._extLinkHtml(dashFleetExpertUrl(id), linkTitle);
    },

    _statusBadgeHtml(status) {
        const key = (status || 'unknown').toLowerCase();
        let color = 'var(--muted-foreground, #64748b)';
        let bg = 'color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent)';
        if (key.includes('production')) { color = '#15803d'; bg = 'color-mix(in srgb, #16a34a 14%, transparent)'; }
        else if (key.includes('review')) { color = '#b45309'; bg = 'color-mix(in srgb, #d97706 14%, transparent)'; }
        return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: ${color}; background: ${bg};">${dashEscHtml(status || '—')}</span>`;
    },

    _qaBlockHtml(qa) {
        const positive = qa.isPositive;
        // Green for accepted, red for returned — prompt rating is separate and must not affect these colors
        const border = positive ? 'color-mix(in srgb, #16a34a 35%, transparent)' : 'color-mix(in srgb, #dc2626 40%, transparent)';
        const bg = positive ? 'color-mix(in srgb, #16a34a 8%, transparent)' : 'color-mix(in srgb, #dc2626 8%, transparent)';
        const statusLabel = positive
            ? `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #15803d; background: color-mix(in srgb, #16a34a 14%, transparent);">Accepted</span>`
            : `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #b91c1c; background: color-mix(in srgb, #dc2626 14%, transparent);">Returned for Revision</span>`;
        const badges = qa.rejectionBadges.length > 0
            ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Issues')}${qa.rejectionBadges.map((l) => `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: #b45309; background: color-mix(in srgb, #d97706 14%, transparent);">${dashEscHtml(l)}</span>`).join('')}</div>`
            : '';
        const blocks = qa.textBlocks.map((b) => {
            const blockLabel = dashQaTextBlockLabel(b.label, positive);
            return `
            <div>
                <div style="display: flex; align-items: center; gap: 6px;">${this._labelSpan(blockLabel)}${this._copyIconHtml(b.text)}</div>
                <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${dashEscHtml(b.text)}</p>
            </div>`;
        }).join('');
        return `
            <div style="margin-top: 12px; padding: 10px 12px; border: 1px solid ${border}; border-radius: 8px; background: ${bg}; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 16px; min-width: 0;">
                        <span style="font-weight: 600; color: var(--foreground, #0f172a);">QA Feedback</span>
                    </div>
                    <div style="flex-shrink: 0; margin-left: auto;">${statusLabel}</div>
                </div>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                    ${this._labelSpan('QA Reviewer')}${this._personChipsHtml(qa.qaReviewerName, qa.qaReviewerEmail, qa.qaReviewerId, 'Open QA reviewer in Fleet')}
                </div>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 16px;">
                    <div style="display: flex; align-items: center; gap: 6px;">${this._labelSpan('Prompt Rating')}<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: var(--muted-foreground, #64748b); background: color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent);">${dashEscHtml(qa.qualityRating)}</span></div>
                    ${badges}
                </div>
                ${blocks}
            </div>`;
    },

    _kindBadgeHtml(kindLabel) {
        if (!kindLabel) return '';
        return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: var(--muted-foreground, #64748b); background: color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent);">${dashEscHtml(kindLabel)}</span>`;
    },

    _taskCardHtml(item) {
        const task = item.task;
        const qa = item.qaFeedback;
        const kindLabel = DASH_KIND_LABELS[item.kind] || '';
        const promptLabel = qa ? `Prompt Version ${qa.versionNo} of ${qa.totalVersions}` : 'Prompt';
        const kindBadge = kindLabel ? this._kindBadgeHtml(kindLabel) : '';
        const projectValue = this._copyChipHtml(task.project)
            + (task.projectId ? this._extLinkHtml(dashFleetProjectUrl(task.projectId), 'Open project in Fleet') : '');
        return `
            <article style="position: relative; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--card, #ffffff); overflow: hidden;${kindLabel ? ' padding-bottom: 36px;' : ''}">
                <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; width: 100%; gap: 8px; padding: 12px 14px 10px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px; box-sizing: border-box;">
                    ${this._fieldGroupHtml('Task Created', this._timestampWithAgoHtml(task.createdAt))}
                    ${this._fieldGroupHtml('ID', this._copyChipHtml(task.id))}
                    <div style="display: inline-flex; align-items: center; gap: 12px; flex-shrink: 0; margin-left: auto;">
                        ${this._fieldGroupHtml('Key', this._copyChipHtml(task.key))}
                        ${this._extLinkHtml(dashFleetTaskUrl(task.id), 'Open task in Fleet')}
                    </div>
                </div>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; padding: 8px 14px 10px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">
                    ${this._fieldGroupHtml('Team', this._copyChipHtml(task.team))}
                    ${this._fieldGroupHtml('Project', projectValue)}
                    ${this._fieldGroupHtml('Environment', this._copyChipHtml(task.environment))}
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px; padding: 12px 14px 14px; font-size: 12px;">
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 3px;">
                        ${this._labelSpan('Author')}${this._personChipsHtml(task.author.name, task.author.email, task.author.id, 'Open author in Fleet')}
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                            <div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 3px; min-width: 0;">
                                ${this._labelSpan(promptLabel)}${this._copyIconHtml(task.prompt)}
                            </div>
                            <div style="flex-shrink: 0; margin-left: auto;">${this._statusBadgeHtml(task.status)}</div>
                        </div>
                        <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${dashEscHtml(task.prompt || '—')}</p>
                        ${qa ? this._qaBlockHtml(qa) : ''}
                    </div>
                </div>
                ${kindBadge ? `<div style="position: absolute; bottom: 12px; right: 14px;">${kindBadge}</div>` : ''}
            </article>`;
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
