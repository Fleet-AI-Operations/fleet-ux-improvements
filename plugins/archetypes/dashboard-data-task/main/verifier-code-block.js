// verifier-code-block.js
// Fetch and display verifier Python on dashboard task pages (legacy "No verifier" or "Verifier sanity checks").

const TASK_KEY_FROM_PATH_RE = /\/dashboard\/data\/tasks\/(task_[^/?#]+)/i;
const PLUGIN_ID = 'verifier-code-block';
const NO_VERIFIER_TEXT = 'No verifier';
const VERIFIER_LABEL_TEXT = 'Verifier';
const SANITY_CHECKS_LABEL_TEXT = 'Verifier sanity checks';
const NAV_BTN_CLASS =
    'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground h-7 text-xs pl-2 pr-2 py-1 gap-1.5';
const COPY_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">' +
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>' +
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>' +
    '</svg>';
const VERIFIER_CODE_STYLE_ID = 'wf-fleet-verifier-code-block-styles';
const OPS_BUNDLE_WAIT_TIMEOUT_MS = 30000;

const plugin = {
    id: PLUGIN_ID,
    name: 'Verifier Code Block',
    description:
        'Fetches and displays verifier Python code on dashboard task pages (No verifier or Verifier sanity checks)',
    _version: '2.1',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false,
        fetchStarted: false,
        fetchDone: false,
        bundleWaitStarted: false,
        bundleUnavailable: false,
        taskKey: '',
        verifierSource: '',
        verifierVisible: false,
        contentSearch: { query: '', index: 0, matchStarts: [] }
    },

    onMutation(state, context) {
        if (state.fetchDone || state.bundleUnavailable) return;
        if (state.fetchStarted && !state.bundleWaitStarted) return;

        const slot = this._findVerifierAnchor();
        if (!slot) {
            if (!state.missingLogged) {
                Logger.debug(PLUGIN_ID + ': waiting for verifier anchor');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const taskKey = this._extractTaskKeyFromPath();
        if (!taskKey) {
            if (!state.missingLogged) {
                Logger.warn(PLUGIN_ID + ': could not parse task key from URL');
                state.missingLogged = true;
            }
            return;
        }

        if (slot.parent.querySelector('[data-fleet-plugin="' + PLUGIN_ID + '"]')) {
            state.fetchDone = true;
            return;
        }

        if (!this._ensureOpsBundleReady(state)) return;
        if (state.fetchStarted) return;

        state.fetchStarted = true;
        state.taskKey = taskKey;
        void this._fetchAndRender(state, slot, taskKey);
    },

    _ensureOpsBundleReady(state) {
        const opsTab = Context.opsTab;
        if (!opsTab) return false;
        if (typeof opsTab.isOpsBundleReady === 'function' && opsTab.isOpsBundleReady()) {
            return true;
        }
        if (state.bundleWaitStarted) return false;
        if (typeof opsTab.whenOpsBundleReady !== 'function') {
            state.bundleUnavailable = true;
            return false;
        }
        state.bundleWaitStarted = true;
        void opsTab.whenOpsBundleReady({ timeoutMs: OPS_BUNDLE_WAIT_TIMEOUT_MS })
            .then(() => {
                state.bundleWaitStarted = false;
            })
            .catch((err) => {
                state.bundleWaitStarted = false;
                state.bundleUnavailable = true;
                Logger.warn(PLUGIN_ID + ': ops bundle unavailable', err);
            });
        return false;
    },

    _isTransientBundleError(err) {
        const opsTab = Context.opsTab;
        return !!(opsTab && typeof opsTab.isOpsBundleNotLoadedError === 'function'
            && opsTab.isOpsBundleNotLoadedError(err));
    },

    _ensureVerifierCodeStyles() {
        if (document.getElementById(VERIFIER_CODE_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = VERIFIER_CODE_STYLE_ID;
        style.textContent = [
            '.fleet-wf-verifier-code-wrap,',
            '.fleet-wf-verifier-code-wrap pre,',
            '.fleet-wf-verifier-code-wrap pre code.hljs{background:transparent!important;}',
            '.fleet-wf-verifier-code-wrap mark.wf-ops-verifier-hit{background:color-mix(in srgb,#facc15 40%,transparent);color:unset;border-radius:2px;padding:0 1px;}',
            '.fleet-wf-verifier-code-wrap mark.wf-ops-verifier-hit-active{background:#facc15!important;outline:1px solid #ca8a04;}',
            '.fleet-wf-verifier-search-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:0 0 8px 0;}',
            '.fleet-wf-verifier-search-toolbar input[type="text"]{flex:1 1 10rem;min-width:0;padding:6px 10px;font-size:12px;border:1px solid var(--border,#e5e5e5);border-radius:6px;background:var(--background,#fff);color:var(--foreground,#333);box-sizing:border-box;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;}',
            '.fleet-wf-verifier-search-toolbar .fleet-wf-verifier-search-count{font-size:11px;color:var(--muted-foreground,#64748b);white-space:nowrap;}'
        ].join('');
        document.head.appendChild(style);
        CleanupRegistry.registerElement(style);
    },

    _extractTaskKeyFromPath() {
        const path = Context.currentPath || '';
        const match = path.match(TASK_KEY_FROM_PATH_RE);
        if (match) return match[1];
        const segments = path.split('/').filter(Boolean);
        const last = segments[segments.length - 1] || '';
        return /^task_/i.test(last) ? last : '';
    },

    _findLegacyNoVerifierSlot() {
        const nodes = document.querySelectorAll('div, motion.div');
        for (const el of nodes) {
            if (el.childElementCount !== 0) continue;
            if ((el.textContent || '').trim() !== NO_VERIFIER_TEXT) continue;
            const parent = el.parentElement;
            if (!parent) continue;
            const label = parent.querySelector('.font-medium.mb-2, .text-sm.text-muted-foreground.font-medium.mb-2');
            if (!label || (label.textContent || '').trim() !== VERIFIER_LABEL_TEXT) continue;
            return {
                mode: 'legacy',
                parent,
                placeholder: el,
                label,
                checklist: null
            };
        }
        return null;
    },

    _findSanityChecksSlot() {
        const labels = document.querySelectorAll(
            'div.text-sm.text-muted-foreground.font-medium, div.font-medium.text-sm.text-muted-foreground'
        );
        for (const label of labels) {
            if ((label.textContent || '').trim() !== SANITY_CHECKS_LABEL_TEXT) continue;
            const headerRow = label.parentElement;
            if (!headerRow) continue;
            const section = headerRow.parentElement;
            if (!section) continue;
            const checklist = section.querySelector(':scope > div.space-y-3');
            if (!checklist) continue;
            return {
                mode: 'sanity-checks',
                parent: section,
                placeholder: null,
                label,
                checklist
            };
        }
        return null;
    },

    _findVerifierAnchor() {
        return this._findLegacyNoVerifierSlot() || this._findSanityChecksSlot();
    },

    _createNavButton(label, slot) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = NAV_BTN_CLASS;
        btn.setAttribute('data-fleet-plugin', PLUGIN_ID);
        btn.setAttribute('data-slot', slot);
        btn.textContent = label;
        return btn;
    },

    _clearCopyButtonFeedback(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.clear(button);
    },

    _showCopySuccessFlash(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(button, { restoreStyles: false });
    },

    _showCopyFailurePulse(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.flashFailure(button, { restoreStyles: false });
    },

    async _copyTextToClipboard(text) {
        if (!text) return false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (_e) { /* fall through */ }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (_e2) {
            return false;
        }
    },

    _createCopyButton(source) {
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = NAV_BTN_CLASS;
        copyBtn.setAttribute('data-fleet-plugin', PLUGIN_ID);
        copyBtn.setAttribute('data-slot', 'copy-verifier');
        copyBtn.innerHTML = COPY_ICON_SVG + 'Copy';

        copyBtn.addEventListener('click', async () => {
            const ok = await this._copyTextToClipboard(source);
            if (ok) {
                this._showCopySuccessFlash(copyBtn);
                Logger.log(PLUGIN_ID + ': verifier code copied (' + source.length + ' chars)');
            } else {
                this._showCopyFailurePulse(copyBtn);
                Logger.warn(PLUGIN_ID + ': verifier copy failed');
            }
        });

        return copyBtn;
    },

    _attachVerifierHeader(slot, source, ui) {
        const { parent, label } = slot;
        if (!label || !parent) return;
        if (parent.querySelector('[data-fleet-plugin="' + PLUGIN_ID + '-header"]')) return;

        const headerRow = document.createElement('div');
        headerRow.className = 'mb-2 flex flex-wrap items-center justify-between gap-2';
        headerRow.setAttribute('data-fleet-plugin', PLUGIN_ID + '-header');

        parent.insertBefore(headerRow, label);
        headerRow.appendChild(label);
        label.classList.remove('mb-2');

        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-1';

        ui.showBtn = this._createNavButton('Show verifier', 'show-verifier');
        ui.showBtn.addEventListener('click', () => {
            this._setVerifierVisible(ui, !ui.state.verifierVisible);
        });
        actions.appendChild(ui.showBtn);
        actions.appendChild(this._createCopyButton(source));

        headerRow.appendChild(actions);
        ui.headerRow = headerRow;
    },

    _buildSanityChecksActionsRow(source, ui) {
        const actionsRow = document.createElement('div');
        actionsRow.className = 'mt-3 mb-2 flex flex-wrap items-center gap-1';
        actionsRow.setAttribute('data-fleet-plugin', PLUGIN_ID + '-header');
        actionsRow.setAttribute('data-slot', 'sanity-checks-actions');

        ui.showBtn = this._createNavButton('Show verifier', 'show-verifier');
        ui.showBtn.addEventListener('click', () => {
            this._setVerifierVisible(ui, !ui.state.verifierVisible);
        });
        actionsRow.appendChild(ui.showBtn);
        actionsRow.appendChild(this._createCopyButton(source));
        ui.headerRow = actionsRow;
        return actionsRow;
    },

    _buildSearchToolbar(state, ui) {
        const toolbar = document.createElement('div');
        toolbar.className = 'fleet-wf-verifier-search-toolbar';
        toolbar.setAttribute('data-fleet-plugin', PLUGIN_ID);
        toolbar.setAttribute('data-slot', 'verifier-search-toolbar');
        toolbar.style.display = 'none';

        const label = document.createElement('label');
        label.textContent = 'Search in code:';
        label.style.cssText = 'font-size:11px;font-weight:600;color:var(--muted-foreground,#64748b);white-space:nowrap;flex-shrink:0;';
        label.setAttribute('for', 'fleet-wf-verifier-search-' + state.taskKey);

        const inputWrap = document.createElement('span');
        inputWrap.style.cssText = 'display:flex;flex:1 1 10rem;min-width:0;gap:4px;align-items:center;';

        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'fleet-wf-verifier-search-' + state.taskKey;
        input.placeholder = 'Find in verifier…';
        input.autocomplete = 'off';
        input.setAttribute('data-slot', 'verifier-search-input');

        const clearBtn = this._createNavButton('×', 'verifier-search-clear');
        clearBtn.title = 'Clear search';
        clearBtn.setAttribute('aria-label', 'Clear search');
        clearBtn.style.display = 'none';

        inputWrap.appendChild(input);
        inputWrap.appendChild(clearBtn);

        const countEl = document.createElement('span');
        countEl.className = 'fleet-wf-verifier-search-count';
        countEl.setAttribute('data-slot', 'verifier-search-count');

        const prevBtn = this._createNavButton('Prev', 'verifier-search-prev');
        const nextBtn = this._createNavButton('Next', 'verifier-search-next');

        toolbar.appendChild(label);
        toolbar.appendChild(inputWrap);
        toolbar.appendChild(countEl);
        toolbar.appendChild(prevBtn);
        toolbar.appendChild(nextBtn);

        ui.searchToolbar = toolbar;
        ui.searchInput = input;
        ui.searchClearBtn = clearBtn;
        ui.searchCountEl = countEl;
        ui.searchPrevBtn = prevBtn;
        ui.searchNextBtn = nextBtn;

        this._attachSearchListeners(state, ui);
        return toolbar;
    },

    _updateSearchUi(ui) {
        const search = ui.state.contentSearch;
        const matchCount = search.matchStarts ? search.matchStarts.length : 0;
        const hasQuery = Boolean((search.query || '').trim());

        if (ui.searchClearBtn) {
            ui.searchClearBtn.style.display = hasQuery ? 'inline-flex' : 'none';
        }
        if (ui.searchCountEl) {
            if (!hasQuery) {
                ui.searchCountEl.textContent = '';
            } else if (matchCount === 0) {
                ui.searchCountEl.textContent = 'No matches';
            } else {
                ui.searchCountEl.textContent = (search.index + 1) + ' / ' + matchCount;
            }
        }
        const navDisabled = !hasQuery || matchCount === 0;
        if (ui.searchPrevBtn) ui.searchPrevBtn.disabled = navDisabled;
        if (ui.searchNextBtn) ui.searchNextBtn.disabled = navDisabled;
    },

    async _refreshVerifierDisplay(ui) {
        const opsTab = Context.opsTab;
        if (!opsTab || typeof opsTab.renderVerifierCodeElement !== 'function' || !ui.codeEl) return;
        ui.state.contentSearch = await opsTab.renderVerifierCodeElement(ui.codeEl, {
            text: ui.state.verifierSource,
            searchState: ui.state.contentSearch
        });
        this._updateSearchUi(ui);
        const query = (ui.state.contentSearch.query || '').trim();
        if (query) {
            requestAnimationFrame(() => {
                if (typeof opsTab.scrollVerifierActiveContentMatch === 'function') {
                    opsTab.scrollVerifierActiveContentMatch(ui.codeEl);
                }
            });
        }
    },

    _applyVerifierContentSearch(ui, rawQuery) {
        ui.state.contentSearch.query = String(rawQuery || '');
        ui.state.contentSearch.index = 0;
        void this._refreshVerifierDisplay(ui);
        const q = ui.state.contentSearch.query.trim();
        if (q) {
            const n = ui.state.contentSearch.matchStarts ? ui.state.contentSearch.matchStarts.length : 0;
            Logger.log(PLUGIN_ID + ': verifier content search — ' + n + ' match(es) for "' + q + '"');
        }
    },

    _clearVerifierContentSearch(ui) {
        if (ui.searchInput) ui.searchInput.value = '';
        this._applyVerifierContentSearch(ui, '');
        Logger.log(PLUGIN_ID + ': verifier content search cleared');
    },

    _stepVerifierContentMatch(ui, delta) {
        const opsTab = Context.opsTab;
        if (!opsTab || typeof opsTab.stepVerifierContentMatchInElement !== 'function') return;
        void opsTab.stepVerifierContentMatchInElement(
            ui.codeEl,
            ui.state.contentSearch,
            delta,
            () => this._refreshVerifierDisplay(ui)
        ).then((nextSearch) => {
            ui.state.contentSearch = nextSearch;
            this._updateSearchUi(ui);
            requestAnimationFrame(() => {
                if (typeof opsTab.scrollVerifierActiveContentMatch === 'function') {
                    opsTab.scrollVerifierActiveContentMatch(ui.codeEl);
                }
            });
        });
    },

    _attachSearchListeners(state, ui) {
        if (!ui.searchInput || ui.searchInput.dataset.wfSearchAttached === '1') return;
        ui.searchInput.dataset.wfSearchAttached = '1';

        ui.searchInput.addEventListener('input', () => {
            this._applyVerifierContentSearch(ui, ui.searchInput.value);
        });
        ui.searchInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            this._stepVerifierContentMatch(ui, e.shiftKey ? -1 : 1);
        });
        if (ui.searchClearBtn) {
            ui.searchClearBtn.addEventListener('click', () => this._clearVerifierContentSearch(ui));
        }
        if (ui.searchPrevBtn) {
            ui.searchPrevBtn.addEventListener('click', () => this._stepVerifierContentMatch(ui, -1));
        }
        if (ui.searchNextBtn) {
            ui.searchNextBtn.addEventListener('click', () => this._stepVerifierContentMatch(ui, 1));
        }
    },

    _setVerifierVisible(ui, visible) {
        ui.state.verifierVisible = Boolean(visible);
        const show = ui.state.verifierVisible;
        if (ui.wrap) ui.wrap.style.display = show ? 'block' : 'none';
        if (ui.searchToolbar) ui.searchToolbar.style.display = show ? 'flex' : 'none';
        if (ui.showBtn) ui.showBtn.textContent = show ? 'Hide verifier' : 'Show verifier';
        Logger.log(PLUGIN_ID + ': verifier ' + (show ? 'shown' : 'hidden'));
    },

    _subscribeFleetThemeRefresh(ui) {
        if (ui.themeSubscribed) return;
        const de = Context.diffEngine;
        if (!de || typeof de.onFleetThemeChange !== 'function') return;
        de.onFleetThemeChange(() => {
            if (!ui.state.verifierSource || !ui.codeEl) return;
            void this._refreshVerifierDisplay(ui);
        });
        ui.themeSubscribed = true;
    },

    _attachResizeHandle(pre) {
        if (!pre || pre.dataset.wfVerifierResizeAttached === '1') return;

        const defaultMaxHeightPx = 384;
        pre.style.maxHeight = defaultMaxHeightPx + 'px';
        pre.style.overflow = 'auto';

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'wf-verifier-resize-handle';
        resizeHandle.setAttribute('data-fleet-plugin', PLUGIN_ID);
        resizeHandle.setAttribute('data-slot', 'resize-handle');
        Object.assign(resizeHandle.style, {
            height: '8px',
            cursor: 'ns-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: '0',
            transition: 'opacity 0.15s',
            userSelect: 'none',
            color: 'var(--muted-foreground, #666)'
        });

        const handleBar = document.createElement('div');
        Object.assign(handleBar.style, {
            width: '40px',
            height: '3px',
            borderRadius: '1.5px',
            backgroundColor: 'currentColor',
            opacity: '0.3'
        });
        resizeHandle.appendChild(handleBar);

        const showHandle = () => { resizeHandle.style.opacity = '1'; };
        const hideHandle = (e, partner) => {
            if (!e.relatedTarget || !partner.contains(e.relatedTarget)) {
                resizeHandle.style.opacity = '0';
            }
        };

        CleanupRegistry.registerEventListener(pre, 'mouseenter', showHandle);
        CleanupRegistry.registerEventListener(pre, 'mouseleave', (e) => hideHandle(e, resizeHandle));
        CleanupRegistry.registerEventListener(resizeHandle, 'mouseenter', showHandle);
        CleanupRegistry.registerEventListener(resizeHandle, 'mouseleave', (e) => hideHandle(e, pre));

        pre.insertAdjacentElement('afterend', resizeHandle);

        const minHeight = 80;
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const newHeight = Math.max(minHeight, startHeight + (e.clientY - startY));
            pre.style.maxHeight = newHeight + 'px';
        };

        const handleMouseUp = () => {
            if (!isResizing) return;
            const endHeight = pre.offsetHeight;
            if (endHeight !== startHeight) {
                Logger.log(PLUGIN_ID + ': resize ' + startHeight + 'px→' + endHeight + 'px');
            }
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = pre.offsetHeight;
            e.preventDefault();
            e.stopPropagation();
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        };

        resizeHandle.addEventListener('mousedown', handleMouseDown);
        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);

        pre.dataset.wfVerifierResizeAttached = '1';
    },

    async _fetchAndRender(state, slot, taskKey) {
        const opsTab = Context.opsTab;
        if (!opsTab || typeof opsTab.fetchVerifierCode !== 'function') {
            Logger.warn(PLUGIN_ID + ': Context.opsTab.fetchVerifierCode unavailable');
            state.fetchStarted = false;
            return;
        }

        Logger.log(PLUGIN_ID + ': fetching verifier for ' + taskKey);
        try {
            if (typeof opsTab.whenOpsBundleReady === 'function') {
                await opsTab.whenOpsBundleReady({ timeoutMs: OPS_BUNDLE_WAIT_TIMEOUT_MS });
            }
            const result = await opsTab.fetchVerifierCode({ taskKey });
            const source = result && result.source;
            if (!source) {
                if (typeof opsTab.isOpsBundleReady === 'function' && !opsTab.isOpsBundleReady()) {
                    state.fetchStarted = false;
                    return;
                }
                Logger.warn(PLUGIN_ID + ': fetch returned no source for ' + taskKey);
                state.fetchStarted = false;
                return;
            }

            const isSanityChecks = slot.mode === 'sanity-checks';
            if (!slot.parent.isConnected) {
                Logger.debug(PLUGIN_ID + ': DOM changed before render — skipping');
                return;
            }
            if (isSanityChecks) {
                if (!slot.checklist || !slot.checklist.isConnected) {
                    Logger.debug(PLUGIN_ID + ': DOM changed before render — skipping');
                    return;
                }
            } else if (!slot.placeholder || !slot.placeholder.isConnected) {
                Logger.debug(PLUGIN_ID + ': DOM changed before render — skipping');
                return;
            }

            if (!isSanityChecks && slot.placeholder) {
                slot.placeholder.classList.add('fleet-wf-hidden-no-verifier');
                slot.placeholder.style.display = 'none';
            }

            state.verifierSource = source;
            state.verifierVisible = false;
            state.contentSearch = { query: '', index: 0, matchStarts: [] };

            const ui = { state, themeSubscribed: false };

            this._ensureVerifierCodeStyles();

            const searchToolbar = this._buildSearchToolbar(state, ui);

            const wrap = document.createElement('div');
            wrap.setAttribute('data-fleet-plugin', PLUGIN_ID);
            wrap.className = 'fleet-wf-verifier-code-wrap';
            wrap.style.background = 'transparent';
            wrap.style.display = 'none';

            const pre = document.createElement('pre');
            pre.className = 'fleet-wf-verifier-code-pre max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md p-3 font-mono text-sm text-muted-foreground';
            pre.style.background = 'transparent';

            const code = document.createElement('code');
            code.className = 'language-python';
            code.textContent = source;

            pre.appendChild(code);
            wrap.appendChild(pre);

            if (isSanityChecks) {
                const bottomBlock = document.createElement('div');
                bottomBlock.setAttribute('data-fleet-plugin', PLUGIN_ID);
                bottomBlock.setAttribute('data-slot', 'sanity-checks-verifier');
                bottomBlock.appendChild(this._buildSanityChecksActionsRow(source, ui));
                bottomBlock.appendChild(searchToolbar);
                bottomBlock.appendChild(wrap);
                slot.checklist.insertAdjacentElement('afterend', bottomBlock);
            } else {
                this._attachVerifierHeader(slot, source, ui);
                slot.parent.insertBefore(searchToolbar, slot.placeholder.nextSibling);
                slot.parent.insertBefore(wrap, searchToolbar.nextSibling);
            }

            ui.wrap = wrap;
            ui.codeEl = code;
            ui.pre = pre;

            this._attachResizeHandle(pre);
            this._subscribeFleetThemeRefresh(ui);
            await this._refreshVerifierDisplay(ui);
            this._setVerifierVisible(ui, false);

            state.fetchDone = true;
            Logger.log(PLUGIN_ID + ': rendered verifier (' + source.length + ' chars) for ' + taskKey);
        } catch (err) {
            if (this._isTransientBundleError(err)) {
                state.fetchStarted = false;
                return;
            }
            Logger.warn(PLUGIN_ID + ': verifier fetch failed for ' + taskKey, err);
            state.fetchStarted = false;
        }
    }
};
