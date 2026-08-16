// ============= work-history.js (library) =============
// Ungated session APIs for /work/create daily breakdowns (Task Creation, Feedback Given, Disputes).
// No Ops password / postgrestQuery. Registers Context.workHistory.

const FLEET_INTERNAL_API = 'https://api.internal.fleet-platform.fleetai.com/v1';
const QA_FEEDBACK_PATH = '/orchestrator-private/v1/work/stats/qa-feedback';
const DISPUTE_HISTORY_PATH = '/dispute-reviews/history';
const PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NETWORK_WATCHER_ID = 'fleet-ux-work-history-eval-tasks';

const WorkHistoryApi = {
    _cache: Object.create(null),
    _inflight: Object.create(null),
    _interceptedTeamIdParam: null,
    _interceptedEvalTasksBase: null,
    _networkSubscribed: false,

    getPageWindow() {
        return (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
    },

    getCookie(name) {
        try {
            const win = this.getPageWindow();
            const cookie = (win.document && win.document.cookie) || document.cookie || '';
            const match = cookie.match(
                new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
            );
            return match ? decodeURIComponent(match[1]) : '';
        } catch (_e) {
            return '';
        }
    },

    getUserId() {
        const id = String(this.getCookie('current-user-id') || '').trim();
        return UUID_RE.test(id) ? id : '';
    },

    getTeamId() {
        const id = String(this.getCookie('current-team-id') || '').trim();
        return UUID_RE.test(id) ? id : '';
    },

    getJwt() {
        const pageWindow = this.getPageWindow();
        if (Context.networkObserver && typeof Context.networkObserver.getFleetUserJwt === 'function') {
            return Context.networkObserver.getFleetUserJwt(pageWindow) || '';
        }
        return '';
    },

    getRuntimeAccess() {
        if (Context.networkObserver && typeof Context.networkObserver.getRuntimeAccess === 'function') {
            return Context.networkObserver.getRuntimeAccess() || {};
        }
        return {};
    },

    fleetOrigin() {
        try {
            const win = this.getPageWindow();
            const origin = win.location && win.location.origin;
            if (origin && /^https?:\/\//.test(origin)) return origin;
        } catch (_e) { /* ignore */ }
        return 'https://www.fleetai.com';
    },

    /** Local calendar day bounds as UTC ISO strings + YYYY-MM-DD key. */
    localDayBounds(daysAgo) {
        const n = Math.max(0, Number(daysAgo) || 0);
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - n);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        const y = start.getFullYear();
        const m = String(start.getMonth() + 1).padStart(2, '0');
        const d = String(start.getDate()).padStart(2, '0');
        return {
            daysAgo: n,
            startIso: start.toISOString(),
            endIso: end.toISOString(),
            startMs: start.getTime(),
            endMs: end.getTime(),
            dateKey: `${y}-${m}-${d}`,
            month: start.getMonth() + 1,
            day: start.getDate(),
            year: y
        };
    },

    _inDay(iso, bounds) {
        if (!iso || !bounds) return false;
        const t = Date.parse(iso);
        if (Number.isNaN(t)) return false;
        return t >= bounds.startMs && t <= bounds.endMs;
    },

    _beforeDay(iso, bounds) {
        if (!iso || !bounds) return false;
        const t = Date.parse(iso);
        if (Number.isNaN(t)) return false;
        return t < bounds.startMs;
    },

    ensureTeamIdIntercept() {
        if (this._networkSubscribed) return;
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            return;
        }
        const self = this;
        Context.networkObserver.subscribe({
            id: NETWORK_WATCHER_ID,
            matches(meta) {
                if (!meta || meta.method !== 'GET' || !meta.urlObj) return false;
                const host = meta.urlObj.hostname || '';
                const path = meta.urlObj.pathname || '';
                if (!host.endsWith('.supabase.co')) return false;
                // Confirmed Fleet Task Creation list path
                if (!/\/rest\/v1\/eval_tasks\/?$/.test(path)) return false;
                return !!meta.urlObj.searchParams.get('created_by');
            },
            onRequest(meta) {
                try {
                    const u = meta.urlObj;
                    if (!u) return;
                    const path = u.pathname || '';
                    // Prefer the live Fleet list path (confirmed: …/eval_tasks)
                    if (/\/rest\/v1\//.test(path)) {
                        self._interceptedEvalTasksBase = u.origin + path;
                    }
                    const teamParam = u.searchParams.get('team_id');
                    if (teamParam && /^in\./i.test(teamParam)) {
                        self._interceptedTeamIdParam = teamParam;
                        Logger.debug('captured team_id=in.(…) from Fleet Task Creation request');
                    }
                } catch (_e) { /* ignore */ }
            }
        });
        this._networkSubscribed = true;
        Logger.debug('subscribed for Task Creation PostgREST team list');
    },

    _evalTasksBaseUrl() {
        if (this._interceptedEvalTasksBase) return this._interceptedEvalTasksBase;
        const access = this.getRuntimeAccess();
        const rest = access.supabaseRestBaseUrl;
        if (!rest) return null;
        // Confirmed Fleet work/create Task Creation path (fallback when intercept not yet seen)
        return String(rest).replace(/\/$/, '') + '/eval_tasks';
    },

    _cacheKey(kind, dateKey) {
        return kind + ':' + dateKey;
    },

    /** Drop cached aggregates for one kind+day so the next fetch hits the network. */
    invalidateDay(kind, daysAgo) {
        const bounds = this.localDayBounds(daysAgo);
        const key = this._cacheKey(kind, bounds.dateKey);
        delete this._cache[key];
    },

    async _coalesce(key, fn, opts) {
        const force = !!(opts && opts.force);
        if (force) delete this._cache[key];
        if (!force && Object.prototype.hasOwnProperty.call(this._cache, key)) {
            return this._cache[key];
        }
        if (this._inflight[key]) {
            if (!force) return this._inflight[key];
            // Wait out the in-flight call, then refetch so force always gets a new result.
            try {
                await this._inflight[key];
            } catch (_e) { /* ignore prior failure */ }
            delete this._cache[key];
        }
        const p = Promise.resolve()
            .then(fn)
            .then((result) => {
                this._cache[key] = result;
                delete this._inflight[key];
                return result;
            })
            .catch((err) => {
                delete this._inflight[key];
                throw err;
            });
        this._inflight[key] = p;
        return p;
    },

    async _postgrestGet(url) {
        const access = this.getRuntimeAccess();
        const jwt = this.getJwt();
        const anon = access.supabaseAnonKey;
        if (!jwt || !anon) {
            throw new Error('Supabase session not yet captured');
        }
        const pageWindow = this.getPageWindow();
        const requestFetch = pageWindow.fetch || fetch;
        const res = await requestFetch.call(pageWindow, url, {
            method: 'GET',
            credentials: 'omit',
            headers: {
                accept: '*/*',
                'accept-profile': 'public',
                apikey: anon,
                authorization: 'Bearer ' + jwt,
                origin: this.fleetOrigin(),
                referer: this.fleetOrigin() + '/',
                'x-client-info': 'supabase-ssr/0.9.0 createBrowserClient'
            }
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error('PostgREST ' + res.status + (text ? ': ' + text.slice(0, 200) : ''));
        }
        return res.json();
    },

    async _fleetWebGet(pathWithQuery) {
        const origin = this.fleetOrigin();
        const url = origin + '/api' + pathWithQuery;
        const pageWindow = this.getPageWindow();
        const requestFetch = pageWindow.fetch || fetch;
        const res = await requestFetch.call(pageWindow, url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                accept: 'application/json, text/plain, */*',
                referer: origin + '/work/create?tab=task-qa'
            }
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error('Fleet web ' + res.status + (text ? ': ' + text.slice(0, 200) : ''));
        }
        return res.json();
    },

    async _fleetInternalGet(path, queryParams) {
        const jwt = this.getJwt();
        if (!jwt) throw new Error('Fleet session token not yet captured');
        const team = this.getTeamId();
        if (!team) throw new Error('Fleet team context not available');
        const url = new URL(FLEET_INTERNAL_API + path);
        Object.entries(queryParams || {}).forEach(([key, value]) => {
            if (value != null && value !== '') url.searchParams.set(key, String(value));
        });
        const pageWindow = this.getPageWindow();
        const requestFetch = pageWindow.fetch || fetch;
        const origin = this.fleetOrigin();
        const res = await requestFetch.call(pageWindow, url.toString(), {
            method: 'GET',
            credentials: 'omit',
            headers: {
                accept: '*/*',
                'content-type': 'application/json',
                'x-jwt-token': jwt,
                'x-team-id': team,
                origin,
                referer: origin + '/'
            }
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error('Fleet internal ' + res.status + (text ? ': ' + text.slice(0, 200) : ''));
        }
        return res.json();
    },

    async fetchTaskCreationDay(daysAgo, opts) {
        this.ensureTeamIdIntercept();
        const bounds = this.localDayBounds(daysAgo);
        const key = this._cacheKey('taskCreation', bounds.dateKey);
        return this._coalesce(key, async () => {
            const base = this._evalTasksBaseUrl();
            if (!base) throw new Error('Supabase REST base not yet captured');
            const userId = this.getUserId();
            if (!userId) throw new Error('current-user-id cookie missing');

            const envCount = Object.create(null);
            let count = 0;
            let offset = 0;
            let page = 0;
            const maxPages = 40;

            while (page < maxPages) {
                const params = new URLSearchParams();
                // Only fields used for day counts — no prompts / embeds / ids
                params.set('select', 'created_at,env_key');
                params.set('created_by', 'eq.' + userId);
                params.set('and', `(created_at.gte.${bounds.startIso},created_at.lte.${bounds.endIso})`);
                params.set('order', 'created_at.desc.nullslast');
                params.set('offset', String(offset));
                params.set('limit', String(PAGE_SIZE));
                if (this._interceptedTeamIdParam) {
                    params.set('team_id', this._interceptedTeamIdParam);
                }
                const url = base + '?' + params.toString();
                Logger.debug('Task Creation page fetch', { dateKey: bounds.dateKey, offset, page });
                const rows = await this._postgrestGet(url);
                if (!Array.isArray(rows) || rows.length === 0) break;
                const pageLen = rows.length;
                for (let i = 0; i < pageLen; i++) {
                    const row = rows[i];
                    count++;
                    const env = (row && row.env_key) ? String(row.env_key).trim() : '';
                    if (env) envCount[env] = (envCount[env] || 0) + 1;
                    // Drop row reference so the fat response can GC
                    rows[i] = null;
                }
                rows.length = 0;
                if (pageLen < PAGE_SIZE) break;
                offset += PAGE_SIZE;
                page++;
            }

            Logger.log('Task Creation day loaded', { dateKey: bounds.dateKey, count });
            // Aggregates only — never retain row payloads
            return { count, envCount, dateKey: bounds.dateKey };
        }, opts);
    },

    async fetchFeedbackGivenDay(daysAgo, opts) {
        const bounds = this.localDayBounds(daysAgo);
        const key = this._cacheKey('feedbackGiven', bounds.dateKey);
        return this._coalesce(key, async () => {
            const envCount = Object.create(null);
            const envApproved = Object.create(null);
            const envFeedbackRequested = Object.create(null);
            let count = 0;
            let approved = 0;
            let feedbackRequested = 0;
            let offset = 0;
            let page = 0;
            const maxPages = 80;
            let done = false;

            while (!done && page < maxPages) {
                const path = QA_FEEDBACK_PATH + '?limit=' + PAGE_SIZE + '&offset=' + offset;
                Logger.debug('Feedback Given page fetch', { dateKey: bounds.dateKey, offset, page });
                const payload = await this._fleetWebGet(path);
                const feedbacks = (payload && payload.feedbacks) || [];
                const hasMore = !!(payload && payload.has_more);
                const pageLen = Array.isArray(feedbacks) ? feedbacks.length : 0;

                if (pageLen === 0) break;

                for (let i = 0; i < pageLen; i++) {
                    const row = feedbacks[i];
                    // Pull only scalars used for stats, then drop the row (prompts / nested task data stay unused)
                    const isSystem = !!(row && row.is_system_feedback === true);
                    const created = row ? row.created_at : null;
                    const env = (row && row.eval_task_version && row.eval_task_version.env_key)
                        ? String(row.eval_task_version.env_key).trim()
                        : '';
                    const positive = !!(row && row.is_positive_feedback === true);
                    feedbacks[i] = null;
                    if (!row || isSystem) continue;
                    if (this._beforeDay(created, bounds)) {
                        done = true;
                        break;
                    }
                    if (!this._inDay(created, bounds)) continue;

                    count++;
                    if (positive) {
                        approved++;
                        if (env) {
                            envCount[env] = (envCount[env] || 0) + 1;
                            envApproved[env] = (envApproved[env] || 0) + 1;
                        }
                    } else {
                        feedbackRequested++;
                        if (env) {
                            envCount[env] = (envCount[env] || 0) + 1;
                            envFeedbackRequested[env] = (envFeedbackRequested[env] || 0) + 1;
                        }
                    }
                }
                feedbacks.length = 0;

                if (done || !hasMore || pageLen < PAGE_SIZE) break;
                offset += PAGE_SIZE;
                page++;
            }

            const totalAr = approved + feedbackRequested;
            const dayAr = totalAr > 0 ? Math.round((approved / totalAr) * 100) : null;

            Logger.log('Feedback Given day loaded', { dateKey: bounds.dateKey, count, dayAr });
            return {
                count,
                envCount,
                envApproved,
                envFeedbackRequested,
                dayAr,
                approved,
                feedbackRequested,
                dateKey: bounds.dateKey
            };
        }, opts);
    },

    async fetchDisputesReviewedDay(daysAgo, opts) {
        const bounds = this.localDayBounds(daysAgo);
        const key = this._cacheKey('disputesReviewed', bounds.dateKey);
        return this._coalesce(key, async () => {
            const userId = this.getUserId();
            if (!userId) throw new Error('current-user-id cookie missing');

            let count = 0;
            let approved = 0;
            let rejected = 0;
            let offset = 0;
            let page = 0;
            const maxPages = 80;
            let done = false;

            while (!done && page < maxPages) {
                Logger.debug('Disputes Reviewed page fetch', { dateKey: bounds.dateKey, offset, page });
                const payload = await this._fleetInternalGet(DISPUTE_HISTORY_PATH, {
                    user_id: userId,
                    limit: String(PAGE_SIZE),
                    offset: String(offset)
                });
                const disputes = (payload && payload.disputes) || [];
                const pageLen = Array.isArray(disputes) ? disputes.length : 0;
                if (pageLen === 0) break;

                for (let i = 0; i < pageLen; i++) {
                    const row = disputes[i];
                    const resolved = row ? row.resolved_at : null;
                    const status = row ? String(row.dispute_status || '').toLowerCase() : '';
                    disputes[i] = null;
                    if (!row) continue;
                    if (this._beforeDay(resolved, bounds)) {
                        done = true;
                        break;
                    }
                    if (!this._inDay(resolved, bounds)) continue;
                    count++;
                    if (status === 'approved') approved++;
                    else if (status === 'rejected') rejected++;
                }
                disputes.length = 0;

                if (done || pageLen < PAGE_SIZE) break;
                offset += PAGE_SIZE;
                page++;
            }

            Logger.log('Disputes Reviewed day loaded', { dateKey: bounds.dateKey, count, approved, rejected });
            return { count, approved, rejected, dateKey: bounds.dateKey };
        }, opts);
    },

    /** Clear caches (e.g. after midnight / manual refresh). */
    clearCache() {
        this._cache = Object.create(null);
        this._inflight = Object.create(null);
    }
};

const plugin = {
    id: 'workHistory',
    name: 'Work History',
    description: 'Session APIs for Task Creation, Feedback Given, and Disputes Reviewed daily breakdowns',
    _version: '1.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        WorkHistoryApi.ensureTeamIdIntercept();
        Context.workHistory = {
            fetchTaskCreationDay: (daysAgo, opts) => WorkHistoryApi.fetchTaskCreationDay(daysAgo, opts),
            fetchFeedbackGivenDay: (daysAgo, opts) => WorkHistoryApi.fetchFeedbackGivenDay(daysAgo, opts),
            fetchDisputesReviewedDay: (daysAgo, opts) => WorkHistoryApi.fetchDisputesReviewedDay(daysAgo, opts),
            localDayBounds: (daysAgo) => WorkHistoryApi.localDayBounds(daysAgo),
            invalidateDay: (kind, daysAgo) => WorkHistoryApi.invalidateDay(kind, daysAgo),
            clearCache: () => WorkHistoryApi.clearCache(),
            ensureTeamIdIntercept: () => WorkHistoryApi.ensureTeamIdIntercept()
        };
        if (!state.registered) {
            Logger.log('module registered (Context.workHistory)');
            state.registered = true;
        }
    }
};
