// ============= workflow-integrity-check.js =============
const plugin = {
    id: 'workflowIntegrityCheck',
    name: 'Workflow Integrity Check',
    description: 'Adds button to check workflow integrity by verifying tool inputs exist in prompt or previous outputs',
    _version: '2.1',
    enabledByDefault: false,
    phase: 'mutation',

    selectors: {
        workflowPanel: '[data-ui="workflow-panel"]',
        workflowStepsContainer: '[data-ui="workflow-steps-container"]',
        workflowStep: '[data-ui="workflow-step"]',
        stepHeader: '[data-ui="step-header"]',
        toolHeaderFallback: 'div.flex.items-center.gap-3.p-3.cursor-pointer.hover\\:bg-muted\\/30',
        toolCardFallback: 'div.rounded-lg.border.transition-colors'
    },
    
    initialState: { 
        toolbarButtonAdded: false, 
        missingLogged: false,
        checkInProgress: false
    },
    
    onMutation(state, context) {
        // Add toolbar button
        if (!state.toolbarButtonAdded) {
            this.addToolbarButton(state, context);
        }
    },
    
    addToolbarButton(state, context) {
        // Find the button container using the same strategies as json-editor-online
        let buttonContainer = null;
        
        // Strategy 1: Find by class combination (flex, gap-1, ml-auto, items-center)
        const candidates = document.querySelectorAll('div.flex.gap-1.ml-auto.items-center');
        buttonContainer = Array.from(candidates).find(el => 
            el.classList.contains('mr-0') || 
            (el.classList.contains('flex') && 
             el.classList.contains('gap-1') && 
             el.classList.contains('items-center') &&
             getComputedStyle(el).marginLeft === 'auto')
        );
        
        // Strategy 2: Find by looking for container with Reset Instance button
        if (!buttonContainer) {
            const buttons = Array.from(document.querySelectorAll('button'));
            const resetBtn = buttons.find(btn => {
                const text = btn.textContent.trim();
                return text === 'Reset Instance' || text.includes('Reset Instance');
            });
            if (resetBtn) {
                buttonContainer = resetBtn.closest('div.flex.gap-1');
            }
        }
        
        // Strategy 3: Find by looking for container with Save button
        if (!buttonContainer) {
            const buttons = Array.from(document.querySelectorAll('button'));
            const saveBtn = buttons.find(btn => {
                const text = btn.textContent.trim();
                return text === 'Save';
            });
            if (saveBtn) {
                const parent = saveBtn.parentElement;
                if (parent && parent.classList.contains('flex') && parent.classList.contains('gap-1')) {
                    buttonContainer = parent;
                }
            }
        }
        
        // Strategy 4: Look for Explore GUI button and use its container
        if (!buttonContainer) {
            const sourceDataBtn = Array.from(document.querySelectorAll('button')).find(btn =>
                btn.textContent.includes('Explore GUI')
            );
            if (sourceDataBtn) {
                buttonContainer = sourceDataBtn.parentElement;
            }
        }
        
        if (!buttonContainer) {
            if (!state.missingLogged) {
                Logger.debug('Button container not found for Workflow Integrity Check button');
                state.missingLogged = true;
            }
            return;
        }
        
        // Check if button already exists
        const existing = buttonContainer.querySelector('[data-fleet-plugin="workflowIntegrityCheck"][data-slot="toolbar-button"]');
        if (existing) {
            state.toolbarButtonAdded = true;
            return;
        }
        
        const button = document.createElement('button');
        button.setAttribute('data-fleet-plugin', this.id);
        button.setAttribute('data-slot', 'toolbar-button');
        button.className = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 gap-2 text-xs relative';
        button.innerHTML = '<span>✓</span> <span>Workflow Integrity Check</span>';
        button.title = 'Check workflow integrity';
        
        button.onclick = () => {
            if (state.checkInProgress) {
                Logger.log('Workflow integrity check already in progress');
                return;
            }
            this.runIntegrityCheck(state);
        };
        
        // Insert after JSON Editor button if it exists, otherwise as first child
        const jsonEditorBtn = Array.from(buttonContainer.querySelectorAll('button')).find(btn => 
            btn.textContent.includes('JSON Editor')
        );
        if (jsonEditorBtn) {
            jsonEditorBtn.insertAdjacentElement('afterend', button);
        } else {
            buttonContainer.insertBefore(button, buttonContainer.firstChild);
        }
        
        state.toolbarButtonAdded = true;
        Logger.log('✓ Workflow Integrity Check toolbar button added');
    },
    
    async runIntegrityCheck(state) {
        if (state.checkInProgress) {
            Logger.log('Check already in progress');
            return;
        }
        
        state.checkInProgress = true;
        Logger.log('Starting workflow integrity check');
        
        try {
            // Find workflow panel
            const panel = this.findWorkflowPanel();
            if (!panel) {
                Logger.warn('Workflow panel not found');
                state.checkInProgress = false;
                return;
            }
            
            // Get prompt text
            const promptText = this.getPromptText();
            if (!promptText) {
                Logger.warn('Prompt text not found');
                state.checkInProgress = false;
                return;
            }
            
            // Find tools container
            const toolsContainer = this.findToolsArea(panel);
            if (!toolsContainer) {
                Logger.warn('Tools container not found');
                state.checkInProgress = false;
                return;
            }
            
            let toolCards = Context.dom.queryAll(this.selectors.workflowStep, { root: toolsContainer, context: `${this.id}.toolCards` });
            if (!toolCards.length) toolCards = Context.dom.queryAll(this.selectors.toolCardFallback, { root: toolsContainer, context: `${this.id}.toolCards` });
            
            if (toolCards.length === 0) {
                Logger.log('No tools found');
                state.checkInProgress = false;
                return;
            }
            
            // Expand all tools
            Logger.log(`Expanding ${toolCards.length} tool(s)`);
            await this.expandAllTools(toolCards);
            
            // Wait a bit for expansion to complete
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Extract tool data
            const toolsData = this.extractToolsData(toolCards);
            
            // Perform integrity check
            const results = this.checkIntegrity(promptText, toolsData);
            
            // Show modal with results
            this.showResultsModal(results, () => {
                state.checkInProgress = false;
            });
            
        } catch (error) {
            Logger.error('Error during integrity check:', error);
            state.checkInProgress = false;
        }
    },
    
    findWorkflowPanel() {
        const byDataUi = document.querySelector(this.selectors.workflowPanel);
        if (byDataUi) return byDataUi;
        const panels = Context.dom.queryAll('[data-panel-id][data-panel]', { context: `${this.id}.panels` });
        for (const candidate of panels) {
            const toolbar = candidate.querySelector('.border-b.h-9');
            if (toolbar) {
                const workflowText = Array.from(toolbar.querySelectorAll('span')).find(
                    span => span.textContent.trim() === 'Workflow'
                );
                if (workflowText) return candidate;
            }
        }
        return null;
    },

    findToolsArea(panel) {
        if (!panel) return null;
        const container = panel.querySelector(this.selectors.workflowStepsContainer);
        if (container) {
            const spaceY3 = container.querySelector(':scope > .space-y-3');
            return spaceY3 || container;
        }
        const scrollable = panel.querySelector('.overflow-y-auto');
        if (!scrollable) return null;
        return scrollable.querySelector('.space-y-3');
    },
    
    getPromptText() {
        // For task creation, look for prompt textarea
        const promptEditor = Context.dom.query('#prompt-editor', {
            context: `${this.id}.promptEditor`
        });
        
        if (promptEditor) {
            const textarea = promptEditor.querySelector('textarea');
            if (textarea && textarea.value.trim().length > 0) {
                return textarea.value.trim();
            }
        }
        
        // Fallback: try to find any textarea with substantial content
        const textareas = document.querySelectorAll('textarea');
        for (const textarea of textareas) {
            const text = textarea.value.trim();
            if (text.length > 50) { // Likely a prompt if it's substantial
                return text;
            }
        }
        
        return null;
    },
    
    async expandAllTools(toolCards) {
        const expandPromises = toolCards.map(card => {
            return new Promise((resolve) => {
                const collapsibleRoot = Context.dom.query('div[data-state]', {
                    root: card,
                    context: `${this.id}.collapsibleRoot`
                });
                
                if (!collapsibleRoot) {
                    resolve();
                    return;
                }
                
                const isCollapsed = collapsibleRoot.getAttribute('data-state') === 'closed';
                
                if (isCollapsed) {
                    const header = Context.dom.query(this.selectors.stepHeader, { root: card, context: `${this.id}.toolHeader` })
                        || Context.dom.query(this.selectors.toolHeaderFallback, { root: card, context: `${this.id}.toolHeader` });
                    
                    if (header) {
                        header.click();
                        
                        // Wait for expansion
                        const observer = new MutationObserver((mutations, obs) => {
                            if (collapsibleRoot.getAttribute('data-state') === 'open') {
                                obs.disconnect();
                                resolve();
                            }
                        });
                        
                        observer.observe(collapsibleRoot, {
                            attributes: true,
                            attributeFilter: ['data-state']
                        });
                        
                        // Timeout after 2 seconds
                        setTimeout(() => {
                            observer.disconnect();
                            resolve();
                        }, 2000);
                    } else {
                        resolve();
                    }
                } else {
                    resolve();
                }
            });
        });
        
        await Promise.all(expandPromises);
    },
    
    extractToolsData(toolCards) {
        const toolsData = [];
        
        toolCards.forEach((card, index) => {
            const toolData = {
                step: index + 1,
                name: this.getToolName(card),
                inputs: this.getToolInputs(card),
                output: this.getToolOutput(card)
            };
            
            toolsData.push(toolData);
        });
        
        return toolsData;
    },
    
    getToolName(card) {
        const byDataUi = card.getAttribute('data-ui-name');
        if (byDataUi) return byDataUi.trim();
        const header = Context.dom.query(this.selectors.stepHeader, { root: card, context: `${this.id}.toolHeader` })
            || Context.dom.query(this.selectors.toolHeaderFallback, { root: card, context: `${this.id}.toolHeader` });
        if (!header) return 'Unknown Tool';

        // Look for tool name in spans
        const spans = header.querySelectorAll('span');
        for (const span of spans) {
            const text = span.textContent.trim();
            if (text && text.length > 0 && text.length < 100) {
                // Check if parent has font-medium or similar styling
                const parent = span.parentElement;
                if (parent && (parent.classList.contains('font-medium') || parent.classList.contains('text-xs'))) {
                    return text;
                }
            }
        }
        
        return 'Unknown Tool';
    },
    
    getToolInputs(card) {
        const inputs = {};
        
        // Find the collapsible content
        const collapsibleContent = Context.dom.query('div[data-state="open"] > div[id^="radix-"][data-state="open"]', {
            root: card,
            context: `${this.id}.collapsibleContent`
        });
        
        if (!collapsibleContent) return inputs;
        
        // Look for input sections - typically have labels and values
        // Common pattern: div with label text and a value div/span
        const sections = collapsibleContent.querySelectorAll('div.px-3.pb-3 > div.space-y-3 > div');
        
        sections.forEach(section => {
            // Look for label (often in a span or div with text-sm)
            const labelElement = section.querySelector('span.text-xs, div.text-xs, label');
            if (!labelElement) return;
            
            const labelText = labelElement.textContent.trim();
            if (!labelText || labelText.length === 0) return;
            
            // Find the value - could be in various places
            let value = null;
            
            // Try to find value in next sibling or child
            const valueElement = section.querySelector('div.font-mono, div.whitespace-pre-wrap, div.text-sm, code, pre');
            if (valueElement) {
                value = valueElement.textContent.trim();
            } else {
                // Try to get text from section excluding label
                const sectionClone = section.cloneNode(true);
                const labelClone = sectionClone.querySelector('span.text-xs, div.text-xs, label');
                if (labelClone) {
                    labelClone.remove();
                }
                value = sectionClone.textContent.trim();
            }
            
            if (value && value.length > 0) {
                // Clean up label (remove colons, etc.)
                const cleanLabel = labelText.replace(/[:：]/g, '').trim();
                inputs[cleanLabel] = value;
            }
        });
        
        return inputs;
    },
    
    getToolOutput(card) {
        // Find the result area
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
        
        if (!resultSection) return null;
        
        // Find the result content
        const resultContent = resultSection.querySelector('div.p-3.rounded-md.border.font-mono');
        if (resultContent) {
            return resultContent.textContent.trim();
        }
        
        // Fallback: look for div with whitespace-pre-wrap
        const preWrapDiv = resultSection.querySelector('div.whitespace-pre-wrap');
        if (preWrapDiv) {
            return preWrapDiv.textContent.trim();
        }
        
        return null;
    },
    
    checkIntegrity(promptText, toolsData) {
        const results = [];
        const allPreviousOutputs = [promptText];
        
        toolsData.forEach(tool => {
            const toolResults = {
                step: tool.step,
                toolName: tool.name,
                issues: []
            };
            
            // Check each input
            Object.entries(tool.inputs).forEach(([param, input]) => {
                if (!input || input.trim().length === 0) {
                    return; // Skip empty inputs
                }
                
                // Search for exact match in prompt and previous outputs
                const searchText = input.trim();
                let found = false;
                let foundWithDifferentCase = false;
                let foundInStep = null;
                let foundInTool = null;
                
                // Check prompt
                if (promptText.includes(searchText)) {
                    found = true;
                } else if (promptText.toLowerCase().includes(searchText.toLowerCase())) {
                    foundWithDifferentCase = true;
                }
                
                // Check previous outputs
                for (let i = 0; i < allPreviousOutputs.length; i++) {
                    const output = allPreviousOutputs[i];
                    if (output && output.includes(searchText)) {
                        found = true;
                        if (i > 0) { // Not the prompt
                            foundInStep = toolsData[i - 1].step;
                            foundInTool = toolsData[i - 1].name;
                        }
                        break;
                    } else if (output && output.toLowerCase().includes(searchText.toLowerCase())) {
                        foundWithDifferentCase = true;
                        if (i > 0) { // Not the prompt
                            foundInStep = toolsData[i - 1].step;
                            foundInTool = toolsData[i - 1].name;
                        }
                        break;
                    }
                }
                
                // Add to issues if not found exactly (either not found at all, or found with different case)
                if (!found) {
                    toolResults.issues.push({
                        parameter: param,
                        input: input,
                        found: false,
                        foundWithDifferentCase: foundWithDifferentCase,
                        foundInStep: foundInStep,
                        foundInTool: foundInTool
                    });
                }
            });
            
            if (toolResults.issues.length > 0) {
                results.push(toolResults);
            }
            
            // Add this tool's output to previous outputs
            if (tool.output) {
                allPreviousOutputs.push(tool.output);
            }
        });
        
        return results;
    },
    
    showResultsModal(results, onClose) {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'wf-integrity-check-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        // Create modal
        const modal = document.createElement('div');
        modal.id = 'wf-integrity-check-modal';
        modal.style.cssText = `
            position: relative;
            background: var(--background, white);
            border: 1px solid var(--border, #e5e5e5);
            border-radius: 12px;
            padding: 24px;
            width: 90%;
            max-width: 800px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        `;
        
        // Build results HTML
        let resultsHTML = '';
        
        if (results.length === 0) {
            resultsHTML = '<p style="color: #22c55e; font-size: 14px; margin: 0;">✓ No issues found. All tool inputs are present in the prompt or previous tool outputs.</p>';
        } else {
            results.forEach(result => {
                let toolHTML = `<div style="margin-bottom: 20px; padding: 16px; border: 1px solid var(--border, #e5e5e5); border-radius: 8px; background: var(--card, #fafafa);">`;
                toolHTML += `<div style="font-weight: 600; font-size: 14px; margin-bottom: 12px;">Step: ${result.step}</div>`;
                toolHTML += `<div style="font-weight: 600; font-size: 14px; margin-bottom: 12px;">${result.toolName}</div>`;
                
                result.issues.forEach(issue => {
                    toolHTML += `<div style="margin-left: 16px; margin-bottom: 8px;">`;
                    toolHTML += `<div style="font-size: 13px; margin-bottom: 4px;"><strong>${issue.parameter}:</strong> ${this.escapeHtml(issue.input)}</div>`;
                    
                    if (!issue.found && !issue.foundWithDifferentCase) {
                        toolHTML += `<div style="color: #eab308; font-size: 12px; margin-left: 16px;">→ ${this.escapeHtml(issue.input)} not found in any previous output</div>`;
                    } else if (issue.foundWithDifferentCase) {
                        toolHTML += `<div style="color: #3b82f6; font-size: 12px; margin-left: 16px;">→ ${this.escapeHtml(issue.input)} found with different capitalization in step ${issue.foundInStep}, ${issue.foundInTool} output</div>`;
                    }
                    
                    toolHTML += `</div>`;
                });
                
                toolHTML += `</div>`;
                resultsHTML += toolHTML;
            });
        }
        
        modal.innerHTML = `
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px;">
                <h2 style="font-size: 18px; font-weight: 600; margin: 0;">Workflow Integrity Check</h2>
                <button id="wf-integrity-check-close" style="
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 6px;
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    transition: background 0.2s;
                    color: var(--foreground, #333);
                ">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            
            <div id="wf-integrity-check-results">
                ${resultsHTML}
            </div>
            
            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border, #e5e5e5);">
                <p style="color: #dc2626; font-size: 12px; margin: 0; font-style: italic;">
                    This tool is a simplistic helper that searches for the exact text of each tool input in previous output. If tool input was reformatted or changed in ways that do not change meaning (such as "one" in the prompt becoming "1" in a tool input), this tool will flag it. It is intended as a way to check prompt integrity, but it is by no means authoritative.
                </p>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Close handler
        const closeModal = () => {
            overlay.remove();
            if (onClose) onClose();
        };
        
        const closeBtn = modal.querySelector('#wf-integrity-check-close');
        closeBtn.addEventListener('click', closeModal);
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        });
        
        // ESC key handler
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    },
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
