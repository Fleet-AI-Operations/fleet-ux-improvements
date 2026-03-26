// ============= remember-layout-proportions.js =============
// Remembers the last-used split positions for the 3 main panels in QA Tool Use.
//
// Panels (from observed DOM):
// - Panel 1: task/notes (left). No stable data-ui; use structure.
// - Panel 2: [data-ui="tools-panel"]
// - Panel 3: [data-ui="workflow-panel"]
// - Outer split: left <-> right; inner split (inside right): tools <-> workflow.
//
// Approach:
// 1. Apply saved sizes ONCE when panels first appear
// 2. Watch panel elements for attribute changes and save (debounced)
// 3. Never re-apply after init - this avoids fighting React
const plugin = {
    id: 'qaToolUseLayoutProportions',
    name: 'Remember Layout Proportions',
    description: 'Persist and restore the main panel split positions on QA Tool Use pages',
    _version: '2.2',
    enabledByDefault: true,
    phase: 'init',
    initialState: {
        installed: false,
        outerApplied: false,
        innerApplied: false,
        saveTimeoutId: null
    },
    storageKeys: {
        panel1: 'qa-tool-use-panel-1-size',
        panel2: 'qa-tool-use-panel-2-size',
        panel3: 'qa-tool-use-panel-3-size'
    },
    selectors: {
        panel2: '[data-ui="tools-panel"]',
        panel3: '[data-ui="workflow-panel"]',
        // Fallback IDs from current app snapshot; may change with React/version updates.
        panel1Fallback: '[data-panel-id=":rh:"][data-panel]',
        panel2Fallback: '[data-panel-id=":rs:"][data-panel]',
        panel3Fallback: '[data-panel-id=":rv:"][data-panel]',
        outerRightFallback: '[data-panel-id=":rk:"][data-panel]'
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

            const hasOuter = panels.panel1 && panels.outerRight;
            const hasInner = panels.panel2 && panels.panel3;
            
            // Phase 1: Apply outer split immediately when outer panels are found
            if (hasOuter && !state.outerApplied) {
                Logger.log(`Outer panels found on attempt ${attempts}`);
                this.applyOuterSplit(panels);
                this.setupPanelWatchers(state, { panel1: panels.panel1 });
                state.outerApplied = true;
            }

            // Phase 2: Apply inner split when inner panels appear
            if (hasInner && !state.innerApplied) {
                Logger.log(`Inner panels found on attempt ${attempts}`);
                this.applyInnerSplit(panels);
                this.setupPanelWatchers(state, { panel2: panels.panel2, panel3: panels.panel3 });
                state.innerApplied = true;
            }

            // Log progress if panels not found yet (every 10 attempts to avoid spam)
            if ((!hasOuter || !state.outerApplied) && attempts % 10 === 0) {
                Logger.debug(`Still waiting for outer panels (attempt ${attempts}/${maxAttempts}): panel1=${!!panels.panel1}, outerRight=${!!panels.outerRight}`);
            }
            if (!hasInner && !state.innerApplied && attempts % 10 === 0) {
                Logger.debug(`Still waiting for inner panels (attempt ${attempts}/${maxAttempts}): panel2=${!!panels.panel2}, panel3=${!!panels.panel3}`);
            }

            // Continue checking if we haven't found everything yet
            if ((!hasOuter || !state.outerApplied) || (!hasInner || !state.innerApplied)) {
                if (attempts < maxAttempts) {
                    CleanupRegistry.registerTimeout(setTimeout(check, checkInterval));
                } else {
                    Logger.warn(`Remember Layout Proportions: missing panels after ${maxAttempts} attempts. panel1=${!!panels.panel1}, outerRight=${!!panels.outerRight}, panel2=${!!panels.panel2}, panel3=${!!panels.panel3}`);
                }
            }
        };

        check();
    },

    getPanels() {
        // Inner panels: stable data-ui; fallbacks use current app panel IDs.
        const panel2 = document.querySelector(this.selectors.panel2) || Context.dom.query(this.selectors.panel2Fallback, { context: `${this.id}.panel2` });
        const panel3 = document.querySelector(this.selectors.panel3) || Context.dom.query(this.selectors.panel3Fallback, { context: `${this.id}.panel3` });

        let panel1 = null;
        let outerRight = null;

        const taskDetailPanel = document.querySelector('[data-ui="qa-task-detail-panel"]');
        if (taskDetailPanel) {
            const resizablePanel = taskDetailPanel.closest('[data-panel]');
            if (resizablePanel) panel1 = resizablePanel;
        }

        if (!panel1) {
            const innerAnchor = panel2 || panel3;
            if (innerAnchor) {
                const innerGroup = innerAnchor.closest('[data-panel-group]');
                if (innerGroup) {
                    let el = innerGroup.parentElement;
                    while (el) {
                        if (el.getAttribute?.('data-panel-group') != null && el.getAttribute?.('data-panel-group-direction') === 'horizontal') {
                            const directPanels = el.querySelectorAll(':scope > [data-panel]');
                            if (directPanels.length === 2) {
                                panel1 = directPanels[0];
                                outerRight = directPanels[1];
                                break;
                            }
                        }
                        el = el.parentElement;
                    }
                }
            }
        }

        if (!panel1) panel1 = Context.dom.query(this.selectors.panel1Fallback, { context: `${this.id}.panel1` });
        if (!outerRight) outerRight = Context.dom.query(this.selectors.outerRightFallback, { context: `${this.id}.outerRight` });
        return { panel1, panel2, panel3, outerRight };
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

        // Watch only the panels that were provided
        if (panels.panel1) {
            watchPanel(panels.panel1, 'panel1');
        }
        if (panels.panel2) {
            watchPanel(panels.panel2, 'panel2');
        }
        if (panels.panel3) {
            watchPanel(panels.panel3, 'panel3');
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
        const savedPanel1 = Storage.get(this.storageKeys.panel1, null);

        if (savedPanel1 != null && panels.panel1 && panels.outerRight) {
            const outerRight = 100 - savedPanel1;

            // Log current values before applying
            const currentPanel1 = this.readPanelSize(panels.panel1);
            const currentOuterRight = this.readPanelSize(panels.outerRight);
            Logger.log(`Current outer sizes before apply: panel1=${currentPanel1}, outerRight=${currentOuterRight}`);

            panels.panel1.style.flex = `${savedPanel1} 1 0px`;
            panels.panel1.setAttribute('data-panel-size', savedPanel1.toString());

            panels.outerRight.style.flex = `${outerRight} 1 0px`;
            panels.outerRight.setAttribute('data-panel-size', outerRight.toString());

            // Verify values were set
            const appliedPanel1 = this.readPanelSize(panels.panel1);
            const appliedOuterRight = this.readPanelSize(panels.outerRight);
            Logger.log(`✓ Applied outer split: ${savedPanel1} / ${outerRight} (verified: panel1=${appliedPanel1}, outerRight=${appliedOuterRight})`);
        } else {
            Logger.log(`No saved outer split to apply (saved=${savedPanel1}, panels=${!!panels.panel1 && !!panels.outerRight})`);
        }
    },

    applyInnerSplit(panels) {
        const savedPanel2 = Storage.get(this.storageKeys.panel2, null);
        const savedPanel3 = Storage.get(this.storageKeys.panel3, null);

        // If we have both saved sizes, apply them
        if (savedPanel2 != null && savedPanel3 != null && panels.panel2 && panels.panel3) {
            // Verify they sum to approximately 100 (allow small rounding differences)
            const sum = savedPanel2 + savedPanel3;
            if (Math.abs(sum - 100) > 5) {
                Logger.warn(`Saved inner panel sizes don't sum to 100 (sum=${sum}), skipping restore`);
                return;
            }

            // Log current values before applying
            const currentPanel2 = this.readPanelSize(panels.panel2);
            const currentPanel3 = this.readPanelSize(panels.panel3);
            Logger.log(`Current inner sizes before apply: panel2=${currentPanel2}, panel3=${currentPanel3}`);

            // Apply saved sizes
            panels.panel2.style.flex = `${savedPanel2} 1 0px`;
            panels.panel2.setAttribute('data-panel-size', savedPanel2.toString());

            panels.panel3.style.flex = `${savedPanel3} 1 0px`;
            panels.panel3.setAttribute('data-panel-size', savedPanel3.toString());

            // Verify values were set
            const appliedPanel2 = this.readPanelSize(panels.panel2);
            const appliedPanel3 = this.readPanelSize(panels.panel3);
            Logger.log(`✓ Applied inner split: ${savedPanel2} / ${savedPanel3} (verified: panel2=${appliedPanel2}, panel3=${appliedPanel3})`);
        } else {
            Logger.log(`No saved inner split to apply (panel2=${savedPanel2}, panel3=${savedPanel3}, panels=${!!panels.panel2 && !!panels.panel3})`);
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
