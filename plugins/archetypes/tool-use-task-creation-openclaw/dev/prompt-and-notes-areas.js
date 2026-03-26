// ============= prompt-and-notes-areas.js =============
// Adjusts the layout so the scratchpad is anchored to the bottom and fills available space.
// The prompt textarea handle controls both prompt and scratchpad heights.

const plugin = {
    id: 'promptAndNotesAreas',
    name: 'Prompt and Notes Areas Layout',
    description: 'Anchors scratchpad to bottom and makes prompt handle control both areas',
    _version: '3.3',
    enabledByDefault: false,
    phase: 'mutation',
    
    // ========== SUB-OPTIONS ==========
    subOptions: [
        {
            id: 'remember-scratchpad',
            name: 'Remember Scratchpad Text',
            description: 'Saves and restores scratchpad text across page loads',
            enabledByDefault: false
        }
    ],
    
    storageKeys: {
        promptHeight: 'prompt-and-notes-prompt-height',
        scratchpadText: 'prompt-and-notes-scratchpad-text'
    },
    
    initialState: {
        layoutApplied: false,
        resizeHandlerAttached: false,
        scratchpadResizeHandlerAttached: false,
        scratchpadObserver: null,
        saveTimeoutId: null,
        missingLogged: false
    },
    
    onMutation(state, context) {
        if (state.layoutApplied && state.resizeHandlerAttached && state.scratchpadResizeHandlerAttached) return;
        
        const promptPanel = document.querySelector('[data-ui="prompt-panel"]');
        const mainContainer = Context.dom.query('#prompt-editor', {
            context: `${this.id}.promptEditor`,
            root: promptPanel || document
        });

        if (!mainContainer) {
            if (!state.missingLogged) {
                Logger.debug('Prompt editor not found for layout adjustment');
                state.missingLogged = true;
            }
            return;
        }
        
        // Reset missing log once found
        state.missingLogged = false;
        
        // Navigate up to find the scrollable container (line 70)
        let scrollableContainer = mainContainer.closest('.flex-1.min-h-0.overflow-auto');
        if (!scrollableContainer) {
            // Try alternative selector
            scrollableContainer = mainContainer.closest('div.flex-1.min-h-0');
        }
        
        if (!scrollableContainer) {
            Logger.warn('Could not find scrollable container');
            return;
        }
        
        // Find the content area (line 93) - the div with p-3 border-b that contains prompt, buttons, scratchpad
        const contentArea = scrollableContainer.querySelector('div.p-3.border-b');
        if (!contentArea) {
            Logger.warn('Could not find content area');
            return;
        }
        
        // Find the scratchpad container (line 150)
        const scratchpadContainer = contentArea.querySelector('div.mt-3.flex-1.flex.flex-col.min-h-0');
        if (!scratchpadContainer) {
            Logger.warn('Could not find scratchpad container');
            return;
        }
        
        // Find the scratchpad textarea
        const scratchpadTextarea = scratchpadContainer.querySelector('textarea');
        if (!scratchpadTextarea) {
            Logger.warn('Could not find scratchpad textarea');
            return;
        }
        
        // Apply layout changes
        if (!state.layoutApplied) {
            this.applyLayout(scrollableContainer, contentArea, scratchpadContainer);
            state.layoutApplied = true;
            Logger.log('✓ Layout applied: scratchpad anchored to bottom');
        }
        
        // Attach resize handler
        if (!state.resizeHandlerAttached) {
            this.attachResizeHandler(state, mainContainer, contentArea, scratchpadContainer);
            state.resizeHandlerAttached = true;
            Logger.log('✓ Resize handler attached');
        }
        
        // Attach scratchpad resize handle so dragging it resizes the scratchpad and the sanitizer below rises
        if (!state.scratchpadResizeHandlerAttached) {
            this.attachScratchpadResizeHandler(state, scratchpadContainer);
            state.scratchpadResizeHandlerAttached = true;
        }
        
        // Restore scratchpad text if option is enabled
        const rememberScratchpad = Storage.getSubOptionEnabled(this.id, 'remember-scratchpad', true);
        if (rememberScratchpad && !scratchpadTextarea.dataset.wfScratchpadRestored) {
            this.restoreScratchpadText(scratchpadTextarea);
            scratchpadTextarea.dataset.wfScratchpadRestored = 'true';
        }
        
        // Set up scratchpad text saving if option is enabled
        if (rememberScratchpad && !state.scratchpadObserver) {
            this.setupScratchpadSaving(state, scratchpadTextarea);
        }
    },
    
    applyLayout(scrollableContainer, contentArea, scratchpadContainer) {
        // Find the inner flex-col container (line 71) and make it flex-1
        const innerFlexContainer = scrollableContainer.querySelector('div.flex.flex-col');
        if (innerFlexContainer) {
            innerFlexContainer.style.flex = '1';
            innerFlexContainer.style.minHeight = '0';
            innerFlexContainer.style.display = 'flex';
            innerFlexContainer.style.flexDirection = 'column';
        }
        
        // Change scrollable container from overflow-auto to flex column
        scrollableContainer.classList.remove('overflow-auto');
        scrollableContainer.style.display = 'flex';
        scrollableContainer.style.flexDirection = 'column';
        scrollableContainer.style.height = '100%';
        
        // Make content area flex-1 and use flex column
        contentArea.classList.remove('border-b');
        contentArea.style.display = 'flex';
        contentArea.style.flexDirection = 'column';
        contentArea.style.flex = '1';
        contentArea.style.minHeight = '0';
        contentArea.style.padding = '0.75rem';
        // Reserve bottom space so the Fleet settings button (fixed bottom-left) doesn't cover the text sanitizer
        const settingsButtonClearancePx = 72; // ~20px offset + 48px button height + small buffer
        contentArea.style.paddingBottom = `${settingsButtonClearancePx}px`;
        
        // Make scratchpad container flex-1 to fill remaining space
        scratchpadContainer.style.marginTop = '0.75rem';
        scratchpadContainer.style.flex = '1';
        scratchpadContainer.style.minHeight = '0';
        scratchpadContainer.style.display = 'flex';
        scratchpadContainer.style.flexDirection = 'column';
        
        // Scratchpad starts at 2 lines (no height persistence)
        const TWO_LINE_HEIGHT_PX = 55;
        const scratchpadWrapper = scratchpadContainer.querySelector('div.flex.flex-col.relative.rounded-md');
        if (scratchpadWrapper) {
            scratchpadWrapper.style.flex = '0 0 auto';
            scratchpadWrapper.style.minHeight = `${TWO_LINE_HEIGHT_PX}px`;
            scratchpadWrapper.style.height = `${TWO_LINE_HEIGHT_PX}px`;
        }
        
        // Make scratchpad textarea fill its container
        const scratchpadTextarea = scratchpadContainer.querySelector('textarea');
        if (scratchpadTextarea) {
            scratchpadTextarea.style.flex = '1';
            scratchpadTextarea.style.minHeight = '0';
        }
        
        // Restore saved prompt height if available
        const savedHeight = Storage.get(this.storageKeys.promptHeight, null);
        if (savedHeight != null) {
            const promptContainer = contentArea.querySelector('div.relative > div.flex.flex-col');
            if (promptContainer) {
                promptContainer.style.height = `${savedHeight}px`;
                Logger.log(`✓ Restored prompt height: ${savedHeight}px`);
            }
        }
    },
    
    attachResizeHandler(state, promptEditor, contentArea, scratchpadContainer) {
        // Find the prompt textarea container (line 109)
        const promptContainer = promptEditor.closest('div.flex.flex-col.relative.rounded-md');
        if (!promptContainer) {
            Logger.warn('Could not find prompt container for resize handler');
            return;
        }
        
        // Find the resize handle (line 118)
        const resizeHandle = promptContainer.querySelector('div.cursor-ns-resize');
        if (!resizeHandle) {
            Logger.warn('Could not find resize handle');
            return;
        }
        
        // Make handle visible and interactive
        resizeHandle.style.opacity = '1';
        resizeHandle.style.pointerEvents = 'auto';
        
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        let minHeight = 60; // Minimum height for prompt area
        
        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = promptContainer.offsetHeight;
            
            // Prevent text selection during resize
            e.preventDefault();
            e.stopPropagation();
            
            // Add global mouse move and up handlers
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            
            // Add visual feedback
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        };
        
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            
            const deltaY = e.clientY - startY;
            const newHeight = Math.max(minHeight, startHeight + deltaY);
            
            // Set the prompt container height
            promptContainer.style.height = `${newHeight}px`;
            
            // The scratchpad will automatically fill remaining space due to flex layout
        };
        
        const handleMouseUp = (e) => {
            if (!isResizing) return;
            
            isResizing = false;
            
            // Remove global handlers
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            // Restore cursor
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Save the new height
            const currentHeight = promptContainer.offsetHeight;
            Storage.set(this.storageKeys.promptHeight, currentHeight);
            Logger.debug(`Saved prompt height: ${currentHeight}px`);
        };
        
        // Attach mouse down handler
        resizeHandle.addEventListener('mousedown', handleMouseDown);
        
        // Register cleanup
        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);
    },
    
    attachScratchpadResizeHandler(state, scratchpadContainer) {
        const scratchpadWrapper = scratchpadContainer.querySelector('div.flex.flex-col.relative.rounded-md');
        if (!scratchpadWrapper) {
            Logger.debug('Scratchpad wrapper not found for resize handle');
            return;
        }
        const resizeHandle = scratchpadWrapper.querySelector('div.cursor-ns-resize');
        if (!resizeHandle) {
            Logger.debug('Scratchpad resize handle not found');
            return;
        }
        resizeHandle.style.opacity = '1';
        resizeHandle.style.pointerEvents = 'auto';
        
        const minHeight = 55;
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        
        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = scratchpadWrapper.offsetHeight;
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
            scratchpadWrapper.style.height = `${newHeight}px`;
            scratchpadWrapper.style.flex = '0 0 auto';
            scratchpadContainer.style.flex = '0 0 auto';
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
        Logger.log('✓ Scratchpad resize handle attached');
    },
    
    restoreScratchpadText(textarea) {
        const savedText = Storage.get(this.storageKeys.scratchpadText, '');
        if (savedText) {
            // Use React-compatible method to set value
            this.applyTextareaValue(textarea, savedText);
            Logger.log(`✓ Restored scratchpad text (${savedText.length} chars)`);
        }
    },
    
    setupScratchpadSaving(state, textarea) {
        // Debounced save function
        const saveScratchpadText = () => {
            if (state.saveTimeoutId) {
                clearTimeout(state.saveTimeoutId);
            }
            
            state.saveTimeoutId = setTimeout(() => {
                const text = textarea.value || '';
                Storage.set(this.storageKeys.scratchpadText, text);
                Logger.debug(`Saved scratchpad text (${text.length} chars)`);
                state.saveTimeoutId = null;
            }, 500);
        };
        
        // Watch for changes
        const observer = new MutationObserver(() => {
            saveScratchpadText();
        });
        
        // Observe value changes via input events
        textarea.addEventListener('input', saveScratchpadText);
        textarea.addEventListener('change', saveScratchpadText);
        
        // Also observe DOM mutations (in case React changes the value)
        observer.observe(textarea, {
            attributes: true,
            attributeFilter: ['value'],
            childList: true,
            subtree: true,
            characterData: true
        });
        
        state.scratchpadObserver = observer;
        
        // Register cleanup
        CleanupRegistry.registerObserver(observer);
        CleanupRegistry.registerEventListener(textarea, 'input', saveScratchpadText);
        CleanupRegistry.registerEventListener(textarea, 'change', saveScratchpadText);
        
        Logger.log('✓ Scratchpad text saving enabled');
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
                    Logger.debug('Error calling React onChange:', error);
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
