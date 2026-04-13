// ============= clipboard-autofill.js =============
// Create Instance dashboard: autofill from JSON clipboard (env, version, env vars) and optional autocreate.

const plugin = {
    id: 'dashboardCreateInstanceClipboardAutofill',
    name: 'Create Instance Clipboard Autofill',
    description:
        'Adds Autofill & Create Instance from clipboard JSON, optional Always Autocreate, using combobox keyboard navigation like workflow cache.',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',

    storageKeys: {
        alwaysAutocreate: 'dashboard-create-instance-always-autocreate'
    },

    initialState: {
        missingLogged: false,
        uiRoot: null,
        toolbarInjected: false,
        autofillInProgress: false,
        autocreateDoneForNav: false,
        clipboardRetryListeners: false,
        autocreateFromMutationAttempted: false,
        _pendingAutocreateRaf: false
    },

    onMutation(state) {
        const root = this.findCreatePageRoot();
        if (!root) {
            if (!state.missingLogged) {
                Logger.debug('Create Instance clipboard autofill: Create Instance page root not found');
                state.missingLogged = true;
            }
            state.uiRoot = null;
            state.toolbarInjected = false;
            return;
        }

        state.missingLogged = false;

        if (state.uiRoot !== root) {
            state.uiRoot = root;
            state.toolbarInjected = false;
            state.autocreateDoneForNav = false;
            state.autocreateFromMutationAttempted = false;
            state.clipboardRetryListeners = false;
        }

        if (!state.toolbarInjected) {
            this.injectToolbar(state, root);
            state.toolbarInjected = true;
        }

        if (Storage.get(this.storageKeys.alwaysAutocreate, false)) {
            this.ensureClipboardRetryListeners(state, root);
            this.scheduleClipboardAutocreateAttempt(state, root, 'mutation');
        }
    },

    findCreatePageRoot() {
        const headings = document.querySelectorAll('h2');
        for (const h2 of headings) {
            if ((h2.textContent || '').replace(/\s+/g, ' ').trim() !== 'Create Instance') continue;
            let el = h2.parentElement;
            for (let i = 0; i < 10 && el; i++) {
                if (el.classList && el.classList.contains('max-w-[28rem]')) return el;
                el = el.parentElement;
            }
            return h2.parentElement;
        }
        return null;
    },

    findBackLink(root) {
        return root.querySelector('a[href="/dashboard/instances"]');
    },

    injectToolbar(state, root) {
        if (root.querySelector('[data-fleet-create-instance-autofill-toolbar]')) return;

        const back = this.findBackLink(root);
        if (!back) {
            Logger.warn('Create Instance clipboard autofill: Back link not found, toolbar not injected');
            return;
        }

        const wrap = document.createElement('div');
        wrap.setAttribute('data-fleet-create-instance-autofill-toolbar', 'true');
        wrap.className = 'flex flex-wrap items-center gap-3 mb-3';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
            'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm px-3 text-xs';
        btn.textContent = 'Autofill & Create Instance';
        btn.addEventListener('click', () => {
            this.runAutofillPipeline(state, root, { submit: true, source: 'button' });
        });

        const toggleWrap = document.createElement('label');
        toggleWrap.className = 'inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'rounded border-input';
        checkbox.checked = Storage.get(this.storageKeys.alwaysAutocreate, false);
        checkbox.addEventListener('change', () => {
            Storage.set(this.storageKeys.alwaysAutocreate, checkbox.checked);
            Logger.info('Create Instance clipboard autofill: Always Autocreate ' + (checkbox.checked ? 'on' : 'off'));
            if (checkbox.checked) {
                this.runAutofillPipeline(state, root, { submit: true, source: 'toggle-on' });
            }
        });

        const toggleText = document.createElement('span');
        toggleText.textContent = 'Always Autocreate';

        toggleWrap.appendChild(checkbox);
        toggleWrap.appendChild(toggleText);

        wrap.appendChild(btn);
        wrap.appendChild(toggleWrap);

        back.insertAdjacentElement('afterend', wrap);
        Logger.info('Create Instance clipboard autofill: toolbar injected');
    },

    ensureClipboardRetryListeners(state, root) {
        if (state.clipboardRetryListeners) return;
        state.clipboardRetryListeners = true;

        const tryRetry = (reason) => {
            if (!Storage.get(this.storageKeys.alwaysAutocreate, false)) return;
            if (state.autocreateDoneForNav || state.autofillInProgress) return;
            this.scheduleClipboardAutocreateAttempt(state, root, reason);
        };

        const onFocus = () => tryRetry('focus');
        const onVisibility = () => {
            if (document.visibilityState === 'visible') tryRetry('visibility');
        };

        CleanupRegistry.registerEventListener(window, 'focus', onFocus);
        CleanupRegistry.registerEventListener(document, 'visibilitychange', onVisibility);
    },

    scheduleClipboardAutocreateAttempt(state, root, reason) {
        if (state.autofillInProgress || state.autocreateDoneForNav) return;
        if (reason === 'mutation' && state.autocreateFromMutationAttempted) return;
        if (state._pendingAutocreateRaf) return;
        state._pendingAutocreateRaf = true;
        requestAnimationFrame(() => {
            state._pendingAutocreateRaf = false;
            if (reason === 'mutation') state.autocreateFromMutationAttempted = true;
            this.tryAutocreateFromClipboard(state, root, reason);
        });
    },

    async tryAutocreateFromClipboard(state, root, reason) {
        if (!Storage.get(this.storageKeys.alwaysAutocreate, false)) return;
        if (state.autofillInProgress || state.autocreateDoneForNav) return;

        const text = await this.readClipboardText();
        if (text == null) {
            Logger.debug('Create Instance clipboard autofill: clipboard read skipped or denied (' + reason + ')');
            return;
        }

        const payload = this.parseInstancePayload(text);
        if (!payload) {
            Logger.debug('Create Instance clipboard autofill: clipboard has no valid instance payload (' + reason + ')');
            return;
        }

        await this.runAutofillPipeline(state, root, { submit: true, source: 'autocreate-' + reason, payload });
    },

    async readClipboardText() {
        if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
            Logger.warn('Create Instance clipboard autofill: clipboard API unavailable');
            return null;
        }
        try {
            return await navigator.clipboard.readText();
        } catch (e) {
            Logger.debug('Create Instance clipboard autofill: readText failed (may need user gesture)', e);
            return null;
        }
    },

    parseInstancePayload(text) {
        if (!text || typeof text !== 'string') return null;
        const trimmed = text.trim();
        if (!trimmed.startsWith('{')) return null;
        try {
            const o = JSON.parse(trimmed);
            if (!this.isValidPayload(o)) return null;
            return o;
        } catch (e) {
            return null;
        }
    },

    isValidPayload(o) {
        if (!o || typeof o !== 'object') return false;
        if (typeof o.env_key !== 'string' || !o.env_key.trim()) return false;
        if (typeof o.data_version !== 'string' || !o.data_version.trim()) return false;
        if (!o.env_variables || typeof o.env_variables !== 'object') return false;
        if (o.version !== undefined && o.version !== null && typeof o.version !== 'string') return false;
        if (o.data_key !== undefined && o.data_key !== null && typeof o.data_key !== 'string') return false;
        return true;
    },

    async runAutofillPipeline(state, root, options) {
        const submit = !!options.submit;
        const source = options.source || 'unknown';

        if (state.autofillInProgress) {
            Logger.warn('Create Instance clipboard autofill: already in progress');
            return;
        }

        state.autofillInProgress = true;
        Logger.info('Create Instance clipboard autofill: pipeline start (' + source + ')');

        try {
            let payload = options.payload;
            if (!payload) {
                const text = await this.readClipboardText();
                if (text == null) {
                    Logger.error('Create Instance clipboard autofill: could not read clipboard');
                    return;
                }
                payload = this.parseInstancePayload(text);
                if (!payload) {
                    Logger.error('Create Instance clipboard autofill: clipboard JSON invalid or missing required fields');
                    return;
                }
            }

            const envCombo = this.findEnvCombobox(root);
            if (!envCombo) {
                Logger.error('Create Instance clipboard autofill: environment combobox not found');
                return;
            }

            await this.selectComboboxOption(envCombo, payload.env_key, { matchEnvKey: true });
            await this.waitForVersionSection(root);
            const verCombo = this.findVersionCombobox(root);
            if (!verCombo) {
                Logger.error('Create Instance clipboard autofill: version combobox not found');
                return;
            }

            await this.wait(150);
            await this.selectComboboxOption(verCombo, null, { matchVersionPayload: true, payload });
            await this.wait(200);

            const envOk = await this.strictReconcileEnvVariables(root, payload.env_variables);
            if (!envOk) {
                Logger.error('Create Instance clipboard autofill: env variables did not match clipboard (strict check failed); not submitting');
                return;
            }

            if (submit) {
                const createBtn = this.findCreateButton(root);
                if (!createBtn || createBtn.disabled || createBtn.getAttribute('aria-disabled') === 'true') {
                    Logger.error('Create Instance clipboard autofill: Create button missing or disabled');
                    return;
                }
                createBtn.click();
                state.autocreateDoneForNav = true;
                Logger.log('Create Instance clipboard autofill: Create clicked');
            }
        } catch (e) {
            Logger.error('Create Instance clipboard autofill: pipeline failed', e);
        } finally {
            state.autofillInProgress = false;
            Logger.info('Create Instance clipboard autofill: pipeline end (' + source + ')');
        }
    },

    findEnvCombobox(root) {
        const labels = Array.from(root.querySelectorAll('label'));
        const lab = labels.find(l => (l.textContent || '').includes('Select Environment'));
        if (!lab) return null;
        const id = lab.getAttribute('for');
        if (id) {
            const byId = document.getElementById(id);
            if (byId && byId.getAttribute('role') === 'combobox') return byId;
        }
        const container = lab.parentElement;
        return container ? container.querySelector('[role="combobox"]') : null;
    },

    findVersionCombobox(root) {
        const labels = Array.from(root.querySelectorAll('label'));
        const lab = labels.find(l => (l.textContent || '').replace(/\s+/g, ' ').trim() === 'Version Configuration');
        if (!lab) return null;
        const container = lab.parentElement;
        return container ? container.querySelector('[role="combobox"]') : null;
    },

    /** Word-boundary match for data_version (e.g. v0.0.23) inside option text. */
    optionTextContainsDataVersion(fullText, dataVersion) {
        const dv = String(dataVersion || '').trim();
        if (!dv) return false;
        const escaped = dv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`, 'i').test(String(fullText || '').replace(/\s+/g, ' '));
    },

    /** Parse primary row version from cmdk option (e.g. v0.0.59). Higher = newer for tie-break. */
    parsePrimaryVersionFromOption(opt) {
        const span = opt.querySelector('span.font-medium.text-foreground');
        const t = (span?.textContent || '').trim();
        const m = t.match(/(\d+)\.(\d+)\.(\d+)/);
        if (!m) return [0, 0, 0];
        return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
    },

    comparePrimaryVersionDesc(a, b) {
        const va = this.parsePrimaryVersionFromOption(a);
        const vb = this.parsePrimaryVersionFromOption(b);
        for (let i = 0; i < 3; i++) {
            if (va[i] !== vb[i]) return vb[i] - va[i];
        }
        return 0;
    },

    /**
     * Version dropdown rows: subtitle line contains "{data_key} {data_version} • …" (see cmdk options).
     * Match primarily on data_version; optional payload.version tie-breaks duplicate rows.
     */
    versionOptionMatchScore(opt, payload) {
        const full = (opt.textContent || '').replace(/\s+/g, ' ').trim();
        const dv = (payload.data_version || '').trim();
        if (!dv || !this.optionTextContainsDataVersion(full, dv)) return 0;

        let score = 100;
        const span = opt.querySelector('span.font-medium.text-foreground');
        const primaryText = (span?.textContent || '').trim();
        const pv = (payload.version || '').trim().toLowerCase();
        if (pv && primaryText) {
            const pDigits = pv.replace(/^mcp/i, '').replace(/[^0-9.]/g, '');
            const tDigits = primaryText.toLowerCase().replace(/[^0-9.]/g, '');
            if (pDigits.length >= 3 && (tDigits.includes(pDigits) || pDigits.includes(tDigits))) {
                score += 25;
            }
        }
        return score;
    },

    async waitForVersionSection(root, timeoutMs = 8000) {
        const deadline = Date.now() + timeoutMs;
        return new Promise((resolve, reject) => {
            const check = () => {
                const combo = this.findVersionCombobox(root);
                if (combo) {
                    observer.disconnect();
                    resolve();
                    return;
                }
                if (Date.now() >= deadline) {
                    observer.disconnect();
                    reject(new Error('version section timeout'));
                }
            };
            const observer = new MutationObserver(check);
            observer.observe(root, { childList: true, subtree: true });
            check();
        });
    },

    normalizeMatch(s) {
        return (s || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    },

    /**
     * Insert word boundaries before camelCase / PascalCase transitions so
     * "FosOperations" and "fos-operations" share the same compact form.
     */
    splitCamelCaseWords(s) {
        return String(s || '')
            .trim()
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    },

    /** Lowercase letters/digits only, after camelCase + separator normalization. */
    envKeySemanticCompact(s) {
        return this.splitCamelCaseWords(s)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
    },

    /** Tokens for fuzzy checks (kebab, snake, camel, and UI spacing). */
    envKeyMatchTokens(s) {
        return this.splitCamelCaseWords(s)
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter(t => t.length > 0);
    },

    envKeyMatchScore(optionText, envKey) {
        const textRaw = (optionText || '').replace(/\s+/g, ' ').trim();
        const t = this.normalizeMatch(textRaw);
        const k = this.normalizeMatch(envKey);

        const optCompact = this.envKeySemanticCompact(textRaw);
        const keyCompact = this.envKeySemanticCompact(envKey);

        if (t === k) return 100;
        if (optCompact && keyCompact && optCompact === keyCompact) return 99;

        if (optCompact && keyCompact) {
            if (optCompact.includes(keyCompact) && keyCompact.length >= 3) return 95;
            if (keyCompact.includes(optCompact) && optCompact.length >= 3) return 94;
        }

        const keyToks = this.envKeyMatchTokens(envKey);
        const optToks = this.envKeyMatchTokens(textRaw);
        const optLower = t;
        if (keyToks.length >= 2 && keyToks.every(tok => tok.length >= 2 && optLower.includes(tok))) {
            return 90;
        }
        if (keyToks.length >= 2 && optToks.length >= keyToks.length) {
            let ki = 0;
            for (const ot of optToks) {
                if (ki < keyToks.length && (ot === keyToks[ki] || ot.startsWith(keyToks[ki]) || keyToks[ki].startsWith(ot))) {
                    ki++;
                }
            }
            if (ki === keyToks.length) return 87;
        }

        const kLegacy = k.replace(/[^a-z0-9]/g, '');
        const tLegacy = t.replace(/[^a-z0-9]/g, '');
        if (t.includes(k)) return 86;
        if (k.includes(t)) return 85;
        if (tLegacy && kLegacy && tLegacy.includes(kLegacy)) return 82;
        if (tLegacy && kLegacy && kLegacy.includes(tLegacy)) return 81;
        return 0;
    },

    async selectComboboxOption(btn, desiredRaw, opts) {
        const matchEnvKey = !!(opts && opts.matchEnvKey);
        const matchVersionPayload = !!(opts && opts.matchVersionPayload);
        const payload = opts && opts.payload;
        const desired = String(desiredRaw || '').trim();
        if (!btn) return false;
        if (!matchVersionPayload && !desired) return false;
        if (matchVersionPayload && !payload) return false;

        btn.focus();
        await this.wait(15);
        btn.click();
        await this.wait(80);

        let listbox = await this.waitForListbox(btn, 600);
        if (!listbox) {
            await this.pressKey(btn, 'Enter');
            await this.wait(80);
            listbox = await this.waitForListbox(btn, 600);
        }

        let options = listbox ? Array.from(listbox.querySelectorAll('[role="option"]')) : this.findVisibleOptionsGlobally();
        if (!options.length) {
            Logger.warn('Create Instance clipboard autofill: no options for combobox');
            return false;
        }

        if (!listbox && options[0] && typeof options[0].focus === 'function') {
            try {
                options[0].focus();
            } catch (e) {
                Logger.debug('Create Instance clipboard autofill: option focus failed', e);
            }
        }

        const norm = (s) => this.normalizeMatch(s);
        const desiredNorm = norm(desired);

        const minScore = matchVersionPayload ? 100 : 50;
        const scored = options.map((opt, i) => {
            const text = (opt.textContent || '').replace(/\s+/g, ' ').trim();
            let score = 0;
            if (matchEnvKey) {
                score = this.envKeyMatchScore(text, desired);
            } else if (matchVersionPayload && payload) {
                score = this.versionOptionMatchScore(opt, payload);
            } else {
                const n = norm(text);
                if (n === desiredNorm) score = 100;
                else if (n.includes(desiredNorm)) score = 90;
                else if (desiredNorm.includes(n) && n.length > 5) score = 82;
            }
            return { i, score, opt, text };
        });

        scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (matchVersionPayload) return this.comparePrimaryVersionDesc(a.opt, b.opt);
            return a.i - b.i;
        });

        const best = scored[0];
        if (!best || best.score < minScore) {
            const label = matchVersionPayload ? `data_version ${payload.data_version}` : desired;
            Logger.warn('Create Instance clipboard autofill: no matching option for: ' + label);
            return false;
        }

        const targetIndex = best.i;

        const listboxEl = listbox || options[0].closest('[role="listbox"]');
        let currentIndex = this.getHighlightedOptionIndex(listboxEl);

        let delta = currentIndex < 0 ? targetIndex + 1 : targetIndex - currentIndex;
        let keyTarget = document.activeElement || btn;
        for (let k = 0; k < Math.abs(delta); k++) {
            await this.pressKey(keyTarget, delta > 0 ? 'ArrowDown' : 'ArrowUp');
            await this.wait(10);
            keyTarget = document.activeElement || keyTarget;
        }
        await this.wait(15);
        await this.pressKey(document.activeElement || keyTarget, 'Enter');
        await this.wait(120);
        return true;
    },

    findVisibleOptionsGlobally() {
        return Array.from(document.querySelectorAll('[role="option"]')).filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });
    },

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    waitForListbox(dropdown, maxWaitMs) {
        const id = dropdown && dropdown.getAttribute('aria-controls');
        if (!id) return Promise.resolve(null);
        const start = Date.now();
        const poll = () => {
            const el = document.getElementById(id);
            if (el) return Promise.resolve(el);
            if (Date.now() - start >= maxWaitMs) return Promise.resolve(null);
            return this.wait(10).then(poll);
        };
        return poll();
    },

    async pressKey(target, key) {
        if (!target) return;
        const code =
            key === 'Enter'
                ? 'Enter'
                : key === 'ArrowDown'
                  ? 'ArrowDown'
                  : key === 'ArrowUp'
                    ? 'ArrowUp'
                    : key === 'Escape'
                      ? 'Escape'
                      : key;
        target.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }));
        await this.wait(3);
        target.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true, cancelable: true }));
    },

    getHighlightedOptionIndex(listbox) {
        if (!listbox) return -1;
        const options = Array.from(listbox.querySelectorAll('[role="option"]'));
        const idx = options.findIndex(
            opt => opt.hasAttribute('data-highlighted') || opt.getAttribute('aria-selected') === 'true'
        );
        return idx >= 0 ? idx : -1;
    },

    findAdvancedButton(root) {
        return Array.from(root.querySelectorAll('button')).find(b =>
            (b.textContent || '').includes('Advanced configurations')
        );
    },

    isAdvancedOpen(root) {
        return Array.from(root.querySelectorAll('label')).some(
            l => (l.textContent || '').trim() === 'Region'
        );
    },

    async ensureAdvancedOpen(root) {
        if (this.isAdvancedOpen(root)) return;
        const adv = this.findAdvancedButton(root);
        if (!adv) {
            Logger.warn('Create Instance clipboard autofill: Advanced configurations button not found');
            return;
        }
        adv.click();
        await this.waitForAdvancedOpen(root);
    },

    waitForAdvancedOpen(root, timeoutMs = 4000) {
        return new Promise(resolve => {
            if (this.isAdvancedOpen(root)) {
                resolve();
                return;
            }
            const obs = new MutationObserver(() => {
                if (this.isAdvancedOpen(root)) {
                    obs.disconnect();
                    resolve();
                }
            });
            obs.observe(root, { childList: true, subtree: true });
            setTimeout(() => {
                obs.disconnect();
                resolve();
            }, timeoutMs);
        });
    },

    findEnvVariablesRowsContainer(root) {
        const labels = Array.from(root.querySelectorAll('label'));
        const envLab = labels.find(l => (l.textContent || '').includes('Environment Variables'));
        if (!envLab) return null;
        const outer = envLab.closest('.space-y-2');
        if (!outer) return null;
        const inner = outer.querySelector(':scope > .space-y-2');
        return inner || null;
    },

    getEnvRows(container) {
        return Array.from(container.querySelectorAll(':scope > .flex.gap-1.items-start'));
    },

    findEnvAddButton(container) {
        return Array.from(container.querySelectorAll('button')).find(b =>
            (b.textContent || '').replace(/\s+/g, ' ').trim().startsWith('Add')
        );
    },

    findEnvRowByKey(container, key) {
        for (const row of this.getEnvRows(container)) {
            const keyInput = row.querySelector('input[placeholder="Key"]');
            if (keyInput && (keyInput.value || '').trim() === key) return row;
        }
        return null;
    },

    getEnvRowValueInput(row) {
        return row.querySelector('.space-y-1 input') || row.querySelectorAll('input')[1];
    },

    verifyEnvVariablesExact(container, envVars) {
        const expectedKeys = Object.keys(envVars || {});
        const map = new Map();
        for (const row of this.getEnvRows(container)) {
            const keyInput = row.querySelector('input[placeholder="Key"]');
            const valueInput = this.getEnvRowValueInput(row);
            if (!keyInput) continue;
            const k = (keyInput.value || '').trim();
            if (!k) continue;
            const v = (valueInput?.value ?? '').trim();
            if (map.has(k)) {
                return { ok: false, detail: 'duplicate row for key ' + k };
            }
            map.set(k, v);
        }
        if (map.size !== expectedKeys.length) {
            return {
                ok: false,
                detail: `env var count mismatch: clipboard has ${expectedKeys.length} keys, form has ${map.size} non-empty rows`
            };
        }
        for (const k of expectedKeys) {
            if (!map.has(k)) {
                return { ok: false, detail: 'missing key in form after sync: ' + k };
            }
            const expect = (envVars[k] === null || envVars[k] === undefined ? '' : String(envVars[k])).trim();
            if (map.get(k) !== expect) {
                return {
                    ok: false,
                    detail: `value mismatch for ${k}: form has "${map.get(k)}" but clipboard has "${expect}"`
                };
            }
        }
        for (const k of map.keys()) {
            if (!Object.prototype.hasOwnProperty.call(envVars, k)) {
                return { ok: false, detail: 'extra key in form: ' + k };
            }
        }
        return { ok: true };
    },

    /**
     * Advanced env grid must match clipboard exactly: same keys, same values; remove extras, add missing.
     */
    async strictReconcileEnvVariables(root, envVars) {
        const expectedKeys = new Set(Object.keys(envVars || {}));

        await this.ensureAdvancedOpen(root);
        await this.wait(50);

        const container = this.findEnvVariablesRowsContainer(root);
        if (!container) {
            Logger.error('Create Instance clipboard autofill: env variables container not found');
            return false;
        }

        for (let attempt = 0; attempt < 60; attempt++) {
            const rows = this.getEnvRows(container);
            let removedOne = false;
            for (const row of rows) {
                const keyInput = row.querySelector('input[placeholder="Key"]');
                if (!keyInput) continue;
                const k = (keyInput.value || '').trim();
                if (!k) continue;
                if (expectedKeys.has(k)) continue;
                const rm = row.querySelector(':scope > button[type="button"]');
                if (rm) {
                    rm.click();
                    removedOne = true;
                    await this.wait(100);
                    break;
                }
            }
            if (!removedOne) break;
        }

        for (const key of expectedKeys) {
            if (this.findEnvRowByKey(container, key)) continue;
            const addBtn = this.findEnvAddButton(container);
            if (!addBtn) {
                Logger.error('Create Instance clipboard autofill: Add button not found for missing key ' + key);
                return false;
            }
            const prevCount = this.getEnvRows(container).length;
            addBtn.click();
            await this.waitForEnvRowCount(container, prevCount + 1);
            const rows = this.getEnvRows(container);
            const last = rows[rows.length - 1];
            const keyInput = last?.querySelector('input[placeholder="Key"]');
            if (keyInput) this.setInputValue(keyInput, key);
        }

        for (const key of expectedKeys) {
            const strVal = envVars[key] === null || envVars[key] === undefined ? '' : String(envVars[key]);
            const row = this.findEnvRowByKey(container, key);
            if (!row) {
                Logger.error('Create Instance clipboard autofill: row not found for key ' + key);
                return false;
            }
            const valueInput = this.getEnvRowValueInput(row);
            if (valueInput) this.setInputValue(valueInput, strVal);
        }

        await this.wait(80);
        const verify = this.verifyEnvVariablesExact(container, envVars);
        if (!verify.ok) {
            Logger.error('Create Instance clipboard autofill: ' + verify.detail);
            return false;
        }
        Logger.info('Create Instance clipboard autofill: advanced env vars match clipboard exactly');
        return true;
    },

    waitForEnvRowCount(container, minCount, timeoutMs = 3000) {
        return new Promise(resolve => {
            const done = () => this.getEnvRows(container).length >= minCount;
            if (done()) {
                resolve();
                return;
            }
            const obs = new MutationObserver(() => {
                if (done()) {
                    obs.disconnect();
                    resolve();
                }
            });
            obs.observe(container, { childList: true, subtree: true });
            setTimeout(() => {
                obs.disconnect();
                resolve();
            }, timeoutMs);
        });
    },

    findCreateButton(root) {
        return Array.from(root.querySelectorAll('button')).find(b => {
            const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
            return /^Create\b/i.test(t) && b.classList.contains('bg-primary');
        });
    },

    setInputValue(el, value) {
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
};
