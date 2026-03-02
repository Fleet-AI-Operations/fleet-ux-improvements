// ============= dispute-ids-enhancer.js =============
// Intercepts /api/disputes response and surfaces dispute id, feedback_id, user_id, eval_task_id, team_id on each card.

const plugin = {
    id: 'disputeIdsEnhancer',
    name: 'Dispute IDs Enhancer',
    description: 'Surface API IDs (dispute, feedback, task, team, user) on dispute review cards by intercepting the disputes API response.',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { interceptionInstalled: false },

    onMutation(state, context) {
        if (!state.interceptionInstalled) {
            this.installDisputesInterception(context, state);
        }
        if (context.disputesData && Array.isArray(context.disputesData)) {
            this.injectDisputeIds(context);
        }
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
                                setTimeout(() => self.injectDisputeIds(context), 0);
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
                                setTimeout(() => self.injectDisputeIds(context), 0);
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

    injectDisputeIds(context) {
        const cards = document.querySelectorAll('[data-ui="dispute-card"]');
        const disputes = context.disputesData;
        if (!Array.isArray(disputes) || disputes.length === 0) return;
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
            container.appendChild(row);
            injected++;
        });
        if (injected > 0) {
            Logger.log(`Dispute IDs Enhancer: injected IDs for ${injected} dispute card(s)`);
        }
    },

    buildIdsRow(dispute) {
        const div = document.createElement('div');
        div.setAttribute('data-fleet-dispute-ids', '');
        div.className = 'mt-1.5 text-xs text-muted-foreground font-mono break-all';
        const parts = [];
        if (dispute.id != null) parts.push(`Dispute: ${dispute.id}`);
        if (dispute.feedback_id != null) parts.push(`Feedback: ${dispute.feedback_id}`);
        if (dispute.eval_task_id) parts.push(`Task: ${dispute.eval_task_id}`);
        if (dispute.team_id) parts.push(`Team: ${dispute.team_id}`);
        if (dispute.user_id) parts.push(`User: ${dispute.user_id}`);
        if (parts.length === 0) return null;
        div.textContent = parts.join(' · ');
        div.title = parts.join('\n');
        return div;
    }
};
