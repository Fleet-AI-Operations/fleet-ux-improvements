// activity-identity-reveal.js
// Task view: when Ops is unlocked, replace anonymized activity names with real profile name + email + expert link.

const PLUGIN_ID = 'activity-identity-reveal';
const VIEW_TASK_ID_FROM_PATH_RE = /(?:^|\/)view-task\/([^/?#\s]+)/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FLEET_ORIGIN = 'https://www.fleetai.com';
const ENHANCED_ATTR = 'data-fleet-identity-reveal';
const MIN_FEEDBACK_MATCH_SCORE = 8;

const LABEL_TO_FIELD = {
    'rejection reason': 'rejectionLabels',
    'attempted actions': 'attemptedActions',
    'task issues': 'taskFeedback',
    'general feedback': 'generalFeedback',
    'bug reason': 'bugReason',
    'bug description': 'bugDescription',
    'resolution': 'resolutionText',
    "writer's dispute": 'writerDispute'
};

const plugin = {
    id: PLUGIN_ID,
    name: 'Activity Identity Reveal',
    description: 'When Ops is unlocked, replaces anonymized task-view activity names with real worker name, email, and profile link',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        taskId: '',
        opsEnabled: false,
        fetchStarted: false,
        fetchDone: false,
        fetchFailed: false,
        revealCache: null,
        opsBlockedLogged: false,
        taskIdMissingLogged: false,
        missingRootLogged: false,
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
            state.opsBlockedLogged = false;
        }

        if (!opsEnabled) {
            if (!state.opsBlockedLogged) {
                Logger.info(PLUGIN_ID + ': inactive — Ops not enabled');
                state.opsBlockedLogged = true;
            }
            return;
        }
        state.opsBlockedLogged = false;

        if (!taskId) {
            if (!state.taskIdMissingLogged) {
                Logger.warn(PLUGIN_ID + ': no eval task id in path "' + (Context.currentPath || '') + '"');
                state.taskIdMissingLogged = true;
            }
            return;
        }
        state.taskIdMissingLogged = false;

        const root = document.querySelector('[data-ui="view-task"]');
        if (!root) {
            if (!state.missingRootLogged) {
                Logger.debug(PLUGIN_ID + ': waiting for [data-ui="view-task"]');
                state.missingRootLogged = true;
            }
            return;
        }
        state.missingRootLogged = false;

        const entries = this._findActivityEntries(root);
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
        state.taskIdMissingLogged = false;
    },

    _isOpsUnlocked() {
        const ops = Context.opsTab;
        return Boolean(ops && typeof ops.isEnabled === 'function' && ops.isEnabled());
    },

    _extractTaskIdFromPath() {
        const path = Context.currentPath || '';
        const match = path.match(VIEW_TASK_ID_FROM_PATH_RE);
        if (!match) return '';
        const candidate = String(match[1] || '').trim();
        return UUID_RE.test(candidate) ? candidate : '';
    },

    _findActivityEntries(root) {
        const spaceY2 = root.querySelector('.w-full.space-y-3 .space-y-2');
        if (spaceY2) {
            const scoped = spaceY2.querySelectorAll(':scope > .py-1');
            if (scoped.length) return [...scoped];
        }
        return [...root.querySelectorAll('.space-y-2 > .py-1')];
    },

    _abortFetch(state, taskId) {
        if (state.taskId !== taskId || !this._isOpsUnlocked()) {
            state.fetchStarted = false;
            return true;
        }
        return false;
    },

    async _fetchAndReveal(state, taskId, entries) {
        const ops = Context.opsTab;
        if (!ops || typeof ops.postgrestQuery !== 'function') {
            Logger.warn(PLUGIN_ID + ': Ops PostgREST client unavailable');
            state.fetchFailed = true;
            state.fetchStarted = false;
            return;
        }

        Logger.info(PLUGIN_ID + ': fetching QA feedback + task author for ' + taskId);

        try {
            const [feedbackRows, taskRow] = await Promise.all([
                this._fetchFeedbackRows(ops, taskId),
                this._fetchTaskRow(ops, taskId)
            ]);
            if (this._abortFetch(state, taskId)) return;

            const userIds = new Set();
            const authorId = taskRow && taskRow.created_by ? String(taskRow.created_by) : '';
            if (authorId) userIds.add(authorId);
            for (const row of feedbackRows) {
                if (row && row.created_by) userIds.add(String(row.created_by));
            }

            const profiles = await this._fetchProfiles(ops, [...userIds]);
            if (this._abortFetch(state, taskId)) return;

            Logger.info(
                PLUGIN_ID + ': loaded ' + feedbackRows.length + ' feedback row(s)'
                + (authorId ? ', author ' + authorId : ', no author')
                + ', ' + profiles.size + ' profile(s)'
            );

            const revealCache = { feedbackRows, taskRow, profiles };
            state.fetchDone = true;
            state.fetchFailed = false;
            state.revealCache = revealCache;
            this._applyReveal(state, entries, revealCache);
        } catch (err) {
            if (state.taskId !== taskId) {
                state.fetchStarted = false;
                return;
            }
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

    _classifyEntry(entry) {
        const header = entry.querySelector('.text-sm');
        const headerText = this._normalizeMatchText(header ? header.textContent : entry.textContent);
        if (/\bcreated the task\b/.test(headerText)) return 'task_created';
        if (/\bupdated the prompt\b/.test(headerText)) return 'prompt_updated';
        if (/\bdispute on\b/.test(headerText) && /'s feedback/.test(headerText)) return 'dispute';
        if (/\brequested changes\b/.test(headerText)) return 'qa_feedback';
        return 'unknown';
    },

    _extractLabeledBlocks(entry) {
        const blocks = {};
        const labels = entry.querySelectorAll('.text-sm.text-muted-foreground.font-medium.mb-1');
        for (const labelEl of labels) {
            const labelKey = this._normalizeMatchText(labelEl.textContent);
            const field = LABEL_TO_FIELD[labelKey];
            if (!field) continue;
            const valueEl = labelEl.nextElementSibling;
            if (!valueEl) continue;
            blocks[field] = this._normalizeMatchText(valueEl.textContent);
        }
        return blocks;
    },

    _buildFeedbackFingerprint(row) {
        const data = this._parseFeedbackData(row);
        const labels = Array.isArray(data.rejection_reason_labels)
            ? data.rejection_reason_labels.map(String)
            : (data.rejection_reason_label ? [String(data.rejection_reason_label)] : []);
        return {
            id: row && row.id,
            created_by: row && row.created_by ? String(row.created_by) : '',
            rejectionLabels: labels.map((l) => this._normalizeMatchText(l)).filter(Boolean),
            attemptedActions: this._normalizeMatchText(data.attempted_actions),
            taskFeedback: this._normalizeMatchText(data.task_feedback),
            generalFeedback: this._normalizeMatchText(data.general_feedback),
            bugReason: this._normalizeMatchText(data.bug_reason),
            bugDescription: this._normalizeMatchText(data.bug_description),
            feedbackContent: this._normalizeMatchText(row && row.feedback_content)
        };
    },

    _scoreFeedbackMatch(blocks, fingerprint) {
        let score = 0;

        if (blocks.rejectionLabels && fingerprint.rejectionLabels.length) {
            const domNorm = blocks.rejectionLabels;
            for (const label of fingerprint.rejectionLabels) {
                if (label && domNorm.includes(label)) score += 20;
            }
        }

        score += this._blockSnippetScore(blocks.attemptedActions, fingerprint.attemptedActions, 18, 20);
        score += this._blockSnippetScore(blocks.taskFeedback, fingerprint.taskFeedback, 15, 20);
        score += this._blockSnippetScore(blocks.generalFeedback, fingerprint.generalFeedback, 15, 20);
        score += this._blockSnippetScore(blocks.bugDescription, fingerprint.bugDescription, 12, 15);
        score += this._blockSnippetScore(blocks.resolutionText, fingerprint.bugDescription, 10, 15);

        if (blocks.bugReason && fingerprint.bugReason) {
            if (blocks.bugReason.includes(fingerprint.bugReason) || fingerprint.bugReason.includes(blocks.bugReason)) {
                score += 18;
            }
        }
        if (blocks.generalFeedback && fingerprint.bugReason && blocks.generalFeedback.includes(fingerprint.bugReason)) {
            score += 15;
        }
        if (blocks.generalFeedback && fingerprint.feedbackContent) {
            const snippet = fingerprint.feedbackContent.slice(0, 80);
            if (snippet.length > 20 && blocks.generalFeedback.includes(snippet)) score += 12;
        }
        if (blocks.resolutionText && fingerprint.bugReason && blocks.resolutionText.includes(fingerprint.bugReason)) {
            score += 12;
        }

        return score;
    },

    _blockSnippetScore(blockText, apiText, weight, minLen) {
        if (!blockText || !apiText) return 0;
        const snippet = apiText.slice(0, 60);
        if (snippet.length >= minLen && blockText.includes(snippet)) return weight;
        const longer = apiText.slice(0, Math.min(apiText.length, 100));
        if (longer.length >= minLen && blockText.includes(longer)) return weight - 4;
        if (apiText.length >= minLen && blockText.includes(apiText.slice(0, minLen))) return weight - 6;
        return 0;
    },

    _matchFeedbackRow(entry, feedbackRows) {
        const blocks = this._extractLabeledBlocks(entry);
        let best = null;
        let bestScore = 0;
        for (const row of feedbackRows || []) {
            const fp = this._buildFeedbackFingerprint(row);
            const score = this._scoreFeedbackMatch(blocks, fp);
            if (score > bestScore) {
                bestScore = score;
                best = row;
            }
        }
        return bestScore >= MIN_FEEDBACK_MATCH_SCORE ? best : null;
    },

    _resolveEntryUserId(entry, feedbackRows, taskRow, placeholderMap) {
        const kind = this._classifyEntry(entry);
        const spans = this._findNameSpans(entry);
        const placeholder = spans[0] ? this._normalizePlaceholder(spans[0].textContent) : '';

        if (kind === 'task_created' || kind === 'prompt_updated') {
            const authorId = taskRow && taskRow.created_by ? String(taskRow.created_by) : '';
            return { userId: authorId, placeholder, kind };
        }

        if (kind === 'qa_feedback' || kind === 'unknown') {
            const feedback = this._matchFeedbackRow(entry, feedbackRows);
            if (feedback && feedback.created_by) {
                return { userId: String(feedback.created_by), placeholder, kind };
            }
        }

        if (kind === 'dispute' || kind === 'unknown') {
            for (const span of spans) {
                const name = this._normalizePlaceholder(span.textContent);
                if (!name || name === 'you') continue;
                const mapped = placeholderMap.get(name);
                if (mapped) return { userId: mapped, placeholder: name, kind };
            }
        }

        for (const span of spans) {
            const name = this._normalizePlaceholder(span.textContent);
            if (name === 'you') {
                const youFeedback = this._matchFeedbackRow(entry, feedbackRows);
                if (youFeedback && youFeedback.created_by) {
                    return { userId: String(youFeedback.created_by), placeholder: name, kind };
                }
            }
            const mapped = placeholderMap.get(name);
            if (mapped) return { userId: mapped, placeholder: name, kind };
        }

        return { userId: '', placeholder, kind };
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

        const mappedCount = assignments.filter((a) => a.userId).length;
        Logger.log(PLUGIN_ID + ': mapped ' + mappedCount + '/' + assignments.length + ' activity entries');

        if (mappedCount === 0 && assignments.length > 0) {
            Logger.warn(
                PLUGIN_ID + ': no DOM entries matched — task ' + state.taskId
                + ', ' + feedbackRows.length + ' feedback row(s)'
            );
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
                Logger.info(PLUGIN_ID + ': revealed identities for task ' + state.taskId);
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
