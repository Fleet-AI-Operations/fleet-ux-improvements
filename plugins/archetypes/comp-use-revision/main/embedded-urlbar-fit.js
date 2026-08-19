// ============= embedded-urlbar-fit.js =============
// Thin wrapper: shared Context.embeddedUrlbarFit library.

const plugin = {
    id: 'compUseRevisionEmbeddedUrlbarFit',
    name: 'Computer Use Revision Embedded URL Bar Fit',
    description:
        'Keeps embedded toolbar controls visible when the URL is long',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, appliedLogged: false, hadToolbarRows: false },

    onMutation(state) {
        const api = Context.embeddedUrlbarFit;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};
