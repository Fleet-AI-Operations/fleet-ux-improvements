// ============= workflow-cache.js =============
const plugin = {
    id: 'workflowCache',
    name: 'Workflow Cache',
    description: 'Observes workflow for tool add/delete/execute events (stage 1: triggers and logging)',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false,
        observedParent: null,
        observedContainer: null,
        parentObserver: null,
        containerObservers: []
    },

    selectors: {
        toolCard: 'div.rounded-lg.border.transition-colors',
        stableParent: '.flex-1.px-16.py-4.max-w-screen-md.mx-auto',
        toolsContainer: '.space-y-3'
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

        const stableParent = this.findStableParent(panel);
        if (!stableParent) {
            if (!state.missingLogged) {
                Logger.debug('Workflow cache: stable parent not found');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;

        if (state.observedParent !== stableParent) {
            this.disconnectAllObservers(state);
            state.observedParent = null;
            state.observedContainer = null;
        }

        if (!state.parentObserver) {
            this.attachParentObserver(stableParent, state);
            state.observedParent = stableParent;
        }

        const toolsContainer = stableParent.querySelector(':scope > ' + this.selectors.toolsContainer);
        if (toolsContainer && toolsContainer !== state.observedContainer) {
            this.attachContainerObservers(toolsContainer, state);
            state.observedContainer = toolsContainer;
            Logger.log('Workflow cache: observing workflow');
        }
    },

    disconnectAllObservers(state) {
        if (state.parentObserver) {
            state.parentObserver.disconnect();
            state.parentObserver = null;
        }
        if (state.containerObservers && state.containerObservers.length) {
            state.containerObservers.forEach(obs => obs.disconnect());
            state.containerObservers = [];
        }
        state.observedContainer = null;
    },

    disconnectContainerObservers(state) {
        if (state.containerObservers && state.containerObservers.length) {
            state.containerObservers.forEach(obs => obs.disconnect());
            state.containerObservers = [];
        }
        state.observedContainer = null;
    },

    attachParentObserver(stableParent, state) {
        const self = this;
        const parentObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node && node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(self.selectors.toolsContainer)) {
                        if (node.parentElement === stableParent && node !== state.observedContainer) {
                            self.attachContainerObservers(node, state);
                            state.observedContainer = node;
                            Logger.log('Workflow cache: observing workflow');
                        }
                        return;
                    }
                }
                for (const node of m.removedNodes) {
                    if (node === state.observedContainer) {
                        self.disconnectContainerObservers(state);
                        Logger.log('Workflow cache: all tools removed');
                        return;
                    }
                }
            }
        });

        parentObserver.observe(stableParent, {
            childList: true,
            subtree: false
        });
        state.parentObserver = parentObserver;
    },

    attachContainerObservers(container, state) {
        this.disconnectContainerObservers(state);

        const toolCardSelector = this.selectors.toolCard;

        const isToolCardOrWrapper = (node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE || !node.matches) return false;
            return node.matches(toolCardSelector) || node.querySelector(toolCardSelector);
        };

        const childListObserver = new MutationObserver((mutations) => {
            let added = false;
            let removed = false;
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (isToolCardOrWrapper(node)) {
                        added = true;
                        break;
                    }
                }
                for (const node of m.removedNodes) {
                    if (isToolCardOrWrapper(node)) {
                        removed = true;
                        break;
                    }
                }
                if (added || removed) break;
            }
            if (added) Logger.log('Workflow cache: tool added');
            if (removed) Logger.log('Workflow cache: tool deleted');
        });

        childListObserver.observe(container, {
            childList: true,
            subtree: true
        });
        state.containerObservers.push(childListObserver);

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
        state.containerObservers.push(classObserver);
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

    findStableParent(panel) {
        if (!panel) return null;
        const scrollables = panel.querySelectorAll('.overflow-y-auto');
        for (const scrollable of scrollables) {
            const stable = scrollable.querySelector(this.selectors.stableParent);
            if (stable) return stable;
        }
        return null;
    }
};
