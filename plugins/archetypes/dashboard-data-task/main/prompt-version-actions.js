// prompt-version-actions.js
// Dashboard task detail: copy version UUID prefix and open view-task link per prompt history card.

const TASK_KEY_FROM_PATH_RE = /\/dashboard\/data\/tasks\/(task_[^/?#]+)/i;
const PLUGIN_ID = 'prompt-version-actions';
const VIEW_TASK_URL_PREFIX = 'https://www.fleetai.com/work/problems/view-task/';
const ENHANCED_ATTR = 'data-fleet-prompt-version-actions';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTERNAL_LINK_PATH_SNIPPET = 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6';
const OPS_BUNDLE_WAIT_TIMEOUT_MS = 30000;

const plugin = {
    id: PLUGIN_ID,
    name: 'Prompt Version Actions',
    description: 'On dashboard task pages with prompt history, copy version UUID prefix and open view-task link',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        taskKey: '',
        evalTaskId: '',
        versionRows: null,
        fetchStarted: false,
        fetchFailed: false,
        bundleWaitStarted: false,
        bundleUnavailable: false,
        missingHistoryLogged: false,
        missingVersionsLogged: false,
        activationLogged: false,
        enhancedCount: 0
    },

    init(state) {
        const taskKey = this._extractTaskKeyFromPath();
        if (taskKey !== state.taskKey) {
            this._resetTaskState(state, taskKey);
        }
    },

    onMutation(state) {
        const taskKey = this._extractTaskKeyFromPath();
        if (!taskKey) return;

        if (taskKey !== state.taskKey) {
            this._resetTaskState(state, taskKey);
        }

        if (!state.fetchStarted && !state.bundleUnavailable) {
            this._startVersionFetchWhenBundleReady(state, taskKey);
        }

        const cards = this._findPromptHistoryCards();
        if (!cards.length) {
            if (!state.missingHistoryLogged) {
                Logger.debug(PLUGIN_ID + ': waiting for Prompt history section');
                state.missingHistoryLogged = true;
            }
            if (state.activationLogged) {
                Logger.debug(PLUGIN_ID + ': Prompt history section no longer present');
                state.activationLogged = false;
                state.enhancedCount = 0;
            }
            return;
        }
        state.missingHistoryLogged = false;

        if (!state.versionRows || !state.evalTaskId) {
            if (state.fetchFailed || state.bundleUnavailable) return;
            if (!state.missingVersionsLogged) {
                Logger.debug(PLUGIN_ID + ': waiting for prompt version fetch');
                state.missingVersionsLogged = true;
            }
            return;
        }
        state.missingVersionsLogged = false;

        const computed = this._computeDisplayVersions(state.versionRows);
        const byPrompt = this._buildPromptLookup(computed);

        let newlyEnhanced = 0;
        for (const card of cards) {
            if (this._enhanceVersionCard(card, byPrompt, computed, state.evalTaskId)) newlyEnhanced += 1;
        }

        if (newlyEnhanced > 0) {
            state.enhancedCount += newlyEnhanced;
            if (!state.activationLogged) {
                Logger.log(PLUGIN_ID + ': enhancing prompt history version rows');
                state.activationLogged = true;
            }
            Logger.debug(PLUGIN_ID + ': enhanced ' + newlyEnhanced + ' row(s), total ' + state.enhancedCount);
        }
    },

    _resetTaskState(state, taskKey) {
        state.taskKey = taskKey;
        state.evalTaskId = '';
        state.versionRows = null;
        state.fetchStarted = false;
        state.fetchFailed = false;
        state.bundleWaitStarted = false;
        state.bundleUnavailable = false;
        state.missingHistoryLogged = false;
        state.missingVersionsLogged = false;
        state.activationLogged = false;
        state.enhancedCount = 0;
    },

    _extractTaskKeyFromPath() {
        const path = Context.currentPath || '';
        const match = path.match(TASK_KEY_FROM_PATH_RE);
        if (match) return match[1];
        const segments = path.split('/').filter(Boolean);
        const last = segments[segments.length - 1] || '';
        return /^task_/i.test(last) ? last : '';
    },

    _startVersionFetchWhenBundleReady(state, taskKey) {
        const opsTab = Context.opsTab;
        if (!opsTab) {
            state.fetchFailed = true;
            return;
        }
        if (typeof opsTab.isOpsBundleReady === 'function' && opsTab.isOpsBundleReady()) {
            state.fetchStarted = true;
            void this._fetchVersionRows(state, taskKey);
            return;
        }
        if (state.bundleWaitStarted) return;
        if (typeof opsTab.whenOpsBundleReady !== 'function') {
            state.bundleUnavailable = true;
            return;
        }
        state.bundleWaitStarted = true;
        void opsTab.whenOpsBundleReady({ timeoutMs: OPS_BUNDLE_WAIT_TIMEOUT_MS })
            .then(() => {
                state.bundleWaitStarted = false;
                if (state.taskKey !== taskKey || state.fetchStarted) return;
                state.fetchStarted = true;
                void this._fetchVersionRows(state, taskKey);
            })
            .catch((err) => {
                state.bundleWaitStarted = false;
                state.bundleUnavailable = true;
                Logger.warn(PLUGIN_ID + ': ops bundle unavailable', err);
            });
    },

    _isTransientBundleError(err) {
        const opsTab = Context.opsTab;
        return !!(opsTab && typeof opsTab.isOpsBundleNotLoadedError === 'function'
            && opsTab.isOpsBundleNotLoadedError(err));
    },

    async _fetchVersionRows(state, taskKey) {
        const opsTab = Context.opsTab;
        if (!opsTab) {
            Logger.warn(PLUGIN_ID + ': Context.opsTab unavailable');
            state.fetchFailed = true;
            return;
        }

        Logger.log(PLUGIN_ID + ': fetching prompt versions for ' + taskKey);
        try {
            if (typeof opsTab.whenOpsBundleReady === 'function') {
                await opsTab.whenOpsBundleReady({ timeoutMs: OPS_BUNDLE_WAIT_TIMEOUT_MS });
            }
            const taskRow = await this._lookupTaskRow(opsTab, taskKey);
            if (!taskRow || !taskRow.id) {
                Logger.warn(PLUGIN_ID + ': task not found for key ' + taskKey);
                state.versionRows = [];
                state.fetchFailed = true;
                return;
            }

            const rows = await this._fetchVersionHistory(opsTab, taskRow.id);
            if (state.taskKey !== taskKey) return;

            state.evalTaskId = String(taskRow.id).trim();
            state.versionRows = rows;
            state.fetchFailed = false;
            Logger.log(PLUGIN_ID + ': loaded ' + rows.length + ' raw version row(s) for ' + taskKey);
            Logger.log(PLUGIN_ID + ': eval task id captured for view links');
        } catch (err) {
            if (state.taskKey !== taskKey) return;
            if (this._isTransientBundleError(err)) {
                state.versionRows = null;
                state.fetchStarted = false;
                state.fetchFailed = false;
                return;
            }
            state.versionRows = null;
            state.fetchFailed = true;
            const refresh = opsTab.isSessionRefreshRequiredError && opsTab.isSessionRefreshRequiredError(err);
            if (refresh) {
                Logger.warn(PLUGIN_ID + ': session refresh required — reload Fleet and retry');
            } else {
                Logger.warn(PLUGIN_ID + ': version fetch failed for ' + taskKey, err);
            }
        }
    },

    async _lookupTaskRow(opsTab, taskKey) {
        try {
            const rows = await opsTab.postgrestQuery('tasks.select_verifier_lookup', {
                key: 'eq.' + taskKey,
                limit: '1'
            });
            return Array.isArray(rows) ? rows[0] : rows;
        } catch (_e) {
            const rows = await opsTab.postgrestGet('tasks', {
                select: 'id,key',
                key: 'eq.' + taskKey,
                limit: '1'
            });
            return Array.isArray(rows) ? rows[0] : rows;
        }
    },

    async _fetchVersionHistory(opsTab, taskId) {
        const params = {
            task_id: 'eq.' + taskId,
            order: 'version_no.asc',
            limit: '100'
        };
        let rows;
        try {
            rows = await opsTab.postgrestQuery('task_versions.select_history', params);
        } catch (_e) {
            rows = await opsTab.postgrestGet('task_versions', Object.assign({
                select: 'id,task_id,version_no,created_at,prompt,env_key,resubmission_notes'
            }, params));
        }
        return Array.isArray(rows) ? rows : (rows ? [rows] : []);
    },

    _computeDisplayVersions(rawVersions) {
        const lib = Context.dashboardLib;
        if (lib && typeof lib.computeDisplayVersions === 'function') {
            return lib.computeDisplayVersions(rawVersions);
        }
        const sorted = [...rawVersions].sort((a, b) => a.version_no - b.version_no);
        const result = [];
        let prevPrompt = null;
        let displayNo = 0;
        for (const v of sorted) {
            const prompt = String(v.prompt ?? '');
            if (prompt !== prevPrompt) {
                displayNo += 1;
                result.push({
                    id: String(v.id ?? ''),
                    versionNo: v.version_no,
                    displayVersionNo: displayNo,
                    prompt
                });
                prevPrompt = prompt;
            }
        }
        return result;
    },

    _normalizePrompt(text) {
        return String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\u00a0/g, ' ')
            .trim();
    },

    _normalizePromptLoose(text) {
        return this._normalizePrompt(text).replace(/\s+/g, ' ');
    },

    _buildPromptLookup(computed) {
        const exact = new Map();
        const loose = new Map();
        for (const version of computed) {
            const prompt = String(version.prompt ?? '');
            exact.set(this._normalizePrompt(prompt), version);
            loose.set(this._normalizePromptLoose(prompt), version);
        }
        return { exact, loose };
    },

    _resolveVersionForCard(card, byPrompt, computed) {
        const pre = card.querySelector('pre');
        const cardPrompt = pre ? pre.textContent : '';
        const exactKey = this._normalizePrompt(cardPrompt);
        const looseKey = this._normalizePromptLoose(cardPrompt);

        if (exactKey && byPrompt.exact.has(exactKey)) {
            return byPrompt.exact.get(exactKey);
        }
        if (looseKey && byPrompt.loose.has(looseKey)) {
            return byPrompt.loose.get(looseKey);
        }

        const displayNo = this._parseDisplayVersionNo(
            card.querySelector(':scope > div.p-4 > div.mb-3.flex.flex-wrap.items-center.justify-between.gap-2 > div.flex.flex-wrap.items-center.gap-x-2.gap-y-1.text-xs.text-muted-foreground')
        );
        if (displayNo) {
            return computed.find((v) => v.displayVersionNo === displayNo) || null;
        }
        return null;
    },

    _findPromptHistorySectionRoot() {
        const labels = document.querySelectorAll('div.text-sm.text-muted-foreground.font-medium, div.font-medium.text-sm.text-muted-foreground');
        for (const label of labels) {
            if ((label.textContent || '').trim() !== 'Prompt history') continue;
            let node = label.parentElement;
            while (node) {
                const list = node.querySelector(':scope > div.space-y-3');
                if (list) return list;
                node = node.parentElement;
            }
        }
        return null;
    },

    _findPromptHistoryCards() {
        const list = this._findPromptHistorySectionRoot();
        if (!list) return [];
        return [...list.children].filter((el) => el.matches('div.rounded-xl'));
    },

    _parseDisplayVersionNo(metaDiv) {
        if (!metaDiv) return null;
        for (const span of metaDiv.querySelectorAll('span')) {
            const match = (span.textContent || '').trim().match(/^v(\d+)$/i);
            if (match) return Number(match[1]);
        }
        return null;
    },

    _enhanceVersionCard(card, byPrompt, computed, evalTaskId) {
        const headerRow = card.querySelector(':scope > div.p-4 > div.mb-3.flex.flex-wrap.items-center.justify-between.gap-2');
        if (!headerRow) return false;

        const metaDiv = headerRow.querySelector(':scope > div.flex.flex-wrap.items-center.gap-x-2.gap-y-1.text-xs.text-muted-foreground');
        if (!metaDiv || metaDiv.querySelector('[' + ENHANCED_ATTR + '="1"]')) return false;

        const displayNo = this._parseDisplayVersionNo(metaDiv);
        const matched = this._resolveVersionForCard(card, byPrompt, computed);
        const versionId = matched && String(matched.id || '').trim();
        const taskId = String(evalTaskId || '').trim();
        if (!displayNo || !versionId || !UUID_RE.test(versionId) || !UUID_RE.test(taskId)) {
            Logger.debug(PLUGIN_ID + ': no version id for card'
                + (displayNo ? ' v' + displayNo : '')
                + (matched && matched.displayVersionNo != null && displayNo !== matched.displayVersionNo
                    ? ' (text matched v' + matched.displayVersionNo + ')'
                    : ''));
            return false;
        }

        if (matched.displayVersionNo !== displayNo) {
            Logger.debug(PLUGIN_ID + ': prompt text matched v' + matched.displayVersionNo
                + ' for card badge v' + displayNo);
        }

        const actions = document.createElement('span');
        actions.className = 'inline-flex items-center gap-2';
        actions.setAttribute(ENHANCED_ATTR, '1');
        actions.setAttribute('data-fleet-plugin', PLUGIN_ID);
        actions.appendChild(this._createVersionIdCopyButton(versionId, displayNo));
        actions.appendChild(this._createViewTaskLink(taskId, displayNo));
        metaDiv.appendChild(actions);
        return true;
    },

    _uuidFirstSection(uuid) {
        const id = String(uuid || '').trim();
        const idx = id.indexOf('-');
        return idx > 0 ? id.slice(0, idx) : id;
    },

    _createVersionIdCopyButton(versionId, displayNo) {
        const label = this._uuidFirstSection(versionId);
        const button = document.createElement('button');
        button.type = 'button';
        button.className =
            'inline-flex items-center justify-center whitespace-nowrap rounded-sm border border-input bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground';
        button.textContent = label;
        button.title = 'Copy version ID: ' + versionId;
        button.setAttribute('aria-label', 'Copy version ID: ' + versionId);
        button.setAttribute('data-fleet-plugin', PLUGIN_ID);

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void this._copyVersionId(button, versionId, displayNo);
        });

        return button;
    },

    _createViewTaskLink(evalTaskId, displayNo) {
        const link = document.createElement('a');
        link.href = VIEW_TASK_URL_PREFIX + encodeURIComponent(evalTaskId);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className =
            'inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground';
        link.title = 'Open task (v' + displayNo + ') in Fleet';
        link.setAttribute('aria-label', 'Open task (v' + displayNo + ') in Fleet');
        link.setAttribute('data-fleet-plugin', PLUGIN_ID);

        const text = document.createElement('span');
        text.textContent = 'View';
        link.appendChild(text);
        link.appendChild(this._externalLinkIcon());

        return link;
    },

    _externalLinkIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', '12');
        svg.setAttribute('height', '12');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('class', 'h-3 w-3');

        const paths = [
            'M15 3h6v6',
            'M10 14 21 3',
            EXTERNAL_LINK_PATH_SNIPPET
        ];
        for (const d of paths) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            svg.appendChild(path);
        }
        return svg;
    },

    _clearCopyButtonFeedback(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.clear(button);
    },

    _showCopySuccessFlash(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(button, { restoreStyles: false });
    },

    _showCopyFailurePulse(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.flashFailure(button, { restoreStyles: false });
    },

    async _copyTextToClipboard(text) {
        if (!text) return false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (_e) { /* fall through */ }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (_e2) {
            return false;
        }
    },

    async _copyVersionId(button, versionId, displayNo) {
        const ok = await this._copyTextToClipboard(versionId);
        if (ok) {
            this._showCopySuccessFlash(button);
            Logger.log(PLUGIN_ID + ': copied version v' + displayNo + ' id (' + versionId.length + ' chars)');
        } else {
            this._showCopyFailurePulse(button);
            Logger.warn(PLUGIN_ID + ': copy failed for version v' + displayNo);
        }
    }
};
