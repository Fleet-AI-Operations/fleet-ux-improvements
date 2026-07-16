// ============= prompt-scratchpad.js =============
// Thin wrapper: shared Context.promptScratchpad library.

const plugin = {
    id: 'promptScratchpad',
    name: 'Scratchpad',
    description: 'Adds an adjustable height scratchpad to the page',
    _version: '2.3',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        scratchpadInserted: false,
        resizeHandlerAttached: false,
        searchAttempted: false,
        insertionFailedLogged: false
    },

    onMutation(state) {
        const api = Context.promptScratchpad;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            storageKey: 'comp-use-revision-scratchpad-height'
        });
    }
};
