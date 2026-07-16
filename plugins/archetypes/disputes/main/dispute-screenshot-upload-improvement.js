// ============= dispute-screenshot-upload-improvement.js =============
// Thin wrapper: shared Context.disputeScreenshotUpload library.

const plugin = {
    id: 'disputeScreenshotUploadImprovement',
    name: 'Dispute Screenshot Upload Improvement',
    description:
        'Replaces the resolution screenshot control with drag-drop/upload and paste-image controls; forwards files to the native input',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleReady: false,
        missingLogged: false,
        injectedLogged: false,
        pasteListenerAttached: false
    },

    onMutation(state) {
        const api = Context.disputeScreenshotUpload;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id });
    }
};
