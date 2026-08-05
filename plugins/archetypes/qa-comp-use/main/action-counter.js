// ============= action-counter.js =============
// QA placement: beside Verifier tab via Context.actionCounter library.

const plugin = {
    id: 'compUseActionCounter',
    name: 'Action Counter',
    description:
        'Persistent +/- counter beside the Verifier tab; click the number to type a value',
    _version: '2.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false,
        hadAnchor: false,
        migratedLegacy: false
    },

    findVerifierTab() {
        const byUi = document.querySelector('[data-ui="qa-verifier-tab"]');
        if (byUi) return byUi;
        return document.querySelector('button[role="tab"][aria-controls*="verifier-output"]');
    },

    onMutation(state) {
        const api = Context.actionCounter;
        if (!api || typeof api.run !== 'function') return;

        const marker = api.COUNTER_MARKER || 'data-fleet-action-counter';
        const taskCard = document.querySelector('[data-ui="qa-task-card"]');
        if (!taskCard) {
            if (state.hadAnchor) {
                Logger.debug(`task card left DOM — counter inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`[data-ui="qa-task-card"] not found yet`);
                state.missingLogged = true;
            }
            return;
        }

        const verifierTab = this.findVerifierTab();
        if (!verifierTab) {
            if (state.hadAnchor) {
                Logger.debug(`verifier tab left DOM — counter inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`verifier tab not found yet`);
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        state.hadAnchor = true;

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'counter injected beside Verifier tab',
            alreadyMounted: () => {
                const next = verifierTab.nextElementSibling;
                return Boolean(next && next.getAttribute(marker) === 'true');
            },
            mountCounter: (counter) => {
                verifierTab.insertAdjacentElement('afterend', counter);
            }
        });
    }
};
