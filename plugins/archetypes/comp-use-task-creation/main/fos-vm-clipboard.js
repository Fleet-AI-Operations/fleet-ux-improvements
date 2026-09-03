// ============= fos-vm-clipboard.js =============
// Creation placement: page header beside Action Counter via Context.fosVmClipboardBar.

const plugin = {
    id: 'fosVmClipboardBar',
    name: 'VM Clipboard',
    description:
        'Extract/Overwrite VM Clipboard controls in the page header (shown when FOS env is ready)',
    _version: '2.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        headerMissingLogged: false,
        activationLogged: false,
        hadHeader: false,
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

    isPageHeaderRow(el) {
        if (!el || el.tagName !== 'DIV') return false;
        const text = (el.textContent || '').toLowerCase();
        return text.includes('create problem') && text.includes('create demonstration');
    },

    resolveJustifyBetweenHeader(fromEl) {
        let node = fromEl;
        while (node && node !== document.body) {
            if (node.tagName === 'DIV') {
                const style = node.className || '';
                if (
                    typeof style === 'string' &&
                    style.includes('justify-between') &&
                    this.isPageHeaderRow(node)
                ) {
                    return node;
                }
            }
            node = node.parentElement;
        }
        return null;
    },

    findPageHeaderRowFromLabels(root) {
        const candidates = root.querySelectorAll('div');
        for (const el of candidates) {
            if (!this.isPageHeaderRow(el)) continue;
            let best = el;
            for (const child of el.querySelectorAll('div')) {
                if (this.isPageHeaderRow(child) && el.contains(child)) {
                    best = child;
                }
            }
            const justified = this.resolveJustifyBetweenHeader(best);
            if (justified) return justified;
            return best;
        }
        return null;
    },

    findPageHeaderRowFromToolbarButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const toolbarBtn = buttons.find((btn) => {
            const text = (btn.textContent || '').trim();
            return text.includes('Start Recording') || text.includes('Reset Instance');
        });
        if (!toolbarBtn) return null;
        return this.resolveJustifyBetweenHeader(toolbarBtn);
    },

    findPageHeaderRow() {
        // Creation: #prompt-editor is a textarea inside the left form, not a panel.
        // Scoping from that (or #problem-form) and stopping at the first flex-col
        // never reaches the page header above the panel group — search from main.
        const root = document.querySelector('main') || document.body;
        return this.findPageHeaderRowFromLabels(root) || this.findPageHeaderRowFromToolbarButton();
    },

    findRightHost(headerRow) {
        if (!headerRow) return null;
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const cls = child.className || '';
            if (typeof cls === 'string' && cls.includes('ml-auto')) {
                return child;
            }
        }
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const text = (child.textContent || '').toLowerCase();
            if (text.includes('create problem')) continue;
            if (child.querySelector('button')) return child;
        }
        return headerRow;
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
        const headerRow = this.findPageHeaderRow();
        if (!headerRow) {
            if (state.hadHeader) {
                Logger.debug(`page header left DOM — clipboard bar inactive`);
                state.hadHeader = false;
                state.activationLogged = false;
                state.readyShownLogged = false;
                state.readyHiddenLogged = false;
            }
            if (!state.headerMissingLogged) {
                Logger.debug(`page header not found yet`);
                state.headerMissingLogged = true;
            }
            return;
        }

        state.headerMissingLogged = false;
        state.hadHeader = true;

        const host = this.findRightHost(headerRow);
        if (!host) return;

        // Prefer sitting beside the Action Counter, but never depend on it: if the
        // counter is disabled or has not mounted, host the bar directly so
        // Extract/Overwrite are still available.
        const counter = host.querySelector(`[${counterMarker}="true"]`);
        const existing = host.querySelector(`[${marker}="true"]`);
        if (counter && existing && existing.previousElementSibling !== counter) {
            // Counter mounted after us — move beside it so the header order is stable.
            counter.insertAdjacentElement('afterend', existing);
        }

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: counter
                ? 'VM Clipboard injected in page header'
                : 'VM Clipboard injected in page header (no Action Counter)',
            alreadyMounted: () => Boolean(host.querySelector(`[${marker}="true"]`)),
            mountGroup: (group) => {
                if (counter) {
                    counter.insertAdjacentElement('afterend', group);
                } else if (host === headerRow) {
                    group.style.marginLeft = 'auto';
                    host.appendChild(group);
                } else {
                    host.insertBefore(group, host.firstChild);
                }
            }
        });
    }
};
