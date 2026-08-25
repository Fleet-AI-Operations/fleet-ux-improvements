// ============= prompt-text-counter.js (library) =============
// Shared word/character count under editable Prompt / Problem Description fields.

const COUNTER_MARKER = 'data-fleet-prompt-text-counter';
const BOUND_FLAG = 'fleetPromptTextCounterBound';
const PROMPT_LABELS = new Set(['Prompt', 'Problem Description']);

const PromptTextCounterApi = {
    COUNTER_MARKER,

    countText(value) {
        const text = value == null ? '' : String(value);
        const chars = text.length;
        const trimmed = text.trim();
        const words = trimmed ? trimmed.split(/\s+/).length : 0;
        return { words, chars };
    },

    formatCounts(value) {
        const { words, chars } = this.countText(value);
        return `${words} words · ${chars} characters`;
    },

    findPromptTextarea() {
        const form = document.getElementById('problem-form');
        const scopes = form ? [form, document] : [document];
        const seen = new Set();
        for (const scope of scopes) {
            if (seen.has(scope)) continue;
            seen.add(scope);
            const labels = scope.querySelectorAll('.text-sm.text-muted-foreground.font-medium');
            for (const label of labels) {
                const text = (label.textContent || '').replace(/\*/g, '').trim();
                if (!PROMPT_LABELS.has(text)) continue;
                const section = label.closest('.relative.space-y-2') || label.closest('.space-y-2');
                const ta = section && section.querySelector('textarea');
                if (ta) return { textarea: ta, section };
            }
        }
        return null;
    },

    findExisting(root) {
        if (!root) return null;
        return root.querySelector(`[${COUNTER_MARKER}="true"]`);
    },

    syncEl(el, textarea) {
        if (!el || !textarea) return;
        el.textContent = this.formatCounts(textarea.value);
    },

    bindInput(textarea, el) {
        if (!textarea || !el) return;
        if (textarea.dataset[BOUND_FLAG] === '1') return;
        textarea.dataset[BOUND_FLAG] = '1';
        const onInput = () => PromptTextCounterApi.syncEl(el, textarea);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerEventListener) {
            CleanupRegistry.registerEventListener(textarea, 'input', onInput);
        } else {
            textarea.addEventListener('input', onInput);
        }
    },

    buildCounter(textarea) {
        const el = document.createElement('div');
        el.setAttribute(COUNTER_MARKER, 'true');
        el.className = 'text-xs text-muted-foreground';
        el.style.cssText =
            'display:block;text-align:left;margin-top:4px;color:var(--muted-foreground,#64748b);';
        this.syncEl(el, textarea);
        this.bindInput(textarea, el);
        return el;
    },

    /**
     * @param {HTMLTextAreaElement} textarea
     * @param {{ mountParent?: HTMLElement }} [options]
     */
    attach(textarea, options) {
        const opts = options || {};
        const mountParent = opts.mountParent || (textarea && textarea.parentElement);
        if (!textarea || !mountParent) return null;
        const existing = this.findExisting(mountParent);
        if (existing) {
            this.syncEl(existing, textarea);
            this.bindInput(textarea, existing);
            return existing;
        }
        const el = this.buildCounter(textarea);
        mountParent.appendChild(el);
        return el;
    },

    run(state, options) {
        const found = this.findPromptTextarea();
        if (!found) {
            if (state && !state.missingLogged) {
                Logger.debug('prompt textarea not found yet');
                state.missingLogged = true;
            }
            return;
        }
        if (state) state.missingLogged = false;

        const { textarea, section } = found;
        const mountParent = section || textarea.parentElement;
        const existing = this.findExisting(mountParent);

        if (existing && state && state.boundTextarea && state.boundTextarea !== textarea) {
            existing.remove();
        }

        const el = this.attach(textarea, { mountParent });
        if (state) {
            state.boundTextarea = textarea;
            if (!state.activationLogged) {
                Logger.log('prompt text counter mounted');
                state.activationLogged = true;
            }
        }
        return el;
    }
};

const plugin = {
    id: 'promptTextCounterLib',
    name: 'Prompt Text Counter (library)',
    description: 'Shared word and character count for editable prompt textareas',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.promptTextCounter = {
            COUNTER_MARKER,
            countText: (v) => PromptTextCounterApi.countText(v),
            formatCounts: (v) => PromptTextCounterApi.formatCounts(v),
            attach: (textarea, options) => PromptTextCounterApi.attach(textarea, options),
            run: (s, options) => PromptTextCounterApi.run(s, options)
        };
        if (!state.registered) {
            Logger.log('module registered (Context.promptTextCounter)');
            state.registered = true;
        }
    }
};
