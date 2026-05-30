// dashboard-data.js — PostgREST enrichment for Worker Output Search.
// Loaded after dashboard-lib.js, before dashboard.js; registers Context.dashboardData.

const DASH_DATA_FEEDBACK_PAGE_SIZE = 200;
const DASH_DATA_ID_CHUNK = 100;

const plugin = {
    id: 'dashboard-data',
    name: 'Dashboard Data',
    description: 'Batch version + feedback enrichment for the Worker Output Search dashboard',
    _version: '1.2',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const self = this;
        Context.dashboardData = {
            enrichTasksWithHistory: (taskIds, profilesMap) => self._enrichTasksWithHistory(taskIds, profilesMap)
        };
        Logger.log('dashboard-data: module registered (Context.dashboardData)');
    },

    async _pgQuery(queryKey, overrides) {
        if (!Context.opsTab || typeof Context.opsTab.postgrestQuery !== 'function') {
            throw new Error('Ops tab PostgREST client unavailable. Unlock the Ops tab and try again.');
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
        for (let i = 0; i < taskIds.length; i += DASH_DATA_ID_CHUNK) {
            const chunk = taskIds.slice(i, i + DASH_DATA_ID_CHUNK);
            const rows = await this._pgQuery('task_versions.select_history', {
                task_id: chunk.length === 1 ? 'eq.' + chunk[0] : 'in.(' + chunk.join(',') + ')',
                order: 'version_no.asc',
                limit: String(Math.max(chunk.length * 20, 100))
            });
            versionRows.push(...rows);
        }
        return versionRows;
    },

    async _fetchFeedbackBatch(taskIds) {
        const feedbackRows = [];
        for (let i = 0; i < taskIds.length; i += DASH_DATA_ID_CHUNK) {
            const chunk = taskIds.slice(i, i + DASH_DATA_ID_CHUNK);
            let offset = 0;
            while (true) {
                const page = await this._pgQuery('qa_feedback.select_row', {
                    eval_task_id: chunk.length === 1 ? 'eq.' + chunk[0] : 'in.(' + chunk.join(',') + ')',
                    order: 'created_at.desc',
                    offset: String(offset),
                    limit: String(DASH_DATA_FEEDBACK_PAGE_SIZE)
                });
                feedbackRows.push(...page);
                if (page.length < DASH_DATA_FEEDBACK_PAGE_SIZE) break;
                offset += DASH_DATA_FEEDBACK_PAGE_SIZE;
            }
        }
        return feedbackRows;
    },

    /**
     * @param {string[]} taskIds
     * @param {Map<string, {full_name: string, email: string}>} [profilesMap]
     * @returns {Promise<Map<string, { promptVersions: object[], allFeedback: object[] }>>}
     */
    async _enrichTasksWithHistory(taskIds, profilesMap) {
        const lib = Context.dashboardLib;
        const ids = [...new Set((taskIds || []).filter(Boolean))];
        if (ids.length === 0) return new Map();

        Logger.debug('dashboard-data: enriching ' + ids.length + ' task(s) with version + feedback history');

        const [versionRows, feedbackRows] = await Promise.all([
            this._fetchVersionsBatch(ids),
            this._fetchFeedbackBatch(ids)
        ]);

        const reviewerProfiles = new Map(profilesMap || []);
        const missingReviewerIds = [...new Set(
            feedbackRows
                .map((f) => f.created_by)
                .filter((id) => id && !reviewerProfiles.has(id))
        )];
        if (missingReviewerIds.length > 0) {
            const rows = await this._pgQuery('profiles.select_person', {
                id: 'in.(' + missingReviewerIds.join(',') + ')'
            });
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
