// ============= favorites.js =============

const plugin = {
    id: 'disputeDetailFavorites',
    name: 'Tool Favorites',
    description: 'Add favorite stars to tools list',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, envWaitingLogged: false, stylesInjected: false },

    selectors: {
        searchInput: '[data-ui="tools-search"]',
        searchInputFallback: 'input[placeholder="Search tools, descriptions, parameters..."]',
        toolButton: '[data-ui="tool-item"]',
        toolButtonFallback: 'button.group\\/tool',
        toolTitleSpan: 'span.text-xs.font-medium.text-foreground'
    },

    onMutation(state) {
        if (!this.isToolEnvReady()) {
            if (!state.envWaitingLogged) {
                Logger.debug('Dispute favorites: waiting for tool environment');
                state.envWaitingLogged = true;
            }
            return;
        }
        state.envWaitingLogged = false;

        if (!state.stylesInjected) {
            this.injectStyles();
            state.stylesInjected = true;
        }

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
            if (Context.dom.query('.favorite-star', { root: button, context: `${this.id}.favoriteStar` })) return;
            const toolName = this.getToolNameFromButton(button);
            if (!toolName) return;

            const star = this.createStarElement(toolName, favoriteTools);
            star.onclick = (e) => {
                e.stopPropagation();
                this.toggleFavorite(toolName, favoriteTools, toolsContainer);
            };

            const titleSpan = Context.dom.query(this.selectors.toolTitleSpan, { root: button, context: `${this.id}.toolTitleSpan` });
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

            const firstSpan = button.querySelector('span:not(.favorite-star)');
            if (firstSpan?.parentElement) {
                firstSpan.parentElement.insertBefore(star, firstSpan);
            } else {
                button.insertBefore(star, button.firstChild);
            }
        });
    },

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .favorite-star { cursor:pointer; margin-right:3px; transition:all .2s; display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; flex:0 0 14px; opacity:.7; }
            .favorite-star.inline { margin-right:6px; width:14px; height:14px; flex:0 0 14px; display:inline-flex; align-items:center; }
            .favorite-star svg { width:14px; height:14px; display:block; }
            .favorite-star:hover { opacity:1; transform:scale(1.2); }
            .favorite-star.favorited { color:gold; opacity:1; }
        `;
        document.head.appendChild(style);
        Logger.log('✓ Favorites styles injected');
    },

    findToolsContainer() {
        const searchInput = document.querySelector(this.selectors.searchInput) || Context.dom.query(this.selectors.searchInputFallback, { context: `${this.id}.searchInput` });
        if (searchInput) {
            let container = searchInput.closest('.border-b')?.nextElementSibling;
            if (container && container.classList.contains('flex-1') && container.classList.contains('overflow-y-auto')) {
                const toolsList = container.querySelector('[data-ui="tools-list"]');
                if (toolsList) return toolsList;
            }
            const toolsPanel = searchInput.closest('[data-ui="tools-panel"]');
            if (toolsPanel) {
                const toolsList = toolsPanel.querySelector('[data-ui="tools-list"]');
                if (toolsList) return toolsList;
            }
        }
        return null;
    },

    getToolNameFromButton(button) {
        const dataName = button.getAttribute && button.getAttribute('data-ui-name');
        if (dataName) return (dataName || '').trim();
        const titleSpan = Context.dom.query(this.selectors.toolTitleSpan, { root: button, context: `${this.id}.toolTitleSpan` });
        if (titleSpan) {
            const nameSpan = this.getToolNameSpanFromTitle(titleSpan);
            const text = nameSpan?.textContent?.trim();
            if (text) return text;
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
        const toolButtons = Context.dom.queryAll(this.selectors.toolButton, { root: toolsContainer, context: `${this.id}.toolButtons` });
        toolButtons.forEach(button => {
            const toolName = this.getToolNameFromButton(button);
            const star = button.querySelector('.favorite-star');
            if (!toolName || !star) return;
            this.updateStarElement(star, favoriteTools.has(toolName));
        });
    },

    isToolEnvReady() {
        return document.documentElement.getAttribute('data-fleet-dispute-tool-env-ready') === '1';
    }
};
