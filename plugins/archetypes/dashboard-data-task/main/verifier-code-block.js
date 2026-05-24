// verifier-code-block.js
// When the dashboard task view shows "No verifier", fetch verifier code and render it highlighted.

const TASK_KEY_FROM_PATH_RE = /\/dashboard\/data\/tasks\/(task_[^/?#]+)/i;
const PLUGIN_ID = 'verifier-code-block';
const NO_VERIFIER_TEXT = 'No verifier';
const VERIFIER_LABEL_TEXT = 'Verifier';
const COPY_SUCCESS_FLASH_MS = 1000;
const COPY_SUCCESS_GREEN_BG = 'rgb(34, 197, 94)';
const COPY_FAILURE_PULSE_MS = 500;
const COPY_FAILURE_RED_BG = 'rgb(239, 68, 68)';
const COPY_BTN_CLASS =
    'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground h-7 text-xs pl-2 pr-2 py-1 gap-1.5';
const COPY_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">' +
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>' +
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>' +
    '</svg>';

const plugin = {
    id: PLUGIN_ID,
    name: 'Verifier Code Block',
    description: 'Fetches and displays verifier Python code on dashboard task pages that show "No verifier"',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false,
        fetchStarted: false,
        fetchDone: false,
        taskKey: ''
    },

    onMutation(state, context) {
        if (state.fetchDone || state.fetchStarted) return;

        const slot = this._findNoVerifierSlot();
        if (!slot) {
            if (!state.missingLogged) {
                Logger.debug(PLUGIN_ID + ': waiting for "No verifier" section');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const taskKey = this._extractTaskKeyFromPath();
        if (!taskKey) {
            if (!state.missingLogged) {
                Logger.warn(PLUGIN_ID + ': could not parse task key from URL');
                state.missingLogged = true;
            }
            return;
        }

        if (slot.parent.querySelector('[data-fleet-plugin="' + PLUGIN_ID + '"]')) {
            state.fetchDone = true;
            return;
        }

        state.fetchStarted = true;
        state.taskKey = taskKey;
        void this._fetchAndRender(state, slot, taskKey);
    },

    _extractTaskKeyFromPath() {
        const path = Context.currentPath || '';
        const match = path.match(TASK_KEY_FROM_PATH_RE);
        if (match) return match[1];
        const segments = path.split('/').filter(Boolean);
        const last = segments[segments.length - 1] || '';
        return /^task_/i.test(last) ? last : '';
    },

    _findNoVerifierSlot() {
        const nodes = document.querySelectorAll('div, motion.div');
        for (const el of nodes) {
            if (el.childElementCount !== 0) continue;
            if ((el.textContent || '').trim() !== NO_VERIFIER_TEXT) continue;
            const parent = el.parentElement;
            if (!parent) continue;
            const label = parent.querySelector('.font-medium.mb-2, .text-sm.text-muted-foreground.font-medium.mb-2');
            if (!label || (label.textContent || '').trim() !== VERIFIER_LABEL_TEXT) continue;
            return { parent, placeholder: el, label };
        }
        return null;
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

    _createCopyButton(source) {
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = COPY_BTN_CLASS;
        copyBtn.setAttribute('data-fleet-plugin', PLUGIN_ID);
        copyBtn.setAttribute('data-slot', 'copy-verifier');
        copyBtn.innerHTML = COPY_ICON_SVG + 'Copy';

        copyBtn.addEventListener('click', async () => {
            const ok = await this._copyTextToClipboard(source);
            if (ok) {
                this._showCopySuccessFlash(copyBtn);
                Logger.log(PLUGIN_ID + ': verifier code copied (' + source.length + ' chars)');
            } else {
                this._showCopyFailurePulse(copyBtn);
                Logger.warn(PLUGIN_ID + ': verifier copy failed');
            }
        });

        return copyBtn;
    },

    _attachCopyButtonToVerifierHeader(slot, source) {
        const { parent, label } = slot;
        if (!label || !parent) return;
        if (parent.querySelector('[data-slot="copy-verifier"]')) return;

        const headerRow = document.createElement('div');
        headerRow.className = 'mb-2 flex flex-wrap items-center justify-between gap-2';
        headerRow.setAttribute('data-fleet-plugin', PLUGIN_ID + '-header');

        parent.insertBefore(headerRow, label);
        headerRow.appendChild(label);
        label.classList.remove('mb-2');

        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-1';
        actions.appendChild(this._createCopyButton(source));
        headerRow.appendChild(actions);
    },

    _attachResizeHandle(pre) {
        if (!pre || pre.dataset.wfVerifierResizeAttached === '1') return;

        const defaultMaxHeightPx = 384;
        pre.style.maxHeight = defaultMaxHeightPx + 'px';
        pre.style.overflow = 'auto';

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'wf-verifier-resize-handle';
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

        pre.addEventListener('mouseenter', showHandle);
        pre.addEventListener('mouseleave', (e) => hideHandle(e, resizeHandle));
        resizeHandle.addEventListener('mouseenter', showHandle);
        resizeHandle.addEventListener('mouseleave', (e) => hideHandle(e, pre));
        CleanupRegistry.registerEventListener(pre, 'mouseenter', showHandle);
        CleanupRegistry.registerEventListener(pre, 'mouseleave', (e) => hideHandle(e, resizeHandle));
        CleanupRegistry.registerEventListener(resizeHandle, 'mouseenter', showHandle);
        CleanupRegistry.registerEventListener(resizeHandle, 'mouseleave', (e) => hideHandle(e, pre));

        pre.insertAdjacentElement('afterend', resizeHandle);

        const minHeight = 80;
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

        pre.dataset.wfVerifierResizeAttached = '1';
    },

    async _fetchAndRender(state, slot, taskKey) {
        const opsTab = Context.opsTab;
        if (!opsTab || typeof opsTab.fetchVerifierCode !== 'function') {
            Logger.warn(PLUGIN_ID + ': Context.opsTab.fetchVerifierCode unavailable');
            state.fetchStarted = false;
            return;
        }

        Logger.log(PLUGIN_ID + ': fetching verifier for ' + taskKey);
        try {
            const result = await opsTab.fetchVerifierCode({ taskKey });
            const source = result && result.source;
            if (!source) {
                Logger.warn(PLUGIN_ID + ': fetch returned no source for ' + taskKey);
                state.fetchStarted = false;
                return;
            }

            if (!slot.parent.isConnected || !slot.placeholder.isConnected) {
                Logger.debug(PLUGIN_ID + ': DOM changed before render — skipping');
                return;
            }

            slot.placeholder.classList.add('fleet-wf-hidden-no-verifier');
            slot.placeholder.style.display = 'none';

            this._attachCopyButtonToVerifierHeader(slot, source);

            const wrap = document.createElement('div');
            wrap.setAttribute('data-fleet-plugin', PLUGIN_ID);
            wrap.className = 'fleet-wf-verifier-code-wrap';

            const pre = document.createElement('pre');
            pre.className = 'bg-muted/40 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md p-3 font-mono text-sm text-muted-foreground';

            const code = document.createElement('code');
            code.className = 'language-python';
            code.textContent = source;

            pre.appendChild(code);
            wrap.appendChild(pre);
            slot.parent.appendChild(wrap);

            this._attachResizeHandle(pre);

            if (Context.highlightJs && typeof Context.highlightJs.highlightCodeElement === 'function') {
                await Context.highlightJs.highlightCodeElement(code, { text: source, language: 'python' });
            }

            state.fetchDone = true;
            Logger.log(PLUGIN_ID + ': rendered verifier (' + source.length + ' chars) for ' + taskKey);
        } catch (err) {
            Logger.warn(PLUGIN_ID + ': verifier fetch failed for ' + taskKey, err);
            state.fetchStarted = false;
        }
    }
};
