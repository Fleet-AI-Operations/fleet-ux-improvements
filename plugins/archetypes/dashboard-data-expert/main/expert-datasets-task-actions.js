// expert-datasets-task-actions.js
// Expert profile Datasets tab: copy task ID from the title row and open task view in a new tab.

const PLUGIN_ID = 'expert-datasets-task-actions';
const TASK_KEY_RE = /^task_[A-Za-z0-9_]+$/;
const OPS_TASK_URL_PREFIX = 'https://www.fleetai.com/dashboard/data/tasks/';
const ROW_ENHANCED_ATTR = 'data-fleet-expert-datasets-enhanced';
const COPY_BTN_ATTR = 'data-fleet-expert-datasets-copy';
const OPEN_BTN_ATTR = 'data-fleet-expert-datasets-open';
const COPY_SUCCESS_FLASH_MS = 300;
const COPY_SUCCESS_GREEN_BG = 'rgb(34, 197, 94)';
const COPY_FAILURE_PULSE_MS = 500;
const COPY_FAILURE_RED_BG = 'rgb(239, 68, 68)';
const EXTERNAL_LINK_PATH_SNIPPET = 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6';

const plugin = {
    id: PLUGIN_ID,
    name: 'Expert Datasets Task Actions',
    description:
        'On expert profile Datasets tab, copy task IDs from task titles and open dashboard task view in a new tab',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false,
        activationLogged: false,
        enhancedCount: 0
    },

    onMutation(state) {
        const tables = this._findDatasetsTaskTables();
        if (!tables.length) {
            if (!state.missingLogged) {
                Logger.debug(PLUGIN_ID + ': waiting for Datasets task table');
                state.missingLogged = true;
            }
            if (state.activationLogged) {
                Logger.debug(PLUGIN_ID + ': Datasets task table no longer present');
                state.activationLogged = false;
                state.enhancedCount = 0;
            }
            return;
        }

        state.missingLogged = false;

        let newlyEnhanced = 0;
        tables.forEach((table) => {
            newlyEnhanced += this._enhanceTableRows(table);
        });

        if (newlyEnhanced > 0) {
            state.enhancedCount += newlyEnhanced;
            if (!state.activationLogged) {
                Logger.log(PLUGIN_ID + ': enhancing Datasets task rows');
                state.activationLogged = true;
            }
            Logger.debug(PLUGIN_ID + ': enhanced ' + newlyEnhanced + ' row(s), total ' + state.enhancedCount);
        }
    },

    _findDatasetsTaskTables() {
        const tables = [];
        document.querySelectorAll('table').forEach((table) => {
            if (!this._isDatasetsTaskTable(table)) return;
            tables.push(table);
        });
        return tables;
    },

    _isDatasetsTaskTable(table) {
        const theadRow = table.tHead && table.tHead.rows[0];
        if (!theadRow) return false;

        for (let i = 0; i < theadRow.cells.length; i++) {
            const text = (theadRow.cells[i].textContent || '').trim();
            if (/^task$/i.test(text)) return true;
        }
        return false;
    },

    _enhanceTableRows(table) {
        const rows = table.tBodies.length ? Array.from(table.tBodies[0].rows) : [];
        let count = 0;
        rows.forEach((row) => {
            if (row.getAttribute(ROW_ENHANCED_ATTR) === '1') return;
            const taskKey = this._extractTaskKeyFromRow(row);
            if (!taskKey) return;

            const copyOk = this._enhanceTaskIdCopy(row, taskKey);
            const openOk = this._enhanceOpenTaskButton(row, taskKey);
            if (!copyOk && !openOk) return;

            row.setAttribute(ROW_ENHANCED_ATTR, '1');
            count += 1;
        });
        return count;
    },

    _findTaskIdTitleEl(row) {
        const existing = row.querySelector('.max-w-md [' + COPY_BTN_ATTR + '="1"]');
        if (existing) return null;
        const titleEl = row.querySelector('.max-w-md .font-medium.text-sm.mb-1');
        if (titleEl && titleEl.getAttribute(COPY_BTN_ATTR) === '1') return null;
        return titleEl;
    },

    _extractTaskKeyFromRow(row) {
        const copyBtn = row.querySelector('.max-w-md [' + COPY_BTN_ATTR + '="1"]');
        if (copyBtn) {
            const text = (copyBtn.textContent || '').trim();
            return TASK_KEY_RE.test(text) ? text : '';
        }
        const titleEl = row.querySelector('.max-w-md .font-medium.text-sm.mb-1');
        if (!titleEl) return '';
        const text = (titleEl.textContent || '').trim();
        return TASK_KEY_RE.test(text) ? text : '';
    },

    _enhanceTaskIdCopy(row, taskKey) {
        const titleEl = this._findTaskIdTitleEl(row);
        if (!titleEl) return false;

        const wrapper = document.createElement('div');
        wrapper.className =
            'mb-1 rounded-sm -mx-1 px-1 py-0.5 transition-colors duration-150 hover:bg-muted';

        const button = document.createElement('button');
        button.type = 'button';
        button.className =
            'font-medium text-sm text-left cursor-pointer w-full block bg-transparent border-0 p-0';
        button.textContent = taskKey;
        button.title = 'Copy task ID';
        button.setAttribute('aria-label', 'Copy task ID');
        button.setAttribute(COPY_BTN_ATTR, '1');
        button.setAttribute('data-fleet-plugin', PLUGIN_ID);

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void this._copyTaskId(button, taskKey);
        });

        wrapper.appendChild(button);
        titleEl.replaceWith(wrapper);
        return true;
    },

    _enhanceOpenTaskButton(row, taskKey) {
        const actionCell = row.cells[row.cells.length - 1];
        if (!actionCell) return false;

        const originalBtn = this._findExternalLinkButton(actionCell);
        if (!originalBtn) return false;
        if (actionCell.querySelector('[' + OPEN_BTN_ATTR + '="1"]')) return true;

        originalBtn.style.display = 'none';
        originalBtn.setAttribute('aria-hidden', 'true');
        originalBtn.tabIndex = -1;

        const replacement = originalBtn.cloneNode(true);
        replacement.removeAttribute('style');
        replacement.removeAttribute('aria-hidden');
        replacement.tabIndex = 0;
        replacement.setAttribute(OPEN_BTN_ATTR, '1');
        replacement.setAttribute('data-fleet-plugin', PLUGIN_ID);
        replacement.title = 'Open task in new tab';
        replacement.setAttribute('aria-label', 'Open task in new tab');

        replacement.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._openTaskInNewTab(taskKey);
        });

        actionCell.appendChild(replacement);
        return true;
    },

    _findExternalLinkButton(root) {
        const buttons = root.querySelectorAll('button');
        for (const btn of buttons) {
            if (btn.getAttribute(OPEN_BTN_ATTR) === '1') continue;
            const path = btn.querySelector('path[d*="' + EXTERNAL_LINK_PATH_SNIPPET + '"]');
            if (path) return btn;
        }
        return null;
    },

    /** Same URL as ops-tab.js "Open in New Tab" (OPS_TASK_URL_PREFIX + task key). */
    _buildTaskUrl(taskKey) {
        const key = (taskKey || '').trim();
        if (TASK_KEY_RE.test(key)) return OPS_TASK_URL_PREFIX + key;
        return null;
    },

    _openTaskInNewTab(taskKey) {
        const url = this._buildTaskUrl(taskKey);
        if (!url) {
            Logger.warn(PLUGIN_ID + ': could not build task URL for ' + taskKey);
            return;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
        Logger.log(PLUGIN_ID + ': opened task in new tab');
    },

    _copyFeedbackTarget(button) {
        const wrapper = button && button.parentElement;
        if (wrapper && wrapper.querySelector('[' + COPY_BTN_ATTR + '="1"]') === button) return wrapper;
        return button;
    },

    _clearCopyFeedback(button) {
        if (!button) return;
        if (button._copySuccessFlashTimeout) {
            clearTimeout(button._copySuccessFlashTimeout);
            button._copySuccessFlashTimeout = null;
        }
        if (button._copyFailurePulseTimeout) {
            clearTimeout(button._copyFailurePulseTimeout);
            button._copyFailurePulseTimeout = null;
        }
        const target = this._copyFeedbackTarget(button);
        if (target) {
            target.style.transition = '';
            target.style.backgroundColor = '';
        }
        button.style.color = '';
    },

    _showCopySuccessFlash(button) {
        this._clearCopyFeedback(button);
        const target = this._copyFeedbackTarget(button);
        target.style.transition =
            'background-color ' + COPY_SUCCESS_FLASH_MS + 'ms ease-out, color ' + COPY_SUCCESS_FLASH_MS + 'ms ease-out';
        target.style.backgroundColor = COPY_SUCCESS_GREEN_BG;
        button.style.color = '#ffffff';
        button._copySuccessFlashTimeout = setTimeout(() => {
            target.style.backgroundColor = '';
            target.style.transition = '';
            button.style.color = '';
            button._copySuccessFlashTimeout = null;
        }, COPY_SUCCESS_FLASH_MS);
    },

    _showCopyFailurePulse(button) {
        this._clearCopyFeedback(button);
        const target = this._copyFeedbackTarget(button);
        const prevTransition = target.style.transition;
        target.style.transition = 'none';
        target.style.backgroundColor = COPY_FAILURE_RED_BG;
        button.style.color = '#ffffff';
        void target.offsetHeight;
        target.style.transition =
            'background-color ' + COPY_FAILURE_PULSE_MS + 'ms ease-out, color ' + COPY_FAILURE_PULSE_MS + 'ms ease-out';
        target.style.backgroundColor = '';
        button.style.color = '';
        button._copyFailurePulseTimeout = setTimeout(() => {
            target.style.transition = prevTransition || '';
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
        } catch (_e) {
            /* fall through */
        }
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

    async _copyTaskId(button, taskKey) {
        const ok = await this._copyTextToClipboard(taskKey);
        if (ok) {
            this._showCopySuccessFlash(button);
            Logger.log(PLUGIN_ID + ': copied task ID (' + taskKey.length + ' chars)');
        } else {
            this._showCopyFailurePulse(button);
            Logger.warn(PLUGIN_ID + ': task ID copy failed');
        }
    }
};
