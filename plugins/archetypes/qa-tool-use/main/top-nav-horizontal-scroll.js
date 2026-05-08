// ============= top-nav-horizontal-scroll.js =============
// Makes the QA review header action row horizontally scrollable when it overflows.

const ATTR_SCROLL = 'data-fleet-qa-top-nav-scroll';
const ATTR_WRAP = 'data-fleet-qa-top-nav-scroll-wrap';
const ATTR_INNER = 'data-fleet-qa-top-nav-scroll-inner';

const plugin = {
    id: 'qaToolUseTopNavScroll',
    name: 'Top nav horizontal scroll',
    description:
        'Allows horizontal scrolling on the QA header ([data-ui="qa-header"]) when action buttons exceed the viewport width',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false,
        activationLogged: false,
        hadHeader: false,
        styleInjected: false
    },

    findQaHeader() {
        return document.querySelector('[data-ui="qa-header"]');
    },

    /** Direct child row: flex strip with left / center (flex-1) / right clusters. */
    findHeaderInnerRow(header) {
        const direct = header.querySelector(':scope > .flex.items-center');
        return direct || null;
    },

    /** Center column that holds Approve / Request Revisions / plugin buttons, etc. */
    findCenterCluster(innerRow) {
        for (const child of innerRow.children) {
            if (child.classList && child.classList.contains('flex-1')) {
                return child;
            }
        }
        const byApprove = innerRow.querySelector('[data-ui="approve-task"]');
        if (byApprove) {
            let el = byApprove.closest('.flex.flex-1');
            if (el && el.parentElement === innerRow) return el;
        }
        return null;
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
[${ATTR_WRAP}="true"] {
    min-width: 0;
    max-width: 100%;
}
[${ATTR_INNER}="true"] {
    min-width: 0;
}
[${ATTR_SCROLL}="true"] {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    justify-content: flex-start !important;
}
`;
        document.head.appendChild(style);
        state.styleInjected = true;
    },

    applyWrap(header, innerRow, center, state) {
        this.ensureScrollStyles(state);
        header.setAttribute(ATTR_WRAP, 'true');
        innerRow.setAttribute(ATTR_INNER, 'true');
        innerRow.classList.add('w-full', 'min-w-0');

        center.setAttribute(ATTR_SCROLL, 'true');
        center.setAttribute('data-fleet-plugin', this.id);
        center.classList.add(
            'min-w-0',
            'flex-1',
            'overflow-x-auto',
            'overflow-y-hidden',
            'justify-start'
        );
        if (center.classList.contains('flex')) {
            center.classList.add('flex-nowrap');
        }
    },

    onMutation(state) {
        const header = this.findQaHeader();
        if (!header) {
            if (state.hadHeader) {
                Logger.debug(`${this.id}: [data-ui="qa-header"] left DOM — scroll inactive`);
                state.hadHeader = false;
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`${this.id}: QA header not found yet`);
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;
        state.hadHeader = true;

        const innerRow = this.findHeaderInnerRow(header);
        if (!innerRow) {
            Logger.warn(`${this.id}: QA header found but inner flex row missing`);
            return;
        }

        const center = this.findCenterCluster(innerRow);
        if (!center) {
            Logger.warn(`${this.id}: QA header inner row has no flex-1 center cluster`);
            return;
        }

        this.applyWrap(header, innerRow, center, state);

        if (!state.activationLogged) {
            Logger.log(`${this.id}: horizontal scroll enabled on QA header action cluster`);
            state.activationLogged = true;
        }
    }
};
