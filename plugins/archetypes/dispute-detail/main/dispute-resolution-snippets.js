// ============= dispute-resolution-snippets.js =============
// Mounts shared named resolution-message toolbar under the native
// "Your Resolution" textarea on Fleet dispute-detail.

const TOOLBAR_ATTR = 'data-fleet-dispute-msg-toolbar';

const plugin = {
    id: 'disputeResolutionSnippets',
    name: 'Dispute Resolution Snippets',
    description:
        'Adds Create / Insert / Delete controls for saved resolution messages under the dispute resolution textarea',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false,
        apiMissingLogged: false,
        activationLogged: false,
        lastTextarea: null
    },

    onMutation(state) {
        const msgApi = Context.disputeResolutionMessages;
        if (!msgApi || typeof msgApi.mountToolbar !== 'function') {
            if (!state.apiMissingLogged) {
                Logger.debug('disputeResolutionSnippets: Context.disputeResolutionMessages unavailable');
                state.apiMissingLogged = true;
            }
            return;
        }
        state.apiMissingLogged = false;

        const textarea = this.findResolutionTextarea();
        if (!textarea) {
            if (state.lastTextarea) {
                state.lastTextarea = null;
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug('disputeResolutionSnippets: resolution textarea not found');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        const parent = textarea.parentNode;
        const alreadyMounted = parent
            && parent.querySelector('[' + TOOLBAR_ATTR + '="1"]');
        if (alreadyMounted && state.lastTextarea === textarea) {
            return;
        }

        const mounted = msgApi.mountToolbar({ textarea });
        if (mounted) {
            state.lastTextarea = textarea;
            if (!state.activationLogged) {
                Logger.log('disputeResolutionSnippets: resolution snippets toolbar active');
                state.activationLogged = true;
            }
        }
    },

    findResolutionPanel() {
        const candidates = document.querySelectorAll('.border-t.pt-4');
        for (const el of candidates) {
            const text = (el.textContent || '').replace(/\s+/g, ' ');
            if (/Your Resolution/i.test(text)) return el;
            if (
                text.includes('Approve Dispute')
                || text.includes('Reject Dispute')
                || text.includes('Flag as Bug')
            ) {
                return el;
            }
        }
        return null;
    },

    findResolutionTextarea() {
        const panel = this.findResolutionPanel();
        if (!panel) return null;
        // Prefer the first non-dialog textarea in the resolution panel.
        const textareas = panel.querySelectorAll('textarea');
        for (const ta of textareas) {
            if (ta.closest('div[role="dialog"]')) continue;
            return ta;
        }
        return null;
    }
};
