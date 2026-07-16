// ============= copy-verifier-output.js =============
// Thin wrapper: shared Context.copyVerifierOutput library.

const plugin = {
    id: 'copyVerifierOutput',
    name: 'Copy Verifier Output',
    description:
        'Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text',
    _version: '4.1',
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
