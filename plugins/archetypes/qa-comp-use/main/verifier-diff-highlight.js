// ============= verifier-diff-highlight.js =============
// Character-level diff highlighting for verifier "Per-Field Comparison" (Expected vs Your Answer)

const plugin = {
    id: 'verifierDiffHighlightV1',
    name: 'Verifier Diff Highlighting',
    description: 'Character-level diff between Expected and Your Answer in verifier output',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        bootstrapped: false,
        stylesInjected: false,
        verifierObserved: false,
        toggleInserted: false,
        highlightsEnabled: true,
        bodyObserver: null,
        cardObserver: null,
        verifierCard: null,
        fieldListContainer: null,
        headerLabel: null,
        rowSignatures: null,
        verifierDiffOriginalHtml: null,
        scanScheduled: false,
        lastReadyRows: -1
    },

    onMutation(state) {
        if (state.bootstrapped) return;
        if (!document.body || !document.head) return;
        state.bootstrapped = true;

        this.ensureStyles(state);
        this.initializeCaches(state);
        this.installBodyObserver(state);
        this.refreshVerifierBinding(state);
        Logger.log('✓ Verifier Diff Highlight observer bootstrap complete');
    },

    destroy(state) {
        this.disconnectCardObserver(state);
        if (state.bodyObserver) {
            state.bodyObserver.disconnect();
            state.bodyObserver = null;
        }
        if (state.fieldListContainer) {
            this.removeHighlights(state, state.fieldListContainer);
        }
        state.fieldListContainer = null;
        state.verifierCard = null;
        state.headerLabel = null;
        state.toggleInserted = false;
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
                margin-left: auto !important;
            }
            .verifier-diff-slider-on {
                background-color: #2563eb !important;
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
        if (!(state.verifierDiffOriginalHtml instanceof WeakMap)) {
            state.verifierDiffOriginalHtml = new WeakMap();
        }
    },

    installBodyObserver(state) {
        if (state.bodyObserver || !document.body) return;
        const observer = new MutationObserver(() => {
            this.scheduleRefresh(state);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        CleanupRegistry.registerObserver(observer);
        state.bodyObserver = observer;
    },

    scheduleRefresh(state) {
        if (state.scanScheduled) return;
        state.scanScheduled = true;
        queueMicrotask(() => {
            state.scanScheduled = false;
            this.refreshVerifierBinding(state);
        });
    },

    refreshVerifierBinding(state) {
        const found = this.findVerifierComparisonSection();
        if (!found) {
            this.handleVerifierRemoved(state);
            return;
        }

        const switchedContainer = state.fieldListContainer !== found.fieldList;
        if (switchedContainer) {
            this.disconnectCardObserver(state);
            state.verifierCard = found.card;
            state.fieldListContainer = found.fieldList;
            state.headerLabel = found.label;
            state.toggleInserted = false;
            state.lastReadyRows = -1;
            this.installCardObserver(state);
        }

        if (!state.toggleInserted) {
            const inserted = this.insertToggle(state);
            if (inserted) {
                state.toggleInserted = true;
                Logger.log('✓ Verifier diff toggle inserted');
            }
        }

        if (!state.verifierObserved) {
            state.verifierObserved = true;
            Logger.log('✓ Verifier Per-Field Comparison section detected');
        }

        const counts = state.highlightsEnabled
            ? this.applyDiffsToAllFields(state, state.fieldListContainer)
            : this.removeHighlights(state, state.fieldListContainer);

        if (counts.readyRows !== state.lastReadyRows) {
            state.lastReadyRows = counts.readyRows;
            Logger.debug(`Verifier comparison rows ready: ${counts.readyRows}`);
        }
        if (counts.updatedRows > 0) {
            if (state.highlightsEnabled) {
                Logger.debug(`Verifier diff highlights updated for ${counts.updatedRows} row(s)`);
            } else {
                Logger.debug(`Verifier diff highlights removed from ${counts.updatedRows} row(s)`);
            }
        }
    },

    handleVerifierRemoved(state) {
        if (!state.fieldListContainer) return;
        this.removeHighlights(state, state.fieldListContainer);
        this.disconnectCardObserver(state);
        state.verifierObserved = false;
        state.toggleInserted = false;
        state.verifierCard = null;
        state.fieldListContainer = null;
        state.headerLabel = null;
        state.lastReadyRows = -1;
        this.initializeCaches(state);
        Logger.debug('Verifier field list no longer present, resetting state');
    },

    disconnectCardObserver(state) {
        if (!state.cardObserver) return;
        state.cardObserver.disconnect();
        state.cardObserver = null;
    },

    installCardObserver(state) {
        if (state.cardObserver || !state.fieldListContainer) return;
        const observer = new MutationObserver((mutations) => {
            if (!state.fieldListContainer || !state.fieldListContainer.isConnected) {
                this.scheduleRefresh(state);
                return;
            }

            let relevant = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    relevant = true;
                    break;
                }
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    relevant = true;
                    break;
                }
            }
            if (!relevant) return;
            this.refreshVerifierBinding(state);
        });

        observer.observe(state.fieldListContainer, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
        CleanupRegistry.registerObserver(observer);
        state.cardObserver = observer;
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

    insertToggle(state) {
        const fieldListContainer = state.fieldListContainer;
        if (!fieldListContainer) return false;
        const headerBlock = fieldListContainer.previousElementSibling;
        if (!headerBlock || !headerBlock.textContent.includes('Per-Field Comparison')) {
            return false;
        }
        const headerRow = headerBlock.querySelector('.flex.items-center.gap-2') || headerBlock.firstElementChild;
        if (!headerRow) return false;
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
            slider.classList.toggle('verifier-diff-slider-on', on);
            if (!on) slider.style.backgroundColor = '#ccc';
            else slider.style.backgroundColor = '';
            knob.style.left = on ? '19px' : '3px';
        };
        updateSlider();

        const onToggleChange = () => {
            updateSlider();
            state.highlightsEnabled = checkbox.checked;
            Logger.debug(`Verifier diff highlights ${state.highlightsEnabled ? 'enabled' : 'disabled'}`);
            if (state.highlightsEnabled) {
                this.applyDiffsToAllFields(state, fieldListContainer);
            } else {
                this.removeHighlights(state, fieldListContainer);
            }
        };
        CleanupRegistry.registerEventListener(checkbox, 'change', onToggleChange);

        return true;
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
            if (state.rowSignatures.get(row) === signature) {
                continue;
            }

            if (!state.verifierDiffOriginalHtml.has(expectedSpan)) {
                state.verifierDiffOriginalHtml.set(expectedSpan, expectedSpan.innerHTML);
            }
            if (!state.verifierDiffOriginalHtml.has(answerSpan)) {
                state.verifierDiffOriginalHtml.set(answerSpan, answerSpan.innerHTML);
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
            state.rowSignatures.set(row, signature);
            updatedRows++;
        }
        return { readyRows, updatedRows };
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

            if (state.verifierDiffOriginalHtml.has(expectedSpan)) {
                expectedSpan.innerHTML = state.verifierDiffOriginalHtml.get(expectedSpan);
                state.verifierDiffOriginalHtml.delete(expectedSpan);
                updatedRows++;
            }
            if (state.verifierDiffOriginalHtml.has(answerSpan)) {
                answerSpan.innerHTML = state.verifierDiffOriginalHtml.get(answerSpan);
                state.verifierDiffOriginalHtml.delete(answerSpan);
                updatedRows++;
            }
            delete expectedSpan.dataset.verifierDiffApplied;
            delete expectedSpan.dataset.verifierDiffExpectedText;
            delete answerSpan.dataset.verifierDiffApplied;
            delete answerSpan.dataset.verifierDiffAnswerText;
            this.setBlockBackgroundForDiff(block, false);
            state.rowSignatures.delete(row);
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
