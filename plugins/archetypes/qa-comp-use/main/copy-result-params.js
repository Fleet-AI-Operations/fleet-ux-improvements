// ============= copy-result-params.js =============
// Adds a "Copy Result Params and Inputs" button under the Your Answer title/explanation.
// Click copies each parameter label and value (e.g. "Total Paid: 0") to the clipboard with green 1s confirmation (label unchanged).

const COPY_RESULT_PARAMS_MARKER = 'data-fleet-copy-result-params';
const CONFIRMATION_MS = 1000;
const FAILURE_PULSE_MS = 500;
const GREEN_BG = 'rgb(34, 197, 94)';
const FAILURE_RED_BG = 'rgb(239, 68, 68)';

const plugin = {
    id: 'copyResultParams',
    name: 'Copy Result Params and Inputs',
    description: 'Add a button under Your Answer that copies all parameter labels and values to the clipboard',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        buttonAdded: false,
        missingLogged: false
    },

    onMutation(state, context) {
        const yourAnswerSection = this.findYourAnswerSection();
        if (!yourAnswerSection) {
            if (!state.missingLogged) {
                Logger.debug('Copy Result Params: Your Answer section not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        if (yourAnswerSection.querySelector(`[${COPY_RESULT_PARAMS_MARKER}="true"]`)) {
            return;
        }

        const titleBlock = yourAnswerSection.querySelector('h4')?.closest('div');
        if (!titleBlock) {
            Logger.debug('Copy Result Params: title block not found');
            return;
        }

        const button = this.createCopyButton(yourAnswerSection);
        titleBlock.appendChild(button);
        state.buttonAdded = true;
        Logger.log('Copy Result Params: Copy button added');
    },

    findYourAnswerSection() {
        const headings = document.querySelectorAll('h4');
        for (const h of headings) {
            if (h.textContent && h.textContent.trim() === 'Your Answer') {
                const blueBox = h.closest('.rounded-lg.border');
                if (blueBox && (blueBox.classList.contains('border-blue-200') || blueBox.classList.contains('dark:border-blue-800'))) {
                    return blueBox;
                }
                return h.closest('div.space-y-4') || h.closest('div[class*="border-blue"]') || h.parentElement?.parentElement;
            }
        }
        return null;
    },

    getResultParamsText(root) {
        const grid = root.querySelector('.grid.grid-cols-1.gap-4') || root.querySelector('.grid');
        if (!grid) return '';

        const lines = [];
        const rows = grid.querySelectorAll('.space-y-2');
        for (const row of rows) {
            const label = row.querySelector('label');
            const input = row.querySelector('input, textarea');
            if (!label || !input) continue;
            const labelText = label.textContent.replace(/\s+/g, ' ').trim();
            const value = (input.value != null && input.value !== undefined) ? String(input.value).trim() : '';
            lines.push(`${labelText}: ${value}`);
        }
        return lines.join('\n');
    },

    clearCopyButtonFeedback(button) {
        if (button._copyResultParamsTimeout) {
            clearTimeout(button._copyResultParamsTimeout);
            button._copyResultParamsTimeout = null;
        }
        if (button._copyResultParamsFailTimeout) {
            clearTimeout(button._copyResultParamsFailTimeout);
            button._copyResultParamsFailTimeout = null;
        }
        button.style.transition = '';
        button.style.backgroundColor = '';
        button.style.color = '';
    },

    showCopySuccessFlash(button) {
        this.clearCopyButtonFeedback(button);
        button.style.backgroundColor = GREEN_BG;
        button.style.color = 'white';
        button._copyResultParamsTimeout = setTimeout(() => {
            button.style.backgroundColor = '';
            button.style.color = '';
            button._copyResultParamsTimeout = null;
        }, CONFIRMATION_MS);
    },

    showCopyFailurePulse(button) {
        this.clearCopyButtonFeedback(button);
        const prevTransition = button.style.transition;
        button.style.transition = 'none';
        button.style.backgroundColor = FAILURE_RED_BG;
        button.style.color = '#ffffff';
        void button.offsetHeight;
        button.style.transition = `background-color ${FAILURE_PULSE_MS}ms ease-out, color ${FAILURE_PULSE_MS}ms ease-out`;
        button.style.backgroundColor = '';
        button.style.color = '';
        button._copyResultParamsFailTimeout = setTimeout(() => {
            button.style.transition = prevTransition || '';
            button._copyResultParamsFailTimeout = null;
        }, FAILURE_PULSE_MS);
    },

    createCopyButton(yourAnswerSection) {
        const wrapper = document.createElement('div');
        wrapper.setAttribute(COPY_RESULT_PARAMS_MARKER, 'true');
        wrapper.setAttribute('data-fleet-plugin', this.id);
        wrapper.className = 'mt-2';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        button.setAttribute('data-fleet-plugin', this.id);
        button.textContent = 'Copy Result Params and Inputs';
        button.title = 'Copy parameter labels and values to clipboard';

        button.addEventListener('click', () => {
            const text = this.getResultParamsText(yourAnswerSection);
            if (!text) {
                Logger.warn('Copy Result Params: No parameters to copy');
                this.showCopyFailurePulse(button);
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                Logger.log(`Copy Result Params: Copied ${text.length} chars to clipboard`);
                this.showCopySuccessFlash(button);
            }).catch((err) => {
                Logger.error('Copy Result Params: Failed to copy to clipboard', err);
                this.showCopyFailurePulse(button);
            });
        });

        wrapper.appendChild(button);
        return wrapper;
    }
};
