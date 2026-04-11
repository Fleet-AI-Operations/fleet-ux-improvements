// ============= guideline-buttons.js =============
// Modular guideline link buttons in the header bar (same spot as task-creation toolbar).
// Toggle hides/shows bottom-right Pylon chat + bug-report FAB via CSS only.

const BUTTONS = [
    { id: 'qa-guidelines', title: 'QA Guidelines', link: 'https://fleetai.notion.site/QA-Guidelines-2f5fe5dd3fba80daa9b8f63a6ba85c56' },
    { id: 'kinesis-guidelines', title: 'Kinesis Guidelines', link: 'https://fleetai.notion.site/Project-Kinesis-Guidelines-2d6fe5dd3fba8023aa78e345939dac3d' }
];

const CORNER_WIDGETS_BODY_CLASS = 'fleet-hide-corner-widgets';
const CORNER_WIDGETS_STORAGE_KEY = 'corner-widgets-hidden';
const CORNER_WIDGETS_SUBOPTION_ID = 'corner-widgets-toggle';

const CORNER_WIDGETS_SUBOPTION = {
    id: CORNER_WIDGETS_SUBOPTION_ID,
    name: 'Show/Hide Widgets button',
    description: 'When enabled, adds a button next to the guideline links that toggles visibility (CSS only) of the Pylon support chat bubble and the Report a bug floating action button in the bottom-right. Hidden by default to reduce clutter.',
    enabledByDefault: true
};

