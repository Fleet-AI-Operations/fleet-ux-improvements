// ============= verifier-source-tab.js (library) =============
// Shared primary | Verifier tabs + searchable verifier source (session JWT →
// orchestrator). Archetype wrappers supply placement (tab host, primary content).

const PRIMARY_TAB_MARKER = 'data-fleet-verifier-primary-tab';
const VERIFIER_TAB_MARKER = 'data-fleet-verifier-tab';
const PRIMARY_CONTENT_MARKER = 'data-fleet-verifier-primary-content';
const VERIFIER_PANEL_MARKER = 'data-fleet-verifier-panel';
const PANEL_SCOPE = '[data-fleet-verifier-panel="true"]';
const NETWORK_WATCHER_ID = 'verifier-source-tab-capture';
const ORCHESTRATOR_VERIFIER_BASE = 'https://orchestrator.fleetai.com/v1/verifiers/';
const TASK_KEY_RE = /\btask_[a-z0-9_]+\b/i;
const TASK_KEY_FALSE_POSITIVES = new Set([
    'task_feedback',
    'task_modality',
    'task_id',
    'task_ids',
    'task_key',
    'task_keys',
    'task_versions',
    'task_version'
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERIFIER_ID_SCRAPE_RE = /"verifier_id"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})"/i;
const TAB_CLASS_ACTIVE =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px border-primary text-primary';
const TAB_CLASS_INACTIVE =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50';
const TAB_CLASS_ACTIVE_COMPACT =
    'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm border border-primary text-primary bg-background';
const TAB_CLASS_INACTIVE_COMPACT =
    'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50';

