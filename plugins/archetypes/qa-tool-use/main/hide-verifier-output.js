// ============= hide-verifier-output.js =============
// Hide/Show Verifier body on QA Tool Use; auto-show when Run Verifier goes disabled.

const SCOPE = '#instance-bottom';
const HIDDEN_BODY_ATTR = 'data-fleet-verifier-body-hidden';
const COLLAPSED_PANEL_ATTR = 'data-fleet-verifier-collapsed';
const SAVED_FLEX_ATTR = 'data-fleet-verifier-saved-flex';
const SAVED_PANEL_MAX_ATTR = 'data-fleet-verifier-saved-panel-max';
const SAVED_PANEL_MIN_ATTR = 'data-fleet-verifier-saved-panel-min';
const SAVED_PANEL_OVERFLOW_ATTR = 'data-fleet-verifier-saved-panel-overflow';
const SAVED_CARD_HEIGHT_ATTR = 'data-fleet-verifier-saved-card-height';
const SAVED_CARD_MAX_ATTR = 'data-fleet-verifier-saved-card-max';
const SAVED_CARD_MIN_ATTR = 'data-fleet-verifier-saved-card-min';
const DEFAULT_HEADER_PX = 40;

const plugin = {
    id: 'hideVerifierOutput',
    name: 'Hide Verifier Output',
    description:
        'Hide/Show Verifier Output on the bottom panel',
    _version: '1.8',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false,
        injectLogged: false,
        hidden: false,
        runBtn: null,
        runObserver: null,
        runClickHandler: null,
        wasRunDisabled: false,
        bodyEl: null,
        panelEl: null,
        toolbarEl: null,
        cardEl: null,
        headerRowEl: null
    },

    onMutation(state) {
        const ctx = this.findVerifierContext();
        if (!ctx) {
            this.resetPane(state);
            return;
        }

        state.missingLogged = false;
        // DOM is source of truth after collapse / React remounts
        state.hidden = this.isBodyHidden(ctx.body);
        this.storeCtxRefs(ctx, state);
        this.ensureToggle(ctx, state);
        this.ensureRunWatch(ctx.runBtn, state);

        if (!state.activationLogged) {
            Logger.log('Hide Verifier control ready');
            state.activationLogged = true;
        }

        this.syncFromRunButton(ctx.runBtn, state);
    },

    resetPane(state) {
        this.teardownRunWatch(state);
        if (state.activationLogged || state.hidden) {
            Logger.debug('Verifier Output pane gone — reset');
        }
        state.missingLogged = false;
        state.activationLogged = false;
        state.injectLogged = false;
        state.hidden = false;
        state.wasRunDisabled = false;
        state.bodyEl = null;
        state.panelEl = null;
        state.toolbarEl = null;
        state.cardEl = null;
        state.headerRowEl = null;
    },

    storeCtxRefs(ctx, state) {
        state.bodyEl = ctx.body;
        state.panelEl = ctx.panel;
        state.toolbarEl = ctx.toolbar;
        state.cardEl = ctx.card || null;
        state.headerRowEl = ctx.headerRow || null;
    },

    isBodyHidden(body) {
        if (!body) return false;
        return (
            body.getAttribute(HIDDEN_BODY_ATTR) === '1' ||
            body.style.display === 'none'
        );
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
        if (body.contains(headerRow) || body.contains(toolbar)) return null;
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
                headerRow:
                    state.headerRowEl && state.headerRowEl.isConnected
                        ? state.headerRowEl
                        : null,
                card: state.cardEl && state.cardEl.isConnected ? state.cardEl : body.parentElement
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

    applyToggleChrome(btn) {
        if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
            btn.className = Context.uiLib.btnClass('basic', 'compact');
        } else if (!btn.className) {
            btn.className =
                'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium h-7 text-xs pl-2 pr-2 py-1';
        }
        btn.style.flexShrink = '0';
        btn.style.pointerEvents = 'auto';
        btn.style.position = 'relative';
        btn.style.zIndex = '2';
    },

    ensureToggle(ctx, state) {
        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles(SCOPE);
        }

        const existing = ctx.toolbar.querySelector(
            '[data-fleet-plugin="hideVerifierOutput"][data-slot="hide-verifier-toggle"]'
        );
        if (existing) {
            this.applyToggleChrome(existing);
            this.syncToggleLabel(existing, state.hidden);
            return existing;
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-fleet-plugin', this.id);
        btn.setAttribute('data-slot', 'hide-verifier-toggle');
        this.applyToggleChrome(btn);
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
        if (!state.injectLogged) {
            Logger.log('toggle injected before Run Verifier');
            state.injectLogged = true;
        } else {
            Logger.debug('toggle reinjected before Run Verifier');
        }
        return btn;
    },

    handleToggleClick(btn, state) {
        const live = this.contextFromToggle(btn, state);
        if (!live || !live.body) {
            Logger.warn('click — could not resolve verifier body');
            return;
        }

        this.storeCtxRefs(live, state);

        const hidden = this.isBodyHidden(live.body) || state.hidden;
        if (hidden) {
            this.showVerifier(live, state, 'click');
        } else {
            this.hideVerifier(live, state, 'click');
        }
        this.syncToggleLabel(btn, state.hidden);
        this.applyToggleChrome(btn);
    },

    syncToggleLabel(btn, hidden) {
        const label = hidden ? 'Show Verifier' : 'Hide Verifier';
        btn.textContent = label;
        btn.setAttribute('aria-label', label);
        btn.title = label;
    },

    measureHeaderPx(ctx) {
        const header = ctx.headerRow;
        if (header && header.isConnected) {
            const rect = header.getBoundingClientRect();
            // Include toolbar mb-1 overhang so controls are not clipped
            const h = Math.ceil(Math.max(header.scrollHeight, rect.height, header.offsetHeight) + 4);
            if (h > 0) return h;
        }
        return DEFAULT_HEADER_PX;
    },

    collapsePanel(ctx, headerPx) {
        const panel = ctx.panel;
        const card = ctx.card || (ctx.body && ctx.body.parentElement);
        if (!panel) return;

        if (!panel.hasAttribute(SAVED_FLEX_ATTR)) {
            panel.setAttribute(SAVED_FLEX_ATTR, panel.style.flex || '');
        }
        if (!panel.hasAttribute(SAVED_PANEL_MAX_ATTR)) {
            panel.setAttribute(SAVED_PANEL_MAX_ATTR, panel.style.maxHeight || '');
        }
        if (!panel.hasAttribute(SAVED_PANEL_MIN_ATTR)) {
            panel.setAttribute(SAVED_PANEL_MIN_ATTR, panel.style.minHeight || '');
        }
        if (!panel.hasAttribute(SAVED_PANEL_OVERFLOW_ATTR)) {
            panel.setAttribute(SAVED_PANEL_OVERFLOW_ATTR, panel.style.overflow || '');
        }

        panel.setAttribute(COLLAPSED_PANEL_ATTR, '1');
        // Explicit basis + minHeight; overflow visible so Show stays clickable
        panel.style.flex = `0 0 ${headerPx}px`;
        panel.style.minHeight = `${headerPx}px`;
        panel.style.maxHeight = '';
        panel.style.overflow = 'visible';

        if (ctx.headerRow) {
            ctx.headerRow.style.flexShrink = '0';
        }

        if (!card) return;

        if (!card.hasAttribute(SAVED_CARD_HEIGHT_ATTR)) {
            card.setAttribute(SAVED_CARD_HEIGHT_ATTR, card.style.height || '');
        }
        if (!card.hasAttribute(SAVED_CARD_MAX_ATTR)) {
            card.setAttribute(SAVED_CARD_MAX_ATTR, card.style.maxHeight || '');
        }
        if (!card.hasAttribute(SAVED_CARD_MIN_ATTR)) {
            card.setAttribute(SAVED_CARD_MIN_ATTR, card.style.minHeight || '');
        }
        card.style.height = 'auto';
        card.style.maxHeight = 'none';
        card.style.minHeight = '0';
        card.style.overflow = 'visible';
    },

    restorePanel(ctx) {
        const panel = ctx.panel;
        const card =
            ctx.card ||
            (ctx.body && ctx.body.parentElement) ||
            null;

        if (panel) {
            panel.removeAttribute(COLLAPSED_PANEL_ATTR);
            if (panel.hasAttribute(SAVED_FLEX_ATTR)) {
                panel.style.flex = panel.getAttribute(SAVED_FLEX_ATTR) || '';
                panel.removeAttribute(SAVED_FLEX_ATTR);
            }
            if (panel.hasAttribute(SAVED_PANEL_MAX_ATTR)) {
                panel.style.maxHeight = panel.getAttribute(SAVED_PANEL_MAX_ATTR) || '';
                panel.removeAttribute(SAVED_PANEL_MAX_ATTR);
            }
            if (panel.hasAttribute(SAVED_PANEL_MIN_ATTR)) {
                panel.style.minHeight = panel.getAttribute(SAVED_PANEL_MIN_ATTR) || '';
                panel.removeAttribute(SAVED_PANEL_MIN_ATTR);
            }
            if (panel.hasAttribute(SAVED_PANEL_OVERFLOW_ATTR)) {
                panel.style.overflow = panel.getAttribute(SAVED_PANEL_OVERFLOW_ATTR) || '';
                panel.removeAttribute(SAVED_PANEL_OVERFLOW_ATTR);
            }
        }

        if (card && card.hasAttribute(SAVED_CARD_HEIGHT_ATTR)) {
            card.style.height = card.getAttribute(SAVED_CARD_HEIGHT_ATTR) || '';
            card.removeAttribute(SAVED_CARD_HEIGHT_ATTR);
        }
        if (card && card.hasAttribute(SAVED_CARD_MAX_ATTR)) {
            card.style.maxHeight = card.getAttribute(SAVED_CARD_MAX_ATTR) || '';
            card.removeAttribute(SAVED_CARD_MAX_ATTR);
        }
        if (card && card.hasAttribute(SAVED_CARD_MIN_ATTR)) {
            card.style.minHeight = card.getAttribute(SAVED_CARD_MIN_ATTR) || '';
            card.removeAttribute(SAVED_CARD_MIN_ATTR);
        }
        if (card) {
            card.style.overflow = '';
        }
        if (ctx.headerRow) {
            ctx.headerRow.style.flexShrink = '';
        }
    },

    hideVerifier(ctx, state, reason) {
        if (!ctx.body) {
            Logger.warn(`hide failed — no body (${reason})`);
            return;
        }
        if (this.isBodyHidden(ctx.body) && state.hidden) {
            Logger.debug(`hide skipped — already hidden (${reason})`);
            return;
        }

        const headerPx = this.measureHeaderPx(ctx);
        const card = ctx.card || ctx.body.parentElement;
        if (card && !ctx.card) ctx.card = card;

        ctx.body.style.display = 'none';
        ctx.body.setAttribute(HIDDEN_BODY_ATTR, '1');

        this.collapsePanel(ctx, headerPx);

        state.hidden = true;
        Logger.log(`hidden (${reason})`);
    },

    showVerifier(ctx, state, reason) {
        if (!ctx.body) {
            Logger.warn(`show failed — no body (${reason})`);
            return;
        }

        const wasHidden = this.isBodyHidden(ctx.body) || state.hidden;
        if (!wasHidden) {
            Logger.debug(`show skipped — already visible (${reason})`);
            return;
        }

        ctx.body.style.display = '';
        ctx.body.removeAttribute(HIDDEN_BODY_ATTR);

        if (!ctx.card) {
            ctx.card =
                (state.cardEl && state.cardEl.isConnected ? state.cardEl : null) ||
                ctx.body.parentElement;
        }
        if (!ctx.headerRow && state.headerRowEl && state.headerRowEl.isConnected) {
            ctx.headerRow = state.headerRowEl;
        }
        this.restorePanel(ctx);

        state.hidden = false;
        const toolbar = ctx.toolbar || state.toolbarEl;
        const toggle =
            toolbar &&
            toolbar.querySelector(
                '[data-fleet-plugin="hideVerifierOutput"][data-slot="hide-verifier-toggle"]'
            );
        if (toggle) {
            this.syncToggleLabel(toggle, false);
            this.applyToggleChrome(toggle);
        }
        Logger.log(`shown (${reason})`);
    },

    ensureRunWatch(runBtn, state) {
        if (state.runBtn === runBtn && state.runObserver) {
            this.syncFromRunButton(runBtn, state);
            return;
        }

        // React often remounts Run Verifier already disabled — compare against prior node state
        const prevDisabled = state.wasRunDisabled;
        this.teardownRunWatch(state);
        state.runBtn = runBtn;

        const disabled = this.isRunButtonDisabled(runBtn);
        state.wasRunDisabled = disabled;

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

        // Capture click as well: show immediately when the operator starts a run
        const onRunClick = () => {
            self.autoShowIfHidden(state, 'run-verifier-click');
        };
        runBtn.addEventListener('click', onRunClick, true);
        state.runClickHandler = onRunClick;
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerEventListener) {
            CleanupRegistry.registerEventListener(runBtn, 'click', onRunClick, true);
        }

        if (disabled && !prevDisabled) {
            this.autoShowIfHidden(state, 'run-verifier-disabled');
        }
    },

    isRunButtonDisabled(runBtn) {
        if (!runBtn) return false;
        return Boolean(runBtn.disabled) || runBtn.getAttribute('aria-disabled') === 'true';
    },

    autoShowIfHidden(state, reason) {
        const hidden =
            state.hidden ||
            this.isBodyHidden(state.bodyEl) ||
            (state.panelEl && state.panelEl.getAttribute(COLLAPSED_PANEL_ATTR) === '1');
        if (!hidden) return;

        const ctx =
            (this.isSafeBodyRef(state.bodyEl, state.panelEl)
                ? {
                      body: state.bodyEl,
                      panel: state.panelEl,
                      toolbar: state.toolbarEl,
                      card: state.cardEl && state.cardEl.isConnected ? state.cardEl : null,
                      headerRow:
                          state.headerRowEl && state.headerRowEl.isConnected
                              ? state.headerRowEl
                              : null
                  }
                : null) || this.findVerifierContext();
        if (!ctx || !ctx.body) {
            Logger.warn(`auto-show failed — could not resolve verifier body (${reason})`);
            return;
        }
        this.showVerifier(ctx, state, reason);
    },

    syncFromRunButton(runBtn, state) {
        if (!runBtn || !runBtn.isConnected) return;
        const disabled = this.isRunButtonDisabled(runBtn);
        const becameDisabled = disabled && !state.wasRunDisabled;
        state.wasRunDisabled = disabled;

        if (!becameDisabled) return;
        this.autoShowIfHidden(state, 'run-verifier-disabled');
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
        if (state.runBtn && state.runClickHandler) {
            try {
                state.runBtn.removeEventListener('click', state.runClickHandler, true);
            } catch (e) {
                /* ignore */
            }
        }
        state.runClickHandler = null;
        state.runBtn = null;
    }
};
