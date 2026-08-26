// search-output-left-pane.js — Worker Output Search left pane

// ============= search-output.js =============
// Worker Output Search tab for the Ops dashboard.

// ============= dashboard.js =============
// Worker Output Search (Ops dashboard): search output, team members, verifier fetch.
//
// This is the live port of the local prototype in local/dashboard. All data is
// PostgREST table/query shapes come from the encrypted ops bundle (Context.opsTab).
// which reuses the exact same Supabase runtime config + session token gathering as the
// people lookup tool (cookies / sb-*-auth-token JWT). No secrets are hardcoded here.
//
// Porting notes / oddities live in local/dashboard/reference/dashboard-live-port-handoff.md.

const DASH_BOOTSTRAP_STORAGE_KEY = 'fleet-ux:dashboard-bootstrap';
const DASH_RESULTS_MODE_STORAGE_KEY = 'fleet-ux:dashboard-results-mode';
const DASH_INITIAL_HYDRATE_CAP = 500;
const DASH_RESULTS_PAGE_SIZE_KEY = 'fleet-ux:dashboard-results-page-size';
const DASH_CARD_TAB_HEIGHT = '24px';
const DASH_CARD_BORDER = '2px solid color-mix(in srgb, var(--foreground, #0f172a) 28%, var(--border, #cbd5e1))';
const DASH_CARD_TAB_BORDER = '1px solid color-mix(in srgb, var(--foreground, #0f172a) 28%, var(--border, #cbd5e1))';
const DASH_TASK_CARD_BG = 'var(--card, #ffffff)';
const DASH_HYDRATE_BATCH_MAX = 100;
const DASH_HYDRATE_BATCH_CONCURRENCY = 5;
const DASH_SEARCH_FETCH_CONCURRENCY = 8;
const DASH_HELPFULNESS_BATCH_CHUNK = 100;
const DASH_RESULTS_PAGE_SIZE_DEFAULT = 100;
const DASH_BOOTSTRAP_VERSION = 3;
const DASH_BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const DASH_FLEET_ORIGIN_FALLBACK = 'https://www.fleetai.com';
const DASH_FLEET_HOSTS = new Set(['www.fleetai.com', 'fleetai.com']);
const DASH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DASH_EVERYONE_AUTHOR_TOKEN_ID = '__everyone__';
const DASH_EVERYONE_AUTHOR_LABEL = '@everyone';
/** Fleet eval_tasks.key shape, e.g. task_iyasykc1wvkn_1781012033021_oyzfvsbk0 */
const DASH_TASK_KEY_RE = /^task_[A-Za-z0-9_]+$/;
const DASH_TASKS_PAGE_SIZE = 250;
const DASH_QA_PAGE_SIZE = 250;
const DASH_DISPUTES_PAGE_SIZE = 250;
const DASH_DISPUTES_MAX_PAGES = 100;
const DASH_DISPUTES_TASK_FETCH_CONCURRENCY = 5;
const DASH_FLEET_FLAGS_PATH = '/task-flags';
const DASH_QA_SCREENSHOT_VIEW_URLS_PATH = '/orchestrator-private/v1/qa-feedback/screenshots/view-urls';
const DASH_FLAG_CREATE_REASON_KEYS = [
    'ai_generated',
    'poor_feedback_from_previous_qa',
    'possible_duplicate',
    'other'
];
const DASH_DISPUTE_RESOLUTION_OPTIONS = [
    {
        key: 'flag_bugged_accept_dispute',
        label: 'Flag As Bugged (Accept Dispute)',
        status: 'approved',
        skipWorkflowSignal: true,
        flagAsBugged: true
    },
    {
        key: 'flag_bugged_reject_dispute',
        label: 'Flag As Bugged (Reject Dispute)',
        status: 'rejected',
        skipWorkflowSignal: true,
        flagAsBugged: true
    },
    { key: 'rejected', label: 'Reject Dispute', status: 'rejected' },
    { key: 'approved_with_revisions', label: 'Approve & Return to Writer', status: 'approved_with_revisions' },
    { key: 'approved', label: 'Approve Dispute', status: 'approved' },
    { key: 'approved_and_accepted', label: 'Approve & Accept Task', status: 'approved_and_accepted' }
];
/** Fleet dispute “Flag as Bug” categories (labels sent in resolutionReason brackets). */
const DASH_DISPUTE_BUG_CATEGORIES = [
    { key: 'environment_broken', label: 'Environment is broken or misconfigured' },
    { key: 'impossible_story', label: 'User story is impossible to complete' },
    { key: 'missing_data', label: 'Required data/state is missing from environment' },
    { key: 'conflicting_requirements', label: 'User story has conflicting requirements' },
    { key: 'unsupported_actions', label: 'App does not support required actions' },
    { key: 'grading_broken', label: 'Task cannot be graded correctly' },
    { key: 'other', label: 'Other' }
];
const DASH_AUTO_GROW_TEXTAREA_MIN_PX = 48;
const DASH_DISPUTE_RESOLUTION_REASON_MIN_CHARS = 50;
const DASH_AUTO_GROW_TEXTAREA_ATTR = 'data-wf-dash-auto-grow';
const DASH_PREFETCH_KINDS = ['openDisputes', 'resolvedDisputes', 'pendingFlags', 'resolvedFlags'];
/** Stop disputes bulk pagination after this many pages with zero date-filter matches (client-side filter). */
const DASH_DISPUTES_DATE_FILTER_MAX_EMPTY_PAGES = 3;
const DASH_FLEET_INTERNAL_API = 'https://api.internal.fleet-platform.fleetai.com/v1';
const DASH_DISPUTE_REVIEWS_HISTORY_PAGE_SIZE = 50;
const DASH_DISPUTE_REVIEWS_HISTORY_MAX_PAGES = 3;
const SO_ROLLING_OVERLAY_OUTSET = 6;

/** Same-site Fleet web origin (apex or www). Avoids cross-origin API calls when the page is on fleetai.com. */
function dashFleetOrigin() {
    try {
        let win = null;
        if (typeof Context !== 'undefined' && typeof Context.getPageWindow === 'function') {
            win = Context.getPageWindow();
        }
        if (!win) win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const host = win && win.location && win.location.hostname;
        const origin = win && win.location && win.location.origin;
        if (origin && host && DASH_FLEET_HOSTS.has(host)) return origin;
    } catch (e) { /* ignore */ }
    return DASH_FLEET_ORIGIN_FALLBACK;
}

const DASH_OUTPUT_KIND_CONFIG = {
    task_creation: {
        label: 'Task Creation',
        tabBg: '#16a34a',
        toggleActive: 'border: 2px solid #16a34a; color: #15803d; background: transparent;',
        toggleActiveDark: 'border: 2px solid #22c55e; color: #4ade80; background: transparent;',
        textHighlight: 'font-weight: 600; color: #15803d;'
    },
    qa: {
        label: 'QA',
        tabBg: '#2563eb',
        toggleActive: 'border: 2px solid #2563eb; color: #1d4ed8; background: transparent;',
        toggleActiveDark: 'border: 2px solid #3b82f6; color: #60a5fa; background: transparent;',
        textHighlight: 'font-weight: 600; color: #1d4ed8;'
    },
    dispute: {
        label: 'Disputes',
        tabBg: '#7c3aed',
        toggleActive: 'border: 2px solid #7c3aed; color: #6d28d9; background: transparent;',
        toggleActiveDark: 'border: 2px solid #8b5cf6; color: #a78bfa; background: transparent;',
        textHighlight: 'font-weight: 600; color: #6d28d9;'
    },
    senior_review: {
        label: 'Sr Review',
        tabBg: '#ca8a04',
        toggleActive: 'border: 2px solid #ca8a04; color: #a16207; background: transparent;',
        toggleActiveDark: 'border: 2px solid #eab308; color: #facc15; background: transparent;',
        textHighlight: 'font-weight: 600; color: #a16207;'
    },
    sessions: {
        label: 'Sessions',
        tabBg: '#0891b2',
        toggleActive: 'border: 2px solid #0891b2; color: #0e7490; background: transparent;',
        toggleActiveDark: 'border: 2px solid #0891b2; color: #22d3ee; background: transparent;',
        textHighlight: 'font-weight: 600; color: #0e7490;'
    }
};

const DASH_TOGGLE_INACTIVE = 'border: 2px solid var(--border, #e2e8f0); color: var(--muted-foreground, #64748b); background: transparent; opacity: 0.6;';
const DASH_FLAGGED_COLOR = '#a16207';
const DASH_FLAGGED_BORDER = '#ca8a04';
const DASH_FLAGGED_BG = 'color-mix(in srgb, #ca8a04 14%, transparent)';
const DASH_VERSION_MODE_CONTRIBUTOR = 'contributor_match';
const DASH_VERSION_MODE_V1 = 'all_v1';
const DASH_VERSION_MODE_FINAL = 'all_final';

function dashFilterScopes() {
    const lib = Context.dashboardLib;
    return (lib && lib.filterScopes) || [];
}

function dashSortDefault() {
    const lib = Context.dashboardLib;
    return (lib && lib.sortDefault) || 'task_submitted:desc';
}

function dashSortOptions() {
    const lib = Context.dashboardLib;
    return (lib && lib.sortOptions) || [];
}

function dashSortMetrics() {
    const lib = Context.dashboardLib;
    return (lib && lib.sortMetrics) || [];
}

function dashKindMergeOrder() {
    const lib = Context.dashboardLib;
    return (lib && lib.outputKindMergeOrder) || [];
}

function dashKindLabels() {
    const lib = Context.dashboardLib;
    return (lib && lib.outputKindLabels) || {};
}

function dashManualFilterFields() {
    const lib = Context.dashboardLib;
    return (lib && lib.manualFilterFields) || [];
}

function dashDefaultManualFilterStageRows() {
    const lib = Context.dashboardLib;
    return lib && typeof lib.defaultManualFilterStageRows === 'function'
        ? lib.defaultManualFilterStageRows()
        : [];
}

function dashManualFilterWordCount(text) {
    const lib = Context.dashboardLib;
    return lib && typeof lib.manualFilterWordCount === 'function'
        ? lib.manualFilterWordCount(text)
        : 0;
}

function dashNoneSelectedHint() {
    const lib = Context.dashboardLib;
    return (lib && lib.noneSelectedHint) || 'None selected = all.';
}

function dashSubstringFilterHelp() {
    const lib = Context.dashboardLib;
    return (lib && lib.substringFilterHelp) || '';
}

function dashResultsModeHints() {
    const lib = Context.dashboardLib;
    return (lib && lib.resultsModeHints) || {};
}

function dashLib() {
    return Context.dashboardLib;
}

function dashEscHtml(value) {
    const lib = dashLib();
    return lib && lib.escHtml ? lib.escHtml(value) : String(value == null ? '' : value);
}

function dashPgInFilter(values) {
    return dashLib().pgInFilter(values);
}

function dashPgInChunks(values) {
    return dashLib().pgInChunks(values);
}

function dashDateInputValue(date) {
    return dashLib().dateInputValue(date);
}

function dashQuickDatePresetRange(preset) {
    return dashLib().quickDatePresetRange(preset);
}

function dashValidateCreatedAtRange(afterLocal, beforeLocal) {
    return dashLib().validateCreatedAtRange(afterLocal, beforeLocal);
}

function dashQaTextBlockLabel(label, isPositive) {
    return dashLib().qaTextBlockLabel(label, isPositive);
}

// ── Fleet URLs (ported from lib/fleetUrls.js) ──

function dashFleetExpertUrl(profileId) {
    const id = String(profileId || '').trim();
    return id ? `${dashFleetOrigin()}/dashboard/data/experts/${encodeURIComponent(id)}` : '';
}
function dashFleetTaskUrl(taskId) {
    const id = String(taskId || '').trim();
    return id ? `${dashFleetOrigin()}/dashboard/data/tasks/${encodeURIComponent(id)}` : '';
}
function dashFleetProjectUrl(projectId) {
    const id = String(projectId || '').trim();
    return id ? `${dashFleetOrigin()}/dashboard/data/projects/${encodeURIComponent(id)}` : '';
}
function dashFleetDisputeUrl(disputeId) {
    const id = String(disputeId || '').trim();
    return id ? `${dashFleetOrigin()}/work/problems/disputes/${encodeURIComponent(id)}` : '';
}

// ── Formatting ──

function dashFormatCreatedAt(iso) {
    const lib = dashLib();
    return lib && lib.formatCreatedAt ? lib.formatCreatedAt(iso) : String(iso || '—');
}

function dashProblemCreationDurationText(seconds) {
    const total = Math.round(Number(seconds));
    if (!Number.isFinite(total) || total < 0) return '';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const parts = [];
    if (h > 0) parts.push(h + (h === 1 ? ' hr' : ' hrs'));
    if (m > 0) parts.push(m + (m === 1 ? ' min' : ' mins'));
    if (parts.length === 0 && total > 0) return '< 1 min';
    return parts.join(', ');
}

function dashTimestampWithDurationParts(iso, durationSeconds) {
    const formatted = dashFormatCreatedAt(iso);
    const ago = dashLib().relativeAgo(iso, { style: 'compact' });
    const durationSec = durationSeconds != null ? Number(durationSeconds) : NaN;
    const durationText = Number.isFinite(durationSec) && durationSec >= 0
        ? dashProblemCreationDurationText(durationSec)
        : '';
    return { formatted, ago, durationText };
}

function dashTimestampWithDurationHtml(iso, durationSeconds) {
    const { formatted, ago, durationText } = dashTimestampWithDurationParts(iso, durationSeconds);
    const muted = 'font-size: 11px; color: var(--muted-foreground, #64748b);';
    const regular = 'color: var(--foreground, #0f172a);';
    const parts = [`<span style="${regular}">${dashEscHtml(formatted)}</span>`];
    if (ago) {
        parts.push(`<span style="${muted}">(${dashEscHtml(ago)})</span>`);
    }
    if (durationText) {
        parts.push(`<span style="${muted}"> in </span><span style="${regular}">${dashEscHtml(durationText)}</span>`);
    }
    return `<span style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">${parts.join('')}</span>`;
}

function dashLabeledTimestampWithDurationPlainText(label, iso, durationSeconds) {
    const { formatted, ago, durationText } = dashTimestampWithDurationParts(iso, durationSeconds);
    let text = String(label || '').trim();
    if (text) text += ' ';
    text += formatted;
    if (ago) text += ` (${ago})`;
    if (durationText) text += ` in ${durationText}`;
    return text;
}

/** PostgREST may return an embed as one object or an array — normalize to a single row. */
function dashFirstEmbed(embed) {
    if (!embed) return null;
    if (Array.isArray(embed)) return embed[0] || null;
    if (typeof embed === 'object') return embed;
    return null;
}

// ── HTML escaping ──



