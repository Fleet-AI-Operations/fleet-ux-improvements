// ============= feedback-given-today-env.js =============
const plugin = {
    id: 'feedbackGivenTodayEnv',
    name: 'Feedback Given Today and Environment',
    description: 'Show today\'s feedback count and environment breakdown under the Feedback Given stat, with a warning when list may be incomplete',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, lastUncertain: false },

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

    onMutation(state, context) {
        const main = Context.dom.query('main', { context: `${this.id}.main` });
        if (!main) {
            if (!state.missingLogged) {
                Logger.debug('feedback-given-today-env: main not found');
                state.missingLogged = true;
            }
            return;
        }

        const feedbackGivenHeading = main.querySelector('h3.tracking-tight.text-base.font-medium.text-primary');
        if (!feedbackGivenHeading || feedbackGivenHeading.textContent.trim() !== 'Feedback Given') {
            if (!state.missingLogged) {
                Logger.debug('feedback-given-today-env: Feedback Given card not found');
                state.missingLogged = true;
            }
            return;
        }

        const card = feedbackGivenHeading.closest('.rounded-xl');
        if (!card) return;

        const panel = card.closest('[role="tabpanel"]');
        const table = panel ? panel.querySelector('table') : null;
        if (!table) {
            if (!state.missingLogged) {
                Logger.debug('feedback-given-today-env: table not found in tab panel');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const rows = Array.from(table.querySelectorAll('tbody tr'));
        let todayCount = 0;
        const envCount = Object.create(null);
        let lastRowIsToday = false;

        for (let i = 0; i < rows.length; i++) {
            const tr = rows[i];
            const dateCell = tr.cells[0];
            const envCell = tr.cells[2];
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

        const uncertain = rows.length > 0 && lastRowIsToday;
        const envBreakdownText = Object.keys(envCount).length === 0
            ? '—'
            : Object.entries(envCount)
                .sort((a, b) => b[1] - a[1])
                .map(([name, n]) => `${name}: ${n}`)
                .join(', ');

        const copyButtonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';

        let block = card.querySelector('[data-wf-feedback-today-env-block]');
        if (!block) {
            block = document.createElement('div');
            block.setAttribute('data-wf-feedback-today-env-block', 'true');
            block.className = 'p-4 pt-4 border-t border-border/50 flex flex-col justify-center';
            block.innerHTML = [
                '<div class="flex justify-between gap-4">',
                '<div class="text-sm text-muted-foreground" data-wf-today-count></div>',
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
                        Logger.log('feedback-given-today-env: copied breakdown to clipboard');
                        copyBtn.textContent = 'Copied!';
                        copyBtn.classList.add('text-green-600', 'dark:text-green-400');
                        copyBtn._wfCopyResetTimeout = setTimeout(() => {
                            copyBtn._wfCopyResetTimeout = null;
                            copyBtn.textContent = 'Copy';
                            copyBtn.classList.remove('text-green-600', 'dark:text-green-400');
                        }, 5000);
                    }).catch((err) => {
                        Logger.error('feedback-given-today-env: failed to copy breakdown', err);
                    });
                });
            }
            const existingContent = card.querySelector('.p-4.pt-0.flex.items-end.justify-between');
            if (existingContent && existingContent.nextSibling) {
                card.insertBefore(block, existingContent.nextSibling);
            } else {
                card.appendChild(block);
            }
            card.setAttribute('data-wf-feedback-today-env', 'true');
            Logger.log('feedback-given-today-env: injected today count and environment breakdown block');
        }

        const todayEl = block.querySelector('[data-wf-today-count]');
        const envEl = block.querySelector('[data-wf-env-breakdown]');
        const msgEl = block.querySelector('[data-wf-scroll-msg]');
        const copySectionEl = block.querySelector('[data-wf-copy-section]');
        const copyBtn = block.querySelector('[data-wf-copy-btn]');
        if (todayEl) todayEl.textContent = uncertain ? `${todayCount}? today` : `${todayCount} today`;
        if (envEl) envEl.textContent = envBreakdownText;
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
            Logger.info('feedback-given-today-env: last visible row is today — showing uncertain count and scroll message');
        }
        state.lastUncertain = uncertain;
    }
};
