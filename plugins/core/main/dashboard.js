// ============= dashboard.js =============
// Worker Output Search dashboard, opened as a popup from the Ops tab
// ("Open Dashboard" button under Team Member Search).
//
// This is the live port of the local prototype in local/dashboard. All data is
// gathered from documented Fleet PostgREST endpoints via Context.opsTab.postgrestGet,
// which reuses the exact same Supabase runtime config + session token gathering as the
// people lookup tool (cookies / sb-*-auth-token JWT). No secrets are hardcoded here.
//
// Porting notes / oddities live in local/dashboard/reference/dashboard-live-port-handoff.md.

const DASH_BOOTSTRAP_STORAGE_KEY = 'fleet-ux:dashboard-bootstrap';
const DASH_BOOTSTRAP_VERSION = 1;
const DASH_FLEET_ORIGIN = 'https://www.fleetai.com';
const DASH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DASH_TASKS_PAGE_SIZE = 100;
const DASH_QA_PAGE_SIZE = 50;

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
        tabBg: '#ea580c',
        toggleActive: 'border: 2px solid #ea580c; color: #c2410c; background: transparent;',
        textHighlight: 'font-weight: 600; color: #c2410c;'
    }
};

const DASH_TOGGLE_INACTIVE = 'border: 2px solid var(--border, #e2e8f0); color: var(--muted-foreground, #64748b); background: transparent; opacity: 0.6;';

const DASH_FILTER_SCOPES = [
    { scopeKey: 'filter-teams', optionsKey: 'teams', draftKey: 'teamIds' },
    { scopeKey: 'filter-projects', optionsKey: 'projects', draftKey: 'projectIds' },
    { scopeKey: 'filter-envs', optionsKey: 'envs', draftKey: 'envKeys' },
    { scopeKey: 'filter-statuses', optionsKey: 'statuses', draftKey: 'statuses' },
    { scopeKey: 'filter-contributors', optionsKey: 'contributors', draftKey: 'contributorIds' },
    { scopeKey: 'filter-prompt-ratings', optionsKey: 'promptRatings', draftKey: 'promptRatings' },
    { scopeKey: 'filter-task-issues', optionsKey: 'taskIssues', draftKey: 'taskIssues' },
    { scopeKey: 'filter-return-types', optionsKey: 'returnTypes', draftKey: 'returnTypes' }
];

