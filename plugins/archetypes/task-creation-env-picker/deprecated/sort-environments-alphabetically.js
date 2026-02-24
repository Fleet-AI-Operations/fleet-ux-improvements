
// ============= sort-environments-alphabetically.js =============
// Sorts task-creation environment cards A–Z by environment name (h4) within each project section.

const plugin = {
    id: 'sortEnvironmentsAlphabetically',
    name: 'Sort Environments Alphabetically',
    description: 'Sorts environment cards A–Z by name on the task creation environment picker page.',
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
                Logger.debug('sort-env-alphabetical: main not found');
                state.missingLogged = true;
            }
            return;
        }

        const pageHeader = main.querySelector('.text-lg.font-medium');
        if (!pageHeader || !pageHeader.textContent.includes('Create Problem Instance')) {
            return;
        }

        state.missingLogged = false;

        let sortedCount = 0;
        const grids = main.querySelectorAll('div.grid');
        for (const grid of grids) {
            if (grid.hasAttribute(this._markerSorted)) continue;
            const first = grid.children[0];
            if (!first || !first.querySelector || !first.querySelector('h4')) continue;
            this.sortGridByTitle(grid);
            grid.setAttribute(this._markerSorted, 'true');
            sortedCount++;
        }
        if (sortedCount > 0) {
            Logger.log(`sort-env-alphabetical: sorted environment cards A–Z in ${sortedCount} section(s)`);
        }
    }
};
