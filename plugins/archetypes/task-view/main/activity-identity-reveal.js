// activity-identity-reveal.js
// Task view: when Ops is unlocked, replace anonymized activity names with real profile name + email + expert link.

const PLUGIN_ID = 'activity-identity-reveal';
const VIEW_TASK_UUID_RE = /\/work\/problems\/view-task\/([0-9a-f-]{36})/i;
const FLEET_ORIGIN = 'https://www.fleetai.com';
const ENHANCED_ATTR = 'data-fleet-identity-reveal';
const MIN_FEEDBACK_MATCH_SCORE = 8;

const plugin = {
    id: PLUGIN_ID,
    name: 'Activity Identity Reveal',
    description: 'When Ops is unlocked, replaces anonymized task-view activity names with real worker name, email, and profile link',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        taskId: '',
        opsEnabled: false,
        fetchStarted: false,
        fetchDone: false,
        fetchFailed: false,
        revealCache: null,
        missingActivityLogged: false,
        activationLogged: false,
        revealedCount: 0
    },

    onMutation(state) {
        const opsEnabled = this._isOpsUnlocked();
        const taskId = this._extractTaskIdFromPath();

        if (taskId !== state.taskId) {
            this._resetTaskState(state, taskId);
        }

        if (state.opsEnabled !== opsEnabled) {
            state.opsEnabled = opsEnabled;
            state.fetchStarted = false;
            state.fetchDone = false;
            state.fetchFailed = false;
            state.revealCache = null;
            state.activationLogged = false;
            state.revealedCount = 0;
        }

        if (!opsEnabled || !taskId) return;

        const root = document.querySelector('[data-ui="view-task"]');
        if (!root) return;

        const entries = root.querySelectorAll('.py-1');
        if (!entries.length) {
            if (!state.missingActivityLogged) {
                Logger.debug(PLUGIN_ID + ': waiting for Activity & Feedback entries');
                state.missingActivityLogged = true;
            }
            return;
        }
        state.missingActivityLogged = false;

        if (!state.fetchDone && !state.fetchStarted) {
            state.fetchStarted = true;
            void this._fetchAndReveal(state, taskId, entries);
            return;
        }

        if (state.fetchDone && state.revealCache) {
            this._applyReveal(state, entries, state.revealCache);
        }
    },

    _resetTaskState(state, taskId) {
        state.taskId = taskId;
        state.fetchStarted = false;
        state.fetchDone = false;
        state.fetchFailed = false;
        state.missingActivityLogged = false;
        state.activationLogged = false;
        state.revealedCount = 0;
        state.revealCache = null;
    },

    _isOpsUnlocked() {
        const ops = Context.opsTab;
        return Boolean(ops && typeof ops.isEnabled === 'function' && ops.isEnabled());
    },

    _extractTaskIdFromPath() {
        const path = Context.currentPath || '';
        const match = path.match(VIEW_TASK_UUID_RE);
        return match ? match[1] : '';
    },

    async _fetchAndReveal(state, taskId, entries) {
        const ops = Context.opsTab;
        if (!ops || typeof ops.postgrestQuery !== 'function') {
            Logger.warn(PLUGIN_ID + ': Ops PostgREST client unavailable');
            state.fetchFailed = true;
            state.fetchStarted = false;
            return;
        }

        try {
            const [feedbackRows, taskRow] = await Promise.all([
                this._fetchFeedbackRows(ops, taskId),
                this._fetchTaskRow(ops, taskId)
            ]);
            if (state.taskId !== taskId || !this._isOpsUnlocked()) return;

            const userIds = new Set();
            if (taskRow && taskRow.created_by) userIds.add(String(taskRow.created_by));
            for (const row of feedbackRows) {
                if (row && row.created_by) userIds.add(String(row.created_by));
            }

            const profiles = await this._fetchProfiles(ops, [...userIds]);
            if (state.taskId !== taskId || !this._isOpsUnlocked()) return;

            const revealCache = { feedbackRows, taskRow, profiles };
            state.fetchDone = true;
            state.fetchFailed = false;
            state.revealCache = revealCache;
            this._applyReveal(state, entries, revealCache);
        } catch (err) {
            if (state.taskId !== taskId) return;
            state.fetchFailed = true;
            state.fetchStarted = false;
            const refresh = ops.isSessionRefreshRequiredError && ops.isSessionRefreshRequiredError(err);
            if (refresh) {
                Logger.warn(PLUGIN_ID + ': session refresh required — reload Fleet and retry');
            } else {
                Logger.warn(PLUGIN_ID + ': identity reveal fetch failed', err);
            }
        }
    },

    async _fetchFeedbackRows(ops, taskId) {
        const params = {
            eval_task_id: 'eq.' + taskId,
            order: 'created_at.desc',
            limit: '100'
        };
        let rows;
        try {
            rows = await ops.postgrestQuery('qa_feedback.select_row', params);
        } catch (_e) {
            rows = await ops.postgrestGet('qa_feedback', Object.assign({ select: '*' }, params));
        }
        return Array.isArray(rows) ? rows : (rows ? [rows] : []);
    },

    async _fetchTaskRow(ops, taskId) {
        try {
            const rows = await ops.postgrestQuery('tasks.select_search', {
                id: 'eq.' + taskId,
                limit: '1'
            });
            return Array.isArray(rows) ? rows[0] : rows;
        } catch (_e) {
            try {
                const rows = await ops.postgrestGet('tasks', {
                    select: 'id,key,created_by',
                    id: 'eq.' + taskId,
                    limit: '1'
                });
                return Array.isArray(rows) ? rows[0] : rows;
            } catch (_e2) {
                return null;
            }
        }
    },

    async _fetchProfiles(ops, userIds) {
        const map = new Map();
        const ids = [...new Set((userIds || []).filter(Boolean))];
        for (const id of ids) {
            try {
                const rows = await ops.postgrestQuery('profiles.select_person', {
                    id: 'eq.' + id,
                    limit: '1'
                });
                const row = Array.isArray(rows) ? rows[0] : rows;
                if (row && row.id) {
                    map.set(String(row.id), {
                        full_name: String(row.full_name || '').trim(),
                        email: String(row.email || '').trim()
                    });
                }
            } catch (err) {
                Logger.debug(PLUGIN_ID + ': profile fetch failed for ' + id, err);
            }
        }
        return map;
    },

    _resolveEntryUserId(entry, feedbackRows, taskRow, placeholderMap) {
        const headerText = this._normalizeMatchText(entry.textContent || '');
        let placeholder = '';

        if (/\bcreated the task\b/i.test(headerText) || /\bupdated the prompt\b/i.test(headerText)) {
            const authorId = taskRow && taskRow.created_by ? String(taskRow.created_by) : '';
            const spans = this._findNameSpans(entry);
            if (spans[0]) placeholder = this._normalizePlaceholder(spans[0].textContent);
            return { userId: authorId, placeholder };
        }

        const feedback = this._matchFeedbackRow(entry, feedbackRows);
        if (feedback && feedback.created_by) {
            const spans = this._findNameSpans(entry);
            if (spans[0]) placeholder = this._normalizePlaceholder(spans[0].textContent);
            return { userId: String(feedback.created_by), placeholder };
        }

        const spans = this._findNameSpans(entry);
        for (const span of spans) {
            const name = this._normalizePlaceholder(span.textContent);
            if (name === 'you') {
                const youFeedback = this._matchFeedbackRow(entry, feedbackRows);
                if (youFeedback && youFeedback.created_by) {
                    return { userId: String(youFeedback.created_by), placeholder: name };
                }
            }
            const mapped = placeholderMap.get(name);
            if (mapped) return { userId: mapped, placeholder: name };
        }

        return { userId: '', placeholder };
    },

    _matchFeedbackRow(entry, feedbackRows) {
        let best = null;
        let bestScore = 0;
        for (const row of feedbackRows || []) {
            const score = this._scoreFeedbackMatch(entry, row);
            if (score > bestScore) {
                bestScore = score;
                best = row;
            }
        }
        return bestScore >= MIN_FEEDBACK_MATCH_SCORE ? best : null;
    },

    _scoreFeedbackMatch(entry, feedback) {
        const entryNorm = this._normalizeMatchText(entry.textContent || '');
        const data = this._parseFeedbackData(feedback);
        let score = 0;

        const labels = Array.isArray(data.rejection_reason_labels)
            ? data.rejection_reason_labels
            : (data.rejection_reason_label ? [data.rejection_reason_label] : []);
        for (const label of labels) {
            const norm = this._normalizeMatchText(label);
            if (norm && entryNorm.includes(norm)) score += 10;
        }

        score += this._snippetScore(entryNorm, data.attempted_actions, 15, 20);
        score += this._snippetScore(entryNorm, data.task_feedback, 12, 20);
        score += this._snippetScore(entryNorm, data.general_feedback, 12, 20);
        score += this._snippetScore(entryNorm, data.bug_description, 12, 20);

        if (data.bug_reason) {
            const norm = this._normalizeMatchText(data.bug_reason);
            if (norm && entryNorm.includes(norm)) score += 15;
        }

        const content = this._normalizeMatchText(feedback && feedback.feedback_content);
        if (content.length > 30) {
            const snippet = content.slice(0, 80);
            if (entryNorm.includes(snippet)) score += 8;
        }

        return score;
    },

    _snippetScore(entryNorm, text, weight, minLen) {
        if (!text) return 0;
        const norm = this._normalizeMatchText(text);
        const snippet = norm.slice(0, 60);
        if (snippet.length >= minLen && entryNorm.includes(snippet)) return weight;
        if (norm.length >= minLen && entryNorm.includes(norm.slice(0, Math.min(norm.length, 100)))) return weight - 3;
        return 0;
    },

    _parseFeedbackData(row) {
        const raw = row && row.feedback_data;
        if (!raw) return {};
        if (typeof raw === 'object') return raw;
        try {
            return JSON.parse(raw);
        } catch (_e) {
            return {};
        }
    },

    _normalizeMatchText(text) {
        return String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    },

    _normalizePlaceholder(text) {
        return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    },

    _findNameSpans(entry) {
        const header = entry.querySelector('.text-sm');
        if (!header) return [];
        return [...header.querySelectorAll('span.font-medium')].filter((span) => {
            if (span.closest('[' + ENHANCED_ATTR + ']')) return false;
            if (span.closest('.inline-flex.items-center.whitespace-nowrap.rounded-md')) return false;
            const text = String(span.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text) return false;
            if (/^(dispute|approved|rejected|pending)$/i.test(text)) return false;
            return true;
        });
    },

    _applyReveal(state, entries, revealCache) {
        const { feedbackRows, taskRow, profiles } = revealCache;
        const placeholderMap = new Map();
        const assignments = [];

        for (const entry of entries) {
            const assignment = this._resolveEntryUserId(entry, feedbackRows, taskRow, placeholderMap);
            assignments.push(Object.assign({ entry }, assignment));
            if (assignment.placeholder && assignment.userId) {
                placeholderMap.set(this._normalizePlaceholder(assignment.placeholder), assignment.userId);
            }
        }

        for (const item of assignments) {
            if (item.userId) continue;
            for (const span of this._findNameSpans(item.entry)) {
                const placeholder = this._normalizePlaceholder(span.textContent);
                if (!placeholder || placeholder === 'you') continue;
                const mapped = placeholderMap.get(placeholder);
                if (mapped) {
                    item.userId = mapped;
                    break;
                }
            }
        }

        let newlyRevealed = 0;

        for (const item of assignments) {
            if (!item.userId) continue;

            const profile = profiles.get(item.userId);
            for (const span of this._findNameSpans(item.entry)) {
                if (span.closest('[' + ENHANCED_ATTR + ']')) continue;
                this._replaceNameSpan(span, item.userId, profile);
                newlyRevealed += 1;
            }
        }

        if (newlyRevealed > 0) {
            state.revealedCount += newlyRevealed;
            if (!state.activationLogged) {
                Logger.log(PLUGIN_ID + ': revealed identities for task ' + state.taskId);
                state.activationLogged = true;
            }
            Logger.debug(PLUGIN_ID + ': revealed ' + newlyRevealed + ' name(s), total ' + state.revealedCount);
        }
    },

    _replaceNameSpan(span, userId, profile) {
        const wrapper = document.createElement('span');
        wrapper.className = 'inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 align-middle';
        wrapper.setAttribute(ENHANCED_ATTR, userId);

        const name = profile && profile.full_name ? profile.full_name : '';
        const email = profile && profile.email ? profile.email : '';

        if (!name && !email) {
            const dismissed = document.createElement('span');
            dismissed.className = 'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wide text-violet-700 border-violet-300 dark:text-violet-300 dark:border-violet-700';
            dismissed.textContent = 'DISMISSED FROM FLEET';
            wrapper.appendChild(dismissed);
        } else {
            if (name) {
                const nameEl = document.createElement('span');
                nameEl.className = span.className || 'font-medium';
                nameEl.textContent = name;
                wrapper.appendChild(nameEl);
            }
            if (email) {
                const emailEl = document.createElement('span');
                emailEl.className = 'text-muted-foreground text-xs';
                emailEl.textContent = email;
                wrapper.appendChild(emailEl);
            }
        }

        const profileUrl = FLEET_ORIGIN + '/dashboard/data/experts/' + encodeURIComponent(userId);
        const link = document.createElement('a');
        link.href = profileUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground';
        link.title = 'Open profile in Fleet';
        link.setAttribute('aria-label', 'Open profile in Fleet');
        link.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>';
        wrapper.appendChild(link);

        span.replaceWith(wrapper);
    }
};
