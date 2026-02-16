// ============= guideline-buttons.js =============
// Modular guideline link buttons in the top bar (computer use task creation).

const BUTTONS = [
    { id: 'qa-guidelines', title: 'QA Guidelines', link: 'https://fleetai.notion.site/QA-Guidelines-2f5fe5dd3fba80daa9b8f63a6ba85c56' },
    { id: 'meridian-guidelines', title: 'Meridian Guidelines', link: 'https://fleetai.notion.site/Project-Meridian-Guidelines-2eafe5dd3fba80079b86de5dce865477' }
];

const plugin = {
    id: 'guidelineButtons',
    name: 'Guideline Buttons',
    description: 'Add links to the guidelines on the page',
    _version: '1.2',
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
                Logger.debug('Guideline Buttons: toolbar container not found (comp-use task creation)');
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
            Logger.log('✓ Guideline Buttons: wrapper added to top bar (comp-use task creation)');
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
            const startRecordingBtn = buttons.find(btn => {
                const text = btn.textContent.trim();
                return text.includes('Start Recording');
            });
            if (startRecordingBtn) {
                buttonContainer = startRecordingBtn.closest('div.flex.gap-1');
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
    }
};
