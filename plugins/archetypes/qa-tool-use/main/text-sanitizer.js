// ============= text-sanitizer.js =============
// Adds a Text Sanitizer module in the same area as the QA scratchpad (below it when present).
// Independent of scratchpad: appears after Prompt section or after scratchpad/guideline buttons.
// Actions: dropdown + Execute. Date/Time to ISO is first and default. Date/Time to ISO uses a working ISO 8601 converter (date + optional time).

const DEFAULT_ACTION_ID = 'dateTimeToIso';

const MONTHS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

const MP = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Sept?|Jun|Jul|Aug|Oct|Nov|Dec)\\.?';

/**
 * Parse date and optional time from normalized input (single spaces, trimmed).
 * Returns { iso } or null. ISO is local time, no Z suffix.
 */
function parseDateInputToIso(text) {
    let year;
    let month;
    let day;
    let dateStr;

    const patterns = [
        { re: new RegExp(`(${MP})\\s+(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})`, 'i'),
          parse: m => ({ month: MONTHS[m[1].replace('.', '').toLowerCase()], day: +m[2], year: +m[3] }) },
        { re: new RegExp(`(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MP})\\s*,?\\s*(\\d{4})`, 'i'),
          parse: m => ({ day: +m[1], month: MONTHS[m[2].replace('.', '').toLowerCase()], year: +m[3] }) },
        { re: new RegExp(`(\\d{4})\\s+(?:,\\s*)?(${MP})\\s+(\\d{1,2})\\s*(?:st|nd|rd|th)?`, 'i'),
          parse: m => ({ year: +m[1], month: MONTHS[m[2].replace('.', '').toLowerCase()], day: +m[3] }) },
        { re: /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
          parse: m => ({ year: +m[1], month: +m[2], day: +m[3] }) },
        { re: /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/,
          parse: m => ({ month: +m[1], day: +m[2], year: +m[3] }) }
    ];

    for (const p of patterns) {
        const m = text.match(p.re);
        if (m) {
            ({ year, month, day } = p.parse(m));
            dateStr = m[0];
            break;
        }
    }

    if (year === undefined) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1) return null;
    const testDate = new Date(year, month - 1, day);
    if (testDate.getMonth() !== month - 1 || testDate.getDate() !== day) return null;

    let remainder = text.replace(dateStr, ' ');
    let hours = null;
    let minutes = null;
    let seconds = null;

    if (/\bnoon\b/i.test(remainder)) {
        hours = 12;
        minutes = 0;
        seconds = 0;
    } else if (/\bmidnight\b/i.test(remainder)) {
        hours = 0;
        minutes = 0;
        seconds = 0;
    }

    if (hours === null) {
        const tm = remainder.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
        if (tm) {
            hours = +tm[1];
            minutes = +tm[2];
            seconds = tm[3] ? +tm[3] : 0;
            const ap = (tm[4] || '').replace(/\./g, '').toLowerCase();
            if (ap === 'pm' && hours !== 12) hours += 12;
            if (ap === 'am' && hours === 12) hours = 0;
        }
    }

    if (hours === null) {
        const tm = remainder.match(/(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/i);
        if (tm) {
            hours = +tm[1];
            minutes = 0;
            seconds = 0;
            const ap = tm[2].replace(/\./g, '').toLowerCase();
            if (ap === 'pm' && hours !== 12) hours += 12;
            if (ap === 'am' && hours === 12) hours = 0;
        }
    }

    if (hours !== null) {
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
    }

    const pad = (n, w = 2) => String(n).padStart(w, '0');
    let iso = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
    if (hours !== null) iso += `T${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    return { iso };
}

const plugin = {
    id: 'textSanitizer',
    name: 'Text Sanitizer',
    description: 'Adds a text sanitizer utility for quickly cleaning and transforming text',
    _version: '2.6',
    enabledByDefault: true,
    phase: 'mutation',

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
        if (!scopeRoot) {
            const taskDetailPanel = document.querySelector('[data-ui="qa-task-detail-panel"]');
            if (taskDetailPanel) {
                const inPanel = this.findPromptSection(taskDetailPanel);
                if (inPanel) return inPanel;
            }
        }
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
        const taskDetailPanel = document.querySelector('[data-ui="qa-task-detail-panel"]');
        const roots = taskDetailPanel ? [taskDetailPanel] : [document];
        for (const root of roots) {
            const candidates = root.querySelectorAll('div.flex.items-center.gap-1.px-2.border-b');
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
            if (tabBars.length > 0) break;
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
     * Parse date and optional time from text; return ISO 8601 (local time, no Z).
     * Based on the working ISO 8601 converter. Returns original input on failure or when no date found.
     */
    parseDateThenTimeToIso(text) {
        try {
            const raw = (text || '').trim().replace(/\s+/g, ' ');
            if (!raw) return text || '';

            const result = parseDateInputToIso(raw);
            return result ? result.iso : text;
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
            const content = textarea.value || '';
            const isEmpty = !content.trim();
            const hasMultiLine = !isEmpty && (content.includes('\n') || textarea.scrollHeight > ONE_LINE_HEIGHT);
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
        header.appendChild(label);
        container.insertBefore(header, textareaWrapper);

        const actionRow = document.createElement('div');
        actionRow.className = 'flex flex-wrap items-center gap-2';
        const copyBtn = this.createCopyButton(state, { onAfterClear: setWrapperOneLine });
        copyBtn.style.marginLeft = 'auto';

        const select = document.createElement('select');
        select.setAttribute('data-fleet-plugin', this.id);
        select.className = 'h-8 rounded-sm border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
        const actionIds = ['dateTimeToIso', 'removeAllWhitespace', 'trimWhitespace', 'removeSpecialCharacters'];
        actionIds.forEach((id) => {
            const action = this.actions[id];
            if (!action) return;
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = action.label;
            if (id === DEFAULT_ACTION_ID) opt.selected = true;
            select.appendChild(opt);
        });
        select.value = DEFAULT_ACTION_ID;

        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const executeBtn = document.createElement('button');
        executeBtn.type = 'button';
        executeBtn.className = buttonClass;
        executeBtn.setAttribute('data-fleet-plugin', this.id);
        executeBtn.textContent = 'Execute';
        const showExecuteSuccess = () => {
            if (state.executeFeedbackTimeoutId) clearTimeout(state.executeFeedbackTimeoutId);
            executeBtn.style.transition = '';
            executeBtn.style.backgroundColor = 'rgb(34, 197, 94)';
            executeBtn.style.color = 'white';
            state.executeFeedbackTimeoutId = setTimeout(() => {
                executeBtn.style.backgroundColor = '';
                executeBtn.style.color = '';
                state.executeFeedbackTimeoutId = null;
            }, 1000);
        };
        const showExecuteFailure = () => {
            if (state.executeFeedbackTimeoutId) clearTimeout(state.executeFeedbackTimeoutId);
            const prevT = executeBtn.style.transition;
            executeBtn.style.transition = 'none';
            executeBtn.style.backgroundColor = 'rgb(239, 68, 68)';
            executeBtn.style.color = '#ffffff';
            void executeBtn.offsetHeight;
            executeBtn.style.transition = 'background-color 500ms ease-out, color 500ms ease-out';
            executeBtn.style.backgroundColor = '';
            executeBtn.style.color = '';
            state.executeFeedbackTimeoutId = setTimeout(() => {
                executeBtn.style.transition = prevT || '';
                state.executeFeedbackTimeoutId = null;
            }, 500);
        };
        const onExecute = () => {
            const id = select.value;
            const action = this.actions[id];
            if (!action) return;
            const input = textarea.value || '';
            let ok = true;
            try {
                const output = action.run(input);
                textarea.value = output;
                updateTextareaHeight();
                Logger.log('✓ Text Sanitizer: Executed ' + action.label);
            } catch (e) {
                Logger.error('Text Sanitizer: Execute failed', e);
                textarea.value = input;
                ok = false;
            }
            if (ok) {
                showExecuteSuccess();
            } else {
                showExecuteFailure();
            }
        };
        executeBtn.addEventListener('click', onExecute);
        CleanupRegistry.registerEventListener(executeBtn, 'click', onExecute);

        actionRow.appendChild(select);
        actionRow.appendChild(executeBtn);
        actionRow.appendChild(copyBtn);
        container.appendChild(actionRow);

        return container;
    },

    createCopyButton(state, opts) {
        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-fleet-plugin', this.id);
        button.className = buttonClass;
        button.textContent = 'Copy';
        button.title = 'Copy text';
        button.setAttribute('aria-label', 'Copy text');

        const pulseCopyFailure = () => {
            if (state.copyFeedbackTimeoutId) clearTimeout(state.copyFeedbackTimeoutId);
            const prevT = button.style.transition;
            button.style.transition = 'none';
            button.style.backgroundColor = 'rgb(239, 68, 68)';
            button.style.color = '#ffffff';
            void button.offsetHeight;
            button.style.transition = 'background-color 500ms ease-out, color 500ms ease-out';
            button.style.backgroundColor = '';
            button.style.color = '';
            state.copyFeedbackTimeoutId = setTimeout(() => {
                button.style.transition = prevT || '';
                state.copyFeedbackTimeoutId = null;
            }, 500);
        };
        const handleCopy = () => {
            const container = button.closest('[data-qa-text-sanitizer="true"]');
            const textarea = container ? container.querySelector('[data-qa-text-sanitizer-textarea="true"]') : null;
            if (!textarea) {
                pulseCopyFailure();
                return;
            }
            const text = textarea.value || '';
            if (!text) {
                Logger.debug('Text Sanitizer: No text to copy');
                pulseCopyFailure();
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                Logger.log(`Text Sanitizer: Copied ${text.length} chars and cleared`);
                if (state.copyFeedbackTimeoutId) clearTimeout(state.copyFeedbackTimeoutId);
                button.style.transition = '';
                button.style.backgroundColor = 'rgb(34, 197, 94)';
                button.style.color = 'white';
                state.copyFeedbackTimeoutId = setTimeout(() => {
                    button.style.backgroundColor = '';
                    button.style.color = '';
                    state.copyFeedbackTimeoutId = null;
                }, 1000);
                textarea.value = '';
                if (opts && opts.onAfterClear) opts.onAfterClear();
            }).catch((err) => {
                Logger.error('Text Sanitizer: Failed to copy to clipboard', err);
                pulseCopyFailure();
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
            return s.split(/\n/).map((line) => line.trim()).filter((line) => line.length > 0).join('\n');
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
