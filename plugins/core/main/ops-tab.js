// ops-tab.js
// Core plugin for the Ops platform: secrets/password gate, PostgREST, team
// catalog and search/mutate APIs, verifier fetch backend, and task link helpers.
// Tab panel controllers live in team-members.js (Context.teamMembers) and
// verifier-fetcher.js (Context.verifierFetcher). Dashboard chrome/settings UI
// live in search-output.js, dashboard-settings.js, and settings-ui.js.

const OPS_TASK_ID_FROM_URL_RE = /(?:tasks\/|view-task\/)([^/?#\s]+)/i;
const OPS_TASK_KEY_RE = /task_[A-Za-z0-9_]+/;
const OPS_VERIFIER_KEY_RE = /verifier-task_[A-Za-z0-9_.-]+/;
const OPS_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPS_UUID_FIND_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
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

const OPS_FLEET_ORIGIN_FALLBACK = 'https://www.fleetai.com';
const OPS_FLEET_HOSTS = new Set(['www.fleetai.com', 'fleetai.com']);
const OPS_SESSION_REFRESH_USER_MESSAGE =
    'Fleet session token not yet captured. Navigate to a Fleet data page (e.g. dashboard/team), then press Refresh catalogs.';
const OPS_TEAM_SEARCH_PAGE_LIMIT = 25;
/** Query param on programmatic Team page opens for credential refresh (auto-close when captured) */
const OPS_TEAM_CRED_REFRESH_QUERY = 'wfOpsTeamCredRefresh';
/** BroadcastChannel name for cross-tab ops dashboard action sync (replaces page localStorage storage events). */
const OPS_SYNC_CHANNEL_NAME = 'fleet-ux-ops-sync';
/** @deprecated Legacy page localStorage key; purged on migration/clear only. */
const OPS_TEAM_CRED_REFRESH_DONE_STORAGE_KEY = 'fleet-ux:ops-team-cred-refresh-done';
const OPS_TEAM_CRED_REFRESH_TIMEOUT_MS = 90000;
/** Script storage key for the dynamically captured Next.js server action hash for team member search */
const OPS_TEAM_SEARCH_ACTION_STORAGE_KEY = 'fleet-ux:ops-team-search-next-action';
/** Script storage key for the dynamically captured Next.js router state tree for team member search */
const OPS_TEAM_SEARCH_ROUTER_STATE_STORAGE_KEY = 'fleet-ux:ops-team-search-router-state';
/** Script storage key for the Next.js server action hash for dashboard team add-member */
const OPS_TEAM_ADD_MEMBER_ACTION_STORAGE_KEY = 'fleet-ux:ops-team-add-member-next-action';
/** Script storage key for the Next.js router state tree for dashboard team add-member */
const OPS_TEAM_ADD_MEMBER_ROUTER_STATE_STORAGE_KEY = 'fleet-ux:ops-team-add-member-router-state';
/** Script storage key for the Next.js server action hash for dashboard task data (events) */
const OPS_TASK_DATA_ACTION_STORAGE_KEY = 'fleet-ux:ops-task-data-next-action';
/** Script storage key for the Next.js router state tree for dashboard task data */
const OPS_TASK_DATA_ROUTER_STATE_STORAGE_KEY = 'fleet-ux:ops-task-data-router-state';
const OPS_TASK_DATA_PATH_RE = /^\/dashboard\/data\/tasks\/[^/]+$/;
const OPS_EXPERT_PATH_RE = /^\/dashboard\/data\/experts\/[^/]+$/;
/** Script storage key for expert profile summary stats server action (creator + QA via body[1]) */
const OPS_EXPERT_STATS_ACTION_STORAGE_KEY = 'fleet-ux:ops-expert-stats-next-action';
const OPS_EXPERT_STATS_ROUTER_STATE_STORAGE_KEY = 'fleet-ux:ops-expert-stats-router-state';
/** Query param on programmatic expert profile opens for stats credential refresh (auto-close when captured) */
const OPS_EXPERT_CRED_REFRESH_QUERY = 'wfOpsExpertCredRefresh';
const OPS_EXPERT_CRED_REFRESH_TIMEOUT_MS = 90000;
/** Default team tier when adding a member via the dashboard team server action */
const OPS_TEAM_ADD_MEMBER_DEFAULT_ROLE = 'expert';
/** When true, extension gear opens the Ops dashboard instead of the settings modal */
const OPS_DASHBOARD_OPEN_ON_SETTINGS_KEY = 'ops-dashboard-open-on-settings';
/** GM storage: last seen opsAccess.passwordHash (invalidate stored password on rotation) */
const OPS_PASSWORD_HASH_SEEN_STORAGE_KEY = 'ops-tab-password-hash-seen';
const OPS_BUNDLE_NOT_LOADED_MESSAGE =
    'Ops bundle not loaded. Unlock the Ops dashboard and ensure ops-secrets.enc.json is available on this branch.';
const OPS_BUNDLE_READY_DEFAULT_TIMEOUT_MS = 30000;
/** Script storage key for the logged-in Fleet user UUID (from __next_f payload, cookie, or JWT) */
const OPS_CURRENT_USER_ID_STORAGE_KEY = 'fleet-ux:ops-current-user-id';
/** Matches `"user":{"id":"<uuid>"` in Next.js RSC flight payloads */
const OPS_NEXT_F_USER_ID_RE = /"user"\s*:\s*\{\s*"id"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i;
/** Fleet API prefix for teams included in dashboard / ops team search. */
const OPS_TASK_DESIGNERS_TEAM_PREFIX = 'Task Designers - ';

/** Same-site Fleet web origin (apex or www). Avoids cross-origin API calls when the page is on fleetai.com. */
function opsFleetOrigin() {
    try {
        let win = null;
        if (typeof Context !== 'undefined' && typeof Context.getPageWindow === 'function') {
            win = Context.getPageWindow();
        }
        if (!win) win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const host = win && win.location && win.location.hostname;
        const origin = win && win.location && win.location.origin;
        if (origin && host && OPS_FLEET_HOSTS.has(host)) return origin;
    } catch (e) { /* ignore */ }
    return OPS_FLEET_ORIGIN_FALLBACK;
}

function opsTaskUrlPrefix() {
    return opsFleetOrigin() + '/dashboard/data/tasks/';
}

function opsGradeAssessmentsUrl() {
    return opsFleetOrigin() + '/work/assessments/grade/';
}

function opsTeamSearchUrl() {
    return opsFleetOrigin() + '/dashboard/team';
}

function opsTeamBulkRemoveUrl() {
    return opsFleetOrigin() + '/api/orchestrator-private/v1/team/members/bulk-remove';
}

function opsTeamUserPermissionsUrl() {
    return opsFleetOrigin() + '/api/orchestrator-private/v1/team/users/permissions';
}

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

async function computeSha256Hex(text) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hex = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    return 'sha256-' + hex;
}

function opsBase64Encode(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function opsBase64Decode(str) {
    const binary = atob(str);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

/** Keep in sync with packBlob in dev/utils/ops-password-crypto.mjs */
function opsPackEncryptedBlob({ salt, iv, ciphertext }) {
    const buf = new Uint8Array(1 + salt.length + iv.length + ciphertext.length);
    buf[0] = OPS_CRYPTO_FORMAT_VERSION;
    buf.set(salt, 1);
    buf.set(iv, 1 + salt.length);
    buf.set(ciphertext, 1 + salt.length + iv.length);
    return buf;
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

/** Keep in sync with encryptWithPassword in dev/utils/ops-password-crypto.mjs */
async function opsEncryptWithPassword(plaintext, password) {
    if (!password) {
        throw new Error('Password must not be empty');
    }
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(OPS_CRYPTO_SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(OPS_CRYPTO_IV_BYTES));
    const key = await opsDeriveAesKey(password, salt);
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: OPS_CRYPTO_AES_GCM_TAG_LENGTH },
        key,
        enc.encode(plaintext)
    );
    const packed = opsPackEncryptedBlob({
        salt,
        iv,
        ciphertext: new Uint8Array(ciphertext)
    });
    return OPS_CRYPTO_FORMAT_PREFIX + ':' + opsBase64Encode(packed);
}

async function opsDecryptWithPassword(blob, password) {
    if (!password) {
        throw new Error('Password must not be empty');
    }
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
    description: 'Ops platform: password gate, PostgREST, team catalog/search APIs, verifier fetch, task links',
    _version: '12.0',
    phase: 'core',
    enabledByDefault: true,

    /** Dynamically discovered team search server action parameters (populated at runtime, never hardcoded) */
    _opsTeamSearchActionCache: { nextAction: null, routerState: null },
    /** Team page cred refresh: { modal, startedAt } while waiting for capture */
    _opsTeamCredRefreshPending: null,
    _opsTeamCredRefreshTimeout: null,
    /** Dynamically discovered team add-member server action (same URL as search, different action hash) */
    _opsTeamAddMemberActionCache: { nextAction: null, routerState: null },
    /** Dynamically discovered task detail server action (task events RSC payload) */
    _opsTaskDataActionCache: { nextAction: null, routerState: null },
    /** Expert profile summary stats action — body [id, false|true] for creator vs QA */
    _opsExpertStatsActionCache: { nextAction: null, routerState: null },
    /** Expert profile cred refresh: { modal, expertId, startedAt } while waiting for capture */
    _opsExpertCredRefreshPending: null,
    _opsExpertCredRefreshTimeout: null,
    _opsSyncChannel: null,
    _opsSyncChannelSubscribed: false,
    /** Logged-in Fleet user UUID captured from __next_f, cookie, JWT, or persisted storage */
    _opsCurrentUserIdCache: '',
    _opsCurrentUserIdCaptureInstalled: false,
    /** Runtime team catalog for the logged-in user (from PostgREST team_member embed) */
    _opsUserTeamCatalogCache: null,
    _opsSecretsCache: {
        json: null,
        loadError: null,
        loading: false,
        missingLogged: false,
        loadPromise: null,
        decryptMismatchLogged: false
    },
    _opsBundleNotLoadedLogged: false,
    _opsTabState: {
        taskInput: ''
    },

    init(state, context) {
        Context.opsTab = {
            isAccessConfigured: () => this._isOpsAccessConfigured(),
            isEnabled: () => this._getOpsTabEnabled(),
            isWanted: () => this._getOpsTabWanted(),
            isDashboardAllowedOnHost: () => this._isOpsDashboardAllowedOnHost(),
            hasStoredPassword: () => this._hasOpsStoredPassword(),
            needsOpsDashboardRefresh: () => this._needsOpsDashboardRefresh(),
            shouldOpenDashboardOnSettings: () => this._shouldOpenDashboardOnSettings(),
            getOpsDashboardOpenOnSettings: () => this._getOpsDashboardOpenOnSettings(),
            setOpsDashboardOpenOnSettings: (enabled) => this._setOpsDashboardOpenOnSettings(enabled),
            renderSettingsSection: () => this._renderOpsSettingsSection(),
            renderGradeAssessmentsHeaderLink: () => this._renderGradeAssessmentsHeaderLink(),
            renderTaskLinkBar: () => this._renderTaskLinkBar(),
            attachSettingsListeners: (modal, settingsPlugin) => this._attachOpsSettingsListeners(modal, settingsPlugin),
            attachTaskLinkListeners: (dashModal) => this._attachOpsTaskLinkListeners(dashModal),
            injectSpinnerStyle: () => this._injectOpsSpinnerStyle(),
            findVerifierContentMatchStarts: (text, query) => this._findVerifierContentMatchStarts(text, query),
            renderVerifierCodeElement: (codeEl, opts) => this._renderVerifierCodeElement(codeEl, opts),
            setVerifierContentMatchActive: (codeEl, activeIndex) => this._setVerifierContentMatchActive(codeEl, activeIndex),
            scrollVerifierActiveContentMatch: (codeEl) => this._scrollVerifierActiveContentMatchInElement(codeEl),
            stepVerifierContentMatchInElement: (codeEl, searchState, delta, rerender) =>
                this._stepVerifierContentMatchInElement(codeEl, searchState, delta, rerender),
            listTaskVerifierVersionOptions: (parsed) => this._listOpsTaskVerifierVersionOptions(parsed),
            captureTaskLinkState: (modal) => this._captureOpsTaskLinkState(modal),
            captureState: (root) => this._captureOpsTabState(root),
            revalidateOnDashboardTabActivated: (dashModal) => this._revalidateOnDashboardTabActivated(dashModal),
            ensureOpsSessionReady: (dashModal) => this._ensureOpsSessionReady(dashModal),
            isOpsBundleReady: () => this._isOpsBundleReady(),
            isOpsBundleNotLoadedError: (err) => this._isOpsBundleNotLoadedError(err),
            whenOpsBundleReady: (options) => this._whenOpsBundleReady(options),
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
            getRatingBaselines: () => this._getOpsRatingBaselines(),
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
            getCurrentUserId: () => this._getOpsCurrentUserId(),
            hasTeamSearchCredentials: () => {
                this._loadOpsTeamSearchActionFromStorage();
                return !!this._opsTeamSearchActionCache.nextAction;
            },
            hasTeamAddMemberCredentials: () => {
                if (!this._opsTeamAddMemberActionCache.nextAction) {
                    this._loadOpsTeamAddMemberActionFromStorage();
                }
                return !!this._opsTeamAddMemberActionCache.nextAction;
            },
            hasExpertStatsCredentials: () => {
                if (!this._opsExpertStatsActionCache.nextAction) {
                    this._loadOpsExpertStatsActionFromStorage();
                }
                return !!this._opsExpertStatsActionCache.nextAction;
            },
            reloadTeamDashboardActionsFromStorage: () => this._reloadOpsTeamDashboardActionsFromStorage(),
            clearTeamSearchActionCache: () => this._clearOpsTeamSearchActionCache(),
            isTeamSearchActionStaleError: (err) => this._isOpsTeamSearchActionStaleError(err),
            openTeamPageForCredRefresh: (modal) => this._openOpsTeamPageForCredRefresh(modal),
            openExpertProfileForCredRefresh: (modal, expertId) => this._openOpsExpertProfileForCredRefresh(modal, expertId),
            fetchExpertStats: (expertId, qaMode) => this._fetchOpsExpertStats(expertId, qaMode),
            addMemberToTeam: (teamId, email, permissionKeys) => this._opsAddMemberToTeam(teamId, email, permissionKeys),
            removeMemberFromTeam: (teamId, email) => this._opsRemoveMemberFromTeam(teamId, email),
            modifyMemberPermission: (profileId, permission, action) => this._opsModifyMemberPermission(profileId, permission, action),
            getTeamUuidByLabel: (label) => this._getOpsTeamUuidByLabel(label),
            getTeamDashboardUrl: () => opsTeamSearchUrl(),
            getFleetOrigin: () => opsFleetOrigin(),
            fetchTeamSearchAllMembers: (teamId, userId, query, sessionId, signal) =>
                this._fetchOpsTeamSearchAllMembers(teamId, userId, query, sessionId, signal),
            getTaskDataActionCache: () => this._opsTaskDataActionCache,
            fetchTaskDataRsc: (taskKey, taskUuid) => this._fetchOpsTaskDataRsc(taskKey, taskUuid),
            fetchUserTeamCatalog: (profileId, options) => this.fetchUserTeamCatalog(profileId, options),
            getUserTeamCatalog: () => this.getUserTeamCatalog(),
            getUserTaskDesignersTeamCatalog: () => this.getUserTaskDesignersTeamCatalog(),
            hydrateUserTeamCatalog: (profileId, teams) => this._hydrateUserTeamCatalog(profileId, teams),
            isTaskDesignersTeam: (name) => opsIsTaskDesignersTeamName(name),
            formatTeamDisplayLabel: (name) => opsFormatTeamDisplayLabel(name),
            encryptWithOpsPassword: (plaintext) => this._encryptWithOpsPassword(plaintext),
            decryptWithOpsPassword: (blob) => this._decryptWithOpsPassword(blob)
        };
        Logger.log('module registered (Context.opsTab)');
        this._loadOpsTeamSearchActionFromStorage();
        this._loadOpsTeamAddMemberActionFromStorage();
        this._loadOpsTaskDataActionFromStorage();
        this._loadOpsExpertStatsActionFromStorage();
        this._loadOpsCurrentUserIdFromStorage();
        this._subscribeOpsTeamDashboardActionCapture();
        this._subscribeOpsTaskDataActionCapture();
        this._subscribeOpsExpertActionCapture();
        this._subscribeOpsCurrentUserIdCapture();
        this._subscribeOpsTeamDashboardActionSync();
        this._invalidateOpsPasswordOnHashRotation();
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

    _persistOpsPasswordHashSeen(hash) {
        const value = String(hash || '').trim();
        if (value) {
            Storage.set(OPS_PASSWORD_HASH_SEEN_STORAGE_KEY, value);
        }
    },

    _invalidateOpsPasswordOnHashRotation() {
        const currentHash = this._getOpsPasswordHash();
        if (!currentHash) return;
        const seen = String(Storage.get(OPS_PASSWORD_HASH_SEEN_STORAGE_KEY, '') || '').trim();
        if (seen && seen !== currentHash && this._hasOpsStoredPassword()) {
            this._clearOpsStoredPassword();
            Logger.info('stored password cleared — opsAccess.passwordHash changed');
            if (Context.dashboard && typeof Context.dashboard.isOpen === 'function'
                && Context.dashboard.isOpen()
                && typeof Context.dashboard.close === 'function') {
                Context.dashboard.close();
            }
        }
        this._persistOpsPasswordHashSeen(currentHash);
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
        return this._isOpsDashboardAllowedOnHost()
            && this._getOpsTabWanted()
            && this._getOpsDashboardOpenOnSettings();
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

    /**
     * Encrypt arbitrary UTF-8 plaintext with the stored Ops password.
     * @param {string} plaintext
     * @returns {Promise<string>} fleet-ops1:... blob
     */
    async _encryptWithOpsPassword(plaintext) {
        const password = this._getOpsStoredPassword();
        if (!password) {
            throw new Error('Ops password not available');
        }
        if (typeof plaintext !== 'string') {
            throw new Error('plaintext must be a string');
        }
        return opsEncryptWithPassword(plaintext, password);
    },

    /**
     * Decrypt a fleet-ops1 blob with the stored Ops password.
     * @param {string} blob
     * @returns {Promise<string>} UTF-8 plaintext
     */
    async _decryptWithOpsPassword(blob) {
        const password = this._getOpsStoredPassword();
        if (!password) {
            throw new Error('Ops password not available');
        }
        if (typeof blob !== 'string' || !blob) {
            throw new Error('blob must be a non-empty string');
        }
        return opsDecryptWithPassword(blob, password);
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
        this._opsSecretsCache.loadPromise = null;
        this._opsSecretsCache.decryptMismatchLogged = false;
    },

    _getOpsSecretsJson() {
        return this._opsSecretsCache.json;
    },

    _isOpsBundleReady() {
        const json = this._getOpsSecretsJson();
        return !!(json && typeof json === 'object' && json.postgrest);
    },

    _isOpsBundleNotLoadedError(err) {
        return !!(err && typeof err.message === 'string'
            && err.message.indexOf('Ops bundle not loaded') >= 0);
    },

    _logOpsBundleNotLoadedOnce(context) {
        if (this._opsBundleNotLoadedLogged) return;
        this._opsBundleNotLoadedLogged = true;
        Logger.debug('' + (context || 'request') + ' skipped — ' + OPS_BUNDLE_NOT_LOADED_MESSAGE);
    },

    async _whenOpsBundleReady(options) {
        const opts = options || {};
        const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : OPS_BUNDLE_READY_DEFAULT_TIMEOUT_MS;
        if (this._isOpsBundleReady()) return;

        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (this._isOpsBundleReady()) return;
            if (this._getOpsTabEnabled()) {
                await this._loadOpsSecrets(!this._opsSecretsCache.loadPromise);
            } else if (this._opsSecretsCache.loadPromise) {
                await this._opsSecretsCache.loadPromise;
            } else {
                break;
            }
            if (this._isOpsBundleReady()) return;
            if (!this._opsSecretsCache.loading && !this._opsSecretsCache.loadPromise) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }

        if (this._isOpsBundleReady()) return;
        const err = this._opsSecretsCache.loadError
            || new Error(OPS_BUNDLE_NOT_LOADED_MESSAGE);
        throw err;
    },

    /**
     * Validated rating prior pack from decrypted Ops secrets (synchronous).
     * Returns null when secrets are locked/missing or the payload is incomplete.
     * Does not expose the full secrets object.
     */
    _getOpsRatingBaselines() {
        const json = this._getOpsSecretsJson();
        if (!json || typeof json !== 'object') return null;
        const raw = json.ratingBaselines;
        if (!raw || typeof raw !== 'object') return null;
        const global = raw.global;
        const tw = global && global.priors && global.priors.twqs;
        const qa = global && global.priors && global.priors.qaqs;
        if (!tw || typeof tw !== 'object' || !qa || typeof qa !== 'object') return null;
        const twRequired = [
            'outcomeQuality', 'positiveFeedbackRate', 'taskRatingQuality',
            'firstPassAcceptance', 'disputeLossAvoidance'
        ];
        const qaRequired = [
            'returnEffectiveness', 'returnActionability',
            'disputeDefense', 'labelDiscrimination'
        ];
        for (const id of twRequired) {
            if (!Number.isFinite(Number(tw[id]))) return null;
        }
        for (const id of qaRequired) {
            if (!Number.isFinite(Number(qa[id]))) return null;
        }
        // Accept both schemaVersion 1 (legacy) and 2+ (eligibility metadata).
        return raw;
    },

    _getOpsBundle() {
        const json = this._getOpsSecretsJson();
        if (!json || typeof json !== 'object' || !json.postgrest) {
            throw new Error(OPS_BUNDLE_NOT_LOADED_MESSAGE);
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
        if (!force && this._isOpsBundleReady()) {
            return;
        }
        if (!force && this._opsSecretsCache.loadPromise) {
            return this._opsSecretsCache.loadPromise;
        }

        const self = this;
        const run = async () => {
            self._opsSecretsCache.loading = true;
            self._opsSecretsCache.loadError = null;
            try {
                const wrapped = await self._fetchOpsSecretsEncryptedWrapper();
                if (!wrapped || typeof wrapped.encrypted !== 'string' || !wrapped.encrypted) {
                    if (!self._opsSecretsCache.missingLogged) {
                        Logger.debug('no encrypted secrets file on branch');
                        self._opsSecretsCache.missingLogged = true;
                    }
                    self._opsSecretsCache.json = null;
                    return;
                }
                const plaintext = await opsDecryptWithPassword(wrapped.encrypted, password);
                const parsed = JSON.parse(plaintext);
                self._opsSecretsCache.json = parsed;
                self._opsBundleNotLoadedLogged = false;
                const keyCount = parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 0;
                Logger.log('secrets decrypted (' + keyCount + ' top-level keys)');
                try {
                    const baselines = self._getOpsRatingBaselines();
                    if (baselines && Context.ratingEngine && typeof Context.ratingEngine.setCohortBaselines === 'function') {
                        Context.ratingEngine.setCohortBaselines(baselines);
                        Logger.log('ratingBaselines applied to Context.ratingEngine');
                    } else if (!baselines) {
                        Logger.debug('ratingBaselines missing or incomplete in secrets');
                    }
                } catch (baselineErr) {
                    Logger.warn('failed to apply ratingBaselines', baselineErr);
                }
            } catch (e) {
                self._opsSecretsCache.json = null;
                self._opsSecretsCache.loadError = e;
                Logger.warn('secrets decrypt failed', e);
                try {
                    const ok = await self._verifyOpsPassword(password);
                    if (ok && !self._opsSecretsCache.decryptMismatchLogged) {
                        self._opsSecretsCache.decryptMismatchLogged = true;
                        Logger.warn('password accepted but decrypt failed — pull latest ops-secrets.enc.json or re-save password after branch sync'
                        );
                    }
                } catch (_verifyErr) {
                    Logger.debug('decrypt failure password check skipped', _verifyErr);
                }
            } finally {
                self._opsSecretsCache.loading = false;
                self._opsSecretsCache.loadPromise = null;
            }
        };

        this._opsSecretsCache.loadPromise = run();
        return this._opsSecretsCache.loadPromise;
    },

    _hasOpsStoredPassword() {
        return this._getOpsStoredPassword().length > 0;
    },

    _isOpsDashboardAllowedOnHost() {
        return Context.isExternalInstanceHost !== true;
    },

    _getOpsTabEnabled() {
        return this._isOpsDashboardAllowedOnHost()
            && this._getOpsTabWanted()
            && this._hasOpsStoredPassword()
            && this._isOpsAccessConfigured();
    },

    _needsOpsDashboardRefresh() {
        if (!this._getOpsTabEnabled()) return false;
        return Context.opsDashboardPluginsLoaded !== true;
    },

    async _verifyOpsPassword(password) {
        const expected = this._getOpsPasswordHash();
        if (!expected || !password) return false;
        try {
            const computed = await computeSha256Hex(password);
            return computed === expected;
        } catch (err) {
            Logger.error('password verification failed', err);
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
            return opsTaskUrlPrefix() + id;
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
                Logger.debug('task link team_id lookup failed', e);
                teamSource = 'tasks-lookup-failed';
            }
        }
        const taskId = String(parsed.taskId || this._extractOpsTaskIdentifier(raw) || '').trim();
        const taskRef = taskId
            ? (taskId.length > 12 ? taskId.slice(0, 8) + '…' : taskId)
            : '(none)';
        Logger.debug('task link target resolved — task=' + taskRef +
            ' team=' + this._opsTeamRef(teamId) +
            ' source=' + teamSource +
            ' url=' + url
        );
        if (teamSource === 'tasks-lookup-empty') {
            Logger.warn('task link — no team_id from PostgREST; open may use wrong team context');
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
            Logger.warn('openTaskLink skipped — no URL');
            return;
        }
        const teamId = String(target.teamId || '').trim();
        const tabMode = options.newTab ? 'new tab' : 'current tab';
        let teamSwitch = 'none';
        if (!teamId) {
            teamSwitch = 'skipped-no-team';
            Logger.debug('task link — no team_id; opening without team switch');
        } else if (!Context.dashboard || typeof Context.dashboard.switchFleetTeam !== 'function') {
            teamSwitch = 'skipped-no-dashboard';
            Logger.warn('task link — dashboard.switchFleetTeam unavailable; opening without team switch');
        } else {
            try {
                await Context.dashboard.switchFleetTeam(teamId);
                teamSwitch = 'switched';
                Logger.debug('task link — team switch completed (' + this._opsTeamRef(teamId) + ')');
            } catch (e) {
                teamSwitch = 'failed';
                Logger.warn('team switch before task link failed', e);
            }
        }
        if (options.newTab) {
            window.open(target.url, '_blank', 'noopener,noreferrer');
        } else {
            this._getOpsPageWindow().location.href = target.url;
        }
        Logger.log('task link opened (' + tabMode + ') — switch=' + teamSwitch +
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
            Logger.debug('page window lookup failed', e);
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
                Logger.warn('PostgREST JWT expired — use Fleet on a data page to capture a fresh token');
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
            verifierVersion: null,
            verifierVersionId: ''
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
        out.verifierVersionId =
            from.verifier_version_id ||
            from.verifierVersionId ||
            from.versionId ||
            '';
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
            Logger.debug('tasks row id=' + (taskRow && taskRow.id || '(none)') +
                ' current_version_id=' + (taskRow && taskRow.current_version_id || '(none)') +
                ' team_id=' + (taskRow && taskRow.team_id || '(none)')
            );
        } catch (e) {
            if (this._isOpsBundleNotLoadedError(e)) {
                this._logOpsBundleNotLoadedOnce('tasks lookup');
                throw e;
            }
            Logger.debug('tasks lookup failed', e);
        }

        if (!taskRow) {
            if (!this._isOpsBundleReady()) {
                throw new Error(OPS_BUNDLE_NOT_LOADED_MESSAGE);
            }
            Logger.debug('tasks no row for ' + (parsed.taskKey || parsed.taskId) + ' — treating input as verifier ID');
            return parsed;
        }

        const teamId = parsed.teamId || taskRow.team_id || '';
        const taskId = parsed.taskId || taskRow.id || '';
        const taskKey = parsed.taskKey || taskRow.key || '';

        let verifierId = '';
        let verifierKey = '';
        let verifierVersion = null;
        let verifierVersionId = '';
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
                    verifierVersionId = vRow.verifier_version_id || '';
                    Logger.debug('task_versions verifier_id=' + (verifierId || '(none)') +
                        ' key=' + (verifierKey || '(none)') +
                        ' versionId=' + (verifierVersionId || '(none)') +
                        ' version=' + (verifierVersion == null ? '(none)' : verifierVersion)
                    );
                }
            } catch (e) {
                Logger.debug('task_versions lookup failed', e);
            }
        } else {
            Logger.debug('tasks had no current_version_id');
        }

        return {
            ...parsed,
            taskId,
            taskKey,
            teamId,
            verifierId: verifierId || parsed.verifierId || '',
            verifierKey: verifierKey || parsed.verifierKey || '',
            verifierVersion: verifierVersion != null ? verifierVersion : (parsed.verifierVersion != null ? parsed.verifierVersion : null),
            verifierVersionId: parsed.verifierVersionId || verifierVersionId || ''
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

        Logger.debug('user story task lookup', {
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

        const scenRows = await this._opsPostgrestQuery('task_scenarios.select_by_id', {
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
            Logger.debug('verifiers task-key like-query failed', e);
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
            Logger.debug('resolved team_id from current-team-id cookie: ' + fromCookie);
            return fromCookie;
        }
        const catalog = this.getUserTeamCatalog();
        if (catalog.length > 0 && catalog[0][0]) {
            Logger.debug('resolved team_id from user team catalog: ' + catalog[0][0]);
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
        const rows = await this._opsPostgrestQuery('team_member.select_catalog', {
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
        Logger.log('user team catalog fetched (' + teams.length + ' teams, profile=' + id.slice(0, 8) + '…)');
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
            Logger.debug('cookie read failed for ' + name, e);
        }
        return '';
    },

    _loadOpsCurrentUserIdFromStorage() {
        try {
            const userId = Storage.getData(OPS_CURRENT_USER_ID_STORAGE_KEY, null);
            if (userId && OPS_UUID_RE.test(userId)) {
                this._opsCurrentUserIdCache = userId;
                Logger.debug('current user id hydrated from script storage (' + userId.slice(0, 8) + '…)');
            }
        } catch (e) {
            Logger.debug('current user id script storage hydration failed', e);
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
            Storage.setData(OPS_CURRENT_USER_ID_STORAGE_KEY, userId);
        } catch (e) {
            Logger.debug('current user id persist failed', e);
        }
        if (changed) {
            Logger.log('current user id captured (' + userId.slice(0, 8) + '…, source=' + (source || 'unknown') + ')');
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
            Logger.debug('__next_f script scan failed', e);
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
        Logger.debug('__next_f user id capture hook installed');
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
            Logger.debug('initial current user id capture failed', e);
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
            Logger.debug('current user id script watcher registered');
        } catch (e) {
            Logger.debug('current user id script watcher failed', e);
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
            Logger.debug('__NEXT_DATA__ deploymentId read failed', e);
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
            Logger.warn('cookie write failed for ' + name, e);
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
            const nextAction = Storage.getData(OPS_EXPERT_STATS_ACTION_STORAGE_KEY, null);
            const routerState = Storage.getData(OPS_EXPERT_STATS_ROUTER_STATE_STORAGE_KEY, null);
            if (nextAction) {
                this._opsExpertStatsActionCache = { nextAction, routerState: routerState || '' };
                Logger.debug('expert stats action hydrated from script storage (' + nextAction.slice(0, 12) + '…)');
            }
        } catch (e) {
            Logger.debug('expert stats action script storage hydration failed', e);
        }
    },

    _persistOpsExpertStatsAction({ nextAction, routerState }) {
        if (!nextAction) return;
        const changed = nextAction !== this._opsExpertStatsActionCache.nextAction;
        this._opsExpertStatsActionCache = { nextAction, routerState: routerState || '' };
        try {
            Storage.setData(OPS_EXPERT_STATS_ACTION_STORAGE_KEY, nextAction);
            if (routerState) {
                Storage.setData(OPS_EXPERT_STATS_ROUTER_STATE_STORAGE_KEY, routerState);
            }
        } catch (e) {
            Logger.debug('expert stats action persist failed', e);
        }
        if (changed) {
            Logger.log('expert stats action updated (' + nextAction.slice(0, 12) + '…)');
            this._broadcastOpsSync({ type: 'expertStatsActionUpdated' });
        }
    },

    _clearOpsExpertStatsActionCache() {
        this._opsExpertStatsActionCache = { nextAction: null, routerState: null };
        try {
            Storage.deleteData(OPS_EXPERT_STATS_ACTION_STORAGE_KEY);
            Storage.deleteData(OPS_EXPERT_STATS_ROUTER_STATE_STORAGE_KEY);
        } catch (e) {
            Logger.debug('expert stats action cache clear failed', e);
        }
        Logger.log('expert stats action cache cleared (will re-discover on expert profile visit)');
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
            Logger.debug('NetworkObserver unavailable; passive expert action capture skipped');
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
                    const credRefreshTab = self._isOpsExpertCredRefreshTab();
                    if (nextAction !== self._opsExpertStatsActionCache.nextAction) {
                        self._persistOpsExpertStatsAction({ nextAction, routerState: routerState || '' });
                        Logger.debug('expert stats action captured from live traffic (' + nextAction.slice(0, 12) + '…)');
                    }
                    if (credRefreshTab) {
                        self._signalOpsExpertCredRefreshComplete();
                        self._tryCloseOpsExpertCredRefreshTab();
                    }
                }
            }
        });
        Logger.debug('expert dashboard action passive watcher registered');
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
        const url = opsFleetOrigin() + '/dashboard/data/experts/' + encodeURIComponent(id);

        const headers = {
            accept: 'text/x-component',
            'content-type': 'text/plain;charset=UTF-8',
            'next-action': nextAction
        };
        if (routerState) headers['next-router-state-tree'] = routerState;
        if (deploymentId) headers['x-deployment-id'] = deploymentId;

        const body = JSON.stringify(bodyPayload);
        Logger.debug('' + logLabel + ' fetch', {
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
            Logger.warn('' + logLabel + ' got 404 — server action stale, clearing cache');
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

    _opsParseRscJsonLines(text) {
        if (!text) return [];
        const lines = [];
        for (const line of text.split('\n')) {
            const t = line.trim();
            const m = t.match(/^(\d+):(\{.*\})\s*$/);
            if (!m) continue;
            try {
                lines.push({ lineId: m[1], obj: JSON.parse(m[2]) });
            } catch (_e) { /* skip malformed flight line */ }
        }
        return lines;
    },

    _opsExpertProfileUrl(expertId, credRefresh) {
        const id = String(expertId || '').trim();
        if (!id) return '';
        let url = opsFleetOrigin() + '/dashboard/data/experts/' + encodeURIComponent(id);
        if (credRefresh) url += '?' + OPS_EXPERT_CRED_REFRESH_QUERY + '=1';
        return url;
    },

    _loadOpsTeamSearchActionFromStorage() {
        try {
            const nextAction = Storage.getData(OPS_TEAM_SEARCH_ACTION_STORAGE_KEY, null);
            const routerState = Storage.getData(OPS_TEAM_SEARCH_ROUTER_STATE_STORAGE_KEY, null);
            if (nextAction) {
                this._opsTeamSearchActionCache = { nextAction, routerState: routerState || '' };
                Logger.debug('team search action hydrated from script storage (' + nextAction.slice(0, 12) + '…)');
            }
        } catch (e) {
            Logger.debug('team search action script storage hydration failed', e);
        }
    },

    _loadOpsTeamAddMemberActionFromStorage() {
        try {
            const nextAction = Storage.getData(OPS_TEAM_ADD_MEMBER_ACTION_STORAGE_KEY, null);
            const routerState = Storage.getData(OPS_TEAM_ADD_MEMBER_ROUTER_STATE_STORAGE_KEY, null);
            if (nextAction) {
                this._opsTeamAddMemberActionCache = { nextAction, routerState: routerState || '' };
                Logger.debug('team add-member action hydrated from script storage (' + nextAction.slice(0, 12) + '…)');
            }
        } catch (e) {
            Logger.debug('team add-member action script storage hydration failed', e);
        }
    },

    _reloadOpsTeamDashboardActionsFromStorage() {
        this._loadOpsTeamSearchActionFromStorage();
        this._loadOpsTeamAddMemberActionFromStorage();
        return !!this._opsTeamSearchActionCache.nextAction;
    },

    _ensureOpsSyncChannel() {
        if (this._opsSyncChannel) {
            return this._opsSyncChannel;
        }
        try {
            this._opsSyncChannel = new BroadcastChannel(OPS_SYNC_CHANNEL_NAME);
        } catch (e) {
            Logger.debug('BroadcastChannel unavailable', e);
            this._opsSyncChannel = null;
        }
        return this._opsSyncChannel;
    },

    _broadcastOpsSync(message) {
        try {
            const channel = this._ensureOpsSyncChannel();
            if (channel) {
                channel.postMessage(message);
            }
        } catch (e) {
            Logger.debug('ops sync broadcast failed', e);
        }
    },

    _subscribeOpsTeamDashboardActionSync() {
        if (this._opsSyncChannelSubscribed) {
            return;
        }
        const self = this;
        try {
            const channel = this._ensureOpsSyncChannel();
            if (!channel) {
                return;
            }
            channel.onmessage = (ev) => {
                const data = ev && ev.data;
                if (!data || !data.type) {
                    return;
                }
                if (data.type === 'teamSearchActionUpdated') {
                    self._loadOpsTeamSearchActionFromStorage();
                    Logger.debug('team search action synced from BroadcastChannel');
                    self._onOpsTeamCredRefreshComplete();
                } else if (data.type === 'teamAddMemberActionUpdated') {
                    self._loadOpsTeamAddMemberActionFromStorage();
                    Logger.debug('team add-member action synced from BroadcastChannel');
                } else if (data.type === 'credRefreshDone') {
                    self._onOpsTeamCredRefreshComplete();
                } else if (data.type === 'expertStatsActionUpdated') {
                    self._loadOpsExpertStatsActionFromStorage();
                    Logger.debug('expert stats action synced from BroadcastChannel');
                } else if (data.type === 'expertCredRefreshDone') {
                    self._loadOpsExpertStatsActionFromStorage();
                    self._onOpsExpertCredRefreshComplete();
                }
            };
            this._opsSyncChannelSubscribed = true;
            Logger.debug('team dashboard action BroadcastChannel sync listener installed');
        } catch (e) {
            Logger.debug('team dashboard action BroadcastChannel sync failed', e);
        }
    },

    _clearOpsTeamCredRefreshPending() {
        if (this._opsTeamCredRefreshTimeout != null) {
            const pageWindow = this._getOpsPageWindow();
            if (pageWindow) pageWindow.clearTimeout(this._opsTeamCredRefreshTimeout);
            this._opsTeamCredRefreshTimeout = null;
        }
        this._opsTeamCredRefreshPending = null;
    },

    _isOpsTeamCredRefreshTab() {
        try {
            const pageWindow = this._getOpsPageWindow();
            return new URL(pageWindow.location.href).searchParams.get(OPS_TEAM_CRED_REFRESH_QUERY) === '1';
        } catch (_e) {
            return false;
        }
    },

    _signalOpsTeamCredRefreshComplete() {
        this._broadcastOpsSync({ type: 'credRefreshDone' });
    },

    _tryCloseOpsTeamCredRefreshTab() {
        if (!this._isOpsTeamCredRefreshTab()) return;
        Logger.log('team cred refresh complete — closing Team tab');
        const pageWindow = this._getOpsPageWindow();
        pageWindow.setTimeout(() => {
            try {
                pageWindow.close();
            } catch (_e) { /* ignore — browser may block close */ }
        }, 300);
    },

    _setOpsTeamSearchStaleRetryStatusViaController(modal, message) {
        const tm = Context.teamMembers;
        if (tm && typeof tm.setTeamSearchStaleRetryStatus === 'function') {
            tm.setTeamSearchStaleRetryStatus(modal, message);
        }
    },

    _onOpsTeamCredRefreshComplete() {
        const pending = this._opsTeamCredRefreshPending;
        if (!pending) return;
        const modal = pending.modal;
        this._clearOpsTeamCredRefreshPending();
        this._reloadOpsTeamDashboardActionsFromStorage();
        if (!this._opsTeamSearchActionCache.nextAction) {
            this._setOpsTeamSearchStaleRetryStatusViaController(modal,
                'Credentials not ready yet — try Refresh credentials again.');
            Logger.warn('team cred refresh signaled but search action still missing');
            return;
        }
        this._setOpsTeamSearchStaleRetryStatusViaController(modal, 'Credentials refreshed — retrying search…');
        Logger.log('team cred refresh captured — auto-retrying search');
        const tm = Context.teamMembers;
        if (tm && typeof tm.handleTeamSearchCredentialRetry === 'function') {
            void tm.handleTeamSearchCredentialRetry(modal);
        }
    },

    _openOpsTeamPageForCredRefresh(modal) {
        this._clearOpsTeamCredRefreshPending();
        const pageWindow = this._getOpsPageWindow();
        const url = opsTeamSearchUrl() + '?' + OPS_TEAM_CRED_REFRESH_QUERY + '=1';
        const opened = pageWindow.open(url, '_blank', 'noopener,noreferrer');
        if (!opened) {
            if (modal) {
                this._setOpsTeamSearchStaleRetryStatusViaController(modal,
                    'Popup blocked — allow popups for Fleet, then try again.');
            }
            Logger.warn('team cred refresh tab blocked (popup blocker)');
            return null;
        }
        if (modal) {
            this._opsTeamCredRefreshPending = { modal, startedAt: Date.now() };
            this._setOpsTeamSearchStaleRetryStatusViaController(modal, 'Opening Team page…');
            const self = this;
            this._opsTeamCredRefreshTimeout = pageWindow.setTimeout(() => {
                if (!self._opsTeamCredRefreshPending) return;
                const pendingModal = self._opsTeamCredRefreshPending.modal;
                self._clearOpsTeamCredRefreshPending();
                self._setOpsTeamSearchStaleRetryStatusViaController(pendingModal,
                    'Credential refresh timed out — try Refresh credentials again.');
                Logger.warn('team cred refresh timed out');
            }, OPS_TEAM_CRED_REFRESH_TIMEOUT_MS);
        }
        Logger.log('team page opened for credential refresh');
        return opened;
    },

    _clearOpsExpertCredRefreshPending() {
        if (this._opsExpertCredRefreshTimeout != null) {
            const pageWindow = this._getOpsPageWindow();
            if (pageWindow) pageWindow.clearTimeout(this._opsExpertCredRefreshTimeout);
            this._opsExpertCredRefreshTimeout = null;
        }
        this._opsExpertCredRefreshPending = null;
    },

    _isOpsExpertCredRefreshTab() {
        try {
            const pageWindow = this._getOpsPageWindow();
            const url = new URL(pageWindow.location.href);
            if (!OPS_EXPERT_PATH_RE.test(url.pathname)) return false;
            return url.searchParams.get(OPS_EXPERT_CRED_REFRESH_QUERY) === '1';
        } catch (_e) {
            return false;
        }
    },

    _signalOpsExpertCredRefreshComplete() {
        this._broadcastOpsSync({ type: 'expertCredRefreshDone' });
    },

    _tryCloseOpsExpertCredRefreshTab() {
        if (!this._isOpsExpertCredRefreshTab()) return;
        Logger.log('expert cred refresh complete — closing expert profile tab');
        const pageWindow = this._getOpsPageWindow();
        pageWindow.setTimeout(() => {
            try {
                pageWindow.close();
            } catch (_e) { /* ignore — browser may block close */ }
        }, 300);
    },

    _onOpsExpertCredRefreshComplete(retryAttempt) {
        const pending = this._opsExpertCredRefreshPending;
        if (!pending) return;
        const modal = pending.modal;

        if (!this._opsExpertStatsActionCache.nextAction) {
            this._loadOpsExpertStatsActionFromStorage();
        }
        if (!this._opsExpertStatsActionCache.nextAction) {
            if (!retryAttempt) {
                const self = this;
                const pageWindow = this._getOpsPageWindow();
                if (pageWindow) {
                    pageWindow.setTimeout(() => {
                        if (!self._opsExpertCredRefreshPending) return;
                        self._onOpsExpertCredRefreshComplete(true);
                    }, 100);
                    return;
                }
            }
            this._clearOpsExpertCredRefreshPending();
            Logger.warn('expert cred refresh signaled but stats action still missing');
            return;
        }

        this._clearOpsExpertCredRefreshPending();

        const tm = Context.teamMembers;
        if (tm && typeof tm.hasMemberSearchCache === 'function' && tm.hasMemberSearchCache()) {
            if (typeof tm.clearExpertStatsCache === 'function') tm.clearExpertStatsCache();
            Logger.log('expert cred refresh captured — re-hydrating stats for visible members');
            if (typeof tm.hydrateStatsForVisible === 'function') {
                void tm.hydrateStatsForVisible(modal);
            }
            return;
        }

        Logger.log('expert cred refresh captured — no results on screen');
    },

    _openOpsExpertProfileForCredRefresh(modal, expertId) {
        const id = String(expertId || '').trim();
        if (!id) return null;
        this._clearOpsExpertCredRefreshPending();
        const pageWindow = this._getOpsPageWindow();
        const url = this._opsExpertProfileUrl(id, true);
        const opened = pageWindow.open(url, '_blank', 'noopener,noreferrer');
        if (!opened) {
            Logger.warn('expert cred refresh tab blocked (popup blocker)');
            return null;
        }
        if (modal) {
            this._opsExpertCredRefreshPending = { modal, expertId: id, startedAt: Date.now() };
            const self = this;
            this._opsExpertCredRefreshTimeout = pageWindow.setTimeout(() => {
                if (!self._opsExpertCredRefreshPending) return;
                self._clearOpsExpertCredRefreshPending();
                Logger.warn('expert cred refresh timed out');
            }, OPS_EXPERT_CRED_REFRESH_TIMEOUT_MS);
        }
        Logger.log('expert profile opened for stats credential refresh (' + id.slice(0, 8) + '…)');
        return opened;
    },

    _persistOpsTeamSearchAction({ nextAction, routerState }) {
        if (!nextAction) return;
        const changed = nextAction !== this._opsTeamSearchActionCache.nextAction;
        this._opsTeamSearchActionCache = { nextAction, routerState: routerState || '' };
        try {
            Storage.setData(OPS_TEAM_SEARCH_ACTION_STORAGE_KEY, nextAction);
            if (routerState) {
                Storage.setData(OPS_TEAM_SEARCH_ROUTER_STATE_STORAGE_KEY, routerState);
            }
        } catch (e) {
            Logger.debug('team search action persist failed', e);
        }
        if (changed) {
            Logger.log('team search action updated (' + nextAction.slice(0, 12) + '…)');
            this._broadcastOpsSync({ type: 'teamSearchActionUpdated' });
        }
    },

    _clearOpsTeamSearchActionCache() {
        this._opsTeamSearchActionCache = { nextAction: null, routerState: null };
        try {
            Storage.deleteData(OPS_TEAM_SEARCH_ACTION_STORAGE_KEY);
            Storage.deleteData(OPS_TEAM_SEARCH_ROUTER_STATE_STORAGE_KEY);
        } catch (e) {
            Logger.debug('team search action cache clear failed', e);
        }
        Logger.log('team search action cache cleared (will re-discover on next search)');
    },

    _persistOpsTeamAddMemberAction({ nextAction, routerState }) {
        if (!nextAction) return;
        const changed = nextAction !== this._opsTeamAddMemberActionCache.nextAction;
        this._opsTeamAddMemberActionCache = { nextAction, routerState: routerState || '' };
        try {
            Storage.setData(OPS_TEAM_ADD_MEMBER_ACTION_STORAGE_KEY, nextAction);
            if (routerState) {
                Storage.setData(OPS_TEAM_ADD_MEMBER_ROUTER_STATE_STORAGE_KEY, routerState);
            }
        } catch (e) {
            Logger.debug('team add-member action persist failed', e);
        }
        if (changed) {
            Logger.log('team add-member action updated (' + nextAction.slice(0, 12) + '…)');
            this._broadcastOpsSync({ type: 'teamAddMemberActionUpdated' });
        }
    },

    _clearOpsTeamAddMemberActionCache() {
        this._opsTeamAddMemberActionCache = { nextAction: null, routerState: null };
        try {
            Storage.deleteData(OPS_TEAM_ADD_MEMBER_ACTION_STORAGE_KEY);
            Storage.deleteData(OPS_TEAM_ADD_MEMBER_ROUTER_STATE_STORAGE_KEY);
        } catch (e) {
            Logger.debug('team add-member action cache clear failed', e);
        }
        Logger.log('team add-member action cache cleared (will re-discover on next add)');
    },

    _loadOpsTaskDataActionFromStorage() {
        try {
            const nextAction = Storage.getData(OPS_TASK_DATA_ACTION_STORAGE_KEY, null);
            const routerState = Storage.getData(OPS_TASK_DATA_ROUTER_STATE_STORAGE_KEY, null);
            if (nextAction) {
                this._opsTaskDataActionCache = { nextAction, routerState: routerState || '' };
                Logger.debug('task data action hydrated from script storage (' + nextAction.slice(0, 12) + '…)');
            }
        } catch (e) {
            Logger.debug('task data action script storage hydration failed', e);
        }
    },

    _persistOpsTaskDataAction({ nextAction, routerState }) {
        if (!nextAction) return;
        const changed = nextAction !== this._opsTaskDataActionCache.nextAction;
        this._opsTaskDataActionCache = { nextAction, routerState: routerState || '' };
        try {
            Storage.setData(OPS_TASK_DATA_ACTION_STORAGE_KEY, nextAction);
            if (routerState) {
                Storage.setData(OPS_TASK_DATA_ROUTER_STATE_STORAGE_KEY, routerState);
            }
        } catch (e) {
            Logger.debug('task data action persist failed', e);
        }
        if (changed) {
            Logger.log('task data action updated (' + nextAction.slice(0, 12) + '…)');
        }
    },

    _clearOpsTaskDataActionCache() {
        this._opsTaskDataActionCache = { nextAction: null, routerState: null };
        try {
            Storage.deleteData(OPS_TASK_DATA_ACTION_STORAGE_KEY);
            Storage.deleteData(OPS_TASK_DATA_ROUTER_STATE_STORAGE_KEY);
        } catch (e) {
            Logger.debug('task data action cache clear failed', e);
        }
        Logger.log('task data action cache cleared (will re-discover on next task page load)');
    },

    async _fetchOpsTaskDataRsc(taskKey, taskUuid) {
        const key = String(taskKey || '').trim();
        const uuid = String(taskUuid || '').trim();
        if (!key || !uuid) return '';
        if (!this._opsTaskDataActionCache.nextAction) {
            Logger.debug('task data RSC skipped — no captured next-action for ' + key);
            return '';
        }

        const pageWindow = this._getOpsPageWindow();
        const requestFetch = pageWindow.fetch || fetch;
        const deploymentId = this._getOpsNextDeploymentId(pageWindow);
        const { nextAction, routerState } = this._opsTaskDataActionCache;
        const url = opsFleetOrigin() + '/dashboard/data/tasks/' + encodeURIComponent(key);

        const headers = {
            accept: 'text/x-component',
            'content-type': 'text/plain;charset=UTF-8',
            'next-action': nextAction
        };
        if (routerState) headers['next-router-state-tree'] = routerState;
        if (deploymentId) headers['x-deployment-id'] = deploymentId;

        const body = JSON.stringify([uuid]);
        Logger.debug('task data RSC fetch', {
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
            Logger.warn('task data RSC got 404 — server action stale, clearing cache');
            this._clearOpsTaskDataActionCache();
            return '';
        }
        if (!res.ok) {
            Logger.warn('task data RSC HTTP ' + res.status + ': ' + text.slice(0, 200));
            return '';
        }
        return text;
    },

    _subscribeOpsTeamDashboardActionCapture() {
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.debug('NetworkObserver unavailable; passive team action capture skipped');
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
                    const credRefreshTab = self._isOpsTeamCredRefreshTab();
                    if (nextAction !== self._opsTeamSearchActionCache.nextAction) {
                        self._persistOpsTeamSearchAction({ nextAction, routerState: routerState || '' });
                        Logger.debug('team search action captured from live traffic (' + nextAction.slice(0, 12) + '…)');
                    }
                    if (credRefreshTab) {
                        self._signalOpsTeamCredRefreshComplete();
                        self._tryCloseOpsTeamCredRefreshTab();
                    }
                } else if (kind === 'add-member') {
                    if (nextAction !== self._opsTeamAddMemberActionCache.nextAction) {
                        self._persistOpsTeamAddMemberAction({ nextAction, routerState: routerState || '' });
                        Logger.debug('team add-member action captured from live traffic (' + nextAction.slice(0, 12) + '…)');
                    }
                }
            }
        });
        Logger.debug('team dashboard action passive watcher registered');
    },

    _subscribeOpsTaskDataActionCapture() {
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.debug('NetworkObserver unavailable; passive task data action capture skipped');
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
                    Logger.debug('task data action captured from live traffic (' + nextAction.slice(0, 12) + '…)');
                }
            }
        });
        Logger.debug('task data action passive watcher registered');
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

    _ensureOpsAlertBannerStyles() {
        if (Context.uiLib && typeof Context.uiLib.ensureAlertBannerStyles === 'function') {
            Context.uiLib.ensureAlertBannerStyles();
        }
    },

    _opsAlertBannerClasses() {
        return (Context.uiLib && Context.uiLib.ALERT_BANNER_CLASSES) || {
            root: 'fleet-ui-alert-banner',
            danger: 'fleet-ui-alert-banner--danger',
            amber: 'fleet-ui-alert-banner--amber',
            amberSoft: 'fleet-ui-alert-banner--amber-soft',
            title: 'fleet-ui-alert-banner__title',
            body: 'fleet-ui-alert-banner__body',
            footer: 'fleet-ui-alert-banner__footer',
            btnSecondary: 'fleet-ui-alert-banner__btn-secondary',
            btnPrimary: 'fleet-ui-alert-banner__btn-primary'
        };
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

        Logger.debug('team search fetch', {
            teamId: teamId.slice(0, 8) + '...',
            userId: userId.slice(0, 8) + '...',
            query: query || '(empty)',
            offset: pageOffset,
            action: nextAction.slice(0, 12) + '…',
            hasDeploymentId: !!deploymentId
        });

        const res = await requestFetch.call(pageWindow, opsTeamSearchUrl(), {
            method: 'POST',
            headers,
            body,
            credentials: 'include',
            signal: signal || undefined
        });

        const text = await res.text().catch(() => '');

        if (res.status === 404) {
            Logger.warn('team search got 404 — server action stale, clearing cache');
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
        Logger.debug('' + logLabel + ' fetch', {
            action: nextAction.slice(0, 12) + '…',
            hasDeploymentId: !!deploymentId
        });

        const res = await requestFetch.call(pageWindow, opsTeamSearchUrl(), {
            method: 'POST',
            headers,
            body,
            credentials: 'include'
        });

        const text = await res.text().catch(() => '');

        if (res.status === 404) {
            Logger.warn('' + logLabel + ' got 404 — server action stale, clearing cache');
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
        Logger.debug('added ' + email + ' to team ' + teamId.slice(0, 8) + '… (' + perms.length + ' permissions)');
    },

    async _fetchOpsTeamSearchAllMembers(teamId, userId, query, sessionId, signal) {
        const allMembers = [];
        const seenIds = new Set();
        let offset = 0;
        let hasMore = true;
        let pageCount = 0;
        const maxPages = 200;

        while (hasMore && pageCount < maxPages) {
            if (sessionId != null && Context.teamMembers && !Context.teamMembers.isSearchSessionActive(sessionId)) {
                Logger.debug('team search pagination stopped — session superseded');
                break;
            }
            if (signal && signal.aborted) break;

            pageCount++;
            let raw;
            try {
                raw = await this._fetchOpsTeamSearchPage(teamId, userId, query, offset, signal);
            } catch (e) {
                if (e && (e.name === 'AbortError' || e.code === 20)) {
                    Logger.debug('team search page fetch aborted');
                    break;
                }
                throw e;
            }

            if (sessionId != null && Context.teamMembers && !Context.teamMembers.isSearchSessionActive(sessionId)) {
                Logger.debug('team search pagination stopped after fetch — session superseded');
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
                Logger.debug('team search pagination stopped — page had no new members');
                break;
            }

            const fullPage = pageMembers.length >= OPS_TEAM_SEARCH_PAGE_LIMIT;
            hasMore = parsed.hasMore === true && fullPage;
            offset += OPS_TEAM_SEARCH_PAGE_LIMIT;

            if (hasMore) {
                Logger.debug('team search page ' + pageCount + ' fetched ' + pageMembers.length +
                    ' members (' + newCount + ' new, total ' + allMembers.length + ', hasMore)');
            }
        }

        return allMembers;
    },

    _opsDashBtnClass(variant, size) {
        if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
            return Context.uiLib.btnClass(variant, size);
        }
        const dash = Context.dashboard;
        if (dash && typeof dash.dashBtnClass === 'function') return dash.dashBtnClass(variant, size);
        return 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size;
    },

    _opsEscapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _syncOpsToggleVisual(checkbox) {
        if (!checkbox) return;
        const slider = checkbox.nextElementSibling;
        if (!slider) return;
        const knob = slider.querySelector('span');
        const isChecked = checkbox.checked;
        const onColor = slider.dataset.wfOnColor || '#6366f1';
        const c = (Context.uiLib && typeof Context.uiLib.chromeColors === 'function')
            ? Context.uiLib.chromeColors()
            : { hover: '#f0f0f0' };
        slider.style.backgroundColor = isChecked ? onColor : c.hover;
        if (knob) {
            const knobLeftOn = slider.dataset.wfKnobLeftOn != null ? slider.dataset.wfKnobLeftOn + 'px' : '17px';
            const knobLeftOff = slider.dataset.wfKnobLeftOff != null ? slider.dataset.wfKnobLeftOff + 'px' : '3px';
            knob.style.left = isChecked ? knobLeftOn : knobLeftOff;
        }
    },

    _injectOpsSettingsButtonStyles() {
        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles('#wf-settings-modal');
        }
    },

    _injectOpsSpinnerStyle() {
        if (Context.uiLib) {
            if (typeof Context.uiLib.ensureStyles === 'function') Context.uiLib.ensureStyles();
            if (typeof Context.uiLib.ensureButtonStyles === 'function') {
                Context.uiLib.ensureButtonStyles('#wf-dash-modal');
                Context.uiLib.ensureButtonStyles('#wf-settings-modal');
            }
            if (typeof Context.uiLib.ensureAlertBannerStyles === 'function') {
                Context.uiLib.ensureAlertBannerStyles();
            }
        }
        if (document.getElementById('wf-ops-spinner-style')) return;
        const style = document.createElement('style');
        style.id = 'wf-ops-spinner-style';
        style.textContent = [
            '.wf-ops-member-details:not([open]) .wf-ops-member-edit-actions{display:none!important;}',
            '.wf-ops-member-details[open] .wf-ops-member-edit-actions{display:flex!important;}',
            '.wf-ops-profile-link-btn{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;text-decoration:none;}',
            '.wf-ops-staged-add{background:rgba(34,197,94,0.14)!important;}',
            '.wf-ops-staged-remove{background:rgba(239,68,68,0.14)!important;}',
            '.wf-ops-edit-item-btn{cursor:pointer;width:100%;text-align:left;border:none;background:transparent;font:inherit;padding:2px 4px;border-radius:3px;display:block;line-height:1.35;transition:background 0.12s;}',
            '.wf-ops-edit-item-btn:not(:disabled):hover{background:rgba(79,70,229,0.08)!important;}',
            '.wf-ops-edit-item-btn:disabled{cursor:default!important;}',
            '#wf-dash-modal #wf-ops-verifier-output-wrap,#wf-dash-modal #wf-ops-verifier-output-wrap pre,#wf-dash-modal #wf-ops-verifier-output.hljs{background:transparent!important;}',
            '#wf-dash-modal mark.wf-ops-verifier-hit{background:color-mix(in srgb,#facc15 40%,transparent);color:unset;border-radius:2px;padding:0 1px;}',
            '#wf-dash-modal mark.wf-ops-verifier-hit-active{background:#facc15!important;outline:1px solid #ca8a04;}',
            '#wf-dash-modal a.wf-dash-header-btn.wf-ops-grade-header-link{text-decoration:none!important;}',
            '.wf-ops-member-stats-grid{display:grid;grid-template-columns:max-content max-content max-content max-content;column-gap:10px;row-gap:2px;}',
            '.wf-ops-member-stats-grid--plain{grid-template-columns:1fr;}'
        ].join('');
        document.head.appendChild(style);
    },

    _parseOpsTeamSearchResponse(text) {
        if (!text) return null;
        const lines = this._opsParseRscJsonLines(text);
        for (const { lineId, obj } of lines) {
            if (lineId === '1') return obj;
        }
        return lines.length > 0 ? lines[0].obj : null;
    },

    _onOpsModalClosed() {
        const tm = Context.teamMembers;
        if (tm && typeof tm.onModalClosed === 'function') {
            tm.onModalClosed();
        }
        const vf = Context.verifierFetcher;
        if (vf && typeof vf.onModalClosed === 'function') {
            vf.onModalClosed();
        }
    },

    _opsEscapeAttr(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
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
            Logger.debug('orchestrator-private ' + res.status + ' body: ' + text.slice(0, 400));
            throw new Error('HTTP ' + res.status + (text ? ': ' + text.slice(0, 200) : ''));
        }
        return res.json().catch(() => null);
    },

    async _opsRemoveMemberFromTeam(teamId, email) {
        if (!teamId || !email) throw new Error('Missing team or email for bulk remove');
        await this._opsPostOrchestratorPrivate(opsTeamBulkRemoveUrl(), {
            team_id: teamId,
            emails: [email]
        });
        Logger.debug('removed ' + email + ' from team ' + teamId.slice(0, 8) + '…');
    },

    async _opsModifyMemberPermission(profileId, permission, action) {
        if (!profileId || !permission || !action) {
            throw new Error('Missing profile, permission, or action');
        }
        await this._opsPostOrchestratorPrivate(opsTeamUserPermissionsUrl(), {
            profile_id: profileId,
            permission,
            action
        });
        Logger.debug('permission ' + action + ' ' + permission + ' for ' + profileId.slice(0, 8) + '…');
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
            Logger.warn('orchestrator skipped — no Fleet user JWT (open Fleet on a data page)');
            return null;
        }
        const versionId = String(resolved.verifierVersionId || resolved.versionId || '').trim();
        if (!versionId || !OPS_UUID_RE.test(versionId)) {
            Logger.debug('orchestrator skipped — no verifier_version_id');
            return null;
        }
        let teamId = resolved.teamId;
        if (!teamId) {
            Logger.debug('orchestrator — no teamId in resolved, attempting team discovery');
            teamId = await this._resolveOpsTeamId(pageWindow);
        }
        if (!teamId) {
            Logger.debug('orchestrator — no team_id after discovery, will attempt without it');
        }
        const requestFetch = pageWindow.fetch || fetch;
        const url = 'https://orchestrator.fleetai.com/v1/verifiers/versions/' + encodeURIComponent(versionId);
        const requestHeaders = { accept: 'application/json', 'x-jwt-token': jwt };
        if (teamId) requestHeaders['x-team-id'] = teamId;
        Logger.debug('orchestrator fetch ' + url, {
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
                Logger.warn('orchestrator HTTP ' + res.status, {
                    verifierVersionId: versionId,
                    teamId: teamId || '(none)',
                    body: text.slice(0, 200)
                });
                return null;
            }
            const body = await res.json().catch(() => null);
            Logger.debug('orchestrator response keys', body ? Object.keys(body).join(', ') : 'null');
            const parsedSource = this._extractOpsOrchestratorVerifierSource(body);
            if (!parsedSource || !parsedSource.source) {
                Logger.debug('orchestrator response had no display_src');
                return null;
            }
            Logger.debug('orchestrator got source (' + parsedSource.source.length + ' chars) v' + parsedSource.version);
            return {
                ...resolved,
                teamId: teamId || resolved.teamId,
                version: parsedSource.version,
                versionId: parsedSource.versionId || versionId,
                verifierVersionId: versionId,
                createdAt: parsedSource.createdAt,
                source: parsedSource.source
            };
        } catch (e) {
            Logger.debug('orchestrator fetch threw', e);
            return null;
        }
    },

    _formatOpsTaskVerifierVersionLabel(entry) {
        const n = entry && entry.displayVersionNo != null ? entry.displayVersionNo : null;
        if (n == null) return entry && entry.isCurrent ? 'Current' : 'Unknown';
        return entry.isCurrent ? ('v' + n + ' — current') : ('v' + n);
    },

    async _listOpsTaskVerifierVersionOptions(parsed) {
        const out = {
            taskId: '',
            taskKey: '',
            currentVersionId: '',
            options: []
        };
        if (!parsed || (!parsed.taskKey && !parsed.taskId)) return out;

        let taskRow = null;
        try {
            const params = { select: 'id,key,current_version_id,team_id', limit: 1 };
            if (parsed.taskKey) params.key = 'eq.' + parsed.taskKey;
            else params.id = 'eq.' + parsed.taskId;
            const rows = await this._opsPostgrestQuery('tasks.select_verifier_lookup', params);
            taskRow = Array.isArray(rows) ? rows[0] : rows;
        } catch (e) {
            Logger.debug('task version options lookup failed', e);
            return out;
        }
        if (!taskRow || !taskRow.id) return out;

        out.taskId = taskRow.id || '';
        out.taskKey = taskRow.key || parsed.taskKey || '';
        out.currentVersionId = taskRow.current_version_id || '';

        let rawVersions = [];
        try {
            const rows = await this._opsPostgrestQuery('task_versions.select_history', {
                task_id: 'eq.' + taskRow.id,
                order: 'version_no.asc',
                limit: '100'
            });
            rawVersions = Array.isArray(rows) ? rows : (rows ? [rows] : []);
        } catch (e) {
            Logger.debug('task version history for options failed', e);
            return out;
        }

        const lib = Context.dashboardLib;
        const display = lib && typeof lib.computeDisplayVersions === 'function'
            ? lib.computeDisplayVersions(rawVersions)
            : [];
        const currentId = String(out.currentVersionId || '');
        const mapped = [];
        display.forEach((entry) => {
            const pin = entry && entry.verifierVersionId ? String(entry.verifierVersionId).trim() : '';
            if (!pin || !OPS_UUID_RE.test(pin)) return;
            const isCurrent = currentId && String(entry.id || '') === currentId;
            mapped.push({
                value: pin,
                displayVersionNo: entry.displayVersionNo,
                isCurrent,
                taskVersionId: entry.id || '',
                verifierId: entry.verifierId || ''
            });
        });

        let current = mapped.find((o) => o.isCurrent) || null;
        if (!current && mapped.length) {
            current = mapped.reduce((best, entry) => {
                const n = entry.displayVersionNo != null ? Number(entry.displayVersionNo) : -1;
                const bestN = best && best.displayVersionNo != null ? Number(best.displayVersionNo) : -1;
                return n >= bestN ? entry : best;
            }, null);
            if (current) current.isCurrent = true;
        }
        const currentPin = current ? String(current.value || '') : '';
        const others = mapped
            .filter((o) => o && String(o.value || '') !== currentPin)
            .sort((a, b) => {
                const aN = a.displayVersionNo != null ? Number(a.displayVersionNo) : 0;
                const bN = b.displayVersionNo != null ? Number(b.displayVersionNo) : 0;
                return bN - aN;
            });
        const ordered = current ? [current, ...others] : others;
        out.options = ordered.map((entry) => ({
            ...entry,
            label: this._formatOpsTaskVerifierVersionLabel({
                displayVersionNo: entry.displayVersionNo,
                isCurrent: Boolean(entry.isCurrent)
            })
        }));
        return out;
    },

    async _fetchOpsVerifierCodeForVersion(resolved, versionId) {
        const pin = String(versionId || resolved.verifierVersionId || '').trim();
        const request = {
            ...resolved,
            verifierVersionId: pin || resolved.verifierVersionId || ''
        };
        const orchestratorResult = await this._fetchOpsVerifierCodeFromOrchestrator(request);
        if (orchestratorResult) return orchestratorResult;

        const params = { limit: 1 };
        if (pin && OPS_UUID_RE.test(pin)) {
            params.id = 'eq.' + pin;
        } else if (resolved.verifierId) {
            params.verifier_id = 'eq.' + resolved.verifierId;
            params.order = 'version.desc';
        } else {
            throw new Error('No verifier version id available for fetch.');
        }
        Logger.debug('verifier_versions fetch params', JSON.stringify(params));
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
            throw new Error('No verifier version found for ' + (pin || resolved.verifierId || 'unknown') + '. ' + hint);
        }
        if (!row.display_src) {
            throw new Error('Verifier version ' + (row.version != null ? row.version : '?') + ' has no display_src.');
        }
        return {
            ...resolved,
            version: row.version,
            versionId: row.id,
            verifierVersionId: row.id,
            createdAt: row.created_at,
            source: row.display_src
        };
    },

    async _fetchOpsVerifierCode(parsed) {
        Logger.debug('verifier fetch start', {
            taskKey: parsed.taskKey || '(none)',
            taskId: parsed.taskId || '(none)',
            verifierId: parsed.verifierId || '(none)',
            verifierKey: parsed.verifierKey || '(none)',
            teamId: parsed.teamId || '(none)',
            verifierVersionId: parsed.verifierVersionId || '(none)'
        });
        const resolved = await this._resolveOpsVerifierId(parsed);
        Logger.debug('verifier resolved', {
            verifierId: resolved.verifierId || '(none)',
            verifierKey: resolved.verifierKey || '(none)',
            teamId: resolved.teamId || '(none)',
            verifierVersionId: resolved.verifierVersionId || '(none)'
        });

        let versionId = String(parsed.verifierVersionId || resolved.verifierVersionId || '').trim();
        if (!versionId || !OPS_UUID_RE.test(versionId)) {
            if (parsed.taskKey || parsed.taskId || resolved.taskId || resolved.taskKey) {
                const optionPayload = await this._listOpsTaskVerifierVersionOptions({
                    taskKey: resolved.taskKey || parsed.taskKey,
                    taskId: resolved.taskId || parsed.taskId
                });
                const pinned = (optionPayload.options || []).filter((o) => o && o.value);
                const currentPinned = pinned.find((o) => o.isCurrent);
                versionId = (currentPinned && currentPinned.value)
                    || (pinned.length ? pinned[0].value : '');
            }
        }
        if (!versionId || !OPS_UUID_RE.test(versionId)) {
            throw new Error(
                'No verifier version id for ' + (resolved.verifierId || resolved.verifierKey || 'this task') + '.'
            );
        }
        const result = await this._fetchOpsVerifierCodeForVersion(
            { ...resolved, verifierVersionId: versionId },
            versionId
        );

        return {
            ...result,
            selectedVersion: result.verifierVersionId || result.versionId || versionId,
            displayVersionNo: parsed.displayVersionNo != null ? parsed.displayVersionNo : null
        };
    },

    _clearOpsCopyButtonFeedback(button) {
        if (Context.buttonFeedback && typeof Context.buttonFeedback.clear === 'function') {
            Context.buttonFeedback.clear(button);
        }
    },

    _showOpsCopySuccessFlash(button) {
        if (Context.buttonFeedback && typeof Context.buttonFeedback.flashSuccess === 'function') {
            Context.buttonFeedback.flashSuccess(button, { restoreStyles: false });
        }
    },

    _showOpsCopyFailurePulse(button) {
        if (Context.buttonFeedback && typeof Context.buttonFeedback.flashFailure === 'function') {
            Context.buttonFeedback.flashFailure(button, { restoreStyles: false });
        }
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

    _getVerifierTextSegmentsInRange(codeEl, rangeStart, rangeEnd) {
        const segments = [];
        if (!codeEl || rangeEnd <= rangeStart) return segments;
        const walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT, null);
        let offset = 0;
        let node;
        while ((node = walker.nextNode())) {
            const nodeStart = offset;
            const nodeEnd = offset + node.length;
            if (nodeEnd <= rangeStart || nodeStart >= rangeEnd) {
                offset = nodeEnd;
                continue;
            }
            segments.push({
                node,
                segStart: Math.max(rangeStart, nodeStart) - nodeStart,
                segEnd: Math.min(rangeEnd, nodeEnd) - nodeStart
            });
            offset = nodeEnd;
        }
        return segments;
    },

    _wrapVerifierTextNodeSegment(textNode, segStart, segEnd, hitIndex, isActive) {
        if (!textNode || segEnd <= segStart) return;
        const text = textNode.textContent || '';
        const before = text.slice(0, segStart);
        const match = text.slice(segStart, segEnd);
        const after = text.slice(segEnd);
        const parent = textNode.parentNode;
        if (!parent || !match) return;

        const mark = document.createElement('mark');
        mark.className = 'wf-ops-verifier-hit' + (isActive ? ' wf-ops-verifier-hit-active' : '');
        mark.setAttribute('data-wf-ops-verifier-hit', String(hitIndex));
        mark.textContent = match;

        if (before) parent.insertBefore(document.createTextNode(before), textNode);
        parent.insertBefore(mark, textNode);
        if (after) parent.insertBefore(document.createTextNode(after), textNode);
        parent.removeChild(textNode);
    },

    _applyVerifierSearchMarksInDom(codeEl, matchStarts, needleLength, activeIndex) {
        if (!codeEl || !matchStarts || matchStarts.length === 0 || !needleLength) {
            return Math.max(0, activeIndex || 0);
        }
        const safeActive = Math.max(0, Math.min(activeIndex, matchStarts.length - 1));
        const sorted = matchStarts
            .map((start, idx) => ({ start, idx }))
            .sort((a, b) => b.start - a.start);

        sorted.forEach(({ start, idx }) => {
            const rangeEnd = start + needleLength;
            const segments = this._getVerifierTextSegmentsInRange(codeEl, start, rangeEnd);
            for (let i = segments.length - 1; i >= 0; i--) {
                const seg = segments[i];
                this._wrapVerifierTextNodeSegment(
                    seg.node,
                    seg.segStart,
                    seg.segEnd,
                    idx,
                    idx === safeActive
                );
            }
        });
        return safeActive;
    },

    _setVerifierContentMatchActive(output, activeIndex) {
        if (!output) return;
        output.querySelectorAll('.wf-ops-verifier-hit').forEach((el) => {
            el.classList.remove('wf-ops-verifier-hit-active');
        });
        output.querySelectorAll('[data-wf-ops-verifier-hit="' + activeIndex + '"]').forEach((el) => {
            el.classList.add('wf-ops-verifier-hit-active');
        });
    },

    _scrollVerifierActiveContentMatchInElement(codeEl) {
        if (!codeEl) return;
        const active = codeEl.querySelector('.wf-ops-verifier-hit-active');
        if (active && typeof active.scrollIntoView === 'function') {
            active.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
    },

    async _renderVerifierCodeElement(codeEl, options) {
        const text = options && options.text != null ? options.text : '';
        const searchState = (options && options.searchState) || { query: '', index: 0, matchStarts: [] };
        const query = (searchState.query || '').trim();

        if (!codeEl) return searchState;

        if (Context.highlightJs && typeof Context.highlightJs.highlightCodeElement === 'function') {
            await Context.highlightJs.highlightCodeElement(codeEl, { text, language: 'python' });
        } else if (Context.highlightJs && typeof Context.highlightJs.setPlainCode === 'function') {
            Context.highlightJs.setPlainCode(codeEl, text);
        } else {
            codeEl.textContent = text;
            codeEl.className = text ? 'language-python' : 'language-plaintext';
        }

        if (query) {
            const matchStarts = this._findVerifierContentMatchStarts(text, query);
            searchState.matchStarts = matchStarts;
            searchState.index = this._applyVerifierSearchMarksInDom(
                codeEl,
                matchStarts,
                query.length,
                searchState.index
            );
        } else {
            searchState.matchStarts = [];
            searchState.index = 0;
        }
        return searchState;
    },

    async _stepVerifierContentMatchInElement(codeEl, searchState, delta, rerender) {
        const search = searchState || { query: '', index: 0, matchStarts: [] };
        const count = search.matchStarts ? search.matchStarts.length : 0;
        if (!count || !delta) return search;
        search.index = (search.index + delta + count) % count;
        if (codeEl && codeEl.querySelector('.wf-ops-verifier-hit')) {
            this._setVerifierContentMatchActive(codeEl, search.index);
            return search;
        }
        if (typeof rerender === 'function') {
            await rerender();
        }
        return search;
    },

    _captureOpsTabState(modal) {
        if (!modal) return;
        if (!this._opsTabState) this._opsTabState = {};
        this._captureOpsTaskLinkState(modal);
        const tm = Context.teamMembers;
        if (tm && typeof tm.captureTeamTabState === 'function') {
            tm.captureTeamTabState(modal);
        }
        const vf = Context.verifierFetcher;
        if (vf && typeof vf.captureVerifierTabState === 'function') {
            vf.captureVerifierTabState(modal);
        }
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
        const tm = Context.teamMembers;
        if (tm && typeof tm.restoreTeamTabState === 'function') {
            tm.restoreTeamTabState(modal);
        }
        const vf = Context.verifierFetcher;
        if (vf && typeof vf.restoreVerifierTabState === 'function') {
            vf.restoreVerifierTabState(modal);
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
            Logger.warn('password empty');
            return false;
        }

        const ok = await this._verifyOpsPassword(password);
        if (!ok) {
            this._setOpsPasswordError(modal, 'Incorrect password.');
            Logger.warn('password rejected');
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
        Logger.log('password saved on device');
        this._persistOpsPasswordHashSeen(this._getOpsPasswordHash());
        void this._loadOpsSecrets(true);
        if (typeof Context.ensureOpsDashboardPluginsLoaded === 'function') {
            try {
                await Context.ensureOpsDashboardPluginsLoaded();
            } catch (e) {
                Logger.warn('ensureOpsDashboardPluginsLoaded after unlock failed', e);
            }
        }
        if (settingsPlugin && typeof settingsPlugin.rebuildSettingsTabRow === 'function') {
            settingsPlugin.rebuildSettingsTabRow(modal, null, { keepCurrentPane: true });
        }
        if (settingsPlugin && typeof settingsPlugin.syncOpsRefreshBanner === 'function') {
            settingsPlugin.syncOpsRefreshBanner(modal);
        }
        this._syncOpsSettingsSubmoduleVisibility(modal);
        this._syncOpsDashboardIncompleteMessage(modal);
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
        Logger.debug('cleared invalid stored password');
    },

    _renderOpsSettingsSection() {
        const opsWantsEnabled = this._getOpsTabWanted();
        const opsHasStoredPassword = this._hasOpsStoredPassword();
        const hostAllowsDashboard = this._isOpsDashboardAllowedOnHost();
        const switchHTML = this._renderOpsSwitchHTML('wf-ops-tab-enabled', opsWantsEnabled);
        const openOnSettings = this._getOpsDashboardOpenOnSettings();
        const submoduleSwitchHTML = this._renderOpsSubSwitchHTML('wf-ops-dashboard-open-on-settings', openOnSettings);
        const enableCardDisplay = opsHasStoredPassword ? 'block' : 'none';
        const passwordPanelDisplay = opsHasStoredPassword ? 'none' : 'block';
        const suboptionsDisplay = opsHasStoredPassword && opsWantsEnabled && hostAllowsDashboard ? 'block' : 'none';
        const openDashboardBtnDisplay = opsHasStoredPassword && opsWantsEnabled && hostAllowsDashboard ? 'block' : 'none';
        const c = (Context.uiLib && typeof Context.uiLib.chromeColors === 'function')
            ? Context.uiLib.chromeColors()
            : { bg: '#ffffff', card: '#fafafa', border: '#e5e5e5', fg: '#333333', muted: '#666666' };
        const ab = this._opsAlertBannerClasses();
        const externalHostNotice = hostAllowsDashboard
            ? ''
            : `<div id="wf-ops-external-host-notice" class="${ab.root} ${ab.amber}" style="margin-top: 10px; margin-bottom: 0; padding: 10px 12px; font-size: 12px; line-height: 1.45;">
                    Ops Dashboard cannot open on external env instances. Open it from fleetai.com.
                </div>`;
        this._ensureOpsAlertBannerStyles();
        return `
            <div style="margin-bottom: 20px;">
                <div id="wf-ops-enable-wrap" style="display: ${enableCardDisplay};">
                <div style="padding: 12px 14px; border: 1px solid ${c.border}; border-radius: 8px; background: ${c.card};">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                        <div style="font-size: 14px; font-weight: 600; color: ${c.fg};">Enable Ops Dashboard</div>
                        ${switchHTML}
                    </div>
                    ${externalHostNotice}
                    <div id="wf-ops-dashboard-suboptions-wrap" style="display: ${suboptionsDisplay}; margin-top: 10px; padding-top: 10px; border-top: 1px dashed ${c.border};">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 0 4px 12px;">
                            <div style="flex: 1; min-width: 0;">
                                <label for="wf-ops-dashboard-open-on-settings" style="font-size: 12px; color: ${c.muted}; cursor: pointer; display: block;">
                                    Open dashboard when opening settings
                                </label>
                                <div style="font-size: 11px; color: ${c.muted}; margin-top: 2px; line-height: 1.35;">
                                    Ctrl+click the gear icon to open this smaller modal.
                                </div>
                            </div>
                            ${submoduleSwitchHTML}
                        </div>
                        <button type="button" id="wf-ops-open-dashboard-btn" class="${this._opsDashBtnClass('secondary', 'regular')} wf-dash-btn--full" style="
                            display: ${openDashboardBtnDisplay};
                            margin-top: 10px;
                            box-sizing: border-box;
                        ">Open Dashboard</button>
                        <div id="wf-ops-dashboard-incomplete-msg" class="${ab.root} ${ab.amber}" style="display: none; margin-top: 10px; margin-bottom: 0; padding: 10px 12px; font-size: 12px; line-height: 1.45;">
                            Search Output module failed to load. Check the console or refresh the page.
                        </div>
                    </div>
                </div>
                </div>
                <div id="wf-ops-password-panel" style="display: ${passwordPanelDisplay}; margin-top: 10px; padding: 12px 14px; border: 1px solid ${c.border}; border-radius: 8px; background: ${c.card};">
                    <form id="wf-ops-password-form" style="margin: 0;">
                        <label for="wf-ops-password-input" style="display: block; font-size: 12px; font-weight: 500; color: ${c.fg}; margin-bottom: 6px;">Ops Dashboard</label>
                        <div style="display: flex; gap: 8px; align-items: stretch;">
                            <input type="password" id="wf-ops-password-input" name="ops-password" autocomplete="current-password" style="
                                flex: 1;
                                min-width: 0;
                                padding: 8px 12px;
                                font-size: 13px;
                                border: 1px solid ${c.border};
                                border-radius: 6px;
                                background: ${c.bg};
                                color: ${c.fg};
                                box-sizing: border-box;
                            ">
                            <button type="submit" id="wf-ops-password-submit" class="${this._opsDashBtnClass('primary', 'regular')}" style="
                                flex-shrink: 0;
                            ">Unlock</button>
                        </div>
                        <div id="wf-ops-password-error" style="display: none; margin-top: 8px; font-size: 12px; color: #dc2626; line-height: 1.45;"></div>
                    </form>
                </div>
            </div>`;
    },

    _syncOpsSettingsSubmoduleVisibility(modal) {
        const enableWrap = this._opsQuery(modal, '#wf-ops-enable-wrap', 'opsEnableWrap');
        const passwordPanel = this._opsQuery(modal, '#wf-ops-password-panel', 'opsPasswordPanelSync');
        const wrap = this._opsQuery(modal, '#wf-ops-dashboard-suboptions-wrap', 'opsSubmoduleWrap');
        const openBtn = this._opsQuery(modal, '#wf-ops-open-dashboard-btn', 'opsOpenDashboardBtn');
        const hasPassword = this._hasOpsStoredPassword();
        const wanted = this._getOpsTabWanted();
        const hostAllows = this._isOpsDashboardAllowedOnHost();
        if (enableWrap) enableWrap.style.display = hasPassword ? 'block' : 'none';
        if (passwordPanel) passwordPanel.style.display = hasPassword ? 'none' : 'block';
        if (wrap) wrap.style.display = hasPassword && wanted && hostAllows ? 'block' : 'none';
        if (openBtn) openBtn.style.display = hasPassword && wanted && hostAllows ? 'block' : 'none';
        this._syncOpsDashboardIncompleteMessage(modal);
    },

    _syncOpsDashboardIncompleteMessage(modal) {
        const el = this._opsQuery(modal, '#wf-ops-dashboard-incomplete-msg', 'opsDashboardIncompleteMsg');
        if (!el) return;
        const show = this._getOpsTabWanted()
            && this._hasOpsStoredPassword()
            && Context.dashboard
            && typeof Context.dashboard.isReady === 'function'
            && !Context.dashboard.isReady();
        el.style.display = show ? 'block' : 'none';
        if (show) {
            Logger.warn('dashboard modules incomplete — Search Output may be unavailable');
        }
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
        const c = (Context.uiLib && typeof Context.uiLib.chromeColors === 'function')
            ? Context.uiLib.chromeColors()
            : { hover: '#f0f0f0', border: '#e5e5e5' };
        const sliderBg = isEnabled ? onColor : c.hover;
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
                    <button type="button" id="wf-ops-open-link" class="${this._opsDashBtnClass('secondary', 'nav')}">Open</button>
                    <button type="button" id="wf-ops-open-link-new-tab" class="${this._opsDashBtnClass('secondary', 'nav')}">New Tab</button>
                    <button type="button" id="wf-ops-copy-link" title="Copy link" aria-label="Copy link" class="${this._opsDashBtnClass('basic', 'nav')}">Copy</button>
                </div>
            </div>`;
    },


    _renderGradeAssessmentsHeaderLink() {
        return '<a href="' + this._opsEscapeAttr(opsGradeAssessmentsUrl()) + '" target="_blank" rel="noopener noreferrer" '
            + 'id="wf-ops-grade-assessments" class="wf-dash-header-btn ' + this._opsDashBtnClass('basic', 'nav') + ' wf-ops-grade-header-link">Grade Assessments</a>';
    },


    _attachOpsPasswordListeners(modal, settingsPlugin) {
        if (!modal || modal.dataset.wfOpsPasswordListenersAttached === '1') return;
        modal.dataset.wfOpsPasswordListenersAttached = '1';

        const form = this._opsQuery(modal, '#wf-ops-password-form', 'opsPasswordForm');
        const toggle = this._opsQuery(modal, '#wf-ops-tab-enabled', 'opsTabTogglePassword');

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                void this._submitOpsPassword(modal, toggle, settingsPlugin);
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
                Logger.log('Ops dashboard disabled');
                return;
            }
            self._setOpsTabWanted(true);
            self._syncOpsSettingsSubmoduleVisibility(modal);
            if (self._hasOpsStoredPassword()) {
                handleToggleChange(e);
                Logger.log('Ops dashboard enabled');
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
            Logger.log('unlock required');
        });
    },

    _attachOpsDashboardOpenOnSettingsListener(modal) {
        const toggle = this._opsQuery(modal, '#wf-ops-dashboard-open-on-settings', 'opsOpenOnSettingsToggle');
        if (!toggle || toggle.dataset.wfOpsOpenOnSettingsBound === '1') return;
        toggle.dataset.wfOpsOpenOnSettingsBound = '1';
        toggle.addEventListener('change', (e) => {
            this._syncOpsToggleVisual(e.target);
            this._setOpsDashboardOpenOnSettings(e.target.checked);
            Logger.log('open dashboard on settings ' + (e.target.checked ? 'enabled' : 'disabled'));
        });
    },

    _attachOpsOpenDashboardButtonListener(modal) {
        const btn = this._opsQuery(modal, '#wf-ops-open-dashboard-btn', 'opsOpenDashboardBtnAttach');
        if (!btn || btn.dataset.wfOpsOpenDashboardBound === '1') return;
        btn.dataset.wfOpsOpenDashboardBound = '1';
        btn.addEventListener('click', () => {
            if (!this._isOpsDashboardAllowedOnHost()) {
                Logger.warn('Open Dashboard skipped — not allowed on external env instances');
                return;
            }
            if (!this._getOpsTabWanted() || !this._hasOpsStoredPassword()) {
                Logger.warn('Open Dashboard skipped — not unlocked');
                return;
            }
            const self = this;
            void (async () => {
                if (typeof Context.ensureOpsDashboardPluginsLoaded === 'function') {
                    try {
                        await Context.ensureOpsDashboardPluginsLoaded();
                    } catch (e) {
                        Logger.warn('ensureOpsDashboardPluginsLoaded before open failed', e);
                    }
                }
                self._syncOpsDashboardIncompleteMessage(modal);
                if (Context.dashboard && typeof Context.dashboard.open === 'function') {
                    Context.dashboard.open();
                    Logger.log('opened Ops dashboard from settings');
                } else {
                    Logger.warn('Open Dashboard skipped — Context.dashboard unavailable');
                }
            })();
        });
    },

    _attachOpsSettingsListeners(modal, settingsPlugin) {
        if (!modal) return;
        this._injectOpsSpinnerStyle();
        this._injectOpsSettingsButtonStyles();
        this._attachOpsPasswordListeners(modal, settingsPlugin);
        this._attachOpsTabToggleListener(modal, settingsPlugin);
        this._attachOpsDashboardOpenOnSettingsListener(modal);
        this._attachOpsOpenDashboardButtonListener(modal);
        this._syncOpsSettingsSubmoduleVisibility(modal);
    },

    async _ensureOpsSessionReady(dashModal) {
        await this._revalidateOpsStoredPassword(dashModal, null);
        if (this._getOpsTabEnabled()) {
            await this._loadOpsSecrets(true);
        }
    },

    _revalidateOnDashboardTabActivated(dashModal) {
        if (!dashModal) return;
        void this._ensureOpsSessionReady(dashModal);
    },

    _attachOpsTaskLinkListeners(dashModal) {
        if (!dashModal) return;
        this._injectOpsSpinnerStyle();
        const modal = dashModal;

        if (modal.dataset.wfOpsTaskLinkListenersAttached === '1') {
            return;
        }
        modal.dataset.wfOpsTaskLinkListenersAttached = '1';

        const input = this._opsQuery(modal, '#wf-ops-task-input', 'taskInputAttach');
        const openBtn = this._opsQuery(modal, '#wf-ops-open-link', 'openLinkAttach');
        const openNewTabBtn = this._opsQuery(modal, '#wf-ops-open-link-new-tab', 'openLinkNewTabAttach');
        const copyBtn = this._opsQuery(modal, '#wf-ops-copy-link', 'copyLinkAttach');

        if (input) {
            input.addEventListener('input', () => {
                this._updateOpsTaskLinkUI(modal);
                this._captureOpsTaskLinkState(modal);
            });
            input.addEventListener('paste', () => {
                requestAnimationFrame(() => {
                    this._updateOpsTaskLinkUI(modal);
                    this._captureOpsTaskLinkState(modal);
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
                    Logger.warn('copy skipped (no URL)');
                    this._showOpsCopyFailurePulse(copyBtn);
                    return;
                }
                const ok = await this._copyOpsTextToClipboard(url);
                if (ok) {
                    this._showOpsCopySuccessFlash(copyBtn);
                    Logger.log('link copied (' + url.length + ' chars)');
                } else {
                    this._showOpsCopyFailurePulse(copyBtn);
                    Logger.warn('link copy failed');
                }
            });
        }

        const gradeAssessmentsLink = this._opsQuery(modal, '#wf-ops-grade-assessments', 'opsGradeAssessmentsAttach');
        if (gradeAssessmentsLink) {
            gradeAssessmentsLink.addEventListener('click', () => {
                Logger.log('grade assessments opened');
            });
        }
    },

    _captureOpsTaskLinkState(modal) {
        if (!modal) return;
        const taskInput = this._opsQuery(modal, '#wf-ops-task-input', 'taskInputCapture');
        if (!this._opsTabState) this._opsTabState = {};
        this._opsTabState.taskInput = taskInput ? taskInput.value : '';
    }
};
