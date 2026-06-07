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
/** localStorage key for the Next.js server action hash for dashboard team add-member */
const OPS_TEAM_ADD_MEMBER_ACTION_STORAGE_KEY = 'fleet-ux:ops-team-add-member-next-action';
/** localStorage key for the Next.js router state tree for dashboard team add-member */
const OPS_TEAM_ADD_MEMBER_ROUTER_STATE_STORAGE_KEY = 'fleet-ux:ops-team-add-member-router-state';
/** localStorage key for the Next.js server action hash for dashboard task data (events) */
const OPS_TASK_DATA_ACTION_STORAGE_KEY = 'fleet-ux:ops-task-data-next-action';
/** localStorage key for the Next.js router state tree for dashboard task data */
const OPS_TASK_DATA_ROUTER_STATE_STORAGE_KEY = 'fleet-ux:ops-task-data-router-state';
const OPS_TASK_DATA_PATH_RE = /^\/dashboard\/data\/tasks\/[^/]+$/;
const OPS_EXPERT_PATH_RE = /^\/dashboard\/data\/experts\/[^/]+$/;
/** localStorage key for expert profile summary stats server action (creator + QA via body[1]) */
const OPS_EXPERT_STATS_ACTION_STORAGE_KEY = 'fleet-ux:ops-expert-stats-next-action';
const OPS_EXPERT_STATS_ROUTER_STATE_STORAGE_KEY = 'fleet-ux:ops-expert-stats-router-state';
const OPS_EXPERT_STATS_HYDRATE_CONCURRENCY = 5;
/** Default team tier when adding a member via the dashboard team server action */
const OPS_TEAM_ADD_MEMBER_DEFAULT_ROLE = 'expert';
/** When true, extension gear opens the Ops dashboard instead of the settings modal */
const OPS_DASHBOARD_OPEN_ON_SETTINGS_KEY = 'ops-dashboard-open-on-settings';
/** localStorage key for the logged-in Fleet user UUID (from __next_f payload, cookie, or JWT) */
const OPS_CURRENT_USER_ID_STORAGE_KEY = 'fleet-ux:ops-current-user-id';
/** Matches `"user":{"id":"<uuid>"` in Next.js RSC flight payloads */
const OPS_NEXT_F_USER_ID_RE = /"user"\s*:\s*\{\s*"id"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i;
const OPS_TEAM_BULK_REMOVE_URL = 'https://www.fleetai.com/api/orchestrator-private/v1/team/members/bulk-remove';
const OPS_TEAM_USER_PERMISSIONS_URL = 'https://www.fleetai.com/api/orchestrator-private/v1/team/users/permissions';
/** Fleet API prefix for teams included in dashboard / ops team search. */
const OPS_TASK_DESIGNERS_TEAM_PREFIX = 'Task Designers - ';
/** Display labels that alone do not qualify a member for the UI badge. */
const OPS_TEAM_UI_BADGE_EXCLUDED_LABELS = new Set(['Tryouts']);

function opsIsTaskDesignersTeamName(name) {
    return String(name || '').startsWith(OPS_TASK_DESIGNERS_TEAM_PREFIX);
}

function opsFormatTeamDisplayLabel(name) {
    const full = String(name || '').trim();
    if (opsIsTaskDesignersTeamName(full)) {
        return full.slice(OPS_TASK_DESIGNERS_TEAM_PREFIX.length).trim();
    }
    return full;
}

function opsNormalizeTeamCatalogEntry(team) {
    const name = String(team && team.name || '').trim();
    const id = String(team && team.id || '').trim();
    if (!id || !name) return null;
    return {
        id,
        name,
        displayName: String(team.displayName || opsFormatTeamDisplayLabel(name)).trim() || name,
        role: team.role || null,
        membershipCreatedAt: team.membershipCreatedAt || null
    };
}
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
    _version: '6.0',
    phase: 'core',
    enabledByDefault: true,

    _opsVerifierFetchState: null,
    _opsVerifierSourceText: '',
    _opsVerifierContentSearch: { query: '', index: 0, matchStarts: [] },
    _opsTeamSearchActive: null,
    _opsTeamSearchAbortController: null,
    _opsTeamSearchMemberCache: null,
    /** Legacy Fellows-search gate; team member search uses all user teams. */
    _opsFellowsSearchComplete: null,
    /** memberId → staged edit session while permissions tray is in edit mode */
    _opsMemberEditState: null,
    /** Dynamically discovered team search server action parameters (populated at runtime, never hardcoded) */
    _opsTeamSearchActionCache: { nextAction: null, routerState: null },
    /** Dynamically discovered team add-member server action (same URL as search, different action hash) */
    _opsTeamAddMemberActionCache: { nextAction: null, routerState: null },
    /** Dynamically discovered task detail server action (task events RSC payload) */
    _opsTaskDataActionCache: { nextAction: null, routerState: null },
    /** Expert profile summary stats action — body [id, false|true] for creator vs QA */
    _opsExpertStatsActionCache: { nextAction: null, routerState: null },
    /** memberId → { loading?, creator?, qa?, error? } */
    _opsExpertStatsCache: null,
    _opsExpertStatsHydrateGen: 0,
    /** Logged-in Fleet user UUID captured from __next_f, cookie, JWT, or persisted storage */
    _opsCurrentUserIdCache: '',
    _opsCurrentUserIdCaptureInstalled: false,
    /** Runtime team catalog for the logged-in user (from PostgREST team_member embed) */
    _opsUserTeamCatalogCache: null,
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
            renderGradeAssessmentsHeaderLink: () => this._renderGradeAssessmentsHeaderLink(),
            renderTaskLinkBar: () => this._renderTaskLinkBar(),
            attachSettingsListeners: (modal, settingsPlugin) => this._attachOpsSettingsListeners(modal, settingsPlugin),
            attachDashboardListeners: (dashModal, dashboardPlugin) => this._attachOpsDashboardListeners(dashModal, dashboardPlugin),
            onDashboardTabActivated: (dashModal, tabId) => this._onDashboardTabActivated(dashModal, tabId),
            onTeamMemberMsChange: (dashModal) => this._filterOpsTeamSearchCards(dashModal),
            captureState: (root) => this._captureOpsTabState(root),
            onModalClosed: () => this._onOpsModalClosed(),
            setTabWanted: (enabled) => this._setOpsTabWanted(enabled),
            clearStoredPassword: () => this._clearOpsStoredPassword(),
            resolveTaskLinkTarget: (raw) => this.resolveTaskLinkTarget(raw),
            openTaskLink: (raw, opts) => this.openTaskLink(raw, opts),
            fetchVerifierCode: (parsed) => this._fetchOpsVerifierCode(parsed || {}),
            fetchTaskUserStory: (parsed) => this._fetchOpsTaskUserStory(parsed || {}),
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
            getFleetUserJwt: (pageWindow) => this._getOpsFleetUserJwt(pageWindow),
            getTaskDataActionCache: () => this._opsTaskDataActionCache,
            fetchTaskDataRsc: (taskKey, taskUuid) => this._fetchOpsTaskDataRsc(taskKey, taskUuid),
            fetchUserTeamCatalog: (profileId, options) => this.fetchUserTeamCatalog(profileId, options),
            getUserTeamCatalog: () => this.getUserTeamCatalog(),
            getUserTaskDesignersTeamCatalog: () => this.getUserTaskDesignersTeamCatalog(),
            hydrateUserTeamCatalog: (profileId, teams) => this._hydrateUserTeamCatalog(profileId, teams),
            isTaskDesignersTeam: (name) => opsIsTaskDesignersTeamName(name),
            formatTeamDisplayLabel: (name) => opsFormatTeamDisplayLabel(name)
        };
        Logger.log('ops-tab: module registered (Context.opsTab)');
        this._loadOpsTeamSearchActionFromStorage();
        this._loadOpsTeamAddMemberActionFromStorage();
        this._loadOpsTaskDataActionFromStorage();
        this._loadOpsExpertStatsActionFromStorage();
        this._loadOpsCurrentUserIdFromStorage();
        this._opsExpertStatsCache = new Map();
        this._subscribeOpsTeamDashboardActionCapture();
        this._subscribeOpsTaskDataActionCapture();
        this._subscribeOpsExpertActionCapture();
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

    _opsTeamRef(teamId) {
        const id = String(teamId || '').trim();
        return id ? id.slice(0, 8) + '…' : '(none)';
    },

    async resolveTaskLinkTarget(raw) {
        const url = this._buildOpsTaskUrl(raw);
        if (!url) return null;
        const parsed = this._parseOpsVerifierInput(raw);
        let teamId = String(parsed.teamId || '').trim();
        let teamSource = teamId ? 'input' : 'none';
        if (!teamId && (parsed.taskKey || parsed.taskId)) {
            try {
                const resolved = await this._resolveOpsVerifierFromTask(parsed);
                teamId = String(resolved.teamId || '').trim();
                teamSource = teamId ? 'tasks-lookup' : 'tasks-lookup-empty';
            } catch (e) {
                Logger.debug('ops-tab: task link team_id lookup failed', e);
                teamSource = 'tasks-lookup-failed';
            }
        }
        const taskId = String(parsed.taskId || this._extractOpsTaskIdentifier(raw) || '').trim();
        const taskRef = taskId
            ? (taskId.length > 12 ? taskId.slice(0, 8) + '…' : taskId)
            : '(none)';
        Logger.log(
            'ops-tab: task link target resolved — task=' + taskRef +
            ' team=' + this._opsTeamRef(teamId) +
            ' source=' + teamSource +
            ' url=' + url
        );
        if (teamSource === 'tasks-lookup-empty') {
            Logger.warn('ops-tab: task link — no team_id from PostgREST; open may use wrong team context');
        }
        return { url, teamId, taskId, teamSource };
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
        const teamId = String(target.teamId || '').trim();
        const tabMode = options.newTab ? 'new tab' : 'current tab';
        let teamSwitch = 'none';
        if (!teamId) {
            teamSwitch = 'skipped-no-team';
            Logger.log('ops-tab: task link — no team_id; opening without team switch');
        } else if (!Context.dashboard || typeof Context.dashboard.switchFleetTeam !== 'function') {
            teamSwitch = 'skipped-no-dashboard';
            Logger.warn('ops-tab: task link — dashboard.switchFleetTeam unavailable; opening without team switch');
        } else {
            try {
                await Context.dashboard.switchFleetTeam(teamId);
                teamSwitch = 'switched';
                Logger.log('ops-tab: task link — team switch completed (' + this._opsTeamRef(teamId) + ')');
            } catch (e) {
                teamSwitch = 'failed';
                Logger.warn('ops-tab: team switch before task link failed', e);
            }
        }
        if (options.newTab) {
            window.open(target.url, '_blank', 'noopener,noreferrer');
        } else {
            this._getOpsPageWindow().location.href = target.url;
        }
        Logger.log(
            'ops-tab: task link opened (' + tabMode + ') — switch=' + teamSwitch +
            ' team=' + this._opsTeamRef(teamId) +
            ' source=' + (target.teamSource || 'unknown') +
            ' url=' + target.url
        );
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

    async _fetchOpsTaskUserStory(parsed) {
        const taskKey = String(parsed.taskKey || '').trim();
        const taskId = String(parsed.taskId || '').trim();
        if (!taskKey && !taskId) {
            throw new Error('taskKey or taskId required for user story lookup.');
        }

        const taskParams = { select: 'id,task_scenario_id', limit: 1 };
        if (taskKey) taskParams.key = 'eq.' + taskKey;
        else taskParams.id = 'eq.' + taskId;

        Logger.debug('ops-tab: user story task lookup', {
            taskKey: taskKey || '(none)',
            taskId: taskId ? taskId.slice(0, 8) + '…' : '(none)'
        });

        const taskRows = await this._opsPostgrestGetByKey('tasks', taskParams);
        const taskRow = Array.isArray(taskRows) ? taskRows[0] : taskRows;
        if (!taskRow || !taskRow.id) {
            return {
                taskId: '',
                taskScenarioId: null,
                scenarioTitle: null,
                userStory: null,
                humanAnnotatorInstructions: null,
                reason: 'task_not_found'
            };
        }

        const scenarioId = taskRow.task_scenario_id;
        if (scenarioId == null) {
            return {
                taskId: taskRow.id,
                taskScenarioId: null,
                scenarioTitle: null,
                userStory: null,
                humanAnnotatorInstructions: null,
                reason: 'no_scenario_id'
            };
        }

        const scenRows = await this._opsPostgrestGet('task_scenarios', {
            select: 'scenario_title,user_story,human_annotator_instructions',
            id: 'eq.' + scenarioId,
            limit: 1
        });
        const scenRow = Array.isArray(scenRows) ? scenRows[0] : scenRows;
        if (!scenRow) {
            return {
                taskId: taskRow.id,
                taskScenarioId: scenarioId,
                scenarioTitle: null,
                userStory: null,
                humanAnnotatorInstructions: null,
                reason: 'scenario_not_found'
            };
        }

        return {
            taskId: taskRow.id,
            taskScenarioId: scenarioId,
            scenarioTitle: scenRow.scenario_title != null ? String(scenRow.scenario_title) : null,
            userStory: scenRow.user_story != null ? String(scenRow.user_story) : null,
            humanAnnotatorInstructions: scenRow.human_annotator_instructions != null
                ? String(scenRow.human_annotator_instructions)
                : null,
            reason: null
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
        const fromCookie = this._getOpsCookieValue('current-team-id');
        if (fromCookie && OPS_UUID_RE.test(fromCookie)) {
            Logger.debug('ops-tab: resolved team_id from current-team-id cookie: ' + fromCookie);
            return fromCookie;
        }
        const catalog = this.getUserTeamCatalog();
        if (catalog.length > 0 && catalog[0][0]) {
            Logger.debug('ops-tab: resolved team_id from user team catalog: ' + catalog[0][0]);
            return catalog[0][0];
        }
        return '';
    },

    _hydrateUserTeamCatalog(profileId, teams) {
        const id = String(profileId || '').trim();
        if (!id || !OPS_UUID_RE.test(id) || !Array.isArray(teams)) return;
        this._opsUserTeamCatalogCache = {
            profileId: id,
            fetchedAt: new Date().toISOString(),
            teams: teams.map((t) => opsNormalizeTeamCatalogEntry(t)).filter(Boolean)
        };
    },

    async fetchUserTeamCatalog(profileId, options) {
        const force = options && options.force;
        const id = String(profileId || this._getOpsCurrentUserId() || '').trim();
        if (!id || !OPS_UUID_RE.test(id)) {
            throw new Error('Fleet user id unavailable. Open Fleet while logged in.');
        }
        const cache = this._opsUserTeamCatalogCache;
        if (!force && cache && cache.profileId === id && Array.isArray(cache.teams)) {
            return cache.teams;
        }
        const rows = await this._opsPostgrestGet('team_member', {
            select: '*,team:team(*)',
            profile_id: 'eq.' + id,
            status: 'eq.ACTIVE'
        });
        const list = Array.isArray(rows) ? rows : (rows ? [rows] : []);
        const teams = list
            .map((row) => {
                const team = row && row.team;
                if (!team || !team.id || !team.name) return null;
                return opsNormalizeTeamCatalogEntry({
                    id: team.id,
                    name: team.name,
                    role: row.role || null,
                    membershipCreatedAt: row.created_at || null
                });
            })
            .filter(Boolean)
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
        this._opsUserTeamCatalogCache = {
            profileId: id,
            fetchedAt: new Date().toISOString(),
            teams
        };
        Logger.info('ops-tab: user team catalog fetched (' + teams.length + ' teams, profile=' + id.slice(0, 8) + '…)');
        return teams;
    },

    _mapUserTeamCatalogPairs(teams, { taskDesignersOnly = false } = {}) {
        const list = Array.isArray(teams) ? teams : [];
        return list
            .filter((t) => !taskDesignersOnly || opsIsTaskDesignersTeamName(t.name))
            .map((t) => [t.id, t.displayName || opsFormatTeamDisplayLabel(t.name)])
            .filter((pair) => pair[0] && pair[1]);
    },

    getUserTeamCatalog() {
        const teams = this._opsUserTeamCatalogCache && Array.isArray(this._opsUserTeamCatalogCache.teams)
            ? this._opsUserTeamCatalogCache.teams
            : [];
        return this._mapUserTeamCatalogPairs(teams);
    },

    getUserTaskDesignersTeamCatalog() {
        const teams = this._opsUserTeamCatalogCache && Array.isArray(this._opsUserTeamCatalogCache.teams)
            ? this._opsUserTeamCatalogCache.teams
            : [];
        return this._mapUserTeamCatalogPairs(teams, { taskDesignersOnly: true });
    },

    getUserTeamByLabel(label) {
        const norm = String(label || '').trim();
        if (!norm) return '';
        const teams = this._opsUserTeamCatalogCache && this._opsUserTeamCatalogCache.teams;
        if (!Array.isArray(teams)) return '';
        const found = teams.find((t) => t.displayName === norm || t.name === norm);
        return found ? found.id : '';
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
        if (changed) {
            this._opsUserTeamCatalogCache = null;
        }
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
        return this.getUserTeamByLabel(label);
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

    _opsSetCookie(name, value) {
        try {
            const pageWindow = this._getOpsPageWindow();
            const doc = pageWindow.document;
            if (!doc) return;
            const secure = pageWindow.location && pageWindow.location.protocol === 'https:' ? '; Secure' : '';
            doc.cookie = name + '=' + encodeURIComponent(value) + '; path=/' + secure + '; SameSite=Lax';
        } catch (e) {
            Logger.warn('ops-tab: cookie write failed for ' + name, e);
        }
    },

    async _opsWithCurrentTeamCookie(teamId, fn) {
        const prevTeamId = this._getOpsCookieValue('current-team-id');
        const prevTeamRole = this._getOpsCookieValue('current-team-role');
        this._opsSetCookie('current-team-id', teamId);
        try {
            return await fn();
        } finally {
            if (prevTeamId) this._opsSetCookie('current-team-id', prevTeamId);
            if (prevTeamRole) this._opsSetCookie('current-team-role', prevTeamRole);
        }
    },

    _opsNormalizeRequestBody(body) {
        if (body == null) return '';
        if (typeof body === 'string') return body;
        if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
            return new TextDecoder().decode(body);
        }
        try {
            return String(body);
        } catch (_e) {
            return '';
        }
    },

    _opsClassifyTeamDashboardPostBody(body) {
        const text = this._opsNormalizeRequestBody(body);
        if (!text || text.charAt(0) !== '[') return null;
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (_e) {
            return null;
        }
        if (!Array.isArray(parsed)) return null;
        if (Array.isArray(parsed[0])) return 'add-member';
        if (parsed.length >= 4 && typeof parsed[0] === 'string' && OPS_UUID_RE.test(parsed[0])) return 'search';
        return null;
    },

    _opsClassifyTaskDataPostBody(body) {
        const text = this._opsNormalizeRequestBody(body);
        if (!text || text.charAt(0) !== '[') return false;
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (_e) {
            return false;
        }
        return Array.isArray(parsed)
            && parsed.length === 1
            && typeof parsed[0] === 'string'
            && OPS_UUID_RE.test(parsed[0]);
    },

    _opsClassifyExpertPostBody(body) {
        const text = this._opsNormalizeRequestBody(body);
        if (!text || text.charAt(0) !== '[') return null;
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (_e) {
            return null;
        }
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        if (typeof parsed[0] !== 'string' || !OPS_UUID_RE.test(parsed[0])) return null;
        if (parsed.length === 1) return 'breakdown';
        if (parsed.length >= 2) {
            if (parsed[1] === false) return 'stats-creator';
            if (parsed[1] === true) return 'stats-qa';
            if (typeof parsed[1] === 'number') return 'activities';
        }
        return null;
    },

    _loadOpsExpertStatsActionFromStorage() {
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (!storage) return;
            const nextAction = storage.getItem(OPS_EXPERT_STATS_ACTION_STORAGE_KEY);
            const routerState = storage.getItem(OPS_EXPERT_STATS_ROUTER_STATE_STORAGE_KEY);
            if (nextAction) {
                this._opsExpertStatsActionCache = { nextAction, routerState: routerState || '' };
                Logger.debug('ops-tab: expert stats action hydrated from localStorage (' + nextAction.slice(0, 12) + '…)');
            }
        } catch (e) {
            Logger.debug('ops-tab: expert stats action localStorage hydration failed', e);
        }
    },

    _persistOpsExpertStatsAction({ nextAction, routerState }) {
        if (!nextAction) return;
        const changed = nextAction !== this._opsExpertStatsActionCache.nextAction;
        this._opsExpertStatsActionCache = { nextAction, routerState: routerState || '' };
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (storage) {
                storage.setItem(OPS_EXPERT_STATS_ACTION_STORAGE_KEY, nextAction);
                if (routerState) {
                    storage.setItem(OPS_EXPERT_STATS_ROUTER_STATE_STORAGE_KEY, routerState);
                }
            }
        } catch (e) {
            Logger.debug('ops-tab: expert stats action persist failed', e);
        }
        if (changed) {
            Logger.log('ops-tab: expert stats action updated (' + nextAction.slice(0, 12) + '…)');
        }
    },

    _clearOpsExpertStatsActionCache() {
        this._opsExpertStatsActionCache = { nextAction: null, routerState: null };
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (storage) {
                storage.removeItem(OPS_EXPERT_STATS_ACTION_STORAGE_KEY);
                storage.removeItem(OPS_EXPERT_STATS_ROUTER_STATE_STORAGE_KEY);
            }
        } catch (e) {
            Logger.debug('ops-tab: expert stats action cache clear failed', e);
        }
        Logger.info('ops-tab: expert stats action cache cleared (will re-discover on expert profile visit)');
    },

    _opsExpertStatsActionStaleError() {
        const err = new Error('Expert stats credentials are stale or missing.');
        err.opsExpertStatsActionStale = true;
        return err;
    },

    _isOpsExpertStatsActionStaleError(err) {
        return !!(err && err.opsExpertStatsActionStale);
    },

    _subscribeOpsExpertActionCapture() {
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.debug('ops-tab: NetworkObserver unavailable; passive expert action capture skipped');
            return;
        }
        const self = this;
        Context.networkObserver.subscribe({
            id: 'ops-tab-expert-dashboard-actions',
            matches(meta) {
                return meta.method === 'POST'
                    && !!meta.urlObj
                    && OPS_EXPERT_PATH_RE.test(meta.urlObj.pathname);
            },
            onRequest(meta) {
                const nextAction = self._opsReadHeader(meta.headers, 'next-action');
                const routerState = self._opsReadHeader(meta.headers, 'next-router-state-tree');
                if (!nextAction) return;
                const kind = self._opsClassifyExpertPostBody(meta.body);
                if (kind === 'stats-creator' || kind === 'stats-qa') {
                    if (nextAction !== self._opsExpertStatsActionCache.nextAction) {
                        self._persistOpsExpertStatsAction({ nextAction, routerState: routerState || '' });
                        Logger.info('ops-tab: expert stats action captured from live traffic (' + nextAction.slice(0, 12) + '…)');
                    }
                }
            }
        });
        Logger.debug('ops-tab: expert dashboard action passive watcher registered');
    },

    async _fetchOpsExpertRsc(expertId, bodyPayload, actionCache, logLabel) {
        const id = String(expertId || '').trim();
        if (!id) throw new Error('Missing expert id for RSC fetch');
        if (!actionCache || !actionCache.nextAction) {
            throw this._opsExpertStatsActionStaleError();
        }

        const pageWindow = this._getOpsPageWindow();
        const requestFetch = pageWindow.fetch || fetch;
        const deploymentId = this._getOpsNextDeploymentId(pageWindow);
        const { nextAction, routerState } = actionCache;
        const url = OPS_FLEET_ORIGIN + '/dashboard/data/experts/' + encodeURIComponent(id);

        const headers = {
            accept: 'text/x-component',
            'content-type': 'text/plain;charset=UTF-8',
            'next-action': nextAction
        };
        if (routerState) headers['next-router-state-tree'] = routerState;
        if (deploymentId) headers['x-deployment-id'] = deploymentId;

        const body = JSON.stringify(bodyPayload);
        Logger.debug('ops-tab: ' + logLabel + ' fetch', {
            expertId: id.slice(0, 8) + '…',
            action: nextAction.slice(0, 12) + '…',
            hasDeploymentId: !!deploymentId
        });

        const res = await requestFetch.call(pageWindow, url, {
            method: 'POST',
            headers,
            body,
            credentials: 'include'
        });
        const text = await res.text().catch(() => '');

        if (res.status === 404) {
            Logger.warn('ops-tab: ' + logLabel + ' got 404 — server action stale, clearing cache');
            this._clearOpsExpertStatsActionCache();
            throw this._opsExpertStatsActionStaleError();
        }
        if (!res.ok) {
            throw new Error('Expert ' + logLabel + ' HTTP ' + res.status + ': ' + text.slice(0, 300));
        }
        return text;
    },

    async _fetchOpsExpertStats(expertId, qaMode) {
        const body = [expertId, Boolean(qaMode)];
        const text = await this._fetchOpsExpertRsc(
            expertId,
            body,
            this._opsExpertStatsActionCache,
            qaMode ? 'stats qa' : 'stats creator'
        );
        return this._parseOpsTeamSearchResponse(text);
    },

    _opsFormatDurationMinutes(seconds) {
        const s = Number(seconds);
        if (!Number.isFinite(s) || s <= 0) return '—';
        return Math.max(1, Math.round(s / 60)) + 'm';
    },

    _formatOpsExpertCreatorStatsLine(data) {
        if (!data || typeof data !== 'object') return 'Creator · —';
        const parts = ['Creator'];
        if (data.totalSubmissions != null) parts.push(data.totalSubmissions + ' submitted');
        if (data.acceptanceRate != null) parts.push(data.acceptanceRate + '% accepted');
        if (data.avgCreationTimeSeconds != null) {
            parts.push('~' + this._opsFormatDurationMinutes(data.avgCreationTimeSeconds) + ' avg');
        }
        return parts.join(' · ');
    },

    _formatOpsExpertQaStatsLine(data) {
        if (!data || typeof data !== 'object') return 'QA · —';
        const reviews = data.reviewsCompleted ?? data.totalReviews ?? data.tasksReviewed ?? data.tasksCompleted;
        const avgSec = data.avgReviewTimeSeconds ?? data.avgQaTimeSeconds ?? data.avgTimePerQaSeconds
            ?? data.avgReviewDurationSeconds;
        let accepted = data.acceptedReviews ?? data.acceptedCount ?? data.qaAccepted;
        let rejected = data.rejectedReviews ?? data.rejectedCount ?? data.qaRejected;
        if (accepted == null && rejected == null && data.acceptanceRate != null && reviews != null) {
            const rate = Number(data.acceptanceRate);
            if (Number.isFinite(rate) && reviews > 0) {
                accepted = Math.round(reviews * rate / 100);
                rejected = Math.max(0, reviews - accepted);
            }
        }
        const parts = ['QA'];
        if (reviews != null) parts.push(reviews + ' reviews');
        if (avgSec != null) parts.push('~' + this._opsFormatDurationMinutes(avgSec) + ' avg');
        if (accepted != null && rejected != null) parts.push(accepted + ':' + rejected);
        return parts.join(' · ');
    },

    _renderOpsTeamMemberStatsInnerHtml(entry) {
        if (!this._opsExpertStatsActionCache.nextAction) {
            const msg = 'Stats unavailable (open an expert profile once)';
            return '<div data-ops-member-stats-creator>' + this._opsEscapeHtml(msg) + '</div>' +
                '<div data-ops-member-stats-qa>' + this._opsEscapeHtml(msg) + '</div>';
        }
        if (!entry || entry.loading) {
            const msg = 'Loading stats…';
            return '<div data-ops-member-stats-creator>' + this._opsEscapeHtml('Creator · ' + msg) + '</div>' +
                '<div data-ops-member-stats-qa>' + this._opsEscapeHtml('QA · ' + msg) + '</div>';
        }
        if (entry.error) {
            const msg = 'Stats unavailable';
            return '<div data-ops-member-stats-creator>' + this._opsEscapeHtml('Creator · ' + msg) + '</div>' +
                '<div data-ops-member-stats-qa>' + this._opsEscapeHtml('QA · ' + msg) + '</div>';
        }
        return '<div data-ops-member-stats-creator>' + this._opsEscapeHtml(this._formatOpsExpertCreatorStatsLine(entry.creator)) + '</div>' +
            '<div data-ops-member-stats-qa>' + this._opsEscapeHtml(this._formatOpsExpertQaStatsLine(entry.qa)) + '</div>';
    },

    _renderOpsTeamMemberStatsHtml(memberId) {
        const entry = this._opsExpertStatsCache && this._opsExpertStatsCache.get(memberId);
        return '<div data-ops-member-stats style="margin-top:6px;font-size:10px;line-height:1.5;color:var(--muted-foreground,#666);">' +
            this._renderOpsTeamMemberStatsInnerHtml(entry) +
        '</div>';
    },

    _patchOpsTeamMemberStats(modal, memberId) {
        const tile = modal.querySelector('[data-ops-member-tile="' + this._opsEscapeAttr(String(memberId)) + '"]');
        const slot = tile && tile.querySelector('[data-ops-member-stats]');
        if (!slot) return;
        const entry = this._opsExpertStatsCache && this._opsExpertStatsCache.get(memberId);
        slot.innerHTML = this._renderOpsTeamMemberStatsInnerHtml(entry);
    },

    _getVisibleTeamMemberIds(modal, cache) {
        if (!cache || !cache.memberMap) return [];
        const selectedTeams = this._getOpsTeamSearchSelectedTeams();
        const selectedPermissions = this._getOpsTeamSearchSelectedPermissions();
        return [...cache.memberMap.values()]
            .filter((m) => this._opsTeamMemberMatchesTeamFilter(m, selectedTeams))
            .filter((m) => this._opsTeamMemberMatchesPermissionFilter(m, selectedPermissions))
            .map((m) => m.id)
            .filter(Boolean);
    },

    async _hydrateOpsTeamMemberStatsForVisible(modal) {
        if (!modal || !this._opsExpertStatsCache) return;
        const cache = this._opsTeamSearchMemberCache;
        if (!cache) return;

        const memberIds = this._getVisibleTeamMemberIds(modal, cache);
        const toFetch = memberIds.filter((id) => {
            const entry = this._opsExpertStatsCache.get(id);
            return !entry || (!entry.creator && !entry.qa && !entry.error && !entry.loading);
        });
        if (toFetch.length === 0) return;

        if (!this._opsExpertStatsActionCache.nextAction) {
            for (const id of toFetch) {
                this._opsExpertStatsCache.set(id, { error: 'missing-credentials' });
                this._patchOpsTeamMemberStats(modal, id);
            }
            return;
        }

        const gen = ++this._opsExpertStatsHydrateGen;
        for (const id of toFetch) {
            this._opsExpertStatsCache.set(id, { loading: true });
            this._patchOpsTeamMemberStats(modal, id);
        }

        let cursor = 0;
        const worker = async () => {
            while (cursor < toFetch.length) {
                if (gen !== this._opsExpertStatsHydrateGen) return;
                const id = toFetch[cursor++];
                try {
                    const [creator, qa] = await Promise.all([
                        this._fetchOpsExpertStats(id, false),
                        this._fetchOpsExpertStats(id, true)
                    ]);
                    if (gen !== this._opsExpertStatsHydrateGen) return;
                    this._opsExpertStatsCache.set(id, { creator, qa });
                    Logger.debug('ops-tab: expert stats loaded for ' + id.slice(0, 8) + '…');
                } catch (e) {
                    if (gen !== this._opsExpertStatsHydrateGen) return;
                    Logger.warn('ops-tab: expert stats failed for ' + id.slice(0, 8) + '…', e);
                    this._opsExpertStatsCache.set(id, { error: e.message || String(e) });
                }
                this._patchOpsTeamMemberStats(modal, id);
            }
        };

        const poolSize = Math.min(OPS_EXPERT_STATS_HYDRATE_CONCURRENCY, toFetch.length);
        await Promise.all(Array.from({ length: poolSize }, () => worker()));
    },

    _opsBuildTeamMemberFilterMeta(memberMap, selectedTeams, selectedPermissions) {
        const members = [...memberMap.values()];
        const teamLabelSet = new Set();
        const permKeySet = new Set();
        for (const m of members) {
            for (const label of m.teamLabels || []) teamLabelSet.add(label);
            for (const key of this._opsMemberPermissionKeys(m)) permKeySet.add(key);
        }

        const countForTeam = (label) => members.filter((m) =>
            (m.teamLabels || new Set()).has(label) &&
            this._opsTeamMemberMatchesPermissionFilter(m, selectedPermissions)
        ).length;

        const countForPerm = (key) => members.filter((m) =>
            this._opsTeamMemberMatchesTeamFilter(m, selectedTeams) &&
            new Set(this._opsMemberPermissionKeys(m)).has(key)
        ).length;

        const teamItems = [...teamLabelSet].sort((a, b) => a.localeCompare(b)).map((label) => ({ id: label, label }));
        const permItems = [...permKeySet].sort((a, b) => {
            const la = OPS_PERMISSION_LABEL_BY_KEY[a] || a;
            const lb = OPS_PERMISSION_LABEL_BY_KEY[b] || b;
            return la.localeCompare(lb);
        }).map((key) => ({ id: key, label: OPS_PERMISSION_LABEL_BY_KEY[key] || key }));

        const teamCounts = new Map();
        const permCounts = new Map();
        const irrelevantTeams = new Set();
        const irrelevantPerms = new Set();

        for (const item of teamItems) {
            const c = countForTeam(item.id);
            teamCounts.set(item.id, c);
            if (selectedPermissions.size > 0 && c === 0) irrelevantTeams.add(item.id);
        }
        for (const item of permItems) {
            const c = countForPerm(item.id);
            permCounts.set(item.id, c);
            if (selectedTeams.size > 0 && c === 0) irrelevantPerms.add(item.id);
        }

        return { teamItems, permItems, teamCounts, permCounts, irrelevantTeams, irrelevantPerms };
    },

    _refreshOpsTeamMemberFilterLists(modal, options) {
        const dash = Context.dashboard;
        if (!dash || typeof dash.renderTeamMemberFilterLists !== 'function') return;
        const opts = options || {};
        if (opts.loading) {
            dash.renderTeamMemberFilterLists({ loading: true });
            return;
        }
        const memberMap = opts.memberMap || (this._opsTeamSearchMemberCache && this._opsTeamSearchMemberCache.memberMap);
        if (!memberMap || memberMap.size === 0) {
            dash.renderTeamMemberFilterLists({ loading: false, teamItems: [], permItems: [] });
            return;
        }
        const selectedTeams = this._getOpsTeamSearchSelectedTeams();
        const selectedPermissions = this._getOpsTeamSearchSelectedPermissions();
        const meta = this._opsBuildTeamMemberFilterMeta(memberMap, selectedTeams, selectedPermissions);
        dash.renderTeamMemberFilterLists({
            loading: false,
            teamItems: meta.teamItems,
            permItems: meta.permItems,
            teamCounts: meta.teamCounts,
            permCounts: meta.permCounts,
            irrelevantTeams: meta.irrelevantTeams,
            irrelevantPerms: meta.irrelevantPerms,
            prevTeams: selectedTeams,
            prevPerms: selectedPermissions
        });
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

    _loadOpsTeamAddMemberActionFromStorage() {
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (!storage) return;
            const nextAction = storage.getItem(OPS_TEAM_ADD_MEMBER_ACTION_STORAGE_KEY);
            const routerState = storage.getItem(OPS_TEAM_ADD_MEMBER_ROUTER_STATE_STORAGE_KEY);
            if (nextAction) {
                this._opsTeamAddMemberActionCache = { nextAction, routerState: routerState || '' };
                Logger.debug('ops-tab: team add-member action hydrated from localStorage (' + nextAction.slice(0, 12) + '…)');
            }
        } catch (e) {
            Logger.debug('ops-tab: team add-member action localStorage hydration failed', e);
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

    _persistOpsTeamAddMemberAction({ nextAction, routerState }) {
        if (!nextAction) return;
        const changed = nextAction !== this._opsTeamAddMemberActionCache.nextAction;
        this._opsTeamAddMemberActionCache = { nextAction, routerState: routerState || '' };
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (storage) {
                storage.setItem(OPS_TEAM_ADD_MEMBER_ACTION_STORAGE_KEY, nextAction);
                if (routerState) {
                    storage.setItem(OPS_TEAM_ADD_MEMBER_ROUTER_STATE_STORAGE_KEY, routerState);
                }
            }
        } catch (e) {
            Logger.debug('ops-tab: team add-member action persist failed', e);
        }
        if (changed) {
            Logger.log('ops-tab: team add-member action updated (' + nextAction.slice(0, 12) + '…)');
        }
    },

    _clearOpsTeamAddMemberActionCache() {
        this._opsTeamAddMemberActionCache = { nextAction: null, routerState: null };
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (storage) {
                storage.removeItem(OPS_TEAM_ADD_MEMBER_ACTION_STORAGE_KEY);
                storage.removeItem(OPS_TEAM_ADD_MEMBER_ROUTER_STATE_STORAGE_KEY);
            }
        } catch (e) {
            Logger.debug('ops-tab: team add-member action cache clear failed', e);
        }
        Logger.info('ops-tab: team add-member action cache cleared (will re-discover on next add)');
    },

    _loadOpsTaskDataActionFromStorage() {
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (!storage) return;
            const nextAction = storage.getItem(OPS_TASK_DATA_ACTION_STORAGE_KEY);
            const routerState = storage.getItem(OPS_TASK_DATA_ROUTER_STATE_STORAGE_KEY);
            if (nextAction) {
                this._opsTaskDataActionCache = { nextAction, routerState: routerState || '' };
                Logger.debug('ops-tab: task data action hydrated from localStorage (' + nextAction.slice(0, 12) + '…)');
            }
        } catch (e) {
            Logger.debug('ops-tab: task data action localStorage hydration failed', e);
        }
    },

    _persistOpsTaskDataAction({ nextAction, routerState }) {
        if (!nextAction) return;
        const changed = nextAction !== this._opsTaskDataActionCache.nextAction;
        this._opsTaskDataActionCache = { nextAction, routerState: routerState || '' };
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (storage) {
                storage.setItem(OPS_TASK_DATA_ACTION_STORAGE_KEY, nextAction);
                if (routerState) {
                    storage.setItem(OPS_TASK_DATA_ROUTER_STATE_STORAGE_KEY, routerState);
                }
            }
        } catch (e) {
            Logger.debug('ops-tab: task data action persist failed', e);
        }
        if (changed) {
            Logger.log('ops-tab: task data action updated (' + nextAction.slice(0, 12) + '…)');
        }
    },

    _clearOpsTaskDataActionCache() {
        this._opsTaskDataActionCache = { nextAction: null, routerState: null };
        try {
            const storage = this._getOpsPageWindow().localStorage;
            if (storage) {
                storage.removeItem(OPS_TASK_DATA_ACTION_STORAGE_KEY);
                storage.removeItem(OPS_TASK_DATA_ROUTER_STATE_STORAGE_KEY);
            }
        } catch (e) {
            Logger.debug('ops-tab: task data action cache clear failed', e);
        }
        Logger.info('ops-tab: task data action cache cleared (will re-discover on next task page load)');
    },

    async _fetchOpsTaskDataRsc(taskKey, taskUuid) {
        const key = String(taskKey || '').trim();
        const uuid = String(taskUuid || '').trim();
        if (!key || !uuid) return '';
        if (!this._opsTaskDataActionCache.nextAction) {
            Logger.debug('ops-tab: task data RSC skipped — no captured next-action for ' + key);
            return '';
        }

        const pageWindow = this._getOpsPageWindow();
        const requestFetch = pageWindow.fetch || fetch;
        const deploymentId = this._getOpsNextDeploymentId(pageWindow);
        const { nextAction, routerState } = this._opsTaskDataActionCache;
        const url = OPS_FLEET_ORIGIN + '/dashboard/data/tasks/' + encodeURIComponent(key);

        const headers = {
            accept: 'text/x-component',
            'content-type': 'text/plain;charset=UTF-8',
            'next-action': nextAction
        };
        if (routerState) headers['next-router-state-tree'] = routerState;
        if (deploymentId) headers['x-deployment-id'] = deploymentId;

        const body = JSON.stringify([uuid]);
        Logger.debug('ops-tab: task data RSC fetch', {
            taskKey: key.slice(0, 24) + (key.length > 24 ? '…' : ''),
            taskUuid: uuid.slice(0, 8) + '…',
            action: nextAction.slice(0, 12) + '…',
            hasDeploymentId: !!deploymentId
        });

        const res = await requestFetch.call(pageWindow, url, {
            method: 'POST',
            headers,
            body,
            credentials: 'include'
        });
        const text = await res.text().catch(() => '');

        if (res.status === 404) {
            Logger.warn('ops-tab: task data RSC got 404 — server action stale, clearing cache');
            this._clearOpsTaskDataActionCache();
            return '';
        }
        if (!res.ok) {
            Logger.warn('ops-tab: task data RSC HTTP ' + res.status + ': ' + text.slice(0, 200));
            return '';
        }
        return text;
    },

    _subscribeOpsTeamDashboardActionCapture() {
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.debug('ops-tab: NetworkObserver unavailable; passive team action capture skipped');
            return;
        }
        const self = this;
        Context.networkObserver.subscribe({
            id: 'ops-tab-team-dashboard-actions',
            matches(meta) {
                return meta.method === 'POST'
                    && !!meta.urlObj
                    && meta.urlObj.pathname === '/dashboard/team';
            },
            onRequest(meta) {
                const nextAction = self._opsReadHeader(meta.headers, 'next-action');
                const routerState = self._opsReadHeader(meta.headers, 'next-router-state-tree');
                if (!nextAction) return;

                const kind = self._opsClassifyTeamDashboardPostBody(meta.body);
                if (kind === 'search') {
                    if (nextAction !== self._opsTeamSearchActionCache.nextAction) {
                        self._persistOpsTeamSearchAction({ nextAction, routerState: routerState || '' });
                        Logger.info('ops-tab: team search action captured from live traffic (' + nextAction.slice(0, 12) + '…)');
                    }
                } else if (kind === 'add-member') {
                    if (nextAction !== self._opsTeamAddMemberActionCache.nextAction) {
                        self._persistOpsTeamAddMemberAction({ nextAction, routerState: routerState || '' });
                        Logger.info('ops-tab: team add-member action captured from live traffic (' + nextAction.slice(0, 12) + '…)');
                    }
                }
            }
        });
        Logger.debug('ops-tab: team dashboard action passive watcher registered');
    },

    _subscribeOpsTaskDataActionCapture() {
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.debug('ops-tab: NetworkObserver unavailable; passive task data action capture skipped');
            return;
        }
        const self = this;
        Context.networkObserver.subscribe({
            id: 'ops-tab-task-data-actions',
            matches(meta) {
                return meta.method === 'POST'
                    && !!meta.urlObj
                    && OPS_TASK_DATA_PATH_RE.test(meta.urlObj.pathname);
            },
            onRequest(meta) {
                const nextAction = self._opsReadHeader(meta.headers, 'next-action');
                const routerState = self._opsReadHeader(meta.headers, 'next-router-state-tree');
                if (!nextAction) return;
                if (!self._opsClassifyTaskDataPostBody(meta.body)) return;
                if (nextAction !== self._opsTaskDataActionCache.nextAction) {
                    self._persistOpsTaskDataAction({ nextAction, routerState: routerState || '' });
                    Logger.info('ops-tab: task data action captured from live traffic (' + nextAction.slice(0, 12) + '…)');
                }
            }
        });
        Logger.debug('ops-tab: task data action passive watcher registered');
    },

    _opsTeamSearchActionStaleError() {
        const err = new Error('Team search credentials are stale or missing.');
        err.opsTeamSearchActionStale = true;
        return err;
    },

    _opsTeamAddMemberActionStaleError() {
        const err = new Error('Team add-member credentials are stale or missing.');
        err.opsTeamAddMemberActionStale = true;
        return err;
    },

    _isOpsTeamSearchActionStaleError(err) {
        return !!(err && err.opsTeamSearchActionStale);
    },

    _isOpsTeamAddMemberActionStaleError(err) {
        return !!(err && err.opsTeamAddMemberActionStale);
    },

    _getOpsInvokerPermissionKeys() {
        const userId = this._getOpsCurrentUserId();
        const cache = this._opsTeamSearchMemberCache;
        if (!userId || !cache || !cache.memberMap) return [];
        const invoker = cache.memberMap.get(userId);
        return invoker ? this._opsMemberPermissionKeys(invoker) : [];
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
            'Open the Team page, run a member search or add a member once, then return here and try again.',
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
        const placeholder = this._opsQuery(modal, '#wf-ops-team-search-status-placeholder', 'teamSearchStalePlaceholder');
        if (filterWrap) filterWrap.style.display = 'none';
        if (placeholder) placeholder.style.display = 'none';
        if (outputWrap) {
            outputWrap.style.display = 'block';
            let cards = this._opsQuery(modal, '#wf-ops-team-search-cards', 'teamSearchStaleCards');
            if (!cards) {
                cards = document.createElement('div');
                cards.id = 'wf-ops-team-search-cards';
                outputWrap.innerHTML = '';
                outputWrap.appendChild(cards);
            }
            cards.innerHTML = this._renderOpsTeamSearchActionRefreshBannerHtml();
            const goNow = cards.querySelector('#wf-ops-team-search-go-now');
            if (goNow) {
                goNow.addEventListener('click', () => {
                    Logger.log('ops-tab: team search refresh link opened (new tab)');
                });
            }
        }
        this._setOpsTeamSearchStatus(modal, '', false, false, false);
        Logger.info('ops-tab: team search refresh banner shown — user must visit /dashboard/team');
    },

    async _fetchOpsTeamSearchPage(teamId, userId, query, offset, signal) {
        if (!teamId) throw new Error('No team ID available for search.');
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
            credentials: 'include',
            signal: signal || undefined
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

    async _opsPostTeamDashboardAction(bodyPayload, actionCache, actionKind, logLabel) {
        if (!actionCache || !actionCache.nextAction) {
            throw actionKind === 'search'
                ? this._opsTeamSearchActionStaleError()
                : this._opsTeamAddMemberActionStaleError();
        }

        const pageWindow = this._getOpsPageWindow();
        const requestFetch = pageWindow.fetch || fetch;
        const deploymentId = this._getOpsNextDeploymentId(pageWindow);
        const { nextAction, routerState } = actionCache;

        const headers = {
            accept: 'text/x-component',
            'content-type': 'text/plain;charset=UTF-8',
            'next-action': nextAction
        };
        if (routerState) headers['next-router-state-tree'] = routerState;
        if (deploymentId) headers['x-deployment-id'] = deploymentId;

        const body = JSON.stringify(bodyPayload);
        Logger.debug('ops-tab: ' + logLabel + ' fetch', {
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
            Logger.warn('ops-tab: ' + logLabel + ' got 404 — server action stale, clearing cache');
            if (actionKind === 'search') {
                this._clearOpsTeamSearchActionCache();
                throw this._opsTeamSearchActionStaleError();
            }
            this._clearOpsTeamAddMemberActionCache();
            throw this._opsTeamAddMemberActionStaleError();
        }

        if (!res.ok) {
            throw new Error('Team ' + logLabel + ' HTTP ' + res.status + ': ' + text.slice(0, 300));
        }
        return text;
    },

    async _opsAddMemberToTeam(teamId, email, permissionKeys) {
        if (!teamId || !email) throw new Error('Missing team or email for add-member');
        const perms = Array.isArray(permissionKeys) ? permissionKeys.filter(Boolean) : [];
        if (!perms.length) {
            throw new Error('At least one permission is required to add a team member');
        }

        const role = OPS_TEAM_ADD_MEMBER_DEFAULT_ROLE;
        const bodyPayload = [[email], role, perms];

        await this._opsWithCurrentTeamCookie(teamId, () =>
            this._opsPostTeamDashboardAction(
                bodyPayload,
                this._opsTeamAddMemberActionCache,
                'add-member',
                'add-member'
            )
        );
        Logger.debug('ops-tab: added ' + email + ' to team ' + teamId.slice(0, 8) + '… (' + perms.length + ' permissions)');
    },

    _abortOpsTeamSearchInFlight(reason) {
        if (this._opsTeamSearchAbortController) {
            this._opsTeamSearchAbortController.abort();
            this._opsTeamSearchAbortController = null;
            Logger.debug('ops-tab: team search in-flight requests aborted — ' + reason);
        }
    },

    _isOpsTeamSearchAbortError(err) {
        return !!(err && (err.name === 'AbortError' || err.code === 20));
    },

    async _fetchOpsTeamSearchAllMembers(teamId, userId, query, sessionId, signal) {
        const allMembers = [];
        const seenIds = new Set();
        let offset = 0;
        let hasMore = true;
        let pageCount = 0;
        const maxPages = 200;

        while (hasMore && pageCount < maxPages) {
            if (sessionId != null && this._opsTeamSearchActive !== sessionId) {
                Logger.debug('ops-tab: team search pagination stopped — session superseded');
                break;
            }
            if (signal && signal.aborted) break;

            pageCount++;
            let raw;
            try {
                raw = await this._fetchOpsTeamSearchPage(teamId, userId, query, offset, signal);
            } catch (e) {
                if (this._isOpsTeamSearchAbortError(e)) {
                    Logger.debug('ops-tab: team search page fetch aborted');
                    break;
                }
                throw e;
            }

            if (sessionId != null && this._opsTeamSearchActive !== sessionId) {
                Logger.debug('ops-tab: team search pagination stopped after fetch — session superseded');
                break;
            }

            const parsed = this._parseOpsTeamSearchResponse(raw);
            if (!parsed || !Array.isArray(parsed.members)) break;

            const pageMembers = parsed.members;
            if (pageMembers.length === 0) break;

            let newCount = 0;
            for (const member of pageMembers) {
                if (member && member.id && !seenIds.has(member.id)) {
                    seenIds.add(member.id);
                    allMembers.push(member);
                    newCount++;
                }
            }

            if (newCount === 0) {
                Logger.debug('ops-tab: team search pagination stopped — page had no new members');
                break;
            }

            const fullPage = pageMembers.length >= OPS_TEAM_SEARCH_PAGE_LIMIT;
            hasMore = parsed.hasMore === true && fullPage;
            offset += OPS_TEAM_SEARCH_PAGE_LIMIT;

            if (hasMore) {
                Logger.debug('ops-tab: team search page ' + pageCount + ' fetched ' + pageMembers.length +
                    ' members (' + newCount + ' new, total ' + allMembers.length + ', hasMore)');
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
            '.wf-ops-edit-item-btn:disabled{cursor:default!important;}',
            '#wf-dash-modal .wf-ops-verifier-hit{background:color-mix(in srgb,#facc15 40%,transparent);color:inherit;border-radius:2px;padding:0 1px;}',
            '#wf-dash-modal .wf-ops-verifier-hit-active{background:#facc15!important;outline:1px solid #ca8a04;}',
            '#wf-dash-modal a.wf-dash-header-btn.wf-ops-grade-header-link{text-decoration:none!important;}'
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
        const placeholder = this._opsQuery(modal, '#wf-ops-team-search-status-placeholder', 'teamSearchStatusPlaceholder');
        if (!status) return;
        if (!message) {
            if (row) row.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'none';
            if (placeholder) placeholder.style.display = '';
            return;
        }
        if (row) row.style.display = 'flex';
        if (placeholder) placeholder.style.display = 'none';
        status.style.color = isError ? '#dc2626' : 'var(--muted-foreground, #666)';
        if (isHtml) { status.innerHTML = message; } else { status.textContent = message; }
        if (clearBtn) clearBtn.style.display = showClear ? 'inline-block' : 'none';
    },

    _clearOpsTeamSearchResults(modal) {
        this._abortOpsTeamSearchInFlight('results cleared');
        this._opsTeamSearchActive = null;
        this._opsTeamSearchMemberCache = null;
        this._opsFellowsSearchComplete = null;
        this._opsExpertStatsHydrateGen++;
        if (this._opsExpertStatsCache) this._opsExpertStatsCache.clear();
        this._clearOpsMemberEditState();
        this._setOpsTeamSearchStatus(modal, '', false, false, false);

        const filterWrap = this._opsQuery(modal, '#wf-ops-team-filter-wrap', 'teamFilterWrapClear');
        const outputWrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchOutputClear');
        const btn = this._opsQuery(modal, '#wf-ops-team-search-btn', 'teamSearchBtnClear');

        if (filterWrap) filterWrap.style.display = 'none';
        if (Context.dashboard && typeof Context.dashboard.resetTeamMemberMsDropdowns === 'function') {
            Context.dashboard.resetTeamMemberMsDropdowns();
        }
        if (outputWrap) {
            outputWrap.style.display = 'none';
            const cards = this._opsQuery(modal, '#wf-ops-team-search-cards', 'teamSearchCardsClear');
            if (cards) cards.innerHTML = '';
        }
        const placeholder = this._opsQuery(modal, '#wf-ops-team-search-status-placeholder', 'teamSearchPlaceholderClear');
        if (placeholder) placeholder.style.display = '';
        if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
        this._captureOpsTabState(modal);
        Logger.log('ops-tab: team search results cleared');
    },

    _onOpsModalClosed() {
        this._abortOpsTeamSearchInFlight('modal closed');
        this._opsTeamSearchActive = null;
        this._clearOpsMemberEditState();
    },

    _getOpsTeamSearchSelectedTeams() {
        const dash = Context.dashboard;
        if (dash && typeof dash.selectedMsValues === 'function') {
            return new Set(dash.selectedMsValues('team-members-teams'));
        }
        return new Set();
    },

    _getOpsTeamSearchSelectedPermissions() {
        const dash = Context.dashboard;
        if (dash && typeof dash.selectedMsValues === 'function') {
            return new Set(dash.selectedMsValues('team-members-permissions'));
        }
        return new Set();
    },

    _opsTeamMemberMatchesPermissionFilter(member, selectedPermissions) {
        if (!selectedPermissions || selectedPermissions.size === 0) return true;
        const memberPerms = new Set(this._opsMemberPermissionKeys(member));
        for (const key of selectedPermissions) {
            if (memberPerms.has(key)) return true;
        }
        return false;
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

    _opsMemberQualifiesForUiBadge(member) {
        const teamLabels = member.teamLabels;
        if (!teamLabels || teamLabels.size === 0) return false;
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
        if (!session || !label) return;
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

        const teamAdds = [...session.stagedTeams].filter((label) => !session.baselineTeams.has(label));
        const teamRemovals = [...session.baselineTeams].filter((label) => !session.stagedTeams.has(label));
        const permAdds = [...session.stagedPerms].filter((key) => !session.baselinePerms.has(key));
        const permRemovals = [...session.baselinePerms].filter((key) => !session.stagedPerms.has(key));

        if (teamAdds.length && !this._opsTeamAddMemberActionCache.nextAction) {
            this._setOpsTeamSearchStatus(modal,
                'Cannot add to team: add-member credentials missing. Open ' +
                '<a href="' + this._opsEscapeAttr(OPS_TEAM_SEARCH_URL) + '" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">' +
                'Fleet /dashboard/team</a> and add a member once, then retry.',
                true, true, true);
            return;
        }

        const addMemberPerms = [...session.stagedPerms];
        if (!addMemberPerms.length) {
            addMemberPerms.push(...this._getOpsInvokerPermissionKeys());
        }

        session.applying = true;
        this._updateOpsMemberTileDom(modal, memberId, true);

        try {
            for (const label of teamAdds) {
                const teamId = this._getOpsTeamUuidByLabel(label);
                if (!teamId) throw new Error('No team UUID for "' + label + '"');
                await this._opsAddMemberToTeam(teamId, session.email, addMemberPerms);
            }
            for (const label of teamRemovals) {
                const teamId = this._getOpsTeamUuidByLabel(label);
                if (!teamId) throw new Error('No team UUID for "' + label + '"');
                await this._opsRemoveMemberFromTeam(teamId, session.email);
            }
            const permAddsToApply = teamAdds.length
                ? permAdds.filter((key) => !addMemberPerms.includes(key))
                : permAdds;
            for (const permKey of permAddsToApply) {
                await this._opsModifyMemberPermission(memberId, permKey, 'add');
            }
            for (const permKey of permRemovals) {
                await this._opsModifyMemberPermission(memberId, permKey, 'remove');
            }

            member.teamLabels = this._opsCloneStringSet(session.stagedTeams);
            member.permissions = [...session.stagedPerms];
            this._cancelOpsMemberEdit(memberId);

            Logger.log('ops-tab: member edit applied for ' + session.email +
                ' (teams +' + teamAdds.length + ' -' + teamRemovals.length +
                ', perms +' + permAddsToApply.length + ' -' + permRemovals.length + ')');

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
            return '<span class="wf-ops-member-edit-actions" style="gap:6px;flex-shrink:0;margin-left:8px;align-items:center;">' +
                '<button type="button" class="wf-ops-confirm-btn" data-ops-member-id="' + attrId + '" data-ops-action="confirm"' +
                    (confirmDisabled ? ' disabled' : '') + '>Confirm</button>' +
                '<button type="button" class="wf-ops-cancel-btn" data-ops-member-id="' + attrId + '" data-ops-action="cancel"' +
                    (session.applying ? ' disabled' : '') + '>Cancel</button>' +
                '</span>';
        }
        return '<span class="wf-ops-member-edit-actions" style="flex-shrink:0;margin-left:8px;align-items:center;">' +
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
                const changed = inStaged;
                const stagedClass = changed ? ' wf-ops-staged-add' : '';
                const icon = changed ? '✅ ' : '<span style="opacity:0.35;">—</span> ';
                const color = changed ? 'var(--foreground,#333)' : 'var(--muted-foreground,#999)';
                return '<button type="button" class="wf-ops-edit-item-btn' + stagedClass + '" data-ops-action="toggle-team" data-ops-member-id="' +
                    attrId + '" data-ops-team-label="' + attrLabel + '" style="font-size:11px;color:' + color + ';">' +
                    icon + this._opsEscapeHtml(label) + '</button>';
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

    _renderOpsTeamMemberPersonChipsHtml(member) {
        const dash = Context.dashboard;
        const memberId = String(member.id || '').trim();
        if (dash && typeof dash.personChipsHtml === 'function') {
            let html = dash.personChipsHtml(member.full_name, member.email, member.id, 'Open profile in Fleet');
            if (memberId && typeof dash.copyChipHtml === 'function') {
                html = html.replace(/(<a href)/, dash.copyChipHtml(memberId) + '$1');
            }
            return html;
        }
        const name = this._opsEscapeHtml(member.full_name || 'Unknown');
        const email = this._opsEscapeHtml(member.email || '');
        const profileUrl = 'https://www.fleetai.com/dashboard/data/experts/' + encodeURIComponent(memberId);
        const idChip = memberId && dash && typeof dash.copyChipHtml === 'function'
            ? dash.copyChipHtml(memberId)
            : (memberId ? '<span style="font-size:11px;color:var(--muted-foreground,#666);">' + this._opsEscapeHtml(memberId) + '</span>' : '');
        return '<span style="display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;max-width:100%;min-width:0;">' +
            '<span style="font-size:13px;font-weight:600;color:var(--foreground,#333);">' + name + '</span>' +
            (email ? '<span style="font-size:11px;color:var(--muted-foreground,#666);">' + email + '</span>' : '') +
            idChip +
            this._opsProfileLinkHtml(profileUrl, 'Open profile in Fleet') +
        '</span>';
    },

    _renderOpsTeamMemberTileHtml(member, allTeams, isOpen) {
        const memberId = member.id || '';
        const personChipsHtml = this._renderOpsTeamMemberPersonChipsHtml(member);
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
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
                '<div style="min-width:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1;">' +
                    uiBadgeHtml +
                    personChipsHtml +
                '</div>' +
                this._opsSearchWorkerOutputBtnHtml(memberId) +
            '</div>' +
            this._renderOpsTeamMemberStatsHtml(memberId) +
            '<details class="wf-ops-member-details" data-member-id="' + this._opsEscapeAttr(memberId) + '" style="margin-top:8px;"' + openAttr + '>' +
                '<summary style="font-size:11px;cursor:pointer;color:var(--muted-foreground,#666);list-style:none;user-select:none;display:flex;align-items:center;gap:8px;">' +
                    '<span style="min-width:0;flex:1;">▾ ' + this._opsEscapeHtml(summaryLabel) + '</span>' +
                    this._renderOpsMemberEditActionsHtml(memberId, session) +
                '</summary>' +
                '<div style="margin-top:6px;padding:6px 8px;background:var(--background,white);border:1px solid var(--border,#e5e5e5);border-radius:4px;' +
                    'display:grid;grid-template-columns:1fr 1fr;gap:0 16px;">' +
                    '<div>' + colHeader('Teams') + teamsColHtml + '</div>' +
                    '<div>' + colHeader('Permissions') + permsColHtml + '</div>' +
                '</div>' +
            '</details>' +
        '</div>';
    },

    _filterOpsTeamSearchCards(modal) {
        const cache = this._opsTeamSearchMemberCache;
        if (!cache) return;
        this._refreshOpsTeamMemberFilterLists(modal);
        this._renderOpsTeamSearchCards(modal, cache.memberMap, cache.allTeams, 0);
        void this._hydrateOpsTeamMemberStatsForVisible(modal);
    },

    _renderOpsTeamSearchCards(modal, memberMap, allTeams, pendingCount, openMemberIds) {
        const wrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchCards');
        const cards = this._opsQuery(modal, '#wf-ops-team-search-cards', 'teamSearchCardsInner');
        if (!wrap || !cards) return;

        const openIds = openMemberIds instanceof Set
            ? openMemberIds
            : this._captureOpsOpenMemberDetails(modal);

        let members = [...memberMap.values()];

        const selectedTeams = this._getOpsTeamSearchSelectedTeams();
        const selectedPermissions = this._getOpsTeamSearchSelectedPermissions();
        if (selectedTeams.size > 0) {
            members = members.filter((m) => this._opsTeamMemberMatchesTeamFilter(m, selectedTeams));
        }
        if (selectedPermissions.size > 0) {
            members = members.filter((m) => this._opsTeamMemberMatchesPermissionFilter(m, selectedPermissions));
        }

        if (members.length === 0) {
            if (pendingCount > 0) {
                wrap.style.display = 'none';
            } else {
                wrap.style.display = 'block';
                let msg = 'No members found.';
                const hasFilters = selectedTeams.size > 0 || selectedPermissions.size > 0;
                if (hasFilters) msg = 'No results match filters.';
                cards.innerHTML = '<div style="text-align:center;padding:12px 0;font-size:12px;color:var(--muted-foreground,#666);">' + this._opsEscapeHtml(msg) + '</div>';
            }
            return;
        }

        members.sort((a, b) => {
            const diff = (b.teamLabels ? b.teamLabels.size : 0) - (a.teamLabels ? a.teamLabels.size : 0);
            return diff !== 0 ? diff : (a.full_name || '').localeCompare(b.full_name || '');
        });

        wrap.style.display = 'block';
        cards.innerHTML = members.map((m) =>
            this._renderOpsTeamMemberTileHtml(m, allTeams, openIds.has(m.id))).join('');

        if (pendingCount === 0) {
            void this._hydrateOpsTeamMemberStatsForVisible(modal);
        }
    },

    async _handleOpsTeamSearch(modal) {
        const input = this._opsQuery(modal, '#wf-ops-team-search-input', 'teamSearchInput');
        const btn = this._opsQuery(modal, '#wf-ops-team-search-btn', 'teamSearchBtn');
        const query = input ? input.value.trim() : '';

        const userId = this._getOpsCurrentUserId();
        if (!userId) {
            this._setOpsTeamSearchStatus(modal, 'No user ID found. Open Fleet while logged in and try again.', true);
            return;
        }

        let allTeams = this.getUserTeamCatalog();
        if (!allTeams.length) {
            try {
                await this.fetchUserTeamCatalog(userId);
                allTeams = this.getUserTeamCatalog();
            } catch (e) {
                Logger.warn('ops-tab: team search — failed to load user team catalog', e);
                this._setOpsTeamSearchStatus(modal, 'Failed to load your teams: ' + (e.message || String(e)), true);
                return;
            }
        }
        if (!allTeams.length) {
            this._setOpsTeamSearchStatus(modal, 'No teams found for your account.', true);
            return;
        }

        if (!this._opsTeamSearchActionCache.nextAction) {
            this._showOpsTeamSearchActionRefreshBanner(modal);
            return;
        }

        this._injectOpsSpinnerStyle();

        this._abortOpsTeamSearchInFlight('new search started');
        const abortController = new AbortController();
        this._opsTeamSearchAbortController = abortController;

        const sessionId = Date.now();
        this._opsTeamSearchActive = sessionId;
        this._opsTeamSearchMemberCache = null;
        this._clearOpsMemberEditState();

        if (btn) { btn.disabled = true; btn.textContent = 'Searching...'; }

        // Show filter panel; retain ms checkbox selections
        const filterWrap = this._opsQuery(modal, '#wf-ops-team-filter-wrap', 'teamFilterWrapShow');
        if (filterWrap) filterWrap.style.display = 'flex';
        this._refreshOpsTeamMemberFilterLists(modal, { loading: true });

        const memberMap = new Map();
        let pendingCount = allTeams.length;
        let doneCount = 0;
        let staleActionDetected = false;

        this._opsFellowsSearchComplete = true;

        const spinnerHtml = '<span style="display:inline-block;width:10px;height:10px;border:2px solid rgba(79,70,229,0.2);border-top-color:var(--brand,#4f46e5);border-radius:50%;animation:wf-ops-spin 0.7s linear infinite;vertical-align:middle;margin-right:5px;"></span>';
        this._setOpsTeamSearchStatus(modal, spinnerHtml + 'Searching ' + allTeams.length + ' teams…', false, true, false);

        const finishTeamSearch = (_teamLabel) => {
            pendingCount--;
            doneCount++;
            if (this._opsTeamSearchActive !== sessionId) return;
            this._renderOpsTeamSearchCards(modal, memberMap, allTeams, pendingCount);
            if (memberMap.size > 0) {
                this._refreshOpsTeamMemberFilterLists(modal, { memberMap });
            }
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
                const members = await this._fetchOpsTeamSearchAllMembers(
                    teamId, userId, query, sessionId, abortController.signal);
                if (this._opsTeamSearchActive !== sessionId) return;
                if (staleActionDetected) return;
                this._mergeOpsTeamSearchMembers(memberMap, members, teamLabel);
                Logger.debug('ops-tab: team search got ' + members.length + ' members from ' + teamLabel);
            } catch (e) {
                if (this._isOpsTeamSearchAbortError(e)) return;
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
            this._opsTeamSearchAbortController = null;
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

    _syncVerifierStatusRow(modal) {
        const row = this._opsQuery(modal, '#wf-ops-verifier-status-row', 'verifierStatusRow');
        const status = this._opsQuery(modal, '#wf-ops-verifier-status', 'verifierStatus');
        if (!row) return;
        const hasStatus = Boolean(status && (status.textContent || '').trim());
        row.style.display = hasStatus ? 'block' : 'none';
    },

    _setOpsVerifierStatus(modal, message, isError) {
        const status = this._opsQuery(modal, '#wf-ops-verifier-status', 'verifierStatus');
        if (!status) return;
        status.textContent = message || '';
        status.style.color = isError ? '#dc2626' : 'var(--muted-foreground, #666)';
        this._syncVerifierStatusRow(modal);
    },

    _findVerifierContentMatchStarts(text, query) {
        const starts = [];
        const haystack = String(text || '');
        const needle = String(query || '');
        if (!needle || !haystack) return starts;
        const hl = haystack.toLowerCase();
        const nl = needle.toLowerCase();
        let pos = 0;
        while (pos < hl.length) {
            const idx = hl.indexOf(nl, pos);
            if (idx === -1) break;
            starts.push(idx);
            pos = idx + Math.max(nl.length, 1);
        }
        return starts;
    },

    _buildVerifierContentSearchHtml(text, query, activeIndex) {
        const source = String(text || '');
        const needle = String(query || '');
        const starts = this._findVerifierContentMatchStarts(source, needle);
        if (!needle) return { html: '', matchCount: 0, activeIndex: 0, matchStarts: [] };
        const safeActive = starts.length === 0 ? 0 : Math.max(0, Math.min(activeIndex, starts.length - 1));
        let html = '';
        let last = 0;
        starts.forEach((start, idx) => {
            html += this._opsEscapeHtml(source.slice(last, start));
            const activeClass = idx === safeActive ? ' wf-ops-verifier-hit-active' : '';
            html += '<mark class="wf-ops-verifier-hit' + activeClass + '" data-wf-ops-verifier-hit="' + idx + '">'
                + this._opsEscapeHtml(source.slice(start, start + needle.length)) + '</mark>';
            last = start + needle.length;
        });
        html += this._opsEscapeHtml(source.slice(last));
        return { html, matchCount: starts.length, activeIndex: safeActive, matchStarts: starts };
    },

    _updateVerifierContentSearchUi(modal) {
        const searchWrap = this._opsQuery(modal, '#wf-ops-verifier-content-search-wrap', 'verifierContentSearchWrap');
        const countEl = this._opsQuery(modal, '#wf-ops-verifier-content-match-count', 'verifierContentMatchCount');
        const prevBtn = this._opsQuery(modal, '#wf-ops-verifier-content-prev', 'verifierContentPrev');
        const nextBtn = this._opsQuery(modal, '#wf-ops-verifier-content-next', 'verifierContentNext');
        const clearBtn = this._opsQuery(modal, '#wf-ops-verifier-content-search-clear', 'verifierContentSearchClear');
        const copyBtn = this._opsQuery(modal, '#wf-ops-copy-verifier', 'verifierCopy');
        const hasOutput = Boolean(this._opsVerifierSourceText);
        const search = this._opsVerifierContentSearch;
        const matchCount = search.matchStarts ? search.matchStarts.length : 0;
        const hasQuery = Boolean((search.query || '').trim());

        if (searchWrap) {
            searchWrap.style.display = hasOutput ? 'flex' : 'none';
        }
        if (copyBtn) {
            copyBtn.style.display = hasOutput ? 'inline-block' : 'none';
        }
        if (clearBtn) {
            clearBtn.style.display = hasQuery ? 'inline-flex' : 'none';
        }
        if (countEl) {
            if (!hasQuery) {
                countEl.textContent = '';
            } else if (matchCount === 0) {
                countEl.textContent = 'No matches';
            } else {
                countEl.textContent = (search.index + 1) + ' / ' + matchCount;
            }
        }
        const navDisabled = !hasQuery || matchCount === 0;
        if (prevBtn) prevBtn.disabled = navDisabled;
        if (nextBtn) nextBtn.disabled = navDisabled;
    },

    _clearVerifierContentSearch(modal) {
        const contentInput = this._opsQuery(modal, '#wf-ops-verifier-content-search', 'verifierContentSearchClearInput');
        if (contentInput) contentInput.value = '';
        this._applyVerifierContentSearch(modal, '');
        this._captureOpsTabState(modal);
        Logger.log('ops-tab: verifier content search cleared');
    },

    _scrollVerifierActiveContentMatch(modal) {
        const output = this._opsQuery(modal, '#wf-ops-verifier-output', 'verifierOutputScroll');
        if (!output) return;
        const active = output.querySelector('.wf-ops-verifier-hit-active');
        if (active && typeof active.scrollIntoView === 'function') {
            active.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
    },

    async _refreshVerifierOutputDisplay(modal) {
        const wrap = this._opsQuery(modal, '#wf-ops-verifier-output-wrap', 'verifierOutputWrap');
        const output = this._opsQuery(modal, '#wf-ops-verifier-output', 'verifierOutput');
        const copyBtn = this._opsQuery(modal, '#wf-ops-copy-verifier', 'verifierCopy');
        const text = this._opsVerifierSourceText || '';
        const query = (this._opsVerifierContentSearch.query || '').trim();

        if (wrap) {
            wrap.style.display = text ? 'flex' : 'none';
        }
        if (!output) {
            this._updateVerifierContentSearchUi(modal);
            return;
        }

        if (query) {
            const built = this._buildVerifierContentSearchHtml(text, query, this._opsVerifierContentSearch.index);
            this._opsVerifierContentSearch.matchStarts = built.matchStarts;
            this._opsVerifierContentSearch.index = built.activeIndex;
            output.innerHTML = built.html;
            output.className = 'language-python';
            this._updateVerifierContentSearchUi(modal);
            requestAnimationFrame(() => this._scrollVerifierActiveContentMatch(modal));
            return;
        }

        this._opsVerifierContentSearch.matchStarts = [];
        this._opsVerifierContentSearch.index = 0;
        if (Context.highlightJs && typeof Context.highlightJs.highlightCodeElement === 'function') {
            await Context.highlightJs.highlightCodeElement(output, { text, language: 'python' });
        } else if (Context.highlightJs && typeof Context.highlightJs.setPlainCode === 'function') {
            Context.highlightJs.setPlainCode(output, text);
        } else {
            output.textContent = text;
            output.className = text ? 'language-python' : 'language-plaintext';
        }
        this._updateVerifierContentSearchUi(modal);
    },

    _applyVerifierContentSearch(modal, rawQuery) {
        this._opsVerifierContentSearch.query = String(rawQuery || '');
        this._opsVerifierContentSearch.index = 0;
        void this._refreshVerifierOutputDisplay(modal);
        const q = this._opsVerifierContentSearch.query.trim();
        if (q) {
            const n = this._opsVerifierContentSearch.matchStarts.length;
            Logger.log('ops-tab: verifier content search — ' + n + ' match(es) for "' + q + '"');
        }
    },

    _stepVerifierContentMatch(modal, delta) {
        const search = this._opsVerifierContentSearch;
        const count = search.matchStarts ? search.matchStarts.length : 0;
        if (!count || !delta) return;
        search.index = (search.index + delta + count) % count;
        void this._refreshVerifierOutputDisplay(modal);
        Logger.debug('ops-tab: verifier content match ' + (search.index + 1) + '/' + count);
    },

    async _setOpsVerifierOutput(modal, value) {
        const text = value || '';
        this._opsVerifierSourceText = text;
        if (!text) {
            this._opsVerifierContentSearch = { query: '', index: 0, matchStarts: [] };
            const contentInput = this._opsQuery(modal, '#wf-ops-verifier-content-search', 'verifierContentSearchClear');
            if (contentInput) contentInput.value = '';
        }
        await this._refreshVerifierOutputDisplay(modal);
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
            verifierStatus: status ? (status.textContent || '') : '',
            verifierStatusIsError: status ? status.style.color === '#dc2626' : false,
            verifierOutput: this._opsVerifierSourceText || '',
            verifierContentSearchQuery: this._opsVerifierContentSearch.query || '',
            verifierContentSearchIndex: this._opsVerifierContentSearch.index || 0,
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

        if (state.verifierContentSearchQuery != null) {
            const contentInput = this._opsQuery(modal, '#wf-ops-verifier-content-search', 'verifierContentSearchRestore');
            if (contentInput) contentInput.value = state.verifierContentSearchQuery;
            this._opsVerifierContentSearch.query = state.verifierContentSearchQuery;
            this._opsVerifierContentSearch.index = Number(state.verifierContentSearchIndex) || 0;
            if (state.verifierOutput) {
                void this._refreshVerifierOutputDisplay(modal);
            }
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
        const dash = Context.dashboard;
        const box = dash && typeof dash.panelBoxStyle === 'function' ? dash.panelBoxStyle() : 'border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--card, #ffffff);';
        const label = dash && typeof dash.labelStyle === 'function' ? dash.labelStyle() : 'font-size: 11px; font-weight: 600; color: var(--muted-foreground, #64748b);';
        const hint = dash && typeof dash.hintStyle === 'function' ? dash.hintStyle() : 'font-size: 11px; color: var(--muted-foreground, #64748b);';
        const input = dash && typeof dash.inputStyle === 'function' ? dash.inputStyle() : 'padding: 8px 12px; font-size: 13px; border: 1px solid var(--border, #e5e5e5); border-radius: 6px; background: var(--background, white); color: var(--foreground, #333); box-sizing: border-box;';
        const navBtn = dash && typeof dash.navBtnPrimaryStyle === 'function' ? dash.navBtnPrimaryStyle() : 'padding: 8px 14px; font-size: 12px; font-weight: 600; color: var(--brand, #4f46e5); background: var(--background, white); border: 1px solid var(--border, #e5e5e5); border-radius: 6px; cursor: pointer;';
        const msTeams = dash && typeof dash.multiSelectHtml === 'function'
            ? dash.multiSelectHtml('team-members-teams', 'Teams', 'Run search to load teams', true)
            : '';
        const msPerms = dash && typeof dash.multiSelectHtml === 'function'
            ? dash.multiSelectHtml('team-members-permissions', 'Permissions', 'All permissions', true)
            : '';
        const splitPanel = dash && typeof dash.splitPanelSectionHtml === 'function'
            ? dash.splitPanelSectionHtml.bind(dash)
            : null;

        const leftHtml = `
                    <div style="${box} display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                        <div style="padding: 14px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px;">
                            <div>
                                <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 6px 0; color: var(--foreground, #0f172a);">
                                    Team Member Search
                                </h3>
                                <p style="${hint} margin: 0; line-height: 1.45;">
                                    Search the Computer Use team by name or email. Leave blank to list all members.
                                </p>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: stretch;">
                                <input type="text" id="wf-ops-team-search-input" placeholder="Name or email…" autocomplete="off" style="${input} flex: 1; min-width: 0;">
                                <button type="button" id="wf-ops-team-search-btn" class="wf-ops-action-btn" style="${navBtn} flex-shrink: 0;">Search</button>
                            </div>
                        </div>
                        <div id="wf-ops-team-filter-wrap" style="display: none; flex: 1; min-height: 0; overflow: hidden; flex-direction: column;">
                            <div id="wf-ops-team-left-scroll" style="flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 0 14px 14px; display: flex; flex-direction: column; gap: 14px;">
                                <div>
                                    <div style="${label} margin-bottom: 8px; font-weight: 600; color: var(--foreground, #0f172a);">Narrow results</div>
                                    <p style="${hint} margin: 0 0 8px 0;">None selected = all.</p>
                                    <div style="display: flex; flex-direction: column; gap: 12px;">
                                        ${msTeams}
                                        ${msPerms}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>`;
        const rightHtml = `
                <div style="flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; ${box}">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;">
                        <div id="wf-ops-team-search-status-row" style="display: none; align-items: center; justify-content: space-between; gap: 8px;">
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
                        <div id="wf-ops-team-search-status-placeholder" style="font-size: 13px; font-weight: 600; color: var(--foreground, #0f172a);">
                            Results
                            <span style="display: block; font-size: 11px; font-weight: 400; color: var(--muted-foreground, #64748b); margin-top: 4px;">Run a search to list team members.</span>
                        </div>
                    </div>
                    <div id="wf-ops-team-search-output-wrap" style="display: none; flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px;">
                        <div id="wf-ops-team-search-cards"></div>
                    </div>
                </div>`;

        if (splitPanel) return splitPanel(leftHtml, rightHtml);

        return `
            <section style="display: flex; flex: 1; min-height: 0; gap: 16px; overflow: hidden; width: 100%;">
                <aside style="width: 320px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
                    ${leftHtml}
                </aside>
                ${rightHtml}
            </section>`;
    },

    _renderTaskLinkBar() {
        return `
            <div id="wf-ops-task-link-bar" style="display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; flex: 0 0 auto; width: auto; max-width: 100%; box-sizing: border-box;">
                <label for="wf-ops-task-input" style="font-size: 11px; font-weight: 600; color: var(--muted-foreground, #64748b); white-space: nowrap; flex-shrink: 0;">Go to Task:</label>
                <input type="text" id="wf-ops-task-input" placeholder="Task key or UUID" autocomplete="off" title="Task View Link Generator" style="
                    flex: 0 0 auto;
                    width: 220px;
                    max-width: 100%;
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

    _renderGradeAssessmentsHeaderLink() {
        return '<a href="' + this._opsEscapeAttr(OPS_GRADE_ASSESSMENTS_URL) + '" target="_blank" rel="noopener noreferrer" '
            + 'id="wf-ops-grade-assessments" class="wf-dash-header-btn wf-ops-grade-header-link">Grade Assessments</a>';
    },

    _renderVerifierFetcherPanel() {
        return `
                <div id="wf-ops-verifier-panel" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;">
                    <div style="flex-shrink: 0;">
                        <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: var(--foreground, #0f172a);">
                            Verifier Code Fetcher
                        </h3>
                        <p style="font-size: 12px; color: var(--muted-foreground, #666); margin: 0 0 10px 0; line-height: 1.45;">
                            Paste a task key, task URL, verifier key, verifier ID, or copied seed data. Press Enter to fetch.
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
                        </div>
                        <div id="wf-ops-verifier-status-row" style="display: none; margin-top: 8px;">
                            <div id="wf-ops-verifier-status" style="font-size: 12px; color: var(--muted-foreground, #666); line-height: 1.45;"></div>
                        </div>
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
                    </div>
                    <div id="wf-ops-verifier-content-search-wrap" style="
                        display: none;
                        flex-shrink: 0;
                        align-self: flex-start;
                        width: 30%;
                        max-width: 30%;
                        min-width: 12rem;
                        margin-top: 8px;
                        gap: 6px;
                        align-items: center;
                        flex-wrap: wrap;
                        flex-direction: row;
                        justify-content: flex-start;
                        box-sizing: border-box;
                    ">
                        <label for="wf-ops-verifier-content-search" style="font-size: 11px; font-weight: 600; color: var(--muted-foreground, #64748b); white-space: nowrap; flex-shrink: 0;">Search in code:</label>
                        <span style="display: flex; flex: 1 1 8rem; min-width: 0; gap: 4px; align-items: center;">
                            <input type="text" id="wf-ops-verifier-content-search" placeholder="Find in verifier…" autocomplete="off" style="
                                flex: 1;
                                min-width: 0;
                                width: 100%;
                                padding: 6px 10px;
                                font-size: 12px;
                                border: 1px solid var(--border, #e5e5e5);
                                border-radius: 6px;
                                background: var(--background, white);
                                color: var(--foreground, #333);
                                box-sizing: border-box;
                                font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
                            ">
                            <button type="button" id="wf-ops-verifier-content-search-clear" title="Clear search" aria-label="Clear search" style="
                                display: none;
                                flex-shrink: 0;
                                width: 26px;
                                height: 26px;
                                padding: 0;
                                font-size: 16px;
                                line-height: 1;
                                font-weight: 600;
                                color: var(--muted-foreground, #64748b);
                                background: var(--background, white);
                                border: 1px solid var(--border, #e5e5e5);
                                border-radius: 6px;
                                cursor: pointer;
                                align-items: center;
                                justify-content: center;
                            ">&times;</button>
                        </span>
                        <span id="wf-ops-verifier-content-match-count" style="font-size: 11px; color: var(--muted-foreground, #64748b); white-space: nowrap; flex-shrink: 0;"></span>
                        <button type="button" id="wf-ops-verifier-content-prev" class="wf-ops-action-btn" style="
                            flex-shrink: 0;
                            padding: 6px 10px;
                            font-size: 11px;
                            font-weight: 600;
                            color: var(--foreground, #333);
                            background: var(--background, white);
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                        ">Prev</button>
                        <button type="button" id="wf-ops-verifier-content-next" class="wf-ops-action-btn" style="
                            flex-shrink: 0;
                            padding: 6px 10px;
                            font-size: 11px;
                            font-weight: 600;
                            color: var(--foreground, #333);
                            background: var(--background, white);
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                        ">Next</button>
                        <button type="button" id="wf-ops-copy-verifier" style="
                            display: none;
                            flex-shrink: 0;
                            padding: 6px 10px;
                            font-size: 11px;
                            font-weight: 500;
                            color: var(--muted-foreground, #666);
                            background: var(--background, white);
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                            cursor: pointer;
                            transition: background 0.2s, color 0.2s;
                        ">Copy</button>
                    </div>
                    <div id="wf-ops-verifier-output-wrap" style="
                        display: none;
                        flex: 1;
                        min-height: 0;
                        width: 100%;
                        margin-top: 8px;
                        flex-direction: column;
                    ">
                        <pre style="
                            flex: 1;
                            min-height: 0;
                            width: 100%;
                            margin: 0;
                            padding: 8px 12px;
                            font-size: 12px;
                            border: 1px solid var(--border, #e5e5e5);
                            border-radius: 6px;
                            background: var(--card, #fafafa);
                            color: var(--foreground, #333);
                            box-sizing: border-box;
                            overflow: auto;
                            white-space: pre-wrap;
                            word-break: break-word;
                            font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
                        "><code id="wf-ops-verifier-output" class="language-python"></code></pre>
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
            this._setOpsVerifierStatus(modal, '');
            const versionText = result.version != null ? 'v' + result.version : 'latest version';
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
            this._setOpsVerifierStatus(modal, '');
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
            verifierInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    void this._handleOpsVerifierFetch(modal);
                }
            });
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

        const verifierContentSearch = this._opsQuery(modal, '#wf-ops-verifier-content-search', 'verifierContentSearchAttach');
        const verifierContentClear = this._opsQuery(modal, '#wf-ops-verifier-content-search-clear', 'verifierContentSearchClearAttach');
        const verifierContentPrev = this._opsQuery(modal, '#wf-ops-verifier-content-prev', 'verifierContentPrevAttach');
        const verifierContentNext = this._opsQuery(modal, '#wf-ops-verifier-content-next', 'verifierContentNextAttach');
        if (verifierContentClear) {
            verifierContentClear.addEventListener('click', () => {
                this._clearVerifierContentSearch(modal);
            });
        }
        if (verifierContentSearch) {
            verifierContentSearch.addEventListener('input', () => {
                this._applyVerifierContentSearch(modal, verifierContentSearch.value);
                this._captureOpsTabState(modal);
            });
            verifierContentSearch.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                this._stepVerifierContentMatch(modal, e.shiftKey ? -1 : 1);
                this._captureOpsTabState(modal);
            });
        }
        if (verifierContentPrev) {
            verifierContentPrev.addEventListener('click', () => {
                this._stepVerifierContentMatch(modal, -1);
                this._captureOpsTabState(modal);
            });
        }
        if (verifierContentNext) {
            verifierContentNext.addEventListener('click', () => {
                this._stepVerifierContentMatch(modal, 1);
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
