// ============= source-data-explorer.js =============
// Thin wrapper: shared Context.sourceDataExplorer library.

const plugin = {
    id: 'sourceDataExplorer',
    name: 'Explore GUI',
    description: 'Adds an Explore GUI control that opens the underlying environment in a new tab so you can inspect data without parsing JSON. This links to the actual instance that your tool calls are modifying. BE AWARE: if you make changes inside the instance, they will be reflected in your tool calls. Only use the tools to perform write actions, or you may run into unexpected problems when your submission is graded.',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, interceptionInstalled: false },

    onMutation(state, context) {
        const api = Context.sourceDataExplorer;
        if (!api || typeof api.run !== 'function') {
            return;
        }
        api.run(state, context, { pluginId: this.id, logTag: this.id });
    }
};
