// ============= tool-description-truncate.js =============
// Limits tool picker descriptions to 100 chars when collapsed; full when expanded.
// Option to hide description entirely when collapsed.

const TRUNCATE_LEN = 100;

const plugin = {
    id: 'toolDescriptionTruncate',
    name: 'Tool description truncation',
    description: 'Limit tool picker descriptions when collapsed; show full when expanded.',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false },

    selectors: {
        searchInput: 'input[placeholder="Search tools, descriptions, parameters..."]',
        toolButton: 'button.group\\/tool',
        descriptionParagraph: 'p.text-muted-foreground.font-normal.whitespace-normal'
    },

    onMutation(state, context) {
        const toolsContainer = this.findToolsContainer();
        if (!toolsContainer) {
            if (!state.missingLogged) {
                Logger.debug('Tools container not found for tool-description-truncate');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const toolButtons = Context.dom.queryAll(this.selectors.toolButton, {
            root: toolsContainer,
            context: `${this.id}.toolButtons`
        });

        const hideWhenCollapsed = Storage.getSubOptionEnabled(
            this.id,
            'hide-description-when-collapsed',
            false
        );

        let processed = 0;
        toolButtons.forEach(button => {
            const descEl = Context.dom.query(this.selectors.descriptionParagraph, {
                root: button,
                context: `${this.id}.descriptionParagraph`
            });
            if (!descEl) return;

            const wrapper = button.closest('div.w-full.space-y-3');
            const isOpen =
                wrapper &&
                wrapper.children.length >= 2 &&
                wrapper.children[1].classList.contains('pl-8');

            if (isOpen) {
                this.restoreFullDescription(button, descEl);
                processed++;
            } else {
                this.applyCollapsedState(button, descEl, hideWhenCollapsed);
                processed++;
            }
        });

        if (processed > 0 && state.lastProcessedCount !== processed) {
            state.lastProcessedCount = processed;
            Logger.log(`Tool description truncate applied to ${processed} tool(s)`);
        }
    },

    getDescriptionText(descEl) {
        const inner = descEl.querySelector('span span') || descEl.querySelector('span') || descEl;
        return (inner && inner.textContent) ? inner.textContent.trim() : descEl.textContent.trim();
    },

    setDescriptionText(descEl, text) {
        const inner = descEl.querySelector('span span') || descEl.querySelector('span');
        if (inner) {
            inner.textContent = text;
        } else {
            descEl.textContent = text;
        }
    },

    restoreFullDescription(button, descEl) {
        descEl.style.display = '';
        const full = button.dataset.fleetFullDescription;
        if (full !== undefined) {
            this.setDescriptionText(descEl, full);
        }
    },

    applyCollapsedState(button, descEl, hideWhenCollapsed) {
        if (hideWhenCollapsed) {
            if (!button.dataset.fleetFullDescription) {
                button.dataset.fleetFullDescription = this.getDescriptionText(descEl);
            }
            descEl.style.display = 'none';
            return;
        }

        descEl.style.display = '';
        let full = button.dataset.fleetFullDescription;
        if (full === undefined) {
            full = this.getDescriptionText(descEl);
            button.dataset.fleetFullDescription = full;
        }
        const truncated =
            full.length <= TRUNCATE_LEN ? full : full.slice(0, TRUNCATE_LEN) + '…';
        this.setDescriptionText(descEl, truncated);
    },

    findToolsContainer() {
        const searchInput = Context.dom.query(this.selectors.searchInput, {
            context: `${this.id}.searchInput`
        });

        if (searchInput) {
            let container = searchInput.closest('.border-b')?.nextElementSibling;
            if (
                container &&
                container.classList.contains('flex-1') &&
                container.classList.contains('overflow-y-auto')
            ) {
                const toolsArea = container.querySelector('div.p-2, div.space-y-1, div');
                if (toolsArea) return toolsArea;
            }
            container = searchInput.closest('.overflow-y-auto');
            if (container) {
                const toolsArea = container.querySelector('div.p-2, div.space-y-1, div');
                if (toolsArea) return toolsArea;
            }
        }

        const toolButtons = Context.dom.queryAll(this.selectors.toolButton, {
            context: `${this.id}.toolButtonsFallback`
        });
        if (toolButtons.length > 0) {
            const firstButton = toolButtons[0];
            let parent = firstButton.parentElement;
            while (parent) {
                const buttonsInParent = parent.querySelectorAll(this.selectors.toolButton);
                if (buttonsInParent.length === toolButtons.length) return parent;
                parent = parent.parentElement;
            }
            return firstButton.parentElement;
        }

        const scrollableContainers = document.querySelectorAll('.overflow-y-auto');
        for (const container of scrollableContainers) {
            const toolsArea = container.querySelector('div.p-2, div.space-y-1');
            if (toolsArea && toolsArea.querySelector(this.selectors.toolButton)) {
                return toolsArea;
            }
        }
        return null;
    },

    subOptions: [
        {
            id: 'hide-description-when-collapsed',
            name: 'Hide description when collapsed',
            description:
                'When enabled, hide the tool description entirely in the list when the tool is collapsed (full description still shown when expanded).',
            enabledByDefault: false
        }
    ]
};
