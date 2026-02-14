// ============= guideline-buttons.js =============
// Modular guideline link buttons below the QA scratchpad. Wraps when panel is narrow.

const QA_GUIDELINES_LINK = 'https://fleetai.notion.site/QA-Guidelines-2f5fe5dd3fba80daa9b8f63a6ba85c56';

const BUTTONS = [
    { id: 'qa-guidelines', title: 'QA Guidelines', link: QA_GUIDELINES_LINK },
    { id: 'kinesis-guidelines', title: 'Kinesis Guidelines', link: 'https://fleetai.notion.site/Project-Kinesis-Guidelines-2d6fe5dd3fba8023aa78e345939dac3d' }
];

const plugin = {
    id: 'guidelineButtons',
    name: 'Guideline Buttons',
    description: 'Add guideline link buttons below the QA scratchpad. Each button can be shown or hidden in Settings. Buttons wrap when the panel is narrow.',
    _version: '1.7',
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
        const tabBars = this.findTaskNotesTabBars();

        if (tabBars.length === 0) {
            const scratchpad = document.querySelector('[data-qa-scratchpad="true"]');
            if (!scratchpad) {
                if (!state.missingLogged) {
                    Logger.debug('Guideline Buttons: QA scratchpad not found');
                    state.missingLogged = true;
                }
                return;
            }
            state.missingLogged = false;
            this.ensureWrapperBelowScratchpad(state, scratchpad);
            return;
        }

        for (const tabBar of tabBars) {
            const contentRoot = this.getPanelContentRoot(tabBar);
            if (!contentRoot) continue;

            if (!this.isTaskTabActive(tabBar)) {
                contentRoot.querySelectorAll('[data-fleet-plugin="guidelineButtons"]').forEach((el) => {
                    el.remove();
                    Logger.debug('Guideline Buttons: Removed wrapper from panel (Notes tab active)');
                });
                continue;
            }

            const scratchpad = contentRoot.querySelector('[data-qa-scratchpad="true"]');
            if (!scratchpad) continue;

            state.missingLogged = false;
            this.ensureWrapperBelowScratchpad(state, scratchpad);
        }
    },

    findTaskNotesTabBars() {
        const tabBars = [];
        const candidates = document.querySelectorAll('div.flex.items-center.gap-1.px-2.border-b');
        for (const el of candidates) {
            const buttons = el.querySelectorAll('button');
            let hasTask = false;
            let hasNotes = false;
            for (const btn of buttons) {
                const text = btn.textContent.trim();
                if (text === 'Task') hasTask = true;
                if (text === 'Notes') hasNotes = true;
            }
            if (hasTask && hasNotes) tabBars.push(el);
        }
        return tabBars;
    },

    isTaskTabActive(tabBar) {
        const taskBtn = Array.from(tabBar.querySelectorAll('button')).find(
            (btn) => btn.textContent.trim() === 'Task'
        );
        if (!taskBtn) return false;
        const c = taskBtn.className || '';
        return c.includes('border-primary') || c.includes('text-primary');
    },

    getPanelContentRoot(tabBar) {
        const panel = tabBar.parentElement;
        if (!panel || !panel.querySelector) return null;
        return panel.querySelector('div.flex-1.min-h-0.overflow-auto.p-3') || panel.querySelector('div.overflow-auto') || null;
    },

    findExistingWrapperAmongSiblings(scratchpad) {
        let el = scratchpad.nextElementSibling;
        while (el) {
            if (el.getAttribute && el.getAttribute('data-fleet-plugin') === 'guidelineButtons') {
                return el;
            }
            el = el.nextElementSibling;
        }
        return null;
    },

    findAllWrappersAmongSiblings(scratchpad) {
        const found = [];
        let el = scratchpad.nextElementSibling;
        while (el) {
            if (el.getAttribute && el.getAttribute('data-fleet-plugin') === 'guidelineButtons') {
                found.push(el);
            }
            el = el.nextElementSibling;
        }
        return found;
    },

    ensureWrapperBelowScratchpad(state, scratchpad) {
        const existingWrapper = this.findExistingWrapperAmongSiblings(scratchpad);
        if (existingWrapper) {
            const allWrappers = this.findAllWrappersAmongSiblings(scratchpad);
            if (allWrappers.length > 1) {
                for (let i = 1; i < allWrappers.length; i++) {
                    allWrappers[i].remove();
                    Logger.log('✓ Guideline Buttons: Removed duplicate wrapper');
                }
            }
            const remaining = this.findAllWrappersAmongSiblings(scratchpad);
            const wrapperToUse = remaining.length > 0 ? remaining[0] : existingWrapper;
            if (wrapperToUse && wrapperToUse !== scratchpad.nextElementSibling) {
                scratchpad.insertAdjacentElement('afterend', wrapperToUse);
                Logger.debug('Guideline Buttons: Moved wrapper to follow scratchpad');
            }
            this.syncButtons(scratchpad.nextElementSibling);
            return;
        }

        const wrapper = this.createWrapper();
        scratchpad.insertAdjacentElement('afterend', wrapper);
        state.wrapperAdded = true;
        Logger.log('✓ Guideline Buttons: wrapper added below QA scratchpad');
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
