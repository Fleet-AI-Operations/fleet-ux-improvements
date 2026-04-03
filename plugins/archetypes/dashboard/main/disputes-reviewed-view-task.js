// ============= disputes-reviewed-view-task.js =============
// Captures dispute-reviews/history API responses on the dashboard Disputes tab and adds a View Task link per row (task_key → eval_task_id).

const plugin = {
    id: 'disputesReviewedViewTask',
    name: 'Disputes Reviewed View Task Links',
    description: 'Add a View Task link next to each task key in the Disputes Reviewed table using eval_task_id from the history API',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        interceptionInstalled: false,
        missingLogged: false,
        loggedFirstHistoryCapture: false
    },

    mergeHistoryPayload(context, disputes) {
        if (!context.disputeReviewHistoryTaskKeyToEvalId) {
            context.disputeReviewHistoryTaskKeyToEvalId = Object.create(null);
        }
        const map = context.disputeReviewHistoryTaskKeyToEvalId;
        let added = 0;
        for (const d of disputes) {
            if (d && d.task_key && d.eval_task_id) {
                map[d.task_key] = d.eval_task_id;
                added++;
            }
        }
        return added;
    },

    installDisputeHistoryInterception(context, state) {
        const pageWindow = context.getPageWindow();
        if (pageWindow.__fleetDisputeReviewHistoryInterceptionInstalled) {
            state.interceptionInstalled = true;
            return;
        }
        pageWindow.__fleetDisputeReviewHistoryInterceptionInstalled = true;

        const self = this;

        const matchesHistoryRequest = (urlStr, method) => {
            const m = (method || 'GET').toUpperCase();
            if (m !== 'GET') return false;
            return String(urlStr).includes('dispute-reviews/history');
        };

        const onDisputesPayload = (data) => {
            if (!data || !Array.isArray(data.disputes)) return;
            const n = self.mergeHistoryPayload(context, data.disputes);
            if (n > 0) {
                const totalKeys = Object.keys(context.disputeReviewHistoryTaskKeyToEvalId).length;
                if (!state.loggedFirstHistoryCapture) {
                    state.loggedFirstHistoryCapture = true;
                    Logger.log(`disputes-reviewed-view-task: captured dispute history (${n} in this response, ${totalKeys} task keys mapped)`);
                } else {
                    Logger.debug(`disputes-reviewed-view-task: history page merged (+${n} rows, ${totalKeys} keys total)`);
                }
                const pageWindow = context.getPageWindow();
                pageWindow.requestAnimationFrame(() => {
                    try {
                        const main = Context.dom.query('main', { context: `${self.id}.history-sync` });
                        if (!main) return;
                        const table = self.findDisputesReviewedTable(main);
                        const map = context.disputeReviewHistoryTaskKeyToEvalId;
                        if (table && map) {
                            self.syncViewTaskLinks(table, map);
                        }
                    } catch (e) {
                        Logger.error('disputes-reviewed-view-task: sync after history response failed', e);
                    }
                });
            }
        };

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
                const method = config && config.method ? String(config.method) : 'GET';
                if (matchesHistoryRequest(url.href, method)) {
                    return originalFetch.apply(this, args).then(async (response) => {
                        if (!response.ok) return response;
                        try {
                            const clone = response.clone();
                            const data = await clone.json();
                            onDisputesPayload(data);
                        } catch (e) {
                            Logger.debug('disputes-reviewed-view-task: failed to parse history JSON (fetch)', e);
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
            this._fleetDisputeHistoryURL = url;
            this._fleetDisputeHistoryMethod = method;
            return originalXHROpen.apply(this, [method, url, ...rest]);
        };
        pageWindow.XMLHttpRequest.prototype.send = function (body) {
            const url = this._fleetDisputeHistoryURL;
            const method = this._fleetDisputeHistoryMethod || 'GET';
            if (matchesHistoryRequest(url, method)) {
                this.addEventListener('load', function () {
                    try {
                        const text = this.responseText;
                        if (!text) return;
                        const data = JSON.parse(text);
                        onDisputesPayload(data);
                    } catch (e) {
                        Logger.debug('disputes-reviewed-view-task: failed to parse history XHR', e);
                    }
                });
            }
            return originalXHRSend.apply(this, [body]);
        };

        state.interceptionInstalled = true;
        Logger.log('disputes-reviewed-view-task: dispute history network interception installed');
    },

    findDisputesReviewedTable(main) {
        const panels = main.querySelectorAll('[role="tabpanel"]');
        for (const panel of panels) {
            const table = panel.querySelector('table');
            if (!table || !table.tHead) continue;
            const thText = table.tHead.textContent || '';
            if (thText.includes('Date') && thText.includes('Task') && thText.includes('Outcome') && !thText.includes('Environment')) {
                const totalReviewedHeading = panel.querySelector('h3.tracking-tight');
                if (totalReviewedHeading && totalReviewedHeading.textContent.trim() === 'Total Reviewed') {
                    return table;
                }
            }
        }
        return null;
    },

    /**
     * Task key from the prompt UI only — never use taskCell.textContent: after we inject
     * "View Task", the full cell text is not a valid map key and caused add/remove thrash.
     */
    getTaskKeyFromCell(taskCell) {
        if (!taskCell) return '';
        const inner = taskCell.querySelector('.fleet-progress-prompt-inner div');
        if (inner) {
            const key = (inner.textContent || '').trim();
            if (key) {
                taskCell.dataset.fleetDisputeReviewedTaskKey = key;
                return key;
            }
        }
        const wrap = taskCell.querySelector('.fleet-progress-prompt-inner');
        if (wrap) {
            const key = (wrap.textContent || '').trim();
            if (key) {
                taskCell.dataset.fleetDisputeReviewedTaskKey = key;
                return key;
            }
        }
        const cached = (taskCell.dataset.fleetDisputeReviewedTaskKey || '').trim();
        return cached;
    },

    VIEW_LINK_ATTR: 'data-fleet-disputes-reviewed-view-task',

    syncViewTaskLinks(table, map) {
        if (!table || !map) return;
        const rows = table.querySelectorAll('tbody tr');
        let injected = 0;
        for (const tr of rows) {
            const taskCell = tr.cells[1];
            if (!taskCell) continue;
            const taskKey = this.getTaskKeyFromCell(taskCell);
            const evalId = taskKey ? map[taskKey] : '';
            let link = taskCell.querySelector(`[${this.VIEW_LINK_ATTR}]`);
            if (evalId) {
                const href = `https://www.fleetai.com/work/problems/view-task/${evalId}`;
                if (!link) {
                    link = document.createElement('a');
                    link.setAttribute(this.VIEW_LINK_ATTR, 'true');
                    link.className =
                        'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-7 rounded-sm px-2 text-xs shrink-0';
                    link.textContent = 'View Task';
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.href = href;
                    if (!taskCell.classList.contains('flex')) {
                        taskCell.classList.add('flex', 'flex-wrap', 'items-center', 'gap-2');
                    }
                    taskCell.appendChild(link);
                    injected++;
                } else {
                    link.href = href;
                }
            } else if (taskKey && !evalId && link) {
                link.remove();
                delete taskCell.dataset.fleetDisputeReviewedTaskKey;
            }
        }
        if (injected > 0) {
            Logger.log(`disputes-reviewed-view-task: added View Task link(s) to ${injected} row(s)`);
        }
    },

    onMutation(state, context) {
        this.installDisputeHistoryInterception(context, state);

        const main = Context.dom.query('main', { context: `${this.id}.main` });
        if (!main) {
            if (!state.missingLogged) {
                Logger.debug('disputes-reviewed-view-task: main not found');
                state.missingLogged = true;
            }
            return;
        }

        const table = this.findDisputesReviewedTable(main);
        if (!table) {
            if (!state.missingLogged) {
                Logger.debug('disputes-reviewed-view-task: Disputes Reviewed table not found');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        const map = context.disputeReviewHistoryTaskKeyToEvalId;
        if (map && Object.keys(map).length > 0) {
            this.syncViewTaskLinks(table, map);
        }
    }
};
