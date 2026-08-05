// ============= fos-vm-clipboard.js =============
// Dispute detail placement: after Computer Use badge in instance status bar.

const plugin = {
    id: 'fosVmClipboardBar',
    name: 'VM Clipboard',
    description:
        'Extract/Overwrite VM Clipboard controls after the Computer Use badge (shown when FOS env is ready)',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false,
        hadAnchor: false,
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

    normalizeLabel(el) {
        return String((el && el.textContent) || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    },

    findInstanceStatusRow() {
        const rows = document.querySelectorAll('div.flex.items-center.justify-between');
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const text = this.normalizeLabel(row);
            if (text.includes('instance running') || text.includes('computer use')) {
                return row;
            }
        }
        return null;
    },

    findComputerUseBadge() {
        const row = this.findInstanceStatusRow();
        if (!row) return null;
        const candidates = row.querySelectorAll('span, div');
        let found = null;
        for (let i = 0; i < candidates.length; i++) {
            const el = candidates[i];
            if (this.normalizeLabel(el) !== 'computer use') continue;
            // Prefer the leaf badge (no nested element with the same label).
            let hasLabeledChild = false;
            const kids = el.querySelectorAll('span, div');
            for (let j = 0; j < kids.length; j++) {
                if (this.normalizeLabel(kids[j]) === 'computer use') {
                    hasLabeledChild = true;
                    break;
                }
            }
            if (!hasLabeledChild) {
                found = el;
            }
        }
        return found;
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
        const badge = this.findComputerUseBadge();
        if (!badge) {
            if (state.hadAnchor) {
                Logger.debug(`Computer Use badge left DOM — clipboard bar inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
                state.readyShownLogged = false;
                state.readyHiddenLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`Computer Use badge not found yet`);
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        state.hadAnchor = true;

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'VM Clipboard injected after Computer Use badge',
            alreadyMounted: () => {
                const next = badge.nextElementSibling;
                return Boolean(next && next.getAttribute(marker) === 'true');
            },
            mountGroup: (group) => {
                badge.insertAdjacentElement('afterend', group);
            }
        });
    }
};
