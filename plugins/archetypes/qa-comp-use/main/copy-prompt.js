// ============= copy-prompt.js =============
// Adds a copy button in the Prompt section header. Click copies the prompt text to the clipboard.

const COPY_BUTTON_MARKER = 'data-fleet-copy-prompt';

const plugin = {
    id: 'copyPrompt',
    name: 'Copy Prompt',
    description: 'Add a copy button next to the Prompt label. Click copies the prompt text to the clipboard',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        buttonAdded: false,
        sectionMissingLogged: false,
        labelRowMissingLogged: false
    },

    onMutation(state, context) {
        const promptSection = this.findPromptSection();
        if (!promptSection) {
            if (!state.sectionMissingLogged) {
                Logger.debug('Copy Prompt: Prompt section not found');
                state.sectionMissingLogged = true;
            }
            return;
        }
        state.sectionMissingLogged = false;

        const labelEl = this.findPromptLabelEl(promptSection);
        if (!labelEl) {
            if (!state.labelRowMissingLogged) {
                Logger.debug('Copy Prompt: Prompt label element not found');
                state.labelRowMissingLogged = true;
            }
            return;
        }
        state.labelRowMissingLogged = false;

        if (labelEl.querySelector(`[${COPY_BUTTON_MARKER}="true"]`)) {
            return;
        }

        const button = this.createCopyButton(promptSection);
        labelEl.appendChild(button);
        if (!labelEl.classList.contains('flex')) {
            labelEl.classList.add('inline-flex', 'items-center', 'gap-2');
        }
        state.buttonAdded = true;
        Logger.log('✓ Copy Prompt: Copy button added');
    },

    findPromptSection() {
        const candidates = document.querySelectorAll('div.flex.flex-col.gap-2');
        for (const candidate of candidates) {
            const label = candidate.querySelector('label');
            const span = candidate.querySelector('span.text-sm.text-muted-foreground.font-medium');
            if (label && label.textContent.trim() === 'Prompt') {
                return candidate;
            }
            if (span && span.textContent.trim() === 'Prompt') {
                return candidate;
            }
        }
        return null;
    },

    findPromptLabelEl(promptSection) {
        const label = promptSection.querySelector('label');
        const span = promptSection.querySelector('span.text-sm.text-muted-foreground.font-medium');
        const labelEl = label && label.textContent.trim() === 'Prompt' ? label : (span && span.textContent.trim() === 'Prompt' ? span : null);
        return labelEl || null;
    },

    getPromptText(promptSection) {
        const textarea = promptSection.querySelector('textarea');
        if (textarea && textarea.value !== undefined) {
            return textarea.value.trim();
        }
        const preWrap = promptSection.querySelector('div.text-sm.whitespace-pre-wrap');
        if (preWrap) {
            return preWrap.textContent.trim();
        }
        return null;
    },

    createCopyButton(promptSection) {
        const button = document.createElement('button');
        button.setAttribute(COPY_BUTTON_MARKER, 'true');
        button.setAttribute('data-fleet-plugin', this.id);
        button.type = 'button';
        button.className = 'inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        button.setAttribute('data-state', 'closed');
        button.title = 'Copy prompt to clipboard';
        button.setAttribute('aria-label', 'Copy prompt to clipboard');

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '12');
        svg.setAttribute('height', '12');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.className = 'fill-current h-3 w-3 text-muted-foreground';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('clip-rule', 'evenodd');
        path.setAttribute('d', 'M2 5C2 3.34315 3.34315 2 5 2H12C13.6569 2 15 3.34315 15 5C15 5.55228 14.5523 6 14 6C13.4477 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4H5C4.44772 4 4 4.44772 4 5V13C4 13.5523 4.44772 14 5 14H6C6.55228 14 7 14.4477 7 15C7 15.5523 6.55228 16 6 16H5C3.34315 16 2 14.6569 2 13V5ZM9 10.8462C9 9.20041 10.42 8 12 8H19C20.58 8 22 9.20041 22 10.8462V19.1538C22 20.7996 20.58 22 19 22H12C10.42 22 9 20.7996 9 19.1538V10.8462ZM12 10C11.3708 10 11 10.4527 11 10.8462V19.1538C11 19.5473 11.3708 20 12 20H19C19.6292 20 20 19.5473 20 19.1538V10.8462C20 10.4527 19.6292 10 19 10H12Z');
        svg.appendChild(path);
        button.appendChild(svg);

        button.addEventListener('click', () => {
            const text = this.getPromptText(promptSection);
            if (!text) {
                Logger.warn('Copy Prompt: No prompt text to copy');
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                Logger.log(`Copy Prompt: Copied ${text.length} chars to clipboard`);
            }).catch((err) => {
                Logger.error('Copy Prompt: Failed to copy to clipboard', err);
            });
        });

        return button;
    }
};
