// ============= dispute-content-layout-fixes.js =============
// Targeted layout fixes for dispute detail text blocks and action buttons.

const STYLE_ID = 'fleet-dispute-detail-layout-fixes-style';

const plugin = {
    id: 'disputeContentLayoutFixes',
    name: 'Dispute Content Layout Fixes',
    description: 'Fixes text whitespace handling and action button visibility in dispute detail panel',
    _version: '1.2',
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
            /* Dispute detail header row: wrap when panel is narrow so nothing goes off screen */
            .p-4 > .flex.items-center.justify-between.mb-2 {
                flex-wrap: wrap !important;
                gap: 0.5rem !important;
                min-width: 0 !important;
            }
            .p-4 > .flex.items-center.justify-between.mb-2 > .flex.items-center.gap-2 {
                flex-wrap: wrap !important;
                min-width: 0 !important;
            }

            /* Preserve whitespace/newlines in disputed QA feedback text */
            [data-state="open"] .rounded-lg.border.bg-muted\\/50 .space-y-2.text-sm > p,
            [data-state="open"] .rounded-lg.border.bg-muted\\/50 .space-y-2.text-sm > div {
                white-space: pre-wrap !important;
                overflow-wrap: anywhere !important;
                word-break: break-word !important;
            }

            /* Keep dispute action bar visible: wrap buttons when panel is too narrow */
            .border-t.pt-4 > .flex.items-center.justify-end.gap-2.mt-4 {
                flex-wrap: wrap !important;
                gap: 0.5rem !important;
                min-width: 0 !important;
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
