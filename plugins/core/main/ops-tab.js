// ops-tab.js
// Core plugin for the Ops dashboard backend: secrets/password gate, PostgREST,
// team member search, verifier fetch, and task link helpers. UI lives in
// dashboard.js; settings-ui.js hosts enable/password toggles only.

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
const OPS_SECRETS_ENC_FILENAME_DEFAULT = 'ops-secrets.enc.json';
/** Must match dev/utils/ops-password-crypto.mjs */
const OPS_CRYPTO_FORMAT_PREFIX = 'fleet-ops1';
const OPS_CRYPTO_FORMAT_VERSION = 1;
const OPS_CRYPTO_PBKDF2_ITERATIONS = 310000;
const OPS_CRYPTO_SALT_BYTES = 16;
const OPS_CRYPTO_IV_BYTES = 12;
/** Must match dev/utils/ops-password-crypto.mjs AES_GCM_TAG_LENGTH */
const OPS_CRYPTO_AES_GCM_TAG_LENGTH = 128;

const OPS_FLEET_ORIGIN = 'https://www.fleetai.com';
const OPS_TEAM_SEARCH_URL = OPS_FLEET_ORIGIN + '/dashboard/team';
const OPS_SESSION_REFRESH_USER_MESSAGE =
    'Fleet session token not yet captured. Navigate to a Fleet data page (e.g. dashboard/team), then press Refresh catalogs.';
const OPS_TEAM_SEARCH_PAGE_LIMIT = 25;
/** localStorage key for the dynamically captured Next.js server action hash for team member search */
const OPS_TEAM_SEARCH_ACTION_STORAGE_KEY = 'fleet-ux:ops-team-search-next-action';
/** localStorage key for the dynamically captured Next.js router state tree for team member search */
const OPS_TEAM_SEARCH_ROUTER_STATE_STORAGE_KEY = 'fleet-ux:ops-team-search-router-state';
/** When true, extension gear opens the Ops dashboard instead of the settings modal */
const OPS_DASHBOARD_OPEN_ON_SETTINGS_KEY = 'ops-dashboard-open-on-settings';
/** localStorage key for the logged-in Fleet user UUID (from __next_f payload, cookie, or JWT) */
const OPS_CURRENT_USER_ID_STORAGE_KEY = 'fleet-ux:ops-current-user-id';
/** Matches `"user":{"id":"<uuid>"` in Next.js RSC flight payloads */
const OPS_NEXT_F_USER_ID_RE = /"user"\s*:\s*\{\s*"id"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i;
const OPS_TEAM_BULK_REMOVE_URL = 'https://www.fleetai.com/api/orchestrator-private/v1/team/members/bulk-remove';
const OPS_TEAM_USER_PERMISSIONS_URL = 'https://www.fleetai.com/api/orchestrator-private/v1/team/users/permissions';
/** Team labels that alone do not qualify a member for the UI badge (must match ops-secrets labels). */
const OPS_TEAM_UI_BADGE_EXCLUDED_LABELS = new Set(['Tryouts', 'Fleet Fellows']);
const OPS_FLEET_FELLOWS_TEAM_LABEL = 'Fleet Fellows';
/** All known permissions in Fleet UI order: [apiKey, displayLabel]. */
const OPS_ALL_PERMISSIONS = [
    ['QA_CUA_TASKS', 'QA CUA Tasks'],
    ['MAKE_CUA_TASKS', 'Make CUA Tasks'],
    ['QA_TOOL_USE_TASKS', 'QA Tool Use Tasks'],
    ['MAKE_TOOL_USE_TASKS', 'Make Tool Use Tasks'],
    ['MAKE_TAIGA_TASKS', 'Make Tundra Tasks'],
    ['QA_CUA_ENVS', 'QA CUA Environments'],
    ['QA_TOOL_USE_ENVS', 'QA Tool Use Environments'],
    ['QA_SESSIONS', 'QA Agent Sessions'],
    ['COMMENT_AGENT_SESSIONS', 'Comment Agent Sessions'],
    ['REVIEW_DISPUTES', 'Review Disputes (Senior QA)'],
    ['VIEW_OWN_TASK_RESULTS', 'View Own Task Results'],
    ['REVIEW_CONTRACTOR_APPLICATIONS', 'Contractor Review']
];
const OPS_PERMISSION_LABEL_BY_KEY = Object.fromEntries(OPS_ALL_PERMISSIONS);

async function computeSha256Hex(text) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hex = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    return 'sha256-' + hex;
}

function opsBase64Decode(str) {
    const binary = atob(str);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

function opsUnpackEncryptedBlob(blob) {
    const prefix = OPS_CRYPTO_FORMAT_PREFIX + ':';
    if (!blob || typeof blob !== 'string' || !blob.startsWith(prefix)) {
        throw new Error('Invalid encrypted blob prefix');
    }
    const raw = opsBase64Decode(blob.slice(prefix.length));
    if (raw.length < 1 + OPS_CRYPTO_SALT_BYTES + OPS_CRYPTO_IV_BYTES + 16) {
        throw new Error('Encrypted blob too short');
    }
    if (raw[0] !== OPS_CRYPTO_FORMAT_VERSION) {
        throw new Error('Unsupported blob version');
    }
    return {
        salt: raw.slice(1, 1 + OPS_CRYPTO_SALT_BYTES),
        iv: raw.slice(1 + OPS_CRYPTO_SALT_BYTES, 1 + OPS_CRYPTO_SALT_BYTES + OPS_CRYPTO_IV_BYTES),
        ciphertext: raw.slice(1 + OPS_CRYPTO_SALT_BYTES + OPS_CRYPTO_IV_BYTES)
    };
}

async function opsDeriveAesKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: OPS_CRYPTO_PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function opsDecryptWithPassword(blob, password) {
    const { salt, iv, ciphertext } = opsUnpackEncryptedBlob(blob);
    const key = await opsDeriveAesKey(password, salt);
    try {
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv, tagLength: OPS_CRYPTO_AES_GCM_TAG_LENGTH },
            key,
            ciphertext
        );
        return new TextDecoder().decode(plain);
    } catch (_e) {
        throw new Error('Decryption failed');
    }
}

