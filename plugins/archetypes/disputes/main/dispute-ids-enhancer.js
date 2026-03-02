// ============= dispute-ids-enhancer.js =============
// Intercepts /api/disputes response and surfaces dispute id and eval_task_id at top of each card as copy buttons.

const plugin = {
    id: 'disputeIdsEnhancer',
    name: 'Dispute IDs Enhancer',
    description: 'Surface Dispute and Task IDs at top of dispute cards.',
    _version: '1.5',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        interceptionInstalled: false,
        loggedNoCardsYet: false,
        fallbackRequested: false,
        fallbackInFlight: false,
        fallbackAttempts: 0,
        pendingRetryTimeouts: []
    },

    onMutation(state, context) {
        if (!state.interceptionInstalled) {
            this.installDisputesInterception(context, state);
        }
        if (context.disputesData && Array.isArray(context.disputesData)) {
            if (this.isInjectionComplete(context)) return;
            this.injectDisputeIds(context, state);
            return;
        }

        // If initial request was missed, prefer cached disputes, then bounded fallback request.
        const cards = document.querySelectorAll('[data-ui="dispute-card"]');
        if (cards.length > 0 && !state.fallbackRequested) {
            const usedCache = this.loadCachedDisputes(context, state);
            if (!usedCache) {
                this.requestDisputesFallback(context, state);
            }
        }
    },

    scheduleInjectionRetries(context, state) {
        if (!state) return;
        this.clearPendingRetries(state);

        const self = this;
        const delays = [0, 150, 400, 800];
        state.pendingRetryTimeouts = [];

        delays.forEach((delayMs, k) => {
            const timeoutId = setTimeout(() => {
                if (self.isInjectionComplete(context)) {
                    self.clearPendingRetries(state);
                    return;
                }
                Logger.debug(`Dispute IDs Enhancer: retry inject (attempt ${k + 1}/${delays.length})`);
                self.injectDisputeIds(context, state);

                if (self.isInjectionComplete(context)) {
                    self.clearPendingRetries(state);
                }
            }, delayMs);
            state.pendingRetryTimeouts.push(timeoutId);
        });
    },

    clearPendingRetries(state) {
        if (!state || !Array.isArray(state.pendingRetryTimeouts)) return;
        state.pendingRetryTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
        state.pendingRetryTimeouts = [];
    },

    isInjectionComplete(context) {
        const disputes = context.disputesData;
        if (!Array.isArray(disputes) || disputes.length === 0) return false;

        const cards = document.querySelectorAll('[data-ui="dispute-card"]');
        if (cards.length === 0) return false;

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const dispute = disputes[i];
            if (!dispute) return false;
            if (!card.querySelector('[data-fleet-dispute-ids]')) return false;
        }
        return true;
    },

    loadCachedDisputes(context, state) {
        try {
            const cached = Storage.get('disputes-cache', null);
            if (!cached) return false;
            let parsed;
            try {
                parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
            } catch (e) {
                Logger.warn('Dispute IDs Enhancer: failed to parse disputes cache, clearing', e);
                Storage.delete('disputes-cache');
                return false;
            }
            const disputes = Array.isArray(parsed.disputes) ? parsed.disputes : null;
            if (!disputes || disputes.length === 0) return false;

            context.disputesData = disputes;
            Logger.log(`Dispute IDs Enhancer: loaded ${disputes.length} disputes from cache`);
            this.scheduleInjectionRetries(context, state);
            return true;
        } catch (e) {
            Logger.warn('Dispute IDs Enhancer: error while loading disputes cache', e);
            return false;
        }
    },

    updateDisputesCache(disputes) {
        try {
            if (!Array.isArray(disputes) || disputes.length === 0) return;
            const payload = { disputes, cachedAt: Date.now() };
            Storage.set('disputes-cache', JSON.stringify(payload));
            Logger.debug(`Dispute IDs Enhancer: updated disputes cache with ${disputes.length} items`);
        } catch (e) {
            Logger.warn('Dispute IDs Enhancer: failed to update disputes cache', e);
        }
    },

    getFallbackDisputesUrl(context) {
        const pageWindow = context.getPageWindow();
        try {
            const resources = pageWindow.performance.getEntriesByType('resource') || [];
            for (let i = resources.length - 1; i >= 0; i--) {
                const name = resources[i] && resources[i].name;
                if (name && name.includes('/api/disputes')) {
                    return name;
                }
            }
        } catch (e) {
            Logger.debug('Dispute IDs Enhancer: performance resource scan failed', e);
        }
        // Fallback if no previously seen disputes URL is available.
        return `${pageWindow.location.origin}/api/disputes?limit=50&offset=0`;
    },

    requestDisputesFallback(context, state) {
        if (!state || state.fallbackInFlight || state.fallbackAttempts >= 2) return;

        state.fallbackRequested = true;
        state.fallbackInFlight = true;
        state.fallbackAttempts += 1;

        const attemptNumber = state.fallbackAttempts;
        const url = this.getFallbackDisputesUrl(context);
        Logger.log(`Dispute IDs Enhancer: fallback disputes fetch attempt ${attemptNumber}/2`);
        Logger.debug(`Dispute IDs Enhancer: fallback URL ${url}`);

        fetch(url, { method: 'GET', credentials: 'same-origin' })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const data = await response.json();
                if (!data || !Array.isArray(data.disputes)) {
                    throw new Error('Invalid disputes payload');
                }

                context.disputesData = data.disputes;
                Logger.log(`Dispute IDs Enhancer: fallback captured ${data.disputes.length} disputes`);
                this.scheduleInjectionRetries(context, state);
            })
            .catch((err) => {
                Logger.warn(`Dispute IDs Enhancer: fallback fetch failed (attempt ${attemptNumber}/2)`, err);
                if (state.fallbackAttempts < 2) {
                    setTimeout(() => this.requestDisputesFallback(context, state), 500);
                }
            })
            .finally(() => {
                state.fallbackInFlight = false;
            });
    },

    installDisputesInterception(context, state) {
        const pageWindow = context.getPageWindow();
        if (pageWindow.__fleetDisputesIdsInterceptionInstalled) {
            state.interceptionInstalled = true;
            return;
        }
        pageWindow.__fleetDisputesIdsInterceptionInstalled = true;

        const self = this;

        const originalFetch = pageWindow.fetch;
        if (typeof originalFetch === 'function') {
            pageWindow.fetch = function (...args) {
                const [resource, config] = args;
                let url;
                try {
                    url = new URL(resource, pageWindow.location.href);
                } catch (e) {
                    url = { href: String(resource), pathname: '' };
                }
                const isDisputesApi = url.pathname === '/api/disputes' || (url.href && url.href.includes('/api/disputes'));
                const method = (config && config.method) ? String(config.method).toUpperCase() : 'GET';
                if (isDisputesApi && method === 'GET') {
                    return originalFetch.apply(this, args).then(async (response) => {
                        if (!response.ok) return response;
                        try {
                            const clone = response.clone();
                            const data = await clone.json();
                            if (data && Array.isArray(data.disputes)) {
                                context.disputesData = data.disputes;
                                Logger.log(`Dispute IDs Enhancer: captured ${data.disputes.length} disputes from API`);
                                self.updateDisputesCache(data.disputes);
                                self.scheduleInjectionRetries(context, state);
                            }
                        } catch (e) {
                            Logger.debug('Dispute IDs Enhancer: failed to parse disputes response', e);
                        }
                        return response;
                    });
                }
                return originalFetch.apply(this, args);
            };
        }

        const originalXHROpen = pageWindow.XMLHttpRequest.prototype.open;
        const originalXHRSend = pageWindow.XMLHttpRequest.prototype.send;
        pageWindow.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this._fleetDisputesURL = url;
            this._fleetDisputesMethod = method;
            return originalXHROpen.apply(this, [method, url, ...rest]);
        };
        pageWindow.XMLHttpRequest.prototype.send = function (body) {
            const url = this._fleetDisputesURL;
            const method = (this._fleetDisputesMethod || '').toUpperCase();
            const isDisputesApi = url && (String(url).includes('/api/disputes'));
            if (isDisputesApi && method === 'GET') {
                this.addEventListener('load', function () {
                    try {
                        const text = this.responseText;
                        if (text) {
                            const data = JSON.parse(text);
                            if (data && Array.isArray(data.disputes)) {
                                context.disputesData = data.disputes;
                                Logger.log(`Dispute IDs Enhancer: captured ${data.disputes.length} disputes from API (XHR)`);
                                self.updateDisputesCache(data.disputes);
                                self.scheduleInjectionRetries(context, state);
                            }
                        }
                    } catch (e) {
                        Logger.debug('Dispute IDs Enhancer: failed to parse disputes XHR response', e);
                    }
                });
            }
            return originalXHRSend.apply(this, [body]);
        };

        state.interceptionInstalled = true;
        Logger.log('Dispute IDs Enhancer: network interception installed');
    },

    injectDisputeIds(context, state) {
        this.ensureCopyConfirmationStyle();
        const cards = document.querySelectorAll('[data-ui="dispute-card"]');
        const disputes = context.disputesData;
        if (!Array.isArray(disputes) || disputes.length === 0) return;
        if (cards.length === 0 && state && !state.loggedNoCardsYet) {
            state.loggedNoCardsYet = true;
            Logger.log('Dispute IDs Enhancer: have data but no cards yet (will retry)');
        }
        let injected = 0;
        cards.forEach((card, i) => {
            if (card.querySelector('[data-fleet-dispute-ids]')) return;
            const dispute = disputes[i];
            if (!dispute) return;
            const row = this.buildIdsRow(dispute);
            if (!row) return;
            const container = card.querySelector('[class*="space-y-1.5"][class*="p-4"]') || card.firstElementChild;
            if (!container) {
                Logger.debug('Dispute IDs Enhancer: no container found for card', i);
                return;
            }
            container.insertBefore(row, container.firstChild);
            injected++;
        });
        if (injected > 0) {
            Logger.log(`Dispute IDs Enhancer: injected IDs for ${injected} dispute card(s)`);
        }
    },

    ensureCopyConfirmationStyle() {
        if (document.getElementById('fleet-dispute-ids-copy-style')) return;
        const style = document.createElement('style');
        style.id = 'fleet-dispute-ids-copy-style';
        style.textContent = '.fleet-dispute-id-copied { background-color: rgb(22 163 74) !important; color: white !important; border-color: rgb(22 163 74) !important; }';
        (document.head || document.documentElement).appendChild(style);
    },

    buildCopyButton(label, value) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-7 rounded-sm pl-2 pr-2 text-xs font-mono';
        btn.textContent = value;
        btn.title = `Copy ${value}`;
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(value).then(() => {
                btn.classList.add('fleet-dispute-id-copied');
                Logger.log(`Dispute IDs Enhancer: copied ${label} to clipboard`);
                setTimeout(() => btn.classList.remove('fleet-dispute-id-copied'), 3000);
            }).catch((err) => {
                Logger.error('Dispute IDs Enhancer: failed to copy', err);
            });
        });
        return btn;
    },

    buildIdsRow(dispute) {
        const hasDispute = dispute.id != null;
        const hasTask = dispute.eval_task_id;
        if (!hasDispute && !hasTask) return null;

        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-fleet-dispute-ids', '');
        wrapper.className = 'flex flex-wrap gap-2 items-center mb-2';

        if (hasDispute) {
            const label = document.createElement('span');
            label.className = 'text-xs text-muted-foreground font-medium';
            label.textContent = 'Dispute:';
            wrapper.appendChild(label);
            wrapper.appendChild(this.buildCopyButton('Dispute ID', String(dispute.id)));
        }
        if (hasTask) {
            const label = document.createElement('span');
            label.className = 'text-xs text-muted-foreground font-medium';
            label.textContent = 'Task:';
            wrapper.appendChild(label);
            wrapper.appendChild(this.buildCopyButton('Task ID', dispute.eval_task_id));
        }
        return wrapper;
    }
};
