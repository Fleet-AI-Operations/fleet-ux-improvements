// ops-tab.js
// Core plugin that owns the Ops settings tab: task link generator, verifier code
// fetcher, password gate, and copy-feedback helpers. Settings UI delegates Ops
// rendering and listener attachment to this module via Context.opsTab.

const OPS_TASK_URL_PREFIX = 'https://www.fleetai.com/dashboard/data/tasks/';
const OPS_GRADE_ASSESSMENTS_URL = 'https://www.fleetai.com/work/assessments/grade/';
const OPS_TASK_ID_FROM_URL_RE = /(?:tasks\/|view-task\/)([^/?#\s]+)/i;
const OPS_TASK_KEY_RE = /task_[A-Za-z0-9_]+/;
const OPS_VERIFIER_KEY_RE = /verifier-task_[A-Za-z0-9_.-]+/;
const OPS_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPS_UUID_FIND_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const COPY_SUCCESS_FLASH_MS = 1000;
const COPY_SUCCESS_GREEN_BG = 'rgb(34, 197, 94)';
const COPY_FAILURE_PULSE_MS = 500;
const COPY_FAILURE_RED_BG = 'rgb(239, 68, 68)';
const OPS_NO_RUNTIME_CONFIG_MESSAGE =
    'Supabase API config not yet discovered. Open a Fleet page that loads dashboard data, then retry.';

async function computeSha256Hex(text) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hex = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    return 'sha256-' + hex;
}

const plugin = {
    id: 'ops-tab',
    name: 'Ops Tab',
    description: 'Provides the Ops tab UI and verifier code fetcher in the settings modal',
    _version: '1.1',
    phase: 'core',
    enabledByDefault: true,

    _opsVerifierFetchState: null,
    _opsVerifierSourceText: '',
    _opsTabState: {
        taskInput: '',
        verifierInput: '',
        verifierStatus: '',
        verifierStatusIsError: false,
        verifierOutput: '',
        verifierFetchState: null
    },

    init(state, context) {
        Context.opsTab = {
            isAccessConfigured: () => this._isOpsAccessConfigured(),
            isEnabled: () => this._getOpsTabEnabled(),
            isWanted: () => this._getOpsTabWanted(),
            hasStoredPassword: () => this._hasOpsStoredPassword(),
            getDefaultTabId: (fallback) => (this._getOpsTabEnabled() ? 'ops' : (fallback || 'information')),
            renderPane: (paneDisplay) => this._renderOpsPane(paneDisplay),
            renderSettingsSection: () => this._renderOpsSettingsSection(),
            attachListeners: (modal, settingsPlugin) => this._attachOpsListeners(modal, settingsPlugin),
            onPaneOpened: (modal, settingsPlugin) => this._onOpsPaneOpened(modal, settingsPlugin),
            captureState: (modal) => this._captureOpsTabState(modal),
            setTabWanted: (enabled) => this._setOpsTabWanted(enabled),
            clearStoredPassword: () => this._clearOpsStoredPassword(),
            fetchVerifierCode: (parsed) => this._fetchOpsVerifierCode(parsed || {}),
            parseVerifierInput: (raw) => this._parseOpsVerifierInput(raw)
        };
        Logger.log('Ops tab module registered (Context.opsTab)');
    },

    _isOpsAccessConfigured() {
        const hash = Context.opsAccess && Context.opsAccess.passwordHash;
        return typeof hash === 'string' && hash.length > 0;
    },

    _getOpsPasswordHash() {
        const hash = Context.opsAccess && Context.opsAccess.passwordHash;
        return typeof hash === 'string' && hash.length > 0 ? hash : null;
    },

    _getOpsTabWanted() {
        return Storage.get('ops-tab-enabled', false);
    },

    _setOpsTabWanted(enabled) {
        Storage.set('ops-tab-enabled', enabled);
    },

    _getOpsStoredPassword() {
        const value = Storage.get('ops-tab-stored-password', '');
        return typeof value === 'string' ? value : '';
    },

    _setOpsStoredPassword(password) {
        Storage.set('ops-tab-stored-password', password);
    },

    _clearOpsStoredPassword() {
        Storage.delete('ops-tab-stored-password');
    },

    _hasOpsStoredPassword() {
        return this._getOpsStoredPassword().length > 0;
    },

    _getOpsTabEnabled() {
        return this._getOpsTabWanted() && this._hasOpsStoredPassword() && this._isOpsAccessConfigured();
    },

    async _verifyOpsPassword(password) {
        const expected = this._getOpsPasswordHash();
        if (!expected || !password) return false;
        try {
            const computed = await computeSha256Hex(password);
            return computed === expected;
        } catch (err) {
            Logger.error('ops-tab: password verification failed', err);
            return false;
        }
    },

    _extractOpsTaskIdentifier(raw) {
        const trimmed = (raw || '').trim();
        if (!trimmed) return '';
        const fromPath = trimmed.match(OPS_TASK_ID_FROM_URL_RE);
        if (fromPath) return fromPath[1];
        const looksLikeUrl = /^https?:\/\//i.test(trimmed) || trimmed.includes('://');
        if (looksLikeUrl) {
            const taskKeyMatch = trimmed.match(OPS_TASK_KEY_RE);
            if (taskKeyMatch) return taskKeyMatch[0];
            const uuidMatch = trimmed.match(OPS_UUID_FIND_RE);
            if (uuidMatch) return uuidMatch[0];
        }
        return trimmed;
    },

    _buildOpsTaskUrl(raw) {
        const id = this._extractOpsTaskIdentifier(raw);
        if (!id) return null;
        if (/^task_/i.test(id) || OPS_UUID_RE.test(id)) {
            return OPS_TASK_URL_PREFIX + id;
        }
        return null;
    },

    _matchOpsJsonString(raw, key) {
        const re = new RegExp('"' + key + '"\\s*:\\s*"([^"]+)"');
        const match = String(raw || '').match(re);
        return match ? match[1] : '';
    },

    _matchOpsJsonNumber(raw, key) {
        const re = new RegExp('"' + key + '"\\s*:\\s*(\\d+)');
        const match = String(raw || '').match(re);
        return match ? Number(match[1]) : null;
    },

    _parseOpsVerifierInput(raw) {
        const text = String(raw || '').trim();
        const fromUrl = this._extractOpsTaskIdentifier(text);
        const verifierKeyMatch = text.match(OPS_VERIFIER_KEY_RE);
        const taskKeyMatch = verifierKeyMatch ? null : text.match(OPS_TASK_KEY_RE);
        const jsonVerifierId = this._matchOpsJsonString(text, 'verifier_id');
        const jsonTeamId = this._matchOpsJsonString(text, 'team_id');
        const jsonVerifierKey = this._matchOpsJsonString(text, 'verifier_key');
        const versionMetadataVerifierKey = text.match(/"version_metadata"\s*:\s*\{[^}]*"verifier_key"\s*:\s*"([^"]+)"/);
        const versionMetadataVerifierVersion = text.match(/"version_metadata"\s*:\s*\{[^}]*"verifier_version"\s*:\s*(\d+)/);
        const versionNo = this._matchOpsJsonNumber(text, 'verifier_version');
        const uuidMatch = text.match(OPS_UUID_FIND_RE);
        const urlOrRawId = String(fromUrl || '').trim();

        const bareUuid = !taskKeyMatch && !jsonTeamId && !jsonVerifierId && uuidMatch ? uuidMatch[0] : '';
        return {
            taskId: OPS_UUID_RE.test(urlOrRawId) ? urlOrRawId : (bareUuid || ''),
            taskKey: /^task_/i.test(urlOrRawId) ? urlOrRawId : (taskKeyMatch ? taskKeyMatch[0] : ''),
            verifierId: jsonVerifierId || bareUuid || '',
            verifierKey: jsonVerifierKey || (versionMetadataVerifierKey ? versionMetadataVerifierKey[1] : '') || (verifierKeyMatch ? verifierKeyMatch[0] : ''),
            teamId: jsonTeamId || '',
            verifierVersion: Number.isFinite(versionNo)
                ? versionNo
                : (versionMetadataVerifierVersion ? Number(versionMetadataVerifierVersion[1]) : null)
        };
    },

    _getOpsPageWindow() {
        try {
            if (typeof Context !== 'undefined' && Context.getPageWindow) {
                return Context.getPageWindow() || window;
            }
        } catch (e) {
            Logger.debug('ops-tab: page window lookup failed', e);
        }
        return window;
    },

    _decodeOpsJwtPayload(jwt) {
        if (!jwt || typeof jwt !== 'string') return null;
        const parts = jwt.split('.');
        if (parts.length !== 3) return null;
        try {
            const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
            return JSON.parse(atob(padded));
        } catch (_e) {
            return null;
        }
    },

    _isOpsSupabaseAnonKey(key) {
        const payload = this._decodeOpsJwtPayload(key);
        return payload && payload.role === 'anon';
    },

    _extractOpsAccessTokenFromValue(value) {
        if (!value || typeof value !== 'string') return '';
        try {
            let candidate = value;
            if (candidate.startsWith('base64-')) {
                candidate = atob(candidate.slice('base64-'.length));
            }
            const parsed = JSON.parse(candidate);
            const direct =
                (parsed && parsed.access_token) ||
                (parsed && parsed.currentSession && parsed.currentSession.access_token) ||
                (parsed && parsed.session && parsed.session.access_token) ||
                (Array.isArray(parsed) && (
                    (parsed[0] && parsed[0].access_token) ||
                    (parsed[1] && parsed[1].access_token) ||
                    (parsed[0] && parsed[0].currentSession && parsed[0].currentSession.access_token) ||
                    (parsed[1] && parsed[1].currentSession && parsed[1].currentSession.access_token) ||
                    (parsed[0] && parsed[0].session && parsed[0].session.access_token) ||
                    (parsed[1] && parsed[1].session && parsed[1].session.access_token)
                ));
            if (typeof direct === 'string' && direct.length > 0) return direct;
        } catch (_e) {
            /* fall through to regex extraction */
        }
        const match = value.match(/"access_token"\s*:\s*"([^"]+)"/);
        return match ? match[1] : '';
    },

    _getOpsSupabaseAccessTokenFromStorage(storage) {
        if (!storage) return '';
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (!key) continue;
            const raw = storage.getItem(key);
            if (!raw) continue;
            const shouldInspect =
                key.startsWith('sb-') ||
                key.toLowerCase().includes('supabase') ||
                raw.includes('"access_token"');
            if (!shouldInspect) continue;
            const token = this._extractOpsAccessTokenFromValue(raw);
            if (token) return token;
        }
        return '';
    },

    _getOpsSupabaseAccessTokenFromCookies(pageWindow) {
        try {
            const cookie = (pageWindow.document && pageWindow.document.cookie) || document.cookie || '';
            if (!cookie) return '';
            const parts = cookie.split(/;\s*/);
            const authParts = parts
                .map(part => {
                    const eq = part.indexOf('=');
                    return eq >= 0 ? [part.slice(0, eq), part.slice(eq + 1)] : [part, ''];
                })
                .filter(([key]) => key.startsWith('sb-') && key.includes('auth-token'));
            const grouped = new Map();
            authParts.forEach(([key, value]) => {
                const base = key.replace(/\.\d+$/, '');
                const indexMatch = key.match(/\.(\d+)$/);
                const index = indexMatch ? Number(indexMatch[1]) : 0;
                if (!grouped.has(base)) grouped.set(base, []);
                grouped.get(base).push({ index, value });
            });
            for (const group of grouped.values()) {
                const decoded = group
                    .sort((a, b) => a.index - b.index)
                    .map(({ value }) => decodeURIComponent(value || ''))
                    .join('');
                const token = this._extractOpsAccessTokenFromValue(decoded);
                if (token) return token;
            }
            for (const [, value] of authParts) {
                const decoded = decodeURIComponent(value || '');
                const token = this._extractOpsAccessTokenFromValue(decoded);
                if (token) return token;
            }
        } catch (e) {
            Logger.debug('ops-tab: cookie token read failed', e);
        }
        return '';
    },

    _getOpsSupabaseAccessToken(pageWindow) {
        const win = pageWindow || this._getOpsPageWindow();
        try {
            return (
                this._getOpsSupabaseAccessTokenFromStorage(win.localStorage) ||
                this._getOpsSupabaseAccessTokenFromStorage(win.sessionStorage) ||
                this._getOpsSupabaseAccessTokenFromCookies(win)
            );
        } catch (e) {
            Logger.debug('ops-tab: token read failed', e);
        }
        return '';
    },

    _extractOpsJwtToken(pageWindow) {
        return this._getOpsSupabaseAccessToken(pageWindow);
    },

    _getOpsRuntimeAccess() {
        if (Context.networkObserver && typeof Context.networkObserver.getRuntimeAccess === 'function') {
            return Context.networkObserver.getRuntimeAccess() || {};
        }
        return {};
    },

    _ensureOpsRuntimeAccess() {
        const access = this._getOpsRuntimeAccess();
        const baseUrl = access.supabaseRestBaseUrl;
        const anonKey = access.supabaseAnonKey;
        if (!baseUrl) {
            throw new Error(OPS_NO_RUNTIME_CONFIG_MESSAGE + ' (missing Supabase REST base URL)');
        }
        if (!anonKey) {
            throw new Error(OPS_NO_RUNTIME_CONFIG_MESSAGE + ' (missing Supabase anon key)');
        }
        return { baseUrl, anonKey, projectRef: access.supabaseProjectRef || null };
    },

    _getOpsPostgrestHeaders() {
        const pageWindow = this._getOpsPageWindow();
        const { anonKey } = this._ensureOpsRuntimeAccess();
        const headers = {
            accept: 'application/json',
            'accept-profile': 'public',
            apikey: anonKey,
            'x-client-info': 'fleet-ux-ops-tab/' + this._version
        };
        const token = this._getOpsSupabaseAccessToken(pageWindow);
        if (token) {
            headers.authorization = 'Bearer ' + token;
        }
        return headers;
    },

    async _opsPostgrestGet(table, params) {
        const { baseUrl } = this._ensureOpsRuntimeAccess();
        const url = new URL(baseUrl + '/' + table);
        Object.entries(params || {}).forEach(([key, value]) => {
            if (value != null && value !== '') url.searchParams.set(key, String(value));
        });
        const headers = this._getOpsPostgrestHeaders();
        if (!headers.authorization) {
            throw new Error('No Fleet session token found. Open Fleet while logged in, then try again.');
        }
        const pageWindow = this._getOpsPageWindow();
        const requestFetch = pageWindow.fetch || fetch;
        const res = await requestFetch.call(pageWindow, url.toString(), {
            method: 'GET',
            headers,
            credentials: 'omit'
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error('Supabase API ' + res.status + ': ' + (text || res.statusText));
        }
        return res.json();
    },

    _extractOpsVerifierHints(source) {
        const out = {
            verifierId: '',
            verifierKey: '',
            verifierVersion: null
        };
        const from = source && typeof source === 'object' ? source : {};
        const meta = typeof from.version_metadata === 'string'
            ? (() => {
                try { return JSON.parse(from.version_metadata); } catch (_e) { return {}; }
            })()
            : (from.version_metadata || {});
        out.verifierId =
            from.verifier_id ||
            from.verifierId ||
            (from.verifier && from.verifier.id) ||
            meta.verifier_id ||
            '';
        out.verifierKey =
            from.verifier_key ||
            from.verifierKey ||
            (from.verifier && from.verifier.key) ||
            meta.verifier_key ||
            '';
        out.verifierVersion = Number.isFinite(from.verifier_version)
            ? from.verifier_version
            : Number.isFinite(meta.verifier_version)
                ? meta.verifier_version
                : null;
        return out;
    },

    async _resolveOpsVerifierFromTask(parsed) {
        if (!parsed.taskKey && !parsed.taskId) return parsed;

        let taskRow = null;
        try {
            const params = { select: 'id,key,current_version_id,team_id', limit: 1 };
            if (parsed.taskKey) params.key = 'eq.' + parsed.taskKey;
            else params.id = 'eq.' + parsed.taskId;
            const rows = await this._opsPostgrestGet('eval_tasks', params);
            taskRow = Array.isArray(rows) ? rows[0] : rows;
            Logger.debug(
                'ops-tab: eval_tasks row id=' + (taskRow && taskRow.id || '(none)') +
                ' current_version_id=' + (taskRow && taskRow.current_version_id || '(none)') +
                ' team_id=' + (taskRow && taskRow.team_id || '(none)')
            );
        } catch (e) {
            Logger.debug('ops-tab: eval_tasks lookup failed', e);
        }

        if (!taskRow) {
            Logger.debug('ops-tab: eval_tasks no row for ' + (parsed.taskKey || parsed.taskId) + ' — treating input as verifier ID');
            return parsed;
        }

        const teamId = parsed.teamId || taskRow.team_id || '';
        const taskId = parsed.taskId || taskRow.id || '';
        const taskKey = parsed.taskKey || taskRow.key || '';

        let verifierId = '';
        let verifierKey = '';
        let verifierVersion = null;
        if (taskRow.current_version_id) {
            try {
                const vRows = await this._opsPostgrestGet('eval_task_versions', {
                    select: 'verifier_id,metadata',
                    id: 'eq.' + taskRow.current_version_id,
                    limit: 1
                });
                const vRow = Array.isArray(vRows) ? vRows[0] : vRows;
                if (vRow) {
                    verifierId = vRow.verifier_id || '';
                    verifierKey = (vRow.metadata && vRow.metadata.verifier_key) || '';
                    verifierVersion = (vRow.metadata && vRow.metadata.verifier_version) != null
                        ? vRow.metadata.verifier_version
                        : null;
                    Logger.debug(
                        'ops-tab: eval_task_versions verifier_id=' + (verifierId || '(none)') +
                        ' key=' + (verifierKey || '(none)') +
                        ' version=' + (verifierVersion == null ? '(none)' : verifierVersion)
                    );
                }
            } catch (e) {
                Logger.debug('ops-tab: eval_task_versions lookup failed', e);
            }
        } else {
            Logger.debug('ops-tab: eval_tasks had no current_version_id');
        }

        return {
            ...parsed,
            taskId,
            taskKey,
            teamId,
            verifierId: verifierId || parsed.verifierId || '',
            verifierKey: verifierKey || parsed.verifierKey || '',
            verifierVersion: verifierVersion != null ? verifierVersion : (parsed.verifierVersion != null ? parsed.verifierVersion : null)
        };
    },

    async _resolveOpsVerifierByTaskKey(taskKey, teamId) {
        if (!taskKey) return null;
        const prefix = 'verifier-' + taskKey + '-';
        const params = {
            select: 'id,key',
            key: 'like.' + prefix + '%',
            order: 'created_at.desc',
            limit: 1
        };
        if (teamId) params.team_id = 'eq.' + teamId;
        try {
            const rows = await this._opsPostgrestGet('verifiers', params);
            const row = Array.isArray(rows) ? rows[0] : rows;
            if (row && row.id) return { verifierId: row.id, verifierKey: row.key || '' };
        } catch (e) {
            Logger.debug('ops-tab: verifiers task-key like-query failed', e);
        }
        return null;
    },

    async _resolveOpsVerifierId(parsed) {
        const resolved = await this._resolveOpsVerifierFromTask(parsed);
        if (resolved.verifierId) return resolved;

        if (resolved.verifierKey) {
            const params = {
                select: 'id',
                key: 'eq.' + resolved.verifierKey,
                limit: 1
            };
            if (resolved.teamId) params.team_id = 'eq.' + resolved.teamId;
            const rows = await this._opsPostgrestGet('verifiers', params);
            const row = Array.isArray(rows) ? rows[0] : rows;
            if (!row || !row.id) {
                throw new Error('No verifier found for key: ' + resolved.verifierKey + '.');
            }
            return { ...resolved, verifierId: row.id };
        }

        const taskKey = resolved.taskKey;
        if (taskKey) {
            const match = await this._resolveOpsVerifierByTaskKey(taskKey, resolved.teamId);
            if (match) {
                return { ...resolved, verifierId: match.verifierId, verifierKey: match.verifierKey };
            }
        }

        throw new Error(
            'Could not find a verifier for this task. ' +
            'Try pasting a verifier ID, verifier key, or a seed snippet containing "verifier_id".'
        );
    },

    async _resolveOpsTeamId(pageWindow) {
        try {
            const params = { select: 'team_id', limit: 1 };
            const rows = await this._opsPostgrestGet('team_members', params);
            const row = Array.isArray(rows) ? rows[0] : rows;
            if (row && row.team_id) {
                Logger.debug('ops-tab: resolved team_id from team_members: ' + row.team_id);
                return row.team_id;
            }
        } catch (e) {
            Logger.debug('ops-tab: team_members lookup failed', e);
        }
        return '';
    },

    _extractOpsOrchestratorVerifierSource(payload) {
        if (!payload || typeof payload !== 'object') return null;
        const seen = new Set();
        const queue = [payload];
        while (queue.length > 0) {
            const node = queue.shift();
            if (!node || typeof node !== 'object') continue;
            if (seen.has(node)) continue;
            seen.add(node);
            // Orchestrator returns `code`; Supabase verifier_versions uses `display_src`
            const src = (typeof node.display_src === 'string' && node.display_src.length > 0)
                ? node.display_src
                : (typeof node.code === 'string' && node.code.length > 0)
                    ? node.code
                    : null;
            if (src) {
                return {
                    source: src,
                    version: Number.isFinite(node.version) ? node.version : null,
                    versionId: node.id || node.verifier_id || null,
                    createdAt: node.created_at || null
                };
            }
            Object.values(node).forEach(v => {
                if (v && typeof v === 'object') queue.push(v);
            });
        }
        return null;
    },

    async _fetchOpsVerifierCodeFromOrchestrator(resolved) {
        const pageWindow = this._getOpsPageWindow();
        const jwt = this._extractOpsJwtToken(pageWindow);
        if (!jwt) {
            Logger.debug('ops-tab: orchestrator skipped — no JWT');
            return null;
        }
        if (!resolved.verifierId) {
            Logger.debug('ops-tab: orchestrator skipped — no verifier_id');
            return null;
        }
        let teamId = resolved.teamId;
        if (!teamId) {
            Logger.debug('ops-tab: orchestrator — no teamId in resolved, attempting team discovery');
            teamId = await this._resolveOpsTeamId(pageWindow);
        }
        if (!teamId) {
            Logger.debug('ops-tab: orchestrator — no team_id after discovery, will attempt without it');
        }
        const requestFetch = pageWindow.fetch || fetch;
        const versionQuery = resolved.verifierVersion != null ? '?version=' + encodeURIComponent(resolved.verifierVersion) : '';
        const url = 'https://orchestrator.fleetai.com/v1/verifiers/' + encodeURIComponent(resolved.verifierId) + versionQuery;
        const requestHeaders = { accept: 'application/json', 'x-jwt-token': jwt };
        if (teamId) requestHeaders['x-team-id'] = teamId;
        Logger.debug('ops-tab: orchestrator fetch ' + url, {
            teamId: teamId || '(none)'
        });
        try {
            const res = await requestFetch.call(pageWindow, url, {
                method: 'GET',
                headers: requestHeaders,
                credentials: 'omit'
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                Logger.debug('ops-tab: orchestrator HTTP ' + res.status + ' for ' + resolved.verifierId, text.slice(0, 200));
                return null;
            }
            const body = await res.json().catch(() => null);
            Logger.debug('ops-tab: orchestrator response keys', body ? Object.keys(body).join(', ') : 'null');
            const parsedSource = this._extractOpsOrchestratorVerifierSource(body);
            if (!parsedSource || !parsedSource.source) {
                Logger.debug('ops-tab: orchestrator response had no display_src');
                return null;
            }
            Logger.debug('ops-tab: orchestrator got source (' + parsedSource.source.length + ' chars) v' + parsedSource.version);
            return {
                ...resolved,
                teamId: teamId || resolved.teamId,
                version: parsedSource.version,
                versionId: parsedSource.versionId,
                createdAt: parsedSource.createdAt,
                source: parsedSource.source
            };
        } catch (e) {
            Logger.debug('ops-tab: orchestrator fetch threw', e);
            return null;
        }
    },

    _formatOpsVerifierVersionLabel(entry, isLatest) {
        const versionText = entry.version != null ? 'v' + entry.version : 'unknown version';
        const dateText = entry.createdAt ? entry.createdAt.slice(0, 10) : '';
        const latestText = isLatest ? ' · latest' : '';
        return dateText ? versionText + ' · ' + dateText + latestText : versionText + latestText;
    },

    async _listOpsVerifierVersions(resolved) {
        if (!resolved || !resolved.verifierId) return [];
        try {
            const rows = await this._opsPostgrestGet('verifier_versions', {
                select: 'id,version,created_at',
                verifier_id: 'eq.' + resolved.verifierId,
                order: 'version.desc'
            });
            const list = Array.isArray(rows) ? rows : (rows ? [rows] : []);
            return list
                .filter(row => row && row.version != null)
                .map(row => ({
                    version: row.version,
                    versionId: row.id,
                    createdAt: row.created_at || ''
                }));
        } catch (e) {
            Logger.debug('ops-tab: list verifier versions failed', e);
            return [];
        }
    },

    async _fetchOpsVerifierCodeForVersion(resolved, version) {
        const request = {
            ...resolved,
            verifierVersion: version != null ? version : resolved.verifierVersion
        };
        const orchestratorResult = await this._fetchOpsVerifierCodeFromOrchestrator(request);
        if (orchestratorResult) return orchestratorResult;

        const params = {
            select: 'id,version,created_at,display_src',
            verifier_id: 'eq.' + resolved.verifierId,
            order: 'version.desc'
        };
        if (version != null) {
            params.version = 'eq.' + version;
            delete params.order;
        }
        Logger.debug('ops-tab: verifier_versions fetch params', JSON.stringify(params));
        const rows = await this._opsPostgrestGet('verifier_versions', params);
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!row) {
            const hint = resolved.teamId
                ? 'The verifier_versions table returned no rows for team ' + resolved.teamId.slice(0, 8) + '…'
                : 'The verifier_versions table may require a team context that could not be resolved automatically.';
            throw new Error('No verifier version found for ' + resolved.verifierId + '. ' + hint);
        }
        if (!row.display_src) {
            throw new Error('Verifier version ' + (row.version != null ? row.version : '?') + ' has no display_src.');
        }
        return {
            ...resolved,
            version: row.version,
            versionId: row.id,
            createdAt: row.created_at,
            source: row.display_src
        };
    },

    async _fetchOpsVerifierCode(parsed) {
        Logger.debug('ops-tab: verifier fetch start', {
            taskKey: parsed.taskKey || '(none)',
            taskId: parsed.taskId || '(none)',
            verifierId: parsed.verifierId || '(none)',
            verifierKey: parsed.verifierKey || '(none)',
            teamId: parsed.teamId || '(none)',
            verifierVersion: parsed.verifierVersion != null ? parsed.verifierVersion : '(none)'
        });
        const resolved = await this._resolveOpsVerifierId(parsed);
        Logger.debug('ops-tab: verifier resolved', {
            verifierId: resolved.verifierId || '(none)',
            verifierKey: resolved.verifierKey || '(none)',
            teamId: resolved.teamId || '(none)'
        });

        const versions = await this._listOpsVerifierVersions(resolved);
        Logger.debug('ops-tab: verifier versions listed: ' + versions.length);

        const defaultVersion = parsed.verifierVersion != null
            ? parsed.verifierVersion
            : (versions[0] ? versions[0].version : null);
        const result = await this._fetchOpsVerifierCodeForVersion(resolved, defaultVersion);

        return {
            ...result,
            versions,
            selectedVersion: result.version != null ? result.version : defaultVersion
        };
    },

    _clearOpsCopyButtonFeedback(button) {
        if (!button) return;
        if (button._copySuccessFlashTimeout) {
            clearTimeout(button._copySuccessFlashTimeout);
            button._copySuccessFlashTimeout = null;
        }
        if (button._copyFailurePulseTimeout) {
            clearTimeout(button._copyFailurePulseTimeout);
            button._copyFailurePulseTimeout = null;
        }
        button.style.transition = '';
        button.style.backgroundColor = '';
        button.style.color = '';
    },

    _showOpsCopySuccessFlash(button) {
        this._clearOpsCopyButtonFeedback(button);
        button.style.backgroundColor = COPY_SUCCESS_GREEN_BG;
        button.style.color = '#ffffff';
        button._copySuccessFlashTimeout = setTimeout(() => {
            button.style.backgroundColor = '';
            button.style.color = '';
            button._copySuccessFlashTimeout = null;
        }, COPY_SUCCESS_FLASH_MS);
    },

    _showOpsCopyFailurePulse(button) {
        this._clearOpsCopyButtonFeedback(button);
        const prevTransition = button.style.transition;
        button.style.transition = 'none';
        button.style.backgroundColor = COPY_FAILURE_RED_BG;
        button.style.color = '#ffffff';
        void button.offsetHeight;
        button.style.transition = 'background-color ' + COPY_FAILURE_PULSE_MS + 'ms ease-out, color ' + COPY_FAILURE_PULSE_MS + 'ms ease-out';
        button.style.backgroundColor = '';
        button.style.color = '';
        button._copyFailurePulseTimeout = setTimeout(() => {
            button.style.transition = prevTransition || '';
            button._copyFailurePulseTimeout = null;
        }, COPY_FAILURE_PULSE_MS);
    },

    async _copyOpsTextToClipboard(text) {
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

    _opsQuery(modal, selector, contextSuffix) {
        if (!modal) return null;
        if (Context.dom && typeof Context.dom.query === 'function') {
            return Context.dom.query(selector, {
                root: modal,
                context: 'ops-tab.' + (contextSuffix || 'query')
            });
        }
        return modal.querySelector(selector);
    },

    _updateOpsTaskLinkUI(modal) {
        const input = this._opsQuery(modal, '#wf-ops-task-input', 'taskInput');
        const linkRow = this._opsQuery(modal, '#wf-ops-link-row', 'linkRow');
        const openBtn = this._opsQuery(modal, '#wf-ops-open-link', 'openLink');
        const openNewTabBtn = this._opsQuery(modal, '#wf-ops-open-link-new-tab', 'openLinkNewTab');
        const copyBtn = this._opsQuery(modal, '#wf-ops-copy-link', 'copyLink');
        if (!input || !linkRow || !openBtn || !openNewTabBtn || !copyBtn) return;

        const url = this._buildOpsTaskUrl(input.value);
        if (!url) {
            linkRow.style.display = 'none';
            openBtn.removeAttribute('data-wf-ops-url');
            openNewTabBtn.removeAttribute('data-wf-ops-url');
            copyBtn.removeAttribute('data-wf-ops-url');
            return;
        }

        linkRow.style.display = 'flex';
        openBtn.setAttribute('data-wf-ops-url', url);
        openNewTabBtn.setAttribute('data-wf-ops-url', url);
        copyBtn.setAttribute('data-wf-ops-url', url);
    },

    _setOpsVerifierStatus(modal, message, isError) {
        const status = this._opsQuery(modal, '#wf-ops-verifier-status', 'verifierStatus');
        if (!status) return;
        status.textContent = message || '';
        status.style.display = message ? 'block' : 'none';
        status.style.color = isError ? '#dc2626' : 'var(--muted-foreground, #666)';
    },

    async _setOpsVerifierOutput(modal, value) {
        const wrap = this._opsQuery(modal, '#wf-ops-verifier-output-wrap', 'verifierOutputWrap');
        const output = this._opsQuery(modal, '#wf-ops-verifier-output', 'verifierOutput');
        const copyBtn = this._opsQuery(modal, '#wf-ops-copy-verifier', 'verifierCopy');
        const text = value || '';
        this._opsVerifierSourceText = text;

        if (wrap) {
            wrap.style.display = text ? 'block' : 'none';
        }
        if (output) {
            if (Context.highlightJs && typeof Context.highlightJs.highlightCodeElement === 'function') {
                await Context.highlightJs.highlightCodeElement(output, { text, language: 'python' });
            } else if (Context.highlightJs && typeof Context.highlightJs.setPlainCode === 'function') {
                Context.highlightJs.setPlainCode(output, text);
            } else {
                output.textContent = text;
                output.className = text ? 'language-python' : 'language-plaintext';
            }
        }
        if (copyBtn) {
            copyBtn.disabled = !text;
            copyBtn.style.opacity = text ? '1' : '0.55';
            copyBtn.style.cursor = text ? 'pointer' : 'not-allowed';
        }
    },

    _clearOpsVerifierVersionPicker(modal) {
        const select = this._opsQuery(modal, '#wf-ops-verifier-version', 'verifierVersionClear');
        if (select) {
            select.innerHTML = '';
            select.style.display = 'none';
            select.disabled = false;
        }
        this._opsVerifierFetchState = null;
    },

    _setOpsVerifierVersionPicker(modal, resolved, versions, selectedVersion) {
        const select = this._opsQuery(modal, '#wf-ops-verifier-version', 'verifierVersionSet');
        if (!select) return;

        select.innerHTML = '';
        if (!Array.isArray(versions) || versions.length <= 1) {
            select.style.display = 'none';
            this._opsVerifierFetchState = (versions && versions.length === 1)
                ? { resolved, versions, selectedVersion: versions[0].version }
                : null;
            return;
        }

        versions.forEach((entry, index) => {
            const option = document.createElement('option');
            option.value = String(entry.version);
            option.textContent = this._formatOpsVerifierVersionLabel(entry, index === 0);
            select.appendChild(option);
        });

        const selected = selectedVersion != null ? String(selectedVersion) : String(versions[0].version);
        if ([...select.options].some(opt => opt.value === selected)) {
            select.value = selected;
        }

        select.style.display = 'block';
        this._opsVerifierFetchState = { resolved, versions, selectedVersion: Number(select.value) };
        Logger.debug('ops-tab: verifier version picker shown (' + versions.length + ' versions)');
    },

    _captureOpsTabState(modal) {
        if (!modal) return;
        const taskInput = this._opsQuery(modal, '#wf-ops-task-input', 'taskInputCapture');
        const verifierInput = this._opsQuery(modal, '#wf-ops-verifier-input', 'verifierInputCapture');
        const status = this._opsQuery(modal, '#wf-ops-verifier-status', 'verifierStatusCapture');
        const fetchState = this._opsVerifierFetchState;
        this._opsTabState = {
            taskInput: taskInput ? taskInput.value : '',
            verifierInput: verifierInput ? verifierInput.value : '',
            verifierStatus: status && status.style.display !== 'none' ? (status.textContent || '') : '',
            verifierStatusIsError: status ? status.style.color === '#dc2626' : false,
            verifierOutput: this._opsVerifierSourceText || '',
            verifierFetchState: fetchState
                ? {
                    resolved: fetchState.resolved,
                    versions: fetchState.versions,
                    selectedVersion: fetchState.selectedVersion
                }
                : null
        };
    },

    _restoreOpsTabState(modal) {
        if (!modal) return;
        const state = this._opsTabState;
        if (!state) return;

        const taskInput = this._opsQuery(modal, '#wf-ops-task-input', 'taskInputRestore');
        if (taskInput && state.taskInput) {
            taskInput.value = state.taskInput;
            this._updateOpsTaskLinkUI(modal);
        }

        const verifierInput = this._opsQuery(modal, '#wf-ops-verifier-input', 'verifierInputRestore');
        if (verifierInput && state.verifierInput) {
            verifierInput.value = state.verifierInput;
        }

        if (state.verifierStatus) {
            this._setOpsVerifierStatus(modal, state.verifierStatus, state.verifierStatusIsError);
        }

        if (state.verifierOutput) {
            void this._setOpsVerifierOutput(modal, state.verifierOutput);
        }

        if (state.verifierFetchState && state.verifierFetchState.versions && state.verifierFetchState.versions.length) {
            this._setOpsVerifierVersionPicker(
                modal,
                state.verifierFetchState.resolved,
                state.verifierFetchState.versions,
                state.verifierFetchState.selectedVersion
            );
        } else {
            this._opsVerifierFetchState = null;
        }
    },

    _setOpsPasswordPanelVisible(modal, visible) {
        const panel = this._opsQuery(modal, '#wf-ops-password-panel', 'opsPasswordPanel');
        if (panel) {
            panel.style.display = visible ? 'block' : 'none';
        }
    },

    _setOpsPasswordError(modal, message) {
        const err = this._opsQuery(modal, '#wf-ops-password-error', 'opsPasswordError');
        if (!err) return;
        if (message) {
            err.textContent = message;
            err.style.display = 'block';
        } else {
            err.textContent = '';
            err.style.display = 'none';
        }
    },

    async _submitOpsPassword(modal, toggle, settingsPlugin) {
        const input = this._opsQuery(modal, '#wf-ops-password-input', 'opsPasswordInputSubmit');
        if (!input) return false;

        const password = input.value;
        if (!password) {
            this._setOpsPasswordError(modal, 'Enter a password.');
            Logger.warn('ops-tab: password empty');
            return false;
        }

        const ok = await this._verifyOpsPassword(password);
        if (!ok) {
            this._setOpsPasswordError(modal, 'Incorrect password.');
            Logger.warn('ops-tab: password rejected');
            return false;
        }

        this._setOpsStoredPassword(password);
        input.value = '';
        this._setOpsPasswordError(modal, '');
        this._setOpsTabWanted(true);
        this._setOpsPasswordPanelVisible(modal, false);
        if (toggle) {
            toggle.checked = true;
            if (settingsPlugin && typeof settingsPlugin.handleToggleChange === 'function') {
                settingsPlugin.handleToggleChange({ target: toggle });
            }
        }
        Logger.log('ops-tab: password saved on device');
        if (settingsPlugin && typeof settingsPlugin.rebuildSettingsTabRow === 'function') {
            settingsPlugin.rebuildSettingsTabRow(modal, null, { keepCurrentPane: true });
        }
        return true;
    },

    async _revalidateOpsStoredPassword(modal, settingsPlugin) {
        if (!this._hasOpsStoredPassword() || !this._isOpsAccessConfigured()) return;
        const ok = await this._verifyOpsPassword(this._getOpsStoredPassword());
        if (ok) return;
        this._clearOpsStoredPassword();
        if (this._getOpsTabWanted()) {
            this._setOpsPasswordPanelVisible(modal, true);
        }
        if (settingsPlugin && typeof settingsPlugin.rebuildSettingsTabRow === 'function') {
            settingsPlugin.rebuildSettingsTabRow(modal, 'information');
        }
        Logger.debug('ops-tab: cleared invalid stored password');
    },

    _renderOpsSettingsSection() {
        const opsWantsEnabled = this._getOpsTabWanted();
        const opsHasStoredPassword = this._hasOpsStoredPassword();
        const opsNeedsPassword = opsWantsEnabled && !opsHasStoredPassword;
        const switchHTML = this._renderOpsSwitchHTML('wf-ops-tab-enabled', opsWantsEnabled);
        const passwordPanelDisplay = opsNeedsPassword ? 'block' : 'none';
        return `
            <!-- Ops Tab Toggle -->
            <div style="margin-bottom: 20px;">
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border: 1px solid var(--border, #e5e5e5); border-radius: 8px; background: var(--card, #fafafa);">
                    <div style="min-width: 0; padding-right: 10px;">
                        <div style="font-size: 14px; font-weight: 600; color: var(--foreground, #333);">Enable Ops Tab</div>
                        <div style="font-size: 12px; color: var(--muted-foreground, #666); margin-top: 4px; line-height: 1.45;">
                            Adds an Ops tab with operator tools. Enter the Ops password once; it is saved on this device.
                        </div>
                    </div>
                    ${switchHTML}
                </div>
                <div id="wf-ops-password-panel" style="display: ${passwordPanelDisplay}; margin-top: 10px; padding: 12px 14px; border: 1px solid var(--border, #e5e5e5); border-radius: 8px; background: var(--card, #fafafa);">
                    <label for="wf-ops-password-input" style="display: block; font-size: 12px; font-weight: 500; color: var(--foreground, #333); margin-bottom: 6px;">Ops password</label>
                    <div style="display: flex; gap: 8px; align-items: stretch;">
                        <input type="password" id="wf-ops-password-input" autocomplete="current-password" placeholder="Enter password" style="
                            flex: 1;
                            min-width: 0;
                            padding: 8px 12px;
                            font-size: 13px;
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                            background: var(--background, white);
                            color: var(--foreground, #333);
                            box-sizing: border-box;
                        ">
                        <button type="button" id="wf-ops-password-submit" style="
                            flex-shrink: 0;
                            padding: 8px 14px;
                            font-size: 13px;
                            font-weight: 600;
                            color: white;
                            background: var(--brand, #4f46e5);
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                        ">Unlock</button>
                    </div>
                    <div id="wf-ops-password-error" style="display: none; margin-top: 8px; font-size: 12px; color: #dc2626; line-height: 1.45;"></div>
                </div>
            </div>`;
    },

    _renderOpsSwitchHTML(id, isEnabled) {
        const sliderBg = isEnabled ? '#22c55e' : '#ccc';
        const knobLeftOn = 23;
        const knobLeftOff = 3;
        const knobBottom = 3;
        const knobLeft = isEnabled ? knobLeftOn : knobLeftOff;
        return `
            <label style="position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0;">
                <input type="checkbox" id="${id}" ${isEnabled ? 'checked' : ''} style="opacity: 0; width: 0; height: 0; position: absolute;">
                <span class="wf-toggle-slider" style="
                    position: absolute;
                    cursor: pointer;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-color: ${sliderBg};
                    transition: 0.2s;
                    border-radius: 24px;
                " data-wf-on-color="#22c55e" data-wf-knob-left-on="${knobLeftOn}" data-wf-knob-left-off="${knobLeftOff}" data-wf-knob-bottom="${knobBottom}">
                    <span style="
                        position: absolute;
                        height: 18px;
                        width: 18px;
                        left: ${knobLeft}px;
                        bottom: ${knobBottom}px;
                        background-color: white;
                        transition: 0.2s;
                        border-radius: 50%;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                    "></span>
                </span>
            </label>
        `;
    },

    _renderOpsPane(paneDisplay) {
        const display = paneDisplay || 'none';
        return `
            <div id="wf-settings-pane-ops" data-tab="ops" class="wf-settings-pane" style="display: ${display}; overflow-y: auto; min-height: 200px;">
                <div style="margin-bottom: 16px;">
                    <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: var(--foreground, #333);">
                        Task View Link Generator
                    </h3>
                    <input type="text" id="wf-ops-task-input" placeholder="Paste task key or UUID" autocomplete="off" style="
                        width: 100%;
                        padding: 8px 12px;
                        font-size: 13px;
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        background: var(--background, white);
                        color: var(--foreground, #333);
                        box-sizing: border-box;
                    ">
                </div>
                <div id="wf-ops-link-row" style="display: none; align-items: stretch; gap: 8px;">
                    <button type="button" id="wf-ops-open-link" style="
                        flex: 1;
                        min-width: 0;
                        padding: 10px 12px;
                        font-size: 12px;
                        font-weight: 500;
                        text-align: center;
                        color: var(--brand, #4f46e5);
                        background: var(--card, #fafafa);
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        cursor: pointer;
                        transition: background 0.2s;
                    ">Open</button>
                    <button type="button" id="wf-ops-open-link-new-tab" style="
                        flex: 1;
                        min-width: 0;
                        padding: 10px 12px;
                        font-size: 12px;
                        font-weight: 500;
                        text-align: center;
                        color: var(--brand, #4f46e5);
                        background: var(--card, #fafafa);
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        cursor: pointer;
                        transition: background 0.2s;
                    ">Open in New Tab</button>
                    <button type="button" id="wf-ops-copy-link" title="Copy link" aria-label="Copy link" style="
                        flex-shrink: 0;
                        padding: 10px 12px;
                        font-size: 12px;
                        font-weight: 500;
                        color: var(--foreground, #333);
                        background: var(--card, #fafafa);
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        cursor: pointer;
                        transition: background 0.2s, color 0.2s;
                    ">Copy</button>
                </div>
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border, #e5e5e5);">
                    <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: var(--foreground, #333);">
                        Verifier Code Fetcher
                    </h3>
                    <p style="font-size: 12px; color: var(--muted-foreground, #666); margin: 0 0 10px 0; line-height: 1.45;">
                        Paste a task key, task URL, verifier key, verifier ID, or copied seed data.
                    </p>
                    <input type="text" id="wf-ops-verifier-input" placeholder="Paste here" autocomplete="off" style="
                        width: 100%;
                        padding: 8px 12px;
                        font-size: 12px;
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        background: var(--background, white);
                        color: var(--foreground, #333);
                        box-sizing: border-box;
                        font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
                    ">
                    <div style="display: flex; align-items: stretch; gap: 8px; margin-top: 8px;">
                        <button type="button" id="wf-ops-fetch-verifier" style="
                            flex: 1;
                            padding: 10px 12px;
                            font-size: 12px;
                            font-weight: 600;
                            color: white;
                            background: var(--brand, #4f46e5);
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                        ">Fetch Verifier</button>
                        <button type="button" id="wf-ops-copy-verifier" disabled style="
                            flex-shrink: 0;
                            padding: 10px 12px;
                            font-size: 12px;
                            font-weight: 500;
                            color: var(--foreground, #333);
                            background: var(--card, #fafafa);
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                            cursor: pointer;
                            opacity: 0.55;
                            transition: background 0.2s, color 0.2s, opacity 0.2s;
                        ">Copy Code</button>
                    </div>
                    <div id="wf-ops-verifier-status" style="display: none; margin-top: 8px; font-size: 12px; color: var(--muted-foreground, #666); line-height: 1.45;"></div>
                    <select id="wf-ops-verifier-version" aria-label="Verifier version" style="
                        display: none;
                        width: 100%;
                        margin-top: 8px;
                        padding: 8px 12px;
                        font-size: 12px;
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        background: var(--background, white);
                        color: var(--foreground, #333);
                        box-sizing: border-box;
                        font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
                    "></select>
                    <div id="wf-ops-verifier-output-wrap" style="
                        display: none;
                        width: 100%;
                        margin-top: 8px;
                    ">
                        <pre style="
                            width: 100%;
                            margin: 0;
                            padding: 8px 12px;
                            font-size: 12px;
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                            background: var(--card, #fafafa);
                            color: var(--foreground, #333);
                            box-sizing: border-box;
                            max-height: 320px;
                            overflow: auto;
                            white-space: pre-wrap;
                            word-break: break-word;
                            font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
                        "><code id="wf-ops-verifier-output" class="language-python"></code></pre>
                    </div>
                </div>
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border, #e5e5e5);">
                    <a href="${OPS_GRADE_ASSESSMENTS_URL}" target="_blank" rel="noopener noreferrer" id="wf-ops-grade-assessments" style="
                        display: block;
                        width: 100%;
                        padding: 10px 16px;
                        font-size: 13px;
                        font-weight: 600;
                        text-align: center;
                        text-decoration: none;
                        color: white;
                        background: var(--brand, #4f46e5);
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        box-sizing: border-box;
                        transition: background 0.2s;
                    ">Grade Assessments</a>
                </div>
            </div>
        `;
    },

    async _handleOpsVerifierFetch(modal) {
        const input = this._opsQuery(modal, '#wf-ops-verifier-input', 'verifierInput');
        const fetchBtn = this._opsQuery(modal, '#wf-ops-fetch-verifier', 'verifierFetch');
        if (!input) return;
        const parsed = this._parseOpsVerifierInput(input.value);
        if (!parsed.taskKey && !parsed.taskId && !parsed.verifierKey && !parsed.verifierId) {
            this._setOpsVerifierStatus(modal, 'Paste a task key, task URL, verifier key, verifier ID, or seed data first.', true);
            void this._setOpsVerifierOutput(modal, '');
            this._captureOpsTabState(modal);
            return;
        }
        if (fetchBtn) {
            fetchBtn.disabled = true;
            fetchBtn.textContent = 'Fetching...';
        }
        this._setOpsVerifierStatus(modal, 'Fetching verifier code...');
        this._clearOpsVerifierVersionPicker(modal);
        void this._setOpsVerifierOutput(modal, '');
        Logger.debug('ops-tab: handle verifier fetch', {
            input: (input.value || '').slice(0, 120),
            parsed: {
                taskKey: parsed.taskKey || '',
                taskId: parsed.taskId || '',
                verifierId: parsed.verifierId || '',
                verifierKey: parsed.verifierKey || '',
                teamId: parsed.teamId || ''
            }
        });
        try {
            const result = await this._fetchOpsVerifierCode(parsed);
            this._setOpsVerifierVersionPicker(modal, result, result.versions || [], result.selectedVersion);
            await this._setOpsVerifierOutput(modal, result.source);
            const versionText = result.version != null ? 'v' + result.version : 'latest version';
            const teamNote = result.teamId ? ' (team ' + result.teamId.slice(0, 8) + '...)' : '';
            this._setOpsVerifierStatus(
                modal,
                'Fetched ' + versionText + ' (' + result.source.length + ' chars)' + teamNote + '.'
            );
            Logger.log('ops-tab: verifier fetched ' + result.verifierId + ' ' + versionText);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this._setOpsVerifierStatus(modal, message, true);
            Logger.warn('ops-tab: verifier fetch failed', e);
        } finally {
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.textContent = 'Fetch Verifier';
            }
            this._captureOpsTabState(modal);
        }
    },

    async _handleOpsVerifierVersionChange(modal) {
        const select = this._opsQuery(modal, '#wf-ops-verifier-version', 'verifierVersionChange');
        const state = this._opsVerifierFetchState;
        if (!select || !state || !state.resolved) return;

        const version = Number(select.value);
        if (!Number.isFinite(version)) return;

        state.selectedVersion = version;
        select.disabled = true;
        this._setOpsVerifierStatus(modal, 'Loading verifier v' + version + '...');
        try {
            const result = await this._fetchOpsVerifierCodeForVersion(state.resolved, version);
            await this._setOpsVerifierOutput(modal, result.source);
            const teamNote = result.teamId ? ' (team ' + result.teamId.slice(0, 8) + '...)' : '';
            this._setOpsVerifierStatus(
                modal,
                'Showing v' + (result.version != null ? result.version : version) +
                ' (' + result.source.length + ' chars)' + teamNote + '.'
            );
            Logger.log('ops-tab: verifier version selected ' + result.verifierId + ' v' + (result.version != null ? result.version : version));
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this._setOpsVerifierStatus(modal, message, true);
            Logger.warn('ops-tab: verifier version change failed', e);
        } finally {
            select.disabled = false;
            this._captureOpsTabState(modal);
        }
    },

    _attachOpsPasswordListeners(modal, settingsPlugin) {
        if (!modal || modal.dataset.wfOpsPasswordListenersAttached === '1') return;
        modal.dataset.wfOpsPasswordListenersAttached = '1';

        const submitBtn = this._opsQuery(modal, '#wf-ops-password-submit', 'opsPasswordSubmit');
        const input = this._opsQuery(modal, '#wf-ops-password-input', 'opsPasswordInputAttach');
        const toggle = this._opsQuery(modal, '#wf-ops-tab-enabled', 'opsTabTogglePassword');

        const submit = () => {
            void this._submitOpsPassword(modal, toggle, settingsPlugin);
        };

        if (submitBtn) {
            submitBtn.addEventListener('click', submit);
        }
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                }
            });
        }
    },

    _attachOpsTabToggleListener(modal, settingsPlugin) {
        const opsTabToggle = this._opsQuery(modal, '#wf-ops-tab-enabled', 'opsTabToggle');
        if (!opsTabToggle) return;
        const self = this;
        opsTabToggle.addEventListener('change', (e) => {
            const wantsEnabled = e.target.checked;
            const handleToggleChange = settingsPlugin && typeof settingsPlugin.handleToggleChange === 'function'
                ? (evt) => settingsPlugin.handleToggleChange(evt)
                : () => {};
            const rebuildTabRow = settingsPlugin && typeof settingsPlugin.rebuildSettingsTabRow === 'function'
                ? (m, p, o) => settingsPlugin.rebuildSettingsTabRow(m, p, o)
                : () => {};
            const getActiveTabId = settingsPlugin && typeof settingsPlugin.getActiveSettingsTabId === 'function'
                ? (m) => settingsPlugin.getActiveSettingsTabId(m)
                : () => null;
            if (!wantsEnabled) {
                handleToggleChange(e);
                self._setOpsTabWanted(false);
                self._setOpsPasswordPanelVisible(modal, false);
                self._setOpsPasswordError(modal, '');
                Logger.log('ops-tab: tab disabled');
                const activeTab = getActiveTabId(modal);
                const nextTab = activeTab === 'ops' ? 'information' : activeTab;
                rebuildTabRow(modal, nextTab);
                return;
            }
            self._setOpsTabWanted(true);
            if (self._hasOpsStoredPassword()) {
                handleToggleChange(e);
                Logger.log('ops-tab: tab enabled');
                rebuildTabRow(modal, null, { keepCurrentPane: true });
                return;
            }
            e.target.checked = false;
            handleToggleChange(e);
            self._setOpsPasswordPanelVisible(modal, true);
            self._setOpsPasswordError(modal, '');
            const passwordInput = self._opsQuery(modal, '#wf-ops-password-input', 'opsPasswordInputFocus');
            if (passwordInput) {
                passwordInput.focus();
            }
            Logger.log('ops-tab: unlock required');
        });
    },

    _attachOpsListeners(modal, settingsPlugin) {
        if (!modal) return;
        this._attachOpsPasswordListeners(modal, settingsPlugin);
        this._attachOpsTabToggleListener(modal, settingsPlugin);

        if (modal.dataset.wfOpsListenersAttached === '1') {
            this._restoreOpsTabState(modal);
            return;
        }
        modal.dataset.wfOpsListenersAttached = '1';

        const input = this._opsQuery(modal, '#wf-ops-task-input', 'taskInputAttach');
        const openBtn = this._opsQuery(modal, '#wf-ops-open-link', 'openLinkAttach');
        const openNewTabBtn = this._opsQuery(modal, '#wf-ops-open-link-new-tab', 'openLinkNewTabAttach');
        const copyBtn = this._opsQuery(modal, '#wf-ops-copy-link', 'copyLinkAttach');
        const verifierFetchBtn = this._opsQuery(modal, '#wf-ops-fetch-verifier', 'verifierFetchAttach');
        const verifierCopyBtn = this._opsQuery(modal, '#wf-ops-copy-verifier', 'verifierCopyAttach');
        const verifierInput = this._opsQuery(modal, '#wf-ops-verifier-input', 'verifierInputAttach');
        const verifierVersionSelect = this._opsQuery(modal, '#wf-ops-verifier-version', 'verifierVersionAttach');

        if (input) {
            input.addEventListener('input', () => {
                this._updateOpsTaskLinkUI(modal);
                this._captureOpsTabState(modal);
            });
            input.addEventListener('paste', () => {
                requestAnimationFrame(() => {
                    this._updateOpsTaskLinkUI(modal);
                    this._captureOpsTabState(modal);
                });
            });
        }

        if (openBtn) {
            openBtn.addEventListener('click', () => {
                const url = openBtn.getAttribute('data-wf-ops-url');
                if (!url) {
                    Logger.warn('ops-tab: open link skipped (no URL)');
                    return;
                }
                const pageWindow = this._getOpsPageWindow();
                pageWindow.location.href = url;
                Logger.log('ops-tab: task link opened (current tab)');
            });
        }

        if (openNewTabBtn) {
            openNewTabBtn.addEventListener('click', () => {
                const url = openNewTabBtn.getAttribute('data-wf-ops-url');
                if (!url) {
                    Logger.warn('ops-tab: open link new tab skipped (no URL)');
                    return;
                }
                window.open(url, '_blank', 'noopener,noreferrer');
                Logger.log('ops-tab: task link opened (new tab)');
            });
        }

        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                const url = copyBtn.getAttribute('data-wf-ops-url');
                if (!url) {
                    Logger.warn('ops-tab: copy skipped (no URL)');
                    this._showOpsCopyFailurePulse(copyBtn);
                    return;
                }
                const ok = await this._copyOpsTextToClipboard(url);
                if (ok) {
                    this._showOpsCopySuccessFlash(copyBtn);
                    Logger.log('ops-tab: link copied (' + url.length + ' chars)');
                } else {
                    this._showOpsCopyFailurePulse(copyBtn);
                    Logger.warn('ops-tab: link copy failed');
                }
            });
        }

        if (verifierFetchBtn) {
            verifierFetchBtn.addEventListener('click', () => {
                void this._handleOpsVerifierFetch(modal);
            });
        }

        if (verifierInput) {
            verifierInput.addEventListener('paste', () => {
                this._setOpsVerifierStatus(modal, '');
                this._clearOpsVerifierVersionPicker(modal);
                requestAnimationFrame(() => this._captureOpsTabState(modal));
            });
            verifierInput.addEventListener('input', () => {
                this._setOpsVerifierStatus(modal, '');
                this._clearOpsVerifierVersionPicker(modal);
                this._captureOpsTabState(modal);
            });
        }

        if (verifierVersionSelect) {
            verifierVersionSelect.addEventListener('change', () => {
                void this._handleOpsVerifierVersionChange(modal);
            });
        }

        if (verifierCopyBtn) {
            verifierCopyBtn.addEventListener('click', async () => {
                const value = this._opsVerifierSourceText || '';
                if (!value) {
                    this._showOpsCopyFailurePulse(verifierCopyBtn);
                    Logger.warn('ops-tab: verifier copy skipped (no code)');
                    return;
                }
                const ok = await this._copyOpsTextToClipboard(value);
                if (ok) {
                    this._showOpsCopySuccessFlash(verifierCopyBtn);
                    Logger.log('ops-tab: verifier code copied (' + value.length + ' chars)');
                } else {
                    this._showOpsCopyFailurePulse(verifierCopyBtn);
                    Logger.warn('ops-tab: verifier copy failed');
                }
            });
        }

        const gradeAssessmentsLink = this._opsQuery(modal, '#wf-ops-grade-assessments', 'opsGradeAssessmentsAttach');
        if (gradeAssessmentsLink) {
            gradeAssessmentsLink.addEventListener('click', () => {
                Logger.log('ops-tab: grade assessments opened');
            });
        }

        this._restoreOpsTabState(modal);
    },

    _onOpsPaneOpened(modal, settingsPlugin) {
        if (!modal) return;
        void this._revalidateOpsStoredPassword(modal, settingsPlugin);
    }
};
