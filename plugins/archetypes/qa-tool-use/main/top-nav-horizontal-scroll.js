// ============= top-nav-horizontal-scroll.js =============
// Thin wrapper: shared Context.topNavHorizontalScroll library.

const plugin = {
    id: 'qaToolUseTopNavScroll',
    name: 'QA header compact',
    description:
        'Compacts the QA header and scrolls action buttons when they overflow',
    _version: '2.2',
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
