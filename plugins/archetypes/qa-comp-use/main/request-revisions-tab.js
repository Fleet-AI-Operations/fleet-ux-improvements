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
    _version: '1.3',
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
        dismissingPinnedModal: false,
        syncBound: false,
        nativeTaskTextarea: null,
        nativeToCustomHandler: null,
        syncingToNative: false,
        syncingFromNative: false,
        originalBodyPointerEvents: null,
        originalHtmlPointerEvents: null,
        pointerLockReleased: false,
        outsideDismissBlocker: null,
        replayingOutsideEvent: false,
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
        this.bindNativeTaskIssuesSync(state, this.findRequestRevisionsModal());

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
        if (!this.isNativeRequestRevisionsAvailable()) {
            Logger.warn('Request Revisions Tab: native Request Revisions button is not available');
            return;
        }
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
        this.removeOutsideDismissBlocker(state);
        this.disconnectPinObserver(state);
        this.removeEscBlocker(state);
        this.unbindNativeTaskIssuesSync(state);
        this.dismissPinnedModal(state);
        this.restorePageInteractionLock(state);
        state.modalPinned = false;
        state.pinnedModal = null;
        state.pinnedBackdrop = null;
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

            this.installOutsideDismissBlocker(state);
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
            state.dismissingPinnedModal = false;
            modal.setAttribute(RR_MODAL_MANAGED_MARKER, 'true');
            if (state.pinnedBackdrop) {
                state.pinnedBackdrop.setAttribute(RR_BACKDROP_MANAGED_MARKER, 'true');
            }

            this.applyHiddenStyles(state);
            this.ensureTaskSelected(state);
            this.bindNativeTaskIssuesSync(state, modal);
            this.syncTaskIssuesToNativeModal(state);
            this.installEscBlocker(state);
            this.installOutsideDismissBlocker(state);
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
        this.releasePageInteractionLock(state);
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

    dismissPinnedModal(state) {
        const modal = state.pinnedModal;
        if (!modal || !document.body.contains(modal)) return;
        state.dismissingPinnedModal = true;
        const closeButton = this.findModalCloseButton(modal);
        if (closeButton) {
            closeButton.click();
            Logger.info('Request Revisions Tab: dismissed hidden native modal');
            return;
        }
        Logger.warn('Request Revisions Tab: modal close button not found');
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

    releasePageInteractionLock(state) {
        if (!state.pointerLockReleased) {
            state.originalBodyPointerEvents = document.body.style.pointerEvents || '';
            state.originalHtmlPointerEvents = document.documentElement.style.pointerEvents || '';
            state.pointerLockReleased = true;
        }
        document.body.style.pointerEvents = '';
        document.documentElement.style.pointerEvents = '';
        requestAnimationFrame(() => {
            if (!state.tabActive || !state.modalPinned) return;
            document.body.style.pointerEvents = '';
            document.documentElement.style.pointerEvents = '';
        });
        setTimeout(() => {
            if (!state.tabActive || !state.modalPinned) return;
            document.body.style.pointerEvents = '';
            document.documentElement.style.pointerEvents = '';
        }, 50);
    },

    restorePageInteractionLock(state) {
        if (!state.pointerLockReleased) return;
        document.body.style.pointerEvents = state.originalBodyPointerEvents || '';
        document.documentElement.style.pointerEvents = state.originalHtmlPointerEvents || '';
        state.originalBodyPointerEvents = null;
        state.originalHtmlPointerEvents = null;
        state.pointerLockReleased = false;
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
        if (state.syncingFromNative) return;
        const modal = state.pinnedModal || this.findRequestRevisionsModal();
        const source = state.taskIssuesTextarea;
        if (!modal || !source) return;
        const target = modal.querySelector('textarea#feedback-Task');
        if (!target) {
            this.ensureTaskSelected(state);
            setTimeout(() => this.syncTaskIssuesToNativeModal(state), 0);
            return;
        }
        state.syncingToNative = true;
        try {
            this.setInputValue(target, source.value);
        } finally {
            state.syncingToNative = false;
        }
    },

    bindNativeTaskIssuesSync(state, modal) {
        if (!modal) {
            this.unbindNativeTaskIssuesSync(state);
            return;
        }
        const target = modal.querySelector('textarea#feedback-Task');
        if (!target) return;
        if (state.nativeTaskTextarea === target && state.nativeToCustomHandler) {
            this.syncNativeTaskIssuesToCustom(state);
            return;
        }
        this.unbindNativeTaskIssuesSync(state);
        state.nativeTaskTextarea = target;
        state.nativeToCustomHandler = () => this.syncNativeTaskIssuesToCustom(state);
        target.addEventListener('input', state.nativeToCustomHandler);
        target.addEventListener('change', state.nativeToCustomHandler);
        this.syncNativeTaskIssuesToCustom(state);
        Logger.debug('Request Revisions Tab: native Task textarea sync bound');
    },

    unbindNativeTaskIssuesSync(state) {
        if (state.nativeTaskTextarea && state.nativeToCustomHandler) {
            state.nativeTaskTextarea.removeEventListener('input', state.nativeToCustomHandler);
            state.nativeTaskTextarea.removeEventListener('change', state.nativeToCustomHandler);
        }
        state.nativeTaskTextarea = null;
        state.nativeToCustomHandler = null;
    },

    syncNativeTaskIssuesToCustom(state) {
        if (state.syncingToNative) return;
        const source = state.nativeTaskTextarea;
        const target = state.taskIssuesTextarea;
        if (!source || !target || target.value === source.value) return;
        state.syncingFromNative = true;
        try {
            this.setInputValue(target, source.value);
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

    installOutsideDismissBlocker(state) {
        if (state.outsideDismissBlocker) return;
        state.outsideDismissBlocker = (event) => {
            if (state.replayingOutsideEvent) return;
            if (!state.tabActive || !state.pinnedModal || !state.modalPinned) return;
            if (event.target === state.pinnedModal || event.target === state.pinnedBackdrop) {
                event.stopImmediatePropagation();
                event.stopPropagation();
                event.preventDefault();
                return;
            }

            const target = event.target;
            const panel = state.contentPanel;
            const isInCustomPanel = this.isNodeInside(panel, target);
            if (isInCustomPanel) {
                this.focusCustomPanelTarget(event);
                event.stopImmediatePropagation();
                event.stopPropagation();
                return;
            }

            const replayTarget = this.asElement(target);
            event.stopImmediatePropagation();
            event.stopPropagation();
            event.preventDefault();
            if (event.type === 'click') {
                this.replayOutsideClick(state, event, replayTarget);
            }
        };

        for (const eventName of ['pointerdown', 'mousedown', 'mouseup', 'click', 'focusin']) {
            window.addEventListener(eventName, state.outsideDismissBlocker, true);
        }
        Logger.debug('Request Revisions Tab: outside dismiss blocker installed');
    },

    removeOutsideDismissBlocker(state) {
        if (!state.outsideDismissBlocker) return;
        for (const eventName of ['pointerdown', 'mousedown', 'mouseup', 'click', 'focusin']) {
            window.removeEventListener(eventName, state.outsideDismissBlocker, true);
        }
        state.outsideDismissBlocker = null;
    },

    focusCustomPanelTarget(event) {
        const target = this.asElement(event.target);
        if (!target) return;
        const focusTarget = target.closest('textarea, input, button, select, [tabindex]');
        if (!focusTarget || typeof focusTarget.focus !== 'function') return;
        setTimeout(() => {
            if (document.activeElement === focusTarget || typeof focusTarget.focus !== 'function') return;
            focusTarget.focus({ preventScroll: true });
        }, 0);
    },

    replayOutsideClick(state, originalEvent, target) {
        if (!target || this.isNodeInside(state.contentPanel, target) || target === state.pinnedModal || target === state.pinnedBackdrop) {
            return;
        }
        state.replayingOutsideEvent = true;
        try {
            const replay = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                detail: originalEvent.detail,
                screenX: originalEvent.screenX,
                screenY: originalEvent.screenY,
                clientX: originalEvent.clientX,
                clientY: originalEvent.clientY,
                ctrlKey: originalEvent.ctrlKey,
                altKey: originalEvent.altKey,
                shiftKey: originalEvent.shiftKey,
                metaKey: originalEvent.metaKey,
                button: originalEvent.button,
                buttons: originalEvent.buttons
            });
            target.dispatchEvent(replay);
        } finally {
            state.replayingOutsideEvent = false;
        }
    },

    isNodeInside(container, target) {
        if (!container || !target || typeof target !== 'object' || typeof container.contains !== 'function') {
            return false;
        }
        try {
            return container === target || container.contains(target);
        } catch (error) {
            return false;
        }
    },

    asElement(target) {
        if (!target || typeof target !== 'object') return null;
        if (typeof target.closest === 'function' && typeof target.dispatchEvent === 'function') {
            return target;
        }
        return null;
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
