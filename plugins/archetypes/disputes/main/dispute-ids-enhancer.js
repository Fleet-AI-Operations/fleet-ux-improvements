// ============= dispute-ids-enhancer.js =============
// Intercepts /api/disputes response and surfaces dispute id and eval_task_id at top of each card as copy buttons.

const plugin = {
    id: 'disputeIdsEnhancer',
    name: 'Dispute IDs Enhancer',
    description: 'Surface Dispute and Task IDs at top of dispute cards as copy buttons with green confirmation.',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { interceptionInstalled: false, loggedNoCardsYet: false },

    onMutation(state, context) {
        if (!state.interceptionInstalled) {
            this.installDisputesInterception(context, state);
        }
        if (context.disputesData && Array.isArray(context.disputesData)) {
            this.injectDisputeIds(context, state);
        }
    },

    scheduleInjectionRetries(context) {
        const self = this;
        const delays = [0, 150, 400, 800];
        delays.forEach((delayMs, k) => {
            setTimeout(() => {
                Logger.debug(`Dispute IDs Enhancer: retry inject (attempt ${k + 1}/${delays.length})`);
                self.injectDisputeIds(context, self.state);
            }, delayMs);
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
                                self.scheduleInjectionRetries(context);
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
                                self.scheduleInjectionRetries(context);
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
