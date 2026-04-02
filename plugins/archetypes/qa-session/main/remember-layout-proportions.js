// ============= remember-layout-proportions.js =============
// Persists react-resizable panel splits on Session Trace Review (qa-session).
// Three groups when Split + trace inner chrome is present:
// - Main row: task stack (left) vs session trace (right)
// - Left column: prompt/verifier vs comments
// - Trace area: transcript vs screenshot column
//
// Uses MutationObserver on [data-panel-size] only; debounced saves (no polling loops).

const SUM_TOLERANCE = 5;
const SAVE_DEBOUNCE_MS = 500;

const plugin = {
    id: 'sessionTraceLayoutProportions',
    name: 'Remember Layout Proportions',
    description:
        'Save and restore panel split percentages for Session Trace Review (main, left stack, trace transcript vs screenshot)',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        watchSignature: null,
        panelObservers: [],
        saveTimeoutId: null,
        restoredMain: false,
        restoredInner: false,
        restoredTrace: false,
        missingLogged: false
    },

    storageKey() {
        return `plugin-${this.id}-layout-snapshot`;
    },

    getSnapshot() {
        const raw = Storage.get(this.storageKey(), null);
        if (raw == null) return null;
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw);
            } catch (e) {
                Logger.error('Session Trace Layout: failed to parse snapshot', e);
                return null;
            }
        }
        return typeof raw === 'object' ? raw : null;
    },

    setSnapshot(obj) {
        Storage.set(this.storageKey(), JSON.stringify(obj));
    },

    onMutation(state) {
        const outer = this.findOuterHorizontalGroup();
        if (!outer) {
            if (!state.missingLogged) {
                Logger.debug('Session Trace Layout: outer panel group not found');
                state.missingLogged = true;
            }
            this.teardownWatchers(state);
            return;
        }
        state.missingLogged = false;

        const layout = this.resolveLayout(outer);
        if (!layout) {
            Logger.debug('Session Trace Layout: layout panels not ready');
            return;
        }

        this.ensureWatchers(layout, state);
        this.tryRestore(layout, state);
    },

    findOuterHorizontalGroup() {
        const close = document.querySelector('a[href="/work/problems/qa-sessions"]');
        if (!close) return null;
        const header = close.closest('.flex-shrink-0.h-12');
        if (!header || !header.parentElement) return null;
        for (const child of header.parentElement.children) {
            if (
                child.matches?.('[data-panel-group][data-panel-group-direction="horizontal"]')
            ) {
                return child;
            }
        }
        return null;
    },

    getPanelChildren(groupEl) {
        return Array.from(groupEl.children).filter(el =>
            el.matches?.('[data-panel][data-panel-id]')
        );
    },

    findTraceSplitGroup(outerRight) {
        const groups = outerRight.querySelectorAll(
            '[data-panel-group-direction="horizontal"][data-panel-group]'
        );
        for (const g of groups) {
            if (g.querySelector('[data-messages-list="true"]')) return g;
        }
        return null;
    },

    resolveLayout(outer) {
        const outerPanels = this.getPanelChildren(outer);
        if (outerPanels.length !== 2) return null;
        const [outerLeft, outerRight] = outerPanels;

        const innerGroup = outerLeft.querySelector(
            ':scope [data-panel-group-direction="vertical"][data-panel-group]'
        );
        if (!innerGroup) return null;
        const innerPanels = this.getPanelChildren(innerGroup);
        if (innerPanels.length !== 2) return null;

        const traceGroup = this.findTraceSplitGroup(outerRight);
        let traceLeft = null;
        let traceRight = null;
        if (traceGroup) {
            const tp = this.getPanelChildren(traceGroup);
            if (tp.length === 2) {
                traceLeft = tp[0];
                traceRight = tp[1];
            }
        }

        return {
            outerLeft,
            outerRight,
            innerTop: innerPanels[0],
            innerBottom: innerPanels[1],
            traceLeft,
            traceRight
        };
    },

    tryRestore(layout, state) {
        const snap = this.getSnapshot();
        if (!snap) return;

        if (!state.restoredMain) {
            const a = snap.outerLeft;
            const b = snap.outerRight;
            if (
                this.isPairValid(a, b) &&
                this.readSize(layout.outerLeft) != null &&
                this.readSize(layout.outerRight) != null
            ) {
                this.applyPair(layout.outerLeft, layout.outerRight, a, b);
                state.restoredMain = true;
                Logger.log(`Session Trace Layout: restored main split ${a} / ${b}`);
            }
        }

        if (!state.restoredInner) {
            const a = snap.innerTop;
            const b = snap.innerBottom;
            if (
                this.isPairValid(a, b) &&
                this.readSize(layout.innerTop) != null &&
                this.readSize(layout.innerBottom) != null
            ) {
                this.applyPair(layout.innerTop, layout.innerBottom, a, b);
                state.restoredInner = true;
                Logger.log(`Session Trace Layout: restored left stack split ${a} / ${b}`);
            }
        }

        if (layout.traceLeft && layout.traceRight && !state.restoredTrace) {
            const a = snap.traceLeft;
            const b = snap.traceRight;
            if (
                this.isPairValid(a, b) &&
                this.readSize(layout.traceLeft) != null &&
                this.readSize(layout.traceRight) != null
            ) {
                this.applyPair(layout.traceLeft, layout.traceRight, a, b);
                state.restoredTrace = true;
                Logger.log(`Session Trace Layout: restored trace split ${a} / ${b}`);
            }
        }
    },

    isPairValid(a, b) {
        if (a == null || b == null) return false;
        if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
        return Math.abs(a + b - 100) <= SUM_TOLERANCE;
    },

    applyPair(elA, elB, sizeA, sizeB) {
        elA.style.flex = `${sizeA} 1 0px`;
        elA.setAttribute('data-panel-size', String(sizeA));
        elB.style.flex = `${sizeB} 1 0px`;
        elB.setAttribute('data-panel-size', String(sizeB));
    },

    readSize(panelEl) {
        if (!panelEl) return null;
        const attr = panelEl.getAttribute('data-panel-size');
        if (attr == null || attr === '') return null;
        const parsed = parseFloat(attr);
        return Number.isFinite(parsed) ? parsed : null;
    },

    ensureWatchers(layout, state) {
        const panels = [
            layout.outerLeft,
            layout.outerRight,
            layout.innerTop,
            layout.innerBottom
        ];
        if (layout.traceLeft && layout.traceRight) {
            panels.push(layout.traceLeft, layout.traceRight);
        }

        const sig = panels.map(p => p.getAttribute('data-panel-id')).join(',');
        if (state.watchSignature === sig) return;

        this.teardownWatchers(state);
        state.watchSignature = sig;
        state.restoredMain = false;
        state.restoredInner = false;
        state.restoredTrace = false;

        for (const p of panels) {
            const obs = new MutationObserver(() => this.scheduleSave(state));
            CleanupRegistry.registerObserver(obs);
            obs.observe(p, {
                attributes: true,
                attributeFilter: ['data-panel-size']
            });
            state.panelObservers.push(obs);
        }
        Logger.log('Session Trace Layout: observing panel size changes');
    },

    teardownWatchers(state) {
        for (const o of state.panelObservers) {
            o.disconnect();
        }
        state.panelObservers = [];
        state.watchSignature = null;
        if (state.saveTimeoutId != null) {
            clearTimeout(state.saveTimeoutId);
            state.saveTimeoutId = null;
        }
        state.restoredMain = false;
        state.restoredInner = false;
        state.restoredTrace = false;
    },

    scheduleSave(state) {
        if (state.saveTimeoutId != null) {
            clearTimeout(state.saveTimeoutId);
            state.saveTimeoutId = null;
        }
        state.saveTimeoutId = CleanupRegistry.registerTimeout(
            setTimeout(() => {
                state.saveTimeoutId = null;
                const outer = this.findOuterHorizontalGroup();
                if (!outer) return;
                const layout = this.resolveLayout(outer);
                if (!layout) return;
                this.persistLayout(layout);
            }, SAVE_DEBOUNCE_MS)
        );
    },

    persistLayout(layout) {
        const snap = {
            outerLeft: this.readSize(layout.outerLeft),
            outerRight: this.readSize(layout.outerRight),
            innerTop: this.readSize(layout.innerTop),
            innerBottom: this.readSize(layout.innerBottom)
        };
        if (
            !this.isPairValid(snap.outerLeft, snap.outerRight) ||
            !this.isPairValid(snap.innerTop, snap.innerBottom)
        ) {
            Logger.debug('Session Trace Layout: skip save (invalid main or inner pair)');
            return;
        }

        if (layout.traceLeft && layout.traceRight) {
            const tL = this.readSize(layout.traceLeft);
            const tR = this.readSize(layout.traceRight);
            if (this.isPairValid(tL, tR)) {
                snap.traceLeft = tL;
                snap.traceRight = tR;
            }
        }

        this.setSnapshot(snap);
        const tail =
            snap.traceLeft != null && snap.traceRight != null
                ? ` trace ${snap.traceLeft}/${snap.traceRight}`
                : '';
        Logger.log(
            `Session Trace Layout: saved outer ${snap.outerLeft}/${snap.outerRight} inner ${snap.innerTop}/${snap.innerBottom}${tail}`
        );
    }
};
