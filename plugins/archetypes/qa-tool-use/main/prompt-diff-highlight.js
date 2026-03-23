// ============= prompt-diff-highlight.js =============
// Highlights differences in the Prompt Changes modal using LCS diff algorithm

const plugin = {
    id: 'promptDiffHighlightV1',
    name: 'Prompt Diff Highlighting',
    description: 'Highlights word-level and character-level changes in the Prompt Changes modal',
    _version: '2.4',
    enabledByDefault: true,
    phase: 'mutation',
    
    initialState: {
        modalObserved: false,
        highlightsApplied: false,
        toggleInserted: false,
        copyButtonsInserted: false,
        highlightsEnabled: true,
        diffGranularity: 'word'
    },

    storageKeys: {
        granularity: 'prompt-diff-granularity'
    },
    
    selectors: {
        modal: 'div[role="dialog"]',
        modalTitle: 'h2',
        beforePre: 'pre.text-sm.whitespace-pre-wrap',
        gridContainer: 'div.grid.grid-cols-2.gap-4'
    },
    
    init(state, context) {
        state.diffGranularity = Storage.get(this.storageKeys.granularity, 'word');

        const style = document.createElement('style');
        style.textContent = `
            pre .diff-highlight-remove {
                background-color: rgba(239, 68, 68, 0.35) !important;
                color: rgb(127, 29, 29) !important;
                border-radius: 3px;
                box-decoration-break: clone;
                -webkit-box-decoration-break: clone;
            }
            .dark pre .diff-highlight-remove {
                background-color: rgba(239, 68, 68, 0.35) !important;
                color: rgb(254, 202, 202) !important;
            }
            pre .diff-highlight-add {
                background-color: rgba(16, 185, 129, 0.35) !important;
                color: rgb(6, 78, 59) !important;
                border-radius: 3px;
                box-decoration-break: clone;
                -webkit-box-decoration-break: clone;
            }
            .dark pre .diff-highlight-add {
                background-color: rgba(16, 185, 129, 0.35) !important;
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
                flex-wrap: nowrap;
                gap: 12px;
                margin: 0.4rem 0 0.9rem;
                width: 100%;
            }
            .diff-granularity-group {
                display: inline-flex;
                align-items: center;
                border-radius: 6px;
                overflow: hidden;
                border: 1px solid var(--border, #e2e2e2);
                background: var(--muted, rgba(0,0,0,0.04));
            }
            .dark .diff-granularity-group {
                border-color: var(--border, #333);
                background: var(--muted, rgba(255,255,255,0.06));
            }
            .diff-granularity-btn {
                padding: 6px 12px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                border: none;
                border-right: 1px solid var(--border, #e2e2e2);
                background: transparent;
                color: var(--muted-foreground, #888);
                transition: background-color 0.15s, color 0.15s;
                line-height: 1.4;
            }
            .diff-granularity-btn:last-child {
                border-right: none;
            }
            .dark .diff-granularity-btn {
                border-right-color: var(--border, #333);
            }
            .dark .diff-granularity-btn:last-child {
                border-right: none;
            }
            .diff-granularity-btn[aria-pressed="true"] {
                background-color: var(--primary, #4f46e5);
                color: var(--primary-foreground, #fff);
            }
            .diff-granularity-btn:not([aria-pressed="true"]):hover {
                background-color: var(--accent, rgba(0,0,0,0.06));
                color: var(--accent-foreground, inherit);
            }
            .dark .diff-granularity-btn:not([aria-pressed="true"]):hover {
                background-color: var(--accent, rgba(255,255,255,0.08));
            }
        `;
        document.head.appendChild(style);
        Logger.log('✓ Prompt Diff Highlight styles injected');
    },
    
    onMutation(state, context) {
        const modal = this.findPromptChangesModal();
        
        if (!modal) {
            if (state.modalObserved) {
                state.modalObserved = false;
                state.highlightsApplied = false;
                state.toggleInserted = false;
                state.copyButtonsInserted = false;
                Logger.debug('Prompt Changes modal closed, resetting state');
            }
            return;
        }
        
        if (!state.modalObserved) {
            state.modalObserved = true;
            Logger.log('✓ Prompt Changes modal detected');
        }
        
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
        
        if (!state.highlightsApplied && state.highlightsEnabled) {
            const applied = this.applyDiffHighlights(modal, state);
            if (applied) {
                state.highlightsApplied = true;
                Logger.log('✓ Diff highlights applied to modal');
            }
        }
    },
    
    findPromptChangesModal() {
        const modals = Context.dom.queryAll(this.selectors.modal, {
            context: `${this.id}.findModal`
        });
        
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
        
        if (modal.querySelector('.diff-toggle-row')) {
            return true;
        }
        
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'diff-toggle-row';
        toggleContainer.style.display = 'flex';
        toggleContainer.style.alignItems = 'center';
        toggleContainer.style.justifyContent = 'center';
        toggleContainer.style.flexWrap = 'nowrap';
        toggleContainer.style.gap = '12px';
        toggleContainer.style.margin = '0.4rem 0 0.9rem';
        toggleContainer.style.width = '100%';

        const leftBlock = document.createElement('div');
        leftBlock.style.display = 'flex';
        leftBlock.style.alignItems = 'center';
        leftBlock.style.gap = '10px';
        
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
        
        leftBlock.appendChild(toggleText);
        leftBlock.appendChild(toggleSwitch);
        toggleContainer.appendChild(leftBlock);

        const granularityGroup = document.createElement('div');
        granularityGroup.style.display = 'inline-flex';
        granularityGroup.style.alignItems = 'center';
        granularityGroup.style.borderRadius = '6px';
        granularityGroup.style.overflow = 'hidden';
        granularityGroup.style.border = '1px solid var(--border, #e2e2e2)';
        granularityGroup.style.background = 'var(--muted, rgba(0,0,0,0.04))';
        granularityGroup.style.marginLeft = 'auto';
        granularityGroup.style.flexShrink = '0';

        const applyBtnBaseStyles = (btn) => {
            btn.style.padding = '6px 14px';
            btn.style.fontSize = '12px';
            btn.style.fontWeight = '500';
            btn.style.cursor = 'pointer';
            btn.style.border = 'none';
            btn.style.background = 'transparent';
            btn.style.color = 'var(--muted-foreground, #888)';
            btn.style.lineHeight = '1.4';
            btn.style.transition = 'background-color 0.15s, color 0.15s';
        };

        const applyBtnActiveStyles = (btn, isActive) => {
            if (isActive) {
                btn.style.backgroundColor = 'var(--primary, #4f46e5)';
                btn.style.color = 'var(--primary-foreground, #fff)';
            } else {
                btn.style.backgroundColor = 'transparent';
                btn.style.color = 'var(--muted-foreground, #888)';
            }
        };

        const wordBtn = document.createElement('button');
        wordBtn.type = 'button';
        wordBtn.textContent = 'Word';
        wordBtn.setAttribute('aria-pressed', state.diffGranularity === 'word' ? 'true' : 'false');
        applyBtnBaseStyles(wordBtn);
        wordBtn.style.borderRight = '1px solid var(--border, #e2e2e2)';
        applyBtnActiveStyles(wordBtn, state.diffGranularity === 'word');

        const charBtn = document.createElement('button');
        charBtn.type = 'button';
        charBtn.textContent = 'Character';
        charBtn.setAttribute('aria-pressed', state.diffGranularity === 'char' ? 'true' : 'false');
        applyBtnBaseStyles(charBtn);
        applyBtnActiveStyles(charBtn, state.diffGranularity === 'char');

        granularityGroup.appendChild(wordBtn);
        granularityGroup.appendChild(charBtn);
        toggleContainer.appendChild(granularityGroup);
        
        title.parentElement.insertAdjacentElement('afterend', toggleContainer);
        
        const updateToggleStyles = () => {
            const isOn = toggleCheckbox.checked;
            toggleSlider.style.backgroundColor = isOn ? 'var(--brand, #4f46e5)' : '#ccc';
            toggleKnob.style.left = isOn ? '23px' : '3px';
        };
        
        updateToggleStyles();
        
        toggleCheckbox.addEventListener('change', () => {
            updateToggleStyles();
            state.highlightsEnabled = toggleCheckbox.checked;
            state.highlightsApplied = false;
            Logger.debug(`Diff highlights ${state.highlightsEnabled ? 'enabled' : 'disabled'}`);
            
            if (state.highlightsEnabled) {
                this.applyDiffHighlights(modal, state);
                state.highlightsApplied = true;
            } else {
                this.removeHighlights(modal);
            }
        });

        const setGranularity = (granularity) => {
            if (state.diffGranularity === granularity) return;
            state.diffGranularity = granularity;
            Storage.set(this.storageKeys.granularity, granularity);
            wordBtn.setAttribute('aria-pressed', granularity === 'word' ? 'true' : 'false');
            charBtn.setAttribute('aria-pressed', granularity === 'char' ? 'true' : 'false');
            applyBtnActiveStyles(wordBtn, granularity === 'word');
            applyBtnActiveStyles(charBtn, granularity === 'char');
            Logger.debug(`Diff granularity set to ${granularity}`);

            state.highlightsApplied = false;
            if (state.highlightsEnabled) {
                this.removeHighlights(modal);
                this.applyDiffHighlights(modal, state);
                state.highlightsApplied = true;
            }
        };

        wordBtn.addEventListener('click', () => setGranularity('word'));
        charBtn.addEventListener('click', () => setGranularity('char'));
        
        CleanupRegistry.registerEventListener(toggleCheckbox, 'change', () => {});
        CleanupRegistry.registerEventListener(wordBtn, 'click', () => {});
        CleanupRegistry.registerEventListener(charBtn, 'click', () => {});
        
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
        
        const createCopyIconButton = () => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'diff-copy-button inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
            button.setAttribute('data-state', 'closed');
            button.title = 'Copy prompt to clipboard';
            button.setAttribute('aria-label', 'Copy prompt to clipboard');

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '12');
            svg.setAttribute('height', '12');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svg.className = 'fill-current h-3 w-3 text-muted-foreground';
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('fill', 'currentColor');
            path.setAttribute('fill-rule', 'evenodd');
            path.setAttribute('clip-rule', 'evenodd');
            path.setAttribute('d', 'M2 5C2 3.34315 3.34315 2 5 2H12C13.6569 2 15 3.34315 15 5C15 5.55228 14.5523 6 14 6C13.4477 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4H5C4.44772 4 4 4.44772 4 5V13C4 13.5523 4.44772 14 5 14H6C6.55228 14 7 14.4477 7 15C7 15.5523 6.55228 16 6 16H5C3.34315 16 2 14.6569 2 13V5ZM9 10.8462C9 9.20041 10.42 8 12 8H19C20.58 8 22 9.20041 22 10.8462V19.1538C22 20.7996 20.58 22 19 22H12C10.42 22 9 20.7996 9 19.1538V10.8462ZM12 10C11.3708 10 11 10.4527 11 10.8462V19.1538C11 19.5473 11.3708 20 12 20H19C19.6292 20 20 19.5473 20 19.1538V10.8462C20 10.4527 19.6292 10 19 10H12Z');
            svg.appendChild(path);
            button.appendChild(svg);

            return button;
        };

        const addButton = (column, label) => {
            const headerRow = column.querySelector('.text-sm.font-medium.text-muted-foreground.mb-2.flex.items-center');
            if (!headerRow) {
                Logger.debug(`Missing header row for ${label} copy button`);
                return false;
            }
            if (headerRow.querySelector('.diff-copy-button')) return true;
            
            const button = createCopyIconButton();
            button.dataset.diffCopyTarget = label;

            let copyFeedbackTimeoutId = null;
            const pulseCopyFailure = () => {
                if (copyFeedbackTimeoutId) clearTimeout(copyFeedbackTimeoutId);
                const prevT = button.style.transition;
                button.style.transition = 'none';
                button.style.backgroundColor = 'rgb(239, 68, 68)';
                button.style.color = 'white';
                void button.offsetHeight;
                button.style.transition = 'background-color 500ms ease-out, color 500ms ease-out';
                button.style.backgroundColor = '';
                button.style.color = '';
                copyFeedbackTimeoutId = setTimeout(() => {
                    button.style.transition = prevT || '';
                    copyFeedbackTimeoutId = null;
                }, 500);
            };
            button.addEventListener('click', async () => {
                const pre = column.querySelector(this.selectors.beforePre);
                if (!pre) {
                    Logger.warn(`Missing ${label} pre element for copy`);
                    pulseCopyFailure();
                    return;
                }
                const fallbackText = pre.textContent || '';
                const sourceText = pre.dataset.originalText || fallbackText;
                if (!sourceText) {
                    Logger.warn(`No ${label} text found to copy`);
                    pulseCopyFailure();
                    return;
                }
                try {
                    await navigator.clipboard.writeText(sourceText);
                    Logger.info(`Copied ${label} prompt to clipboard (${sourceText.length} chars)`);
                    if (copyFeedbackTimeoutId) clearTimeout(copyFeedbackTimeoutId);
                    button.style.transition = '';
                    button.style.backgroundColor = 'rgb(34, 197, 94)';
                    button.style.color = 'white';
                    copyFeedbackTimeoutId = setTimeout(() => {
                        button.style.backgroundColor = '';
                        button.style.color = '';
                        copyFeedbackTimeoutId = null;
                    }, 1000);
                } catch (err) {
                    Logger.error(`Failed to copy ${label} prompt`, err);
                    pulseCopyFailure();
                }
            });

            headerRow.appendChild(button);
            return true;
        };
        
        const beforeOk = addButton(columns[0], 'before');
        const afterOk = addButton(columns[1], 'after');
        return beforeOk && afterOk;
    },
    
    applyDiffHighlights(modal, state) {
        const gridContainer = modal.querySelector(this.selectors.gridContainer);
        if (!gridContainer) {
            Logger.debug('Could not find grid container in modal');
            return false;
        }
        
        const columns = gridContainer.querySelectorAll('.flex.flex-col.min-h-0');
        if (columns.length !== 2) {
            Logger.debug('Could not find both columns in modal');
            return false;
        }
        
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
        
        const granularity = (state && state.diffGranularity) || 'word';
        const diff = granularity === 'char'
            ? this.computeCharDiff(beforeText, afterText)
            : this.computeDiff(beforeText, afterText);
        
        beforePre.dataset.originalText = beforeText;
        afterPre.dataset.originalText = afterText;
        
        const isDark = document.documentElement.classList.contains('dark');
        const highlightStyles = this.getHighlightStyles(isDark);
        
        const beforeHtml = this.renderOriginal(diff, highlightStyles.remove);
        const afterHtml = this.renderNew(diff, highlightStyles.add);
        
        beforePre.innerHTML = beforeHtml;
        afterPre.innerHTML = afterHtml;
        
        this.stripWrapperBackgrounds(beforePre, afterPre);
        
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
        
        if (beforePre.dataset.originalText) {
            beforePre.textContent = beforePre.dataset.originalText;
        }
        if (afterPre.dataset.originalText) {
            afterPre.textContent = afterPre.dataset.originalText;
        }
        
        this.restoreWrapperBackgrounds(beforePre, afterPre);
        
        delete beforePre.dataset.diffHighlighted;
        delete afterPre.dataset.diffHighlighted;
        
        Logger.debug('Diff highlights removed');
    },
    
    stripWrapperBackgrounds(beforePre, afterPre) {
        const beforeWrapper = beforePre.parentElement;
        const afterWrapper = afterPre.parentElement;
        
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

    computeCharDiff(oldText, newText) {
        const a = oldText.split('');
        const b = newText.split('');
        const dp = this.computeLCS(a, b);
        return this.backtrack(dp, a, b);
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
        const removeBg = isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.3)';
        const addBg = isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.3)';
        return {
            remove: `background-color:${removeBg};border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;`,
            add: `background-color:${addBg};border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;`
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
                html += `<span class="text-muted-foreground">${this.escapeHtml(text)}</span>`;
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
                html += `<span class="text-muted-foreground">${this.escapeHtml(text)}</span>`;
            }
        });
        
        return html;
    }
};