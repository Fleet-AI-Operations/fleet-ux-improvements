// dashboard-data.js — PostgREST enrichment for Worker Output Search.
// Loaded after dashboard-lib.js, before dashboard.js; registers Context.dashboardData.

const DASH_DATA_FEEDBACK_PAGE_SIZE = 200;

const plugin = {
    id: 'dashboard-data',
    name: 'Dashboard Data',
    description: 'Batch version + feedback enrichment for the Worker Output Search dashboard',
    _version: '1.6',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const self = this;
        Context.dashboardData = {
            enrichTasksWithHistory: (taskIds, profilesMap, options) => self._enrichTasksWithHistory(taskIds, profilesMap, options)
        };
        Logger.log('dashboard-data: module registered (Context.dashboardData)');
    },

    _pgInFilter(values) {
        const lib = Context.dashboardLib;
        if (!lib || typeof lib.pgInFilter !== 'function') {
            throw new Error('dashboard-data: dashboardLib pgInFilter unavailable');
        }
        return lib.pgInFilter(values);
    },

    _pgInChunks(values) {
        const lib = Context.dashboardLib;
        if (!lib || typeof lib.pgInChunks !== 'function') {
            throw new Error('dashboard-data: dashboardLib pgInChunks unavailable');
        }
        return lib.pgInChunks(values);
    },

    async _fetchProfilesByIds(profileIds) {
        const chunks = this._pgInChunks(profileIds);
        if (chunks.length === 0) return [];
        const all = [];
        for (const chunk of chunks) {
            const rows = await this._pgQuery('profiles.select_person', {
                id: this._pgInFilter(chunk)
            });
            all.push(...rows);
        }
        return all;
    },

    async _pgQuery(queryKey, overrides) {
        if (!Context.opsTab || typeof Context.opsTab.postgrestQuery !== 'function') {
            throw new Error('Ops dashboard PostgREST client unavailable. Unlock the Ops dashboard and try again.');
        }
        const rows = await Context.opsTab.postgrestQuery(queryKey, overrides || {});
        return Array.isArray(rows) ? rows : (rows ? [rows] : []);
    },

    _groupBy(rows, keyOf) {
        const map = new Map();
        for (const row of rows) {
            const key = keyOf(row);
            if (!key) continue;
            const bucket = map.get(key);
            if (bucket) bucket.push(row);
            else map.set(key, [row]);
        }
        return map;
    },

    _buildProfilesMap(profileRows) {
        const map = new Map();
        for (const p of profileRows) map.set(p.id, { full_name: p.full_name, email: p.email });
        return map;
    },

    _buildFeedbackEntry(feedback, rawVersions, reviewerProfiles) {
        const lib = Context.dashboardLib;
        const versionInfo = lib.resolveVersionAtFeedback(rawVersions, feedback.created_at);
        const isSystemFeedback = Boolean(feedback.is_system_feedback);
        let reviewer;
        if (isSystemFeedback) {
            reviewer = { id: '', name: 'System', email: '' };
        } else {
            const profile = reviewerProfiles.get(feedback.created_by) || null;
            reviewer = {
                id: String(feedback.created_by || ''),
                name: String((profile && profile.full_name) || ''),
                email: String((profile && profile.email) || '')
            };
        }
        const display = lib.buildQaFeedbackDisplay(feedback, versionInfo, reviewer);
        return {
            id: String(feedback.id || ''),
            feedbackAt: String(feedback.created_at || ''),
            isPositive: display.isPositive,
            isEscalated: display.isEscalated,
            isFlaggedAsBugged: display.isFlaggedAsBugged,
            isSystemFeedback: Boolean(display.isSystemFeedback),
            reviewer,
            linkedVersionNo: versionInfo.rawVersionNo,
            linkedDisplayVersionNo: versionInfo.displayVersionNo,
            display
        };
    },

    async _fetchVersionsBatch(taskIds) {
        const versionRows = [];
        for (const chunk of this._pgInChunks(taskIds)) {
            const rows = await this._pgQuery('task_versions.select_history', {
                task_id: this._pgInFilter(chunk),
                order: 'version_no.asc',
                limit: String(Math.max(chunk.length * 20, 100))
            });
            versionRows.push(...rows);
        }
        return versionRows;
    },

    async _fetchFeedbackBatch(taskIds, prefetchedRows) {
        const prefetched = Array.isArray(prefetchedRows) ? prefetchedRows : [];
        const knownIds = [...new Set(prefetched.map((f) => f && f.id).filter(Boolean))];
        const feedbackRows = [...prefetched];
        const seenIds = new Set(knownIds);
        for (const chunk of this._pgInChunks(taskIds)) {
            let offset = 0;
            while (true) {
                const qs = {
                    eval_task_id: this._pgInFilter(chunk),
                    order: 'created_at.desc',
                    offset: String(offset),
                    limit: String(DASH_DATA_FEEDBACK_PAGE_SIZE)
                };
                const page = await this._pgQuery('qa_feedback.select_row', qs);
                let added = 0;
                for (const row of page) {
                    if (!row || !row.id || seenIds.has(row.id)) continue;
                    seenIds.add(row.id);
                    feedbackRows.push(row);
                    added++;
                }
                if (page.length < DASH_DATA_FEEDBACK_PAGE_SIZE) break;
                offset += DASH_DATA_FEEDBACK_PAGE_SIZE;
            }
        }
        if (prefetched.length > 0) {
            Logger.debug('dashboard-data: feedback batch — ' + prefetched.length + ' prefetched, '
                + (feedbackRows.length - prefetched.length) + ' supplemental');
        }
        return feedbackRows;
    },

    /**
     * @param {string[]} taskIds
     * @param {Map<string, {full_name: string, email: string}>} [profilesMap]
     * @param {{ prefetchedFeedbackRows?: object[], skipFeedbackFetch?: boolean }} [options]
     * @returns {Promise<Map<string, { promptVersions: object[], allFeedback: object[] }>>}
     */
    async _enrichTasksWithHistory(taskIds, profilesMap, options) {
        const lib = Context.dashboardLib;
        const opts = options || {};
        const ids = [...new Set((taskIds || []).filter(Boolean))];
        if (ids.length === 0) return new Map();

        Logger.debug('dashboard-data: enriching ' + ids.length + ' task(s) with version + feedback history');

        const prefetched = Array.isArray(opts.prefetchedFeedbackRows) ? opts.prefetchedFeedbackRows : [];
        const skipFeedbackFetch = Boolean(opts.skipFeedbackFetch);
        const feedbackPromise = skipFeedbackFetch
            ? Promise.resolve(prefetched)
            : this._fetchFeedbackBatch(ids, prefetched);

        const [versionRows, feedbackRows] = await Promise.all([
            this._fetchVersionsBatch(ids),
            feedbackPromise
        ]);

        const reviewerProfiles = new Map(profilesMap || []);
        const missingReviewerIds = [...new Set(
            feedbackRows
                .map((f) => f.created_by)
                .filter((id) => id && !reviewerProfiles.has(id))
        )];
        if (missingReviewerIds.length > 0) {
            const rows = await this._fetchProfilesByIds(missingReviewerIds);
            for (const [id, profile] of this._buildProfilesMap(rows)) {
                reviewerProfiles.set(id, profile);
            }
        }

        const versionsByTask = this._groupBy(versionRows, (r) => r.task_id);
        const feedbackByTask = this._groupBy(feedbackRows, (r) => r.eval_task_id);
        const result = new Map();

        for (const taskId of ids) {
            const rawVersions = versionsByTask.get(taskId) || [];
            const promptVersions = lib.computeDisplayVersions(rawVersions);
            const taskFeedback = feedbackByTask.get(taskId) || [];
            const allFeedback = taskFeedback
                .map((feedback) => this._buildFeedbackEntry(feedback, rawVersions, reviewerProfiles))
                .sort((a, b) => (a.feedbackAt < b.feedbackAt ? 1 : a.feedbackAt > b.feedbackAt ? -1 : 0));
            result.set(taskId, { promptVersions, allFeedback });
        }

        Logger.debug('dashboard-data: enrichment complete — '
            + versionRows.length + ' version rows, ' + feedbackRows.length + ' feedback rows');
        return result;
    }
};
