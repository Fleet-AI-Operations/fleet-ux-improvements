// ============= prompt-cache.js =============
// Auto-saves the prompt textarea content to local storage every 1 s (or 1 s after
// the user finishes typing, whichever fires later).  Keeps the two most-recent
// non-empty saves so the user can restore either on page reload.
// A live save-status indicator (spinner → checkmark) is injected next to the label.

const plugin = {
    id: 'promptCache',
    name: 'Prompt Cache',
    description: 'Auto-saves the prompt and offers to restore it when returning to the same task instance',
    _version: '2.2',
    enabledByDefault: true,
    phase: 'mutation',

    storageKeys: {
        promptText:     'comp-use-prompt-cache-text',
        promptPrevText: 'comp-use-prompt-cache-prev-text',
        instanceId:     'comp-use-prompt-cache-instance-id'
    },

    initialState: {
        textarea:          null,
        lastSavedValue:    null,
        saveDebounceTimer: null,
        saveIntervalId:    null,
        statusEl:          null,
        statusCurrent:     null,   // 'pending' | 'saved' — only write DOM on transitions
        restoreInjected:   false,
        restoreWrapperEl:  null,
        restoreInitialText:   '',    // textarea value at the time buttons were injected
        selectedVersion:      null,  // 'current' | 'previous' — which btn is in confirm state
        suppressRestoreCheck: false, // true while plugin-driven paste fires its synthetic input
        stylesInjected:    false,
        missingLogged:     false
    },

    // ─── lifecycle ────────────────────────────────────────────────────────────

    onMutation(state, context) {
        if (!state.stylesInjected) {
            this.injectStyles();
            state.stylesInjected = true;
        }

        const textarea = document.getElementById('prompt-editor');
        if (!textarea) {
            if (!state.missingLogged) {
                Logger.debug('Prompt Cache: prompt editor not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        if (state.textarea !== textarea) {
            this.teardown(state);
            state.textarea = textarea;
            this.setup(state, textarea);
        }

        this.ensureStatusIndicator(state, textarea);
    },

    teardown(state) {
        if (state.saveIntervalId)    { clearInterval(state.saveIntervalId);   state.saveIntervalId = null; }
        if (state.saveDebounceTimer) { clearTimeout(state.saveDebounceTimer);  state.saveDebounceTimer = null; }
        state.textarea          = null;
        state.statusEl          = null;
        state.statusCurrent     = null;
        state.restoreInjected   = false;
        state.restoreWrapperEl  = null;
        state.restoreInitialText = '';
        state.selectedVersion   = null;
    },

    setup(state, textarea) {
        const onInput = () => {
            this.maybeRemoveRestoreButtonsAfterTyping(state);
            this.setStatus(state, 'pending');
            if (state.saveDebounceTimer) clearTimeout(state.saveDebounceTimer);
            state.saveDebounceTimer = setTimeout(() => {
                this.save(state);
                state.saveDebounceTimer = null;
            }, 1000);
        };
        // registerEventListener also calls addEventListener internally
        CleanupRegistry.registerEventListener(textarea, 'input', onInput);

        state.saveIntervalId = setInterval(() => {
            if (!state.saveDebounceTimer) this.maybeSave(state);
        }, 1000);
        CleanupRegistry.registerInterval(state.saveIntervalId);

        this.maybeShowRestoreButtons(state, textarea);

        Logger.log('Prompt Cache: initialized');
    },

    // ─── save logic ───────────────────────────────────────────────────────────

    maybeSave(state) {
        if (!state.textarea) return;
        if (!this.hasSavableContent(state.textarea.value)) return;
        if (state.textarea.value !== state.lastSavedValue) this.save(state);
    },

    save(state) {
        if (!state.textarea) return;
        const val = state.textarea.value;
        if (!this.hasSavableContent(val)) {
            Logger.debug('Prompt Cache: skipped save for empty prompt');
            return;
        }
        const instanceId    = this.getCurrentInstanceId();
        const currentStored = Storage.get(this.storageKeys.promptText, '');

        // Rotate current → previous before overwriting (only when content actually differs)
        if (this.hasSavableContent(currentStored) && currentStored !== val) {
            Storage.set(this.storageKeys.promptPrevText, currentStored);
        }

        Storage.set(this.storageKeys.promptText, val);
        Storage.set(this.storageKeys.instanceId,  instanceId);
        state.lastSavedValue = val;
        this.setStatus(state, 'saved');
        Logger.debug(`Prompt Cache: saved ${val.length} chars (instance: ${instanceId})`);
    },

    hasSavableContent(value) {
        return typeof value === 'string' && value.trim().length > 0;
    },

    getCurrentInstanceId() {
        return new URLSearchParams(window.location.search).get('instance_id') || '';
    },

    // ─── restore buttons ──────────────────────────────────────────────────────

    maybeShowRestoreButtons(state, textarea) {
        if (state.restoreInjected) return;

        const savedText       = Storage.get(this.storageKeys.promptText,     '');
        const prevText        = Storage.get(this.storageKeys.promptPrevText,  '');
        const savedInstanceId = Storage.get(this.storageKeys.instanceId,      '');
        const currentId       = this.getCurrentInstanceId();

        if (!savedText || !savedInstanceId || !currentId) {
            Logger.debug('Prompt Cache: no saved data or missing instance_id, skipping restore');
            return;
        }
        if (savedInstanceId !== currentId) {
            Logger.debug(`Prompt Cache: saved instance (${savedInstanceId}) ≠ current (${currentId}), skipping restore`);
            return;
        }
        if (savedText === textarea.value) {
            Logger.debug('Prompt Cache: saved text already matches textarea, skipping restore');
            return;
        }

        const container = textarea.closest('.flex.flex-col.relative.rounded-md') || textarea.parentElement;
        const wrapper   = container ? container.parentElement : null;
        const section   = wrapper   ? wrapper.parentElement   : null;

        if (!section) {
            Logger.warn('Prompt Cache: could not locate section for restore buttons');
            return;
        }

        const hasPrevious = this.hasSavableContent(prevText) && prevText !== savedText;

        const wrapperEl = document.createElement('div');
        wrapperEl.setAttribute('data-fleet-prompt-cache-restore-wrapper', 'true');
        wrapperEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:6px;';

        if (!hasPrevious) {
            // Single button: no confirm step — click directly restores and dismisses
            const btn = this.makeRestoreBtn('Restore last saved prompt?');
            btn.addEventListener('click', () => {
                this.pastePreview(state, textarea, savedText);
                this.removeRestoreButtons(state);
                Logger.log('Prompt Cache: restored last saved prompt (single version)');
            });
            wrapperEl.appendChild(btn);
        } else {
            // Two buttons: toggle-select → confirm pattern
            const btn1 = this.makeRestoreBtn('Restore last saved prompt?');
            const btn2 = this.makeRestoreBtn('Restore previous to last saved prompt?');

            btn1.addEventListener('click', () => {
                if (state.selectedVersion === 'current') {
                    this.removeRestoreButtons(state);
                    Logger.log('Prompt Cache: confirmed restore of last saved prompt');
                } else {
                    this.pastePreview(state, textarea, savedText);
                    state.selectedVersion = 'current';
                    this.setBtnConfirm(btn1);
                    this.setBtnDefault(btn2);
                    Logger.debug('Prompt Cache: previewing last saved prompt');
                }
            });

            btn2.addEventListener('click', () => {
                if (state.selectedVersion === 'previous') {
                    this.removeRestoreButtons(state);
                    Logger.log('Prompt Cache: confirmed restore of previous prompt');
                } else {
                    this.pastePreview(state, textarea, prevText);
                    state.selectedVersion = 'previous';
                    this.setBtnConfirm(btn2);
                    this.setBtnDefault(btn1);
                    Logger.debug('Prompt Cache: previewing previous prompt');
                }
            });

            wrapperEl.appendChild(btn1);
            wrapperEl.appendChild(btn2);
        }

        section.insertBefore(wrapperEl, wrapper);
        state.restoreInjected    = true;
        state.restoreWrapperEl   = wrapperEl;
        state.restoreInitialText = textarea.value;
        state.selectedVersion    = null;
        Logger.info(`Prompt Cache: restore button(s) shown (hasPrev: ${hasPrevious}) for instance ${currentId}`);
    },

    pastePreview(state, textarea, text) {
        // Suppress the synthetic input event so our own paste doesn't trip the
        // "user typed something new → dismiss buttons" check.
        state.suppressRestoreCheck = true;
        this.setTextareaValueReactFriendly(textarea, text);
        state.suppressRestoreCheck = false;
    },

    makeRestoreBtn(label) {
        const btn = document.createElement('button');
        btn.type  = 'button';
        btn.setAttribute('data-fleet-prompt-cache-restore', 'true');
        btn.setAttribute('data-fleet-restore-label', label);
        btn.className   = 'fleet-prompt-cache-restore-btn';
        btn.textContent = label;
        return btn;
    },

    setBtnConfirm(btn) {
        btn.className   = 'fleet-prompt-cache-restore-btn fleet-prompt-cache-restore-btn--confirm';
        btn.textContent = 'Confirm Version';
    },

    setBtnDefault(btn) {
        btn.className   = 'fleet-prompt-cache-restore-btn';
        btn.textContent = btn.getAttribute('data-fleet-restore-label') || btn.textContent;
    },

    maybeRemoveRestoreButtonsAfterTyping(state) {
        if (!state.restoreInjected || !state.textarea) return;
        // Ignore the synthetic input event fired by our own preview paste
        if (state.suppressRestoreCheck) return;
        if (state.textarea.value === state.restoreInitialText) return;
        this.removeRestoreButtons(state);
        Logger.info('Prompt Cache: restore buttons removed after user changed prompt text');
    },

    removeRestoreButtons(state) {
        if (state.restoreWrapperEl && document.contains(state.restoreWrapperEl)) {
            state.restoreWrapperEl.remove();
        }
        state.restoreInjected    = false;
        state.restoreWrapperEl   = null;
        state.restoreInitialText = '';
        state.selectedVersion    = null;
    },

    // ─── status indicator ─────────────────────────────────────────────────────

    ensureStatusIndicator(state, textarea) {
        if (state.statusEl && document.contains(state.statusEl)) return;

        const container = textarea.closest('.flex.flex-col.relative.rounded-md') || textarea.parentElement;
        const wrapper   = container ? container.parentElement : null;
        const section   = wrapper   ? wrapper.parentElement   : null;
        if (!section) return;

        const labelRow = section.querySelector('.flex.items-center.justify-between');
        if (!labelRow) return;

        const labelDiv = labelRow.querySelector('.text-sm.text-muted-foreground.font-medium');
        if (!labelDiv) return;

        if (labelDiv.querySelector('[data-fleet-prompt-cache-status]')) return;

        const el = document.createElement('span');
        el.setAttribute('data-fleet-prompt-cache-status', 'true');
        el.style.cssText = 'display:inline-flex;align-items:center;margin-left:6px;vertical-align:middle;';
        labelDiv.appendChild(el);
        state.statusEl = el;

        // Re-render into the fresh element; reset current so setStatus will actually write
        const prev = state.statusCurrent;
        state.statusCurrent = null;
        const isSaved = state.lastSavedValue !== null && textarea.value === state.lastSavedValue;
        this.setStatus(state, prev !== null ? prev : (isSaved ? 'saved' : 'pending'));
    },

    setStatus(state, status) {
        // Only touch the DOM when status transitions — avoids restarting the spinner
        // animation and prevents DOM mutations near the textarea that can trigger
        // React to reconcile the form with a stale value.
        if (status === state.statusCurrent) return;
        state.statusCurrent = status;
        if (!state.statusEl) return;
        if (status === 'saved') {
            state.statusEl.title = 'Prompt saved';
            state.statusEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(34,197,94)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        } else {
            state.statusEl.title = 'Saving prompt…';
            state.statusEl.innerHTML = `<svg class="fleet-prompt-cache-spinner" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
        }
    },

    // ─── helpers ──────────────────────────────────────────────────────────────

    injectStyles() {
        if (document.getElementById('fleet-prompt-cache-styles')) return;
        const style = document.createElement('style');
        style.id = 'fleet-prompt-cache-styles';
        style.textContent = `
            @keyframes fleet-prompt-cache-spin {
                from { transform: rotate(0deg); }
                to   { transform: rotate(360deg); }
            }
            .fleet-prompt-cache-spinner {
                animation: fleet-prompt-cache-spin 1s linear infinite;
                display: block;
            }
            @keyframes fleet-prompt-cache-flash-yellow {
                0%, 100% {
                    border-color: rgba(234, 179, 8, 0.9);
                    box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.4);
                }
                50% {
                    border-color: rgba(234, 179, 8, 0.25);
                    box-shadow: 0 0 0 4px rgba(234, 179, 8, 0.15);
                }
            }
            .fleet-prompt-cache-restore-btn {
                display: block;
                width: 100%;
                text-align: center;
                padding: 6px 12px;
                font-size: 0.75rem;
                font-weight: 500;
                border-radius: 4px;
                cursor: pointer;
                background-color: transparent;
                color: inherit;
                border: 2px solid rgba(234, 179, 8, 0.9);
                animation: fleet-prompt-cache-flash-yellow 1.2s ease-in-out infinite;
                transition: background-color 0.15s, color 0.15s, border-color 0.15s;
            }
            .fleet-prompt-cache-restore-btn:hover {
                background-color: rgba(234, 179, 8, 0.08);
            }
            .fleet-prompt-cache-restore-btn--confirm {
                border-color: rgb(34, 197, 94);
                color: rgb(34, 197, 94);
                animation: none;
            }
            .fleet-prompt-cache-restore-btn--confirm:hover {
                background-color: rgba(34, 197, 94, 0.08);
            }
        `;
        document.head.appendChild(style);
        Logger.debug('Prompt Cache: styles injected');
    },

    setTextareaValueReactFriendly(textarea, value) {
        textarea.focus();
        const previousValue = textarea.value;
        const proto      = Object.getPrototypeOf(textarea);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
            descriptor.set.call(textarea, value);
        } else {
            textarea.value = value;
        }
        if (textarea._valueTracker && typeof textarea._valueTracker.setValue === 'function') {
            try { textarea._valueTracker.setValue(previousValue); } catch (_) { /* ignore */ }
        }
        textarea.dispatchEvent(new Event('input',  { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
};
