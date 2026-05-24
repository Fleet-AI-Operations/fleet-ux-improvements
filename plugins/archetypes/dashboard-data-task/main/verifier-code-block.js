// verifier-code-block.js
// When the dashboard task view shows "No verifier", fetch verifier code and render it highlighted.

const TASK_KEY_FROM_PATH_RE = /\/dashboard\/data\/tasks\/(task_[^/?#]+)/i;
const PLUGIN_ID = 'verifier-code-block';
const NO_VERIFIER_TEXT = 'No verifier';
const VERIFIER_LABEL_TEXT = 'Verifier';

const plugin = {
    id: PLUGIN_ID,
    name: 'Verifier Code Block',
    description: 'Fetches and displays verifier Python code on dashboard task pages that show "No verifier"',
    _version: '1.0',
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
            return { parent, placeholder: el };
        }
        return null;
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
