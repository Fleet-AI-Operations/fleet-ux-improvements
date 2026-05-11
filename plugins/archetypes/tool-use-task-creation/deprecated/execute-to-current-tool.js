
// ============= execute-to-current-tool.js =============
const plugin = {
    id: 'executeToCurrentTool',
    name: 'Execute to Current Tool',
    description: 'Adds button to execute all tools from the beginning up to and including the current tool',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, panelId: null, lastToolsContainerMissingLogAt: 0 },

    selectors: {
        workflowPanel: '[data-ui="workflow-panel"]',
        workflowStepsContainer: '[data-ui="workflow-steps-container"]',
        workflowStep: '[data-ui="workflow-step"]',
        stepHeader: '[data-ui="step-header"]',
        stepExecute: '[data-ui="step-execute"]',
        toolHeaderFallback: 'div.flex.items-center.gap-3.p-3.cursor-pointer.hover\\:bg-muted\\/30',
        toolCardFallback: 'div.rounded-lg.border.transition-colors'
    },
    
    onMutation(state, context) {
        // Find workflow panel by ID (data-panel-id attribute), then semantic search
        const panel = this.findWorkflowPanel();
        if (!panel) {
            if (!state.missingLogged) {
                Logger.log('⚠ Workflow panel not found for execute-to-current-tool');
                state.missingLogged = true;
            }
            return;
        }
        
        // Track panel ID to avoid re-processing
        const currentPanelId = panel.getAttribute('data-panel-id');
        if (state.panelId === currentPanelId) {
            // Already processed this panel, but continue to check for new tools
        } else {
            state.panelId = currentPanelId;
            state.missingLogged = false;
        }
        
        const toolsContainer = this.findToolsArea(panel);
        if (!toolsContainer) {
            const now = Date.now();
            const rateLimitMs = 10000;
            if (now - state.lastToolsContainerMissingLogAt >= rateLimitMs) {
                Logger.log('⚠ Tools container not found for execute-to-current-tool');
                state.lastToolsContainerMissingLogAt = now;
            }
            return;
        }

        let toolCards = Context.dom.queryAll(this.selectors.workflowStep, { root: toolsContainer, context: `${this.id}.toolCards` });
        if (!toolCards.length) toolCards = Context.dom.queryAll(this.selectors.toolCardFallback, { root: toolsContainer, context: `${this.id}.toolCards` });
        let buttonsAdded = 0;

        toolCards.forEach(card => {
            const collapsibleRoot = Context.dom.query('div[data-state]', {
                root: card,
                context: `${this.id}.collapsibleRoot`
            });
            if (!collapsibleRoot) return;

            const header = Context.dom.query(this.selectors.stepHeader, { root: card, context: `${this.id}.toolHeader` })
                || Context.dom.query(this.selectors.toolHeaderFallback, { root: card, context: `${this.id}.toolHeader` });
            if (!header) return;

            const buttonContainer = Context.dom.query('div.flex.items-center.gap-1', {
                root: header,
                context: `${this.id}.buttonContainer`
            });
            if (!buttonContainer) return;

            let execToCurrentBtn = Context.dom.query('.wf-execute-to-current-btn', {
                root: buttonContainer,
                context: `${this.id}.execToCurrentBtn`
            });

            if (!execToCurrentBtn) {
                execToCurrentBtn = document.createElement('button');
                execToCurrentBtn.className = 'wf-execute-to-current-btn inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 transition-colors hover:bg-accent hover:text-accent-foreground rounded-sm size-7 h-7 w-7 text-muted-foreground hover:text-accent-foreground';
                execToCurrentBtn.title = 'Execute to current tool';
                execToCurrentBtn.innerHTML = `<svg width="42.24" height="31.68" viewBox="0 0 35.2 26.4" fill="none" xmlns="http://www.w3.org/2000/svg" class="stroke-current size-4"><path d="M 12.9 2.2 A 11 11 0 0 0 3.9 13.2 A 11 11 0 0 0 14.9 24.2" stroke-width="2"/><circle cx="22" cy="13.2" r="11" stroke-width="2"/><path d="M20.933 9.5172C20.5939 9.30526 20.1665 9.29404 19.8167 9.4879C19.467 9.68174 19.25 10.0501 19.25 10.45V16.05C19.25 16.4499 19.467 16.8183 19.8167 17.0121C20.1665 17.206 20.5939 17.1947 20.933 16.9828L25.333 14.1328C25.6546 13.9318 25.85 13.5793 25.85 13.2C25.85 12.8207 25.6546 12.4682 25.333 12.2672L20.933 9.5172Z" stroke-width="2" stroke-linejoin="round" fill="none"/></svg>`;
                
                execToCurrentBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this.executeToCurrentTool(card, header, toolsContainer);
                });

                buttonContainer.insertBefore(execToCurrentBtn, buttonContainer.firstChild);
                buttonsAdded++;
            }

            // Always visible, regardless of collapsed state
            execToCurrentBtn.style.display = 'inline-flex';
        });

        if (buttonsAdded > 0) {
            Logger.log(`✓ Added ${buttonsAdded} execute-to-current button(s)`);
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
    
    async executeToCurrentTool(currentCard, currentHeader, toolsContainer) {
        Logger.log('Execute to current tool triggered');
        
        let allToolCards = Context.dom.queryAll(this.selectors.workflowStep, { root: toolsContainer, context: `${this.id}.allToolCards` });
        if (!allToolCards.length) allToolCards = Context.dom.queryAll(this.selectors.toolCardFallback, { root: toolsContainer, context: `${this.id}.allToolCards` });
        
        // Find the index of the current tool
        const currentIndex = allToolCards.indexOf(currentCard);
        if (currentIndex === -1) {
            Logger.warn('Unable to find current tool in tools list');
            return;
        }
        
        // Get all tools from the beginning up to and including the current one
        const toolsToExecute = allToolCards.slice(0, currentIndex + 1);
        Logger.log(`Executing ${toolsToExecute.length} tool(s) from beginning to current tool`);
        
        // Execute each tool sequentially
        for (let i = 0; i < toolsToExecute.length; i++) {
            const card = toolsToExecute[i];
            const header = Context.dom.query(this.selectors.stepHeader, { root: card, context: `${this.id}.toolHeaderForExec` })
                || Context.dom.query(this.selectors.toolHeaderFallback, { root: card, context: `${this.id}.toolHeaderForExec` });
            
            if (!header) {
                Logger.warn(`Tool ${i + 1} header not found, skipping`);
                continue;
            }
            
            Logger.log(`Executing tool ${i + 1} of ${toolsToExecute.length}`);
            
            // Execute this tool
            const success = await this.executeTool(card, header);
            
            if (!success) {
                Logger.log(`Tool ${i + 1} execution failed, stopping`);
                return;
            }
            
            Logger.log(`Tool ${i + 1} execution completed successfully`);
        }
        
        Logger.log('All tools executed successfully');
    },
    
    async executeTool(card, header) {
        return new Promise((resolve) => {
            const collapsibleRoot = Context.dom.query('div[data-state]', {
                root: card,
                context: `${this.id}.collapsibleRoot`
            });
            if (!collapsibleRoot) {
                Logger.warn('No collapsible root found for tool execution');
                resolve(false);
                return;
            }

            const isCollapsed = collapsibleRoot.getAttribute('data-state') === 'closed';
            
            // Function to find and click execute button
            const findAndClickExecute = () => {
                let executeBtn = card.querySelector(this.selectors.stepExecute);
                if (!executeBtn) {
                    const collapsibleContent = Context.dom.query('div[data-state="open"] > div[id^="radix-"][data-state="open"]', {
                        root: card,
                        context: `${this.id}.collapsibleContent`
                    });
                    if (!collapsibleContent) return false;
                    const buttons = Context.dom.queryAll('div.px-3.pb-3.space-y-3 > button', {
                        root: collapsibleContent,
                        context: `${this.id}.executeButtons`
                    });
                    buttons.forEach(btn => {
                        const btnText = btn.textContent.trim();
                        if (btnText === 'Execute' || btnText === 'Re-execute') executeBtn = executeBtn || btn;
                    });
                }
                if (executeBtn) {
                    executeBtn.click();
                    Logger.log('Clicked execute button');
                    return true;
                }
                return false;
            };
            
            if (isCollapsed) {
                // Expand first
                header.click();
                
                const buttonObserver = new MutationObserver((mutations, obs) => {
                    if (findAndClickExecute()) {
                        obs.disconnect();
                        this.watchForToolCompletion(card, header, resolve);
                    }
                });
                
                buttonObserver.observe(card, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['hidden', 'data-state']
                });
                
                setTimeout(() => {
                    buttonObserver.disconnect();
                    if (!findAndClickExecute()) {
                        Logger.warn('Execute button not found after expanding');
                        resolve(false);
                    }
                }, 5000);
            } else {
                // Already open, just click execute
                if (findAndClickExecute()) {
                    this.watchForToolCompletion(card, header, resolve);
                } else {
                    Logger.warn('Execute button not found for open tool');
                    resolve(false);
                }
            }
        });
    },
    
    watchForToolCompletion(card, header, resolve) {
        const completionObserver = new MutationObserver((mutations, obs) => {
            const hasSuccess = card.classList.contains('border-emerald-500/50');
            const hasError = card.classList.contains('border-red-500/50');
            
            if (hasSuccess || hasError) {
                obs.disconnect();
                const success = hasSuccess && !hasError;
                Logger.log('Tool execution completed with ' + (success ? 'SUCCESS' : 'ERROR'));
                
                // Collapse if it was expanded
                const collapsibleRoot = Context.dom.query('div[data-state]', {
                    root: card,
                    context: `${this.id}.collapsibleRoot`
                });
                if (collapsibleRoot && collapsibleRoot.getAttribute('data-state') === 'open') {
                    header.click();
                    Logger.log('Collapsed tool after completion');
                }
                
                resolve(success);
            }
        });
        
        completionObserver.observe(card, { 
            attributes: true, 
            attributeFilter: ['class'] 
        });
        
        // Timeout after 60 seconds
        setTimeout(() => {
            completionObserver.disconnect();
            Logger.warn('Tool execution timeout');
            resolve(false);
        }, 60000);
    }
};
