// ============= verifier-diff-highlight.js =============
// Character-level diff highlighting for verifier "Per-Field Comparison" (Expected vs Your Answer)

const plugin = {
    id: 'verifierDiffHighlightV1',
    name: 'Verifier Diff Highlighting',
    description: 'Character-level diff between Expected and Your Answer in verifier output',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        verifierObserved: false,
        appliedCount: 0,
        toggleInserted: false,
        highlightsEnabled: true
    },

    selectors: {
        fieldList: 'div.text-xs.border-t.divide-y.divide-border'
    },

    init(state, context) {
        const style = document.createElement('style');
        style.textContent = `
            .verifier-diff-remove {
                background-color: rgba(239, 68, 68, 0.35) !important;
                color: rgb(127, 29, 29) !important;
                padding: 0 0.125rem;
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
                padding: 0 0.125rem;
                border-radius: 3px;
                box-decoration-break: clone;
                -webkit-box-decoration-break: clone;
            }
            .dark .verifier-diff-add {
                background-color: rgba(16, 185, 129, 0.35) !important;
                color: rgb(167, 243, 208) !important;
            }
            .verifier-diff-toggle-wrap {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-left: auto;
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
                state.toggleInserted = false;
                Logger.debug('Verifier field list no longer present, resetting state');
            }
            return;
        }

        const card = container.closest('div.rounded-sm.overflow-hidden.border.bg-card');
        if (!card) return;

        if (!state.verifierObserved) {
            state.verifierObserved = true;
            Logger.log('✓ Verifier Per-Field Comparison section detected');
        }

        if (!state.toggleInserted) {
            const inserted = this.insertToggle(state, card, container);
            if (inserted) {
                state.toggleInserted = true;
                Logger.log('✓ Verifier diff toggle inserted');
            }
        }

        if (state.highlightsEnabled) {
            const applied = this.applyDiffsToAllFields(state, container);
            if (applied > 0 && applied !== state.appliedCount) {
                state.appliedCount = applied;
                Logger.log(`✓ Verifier diff highlights applied to ${applied} field(s)`);
            }
        } else {
            this.removeHighlights(state, container);
            if (state.appliedCount > 0) {
                state.appliedCount = 0;
                Logger.debug('Verifier diff highlights disabled, original content restored');
            }
        }
    },

    insertToggle(state, card, fieldListContainer) {
        const headerBlock = fieldListContainer.previousElementSibling;
        if (!headerBlock || !headerBlock.textContent.includes('Per-Field Comparison')) {
            Logger.debug('Verifier: could not find Per-Field Comparison header block');
            return false;
        }
        const headerRow = headerBlock.querySelector('.flex.items-center.gap-2') || headerBlock.firstElementChild;
        if (!headerRow) {
            Logger.debug('Verifier: could not find header row for toggle');
            return false;
        }
        if (headerRow.querySelector('.verifier-diff-toggle-wrap')) {
            return true;
        }

        const wrap = document.createElement('div');
        wrap.className = 'verifier-diff-toggle-wrap';

        const toggleId = `${this.id}-toggle`;
        const label = document.createElement('label');
        label.htmlFor = toggleId;
        label.textContent = 'Highlight Differences';
        label.setAttribute('style', 'font-size: 0.75rem; font-weight: 500; color: var(--muted-foreground); cursor: pointer; user-select: none; white-space: nowrap;');

        const switchWrap = document.createElement('label');
        switchWrap.setAttribute('style', 'position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0;');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = toggleId;
        checkbox.checked = state.highlightsEnabled;
        checkbox.setAttribute('style', 'opacity: 0; width: 0; height: 0; position: absolute;');

        const slider = document.createElement('span');
        slider.setAttribute('style', 'position: absolute; cursor: pointer; inset: 0; background-color: #ccc; transition: 0.2s; border-radius: 20px;');

        const knob = document.createElement('span');
        knob.setAttribute('style', 'position: absolute; height: 14px; width: 14px; left: 3px; bottom: 3px; background: white; transition: 0.2s; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.2);');

        slider.appendChild(knob);
        switchWrap.appendChild(checkbox);
        switchWrap.appendChild(slider);
        wrap.appendChild(label);
        wrap.appendChild(switchWrap);
        headerRow.appendChild(wrap);

        const updateSlider = () => {
            const on = checkbox.checked;
            slider.style.backgroundColor = on ? 'var(--primary, #4f46e5)' : '#ccc';
            knob.style.left = on ? '19px' : '3px';
        };
        updateSlider();

        checkbox.addEventListener('change', () => {
            updateSlider();
            state.highlightsEnabled = checkbox.checked;
            Logger.debug(`Verifier diff highlights ${state.highlightsEnabled ? 'enabled' : 'disabled'}`);
            if (state.highlightsEnabled) {
                this.applyDiffsToAllFields(state, fieldListContainer);
                state.appliedCount = 1;
            } else {
                this.removeHighlights(state, fieldListContainer);
                state.appliedCount = 0;
            }
        });
        CleanupRegistry.registerEventListener(checkbox, 'change', () => {});

        return true;
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
            pairs.push({ block, expectedSpan, answerSpan });
        }
        return pairs;
    },

    applyDiffsToAllFields(state, container) {
        const pairs = this.getFieldPairs(container);
        if (pairs.length === 0) {
            Logger.debug('No verifier field pairs (Expected/Your Answer) found');
            return 0;
        }

        if (!state.verifierDiffOriginalHtml) {
            state.verifierDiffOriginalHtml = new WeakMap();
        }
        const originalHtml = state.verifierDiffOriginalHtml;

        let applied = 0;
        const isDark = document.documentElement.classList.contains('dark');
        const styles = this.getHighlightStyles(isDark);

        for (const { block, expectedSpan, answerSpan } of pairs) {
            const expectedText = (expectedSpan.textContent || '').trim();
            const answerText = (answerSpan.textContent || '').trim();

            if (expectedSpan.dataset.verifierDiffApplied === 'true' &&
                expectedSpan.dataset.verifierDiffExpectedText === expectedText &&
                answerSpan.dataset.verifierDiffAnswerText === answerText) {
                continue;
            }

            if (!originalHtml.has(expectedSpan)) {
                originalHtml.set(expectedSpan, expectedSpan.innerHTML);
            }
            if (!originalHtml.has(answerSpan)) {
                originalHtml.set(answerSpan, answerSpan.innerHTML);
            }

            const diff = this.computeCharDiff(expectedText, answerText);
            const expectedHtml = this.renderOriginal(diff, styles.remove);
            const answerHtml = this.renderNew(diff, styles.add);

            expectedSpan.innerHTML = expectedHtml;
            answerSpan.innerHTML = answerHtml;
            expectedSpan.dataset.verifierDiffExpectedText = expectedText;
            answerSpan.dataset.verifierDiffAnswerText = answerText;
            this.setBlockBackgroundForDiff(block, true);
            expectedSpan.dataset.verifierDiffApplied = 'true';
            answerSpan.dataset.verifierDiffApplied = 'true';
            applied++;
        }
        return applied;
    },

    setBlockBackgroundForDiff(block, on) {
        if (!block) return;
        if (on) {
            if (!block.dataset.verifierDiffOriginalBg) {
                block.dataset.verifierDiffOriginalBg = block.style.backgroundColor || '';
                block.dataset.verifierDiffOriginalClassName = block.className || '';
            }
            block.style.backgroundColor = 'rgba(0, 0, 0, 0.03)';
            block.classList.add('rounded-md');
        } else {
            if (block.dataset.verifierDiffOriginalBg !== undefined) {
                block.style.backgroundColor = block.dataset.verifierDiffOriginalBg || '';
                block.className = block.dataset.verifierDiffOriginalClassName || '';
                delete block.dataset.verifierDiffOriginalBg;
                delete block.dataset.verifierDiffOriginalClassName;
            }
        }
    },

    removeHighlights(state, container) {
        const pairs = this.getFieldPairs(container);
        const originalHtml = state.verifierDiffOriginalHtml;
        if (!originalHtml) return;
        for (const { block, expectedSpan, answerSpan } of pairs) {
            if (originalHtml.has(expectedSpan)) {
                expectedSpan.innerHTML = originalHtml.get(expectedSpan);
                originalHtml.delete(expectedSpan);
            }
            if (originalHtml.has(answerSpan)) {
                answerSpan.innerHTML = originalHtml.get(answerSpan);
                originalHtml.delete(answerSpan);
            }
            delete expectedSpan.dataset.verifierDiffApplied;
            delete expectedSpan.dataset.verifierDiffExpectedText;
            delete answerSpan.dataset.verifierDiffApplied;
            delete answerSpan.dataset.verifierDiffAnswerText;
            this.setBlockBackgroundForDiff(block, false);
        }
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
