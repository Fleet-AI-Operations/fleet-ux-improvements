
// ============= qa-scratchpad.js =============
// Adds an adjustable height scratchpad between the prompt and environment variables sections.

const plugin = {
    id: 'qaScratchpad',
    name: 'QA Scratchpad',
    description: 'Adds an adjustable height scratchpad for notes between prompt and environment variables',
    _version: '1.4',
    enabledByDefault: true,
    phase: 'mutation',
    
    // ========== SUB-OPTIONS ==========
    subOptions: [
        {
            id: 'remember-contents',
            name: 'Remember Scratchpad Contents',
            description: 'Saves and restores scratchpad text across page loads',
            enabledByDefault: false
        }
    ],
    
    storageKeys: {
        scratchpadText: 'qa-scratchpad-text'
    },
    
    selectors: {
        promptSection: 'div.flex.flex-col.gap-2:has(span:contains("Prompt"), label:contains("Prompt"))'
    },
    
    initialState: {
        scratchpadInserted: false,
        resizeHandlerAttached: false,
        textareaObserver: null,
        saveTimeoutId: null,
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
                const candidates = Context.dom.queryAll('div.flex.flex-col.gap-2', {
                    context: `${this.id}.diagnostic`
                });
                const foundLabels = [];
                candidates.forEach(candidate => {
                    const label = candidate.querySelector('label, span.text-sm');
                    if (label) {
                        foundLabels.push(label.textContent.trim());
                    }
                });
                Logger.warn(`QA Scratchpad: Prompt section not found. Found ${candidates.length} candidate divs with labels/spans: ${foundLabels.join(', ') || 'none'}`);
            }
            return;
        }
        
        // Check if scratchpad already exists
        let scratchpadContainer = promptSection.nextElementSibling;
        if (scratchpadContainer && scratchpadContainer.dataset.qaScratchpad === 'true') {
            // Scratchpad already exists, just attach resize handler if needed
            if (!state.resizeHandlerAttached) {
                this.attachResizeHandler(state, scratchpadContainer);
                state.resizeHandlerAttached = true;
                Logger.log('✓ QA Scratchpad: Resize handler attached');
            }
            return;
        }
        
        // Insert scratchpad right after the prompt section
        const scratchpad = this.createScratchpad(state);
        promptSection.insertAdjacentElement('afterend', scratchpad);
        state.scratchpadInserted = true;
        state.insertionFailedLogged = false; // Reset on success
        Logger.log('✓ QA Scratchpad: Successfully inserted after Prompt section');
        
        // Attach resize handler
        scratchpadContainer = promptSection.nextElementSibling;
        if (scratchpadContainer && scratchpadContainer.dataset.qaScratchpad === 'true') {
            this.attachResizeHandler(state, scratchpadContainer);
            state.resizeHandlerAttached = true;
            Logger.log('✓ QA Scratchpad: Resize handler attached');
        } else {
            Logger.warn('QA Scratchpad: Inserted but could not find container for resize handler');
        }
    },
    
    findPromptSection() {
        // Find all divs with "flex flex-col gap-2"
        const candidates = Context.dom.queryAll('div.flex.flex-col.gap-2', {
            context: `${this.id}.findPromptSection`
        });
        
        for (const candidate of candidates) {
            // Look for both label and span elements
            const label = candidate.querySelector('label');
            const span = candidate.querySelector('span.text-sm.text-muted-foreground.font-medium');
            
            // Check if either contains "Prompt" text
            if (label && label.textContent.trim() === 'Prompt') {
                return candidate;
            }
            
            if (span && span.textContent.trim() === 'Prompt') {
                return candidate;
            }
        }
        
        return null;
    },
    
    createScratchpad(state) {
        const container = document.createElement('div');
        container.className = 'flex flex-col gap-2';
        container.dataset.qaScratchpad = 'true';
        
        // Header with label and toggle
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between';
        
        const label = document.createElement('span');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'QA Scratchpad';
        
        // Toggle for remembering contents
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'flex items-center gap-2';
        
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'text-xs text-muted-foreground cursor-pointer flex items-center gap-1.5';
        
        const toggleCheckbox = document.createElement('input');
        toggleCheckbox.type = 'checkbox';
        toggleCheckbox.className = 'size-3.5 rounded border-gray-300';
        toggleCheckbox.checked = Storage.getSubOptionEnabled(this.id, 'remember-contents', true);
        toggleCheckbox.addEventListener('change', (e) => {
            Storage.setSubOptionEnabled(this.id, 'remember-contents', e.target.checked);
            Logger.debug(`QA Scratchpad: Remember contents setting changed to ${e.target.checked}`);
        });
        
        const toggleText = document.createElement('span');
        toggleText.textContent = 'Remember contents';
        
        toggleLabel.appendChild(toggleCheckbox);
        toggleLabel.appendChild(toggleText);
        toggleContainer.appendChild(toggleLabel);
        
        header.appendChild(label);
        header.appendChild(toggleContainer);
        
        // Textarea container with resize handle
        const textareaWrapper = document.createElement('div');
        textareaWrapper.className = 'relative flex flex-col rounded-md overflow-hidden border border-input bg-background shadow-sm';
        textareaWrapper.style.minHeight = '60px';
        textareaWrapper.style.height = '150px';
        
        const textarea = document.createElement('textarea');
        textarea.className = 'flex-1 w-full border-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 resize-none';
        textarea.placeholder = 'Use this space for notes, observations, or any other QA-related content...';
        textarea.dataset.qaScratchpadTextarea = 'true';
        
        // Restore saved text if option is enabled
        const rememberContents = Storage.getSubOptionEnabled(this.id, 'remember-contents', true);
        if (rememberContents) {
            const savedText = Storage.get(this.storageKeys.scratchpadText, '');
            if (savedText) {
                this.applyTextareaValue(textarea, savedText);
                Logger.log(`✓ QA Scratchpad: Restored saved text (${savedText.length} chars)`);
            }
        }
        
        // Set up text saving (always set up observer, it checks the option before saving)
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
        const resizeHandle = textareaWrapper.querySelector('div.cursor-ns-resize');
        
        if (!textareaWrapper || !resizeHandle) {
            Logger.warn('QA Scratchpad: Could not find textarea wrapper or resize handle for attachment');
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
        };
        
        resizeHandle.addEventListener('mousedown', handleMouseDown);
        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);
    },
    
    setupTextSaving(state, textarea) {
        // Debounced save function
        const saveText = () => {
            if (state.saveTimeoutId) {
                clearTimeout(state.saveTimeoutId);
            }
            
            state.saveTimeoutId = setTimeout(() => {
                const rememberContents = Storage.getSubOptionEnabled(this.id, 'remember-contents', true);
                if (rememberContents) {
                    const text = textarea.value || '';
                    Storage.set(this.storageKeys.scratchpadText, text);
                    Logger.debug(`QA Scratchpad: Saved text (${text.length} chars)`);
                }
                state.saveTimeoutId = null;
            }, 500);
        };
        
        // Watch for changes
        const observer = new MutationObserver(() => {
            const rememberContents = Storage.getSubOptionEnabled(this.id, 'remember-contents', true);
            if (rememberContents) {
                saveText();
            }
        });
        
        // Observe value changes via input events
        textarea.addEventListener('input', saveText);
        textarea.addEventListener('change', saveText);
        
        // Also observe DOM mutations (in case React changes the value)
        observer.observe(textarea, {
            attributes: true,
            attributeFilter: ['value'],
            childList: true,
            subtree: true,
            characterData: true
        });
        
        state.textareaObserver = observer;
        
        // Register cleanup
        CleanupRegistry.registerObserver(observer);
        CleanupRegistry.registerEventListener(textarea, 'input', saveText);
        CleanupRegistry.registerEventListener(textarea, 'change', saveText);
        
        Logger.debug('QA Scratchpad: Text saving observer enabled');
    },
    
    applyTextareaValue(textarea, value) {
        // Try React-compatible method first
        const reactFiber = this.getReactFiber(textarea);
        if (reactFiber) {
            const props = reactFiber.memoizedProps || reactFiber.pendingProps;
            if (props && props.onChange) {
                const syntheticEvent = {
                    target: textarea,
                    currentTarget: textarea,
                    bubbles: true,
                    cancelable: true,
                    defaultPrevented: false,
                    eventPhase: 2,
                    isTrusted: false,
                    nativeEvent: new Event('input', { bubbles: true }),
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    timeStamp: Date.now(),
                    type: 'change'
                };
                
                const nativeValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    'value'
                )?.set;
                
                if (nativeValueSetter) {
                    nativeValueSetter.call(textarea, value);
                } else {
                    textarea.value = value;
                }
                
                try {
                    props.onChange(syntheticEvent);
                    return;
                } catch (error) {
                    Logger.debug('QA Scratchpad: Error calling React onChange:', error);
                }
            }
        }
        
        // Fallback: Use native value setter and dispatch events
        const nativeValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
        )?.set;
        
        if (nativeValueSetter) {
            nativeValueSetter.call(textarea, value);
        } else {
            textarea.value = value;
        }
        
        textarea.focus();
        
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        textarea.dispatchEvent(inputEvent);
        
        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
        textarea.dispatchEvent(changeEvent);
        
        textarea.blur();
        textarea.focus();
    },
    
    getReactFiber(element) {
        const keys = Object.keys(element);
        for (const key of keys) {
            if (key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')) {
                return element[key];
            }
        }
        
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
