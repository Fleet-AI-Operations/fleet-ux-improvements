// ============= qa-feedback-whitespace.js =============
// Preserves newlines and indentation in QA feedback text on dispute detail (native UI collapses whitespace).

const STYLE_ID = 'fleet-dispute-qa-feedback-whitespace-style';

const plugin = {
    id: 'disputeDetailQaFeedbackWhitespace',
    name: 'Dispute QA Feedback Whitespace',
    description: 'Preserves line breaks and spacing in QA feedback blocks on dispute detail',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        appliedLogged: false
    },

    onMutation(state) {
        this.ensureStyle();
        if (!state.appliedLogged) {
            Logger.log('Dispute QA Feedback Whitespace: stylesheet injected');
            state.appliedLogged = true;
        }
    },

    ensureStyle() {
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            style.setAttribute('data-fleet-plugin', this.id);
            document.head.appendChild(style);
        }

        style.textContent = `
            /* Muted feedback card (QA / similar): preserve author newlines */
            .rounded-lg.border.bg-muted\\/50 .space-y-2.text-sm > p,
            .rounded-lg.border.bg-muted\\/50 .space-y-2.text-sm > div,
            .rounded-lg.border.bg-muted\\/50 .space-y-2.text-sm > pre {
                white-space: pre-wrap !important;
                overflow-wrap: anywhere !important;
                word-break: break-word !important;
            }
        `;
    }
};
