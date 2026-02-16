// ============= qa-team-filter-width.js =============
// Removes the fixed width from the QA team filter dropdown so it sizes to its content.

const FIXED_WIDTH_CLASS = 'w-[160px]';
const SELECTOR = '[data-ui="qa-team-filter"]';
const MARKER_ATTR = 'data-fleet-qa-filter-width-fixed';

const plugin = {
    id: 'qaTeamFilterWidth',
    name: 'QA Team Filter Width',
    description: 'Makes the QA dashboard team filter dropdown width fit its content instead of a fixed 160px',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false
    },

    onMutation(state, context) {
        const filter = document.querySelector(SELECTOR);
        if (!filter) {
            if (!state.missingLogged) {
                Logger.debug('QA team filter: element not found');
                state.missingLogged = true;
            }
            return;
        }

        if (filter.hasAttribute(MARKER_ATTR)) {
            return;
        }

        if (!filter.classList.contains(FIXED_WIDTH_CLASS)) {
            state.missingLogged = false;
            return;
        }

        filter.classList.remove(FIXED_WIDTH_CLASS);
        filter.setAttribute(MARKER_ATTR, 'true');
        state.missingLogged = false;
        Logger.log('QA team filter: removed fixed width so dropdown sizes to content');
    }
};