const plugin = {
    id: 'ops-tab',
    name: 'Ops Tab',
    description: 'Ops dashboard backend: password gate, PostgREST, team search, verifier fetch, task links',
    _version: '4.4',
    phase: 'core',
    enabledByDefault: true,

    _opsVerifierFetchState: null,
    _opsVerifierSourceText: '',
    _opsTeamSearchActive: null,
    _opsTeamSearchMemberCache: null,
    _opsTeamSearchSelectedTeams: null,
    /** null when idle; false while Fleet Fellows search runs; true once Fellows has fully resolved. */
    _opsFellowsSearchComplete: null,
    /** memberId → staged edit session while permissions tray is in edit mode */
    _opsMemberEditState: null,
    /** Dynamically discovered team search server action parameters (populated at runtime, never hardcoded) */
    _opsTeamSearchActionCache: { nextAction: null, routerState: null },
    /** Logged-in Fleet user UUID captured from __next_f, cookie, JWT, or persisted storage */
    _opsCurrentUserIdCache: '',
    _opsCurrentUserIdCaptureInstalled: false,
    _opsSecretsCache: {
        json: null,
        loadError: null,
        loading: false,
        missingLogged: false
    },
    _opsTabState: {
        taskInput: '',
        verifierInput: '',
        verifierStatus: '',
        verifierStatusIsError: false,
        verifierOutput: '',
        verifierFetchState: null,
        teamSearchQuery: '',
        teamSearchStatus: '',
        teamSearchStatusIsError: false
    },

    init(state, context) {
        Context.opsTab = {
            isAccessConfigured: () => this._isOpsAccessConfigured(),
            isEnabled: () => this._getOpsTabEnabled(),
            isWanted: () => this._getOpsTabWanted(),
            hasStoredPassword: () => this._hasOpsStoredPassword(),
            shouldOpenDashboardOnSettings: () => this._shouldOpenDashboardOnSettings(),
            getOpsDashboardOpenOnSettings: () => this._getOpsDashboardOpenOnSettings(),
            setOpsDashboardOpenOnSettings: (enabled) => this._setOpsDashboardOpenOnSettings(enabled),
            renderSettingsSection: () => this._renderOpsSettingsSection(),
            renderTeamMembersPanel: () => this._renderTeamMembersPanel(),
            renderVerifierFetcherPanel: () => this._renderVerifierFetcherPanel(),
            renderTaskLinkBar: () => this._renderTaskLinkBar(),
            attachSettingsListeners: (modal, settingsPlugin) => this._attachOpsSettingsListeners(modal, settingsPlugin),
            attachDashboardListeners: (dashModal, dashboardPlugin) => this._attachOpsDashboardListeners(dashModal, dashboardPlugin),
            onDashboardTabActivated: (dashModal, tabId) => this._onDashboardTabActivated(dashModal, tabId),
            captureState: (root) => this._captureOpsTabState(root),
            onModalClosed: () => this._onOpsModalClosed(),
            setTabWanted: (enabled) => this._setOpsTabWanted(enabled),
            clearStoredPassword: () => this._clearOpsStoredPassword(),
            resolveTaskLinkTarget: (raw) => this.resolveTaskLinkTarget(raw),
            openTaskLink: (raw, opts) => this.openTaskLink(raw, opts),
            fetchVerifierCode: (parsed) => this._fetchOpsVerifierCode(parsed || {}),
            parseVerifierInput: (raw) => this._parseOpsVerifierInput(raw),
            getSecrets: () => this._getOpsSecretsJson(),
            getOpsBundle: () => this._getOpsBundle(),
            reloadSecrets: (force) => this._loadOpsSecrets(force !== false),
            resolveTable: (tableKey) => this._resolveOpsTable(tableKey),
            buildPostgrestParams: (queryKey, overrides) => this._buildOpsPostgrestParams(queryKey, overrides),
            getPostgrestSelect: (queryKey) => this._getOpsPostgrestSelect(queryKey),
            getScopedField: (key) => this._getOpsScopedField(key),
            getFleetWebPath: (key) => this._getOpsFleetWebPath(key),
            postgrestQuery: (queryKey, overrides) => this._opsPostgrestQuery(queryKey, overrides),
            // tableKey → resolved table name from decrypted ops bundle
            postgrestGet: (tableKey, params) => this._opsPostgrestGetByKey(tableKey, params),
            isSessionRefreshRequiredError: (err) => this._isOpsSessionRefreshRequiredError(err),
            getFleetUserJwt: (pageWindow) => this._getOpsFleetUserJwt(pageWindow)
        };
        Logger.log('ops-tab: module registered (Context.opsTab)');
        this._loadOpsTeamSearchActionFromStorage();
        this._loadOpsCurrentUserIdFromStorage();
        this._subscribeOpsTeamSearchActionCapture();
        this._subscribeOpsCurrentUserIdCapture();
        if (this._getOpsTabEnabled()) {
            void this._loadOpsSecrets(false);
        }
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
        return Storage.get('ops-tab-enabled', true);
    },

    _setOpsTabWanted(enabled) {
        Storage.set('ops-tab-enabled', enabled);
    },

    _getOpsDashboardOpenOnSettings() {
        return Storage.get(OPS_DASHBOARD_OPEN_ON_SETTINGS_KEY, true);
    },

    _setOpsDashboardOpenOnSettings(enabled) {
        Storage.set(OPS_DASHBOARD_OPEN_ON_SETTINGS_KEY, Boolean(enabled));
    },

    _shouldOpenDashboardOnSettings() {
        return this._getOpsTabWanted() && this._getOpsDashboardOpenOnSettings();
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
        this._clearOpsSecretsCache();
    },

    _getOpsSecretsEncryptedFilename() {
        const cfg = Context.opsSecrets && typeof Context.opsSecrets === 'object'
            ? Context.opsSecrets
            : null;
        const name = cfg && cfg.encryptedFile;
        return typeof name === 'string' && name.length > 0 ? name : OPS_SECRETS_ENC_FILENAME_DEFAULT;
    },

    _getOpsSecretsEncryptedUrl() {
        const owner = Context.githubOwner || 'Fleet-AI-Operations';
        const repo = Context.githubRepo || 'fleet-ux-improvements';
        const branch = Context.githubBranch || 'main';
        const file = this._getOpsSecretsEncryptedFilename();
        return 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/' + file + '?t=' + Date.now();
    },

    _fetchOpsSecretsEncryptedWrapper() {
        const url = this._getOpsSecretsEncryptedUrl();
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('GM_xmlhttpRequest unavailable'));
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache'
                },
                onload: (response) => {
                    if (response.status === 404) {
                        resolve(null);
                        return;
                    }
                    if (response.status !== 200) {
                        reject(new Error('HTTP ' + response.status + ' loading ops secrets'));
                        return;
                    }
                    try {
                        resolve(JSON.parse(response.responseText));
                    } catch (e) {
                        reject(new Error('ops secrets JSON parse failed'));
                    }
                },
                onerror: () => {
                    reject(new Error('Network error loading ops secrets'));
                }
            });
        });
    },

    _clearOpsSecretsCache() {
        this._opsSecretsCache.json = null;
        this._opsSecretsCache.loadError = null;
        this._opsSecretsCache.loading = false;
        this._opsSecretsCache.missingLogged = false;
    },

    _getOpsSecretsJson() {
        return this._opsSecretsCache.json;
    },

    _getOpsBundle() {
        const json = this._getOpsSecretsJson();
        if (!json || typeof json !== 'object' || !json.postgrest) {
            throw new Error('Ops bundle not loaded. Unlock the Ops dashboard and ensure ops-secrets.enc.json is available on this branch.');
        }
        return json;
    },

    _resolveOpsTable(tableKey) {
        const tables = this._getOpsBundle().postgrest.tables || {};
        const name = tables[tableKey];
        if (!name) {
            throw new Error('Ops bundle missing table key: ' + tableKey);
        }
        return name;
    },

    _resolveOpsSelectToken(selectToken) {
        const token = String(selectToken || '');
        if (!token.startsWith('USE_EMBED_')) {
            return token;
        }
        const embedKey = token.slice('USE_EMBED_'.length);
        const embeds = this._getOpsBundle().postgrest.embeds || {};
        const embed = embeds[embedKey];
        if (!embed) {
            throw new Error('Ops bundle missing embed key: ' + embedKey);
        }
        return '*' + ',' + embed;
    },

    _buildOpsPostgrestParams(queryKey, overrides) {
        const queries = this._getOpsBundle().postgrest.queries || {};
        const spec = queries[queryKey];
        if (!spec) {
            throw new Error('Ops bundle missing query key: ' + queryKey);
        }
        const params = {};
        if (spec.select) {
            params.select = this._resolveOpsSelectToken(spec.select);
        }
        return Object.assign(params, overrides || {});
    },

    _getOpsPostgrestSelect(queryKey) {
        return this._buildOpsPostgrestParams(queryKey, {}).select || '';
    },

    _getOpsScopedField(key) {
        const fields = this._getOpsBundle().postgrest.scoped_fields || {};
        const value = fields[key];
        if (!value) {
            throw new Error('Ops bundle missing scoped field key: ' + key);
        }
        return value;
    },

    _getOpsFleetWebPath(key) {
        const paths = this._getOpsBundle().fleetWeb || {};
        const path = paths[key];
        if (!path) {
            throw new Error('Ops bundle missing fleet web path key: ' + key);
        }
        return path;
    },

    async _opsPostgrestQuery(queryKey, overrides) {
        const queries = this._getOpsBundle().postgrest.queries || {};
        const spec = queries[queryKey];
        if (!spec || !spec.table) {
            throw new Error('Ops bundle missing query key: ' + queryKey);
        }
        const params = this._buildOpsPostgrestParams(queryKey, overrides);
        return this._opsPostgrestGetByKey(spec.table, params);
    },

    async _opsPostgrestGetByKey(tableKey, params) {
        const table = this._resolveOpsTable(tableKey);
        return this._opsPostgrestGet(table, params);
    },

    async _loadOpsSecrets(force) {
        if (!this._hasOpsStoredPassword()) {
            this._clearOpsSecretsCache();
            return;
        }
        const password = this._getOpsStoredPassword();
        if (!password) {
            this._clearOpsSecretsCache();
            return;
        }
        if (this._opsSecretsCache.loading && !force) {
            return;
        }
        if (this._opsSecretsCache.json && !force) {
            return;
        }

        this._opsSecretsCache.loading = true;
        this._opsSecretsCache.loadError = null;
        try {
            const wrapped = await this._fetchOpsSecretsEncryptedWrapper();
            if (!wrapped || typeof wrapped.encrypted !== 'string' || !wrapped.encrypted) {
                if (!this._opsSecretsCache.missingLogged) {
                    Logger.debug('ops-tab: no encrypted secrets file on branch');
                    this._opsSecretsCache.missingLogged = true;
                }
                this._opsSecretsCache.json = null;
                return;
            }
            const plaintext = await opsDecryptWithPassword(wrapped.encrypted, password);
            const parsed = JSON.parse(plaintext);
            this._opsSecretsCache.json = parsed;
            const keyCount = parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 0;
            Logger.log('ops-tab: secrets decrypted (' + keyCount + ' top-level keys)');
        } catch (e) {
            this._opsSecretsCache.json = null;
            this._opsSecretsCache.loadError = e;
            Logger.warn('ops-tab: secrets decrypt failed', e);
        } finally {
            this._opsSecretsCache.loading = false;
        }
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

    async resolveTaskLinkTarget(raw) {
        const url = this._buildOpsTaskUrl(raw);
        if (!url) return null;
        const parsed = this._parseOpsVerifierInput(raw);
        let teamId = String(parsed.teamId || '').trim();
        if (!teamId && (parsed.taskKey || parsed.taskId)) {
            try {
                const resolved = await this._resolveOpsVerifierFromTask(parsed);
                teamId = String(resolved.teamId || '').trim();
            } catch (e) {
                Logger.debug('ops-tab: task link team_id lookup failed', e);
            }
        }
        const taskId = String(parsed.taskId || this._extractOpsTaskIdentifier(raw) || '').trim();
        return { url, teamId, taskId };
    },

    async openTaskLink(raw, opts) {
        const options = opts || {};
        const input = this._opsQuery(
            options.root,
            '#wf-ops-task-input',
            'taskLinkOpen'
        );
        const value = raw != null ? raw : (input && input.value);
        const target = await this.resolveTaskLinkTarget(value);
        if (!target || !target.url) {
            Logger.warn('ops-tab: openTaskLink skipped — no URL');
            return;
        }
        const teamId = target.teamId;
        if (teamId && Context.dashboard && typeof Context.dashboard.switchFleetTeam === 'function') {
            try {
                await Context.dashboard.switchFleetTeam(teamId);
            } catch (e) {
                Logger.warn('ops-tab: team switch before task link failed', e);
            }
        }
        if (options.newTab) {
            window.open(target.url, '_blank', 'noopener,noreferrer');
            Logger.log('ops-tab: task link opened (new tab)');
        } else {
            this._getOpsPageWindow().location.href = target.url;
            Logger.log('ops-tab: task link opened (current tab)');
        }
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

    _getOpsFleetUserJwt(pageWindow) {
        const no = Context.networkObserver;
        if (no && typeof no.getFleetUserJwt === 'function') {
            return no.getFleetUserJwt(pageWindow);
        }
        return '';
    },

    _opsSessionRefreshRequiredError(message) {
        const err = new Error(message || OPS_SESSION_REFRESH_USER_MESSAGE);
        err.opsSessionRefreshRequired = true;
        return err;
    },

    _isOpsSessionRefreshRequiredError(err) {
        return !!(err && err.opsSessionRefreshRequired);
    },

    _isOpsPostgrestJwtExpiredError(err) {
        if (!err || typeof err.message !== 'string') return false;
        if (!/\b401\b/.test(err.message)) return false;
        return /JWT expired|PGRST301/i.test(err.message);
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
        const token = this._getOpsFleetUserJwt(pageWindow);
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
            throw this._opsSessionRefreshRequiredError();
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
            const err = new Error('Supabase API ' + res.status + ': ' + (text || res.statusText));
            if (this._isOpsPostgrestJwtExpiredError(err)) {
                Logger.warn('ops-tab: PostgREST JWT expired — use Fleet on a data page to capture a fresh token');
                throw this._opsSessionRefreshRequiredError();
            }
            throw err;
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
            const rows = await this._opsPostgrestQuery('tasks.select_verifier_lookup', params);
            taskRow = Array.isArray(rows) ? rows[0] : rows;
            Logger.debug(
                'ops-tab: tasks row id=' + (taskRow && taskRow.id || '(none)') +
                ' current_version_id=' + (taskRow && taskRow.current_version_id || '(none)') +
                ' team_id=' + (taskRow && taskRow.team_id || '(none)')
            );
        } catch (e) {
            Logger.debug('ops-tab: tasks lookup failed', e);
        }

        if (!taskRow) {
            Logger.debug('ops-tab: tasks no row for ' + (parsed.taskKey || parsed.taskId) + ' — treating input as verifier ID');
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
                const vRows = await this._opsPostgrestQuery('task_versions.select_verifier_meta', {
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
                        'ops-tab: task_versions verifier_id=' + (verifierId || '(none)') +
                        ' key=' + (verifierKey || '(none)') +
                        ' version=' + (verifierVersion == null ? '(none)' : verifierVersion)
                    );
                }
            } catch (e) {
                Logger.debug('ops-tab: task_versions lookup failed', e);
            }
        } else {
            Logger.debug('ops-tab: tasks had no current_version_id');
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
            const rows = await this._opsPostgrestQuery('verifiers.select_id_key', params);
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
            const rows = await this._opsPostgrestQuery('verifiers.select_id', params);
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
            const rows = await this._opsPostgrestQuery('team_members.select_team', params);
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

    _getOpsCookieValue(name) {
        try {
            const win = this._getOpsPageWindow();
            const cookie = (win.document && win.document.cookie) || document.cookie || '';
            if (!cookie) return '';
            for (const part of cookie.split(/;\s*/)) {
                const eq = part.indexOf('=');
                if (eq < 0) continue;
                if (part.slice(0, eq).trim() === name) {
                    return decodeURIComponent(part.slice(eq + 1));
                }
            }
        } catch (e) {
            Logger.debug('ops-tab: cookie read failed for ' + name, e);
        }
        return '';
    },

    _loadOpsCurrentUserIdFromStorage() {
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (!storage) return;
            const userId = storage.getItem(OPS_CURRENT_USER_ID_STORAGE_KEY);
            if (userId && OPS_UUID_RE.test(userId)) {
                this._opsCurrentUserIdCache = userId;
                Logger.debug('ops-tab: current user id hydrated from localStorage (' + userId.slice(0, 8) + '…)');
            }
        } catch (e) {
            Logger.debug('ops-tab: current user id localStorage hydration failed', e);
        }
    },

    _persistOpsCurrentUserId(userId, source) {
        if (!userId || !OPS_UUID_RE.test(userId)) return;
        const changed = userId !== this._opsCurrentUserIdCache;
        this._opsCurrentUserIdCache = userId;
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (storage) storage.setItem(OPS_CURRENT_USER_ID_STORAGE_KEY, userId);
        } catch (e) {
            Logger.debug('ops-tab: current user id persist failed', e);
        }
        if (changed) {
            Logger.log('ops-tab: current user id captured (' + userId.slice(0, 8) + '…, source=' + (source || 'unknown') + ')');
        }
    },

    _extractOpsUserIdFromNextFPayload(text) {
        if (!text || typeof text !== 'string') return '';
        const match = text.match(OPS_NEXT_F_USER_ID_RE);
        return match ? match[1] : '';
    },

    _captureOpsCurrentUserIdFromText(text, source) {
        const userId = this._extractOpsUserIdFromNextFPayload(text);
        if (!userId) return '';
        this._persistOpsCurrentUserId(userId, source);
        return userId;
    },

    _extractOpsUserIdFromJwt(pageWindow) {
        const jwt = this._getOpsFleetUserJwt(pageWindow);
        if (!jwt) return '';
        const decode = Context.networkObserver && Context.networkObserver.decodeJwtPayload;
        const payload = decode ? decode(jwt) : null;
        const sub = payload && payload.sub;
        return typeof sub === 'string' && OPS_UUID_RE.test(sub) ? sub : '';
    },

    _scanOpsCurrentUserIdFromNextFScripts(pageWindow) {
        try {
            const doc = pageWindow && pageWindow.document;
            if (!doc) return '';
            const scripts = doc.querySelectorAll('script');
            for (let i = 0; i < scripts.length; i++) {
                const text = scripts[i].textContent || '';
                if (!text.includes('"user"') || !text.includes('"id"')) continue;
                const userId = this._captureOpsCurrentUserIdFromText(text, 'script-scan');
                if (userId) return userId;
            }
        } catch (e) {
            Logger.debug('ops-tab: __next_f script scan failed', e);
        }
        return '';
    },

    _hookOpsNextFUserIdCapture(pageWindow) {
        if (!pageWindow || !pageWindow.__next_f || !Array.isArray(pageWindow.__next_f)) return false;
        if (pageWindow.__next_f.__wfOpsUserIdHooked) return true;

        const self = this;
        const processEntry = (entry) => {
            if (!Array.isArray(entry) || entry.length < 2 || typeof entry[1] !== 'string') return;
            self._captureOpsCurrentUserIdFromText(entry[1], 'next_f');
        };

        pageWindow.__next_f.forEach(processEntry);

        const origPush = pageWindow.__next_f.push.bind(pageWindow.__next_f);
        pageWindow.__next_f.push = function patchedOpsNextFPush(...args) {
            args.forEach(processEntry);
            return origPush.apply(this, args);
        };
        pageWindow.__next_f.__wfOpsUserIdHooked = true;
        Logger.debug('ops-tab: __next_f user id capture hook installed');
        return true;
    },

    _subscribeOpsCurrentUserIdCapture() {
        if (this._opsCurrentUserIdCaptureInstalled) return;
        this._opsCurrentUserIdCaptureInstalled = true;

        const self = this;
        const pageWindow = this._getOpsPageWindow();

        try {
            self._hookOpsNextFUserIdCapture(pageWindow);
            self._scanOpsCurrentUserIdFromNextFScripts(pageWindow);
        } catch (e) {
            Logger.debug('ops-tab: initial current user id capture failed', e);
        }

        try {
            const doc = pageWindow.document;
            if (!doc || !doc.documentElement) return;

            const observer = new MutationObserver((mutations) => {
                for (let m = 0; m < mutations.length; m++) {
                    const added = mutations[m].addedNodes;
                    for (let n = 0; n < added.length; n++) {
                        const node = added[n];
                        if (node.nodeName !== 'SCRIPT') continue;
                        const text = node.textContent || '';
                        if (!text.includes('"user"') || !text.includes('"id"')) continue;
                        self._captureOpsCurrentUserIdFromText(text, 'script');
                        if (text.includes('__next_f')) {
                            self._hookOpsNextFUserIdCapture(pageWindow);
                        }
                    }
                }
            });
            observer.observe(doc.documentElement, { childList: true, subtree: true });
            Logger.debug('ops-tab: current user id script watcher registered');
        } catch (e) {
            Logger.debug('ops-tab: current user id script watcher failed', e);
        }
    },

    _getOpsCurrentUserId() {
        const fromCookie = this._getOpsCookieValue('current-user-id');
        if (fromCookie && OPS_UUID_RE.test(fromCookie)) {
            this._persistOpsCurrentUserId(fromCookie, 'cookie');
            return fromCookie;
        }

        const pageWindow = this._getOpsPageWindow();
        const fromScan = this._scanOpsCurrentUserIdFromNextFScripts(pageWindow);
        if (fromScan) return fromScan;

        if (this._opsCurrentUserIdCache && OPS_UUID_RE.test(this._opsCurrentUserIdCache)) {
            return this._opsCurrentUserIdCache;
        }

        const fromJwt = this._extractOpsUserIdFromJwt(pageWindow);
        if (fromJwt) {
            this._persistOpsCurrentUserId(fromJwt, 'jwt');
            return fromJwt;
        }

        return this._opsCurrentUserIdCache || '';
    },

    _getOpsTeamUuidByLabel(label) {
        const secrets = this._getOpsSecretsJson();
        if (!secrets || !Array.isArray(secrets['team-uuids'])) return '';
        const entry = secrets['team-uuids'].find(pair => Array.isArray(pair) && pair[1] === label);
        return entry ? String(entry[0]) : '';
    },

    _getOpsNextDeploymentId(pageWindow) {
        try {
            const win = pageWindow || this._getOpsPageWindow();
            const nd = win.__NEXT_DATA__;
            if (nd && nd.deploymentId && typeof nd.deploymentId === 'string') return nd.deploymentId;
        } catch (e) {
            Logger.debug('ops-tab: __NEXT_DATA__ deploymentId read failed', e);
        }
        return '';
    },

    _opsReadHeader(headers, name) {
        if (!headers) return null;
        const lower = name.toLowerCase();
        try {
            const pageWindow = this._getOpsPageWindow();
            if (pageWindow && pageWindow.Headers && headers instanceof pageWindow.Headers) return headers.get(name);
            if (Array.isArray(headers)) {
                const found = headers.find(([k]) => String(k).toLowerCase() === lower);
                return found ? found[1] : null;
            }
            if (typeof headers === 'object') {
                for (const k of Object.keys(headers)) {
                    if (String(k).toLowerCase() === lower) return headers[k];
                }
            }
        } catch (_e) {}
        return null;
    },

    _loadOpsTeamSearchActionFromStorage() {
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (!storage) return;
            const nextAction = storage.getItem(OPS_TEAM_SEARCH_ACTION_STORAGE_KEY);
            const routerState = storage.getItem(OPS_TEAM_SEARCH_ROUTER_STATE_STORAGE_KEY);
            if (nextAction) {
                this._opsTeamSearchActionCache = { nextAction, routerState: routerState || '' };
                Logger.debug('ops-tab: team search action hydrated from localStorage (' + nextAction.slice(0, 12) + '…)');
            }
        } catch (e) {
            Logger.debug('ops-tab: team search action localStorage hydration failed', e);
        }
    },

    _persistOpsTeamSearchAction({ nextAction, routerState }) {
        if (!nextAction) return;
        const changed = nextAction !== this._opsTeamSearchActionCache.nextAction;
        this._opsTeamSearchActionCache = { nextAction, routerState: routerState || '' };
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (storage) {
                storage.setItem(OPS_TEAM_SEARCH_ACTION_STORAGE_KEY, nextAction);
                if (routerState) {
                    storage.setItem(OPS_TEAM_SEARCH_ROUTER_STATE_STORAGE_KEY, routerState);
                }
            }
        } catch (e) {
            Logger.debug('ops-tab: team search action persist failed', e);
        }
        if (changed) {
            Logger.log('ops-tab: team search action updated (' + nextAction.slice(0, 12) + '…)');
        }
    },

    _clearOpsTeamSearchActionCache() {
        this._opsTeamSearchActionCache = { nextAction: null, routerState: null };
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (storage) {
                storage.removeItem(OPS_TEAM_SEARCH_ACTION_STORAGE_KEY);
                storage.removeItem(OPS_TEAM_SEARCH_ROUTER_STATE_STORAGE_KEY);
            }
        } catch (e) {
            Logger.debug('ops-tab: team search action cache clear failed', e);
        }
        Logger.info('ops-tab: team search action cache cleared (will re-discover on next search)');
    },

    _subscribeOpsTeamSearchActionCapture() {
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.debug('ops-tab: NetworkObserver unavailable; passive team action capture skipped');
            return;
        }
        const self = this;
        Context.networkObserver.subscribe({
            id: 'ops-tab-team-search-action',
            matches(meta) {
                return meta.method === 'POST'
                    && !!meta.urlObj
                    && meta.urlObj.pathname === '/dashboard/team';
            },
            onRequest(meta) {
                const nextAction = self._opsReadHeader(meta.headers, 'next-action');
                const routerState = self._opsReadHeader(meta.headers, 'next-router-state-tree');
                if (nextAction && nextAction !== self._opsTeamSearchActionCache.nextAction) {
                    self._persistOpsTeamSearchAction({ nextAction, routerState: routerState || '' });
                    Logger.info('ops-tab: team search action captured from live traffic (' + nextAction.slice(0, 12) + '…)');
                }
            }
        });
        Logger.debug('ops-tab: team search action passive watcher registered');
    },

    _opsTeamSearchActionStaleError() {
        const err = new Error('Team search credentials are stale or missing.');
        err.opsTeamSearchActionStale = true;
        return err;
    },

    _isOpsTeamSearchActionStaleError(err) {
        return !!(err && err.opsTeamSearchActionStale);
    },

    _renderOpsTeamSearchActionRefreshBannerHtml() {
        const teamUrl = OPS_TEAM_SEARCH_URL;
        return [
            '<div id="wf-ops-team-search-action-refresh-banner" style="',
            'margin-bottom: 4px;padding: 14px;padding-top: 20px;background: #fee2e2;',
            'border: 2px solid #dc2626;border-radius: 8px;">',
            '<div style="display: flex; align-items: flex-start; margin-bottom: 10px;">',
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 10px; color: #dc2626; flex-shrink: 0; margin-top: 2px;">',
            '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>',
            '<line x1="12" y1="9" x2="12" y2="13"></line>',
            '<line x1="12" y1="17" x2="12.01" y2="17"></line>',
            '</svg>',
            '<div style="flex: 1;">',
            '<h3 style="font-size: 15px; font-weight: 600; margin: 0 0 8px 0; color: #991b1b;">Team Search Unavailable</h3>',
            '<p style="font-size: 13px; color: #991b1b; margin: 0; line-height: 1.5;">',
            'Team search credentials are missing or out of date after a Fleet update. ',
            'Open the Team page to refresh them, then return here and search again.',
            '</p>',
            '</div>',
            '</div>',
            '<div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #fecaca; text-align: center;">',
            '<a href="', this._opsEscapeAttr(teamUrl), '" target="_blank" rel="noopener noreferrer" id="wf-ops-team-search-go-now" style="',
            'display: inline-block;padding: 8px 14px;font-size: 13px;font-weight: 600;',
            'color: #991b1b;background: #fef2f2;border: 1px solid #dc2626;border-radius: 6px;',
            'cursor: pointer;text-decoration: none;">Go now</a>',
            '</div>',
            '</div>'
        ].join('');
    },

    _showOpsTeamSearchActionRefreshBanner(modal) {
        const outputWrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchStaleBanner');
        const filterWrap = this._opsQuery(modal, '#wf-ops-team-filter-wrap', 'teamFilterWrapStaleHide');
        if (filterWrap) filterWrap.style.display = 'none';
        if (outputWrap) {
            outputWrap.style.display = 'block';
            outputWrap.innerHTML = this._renderOpsTeamSearchActionRefreshBannerHtml();
            const goNow = outputWrap.querySelector('#wf-ops-team-search-go-now');
            if (goNow) {
                goNow.addEventListener('click', () => {
                    Logger.log('ops-tab: team search refresh link opened (new tab)');
                });
            }
        }
        this._setOpsTeamSearchStatus(modal, '', false, false, false);
        Logger.info('ops-tab: team search refresh banner shown — user must visit /dashboard/team');
    },

    async _fetchOpsTeamSearchPage(teamId, userId, query, offset) {
        if (!teamId) throw new Error('No team ID available for search. Ensure Computer Use UUID is in decrypted secrets.');
        if (!userId) throw new Error('No user ID found. Open Fleet while logged in and try again.');

        if (!this._opsTeamSearchActionCache.nextAction) {
            throw this._opsTeamSearchActionStaleError();
        }

        const pageWindow = this._getOpsPageWindow();
        const requestFetch = pageWindow.fetch || fetch;
        const deploymentId = this._getOpsNextDeploymentId(pageWindow);
        const pageOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
        const { nextAction, routerState } = this._opsTeamSearchActionCache;

        const headers = {
            'accept': 'text/x-component',
            'content-type': 'text/plain;charset=UTF-8',
            'next-action': nextAction
        };
        if (routerState) headers['next-router-state-tree'] = routerState;
        if (deploymentId) headers['x-deployment-id'] = deploymentId;

        const body = JSON.stringify([teamId, userId, pageOffset, OPS_TEAM_SEARCH_PAGE_LIMIT, query || '']);

        Logger.debug('ops-tab: team search fetch', {
            teamId: teamId.slice(0, 8) + '...',
            userId: userId.slice(0, 8) + '...',
            query: query || '(empty)',
            offset: pageOffset,
            action: nextAction.slice(0, 12) + '…',
            hasDeploymentId: !!deploymentId
        });

        const res = await requestFetch.call(pageWindow, OPS_TEAM_SEARCH_URL, {
            method: 'POST',
            headers,
            body,
            credentials: 'include'
        });

        const text = await res.text().catch(() => '');

        if (res.status === 404) {
            Logger.warn('ops-tab: team search got 404 — server action stale, clearing cache');
            this._clearOpsTeamSearchActionCache();
            throw this._opsTeamSearchActionStaleError();
        }

        if (!res.ok) {
            throw new Error('Team search HTTP ' + res.status + ': ' + text.slice(0, 300));
        }
        return text;
    },

    async _fetchOpsTeamSearchAllMembers(teamId, userId, query) {
        const allMembers = [];
        let offset = 0;
        let hasMore = true;
        let pageCount = 0;
        const maxPages = 200;

        while (hasMore && pageCount < maxPages) {
            pageCount++;
            const raw = await this._fetchOpsTeamSearchPage(teamId, userId, query, offset);
            const parsed = this._parseOpsTeamSearchResponse(raw);
            if (!parsed || !Array.isArray(parsed.members)) break;

            allMembers.push(...parsed.members);
            hasMore = parsed.hasMore === true && parsed.members.length > 0;
            offset += OPS_TEAM_SEARCH_PAGE_LIMIT;

            if (hasMore) {
                Logger.debug('ops-tab: team search page ' + pageCount + ' fetched ' + parsed.members.length +
                    ' members (total ' + allMembers.length + ', hasMore)');
            }
        }

        return allMembers;
    },

    _mergeOpsTeamSearchMembers(memberMap, members, teamLabel) {
        if (!members || !members.length) return;
        for (const member of members) {
            if (!memberMap.has(member.id)) {
                memberMap.set(member.id, { ...member, teamLabels: new Set() });
            }
            memberMap.get(member.id).teamLabels.add(teamLabel);
        }
    },

    _getOpsPermissionDisplayLabel(permKey) {
        return OPS_PERMISSION_LABEL_BY_KEY[permKey] || String(permKey || '').replace(/_/g, ' ');
    },

    _opsMemberPermissionKeys(member) {
        return Array.isArray(member.permissions) ? member.permissions : [];
    },

    _opsMemberKnownPermissionCount(member) {
        const keys = new Set(this._opsMemberPermissionKeys(member));
        return OPS_ALL_PERMISSIONS.reduce((count, [key]) => count + (keys.has(key) ? 1 : 0), 0);
    },

    _opsEscapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _injectOpsSpinnerStyle() {
        if (document.getElementById('wf-ops-spinner-style')) return;
        const style = document.createElement('style');
        style.id = 'wf-ops-spinner-style';
        style.textContent = [
            '@keyframes wf-ops-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
            '.wf-ops-action-btn,.wf-ops-profile-btn{cursor:pointer!important;transition:background 0.15s,border-color 0.15s,color 0.15s!important;}',
            '.wf-ops-action-btn:hover,.wf-ops-profile-btn:hover{background:var(--brand,#4f46e5)!important;color:#fff!important;border-color:var(--brand,#4f46e5)!important;}',
            '.wf-ops-action-btn:disabled,.wf-ops-profile-btn:disabled{opacity:0.55;cursor:not-allowed!important;}',
            '.wf-ops-action-btn:disabled:hover,.wf-ops-profile-btn:disabled:hover{background:var(--background,white)!important;color:var(--brand,#4f46e5)!important;border-color:var(--border,#e5e5e5)!important;}',
            '.wf-ops-member-details:not([open]) .wf-ops-member-edit-actions{display:none!important;}',
            '.wf-ops-member-details[open] .wf-ops-member-edit-actions{display:flex!important;}',
            '.wf-ops-edit-btn{padding:2px 8px;font-size:11px;font-weight:600;color:#a16207;background:color-mix(in srgb,#ca8a04 14%,transparent);border:1px solid #ca8a04;border-radius:4px;cursor:pointer;white-space:nowrap;transition:background 0.15s,border-color 0.15s,color 0.15s;}',
            '.wf-ops-edit-btn:hover{background:#ca8a04!important;color:#fff!important;border-color:#ca8a04!important;}',
            '.wf-ops-profile-link-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;flex-shrink:0;border-radius:6px;color:var(--muted-foreground,#64748b);border:1px solid var(--border,#e5e5e5);background:var(--background,white);text-decoration:none;transition:background 0.15s,border-color 0.15s,color 0.15s;}',
            '.wf-ops-profile-link-btn:hover{background:var(--foreground,#0f172a)!important;color:var(--background,#fff)!important;border-color:var(--foreground,#0f172a)!important;}',
            '.wf-ops-confirm-btn{padding:2px 8px;font-size:11px;font-weight:600;color:#22c55e;background:transparent;border:1px solid #22c55e;border-radius:4px;cursor:pointer;white-space:nowrap;transition:background 0.15s,color 0.15s;}',
            '.wf-ops-confirm-btn:hover:not(:disabled){background:#22c55e!important;color:#fff!important;}',
            '.wf-ops-confirm-btn:disabled{opacity:0.45;cursor:not-allowed!important;border-color:#d1d5db!important;color:#9ca3af!important;}',
            '.wf-ops-confirm-btn:disabled:hover{background:transparent!important;color:#9ca3af!important;}',
            '.wf-ops-cancel-btn{padding:2px 8px;font-size:11px;font-weight:600;color:#dc2626;background:transparent;border:1px solid #dc2626;border-radius:4px;cursor:pointer;white-space:nowrap;transition:background 0.15s,color 0.15s;}',
            '.wf-ops-cancel-btn:hover{background:#dc2626!important;color:#fff!important;}',
            '.wf-ops-cancel-btn:disabled{opacity:0.55;cursor:not-allowed!important;}',
            '.wf-ops-staged-add{background:rgba(34,197,94,0.14)!important;}',
            '.wf-ops-staged-remove{background:rgba(239,68,68,0.14)!important;}',
            '.wf-ops-edit-item-btn{cursor:pointer;width:100%;text-align:left;border:none;background:transparent;font:inherit;padding:2px 4px;border-radius:3px;display:block;line-height:1.35;transition:background 0.12s;}',
            '.wf-ops-edit-item-btn:not(:disabled):hover{background:rgba(79,70,229,0.08)!important;}',
            '.wf-ops-edit-item-btn:disabled{cursor:default!important;}'
        ].join('');
        document.head.appendChild(style);
    },

    _parseOpsTeamSearchResponse(text) {
        if (!text) return null;
        for (const line of text.split('\n')) {
            const t = line.trim();
            if (t.startsWith('1:{') || t.startsWith('1:{"')) {
                try { return JSON.parse(t.slice(2)); } catch (_e) { /* try next */ }
            }
        }
        const m = text.match(/^1:(\{.+\})\s*$/m);
        if (m) { try { return JSON.parse(m[1]); } catch (_e) {} }
        return null;
    },

    _setOpsTeamSearchStatus(modal, message, isError, isHtml, showClear) {
        const row = this._opsQuery(modal, '#wf-ops-team-search-status-row', 'teamSearchStatusRow');
        const status = this._opsQuery(modal, '#wf-ops-team-search-status', 'teamSearchStatus');
        const clearBtn = this._opsQuery(modal, '#wf-ops-team-search-clear-btn', 'teamSearchClearBtn');
        if (!status) return;
        if (!message) {
            if (row) row.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'none';
            return;
        }
        if (row) row.style.display = 'flex';
        status.style.color = isError ? '#dc2626' : 'var(--muted-foreground, #666)';
        if (isHtml) { status.innerHTML = message; } else { status.textContent = message; }
        if (clearBtn) clearBtn.style.display = showClear ? 'inline-block' : 'none';
    },

    _clearOpsTeamSearchResults(modal) {
        this._opsTeamSearchActive = null;
        this._opsTeamSearchMemberCache = null;
        this._opsFellowsSearchComplete = null;
        this._clearOpsMemberEditState();
        this._setOpsTeamSearchStatus(modal, '', false, false, false);

        const filterWrap = this._opsQuery(modal, '#wf-ops-team-filter-wrap', 'teamFilterWrapClear');
        const filterInput = this._opsQuery(modal, '#wf-ops-team-filter-input', 'teamFilterInputClear');
        const outputWrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchOutputClear');
        const btn = this._opsQuery(modal, '#wf-ops-team-search-btn', 'teamSearchBtnClear');

        if (filterWrap) filterWrap.style.display = 'none';
        if (filterInput) filterInput.value = '';
        this._resetOpsTeamSearchTeamFilter(modal);
        if (outputWrap) {
            outputWrap.style.display = 'none';
            outputWrap.innerHTML = '<div id="wf-ops-team-search-cards"></div>';
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
        this._captureOpsTabState(modal);
        Logger.log('ops-tab: team search results cleared');
    },

    _onOpsModalClosed() {
        this._detachOpsTeamFilterDropdownOutsideListener();
        this._opsTeamSearchSelectedTeams = new Set();
        this._clearOpsMemberEditState();
    },

    _attachOpsTeamFilterDropdownOutsideListener() {
        if (this._opsTeamFilterDropdownOutsideListener) return;
        this._opsTeamFilterDropdownOutsideListener = (e) => {
            const openModal = document.getElementById('wf-settings-modal');
            if (!openModal || !openModal.open) return;
            const wrap = openModal.querySelector('#wf-ops-team-filter-dropdown-wrap');
            const panel = openModal.querySelector('#wf-ops-team-filter-dropdown-panel');
            if (!wrap || !panel || panel.style.display === 'none') return;
            if (!wrap.contains(e.target)) {
                panel.style.display = 'none';
            }
        };
        document.addEventListener('click', this._opsTeamFilterDropdownOutsideListener);
    },

    _detachOpsTeamFilterDropdownOutsideListener() {
        if (!this._opsTeamFilterDropdownOutsideListener) return;
        document.removeEventListener('click', this._opsTeamFilterDropdownOutsideListener);
        this._opsTeamFilterDropdownOutsideListener = null;
    },

    _getOpsTeamSearchSelectedTeams() {
        return this._opsTeamSearchSelectedTeams instanceof Set ? this._opsTeamSearchSelectedTeams : new Set();
    },

    _syncOpsTeamSearchSelectedTeamsFromDom(modal) {
        const container = this._opsQuery(modal, '#wf-ops-team-filter-checkboxes', 'teamFilterCheckboxesSync');
        const selected = new Set();
        if (container) {
            container.querySelectorAll('input[type="checkbox"][data-ops-team-label]').forEach((cb) => {
                if (cb.checked) {
                    const label = cb.getAttribute('data-ops-team-label');
                    if (label) selected.add(label);
                }
            });
        }
        this._opsTeamSearchSelectedTeams = selected;
        return selected;
    },

    _opsTeamMemberMatchesTeamFilter(member, selectedTeams) {
        if (!selectedTeams || selectedTeams.size === 0) return true;
        const teamLabels = member.teamLabels || new Set();
        for (const label of selectedTeams) {
            if (teamLabels.has(label)) return true;
        }
        return false;
    },

    _opsEscapeAttr(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    },

    _populateOpsTeamFilterDropdown(modal, allTeams) {
        const container = this._opsQuery(modal, '#wf-ops-team-filter-checkboxes', 'teamFilterCheckboxesPopulate');
        if (!container || !allTeams || !allTeams.length) return;
        const selected = this._getOpsTeamSearchSelectedTeams();
        container.innerHTML = allTeams.map(([, label]) => {
            const checked = selected.has(label) ? ' checked' : '';
            const attrLabel = this._opsEscapeAttr(label);
            return '<label style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;cursor:pointer;color:var(--foreground,#333);">' +
                '<input type="checkbox" data-ops-team-label="' + attrLabel + '" style="cursor:pointer;flex-shrink:0;"' + checked + '>' +
                '<span style="min-width:0;">' + this._opsEscapeHtml(label) + '</span>' +
                '</label>';
        }).join('');
        this._updateOpsTeamFilterDropdownBtn(modal);
    },

    _updateOpsTeamFilterDropdownBtn(modal) {
        const btn = this._opsQuery(modal, '#wf-ops-team-filter-dropdown-btn', 'teamFilterDropdownBtn');
        const selected = this._getOpsTeamSearchSelectedTeams();
        if (!btn) return;
        btn.textContent = selected.size === 0 ? 'Teams' : 'Teams (' + selected.size + ')';
        this._updateOpsTeamFilterToggleAllBtn(modal);
    },

    _updateOpsTeamFilterToggleAllBtn(modal) {
        const toggleBtn = this._opsQuery(modal, '#wf-ops-team-filter-toggle-all', 'teamFilterToggleAll');
        const container = this._opsQuery(modal, '#wf-ops-team-filter-checkboxes', 'teamFilterCheckboxesToggle');
        if (!toggleBtn || !container) return;
        const boxes = container.querySelectorAll('input[type="checkbox"]');
        const allChecked = boxes.length > 0 && [...boxes].every((cb) => cb.checked);
        toggleBtn.textContent = allChecked ? 'Uncheck all' : 'Check all';
    },

    _resetOpsTeamSearchTeamFilter(modal) {
        this._opsTeamSearchSelectedTeams = new Set();
        if (!modal) return;
        const container = this._opsQuery(modal, '#wf-ops-team-filter-checkboxes', 'teamFilterCheckboxesReset');
        if (container) {
            container.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
        }
        this._updateOpsTeamFilterDropdownBtn(modal);
        const panel = this._opsQuery(modal, '#wf-ops-team-filter-dropdown-panel', 'teamFilterPanelReset');
        if (panel) panel.style.display = 'none';
    },

    _setOpsTeamFilterDropdownOpen(modal, open) {
        const panel = this._opsQuery(modal, '#wf-ops-team-filter-dropdown-panel', 'teamFilterPanelToggle');
        if (panel) panel.style.display = open ? 'block' : 'none';
    },

    _opsMemberQualifiesForUiBadge(member) {
        const teamLabels = member.teamLabels;
        if (!teamLabels || teamLabels.size === 0) return false;
        if (teamLabels.has(OPS_FLEET_FELLOWS_TEAM_LABEL)) return false;
        // No UI badges until the full Fleet Fellows search has finished.
        if (this._opsFellowsSearchComplete !== true) return false;
        for (const label of teamLabels) {
            if (!OPS_TEAM_UI_BADGE_EXCLUDED_LABELS.has(label)) return true;
        }
        return false;
    },

    _opsMemberEditStateMap() {
        if (!(this._opsMemberEditState instanceof Map)) {
            this._opsMemberEditState = new Map();
        }
        return this._opsMemberEditState;
    },

    _clearOpsMemberEditState() {
        this._opsMemberEditState = new Map();
    },

    _opsCloneStringSet(setOrArray) {
        if (setOrArray instanceof Set) return new Set(setOrArray);
        if (Array.isArray(setOrArray)) return new Set(setOrArray);
        return new Set();
    },

    _opsSetsEqual(a, b) {
        if (!a || !b || a.size !== b.size) return false;
        for (const value of a) {
            if (!b.has(value)) return false;
        }
        return true;
    },

    _getOpsMemberEditSession(memberId) {
        return this._opsMemberEditStateMap().get(memberId) || null;
    },

    _startOpsMemberEdit(member) {
        const memberId = member.id;
        const session = {
            editing: true,
            email: member.email || '',
            baselineTeams: this._opsCloneStringSet(member.teamLabels),
            baselinePerms: this._opsCloneStringSet(this._opsMemberPermissionKeys(member)),
            stagedTeams: this._opsCloneStringSet(member.teamLabels),
            stagedPerms: this._opsCloneStringSet(this._opsMemberPermissionKeys(member)),
            applying: false
        };
        this._opsMemberEditStateMap().set(memberId, session);
        Logger.log('ops-tab: member edit started for ' + (member.email || memberId));
        return session;
    },

    _cancelOpsMemberEdit(memberId) {
        if (this._opsMemberEditStateMap().has(memberId)) {
            this._opsMemberEditStateMap().delete(memberId);
            Logger.log('ops-tab: member edit cancelled for ' + memberId);
        }
    },

    _opsMemberEditHasChanges(session) {
        if (!session) return false;
        return !this._opsSetsEqual(session.baselineTeams, session.stagedTeams) ||
            !this._opsSetsEqual(session.baselinePerms, session.stagedPerms);
    },

    _toggleOpsMemberEditTeam(session, label) {
        if (!session || !session.baselineTeams.has(label)) return;
        if (session.stagedTeams.has(label)) {
            session.stagedTeams.delete(label);
        } else {
            session.stagedTeams.add(label);
        }
    },

    _toggleOpsMemberEditPermission(session, permKey) {
        if (!session) return;
        if (session.stagedPerms.has(permKey)) {
            session.stagedPerms.delete(permKey);
        } else {
            session.stagedPerms.add(permKey);
        }
    },

    _captureOpsOpenMemberDetails(modal) {
        const openIds = new Set();
        const wrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchOpenCapture');
        if (!wrap) return openIds;
        wrap.querySelectorAll('.wf-ops-member-details[open][data-member-id]').forEach((el) => {
            const id = el.getAttribute('data-member-id');
            if (id) openIds.add(id);
        });
        return openIds;
    },

    async _opsPostOrchestratorPrivate(url, body) {
        const pageWindow = this._getOpsPageWindow();
        const requestFetch = pageWindow.fetch || fetch;
        const teamId = this._getOpsCookieValue('current-team-id');
        const headers = {
            accept: 'application/json, text/plain, */*',
            'content-type': 'application/json'
        };
        if (teamId) headers['x-fleet-team-id'] = teamId;
        const res = await requestFetch.call(pageWindow, url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            credentials: 'include'
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            Logger.debug('ops-tab: orchestrator-private ' + res.status + ' body: ' + text.slice(0, 400));
            throw new Error('HTTP ' + res.status + (text ? ': ' + text.slice(0, 200) : ''));
        }
        return res.json().catch(() => null);
    },

    async _opsRemoveMemberFromTeam(teamId, email) {
        if (!teamId || !email) throw new Error('Missing team or email for bulk remove');
        await this._opsPostOrchestratorPrivate(OPS_TEAM_BULK_REMOVE_URL, {
            team_id: teamId,
            emails: [email]
        });
        Logger.debug('ops-tab: removed ' + email + ' from team ' + teamId.slice(0, 8) + '…');
    },

    async _opsModifyMemberPermission(profileId, permission, action) {
        if (!profileId || !permission || !action) {
            throw new Error('Missing profile, permission, or action');
        }
        await this._opsPostOrchestratorPrivate(OPS_TEAM_USER_PERMISSIONS_URL, {
            profile_id: profileId,
            permission,
            action
        });
        Logger.debug('ops-tab: permission ' + action + ' ' + permission + ' for ' + profileId.slice(0, 8) + '…');
    },

    _getOpsMemberFromCache(memberId) {
        const cache = this._opsTeamSearchMemberCache;
        if (!cache || !cache.memberMap) return null;
        return cache.memberMap.get(memberId) || null;
    },

    _updateOpsMemberTileDom(modal, memberId, forceOpen) {
        const cache = this._opsTeamSearchMemberCache;
        const member = this._getOpsMemberFromCache(memberId);
        if (!cache || !member) return;

        const wrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchTileUpdate');
        if (!wrap) return;

        const attrId = this._opsEscapeAttr(memberId);
        const tileEl = wrap.querySelector('[data-ops-member-tile="' + attrId + '"]');
        const detailsEl = tileEl ? tileEl.querySelector('.wf-ops-member-details') : null;
        const wasOpen = forceOpen === true || (detailsEl && detailsEl.open);
        const html = this._renderOpsTeamMemberTileHtml(member, cache.allTeams, wasOpen);

        if (tileEl) {
            tileEl.outerHTML = html;
        }
    },

    async _applyOpsMemberEditChanges(modal, memberId) {
        const session = this._getOpsMemberEditSession(memberId);
        const member = this._getOpsMemberFromCache(memberId);
        const cache = this._opsTeamSearchMemberCache;
        if (!session || !member || !cache || session.applying) return;
        if (!this._opsMemberEditHasChanges(session)) return;

        const teamRemovals = [...session.baselineTeams].filter((label) => !session.stagedTeams.has(label));
        const permAdds = [...session.stagedPerms].filter((key) => !session.baselinePerms.has(key));
        const permRemovals = [...session.baselinePerms].filter((key) => !session.stagedPerms.has(key));

        session.applying = true;
        this._updateOpsMemberTileDom(modal, memberId, true);

        try {
            for (const label of teamRemovals) {
                const teamId = this._getOpsTeamUuidByLabel(label);
                if (!teamId) throw new Error('No team UUID for "' + label + '"');
                await this._opsRemoveMemberFromTeam(teamId, session.email);
            }
            for (const permKey of permAdds) {
                await this._opsModifyMemberPermission(memberId, permKey, 'add');
            }
            for (const permKey of permRemovals) {
                await this._opsModifyMemberPermission(memberId, permKey, 'remove');
            }

            member.teamLabels = this._opsCloneStringSet(session.stagedTeams);
            member.permissions = [...session.stagedPerms];
            this._cancelOpsMemberEdit(memberId);

            Logger.log('ops-tab: member edit applied for ' + session.email +
                ' (teams -' + teamRemovals.length + ', perms +' + permAdds.length + ' -' + permRemovals.length + ')');

            const openIds = this._captureOpsOpenMemberDetails(modal);
            openIds.add(memberId);
            this._renderOpsTeamSearchCards(modal, cache.memberMap, cache.allTeams, 0, openIds);
        } catch (e) {
            session.applying = false;
            Logger.error('ops-tab: member edit failed for ' + memberId, e);
            this._setOpsTeamSearchStatus(modal,
                'Failed to apply changes: ' + (e && e.message ? e.message : String(e)), true, false, true);
            this._updateOpsMemberTileDom(modal, memberId, true);
        }
    },

    _handleOpsMemberEditClick(e, modal) {
        const actionEl = e.target.closest('[data-ops-action][data-ops-member-id]');
        if (!actionEl || !modal.contains(actionEl)) return;
        if (!actionEl.closest('#wf-ops-team-search-output-wrap')) return;

        e.preventDefault();
        e.stopPropagation();

        const memberId = actionEl.getAttribute('data-ops-member-id');
        const action = actionEl.getAttribute('data-ops-action');
        if (!memberId || !action) return;

        const member = this._getOpsMemberFromCache(memberId);
        if (!member) {
            Logger.warn('ops-tab: member edit action skipped — member not in cache');
            return;
        }

        if (action === 'search-worker-output') {
            this._openMemberInWorkerSearch(member);
            return;
        }

        if (action === 'edit') {
            this._startOpsMemberEdit(member);
            this._updateOpsMemberTileDom(modal, memberId, true);
            return;
        }

        const session = this._getOpsMemberEditSession(memberId);
        if (!session) return;

        if (action === 'cancel') {
            if (session.applying) return;
            this._cancelOpsMemberEdit(memberId);
            this._updateOpsMemberTileDom(modal, memberId, true);
            return;
        }

        if (action === 'confirm') {
            if (session.applying || !this._opsMemberEditHasChanges(session)) return;
            void this._applyOpsMemberEditChanges(modal, memberId);
            return;
        }

        if (session.applying) return;

        if (action === 'toggle-team') {
            const label = actionEl.getAttribute('data-ops-team-label');
            if (!label) return;
            this._toggleOpsMemberEditTeam(session, label);
            this._updateOpsMemberTileDom(modal, memberId, true);
            return;
        }

        if (action === 'toggle-perm') {
            const permKey = actionEl.getAttribute('data-ops-perm-key');
            if (!permKey) return;
            this._toggleOpsMemberEditPermission(session, permKey);
            this._updateOpsMemberTileDom(modal, memberId, true);
        }
    },

    _renderOpsMemberEditActionsHtml(memberId, session) {
        const attrId = this._opsEscapeAttr(memberId);
        if (session && session.editing) {
            const hasChanges = this._opsMemberEditHasChanges(session);
            const confirmDisabled = !hasChanges || session.applying;
            return '<span class="wf-ops-member-edit-actions" style="gap:6px;flex-shrink:0;margin-right:8px;align-items:center;">' +
                '<button type="button" class="wf-ops-confirm-btn" data-ops-member-id="' + attrId + '" data-ops-action="confirm"' +
                    (confirmDisabled ? ' disabled' : '') + '>Confirm</button>' +
                '<button type="button" class="wf-ops-cancel-btn" data-ops-member-id="' + attrId + '" data-ops-action="cancel"' +
                    (session.applying ? ' disabled' : '') + '>Cancel</button>' +
                '</span>';
        }
        return '<span class="wf-ops-member-edit-actions" style="flex-shrink:0;margin-right:8px;align-items:center;">' +
            '<button type="button" class="wf-ops-edit-btn" data-ops-member-id="' + attrId + '" data-ops-action="edit">Edit</button>' +
            '</span>';
    },

    _opsProfileLinkIconSvg() {
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>';
    },

    _opsProfileLinkHtml(profileUrl, title) {
        const url = String(profileUrl || '').trim();
        if (!url) return '';
        const label = title || 'Open profile in Fleet';
        return '<a href="' + this._opsEscapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="wf-ops-profile-link-btn" ' +
            'title="' + this._opsEscapeHtml(label) + '" aria-label="' + this._opsEscapeHtml(label) + '">' +
            this._opsProfileLinkIconSvg() + '</a>';
    },

    _opsSearchWorkerOutputBtnHtml(memberId) {
        const attrId = this._opsEscapeAttr(memberId);
        return '<button type="button" class="wf-ops-action-btn wf-ops-search-output-btn" data-ops-action="search-worker-output" data-ops-member-id="' + attrId + '" ' +
            'style="flex-shrink:0;font-size:11px;font-weight:500;color:var(--brand,#4f46e5);padding:4px 8px;border:1px solid var(--border,#e5e5e5);' +
            'border-radius:4px;background:var(--background,white);white-space:nowrap;cursor:pointer;">Search Worker Output</button>';
    },

    _opsMemberToAuthorPerson(member) {
        if (!member || !member.id) return null;
        return {
            id: member.id,
            full_name: member.full_name,
            email: member.email
        };
    },

    _openMemberInWorkerSearch(member) {
        const person = this._opsMemberToAuthorPerson(member);
        if (!person) {
            Logger.warn('ops-tab: Search Worker Output skipped — missing member id');
            return;
        }
        if (!Context.dashboard || typeof Context.dashboard.setAuthorTokens !== 'function') {
            Logger.warn('ops-tab: Search Worker Output skipped — dashboard unavailable');
            return;
        }
        Context.dashboard.setAuthorTokens([person], { replace: true, activeTab: 'search-output' });
        Logger.log('ops-tab: Search Worker Output for ' + (person.full_name || person.id));
    },

    _renderOpsMemberTeamRowHtml(label, member, session) {
        const memberId = member.id || '';
        const attrId = this._opsEscapeAttr(memberId);
        const attrLabel = this._opsEscapeAttr(label);
        const editing = session && session.editing;
        const teamLabels = member.teamLabels || new Set();
        const inBaseline = editing ? session.baselineTeams.has(label) : teamLabels.has(label);
        const inStaged = editing ? session.stagedTeams.has(label) : inBaseline;

        if (editing) {
            if (!inBaseline) {
                return '<div style="font-size:11px;padding:2px 4px;color:var(--muted-foreground,#999);">' +
                    '<span style="opacity:0.35;">—</span> ' + this._opsEscapeHtml(label) + '</div>';
            }
            const changed = inStaged !== inBaseline;
            const stagedClass = changed ? ' wf-ops-staged-remove' : '';
            const icon = changed ? '❌ ' : '✅ ';
            const color = 'var(--foreground,#333)';
            return '<button type="button" class="wf-ops-edit-item-btn' + stagedClass + '" data-ops-action="toggle-team" data-ops-member-id="' +
                attrId + '" data-ops-team-label="' + attrLabel + '" style="font-size:11px;color:' + color + ';">' +
                icon + this._opsEscapeHtml(label) + '</button>';
        }

        return '<div style="font-size:11px;padding:2px 0;color:' +
            (inBaseline ? 'var(--foreground,#333)' : 'var(--muted-foreground,#999)') + ';">' +
            (inBaseline ? '✅ ' : '<span style="opacity:0.35;">—</span> ') +
            this._opsEscapeHtml(label) + '</div>';
    },

    _renderOpsMemberPermRowHtml(permKey, permLabel, member, session) {
        const memberId = member.id || '';
        const attrId = this._opsEscapeAttr(memberId);
        const attrPerm = this._opsEscapeAttr(permKey);
        const editing = session && session.editing;
        const permissionKeys = new Set(this._opsMemberPermissionKeys(member));
        const inBaseline = editing ? session.baselinePerms.has(permKey) : permissionKeys.has(permKey);
        const inStaged = editing ? session.stagedPerms.has(permKey) : inBaseline;

        if (editing) {
            const changed = inStaged !== inBaseline;
            const stagedClass = changed ? (inStaged ? ' wf-ops-staged-add' : ' wf-ops-staged-remove') : '';
            let icon;
            if (changed) {
                icon = inStaged ? '✅ ' : '❌ ';
            } else {
                icon = inStaged ? '✅ ' : '<span style="opacity:0.35;">—</span> ';
            }
            const color = inStaged || changed ? 'var(--foreground,#333)' : 'var(--muted-foreground,#999)';
            return '<button type="button" class="wf-ops-edit-item-btn' + stagedClass + '" data-ops-action="toggle-perm" data-ops-member-id="' +
                attrId + '" data-ops-perm-key="' + attrPerm + '" style="font-size:11px;color:' + color + ';">' +
                icon + this._opsEscapeHtml(permLabel) + '</button>';
        }

        return '<div style="font-size:11px;padding:2px 0;color:' +
            (inBaseline ? 'var(--foreground,#333)' : 'var(--muted-foreground,#999)') + ';">' +
            (inBaseline ? '✅ ' : '<span style="opacity:0.35;">—</span> ') +
            this._opsEscapeHtml(permLabel) + '</div>';
    },

    _renderOpsTeamMemberTileHtml(member, allTeams, isOpen) {
        const memberId = member.id || '';
        const name = this._opsEscapeHtml(member.full_name || 'Unknown');
        const email = this._opsEscapeHtml(member.email || '');
        const profileUrl = 'https://www.fleetai.com/dashboard/data/experts/' + encodeURIComponent(memberId);
        const teamLabels = member.teamLabels || new Set();
        const session = this._getOpsMemberEditSession(memberId);
        const displayTeamLabels = session ? session.stagedTeams : teamLabels;
        const displayPermKeys = session ? session.stagedPerms : new Set(this._opsMemberPermissionKeys(member));
        const knownPermCount = OPS_ALL_PERMISSIONS.reduce((count, [key]) => count + (displayPermKeys.has(key) ? 1 : 0), 0);
        const showUiBadge = this._opsMemberQualifiesForUiBadge(member);
        const uiBadgeHtml = showUiBadge
            ? '<span style="display:inline-block;font-size:9px;font-weight:700;letter-spacing:0.04em;padding:1px 5px;border-radius:3px;background:var(--brand,#4f46e5);color:#fff;line-height:1.4;flex-shrink:0;">UI</span>'
            : '';

        const teamsColHtml = allTeams.map(([, label]) =>
            this._renderOpsMemberTeamRowHtml(label, member, session)).join('');

        const permsColHtml = OPS_ALL_PERMISSIONS.map(([permKey, permLabel]) =>
            this._renderOpsMemberPermRowHtml(permKey, permLabel, member, session)).join('');

        const summaryLabel = 'Teams (' + displayTeamLabels.size + '/' + allTeams.length + ')  ·  Permissions (' +
            knownPermCount + '/' + OPS_ALL_PERMISSIONS.length + ')';

        const colHeader = (text) =>
            '<div style="font-size:10px;font-weight:600;color:var(--muted-foreground,#999);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">' +
            text + '</div>';

        const openAttr = isOpen !== false ? ' open' : '';

        return '<div data-ops-member-tile="' + this._opsEscapeAttr(memberId) + '" style="border:1px solid var(--border,#e5e5e5);border-radius:6px;padding:10px 12px;margin-bottom:8px;background:var(--card,#fafafa);">' +
            '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:10px;row-gap:2px;align-items:start;">' +
                '<div style="min-width:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
                    uiBadgeHtml +
                    '<span style="font-size:13px;font-weight:600;color:var(--foreground,#333);">' + name + '</span>' +
                '</div>' +
                '<div style="grid-row:span 2;align-self:center;display:flex;flex-direction:column;align-items:flex-end;gap:6px;">' +
                    this._opsSearchWorkerOutputBtnHtml(memberId) +
                    this._opsProfileLinkHtml(profileUrl, 'Open profile in Fleet') +
                '</div>' +
                '<div style="font-size:11px;color:var(--muted-foreground,#666);min-width:0;">' + email + '</div>' +
            '</div>' +
            '<details class="wf-ops-member-details" data-member-id="' + this._opsEscapeAttr(memberId) + '" style="margin-top:8px;"' + openAttr + '>' +
                '<summary style="font-size:11px;cursor:pointer;color:var(--muted-foreground,#666);list-style:none;user-select:none;display:flex;align-items:center;gap:8px;">' +
                    this._renderOpsMemberEditActionsHtml(memberId, session) +
                    '<span style="min-width:0;flex:1;">▾ ' + this._opsEscapeHtml(summaryLabel) + '</span>' +
                '</summary>' +
                '<div style="margin-top:6px;padding:6px 8px;background:var(--background,white);border:1px solid var(--border,#e5e5e5);border-radius:4px;' +
                    'display:grid;grid-template-columns:1fr 1fr;gap:0 16px;">' +
                    '<div>' + colHeader('Teams') + teamsColHtml + '</div>' +
                    '<div>' + colHeader('Permissions') + permsColHtml + '</div>' +
                '</div>' +
            '</details>' +
        '</div>';
    },

    _opsTeamMemberMatchesFilter(member, allTeams, filterText) {
        if (!filterText) return true;
        const teamLabels = member.teamLabels || new Set();
        const perms = this._opsMemberPermissionKeys(member);
        const haystack = [
            member.full_name || '',
            member.email || '',
            ...[...teamLabels],
            ...perms.map((p) => this._getOpsPermissionDisplayLabel(p))
        ].join(' ').toLowerCase();
        return filterText.toLowerCase().split(/\s+/).filter(Boolean).every(t => haystack.includes(t));
    },

    _filterOpsTeamSearchCards(modal) {
        const cache = this._opsTeamSearchMemberCache;
        if (!cache) return;
        this._renderOpsTeamSearchCards(modal, cache.memberMap, cache.allTeams, 0);
    },

    _renderOpsTeamSearchCards(modal, memberMap, allTeams, pendingCount, openMemberIds) {
        const wrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchCards');
        if (!wrap) return;

        const filterInput = this._opsQuery(modal, '#wf-ops-team-filter-input', 'teamSearchFilterRead');
        const filterText = filterInput ? filterInput.value : '';
        const openIds = openMemberIds instanceof Set
            ? openMemberIds
            : this._captureOpsOpenMemberDetails(modal);

        let members = [...memberMap.values()];

        const selectedTeams = this._getOpsTeamSearchSelectedTeams();
        if (selectedTeams.size > 0) {
            members = members.filter((m) => this._opsTeamMemberMatchesTeamFilter(m, selectedTeams));
        }
        if (filterText) {
            members = members.filter(m => this._opsTeamMemberMatchesFilter(m, allTeams, filterText));
        }

        if (members.length === 0) {
            if (pendingCount > 0) {
                wrap.style.display = 'none';
            } else {
                wrap.style.display = 'block';
                let msg = 'No members found.';
                if (filterText && selectedTeams.size > 0) msg = 'No results match filters.';
                else if (filterText) msg = 'No results match filter.';
                else if (selectedTeams.size > 0) msg = 'No members in selected teams.';
                wrap.innerHTML = '<div style="text-align:center;padding:12px 0;font-size:12px;color:var(--muted-foreground,#666);">' + this._opsEscapeHtml(msg) + '</div>';
            }
            return;
        }

        members.sort((a, b) => {
            const diff = (b.teamLabels ? b.teamLabels.size : 0) - (a.teamLabels ? a.teamLabels.size : 0);
            return diff !== 0 ? diff : (a.full_name || '').localeCompare(b.full_name || '');
        });

        wrap.style.display = 'block';
        wrap.innerHTML = members.map((m) =>
            this._renderOpsTeamMemberTileHtml(m, allTeams, true)).join('');
    },

    async _handleOpsTeamSearch(modal) {
        const input = this._opsQuery(modal, '#wf-ops-team-search-input', 'teamSearchInput');
        const btn = this._opsQuery(modal, '#wf-ops-team-search-btn', 'teamSearchBtn');
        const query = input ? input.value.trim() : '';

        const secrets = this._getOpsSecretsJson();
        const allTeams = secrets && Array.isArray(secrets['team-uuids']) ? secrets['team-uuids'] : [];

        if (!allTeams.length) {
            this._setOpsTeamSearchStatus(modal, 'No teams found in secrets. Ensure ops secrets are decrypted.', true);
            return;
        }
        const userId = this._getOpsCurrentUserId();
        if (!userId) {
            this._setOpsTeamSearchStatus(modal, 'No user ID found. Open Fleet while logged in and try again.', true);
            return;
        }

        if (!this._opsTeamSearchActionCache.nextAction) {
            this._showOpsTeamSearchActionRefreshBanner(modal);
            return;
        }

        this._injectOpsSpinnerStyle();

        const sessionId = Date.now();
        this._opsTeamSearchActive = sessionId;
        this._opsTeamSearchMemberCache = null;
        this._clearOpsMemberEditState();

        if (btn) { btn.disabled = true; btn.textContent = 'Searching...'; }

        // Show filter row; clear text filter only (retain team checkbox selections)
        const filterWrap = this._opsQuery(modal, '#wf-ops-team-filter-wrap', 'teamFilterWrapShow');
        const filterInput = this._opsQuery(modal, '#wf-ops-team-filter-input', 'teamFilterInputReset');
        if (filterWrap) filterWrap.style.display = 'flex';
        if (filterInput) filterInput.value = '';
        if (this._opsTeamSearchSelectedTeams == null) {
            this._opsTeamSearchSelectedTeams = new Set();
        }
        this._populateOpsTeamFilterDropdown(modal, allTeams);

        const memberMap = new Map();
        let pendingCount = allTeams.length;
        let doneCount = 0;
        let staleActionDetected = false;

        const fellowsEntry = allTeams.find(([, label]) => label === OPS_FLEET_FELLOWS_TEAM_LABEL) || null;
        this._opsFellowsSearchComplete = fellowsEntry ? false : true;

        const spinnerHtml = '<span style="display:inline-block;width:10px;height:10px;border:2px solid rgba(79,70,229,0.2);border-top-color:var(--brand,#4f46e5);border-radius:50%;animation:wf-ops-spin 0.7s linear infinite;vertical-align:middle;margin-right:5px;"></span>';
        this._setOpsTeamSearchStatus(modal, spinnerHtml + 'Searching ' + allTeams.length + ' teams…', false, true, false);

        const finishTeamSearch = (teamLabel) => {
            pendingCount--;
            doneCount++;
            if (this._opsTeamSearchActive !== sessionId) return;
            if (teamLabel === OPS_FLEET_FELLOWS_TEAM_LABEL) {
                this._opsFellowsSearchComplete = true;
            }
            this._renderOpsTeamSearchCards(modal, memberMap, allTeams, pendingCount);
            if (pendingCount > 0) {
                this._setOpsTeamSearchStatus(modal,
                    spinnerHtml + doneCount + '/' + allTeams.length + ' teams searched, ' + memberMap.size + ' member' + (memberMap.size !== 1 ? 's' : '') + ' so far…',
                    false, true, false);
            } else {
                this._setOpsTeamSearchStatus(modal,
                    memberMap.size + ' unique member' + (memberMap.size !== 1 ? 's' : '') + ' across ' + allTeams.length + ' teams.',
                    false, false, true);
                Logger.log('ops-tab: team search complete — ' + memberMap.size + ' unique members, ' + allTeams.length + ' teams');
            }
        };

        const searches = allTeams.map(async ([teamId, teamLabel]) => {
            try {
                const members = await this._fetchOpsTeamSearchAllMembers(teamId, userId, query);
                if (this._opsTeamSearchActive !== sessionId) return;
                if (staleActionDetected) return;
                this._mergeOpsTeamSearchMembers(memberMap, members, teamLabel);
                Logger.debug('ops-tab: team search got ' + members.length + ' members from ' + teamLabel);
            } catch (e) {
                if (this._isOpsTeamSearchActionStaleError(e)) {
                    staleActionDetected = true;
                    Logger.warn('ops-tab: team search credentials stale for ' + teamLabel);
                } else {
                    Logger.warn('ops-tab: team search failed for ' + teamLabel, e);
                }
            } finally {
                finishTeamSearch(teamLabel);
            }
        });

        await Promise.allSettled(searches);

        if (this._opsTeamSearchActive === sessionId) {
            if (staleActionDetected) {
                this._showOpsTeamSearchActionRefreshBanner(modal);
                this._opsTeamSearchMemberCache = null;
            } else {
                this._opsTeamSearchMemberCache = { memberMap, allTeams };
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
            this._captureOpsTabState(modal);
        }
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
        const jwt = this._getOpsFleetUserJwt(pageWindow);
        if (!jwt) {
            Logger.warn('ops-tab: orchestrator skipped — no Fleet user JWT (open Fleet on a data page)');
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
                Logger.warn('ops-tab: orchestrator HTTP ' + res.status, {
                    verifierId: resolved.verifierId,
                    teamId: teamId || '(none)',
                    body: text.slice(0, 200)
                });
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
            const rows = await this._opsPostgrestQuery('verifier_versions.select_list', {
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
            verifier_id: 'eq.' + resolved.verifierId,
            order: 'version.desc'
        };
        if (version != null) {
            params.version = 'eq.' + version;
            delete params.order;
        }
        Logger.debug('ops-tab: verifier_versions fetch params', JSON.stringify(params));
        const rows = await this._opsPostgrestQuery('verifier_versions.select_source', params);
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!row) {
            const pageWindow = this._getOpsPageWindow();
            if (!this._getOpsFleetUserJwt(pageWindow)) {
                throw this._opsSessionRefreshRequiredError();
            }
            const hint = resolved.teamId
                ? 'PostgREST returned no rows (RLS or team scope). Team ' + resolved.teamId.slice(0, 8) + '…'
                : 'PostgREST returned no rows — likely RLS or missing team context.';
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
            copyBtn.style.display = text ? 'inline-block' : 'none';
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
        const teamSearchInput = this._opsQuery(modal, '#wf-ops-team-search-input', 'teamSearchInputCapture');
        const teamSearchStatusRow = this._opsQuery(modal, '#wf-ops-team-search-status-row', 'teamSearchStatusRowCapture');
        const teamSearchStatus = this._opsQuery(modal, '#wf-ops-team-search-status', 'teamSearchStatusCapture');
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
                : null,
            teamSearchQuery: teamSearchInput ? teamSearchInput.value : '',
            teamSearchStatus: teamSearchStatusRow && teamSearchStatusRow.style.display !== 'none' && teamSearchStatus
                ? (teamSearchStatus.textContent || '')
                : '',
            teamSearchStatusIsError: teamSearchStatus ? teamSearchStatus.style.color === '#dc2626' : false
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

        const teamSearchInput = this._opsQuery(modal, '#wf-ops-team-search-input', 'teamSearchInputRestore');
        if (teamSearchInput && state.teamSearchQuery != null) {
            teamSearchInput.value = state.teamSearchQuery;
        }
        if (state.teamSearchStatus) {
            const showClear = /unique member/.test(state.teamSearchStatus) && /across/.test(state.teamSearchStatus);
            this._setOpsTeamSearchStatus(modal, state.teamSearchStatus, state.teamSearchStatusIsError, false, showClear);
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
        void this._loadOpsSecrets(true);
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
        const opsUnlocked = opsWantsEnabled && opsHasStoredPassword;
        const switchHTML = this._renderOpsSwitchHTML('wf-ops-tab-enabled', opsWantsEnabled);
        const openOnSettings = this._getOpsDashboardOpenOnSettings();
        const submoduleSwitchHTML = this._renderOpsSubSwitchHTML('wf-ops-dashboard-open-on-settings', openOnSettings);
        const passwordPanelDisplay = opsNeedsPassword ? 'block' : 'none';
        const suboptionsDisplay = opsWantsEnabled ? 'block' : 'none';
        const openDashboardBtnDisplay = opsUnlocked ? 'block' : 'none';
        return `
            <div style="margin-bottom: 20px;">
                <div style="padding: 12px 14px; border: 1px solid var(--border, #e5e5e5); border-radius: 8px; background: var(--card, #fafafa);">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                        <div style="font-size: 14px; font-weight: 600; color: var(--foreground, #333);">Enable Ops Dashboard</div>
                        ${switchHTML}
                    </div>
                    <div id="wf-ops-dashboard-suboptions-wrap" style="display: ${suboptionsDisplay}; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border, #e5e5e5);">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 0 4px 12px;">
                            <label for="wf-ops-dashboard-open-on-settings" style="font-size: 12px; color: var(--muted-foreground, #666); cursor: pointer; flex: 1; min-width: 0;">
                                Open dashboard when opening settings
                            </label>
                            ${submoduleSwitchHTML}
                        </div>
                        <button type="button" id="wf-ops-open-dashboard-btn" class="wf-ops-action-btn" style="
                            display: ${openDashboardBtnDisplay};
                            width: 100%;
                            margin-top: 10px;
                            padding: 8px 14px;
                            font-size: 13px;
                            font-weight: 600;
                            color: var(--brand, #4f46e5);
                            background: var(--background, white);
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                            cursor: pointer;
                            box-sizing: border-box;
                        ">Open Dashboard</button>
                    </div>
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
                        <button type="button" id="wf-ops-password-submit" class="wf-ops-action-btn" style="
                            flex-shrink: 0;
                            padding: 8px 14px;
                            font-size: 13px;
                            font-weight: 600;
                            color: var(--brand, #4f46e5);
                            background: var(--background, white);
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                        ">Unlock</button>
                    </div>
                    <div id="wf-ops-password-error" style="display: none; margin-top: 8px; font-size: 12px; color: #dc2626; line-height: 1.45;"></div>
                </div>
            </div>`;
    },

    _syncOpsSettingsSubmoduleVisibility(modal) {
        const wrap = this._opsQuery(modal, '#wf-ops-dashboard-suboptions-wrap', 'opsSubmoduleWrap');
        const openBtn = this._opsQuery(modal, '#wf-ops-open-dashboard-btn', 'opsOpenDashboardBtn');
        const wanted = this._getOpsTabWanted();
        const unlocked = wanted && this._hasOpsStoredPassword();
        if (wrap) wrap.style.display = wanted ? 'block' : 'none';
        if (openBtn) openBtn.style.display = unlocked ? 'block' : 'none';
    },

    _renderOpsSwitchHTML(id, isEnabled) {
        return this._renderOpsToggleSwitchHTML(id, isEnabled, {
            onColor: '#22c55e',
            width: 44,
            height: 24,
            knobSize: 18,
            knobLeftOn: 23,
            knobLeftOff: 3,
            knobBottom: 3
        });
    },

    _renderOpsSubSwitchHTML(id, isEnabled) {
        return this._renderOpsToggleSwitchHTML(id, isEnabled, {
            onColor: '#6366f1',
            width: 33,
            height: 18,
            knobSize: 13.5,
            knobLeftOn: 17,
            knobLeftOff: 3,
            knobBottom: 2
        });
    },

    _renderOpsToggleSwitchHTML(id, isEnabled, spec) {
        const onColor = spec.onColor;
        const sliderBg = isEnabled ? onColor : '#ccc';
        const knobLeft = isEnabled ? spec.knobLeftOn : spec.knobLeftOff;
        return `
            <label style="position: relative; display: inline-block; width: ${spec.width}px; height: ${spec.height}px; flex-shrink: 0;">
                <input type="checkbox" id="${id}" ${isEnabled ? 'checked' : ''} style="opacity: 0; width: 0; height: 0; position: absolute;">
                <span class="wf-toggle-slider" style="
                    position: absolute;
                    cursor: pointer;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-color: ${sliderBg};
                    transition: 0.2s;
                    border-radius: 24px;
                " data-wf-on-color="${onColor}" data-wf-knob-left-on="${spec.knobLeftOn}" data-wf-knob-left-off="${spec.knobLeftOff}" data-wf-knob-bottom="${spec.knobBottom}">
                    <span style="
                        position: absolute;
                        height: ${spec.knobSize}px;
                        width: ${spec.knobSize}px;
                        left: ${knobLeft}px;
                        bottom: ${spec.knobBottom}px;
                        background-color: white;
                        transition: 0.2s;
                        border-radius: 50%;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                    "></span>
                </span>
            </label>
        `;
    },

    _renderTeamMembersPanel() {
        return `
                <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;">
                    <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 6px 0; color: var(--foreground, #0f172a); flex-shrink: 0;">
                        Team Member Search
                    </h3>
                    <p style="font-size: 12px; color: var(--muted-foreground, #666); margin: 0 0 10px 0; line-height: 1.45;">
                        Search the Computer Use team by name or email. Leave blank to list all members.
                    </p>
                    <div style="display: flex; gap: 8px; align-items: stretch;">
                        <input type="text" id="wf-ops-team-search-input" placeholder="Name or email…" autocomplete="off" style="
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
                        <button type="button" id="wf-ops-team-search-btn" class="wf-ops-action-btn" style="
                            flex-shrink: 0;
                            padding: 8px 14px;
                            font-size: 12px;
                            font-weight: 600;
                            color: var(--brand, #4f46e5);
                            background: var(--background, white);
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                        ">Search</button>
                    </div>
                    <div id="wf-ops-team-filter-wrap" style="display: none; margin-top: 6px; align-items: stretch; gap: 8px; flex-wrap: nowrap;">
                        <input type="text" id="wf-ops-team-filter-input" placeholder="Filter results by name, email, team, or permission…" autocomplete="off" style="
                            flex: 1;
                            min-width: 0;
                            padding: 6px 12px;
                            font-size: 12px;
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                            background: var(--background, white);
                            color: var(--foreground, #333);
                            box-sizing: border-box;
                        ">
                        <div id="wf-ops-team-filter-dropdown-wrap" style="position: relative; flex-shrink: 0;">
                            <button type="button" id="wf-ops-team-filter-dropdown-btn" style="
                                height: 100%;
                                padding: 6px 12px;
                                font-size: 12px;
                                font-weight: 500;
                                color: var(--foreground, #333);
                                background: var(--background, white);
                                border: 1px solid var(--border, #e5e5e5);
                                border-radius: 6px;
                                cursor: pointer;
                                white-space: nowrap;
                            ">Teams</button>
                            <div id="wf-ops-team-filter-dropdown-panel" style="
                                display: none;
                                position: absolute;
                                right: 0;
                                top: calc(100% + 4px);
                                z-index: 20;
                                min-width: 220px;
                                max-height: 280px;
                                overflow-y: auto;
                                padding: 8px;
                                background: var(--background, white);
                                border: 1px solid var(--border, #e5e5e5);
                                border-radius: 6px;
                                box-shadow: 0 4px 12px rgba(0,0,0,0.12);
                            ">
                                <button type="button" id="wf-ops-team-filter-toggle-all" style="
                                    width: 100%;
                                    padding: 4px 8px;
                                    font-size: 11px;
                                    font-weight: 500;
                                    color: var(--brand, #4f46e5);
                                    background: transparent;
                                    border: 1px solid var(--border, #e5e5e5);
                                    border-radius: 4px;
                                    cursor: pointer;
                                ">Check all</button>
                                <div id="wf-ops-team-filter-checkboxes" style="margin-top: 6px;"></div>
                            </div>
                        </div>
                    </div>
                    <div id="wf-ops-team-search-status-row" style="display: none; margin-top: 8px; align-items: center; justify-content: space-between; gap: 8px;">
                        <div id="wf-ops-team-search-status" style="flex: 1; min-width: 0; font-size: 12px; color: var(--muted-foreground, #666); line-height: 1.45;"></div>
                        <button type="button" id="wf-ops-team-search-clear-btn" style="
                            display: none;
                            flex-shrink: 0;
                            padding: 2px 10px;
                            font-size: 11px;
                            font-weight: 500;
                            color: var(--muted-foreground, #666);
                            background: var(--background, white);
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 4px;
                            cursor: pointer;
                        ">Clear</button>
                    </div>
                    <div id="wf-ops-team-search-output-wrap" style="display: none; width: 100%; margin-top: 8px; flex: 1; min-height: 0; max-height: none; overflow-y: auto;">
                        <div id="wf-ops-team-search-cards"></div>
                    </div>
                </div>`;
    },

    _renderTaskLinkBar() {
        return `
            <div id="wf-ops-task-link-bar" style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex-shrink: 0; max-width: min(100%, 560px);">
                <label for="wf-ops-task-input" style="font-size: 11px; font-weight: 600; color: var(--muted-foreground, #64748b); white-space: nowrap; flex-shrink: 0;">Go to Task:</label>
                <input type="text" id="wf-ops-task-input" placeholder="Task key or UUID" autocomplete="off" title="Task View Link Generator" style="
                    flex: 1;
                    min-width: 120px;
                    padding: 6px 10px;
                    font-size: 12px;
                    border: 1px solid var(--border, #e2e8f0);
                    border-radius: 6px;
                    background: var(--background, #fff);
                    color: var(--foreground, #0f172a);
                    box-sizing: border-box;
                ">
                <div id="wf-ops-link-row" style="display: none; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <button type="button" id="wf-ops-open-link" class="wf-ops-action-btn" style="
                        padding: 6px 10px;
                        font-size: 11px;
                        font-weight: 600;
                        color: var(--brand, #2563eb);
                        background: var(--background, white);
                        border: 1px solid var(--border, #e2e8f0);
                        border-radius: 6px;
                        cursor: pointer;
                    ">Open</button>
                    <button type="button" id="wf-ops-open-link-new-tab" class="wf-ops-action-btn" style="
                        padding: 6px 10px;
                        font-size: 11px;
                        font-weight: 600;
                        color: var(--brand, #2563eb);
                        background: var(--background, white);
                        border: 1px solid var(--border, #e2e8f0);
                        border-radius: 6px;
                        cursor: pointer;
                    ">New Tab</button>
                    <button type="button" id="wf-ops-copy-link" title="Copy link" aria-label="Copy link" style="
                        padding: 6px 10px;
                        font-size: 11px;
                        font-weight: 600;
                        color: var(--muted-foreground, #64748b);
                        background: var(--background, white);
                        border: 1px solid var(--border, #e2e8f0);
                        border-radius: 6px;
                        cursor: pointer;
                    ">Copy</button>
                </div>
            </div>`;
    },

    _renderVerifierFetcherPanel() {
        return `
                <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-y: auto;">
                    <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: var(--foreground, #0f172a); flex-shrink: 0;">
                        Verifier Code Fetcher
                    </h3>
                    <p style="font-size: 12px; color: var(--muted-foreground, #666); margin: 0 0 10px 0; line-height: 1.45;">
                        Paste a task key, task URL, verifier key, verifier ID, or copied seed data.
                    </p>
                    <div style="display: flex; gap: 8px; align-items: stretch;">
                        <input type="text" id="wf-ops-verifier-input" placeholder="Paste here" autocomplete="off" style="
                            flex: 1;
                            min-width: 0;
                            padding: 8px 12px;
                            font-size: 12px;
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                            background: var(--background, white);
                            color: var(--foreground, #333);
                            box-sizing: border-box;
                            font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
                        ">
                        <button type="button" id="wf-ops-fetch-verifier" class="wf-ops-action-btn" style="
                            flex-shrink: 0;
                            padding: 8px 14px;
                            font-size: 12px;
                            font-weight: 600;
                            color: var(--brand, #4f46e5);
                            background: var(--background, white);
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                        ">Fetch</button>
                        <button type="button" id="wf-ops-copy-verifier" style="
                            display: none;
                            flex-shrink: 0;
                            padding: 2px 10px;
                            font-size: 11px;
                            font-weight: 500;
                            color: var(--muted-foreground, #666);
                            background: var(--background, white);
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 4px;
                            cursor: pointer;
                            transition: background 0.2s, color 0.2s;
                        ">Copy</button>
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
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border, #e2e8f0); flex-shrink: 0;">
                    <a href="${OPS_GRADE_ASSESSMENTS_URL}" target="_blank" rel="noopener noreferrer" id="wf-ops-grade-assessments" class="wf-ops-action-btn" style="
                        display: inline-block;
                        padding: 8px 14px;
                        font-size: 12px;
                        font-weight: 600;
                        text-align: center;
                        text-decoration: none;
                        color: var(--brand, #2563eb);
                        background: var(--background, white);
                        border: 1px solid var(--border, #e2e8f0);
                        border-radius: 6px;
                        box-sizing: border-box;
                    ">Grade Assessments</a>
                </div>
                </div>`;
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
                fetchBtn.textContent = 'Fetch';
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
        if (!opsTabToggle || opsTabToggle.dataset.wfOpsTabToggleBound === '1') return;
        opsTabToggle.dataset.wfOpsTabToggleBound = '1';
        const self = this;
        opsTabToggle.addEventListener('change', (e) => {
            const wantsEnabled = e.target.checked;
            const handleToggleChange = settingsPlugin && typeof settingsPlugin.handleToggleChange === 'function'
                ? (evt) => settingsPlugin.handleToggleChange(evt)
                : () => {};
            if (!wantsEnabled) {
                handleToggleChange(e);
                self._setOpsTabWanted(false);
                self._setOpsPasswordPanelVisible(modal, false);
                self._setOpsPasswordError(modal, '');
                self._syncOpsSettingsSubmoduleVisibility(modal);
                if (Context.dashboard && typeof Context.dashboard.close === 'function' && Context.dashboard.isOpen()) {
                    Context.dashboard.close();
                }
                Logger.log('ops-tab: Ops dashboard disabled');
                return;
            }
            self._setOpsTabWanted(true);
            self._syncOpsSettingsSubmoduleVisibility(modal);
            if (self._hasOpsStoredPassword()) {
                handleToggleChange(e);
                Logger.log('ops-tab: Ops dashboard enabled');
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

    _attachOpsDashboardOpenOnSettingsListener(modal) {
        const toggle = this._opsQuery(modal, '#wf-ops-dashboard-open-on-settings', 'opsOpenOnSettingsToggle');
        if (!toggle || toggle.dataset.wfOpsOpenOnSettingsBound === '1') return;
        toggle.dataset.wfOpsOpenOnSettingsBound = '1';
        toggle.addEventListener('change', (e) => {
            this._setOpsDashboardOpenOnSettings(e.target.checked);
            Logger.log('ops-tab: open dashboard on settings ' + (e.target.checked ? 'enabled' : 'disabled'));
        });
    },

    _attachOpsOpenDashboardButtonListener(modal) {
        const btn = this._opsQuery(modal, '#wf-ops-open-dashboard-btn', 'opsOpenDashboardBtnAttach');
        if (!btn || btn.dataset.wfOpsOpenDashboardBound === '1') return;
        btn.dataset.wfOpsOpenDashboardBound = '1';
        btn.addEventListener('click', () => {
            if (!this._getOpsTabWanted() || !this._hasOpsStoredPassword()) {
                Logger.warn('ops-tab: Open Dashboard skipped — not unlocked');
                return;
            }
            if (Context.dashboard && typeof Context.dashboard.open === 'function') {
                Context.dashboard.open();
                Logger.log('ops-tab: opened Ops dashboard from settings');
            } else {
                Logger.warn('ops-tab: Open Dashboard skipped — Context.dashboard unavailable');
            }
        });
    },

    _attachOpsSettingsListeners(modal, settingsPlugin) {
        if (!modal) return;
        this._injectOpsSpinnerStyle();
        this._attachOpsPasswordListeners(modal, settingsPlugin);
        this._attachOpsTabToggleListener(modal, settingsPlugin);
        this._attachOpsDashboardOpenOnSettingsListener(modal);
        this._attachOpsOpenDashboardButtonListener(modal);
        this._syncOpsSettingsSubmoduleVisibility(modal);
    },

    _attachOpsDashboardListeners(dashModal, dashboardPlugin) {
        if (!dashModal) return;
        this._injectOpsSpinnerStyle();
        const modal = dashModal;

        if (modal.dataset.wfOpsDashboardListenersAttached === '1') {
            this._restoreOpsTabState(modal);
            return;
        }
        modal.dataset.wfOpsDashboardListenersAttached = '1';

        const teamSearchBtn = this._opsQuery(modal, '#wf-ops-team-search-btn', 'teamSearchBtnAttach');
        const teamSearchInput = this._opsQuery(modal, '#wf-ops-team-search-input', 'teamSearchInputAttach');

        if (teamSearchBtn) {
            teamSearchBtn.addEventListener('click', () => {
                void this._handleOpsTeamSearch(modal);
            });
        }
        if (teamSearchInput) {
            teamSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    void this._handleOpsTeamSearch(modal);
                }
            });
            teamSearchInput.addEventListener('input', () => {
                this._captureOpsTabState(modal);
            });
        }

        const teamFilterInput = this._opsQuery(modal, '#wf-ops-team-filter-input', 'teamFilterInputAttach');
        if (teamFilterInput) {
            teamFilterInput.addEventListener('input', () => {
                this._filterOpsTeamSearchCards(modal);
            });
        }

        const teamFilterWrap = this._opsQuery(modal, '#wf-ops-team-filter-wrap', 'teamFilterWrapAttach');
        if (teamFilterWrap) {
            teamFilterWrap.addEventListener('click', (e) => {
                const toggleAllBtn = e.target.closest('#wf-ops-team-filter-toggle-all');
                if (toggleAllBtn) {
                    e.preventDefault();
                    const container = this._opsQuery(modal, '#wf-ops-team-filter-checkboxes', 'teamFilterCheckboxesToggleClick');
                    if (!container) return;
                    const boxes = container.querySelectorAll('input[type="checkbox"]');
                    const allChecked = boxes.length > 0 && [...boxes].every((cb) => cb.checked);
                    boxes.forEach((cb) => { cb.checked = !allChecked; });
                    this._syncOpsTeamSearchSelectedTeamsFromDom(modal);
                    this._updateOpsTeamFilterDropdownBtn(modal);
                    this._filterOpsTeamSearchCards(modal);
                    return;
                }
                const dropdownBtn = e.target.closest('#wf-ops-team-filter-dropdown-btn');
                if (dropdownBtn) {
                    e.preventDefault();
                    const panel = this._opsQuery(modal, '#wf-ops-team-filter-dropdown-panel', 'teamFilterPanelClick');
                    const isOpen = panel && panel.style.display !== 'none';
                    this._setOpsTeamFilterDropdownOpen(modal, !isOpen);
                }
            });
            teamFilterWrap.addEventListener('change', (e) => {
                if (e.target.matches('#wf-ops-team-filter-checkboxes input[type="checkbox"]')) {
                    this._syncOpsTeamSearchSelectedTeamsFromDom(modal);
                    this._updateOpsTeamFilterDropdownBtn(modal);
                    this._filterOpsTeamSearchCards(modal);
                }
            });
        }

        this._attachOpsTeamFilterDropdownOutsideListener();

        const teamSearchClearBtn = this._opsQuery(modal, '#wf-ops-team-search-clear-btn', 'teamSearchClearBtnAttach');
        if (teamSearchClearBtn) {
            teamSearchClearBtn.addEventListener('click', () => {
                this._clearOpsTeamSearchResults(modal);
            });
        }

        if (!modal.dataset.wfOpsMemberEditDelegation) {
            modal.dataset.wfOpsMemberEditDelegation = '1';
            modal.addEventListener('click', (e) => {
                this._handleOpsMemberEditClick(e, modal);
            });
        }

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
                void this.openTaskLink(null, { root: modal, newTab: false });
            });
        }

        if (openNewTabBtn) {
            openNewTabBtn.addEventListener('click', () => {
                void this.openTaskLink(null, { root: modal, newTab: true });
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

    _onDashboardTabActivated(dashModal, tabId) {
        if (!dashModal) return;
        void this._revalidateOpsStoredPassword(dashModal, null).then(() => {
            if (this._getOpsTabEnabled()) {
                void this._loadOpsSecrets(false);
            }
        });
        if (tabId === 'team-members') {
            this._restoreOpsTabState(dashModal);
        }
    }
};
