// ============= request-revisions-screenshot-upload-improvement.js =============
// Thin wrapper: shared Context.requestRevisionsScreenshotUpload library.

const plugin = {
    id: 'requestRevisionsScreenshotUploadImprovement',
    name: 'Request Revisions Screenshot Upload Improvement',
    description:
        'Replaces Request Revisions screenshot upload with drag-drop/upload and paste-image controls; forwards files to native input',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleReady: false,
        missingLogged: false,
        injectedLogged: false,
        pasteListenerAttached: false
    },

    onMutation(state) {
        const api = Context.requestRevisionsScreenshotUpload;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};
