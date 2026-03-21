// ============= request-revisions.js =============
// Improvements to the Request Revisions Workflow

const GUIDELINE_LINKS = {
    kinesis: 'https://fleetai.notion.site/Project-Kinesis-Guidelines-2d6fe5dd3fba8023aa78e345939dac3d'
};

const GUIDELINE_COPY_WRAPPER_MARKER = 'data-fleet-guideline-copy-links';
const COPY_VERIFIER_OUTPUT_MARKER = 'data-fleet-revisions-copy-verifier';
const COPY_VERIFIER_SUBOPTION_ID = 'copy-verifier-output-button';
const COPY_BUTTON_CONFIRMATION_MS = 3000;
const COPY_BUTTON_CONFIRMATION_GREEN_BG = 'rgb(34, 197, 94)';

const PROMPT_QUALITY_VALUES = ['Top 10%', 'Average', 'Bottom 10%'];
const PROMPT_QUALITY_LISTENER_MARKER = 'data-fleet-prompt-quality-listener';

const plugin = {
    id: 'requestRevisions',
    name: '"Request Revisions" Modal Improvements',
    description: 'Improvements to the Request Revisions Workflow',
    _version: '4.9',
    enabledByDefault: true,
    phase: 'mutation',
    
    // ========== SUB-OPTIONS ==========
    subOptions: [
        {
            id: 'auto-paste-prompt-to-task',
            name: 'Auto-paste prompt to Task issue',
            description: 'Saves the prompt text on page load and automatically pastes it into the Task issue box when Task is selected',
            enabledByDefault: true
        },
        {
            id: COPY_VERIFIER_SUBOPTION_ID,
            name: 'Copy Verifier Output button',
            description: 'Show a button in Request Revisions that copies verifier output to the clipboard (paste into Grading manually if needed)',
            enabledByDefault: true
        },
        {
            id: 'copy-link-kinesis-guidelines',
            name: 'Kinesis Guidelines',
            description: 'Show a button under "Where are the issues?" that opens Kinesis Guidelines in a new tab',
            enabledByDefault: true
        }
    ],
    
    initialState: {
        missingLogged: false,
        promptText: null,
        promptSaved: false,
        taskObservers: new Map(), // Map of modalId -> { observer, taskButton }
        verifierOutput: null,
        verifierObserver: null,
        verifierElement: null,
        verifierChangeObserver: null,
        verifierWatchEligibleAt: undefined, // defer body observer until this time (or once modal seen)
        promptQualityRating: null // persisted Prompt Quality Rating selection for this page instance
    },
    
    onMutation(state, context) {
        // Ensure taskObservers Map exists
        if (!state.taskObservers || !(state.taskObservers instanceof Map)) {
            state.taskObservers = new Map();
        }
        
        // Save prompt text if not already saved and the feature is enabled
        const autoPastePromptEnabled = Storage.getSubOptionEnabled(this.id, 'auto-paste-prompt-to-task', true);
        if (autoPastePromptEnabled && !state.promptSaved) {
            this.savePromptText(state);
        }
        
        // Defer starting verifier watch until after initial load (avoids second body observer during mutation storm)
        if (state.verifierWatchEligibleAt === undefined) {
            state.verifierWatchEligibleAt = Date.now() + 1500;
        }
        
        // Look for the Request Revisions modal
        const dialogs = Context.dom.queryAll('div[role="dialog"][data-state="open"]', {
            context: `${this.id}.dialogs`
        });
        
        if (dialogs.length === 0) {
            // Clean up observers when no dialogs are open
            this.cleanupTaskObservers(state);
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
        
        // Get modal ID to track observers
        const modalId = requestRevisionsModal.id;
        
        // Inject guideline open buttons if enabled
        this.injectGuidelineCopyButtons(state, requestRevisionsModal);
        
        // Persist and restore Prompt Quality Rating selection within this page instance
        this.capturePromptQualityRating(state, requestRevisionsModal);
        this.restorePromptQualityRating(state, requestRevisionsModal);
        
        // Set up Task button observer if not already set up and feature is enabled
        if (autoPastePromptEnabled && state.promptText && !state.taskObservers.has(modalId)) {
            this.setupTaskButtonObserver(state, requestRevisionsModal, modalId);
        }
    },
    
    applyTextareaValue(textarea, value) {
        // Try to find React's onChange handler and call it directly
        // This is the proper way to work with React controlled components
        const reactFiber = this.getReactFiber(textarea);
        if (reactFiber) {
            const props = reactFiber.memoizedProps || reactFiber.pendingProps;
            if (props && props.onChange) {
                // Create a synthetic event object that React expects
                const syntheticEvent = {
                    target: textarea,
                    currentTarget: textarea,
                    bubbles: true,
                    cancelable: true,
                    defaultPrevented: false,
                    eventPhase: 2, // AT_TARGET
                    isTrusted: false,
                    nativeEvent: new Event('input', { bubbles: true }),
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    timeStamp: Date.now(),
                    type: 'change'
                };
                
                // Set the value using native setter first
                const nativeValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    'value'
                )?.set;
                
                if (nativeValueSetter) {
                    nativeValueSetter.call(textarea, value);
                } else {
                    textarea.value = value;
                }
                
                // Call React's onChange handler directly
                try {
                    props.onChange(syntheticEvent);
                    Logger.debug('Called React onChange handler directly');
                    return;
                } catch (error) {
                    Logger.warn('Error calling React onChange:', error);
                    // Fall through to event dispatch method
                }
            }
        }
        
        // Fallback: Use native value setter and dispatch events
        // This should work for most React versions
        const nativeValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
        )?.set;
        
        if (nativeValueSetter) {
            nativeValueSetter.call(textarea, value);
        } else {
            textarea.value = value;
        }
        
        // Focus the textarea first (React sometimes needs this)
        textarea.focus();
        
        // Dispatch input event (React listens to this)
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        textarea.dispatchEvent(inputEvent);
        
        // Also dispatch change event
        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
        textarea.dispatchEvent(changeEvent);
        
        // Blur and refocus to ensure React processes the change
        textarea.blur();
        textarea.focus();
    },
    
    savePromptText(state) {
        // Find the task panel: prefer structure (panel containing Prompt section). Radix panel IDs like :re: are unstable.
        const panel = this.findTaskPanel();
        if (!panel) return;

        const promptElement = panel.querySelector('.text-sm.whitespace-pre-wrap');
        if (promptElement) {
            state.promptText = promptElement.textContent.trim();
            state.promptSaved = true;
            Logger.log(`✓ Prompt text saved (${state.promptText.length} chars)`);
        }
    },

    findTaskPanel() {
        // Strategy 1: find panel that contains the Prompt label and prompt content (exact "Prompt" label)
        const panels = document.querySelectorAll('[data-panel][data-panel-id]');
        for (const p of panels) {
            const hasPromptLabel = Array.from(p.querySelectorAll('span, label')).some(el => (el.textContent || '').trim() === 'Prompt');
            const promptContent = p.querySelector('.text-sm.whitespace-pre-wrap');
            if (hasPromptLabel && promptContent) return p;
        }
        // Strategy 2: flexible label (e.g. "Prompt" as substring) and content (primary or fallback class)
        for (const p of panels) {
            const hasPromptLabel = Array.from(p.querySelectorAll('span, label')).some(el => {
                const t = (el.textContent || '').trim();
                return t === 'Prompt' || (t.length > 0 && t.includes('Prompt'));
            });
            const promptContent = p.querySelector('.text-sm.whitespace-pre-wrap') || p.querySelector('[class*="whitespace-pre-wrap"]');
            if (hasPromptLabel && promptContent && promptContent.textContent.trim().length > 0) return p;
        }
        // Strategy 3: fallback to Radix ID (unstable across sessions)
        return document.querySelector('[id=":re:"]') || document.querySelector('[data-panel-id=":re:"]');
    },
    
    setupTaskButtonObserver(state, modal, modalId) {
        // Find the Task button
        const taskButton = this.findTaskIssueButton(modal);
        if (!taskButton) {
            Logger.debug('Task button not found, will retry on next mutation');
            return;
        }
        
        // Check if already processed (button is already clicked)
        if (this.isTaskButtonSelected(taskButton)) {
            // Button is already selected, wait a bit for textarea to appear, then paste
            setTimeout(() => {
                this.handleTaskIssuePaste(state, modal, modalId);
            }, 100);
            // Mark as having observer (even though we won't set one up) to prevent retries
            state.taskObservers.set(modalId, { observer: null, taskButton });
            return;
        }
        
        // Set up MutationObserver to watch for class changes on the Task button
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (this.isTaskButtonSelected(taskButton)) {
                        // Task button was clicked, wait a bit for textarea to appear, then paste
                        setTimeout(() => {
                            this.handleTaskIssuePaste(state, modal, modalId);
                        }, 100);
                        // Disconnect observer after detecting click
                        observer.disconnect();
                        state.taskObservers.delete(modalId);
                        break;
                    }
                }
            }
        });
        
        // Observe class attribute changes on the Task button
        observer.observe(taskButton, {
            attributes: true,
            attributeFilter: ['class']
        });
        
        // Store observer info
        state.taskObservers.set(modalId, { observer, taskButton });
        
        Logger.debug('Task button observer set up');
    },
    
    isTaskButtonSelected(button) {
        // Check if button has the selected state classes
        return button.classList.contains('border-brand') || 
               button.classList.contains('bg-brand') ||
               button.querySelector('.border-brand') !== null ||
               button.querySelector('.bg-brand') !== null;
    },
    
    findTaskIssueButton(modal) {
        // Find button for Task option in the issues section (label-tolerant: "Task", "Problems with Task", etc.)
        const buttons = Context.dom.queryAll('button', {
            root: modal,
            context: `${this.id}.issueButtons`
        });
        
        for (const button of buttons) {
            const buttonText = button.textContent.trim();
            // Accept exact "Task" or labels that include "Task" but are not Environment/Grading
            const isTaskOption = buttonText === 'Task' ||
                (buttonText.includes('Task') && !buttonText.includes('Environment') && !buttonText.includes('Grading'));
            if (!isTaskOption) continue;
            // Check if any ancestor contains "Where are the issues"
            // (it's in a sibling div, not the immediate parent)
            let ancestor = button.parentElement;
            while (ancestor && ancestor !== modal) {
                const ancestorText = ancestor.textContent || '';
                if (ancestorText.includes('Where are the issues')) {
                    return button;
                }
                ancestor = ancestor.parentElement;
            }
        }
        return null;
    },
    
    handleTaskIssuePaste(state, modal, modalId) {
        Logger.log('Request Revisions: handleTaskIssuePaste ran');
        // Prefer id-based selector (#feedback-Task); fallback for older markup
        let taskFeedbackTextarea = document.getElementById('feedback-Task');
        if (!taskFeedbackTextarea || !modal.contains(taskFeedbackTextarea) || taskFeedbackTextarea.tagName !== 'TEXTAREA') {
            taskFeedbackTextarea = Context.dom.query('textarea#feedback-Task', {
                root: modal,
                context: `${this.id}.taskFeedbackTextarea`
            });
        }
        
        if (!taskFeedbackTextarea) {
            Logger.log('Request Revisions: Task paste skipped — no textarea');
            return; // Textarea doesn't exist yet (might appear slightly after button click)
        }
        
        // Check if textarea already has content (trim to handle whitespace-only content)
        const currentValue = taskFeedbackTextarea.value ? taskFeedbackTextarea.value.trim() : '';
        if (currentValue.length > 0) {
            Logger.log(`Request Revisions: Task paste skipped — already has content (${currentValue.length} chars)`);
            return; // Don't overwrite existing content
        }
        
        if (!state.promptText) {
            Logger.log('Request Revisions: Task paste skipped — no promptText');
            return;
        }
        
        // Format the prompt text
        const formattedPrompt = `---\n${state.promptText}\n---`;
        
        Logger.log(`Pasting prompt text to Task issue box (${formattedPrompt.length} chars)`);
        
        // Apply the value using the same method that worked for workflow copy
        this.applyTextareaValue(taskFeedbackTextarea, formattedPrompt);
        
        Logger.log('✓ Prompt text pasted to Task issue box');
    },
    
    cleanupTaskObservers(state) {
        // Clean up all Task button observers
        for (const [modalId, observerInfo] of state.taskObservers.entries()) {
            if (observerInfo.observer) {
                observerInfo.observer.disconnect();
            }
        }
        state.taskObservers.clear();
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
        const kinesisEnabled = Storage.getSubOptionEnabled(this.id, 'copy-link-kinesis-guidelines', true);

        if (wrapper) {
            this.syncGuidelineCopyButtons(state, wrapper, kinesisEnabled);
            return;
        }

        wrapper = document.createElement('div');
        wrapper.setAttribute('data-fleet-plugin', this.id);
        wrapper.setAttribute(GUIDELINE_COPY_WRAPPER_MARKER, 'true');
        wrapper.className = 'flex flex-wrap gap-2 mt-2';

        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';

        const kinesisBtn = this.createGuidelineOpenButton(
            buttonClass,
            'kinesis',
            GUIDELINE_LINKS.kinesis,
            'Kinesis Guidelines'
        );
        wrapper.appendChild(kinesisBtn);

        this.syncGuidelineCopyButtons(state, wrapper, kinesisEnabled);
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

    syncGuidelineCopyButtons(state, wrapper, kinesisEnabled) {
        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        this.migrateLegacyGuidelineOpenControl(wrapper, 'kinesis', GUIDELINE_LINKS.kinesis, 'Kinesis Guidelines', buttonClass);

        const kinesisGroup = wrapper.querySelector('[data-guideline-group="kinesis"]');
        if (kinesisGroup) kinesisGroup.style.display = kinesisEnabled ? '' : 'none';

        const copyVerifierEnabled = Storage.getSubOptionEnabled(this.id, COPY_VERIFIER_SUBOPTION_ID, true);
        this.syncCopyVerifierOutputButton(state, wrapper, copyVerifierEnabled, buttonClass);
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
                wrapper.appendChild(btn);
                Logger.debug('Request Revisions: Copy Verifier Output button added');
            }
            btn.style.display = '';
        } else if (btn) {
            btn.style.display = 'none';
        }
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

    showCopyButtonConfirmation(button, originalText) {
        button.textContent = 'Copied!';
        button.style.backgroundColor = COPY_BUTTON_CONFIRMATION_GREEN_BG;
        button.style.color = 'white';
        if (button._fleetCopyConfirmTimeout) clearTimeout(button._fleetCopyConfirmTimeout);
        button._fleetCopyConfirmTimeout = setTimeout(() => {
            button.textContent = originalText;
            button.style.backgroundColor = '';
            button.style.color = '';
            button._fleetCopyConfirmTimeout = null;
        }, COPY_BUTTON_CONFIRMATION_MS);
    },

    handleCopyVerifierOutputClick(state, button) {
        const originalText = 'Copy Verifier Output';
        const text = this.getVerifierTextForClipboard(state);
        if (!text) {
            Logger.warn('Request Revisions: No verifier output to copy');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            Logger.log(`Request Revisions: Copied verifier output to clipboard (${text.length} chars)`);
            this.showCopyButtonConfirmation(button, originalText);
        }).catch((err) => {
            Logger.error('Request Revisions: Failed to copy verifier output', err);
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

    // Same search logic as copy-verifier-output.js
    findScoreRow() {
        const candidates = document.querySelectorAll('div.text-sm.flex.items-center.gap-2.mb-3');
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
            const text = span ? span.textContent.trim() : '';
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
            const container = scoreRow.closest('div.p-3');
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
    },
    
    getReactFiber(element) {
        // Try different React internal property names
        // React 16+: __reactInternalInstance or __reactFiber
        // React 17+: __reactFiber$<random>
        // React 18+: __reactFiber$<random> or __reactInternalInstance$<random>
        const keys = Object.keys(element);
        for (const key of keys) {
            if (key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')) {
                return element[key];
            }
        }
        
        // Also check for React 18's alternate fiber
        for (const key of keys) {
            if (key.includes('reactFiber') || key.includes('reactInternalInstance')) {
                const fiber = element[key];
                if (fiber && (fiber.memoizedProps || fiber.pendingProps)) {
                    return fiber;
                }
            }
        }
        
        return null;
    }
};
