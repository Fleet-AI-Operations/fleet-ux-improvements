// ============= guideline-buttons.js =============
// Modular guideline link buttons in the toolbar (same spot as JSON Editor).

const BUTTONS = [
    { id: 'qa-guidelines', title: 'QA Guidelines', link: 'https://fleetai.notion.site/QA-Guidelines-2f5fe5dd3fba80daa9b8f63a6ba85c56' },
    { id: 'kinesis-guidelines', title: 'Kinesis Guidelines', link: 'https://fleetai.notion.site/Project-Kinesis-Guidelines-2d6fe5dd3fba8023aa78e345939dac3d' }
];

const plugin = {
    id: 'guidelineButtons',
    name: 'Guideline Buttons',
    description: 'Add guideline link buttons to the toolbar. Each button can be shown or hidden in Settings.',
    _version: '1.4',
    enabledByDefault: true,
    phase: 'mutation',

    buttons: BUTTONS,
    subOptions: BUTTONS.map(b => ({
        id: `show-${b.id}`,
        name: b.title,
        description: null,
        enabledByDefault: true
    })),

    initialState: {
        wrapperAdded: false,
        missingLogged: false
    },

    onMutation(state, context) {
        const buttonContainer = this.findToolbarContainer();
        if (!buttonContainer) {
            if (!state.missingLogged) {
                Logger.debug('Guideline Buttons: toolbar container not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        let wrapper = buttonContainer.querySelector('[data-fleet-plugin="guidelineButtons"]');
        if (!wrapper) {
            wrapper = this.createWrapper();
            this.insertWrapper(buttonContainer, wrapper);
            state.wrapperAdded = true;
            Logger.log('✓ Guideline Buttons: wrapper added to toolbar');
        }

        this.syncButtons(wrapper);
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
            const resetBtn = buttons.find(btn => {
                const text = btn.textContent.trim();
                return text === 'Reset Instance' || text.includes('Reset Instance');
            });
            if (resetBtn) {
                buttonContainer = resetBtn.closest('div.flex.gap-1');
            }
        }

        if (!buttonContainer) {
            const buttons = Array.from(document.querySelectorAll('button'));
            const saveBtn = buttons.find(btn => btn.textContent.trim() === 'Save');
            if (saveBtn) {
                const parent = saveBtn.parentElement;
                if (parent && parent.classList.contains('flex') && parent.classList.contains('gap-1')) {
                    buttonContainer = parent;
                }
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

    insertWrapper(buttonContainer, wrapper) {
        const jsonEditorBtn = buttonContainer.querySelector('[data-fleet-plugin="jsonEditorOnline"][data-slot="toolbar-button"]');
        if (jsonEditorBtn) {
            jsonEditorBtn.insertAdjacentElement('afterend', wrapper);
        } else {
            buttonContainer.insertBefore(wrapper, buttonContainer.firstChild);
        }
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
    }
};
