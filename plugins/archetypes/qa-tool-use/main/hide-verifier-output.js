// ============= hide-verifier-output.js =============
// Hide/Show Verifier body on QA Tool Use; auto-show when Run Verifier goes disabled.

const SCOPE = '[data-fleet-hide-verifier="1"]';
const TOOLBAR_ATTR = 'data-fleet-hide-verifier';
const HIDDEN_BODY_ATTR = 'data-fleet-verifier-body-hidden';
const SAVED_FLEX_ATTR = 'data-fleet-verifier-saved-flex';

const plugin = {
    id: 'hideVerifierOutput',
    name: 'Hide Verifier Output',
    description:
        'Adds Hide/Show Verifier on the Verifier Output header; hides the output body and collapses the bottom panel until shown or Run Verifier starts',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false,
        hidden: false,
        runBtn: null,
        runObserver: null,
        wasRunDisabled: false,
        bodyEl: null,
        panelEl: null,
        toolbarEl: null
    },

    onMutation(state) {
        const ctx = this.findVerifierContext();
        if (!ctx) {
            this.resetPane(state);
            return;
        }

        state.missingLogged = false;
        this.storeCtxRefs(ctx, state);
        this.ensureToggle(ctx, state);
        this.ensureRunWatch(ctx.runBtn, state);

        if (!state.activationLogged) {
            Logger.log('hideVerifierOutput: Hide Verifier control ready');
            state.activationLogged = true;
        }

        this.syncFromRunButton(ctx.runBtn, state);
    },

    resetPane(state) {
        this.teardownRunWatch(state);
        if (state.toolbarEl && state.toolbarEl.isConnected) {
            state.toolbarEl.removeAttribute(TOOLBAR_ATTR);
        }
        if (state.activationLogged || state.hidden) {
            Logger.debug('hideVerifierOutput: Verifier Output pane gone — reset');
        }
        state.missingLogged = false;
        state.activationLogged = false;
        state.hidden = false;
        state.wasRunDisabled = false;
        state.bodyEl = null;
        state.panelEl = null;
        state.toolbarEl = null;
    },

    storeCtxRefs(ctx, state) {
        state.bodyEl = ctx.body;
        state.panelEl = ctx.panel;
        state.toolbarEl = ctx.toolbar;
    },

    isRunVerifierButton(btn) {
        const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
        return text === 'Run Verifier' || /^Run Verifier\b/i.test(text);
    },

    findRunVerifierButton(root) {
        const scope = root || document;
        const buttons = scope.querySelectorAll ? scope.querySelectorAll('button') : [];
        for (const btn of buttons) {
            if (this.isRunVerifierButton(btn)) return btn;
        }
        return null;
    },

    findInstanceBottom(fromEl) {
        if (!fromEl || !fromEl.closest) return null;
        return (
            fromEl.closest('#instance-bottom') ||
            fromEl.closest('[data-panel-id="instance-bottom"]') ||
            null
        );
    },

    /**
     * Body must be the flex-1 sibling under the Verifier Output card inside
     * #instance-bottom — never a page-level flex-1 (e.g. #instance-top).
     */
    resolveHeaderAndBody(toolbar) {
        const panel = this.findInstanceBottom(toolbar);
        if (!panel) return null;

        let headerRow = toolbar.closest('.h-9.border-b');
        if (!headerRow || !panel.contains(headerRow)) {
            headerRow = null;
            const candidates = panel.querySelectorAll('.border-b');
            for (const el of candidates) {
                if (!el.contains(toolbar)) continue;
                if (!/Verifier Output/i.test(el.textContent || '')) continue;
                headerRow = el;
                break;
            }
        }
        if (!headerRow || !panel.contains(headerRow)) return null;
        if (!/Verifier Output/i.test(headerRow.textContent || '')) return null;

        const card = headerRow.parentElement;
        if (!card || !panel.contains(card)) return null;

        let body = null;
        for (const child of card.children) {
            if (child === headerRow) continue;
            if (child.classList && child.classList.contains('flex-1')) {
                body = child;
                break;
            }
        }
        if (!body) body = headerRow.nextElementSibling;

        if (!body || !panel.contains(body)) return null;
        // Must be a sibling region, not an ancestor wrapping the header/toolbar
        if (body.contains(headerRow) || body.contains(toolbar)) return null;
        // Never hide the workflow pane or page chrome
        if (body.id === 'instance-top' || body.querySelector('#instance-top, [data-ui="qa-header"]')) {
            return null;
        }

        return { headerRow, card, body, panel };
    },

    findVerifierContext() {
        const runBtn = this.findRunVerifierButton(document);
        if (!runBtn) return null;

        const toolbar = runBtn.parentElement;
        if (!toolbar) return null;

        const resolved = this.resolveHeaderAndBody(toolbar);
        if (!resolved) return null;

        return { runBtn, toolbar, ...resolved };
    },

    isSafeBodyRef(body, panel) {
        return Boolean(
            body &&
                body.isConnected &&
                panel &&
                panel.isConnected &&
                panel.contains(body) &&
                body.id !== 'instance-top' &&
                !body.querySelector('#instance-top, [data-ui="qa-header"]')
        );
    },

    contextFromToggle(btn, state) {
        const toolbar = btn.parentElement || state.toolbarEl;
        const panel =
            (state.panelEl && state.panelEl.isConnected
                ? state.panelEl
                : null) || this.findInstanceBottom(toolbar || btn);
        const body =
            this.isSafeBodyRef(state.bodyEl, panel) ? state.bodyEl : null;

        if (body && toolbar) {
            return {
                runBtn: state.runBtn,
                toolbar,
                body,
                panel,
                headerRow: null,
                card: null
            };
        }

        if (!toolbar) return null;
        const resolved = this.resolveHeaderAndBody(toolbar);
        if (!resolved) return null;

        const runBtn =
            (state.runBtn && state.runBtn.isConnected && this.isRunVerifierButton(state.runBtn)
                ? state.runBtn
                : null) || this.findRunVerifierButton(toolbar) || this.findRunVerifierButton(document);

        return { runBtn, toolbar, ...resolved };
    },

    ensureToggle(ctx, state) {
        ctx.toolbar.setAttribute(TOOLBAR_ATTR, '1');

        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles(SCOPE);
        }

        const existing = ctx.toolbar.querySelector(
            '[data-fleet-plugin="hideVerifierOutput"][data-slot="hide-verifier-toggle"]'
        );
        if (existing) {
            this.syncToggleLabel(existing, state.hidden);
            return existing;
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
            this.handleToggleClick(btn, state);
        });

        ctx.toolbar.insertBefore(btn, ctx.runBtn);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerElement) {
            CleanupRegistry.registerElement(btn);
        }
        Logger.log('hideVerifierOutput: toggle injected before Run Verifier');
        return btn;
    },

    handleToggleClick(btn, state) {
        const live = this.contextFromToggle(btn, state);
        if (!live || !live.body) {
            Logger.warn('hideVerifierOutput: click — could not resolve verifier body');
            return;
        }

        this.storeCtxRefs(live, state);

        if (state.hidden) {
            this.showVerifier(live, state, 'click');
        } else {
            this.hideVerifier(live, state, 'click');
        }
        this.syncToggleLabel(btn, state.hidden);
    },

    syncToggleLabel(btn, hidden) {
        const label = hidden ? 'Show Verifier' : 'Hide Verifier';
        btn.textContent = label;
        btn.setAttribute('aria-label', label);
        btn.title = label;
    },

    hideVerifier(ctx, state, reason) {
        if (state.hidden) {
            Logger.debug(`hideVerifierOutput: hide skipped — already hidden (${reason})`);
            return;
        }
        if (!ctx.body) {
            Logger.warn(`hideVerifierOutput: hide failed — no body (${reason})`);
            return;
        }

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
        if (!ctx.body) {
            Logger.warn(`hideVerifierOutput: show failed — no body (${reason})`);
            return;
        }

        if (!state.hidden && ctx.body.style.display !== 'none') {
            Logger.debug(`hideVerifierOutput: show skipped — already visible (${reason})`);
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
        const toolbar = ctx.toolbar || state.toolbarEl;
        const toggle =
            toolbar &&
            toolbar.querySelector(
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

        const ctx =
            (this.isSafeBodyRef(state.bodyEl, state.panelEl)
                ? {
                      body: state.bodyEl,
                      panel: state.panelEl,
                      toolbar: state.toolbarEl
                  }
                : null) || this.findVerifierContext();
        if (!ctx || !ctx.body) {
            Logger.warn('hideVerifierOutput: auto-show failed — could not resolve verifier body');
            return;
        }
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
