// ============= request-revisions.js =============
// Thin wrapper: shared Context.requestRevisions library.

const plugin = {
    id: 'requestRevisions',
    name: '"Request Revisions" Modal Improvements',
    description:
        'Guidelines, copy actions, task-only issue selection, and screenshot upload on Request Revisions',
    _version: '8.0',
    enabledByDefault: true,
    phase: 'mutation',

    subOptions: [
        {
            id: 'copy-prompt-button',
            name: 'Copy Prompt button',
            enabledByDefault: true
        },
        {
            id: 'copy-verifier-output-button',
            name: 'Copy Verifier Output button',
            enabledByDefault: true
        },
        {
            id: 'copy-link-general-guidelines',
            name: 'General Guidelines',
            enabledByDefault: true
        },
        {
            id: 'copy-link-tool-use-guidelines',
            name: 'Tool Use Guidelines',
            enabledByDefault: true
        },
        {
            id: 'copy-link-qa-guidelines',
            name: 'QA Guidelines',
            enabledByDefault: true
        },
        {
            id: 'copy-link-time-submission-guidelines',
            name: 'Time Submission Guidelines',
            enabledByDefault: true
        },
        {
            id: 'task-only-issues',
            name: 'Task-only issues',
            enabledByDefault: true
        },
        {
            id: 'screenshot-upload-improvement',
            name: 'Screenshot upload improvement',
            enabledByDefault: true
        }
    ],

    initialState: {
        missingLogged: false,
        warnLogged: false,
        activationLogged: false,
        taskOnlyStyleReady: false,
        screenshotStyleReady: false,
        screenshotMissingLogged: false,
        injectedLogged: false,
        pasteListenerAttached: false,
        promptText: null,
        verifierOutput: null,
        verifierObserver: null,
        verifierElement: null,
        verifierChangeObserver: null,
        verifierWatchEligibleAt: undefined,
        promptQualityRating: null,
        lastSig: 0
    },

    onMutation(state) {
        const api = Context.requestRevisions;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};
