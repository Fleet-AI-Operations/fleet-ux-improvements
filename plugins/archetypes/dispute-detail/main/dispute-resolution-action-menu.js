// ============= dispute-resolution-action-menu.js =============
// Collapses native dispute resolution buttons into a select + Confirm control,
// and triggers the real button on confirm. Native buttons stay in the DOM
// (visually hidden) so page handlers keep working.

const STYLE_ID = 'fleet-dispute-resolution-action-menu-style';
const MENU_ROOT_ATTR = 'data-fleet-dispute-action-menu';
const MENU_CONTROL_ATTR = 'data-fleet-dispute-menu-control';
const ROW_CLASS = 'fleet-dispute-action-row--menu';

const plugin = {
    id: 'disputeResolutionActionMenu',
    name: 'Dispute Resolution Action Menu',
    description:
        'Replaces the row of dispute resolution buttons with a dropdown and Confirm Action control; triggers the underlying native button',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleReady: false,
        missingPanelLogged: false,
        missingRowLogged: false,
        injectedLogged: false
    },

    onMutation(state) {
        this.ensureStyles(state);
        const panel = this.findResolutionPanel();
        if (!panel) {
            if (!state.missingPanelLogged) {
                Logger.debug('Dispute Resolution Action Menu: resolution panel not found');
                state.missingPanelLogged = true;
            }
            return;
        }
        state.missingPanelLogged = false;

        const row = this.findActionButtonRow(panel);
        if (!row) {
            if (!state.missingRowLogged) {
                Logger.debug('Dispute Resolution Action Menu: action button row not found');
                state.missingRowLogged = true;
            }
            return;
        }
        state.missingRowLogged = false;

        const natives = this.getNativeActionButtons(row);
        if (!natives.length) {
            return;
        }

        row.classList.add(ROW_CLASS);
        const sig = this.signatureForButtons(natives);
        let wrapper = row.querySelector(`[${MENU_ROOT_ATTR}]`);
        if (!wrapper) {
            wrapper = this.buildMenuWrapper(row, natives, sig);
            row.appendChild(wrapper);
            if (!state.injectedLogged) {
                Logger.log('Dispute Resolution Action Menu: dropdown and confirm control added');
                state.injectedLogged = true;
            }
        } else if (wrapper.dataset.fleetActionSig !== sig) {
            const select = wrapper.querySelector('select');
            const confirmBtn = wrapper.querySelector(`button[${MENU_CONTROL_ATTR}]`);
            this.populateSelect(select, natives);
            if (select) select.value = '';
            if (confirmBtn) confirmBtn.disabled = true;
            wrapper.dataset.fleetActionSig = sig;
            Logger.log('Dispute Resolution Action Menu: action list refreshed');
        }
    },

    signatureForButtons(buttons) {
        return buttons
            .map(b => (b.textContent || '').trim().replace(/\s+/g, ' '))
            .join('\0');
    },

    getNativeActionButtons(row) {
        return Array.from(row.querySelectorAll(':scope > button')).filter(
            b => !b.hasAttribute(MENU_CONTROL_ATTR)
        );
    },

    findResolutionPanel() {
        const candidates = document.querySelectorAll('.border-t.pt-4');
        for (const el of candidates) {
            if (this.findActionButtonRow(el)) return el;
        }
        return null;
    },

    findActionButtonRow(panel) {
        // Row may be nested under collapsible content (not a direct child of .border-t.pt-4)
        const rows = panel.querySelectorAll(':scope .flex.items-center.justify-end.gap-2.mt-4');
        for (const row of rows) {
            const text = (row.textContent || '').trim();
            if (
                text.includes('Approve') ||
                text.includes('Reject Dispute') ||
                text.includes('Flag as Bug')
            ) {
                return row;
            }
        }
        return null;
    },

    ensureStyles(state) {
        if (state.styleReady && document.getElementById(STYLE_ID)) return;
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            style.setAttribute('data-fleet-plugin', this.id);
            document.head.appendChild(style);
        }
        style.textContent = `
/* Merged from deprecated dispute-content-layout-fixes (minus action-bar flex rules) */
.p-4 > .flex.items-center.justify-between.mb-2 {
    flex-wrap: wrap !important;
    gap: 0.5rem !important;
    min-width: 0 !important;
}
.p-4 > .flex.items-center.justify-between.mb-2 > .flex.items-center.gap-2 {
    flex-wrap: wrap !important;
    min-width: 0 !important;
}
[data-state="open"] .rounded-lg.border.bg-muted\\/50 .space-y-2.text-sm > p,
[data-state="open"] .rounded-lg.border.bg-muted\\/50 .space-y-2.text-sm > div {
    white-space: pre-wrap !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
}
.border-t.pt-4 {
    position: sticky;
    bottom: 0;
    z-index: 10;
    background: var(--background, inherit);
}
/* Visually hide native actions; programmatic .click() still works */
.${ROW_CLASS} > button:not([${MENU_CONTROL_ATTR}]) {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    clip-path: inset(50%) !important;
    white-space: nowrap !important;
    border: 0 !important;
}
.${ROW_CLASS} {
    position: relative !important;
    flex-wrap: wrap !important;
    gap: 0.5rem !important;
    min-width: 0 !important;
}
`;
        state.styleReady = true;
        Logger.debug('Dispute Resolution Action Menu: layout and hide styles applied');
    },

    populateSelect(select, nativeButtons) {
        if (!select) return;
        select.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Choose an action…';
        placeholder.disabled = true;
        placeholder.selected = true;
        select.appendChild(placeholder);
        nativeButtons.forEach((btn, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = (btn.textContent || '').trim().replace(/\s+/g, ' ');
            select.appendChild(opt);
        });
    },

    buildMenuWrapper(row, natives, sig) {
        const wrap = document.createElement('div');
        wrap.setAttribute(MENU_ROOT_ATTR, '1');
        wrap.setAttribute('data-fleet-plugin', this.id);
        wrap.className = 'flex flex-wrap gap-2 items-center';
        wrap.dataset.fleetActionSig = sig;

        const select = document.createElement('select');
        select.setAttribute('aria-label', 'Dispute resolution action');
        select.className =
            'h-9 min-w-[12rem] rounded-sm border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

        this.populateSelect(select, natives);

        const confirmClass =
            'inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-9 px-4';

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.setAttribute(MENU_CONTROL_ATTR, '1');
        confirmBtn.setAttribute('data-fleet-plugin', this.id);
        confirmBtn.className = confirmClass;
        confirmBtn.textContent = 'Confirm Action';
        confirmBtn.disabled = true;

        select.addEventListener('change', () => {
            confirmBtn.disabled = select.value === '';
        });
        confirmBtn.addEventListener('click', () => this.handleConfirm(row, select, confirmBtn));

        wrap.appendChild(select);
        wrap.appendChild(confirmBtn);
        return wrap;
    },

    handleConfirm(row, select, confirmBtn) {
        const idx = parseInt(select.value, 10);
        const natives = this.getNativeActionButtons(row);
        if (
            select.value === '' ||
            Number.isNaN(idx) ||
            idx < 0 ||
            idx >= natives.length
        ) {
            Logger.warn('Dispute Resolution Action Menu: confirm ignored (no valid selection)');
            return;
        }
        const label = (natives[idx].textContent || '').trim().replace(/\s+/g, ' ');
        Logger.log(`Dispute Resolution Action Menu: triggering native action "${label}"`);
        natives[idx].click();
        select.value = '';
        confirmBtn.disabled = true;
    }
};
