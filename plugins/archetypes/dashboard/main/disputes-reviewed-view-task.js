// ============= disputes-reviewed-view-task.js =============
// Captures dispute-reviews/history API on dashboard Disputes tab; inserts a column between Task and Outcome with View Task links (task_key → eval_task_id).

const plugin = {
    id: 'disputesReviewedViewTask',
    name: 'Disputes Reviewed View Task Links',
    description: 'Insert a View Task column on the Disputes Reviewed table using eval_task_id from the history API',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        interceptionInstalled: false,
        missingLogged: false,
        loggedFirstHistoryCapture: false,
        loggedColumnInject: false
    },

    ACTION_COL_ATTR: 'data-fleet-drvt-action-col',
    ACTION_CELL_ATTR: 'data-fleet-drvt-action-cell',

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

        const scheduleSyncFromHistory = () => {
            const pw = context.getPageWindow();
            pw.requestAnimationFrame(() => {
                try {
                    const main = Context.dom.query('main', { context: `${self.id}.history-sync` });
                    if (!main) return;
                    const table = self.findDisputesReviewedTable(main);
                    if (!table) return;
                    const map = context.disputeReviewHistoryTaskKeyToEvalId || {};
                    self.syncViewTaskLinks(table, map, state);
                } catch (e) {
                    Logger.error('disputes-reviewed-view-task: sync after history response failed', e);
                }
            });
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
                scheduleSyncFromHistory();
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
     * Task column only (no View Task in this cell — link lives in the injected column).
     */
    getTaskKeyFromCell(taskCell) {
        if (!taskCell) return '';
        const inner = taskCell.querySelector('.fleet-progress-prompt-inner div');
        if (inner) {
            const key = (inner.textContent || '').trim();
            if (key) return key;
        }
        const wrap = taskCell.querySelector('.fleet-progress-prompt-inner');
        if (wrap) {
            const key = (wrap.textContent || '').trim();
            if (key) return key;
        }
        return (taskCell.textContent || '').trim();
    },

    VIEW_LINK_ATTR: 'data-fleet-disputes-reviewed-view-task',

    ensureActionColumn(table, state) {
        const theadRow = table.tHead && table.tHead.rows[0];
        const tbody = table.tBodies[0];
        if (!theadRow || !tbody) return;

        const hasOurHeader = theadRow.querySelector(`th[${this.ACTION_COL_ATTR}]`);

        if (hasOurHeader) {
            for (const tr of tbody.rows) {
                if (tr.cells.length >= 4 && tr.cells[2] && tr.cells[2].hasAttribute(this.ACTION_CELL_ATTR)) {
                    continue;
                }
                if (tr.cells.length === 3) {
                    const td = this.createActionBodyCell(tr.cells[1]);
                    tr.insertBefore(td, tr.cells[2]);
                }
            }
            return;
        }

        if (theadRow.cells.length !== 3) {
            Logger.debug('disputes-reviewed-view-task: skip column insert — thead column count is not 3', {
                count: theadRow.cells.length
            });
            return;
        }

        const th = document.createElement('th');
        th.setAttribute(this.ACTION_COL_ATTR, 'true');
        th.setAttribute('scope', 'col');
        th.className = theadRow.cells[1].className;
        th.textContent = '';
        theadRow.insertBefore(th, theadRow.cells[2]);

        for (const tr of tbody.rows) {
            if (tr.cells.length !== 3) continue;
            const td = this.createActionBodyCell(tr.cells[1]);
            tr.insertBefore(td, tr.cells[2]);
        }

        if (!state.loggedColumnInject) {
            state.loggedColumnInject = true;
            Logger.log('disputes-reviewed-view-task: inserted View Task column between Task and Outcome');
        }
    },

    createActionBodyCell(taskTdRef) {
        const td = document.createElement('td');
        td.setAttribute(this.ACTION_CELL_ATTR, 'true');
        const refClass = (taskTdRef && taskTdRef.className) || '';
        td.className = refClass
            .replace(/\bmax-w-\[[^\]]+\]\b/g, '')
            .replace(/\btruncate\b/g, '')
            .trim();
        if (!td.className) {
            td.className = 'p-2 align-middle text-xs whitespace-nowrap';
        } else {
            td.classList.add('whitespace-nowrap');
        }
        return td;
    },

    syncViewTaskLinks(table, map, state) {
        if (!table) return;
        const lookup = map || {};
        this.ensureActionColumn(table, state);

        if (Object.keys(lookup).length === 0) {
            return;
        }

        const rows = table.querySelectorAll('tbody tr');
        let injected = 0;
        for (const tr of rows) {
            if (tr.cells.length < 4) continue;
            const taskCell = tr.cells[1];
            const actionCell = tr.cells[2];
            if (!taskCell || !actionCell || !actionCell.hasAttribute(this.ACTION_CELL_ATTR)) continue;

            const taskKey = this.getTaskKeyFromCell(taskCell);
            const evalId = taskKey ? lookup[taskKey] : '';
            let link = actionCell.querySelector(`[${this.VIEW_LINK_ATTR}]`);

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
                    actionCell.appendChild(link);
                    injected++;
                } else {
                    link.href = href;
                }
            } else if (taskKey && link) {
                link.remove();
            } else if (!taskKey && link) {
                link.remove();
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
        const map = context.disputeReviewHistoryTaskKeyToEvalId || {};
        this.syncViewTaskLinks(table, map, state);
    }
};
