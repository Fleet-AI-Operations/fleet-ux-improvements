// ============= fos-vm-clipboard.js =============
// Revision placement: page header beside Action Counter via Context.fosVmClipboardBar.

const plugin = {
    id: 'fosVmClipboardBar',
    name: 'VM Clipboard',
    description:
        'Extract/Overwrite VM Clipboard controls in the page header (shown when FOS env is ready)',
    _version: '2.0',
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
        return text.includes('edit problem') && text.includes('create demonstration');
    },

    findPageHeaderRow() {
        const panel =
            document.getElementById('prompt-editor') ||
            document.getElementById('instance-preview');
        let root = panel;
        while (root && root !== document.body) {
            if (root.tagName === 'MAIN' || (root.classList && root.classList.contains('flex-col'))) {
                break;
            }
            root = root.parentElement;
        }
        if (!root) {
            root = document.querySelector('main') || document.body;
        }

        const candidates = root.querySelectorAll('div');
        for (const el of candidates) {
            if (!this.isPageHeaderRow(el)) continue;
            let best = el;
            for (const child of el.querySelectorAll('div')) {
                if (this.isPageHeaderRow(child) && el.contains(child)) {
                    best = child;
                }
            }
            let node = best;
            while (node && node !== el.parentElement) {
                const style = node.className || '';
                if (
                    typeof style === 'string' &&
                    style.includes('justify-between') &&
                    this.isPageHeaderRow(node)
                ) {
                    return node;
                }
                node = node.parentElement;
            }
            return best;
        }
        return null;
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
            if (text.includes('edit problem')) continue;
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

        const counter = host.querySelector(`[${counterMarker}="true"]`);
        if (!counter) {
            return;
        }

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'VM Clipboard injected in page header',
            alreadyMounted: () => Boolean(host.querySelector(`[${marker}="true"]`)),
            mountGroup: (group) => {
                counter.insertAdjacentElement('afterend', group);
            }
        });
    }
};
