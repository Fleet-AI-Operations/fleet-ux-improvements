
// ============= hide-grading-panel-button.js =============
// Adds "Hide Grading" on the right side of the bottom Grading panel tab bar. Clicks the page's native toggle only when its label is "Hide Grading" (grading is visible).

const BTN_ATTR = 'data-fleet-hide-grading-panel-btn';

const plugin = {
    id: 'hideGradingPanelButton',
    name: 'Hide Grading Panel Button',
    description:
        'Adds Hide Grading in the Grading panel header; delegates to the top Hide Grading control when grading is open.',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        addedLogged: false,
        toolbarMissingLogged: false
    },

    onMutation(state) {
        const row = this.findGradingTabToolbarRow();
        if (!row) {
            if (!state.toolbarMissingLogged) {
                Logger.debug('Hide Grading Panel Button: Grading tab toolbar row not found');
                state.toolbarMissingLogged = true;
            }
            return;
        }
        state.toolbarMissingLogged = false;

        if (row.querySelector(`[${BTN_ATTR}="true"]`)) {
            return;
        }

        row.appendChild(this.createButton());
        if (!state.addedLogged) {
            state.addedLogged = true;
            Logger.log('Hide Grading Panel Button: control added to Grading panel header');
        }
    },

    findGradingTabToolbarRow() {
        const tab = document.querySelector(
            'button[role="tab"][aria-controls*="verifier-output"]'
        );
        if (!tab) return null;
        const tablist = tab.closest('[role="tablist"]');
        if (!tablist) return null;
        const row = tablist.parentElement;
        if (
            !row ||
            !row.classList.contains('flex') ||
            !row.classList.contains('justify-between')
        ) {
            return null;
        }
        return row;
    },

    findNativeHideGradingButton() {
        const options = { context: `${this.id}.findNativeHideGradingButton` };
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
    },

    createButton() {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute(BTN_ATTR, 'true');
        button.className =
            'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground h-7 text-xs pl-2 pr-2 py-1 gap-1.5 shrink-0';
        button.textContent = 'Hide Grading';
        button.setAttribute('aria-label', 'Hide Grading');
        button.addEventListener('click', () => {
            const native = this.findNativeHideGradingButton();
            if (!native) {
                Logger.debug(
                    'Hide Grading Panel Button: native control not in Hide Grading state (skipping)'
                );
                return;
            }
            if (!this.isButtonClickable(native)) {
                Logger.debug('Hide Grading Panel Button: native Hide Grading not clickable');
                return;
            }
            try {
                native.click();
                Logger.debug('Hide Grading Panel Button: triggered native Hide Grading');
            } catch (error) {
                Logger.error('Hide Grading Panel Button: failed to click native control', error);
            }
        });
        return button;
    }
};
