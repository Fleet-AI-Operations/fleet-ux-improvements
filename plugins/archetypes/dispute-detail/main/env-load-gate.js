// ============= env-load-gate.js =============
// Tracks when a dispute detail page has loaded a tool environment.

const plugin = {
    id: 'disputeToolEnvGate',
    name: 'Dispute Tool Environment Gate',
    description: 'Marks when the tool environment is ready on dispute detail',
    _version: '1.5',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        observerAttached: false,
        readyLogged: false,
        waitingLogged: false,
        lastReady: null
    },

    selectors: {
        createInstanceButtonText: 'Create Instance',
        toolsSearch: '[data-ui="tools-search"]',
        toolsPanel: '[data-ui="tools-panel"]',
        workflowPanel: '[data-ui="workflow-panel"]'
    },

    onMutation(state) {
        if (!state.observerAttached) {
            this.installObserver(state);
            state.observerAttached = true;
            this.updateReadyState(state); // Run once immediately; observer handles subsequent changes
        }
        // After the observer is installed, all updates come from the observer itself — no need to re-run here
    },

    installObserver(state) {
        const observer = new MutationObserver(() => {
            this.updateReadyState(state);
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });
        CleanupRegistry.registerObserver(observer);
        Logger.debug(`MutationObserver installed on document.body for readiness`);
    },

    updateReadyState(state) {
        const ready = this.isToolEnvironmentReady();
        const root = document.documentElement;
        const prev = state.lastReady;
        state.lastReady = ready;

        if (prev === true && ready === false) {
            Logger.info(`tool environment no longer detected — readiness flag cleared`);
            state.readyLogged = false;
            state.waitingLogged = false;
        }

        if (ready) {
            root.setAttribute('data-fleet-dispute-tool-env-ready', '1');
            window.__fleetDisputeToolEnvReady = true;
            if (!state.readyLogged) {
                Logger.info(`tool environment detected and marked ready`);
                state.readyLogged = true;
            }
            return;
        }

        root.removeAttribute('data-fleet-dispute-tool-env-ready');
        window.__fleetDisputeToolEnvReady = false;

        if (!state.waitingLogged) {
            const createInstanceButton = this.findCreateInstanceButton();
            if (createInstanceButton) {
                Logger.debug(`waiting for tool environment load`);
            } else {
                Logger.debug(`create-instance button not detected yet`);
            }
            state.waitingLogged = true;
        }
    },

    findCreateInstanceButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find((btn) => (btn.textContent || '').trim() === this.selectors.createInstanceButtonText) || null;
    },

    isToolEnvironmentReady() {
        const hasToolsSearch = !!document.querySelector(this.selectors.toolsSearch);
        const hasToolsPanel = !!document.querySelector(this.selectors.toolsPanel);
        const hasWorkflowPanel = !!document.querySelector(this.selectors.workflowPanel);
        return hasToolsSearch && hasToolsPanel && hasWorkflowPanel;
    }
};
