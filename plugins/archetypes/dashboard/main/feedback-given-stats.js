// ============= feedback-given-stats.js =============
const plugin = {
    id: 'feedbackGivenStats',
    name: 'Feedback Given Stats',
    description: 'Show overall approval rate, today\'s feedback count and environment breakdown with day and per-env approval rates, plus copy and scroll warning',
    _version: '1.6',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, lastUncertain: false, lastStatsPayload: null },

    /** Month name (3-letter) to 1-based month index. */
    MONTH_INDEX: { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 },

    /**
     * Parse date text like "Jan 27" or "Feb 2" (ignore year).
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

    /** @returns {'approved'|'feedback-requested'|null} */
    classifyFeedback(cell) {
        if (!cell) return null;
        const text = (cell.textContent || '').trim();
        if (/approved/i.test(text)) return 'approved';
        if (/feedback\s+requested/i.test(text)) return 'feedback-requested';
        return null;
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

        const copyButtonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';

        let block = card.querySelector('[data-wf-feedback-stats-block]');
        if (!block) {
            block = document.createElement('div');
            block.setAttribute('data-wf-feedback-stats-block', 'true');
            block.className = 'p-4 pt-4 border-t border-border/50 flex flex-col justify-center';
            block.innerHTML = [
                '<div class="flex justify-between gap-4">',
                '<div class="text-sm text-blue-600 dark:text-blue-400" data-wf-today-count></div>',
                '<div class="text-sm text-muted-foreground text-right ml-2" data-wf-env-breakdown></div>',
                '</div>',
                '<div class="mt-4 flex justify-between items-center gap-2" data-wf-copy-section>',
                '<span class="text-xs text-muted-foreground">Copy your breakdown for the day? (Perfect for reporting time in Deel)</span>',
                '<button type="button" class="' + copyButtonClass + '" data-wf-copy-btn>Copy</button>',
                '</div>',
                '<p class="text-xs text-muted-foreground mt-2 hidden" data-wf-scroll-msg>Please scroll down to ensure all of today\'s submissions have been counted accurately. The copy breakdown functionality may be inaccurate until you do this.</p>'
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
                            'Please scroll down the page so that all of today\'s tasks are visible on the page before copying to ensure accurate results.'
                        );
                    }
                    if (copyBtn._wfCopyResetTimeout) clearTimeout(copyBtn._wfCopyResetTimeout);
                    navigator.clipboard.writeText(text).then(() => {
                        Logger.log('feedback-given-stats: copied breakdown to clipboard');
                        copyBtn.textContent = 'Copied!';
                        copyBtn.classList.add('text-green-600', 'dark:text-green-400');
                        copyBtn._wfCopyResetTimeout = setTimeout(() => {
                            copyBtn._wfCopyResetTimeout = null;
                            copyBtn.textContent = 'Copy';
                            copyBtn.classList.remove('text-green-600', 'dark:text-green-400');
                        }, 5000);
                    }).catch((err) => {
                        Logger.error('feedback-given-stats: failed to copy breakdown', err);
                    });
                });
            }
            const existingContent = card.querySelector('.p-4.pt-0.flex.items-end.justify-between');
            if (existingContent && existingContent.nextSibling) {
                card.insertBefore(block, existingContent.nextSibling);
            } else {
                card.appendChild(block);
            }
            Logger.log('feedback-given-stats: injected stats block');
        }

        if (statsPayload === state.lastStatsPayload) {
            state.lastUncertain = uncertain;
            return;
        }

        const todayEl = block.querySelector('[data-wf-today-count]');
        const envBreakdownEl = block.querySelector('[data-wf-env-breakdown]');
        const msgEl = block.querySelector('[data-wf-scroll-msg]');
        const copySectionEl = block.querySelector('[data-wf-copy-section]');
        const copyBtn = block.querySelector('[data-wf-copy-btn]');

        const todayLabel = uncertain ? `${todayCount}? today` : `${todayCount} today`;
        if (todayEl) {
            todayEl.textContent = '';
            todayEl.appendChild(document.createTextNode(todayLabel));
            if (dayAr != null) {
                const arSpan = document.createElement('span');
                arSpan.className = 'text-muted-foreground';
                arSpan.textContent = ` (${dayAr}% AR)`;
                todayEl.appendChild(arSpan);
            }
        }

        if (envBreakdownEl) {
            envBreakdownEl.textContent = '';
            envBreakdownEl.className = 'text-sm text-right ml-2';
            if (sortedEnvsForPayload.length === 0) {
                envBreakdownEl.textContent = '—';
            } else {
                for (const [name, n, ar] of sortedEnvsForPayload) {
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
                    envBreakdownEl.appendChild(line);
                }
            }
        }

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
                `QA: ${todayCount} tasks.`,
                ...Object.entries(envCount)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, n]) => `${name}: ${n}`)
            ];
            copyBtn.setAttribute('data-wf-copy-text', copyLines.join('\n'));
        }
        if (uncertain && !state.lastUncertain) {
            Logger.info('feedback-given-stats: last visible row is today — showing uncertain count and scroll message');
        }
        state.lastUncertain = uncertain;
        state.lastStatsPayload = statsPayload;
    }
};
