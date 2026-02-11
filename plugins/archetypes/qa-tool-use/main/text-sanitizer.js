// ============= text-sanitizer.js =============
// Adds a Text Sanitizer module in the same area as the QA scratchpad (below it when present).
// Independent of scratchpad: appears after Prompt section or after scratchpad/guideline buttons.
// Actions: dropdown + Execute; last action persisted. Date/Time to ISO is RegEx-based, date then time, output ISO 8601.

const DEFAULT_ACTION_ID = 'removeAllWhitespace';

const plugin = {
    id: 'textSanitizer',
    name: 'Text Sanitizer',
    description: 'Adds a text sanitizer with copy and actions (whitespace, special chars, date/time to ISO). Shown in the same panel area as the scratchpad, below it when present.',
    _version: '1.5',
    enabledByDefault: true,
    phase: 'mutation',

    storageKeys: {
        lastAction: 'text-sanitizer-last-action'
    },

    initialState: {
        promptMissingLogged: false,
        copyFeedbackTimeoutId: null,
        executeFeedbackTimeoutId: null
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

    /**
     * Parse date then time left-to-right from text; output ISO 8601. Time-only not allowed.
     * Supports month names/abbrevs (case insensitive), AM/PM, up to one space between numbers and labels.
     * Returns original input on failure or when no date found.
     */
    parseDateThenTimeToIso(text) {
        try {
            const raw = (text || '').trim();
            if (!raw) return raw;

            const monthNames = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
        const space = '\\s{0,1}';
        const num1 = '\\d{1,2}';
        const num2 = '\\d{2}';
        const num4 = '\\d{4}';
        const yearShort = '\\d{2,4}';
        const dayWithOrdinal = '(\\d{1,2})(?:st|nd|rd|th)?';

        let dateMatch = null;
        let remainder = raw;

        const datePatterns = [
            { re: new RegExp(`^(${num4})-(${num1})-(${num1})(?=\\s|$|[^\\d])`, 'i'), order: 'ymd' },
            { re: new RegExp(`^(${num1})/(${num1})/(${yearShort})(?=\\s|$|[^\\d])`, 'i'), order: 'mdy' },
            { re: new RegExp(`^(${num1})-(${num1})-(${yearShort})(?=\\s|$|[^\\d])`, 'i'), order: 'mdy' },
            { re: new RegExp(`^(${monthNames})${space},?${space}${dayWithOrdinal}${space},?${space}(${yearShort})(?=\\s|$|[^\\d])`, 'i'), order: 'mdy_name' },
            { re: new RegExp(`^${dayWithOrdinal}${space}+(${monthNames})${space},?${space}(${yearShort})(?=\\s|$|[^\\d])`, 'i'), order: 'dmy_name' }
        ];

        for (const { re, order } of datePatterns) {
            const m = remainder.match(re);
            if (m) {
                dateMatch = { m, order };
                remainder = remainder.slice(m[0].length).trim();
                break;
            }
        }

        if (!dateMatch) return text;

        let y = 0;
        let mo = 1;
        let d = 1;
        const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

        if (dateMatch.order === 'ymd') {
            y = parseInt(dateMatch.m[1], 10);
            mo = parseInt(dateMatch.m[2], 10);
            d = parseInt(dateMatch.m[3], 10);
        } else if (dateMatch.order === 'mdy') {
            mo = parseInt(dateMatch.m[1], 10);
            d = parseInt(dateMatch.m[2], 10);
            y = parseInt(dateMatch.m[3], 10);
            if (y < 100) y += y < 50 ? 2000 : 1900;
        } else if (dateMatch.order === 'mdy_name') {
            const monthStr = dateMatch.m[1].toLowerCase().slice(0, 3);
            mo = months[monthStr] || 1;
            d = parseInt(dateMatch.m[2], 10);
            y = parseInt(dateMatch.m[3], 10);
            if (y < 100) y += y < 50 ? 2000 : 1900;
        } else if (dateMatch.order === 'dmy_name') {
            d = parseInt(dateMatch.m[1], 10);
            const monthStr = dateMatch.m[2].toLowerCase().slice(0, 3);
            mo = months[monthStr] || 1;
            y = parseInt(dateMatch.m[3], 10);
            if (y < 100) y += y < 50 ? 2000 : 1900;
        }

        let hour = 0;
        let min = 0;
        let sec = 0;
        const timeRe = new RegExp(`^(${num1})${space}:${space}(${num2})(?:${space}:${space}(${num2}))?${space}(AM|PM|am|pm)?(?=\\s|$|[^\\d])`, 'i');
        const timeMatch = remainder.match(timeRe);
        if (timeMatch) {
            hour = parseInt(timeMatch[1], 10);
            min = parseInt(timeMatch[2], 10);
            sec = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
            const ampm = (timeMatch[4] || '').toUpperCase();
            if (ampm === 'PM' && hour < 12) hour += 12;
            if (ampm === 'AM' && hour === 12) hour = 0;
        }
        if (timeMatch) remainder = remainder.slice(timeMatch[0].length).trim();

        const date = new Date(y, mo - 1, d, hour, min, sec, 0);
        if (Number.isNaN(date.getTime()) || date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
            return text;
        }

        if (timeMatch) {
            return date.toISOString();
        }
        const yy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yy}-${mm}-${dd}`;
        } catch (e) {
            Logger.warn('Text Sanitizer: parseDateThenTimeToIso failed', e);
            return text || '';
        }
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
        if (anchor.dataset && anchor.dataset.qaTextSanitizer === 'true') {
            const duplicates = this.findAllTextSanitizersAmongSiblings(anchor);
            duplicates.forEach((el) => {
                el.remove();
                Logger.log('✓ Text Sanitizer: Removed duplicate');
            });
            return;
        }

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

        const ONE_LINE_HEIGHT = 40;
        const MIN_WRAPPER_HEIGHT = 60;
        const RESIZE_HANDLE_HEIGHT = 12;

        const textareaWrapper = document.createElement('div');
        textareaWrapper.className = 'relative flex flex-col rounded-md overflow-hidden border border-input bg-background shadow-sm';
        textareaWrapper.dataset.qaTextSanitizerWrapper = 'true';
        textareaWrapper.style.minHeight = ONE_LINE_HEIGHT + 'px';
        textareaWrapper.style.height = ONE_LINE_HEIGHT + 'px';

        const textarea = document.createElement('textarea');
        textarea.className = 'w-full border-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 resize-none overflow-y-auto flex-1 min-h-0';
        textarea.placeholder = 'Paste text to sanitize…';
        textarea.rows = 1;
        textarea.dataset.qaTextSanitizerTextarea = 'true';
        textarea.style.height = ONE_LINE_HEIGHT + 'px';

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex items-center justify-center transition-opacity duration-200 flex-shrink-0';
        resizeHandle.style.opacity = '0';
        resizeHandle.style.display = 'none';
        resizeHandle.style.background = 'transparent';
        const handleBar = document.createElement('div');
        handleBar.className = 'w-10 h-1 rounded-sm bg-current opacity-30';
        resizeHandle.appendChild(handleBar);

        const setWrapperOneLine = () => {
            textareaWrapper.style.height = ONE_LINE_HEIGHT + 'px';
            textarea.style.height = ONE_LINE_HEIGHT + 'px';
            resizeHandle.style.display = 'none';
        };

        const updateTextareaHeight = () => {
            const hasMultiLine = (textarea.value || '').includes('\n') || textarea.scrollHeight > ONE_LINE_HEIGHT;
            if (hasMultiLine) {
                resizeHandle.style.display = 'flex';
                resizeHandle.style.opacity = '1';
                if (parseInt(textareaWrapper.style.height, 10) <= ONE_LINE_HEIGHT) {
                    textareaWrapper.style.height = '80px';
                    textarea.style.height = (80 - RESIZE_HANDLE_HEIGHT) + 'px';
                }
            } else {
                resizeHandle.style.display = 'none';
                resizeHandle.style.opacity = '0';
                setWrapperOneLine();
            }
        };

        const onInput = () => updateTextareaHeight();
        textarea.addEventListener('input', onInput);
        CleanupRegistry.registerEventListener(textarea, 'input', onInput);

        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = textareaWrapper.offsetHeight;
            e.preventDefault();
            e.stopPropagation();
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        };
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const deltaY = e.clientY - startY;
            const requested = startHeight + deltaY;
            const maxHeight = textarea.scrollHeight + RESIZE_HANDLE_HEIGHT;
            const newHeight = Math.max(MIN_WRAPPER_HEIGHT, Math.min(maxHeight, requested));
            textareaWrapper.style.height = newHeight + 'px';
            textarea.style.height = (newHeight - RESIZE_HANDLE_HEIGHT) + 'px';
        };
        const handleMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        resizeHandle.addEventListener('mousedown', handleMouseDown);
        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);

        textareaWrapper.addEventListener('mouseenter', () => { if (resizeHandle.style.display === 'flex') resizeHandle.style.opacity = '1'; });
        textareaWrapper.addEventListener('mouseleave', () => { if (resizeHandle.style.display === 'flex') resizeHandle.style.opacity = '0.6'; });

        textareaWrapper.appendChild(textarea);
        textareaWrapper.appendChild(resizeHandle);
        container.appendChild(textareaWrapper);

        const header = document.createElement('div');
        header.className = 'flex items-center justify-between gap-2';
        const label = document.createElement('span');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Text Sanitizer';
        const copyRightWrapper = document.createElement('div');
        copyRightWrapper.className = 'flex items-center gap-1';
        const copyLabel = document.createElement('span');
        copyLabel.className = 'text-sm text-muted-foreground';
        copyLabel.textContent = 'Copy and Clear Output:';
        const copyBtn = this.createCopyButton(state, { onAfterClear: setWrapperOneLine });
        copyRightWrapper.appendChild(copyLabel);
        copyRightWrapper.appendChild(copyBtn);
        header.appendChild(label);
        header.appendChild(copyRightWrapper);
        container.insertBefore(header, textareaWrapper);

        const actionRow = document.createElement('div');
        actionRow.className = 'flex flex-wrap items-center gap-2';

        const select = document.createElement('select');
        select.setAttribute('data-fleet-plugin', this.id);
        select.className = 'h-8 rounded-sm border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
        const actionIds = ['removeAllWhitespace', 'trimWhitespace', 'removeSpecialCharacters', 'dateTimeToIso'];
        const savedAction = Storage.get(this.storageKeys.lastAction, DEFAULT_ACTION_ID);
        const initialAction = actionIds.includes(savedAction) ? savedAction : DEFAULT_ACTION_ID;
        actionIds.forEach((id) => {
            const action = this.actions[id];
            if (!action) return;
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = action.label;
            if (id === initialAction) opt.selected = true;
            select.appendChild(opt);
        });
        select.value = initialAction;

        const onSelectChange = () => {
            Storage.set(this.storageKeys.lastAction, select.value);
            Logger.debug('Text Sanitizer: Saved last action ' + select.value);
        };
        select.addEventListener('change', onSelectChange);
        CleanupRegistry.registerEventListener(select, 'change', onSelectChange);

        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const executeBtn = document.createElement('button');
        executeBtn.type = 'button';
        executeBtn.className = buttonClass;
        executeBtn.setAttribute('data-fleet-plugin', this.id);
        executeBtn.textContent = 'Execute';
        const showExecuteFeedback = () => {
            executeBtn.textContent = 'Executed';
            executeBtn.style.backgroundColor = 'rgb(34, 197, 94)';
            executeBtn.style.color = 'white';
            if (state.executeFeedbackTimeoutId) clearTimeout(state.executeFeedbackTimeoutId);
            state.executeFeedbackTimeoutId = setTimeout(() => {
                executeBtn.textContent = 'Execute';
                executeBtn.style.backgroundColor = '';
                executeBtn.style.color = '';
                state.executeFeedbackTimeoutId = null;
            }, 3000);
        };
        const onExecute = () => {
            const id = select.value;
            const action = this.actions[id];
            if (!action) return;
            const input = textarea.value || '';
            try {
                const output = action.run(input);
                textarea.value = output;
                updateTextareaHeight();
                Storage.set(this.storageKeys.lastAction, id);
                Logger.log('✓ Text Sanitizer: Executed ' + action.label);
            } catch (e) {
                Logger.error('Text Sanitizer: Execute failed', e);
                textarea.value = input;
            }
            showExecuteFeedback();
        };
        executeBtn.addEventListener('click', onExecute);
        CleanupRegistry.registerEventListener(executeBtn, 'click', onExecute);

        actionRow.appendChild(select);
        actionRow.appendChild(executeBtn);
        container.appendChild(actionRow);

        return container;
    },

    createCopyButton(state, opts) {
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
                }, 3000);
                textarea.value = '';
                if (opts && opts.onAfterClear) opts.onAfterClear();
            }).catch((err) => {
                Logger.error('Text Sanitizer: Failed to copy to clipboard', err);
            });
        };

        button.addEventListener('click', handleCopy);
        CleanupRegistry.registerEventListener(button, 'click', handleCopy);
        return button;
    }
};

plugin.actions = {
    removeAllWhitespace: {
        id: 'removeAllWhitespace',
        label: 'Remove All Whitespace',
        run(input) {
            return (input || '').replace(/\s/g, '');
        }
    },
    trimWhitespace: {
        id: 'trimWhitespace',
        label: 'Trim Whitespace',
        run(input) {
            const s = (input || '').trim();
            return s.split(/\n/).filter((line) => line.trim().length > 0).join('\n');
        }
    },
    removeSpecialCharacters: {
        id: 'removeSpecialCharacters',
        label: 'Remove Special Characters',
        run(input) {
            const step = (input || '').replace(/[^a-zA-Z0-9\s]/g, '');
            return plugin.actions.trimWhitespace.run(step);
        }
    },
    dateTimeToIso: {
        id: 'dateTimeToIso',
        label: 'Date/Time to ISO',
        run(input) {
            return plugin.parseDateThenTimeToIso(input || '');
        }
    }
};
