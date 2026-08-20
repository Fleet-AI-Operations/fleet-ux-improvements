// ============= copy-verifier-output.js =============
// Thin wrapper: shared Context.copyVerifierOutput library.

const plugin = {
    id: 'copyVerifierOutput',
    name: 'Copy Verifier Output',
    description:
        'Copy buttons for Stdout, Score, and expanded Raw Output',
    _version: '4.2',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        buttonAdded: false,
        verifierTargetMissingLogged: false
    },

    onMutation(state, context) {
        const api = Context.copyVerifierOutput;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};
