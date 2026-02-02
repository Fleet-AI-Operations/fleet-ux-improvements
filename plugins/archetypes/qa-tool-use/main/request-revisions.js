// ============= request-revisions.js =============
// Improvements to the Request Revisions Workflow

const GUIDELINE_LINKS = {
    kinesis: 'https://fleetai.notion.site/Project-Kinesis-Guidelines-2d6fe5dd3fba8023aa78e345939dac3d',
    problemCreation: 'https://fleetai.notion.site/Fleet-Problem-Creation-Guidelines-215fe5dd3fba802683d1c461b6a35c8a'
};

const GUIDELINE_COPY_WRAPPER_MARKER = 'data-fleet-guideline-copy-links';

const plugin = {
    id: 'requestRevisions',
    name: 'Request Revisions Improvements',
    description: 'Improvements to the Request Revisions Workflow',
    _version: '3.8',
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
            id: 'auto-paste-verifier-to-grading',
            name: 'Auto-paste verifier output to Grading issue',
            description: 'Saves the verifier output when grading completes and automatically pastes it into the Grading issue box when Grading is selected',
            enabledByDefault: true
        },
        {
            id: 'copy-link-kinesis-guidelines',
            name: 'Copy Link to Kinesis Guidelines',
            description: 'Show a button under "Where are the issues?" that copies the Kinesis Guidelines link to the clipboard',
            enabledByDefault: true
        },
        {
            id: 'copy-link-problem-creation-guidelines',
            name: 'Copy Link to Problem Creation Guidelines',
            description: 'Show a button under "Where are the issues?" that copies the Problem Creation Guidelines link to the clipboard',
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
        gradingObservers: new Map(), // Map of modalId -> { observer, gradingButton }
        verifierWatchEligibleAt: undefined // defer body observer until this time (or once modal seen)
    },
    
    onMutation(state, context) {
        // Ensure taskObservers Map exists
        if (!state.taskObservers || !(state.taskObservers instanceof Map)) {
            state.taskObservers = new Map();
        }
        
        // Ensure gradingObservers Map exists
        if (!state.gradingObservers || !(state.gradingObservers instanceof Map)) {
            state.gradingObservers = new Map();
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
            this.cleanupGradingObservers(state);
            return;
        }
        
        // Find the Request Revisions modal by checking for the heading
        let requestRevisionsModal = null;
        for (const dialog of dialogs) {
            const heading = Context.dom.query('h2', {
                root: dialog,
                context: `${this.id}.heading`
            });
            if (heading && heading.textContent.includes('Request Revisions')) {
                requestRevisionsModal = dialog;
                break;
            }
        }
        
        if (!requestRevisionsModal) {
            if (!state.missingLogged) {
                Logger.debug('Request Revisions modal not found');
                state.missingLogged = true;
            }
            // Only run verifier watch when eligible (after delay or once modal has been seen)
            const autoPasteVerifierEnabled = Storage.getSubOptionEnabled(this.id, 'auto-paste-verifier-to-grading', true);
            if (autoPasteVerifierEnabled && state.verifierWatchEligibleAt !== undefined && Date.now() >= state.verifierWatchEligibleAt) {
                this.watchVerifierOutput(state);
            }
            return;
        }
        
        // Reset missing log once modal is found; allow verifier watch immediately when modal is open
        state.missingLogged = false;
        state.verifierWatchEligibleAt = Math.min(state.verifierWatchEligibleAt ?? Infinity, Date.now());
        
        // Watch for verifier output if feature is enabled (now eligible: modal seen or delay passed)
        const autoPasteVerifierEnabled = Storage.getSubOptionEnabled(this.id, 'auto-paste-verifier-to-grading', true);
        if (autoPasteVerifierEnabled && Date.now() >= state.verifierWatchEligibleAt) {
            this.watchVerifierOutput(state);
        }
        
        // Get modal ID to track observers
        const modalId = requestRevisionsModal.id;
        
        // Inject guideline copy-link buttons if enabled
        this.injectGuidelineCopyButtons(state, requestRevisionsModal);
        
        // Set up Task button observer if not already set up and feature is enabled
        if (autoPastePromptEnabled && state.promptText && !state.taskObservers.has(modalId)) {
            this.setupTaskButtonObserver(state, requestRevisionsModal, modalId);
        }
        
        // Set up Grading button observer if not already set up and feature is enabled
        if (autoPasteVerifierEnabled && state.verifierOutput && !state.gradingObservers.has(modalId)) {
            this.setupGradingButtonObserver(state, requestRevisionsModal, modalId);
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
        // Find the task prompt panel by stable root (id or data-panel-id), then relative navigation
        const panel = document.querySelector('[id=":re:"]') || document.querySelector('[data-panel-id=":re:"]');
        if (!panel) return;
        
        const promptElement = panel.querySelector('.text-sm.whitespace-pre-wrap');
        if (promptElement) {
            state.promptText = promptElement.textContent.trim();
            state.promptSaved = true;
            Logger.log(`✓ Prompt text saved (${state.promptText.length} chars)`);
        }
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
        // Find button with "Task" text in the issues section
        const buttons = Context.dom.queryAll('button', {
            root: modal,
            context: `${this.id}.issueButtons`
        });
        
        for (const button of buttons) {
            const buttonText = button.textContent.trim();
            if (buttonText === 'Task') {
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
        }
        return null;
    },
    
    handleTaskIssuePaste(state, modal, modalId) {
        // Find the Task feedback textarea - it only exists when Task is selected
        const taskFeedbackTextarea = Context.dom.query('textarea#feedback-Task', {
            root: modal,
            context: `${this.id}.taskFeedbackTextarea`
        });
        
        if (!taskFeedbackTextarea) {
            Logger.debug('Task feedback textarea not found yet, waiting...');
            return; // Textarea doesn't exist yet (might appear slightly after button click)
        }
        
        // Check if textarea already has content (trim to handle whitespace-only content)
        const currentValue = taskFeedbackTextarea.value ? taskFeedbackTextarea.value.trim() : '';
        if (currentValue.length > 0) {
            Logger.debug(`Task issue textarea already has content (${currentValue.length} chars), skipping paste`);
            return; // Don't overwrite existing content
        }
        
        if (!state.promptText) {
            Logger.warn('Prompt text not available for pasting');
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
        const problemCreationEnabled = Storage.getSubOptionEnabled(this.id, 'copy-link-problem-creation-guidelines', true);

        if (wrapper) {
            this.syncGuidelineCopyButtons(wrapper, kinesisEnabled, problemCreationEnabled);
            return;
        }

        wrapper = document.createElement('div');
        wrapper.setAttribute('data-fleet-plugin', this.id);
        wrapper.setAttribute(GUIDELINE_COPY_WRAPPER_MARKER, 'true');
        wrapper.className = 'flex flex-wrap gap-2 mt-2';

        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const linkClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-2 pr-2 text-xs no-underline text-foreground';

        const kinesisGroup = document.createElement('span');
        kinesisGroup.className = 'inline-flex items-center gap-1';
        kinesisGroup.setAttribute('data-guideline-group', 'kinesis');
        const kinesisBtn = document.createElement('button');
        kinesisBtn.type = 'button';
        kinesisBtn.className = buttonClass;
        kinesisBtn.setAttribute('data-fleet-plugin', this.id);
        kinesisBtn.setAttribute('data-guideline-copy', 'kinesis');
        kinesisBtn.textContent = 'Copy Link to Kinesis Guidelines';
        kinesisBtn.addEventListener('click', () => this.copyGuidelineLink(kinesisBtn, 'Copy Link to Kinesis Guidelines', GUIDELINE_LINKS.kinesis));
        kinesisGroup.appendChild(kinesisBtn);
        const kinesisOpen = document.createElement('a');
        kinesisOpen.href = GUIDELINE_LINKS.kinesis;
        kinesisOpen.target = '_blank';
        kinesisOpen.rel = 'noopener noreferrer';
        kinesisOpen.className = linkClass;
        kinesisOpen.setAttribute('data-fleet-plugin', this.id);
        kinesisOpen.textContent = 'Open';
        kinesisGroup.appendChild(kinesisOpen);
        wrapper.appendChild(kinesisGroup);

        const problemGroup = document.createElement('span');
        problemGroup.className = 'inline-flex items-center gap-1';
        problemGroup.setAttribute('data-guideline-group', 'problem-creation');
        const problemBtn = document.createElement('button');
        problemBtn.type = 'button';
        problemBtn.className = buttonClass;
        problemBtn.setAttribute('data-fleet-plugin', this.id);
        problemBtn.setAttribute('data-guideline-copy', 'problem-creation');
        problemBtn.textContent = 'Copy Link to Problem Creation Guidelines';
        problemBtn.addEventListener('click', () => this.copyGuidelineLink(problemBtn, 'Copy Link to Problem Creation Guidelines', GUIDELINE_LINKS.problemCreation));
        problemGroup.appendChild(problemBtn);
        const problemOpen = document.createElement('a');
        problemOpen.href = GUIDELINE_LINKS.problemCreation;
        problemOpen.target = '_blank';
        problemOpen.rel = 'noopener noreferrer';
        problemOpen.className = linkClass;
        problemOpen.setAttribute('data-fleet-plugin', this.id);
        problemOpen.textContent = 'Open';
        problemGroup.appendChild(problemOpen);
        wrapper.appendChild(problemGroup);

        this.syncGuidelineCopyButtons(wrapper, kinesisEnabled, problemCreationEnabled);
        buttonRow.insertAdjacentElement('afterend', wrapper);
        Logger.log('Request Revisions: guideline copy-link buttons added');
    },

    syncGuidelineCopyButtons(wrapper, kinesisEnabled, problemCreationEnabled) {
        const kinesisGroup = wrapper.querySelector('[data-guideline-group="kinesis"]');
        const problemGroup = wrapper.querySelector('[data-guideline-group="problem-creation"]');
        if (kinesisGroup) kinesisGroup.style.display = kinesisEnabled ? '' : 'none';
        if (problemGroup) problemGroup.style.display = problemCreationEnabled ? '' : 'none';
    },

    copyGuidelineLink(button, originalText, url) {
        navigator.clipboard.writeText(url).then(() => {
            button.textContent = 'Copied!';
            Logger.log(`Request Revisions: copied ${originalText} to clipboard`);
            setTimeout(() => {
                button.textContent = originalText;
            }, 2500);
        }).catch((err) => {
            Logger.error('Request Revisions: failed to copy guideline link', err);
        });
    },

    // Same search logic as copy-verifier-output.js
    findStdoutRow() {
        const candidates = document.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-1');
        for (const el of candidates) {
            if (el.textContent.trim() === 'Stdout') {
                return el;
            }
        }
        return null;
    },

    getVerifierPreFromContainer(container) {
        const pre = container.querySelector('div.overflow-x-auto.bg-background.border.rounded pre');
        return pre && pre.textContent.trim().length > 0 ? pre : null;
    },

    watchVerifierOutput(state) {
        if (state.verifierObserver) {
            return;
        }

        const tryCaptureVerifier = () => {
            const stdoutRow = this.findStdoutRow();
            if (!stdoutRow) return null;
            const container = stdoutRow.closest('div.text-xs.w-full');
            if (!container) return null;
            return this.getVerifierPreFromContainer(container);
        };

        const pre = tryCaptureVerifier();
        if (pre) {
            Logger.log('✓ Verifier container detected');
            this.saveVerifierOutput(state, pre);
            return;
        }

        const containerObserver = new MutationObserver(() => {
            const pre = tryCaptureVerifier();
            if (pre) {
                Logger.log('✓ Verifier container detected');
                containerObserver.disconnect();
                state.verifierObserver = null;
                this.saveVerifierOutput(state, pre);
            }
        });

        containerObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        state.verifierObserver = containerObserver;
    },
    
    saveVerifierOutput(state, verifierPre) {
        // Save the verifier output
        state.verifierOutput = verifierPre.textContent.trim();
        state.verifierElement = verifierPre;
        
        Logger.log(`✓ Verifier output saved (${state.verifierOutput.length} chars)`);
        
        // Set up MutationObserver to watch for changes (in case of regrading)
        const changeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    const newOutput = verifierPre.textContent.trim();
                    if (newOutput !== state.verifierOutput && newOutput.length > 0) {
                        state.verifierOutput = newOutput;
                        Logger.log(`✓ Verifier output updated (${state.verifierOutput.length} chars)`);
                    }
                }
            }
        });
        
        // Observe changes to the pre element and its children
        changeObserver.observe(verifierPre, {
            childList: true,
            subtree: true,
            characterData: true
        });
        
        // Store the change observer (we'll keep the original observer reference for cleanup)
        state.verifierChangeObserver = changeObserver;
    },
    
    setupGradingButtonObserver(state, modal, modalId) {
        // Find the Grading button
        const gradingButton = this.findGradingIssueButton(modal);
        if (!gradingButton) {
            Logger.debug('Grading button not found, will retry on next mutation');
            return;
        }
        
        // Check if already processed (button is already clicked)
        if (this.isGradingButtonSelected(gradingButton)) {
            // Button is already selected, wait a bit for textarea to appear, then paste
            setTimeout(() => {
                this.handleGradingIssuePaste(state, modal, modalId);
            }, 100);
            // Mark as having observer (even though we won't set one up) to prevent retries
            state.gradingObservers.set(modalId, { observer: null, gradingButton });
            return;
        }
        
        // Set up MutationObserver to watch for class changes on the Grading button
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (this.isGradingButtonSelected(gradingButton)) {
                        // Grading button was clicked, wait a bit for textarea to appear, then paste
                        setTimeout(() => {
                            this.handleGradingIssuePaste(state, modal, modalId);
                        }, 100);
                        // Disconnect observer after detecting click
                        observer.disconnect();
                        state.gradingObservers.delete(modalId);
                        break;
                    }
                }
            }
        });
        
        // Observe class attribute changes on the Grading button
        observer.observe(gradingButton, {
            attributes: true,
            attributeFilter: ['class']
        });
        
        // Store observer info
        state.gradingObservers.set(modalId, { observer, gradingButton });
        
        Logger.debug('Grading button observer set up');
    },
    
    isGradingButtonSelected(button) {
        // Check if button has the selected state classes
        return button.classList.contains('border-brand') || 
               button.classList.contains('bg-brand') ||
               button.querySelector('.border-brand') !== null ||
               button.querySelector('.bg-brand') !== null;
    },
    
    findGradingIssueButton(modal) {
        // Find button with "Grading" text in the issues section
        const buttons = Context.dom.queryAll('button', {
            root: modal,
            context: `${this.id}.issueButtons`
        });
        
        for (const button of buttons) {
            const buttonText = button.textContent.trim();
            if (buttonText === 'Grading') {
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
        }
        return null;
    },
    
    handleGradingIssuePaste(state, modal, modalId) {
        // Find the Grading feedback textarea - it only exists when Grading is selected
        const gradingFeedbackTextarea = Context.dom.query('textarea#feedback-Grading', {
            root: modal,
            context: `${this.id}.gradingFeedbackTextarea`
        });
        
        if (!gradingFeedbackTextarea) {
            Logger.debug('Grading feedback textarea not found yet, waiting...');
            return; // Textarea doesn't exist yet (might appear slightly after button click)
        }
        
        // Check if textarea already has content (trim to handle whitespace-only content)
        const currentValue = gradingFeedbackTextarea.value ? gradingFeedbackTextarea.value.trim() : '';
        if (currentValue.length > 0) {
            Logger.debug(`Grading issue textarea already has content (${currentValue.length} chars), skipping paste`);
            return; // Don't overwrite existing content
        }
        
        if (!state.verifierOutput) {
            Logger.warn('Verifier output not available for pasting');
            return;
        }
        
        Logger.log(`Pasting verifier output to Grading issue box (${state.verifierOutput.length} chars)`);
        
        // Apply the value using the same method that worked for workflow copy
        // No dashes around the verifier output (unlike prompt)
        this.applyTextareaValue(gradingFeedbackTextarea, state.verifierOutput);
        
        Logger.log('✓ Verifier output pasted to Grading issue box');
    },
    
    cleanupGradingObservers(state) {
        // Clean up all Grading button observers
        for (const [modalId, observerInfo] of state.gradingObservers.entries()) {
            if (observerInfo.observer) {
                observerInfo.observer.disconnect();
            }
        }
        state.gradingObservers.clear();
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
