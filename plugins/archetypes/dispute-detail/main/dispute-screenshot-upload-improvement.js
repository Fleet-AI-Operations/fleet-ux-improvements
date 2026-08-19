// ============= dispute-screenshot-upload-improvement.js =============
// Finds the resolution "Add screenshots" control; chrome via Context.screenshotUpload.

const plugin = {
    id: 'disputeScreenshotUploadImprovement',
    name: 'Dispute Screenshot Upload Improvement',
    description:
        'Drag-and-drop, upload, and paste for dispute resolution screenshots',
    _version: '2.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleReady: false,
        missingLogged: false,
        injectedLogged: false,
        pasteListenerAttached: false
    },

    findNativeScreenshotControl() {
        const labels = document.querySelectorAll('label');
        for (const label of labels) {
            const input = label.querySelector('input[type="file"][accept*="image"]');
            if (!input || !input.multiple) continue;
            const span = label.querySelector('span.text-sm');
            const t = ((span && span.textContent) || '').trim().replace(/\s+/g, ' ');
            if (t.includes('Add screenshots')) {
                return { label, input };
            }
        }
        return null;
    },

    onMutation(state) {
        const api = Context.screenshotUpload;
        if (!api || typeof api.run !== 'function') return;

        const found = this.findNativeScreenshotControl();
        if (!found) {
            if (!state.missingLogged) {
                Logger.debug('native file control not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            label: found.label,
            input: found.input
        });
    }
};
