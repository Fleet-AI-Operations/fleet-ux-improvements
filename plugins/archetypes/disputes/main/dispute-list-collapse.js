// ============= dispute-list-collapse.js =============
// Full-collapse for dispute list cards. Hijacks the native expand chevron;
// persists closed dispute IDs so collapsed cards stay compact on reload.

const STYLE_ID = 'fleet-dispute-list-collapse-style';
const COLLAPSED_ATTR = 'data-fleet-dispute-collapsed';
const STORAGE_KEY = 'dispute-list-collapsed-ids';
const WATCHER_ID = 'dispute-list-collapse-api-watcher';
const TASK_HREF_RE = /\/work\/problems\/view-task\/([0-9a-f-]{36})/i;
const EXPAND_SEL = '[data-ui="dispute-expand"]';
const CARD_SEL = '[data-ui="dispute-card"]';

const plugin = {
    id: 'disputeListCollapse',
    name: 'Dispute List Collapse',
    description:
        'Hijack native dispute expand for a full collapse toggle; remember closed dispute numbers across reloads',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        subscribed: false,
        disputes: null,
        captureLogged: false,
        activationLogged: false,
        docListenerBound: false,
        closedIds: null
    },

    onMutation(state) {
        this.ensureStyles();
        this.ensureDocListener(state);
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
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(style);
        }
        // Always refresh so prior versions that hid native expand are replaced.
        style.textContent = [
            '[' + COLLAPSED_ATTR + '="1"] .flex-1 > p.mt-2 { display: none !important; }',
            '[' + COLLAPSED_ATTR + '="1"] .ml-3.flex.shrink-0 > div[data-state] { display: none !important; }',
            // Keep View Task; hide the rest of the meta row
            '[' + COLLAPSED_ATTR + '="1"] .mt-2.flex.items-center.gap-4 > *:not(a[href*="/work/problems/view-task/"]) { display: none !important; }',
            '[' + COLLAPSED_ATTR + '="1"] > .p-4.pt-0 { display: none !important; }',
            EXPAND_SEL + ' { transition: transform 0.15s ease; }',
            '[' + COLLAPSED_ATTR + '="1"] ' + EXPAND_SEL + ' { transform: rotate(-90deg); }',
            // Clear leftover replacement toggles from older plugin versions
            '[data-fleet-dispute-collapse-toggle] { display: none !important; }'
        ].join('\n');
    },

    ensureDocListener(state) {
        if (state.docListenerBound) return;
        const self = this;
        document.addEventListener('click', (ev) => {
            const start = self.eventElement(ev);
            if (!start || typeof start.closest !== 'function') return;

            const expandBtn = start.closest(EXPAND_SEL);
            if (!expandBtn) return;

            const card = expandBtn.closest(CARD_SEL);
            if (!card) {
                Logger.debug('expand click outside dispute-card');
                return;
            }

            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();

            Logger.log('collapse click');
            self.ensureClosedIds(state);
            const id = self.resolveDisputeId(card, state);
            if (!id) {
                Logger.warn('collapse click with no dispute id');
                return;
            }
            self.toggleCard(state, card, id);
        }, true);
        state.docListenerBound = true;
        Logger.debug('document capture click listener bound');
    },

    eventElement(ev) {
        if (!ev) return null;
        if (typeof ev.composedPath === 'function') {
            const path = ev.composedPath();
            for (let i = 0; i < path.length; i++) {
                const node = path[i];
                if (node && node.nodeType === 1) return node;
            }
        }
        const t = ev.target;
        if (t && t.nodeType === 1) return t;
        if (t && t.parentElement) return t.parentElement;
        return null;
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
        const all = document.querySelectorAll(CARD_SEL);
        const leaves = [];
        for (const card of all) {
            if (card.querySelector(CARD_SEL)) continue;
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
        const leftover = card.querySelectorAll('[data-fleet-dispute-collapse-toggle]');
        for (const el of leftover) el.remove();

        const disputeId = this.resolveDisputeId(card, state);
        if (!disputeId) return false;

        const collapsed = state.closedIds.has(disputeId);
        this.applyCollapsed(card, disputeId, collapsed);
        return true;
    },

    applyCollapsed(card, disputeId, collapsed) {
        const wasCollapsed = card.getAttribute(COLLAPSED_ATTR) === '1';
        if (collapsed && !wasCollapsed) {
            card.setAttribute(COLLAPSED_ATTR, '1');
        } else if (!collapsed && wasCollapsed) {
            card.removeAttribute(COLLAPSED_ATTR);
        }

        const expandBtn = card.querySelector(EXPAND_SEL);
        if (!expandBtn) return;

        const wantExpanded = collapsed ? 'false' : 'true';
        if (expandBtn.getAttribute('aria-expanded') === wantExpanded) return;

        expandBtn.title = collapsed ? 'Expand dispute' : 'Collapse dispute';
        expandBtn.setAttribute(
            'aria-label',
            collapsed ? 'Expand dispute #' + disputeId : 'Collapse dispute #' + disputeId
        );
        expandBtn.setAttribute('aria-expanded', wantExpanded);
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
