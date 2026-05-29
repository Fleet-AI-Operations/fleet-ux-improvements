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

function dashDatetimeLocalToIso(datetimeLocal) {
    const raw = String(datetimeLocal || '').trim();
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
}

function dashValidateCreatedAtRange(afterLocal, beforeLocal) {
    const afterIso = dashDatetimeLocalToIso(afterLocal);
    const beforeIso = dashDatetimeLocalToIso(beforeLocal);
    if (afterLocal && !afterIso) {
        return { valid: false, error: 'After is not a valid date and time.', afterIso: '', beforeIso };
    }
    if (beforeLocal && !beforeIso) {
        return { valid: false, error: 'Before is not a valid date and time.', afterIso, beforeIso: '' };
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
    return date.toLocaleString();
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
    _version: '1.1',
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
            committed: null
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
        return [
            '*',
            'eval_task_versions!eval_tasks_current_version_fk(id,prompt,env_key,version_no,created_at)',
            'eval_task_projects(project_id)'
        ].join(',');
    },

    _projectIdFromRow(row) {
        const projects = row.eval_task_projects;
        if (!Array.isArray(projects) || projects.length === 0) return '';
        const first = projects[0];
        return (first && typeof first === 'object') ? (first.project_id || '') : '';
    },

    _buildProfilesMap(profileRows) {
        const map = new Map();
        for (const p of profileRows) map.set(p.id, { full_name: p.full_name, email: p.email });
        return map;
    },

    _rowToTask(row, profilesMap, versionOverride) {
        const version = versionOverride
            || (Array.isArray(row.eval_task_versions) ? row.eval_task_versions[0] : null);
        const profile = profilesMap.get(row.created_by) || null;
        const projectId = this._projectIdFromRow(row);
        return {
            id: row.id,
            author: {
                id: row.created_by || '',
                name: (profile && profile.full_name) || '',
                email: (profile && profile.email) || ''
            },
            prompt: (version && version.prompt) || '',
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

    async _fetchTasksForSearch(authorIds, afterIso, beforeIso) {
        const teamCatalog = this._getTeamCatalog();
        const teamIds = teamCatalog.map(([id]) => id);
        const allRows = [];
        let offset = 0;
        while (true) {
            const qs = {
                select: this._evalTasksSelect(),
                order: 'created_at.desc.nullslast',
                offset: String(offset),
                limit: String(DASH_TASKS_PAGE_SIZE)
            };
            if (authorIds.length === 1) qs.created_by = 'eq.' + authorIds[0];
            else if (authorIds.length > 1) qs.created_by = 'in.(' + authorIds.join(',') + ')';
            if (teamIds.length > 0) qs.team_id = 'in.(' + teamIds.join(',') + ')';
            this._addCreatedAtRange(qs, afterIso, beforeIso);
            const page = await this._pgGet('eval_tasks', qs);
            allRows.push(...page);
            if (page.length < DASH_TASKS_PAGE_SIZE) break;
            offset += DASH_TASKS_PAGE_SIZE;
        }
        const uniqueCreatedBy = [...new Set(allRows.map((r) => r.created_by).filter(Boolean))];
        const profileRows = uniqueCreatedBy.length > 0
            ? await this._pgGet('profiles', { select: 'id,full_name,email', id: 'in.(' + uniqueCreatedBy.join(',') + ')' })
            : [];
        const profilesMap = this._buildProfilesMap(profileRows);
        return allRows.map((row) => this._rowToTask(row, profilesMap));
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

    async _fetchQaFeedbackForSearch(authorIds, afterIso, beforeIso) {
        const allFeedback = [];
        let offset = 0;
        while (true) {
            const qs = {
                select: 'id,created_at,eval_task_id,is_positive_feedback,is_system_feedback,created_by,feedback_data',
                is_system_feedback: 'not.eq.true',
                order: 'created_at.desc',
                offset: String(offset),
                limit: String(DASH_QA_PAGE_SIZE)
            };
            if (authorIds.length === 1) qs.created_by = 'eq.' + authorIds[0];
            else if (authorIds.length > 1) qs.created_by = 'in.(' + authorIds.join(',') + ')';
            this._addCreatedAtRange(qs, afterIso, beforeIso);
            const page = await this._pgGet('eval_task_qa_feedback', qs);
            allFeedback.push(...page);
            if (page.length < DASH_QA_PAGE_SIZE) break;
            offset += DASH_QA_PAGE_SIZE;
        }
        if (allFeedback.length === 0) return [];

        const taskIds = [...new Set(allFeedback.map((f) => f.eval_task_id).filter(Boolean))];
        const taskRows = [];
        for (let i = 0; i < taskIds.length; i += DASH_QA_PAGE_SIZE) {
            const chunk = taskIds.slice(i, i + DASH_QA_PAGE_SIZE);
            const page = await this._pgGet('eval_tasks', {
                select: this._evalTasksSelect(),
                id: chunk.length === 1 ? 'eq.' + chunk[0] : 'in.(' + chunk.join(',') + ')',
                limit: String(chunk.length)
            });
            taskRows.push(...page);
        }
        const taskById = new Map(taskRows.map((row) => [row.id, row]));

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

        const items = [];
        for (const feedback of allFeedback) {
            const taskRow = taskById.get(feedback.eval_task_id);
            if (!taskRow) continue;
            const versions = versionsByTaskId.get(feedback.eval_task_id) || [];
            const versionInfo = dashResolveVersionAtFeedback(versions, feedback.created_at);
            const task = this._rowToTask(taskRow, profilesMap, versionInfo.version);
            const qaReviewerProfile = profilesMap.get(feedback.created_by) || null;
            const qaFeedback = dashBuildQaFeedbackDisplay(feedback, versionInfo, {
                id: feedback.created_by,
                name: (qaReviewerProfile && qaReviewerProfile.full_name) || '',
                email: (qaReviewerProfile && qaReviewerProfile.email) || ''
            });
            items.push({ id: 'qa-' + feedback.id, kind: 'qa', sortAt: feedback.created_at, task, qaFeedback });
        }
        items.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));
        return items;
    },

    async _fetchWorkerOutputSearch({ authorIds, includeTaskCreation, includeQa, afterIso, beforeIso }) {
        const fetches = [];
        if (includeTaskCreation) {
            fetches.push(this._fetchTasksForSearch(authorIds, afterIso, beforeIso).then((t) => this._taskCreationItemsFromTasks(t)));
        }
        if (includeQa) {
            fetches.push(this._fetchQaFeedbackForSearch(authorIds, afterIso, beforeIso));
        }
        const parts = await Promise.all(fetches);
        const merged = parts.flat();
        merged.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));
        return merged;
    },

    // ── Client-side filters ──

    _applyClientFilters(items, filters) {
        let result = items;
        const teamIds = filters.teamIds || [];
        const projectIds = filters.projectIds || [];
        const envKeys = filters.envKeys || [];
        if (teamIds.length > 0) {
            const set = new Set(teamIds);
            result = result.filter((it) => it.task.teamId && set.has(it.task.teamId));
        }
        if (projectIds.length > 0) {
            const set = new Set(projectIds);
            result = result.filter((it) => it.task.projectId && set.has(it.task.projectId));
        }
        if (envKeys.length > 0) {
            const set = new Set(envKeys);
            result = result.filter((it) => it.task.envKey && set.has(it.task.envKey));
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
                            <div style="${label} margin-top: 4px; line-height: 1.45;">Task Creation lists tasks authored by the worker. QA lists reviews they performed. After/Before filter the API query; prompt, team, project, and environment apply instantly after load.</div>
                        </div>
                        <button type="button" id="wf-dash-refresh" style="${this._btnStyle()} flex-shrink: 0;" title="Refresh teams, projects, and environment lists">Refresh catalogs</button>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 16px; padding: 10px 14px; border-bottom: 1px solid var(--border, #e2e8f0);">
                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--foreground, #0f172a); cursor: pointer;">
                            <input type="checkbox" id="wf-dash-include-tasks" checked> Task Creation
                        </label>
                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--foreground, #0f172a); cursor: pointer;">
                            <input type="checkbox" id="wf-dash-include-qa" checked> QA
                        </label>
                    </div>
                    <div style="padding: 14px; display: flex; flex-direction: column; gap: 14px;">
                        <div id="wf-dash-bootstrap-error" style="display: none; font-size: 12px; color: var(--destructive, #dc2626);"></div>

                        <div>
                            <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Authors</label>
                            <div id="wf-dash-author-box" style="${input} display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 36px; cursor: text;">
                                <input type="text" id="wf-dash-author-input" autocomplete="off" placeholder="Name, email, or UUID — Enter to resolve" style="flex: 1; min-width: 160px; border: none; outline: none; background: transparent; font-size: 12px; color: var(--foreground, #0f172a); padding: 2px 0;">
                            </div>
                            <div id="wf-dash-author-error" style="display: none; font-size: 11px; color: var(--destructive, #dc2626); margin-top: 4px;"></div>
                            <div id="wf-dash-author-candidates" style="display: none; margin-top: 6px; ${box}"></div>
                            <div style="${label} margin-top: 4px;">Empty = all workers. Authors, time range, output types, and Search reload the cache.</div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div>
                                <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">After</label>
                                <input type="datetime-local" id="wf-dash-after" style="${input}">
                            </div>
                            <div>
                                <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Before</label>
                                <input type="datetime-local" id="wf-dash-before" style="${input}">
                            </div>
                        </div>
                        <div id="wf-dash-range-error" style="display: none; font-size: 11px; color: var(--destructive, #dc2626);"></div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                            ${this._multiSelectHtml('teams', 'Teams', 'All teams')}
                            ${this._multiSelectHtml('projects', 'Projects', 'All projects')}
                            ${this._multiSelectHtml('envs', 'Environments', 'All environments')}
                        </div>

                        <div>
                            <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Prompt text (optional)</label>
                            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px;">
                                <input type="text" id="wf-dash-prompt" placeholder="Filter results by prompt substring" style="${input} flex: 1; min-width: 200px;">
                                <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--foreground, #0f172a); cursor: pointer;">
                                    <input type="checkbox" id="wf-dash-case"> Case sensitive
                                </label>
                                <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--foreground, #0f172a); cursor: pointer;">
                                    <input type="checkbox" id="wf-dash-fuzzy"> Fuzzy
                                </label>
                            </div>
                            <div style="${label} margin-top: 4px;">Applied instantly to loaded results; clearing shows the full cache.</div>
                        </div>

                        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px;">
                            <button type="button" id="wf-dash-search" style="${this._btnPrimaryStyle()}">Search</button>
                            <button type="button" id="wf-dash-clear" style="${this._btnStyle()}">Clear</button>
                        </div>

                        <div id="wf-dash-dirty" style="display: none; font-size: 12px; color: var(--destructive, #b45309);">Search parameters changed since last load — press Search to reload.</div>
                        <div id="wf-dash-error" style="display: none; font-size: 12px; color: var(--destructive, #dc2626);"></div>
                        <div id="wf-dash-status" style="font-size: 12px; color: var(--muted-foreground, #64748b);"></div>
                    </div>
                </div>
                <div id="wf-dash-results" style="display: flex; flex-direction: column; gap: 8px;"></div>
            </section>
        `;
    },

    _multiSelectHtml(key, label, emptyHint) {
        return `
            <div style="${this._panelBoxStyle()}">
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid var(--border, #e2e8f0);">
                    <span style="font-size: 11px; font-weight: 600; color: var(--foreground, #0f172a);">${dashEscHtml(label)}</span>
                    <span id="wf-dash-${key}-count" style="display: none; font-size: 10px; font-weight: 600; color: var(--brand, var(--primary, #2563eb));"></span>
                </div>
                <div id="wf-dash-${key}-list" data-wf-dash-empty="${dashEscHtml(emptyHint)}" style="max-height: 150px; overflow-y: auto; padding: 4px;">
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
                this._updateDirty();
            });
        }

        // Inputs affecting "dirty" (reload-required) state
        ['#wf-dash-after', '#wf-dash-before'].forEach((sel) => {
            const el = this._q(sel);
            if (el) el.addEventListener('change', () => { this._validateRangeUi(); this._updateDirty(); });
        });
        ['#wf-dash-include-tasks', '#wf-dash-include-qa'].forEach((sel) => {
            const el = this._q(sel);
            if (el) el.addEventListener('change', () => this._updateDirty());
        });

        // Client-side filter inputs (apply instantly after a search has loaded)
        const prompt = this._q('#wf-dash-prompt');
        if (prompt) prompt.addEventListener('input', () => this._applyFiltersAndRender());
        ['#wf-dash-case', '#wf-dash-fuzzy'].forEach((sel) => {
            const el = this._q(sel);
            if (el) el.addEventListener('change', () => this._applyFiltersAndRender());
        });
        if (prompt) {
            prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void this._submitSearch(); } });
        }

        const search = this._q('#wf-dash-search');
        if (search) search.addEventListener('click', () => { void this._submitSearch(); });
        const clear = this._q('#wf-dash-clear');
        if (clear) clear.addEventListener('click', () => this._clearSearch());

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
                this._removeAuthorToken(removeTok.getAttribute('data-wf-dash-remove-token'));
            }
        });
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
        if (this._state.draftTokens.some((t) => t.id === person.id)) return;
        this._state.draftTokens.push(person);
        this._hideAuthorCandidates();
        this._setAuthorError('');
        this._renderAuthorTokens();
        this._updateDirty();
        Logger.log('dashboard: author token added (' + (person.full_name || person.id) + ')');
    },

    _removeAuthorToken(id) {
        this._state.draftTokens = this._state.draftTokens.filter((t) => t.id !== id);
        this._renderAuthorTokens();
        this._updateDirty();
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
        this._renderTeamsList();
        this._renderProjectsList();
        this._renderEnvsList();
    },

    _selectedFromList(key) {
        const list = this._q('#wf-dash-' + key + '-list');
        if (!list) return [];
        return [...list.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.value);
    },

    _multiSelectItemsHtml(key, items, emptyHint, loading) {
        if (loading) return `<p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">Loading…</p>`;
        if (items.length === 0) return `<p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">${dashEscHtml(emptyHint)}</p>`;
        return items.map((it) => `
            <label style="display: flex; align-items: center; gap: 8px; padding: 4px 8px; font-size: 11px; border-radius: 4px; cursor: pointer; color: var(--foreground, #0f172a);">
                <input type="checkbox" value="${dashEscHtml(it.id)}" data-wf-dash-ms="${key}">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${dashEscHtml(it.label)}</span>
            </label>`).join('');
    },

    _wireMsCheckboxes(key, onChange) {
        const list = this._q('#wf-dash-' + key + '-list');
        if (!list) return;
        list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', onChange);
        });
    },

    _updateMsCount(key) {
        const countEl = this._q('#wf-dash-' + key + '-count');
        if (!countEl) return;
        const n = this._selectedFromList(key).length;
        countEl.textContent = String(n);
        countEl.style.display = n > 0 ? 'inline' : 'none';
    },

    _renderTeamsList() {
        const list = this._q('#wf-dash-teams-list');
        if (!list) return;
        const prevSelected = new Set(this._selectedFromList('teams'));
        const items = this._getTeamCatalog().map(([id, label]) => ({ id, label }));
        list.innerHTML = this._multiSelectItemsHtml('teams', items, 'All teams', false);
        list.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (prevSelected.has(cb.value)) cb.checked = true; });
        this._wireMsCheckboxes('teams', () => {
            this._updateMsCount('teams');
            this._renderProjectsList();
            this._applyFiltersAndRender();
        });
        this._updateMsCount('teams');
    },

    _availableProjects() {
        const catalog = this._state.catalog;
        if (!catalog || !catalog.projects) return [];
        const selectedTeams = this._selectedFromList('teams');
        if (selectedTeams.length === 0) return catalog.projects;
        const filtered = catalog.projects.filter((p) => selectedTeams.includes(p.team_id));
        return filtered.length > 0 ? filtered : catalog.projects;
    },

    _renderProjectsList() {
        const list = this._q('#wf-dash-projects-list');
        if (!list) return;
        const prevSelected = new Set(this._selectedFromList('projects'));
        const loading = this._state.bootstrapStatus === 'loading';
        const items = this._availableProjects().map((p) => ({ id: p.id, label: p.name }));
        const hint = this._state.catalog ? 'All projects' : 'Bootstrapping…';
        list.innerHTML = this._multiSelectItemsHtml('projects', items, hint, loading);
        list.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (prevSelected.has(cb.value)) cb.checked = true; });
        this._wireMsCheckboxes('projects', () => { this._updateMsCount('projects'); this._applyFiltersAndRender(); });
        this._updateMsCount('projects');
    },

    _renderEnvsList() {
        const list = this._q('#wf-dash-envs-list');
        if (!list) return;
        const prevSelected = new Set(this._selectedFromList('envs'));
        const loading = this._state.bootstrapStatus === 'loading';
        const envs = (this._state.catalog && this._state.catalog.environments) || [];
        const items = envs.map((e) => ({ id: e.env_key, label: e.name || e.env_key }));
        const hint = this._state.catalog ? 'All environments' : 'Bootstrapping…';
        list.innerHTML = this._multiSelectItemsHtml('envs', items, hint, loading);
        list.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (prevSelected.has(cb.value)) cb.checked = true; });
        this._wireMsCheckboxes('envs', () => { this._updateMsCount('envs'); this._applyFiltersAndRender(); });
        this._updateMsCount('envs');
    },

    // ── Dirty / range validation ──

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
        if (searchBtn) searchBtn.disabled = (Boolean(after || before) && !check.valid) || this._state.loading;
        return check;
    },

    _updateDirty() {
        const el = this._q('#wf-dash-dirty');
        if (!el) return;
        const committed = this._state.committed;
        if (!this._state.hasSearched || !committed) { el.style.display = 'none'; return; }
        const includeTasks = (this._q('#wf-dash-include-tasks') || {}).checked;
        const includeQa = (this._q('#wf-dash-include-qa') || {}).checked;
        const after = (this._q('#wf-dash-after') || {}).value || '';
        const before = (this._q('#wf-dash-before') || {}).value || '';
        const authorIds = this._state.draftTokens.map((t) => t.id).sort();
        const authorsDirty = JSON.stringify(authorIds) !== JSON.stringify([...committed.authorIds].sort());
        const modesDirty = includeTasks !== committed.taskCreation || includeQa !== committed.qa;
        const rangeDirty = after !== committed.afterLocal || before !== committed.beforeLocal;
        el.style.display = (authorsDirty || modesDirty || rangeDirty) ? 'block' : 'none';
    },

    // ── Search submit / clear ──

    async _submitSearch() {
        const includeTasks = (this._q('#wf-dash-include-tasks') || {}).checked;
        const includeQa = (this._q('#wf-dash-include-qa') || {}).checked;
        if (!includeTasks && !includeQa) {
            this._setSearchError('Select at least one output type: Task Creation or QA.');
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
        this._state.committed = {
            authorIds,
            taskCreation: includeTasks,
            qa: includeQa,
            afterLocal: after,
            beforeLocal: before
        };
        this._state.hasSearched = true;
        this._state.loading = true;
        this._setSearchError('');
        this._updateDirty();
        this._setStatus('Loading…');
        this._setSearchButtonLoading(true);
        this._renderResults();

        try {
            const items = await this._fetchWorkerOutputSearch({
                authorIds,
                includeTaskCreation: includeTasks,
                includeQa,
                afterIso: rangeCheck.afterIso,
                beforeIso: rangeCheck.beforeIso
            });
            this._state.cachedItems = items;
            Logger.log('dashboard: search loaded ' + items.length + ' item(s) — '
                + (authorIds.length > 0 ? authorIds.length + ' author(s)' : 'all authors')
                + ' · ' + [includeTasks ? 'tasks' : null, includeQa ? 'QA' : null].filter(Boolean).join(' + '));
        } catch (err) {
            this._setSearchError(err.message);
            this._state.cachedItems = null;
            Logger.warn('dashboard: search failed', err);
        } finally {
            this._state.loading = false;
            this._setSearchButtonLoading(false);
            this._applyFiltersAndRender();
        }
    },

    _clearSearch() {
        this._state.draftTokens = [];
        this._state.cachedItems = null;
        this._state.filteredItems = null;
        this._state.hasSearched = false;
        this._state.committed = null;
        ['#wf-dash-after', '#wf-dash-before', '#wf-dash-prompt'].forEach((sel) => { const el = this._q(sel); if (el) el.value = ''; });
        ['#wf-dash-include-tasks', '#wf-dash-include-qa'].forEach((sel) => { const el = this._q(sel); if (el) el.checked = true; });
        ['#wf-dash-case', '#wf-dash-fuzzy'].forEach((sel) => { const el = this._q(sel); if (el) el.checked = false; });
        ['teams', 'projects', 'envs'].forEach((key) => {
            const list = this._q('#wf-dash-' + key + '-list');
            if (list) list.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
            this._updateMsCount(key);
        });
        this._renderProjectsList();
        this._renderAuthorTokens();
        this._hideAuthorCandidates();
        this._setAuthorError('');
        this._setSearchError('');
        this._validateRangeUi();
        this._updateDirty();
        this._setStatus('Choose authors, optional time range, and output types, then press Search. Other filters apply instantly after load.');
        this._renderResults();
        Logger.log('dashboard: search cleared');
    },

    _currentClientFilters() {
        return {
            promptText: (this._q('#wf-dash-prompt') || {}).value || '',
            fuzzy: Boolean((this._q('#wf-dash-fuzzy') || {}).checked),
            caseSensitive: Boolean((this._q('#wf-dash-case') || {}).checked),
            teamIds: this._selectedFromList('teams'),
            projectIds: this._selectedFromList('projects'),
            envKeys: this._selectedFromList('envs')
        };
    },

    _applyFiltersAndRender() {
        if (this._state.cachedItems === null) {
            this._state.filteredItems = null;
        } else {
            this._state.filteredItems = this._applyClientFilters(this._state.cachedItems, this._currentClientFilters());
        }
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
        if (text && text.startsWith('Select at least')) this._setStatus('');
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
            this._setStatus('Choose authors, optional time range, and output types, then press Search. Other filters apply instantly after load.');
            return;
        }
        if (s.loading) { this._setStatus('Loading…'); return; }
        if (s.searchError) { this._setStatus(''); return; }
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
            const hasFilters = f.teamIds.length > 0 || f.projectIds.length > 0 || f.envKeys.length > 0
                || !dashIsQueryEmpty(f.promptText, f.caseSensitive);
            this._setStatus(countLabel + ' — ' + authorLabel + ' · ' + modeParts.join(' + ') + (hasFilters ? ' · client filters active' : ''));
        }
    },

    // ── Results rendering ──

    _renderResults() {
        const wrap = this._q('#wf-dash-results');
        if (!wrap) return;
        const s = this._state;
        if (!s.hasSearched || s.loading || (s.searchError && s.searchError.startsWith('Select at least')) || s.filteredItems === null) {
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
        const border = positive ? 'color-mix(in srgb, #16a34a 35%, transparent)' : 'color-mix(in srgb, #d97706 40%, transparent)';
        const bg = positive ? 'color-mix(in srgb, #16a34a 8%, transparent)' : 'color-mix(in srgb, #d97706 8%, transparent)';
        const badges = qa.rejectionBadges.length > 0
            ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Issues')}${qa.rejectionBadges.map((l) => `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: #b45309; background: color-mix(in srgb, #d97706 14%, transparent);">${dashEscHtml(l)}</span>`).join('')}</div>`
            : '';
        const blocks = qa.textBlocks.map((b) => `
            <div>
                <div style="display: flex; align-items: center; gap: 6px;">${this._labelSpan(b.label)}${this._copyIconHtml(b.text)}</div>
                <p style="margin: 4px 0 0 0; white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${dashEscHtml(b.text)}</p>
            </div>`).join('');
        return `
            <div style="margin-top: 12px; padding: 10px 12px; border: 1px solid ${border}; border-radius: 8px; background: ${bg}; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
                    <span style="font-weight: 600; color: var(--foreground, #0f172a);">QA Feedback</span>
                    ${qa.feedbackAt ? `<span style="color: var(--muted-foreground, #64748b);">${dashEscHtml(dashFormatCreatedAt(qa.feedbackAt))}</span>` : ''}
                </div>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                    ${this._labelSpan('Author')}${this._copyChipHtml(qa.qaReviewerName)}${this._copyChipHtml(qa.qaReviewerEmail)}${this._extLinkHtml(dashFleetExpertUrl(qa.qaReviewerId), 'Open author in Fleet')}
                </div>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 16px;">
                    <div style="display: flex; align-items: center; gap: 6px;">${this._labelSpan('Prompt Rating')}<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: var(--muted-foreground, #64748b); background: color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent);">${dashEscHtml(qa.qualityRating)}</span></div>
                    ${badges}
                </div>
                ${blocks}
            </div>`;
    },

    _taskCardHtml(item) {
        const task = item.task;
        const qa = item.qaFeedback;
        const kindLabel = DASH_KIND_LABELS[item.kind] || '';
        const promptLabel = qa ? `Prompt Version ${qa.versionNo} of ${qa.totalVersions}` : 'Prompt';
        return `
            <article style="border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--card, #ffffff); overflow: hidden;">
                <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 14px 6px;">
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0;">
                        ${this._labelSpan('Task')}${this._copyChipHtml(task.id)}${this._extLinkHtml(dashFleetTaskUrl(task.id), 'Open task in Fleet')}
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        ${kindLabel ? `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: var(--muted-foreground, #64748b); background: color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent);">${dashEscHtml(kindLabel)}</span>` : ''}
                        ${this._statusBadgeHtml(task.status)}
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 14px 14px; font-size: 12px;">
                    <div style="grid-column: span 2; display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                        ${this._labelSpan('Author')}${this._copyChipHtml(task.author.name)}${this._copyChipHtml(task.author.email)}${this._extLinkHtml(dashFleetExpertUrl(task.author.id), 'Open author in Fleet')}
                    </div>
                    <div style="grid-column: span 2;">
                        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan(promptLabel)}${this._copyIconHtml(task.prompt)}</div>
                        <p style="margin: 4px 0 0 0; white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${dashEscHtml(task.prompt || '—')}</p>
                        ${qa ? this._qaBlockHtml(qa) : ''}
                    </div>
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Environment')}${this._copyChipHtml(task.environment)}</div>
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Project')}${this._copyChipHtml(task.project)}${task.projectId ? this._extLinkHtml(dashFleetProjectUrl(task.projectId), 'Open project in Fleet') : ''}</div>
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Team')}${this._copyChipHtml(task.team)}</div>
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Created')}${this._copyChipHtml(dashFormatCreatedAt(task.createdAt))}</div>
                </div>
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
