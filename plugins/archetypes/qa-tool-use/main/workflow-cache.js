// ============= workflow-cache.js =============
const plugin = {
    id: 'workflowCache',
    name: 'Workflow Cache',
    description: 'Observes workflow for tool add/delete/execute events (stage 1: triggers and logging)',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false,
        observedContainer: null,
        observers: []
    },

    selectors: {
        toolCard: 'div.rounded-lg.border.transition-colors'
    },

    onMutation(state, context) {
        const panel = this.findWorkflowPanel();
        if (!panel) {
            if (!state.missingLogged) {
                Logger.debug('Workflow cache: workflow panel not found');
                state.missingLogged = true;
            }
            return;
        }

        const toolsContainer = this.findToolsArea(panel);
        if (!toolsContainer) {
            if (!state.missingLogged) {
                Logger.debug('Workflow cache: tools container not found');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;

        if (state.observedContainer === toolsContainer) {
            return;
        }

        if (state.observedContainer) {
            this.disconnectObservers(state);
            state.observedContainer = null;
        }

        this.attachObservers(toolsContainer, state);
        state.observedContainer = toolsContainer;
        Logger.log('Workflow cache: observing workflow');
    },

    disconnectObservers(state) {
        if (state.observers && state.observers.length) {
            state.observers.forEach(obs => obs.disconnect());
            state.observers = [];
        }
    },

    attachObservers(container, state) {
        const toolCardSelector = this.selectors.toolCard;

        const isToolCard = (node) => {
            return node && node.nodeType === Node.ELEMENT_NODE &&
                node.matches && node.matches(toolCardSelector);
        };

        const childListObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (isToolCard(node)) {
                        Logger.log('Workflow cache: tool added');
                        break;
                    }
                }
                for (const node of m.removedNodes) {
                    if (isToolCard(node)) {
                        Logger.log('Workflow cache: tool deleted');
                        break;
                    }
                }
            }
        });

        childListObserver.observe(container, {
            childList: true,
            subtree: false
        });
        state.observers.push(childListObserver);

        const classObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                const target = m.target;
                if (!target || target.nodeType !== Node.ELEMENT_NODE || !target.matches || !target.matches(toolCardSelector)) {
                    continue;
                }
                if (!container.contains(target)) continue;
                const hasSuccess = target.classList.contains('border-emerald-500/50');
                const hasError = target.classList.contains('border-red-500/50');
                if (hasSuccess || hasError) {
                    const outcome = hasError ? 'error' : 'success';
                    Logger.log('Workflow cache: tool executed (' + outcome + ')');
                    break;
                }
            }
        });

        classObserver.observe(container, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
        state.observers.push(classObserver);
    },

    findWorkflowPanel() {
        const panels = Context.dom.queryAll('[data-panel-id][data-panel]', {
            context: `${this.id}.panels`
        });

        for (const candidate of panels) {
            const toolbar = candidate.querySelector('.border-b.h-9');
            if (toolbar) {
                const workflowText = Array.from(toolbar.querySelectorAll('span')).find(
                    span => span.textContent.trim() === 'Workflow'
                );
                if (workflowText) {
                    return candidate;
                }
            }
        }

        const knownPanel = document.querySelector('[id=":rs:"][data-panel]');
        if (knownPanel) {
            const toolbar = knownPanel.querySelector('.border-b.h-9');
            if (toolbar) {
                const workflowText = Array.from(toolbar.querySelectorAll('span')).find(
                    span => span.textContent.trim() === 'Workflow'
                );
                if (workflowText) {
                    return knownPanel;
                }
            }
        }

        return null;
    },

    findToolsArea(panel) {
        if (!panel) return null;
        const scrollable = panel.querySelector('.overflow-y-auto');
        if (!scrollable) return null;
        return scrollable.querySelector('.space-y-3');
    }
};
