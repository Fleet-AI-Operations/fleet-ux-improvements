// ============= auto-expand-verifier-section.js =============
// Session Trace Review: one programmatic click on the verifier "Score" header row
// so the collapsed details expand on load (same as a user click on that bar).

const plugin = {
    id: 'sessionTraceAutoExpandVerifier',
    name: 'Auto-expand verifier output section',
    description:
        'Expands Verifier Output on session trace pages',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        lastPath: null,
        didExpand: false,
        missingLogged: false
    },

    onMutation(state) {
        const path = typeof location !== 'undefined' ? location.pathname : '';
        if (state.lastPath !== path) {
            Logger.debug(`route changed — reset expand state`, { path });
            state.lastPath = path;
            state.didExpand = false;
            state.missingLogged = false;
        }

        if (state.didExpand) return;

        const row = this.findVerifierScoreHeaderRow();
        if (!row) {
            if (!state.missingLogged) {
                Logger.debug(`verifier score header row not found yet`);
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        row.click();
        state.didExpand = true;
        Logger.log(`programmatically expanded verifier section (score header click)`);
    },

    /** Row under Verifier Output with "Score:" — matches Session Trace DOM. */
    findVerifierScoreHeaderRow() {
        const headers = document.querySelectorAll(
            'div.text-sm.text-muted-foreground.font-medium'
        );
        let voSection = null;
        for (const h of headers) {
            if (h.textContent.trim() === 'Verifier Output') {
                voSection = h.closest('.px-3') || h.parentElement;
                break;
            }
        }
        if (!voSection) return null;

        const candidates = voSection.querySelectorAll(
            'div.flex.items-center.justify-between.text-sm.cursor-pointer.select-none'
        );
        for (const el of candidates) {
            if (el.querySelector('span.text-muted-foreground')?.textContent?.trim() === 'Score:') {
                return el;
            }
        }
        return null;
    }
};
