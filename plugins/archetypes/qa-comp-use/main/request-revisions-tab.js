// ============= request-revisions-tab.js =============
// Request Revisions tab that uses short-lived native modal transactions.

const RR_TAB_MARKER = 'data-fleet-rr-tab';
const RR_PANEL_MARKER = 'data-fleet-rr-tab-panel';
const RR_MANAGED_MODAL_MARKER = 'data-fleet-rr-tab-transaction-modal';
const RR_CUSTOM_REASON_MARKER = 'data-fleet-rr-reason';
const RR_REASON_OTHER_LABEL = 'Other (please explain)';
const RR_REJECTION_REASONS = [
    'Prompt is unclear or ambiguous',
    'Prompt is too simple or trivial',
    'Prompt is unrealistic or overly contrived',
    'Doesn\'t follow user story/scenario',
    'Prompt contains factual errors',
    'Task cannot be completed as described',
    'Verifier doesn\'t correctly validate the task',
    'Environment is broken or misconfigured',
    'Duplicate of existing task',
    RR_REASON_OTHER_LABEL
];

function createDefaultRejectionReasons() {
    return RR_REJECTION_REASONS.reduce((acc, label) => {
        acc[label] = false;
        return acc;
    }, {});
}

function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
}

const plugin = {
    id: 'requestRevisionsTab',
    name: 'Request Revisions Tab',
    description: 'Adds a Request Revisions tab that imports, exports, and submits through short-lived native modal transactions',
    _version: '1.7',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        tabInjected: false,
        tabButton: null,
        contentPanel: null,
        taskIssuesTextarea: null,
        attemptedActionsTextarea: null,
        generalFeedbackTextarea: null,
        otherReasonTextarea: null,
        otherReasonWrap: null,
        tabActive: false,
        rrData: {
            taskIssues: '',
            attemptedActions: '',
            generalRevisionFeedback: '',
            otherReasonExplanation: '',
            rejectionReasons: createDefaultRejectionReasons()
        },
        transactionInProgress: false,
        transactionModal: null,
        transactionBackdrop: null,
        nativeSyncBindings: [],
        nativeToCustomHandler: null,
        nativeSyncObserver: null,
        nativeSyncModal: null,
        syncingToNative: false,
        syncingFromNative: false,
        originalBodyPointerEvents: null,
        originalHtmlPointerEvents: null,
        pointerLockReleased: false,
        missingLogged: false
    },

    onMutation(state) {
        const tabList = this.findTabList();
        const contentHost = this.findContentHost();
        if (!tabList || !contentHost) {
            if (!state.missingLogged) {
                Logger.debug('Request Revisions Tab: tab list or content host not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        if (!state.tabInjected || !document.querySelector(`[${RR_TAB_MARKER}="true"]`)) {
            this.injectTab(state, tabList, contentHost);
        }

        this.syncTabVisibility(state);
        this.bindDirectNativeModalSync(state);
    },

    findTabList() {
        const instanceTab = document.querySelector('[data-ui="qa-instance-tab"]');
        return instanceTab?.closest('[role="tablist"]') || instanceTab?.parentElement || null;
    },

    findContentHost() {
        const instanceContent = document.querySelector('[data-ui="qa-instance-content"]');
        return instanceContent?.parentElement || null;
    },

    findNativeRequestRevisionsButton() {
        return document.querySelector('[data-ui="request-revisions"]');
    },

    isNativeRequestRevisionsAvailable() {
        const button = this.findNativeRequestRevisionsButton();
        if (!button || button.disabled) return false;
        const style = window.getComputedStyle(button);
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            button.getClientRects().length > 0;
    },

    syncTabVisibility(state) {
        if (!state.tabButton) return;
        const available = this.isNativeRequestRevisionsAvailable();
        state.tabButton.style.display = available ? '' : 'none';
        if (!available && state.tabActive) {
            Logger.info('Request Revisions Tab: native Request Revisions button unavailable, deactivating tab');
            this.deactivateRRTab(state);
        }
    },

    injectTab(state, tabList, contentHost) {
        const existingTab = tabList.querySelector(`[${RR_TAB_MARKER}="true"]`);
        const existingPanel = contentHost.querySelector(`[${RR_PANEL_MARKER}="true"]`);
        if (existingTab && existingPanel) {
            state.tabButton = existingTab;
            state.contentPanel = existingPanel;
            this.bindCustomControls(state, existingPanel);
            state.tabInjected = true;
            return;
        }

        const instanceTab = document.querySelector('[data-ui="qa-instance-tab"]');
        const tabButton = document.createElement('button');
        tabButton.type = 'button';
        tabButton.setAttribute('role', 'tab');
        tabButton.setAttribute('aria-selected', 'false');
        tabButton.setAttribute('aria-controls', 'fleet-rr-tab-content');
        tabButton.setAttribute('data-state', 'inactive');
        tabButton.setAttribute('data-orientation', 'horizontal');
        tabButton.setAttribute(RR_TAB_MARKER, 'true');
        tabButton.setAttribute('data-fleet-plugin', this.id);
        tabButton.style.display = this.isNativeRequestRevisionsAvailable() ? '' : 'none';
        tabButton.className = instanceTab?.className ||
            'justify-center whitespace-nowrap font-medium transition-all disabled:pointer-events-none text-muted-foreground px-3 bg-transparent ring-0 outline-none shadow-none rounded-none m-0 pt-1.5 pb-2.5 relative isolate before:absolute before:bottom-0 before:left-0 before:right-0 before:h-0.5 before:bg-transparent hover:before:bg-border data-[state=active]:before:bg-primary data-[state=active]:text-primary before:z-10 after:absolute after:inset-x-0.5 after:top-0.5 after:bottom-2.5 after:rounded-md after:bg-transparent hover:after:bg-accent after:-z-[1] after:transition-colors text-xs w-full flex items-center gap-1.5';
        tabButton.appendChild(this.createWarningIcon());
        tabButton.appendChild(document.createTextNode('Request Revisions'));
        tabButton.addEventListener('click', (event) => {
            event.preventDefault();
            this.activateRRTab(state);
        });
        tabList.appendChild(tabButton);

        const panel = this.createContentPanel(state);
        if (!contentHost.style.position) {
            contentHost.style.position = 'relative';
        }
        contentHost.appendChild(panel);

        for (const nativeTab of document.querySelectorAll('[data-ui="qa-instance-tab"], [data-ui="qa-verifier-tab"]')) {
            if (nativeTab.getAttribute('data-fleet-rr-native-listener') === 'true') continue;
            nativeTab.setAttribute('data-fleet-rr-native-listener', 'true');
            nativeTab.addEventListener('click', () => this.deactivateRRTab(state));
        }

        state.tabButton = tabButton;
        state.contentPanel = panel;
        this.bindCustomControls(state, panel);
        state.tabInjected = true;
        Logger.log('Request Revisions Tab: tab injected');
    },

    createWarningIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('class', 'size-4 text-red-600');
        const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path1.setAttribute('d', 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z');
        const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('d', 'M12 9v4');
        const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path3.setAttribute('d', 'M12 17h.01');
        svg.appendChild(path1);
        svg.appendChild(path2);
        svg.appendChild(path3);
        return svg;
    },

    createContentPanel(state) {
        const panel = document.createElement('div');
        panel.id = 'fleet-rr-tab-content';
        panel.setAttribute(RR_PANEL_MARKER, 'true');
        panel.setAttribute('data-fleet-plugin', this.id);
        panel.className = 'absolute inset-0 z-40 hidden bg-background overflow-y-auto p-4';

        const wrap = document.createElement('div');
        wrap.className = 'max-w-3xl mx-auto space-y-4';

        wrap.appendChild(this.createReasonCheckboxesSection(state));
        wrap.appendChild(this.createOtherExplanationSection(state));
        wrap.appendChild(this.createTextareaSection(state, {
            title: 'Task Issues',
            placeholder: 'Describe the specific issues with the task...',
            minHeightClass: 'min-h-[160px]',
            field: 'taskIssues',
            optional: false
        }));
        wrap.appendChild(this.createTextareaSection(state, {
            title: 'What did you try?',
            placeholder: 'Describe all the things you tried to complete this task...',
            minHeightClass: 'min-h-[100px]',
            field: 'attemptedActions',
            optional: false
        }));
        wrap.appendChild(this.createTextareaSection(state, {
            title: 'General revision feedback',
            placeholder: 'Optional: Add any additional general feedback about the task...',
            minHeightClass: 'min-h-[120px]',
            field: 'generalRevisionFeedback',
            optional: true
        }));

        const buttonRow = document.createElement('div');
        buttonRow.className = 'flex flex-wrap items-center justify-end gap-2 pt-2';
        buttonRow.appendChild(this.createActionButton('Copy Information to Native Modal', () => {
            this.runNativeModalTransaction(state, { mode: 'export', hidden: false });
        }));
        buttonRow.appendChild(this.createActionButton('Silent Request', () => {
            this.runNativeModalTransaction(state, { mode: 'submit-silent', hidden: true });
        }));
        buttonRow.appendChild(this.createActionButton('Request and Notify Author', () => {
            this.runNativeModalTransaction(state, { mode: 'submit-notify', hidden: true });
        }, true));

        wrap.appendChild(buttonRow);
        panel.appendChild(wrap);
        return panel;
    },

    createReasonCheckboxesSection(state) {
        const section = document.createElement('div');
        section.className = 'space-y-2';
        const label = document.createElement('div');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Reason(s) for rejection';
        const list = document.createElement('div');
        list.className = 'rounded-md border p-2 space-y-1 border-input';

        for (const reason of RR_REJECTION_REASONS) {
            const row = document.createElement('label');
            row.className = 'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.setAttribute(RR_CUSTOM_REASON_MARKER, reason);
            input.className = 'size-4 rounded-sm border-input';
            input.addEventListener('change', () => {
                this.setRejectionReasonFromCustom(state, reason, input.checked);
            });
            const text = document.createElement('span');
            text.textContent = reason;
            row.appendChild(input);
            row.appendChild(text);
            list.appendChild(row);
        }

        section.appendChild(label);
        section.appendChild(list);
        return section;
    },

    createOtherExplanationSection(state) {
        const section = document.createElement('div');
        section.className = 'space-y-2 hidden';
        section.setAttribute('data-fleet-rr-custom-other-wrap', 'true');

        const label = document.createElement('label');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Please explain';

        const textarea = document.createElement('textarea');
        textarea.className =
            'flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y';
        textarea.placeholder = 'Explain why you are rejecting this task...';
        textarea.setAttribute('data-fleet-rr-custom-field', 'otherReasonExplanation');
        textarea.addEventListener('input', () => {
            this.updateOtherReasonExplanationFromCustom(state, textarea.value);
        });

        section.appendChild(label);
        section.appendChild(textarea);
        return section;
    },

    createTextareaSection(state, config) {
        const section = document.createElement('div');
        section.className = 'space-y-2';
        const label = document.createElement('label');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = config.optional ? `${config.title} (optional)` : config.title;

        const textarea = document.createElement('textarea');
        textarea.className =
            `flex ${config.minHeightClass} w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y`;
        textarea.placeholder = config.placeholder;
        textarea.setAttribute('data-fleet-rr-custom-field', config.field);
        textarea.addEventListener('input', () => this.updateCustomFieldFromInput(state, config.field, textarea.value));

        section.appendChild(label);
        section.appendChild(textarea);
        return section;
    },

    createActionButton(label, onClick, primary = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = primary
            ? 'inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:text-destructive-foreground transition-colors hover:bg-destructive h-9 pl-4 pr-4 py-2'
            : 'inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-9 pl-4 pr-4 py-2';
        button.textContent = label;
        button.addEventListener('click', onClick);
        return button;
    },

    activateRRTab(state) {
        if (!state.contentPanel || !state.tabButton) return;
        if (!this.isNativeRequestRevisionsAvailable()) {
            Logger.warn('Request Revisions Tab: native Request Revisions button is not available');
            return;
        }
        state.tabActive = true;
        state.contentPanel.classList.remove('hidden');
        this.syncTabState(state, true);
        this.syncCustomControlsFromState(state);
        Logger.info('Request Revisions Tab: activated');
        this.runNativeModalTransaction(state, { mode: 'import', hidden: true });
    },

    deactivateRRTab(state) {
        if (!state.tabActive) return;
        state.tabActive = false;
        if (state.contentPanel) {
            state.contentPanel.classList.add('hidden');
        }
        this.syncTabState(state, false);
        this.runNativeModalTransaction(state, { mode: 'export', hidden: true });
        Logger.info('Request Revisions Tab: deactivated');
    },

    syncTabState(state, active) {
        const rrTab = state.tabButton;
        if (rrTab) {
            rrTab.setAttribute('aria-selected', active ? 'true' : 'false');
            rrTab.setAttribute('data-state', active ? 'active' : 'inactive');
        }

        for (const nativeTab of document.querySelectorAll('[data-ui="qa-instance-tab"], [data-ui="qa-verifier-tab"]')) {
            if (active) {
                nativeTab.setAttribute('aria-selected', 'false');
                nativeTab.setAttribute('data-state', 'inactive');
            }
        }
    },

    bindCustomControls(state, panel) {
        state.taskIssuesTextarea = panel.querySelector('[data-fleet-rr-custom-field="taskIssues"]');
        state.attemptedActionsTextarea = panel.querySelector('[data-fleet-rr-custom-field="attemptedActions"]');
        state.generalFeedbackTextarea = panel.querySelector('[data-fleet-rr-custom-field="generalRevisionFeedback"]');
        state.otherReasonTextarea = panel.querySelector('[data-fleet-rr-custom-field="otherReasonExplanation"]');
        state.otherReasonWrap = panel.querySelector('[data-fleet-rr-custom-other-wrap="true"]');
    },

    updateCustomFieldFromInput(state, field, value) {
        if (state.syncingFromNative) return;
        if (field === 'taskIssues') state.rrData.taskIssues = value || '';
        if (field === 'attemptedActions') state.rrData.attemptedActions = value || '';
        if (field === 'generalRevisionFeedback') state.rrData.generalRevisionFeedback = value || '';
        if (field === 'otherReasonExplanation') state.rrData.otherReasonExplanation = value || '';
    },

    updateTaskIssuesFromCustom(state, value) {
        this.updateCustomFieldFromInput(state, 'taskIssues', value);
    },

    updateOtherReasonExplanationFromCustom(state, value) {
        this.updateCustomFieldFromInput(state, 'otherReasonExplanation', value);
    },

    setRejectionReasonFromCustom(state, label, checked) {
        if (state.syncingFromNative) return;
        state.rrData.rejectionReasons[label] = Boolean(checked);
        if (label === RR_REASON_OTHER_LABEL && !checked) {
            state.rrData.otherReasonExplanation = '';
        }
        this.syncCustomControlsFromState(state);
    },

    updateTaskIssuesFromNative(state, value) {
        state.rrData.taskIssues = value || '';
    },

    updateFromNativeModalSnapshot(state, snapshot) {
        state.rrData.taskIssues = snapshot.taskIssues || '';
        state.rrData.attemptedActions = snapshot.attemptedActions || '';
        state.rrData.generalRevisionFeedback = snapshot.generalRevisionFeedback || '';
        state.rrData.otherReasonExplanation = snapshot.otherReasonExplanation || '';
        state.rrData.rejectionReasons = {
            ...createDefaultRejectionReasons(),
            ...(snapshot.rejectionReasons || {})
        };
        this.syncCustomControlsFromState(state);
    },

    syncCustomControlsFromState(state) {
        if (!state.taskIssuesTextarea) return;
        state.syncingFromNative = true;
        try {
            this.setTextareaValueSilently(state.taskIssuesTextarea, state.rrData.taskIssues || '');
            this.setTextareaValueSilently(state.attemptedActionsTextarea, state.rrData.attemptedActions || '');
            this.setTextareaValueSilently(state.generalFeedbackTextarea, state.rrData.generalRevisionFeedback || '');

            const reasonInputs = state.contentPanel?.querySelectorAll(`input[type="checkbox"][${RR_CUSTOM_REASON_MARKER}]`) || [];
            for (const input of reasonInputs) {
                const reason = input.getAttribute(RR_CUSTOM_REASON_MARKER);
                input.checked = Boolean(state.rrData.rejectionReasons?.[reason]);
            }

            const showOther = Boolean(state.rrData.rejectionReasons?.[RR_REASON_OTHER_LABEL]);
            if (state.otherReasonWrap) state.otherReasonWrap.classList.toggle('hidden', !showOther);
            if (state.otherReasonTextarea) {
                this.setTextareaValueSilently(
                    state.otherReasonTextarea,
                    showOther ? (state.rrData.otherReasonExplanation || '') : ''
                );
            }
        } finally {
            state.syncingFromNative = false;
        }
    },

    async runNativeModalTransaction(state, options) {
        if (state.transactionInProgress) {
            Logger.warn('Request Revisions Tab: native modal transaction already in progress');
            return false;
        }
        state.transactionInProgress = true;
        const hidden = options.hidden !== false;
        let modal = null;
        let closeWhenDone = hidden || options.mode !== 'export';
        try {
            modal = await this.openNativeModal(state, { hidden });
            if (!modal) {
                Logger.warn(`Request Revisions Tab: transaction "${options.mode}" could not open native modal`);
                return false;
            }

            if (options.mode === 'import') {
                await this.importFromNativeModal(state, modal);
                Logger.info('Request Revisions Tab: imported native modal state');
                return true;
            }

            await this.exportToNativeModal(state, modal);
            if (options.mode === 'export') {
                Logger.info(hidden
                    ? 'Request Revisions Tab: saved custom state into hidden native modal'
                    : 'Request Revisions Tab: copied custom state into visible native modal');
                closeWhenDone = hidden;
                return true;
            }

            const verified = await this.verifyNativeModalCopy(state, modal);
            if (!verified) {
                Logger.error('Request Revisions Tab: native modal copy verification failed; submit cancelled');
                return false;
            }

            const buttonLabel = options.mode === 'submit-silent' ? 'Silent Request' : 'Request and Notify Author';
            const submitButton = this.findButtonByText(modal, buttonLabel);
            if (!submitButton) {
                Logger.error(`Request Revisions Tab: native submit button not found: ${buttonLabel}`);
                return false;
            }
            submitButton.click();
            closeWhenDone = false;
            Logger.info(`Request Revisions Tab: clicked native "${buttonLabel}"`);
            return true;
        } catch (error) {
            Logger.error(`Request Revisions Tab: native modal transaction failed (${options.mode})`, error);
            return false;
        } finally {
            if (closeWhenDone && modal && document.body.contains(modal)) {
                this.closeNativeModal(modal);
            }
            this.cleanupTransactionStyles(state);
            state.transactionModal = null;
            state.transactionBackdrop = null;
            state.transactionInProgress = false;
            state.nativeSyncModal = null;
        }
    },

    async openNativeModal(state, options) {
        const existing = this.findRequestRevisionsModal();
        if (existing) {
            state.transactionModal = existing;
            state.transactionBackdrop = this.findBackdropForModal(existing);
            if (options.hidden) this.applyHiddenTransactionStyles(state, existing, state.transactionBackdrop);
            return existing;
        }

        const nativeButton = this.findNativeRequestRevisionsButton();
        if (!nativeButton) {
            Logger.warn('Request Revisions Tab: native Request Revisions button not found');
            return null;
        }

        let preHideObserver = null;
        if (options.hidden) {
            preHideObserver = new MutationObserver(() => {
                const modal = this.findRequestRevisionsModal();
                if (!modal) return;
                this.applyHiddenTransactionStyles(state, modal, this.findBackdropForModal(modal));
            });
            preHideObserver.observe(document.body, { childList: true, subtree: true });
        }

        nativeButton.click();
        const modal = await this.waitForModal();
        if (preHideObserver) preHideObserver.disconnect();
        if (!modal) return null;

        state.transactionModal = modal;
        state.transactionBackdrop = this.findBackdropForModal(modal);
        if (options.hidden) {
            this.applyHiddenTransactionStyles(state, modal, state.transactionBackdrop);
        }
        return modal;
    },

    waitForModal(timeoutMs = 3000) {
        const existing = this.findRequestRevisionsModal();
        if (existing) return Promise.resolve(existing);

        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const modal = this.findRequestRevisionsModal();
                if (!modal) return;
                observer.disconnect();
                resolve(modal);
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(this.findRequestRevisionsModal());
            }, timeoutMs);
        });
    },

    findRequestRevisionsModal() {
        const dialogs = document.querySelectorAll('div[role="dialog"][data-state="open"]');
        for (const dialog of dialogs) {
            const heading = dialog.querySelector('h2');
            if (heading && heading.textContent.includes('Request Revisions')) {
                return dialog;
            }
        }
        return null;
    },

    findBackdropForModal(modal) {
        let previous = modal?.previousElementSibling || null;
        while (previous) {
            if (
                previous.getAttribute?.('data-state') === 'open' &&
                previous.getAttribute?.('data-aria-hidden') === 'true' &&
                (previous.getAttribute('class') || '').includes('bg-black')
            ) {
                return previous;
            }
            previous = previous.previousElementSibling;
        }
        return document.querySelector('div[data-aria-hidden="true"][data-state="open"][class*="bg-black"]');
    },

    applyHiddenTransactionStyles(state, modal, backdrop) {
        state.transactionModal = modal;
        state.transactionBackdrop = backdrop;
        if (modal) {
            modal.setAttribute(RR_MANAGED_MODAL_MARKER, 'true');
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';
            modal.style.left = '-9999px';
            modal.style.top = '0';
        }
        if (backdrop) {
            backdrop.style.opacity = '0';
            backdrop.style.pointerEvents = 'none';
        }
        this.releasePageInteractionLock(state);
    },

    cleanupTransactionStyles(state) {
        this.restorePageInteractionLock(state);
    },

    releasePageInteractionLock(state) {
        if (!state.pointerLockReleased) {
            state.originalBodyPointerEvents = document.body.style.pointerEvents || '';
            state.originalHtmlPointerEvents = document.documentElement.style.pointerEvents || '';
            state.pointerLockReleased = true;
        }
        document.body.style.pointerEvents = '';
        document.documentElement.style.pointerEvents = '';
    },

    restorePageInteractionLock(state) {
        if (!state.pointerLockReleased) return;
        document.body.style.pointerEvents = state.originalBodyPointerEvents || '';
        document.documentElement.style.pointerEvents = state.originalHtmlPointerEvents || '';
        state.originalBodyPointerEvents = null;
        state.originalHtmlPointerEvents = null;
        state.pointerLockReleased = false;
    },

    closeNativeModal(modal) {
        const closeButton = this.findModalCloseButton(modal);
        if (closeButton) {
            closeButton.click();
            return true;
        }
        Logger.warn('Request Revisions Tab: modal close button not found');
        return false;
    },

    findModalCloseButton(modal) {
        const srClose = Array.from(modal.querySelectorAll('button')).find((button) => {
            const srOnly = button.querySelector('.sr-only');
            return srOnly && srOnly.textContent.trim() === 'Close';
        });
        if (srClose) return srClose;
        return Array.from(modal.querySelectorAll('button')).find((button) =>
            button.textContent.trim() === 'Cancel'
        ) || null;
    },

    async importFromNativeModal(state, modal) {
        const taskTextarea = await this.ensureTaskSelected(modal);
        if (!taskTextarea) {
            Logger.warn('Request Revisions Tab: native Task textarea not found during import');
            return;
        }
        const snapshot = this.readNativeModalSnapshot(modal);
        snapshot.taskIssues = taskTextarea.value || '';
        this.updateFromNativeModalSnapshot(state, snapshot);
    },

    async exportToNativeModal(state, modal) {
        const taskTextarea = await this.ensureTaskSelected(modal);
        if (!taskTextarea) {
            Logger.warn('Request Revisions Tab: native Task textarea not found during export');
            return false;
        }
        state.syncingToNative = true;
        try {
            this.setInputValue(taskTextarea, state.rrData.taskIssues || '');
            const attempted = modal.querySelector('textarea[id^="attempted-actions-"]');
            const general = modal.querySelector('textarea#discard-reason');
            if (attempted) this.setInputValue(attempted, state.rrData.attemptedActions || '');
            if (general) this.setInputValue(general, state.rrData.generalRevisionFeedback || '');

            await this.syncNativeRejectionCheckboxes(state, modal);
            if (state.rrData.rejectionReasons?.[RR_REASON_OTHER_LABEL]) {
                const other = await this.waitForOtherReasonTextarea(modal, 2000);
                if (other) this.setInputValue(other, state.rrData.otherReasonExplanation || '');
            }
        } finally {
            state.syncingToNative = false;
        }
        return true;
    },

    async verifyNativeModalCopy(state, modal) {
        if (this.nativeModalMatchesState(state, modal)) {
            return true;
        }
        await this.waitForAnimationFrame();
        if (this.nativeModalMatchesState(state, modal)) {
            return true;
        }
        await this.exportToNativeModal(state, modal);
        await this.waitForAnimationFrame();
        if (this.nativeModalMatchesState(state, modal)) return true;
        return false;
    },

    async ensureTaskSelected(modal) {
        const taskButton = this.findIssueButton(modal, 'Task');
        if (!taskButton) {
            Logger.warn('Request Revisions Tab: Task issue button not found');
            return null;
        }
        if (!this.isIssueButtonSelected(taskButton)) {
            taskButton.click();
            Logger.info('Request Revisions Tab: Task issue section opened');
            await this.waitForAnimationFrame();
        }
        return this.waitForTaskTextarea(modal, 3000);
    },

    waitForTaskTextarea(modal, timeoutMs = 3000) {
        const existing = modal.querySelector('textarea#feedback-Task');
        if (existing) return Promise.resolve(existing);
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const textarea = modal.querySelector('textarea#feedback-Task');
                if (!textarea) return;
                observer.disconnect();
                resolve(textarea);
            });
            observer.observe(modal, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(modal.querySelector('textarea#feedback-Task'));
            }, timeoutMs);
        });
    },

    waitForOtherReasonTextarea(modal, timeoutMs = 2000) {
        const existing = modal.querySelector('textarea#other-reason-explanation');
        if (existing) return Promise.resolve(existing);
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const textarea = modal.querySelector('textarea#other-reason-explanation');
                if (!textarea) return;
                observer.disconnect();
                resolve(textarea);
            });
            observer.observe(modal, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(modal.querySelector('textarea#other-reason-explanation'));
            }, timeoutMs);
        });
    },

    readNativeModalSnapshot(modal) {
        const rejectionReasons = this.readNativeRejectionReasons(modal);
        return {
            taskIssues: modal.querySelector('textarea#feedback-Task')?.value || '',
            attemptedActions: modal.querySelector('textarea[id^="attempted-actions-"]')?.value || '',
            generalRevisionFeedback: modal.querySelector('textarea#discard-reason')?.value || '',
            rejectionReasons,
            otherReasonExplanation: rejectionReasons[RR_REASON_OTHER_LABEL]
                ? (modal.querySelector('textarea#other-reason-explanation')?.value || '')
                : ''
        };
    },

    nativeModalMatchesState(state, modal) {
        const snapshot = this.readNativeModalSnapshot(modal);
        if ((snapshot.taskIssues || '') !== (state.rrData.taskIssues || '')) return false;
        if ((snapshot.attemptedActions || '') !== (state.rrData.attemptedActions || '')) return false;
        if ((snapshot.generalRevisionFeedback || '') !== (state.rrData.generalRevisionFeedback || '')) return false;
        for (const reason of RR_REJECTION_REASONS) {
            if (Boolean(snapshot.rejectionReasons[reason]) !== Boolean(state.rrData.rejectionReasons[reason])) {
                return false;
            }
        }
        if (Boolean(state.rrData.rejectionReasons[RR_REASON_OTHER_LABEL])) {
            if ((snapshot.otherReasonExplanation || '') !== (state.rrData.otherReasonExplanation || '')) return false;
        }
        return true;
    },

    findNativeRejectionContainer(modal) {
        const headings = modal.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-2');
        for (const heading of headings) {
            if (normalizeText(heading.textContent).includes('Reason(s) for rejection')) {
                return heading.nextElementSibling;
            }
        }
        return null;
    },

    findNativeRejectionButton(modal, reasonLabel) {
        const container = this.findNativeRejectionContainer(modal);
        if (!container) return null;
        for (const label of container.querySelectorAll('label')) {
            const text = normalizeText(label.textContent);
            if (text !== reasonLabel) continue;
            return label.querySelector('button[role="checkbox"]');
        }
        return null;
    },

    isNativeCheckboxChecked(button) {
        if (!button) return false;
        return button.getAttribute('aria-checked') === 'true' || button.getAttribute('data-state') === 'checked';
    },

    readNativeRejectionReasons(modal) {
        const reasons = createDefaultRejectionReasons();
        for (const label of RR_REJECTION_REASONS) {
            const button = this.findNativeRejectionButton(modal, label);
            reasons[label] = this.isNativeCheckboxChecked(button);
        }
        return reasons;
    },

    async syncNativeRejectionCheckboxes(state, modal) {
        for (const label of RR_REJECTION_REASONS) {
            const button = this.findNativeRejectionButton(modal, label);
            if (!button) continue;
            const desired = Boolean(state.rrData.rejectionReasons?.[label]);
            if (this.isNativeCheckboxChecked(button) === desired) continue;
            button.click();
            if (label === RR_REASON_OTHER_LABEL && desired) {
                await this.waitForOtherReasonTextarea(modal, 2000);
            }
        }
    },

    findIssueButton(modal, labelText) {
        const labels = modal.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-3');
        for (const label of labels) {
            if (!label.textContent.includes('Where are the issues')) continue;
            const row = label.nextElementSibling;
            if (!row) return null;
            for (const button of row.querySelectorAll('button')) {
                const span = button.querySelector('span.text-sm.font-medium');
                if (span && span.textContent.trim() === labelText) {
                    return button;
                }
            }
        }
        return null;
    },

    isIssueButtonSelected(button) {
        const classes = new Set((button.getAttribute('class') || '').split(/\s+/));
        return classes.has('border-brand') || classes.has('text-brand');
    },

    findButtonByText(root, labelText) {
        return Array.from(root.querySelectorAll('button')).find((button) =>
            button.textContent.replace(/\s+/g, ' ').trim() === labelText
        ) || null;
    },

    bindDirectNativeModalSync(state) {
        const modal = this.findRequestRevisionsModal();
        if (!modal || modal === state.transactionModal || modal.hasAttribute(RR_MANAGED_MODAL_MARKER)) {
            if (!modal) this.unbindNativeTaskIssuesSync(state);
            return;
        }

        if (state.tabActive && state.nativeSyncModal !== modal) {
            state.nativeSyncModal = modal;
            this.exportToNativeModal(state, modal).then(() => {
                this.bindDirectNativeModalSync(state);
            });
            return;
        }

        if (state.nativeSyncModal !== modal || !state.nativeToCustomHandler) {
            this.unbindNativeTaskIssuesSync(state);
            this.bindNativeModalControls(state, modal);
            Logger.debug('Request Revisions Tab: direct native modal sync bound');
        }
    },

    bindNativeModalControls(state, modal) {
        if (state.nativeSyncBindings?.length || state.nativeSyncObserver) {
            this.unbindNativeTaskIssuesSync(state);
        }
        state.nativeSyncModal = modal;
        state.nativeToCustomHandler = () => this.syncNativeModalToCustom(state);
        const handler = state.nativeToCustomHandler;
        state.nativeSyncBindings = [];

        const bind = (element, eventName) => {
            if (!element) return;
            element.addEventListener(eventName, handler);
            state.nativeSyncBindings.push({ element, eventName });
        };

        bind(modal.querySelector('textarea#feedback-Task'), 'input');
        bind(modal.querySelector('textarea#feedback-Task'), 'change');
        bind(modal.querySelector('textarea[id^="attempted-actions-"]'), 'input');
        bind(modal.querySelector('textarea[id^="attempted-actions-"]'), 'change');
        bind(modal.querySelector('textarea#discard-reason'), 'input');
        bind(modal.querySelector('textarea#discard-reason'), 'change');
        bind(modal.querySelector('textarea#other-reason-explanation'), 'input');
        bind(modal.querySelector('textarea#other-reason-explanation'), 'change');

        for (const reason of RR_REJECTION_REASONS) {
            bind(this.findNativeRejectionButton(modal, reason), 'click');
        }

        state.nativeSyncObserver = new MutationObserver(() => {
            if (!state.tabActive || state.syncingToNative) return;
            this.bindNativeModalControls(state, modal);
            this.syncNativeModalToCustom(state);
        });
        state.nativeSyncObserver.observe(modal, { childList: true, subtree: true });
        this.syncNativeModalToCustom(state);
    },

    unbindNativeTaskIssuesSync(state) {
        if (state.nativeSyncBindings?.length && state.nativeToCustomHandler) {
            for (const binding of state.nativeSyncBindings) {
                binding.element?.removeEventListener(binding.eventName, state.nativeToCustomHandler);
            }
        }
        state.nativeSyncObserver?.disconnect();
        state.nativeSyncBindings = [];
        state.nativeToCustomHandler = null;
        state.nativeSyncObserver = null;
        state.nativeSyncModal = null;
    },

    syncNativeModalToCustom(state) {
        if (state.syncingToNative || !state.nativeSyncModal) return;
        state.syncingFromNative = true;
        try {
            const snapshot = this.readNativeModalSnapshot(state.nativeSyncModal);
            this.updateFromNativeModalSnapshot(state, snapshot);
        } finally {
            state.syncingFromNative = false;
        }
    },

    setTextareaValueSilently(el, value) {
        if (!el) return;
        if (el.value === value) return;
        const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
    },

    setInputValue(el, value) {
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    },

    waitForAnimationFrame() {
        return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
};
