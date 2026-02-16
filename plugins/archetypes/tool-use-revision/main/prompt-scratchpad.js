// ============= prompt-scratchpad.js =============
// Adds an adjustable height scratchpad after the prompt section.

const plugin = {
    id: 'promptScratchpad',
    name: 'Scratchpad',
    description: 'Adds an adjustable height scratchpad to the page',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',
    
    storageKeys: {
        scratchpadHeight: 'tool-use-revision-scratchpad-height'
    },
    
    selectors: {
        promptSection: 'div.flex.flex-col.gap-2:has(span:contains("Prompt"), label:contains("Prompt"))'
    },
    
    initialState: {
        scratchpadInserted: false,
        resizeHandlerAttached: false,
        searchAttempted: false,
        insertionFailedLogged: false
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
                    `Prompt Scratchpad: Prompt section not found. Found ${candidates.length} candidate divs with labels/spans: ${foundLabels.join(', ') || 'none'}`
                );
            }
            return;
        }
        
        // Check if scratchpad already exists
        let scratchpadContainer = promptSection.nextElementSibling;
        if (scratchpadContainer && scratchpadContainer.dataset.promptScratchpad === 'true') {
            // Scratchpad already exists, just attach resize handler if needed
            if (!state.resizeHandlerAttached) {
                this.attachResizeHandler(state, scratchpadContainer);
                state.resizeHandlerAttached = true;
                Logger.log('✓ Prompt Scratchpad: Resize handler attached');
            }
            return;
        }
        
        // Insert scratchpad right after the prompt section
        const scratchpad = this.createScratchpad(state);
        promptSection.insertAdjacentElement('afterend', scratchpad);
        state.scratchpadInserted = true;
        state.insertionFailedLogged = false; // Reset on success
        Logger.log('✓ Prompt Scratchpad: Successfully inserted after Prompt section');
        
        // Attach resize handler
        scratchpadContainer = promptSection.nextElementSibling;
        if (scratchpadContainer && scratchpadContainer.dataset.promptScratchpad === 'true') {
            this.attachResizeHandler(state, scratchpadContainer);
            state.resizeHandlerAttached = true;
            Logger.log('✓ Prompt Scratchpad: Resize handler attached');
        } else {
            Logger.warn('Prompt Scratchpad: Inserted but could not find container for resize handler');
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
        container.dataset.promptScratchpad = 'true';
        
        // Header with label
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between';
        
        const label = document.createElement('span');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Scratchpad';
        
        header.appendChild(label);
        
        // Textarea container with resize handle
        const textareaWrapper = document.createElement('div');
        textareaWrapper.className = 'relative flex flex-col rounded-md overflow-hidden border border-input bg-background shadow-sm';
        textareaWrapper.style.minHeight = '60px';
        
        // Restore saved height or use default
        const savedHeight = Storage.get(this.storageKeys.scratchpadHeight, 150);
        textareaWrapper.style.height = `${savedHeight}px`;
        
        const textarea = document.createElement('textarea');
        textarea.className = 'flex-1 w-full border-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 resize-none';
        textarea.placeholder = 'Use this space for notes, item IDs, JSON, etc. This is for your own use and not submitted with the task.';
        textarea.dataset.promptScratchpadTextarea = 'true';
        
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
        const resizeHandle = textareaWrapper.querySelector('div.cursor-ns-resize');
        
        if (!textareaWrapper || !resizeHandle) {
            Logger.warn('Prompt Scratchpad: Could not find textarea wrapper or resize handle for attachment');
            return;
        }
        
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const minHeight = 60;
        
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
        
        const handleMouseUp = (e) => {
            if (!isResizing) return;
            
            isResizing = false;
            
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Save the new height
            const currentHeight = textareaWrapper.offsetHeight;
            Storage.set(this.storageKeys.scratchpadHeight, currentHeight);
            Logger.debug(`Prompt Scratchpad: Saved height ${currentHeight}px`);
        };
        
        resizeHandle.addEventListener('mousedown', handleMouseDown);
        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);
    }
};
