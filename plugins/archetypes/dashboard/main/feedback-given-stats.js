// ============= feedback-given-stats.js =============
const plugin = {
    id: 'feedbackGivenStats',
    name: 'Feedback Given Stats',
    description: 'Show overall approval rate, today\'s feedback count and environment breakdown with day and per-env approval rates, plus copy and scroll warning',
    _version: '3.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, lastUncertain: false, lastStatsPayload: null },

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

    /** @returns {'approved'|'feedback-requested'|null} */
    classifyFeedback(cell) {
        if (!cell) return null;
        const text = (cell.textContent || '').trim();
        if (/approved/i.test(text)) return 'approved';
        if (/feedback\s+requested/i.test(text)) return 'feedback-requested';
        return null;
    },

    getStatsForDate(rows, targetMonth, targetDay) {
        let count = 0;
        const envCount = Object.create(null);
        const envApproved = Object.create(null);
        const envFeedbackRequested = Object.create(null);
        for (const tr of rows) {
            const dateCell = tr.cells[0];
            const envCell = tr.cells[2];
            const feedbackCell = tr.cells[3];
            const dateText = dateCell ? dateCell.textContent.trim() : '';
            const env = envCell ? envCell.textContent.trim() : '';
            const parsed = this.parseDateText(dateText);
            if (this.sameDate(parsed, { month: targetMonth, day: targetDay })) {
                count++;
                if (env) {
                    envCount[env] = (envCount[env] || 0) + 1;
                    const feedback = this.classifyFeedback(feedbackCell);
                    if (feedback === 'approved') envApproved[env] = (envApproved[env] || 0) + 1;
                    else if (feedback === 'feedback-requested') envFeedbackRequested[env] = (envFeedbackRequested[env] || 0) + 1;
                }
            }
        }
        return { count, envCount, envApproved, envFeedbackRequested };
    },

    buildCopyTextForDate(stats, uncertain) {
        const count = stats && typeof stats.count === 'number' ? stats.count : 0;
        const envCount = (stats && stats.envCount) || Object.create(null);
        const suffix = uncertain ? '?' : '';
        const lines = [
            `QA: ${count}${suffix} tasks.`,
            ...Object.entries(envCount)
                .sort((a, b) => b[1] - a[1])
                .map(([name, n]) => `${name}: ${n}`)
        ];
        return lines.join('\n');
    },

    isPastDayUncertain(rows, targetMonth, targetDay, stats) {
        if (!rows || rows.length === 0) return true;
        if (!stats) return true;
        if (stats.count === 0) return true;
        if (stats.count !== 10) return false;

        let lastIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            const tr = rows[i];
            const dateCell = tr.cells[0];
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
            const dateCell = tr.cells[0];
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
                Logger.debug('feedback-given-stats: main not found');
                state.missingLogged = true;
            }
            return;
        }

        const feedbackGivenHeading = main.querySelector('h3.tracking-tight.text-base.font-medium.text-primary');
        if (!feedbackGivenHeading || feedbackGivenHeading.textContent.trim() !== 'Feedback Given') {
            if (!state.missingLogged) {
                Logger.debug('feedback-given-stats: Feedback Given card not found');
                state.missingLogged = true;
            }
            return;
        }

        const card = feedbackGivenHeading.closest('.rounded-xl');
        if (!card) return;

        // 1. Overall approval rate on card subtext (once)
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
                        Logger.log('feedback-given-stats: added overall approval rate to Feedback Given stat', { approved, feedbackRequested, rate });
                    }
                }
            }
            card.setAttribute('data-wf-feedback-stats', 'true');
        }

        const panel = card.closest('[role="tabpanel"]');
        const table = panel ? panel.querySelector('table') : null;
        if (!table) {
            if (!state.missingLogged) {
                Logger.debug('feedback-given-stats: table not found in tab panel');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const rows = Array.from(table.querySelectorAll('tbody tr'));
        let todayCount = 0;
        let todayApproved = 0;
        let todayFeedbackRequested = 0;
        const envCount = Object.create(null);
        const envApproved = Object.create(null);
        const envFeedbackRequested = Object.create(null);
        let lastRowIsToday = false;

        for (let i = 0; i < rows.length; i++) {
            const tr = rows[i];
            const dateCell = tr.cells[0];
            const envCell = tr.cells[2];
            const feedbackCell = tr.cells[3];
            const dateText = dateCell ? dateCell.textContent.trim() : '';
            const env = envCell ? envCell.textContent.trim() : '';
            const parsed = this.parseDateText(dateText);
            const rowIsToday = this.isToday(parsed);
            if (rowIsToday) {
                todayCount++;
                if (env) {
                    envCount[env] = (envCount[env] || 0) + 1;
                }
                const feedback = this.classifyFeedback(feedbackCell);
                if (feedback === 'approved') {
                    todayApproved++;
                    if (env) {
                        envApproved[env] = (envApproved[env] || 0) + 1;
                    }
                } else if (feedback === 'feedback-requested') {
                    todayFeedbackRequested++;
                    if (env) {
                        envFeedbackRequested[env] = (envFeedbackRequested[env] || 0) + 1;
                    }
                }
            }
            if (i === rows.length - 1) lastRowIsToday = rowIsToday;
        }

        const uncertain = rows.length > 0 && lastRowIsToday;
        const todayTotalAr = todayApproved + todayFeedbackRequested;
        const dayAr = todayTotalAr > 0 ? Math.round((todayApproved / todayTotalAr) * 100) : null;

        const sortedEnvsForPayload = Object.entries(envCount)
            .sort((a, b) => b[1] - a[1])
            .map(([name, n]) => {
                const a = envApproved[name] || 0;
                const f = envFeedbackRequested[name] || 0;
                const total = a + f;
                const ar = total > 0 ? Math.round((a / total) * 100) : null;
                return [name, n, ar];
            });
        const statsPayload = JSON.stringify({ todayCount, dayAr, uncertain, env: sortedEnvsForPayload });

        const todayCopyText = this.buildCopyTextForDate({ count: todayCount, envCount }, uncertain);

        const copyButtonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const arrowBtnActive = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-blue-500 text-blue-500 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-base font-medium cursor-pointer';
        const arrowBtnDisabled = 'inline-flex items-center justify-center w-8 h-8 rounded-sm border bg-transparent border-gray-500 text-gray-500 text-base font-medium cursor-not-allowed';

        let block = card.querySelector('[data-wf-feedback-stats-block]');
        if (!block) {
            block = document.createElement('div');
            block.setAttribute('data-wf-feedback-stats-block', 'true');
            block._wfDaysAgo = 0;
            block.className = 'p-4 pt-4 border-t border-border/50 flex flex-col justify-center';
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
                '<div class="text-sm text-blue-600 dark:text-blue-400" data-wf-count></div>',
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

            const renderEnvLines = (el, envData) => {
                el.textContent = '';
                el.className = 'text-sm text-right ml-2';
                if (envData.length === 0) {
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
            };

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
                                ? 'Please scroll down the page so that all of today\'s tasks are visible on the page before copying to ensure accurate results.'
                                : 'Please scroll down the page so that all submissions for that day are visible on the page before copying to ensure accurate results.')
                        );
                    }
                    navigator.clipboard.writeText(text).then(() => {
                        Logger.log('feedback-given-stats: copied breakdown to clipboard', { daysAgo: block._wfDaysAgo || 0 });
                        self.flashCopyButtonSuccess(copyBtn);
                    }).catch((err) => {
                        Logger.error('feedback-given-stats: failed to copy breakdown', err);
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

                let isUncertain, copyText;

                if (daysAgo === 0) {
                    const ts = block._wfTodayStats || {};
                    isUncertain = ts.uncertain || false;
                    copyText = ts.copyText || '';
                    if (dateLabelEl) dateLabelEl.textContent = '';
                    if (countEl) {
                        countEl.className = 'text-sm';
                        countEl.textContent = '';
                        const numSpan = document.createElement('span');
                        numSpan.className = 'text-blue-600 dark:text-blue-400';
                        numSpan.textContent = ts.uncertain ? `${ts.count || 0}?` : String(ts.count || 0);
                        countEl.appendChild(numSpan);
                        if (ts.dayAr != null) {
                            const arSpan = document.createElement('span');
                            arSpan.className = 'text-muted-foreground';
                            arSpan.textContent = ` (${ts.dayAr}% AR)`;
                            countEl.appendChild(arSpan);
                        }
                    }
                    if (breakdownEl) renderEnvLines(breakdownEl, ts.envData || []);
                } else {
                    const ref = self.dateNDaysAgo(daysAgo);
                    if (dateLabelEl) dateLabelEl.textContent = self.formatDateLabel(ref);
                    const panelEl = block.closest('[role="tabpanel"]');
                    const tableEl = panelEl ? panelEl.querySelector('table') : null;
                    const liveRows = tableEl ? Array.from(tableEl.querySelectorAll('tbody tr')) : [];
                    const stats = self.getStatsForDate(liveRows, ref.month, ref.day);
                    isUncertain = self.isPastDayUncertain(liveRows, ref.month, ref.day, stats);
                    copyText = self.buildCopyTextForDate(stats, isUncertain);
                    let a = 0, f = 0;
                    for (const k of Object.keys(stats.envCount || {})) {
                        a += (stats.envApproved && stats.envApproved[k]) || 0;
                        f += (stats.envFeedbackRequested && stats.envFeedbackRequested[k]) || 0;
                    }
                    const total = a + f;
                    const dayArPast = total > 0 ? Math.round((a / total) * 100) : null;
                    if (countEl) {
                        countEl.className = 'text-sm';
                        countEl.textContent = '';
                        const numSpan = document.createElement('span');
                        numSpan.className = 'text-blue-600 dark:text-blue-400';
                        numSpan.textContent = `${stats.count}${isUncertain ? '?' : ''}`;
                        countEl.appendChild(numSpan);
                        if (dayArPast != null) {
                            const arSpan = document.createElement('span');
                            arSpan.className = 'text-muted-foreground';
                            arSpan.textContent = ` (${dayArPast}% AR)`;
                            countEl.appendChild(arSpan);
                        }
                    }
                    const pastEnvData = Object.entries(stats.envCount || {})
                        .sort((x, y) => y[1] - x[1])
                        .map(([name, count]) => {
                            const envA = (stats.envApproved && stats.envApproved[name]) || 0;
                            const envF = (stats.envFeedbackRequested && stats.envFeedbackRequested[name]) || 0;
                            const envTotal = envA + envF;
                            const ar = envTotal > 0 ? Math.round((envA / envTotal) * 100) : null;
                            return [name, count, ar];
                        });
                    if (breakdownEl) renderEnvLines(breakdownEl, pastEnvData);
                }

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
            const existingContent = card.querySelector('.p-4.pt-0.flex.items-end.justify-between');
            if (existingContent && existingContent.nextSibling) {
                card.insertBefore(block, existingContent.nextSibling);
            } else {
                card.appendChild(block);
            }
            Logger.log('feedback-given-stats: injected stats block');
        }

        block._wfTodayStats = {
            count: todayCount,
            uncertain,
            dayAr,
            envData: sortedEnvsForPayload,
            copyText: todayCopyText
        };

        if (typeof block._wfUpdateUI === 'function') {
            block._wfUpdateUI();
        }

        if (uncertain && !state.lastUncertain) {
            Logger.info('feedback-given-stats: last visible row is today — showing uncertain count and scroll message');
        }
        state.lastUncertain = uncertain;
        state.lastStatsPayload = statsPayload;
    }
};
