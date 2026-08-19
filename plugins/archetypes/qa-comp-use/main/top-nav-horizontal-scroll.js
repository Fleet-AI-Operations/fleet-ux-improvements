// ============= top-nav-horizontal-scroll.js =============
// Thin wrapper: shared Context.topNavHorizontalScroll library.

const plugin = {
    id: 'qaCompUseTopNavScroll',
    name: 'QA header compact',
    description:
        'Compacts the QA header ([data-ui="qa-header"]): hides Prompt v# and Environment/Team labels, and allows horizontal scrolling of the action-button cluster when it overflows',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        waitingActionsLogged: false,
        activationLogged: false,
        hadHeader: false,
        hadActions: false,
        styleInjected: false,
        noInnerLogged: false
    },

    onMutation(state) {
        const api = Context.topNavHorizontalScroll;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};
