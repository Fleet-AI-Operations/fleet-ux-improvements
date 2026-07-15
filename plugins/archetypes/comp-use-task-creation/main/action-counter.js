// ============= action-counter.js =============
// Thin wrapper: shared Context.actionCounter library.

const plugin = {
    id: 'compUseActionCounter',
    name: 'Action Counter',
    description: 'Persistent +/- counter in the Task/Notes tab bar (right-aligned); click the number to type a value',
    _version: '1.6',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        anchorMissingLogged: false,
        tabBarMissingLogged: false,
        activationLogged: false,
        hadAnchor: false,
        migratedLegacy: false
    },

    onMutation(state) {
        const api = Context.actionCounter;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};
