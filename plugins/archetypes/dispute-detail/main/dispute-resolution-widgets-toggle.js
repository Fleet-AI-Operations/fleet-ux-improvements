// ============= dispute-resolution-widgets-toggle.js =============
// Same behavior as guideline-buttons.js corner-widget hiding: CSS-only
// (visibility + pointer-events) for Pylon chat + Report-a-bug FAB.
// Default hidden. Toggle lives in the main top bar (right cluster next to nav tabs),
// not in the dispute resolution sidebar.

const CORNER_WIDGETS_BODY_CLASS = 'fleet-hide-corner-widgets';
const CORNER_WIDGETS_STORAGE_KEY = 'corner-widgets-hidden';
const CORNER_WIDGETS_SUBOPTION_ID = 'corner-widgets-toggle';

const CORNER_WIDGETS_SUBOPTION = {
    id: CORNER_WIDGETS_SUBOPTION_ID,
    name: 'Show/Hide Widgets button',
    description:
        'When enabled, adds a button in the top bar that toggles visibility (CSS only) of the Pylon support chat bubble and the Report a bug floating action button in the bottom-right. Hidden by default to reduce clutter.',
    enabledByDefault: true
};

const plugin = {
    id: 'disputeResolutionWidgetsToggle',
    name: 'Dispute Resolution Widgets Toggle',
    description:
        'Toggle visibility (CSS only) of bottom-right Pylon chat and Report a bug FAB; control in the top bar',
    _version: '2.2',
    enabledByDefault: true,
    phase: 'mutation',
    subOptions: [CORNER_WIDGETS_SUBOPTION],

    initialState: {
        styleInjected: false,
        missingLogged: false,
        toggleLogged: false
    },

    onMutation(state) {
        this.ensureCornerWidgetsStyle(state);
        this.applyCornerWidgetsClassFromStorage();

        const slot = this.findTopBarActionsContainer();
        if (!slot) {
            if (!state.missingLogged) {
                Logger.debug('Dispute Resolution Widgets Toggle: top bar actions container not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        this.ensureToggleWrapper(slot, state);
    },

    /** Right-side cluster in the main header (next to notifications / profile). */
    findTopBarActionsContainer() {
        const main = document.querySelector('main');
        if (!main) return null;
        const rows = main.querySelectorAll('.flex.items-center.justify-between');
        for (const row of rows) {
            if (row.querySelector('[role="tablist"]') && row.querySelector('a[href="/"]')) {
                const right = row.querySelector(':scope > .flex.items-center.gap-1.shrink-0');
                if (right) return right;
            }
        }
        return null;
    },

    ensureCornerWidgetsStyle(state) {
        if (state.styleInjected) return;
        // Share style id with guideline-buttons so only one block is injected
        if (document.getElementById('fleet-corner-widgets-toggle-style')) {
            state.styleInjected = true;
            return;
        }
        const style = document.createElement('style');
        style.id = 'fleet-corner-widgets-toggle-style';
        style.setAttribute('data-fleet-plugin', this.id);
        style.textContent = `
body.${CORNER_WIDGETS_BODY_CLASS} #pylon-chat,
body.${CORNER_WIDGETS_BODY_CLASS} .PylonChat,
body.${CORNER_WIDGETS_BODY_CLASS} .PylonChat-app {
    visibility: hidden !important;
    pointer-events: none !important;
}
body.${CORNER_WIDGETS_BODY_CLASS} button.fixed.bottom-20.right-4,
body.${CORNER_WIDGETS_BODY_CLASS} button.right-4.bottom-20.fixed,
body.${CORNER_WIDGETS_BODY_CLASS} button.fixed.right-4.bottom-20.size-10,
body.${CORNER_WIDGETS_BODY_CLASS} button.fixed.bottom-20.right-4.rounded-full {
    visibility: hidden !important;
    pointer-events: none !important;
}
`;
        document.head.appendChild(style);
        state.styleInjected = true;
        Logger.log('Dispute Resolution Widgets Toggle: corner widgets hide style injected');
    },

    applyCornerWidgetsClassFromStorage() {
        if (!Storage.getSubOptionEnabled(this.id, CORNER_WIDGETS_SUBOPTION_ID, true)) {
            this.setCornerWidgetsHidden(false, false);
            return;
        }
        // Default true = hidden when no prior storage (same as guideline-buttons)
        const hidden = Storage.get(this.storageKeyCornerWidgets(), true);
        this.setCornerWidgetsHidden(!!hidden, false);
    },

    storageKeyCornerWidgets() {
        return `plugin-${this.id}-${CORNER_WIDGETS_STORAGE_KEY}`;
    },

    /** @param {boolean} hidden @param {boolean} persist */
    setCornerWidgetsHidden(hidden, persist) {
        document.body.classList.toggle(CORNER_WIDGETS_BODY_CLASS, hidden);
        if (persist) {
            Storage.set(this.storageKeyCornerWidgets(), hidden);
            Logger.log(
                `Dispute Resolution Widgets Toggle: corner widgets ${hidden ? 'hidden' : 'shown'} (CSS only)`
            );
        }
        const btn = document.querySelector(
            `button[data-fleet-corner-widgets-toggle="${this.id}"]`
        );
        if (btn) {
            btn.textContent = hidden ? 'Show Widgets' : 'Hide Widgets';
            btn.title = hidden
                ? 'Show Pylon support chat and Report a bug button (bottom-right)'
                : 'Hide Pylon support chat and Report a bug button (bottom-right)';
        }
    },

    isCornerWidgetsHidden() {
        return document.body.classList.contains(CORNER_WIDGETS_BODY_CLASS);
    },

    ensureToggleWrapper(slot, state) {
        const buttonClass =
            'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';

        if (!Storage.getSubOptionEnabled(this.id, CORNER_WIDGETS_SUBOPTION_ID, true)) {
            const wrapper = document.querySelector(`div[data-fleet-plugin="${this.id}"]`);
            if (wrapper) {
                wrapper.remove();
                Logger.log(
                    'Dispute Resolution Widgets Toggle: toggle wrapper removed (subOption disabled)'
                );
            }
            this.setCornerWidgetsHidden(false, false);
            return;
        }

        let wrapper = document.querySelector(`div[data-fleet-plugin="${this.id}"]`);
        if (wrapper && wrapper.parentElement !== slot) {
            wrapper.remove();
            wrapper = null;
        }

        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.setAttribute('data-fleet-plugin', this.id);
            wrapper.className = 'flex flex-wrap gap-1 items-center shrink-0 mr-1';
            slot.insertBefore(wrapper, slot.firstChild);
            if (!state.toggleLogged) {
                Logger.log('Dispute Resolution Widgets Toggle: toggle added to top bar');
                state.toggleLogged = true;
            }
        }

        let toggleBtn = wrapper.querySelector(
            `button[data-fleet-corner-widgets-toggle="${this.id}"]`
        );
        if (!toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.setAttribute('data-fleet-plugin', this.id);
            toggleBtn.setAttribute('data-fleet-corner-widgets-toggle', this.id);
            toggleBtn.type = 'button';
            toggleBtn.className = buttonClass;
            toggleBtn.addEventListener('click', () => {
                const nextHidden = !this.isCornerWidgetsHidden();
                this.setCornerWidgetsHidden(nextHidden, true);
            });
            wrapper.appendChild(toggleBtn);
            Logger.log('Dispute Resolution Widgets Toggle: corner widgets toggle button added');
        }
        this.setCornerWidgetsHidden(this.isCornerWidgetsHidden(), false);
    }
};