const VerifierSourceTabApi = {
    PLUGIN_ID: 'verifierSourceTab',

    createInitialState() {
        return {
            tabInjected: false,
            tabActive: false,
            missingLogged: false,
            activationLogged: false,
            prefetchLogged: false,
            prefetchAttemptedFor: '',
            jwtWarnLogged: false,
            networkSubscribed: false,
            pageScrapeAttempted: false,
            primaryTabButton: null,
            verifierTabButton: null,
            verifierPanel: null,
            primaryContent: null,
            chromeToHide: [],
            statusEl: null,
            versionSelect: null,
            searchInput: null,
            searchClearBtn: null,
            searchPrevBtn: null,
            searchNextBtn: null,
            matchCountEl: null,
            copyBtn: null,
            codeEl: null,
            fetchInFlight: false,
            lastFetchedCacheKey: '',
            searchState: { query: '', index: 0, matchStarts: [] },
            // cacheKey → { verifierId, teamId, source, version, versions[], sourceFromCapture }
            cache: {},
            capture: {
                taskKey: '',
                taskId: '',
                verifierId: '',
                teamId: '',
                source: '',
                version: null,
                versions: []
            },
            opsBundleWaitStarted: false,
            // last options (labels / compact) for recovery
            _opts: null
        };
    },

    /**
     * @param {object} state
     * @param {object} options
     * @param {string} [options.pluginId]
     * @param {string} [options.primaryTabLabel] — e.g. Workflow | Environment
     * @param {boolean} [options.compactTabs]
     * @param {Element|null} options.tabHost
     * @param {function(Element, HTMLElement, HTMLElement): void} options.mountTabs
     * @param {Element|null} options.primaryContent
     * @param {Element|null} options.contentParent — append verifier panel here
     * @param {Element[]} [options.chromeToHide] — hidden while Verifier tab active
     * @param {{ taskId?: string, taskKey?: string, verifierId?: string, teamId?: string }} [options.hints]
     */
    run(state, options) {
        const opts = options || {};
        const pluginId = opts.pluginId || this.PLUGIN_ID;
        const impl = Object.create(this);
        impl.id = pluginId;
        state._opts = opts;

        impl.applyHints(state, opts.hints);
        impl.ensureNetworkCapture(state);
        impl.maybeScrapePageVerifierId(state);

        const tabHost = opts.tabHost;
        const primaryContent = opts.primaryContent;
        const contentParent = opts.contentParent;
        const mountTabs = opts.mountTabs;

        if (!tabHost || !primaryContent || !contentParent || typeof mountTabs !== 'function') {
            if (state.activationLogged) {
                Logger.debug('placement gone — reset');
                state.activationLogged = false;
                state.prefetchLogged = false;
                state.prefetchAttemptedFor = '';
                state.jwtWarnLogged = false;
                state.tabInjected = false;
                state.tabActive = false;
            } else if (!state.missingLogged) {
                Logger.debug('placement not ready');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        if (!state.tabInjected || !document.querySelector(`[${VERIFIER_TAB_MARKER}="true"]`)) {
            impl.injectTab(state, opts);
        } else {
            state.primaryContent = primaryContent;
            state.chromeToHide = Array.isArray(opts.chromeToHide) ? opts.chromeToHide.filter(Boolean) : [];
            if (primaryContent.getAttribute(PRIMARY_CONTENT_MARKER) !== 'true') {
                primaryContent.setAttribute(PRIMARY_CONTENT_MARKER, 'true');
            }
        }

        impl.maybePrefetch(state);

        if (state.tabActive) {
            impl.syncStatusFromCapture(state);
        }
    },

    tabClasses(compact, active) {
        if (compact) {
            return active ? TAB_CLASS_ACTIVE_COMPACT : TAB_CLASS_INACTIVE_COMPACT;
        }
        return active ? TAB_CLASS_ACTIVE : TAB_CLASS_INACTIVE;
    },

    applyHints(state, hints) {
        if (!hints || typeof hints !== 'object') return;
        state.capture = state.capture || {};
        const c = state.capture;
        if (hints.taskId && UUID_RE.test(hints.taskId) && c.taskId !== hints.taskId) {
            c.taskId = hints.taskId;
            Logger.debug('hint taskId=' + hints.taskId.slice(0, 8) + '…');
        }
        if (hints.taskKey && this.isPlausibleTaskKey(hints.taskKey) && c.taskKey !== hints.taskKey) {
            c.taskKey = hints.taskKey;
            Logger.debug('hint taskKey=' + hints.taskKey);
        }
        if (hints.verifierId && UUID_RE.test(hints.verifierId) && !c.verifierId) {
            c.verifierId = hints.verifierId;
        }
        if (hints.teamId && UUID_RE.test(hints.teamId) && !c.teamId) {
            c.teamId = hints.teamId;
        }
    },

    resolveCacheKey(state) {
        const taskKey = this.resolveTaskKeyFromDom() || (state.capture && state.capture.taskKey) || '';
        if (taskKey) return taskKey;
        const taskId = (state.capture && state.capture.taskId) || '';
        if (taskId) return taskId;
        const verifierId = (state.capture && state.capture.verifierId) || '';
        return verifierId || '';
    },

    maybePrefetch(state) {
        if (state.fetchInFlight) return;

        const cacheKey = this.resolveCacheKey(state);
        if (!cacheKey) return;

        if (state.prefetchAttemptedFor && state.prefetchAttemptedFor !== cacheKey) {
            state.prefetchAttemptedFor = '';
            state.prefetchLogged = false;
            state.jwtWarnLogged = false;
        }

        const cached = state.cache[cacheKey] || {};
        const capture = state.capture || {};
        if (cached.source && state.lastFetchedCacheKey === cacheKey) return;
        if (state.prefetchAttemptedFor === cacheKey) return;

        const hasSource = !!(cached.source || capture.source);
        const verifierId = cached.verifierId || capture.verifierId || '';
        const taskId = capture.taskId || '';
        if (!hasSource && !verifierId && !taskId) return;

        if (!state.prefetchLogged) {
            Logger.debug(
                'prefetching verifier for ' +
                    cacheKey +
                    (verifierId ? ' id=' + verifierId.slice(0, 8) + '…' : ' (captured source)')
            );
            state.prefetchLogged = true;
        }
        void this.fetchVerifier(state, { force: false, prefetch: true });
    },

    getPageWindow() {
        return (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
    },

    getCookie(name) {
        try {
            const win = this.getPageWindow();
            const cookie = (win.document && win.document.cookie) || document.cookie || '';
            const match = cookie.match(
                new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
            );
            return match ? decodeURIComponent(match[1]) : '';
        } catch (_e) {
            return '';
        }
    },

    getFleetJwt() {
        const pageWindow = this.getPageWindow();
        if (Context.opsTab && typeof Context.opsTab.getFleetUserJwt === 'function') {
            return Context.opsTab.getFleetUserJwt(pageWindow) || '';
        }
        if (Context.networkObserver && typeof Context.networkObserver.getFleetUserJwt === 'function') {
            return Context.networkObserver.getFleetUserJwt(pageWindow) || '';
        }
        return '';
    },

    isPlausibleTaskKey(key) {
        if (!key || typeof key !== 'string') return false;
        if (!TASK_KEY_RE.test(key)) return false;
        return !TASK_KEY_FALSE_POSITIVES.has(key.toLowerCase());
    },

    resolveTaskKeyFromDom() {
        const roots = [
            document.querySelector('[data-ui="qa-task-detail-panel"]'),
            document.querySelector('#instance-top'),
            document.body
        ].filter(Boolean);
        for (const root of roots) {
            const nodes = root.querySelectorAll('button, span, a, [title]');
            for (const el of nodes) {
                const text = ((el.textContent || '') + ' ' + (el.getAttribute('title') || '')).trim();
                const match = text.match(TASK_KEY_RE);
                if (match && this.isPlausibleTaskKey(match[0])) return match[0];
            }
        }
        return '';
    },

    resolveTeamId(state) {
        const fromCapture = state.capture && state.capture.teamId;
        if (fromCapture && UUID_RE.test(fromCapture)) return fromCapture;
        const fromCookie = this.getCookie('current-team-id');
        if (fromCookie && UUID_RE.test(fromCookie)) return fromCookie;
        return '';
    },

    maybeScrapePageVerifierId(state) {
        if (state.pageScrapeAttempted) return;
        if (state.capture && state.capture.verifierId) {
            state.pageScrapeAttempted = true;
            return;
        }
        state.pageScrapeAttempted = true;
        try {
            const scripts = document.querySelectorAll('script');
            for (let i = 0; i < scripts.length; i++) {
                const text = scripts[i].textContent || '';
                if (text.indexOf('verifier_id') === -1) continue;
                const match = text.match(VERIFIER_ID_SCRAPE_RE);
                if (match && UUID_RE.test(match[1])) {
                    state.capture = state.capture || {};
                    state.capture.verifierId = match[1];
                    Logger.debug('scraped verifier_id from page scripts ' + match[1].slice(0, 8) + '…');
                    return;
                }
            }
        } catch (_e) {
            /* ignore */
        }
    },

    ensureNetworkCapture(state) {
        if (state.networkSubscribed) return;
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.debug('NetworkObserver not ready');
            return;
        }
        const self = this;
        Context.networkObserver.subscribe({
            id: NETWORK_WATCHER_ID,
            matches(meta) {
                if (!meta || !meta.urlObj) return false;
                const host = meta.urlObj.hostname || '';
                const path = meta.urlObj.pathname || '';
                if (host === 'orchestrator.fleetai.com' && path.indexOf('/v1/verifiers/') === 0) {
                    return true;
                }
                if (host.endsWith('.supabase.co') && path.indexOf('/rest/v1/') === 0) {
                    return true;
                }
                if (path.indexOf('/api/') === 0 || path.indexOf('/rest/v1/') === 0) {
                    return true;
                }
                return false;
            },
            onResponse(meta, response) {
                if (!response || !response.ok) return;
                response
                    .json()
                    .then((body) => {
                        self.ingestCapturePayload(state, body, meta);
                    })
                    .catch(() => {
                        /* non-JSON */
                    });
            }
        });
        state.networkSubscribed = true;
        Logger.debug('subscribed for verifier_id / source capture');
    },

    ingestCapturePayload(state, body, meta) {
        const found = this.extractVerifierHints(body);
        if (!found.verifierId && !found.source && !(found.versions && found.versions.length)) {
            return;
        }

        const prev = state.capture || {};
        const next = {
            taskKey: found.taskKey || prev.taskKey || '',
            taskId: prev.taskId || '',
            verifierId: found.verifierId || prev.verifierId || '',
            teamId: found.teamId || prev.teamId || '',
            source: found.source || prev.source || '',
            version: found.version != null ? found.version : prev.version,
            versions: found.versions && found.versions.length ? found.versions : prev.versions || []
        };

        const changed =
            next.verifierId !== prev.verifierId ||
            next.source !== prev.source ||
            next.taskKey !== prev.taskKey ||
            next.version !== prev.version;

        state.capture = next;

        if (changed) {
            Logger.debug(
                'captured verifier hints' +
                    (next.taskKey ? ' task=' + next.taskKey : '') +
                    (next.verifierId ? ' id=' + next.verifierId.slice(0, 8) + '…' : '') +
                    (next.source ? ' source=' + next.source.length + 'ch' : '') +
                    (meta && meta.urlObj ? ' via ' + meta.urlObj.pathname : '')
            );
        }

        const cacheKey = this.resolveTaskKeyFromDom() || next.taskKey || next.taskId || next.verifierId;
        if (cacheKey && (next.verifierId || next.source)) {
            const entry = state.cache[cacheKey] || {};
            state.cache[cacheKey] = {
                ...entry,
                verifierId: next.verifierId || entry.verifierId || '',
                teamId: next.teamId || entry.teamId || '',
                source: entry.source || next.source || '',
                version: entry.version != null ? entry.version : next.version,
                versions:
                    entry.versions && entry.versions.length ? entry.versions : next.versions || [],
                sourceFromCapture: !entry.source && !!next.source
            };
        }

        this.maybePrefetch(state);

        if (state.tabActive) {
            this.syncStatusFromCapture(state);
            if (cacheKey) {
                const cached = state.cache[cacheKey];
                if (cached && cached.source) {
                    void this.renderSource(state, cached.source);
                    this.setStatus(state, this.formatReadyStatus(cacheKey, cached));
                }
            }
        }
    },

    extractVerifierHints(payload) {
        const out = {
            taskKey: '',
            verifierId: '',
            teamId: '',
            source: '',
            version: null,
            versions: []
        };
        if (payload == null) return out;

        const seen = new Set();
        const queue = [{ node: payload, depth: 0 }];
        while (queue.length) {
            const { node, depth } = queue.shift();
            if (node == null || depth > 14) continue;
            if (typeof node !== 'object') continue;
            if (seen.has(node)) continue;
            seen.add(node);

            if (Array.isArray(node)) {
                for (const item of node) queue.push({ node: item, depth: depth + 1 });
                continue;
            }

            if (typeof node.verifier_id === 'string' && UUID_RE.test(node.verifier_id)) {
                out.verifierId = node.verifier_id;
            }
            if (typeof node.verifierId === 'string' && UUID_RE.test(node.verifierId)) {
                out.verifierId = node.verifierId;
            }
            if (typeof node.team_id === 'string' && UUID_RE.test(node.team_id)) {
                out.teamId = node.team_id;
            }
            if (typeof node.teamId === 'string' && UUID_RE.test(node.teamId)) {
                out.teamId = node.teamId;
            }

            if (typeof node.key === 'string') {
                const keyMatch = node.key.match(TASK_KEY_RE);
                if (keyMatch && this.isPlausibleTaskKey(keyMatch[0])) out.taskKey = keyMatch[0];
                const verKey = node.key.match(/verifier-(task_[a-z0-9_]+)/i);
                if (verKey && this.isPlausibleTaskKey(verKey[1])) {
                    out.taskKey = out.taskKey || verKey[1];
                }
            }

            if (typeof node.display_src === 'string' && node.display_src.length > 0) {
                out.source = node.display_src;
                if (Number.isFinite(node.version)) out.version = node.version;
            } else if (typeof node.code === 'string' && node.code.length > 0) {
                out.source = node.code;
                if (Number.isFinite(node.version)) out.version = node.version;
            } else if (typeof node.verifier_code === 'string' && node.verifier_code.length > 0) {
                out.source = node.verifier_code;
            } else if (
                node.metadata &&
                typeof node.metadata === 'object' &&
                typeof node.metadata.verifier_code === 'string' &&
                node.metadata.verifier_code.length > 0
            ) {
                out.source = node.metadata.verifier_code;
                if (Number.isFinite(node.metadata.verifier_version)) {
                    out.version = node.metadata.verifier_version;
                }
            }

            if (Number.isFinite(node.verifier_version) && out.version == null) {
                out.version = node.verifier_version;
            }

            for (const value of Object.values(node)) {
                if (value && typeof value === 'object') {
                    queue.push({ node: value, depth: depth + 1 });
                }
            }
        }
        return out;
    },

    extractOrchestratorSource(payload) {
        const hints = this.extractVerifierHints(payload);
        if (!hints.source) return null;
        return {
            source: hints.source,
            version: hints.version,
            versionId: hints.verifierId || null
        };
    },

    injectTab(state, opts) {
        const primaryLabel = (opts && opts.primaryTabLabel) || 'Primary';
        const compact = !!(opts && opts.compactTabs);
        const existingTab = document.querySelector(`[${VERIFIER_TAB_MARKER}="true"]`);
        const existingPanel = document.querySelector(`[${VERIFIER_PANEL_MARKER}="true"]`);
        if (existingTab && existingPanel) {
            state.verifierTabButton = existingTab;
            state.primaryTabButton = document.querySelector(`[${PRIMARY_TAB_MARKER}="true"]`);
            state.verifierPanel = existingPanel;
            this.bindPanelControls(state, existingPanel);
            state.primaryContent = opts.primaryContent;
            state.chromeToHide = Array.isArray(opts.chromeToHide)
                ? opts.chromeToHide.filter(Boolean)
                : [];
            state.tabInjected = true;
            return;
        }

        const tabHost = opts.tabHost;
        const primaryContent = opts.primaryContent;
        const contentParent = opts.contentParent;
        if (!tabHost || !primaryContent || !contentParent) return;

        primaryContent.setAttribute(PRIMARY_CONTENT_MARKER, 'true');
        state.primaryContent = primaryContent;
        state.chromeToHide = Array.isArray(opts.chromeToHide) ? opts.chromeToHide.filter(Boolean) : [];

        const primaryTab = document.createElement('button');
        primaryTab.type = 'button';
        primaryTab.setAttribute('role', 'tab');
        primaryTab.setAttribute('aria-selected', 'true');
        primaryTab.setAttribute('data-state', 'active');
        primaryTab.setAttribute(PRIMARY_TAB_MARKER, 'true');
        primaryTab.setAttribute('data-fleet-plugin', this.id);
        primaryTab.className = this.tabClasses(compact, true);
        primaryTab.textContent = primaryLabel;
        primaryTab.addEventListener('click', (event) => {
            event.preventDefault();
            this.activatePrimaryTab(state);
        });

        const verifierTab = document.createElement('button');
        verifierTab.type = 'button';
        verifierTab.setAttribute('role', 'tab');
        verifierTab.setAttribute('aria-selected', 'false');
        verifierTab.setAttribute('data-state', 'inactive');
        verifierTab.setAttribute(VERIFIER_TAB_MARKER, 'true');
        verifierTab.setAttribute('data-fleet-plugin', this.id);
        verifierTab.className = this.tabClasses(compact, false);
        verifierTab.textContent = 'Verifier';
        verifierTab.addEventListener('click', (event) => {
            event.preventDefault();
            this.activateVerifierTab(state);
        });

        opts.mountTabs(tabHost, primaryTab, verifierTab);

        const verifierPanel = this.createVerifierPanel(state);
        contentParent.appendChild(verifierPanel);

        state.primaryTabButton = primaryTab;
        state.verifierTabButton = verifierTab;
        state.verifierPanel = verifierPanel;
        state.tabInjected = true;

        if (!state.activationLogged) {
            Logger.log(primaryLabel + ' | Verifier tabs injected');
            state.activationLogged = true;
        }
    },

    setTabVisual(button, active, compact) {
        if (!button) return;
        button.className = this.tabClasses(compact, active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.setAttribute('data-state', active ? 'active' : 'inactive');
    },

    activatePrimaryTab(state) {
        const opts = state._opts || {};
        const label = opts.primaryTabLabel || 'Primary';
        const compact = !!opts.compactTabs;
        if (state.tabActive) {
            Logger.log('switched to ' + label);
        }
        state.tabActive = false;
        this.setTabVisual(state.primaryTabButton, true, compact);
        this.setTabVisual(state.verifierTabButton, false, compact);
        if (state.primaryContent) state.primaryContent.style.display = '';
        if (state.verifierPanel) state.verifierPanel.style.display = 'none';
        this.setChromeVisible(state, true);
    },

    activateVerifierTab(state) {
        const opts = state._opts || {};
        const compact = !!opts.compactTabs;
        if (!state.tabActive) {
            Logger.log('switched to Verifier');
        }
        state.tabActive = true;
        this.setTabVisual(state.primaryTabButton, false, compact);
        this.setTabVisual(state.verifierTabButton, true, compact);
        if (state.primaryContent) state.primaryContent.style.display = 'none';
        if (state.verifierPanel) state.verifierPanel.style.display = 'flex';
        this.setChromeVisible(state, false);
        void this.fetchVerifier(state, { force: false });
    },

    setChromeVisible(state, visible) {
        const list = state.chromeToHide || [];
        for (let i = 0; i < list.length; i++) {
            const el = list[i];
            if (!el) continue;
            el.style.display = visible ? '' : 'none';
        }
    },

    createVerifierPanel(state) {
        const panel = document.createElement('div');
        panel.setAttribute(VERIFIER_PANEL_MARKER, 'true');
        panel.setAttribute('data-fleet-plugin', this.id);
        panel.style.display = 'none';
        panel.style.flexDirection = 'column';
        panel.style.flex = '1 1 0';
        panel.style.minHeight = '0';
        panel.style.overflow = 'hidden';
        panel.style.background = 'var(--background, #fff)';

        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles(PANEL_SCOPE);
        }
        if (Context.uiLib && typeof Context.uiLib.ensureStyles === 'function') {
            Context.uiLib.ensureStyles();
        }

        const toolbar = document.createElement('div');
        toolbar.style.display = 'flex';
        toolbar.style.flexWrap = 'wrap';
        toolbar.style.alignItems = 'center';
        toolbar.style.gap = '6px';
        toolbar.style.padding = '6px 8px';
        toolbar.style.borderBottom = '1px solid var(--border, #e5e7eb)';
        toolbar.style.flexShrink = '0';

        const status = document.createElement('div');
        status.style.flex = '1 1 140px';
        status.style.minWidth = '0';
        status.setAttribute('data-fleet-verifier-status', 'true');
        status.style.fontSize = '12px';
        status.style.color = 'var(--muted-foreground, #6b7280)';
        status.textContent = 'Idle';
        state.statusEl = status;
        toolbar.appendChild(status);

        const versionSelect = document.createElement('select');
        versionSelect.style.display = 'none';
        versionSelect.style.fontSize = '12px';
        versionSelect.style.maxWidth = '160px';
        versionSelect.title = 'Verifier version';
        versionSelect.addEventListener('change', () => {
            const version = versionSelect.value ? Number(versionSelect.value) : null;
            void this.fetchVerifier(state, { force: true, version });
        });
        state.versionSelect = versionSelect;
        toolbar.appendChild(versionSelect);

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = 'Copy';
        copyBtn.className =
            Context.uiLib && typeof Context.uiLib.btnClass === 'function'
                ? Context.uiLib.btnClass('basic', 'compact')
                : '';
        copyBtn.addEventListener('click', (event) => {
            event.preventDefault();
            this.copySource(state, copyBtn);
        });
        state.copyBtn = copyBtn;
        toolbar.appendChild(copyBtn);

        panel.appendChild(toolbar);

        const searchRow = document.createElement('div');
        searchRow.style.display = 'flex';
        searchRow.style.alignItems = 'center';
        searchRow.style.gap = '6px';
        searchRow.style.padding = '6px 8px';
        searchRow.style.borderBottom = '1px solid var(--border, #e5e7eb)';
        searchRow.style.flexShrink = '0';

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Search verifier…';
        searchInput.style.flex = '1 1 auto';
        searchInput.style.minWidth = '0';
        searchInput.style.fontSize = '12px';
        searchInput.style.padding = '4px 8px';
        searchInput.addEventListener('input', () => {
            state.searchState.query = searchInput.value || '';
            state.searchState.index = 0;
            void this.rerenderCode(state);
            const q = state.searchState.query.trim();
            if (q) {
                Logger.debug(
                    'search — ' +
                        (state.searchState.matchStarts.length || 0) +
                        ' match(es) for "' +
                        q +
                        '"'
                );
            }
            this.updateSearchUi(state);
        });
        state.searchInput = searchInput;
        searchRow.appendChild(searchInput);

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.textContent = 'Clear';
        clearBtn.className =
            Context.uiLib && typeof Context.uiLib.btnClass === 'function'
                ? Context.uiLib.btnClass('basic', 'compact')
                : '';
        clearBtn.addEventListener('click', (event) => {
            event.preventDefault();
            searchInput.value = '';
            state.searchState.query = '';
            state.searchState.index = 0;
            void this.rerenderCode(state);
            this.updateSearchUi(state);
            Logger.debug('search cleared');
        });
        state.searchClearBtn = clearBtn;
        searchRow.appendChild(clearBtn);

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.textContent = 'Prev';
        prevBtn.className =
            Context.uiLib && typeof Context.uiLib.btnClass === 'function'
                ? Context.uiLib.btnClass('basic', 'compact')
                : '';
        prevBtn.addEventListener('click', (event) => {
            event.preventDefault();
            void this.stepMatch(state, -1);
        });
        state.searchPrevBtn = prevBtn;
        searchRow.appendChild(prevBtn);

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.textContent = 'Next';
        nextBtn.className =
            Context.uiLib && typeof Context.uiLib.btnClass === 'function'
                ? Context.uiLib.btnClass('basic', 'compact')
                : '';
        nextBtn.addEventListener('click', (event) => {
            event.preventDefault();
            void this.stepMatch(state, 1);
        });
        state.searchNextBtn = nextBtn;
        searchRow.appendChild(nextBtn);

        const matchCount = document.createElement('span');
        matchCount.style.fontSize = '11px';
        matchCount.style.color = 'var(--muted-foreground, #6b7280)';
        matchCount.style.whiteSpace = 'nowrap';
        matchCount.textContent = '';
        state.matchCountEl = matchCount;
        searchRow.appendChild(matchCount);

        panel.appendChild(searchRow);

        const codeWrap = document.createElement('div');
        codeWrap.style.flex = '1 1 0';
        codeWrap.style.minHeight = '0';
        codeWrap.style.overflow = 'auto';
        codeWrap.style.padding = '8px';

        const pre = document.createElement('pre');
        pre.style.margin = '0';
        pre.style.whiteSpace = 'pre';
        pre.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        pre.style.fontSize = '12px';
        pre.style.lineHeight = '1.45';

        const code = document.createElement('code');
        code.className = 'language-python';
        pre.appendChild(code);
        codeWrap.appendChild(pre);
        state.codeEl = code;
        panel.appendChild(codeWrap);

        this.bindPanelControls(state, panel);
        return panel;
    },

    bindPanelControls(state, panel) {
        if (!panel) return;
        state.statusEl = state.statusEl || panel.querySelector('[data-fleet-verifier-status]');
    },

    syncStatusFromCapture(state) {
        if (state.fetchInFlight) return;
        const cacheKey = this.resolveCacheKey(state);
        const cached = cacheKey ? state.cache[cacheKey] : null;
        if (cached && cached.source) {
            this.setStatus(state, this.formatReadyStatus(cacheKey, cached));
            return;
        }
        const verifierId = (state.capture && state.capture.verifierId) || (cached && cached.verifierId) || '';
        if (!cacheKey && !verifierId) {
            this.setStatus(state, 'Waiting for verifier id…');
            return;
        }
        if (!verifierId) {
            const taskId = state.capture && state.capture.taskId;
            if (taskId) {
                this.setStatus(state, 'Resolving verifier for View Task…');
                return;
            }
            this.setStatus(state, 'Waiting for verifier id from page traffic…');
        }
    },

    formatReadyStatus(cacheKey, entry) {
        const bits = [];
        if (cacheKey) {
            if (UUID_RE.test(cacheKey)) {
                bits.push(cacheKey.slice(0, 8) + '…');
            } else {
                bits.push(cacheKey);
            }
        }
        if (entry && entry.version != null) bits.push('v' + entry.version);
        if (entry && entry.source) bits.push(entry.source.length + ' chars');
        return bits.length ? bits.join(' · ') : 'Ready';
    },

    setStatus(state, text) {
        if (state.statusEl) state.statusEl.textContent = text || '';
    },

    updateVersionSelect(state, entry) {
        const select = state.versionSelect;
        if (!select) return;
        const versions = (entry && entry.versions) || [];
        select.innerHTML = '';
        if (!versions.length) {
            select.style.display = 'none';
            return;
        }
        select.style.display = '';
        for (const item of versions) {
            const opt = document.createElement('option');
            const ver = item && item.version != null ? item.version : item;
            opt.value = String(ver);
            opt.textContent = 'v' + ver + (item && item.isLatest ? ' · latest' : '');
            if (entry && entry.version != null && Number(entry.version) === Number(ver)) {
                opt.selected = true;
            }
            select.appendChild(opt);
        }
    },

    /**
     * Resolve verifier source from a task id/key via Context.opsTab (PostgREST + orchestrator).
     * @returns {Promise<boolean>} true if handled (success or hard failure already surfaced)
     */
    async fetchVerifierViaOpsTask(state, args) {
        const ops = Context.opsTab;
        if (!ops || typeof ops.fetchVerifierCode !== 'function') return false;

        const taskId = args.taskId || '';
        const taskKey = args.taskKey || '';
        if (!taskId && !taskKey) return false;

        if (typeof ops.isOpsBundleReady === 'function' && !ops.isOpsBundleReady()) {
            if (!state.opsBundleWaitStarted && typeof ops.whenOpsBundleReady === 'function') {
                state.opsBundleWaitStarted = true;
                void ops
                    .whenOpsBundleReady({ timeoutMs: 30000 })
                    .then(() => {
                        state.opsBundleWaitStarted = false;
                        state.prefetchAttemptedFor = '';
                        state.prefetchLogged = false;
                        Logger.debug('ops bundle ready — retrying verifier prefetch');
                        void this.fetchVerifier(state, { force: false, prefetch: true });
                    })
                    .catch(() => {
                        state.opsBundleWaitStarted = false;
                        Logger.debug('ops bundle unavailable for task→verifier lookup');
                    });
            }
            if (!args.quiet) {
                this.setStatus(state, 'Unlock Ops to load verifier from View Task…');
            }
            Logger.debug('ops bundle not ready — deferred task→verifier lookup');
            return true;
        }

        if (state.fetchInFlight) return true;
        state.fetchInFlight = true;
        if (args.prefetch) state.prefetchAttemptedFor = args.effectiveKey;
        this.setStatus(state, args.quiet ? 'Prefetching verifier…' : 'Loading verifier…');
        Logger.debug(
            (args.quiet ? 'prefetch' : 'fetch') +
                ' via ops task ' +
                (taskKey || taskId.slice(0, 8) + '…')
        );

        try {
            const parsed = {
                taskId: taskId || '',
                taskKey: taskKey || '',
                verifierId: '',
                verifierKey: '',
                teamId: args.teamId || '',
                verifierVersion: args.versionOverride != null ? args.versionOverride : null
            };
            const result = await ops.fetchVerifierCode(parsed);
            const source = result && result.source ? String(result.source) : '';
            if (!source) {
                Logger.warn('ops task→verifier returned no source');
                this.setStatus(state, 'No verifier source for this task');
                return true;
            }

            const entry = {
                verifierId: (result && result.verifierId) || '',
                teamId: args.teamId || '',
                source,
                version: result && result.selectedVersion != null ? result.selectedVersion : result && result.version,
                versions: (result && result.versions) || [],
                sourceFromCapture: false
            };
            if (entry.verifierId) {
                state.capture = state.capture || {};
                state.capture.verifierId = entry.verifierId;
            }
            state.cache[args.effectiveKey] = entry;
            state.lastFetchedCacheKey = args.effectiveKey;
            await this.renderSource(state, entry.source);
            this.updateVersionSelect(state, entry);
            this.setStatus(state, this.formatReadyStatus(args.effectiveKey, entry));
            Logger.log(
                'loaded ' +
                    entry.source.length +
                    ' chars' +
                    (entry.version != null ? ' v' + entry.version : '') +
                    ' for ' +
                    args.effectiveKey
            );
            return true;
        } catch (err) {
            if (ops.isOpsBundleNotLoadedError && ops.isOpsBundleNotLoadedError(err)) {
                if (!args.quiet) this.setStatus(state, 'Unlock Ops to load verifier from View Task…');
                Logger.debug('ops bundle not loaded during task→verifier fetch');
                return true;
            }
            Logger.error('ops task→verifier fetch failed', err);
            this.setStatus(state, 'Fetch error');
            return true;
        } finally {
            state.fetchInFlight = false;
        }
    },

    async fetchVerifier(state, options) {
        const force = !!(options && options.force);
        const prefetch = !!(options && options.prefetch);
        const quiet = prefetch && !state.tabActive;
        const versionOverride = options && options.version != null ? options.version : null;

        this.maybeScrapePageVerifierId(state);

        const capture = state.capture || {};
        const cacheKey = this.resolveCacheKey(state);
        const verifierIdHint = capture.verifierId || '';

        if (!cacheKey && !verifierIdHint) {
            if (!quiet) {
                this.setStatus(state, 'Waiting for verifier id…');
                Logger.warn('fetch skipped — missing cache key and verifier id');
            }
            return;
        }

        const effectiveKey = cacheKey || verifierIdHint;
        const cached = state.cache[effectiveKey] || {};
        const verifierId = cached.verifierId || capture.verifierId || '';
        const teamId = cached.teamId || this.resolveTeamId(state) || '';

        if (!force && cached.source && state.lastFetchedCacheKey === effectiveKey && versionOverride == null) {
            await this.renderSource(state, cached.source);
            this.updateVersionSelect(state, cached);
            this.setStatus(state, this.formatReadyStatus(effectiveKey, cached));
            Logger.debug('using cached source for ' + effectiveKey);
            return;
        }

        if (
            !force &&
            capture.source &&
            (!verifierId || capture.verifierId === verifierId) &&
            versionOverride == null
        ) {
            const entry = {
                ...cached,
                verifierId: verifierId || cached.verifierId,
                teamId,
                source: capture.source,
                version: capture.version,
                versions: capture.versions || cached.versions || [],
                sourceFromCapture: true
            };
            state.cache[effectiveKey] = entry;
            state.lastFetchedCacheKey = effectiveKey;
            if (prefetch) state.prefetchAttemptedFor = effectiveKey;
            await this.renderSource(state, entry.source);
            this.updateVersionSelect(state, entry);
            this.setStatus(state, this.formatReadyStatus(effectiveKey, entry));
            Logger.debug('showing captured source for ' + effectiveKey);
            return;
        }

        if (!verifierId) {
            const taskId = capture.taskId || '';
            const taskKey = capture.taskKey || this.resolveTaskKeyFromDom() || '';
            if (taskId || taskKey) {
                const viaOps = await this.fetchVerifierViaOpsTask(state, {
                    taskId,
                    taskKey,
                    force,
                    prefetch,
                    quiet,
                    versionOverride,
                    effectiveKey,
                    cached,
                    teamId
                });
                if (viaOps) return;
            }
            if (!quiet) this.setStatus(state, 'Waiting for verifier id from page traffic…');
            Logger.debug('fetch deferred — no verifierId yet for ' + effectiveKey);
            return;
        }

        const jwt = this.getFleetJwt();
        if (!jwt) {
            if (!quiet) this.setStatus(state, 'Sign in to Fleet to load verifier source');
            if (!state.jwtWarnLogged) {
                Logger.warn('no Fleet session JWT');
                state.jwtWarnLogged = true;
            }
            return;
        }
        state.jwtWarnLogged = false;

        if (state.fetchInFlight) return;
        state.fetchInFlight = true;
        if (prefetch) state.prefetchAttemptedFor = effectiveKey;
        this.setStatus(state, quiet ? 'Prefetching verifier…' : 'Loading verifier…');
        Logger.debug(
            (quiet ? 'prefetch' : 'fetch') +
                ' orchestrator verifier ' +
                verifierId.slice(0, 8) +
                '…' +
                (versionOverride != null ? ' v' + versionOverride : '')
        );

        try {
            const pageWindow = this.getPageWindow();
            const requestFetch = pageWindow.fetch || fetch;
            const versionQuery =
                versionOverride != null ? '?version=' + encodeURIComponent(versionOverride) : '';
            const url = ORCHESTRATOR_VERIFIER_BASE + encodeURIComponent(verifierId) + versionQuery;
            const headers = { accept: 'application/json', 'x-jwt-token': jwt };
            if (teamId) headers['x-team-id'] = teamId;

            const res = await requestFetch.call(pageWindow, url, {
                method: 'GET',
                headers,
                credentials: 'omit'
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                Logger.warn('orchestrator HTTP ' + res.status, {
                    verifierId,
                    body: String(text).slice(0, 200)
                });
                this.setStatus(state, 'Fetch failed (HTTP ' + res.status + ')');
                return;
            }

            const body = await res.json().catch(() => null);
            const parsed = this.extractOrchestratorSource(body);
            if (!parsed || !parsed.source) {
                Logger.warn('orchestrator response had no source');
                this.setStatus(state, 'No verifier source in response');
                return;
            }

            const entry = {
                verifierId,
                teamId,
                source: parsed.source,
                version: parsed.version != null ? parsed.version : versionOverride,
                versions: this.mergeVersions(cached.versions || capture.versions || [], parsed.version),
                sourceFromCapture: false
            };
            state.cache[effectiveKey] = entry;
            state.lastFetchedCacheKey = effectiveKey;
            await this.renderSource(state, entry.source);
            this.updateVersionSelect(state, entry);
            this.setStatus(state, this.formatReadyStatus(effectiveKey, entry));
            Logger.log(
                'loaded ' +
                    entry.source.length +
                    ' chars' +
                    (entry.version != null ? ' v' + entry.version : '') +
                    ' for ' +
                    effectiveKey
            );
        } catch (err) {
            Logger.error('fetch failed', err);
            this.setStatus(state, 'Fetch error');
        } finally {
            state.fetchInFlight = false;
        }
    },

    mergeVersions(existing, currentVersion) {
        const list = Array.isArray(existing) ? existing.slice() : [];
        if (currentVersion == null) return list;
        if (
            !list.some(
                (item) => Number(item.version != null ? item.version : item) === Number(currentVersion)
            )
        ) {
            list.push({ version: currentVersion, isLatest: list.length === 0 });
        }
        return list.sort(
            (a, b) =>
                Number(b.version != null ? b.version : b) - Number(a.version != null ? a.version : a)
        );
    },

    async renderSource(state, text) {
        const codeEl = state.codeEl;
        if (!codeEl) return;
        state.searchState = state.searchState || { query: '', index: 0, matchStarts: [] };
        if (Context.opsTab && typeof Context.opsTab.renderVerifierCodeElement === 'function') {
            state.searchState = await Context.opsTab.renderVerifierCodeElement(codeEl, {
                text: text || '',
                searchState: state.searchState
            });
        } else {
            codeEl.textContent = text || '';
            state.searchState.matchStarts = [];
            state.searchState.index = 0;
        }
        this.updateSearchUi(state);
        if (state.searchState.query && state.searchState.query.trim()) {
            requestAnimationFrame(() => {
                if (
                    Context.opsTab &&
                    typeof Context.opsTab.scrollVerifierActiveContentMatch === 'function'
                ) {
                    Context.opsTab.scrollVerifierActiveContentMatch(codeEl);
                }
            });
        }
    },

    async rerenderCode(state) {
        const cacheKey = this.resolveCacheKey(state);
        const source =
            (cacheKey && state.cache[cacheKey] && state.cache[cacheKey].source) ||
            (state.capture && state.capture.source) ||
            (state.codeEl && state.codeEl.textContent) ||
            '';
        await this.renderSource(state, source);
    },

    updateSearchUi(state) {
        const count =
            state.searchState && state.searchState.matchStarts
                ? state.searchState.matchStarts.length
                : 0;
        const index = state.searchState ? state.searchState.index : 0;
        if (state.matchCountEl) {
            const q =
                state.searchState && state.searchState.query ? state.searchState.query.trim() : '';
            state.matchCountEl.textContent = q ? count + ' match' + (count === 1 ? '' : 'es') : '';
            if (q && count > 0) {
                state.matchCountEl.textContent = index + 1 + ' / ' + count;
            }
        }
        if (state.searchPrevBtn) state.searchPrevBtn.disabled = count === 0;
        if (state.searchNextBtn) state.searchNextBtn.disabled = count === 0;
    },

    async stepMatch(state, delta) {
        const codeEl = state.codeEl;
        if (
            !codeEl ||
            !Context.opsTab ||
            typeof Context.opsTab.stepVerifierContentMatchInElement !== 'function'
        ) {
            return;
        }
        state.searchState = await Context.opsTab.stepVerifierContentMatchInElement(
            codeEl,
            state.searchState,
            delta,
            () => this.rerenderCode(state)
        );
        if (Context.opsTab.scrollVerifierActiveContentMatch) {
            Context.opsTab.scrollVerifierActiveContentMatch(codeEl);
        }
        this.updateSearchUi(state);
        Logger.debug('stepped match to index ' + (state.searchState.index || 0));
    },

    copySource(state, btn) {
        const cacheKey = this.resolveCacheKey(state);
        const text =
            (cacheKey && state.cache[cacheKey] && state.cache[cacheKey].source) ||
            (state.capture && state.capture.source) ||
            '';
        if (!text) {
            Logger.warn('copy failed — empty source');
            if (Context.buttonFeedback && btn) Context.buttonFeedback.flashFailure(btn);
            return;
        }
        navigator.clipboard.writeText(text).then(
            () => {
                Logger.log('copied ' + text.length + ' chars');
                if (Context.buttonFeedback && btn) Context.buttonFeedback.flashSuccess(btn);
            },
            (err) => {
                Logger.error('clipboard failed', err);
                if (Context.buttonFeedback && btn) Context.buttonFeedback.flashFailure(btn);
            }
        );
    }
};

const plugin = {
    id: 'verifierSourceTabLib',
    name: 'Verifier Source Tab (library)',
    description:
        'Shared primary | Verifier tab shell and searchable verifier source (archetype modules supply placement)',
    _version: '2.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.verifierSourceTab = {
            PRIMARY_TAB_MARKER,
            VERIFIER_TAB_MARKER,
            PRIMARY_CONTENT_MARKER,
            VERIFIER_PANEL_MARKER,
            createInitialState: () => VerifierSourceTabApi.createInitialState(),
            run: (s, options) => VerifierSourceTabApi.run(s, options)
        };
        if (!state.registered) {
            Logger.log('module registered (Context.verifierSourceTab)');
            state.registered = true;
        }
    }
};
