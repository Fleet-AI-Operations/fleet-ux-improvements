// ============= verifier-diff-highlight-improved.js =============
// Custom two-column diff viewer for verifier "Per-Field Comparison"
// Replaces the page's built-in diff with an improved side-by-side layout

const plugin = {
    id: 'verifierDiffHighlightImproved',
    name: 'Verifier Diff Highlight (Improved)',
    description: 'Custom side-by-side diff viewer for Expected vs Your Answer in verifier output',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',

    STORAGE_KEY_MODE: 'fleet-verifier-diff-improved-mode',
    STORAGE_KEY_HIGHLIGHT: 'fleet-verifier-diff-improved-highlight',
    DATA_ATTR: 'data-fleet-verifier-diff-improved',
    DATA_HIDDEN_ATTR: 'data-fleet-verifier-diff-original-hidden',
    CHEVRON_PATH: 'M16.7071 10.2929C16.3166 9.90237 15.6834 9.90237 15.2929 10.2929L12 13.5858L8.70711 10.2929C8.31658 9.90237 7.68342 9.90237 7.29289 10.2929C6.90237 10.6834 6.90237 11.3166 7.29289 11.7071L11.2929 15.7071C11.6834 16.0976 12.3166 16.0976 12.7071 15.7071L16.7071 11.7071C17.0976 11.3166 17.0976 10.6834 16.7071 10.2929Z',

    initialState: {
        bootstrapped: false,
        stylesInjected: false,
        verifierObserved: false,
        originalCard: null,
        scrollParent: null,
        ourCard: null,
        fieldListContainer: null,
        headerLabel: null,
        _trayBody: null,
        trayEntries: [],
        fieldObservers: [],
        highlightEnabled: true,
        diffMode: 'char',
        lastRowSignature: ''
    },

    onMutation(state) {
        if (!document.body || !document.head) return;

        if (!state.bootstrapped) {
            state.bootstrapped = true;
            this.ensureStyles(state);
            state.diffMode = this.loadDiffMode();
            state.highlightEnabled = this.loadHighlightPref();
            Logger.log('✓ Verifier Diff Highlight Improved bootstrap complete');
        }

        this.refresh(state);
    },

    destroy(state) {
        this.cleanup(state);
    },

    // ========== STYLES ==========

    ensureStyles(state) {
        if (state.stylesInjected) return;
        const style = document.createElement('style');
        style.textContent = `
            [${this.DATA_HIDDEN_ATTR}] {
                max-height: 0 !important;
                overflow: hidden !important;
                padding: 0 !important;
                margin: 0 !important;
                border-width: 0 !important;
                opacity: 0 !important;
            }
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
            [${this.DATA_ATTR}] .vdhi-two-col {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 0.75rem;
            }
            [${this.DATA_ATTR}] .vdhi-col-content {
                white-space: pre-wrap;
                word-break: break-word;
                font-size: 0.75rem;
                line-height: 1.5;
            }
            [${this.DATA_ATTR}] .vdhi-toggle-track {
                position: relative;
                display: inline-block;
                width: 32px;
                height: 18px;
                cursor: pointer;
                flex-shrink: 0;
                vertical-align: middle;
            }
            [${this.DATA_ATTR}] .vdhi-toggle-track input {
                opacity: 0;
                width: 0;
                height: 0;
                position: absolute;
            }
            [${this.DATA_ATTR}] .vdhi-toggle-slider {
                position: absolute;
                cursor: pointer;
                inset: 0;
                background-color: hsl(var(--muted));
                transition: background-color 0.2s;
                border-radius: 18px;
            }
            [${this.DATA_ATTR}] .vdhi-toggle-slider::before {
                content: '';
                position: absolute;
                height: 12px;
                width: 12px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: transform 0.2s;
                border-radius: 50%;
                box-shadow: 0 1px 2px rgba(0,0,0,0.2);
            }
            [${this.DATA_ATTR}] .vdhi-toggle-track input:checked + .vdhi-toggle-slider {
                background-color: #3b82f6;
            }
            [${this.DATA_ATTR}] .vdhi-toggle-track input:checked + .vdhi-toggle-slider::before {
                transform: translateX(14px);
            }
            [${this.DATA_ATTR}] .vdhi-radio-group {
                display: inline-flex;
                border-radius: 0.375rem;
                overflow: hidden;
                gap: 0;
            }
            [${this.DATA_ATTR}] .vdhi-radio-btn {
                padding: 2px 10px;
                font-size: 0.675rem;
                cursor: pointer;
                border: 2px solid hsl(var(--border));
                background: hsl(var(--muted) / 0.5);
                color: hsl(var(--muted-foreground));
                transition: all 0.15s;
                font-weight: 500;
                line-height: 1.5;
            }
            [${this.DATA_ATTR}] .vdhi-radio-btn.active {
                border-color: #3b82f6;
                background: transparent;
                color: #3b82f6;
            }
            [${this.DATA_ATTR}] .vdhi-radio-btn:hover:not(.active) {
                background: hsl(var(--accent) / 0.5);
            }
            [${this.DATA_ATTR}] .vdhi-tray-chevron {
                transition: transform 0.15s;
            }
            [${this.DATA_ATTR}] .vdhi-tray-chevron.collapsed {
                transform: rotate(-90deg);
            }
            [${this.DATA_ATTR}] .vdhi-copy-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 1.5rem;
                height: 1.5rem;
                padding: 0;
                font-size: 0.65rem;
                font-weight: 500;
                border: 1px solid hsl(var(--border));
                border-radius: 0.25rem;
                background: hsl(var(--muted) / 0.5);
                color: hsl(var(--muted-foreground));
                cursor: pointer;
                transition: border-color 0.15s, background 0.15s, color 0.15s;
            }
            [${this.DATA_ATTR}] .vdhi-copy-btn:hover {
                background: hsl(var(--accent) / 0.5);
                border-color: hsl(var(--border));
            }
            [${this.DATA_ATTR}] .vdhi-copy-btn svg {
                flex-shrink: 0;
            }
        `;
        document.head.appendChild(style);
        state.stylesInjected = true;
        Logger.log('✓ Verifier Diff Highlight Improved styles injected');
    },

    // ========== PERSISTENCE ==========

    loadDiffMode() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY_MODE);
            return stored === 'word' ? 'word' : 'char';
        } catch { return 'char'; }
    },

    saveDiffMode(mode) {
        try { localStorage.setItem(this.STORAGE_KEY_MODE, mode); } catch {}
    },

    loadHighlightPref() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY_HIGHLIGHT);
            return stored === null ? true : stored === 'true';
        } catch { return true; }
    },

    saveHighlightPref(enabled) {
        try { localStorage.setItem(this.STORAGE_KEY_HIGHLIGHT, String(enabled)); } catch {}
    },

    // ========== DISCOVERY ==========

    findVerifierComparisonSection() {
        const labels = Context.dom.queryAll('div.text-sm.text-muted-foreground.font-medium', {
            context: `${this.id}.findVerifierComparisonSection`
        });
        for (const label of labels) {
            const text = (label.textContent || '').trim();
            if (!text.includes('Per-Field Comparison')) continue;
            const card = label.closest('.bg-card');
            if (!card) continue;
            if (card.hasAttribute(this.DATA_ATTR)) continue;
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
        return { row, expectedSpan, answerSpan };
    },

    extractFieldName(row) {
        const nameSpan = row.querySelector('.font-medium.truncate');
        return nameSpan ? (nameSpan.textContent || '').trim() : 'Field';
    },

    extractStatusIcon(row) {
        const headerDiv = row.querySelector('.flex.items-center.justify-between');
        if (!headerDiv) return null;
        const svgs = headerDiv.querySelectorAll(':scope > svg');
        return svgs.length > 0 ? svgs[svgs.length - 1].cloneNode(true) : null;
    },

    extractMatchInfo(headerLabel) {
        const parent = headerLabel?.parentElement;
        if (!parent) return null;
        const span = parent.querySelector('span.text-xs.font-mono.font-medium');
        if (!span) return null;
        return { text: span.textContent.trim(), style: span.getAttribute('style') || '' };
    },

    isRowCollapsed(row) {
        const chevron = row.querySelector('svg.transition-transform');
        return chevron ? chevron.classList.contains('-rotate-90') : false;
    },

    // ========== MAIN REFRESH ==========

    refresh(state) {
        const found = this.findVerifierComparisonSection();
        if (!found) {
            if (state.originalCard) {
                this.cleanup(state);
                Logger.debug('Verifier section removed, cleaned up improved viewer');
            }
            return;
        }

        const switchedCard = state.originalCard !== found.card;
        if (switchedCard) {
            this.cleanup(state);
            state.originalCard = found.card;
            state.fieldListContainer = found.fieldList;
            state.headerLabel = found.label;
            state.scrollParent = found.card.parentElement;
        }

        if (!state.verifierObserved) {
            state.verifierObserved = true;
            Logger.log('✓ Verifier Per-Field Comparison section detected (improved viewer)');
        }

        if (!found.card.hasAttribute(this.DATA_HIDDEN_ATTR)) {
            found.card.setAttribute(this.DATA_HIDDEN_ATTR, '');
            Logger.debug('Original Per-Field Comparison card hidden');
        }

        if (!state.ourCard || state.ourCard.parentElement !== state.scrollParent) {
            this.buildOurCard(state, found);
        }

        this.forceExpandOriginalRows(state);
        this.syncTrays(state);
    },

    cleanup(state) {
        this.disconnectAllObservers(state);

        if (state.ourCard?.parentElement) {
            state.ourCard.remove();
        }
        if (state.originalCard) {
            state.originalCard.removeAttribute(this.DATA_HIDDEN_ATTR);
        }

        state.ourCard = null;
        state._trayBody = null;
        state.originalCard = null;
        state.fieldListContainer = null;
        state.headerLabel = null;
        state.scrollParent = null;
        state.trayEntries = [];
        state.verifierObserved = false;
        state.lastRowSignature = '';
    },

    forceExpandOriginalRows(state) {
        if (!state.fieldListContainer) return;
        const rows = this.getRows(state.fieldListContainer);
        let clicked = 0;
        for (const row of rows) {
            if (this.isRowCollapsed(row)) {
                row.click();
                clicked++;
            }
        }
        if (clicked > 0) {
            Logger.debug(`Force-expanded ${clicked} collapsed row(s) in original viewer`);
        }
    },

    disconnectAllObservers(state) {
        for (const obs of state.fieldObservers) {
            obs.disconnect();
        }
        state.fieldObservers = [];
    },

    // ========== CARD BUILDING ==========

    buildOurCard(state, found) {
        if (state.ourCard?.parentElement) {
            state.ourCard.remove();
        }

        const card = document.createElement('div');
        card.className = 'rounded-sm border bg-card mt-3';
        card.setAttribute(this.DATA_ATTR, '');

        // --- Header ---
        const header = document.createElement('div');
        header.className = 'p-3 pb-2';

        const headerRow = document.createElement('div');
        headerRow.className = 'text-sm flex items-center gap-2 flex-wrap';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'text-sm text-muted-foreground font-medium';
        titleDiv.textContent = 'Per-Field Comparison';

        const matchSpan = document.createElement('span');
        matchSpan.className = 'text-xs font-mono font-medium vdhi-match-count';
        const matchInfo = this.extractMatchInfo(found.label);
        if (matchInfo) {
            matchSpan.textContent = matchInfo.text;
            if (matchInfo.style) matchSpan.setAttribute('style', matchInfo.style);
        }

        const spacer = document.createElement('div');
        spacer.style.flex = '1';

        const controlsWrap = document.createElement('div');
        controlsWrap.className = 'border rounded-sm bg-background p-2';

        const controls = document.createElement('div');
        controls.style.cssText = 'display:flex;align-items:center;gap:10px;';

        // Highlight toggle
        const toggleWrap = document.createElement('div');
        toggleWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';

        const toggleLabel = document.createElement('span');
        toggleLabel.className = 'text-xs text-muted-foreground';
        toggleLabel.textContent = 'Highlight Diffs';
        toggleLabel.style.cursor = 'pointer';
        toggleLabel.style.userSelect = 'none';

        const toggleTrack = document.createElement('label');
        toggleTrack.className = 'vdhi-toggle-track';
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = state.highlightEnabled;
        const toggleSlider = document.createElement('span');
        toggleSlider.className = 'vdhi-toggle-slider';

        toggleTrack.appendChild(toggleInput);
        toggleTrack.appendChild(toggleSlider);
        toggleWrap.appendChild(toggleLabel);
        toggleWrap.appendChild(toggleTrack);

        toggleLabel.addEventListener('click', () => toggleInput.click());
        toggleInput.addEventListener('change', () => {
            state.highlightEnabled = toggleInput.checked;
            this.saveHighlightPref(state.highlightEnabled);
            this.updateAllTrayContents(state);
            Logger.debug(`Verifier diff highlights ${state.highlightEnabled ? 'enabled' : 'disabled'}`);
        });

        // Diff mode radio
        const radioGroup = document.createElement('div');
        radioGroup.className = 'vdhi-radio-group';

        const charBtn = document.createElement('button');
        charBtn.className = 'vdhi-radio-btn' + (state.diffMode === 'char' ? ' active' : '');
        charBtn.textContent = 'Char';
        charBtn.type = 'button';

        const wordBtn = document.createElement('button');
        wordBtn.className = 'vdhi-radio-btn' + (state.diffMode === 'word' ? ' active' : '');
        wordBtn.textContent = 'Word';
        wordBtn.type = 'button';

        charBtn.addEventListener('click', () => {
            if (state.diffMode === 'char') return;
            state.diffMode = 'char';
            this.saveDiffMode('char');
            charBtn.classList.add('active');
            wordBtn.classList.remove('active');
            this.updateAllTrayContents(state);
        });

        wordBtn.addEventListener('click', () => {
            if (state.diffMode === 'word') return;
            state.diffMode = 'word';
            this.saveDiffMode('word');
            wordBtn.classList.add('active');
            charBtn.classList.remove('active');
            this.updateAllTrayContents(state);
        });

        radioGroup.appendChild(charBtn);
        radioGroup.appendChild(wordBtn);

        controls.appendChild(toggleWrap);
        controls.appendChild(radioGroup);

        controlsWrap.appendChild(controls);

        headerRow.appendChild(titleDiv);
        headerRow.appendChild(matchSpan);
        headerRow.appendChild(spacer);
        headerRow.appendChild(controlsWrap);
        header.appendChild(headerRow);
        card.appendChild(header);

        // --- Tray body ---
        const body = document.createElement('div');
        body.className = 'text-xs border-t divide-y divide-border';
        card.appendChild(body);

        state.ourCard = card;
        state._trayBody = body;

        found.card.insertAdjacentElement('afterend', card);
        Logger.log('✓ Custom verifier diff viewer created');
    },

    // ========== TRAY MANAGEMENT ==========

    syncTrays(state) {
        if (!state.fieldListContainer || !state.ourCard) return;

        const rows = this.getRows(state.fieldListContainer);
        const body = state._trayBody;
        if (!body) return;

        const signature = rows.map(r => {
            const name = this.extractFieldName(r);
            const hasPair = !!this.extractFieldPair(r);
            return `${name}:${hasPair ? 1 : 0}`;
        }).join('|');

        // Update match count every cycle
        const matchInfo = this.extractMatchInfo(state.headerLabel);
        const matchSpan = state.ourCard.querySelector('.vdhi-match-count');
        if (matchSpan && matchInfo) {
            matchSpan.textContent = matchInfo.text;
            if (matchInfo.style) matchSpan.setAttribute('style', matchInfo.style);
        }

        if (signature === state.lastRowSignature) return;
        state.lastRowSignature = signature;

        this.disconnectAllObservers(state);
        state.trayEntries = [];
        body.innerHTML = '';

        for (const row of rows) {
            const pair = this.extractFieldPair(row);
            const name = this.extractFieldName(row);
            const statusIcon = this.extractStatusIcon(row);
            const entry = this.buildTray(state, row, pair, name, statusIcon);
            body.appendChild(entry.element);
            state.trayEntries.push(entry);

            if (pair) {
                this.attachObserversForEntry(state, entry);
            }
        }

        Logger.debug(`Synced ${state.trayEntries.length} tray(s) in custom viewer`);
    },

    buildTray(state, row, pair, name, statusIcon) {
        const el = document.createElement('div');
        el.className = 'px-3 py-2';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'flex items-center justify-between gap-4 cursor-pointer';
        headerDiv.style.userSelect = 'none';

        const leftSide = document.createElement('div');
        leftSide.className = 'flex items-center gap-1.5 min-w-0';

        // Trays start open when we have data, closed when pending
        const startCollapsed = !pair;
        const chevronSvg = this.createChevronSvg(startCollapsed);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'font-medium truncate';
        nameSpan.textContent = name;

        leftSide.appendChild(chevronSvg);
        leftSide.appendChild(nameSpan);

        if (pair) {
            const copyBtn = this.createTrayCopyButton(pair);
            leftSide.appendChild(copyBtn);
        }

        headerDiv.appendChild(leftSide);

        if (statusIcon) {
            headerDiv.appendChild(statusIcon);
        }

        el.appendChild(headerDiv);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'mt-2';
        contentDiv.style.display = pair ? '' : 'none';
        el.appendChild(contentDiv);

        let isOpen = !!pair;
        headerDiv.addEventListener('click', () => {
            isOpen = !isOpen;
            contentDiv.style.display = isOpen ? '' : 'none';
            chevronSvg.classList.toggle('collapsed', !isOpen);
        });

        const entry = {
            element: el,
            row,
            pair,
            name,
            contentDiv,
            chevronSvg,
            expectedContentEl: null,
            answerContentEl: null
        };

        if (pair) {
            this.populateTrayContent(state, entry);
        }

        return entry;
    },

    populateTrayContent(state, entry) {
        const { pair, contentDiv } = entry;
        if (!pair || !contentDiv) return;

        contentDiv.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'vdhi-two-col';

        // Expected column
        const leftCol = document.createElement('div');
        const leftLabel = document.createElement('div');
        leftLabel.className = 'text-xs font-medium text-muted-foreground mb-1';
        leftLabel.textContent = 'Expected';
        const leftContent = document.createElement('div');
        leftContent.className = 'vdhi-col-content text-muted-foreground border rounded-sm bg-background p-2';
        leftCol.appendChild(leftLabel);
        leftCol.appendChild(leftContent);

        // Your Answer column
        const rightCol = document.createElement('div');
        const rightLabel = document.createElement('div');
        rightLabel.className = 'text-xs font-medium text-muted-foreground mb-1';
        rightLabel.textContent = 'Your Answer';
        const rightContent = document.createElement('div');
        rightContent.className = 'vdhi-col-content text-muted-foreground border rounded-sm bg-background p-2';
        rightCol.appendChild(rightLabel);
        rightCol.appendChild(rightContent);

        grid.appendChild(leftCol);
        grid.appendChild(rightCol);
        contentDiv.appendChild(grid);

        entry.expectedContentEl = leftContent;
        entry.answerContentEl = rightContent;

        this.renderDiffForEntry(state, entry);
    },

    renderDiffForEntry(state, entry) {
        if (!entry.pair || !entry.expectedContentEl || !entry.answerContentEl) return;

        const expectedText = entry.pair.expectedSpan.textContent || '';
        const answerText = entry.pair.answerSpan.textContent || '';

        const expectedHasRedText = entry.pair.expectedSpan.classList.contains('text-red-500') ||
            entry.pair.expectedSpan.querySelector('.text-red-500');
        const answerHasRedText = entry.pair.answerSpan.classList.contains('text-red-500') ||
            entry.pair.answerSpan.querySelector('.text-red-500');
        const skipDiff = expectedHasRedText || answerHasRedText;

        if (!state.highlightEnabled || skipDiff) {
            entry.expectedContentEl.textContent = expectedText;
            entry.answerContentEl.textContent = answerText;
            entry.expectedContentEl.style.color = expectedHasRedText ? 'rgb(239, 68, 68)' : '';
            entry.expectedContentEl.style.fontStyle = expectedHasRedText ? 'italic' : '';
            entry.answerContentEl.style.color = answerHasRedText ? 'rgb(239, 68, 68)' : '';
            entry.answerContentEl.style.fontStyle = answerHasRedText ? 'italic' : '';
            return;
        }

        entry.expectedContentEl.style.color = '';
        entry.expectedContentEl.style.fontStyle = '';
        entry.answerContentEl.style.color = '';
        entry.answerContentEl.style.fontStyle = '';

        const isDark = document.documentElement.classList.contains('dark');
        const styles = this.getHighlightStyles(isDark);

        const diff = state.diffMode === 'word'
            ? this.computeWordDiff(expectedText, answerText)
            : this.computeCharDiff(expectedText, answerText);

        entry.expectedContentEl.innerHTML = this.renderOriginal(diff, styles.remove);
        entry.answerContentEl.innerHTML = this.renderNew(diff, styles.add);
    },

    updateAllTrayContents(state) {
        for (const entry of state.trayEntries) {
            if (entry.pair) {
                this.renderDiffForEntry(state, entry);
            }
        }
    },

    copyTrayToClipboard(pair, button) {
        const expectedText = (pair.expectedSpan.textContent || '').trim();
        const answerText = (pair.answerSpan.textContent || '').trim();
        const blob = `Expected Answer:\n${expectedText}\n\nQA Answer:\n${answerText}`;
        navigator.clipboard.writeText(blob).then(() => {
            Logger.info('Copied Expected and QA answer to clipboard');
            if (button) {
                if (button._vdhiCopyTimeoutId) clearTimeout(button._vdhiCopyTimeoutId);
                button.style.backgroundColor = 'rgb(34, 197, 94)';
                button.style.color = 'white';
                button._vdhiCopyTimeoutId = setTimeout(() => {
                    button.style.backgroundColor = '';
                    button.style.color = '';
                    button._vdhiCopyTimeoutId = null;
                }, 3000);
            }
        }).catch((err) => {
            Logger.error('Failed to copy to clipboard', err);
        });
    },

    createTrayCopyButton(pair) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'vdhi-copy-btn';
        button.title = 'Copy Expected and QA answer to clipboard';
        button.setAttribute('aria-label', 'Copy Expected and QA answer to clipboard');

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

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.copyTrayToClipboard(pair, button);
        });

        return button;
    },

    // ========== MUTATION OBSERVERS ==========

    attachObserversForEntry(state, entry) {
        if (!entry.pair) return;

        const callback = () => {
            if (entry.expectedContentEl && entry.answerContentEl) {
                this.renderDiffForEntry(state, entry);
            }
        };

        const answerObs = new MutationObserver(callback);
        answerObs.observe(entry.pair.answerSpan, {
            characterData: true,
            childList: true,
            subtree: true
        });
        state.fieldObservers.push(answerObs);

        const expectedObs = new MutationObserver(callback);
        expectedObs.observe(entry.pair.expectedSpan, {
            characterData: true,
            childList: true,
            subtree: true
        });
        state.fieldObservers.push(expectedObs);
    },

    // ========== SVG HELPERS ==========

    createChevronSvg(collapsed) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('class',
            'fill-current size-3 shrink-0 text-muted-foreground vdhi-tray-chevron' +
            (collapsed ? ' collapsed' : '')
        );
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('clip-rule', 'evenodd');
        path.setAttribute('d', this.CHEVRON_PATH);
        svg.appendChild(path);
        return svg;
    },

    // ========== DIFF ALGORITHMS ==========

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

    computeWordDiff(expected, answer) {
        const a = this.tokenize(expected);
        const b = this.tokenize(answer);
        const dp = this.computeLCS(a, b);
        return this.backtrack(dp, a, b);
    },

    // ========== DIFF RENDERING ==========

    groupConsecutive(diff, includeTypes) {
        const filtered = diff.filter(d => includeTypes.includes(d.type));
        const groups = [];
        for (const item of filtered) {
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
        const groups = this.groupConsecutive(diff, ['equal', 'remove']);
        let html = '';
        for (const group of groups) {
            const text = group.values.join('');
            if (group.type === 'remove') {
                html += `<span class="verifier-diff-remove" style="${removeStyle}">${this.escapeHtml(text)}</span>`;
            } else {
                html += this.escapeHtml(text);
            }
        }
        return html;
    },

    renderNew(diff, addStyle) {
        const groups = this.groupConsecutive(diff, ['equal', 'add']);
        let html = '';
        for (const group of groups) {
            const text = group.values.join('');
            if (group.type === 'add') {
                html += `<span class="verifier-diff-add" style="${addStyle}">${this.escapeHtml(text)}</span>`;
            } else {
                html += this.escapeHtml(text);
            }
        }
        return html;
    }
};
