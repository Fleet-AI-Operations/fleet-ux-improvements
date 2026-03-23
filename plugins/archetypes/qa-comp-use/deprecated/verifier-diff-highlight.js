// ============= verifier-diff-highlight.js =============
// Character-level diff highlighting for verifier "Per-Field Comparison" (Expected vs Your Answer)

const plugin = {
    id: 'verifierDiffHighlightV1',
    name: 'Verifier Diff Highlighting',
    description: 'Character-level diff between Expected and Your Answer in verifier output',
    _version: '3.1',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        bootstrapped: false,
        stylesInjected: false,
        verifierObserved: false,
        verifierCard: null,
        fieldListContainer: null,
        headerLabel: null,
        rowSignatures: null,
        lastReadyRows: -1
    },

    onMutation(state) {
        if (!document.body || !document.head) return;

        if (!state.bootstrapped) {
            state.bootstrapped = true;
            this.ensureStyles(state);
            this.initializeCaches(state);
            Logger.log('✓ Verifier Diff Highlight observer bootstrap complete');
        }

        this.refreshVerifierBinding(state);
    },

    destroy(state) {
        if (state.fieldListContainer) {
            this.removeHighlights(state, state.fieldListContainer);
        }
        state.fieldListContainer = null;
        state.verifierCard = null;
        state.headerLabel = null;
        state.verifierObserved = false;
        state.lastReadyRows = -1;
    },

    ensureStyles(state) {
        if (state.stylesInjected) return;
        const style = document.createElement('style');
        style.textContent = `
            .verifier-diff-remove {
                background-color: rgba(239, 68, 68, 0.35) !important;
                color: rgb(127, 29, 29) !important;
                border-radius: 3px;
                box-decoration-break: clone;
                -webkit-box-decoration-break: clone;
            }
            .dark .verifier-diff-remove {
                background-color: rgba(239, 68, 68, 0.35) !important;
                color: rgb(254, 202, 202) !important;
            }
            .verifier-diff-add {
                background-color: rgba(16, 185, 129, 0.35) !important;
                color: rgb(6, 78, 59) !important;
                border-radius: 3px;
                box-decoration-break: clone;
                -webkit-box-decoration-break: clone;
            }
            .dark .verifier-diff-add {
                background-color: rgba(16, 185, 129, 0.35) !important;
                color: rgb(167, 243, 208) !important;
            }
            .verifier-diff-rendered {
                display: inline;
            }
        `;
        document.head.appendChild(style);
        state.stylesInjected = true;
        Logger.log('✓ Verifier Diff Highlight styles injected');
    },

    initializeCaches(state) {
        if (!(state.rowSignatures instanceof WeakMap)) {
            state.rowSignatures = new WeakMap();
        }
    },

    refreshVerifierBinding(state) {
        const found = this.findVerifierComparisonSection();
        if (!found) {
            this.handleVerifierRemoved(state);
            return;
        }

        const switchedContainer = state.fieldListContainer !== found.fieldList;
        if (switchedContainer) {
            if (state.fieldListContainer) {
                this.removeHighlights(state, state.fieldListContainer);
            }
            state.verifierCard = found.card;
            state.fieldListContainer = found.fieldList;
            state.headerLabel = found.label;
            state.lastReadyRows = -1;
        }

        if (!state.verifierObserved) {
            state.verifierObserved = true;
            Logger.log('✓ Verifier Per-Field Comparison section detected');
        }

        const counts = this.applyDiffsToAllFields(state, state.fieldListContainer);

        if (counts.readyRows !== state.lastReadyRows) {
            state.lastReadyRows = counts.readyRows;
            Logger.debug(`Verifier comparison rows ready: ${counts.readyRows}`);
        }
        if (counts.updatedRows > 0) {
            Logger.debug(`Verifier diff highlights updated for ${counts.updatedRows} row(s)`);
        }
    },

    handleVerifierRemoved(state) {
        if (!state.fieldListContainer) return;
        this.removeHighlights(state, state.fieldListContainer);
        state.verifierObserved = false;
        state.verifierCard = null;
        state.fieldListContainer = null;
        state.headerLabel = null;
        state.lastReadyRows = -1;
        this.initializeCaches(state);
        Logger.debug('Verifier field list no longer present, resetting state');
    },

    findVerifierComparisonSection() {
        const labels = Context.dom.queryAll('div.text-sm.text-muted-foreground.font-medium', {
            context: `${this.id}.findVerifierComparisonSection`
        });
        for (const label of labels) {
            const text = (label.textContent || '').trim();
            if (!text.includes('Per-Field Comparison')) continue;
            const card = label.closest('.bg-card');
            if (!card) continue;
            const fieldList = card.querySelector('div.text-xs.border-t.divide-y.divide-border');
            if (!fieldList) continue;
            return { label, card, fieldList };
        }
        return null;
    },

    getRows(container) {
        if (!container) return [];
        return Array.from(container.querySelectorAll(':scope > div'));
    },

    extractFieldPair(row) {
        let valueRows = row.querySelectorAll('.mt-2.pl-\\[18px\\].space-y-1\\.5.text-muted-foreground > div');
        if (valueRows.length < 2) {
            valueRows = row.querySelectorAll('.mt-2.pl-\\[18px\\].space-y-1.text-muted-foreground > div');
        }
        if (valueRows.length < 2) return null;

        const expectedLabel = valueRows[0].querySelector('span.font-medium.text-foreground\\/70');
        const answerLabel = valueRows[1].querySelector('span.font-medium.text-foreground\\/70');
        if (!expectedLabel || !answerLabel) return null;
        if (!expectedLabel.textContent.includes('Expected:')) return null;
        if (!answerLabel.textContent.includes('Your Answer:')) return null;

        const expectedSpan = expectedLabel.nextElementSibling;
        const answerSpan = answerLabel.nextElementSibling;
        if (!expectedSpan || !answerSpan) return null;
        if (!expectedSpan.classList.contains('break-words') || !answerSpan.classList.contains('break-words')) {
            return null;
        }

        const block = valueRows[0].parentElement || row;
        return { row, block, expectedSpan, answerSpan };
    },

    ensureMirrorSpan(sourceSpan, role) {
        const parent = sourceSpan?.parentElement;
        if (!parent) return null;

        const existing = Array.from(parent.children).find((child) => (
            child.getAttribute &&
            child.getAttribute('data-fleet-plugin') === this.id &&
            child.getAttribute('data-verifier-diff-role') === role
        ));
        if (existing) {
            return existing;
        }

        const mirror = document.createElement('span');
        mirror.className = `${sourceSpan.className || ''} verifier-diff-rendered`;
        mirror.setAttribute('data-fleet-plugin', this.id);
        mirror.setAttribute('data-verifier-diff-role', role);
        sourceSpan.insertAdjacentElement('afterend', mirror);
        return mirror;
    },

    setSourceSpanHidden(sourceSpan, hidden) {
        if (!sourceSpan) return;

        if (hidden) {
            if (!sourceSpan.dataset.verifierDiffOriginalDisplay) {
                sourceSpan.dataset.verifierDiffOriginalDisplay = sourceSpan.style.display || '';
            }
            sourceSpan.style.display = 'none';
            sourceSpan.dataset.verifierDiffHidden = 'true';
            return;
        }

        if (sourceSpan.dataset.verifierDiffHidden === 'true') {
            const stored = sourceSpan.dataset.verifierDiffOriginalDisplay;
            if (stored !== undefined && stored !== null && stored !== '') {
                sourceSpan.style.display = stored;
            } else {
                sourceSpan.style.removeProperty('display');
            }
        }
        delete sourceSpan.dataset.verifierDiffHidden;
        delete sourceSpan.dataset.verifierDiffOriginalDisplay;
    },

    removeMirrorSpan(sourceSpan, role, options = {}) {
        const parent = sourceSpan?.parentElement;
        if (!parent) return false;

        const mirror = Array.from(parent.children).find((child) => (
            child.getAttribute &&
            child.getAttribute('data-fleet-plugin') === this.id &&
            child.getAttribute('data-verifier-diff-role') === role
        ));
        if (!mirror) return false;

        if (options.copyContentToSource) {
            sourceSpan.innerHTML = mirror.innerHTML;
        }
        mirror.remove();
        return true;
    },

    hasMirrorSpan(sourceSpan, role) {
        const parent = sourceSpan?.parentElement;
        if (!parent) return false;

        return Array.from(parent.children).some((child) => (
            child.getAttribute &&
            child.getAttribute('data-fleet-plugin') === this.id &&
            child.getAttribute('data-verifier-diff-role') === role
        ));
    },

    applyDiffsToAllFields(state, container) {
        if (!container) return { readyRows: 0, updatedRows: 0 };
        this.initializeCaches(state);

        let readyRows = 0;
        let updatedRows = 0;
        const isDark = document.documentElement.classList.contains('dark');
        const styles = this.getHighlightStyles(isDark);
        const rows = this.getRows(container);
        for (const row of rows) {
            const pair = this.extractFieldPair(row);
            if (!pair) continue;
            readyRows++;
            const { block, expectedSpan, answerSpan } = pair;
            const expectedText = (expectedSpan.textContent || '').trim();
            const answerText = (answerSpan.textContent || '').trim();
            const signature = `${expectedText}\u0000${answerText}\u0000${isDark ? 'dark' : 'light'}`;
            const mirrorsPresent = this.hasMirrorSpan(expectedSpan, 'expected') && this.hasMirrorSpan(answerSpan, 'answer');
            const originalsHidden = expectedSpan.dataset.verifierDiffHidden === 'true' && answerSpan.dataset.verifierDiffHidden === 'true';
            if (state.rowSignatures.get(row) === signature && mirrorsPresent && originalsHidden) {
                continue;
            }

            const expectedHasRedText = expectedSpan.classList.contains('text-red-500') ||
                expectedSpan.querySelector('.text-red-500');
            const answerHasRedText = answerSpan.classList.contains('text-red-500') ||
                answerSpan.querySelector('.text-red-500');
            const skipDiffForRow = expectedHasRedText || answerHasRedText;

            const diff = this.computeCharDiff(expectedText, answerText);
            const expectedHtml = skipDiffForRow ? expectedSpan.innerHTML : this.renderOriginal(diff, styles.remove);
            const answerHtml = skipDiffForRow ? answerSpan.innerHTML : this.renderNew(diff, styles.add);
            const expectedMirror = this.ensureMirrorSpan(expectedSpan, 'expected');
            const answerMirror = this.ensureMirrorSpan(answerSpan, 'answer');
            if (!expectedMirror || !answerMirror) continue;

            expectedMirror.innerHTML = expectedHtml;
            answerMirror.innerHTML = answerHtml;
            expectedMirror.dataset.verifierDiffExpectedText = expectedText;
            answerMirror.dataset.verifierDiffAnswerText = answerText;
            expectedMirror.dataset.verifierDiffApplied = 'true';
            answerMirror.dataset.verifierDiffApplied = 'true';
            this.setSourceSpanHidden(expectedSpan, true);
            this.setSourceSpanHidden(answerSpan, true);
            state.rowSignatures.set(row, signature);
            updatedRows++;
        }
        return { readyRows, updatedRows };
    },

    setBlockBackgroundForDiff(block, on) {
        if (!block) return;
        block.classList.toggle('verifier-diff-block', on);
    },

    removeHighlights(state, container) {
        if (!container) return { readyRows: 0, updatedRows: 0 };
        this.initializeCaches(state);

        let readyRows = 0;
        let updatedRows = 0;
        const rows = this.getRows(container);
        for (const row of rows) {
            const pair = this.extractFieldPair(row);
            if (!pair) continue;
            readyRows++;
            const { block, expectedSpan, answerSpan } = pair;

            if (this.removeMirrorSpan(expectedSpan, 'expected', { copyContentToSource: true })) {
                updatedRows++;
            }
            if (this.removeMirrorSpan(answerSpan, 'answer', { copyContentToSource: true })) {
                updatedRows++;
            }
            this.setSourceSpanHidden(expectedSpan, false);
            this.setSourceSpanHidden(answerSpan, false);
            this.setBlockBackgroundForDiff(block, false);
            state.rowSignatures.delete(row);
        }

        const orphanMirrors = container.querySelectorAll(`[data-fleet-plugin="${this.id}"][data-verifier-diff-role]`);
        for (const mirror of orphanMirrors) {
            mirror.remove();
            updatedRows++;
        }

        const hiddenSources = container.querySelectorAll('[data-verifier-diff-hidden="true"]');
        for (const sourceSpan of hiddenSources) {
            this.setSourceSpanHidden(sourceSpan, false);
        }

        const highlightedBlocks = container.querySelectorAll('.verifier-diff-block');
        for (const block of highlightedBlocks) {
            block.classList.remove('verifier-diff-block');
        }

        return { readyRows, updatedRows };
    },

    // ---------- Character-level diff (LCS on characters) ----------

    computeLCS(a, b) {
        const m = a.length;
        const n = b.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        return dp;
    },

    backtrack(dp, a, b) {
        const diff = [];
        let i = a.length;
        let j = b.length;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
                diff.unshift({ type: 'equal', value: a[i - 1] });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                diff.unshift({ type: 'add', value: b[j - 1] });
                j--;
            } else {
                diff.unshift({ type: 'remove', value: a[i - 1] });
                i--;
            }
        }
        return diff;
    },

    computeCharDiff(expected, answer) {
        const a = expected.split('');
        const b = answer.split('');
        const dp = this.computeLCS(a, b);
        return this.backtrack(dp, a, b);
    },

    groupConsecutive(diff, includeTypes) {
        const filtered = diff.filter(d => includeTypes.includes(d.type));
        const groups = [];
        for (let i = 0; i < filtered.length; i++) {
            const item = filtered[i];
            const lastGroup = groups[groups.length - 1];
            if (lastGroup && lastGroup.type === item.type) {
                lastGroup.values.push(item.value);
            } else {
                groups.push({ type: item.type, values: [item.value] });
            }
        }
        return groups;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    getHighlightStyles(isDark) {
        const removeBg = isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.3)';
        const addBg = isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.3)';
        return {
            remove: `background-color:${removeBg};border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;`,
            add: `background-color:${addBg};border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;`
        };
    },

    renderOriginal(diff, removeStyle) {
        const groups = this.groupConsecutive(diff, ['equal', 'remove']);
        let html = '';
        groups.forEach(group => {
            const text = group.values.join('');
            if (group.type === 'remove') {
                html += `<span class="verifier-diff-remove" style="${removeStyle}">${this.escapeHtml(text)}</span>`;
            } else {
                html += this.escapeHtml(text);
            }
        });
        return html;
    },

    renderNew(diff, addStyle) {
        const groups = this.groupConsecutive(diff, ['equal', 'add']);
        let html = '';
        groups.forEach(group => {
            const text = group.values.join('');
            if (group.type === 'add') {
                html += `<span class="verifier-diff-add" style="${addStyle}">${this.escapeHtml(text)}</span>`;
            } else {
                html += this.escapeHtml(text);
            }
        });
        return html;
    }
};
