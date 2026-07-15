// ============= accept-task-modal-improvements.js (library) =============
// QA Accept/Approve Task modal: "Motivate worker" button above optional comments.

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

const AcceptTaskModalApi = {
    run(state, options) {
        const pluginId = (options && options.pluginId) || 'acceptTaskModalImprovements';
        const logTag = (options && options.logTag) || pluginId;

        const dialogs = Context.dom.queryAll('div[role="dialog"][data-state="open"]', {
            context: logTag + '.dialogs'
        });

        let approveModal = null;
        for (const dialog of dialogs) {
            const heading = Context.dom.query('h2', { root: dialog, context: logTag + '.heading' });
            if (heading && heading.textContent.trim() === 'Approve Task') {
                approveModal = dialog;
                break;
            }
        }

        if (!approveModal) {
            if (state.lastProcessedDialog) {
                state.lastProcessedDialog = null;
                state.motivateButtonAdded = false;
            }
            if (!state.missingLogged) {
                Logger.debug(logTag + ': Approve Task dialog not found');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;

        const motivateEnabled = Storage.getSubOptionEnabled(pluginId, 'motivate-worker-button', true);
        if (motivateEnabled) {
            this.ensureMotivateButton(approveModal, state, pluginId, logTag);
        } else {
            this.removeMotivateButton(approveModal, pluginId);
            state.motivateButtonAdded = false;
        }
    },

    ensureMotivateButton(dialog, state, pluginId, logTag) {
        const notesSection = this.findOptionalNotesSection(dialog);
        if (!notesSection) {
            if (!state.missingLogged) {
                Logger.debug(logTag + ': optional notes section not found');
                state.missingLogged = true;
            }
            return;
        }

        let wrapper = notesSection.querySelector('[data-fleet-plugin="' + pluginId + '"]');
        if (wrapper) {
            state.motivateButtonAdded = true;
            return;
        }

        const labelRow = notesSection.querySelector('.flex.items-center.justify-between.mb-1');
        const textarea = notesSection.querySelector('textarea');
        if (!labelRow || !textarea) {
            Logger.warn(logTag + ': label or textarea not found in notes section');
            return;
        }

        wrapper = document.createElement('div');
        wrapper.setAttribute('data-fleet-plugin', pluginId);
        wrapper.className = 'flex flex-col gap-2';

        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-emerald-600 bg-transparent text-emerald-600 hover:bg-emerald-50 hover:border-emerald-700 h-8 rounded-sm pl-3 pr-3 text-xs transition-colors';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = buttonClass;
        btn.textContent = 'Motivate worker with positive comment?';
        btn.title = 'Insert a random positive feedback blurb into the optional comments box';
        btn.addEventListener('click', () => {
            const blurb = ENCOURAGEMENT_BLURBS[Math.floor(Math.random() * ENCOURAGEMENT_BLURBS.length)];
            this.setTextareaValueReactFriendly(textarea, blurb);
            Logger.log(logTag + ': set positive comment (React-friendly)');
        });
        wrapper.appendChild(btn);

        textarea.insertAdjacentElement('beforebegin', wrapper);
        state.motivateButtonAdded = true;
        Logger.log(logTag + ': motivate button added');
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

    removeMotivateButton(dialog, pluginId) {
        const wrapper = dialog.querySelector('[data-fleet-plugin="' + pluginId + '"]');
        if (wrapper) {
            wrapper.remove();
            Logger.debug('Accept Task Modal Improvements: motivate button removed');
        }
    }
};

const plugin = {
    id: 'acceptTaskModalImprovementsLib',
    name: '"Accept Task" Modal Improvements (library)',
    description: 'Shared API for the Approve Task motivate-worker button',
    _version: '2.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.acceptTaskModalImprovements = {
            run: (s, options) => AcceptTaskModalApi.run(s, options)
        };
        if (!state.registered) {
            Logger.log('acceptTaskModalImprovementsLib: module registered (Context.acceptTaskModalImprovements)');
            state.registered = true;
        }
    }
};
