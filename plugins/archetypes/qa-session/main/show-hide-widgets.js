// ============= show-hide-widgets.js =============
// CSS-only toggle for Pylon chat + Report-a-bug FAB (visibility + pointer-events).
// Default hidden. Button sits in the top menu bar, preceding the Skip button.

const CORNER_WIDGETS_BODY_CLASS = 'fleet-hide-corner-widgets';
const CORNER_WIDGETS_STORAGE_KEY = 'corner-widgets-hidden';

const plugin = {
    id: 'sessionTraceShowHideWidgets',
    name: 'Session Trace Show/Hide Widgets',
    description:
        'Toggle visibility (CSS only) of bottom-right Pylon chat and Report a bug FAB; button in the top bar before Skip',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        styleInjected: false,
        missingLogged: false,
        buttonAdded: false
    },

    onMutation(state) {
        this.ensureStyle(state);
        this.applyClassFromStorage();

        const skipBtn = this.findSkipButton();
        if (!skipBtn) {
            if (!state.missingLogged) {
                Logger.debug('Session Trace Show/Hide Widgets: Skip button not found in top bar');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        this.ensureToggleButton(skipBtn, state);
    },

    findSkipButton() {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const span = btn.querySelector('span');
            if (span && span.textContent.trim() === 'Skip') {
                return btn;
            }
        }
        return null;
    },

    ensureStyle(state) {
        if (state.styleInjected) return;
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
        Logger.log('Session Trace Show/Hide Widgets: corner widgets hide style injected');
    },

    storageKey() {
        return `plugin-${this.id}-${CORNER_WIDGETS_STORAGE_KEY}`;
    },

    applyClassFromStorage() {
        const hidden = Storage.get(this.storageKey(), true);
        this.setHidden(!!hidden, false);
    },

    /** @param {boolean} hidden @param {boolean} persist */
    setHidden(hidden, persist) {
        document.body.classList.toggle(CORNER_WIDGETS_BODY_CLASS, hidden);
        if (persist) {
            Storage.set(this.storageKey(), hidden);
            Logger.log(
                `Session Trace Show/Hide Widgets: corner widgets ${hidden ? 'hidden' : 'shown'} (CSS only)`
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

    isHidden() {
        return document.body.classList.contains(CORNER_WIDGETS_BODY_CLASS);
    },

    ensureToggleButton(skipBtn, state) {
        const container = skipBtn.parentElement;
        if (!container) return;

        let toggleBtn = container.querySelector(
            `button[data-fleet-corner-widgets-toggle="${this.id}"]`
        );
        if (toggleBtn && toggleBtn.parentElement !== container) {
            toggleBtn.remove();
            toggleBtn = null;
        }

        if (!toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.setAttribute('data-fleet-plugin', this.id);
            toggleBtn.setAttribute('data-fleet-corner-widgets-toggle', this.id);
            toggleBtn.type = 'button';
            toggleBtn.className =
                'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground bg-muted dark:!bg-secondary transition-colors hover:bg-secondary/80 hover:text-secondary-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
            toggleBtn.addEventListener('click', () => {
                const nextHidden = !this.isHidden();
                this.setHidden(nextHidden, true);
            });
            container.insertBefore(toggleBtn, skipBtn);
            if (!state.buttonAdded) {
                Logger.log('Session Trace Show/Hide Widgets: toggle button added before Skip');
                state.buttonAdded = true;
            }
        }
        this.setHidden(this.isHidden(), false);
    }
};
