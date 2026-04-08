// ============= dispute-scenario-near-prompt.js =============
// Expands the native "Scenario / User Story" collapsible, clones it in an always-open
// form above the task prompt card, and hides the original block with CSS only.

const STYLE_ID = 'fleet-dispute-scenario-near-prompt-style';
const SCENARIO_LABEL = 'Scenario / User Story';

const plugin = {
    id: 'disputeScenarioNearPrompt',
    name: 'Dispute Scenario Near Prompt',
    description:
        'Moves Scenario / User Story above the task prompt (expanded clone; original hidden with CSS)',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        completed: false,
        inProgress: false,
        observer: null,
        timeoutId: null,
        missingLogged: false
    },

    onMutation(state) {
        if (state.completed || document.querySelector('[data-fleet-dispute-scenario-near-prompt]')) {
            state.completed = true;
            return;
        }
        if (state.inProgress) return;

        const btn = this.findScenarioButton();
        if (!btn) {
            if (!state.missingLogged) {
                Logger.debug('Dispute Scenario Near Prompt: Scenario / User Story control not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const sourceRoot = btn.closest('div[data-state]');
        if (!sourceRoot || !sourceRoot.parentElement) {
            Logger.warn('Dispute Scenario Near Prompt: collapsible root not found');
            return;
        }

        const promptCard = this.findPromptCard();
        if (!promptCard || !promptCard.parentElement) {
            Logger.debug('Dispute Scenario Near Prompt: task prompt card not found yet');
            return;
        }

        state.inProgress = true;
        this.beginExpandAndRelocate(state, btn, sourceRoot, promptCard);
    },

    findScenarioButton() {
        const spans = document.querySelectorAll('span.text-sm.font-medium');
        for (const s of spans) {
            if ((s.textContent || '').trim() !== SCENARIO_LABEL) continue;
            const b = s.closest('button[type="button"]');
            if (b) return b;
        }
        return null;
    },

    findPromptCard() {
        const disputesBack = document.querySelector('a[href="/work/problems/disputes"]');
        const host = disputesBack?.closest('div.p-4');
        const card = host?.querySelector(':scope > div.rounded-xl.text-card-foreground.border.bg-card');
        if (card?.querySelector('pre.text-sm.whitespace-pre-wrap')) return card;
        const pre = document.querySelector('pre.text-sm.whitespace-pre-wrap.font-mono.text-foreground');
        return pre?.closest('div.rounded-xl.text-card-foreground.border.bg-card') || null;
    },

    beginExpandAndRelocate(state, btn, sourceRoot, promptCard) {
        const panel = btn.nextElementSibling;
        if (!panel || !(panel instanceof HTMLElement)) {
            Logger.warn('Dispute Scenario Near Prompt: collapsible panel sibling missing');
            state.inProgress = false;
            return;
        }

        const finalize = () => {
            if (state.completed) return;
            if (state.timeoutId) {
                clearTimeout(state.timeoutId);
                state.timeoutId = null;
            }
            if (state.observer) {
                state.observer.disconnect();
                state.observer = null;
            }
            try {
                this.installScenarioClone(sourceRoot, promptCard);
                sourceRoot.setAttribute('data-fleet-dispute-scenario-original', 'true');
                this.ensureHideOriginalStyle();
                state.completed = true;
                Logger.log(
                    'Dispute Scenario Near Prompt: expanded, cloned Scenario / User Story above task prompt (original hidden)'
                );
            } catch (e) {
                Logger.error('Dispute Scenario Near Prompt: relocation failed', e);
            } finally {
                state.inProgress = false;
            }
        };

        const tryFinalize = () => {
            if (state.completed) return;
            const expanded = btn.getAttribute('aria-expanded') === 'true';
            const notHidden = !panel.hasAttribute('hidden');
            const hasContent =
                panel.querySelector(':scope > *') != null || (panel.textContent || '').trim().length > 0;
            if (expanded && notHidden && hasContent) {
                finalize();
            }
        };

        if (btn.getAttribute('aria-expanded') === 'false') {
            btn.click();
        }

        tryFinalize();
        if (state.completed) return;

        state.observer = new MutationObserver(() => tryFinalize());
        state.observer.observe(sourceRoot, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['hidden', 'data-state', 'aria-expanded', 'style']
        });

        state.timeoutId = setTimeout(() => {
            state.timeoutId = null;
            if (state.completed) return;
            if (state.observer) {
                state.observer.disconnect();
                state.observer = null;
            }
            state.inProgress = false;
            Logger.warn('Dispute Scenario Near Prompt: timed out waiting for scenario content to expand');
        }, 12000);
    },

    installScenarioClone(sourceRoot, promptCard) {
        const clone = sourceRoot.cloneNode(true);
        clone.removeAttribute('data-fleet-dispute-scenario-original');
        clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
        clone.querySelectorAll('[aria-controls]').forEach((el) => el.removeAttribute('aria-controls'));
        this.forceCloneExpanded(clone);

        const wrap = document.createElement('div');
        wrap.className = 'mb-4';
        wrap.dataset.fleetDisputeScenarioNearPrompt = 'true';
        wrap.appendChild(clone);

        promptCard.insertAdjacentElement('beforebegin', wrap);
    },

    forceCloneExpanded(root) {
        const chevronExpanded = 'm6 9 6 6 6-6';
        root.querySelectorAll('[data-state]').forEach((el) => el.setAttribute('data-state', 'open'));
        root.querySelectorAll('[hidden]').forEach((el) => el.removeAttribute('hidden'));
        const headerBtn = root.querySelector(':scope > button[type="button"]');
        if (headerBtn) {
            headerBtn.setAttribute('aria-expanded', 'true');
            headerBtn.style.pointerEvents = 'none';
            const path = headerBtn.querySelector(':scope > svg path');
            if (path) path.setAttribute('d', chevronExpanded);
        }
        root.querySelectorAll('[style]').forEach((el) => {
            const st = (el.getAttribute('style') || '').toLowerCase();
            if (st.includes('display:none') || st.includes('display: none')) {
                el.style.display = '';
            }
        });
    },

    ensureHideOriginalStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.setAttribute('data-fleet-plugin', this.id);
        style.textContent = `
[data-fleet-dispute-scenario-original] {
    display: none !important;
}
`;
        (document.head || document.documentElement).appendChild(style);
        Logger.log('Dispute Scenario Near Prompt: injected CSS to hide original scenario block');
    }
};
