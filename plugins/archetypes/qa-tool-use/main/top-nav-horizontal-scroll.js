// ============= top-nav-horizontal-scroll.js =============
// Makes the main app header’s tab / action cluster horizontally scrollable when it overflows.

const ATTR = 'data-fleet-qa-top-nav-scroll';

const plugin = {
    id: 'qaToolUseTopNavScroll',
    name: 'Top nav horizontal scroll',
    description:
        'Allows horizontal scrolling in the main top bar when tabs and action buttons exceed the viewport width',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false,
        activationLogged: false,
        hadRow: false,
        styleInjected: false
    },

    findAppTopBarRow() {
        const main = document.querySelector('main');
        if (!main) return null;
        const rows = main.querySelectorAll('.flex.items-center.justify-between');
        for (const row of rows) {
            if (row.querySelector('[role="tablist"]') && row.querySelector('a[href="/"]')) {
                return row;
            }
        }
        return null;
    },

    /** Direct child of the header row whose subtree contains the tablist (center cluster). */
    findTabClusterHost(row) {
        const tablist = row.querySelector('[role="tablist"]');
        if (!tablist) return null;
        let el = tablist;
        while (el.parentElement && el.parentElement !== row) {
            el = el.parentElement;
        }
        return el.parentElement === row ? el : null;
    },

    ensureScrollStyles(state) {
        if (state.styleInjected) return;
        const id = 'fleet-qa-top-nav-scroll-style';
        if (document.getElementById(id)) {
            state.styleInjected = true;
            return;
        }
        const style = document.createElement('style');
        style.id = id;
        style.setAttribute('data-fleet-plugin', this.id);
        style.textContent = `
[${ATTR}="true"] {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
}
`;
        document.head.appendChild(style);
        state.styleInjected = true;
    },

    applyToHost(host, state) {
        this.ensureScrollStyles(state);
        host.setAttribute(ATTR, 'true');
        host.setAttribute('data-fleet-plugin', this.id);
        host.classList.add('min-w-0', 'flex-1', 'overflow-x-auto', 'overflow-y-hidden');
        if (host.classList.contains('flex')) {
            host.classList.add('flex-nowrap');
        }
    },

    onMutation(state) {
        const row = this.findAppTopBarRow();
        if (!row) {
            if (state.hadRow) {
                Logger.debug(`${this.id}: main header row left DOM — scroll hint inactive`);
                state.hadRow = false;
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`${this.id}: main header row not found yet`);
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;
        state.hadRow = true;

        const host = this.findTabClusterHost(row);
        if (!host) {
            Logger.warn(`${this.id}: header row found but tab cluster host could not be resolved`);
            return;
        }

        this.applyToHost(host, state);

        if (!state.activationLogged) {
            Logger.log(`${this.id}: horizontal scroll enabled on top tab cluster`);
            state.activationLogged = true;
        }
    }
};
