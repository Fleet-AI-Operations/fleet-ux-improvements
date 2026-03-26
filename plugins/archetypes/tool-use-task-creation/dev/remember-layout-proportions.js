// ============= remember-layout-proportions.js =============
// Remembers the last-used split positions for the 3 main panels in Tool Use Task Creation.
//
// Panels: data-ui first, then legacy id fallback
// - Panel 1: [data-ui="prompt-panel"] (Task/Notes) - typically ~20%
// - Panel 2: [data-ui="tools-panel"] (Tools) - typically ~25%
// - Panel 3: [data-ui="workflow-panel"] (Workflow) - typically ~55%
const plugin = {
    id: 'toolUseLayoutProportions',
    name: 'Remember Layout Proportions',
    description: 'Persist and restore the main panel split positions on Tool Use Task Creation pages',
    _version: '2.1',
    enabledByDefault: false,
    phase: 'init',
    initialState: {
        installed: false,
        applied: false,
        saveTimeoutId: null
    },
    storageKeys: {
        panel1: 'tool-use-panel-1-size',
        panel2: 'tool-use-panel-2-size',
        panel3: 'tool-use-panel-3-size'
    },
    selectors: {
        panel1: '[data-ui="prompt-panel"]',
        panel2: '[data-ui="tools-panel"]',
        panel3: '[data-ui="workflow-panel"]',
        panel1Fallback: '[id=":r6:"][data-panel]',
        panel2Fallback: '[id=":rc:"][data-panel]',
        panel3Fallback: '[id=":rf:"][data-panel]'
    },

    init(state, context) {
        if (state.installed) return;
        state.installed = true;

        // Wait for panels to appear, then apply saved sizes once and set up watchers
        this.waitForPanelsAndApply(state);

        Logger.log('✓ Remember Layout Proportions initialized');
    },

    waitForPanelsAndApply(state) {
        let attempts = 0;
        const maxAttempts = 150;
        const checkInterval = 100;

        const check = () => {
            attempts++;
            const panels = this.getPanels();

            const hasAllPanels = panels.panel1 && panels.panel2 && panels.panel3;
            
            // Apply saved sizes when all panels are found
            if (hasAllPanels && !state.applied) {
                Logger.log(`All panels found on attempt ${attempts}`);
                this.applySavedSizes(panels);
                this.setupPanelWatchers(state, panels);
                state.applied = true;
            }

            // Log progress if panels not found yet (every 10 attempts to avoid spam)
            if (!hasAllPanels && !state.applied && attempts % 10 === 0) {
                Logger.debug(`Still waiting for panels (attempt ${attempts}/${maxAttempts}): panel1=${!!panels.panel1}, panel2=${!!panels.panel2}, panel3=${!!panels.panel3}`);
            }

            // Continue checking if we haven't found everything yet
            if (!hasAllPanels || !state.applied) {
                if (attempts < maxAttempts) {
                    CleanupRegistry.registerTimeout(setTimeout(check, checkInterval));
                } else {
                    Logger.warn(`Remember Layout Proportions: missing panels after ${maxAttempts} attempts. panel1=${!!panels.panel1}, panel2=${!!panels.panel2}, panel3=${!!panels.panel3}`);
                }
            }
        };

        check();
    },

    getPanels() {
        return {
            panel1: Context.dom.query(this.selectors.panel1, { context: `${this.id}.panel1` })
                || Context.dom.query(this.selectors.panel1Fallback, { context: `${this.id}.panel1` }),
            panel2: Context.dom.query(this.selectors.panel2, { context: `${this.id}.panel2` })
                || Context.dom.query(this.selectors.panel2Fallback, { context: `${this.id}.panel2` }),
            panel3: Context.dom.query(this.selectors.panel3, { context: `${this.id}.panel3` })
                || Context.dom.query(this.selectors.panel3Fallback, { context: `${this.id}.panel3` })
        };
    },

    setupPanelWatchers(state, panels) {
        // Watch each panel for data-panel-size changes
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

        watchPanel(panels.panel1, 'panel1');
        watchPanel(panels.panel2, 'panel2');
        watchPanel(panels.panel3, 'panel3');
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

    applySavedSizes(panels) {
        const savedPanel1 = Storage.get(this.storageKeys.panel1, null);
        const savedPanel2 = Storage.get(this.storageKeys.panel2, null);
        const savedPanel3 = Storage.get(this.storageKeys.panel3, null);

        // If we have all 3 saved sizes, apply them
        if (savedPanel1 != null && savedPanel2 != null && savedPanel3 != null) {
            // Verify they sum to approximately 100 (allow small rounding differences)
            const sum = savedPanel1 + savedPanel2 + savedPanel3;
            if (Math.abs(sum - 100) > 5) {
                Logger.warn(`Saved panel sizes don't sum to 100 (sum=${sum}), skipping restore`);
                return;
            }

            // Log current values before applying
            const currentPanel1 = this.readPanelSize(panels.panel1);
            const currentPanel2 = this.readPanelSize(panels.panel2);
            const currentPanel3 = this.readPanelSize(panels.panel3);
            Logger.log(`Current sizes before apply: panel1=${currentPanel1}, panel2=${currentPanel2}, panel3=${currentPanel3}`);

            // Apply saved sizes
            panels.panel1.style.flex = `${savedPanel1} 1 0px`;
            panels.panel1.setAttribute('data-panel-size', savedPanel1.toString());

            panels.panel2.style.flex = `${savedPanel2} 1 0px`;
            panels.panel2.setAttribute('data-panel-size', savedPanel2.toString());

            panels.panel3.style.flex = `${savedPanel3} 1 0px`;
            panels.panel3.setAttribute('data-panel-size', savedPanel3.toString());

            // Verify values were set
            const appliedPanel1 = this.readPanelSize(panels.panel1);
            const appliedPanel2 = this.readPanelSize(panels.panel2);
            const appliedPanel3 = this.readPanelSize(panels.panel3);
            Logger.log(`✓ Applied saved sizes: ${savedPanel1} / ${savedPanel2} / ${savedPanel3} (verified: panel1=${appliedPanel1}, panel2=${appliedPanel2}, panel3=${appliedPanel3})`);
        } else {
            Logger.log(`No saved sizes to apply (panel1=${savedPanel1}, panel2=${savedPanel2}, panel3=${savedPanel3})`);
        }
    },

    saveCurrentSizes() {
        const panels = this.getPanels();
        
        const panel1Size = panels.panel1 ? this.readPanelSize(panels.panel1) : null;
        const panel2Size = panels.panel2 ? this.readPanelSize(panels.panel2) : null;
        const panel3Size = panels.panel3 ? this.readPanelSize(panels.panel3) : null;

        if (panel1Size != null) {
            Storage.set(this.storageKeys.panel1, panel1Size);
        }
        if (panel2Size != null) {
            Storage.set(this.storageKeys.panel2, panel2Size);
        }
        if (panel3Size != null) {
            Storage.set(this.storageKeys.panel3, panel3Size);
        }

        Logger.log(`✓ Saved: panel1=${panel1Size}, panel2=${panel2Size}, panel3=${panel3Size} (panels: panel1=${!!panels.panel1}, panel2=${!!panels.panel2}, panel3=${!!panels.panel3})`);
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
