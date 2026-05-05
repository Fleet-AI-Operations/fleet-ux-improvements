// ============= verifier-expand-mismatch-rows.js =============
// Checklist verifier "Per-Field Comparison" rows default to collapsed; expand rows that
// failed (red X status) once so Expected / Your Answer is visible without extra clicks.
// Same card layout as QA verifier output; dispute-detail only.

const plugin = {
    id: 'verifierExpandMismatchRows',
    name: 'Verifier expand mismatch rows',
    description:
        'Automatically expands Per-Field Comparison rows that failed verification (red X) so mismatch details show by default',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    DATA_MARK: 'data-fleet-verifier-mismatch-expanded',

    initialState: {
        pendingRaf: null,
        lastPath: null,
        sectionLogged: false,
        missingLogged: false
    },

    destroy(state) {
        if (state.pendingRaf != null) {
            cancelAnimationFrame(state.pendingRaf);
            state.pendingRaf = null;
        }
    },

    onMutation(state) {
        if (!document.body) return;

        const path = typeof location !== 'undefined' ? location.pathname : '';
        if (state.lastPath !== path) {
            state.lastPath = path;
            state.sectionLogged = false;
            state.missingLogged = false;
        }

        const found = this.findPerFieldSection();
        if (!found) {
            if (!state.missingLogged) {
                Logger.debug('Verifier Expand Mismatch Rows: Per-Field Comparison section not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        if (!state.sectionLogged) {
            state.sectionLogged = true;
            Logger.log('Verifier Expand Mismatch Rows: Per-Field Comparison section detected');
        }

        if (state.pendingRaf != null) {
            cancelAnimationFrame(state.pendingRaf);
        }
        const { fieldList } = found;
        state.pendingRaf = requestAnimationFrame(() => {
            state.pendingRaf = null;
            this.expandMismatchRows(fieldList);
        });
    },

    findPerFieldSection() {
        const labels = Context.dom.queryAll('div.text-sm.text-muted-foreground.font-medium', {
            context: 'verifierExpandMismatchRows.findPerFieldSection'
        });
        for (const label of labels) {
            const text = (label.textContent || '').trim();
            if (!text.includes('Per-Field Comparison')) continue;
            const card = label.closest('.bg-card');
            if (!card) continue;
            const fieldList = card.querySelector('div.text-xs.border-t.divide-y.divide-border');
            if (!fieldList) continue;
            return { card, fieldList };
        }
        return null;
    },

    isRowCollapsed(row) {
        const chevron = row.querySelector('svg.transition-transform');
        return !!(chevron && chevron.classList.contains('-rotate-90'));
    },

    isMismatchRow(row) {
        const headerRow = row.querySelector('.flex.items-center.justify-between');
        if (!headerRow) return false;
        const directSvgs = Array.from(headerRow.children).filter((el) => el.tagName === 'SVG');
        const statusSvg = directSvgs[directSvgs.length - 1];
        if (statusSvg) {
            const cls = statusSvg.getAttribute('class') || '';
            return cls.includes('text-red-');
        }
        return !!headerRow.querySelector('svg[class*="text-red"]');
    },

    expandMismatchRows(fieldList) {
        const rows = Array.from(fieldList.querySelectorAll(':scope > div'));
        const clicked = [];
        for (const row of rows) {
            if (!this.isMismatchRow(row) || !this.isRowCollapsed(row)) continue;
            if (row.hasAttribute(this.DATA_MARK)) continue;
            row.click();
            clicked.push(row);
        }
        if (clicked.length === 0) return;

        requestAnimationFrame(() => {
            let n = 0;
            for (const row of clicked) {
                if (!this.isRowCollapsed(row)) {
                    row.setAttribute(this.DATA_MARK, '');
                    n++;
                }
            }
            if (n > 0) {
                Logger.log(`Verifier Expand Mismatch Rows: expanded ${n} mismatch row(s)`);
            }
        });
    }
};
