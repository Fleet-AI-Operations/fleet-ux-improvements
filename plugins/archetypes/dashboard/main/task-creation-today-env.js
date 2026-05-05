// ============= task-creation-today-env.js =============
const plugin = {
    id: 'taskCreationTodayEnv',
    name: 'Daily Task Creation Breakdown',
    description: 'Show today\'s task creation count and environment breakdown under the Task Creation stat, with a warning when list may be incomplete',
    _version: '3.1',
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
     * Parse date text like "Jan 27" or "Feb 2" (ignore year).
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

    /**
     * Find the Task Creation tab panel: one that has a table with thead containing "Submitted" and "Environment".
     * @returns {HTMLTableElement | null}
     */
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

    /**
     * Resolve "Submitted" (date) and "Environment" column indices from thead.
     * Newer dashboards prepend an ID column (date at index 1, environment at 3).
     * @returns {{ submitted: number, env: number }}
     */
    getTaskTableColumnIndices(table) {
        const row = table.tHead && table.tHead.rows[0];
        if (!row || !row.cells.length) {
            const fallback = { submitted: 1, env: 3 };
            Logger.warn('task-creation-today-env: missing thead row; using fallback column indices', fallback);
            return fallback;
        }
        let submitted = -1;
        let env = -1;
        for (let i = 0; i < row.cells.length; i++) {
            const text = (row.cells[i].textContent || '').replace(/\s+/g, ' ').trim();
            if (submitted < 0 && /^Submitted\b/i.test(text)) submitted = i;
            if (env < 0 && /^Environment\b/i.test(text)) env = i;
        }
        if (submitted >= 0 && env >= 0) {
            Logger.debug('task-creation-today-env: resolved table columns from thead', { submitted, env, theadCells: row.cells.length });
            return { submitted, env };
        }
        const legacy = row.cells.length >= 4 ? { submitted: 1, env: 3 } : { submitted: 0, env: 2 };
        Logger.warn('task-creation-today-env: Submitted/Environment headers not matched; using heuristic', {
            theadCells: row.cells.length,
            ...legacy,
        });
        return legacy;
    },

    getStatsForDate(rows, targetMonth, targetDay, cols) {
        const si = cols.submitted;
        const ei = cols.env;
        let count = 0;
        const envCount = Object.create(null);
        for (const tr of rows) {
            const dateCell = tr.cells[si];
            const envCell = tr.cells[ei];
            const dateText = dateCell ? dateCell.textContent.trim() : '';
            const env = envCell ? envCell.textContent.trim() : '';
            const parsed = this.parseDateText(dateText);
            if (this.sameDate(parsed, { month: targetMonth, day: targetDay })) {
                count++;
                if (env) envCount[env] = (envCount[env] || 0) + 1;
            }
        }
        return { count, envCount };
    },

    buildCopyTextForDate(stats, uncertain) {
        const count = stats && typeof stats.count === 'number' ? stats.count : 0;
        const envCount = (stats && stats.envCount) || Object.create(null);
        const suffix = uncertain ? '?' : '';
        const lines = [
            `Task Creation: ${count}${suffix} tasks.`,
            ...Object.entries(envCount)
                .sort((a, b) => b[1] - a[1])
                .map(([name, n]) => `${name}: ${n}`)
        ];
        return lines.join('\n');
    },

    isPastDayUncertain(rows, targetMonth, targetDay, stats, cols) {
        const si = cols.submitted;
        if (!rows || rows.length === 0) return true;
        if (!stats) return true;
        if (stats.count === 0) return true;
        if (stats.count !== 10) return false;

        let lastIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            const tr = rows[i];
            const dateCell = tr.cells[si];
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
            const dateCell = tr.cells[si];
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
                Logger.warn('task-creation-today-env: main not found — breakdown will not run until <main> is present');
                state.missingLogged = true;
            }
            return;
        }

        const table = this.findTaskCreationTable(main);
        if (!table) {
            if (!state.missingLogged) {
                Logger.warn('task-creation-today-env: Task Creation table not found (expected thead with Submitted + Environment)');
                state.missingLogged = true;
            }
            return;
        }

        const panel = table.closest('[role="tabpanel"]');
        const submittedHeading = panel && Array.from(panel.querySelectorAll('h3')).find(h => h.textContent.trim().startsWith('Submitted'));
        const grid = submittedHeading ? submittedHeading.closest('.grid') : (panel && panel.firstElementChild);
        if (!grid || !grid.matches('.grid')) {
            if (!state.missingLogged) {
                Logger.warn('task-creation-today-env: stat cards grid (.grid with h3 Submitted) not found — cannot attach breakdown block');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const cols = this.getTaskTableColumnIndices(table);
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        let todayCount = 0;
        const envCount = Object.create(null);
        let lastRowIsToday = false;

        for (let i = 0; i < rows.length; i++) {
            const tr = rows[i];
            const dateCell = tr.cells[cols.submitted];
            const envCell = tr.cells[cols.env];
            const dateText = dateCell ? dateCell.textContent.trim() : '';
            const env = envCell ? envCell.textContent.trim() : '';
            const parsed = this.parseDateText(dateText);
            const rowIsToday = this.isToday(parsed);
            if (rowIsToday) {
                todayCount++;
                if (env) envCount[env] = (envCount[env] || 0) + 1;
            }
            if (i === rows.length - 1) lastRowIsToday = rowIsToday;
        }

        if (rows.length > 0 && todayCount === 0) {
            const sample = rows[0].cells[cols.submitted];
            const sampleText = sample ? sample.textContent.trim() : '';
            Logger.debug('task-creation-today-env: zero matches for today after scan', {
                rowCount: rows.length,
                firstSubmittedCell: sampleText,
                cols,
            });
        }

        const uncertain = rows.length > 0 && lastRowIsToday;
        const todayCopyText = this.buildCopyTextForDate({ count: todayCount, envCount }, uncertain);
        const todayEnvBreakdownText = Object.keys(envCount).length === 0
            ? '—'
            : Object.entries(envCount)
                .sort((a, b) => b[1] - a[1])
                .map(([name, n]) => `${name}: ${n}`)
                .join(', ');

        const copyButtonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const arrowBtnActive = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-blue-500 text-blue-500 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-base font-medium cursor-pointer';
        const arrowBtnDisabled = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-gray-500 text-gray-500 text-base font-medium cursor-not-allowed';

        let block = panel.querySelector('[data-wf-task-creation-today-env-block]');
        if (!block) {
            block = document.createElement('div');
            block.setAttribute('data-wf-task-creation-today-env-block', 'true');
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
                '<div class="text-sm text-orange-600 dark:text-orange-400 text-right ml-2" data-wf-breakdown></div>',
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
                    Logger.log('task-creation-today-env: day navigation — previous day', { daysAgo: block._wfDaysAgo });
                    if (typeof block._wfUpdateUI === 'function') block._wfUpdateUI();
                });
            }
            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    block._wfDaysAgo = Math.max(0, (block._wfDaysAgo || 0) - 1);
                    Logger.log('task-creation-today-env: day navigation — next day', { daysAgo: block._wfDaysAgo });
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
                                ? 'Please scroll down the page so that all of today\'s tasks are visible on the page before copying to ensure accurate results.'
                                : 'Please scroll down the page so that all submissions for that day are visible on the page before copying to ensure accurate results.')
                        );
                    }
                    navigator.clipboard.writeText(text).then(() => {
                        Logger.log('task-creation-today-env: copied breakdown to clipboard', { daysAgo: block._wfDaysAgo || 0 });
                        self.flashCopyButtonSuccess(copyBtn);
                    }).catch((err) => {
                        Logger.error('task-creation-today-env: failed to copy breakdown', err);
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
                    displayBreakdown = ts.envBreakdownText || '—';
                    isUncertain = ts.uncertain || false;
                    copyText = ts.copyText || '';
                    if (dateLabelEl) dateLabelEl.textContent = '';
                    Logger.debug('task-creation-today-env: showing today breakdown from last table scan', {
                        count: ts.count,
                        uncertain: !!ts.uncertain,
                    });
                } else {
                    const ref = self.dateNDaysAgo(daysAgo);
                    if (dateLabelEl) dateLabelEl.textContent = self.formatDateLabel(ref);
                    const panelEl = block.closest('[role="tabpanel"]');
                    const tableEl = panelEl ? panelEl.querySelector('table') : null;
                    const liveRows = tableEl ? Array.from(tableEl.querySelectorAll('tbody tr')) : [];
                    const colIdx = block._wfColIndices || { submitted: 1, env: 3 };
                    const stats = self.getStatsForDate(liveRows, ref.month, ref.day, colIdx);
                    isUncertain = self.isPastDayUncertain(liveRows, ref.month, ref.day, stats, colIdx);
                    copyText = self.buildCopyTextForDate(stats, isUncertain);
                    displayCount = `${stats.count}${isUncertain ? '?' : ''}`;
                    displayBreakdown = Object.keys(stats.envCount).length === 0
                        ? '—'
                        : Object.entries(stats.envCount)
                            .sort((a, b) => b[1] - a[1])
                            .map(([name, count]) => `${name}: ${count}`)
                            .join(', ');
                    Logger.log('task-creation-today-env: past-day breakdown computed', {
                        daysAgo,
                        target: self.formatDateLabel(ref),
                        taskRowsInTable: liveRows.length,
                        matchedTasks: stats.count,
                        uncertain: isUncertain,
                        cols: colIdx,
                    });
                }

                if (countEl) {
                    countEl.textContent = '';
                    const numSpan = document.createElement('span');
                    numSpan.className = 'text-blue-600 dark:text-blue-400';
                    numSpan.textContent = displayCount;
                    countEl.appendChild(numSpan);
                }
                if (breakdownEl) breakdownEl.textContent = displayBreakdown;

                if (scrollMsgEl) {
                    scrollMsgEl.textContent = daysAgo === 0
                        ? 'Please scroll down to ensure all of today\'s submissions have been counted accurately. The copy breakdown functionality may be inaccurate until you do this.'
                        : 'Please scroll down to ensure all submissions for that day have been loaded before copying. The copy breakdown functionality may be inaccurate until you do this.';
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
            Logger.log('task-creation-today-env: injected breakdown and copy block');
        }

        block._wfColIndices = cols;
        block._wfTodayStats = {
            count: todayCount,
            uncertain,
            envBreakdownText: todayEnvBreakdownText,
            copyText: todayCopyText
        };

        if (typeof block._wfUpdateUI === 'function') {
            block._wfUpdateUI();
        }

        Logger.debug('task-creation-today-env: table scan complete', {
            rowCount: rows.length,
            todayCount,
            uncertain,
            cols,
        });

        if (uncertain && !state.lastUncertain) {
            Logger.info('task-creation-today-env: last visible row is today — showing uncertain count and scroll message');
        }
        state.lastUncertain = uncertain;
    }
};
