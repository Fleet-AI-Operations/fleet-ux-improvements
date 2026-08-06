// ============= workflow-verifier-tab.js (qa-tool-use) =============
// Placement: Workflow | Verifier on [data-ui="workflow-panel"]. Shared library:
// Context.verifierSourceTab.

const plugin = {
    id: 'workflowVerifierTab',
    name: 'Workflow Verifier Tab',
    description:
        'Adds Workflow | Verifier tabs on the QA workflow panel and shows searchable verifier source for the current task',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {},

    init(state) {
        const api = Context.verifierSourceTab;
        if (api && typeof api.createInitialState === 'function') {
            Object.assign(state, api.createInitialState());
        }
    },

    findWorkflowPanel() {
        return document.querySelector('[data-ui="workflow-panel"]');
    },

    findInnerColumn(panel) {
        if (!panel) return null;
        const card = panel.querySelector(':scope > div') || panel.children[0] || null;
        if (!card) return null;
        return (
            Array.from(card.children).find(
                (el) => el.classList.contains('flex') && el.classList.contains('flex-col')
            ) ||
            card.querySelector(':scope > div') ||
            card.children[0] ||
            null
        );
    },

    findHeader(inner) {
        if (!inner) return null;
        return (
            Array.from(inner.children).find(
                (el) => el.classList.contains('h-9') && el.classList.contains('border-b')
            ) || null
        );
    },

    findWorkflowContent(inner) {
        if (!inner) return null;
        const steps = inner.querySelector('[data-ui="workflow-steps-container"]');
        if (steps) {
            let el = steps;
            while (el && el.parentElement !== inner) el = el.parentElement;
            if (el) return el;
        }
        const VERIFIER_PANEL_MARKER = 'data-fleet-verifier-panel';
        return (
            Array.from(inner.children).find(
                (el) =>
                    !el.classList.contains('h-9') &&
                    el.getAttribute(VERIFIER_PANEL_MARKER) !== 'true'
            ) || null
        );
    },

    findToolbar(header) {
        if (!header) return null;
        return header.querySelector('[data-ui="workflow-toolbar"]');
    },

    findPlacement() {
        const panel = this.findWorkflowPanel();
        if (!panel) return null;
        const inner = this.findInnerColumn(panel);
        if (!inner) return null;
        const header = this.findHeader(inner);
        const primaryContent = this.findWorkflowContent(inner);
        if (!header || !primaryContent) return null;

        const leftCluster =
            Array.from(header.children).find((el) => !el.querySelector('[data-ui="workflow-toolbar"]')) ||
            header.children[0];
        if (!leftCluster) return null;

        const toolbar = this.findToolbar(header);
        const chromeToHide = [];
        if (toolbar) {
            chromeToHide.push(toolbar.parentElement || toolbar);
        }

        return {
            tabHost: leftCluster,
            primaryContent,
            contentParent: inner,
            chromeToHide
        };
    },

    mountTabs(host, primaryTab, verifierTab) {
        host.className = 'flex items-stretch h-full gap-0 flex-1 min-w-0';
        host.innerHTML = '';
        host.appendChild(primaryTab);
        host.appendChild(verifierTab);
    },

    onMutation(state) {
        const api = Context.verifierSourceTab;
        if (!api || typeof api.run !== 'function') {
            if (!state.apiMissingLogged) {
                Logger.debug('Context.verifierSourceTab missing');
                state.apiMissingLogged = true;
            }
            return;
        }
        state.apiMissingLogged = false;

        if (!state.cache) {
            Object.assign(state, api.createInitialState());
        }

        const placement = this.findPlacement();
        api.run(state, {
            pluginId: this.id,
            primaryTabLabel: 'Workflow',
            compactTabs: false,
            tabHost: placement && placement.tabHost,
            primaryContent: placement && placement.primaryContent,
            contentParent: placement && placement.contentParent,
            chromeToHide: placement ? placement.chromeToHide : [],
            mountTabs: (host, primaryTab, verifierTab) => this.mountTabs(host, primaryTab, verifierTab)
        });
    }
};
