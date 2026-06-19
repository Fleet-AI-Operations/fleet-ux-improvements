// ============= show-verifier-on-run.js =============
// When the verifier is running ("Running Verifier..." in the QA header), clicks "Show Grading"
// so verifier output stays visible while the grading panel is hidden by default.

const plugin = {
    id: 'showVerifierOnRun',
    name: 'Show Verifier On Run',
    description:
        'Automatically clicks "Show Grading" when the verifier runs if the grading panel is hidden; no-op when already visible.',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        verifierRunning: false,
        showClickedForRun: false,
        runStartLogged: false,
        showGradingMissingLogged: false,
        showGradingNotClickableLogged: false,
        gradingVisibleLogged: false
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
            state.showGradingMissingLogged = false;
            state.showGradingNotClickableLogged = false;
            state.gradingVisibleLogged = false;
            return;
        }

        if (!state.verifierRunning) {
            state.verifierRunning = true;
            state.showClickedForRun = false;
            state.showGradingMissingLogged = false;
            state.showGradingNotClickableLogged = false;
            state.gradingVisibleLogged = false;
            if (!state.runStartLogged) {
                state.runStartLogged = true;
                Logger.log(`${this.id}: verifier run detected — will show grading panel`);
            }
        }

        if (state.showClickedForRun) {
            return;
        }

        if (this.isGradingPanelVisible()) {
            state.showClickedForRun = true;
            if (!state.gradingVisibleLogged) {
                state.gradingVisibleLogged = true;
                Logger.debug(`${this.id}: grading panel already visible (Hide Grading present)`);
            }
            return;
        }

        const button = this.findShowGradingButton();
        if (!button) {
            if (!state.showGradingMissingLogged) {
                Logger.debug(`${this.id}: "Show Grading" button not found yet`);
                state.showGradingMissingLogged = true;
            }
            return;
        }

        if (!this.isButtonClickable(button)) {
            if (!state.showGradingNotClickableLogged) {
                Logger.debug(`${this.id}: "Show Grading" not clickable yet`);
                state.showGradingNotClickableLogged = true;
            }
            return;
        }

        try {
            button.click();
            state.showClickedForRun = true;
            Logger.log(`${this.id}: clicked "Show Grading"`);
        } catch (error) {
            Logger.error(`${this.id}: failed to click "Show Grading"`, error);
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

    findGradingToggleButton(label) {
        const options = { context: `${this.id}.findGradingToggleButton` };
        const buttons =
            typeof Context !== 'undefined' && Context.dom
                ? Context.dom.queryAll('button', options)
                : Array.from(document.querySelectorAll('button'));

        for (const btn of buttons) {
            if (btn.hasAttribute('data-fleet-pane-toggle')) {
                continue;
            }
            const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
            if (text === label) {
                return btn;
            }
        }
        return null;
    },

    isGradingPanelVisible() {
        return Boolean(this.findGradingToggleButton('Hide Grading'));
    },

    findShowGradingButton() {
        return this.findGradingToggleButton('Show Grading');
    },

    isButtonClickable(button) {
        if (button.disabled) return false;
        if (button.getAttribute('aria-disabled') === 'true') return false;
        return true;
    }
};
