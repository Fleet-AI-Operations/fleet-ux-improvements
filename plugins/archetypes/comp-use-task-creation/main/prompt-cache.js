// ============= prompt-cache.js =============
// Auto-saves the prompt textarea content to local storage every 1 s (or 1 s after
// the user finishes typing, whichever fires later).  Keeps the two most-recent
// non-empty saves so the user can restore either on page reload.
// A live save-status indicator (spinner → checkmark) is injected next to the label.

const plugin = {
    id: 'promptCache',
    name: 'Prompt Cache',
    description: 'Auto-saves the prompt and offers to restore it when returning to the same task instance',
    _version: '4.0',
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
        statusEl:          null,
        statusCurrent:     null,   // 'pending' | 'saved' — only write DOM on transitions
        restoreInjected:   false,
        restoreWrapperEl:  null,
        restoreBtnCurrent: null,
        restoreBtnPrevious: null,
        restoreConfirmRowCurrent: null,
        restoreConfirmRowPrevious: null,
        selectedVersion:      null,  // 'current' | 'previous' — which slot is in confirm state
        promptBeforePreview:  null, // textarea value before restore preview
        suppressRestoreCheck: false, // true while plugin-driven paste fires its synthetic input
        restoreActivationLogged: false,
        stylesInjected:    false,
        missingLogged:     false
    },

    destroy(state) {
        this.maybeSave(state);
        this.teardown(state);
    },

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
        if (state.textarea && !state.restoreInjected) {
            this.ensureRestoreButtons(state, textarea);
        }
    },

    teardown(state) {
        if (state.saveDebounceTimer) { clearTimeout(state.saveDebounceTimer);  state.saveDebounceTimer = null; }
        state.textarea          = null;
        state.statusEl          = null;
        state.statusCurrent     = null;
        state.restoreInjected   = false;
        state.restoreWrapperEl  = null;
        state.restoreBtnCurrent = null;
        state.restoreBtnPrevious = null;
        state.restoreConfirmRowCurrent = null;
        state.restoreConfirmRowPrevious = null;
        state.selectedVersion   = null;
        state.promptBeforePreview = null;
        state.restoreActivationLogged = false;
    },

    setup(state, textarea) {
        const onInput = () => {
            if (!state.suppressRestoreCheck) {
                if (state.selectedVersion) {
                    state.selectedVersion = null;
                    state.promptBeforePreview = null;
                }
                this.refreshRestoreButtons(state, textarea);
            }
            this.setStatus(state, 'pending');
            if (state.saveDebounceTimer) clearTimeout(state.saveDebounceTimer);
            state.saveDebounceTimer = setTimeout(() => {
                this.save(state);
                state.saveDebounceTimer = null;
            }, 1000);
        };
        // registerEventListener also calls addEventListener internally
        CleanupRegistry.registerEventListener(textarea, 'input', onInput);

        const onChange = () => {
            if (!state.saveDebounceTimer) this.maybeSave(state);
        };
        CleanupRegistry.registerEventListener(textarea, 'change', onChange);

        const onVisibilityHide = () => {
            if (document.visibilityState === 'hidden') this.maybeSave(state);
        };
        CleanupRegistry.registerEventListener(document, 'visibilitychange', onVisibilityHide);

        this.ensureRestoreButtons(state, textarea);

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
        this.refreshRestoreButtons(state, state.textarea);
        Logger.debug(`Prompt Cache: saved ${val.length} chars (instance: ${instanceId})`);
    },

    hasSavableContent(value) {
        return typeof value === 'string' && value.trim().length > 0;
    },

    getCurrentInstanceId() {
        return new URLSearchParams(window.location.search).get('instance_id') || '';
    },

    // ─── restore buttons ──────────────────────────────────────────────────────

    getRestoreAvailability(textarea) {
        const savedText       = Storage.get(this.storageKeys.promptText,     '');
        const prevText        = Storage.get(this.storageKeys.promptPrevText,  '');
        const savedInstanceId = Storage.get(this.storageKeys.instanceId,      '');
        const currentId       = this.getCurrentInstanceId();
        const instanceOk      = Boolean(savedInstanceId && currentId && savedInstanceId === currentId);

        const currentMatchesTextbox = instanceOk && this.hasSavableContent(savedText) && savedText === textarea.value;

        return {
            instanceOk,
            savedText,
            prevText,
            currentMatchesTextbox,
            canCurrent: instanceOk && this.hasSavableContent(savedText) && savedText !== textarea.value,
            canPrevious: instanceOk && this.hasSavableContent(prevText) && prevText !== savedText && prevText !== textarea.value
        };
    },

    getRestoreText(version) {
        return version === 'current'
            ? Storage.get(this.storageKeys.promptText, '')
            : Storage.get(this.storageKeys.promptPrevText, '');
    },

    ensureRestoreButtons(state, textarea) {
        if (state.restoreInjected) {
            this.refreshRestoreButtons(state, textarea);
            return;
        }

        const container = textarea.closest('.flex.flex-col.relative.rounded-md') || textarea.parentElement;
        const wrapper   = container ? container.parentElement : null;
        const section   = wrapper   ? wrapper.parentElement   : null;

        if (!section) {
            Logger.warn('Prompt Cache: could not locate section for restore buttons');
            return;
        }

        const wrapperEl = document.createElement('div');
        wrapperEl.setAttribute('data-fleet-prompt-cache-restore-wrapper', 'true');
        wrapperEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:6px;';

        const bindRestoreSlot = (slotParts, version) => {
            const { restoreBtn, cancelBtn, confirmBtn } = slotParts;

            restoreBtn.addEventListener('click', () => {
                if (restoreBtn.disabled) return;

                const text = this.getRestoreText(version);
                if (!this.hasSavableContent(text)) return;

                state.promptBeforePreview = textarea.value;
                this.pastePreview(state, textarea, text);
                state.selectedVersion = version;
                this.refreshRestoreButtons(state, textarea);
                Logger.debug(`Prompt Cache: previewing ${version === 'current' ? 'last saved' : 'previous'} prompt`);
            });

            cancelBtn.addEventListener('click', () => {
                this.cancelRestorePreview(state, textarea);
                Logger.log(`Prompt Cache: cancelled restore preview (${version})`);
            });

            confirmBtn.addEventListener('click', () => {
                state.selectedVersion = null;
                state.promptBeforePreview = null;
                this.refreshRestoreButtons(state, textarea);
                Logger.log(`Prompt Cache: confirmed restore of ${version === 'current' ? 'last saved' : 'previous'} prompt`);
            });
        };

        const slotCurrent = this.buildRestoreSlot('Restore last saved prompt?', 'current');
        const slotPrevious = this.buildRestoreSlot('Restore previous to last saved prompt?', 'previous');
        bindRestoreSlot(slotCurrent, 'current');
        bindRestoreSlot(slotPrevious, 'previous');

        wrapperEl.appendChild(slotCurrent.slot);
        wrapperEl.appendChild(slotPrevious.slot);
        section.insertBefore(wrapperEl, wrapper);

        state.restoreInjected    = true;
        state.restoreWrapperEl   = wrapperEl;
        state.restoreBtnCurrent  = slotCurrent.restoreBtn;
        state.restoreBtnPrevious = slotPrevious.restoreBtn;
        state.restoreConfirmRowCurrent  = slotCurrent.confirmRow;
        state.restoreConfirmRowPrevious = slotPrevious.confirmRow;
        state.selectedVersion    = null;
        state.promptBeforePreview = null;

        this.refreshRestoreButtons(state, textarea);

        if (!state.restoreActivationLogged) {
            Logger.info(`Prompt Cache: restore buttons injected for instance ${this.getCurrentInstanceId() || '(none)'}`);
            state.restoreActivationLogged = true;
        }
    },

    refreshRestoreButtons(state, textarea) {
        if (!state.restoreBtnCurrent || !state.restoreBtnPrevious || !textarea) return;

        const { canCurrent, canPrevious, currentMatchesTextbox } = this.getRestoreAvailability(textarea);
        const currentDisabledHint = currentMatchesTextbox
            ? 'Cannot restore: saved version matches textbox'
            : null;

        if (state.selectedVersion === 'current') {
            this.showRestoreConfirm(state.restoreBtnCurrent, state.restoreConfirmRowCurrent);
            this.showRestoreDefault(state.restoreBtnPrevious, state.restoreConfirmRowPrevious, canPrevious);
            return;
        }

        if (state.selectedVersion === 'previous') {
            this.showRestoreConfirm(state.restoreBtnPrevious, state.restoreConfirmRowPrevious);
            this.showRestoreDefault(state.restoreBtnCurrent, state.restoreConfirmRowCurrent, canCurrent, currentDisabledHint);
            return;
        }

        this.showRestoreDefault(state.restoreBtnCurrent, state.restoreConfirmRowCurrent, canCurrent, currentDisabledHint);
        this.showRestoreDefault(state.restoreBtnPrevious, state.restoreConfirmRowPrevious, canPrevious);
    },

    buildRestoreSlot(label, version) {
        const slot = document.createElement('div');
        slot.className = 'fleet-prompt-cache-restore-slot';
        slot.setAttribute('data-fleet-restore-version', version);

        const restoreBtn = this.makeRestoreBtn(label, version);

        const restoreBtnWrap = document.createElement('div');
        restoreBtnWrap.className = 'fleet-prompt-cache-restore-btn-wrap';
        restoreBtnWrap.appendChild(restoreBtn);

        if (version === 'current') {
            restoreBtnWrap.addEventListener('mouseenter', () => {
                const hint = restoreBtn.getAttribute('data-fleet-disabled-hover-hint');
                if (restoreBtn.disabled && hint) restoreBtn.textContent = hint;
            });
            restoreBtnWrap.addEventListener('mouseleave', () => {
                if (restoreBtn.disabled) {
                    restoreBtn.textContent = restoreBtn.getAttribute('data-fleet-restore-label') || restoreBtn.textContent;
                }
            });
        }

        const confirmRow = document.createElement('div');
        confirmRow.className = 'fleet-prompt-cache-restore-confirm-row';
        confirmRow.setAttribute('data-fleet-prompt-cache-confirm-row', 'true');
        confirmRow.style.display = 'none';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'fleet-prompt-cache-restore-btn fleet-prompt-cache-restore-btn--cancel';
        cancelBtn.textContent = 'Cancel';

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'fleet-prompt-cache-restore-btn fleet-prompt-cache-restore-btn--confirm';
        confirmBtn.textContent = 'Confirm Version';

        confirmRow.append(cancelBtn, confirmBtn);
        slot.append(restoreBtnWrap, confirmRow);

        return { slot, restoreBtn, restoreBtnWrap, confirmRow, cancelBtn, confirmBtn };
    },

    showRestoreConfirm(restoreBtn, confirmRow) {
        if (!restoreBtn || !confirmRow) return;
        const wrap = restoreBtn.closest('.fleet-prompt-cache-restore-btn-wrap');
        if (wrap) wrap.style.display = 'none';
        confirmRow.style.display = 'flex';
    },

    showRestoreDefault(restoreBtn, confirmRow, enabled, disabledHoverHint) {
        if (!restoreBtn || !confirmRow) return;
        confirmRow.style.display = 'none';
        const wrap = restoreBtn.closest('.fleet-prompt-cache-restore-btn-wrap');
        if (wrap) wrap.style.display = 'block';
        this.setBtnDefault(restoreBtn);
        this.setBtnEnabled(restoreBtn, enabled, disabledHoverHint);
    },

    pastePreview(state, textarea, text) {
        state.suppressRestoreCheck = true;
        this.setTextareaValueReactFriendly(textarea, text);
        state.suppressRestoreCheck = false;
        this.refreshRestoreButtons(state, textarea);
    },

    makeRestoreBtn(label, version) {
        const btn = document.createElement('button');
        btn.type  = 'button';
        btn.setAttribute('data-fleet-prompt-cache-restore', 'true');
        btn.setAttribute('data-fleet-restore-version', version);
        btn.setAttribute('data-fleet-restore-label', label);
        btn.className   = 'fleet-prompt-cache-restore-btn fleet-prompt-cache-restore-btn--disabled';
        btn.disabled    = true;
        btn.textContent = label;
        return btn;
    },

    setBtnDefault(btn) {
        btn.classList.remove('fleet-prompt-cache-restore-btn--confirm', 'fleet-prompt-cache-restore-btn--cancel');
        btn.textContent = btn.getAttribute('data-fleet-restore-label') || btn.textContent;
        if (!btn.classList.contains('fleet-prompt-cache-restore-btn--disabled')) {
            btn.className = 'fleet-prompt-cache-restore-btn';
        }
    },

    setBtnEnabled(btn, enabled, disabledHoverHint) {
        if (enabled) {
            btn.disabled = false;
            btn.removeAttribute('data-fleet-disabled-hover-hint');
            btn.classList.remove('fleet-prompt-cache-restore-btn--disabled', 'fleet-prompt-cache-restore-btn--no-pointer');
            if (!btn.classList.contains('fleet-prompt-cache-restore-btn--confirm') &&
                !btn.classList.contains('fleet-prompt-cache-restore-btn--cancel')) {
                btn.className = 'fleet-prompt-cache-restore-btn';
            }
            return;
        }

        btn.disabled = true;
        btn.classList.remove('fleet-prompt-cache-restore-btn--confirm', 'fleet-prompt-cache-restore-btn--cancel');
        btn.className = 'fleet-prompt-cache-restore-btn fleet-prompt-cache-restore-btn--disabled';
        if (disabledHoverHint) {
            btn.setAttribute('data-fleet-disabled-hover-hint', disabledHoverHint);
            btn.classList.add('fleet-prompt-cache-restore-btn--no-pointer');
        } else {
            btn.removeAttribute('data-fleet-disabled-hover-hint');
            btn.classList.remove('fleet-prompt-cache-restore-btn--no-pointer');
        }
        btn.textContent = btn.getAttribute('data-fleet-restore-label') || btn.textContent;
    },

    cancelRestorePreview(state, textarea) {
        if (state.promptBeforePreview !== null && state.promptBeforePreview !== undefined) {
            this.pastePreview(state, textarea, state.promptBeforePreview);
        }
        state.selectedVersion = null;
        state.promptBeforePreview = null;
        this.refreshRestoreButtons(state, textarea);
    },

    removeRestoreButtons(state) {
        if (state.restoreWrapperEl && document.contains(state.restoreWrapperEl)) {
            state.restoreWrapperEl.remove();
        }
        state.restoreInjected   = false;
        state.restoreWrapperEl  = null;
        state.restoreBtnCurrent = null;
        state.restoreBtnPrevious = null;
        state.restoreConfirmRowCurrent = null;
        state.restoreConfirmRowPrevious = null;
        state.selectedVersion   = null;
        state.promptBeforePreview = null;
        state.restoreActivationLogged = false;
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
            state.statusEl.innerHTML = Context.uiLib && typeof Context.uiLib.spinnerHtml === 'function'
                ? Context.uiLib.spinnerHtml(14)
                : '<span class="fleet-ui-spinner" style="width:14px;height:14px;"></span>';
        }
    },

    // ─── helpers ──────────────────────────────────────────────────────────────

    injectStyles() {
        if (Context.uiLib && typeof Context.uiLib.ensureStyles === 'function') {
            Context.uiLib.ensureStyles();
        }
        if (document.getElementById('fleet-prompt-cache-styles')) return;
        const style = document.createElement('style');
        style.id = 'fleet-prompt-cache-styles';
        style.textContent = `
            .fleet-prompt-cache-restore-btn-wrap {
                display: block;
                width: 100%;
            }
            .fleet-prompt-cache-restore-btn--no-pointer {
                pointer-events: none;
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
                border: 1px solid var(--border, #e2e8f0);
                animation: none;
                transition: background-color 0.15s, color 0.15s, border-color 0.15s;
            }
            .fleet-prompt-cache-restore-btn:hover {
                background-color: color-mix(in srgb, var(--foreground, #111) 6%, transparent);
            }
            .fleet-prompt-cache-restore-btn--disabled,
            .fleet-prompt-cache-restore-btn:disabled {
                opacity: 0.45;
                cursor: not-allowed;
                color: var(--muted-foreground, #888);
                border-color: var(--border, #e2e8f0);
            }
            .fleet-prompt-cache-restore-btn--disabled:hover,
            .fleet-prompt-cache-restore-btn:disabled:hover {
                background-color: transparent;
            }
            .fleet-prompt-cache-restore-confirm-row {
                display: none;
                gap: 4px;
                width: 100%;
            }
            .fleet-prompt-cache-restore-confirm-row .fleet-prompt-cache-restore-btn {
                flex: 1;
                width: auto;
            }
            .fleet-prompt-cache-restore-btn--cancel {
                border-color: rgb(220, 38, 38);
                color: rgb(220, 38, 38);
                animation: none;
            }
            .fleet-prompt-cache-restore-btn--cancel:hover {
                background-color: rgba(220, 38, 38, 0.08);
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
