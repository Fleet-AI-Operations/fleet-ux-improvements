// ============= create-instance-autoclick.js =============
// Clicks "Create Instance" once when the control is visible and clickable.

const plugin = {
    id: 'createInstanceAutoclick',
    name: 'Create Instance Autoclick',
    description:
        'Automatically clicks the "Create Instance" button once when it becomes visible.',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        clicked: false,
        visibilityObserverAttached: false,
        missingLogged: false,
        notClickableLogged: false
    },

    onMutation(state) {
        if (state.clicked) return;

        const button = this.findCreateInstanceButton();
        if (!button) {
            if (!state.missingLogged) {
                Logger.debug('Create Instance Autoclick: "Create Instance" button not found yet');
                state.missingLogged = true;
            }
            return;
        }

        if (!this.isButtonClickable(button)) {
            if (!state.notClickableLogged) {
                Logger.debug('Create Instance Autoclick: "Create Instance" not clickable yet');
                state.notClickableLogged = true;
            }
            return;
        }

        if (state.visibilityObserverAttached) return;
        state.visibilityObserverAttached = true;

        const io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting || state.clicked) continue;
                    try {
                        button.click();
                        state.clicked = true;
                        Logger.log('✓ Create Instance Autoclick: clicked "Create Instance"');
                    } catch (error) {
                        Logger.error('Create Instance Autoclick: failed to click "Create Instance"', error);
                        state.clicked = true;
                    }
                    io.disconnect();
                }
            },
            { threshold: 0 }
        );

        io.observe(button);
        CleanupRegistry.registerObserver(io);
    },

    findCreateInstanceButton() {
        const options = { context: `${this.id}.findCreateInstanceButton` };
        const buttons =
            typeof Context !== 'undefined' && Context.dom
                ? Context.dom.queryAll('button', options)
                : Array.from(document.querySelectorAll('button'));

        for (const btn of buttons) {
            const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
            if (text === 'Create Instance') {
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
