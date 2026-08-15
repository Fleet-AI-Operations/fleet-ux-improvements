// ============= task-creation-today-env.js =============
const plugin = {
    id: 'taskCreationTodayEnv',
    name: 'Daily Task Creation Breakdown',
    description: 'Show task creation count and environment breakdown for a selected day under the Task Creation stat',
    _version: '5.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, activationLogged: false },

    flashCopyButtonSuccess(btn) {
        if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(btn, { restoreStyles: false });
    },

    flashCopyButtonFailure(btn) {
        if (Context.buttonFeedback) Context.buttonFeedback.flashFailure(btn, { restoreStyles: false });
    },

    MONTH_NAMES: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],

    dateNDaysAgo(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return { month: d.getMonth() + 1, day: d.getDate(), year: d.getFullYear() };
    },

    formatDateLabel(ref) {
        if (!ref || ref.month == null) return '—';
        return `${this.MONTH_NAMES[ref.month - 1]} ${ref.day}, ${ref.year}`;
    },

    findTaskCreationTable(main) {
        const panels = main.querySelectorAll('[role="tabpanel"]');
        for (const panel of panels) {
            const table = panel.querySelector('table');
            if (!table || !table.tHead) continue;
            const thText = table.tHead.textContent || '';
            if (thText.includes('Submitted') && thText.includes('Environment')) {
                return table;
            }
        }
        return null;
    },

    buildCopyText(stats) {
        const count = stats && typeof stats.count === 'number' ? stats.count : 0;
        const envCount = (stats && stats.envCount) || Object.create(null);
        const lines = [
            `Task Creation: ${count} tasks.`,
            ...Object.entries(envCount)
                .sort((a, b) => b[1] - a[1])
                .map(([name, n]) => `${name}: ${n}`)
        ];
        return lines.join('\n');
    },

    envBreakdownText(envCount) {
        const map = envCount || Object.create(null);
        if (Object.keys(map).length === 0) return '—';
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .map(([name, n]) => `${name}: ${n}`)
            .join(', ');
    },

    workHistory() {
        return Context.workHistory || null;
    },

    onMutation(state) {
        const main = Context.dom.query('main', { context: `${this.id}.main` });
        if (!main) {
            if (!state.missingLogged) {
                Logger.warn('main not found — breakdown will not run until <main> is present');
                state.missingLogged = true;
            }
            return;
        }

        const table = this.findTaskCreationTable(main);
        if (!table) {
            if (!state.missingLogged) {
                Logger.debug('Task Creation table not found');
                state.missingLogged = true;
            }
            return;
        }

        const panel = table.closest('[role="tabpanel"]');
        const submittedHeading = panel && Array.from(panel.querySelectorAll('h3')).find(h => h.textContent.trim().startsWith('Submitted'));
        const grid = submittedHeading ? submittedHeading.closest('.grid') : (panel && panel.firstElementChild);
        if (!grid || !grid.matches('.grid')) {
            if (!state.missingLogged) {
                Logger.warn('stat cards grid not found — cannot attach breakdown block');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const wh = this.workHistory();
        if (!wh || typeof wh.fetchTaskCreationDay !== 'function') {
            if (!state.missingLogged) {
                Logger.warn('Context.workHistory not ready');
                state.missingLogged = true;
            }
            return;
        }
        if (typeof wh.ensureTeamIdIntercept === 'function') wh.ensureTeamIdIntercept();

        const copyButtonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const arrowBtnActive = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-blue-500 text-blue-500 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-base font-medium cursor-pointer';
        const arrowBtnDisabled = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-gray-500 text-gray-500 text-base font-medium cursor-not-allowed';

        let block = panel.querySelector('[data-wf-task-creation-today-env-block]');
        if (!block) {
            block = document.createElement('div');
            block.setAttribute('data-wf-task-creation-today-env-block', 'true');
            block._wfDaysAgo = 0;
            block._wfFetchGen = 0;
            block._wfDayCache = Object.create(null);
            block.className = 'rounded-xl text-card-foreground bg-muted-extra border-none shadow-none p-4 pt-4 flex flex-col justify-center mt-3 mb-3';
            block.innerHTML = [
                '<div class="flex items-center justify-between gap-3">',
                '<span class="text-xs text-muted-foreground">Choose a date to see and copy the breakdown for:</span>',
                '<div class="flex items-center gap-2 shrink-0">',
                '<button type="button" class="' + arrowBtnActive + '" data-wf-day-prev aria-label="Previous day">‹</button>',
                '<span class="text-xs text-white font-medium text-center w-[8.75rem]" data-wf-day-label>Today</span>',
                '<button type="button" class="' + arrowBtnDisabled + '" data-wf-day-next aria-label="Next day" disabled>›</button>',
                '</div>',
                '</div>',
                '<div class="mt-3 flex justify-between gap-4">',
                '<div class="text-sm" data-wf-count></div>',
                '<div class="text-sm text-orange-600 dark:text-orange-400 text-right ml-2" data-wf-breakdown></div>',
                '</div>',
                '<div class="mt-4 flex justify-between items-center gap-2">',
                '<span class="text-xs font-medium text-muted-foreground" data-wf-date-label></span>',
                '<button type="button" class="' + copyButtonClass + '" data-wf-copy-btn>Copy Breakdown</button>',
                '</div>',
            ].join('');

            const self = this;
            const prevBtn = block.querySelector('[data-wf-day-prev]');
            const nextBtn = block.querySelector('[data-wf-day-next]');
            const copyBtn = block.querySelector('[data-wf-copy-btn]');

            if (prevBtn) {
                prevBtn.addEventListener('click', () => {
                    block._wfDaysAgo = (block._wfDaysAgo || 0) + 1;
                    Logger.log('day navigation — previous day', { daysAgo: block._wfDaysAgo });
                    self.loadDay(block);
                });
            }
            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    block._wfDaysAgo = Math.max(0, (block._wfDaysAgo || 0) - 1);
                    Logger.log('day navigation — next day', { daysAgo: block._wfDaysAgo });
                    self.loadDay(block);
                });
            }
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    const text = copyBtn.getAttribute('data-wf-copy-text');
                    if (!text) {
                        self.flashCopyButtonFailure(copyBtn);
                        return;
                    }
                    navigator.clipboard.writeText(text).then(() => {
                        Logger.log('copied breakdown', { daysAgo: block._wfDaysAgo || 0 });
                        self.flashCopyButtonSuccess(copyBtn);
                    }).catch((err) => {
                        Logger.error('failed to copy breakdown', err);
                        self.flashCopyButtonFailure(copyBtn);
                    });
                });
            }

            grid.insertAdjacentElement('afterend', block);
            if (!state.activationLogged) {
                Logger.log('injected breakdown and copy block');
                state.activationLogged = true;
            }
            this.loadDay(block);
        }
    },

    renderDay(block, stats, daysAgo, loading) {
        const dayLabelEl = block.querySelector('[data-wf-day-label]');
        const countEl = block.querySelector('[data-wf-count]');
        const breakdownEl = block.querySelector('[data-wf-breakdown]');
        const dateLabelEl = block.querySelector('[data-wf-date-label]');
        const copyBtnEl = block.querySelector('[data-wf-copy-btn]');
        const nextBtnEl = block.querySelector('[data-wf-day-next]');
        const arrowBtnActive = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-blue-500 text-blue-500 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-base font-medium cursor-pointer';
        const arrowBtnDisabled = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-gray-500 text-gray-500 text-base font-medium cursor-not-allowed';

        if (dayLabelEl) {
            dayLabelEl.textContent = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
        }
        if (nextBtnEl) {
            nextBtnEl.disabled = daysAgo === 0;
            nextBtnEl.className = daysAgo === 0 ? arrowBtnDisabled : arrowBtnActive;
        }
        if (dateLabelEl) {
            dateLabelEl.textContent = daysAgo === 0 ? '' : this.formatDateLabel(this.dateNDaysAgo(daysAgo));
        }

        const count = stats && typeof stats.count === 'number' ? stats.count : (loading ? '…' : 0);
        const breakdown = loading && !stats
            ? '…'
            : this.envBreakdownText(stats && stats.envCount);

        if (countEl) {
            countEl.textContent = '';
            const numSpan = document.createElement('span');
            numSpan.className = 'text-blue-600 dark:text-blue-400';
            numSpan.textContent = String(count);
            countEl.appendChild(numSpan);
        }
        if (breakdownEl) breakdownEl.textContent = breakdown;

        if (copyBtnEl) {
            copyBtnEl.setAttribute('data-wf-copy-text', stats ? this.buildCopyText(stats) : '');
            if (!copyBtnEl._wfCopyResetTimeout) copyBtnEl.textContent = 'Copy Breakdown';
        }
    },

    loadDay(block) {
        const wh = this.workHistory();
        if (!wh || typeof wh.fetchTaskCreationDay !== 'function') return;
        const daysAgo = block._wfDaysAgo || 0;
        const gen = ++block._wfFetchGen;
        const cached = block._wfDayCache[daysAgo];
        this.renderDay(block, cached || null, daysAgo, !cached);

        wh.fetchTaskCreationDay(daysAgo).then((stats) => {
            if (gen !== block._wfFetchGen || (block._wfDaysAgo || 0) !== daysAgo) return;
            block._wfDayCache[daysAgo] = stats;
            this.renderDay(block, stats, daysAgo, false);
        }).catch((err) => {
            if (gen !== block._wfFetchGen) return;
            Logger.error('Task Creation day fetch failed', err);
            this.renderDay(block, { count: 0, envCount: Object.create(null) }, daysAgo, false);
        });
    }
};
