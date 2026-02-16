// ============= panel-size-memory.js =============
// Remembers the last-used split positions for the 3 main QA Tool Use containers.
//
// Panels (from observed DOM):
// - Outer split:  left (task) <-> right (inner area). No stable data-ui for outer; use structure.
// - Inner split:  [data-ui="tools-panel"] <-> [data-ui="workflow-panel"]
//
// Approach:
// 1. Apply saved sizes ONCE when panels first appear
// 2. Watch panel elements for attribute changes and save (debounced)
// 3. Never re-apply after init - this avoids fighting React
const plugin = {
    id: 'qaPanelSizeMemory',
    name: 'Panel Size Memory',
    description: 'Persist and restore the main container split positions on QA Tool Use pages',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'init',
    initialState: {
        installed: false,
        outerApplied: false,
        innerApplied: false,
        saveTimeoutId: null
    },
    storageKeys: {
        outerLeft: 'qa-panel-outer-left',
        innerTools: 'qa-panel-inner-tools'
    },
    selectors: {
        innerToolsPanel: '[data-ui="tools-panel"]',
        innerWorkflowPanel: '[data-ui="workflow-panel"]',
        outerLeftPanelFallback: '[id=":re:"][data-panel]',
        outerRightPanelFallback: '[id=":rh:"][data-panel]',
        innerToolsPanelFallback: '[id=":rp:"][data-panel]',
        innerWorkflowPanelFallback: '[id=":rs:"][data-panel]'
    },

    init(state, context) {
        if (state.installed) return;
        state.installed = true;

        // Wait for panels to appear, then apply saved sizes once and set up watchers
        this.waitForPanelsAndApply(state);

        Logger.log('✓ Panel Size Memory initialized');
    },

    waitForPanelsAndApply(state) {
        let attempts = 0;
        const maxAttempts = 150;
        const checkInterval = 100;

        const check = () => {
            attempts++;
            const panels = this.getPanels();

            const hasOuter = panels.outerLeft && panels.outerRight;
            const hasInner = panels.innerTools && panels.innerWorkflow;
            
            // Phase 1: Apply outer split immediately when outer panels are found
            if (hasOuter && !state.outerApplied) {
                Logger.log(`Outer panels found on attempt ${attempts}`);
                this.applyOuterSplit(panels);
                this.setupPanelWatchers(state, { outerLeft: panels.outerLeft });
                state.outerApplied = true;
            }

            // Phase 2: Apply inner split when inner panels appear
            if (hasInner && !state.innerApplied) {
                Logger.log(`Inner panels found on attempt ${attempts}`);
                this.applyInnerSplit(panels);
                this.setupPanelWatchers(state, { innerTools: panels.innerTools, innerWorkflow: panels.innerWorkflow });
                state.innerApplied = true;
            }

            // Log progress for inner panels if not found yet (every 10 attempts to avoid spam)
            if (!hasInner && !state.innerApplied && attempts % 10 === 0) {
                Logger.debug(`Still waiting for inner panels (attempt ${attempts}/${maxAttempts}): innerTools=${!!panels.innerTools}, innerWorkflow=${!!panels.innerWorkflow}`);
            }

            // Continue checking if we haven't found everything yet
            if ((!hasOuter || !state.outerApplied) || (!hasInner || !state.innerApplied)) {
                if (attempts < maxAttempts) {
                    CleanupRegistry.registerTimeout(setTimeout(check, checkInterval));
                } else {
                    Logger.warn(`Panel Size Memory: missing panels after ${maxAttempts} attempts. outerLeft=${!!panels.outerLeft}, outerRight=${!!panels.outerRight}, innerTools=${!!panels.innerTools}, innerWorkflow=${!!panels.innerWorkflow}`);
                }
            }
        };

        check();
    },

    getPanels() {
        const innerWorkflow = document.querySelector(this.selectors.innerWorkflowPanel) || Context.dom.query(this.selectors.innerWorkflowPanelFallback, { context: `${this.id}.innerWorkflow` });
        const innerTools = document.querySelector(this.selectors.innerToolsPanel) || Context.dom.query(this.selectors.innerToolsPanelFallback, { context: `${this.id}.innerTools` });
        let outerLeft = null;
        let outerRight = null;
        if (innerWorkflow) {
            const innerGroup = innerWorkflow.closest('[data-panel-group]');
            if (innerGroup && innerGroup.parentElement) {
                outerRight = innerGroup.parentElement;
                outerLeft = outerRight.previousElementSibling;
            }
        }
        if (!outerLeft) outerLeft = Context.dom.query(this.selectors.outerLeftPanelFallback, { context: `${this.id}.outerLeft` });
        if (!outerRight) outerRight = Context.dom.query(this.selectors.outerRightPanelFallback, { context: `${this.id}.outerRight` });
        return { outerLeft, outerRight, innerTools, innerWorkflow };
    },

    setupPanelWatchers(state, panels) {
        // Watch each panel for data-panel-size changes
        // Only watch panels that are provided (allows partial watching)
        const watchPanel = (panel, name) => {
            if (!panel) {
                Logger.warn(`Cannot watch ${name} - panel not found`);
                return;
            }
            
            const observer = new MutationObserver(() => {
                // Debounce saves
                this.scheduleSave(state);
            });
            
            CleanupRegistry.registerObserver(observer);
            observer.observe(panel, {
                attributes: true,
                attributeFilter: ['data-panel-size']
            });
            
            Logger.log(`Watching ${name} for size changes`);
        };

        // Watch only the panels that were provided
        if (panels.outerLeft) {
            watchPanel(panels.outerLeft, 'outerLeft');
        }
        if (panels.innerTools) {
            watchPanel(panels.innerTools, 'innerTools');
        }
        if (panels.innerWorkflow) {
            watchPanel(panels.innerWorkflow, 'innerWorkflow');
        }
    },

    scheduleSave(state) {
        // Debounce: wait 500ms after last change before saving
        if (state.saveTimeoutId) {
            clearTimeout(state.saveTimeoutId);
        }
        
        state.saveTimeoutId = setTimeout(() => {
            state.saveTimeoutId = null;
            this.saveCurrentSizes();
        }, 500);
    },

    applyOuterSplit(panels) {
        const savedOuterLeft = Storage.get(this.storageKeys.outerLeft, null);

        if (savedOuterLeft != null && panels.outerLeft && panels.outerRight) {
            const outerRight = 100 - savedOuterLeft;

            panels.outerLeft.style.flex = `${savedOuterLeft} 1 0px`;
            panels.outerLeft.setAttribute('data-panel-size', savedOuterLeft.toString());

            panels.outerRight.style.flex = `${outerRight} 1 0px`;
            panels.outerRight.setAttribute('data-panel-size', outerRight.toString());

            Logger.log(`✓ Applied outer split: ${savedOuterLeft} / ${outerRight}`);
        } else {
            Logger.log(`No saved outer split to apply (saved=${savedOuterLeft}, panels=${!!panels.outerLeft && !!panels.outerRight})`);
        }
    },

    applyInnerSplit(panels) {
        const savedInnerTools = Storage.get(this.storageKeys.innerTools, null);

        Logger.log(`applyInnerSplit: savedInnerTools=${savedInnerTools}, innerTools panel=${!!panels.innerTools}, innerWorkflow panel=${!!panels.innerWorkflow}`);

        if (savedInnerTools != null && panels.innerTools && panels.innerWorkflow) {
            const innerWorkflow = 100 - savedInnerTools;

            // Log current values before applying
            const currentToolsSize = this.readPanelSize(panels.innerTools);
            const currentWorkflowSize = this.readPanelSize(panels.innerWorkflow);
            Logger.log(`Current inner sizes before apply: tools=${currentToolsSize}, workflow=${currentWorkflowSize}`);

            panels.innerTools.style.flex = `${savedInnerTools} 1 0px`;
            panels.innerTools.setAttribute('data-panel-size', savedInnerTools.toString());

            panels.innerWorkflow.style.flex = `${innerWorkflow} 1 0px`;
            panels.innerWorkflow.setAttribute('data-panel-size', innerWorkflow.toString());

            // Verify values were set
            const appliedToolsSize = this.readPanelSize(panels.innerTools);
            const appliedWorkflowSize = this.readPanelSize(panels.innerWorkflow);
            Logger.log(`✓ Applied inner split: ${savedInnerTools} / ${innerWorkflow} (verified: tools=${appliedToolsSize}, workflow=${appliedWorkflowSize})`);
        } else {
            Logger.log(`No saved inner split to apply (saved=${savedInnerTools}, innerTools panel=${!!panels.innerTools}, innerWorkflow panel=${!!panels.innerWorkflow})`);
        }
    },

    saveCurrentSizes() {
        const panels = this.getPanels();
        
        const outerLeft = panels.outerLeft ? this.readPanelSize(panels.outerLeft) : null;
        const innerTools = panels.innerTools ? this.readPanelSize(panels.innerTools) : null;

        if (outerLeft != null) {
            Storage.set(this.storageKeys.outerLeft, outerLeft);
        }
        if (innerTools != null) {
            Storage.set(this.storageKeys.innerTools, innerTools);
        }

        Logger.log(`✓ Saved: outerLeft=${outerLeft}, innerTools=${innerTools} (panels: outerLeft=${!!panels.outerLeft}, innerTools=${!!panels.innerTools}, innerWorkflow=${!!panels.innerWorkflow})`);
    },

    readPanelSize(panelEl) {
        if (!panelEl) return null;

        const attr = panelEl.getAttribute('data-panel-size');
        if (attr != null && attr !== '') {
            const parsed = parseFloat(attr);
            if (Number.isFinite(parsed)) return parsed;
        }

        return null;
    }
};
