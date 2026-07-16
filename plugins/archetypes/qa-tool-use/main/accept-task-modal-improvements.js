// ============= accept-task-modal-improvements.js =============
// Thin wrapper: shared Context.acceptTaskModalImprovements library.

const plugin = {
    id: 'acceptTaskModalImprovements',
    name: '"Accept Task" Modal Improvements',
    description: 'Add a button above the optional comments box to paste a positive blurb',
    _version: '1.8',
    enabledByDefault: true,
    phase: 'mutation',

    subOptions: [
        {
            id: 'motivate-worker-button',
            name: 'Motivate worker with positive comment',
            description: "Add a green button above the optional comments box that pastes a random positive blurb when clicked",
            enabledByDefault: true
        }
    ],

    initialState: {
        missingLogged: false,
        lastProcessedDialog: null,
        motivateButtonAdded: false
    },

    onMutation(state) {
        const api = Context.acceptTaskModalImprovements;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};
