// ============= dispute-resolution-action-menu.js =============
// Shows Flag as Bug as a full-width native button; other actions use a select +
// Confirm control that triggers visually hidden native buttons.

const STYLE_ID = 'fleet-dispute-resolution-action-menu-style';
const MENU_ROOT_ATTR = 'data-fleet-dispute-action-menu';
const MENU_CONTROL_ATTR = 'data-fleet-dispute-menu-control';
const FLAG_WRAP_ATTR = 'data-fleet-dispute-flag-actions';
const ROW_CLASS = 'fleet-dispute-action-row--menu';
const SELECT_CLASS_HOOK = 'fleet-dispute-action-select';

/** Baseline when no action is chosen (not merged with button classes). Width comes from flex row. */
const SELECT_NEUTRAL_CLASSES = [
    'h-9 rounded-sm border border-input bg-background px-3 py-1',
    'text-sm text-foreground ring-offset-background',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    SELECT_CLASS_HOOK
].join(' ');

/** Appended on every select sync so the dropdown grows with the menu row. */
const SELECT_LAYOUT_CLASSES = 'flex-1 min-w-0 w-full max-w-full';

const plugin = {
    id: 'disputeResolutionActionMenu',
    name: 'Dispute Resolution Action Menu',
    description:
        'Keeps Flag as Bug as a full-width native button above a full-width row with an action dropdown (flex width) and fixed Confirm; other actions trigger the hidden native button',
    _version: '1.3',
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

        let wrapper = row.querySelector(`[${MENU_ROOT_ATTR}]`);
        if (!wrapper) {
            const directButtons = this.getDirectNativeButtons(row);
            const { flags, menu: menuNatives } = this.partitionActionButtons(directButtons);
            if (!menuNatives.length) {
                return;
            }

            row.classList.add(ROW_CLASS);
            const flagWrap = this.ensureFlagWrap(row, flags);
            if (flagWrap) {
                row.insertBefore(flagWrap, row.firstChild);
            }
            const sig = this.signatureForButtons(menuNatives);
            wrapper = this.buildMenuWrapper(row, menuNatives, sig);
            row.insertBefore(wrapper, flagWrap ? flagWrap.nextSibling : row.firstChild);
            if (!state.injectedLogged) {
                Logger.log(
                    'Dispute Resolution Action Menu: flag row (if any), dropdown and confirm control added'
                );
                state.injectedLogged = true;
            }
        }

        const menuNatives = this.getMenuNativeButtons(row);
        if (!menuNatives.length) {
            return;
        }

        row.classList.add(ROW_CLASS);
        const sig = this.signatureForButtons(menuNatives);
        if (wrapper.dataset.fleetActionSig !== sig) {
            const select = wrapper.querySelector('select');
            const confirmBtn = wrapper.querySelector(`button[${MENU_CONTROL_ATTR}]`);
            this.populateSelect(select, menuNatives);
            if (select) select.value = '';
            if (confirmBtn) confirmBtn.disabled = true;
            this.syncSelectVisualFromNative(select, null);
            wrapper.dataset.fleetActionSig = sig;
            Logger.log('Dispute Resolution Action Menu: action list refreshed');
        }
    },

    signatureForButtons(buttons) {
        return buttons
            .map(b => (b.textContent || '').trim().replace(/\s+/g, ' '))
            .join('\0');
    },

    /** Native action buttons that are still direct children of the row (menu actions once Flag is moved out). */
    getMenuNativeButtons(row) {
        return Array.from(row.querySelectorAll(':scope > button')).filter(
            b => !b.hasAttribute(MENU_CONTROL_ATTR)
        );
    },

    /** All native action buttons that are direct children of the row (pre- and post-inject). */
    getDirectNativeButtons(row) {
        return this.getMenuNativeButtons(row);
    },

    partitionActionButtons(buttons) {
        const flags = [];
        const menu = [];
        for (const b of buttons) {
            const t = (b.textContent || '').trim();
            if (t.includes('Flag as Bug')) flags.push(b);
            else menu.push(b);
        }
        return { flags, menu };
    },

    ensureFlagWrap(row, flags) {
        if (!flags.length) return null;
        const wrap = document.createElement('div');
        wrap.setAttribute(FLAG_WRAP_ATTR, '1');
        wrap.setAttribute('data-fleet-plugin', this.id);
        wrap.className = 'w-full min-w-0 flex flex-col gap-2';
        for (const b of flags) {
            wrap.appendChild(b);
        }
        return wrap;
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
    flex-direction: column !important;
    align-items: stretch !important;
    justify-content: flex-start !important;
    flex-wrap: nowrap !important;
    gap: 0.5rem !important;
    min-width: 0 !important;
}
.${ROW_CLASS} [${FLAG_WRAP_ATTR}] {
    width: 100% !important;
}
.${ROW_CLASS} [${FLAG_WRAP_ATTR}] > button {
    width: 100% !important;
    box-sizing: border-box !important;
}
.${ROW_CLASS} [${MENU_ROOT_ATTR}] {
    display: flex !important;
    flex-flow: row nowrap !important;
    align-items: center !important;
    width: 100% !important;
    min-width: 0 !important;
}
select.${SELECT_CLASS_HOOK} {
    appearance: none !important;
    cursor: pointer !important;
    padding-right: 2rem !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") !important;
    background-repeat: no-repeat !important;
    background-position: right 0.4rem center !important;
    background-size: 1rem !important;
}
.dark select.${SELECT_CLASS_HOOK} {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") !important;
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

    /**
     * Button classes that do not apply sensibly to a &lt;select&gt; (layout with icons, etc.).
     */
    mirroredClassTokensFromButton(button) {
        const raw = (button && button.getAttribute('class')) || '';
        const drop = new Set([
            'inline-flex',
            'items-center',
            'justify-center',
            'whitespace-nowrap',
            'mr-auto',
            'ml-auto',
            'flex',
            'shrink-0',
            'grow'
        ]);
        return raw.split(/\s+/).filter(t => {
            if (!t || drop.has(t)) return false;
            if (t.startsWith('disabled:')) return false;
            return true;
        });
    },

    syncSelectVisualFromNative(select, nativeButton) {
        if (!select) return;
        if (!nativeButton) {
            select.className = [SELECT_NEUTRAL_CLASSES, SELECT_LAYOUT_CLASSES].join(' ');
            return;
        }
        const tokens = this.mirroredClassTokensFromButton(nativeButton);
        select.className = [...tokens, SELECT_CLASS_HOOK, SELECT_LAYOUT_CLASSES].join(' ');
    },

    buildMenuWrapper(row, natives, sig) {
        const wrap = document.createElement('div');
        wrap.setAttribute(MENU_ROOT_ATTR, '1');
        wrap.setAttribute('data-fleet-plugin', this.id);
        wrap.className = 'flex flex-row flex-nowrap gap-2 items-center w-full min-w-0';
        wrap.dataset.fleetActionSig = sig;

        const select = document.createElement('select');
        select.setAttribute('aria-label', 'Dispute resolution action');
        this.syncSelectVisualFromNative(select, null);

        this.populateSelect(select, natives);

        const confirmClass =
            'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-9 px-4';

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.setAttribute(MENU_CONTROL_ATTR, '1');
        confirmBtn.setAttribute('data-fleet-plugin', this.id);
        confirmBtn.className = confirmClass;
        confirmBtn.textContent = 'Confirm Action';
        confirmBtn.disabled = true;

        select.addEventListener('change', () => {
            confirmBtn.disabled = select.value === '';
            const nativesNow = this.getMenuNativeButtons(row);
            const idx = select.value === '' ? -1 : parseInt(select.value, 10);
            const native =
                idx >= 0 && idx < nativesNow.length ? nativesNow[idx] : null;
            this.syncSelectVisualFromNative(select, native);
        });
        confirmBtn.addEventListener('click', () => this.handleConfirm(row, select, confirmBtn));

        wrap.appendChild(select);
        wrap.appendChild(confirmBtn);
        return wrap;
    },

    handleConfirm(row, select, confirmBtn) {
        const idx = parseInt(select.value, 10);
        const natives = this.getMenuNativeButtons(row);
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
        this.syncSelectVisualFromNative(select, null);
    }
};
