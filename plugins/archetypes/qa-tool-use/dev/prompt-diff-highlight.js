// ============= prompt-diff-highlight.js =============
// Highlights differences in the Prompt Changes modal using LCS diff algorithm

const plugin = {
    id: 'promptDiffHighlightV1',
    name: 'Prompt Diff Highlighting',
    description: 'Highlights word-level changes in the Prompt Changes modal',
    _version: '1.6',
    enabledByDefault: true,
    phase: 'mutation',
    
    initialState: {
        modalObserved: false,
        highlightsApplied: false,
        toggleInserted: false,
        copyButtonsInserted: false,
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
            pre .diff-highlight-remove {
                background-color: rgba(239, 68, 68, 0.2) !important;
                color: rgb(127, 29, 29) !important;
                padding: 0 0.125rem;
                border-radius: 3px;
                box-decoration-break: clone;
                -webkit-box-decoration-break: clone;
            }
            .dark pre .diff-highlight-remove {
                background-color: rgba(239, 68, 68, 0.15) !important;
                color: rgb(254, 202, 202) !important;
            }
            pre .diff-highlight-add {
                background-color: rgba(16, 185, 129, 0.2) !important;
                color: rgb(6, 78, 59) !important;
                padding: 0 0.125rem;
                border-radius: 3px;
                box-decoration-break: clone;
                -webkit-box-decoration-break: clone;
            }
            .dark pre .diff-highlight-add {
                background-color: rgba(16, 185, 129, 0.15) !important;
                color: rgb(167, 243, 208) !important;
            }
            pre .diff-newline-marker {
                opacity: 0.6;
                font-weight: bold;
            }
            .diff-toggle-row {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                margin: 0.4rem 0 0.9rem;
                width: 100%;
            }
            .diff-copy-button {
                padding: 4px 10px;
                font-size: 12px;
                font-weight: 500;
                color: var(--foreground, #333);
                background: var(--card, #fafafa);
                border: 1px solid var(--border, #e5e5e5);
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .diff-copy-button:hover {
                background: var(--hover, #f0f0f0);
                border-color: var(--border-hover, #d1d5db);
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
                state.copyButtonsInserted = false;
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
        
        if (!state.copyButtonsInserted) {
            const copyInserted = this.insertCopyButtons(modal);
            if (copyInserted) {
                state.copyButtonsInserted = true;
                Logger.log('✓ Diff copy buttons inserted');
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
        const title = modal.querySelector(this.selectors.modalTitle);
        if (!title) {
            Logger.debug('Could not find modal title for toggle insertion');
            return false;
        }
        
        // Check if toggle already exists
        if (modal.querySelector('.diff-toggle-row')) {
            return true;
        }
        
        // Create toggle container centered under header
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'diff-toggle-row';
        toggleContainer.style.gap = '10px';
        
        const toggleId = `${this.id}-toggle`;
        const toggleText = document.createElement('label');
        toggleText.htmlFor = toggleId;
        toggleText.textContent = 'Highlight Differences';
        toggleText.style.fontSize = '16px';
        toggleText.style.fontWeight = '500';
        toggleText.style.color = 'var(--foreground, #333)';
        toggleText.style.cursor = 'pointer';
        toggleText.style.userSelect = 'none';
        toggleText.style.padding = '4px 8px';
        toggleText.style.lineHeight = '1.2';
        
        const toggleSwitch = document.createElement('label');
        toggleSwitch.style.position = 'relative';
        toggleSwitch.style.display = 'inline-block';
        toggleSwitch.style.width = '44px';
        toggleSwitch.style.height = '24px';
        toggleSwitch.style.flexShrink = '0';
        toggleSwitch.style.alignSelf = 'center';
        
        const toggleCheckbox = document.createElement('input');
        toggleCheckbox.type = 'checkbox';
        toggleCheckbox.id = toggleId;
        toggleCheckbox.checked = state.highlightsEnabled;
        toggleCheckbox.style.opacity = '0';
        toggleCheckbox.style.width = '0';
        toggleCheckbox.style.height = '0';
        toggleCheckbox.style.position = 'absolute';
        
        const toggleSlider = document.createElement('span');
        toggleSlider.style.position = 'absolute';
        toggleSlider.style.cursor = 'pointer';
        toggleSlider.style.top = '0';
        toggleSlider.style.left = '0';
        toggleSlider.style.right = '0';
        toggleSlider.style.bottom = '0';
        toggleSlider.style.backgroundColor = '#ccc';
        toggleSlider.style.transition = '0.2s';
        toggleSlider.style.borderRadius = '24px';
        
        const toggleKnob = document.createElement('span');
        toggleKnob.style.position = 'absolute';
        toggleKnob.style.height = '18px';
        toggleKnob.style.width = '18px';
        toggleKnob.style.left = '3px';
        toggleKnob.style.bottom = '3px';
        toggleKnob.style.backgroundColor = 'white';
        toggleKnob.style.transition = '0.2s';
        toggleKnob.style.borderRadius = '50%';
        toggleKnob.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.2)';
        
        toggleSlider.appendChild(toggleKnob);
        toggleSwitch.appendChild(toggleCheckbox);
        toggleSwitch.appendChild(toggleSlider);
        
        toggleContainer.appendChild(toggleText);
        toggleContainer.appendChild(toggleSwitch);
        
        // Insert after header/title block
        title.parentElement.insertAdjacentElement('afterend', toggleContainer);
        
        // Add event listener
        const updateToggleStyles = () => {
            const isOn = toggleCheckbox.checked;
            toggleSlider.style.backgroundColor = isOn ? 'var(--brand, #4f46e5)' : '#ccc';
            toggleKnob.style.left = isOn ? '23px' : '3px';
        };
        
        updateToggleStyles();
        
        toggleCheckbox.addEventListener('change', () => {
            updateToggleStyles();
            state.highlightsEnabled = toggleCheckbox.checked;
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
    
    insertCopyButtons(modal) {
        const gridContainer = modal.querySelector(this.selectors.gridContainer);
        if (!gridContainer) {
            Logger.debug('Could not find grid container for copy buttons');
            return false;
        }
        
        const columns = gridContainer.querySelectorAll('.flex.flex-col.min-h-0');
        if (columns.length !== 2) {
            Logger.debug('Could not find both columns for copy buttons');
            return false;
        }
        
        const addButton = (column, label) => {
            const headerRow = column.querySelector('.text-sm.font-medium.text-muted-foreground.mb-2.flex.items-center');
            if (!headerRow) {
                Logger.debug(`Missing header row for ${label} copy button`);
                return false;
            }
            if (headerRow.querySelector('.diff-copy-button')) return true;
            
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'diff-copy-button';
            button.textContent = 'Copy';
            button.dataset.diffCopyTarget = label;
            
            button.addEventListener('click', async () => {
                const pre = column.querySelector(this.selectors.beforePre);
                if (!pre) {
                    Logger.warn(`Missing ${label} pre element for copy`);
                    return;
                }
                const fallbackText = pre.textContent || '';
                const sourceText = pre.dataset.originalText || fallbackText;
                if (!sourceText) {
                    Logger.warn(`No ${label} text found to copy`);
                    return;
                }
                try {
                    await navigator.clipboard.writeText(sourceText);
                    Logger.info(`Copied ${label} prompt to clipboard`);
                } catch (err) {
                    Logger.error(`Failed to copy ${label} prompt`, err);
                }
            });
            
            headerRow.appendChild(button);
            return true;
        };
        
        const beforeOk = addButton(columns[0], 'before');
        const afterOk = addButton(columns[1], 'after');
        return beforeOk && afterOk;
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
        
        const beforeText = beforePre.textContent;
        const afterText = afterPre.textContent;
        const hasHighlights = Boolean(
            beforePre.querySelector('.diff-highlight-remove, .diff-highlight-add') ||
            afterPre.querySelector('.diff-highlight-remove, .diff-highlight-add')
        );
        const alreadyHighlighted = beforePre.dataset.diffHighlighted === 'true' && afterPre.dataset.diffHighlighted === 'true';
        const originalBefore = beforePre.dataset.originalText;
        const originalAfter = afterPre.dataset.originalText;
        
        if (alreadyHighlighted && hasHighlights && originalBefore === beforeText && originalAfter === afterText) {
            return true;
        }
        
        if (alreadyHighlighted) {
            Logger.debug('Prompt diff content changed or highlights cleared; reapplying');
            beforePre.textContent = beforeText;
            afterPre.textContent = afterText;
            delete beforePre.dataset.diffHighlighted;
            delete afterPre.dataset.diffHighlighted;
        }
        
        // Compute diff
        const diff = this.computeDiff(beforeText, afterText);
        
        // Store original text
        beforePre.dataset.originalText = beforeText;
        afterPre.dataset.originalText = afterText;
        
        const isDark = document.documentElement.classList.contains('dark');
        const highlightStyles = this.getHighlightStyles(isDark);
        
        // Render highlighted versions
        const beforeHtml = this.renderOriginal(diff, highlightStyles.remove);
        const afterHtml = this.renderNew(diff, highlightStyles.add);
        
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
            beforeWrapper.dataset.originalInlineBg = beforeWrapper.style.backgroundColor || '';
            beforeWrapper.classList.remove('bg-red-50/50', 'dark:bg-red-950/20');
            beforeWrapper.style.backgroundColor = '#000';
        }
        
        if (afterWrapper && !afterWrapper.dataset.originalClassName) {
            afterWrapper.dataset.originalClassName = afterWrapper.className;
            afterWrapper.dataset.originalInlineBg = afterWrapper.style.backgroundColor || '';
            afterWrapper.classList.remove('bg-emerald-50/50', 'dark:bg-emerald-950/20');
            afterWrapper.style.backgroundColor = '#000';
        }
    },
    
    restoreWrapperBackgrounds(beforePre, afterPre) {
        const beforeWrapper = beforePre.parentElement;
        const afterWrapper = afterPre.parentElement;
        
        // Restore full className from saved snapshot
        if (beforeWrapper && beforeWrapper.dataset.originalClassName) {
            beforeWrapper.className = beforeWrapper.dataset.originalClassName;
            beforeWrapper.style.backgroundColor = beforeWrapper.dataset.originalInlineBg || '';
            delete beforeWrapper.dataset.originalClassName;
            delete beforeWrapper.dataset.originalInlineBg;
        }
        
        if (afterWrapper && afterWrapper.dataset.originalClassName) {
            afterWrapper.className = afterWrapper.dataset.originalClassName;
            afterWrapper.style.backgroundColor = afterWrapper.dataset.originalInlineBg || '';
            delete afterWrapper.dataset.originalClassName;
            delete afterWrapper.dataset.originalInlineBg;
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
    
    getHighlightStyles(isDark) {
        const removeBg = isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.2)';
        const removeColor = isDark ? 'rgb(254, 202, 202)' : 'rgb(127, 29, 29)';
        const addBg = isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.2)';
        const addColor = isDark ? 'rgb(167, 243, 208)' : 'rgb(6, 78, 59)';
        const base = 'padding:0 0.125rem;border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;';
        return {
            remove: `${base}background-color:${removeBg};color:${removeColor};`,
            add: `${base}background-color:${addBg};color:${addColor};`
        };
    },
    
    renderOriginal(diff, removeStyle) {
        const groups = this.groupConsecutive(diff, ['equal', 'remove'], 'remove');
        let html = '';
        
        groups.forEach(group => {
            let text = group.values.join('');
            if (group.type === 'remove') {
                if (text === '\n') {
                    html += `<span class="diff-newline-marker" style="${removeStyle}">↵</span>\n`;
                } else {
                    if (group.trimTrailing) {
                        const trimmed = this.trimTrailingSpace(text);
                        const trailing = text.slice(trimmed.length);
                        html += `<span style="${removeStyle}">${this.escapeHtml(trimmed)}</span>${this.escapeHtml(trailing)}`;
                    } else {
                        html += `<span style="${removeStyle}">${this.escapeHtml(text)}</span>`;
                    }
                }
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
            let text = group.values.join('');
            if (group.type === 'add') {
                if (text === '\n') {
                    html += `<span class="diff-newline-marker" style="${addStyle}">↵</span>\n`;
                } else {
                    if (group.trimTrailing) {
                        const trimmed = this.trimTrailingSpace(text);
                        const trailing = text.slice(trimmed.length);
                        html += `<span style="${addStyle}">${this.escapeHtml(trimmed)}</span>${this.escapeHtml(trailing)}`;
                    } else {
                        html += `<span style="${addStyle}">${this.escapeHtml(text)}</span>`;
                    }
                }
            } else {
                html += this.escapeHtml(text);
            }
        });
        
        return html;
    }
};