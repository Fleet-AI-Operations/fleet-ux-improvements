// ============= disputes-reviewed-today.js =============
const plugin = {
    id: 'disputesReviewedToday',
    name: 'Disputes Reviewed Today Breakdown',
    description: 'Show today\'s disputes reviewed count and approved/rejected breakdown with copy and scroll warning',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, lastUncertain: false },

    /** Month name (3-letter) to 1-based month index. */
    MONTH_INDEX: { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 },

    /**
     * Parse date text like "Jan 27" or "Mar 3" (ignore year).
     * @returns {{ month: number, day: number } | null}
     */
    parseDateText(text) {
        const t = (text || '').trim();
        const match = t.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
        if (!match) return null;
        const month = this.MONTH_INDEX[match[1]];
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

    getStatsForDate(rows, targetMonth, targetDay) {
        let count = 0;
        let approved = 0;
        let rejected = 0;
        for (const tr of rows) {
            const dateCell = tr.cells[0];
            const outcomeCell = tr.cells[2];
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

    buildCopyTextForDate(stats) {
        const dayAr = stats.count > 0 ? Math.round((stats.approved / stats.count) * 100) : null;
        const lines = [
            `Disputes Reviewed: ${stats.count} tasks.`,
            `Approved: ${stats.approved}, Rejected: ${stats.rejected}` + (dayAr != null ? ` (${dayAr}% AR)` : '')
        ];
        return lines.join('\n');
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
            if (!state.missingLogged) {
                Logger.debug('disputes-reviewed-today: Disputes Reviewed table not found');
                state.missingLogged = true;
            }
            return;
        }

        const panel = table.closest('[role="tabpanel"]');
        const grid = panel && panel.querySelector('.grid');
        if (!grid || !grid.matches('.grid')) {
            if (!state.missingLogged) {
                Logger.debug('disputes-reviewed-today: stat card grid not found in tab panel');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const rows = Array.from(table.querySelectorAll('tbody tr'));
        let todayCount = 0;
        let todayApproved = 0;
        let todayRejected = 0;
        let lastRowIsToday = false;

        for (let i = 0; i < rows.length; i++) {
            const tr = rows[i];
            const dateCell = tr.cells[0];
            const outcomeCell = tr.cells[2];
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
        const breakdownText = todayCount === 0
            ? '—'
            : `${todayApproved} approved, ${todayRejected} rejected` + (dayAr != null ? ` (${dayAr}% AR)` : '');

        const copyButtonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';

        let block = panel.querySelector('[data-wf-disputes-reviewed-today-block]');
        if (!block) {
            block = document.createElement('div');
            block.setAttribute('data-wf-disputes-reviewed-today-block', 'true');
            block.className = 'rounded-xl text-card-foreground bg-muted-extra border-none shadow-none p-4 pt-4 flex flex-col justify-center mt-3 mb-3';
            block.innerHTML = [
                '<div class="flex justify-between gap-4">',
                '<div class="text-sm text-muted-foreground" data-wf-today-count></div>',
                '<div class="text-sm text-muted-foreground text-right ml-2" data-wf-breakdown></div>',
                '</div>',
                '<div class="mt-4 flex justify-between items-center gap-2" data-wf-copy-section>',
                '<span class="text-xs text-muted-foreground">Copy your breakdown for the day? (Perfect for reporting time in Deel)</span>',
                '<button type="button" class="' + copyButtonClass + '" data-wf-copy-btn>Copy</button>',
                '</div>',
                '<p class="text-xs text-muted-foreground mt-2 hidden" data-wf-scroll-msg>Please scroll down to ensure all of today\'s reviews have been counted accurately. The copy breakdown functionality may be inaccurate until you do this.</p>',
                '<div class="mt-4 pt-4 border-t border-border/50" data-wf-past-day-section>',
                '<div class="flex flex-wrap items-center gap-2">',
                '<span class="text-xs text-muted-foreground">Copy the breakdown from</span>',
                '<span class="inline-flex items-center border border-input rounded-sm overflow-hidden bg-background">',
                '<button type="button" class="flex items-center justify-center w-7 h-8 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" data-wf-past-day-down aria-label="Decrease days">−</button>',
                '<input type="number" min="1" value="1" class="w-11 h-8 text-center text-sm border-0 bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" data-wf-past-day-input inputmode="numeric">',
                '<button type="button" class="flex items-center justify-center w-7 h-8 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" data-wf-past-day-up aria-label="Increase days">+</button>',
                '</span>',
                '<span class="text-xs text-muted-foreground" data-wf-past-day-label>day ago:</span>',
                '<span class="text-xs font-medium text-muted-foreground" data-wf-past-day-date></span>',
                '<button type="button" class="' + copyButtonClass + '" data-wf-past-day-copy-btn>Copy</button>',
                '</div>',
                '<p class="text-xs text-muted-foreground mt-2">Copy your breakdown for the day? (Perfect for reporting time in Deel) Please scroll down to ensure all reviews for that day have been loaded before copying.</p>',
                '</div>'
            ].join('');
            const copyBtn = block.querySelector('[data-wf-copy-btn]');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    const text = copyBtn.getAttribute('data-wf-copy-text');
                    if (!text) return;
                    if (copyBtn.getAttribute('data-wf-copy-uncertain') === 'true') {
                        alert(
                            'Warning:\n\n' +
                            'You copied a breakdown that may not be complete.\n\n' +
                            'Please scroll down the page so that all of today\'s reviews are visible on the page before copying to ensure accurate results.'
                        );
                    }
                    if (copyBtn._wfCopyResetTimeout) clearTimeout(copyBtn._wfCopyResetTimeout);
                    navigator.clipboard.writeText(text).then(() => {
                        Logger.log('disputes-reviewed-today: copied breakdown to clipboard');
                        copyBtn.textContent = 'Copied!';
                        copyBtn.classList.add('text-green-600', 'dark:text-green-400');
                        copyBtn._wfCopyResetTimeout = setTimeout(() => {
                            copyBtn._wfCopyResetTimeout = null;
                            copyBtn.textContent = 'Copy';
                            copyBtn.classList.remove('text-green-600', 'dark:text-green-400');
                        }, 5000);
                    }).catch((err) => {
                        Logger.error('disputes-reviewed-today: failed to copy breakdown', err);
                    });
                });
            }
            const updatePastDayUI = () => {
                const inputEl = block.querySelector('[data-wf-past-day-input]');
                const labelEl = block.querySelector('[data-wf-past-day-label]');
                const dateEl = block.querySelector('[data-wf-past-day-date]');
                if (!inputEl || !labelEl || !dateEl) return;
                let n = parseInt(inputEl.value, 10);
                if (Number.isNaN(n) || n < 1) {
                    n = 1;
                    inputEl.value = n;
                }
                labelEl.textContent = n === 1 ? 'day ago:' : 'days ago:';
                dateEl.textContent = this.formatDateLabel(this.dateNDaysAgo(n));
            };
            const pastDown = block.querySelector('[data-wf-past-day-down]');
            const pastInput = block.querySelector('[data-wf-past-day-input]');
            const pastUp = block.querySelector('[data-wf-past-day-up]');
            const pastCopyBtn = block.querySelector('[data-wf-past-day-copy-btn]');
            if (pastDown) {
                pastDown.addEventListener('click', () => {
                    const n = Math.max(1, (parseInt(pastInput.value, 10) || 1) - 1);
                    pastInput.value = n;
                    updatePastDayUI();
                });
            }
            if (pastUp) {
                pastUp.addEventListener('click', () => {
                    const n = (parseInt(pastInput.value, 10) || 1) + 1;
                    pastInput.value = n;
                    updatePastDayUI();
                });
            }
            if (pastInput) {
                pastInput.addEventListener('input', updatePastDayUI);
                pastInput.addEventListener('keydown', (e) => {
                    if (e.key === 'e' || e.key === '-' || e.key === '+') e.preventDefault();
                });
            }
            if (pastCopyBtn) {
                pastCopyBtn.addEventListener('click', () => {
                    const panel = block.closest('[role="tabpanel"]');
                    const tbl = panel ? panel.querySelector('table') : null;
                    if (!tbl) return;
                    const rows = Array.from(tbl.querySelectorAll('tbody tr'));
                    const n = Math.max(1, parseInt(pastInput.value, 10) || 1);
                    const ref = this.dateNDaysAgo(n);
                    const stats = this.getStatsForDate(rows, ref.month, ref.day);
                    const text = this.buildCopyTextForDate(stats);
                    if (pastCopyBtn._wfCopyResetTimeout) clearTimeout(pastCopyBtn._wfCopyResetTimeout);
                    navigator.clipboard.writeText(text).then(() => {
                        Logger.log('disputes-reviewed-today: copied past-day breakdown to clipboard', { daysAgo: n });
                        pastCopyBtn.textContent = 'Copied!';
                        pastCopyBtn.classList.add('text-green-600', 'dark:text-green-400');
                        pastCopyBtn._wfCopyResetTimeout = setTimeout(() => {
                            pastCopyBtn._wfCopyResetTimeout = null;
                            pastCopyBtn.textContent = 'Copy';
                            pastCopyBtn.classList.remove('text-green-600', 'dark:text-green-400');
                        }, 5000);
                    }).catch((err) => {
                        Logger.error('disputes-reviewed-today: failed to copy past-day breakdown', err);
                    });
                });
            }
            updatePastDayUI();
            grid.insertAdjacentElement('afterend', block);
            Logger.log('disputes-reviewed-today: injected today breakdown and copy block');
        }

        const todayEl = block.querySelector('[data-wf-today-count]');
        const breakdownEl = block.querySelector('[data-wf-breakdown]');
        const msgEl = block.querySelector('[data-wf-scroll-msg]');
        const copySectionEl = block.querySelector('[data-wf-copy-section]');
        const copyBtn = block.querySelector('[data-wf-copy-btn]');
        if (todayEl) todayEl.textContent = uncertain ? `${todayCount}? today` : `${todayCount} today`;
        if (breakdownEl) breakdownEl.textContent = breakdownText;
        if (copySectionEl) copySectionEl.classList.toggle('hidden', todayCount === 0);
        if (msgEl) {
            if (uncertain) {
                msgEl.classList.remove('hidden');
                msgEl.classList.add('block');
            } else {
                msgEl.classList.add('hidden');
                msgEl.classList.remove('block');
            }
        }
        if (copyBtn) {
            copyBtn.setAttribute('data-wf-copy-uncertain', uncertain ? 'true' : 'false');
            if (!copyBtn._wfCopyResetTimeout) {
                copyBtn.textContent = 'Copy';
            }
            const copyLines = [
                `Disputes Reviewed: ${todayCount} tasks.`,
                `Approved: ${todayApproved}, Rejected: ${todayRejected}` + (dayAr != null ? ` (${dayAr}% AR)` : '')
            ];
            copyBtn.setAttribute('data-wf-copy-text', copyLines.join('\n'));
        }
        if (uncertain && !state.lastUncertain) {
            Logger.info('disputes-reviewed-today: last visible row is today — showing uncertain count and scroll message');
        }
        state.lastUncertain = uncertain;
    }
};
