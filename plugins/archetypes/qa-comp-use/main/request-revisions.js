// ============= request-revisions.js =============
// Improvements to the Request Revisions Workflow (qa-comp-use)

const GUIDELINE_LINKS = {
    qaGuidelines: 'https://fleetai.notion.site/QA-Guidelines-2f5fe5dd3fba80daa9b8f63a6ba85c56',
    meridian: 'https://fleetai.notion.site/Project-Meridian-Guidelines-2eafe5dd3fba80079b86de5dce865477'
};

const GUIDELINE_COPY_WRAPPER_MARKER = 'data-fleet-guideline-copy-links';
const COPY_PROMPT_MARKER = 'data-fleet-revisions-copy-prompt';
const COPY_PROMPT_SUBOPTION_ID = 'copy-prompt-button';
const COPY_VERIFIER_OUTPUT_MARKER = 'data-fleet-revisions-copy-verifier';
const COPY_VERIFIER_SUBOPTION_ID = 'copy-verifier-output-button';
const COPY_SUCCESS_FLASH_MS = 1000;
const COPY_SUCCESS_GREEN_BG = 'rgb(34, 197, 94)';
const COPY_FAILURE_PULSE_MS = 500;
const COPY_FAILURE_RED_BG = 'rgb(239, 68, 68)';

const PROMPT_QUALITY_VALUES = ['Top 10%', 'Average', 'Bottom 10%'];
const PROMPT_QUALITY_LISTENER_MARKER = 'data-fleet-prompt-quality-listener';

