// ============= request-revisions-task-only.js =============
// Thin wrapper: shared Context.requestRevisionsTaskOnly library.

const plugin = {
    id: 'requestRevisionsTaskOnly',
    name: 'Request Revisions Task-Only Issues',
    description:
        'Hides Environment and Grading on Request Revisions and auto-selects the Task issue section',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleReady: false,
        missingLogged: false,
        warnLogged: false,
        activationLogged: false
    },

    onMutation(state) {
        const api = Context.requestRevisionsTaskOnly;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};
