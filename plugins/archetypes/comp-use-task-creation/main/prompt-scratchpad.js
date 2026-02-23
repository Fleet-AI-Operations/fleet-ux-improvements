// ============= prompt-scratchpad.js =============
// Adds an adjustable height scratchpad after the prompt section, with an option
// to remember contents across page loads (toggled via submodule + checkbox).

const plugin = {
    id: 'compUsePromptScratchpad',
    name: 'Scratchpad',
    description: 'Adds an adjustable height scratchpad to the page',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'mutation',

    // ========== SUB-OPTIONS ==========
    subOptions: [
        {
            id: 'remember-contents',
            name: 'Remember Scratchpad Contents',
            description: 'Saves and restores scratchpad text across page loads',
            enabledByDefault: true
        }
    ],

    storageKeys: {
        scratchpadHeight: 'comp-use-creation-scratchpad-height',
        scratchpadText: 'comp-use-creation-scratchpad-text'
    },

    selectors: {
        promptSection: 'div.flex.flex-col.gap-2:has(span:contains("Prompt"), label:contains("Prompt"))'
    },

    initialState: {
        scratchpadInserted: false,
        resizeHandlerAttached: false,
        searchAttempted: false,
        insertionFailedLogged: false,
        saveTimeoutId: null
    },

    onMutation(state, context) {
        // Find the prompt section
        const promptSection = this.findPromptSection();
        if (!promptSection) {
            if (!state.searchAttempted) {
                state.searchAttempted = true;
                // Log detailed diagnostic information only once
                const candidates = Context.dom.queryAll('div', {
                    context: `${this.id}.diagnostic`
                });
                const foundLabels = [];
                candidates.forEach(candidate => {
                    const label = candidate.querySelector('label, span.text-sm');
                    if (label) {
                        foundLabels.push(label.textContent.trim());
                    }
                });
                Logger.warn(
                    `Comp Use Prompt Scratchpad: Prompt section not found. Found ${candidates.length} candidate divs with labels/spans: ${foundLabels.join(', ') || 'none'}`
                );
            }
            return;
        }

        // Check if scratchpad already exists
        let scratchpadContainer = promptSection.nextElementSibling;
        if (scratchpadContainer && scratchpadContainer.dataset.compUsePromptScratchpad === 'true') {
            // Scratchpad already exists, just attach resize handler if needed
            if (!state.resizeHandlerAttached) {
                this.attachResizeHandler(state, scratchpadContainer);
                state.resizeHandlerAttached = true;
                Logger.log('✓ Comp Use Prompt Scratchpad: Resize handler attached');
            }
            return;
        }

        // Insert scratchpad right after the prompt section
        const scratchpad = this.createScratchpad(state);
        promptSection.insertAdjacentElement('afterend', scratchpad);
        state.scratchpadInserted = true;
        state.insertionFailedLogged = false; // Reset on success
        Logger.log('✓ Comp Use Prompt Scratchpad: Successfully inserted after Prompt section');

        // Attach resize handler
        scratchpadContainer = promptSection.nextElementSibling;
        if (scratchpadContainer && scratchpadContainer.dataset.compUsePromptScratchpad === 'true') {
            this.attachResizeHandler(state, scratchpadContainer);
            state.resizeHandlerAttached = true;
            Logger.log('✓ Comp Use Prompt Scratchpad: Resize handler attached');
        } else {
            Logger.warn('Comp Use Prompt Scratchpad: Inserted but could not find container for resize handler');
        }
    },

    findPromptSection() {
        // Primary (most stable): the prompt textarea on this page has a fixed id.
        const promptTextarea = document.querySelector('textarea#prompt-editor');
        if (promptTextarea) {
            // The DOM is nested like:
            // (space-y-2) -> (space-y-2 relative) -> ... -> textarea#prompt-editor
            // We want the outer section wrapper so the scratchpad lands after the whole Prompt block.
            const inner = promptTextarea.closest('div.space-y-2.relative');
            const outer = inner?.parentElement;
            if (outer && outer.classList && outer.classList.contains('space-y-2')) {
                return outer;
            }
            return inner || promptTextarea.closest('div.space-y-2') || promptTextarea.parentElement;
        }

        // Fallback: find the "Prompt" label and climb to an appropriate section wrapper.
        const labelCandidates = Context.dom.queryAll('div.text-sm.text-muted-foreground.font-medium', {
            context: `${this.id}.findPromptSection.labelCandidates`
        });

        for (const labelEl of labelCandidates) {
            const text = (labelEl.textContent || '').trim();
            if (!text.startsWith('Prompt')) continue;

            const section = labelEl.closest('div.space-y-2');
            if (!section) continue;

            // Prefer the wrapper that actually contains the prompt textarea.
            if (section.querySelector('textarea#prompt-editor')) {
                return section;
            }
        }

        return null;
    },

    createScratchpad(state) {
        const container = document.createElement('div');
        container.className = 'flex flex-col gap-2';
        container.dataset.compUsePromptScratchpad = 'true';

        // Header with label and "remember contents" checkbox (mirrors QA Scratchpad UX)
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between';

        const label = document.createElement('span');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Scratchpad';

        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'flex items-center gap-2';

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'text-xs text-muted-foreground cursor-pointer flex items-center gap-1.5';

        const toggleCheckbox = document.createElement('input');
        toggleCheckbox.type = 'checkbox';
        toggleCheckbox.className = 'size-3.5 rounded border-gray-300';
        toggleCheckbox.checked = Storage.getSubOptionEnabled(this.id, 'remember-contents', true);
        toggleCheckbox.addEventListener('change', (e) => {
            const checked = e.target.checked;
            Storage.setSubOptionEnabled(this.id, 'remember-contents', checked);
            Logger.debug(`Comp Use Prompt Scratchpad: Remember contents setting changed to ${checked}`);
        });

        const toggleText = document.createElement('span');
        toggleText.textContent = 'Remember contents';

        toggleLabel.appendChild(toggleCheckbox);
        toggleLabel.appendChild(toggleText);
        toggleContainer.appendChild(toggleLabel);

        header.appendChild(label);
        header.appendChild(toggleContainer);

        // Textarea container with resize handle (default 2 lines, no height persistence)
        const TWO_LINE_HEIGHT_PX = 44;
        const textareaWrapper = document.createElement('div');
        textareaWrapper.className = 'relative flex flex-col rounded-md overflow-hidden border border-input bg-background shadow-sm';
        textareaWrapper.style.minHeight = `${TWO_LINE_HEIGHT_PX}px`;
        textareaWrapper.style.height = `${TWO_LINE_HEIGHT_PX}px`;

        const textarea = document.createElement('textarea');
        textarea.className = 'flex-1 w-full border-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 resize-none';
        textarea.placeholder = 'Use this space for notes, IDs, or drafts. This is for your own use and not submitted with the task.';
        textarea.dataset.compUsePromptScratchpadTextarea = 'true';

        // Restore saved text if option is enabled
        const rememberContents = Storage.getSubOptionEnabled(this.id, 'remember-contents', true);
        if (rememberContents) {
            const savedText = Storage.get(this.storageKeys.scratchpadText, '');
            if (savedText) {
                textarea.value = savedText;
                Logger.log(`✓ Comp Use Prompt Scratchpad: Restored saved text (${savedText.length} chars)`);
            }
        }

        // Set up text saving (event-based, no polling)
        this.setupTextSaving(state, textarea);

        // Resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex items-center justify-center transition-opacity duration-200';
        resizeHandle.style.opacity = '0';
        resizeHandle.style.background = 'transparent';

        const handleBar = document.createElement('div');
        handleBar.className = 'w-10 h-1 rounded-sm bg-current opacity-30';
        resizeHandle.appendChild(handleBar);

        // Show handle on hover
        textareaWrapper.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        textareaWrapper.addEventListener('mouseleave', () => {
            resizeHandle.style.opacity = '0';
        });

        textareaWrapper.appendChild(textarea);
        textareaWrapper.appendChild(resizeHandle);

        container.appendChild(header);
        container.appendChild(textareaWrapper);

        return container;
    },

    attachResizeHandler(state, container) {
        const textareaWrapper = container.querySelector('div.relative');
        const resizeHandle = textareaWrapper?.querySelector('div.cursor-ns-resize');

        if (!textareaWrapper || !resizeHandle) {
            Logger.warn('Comp Use Prompt Scratchpad: Could not find textarea wrapper or resize handle for attachment');
            return;
        }

        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const minHeight = 44;

        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = textareaWrapper.offsetHeight;

            e.preventDefault();
            e.stopPropagation();

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        };

        const handleMouseMove = (e) => {
            if (!isResizing) return;

            const deltaY = e.clientY - startY;
            const newHeight = Math.max(minHeight, startHeight + deltaY);

            textareaWrapper.style.height = `${newHeight}px`;
        };

        const handleMouseUp = () => {
            if (!isResizing) return;

            isResizing = false;

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        resizeHandle.addEventListener('mousedown', handleMouseDown);
        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);
    },

    setupTextSaving(state, textarea) {
        const debouncedSave = () => {
            if (state.saveTimeoutId) {
                clearTimeout(state.saveTimeoutId);
            }

            state.saveTimeoutId = setTimeout(() => {
                const rememberContents = Storage.getSubOptionEnabled(this.id, 'remember-contents', true);
                if (rememberContents) {
                    const text = textarea.value || '';
                    Storage.set(this.storageKeys.scratchpadText, text);
                    Logger.debug(`Comp Use Prompt Scratchpad: Saved text (${text.length} chars)`);
                }
                state.saveTimeoutId = null;
            }, 500);
        };

        const onChange = () => {
            const rememberContents = Storage.getSubOptionEnabled(this.id, 'remember-contents', true);
            if (!rememberContents) {
                // If remembering is disabled, clear any stored text and skip saving.
                Storage.set(this.storageKeys.scratchpadText, '');
                return;
            }
            debouncedSave();
        };

        textarea.addEventListener('input', onChange);
        textarea.addEventListener('change', onChange);

        CleanupRegistry.registerEventListener(textarea, 'input', onChange);
        CleanupRegistry.registerEventListener(textarea, 'change', onChange);

        Logger.debug('Comp Use Prompt Scratchpad: Text saving enabled');
    }
};

