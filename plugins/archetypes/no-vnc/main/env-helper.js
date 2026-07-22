// ============= env-helper.js =============
// Thin wrapper: shared Context.envHelper library.

const SHOW_PANEL_SUBOPTION_ID = 'show-panel';
const SHOW_PANEL_SUBOPTION = {
    id: SHOW_PANEL_SUBOPTION_ID,
    name: 'Show panel',
    description: 'When off, hides the Env Helper modal.',
    enabledByDefault: true
};

const plugin = {
    id: 'envHelper',
    name: 'Env Helper',
    description: 'Env Helper modal with prompt cache and scratchpad for non-VNC env pages',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    subOptions: [SHOW_PANEL_SUBOPTION],
    initialState: {
        panelStarted: false,
        waitObserverAttached: false,
        waitObserver: null,
        minimized: false
    },

    onMutation(state) {
        const api = Context.envHelper;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    },

    destroy(state) {
        const api = Context.envHelper;
        if (!api || typeof api.destroy !== 'function') return;
        api.destroy(state, { pluginId: this.id });
    }
};
