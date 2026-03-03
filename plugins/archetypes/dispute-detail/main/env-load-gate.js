// ============= env-load-gate.js =============
// Tracks when a dispute detail page has loaded a tool environment.

const plugin = {
    id: 'disputeToolEnvGate',
    name: 'Dispute Tool Environment Gate',
    description: 'Detects tool environment readiness for dispute detail pages',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        observerAttached: false,
        readyLogged: false,
        waitingLogged: false
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
        }
        this.updateReadyState(state);
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
        Logger.log('Dispute Tool Environment Gate: observer installed');
    },

    updateReadyState(state) {
        const ready = this.isToolEnvironmentReady();
        const root = document.documentElement;

        if (ready) {
            root.setAttribute('data-fleet-dispute-tool-env-ready', '1');
            window.__fleetDisputeToolEnvReady = true;
            if (!state.readyLogged) {
                Logger.info('Dispute Tool Environment Gate: tool environment detected and marked ready');
                state.readyLogged = true;
            }
            return;
        }

        root.removeAttribute('data-fleet-dispute-tool-env-ready');
        window.__fleetDisputeToolEnvReady = false;

        if (!state.waitingLogged) {
            const createInstanceButton = this.findCreateInstanceButton();
            if (createInstanceButton) {
                Logger.log('Dispute Tool Environment Gate: waiting for tool environment load');
            } else {
                Logger.debug('Dispute Tool Environment Gate: create-instance button not detected yet');
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
