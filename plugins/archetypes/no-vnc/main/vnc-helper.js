// ============= vnc-helper.js =============
// Thin wrapper: shared Context.vncHelper library.

const SHOW_PANEL_SUBOPTION_ID = 'show-panel';
const FORCE_DARK_SUBOPTION_ID = 'force-dark-mode';
const SHOW_PANEL_SUBOPTION = {
    id: SHOW_PANEL_SUBOPTION_ID,
    name: 'Show panel',
    description: 'When off, hides the External VNC Helper modal; ⌘C/⌘V and Ctrl+Shift+C/F still work.',
    enabledByDefault: true
};
const FORCE_DARK_SUBOPTION = {
    id: FORCE_DARK_SUBOPTION_ID,
    name: 'Force dark mode',
    description: 'When off, helper chrome stays light. When on, helper chrome stays dark.',
    enabledByDefault: false
};

const plugin = {
    id: 'vncHelper',
    name: 'External VNC Helper',
    description:
        'External VNC Helper modal with prompt cache, scratchpad, and clipboard bridge for noVNC sessions',
    _version: '1.11',
    enabledByDefault: true,
    phase: 'mutation',
    subOptions: [SHOW_PANEL_SUBOPTION, FORCE_DARK_SUBOPTION],
    initialState: {
        bridgeStarted: false,
        waitObserverAttached: false,
        waitObserver: null,
        minimized: true
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
