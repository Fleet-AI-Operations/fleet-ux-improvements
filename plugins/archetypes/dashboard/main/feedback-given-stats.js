// ============= feedback-given-stats.js =============
const plugin = {
    id: 'feedbackGivenStats',
    name: 'Feedback Given Stats',
    description: 'Show overall approval rate, feedback count and environment breakdown with day and per-env approval rates',
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

    buildCopyText(stats) {
        const count = stats && typeof stats.count === 'number' ? stats.count : 0;
        const envCount = (stats && stats.envCount) || Object.create(null);
        const lines = [
            `QA: ${count} tasks.`,
            ...Object.entries(envCount)
                .sort((a, b) => b[1] - a[1])
                .map(([name, n]) => `${name}: ${n}`)
        ];
        return lines.join('\n');
    },

    envDataFromStats(stats) {
        const envCount = (stats && stats.envCount) || Object.create(null);
        const envApproved = (stats && stats.envApproved) || Object.create(null);
        const envFeedbackRequested = (stats && stats.envFeedbackRequested) || Object.create(null);
        return Object.entries(envCount)
            .sort((a, b) => b[1] - a[1])
            .map(([name, n]) => {
                const a = envApproved[name] || 0;
                const f = envFeedbackRequested[name] || 0;
                const total = a + f;
                const ar = total > 0 ? Math.round((a / total) * 100) : null;
                return [name, n, ar];
            });
    },

    renderEnvLines(el, envData) {
        el.textContent = '';
        el.className = 'text-sm text-right ml-2';
        if (!envData || envData.length === 0) {
            el.textContent = '—';
            return;
        }
        for (const [name, n, ar] of envData) {
            const line = document.createElement('div');
            line.className = 'text-sm';
            const orangeClass = 'text-orange-600 dark:text-orange-400';
            const nameSpan = document.createElement('span');
            nameSpan.className = orangeClass;
            nameSpan.textContent = name;
            const countSpan = document.createElement('span');
            countSpan.className = orangeClass;
            countSpan.textContent = `: ${n}`;
            line.appendChild(nameSpan);
            line.appendChild(countSpan);
            if (ar != null) {
                const arSpan = document.createElement('span');
                arSpan.className = 'text-muted-foreground';
                arSpan.textContent = ` (${ar}% AR)`;
                line.appendChild(arSpan);
            }
            el.appendChild(line);
        }
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

        const feedbackGivenHeading = main.querySelector('h3.tracking-tight.text-base.font-medium.text-primary');
        if (!feedbackGivenHeading || feedbackGivenHeading.textContent.trim() !== 'Feedback Given') {
            if (!state.missingLogged) {
                Logger.debug('Feedback Given card not found');
                state.missingLogged = true;
            }
            return;
        }

        const card = feedbackGivenHeading.closest('.rounded-xl');
        if (!card) return;
        state.missingLogged = false;

        // Overall approval rate on card subtext (all-time Fleet card — leave alone)
        if (!card.hasAttribute('data-wf-feedback-stats')) {
            const subtextEl = card.querySelector('p.text-sm.text-muted-foreground');
            if (subtextEl && /approved.*feedback requested|feedback requested.*approved/i.test(subtextEl.textContent)) {
                const text = subtextEl.textContent.trim();
                const match = text.match(/(\d+)\s+approved,\s*(\d+)\s+feedback\s+requested/i);
                if (match) {
                    const approved = parseInt(match[1], 10);
                    const feedbackRequested = parseInt(match[2], 10);
                    const total = approved + feedbackRequested;
                    if (total > 0 && !subtextEl.textContent.includes('approval rate)')) {
                        const rate = Math.round((approved / total) * 100);
                        subtextEl.textContent = text + ` (${rate}% approval rate)`;
                        Logger.log('added overall approval rate to Feedback Given stat', { approved, feedbackRequested, rate });
                    }
                }
            }
            card.setAttribute('data-wf-feedback-stats', 'true');
        }

        const wh = this.workHistory();
        if (!wh || typeof wh.fetchFeedbackGivenDay !== 'function') {
            if (!state.missingLogged) {
                Logger.warn('Context.workHistory not ready');
                state.missingLogged = true;
            }
            return;
        }

        const copyButtonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const arrowBtnActive = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-blue-500 text-blue-500 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-base font-medium cursor-pointer';
        const arrowBtnDisabled = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-gray-500 text-gray-500 text-base font-medium cursor-not-allowed';

        let block = card.querySelector('[data-wf-feedback-stats-block]');
        if (!block) {
            block = document.createElement('div');
            block.setAttribute('data-wf-feedback-stats-block', 'true');
            block._wfDaysAgo = 0;
            block._wfFetchGen = 0;
            block._wfDayCache = Object.create(null);
            block.className = 'p-4 pt-4 border-t border-border/50 flex flex-col justify-center';
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
                '<div class="text-sm text-blue-600 dark:text-blue-400" data-wf-count></div>',
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

            const existingContent = card.querySelector('.p-4.pt-0.flex.items-end.justify-between');
            if (existingContent && existingContent.nextSibling) {
                card.insertBefore(block, existingContent.nextSibling);
            } else {
                card.appendChild(block);
            }
            if (!state.activationLogged) {
                Logger.log('injected stats block');
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

        const dayAr = stats && stats.dayAr != null ? stats.dayAr : null;
        if (countEl) {
            countEl.className = 'text-sm';
            countEl.textContent = '';
            const numSpan = document.createElement('span');
            numSpan.className = 'text-blue-600 dark:text-blue-400';
            numSpan.textContent = loading && !stats ? '…' : String(stats && typeof stats.count === 'number' ? stats.count : 0);
            countEl.appendChild(numSpan);
            if (dayAr != null) {
                const arSpan = document.createElement('span');
                arSpan.className = 'text-muted-foreground';
                arSpan.textContent = ` (${dayAr}% AR)`;
                countEl.appendChild(arSpan);
            }
        }
        if (breakdownEl) {
            if (loading && !stats) {
                breakdownEl.textContent = '…';
            } else {
                this.renderEnvLines(breakdownEl, this.envDataFromStats(stats));
            }
        }
        if (copyBtnEl) {
            copyBtnEl.setAttribute('data-wf-copy-text', stats ? this.buildCopyText(stats) : '');
            if (!copyBtnEl._wfCopyResetTimeout) copyBtnEl.textContent = 'Copy Breakdown';
        }
    },

    loadDay(block, opts) {
        const wh = this.workHistory();
        if (!wh || typeof wh.fetchFeedbackGivenDay !== 'function') return;
        const force = !!(opts && opts.force);
        const daysAgo = block._wfDaysAgo || 0;
        const gen = ++block._wfFetchGen;
        if (force) {
            delete block._wfDayCache[daysAgo];
            if (typeof wh.invalidateDay === 'function') wh.invalidateDay('feedbackGiven', daysAgo);
        }
        const cached = force ? null : block._wfDayCache[daysAgo];
        this.renderDay(block, cached || null, daysAgo, !cached);

        wh.fetchFeedbackGivenDay(daysAgo, force ? { force: true } : undefined).then((stats) => {
            if (gen !== block._wfFetchGen || (block._wfDaysAgo || 0) !== daysAgo) return;
            block._wfDayCache[daysAgo] = stats;
            this.renderDay(block, stats, daysAgo, false);
        }).catch((err) => {
            if (gen !== block._wfFetchGen) return;
            Logger.error('Feedback Given day fetch failed', err);
            this.renderDay(block, {
                count: 0,
                envCount: Object.create(null),
                envApproved: Object.create(null),
                envFeedbackRequested: Object.create(null),
                dayAr: null
            }, daysAgo, false);
        });
    }
};
