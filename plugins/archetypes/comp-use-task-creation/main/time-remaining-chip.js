// ============= time-remaining-chip.js =============
// Stabilize the native Time remaining header chip so digit ticks do not shift layout.

const CHIP_MARK = 'data-fleet-time-remaining-chip';

const plugin = {
    id: 'compUseTimeRemainingChip',
    name: 'Time Remaining Chip',
    description:
        'Keeps the Time remaining countdown from shifting the header as digits change',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false,
        hadChip: false
    },

    findLabel() {
        const spans = document.querySelectorAll('span');
        for (let i = 0; i < spans.length; i++) {
            const text = (spans[i].textContent || '').trim().toLowerCase();
            if (text.startsWith('time remaining:')) {
                return spans[i];
            }
        }
        return null;
    },

    apply(label) {
        if (label.getAttribute(CHIP_MARK) === '1') return false;
        label.style.display = 'inline-block';
        label.style.fontVariantNumeric = 'tabular-nums';
        label.style.minWidth = '26ch';
        label.style.boxSizing = 'content-box';
        label.setAttribute(CHIP_MARK, '1');
        const chip = label.parentElement;
        if (chip) {
            chip.style.paddingLeft = '12px';
            chip.style.paddingRight = '12px';
        }
        return true;
    },

    onMutation(state) {
        const label = this.findLabel();
        if (!label) {
            if (state.hadChip) {
                Logger.debug('time remaining chip left DOM');
                state.hadChip = false;
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug('time remaining chip not found yet');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        state.hadChip = true;
        const applied = this.apply(label);
        if (applied && !state.activationLogged) {
            Logger.log('time remaining chip width stabilized');
            state.activationLogged = true;
        }
    }
};
