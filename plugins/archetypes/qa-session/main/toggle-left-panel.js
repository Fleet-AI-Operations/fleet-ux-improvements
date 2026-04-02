// ============= toggle-left-panel.js =============
// Session Trace Review: top-bar toggle to hide/show the left column (prompt + comments)
// via body class + CSS only (no React tree edits). Also collapses the main horizontal
// resize handle so the trace column can use full width.

const HIDDEN_BODY_CLASS = 'fleet-hide-session-left-panel';
const STORAGE_SUFFIX = 'left-panel-hidden';

const plugin = {
    id: 'sessionTraceToggleLeftPanel',
    name: 'Toggle left panel (prompt / comments)',
    description:
        'Yellow-outlined top-left control: CSS-hide the main left resizable panel (task stack) without touching React nodes',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        styleInjected: false,
        missingLogged: false,
        buttonEnsured: false
    },

    onMutation(state) {
        this.ensureStyle(state);
        this.applyClassFromStorage();

        const cluster = this.findLeftToolbarCluster();
        if (!cluster) {
            if (!state.missingLogged) {
                Logger.debug('Session Trace Left Panel: left toolbar cluster not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;
        this.ensureToggleButton(cluster, state);
    },

    findLeftToolbarCluster() {
        const close = document.querySelector('a[href="/work/problems/qa-sessions"]');
        if (!close) return null;
        return close.closest('.flex.items-center.gap-3');
    },

    ensureStyle(state) {
        if (state.styleInjected) return;
        if (document.getElementById('fleet-session-left-panel-toggle-style')) {
            state.styleInjected = true;
            return;
        }
        const style = document.createElement('style');
        style.id = 'fleet-session-left-panel-toggle-style';
        style.setAttribute('data-fleet-plugin', this.id);
        // Main horizontal split: first panel (prompt/verifier/comments stack) + its drag handle.
        style.textContent = `
body.${HIDDEN_BODY_CLASS} .flex-shrink-0.h-12 + [data-panel-group][data-panel-group-direction="horizontal"] > [data-panel]:first-child {
    flex: 0 0 0px !important;
    min-width: 0 !important;
    max-width: 0 !important;
    width: 0 !important;
    overflow: hidden !important;
    visibility: hidden !important;
    pointer-events: none !important;
    opacity: 0 !important;
    border: none !important;
}
body.${HIDDEN_BODY_CLASS} .flex-shrink-0.h-12 + [data-panel-group][data-panel-group-direction="horizontal"] > [data-resize-handle][data-panel-group-direction="horizontal"] {
    flex: 0 0 0px !important;
    min-width: 0 !important;
    width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    visibility: hidden !important;
    pointer-events: none !important;
    opacity: 0 !important;
    border: none !important;
}
`;
        document.head.appendChild(style);
        state.styleInjected = true;
        Logger.log('Session Trace Left Panel: hide styles injected');
    },

    storageKey() {
        return `plugin-${this.id}-${STORAGE_SUFFIX}`;
    },

    applyClassFromStorage() {
        const hidden = Storage.get(this.storageKey(), false);
        this.setPanelHidden(!!hidden, false);
    },

    /** @param {boolean} hidden @param {boolean} persist */
    setPanelHidden(hidden, persist) {
        document.body.classList.toggle(HIDDEN_BODY_CLASS, hidden);
        if (persist) {
            Storage.set(this.storageKey(), hidden);
            Logger.log(
                `Session Trace Left Panel: ${hidden ? 'hidden (CSS)' : 'shown (CSS)'} — prompt/comments column`
            );
        }
        const btn = document.querySelector(`button[data-fleet-session-left-panel="${this.id}"]`);
        if (btn) {
            btn.textContent = hidden ? 'Show Left Panel' : 'Hide Left Panel';
            btn.title = hidden
                ? 'Show the left column (task prompt, verifier, comments)'
                : 'Hide the left column with CSS only — full width for session trace';
        }
    },

    isPanelHidden() {
        return document.body.classList.contains(HIDDEN_BODY_CLASS);
    },

    ensureToggleButton(cluster, state) {
        let btn = cluster.querySelector(`button[data-fleet-session-left-panel="${this.id}"]`);
        if (btn && btn.parentElement !== cluster) {
            btn.remove();
            btn = null;
        }
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-fleet-plugin', this.id);
            btn.setAttribute('data-fleet-session-left-panel', this.id);
            btn.className =
                'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 disabled:pointer-events-none disabled:opacity-50 h-8 rounded-sm pl-3 pr-3 text-xs border-2 border-yellow-500 dark:border-yellow-400 bg-background text-foreground shadow-sm hover:bg-muted/80 transition-colors';
            btn.addEventListener('click', () => {
                this.setPanelHidden(!this.isPanelHidden(), true);
            });
            cluster.appendChild(btn);
            if (!state.buttonEnsured) {
                Logger.log('Session Trace Left Panel: toggle button appended to left toolbar');
                state.buttonEnsured = true;
            }
        }
        this.setPanelHidden(this.isPanelHidden(), false);
    }
};
