// ============= auto-start-recording.js =============
// Automatically clicks the "Start Recording" button once when it appears.

const plugin = {
    id: 'autoStartRecording',
    name: 'Auto Start Recording',
    description: 'Automatically clicks the "Start Recording" button once when it appears on the page.',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        clicked: false,
        missingLogged: false
    },

    onMutation(state, context) {
        if (state.clicked) return;

        const button = this.findStartRecordingButton();
        if (!button) {
            if (!state.missingLogged) {
                Logger.debug('Auto Start Recording: \"Start Recording\" button not found yet');
                state.missingLogged = true;
            }
            return;
        }

        try {
            button.click();
            state.clicked = true;
            Logger.log('✓ Auto Start Recording: clicked \"Start Recording\" button');
        } catch (error) {
            Logger.error('Auto Start Recording: failed to click \"Start Recording\" button', error);
        }
    },

    findStartRecordingButton() {
        const options = { context: `${this.id}.findStartRecordingButton` };
        const buttons = typeof Context !== 'undefined' && Context.dom
            ? Context.dom.queryAll('button', options)
            : Array.from(document.querySelectorAll('button'));

        for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            if (text === 'Start Recording') {
                return btn;
            }
        }

        return null;
    }
};

