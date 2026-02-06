// ============= workflow-cache.js =============
const plugin = {
    id: 'workflowCache',
    name: 'Workflow Cache',
    description: 'Observes workflow for tool add/delete/execute events; captures JSON snapshot on add/delete/execute',
    _version: '1.6',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false,
        observedParent: null,
        observedContainer: null,
        parentObserver: null,
        containerObservers: [],
        workflowSnapshot: null
    },

    selectors: {
        toolCard: 'div.rounded-lg.border.transition-colors',
        toolHeader: 'div.flex.items-center.gap-3.p-3.cursor-pointer.hover\\:bg-muted\\/30',
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
            Logger.info('Workflow cache: observing workflow');
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

    captureAndSaveSnapshot(state) {
        Logger.info('Workflow cache: snapshot attempt (container: ' + (state.observedContainer ? 'yes' : 'no') + ')');
        if (!state.observedContainer) {
            Logger.warn('Workflow cache: snapshot skipped, no observed container');
            return;
        }
        try {
            const snapshot = this.captureSnapshot(state.observedContainer);
            state.workflowSnapshot = snapshot;
            Logger.info('Workflow cache: snapshot captured (' + snapshot.length + ' tools)');
            Logger.log('Workflow cache: snapshot', JSON.stringify(snapshot, null, 2));
        } catch (e) {
            Logger.error('Workflow cache: snapshot failed', e);
        }
    },

    captureSnapshot(container) {
        if (!container) {
            Logger.warn('Workflow cache: captureSnapshot called with no container');
            return [];
        }
        const cards = container.querySelectorAll(this.selectors.toolCard);
        if (!cards.length) {
            Logger.warn('Workflow cache: snapshot found no tool cards in container');
            return [];
        }
        const out = [];
        cards.forEach((card, index) => {
            const name = this.getToolNameFromCard(card);
            if (!name) {
                Logger.warn('Workflow cache: tool card at index ' + index + ' has no tool name (header or span not found)');
            }
            const params = this.getParamsFromCard(card);
            const entry = { tool: name || '(unknown)' };
            Object.keys(params).forEach(k => {
                const v = params[k];
                if (this.hasValue(v)) {
                    entry[k] = v;
                }
            });
            out.push(entry);
        });
        if (out.length === 0) {
            Logger.warn('Workflow cache: snapshot has no tools after processing cards');
        }
        return out;
    },

    hasValue(v) {
        if (v === null || v === undefined) return false;
        if (typeof v === 'string') return v.length > 0;
        if (typeof v === 'number') return !Number.isNaN(v);
        if (typeof v === 'boolean') return v === true;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return true;
    },

    getToolNameFromCard(card) {
        const header = card.querySelector(this.selectors.toolHeader);
        if (!header) {
            Logger.warn('Workflow cache: getToolNameFromCard found no header in card');
            return '';
        }
        const span = header.querySelector('span.font-mono.text-sm.font-medium');
        if (!span) {
            Logger.warn('Workflow cache: getToolNameFromCard found no tool name span in header');
            return '';
        }
        return span.textContent.trim();
    },

    getParamsFromCard(card) {
        const params = {};
        const content = card.querySelector('div[data-state="open"] div.px-3.pb-3.space-y-3');
        if (!content) {
            Logger.warn('Workflow cache: getParamsFromCard found no open parameters content (card may be collapsed)');
            return params;
        }
        const spaceY3 = content.querySelector('div.space-y-3');
        if (!spaceY3) {
            Logger.warn('Workflow cache: getParamsFromCard found no div.space-y-3 in parameters content');
            return params;
        }
        const blocks = spaceY3.querySelectorAll('div.flex.flex-col.gap-1\\.5');
        blocks.forEach(block => {
            const name = this.getParamNameFromBlock(block);
            if (!name) return;
            const typeLabel = this.getParamTypeFromBlock(block);
            const value = this.getParamValueFromBlock(block, typeLabel);
            if (value !== undefined) params[name] = value;
        });
        return params;
    },

    getParamNameFromBlock(block) {
        const code = block.querySelector('code.text-xs.font-mono');
        if (code) return code.textContent.trim();
        const label = block.querySelector('label[for^="param-"]');
        if (label) return label.textContent.trim();
        return '';
    },

    getParamTypeFromBlock(block) {
        const typeDiv = block.querySelector('div.inline-flex.whitespace-nowrap.rounded-md.border.font-medium');
        if (!typeDiv) return '';
        return (typeDiv.textContent || '').trim().toLowerCase();
    },

    getParamValueFromBlock(block, typeLabel) {
        if (!typeLabel) return undefined;
        if (typeLabel === 'string' || typeLabel === 'object') {
            const input = block.querySelector('input[type="text"]');
            if (input) return input.value.trim() || undefined;
            const textarea = block.querySelector('textarea');
            if (textarea) return textarea.value.trim() || undefined;
            return undefined;
        }
        if (typeLabel === 'integer' || typeLabel === 'number') {
            const input = block.querySelector('input[type="number"]');
            if (!input) return undefined;
            const s = input.value.trim();
            if (s === '') return undefined;
            const n = Number(s);
            return Number.isNaN(n) ? s : n;
        }
        if (typeLabel === 'boolean') {
            const btn = block.querySelector('button[role="checkbox"]');
            if (!btn) return undefined;
            return btn.getAttribute('data-state') === 'checked';
        }
        if (typeLabel === 'enum') {
            const btn = block.querySelector('button[role="combobox"]');
            if (!btn) return undefined;
            const span = btn.querySelector('span.flex-1.flex') || btn.querySelector('span[style*="pointer-events"]');
            const text = span ? (span.textContent || '').trim() : '';
            return text || undefined;
        }
        if (typeLabel === 'string[]' || typeLabel.includes('string[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1');
            if (!wrap) return undefined;
            const inputs = wrap.querySelectorAll('div.flex.items-center.gap-2 input[type="text"]');
            const arr = [];
            inputs.forEach(inp => {
                const v = inp.value.trim();
                if (v) arr.push(v);
            });
            return arr.length ? arr : undefined;
        }
        if (typeLabel === 'object[]' || typeLabel.includes('object[]')) {
            const items = block.querySelectorAll('div.relative.border.rounded-md.p-3[class*="bg-muted"]');
            if (!items.length) return undefined;
            const arr = [];
            items.forEach(item => {
                const innerSpace = item.querySelector('div.space-y-3');
                if (!innerSpace) return;
                const innerBlocks = innerSpace.querySelectorAll('div.flex.flex-col.gap-1\\.5');
                const obj = {};
                innerBlocks.forEach(innerBlock => {
                    const name = this.getParamNameFromBlock(innerBlock);
                    if (!name) return;
                    const innerType = this.getParamTypeFromBlock(innerBlock);
                    const val = this.getParamValueFromBlock(innerBlock, innerType);
                    if (val !== undefined && this.hasValue(val)) obj[name] = val;
                });
                if (Object.keys(obj).length) arr.push(obj);
            });
            return arr.length ? arr : undefined;
        }
        return undefined;
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
                            Logger.info('Workflow cache: observing workflow');
                        }
                        return;
                    }
                }
                for (const node of m.removedNodes) {
                    if (node === state.observedContainer) {
                        self.disconnectContainerObservers(state);
                        Logger.info('Workflow cache: all tools removed');
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

        const self = this;
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
            if (added) {
                Logger.info('Workflow cache: tool added');
                self.captureAndSaveSnapshot(state);
            }
            if (removed) {
                Logger.info('Workflow cache: tool deleted');
                self.captureAndSaveSnapshot(state);
            }
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
                    Logger.info('Workflow cache: tool executed (' + outcome + ')');
                    self.captureAndSaveSnapshot(state);
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
