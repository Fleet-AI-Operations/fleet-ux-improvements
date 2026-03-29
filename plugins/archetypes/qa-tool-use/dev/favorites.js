// ============= favorites.js =============
// Plugin with its own selectors - completely self-contained
// Shares favorite list via Context.storageKeys.favoriteTools (same as task-creation and revision).

const plugin = {
    id: 'favorites',
    name: 'Tool Favorites',
    description: 'Add favorite stars to tools list',
    _version: '4.1',
    enabledByDefault: false,
    phase: 'mutation',
    initialState: { missingLogged: false, containerSelector: null },

    selectors: {
        searchInput: '[data-ui="tools-search"]',
        searchInputFallback: 'input[placeholder="Search tools, descriptions, parameters..."]',
        toolButton: '[data-ui="tool-item"]',
        toolButtonFallback: 'button.group\\/tool',
        toolTitleSpan: 'span.text-xs.font-medium.text-foreground'
    },

    init(state, context) {
        // Add styles for favorites
        const style = document.createElement('style');
        style.textContent = `
            .favorite-star {
                cursor: pointer;
                margin-right: 3px;
                transition: all 0.2s;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 14px;
                height: 14px;
                min-width: 14px;
                min-height: 14px;
                max-width: 14px;
                max-height: 14px;
                flex: 0 0 14px;
                opacity: 0.7;
            }
            .favorite-star.inline {
                margin-right: 6px;
                width: 14px;
                height: 14px;
                min-width: 14px;
                min-height: 14px;
                max-width: 14px;
                max-height: 14px;
                flex: 0 0 14px;
                display: inline-flex;
                align-items: center;
            }
            .favorite-star svg {
                width: 14px;
                height: 14px;
                min-width: 14px;
                min-height: 14px;
                max-width: 14px;
                max-height: 14px;
                display: block;
            }
            .favorite-star:hover {
                opacity: 1;
                transform: scale(1.2);
            }
            .favorite-star.favorited {
                color: gold;
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
        Logger.log('✓ Favorites styles injected');
    },

    onMutation(state, context) {
        // Semantic approach: Find tools container by locating search input first (Pattern 6)
        // Then navigate to the scrollable container (Pattern 1: Stable root + relative navigation)
        let toolsContainer = this.findToolsContainer();

        if (!toolsContainer) {
            if (!state.missingLogged) {
                Logger.debug('Tools container not found for favorites');
                state.missingLogged = true;
            }
            return;
        }

        const favoriteTools = new Set(Storage.get(Context.storageKeys.favoriteTools, []));

        let toolButtons = toolsContainer.querySelectorAll(this.selectors.toolButton);
        if (toolButtons.length === 0) {
            toolButtons = Context.dom.queryAll(this.selectors.toolButtonFallback, { root: toolsContainer, context: `${this.id}.toolButtons` });
        } else {
            toolButtons = Array.from(toolButtons);
        }

        toolButtons.forEach(button => {
            // Check if star already exists
            if (Context.dom.query('.favorite-star', {
                root: button,
                context: `${this.id}.favoriteStar`
            })) return; // Already has star

            const toolName = this.getToolNameFromButton(button);
            if (!toolName) return;

            const star = this.createStarElement(toolName, favoriteTools);

            star.onclick = (e) => {
                e.stopPropagation();
                this.toggleFavorite(toolName, favoriteTools, toolsContainer);
            };

            // Find the tool title span to insert star before tool name
            const titleSpan = Context.dom.query(this.selectors.toolTitleSpan, {
                root: button,
                context: `${this.id}.toolTitleSpan`
            });

            if (titleSpan) {
                const innerSpan = this.getToolNameSpanFromTitle(titleSpan);
                if (innerSpan) {
                    star.style.marginRight = '6px';
                    titleSpan.insertBefore(star, innerSpan);
                    titleSpan.style.display = 'inline-flex';
                    titleSpan.style.alignItems = 'center';
                    titleSpan.style.gap = '6px';
                    return;
                }
            }

            // Fallback: Insert at beginning of button's first span
            const firstSpan = button.querySelector('span:not(.favorite-star)');
            if (firstSpan?.parentElement) {
                firstSpan.parentElement.insertBefore(star, firstSpan);
            } else {
                button.insertBefore(star, button.firstChild);
            }
        });

    },

    findToolsContainer() {
        const searchInput = document.querySelector(this.selectors.searchInput) || Context.dom.query(this.selectors.searchInputFallback, { context: `${this.id}.searchInput` });

        if (searchInput) {
            // Navigate to scrollable container (Pattern 1: Stable root + relative navigation)
            // The search input is typically in a border-b container, scrollable area is sibling or parent
            let container = searchInput.closest('.border-b')?.nextElementSibling;
            if (container && container.classList.contains('flex-1') && container.classList.contains('overflow-y-auto')) {
                const toolsList = container.querySelector('[data-ui="tools-list"]');
            if (toolsList) return toolsList;
            const toolsArea = container.querySelector('div.p-2, div.space-y-1, div');
                if (toolsArea) return toolsArea;
            }

            const toolsPanel = searchInput.closest('[data-ui="tools-panel"]');
            if (toolsPanel) {
                const toolsList = toolsPanel.querySelector('[data-ui="tools-list"]');
                if (toolsList) return toolsList;
            }

            container = searchInput.closest('.overflow-y-auto');
            if (container) {
                const toolsList = container.querySelector('[data-ui="tools-list"]');
                if (toolsList) return toolsList;
                const toolsArea = container.querySelector('div.p-2, div.space-y-1, div');
                if (toolsArea) return toolsArea;
            }
        }

        let toolButtons = Context.dom.queryAll(this.selectors.toolButton, { context: `${this.id}.toolButtonsFallback` });
        if (toolButtons.length === 0) {
            toolButtons = Context.dom.queryAll(this.selectors.toolButtonFallback, { context: `${this.id}.toolButtonsFallback` });
        }
        if (toolButtons.length > 0) {
            const sel = toolButtons[0].matches(this.selectors.toolButton) ? this.selectors.toolButton : this.selectors.toolButtonFallback;
            const firstButton = toolButtons[0];
            let parent = firstButton.parentElement;
            while (parent) {
                const buttonsInParent = parent.querySelectorAll(sel);
                if (buttonsInParent.length === toolButtons.length) return parent;
                parent = parent.parentElement;
            }
            return firstButton.parentElement;
        }

        const scrollableContainers = document.querySelectorAll('.overflow-y-auto');
        for (const container of scrollableContainers) {
            const toolsArea = container.querySelector('[data-ui="tools-list"]') || container.querySelector('div.p-2, div.space-y-1');
            if (toolsArea && (toolsArea.querySelector(this.selectors.toolButton) || toolsArea.querySelector(this.selectors.toolButtonFallback))) {
                return toolsArea;
            }
        }

        return null;
    },

    getToolNameFromButton(button) {
        const dataName = button.getAttribute && button.getAttribute('data-ui-name');
        if (dataName) return (dataName || '').trim();
        const titleSpan = Context.dom.query(this.selectors.toolTitleSpan, {
            root: button,
            context: `${this.id}.toolTitleSpan`
        });
        if (titleSpan) {
            const nameSpan = this.getToolNameSpanFromTitle(titleSpan);
            const text = nameSpan?.textContent?.trim();
            if (text) return text;
        }

        // Fallback: Find any span with text content that looks like a tool name
        const spans = button.querySelectorAll('span:not(.favorite-star)');
        for (const span of spans) {
            const text = span.textContent?.trim();
            // Tool names are typically single words or short phrases, not empty
            if (text && text.length > 0 && text.length < 50 && !text.includes('\n')) {
                // Check if this looks like a tool name (not a description)
                const parent = span.parentElement;
                if (parent && parent.classList.contains('text-xs') && parent.classList.contains('font-medium')) {
                    return text;
                }
            }
        }

        return null;
    },

    getToolNameSpanFromTitle(titleSpan) {
        return titleSpan.querySelector('span span:nth-child(2) span')
            || titleSpan.querySelector('span span span')
            || titleSpan.querySelector('span span')
            || titleSpan.querySelector('span');
    },

    createStarElement(toolName, favoriteTools, { inline = false, tagName = 'span' } = {}) {
        const star = document.createElement(tagName);
        star.className = inline ? 'favorite-star inline' : 'favorite-star';
        this.updateStarElement(star, favoriteTools.has(toolName));
        return star;
    },

    createStarSvg(isFavorite) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '14');
        svg.setAttribute('height', '14');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.classList.add('favorite-star-icon');
        svg.setAttribute('fill', isFavorite ? '#FFD700' : 'none');
        svg.setAttribute('stroke', isFavorite ? '#FFD700' : 'currentColor');
        svg.setAttribute('stroke-width', '1.5');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z');
        svg.appendChild(path);
        return svg;
    },

    updateStarElement(starEl, isFavorite) {
        starEl.innerHTML = '';
        starEl.appendChild(this.createStarSvg(isFavorite));
        starEl.classList.toggle('favorited', isFavorite);
    },

    toggleFavorite(toolName, favoriteTools, toolsContainer) {
        if (favoriteTools.has(toolName)) {
            favoriteTools.delete(toolName);
            Logger.log(`Removed favorite: ${toolName}`);
        } else {
            favoriteTools.add(toolName);
            Logger.log(`Added favorite: ${toolName}`);
        }
        Storage.set(Context.storageKeys.favoriteTools, Array.from(favoriteTools));
        this.syncToolListStars(toolsContainer, favoriteTools);
    },

    syncToolListStars(toolsContainer, favoriteTools) {
        const toolButtons = Context.dom.queryAll(this.selectors.toolButton, {
            root: toolsContainer,
            context: `${this.id}.toolButtons`
        });
        toolButtons.forEach(button => {
            const toolName = this.getToolNameFromButton(button);
            const star = button.querySelector('.favorite-star');
            if (!toolName || !star) return;
            const isFavorite = favoriteTools.has(toolName);
            this.updateStarElement(star, isFavorite);
        });
    }
};
