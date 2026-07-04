// ops-tab.js
// Core plugin for the Ops dashboard backend: secrets/password gate, PostgREST,
// team member search backend, verifier fetch backend, and task link helpers.
// Dashboard tab UI lives in search-output.js, team-members.js, verifier-fetcher.js;
// settings-ui.js hosts enable/password toggles only.

const OPS_TASK_URL_PREFIX = 'https://www.fleetai.com/dashboard/data/tasks/';
const OPS_GRADE_ASSESSMENTS_URL = 'https://www.fleetai.com/work/assessments/grade/';
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

const OPS_FLEET_ORIGIN = 'https://www.fleetai.com';
const OPS_TEAM_SEARCH_URL = OPS_FLEET_ORIGIN + '/dashboard/team';
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
const OPS_EXPERT_STATS_HYDRATE_CONCURRENCY = 5;
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
const OPS_TEAM_BULK_REMOVE_URL = 'https://www.fleetai.com/api/orchestrator-private/v1/team/members/bulk-remove';
const OPS_TEAM_USER_PERMISSIONS_URL = 'https://www.fleetai.com/api/orchestrator-private/v1/team/users/permissions';
/** Fleet API prefix for teams included in dashboard / ops team search. */
const OPS_TASK_DESIGNERS_TEAM_PREFIX = 'Task Designers - ';
/** Display labels that alone do not qualify a member for the UI badge. */
const OPS_FLEET_FELLOWS_TEAM_LABEL = 'Fleet Fellows';
const OPS_TEAM_UI_BADGE_EXCLUDED_LABELS = new Set(['Tryouts', OPS_FLEET_FELLOWS_TEAM_LABEL]);
const OPS_TEAM_VERTICALS_ONLY_LABEL = 'Fellows - SMB Banking Project';
const OPS_TEAM_EPIC_EXPERTS_LABEL = 'Fleet: Epic Experts';
const OPS_TEAM_EPIC_TRYOUTS_LABEL = 'Fleet: Epic Tryouts';
const OPS_TEAM_EPIC_LABELS = new Set([OPS_TEAM_EPIC_EXPERTS_LABEL, OPS_TEAM_EPIC_TRYOUTS_LABEL]);

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
    _version: '9.0',
    phase: 'core',
    enabledByDefault: true,

    _opsVerifierFetchState: null,
    _opsVerifierSourceText: '',
    _opsVerifierContentSearch: { query: '', index: 0, matchStarts: [] },
    _opsTeamSearchActive: null,
    _opsTeamSearchAbortController: null,
    _opsTeamSearchMemberCache: null,
    /** Last-applied team member filters (categorical + numeric); null = show all */
    _opsTeamActiveFilters: null,
    /** Legacy Fellows-search gate; team member search uses all user teams. */
    _opsFellowsSearchComplete: null,
    /** memberId → staged edit session while permissions tray is in edit mode */
    _opsMemberEditState: null,
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
    /** memberId → { loading?, creator?, qa?, error? } */
    _opsExpertStatsCache: null,
    _opsExpertStatsHydrateGen: 0,
    /** Set of member IDs whose card details are open; null = all-expanded default */
    _opsMemberDetailsOpenIds: null,
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
            handleTeamSearch: (modal) => this._handleOpsTeamSearch(modal),
            clearTeamSearchResults: (modal) => this._clearOpsTeamSearchResults(modal),
            filterTeamSearchCards: (modal) => this._filterOpsTeamSearchCards(modal),
            applyTeamFilters: (modal) => this._applyOpsTeamFilters(modal),
            populateTeamMemberConstraintLists: (teams, opts) => this._populateOpsTeamMemberConstraintLists(teams, opts),
            toggleTeamExpandAll: (modal) => this._toggleOpsTeamExpandAll(modal),
            attachTeamMemberDetailsToggle: (modal) => this._attachOpsTeamMemberDetailsToggle(modal),
            attachTeamMemberEditDelegation: (modal) => this._attachOpsTeamMemberEditDelegation(modal),
            captureTeamTabState: (modal) => this._captureOpsTeamTabState(modal),
            restoreTeamTabState: (modal) => this._restoreOpsTeamTabState(modal),
            handleVerifierFetch: (modal) => this._handleOpsVerifierFetch(modal),
            handleVerifierVersionChange: (modal) => this._handleOpsVerifierVersionChange(modal),
            setVerifierStatus: (modal, msg, isError) => this._setOpsVerifierStatus(modal, msg, isError),
            clearVerifierVersionPicker: (modal) => this._clearOpsVerifierVersionPicker(modal),
            applyVerifierContentSearch: (modal, query) => this._applyVerifierContentSearch(modal, query),
            clearVerifierContentSearch: (modal) => this._clearVerifierContentSearch(modal),
            stepVerifierContentMatch: (modal, dir) => this._stepVerifierContentMatch(modal, dir),
            findVerifierContentMatchStarts: (text, query) => this._findVerifierContentMatchStarts(text, query),
            renderVerifierCodeElement: (codeEl, opts) => this._renderVerifierCodeElement(codeEl, opts),
            setVerifierContentMatchActive: (codeEl, activeIndex) => this._setVerifierContentMatchActive(codeEl, activeIndex),
            scrollVerifierActiveContentMatch: (codeEl) => this._scrollVerifierActiveContentMatchInElement(codeEl),
            stepVerifierContentMatchInElement: (codeEl, searchState, delta, rerender) =>
                this._stepVerifierContentMatchInElement(codeEl, searchState, delta, rerender),
            captureVerifierTabState: (modal) => this._captureOpsVerifierTabState(modal),
            restoreVerifierTabState: (modal) => this._restoreOpsVerifierTabState(modal),
            copyVerifierCode: (modal, btn) => this._copyOpsVerifierCode(modal, btn),
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
            Logger.info('ops-tab: stored password cleared — opsAccess.passwordHash changed');
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
        Logger.debug('ops-tab: ' + (context || 'request') + ' skipped — ' + OPS_BUNDLE_NOT_LOADED_MESSAGE);
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
                        Logger.debug('ops-tab: no encrypted secrets file on branch');
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
                Logger.log('ops-tab: secrets decrypted (' + keyCount + ' top-level keys)');
            } catch (e) {
                self._opsSecretsCache.json = null;
                self._opsSecretsCache.loadError = e;
                Logger.warn('ops-tab: secrets decrypt failed', e);
                try {
                    const ok = await self._verifyOpsPassword(password);
                    if (ok && !self._opsSecretsCache.decryptMismatchLogged) {
                        self._opsSecretsCache.decryptMismatchLogged = true;
                        Logger.warn(
                            'ops-tab: password accepted but decrypt failed — pull latest ops-secrets.enc.json or re-save password after branch sync'
                        );
                    }
                } catch (_verifyErr) {
                    Logger.debug('ops-tab: decrypt failure password check skipped', _verifyErr);
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

    _getOpsTabEnabled() {
        return this._getOpsTabWanted() && this._hasOpsStoredPassword() && this._isOpsAccessConfigured();
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
            if (this._isOpsBundleNotLoadedError(e)) {
                this._logOpsBundleNotLoadedOnce('tasks lookup');
                throw e;
            }
            Logger.debug('ops-tab: tasks lookup failed', e);
        }

        if (!taskRow) {
            if (!this._isOpsBundleReady()) {
                throw new Error(OPS_BUNDLE_NOT_LOADED_MESSAGE);
            }
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
            select: 'role,team(id,name,logo_url)',
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
            const userId = Storage.getData(OPS_CURRENT_USER_ID_STORAGE_KEY, null);
            if (userId && OPS_UUID_RE.test(userId)) {
                this._opsCurrentUserIdCache = userId;
                Logger.debug('ops-tab: current user id hydrated from script storage (' + userId.slice(0, 8) + '…)');
            }
        } catch (e) {
            Logger.debug('ops-tab: current user id script storage hydration failed', e);
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
            const nextAction = Storage.getData(OPS_EXPERT_STATS_ACTION_STORAGE_KEY, null);
            const routerState = Storage.getData(OPS_EXPERT_STATS_ROUTER_STATE_STORAGE_KEY, null);
            if (nextAction) {
                this._opsExpertStatsActionCache = { nextAction, routerState: routerState || '' };
                Logger.debug('ops-tab: expert stats action hydrated from script storage (' + nextAction.slice(0, 12) + '…)');
            }
        } catch (e) {
            Logger.debug('ops-tab: expert stats action script storage hydration failed', e);
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
            Logger.debug('ops-tab: expert stats action persist failed', e);
        }
        if (changed) {
            Logger.log('ops-tab: expert stats action updated (' + nextAction.slice(0, 12) + '…)');
            this._broadcastOpsSync({ type: 'expertStatsActionUpdated' });
        }
    },

    _clearOpsExpertStatsActionCache() {
        this._opsExpertStatsActionCache = { nextAction: null, routerState: null };
        try {
            Storage.deleteData(OPS_EXPERT_STATS_ACTION_STORAGE_KEY);
            Storage.deleteData(OPS_EXPERT_STATS_ROUTER_STATE_STORAGE_KEY);
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
                    const credRefreshTab = self._isOpsExpertCredRefreshTab();
                    if (nextAction !== self._opsExpertStatsActionCache.nextAction) {
                        self._persistOpsExpertStatsAction({ nextAction, routerState: routerState || '' });
                        Logger.info('ops-tab: expert stats action captured from live traffic (' + nextAction.slice(0, 12) + '…)');
                    }
                    if (credRefreshTab) {
                        self._signalOpsExpertCredRefreshComplete();
                        self._tryCloseOpsExpertCredRefreshTab();
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

    _opsFormatDurationMinutes(seconds) {
        const s = Number(seconds);
        if (!Number.isFinite(s) || s <= 0) return '—';
        return Math.max(1, Math.round(s / 60)) + 'm';
    },

    _opsExpertQaAcceptanceRatePercent(data) {
        if (!data || typeof data !== 'object') return null;
        if (data.acceptanceRate != null) {
            const rate = Number(data.acceptanceRate);
            if (Number.isFinite(rate)) return Math.round(rate);
        }
        const accepted = data.acceptedReviews ?? data.acceptedCount ?? data.qaAccepted;
        const rejected = data.rejectedReviews ?? data.rejectedCount ?? data.qaRejected;
        if (accepted != null && rejected != null) {
            const total = Number(accepted) + Number(rejected);
            if (Number.isFinite(total) && total > 0) {
                return Math.round((Number(accepted) / total) * 100);
            }
        }
        return null;
    },

    _opsExpertCreatorStatsColumns(data) {
        if (!data || typeof data !== 'object') return ['Creator', '—', '—', '—'];
        return [
            'Creator',
            data.totalSubmissions != null ? data.totalSubmissions + ' submitted' : '—',
            data.acceptanceRate != null ? data.acceptanceRate + '% AR' : '—',
            data.avgCreationTimeSeconds != null
                ? '~' + this._opsFormatDurationMinutes(data.avgCreationTimeSeconds) + ' avg'
                : '—'
        ];
    },

    _opsExpertQaStatsColumns(data) {
        if (!data || typeof data !== 'object') return ['QA', '—', '—', '—'];
        const reviews = data.reviewsCompleted ?? data.totalReviews ?? data.tasksReviewed ?? data.tasksCompleted;
        const avgSec = data.avgReviewTimeSeconds ?? data.avgQaTimeSeconds ?? data.avgTimePerQaSeconds
            ?? data.avgReviewDurationSeconds;
        const arPercent = this._opsExpertQaAcceptanceRatePercent(data);
        return [
            'QA',
            reviews != null ? reviews + ' reviews' : '—',
            arPercent != null ? arPercent + '% AR' : '—',
            avgSec != null ? '~' + this._opsFormatDurationMinutes(avgSec) + ' avg' : '—'
        ];
    },

    _opsExpertStatsStatusColumns(role, message) {
        return [role, message, '—', '—'];
    },

    _opsExpertProfileUrl(expertId, credRefresh) {
        const id = String(expertId || '').trim();
        if (!id) return '';
        let url = OPS_FLEET_ORIGIN + '/dashboard/data/experts/' + encodeURIComponent(id);
        if (credRefresh) url += '?' + OPS_EXPERT_CRED_REFRESH_QUERY + '=1';
        return url;
    },

    _opsExpertStatsCredRefreshBtnHtml(memberId) {
        const id = String(memberId || '').trim();
        if (!id) return '';
        const attrId = this._opsEscapeAttr(id);
        const title = 'Open expert profile to refresh stats';
        return '<button type="button" class="wf-ops-profile-link-btn ' + this._opsDashBtnClass('basic', 'icon') + '" ' +
            'data-ops-action="expert-stats-cred-refresh" data-ops-member-id="' + attrId + '" ' +
            'title="' + this._opsEscapeHtml(title) + '" aria-label="' + this._opsEscapeHtml(title) + '">' +
            this._opsProfileLinkIconSvg() + '</button>';
    },

    _opsExpertStatsUnavailableHtml(memberId) {
        return '<div class="wf-ops-member-stats-grid wf-ops-member-stats-grid--plain" data-ops-member-stats-grid>' +
            '<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
            this._opsEscapeHtml('Stats unavailable (open expert profile once)') +
            this._opsExpertStatsCredRefreshBtnHtml(memberId) +
            '</span></div>';
    },

    _opsExpertStatsGridHtml(creatorCols, qaCols, opts) {
        const plain = !!(opts && opts.plain);
        const gridClass = plain
            ? 'wf-ops-member-stats-grid wf-ops-member-stats-grid--plain'
            : 'wf-ops-member-stats-grid';
        const rows = plain ? creatorCols : creatorCols.concat(qaCols);
        const cells = rows.map((col) => '<span>' + this._opsEscapeHtml(col || '—') + '</span>').join('');
        return '<div class="' + gridClass + '" data-ops-member-stats-grid>' + cells + '</div>';
    },

    _renderOpsTeamMemberStatsInnerHtml(entry, memberId) {
        if (!this._opsExpertStatsActionCache.nextAction) {
            return this._opsExpertStatsUnavailableHtml(memberId);
        }
        if (!entry || entry.loading || entry.error === 'missing-credentials') {
            const msg = 'Loading stats…';
            return this._opsExpertStatsGridHtml(
                this._opsExpertStatsStatusColumns('Creator', msg),
                this._opsExpertStatsStatusColumns('QA', msg)
            );
        }
        if (entry.error) {
            const msg = 'Stats unavailable';
            return this._opsExpertStatsGridHtml(
                this._opsExpertStatsStatusColumns('Creator', msg),
                this._opsExpertStatsStatusColumns('QA', msg)
            );
        }
        return this._opsExpertStatsGridHtml(
            this._opsExpertCreatorStatsColumns(entry.creator),
            this._opsExpertQaStatsColumns(entry.qa)
        );
    },

    _renderOpsTeamMemberStatsHtml(memberId) {
        const entry = this._opsExpertStatsCache && this._opsExpertStatsCache.get(memberId);
        return '<div data-ops-member-stats style="margin-top:6px;font-size:10px;line-height:1.5;color:var(--muted-foreground,#666);">' +
            this._renderOpsTeamMemberStatsInnerHtml(entry, memberId) +
        '</div>';
    },

    _patchOpsTeamMemberCard(modal, memberId) {
        const tile = modal.querySelector('[data-ops-member-tile="' + this._opsEscapeAttr(String(memberId)) + '"]');
        if (!tile) return;
        const entry = this._opsExpertStatsCache && this._opsExpertStatsCache.get(memberId);
        const statsSlot = tile.querySelector('[data-ops-member-stats]');
        if (statsSlot) statsSlot.innerHTML = this._renderOpsTeamMemberStatsInnerHtml(entry, memberId);
    },

    _patchOpsTeamMemberStats(modal, memberId) {
        this._patchOpsTeamMemberCard(modal, memberId);
    },

    _getVisibleTeamMemberIds(modal, cache) {
        if (!cache || !cache.memberMap) return [];
        const active = this._opsTeamActiveFilters;
        const numericRows = active && active.numericFilters ? active.numericFilters : [];
        const andOr = active ? active.andOr : 'and';
        return [...cache.memberMap.values()]
            .filter((m) => this._opsMemberMatchesNumericFilters(m, numericRows, andOr))
            .map((m) => m.id)
            .filter(Boolean);
    },

    async _hydrateOpsTeamMemberStatsForVisible(modal) {
        if (!modal || !this._opsExpertStatsCache) return;
        const cache = this._opsTeamSearchMemberCache;
        if (!cache) return;

        const memberIds = this._getVisibleTeamMemberIds(modal, cache);
        const hasStats = !!this._opsExpertStatsActionCache.nextAction;
        const toFetch = memberIds.filter((id) => {
            const entry = this._opsExpertStatsCache.get(id);
            if (!entry) return true;
            if (entry.loading) return false;
            if (entry.creator || entry.qa) return false;
            if (entry.error === 'missing-credentials') return hasStats;
            return !entry.error;
        });
        if (toFetch.length === 0) return;

        if (!hasStats) {
            for (const id of toFetch) {
                this._opsExpertStatsCache.set(id, { error: 'missing-credentials' });
                this._patchOpsTeamMemberCard(modal, id);
            }
            return;
        }

        const gen = ++this._opsExpertStatsHydrateGen;
        for (const id of toFetch) {
            this._opsExpertStatsCache.set(id, { loading: true });
            this._patchOpsTeamMemberCard(modal, id);
        }

        let cursor = 0;
        const worker = async () => {
            while (cursor < toFetch.length) {
                if (gen !== this._opsExpertStatsHydrateGen) return;
                const id = toFetch[cursor++];
                try {
                    const [creator, qa] = await Promise.all([
                        hasStats ? this._fetchOpsExpertStats(id, false) : Promise.resolve(null),
                        hasStats ? this._fetchOpsExpertStats(id, true) : Promise.resolve(null)
                    ]);
                    if (gen !== this._opsExpertStatsHydrateGen) return;
                    this._opsExpertStatsCache.set(id, { creator, qa });
                    Logger.debug('ops-tab: expert card data loaded for ' + id.slice(0, 8) + '…');
                } catch (e) {
                    if (gen !== this._opsExpertStatsHydrateGen) return;
                    Logger.warn('ops-tab: expert card data failed for ' + id.slice(0, 8) + '…', e);
                    this._opsExpertStatsCache.set(id, { error: e.message || String(e) });
                }
                this._patchOpsTeamMemberCard(modal, id);
            }
        };

        const poolSize = Math.min(OPS_EXPERT_STATS_HYDRATE_CONCURRENCY, toFetch.length);
        await Promise.all(Array.from({ length: poolSize }, () => worker()));

        if (this._opsTeamActiveFilters && this._opsTeamActiveFilters.numericFilters
            && this._opsTeamActiveFilters.numericFilters.length > 0) {
            this._filterOpsTeamSearchCards(modal);
        }
    },

    _populateOpsTeamMemberConstraintLists(allTeams, options) {
        const dash = Context.dashboard;
        if (!dash || typeof dash.renderTeamMemberConstraintLists !== 'function') return;
        const opts = options || {};
        const modal = opts.modal || null;
        if (opts.loading) {
            dash.renderTeamMemberConstraintLists({ loading: true, preserveSelections: false, modal });
            return;
        }
        const teamItems = (allTeams || [])
            .map(([, label]) => ({ id: label, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
        const permItems = OPS_ALL_PERMISSIONS.map(([id, label]) => ({ id, label }));
        dash.renderTeamMemberConstraintLists({
            loading: false,
            teamItems,
            permItems,
            preserveSelections: opts.preserveSelections !== false,
            modal
        });
    },

    _indexOpsTeamMemberFiltersFromResults(memberMap, options) {
        const dash = Context.dashboard;
        if (!dash || typeof dash.renderTeamMemberConstraintLists !== 'function') return;
        const opts = options || {};
        const modal = opts.modal || null;
        const teamLabels = new Set();
        const permKeys = new Set();
        if (memberMap) {
            for (const member of memberMap.values()) {
                const labels = member.teamLabels;
                if (labels) {
                    for (const label of labels) teamLabels.add(label);
                }
                for (const key of this._opsMemberPermissionKeys(member)) permKeys.add(key);
            }
        }
        const teamItems = [...teamLabels].sort((a, b) => a.localeCompare(b))
            .map((label) => ({ id: label, label }));
        const permItems = [...permKeys].sort((a, b) => a.localeCompare(b))
            .map((key) => ({ id: key, label: OPS_PERMISSION_LABEL_BY_KEY[key] || key }));
        dash.renderTeamMemberConstraintLists({
            loading: false,
            teamItems,
            permItems,
            preserveSelections: opts.preserveSelections !== false,
            modal
        });
        Logger.debug('ops-tab: team member filters indexed — ' + teamItems.length + ' teams, ' + permItems.length + ' permissions');
    },

    _loadOpsTeamSearchActionFromStorage() {
        try {
            const nextAction = Storage.getData(OPS_TEAM_SEARCH_ACTION_STORAGE_KEY, null);
            const routerState = Storage.getData(OPS_TEAM_SEARCH_ROUTER_STATE_STORAGE_KEY, null);
            if (nextAction) {
                this._opsTeamSearchActionCache = { nextAction, routerState: routerState || '' };
                Logger.debug('ops-tab: team search action hydrated from script storage (' + nextAction.slice(0, 12) + '…)');
            }
        } catch (e) {
            Logger.debug('ops-tab: team search action script storage hydration failed', e);
        }
    },

    _loadOpsTeamAddMemberActionFromStorage() {
        try {
            const nextAction = Storage.getData(OPS_TEAM_ADD_MEMBER_ACTION_STORAGE_KEY, null);
            const routerState = Storage.getData(OPS_TEAM_ADD_MEMBER_ROUTER_STATE_STORAGE_KEY, null);
            if (nextAction) {
                this._opsTeamAddMemberActionCache = { nextAction, routerState: routerState || '' };
                Logger.debug('ops-tab: team add-member action hydrated from script storage (' + nextAction.slice(0, 12) + '…)');
            }
        } catch (e) {
            Logger.debug('ops-tab: team add-member action script storage hydration failed', e);
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
            Logger.debug('ops-tab: BroadcastChannel unavailable', e);
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
            Logger.debug('ops-tab: ops sync broadcast failed', e);
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
                    Logger.debug('ops-tab: team search action synced from BroadcastChannel');
                    self._onOpsTeamCredRefreshComplete();
                } else if (data.type === 'teamAddMemberActionUpdated') {
                    self._loadOpsTeamAddMemberActionFromStorage();
                    Logger.debug('ops-tab: team add-member action synced from BroadcastChannel');
                } else if (data.type === 'credRefreshDone') {
                    self._onOpsTeamCredRefreshComplete();
                } else if (data.type === 'expertStatsActionUpdated') {
                    self._loadOpsExpertStatsActionFromStorage();
                    Logger.debug('ops-tab: expert stats action synced from BroadcastChannel');
                } else if (data.type === 'expertCredRefreshDone') {
                    self._loadOpsExpertStatsActionFromStorage();
                    self._onOpsExpertCredRefreshComplete();
                }
            };
            this._opsSyncChannelSubscribed = true;
            Logger.debug('ops-tab: team dashboard action BroadcastChannel sync listener installed');
        } catch (e) {
            Logger.debug('ops-tab: team dashboard action BroadcastChannel sync failed', e);
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
        Logger.log('ops-tab: team cred refresh complete — closing Team tab');
        const pageWindow = this._getOpsPageWindow();
        pageWindow.setTimeout(() => {
            try {
                pageWindow.close();
            } catch (_e) { /* ignore — browser may block close */ }
        }, 300);
    },

    _onOpsTeamCredRefreshComplete() {
        const pending = this._opsTeamCredRefreshPending;
        if (!pending) return;
        const modal = pending.modal;
        this._clearOpsTeamCredRefreshPending();
        this._reloadOpsTeamDashboardActionsFromStorage();
        if (!this._opsTeamSearchActionCache.nextAction) {
            this._setOpsTeamSearchStaleRetryStatus(modal,
                'Credentials not ready yet — try Refresh credentials again.');
            Logger.warn('ops-tab: team cred refresh signaled but search action still missing');
            return;
        }
        this._setOpsTeamSearchStaleRetryStatus(modal, 'Credentials refreshed — retrying search…');
        Logger.log('ops-tab: team cred refresh captured — auto-retrying search');
        void this._handleOpsTeamSearchCredentialRetry(modal);
    },

    _openOpsTeamPageForCredRefresh(modal) {
        this._clearOpsTeamCredRefreshPending();
        const pageWindow = this._getOpsPageWindow();
        const url = OPS_TEAM_SEARCH_URL + '?' + OPS_TEAM_CRED_REFRESH_QUERY + '=1';
        const opened = pageWindow.open(url, '_blank', 'noopener,noreferrer');
        if (!opened) {
            if (modal) {
                this._setOpsTeamSearchStaleRetryStatus(modal,
                    'Popup blocked — allow popups for Fleet, then try again.');
            }
            Logger.warn('ops-tab: team cred refresh tab blocked (popup blocker)');
            return null;
        }
        if (modal) {
            this._opsTeamCredRefreshPending = { modal, startedAt: Date.now() };
            this._setOpsTeamSearchStaleRetryStatus(modal, 'Opening Team page…');
            const self = this;
            this._opsTeamCredRefreshTimeout = pageWindow.setTimeout(() => {
                if (!self._opsTeamCredRefreshPending) return;
                const pendingModal = self._opsTeamCredRefreshPending.modal;
                self._clearOpsTeamCredRefreshPending();
                self._setOpsTeamSearchStaleRetryStatus(pendingModal,
                    'Credential refresh timed out — try Refresh credentials again.');
                Logger.warn('ops-tab: team cred refresh timed out');
            }, OPS_TEAM_CRED_REFRESH_TIMEOUT_MS);
        }
        Logger.log('ops-tab: team page opened for credential refresh');
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
        Logger.log('ops-tab: expert cred refresh complete — closing expert profile tab');
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
            Logger.warn('ops-tab: expert cred refresh signaled but stats action still missing');
            return;
        }

        this._clearOpsExpertCredRefreshPending();

        if (this._opsTeamSearchMemberCache) {
            if (this._opsExpertStatsCache) this._opsExpertStatsCache.clear();
            this._opsExpertStatsHydrateGen++;
            Logger.log('ops-tab: expert cred refresh captured — re-hydrating stats for visible members');
            void this._hydrateOpsTeamMemberStatsForVisible(modal);
            return;
        }

        Logger.log('ops-tab: expert cred refresh captured — no results on screen');
    },

    _openOpsExpertProfileForCredRefresh(modal, expertId) {
        const id = String(expertId || '').trim();
        if (!id) return null;
        this._clearOpsExpertCredRefreshPending();
        const pageWindow = this._getOpsPageWindow();
        const url = this._opsExpertProfileUrl(id, true);
        const opened = pageWindow.open(url, '_blank', 'noopener,noreferrer');
        if (!opened) {
            Logger.warn('ops-tab: expert cred refresh tab blocked (popup blocker)');
            return null;
        }
        if (modal) {
            this._opsExpertCredRefreshPending = { modal, expertId: id, startedAt: Date.now() };
            const self = this;
            this._opsExpertCredRefreshTimeout = pageWindow.setTimeout(() => {
                if (!self._opsExpertCredRefreshPending) return;
                self._clearOpsExpertCredRefreshPending();
                Logger.warn('ops-tab: expert cred refresh timed out');
            }, OPS_EXPERT_CRED_REFRESH_TIMEOUT_MS);
        }
        Logger.log('ops-tab: expert profile opened for stats credential refresh (' + id.slice(0, 8) + '…)');
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
            Logger.debug('ops-tab: team search action persist failed', e);
        }
        if (changed) {
            Logger.log('ops-tab: team search action updated (' + nextAction.slice(0, 12) + '…)');
            this._broadcastOpsSync({ type: 'teamSearchActionUpdated' });
        }
    },

    _clearOpsTeamSearchActionCache() {
        this._opsTeamSearchActionCache = { nextAction: null, routerState: null };
        try {
            Storage.deleteData(OPS_TEAM_SEARCH_ACTION_STORAGE_KEY);
            Storage.deleteData(OPS_TEAM_SEARCH_ROUTER_STATE_STORAGE_KEY);
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
            Storage.setData(OPS_TEAM_ADD_MEMBER_ACTION_STORAGE_KEY, nextAction);
            if (routerState) {
                Storage.setData(OPS_TEAM_ADD_MEMBER_ROUTER_STATE_STORAGE_KEY, routerState);
            }
        } catch (e) {
            Logger.debug('ops-tab: team add-member action persist failed', e);
        }
        if (changed) {
            Logger.log('ops-tab: team add-member action updated (' + nextAction.slice(0, 12) + '…)');
            this._broadcastOpsSync({ type: 'teamAddMemberActionUpdated' });
        }
    },

    _clearOpsTeamAddMemberActionCache() {
        this._opsTeamAddMemberActionCache = { nextAction: null, routerState: null };
        try {
            Storage.deleteData(OPS_TEAM_ADD_MEMBER_ACTION_STORAGE_KEY);
            Storage.deleteData(OPS_TEAM_ADD_MEMBER_ROUTER_STATE_STORAGE_KEY);
        } catch (e) {
            Logger.debug('ops-tab: team add-member action cache clear failed', e);
        }
        Logger.info('ops-tab: team add-member action cache cleared (will re-discover on next add)');
    },

    _loadOpsTaskDataActionFromStorage() {
        try {
            const nextAction = Storage.getData(OPS_TASK_DATA_ACTION_STORAGE_KEY, null);
            const routerState = Storage.getData(OPS_TASK_DATA_ROUTER_STATE_STORAGE_KEY, null);
            if (nextAction) {
                this._opsTaskDataActionCache = { nextAction, routerState: routerState || '' };
                Logger.debug('ops-tab: task data action hydrated from script storage (' + nextAction.slice(0, 12) + '…)');
            }
        } catch (e) {
            Logger.debug('ops-tab: task data action script storage hydration failed', e);
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
            Logger.debug('ops-tab: task data action persist failed', e);
        }
        if (changed) {
            Logger.log('ops-tab: task data action updated (' + nextAction.slice(0, 12) + '…)');
        }
    },

    _clearOpsTaskDataActionCache() {
        this._opsTaskDataActionCache = { nextAction: null, routerState: null };
        try {
            Storage.deleteData(OPS_TASK_DATA_ACTION_STORAGE_KEY);
            Storage.deleteData(OPS_TASK_DATA_ROUTER_STATE_STORAGE_KEY);
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
                    const credRefreshTab = self._isOpsTeamCredRefreshTab();
                    if (nextAction !== self._opsTeamSearchActionCache.nextAction) {
                        self._persistOpsTeamSearchAction({ nextAction, routerState: routerState || '' });
                        Logger.info('ops-tab: team search action captured from live traffic (' + nextAction.slice(0, 12) + '…)');
                    }
                    if (credRefreshTab) {
                        self._signalOpsTeamCredRefreshComplete();
                        self._tryCloseOpsTeamCredRefreshTab();
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
        const btnStyle = [
            'display: inline-block;padding: 8px 14px;font-size: 13px;font-weight: 600;',
            'border-radius: 6px;cursor: pointer;border: 1px solid #dc2626;'
        ].join('');
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
            'Click <strong>Refresh credentials</strong> to open the Team page in a new tab — ',
            'credentials refresh automatically and the tab closes on its own.',
            '</p>',
            '<p id="wf-ops-team-search-stale-retry-status" style="display: none; font-size: 12px; color: #b91c1c; margin: 8px 0 0 0; line-height: 1.45;"></p>',
            '</div>',
            '</div>',
            '<div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #fecaca; text-align: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;">',
            '<button type="button" id="wf-ops-team-search-open-team" style="',
            btnStyle,
            'color: #991b1b;background: #fef2f2;">Refresh credentials</button>',
            '<button type="button" id="wf-ops-team-search-retry-btn" style="',
            btnStyle,
            'color: #fff;background: #dc2626;">Retry search</button>',
            '</div>',
            '</div>'
        ].join('');
    },

    _setOpsTeamSearchStaleRetryStatus(modal, message) {
        const banner = this._opsQuery(modal, '#wf-ops-team-search-action-refresh-banner', 'teamSearchStaleRetryStatus');
        if (!banner) return;
        const statusEl = banner.querySelector('#wf-ops-team-search-stale-retry-status');
        if (!statusEl) return;
        if (message) {
            statusEl.textContent = message;
            statusEl.style.display = 'block';
        } else {
            statusEl.textContent = '';
            statusEl.style.display = 'none';
        }
    },

    _clearOpsTeamSearchStaleBanner(modal) {
        const cards = this._opsQuery(modal, '#wf-ops-team-search-cards', 'teamSearchStaleClear');
        const placeholder = this._opsQuery(modal, '#wf-ops-team-search-status-placeholder', 'teamSearchStalePlaceholderRestore');
        if (cards) cards.innerHTML = '';
        if (placeholder) placeholder.style.display = '';
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
            const self = this;
            const openTeamBtn = cards.querySelector('#wf-ops-team-search-open-team');
            if (openTeamBtn) {
                openTeamBtn.addEventListener('click', () => {
                    self._openOpsTeamPageForCredRefresh(modal);
                });
            }
            const retryBtn = cards.querySelector('#wf-ops-team-search-retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    void self._handleOpsTeamSearchCredentialRetry(modal);
                });
            }
        } else {
            this._setOpsTeamSearchStatus(
                modal,
                'Team search credentials are missing or out of date. Open the Team page in Fleet, then retry.',
                true,
                false,
                false
            );
            Logger.warn('ops-tab: team search refresh banner fallback — output wrap missing');
            Logger.info('ops-tab: team search refresh banner shown — open Team page then retry');
            return;
        }
        this._setOpsTeamSearchStatus(modal, '', false, false, false);
        Logger.info('ops-tab: team search refresh banner shown — open Team page then retry');
    },

    _opsTeamSearchLikelyStaleEmptyResults(query, memberMap, allTeams) {
        if (!allTeams || allTeams.length === 0) return false;
        if (memberMap && memberMap.size > 0) return false;
        const q = String(query || '').trim();
        return q === '';
    },

    async _handleOpsTeamSearchCredentialRetry(modal) {
        this._setOpsTeamSearchStaleRetryStatus(modal, '');
        const hasSearchAction = this._reloadOpsTeamDashboardActionsFromStorage();
        if (!hasSearchAction) {
            this._setOpsTeamSearchStaleRetryStatus(modal,
                'Credentials not ready yet — wait for the Team page to finish loading, then retry.');
            Logger.debug('ops-tab: team search credential retry — no action in storage yet');
            return;
        }
        Logger.log('ops-tab: team search credentials reloaded from storage — retrying search');
        await this._handleOpsTeamSearch(modal);
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
        slider.style.backgroundColor = isChecked ? onColor : '#ccc';
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
        if (Context.uiLib && typeof Context.uiLib.ensureStyles === 'function') {
            Context.uiLib.ensureStyles();
        }
        if (document.getElementById('wf-ops-spinner-style')) return;
        const style = document.createElement('style');
        style.id = 'wf-ops-spinner-style';
        style.textContent = [
            '.wf-ops-member-details:not([open]) .wf-ops-member-edit-actions{display:none!important;}',
            '.wf-ops-member-details[open] .wf-ops-member-edit-actions{display:flex!important;}',
            '.wf-ops-edit-btn{padding:2px 8px;font-size:11px;font-weight:600;color:#a16207;background:color-mix(in srgb,#ca8a04 14%,transparent);border:1px solid #ca8a04;border-radius:4px;cursor:pointer;white-space:nowrap;transition:background 0.15s,border-color 0.15s,color 0.15s;}',
            '.wf-ops-edit-btn:hover{background:#ca8a04!important;color:#fff!important;border-color:#ca8a04!important;}',
            '.wf-ops-profile-link-btn{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;text-decoration:none;}',
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

    _setOpsTeamSearchStatus(modal, message, isError, isHtml, showClear) {
        const row = this._opsQuery(modal, '#wf-ops-team-search-status-row', 'teamSearchStatusRow');
        const status = this._opsQuery(modal, '#wf-ops-team-search-status', 'teamSearchStatus');
        const clearBtn = this._opsQuery(modal, '#wf-ops-team-search-clear-btn', 'teamSearchClearBtn');
        const expandAllBtn = this._opsQuery(modal, '#wf-ops-team-expand-all-btn', 'teamSearchExpandAllBtn');
        const placeholder = this._opsQuery(modal, '#wf-ops-team-search-status-placeholder', 'teamSearchStatusPlaceholder');
        if (!status) return;
        if (!message) {
            if (row) row.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'none';
            if (expandAllBtn) expandAllBtn.style.display = 'none';
            if (placeholder) placeholder.style.display = '';
            return;
        }
        if (row) row.style.display = 'flex';
        if (placeholder) placeholder.style.display = 'none';
        status.style.color = isError ? '#dc2626' : 'var(--muted-foreground, #666)';
        if (isHtml) { status.innerHTML = message; } else { status.textContent = message; }
        if (clearBtn) clearBtn.style.display = showClear ? 'inline-block' : 'none';
        if (expandAllBtn) expandAllBtn.style.display = showClear ? 'inline-block' : 'none';
    },

    _syncOpsExpandAllBtn(modal) {
        const btn = this._opsQuery(modal, '#wf-ops-team-expand-all-btn', 'teamSearchExpandAllBtnSync');
        if (!btn || btn.style.display === 'none') return;
        const cards = this._opsQuery(modal, '#wf-ops-team-search-cards', 'teamSearchExpandAllCards');
        if (!cards) return;
        const details = cards.querySelectorAll('.wf-ops-member-details');
        const anyOpen = Array.from(details).some((d) => d.open);
        btn.textContent = anyOpen ? 'Collapse All' : 'Expand All';
    },

    _clearOpsTeamSearchResults(modal) {
        this._abortOpsTeamSearchInFlight('results cleared');
        this._opsTeamSearchActive = null;
        this._opsTeamSearchMemberCache = null;
        this._opsTeamActiveFilters = null;
        this._opsMemberDetailsOpenIds = null;
        this._opsFellowsSearchComplete = null;
        this._opsExpertStatsHydrateGen++;
        if (this._opsExpertStatsCache) this._opsExpertStatsCache.clear();
        this._clearOpsMemberEditState();
        this._setOpsTeamSearchStatus(modal, '', false, false, false);

        const filterWrap = this._opsQuery(modal, '#wf-ops-team-filter-wrap', 'teamFilterWrapClear');
        const outputWrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchOutputClear');
        const btn = this._opsQuery(modal, '#wf-ops-team-search-btn', 'teamSearchBtnClear');

        if (filterWrap) filterWrap.style.display = 'none';
        if (Context.dashboard && typeof Context.dashboard.resetTeamMemberFilters === 'function') {
            Context.dashboard.resetTeamMemberFilters(modal);
        } else if (Context.dashboard && typeof Context.dashboard.resetTeamMemberMsDropdowns === 'function') {
            Context.dashboard.resetTeamMemberMsDropdowns(modal);
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
        this._opsExpertStatsCache.clear();
    },

    _getOpsTeamMemberTeamConstraints() {
        const dash = Context.dashboard;
        if (dash && typeof dash.readTeamMemberConstraints === 'function') {
            return dash.readTeamMemberConstraints('team-members-teams');
        }
        return { include: new Set(), exclude: new Set() };
    },

    _getOpsTeamMemberPermConstraints() {
        const dash = Context.dashboard;
        if (dash && typeof dash.readTeamMemberConstraints === 'function') {
            return dash.readTeamMemberConstraints('team-members-permissions');
        }
        return { include: new Set(), exclude: new Set() };
    },

    _opsMemberMatchesTeamConstraints(member, constraints) {
        const include = constraints && constraints.include ? constraints.include : new Set();
        const exclude = constraints && constraints.exclude ? constraints.exclude : new Set();
        const teamLabels = member.teamLabels || new Set();
        if (include.size > 0) {
            let matched = false;
            for (const label of include) {
                if (teamLabels.has(label)) {
                    matched = true;
                    break;
                }
            }
            if (!matched) return false;
        }
        for (const label of exclude) {
            if (teamLabels.has(label)) return false;
        }
        return true;
    },

    _opsMemberMatchesPermConstraints(member, constraints) {
        const include = constraints && constraints.include ? constraints.include : new Set();
        const exclude = constraints && constraints.exclude ? constraints.exclude : new Set();
        const memberPerms = new Set(this._opsMemberPermissionKeys(member));
        if (include.size > 0) {
            let matched = false;
            for (const key of include) {
                if (memberPerms.has(key)) {
                    matched = true;
                    break;
                }
            }
            if (!matched) return false;
        }
        for (const key of exclude) {
            if (memberPerms.has(key)) return false;
        }
        return true;
    },

    _opsMemberHasActiveConstraints(constraints) {
        if (!constraints) return false;
        return (constraints.include && constraints.include.size > 0)
            || (constraints.exclude && constraints.exclude.size > 0);
    },

    _opsTeamSearchHasActiveFilters() {
        const active = this._opsTeamActiveFilters;
        if (active && active.numericFilters && active.numericFilters.length > 0) return true;
        const tc = this._getOpsTeamMemberTeamConstraints();
        const pc = this._getOpsTeamMemberPermConstraints();
        const bc = this._getOpsTeamMemberBadgeConstraints();
        return (tc.include.size > 0 || tc.exclude.size > 0 || pc.include.size > 0 || pc.exclude.size > 0
            || bc.size > 0);
    },

    _opsTeamMemberNumericFieldValue(memberId, field) {
        const entry = this._opsExpertStatsCache && this._opsExpertStatsCache.get(memberId);
        if (!entry || entry.loading || entry.error) return null;
        if (!entry.creator && !entry.qa) return null;
        switch (field) {
            case 'tasks_submitted':
                return entry.creator && entry.creator.totalSubmissions != null
                    ? Number(entry.creator.totalSubmissions) : null;
            case 'tasks_reviewed': {
                if (!entry.qa) return null;
                const reviews = entry.qa.reviewsCompleted ?? entry.qa.totalReviews
                    ?? entry.qa.tasksReviewed ?? entry.qa.tasksCompleted;
                return reviews != null ? Number(reviews) : null;
            }
            case 'submission_ar':
                return entry.creator && entry.creator.acceptanceRate != null
                    ? Number(entry.creator.acceptanceRate) : null;
            case 'qa_ar':
                return this._opsExpertQaAcceptanceRatePercent(entry.qa);
            case 'avg_writing_time':
                return entry.creator && entry.creator.avgCreationTimeSeconds != null
                    ? Number(entry.creator.avgCreationTimeSeconds) / 60 : null;
            case 'avg_qa_time': {
                if (!entry.qa) return null;
                const avgSec = entry.qa.avgReviewTimeSeconds ?? entry.qa.avgQaTimeSeconds
                    ?? entry.qa.avgTimePerQaSeconds ?? entry.qa.avgReviewDurationSeconds;
                return avgSec != null ? Number(avgSec) / 60 : null;
            }
            default:
                return null;
        }
    },

    _opsEvaluateNumericComparison(actual, comparator, expected) {
        if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
        switch (comparator) {
            case 'gt': return actual > expected;
            case 'gte': return actual >= expected;
            case 'lt': return actual < expected;
            case 'lte': return actual <= expected;
            case 'eq': return actual === expected;
            case 'neq': return actual !== expected;
            default: return true;
        }
    },

    _opsMemberMatchesNumericFilters(member, rows, andOr) {
        if (!rows || rows.length === 0) return true;
        const results = rows.map((row) => {
            const actual = this._opsTeamMemberNumericFieldValue(member.id, row.field);
            if (actual == null || !Number.isFinite(actual)) return null;
            return this._opsEvaluateNumericComparison(actual, row.comparator, row.value);
        });
        if (results.some((r) => r === null)) return true;
        if (andOr === 'or') return results.some((r) => r === true);
        return results.every((r) => r === true);
    },

    _opsCountTeamMembersPendingNumericStats(members, numericRows) {
        if (!numericRows || numericRows.length === 0 || !members || !members.length) return 0;
        let pending = 0;
        for (const member of members) {
            let needsStats = false;
            for (const row of numericRows) {
                const actual = this._opsTeamMemberNumericFieldValue(member.id, row.field);
                if (actual == null || !Number.isFinite(actual)) {
                    needsStats = true;
                    break;
                }
            }
            if (needsStats) pending++;
        }
        return pending;
    },

    _applyOpsTeamFilters(modal) {
        const cache = this._opsTeamSearchMemberCache;
        if (!cache) {
            Logger.warn('ops-tab: team filters apply skipped — no search cache');
            return;
        }
        const dash = Context.dashboard;
        if (dash && typeof dash.logApiClick === 'function') {
            dash.logApiClick('team-filters-apply');
        }
        const numeric = dash && typeof dash.readTeamMembersNumericFilters === 'function'
            ? dash.readTeamMembersNumericFilters(modal)
            : { rows: [], andOr: 'and' };
        const teamC = this._getOpsTeamMemberTeamConstraints();
        const permC = this._getOpsTeamMemberPermConstraints();
        this._opsTeamActiveFilters = {
            numericFilters: numeric.rows || [],
            andOr: numeric.andOr || 'and',
            teamConstraints: teamC,
            permConstraints: permC
        };
        if (dash && typeof dash.resetTeamMembersPage === 'function') dash.resetTeamMembersPage();
        this._renderOpsTeamSearchCards(modal, cache.memberMap, cache.allTeams, 0);
        void this._hydrateOpsTeamMemberStatsForVisible(modal);
        Logger.log('ops-tab: team filters applied — '
            + this._opsTeamActiveFilters.numericFilters.length + ' numeric, mode '
            + this._opsTeamActiveFilters.andOr
            + ', team constraints ' + (teamC.include.size + teamC.exclude.size)
            + ', perm constraints ' + (permC.include.size + permC.exclude.size));
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
        if (teamLabels.has(OPS_FLEET_FELLOWS_TEAM_LABEL)) return false;
        for (const label of teamLabels) {
            if (!OPS_TEAM_UI_BADGE_EXCLUDED_LABELS.has(label)) return true;
        }
        return false;
    },

    _opsMemberBadgeCategory(member) {
        const teamLabels = member.teamLabels || new Set();
        if (teamLabels.has(OPS_FLEET_FELLOWS_TEAM_LABEL)) return 'fellows';
        for (const label of teamLabels) {
            if (OPS_TEAM_EPIC_LABELS.has(label)) return 'epic';
        }
        if (teamLabels.size === 1 && teamLabels.has(OPS_TEAM_VERTICALS_ONLY_LABEL)) return 'verticals';
        if (this._opsMemberQualifiesForUiBadge(member)) return 'ui';
        return 'fellows';
    },

    _opsMemberBadgeHtml(category) {
        const styles = {
            ui: 'background:var(--brand,#4f46e5);color:#fff;',
            verticals: 'background:#0d9488;color:#fff;',
            epic: 'background:#7c3aed;color:#fff;',
            fellows: 'background:#64748b;color:#fff;'
        };
        const labels = {
            ui: 'UI',
            verticals: 'VERTICALS',
            epic: 'EPIC',
            fellows: 'FELLOWS'
        };
        const key = labels[category] ? category : 'fellows';
        return '<span style="display:inline-block;font-size:9px;font-weight:700;letter-spacing:0.04em;padding:1px 5px;border-radius:3px;'
            + (styles[key] || styles.fellows)
            + 'line-height:1.4;flex-shrink:0;">'
            + labels[key] + '</span>';
    },

    _getOpsTeamMemberBadgeConstraints() {
        const dash = Context.dashboard;
        if (dash && typeof dash.selectedMsValues === 'function') {
            return new Set(dash.selectedMsValues('team-members-badges'));
        }
        return new Set();
    },

    _opsMemberMatchesBadgeConstraints(member, selectedBadges) {
        const selected = selectedBadges || new Set();
        if (selected.size === 0) return true;
        return selected.has(this._opsMemberBadgeCategory(member));
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

        if (action === 'expert-stats-cred-refresh') {
            this._openOpsExpertProfileForCredRefresh(modal, memberId);
            return;
        }

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
        return '<a href="' + this._opsEscapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="wf-ops-profile-link-btn ' + this._opsDashBtnClass('basic', 'icon') + '" ' +
            'title="' + this._opsEscapeHtml(label) + '" aria-label="' + this._opsEscapeHtml(label) + '">' +
            this._opsProfileLinkIconSvg() + '</a>';
    },

    _opsSearchWorkerOutputBtnHtml(memberId) {
        const attrId = this._opsEscapeAttr(memberId);
        return '<button type="button" class="' + this._opsDashBtnClass('secondary', 'nav') + ' wf-ops-search-output-btn" data-ops-action="search-worker-output" data-ops-member-id="' + attrId + '" ' +
            'style="flex-shrink:0;white-space:nowrap;">Search Worker Output 🔦</button>';
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
        const dash = Context.dashboard;
        if (!dash || typeof dash.runContributorWorkerOutputDeepDive !== 'function') {
            Logger.warn('ops-tab: Search Worker Output skipped — dashboard deep dive unavailable');
            return;
        }
        Logger.log('ops-tab: Search Worker Output deep dive for ' + (person.full_name || person.id));
        void dash.runContributorWorkerOutputDeepDive(person, { activeTab: 'search-output' });
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

    _renderOpsTeamMemberTileHtml(member, allTeams, isOpen, teamsSearchComplete = true) {
        const memberId = member.id || '';
        const personChipsHtml = this._renderOpsTeamMemberPersonChipsHtml(member);
        const teamLabels = member.teamLabels || new Set();
        const session = this._getOpsMemberEditSession(memberId);
        const displayTeamLabels = session ? session.stagedTeams : teamLabels;
        const displayPermKeys = session ? session.stagedPerms : new Set(this._opsMemberPermissionKeys(member));
        const knownPermCount = OPS_ALL_PERMISSIONS.reduce((count, [key]) => count + (displayPermKeys.has(key) ? 1 : 0), 0);
        const memberBadgeHtml = teamsSearchComplete
            ? this._opsMemberBadgeHtml(this._opsMemberBadgeCategory(member))
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
                    memberBadgeHtml +
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
        this._renderOpsTeamSearchCards(modal, cache.memberMap, cache.allTeams, 0);
        void this._hydrateOpsTeamMemberStatsForVisible(modal);
    },

    _renderOpsTeamSearchCards(modal, memberMap, allTeams, pendingCount, openMemberIds) {
        const wrap = this._opsQuery(modal, '#wf-ops-team-search-output-wrap', 'teamSearchCards');
        const cards = this._opsQuery(modal, '#wf-ops-team-search-cards', 'teamSearchCardsInner');
        if (!wrap || !cards) return;

        const totalCount = memberMap.size;
        let members = [...memberMap.values()];

        const active = this._opsTeamActiveFilters;
        const numericRows = active && active.numericFilters ? active.numericFilters : [];
        const andOr = active ? active.andOr : 'and';
        members = members.filter((m) => this._opsMemberMatchesNumericFilters(m, numericRows, andOr));

        const teamC = this._getOpsTeamMemberTeamConstraints();
        const permC = this._getOpsTeamMemberPermConstraints();
        const badgeC = this._getOpsTeamMemberBadgeConstraints();
        members = members.filter((m) => this._opsMemberMatchesTeamConstraints(m, teamC));
        members = members.filter((m) => this._opsMemberMatchesPermConstraints(m, permC));
        members = members.filter((m) => this._opsMemberMatchesBadgeConstraints(m, badgeC));

        let resolvedOpenIds;
        if (this._opsMemberDetailsOpenIds !== null) {
            resolvedOpenIds = this._opsMemberDetailsOpenIds;
        } else if (openMemberIds instanceof Set) {
            resolvedOpenIds = openMemberIds;
        } else if (pendingCount === 0 && members.length > 0) {
            resolvedOpenIds = new Set(members.map((m) => m.id));
        } else {
            resolvedOpenIds = this._captureOpsOpenMemberDetails(modal);
        }

        if (members.length === 0) {
            if (pendingCount > 0) {
                wrap.style.display = 'none';
            } else {
                wrap.style.display = 'block';
                let msg = 'No members found.';
                const hasNumericFilters = numericRows && numericRows.length > 0;
                const hasConstraintFilters = (teamC.include.size > 0 || teamC.exclude.size > 0
                    || permC.include.size > 0 || permC.exclude.size > 0 || badgeC.size > 0);
                if (hasNumericFilters || hasConstraintFilters) msg = 'No results match filters.';
                cards.innerHTML = '<div style="text-align:center;padding:12px 0;font-size:12px;color:var(--muted-foreground,#666);">' + this._opsEscapeHtml(msg) + '</div>';
            }
            const dashEmpty = Context.dashboard;
            if (dashEmpty && typeof dashEmpty.syncTeamMembersPagerUi === 'function') {
                dashEmpty.syncTeamMembersPagerUi(modal, 0, pendingCount === 0);
            }
            return;
        }

        members.sort((a, b) => {
            const diff = (b.teamLabels ? b.teamLabels.size : 0) - (a.teamLabels ? a.teamLabels.size : 0);
            return diff !== 0 ? diff : (a.full_name || '').localeCompare(b.full_name || '');
        });

        const totalFiltered = members.length;
        const dash = Context.dashboard;
        if (dash && typeof dash.syncTeamMembersPagerUi === 'function') {
            dash.syncTeamMembersPagerUi(modal, totalFiltered, pendingCount === 0);
        }
        if (dash && typeof dash.getTeamMembersPageSlice === 'function') {
            members = dash.getTeamMembersPageSlice(members);
        }

        wrap.style.display = 'block';
        const teamsSearchComplete = pendingCount === 0;
        cards.innerHTML = members.map((m) =>
            this._renderOpsTeamMemberTileHtml(m, allTeams, resolvedOpenIds.has(m.id), teamsSearchComplete)).join('');

        this._syncOpsExpandAllBtn(modal);

        if (pendingCount === 0) {
            if (this._opsTeamSearchHasActiveFilters()) {
                let statusMsg = members.length + ' of ' + totalCount + ' member'
                    + (totalCount !== 1 ? 's' : '') + ' match filters.';
                const pendingStats = this._opsCountTeamMembersPendingNumericStats(members, numericRows);
                if (pendingStats > 0) {
                    statusMsg += ' Stats still loading for ' + pendingStats + ' member'
                        + (pendingStats !== 1 ? 's' : '') + '; results will update.';
                }
                this._setOpsTeamSearchStatus(modal, statusMsg, false, false, true);
            } else if (totalCount > 0) {
                this._setOpsTeamSearchStatus(modal,
                    totalCount + ' unique member' + (totalCount !== 1 ? 's' : '')
                        + ' across ' + allTeams.length + ' teams.',
                    false, false, true);
            }
            void this._hydrateOpsTeamMemberStatsForVisible(modal);
        }
    },

    async _handleOpsTeamSearch(modal) {
        const input = this._opsQuery(modal, '#wf-ops-team-search-input', 'teamSearchInput');
        const btn = this._opsQuery(modal, '#wf-ops-team-search-btn', 'teamSearchBtn');
        const query = input ? input.value.trim() : '';
        const dashLog = Context.dashboard;

        const userId = this._getOpsCurrentUserId();
        if (!userId) {
            if (dashLog && typeof dashLog.logApiSkip === 'function') dashLog.logApiSkip('team-search', 'no user id');
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

        this._reloadOpsTeamDashboardActionsFromStorage();
        if (!this._opsTeamSearchActionCache.nextAction) {
            this._showOpsTeamSearchActionRefreshBanner(modal);
            return;
        }

        this._clearOpsTeamSearchStaleBanner(modal);
        this._injectOpsSpinnerStyle();

        this._abortOpsTeamSearchInFlight('new search started');
        const abortController = new AbortController();
        this._opsTeamSearchAbortController = abortController;

        const sessionId = Date.now();
        this._opsTeamSearchActive = sessionId;
        this._opsTeamSearchMemberCache = null;
        this._opsTeamActiveFilters = null;
        this._opsMemberDetailsOpenIds = null;
        this._opsExpertStatsHydrateGen++;
        if (this._opsExpertStatsCache) this._opsExpertStatsCache.clear();
        this._clearOpsMemberEditState();

        if (btn) { btn.disabled = true; btn.textContent = 'Searching...'; }

        const filterWrap = this._opsQuery(modal, '#wf-ops-team-filter-wrap', 'teamFilterWrapShow');
        if (filterWrap) filterWrap.style.display = 'flex';
        if (Context.dashboard && typeof Context.dashboard.resetTeamMemberFilters === 'function') {
            Context.dashboard.resetTeamMemberFilters(modal);
        }
        this._populateOpsTeamMemberConstraintLists(allTeams, { loading: false, preserveSelections: false, modal });
        if (Context.dashboard && typeof Context.dashboard.resetTeamMembersPage === 'function') {
            Context.dashboard.resetTeamMembersPage();
        }
        if (Context.dashboard && typeof Context.dashboard.syncTeamMemberConstraintListsUi === 'function') {
            Context.dashboard.syncTeamMemberConstraintListsUi(modal);
        }

        const memberMap = new Map();
        let pendingCount = allTeams.length;
        let doneCount = 0;
        let staleActionDetected = false;

        this._opsFellowsSearchComplete = true;

        if (dashLog && typeof dashLog.logApiClick === 'function') {
            dashLog.logApiClick('team-search', (query ? '"' + query + '" · ' : '') + allTeams.length + ' team(s)');
        }

        const spinnerHtml = Context.uiLib && typeof Context.uiLib.spinnerHtml === 'function'
            ? Context.uiLib.spinnerHtml(10).replace('class="fleet-ui-spinner"', 'class="fleet-ui-spinner" style="vertical-align:middle;margin-right:5px;"')
            : '<span style="display:inline-block;width:10px;height:10px;border:2px solid rgba(79,70,229,0.2);border-top-color:var(--brand,#4f46e5);border-radius:50%;animation:fleet-ui-spin 0.7s linear infinite;vertical-align:middle;margin-right:5px;"></span>';
        this._setOpsTeamSearchStatus(modal, spinnerHtml + 'Searching ' + allTeams.length + ' teams…', false, true, false);

        const finishTeamSearch = (_teamLabel) => {
            pendingCount--;
            doneCount++;
            if (this._opsTeamSearchActive !== sessionId) return;
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
            if (!staleActionDetected && this._opsTeamSearchLikelyStaleEmptyResults(query, memberMap, allTeams)) {
                staleActionDetected = true;
                this._clearOpsTeamSearchActionCache();
                Logger.warn('ops-tab: team search returned zero members for all teams — treating credentials as stale');
            }
            if (staleActionDetected) {
                this._showOpsTeamSearchActionRefreshBanner(modal);
                this._opsTeamSearchMemberCache = null;
            } else {
                this._opsTeamSearchMemberCache = { memberMap, allTeams };
                this._indexOpsTeamMemberFiltersFromResults(memberMap, { preserveSelections: true, modal });
                this._renderOpsTeamSearchCards(modal, memberMap, allTeams, 0);
                void this._hydrateOpsTeamMemberStatsForVisible(modal);
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

    _updateVerifierContentSearchUi(modal) {
        const toolbar = this._opsQuery(modal, '#wf-ops-verifier-output-toolbar', 'verifierOutputToolbar');
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

        if (toolbar) {
            toolbar.style.display = hasOutput ? 'flex' : 'none';
        }
        if (searchWrap && !toolbar) {
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
        if (Context.verifierFetcherUi && typeof Context.verifierFetcherUi.syncOutputToolbar === 'function') {
            Context.verifierFetcherUi.syncOutputToolbar(modal);
        }
    },

    _clearVerifierContentSearch(modal) {
        const contentInput = this._opsQuery(modal, '#wf-ops-verifier-content-search', 'verifierContentSearchClearInput');
        if (contentInput) contentInput.value = '';
        this._applyVerifierContentSearch(modal, '');
        this._captureOpsTabState(modal);
        Logger.log('ops-tab: verifier content search cleared');
    },

    _scrollVerifierActiveContentMatchInElement(codeEl) {
        if (!codeEl) return;
        const active = codeEl.querySelector('.wf-ops-verifier-hit-active');
        if (active && typeof active.scrollIntoView === 'function') {
            active.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
    },

    _scrollVerifierActiveContentMatch(modal) {
        const output = this._opsQuery(modal, '#wf-ops-verifier-output', 'verifierOutputScroll');
        this._scrollVerifierActiveContentMatchInElement(output);
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

    async _refreshVerifierOutputDisplay(modal) {
        const wrap = this._opsQuery(modal, '#wf-ops-verifier-output-wrap', 'verifierOutputWrap');
        const output = this._opsQuery(modal, '#wf-ops-verifier-output', 'verifierOutput');
        const text = this._opsVerifierSourceText || '';
        const query = (this._opsVerifierContentSearch.query || '').trim();

        if (wrap) {
            wrap.style.display = text ? 'flex' : 'none';
            wrap.style.flexDirection = 'row';
        }
        if (!output) {
            this._updateVerifierContentSearchUi(modal);
            return;
        }

        this._opsVerifierContentSearch = await this._renderVerifierCodeElement(output, {
            text,
            searchState: this._opsVerifierContentSearch
        });

        if (query) {
            requestAnimationFrame(() => this._scrollVerifierActiveContentMatch(modal));
        }
        this._updateVerifierContentSearchUi(modal);
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
        const output = this._opsQuery(modal, '#wf-ops-verifier-output', 'verifierOutputStep');
        void this._stepVerifierContentMatchInElement(output, search, delta, () =>
            this._refreshVerifierOutputDisplay(modal)
        ).then((nextSearch) => {
            this._opsVerifierContentSearch = nextSearch;
            this._updateVerifierContentSearchUi(modal);
            requestAnimationFrame(() => this._scrollVerifierActiveContentMatch(modal));
            Logger.debug('ops-tab: verifier content match ' + (nextSearch.index + 1) + '/' + count);
        });
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
        if (!this._opsTabState) this._opsTabState = {};
        this._captureOpsTaskLinkState(modal);
        this._captureOpsTeamTabState(modal);
        this._captureOpsVerifierTabState(modal);
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
        this._restoreOpsTeamTabState(modal);
        this._restoreOpsVerifierTabState(modal);
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
        this._persistOpsPasswordHashSeen(this._getOpsPasswordHash());
        void this._loadOpsSecrets(true);
        if (typeof Context.ensureOpsDashboardPluginsLoaded === 'function') {
            try {
                await Context.ensureOpsDashboardPluginsLoaded();
            } catch (e) {
                Logger.warn('ops-tab: ensureOpsDashboardPluginsLoaded after unlock failed', e);
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
        Logger.debug('ops-tab: cleared invalid stored password');
    },

    _renderOpsSettingsSection() {
        const opsWantsEnabled = this._getOpsTabWanted();
        const opsHasStoredPassword = this._hasOpsStoredPassword();
        const switchHTML = this._renderOpsSwitchHTML('wf-ops-tab-enabled', opsWantsEnabled);
        const openOnSettings = this._getOpsDashboardOpenOnSettings();
        const submoduleSwitchHTML = this._renderOpsSubSwitchHTML('wf-ops-dashboard-open-on-settings', openOnSettings);
        const enableCardDisplay = opsHasStoredPassword ? 'block' : 'none';
        const passwordPanelDisplay = opsHasStoredPassword ? 'none' : 'block';
        const suboptionsDisplay = opsHasStoredPassword && opsWantsEnabled ? 'block' : 'none';
        const openDashboardBtnDisplay = opsHasStoredPassword && opsWantsEnabled ? 'block' : 'none';
        return `
            <div style="margin-bottom: 20px;">
                <div id="wf-ops-enable-wrap" style="display: ${enableCardDisplay};">
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
                        <button type="button" id="wf-ops-open-dashboard-btn" class="${this._opsDashBtnClass('secondary', 'regular')} wf-dash-btn--full" style="
                            display: ${openDashboardBtnDisplay};
                            margin-top: 10px;
                            box-sizing: border-box;
                        ">Open Dashboard</button>
                        <div id="wf-ops-dashboard-incomplete-msg" style="display: none; margin-top: 10px; padding: 10px 12px; font-size: 12px; color: #92400e; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; line-height: 1.45;">
                            Search Output module failed to load. Check the console or refresh the page.
                        </div>
                    </div>
                </div>
                </div>
                <div id="wf-ops-password-panel" style="display: ${passwordPanelDisplay}; margin-top: 10px; padding: 12px 14px; border: 1px solid var(--border, #e5e5e5); border-radius: 8px; background: var(--card, #fafafa);">
                    <label for="wf-ops-password-input" style="display: block; font-size: 12px; font-weight: 500; color: var(--foreground, #333); margin-bottom: 6px;">Ops Dashboard</label>
                    <div style="display: flex; gap: 8px; align-items: stretch;">
                        <input type="password" id="wf-ops-password-input" autocomplete="current-password" style="
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
                        <button type="button" id="wf-ops-password-submit" class="${this._opsDashBtnClass('primary', 'regular')}" style="
                            flex-shrink: 0;
                        ">Unlock</button>
                    </div>
                    <div id="wf-ops-password-error" style="display: none; margin-top: 8px; font-size: 12px; color: #dc2626; line-height: 1.45;"></div>
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
        if (enableWrap) enableWrap.style.display = hasPassword ? 'block' : 'none';
        if (passwordPanel) passwordPanel.style.display = hasPassword ? 'none' : 'block';
        if (wrap) wrap.style.display = hasPassword && wanted ? 'block' : 'none';
        if (openBtn) openBtn.style.display = hasPassword && wanted ? 'block' : 'none';
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
            Logger.warn('ops-tab: dashboard modules incomplete — Search Output may be unavailable');
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
        return '<a href="' + this._opsEscapeAttr(OPS_GRADE_ASSESSMENTS_URL) + '" target="_blank" rel="noopener noreferrer" '
            + 'id="wf-ops-grade-assessments" class="wf-dash-header-btn ' + this._opsDashBtnClass('basic', 'nav') + ' wf-ops-grade-header-link">Grade Assessments</a>';
    },


    async _handleOpsVerifierFetch(modal) {
        const input = this._opsQuery(modal, '#wf-ops-verifier-input', 'verifierInput');
        const fetchBtn = this._opsQuery(modal, '#wf-ops-fetch-verifier', 'verifierFetch');
        const dashLog = Context.dashboard;
        if (!input) return;
        const parsed = this._parseOpsVerifierInput(input.value);
        if (!parsed.taskKey && !parsed.taskId && !parsed.verifierKey && !parsed.verifierId) {
            if (dashLog && typeof dashLog.logApiSkip === 'function') {
                dashLog.logApiSkip('verifier-fetch', 'empty or invalid input');
            }
            this._setOpsVerifierStatus(modal, 'Paste a task key, task URL, verifier key, verifier ID, or seed data first.', true);
            void this._setOpsVerifierOutput(modal, '');
            this._captureOpsTabState(modal);
            return;
        }
        if (dashLog && typeof dashLog.logApiClick === 'function') {
            const detail = parsed.taskKey || parsed.taskId || parsed.verifierKey || parsed.verifierId || '';
            dashLog.logApiClick('verifier-fetch', String(detail).slice(0, 80));
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
            this._syncOpsToggleVisual(e.target);
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
            const self = this;
            void (async () => {
                if (typeof Context.ensureOpsDashboardPluginsLoaded === 'function') {
                    try {
                        await Context.ensureOpsDashboardPluginsLoaded();
                    } catch (e) {
                        Logger.warn('ops-tab: ensureOpsDashboardPluginsLoaded before open failed', e);
                    }
                }
                self._syncOpsDashboardIncompleteMessage(modal);
                if (Context.dashboard && typeof Context.dashboard.open === 'function') {
                    Context.dashboard.open();
                    Logger.log('ops-tab: opened Ops dashboard from settings');
                } else {
                    Logger.warn('ops-tab: Open Dashboard skipped — Context.dashboard unavailable');
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

    _captureOpsTeamTabState(modal) {
        if (!modal) return;
        const teamSearchInput = this._opsQuery(modal, '#wf-ops-team-search-input', 'teamSearchInputCapture');
        const teamSearchStatusRow = this._opsQuery(modal, '#wf-ops-team-search-status-row', 'teamSearchStatusRowCapture');
        const teamSearchStatus = this._opsQuery(modal, '#wf-ops-team-search-status', 'teamSearchStatusCapture');
        if (!this._opsTabState) this._opsTabState = {};
        this._opsTabState.teamSearchQuery = teamSearchInput ? teamSearchInput.value : '';
        this._opsTabState.teamSearchStatus = teamSearchStatusRow && teamSearchStatusRow.style.display !== 'none' && teamSearchStatus
            ? (teamSearchStatus.textContent || '')
            : '';
        this._opsTabState.teamSearchStatusIsError = teamSearchStatus ? teamSearchStatus.style.color === '#dc2626' : false;
    },

    _restoreOpsTeamTabState(modal) {
        if (!modal) return;
        const state = this._opsTabState;
        if (!state) return;
        const teamSearchInput = this._opsQuery(modal, '#wf-ops-team-search-input', 'teamSearchInputRestore');
        if (teamSearchInput && state.teamSearchQuery != null) {
            teamSearchInput.value = state.teamSearchQuery;
        }
        if (state.teamSearchStatus) {
            const showClear = /unique member/.test(state.teamSearchStatus) && /across/.test(state.teamSearchStatus);
            this._setOpsTeamSearchStatus(modal, state.teamSearchStatus, state.teamSearchStatusIsError, false, showClear);
        }
    },

    _captureOpsVerifierTabState(modal) {
        if (!modal) return;
        const verifierInput = this._opsQuery(modal, '#wf-ops-verifier-input', 'verifierInputCapture');
        const status = this._opsQuery(modal, '#wf-ops-verifier-status', 'verifierStatusCapture');
        const fetchState = this._opsVerifierFetchState;
        if (!this._opsTabState) this._opsTabState = {};
        this._opsTabState.verifierInput = verifierInput ? verifierInput.value : '';
        this._opsTabState.verifierStatus = status ? (status.textContent || '') : '';
        this._opsTabState.verifierStatusIsError = status ? status.style.color === '#dc2626' : false;
        this._opsTabState.verifierOutput = this._opsVerifierSourceText || '';
        this._opsTabState.verifierContentSearchQuery = this._opsVerifierContentSearch.query || '';
        this._opsTabState.verifierContentSearchIndex = this._opsVerifierContentSearch.index || 0;
        if (Context.verifierFetcherUi && typeof Context.verifierFetcherUi.captureScratchpadTabState === 'function') {
            this._opsTabState.verifierScratchpad = Context.verifierFetcherUi.captureScratchpadTabState(modal);
        }
        this._opsTabState.verifierFetchState = fetchState
            ? {
                resolved: fetchState.resolved,
                versions: fetchState.versions,
                selectedVersion: fetchState.selectedVersion
            }
            : null;
    },

    _restoreOpsVerifierTabState(modal) {
        if (!modal) return;
        const state = this._opsTabState;
        if (!state) return;
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
        if (Context.verifierFetcherUi && typeof Context.verifierFetcherUi.restoreScratchpadTabState === 'function') {
            Context.verifierFetcherUi.restoreScratchpadTabState(modal, state.verifierScratchpad || null);
        }
    },

    async _copyOpsVerifierCode(modal, verifierCopyBtn) {
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
    },

    _toggleOpsTeamExpandAll(modal) {
        const cards = this._opsQuery(modal, '#wf-ops-team-search-cards', 'teamSearchExpandAllCards');
        if (!cards) return;
        const details = [...cards.querySelectorAll('.wf-ops-member-details')];
        const anyOpen = details.some((d) => d.open);
        const shouldOpen = !anyOpen;
        if (this._opsMemberDetailsOpenIds === null) {
            this._opsMemberDetailsOpenIds = new Set();
        }
        details.forEach((d) => {
            d.open = shouldOpen;
            const memberId = d.getAttribute('data-member-id');
            if (!memberId) return;
            if (shouldOpen) this._opsMemberDetailsOpenIds.add(memberId);
            else this._opsMemberDetailsOpenIds.delete(memberId);
        });
        this._syncOpsExpandAllBtn(modal);
        Logger.log('ops-tab: team member cards ' + (shouldOpen ? 'expanded' : 'collapsed') + ' (' + details.length + ')');
    },

    _attachOpsTeamMemberDetailsToggle(modal) {
        if (!modal || modal.dataset.wfOpsMemberDetailsToggle === '1') return;
        modal.dataset.wfOpsMemberDetailsToggle = '1';
        modal.addEventListener('toggle', (e) => {
            const detailsEl = e.target;
            if (!detailsEl || !detailsEl.classList.contains('wf-ops-member-details')) return;
            const memberId = detailsEl.getAttribute('data-member-id');
            if (!memberId) return;
            if (this._opsMemberDetailsOpenIds === null) {
                const cache = this._opsTeamSearchMemberCache;
                const allIds = cache ? [...cache.memberMap.keys()] : [];
                this._opsMemberDetailsOpenIds = new Set(allIds);
            }
            if (detailsEl.open) this._opsMemberDetailsOpenIds.add(memberId);
            else this._opsMemberDetailsOpenIds.delete(memberId);
            this._syncOpsExpandAllBtn(modal);
        }, true);
    },

    _attachOpsTeamMemberEditDelegation(modal) {
        if (!modal || modal.dataset.wfOpsMemberEditDelegation === '1') return;
        modal.dataset.wfOpsMemberEditDelegation = '1';
        modal.addEventListener('click', (e) => {
            this._handleOpsMemberEditClick(e, modal);
        });
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

        const gradeAssessmentsLink = this._opsQuery(modal, '#wf-ops-grade-assessments', 'opsGradeAssessmentsAttach');
        if (gradeAssessmentsLink) {
            gradeAssessmentsLink.addEventListener('click', () => {
                Logger.log('ops-tab: grade assessments opened');
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
