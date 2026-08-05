// ============= fos-vm-clipboard.js =============
// QA placement: beside Action Counter / Verifier tab via Context.fosVmClipboardBar.

const plugin = {
    id: 'fosVmClipboardBar',
    name: 'VM Clipboard',
    description:
        'Extract/Overwrite VM Clipboard controls beside the Verifier tab (shown when FOS env is ready)',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false,
        hadAnchor: false,
        uiHostClaimed: false,
        unsubscribe: null,
        groupEl: null,
        readyShownLogged: false,
        readyHiddenLogged: false,
        apiMissingLogged: false
    },

    init(state) {
        if (Context.fosEmbedded && typeof Context.fosEmbedded.claimUiHost === 'function') {
            Context.fosEmbedded.claimUiHost(this.id);
            state.uiHostClaimed = true;
            Logger.log(`claimed FOS UI host (floating panel suppressed)`);
        } else {
            Logger.debug(`Context.fosEmbedded missing at init — will retry on mutation`);
        }
    },

    findVerifierTab() {
        const byUi = document.querySelector('[data-ui="qa-verifier-tab"]');
        if (byUi) return byUi;
        return document.querySelector('button[role="tab"][aria-controls*="verifier-output"]');
    },

    onMutation(state) {
        if (!state.uiHostClaimed && Context.fosEmbedded && typeof Context.fosEmbedded.claimUiHost === 'function') {
            Context.fosEmbedded.claimUiHost(this.id);
            state.uiHostClaimed = true;
            Logger.log(`claimed FOS UI host (floating panel suppressed)`);
        }

        const api = Context.fosVmClipboardBar;
        if (!api || typeof api.run !== 'function') return;

        const marker = api.BAR_MARKER || 'data-fleet-fos-vm-clipboard-bar';
        const counterMarker = 'data-fleet-action-counter';
        const taskCard = document.querySelector('[data-ui="qa-task-card"]');
        if (!taskCard) {
            if (state.hadAnchor) {
                Logger.debug(`task card left DOM — clipboard bar inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
                state.readyShownLogged = false;
                state.readyHiddenLogged = false;
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
                Logger.debug(`verifier tab left DOM — clipboard bar inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
                state.readyShownLogged = false;
                state.readyHiddenLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`verifier tab not found yet`);
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        state.hadAnchor = true;

        const next = verifierTab.nextElementSibling;
        const counter =
            next && next.getAttribute(counterMarker) === 'true' ? next : null;
        if (!counter) {
            return;
        }

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'VM Clipboard injected beside Verifier tab',
            alreadyMounted: () => {
                const afterCounter = counter.nextElementSibling;
                return Boolean(afterCounter && afterCounter.getAttribute(marker) === 'true');
            },
            mountGroup: (group) => {
                counter.insertAdjacentElement('afterend', group);
            }
        });
    }
};
