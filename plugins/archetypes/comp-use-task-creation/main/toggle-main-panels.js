// ============= toggle-main-panels.js =============
// Thin wrapper: shared Context.toggleMainPanels library.

const plugin = {
    id: 'toggleMainPanels',
    name: 'Toggle Main Panels',
    description: 'Hide or unhide either main pane (task detail or environment); the other pane expands to full width',
    _version: '1.0',
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
        const api = Context.toggleMainPanels;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};
