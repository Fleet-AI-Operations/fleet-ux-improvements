// ============= action-counter.js =============
// Revision placement: Task/Notes tab bar via Context.actionCounter library.

const plugin = {
    id: 'compUseActionCounter',
    name: 'Action Counter',
    description:
        'Persistent +/- counter in the Task/Notes tab bar (right-aligned); click the number to type a value',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        anchorMissingLogged: false,
        tabBarMissingLogged: false,
        activationLogged: false,
        hadAnchor: false,
        migratedLegacy: false
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
        const api = Context.actionCounter;
        if (!api || typeof api.run !== 'function') return;

        const marker = api.COUNTER_MARKER || 'data-fleet-action-counter';
        const anchor = this.findContentAnchor();
        if (!anchor) {
            if (state.hadAnchor) {
                Logger.debug(`${this.id}: Task/Notes tab bar left DOM — counter inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
            }
            if (!state.anchorMissingLogged) {
                Logger.debug(`${this.id}: content anchor not found yet`);
                state.anchorMissingLogged = true;
            }
            state.tabBarMissingLogged = false;
            return;
        }

        state.anchorMissingLogged = false;
        const tabBar = this.findTaskNotesTabBar(anchor);
        if (!tabBar) {
            if (state.hadAnchor) {
                Logger.debug(`${this.id}: Task/Notes tab bar left DOM — counter inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
            }
            if (!state.tabBarMissingLogged) {
                Logger.debug(`${this.id}: Task/Notes tab bar not found yet (anchor present)`);
                state.tabBarMissingLogged = true;
            }
            return;
        }

        state.tabBarMissingLogged = false;
        state.hadAnchor = true;

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'counter injected in Task/Notes tab bar',
            alreadyMounted: () => Boolean(tabBar.querySelector(`[${marker}="true"]`)),
            mountCounter: (counter) => {
                counter.style.marginLeft = 'auto';
                tabBar.appendChild(counter);
            }
        });
    }
};
