
// ============= sort-qa-environments-alphabetically.js =============
// Optional submodule: sorts environment cards alphabetically by name (h4).
// Works with or without auto-sort (sorts the main grid or each section grid).

const plugin = {
    id: 'sortQaEnvironmentsAlphabetically',
    name: 'Sort QA Environments Alphabetically',
    description: 'Sorts QA review environment cards A–Z by environment name. Optional; works with or without team grouping.',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    _markerSorted: 'data-wf-alphabetically-sorted',

    initialState: {
        missingLogged: false
    },

    getCardTitle(card) {
        const h4 = card.querySelector('h4');
        return (h4 && h4.textContent.trim()) || '';
    },

    sortGridByTitle(grid) {
        const cards = Array.from(grid.children);
        if (cards.length === 0) return;
        const hasCardStructure = cards[0].querySelector && cards[0].querySelector('h4');
        if (!hasCardStructure) return;
        cards.sort((a, b) => this.getCardTitle(a).localeCompare(this.getCardTitle(b), undefined, { sensitivity: 'base' }));
        cards.forEach((node) => grid.appendChild(node));
    },

    onMutation(state, context) {
        const main = Context.dom.query('main', { context: `${this.id}.main` });
        if (!main) {
            if (!state.missingLogged) {
                Logger.debug('sort-qa-alphabetical: main not found');
                state.missingLogged = true;
            }
            return;
        }

        const pageHeader = main.querySelector('.text-lg.font-medium');
        if (!pageHeader || !pageHeader.textContent.includes('QA Review - Select Environment')) {
            return;
        }

        state.missingLogged = false;

        const sortedContainer = main.querySelector('[data-wf-team-sorted]');
        if (sortedContainer) {
            if (sortedContainer.hasAttribute(this._markerSorted)) return;
            const grids = sortedContainer.querySelectorAll('div.grid');
            for (const grid of grids) {
                if (grid.querySelector(':scope > * h4')) this.sortGridByTitle(grid);
            }
            sortedContainer.setAttribute(this._markerSorted, 'true');
            Logger.log('sort-qa-alphabetical: sorted environment cards A–Z within team sections');
            return;
        }

        const grid = main.querySelector('.grid.grid-cols-1');
        if (!grid || grid.children.length === 0) return;
        if (grid.hasAttribute(this._markerSorted)) return;
        const first = grid.children[0];
        if (!first || !first.querySelector || !first.querySelector('h4')) return;
        this.sortGridByTitle(grid);
        grid.setAttribute(this._markerSorted, 'true');
        Logger.log('sort-qa-alphabetical: sorted environment cards A–Z');
    }
};
