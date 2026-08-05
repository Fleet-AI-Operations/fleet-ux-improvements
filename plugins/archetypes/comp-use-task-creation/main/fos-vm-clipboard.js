// ============= fos-vm-clipboard.js =============
// Creation placement: Task/Notes tab bar beside Action Counter via Context.fosVmClipboardBar.

const plugin = {
    id: 'fosVmClipboardBar',
    name: 'VM Clipboard',
    description:
        'Extract/Overwrite VM Clipboard controls in the Task/Notes tab bar (shown when FOS env is ready)',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        anchorMissingLogged: false,
        tabBarMissingLogged: false,
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

    findContentAnchor() {
        return (
            document.getElementById('prompt-editor') ||
            document.getElementById('problem-form') ||
            document.querySelector('[data-ui="qa-task-detail-panel"]')
        );
    },

    isTaskNotesTabBar(el) {
        if (!el || el.tagName !== 'DIV') return false;
        const buttons = el.querySelectorAll(':scope > button');
        if (buttons.length < 2) return false;
        const labels = [...buttons].map((btn) => (btn.textContent || '').trim().toLowerCase());
        return labels.some((label) => label.includes('task')) && labels.some((label) => label.includes('notes'));
    },

    findTaskNotesTabBar(anchor) {
        if (!anchor) return null;
        let node = anchor;
        while (node && node !== document.body) {
            const parent = node.parentElement;
            if (!parent) break;
            for (const child of parent.children) {
                if (!this.isTaskNotesTabBar(child)) continue;
                const contentSibling = [...parent.children].some(
                    (sibling) => sibling !== child && sibling.contains(anchor)
                );
                if (contentSibling) return child;
            }
            node = parent;
        }
        return null;
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
        const anchor = this.findContentAnchor();
        if (!anchor) {
            if (state.hadAnchor) {
                Logger.debug(`Task/Notes tab bar left DOM — clipboard bar inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
                state.readyShownLogged = false;
                state.readyHiddenLogged = false;
            }
            if (!state.anchorMissingLogged) {
                Logger.debug(`content anchor not found yet`);
                state.anchorMissingLogged = true;
            }
            state.tabBarMissingLogged = false;
            return;
        }

        state.anchorMissingLogged = false;
        const tabBar = this.findTaskNotesTabBar(anchor);
        if (!tabBar) {
            if (state.hadAnchor) {
                Logger.debug(`Task/Notes tab bar left DOM — clipboard bar inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
                state.readyShownLogged = false;
                state.readyHiddenLogged = false;
            }
            if (!state.tabBarMissingLogged) {
                Logger.debug(`Task/Notes tab bar not found yet (anchor present)`);
                state.tabBarMissingLogged = true;
            }
            return;
        }

        state.tabBarMissingLogged = false;
        state.hadAnchor = true;

        const counter = tabBar.querySelector(`[${counterMarker}="true"]`);
        if (!counter) {
            return;
        }

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'VM Clipboard injected in Task/Notes tab bar',
            alreadyMounted: () => Boolean(tabBar.querySelector(`[${marker}="true"]`)),
            mountGroup: (group) => {
                counter.insertAdjacentElement('afterend', group);
            }
        });
    }
};
