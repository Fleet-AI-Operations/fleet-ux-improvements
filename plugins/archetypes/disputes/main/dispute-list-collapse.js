// ============= dispute-list-collapse.js =============
// Full-collapse toggle for dispute list cards. Replaces the native expand
// control; persists closed dispute IDs so collapsed cards stay compact on reload.

const STYLE_ID = 'fleet-dispute-list-collapse-style';
const COLLAPSED_ATTR = 'data-fleet-dispute-collapsed';
const TOGGLE_ATTR = 'data-fleet-dispute-collapse-toggle';
const CARD_WIRED_ATTR = 'data-fleet-dispute-collapse-wired';
const SCOPE_SEL = '[data-ui="dispute-card"]';
const STORAGE_KEY = 'dispute-list-collapsed-ids';
const WATCHER_ID = 'dispute-list-collapse-api-watcher';
const TASK_HREF_RE = /\/work\/problems\/view-task\/([0-9a-f-]{36})/i;

const CHEVRON_OPEN =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>';
const CHEVRON_CLOSED =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>';

const plugin = {
    id: 'disputeListCollapse',
    name: 'Dispute List Collapse',
    description:
        'Replace native dispute expand with a full collapse toggle; remember closed dispute numbers across reloads',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        subscribed: false,
        disputes: null,
        captureLogged: false,
        activationLogged: false,
        closedIds: null
    },

    onMutation(state) {
        this.ensureStyles();
        this.ensureButtonChrome();
        this.ensureSubscription(state);
        this.ensureClosedIds(state);

        const cards = this.getLeafDisputeCards();
        if (cards.length === 0) {
            if (state.activationLogged) {
                Logger.debug('dispute cards gone — reset activation');
                state.activationLogged = false;
            }
            return;
        }

        let wired = 0;
        for (const card of cards) {
            if (this.processCard(state, card)) wired += 1;
        }

        if (wired > 0 && !state.activationLogged) {
            Logger.log('dispute list collapse active (' + wired + ' card(s))');
            state.activationLogged = true;
        }
    },

    ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '[data-ui="dispute-card"] [data-ui="dispute-expand"] { display: none !important; }',
            '[' + COLLAPSED_ATTR + '="1"] .flex-1 > p.mt-2 { display: none !important; }',
            '[' + COLLAPSED_ATTR + '="1"] .ml-3.flex.shrink-0 > div[data-state] { display: none !important; }',
            '[' + COLLAPSED_ATTR + '="1"] .mt-2.flex.items-center.gap-4 { display: none !important; }',
            '[' + COLLAPSED_ATTR + '="1"] > .p-4.pt-0 { display: none !important; }'
        ].join('\n');
        (document.head || document.documentElement).appendChild(style);
    },

    ensureButtonChrome() {
        if (!Context.uiLib || typeof Context.uiLib.ensureButtonStyles !== 'function') return;
        Context.uiLib.ensureButtonStyles(SCOPE_SEL);
    },

    ensureClosedIds(state) {
        if (state.closedIds instanceof Set) return;
        let raw = [];
        try {
            raw = Storage.get(STORAGE_KEY, []);
        } catch (e) {
            Logger.warn('failed to read collapsed dispute ids', e);
            raw = [];
        }
        if (!Array.isArray(raw)) raw = [];
        state.closedIds = new Set(raw.map(String).filter(Boolean));
    },

    persistClosedIds(state) {
        if (!(state.closedIds instanceof Set)) return;
        try {
            Storage.set(STORAGE_KEY, Array.from(state.closedIds));
        } catch (e) {
            Logger.error('failed to persist collapsed dispute ids', e);
        }
    },

    ensureSubscription(state) {
        if (state.subscribed) return;
        const observer = Context.networkObserver;
        if (!observer || typeof observer.subscribe !== 'function') {
            Logger.debug('Context.networkObserver not ready');
            return;
        }

        const self = this;
        observer.subscribe({
            id: WATCHER_ID,
            matches(meta) {
                return meta.method === 'GET'
                    && meta.urlObj
                    && meta.urlObj.pathname === '/api/disputes';
            },
            onResponse(meta, response) {
                if (!response || !response.ok) return;
                response.json().then(body => {
                    if (!body || !Array.isArray(body.disputes)) return;
                    state.disputes = body.disputes;
                    if (!state.captureLogged) {
                        Logger.debug('captured ' + body.disputes.length + ' disputes from /api/disputes');
                        state.captureLogged = true;
                    }
                    self.onMutation(state);
                }).catch(err => {
                    Logger.debug('failed to parse /api/disputes response', err);
                });
            }
        });
        state.subscribed = true;
        Logger.debug('subscribed to NetworkObserver for GET /api/disputes');
    },

    getLeafDisputeCards() {
        const all = document.querySelectorAll('[data-ui="dispute-card"]');
        const leaves = [];
        for (const card of all) {
            if (card.querySelector('[data-ui="dispute-card"]')) continue;
            leaves.push(card);
        }
        return leaves;
    },

    resolveDisputeId(card, state) {
        const badge = card.querySelector('[data-fleet-dispute-id]');
        if (badge) {
            const id = badge.getAttribute('data-fleet-dispute-id');
            if (id) return String(id);
        }

        const reviewLink = card.querySelector('a[href*="/work/problems/disputes/"]');
        if (reviewLink) {
            const href = reviewLink.getAttribute('href') || '';
            const idMatch = href.match(/\/work\/problems\/disputes\/(\d+)/);
            if (idMatch) return idMatch[1];
        }

        const disputes = state.disputes;
        if (!Array.isArray(disputes) || disputes.length === 0) return null;

        const link = card.querySelector('a[href*="/work/problems/view-task/"]');
        const href = link && link.getAttribute('href');
        if (href) {
            const match = href.match(TASK_HREF_RE);
            if (match) {
                const taskId = match[1];
                const byTask = disputes.find(d => d && String(d.eval_task_id) === taskId);
                if (byTask && byTask.id != null) return String(byTask.id);
            }
        }

        return null;
    },

    processCard(state, card) {
        const disputeId = this.resolveDisputeId(card, state);
        if (!disputeId) return false;

        this.hideNativeExpand(card);
        this.ensureToggle(state, card, disputeId);

        const collapsed = state.closedIds.has(disputeId);
        this.applyCollapsed(card, disputeId, collapsed);
        return true;
    },

    hideNativeExpand(card) {
        const buttons = card.querySelectorAll('[data-ui="dispute-expand"]');
        for (const btn of buttons) {
            if (btn.style.display === 'none') continue;
            btn.style.display = 'none';
        }
    },

    findActionCluster(card) {
        return card.querySelector('.ml-3.flex.shrink-0.items-center.gap-1')
            || card.querySelector('.ml-3.flex.shrink-0');
    },

    ensureToggle(state, card, disputeId) {
        let toggle = card.querySelector('[' + TOGGLE_ATTR + '="1"]');
        if (toggle) {
            if (toggle.getAttribute('data-fleet-dispute-id') !== disputeId) {
                toggle.setAttribute('data-fleet-dispute-id', disputeId);
            }
            return toggle;
        }

        const cluster = this.findActionCluster(card);
        if (!cluster) {
            Logger.debug('action cluster not found for dispute #' + disputeId);
            return null;
        }

        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.setAttribute(TOGGLE_ATTR, '1');
        toggle.setAttribute('data-fleet-plugin', this.id);
        toggle.setAttribute('data-fleet-dispute-id', disputeId);
        toggle.setAttribute(CARD_WIRED_ATTR, '1');
        if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
            toggle.className = Context.uiLib.btnClass('basic', 'icon');
        } else {
            toggle.className = 'inline-flex items-center justify-center';
        }

        const self = this;
        toggle.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const id = toggle.getAttribute('data-fleet-dispute-id')
                || self.resolveDisputeId(card, state);
            if (!id) {
                Logger.warn('collapse toggle clicked with no dispute id');
                return;
            }
            self.toggleCard(state, card, id);
        });

        cluster.appendChild(toggle);
        return toggle;
    },

    applyCollapsed(card, disputeId, collapsed) {
        if (collapsed) {
            card.setAttribute(COLLAPSED_ATTR, '1');
        } else {
            card.removeAttribute(COLLAPSED_ATTR);
        }

        const toggle = card.querySelector('[' + TOGGLE_ATTR + '="1"]');
        if (!toggle) return;
        toggle.innerHTML = collapsed ? CHEVRON_CLOSED : CHEVRON_OPEN;
        toggle.title = collapsed ? 'Expand dispute' : 'Collapse dispute';
        toggle.setAttribute('aria-label', collapsed ? 'Expand dispute #' + disputeId : 'Collapse dispute #' + disputeId);
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    },

    toggleCard(state, card, disputeId) {
        this.ensureClosedIds(state);
        const id = String(disputeId);
        const nextCollapsed = !state.closedIds.has(id);
        if (nextCollapsed) {
            state.closedIds.add(id);
        } else {
            state.closedIds.delete(id);
        }
        this.persistClosedIds(state);
        this.applyCollapsed(card, id, nextCollapsed);
        Logger.log((nextCollapsed ? 'collapsed' : 'expanded') + ' #' + id);
    }
};
