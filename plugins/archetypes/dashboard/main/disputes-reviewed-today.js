// ============= disputes-reviewed-today.js =============
const plugin = {
    id: 'disputesReviewedToday',
    name: 'Disputes Reviewed Today Breakdown',
    description: 'Show disputes reviewed count and approved/rejected breakdown for a selected day',
    _version: '5.1',
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

    removeDisputesBreakdownBlocks(main) {
        if (!main) return;
        main.querySelectorAll('[data-wf-disputes-reviewed-today-block]').forEach((el) => el.remove());
    },

    removeDisputesBreakdownBlocksOutsidePanel(main, panel) {
        if (!main) return;
        main.querySelectorAll('[data-wf-disputes-reviewed-today-block]').forEach((el) => {
            if (!panel || !panel.contains(el)) el.remove();
        });
    },

    buildCopyText(stats) {
        const count = stats && typeof stats.count === 'number' ? stats.count : 0;
        const approved = stats && typeof stats.approved === 'number' ? stats.approved : 0;
        const rejected = stats && typeof stats.rejected === 'number' ? stats.rejected : 0;
        return [
            `Disputes Reviewed: ${count} tasks.`,
            `${approved} approved, ${rejected} rejected`
        ].join('\n');
    },

    workHistory() {
        return Context.workHistory || null;
    },

    onMutation(state) {
        const main = Context.dom.query('main', { context: `${this.id}.main` });
        if (!main) {
            if (!state.missingLogged) {
                Logger.debug('main not found');
                state.missingLogged = true;
            }
            return;
        }

        const table = this.findDisputesReviewedTable(main);
        if (!table) {
            this.removeDisputesBreakdownBlocks(main);
            if (!state.missingLogged) {
                Logger.debug('Disputes Reviewed table not found');
                state.missingLogged = true;
            }
            return;
        }

        const panel = table.closest('[role="tabpanel"]');
        const grid = panel && panel.querySelector('.grid');
        if (!grid || !grid.matches('.grid')) {
            this.removeDisputesBreakdownBlocks(main);
            if (!state.missingLogged) {
                Logger.debug('stat card grid not found in tab panel');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;
        this.removeDisputesBreakdownBlocksOutsidePanel(main, panel);

        const wh = this.workHistory();
        if (!wh || typeof wh.fetchDisputesReviewedDay !== 'function') {
            if (!state.missingLogged) {
                Logger.warn('Context.workHistory not ready');
                state.missingLogged = true;
            }
            return;
        }

        const copyButtonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const arrowBtnActive = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-blue-500 text-blue-500 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-base font-medium cursor-pointer';
        const arrowBtnDisabled = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-gray-500 text-gray-500 text-base font-medium cursor-not-allowed';

        let block = panel.querySelector('[data-wf-disputes-reviewed-today-block]');
        if (!block) {
            block = document.createElement('div');
            block.setAttribute('data-wf-disputes-reviewed-today-block', 'true');
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
                '<button type="button" class="' + arrowBtnActive + '" data-wf-day-refresh aria-label="Refresh day">↻</button>',
                '</div>',
                '</div>',
                '<div class="mt-3 flex justify-between gap-4">',
                '<div class="text-sm" data-wf-count></div>',
                '<div class="text-sm text-right ml-2" data-wf-breakdown></div>',
                '</div>',
                '<div class="mt-4 flex justify-between items-center gap-2">',
                '<span class="text-xs font-medium text-muted-foreground" data-wf-date-label></span>',
                '<button type="button" class="' + copyButtonClass + '" data-wf-copy-btn>Copy Breakdown</button>',
                '</div>',
            ].join('');

            const self = this;
            const prevBtn = block.querySelector('[data-wf-day-prev]');
            const nextBtn = block.querySelector('[data-wf-day-next]');
            const refreshBtn = block.querySelector('[data-wf-day-refresh]');
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
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    Logger.log('day refresh', { daysAgo: block._wfDaysAgo || 0 });
                    self.loadDay(block, { force: true });
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

        const count = stats && typeof stats.count === 'number' ? stats.count : 0;
        const approved = stats && typeof stats.approved === 'number' ? stats.approved : 0;
        const rejected = stats && typeof stats.rejected === 'number' ? stats.rejected : 0;
        const dayAr = count > 0 ? Math.round((approved / count) * 100) : null;

        if (countEl) {
            countEl.textContent = '';
            const numSpan = document.createElement('span');
            numSpan.className = 'text-blue-600 dark:text-blue-400';
            numSpan.textContent = loading && !stats ? '…' : String(count);
            countEl.appendChild(numSpan);
            if (dayAr != null) {
                const arSpan = document.createElement('span');
                arSpan.className = 'text-muted-foreground';
                arSpan.textContent = ` (${dayAr}% AR)`;
                countEl.appendChild(arSpan);
            }
        }

        if (breakdownEl) {
            breakdownEl.textContent = '';
            if (loading && !stats) {
                const dashSpan = document.createElement('span');
                dashSpan.className = 'text-muted-foreground';
                dashSpan.textContent = '…';
                breakdownEl.appendChild(dashSpan);
            } else if (count === 0) {
                const dashSpan = document.createElement('span');
                dashSpan.className = 'text-muted-foreground';
                dashSpan.textContent = '—';
                breakdownEl.appendChild(dashSpan);
            } else {
                const mainSpan = document.createElement('span');
                mainSpan.className = 'text-orange-600 dark:text-orange-400';
                mainSpan.textContent = `${approved} approved, ${rejected} rejected`;
                breakdownEl.appendChild(mainSpan);
                if (dayAr != null) {
                    const arSpan = document.createElement('span');
                    arSpan.className = 'text-muted-foreground';
                    arSpan.textContent = ` (${dayAr}% AR)`;
                    breakdownEl.appendChild(arSpan);
                }
            }
        }

        if (copyBtnEl) {
            copyBtnEl.setAttribute('data-wf-copy-text', stats ? this.buildCopyText(stats) : '');
            if (!copyBtnEl._wfCopyResetTimeout) copyBtnEl.textContent = 'Copy Breakdown';
        }
    },

    loadDay(block, opts) {
        const wh = this.workHistory();
        if (!wh || typeof wh.fetchDisputesReviewedDay !== 'function') return;
        const force = !!(opts && opts.force);
        const daysAgo = block._wfDaysAgo || 0;
        const gen = ++block._wfFetchGen;
        if (force) {
            delete block._wfDayCache[daysAgo];
            if (typeof wh.invalidateDay === 'function') wh.invalidateDay('disputesReviewed', daysAgo);
        }
        const cached = force ? null : block._wfDayCache[daysAgo];
        this.renderDay(block, cached || null, daysAgo, !cached);

        wh.fetchDisputesReviewedDay(daysAgo, force ? { force: true } : undefined).then((stats) => {
            if (gen !== block._wfFetchGen || (block._wfDaysAgo || 0) !== daysAgo) return;
            block._wfDayCache[daysAgo] = stats;
            this.renderDay(block, stats, daysAgo, false);
        }).catch((err) => {
            if (gen !== block._wfFetchGen) return;
            Logger.error('Disputes Reviewed day fetch failed', err);
            this.renderDay(block, { count: 0, approved: 0, rejected: 0 }, daysAgo, false);
        });
    }
};
