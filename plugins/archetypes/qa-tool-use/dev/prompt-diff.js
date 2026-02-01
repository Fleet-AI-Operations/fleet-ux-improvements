// ============= prompt-diff.js =============
// Highlights word-level diffs in the "Prompt Changes" side-by-side modal.
// Adds a toggle to the modal header to show/hide highlighting (on by default).
// Uses the framework's mutation phase to detect modal appearance — no polling.

const plugin = {
    id: 'promptDiff',
    name: 'Prompt Diff Highlighter',
    description: 'Highlights word-level differences in the Prompt Changes modal with a show/hide toggle',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    selectors: {
        modal: '[role="dialog"][data-state="open"]'
    },

    initialState: {
        processedModal: null,
        highlightEnabled: true,
        diffResult: null,
        originalBeforeText: null,
        originalAfterText: null,
        beforePre: null,
        afterPre: null
    },

    init(state, context) {
        const style = document.createElement('style');
        style.textContent = `
            .prompt-diff-removed {
                background-color: rgba(254, 202, 202, 0.7);
                color: rgb(153, 27, 27);
                border-radius: 2px;
            }
            .prompt-diff-added {
                background-color: rgba(187, 247, 208, 0.7);
                color: rgb(21, 128, 61);
                border-radius: 2px;
            }
            .prompt-diff-toggle-row {
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                user-select: none;
            }
            .prompt-diff-toggle-label {
                font-size: 12px;
                color: currentColor;
                opacity: 0.6;
                transition: opacity 0.15s;
            }
            .prompt-diff-toggle-row:hover .prompt-diff-toggle-label {
                opacity: 0.85;
            }
            .prompt-diff-toggle-track {
                width: 32px;
                height: 17px;
                border-radius: 8.5px;
                background-color: #d1d5db;
                position: relative;
                transition: background-color 0.2s;
                flex-shrink: 0;
            }
            .prompt-diff-toggle-track.on {
                background-color: #3b82f6;
            }
            .prompt-diff-toggle-thumb {
                width: 13px;
                height: 13px;
                border-radius: 50%;
                background-color: white;
                position: absolute;
                top: 2px;
                left: 2px;
                transition: left 0.2s;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
            }
            .prompt-diff-toggle-track.on .prompt-diff-toggle-thumb {
                left: 17px;
            }
        `;
        document.head.appendChild(style);
        Logger.log('✓ Prompt Diff styles injected');
    },

    onMutation(state, context) {
        const modal = this.findPromptChangesModal();

        if (!modal) {
            // Modal closed or not present — reset so we can reprocess if it reappears
            if (state.processedModal) {
                this.resetState(state);
            }
            return;
        }

        // Already processed this modal instance — nothing to do
        if (modal.dataset.promptDiffProcessed === 'true') return;

        // Locate the Before and After <pre> elements
        const beforePre = this.findPanelPre(modal, 'Before');
        const afterPre = this.findPanelPre(modal, 'After');

        if (!beforePre || !afterPre) {
            Logger.debug('Prompt Diff: Before/After <pre> elements not yet available');
            return;
        }

        // Snapshot original text before we touch anything
        state.originalBeforeText = beforePre.textContent;
        state.originalAfterText = afterPre.textContent;
        state.beforePre = beforePre;
        state.afterPre = afterPre;
        state.highlightEnabled = true;

        // Run the diff engine
        state.diffResult = this.computeDiff(state.originalBeforeText, state.originalAfterText);

        // Apply highlights and wire up the toggle
        this.applyHighlights(state);
        this.insertToggle(state, modal);

        // Mark so we don't reprocess on subsequent mutation callbacks
        modal.dataset.promptDiffProcessed = 'true';
        state.processedModal = modal;

        Logger.log('✓ Prompt Diff: Highlights applied to Prompt Changes modal');
    },

    resetState(state) {
        state.processedModal = null;
        state.diffResult = null;
        state.originalBeforeText = null;
        state.originalAfterText = null;
        state.beforePre = null;
        state.afterPre = null;
        state.highlightEnabled = true;
    },

    // ========== MODAL & ELEMENT FINDING ==========

    findPromptChangesModal() {
        const dialogs = Context.dom.queryAll(this.selectors.modal, {
            context: `${this.id}.findModal`
        });

        for (const dialog of dialogs) {
            // Identify this specific modal by its "Prompt Changes" heading
            const heading = dialog.querySelector('h2');
            if (heading && heading.textContent.includes('Prompt Changes')) {
                return dialog;
            }
        }
        return null;
    },

    findPanelPre(modal, labelText) {
        // Strategy 1: Navigate from the column's label text ("Before" or "After")
        // Each panel is a .flex.flex-col.min-h-0 column containing a label and a scrollable div with a <pre>
        const columns = modal.querySelectorAll('.flex.flex-col.min-h-0');
        for (const col of columns) {
            const label = col.querySelector('.text-sm.font-medium.text-muted-foreground');
            if (label && label.textContent.includes(labelText)) {
                const pre = col.querySelector('pre');
                if (pre) return pre;
            }
        }

        // Strategy 2: Fall back to the tinted background container
        // Before = bg-red-*, After = bg-emerald-*
        const tintClass = labelText === 'Before' ? 'bg-red' : 'bg-emerald';
        const containers = modal.querySelectorAll(`[class*="${tintClass}"]`);
        for (const container of containers) {
            const pre = container.querySelector('pre');
            if (pre) return pre;
        }

        return null;
    },

    // ========== DIFF ENGINE (ported from LCS-based React implementation) ==========

    // Tokenize into words with trailing whitespace attached; newlines are isolated tokens
    tokenize(text) {
        const tokens = [];
        let current = '';

        for (const char of text) {
            if (char === '\n') {
                if (current) tokens.push(current);
                tokens.push('\n');
                current = '';
            } else if (char === ' ' || char === '\t') {
                current += char;
            } else {
                // New word starting — flush previous token (word + its trailing space)
                if (current && (current.endsWith(' ') || current.endsWith('\t'))) {
                    tokens.push(current);
                    current = '';
                }
                current += char;
            }
        }
        if (current) tokens.push(current);
        return tokens;
    },

    // Build the LCS dynamic-programming table
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

    // Backtrack through the DP table to produce an ordered list of diff operations
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

    computeDiff(oldText, newText) {
        const oldTokens = this.tokenize(oldText);
        const newTokens = this.tokenize(newText);
        const dp = this.computeLCS(oldTokens, newTokens);
        return this.backtrack(dp, oldTokens, newTokens);
    },

    // ========== RENDERING ==========

    escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    trimTrailingSpace(str) {
        return str.replace(/[ \t]+$/, '');
    },

    // Group consecutive tokens of the same type into runs.
    // Sets trimTrailing on a highlight group that is immediately followed by an equal group,
    // so trailing whitespace on the boundary stays outside the highlight visually.
    groupConsecutive(diff, includeTypes, highlightType) {
        const filtered = diff.filter(d => includeTypes.includes(d.type));
        const groups = [];

        for (let i = 0; i < filtered.length; i++) {
            const item = filtered[i];
            const nextItem = filtered[i + 1];
            const lastGroup = groups[groups.length - 1];

            // Extend the current group if same type and no newline boundary
            if (lastGroup && lastGroup.type === item.type && item.value !== '\n' && !lastGroup.values.includes('\n')) {
                lastGroup.values.push(item.value);
                if (nextItem && nextItem.type !== item.type && item.type === highlightType) {
                    lastGroup.trimTrailing = true;
                }
            } else {
                const group = { type: item.type, values: [item.value], trimTrailing: false };
                if (nextItem && nextItem.type !== item.type && item.type === highlightType) {
                    group.trimTrailing = true;
                }
                groups.push(group);
            }
        }

        return groups;
    },

    // Produce highlighted HTML for one side of the diff.
    // includeTypes filters which diff ops to render (e.g. ['equal','remove'] for the Before side).
    // highlightType is the op that gets the colored span ('remove' or 'add').
    renderSideHtml(diff, includeTypes, highlightType, highlightClass) {
        const groups = this.groupConsecutive(diff, includeTypes, highlightType);
        let html = '';

        for (const group of groups) {
            const text = group.values.join('');

            if (group.type === highlightType) {
                if (text === '\n') {
                    // Isolated changed newline — show a pilcrow marker so it's visible
                    html += `<span class="${highlightClass}">↵\n</span>`;
                } else if (group.trimTrailing) {
                    // Trim trailing whitespace out of the highlight so the boundary looks clean
                    const trimmed = this.trimTrailingSpace(text);
                    const trailing = text.slice(trimmed.length);
                    html += `<span class="${highlightClass}">${this.escapeHtml(trimmed)}</span>${this.escapeHtml(trailing)}`;
                } else {
                    html += `<span class="${highlightClass}">${this.escapeHtml(text)}</span>`;
                }
            } else {
                // Unchanged text — render plain
                html += this.escapeHtml(text);
            }
        }

        return html;
    },

    applyHighlights(state) {
        state.beforePre.innerHTML = this.renderSideHtml(state.diffResult, ['equal', 'remove'], 'remove', 'prompt-diff-removed');
        state.afterPre.innerHTML  = this.renderSideHtml(state.diffResult, ['equal', 'add'],    'add',    'prompt-diff-added');
    },

    restoreRawText(state) {
        state.beforePre.textContent = state.originalBeforeText;
        state.afterPre.textContent  = state.originalAfterText;
    },

    // ========== TOGGLE ==========

    insertToggle(state, modal) {
        // Anchor the toggle inside the header div (parent of the h2)
        const heading = modal.querySelector('h2');
        if (!heading) {
            Logger.debug('Prompt Diff: h2 not found — toggle not inserted');
            return;
        }
        const headerDiv = heading.parentElement;

        // Build toggle: [track] "Show diff"
        const row = document.createElement('div');
        row.className = 'prompt-diff-toggle-row';
        row.dataset.promptDiffToggle = 'true';

        const track = document.createElement('div');
        track.className = 'prompt-diff-toggle-track on'; // starts enabled

        const thumb = document.createElement('div');
        thumb.className = 'prompt-diff-toggle-thumb';
        track.appendChild(thumb);

        const label = document.createElement('span');
        label.className = 'prompt-diff-toggle-label';
        label.textContent = 'Show diff';

        row.appendChild(track);
        row.appendChild(label);

        const clickHandler = () => {
            state.highlightEnabled = !state.highlightEnabled;
            track.classList.toggle('on', state.highlightEnabled);

            if (state.highlightEnabled) {
                this.applyHighlights(state);
                Logger.debug('Prompt Diff: Highlights enabled');
            } else {
                this.restoreRawText(state);
                Logger.debug('Prompt Diff: Highlights disabled');
            }
        };

        row.addEventListener('click', clickHandler);
        CleanupRegistry.registerEventListener(row, 'click', clickHandler);

        headerDiv.appendChild(row);
        Logger.log('✓ Prompt Diff: Toggle inserted');
    }
};
