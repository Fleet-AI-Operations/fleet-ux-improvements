// ============= hide-verifier-output.js =============
// Hide/Show Verifier body on QA Tool Use; auto-show when Run Verifier goes disabled.

const SCOPE = '[data-fleet-plugin="hideVerifierOutput"]';
const HIDDEN_BODY_ATTR = 'data-fleet-verifier-body-hidden';
const SAVED_FLEX_ATTR = 'data-fleet-verifier-saved-flex';

const plugin = {
    id: 'hideVerifierOutput',
    name: 'Hide Verifier Output',
    description:
        'Adds Hide/Show Verifier on the Verifier Output header; hides the output body and collapses the bottom panel until shown or Run Verifier starts',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false,
        hidden: false,
        runBtn: null,
        runObserver: null,
        wasRunDisabled: false
    },

    onMutation(state) {
        const ctx = this.findVerifierContext();
        if (!ctx) {
            this.teardownRunWatch(state);
            if (state.activationLogged || state.hidden) {
                Logger.debug('hideVerifierOutput: Verifier Output pane gone — reset');
            }
            state.missingLogged = false;
            state.activationLogged = false;
            state.hidden = false;
            state.wasRunDisabled = false;
            return;
        }

        state.missingLogged = false;
        this.ensureToggle(ctx, state);
        this.ensureRunWatch(ctx.runBtn, state);

        if (!state.activationLogged) {
            Logger.log('hideVerifierOutput: Hide Verifier control ready');
            state.activationLogged = true;
        }

        this.syncFromRunButton(ctx.runBtn, state);
    },

    findVerifierContext() {
        const buttons = document.querySelectorAll('button');
        let runBtn = null;
        for (const btn of buttons) {
            const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
            if (text === 'Run Verifier' || /^Run Verifier\b/i.test(text)) {
                runBtn = btn;
                break;
            }
        }
        if (!runBtn) return null;

        const toolbar = runBtn.parentElement;
        if (!toolbar) return null;

        const headerRow = toolbar.closest('.h-9.border-b') || toolbar.parentElement;
        if (!headerRow) return null;

        const card = headerRow.parentElement;
        if (!card) return null;

        const headerText = (headerRow.textContent || '');
        if (!/Verifier Output/i.test(headerText)) return null;

        let body = null;
        for (const child of card.children) {
            if (child === headerRow) continue;
            if (child.classList && child.classList.contains('flex-1')) {
                body = child;
                break;
            }
        }
        if (!body) {
            body = headerRow.nextElementSibling;
        }
        if (!body) return null;

        const panel =
            card.closest('#instance-bottom') ||
            card.closest('[data-panel-id="instance-bottom"]') ||
            null;

        return { runBtn, toolbar, headerRow, card, body, panel };
    },

    ensureToggle(ctx, state) {
        const existing = ctx.toolbar.querySelector(
            '[data-fleet-plugin="hideVerifierOutput"][data-slot="hide-verifier-toggle"]'
        );
        if (existing) {
            this.syncToggleLabel(existing, state.hidden);
            return existing;
        }

        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles(SCOPE);
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-fleet-plugin', this.id);
        btn.setAttribute('data-slot', 'hide-verifier-toggle');
        if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
            btn.className = Context.uiLib.btnClass('basic', 'compact');
        } else {
            btn.className =
                'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium h-7 text-xs pl-2 pr-2 py-1';
        }
        btn.style.flexShrink = '0';
        this.syncToggleLabel(btn, state.hidden);

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const live = this.findVerifierContext();
            if (!live) return;
            if (state.hidden) {
                this.showVerifier(live, state, 'click');
            } else {
                this.hideVerifier(live, state, 'click');
            }
            this.syncToggleLabel(btn, state.hidden);
        });

        ctx.toolbar.insertBefore(btn, ctx.runBtn);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerElement) {
            CleanupRegistry.registerElement(btn);
        }
        Logger.log('hideVerifierOutput: toggle injected before Run Verifier');
        return btn;
    },

    syncToggleLabel(btn, hidden) {
        const label = hidden ? 'Show Verifier' : 'Hide Verifier';
        btn.textContent = label;
        btn.setAttribute('aria-label', label);
        btn.title = label;
    },

    hideVerifier(ctx, state, reason) {
        if (state.hidden) return;
        ctx.body.style.display = 'none';
        ctx.body.setAttribute(HIDDEN_BODY_ATTR, '1');

        if (ctx.panel) {
            if (!ctx.panel.hasAttribute(SAVED_FLEX_ATTR)) {
                ctx.panel.setAttribute(SAVED_FLEX_ATTR, ctx.panel.style.flex || '');
            }
            ctx.panel.style.flex = '0 0 auto';
            ctx.panel.style.overflow = 'hidden';
        }

        state.hidden = true;
        Logger.log(`hideVerifierOutput: hidden (${reason})`);
    },

    showVerifier(ctx, state, reason) {
        if (!state.hidden && ctx.body.style.display !== 'none') {
            return;
        }

        ctx.body.style.display = '';
        ctx.body.removeAttribute(HIDDEN_BODY_ATTR);

        if (ctx.panel && ctx.panel.hasAttribute(SAVED_FLEX_ATTR)) {
            const saved = ctx.panel.getAttribute(SAVED_FLEX_ATTR);
            ctx.panel.style.flex = saved || '';
            ctx.panel.removeAttribute(SAVED_FLEX_ATTR);
        }

        state.hidden = false;
        const toggle = ctx.toolbar.querySelector(
            '[data-fleet-plugin="hideVerifierOutput"][data-slot="hide-verifier-toggle"]'
        );
        if (toggle) this.syncToggleLabel(toggle, false);
        Logger.log(`hideVerifierOutput: shown (${reason})`);
    },

    ensureRunWatch(runBtn, state) {
        if (state.runBtn === runBtn && state.runObserver) return;

        this.teardownRunWatch(state);
        state.runBtn = runBtn;
        state.wasRunDisabled = Boolean(runBtn.disabled);

        const self = this;
        const observer = new MutationObserver(() => {
            self.syncFromRunButton(runBtn, state);
        });
        observer.observe(runBtn, {
            attributes: true,
            attributeFilter: ['disabled', 'class', 'aria-disabled']
        });
        state.runObserver = observer;
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerObserver) {
            CleanupRegistry.registerObserver(observer);
        }
    },

    syncFromRunButton(runBtn, state) {
        if (!runBtn || !runBtn.isConnected) return;
        const disabled = Boolean(runBtn.disabled) || runBtn.getAttribute('aria-disabled') === 'true';
        const becameDisabled = disabled && !state.wasRunDisabled;
        state.wasRunDisabled = disabled;

        if (!becameDisabled || !state.hidden) return;

        const ctx = this.findVerifierContext();
        if (!ctx) return;
        this.showVerifier(ctx, state, 'run-verifier-disabled');
    },

    teardownRunWatch(state) {
        if (state.runObserver) {
            try {
                state.runObserver.disconnect();
            } catch (e) {
                /* ignore */
            }
            state.runObserver = null;
        }
        state.runBtn = null;
    }
};