const plugin = {
    id: 'guidelineButtons',
    name: 'Guideline Buttons',
    description: 'Add links to the guidelines on the page',
    _version: '1.6',
    enabledByDefault: true,
    phase: 'mutation',

    buttons: BUTTONS,
    subOptions: BUTTONS.map(b => ({
        id: `show-${b.id}`,
        name: b.title,
        description: null,
        enabledByDefault: true
    })).concat([CORNER_WIDGETS_SUBOPTION]),

    initialState: {
        wrapperAdded: false,
        missingLogged: false,
        styleInjected: false
    },

    onMutation(state, context) {
        this.ensureCornerWidgetsStyle(state);
        this.applyCornerWidgetsClassFromStorage();

        const buttonContainer = this.findToolbarContainer();
        if (!buttonContainer) {
            if (!state.missingLogged) {
                Logger.debug('Guideline Buttons: toolbar container not found (revision)');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        let wrapper = buttonContainer.querySelector('[data-fleet-plugin="guidelineButtons"]');
        if (!wrapper) {
            wrapper = this.createWrapper();
            buttonContainer.insertBefore(wrapper, buttonContainer.firstChild);
            state.wrapperAdded = true;
            Logger.log('✓ Guideline Buttons: wrapper added to header bar (revision)');
        }

        this.syncButtons(wrapper);
    },

    ensureCornerWidgetsStyle(state) {
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
body.${CORNER_WIDGETS_BODY_CLASS} .PylonChat {
    visibility: hidden !important;
    pointer-events: none !important;
}
body.${CORNER_WIDGETS_BODY_CLASS} button.fixed.bottom-20.right-4,
body.${CORNER_WIDGETS_BODY_CLASS} button.right-4.bottom-20.fixed {
    visibility: hidden !important;
    pointer-events: none !important;
}
`;
        document.head.appendChild(style);
        state.styleInjected = true;
        Logger.log('Guideline Buttons: corner widgets hide style injected');
    },

    applyCornerWidgetsClassFromStorage() {
        if (!Storage.getSubOptionEnabled(this.id, CORNER_WIDGETS_SUBOPTION_ID, true)) {
            this.setCornerWidgetsHidden(false, false);
            return;
        }
        const hidden = Storage.get(this.storageKeyCornerWidgets(), true);
        this.setCornerWidgetsHidden(!!hidden, false);
    },

    storageKeyCornerWidgets() {
        return `plugin-${this.id}-${CORNER_WIDGETS_STORAGE_KEY}`;
    },

    setCornerWidgetsHidden(hidden, persist) {
        document.body.classList.toggle(CORNER_WIDGETS_BODY_CLASS, hidden);
        if (persist) {
            Storage.set(this.storageKeyCornerWidgets(), hidden);
            Logger.log(`Guideline Buttons: corner widgets ${hidden ? 'hidden' : 'shown'} (CSS only)`);
        }
        const btn = document.querySelector(`button[data-fleet-corner-widgets-toggle="${this.id}"]`);
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

    ensureCornerWidgetsToggleButton(wrapper, buttonClass) {
        const toggleBtnExisting = wrapper.querySelector(`button[data-fleet-corner-widgets-toggle="${this.id}"]`);
        if (!Storage.getSubOptionEnabled(this.id, CORNER_WIDGETS_SUBOPTION_ID, true)) {
            if (toggleBtnExisting) {
                toggleBtnExisting.remove();
                Logger.log('Guideline Buttons: corner widgets toggle removed (subOption disabled)');
            }
            this.setCornerWidgetsHidden(false, false);
            return;
        }
        let toggleBtn = toggleBtnExisting;
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
            Logger.log('Guideline Buttons: corner widgets toggle button added');
        }
        this.setCornerWidgetsHidden(this.isCornerWidgetsHidden(), false);
    },

    findToolbarContainer() {
        let buttonContainer = null;

        const candidates = document.querySelectorAll('div.flex.gap-1.ml-auto.items-center');
        buttonContainer = Array.from(candidates).find(el =>
            el.classList.contains('mr-0') ||
            (el.classList.contains('flex') &&
                el.classList.contains('gap-1') &&
                el.classList.contains('items-center') &&
                getComputedStyle(el).marginLeft === 'auto')
        );

        if (!buttonContainer) {
            const buttons = Array.from(document.querySelectorAll('button'));
            const runWorkflowBtn = buttons.find(btn => {
                const text = btn.textContent.trim();
                return text === 'Run Workflow' || text.includes('Run Workflow');
            });
            if (runWorkflowBtn) {
                buttonContainer = runWorkflowBtn.closest('div.flex.gap-1');
            }
        }

        if (!buttonContainer) {
            const buttons = Array.from(document.querySelectorAll('button'));
            const resetBtn = buttons.find(btn => {
                const text = btn.textContent.trim();
                return text === 'Reset Instance' || text.includes('Reset Instance');
            });
            if (resetBtn) {
                buttonContainer = resetBtn.closest('div.flex.gap-1');
            }
        }

        if (!buttonContainer) {
            const sourceDataBtn = Array.from(document.querySelectorAll('button')).find(btn =>
                btn.textContent.includes('Source Data')
            );
            if (sourceDataBtn) {
                buttonContainer = sourceDataBtn.parentElement;
            }
        }

        return buttonContainer;
    },

    createWrapper() {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-fleet-plugin', this.id);
        wrapper.className = 'flex gap-1 items-center';
        return wrapper;
    },

    syncButtons(wrapper) {
        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';

        for (const b of this.buttons) {
            const subOptionId = `show-${b.id}`;
            const enabled = Storage.getSubOptionEnabled(this.id, subOptionId, true);
            const existing = wrapper.querySelector(`[data-guideline-id="${b.id}"]`);

            if (enabled && !existing) {
                const btn = document.createElement('button');
                btn.setAttribute('data-fleet-plugin', this.id);
                btn.setAttribute('data-guideline-id', b.id);
                btn.type = 'button';
                btn.className = buttonClass;
                btn.textContent = b.title;
                btn.title = `Open ${b.title} in new tab`;
                btn.addEventListener('click', () => {
                    window.open(b.link, '_blank');
                    Logger.log(`Guideline Buttons: opened ${b.title}`);
                });
                wrapper.appendChild(btn);
            } else if (!enabled && existing) {
                existing.remove();
            }
        }

        this.ensureCornerWidgetsToggleButton(wrapper, buttonClass);
    }
};
