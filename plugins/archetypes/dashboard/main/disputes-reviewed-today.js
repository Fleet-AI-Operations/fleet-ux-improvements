// ============= disputes-reviewed-today.js =============
const plugin = {
    id: 'disputesReviewedToday',
    name: 'Disputes Reviewed Today Breakdown',
    description: 'Show today\'s disputes reviewed count and approved/rejected breakdown with copy and scroll warning',
    _version: '3.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, lastUncertain: false },

    COPY_FEEDBACK_SUCCESS_MS: 1000,
    COPY_FEEDBACK_FAILURE_MS: 500,

    flashCopyButtonSuccess(btn) {
        if (btn._wfCopyResetTimeout) clearTimeout(btn._wfCopyResetTimeout);
        btn.style.transition = '';
        btn.style.backgroundColor = 'rgb(34, 197, 94)';
        btn.style.color = '#ffffff';
        btn._wfCopyResetTimeout = setTimeout(() => {
            btn._wfCopyResetTimeout = null;
            btn.style.backgroundColor = '';
            btn.style.color = '';
        }, this.COPY_FEEDBACK_SUCCESS_MS);
    },

    flashCopyButtonFailure(btn) {
        if (btn._wfCopyResetTimeout) clearTimeout(btn._wfCopyResetTimeout);
        const prevT = btn.style.transition;
        btn.style.transition = 'none';
        btn.style.backgroundColor = 'rgb(239, 68, 68)';
        btn.style.color = '#ffffff';
        void btn.offsetHeight;
        btn.style.transition = `background-color ${this.COPY_FEEDBACK_FAILURE_MS}ms ease-out, color ${this.COPY_FEEDBACK_FAILURE_MS}ms ease-out`;
        btn.style.backgroundColor = '';
        btn.style.color = '';
        btn._wfCopyResetTimeout = setTimeout(() => {
            btn.style.transition = prevT || '';
            btn._wfCopyResetTimeout = null;
        }, this.COPY_FEEDBACK_FAILURE_MS);
    },

    /** Month name (3-letter) to 1-based month index. */
    MONTH_INDEX: { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 },

    /**
     * Parse date text like "Jan 27" or "Mar 3" (ignore year).
     * @returns {{ month: number, day: number } | null}
     */
    parseDateText(text) {
        const t = (text || '').trim();
        if (/^today$/i.test(t)) {
            const now = new Date();
            return { month: now.getMonth() + 1, day: now.getDate() };
        }
        if (/^yesterday$/i.test(t)) {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            return { month: d.getMonth() + 1, day: d.getDate() };
        }
        const match = t.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s+\d{4})?$/);
        if (!match) return null;
        const month = this.MONTH_INDEX[match[1].slice(0, 3)];
        const day = parseInt(match[2], 10);
        if (month == null || Number.isNaN(day) || day < 1 || day > 31) return null;
        return { month, day };
    },

    isToday(parsed) {
        if (!parsed) return false;
        const now = new Date();
        return parsed.month === now.getMonth() + 1 && parsed.day === now.getDate();
    },

    /** Return { month, day, year } for n days ago (n >= 1). */
    dateNDaysAgo(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return { month: d.getMonth() + 1, day: d.getDate(), year: d.getFullYear() };
    },

    MONTH_NAMES: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],

    formatDateLabel(ref) {
        if (!ref || ref.month == null) return '—';
        return `${this.MONTH_NAMES[ref.month - 1]} ${ref.day}, ${ref.year}`;
    },

    sameDate(parsed, target) {
        return parsed && target && parsed.month === target.month && parsed.day === target.day;
    },

    /** @returns {'approved'|'rejected'|null} */
    classifyOutcome(cell) {
        if (!cell) return null;
        const text = (cell.textContent || '').trim();
        if (/approved/i.test(text)) return 'approved';
        if (/rejected/i.test(text)) return 'rejected';
        return null;
    },

    /**
     * Resolve Date and Outcome column indices from thead so counts work with or without
     * injected columns (e.g. View Task between Task and Outcome).
     * @returns {{ dateIdx: number, outcomeIdx: number }}
     */
    resolveReviewedTableColumnIndices(table) {
        const theadRow = table.tHead && table.tHead.rows[0];
        const fallback = { dateIdx: 0, outcomeIdx: 2 };
        if (!theadRow || theadRow.cells.length === 0) return fallback;

        let dateIdx = -1;
        let outcomeIdx = -1;
        for (let i = 0; i < theadRow.cells.length; i++) {
            const raw = (theadRow.cells[i].textContent || '').trim().replace(/\s+/g, ' ');
            if (/^date$/i.test(raw)) dateIdx = i;
            if (/outcome/i.test(raw)) outcomeIdx = i;
        }
        if (dateIdx < 0) dateIdx = 0;
        if (outcomeIdx < 0) {
            const n = theadRow.cells.length;
            outcomeIdx = n > 3 ? n - 1 : 2;
        }
        return { dateIdx, outcomeIdx };
    },

    /**
     * Find the Disputes Reviewed tab panel: table with Date, Task, Outcome (no Environment).
     * @returns {HTMLTableElement | null}
     */
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

    /** Remove breakdown UI when leaving the Disputes tab or when the table is gone (stat grid may persist). */
    removeDisputesBreakdownBlocks(main) {
        if (!main) return;
        main.querySelectorAll('[data-wf-disputes-reviewed-today-block]').forEach((el) => el.remove());
    },

    /** Remove injected blocks that are not inside the current disputes tab panel (avoids duplicates). */
    removeDisputesBreakdownBlocksOutsidePanel(main, panel) {
        if (!main) return;
        main.querySelectorAll('[data-wf-disputes-reviewed-today-block]').forEach((el) => {
            if (!panel || !panel.contains(el)) el.remove();
        });
    },

    getStatsForDate(rows, targetMonth, targetDay, dateIdx, outcomeIdx) {
        let count = 0;
        let approved = 0;
        let rejected = 0;
        for (const tr of rows) {
            const dateCell = tr.cells[dateIdx];
            const outcomeCell = tr.cells[outcomeIdx];
            const dateText = dateCell ? dateCell.textContent.trim() : '';
            const parsed = this.parseDateText(dateText);
            if (this.sameDate(parsed, { month: targetMonth, day: targetDay })) {
                count++;
                const outcome = this.classifyOutcome(outcomeCell);
                if (outcome === 'approved') approved++;
                else if (outcome === 'rejected') rejected++;
            }
        }
        return { count, approved, rejected };
    },

    buildCopyTextForDate(stats, uncertain) {
        const count = stats && typeof stats.count === 'number' ? stats.count : 0;
        const approved = stats && typeof stats.approved === 'number' ? stats.approved : 0;
        const rejected = stats && typeof stats.rejected === 'number' ? stats.rejected : 0;
        const suffix = uncertain ? '?' : '';
        const lines = [
            `Disputes Reviewed: ${count}${suffix} tasks.`,
            `${approved} approved, ${rejected} rejected`
        ];
        return lines.join('\n');
    },

    isPastDayUncertain(rows, targetMonth, targetDay, stats, dateIdx) {
        if (!rows || rows.length === 0) return true;
        if (!stats) return true;
        if (stats.count === 0) return true;
        if (stats.count !== 10) return false;

        const dIdx = typeof dateIdx === 'number' ? dateIdx : 0;

        let lastIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            const tr = rows[i];
            const dateCell = tr.cells[dIdx];
            const dateText = dateCell ? dateCell.textContent.trim() : '';
            const parsed = this.parseDateText(dateText);
            if (this.sameDate(parsed, { month: targetMonth, day: targetDay })) {
                lastIndex = i;
            }
        }
        if (lastIndex === -1 || lastIndex === rows.length - 1) {
            return true;
        }
        for (let i = lastIndex + 1; i < rows.length; i++) {
            const tr = rows[i];
            const dateCell = tr.cells[dIdx];
            const dateText = dateCell ? dateCell.textContent.trim() : '';
            const parsed = this.parseDateText(dateText);
            if (parsed && !this.sameDate(parsed, { month: targetMonth, day: targetDay })) {
                return false;
            }
        }
        return true;
    },

    onMutation(state, context) {
        const main = Context.dom.query('main', { context: `${this.id}.main` });
        if (!main) {
            if (!state.missingLogged) {
                Logger.debug('disputes-reviewed-today: main not found');
                state.missingLogged = true;
            }
            return;
        }

        const table = this.findDisputesReviewedTable(main);
        if (!table) {
            this.removeDisputesBreakdownBlocks(main);
            if (!state.missingLogged) {
                Logger.debug('disputes-reviewed-today: Disputes Reviewed table not found');
                state.missingLogged = true;
            }
            return;
        }

        const panel = table.closest('[role="tabpanel"]');
        const grid = panel && panel.querySelector('.grid');
        if (!grid || !grid.matches('.grid')) {
            this.removeDisputesBreakdownBlocks(main);
            if (!state.missingLogged) {
                Logger.debug('disputes-reviewed-today: stat card grid not found in tab panel');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;
        this.removeDisputesBreakdownBlocksOutsidePanel(main, panel);

        const { dateIdx, outcomeIdx } = this.resolveReviewedTableColumnIndices(table);
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        let todayCount = 0;
        let todayApproved = 0;
        let todayRejected = 0;
        let lastRowIsToday = false;

        for (let i = 0; i < rows.length; i++) {
            const tr = rows[i];
            const dateCell = tr.cells[dateIdx];
            const outcomeCell = tr.cells[outcomeIdx];
            const dateText = dateCell ? dateCell.textContent.trim() : '';
            const parsed = this.parseDateText(dateText);
            const rowIsToday = this.isToday(parsed);
            if (rowIsToday) {
                todayCount++;
                const outcome = this.classifyOutcome(outcomeCell);
                if (outcome === 'approved') todayApproved++;
                else if (outcome === 'rejected') todayRejected++;
            }
            if (i === rows.length - 1) lastRowIsToday = rowIsToday;
        }

        const uncertain = rows.length > 0 && lastRowIsToday;
        const dayAr = todayCount > 0 ? Math.round((todayApproved / todayCount) * 100) : null;
        const todayBreakdownText = todayCount === 0
            ? '—'
            : `${todayApproved} approved, ${todayRejected} rejected` + (dayAr != null ? ` (${dayAr}% AR)` : '');
        const todayCopyText = this.buildCopyTextForDate(
            { count: todayCount, approved: todayApproved, rejected: todayRejected },
            uncertain
        );

        const copyButtonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const arrowBtnActive = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-blue-500 text-blue-500 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-base font-medium cursor-pointer';
        const arrowBtnDisabled = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-gray-500 text-gray-500 text-base font-medium cursor-not-allowed';

        let block = panel.querySelector('[data-wf-disputes-reviewed-today-block]');
        if (!block) {
            block = document.createElement('div');
            block.setAttribute('data-wf-disputes-reviewed-today-block', 'true');
            block._wfDaysAgo = 0;
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
                '<div class="text-sm text-right ml-2" data-wf-breakdown></div>',
                '</div>',
                '<p class="text-xs text-muted-foreground mt-2 hidden" data-wf-scroll-msg></p>',
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
                    if (typeof block._wfUpdateUI === 'function') block._wfUpdateUI();
                });
            }
            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    block._wfDaysAgo = Math.max(0, (block._wfDaysAgo || 0) - 1);
                    if (typeof block._wfUpdateUI === 'function') block._wfUpdateUI();
                });
            }
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    const text = copyBtn.getAttribute('data-wf-copy-text');
                    if (!text) {
                        self.flashCopyButtonFailure(copyBtn);
                        return;
                    }
                    if (copyBtn.getAttribute('data-wf-copy-uncertain') === 'true') {
                        const daysAgo = block._wfDaysAgo || 0;
                        alert(
                            'Warning:\n\n' +
                            'You copied a breakdown that may not be complete.\n\n' +
                            (daysAgo === 0
                                ? 'Please scroll down the page so that all of today\'s reviews are visible on the page before copying to ensure accurate results.'
                                : 'Please scroll down the page so that all reviews for that day are visible on the page before copying to ensure accurate results.')
                        );
                    }
                    navigator.clipboard.writeText(text).then(() => {
                        Logger.log('disputes-reviewed-today: copied breakdown to clipboard', { daysAgo: block._wfDaysAgo || 0 });
                        self.flashCopyButtonSuccess(copyBtn);
                    }).catch((err) => {
                        Logger.error('disputes-reviewed-today: failed to copy breakdown', err);
                        self.flashCopyButtonFailure(copyBtn);
                    });
                });
            }

            const updateUI = () => {
                const daysAgo = block._wfDaysAgo || 0;
                const dayLabelEl = block.querySelector('[data-wf-day-label]');
                const countEl = block.querySelector('[data-wf-count]');
                const breakdownEl = block.querySelector('[data-wf-breakdown]');
                const scrollMsgEl = block.querySelector('[data-wf-scroll-msg]');
                const dateLabelEl = block.querySelector('[data-wf-date-label]');
                const copyBtnEl = block.querySelector('[data-wf-copy-btn]');
                const nextBtnEl = block.querySelector('[data-wf-day-next]');

                if (dayLabelEl) {
                    dayLabelEl.textContent = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
                }
                if (nextBtnEl) {
                    nextBtnEl.disabled = daysAgo === 0;
                    nextBtnEl.className = daysAgo === 0 ? arrowBtnDisabled : arrowBtnActive;
                }

                let displayCount, displayBreakdown, isUncertain, copyText;

                if (daysAgo === 0) {
                    const ts = block._wfTodayStats || {};
                    displayCount = ts.uncertain ? `${ts.count || 0}?` : String(ts.count || 0);
                    displayBreakdown = ts.breakdownText || '—';
                    isUncertain = ts.uncertain || false;
                    copyText = ts.copyText || '';
                    if (dateLabelEl) dateLabelEl.textContent = '';
                } else {
                    const ref = self.dateNDaysAgo(daysAgo);
                    if (dateLabelEl) dateLabelEl.textContent = self.formatDateLabel(ref);
                    const panelEl = block.closest('[role="tabpanel"]');
                    const tableEl = panelEl ? panelEl.querySelector('table') : null;
                    const liveRows = tableEl ? Array.from(tableEl.querySelectorAll('tbody tr')) : [];
                    const col = tableEl ? self.resolveReviewedTableColumnIndices(tableEl) : { dateIdx: 0, outcomeIdx: 2 };
                    const stats = self.getStatsForDate(liveRows, ref.month, ref.day, col.dateIdx, col.outcomeIdx);
                    isUncertain = self.isPastDayUncertain(liveRows, ref.month, ref.day, stats, col.dateIdx);
                    copyText = self.buildCopyTextForDate(stats, isUncertain);
                    const dayArPast = stats.count > 0 ? Math.round((stats.approved / stats.count) * 100) : null;
                    displayCount = `${stats.count}${isUncertain ? '?' : ''}` + (dayArPast != null ? ` (${dayArPast}% AR)` : '');
                    displayBreakdown = stats.count === 0 ? '—' : `${stats.approved} approved, ${stats.rejected} rejected` + (dayArPast != null ? ` (${dayArPast}% AR)` : '');
                }

                if (countEl) {
                    countEl.textContent = '';
                    const countMatch = displayCount.match(/^(\d+\??)(?:\s*(\(\d+% AR\)))?$/);
                    const numPart = countMatch ? countMatch[1] : displayCount;
                    const arPart = countMatch && countMatch[2] ? countMatch[2] : null;
                    const numSpan = document.createElement('span');
                    numSpan.className = 'text-blue-600 dark:text-blue-400';
                    numSpan.textContent = numPart;
                    countEl.appendChild(numSpan);
                    if (arPart) {
                        const arSpan = document.createElement('span');
                        arSpan.className = 'text-muted-foreground';
                        arSpan.textContent = ' ' + arPart;
                        countEl.appendChild(arSpan);
                    }
                }
                if (breakdownEl) {
                    breakdownEl.textContent = '';
                    if (displayBreakdown === '—') {
                        const dashSpan = document.createElement('span');
                        dashSpan.className = 'text-muted-foreground';
                        dashSpan.textContent = '—';
                        breakdownEl.appendChild(dashSpan);
                    } else {
                        const arMatch = displayBreakdown.match(/\s*\(\d+% AR\)$/);
                        const mainPart = arMatch ? displayBreakdown.slice(0, -arMatch[0].length) : displayBreakdown;
                        const arSuffix = arMatch ? arMatch[0] : null;
                        const mainSpan = document.createElement('span');
                        mainSpan.className = 'text-orange-600 dark:text-orange-400';
                        mainSpan.textContent = mainPart;
                        breakdownEl.appendChild(mainSpan);
                        if (arSuffix) {
                            const arSpan = document.createElement('span');
                            arSpan.className = 'text-muted-foreground';
                            arSpan.textContent = arSuffix;
                            breakdownEl.appendChild(arSpan);
                        }
                    }
                }

                if (scrollMsgEl) {
                    scrollMsgEl.textContent = daysAgo === 0
                        ? 'Please scroll down to ensure all of today\'s reviews have been counted accurately. The copy breakdown functionality may be inaccurate until you do this.'
                        : 'Please scroll down to ensure all reviews for that day have been loaded before copying. The copy breakdown functionality may be inaccurate until you do this.';
                    scrollMsgEl.classList.toggle('hidden', !isUncertain);
                    scrollMsgEl.classList.toggle('block', isUncertain);
                }

                if (copyBtnEl) {
                    copyBtnEl.setAttribute('data-wf-copy-uncertain', isUncertain ? 'true' : 'false');
                    copyBtnEl.setAttribute('data-wf-copy-text', copyText);
                    if (!copyBtnEl._wfCopyResetTimeout) copyBtnEl.textContent = 'Copy Breakdown';
                }
            };
            block._wfUpdateUI = updateUI;
            grid.insertAdjacentElement('afterend', block);
            Logger.log('disputes-reviewed-today: injected breakdown and copy block');
        }

        block._wfTodayStats = {
            count: todayCount,
            approved: todayApproved,
            rejected: todayRejected,
            uncertain,
            breakdownText: todayBreakdownText,
            copyText: todayCopyText
        };

        if (typeof block._wfUpdateUI === 'function') {
            block._wfUpdateUI();
        }

        if (uncertain && !state.lastUncertain) {
            Logger.info('disputes-reviewed-today: last visible row is today — showing uncertain count and scroll message');
        }
        state.lastUncertain = uncertain;
    }
};
