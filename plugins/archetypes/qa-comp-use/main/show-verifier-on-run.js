// ============= show-verifier-on-run.js =============
// When the verifier is running ("Running Verifier..." in the QA header), clicks "Show Verifier"
// so verifier output stays visible while hidden by default.

const plugin = {
    id: 'showVerifierOnRun',
    name: 'Show Verifier On Run',
    description:
        'Automatically clicks "Show Verifier" when the verifier starts running so output is visible.',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        verifierRunning: false,
        showClickedForRun: false,
        runStartLogged: false,
        showVerifierMissingLogged: false,
        showVerifierNotClickableLogged: false
    },

    onMutation(state) {
        const running = this.isVerifierRunning();
        if (!running) {
            if (state.verifierRunning) {
                Logger.debug(`${this.id}: verifier run ended`);
            }
            state.verifierRunning = false;
            state.showClickedForRun = false;
            state.runStartLogged = false;
            state.showVerifierMissingLogged = false;
            state.showVerifierNotClickableLogged = false;
            return;
        }

        if (!state.verifierRunning) {
            state.verifierRunning = true;
            state.showClickedForRun = false;
            state.showVerifierMissingLogged = false;
            state.showVerifierNotClickableLogged = false;
            if (!state.runStartLogged) {
                state.runStartLogged = true;
                Logger.log(`${this.id}: verifier run detected — will show verifier panel`);
            }
        }

        if (state.showClickedForRun) {
            return;
        }

        const button = this.findShowVerifierButton();
        if (!button) {
            if (!state.showVerifierMissingLogged) {
                Logger.debug(`${this.id}: "Show Verifier" button not found yet`);
                state.showVerifierMissingLogged = true;
            }
            return;
        }

        if (!this.isButtonClickable(button)) {
            if (!state.showVerifierNotClickableLogged) {
                Logger.debug(`${this.id}: "Show Verifier" not clickable yet`);
                state.showVerifierNotClickableLogged = true;
            }
            return;
        }

        try {
            button.click();
            state.showClickedForRun = true;
            Logger.log(`${this.id}: clicked "Show Verifier"`);
        } catch (error) {
            Logger.error(`${this.id}: failed to click "Show Verifier"`, error);
        }
    },

    isVerifierRunning() {
        const root =
            document.querySelector('[data-ui="qa-header"]') || document.body;
        const options = { context: `${this.id}.isVerifierRunning` };
        const nodes =
            typeof Context !== 'undefined' && Context.dom
                ? Context.dom.queryAll('button, span', { ...options, root })
                : Array.from(root.querySelectorAll('button, span'));

        for (const node of nodes) {
            const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
            if (text === 'Running Verifier...' || text.startsWith('Running Verifier')) {
                return true;
            }
        }
        return false;
    },

    findShowVerifierButton() {
        const options = { context: `${this.id}.findShowVerifierButton` };
        const buttons =
            typeof Context !== 'undefined' && Context.dom
                ? Context.dom.queryAll('button', options)
                : Array.from(document.querySelectorAll('button'));

        for (const btn of buttons) {
            const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
            if (text === 'Show Verifier') {
                return btn;
            }
        }
        return null;
    },

    isButtonClickable(button) {
        if (button.disabled) return false;
        if (button.getAttribute('aria-disabled') === 'true') return false;
        return true;
    }
};
