// ============= toggle-main-panels.js =============
// Hide/Unhide toggle in the task detail pane header; CSS-only collapse expands the environment pane.

const STYLE_ID = 'fleet-qa-toggle-main-panels';
const TOGGLE_MARKER = 'data-fleet-pane-toggle';
const SLIVER_MARKER = 'data-fleet-pane-sliver';
const COLLAPSED_STRIP_WIDTH = '2.75rem';
const TOGGLE_SIDE = 'left';

const plugin = {
    id: 'toggleMainPanels',
    name: 'Toggle Main Panels',
    description: 'Hide or unhide the task detail pane; the environment pane expands to full width',
    _version: '1.5',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        styleInjected: false,
        missingLogged: false,
        headerMissingLogged: false,
        activationLogged: false,
        hiddenPane: null
    },

    onMutation(state) {
        this.ensureStyle(state);

        const panels = this.getPanels();
        if (!panels.left || !panels.right) {
            if (state.hiddenPane) {
                state.hiddenPane = null;
                this.clearCollapsedMarkers(panels);
            }
            if (!state.missingLogged) {
                Logger.debug(`${this.id}: main panels not found yet`);
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const leftToolbar = this.findPanelHeaderToolbar(panels.left, 'left');
        if (!leftToolbar) {
            if (!state.headerMissingLogged) {
                Logger.debug(`${this.id}: task detail pane header toolbar not found`);
                state.headerMissingLogged = true;
            }
            return;
        }
        state.headerMissingLogged = false;

        if (state.hiddenPane === 'right') {
            state.hiddenPane = null;
            this.clearCollapsedMarkers(panels);
        }

        this.removeToggleButton(panels.right, 'right');
        this.ensureToggleButton(state, leftToolbar);
        this.applyCollapsedState(state, panels);
        this.relocateToggleButton(state, panels);
        this.updateButtonLabels(state);

        if (!state.activationLogged) {
            Logger.log(`${this.id}: Hide/Unhide toggle attached to task detail pane header`);
            state.activationLogged = true;
        }
    },

    getPanels() {
        const taskDetail = document.querySelector('[data-ui="qa-task-detail-panel"]');
        if (!taskDetail) {
            return { left: null, right: null, group: null };
        }

        const left = taskDetail.matches('[data-panel]') ? taskDetail : taskDetail.closest('[data-panel]');
        if (!left || !left.parentElement) {
            return { left: null, right: null, group: null };
        }

        const group =
            left.closest('[data-ui="qa-task-card"]') ||
            left.closest('[data-panel-group][data-panel-group-direction="horizontal"]') ||
            left.parentElement;

        let right = null;
        for (const child of group.children) {
            if (child !== left && child.hasAttribute('data-panel')) {
                right = child;
                break;
            }
        }

        if (!right) {
            const instanceTab = document.querySelector('[data-ui="qa-instance-tab"]');
            if (instanceTab && group.contains(instanceTab)) {
                for (const child of group.children) {
                    if (child !== left && child.hasAttribute('data-panel') && child.contains(instanceTab)) {
                        right = child;
                        break;
                    }
                }
            }
        }

        return { left, right, group };
    },

    findPanelHeaderToolbar(panel, side) {
        if (!panel) {
            return null;
        }

        let header = null;
        if (side === 'right') {
            const tab = panel.querySelector('[data-ui="qa-instance-tab"], [data-ui="qa-verifier-tab"]');
            header = tab ? tab.closest('div.h-9.border-b') : null;
        }
        if (!header) {
            header = panel.querySelector('div.h-9.border-b');
        }
        if (!header) {
            return null;
        }

        const rows = header.querySelectorAll('div.flex');
        for (const row of rows) {
            if (row.classList.contains('items-center') && row.classList.contains('justify-between')) {
                return row;
            }
        }

        return (
            header.querySelector('div.flex.items-center.justify-between') ||
            header.querySelector('div.flex.w-full.items-center.justify-between') ||
            header.querySelector('div.flex.items-center.justify-between.w-full') ||
            header.querySelector('div.flex.w-full.items-center') ||
            header.querySelector('div.flex.items-center')
        );
    },

    ensureStyle(state) {
        if (state.styleInjected || document.getElementById(STYLE_ID)) {
            state.styleInjected = true;
            return;
        }
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.setAttribute('data-fleet-plugin', this.id);
        style.textContent = [
            '[data-panel][data-fleet-collapsed="true"] {',
            '  flex: 0 0 ' + COLLAPSED_STRIP_WIDTH + ' !important;',
            '  min-width: ' + COLLAPSED_STRIP_WIDTH + ' !important;',
            '  max-width: ' + COLLAPSED_STRIP_WIDTH + ' !important;',
            '  width: ' + COLLAPSED_STRIP_WIDTH + ' !important;',
            '  overflow: hidden !important;',
            '}',
            '[data-panel][data-fleet-collapsed="true"] > *:not([' + SLIVER_MARKER + '="true"]) {',
            '  display: none !important;',
            '}',
            '[' + SLIVER_MARKER + '="true"] {',
            '  display: none;',
            '}',
            '[data-panel][data-fleet-collapsed="true"] > [' + SLIVER_MARKER + '="true"] {',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '  align-items: center !important;',
            '  justify-content: flex-start !important;',
            '  width: 100% !important;',
            '  height: 100% !important;',
            '  min-height: 100% !important;',
            '  padding: 0.35rem 0.15rem !important;',
            '  box-sizing: border-box !important;',
            '  background: var(--background, #fff) !important;',
            '  border-right: 1px solid var(--border, #e5e5e5) !important;',
            '}',
            '[data-panel][data-fleet-collapsed="true"] [' + SLIVER_MARKER + '="true"] [' + TOGGLE_MARKER + '="true"] {',
            '  writing-mode: vertical-rl !important;',
            '  text-orientation: mixed !important;',
            '  white-space: nowrap !important;',
            '  height: auto !important;',
            '  min-height: 3.5rem !important;',
            '  padding: 0.5rem 0.25rem !important;',
            '}',
            '[data-panel-group][data-fleet-has-collapsed] > [data-panel]:not([data-fleet-collapsed="true"]) {',
            '  flex: 1 1 auto !important;',
            '  min-width: 0 !important;',
            '  max-width: none !important;',
            '}',
            '[data-panel-group][data-fleet-has-collapsed] > [data-resize-handle][data-panel-group-direction="horizontal"] {',
            '  display: none !important;',
            '  flex: 0 0 0 !important;',
            '  width: 0 !important;',
            '  min-width: 0 !important;',
            '  overflow: hidden !important;',
            '  pointer-events: none !important;',
            '}'
        ].join('\n');
        document.head.appendChild(style);
        CleanupRegistry.registerElement(style);
        state.styleInjected = true;
    },

    findToggleButton(panel, side) {
        if (!panel) {
            return null;
        }
        return panel.querySelector(
            '[' + TOGGLE_MARKER + '="true"][data-fleet-pane="' + side + '"][data-fleet-plugin="' + this.id + '"]'
        );
    },

    removeToggleButton(panel, side) {
        const btn = this.findToggleButton(panel, side);
        if (btn) {
            btn.remove();
        }
        if (!panel) {
            return;
        }
        const sliver = panel.querySelector('[' + SLIVER_MARKER + '="true"][data-fleet-plugin="' + this.id + '"]');
        if (sliver && !sliver.querySelector('[' + TOGGLE_MARKER + '="true"]')) {
            sliver.remove();
        }
    },

    ensureToggleButton(state, toolbar) {
        const header = toolbar.closest('div.h-9.border-b');
        if (header) {
            header.setAttribute('data-fleet-pane-header', 'true');
        }

        let btn = toolbar.querySelector(
            '[' + TOGGLE_MARKER + '="true"][data-fleet-pane="' + TOGGLE_SIDE + '"][data-fleet-plugin="' + this.id + '"]'
        );
        if (btn && btn.getAttribute('data-fleet-plugin') !== this.id) {
            btn.remove();
            btn = null;
        }
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute(TOGGLE_MARKER, 'true');
            btn.setAttribute('data-fleet-pane', TOGGLE_SIDE);
            btn.setAttribute('data-fleet-plugin', this.id);
            btn.setAttribute('data-slot', 'button');
            btn.className =
                'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 transition-colors hover:bg-accent hover:text-accent-foreground h-7 text-xs pl-2 pr-2 py-1 text-muted-foreground shrink-0';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.onToggleClick(state);
            });
        }

        btn._fleetToolbar = toolbar;
        if (btn.parentElement !== toolbar || btn !== toolbar.lastElementChild) {
            toolbar.appendChild(btn);
        }
    },

    ensureCollapseSliver(panel) {
        let sliver = panel.querySelector('[' + SLIVER_MARKER + '="true"]');
        if (!sliver) {
            sliver = document.createElement('div');
            sliver.setAttribute(SLIVER_MARKER, 'true');
            sliver.setAttribute('data-fleet-plugin', this.id);
            panel.insertBefore(sliver, panel.firstChild);
        }
        return sliver;
    },

    relocateToggleButton(state, panels) {
        const panel = panels.left;
        if (!panel) {
            return;
        }

        const btn = this.findToggleButton(panel, TOGGLE_SIDE);
        if (!btn) {
            return;
        }

        const collapsed = state.hiddenPane === TOGGLE_SIDE;
        const sliver = panel.querySelector('[' + SLIVER_MARKER + '="true"]');

        if (collapsed) {
            const targetSliver = this.ensureCollapseSliver(panel);
            if (btn.parentElement !== targetSliver) {
                targetSliver.appendChild(btn);
            }
        } else if (btn._fleetToolbar && btn.parentElement !== btn._fleetToolbar) {
            btn._fleetToolbar.appendChild(btn);
        }

        if (!collapsed && sliver && !sliver.contains(btn)) {
            sliver.remove();
        }
    },

    onToggleClick(state) {
        if (state.hiddenPane === TOGGLE_SIDE) {
            state.hiddenPane = null;
            Logger.log(`${this.id}: shown both`);
        } else {
            state.hiddenPane = TOGGLE_SIDE;
            Logger.log(`${this.id}: hidden task detail pane`);
        }
        const panels = this.getPanels();
        this.applyCollapsedState(state, panels);
        this.relocateToggleButton(state, panels);
        this.updateButtonLabels(state);
    },

    applyCollapsedState(state, panels) {
        const left = panels.left;
        const right = panels.right;
        const group = panels.group;

        if (left) {
            left.removeAttribute('data-fleet-collapsed');
        }
        if (right) {
            right.removeAttribute('data-fleet-collapsed');
        }

        if (state.hiddenPane === TOGGLE_SIDE && left) {
            left.setAttribute('data-fleet-collapsed', 'true');
        }

        if (group) {
            if (state.hiddenPane) {
                group.setAttribute('data-fleet-has-collapsed', 'true');
            } else {
                group.removeAttribute('data-fleet-has-collapsed');
            }
        }
    },

    clearCollapsedMarkers(panels) {
        if (panels.left) {
            panels.left.removeAttribute('data-fleet-collapsed');
        }
        if (panels.right) {
            panels.right.removeAttribute('data-fleet-collapsed');
        }
        if (panels.group) {
            panels.group.removeAttribute('data-fleet-has-collapsed');
        }
    },

    updateButtonLabels(state) {
        document.querySelectorAll('[' + TOGGLE_MARKER + '="true"][data-fleet-plugin="' + this.id + '"]').forEach((btn) => {
            const collapsed = state.hiddenPane === TOGGLE_SIDE;
            btn.textContent = collapsed ? 'Unhide' : 'Hide';
            btn.title = collapsed ? 'Show the task detail pane' : 'Hide the task detail pane';
        });
    }
};
