// ============= action-counter.js =============
// Revision placement: page header right cluster via Context.actionCounter library.

const plugin = {
    id: 'compUseActionCounter',
    name: 'Action Counter',
    description:
        'Persistent +/- counter in the page header (right-aligned); click the number to type a value',
    _version: '3.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        headerMissingLogged: false,
        activationLogged: false,
        hadHeader: false,
        migratedLegacy: false
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
            // Prefer the innermost flex row that still contains both step labels.
            let best = el;
            for (const child of el.querySelectorAll('div')) {
                if (this.isPageHeaderRow(child) && el.contains(child)) {
                    best = child;
                }
            }
            // Walk up to the justify-between row when nested.
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
        // Fallback: any sibling of the steps cluster that holds buttons.
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const text = (child.textContent || '').toLowerCase();
            if (text.includes('edit problem')) continue;
            if (child.querySelector('button')) return child;
        }
        return headerRow;
    },

    onMutation(state) {
        const api = Context.actionCounter;
        if (!api || typeof api.run !== 'function') return;

        const marker = api.COUNTER_MARKER || 'data-fleet-action-counter';
        const headerRow = this.findPageHeaderRow();
        if (!headerRow) {
            if (state.hadHeader) {
                Logger.debug(`page header left DOM — counter inactive`);
                state.hadHeader = false;
                state.activationLogged = false;
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

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'counter injected in page header',
            alreadyMounted: () => Boolean(host.querySelector(`[${marker}="true"]`)),
            mountCounter: (counter) => {
                if (host === headerRow) {
                    counter.style.marginLeft = 'auto';
                    host.appendChild(counter);
                    return;
                }
                counter.style.marginLeft = '';
                host.insertBefore(counter, host.firstChild);
            }
        });
    }
};
