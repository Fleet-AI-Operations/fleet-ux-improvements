// ============= guideline-buttons.js =============
// Modular guideline link buttons below the user prompt. Wraps when panel is narrow.

const QA_GUIDELINES_LINK = 'https://fleetai.notion.site/QA-Guidelines-2f5fe5dd3fba80daa9b8f63a6ba85c56';

const BUTTONS = [
    { id: 'qa-guidelines', title: 'QA Guidelines', link: QA_GUIDELINES_LINK },
    { id: 'meridian-guidelines', title: 'Meridian Guidelines', link: 'https://fleetai.notion.site/Project-Meridian-Guidelines-2eafe5dd3fba80079b86de5dce865477' }
];

const plugin = {
    id: 'guidelineButtons',
    name: 'Guideline Buttons',
    description: 'Add links to the guidelines on the page',
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
        const promptSection = this.findPromptSection();
        if (!promptSection) {
            if (!state.missingLogged) {
                Logger.debug('Guideline Buttons: Prompt section not found (qa-comp-use)');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        let wrapper = promptSection.nextElementSibling;
        if (!wrapper || wrapper.getAttribute('data-fleet-plugin') !== 'guidelineButtons') {
            wrapper = this.createWrapper();
            promptSection.insertAdjacentElement('afterend', wrapper);
            state.wrapperAdded = true;
            Logger.log('✓ Guideline Buttons: wrapper added below user prompt (qa-comp-use)');
        }

        this.syncButtons(wrapper);
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
