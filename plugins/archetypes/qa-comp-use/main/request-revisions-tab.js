// ============= request-revisions-tab.js =============
// Proof-of-concept Request Revisions tab that proxies the native modal.

const RR_TAB_MARKER = 'data-fleet-rr-tab';
const RR_PANEL_MARKER = 'data-fleet-rr-tab-panel';
const RR_MODAL_MANAGED_MARKER = 'data-fleet-rr-tab-managed-modal';
const RR_BACKDROP_MANAGED_MARKER = 'data-fleet-rr-tab-managed-backdrop';

const plugin = {
    id: 'requestRevisionsTab',
    name: 'Request Revisions Tab',
    description: 'Adds a Request Revisions tab that syncs Task Issues into the native hidden RR modal',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        tabInjected: false,
        tabButton: null,
        contentPanel: null,
        taskIssuesTextarea: null,
        tabActive: false,
        modalPinned: false,
        pinnedModal: null,
        pinnedBackdrop: null,
        pinObserver: null,
        escBlocker: null,
        openedByTab: false,
        reopening: false,
        syncBound: false,
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

        if (state.modalPinned) {
            this.recheckPinnedModal(state);
        }
    },

    findTabList() {
        const instanceTab = document.querySelector('[data-ui="qa-instance-tab"]');
        return instanceTab?.closest('[role="tablist"]') || instanceTab?.parentElement || null;
    },

    findContentHost() {
        const instanceContent = document.querySelector('[data-ui="qa-instance-content"]');
        return instanceContent?.parentElement || null;
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
        wrap.className = 'max-w-3xl mx-auto space-y-3';

        const label = document.createElement('label');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Task Issues';

        const textarea = document.createElement('textarea');
        textarea.className =
            'flex min-h-[160px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y';
        textarea.placeholder = 'Describe the specific issues with the task...';
        textarea.addEventListener('input', () => {
            this.syncTaskIssuesToNativeModal(state);
        });

        wrap.appendChild(label);
        wrap.appendChild(textarea);
        panel.appendChild(wrap);
        return panel;
    },

    activateRRTab(state) {
        if (!state.contentPanel || !state.tabButton) return;
        state.tabActive = true;
        state.contentPanel.classList.remove('hidden');
        this.syncTabState(state, true);
        Logger.info('Request Revisions Tab: activated');
        if (!state.modalPinned) {
            this.openAndPinModal(state);
        } else {
            this.applyHiddenStyles(state);
            this.ensureTaskSelected(state);
            this.syncTaskIssuesToNativeModal(state);
        }
    },

    deactivateRRTab(state) {
        if (!state.tabActive) return;
        state.tabActive = false;
        if (state.contentPanel) {
            state.contentPanel.classList.add('hidden');
        }
        this.syncTabState(state, false);
        this.restorePinnedModalVisibility(state);
        this.disconnectPinObserver(state);
        this.removeEscBlocker(state);
        state.modalPinned = false;
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

    async openAndPinModal(state) {
        if (state.reopening) return;
        state.reopening = true;
        state.openedByTab = true;

        try {
            const nativeButton = document.querySelector('[data-ui="request-revisions"]');
            if (!nativeButton) {
                Logger.warn('Request Revisions Tab: native Request Revisions button not found');
                return;
            }

            const existingModal = this.findRequestRevisionsModal();
            if (!existingModal) {
                nativeButton.click();
            }

            const modal = await this.waitForModal();
            if (!modal) {
                Logger.warn('Request Revisions Tab: native modal did not open');
                return;
            }

            state.pinnedModal = modal;
            state.pinnedBackdrop = this.findBackdropForModal(modal);
            state.modalPinned = true;
            modal.setAttribute(RR_MODAL_MANAGED_MARKER, 'true');
            if (state.pinnedBackdrop) {
                state.pinnedBackdrop.setAttribute(RR_BACKDROP_MANAGED_MARKER, 'true');
            }

            this.applyHiddenStyles(state);
            this.ensureTaskSelected(state);
            this.syncTaskIssuesToNativeModal(state);
            this.installEscBlocker(state);
            this.installPinObserver(state);
            Logger.info('Request Revisions Tab: native modal pinned behind tab');
        } catch (error) {
            Logger.error('Request Revisions Tab: failed to open/pin native modal', error);
        } finally {
            state.reopening = false;
        }
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

    applyHiddenStyles(state) {
        if (state.pinnedModal) {
            state.pinnedModal.style.opacity = '0';
            state.pinnedModal.style.pointerEvents = 'none';
            state.pinnedModal.style.left = '-9999px';
            state.pinnedModal.style.top = '0';
        }
        if (state.pinnedBackdrop) {
            state.pinnedBackdrop.style.opacity = '0';
            state.pinnedBackdrop.style.pointerEvents = 'none';
        }
    },

    restorePinnedModalVisibility(state) {
        if (state.pinnedModal) {
            state.pinnedModal.style.opacity = '';
            state.pinnedModal.style.pointerEvents = '';
            state.pinnedModal.style.left = '';
            state.pinnedModal.style.top = '';
            state.pinnedModal.removeAttribute(RR_MODAL_MANAGED_MARKER);
        }
        if (state.pinnedBackdrop) {
            state.pinnedBackdrop.style.opacity = '';
            state.pinnedBackdrop.style.pointerEvents = '';
            state.pinnedBackdrop.removeAttribute(RR_BACKDROP_MANAGED_MARKER);
        }
    },

    ensureTaskSelected(state) {
        const modal = state.pinnedModal || this.findRequestRevisionsModal();
        if (!modal) return;
        const taskButton = this.findIssueButton(modal, 'Task');
        if (!taskButton) {
            Logger.warn('Request Revisions Tab: Task issue button not found');
            return;
        }
        if (this.isIssueButtonSelected(taskButton)) return;
        taskButton.click();
        setTimeout(() => this.syncTaskIssuesToNativeModal(state), 0);
        Logger.info('Request Revisions Tab: Task issue section opened');
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

    syncTaskIssuesToNativeModal(state) {
        const modal = state.pinnedModal || this.findRequestRevisionsModal();
        const source = state.taskIssuesTextarea;
        if (!modal || !source) return;
        const target = modal.querySelector('textarea#feedback-Task');
        if (!target) {
            this.ensureTaskSelected(state);
            setTimeout(() => this.syncTaskIssuesToNativeModal(state), 0);
            return;
        }
        this.setInputValue(target, source.value);
    },

    setInputValue(el, value) {
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    },

    installEscBlocker(state) {
        if (state.escBlocker) return;
        state.escBlocker = (event) => {
            if (!state.tabActive || !state.modalPinned) return;
            if (event.key !== 'Escape') return;
            event.stopImmediatePropagation();
            event.stopPropagation();
            event.preventDefault();
            Logger.debug('Request Revisions Tab: blocked Escape while modal is pinned');
        };
        document.addEventListener('keydown', state.escBlocker, true);
    },

    removeEscBlocker(state) {
        if (!state.escBlocker) return;
        document.removeEventListener('keydown', state.escBlocker, true);
        state.escBlocker = null;
    },

    installPinObserver(state) {
        this.disconnectPinObserver(state);
        state.pinObserver = new MutationObserver(() => {
            this.recheckPinnedModal(state);
        });
        state.pinObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-state']
        });
    },

    disconnectPinObserver(state) {
        if (!state.pinObserver) return;
        state.pinObserver.disconnect();
        state.pinObserver = null;
    },

    recheckPinnedModal(state) {
        if (!state.tabActive || state.reopening) return;
        const stillOpen = state.pinnedModal &&
            document.body.contains(state.pinnedModal) &&
            state.pinnedModal.getAttribute('data-state') === 'open';
        if (stillOpen) return;

        state.modalPinned = false;
        state.pinnedModal = null;
        state.pinnedBackdrop = null;
        Logger.warn('Request Revisions Tab: pinned native modal closed; reopening');
        this.openAndPinModal(state);
    }
};
