// ============= remember-layout-proportions.js =============
// Remembers the last-used split between the two main panes on comp-use (QA) pages.
//
// Panels (from observed DOM):
// - Left: [data-ui="qa-task-detail-panel"] (task detail); resizable wrapper has data-panel / data-panel-size.
// - Right: second direct [data-panel] child of the horizontal [data-ui="qa-task-card"] group.
//
// Approach:
// 1. Apply saved left % ONCE when both panels first appear
// 2. Watch both panel elements for data-panel-size changes and save (debounced)
// 3. Never re-apply after init - this avoids fighting React
const plugin = {
    id: 'qaCompUseLayoutProportions',
    name: 'Remember Layout Proportions',
    description: 'Persist and restore the main pane split (task detail vs instance) on comp-use QA pages',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'init',
    initialState: {
        installed: false,
        applied: false,
        saveTimeoutId: null
    },
    storageKeys: {
        leftPane: 'qa-comp-use-main-pane-size'
    },

    init(state, context) {
        if (state.installed) return;
        state.installed = true;

        this.waitForPanelsAndApply(state);

        Logger.log('✓ Remember Layout Proportions (comp-use) initialized');
    },

    waitForPanelsAndApply(state) {
        let attempts = 0;
        const maxAttempts = 150;
        const checkInterval = 100;

        const check = () => {
            attempts++;
            const panels = this.getPanels();

            const hasBoth = panels.left && panels.right;

            if (hasBoth && !state.applied) {
                Logger.log(`Panels found on attempt ${attempts}`);
                this.applySavedSizes(panels);
                this.setupPanelWatchers(state, panels);
                state.applied = true;
            }

            if (!hasBoth && !state.applied && attempts % 10 === 0) {
                Logger.debug(`Still waiting for panels (attempt ${attempts}/${maxAttempts}): left=${!!panels.left}, right=${!!panels.right}`);
            }

            if (!hasBoth || !state.applied) {
                if (attempts < maxAttempts) {
                    CleanupRegistry.registerTimeout(setTimeout(check, checkInterval));
                } else {
                    Logger.warn(`Remember Layout Proportions (comp-use): missing panels after ${maxAttempts} attempts. left=${!!panels.left}, right=${!!panels.right}`);
                }
            }
        };

        check();
    },

    getPanels() {
        const taskCard = document.querySelector('[data-ui="qa-task-card"]');
        let group = taskCard || null;

        if (!group) {
            const horizontalGroups = document.querySelectorAll('[data-panel-group][data-panel-group-direction="horizontal"]');
            for (const g of horizontalGroups) {
                const direct = g.querySelectorAll(':scope > [data-panel]');
                if (direct.length === 2) {
                    group = g;
                    break;
                }
            }
        }

        if (!group) {
            return { left: null, right: null };
        }

        const directPanels = group.querySelectorAll(':scope > [data-panel]');
        if (directPanels.length < 2) {
            return { left: null, right: null };
        }

        const taskDetail = document.querySelector('[data-ui="qa-task-detail-panel"]');
        const left = (taskDetail && taskDetail.closest('[data-panel]')) || directPanels[0];
        const right = left === directPanels[0] ? directPanels[1] : directPanels[0];

        return { left, right };
    },

    setupPanelWatchers(state, panels) {
        const watchPanel = (panel, name) => {
            if (!panel) {
                Logger.warn(`Cannot watch ${name} - panel not found`);
                return;
            }
            const observer = new MutationObserver(() => {
                this.scheduleSave(state);
            });
            CleanupRegistry.registerObserver(observer);
            observer.observe(panel, {
                attributes: true,
                attributeFilter: ['data-panel-size']
            });
            Logger.log(`Watching ${name} for size changes`);
        };

        watchPanel(panels.left, 'left');
        watchPanel(panels.right, 'right');
    },

    scheduleSave(state) {
        if (state.saveTimeoutId) {
            clearTimeout(state.saveTimeoutId);
        }
        state.saveTimeoutId = setTimeout(() => {
            state.saveTimeoutId = null;
            this.saveCurrentSizes();
        }, 500);
    },

    applySavedSizes(panels) {
        const savedLeft = Storage.get(this.storageKeys.leftPane, null);

        if (savedLeft == null || !panels.left || !panels.right) {
            Logger.log(`No saved split to apply (savedLeft=${savedLeft}, left=${!!panels.left}, right=${!!panels.right})`);
            return;
        }

        const clamped = Math.min(90, Math.max(10, savedLeft));
        const rightVal = 100 - clamped;

        const currentLeft = this.readPanelSize(panels.left);
        const currentRight = this.readPanelSize(panels.right);
        Logger.log(`Current sizes before apply: left=${currentLeft}, right=${currentRight}`);

        panels.left.style.flex = `${clamped} 1 0px`;
        panels.left.setAttribute('data-panel-size', clamped.toString());
        panels.right.style.flex = `${rightVal} 1 0px`;
        panels.right.setAttribute('data-panel-size', rightVal.toString());

        const appliedLeft = this.readPanelSize(panels.left);
        const appliedRight = this.readPanelSize(panels.right);
        Logger.log(`✓ Applied split: ${clamped} / ${rightVal} (verified: left=${appliedLeft}, right=${appliedRight})`);
    },

    saveCurrentSizes() {
        const panels = this.getPanels();
        const leftSize = panels.left ? this.readPanelSize(panels.left) : null;

        if (leftSize != null) {
            Storage.set(this.storageKeys.leftPane, leftSize);
        }
        Logger.log(`✓ Saved left pane: ${leftSize} (panels: left=${!!panels.left}, right=${!!panels.right})`);
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
