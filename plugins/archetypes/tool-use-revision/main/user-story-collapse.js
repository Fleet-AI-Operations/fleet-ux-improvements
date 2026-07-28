// ============= user-story-collapse.js =============
// Thin wrapper: shared Context.userStoryCollapse library.

const plugin = {
    id: 'userStoryCollapse',
    name: 'User Story Collapse',
    description:
        'Adds Hide/Show on the User Story row to collapse the story body below the label',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false
    },

    onMutation(state) {
        const api = Context.userStoryCollapse;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};
