// ============= vnc-helper.js =============
// Thin wrapper: shared Context.vncHelper library.

const SHOW_PANEL_SUBOPTION_ID = 'show-panel';
const SHOW_PANEL_SUBOPTION = {
    id: SHOW_PANEL_SUBOPTION_ID,
    name: 'Show panel',
    description: 'When off, hides the VNC Helper modal; ⌘C/⌘V and Ctrl+Shift+C/F still work.',
    enabledByDefault: true
};

const plugin = {
    id: 'vncHelper',
    name: 'VNC Helper',
    description:
        'VNC Helper modal with prompt cache, scratchpad, and clipboard bridge for noVNC sessions',
    _version: '1.8',
    enabledByDefault: true,
    phase: 'mutation',
    subOptions: [SHOW_PANEL_SUBOPTION],
    initialState: {
        bridgeStarted: false,
        waitObserverAttached: false,
        waitObserver: null,
        minimized: false
    },

    onMutation(state) {
        const api = Context.vncHelper;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    },

    destroy(state) {
        const api = Context.vncHelper;
        if (!api || typeof api.destroy !== 'function') return;
        api.destroy(state, { pluginId: this.id });
    }
};
