// ============= prompt-diff-highlight.js =============
// Highlights differences in the Prompt Changes modal using LCS diff algorithm

const plugin = {
    id: 'promptDiffHighlightV1',
    name: 'Prompt Diff Highlighting',
    description: 'Highlights word-level changes in the Prompt Changes modal',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    
    initialState: {
        modalObserved: false,
        highlightsApplied: false,
        toggleInserted: false,
        highlightsEnabled: true
    },
    
    selectors: {
        // Modal container - use the role and title to identify
        modal: 'div[role="dialog"]',
        modalTitle: 'h2',
        // Pre elements containing the text
        beforePre: 'pre.text-sm.whitespace-pre-wrap',
        // Grid container
        gridContainer: 'div.grid.grid-cols-2.gap-4'
    },
    
    init(state, context) {
        // Add styles for diff highlighting
        const style = document.createElement('style');
        style.textContent = `
            .diff-highlight-remove {
                background-color: rgba(239, 68, 68, 0.2);
                color: rgb(127, 29, 29);
            }
            .dark .diff-highlight-remove {
                background-color: rgba(239, 68, 68, 0.15);
                color: rgb(254, 202, 202);
            }
            .diff-highlight-add {
                background-color: rgba(16, 185, 129, 0.2);
                color: rgb(6, 78, 59);
            }
            .dark .diff-highlight-add {
                background-color: rgba(16, 185, 129, 0.15);
                color: rgb(167, 243, 208);
            }
            .diff-newline-marker {
                opacity: 0.6;
                font-weight: bold;
            }
            .diff-toggle-container {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                margin-right: 0.5rem;
            }
            .diff-toggle-label {
                font-size: 0.875rem;
                color: rgb(107, 114, 128);
                cursor: pointer;
                user-select: none;
                display: flex;
                align-items: center;
                gap: 0.375rem;
            }
            .dark .diff-toggle-label {
                color: rgb(156, 163, 175);
            }
            .diff-toggle-checkbox {
                width: 1rem;
                height: 1rem;
                border-radius: 0.25rem;
                cursor: pointer;
            }
        `;
        document.head.appendChild(style);
        Logger.log('✓ Prompt Diff Highlight styles injected');
    },
    
    onMutation(state, context) {
        // Find the modal
        const modal = this.findPromptChangesModal();
        
        if (!modal) {
            // Reset state when modal is not present
            if (state.modalObserved) {
                state.modalObserved = false;
                state.highlightsApplied = false;
                state.toggleInserted = false;
                Logger.debug('Prompt Changes modal closed, resetting state');
            }
            return;
        }
        
        // Modal is present
        if (!state.modalObserved) {
            state.modalObserved = true;
            Logger.log('✓ Prompt Changes modal detected');
        }
        
        // Insert toggle if not already inserted
        if (!state.toggleInserted) {
            const toggleInserted = this.insertToggle(state, modal);
            if (toggleInserted) {
                state.toggleInserted = true;
                Logger.log('✓ Diff highlight toggle inserted');
            }
        }
        
        // Apply highlights if not already applied and highlights are enabled
        if (!state.highlightsApplied && state.highlightsEnabled) {
            const applied = this.applyDiffHighlights(modal);
            if (applied) {
                state.highlightsApplied = true;
                Logger.log('✓ Diff highlights applied to modal');
            }
        }
    },
    
    findPromptChangesModal() {
        // Find all dialogs
        const modals = Context.dom.queryAll(this.selectors.modal, {
            context: `${this.id}.findModal`
        });
        
        // Find the one with "Prompt Changes" in the title
        for (const modal of modals) {
            const title = modal.querySelector(this.selectors.modalTitle);
            if (title && title.textContent.includes('Prompt Changes')) {
                return modal;
            }
        }
        
        return null;
    },
    
    insertToggle(state, modal) {
        // Find the top-right controls area (where the close button is)
        const controlsArea = modal.querySelector('.absolute.right-3\\.5.top-3\\.5');
        if (!controlsArea) {
            Logger.debug('Could not find controls area for toggle insertion');
            return false;
        }
        
        // Check if toggle already exists
        if (controlsArea.querySelector('.diff-toggle-container')) {
            return true;
        }
        
        // Create toggle container
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'diff-toggle-container';
        
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'diff-toggle-label';
        
        const toggleCheckbox = document.createElement('input');
        toggleCheckbox.type = 'checkbox';
        toggleCheckbox.className = 'diff-toggle-checkbox';
        toggleCheckbox.checked = state.highlightsEnabled;
        
        const toggleText = document.createElement('span');
        toggleText.textContent = 'Highlight Changes';
        
        toggleLabel.appendChild(toggleCheckbox);
        toggleLabel.appendChild(toggleText);
        toggleContainer.appendChild(toggleLabel);
        
        // Insert before close button
        controlsArea.insertBefore(toggleContainer, controlsArea.firstChild);
        
        // Add event listener
        toggleCheckbox.addEventListener('change', (e) => {
            state.highlightsEnabled = e.target.checked;
            state.highlightsApplied = false; // Force re-render
            Logger.debug(`Diff highlights ${state.highlightsEnabled ? 'enabled' : 'disabled'}`);
            
            // Re-apply or remove highlights
            if (state.highlightsEnabled) {
                this.applyDiffHighlights(modal);
                state.highlightsApplied = true;
            } else {
                this.removeHighlights(modal);
            }
        });
        
        CleanupRegistry.registerEventListener(toggleCheckbox, 'change', () => {});
        
        return true;
    },
    
    applyDiffHighlights(modal) {
        // Find the grid container
        const gridContainer = modal.querySelector(this.selectors.gridContainer);
        if (!gridContainer) {
            Logger.debug('Could not find grid container in modal');
            return false;
        }
        
        // Find both columns
        const columns = gridContainer.querySelectorAll('.flex.flex-col.min-h-0');
        if (columns.length !== 2) {
            Logger.debug('Could not find both columns in modal');
            return false;
        }
        
        // Extract text from both pre elements
        const beforePre = columns[0].querySelector(this.selectors.beforePre);
        const afterPre = columns[1].querySelector(this.selectors.beforePre);
        
        if (!beforePre || !afterPre) {
            Logger.debug('Could not find pre elements in columns');
            return false;
        }
        
        // Check if already highlighted
        if (beforePre.dataset.diffHighlighted === 'true') {
            return true;
        }
        
        const beforeText = beforePre.textContent;
        const afterText = afterPre.textContent;
        
        // Compute diff
        const diff = this.computeDiff(beforeText, afterText);
        
        // Store original text
        beforePre.dataset.originalText = beforeText;
        afterPre.dataset.originalText = afterText;
        
        // Render highlighted versions
        const beforeHtml = this.renderOriginal(diff);
        const afterHtml = this.renderNew(diff);
        
        beforePre.innerHTML = beforeHtml;
        afterPre.innerHTML = afterHtml;
        
        // Strip colored backgrounds from wrapper divs so highlights are visible
        this.stripWrapperBackgrounds(beforePre, afterPre);
        
        // Mark as highlighted
        beforePre.dataset.diffHighlighted = 'true';
        afterPre.dataset.diffHighlighted = 'true';
        
        return true;
    },
    
    removeHighlights(modal) {
        const gridContainer = modal.querySelector(this.selectors.gridContainer);
        if (!gridContainer) return;
        
        const columns = gridContainer.querySelectorAll('.flex.flex-col.min-h-0');
        if (columns.length !== 2) return;
        
        const beforePre = columns[0].querySelector(this.selectors.beforePre);
        const afterPre = columns[1].querySelector(this.selectors.beforePre);
        
        if (!beforePre || !afterPre) return;
        
        // Restore original text
        if (beforePre.dataset.originalText) {
            beforePre.textContent = beforePre.dataset.originalText;
        }
        if (afterPre.dataset.originalText) {
            afterPre.textContent = afterPre.dataset.originalText;
        }
        
        // Restore wrapper backgrounds
        this.restoreWrapperBackgrounds(beforePre, afterPre);
        
        // Remove markers
        delete beforePre.dataset.diffHighlighted;
        delete afterPre.dataset.diffHighlighted;
        
        Logger.debug('Diff highlights removed');
    },
    
    stripWrapperBackgrounds(beforePre, afterPre) {
        const beforeWrapper = beforePre.parentElement;
        const afterWrapper = afterPre.parentElement;
        
        // Store original className for restoration, then strip the colored backgrounds
        if (beforeWrapper && !beforeWrapper.dataset.originalClassName) {
            beforeWrapper.dataset.originalClassName = beforeWrapper.className;
            beforeWrapper.classList.remove('bg-red-50/50', 'dark:bg-red-950/20');
        }
        
        if (afterWrapper && !afterWrapper.dataset.originalClassName) {
            afterWrapper.dataset.originalClassName = afterWrapper.className;
            afterWrapper.classList.remove('bg-emerald-50/50', 'dark:bg-emerald-950/20');
        }
    },
    
    restoreWrapperBackgrounds(beforePre, afterPre) {
        const beforeWrapper = beforePre.parentElement;
        const afterWrapper = afterPre.parentElement;
        
        // Restore full className from saved snapshot
        if (beforeWrapper && beforeWrapper.dataset.originalClassName) {
            beforeWrapper.className = beforeWrapper.dataset.originalClassName;
            delete beforeWrapper.dataset.originalClassName;
        }
        
        if (afterWrapper && afterWrapper.dataset.originalClassName) {
            afterWrapper.className = afterWrapper.dataset.originalClassName;
            delete afterWrapper.dataset.originalClassName;
        }
    },
    
    // ========== DIFF ALGORITHM ==========
    
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
    
    computeDiff(oldText, newText) {
        const oldTokens = this.tokenize(oldText);
        const newTokens = this.tokenize(newText);
        const dp = this.computeLCS(oldTokens, newTokens);
        return this.backtrack(dp, oldTokens, newTokens);
    },
    
    groupConsecutive(diff, includeTypes, highlightType) {
        const filtered = diff.filter(d => includeTypes.includes(d.type));
        const groups = [];
        
        for (let i = 0; i < filtered.length; i++) {
            const item = filtered[i];
            const nextItem = filtered[i + 1];
            const lastGroup = groups[groups.length - 1];
            
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
    
    trimTrailingSpace(str) {
        return str.replace(/[ \t]+$/, '');
    },
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    renderOriginal(diff) {
        const groups = this.groupConsecutive(diff, ['equal', 'remove'], 'remove');
        let html = '';
        
        groups.forEach(group => {
            let text = group.values.join('');
            if (group.type === 'remove') {
                if (text === '\n') {
                    html += `<span class="diff-highlight-remove diff-newline-marker">↵</span>\n`;
                } else {
                    if (group.trimTrailing) {
                        const trimmed = this.trimTrailingSpace(text);
                        const trailing = text.slice(trimmed.length);
                        html += `<span class="diff-highlight-remove">${this.escapeHtml(trimmed)}</span>${this.escapeHtml(trailing)}`;
                    } else {
                        html += `<span class="diff-highlight-remove">${this.escapeHtml(text)}</span>`;
                    }
                }
            } else {
                html += this.escapeHtml(text);
            }
        });
        
        return html;
    },
    
    renderNew(diff) {
        const groups = this.groupConsecutive(diff, ['equal', 'add'], 'add');
        let html = '';
        
        groups.forEach(group => {
            let text = group.values.join('');
            if (group.type === 'add') {
                if (text === '\n') {
                    html += `<span class="diff-highlight-add diff-newline-marker">↵</span>\n`;
                } else {
                    if (group.trimTrailing) {
                        const trimmed = this.trimTrailingSpace(text);
                        const trailing = text.slice(trimmed.length);
                        html += `<span class="diff-highlight-add">${this.escapeHtml(trimmed)}</span>${this.escapeHtml(trailing)}`;
                    } else {
                        html += `<span class="diff-highlight-add">${this.escapeHtml(text)}</span>`;
                    }
                }
            } else {
                html += this.escapeHtml(text);
            }
        });
        
        return html;
    }
};