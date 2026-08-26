// ============= action-counter.js =============
// Creation placement: page header right cluster via Context.actionCounter library.

const plugin = {
    id: 'compUseActionCounter',
    name: 'Action Counter',
    description:
        'Persistent +/- counter in the page header; click the number to type a value',
    _version: '3.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        headerMissingLogged: false,
        activationLogged: false,
        hadHeader: false,
        migratedLegacy: false,
        stepsHiddenLogged: false
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
            // Prefer the innermost flex row that still contains both step labels.
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
        // Fallback: any sibling of the steps cluster that holds buttons.
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const text = (child.textContent || '').toLowerCase();
            if (text.includes('create problem')) continue;
            if (child.querySelector('button')) return child;
        }
        return headerRow;
    },

    hideCreationStepLabels(headerRow, state) {
        if (!headerRow) return;
        if (headerRow.getAttribute('data-fleet-hide-creation-steps') === '1') return;

        let left = null;
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const cls = child.className || '';
            if (typeof cls === 'string' && cls.includes('ml-auto')) continue;
            const text = (child.textContent || '').toLowerCase();
            if (text.includes('create problem') && text.includes('create demonstration')) {
                left = child;
                break;
            }
        }
        if (!left) return;

        const kids = Array.from(left.children);
        const stepSpans = kids.filter((el) => {
            if (el.tagName !== 'SPAN') return false;
            const t = (el.textContent || '').toLowerCase();
            return /create problem|create demonstration/.test(t);
        });
        if (!stepSpans.length) return;

        for (const span of stepSpans) {
            span.style.display = 'none';
        }

        if (stepSpans.length >= 2) {
            const start = kids.indexOf(stepSpans[0]);
            const end = kids.indexOf(stepSpans[stepSpans.length - 1]);
            for (let i = start + 1; i < end; i++) {
                const el = kids[i];
                if (!el || typeof el.tagName !== 'string') continue;
                if (el.tagName.toLowerCase() === 'svg') {
                    el.style.display = 'none';
                }
            }
        }

        headerRow.setAttribute('data-fleet-hide-creation-steps', '1');
        if (!state.stepsHiddenLogged) {
            Logger.log('step labels hidden');
            state.stepsHiddenLogged = true;
        }
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
                state.stepsHiddenLogged = false;
            }
            if (!state.headerMissingLogged) {
                Logger.debug(`page header not found yet`);
                state.headerMissingLogged = true;
            }
            return;
        }

        state.headerMissingLogged = false;
        state.hadHeader = true;
        this.hideCreationStepLabels(headerRow, state);

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