const searchOutputLeftPaneMethods = {
    _leftPanelHtml(opts) {
        const options = opts || {};
        const wsId = options.wsId || 'search-output';
        const hideSearch = Boolean(options.hideSearch);
        const ui = Context.uiLib;
        if (ui && typeof ui.ensureSegmentStyles === 'function') {
            ui.ensureSegmentStyles('#wf-dash-modal');
        }
        if (ui && typeof ui.ensureFilterToggleStyles === 'function') {
            ui.ensureFilterToggleStyles('#wf-dash-modal');
        }
        const box = this._panelBoxStyle();
        const label = this._labelStyle();
        const hint = this._hintStyle();
        const input = this._inputStyle();
        const section = this._searchSectionStyle();
        const ws = this._ws(wsId);
        const retrieveInputVal = dashEscHtml((ws && ws.retrieveInput) || '');
        let leftTab = ws ? ws.leftTab : (hideSearch ? 'filters' : 'search');
        if (hideSearch) leftTab = 'filters';
        const el = (rest) => this._outputDomAttrs(rest, wsId);
        const msOpts = { wsId };
        const searchPanelHtml = hideSearch ? '' : `
                        <div ${el('left-panel-search')} style="display: ${leftTab === 'search' ? 'flex' : 'none'}; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 14px; gap: 12px;">
                            <div ${el('section-contributor')} style="${section}">
                                <div style="${label} font-weight: 600;">Contributor Search</div>
                                <div ${el('search-fields')} style="display: flex; flex-direction: column; gap: 14px;">
                                    <div>
                                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                            ${this._filterToggleHtml('wf-dash-toggle-tasks', 'Task Creation', true, 'task_creation')}
                                            ${this._filterToggleHtml('wf-dash-toggle-qa', 'QA', true, 'qa')}
                                            ${this._filterToggleHtml('wf-dash-toggle-disputes', 'Disputes', false, 'dispute')}
                                            ${this._filterToggleHtml('wf-dash-toggle-senior-review', 'Sr Review', false, 'senior_review')}
                                            ${this._filterToggleHtml('wf-dash-toggle-sessions', 'Sessions', false, 'sessions')}
                                        </div>
                                    </div>
                                    <div>
                                        <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Contributors</label>
                                        <div ${el('author-box')} style="${input} display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 36px; cursor: text;">
                                            <input type="text" ${el('author-input')} autocomplete="off" placeholder="Name, email, or UUID — Enter to resolve" style="flex: 1; min-width: 120px; border: none; outline: none; background: transparent; font-size: 12px; color: var(--foreground, #0f172a); padding: 2px 0;">
                                        </div>
                                        <div ${el('author-error')} style="display: none; font-size: 11px; color: var(--destructive, #dc2626); margin-top: 4px;"></div>
                                        <div ${el('author-candidates')} style="display: none; margin-top: 6px; ${box}"></div>
                                        <div style="${hint} margin-top: 4px;">Empty = all workers. ${dashEscHtml(DASH_EVERYONE_AUTHOR_LABEL)} — bulk ratings for everyone in results.</div>
                                    </div>
                                    <div>
                                        <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Quick range</label>
                                        <select ${el('quick-range')} style="${input} width: 100%; cursor: pointer;">
                                            <option value="">Custom</option>
                                            <option value="all-time">All Time</option>
                                            <option value="today">Today</option>
                                            <option value="yesterday">Yesterday</option>
                                            <option value="3d">Last 3 Days</option>
                                            <option value="7d">Last 7 Days</option>
                                            <option value="30d">Last 30 Days</option>
                                            <option value="last-week">Last Calendar Week</option>
                                            <option value="this-month">This Month</option>
                                            <option value="last-month">Last Calendar Month</option>
                                            <option value="this-year">This Year</option>
                                            <option value="last-year">Last Calendar Year</option>
                                        </select>
                                    </div>
                                    <div style="display: flex; align-items: flex-end; gap: 8px; min-width: 0;">
                                        <div style="flex: 1; min-width: 0;">
                                            <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">After</label>
                                            <input type="date" ${el('after')} style="${input} min-width: 0;">
                                        </div>
                                        <div style="flex: 1; min-width: 0;">
                                            <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Before</label>
                                            <input type="date" ${el('before')} style="${input} min-width: 0;">
                                        </div>
                                        <button type="button" ${el('clear-dates')} aria-label="Clear dates" title="Clear dates" style="${this._inputClearBtnStyle()} display: none;">&times;</button>
                                    </div>
                                    <div>
                                        <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;" for="${dashEscHtml(this._outputDomId('search-limit', wsId))}">Limit</label>
                                        <input type="number" ${el('search-limit')} min="1" step="1" inputmode="numeric" placeholder="No limit" style="${input} width: 100%;">
                                    </div>
                                    <div>
                                        <div style="${label} margin-bottom: 6px; font-weight: 600;">Team, projects, environments</div>
                                        <div style="${hint} margin-bottom: 8px;">${dashEscHtml(dashNoneSelectedHint())}</div>
                                        <div style="display: flex; flex-direction: column; gap: 12px;">
                                            ${this._multiSelectHtml('search-envs', 'Environment', 'All environments', true, msOpts)}
                                            ${this._multiSelectHtml('search-projects', 'Project', 'All projects', true, msOpts)}
                                            ${this._multiSelectHtml('search-teams', 'Team', 'All teams', true, msOpts)}
                                        </div>
                                    </div>
                                </div>
                                ${this._resultsModeToggleHtml('contributor')}
                                <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 4px;">
                                    <button type="button" ${el('clear-params')} class="${this._dashBtnClass('basic', 'nav')}">Reset</button>
                                    <button type="button" ${el('search')} class="${this._dashBtnClass('primary', 'nav')}">Search</button>
                                </div>
                            </div>
                            <div ${el('section-retrieve')} style="${section}">
                                <div style="${label} font-weight: 600;">Retrieve Task</div>
                                <p style="${hint} margin: 0; line-height: 1.45;">Enter a task ID, version ID, task key, or list of such items. URLs also accepted</p>
                                <textarea ${el('retrieve-input')} rows="1" autocomplete="off" placeholder="Task ID(s), key(s), URL(s), or list" style="${input} resize: vertical; min-height: 36px; line-height: 1.4;">${retrieveInputVal}</textarea>
                                <div ${el('retrieve-error')} style="display: none; font-size: 11px; color: var(--destructive, #dc2626);"></div>
                                ${this._resultsModeToggleHtml('retrieve')}
                                <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 4px;">
                                    <button type="button" ${el('retrieve-clear')} class="${this._dashBtnClass('basic', 'nav')}">Clear</button>
                                    <button type="button" ${el('retrieve-clipboard')} class="${this._dashBtnClass('basic', 'nav')}">Clipboard</button>
                                    <button type="button" ${el('retrieve-btn')} class="${this._dashBtnClass('primary', 'nav')}">Retrieve</button>
                                </div>
                            </div>
                        </div>`;
        const navTabs = hideSearch
            ? `<div style="display: flex; gap: 0; min-width: 0;">
                                <span style="${this._leftTabStyle(true)}">Filters</span>
                            </div>`
            : `<div style="display: flex; gap: 0; min-width: 0;">
                                <button type="button" data-wf-dash-left-tab="search" style="${this._leftTabStyle(leftTab === 'search')}">Search</button>
                                <button type="button" data-wf-dash-left-tab="filters" style="${this._leftTabStyle(leftTab === 'filters')}">Filters</button>
                            </div>`;
        return `
                    <div style="${box} display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;" data-wf-dash-output-ws="${dashEscHtml(wsId)}"${hideSearch ? ' data-wf-dash-hide-search="1"' : ''}>
                        <nav style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 0 8px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;" aria-label="${hideSearch ? 'Filters' : 'Search and filters'}">
                            ${navTabs}
                            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                                <div ${el('actions-filters')} style="display: ${leftTab === 'filters' ? 'flex' : 'none'}; align-items: center; gap: 8px;">
                                    <button type="button" ${el('reset-filters')} class="${this._dashBtnClass('basic', 'nav')}">Reset</button>
                                    <button type="button" ${el('apply-filters')} class="${this._dashBtnClass('primary', 'nav')}">Apply</button>
                                </div>
                            </div>
                        </nav>
                        ${searchPanelHtml}
                        <div ${el('left-panel-filters')} style="display: ${leftTab === 'filters' ? 'flex' : 'none'}; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                            <div style="flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 14px; display: flex; flex-direction: column; gap: 14px;">
                                <div ${el('filter-kind-tab-wrap')} style="display: none;">
                                    <div ${el('filter-kind-tab-buttons')} style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
                                </div>
                                <div>
                                    <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Substring</label>
                                    <p style="${hint} margin: 0 0 8px 0; line-height: 1.45;">${dashEscHtml(dashSubstringFilterHelp())}</p>
                                    <div style="position: relative; min-width: 0;">
                                        <textarea ${el('prompt')} rows="1" placeholder="Filter by substring/RegEx" style="${input} padding-right: 34px; resize: none; overflow: hidden; line-height: 1.4; min-height: 36px;"></textarea>
                                        <button type="button" ${el('clear-prompt')} aria-label="Clear substring" title="Clear substring" style="${this._inputClearBtnStyle()} position: absolute; right: 4px; top: 4px; width: 26px; height: 26px; font-size: 15px; display: none;">&times;</button>
                                    </div>
                                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 8px;">
                                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                            <input type="checkbox" ${el('case')}> Case sensitive
                                        </label>
                                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                            <input type="checkbox" ${el('fuzzy')}> Fuzzy
                                        </label>
                                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                            <input type="checkbox" ${el('regex')}> RegEx (ECMAScript)
                                        </label>
                                    </div>
                                </div>
                                <div ${el('filter-lists-wrap')}>
                                    <div style="${label} margin-bottom: 6px; font-weight: 600; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                        <span>Narrow results</span>
                                        <button type="button" ${el('filter-expand-all')} aria-label="Expand all filter menus" style="flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 2px 8px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; background: transparent; color: var(--muted-foreground, #64748b); cursor: pointer;">Expand All</button>
                                    </div>
                                    <div style="${hint} margin-bottom: 8px;">${dashEscHtml(dashNoneSelectedHint())}</div>
                                    <div ${el('filter-lists')} style="display: flex; flex-direction: column; gap: 12px;">
                                        ${dashFilterScopes().map((s) => this._multiSelectHtml(s.scopeKey, this._filterScopeLabel(s.scopeKey), 'Run a search to enable', true, msOpts)).join('')}
                                    </div>
                                </div>
                                <div ${el('manual-filter-wrap')}>
                                    <div style="${label} margin-bottom: 8px; font-weight: 600; color: var(--foreground, #0f172a);">Manual filters</div>
                                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
                                        <span style="${hint} margin: 0;">Click Apply to update changes</span>
                                        <label style="display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--muted-foreground, #64748b); cursor: pointer; flex-shrink: 0;">
                                            <input type="checkbox" ${el('manual-andor')} style="margin: 0;">
                                            <span>Match any (OR)</span>
                                        </label>
                                    </div>
                                    <div ${el('manual-rows')} style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 8px; min-width: 0; max-width: 100%; overflow-x: hidden;"></div>
                                    <button type="button" ${el('manual-add')} class="${this._dashBtnClass('basic', 'nav')} wf-dash-btn--full" style="padding: 6px 10px;">+ Add group</button>
                                </div>
                            </div>
                        </div>

                        <div ${el('left-messages')} style="display: none; flex-shrink: 0; padding: 8px 14px; border-top: 1px solid var(--border, #e2e8f0); background: var(--card, #ffffff); font-size: 11px; line-height: 1.4; flex-direction: column; gap: 6px;">
                            <div ${el('session-refresh-banner')} style="display: none;"></div>
                            <div ${el('bootstrap-error')} style="display: none; font-size: 12px; color: var(--destructive, #dc2626);"></div>
                            <div ${el('universal-hint')} style="display: none; font-weight: 400; color: var(--muted-foreground, #64748b);"></div>
                            <div ${el('range-error')} style="display: none; color: var(--destructive, #dc2626);"></div>
                            <div ${el('search-error')} style="display: none; font-size: 12px; color: var(--destructive, #dc2626);"></div>
                            <div ${el('substring-error')} style="display: none; color: var(--destructive, #dc2626);"></div>
                            <div ${el('apply-hint')} style="display: none; color: var(--muted-foreground, #64748b);"></div>
                        </div>
                    </div>`;
    },

    async _searchPersons(query) {
        const q = (query || '').trim();
        if (!q) return [];
        if (DASH_UUID_RE.test(q)) {
            const rows = await this._pgQuery('profiles.select_person', { id: 'eq.' + q, limit: 1 }, 'author');
            return rows.map((p) => ({ id: p.id, full_name: p.full_name, email: p.email }));
        }
        const safe = q.replace(/[(),*]/g, ' ').trim();
        if (!safe) return [];
        const rows = await this._pgQuery('profiles.select_person', {
            or: `(full_name.ilike.*${safe}*,email.ilike.*${safe}*)`,
            order: 'full_name.asc',
            limit: 50
        }, 'author');
        const mapped = rows.map((p) => ({ id: p.id, full_name: p.full_name, email: p.email }));
        return this._filterAndRankPersons(mapped, q);
    },

    _personRawName(person) {
        return String(person && (person.full_name ?? person.name) || '').trim();
    },

    _personNameLooksLikeId(rawName, id) {
        return Boolean(rawName && id && rawName.toLowerCase() === id.toLowerCase());
    },

    _personChipName(profile, personId) {
        if (!profile) return '';
        const rawName = this._personRawName(profile);
        const id = String(personId || profile.id || '').trim();
        return this._personNameLooksLikeId(rawName, id) ? '' : rawName;
    },

    _personDisplayLabel(person) {
        if (!person) return '';
        const id = String(person.id || '').trim();
        const rawName = this._personRawName(person);
        const email = String(person.email || '').trim();
        const name = this._personNameLooksLikeId(rawName, id) ? '' : rawName;
        return name || email || id;
    },

    _personSearchHaystack(person) {
        return `${person.full_name || ''} ${person.email || ''}`.toLowerCase();
    },

    _personMatchesQuery(person, query) {
        const q = String(query || '').trim();
        if (!q) return false;
        if (DASH_UUID_RE.test(q)) return person.id.toLowerCase() === q.toLowerCase();
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        if (words.length === 0) return false;
        const haystack = this._personSearchHaystack(person);
        return words.every((word) => haystack.includes(word));
    },

    _scorePersonMatch(person, query) {
        const q = String(query || '').trim().toLowerCase();
        const name = String(person.full_name || '').toLowerCase();
        const email = String(person.email || '').toLowerCase();
        if (!q) return 0;
        if (name === q) return 100;
        if (email === q) return 95;
        if (name.startsWith(q)) return 90;
        if (email.startsWith(q)) return 85;
        if (name.includes(q)) return 80;
        if (email.includes(q)) return 75;
        const words = q.split(/\s+/).filter(Boolean);
        if (words.length > 1 && words.every((w) => name.includes(w))) return 70;
        if (words.every((w) => this._personSearchHaystack(person).includes(w))) return 60;
        return 0;
    },

    _filterAndRankPersons(persons, query) {
        return persons
            .filter((p) => this._personMatchesQuery(p, query))
            .sort((a, b) => this._scorePersonMatch(b, query) - this._scorePersonMatch(a, query))
            .slice(0, 20);
    },

    _availableSearchProjects() {
        const catalog = this._state.catalog;
        if (!catalog || !catalog.projects) return [];
        const selectedTeams = this._selectedFromList('search-teams');
        if (selectedTeams.length === 0) return catalog.projects;
        const filtered = catalog.projects.filter((p) => selectedTeams.includes(p.team_id));
        return filtered.length > 0 ? filtered : catalog.projects;
    },

    _readResultsModePref() {
        try {
            const v = Storage.getData(DASH_RESULTS_MODE_STORAGE_KEY, null);
            if (v === 'add' || v === 'clear') return v;
        } catch (_e) { /* ignore */ }
        return 'clear';
    },

    _persistResultsModePref(mode) {
        try {
            Storage.setData(
                DASH_RESULTS_MODE_STORAGE_KEY,
                mode === 'add' ? 'add' : 'clear'
            );
        } catch (e) {
            Logger.debug('dashboard: could not persist results mode', e);
        }
    },

    _isAdditiveResultsMode() {
        return (this._state && this._state.resultsMode) === 'add';
    },

    _resultsModeToggleHtml(hintKey) {
        const label = this._labelStyle();
        const ui = Context.uiLib;
        if (ui && typeof ui.ensureSegmentStyles === 'function') {
            ui.ensureSegmentStyles('#wf-dash-modal');
        }
        const mode = (this._state && this._state.resultsMode) || 'clear';
        const groupHtml = ui && typeof ui.segmentGroupHtml === 'function'
            ? ui.segmentGroupHtml({
                value: mode === 'add' ? 'add' : 'clear',
                valueAttr: 'data-wf-dash-results-mode',
                fill: true,
                ariaLabel: 'Results mode',
                options: [
                    { value: 'clear', label: 'Clear' },
                    { value: 'add', label: 'Add' }
                ]
            })
            : '';
        return `<div style="margin-top: 4px; margin-bottom: 10px;">
            <div style="${label} margin-bottom: 6px; font-weight: 600;">Results mode</div>
            ${groupHtml}
            <div data-wf-dash-results-mode-hint="${dashEscHtml(hintKey)}" style="margin-top: 8px;"></div>
        </div>`;
    },

    _syncResultsModeHint() {
        const mode = this._state.resultsMode || 'clear';
        const hint = this._hintStyle();
        const text = dashResultsModeHints()[mode] || '';
        const modal = this._modal;
        if (!modal) return;
        modal.querySelectorAll('[data-wf-dash-results-mode-hint]').forEach((el) => {
            el.innerHTML = `<span style="${hint} line-height: 1.4;">${dashEscHtml(text)}</span>`;
        });
    },

    _syncResultsModeUi() {
        const mode = this._state.resultsMode || this._readResultsModePref();
        this._state.resultsMode = mode === 'add' ? 'add' : 'clear';
        const modal = this._modal;
        if (!modal) return;
        const ui = Context.uiLib;
        modal.querySelectorAll('.fleet-ui-seg-group[aria-label="Results mode"]').forEach((group) => {
            if (ui && typeof ui.syncSegmentGroup === 'function') {
                ui.syncSegmentGroup(group, this._state.resultsMode, 'data-wf-dash-results-mode');
            } else {
                group.querySelectorAll('[data-wf-dash-results-mode]').forEach((btn) => {
                    const btnMode = btn.getAttribute('data-wf-dash-results-mode');
                    const active = btnMode === this._state.resultsMode;
                    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
                });
            }
        });
        this._syncResultsModeHint();
    },

    _setResultsMode(mode) {
        const next = mode === 'add' ? 'add' : 'clear';
        this._state.resultsMode = next;
        this._persistResultsModePref(next);
        this._syncResultsModeUi();
        Logger.log('dashboard: results mode — ' + next);
    },

    _filterGroupItemsForOptions() {
        return this._getFilterScopeItems
            ? this._getFilterScopeItems()
            : (this._state.cachedItems || []);
    },

    _filterGroupFieldOptions(entityId) {
        const lib = dashLib();
        if (lib && typeof lib.groupConditionFieldsForEntity === 'function') {
            return lib.groupConditionFieldsForEntity(entityId);
        }
        return [];
    },

    _filterGroupConditionValueOptions(field) {
        const lib = dashLib();
        if (!lib || typeof lib.groupConditionOptions !== 'function') return [];
        return lib.groupConditionOptions(
            field,
            this._state.filterListOptions || {},
            this._filterGroupItemsForOptions()
        );
    },

    _filterGroupEntitySelectHtml(selectedId) {
        const lib = dashLib();
        const entities = (lib && lib.filterEntities) || [];
        const sel = selectedId || 'card';
        return '<select data-wf-dash-group-entity="1" aria-label="Look at" style="'
            + this._inputStyle() + ' padding: 4px 8px; font-size: 11px; flex: 1 1 0%; min-width: 0; max-width: 100%; overflow: hidden;">'
            + entities.map((e) => {
                const selected = e.id === sel ? ' selected' : '';
                return '<option value="' + dashEscHtml(e.id) + '"' + selected + '>'
                    + dashEscHtml(e.label) + '</option>';
            }).join('')
            + '</select>';
    },

    _filterGroupFieldSelectHtml(entityId, selectedId) {
        const fields = this._filterGroupFieldOptions(entityId);
        const sel = selectedId || (fields[0] && fields[0].id) || '';
        return '<select data-wf-dash-group-field="1" aria-label="Condition field" style="'
            + this._inputStyle() + ' padding: 4px 8px; font-size: 11px; flex: 1 1 0%; min-width: 0; max-width: 100%; overflow: hidden;">'
            + fields.map((f) => {
                const selected = f.id === sel ? ' selected' : '';
                return '<option value="' + dashEscHtml(f.id) + '"' + selected + '>'
                    + dashEscHtml(f.label) + '</option>';
            }).join('')
            + '</select>';
    },

    _filterGroupSetValuesHtml(field, selectedValues) {
        const options = this._filterGroupConditionValueOptions(field);
        const selected = new Set((selectedValues || []).map((id) => String(id)));
        const count = selected.size;
        const summary = count === 0 ? 'Any' : (count + ' selected');
        if (!options.length) {
            return '<span data-wf-dash-group-values="1" style="font-size: 10px; color: var(--muted-foreground, #64748b);">No options in scope</span>';
        }
        return '<details data-wf-dash-group-values="1" style="flex: 1 1 auto; min-width: 0; max-width: 100%;">'
            + '<summary style="font-size: 11px; cursor: pointer; user-select: none; color: var(--foreground, #0f172a);">'
            + dashEscHtml(summary) + '</summary>'
            + '<div style="display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow: auto; margin-top: 6px; padding: 6px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; background: var(--card, #fff);">'
            + options.map((opt) => {
                const id = String(opt.id);
                const checked = selected.has(id) ? ' checked' : '';
                return '<label style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer;">'
                    + '<input type="checkbox" data-wf-dash-group-value="1" value="' + dashEscHtml(id) + '"' + checked + '>'
                    + '<span>' + dashEscHtml(opt.label || id) + '</span></label>';
            }).join('')
            + '</div></details>';
    },

    _filterGroupNumericValuesHtml(field, condition) {
        const inputStyle = this._inputStyle() + ' padding: 4px 8px; font-size: 11px;';
        const isDate = field && field.type === 'date';
        const comparator = (condition && condition.comparator) || 'gte';
        const value = condition && condition.value != null ? String(condition.value) : '';
        const dateLocal = condition && condition.dateLocal != null ? String(condition.dateLocal) : '';
        return '<select data-wf-dash-group-comparator="1" style="' + inputStyle + ' width: '
            + (isDate ? '96px' : '52px') + '; flex-shrink: 0;">'
            + this._numericComparatorOptionsHtml(isDate ? 'date' : 'number', comparator)
            + '</select>'
            + '<input type="' + (isDate ? 'date' : 'number') + '" data-wf-dash-group-number="1" placeholder="Value" step="any" value="'
            + dashEscHtml(isDate ? dateLocal : value) + '" style="' + inputStyle + ' width: '
            + (isDate ? '118px' : '72px') + '; flex-shrink: 0;">';
    },

    _filterGroupConditionValueSlotHtml(entityId, fieldId, condition) {
        const lib = dashLib();
        const field = lib && typeof lib.groupConditionField === 'function'
            ? lib.groupConditionField(fieldId, entityId)
            : null;
        if (!field) return '';
        if (field.type === 'number' || field.type === 'date') {
            return this._filterGroupNumericValuesHtml(field, condition);
        }
        return this._filterGroupSetValuesHtml(field, condition && condition.values);
    },

    _buildFilterGroupConditionEl(entityId, condition) {
        const fields = this._filterGroupFieldOptions(entityId);
        const fieldId = (condition && condition.field) || (fields[0] && fields[0].id) || '';
        const wrap = document.createElement('div');
        wrap.setAttribute('data-wf-dash-group-cond', '1');
        wrap.style.cssText = 'display: flex; gap: 6px; align-items: flex-start; flex-wrap: nowrap; min-width: 0; max-width: 100%;';
        wrap.innerHTML = '<span data-wf-dash-group-cond-main="1" style="display: flex; gap: 6px; align-items: flex-start; flex: 1 1 auto; min-width: 0; flex-wrap: wrap;">'
            + this._filterGroupFieldSelectHtml(entityId, fieldId)
            + '<span data-wf-dash-group-value-slot="1" style="display: flex; gap: 6px; align-items: flex-start; flex: 1 1 auto; min-width: 0; flex-wrap: wrap;">'
            + this._filterGroupConditionValueSlotHtml(entityId, fieldId, condition)
            + '</span></span>'
            + '<button type="button" data-wf-dash-group-cond-remove="1" title="Remove condition" aria-label="Remove condition" style="flex: 0 0 auto; padding: 4px 8px; font-size: 14px; line-height: 1; color: var(--muted-foreground, #64748b); background: transparent; border: 1px solid var(--border, #e2e8f0); border-radius: 4px; cursor: pointer;">×</button>';
        return wrap;
    },

    _buildFilterGroupEl(opts) {
        const entityId = (opts && opts.entity) || 'card';
        const conditions = (opts && Array.isArray(opts.conditions) && opts.conditions.length)
            ? opts.conditions
            : [{ field: (this._filterGroupFieldOptions(entityId)[0] || {}).id, values: [] }];
        const card = document.createElement('div');
        card.setAttribute('data-wf-dash-filter-group', '1');
        card.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding: 8px; border: 1px solid var(--border, #e2e8f0); border-radius: 8px; background: var(--card, #fff); min-width: 0; max-width: 100%; box-sizing: border-box;';
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; min-width: 0; max-width: 100%;';
        header.innerHTML = '<span style="font-size: 10px; font-weight: 600; color: var(--muted-foreground, #64748b); flex-shrink: 0;">Look at</span>'
            + this._filterGroupEntitySelectHtml(entityId)
            + '<button type="button" data-wf-dash-group-remove="1" title="Remove group" aria-label="Remove group" style="flex: 0 0 auto; padding: 4px 8px; font-size: 14px; line-height: 1; color: var(--muted-foreground, #64748b); background: transparent; border: 1px solid var(--border, #e2e8f0); border-radius: 4px; cursor: pointer;">×</button>';
        const conds = document.createElement('div');
        conds.setAttribute('data-wf-dash-group-conditions', '1');
        conds.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
        for (const cond of conditions) {
            conds.appendChild(this._buildFilterGroupConditionEl(entityId, cond));
        }
        const addCond = document.createElement('button');
        addCond.type = 'button';
        addCond.setAttribute('data-wf-dash-group-cond-add', '1');
        addCond.className = this._dashBtnClass('basic', 'nav');
        addCond.style.padding = '4px 8px';
        addCond.textContent = '+ Add condition';
        card.appendChild(header);
        card.appendChild(conds);
        card.appendChild(addCond);
        return card;
    },

    _buildManualFilterRow(opts) {
        const rowsEl = this._q('#wf-dash-manual-rows');
        if (!rowsEl) return;
        const group = opts && opts.entity
            ? opts
            : { entity: 'card', conditions: opts ? [opts] : [] };
        rowsEl.appendChild(this._buildFilterGroupEl(group));
        Logger.debug('search-output: filter group added');
    },

    _resetManualFilters() {
        const rowsEl = this._q('#wf-dash-manual-rows');
        if (rowsEl) rowsEl.innerHTML = '';
        const andOrToggle = this._q('#wf-dash-manual-andor');
        if (andOrToggle) andOrToggle.checked = false;
        const lib = dashLib();
        const defaults = lib && typeof lib.defaultFilterGroups === 'function'
            ? lib.defaultFilterGroups()
            : [{ entity: 'card', conditions: [] }];
        for (const group of defaults) this._buildManualFilterRow(group);
    },

    _refreshFilterGroupValueOptions() {
        const rowsEl = this._q('#wf-dash-manual-rows');
        if (!rowsEl) return;
        rowsEl.querySelectorAll('[data-wf-dash-filter-group]').forEach((groupEl) => {
            const entityEl = groupEl.querySelector('[data-wf-dash-group-entity]');
            const entityId = entityEl ? entityEl.value : 'card';
            groupEl.querySelectorAll('[data-wf-dash-group-cond]').forEach((condEl) => {
                const fieldEl = condEl.querySelector('[data-wf-dash-group-field]');
                const fieldId = fieldEl ? fieldEl.value : '';
                const slot = condEl.querySelector('[data-wf-dash-group-value-slot]');
                if (!slot) return;
                const prev = this._readFilterGroupCondition(condEl, entityId);
                slot.innerHTML = this._filterGroupConditionValueSlotHtml(entityId, fieldId, prev);
            });
        });
    },

    _readFilterGroupCondition(condEl, entityId) {
        const lib = dashLib();
        const fieldEl = condEl.querySelector('[data-wf-dash-group-field]');
        const fieldId = fieldEl ? fieldEl.value : '';
        const field = lib && typeof lib.groupConditionField === 'function'
            ? lib.groupConditionField(fieldId, entityId)
            : null;
        if (!field) return { field: fieldId, values: [] };
        if (field.type === 'number' || field.type === 'date') {
            const compEl = condEl.querySelector('[data-wf-dash-group-comparator]');
            const valueEl = condEl.querySelector('[data-wf-dash-group-number]');
            const comparator = compEl ? compEl.value : 'gte';
            const raw = valueEl ? valueEl.value.trim() : '';
            if (field.type === 'date') {
                const iso = raw && lib && typeof lib.dateLocalToIso === 'function'
                    ? lib.dateLocalToIso(raw, 'after')
                    : '';
                const value = iso ? Date.parse(iso) : NaN;
                return {
                    field: fieldId,
                    comparator,
                    value: Number.isFinite(value) ? value : '',
                    valueType: 'date',
                    dateLocal: raw
                };
            }
            const value = raw === '' ? '' : Number(raw);
            return { field: fieldId, comparator, value, valueType: 'number' };
        }
        const values = [];
        condEl.querySelectorAll('[data-wf-dash-group-value]').forEach((cb) => {
            if (cb.checked) values.push(cb.value);
        });
        return { field: fieldId, values };
    },

    _readSearchOutputManualFilters() {
        const rowsEl = this._q('#wf-dash-manual-rows');
        const andOrToggle = this._q('#wf-dash-manual-andor');
        const andOr = andOrToggle && andOrToggle.checked ? 'or' : 'and';
        const rows = [];
        if (!rowsEl) return { rows, andOr };
        rowsEl.querySelectorAll('[data-wf-dash-filter-group]').forEach((groupEl) => {
            const entityEl = groupEl.querySelector('[data-wf-dash-group-entity]');
            const entity = entityEl ? entityEl.value : 'card';
            const conditions = [];
            groupEl.querySelectorAll('[data-wf-dash-group-cond]').forEach((condEl) => {
                conditions.push(this._readFilterGroupCondition(condEl, entity));
            });
            rows.push({ entity, conditions });
        });
        return { rows, andOr };
    },

    _applyDefaultSearchDates() {
        const afterEl = this._q('#wf-dash-after');
        const beforeEl = this._q('#wf-dash-before');
        if (!afterEl || !beforeEl) return;
        if (afterEl.value || beforeEl.value) return;
        this._applyQuickDatePreset('today');
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = 'today';
    },

    _markTimeFilterUserPicked() {
        if (this._state.timeFilterUserPicked) return;
        this._state.timeFilterUserPicked = true;
        Logger.debug('search-output: time filter marked user-picked');
    },

    _resetTimeFilterUserPicked() {
        this._state.timeFilterUserPicked = false;
    },

    _maybeSwitchToAllTimeForContributor() {
        if (this._state.timeFilterUserPicked) return;
        if (this._hasEveryoneAuthorToken()) return;
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = 'all-time';
        this._applyQuickDatePreset('all-time');
        Logger.log('search-output: contributor resolved — quick range switched to All Time');
    },

    _isEveryoneAuthorQuery(query) {
        return String(query || '').trim().toLowerCase() === DASH_EVERYONE_AUTHOR_LABEL.toLowerCase();
    },

    _isEveryoneAuthorToken(person) {
        return String(person && person.id || '') === DASH_EVERYONE_AUTHOR_TOKEN_ID;
    },

    _hasEveryoneAuthorToken() {
        return (this._state.draftTokens || []).some((t) => this._isEveryoneAuthorToken(t));
    },

    _namedAuthorTokenCount() {
        return (this._state.draftTokens || []).filter((t) => !this._isEveryoneAuthorToken(t)).length;
    },

    _addEveryoneAuthorToken() {
        this._state.draftTokens = [{
            id: DASH_EVERYONE_AUTHOR_TOKEN_ID,
            full_name: DASH_EVERYONE_AUTHOR_LABEL,
            email: ''
        }];
        this._hideAuthorCandidates();
        this._setAuthorError('');
        this._renderAuthorTokens();
        this._validateRangeUi();
        Logger.log('search-output: @everyone author token added — bulk ratings mode');
    },

    _dashKindToggleActiveCss(colorKind) {
        const cfg = DASH_OUTPUT_KIND_CONFIG[colorKind];
        if (!cfg) return '';
        const dark = Context.uiLib && typeof Context.uiLib.isFleetDark === 'function'
            ? Context.uiLib.isFleetDark()
            : (document.documentElement.dataset.fleetUxTheme === 'dark');
        if (dark && cfg.toggleActiveDark) return cfg.toggleActiveDark;
        return cfg.toggleActive || '';
    },

    _filterToggleHtml(id, label, pressed, colorKind) {
        const ui = Context.uiLib;
        const activeCss = this._dashKindToggleActiveCss(colorKind);
        if (ui && typeof ui.filterToggleHtml === 'function') {
            return ui.filterToggleHtml({ id, label, pressed, activeCss });
        }
        const base = 'padding: 7px 14px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer;';
        const style = pressed
            ? base + ' ' + (activeCss || DASH_TOGGLE_INACTIVE)
            : base + ' ' + DASH_TOGGLE_INACTIVE;
        return `<button type="button" id="${id}" aria-pressed="${pressed ? 'true' : 'false'}" style="${style}">${label}</button>`;
    },

    _applyFilterToggleBtn(btn, pressed, colorKind) {
        if (!btn) return;
        const activeCss = this._dashKindToggleActiveCss(colorKind);
        const ui = Context.uiLib;
        if (ui && typeof ui.applyFilterToggle === 'function') {
            ui.applyFilterToggle(btn, pressed, activeCss);
            return;
        }
        btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        const base = 'padding: 7px 14px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer;';
        btn.style.cssText = pressed
            ? base + ' ' + (activeCss || DASH_TOGGLE_INACTIVE)
            : base + ' ' + DASH_TOGGLE_INACTIVE;
    },

    _leftTabStyle(active) {
        if (typeof this._dashTextTabStyle === 'function') {
            return this._dashTextTabStyle(active, { padding: '8px 12px', fontSize: '12px' });
        }
        const c = typeof this._dashThemeColors === 'function' ? this._dashThemeColors() : null;
        const base = 'position: relative; padding: 8px 12px; font-size: 12px; background: transparent; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer;';
        if (active) {
            return base + ' font-weight: 600; color: ' + (c ? c.fg : 'var(--foreground, #0f172a)')
                + '; border-bottom-color: var(--brand, var(--primary, #2563eb));';
        }
        return base + ' font-weight: 500; color: ' + (c ? c.muted : 'var(--muted-foreground, #64748b)') + ';';
    },

    _searchSectionStyle() {
        return 'background: color-mix(in srgb, var(--muted-foreground, #64748b) 8%, var(--card, #ffffff)); border-radius: 10px; padding: 14px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; box-sizing: border-box;';
    },

    _filterScopeLabel(scopeKey) {
        const labels = {
            'filter-prompt-history': 'Task Lifecycle History',
            'filter-session-qa-outcome': 'Session QA Outcome',
            'filter-dispute-outcome': 'Dispute Outcome',
            'filter-sr-review-outcome': 'Sr Review Outcome',
            'filter-teams': 'Team',
            'filter-projects': 'Project',
            'filter-envs': 'Environment',
            'filter-statuses': 'Current Task Status',
            'filter-contributors': 'Contributor',
            'filter-prompt-ratings': 'Prompt Rating',
            'filter-qa-helpfulness': 'QA Helpfulness',
            'filter-task-issues': 'Task Issues',
            'filter-return-types': 'Issue Areas',
            'filter-task-created-year': 'Task Created Year',
            'filter-task-created-month': 'Task Created Month',
            'filter-task-created-week': 'Task Created Week',
            'filter-task-created-day': 'Task Created Day',
            'filter-v1-creation-time': 'V1 Creation Time Minutes',
            'filter-qa-time': 'QA Time Minutes',
            'filter-dispute-resolution-time': 'Dispute Resolution Time Minutes'
        };
        return labels[scopeKey] || scopeKey;
    },

    _toggleOutputType(kind) {
        if (kind === 'tasks') {
            this._state.includeTasks = !this._state.includeTasks;
            this._syncOutputToggleUi();
            Logger.log('dashboard: Task Creation ' + (this._state.includeTasks ? 'on' : 'off'));
        } else if (kind === 'qa') {
            this._state.includeQa = !this._state.includeQa;
            this._syncOutputToggleUi();
            Logger.log('dashboard: QA ' + (this._state.includeQa ? 'on' : 'off'));
        } else if (kind === 'disputes') {
            this._state.includeDisputes = !this._state.includeDisputes;
            this._syncOutputToggleUi();
            Logger.log('dashboard: Disputes ' + (this._state.includeDisputes ? 'on' : 'off'));
        } else if (kind === 'senior_review') {
            this._state.includeSeniorReview = !this._state.includeSeniorReview;
            this._syncOutputToggleUi();
            Logger.log('dashboard: Sr Review ' + (this._state.includeSeniorReview ? 'on' : 'off'));
        } else if (kind === 'sessions') {
            this._state.includeSessions = !this._state.includeSessions;
            this._syncOutputToggleUi();
            Logger.log('dashboard: Sessions ' + (this._state.includeSessions ? 'on' : 'off'));
        }
    },

    _setOutputTypesExclusive(kind) {
        if (!dashKindLabels()[kind]) {
            Logger.warn('dashboard: setOutputTypesExclusive skipped — unknown kind ' + kind);
            return;
        }
        this._state.includeTasks = kind === 'task_creation';
        this._state.includeQa = kind === 'qa';
        this._state.includeDisputes = kind === 'dispute';
        this._state.includeSeniorReview = kind === 'senior_review';
        this._state.includeSessions = kind === 'sessions';
        this._syncOutputToggleUi();
    },

    _setOutputTypesTaskAndQa() {
        this._state.includeTasks = true;
        this._state.includeQa = true;
        this._state.includeDisputes = false;
        this._state.includeSeniorReview = false;
        this._state.includeSessions = false;
        this._syncOutputToggleUi();
    },

    _resetSearchScopeToUniversal() {
        ['search-teams', 'search-projects', 'search-envs'].forEach((key) => {
            const itemsEl = this._msItemsEl(key);
            if (itemsEl) itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
            this._setMsBulkToggleMode(key, 'all');
            this._applyMsBulkToggleLabel(key);
            this._updateMsCount(key);
        });
        this._renderSearchProjectsList();
    },

    _syncOutputToggleUi() {
        const tasksBtn = this._q('#wf-dash-toggle-tasks');
        const qaBtn = this._q('#wf-dash-toggle-qa');
        const disputesBtn = this._q('#wf-dash-toggle-disputes');
        const seniorReviewBtn = this._q('#wf-dash-toggle-senior-review');
        const sessionsBtn = this._q('#wf-dash-toggle-sessions');
        this._applyFilterToggleBtn(tasksBtn, this._state.includeTasks, 'task_creation');
        this._applyFilterToggleBtn(qaBtn, this._state.includeQa, 'qa');
        this._applyFilterToggleBtn(disputesBtn, this._state.includeDisputes, 'dispute');
        this._applyFilterToggleBtn(seniorReviewBtn, this._state.includeSeniorReview, 'senior_review');
        this._applyFilterToggleBtn(sessionsBtn, this._state.includeSessions, 'sessions');
    },

    _readSearchLimitFromUi() {
        const el = this._q('#wf-dash-search-limit');
        if (!el) return null;
        const raw = String(el.value || '').trim();
        if (!raw) return null;
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 1) return null;
        return n;
    },

    _syncSearchLimitUi() {
        const el = this._q('#wf-dash-search-limit');
        if (!el) return;
        const limit = this._state.searchLimit;
        el.value = (limit != null && Number.isFinite(limit) && limit >= 1) ? String(limit) : '';
    },

    async _resolveAuthorToken(raw) {
        const query = (raw || '').trim();
        if (!query) return 'empty';
        const tokens = this._state.draftTokens;
        if (this._isEveryoneAuthorQuery(query)) {
            if (!this._hasEveryoneAuthorToken()) {
                this._addEveryoneAuthorToken();
            }
            const input = this._q('#wf-dash-author-input');
            if (input) input.value = '';
            return 'resolved';
        }
        if (tokens.some((t) => t.full_name === query || t.email === query || t.id === query)) {
            const input = this._q('#wf-dash-author-input');
            if (input) input.value = '';
            return 'resolved';
        }
        this._setAuthorError('');
        this._hideAuthorCandidates();
        try {
            const tokenIds = new Set(tokens.map((t) => String(t.id || '').trim().toLowerCase()).filter(Boolean));
            const allResults = await this._searchPersons(query);
            const results = allResults.filter((p) => !tokenIds.has(String(p.id || '').trim().toLowerCase()));
            const input = this._q('#wf-dash-author-input');
            if (results.length === 0) {
                if (allResults.length > 0) {
                    this._setAuthorError('Already added.');
                    return 'duplicate';
                }
                this._setAuthorError(`No match for "${query}"`);
                return 'none';
            }
            if (results.length === 1) {
                this._addAuthorToken(results[0]);
                if (input) input.value = '';
                return 'resolved';
            }
            if (input) input.value = '';
            this._showAuthorCandidates(results);
            return 'multiple';
        } catch (err) {
            if (!this._handleDashSessionRefreshError(err)) {
                this._setAuthorError('Lookup failed: ' + err.message);
            } else {
                this._setAuthorError('');
            }
            Logger.warn('dashboard: author lookup failed', err);
            return 'error';
        }
    },

    async _flushPendingAuthorInput() {
        const input = this._q('#wf-dash-author-input');
        const query = (input && input.value || '').trim();
        if (!query) return null;
        const outcome = await this._resolveAuthorToken(query);
        if (outcome === 'resolved' || outcome === 'empty') return null;
        if (outcome === 'multiple') {
            return 'Multiple author matches — pick one from the list below.';
        }
        if (outcome === 'duplicate') {
            return 'All matches for that query are already in Contributors.';
        }
        if (outcome === 'none') {
            return `No author match for "${query}".`;
        }
        return 'Author lookup failed — try again.';
    },

    _normalizeAuthorPerson(person) {
        const id = String(person && person.id || '').trim();
        if (!id) return null;
        return {
            id,
            full_name: person.full_name,
            email: person.email
        };
    },

    _setAuthorTokens(persons, options) {
        if (!this._modal) {
            Logger.warn('dashboard: setAuthorTokens skipped — modal not open');
            return;
        }
        const opts = options || {};
        const replace = opts.replace !== false;
        const activeTab = opts.activeTab;
        const normalized = (Array.isArray(persons) ? persons : [])
            .map((p) => this._normalizeAuthorPerson(p))
            .filter(Boolean);
        if (replace) {
            this._state.draftTokens = normalized;
        } else {
            for (const person of normalized) {
                if (!this._state.draftTokens.some((t) => t.id === person.id)) {
                    this._state.draftTokens.push(person);
                }
            }
        }
        this._hideAuthorCandidates();
        this._setAuthorError('');
        const input = this._q('#wf-dash-author-input');
        if (input) input.value = '';
        this._renderAuthorTokens();
        this._validateRangeUi();
        if (activeTab) this._setActiveTab(activeTab);
        const label = normalized.map((p) => this._personDisplayLabel(p)).join(', ') || '(none)';
        Logger.log('dashboard: author tokens ' + (replace ? 'replaced' : 'merged') + ' (' + label + ')');
        if (normalized.length > 0) {
            this._maybeSwitchToAllTimeForContributor();
        }
    },

    _addAuthorToken(person) {
        try {
            if (this._isEveryoneAuthorToken(person)) return;
            if (this._hasEveryoneAuthorToken()) {
                this._state.draftTokens = this._state.draftTokens.filter((t) => !this._isEveryoneAuthorToken(t));
            }
            if (this._state.draftTokens.some((t) => t.id === person.id)) return;
            this._state.draftTokens.push(person);
            this._hideAuthorCandidates();
            this._setAuthorError('');
            this._renderAuthorTokens();
            this._validateRangeUi();
            this._maybeSwitchToAllTimeForContributor();
            Logger.log('dashboard: author token added (' + this._personDisplayLabel(person) + ')');
        } finally {
            const input = this._q('#wf-dash-author-input');
            if (input) {
                input.value = '';
                input.focus();
            }
        }
    },

    _ensureSearchOutputTabForUserSearch() {
        const wsId = typeof this._resolveActiveOutputWsId === 'function'
            ? this._resolveActiveOutputWsId()
            : null;
        if (wsId !== 'disputes' && wsId !== 'sr-review') return false;
        if (typeof this._setActiveTab === 'function') {
            this._setActiveTab('search-output');
        }
        Logger.debug('dashboard: routed user search to Search Output');
        return true;
    },

    async _runContributorHistoryDeepDive(person, historyKind) {
        if (!this._modal) {
            Logger.warn('dashboard: contributor deep dive skipped — modal not open');
            return;
        }
        const normalized = this._normalizeAuthorPerson(person);
        if (!normalized || !normalized.id) {
            Logger.warn('dashboard: contributor deep dive skipped — missing person id');
            return;
        }
        if (!dashKindLabels()[historyKind]) {
            Logger.warn('dashboard: contributor deep dive skipped — unknown history kind ' + historyKind);
            return;
        }
        this._ensureSearchOutputTabForUserSearch();
        if (this._state.loading) {
            Logger.warn('dashboard: contributor deep dive skipped — search in progress');
            return;
        }
        this._setLeftTab('search');
        this._setAuthorTokens([normalized], { replace: true });
        this._setOutputTypesExclusive(historyKind);
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = 'all-time';
        this._applyQuickDatePreset('all-time');
        this._resetSearchScopeToUniversal();
        this._setResultsMode('clear');
        this._setSearchError('');
        Logger.log('dashboard: contributor deep dive — ' + this._personDisplayLabel(normalized) + ' · ' + historyKind + ' · all time');
        await this._submitSearch();
    },

    async _runContributorWorkerOutputDeepDive(person, options) {
        if (!this._modal) {
            Logger.warn('dashboard: worker output deep dive skipped — modal not open');
            return;
        }
        const normalized = this._normalizeAuthorPerson(person);
        if (!normalized || !normalized.id) {
            Logger.warn('dashboard: worker output deep dive skipped — missing person id');
            return;
        }
        const opts = options || {};
        if (opts.activeTab) {
            this._setActiveTab(opts.activeTab);
        } else {
            this._ensureSearchOutputTabForUserSearch();
        }
        if (this._state.loading) {
            Logger.warn('dashboard: worker output deep dive skipped — search in progress');
            return;
        }
        this._setLeftTab('search');
        this._setAuthorTokens([normalized], { replace: true });
        this._setOutputTypesTaskAndQa();
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = 'all-time';
        this._applyQuickDatePreset('all-time');
        this._resetSearchScopeToUniversal();
        this._setResultsMode('clear');
        this._setSearchError('');
        Logger.log('dashboard: worker output deep dive — ' + this._personDisplayLabel(normalized) + ' · task+QA · all time');
        await this._submitSearch();
    },

    _removeAuthorToken(id) {
        this._state.draftTokens = this._state.draftTokens.filter((t) => t.id !== id);
        this._renderAuthorTokens();
        this._validateRangeUi();
    },

    _renderAuthorTokens() {
        const box = this._q('#wf-dash-author-box');
        const input = this._q('#wf-dash-author-input');
        if (!box || !input) return;
        box.querySelectorAll('[data-wf-dash-token]').forEach((el) => el.remove());
        const frag = this._pageWindow().document.createDocumentFragment();
        for (const t of this._state.draftTokens) {
            const chip = this._pageWindow().document.createElement('span');
            chip.setAttribute('data-wf-dash-token', t.id);
            chip.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: color-mix(in srgb, var(--brand, var(--primary, #2563eb)) 12%, transparent); color: var(--brand, var(--primary, #2563eb));';
            const tokenLabel = this._personDisplayLabel(t);
            chip.innerHTML = `${dashEscHtml(tokenLabel)}<button type="button" data-wf-dash-remove-token="${dashEscHtml(t.id)}" aria-label="Remove ${dashEscHtml(tokenLabel)}" style="border: none; background: transparent; color: inherit; cursor: pointer; font-size: 13px; line-height: 1; padding: 0 0 0 2px;">&times;</button>`;
            frag.appendChild(chip);
        }
        box.insertBefore(frag, input);
        input.placeholder = this._state.draftTokens.length === 0 ? 'Name, email, or UUID — Enter to resolve' : '';
    },

    _setAuthorError(text) {
        const el = this._q('#wf-dash-author-error');
        if (!el) return;
        el.textContent = text || '';
        el.style.display = text ? 'block' : 'none';
    },

    _authorCandidateBtnBaseStyle() {
        return 'display: block; width: 100%; text-align: left; padding: 6px 8px; font-size: 11px;'
            + ' border: none; border-radius: 4px; cursor: pointer; color: var(--foreground, #0f172a);';
    },

    _authorCandidateBtnStyle(active) {
        const bg = active
            ? 'background: var(--muted, #f1f5f9);'
            : 'background: transparent;';
        return this._authorCandidateBtnBaseStyle() + ' ' + bg;
    },

    _syncAuthorCandidateHighlight() {
        const wrap = this._q('#wf-dash-author-candidates');
        if (!wrap) return;
        const buttons = wrap.querySelectorAll('[data-wf-dash-candidate]');
        const idx = Number(this._state._candidateIndex);
        buttons.forEach((btn, i) => {
            const active = i === idx;
            btn.style.cssText = this._authorCandidateBtnStyle(active);
            if (active) {
                btn.setAttribute('aria-selected', 'true');
                btn.scrollIntoView({ block: 'nearest' });
            } else {
                btn.removeAttribute('aria-selected');
            }
        });
    },

    _moveAuthorCandidateHighlight(delta) {
        const candidates = this._state._candidates || [];
        if (candidates.length === 0) return;
        const len = candidates.length;
        let idx = Number(this._state._candidateIndex);
        if (!Number.isFinite(idx) || idx < 0) idx = 0;
        idx = (idx + delta) % len;
        if (idx < 0) idx += len;
        this._state._candidateIndex = idx;
        this._syncAuthorCandidateHighlight();
    },

    _showAuthorCandidates(results) {
        this._state._candidates = results;
        this._state._candidateIndex = results.length > 0 ? 0 : -1;
        const wrap = this._q('#wf-dash-author-candidates');
        if (!wrap) return;
        wrap.innerHTML = `
            <p style="padding: 6px 10px; font-size: 11px; color: var(--muted-foreground, #64748b); border-bottom: 1px solid var(--border, #e2e8f0);">Multiple matches — pick one:</p>
            <div style="max-height: 180px; overflow-y: auto; padding: 4px;">
                ${results.map((c) => {
                    const label = this._personDisplayLabel(c);
                    const showEmail = c.email && label !== c.email;
                    return `
                    <button type="button" data-wf-dash-candidate="${dashEscHtml(c.id)}" style="${this._authorCandidateBtnStyle(false)}">
                        <span style="font-weight: 600;">${dashEscHtml(label)}</span>
                        ${showEmail ? `<span style="margin-left: 8px; color: var(--muted-foreground, #64748b);">${dashEscHtml(c.email)}</span>` : ''}
                    </button>`;
                }).join('')}
            </div>`;
        wrap.style.display = 'block';
        this._syncAuthorCandidateHighlight();
    },

    _hideAuthorCandidates() {
        const wrap = this._q('#wf-dash-author-candidates');
        if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
        this._state._candidates = [];
        this._state._candidateIndex = -1;
    },

    _isDashSessionRefreshError(err) {
        const ops = Context.opsTab;
        return !!(ops && typeof ops.isSessionRefreshRequiredError === 'function' && ops.isSessionRefreshRequiredError(err));
    },

    _handleDashSessionRefreshError(err) {
        if (!this._isDashSessionRefreshError(err)) return false;
        this._state.sessionRefreshRequired = true;
        this._syncDashSessionRefreshBanner();
        return true;
    },

    _ensureDashSessionRefreshBannerStyles() {
        if (Context.uiLib && typeof Context.uiLib.ensureAlertBannerStyles === 'function') {
            Context.uiLib.ensureAlertBannerStyles();
        }
    },

    _renderDashSessionRefreshBannerHtml() {
        this._ensureDashSessionRefreshBannerStyles();
        const ab = (Context.uiLib && Context.uiLib.ALERT_BANNER_CLASSES) || {
            root: 'fleet-ui-alert-banner',
            danger: 'fleet-ui-alert-banner--danger',
            title: 'fleet-ui-alert-banner__title',
            body: 'fleet-ui-alert-banner__body',
            footer: 'fleet-ui-alert-banner__footer',
            btnSecondary: 'fleet-ui-alert-banner__btn-secondary'
        };
        return [
            '<div class="' + ab.root + ' ' + ab.danger + '">',
            '<div style="display: flex; align-items: flex-start; gap: 10px;">',
            '<span style="color: #dc2626; font-size: 16px; line-height: 1.2;" aria-hidden="true">⚠</span>',
            '<div style="flex: 1; min-width: 0;">',
            '<div class="' + ab.title + '" style="font-size: 13px; font-weight: 600; margin-bottom: 6px;">Fleet session token not yet captured</div>',
            '<p class="' + ab.body + '" style="font-size: 12px; margin: 0; line-height: 1.45;">',
            'Navigate to a Fleet data page (e.g. Tasks or QA), then close and reopen the dashboard or retry your search.',
            '</p>',
            '</div>',
            '</div>',
            '<div class="' + ab.footer + '">',
            '<a href="', dashEscHtml(dashFleetOrigin()), '/" target="_blank" rel="noopener noreferrer" id="wf-dash-session-reload" class="' + ab.btnSecondary + '" style="font-size: 12px;">Reload Fleet</a>',
            '</div>',
            '</div>'
        ].join('');
    },

    _syncDashSessionRefreshBanner() {
        const banner = this._q('#wf-dash-session-refresh-banner');
        const errEl = this._q('#wf-dash-bootstrap-error');
        const show = !!this._state.sessionRefreshRequired;
        if (banner) {
            if (show) {
                banner.innerHTML = this._renderDashSessionRefreshBannerHtml();
                banner.style.display = 'block';
                const reload = banner.querySelector('#wf-dash-session-reload');
                if (reload && !reload.dataset.wfDashWired) {
                    reload.dataset.wfDashWired = '1';
                    reload.addEventListener('click', () => {
                        Logger.log('dashboard: session refresh banner — Reload Fleet link opened');
                    });
                }
            } else {
                banner.innerHTML = '';
                banner.style.display = 'none';
            }
        }
        if (errEl && show) {
            errEl.style.display = 'none';
            errEl.textContent = '';
        }
        this._syncLeftMessagesBar();
    },

    _refreshCatalogDependentUi() {
        if (!this._built) return;
        this._syncDashSessionRefreshBanner();
        const status = this._state.bootstrapStatus;
        const errEl = this._q('#wf-dash-bootstrap-error');
        if (errEl) {
            if (status === 'error' && !this._state.sessionRefreshRequired) {
                errEl.textContent = 'Bootstrap failed: ' + (this._state.bootstrapError || 'unknown') + '. Filters may be empty.';
                errEl.style.display = 'block';
            } else if (!this._state.sessionRefreshRequired) {
                errEl.style.display = 'none';
            }
        }
        this._renderSearchTeamsList();
        this._renderSearchProjectsList();
        this._renderSearchEnvsList();
        this._syncLeftMessagesBar();
    },

    _renderSearchTeamsList() {
        const scopeKey = 'search-teams';
        const prevSelected = new Set(this._selectedFromList(scopeKey));
        const items = this._getSearchableTeamCatalog().map(([id, label]) => ({ id, label }));
        this._renderMsList(scopeKey, items, 'All teams', prevSelected);
        this._setMsBulkToggleMode(scopeKey, prevSelected.size === 0 ? 'all' : 'none');
        this._applyMsBulkToggleLabel(scopeKey);
    },

    _renderSearchProjectsList() {
        const scopeKey = 'search-projects';
        const prevSelected = new Set(this._selectedFromList(scopeKey));
        const loading = this._state.bootstrapStatus === 'loading';
        const items = this._availableSearchProjects().map((p) => ({ id: p.id, label: p.name }));
        const hint = this._state.catalog ? 'All projects' : 'Bootstrapping…';
        this._renderMsList(scopeKey, items, hint, prevSelected, { loading });
        this._setMsBulkToggleMode(scopeKey, prevSelected.size === 0 ? 'all' : 'none');
        this._applyMsBulkToggleLabel(scopeKey);
    },

    _renderSearchEnvsList() {
        const scopeKey = 'search-envs';
        const prevSelected = new Set(this._selectedFromList(scopeKey));
        const loading = this._state.bootstrapStatus === 'loading';
        const envs = (this._state.catalog && this._state.catalog.environments) || [];
        const items = envs.map((e) => ({ id: e.env_key, label: e.name || e.env_key }));
        const hint = this._state.catalog ? 'All environments' : 'Bootstrapping…';
        this._renderMsList(scopeKey, items, hint, prevSelected, { loading });
        this._setMsBulkToggleMode(scopeKey, prevSelected.size === 0 ? 'all' : 'none');
        this._applyMsBulkToggleLabel(scopeKey);
    },

    _getFilterDraft() {
        const draft = {};
        for (const { scopeKey, draftKey } of dashFilterScopes()) {
            draft[draftKey] = this._selectedFromList(scopeKey);
        }
        return draft;
    },

    _updateFilterSelectionOrder(msKey) {
        const scope = dashFilterScopes().find((s) => s.scopeKey === msKey);
        if (!scope) return;
        const { draftKey } = scope;
        const order = this._state.filterSelectionOrder || [];
        const selected = this._selectedFromList(msKey);
        const wasInQueue = order.includes(draftKey);
        const hasSelection = selected.length > 0;

        if (hasSelection && !wasInQueue) {
            this._state.filterSelectionOrder = [...order, draftKey];
        } else if (!hasSelection && wasInQueue) {
            this._state.filterSelectionOrder = order.filter((k) => k !== draftKey);
        }
    },

    _resetFilterLists() {
        const empty = {};
        for (const { optionsKey } of dashFilterScopes()) empty[optionsKey] = [];
        this._state.filterListOptions = empty;
        this._resetManualFilters();
        for (const { scopeKey } of dashFilterScopes()) {
            const wrap = this._filterScopeWrapEl(scopeKey);
            if (wrap) wrap.style.display = 'none';
            const panel = this._msPanelEl(scopeKey);
            const itemsEl = this._msItemsEl(scopeKey);
            if (!panel || !itemsEl) continue;
            const hint = panel.getAttribute('data-wf-dash-empty') || 'Run a search to enable';
            itemsEl.innerHTML = this._msHintHtml(hint);
            this._updateMsCount(scopeKey);
            this._syncMsDropdown(scopeKey);
        }
    },

    _renderFilterLists({ syncDraftFromApplied = false } = {}) {
        const scopeItems = this._getFilterScopeItems();
        const options = this._state.filterListOptions;
        if (!this._state.cachedItems || !options) {
            this._resetFilterLists();
            this._updateApplyFiltersUi();
            return;
        }
        const listBounds = this._listBoundsFromOptions(options);
        const prevBounds = this._state.filterListBoundsPrev || {};
        const applied = this._state.appliedFilters;
        const draft = (syncDraftFromApplied && applied)
            ? applied
            : this._getFilterDraft();
        const lib = dashLib();
        const filterOptions = Object.assign({}, options, {
            helpfulnessUi: this._state.helpfulnessUi || {},
            currentUserId: this._dashGetCurrentUserId(),
            sessionQaUi: this._state.sessionQaUi || {}
        });
        const irrelevance = scopeItems.length > 0 && this._isFilterDraftValid(draft)
            ? lib.computeFilterIrrelevance(scopeItems, draft, listBounds, filterOptions)
            : lib.emptyFilterIrrelevance();
        const optionCounts = scopeItems.length > 0
            ? lib.computeFilterOptionCounts(scopeItems, draft, listBounds, filterOptions)
            : lib.emptyFilterOptionCounts();
        const order = this._state.filterSelectionOrder || [];
        const pctCtx = {
            helpfulnessUi: filterOptions.helpfulnessUi,
            currentUserId: filterOptions.currentUserId,
            sessionQaUi: filterOptions.sessionQaUi
        };
        const denominatorByDraftKey = {};
        for (const { draftKey } of dashFilterScopes()) {
            const pos = order.indexOf(draftKey);
            const ancestorKeys = pos === -1 ? [...order] : order.slice(0, pos);
            if (ancestorKeys.length === 0) {
                denominatorByDraftKey[draftKey] = scopeItems.length;
            } else {
                denominatorByDraftKey[draftKey] = lib.computeFilterScopedTotalForOrder(
                    scopeItems, draft, listBounds, pctCtx, ancestorKeys
                );
            }
        }

        const openFilterKeys = this._beginFilterMsDropdownRefresh();
        try {
            for (const { scopeKey, optionsKey, draftKey } of dashFilterScopes()) {
                const itemsEl = this._msItemsEl(scopeKey);
                const wrap = this._filterScopeWrapEl(scopeKey);
                if (!itemsEl) continue;
                const optionItems = options[optionsKey] || [];
                if (optionItems.length === 0) {
                    if (wrap) wrap.style.display = 'none';
                    continue;
                }
                if (wrap) wrap.style.display = '';
                const emptyHint = optionItems.length === 0 ? 'No ' + this._filterScopeLabel(scopeKey).toLowerCase() + ' in results' : 'Run a search to enable';
                const irrelevantSet = irrelevance[draftKey] || new Set();
                const countsForScope = optionCounts[draftKey] || new Map();
                const optionIds = optionItems.map((it) => it.id);
                const prevSelected = syncDraftFromApplied
                    ? null
                    : new Set(this._selectedFromList(scopeKey));
                const checkedIds = this._checkedIdsForFilterScope(
                    draftKey, optionIds, applied, prevBounds, listBounds, prevSelected, syncDraftFromApplied
                );
                itemsEl.innerHTML = this._multiSelectItemsHtml(
                    scopeKey,
                    optionItems,
                    emptyHint,
                    false,
                    false,
                    irrelevantSet,
                    countsForScope,
                    denominatorByDraftKey[draftKey]
                );
                itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                    cb.checked = checkedIds.has(cb.value);
                });
                this._updateMsCount(scopeKey);
                this._syncMsDropdown(scopeKey);
                if (scopeKey.startsWith('filter-')) this._syncMsDropdownFilterUi(scopeKey);
            }
        } finally {
            this._endFilterMsDropdownRefresh(openFilterKeys);
        }
        this._state.filterListBoundsPrev = listBounds;
        if (typeof this._refreshFilterGroupValueOptions === 'function') {
            this._refreshFilterGroupValueOptions();
        }
        this._updateApplyFiltersUi();
        this._repositionOpenFlyouts();
        Logger.debug('dashboard: filter lists rendered');
    },

    _setLeftTab(tab) {
        const panel = this._outputPanel();
        const hideSearch = panel && panel.querySelector('[data-wf-dash-hide-search="1"]');
        if (hideSearch) tab = 'filters';
        else if (tab !== 'search' && tab !== 'filters') tab = 'search';
        this._state.leftTab = tab;
        this._closeAllMsDropdowns();
        this._syncLeftTabUi();
    },

    _syncLeftTabUi() {
        const outPanel = this._outputPanel();
        const hideSearch = outPanel && outPanel.querySelector('[data-wf-dash-hide-search="1"]');
        let tab = this._state.leftTab === 'filters' ? 'filters' : 'search';
        if (hideSearch) tab = 'filters';
        this._state.leftTab = tab;
        const searchPanel = this._q('#wf-dash-left-panel-search');
        const filtersPanel = this._q('#wf-dash-left-panel-filters');
        if (searchPanel) searchPanel.style.display = tab === 'search' ? 'flex' : 'none';
        if (filtersPanel) filtersPanel.style.display = tab === 'filters' ? 'flex' : 'none';
        const filterActions = this._q('#wf-dash-actions-filters');
        if (filterActions) filterActions.style.display = tab === 'filters' ? 'flex' : 'none';
        const tabRoot = outPanel || this._modal;
        if (tabRoot) {
            tabRoot.querySelectorAll('[data-wf-dash-left-tab]').forEach((btn) => {
                const active = btn.getAttribute('data-wf-dash-left-tab') === tab;
                btn.style.cssText = this._leftTabStyle(active);
            });
        }
        this._syncLeftMessagesBar();
    },

    _isMessageElVisible(el) {
        if (!el || el.style.display === 'none') return false;
        return Boolean((el.textContent || '').trim()) || el.children.length > 0;
    },

    _syncLeftMessagesBar() {
        const bar = this._q('#wf-dash-left-messages');
        if (!bar) return;
        const tab = this._state.leftTab || 'search';
        const sessionBanner = this._q('#wf-dash-session-refresh-banner');
        const bootstrapErr = this._q('#wf-dash-bootstrap-error');
        const universal = this._q('#wf-dash-universal-hint');
        const rangeErr = this._q('#wf-dash-range-error');
        const searchErr = this._q('#wf-dash-search-error');
        const retrieveErr = this._q('#wf-dash-retrieve-error');
        const substringErr = this._q('#wf-dash-substring-error');
        const applyHint = this._q('#wf-dash-apply-hint');
        const sharedVisible = this._isMessageElVisible(sessionBanner) || this._isMessageElVisible(bootstrapErr);
        const searchVisible = sharedVisible
            || this._isMessageElVisible(universal)
            || this._isMessageElVisible(rangeErr)
            || this._isMessageElVisible(searchErr)
            || this._isMessageElVisible(retrieveErr);
        const filtersVisible = sharedVisible
            || this._isMessageElVisible(substringErr)
            || this._isMessageElVisible(applyHint);
        const show = tab === 'filters' ? filtersVisible : searchVisible;
        if (show) {
            bar.style.display = 'flex';
        } else {
            bar.style.display = 'none';
        }
    },

    _applyQuickDatePreset(preset) {
        const range = dashQuickDatePresetRange(preset);
        if (!range) {
            Logger.warn('dashboard: unknown quick date preset — ' + preset);
            return;
        }
        if (range.clear) {
            this._applyingQuickDate = true;
            try {
                const afterEl = this._q('#wf-dash-after');
                const beforeEl = this._q('#wf-dash-before');
                if (afterEl) afterEl.value = '';
                if (beforeEl) beforeEl.value = '';
            } finally {
                this._applyingQuickDate = false;
            }
            this._validateRangeUi();
            Logger.log('dashboard: quick date preset applied (' + range.label + ')');
            return;
        }
        this._applyingQuickDate = true;
        try {
            const afterEl = this._q('#wf-dash-after');
            const beforeEl = this._q('#wf-dash-before');
            if (afterEl) afterEl.value = dashDateInputValue(range.after);
            if (beforeEl) beforeEl.value = dashDateInputValue(range.before);
        } finally {
            this._applyingQuickDate = false;
        }
        this._validateRangeUi();
        Logger.log('dashboard: quick date preset applied (' + range.label + ')');
    },

    _clearDateRangeFields() {
        ['#wf-dash-after', '#wf-dash-before'].forEach((sel) => { const el = this._q(sel); if (el) el.value = ''; });
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = '';
        this._validateRangeUi();
        this._syncFieldClearButtons();
    },

    _syncFieldClearButtons() {
        const prompt = this._q('#wf-dash-prompt');
        const clearPrompt = this._q('#wf-dash-clear-prompt');
        if (clearPrompt) {
            clearPrompt.style.display = (prompt && prompt.value.trim()) ? '' : 'none';
        }
        this._syncPromptFilterHeight(prompt);
        const after = (this._q('#wf-dash-after') || {}).value || '';
        const before = (this._q('#wf-dash-before') || {}).value || '';
        const clearDates = this._q('#wf-dash-clear-dates');
        if (clearDates) {
            clearDates.style.display = (after || before) ? '' : 'none';
        }
    },

    _syncPromptFilterHeight(el) {
        const prompt = el || this._q('#wf-dash-prompt');
        if (!prompt || String(prompt.tagName || '').toUpperCase() !== 'TEXTAREA') return;
        prompt.style.height = 'auto';
        const minHeight = 36;
        prompt.style.height = Math.max(minHeight, prompt.scrollHeight) + 'px';
    },

    _validateRangeUi() {
        const after = (this._q('#wf-dash-after') || {}).value || '';
        const before = (this._q('#wf-dash-before') || {}).value || '';
        const check = dashValidateCreatedAtRange(after, before);
        const el = this._q('#wf-dash-range-error');
        if (el) {
            if (!check.valid && (after || before)) {
                el.textContent = check.error;
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        }
        const lib = dashLib();
        const quickPreset = ((this._q('#wf-dash-quick-range') || {}).value || '');
        const isAllTime = quickPreset === 'all-time';
        const isUniversal = lib.isUniversalSearchParams({
            authorCount: this._namedAuthorTokenCount(),
            searchTeamIds: this._selectedFromList('search-teams'),
            searchProjectIds: this._selectedFromList('search-projects'),
            searchEnvKeys: this._selectedFromList('search-envs')
        });
        const hintEl = this._q('#wf-dash-universal-hint');
        if (hintEl) {
            if (isAllTime && isUniversal) {
                hintEl.textContent = 'All Time — no date bound on this search.';
                hintEl.style.display = 'block';
            } else {
                hintEl.style.display = 'none';
            }
        }
        const searchBtn = this._q('#wf-dash-search');
        if (searchBtn) {
            const noOutputTypes = !this._state.includeTasks && !this._state.includeQa
                && !this._state.includeDisputes && !this._state.includeSeniorReview
                && !this._state.includeSessions;
            const searchDisabled = this._state.loading
                || noOutputTypes
                || ((after || before) && !check.valid);
            searchBtn.disabled = searchDisabled;
        }
        const retrieveBtn = this._q('#wf-dash-retrieve-btn');
        const retrieveInputEl = this._q('#wf-dash-retrieve-input');
        if (retrieveBtn) {
            if (this._state.loading) {
                retrieveBtn.disabled = true;
            } else if (retrieveBtn.textContent === 'Retrieve') {
                const retrieveInput = (retrieveInputEl && retrieveInputEl.value) || '';
                const retrieveDisabled = !String(retrieveInput).trim();
                retrieveBtn.disabled = retrieveDisabled;
            }
        }
        this._setRetrieveClipboardButtonsDisabled(this._state.loading);
        if (retrieveInputEl) retrieveInputEl.disabled = this._state.loading;
        this._syncFieldClearButtons();
        this._syncLeftMessagesBar();
        return { check, isUniversal };
    },

    _isFilterSelectionValid() {
        return Boolean(this._state.cachedItems);
    },

    _filterArraysEqual(a, b) {
        const left = [...(a || [])].sort();
        const right = [...(b || [])].sort();
        if (left.length !== right.length) return false;
        for (let i = 0; i < left.length; i++) {
            if (left[i] !== right[i]) return false;
        }
        return true;
    },

    _filtersDraftDiffersFromApplied() {
        const applied = this._state.appliedFilters;
        if (!applied) return this._state.cachedItems !== null;
        const draft = this._currentClientFilters();
        const bounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        if ((draft.promptText || '').trim() !== (applied.promptText || '').trim()) return true;
        if (Boolean(draft.fuzzy) !== Boolean(applied.fuzzy)) return true;
        if (Boolean(draft.regex) !== Boolean(applied.regex)) return true;
        if (Boolean(draft.caseSensitive) !== Boolean(applied.caseSensitive)) return true;
        const keys = dashFilterScopes().map((s) => s.draftKey);
        for (const key of keys) {
            const boundIds = bounds[key] || [];
            if (!this._filterDimensionEquivalent(draft[key], applied[key], boundIds)) return true;
        }
        const manual = this._readSearchOutputManualFilters();
        if ((applied.manualAndOr || 'and') !== manual.andOr) return true;
        if (!this._manualFilterRowsEqual(applied.manualFilters, manual.rows)) return true;
        return false;
    },

    _isPromptRegexFilterEnabled() {
        return Boolean((this._q('#wf-dash-regex') || {}).checked);
    },

    _maybeLiveApplyPromptFilter() {
        if (this._state.loading || !this._state.cachedItems) {
            this._updateApplyFiltersUi();
            return;
        }
        if (this._isPromptRegexFilterEnabled()) {
            this._updateApplyFiltersUi();
            return;
        }
        const promptText = (this._q('#wf-dash-prompt') || {}).value || '';
        const caseSensitive = Boolean((this._q('#wf-dash-case') || {}).checked);
        const lib = dashLib();
        const filterInvalid = lib.isPromptFilterInvalid(promptText, caseSensitive, false);
        if (filterInvalid.invalid) {
            this._updateApplyFiltersUi();
            return;
        }
        this._applyFiltersAndRender();
    },

    _maybeLiveApplyFilterMsChange(_msKey) {
        if (this._state.loading || !this._state.cachedItems) {
            this._updateApplyFiltersUi();
            return;
        }
        const promptText = (this._q('#wf-dash-prompt') || {}).value || '';
        const caseSensitive = Boolean((this._q('#wf-dash-case') || {}).checked);
        const regex = Boolean((this._q('#wf-dash-regex') || {}).checked);
        const lib = dashLib();
        const filterInvalid = lib.isPromptFilterInvalid(promptText, caseSensitive, regex);
        if (filterInvalid.invalid) {
            this._updateApplyFiltersUi();
            return;
        }
        this._applyFiltersAndRender();
    },

    _applyCardMetaFilter(scopeKey, valueId) {
        const key = String(scopeKey || '').trim();
        const id = String(valueId || '').trim();
        if (!key || !id) {
            Logger.warn('dashboard: card meta filter skipped — missing scope or id');
            return;
        }
        if (key !== 'filter-envs' && key !== 'filter-teams' && key !== 'filter-projects') {
            Logger.warn('dashboard: card meta filter skipped — unsupported scope ' + key);
            return;
        }
        if (!this._state.cachedItems) {
            Logger.warn('dashboard: card meta filter skipped — no results');
            return;
        }
        const itemsEl = this._msItemsEl(key);
        if (!itemsEl) {
            Logger.warn('dashboard: card meta filter skipped — filter list missing (' + key + ')');
            return;
        }
        const checkboxes = [...itemsEl.querySelectorAll('input[type="checkbox"][data-wf-dash-ms]')];
        const target = checkboxes.find((cb) => cb.value === id);
        if (!target) {
            Logger.warn('dashboard: card meta filter skipped — option not in ' + key + ' (' + id.slice(0, 12) + ')');
            return;
        }
        checkboxes.forEach((cb) => { cb.checked = cb === target; });
        this._setMsBulkToggleMode(key, 'none');
        this._applyMsBulkToggleLabel(key);
        this._updateMsCount(key);
        if (typeof this._updateFilterSelectionOrder === 'function') {
            this._updateFilterSelectionOrder(key);
        }
        this._renderFilterLists();
        this._maybeLiveApplyFilterMsChange(key);
        this._updateApplyFiltersUi();
        const label = this._filterScopeLabel(key).toLowerCase();
        Logger.log('dashboard: filtered ' + label + ' to ' + id);
    },

    _updateApplyFiltersUi() {
        const promptText = (this._q('#wf-dash-prompt') || {}).value || '';
        const caseSensitive = Boolean((this._q('#wf-dash-case') || {}).checked);
        const regex = Boolean((this._q('#wf-dash-regex') || {}).checked);
        const lib = dashLib();
        const filterInvalid = lib.isPromptFilterInvalid(promptText, caseSensitive, regex);
        const el = this._q('#wf-dash-substring-error');
        if (el) {
            if (filterInvalid.invalid) {
                el.textContent = filterInvalid.message;
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        }
        const selectionValid = this._isFilterSelectionValid();
        const hasPendingChanges = this._filtersDraftDiffersFromApplied();
        const applyBtn = this._q('#wf-dash-apply-filters');
        const resetFiltersBtn = this._q('#wf-dash-reset-filters');
        const noResults = !this._state.cachedItems;
        const disabled = noResults || filterInvalid.invalid || !selectionValid || !hasPendingChanges;
        if (applyBtn) {
            applyBtn.disabled = disabled;
        }
        if (resetFiltersBtn) {
            resetFiltersBtn.disabled = noResults || Boolean(this._state.loading);
        }
        const applyHint = this._q('#wf-dash-apply-hint');
        if (applyHint) {
            applyHint.style.display = 'none';
        }
        this._syncFieldClearButtons();
        this._syncLeftMessagesBar();
    },

    _updateSubstringErrorUi() {
        this._updateApplyFiltersUi();
    },

    _parseRetrieveInput(raw) {
        const text = String(raw || '').trim();
        if (!text) return null;

        const classifySegment = (seg) => {
            if (!seg) return null;
            if (DASH_UUID_RE.test(seg)) return { kind: 'id', value: seg };
            if (DASH_TASK_KEY_RE.test(seg)) return { kind: 'key', value: seg };
            return null;
        };

        if (/^https?:\/\//i.test(text) || text.startsWith('/')) {
            try {
                const url = new URL(text, dashFleetOrigin());
                const segments = url.pathname.split('/').filter(Boolean).concat([...url.searchParams.values()]);
                for (const seg of segments) {
                    const parsed = classifySegment(seg);
                    if (parsed) return parsed;
                }
            } catch (_e) { /* not a URL */ }
        }

        const direct = classifySegment(text);
        if (direct) return direct;

        const uuidMatch = text.match(DASH_UUID_RE);
        if (uuidMatch) return { kind: 'id', value: uuidMatch[0] };

        const keyMatch = text.match(/task_[A-Za-z0-9_]+/);
        if (keyMatch) return { kind: 'key', value: keyMatch[0] };

        return null;
    },

    _tokenizeRetrieveInput(raw) {
        // Strip JSON array chrome ([ ] " ') — never appears in UUIDs, task keys, or URLs.
        const normalized = String(raw || '').replace(/[\[\]"']/g, '');
        const primary = normalized
            .split(/[,\r\n]+/)
            .map((t) => t.trim())
            .filter(Boolean);
        const tokens = [];
        for (const chunk of primary) {
            if (/^https?:\/\//i.test(chunk)) {
                tokens.push(chunk);
                continue;
            }
            // Whitespace (text inputs / pasted blobs) and concatenated task_… keys.
            const pieces = chunk.split(/\s+/).filter(Boolean);
            for (const piece of pieces) {
                if (/^https?:\/\//i.test(piece)) {
                    tokens.push(piece);
                    continue;
                }
                const taskHits = piece.match(/task_/g);
                if (taskHits && taskHits.length > 1) {
                    tokens.push(...piece.split(/(?=task_)/).map((s) => s.trim()).filter(Boolean));
                } else {
                    tokens.push(piece);
                }
            }
        }
        return tokens;
    },

    _parseRetrieveInputList(raw) {
        const tokens = this._tokenizeRetrieveInput(raw);
        const parsed = [];
        const invalid = [];
        for (const token of tokens) {
            const one = this._parseRetrieveInput(token);
            if (one) parsed.push(one);
            else invalid.push(token);
        }
        return { parsed, invalid };
    },

    _formatRetrieveLabel(values) {
        const list = (values || []).map((v) => String(v || '').trim()).filter(Boolean);
        if (!list.length) return '';
        if (list.length === 1) return list[0];
        if (list.length <= 3) return list.join(', ');
        return list.slice(0, 2).join(', ') + ' (+' + (list.length - 2) + ' more)';
    },

    async _fetchTaskRowForRetrieve(parsed) {
        if (parsed.kind === 'key') {
            const rows = await this._pgQuery('tasks.select_search', { key: 'eq.' + parsed.value, limit: '1' }, 'search');
            return { row: rows[0] || null, versionOverride: null };
        }
        let rows = await this._pgQuery('tasks.select_search', { id: 'eq.' + parsed.value, limit: '1' }, 'search');
        if (rows.length) return { row: rows[0], versionOverride: null };
        const versionRows = await this._pgQuery('task_versions.select_history', { id: 'eq.' + parsed.value, limit: '1' }, 'search');
        if (!versionRows.length) return { row: null, versionOverride: null };
        const versionRow = versionRows[0];
        const taskId = versionRow.task_id;
        if (!taskId) return { row: null, versionOverride: null };
        rows = await this._pgQuery('tasks.select_search', { id: 'eq.' + taskId, limit: '1' }, 'search');
        return { row: rows[0] || null, versionOverride: versionRow };
    },

    async _buildRetrieveTaskItem(taskRow, versionOverride) {
        const profileIds = taskRow.created_by ? [taskRow.created_by] : [];
        const targetIds = taskRow.task_project_target_id ? [taskRow.task_project_target_id] : [];
        const [profileRows, targetToProjectId] = await Promise.all([
            profileIds.length > 0
                ? this._fetchProfilesByIds(profileIds, 'search')
                : Promise.resolve([]),
            targetIds.length > 0
                ? this._fetchTargetProjectMap(targetIds)
                : Promise.resolve(new Map())
        ]);
        const profilesMap = this._buildProfilesMap(profileRows);
        const task = this._rowToTask(taskRow, profilesMap, versionOverride, targetToProjectId);
        task.promptVersions = [];
        task.allFeedback = [];
        const items = this._taskCreationItemsFromTasks([task]);
        return Object.assign({}, items[0], { hydrated: false });
    },

    _setRetrieveMessage(text, kind) {
        const el = this._q('#wf-dash-retrieve-error');
        if (!el) {
            this._syncLeftMessagesBar();
            return;
        }
        if (!text) {
            el.textContent = '';
            el.style.display = 'none';
            el.style.color = 'var(--destructive, #dc2626)';
            this._syncLeftMessagesBar();
            return;
        }
        const isWarning = kind === 'warning';
        el.textContent = (isWarning ? 'Warning: ' : 'Error: ') + text;
        el.style.display = 'block';
        el.style.color = isWarning
            ? 'var(--warning, #b45309)'
            : 'var(--destructive, #dc2626)';
        this._syncLeftMessagesBar();
    },

    _retrieveClipboardButtons() {
        return [
            this._q('#wf-dash-retrieve-clipboard'),
            this._q('#wf-dash-results-retrieve-clipboard')
        ].filter(Boolean);
    },

    _setRetrieveClipboardButtonsDisabled(disabled) {
        for (const btn of this._retrieveClipboardButtons()) {
            btn.disabled = Boolean(disabled);
        }
    },

    _setRetrieveError(text) {
        this._setRetrieveMessage(text, 'error');
    },

    _setRetrieveButtonLoading(loading) {
        const btn = this._q('#wf-dash-retrieve-btn');
        if (btn) {
            btn.textContent = loading ? 'Loading…' : 'Retrieve';
            btn.disabled = loading;
        }
        const clearBtn = this._q('#wf-dash-retrieve-clear');
        if (clearBtn) clearBtn.disabled = loading;
        this._setRetrieveClipboardButtonsDisabled(loading);
        const input = this._q('#wf-dash-retrieve-input');
        if (input) input.disabled = loading;
    },

    _clearRetrieveInput() {
        this._state.retrieveInput = '';
        const input = this._q('#wf-dash-retrieve-input');
        if (input) input.value = '';
        this._setRetrieveError('');
        Logger.log('search-output: retrieve task input cleared');
    },

    async _submitRetrieveFromClipboard(sourceBtn) {
        const clipboardBtn = sourceBtn
            || this._q('#wf-dash-retrieve-clipboard')
            || this._q('#wf-dash-results-retrieve-clipboard');
        if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
            this._setRetrieveError('Clipboard read is not available in this browser.');
            if (clipboardBtn && Context.buttonFeedback) {
                Context.buttonFeedback.flashFailure(clipboardBtn);
            }
            Logger.warn('search-output: retrieve from clipboard skipped — clipboard API unavailable');
            return;
        }
        let text = '';
        try {
            text = await navigator.clipboard.readText();
        } catch (err) {
            this._setRetrieveError('Could not read clipboard. Allow clipboard access and try again.');
            if (clipboardBtn && Context.buttonFeedback) {
                Context.buttonFeedback.flashFailure(clipboardBtn);
            }
            Logger.warn('search-output: retrieve from clipboard failed', err);
            return;
        }
        const raw = String(text || '').trim();
        if (!raw) {
            this._setRetrieveError('Clipboard is empty.');
            if (clipboardBtn && Context.buttonFeedback) {
                Context.buttonFeedback.flashFailure(clipboardBtn);
            }
            Logger.log('search-output: retrieve from clipboard skipped — empty');
            return;
        }
        this._state.retrieveInput = raw;
        const input = this._q('#wf-dash-retrieve-input');
        if (input) input.value = raw;
        const { parsed, invalid } = this._parseRetrieveInputList(raw);
        if (!parsed.length) {
            this._setRetrieveError(
                'Enter a valid task ID, version ID, task key, or Fleet URL.'
            );
            if (clipboardBtn && Context.buttonFeedback) {
                Context.buttonFeedback.flashFailure(clipboardBtn);
            }
            Logger.log('search-output: retrieve from clipboard skipped — no valid task IDs');
            return;
        }
        this._setRetrieveError('');
        Logger.log('search-output: retrieve from clipboard — ' + raw.length + ' chars');
        if (clipboardBtn && Context.buttonFeedback) {
            Context.buttonFeedback.flashSuccess(clipboardBtn);
        }
        await this._submitRetrieveTask();
    },

    async _submitRetrieveTask() {
        this._ensureSearchOutputTabForUserSearch();
        const inputEl = this._q('#wf-dash-retrieve-input');
        const raw = inputEl ? inputEl.value : (this._state.retrieveInput || '');
        this._state.retrieveInput = String(raw || '').trim();
        const { parsed, invalid } = this._parseRetrieveInputList(raw);
        if (!parsed.length) {
            this._logDashApiSkip('retrieve-task', 'invalid input');
            this._setRetrieveError(
                'Enter a valid task ID, version ID, task key, or Fleet URL.'
            );
            return;
        }
        this._setRetrieveError('');
        this._setSearchError('');

        const totalRequested = parsed.length + invalid.length;
        const retrieveCommitted = {
            retrieveMode: true,
            retrieveLabel: this._formatRetrieveLabel(parsed.map((p) => p.value)),
            retrieveCount: parsed.length,
            includeTaskCreation: true,
            includeQa: false,
            includeDisputes: false,
            includeSeniorReview: false,
            includeSessions: false,
            authorCount: 0,
            authorLabels: [],
            searchKinds: ['task_creation']
        };
        this._beginResultsLoad();
        this._resetSearchLoadLog();
        this._state.searchLoadPhase = parsed.length > 1
            ? ('Retrieving task 1 of ' + parsed.length + '…')
            : 'Retrieving task…';
        this._state.committed = retrieveCommitted;
        this._state.statsSmartBindings = {};
        this._setRetrieveButtonLoading(true);
        this._setSearchButtonLoading(false);
        this._updateResultsKindTabsUi();
        this._syncResultsToolbarDerivedUi();
        this._updateResultsStatus();
        this._renderResults();

        this._state.searchFetchActive = true;
        try {
            this._logDashApiClick(
                'retrieve-task',
                parsed.length + ' id(s)'
                    + (invalid.length ? (', ' + invalid.length + ' invalid') : '')
            );
            const items = [];
            const seenTaskIds = new Set();
            const notFound = [];
            const foundLabels = [];

            for (let i = 0; i < parsed.length; i++) {
                const one = parsed[i];
                if (parsed.length > 1) {
                    this._setSearchLoadPhase(
                        'Retrieving task ' + (i + 1) + ' of ' + parsed.length + '…',
                        items.length
                    );
                }
                const { row, versionOverride } = await this._fetchTaskRowForRetrieve(one);
                if (!row) {
                    notFound.push(one.value);
                    continue;
                }
                const taskId = String(row.id || '');
                if (taskId && seenTaskIds.has(taskId)) continue;
                if (taskId) seenTaskIds.add(taskId);
                const item = await this._buildRetrieveTaskItem(row, versionOverride);
                items.push(item);
                foundLabels.push(one.value);
            }

            if (!items.length) {
                this._setRetrieveError(
                    notFound.length > 1
                        ? 'No tasks found for those identifiers.'
                        : 'No task found for that identifier.'
                );
                this._restoreResultsLoadSnapshotOnError();
                return;
            }

            retrieveCommitted.retrieveLabel = this._formatRetrieveLabel(foundLabels);
            retrieveCommitted.retrieveCount = items.length;
            this._state.committed = retrieveCommitted;
            this._state.cachedItems = items;
            this._setSearchLoadPhase(
                items.length > 1
                    ? ('Hydrating ' + items.length + ' tasks…')
                    : 'Hydrating task…',
                items.length
            );
            await this._hydrateAllSearchResults(items, { skipFeedbackFetch: false });
            this._setSearchLoadPhase('Applying filters…', items.length);
            Logger.log(
                'search-output: retrieve task loaded — '
                    + items.length + ' found'
                    + (invalid.length ? (', ' + invalid.length + ' invalid') : '')
                    + (notFound.length ? (', ' + notFound.length + ' not found') : '')
                    + ' (fully hydrated)'
            );
            const additive = this._isAdditiveResultsMode()
                && Array.isArray(this._state.resultsLoadSnapshot)
                && this._state.resultsLoadSnapshot.length > 0;
            this._finalizeResultsLoad(items, {
                committed: additive ? null : retrieveCommitted
            });

            const warnParts = [];
            if (invalid.length) {
                warnParts.push(
                    'Skipped invalid: '
                        + this._formatRetrieveLabel(invalid)
                );
            }
            if (notFound.length) {
                warnParts.push(
                    'Not found: '
                        + this._formatRetrieveLabel(notFound)
                );
            }
            if (warnParts.length) {
                this._setRetrieveMessage(
                    'Retrieved ' + items.length + ' of ' + totalRequested + '. '
                        + warnParts.join(' '),
                    'warning'
                );
            }
        } catch (err) {
            if (this._handleDashSessionRefreshError(err)) {
                this._setRetrieveError('');
            } else {
                this._setRetrieveError(err.message || String(err));
            }
            this._restoreResultsLoadSnapshotOnError();
            Logger.warn('search-output: retrieve task failed', err);
        } finally {
            this._state.searchFetchActive = false;
            this._state.loading = false;
            this._state.searchLoadPhase = '';
            this._resetSearchLoadLog();
            this._setRetrieveButtonLoading(false);
            this._validateRangeUi();
            this._updateSubstringErrorUi();
            this._updateApplyFiltersUi();
            if (this._state.cachedItems !== null) {
                this._refreshResultsView({ filterSource: 'search-defaults' });
            } else {
                this._updateResultsStatus();
                this._renderResults();
                this._updateResultsKindTabsUi();
                this._syncResultsToolbarDerivedUi();
            }
        }
    },

    async _submitSearch() {
        try {
            this._ensureSearchOutputTabForUserSearch();
            const authorFlushError = await this._flushPendingAuthorInput();
            if (authorFlushError) {
                this._logDashApiSkip('search', 'author input error');
                this._setSearchError(authorFlushError);
                return;
            }

            const includeTasks = this._state.includeTasks;
            const includeQa = this._state.includeQa;
            const includeDisputes = this._state.includeDisputes;
            const includeSeniorReview = this._state.includeSeniorReview;
            const includeSessions = this._state.includeSessions;
            if (!includeTasks && !includeQa && !includeDisputes && !includeSeniorReview && !includeSessions) {
                this._logDashApiSkip('search', 'no contributor areas enabled');
                this._setSearchError('Enable at least one contributor search area: Task Creation, QA, Disputes, Sr Review, or Sessions.');
                return;
            }
            const after = (this._q('#wf-dash-after') || {}).value || '';
            const before = (this._q('#wf-dash-before') || {}).value || '';
            const rangeCheck = dashValidateCreatedAtRange(after, before);
            if (!rangeCheck.valid) {
                this._logDashApiSkip('search', 'invalid date range');
                this._setSearchError(rangeCheck.error);
                return;
            }
            const lib = dashLib();
            if (!lib) {
                this._logDashApiSkip('search', 'dashboard helpers not loaded');
                this._setSearchError('Dashboard helpers not loaded. Reload the page and try again.');
                return;
            }

            const everyoneMode = this._hasEveryoneAuthorToken();
            const namedTokens = this._state.draftTokens.filter((t) => !this._isEveryoneAuthorToken(t));
            const authorIds = namedTokens.map((t) => t.id);
            const authorLabels = everyoneMode
                ? [DASH_EVERYONE_AUTHOR_LABEL]
                : namedTokens.map((t) => this._personDisplayLabel(t));
            const searchLimit = this._readSearchLimitFromUi();
            this._state.searchLimit = searchLimit;
            const searchCommitted = {
                authorIds,
                authorCount: authorIds.length,
                authorLabels,
                ratingsEveryone: everyoneMode,
                includeTaskCreation: includeTasks,
                includeQa,
                includeDisputes,
                includeSeniorReview,
                includeSessions,
                searchLimit,
                afterLocal: after,
                beforeLocal: before,
                searchKinds: [
                    includeTasks ? 'task_creation' : null,
                    includeQa ? 'qa' : null,
                    includeDisputes ? 'dispute' : null,
                    includeSeniorReview ? 'senior_review' : null,
                    includeSessions ? 'sessions' : null
                ].filter(Boolean)
            };
            this._state.committed = searchCommitted;
            this._state.statsSmartBindings = {};
            this._state.ratingsFromResults = false;
            this._beginResultsLoad();
            this._state.searchStopRequested = false;
            this._resetSearchLoadLog();
            this._state.searchLoadPhase = 'Building search scope…';
            this._setSearchError('');
            this._setSearchButtonLoading(true);
            this._updateResultsKindTabsUi();
            this._syncResultsToolbarDerivedUi();
            this._updateResultsStatus();
            this._renderResults();

            this._state.searchFetchActive = true;
            const gen = (this._state.searchGeneration = (this._state.searchGeneration || 0) + 1);
            const hadPriorResults = this._isAdditiveResultsMode()
                && Array.isArray(this._state.resultsLoadSnapshot)
                && this._state.resultsLoadSnapshot.length > 0;
            try {
                const scope = await this._buildSearchApiScope();
                if (this._shouldStopSearch()) {
                    this._finishStoppedSearch([]);
                    return;
                }
                if (gen !== this._state.searchGeneration) { Logger.debug('dashboard: stale search gen ' + gen + ' dropped'); return; }
                this._logDashApiClick('search',
                    (authorIds.length > 0 ? authorIds.length + ' author(s)' : 'all authors')
                    + ' · types: ' + [includeTasks ? 'tasks' : null, includeQa ? 'QA' : null, includeDisputes ? 'disputes' : null, includeSeniorReview ? 'Sr Review' : null, includeSessions ? 'sessions' : null].filter(Boolean).join('+')
                    + (after ? ' · after ' + after : '') + (before ? ' · before ' + before : '')
                    + (searchLimit != null ? ' · limit ' + searchLimit : ''));
                const searchResult = await this._fetchWorkerOutputSearch({
                    authorIds,
                    includeTaskCreation: includeTasks,
                    includeQa,
                    includeDisputes,
                    includeSeniorReview,
                    includeSessions,
                    searchLimit,
                    afterIso: rangeCheck.afterIso,
                    beforeIso: rangeCheck.beforeIso,
                    scope
                });
                const items = searchResult.items;
                this._state.cachedItems = items;
                if (searchResult.sessionQaSeed) {
                    this._applySessionQaSearchSeed(searchResult.sessionQaSeed);
                }
                if (this._shouldStopSearch()) {
                    this._finishStoppedSearch(items);
                    return;
                }
                if (gen !== this._state.searchGeneration) { Logger.debug('dashboard: stale search gen ' + gen + ' dropped after fetch'); return; }
                this._setSearchLoadPhase('Applying filters…', items.length);
                Logger.log('dashboard: search loaded ' + items.length + ' item(s)'
                    + (hadPriorResults ? ' (add mode)' : ''));
                this._finalizeResultsLoad(items, {
                    committed: hadPriorResults ? null : searchCommitted
                });
            } catch (err) {
                if (gen !== this._state.searchGeneration) {
                    Logger.debug('dashboard: stale search gen ' + gen + ' dropped in catch');
                    return;
                }
                if (this._handleDashSessionRefreshError(err)) {
                    this._setSearchError('');
                } else {
                    this._setSearchError(err.message || String(err));
                }
                this._restoreResultsLoadSnapshotOnError();
                Logger.warn('dashboard: search failed', err);
            } finally {
                if (gen !== this._state.searchGeneration) {
                    Logger.debug('dashboard: stale search gen ' + gen + ' skipped finally');
                    return;
                }
                this._state.searchFetchActive = false;
                this._resetSearchLoadLog();
                if (this._state.cachedItems !== null) {
                    await this._refreshResultsView({
                        filterSource: 'search-defaults',
                        prehydrateInitialBatch: true
                    });
                } else {
                    this._state.loading = false;
                    this._state.searchLoadPhase = '';
                    this._updateResultsStatus();
                    this._renderResults();
                    this._updateResultsKindTabsUi();
                    this._syncResultsToolbarDerivedUi();
                }
                this._setSearchButtonLoading(false);
                this._validateRangeUi();
                this._updateSubstringErrorUi();
                this._updateApplyFiltersUi();
            }
        } catch (err) {
            if (!this._handleDashSessionRefreshError(err)) {
                this._setSearchError(err.message || String(err));
            }
            Logger.error('dashboard: search submit failed', err);
        }
    },

    _clearParameters() {
        this._state.draftTokens = [];
        this._markTimeFilterUserPicked();
        this._state.includeTasks = true;
        this._state.includeQa = true;
        this._state.includeDisputes = false;
        this._state.includeSeniorReview = false;
        this._state.includeSessions = false;
        this._state.searchLimit = null;
        ['#wf-dash-after', '#wf-dash-before'].forEach((sel) => { const el = this._q(sel); if (el) el.value = ''; });
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = '';
        const limitEl = this._q('#wf-dash-search-limit');
        if (limitEl) limitEl.value = '';
        ['search-teams', 'search-projects', 'search-envs'].forEach((key) => {
            const itemsEl = this._msItemsEl(key);
            if (itemsEl) itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
            this._setMsBulkToggleMode(key, 'all');
            this._applyMsBulkToggleLabel(key);
            this._updateMsCount(key);
        });
        this._syncOutputToggleUi();
        this._renderSearchProjectsList();
        this._renderAuthorTokens();
        this._hideAuthorCandidates();
        this._setAuthorError('');
        this._setSearchError('');
        this._state.sessionRefreshRequired = false;
        this._syncDashSessionRefreshBanner();
        this._validateRangeUi();
        Logger.log('dashboard: search parameters reset');
    },

    _clearFilterUiFields() {
        const prompt = this._q('#wf-dash-prompt');
        if (prompt) prompt.value = '';
        const sortEl = this._q('#wf-dash-sort');
        if (sortEl) sortEl.value = dashSortDefault();
        ['#wf-dash-case', '#wf-dash-fuzzy', '#wf-dash-regex'].forEach((sel) => {
            const el = this._q(sel);
            if (el) el.checked = false;
        });
        this._updateSubstringErrorUi();
        this._syncFieldClearButtons();
        this._resetManualFilters();
    },

    async _resetFiltersToDefaults() {
        if (!this._state.cachedItems) {
            Logger.debug('dashboard: filter reset skipped — no results loaded');
            return;
        }
        this._clearFilterUiFields();
        this._state.filterSelectionOrder = [];
        const ok = await this._refreshResultsView({ resetPage: true, filterSource: 'filter-reset' });
        if (ok) {
            Logger.log('dashboard: filters reset to defaults (all options selected)');
        }
    },

    _currentClientFilters() {
        const bounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        const draft = this._getFilterDraft();
        const checkboxFilters = {};
        for (const { draftKey } of dashFilterScopes()) {
            const sel = draft[draftKey] || [];
            const boundIds = bounds[draftKey] || [];
            checkboxFilters[draftKey] = this._normalizeFilterDimensionSelection(sel, boundIds);
        }
        const sort = this._readDashSortFromUi();
        return Object.assign({}, checkboxFilters, {
            promptText: (this._q('#wf-dash-prompt') || {}).value || '',
            fuzzy: Boolean((this._q('#wf-dash-fuzzy') || {}).checked),
            regex: Boolean((this._q('#wf-dash-regex') || {}).checked),
            caseSensitive: Boolean((this._q('#wf-dash-case') || {}).checked),
            sortMetric: sort.sortMetric,
            sortOrder: sort.sortOrder
        });
    },

    _hasActiveFilters() {
        const applied = this._state.appliedFilters;
        const bounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        if (!applied) return false;
        const lib = dashLib();
        for (const { draftKey } of dashFilterScopes()) {
            if (!this._isDimensionUnrestricted(applied[draftKey] || [], bounds[draftKey] || [])) return true;
        }
        const manualActive = lib && typeof lib.normalizeFilterGroups === 'function'
            ? lib.normalizeFilterGroups(applied.manualFilters).length > 0
            : ((applied.manualFilters || []).length > 0);
        return (applied.regex && lib.isRegexQueryActive(applied.promptText))
            || (!applied.regex && !lib.isQueryEmpty(applied.promptText, applied.caseSensitive))
            || manualActive;
    },

    _applyFiltersAndRender() {
        this._refreshResultsView({ resetPage: true, filterSource: 'client' });
    },

    _setSearchError(text) {
        this._state.searchError = text || null;
        if (text) {
            this._state.sessionRefreshRequired = false;
            this._syncDashSessionRefreshBanner();
        }
        const el = this._q('#wf-dash-search-error');
        if (el) { el.textContent = text ? 'Error: ' + text : ''; el.style.display = text ? 'block' : 'none'; }
        this._syncLeftMessagesBar();
        this._updateResultsStatus();
        this._renderResults();
    },

    _searchStatusDetail(committed) {
        if (!committed) return '';
        if (committed.retrieveMode) {
            const count = Number(committed.retrieveCount) || 0;
            const prefix = count > 1 ? ('tasks (' + count + '): ') : 'task: ';
            return prefix + (committed.retrieveLabel || '');
        }
        const parts = [];
        if (committed.ratingsEveryone) {
            parts.push('contributors: ' + DASH_EVERYONE_AUTHOR_LABEL);
        } else if (committed.authorLabels && committed.authorLabels.length > 0) {
            parts.push('contributors: ' + committed.authorLabels.join(', '));
        } else {
            parts.push('all contributors');
        }
        const types = [];
        if (committed.includeTaskCreation) types.push('tasks');
        if (committed.includeQa) types.push('QA');
        if (committed.includeDisputes) types.push('disputes');
        if (committed.includeSeniorReview) types.push('Sr Review');
        if (committed.includeSessions) types.push('sessions');
        if (types.length > 0) parts.push('types: ' + types.join('+'));
        if (committed.searchLimit != null) parts.push('limit ' + committed.searchLimit);
        if (committed.afterLocal) parts.push('after ' + committed.afterLocal);
        if (committed.beforeLocal) parts.push('before ' + committed.beforeLocal);
        return parts.join(' · ');
    },

    _setSearchButtonLoading(loading) {
        const btn = this._q('#wf-dash-search');
        if (!btn) return;
        btn.textContent = loading ? 'Loading…' : 'Search';
        this._validateRangeUi();
        const clearParams = this._q('#wf-dash-clear-params');
        if (clearParams) clearParams.disabled = loading;
    },

    _canShowStopSearchButton() {
        const s = this._state;
        return Boolean(s && s.loading && s.committed && !s.committed.retrieveMode);
    },

    _shouldStopSearch() {
        const s = this._state;
        return Boolean(s && s.loading && s.searchStopRequested && s.committed && !s.committed.retrieveMode);
    },

    _requestStopSearchFetches() {
        if (!this._canShowStopSearchButton()) return;
        Logger.log('search-output: abort search requested');
        this._state.searchStopRequested = true;
        this._state.searchGeneration = (this._state.searchGeneration || 0) + 1;
    },

    _finishStoppedSearch(items) {
        const list = items || [];
        const hydratedCount = list.filter((it) => it && it.hydrated).length;
        Logger.info('search-output: search aborted — ' + list.length + ' item(s)'
            + (hydratedCount > 0 ? ', ' + hydratedCount + ' hydrated' : ''));
        const hadPrior = this._isAdditiveResultsMode()
            && Array.isArray(this._state.resultsLoadSnapshot)
            && this._state.resultsLoadSnapshot.length > 0;
        this._finalizeResultsLoad(list, {
            committed: hadPrior ? null : this._state.committed,
            skipFiltersTab: list.length === 0
        });
        this._state.searchFetchActive = false;
        this._state.loading = false;
        this._state.searchLoadPhase = '';
        this._state.searchStopRequested = false;
        this._resetSearchLoadLog();
        this._setSearchButtonLoading(false);
        this._updateSubstringErrorUi();
        this._updateApplyFiltersUi();
        this._refreshResultsView({ filterSource: 'search-defaults' });
    },

    _stopSearchButtonHtml() {
        if (!this._canShowStopSearchButton()) return '';
        const cls = this._dashBtnClass('basic', 'compact');
        return `<button type="button" data-wf-dash-stop-search="1" class="${cls}" style="margin-bottom: 10px;">Abort Search</button>`;
    }
};


const plugin = {
    id: 'search-output-left-pane',
    name: 'Search Output left pane',
    description: 'Worker Output Search tab — left pane',
    _version: '6.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        if (state && state.registered) {
            Logger.debug('already registered — skipping re-init');
            return;
        }
        Context.searchOutputLeftPaneMethods = searchOutputLeftPaneMethods;
        if (state) state.registered = true;
        Logger.log('registered (Context.searchOutputLeftPaneMethods)');
    }
};
