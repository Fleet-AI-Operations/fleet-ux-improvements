// ============= dispute-content-layout-fixes.js =============
// Targeted layout fixes for dispute detail text blocks and action buttons.

const STYLE_ID = 'fleet-dispute-detail-layout-fixes-style';

const plugin = {
    id: 'disputeContentLayoutFixes',
    name: 'Dispute Content Layout Fixes',
    description: 'Fixes text whitespace handling and action button visibility in dispute detail panel',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        appliedLogged: false
    },

    onMutation(state) {
        this.ensureStyle();
        if (!state.appliedLogged) {
            Logger.log('Dispute Content Layout Fixes: styles applied');
            state.appliedLogged = true;
        }
    },

    ensureStyle() {
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            style.setAttribute('data-fleet-plugin', this.id);
            document.head.appendChild(style);
        }

        style.textContent = `
            /* Preserve whitespace/newlines in disputed QA feedback text */
            [data-state="open"] .rounded-lg.border.bg-muted\\/50 .space-y-2.text-sm > p,
            [data-state="open"] .rounded-lg.border.bg-muted\\/50 .space-y-2.text-sm > div {
                white-space: pre-wrap !important;
                overflow-wrap: anywhere !important;
                word-break: break-word !important;
            }

            /* Keep dispute action bar visible and usable in constrained sizes */
            .border-t.pt-4 > .flex.items-center.justify-end.gap-2.mt-4 {
                flex-wrap: nowrap !important;
                overflow-x: auto !important;
                overflow-y: hidden !important;
                padding-bottom: 4px !important;
                scrollbar-width: thin;
            }

            .border-t.pt-4 > .flex.items-center.justify-end.gap-2.mt-4 > button {
                flex: 0 0 auto !important;
            }

            .border-t.pt-4 {
                position: sticky;
                bottom: 0;
                z-index: 10;
                background: var(--background, inherit);
            }
        `;
    }
};