function dashLib() {
    return Context.dashboardLib;
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
    description: 'Worker Output Search dashboard popup (task creations + QA reviews) opened from the Ops tab; all data via documented Fleet PostgREST endpoints',
    _version: '3.5',
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
            activeTab: 'search-output',
            leftTab: 'search',
            cachedItems: null,
            filteredItems: null,
            hasSearched: false,
            loading: false,
            searchError: null,
            committed: null,
            appliedFilters: null,
            filterListOptions: null,
            cardUi: {},
            includeTasks: true,
            includeQa: true,
            includeDisputes: false
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
            limit: 50
        });
        const mapped = rows.map((p) => ({ id: p.id, full_name: p.full_name, email: p.email }));
        return this._filterAndRankPersons(mapped, q);
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

        const tasks = allRows.map((row) => this._rowToTask(row, profilesMap, null, targetToProjectId));
        if (tasks.length === 0) return [];

        const taskIds = tasks.map((t) => t.id);
        const enrichment = await Context.dashboardData.enrichTasksWithHistory(taskIds, profilesMap);
        for (const task of tasks) {
            const hist = enrichment.get(task.id);
            task.promptVersions = (hist && hist.promptVersions) || [];
            task.allFeedback = (hist && hist.allFeedback) || [];
        }
        Logger.debug('dashboard: tasks enriched with version + feedback history (' + taskIds.length + ' task(s))');
        return tasks;
    },

    _taskCreationItemsFromTasks(tasks) {
        return tasks.map((task) => ({
            id: 'task-' + task.id,
            kind: 'task_creation',
            sortAt: task.createdAt,
            task,
            selectedFeedbackId: null,
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

        Logger.debug('dashboard: QA — enriching ' + taskIds.length + ' task(s) with version + feedback history');
        const enrichment = await Context.dashboardData.enrichTasksWithHistory(taskIds, profilesMap);
        const enrichedTasksById = new Map();
        for (const taskId of taskIds) {
            const taskRow = taskById.get(taskId);
            if (!taskRow) continue;
            const task = this._rowToTask(taskRow, profilesMap, null, targetToProjectId);
            const hist = enrichment.get(taskId);
            task.promptVersions = (hist && hist.promptVersions) || [];
            task.allFeedback = (hist && hist.allFeedback) || [];
            enrichedTasksById.set(taskId, task);
        }

        const items = [];
        for (const feedback of allFeedback) {
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
                    name: (qaReviewerProfile && qaReviewerProfile.full_name) || '',
                    email: (qaReviewerProfile && qaReviewerProfile.email) || ''
                });
            }
            items.push({
                id: 'qa-' + feedback.id,
                kind: 'qa',
                sortAt: feedback.created_at,
                task,
                selectedFeedbackId: feedback.id,
                qaFeedback
            });
        }
        items.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));
        const positiveCount = items.filter((it) => it.qaFeedback && it.qaFeedback.isPositive).length;
        const negativeCount = items.length - positiveCount;
        Logger.log('dashboard: QA items built — ' + items.length + ' total (' + positiveCount + ' accepted, ' + negativeCount + ' returned)');
        return items;
    },

    async _fetchWorkerOutputSearch({ authorIds, includeTaskCreation, includeQa, includeDisputes, afterIso, beforeIso, scope }) {
        const fetches = [];
        if (includeTaskCreation) {
            fetches.push(this._fetchTasksForSearch(authorIds, afterIso, beforeIso, scope).then((t) => this._taskCreationItemsFromTasks(t)));
        }
        if (includeQa) {
            fetches.push(this._fetchQaFeedbackForSearch(authorIds, afterIso, beforeIso, scope));
        }
        if (includeDisputes) {
            Logger.debug('dashboard: disputes fetch not yet implemented (stub)');
        }
        const parts = await Promise.all(fetches);
        return parts.flat();
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
            returnTypes: (opts.returnTypes || []).map((r) => r.id)
        };
    },

    _resetFilterDraftsFromResults(items) {
        const lib = dashLib();
        const options = lib.buildFilterListOptions(items, this._state.catalog, this._getTeamCatalog());
        this._state.filterListOptions = options;
        this._renderFilterLists();
        for (const { scopeKey, optionsKey } of DASH_FILTER_SCOPES) {
            const ids = (options[optionsKey] || []).map((o) => o.id);
            const list = this._q('#wf-dash-' + scopeKey + '-list');
            if (!list) continue;
            list.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = true; });
            this._updateMsCount(scopeKey);
        }
        return this._listBoundsFromOptions(options);
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
            'width: 95vw', 'height: 95vh', 'max-width: 95vw', 'max-height: 95vh',
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
        this._syncLeftTabUi();
        this._refreshCatalogDependentUi();
        this._updateResultsStatus();
        this._updateSubstringErrorUi();
        this._validateRangeUi();
        Logger.log('dashboard: popup built');
    },

    _modalHtml() {
        const tabs = [
            { id: 'overview', label: 'Overview' },
            { id: 'search-output', label: 'Search Output' }
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
            <div id="wf-dash-body" style="flex: 1; min-height: 0; overflow: hidden; padding: 16px 18px; display: flex; flex-direction: column;">
                <div data-wf-dash-panel="overview" style="display: none; font-size: 12px; color: var(--muted-foreground, #64748b);">Overview content coming soon.</div>
                <div data-wf-dash-panel="search-output" style="flex: 1; min-height: 0; display: flex; flex-direction: column;">${this._searchPanelHtml()}</div>
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
    _btnPrimaryDisabledStyle() {
        return 'padding: 7px 16px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: not-allowed; border: 1px solid var(--border, #e2e8f0); background: var(--muted, #f1f5f9); color: var(--muted-foreground, #94a3b8); opacity: 0.85;';
    },

    _btnToggleStyle(active, colorKind) {
        const base = 'padding: 7px 14px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer;';
        if (active) {
            const cfg = DASH_OUTPUT_KIND_CONFIG[colorKind];
            return base + ' ' + (cfg ? cfg.toggleActive : DASH_TOGGLE_INACTIVE);
        }
        return base + ' ' + DASH_TOGGLE_INACTIVE;
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
        const input = this._inputStyle();
        const leftTab = this._state ? this._state.leftTab : 'search';
        return `
            <section style="display: flex; flex: 1; min-height: 0; gap: 16px; overflow: hidden;">
                <aside style="width: min(320px, 34%); flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
                    <div style="${box} display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                        <nav style="display: flex; gap: 0; padding: 0 8px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;" aria-label="Search and filters">
                            <button type="button" data-wf-dash-left-tab="search" style="${this._leftTabStyle(leftTab === 'search')}">Search</button>
                            <button type="button" data-wf-dash-left-tab="filters" style="${this._leftTabStyle(leftTab === 'filters')}">Filters</button>
                        </nav>

                        <div id="wf-dash-left-panel-search" style="display: ${leftTab === 'search' ? 'flex' : 'none'}; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                            <div style="flex: 1; min-height: 0; overflow-y: auto;">
                                <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--border, #e2e8f0);">
                                    <p style="${label} line-height: 1.45; margin: 0;">Edit parameters anytime; press Search to fetch.</p>
                                    <button type="button" id="wf-dash-refresh" style="${this._btnStyle()} flex-shrink: 0;" title="Refresh teams, projects, and environment lists">Refresh catalogs</button>
                                </div>
                                <div id="wf-dash-search-fields" style="padding: 14px; display: flex; flex-direction: column; gap: 14px;">
                                    <div id="wf-dash-bootstrap-error" style="display: none; font-size: 12px; color: var(--destructive, #dc2626);"></div>
                                    <div>
                                        <div style="${label} margin-bottom: 6px; font-weight: 600;">Output types</div>
                                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                            <button type="button" id="wf-dash-toggle-tasks" aria-pressed="true" style="${this._btnToggleStyle(true, 'task_creation')}">Task Creation</button>
                                            <button type="button" id="wf-dash-toggle-qa" aria-pressed="true" style="${this._btnToggleStyle(true, 'qa')}">QA</button>
                                            <button type="button" id="wf-dash-toggle-disputes" aria-pressed="false" style="${this._btnToggleStyle(false, 'dispute')}">Disputes</button>
                                        </div>
                                    </div>
                                    <div>
                                        <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Authors</label>
                                        <div id="wf-dash-author-box" style="${input} display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 36px; cursor: text;">
                                            <input type="text" id="wf-dash-author-input" autocomplete="off" placeholder="Name, email, or UUID — Enter to resolve" style="flex: 1; min-width: 120px; border: none; outline: none; background: transparent; font-size: 12px; color: var(--foreground, #0f172a); padding: 2px 0;">
                                        </div>
                                        <div id="wf-dash-author-error" style="display: none; font-size: 11px; color: var(--destructive, #dc2626); margin-top: 4px;"></div>
                                        <div id="wf-dash-author-candidates" style="display: none; margin-top: 6px; ${box}"></div>
                                        <div style="${label} margin-top: 4px;">Empty = all workers.</div>
                                    </div>
                                    <div>
                                        <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Quick range</label>
                                        <select id="wf-dash-quick-range" style="${input} width: 100%; cursor: pointer;">
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
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; min-width: 0;">
                                        <div style="min-width: 0;">
                                            <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">After</label>
                                            <input type="date" id="wf-dash-after" style="${input} min-width: 0;">
                                        </div>
                                        <div style="min-width: 0;">
                                            <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Before</label>
                                            <input type="date" id="wf-dash-before" style="${input} min-width: 0;">
                                        </div>
                                    </div>
                                    <div id="wf-dash-range-error" style="display: none; font-size: 11px; color: var(--destructive, #dc2626);"></div>
                                    <div>
                                        <div style="${label} margin-bottom: 6px; font-weight: 600;">Teams, projects, environments</div>
                                        <div style="${label} margin-bottom: 8px;">None selected = all.</div>
                                        <div style="display: flex; flex-direction: column; gap: 12px;">
                                            ${this._multiSelectHtml('search-teams', 'Teams', 'All teams', false)}
                                            ${this._multiSelectHtml('search-projects', 'Projects', 'All projects', false)}
                                            ${this._multiSelectHtml('search-envs', 'Environments', 'All environments', false)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style="flex-shrink: 0; border-top: 1px solid var(--border, #e2e8f0); padding: 12px 14px; background: var(--card, #ffffff);">
                                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                                    <button type="button" id="wf-dash-clear-params" style="${this._btnStyle()}">Clear Parameters</button>
                                    <button type="button" id="wf-dash-search" style="${this._btnPrimaryStyle()}">Search</button>
                                </div>
                                <div id="wf-dash-universal-hint" style="display: none; font-size: 11px; color: var(--muted-foreground, #64748b); margin-top: 8px;"></div>
                                <div id="wf-dash-search-error" style="display: none; font-size: 12px; color: var(--destructive, #dc2626); margin-top: 8px;"></div>
                            </div>
                        </div>

                        <div id="wf-dash-left-panel-filters" style="display: ${leftTab === 'filters' ? 'flex' : 'none'}; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                            <div style="flex: 1; min-height: 0; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 14px;">
                                <p style="${label} margin: 0;">Refine loaded results. Press Apply to update the results pane.</p>
                                <div>
                                    <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Substring</label>
                                    <input type="text" id="wf-dash-prompt" placeholder="Filter by prompt substring" style="${input}">
                                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 8px;">
                                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                            <input type="checkbox" id="wf-dash-case"> Case sensitive
                                        </label>
                                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                            <input type="checkbox" id="wf-dash-fuzzy"> Fuzzy
                                        </label>
                                    </div>
                                    <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; margin-top: 8px;">
                                        <input type="checkbox" id="wf-dash-hidden-versions"> Search hidden versions
                                    </label>
                                    <div id="wf-dash-substring-error" style="display: none; font-size: 11px; color: var(--destructive, #dc2626); margin-top: 4px;"></div>
                                </div>
                                <div>
                                    <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Sort</label>
                                    <select id="wf-dash-sort" style="${input} cursor: pointer;">
                                        <option value="desc">Created — newest first</option>
                                        <option value="asc">Created — oldest first</option>
                                    </select>
                                </div>
                                <div id="wf-dash-filter-lists-wrap">
                                    <div style="${label} margin-bottom: 8px; font-weight: 600;">Narrow results</div>
                                    <div style="${label} margin-bottom: 8px;">Uncheck to hide; all checked shows everything from the search.</div>
                                    <div id="wf-dash-filter-lists" style="display: flex; flex-direction: column; gap: 12px;">
                                        ${DASH_FILTER_SCOPES.map((s) => this._multiSelectHtml(s.scopeKey, this._filterScopeLabel(s.scopeKey), 'Run a search to enable', true)).join('')}
                                    </div>
                                </div>
                            </div>
                            <div style="flex-shrink: 0; border-top: 1px solid var(--border, #e2e8f0); padding: 12px 14px; background: var(--card, #ffffff); display: flex; justify-content: flex-end;">
                                <button type="button" id="wf-dash-apply-filters" style="${this._btnPrimaryStyle()}">Apply</button>
                            </div>
                        </div>
                    </div>
                </aside>

                <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; ${box}">
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;">
                        <div style="min-width: 0;">
                            <div style="font-size: 13px; font-weight: 600; color: var(--foreground, #0f172a);">Results</div>
                            <div id="wf-dash-results-status" style="${label} margin-top: 4px;">Set search parameters on the left, then press Search.</div>
                        </div>
                        <button type="button" id="wf-dash-clear-results" style="${this._btnStyle()} flex-shrink: 0; font-size: 11px;">Clear Results</button>
                    </div>
                    <div id="wf-dash-results" style="flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;"></div>
                </div>
            </section>
        `;
    },

    _filterScopeLabel(scopeKey) {
        const labels = {
            'filter-teams': 'Teams',
            'filter-projects': 'Projects',
            'filter-envs': 'Environments',
            'filter-statuses': 'Task status',
            'filter-contributors': 'Contributor',
            'filter-prompt-ratings': 'Prompt rating',
            'filter-task-issues': 'Task issues',
            'filter-return-types': 'Return types'
        };
        return labels[scopeKey] || scopeKey;
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
            prompt.addEventListener('input', () => this._updateSubstringErrorUi());
            prompt.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._applyFiltersAndRender();
                }
            });
        }
        const applyFilters = this._q('#wf-dash-apply-filters');
        if (applyFilters) applyFilters.addEventListener('click', () => this._applyFiltersAndRender());

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

        modal.addEventListener('change', (e) => {
            const cb = e.target;
            if (!cb || cb.type !== 'checkbox') return;
            const msKey = cb.getAttribute('data-wf-dash-ms');
            if (!msKey) return;
            this._updateMsCount(msKey);
            if (msKey === 'search-teams') this._renderSearchProjectsList();
            if (msKey.startsWith('search-')) this._validateRangeUi();
            if (msKey.startsWith('filter-') && this._state.cachedItems) {
                this._renderFilterLists();
            }
        });

        // Delegated copy, card UI, candidate selection handlers
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
                return;
            }
            const msAll = e.target.closest('[data-wf-dash-ms-all]');
            if (msAll && modal.contains(msAll)) {
                const key = msAll.getAttribute('data-wf-dash-ms-all');
                this._setMultiselectChecked(key, true);
                if (key.startsWith('filter-') && this._state.cachedItems) this._renderFilterLists();
                return;
            }
            const msNone = e.target.closest('[data-wf-dash-ms-none]');
            if (msNone && modal.contains(msNone)) {
                const key = msNone.getAttribute('data-wf-dash-ms-none');
                this._setMultiselectChecked(key, false);
                if (key.startsWith('filter-') && this._state.cachedItems) this._renderFilterLists();
                return;
            }
            const reviewerBadge = e.target.closest('[data-wf-dash-reviewer-badge]');
            if (reviewerBadge && modal.contains(reviewerBadge)) {
                const taskId = reviewerBadge.getAttribute('data-task-id');
                const displayNo = parseInt(reviewerBadge.getAttribute('data-display-no'), 10);
                const ui = this._getCardUi(taskId);
                ui.expanded = false;
                ui.selectedDisplayNo = displayNo;
                this._renderResults();
                return;
            }
            const showAllBtn = e.target.closest('[data-wf-dash-card-show-all]');
            if (showAllBtn && modal.contains(showAllBtn)) {
                const ui = this._getCardUi(showAllBtn.getAttribute('data-task-id'));
                ui.expanded = true;
                this._renderResults();
                return;
            }
            const collapseBtn = e.target.closest('[data-wf-dash-card-collapse]');
            if (collapseBtn && modal.contains(collapseBtn)) {
                const taskId = collapseBtn.getAttribute('data-task-id');
                const ui = this._getCardUi(taskId);
                ui.expanded = false;
                ui.selectedDisplayNo = null;
                this._renderResults();
                return;
            }
            const timelineToggle = e.target.closest('[data-wf-dash-timeline-order]');
            if (timelineToggle && modal.contains(timelineToggle)) {
                const ui = this._getCardUi(timelineToggle.getAttribute('data-task-id'));
                ui.timelineNewestFirst = !ui.timelineNewestFirst;
                this._renderResults();
            }
        });

        modal.addEventListener('change', (e) => {
            const sel = e.target;
            if (!sel || !sel.matches('[data-wf-dash-card-version-select]')) return;
            const taskId = sel.getAttribute('data-task-id');
            const displayNo = parseInt(sel.value, 10);
            const ui = this._getCardUi(taskId);
            ui.expanded = false;
            ui.selectedDisplayNo = displayNo;
            this._renderResults();
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
            const active = panel.getAttribute('data-wf-dash-panel') === tabId;
            if (tabId === 'search-output') {
                panel.style.display = active ? 'flex' : 'none';
            } else {
                panel.style.display = active ? '' : 'none';
            }
        });
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
            this._setAuthorError('Lookup failed: ' + err.message);
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

    _addAuthorToken(person) {
        if (this._state.draftTokens.some((t) => t.id === person.id)) return;
        this._state.draftTokens.push(person);
        this._hideAuthorCandidates();
        this._setAuthorError('');
        this._renderAuthorTokens();
        this._validateRangeUi();
        Logger.log('dashboard: author token added (' + (person.full_name || person.id) + ')');
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

    _multiSelectItemsHtml(scopeKey, items, emptyHint, loading, defaultChecked, irrelevantIds) {
        if (loading) return `<p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">Loading…</p>`;
        if (items.length === 0) return `<p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">${dashEscHtml(emptyHint)}</p>`;
        const irrelevant = irrelevantIds || null;
        return items.map((it) => {
            const dim = irrelevant && irrelevant.has(it.id);
            const spanStyle = dim
                ? 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted-foreground, #64748b); opacity: 0.5;'
                : 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            return `
            <label style="display: flex; align-items: center; gap: 8px; padding: 4px 8px; font-size: 11px; border-radius: 4px; cursor: pointer; color: var(--foreground, #0f172a);">
                <input type="checkbox" value="${dashEscHtml(it.id)}" data-wf-dash-ms="${dashEscHtml(scopeKey)}"${defaultChecked ? ' checked' : ''}>
                <span style="${spanStyle}">${dashEscHtml(it.label)}</span>
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
            statuses: [], contributors: [], promptRatings: [], taskIssues: [], returnTypes: []
        };
        for (const { scopeKey } of DASH_FILTER_SCOPES) {
            const list = this._q('#wf-dash-' + scopeKey + '-list');
            if (!list) continue;
            const hint = list.getAttribute('data-wf-dash-empty') || 'Run a search to enable';
            list.innerHTML = `<p style="padding: 6px 8px; font-size: 11px; color: var(--muted-foreground, #64748b);">${dashEscHtml(hint)}</p>`;
            this._updateMsCount(scopeKey);
        }
    },

    _renderFilterLists() {
        const items = this._state.cachedItems;
        const options = this._state.filterListOptions;
        if (!items || !options) {
            this._resetFilterLists();
            return;
        }
        const listBounds = this._listBoundsFromOptions(options);
        const draft = this._getFilterDraft();
        const lib = dashLib();
        const irrelevance = items.length > 0
            ? lib.computeFilterIrrelevance(items, draft, listBounds, options)
            : lib.emptyFilterIrrelevance();

        for (const { scopeKey, optionsKey, draftKey } of DASH_FILTER_SCOPES) {
            const list = this._q('#wf-dash-' + scopeKey + '-list');
            if (!list) continue;
            const prevSelected = new Set(this._selectedFromList(scopeKey));
            const optionItems = options[optionsKey] || [];
            const emptyHint = optionItems.length === 0 ? 'No ' + this._filterScopeLabel(scopeKey).toLowerCase() + ' in results' : 'Run a search to enable';
            const irrelevantSet = irrelevance[draftKey] || new Set();
            const hadSelection = prevSelected.size > 0;
            list.innerHTML = this._multiSelectItemsHtml(
                scopeKey,
                optionItems,
                emptyHint,
                false,
                !hadSelection && optionItems.length > 0,
                irrelevantSet
            );
            if (hadSelection) {
                list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                    cb.checked = prevSelected.has(cb.value);
                });
            }
            this._updateMsCount(scopeKey);
        }
        Logger.debug('dashboard: filter lists rendered');
    },

    _getCardUi(taskId) {
        if (!this._state.cardUi[taskId]) {
            this._state.cardUi[taskId] = {
                expanded: false,
                timelineNewestFirst: true,
                selectedDisplayNo: null
            };
        }
        return this._state.cardUi[taskId];
    },

    _setLeftTab(tab) {
        this._state.leftTab = tab;
        this._syncLeftTabUi();
    },

    _syncLeftTabUi() {
        const tab = this._state.leftTab;
        const searchPanel = this._q('#wf-dash-left-panel-search');
        const filtersPanel = this._q('#wf-dash-left-panel-filters');
        if (searchPanel) searchPanel.style.display = tab === 'search' ? 'flex' : 'none';
        if (filtersPanel) filtersPanel.style.display = tab === 'filters' ? 'flex' : 'none';
        this._modal.querySelectorAll('[data-wf-dash-left-tab]').forEach((btn) => {
            const active = btn.getAttribute('data-wf-dash-left-tab') === tab;
            btn.style.cssText = this._leftTabStyle(active);
        });
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
        const lib = dashLib();
        const isUniversal = lib.isUniversalSearchParams({
            authorCount: this._state.draftTokens.length,
            searchTeamIds: this._selectedFromList('search-teams'),
            searchProjectIds: this._selectedFromList('search-projects'),
            searchEnvKeys: this._selectedFromList('search-envs')
        });
        const universalCheck = lib.validateUniversalSearchRange(after, before);
        const blankBlocked = isUniversal && !universalCheck.allowed;
        const hintEl = this._q('#wf-dash-universal-hint');
        if (hintEl) {
            if (blankBlocked) {
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
                ? this._btnPrimaryDisabledStyle()
                : this._btnPrimaryStyle();
        }
        return { check, isUniversal, blankBlocked };
    },

    _updateSubstringErrorUi() {
        const promptText = (this._q('#wf-dash-prompt') || {}).value || '';
        const caseSensitive = Boolean((this._q('#wf-dash-case') || {}).checked);
        const tooShort = dashLib().isSubstringTooShort(promptText, caseSensitive);
        const el = this._q('#wf-dash-substring-error');
        if (el) {
            if (tooShort) {
                el.textContent = 'Substring must be at least ' + dashLib().MIN_SUBSTRING_LENGTH + ' characters.';
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        }
        const applyBtn = this._q('#wf-dash-apply-filters');
        if (applyBtn) applyBtn.disabled = !this._state.cachedItems || tooShort;
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
                this._setSearchError('Enable at least one output type: Task Creation, QA, or Disputes.');
                return;
            }
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
            }) && !lib.validateUniversalSearchRange(after, before).allowed) {
                this._setSearchError(lib.UNIVERSAL_SEARCH_RANGE_MESSAGE);
                return;
            }

            const authorIds = this._state.draftTokens.map((t) => t.id);
            const authorLabels = this._state.draftTokens.map((t) => t.full_name || t.email || t.id);
            const scope = await this._buildSearchApiScope();
            Logger.info('dashboard: search started — '
                + (authorIds.length > 0 ? authorIds.length + ' author(s)' : 'all authors')
                + ' · types: ' + [includeTasks ? 'tasks' : null, includeQa ? 'QA' : null, includeDisputes ? 'disputes' : null].filter(Boolean).join('+')
                + (after ? ' · after ' + after : '') + (before ? ' · before ' + before : ''));
            this._state.committed = {
                authorIds,
                authorCount: authorIds.length,
                authorLabels,
                includeTaskCreation: includeTasks,
                includeQa,
                includeDisputes,
                afterLocal: after,
                beforeLocal: before
            };
            this._state.hasSearched = true;
            this._state.loading = true;
            this._setSearchError('');
            this._setSearchButtonLoading(true);
            this._updateResultsStatus();
            this._renderResults();

            try {
                const items = await this._fetchWorkerOutputSearch({
                    authorIds,
                    includeTaskCreation: includeTasks,
                    includeQa,
                    includeDisputes,
                    afterIso: rangeCheck.afterIso,
                    beforeIso: rangeCheck.beforeIso,
                    scope
                });
                this._state.cachedItems = items;
                Logger.log('dashboard: search loaded ' + items.length + ' item(s)');
                const prompt = this._q('#wf-dash-prompt');
                if (prompt) prompt.value = '';
                const hidden = this._q('#wf-dash-hidden-versions');
                if (hidden) hidden.checked = false;
                const caseEl = this._q('#wf-dash-case');
                if (caseEl) caseEl.checked = false;
                const fuzzyEl = this._q('#wf-dash-fuzzy');
                if (fuzzyEl) fuzzyEl.checked = false;
                const sortEl = this._q('#wf-dash-sort');
                if (sortEl) sortEl.value = 'desc';
                const bounds = this._resetFilterDraftsFromResults(items);
                const initialFilters = this._currentClientFilters();
                const filtered = lib.applyFiltersAndSort(items, initialFilters, bounds, 'desc');
                this._state.filteredItems = filtered;
                this._state.appliedFilters = Object.assign({}, initialFilters, { sortOrder: 'desc' });
                this._setLeftTab('filters');
            } catch (err) {
                this._setSearchError(err.message || String(err));
                this._state.cachedItems = null;
                this._state.filteredItems = null;
                this._state.appliedFilters = null;
                Logger.warn('dashboard: search failed', err);
            } finally {
                this._state.loading = false;
                this._setSearchButtonLoading(false);
                this._updateResultsStatus();
                this._updateSubstringErrorUi();
                this._renderResults();
            }
        } catch (err) {
            this._setSearchError(err.message || String(err));
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
            const list = this._q('#wf-dash-' + key + '-list');
            if (list) list.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
            this._updateMsCount(key);
        });
        this._syncOutputToggleUi();
        this._renderSearchProjectsList();
        this._renderAuthorTokens();
        this._hideAuthorCandidates();
        this._setAuthorError('');
        this._setSearchError('');
        this._validateRangeUi();
        Logger.log('dashboard: search parameters cleared');
    },

    _clearResults() {
        this._state.cachedItems = null;
        this._state.filteredItems = null;
        this._state.appliedFilters = null;
        this._state.hasSearched = false;
        this._state.committed = null;
        this._state.cardUi = {};
        this._resetFilterLists();
        const prompt = this._q('#wf-dash-prompt');
        if (prompt) prompt.value = '';
        const hidden = this._q('#wf-dash-hidden-versions');
        if (hidden) hidden.checked = false;
        const sortEl = this._q('#wf-dash-sort');
        if (sortEl) sortEl.value = 'desc';
        ['#wf-dash-case', '#wf-dash-fuzzy'].forEach((sel) => { const el = this._q(sel); if (el) el.checked = false; });
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
            || !lib.isQueryEmpty(applied.promptText, applied.caseSensitive);
    },

    _applyFiltersAndRender() {
        const lib = dashLib();
        if (this._state.cachedItems === null) {
            this._state.filteredItems = null;
            this._updateResultsStatus();
            this._renderResults();
            return;
        }
        const filters = this._currentClientFilters();
        if (lib.isSubstringTooShort(filters.promptText, filters.caseSensitive)) {
            this._updateSubstringErrorUi();
            return;
        }
        const bounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        const sortOrder = filters.sortOrder;
        const before = this._state.cachedItems.length;
        const result = lib.applyFiltersAndSort(this._state.cachedItems, filters, bounds, sortOrder);
        this._state.filteredItems = result;
        this._state.appliedFilters = Object.assign({}, filters, { sortOrder });
        Logger.log('dashboard: filters applied — ' + result.length + ' / ' + before + ' items'
            + (sortOrder === 'asc' ? ' · sort asc' : ' · sort desc'));
        this._renderFilterLists();
        this._updateResultsStatus();
        this._renderResults();
    },

    // ── Status text ──

    _setSearchError(text) {
        this._state.searchError = text || null;
        const el = this._q('#wf-dash-search-error');
        if (el) { el.textContent = text ? 'Error: ' + text : ''; el.style.display = text ? 'block' : 'none'; }
        this._updateResultsStatus();
        this._renderResults();
    },

    _searchStatusDetail(committed) {
        if (!committed) return '';
        const parts = [];
        if (committed.authorLabels && committed.authorLabels.length > 0) {
            parts.push('authors: ' + committed.authorLabels.join(', '));
        } else {
            parts.push('all authors');
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

    _updateResultsStatus() {
        const el = this._q('#wf-dash-results-status');
        if (!el) return;
        const s = this._state;
        const label = this._labelStyle();

        if (s.loading) {
            const detail = this._searchStatusDetail(s.committed);
            el.innerHTML = detail
                ? `<span style="${label}">Searching… ${dashEscHtml(detail)}</span>`
                : '<span style="' + label + '">Searching…</span>';
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
                : (committed.authorCount > 0 ? committed.authorCount + ' author(s)' : 'all authors');
            const countLabel = s.filteredItems.length === s.cachedItems.length
                ? s.filteredItems.length + ' result(s)'
                : s.filteredItems.length + ' of ' + s.cachedItems.length + ' result(s)';
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
            el.innerHTML = `<span style="${label}">${dashEscHtml(countLabel)} — ${dashEscHtml(authorLabel)} · ${modeHtml}${dashEscHtml(filterNote)}</span>`;
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

        if (s.loading || (s.searchError && !s.cachedItems)) {
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

    /** "Prompt Version" copies task id; version suffix is display-only. */
    _promptVersionLabelHtml(taskId, versionNo, totalVersions) {
        const id = String(taskId || '').trim();
        const suffix = ` ${versionNo} of ${totalVersions}`;
        const labelStyle = this._labelStyle();
        const suffixSpan = `<span style="${labelStyle}">${dashEscHtml(suffix)}</span>`;
        if (!id) {
            return `<span style="display: inline-flex; align-items: baseline; flex-wrap: wrap;">${this._labelSpan('Prompt Version')}${suffixSpan}</span>`;
        }
        const title = 'Copy task ID: ' + id;
        const btnStyle = labelStyle + ' border: none; background: transparent; padding: 0; cursor: pointer; text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--muted-foreground, #64748b) 45%, transparent); text-underline-offset: 2px;';
        return `<span style="display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 0;">
            <button type="button" data-wf-dash-copy="${dashEscHtml(id)}" title="${dashEscHtml(title)}" aria-label="${dashEscHtml(title)}" style="${btnStyle}">Prompt Version</button>${suffixSpan}
        </span>`;
    },

    /** Label + value group: tight label→data gap; use in rows with larger gap between groups. */
    _fieldGroupHtml(label, valueHtml) {
        return `<div style="display: inline-flex; align-items: center; gap: 3px; flex-wrap: wrap;">${this._labelSpan(label)}${valueHtml}</div>`;
    },

    _plainTimestampHtml(iso) {
        const formatted = dashFormatCreatedAt(iso);
        const ago = dashRelativeAgo(iso);
        const agoHtml = ago
            ? `<span style="font-size: 11px; color: var(--muted-foreground, #64748b);">(${dashEscHtml(ago)})</span>`
            : '';
        return `<span style="color: var(--foreground, #0f172a);">${dashEscHtml(formatted)}</span>${agoHtml}`;
    },

    _dashHighlightedHtml(text, query, caseSensitive) {
        const segments = dashLib().buildHighlightSegments(text, query, { caseSensitive });
        return segments.map((seg) => (
            seg.match
                ? `<mark style="background: color-mix(in srgb, #facc15 45%, transparent); color: inherit; padding: 0 1px; border-radius: 2px;">${dashEscHtml(seg.text)}</mark>`
                : dashEscHtml(seg.text)
        )).join('');
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

    _qaBlockHtml(qa, highlightQuery, caseSensitive) {
        const positive = qa.isPositive;
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const border = positive ? 'color-mix(in srgb, #16a34a 35%, transparent)' : 'color-mix(in srgb, #dc2626 40%, transparent)';
        const bg = positive ? 'color-mix(in srgb, #16a34a 8%, transparent)' : 'color-mix(in srgb, #dc2626 8%, transparent)';
        const yellowBadge = 'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #92400e; background: color-mix(in srgb, #facc15 35%, transparent);';
        const statusLabel = positive
            ? `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #15803d; background: color-mix(in srgb, #16a34a 14%, transparent);">Accepted</span>`
            : (qa.isEscalated
                ? `<span style="${yellowBadge}">Escalated for Fleet Review</span>`
                : (qa.isFlaggedAsBugged
                    ? `<span style="${yellowBadge}">Flagged as Bugged</span>`
                    : `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #b91c1c; background: color-mix(in srgb, #dc2626 14%, transparent);">Returned for Revision</span>`));
        const badges = qa.rejectionBadges.length > 0
            ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Issues')}${qa.rejectionBadges.map((l) => `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: #b45309; background: color-mix(in srgb, #d97706 14%, transparent);">${dashEscHtml(l)}</span>`).join('')}</div>`
            : '';
        const blocks = qa.textBlocks.map((b) => {
            const blockLabel = dashQaTextBlockLabel(b.label, positive);
            const body = b.text
                ? this._dashHighlightedHtml(b.text, hq, cs)
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
        const promptRatingHtml = `<div style="display: inline-flex; align-items: center; gap: 6px;">${this._labelSpan('Prompt Rating')}<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: var(--muted-foreground, #64748b); background: color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent);">${dashEscHtml(qa.qualityRating)}</span></div>`;
        return `
            <div style="margin-top: 12px; padding: 10px 12px; border: 1px solid ${border}; border-radius: 8px; background: ${bg}; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 16px; min-width: 0;">
                        <span style="font-weight: 600; color: var(--foreground, #0f172a);">QA Feedback</span>
                        ${submittedHtml}
                        ${promptRatingHtml}
                    </div>
                    <div style="flex-shrink: 0; margin-left: auto;">${statusLabel}</div>
                </div>
                ${badges ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 16px;">${badges}</div>` : ''}
                ${blocks}
            </div>`;
    },

    _reviewerBadgeHtml(entry, active, taskId) {
        const name = entry.reviewer.name || entry.reviewer.email || 'Reviewer';
        let label = 'Returned';
        let cls = 'color: #b91c1c; background: color-mix(in srgb, #dc2626 14%, transparent);';
        if (entry.isPositive) {
            label = 'Accepted';
            cls = 'color: #15803d; background: color-mix(in srgb, #16a34a 14%, transparent);';
        } else if (entry.isEscalated || entry.isFlaggedAsBugged) {
            label = entry.isEscalated ? 'Escalated' : 'Bugged';
            cls = 'color: #92400e; background: color-mix(in srgb, #facc15 35%, transparent);';
        }
        const border = active ? 'border: 1px solid color-mix(in srgb, var(--foreground, #0f172a) 25%, transparent); background: var(--accent, #f1f5f9);' : 'border: 1px solid var(--border, #e2e8f0); background: transparent;';
        return `<button type="button" data-wf-dash-reviewer-badge="1" data-task-id="${dashEscHtml(taskId)}" data-display-no="${entry.linkedDisplayVersionNo}" title="Show version ${entry.linkedDisplayVersionNo}" style="display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 6px; font-size: 10px; cursor: pointer; ${border}">
            <span style="font-weight: 600; color: var(--foreground, #0f172a);">${dashEscHtml(name)}</span>
            <span style="display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 10px; ${cls}">${dashEscHtml(label)}</span>
        </button>`;
    },

    _versionSectionHtml(taskId, version, totalVersions, feedbackEntries, highlightQuery, caseSensitive, showVersionLabel, fallbackFeedback) {
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const promptBody = version.prompt
            ? this._dashHighlightedHtml(version.prompt, hq, cs)
            : '—';
        const promptLabel = showVersionLabel
            ? this._promptVersionLabelHtml(taskId, version.displayVersionNo, totalVersions)
            : this._labelSpan('Prompt');
        const submittedRow = showVersionLabel && version.createdAt
            ? `<div style="flex-shrink: 0;">${this._fieldGroupHtml('Submitted', this._plainTimestampHtml(version.createdAt))}</div>`
            : '';
        const feedbackHtml = feedbackEntries.map((entry) => this._qaBlockHtml(entry.display, hq, cs)).join('');
        const fallbackHtml = fallbackFeedback ? this._qaBlockHtml(fallbackFeedback, hq, cs) : '';
        return `
            <div>
                <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;">
                    <div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 3px; min-width: 0;">
                        ${promptLabel}${this._copyIconHtml(version.prompt)}
                    </div>
                    ${submittedRow}
                </div>
                <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${promptBody}</p>
                ${feedbackHtml}${fallbackHtml}
            </div>`;
    },

    _outputKindTabWrap(kind, cardHtml) {
        const cfg = DASH_OUTPUT_KIND_CONFIG[kind];
        if (!cfg) return cardHtml;
        return `
            <div style="position: relative;">
                <div style="position: absolute; left: 16px; top: 0; z-index: 0; width: 7.75rem; height: 6px; border-radius: 6px 6px 0 0; background: ${cfg.tabBg};" title="${dashEscHtml(cfg.label)}" aria-label="${dashEscHtml(cfg.label)}"></div>
                <div style="position: relative; z-index: 1; margin-top: 8px;">${cardHtml}</div>
            </div>`;
    },

    _taskCardHtml(item) {
        const task = item.task;
        const allFeedback = task.allFeedback || [];
        const highlightQuery = item.highlightQuery || '';
        const caseSensitive = Boolean(item.highlightCaseSensitive);
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
        for (const entry of allFeedback) {
            const list = feedbackByDisplayNo.get(entry.linkedDisplayVersionNo) || [];
            list.push(entry);
            feedbackByDisplayNo.set(entry.linkedDisplayVersionNo, list);
        }

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
            ? `<div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Reviewers')}${allFeedback.map((entry) => this._reviewerBadgeHtml(entry, !expanded && entry.linkedDisplayVersionNo === selectedDisplayNo, task.id)).join('')}</div>`
            : '';

        let row3Left;
        if (expanded) {
            row3Left = `<div style="display: inline-flex; align-items: center; gap: 8px;">${this._labelSpan('Timeline')}<button type="button" data-wf-dash-timeline-order="1" data-task-id="${dashEscHtml(task.id)}" style="${this._btnStyle()} padding: 2px 8px; font-size: 11px;">${ui.timelineNewestFirst ? 'Newest first' : 'Oldest first'}</button></div>`;
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
                    <button type="button" data-wf-dash-card-${expanded ? 'collapse' : 'show-all'}="1" data-task-id="${dashEscHtml(task.id)}" style="${this._btnStyle()} padding: 2px 8px; font-size: 11px;">${expanded ? 'Collapse' : 'Show All'}</button>
                    ${expanded ? '' : `<select data-wf-dash-card-version-select="1" data-task-id="${dashEscHtml(task.id)}" style="${this._inputStyle()} width: auto; padding: 2px 8px; font-size: 11px; cursor: pointer;" aria-label="Select prompt version">${versionOptions}</select>`}
                </div>`;
        }

        const versionSections = renderedVersions.map((version) => {
            const feedbackEntries = feedbackByDisplayNo.get(version.displayVersionNo) || [];
            const fallback = !hasTimeline && allFeedback.length === 0 ? item.qaFeedback : null;
            return this._versionSectionHtml(
                task.id, version, totalVersions, feedbackEntries,
                highlightQuery, caseSensitive, hasTimeline, fallback
            );
        }).join('');

        const cardHtml = `
            <article style="position: relative; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--card, #ffffff); overflow: hidden;">
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 10px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">
                    ${this._statusBadgeHtml(task.status)}
                    <div style="flex: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 16px; min-width: 0;">
                        ${this._fieldGroupHtml('Team', this._dataValueHtml(task.team))}
                        ${this._fieldGroupHtml('Project', this._dataValueHtml(task.project) + projectLink)}
                        ${this._fieldGroupHtml('Environment', this._dataValueHtml(task.environment))}
                    </div>
                    <div style="display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;">
                        ${this._fieldGroupHtml('Key', this._copyChipHtml(task.key))}
                        ${this._extLinkHtml(dashFleetTaskUrl(task.id), 'Open task in Fleet')}
                    </div>
                </div>
                <div style="display: flex; flex-wrap: wrap; align-items: start; gap: 8px 24px; padding: 8px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">
                    ${this._fieldGroupHtml('Author', this._personChipsHtml(task.author.name, task.author.email, task.author.id, 'Open author in Fleet'))}
                    ${reviewerBadges}
                </div>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 8px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">
                    ${row3Left}
                    ${versionControls}
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px; padding: 12px 14px; font-size: 12px;">
                    ${versionSections}
                </div>
            </article>`;

        return this._outputKindTabWrap(item.kind, cardHtml);
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
