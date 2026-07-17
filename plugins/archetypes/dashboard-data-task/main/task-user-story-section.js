// task-user-story-section.js
// Dashboard task detail: fetch and show user story between Project and Contributors.

const TASK_KEY_FROM_PATH_RE = /\/dashboard\/data\/tasks\/(task_[^/?#]+)/i;
const PLUGIN_ID = 'task-user-story-section';
const SECTION_LABEL = 'User Story';
const VISIBLE_LINES_DEFAULT = 6;
const COPY_BTN_CLASS =
    'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground h-7 text-xs pl-2 pr-2 py-1 gap-1.5';
const COPY_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">' +
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>' +
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>' +
    '</svg>';
const OPS_BUNDLE_WAIT_TIMEOUT_MS = 30000;

const plugin = {
    id: PLUGIN_ID,
    name: 'Task User Story Section',
    description: 'Shows task user story between Project and Contributors with markdown rendering, copy and vertical resize',
    _version: '2.3',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        taskKey: '',
        fetchStarted: false,
        fetchDone: false,
        bundleWaitStarted: false,
        bundleUnavailable: false,
        missingAnchorLogged: false,
        activationLogged: false
    },

    onMutation(state) {
        const taskKey = this._extractTaskKeyFromPath();
        if (!taskKey) return;

        if (taskKey !== state.taskKey) {
            this._removeInjectedSections();
            state.taskKey = taskKey;
            state.fetchStarted = false;
            state.fetchDone = false;
            state.bundleWaitStarted = false;
            state.bundleUnavailable = false;
            state.missingAnchorLogged = false;
            state.activationLogged = false;
        }

        if (state.fetchDone || state.bundleUnavailable) return;

        const anchor = this._findInsertAnchor();
        if (!anchor) {
            if (!state.missingAnchorLogged) {
                Logger.debug(PLUGIN_ID + ': waiting for Project / Contributors sections');
                state.missingAnchorLogged = true;
            }
            return;
        }
        state.missingAnchorLogged = false;

        if (anchor.insertBefore.querySelector('[data-fleet-plugin="' + PLUGIN_ID + '"]')) {
            state.fetchDone = true;
            return;
        }

        if (state.fetchStarted || state.bundleWaitStarted) return;

        if (!this._ensureOpsBundleReady(state)) return;

        state.fetchStarted = true;

        const shell = this._createSectionShell(taskKey);
        anchor.insertBefore.parentElement.insertBefore(shell, anchor.insertBefore);
        void this._fetchAndRender(state, shell, taskKey);
    },

    _ensureOpsBundleReady(state) {
        const opsTab = Context.opsTab;
        if (!opsTab) return false;
        if (typeof opsTab.isOpsBundleReady === 'function' && opsTab.isOpsBundleReady()) {
            return true;
        }
        if (state.bundleWaitStarted) return false;
        if (typeof opsTab.whenOpsBundleReady !== 'function') {
            state.bundleUnavailable = true;
            return false;
        }
        state.bundleWaitStarted = true;
        void opsTab.whenOpsBundleReady({ timeoutMs: OPS_BUNDLE_WAIT_TIMEOUT_MS })
            .then(() => {
                state.bundleWaitStarted = false;
            })
            .catch((err) => {
                state.bundleWaitStarted = false;
                state.bundleUnavailable = true;
                Logger.warn(PLUGIN_ID + ': ops bundle unavailable', err);
            });
        return false;
    },

    _isTransientBundleError(err) {
        const opsTab = Context.opsTab;
        return !!(opsTab && typeof opsTab.isOpsBundleNotLoadedError === 'function'
            && opsTab.isOpsBundleNotLoadedError(err));
    },

    _extractTaskKeyFromPath() {
        const path = Context.currentPath || '';
        const match = path.match(TASK_KEY_FROM_PATH_RE);
        if (match) return match[1];
        const segments = path.split('/').filter(Boolean);
        const last = segments[segments.length - 1] || '';
        return /^task_/i.test(last) ? last : '';
    },

    _removeInjectedSections() {
        document.querySelectorAll('[data-fleet-plugin="' + PLUGIN_ID + '"]').forEach((el) => el.remove());
    },

    _findFieldLabel(labelText) {
        const labels = document.querySelectorAll(
            'div.text-sm.text-muted-foreground.font-medium, div.font-medium.text-sm.text-muted-foreground, div.font-medium.mb-2'
        );
        for (const label of labels) {
            if ((label.textContent || '').trim() !== labelText) continue;
            return label;
        }
        return null;
    },

    _fieldBlockFromLabel(label) {
        if (!label || !label.parentElement) return null;
        return label.parentElement;
    },

    _findInsertAnchor() {
        const projectLabel = this._findFieldLabel('Project');
        const contributorsLabel = this._findFieldLabel('Contributors');
        if (!projectLabel || !contributorsLabel) return null;

        const projectBlock = this._fieldBlockFromLabel(projectLabel);
        const contributorsBlock = this._fieldBlockFromLabel(contributorsLabel);
        if (!projectBlock || !contributorsBlock) return null;
        if (projectBlock.parentElement !== contributorsBlock.parentElement) return null;

        const order = projectBlock.compareDocumentPosition(contributorsBlock);
        if (!(order & Node.DOCUMENT_POSITION_FOLLOWING)) return null;

        return { insertBefore: contributorsBlock, projectBlock };
    },

    _createSectionShell(taskKey) {
        const section = document.createElement('div');
        section.setAttribute('data-fleet-plugin', PLUGIN_ID);
        section.setAttribute('data-fleet-task-key', taskKey);
        section.className = 'rounded-md border border-border p-3';

        const headerRow = document.createElement('div');
        headerRow.className = 'mb-2 flex flex-wrap items-center gap-1.5';

        const label = document.createElement('div');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = SECTION_LABEL;

        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-1';
        actions.setAttribute('data-slot', 'actions');

        headerRow.appendChild(label);
        headerRow.appendChild(actions);
        section.appendChild(headerRow);

        const bodyWrap = document.createElement('div');
        bodyWrap.className = 'relative';
        bodyWrap.setAttribute('data-slot', 'body');

        const content = document.createElement('div');
        content.className =
            'bg-muted/40 overflow-auto whitespace-pre-wrap break-words rounded-md p-3 text-sm text-muted-foreground';
        content.setAttribute('data-slot', 'content');
        content.textContent = 'Loading user story…';

        bodyWrap.appendChild(content);
        section.appendChild(bodyWrap);

        return section;
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

    _createCopyButton(source, fieldLabel) {
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = COPY_BTN_CLASS;
        copyBtn.setAttribute('data-fleet-plugin', PLUGIN_ID);
        copyBtn.setAttribute('data-slot', 'copy-user-story');
        const title = fieldLabel ? 'Copy ' + fieldLabel : 'Copy user story';
        copyBtn.title = title;
        copyBtn.setAttribute('aria-label', title);
        copyBtn.innerHTML = COPY_ICON_SVG;

        copyBtn.addEventListener('click', async () => {
            const ok = await this._copyTextToClipboard(source);
            if (ok) {
                this._showCopySuccessFlash(copyBtn);
                Logger.log(PLUGIN_ID + ': copied ' + (fieldLabel || 'user story') + ' (' + source.length + ' chars)');
            } else {
                this._showCopyFailurePulse(copyBtn);
                Logger.warn(PLUGIN_ID + ': copy failed for ' + (fieldLabel || 'user story'));
            }
        });

        return copyBtn;
    },

    _defaultHeightPx(pre, lineCount) {
        const style = window.getComputedStyle(pre);
        const fontSize = parseFloat(style.fontSize) || 14;
        let lineHeight = parseFloat(style.lineHeight);
        if (!Number.isFinite(lineHeight)) lineHeight = fontSize * 1.5;
        const paddingTop = parseFloat(style.paddingTop) || 0;
        const paddingBottom = parseFloat(style.paddingBottom) || 0;
        return Math.round(lineHeight * lineCount + paddingTop + paddingBottom);
    },

    _attachResizeHandle(pre) {
        if (!pre || pre.dataset.wfUserStoryResizeAttached === '1') return;

        const defaultHeightPx = this._defaultHeightPx(pre, VISIBLE_LINES_DEFAULT);
        pre.style.maxHeight = defaultHeightPx + 'px';
        pre.style.overflow = 'auto';

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'wf-user-story-resize-handle';
        resizeHandle.setAttribute('data-fleet-plugin', PLUGIN_ID);
        resizeHandle.setAttribute('data-slot', 'resize-handle');
        Object.assign(resizeHandle.style, {
            height: '8px',
            cursor: 'ns-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: '0',
            transition: 'opacity 0.15s',
            userSelect: 'none',
            color: 'var(--muted-foreground, #666)'
        });

        const handleBar = document.createElement('div');
        Object.assign(handleBar.style, {
            width: '40px',
            height: '3px',
            borderRadius: '1.5px',
            backgroundColor: 'currentColor',
            opacity: '0.3'
        });
        resizeHandle.appendChild(handleBar);

        const showHandle = () => { resizeHandle.style.opacity = '1'; };
        const hideHandle = (e, partner) => {
            if (!e.relatedTarget || !partner.contains(e.relatedTarget)) {
                resizeHandle.style.opacity = '0';
            }
        };

        CleanupRegistry.registerEventListener(pre, 'mouseenter', showHandle);
        CleanupRegistry.registerEventListener(pre, 'mouseleave', (e) => hideHandle(e, resizeHandle));
        CleanupRegistry.registerEventListener(resizeHandle, 'mouseenter', showHandle);
        CleanupRegistry.registerEventListener(resizeHandle, 'mouseleave', (e) => hideHandle(e, pre));

        pre.insertAdjacentElement('afterend', resizeHandle);

        const minHeight = 48;
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const newHeight = Math.max(minHeight, startHeight + (e.clientY - startY));
            pre.style.maxHeight = newHeight + 'px';
        };

        const handleMouseUp = () => {
            if (!isResizing) return;
            const endHeight = pre.offsetHeight;
            if (endHeight !== startHeight) {
                Logger.log(PLUGIN_ID + ': resize ' + startHeight + 'px→' + endHeight + 'px');
            }
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = pre.offsetHeight;
            e.preventDefault();
            e.stopPropagation();
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        };

        resizeHandle.addEventListener('mousedown', handleMouseDown);
        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);

        pre.dataset.wfUserStoryResizeAttached = '1';
    },

    _scenarioFieldsFromResult(result) {
        return {
            scenarioTitle: result && result.scenarioTitle != null ? String(result.scenarioTitle).trim() : '',
            humanAnnotatorInstructions: result && result.humanAnnotatorInstructions != null
                ? String(result.humanAnnotatorInstructions).trim()
                : '',
            userStory: result && result.userStory != null ? String(result.userStory).trim() : ''
        };
    },

    _hasScenarioContent(fields) {
        return Boolean(fields.scenarioTitle || fields.humanAnnotatorInstructions || fields.userStory);
    },

    _scenarioEmptyMessage(reason) {
        if (reason === 'no_scenario_id') return 'No scenario linked to this task.';
        if (reason === 'scenario_not_found') return 'Scenario not found.';
        if (reason === 'task_not_found') return 'Task not found.';
        return 'No user story for this task.';
    },

    _scenarioCopyText(fields) {
        const blocks = [];
        if (fields.scenarioTitle) blocks.push('# Scenario Title\n' + fields.scenarioTitle);
        if (fields.humanAnnotatorInstructions) {
            blocks.push('# Annotator Instructions\n' + fields.humanAnnotatorInstructions);
        }
        if (fields.userStory) blocks.push('# User Story\n' + fields.userStory);
        return blocks.join('\n\n---\n\n');
    },

    _createFieldHeader(label) {
        const header = document.createElement('div');
        header.className = 'mb-1 flex items-center gap-1.5';
        const fieldLabel = document.createElement('div');
        fieldLabel.className = 'text-sm text-muted-foreground font-medium';
        fieldLabel.textContent = label;
        header.appendChild(fieldLabel);
        return header;
    },

    _createFieldBody(value) {
        const body = document.createElement('div');
        const md = Context.userStoryMarkdown;
        if (md && typeof md.markdownToHtml === 'function') {
            body.className =
                'break-words border-l-[3px] border-border pl-3 pt-1.5 pb-0.5 text-sm text-muted-foreground';
            if (typeof md.ensureProseStyles === 'function') md.ensureProseStyles();
            body.setAttribute(md.PROSE_ATTR || 'data-fleet-user-story-prose', '');
            body.innerHTML = md.markdownToHtml(value);
            return body;
        }
        body.className =
            'whitespace-pre-wrap break-words border-l-[3px] border-border pl-3 pt-1.5 pb-0.5 text-sm text-muted-foreground';
        body.textContent = value;
        return body;
    },

    async _fetchAndRender(state, shell, taskKey) {
        const opsTab = Context.opsTab;
        if (!opsTab || typeof opsTab.fetchTaskUserStory !== 'function') {
            Logger.warn(PLUGIN_ID + ': Context.opsTab.fetchTaskUserStory unavailable');
            this._setSectionMessage(shell, 'User story unavailable (ops module not loaded).');
            state.fetchStarted = false;
            return;
        }

        Logger.log(PLUGIN_ID + ': fetching user story for ' + taskKey);
        try {
            if (typeof opsTab.whenOpsBundleReady === 'function') {
                await opsTab.whenOpsBundleReady({ timeoutMs: OPS_BUNDLE_WAIT_TIMEOUT_MS });
            }
            const result = await opsTab.fetchTaskUserStory({ taskKey });
            if (!shell.isConnected) {
                Logger.debug(PLUGIN_ID + ': section removed before render');
                return;
            }

            const fields = this._scenarioFieldsFromResult(result);
            if (!this._hasScenarioContent(fields)) {
                const reason = result && result.reason ? result.reason : 'empty';
                this._setSectionMessage(shell, this._scenarioEmptyMessage(reason));
                state.fetchDone = true;
                Logger.warn(PLUGIN_ID + ': no user story for ' + taskKey + ' (' + reason + ')');
                return;
            }

            this._renderScenarioContent(shell, fields);
            state.fetchDone = true;
            if (!state.activationLogged) {
                Logger.log(PLUGIN_ID + ': user story section active for ' + taskKey);
                state.activationLogged = true;
            }
            const summary = [
                fields.scenarioTitle ? 'title ' + fields.scenarioTitle.length + ' chars' : null,
                fields.humanAnnotatorInstructions ? 'instructions ' + fields.humanAnnotatorInstructions.length + ' chars' : null,
                fields.userStory ? 'story ' + fields.userStory.length + ' chars' : null
            ].filter(Boolean).join(', ');
            Logger.log(PLUGIN_ID + ': rendered scenario content for ' + taskKey + ' (' + summary + ')');
        } catch (err) {
            if (this._isTransientBundleError(err)) {
                state.fetchStarted = false;
                if (shell.isConnected) shell.remove();
                return;
            }
            if (shell.isConnected) {
                const msg = opsTab.isSessionRefreshRequiredError && opsTab.isSessionRefreshRequiredError(err)
                    ? 'Session expired — refresh Fleet and unlock Ops, then reload.'
                    : 'Could not load user story.';
                this._setSectionMessage(shell, msg);
            }
            Logger.warn(PLUGIN_ID + ': user story fetch failed for ' + taskKey, err);
            state.fetchStarted = false;
        }
    },

    _setSectionMessage(shell, message) {
        const content = shell.querySelector('[data-slot="content"]');
        const actions = shell.querySelector('[data-slot="actions"]');
        if (content) {
            content.textContent = message;
            content.className =
                'bg-muted/40 overflow-auto whitespace-pre-wrap break-words rounded-md p-3 text-sm text-muted-foreground';
        }
        if (actions) actions.replaceChildren();
    },

    _renderScenarioContent(shell, fields) {
        const content = shell.querySelector('[data-slot="content"]');
        const actions = shell.querySelector('[data-slot="actions"]');
        if (!content || !actions) return;

        content.className = 'overflow-auto break-words space-y-3.5';
        content.replaceChildren();

        const fieldDefs = [
            { key: 'scenarioTitle', label: 'Scenario Title' },
            { key: 'humanAnnotatorInstructions', label: 'Annotator Instructions' },
            { key: 'userStory', label: 'User Story' }
        ];
        for (const { key, label } of fieldDefs) {
            const value = fields[key];
            if (!value) continue;
            const block = document.createElement('div');
            block.appendChild(this._createFieldHeader(label));
            block.appendChild(this._createFieldBody(value));
            content.appendChild(block);
        }

        actions.replaceChildren(this._createCopyButton(this._scenarioCopyText(fields), SECTION_LABEL));
        this._attachResizeHandle(content);
    }
};
