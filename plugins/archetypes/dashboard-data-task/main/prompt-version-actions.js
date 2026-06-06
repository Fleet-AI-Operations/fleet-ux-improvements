// prompt-version-actions.js
// Dashboard task detail: copy version UUID prefix and open view-task link per prompt history card.

const TASK_KEY_FROM_PATH_RE = /\/dashboard\/data\/tasks\/(task_[^/?#]+)/i;
const TASK_DATA_PATH_RE = /^\/dashboard\/data\/tasks\/[^/]+$/;
const PLUGIN_ID = 'prompt-version-actions';
const VIEW_TASK_URL_PREFIX = 'https://www.fleetai.com/work/problems/view-task/';
const ENHANCED_ATTR = 'data-fleet-prompt-version-actions';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COPY_SUCCESS_FLASH_MS = 1000;
const COPY_SUCCESS_GREEN_BG = 'rgb(34, 197, 94)';
const COPY_FAILURE_PULSE_MS = 500;
const COPY_FAILURE_RED_BG = 'rgb(239, 68, 68)';
const EXTERNAL_LINK_PATH_SNIPPET = 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6';

const plugin = {
    id: PLUGIN_ID,
    name: 'Prompt Version Actions',
    description: 'On dashboard task pages with prompt history, copy version UUID prefix and open view-task per version',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        taskKey: '',
        versionByDisplayNo: null,
        captureLogged: false,
        missingHistoryLogged: false,
        missingVersionsLogged: false,
        activationLogged: false,
        enhancedCount: 0,
        networkSubscribed: false
    },

    init(state, context) {
        const taskKey = this._extractTaskKeyFromPath();
        if (taskKey !== state.taskKey) {
            state.taskKey = taskKey;
            state.versionByDisplayNo = new Map();
            state.captureLogged = false;
            state.missingVersionsLogged = false;
            state.enhancedCount = 0;
        }
        this._subscribeVersionCapture(state, context);
    },

    onMutation(state) {
        const taskKey = this._extractTaskKeyFromPath();
        if (!taskKey) return;

        if (taskKey !== state.taskKey) {
            state.taskKey = taskKey;
            state.versionByDisplayNo = new Map();
            state.captureLogged = false;
            state.missingHistoryLogged = false;
            state.missingVersionsLogged = false;
            state.activationLogged = false;
            state.enhancedCount = 0;
        }

        if (!state.versionByDisplayNo || state.versionByDisplayNo.size === 0) {
            if (!state.missingVersionsLogged) {
                Logger.debug(PLUGIN_ID + ': waiting for prompt version data from page network');
                state.missingVersionsLogged = true;
            }
            return;
        }
        state.missingVersionsLogged = false;

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

        let newlyEnhanced = 0;
        for (const card of cards) {
            if (this._enhanceVersionCard(card, state.versionByDisplayNo)) newlyEnhanced += 1;
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

    _extractTaskKeyFromPath() {
        const path = Context.currentPath || '';
        const match = path.match(TASK_KEY_FROM_PATH_RE);
        if (match) return match[1];
        const segments = path.split('/').filter(Boolean);
        const last = segments[segments.length - 1] || '';
        return /^task_/i.test(last) ? last : '';
    },

    _subscribeVersionCapture(state, context) {
        if (state.networkSubscribed) return;
        const observer = Context.networkObserver;
        if (!observer || typeof observer.subscribe !== 'function') {
            Logger.debug(PLUGIN_ID + ': NetworkObserver unavailable; version capture skipped');
            return;
        }

        const self = this;
        observer.subscribe({
            id: PLUGIN_ID + '-version-capture',
            matches(meta) {
                if (!meta.urlObj) return false;
                const host = meta.urlObj.hostname || '';
                const path = meta.urlObj.pathname || '';
                if (host.endsWith('fleetai.com') && TASK_DATA_PATH_RE.test(path)) return true;
                if (host === 'api.fleetai.com' && path.includes('/rest/v1/eval_task_versions')) return true;
                return false;
            },
            onResponse(meta, response) {
                if (!response || !response.ok) return;
                response.text().then((text) => {
                    try {
                        self._ingestVersionPayload(state, meta, text);
                    } catch (e) {
                        Logger.debug(PLUGIN_ID + ': version response parse failed', e);
                    }
                }).catch(() => { /* ignore */ });
            }
        });

        state.networkSubscribed = true;
        Logger.debug(PLUGIN_ID + ': prompt version network capture subscribed');
    },

    _ingestVersionPayload(state, meta, text) {
        const path = meta.urlObj && meta.urlObj.pathname ? meta.urlObj.pathname : '';
        let added = 0;

        if (path.includes('/rest/v1/eval_task_versions')) {
            added = this._mergeEvalTaskVersionsResponse(state, text);
        } else {
            added = this._mergePromptVersionsFromText(state, text);
        }

        if (added > 0 && !state.captureLogged) {
            state.captureLogged = true;
            Logger.log(PLUGIN_ID + ': captured ' + state.versionByDisplayNo.size + ' display version id(s) from page data');
        }
    },

    _mergeEvalTaskVersionsResponse(state, text) {
        let rows;
        try {
            rows = JSON.parse(text);
        } catch (_e) {
            return 0;
        }
        if (!Array.isArray(rows) || rows.length === 0) return 0;

        const lib = Context.dashboardLib;
        const computed = lib && typeof lib.computeDisplayVersions === 'function'
            ? lib.computeDisplayVersions(rows)
            : this._computeDisplayVersionsFallback(rows);

        let added = 0;
        for (const version of computed) {
            const displayNo = Number(version.displayVersionNo);
            const id = String(version.id || '').trim();
            if (!displayNo || !UUID_RE.test(id)) continue;
            if (state.versionByDisplayNo.get(displayNo) === id) continue;
            state.versionByDisplayNo.set(displayNo, id);
            added += 1;
        }
        return added;
    },

    _computeDisplayVersionsFallback(rawVersions) {
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
                    displayVersionNo: displayNo
                });
                prevPrompt = prompt;
            }
        }
        return result;
    },

    _mergePromptVersionsFromText(state, text) {
        const versions = this._extractPromptVersionsArray(text);
        if (!versions || versions.length === 0) return 0;

        let added = 0;
        for (const version of versions) {
            const displayNo = Number(
                version.display_version_no != null ? version.display_version_no : version.displayVersionNo
            );
            const id = String(version.id || '').trim();
            if (!displayNo || !UUID_RE.test(id)) continue;
            if (state.versionByDisplayNo.get(displayNo) === id) continue;
            state.versionByDisplayNo.set(displayNo, id);
            added += 1;
        }
        return added;
    },

    _extractPromptVersionsArray(text) {
        if (!text) return null;

        try {
            const parsed = JSON.parse(text);
            const fromObj = this._promptVersionsFromObject(parsed);
            if (fromObj) return fromObj;
        } catch (_e) { /* fall through */ }

        const marker = '"prompt_versions"';
        const startIdx = text.indexOf(marker);
        if (startIdx === -1) return null;

        const arrStart = text.indexOf('[', startIdx);
        if (arrStart === -1) return null;

        let depth = 0;
        for (let i = arrStart; i < text.length; i += 1) {
            const ch = text[i];
            if (ch === '[') depth += 1;
            else if (ch === ']') {
                depth -= 1;
                if (depth === 0) {
                    try {
                        const arr = JSON.parse(text.slice(arrStart, i + 1));
                        return Array.isArray(arr) ? arr : null;
                    } catch (_e2) {
                        return null;
                    }
                }
            }
        }
        return null;
    },

    _promptVersionsFromObject(data) {
        if (!data || typeof data !== 'object') return null;
        if (Array.isArray(data.prompt_versions)) return data.prompt_versions;
        if (data.task && Array.isArray(data.task.prompt_versions)) return data.task.prompt_versions;
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

    _enhanceVersionCard(card, versionByDisplayNo) {
        const headerRow = card.querySelector(':scope > div.p-4 > div.mb-3.flex.flex-wrap.items-center.justify-between.gap-2');
        if (!headerRow) return false;

        const metaDiv = headerRow.querySelector(':scope > div.flex.flex-wrap.items-center.gap-x-2.gap-y-1.text-xs.text-muted-foreground');
        if (!metaDiv || metaDiv.querySelector('[' + ENHANCED_ATTR + '="1"]')) return false;

        const displayNo = this._parseDisplayVersionNo(metaDiv);
        if (!displayNo) return false;

        const versionId = versionByDisplayNo.get(displayNo);
        if (!versionId) {
            Logger.debug(PLUGIN_ID + ': no version id for display v' + displayNo);
            return false;
        }

        const actions = document.createElement('span');
        actions.className = 'inline-flex items-center gap-2';
        actions.setAttribute(ENHANCED_ATTR, '1');
        actions.setAttribute('data-fleet-plugin', PLUGIN_ID);
        actions.appendChild(this._createVersionIdCopyButton(versionId, displayNo));
        actions.appendChild(this._createViewTaskLink(versionId, displayNo));
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

    _createViewTaskLink(versionId, displayNo) {
        const link = document.createElement('a');
        link.href = VIEW_TASK_URL_PREFIX + encodeURIComponent(versionId);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className =
            'inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground';
        link.title = 'Open version v' + displayNo + ' in Fleet';
        link.setAttribute('aria-label', 'Open version v' + displayNo + ' in Fleet');
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
        if (!button) return;
        if (button._copySuccessFlashTimeout) {
            clearTimeout(button._copySuccessFlashTimeout);
            button._copySuccessFlashTimeout = null;
        }
        if (button._copyFailurePulseTimeout) {
            clearTimeout(button._copyFailurePulseTimeout);
            button._copyFailurePulseTimeout = null;
        }
        button.style.transition = '';
        button.style.backgroundColor = '';
        button.style.color = '';
    },

    _showCopySuccessFlash(button) {
        this._clearCopyButtonFeedback(button);
        button.style.backgroundColor = COPY_SUCCESS_GREEN_BG;
        button.style.color = '#ffffff';
        button._copySuccessFlashTimeout = setTimeout(() => {
            button.style.backgroundColor = '';
            button.style.color = '';
            button._copySuccessFlashTimeout = null;
        }, COPY_SUCCESS_FLASH_MS);
    },

    _showCopyFailurePulse(button) {
        this._clearCopyButtonFeedback(button);
        const prevTransition = button.style.transition;
        button.style.transition = 'none';
        button.style.backgroundColor = COPY_FAILURE_RED_BG;
        button.style.color = '#ffffff';
        void button.offsetHeight;
        button.style.transition =
            'background-color ' + COPY_FAILURE_PULSE_MS + 'ms ease-out, color ' + COPY_FAILURE_PULSE_MS + 'ms ease-out';
        button.style.backgroundColor = '';
        button.style.color = '';
        button._copyFailurePulseTimeout = setTimeout(() => {
            button.style.transition = prevTransition || '';
            button._copyFailurePulseTimeout = null;
        }, COPY_FAILURE_PULSE_MS);
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
