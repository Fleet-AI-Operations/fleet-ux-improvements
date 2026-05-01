// ============= clear-search.js =============
// Adds an X-in-circle button to the tool search input that clears the search when clicked.

const plugin = {
    id: 'clearSearch',
    name: 'Clear Tool Search',
    description: 'Adds a clear `X` button to the tool search box when it has text',
    _version: '2.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false },

    selectors: {
        searchInput: '[data-ui="tools-search"]',
        searchInputFallback: 'input[placeholder="Search tools, descriptions, parameters..."]'
    },

    onMutation(state, context) {
        let searchInput = Context.dom.query(this.selectors.searchInput, { context: `${this.id}.searchInput` });
        if (!searchInput) searchInput = Context.dom.query(this.selectors.searchInputFallback, { context: `${this.id}.searchInput` });
        if (!searchInput) {
            if (!state.missingLogged) {
                Logger.debug('Search input not found for clear-search');
                state.missingLogged = true;
            }
            return;
        }

        if (searchInput.hasAttribute('data-wf-clear-search-added')) {
            return;
        }

        const wrapper = searchInput.closest('[data-ui="search-input"]') || searchInput.closest('.relative');
        if (!wrapper) {
            Logger.warn('Clear search: wrapper not found for search input');
            return;
        }

        // OpenClaw uses right-1.5; original task-creation used right-2. Try both.
        const rightDiv = wrapper.querySelector('div.absolute.right-1\\.5') ||
            wrapper.querySelector('div.absolute.right-2');
        if (!rightDiv) {
            Logger.warn('Clear search: right div (absolute right-1.5 or right-2) not found');
            return;
        }

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.setAttribute('aria-label', 'Clear search');
        clearBtn.title = 'Clear search';
        clearBtn.className = 'wf-clear-search-btn flex items-center justify-center size-6 rounded-full border-0 bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer ml-1 flex-shrink-0';
        clearBtn.innerHTML = `
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
        `;
        clearBtn.style.display = 'none';

        const updateVisibility = () => {
            const hasText = (searchInput.value || '').trim().length > 0;
            clearBtn.style.display = hasText ? 'flex' : 'none';
        };

        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            )?.set;
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(searchInput, '');
            } else {
                searchInput.value = '';
            }
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            searchInput.focus();
            updateVisibility();
            Logger.debug('Tool search cleared');
        });

        searchInput.addEventListener('input', updateVisibility);
        searchInput.addEventListener('keyup', updateVisibility);
        updateVisibility();

        rightDiv.style.display = 'flex';
        rightDiv.style.alignItems = 'center';
        rightDiv.style.gap = '4px';
        rightDiv.insertBefore(clearBtn, rightDiv.firstChild);
        searchInput.setAttribute('data-wf-clear-search-added', 'true');

        Logger.log('✓ Clear search button added to tool search');
    }
};
