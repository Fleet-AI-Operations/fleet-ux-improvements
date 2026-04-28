// ============= request-revisions-tab.js =============
// Request Revisions tab that uses short-lived native modal transactions.

const RR_TAB_MARKER = 'data-fleet-rr-tab';
const RR_PANEL_MARKER = 'data-fleet-rr-tab-panel';
const RR_MANAGED_MODAL_MARKER = 'data-fleet-rr-tab-transaction-modal';

const plugin = {
    id: 'requestRevisionsTab',
    name: 'Request Revisions Tab',
    description: 'Adds a Request Revisions tab that imports, exports, and submits through short-lived native modal transactions',
    _version: '1.4',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        tabInjected: false,
        tabButton: null,
        contentPanel: null,
        taskIssuesTextarea: null,
        tabActive: false,
        rrData: {
            taskIssues: ''
        },
        transactionInProgress: false,
        transactionModal: null,
        transactionBackdrop: null,
        nativeTaskTextarea: null,
        nativeToCustomHandler: null,
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
            state.taskIssuesTextarea = existingPanel.querySelector('textarea');
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
        state.taskIssuesTextarea = panel.querySelector('textarea');
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

        const fieldWrap = document.createElement('div');
        fieldWrap.className = 'space-y-2';

        const label = document.createElement('label');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Task Issues';

        const textarea = document.createElement('textarea');
        textarea.className =
            'flex min-h-[160px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y';
        textarea.placeholder = 'Describe the specific issues with the task...';
        textarea.addEventListener('input', () => {
            this.updateTaskIssuesFromCustom(state, textarea.value);
        });

        fieldWrap.appendChild(label);
        fieldWrap.appendChild(textarea);

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

        wrap.appendChild(fieldWrap);
        wrap.appendChild(buttonRow);
        panel.appendChild(wrap);
        return panel;
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

    updateTaskIssuesFromCustom(state, value) {
        if (state.syncingFromNative) return;
        state.rrData.taskIssues = value || '';
    },

    updateTaskIssuesFromNative(state, value) {
        state.rrData.taskIssues = value || '';
        this.syncCustomControlsFromState(state);
    },

    syncCustomControlsFromState(state) {
        if (!state.taskIssuesTextarea) return;
        const next = state.rrData.taskIssues || '';
        if (state.taskIssuesTextarea.value === next) return;
        state.syncingFromNative = true;
        try {
            this.setInputValue(state.taskIssuesTextarea, next);
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
        await this.ensureTaskSelected(modal);
        const taskTextarea = await this.waitForTaskTextarea(modal);
        if (!taskTextarea) {
            Logger.warn('Request Revisions Tab: native Task textarea not found during import');
            return;
        }
        this.updateTaskIssuesFromNative(state, taskTextarea.value || '');
    },

    async exportToNativeModal(state, modal) {
        await this.ensureTaskSelected(modal);
        const taskTextarea = await this.waitForTaskTextarea(modal);
        if (!taskTextarea) {
            Logger.warn('Request Revisions Tab: native Task textarea not found during export');
            return false;
        }
        state.syncingToNative = true;
        try {
            this.setInputValue(taskTextarea, state.rrData.taskIssues || '');
        } finally {
            state.syncingToNative = false;
        }
        return true;
    },

    async verifyNativeModalCopy(state, modal) {
        let taskTextarea = modal.querySelector('textarea#feedback-Task');
        if (taskTextarea && taskTextarea.value === (state.rrData.taskIssues || '')) {
            return true;
        }
        await this.waitForAnimationFrame();
        taskTextarea = modal.querySelector('textarea#feedback-Task');
        if (taskTextarea && taskTextarea.value === (state.rrData.taskIssues || '')) {
            return true;
        }
        if (taskTextarea) {
            this.setInputValue(taskTextarea, state.rrData.taskIssues || '');
            await this.waitForAnimationFrame();
            return taskTextarea.value === (state.rrData.taskIssues || '');
        }
        return false;
    },

    ensureTaskSelected(modal) {
        const taskButton = this.findIssueButton(modal, 'Task');
        if (!taskButton) {
            Logger.warn('Request Revisions Tab: Task issue button not found');
            return Promise.resolve(false);
        }
        if (this.isIssueButtonSelected(taskButton)) return Promise.resolve(true);
        taskButton.click();
        Logger.info('Request Revisions Tab: Task issue section opened');
        return this.waitForAnimationFrame().then(() => true);
    },

    waitForTaskTextarea(modal, timeoutMs = 1000) {
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
        const className = button.getAttribute('class') || '';
        return className.includes('border-brand') || className.includes('text-brand');
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

        const taskTextarea = modal.querySelector('textarea#feedback-Task');
        if (!taskTextarea) return;
        if (state.nativeTaskTextarea === taskTextarea && state.nativeToCustomHandler) return;

        this.unbindNativeTaskIssuesSync(state);
        state.nativeTaskTextarea = taskTextarea;
        state.nativeToCustomHandler = () => this.syncNativeTaskIssuesToCustom(state);
        taskTextarea.addEventListener('input', state.nativeToCustomHandler);
        taskTextarea.addEventListener('change', state.nativeToCustomHandler);
        this.syncNativeTaskIssuesToCustom(state);
        Logger.debug('Request Revisions Tab: direct native Task textarea sync bound');
    },

    unbindNativeTaskIssuesSync(state) {
        if (state.nativeTaskTextarea && state.nativeToCustomHandler) {
            state.nativeTaskTextarea.removeEventListener('input', state.nativeToCustomHandler);
            state.nativeTaskTextarea.removeEventListener('change', state.nativeToCustomHandler);
        }
        state.nativeTaskTextarea = null;
        state.nativeToCustomHandler = null;
        state.nativeSyncModal = null;
    },

    syncNativeTaskIssuesToCustom(state) {
        if (state.syncingToNative || !state.nativeTaskTextarea) return;
        state.syncingFromNative = true;
        try {
            this.updateTaskIssuesFromNative(state, state.nativeTaskTextarea.value || '');
        } finally {
            state.syncingFromNative = false;
        }
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
