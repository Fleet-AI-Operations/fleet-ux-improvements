// ============= toggle-main-panels.js =============
// Hide/Unhide toggles in each main pane header; CSS-only collapse with mutual exclusivity.

const STYLE_ID = 'fleet-qa-toggle-main-panels';
const TOGGLE_MARKER = 'data-fleet-pane-toggle';

const plugin = {
    id: 'toggleMainPanels',
    name: 'Toggle Main Panels',
    description: 'Hide or unhide either main pane (task detail or environment); the other pane expands to full width',
    _version: '1.1',
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
        const rightToolbar = this.findPanelHeaderToolbar(panels.right, 'right');
        if (!leftToolbar || !rightToolbar) {
            if (!state.headerMissingLogged) {
                Logger.debug(
                    `${this.id}: pane header toolbar not found (left=${!!leftToolbar}, right=${!!rightToolbar})`
                );
                state.headerMissingLogged = true;
            }
            return;
        }
        state.headerMissingLogged = false;

        this.ensureToggleButton('left', state, leftToolbar);
        this.ensureToggleButton('right', state, rightToolbar);
        this.applyCollapsedState(state, panels);
        this.updateButtonLabels(state);

        if (!state.activationLogged) {
            Logger.log(`${this.id}: Hide/Unhide toggles attached to both main pane headers`);
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
            '  flex: 0 0 auto !important;',
            '  min-width: 0 !important;',
            '  max-width: 5.5rem !important;',
            '  width: auto !important;',
            '  overflow: hidden !important;',
            '}',
            '[data-panel][data-fleet-collapsed="true"] * {',
            '  display: none !important;',
            '}',
            '[data-panel][data-fleet-collapsed="true"] [data-fleet-pane-header="true"] {',
            '  display: flex !important;',
            '}',
            '[data-panel][data-fleet-collapsed="true"] [' + TOGGLE_MARKER + '="true"] {',
            '  display: inline-flex !important;',
            '}',
            '[data-panel-group][data-fleet-has-collapsed] > [data-panel]:not([data-fleet-collapsed="true"]) {',
            '  flex: 1 1 100% !important;',
            '  max-width: 100% !important;',
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

    ensureToggleButton(side, state, toolbar) {
        const header = toolbar.closest('div.h-9.border-b');
        if (header) {
            header.setAttribute('data-fleet-pane-header', 'true');
        }

        let btn = toolbar.querySelector('[' + TOGGLE_MARKER + '="true"][data-fleet-pane="' + side + '"]');
        if (btn && btn.getAttribute('data-fleet-plugin') !== this.id) {
            btn.remove();
            btn = null;
        }
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute(TOGGLE_MARKER, 'true');
            btn.setAttribute('data-fleet-pane', side);
            btn.setAttribute('data-fleet-plugin', this.id);
            btn.setAttribute('data-slot', 'button');
            btn.className =
                'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 transition-colors hover:bg-accent hover:text-accent-foreground h-7 text-xs pl-2 pr-2 py-1 text-muted-foreground shrink-0';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.onToggleClick(side, state);
            });
            toolbar.appendChild(btn);
        }
    },

    onToggleClick(side, state) {
        const prev = state.hiddenPane;
        if (state.hiddenPane === side) {
            state.hiddenPane = null;
            Logger.log(`${this.id}: shown both`);
        } else {
            state.hiddenPane = side;
            if (prev && prev !== side) {
                Logger.log(`${this.id}: hidden ${side} (replaced ${prev})`);
            } else {
                Logger.log(`${this.id}: hidden ${side}`);
            }
        }
        const panels = this.getPanels();
        this.applyCollapsedState(state, panels);
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

        if (state.hiddenPane === 'left' && left) {
            left.setAttribute('data-fleet-collapsed', 'true');
        } else if (state.hiddenPane === 'right' && right) {
            right.setAttribute('data-fleet-collapsed', 'true');
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
            const side = btn.getAttribute('data-fleet-pane');
            const collapsed = state.hiddenPane === side;
            btn.textContent = collapsed ? 'Unhide' : 'Hide';
            btn.title = collapsed
                ? 'Show the ' + (side === 'left' ? 'task detail' : 'environment') + ' pane'
                : 'Hide the ' + (side === 'left' ? 'task detail' : 'environment') + ' pane';
        });
    }
};
