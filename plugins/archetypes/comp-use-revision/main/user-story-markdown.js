// ============= user-story-markdown.js =============
// Thin wrapper: shared Context.userStoryMarkdown library.

const plugin = {
    id: 'userStoryMarkdown',
    name: 'User Story Markdown',
    description: 'Hide native User Story bodies and show markdown-rendered blue-framed replicas',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        activationLogged: false,
        missingLogged: false,
        activeByBody: null
    },

    onMutation(state) {
        const api = Context.userStoryMarkdown;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, {
            pluginId: this.id,
            logTag: this.id
        });
    }
};
