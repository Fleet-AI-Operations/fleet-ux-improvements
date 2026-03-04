// ============= verifier-diff-highlight.js =============
// Character-level diff highlighting for verifier "Per-Field Comparison" (Expected vs Your Answer)

const plugin = {
    id: 'verifierDiffHighlightV1',
    name: 'Verifier Diff Highlighting',
    description: 'Character-level diff between Expected and Your Answer in verifier output',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        verifierObserved: false,
        appliedCount: 0
    },

    selectors: {
        // Card that contains "Per-Field Comparison" and the field list
        perFieldSection: null, // found by text
        // List of field rows
        fieldList: 'div.text-xs.border-t.divide-y.divide-border'
    },

    init(state, context) {
        const style = document.createElement('style');
        style.textContent = `
            .verifier-diff-remove {
                background-color: rgba(239, 68, 68, 0.25) !important;
                color: rgb(127, 29, 29);
                padding: 0 0.125rem;
                border-radius: 3px;
                box-decoration-break: clone;
                -webkit-box-decoration-break: clone;
            }
            .dark .verifier-diff-remove {
                background-color: rgba(239, 68, 68, 0.2) !important;
                color: rgb(254, 202, 202);
            }
            .verifier-diff-add {
                background-color: rgba(16, 185, 129, 0.25) !important;
                color: rgb(6, 78, 59);
                padding: 0 0.125rem;
                border-radius: 3px;
                box-decoration-break: clone;
                -webkit-box-decoration-break: clone;
            }
            .dark .verifier-diff-add {
                background-color: rgba(16, 185, 129, 0.2) !important;
                color: rgb(167, 243, 208);
            }
        `;
        document.head.appendChild(style);
        Logger.log('✓ Verifier Diff Highlight styles injected');
    },

    onMutation(state, context) {
        const container = this.findVerifierFieldList();
        if (!container) {
            if (state.verifierObserved) {
                state.verifierObserved = false;
                state.appliedCount = 0;
                Logger.debug('Verifier field list no longer present, resetting state');
            }
            return;
        }

        if (!state.verifierObserved) {
            state.verifierObserved = true;
            Logger.log('✓ Verifier Per-Field Comparison section detected');
        }

        const applied = this.applyDiffsToAllFields(container);
        if (applied > 0 && applied !== state.appliedCount) {
            state.appliedCount = applied;
            Logger.log(`✓ Verifier diff highlights applied to ${applied} field(s)`);
        }
    },

    findVerifierFieldList() {
        const candidates = Context.dom.queryAll('div.text-xs.border-t.divide-y', {
            context: `${this.id}.findVerifierFieldList`
        });
        for (const el of candidates) {
            const card = el.closest('div.rounded-sm.overflow-hidden.border.bg-card');
            if (!card) continue;
            if (!card.textContent.includes('Per-Field Comparison')) continue;
            return el;
        }
        return null;
    },

    getFieldPairs(container) {
        const pairs = [];
        const rows = container.querySelectorAll(':scope > div');
        for (const row of rows) {
            const block = row.querySelector('[class*="space-y-1.5"].text-muted-foreground') ||
                row.querySelector('[class*="space-y-1"]');
            if (!block) continue;
            const divs = block.querySelectorAll(':scope > div');
            if (divs.length < 2) continue;
            const expectedSpan = divs[0].querySelector('span.break-words');
            const answerSpan = divs[1].querySelector('span.break-words');
            if (!expectedSpan || !answerSpan) continue;
            pairs.push({ expectedSpan, answerSpan });
        }
        return pairs;
    },

    applyDiffsToAllFields(container) {
        const pairs = this.getFieldPairs(container);
        if (pairs.length === 0) {
            Logger.debug('No verifier field pairs (Expected/Your Answer) found');
            return 0;
        }

        let applied = 0;
        const isDark = document.documentElement.classList.contains('dark');
        const styles = this.getHighlightStyles(isDark);

        for (const { expectedSpan, answerSpan } of pairs) {
            const expectedText = (expectedSpan.textContent || '').trim();
            const answerText = (answerSpan.textContent || '').trim();

            if (expectedSpan.dataset.verifierDiffExpected === expectedText &&
                answerSpan.dataset.verifierDiffAnswer === answerText &&
                expectedSpan.dataset.verifierDiffApplied === 'true') {
                continue;
            }

            const diff = this.computeCharDiff(expectedText, answerText);
            const expectedHtml = this.renderOriginal(diff, styles.remove);
            const answerHtml = this.renderNew(diff, styles.add);

            expectedSpan.innerHTML = expectedHtml;
            answerSpan.innerHTML = answerHtml;
            expectedSpan.dataset.verifierDiffExpected = expectedText;
            answerSpan.dataset.verifierDiffAnswer = answerText;
            expectedSpan.dataset.verifierDiffApplied = 'true';
            answerSpan.dataset.verifierDiffApplied = 'true';
            applied++;
        }
        return applied;
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

    groupConsecutive(diff, includeTypes, highlightType) {
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
            remove: `background-color:${removeBg};border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:0 0.125rem;`,
            add: `background-color:${addBg};border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:0 0.125rem;`
        };
    },

    renderOriginal(diff, removeStyle) {
        const groups = this.groupConsecutive(diff, ['equal', 'remove'], 'remove');
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
        const groups = this.groupConsecutive(diff, ['equal', 'add'], 'add');
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
