// ============= copy-verifier-output.js =============
// Adds a copy button after "Stdout" in the Verifier Output panel. Click copies the verifier output to the clipboard.

const COPY_BUTTON_MARKER = 'data-fleet-copy-verifier-output';

const plugin = {
    id: 'copyVerifierOutput',
    name: 'Copy Verifier Output',
    description: 'Add a copy button after to the Verifier Output panel. Click copies the verifier output to the clipboard',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        buttonAdded: false,
        stdoutRowMissingLogged: false
    },

    onMutation(state, context) {
        const stdoutRow = this.findStdoutRow();
        if (!stdoutRow) {
            if (!state.stdoutRowMissingLogged) {
                Logger.debug('Copy Verifier Output: Stdout row not found');
                state.stdoutRowMissingLogged = true;
            }
            return;
        }
        state.stdoutRowMissingLogged = false;

        if (stdoutRow.querySelector(`[${COPY_BUTTON_MARKER}="true"]`)) {
            return;
        }

        const container = stdoutRow.closest('div.text-xs.w-full');
        if (!container) {
            Logger.debug('Copy Verifier Output: Stdout container not found');
            return;
        }

        const button = this.createCopyButton(container);
        stdoutRow.appendChild(button);
        if (!stdoutRow.classList.contains('flex')) {
            stdoutRow.classList.add('flex', 'items-center', 'gap-2');
        }
        state.buttonAdded = true;
        Logger.log('Copy Verifier Output: Copy button added');
    },

    getGradingPanelRoot() {
        const reportGradingBtn = Array.from(document.querySelectorAll('button')).find(
            (btn) => btn.textContent && btn.textContent.trim().includes('Report Grading Issues')
        );
        if (reportGradingBtn) {
            const panel = reportGradingBtn.closest('[data-panel]');
            if (panel) return panel;
        }
        const instanceContent = document.querySelector('[data-ui="qa-instance-content"]');
        if (instanceContent) {
            const instancePanel = instanceContent.closest('[data-panel]');
            if (instancePanel && instancePanel.parentElement) {
                const sibling = instancePanel.nextElementSibling || instancePanel.previousElementSibling;
                if (sibling && sibling.getAttribute?.('data-panel')) return sibling;
            }
        }
        return null;
    },

    findStdoutRow() {
        const gradingPanel = this.getGradingPanelRoot();
        const roots = gradingPanel ? [gradingPanel, document] : [document];
        for (const root of roots) {
            const candidates = root.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-1');
            for (const el of candidates) {
                if (el.textContent.trim() === 'Stdout') {
                    return el;
                }
            }
        }
        return null;
    },

    getVerifierOutputText(container) {
        const pre = container.querySelector('div.overflow-x-auto.bg-background.border.rounded pre');
        if (pre) {
            return pre.textContent.trim();
        }
        return null;
    },

    createCopyButton(container) {
        const button = document.createElement('button');
        button.setAttribute(COPY_BUTTON_MARKER, 'true');
        button.setAttribute('data-fleet-plugin', this.id);
        button.type = 'button';
        button.className = 'inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        button.setAttribute('data-state', 'closed');
        button.title = 'Copy verifier output to clipboard';
        button.setAttribute('aria-label', 'Copy verifier output to clipboard');

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

        let copyFeedbackTimeoutId = null;
        button.addEventListener('click', () => {
            const text = this.getVerifierOutputText(container);
            if (!text) {
                Logger.warn('Copy Verifier Output: No verifier output to copy');
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                Logger.log(`Copy Verifier Output: Copied ${text.length} chars to clipboard`);
                button.style.backgroundColor = 'rgb(34, 197, 94)';
                button.style.color = 'white';
                if (copyFeedbackTimeoutId) clearTimeout(copyFeedbackTimeoutId);
                copyFeedbackTimeoutId = setTimeout(() => {
                    button.style.backgroundColor = '';
                    button.style.color = '';
                    copyFeedbackTimeoutId = null;
                }, 1000);
            }).catch((err) => {
                Logger.error('Copy Verifier Output: Failed to copy to clipboard', err);
            });
        });

        return button;
    }
};
