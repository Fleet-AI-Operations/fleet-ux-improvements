// ============= accept-task-modal-improvements.js =============
// QA Accept/Approve Task modal: auto-check checkboxes and "Motivate worker" button.
// Context: .cursor/context/tool-use/qa/accept-modal.html

const ENCOURAGEMENT_BLURBS = [
    'Great work!',
    'Good submission!',
    'Nice job!',
    'Well done!',
    'Solid work!',
    'Looks good!',
    'Excellent submission!',
    'Keep it up!',
    'Really nice!',
    'Good going!',
    'Thumbs up!',
    'Nice one!',
    'On point!',
    'Clean work!',
    'Well put together!',
    'Strong submission!',
    'Good stuff!',
    'Right on!',
    'Approved!',
    'Looks solid!',
    'Well executed!',
    'Spot on!',
    'Quality work!',
    'All good!',
    'Smooth work!',
    'Right on target!',
    'Good form!',
    'Well handled!',
    'Good show!',
    'Nice and clear!',
    'Right way to do it!',
    'Clean and clear!',
    'Well thought out!',
    'Nice and thorough!',
    'On the money!',
    'Nice and complete!',
    'Good attention to detail!',
    'Way to go!'
];

const plugin = {
    id: 'acceptTaskModalImprovements',
    name: 'Accept Task Modal Improvements',
    description: 'Auto-check QA checkboxes and add a button to paste a positive comment',
    _version: '1.4',
    enabledByDefault: true,
    phase: 'mutation',

    subOptions: [
        {
            id: 'auto-check-checkboxes',
            name: 'Auto-check QA checkboxes',
            description: 'When the Approve Task modal opens, check all QA checklist checkboxes if they are not already checked. May not work on all sites (app may ignore programmatic events); if so, use Tab + Space manually.',
            enabledByDefault: false
        },
        {
            id: 'motivate-worker-button',
            name: 'Motivate worker with positive comment',
            description: "Add a green button above the optional comments box that pastes a random positive blurb when clicked",
            enabledByDefault: true
        }
    ],

    initialState: {
        missingLogged: false,
        lastProcessedDialog: null,
        lastAutoCheckedDialog: null,
        motivateButtonAdded: false
    },

    onMutation(state, context) {
        const dialogs = Context.dom.queryAll('div[role="dialog"][data-state="open"]', {
            context: `${this.id}.dialogs`
        });

        let approveModal = null;
        for (const dialog of dialogs) {
            const heading = Context.dom.query('h2', { root: dialog, context: `${this.id}.heading` });
            if (heading && heading.textContent.trim() === 'Approve Task') {
                approveModal = dialog;
                break;
            }
        }

        if (!approveModal) {
            if (state.lastProcessedDialog) {
                state.lastProcessedDialog = null;
                state.lastAutoCheckedDialog = null;
                state.motivateButtonAdded = false;
            }
            if (!state.missingLogged) {
                Logger.debug('Accept Task Modal Improvements: Approve Task dialog not found');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;

        const autoCheckEnabled = Storage.getSubOptionEnabled(this.id, 'auto-check-checkboxes', false);
        if (autoCheckEnabled && state.lastAutoCheckedDialog !== approveModal) {
            state.lastAutoCheckedDialog = approveModal;
            const self = this;
            setTimeout(() => {
                self.autoCheckCheckboxes(approveModal);
            }, 150);
        }

        const motivateEnabled = Storage.getSubOptionEnabled(this.id, 'motivate-worker-button', true);
        if (motivateEnabled) {
            this.ensureMotivateButton(approveModal, state);
        } else {
            this.removeMotivateButton(approveModal);
            state.motivateButtonAdded = false;
        }
    },

    autoCheckCheckboxes(dialog) {
        const checkboxes = dialog.querySelectorAll('button[role="checkbox"]');
        const toCheck = Array.from(checkboxes).filter(
            btn => btn.getAttribute('data-state') === 'unchecked' || btn.getAttribute('aria-checked') === 'false'
        );
        if (toCheck.length === 0) return;
        toCheck.forEach((btn, i) => {
            setTimeout(() => {
                if (!document.contains(btn)) return;
                btn.scrollIntoView({ block: 'nearest', behavior: 'auto' });
                btn.focus();
                const checkedBefore = btn.getAttribute('data-state') === 'checked';
                requestAnimationFrame(() => {
                    if (!document.contains(btn)) return;
                    btn.click();
                    const checkedAfter = btn.getAttribute('data-state') === 'checked';
                    if (!checkedBefore && !checkedAfter) {
                        this.invokeCheckboxHandler(btn);
                    }
                });
            }, i * 80);
        });
        Logger.log(`Accept Task Modal Improvements: auto-checked ${toCheck.length} QA checklist item(s)`);
    },

    invokeCheckboxHandler(btn) {
        try {
            const key = Object.keys(btn).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$'));
            const fiberOrProps = key ? btn[key] : null;
            if (!fiberOrProps) return;
            const props = fiberOrProps.memoizedProps || fiberOrProps;
            const handler = props.onClick || props.onKeyDown;
            if (typeof handler === 'function') {
                const ev = { target: btn, preventDefault: () => {}, nativeEvent: {} };
                handler(ev);
            }
        } catch (_) {
            Logger.debug('Accept Task Modal Improvements: could not invoke checkbox handler');
        }
    },

    ensureMotivateButton(dialog, state) {
        const notesSection = this.findOptionalNotesSection(dialog);
        if (!notesSection) {
            if (!state.missingLogged) {
                Logger.debug('Accept Task Modal Improvements: optional notes section not found');
                state.missingLogged = true;
            }
            return;
        }

        let wrapper = notesSection.querySelector('[data-fleet-plugin="acceptTaskModalImprovements"]');
        if (wrapper) {
            state.motivateButtonAdded = true;
            return;
        }

        const labelRow = notesSection.querySelector('.flex.items-center.justify-between.mb-1');
        const textarea = notesSection.querySelector('textarea');
        if (!labelRow || !textarea) {
            Logger.warn('Accept Task Modal Improvements: label or textarea not found in notes section');
            return;
        }

        wrapper = document.createElement('div');
        wrapper.setAttribute('data-fleet-plugin', this.id);
        wrapper.className = 'flex flex-col gap-2';

        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border-0 h-8 rounded-sm pl-3 pr-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-primary-foreground transition-colors shadow-[0_0_10px_rgba(0,0,0,0.1)]';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = buttonClass;
        btn.textContent = 'Motivate worker with positive comment?';
        btn.title = 'Insert a random positive feedback blurb into the optional comments box';
        btn.addEventListener('click', () => {
            const blurb = ENCOURAGEMENT_BLURBS[Math.floor(Math.random() * ENCOURAGEMENT_BLURBS.length)];
            this.setTextareaValueReactFriendly(textarea, blurb);
            Logger.log('Accept Task Modal Improvements: set positive comment (React-friendly)');
        });
        wrapper.appendChild(btn);

        textarea.insertAdjacentElement('beforebegin', wrapper);
        state.motivateButtonAdded = true;
        Logger.log('Accept Task Modal Improvements: motivate button added');
    },

    setTextareaValueReactFriendly(textarea, blurb) {
        textarea.focus();
        const previousValue = textarea.value;
        const proto = Object.getPrototypeOf(textarea);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
            descriptor.set.call(textarea, blurb);
        } else {
            textarea.value = blurb;
        }
        if (textarea._valueTracker && typeof textarea._valueTracker.setValue === 'function') {
            try {
                textarea._valueTracker.setValue(previousValue);
            } catch (_) { /* ignore */ }
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
    },

    findOptionalNotesSection(dialog) {
        const labels = dialog.querySelectorAll('.text-sm.text-muted-foreground.font-medium');
        for (const label of labels) {
            if (label.textContent.trim() === 'Other Notes/Feedback (optional)') {
                const section = label.parentElement?.parentElement || label.closest('div');
                return section;
            }
        }
        return null;
    },

    removeMotivateButton(dialog) {
        const wrapper = dialog.querySelector('[data-fleet-plugin="acceptTaskModalImprovements"]');
        if (wrapper) {
            wrapper.remove();
            Logger.debug('Accept Task Modal Improvements: motivate button removed');
        }
    }
};
