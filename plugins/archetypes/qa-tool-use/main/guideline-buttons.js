// ============= guideline-buttons.js =============
// Modular guideline link buttons below the QA scratchpad. Wraps when panel is narrow.

const QA_GUIDELINES_LINK = 'https://fleetai.notion.site/QA-Guidelines-2f5fe5dd3fba80daa9b8f63a6ba85c56';

const BUTTONS = [
    { id: 'qa-guidelines', title: 'QA Guidelines', link: QA_GUIDELINES_LINK },
    { id: 'kinesis-guidelines', title: 'Kinesis Guidelines', link: 'https://fleetai.notion.site/Project-Kinesis-Guidelines-2d6fe5dd3fba8023aa78e345939dac3d' },
    { id: 'problem-creation-guidelines', title: 'Problem Creation Guidelines', link: 'https://fleetai.notion.site/Fleet-Problem-Creation-Guidelines-215fe5dd3fba802683d1c461b6a35c8a' }
];

const plugin = {
    id: 'guidelineButtons',
    name: 'Guideline Buttons',
    description: 'Add guideline link buttons below the QA scratchpad. Each button can be shown or hidden in Settings. Buttons wrap when the panel is narrow.',
    _version: '1.5',
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
        const scratchpad = document.querySelector('[data-qa-scratchpad="true"]');
        if (!scratchpad) {
            if (!state.missingLogged) {
                Logger.debug('Guideline Buttons: QA scratchpad not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        let wrapper = scratchpad.nextElementSibling;
        if (!wrapper || wrapper.getAttribute('data-fleet-plugin') !== 'guidelineButtons') {
            wrapper = this.createWrapper();
            scratchpad.insertAdjacentElement('afterend', wrapper);
            state.wrapperAdded = true;
            Logger.log('✓ Guideline Buttons: wrapper added below QA scratchpad');
        }

        this.syncButtons(wrapper);
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
                        }).catch((err) => {
                            Logger.error('Guideline Buttons: failed to copy QA Guidelines link', err);
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
    }
};
