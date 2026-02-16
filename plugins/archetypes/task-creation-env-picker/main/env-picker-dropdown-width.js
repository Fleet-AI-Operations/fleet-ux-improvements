// ============= env-picker-dropdown-width.js =============
// Removes the fixed width from the task-creation env picker dropdowns (team, type) so they size to content.

const FIXED_WIDTH_CLASS = 'w-[160px]';
const MARKER_ATTR = 'data-fleet-env-picker-dropdown-width-fixed';

const plugin = {
    id: 'envPickerDropdownWidth',
    name: 'Env Picker Dropdown Width',
    description: 'Makes the task creation environment picker filter dropdowns (e.g. All Teams, All Types) width fit their content instead of a fixed 160px',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false
    },

    onMutation(state, context) {
        const comboboxes = document.querySelectorAll('button[role="combobox"]');
        let fixed = 0;
        for (const btn of comboboxes) {
            if (btn.hasAttribute(MARKER_ATTR)) continue;
            if (!btn.classList.contains(FIXED_WIDTH_CLASS)) continue;
            btn.classList.remove(FIXED_WIDTH_CLASS);
            btn.setAttribute(MARKER_ATTR, 'true');
            fixed++;
        }
        if (fixed > 0) {
            state.missingLogged = false;
            Logger.log(`Env picker: removed fixed width from ${fixed} dropdown(s) so they size to content`);
        }
    }
};
