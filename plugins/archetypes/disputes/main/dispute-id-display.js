// ============= dispute-id-display.js =============
// Watches GET /api/disputes and surfaces each dispute's numeric ID after the
// time-ago badge on dispute cards (click to copy).

const BADGE_ATTR = 'data-fleet-dispute-id-badge';
const WATCHER_ID = 'dispute-id-display-api-watcher';
const TASK_HREF_RE = /\/work\/problems\/view-task\/([0-9a-f-]{36})/i;

const plugin = {
    id: 'disputeIdDisplay',
    name: 'Dispute ID Display',
    description: 'Show dispute ID after the time-ago badge on each dispute card',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        subscribed: false,
        disputes: null,
        captureLogged: false,
        waitingLogged: false,
        injectedLogged: false,
        fallbackRequested: false,
        fallbackInFlight: false,
        fallbackAttempts: 0
    },

    onMutation(state) {
        this.ensureSubscription(state);

        if (Array.isArray(state.disputes) && state.disputes.length > 0) {
            this.injectBadges(state);
            return;
        }

        const cards = this.getLeafDisputeCards();
        if (cards.length > 0 && !state.fallbackRequested) {
            if (!state.waitingLogged) {
                Logger.debug(`${this.id}: cards present but no /api/disputes data yet; requesting fallback`);
                state.waitingLogged = true;
            }
            this.requestDisputesFallback(state);
        }
    },

    ensureSubscription(state) {
        if (state.subscribed) return;
        const observer = Context.networkObserver;
        if (!observer || typeof observer.subscribe !== 'function') {
            Logger.debug(`${this.id}: Context.networkObserver not ready`);
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
                    state.waitingLogged = false;
                    state.injectedLogged = false;
                    if (!state.captureLogged) {
                        Logger.log(`${self.id}: captured ${body.disputes.length} disputes from /api/disputes`);
                        state.captureLogged = true;
                    } else {
                        Logger.debug(`${self.id}: refreshed ${body.disputes.length} disputes from /api/disputes`);
                    }
                    self.injectBadges(state);
                }).catch(err => {
                    Logger.debug(`${self.id}: failed to parse /api/disputes response`, err);
                });
            }
        });
        state.subscribed = true;
        Logger.debug(`${this.id}: subscribed to NetworkObserver for GET /api/disputes`);
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

    findTimeAgoSpan(card) {
        const h3 = card.querySelector('h3');
        if (!h3) return null;
        const spans = h3.querySelectorAll('span.flex.items-center.gap-1');
        for (const span of spans) {
            const text = (span.textContent || '').trim();
            if (/ago$/i.test(text) || /\d+\s*(day|hour|minute|second|week|month|year)/i.test(text)) {
                return span;
            }
        }
        // Fallback: last muted flex span in the h3 header row
        for (let i = spans.length - 1; i >= 0; i--) {
            const span = spans[i];
            if (span.classList.contains('text-muted-foreground')) return span;
        }
        return null;
    },

    resolveDisputeForCard(card, disputes, index) {
        const link = card.querySelector('a[href*="/work/problems/view-task/"]');
        const href = link && link.getAttribute('href');
        if (href) {
            const match = href.match(TASK_HREF_RE);
            if (match) {
                const taskId = match[1];
                const byTask = disputes.find(d => d && String(d.eval_task_id) === taskId);
                if (byTask) return byTask;
            }
        }
        // Match "Review with Environment" href /work/problems/disputes/<id>
        const reviewLink = card.querySelector('a[href*="/work/problems/disputes/"]');
        if (reviewLink) {
            const reviewHref = reviewLink.getAttribute('href') || '';
            const idMatch = reviewHref.match(/\/work\/problems\/disputes\/(\d+)/);
            if (idMatch) {
                const byId = disputes.find(d => d && String(d.id) === idMatch[1]);
                if (byId) return byId;
            }
        }
        return disputes[index] || null;
    },

    buildBadge(disputeId) {
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.setAttribute(BADGE_ATTR, '1');
        badge.setAttribute('data-fleet-plugin', this.id);
        badge.setAttribute('data-fleet-dispute-id', String(disputeId));
        badge.className = 'flex items-center gap-1 text-xs text-muted-foreground font-mono';
        badge.title = `Copy dispute ID ${disputeId}`;
        badge.setAttribute('aria-label', `Copy dispute ID ${disputeId}`);
        badge.textContent = `#${disputeId}`;
        badge.style.cursor = 'pointer';
        badge.style.background = 'transparent';
        badge.style.border = 'none';
        badge.style.padding = '0';
        badge.style.margin = '0';

        const self = this;
        badge.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const value = String(disputeId);
            navigator.clipboard.writeText(value).then(() => {
                if (Context.buttonFeedback && typeof Context.buttonFeedback.flashSuccess === 'function') {
                    Context.buttonFeedback.flashSuccess(badge);
                }
                Logger.log(`${self.id}: copied dispute id ${value}`);
            }).catch(err => {
                if (Context.buttonFeedback && typeof Context.buttonFeedback.flashFailure === 'function') {
                    Context.buttonFeedback.flashFailure(badge);
                }
                Logger.error(`${self.id}: failed to copy dispute id`, err);
            });
        });
        return badge;
    },

    injectBadges(state) {
        const disputes = state.disputes;
        if (!Array.isArray(disputes) || disputes.length === 0) return;

        const cards = this.getLeafDisputeCards();
        if (cards.length === 0) return;

        let injected = 0;
        cards.forEach((card, index) => {
            if (card.querySelector(`[${BADGE_ATTR}]`)) return;
            const dispute = this.resolveDisputeForCard(card, disputes, index);
            if (!dispute || dispute.id == null) return;

            const timeAgo = this.findTimeAgoSpan(card);
            if (!timeAgo || !timeAgo.parentNode) {
                Logger.debug(`${this.id}: time-ago span not found for card index ${index}`);
                return;
            }

            const badge = this.buildBadge(dispute.id);
            if (timeAgo.nextSibling) {
                timeAgo.parentNode.insertBefore(badge, timeAgo.nextSibling);
            } else {
                timeAgo.parentNode.appendChild(badge);
            }
            injected++;
        });

        if (injected > 0 && !state.injectedLogged) {
            Logger.log(`${this.id}: injected dispute ID badge on ${injected} card(s)`);
            state.injectedLogged = true;
        } else if (injected > 0) {
            Logger.debug(`${this.id}: injected ${injected} additional dispute ID badge(s)`);
        }
    },

    getFallbackDisputesUrl() {
        try {
            const pageWindow = Context.getPageWindow ? Context.getPageWindow() : window;
            const resources = (pageWindow.performance && pageWindow.performance.getEntriesByType('resource')) || [];
            for (let i = resources.length - 1; i >= 0; i--) {
                const name = resources[i] && resources[i].name;
                if (name && name.includes('/api/disputes')) {
                    return name;
                }
            }
            return `${pageWindow.location.origin}/api/disputes?limit=50&offset=0`;
        } catch (e) {
            Logger.debug(`${this.id}: performance resource scan failed`, e);
            return '/api/disputes?limit=50&offset=0';
        }
    },

    requestDisputesFallback(state) {
        if (state.fallbackInFlight || state.fallbackAttempts >= 2) return;

        state.fallbackRequested = true;
        state.fallbackInFlight = true;
        state.fallbackAttempts += 1;
        const attempt = state.fallbackAttempts;
        const url = this.getFallbackDisputesUrl();
        Logger.log(`${this.id}: fallback disputes fetch attempt ${attempt}/2`);

        const self = this;
        fetch(url, { method: 'GET', credentials: 'same-origin' })
            .then(async response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (!data || !Array.isArray(data.disputes)) {
                    throw new Error('Invalid disputes payload');
                }
                state.disputes = data.disputes;
                state.waitingLogged = false;
                if (!state.captureLogged) {
                    Logger.log(`${self.id}: fallback captured ${data.disputes.length} disputes`);
                    state.captureLogged = true;
                }
                self.injectBadges(state);
            })
            .catch(err => {
                Logger.warn(`${self.id}: fallback fetch failed (attempt ${attempt}/2)`, err);
                if (state.fallbackAttempts < 2) {
                    state.fallbackRequested = false;
                }
            })
            .finally(() => {
                state.fallbackInFlight = false;
            });
    }
};
