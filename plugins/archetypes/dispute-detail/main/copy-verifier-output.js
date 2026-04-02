// ============= copy-verifier-output.js =============
// Adds a copy button in the verifier output area: after "Stdout" (classic output) or after "Score: #" (checklist verifier).
// Checklist score row: legacy `gap-2` header or card layout (`justify-between`, sticky) inside `div.p-3` or `div.p-2`.
// Same behavior as QA archetypes; shared verifier panel DOM.
// Checklist cards: when "Raw Output" is expanded, a second copy icon copies only the <pre> body.

const COPY_BUTTON_MARKER = 'data-fleet-copy-verifier-output';
const COPY_RAW_OUTPUT_MARKER = 'data-fleet-copy-verifier-raw-output';
const RAW_OUTPUT_ROW_MARKER = 'data-fleet-copy-verifier-raw-row';

const plugin = {
    id: 'copyVerifierOutput',
    name: 'Copy Verifier Output',
    description:
        'Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text',
    _version: '1.4',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        buttonAdded: false,
        verifierTargetMissingLogged: false
    },

    onMutation(state, context) {
        const scoreRow = this.findScoreRow();
        const stdoutRow = scoreRow ? null : this.findStdoutRow();
        const anchorRow = scoreRow || stdoutRow;
        if (!anchorRow) {
            if (!state.verifierTargetMissingLogged) {
                Logger.debug('Copy Verifier Output: Stdout/Score row not found');
                state.verifierTargetMissingLogged = true;
            }
            return;
        }
        state.verifierTargetMissingLogged = false;

        let container;
        if (scoreRow) {
            container = scoreRow.closest('div.p-3') || scoreRow.closest('div.p-2');
            if (!container) {
                Logger.debug('Copy Verifier Output: Score card container not found');
                return;
            }
        } else {
            container = stdoutRow.closest('div.text-xs.w-full');
            if (!container) {
                Logger.debug('Copy Verifier Output: Stdout container not found');
                return;
            }
        }

        const copyButtonHost = scoreRow ? this.getScoreRowButtonHost(scoreRow) : anchorRow;
        if (!anchorRow.querySelector(`[${COPY_BUTTON_MARKER}="true"]`)) {
            const button = this.createCopyButton(container);
            copyButtonHost.appendChild(button);
            if (!copyButtonHost.classList.contains('flex')) {
                copyButtonHost.classList.add('flex', 'items-center', 'gap-2');
            }
            if (!state.buttonAdded) {
                state.buttonAdded = true;
                Logger.log('Copy Verifier Output: Copy button added');
            }
        }

        if (scoreRow) {
            this.syncRawOutputCopyButton(container);
        }
    },

    findRawOutputBlock(scoreContainer) {
        for (const block of scoreContainer.querySelectorAll(':scope > div.text-xs.mb-3')) {
            if (block.classList.contains('space-y-0.5')) continue;
            const hasRaw = Array.from(block.querySelectorAll('button')).some((b) =>
                (b.textContent || '').includes('Raw Output')
            );
            if (hasRaw) return block;
        }
        return null;
    },

    findRawOutputPre(block) {
        return block.querySelector(':scope > div.overflow-x-auto.bg-background.border.rounded pre');
    },

    unwrapRawOutputCopyRow(block) {
        const wrapper = block.querySelector(`:scope > [${RAW_OUTPUT_ROW_MARKER}="true"]`);
        if (!wrapper) return;
        const toggleBtn = wrapper.querySelector(`button:not([${COPY_RAW_OUTPUT_MARKER}="true"])`);
        if (toggleBtn && (toggleBtn.textContent || '').includes('Raw Output')) {
            block.insertBefore(toggleBtn, wrapper);
            if (!toggleBtn.classList.contains('mb-1')) toggleBtn.classList.add('mb-1');
        }
        wrapper.remove();
    },

    syncRawOutputCopyButton(scoreContainer) {
        const block = this.findRawOutputBlock(scoreContainer);
        if (!block) return;
        const pre = this.findRawOutputPre(block);
        if (!pre || !pre.textContent.trim()) {
            this.unwrapRawOutputCopyRow(block);
            return;
        }
        let copyBtn = block.querySelector(`[${COPY_RAW_OUTPUT_MARKER}="true"]`);
        if (copyBtn) {
            copyBtn._fleetCopyRawPre = pre;
            return;
        }
        const toggleBtn = Array.from(block.querySelectorAll('button')).find(
            (b) => (b.textContent || '').includes('Raw Output') && !b.hasAttribute(COPY_RAW_OUTPUT_MARKER)
        );
        if (!toggleBtn) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-center gap-2 mb-1';
        wrapper.setAttribute(RAW_OUTPUT_ROW_MARKER, 'true');
        toggleBtn.classList.remove('mb-1');
        toggleBtn.parentNode.insertBefore(wrapper, toggleBtn);
        wrapper.appendChild(toggleBtn);
        copyBtn = this.createRawOutputCopyButton(pre);
        wrapper.appendChild(copyBtn);
        Logger.debug('Copy Verifier Output: Raw Output copy control added');
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
        // Dispute detail: no "Report Grading Issues"; scope search to the panel that contains the verifier labels
        const stdoutCandidates = document.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-1');
        for (const el of stdoutCandidates) {
            if (el.textContent.trim() === 'Stdout') {
                const panel = el.closest('[data-panel]');
                if (panel) return panel;
            }
        }
        const scoreRowCandidates = document.querySelectorAll('div.flex.items-center.text-sm.mb-3');
        for (const el of scoreRowCandidates) {
            for (const s of el.querySelectorAll('span')) {
                if (s.textContent.trim() === 'Score:') {
                    const panel = el.closest('[data-panel]');
                    if (panel) return panel;
                }
            }
        }
        return null;
    },

    /** When the score lives in an inner flex group and timing is a sibling (`justify-between`), append the copy control there so it stays beside the score. */
    getScoreRowButtonHost(scoreRow) {
        for (const s of scoreRow.querySelectorAll('span')) {
            if (s.textContent.trim() !== 'Score:') continue;
            const p = s.parentElement;
            if (p && p !== scoreRow) return p;
            return scoreRow;
        }
        return scoreRow;
    },

    findScoreRow() {
        const gradingPanel = this.getGradingPanelRoot();
        const roots = gradingPanel ? [gradingPanel, document] : [document];
        for (const root of roots) {
            const candidates = root.querySelectorAll('div.flex.items-center.text-sm.mb-3');
            for (const el of candidates) {
                for (const s of el.querySelectorAll('span')) {
                    if (s.textContent.trim() === 'Score:') {
                        return el;
                    }
                }
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

    buildScoreVerifierMarkdown(container) {
        const list = container.querySelector('div.text-xs.mb-3.space-y-0\\.5');
        if (!list) {
            return null;
        }
        const rows = list.querySelectorAll(':scope > div.flex.items-start');
        const successes = [];
        const failures = [];
        for (const row of rows) {
            const svg = row.querySelector(':scope > svg');
            if (!svg) continue;
            const cls = svg.getAttribute('class') || '';
            const span = row.querySelector(':scope > span');
            const text = span ? String(span.textContent || '').replace(/\s+/g, ' ').trim() : '';
            if (!text) continue;
            if (cls.includes('text-emerald')) {
                successes.push(text);
            } else if (cls.includes('text-red')) {
                failures.push(text);
            }
        }
        if (successes.length === 0 && failures.length === 0) {
            return null;
        }
        const lines = ['## Verifier'];
        if (successes.length > 0) {
            lines.push('#### Successes');
            for (const t of successes) {
                lines.push(`> ✅ ${t}`);
            }
        }
        if (failures.length > 0) {
            lines.push('');
            lines.push('#### Failures');
            for (const t of failures) {
                lines.push(`> ❌ ${t}`);
            }
        }
        return lines.join('\n');
    },

    getVerifierOutputText(container) {
        const scoreMd = this.buildScoreVerifierMarkdown(container);
        if (scoreMd) {
            return scoreMd;
        }
        const pre = container.querySelector('div.overflow-x-auto.bg-background.border.rounded pre');
        if (pre && pre.textContent.trim()) {
            return pre.textContent.trim();
        }
        return null;
    },

    ensureWindowCopyCapture() {
        if (this._copyVerifierWindowCaptureInstalled) {
            return;
        }
        this._copyVerifierWindowCaptureInstalled = true;
        const win = typeof Context !== 'undefined' && Context.getPageWindow ? Context.getPageWindow() : window;
        const handler = (e) => {
            const rawBtn = e.target.closest(`[${COPY_RAW_OUTPUT_MARKER}="true"]`);
            if (rawBtn && rawBtn.getAttribute('data-fleet-plugin') === this.id) {
                const pre = rawBtn._fleetCopyRawPre;
                if (rawBtn._fleetCopyHandledAt && Date.now() - rawBtn._fleetCopyHandledAt < 150) {
                    return;
                }
                rawBtn._fleetCopyHandledAt = Date.now();
                e.stopImmediatePropagation();
                e.stopPropagation();
                e.preventDefault();
                const rawText = pre && pre.textContent.trim();
                if (!rawText) {
                    Logger.warn('Copy Verifier Output: No raw output to copy');
                    this.showVerifierCopyFailurePulse(rawBtn);
                    return;
                }
                this.copyVerifierTextWithFeedback(rawBtn, rawText, ' (raw output)');
                return;
            }

            const btn = e.target.closest(`[${COPY_BUTTON_MARKER}="true"]`);
            if (!btn || btn.getAttribute('data-fleet-plugin') !== this.id) {
                return;
            }
            const cont = btn._fleetCopyVerifierContainer;
            if (!cont) {
                return;
            }
            if (btn._fleetCopyHandledAt && Date.now() - btn._fleetCopyHandledAt < 150) {
                return;
            }
            btn._fleetCopyHandledAt = Date.now();
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.preventDefault();
            const text = this.getVerifierOutputText(cont);
            if (!text) {
                Logger.warn('Copy Verifier Output: No verifier output to copy');
                this.showVerifierCopyFailurePulse(btn);
                return;
            }
            this.copyVerifierTextWithFeedback(btn, text);
        };
        win.addEventListener('pointerdown', handler, true);
        win.addEventListener('click', handler, true);
    },

    clearVerifierCopyButtonFeedback(button) {
        if (button._fleetCopyFeedbackTimeoutId) {
            clearTimeout(button._fleetCopyFeedbackTimeoutId);
            button._fleetCopyFeedbackTimeoutId = null;
        }
        if (button._fleetCopyFailureTimeoutId) {
            clearTimeout(button._fleetCopyFailureTimeoutId);
            button._fleetCopyFailureTimeoutId = null;
        }
        button.style.transition = '';
        button.style.backgroundColor = '';
        button.style.color = '';
    },

    showVerifierCopyFailurePulse(button) {
        this.clearVerifierCopyButtonFeedback(button);
        const prevTransition = button.style.transition;
        button.style.transition = 'none';
        button.style.backgroundColor = 'rgb(239, 68, 68)';
        button.style.color = '#ffffff';
        void button.offsetHeight;
        button.style.transition = 'background-color 500ms ease-out, color 500ms ease-out';
        button.style.backgroundColor = '';
        button.style.color = '';
        button._fleetCopyFailureTimeoutId = setTimeout(() => {
            button.style.transition = prevTransition || '';
            button._fleetCopyFailureTimeoutId = null;
        }, 500);
    },

    copyVerifierTextWithFeedback(button, text, logSuffix = '') {
        const showOk = () => {
            Logger.log(`Copy Verifier Output: Copied ${text.length} chars to clipboard${logSuffix}`);
            this.clearVerifierCopyButtonFeedback(button);
            button.style.backgroundColor = 'rgb(34, 197, 94)';
            button.style.color = 'white';
            button._fleetCopyFeedbackTimeoutId = setTimeout(() => {
                button.style.backgroundColor = '';
                button.style.color = '';
                button._fleetCopyFeedbackTimeoutId = null;
            }, 1000);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(text)
                .then(showOk)
                .catch((err) => {
                    Logger.warn('Copy Verifier Output: Clipboard API failed, trying fallback', err);
                    if (this.copyVerifierTextFallback(text)) {
                        showOk();
                    } else {
                        Logger.error('Copy Verifier Output: Failed to copy to clipboard', err);
                        this.showVerifierCopyFailurePulse(button);
                    }
                });
        } else if (this.copyVerifierTextFallback(text)) {
            showOk();
        } else {
            Logger.error('Copy Verifier Output: Failed to copy to clipboard');
            this.showVerifierCopyFailurePulse(button);
        }
    },

    copyVerifierTextFallback(text) {
        try {
            const temp = document.createElement('textarea');
            temp.value = text;
            temp.style.position = 'fixed';
            temp.style.top = '-1000px';
            document.body.appendChild(temp);
            temp.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(temp);
            return ok;
        } catch (e) {
            return false;
        }
    },

    createCopyButton(container) {
        this.ensureWindowCopyCapture();

        const button = document.createElement('button');
        button.setAttribute(COPY_BUTTON_MARKER, 'true');
        button.setAttribute('data-fleet-plugin', this.id);
        button.type = 'button';
        button.className =
            'relative z-50 inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        button.setAttribute('data-state', 'closed');
        button.title = 'Copy verifier output to clipboard';
        button.setAttribute('aria-label', 'Copy verifier output to clipboard');
        button._fleetCopyVerifierContainer = container;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '12');
        svg.setAttribute('height', '12');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.className = 'fill-current h-3 w-3 text-muted-foreground pointer-events-none';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('clip-rule', 'evenodd');
        path.setAttribute('d', 'M2 5C2 3.34315 3.34315 2 5 2H12C13.6569 2 15 3.34315 15 5C15 5.55228 14.5523 6 14 6C13.4477 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4H5C4.44772 4 4 4.44772 4 5V13C4 13.5523 4.44772 14 5 14H6C6.55228 14 7 14.4477 7 15C7 15.5523 6.55228 16 6 16H5C3.34315 16 2 14.6569 2 13V5ZM9 10.8462C9 9.20041 10.42 8 12 8H19C20.58 8 22 9.20041 22 10.8462V19.1538C22 20.7996 20.58 22 19 22H12C10.42 22 9 20.7996 9 19.1538V10.8462ZM12 10C11.3708 10 11 10.4527 11 10.8462V19.1538C11 19.5473 11.3708 20 12 20H19C19.6292 20 20 19.5473 20 19.1538V10.8462C20 10.4527 19.6292 10 19 10H12Z');
        svg.appendChild(path);
        button.appendChild(svg);

        const doCopy = () => {
            if (button._fleetCopyHandledAt && Date.now() - button._fleetCopyHandledAt < 200) {
                return;
            }
            button._fleetCopyHandledAt = Date.now();
            const text = this.getVerifierOutputText(container);
            if (!text) {
                Logger.warn('Copy Verifier Output: No verifier output to copy');
                this.showVerifierCopyFailurePulse(button);
                return;
            }
            this.copyVerifierTextWithFeedback(button, text);
        };

        button.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            doCopy();
        }, true);

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            doCopy();
        }, true);

        return button;
    },

    createRawOutputCopyButton(pre) {
        this.ensureWindowCopyCapture();

        const button = document.createElement('button');
        button.setAttribute(COPY_RAW_OUTPUT_MARKER, 'true');
        button.setAttribute('data-fleet-plugin', this.id);
        button.type = 'button';
        button.className =
            'relative z-50 inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        button.setAttribute('data-state', 'closed');
        button.title = 'Copy raw verifier output to clipboard';
        button.setAttribute('aria-label', 'Copy raw verifier output to clipboard');
        button._fleetCopyRawPre = pre;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '12');
        svg.setAttribute('height', '12');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.className = 'fill-current h-3 w-3 text-muted-foreground pointer-events-none';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('clip-rule', 'evenodd');
        path.setAttribute('d', 'M2 5C2 3.34315 3.34315 2 5 2H12C13.6569 2 15 3.34315 15 5C15 5.55228 14.5523 6 14 6C13.4477 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4H5C4.44772 4 4 4.44772 4 5V13C4 13.5523 4.44772 14 5 14H6C6.55228 14 7 14.4477 7 15C7 15.5523 6.55228 16 6 16H5C3.34315 16 2 14.6569 2 13V5ZM9 10.8462C9 9.20041 10.42 8 12 8H19C20.58 8 22 9.20041 22 10.8462V19.1538C22 20.7996 20.58 22 19 22H12C10.42 22 9 20.7996 9 19.1538V10.8462ZM12 10C11.3708 10 11 10.4527 11 10.8462V19.1538C11 19.5473 11.3708 20 12 20H19C19.6292 20 20 19.5473 20 19.1538V10.8462C20 10.4527 19.6292 10 19 10H12Z');
        svg.appendChild(path);
        button.appendChild(svg);

        const doCopy = () => {
            if (button._fleetCopyHandledAt && Date.now() - button._fleetCopyHandledAt < 200) {
                return;
            }
            button._fleetCopyHandledAt = Date.now();
            const text = pre && pre.textContent.trim();
            if (!text) {
                Logger.warn('Copy Verifier Output: No raw output to copy');
                this.showVerifierCopyFailurePulse(button);
                return;
            }
            this.copyVerifierTextWithFeedback(button, text, ' (raw output)');
        };

        button.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            doCopy();
        }, true);

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            doCopy();
        }, true);

        return button;
    }
};
