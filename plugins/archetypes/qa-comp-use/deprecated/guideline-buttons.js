// ============= guideline-buttons.js =============
// Modular guideline link buttons below the user prompt. Wraps when panel is narrow.
// Toggle hides/shows bottom-right Pylon chat + bug-report FAB via CSS only (visibility + pointer-events).

const QA_GUIDELINES_LINK = 'https://fleetai.notion.site/QA-Guidelines-2f5fe5dd3fba80daa9b8f63a6ba85c56';

const BUTTONS = [
    { id: 'qa-guidelines', title: 'QA Guidelines', link: QA_GUIDELINES_LINK },
    { id: 'meridian-guidelines', title: 'Meridian Guidelines', link: 'https://fleetai.notion.site/Project-Meridian-Guidelines-2eafe5dd3fba80079b86de5dce865477' }
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
    _version: '2.3',
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

    flashClipboardSuccess(btn) {
        if (btn._fleetClipboardFbT) clearTimeout(btn._fleetClipboardFbT);
        btn.style.backgroundColor = 'rgb(34, 197, 94)';
        btn.style.color = '#ffffff';
        btn._fleetClipboardFbT = setTimeout(() => {
            btn.style.backgroundColor = '';
            btn.style.color = '';
            btn._fleetClipboardFbT = null;
        }, 1000);
    },

    flashClipboardFailure(btn) {
        if (btn._fleetClipboardFbT) clearTimeout(btn._fleetClipboardFbT);
        const prevT = btn.style.transition;
        btn.style.transition = 'none';
        btn.style.backgroundColor = 'rgb(239, 68, 68)';
        btn.style.color = '#ffffff';
        void btn.offsetHeight;
        btn.style.transition = 'background-color 500ms ease-out, color 500ms ease-out';
        btn.style.backgroundColor = '';
        btn.style.color = '';
        btn._fleetClipboardFbT = setTimeout(() => {
            btn.style.transition = prevT || '';
            btn._fleetClipboardFbT = null;
        }, 500);
    },

    onMutation(state, context) {
        this.ensureCornerWidgetsStyle(state);
        this.applyCornerWidgetsClassFromStorage();

        // Reuse existing wrapper if present (only one insertion per page)
        let wrapper = document.querySelector(`div[data-fleet-plugin="${this.id}"]`);
        if (wrapper) {
            this.syncButtons(wrapper);
            return;
        }

        const promptSection = this.findPromptSection();
        if (!promptSection) {
            if (!state.missingLogged) {
                Logger.debug('Guideline Buttons: Prompt section not found (qa-comp-use)');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        wrapper = this.createWrapper();
        promptSection.insertAdjacentElement('afterend', wrapper);
        state.wrapperAdded = true;
        Logger.log('✓ Guideline Buttons: wrapper added below user prompt (qa-comp-use)');

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
        // CSS only: no DOM removal. visibility + pointer-events so layout/iframes do not "freak out"
        // Pylon: #pylon-chat / .PylonChat (see .cursor/context/other/pylon-chat.html)
        // Report a bug FAB: fixed bottom-20 right-4 size-10 rounded-full (see qa.html)
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
        Logger.log('Guideline Buttons: corner widgets hide style injected');
    },

    applyCornerWidgetsClassFromStorage() {
        if (!Storage.getSubOptionEnabled(this.id, CORNER_WIDGETS_SUBOPTION_ID, true)) {
            this.setCornerWidgetsHidden(false, false);
            return;
        }
        // Default true = hidden when no prior storage
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

    findPromptSection() {
        const candidates = document.querySelectorAll('div.flex.flex-col.gap-2');
        for (const candidate of candidates) {
            const label = candidate.querySelector('label');
            const span = candidate.querySelector('span.text-sm.text-muted-foreground.font-medium');
            if (label && label.textContent.trim() === 'Prompt') {
                return candidate;
            }
            if (span && span.textContent.trim() === 'Prompt') {
                return candidate;
            }
        }
        return null;
    },

    createWrapper() {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-fleet-plugin', this.id);
        wrapper.className = 'flex flex-wrap gap-1 items-center';
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
                if (b.copyLink) {
                    btn.title = `Copy ${b.title} to clipboard`;
                    btn.addEventListener('click', () => {
                        navigator.clipboard.writeText(b.link).then(() => {
                            Logger.log(`Guideline Buttons: copied QA Guidelines link to clipboard`);
                            this.flashClipboardSuccess(btn);
                        }).catch((err) => {
                            Logger.error('Guideline Buttons: failed to copy QA Guidelines link', err);
                            this.flashClipboardFailure(btn);
                        });
                    });
                } else {
                    btn.title = `Open ${b.title} in new tab`;
                    btn.addEventListener('click', () => {
                        window.open(b.link, '_blank');
                        Logger.log(`Guideline Buttons: opened ${b.title}`);
                    });
                }
                wrapper.appendChild(btn);
            } else if (!enabled && existing) {
                existing.remove();
            }
        }

        this.ensureCornerWidgetsToggleButton(wrapper, buttonClass);
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
    }
};
