// ============= prompt-text-counter.js =============
// Thin wrapper: shared Context.promptTextCounter library.

const plugin = {
    id: 'promptTextCounter',
    name: 'Prompt Text Counter',
    description: 'Shows a live word and character count below the prompt',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, activationLogged: false, boundTextarea: null },

    onMutation(state) {
        const api = Context.promptTextCounter;
        if (!api || typeof api.run !== 'function') {
            return;
        }
        api.run(state, { logTag: this.id, pluginId: this.id });
    }
};
