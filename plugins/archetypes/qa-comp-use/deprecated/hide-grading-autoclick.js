
// ============= hide-grading-autoclick.js =============
// Clicks "Hide Grading" once when the control is present and clickable (not disabled).

const plugin = {
    id: 'hideGradingAutoclick',
    name: 'Hide Grading Autoclick',
    description:
        'Automatically clicks the "Hide Grading" button once when it becomes available after load.',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        clicked: false,
        missingLogged: false,
        notClickableLogged: false
    },

    onMutation(state) {
        if (state.clicked) return;

        const button = this.findHideGradingButton();
        if (!button) {
            if (!state.missingLogged) {
                Logger.debug('Hide Grading Autoclick: "Hide Grading" button not found yet');
                state.missingLogged = true;
            }
            return;
        }

        if (!this.isButtonClickable(button)) {
            if (!state.notClickableLogged) {
                Logger.debug('Hide Grading Autoclick: "Hide Grading" not clickable yet');
                state.notClickableLogged = true;
            }
            return;
        }

        try {
            button.click();
            state.clicked = true;
            Logger.log('✓ Hide Grading Autoclick: clicked "Hide Grading"');
        } catch (error) {
            Logger.error('Hide Grading Autoclick: failed to click "Hide Grading"', error);
        }
    },

    findHideGradingButton() {
        const options = { context: `${this.id}.findHideGradingButton` };
        const buttons =
            typeof Context !== 'undefined' && Context.dom
                ? Context.dom.queryAll('button', options)
                : Array.from(document.querySelectorAll('button'));

        for (const btn of buttons) {
            const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
            if (text === 'Hide Grading') {
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
