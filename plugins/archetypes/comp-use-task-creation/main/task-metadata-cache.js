// ============= task-metadata-cache.js =============
// Keeps the Task Metadata boxes (Crux, Intended outcome, Message requirements, …),
// Writer Notes and Scratchpad across page reloads and instance resets on computer-use
// task creation.
//
// Every edit is saved locally (debounced) under the current task's authoring
// reservation (falling back to the instance id). When the page loads again for
// the same task, any of those boxes that come back empty are refilled from the
// cache. Boxes that already have text are never overwritten, and clearing a box
// on purpose is remembered so it is not refilled.

const plugin = {
    id: 'taskMetadataCache',
    name: 'Task Metadata Cache',
    description: 'Saves the Task Metadata boxes, Writer Notes and Scratchpad as you type and refills them after a page reload or instance reset',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',

    storageKey: 'comp-use-task-metadata-cache',
    saveDelayMs: 800,
    maxEntries: 25,
    maxAgeMs: 14 * 24 * 60 * 60 * 1000,
    restoreVerifyDelaysMs: [400, 1500, 3000],
    resetRecheckDelaysMs: [500, 1000, 2000, 4000, 8000],
    panelFields: {
        'Writer Notes': 'writer-notes',
        'Scratchpad': 'scratchpad'
    },

    initialState: {
        cacheKey: null,
        fields: null,           // key -> field state
        stylesInjected: false,
        globalListenersBound: false,
        missingLogged: false,
        activationLogged: false
    },

    destroy(state) {
        this.flushAll(state);
        this.clearFieldTimers(state);
        state.fields = null;
        state.cacheKey = null;
    },

    onMutation(state) {
        const cacheKey = this.getCacheKey();
        if (!cacheKey) return;

        if (state.cacheKey !== cacheKey) {
            // New task (or first run): drop per-field state from any previous task.
            this.flushAll(state);
            this.clearFieldTimers(state);
            state.cacheKey = cacheKey;
            state.fields = {};
            state.activationLogged = false;
        }

        if (!state.stylesInjected) {
            this.injectStyles();
            state.stylesInjected = true;
        }

        if (!state.globalListenersBound) {
            const flush = () => this.flushAll(state);
            CleanupRegistry.registerEventListener(document, 'visibilitychange', () => {
                if (document.visibilityState === 'hidden') flush();
            });
            CleanupRegistry.registerEventListener(window, 'pagehide', flush);
            CleanupRegistry.registerEventListener(window, 'beforeunload', flush);
            // Reset Instance may empty the boxes without reloading or re-mounting them.
            // Re-check for a few seconds after it is clicked and refill boxes that came back empty.
            CleanupRegistry.registerEventListener(document, 'click', (e) => {
                const btn = e.target && e.target.closest ? e.target.closest('button') : null;
                if (!btn || !/^\s*reset(\s+instance)?\s*$/i.test(btn.textContent || '')) return;
                this.flushAll(state);
                for (const delay of this.resetRecheckDelaysMs) {
                    setTimeout(() => this.refillEmptied(state), delay);
                }
                Logger.debug('Task Metadata Cache: Reset clicked, re-checking fields');
            }, true);
            state.globalListenersBound = true;
        }

        const found = this.findFields();
        if (found.length === 0) {
            if (!state.missingLogged) {
                Logger.debug('Task Metadata Cache: metadata / writer notes fields not found yet');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        for (const f of found) {
            let field = state.fields[f.key];
            if (field && field.textarea === f.textarea) {
                this.ensureStatusIndicator(field, f.labelEl);
                continue;
            }
            if (field) this.clearFieldTimer(field);
            field = {
                key: f.key,
                label: f.label,
                textarea: f.textarea,
                labelEl: f.labelEl,
                saveTimer: null,
                verifyTimers: [],
                statusEl: null,
                statusCurrent: null,
                restoredValue: null,
                userEdited: false,
                suppressInput: false
            };
            state.fields[f.key] = field;
            this.bindField(state, field);
            this.ensureStatusIndicator(field, f.labelEl);
            this.maybeRestore(state, field);
        }

        if (!state.activationLogged) {
            Logger.info(`Task Metadata Cache: watching ${found.length} field(s) for ${cacheKey}`);
            state.activationLogged = true;
        }
    },

    // ─── field discovery ──────────────────────────────────────────────────────

    findFields() {
        const out = [];
        const seen = new Set();

        // Task Metadata card: <h3>Task Metadata</h3> … <label>Crux*</label><textarea>
        const headings = document.querySelectorAll('h3');
        for (const h3 of headings) {
            if (this.cleanLabel(h3.textContent) !== 'Task Metadata') continue;
            const card = h3.closest('.rounded-lg') || (h3.parentElement && h3.parentElement.parentElement);
            if (!card) continue;
            for (const label of card.querySelectorAll('label')) {
                const name = this.cleanLabel(label.textContent);
                if (!name) continue;
                const container = label.closest('.space-y-2') || label.parentElement;
                const ta = container && container.querySelector('textarea');
                if (!ta || seen.has(ta)) continue;
                seen.add(ta);
                out.push({ key: 'meta:' + name, label: name, textarea: ta, labelEl: label });
            }
        }

        // Writer Notes / Scratchpad panels: <div class="text-sm text-muted-foreground font-medium">Writer Notes</div>
        const panelLabels = document.querySelectorAll('.text-sm.text-muted-foreground.font-medium');
        for (const labelEl of panelLabels) {
            const name = this.cleanLabel(labelEl.textContent);
            const key = this.panelFields[name];
            if (!key) continue;
            const section = labelEl.closest('.relative.space-y-2') || labelEl.closest('.space-y-2');
            const ta = section && section.querySelector('textarea');
            if (!ta || seen.has(ta)) continue;
            seen.add(ta);
            out.push({ key, label: name, textarea: ta, labelEl });
        }

        return out;
    },

    cleanLabel(text) {
        // Strip required-asterisks and anything this plugin appended to the label.
        return String(text || '')
            .replace(/\*/g, '')
            .replace(/\s*Restored\s*$/i, '')
            .trim();
    },

    // ─── cache key / storage ──────────────────────────────────────────────────

    getCacheKey() {
        const params = new URLSearchParams(window.location.search);
        const reservation = params.get('authoring_reservation_id');
        if (reservation) return 'reservation:' + reservation;
        const instance = params.get('instance_id');
        if (instance) return 'instance:' + instance;
        return null;
    },

    readCache() {
        const raw = Storage.get(this.storageKey, '');
        if (!raw) return {};
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            Logger.warn('Task Metadata Cache: could not parse cache, starting fresh');
            return {};
        }
    },

    writeCache(cache) {
        const now = Date.now();
        const entries = Object.entries(cache)
            .filter(([, entry]) => entry && typeof entry.savedAt === 'number' && now - entry.savedAt <= this.maxAgeMs)
            .sort((a, b) => b[1].savedAt - a[1].savedAt)
            .slice(0, this.maxEntries);
        Storage.set(this.storageKey, JSON.stringify(Object.fromEntries(entries)));
    },

    getCachedValue(cacheKey, fieldKey) {
        const entry = this.readCache()[cacheKey];
        if (!entry || !entry.fields) return null;
        const value = entry.fields[fieldKey];
        return typeof value === 'string' ? value : null;
    },

    saveField(state, field) {
        if (!state.cacheKey || !field.textarea) return;
        const cache = this.readCache();
        const entry = cache[state.cacheKey] || { fields: {} };
        entry.fields = entry.fields || {};
        entry.fields[field.key] = field.textarea.value;
        entry.savedAt = Date.now();
        cache[state.cacheKey] = entry;
        this.writeCache(cache);
        this.setStatus(field, 'saved');
        Logger.debug(`Task Metadata Cache: saved "${field.label}" (${field.textarea.value.length} chars)`);
    },

    // ─── binding / saving ─────────────────────────────────────────────────────

    bindField(state, field) {
        const onInput = () => {
            if (field.suppressInput) return;
            field.userEdited = true;
            this.cancelVerify(field);
            this.setStatus(field, 'pending');
            this.clearFieldTimer(field);
            field.saveTimer = setTimeout(() => {
                field.saveTimer = null;
                this.saveField(state, field);
            }, this.saveDelayMs);
        };
        CleanupRegistry.registerEventListener(field.textarea, 'input', onInput);
        CleanupRegistry.registerEventListener(field.textarea, 'blur', () => this.flushField(state, field));
    },

    flushField(state, field) {
        if (!field.saveTimer) return;
        this.clearFieldTimer(field);
        this.saveField(state, field);
    },

    flushAll(state) {
        if (!state.fields) return;
        for (const field of Object.values(state.fields)) this.flushField(state, field);
    },

    clearFieldTimer(field) {
        if (field.saveTimer) {
            clearTimeout(field.saveTimer);
            field.saveTimer = null;
        }
    },

    cancelVerify(field) {
        for (const t of field.verifyTimers) clearTimeout(t);
        field.verifyTimers = [];
    },

    clearFieldTimers(state) {
        if (!state.fields) return;
        for (const field of Object.values(state.fields)) {
            this.clearFieldTimer(field);
            this.cancelVerify(field);
        }
    },

    // ─── restore ──────────────────────────────────────────────────────────────

    maybeRestore(state, field) {
        const cached = this.getCachedValue(state.cacheKey, field.key);
        if (!cached || !cached.trim()) {
            this.setStatus(field, null);
            return;
        }
        if (field.textarea.value.trim()) {
            // Never overwrite text that is already there.
            this.setStatus(field, field.textarea.value === cached ? 'saved' : null);
            return;
        }

        this.applyValue(field, cached);
        field.restoredValue = cached;
        this.setStatus(field, 'saved');
        this.showRestoredBadge(field);
        Logger.log(`Task Metadata Cache: restored "${field.label}" (${cached.length} chars)`);

        // React can wipe the value if it hydrates/re-renders after we fill it;
        // re-apply a few times until it sticks or the user starts typing.
        for (const delay of this.restoreVerifyDelaysMs) {
            field.verifyTimers.push(setTimeout(() => {
                if (field.userEdited || !document.contains(field.textarea)) return;
                if (field.textarea.value === '' && field.restoredValue) {
                    this.applyValue(field, field.restoredValue);
                    Logger.debug(`Task Metadata Cache: re-applied "${field.label}" after it was reset`);
                }
            }, delay));
        }
    },

    refillEmptied(state) {
        if (!state.fields || !state.cacheKey) return;
        for (const f of this.findFields()) {
            const field = state.fields[f.key];
            // A re-mounted box is picked up (and restored) by onMutation instead.
            if (!field || field.textarea !== f.textarea) continue;
            const ta = field.textarea;
            if (ta.value !== '' || document.activeElement === ta || field.saveTimer) continue;
            const cached = this.getCachedValue(state.cacheKey, field.key);
            if (!cached || !cached.trim()) continue;
            this.applyValue(field, cached);
            this.setStatus(field, 'saved');
            this.showRestoredBadge(field);
            Logger.log(`Task Metadata Cache: refilled "${field.label}" after reset`);
        }
    },

    applyValue(field, value) {
        field.suppressInput = true;
        try {
            this.setTextareaValueReactFriendly(field.textarea, value);
        } finally {
            field.suppressInput = false;
        }
    },

    setTextareaValueReactFriendly(textarea, value) {
        const previousValue = textarea.value;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        if (descriptor && descriptor.set) {
            descriptor.set.call(textarea, value);
        } else {
            textarea.value = value;
        }
        if (textarea._valueTracker && typeof textarea._valueTracker.setValue === 'function') {
            try { textarea._valueTracker.setValue(previousValue); } catch (_) { /* ignore */ }
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
    },

    // ─── status indicator ─────────────────────────────────────────────────────

    ensureStatusIndicator(field, labelEl) {
        if (field.statusEl && document.contains(field.statusEl)) return;
        if (!labelEl) return;
        const existing = labelEl.querySelector('[data-fleet-metadata-cache-status]');
        const el = existing || document.createElement('span');
        if (!existing) {
            el.setAttribute('data-fleet-metadata-cache-status', 'true');
            el.className = 'fleet-metadata-cache-status';
            labelEl.appendChild(el);
        }
        field.statusEl = el;
        const prev = field.statusCurrent;
        field.statusCurrent = undefined;
        this.setStatus(field, prev === undefined ? null : prev);
    },

    setStatus(field, status) {
        if (status === field.statusCurrent) return;
        field.statusCurrent = status;
        const el = field.statusEl;
        if (!el) return;
        if (status === 'saved') {
            el.title = `${field.label} saved locally`;
            el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgb(34,197,94)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        } else if (status === 'pending') {
            el.title = `Saving ${field.label}…`;
            el.innerHTML = Context.uiLib && typeof Context.uiLib.spinnerHtml === 'function'
                ? Context.uiLib.spinnerHtml(12)
                : '<span class="fleet-ui-spinner" style="width:12px;height:12px;"></span>';
        } else {
            el.title = '';
            el.innerHTML = '';
        }
    },

    showRestoredBadge(field) {
        if (!field.labelEl || field.labelEl.querySelector('[data-fleet-metadata-cache-restored]')) return;
        const badge = document.createElement('span');
        badge.setAttribute('data-fleet-metadata-cache-restored', 'true');
        badge.className = 'fleet-metadata-cache-restored';
        badge.textContent = 'Restored';
        badge.title = 'Refilled from your last saved text for this task';
        field.labelEl.appendChild(badge);
        setTimeout(() => badge.classList.add('fleet-metadata-cache-restored--fade'), 6000);
        setTimeout(() => badge.remove(), 7000);
    },

    injectStyles() {
        if (Context.uiLib && typeof Context.uiLib.ensureStyles === 'function') {
            Context.uiLib.ensureStyles();
        }
        if (document.getElementById('fleet-metadata-cache-styles')) return;
        const style = document.createElement('style');
        style.id = 'fleet-metadata-cache-styles';
        style.textContent = `
            .fleet-metadata-cache-status {
                display: inline-flex;
                align-items: center;
                margin-left: 6px;
                vertical-align: middle;
            }
            .fleet-metadata-cache-restored {
                display: inline-block;
                margin-left: 6px;
                padding: 0 6px;
                border-radius: 9999px;
                border: 1px solid rgba(34, 197, 94, 0.5);
                color: rgb(34, 197, 94);
                font-size: 0.675rem;
                font-weight: 500;
                line-height: 1.4;
                vertical-align: middle;
                transition: opacity 0.8s ease;
            }
            .fleet-metadata-cache-restored--fade {
                opacity: 0;
            }
        `;
        document.head.appendChild(style);
    }
};
