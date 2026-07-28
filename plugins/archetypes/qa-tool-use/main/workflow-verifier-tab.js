// ============= workflow-verifier-tab.js (qa-tool-use) =============
// Workflow | Verifier tabs on the QA workflow panel. Verifier pane fetches
// source with the logged-in Fleet session JWT (no ops password / ops bundle).

const WORKFLOW_TAB_MARKER = 'data-fleet-workflow-tab';
const VERIFIER_TAB_MARKER = 'data-fleet-verifier-tab';
const WORKFLOW_CONTENT_MARKER = 'data-fleet-workflow-content';
const VERIFIER_PANEL_MARKER = 'data-fleet-verifier-panel';
const PANEL_SCOPE = '[data-fleet-verifier-panel="true"]';
const NETWORK_WATCHER_ID = 'workflow-verifier-tab-capture';
const ORCHESTRATOR_VERIFIER_BASE = 'https://orchestrator.fleetai.com/v1/verifiers/';
const TASK_KEY_RE = /\btask_[a-z0-9_]+\b/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TAB_CLASS_ACTIVE =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px border-primary text-primary';
const TAB_CLASS_INACTIVE =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50';

const plugin = {
    id: 'workflowVerifierTab',
    name: 'Workflow Verifier Tab',
    description:
        'Adds Workflow | Verifier tabs on the QA workflow panel and shows searchable verifier source for the current task',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        tabInjected: false,
        tabActive: false,
        missingLogged: false,
        activationLogged: false,
        networkSubscribed: false,
        workflowTabButton: null,
        verifierTabButton: null,
        verifierPanel: null,
        workflowContent: null,
        toolbarEl: null,
        statusEl: null,
        versionSelect: null,
        refreshBtn: null,
        searchInput: null,
        searchClearBtn: null,
        searchPrevBtn: null,
        searchNextBtn: null,
        matchCountEl: null,
        copyBtn: null,
        codeEl: null,
        fetchInFlight: false,
        lastFetchedTaskKey: '',
        searchState: { query: '', index: 0, matchStarts: [] },
        // taskKey → { verifierId, teamId, source, version, versions[], sourceFromCapture }
        cache: {},
        // latest network hints (may arrive before task key is known)
        capture: {
            taskKey: '',
            verifierId: '',
            teamId: '',
            source: '',
            version: null,
            versions: []
        }
    },

    onMutation(state) {
        this.ensureNetworkCapture(state);

        const panel = this.findWorkflowPanel();
        if (!panel) {
            if (state.activationLogged) {
                Logger.debug('workflowVerifierTab: workflow-panel gone — reset');
                state.activationLogged = false;
                state.tabInjected = false;
                state.tabActive = false;
            } else if (!state.missingLogged) {
                Logger.debug('workflowVerifierTab: workflow-panel not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        if (!state.tabInjected || !document.querySelector(`[${VERIFIER_TAB_MARKER}="true"]`)) {
            this.injectTab(state, panel);
        }

        if (state.tabActive) {
            this.syncStatusFromCapture(state);
        }
    },

    findWorkflowPanel() {
        return document.querySelector('[data-ui="workflow-panel"]');
    },

    findInnerColumn(panel) {
        if (!panel) return null;
        const card = panel.querySelector(':scope > div') || panel.children[0] || null;
        if (!card) return null;
        return (
            Array.from(card.children).find(
                (el) => el.classList.contains('flex') && el.classList.contains('flex-col')
            ) ||
            card.querySelector(':scope > div') ||
            card.children[0] ||
            null
        );
    },

    findHeader(inner) {
        if (!inner) return null;
        return (
            Array.from(inner.children).find(
                (el) => el.classList.contains('h-9') && el.classList.contains('border-b')
            ) || null
        );
    },

    findWorkflowContent(inner) {
        if (!inner) return null;
        const steps = inner.querySelector('[data-ui="workflow-steps-container"]');
        if (steps) {
            let el = steps;
            while (el && el.parentElement !== inner) el = el.parentElement;
            if (el) return el;
        }
        return (
            Array.from(inner.children).find(
                (el) =>
                    !el.classList.contains('h-9') &&
                    el.getAttribute(VERIFIER_PANEL_MARKER) !== 'true'
            ) || null
        );
    },

    findToolbar(header) {
        if (!header) return null;
        return header.querySelector('[data-ui="workflow-toolbar"]');
    },

    getPageWindow() {
        return (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
    },

    getCookie(name) {
        try {
            const win = this.getPageWindow();
            const cookie = (win.document && win.document.cookie) || document.cookie || '';
            const match = cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
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
                if (match) return match[0];
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

    // ── Network capture (verifier_id / inline source; no PostgREST) ───────────

    ensureNetworkCapture(state) {
        if (state.networkSubscribed) return;
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.debug('workflowVerifierTab: NetworkObserver not ready');
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
        Logger.debug('workflowVerifierTab: subscribed for verifier_id / source capture');
    },

    ingestCapturePayload(state, body, meta) {
        const found = this.extractVerifierHints(body);
        if (!found.verifierId && !found.source && !(found.versions && found.versions.length)) {
            return;
        }

        const prev = state.capture || {};
        const next = {
            taskKey: found.taskKey || prev.taskKey || '',
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
            Logger.log(
                'workflowVerifierTab: captured verifier hints' +
                    (next.taskKey ? ' task=' + next.taskKey : '') +
                    (next.verifierId ? ' id=' + next.verifierId.slice(0, 8) + '…' : '') +
                    (next.source ? ' source=' + next.source.length + 'ch' : '') +
                    (meta && meta.urlObj ? ' via ' + meta.urlObj.pathname : '')
            );
        }

        const taskKey = this.resolveTaskKeyFromDom() || next.taskKey;
        if (taskKey && (next.verifierId || next.source)) {
            const entry = state.cache[taskKey] || {};
            state.cache[taskKey] = {
                ...entry,
                verifierId: next.verifierId || entry.verifierId || '',
                teamId: next.teamId || entry.teamId || '',
                source: entry.source || next.source || '',
                version: entry.version != null ? entry.version : next.version,
                versions: entry.versions && entry.versions.length ? entry.versions : next.versions || [],
                sourceFromCapture: !entry.source && !!next.source
            };
        }

        if (state.tabActive) {
            this.syncStatusFromCapture(state);
            if (taskKey && !state.fetchInFlight) {
                const cached = state.cache[taskKey];
                if (cached && cached.source) {
                    void this.renderSource(state, cached.source);
                    this.setStatus(state, this.formatReadyStatus(taskKey, cached));
                } else if (cached && cached.verifierId && state.lastFetchedTaskKey !== taskKey) {
                    void this.fetchVerifier(state, { force: false });
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
                if (keyMatch) out.taskKey = keyMatch[0];
                const verKey = node.key.match(/verifier-(task_[a-z0-9_]+)/i);
                if (verKey) out.taskKey = out.taskKey || verKey[1];
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

    // ── Tab shell ─────────────────────────────────────────────────────────────

    injectTab(state, panel) {
        const existingTab = document.querySelector(`[${VERIFIER_TAB_MARKER}="true"]`);
        const existingPanel = document.querySelector(`[${VERIFIER_PANEL_MARKER}="true"]`);
        if (existingTab && existingPanel) {
            state.verifierTabButton = existingTab;
            state.workflowTabButton = document.querySelector(`[${WORKFLOW_TAB_MARKER}="true"]`);
            state.verifierPanel = existingPanel;
            this.bindPanelControls(state, existingPanel);
            const inner = this.findInnerColumn(panel);
            state.workflowContent = this.findWorkflowContent(inner);
            const header = this.findHeader(inner);
            state.toolbarEl = this.findToolbar(header);
            state.tabInjected = true;
            return;
        }

        const inner = this.findInnerColumn(panel);
        if (!inner) return;
        const header = this.findHeader(inner);
        const workflowContent = this.findWorkflowContent(inner);
        if (!header || !workflowContent) return;

        workflowContent.setAttribute(WORKFLOW_CONTENT_MARKER, 'true');
        state.workflowContent = workflowContent;
        state.toolbarEl = this.findToolbar(header);

        const leftCluster =
            Array.from(header.children).find((el) => !el.querySelector('[data-ui="workflow-toolbar"]')) ||
            header.children[0];
        if (!leftCluster) return;

        leftCluster.className = 'flex items-stretch h-full gap-0 flex-1 min-w-0';
        leftCluster.innerHTML = '';

        const workflowTab = document.createElement('button');
        workflowTab.type = 'button';
        workflowTab.setAttribute('role', 'tab');
        workflowTab.setAttribute('aria-selected', 'true');
        workflowTab.setAttribute('data-state', 'active');
        workflowTab.setAttribute(WORKFLOW_TAB_MARKER, 'true');
        workflowTab.setAttribute('data-fleet-plugin', this.id);
        workflowTab.className = TAB_CLASS_ACTIVE;
        workflowTab.textContent = 'Workflow';
        workflowTab.addEventListener('click', (event) => {
            event.preventDefault();
            this.activateWorkflowTab(state);
        });
        leftCluster.appendChild(workflowTab);

        const verifierTab = document.createElement('button');
        verifierTab.type = 'button';
        verifierTab.setAttribute('role', 'tab');
        verifierTab.setAttribute('aria-selected', 'false');
        verifierTab.setAttribute('data-state', 'inactive');
        verifierTab.setAttribute(VERIFIER_TAB_MARKER, 'true');
        verifierTab.setAttribute('data-fleet-plugin', this.id);
        verifierTab.className = TAB_CLASS_INACTIVE;
        verifierTab.textContent = 'Verifier';
        verifierTab.addEventListener('click', (event) => {
            event.preventDefault();
            this.activateVerifierTab(state);
        });
        leftCluster.appendChild(verifierTab);

        const verifierPanel = this.createVerifierPanel(state);
        inner.appendChild(verifierPanel);

        state.workflowTabButton = workflowTab;
        state.verifierTabButton = verifierTab;
        state.verifierPanel = verifierPanel;
        state.tabInjected = true;

        if (!state.activationLogged) {
            Logger.log('workflowVerifierTab: Workflow | Verifier tabs injected');
            state.activationLogged = true;
        }
    },

    setTabVisual(button, active) {
        if (!button) return;
        button.className = active ? TAB_CLASS_ACTIVE : TAB_CLASS_INACTIVE;
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.setAttribute('data-state', active ? 'active' : 'inactive');
    },

    activateWorkflowTab(state) {
        if (!state.tabActive && state.workflowTabButton) {
            Logger.log('workflowVerifierTab: switched to Workflow');
        }
        state.tabActive = false;
        this.setTabVisual(state.workflowTabButton, true);
        this.setTabVisual(state.verifierTabButton, false);
        if (state.workflowContent) state.workflowContent.style.display = '';
        if (state.verifierPanel) state.verifierPanel.style.display = 'none';
        this.setToolbarVisible(state, true);
    },

    activateVerifierTab(state) {
        if (!state.tabActive) {
            Logger.log('workflowVerifierTab: switched to Verifier');
        }
        state.tabActive = true;
        this.setTabVisual(state.workflowTabButton, false);
        this.setTabVisual(state.verifierTabButton, true);
        if (state.workflowContent) state.workflowContent.style.display = 'none';
        if (state.verifierPanel) state.verifierPanel.style.display = 'flex';
        this.setToolbarVisible(state, false);
        void this.fetchVerifier(state, { force: false });
    },

    setToolbarVisible(state, visible) {
        const toolbar = state.toolbarEl || document.querySelector('[data-ui="workflow-toolbar"]');
        if (!toolbar) return;
        const host = toolbar.parentElement || toolbar;
        host.style.display = visible ? '' : 'none';
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

        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.textContent = 'Refresh';
        refreshBtn.className =
            Context.uiLib && typeof Context.uiLib.btnClass === 'function'
                ? Context.uiLib.btnClass('basic', 'compact')
                : '';
        refreshBtn.addEventListener('click', (event) => {
            event.preventDefault();
            Logger.log('workflowVerifierTab: Refresh clicked');
            void this.fetchVerifier(state, { force: true });
        });
        state.refreshBtn = refreshBtn;
        toolbar.appendChild(refreshBtn);

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
                    'workflowVerifierTab: search — ' +
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
            Logger.debug('workflowVerifierTab: search cleared');
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
        // refs already set during create; keep noop for re-bind after remount recovery
    },

    // ── Fetch + render ────────────────────────────────────────────────────────

    syncStatusFromCapture(state) {
        if (state.fetchInFlight) return;
        const taskKey = this.resolveTaskKeyFromDom() || (state.capture && state.capture.taskKey) || '';
        const cached = taskKey ? state.cache[taskKey] : null;
        if (cached && cached.source) {
            this.setStatus(state, this.formatReadyStatus(taskKey, cached));
            return;
        }
        if (!taskKey) {
            this.setStatus(state, 'Waiting for task key…');
            return;
        }
        if (!(state.capture && state.capture.verifierId) && !(cached && cached.verifierId)) {
            this.setStatus(state, 'Waiting for verifier id from page traffic…');
        }
    },

    formatReadyStatus(taskKey, entry) {
        const bits = [];
        if (taskKey) bits.push(taskKey);
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

    async fetchVerifier(state, options) {
        const force = !!(options && options.force);
        const versionOverride = options && options.version != null ? options.version : null;

        const taskKey = this.resolveTaskKeyFromDom() || (state.capture && state.capture.taskKey) || '';
        if (!taskKey) {
            this.setStatus(state, 'No task key found on this page');
            Logger.warn('workflowVerifierTab: fetch skipped — missing task key');
            return;
        }

        const cached = state.cache[taskKey] || {};
        const capture = state.capture || {};
        const verifierId = cached.verifierId || capture.verifierId || '';
        const teamId = cached.teamId || this.resolveTeamId(state) || '';

        if (!force && cached.source && state.lastFetchedTaskKey === taskKey && versionOverride == null) {
            await this.renderSource(state, cached.source);
            this.updateVersionSelect(state, cached);
            this.setStatus(state, this.formatReadyStatus(taskKey, cached));
            Logger.debug('workflowVerifierTab: using cached source for ' + taskKey);
            return;
        }

        if (!force && capture.source && capture.verifierId === verifierId && versionOverride == null) {
            const entry = {
                ...cached,
                verifierId: verifierId || cached.verifierId,
                teamId,
                source: capture.source,
                version: capture.version,
                versions: capture.versions || cached.versions || [],
                sourceFromCapture: true
            };
            state.cache[taskKey] = entry;
            state.lastFetchedTaskKey = taskKey;
            await this.renderSource(state, entry.source);
            this.updateVersionSelect(state, entry);
            this.setStatus(state, this.formatReadyStatus(taskKey, entry));
            Logger.log('workflowVerifierTab: showing captured source for ' + taskKey);
            return;
        }

        if (!verifierId) {
            this.setStatus(state, 'Waiting for verifier id from page traffic…');
            Logger.debug('workflowVerifierTab: fetch deferred — no verifierId yet for ' + taskKey);
            return;
        }

        const jwt = this.getFleetJwt();
        if (!jwt) {
            this.setStatus(state, 'Sign in to Fleet to load verifier source');
            Logger.warn('workflowVerifierTab: no Fleet session JWT');
            return;
        }

        if (state.fetchInFlight) return;
        state.fetchInFlight = true;
        if (state.refreshBtn) state.refreshBtn.disabled = true;
        this.setStatus(state, 'Loading verifier…');
        Logger.log(
            'workflowVerifierTab: fetching orchestrator verifier ' +
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
                Logger.warn('workflowVerifierTab: orchestrator HTTP ' + res.status, {
                    verifierId,
                    body: String(text).slice(0, 200)
                });
                this.setStatus(state, 'Fetch failed (HTTP ' + res.status + ')');
                return;
            }

            const body = await res.json().catch(() => null);
            const parsed = this.extractOrchestratorSource(body);
            if (!parsed || !parsed.source) {
                Logger.warn('workflowVerifierTab: orchestrator response had no source');
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
            state.cache[taskKey] = entry;
            state.lastFetchedTaskKey = taskKey;
            await this.renderSource(state, entry.source);
            this.updateVersionSelect(state, entry);
            this.setStatus(state, this.formatReadyStatus(taskKey, entry));
            Logger.log(
                'workflowVerifierTab: loaded ' +
                    entry.source.length +
                    ' chars' +
                    (entry.version != null ? ' v' + entry.version : '') +
                    ' for ' +
                    taskKey
            );
        } catch (err) {
            Logger.error('workflowVerifierTab: fetch failed', err);
            this.setStatus(state, 'Fetch error');
        } finally {
            state.fetchInFlight = false;
            if (state.refreshBtn) state.refreshBtn.disabled = false;
        }
    },

    mergeVersions(existing, currentVersion) {
        const list = Array.isArray(existing) ? existing.slice() : [];
        if (currentVersion == null) return list;
        if (!list.some((item) => Number(item.version != null ? item.version : item) === Number(currentVersion))) {
            list.push({ version: currentVersion, isLatest: list.length === 0 });
        }
        return list.sort((a, b) => Number(b.version != null ? b.version : b) - Number(a.version != null ? a.version : a));
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
                if (Context.opsTab && typeof Context.opsTab.scrollVerifierActiveContentMatch === 'function') {
                    Context.opsTab.scrollVerifierActiveContentMatch(codeEl);
                }
            });
        }
    },

    async rerenderCode(state) {
        const taskKey = this.resolveTaskKeyFromDom() || (state.capture && state.capture.taskKey) || '';
        const source =
            (taskKey && state.cache[taskKey] && state.cache[taskKey].source) ||
            (state.capture && state.capture.source) ||
            (state.codeEl && state.codeEl.textContent) ||
            '';
        await this.renderSource(state, source);
    },

    updateSearchUi(state) {
        const count = (state.searchState && state.searchState.matchStarts
            ? state.searchState.matchStarts.length
            : 0);
        const index = state.searchState ? state.searchState.index : 0;
        if (state.matchCountEl) {
            const q = state.searchState && state.searchState.query ? state.searchState.query.trim() : '';
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
        if (!codeEl || !Context.opsTab || typeof Context.opsTab.stepVerifierContentMatchInElement !== 'function') {
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
        Logger.debug('workflowVerifierTab: stepped match to index ' + (state.searchState.index || 0));
    },

    copySource(state, btn) {
        const taskKey = this.resolveTaskKeyFromDom() || (state.capture && state.capture.taskKey) || '';
        const text =
            (taskKey && state.cache[taskKey] && state.cache[taskKey].source) ||
            (state.capture && state.capture.source) ||
            '';
        if (!text) {
            Logger.warn('workflowVerifierTab: copy failed — empty source');
            if (Context.buttonFeedback && btn) Context.buttonFeedback.flashFailure(btn);
            return;
        }
        navigator.clipboard.writeText(text).then(
            () => {
                Logger.log('workflowVerifierTab: copied ' + text.length + ' chars');
                if (Context.buttonFeedback && btn) Context.buttonFeedback.flashSuccess(btn);
            },
            (err) => {
                Logger.error('workflowVerifierTab: clipboard failed', err);
                if (Context.buttonFeedback && btn) Context.buttonFeedback.flashFailure(btn);
            }
        );
    }
};
