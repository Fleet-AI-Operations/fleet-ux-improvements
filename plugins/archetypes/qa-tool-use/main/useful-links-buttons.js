// ============= useful-links-buttons.js =============
// Modular link buttons below the QA scratchpad. Wraps when panel is narrow.

const FLEET_GUIDELINES = {
    general: 'https://www.fleetai.com/work/guidelines?doc=c007bc70-5202-4bfd-95bb-4f1699d8b9f3',
    toolUse: 'https://www.fleetai.com/work/guidelines?doc=1d4e376a-04e5-4636-93b9-faeeca44f80b',
    qa: 'https://www.fleetai.com/work/guidelines?doc=171f1c3e-3ba9-4531-a5e2-30a8f301ea43',
    timeSubmission: 'https://www.fleetai.com/work/guidelines?doc=f2536177-34a9-4a34-967e-0b8c374c203c'
};

const BUTTONS = [
    { id: 'general-guidelines', title: 'General Guidelines', link: FLEET_GUIDELINES.general },
    { id: 'tool-use-guidelines', title: 'Tool Use Guidelines', link: FLEET_GUIDELINES.toolUse },
    { id: 'qa-guidelines', title: 'QA Guidelines', link: FLEET_GUIDELINES.qa },
    { id: 'time-submission-guidelines', title: 'Time Submission Guidelines', link: FLEET_GUIDELINES.timeSubmission },
    { id: 'json-editor', title: '{ } JSON Editor', link: 'https://jsoneditoronline.org' }
];

const plugin = {
    id: 'guidelineButtons',
    name: 'Useful Link Buttons',
    description: 'Add useful link buttons to the page',
    _version: '2.2',
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
        const tabBars = this.findTaskNotesTabBars();

        if (tabBars.length === 0) {
            const taskDetailPanel = document.querySelector('[data-ui="qa-task-detail-panel"]');
            const scratchpad = (taskDetailPanel && taskDetailPanel.querySelector('[data-qa-scratchpad="true"]'))
                || document.querySelector('[data-qa-scratchpad="true"]');
            if (!scratchpad) {
                if (!state.missingLogged) {
                    Logger.debug('Useful Link Buttons: QA scratchpad not found');
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
                    Logger.debug('Useful Link Buttons: Removed wrapper from panel (Notes tab active)');
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
        const taskDetailPanel = document.querySelector('[data-ui="qa-task-detail-panel"]');
        const roots = taskDetailPanel ? [taskDetailPanel] : [document];
        for (const root of roots) {
            const candidates = root.querySelectorAll('div.flex.items-center.gap-1.px-2.border-b');
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
            if (tabBars.length > 0) break;
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
                    Logger.log('✓ Useful Link Buttons: Removed duplicate wrapper');
                }
            }
            const remaining = this.findAllWrappersAmongSiblings(scratchpad);
            const wrapperToUse = remaining.length > 0 ? remaining[0] : existingWrapper;
            if (wrapperToUse && wrapperToUse !== scratchpad.nextElementSibling) {
                scratchpad.insertAdjacentElement('afterend', wrapperToUse);
                Logger.debug('Useful Link Buttons: Moved wrapper to follow scratchpad');
            }
            this.syncButtons(scratchpad.nextElementSibling);
            return;
        }

        const wrapper = this.createWrapper();
        scratchpad.insertAdjacentElement('afterend', wrapper);
        state.wrapperAdded = true;
        Logger.log('✓ Useful Link Buttons: wrapper added below QA scratchpad');
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
                            Logger.log(`Useful Link Buttons: copied link to clipboard`);
                            this.flashClipboardSuccess(btn);
                        }).catch((err) => {
                            Logger.error('Useful Link Buttons: failed to copy link', err);
                            this.flashClipboardFailure(btn);
                        });
                    });
                } else {
                    btn.title = `Open ${b.title} in new tab`;
                    btn.addEventListener('click', () => {
                        window.open(b.link, '_blank');
                        Logger.log(`Useful Link Buttons: opened ${b.title}`);
                    });
                }
                wrapper.appendChild(btn);
            } else if (!enabled && existing) {
                existing.remove();
            }
        }
    }
};
