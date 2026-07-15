// ============= top-nav-horizontal-scroll.js =============
// Thin wrapper: shared Context.topNavHorizontalScroll library.

const plugin = {
    id: 'qaCompUseTopNavScroll',
    name: 'Top nav horizontal scroll',
    description:
        'Allows horizontal scrolling on the QA header ([data-ui="qa-header"]) when action buttons exceed the viewport width',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false,
        hadHeader: false,
        styleInjected: false
    },

    onMutation(state) {
        const api = Context.topNavHorizontalScroll;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};
