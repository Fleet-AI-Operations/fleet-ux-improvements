// ============= top-nav-horizontal-scroll.js ============= (library)
// Compacts the QA review header: hides Prompt v# + Environment/Team labels,
// and makes the action-button cluster horizontally scrollable when it overflows.

const ATTR_SCROLL = 'data-fleet-qa-top-nav-scroll';
const ATTR_WRAP = 'data-fleet-qa-top-nav-scroll-wrap';
const ATTR_INNER = 'data-fleet-qa-top-nav-scroll-inner';
const ATTR_COMPACT_HIDE = 'data-fleet-qa-compact-hide';
const ATTR_ACTIONS_INNER = 'data-fleet-qa-top-nav-actions-inner';

const ACTION_UI_SELECTORS = [
    '[data-ui="approve-task"]',
    '[data-ui="request-revisions"]',
    '[data-ui="flag-bugged"]'
];

const LABEL_TEXTS = new Set(['Environment:', 'Team:']);

const TopNavHorizontalScrollApi = {
    id: 'qaCompUseTopNavScroll',
    name: 'QA header compact',
    description:
        'Compacts the QA header: hides Prompt v# and Environment/Team labels, and allows horizontal scrolling of the action-button cluster when it overflows',
    _version: '3.1',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false,
        waitingActionsLogged: false,
        activationLogged: false,
        hadHeader: false,
        hadActions: false,
        styleInjected: false,
        noInnerLogged: false
    },

    findQaHeader() {
        return document.querySelector('[data-ui="qa-header"]');
    },

    findHeaderInnerRow(header) {
        const direct = header.querySelector(':scope > .flex.items-center');
        return direct || null;
    },

    findActionAnchor(header) {
        for (const sel of ACTION_UI_SELECTORS) {
            const el = header.querySelector(sel);
            if (el) return el;
        }
        return null;
    },

    findActionCluster(innerRow, header) {
        const anchor = this.findActionAnchor(header);
        if (!anchor) return null;
        let el = anchor;
        while (el && el.parentElement !== innerRow) {
            el = el.parentElement;
        }
        return el && el.parentElement === innerRow ? el : null;
    },

    findActionsInnerRow(cluster) {
        const direct = cluster.querySelector(':scope > .flex.items-center');
        return direct || cluster.querySelector('.flex.items-center.gap-1') || null;
    },

    hideMetaLabels(header) {
        const spans = header.querySelectorAll('span');
        for (const span of spans) {
            const text = (span.textContent || '').trim();
            if (LABEL_TEXTS.has(text)) {
                span.setAttribute(ATTR_COMPACT_HIDE, 'true');
            }
        }
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
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
}
[${ATTR_ACTIONS_INNER}="true"] {
    flex-wrap: nowrap !important;
    min-width: max-content;
    justify-content: flex-start !important;
}
[data-ui="qa-header"] [data-ui="qa-prompt-version"] {
    display: none !important;
}
[data-ui="qa-header"] [${ATTR_COMPACT_HIDE}] {
    display: none !important;
}
`;
        document.head.appendChild(style);
        state.styleInjected = true;
    },

    applyWrap(header, innerRow, actionsCluster, state) {
        this.ensureScrollStyles(state);
        header.setAttribute(ATTR_WRAP, 'true');
        innerRow.setAttribute(ATTR_INNER, 'true');
        innerRow.classList.add('w-full', 'min-w-0');

        actionsCluster.setAttribute(ATTR_SCROLL, 'true');
        actionsCluster.setAttribute('data-fleet-plugin', this.id);
        actionsCluster.classList.add('min-w-0', 'overflow-x-auto', 'overflow-y-hidden');

        const actionsInner = this.findActionsInnerRow(actionsCluster);
        if (actionsInner) {
            actionsInner.setAttribute(ATTR_ACTIONS_INNER, 'true');
            actionsInner.classList.add('flex-nowrap');
        }

        this.hideMetaLabels(header);
    },

    run(state) {
        const header = this.findQaHeader();
        if (!header) {
            if (state.hadHeader || state.hadActions) {
                Logger.debug(`[data-ui="qa-header"] left DOM — compact inactive`);
                state.hadHeader = false;
                state.hadActions = false;
                state.activationLogged = false;
                state.waitingActionsLogged = false;
                state.noInnerLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`QA header not found yet`);
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;
        state.hadHeader = true;

        const innerRow = this.findHeaderInnerRow(header);
        if (!innerRow) {
            if (!state.noInnerLogged) {
                Logger.warn(`QA header found but inner flex row missing`);
                state.noInnerLogged = true;
            }
            return;
        }
        state.noInnerLogged = false;

        const actionsCluster = this.findActionCluster(innerRow, header);
        if (!actionsCluster) {
            if (state.hadActions) {
                Logger.debug(`QA header action cluster left DOM — compact inactive`);
                state.hadActions = false;
                state.activationLogged = false;
            }
            if (!state.waitingActionsLogged) {
                Logger.debug(`QA header present but action cluster not ready yet`);
                state.waitingActionsLogged = true;
            }
            return;
        }
        state.waitingActionsLogged = false;
        state.hadActions = true;

        this.applyWrap(header, innerRow, actionsCluster, state);

        if (!state.activationLogged) {
            Logger.log(`QA header compacted: Prompt v# and Environment/Team labels hidden; action cluster scroll enabled`);
            state.activationLogged = true;
        }
    }
};


const plugin = {
    id: 'topNavHorizontalScrollLib',
    name: 'QA Header Compact (library)',
    description: 'Shared API for QA header compact + action-cluster horizontal scroll',
    _version: '3.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.topNavHorizontalScroll = {
            run: (s, options) => {
                const impl = Object.create(TopNavHorizontalScrollApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }

                return TopNavHorizontalScrollApi.run.call(impl, s, options);
            }
        };
        if (!state.registered) {
            Logger.log('module registered (Context.topNavHorizontalScroll)');
            state.registered = true;
        }
    }
};
