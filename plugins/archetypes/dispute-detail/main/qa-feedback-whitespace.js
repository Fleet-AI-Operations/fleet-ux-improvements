// ============= qa-feedback-whitespace.js =============
// Preserves newlines and indentation in QA feedback text on dispute detail (native UI collapses whitespace).

const STYLE_ID = 'fleet-dispute-qa-feedback-whitespace-style';

const plugin = {
    id: 'disputeDetailQaFeedbackWhitespace',
    name: 'Dispute QA Feedback Whitespace',
    description: 'Preserves line breaks and spacing in QA feedback blocks on dispute detail',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleLogged: false,
        feedbackUiLogged: false
    },

    onMutation(state) {
        this.ensureStyle();
        if (!state.styleLogged) {
            Logger.debug(`${this.id}: whitespace stylesheet ensured in document head`);
            state.styleLogged = true;
        }
        if (!state.feedbackUiLogged) {
            const host = document.querySelector('.rounded-lg.border[class*="bg-muted"] .space-y-2.text-sm');
            if (host) {
                Logger.info(`${this.id}: QA feedback block detected — pre-wrap / line breaks active`);
                state.feedbackUiLogged = true;
            }
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