const plugin = {
    id: 'requestRevisions',
    name: 'Request Revisions Improvements',
    description: 'Improvements to the Request Revisions Workflow',
    _version: '4.3',
    enabledByDefault: false,
    phase: 'mutation',
    
    // ========== SUB-OPTIONS ==========
    subOptions: [
        {
            id: COPY_PROMPT_SUBOPTION_ID,
            name: 'Copy Prompt button',
            description: 'Show a button in Request Revisions that copies the task prompt to the clipboard (paste into Task feedback manually if needed)',
            enabledByDefault: true
        },
        {
            id: COPY_VERIFIER_SUBOPTION_ID,
            name: 'Copy Verifier Output button',
            description: 'Show a button in Request Revisions that copies verifier output to the clipboard (paste into Grading manually if needed)',
            enabledByDefault: true
        },
        {
            id: 'copy-link-qa-guidelines',
            name: 'QA Guidelines',
            description: 'Show a button under "Where are the issues?" that opens QA Guidelines in a new tab',
            enabledByDefault: true
        },
        {
            id: 'copy-link-meridian-guidelines',
            name: 'Meridian Guidelines',
            description: 'Show a button under "Where are the issues?" that opens Meridian Guidelines in a new tab',
            enabledByDefault: true
        }
    ],
    
    initialState: {
        missingLogged: false,
        promptText: null, // last-known prompt (optional cache for copy fallback)
        verifierOutput: null,
        verifierObserver: null,
        verifierElement: null,
        verifierChangeObserver: null,
        verifierWatchEligibleAt: undefined, // defer body observer until this time (or once modal seen)
        promptQualityRating: null // persisted Prompt Quality Rating selection for this page instance
    },
    
    onMutation(state, context) {
        // Defer starting verifier watch until after initial load (avoids second body observer during mutation storm)
        if (state.verifierWatchEligibleAt === undefined) {
            state.verifierWatchEligibleAt = Date.now() + 1500;
        }
        
        // Look for the Request Revisions modal
        const dialogs = Context.dom.queryAll('div[role="dialog"][data-state="open"]', {
            context: `${this.id}.dialogs`
        });
        
        if (dialogs.length === 0) {
            return;
        }
        
        // Find the Request Revisions modal: heading "Request Revisions"; prefer dialog that contains #feedback-Task / #feedback-Environment
        let requestRevisionsModal = null;
        for (const dialog of dialogs) {
            const heading = Context.dom.query('h2', {
                root: dialog,
                context: `${this.id}.heading`
            });
            if (!heading || !heading.textContent.includes('Request Revisions')) continue;
            const hasFeedbackId = dialog.querySelector('#feedback-Task, #feedback-Environment, [id^="feedback-"]');
            if (hasFeedbackId) {
                requestRevisionsModal = dialog;
                break;
            }
        }
        if (!requestRevisionsModal) {
            for (const dialog of dialogs) {
                const heading = Context.dom.query('h2', { root: dialog, context: `${this.id}.heading` });
                if (heading && heading.textContent.includes('Request Revisions')) {
                    requestRevisionsModal = dialog;
                    break;
                }
            }
        }

        if (!requestRevisionsModal) {
            if (!state.missingLogged) {
                Logger.debug('Request Revisions modal not found');
                state.missingLogged = true;
            }
            // Capture verifier output for copy button when eligible (after delay or once modal has been seen)
            const copyVerifierEnabled = Storage.getSubOptionEnabled(this.id, COPY_VERIFIER_SUBOPTION_ID, true);
            if (copyVerifierEnabled && state.verifierWatchEligibleAt !== undefined && Date.now() >= state.verifierWatchEligibleAt) {
                this.watchVerifierOutput(state);
            }
            return;
        }
        
        // Reset missing log once modal is found; allow verifier watch immediately when modal is open
        state.missingLogged = false;
        state.verifierWatchEligibleAt = Math.min(state.verifierWatchEligibleAt ?? Infinity, Date.now());
        
        // Watch for verifier output when copy button is enabled (now eligible: modal seen or delay passed)
        const copyVerifierEnabled = Storage.getSubOptionEnabled(this.id, COPY_VERIFIER_SUBOPTION_ID, true);
        if (copyVerifierEnabled && Date.now() >= state.verifierWatchEligibleAt) {
            this.watchVerifierOutput(state);
        }
        
        // Inject guideline open buttons if enabled
        this.injectGuidelineCopyButtons(state, requestRevisionsModal);
        
        // Persist and restore Prompt Quality Rating selection within this page instance
        this.capturePromptQualityRating(state, requestRevisionsModal);
        this.restorePromptQualityRating(state, requestRevisionsModal);
    },
    
    // Same search logic as copy-prompt.js (qa-comp-use)
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

    getPromptTextFromSection(promptSection) {
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

    findWhereAreTheIssuesButtonRow(modal) {
        const labels = modal.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-3');
        for (const label of labels) {
            if (label.textContent && label.textContent.includes('Where are the issues')) {
                const buttonRow = label.nextElementSibling;
                if (buttonRow && buttonRow.classList.contains('flex') && buttonRow.classList.contains('gap-3')) {
                    return buttonRow;
                }
                return null;
            }
        }
        return null;
    },

    injectGuidelineCopyButtons(state, modal) {
        const buttonRow = this.findWhereAreTheIssuesButtonRow(modal);
        if (!buttonRow) return;

        let wrapper = modal.querySelector(`[${GUIDELINE_COPY_WRAPPER_MARKER}="true"]`);
        const qaGuidelinesEnabled = Storage.getSubOptionEnabled(this.id, 'copy-link-qa-guidelines', true);
        const meridianEnabled = Storage.getSubOptionEnabled(this.id, 'copy-link-meridian-guidelines', true);

        if (wrapper) {
            this.syncGuidelineCopyButtons(state, wrapper, meridianEnabled, qaGuidelinesEnabled);
            return;
        }

        wrapper = document.createElement('div');
        wrapper.setAttribute('data-fleet-plugin', this.id);
        wrapper.setAttribute(GUIDELINE_COPY_WRAPPER_MARKER, 'true');
        wrapper.className = 'flex flex-wrap gap-2 mt-2';

        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';

        const qaBtn = this.createGuidelineOpenButton(
            buttonClass,
            'qa-guidelines',
            GUIDELINE_LINKS.qaGuidelines,
            'QA Guidelines'
        );
        wrapper.appendChild(qaBtn);

        const meridianBtn = this.createGuidelineOpenButton(
            buttonClass,
            'meridian',
            GUIDELINE_LINKS.meridian,
            'Meridian Guidelines'
        );
        wrapper.appendChild(meridianBtn);

        // Only add Copy Result Params button if the target grid exists
        if (this.hasResultParamsGrid()) {
            const copyResultParamsBtn = document.createElement('button');
            copyResultParamsBtn.type = 'button';
            copyResultParamsBtn.className = buttonClass;
            copyResultParamsBtn.setAttribute('data-fleet-plugin', this.id);
            copyResultParamsBtn.textContent = 'Copy Result Params and Inputs';
            copyResultParamsBtn.title = 'Copy parameter labels and values to clipboard';
            copyResultParamsBtn.addEventListener('click', () => this.handleCopyResultParamsClick(copyResultParamsBtn));
            wrapper.appendChild(copyResultParamsBtn);
        }

        this.syncGuidelineCopyButtons(state, wrapper, meridianEnabled, qaGuidelinesEnabled);
        buttonRow.insertAdjacentElement('afterend', wrapper);
        Logger.log('Request Revisions: guideline buttons added');
    },

    createGuidelineOpenButton(buttonClass, groupId, url, shortTitle) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = buttonClass;
        btn.setAttribute('data-fleet-plugin', this.id);
        btn.setAttribute('data-guideline-group', groupId);
        btn.textContent = shortTitle;
        btn.title = `Open ${shortTitle} in a new tab`;
        btn.addEventListener('click', () => {
            window.open(url, '_blank');
            Logger.log(`Request Revisions: opened ${shortTitle}`);
        });
        return btn;
    },

    migrateLegacyGuidelineOpenControl(wrapper, groupId, url, shortTitle, buttonClass) {
        const el = wrapper.querySelector(`[data-guideline-group="${groupId}"]`);
        if (!el) return;
        const isLegacy = el.tagName === 'SPAN' && el.querySelector('a');
        if (!isLegacy) return;
        const btn = this.createGuidelineOpenButton(buttonClass, groupId, url, shortTitle);
        el.replaceWith(btn);
        Logger.debug(`Request Revisions: migrated legacy ${shortTitle} control to open-only button`);
    },

    syncGuidelineCopyButtons(state, wrapper, meridianEnabled, qaGuidelinesEnabled) {
        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        this.migrateLegacyGuidelineOpenControl(wrapper, 'qa-guidelines', GUIDELINE_LINKS.qaGuidelines, 'QA Guidelines', buttonClass);
        this.migrateLegacyGuidelineOpenControl(wrapper, 'meridian', GUIDELINE_LINKS.meridian, 'Meridian Guidelines', buttonClass);

        let qaGroup = wrapper.querySelector('[data-guideline-group="qa-guidelines"]');
        if (!qaGroup) {
            qaGroup = this.createGuidelineOpenButton(
                buttonClass,
                'qa-guidelines',
                GUIDELINE_LINKS.qaGuidelines,
                'QA Guidelines'
            );
            const meridianEl = wrapper.querySelector('[data-guideline-group="meridian"]');
            if (meridianEl) {
                wrapper.insertBefore(qaGroup, meridianEl);
            } else {
                wrapper.insertBefore(qaGroup, wrapper.firstChild);
            }
        }
        qaGroup.style.display = qaGuidelinesEnabled ? '' : 'none';

        const meridianGroup = wrapper.querySelector('[data-guideline-group="meridian"]');
        if (meridianGroup) meridianGroup.style.display = meridianEnabled ? '' : 'none';

        const copyVerifierEnabled = Storage.getSubOptionEnabled(this.id, COPY_VERIFIER_SUBOPTION_ID, true);
        this.syncCopyVerifierOutputButton(state, wrapper, copyVerifierEnabled, buttonClass);
        const copyPromptEnabled = Storage.getSubOptionEnabled(this.id, COPY_PROMPT_SUBOPTION_ID, true);
        this.syncCopyPromptButton(state, wrapper, copyPromptEnabled, buttonClass);
        
        // Handle Copy Result Params button visibility based on whether the grid exists
        const hasGrid = this.hasResultParamsGrid();
        const copyResultParamsBtn = Array.from(wrapper.querySelectorAll('button[data-fleet-plugin="requestRevisions"]'))
            .find(btn => btn.textContent === 'Copy Result Params and Inputs');
        
        if (hasGrid) {
            // Grid exists - ensure button is visible or create it if missing
            if (copyResultParamsBtn) {
                copyResultParamsBtn.style.display = '';
            } else {
                // Button doesn't exist but grid does - create it
                const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
                const newBtn = document.createElement('button');
                newBtn.type = 'button';
                newBtn.className = buttonClass;
                newBtn.setAttribute('data-fleet-plugin', this.id);
                newBtn.textContent = 'Copy Result Params and Inputs';
                newBtn.title = 'Copy parameter labels and values to clipboard';
                newBtn.addEventListener('click', () => this.handleCopyResultParamsClick(newBtn));
                wrapper.appendChild(newBtn);
                Logger.debug('Request Revisions: Copy Result Params button created dynamically');
            }
        } else {
            // Grid doesn't exist - hide button if it exists
            if (copyResultParamsBtn) {
                copyResultParamsBtn.style.display = 'none';
            }
        }
    },

    syncCopyVerifierOutputButton(state, wrapper, copyVerifierEnabled, buttonClass) {
        let btn = wrapper.querySelector(`[${COPY_VERIFIER_OUTPUT_MARKER}="true"]`);
        if (copyVerifierEnabled) {
            if (!btn) {
                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = buttonClass;
                btn.setAttribute('data-fleet-plugin', this.id);
                btn.setAttribute(COPY_VERIFIER_OUTPUT_MARKER, 'true');
                btn.textContent = 'Copy Verifier Output';
                btn.title = 'Copy verifier output to clipboard';
                btn.addEventListener('click', () => this.handleCopyVerifierOutputClick(state, btn));
                wrapper.insertBefore(btn, wrapper.firstChild);
                Logger.debug('Request Revisions: Copy Verifier Output button added');
            }
            btn.style.display = '';
        } else if (btn) {
            btn.style.display = 'none';
        }
    },

    syncCopyPromptButton(state, wrapper, copyPromptEnabled, buttonClass) {
        let btn = wrapper.querySelector(`[${COPY_PROMPT_MARKER}="true"]`);
        if (copyPromptEnabled) {
            if (!btn) {
                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = buttonClass;
                btn.setAttribute('data-fleet-plugin', this.id);
                btn.setAttribute(COPY_PROMPT_MARKER, 'true');
                btn.textContent = 'Copy Prompt';
                btn.title = 'Copy task prompt to clipboard';
                btn.addEventListener('click', () => this.handleCopyPromptClick(state, btn));
                wrapper.insertBefore(btn, wrapper.firstChild);
                Logger.debug('Request Revisions: Copy Prompt button added');
            }
            btn.style.display = '';
        } else if (btn) {
            btn.style.display = 'none';
        }
    },

    getPromptTextForClipboard(state) {
        const section = this.findPromptSection();
        if (section) {
            const text = this.getPromptTextFromSection(section);
            if (text) {
                state.promptText = text;
                return text;
            }
        }
        return (state.promptText && String(state.promptText).trim()) || '';
    },

    handleCopyPromptClick(state, button) {
        const text = this.getPromptTextForClipboard(state);
        if (!text) {
            Logger.warn('Request Revisions: No prompt text to copy');
            this.showCopyFailurePulse(button);
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            Logger.log(`Request Revisions: Copied prompt to clipboard (${text.length} chars)`);
            this.showCopySuccessFlash(button);
        }).catch((err) => {
            Logger.error('Request Revisions: Failed to copy prompt', err);
            this.showCopyFailurePulse(button);
        });
    },

    getVerifierTextForClipboard(state) {
        const fresh = this.tryCaptureVerifierOutput();
        if (fresh) {
            const text = fresh.kind === 'pre'
                ? fresh.node.textContent.trim()
                : (this.buildScoreVerifierMarkdown(fresh.node) || '').trim();
            if (text) return text;
        }
        return (state.verifierOutput && String(state.verifierOutput).trim()) || '';
    },

    handleCopyVerifierOutputClick(state, button) {
        const text = this.getVerifierTextForClipboard(state);
        if (!text) {
            Logger.warn('Request Revisions: No verifier output to copy');
            this.showCopyFailurePulse(button);
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            Logger.log(`Request Revisions: Copied verifier output to clipboard (${text.length} chars)`);
            this.showCopySuccessFlash(button);
        }).catch((err) => {
            Logger.error('Request Revisions: Failed to copy verifier output', err);
            this.showCopyFailurePulse(button);
        });
    },

    findYourAnswerSection(root = document) {
        const headings = root.querySelectorAll('h4');
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

    hasResultParamsGrid() {
        const section = this.findYourAnswerSection();
        if (!section) return false;
        const grid = section.querySelector('.grid.grid-cols-1.gap-4') || section.querySelector('.grid');
        if (!grid) return false;
        const rows = grid.querySelectorAll('.space-y-2');
        for (const row of rows) {
            const label = row.querySelector('label');
            const input = row.querySelector('input, textarea');
            if (label && input) return true;
        }
        return false;
    },

    getResultParamsTextFromPage() {
        const section = this.findYourAnswerSection();
        if (!section) return '';
        const grid = section.querySelector('.grid.grid-cols-1.gap-4') || section.querySelector('.grid');
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

    clearRequestRevisionsCopyButtonFeedback(button) {
        if (button._copySuccessFlashTimeout) {
            clearTimeout(button._copySuccessFlashTimeout);
            button._copySuccessFlashTimeout = null;
        }
        if (button._copyFailurePulseTimeout) {
            clearTimeout(button._copyFailurePulseTimeout);
            button._copyFailurePulseTimeout = null;
        }
        button.style.transition = '';
        button.style.backgroundColor = '';
        button.style.color = '';
    },

    showCopySuccessFlash(button) {
        this.clearRequestRevisionsCopyButtonFeedback(button);
        button.style.backgroundColor = COPY_SUCCESS_GREEN_BG;
        button.style.color = '#ffffff';
        button._copySuccessFlashTimeout = setTimeout(() => {
            button.style.backgroundColor = '';
            button.style.color = '';
            button._copySuccessFlashTimeout = null;
        }, COPY_SUCCESS_FLASH_MS);
    },

    showCopyFailurePulse(button) {
        this.clearRequestRevisionsCopyButtonFeedback(button);
        const prevTransition = button.style.transition;
        button.style.transition = 'none';
        button.style.backgroundColor = COPY_FAILURE_RED_BG;
        button.style.color = '#ffffff';
        void button.offsetHeight;
        button.style.transition = `background-color ${COPY_FAILURE_PULSE_MS}ms ease-out, color ${COPY_FAILURE_PULSE_MS}ms ease-out`;
        button.style.backgroundColor = '';
        button.style.color = '';
        button._copyFailurePulseTimeout = setTimeout(() => {
            button.style.transition = prevTransition || '';
            button._copyFailurePulseTimeout = null;
        }, COPY_FAILURE_PULSE_MS);
    },

    handleCopyResultParamsClick(button) {
        const text = this.getResultParamsTextFromPage();
        if (!text) {
            Logger.warn('Request Revisions: No result params to copy');
            this.showCopyFailurePulse(button);
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            Logger.log(`Request Revisions: Copied result params to clipboard (${text.length} chars)`);
            this.showCopySuccessFlash(button);
        }).catch((err) => {
            Logger.error('Request Revisions: Failed to copy result params', err);
            this.showCopyFailurePulse(button);
        });
    },

    findPromptQualityRatingSection(modal) {
        const labels = modal.querySelectorAll('label');
        for (const label of labels) {
            if (label.textContent && label.textContent.includes('Prompt Quality Rating')) {
                const container = label.closest('div.flex.flex-col.gap-2') || label.parentElement;
                if (container) {
                    const buttonGroup = container.querySelector('div.flex.gap-2');
                    if (buttonGroup) return { container, buttonGroup };
                }
                break;
            }
        }
        return null;
    },

    getRatingButtons(buttonGroup) {
        const buttons = buttonGroup.querySelectorAll('button');
        const result = {};
        for (const btn of buttons) {
            const text = btn.textContent.trim();
            if (PROMPT_QUALITY_VALUES.includes(text)) result[text] = btn;
        }
        return result;
    },

    isRatingButtonSelected(button) {
        return button.classList.contains('border-brand') ||
               button.classList.contains('bg-brand') ||
               button.classList.contains('bg-brand/5') ||
               button.classList.contains('bg-gray-50') ||
               (button.getAttribute('class') || '').includes('dark:bg-gray-800');
    },

    capturePromptQualityRating(state, modal) {
        const section = this.findPromptQualityRatingSection(modal);
        if (!section || section.buttonGroup.getAttribute(PROMPT_QUALITY_LISTENER_MARKER) === 'true') return;
        section.buttonGroup.setAttribute(PROMPT_QUALITY_LISTENER_MARKER, 'true');
        section.buttonGroup.setAttribute('data-fleet-plugin', this.id);
        section.buttonGroup.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            const text = button.textContent.trim();
            if (PROMPT_QUALITY_VALUES.includes(text)) {
                state.promptQualityRating = text;
                Logger.debug(`Request Revisions: prompt quality rating set to "${text}"`);
            }
        });
    },

    restorePromptQualityRating(state, modal) {
        if (!state.promptQualityRating || !PROMPT_QUALITY_VALUES.includes(state.promptQualityRating)) return;
        const section = this.findPromptQualityRatingSection(modal);
        if (!section) return;
        const buttons = this.getRatingButtons(section.buttonGroup);
        const targetButton = buttons[state.promptQualityRating];
        if (!targetButton || this.isRatingButtonSelected(targetButton)) return;
        targetButton.click();
        Logger.debug(`Request Revisions: restored prompt quality rating to "${state.promptQualityRating}"`);
    },

    // Same search logic as copy-verifier-output.js (qa-comp-use)
    findScoreRow() {
        const candidates = document.querySelectorAll('div.flex.items-center.text-sm.mb-3');
        for (const el of candidates) {
            for (const s of el.querySelectorAll('span')) {
                if (s.textContent.trim() === 'Score:') {
                    return el;
                }
            }
        }
        return null;
    },

    findStdoutRow() {
        const candidates = document.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-1');
        for (const el of candidates) {
            if (el.textContent.trim() === 'Stdout') {
                return el;
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

    getVerifierPreFromContainer(container) {
        const pre = container.querySelector('div.overflow-x-auto.bg-background.border.rounded pre');
        return pre && pre.textContent.trim().length > 0 ? pre : null;
    },

    tryCaptureVerifierOutput() {
        const scoreRow = this.findScoreRow();
        if (scoreRow) {
            const container = scoreRow.closest('div.p-3') || scoreRow.closest('div.p-2');
            if (container) {
                const md = this.buildScoreVerifierMarkdown(container);
                if (md && md.length > 0) {
                    return { kind: 'score', node: container };
                }
            }
        }
        const stdoutRow = this.findStdoutRow();
        if (!stdoutRow) return null;
        const container = stdoutRow.closest('div.text-xs.w-full');
        if (!container) return null;
        const pre = this.getVerifierPreFromContainer(container);
        return pre ? { kind: 'pre', node: pre } : null;
    },

    watchVerifierOutput(state) {
        if (state.verifierObserver) {
            return;
        }

        const tryCaptureVerifier = () => this.tryCaptureVerifierOutput();

        const captured = tryCaptureVerifier();
        if (captured) {
            Logger.log('✓ Verifier container detected');
            this.saveVerifierOutput(state, captured);
            return;
        }

        const containerObserver = new MutationObserver(() => {
            const next = tryCaptureVerifier();
            if (next) {
                Logger.log('✓ Verifier container detected');
                containerObserver.disconnect();
                state.verifierObserver = null;
                this.saveVerifierOutput(state, next);
            }
        });

        containerObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        state.verifierObserver = containerObserver;
    },

    saveVerifierOutput(state, capture) {
        const getText = () => {
            if (capture.kind === 'pre') {
                return capture.node.textContent.trim();
            }
            return this.buildScoreVerifierMarkdown(capture.node) || '';
        };

        state.verifierOutput = getText();
        state.verifierElement = capture.node;

        Logger.log(`✓ Verifier output saved (${state.verifierOutput.length} chars)`);

        const changeObserver = new MutationObserver(() => {
            const newOutput = getText();
            if (newOutput !== state.verifierOutput && newOutput.length > 0) {
                state.verifierOutput = newOutput;
                Logger.log(`✓ Verifier output updated (${state.verifierOutput.length} chars)`);
            }
        });

        changeObserver.observe(capture.node, {
            childList: true,
            subtree: true,
            characterData: true
        });

        state.verifierChangeObserver = changeObserver;
    }
};
