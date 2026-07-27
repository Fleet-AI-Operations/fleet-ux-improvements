// ============= task-instructions-dismiss.js =============
// Task Instructions alertdialog: top-right X to hide early, auto-click ack when enabled.

const plugin = {
    id: 'taskInstructionsDismiss',
    name: 'Task Instructions Dismiss',
    description:
        'Adds a close control on the Task Instructions dialog so you can use the page during the countdown, then clicks I Understand once the button enables',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false,
        visuallyHidden: false,
        autoClicked: false,
        watchedButton: null,
        buttonObserver: null,
        dialogEl: null
    },

    onMutation(state) {
        const dialog = this.findInstructionsDialog();
        if (!dialog) {
            this.teardownWatch(state);
            if (state.activationLogged || state.visuallyHidden || state.autoClicked) {
                Logger.debug('taskInstructionsDismiss: Task Instructions dialog gone — reset');
            }
            state.missingLogged = false;
            state.activationLogged = false;
            state.visuallyHidden = false;
            state.autoClicked = false;
            state.dialogEl = null;
            return;
        }

        if (state.dialogEl && state.dialogEl !== dialog) {
            this.teardownWatch(state);
            state.visuallyHidden = false;
            state.autoClicked = false;
            state.activationLogged = false;
        }
        state.dialogEl = dialog;

        const ackBtn = this.findAckButton(dialog);
        if (!ackBtn) {
            if (!state.missingLogged) {
                Logger.debug('taskInstructionsDismiss: ack button not found yet');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        this.ensureCloseButton(dialog, state);
        this.ensureButtonWatch(ackBtn, state);

        if (!state.activationLogged) {
            Logger.log('taskInstructionsDismiss: Task Instructions dialog ready (X + auto-ack watch)');
            state.activationLogged = true;
        }

        this.tryAutoClick(ackBtn, state);
    },

    findInstructionsDialog() {
        const dialogs = document.querySelectorAll('[role="alertdialog"][data-state="open"]');
        for (const dialog of dialogs) {
            const heading = dialog.querySelector('h2');
            if (!heading) continue;
            if (!/Task Instructions/i.test((heading.textContent || '').trim())) continue;
            return dialog;
        }
        return null;
    },

    findAckButton(dialog) {
        const buttons = dialog.querySelectorAll('button');
        for (const btn of buttons) {
            const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
            if (/I Understand/i.test(text) || /Start Working/i.test(text)) {
                return btn;
            }
        }
        return null;
    },

    findBackdrop(dialog) {
        const prev = dialog.previousElementSibling;
        if (
            prev &&
            prev.getAttribute('data-state') === 'open' &&
            prev.classList.contains('fixed') &&
            prev.classList.contains('inset-0')
        ) {
            return prev;
        }
        const candidates = document.querySelectorAll(
            'div.fixed.inset-0.z-50[data-state="open"]'
        );
        for (const el of candidates) {
            if (el.getAttribute('aria-hidden') === 'true' || el.classList.contains('backdrop-blur-md')) {
                return el;
            }
        }
        return null;
    },

    ensureCloseButton(dialog, state) {
        const existing = dialog.querySelector(
            '[data-fleet-plugin="taskInstructionsDismiss"][data-slot="instructions-close"]'
        );
        if (existing) return existing;

        const computed = getComputedStyle(dialog);
        if (computed.position === 'static') {
            dialog.style.position = 'relative';
        }

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('data-fleet-plugin', this.id);
        closeBtn.setAttribute('data-slot', 'instructions-close');
        closeBtn.setAttribute('aria-label', 'Hide instructions');
        closeBtn.title = 'Hide instructions and use the page';
        closeBtn.textContent = '×';
        closeBtn.style.cssText = [
            'position: absolute',
            'top: 12px',
            'right: 12px',
            'z-index: 1',
            'display: inline-flex',
            'align-items: center',
            'justify-content: center',
            'width: 28px',
            'height: 28px',
            'padding: 0',
            'margin: 0',
            'border: none',
            'border-radius: 6px',
            'background: transparent',
            'color: var(--foreground, #333)',
            'font-size: 22px',
            'line-height: 1',
            'cursor: pointer'
        ].join(';');

        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideDialogVisually(dialog, state);
        });

        dialog.appendChild(closeBtn);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerElement) {
            CleanupRegistry.registerElement(closeBtn);
        }
        Logger.log('taskInstructionsDismiss: close control injected');
        return closeBtn;
    },

    hideDialogVisually(dialog, state) {
        if (state.visuallyHidden) return;
        const backdrop = this.findBackdrop(dialog);
        const hide = (el) => {
            if (!el) return;
            el.style.display = 'none';
            el.style.pointerEvents = 'none';
        };
        hide(dialog);
        hide(backdrop);
        state.visuallyHidden = true;
        Logger.log('taskInstructionsDismiss: dialog hidden via X (page interactive; auto-ack still pending)');
    },

    ensureButtonWatch(ackBtn, state) {
        if (state.watchedButton === ackBtn && state.buttonObserver) return;

        this.teardownWatch(state);
        state.watchedButton = ackBtn;

        const self = this;
        const observer = new MutationObserver(() => {
            self.tryAutoClick(ackBtn, state);
        });
        observer.observe(ackBtn, {
            attributes: true,
            attributeFilter: ['disabled', 'class', 'aria-disabled']
        });
        state.buttonObserver = observer;
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerObserver) {
            CleanupRegistry.registerObserver(observer);
        }
    },

    tryAutoClick(ackBtn, state) {
        if (state.autoClicked || !ackBtn || !ackBtn.isConnected) return;
        if (ackBtn.disabled) return;
        if (ackBtn.getAttribute('aria-disabled') === 'true') return;

        state.autoClicked = true;
        this.teardownWatch(state);
        try {
            ackBtn.click();
            Logger.log('taskInstructionsDismiss: auto-clicked I Understand - Start Working');
        } catch (e) {
            state.autoClicked = false;
            Logger.error('taskInstructionsDismiss: auto-click failed', e);
            this.ensureButtonWatch(ackBtn, state);
        }
    },

    teardownWatch(state) {
        if (state.buttonObserver) {
            try {
                state.buttonObserver.disconnect();
            } catch (e) {
                /* ignore */
            }
            state.buttonObserver = null;
        }
        state.watchedButton = null;
    }
};
