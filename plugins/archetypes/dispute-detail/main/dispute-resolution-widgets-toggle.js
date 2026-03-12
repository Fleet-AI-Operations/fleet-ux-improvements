// ============= dispute-resolution-widgets-toggle.js =============
// Inserts a show/hide bar before the dispute resolution action buttons so the
// resolution form (textarea, screenshots) can be collapsed for more vertical space.

const STORAGE_KEY = 'fleet-dispute-resolution-widgets-collapsed';
const TOGGLE_BAR_ATTR = 'data-fleet-dispute-widgets-toggle-bar';
const WRAPPER_ATTR = 'data-fleet-dispute-widgets-wrapper';

const plugin = {
    id: 'disputeResolutionWidgetsToggle',
    name: 'Dispute Resolution Widgets Toggle',
    description: 'Show/hide toggle for the resolution form block above the dispute action buttons',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        appliedLogged: false,
        missingLogged: false
    },

    onMutation(state) {
        const panel = this.findResolutionPanel();
        if (!panel) {
            if (!state.missingLogged) {
                Logger.debug('Dispute widgets toggle: resolution panel not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const buttonRow = this.findActionButtonRow(panel);
        if (!buttonRow) {
            if (!state.missingLogged) {
                Logger.debug('Dispute widgets toggle: action button row not found');
                state.missingLogged = true;
            }
            return;
        }

        if (buttonRow.previousElementSibling && buttonRow.previousElementSibling.hasAttribute(TOGGLE_BAR_ATTR)) {
            return;
        }

        this.ensureStyles();
        this.wrapWidgetsAndInsertToggle(panel, buttonRow, state);
    },

    findResolutionPanel() {
        const candidates = document.querySelectorAll('.border-t.pt-4');
        for (const el of candidates) {
            if (this.findActionButtonRow(el)) return el;
        }
        return null;
    },

    findActionButtonRow(panel) {
        const rows = panel.querySelectorAll(':scope > .flex.items-center.justify-end.gap-2.mt-4');
        for (const row of rows) {
            const text = (row.textContent || '').trim();
            if (text.includes('Approve') || text.includes('Reject Dispute') || text.includes('Flag as Bug')) {
                return row;
            }
        }
        return null;
    },

    isCollapsed() {
        try {
            return localStorage.getItem(STORAGE_KEY) === '1';
        } catch {
            return false;
        }
    },

    setCollapsed(collapsed) {
        try {
            if (collapsed) localStorage.setItem(STORAGE_KEY, '1');
            else localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            Logger.warn('Dispute widgets toggle: could not persist state', e);
        }
    },

    ensureStyles() {
        const id = 'fleet-dispute-widgets-toggle-style';
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.setAttribute('data-fleet-plugin', this.id);
        style.textContent = `
            [${WRAPPER_ATTR}][aria-hidden="true"] {
                display: none !important;
            }
            [${TOGGLE_BAR_ATTR}] {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                margin-top: 0.75rem;
                margin-bottom: 0.25rem;
            }
            [${TOGGLE_BAR_ATTR}] button {
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
                font-size: 0.875rem;
                font-weight: 500;
                padding: 0.35rem 0.65rem;
                border-radius: 0.25rem;
                border: 1px solid hsl(var(--border, 214 32% 91%));
                background: hsl(var(--background, 0 0% 100%));
                color: hsl(var(--foreground, 222 47% 11%));
                cursor: pointer;
            }
            [${TOGGLE_BAR_ATTR}] button:hover {
                background: hsl(var(--accent, 210 40% 96%));
            }
            [${TOGGLE_BAR_ATTR}] button:focus-visible {
                outline: 2px solid hsl(var(--ring, 222 84% 61%));
                outline-offset: 2px;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    },

    wrapWidgetsAndInsertToggle(panel, buttonRow, state) {
        const wrapper = document.createElement('div');
        wrapper.setAttribute(WRAPPER_ATTR, '1');
        wrapper.setAttribute('data-fleet-plugin', this.id);

        const collapsed = this.isCollapsed();
        wrapper.setAttribute('aria-hidden', collapsed ? 'true' : 'false');

        while (buttonRow.previousSibling) {
            wrapper.insertBefore(buttonRow.previousSibling, wrapper.firstChild);
        }
        panel.insertBefore(wrapper, buttonRow);

        const bar = document.createElement('div');
        bar.setAttribute(TOGGLE_BAR_ATTR, '1');
        bar.setAttribute('data-fleet-plugin', this.id);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        btn.setAttribute('aria-controls', 'fleet-dispute-widgets-panel');
        wrapper.id = 'fleet-dispute-widgets-panel';

        const updateLabel = () => {
            const hidden = wrapper.getAttribute('aria-hidden') === 'true';
            btn.textContent = hidden ? 'Show widgets' : 'Hide widgets';
            btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
        };
        updateLabel();

        btn.addEventListener('click', () => {
            const hidden = wrapper.getAttribute('aria-hidden') === 'true';
            const next = !hidden;
            wrapper.setAttribute('aria-hidden', next ? 'true' : 'false');
            this.setCollapsed(next);
            updateLabel();
            Logger.log(`Dispute widgets toggle: widgets ${next ? 'hidden' : 'shown'}`);
        });

        bar.appendChild(btn);
        panel.insertBefore(bar, buttonRow);

        if (!state.appliedLogged) {
            Logger.log('Dispute widgets toggle: toggle bar inserted before action buttons');
            state.appliedLogged = true;
        }
    }
};
