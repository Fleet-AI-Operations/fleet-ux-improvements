// ============= dispute-list-filters.js =============
// Filter Dispute Review cards by environment (checkbox dropdown from visible
// card badges) and by submitted date (after/before via GET /api/disputes).

const TOOLBAR_ATTR = 'data-fleet-dispute-list-filters';
const FILTERED_ATTR = 'data-fleet-dispute-filtered';
const STYLE_ID = 'fleet-dispute-list-filters-style';
const WATCHER_ID = 'dispute-list-filters-api-watcher';
const TASK_HREF_RE = /\/work\/problems\/view-task\/([0-9a-f-]{36})/i;
const SCOPE_SEL = '[data-fleet-dispute-list-filters="1"]';

const plugin = {
    id: 'disputeListFilters',
    name: 'Dispute List Filters',
    description: 'Filter visible disputes by environment and date submitted',
    _version: '1.5',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        subscribed: false,
        disputes: null,
        captureLogged: false,
        waitingLogged: false,
        activationLogged: false,
        missingLogged: false,
        fallbackRequested: false,
        fallbackInFlight: false,
        fallbackAttempts: 0,
        selectedEnvs: null,
        envOptions: [],
        envCounts: {},
        _prevEnvOptions: [],
        afterDate: '',
        beforeDate: '',
        panelOpen: false,
        docListenersBound: false,
        lastEnvKey: '',
        lastCardCount: -1
    },

    onMutation(state) {
        this.ensureSubscription(state);
        this.ensureStyles();

        const mountAnchor = this.findSearchMount();
        if (!mountAnchor) {
            if (!state.missingLogged) {
                Logger.debug(`${this.id}: search mount not found`);
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        let toolbar = mountAnchor.closest(SCOPE_SEL);
        if (!toolbar) {
            const orphan = document.querySelector(SCOPE_SEL);
            if (orphan) orphan.remove();
            toolbar = this.mountToolbar(state, mountAnchor);
            if (!toolbar) return;
        }

        if (!(Array.isArray(state.disputes) && state.disputes.length > 0)) {
            const cards = this.getLeafDisputeCards();
            if (cards.length > 0 && !state.fallbackRequested) {
                if (!state.waitingLogged) {
                    Logger.debug(`${this.id}: cards present but no /api/disputes data yet; requesting fallback`);
                    state.waitingLogged = true;
                }
                this.requestDisputesFallback(state);
            }
        }

        this.refreshEnvOptions(state);
        this.applyFilters(state, { quiet: true });
    },

    ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `[${FILTERED_ATTR}="1"] { display: none !important; }`;
        (document.head || document.documentElement).appendChild(style);
    },

    findSearchMount() {
        const input = document.querySelector(
            'input[placeholder*="Search by prompt"], input[placeholder*="Search by prompt, dispute"]'
        );
        if (!input) return null;
        return input.closest('.relative.mt-3') || input.parentElement;
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

    getEnvFromCard(card) {
        const meta = card.querySelector('.mt-2.flex.items-center.gap-4');
        if (!meta) return '';
        const badge = meta.querySelector('span.border-secondary');
        if (!badge) return '';
        return (badge.textContent || '').trim();
    },

    resolveDisputeForCard(card, disputes, index) {
        if (!Array.isArray(disputes) || disputes.length === 0) return null;

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

        const reviewLink = card.querySelector('a[href*="/work/problems/disputes/"]');
        if (reviewLink) {
            const reviewHref = reviewLink.getAttribute('href') || '';
            const idMatch = reviewHref.match(/\/work\/problems\/disputes\/(\d+)/);
            if (idMatch) {
                const byId = disputes.find(d => d && String(d.id) === idMatch[1]);
                if (byId) return byId;
            }
        }

        const idBadge = card.querySelector('[data-fleet-dispute-id]');
        if (idBadge) {
            const id = idBadge.getAttribute('data-fleet-dispute-id');
            const byBadge = disputes.find(d => d && String(d.id) === id);
            if (byBadge) return byBadge;
        }

        return disputes[index] || null;
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
                    if (!state.captureLogged) {
                        Logger.log(`${self.id}: captured ${body.disputes.length} disputes from /api/disputes`);
                        state.captureLogged = true;
                    } else {
                        Logger.debug(`${self.id}: refreshed ${body.disputes.length} disputes from /api/disputes`);
                    }
                    self.applyFilters(state);
                }).catch(err => {
                    Logger.debug(`${self.id}: failed to parse /api/disputes response`, err);
                });
            }
        });
        state.subscribed = true;
        Logger.debug(`${this.id}: subscribed to NetworkObserver for GET /api/disputes`);
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
                self.applyFilters(state);
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
    },

    mountToolbar(state, mountAnchor) {
        if (!mountAnchor || !mountAnchor.parentNode) return null;

        const already = mountAnchor.closest(SCOPE_SEL);
        if (already) return already;

        const ui = Context.uiLib;
        if (ui && typeof ui.ensureButtonStyles === 'function') {
            ui.ensureButtonStyles(SCOPE_SEL);
        }

        const toolbar = document.createElement('div');
        toolbar.setAttribute(TOOLBAR_ATTR, '1');
        toolbar.setAttribute('data-fleet-plugin', this.id);
        toolbar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:0.75rem;width:100%;';

        const controls = document.createElement('div');
        controls.setAttribute('data-fleet-dlf-controls', '1');
        controls.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex-shrink:0;';

        const envWrap = document.createElement('div');
        envWrap.setAttribute('data-fleet-dlf-env-wrap', '1');
        envWrap.style.cssText = 'position:relative;display:inline-flex;';

        const envBtn = document.createElement('button');
        envBtn.type = 'button';
        envBtn.setAttribute('data-fleet-dlf-env-btn', '1');
        envBtn.className = (ui && ui.btnClass) ? ui.btnClass('basic', 'compact') : 'wf-dash-btn';
        envBtn.textContent = 'Environment';
        envBtn.setAttribute('aria-haspopup', 'listbox');
        envBtn.setAttribute('aria-expanded', 'false');

        const panel = document.createElement('div');
        panel.setAttribute('data-fleet-dlf-env-panel', '1');
        panel.hidden = true;
        panel.style.cssText = [
            'position:absolute',
            'top:calc(100% + 4px)',
            'left:0',
            'z-index:50',
            'min-width:12rem',
            'max-height:16rem',
            'overflow:auto',
            'padding:8px',
            'border:1px solid var(--border, #e5e7eb)',
            'border-radius:6px',
            'background:var(--background, #fff)',
            'box-shadow:0 4px 12px rgba(0,0,0,0.08)',
            'display:none',
            'flex-direction:column',
            'gap:4px'
        ].join(';');

        envWrap.appendChild(envBtn);
        envWrap.appendChild(panel);

        const afterLabel = document.createElement('label');
        afterLabel.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--muted-foreground,#6b7280);';
        afterLabel.appendChild(document.createTextNode('After'));
        const afterInput = document.createElement('input');
        afterInput.type = 'date';
        afterInput.setAttribute('data-fleet-dlf-after', '1');
        afterInput.style.cssText = 'height:28px;font-size:12px;padding:2px 6px;border:1px solid var(--input,#e5e7eb);border-radius:6px;background:transparent;';
        afterLabel.appendChild(afterInput);

        const beforeLabel = document.createElement('label');
        beforeLabel.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--muted-foreground,#6b7280);';
        beforeLabel.appendChild(document.createTextNode('Before'));
        const beforeInput = document.createElement('input');
        beforeInput.type = 'date';
        beforeInput.setAttribute('data-fleet-dlf-before', '1');
        beforeInput.style.cssText = 'height:28px;font-size:12px;padding:2px 6px;border:1px solid var(--input,#e5e7eb);border-radius:6px;background:transparent;';
        beforeLabel.appendChild(beforeInput);

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.setAttribute('data-fleet-dlf-clear', '1');
        clearBtn.className = (ui && ui.btnClass) ? ui.btnClass('secondary', 'compact') : 'wf-dash-btn';
        clearBtn.textContent = 'Clear';

        controls.appendChild(envWrap);
        controls.appendChild(afterLabel);
        controls.appendChild(beforeLabel);
        controls.appendChild(clearBtn);

        // Search left, filters + Clear on the right — same row
        mountAnchor.parentNode.insertBefore(toolbar, mountAnchor);
        mountAnchor.classList.remove('mt-3', 'max-w-sm');
        mountAnchor.style.flex = '1 1 14rem';
        mountAnchor.style.minWidth = '12rem';
        mountAnchor.style.maxWidth = 'none';
        mountAnchor.style.marginTop = '0';
        toolbar.appendChild(mountAnchor);
        toolbar.appendChild(controls);

        const self = this;
        envBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            state.panelOpen = !state.panelOpen;
            self.syncPanelOpen(state, toolbar);
        });

        afterInput.addEventListener('change', () => {
            state.afterDate = afterInput.value || '';
            self.applyFilters(state);
        });
        beforeInput.addEventListener('change', () => {
            state.beforeDate = beforeInput.value || '';
            self.applyFilters(state);
        });

        clearBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            self.clearFilters(state, toolbar);
        });

        if (!state.docListenersBound) {
            document.addEventListener('click', (ev) => {
                if (!state.panelOpen) return;
                const wrap = document.querySelector('[data-fleet-dlf-env-wrap="1"]');
                if (wrap && wrap.contains(ev.target)) return;
                state.panelOpen = false;
                const tb = document.querySelector(SCOPE_SEL);
                if (tb) self.syncPanelOpen(state, tb);
            }, true);
            document.addEventListener('keydown', (ev) => {
                if (ev.key !== 'Escape' || !state.panelOpen) return;
                state.panelOpen = false;
                const tb = document.querySelector(SCOPE_SEL);
                if (tb) self.syncPanelOpen(state, tb);
            });
            state.docListenersBound = true;
        }

        if (!state.activationLogged) {
            Logger.log(`${this.id}: filter toolbar mounted`);
            state.activationLogged = true;
        }

        this.renderEnvPanel(state, toolbar);
        this.updateEnvButtonLabel(state, toolbar);
        return toolbar;
    },

    syncPanelOpen(state, toolbar) {
        const panel = toolbar.querySelector('[data-fleet-dlf-env-panel="1"]');
        const btn = toolbar.querySelector('[data-fleet-dlf-env-btn="1"]');
        if (!panel || !btn) return;
        panel.hidden = !state.panelOpen;
        // hidden attribute toggles visibility; ensure flex layout when open
        if (state.panelOpen) {
            panel.style.display = 'flex';
        } else {
            panel.style.display = 'none';
        }
        btn.setAttribute('aria-expanded', state.panelOpen ? 'true' : 'false');
    },

    refreshEnvOptions(state) {
        const cards = this.getLeafDisputeCards();
        const counts = {};
        for (const card of cards) {
            const env = this.getEnvFromCard(card);
            if (!env) continue;
            counts[env] = (counts[env] || 0) + 1;
        }
        const options = Object.keys(counts).sort((a, b) => a.localeCompare(b));
        const key = options.map(env => env + ':' + counts[env]).join('\0');
        const cardCount = cards.length;

        if (key === state.lastEnvKey && cardCount === state.lastCardCount) {
            return;
        }

        const prevOptions = state._prevEnvOptions || state.envOptions || [];
        const prevOptionSet = new Set(prevOptions);
        const prevSelected = state.selectedEnvs;

        state.lastEnvKey = key;
        state.lastCardCount = cardCount;
        state.envOptions = options;
        state.envCounts = counts;

        if (prevSelected == null) {
            state.selectedEnvs = new Set(options);
        } else {
            const next = new Set();
            for (const env of options) {
                if (!prevOptionSet.has(env)) {
                    next.add(env);
                } else if (prevSelected.has(env)) {
                    next.add(env);
                }
            }
            state.selectedEnvs = next;
        }
        state._prevEnvOptions = options.slice();

        const toolbar = document.querySelector(SCOPE_SEL);
        if (toolbar) {
            this.renderEnvPanel(state, toolbar);
            this.updateEnvButtonLabel(state, toolbar);
        }
    },

    renderEnvPanel(state, toolbar) {
        const panel = toolbar.querySelector('[data-fleet-dlf-env-panel="1"]');
        if (!panel) return;

        panel.textContent = '';
        const options = state.envOptions || [];
        const counts = state.envCounts || {};

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:6px;margin-bottom:4px;';

        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.textContent = 'All';
        allBtn.style.cssText = 'font-size:11px;padding:2px 6px;cursor:pointer;border:1px solid var(--border,#e5e7eb);border-radius:4px;background:transparent;';
        allBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            state.selectedEnvs = new Set(options);
            this.renderEnvPanel(state, toolbar);
            this.updateEnvButtonLabel(state, toolbar);
            this.applyFilters(state);
        });

        const noneBtn = document.createElement('button');
        noneBtn.type = 'button';
        noneBtn.textContent = 'None';
        noneBtn.style.cssText = allBtn.style.cssText;
        noneBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            state.selectedEnvs = new Set();
            this.renderEnvPanel(state, toolbar);
            this.updateEnvButtonLabel(state, toolbar);
            this.applyFilters(state);
        });

        actions.appendChild(allBtn);
        actions.appendChild(noneBtn);
        panel.appendChild(actions);

        if (options.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'font-size:12px;color:var(--muted-foreground,#6b7280);padding:4px 2px;';
            empty.textContent = 'No environments in results';
            panel.appendChild(empty);
            return;
        }

        const selected = state.selectedEnvs || new Set();
        for (const env of options) {
            const row = document.createElement('label');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:2px 0;';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = env;
            cb.checked = selected.has(env);
            cb.addEventListener('change', () => {
                if (!state.selectedEnvs) state.selectedEnvs = new Set();
                if (cb.checked) state.selectedEnvs.add(env);
                else state.selectedEnvs.delete(env);
                this.updateEnvButtonLabel(state, toolbar);
                this.applyFilters(state);
            });

            const countEl = document.createElement('span');
            countEl.style.cssText = 'min-width:1.25rem;text-align:right;font-variant-numeric:tabular-nums;color:var(--muted-foreground,#6b7280);';
            countEl.textContent = String(counts[env] || 0);

            const nameEl = document.createElement('span');
            nameEl.textContent = env;

            row.appendChild(cb);
            row.appendChild(countEl);
            row.appendChild(nameEl);
            panel.appendChild(row);
        }
    },

    updateEnvButtonLabel(state, toolbar) {
        const btn = toolbar.querySelector('[data-fleet-dlf-env-btn="1"]');
        if (!btn) return;
        const total = (state.envOptions || []).length;
        const selected = state.selectedEnvs ? state.selectedEnvs.size : 0;
        if (total === 0) {
            btn.textContent = 'Environment';
        } else if (selected === total) {
            btn.textContent = `Environment (${total})`;
        } else {
            btn.textContent = `Environment (${selected}/${total})`;
        }
    },

    clearFilters(state, toolbar) {
        state.selectedEnvs = new Set(state.envOptions || []);
        state.afterDate = '';
        state.beforeDate = '';
        const afterInput = toolbar.querySelector('[data-fleet-dlf-after="1"]');
        const beforeInput = toolbar.querySelector('[data-fleet-dlf-before="1"]');
        if (afterInput) afterInput.value = '';
        if (beforeInput) beforeInput.value = '';
        this.renderEnvPanel(state, toolbar);
        this.updateEnvButtonLabel(state, toolbar);
        this.applyFilters(state);
        Logger.log(`${this.id}: filters cleared`);
    },

    parseDayBounds(afterStr, beforeStr) {
        let afterMs = null;
        let beforeMs = null;
        if (afterStr) {
            const d = new Date(afterStr + 'T00:00:00');
            if (!Number.isNaN(d.getTime())) afterMs = d.getTime();
        }
        if (beforeStr) {
            const d = new Date(beforeStr + 'T23:59:59.999');
            if (!Number.isNaN(d.getTime())) beforeMs = d.getTime();
        }
        return { afterMs, beforeMs };
    },

    cardMatches(state, card, index, bounds, allEnvsSelected) {
        const env = this.getEnvFromCard(card);
        const selected = state.selectedEnvs || new Set();

        if (selected.size === 0 && (state.envOptions || []).length > 0) {
            return false;
        }
        if (!allEnvsSelected) {
            if (!env || !selected.has(env)) return false;
        }

        const { afterMs, beforeMs } = bounds;
        const dateActive = afterMs != null || beforeMs != null;
        if (dateActive) {
            if (!Array.isArray(state.disputes) || state.disputes.length === 0) {
                return true;
            }
            const dispute = this.resolveDisputeForCard(card, state.disputes, index);
            const created = dispute && dispute.created_at ? Date.parse(dispute.created_at) : NaN;
            if (Number.isNaN(created)) return false;
            if (afterMs != null && created < afterMs) return false;
            if (beforeMs != null && created > beforeMs) return false;
        }

        return true;
    },

    applyFilters(state, opts) {
        const quiet = opts && opts.quiet;
        const cards = this.getLeafDisputeCards();
        const options = state.envOptions || [];
        const selected = state.selectedEnvs || new Set(options);
        const allEnvsSelected = options.length === 0 || selected.size === options.length;
        const bounds = this.parseDayBounds(state.afterDate, state.beforeDate);

        let shown = 0;
        let hidden = 0;
        cards.forEach((card, index) => {
            const match = this.cardMatches(state, card, index, bounds, allEnvsSelected);
            if (match) {
                if (card.getAttribute(FILTERED_ATTR) === '1') {
                    card.removeAttribute(FILTERED_ATTR);
                }
                shown++;
            } else {
                card.setAttribute(FILTERED_ATTR, '1');
                hidden++;
            }
        });

        const dateActive = bounds.afterMs != null || bounds.beforeMs != null;
        const filtering = (!allEnvsSelected) || dateActive || (selected.size === 0 && options.length > 0);
        if (!quiet && filtering) {
            Logger.log(`${this.id}: filter applied — shown ${shown}, hidden ${hidden}`);
        } else if (!quiet && !filtering) {
            Logger.debug(`${this.id}: no active filters — showing ${shown} card(s)`);
        }
    }
};
