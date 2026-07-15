// ============= embedded-urlbar-fit.js =============
// Thin wrapper: shared Context.embeddedUrlbarFit library.

const plugin = {
    id: 'disputeDetailEmbeddedUrlbarFit',
    name: 'Dispute Detail Embedded URL Bar Fit',
    description:
        'Keeps embedded instance toolbar right-side controls visible by forcing URL segment to shrink/truncate',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, appliedLogged: false, hadToolbarRows: false },

    onMutation(state) {
        const api = Context.embeddedUrlbarFit;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};
