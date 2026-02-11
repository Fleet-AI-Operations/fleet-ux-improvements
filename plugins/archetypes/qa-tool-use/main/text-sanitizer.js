// ============= text-sanitizer.js =============
// Adds a Text Sanitizer module in the same area as the QA scratchpad (below it when present).
// Independent of scratchpad: appears after Prompt section or after scratchpad/guideline buttons.

const plugin = {
    id: 'textSanitizer',
    name: 'Text Sanitizer',
    description: 'Adds a text sanitizer with copy, remove whitespace, and remove special characters. Shown in the same panel area as the scratchpad, below it when present.',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        promptMissingLogged: false,
        copyFeedbackTimeoutId: null
    },

    onMutation(state, context) {
        const tabBars = this.findTaskNotesTabBars();

        if (tabBars.length === 0) {
            const promptSection = this.findPromptSection();
            if (!promptSection) {
                if (!state.promptMissingLogged) {
                    state.promptMissingLogged = true;
                    Logger.debug('Text Sanitizer: Prompt section not found');
                }
                return;
            }
            state.promptMissingLogged = false;
            const anchor = this.getInsertAnchor(promptSection);
            this.ensureTextSanitizerBelowAnchor(state, anchor);
            return;
        }

        for (const tabBar of tabBars) {
            const contentRoot = this.getPanelContentRoot(tabBar);
            if (!contentRoot) continue;

            if (!this.isTaskTabActive(tabBar)) {
                contentRoot.querySelectorAll('[data-qa-text-sanitizer="true"]').forEach((el) => {
                    el.remove();
                    Logger.debug('Text Sanitizer: Removed from panel (Notes tab active)');
                });
                continue;
            }

            const promptSection = this.findPromptSection(contentRoot);
            if (!promptSection) continue;

            state.promptMissingLogged = false;
            const anchor = this.getInsertAnchor(promptSection);
            this.ensureTextSanitizerBelowAnchor(state, anchor);
        }
    },

    findPromptSection(scopeRoot) {
        const options = { context: `${this.id}.findPromptSection` };
        if (scopeRoot) options.root = scopeRoot;
        const candidates = Context.dom.queryAll('div.flex.flex-col.gap-2', options);

        for (const candidate of candidates) {
            const label = candidate.querySelector('label');
            const span = candidate.querySelector('span.text-sm.text-muted-foreground.font-medium');
            if (label && label.textContent.trim() === 'Prompt') return candidate;
            if (span && span.textContent.trim() === 'Prompt') return candidate;
        }
        return null;
    },

    /**
     * Returns the element after which to insert. Walk nextElementSibling while sibling is
     * scratchpad, guideline buttons, or our own container; use last such as anchor.
     */
    getInsertAnchor(promptSection) {
        let anchor = promptSection;
        let el = promptSection.nextElementSibling;
        while (el) {
            if (el.dataset && el.dataset.qaScratchpad === 'true') {
                anchor = el;
            } else if (el.getAttribute && el.getAttribute('data-fleet-plugin') === 'guidelineButtons') {
                anchor = el;
            } else if (el.dataset && el.dataset.qaTextSanitizer === 'true') {
                anchor = el;
            }
            el = el.nextElementSibling;
        }
        return anchor;
    },

    findTaskNotesTabBars() {
        const tabBars = [];
        const candidates = document.querySelectorAll('div.flex.items-center.gap-1.px-2.border-b');
        for (const el of candidates) {
            const buttons = el.querySelectorAll('button');
            let hasTask = false;
            let hasNotes = false;
            for (const btn of buttons) {
                const text = btn.textContent.trim();
                if (text === 'Task') hasTask = true;
                if (text === 'Notes') hasNotes = true;
            }
            if (hasTask && hasNotes) tabBars.push(el);
        }
        return tabBars;
    },

    isTaskTabActive(tabBar) {
        const taskBtn = Array.from(tabBar.querySelectorAll('button')).find(
            (btn) => btn.textContent.trim() === 'Task'
        );
        if (!taskBtn) return false;
        const c = taskBtn.className || '';
        return c.includes('border-primary') || c.includes('text-primary');
    },

    getPanelContentRoot(tabBar) {
        const panel = tabBar.parentElement;
        if (!panel || !panel.querySelector) return null;
        return panel.querySelector('div.flex-1.min-h-0.overflow-auto.p-3') || panel.querySelector('div.overflow-auto') || null;
    },

    findExistingTextSanitizerAmongSiblings(anchor) {
        let el = anchor.nextElementSibling;
        while (el) {
            if (el.dataset && el.dataset.qaTextSanitizer === 'true') return el;
            el = el.nextElementSibling;
        }
        return null;
    },

    findAllTextSanitizersAmongSiblings(anchor) {
        const found = [];
        let el = anchor.nextElementSibling;
        while (el) {
            if (el.dataset && el.dataset.qaTextSanitizer === 'true') found.push(el);
            el = el.nextElementSibling;
        }
        return found;
    },

    ensureTextSanitizerBelowAnchor(state, anchor) {
        const existing = this.findExistingTextSanitizerAmongSiblings(anchor);
        if (existing) {
            const all = this.findAllTextSanitizersAmongSiblings(anchor);
            if (all.length > 1) {
                for (let i = 1; i < all.length; i++) {
                    all[i].remove();
                    Logger.log('✓ Text Sanitizer: Removed duplicate');
                }
            }
            const remaining = this.findAllTextSanitizersAmongSiblings(anchor);
            const toUse = remaining.length > 0 ? remaining[0] : existing;
            if (toUse && toUse !== anchor.nextElementSibling) {
                anchor.insertAdjacentElement('afterend', toUse);
                Logger.debug('Text Sanitizer: Moved to follow anchor');
            }
            return;
        }

        const container = this.createContainer(state);
        anchor.insertAdjacentElement('afterend', container);
        Logger.log('✓ Text Sanitizer: Inserted below scratchpad area');
    },

    createContainer(state) {
        const container = document.createElement('div');
        container.className = 'flex flex-col gap-2';
        container.dataset.qaTextSanitizer = 'true';
        container.setAttribute('data-fleet-plugin', this.id);

        const header = document.createElement('div');
        header.className = 'flex items-center gap-2';

        const label = document.createElement('span');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Text Sanitizer';

        const copyBtn = this.createCopyButton(state);
        header.appendChild(label);
        header.appendChild(copyBtn);
        container.appendChild(header);

        const textareaWrapper = document.createElement('div');
        textareaWrapper.className = 'rounded-md overflow-hidden border border-input bg-background shadow-sm';

        const textarea = document.createElement('textarea');
        textarea.className = 'w-full border-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 resize-none overflow-hidden';
        textarea.placeholder = 'Paste text to sanitize…';
        textarea.rows = 1;
        textarea.dataset.qaTextSanitizerTextarea = 'true';
        textarea.style.minHeight = '1.5rem';

        const resizeTextarea = () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.max(24, textarea.scrollHeight) + 'px';
        };

        textarea.addEventListener('input', resizeTextarea);
        CleanupRegistry.registerEventListener(textarea, 'input', resizeTextarea);

        textareaWrapper.appendChild(textarea);
        container.appendChild(textareaWrapper);

        const buttonRow = document.createElement('div');
        buttonRow.className = 'flex flex-wrap gap-1';
        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';

        const onRemoveWhitespace = () => {
            const val = textarea.value || '';
            const next = val.replace(/\s+/g, ' ').trim();
            textarea.value = next;
            resizeTextarea();
            Logger.log('✓ Text Sanitizer: Removed whitespace');
        };
        const removeWhitespaceBtn = document.createElement('button');
        removeWhitespaceBtn.type = 'button';
        removeWhitespaceBtn.className = buttonClass;
        removeWhitespaceBtn.setAttribute('data-fleet-plugin', this.id);
        removeWhitespaceBtn.textContent = 'Remove Whitespace';
        removeWhitespaceBtn.addEventListener('click', onRemoveWhitespace);
        CleanupRegistry.registerEventListener(removeWhitespaceBtn, 'click', onRemoveWhitespace);

        const onRemoveSpecial = () => {
            const val = textarea.value || '';
            const next = val.replace(/[^a-zA-Z0-9\s]/g, '');
            textarea.value = next;
            resizeTextarea();
            Logger.log('✓ Text Sanitizer: Removed special characters');
        };
        const removeSpecialBtn = document.createElement('button');
        removeSpecialBtn.type = 'button';
        removeSpecialBtn.className = buttonClass;
        removeSpecialBtn.setAttribute('data-fleet-plugin', this.id);
        removeSpecialBtn.textContent = 'Remove Special Characters';
        removeSpecialBtn.addEventListener('click', onRemoveSpecial);
        CleanupRegistry.registerEventListener(removeSpecialBtn, 'click', onRemoveSpecial);

        buttonRow.appendChild(removeWhitespaceBtn);
        buttonRow.appendChild(removeSpecialBtn);
        container.appendChild(buttonRow);

        return container;
    },

    createCopyButton(state) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-fleet-plugin', this.id);
        button.className = 'inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        button.title = 'Copy text and clear';
        button.setAttribute('aria-label', 'Copy text and clear');

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

        const handleCopy = () => {
            const container = button.closest('[data-qa-text-sanitizer="true"]');
            const textarea = container ? container.querySelector('[data-qa-text-sanitizer-textarea="true"]') : null;
            if (!textarea) return;
            const text = textarea.value || '';
            if (!text) {
                Logger.debug('Text Sanitizer: No text to copy');
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                Logger.log(`Text Sanitizer: Copied ${text.length} chars and cleared`);
                button.style.color = '';
                button.style.backgroundColor = '';
                button.style.backgroundColor = 'rgb(34, 197, 94)';
                button.style.color = 'white';
                if (state.copyFeedbackTimeoutId) clearTimeout(state.copyFeedbackTimeoutId);
                state.copyFeedbackTimeoutId = setTimeout(() => {
                    button.style.backgroundColor = '';
                    button.style.color = '';
                    state.copyFeedbackTimeoutId = null;
                }, 5000);
                textarea.value = '';
                textarea.style.height = 'auto';
                textarea.style.height = '24px';
            }).catch((err) => {
                Logger.error('Text Sanitizer: Failed to copy to clipboard', err);
            });
        };

        button.addEventListener('click', handleCopy);
        CleanupRegistry.registerEventListener(button, 'click', handleCopy);
        return button;
    }
};
