// ============= json-editor-online.js =============
// Plugin that adds JSON Editor Online button to toolbar and optionally to each tool result

const plugin = {
    id: 'jsonEditorOnline',
    name: 'JSON Editor Online',
    description: 'Add button that opens JSON Editor Online in a new tab. Optionally show button on each tool result to copy output and open editor.',
    _version: '2.1',
    enabledByDefault: true,
    phase: 'mutation',
    
    subOptions: [
        {
            id: 'show-on-tool',
            name: 'Show button on each tool',
            description: 'Add a small button to each tool result area that copies the output and opens JSON Editor Online',
            enabledByDefault: true
        }
    ],
    
    selectors: {
        toolHeader: '[data-ui="step-header"]',
        toolHeaderFallback: 'div.flex.items-center.gap-3.p-3.cursor-pointer.hover\\:bg-muted\\/30',
        toolCard: '[data-ui="workflow-step"]',
        toolCardFallback: 'div.rounded-lg.border.transition-colors',
        actionBarCenterFallback:
            'body > div.group\\/sidebar-wrapper.flex.min-h-svh.w-full.has-\\[\\[data-variant\\=inset\\]\\]\\:bg-sidebar > main > div > div > div.h-full.w-full.flex.flex-col.overflow-hidden > div.flex-shrink-0.px-1.py-1\\.5 > div > div.flex-1.flex.items-center.justify-center.gap-1.mx-auto'
    },
    
    initialState: { 
        toolbarButtonAdded: false, 
        missingLogged: false
    },
    
    onMutation(state, context) {
        // Add toolbar button
        if (!state.toolbarButtonAdded) {
            this.addToolbarButton(state, context);
        }
        
        // Add buttons to individual tools if option is enabled
        const showOnTool = Storage.getSubOptionEnabled(this.id, 'show-on-tool', false);
        if (showOnTool) {
            this.addToolButtons(state, context);
        }
    },
    
    addToolbarButton(state, context) {
        const qaHeader = document.querySelector('[data-ui="qa-header"]');
        const center = qaHeader ? qaHeader.querySelector('.flex-1.flex.items-center.justify-center.gap-1.mx-auto') : null;
        const centerResolved = center || Context.dom.query(this.selectors.actionBarCenterFallback, { context: `${this.id}.actionBarCenter` });

        if (!centerResolved) {
            if (!state.missingLogged) {
                Logger.debug('Action bar center not found for JSON Editor Online button');
                state.missingLogged = true;
            }
            return;
        }
        
        // Reset missing log once the element appears
        state.missingLogged = false;
        
        // Check if button already exists
        const existing = centerResolved.querySelector('[data-fleet-plugin="jsonEditorOnline"][data-slot="toolbar-button"]');
        if (existing) {
            state.toolbarButtonAdded = true;
            return;
        }
        
        const button = document.createElement('button');
        button.setAttribute('data-fleet-plugin', this.id);
        button.setAttribute('data-slot', 'toolbar-button');
        button.className = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        button.innerHTML = '<span class="whitespace-nowrap text-md font-medium">{ } JSON Editor</span>';
        button.title = 'Open JSON Editor Online in new tab';
        
        button.addEventListener('click', () => {
            window.open('https://jsoneditoronline.org', '_blank');
            Logger.log('Opening JSON Editor Online');
        });
        
        const sourceDataBtn = centerResolved.querySelector('[data-fleet-plugin="sourceDataExplorer"][data-slot="source-data-button"]');
        if (sourceDataBtn) {
            sourceDataBtn.insertAdjacentElement('afterend', button);
        } else {
            centerResolved.appendChild(button);
        }
        
        state.toolbarButtonAdded = true;
        Logger.log('✓ JSON Editor Online toolbar button added (action bar)');
    },
    
    addToolButtons(state, context) {
        // Find workflow panel
        const panel = this.findWorkflowPanel();
        if (!panel) {
            if (!state.missingLogged) {
                Logger.debug('Workflow panel not found for JSON Editor Online tool buttons');
                state.missingLogged = true;
            }
            return;
        }
        
        const toolsContainer = this.findToolsArea(panel);
        if (!toolsContainer) {
            return;
        }
        
        const toolCardsByDataUi = toolsContainer.querySelectorAll(this.selectors.toolCard);
        const toolCards = toolCardsByDataUi.length ? Array.from(toolCardsByDataUi) : Context.dom.queryAll(this.selectors.toolCardFallback, { root: toolsContainer, context: `${this.id}.toolCards` });
        
        toolCards.forEach(card => {
            // Find the result area
            const resultArea = this.findResultArea(card);
            if (!resultArea) {
                return;
            }
            
            // Check if button already exists (like mini-execute-buttons does)
            const existing = resultArea.querySelector('[data-fleet-plugin="jsonEditorOnline"][data-slot="tool-button"]');
            if (existing) {
                return; // Button already exists, skip
            }
            
            // Find the button container (where "Find in result..." and other buttons are)
            const buttonContainer = this.findResultButtonContainer(resultArea);
            if (!buttonContainer) {
                return;
            }
            
            // Create the button
            const button = document.createElement('button');
            button.setAttribute('data-fleet-plugin', this.id);
            button.setAttribute('data-slot', 'tool-button');
            button.className = 'inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
            button.title = 'Copy current output and go to JSON Editor Online';
            button.innerHTML = '<span class="text-xs font-mono">{}</span>';
            
            let isHandlingClick = false;
            button.onclick = async (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (isHandlingClick) return;
                isHandlingClick = true;
                try {
                    const copyOk = await this.copyResultAndOpenEditor(card, resultArea);
                    this._flashJsonEditorToolButton(button, copyOk);
                } finally {
                    // Reset after a short delay to allow async operations
                    setTimeout(() => { isHandlingClick = false; }, 1000);
                }
            };
            
            // Insert after the divider (w-px h-4 bg-border mx-1)
            const divider = buttonContainer.querySelector('.w-px.h-4.bg-border.mx-1');
            if (divider) {
                divider.insertAdjacentElement('afterend', button);
            } else {
                // Fallback: insert before the first button after the search input
                const searchInput = buttonContainer.querySelector('input[placeholder*="Find in result"]');
                if (searchInput) {
                    const searchContainer = searchInput.closest('div.relative');
                    if (searchContainer && searchContainer.nextElementSibling) {
                        searchContainer.nextElementSibling.insertAdjacentElement('afterend', button);
                    } else {
                        buttonContainer.appendChild(button);
                    }
                } else {
                    buttonContainer.appendChild(button);
                }
            }
            
            Logger.log(`✓ JSON Editor Online button added to tool result`);
        });
    },
    
    findWorkflowPanel() {
        const byDataUi = document.querySelector('[data-ui="workflow-panel"]');
        if (byDataUi) return byDataUi;
        const panels = Context.dom.queryAll('[data-panel-id][data-panel]', { context: `${this.id}.panels` });
        for (const candidate of panels) {
            const toolbar = candidate.querySelector('[data-ui="workflow-toolbar"]') || candidate.querySelector('.border-b.h-9');
            if (toolbar) {
                const workflowText = Array.from(toolbar.querySelectorAll('span')).find(span => span.textContent.trim() === 'Workflow');
                if (workflowText) return candidate;
            }
        }
        const knownPanel = document.querySelector('[id=":rs:"][data-panel]');
        if (knownPanel) {
            const toolbar = knownPanel.querySelector('[data-ui="workflow-toolbar"]') || knownPanel.querySelector('.border-b.h-9');
            if (toolbar) {
                const workflowText = Array.from(toolbar.querySelectorAll('span')).find(span => span.textContent.trim() === 'Workflow');
                if (workflowText) return knownPanel;
            }
        }
        return null;
    },

    findToolsArea(panel) {
        if (!panel) return null;
        const stepsContainer = panel.querySelector('[data-ui="workflow-steps-container"]');
        if (stepsContainer) return stepsContainer;
        const scrollable = panel.querySelector('.overflow-y-auto');
        if (!scrollable) return null;
        return scrollable.querySelector('.space-y-3');
    },
    
    findResultArea(card) {
        // Find the collapsible content area
        const collapsibleContent = Context.dom.query('div[data-state="open"] > div[id^="radix-"][data-state="open"]', {
            root: card,
            context: `${this.id}.collapsibleContent`
        });
        if (!collapsibleContent) return null;
        
        // Find the result section - look for div with "Result" text
        const resultSection = Array.from(collapsibleContent.querySelectorAll('div')).find(div => {
            const text = div.textContent.trim();
            return text.includes('Result') && div.querySelector('input[placeholder*="Find in result"]');
        });
        
        return resultSection || null;
    },
    
    findResultButtonContainer(resultArea) {
        // Find the container with "Find in result..." input and buttons
        // Look for div.flex.items-center.gap-1 that contains the search input
        const searchInput = resultArea.querySelector('input[placeholder*="Find in result"]');
        if (!searchInput) return null;
        
        // Navigate up to find the flex container with buttons
        let container = searchInput.closest('div.flex.items-center');
        if (!container) return null;
        
        // Make sure it's the right container (has buttons)
        const hasButtons = container.querySelectorAll('button').length > 0;
        if (hasButtons) {
            return container;
        }
        
        // Try parent
        container = container.parentElement;
        if (container && container.classList.contains('flex') && container.classList.contains('items-center')) {
            return container;
        }
        
        return null;
    },
    
    _flashJsonEditorToolButton(button, success) {
        if (button._fleetJsonEdFlashT) clearTimeout(button._fleetJsonEdFlashT);
        if (success) {
            button.style.transition = '';
            button.style.backgroundColor = 'rgb(34, 197, 94)';
            button.style.color = '#ffffff';
            button._fleetJsonEdFlashT = setTimeout(() => {
                button.style.backgroundColor = '';
                button.style.color = '';
                button._fleetJsonEdFlashT = null;
            }, 1000);
        } else {
            const prevT = button.style.transition;
            button.style.transition = 'none';
            button.style.backgroundColor = 'rgb(239, 68, 68)';
            button.style.color = '#ffffff';
            void button.offsetHeight;
            button.style.transition = 'background-color 500ms ease-out, color 500ms ease-out';
            button.style.backgroundColor = '';
            button.style.color = '';
            button._fleetJsonEdFlashT = setTimeout(() => {
                button.style.transition = prevT || '';
                button._fleetJsonEdFlashT = null;
            }, 500);
        }
    },

    async copyResultAndOpenEditor(card, resultArea) {
        if (this._copying) {
            return false;
        }
        this._copying = true;
        let copyOk = false;

        try {
            Logger.log('Copying result and opening JSON Editor Online');

            const resultContent = this.findResultContent(resultArea);
            if (resultContent) {
                const textContent = (resultContent.textContent || resultContent.innerText || '').trim();
                if (textContent) {
                    try {
                        await navigator.clipboard.writeText(textContent);
                        copyOk = true;
                        Logger.log('✓ Copied result content to clipboard');
                    } catch (e) {
                        Logger.warn('Failed to copy to clipboard:', e);
                        try {
                            const textArea = document.createElement('textarea');
                            textArea.value = textContent;
                            textArea.style.position = 'fixed';
                            textArea.style.opacity = '0';
                            document.body.appendChild(textArea);
                            textArea.select();
                            copyOk = document.execCommand('copy');
                            document.body.removeChild(textArea);
                            if (copyOk) {
                                Logger.log('✓ Copied result content to clipboard (fallback method)');
                            }
                        } catch (fallbackError) {
                            Logger.warn('Fallback copy method also failed:', fallbackError);
                        }
                    }
                } else {
                    Logger.warn('Result content is empty');
                }
            } else {
                Logger.warn('Result content div not found, opening editor anyway');
            }

            window.open('https://jsoneditoronline.org', '_blank');
            Logger.log('✓ Opened JSON Editor Online');
        } finally {
            this._copying = false;
        }
        return copyOk;
    },
    
    findResultContent(resultArea) {
        // Find the div with the actual result content
        // Based on the HTML structure: div.p-3.rounded-md.border with font-mono
        const resultContent = resultArea.querySelector('div.p-3.rounded-md.border.font-mono');
        if (resultContent) {
            return resultContent;
        }
        
        // Fallback: look for div with whitespace-pre-wrap (common for code/JSON display)
        const preWrapDiv = resultArea.querySelector('div.whitespace-pre-wrap');
        if (preWrapDiv) {
            return preWrapDiv;
        }
        
        // Fallback: look for any div with border that contains JSON-like content
        const borderDivs = resultArea.querySelectorAll('div.border');
        for (const div of borderDivs) {
            const text = (div.textContent || '').trim();
            // Check if it looks like JSON (starts with { or [)
            if (text.startsWith('{') || text.startsWith('[')) {
                return div;
            }
        }
        
        return null;
    }
};
