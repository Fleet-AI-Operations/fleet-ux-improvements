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
const DASH_HYDRATE_TAB_BG = '#64748b';
const DASH_CARD_TAB_HEIGHT = '24px';
const DASH_CARD_BORDER = '2px solid color-mix(in srgb, var(--foreground, #0f172a) 28%, var(--border, #cbd5e1))';
const DASH_CARD_TAB_BORDER = '1px solid color-mix(in srgb, var(--foreground, #0f172a) 28%, var(--border, #cbd5e1))';
const DASH_TASK_CARD_BG = '#121212';
const DASH_HYDRATE_BATCH_MAX = 100;
const DASH_HYDRATE_BATCH_CONCURRENCY = 5;
const DASH_SEARCH_FETCH_CONCURRENCY = 8;
const DASH_HELPFULNESS_BATCH_CHUNK = 100;
const DASH_RESULTS_PAGE_SIZE_DEFAULT = 100;
const DASH_BOOTSTRAP_VERSION = 3;
const DASH_BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const DASH_FLEET_ORIGIN = 'https://www.fleetai.com';
const DASH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Fleet eval_tasks.key shape, e.g. task_iyasykc1wvkn_1781012033021_oyzfvsbk0 */
const DASH_TASK_KEY_RE = /^task_[A-Za-z0-9_]+$/;
const DASH_TASKS_PAGE_SIZE = 100;
const DASH_QA_PAGE_SIZE = 100;
const DASH_DISPUTES_PAGE_SIZE = 100;
const DASH_DISPUTES_MAX_PAGES = 100;
const DASH_DISPUTES_TASK_FETCH_CONCURRENCY = 5;
const DASH_FLEET_FLAGS_PATH = '/task-flags';
const DASH_QA_SCREENSHOT_VIEW_URLS_PATH = '/orchestrator-private/v1/qa-feedback/screenshots/view-urls';
const DASH_FLEET_SENIOR_REVIEW_REFERER = DASH_FLEET_ORIGIN + '/work/problems/senior-review';
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
const DASH_FLEET_WEB_API = DASH_FLEET_ORIGIN + '/api';
const DASH_FLEET_INTERNAL_API = 'https://api.internal.fleet-platform.fleetai.com/v1';
const DASH_DISPUTE_REVIEWS_HISTORY_PAGE_SIZE = 50;
const DASH_DISPUTE_REVIEWS_HISTORY_MAX_PAGES = 3;
const SO_ROLLING_OVERLAY_OUTSET = 6;

const DASH_OUTPUT_KIND_CONFIG = {
    task_creation: {
        label: 'Task Creation',
        tabBg: '#16a34a',
        toggleActive: 'border: 2px solid #16a34a; color: #15803d; background: transparent;',
        textHighlight: 'font-weight: 600; color: #15803d;'
    },
    qa: {
        label: 'QA',
        tabBg: '#2563eb',
        toggleActive: 'border: 2px solid #2563eb; color: #1d4ed8; background: transparent;',
        textHighlight: 'font-weight: 600; color: #1d4ed8;'
    },
    dispute: {
        label: 'Disputes',
        tabBg: '#7c3aed',
        toggleActive: 'border: 2px solid #7c3aed; color: #6d28d9; background: transparent;',
        textHighlight: 'font-weight: 600; color: #6d28d9;'
    },
    senior_review: {
        label: 'Sr Review',
        tabBg: '#ca8a04',
        toggleActive: 'border: 2px solid #ca8a04; color: #a16207; background: transparent;',
        textHighlight: 'font-weight: 600; color: #a16207;'
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
    return id ? `${DASH_FLEET_ORIGIN}/dashboard/data/experts/${encodeURIComponent(id)}` : '';
}
function dashFleetTaskUrl(taskId) {
    const id = String(taskId || '').trim();
    return id ? `${DASH_FLEET_ORIGIN}/dashboard/data/tasks/${encodeURIComponent(id)}` : '';
}
function dashFleetProjectUrl(projectId) {
    const id = String(projectId || '').trim();
    return id ? `${DASH_FLEET_ORIGIN}/dashboard/data/projects/${encodeURIComponent(id)}` : '';
}
function dashFleetDisputeUrl(disputeId) {
    const id = String(disputeId || '').trim();
    return id ? `${DASH_FLEET_ORIGIN}/work/problems/disputes/${encodeURIComponent(id)}` : '';
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
    _leftPanelHtml() {
        const box = this._panelBoxStyle();
        const label = this._labelStyle();
        const hint = this._hintStyle();
        const input = this._inputStyle();
        const section = this._searchSectionStyle();
        const retrieveInputVal = dashEscHtml((this._state && this._state.retrieveInput) || '');
        const leftTab = this._state ? this._state.leftTab : 'search';
        const filterScopes = dashFilterScopes();
        const sortDefault = dashSortDefault();
        return `
                    <div style="${box} display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                        <nav style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 0 8px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;" aria-label="Search and filters">
                            <div style="display: flex; gap: 0; min-width: 0;">
                                <button type="button" data-wf-dash-left-tab="search" style="${this._leftTabStyle(leftTab === 'search')}">Search</button>
                                <button type="button" data-wf-dash-left-tab="filters" style="${this._leftTabStyle(leftTab === 'filters')}">Filters</button>
                                <button type="button" data-wf-dash-left-tab="ratings" style="${this._leftTabStyle(leftTab === 'ratings')}">Ratings</button>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                                <div id="wf-dash-actions-filters" style="display: ${leftTab === 'filters' ? 'flex' : 'none'}; align-items: center; gap: 8px;">
                                    <button type="button" id="wf-dash-reset-filters" class="${this._dashBtnClass('basic', 'nav')}">Reset</button>
                                    <button type="button" id="wf-dash-apply-filters" class="${this._dashBtnClass('primary', 'nav')}">Apply</button>
                                </div>
                            </div>
                        </nav>

                        <div id="wf-dash-left-panel-search" style="display: ${leftTab === 'search' ? 'flex' : 'none'}; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 14px; gap: 12px;">
                            <div id="wf-dash-section-contributor" style="${section}">
                                <div style="${label} font-weight: 600;">Contributor Search</div>
                                <div id="wf-dash-search-fields" style="display: flex; flex-direction: column; gap: 14px;">
                                    <div>
                                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                            <button type="button" id="wf-dash-toggle-tasks" aria-pressed="true" style="${this._btnToggleStyle(true, 'task_creation')}">Task Creation</button>
                                            <button type="button" id="wf-dash-toggle-qa" aria-pressed="true" style="${this._btnToggleStyle(true, 'qa')}">QA</button>
                                            <button type="button" id="wf-dash-toggle-disputes" aria-pressed="false" style="${this._btnToggleStyle(false, 'dispute')}">Disputes</button>
                                            <button type="button" id="wf-dash-toggle-senior-review" aria-pressed="false" style="${this._btnToggleStyle(false, 'senior_review')}">Sr Review</button>
                                        </div>
                                    </div>
                                    <div>
                                        <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Contributors</label>
                                        <div id="wf-dash-author-box" style="${input} display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 36px; cursor: text;">
                                            <input type="text" id="wf-dash-author-input" autocomplete="off" placeholder="Name, email, or UUID — Enter to resolve" style="flex: 1; min-width: 120px; border: none; outline: none; background: transparent; font-size: 12px; color: var(--foreground, #0f172a); padding: 2px 0;">
                                        </div>
                                        <div id="wf-dash-author-error" style="display: none; font-size: 11px; color: var(--destructive, #dc2626); margin-top: 4px;"></div>
                                        <div id="wf-dash-author-candidates" style="display: none; margin-top: 6px; ${box}"></div>
                                        <div style="${hint} margin-top: 4px;">Empty = all workers.</div>
                                    </div>
                                    <div>
                                        <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Quick range</label>
                                        <select id="wf-dash-quick-range" style="${input} width: 100%; cursor: pointer;">
                                            <option value="">Custom</option>
                                            <option value="all-time">All Time</option>
                                            <option value="today">Today</option>
                                            <option value="yesterday">Yesterday</option>
                                            <option value="3d">Last 3 Days</option>
                                            <option value="7d">Last 7 Days</option>
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
                                            <input type="date" id="wf-dash-after" style="${input} min-width: 0;">
                                        </div>
                                        <div style="flex: 1; min-width: 0;">
                                            <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Before</label>
                                            <input type="date" id="wf-dash-before" style="${input} min-width: 0;">
                                        </div>
                                        <button type="button" id="wf-dash-clear-dates" aria-label="Clear dates" title="Clear dates" style="${this._inputClearBtnStyle()} display: none;">&times;</button>
                                    </div>
                                    <div>
                                        <div style="${label} margin-bottom: 6px; font-weight: 600;">Team, projects, environments</div>
                                        <div style="${hint} margin-bottom: 8px;">${dashEscHtml(dashNoneSelectedHint())}</div>
                                        <div style="display: flex; flex-direction: column; gap: 12px;">
                                            ${this._multiSelectHtml('search-envs', 'Environment', 'All environments', true)}
                                            ${this._multiSelectHtml('search-projects', 'Project', 'All projects', true)}
                                            ${this._multiSelectHtml('search-teams', 'Team', 'All teams', true)}
                                        </div>
                                    </div>
                                </div>
                                ${this._resultsModeToggleHtml('contributor')}
                                <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 4px;">
                                    <button type="button" id="wf-dash-clear-params" class="${this._dashBtnClass('basic', 'nav')}">Reset</button>
                                    <button type="button" id="wf-dash-search" class="${this._dashBtnClass('primary', 'nav')}">Search</button>
                                </div>
                            </div>
                            <div id="wf-dash-section-retrieve" style="${section}">
                                <div style="${label} font-weight: 600;">Retrieve Task</div>
                                <p style="${hint} margin: 0; line-height: 1.45;">Enter a task ID, version ID, or task key. Full Fleet URLs are also accepted.</p>
                                <input type="text" id="wf-dash-retrieve-input" value="${retrieveInputVal}" autocomplete="off" placeholder="Task ID, version ID, task key, or URL" style="${input}">
                                <div id="wf-dash-retrieve-error" style="display: none; font-size: 11px; color: var(--destructive, #dc2626);"></div>
                                ${this._resultsModeToggleHtml('retrieve')}
                                <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 4px;">
                                    <button type="button" id="wf-dash-retrieve-clear" class="${this._dashBtnClass('basic', 'nav')}">Clear</button>
                                    <button type="button" id="wf-dash-retrieve-btn" class="${this._dashBtnClass('primary', 'nav')}">Retrieve</button>
                                </div>
                            </div>
                        </div>

                        <div id="wf-dash-left-panel-filters" style="display: ${leftTab === 'filters' ? 'flex' : 'none'}; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                            <div style="flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 14px; display: flex; flex-direction: column; gap: 14px;">
                                <div id="wf-dash-filter-kind-tab-wrap" style="display: none;">
                                    <div id="wf-dash-filter-kind-tab-buttons" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
                                </div>
                                <div>
                                    <label style="${label} display: block; margin-bottom: 4px; font-weight: 600;">Substring</label>
                                    <p style="${hint} margin: 0 0 8px 0; line-height: 1.45;">${dashEscHtml(dashSubstringFilterHelp())}</p>
                                    <div style="position: relative; min-width: 0;">
                                        <textarea id="wf-dash-prompt" rows="1" placeholder="Filter by substring/RegEx" style="${input} padding-right: 34px; resize: none; overflow: hidden; line-height: 1.4; min-height: 36px;"></textarea>
                                        <button type="button" id="wf-dash-clear-prompt" aria-label="Clear substring" title="Clear substring" style="${this._inputClearBtnStyle()} position: absolute; right: 4px; top: 4px; width: 26px; height: 26px; font-size: 15px; display: none;">&times;</button>
                                    </div>
                                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 8px;">
                                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                            <input type="checkbox" id="wf-dash-case"> Case sensitive
                                        </label>
                                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                            <input type="checkbox" id="wf-dash-fuzzy"> Fuzzy
                                        </label>
                                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                            <input type="checkbox" id="wf-dash-regex"> RegEx (ECMAScript)
                                        </label>
                                    </div>
                                </div>
                                <div id="wf-dash-filter-lists-wrap">
                                    <div style="${label} margin-bottom: 6px; font-weight: 600; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                        <span>Narrow results</span>
                                        <button type="button" id="wf-dash-filter-expand-all" aria-label="Expand all filter menus" style="flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 2px 8px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; background: transparent; color: var(--muted-foreground, #64748b); cursor: pointer;">Expand All</button>
                                    </div>
                                    <div style="${hint} margin-bottom: 8px;">${dashEscHtml(dashNoneSelectedHint())}</div>
                                    <div id="wf-dash-filter-lists" style="display: flex; flex-direction: column; gap: 12px;">
                                        ${dashFilterScopes().map((s) => this._multiSelectHtml(s.scopeKey, this._filterScopeLabel(s.scopeKey), 'Run a search to enable', true)).join('')}
                                    </div>
                                </div>
                                <div id="wf-dash-manual-filter-wrap">
                                    <div style="${label} margin-bottom: 8px; font-weight: 600; color: var(--foreground, #0f172a);">Manual filters</div>
                                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
                                        <span style="${hint} margin: 0;">Stage rows below, then press Apply. Default matches all conditions (AND).</span>
                                        <label style="display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--muted-foreground, #64748b); cursor: pointer; flex-shrink: 0;">
                                            <input type="checkbox" id="wf-dash-manual-andor" style="margin: 0;">
                                            <span>Match any (OR)</span>
                                        </label>
                                    </div>
                                    <div id="wf-dash-manual-rows" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;"></div>
                                    <button type="button" id="wf-dash-manual-add" class="${this._dashBtnClass('basic', 'nav')} wf-dash-btn--full" style="padding: 6px 10px;">+ Add filter</button>
                                </div>
                            </div>
                        </div>

                        <div id="wf-dash-left-panel-ratings" style="display: ${leftTab === 'ratings' ? 'flex' : 'none'}; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                            <div style="flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px;">
                                ${this._ratingsAboutSectionHtml()}
                                <div id="wf-dash-ratings-warnings" style="display: none; flex-direction: column; gap: 6px;"></div>
                                <div id="wf-dash-ratings-cards" style="display: flex; flex-direction: column; gap: 12px;"></div>
                            </div>
                        </div>
                        <div id="wf-dash-left-messages" style="display: none; flex-shrink: 0; padding: 8px 14px; border-top: 1px solid var(--border, #e2e8f0); background: var(--card, #ffffff); font-size: 11px; line-height: 1.4; flex-direction: column; gap: 6px;">
                            <div id="wf-dash-session-refresh-banner" style="display: none;"></div>
                            <div id="wf-dash-bootstrap-error" style="display: none; font-size: 12px; color: var(--destructive, #dc2626);"></div>
                            <div id="wf-dash-universal-hint" style="display: none; font-weight: 400; color: var(--muted-foreground, #64748b);"></div>
                            <div id="wf-dash-range-error" style="display: none; color: var(--destructive, #dc2626);"></div>
                            <div id="wf-dash-search-error" style="display: none; font-size: 12px; color: var(--destructive, #dc2626);"></div>
                            <div id="wf-dash-substring-error" style="display: none; color: var(--destructive, #dc2626);"></div>
                            <div id="wf-dash-apply-hint" style="display: none; color: var(--muted-foreground, #64748b);"></div>
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

    _btnDepthSegmentStyle(active) {
        return this._segmentBtnStyle(active, 'depth');
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
        return `<div style="margin-top: 4px; margin-bottom: 10px;">
            <div style="${label} margin-bottom: 6px; font-weight: 600;">Results mode</div>
            <div style="display: flex; width: 100%; gap: 8px;">
                <button type="button" data-wf-dash-results-mode="clear" aria-pressed="true" style="${this._btnDepthSegmentStyle(true)}">Clear</button>
                <button type="button" data-wf-dash-results-mode="add" aria-pressed="false" style="${this._btnDepthSegmentStyle(false)}">Add</button>
            </div>
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
        modal.querySelectorAll('[data-wf-dash-results-mode]').forEach((btn) => {
            const btnMode = btn.getAttribute('data-wf-dash-results-mode');
            const active = btnMode === this._state.resultsMode;
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.style.cssText = this._btnDepthSegmentStyle(active);
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

    _ratingSearchScoreTypes(committed) {
        const c = committed || {};
        return {
            showTwqs: Boolean(c.includeTaskCreation),
            showQaqs: Boolean(c.includeQa)
        };
    },

    _buildManualFilterRow(opts) {
        const rowsEl = this._q('#wf-dash-manual-rows');
        if (!rowsEl) return;
        const inputStyle = this._inputStyle() + ' padding: 4px 8px; font-size: 11px;';
        const selectStyle = inputStyle;
        const row = document.createElement('div');
        row.innerHTML = this._numericFilterRowHtml({
            fields: dashManualFilterFields(),
            field: opts && opts.field,
            comparator: opts && opts.comparator,
            value: opts && opts.value,
            selectStyle,
            inputStyle,
            removeBtnStyle: ''
        });
        const rowEl = row.firstElementChild;
        if (rowEl) rowsEl.appendChild(rowEl);
        Logger.debug('search-output: manual filter row added');
    },

    _resetManualFilters() {
        const rowsEl = this._q('#wf-dash-manual-rows');
        if (rowsEl) rowsEl.innerHTML = '';
        const andOrToggle = this._q('#wf-dash-manual-andor');
        if (andOrToggle) andOrToggle.checked = false;
        for (const row of dashDefaultManualFilterStageRows()) {
            this._buildManualFilterRow(row);
        }
    },

    _readSearchOutputManualFilters() {
        const rowsEl = this._q('#wf-dash-manual-rows');
        const andOrToggle = this._q('#wf-dash-manual-andor');
        const andOr = andOrToggle && andOrToggle.checked ? 'or' : 'and';
        const rows = [];
        if (!rowsEl) return { rows, andOr };
        const lib = dashLib();
        rowsEl.querySelectorAll('[data-wf-dash-manual-row]').forEach((rowEl) => {
            const fieldEl = rowEl.querySelector('[data-wf-dash-manual-field]');
            const compEl = rowEl.querySelector('[data-wf-dash-manual-comparator]');
            const valueEl = rowEl.querySelector('[data-wf-dash-manual-value]');
            const field = fieldEl ? fieldEl.value : '';
            const comparator = compEl ? compEl.value : '';
            const raw = valueEl ? valueEl.value.trim() : '';
            if (!field || !comparator || raw === '') return;
            const fieldMeta = dashManualFilterFields().find((f) => f.id === field);
            const isDate = fieldMeta && fieldMeta.type === 'date';
            let value;
            if (isDate) {
                const iso = lib.dateLocalToIso(raw, 'after');
                if (!iso) return;
                value = Date.parse(iso);
                if (!Number.isFinite(value)) return;
                rows.push({ field, comparator, value, valueType: 'date', dateLocal: raw });
            } else {
                value = Number(raw);
                if (!Number.isFinite(value)) return;
                rows.push({ field, comparator, value, valueType: 'number' });
            }
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
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = 'all-time';
        this._applyQuickDatePreset('all-time');
        Logger.log('search-output: contributor resolved — quick range switched to All Time');
    },

    _btnToggleStyle(active, colorKind) {
        const base = 'padding: 7px 14px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer;';
        if (active) {
            const cfg = DASH_OUTPUT_KIND_CONFIG[colorKind];
            return base + ' ' + (cfg ? cfg.toggleActive : DASH_TOGGLE_INACTIVE);
        }
        return base + ' ' + DASH_TOGGLE_INACTIVE;
    },

    _leftTabStyle(active) {
        const base = 'padding: 8px 12px; font-size: 12px; font-weight: 600; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; background: transparent;';
        return active
            ? base + ' color: var(--foreground, #0f172a); border-bottom-color: var(--brand, var(--primary, #2563eb));'
            : base + ' color: var(--muted-foreground, #64748b);';
    },

    _searchSectionStyle() {
        return 'background: color-mix(in srgb, var(--muted-foreground, #64748b) 8%, var(--card, #ffffff)); border-radius: 10px; padding: 14px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; box-sizing: border-box;';
    },

    _filterScopeLabel(scopeKey) {
        const labels = {
            'filter-prompt-history': 'Task Lifecycle History',
            'filter-teams': 'Team',
            'filter-projects': 'Project',
            'filter-envs': 'Environment',
            'filter-statuses': 'Current task status',
            'filter-contributors': 'Contributor',
            'filter-prompt-ratings': 'Prompt rating',
            'filter-qa-helpfulness': 'QA Helpfulness',
            'filter-task-issues': 'Task issues',
            'filter-return-types': 'Return types',
            'filter-v1-creation-time': 'v1 Creation Time Minutes',
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
        this._syncOutputToggleUi();
    },

    _setOutputTypesTaskAndQa() {
        this._state.includeTasks = true;
        this._state.includeQa = true;
        this._state.includeDisputes = false;
        this._state.includeSeniorReview = false;
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
        if (tasksBtn) {
            tasksBtn.setAttribute('aria-pressed', this._state.includeTasks ? 'true' : 'false');
            tasksBtn.style.cssText = this._btnToggleStyle(this._state.includeTasks, 'task_creation');
        }
        if (qaBtn) {
            qaBtn.setAttribute('aria-pressed', this._state.includeQa ? 'true' : 'false');
            qaBtn.style.cssText = this._btnToggleStyle(this._state.includeQa, 'qa');
        }
        if (disputesBtn) {
            disputesBtn.setAttribute('aria-pressed', this._state.includeDisputes ? 'true' : 'false');
            disputesBtn.style.cssText = this._btnToggleStyle(this._state.includeDisputes, 'dispute');
        }
        if (seniorReviewBtn) {
            seniorReviewBtn.setAttribute('aria-pressed', this._state.includeSeniorReview ? 'true' : 'false');
            seniorReviewBtn.style.cssText = this._btnToggleStyle(this._state.includeSeniorReview, 'senior_review');
        }
    },

    async _resolveAuthorToken(raw) {
        const query = (raw || '').trim();
        if (!query) return 'empty';
        const tokens = this._state.draftTokens;
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
        if (this._state.draftTokens.some((t) => t.id === person.id)) return;
        this._state.draftTokens.push(person);
        this._hideAuthorCandidates();
        this._setAuthorError('');
        this._renderAuthorTokens();
        this._validateRangeUi();
        this._maybeSwitchToAllTimeForContributor();
        Logger.log('dashboard: author token added (' + this._personDisplayLabel(person) + ')');
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
        if (this._state.loading) {
            Logger.warn('dashboard: worker output deep dive skipped — search in progress');
            return;
        }
        const opts = options || {};
        if (opts.activeTab) this._setActiveTab(opts.activeTab);
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

    _showAuthorCandidates(results) {
        this._state._candidates = results;
        const wrap = this._q('#wf-dash-author-candidates');
        if (!wrap) return;
        wrap.innerHTML = `
            <p style="padding: 6px 10px; font-size: 11px; color: var(--muted-foreground, #64748b); border-bottom: 1px solid var(--border, #e2e8f0);">Multiple matches — pick one:</p>
            <div style="max-height: 180px; overflow-y: auto; padding: 4px;">
                ${results.map((c) => {
                    const label = this._personDisplayLabel(c);
                    const showEmail = c.email && label !== c.email;
                    return `
                    <button type="button" data-wf-dash-candidate="${dashEscHtml(c.id)}" style="display: block; width: 100%; text-align: left; padding: 6px 8px; font-size: 11px; background: transparent; border: none; border-radius: 4px; cursor: pointer; color: var(--foreground, #0f172a);">
                        <span style="font-weight: 600;">${dashEscHtml(label)}</span>
                        ${showEmail ? `<span style="margin-left: 8px; color: var(--muted-foreground, #64748b);">${dashEscHtml(c.email)}</span>` : ''}
                    </button>`;
                }).join('')}
            </div>`;
        wrap.style.display = 'block';
    },

    _hideAuthorCandidates() {
        const wrap = this._q('#wf-dash-author-candidates');
        if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
        this._state._candidates = [];
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

    _renderDashSessionRefreshBannerHtml() {
        return [
            '<div style="',
            'padding: 12px;background: #fee2e2;border: 2px solid #dc2626;border-radius: 8px;">',
            '<div style="display: flex; align-items: flex-start; gap: 10px;">',
            '<span style="color: #dc2626; font-size: 16px; line-height: 1.2;" aria-hidden="true">⚠</span>',
            '<div style="flex: 1; min-width: 0;">',
            '<div style="font-size: 13px; font-weight: 600; color: #991b1b; margin-bottom: 6px;">Fleet session token not yet captured</div>',
            '<p style="font-size: 12px; color: #991b1b; margin: 0; line-height: 1.45;">',
            'Navigate to a Fleet data page (e.g. Tasks or QA), then close and reopen the dashboard or retry your search.',
            '</p>',
            '</div>',
            '</div>',
            '<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #fecaca; text-align: center;">',
            '<a href="', dashEscHtml(DASH_FLEET_ORIGIN), '/" target="_blank" rel="noopener noreferrer" id="wf-dash-session-reload" style="',
            'display: inline-block;padding: 8px 14px;font-size: 12px;font-weight: 600;',
            'color: #991b1b;background: #fef2f2;border: 1px solid #dc2626;border-radius: 6px;',
            'cursor: pointer;text-decoration: none;">Reload Fleet</a>',
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
        this._state.filterListOptions = {
            teams: [], projects: [], envs: [],
            statuses: [], contributors: [], promptRatings: [], taskIssues: [], returnTypes: [],
            promptHistory: [], qaHelpfulness: [], v1CreationTimeMinutes: [], qaTimeMinutes: [], disputeResolutionTimeMinutes: []
        };
        this._resetManualFilters();
        for (const { scopeKey } of dashFilterScopes()) {
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
            currentUserId: this._dashGetCurrentUserId()
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
            currentUserId: filterOptions.currentUserId
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
        this._updateApplyFiltersUi();
        this._repositionOpenFlyouts();
        Logger.debug('dashboard: filter lists rendered');
    },

    _setLeftTab(tab) {
        this._state.leftTab = tab;
        this._closeAllMsDropdowns();
        this._syncLeftTabUi();
        if (tab === 'ratings') this._renderRatingsPanel();
    },

    _syncLeftTabUi() {
        const tab = this._state.leftTab;
        const searchPanel = this._q('#wf-dash-left-panel-search');
        const filtersPanel = this._q('#wf-dash-left-panel-filters');
        const ratingsPanel = this._q('#wf-dash-left-panel-ratings');
        if (searchPanel) searchPanel.style.display = tab === 'search' ? 'flex' : 'none';
        if (filtersPanel) filtersPanel.style.display = tab === 'filters' ? 'flex' : 'none';
        if (ratingsPanel) ratingsPanel.style.display = tab === 'ratings' ? 'flex' : 'none';
        const filterActions = this._q('#wf-dash-actions-filters');
        if (filterActions) filterActions.style.display = tab === 'filters' ? 'flex' : 'none';
        this._modal.querySelectorAll('[data-wf-dash-left-tab]').forEach((btn) => {
            const active = btn.getAttribute('data-wf-dash-left-tab') === tab;
            btn.style.cssText = this._leftTabStyle(active);
        });
        this._syncLeftMessagesBar();
    },

    _isPrefetchInProgress(kind) {
        this._ensurePrefetchState();
        const slot = this._getPrefetchSlot(kind);
        if (!slot) return false;
        if (slot.status === 'loading') return true;
        return Boolean(slot.promise) && slot.status !== 'done' && slot.status !== 'error';
    },

    _getRatingsPrefetchWarnings() {
        const labels = {
            openDisputes: 'Open disputes',
            resolvedDisputes: 'Resolved disputes',
            pendingFlags: 'Pending sr-review flags',
            resolvedFlags: 'Resolved sr-review flags'
        };
        const loading = DASH_PREFETCH_KINDS.filter((kind) => this._isPrefetchInProgress(kind));
        if (loading.length === 0) return [];
        const names = loading.map((k) => labels[k] || k).join(', ');
        return ['Dispute/flag prefetch still loading (' + names + ') — scores may update when complete'];
    },

    _getRatingsHydrationWarnings() {
        const items = this._state.cachedItems || [];
        if (items.length === 0) return [];
        const unhydratedCount = items.filter((item) => item && item.hydrated !== true).length;
        const warnings = [];
        if (unhydratedCount > 0) {
            warnings.push(unhydratedCount + ' of ' + items.length + ' result cards not fully hydrated — ratings use hydrated cards only');
        }
        if (this._state.hydrateFetchActive) {
            warnings.push('Per-card deep hydrate in progress — ratings may update when complete');
        }
        return warnings;
    },

    _buildRatingWorkerProfiles() {
        const committed = this._state.committed || {};
        const ids = committed.authorIds || [];
        const labels = committed.authorLabels || [];
        const tokens = this._state.draftTokens || [];
        const map = {};
        ids.forEach((id, i) => {
            const tok = tokens.find((t) => t.id === id);
            map[id] = {
                name: (tok && (tok.name || tok.label)) || labels[i] || id,
                email: (tok && tok.email) || ''
            };
        });
        return map;
    },

    _ratingsAboutAxisTableHtml(title, rows) {
        const th = 'padding: 4px 6px; text-align: left; font-weight: 600; border-bottom: 1px solid var(--border, #e2e8f0);';
        const td = 'padding: 4px 6px; vertical-align: top; border-bottom: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 60%, transparent);';
        let body = '';
        for (const row of rows) {
            body += '<tr>'
                + '<td style="' + td + '">' + dashEscHtml(row.label) + '</td>'
                + '<td style="' + td + ' white-space: nowrap;">' + dashEscHtml(row.weight) + '</td>'
                + '<td style="' + td + '">' + dashEscHtml(row.measures) + '</td>'
                + '</tr>';
        }
        return '<div style="margin-top: 10px;">'
            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">' + dashEscHtml(title) + '</div>'
            + '<table style="width: 100%; border-collapse: collapse; font-size: 10px; line-height: 1.35;">'
            + '<thead><tr>'
            + '<th style="' + th + '">Axis</th>'
            + '<th style="' + th + '">Weight</th>'
            + '<th style="' + th + '">Measures</th>'
            + '</tr></thead>'
            + '<tbody>' + body + '</tbody>'
            + '</table>'
            + '</div>';
    },

    _ratingsAboutSectionHtml() {
        const box = this._panelBoxStyle();
        const muted = 'color: var(--muted-foreground, #64748b);';
        const twqsRows = [
            { label: 'Task Outcomes', weight: '40%', measures: 'How far authored tasks progress in the lifecycle (production is ideal).' },
            { label: 'Revision Efficiency', weight: '25%', measures: 'How few revision rounds their tasks needed before landing.' },
            { label: 'Consistency', weight: '15%', measures: 'How steadily they worked, week to week, across the span.' },
            { label: 'Dispute Outcomes', weight: '10%', measures: 'Share of their resolved disputes decided in their favor.' },
            { label: 'Sr Review Integrity', weight: '10%', measures: 'Absence of confirmed senior-review flags on their tasks.' }
        ];
        const qaqsRows = [
            { label: 'Comprehensiveness', weight: '50%', measures: 'When they return a task, it gets fixed and accepted on the next round rather than being returned again.' },
            { label: 'Dispute Defense', weight: '20%', measures: 'Share of resolved disputes against their calls that were upheld.' },
            { label: 'Sr Review Integrity', weight: '20%', measures: 'Absence of confirmed poor-feedback flags against them, plus accuracy of flags they raised.' },
            { label: 'Consistency', weight: '10%', measures: 'How steadily they reviewed, week to week, across the span.' }
        ];
        return '<details id="wf-dash-ratings-about" style="' + box + ' padding: 10px 12px; flex-shrink: 0;">'
            + '<summary style="font-size: 11px; line-height: 1.45; cursor: pointer; list-style: none; user-select: none; ' + muted + '">'
            + '<strong style="color: var(--foreground, #0f172a);">About these ratings</strong>'
            + ' — how the scores are built and what they include.'
            + '</summary>'
            + '<div style="margin-top: 10px; font-size: 11px; line-height: 1.45; color: var(--foreground, #0f172a);">'
            + '<p style="margin: 0 0 8px;">Two independent scores per contributor, each on a <strong>0–100</strong> scale:</p>'
            + '<ul style="margin: 0 0 10px 18px; padding: 0;">'
            + '<li><strong>Task Writer Quality Score</strong> — quality of the work they <strong>authored</strong>.</li>'
            + '<li><strong>QA Quality Score</strong> — quality of the reviews they <strong>performed</strong>.</li>'
            + '</ul>'
            + '<p style="margin: 0 0 10px;">A person who does both jobs gets both scores. They are not blended into a single number.</p>'
            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">How to read a score</div>'
            + '<ul style="margin: 0 0 10px 18px; padding: 0;">'
            + '<li><strong>0–100, higher is better.</strong> Scores measure distance from an ideal benchmark, <strong>not</strong> a ranking against other people. ~80 means near-ideal, not &ldquo;above average.&rdquo;</li>'
            + '<li>Each score rolls up several <strong>weighted axes</strong>, shown highest-weight first. The bar next to each axis is its own sub-score (0–100%).</li>'
            + '<li>An axis with no qualifying activity is <strong>omitted</strong>, and its weight is spread across the others.</li>'
            + '<li>Every score carries a <strong>confidence</strong> badge based on how much recent activity it is built from.</li>'
            + '</ul>'
            + '<table style="width: 100%; border-collapse: collapse; font-size: 10px; line-height: 1.35; margin-bottom: 10px;">'
            + '<thead><tr>'
            + '<th style="padding: 4px 6px; text-align: left; font-weight: 600; border-bottom: 1px solid var(--border, #e2e8f0);">Confidence</th>'
            + '<th style="padding: 4px 6px; text-align: left; font-weight: 600; border-bottom: 1px solid var(--border, #e2e8f0);">Activity in the last 90 days</th>'
            + '</tr></thead>'
            + '<tbody>'
            + '<tr><td style="padding: 4px 6px; border-bottom: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 60%, transparent);">Provisional</td><td style="padding: 4px 6px; border-bottom: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 60%, transparent);">fewer than 10</td></tr>'
            + '<tr><td style="padding: 4px 6px; border-bottom: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 60%, transparent);">Standard</td><td style="padding: 4px 6px; border-bottom: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 60%, transparent);">10–49</td></tr>'
            + '<tr><td style="padding: 4px 6px;">High confidence</td><td style="padding: 4px 6px;">50 or more</td></tr>'
            + '</tbody></table>'
            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">What counts toward a score</div>'
            + '<ul style="margin: 0 0 10px 18px; padding: 0;">'
            + '<li>Scores use the <strong>committed search window</strong> and <strong>hydrated result cards only</strong> — sidebar filters do <strong>not</strong> change ratings.</li>'
            + '<li>With no After/Before dates, all history counts, weighted toward recent activity. With a date range set, everything inside the window counts equally and nothing outside it does.</li>'
            + '<li>Senior-review flags and disputes only move a score once they are <strong>resolved</strong>, and only in the direction the resolution supports. Pending or dismissed items stay neutral.</li>'
            + '</ul>'
            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">The axes</div>'
            + this._ratingsAboutAxisTableHtml('Task Writer Quality Score', twqsRows)
            + this._ratingsAboutAxisTableHtml('QA Quality Score', qaqsRows)
            + '</div>'
            + '</details>';
    },

    _ratingScoreBasisLine(block, basisKind) {
        const display = block && block.display;
        if (!display) return '';
        let count = null;
        let singular = '';
        let plural = '';
        if (basisKind === 'tasks') {
            count = display.submissionCount;
            singular = 'task';
            plural = 'tasks';
        } else if (basisKind === 'feedbacks') {
            count = display.feedbackRowCount;
            singular = 'feedback';
            plural = 'feedbacks';
        }
        if (count == null || !Number.isFinite(count)) return '';
        const label = count === 1 ? singular : plural;
        return 'Based on ' + count + ' ' + label;
    },

    _ratingScoreBlockHtml(title, block, basisKind) {
        if (!block || block.score == null) {
            return '';
        }
        const conf = block.confidence || {};
        const confStyle = conf.tier === 'provisional'
            ? 'border: 1px dashed var(--muted-foreground, #64748b);'
            : (conf.tier === 'high' ? 'font-weight: 700;' : '');
        const sortedAxes = [...(block.axes || [])].sort((a, b) => {
            const wDiff = (b.baseWeight || 0) - (a.baseWeight || 0);
            if (wDiff !== 0) return wDiff;
            return String(a.label || '').localeCompare(String(b.label || ''));
        });
        let axesHtml = '';
        const showAxisWeights = Boolean(Context.isDevBranch);
        for (const p of sortedAxes) {
            const omitted = p.defined === false || p.score == null;
            const pct = omitted ? 0 : Math.round((p.score || 0) * 100);
            const wt = p.effectiveWeight != null ? Math.round(p.effectiveWeight * 1000) / 10 : null;
            const bar = omitted
                ? '<span style="font-size: 10px; color: var(--muted-foreground, #64748b);">omitted</span>'
                : ('<div style="flex: 1; height: 6px; background: color-mix(in srgb, var(--muted-foreground, #64748b) 20%, transparent); border-radius: 3px; overflow: hidden;"><div style="width: ' + pct + '%; height: 100%; background: var(--brand, var(--primary, #2563eb));"></div></div>'
                + '<span style="font-size: 10px; min-width: 36px; text-align: right;">' + dashEscHtml(String(pct)) + '%</span>'
                + (showAxisWeights && wt != null ? '<span style="font-size: 10px; min-width: 32px; text-align: right; color: var(--muted-foreground, #64748b);">' + wt + '%</span>' : ''));
            axesHtml += '<div style="display: flex; align-items: center; gap: 8px; font-size: 11px; margin-top: 4px;">'
                + '<span style="flex: 0 0 42%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="' + dashEscHtml(p.label) + '">' + dashEscHtml(p.label) + '</span>'
                + bar
                + '</div>';
        }
        const scoreDisplay = Math.round(block.score);
        const basisLine = this._ratingScoreBasisLine(block, basisKind);
        return '<div style="margin-top: 10px;">'
            + '<div style="font-size: 12px; font-weight: 600; margin-bottom: 4px;">' + dashEscHtml(title) + '</div>'
            + '<div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">'
            + '<div style="font-size: 20px; font-weight: 700; line-height: 1.2;">' + dashEscHtml(String(scoreDisplay)) + ' <span style="font-size: 12px; font-weight: 500; color: var(--muted-foreground, #64748b);">/ 100</span></div>'
            + '<div style="font-size: 10px; flex-shrink: 0; padding: 2px 6px; border-radius: 4px; ' + confStyle + '">' + dashEscHtml(conf.label || '') + '</div>'
            + '</div>'
            + axesHtml
            + (basisLine
                ? ('<div style="font-size: 10px; color: var(--muted-foreground, #64748b); margin-top: 6px;">' + dashEscHtml(basisLine) + '</div>')
                : '')
            + '</div>';
    },

    _ratingWorkerCardHtml(worker, scoreTypes) {
        const types = scoreTypes || this._ratingSearchScoreTypes(this._state.committed);
        const name = worker.name || worker.workerId;
        const twqsHtml = types.showTwqs
            ? this._ratingScoreBlockHtml('Task Writer Quality Score', worker.twqs, 'tasks')
            : '';
        const qaqsHtml = types.showQaqs
            ? this._ratingScoreBlockHtml('QA Quality Score', worker.qaqs, 'feedbacks')
            : '';
        const diagnosticsBtnHtml = Context.isDevBranch
            ? ('<button type="button" class="' + this._dashBtnClass('basic', 'nav') + '" data-wf-dash-rating-export="diagnostics" data-wf-dash-rating-worker="' + dashEscHtml(worker.workerId) + '">Export Diagnostics</button>')
            : '';
        const box = this._panelBoxStyle();
        return '<div class="wf-dash-rating-card" data-wf-dash-rating-worker="' + dashEscHtml(worker.workerId) + '" style="' + box + ' padding: 12px;">'
            + '<div style="font-size: 13px; font-weight: 600; margin-bottom: 6px;">' + dashEscHtml(name) + '</div>'
            + (worker.email ? '<div style="font-size: 10px; color: var(--muted-foreground, #64748b); margin-bottom: 6px;">' + dashEscHtml(worker.email) + '</div>' : '')
            + twqsHtml
            + qaqsHtml
            + '<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">'
            + '<button type="button" class="' + this._dashBtnClass('basic', 'nav') + '" data-wf-dash-rating-export="json" data-wf-dash-rating-worker="' + dashEscHtml(worker.workerId) + '">Export JSON</button>'
            + '<button type="button" class="' + this._dashBtnClass('basic', 'nav') + '" data-wf-dash-rating-export="md" data-wf-dash-rating-worker="' + dashEscHtml(worker.workerId) + '">Export MD</button>'
            + diagnosticsBtnHtml
            + '</div>'
            + '</div>';
    },

    _renderRatingsPanel() {
        const cardsEl = this._q('#wf-dash-ratings-cards');
        const warnEl = this._q('#wf-dash-ratings-warnings');
        if (!cardsEl) return;

        const committed = this._state.committed || {};
        const authorCount = committed.authorCount != null ? committed.authorCount : (committed.authorIds || []).length;
        const warnings = [...this._getRatingsPrefetchWarnings(), ...this._getRatingsHydrationWarnings()];

        if (warnEl) {
            if (warnings.length) {
                warnEl.style.display = 'flex';
                warnEl.innerHTML = warnings.map((w) =>
                    '<div style="font-size: 11px; padding: 8px 10px; border-radius: 6px; background: color-mix(in srgb, #f59e0b 12%, var(--card, #fff)); color: var(--foreground, #0f172a); border: 1px solid color-mix(in srgb, #f59e0b 35%, var(--border, #e2e8f0));">' + dashEscHtml(w) + '</div>'
                ).join('');
            } else {
                warnEl.style.display = 'none';
                warnEl.innerHTML = '';
            }
        }

        if (!this._state.hasSearched || !this._state.cachedItems) {
            cardsEl.innerHTML = '<p style="font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;">Run a search to load results, then open Ratings.</p>';
            this._state.ratingsReport = null;
            return;
        }

        if (authorCount === 0) {
            cardsEl.innerHTML = '<p style="font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;">Search by specific contributors to generate ratings.</p>';
            this._state.ratingsReport = null;
            return;
        }

        const engine = Context.ratingEngine;
        if (!engine || typeof engine.compute !== 'function') {
            cardsEl.innerHTML = '<p style="font-size: 12px; color: var(--destructive, #dc2626); margin: 0;">Rating engine not loaded. Reload the page and try again.</p>';
            this._state.ratingsReport = null;
            return;
        }

        const report = engine.compute({
            cachedItems: this._state.cachedItems,
            committed,
            workerProfiles: this._buildRatingWorkerProfiles()
        });
        this._state.ratingsReport = report;

        const scoreTypes = this._ratingSearchScoreTypes(committed);

        if (!report.workers || report.workers.length === 0) {
            cardsEl.innerHTML = '<p style="font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;">No contributor ratings available.</p>';
            return;
        }

        cardsEl.innerHTML = report.workers.map((w) => this._ratingWorkerCardHtml(w, scoreTypes)).join('');
        Logger.log('search-output: ratings rendered — ' + report.workers.length + ' worker card(s)');
    },

    _downloadTextFile(filename, content, mime) {
        try {
            const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            Logger.error('search-output: rating export download failed', e);
        }
    },

    _handleRatingExport(workerId, format) {
        const engine = Context.ratingEngine;
        const report = this._state.ratingsReport;
        if (!engine || !report || !report.workers) {
            Logger.warn('search-output: rating export skipped — no report');
            return;
        }
        const worker = report.workers.find((w) => w.workerId === workerId);
        if (!worker) {
            Logger.warn('search-output: rating export skipped — worker not found ' + workerId);
            return;
        }
        const exportDate = new Date().toISOString().slice(0, 10);
        const scoreTypes = this._ratingSearchScoreTypes(this._state.committed || {});
        const workerExport = {
            ...worker,
            twqs: scoreTypes.showTwqs ? worker.twqs : null,
            qaqs: scoreTypes.showQaqs ? worker.qaqs : null,
            computedAt: report.computedAt,
            engineVersion: report.version,
            exportDate
        };
        let scoreType = 'combined';
        if (scoreTypes.showTwqs && scoreTypes.showQaqs) {
            scoreType = (worker.twqs && worker.qaqs) ? 'combined' : (worker.twqs ? 'twqs' : 'qaqs');
        } else if (scoreTypes.showTwqs) {
            scoreType = 'twqs';
        } else if (scoreTypes.showQaqs) {
            scoreType = 'qaqs';
        }

        if (format === 'diagnostics') {
            if (typeof engine.buildDiagnosticsReport !== 'function') {
                Logger.warn('search-output: diagnostics export skipped — engine method missing');
                return;
            }
            const warnings = [...this._getRatingsPrefetchWarnings(), ...this._getRatingsHydrationWarnings()];
            const cachedItems = this._state.cachedItems || [];
            const diagnostics = engine.buildDiagnosticsReport(workerExport, {
                cachedItems,
                committed: this._state.committed || {},
                warnings,
                unhydratedCount: cachedItems.filter((item) => item && item.hydrated !== true).length
            });
            const json = engine.serializeDiagnosticsJson(diagnostics);
            const filename = engine.buildDiagnosticsFilename(workerExport);
            this._downloadTextFile(filename, json, 'application/json;charset=utf-8');
            Logger.log('search-output: rating diagnostics exported — ' + filename);
            return;
        }

        if (format === 'json') {
            const json = engine.serializeJson(workerExport);
            const filename = engine.buildExportFilename(worker, scoreType, 'json');
            this._downloadTextFile(filename, json, 'application/json;charset=utf-8');
            Logger.log('search-output: rating JSON exported — ' + filename);
            return;
        }
        const md = engine.serializeMarkdown(workerExport);
        const mdName = engine.buildExportFilename(worker, scoreType, 'md');
        this._downloadTextFile(mdName, md, 'text/markdown;charset=utf-8');
        Logger.log('search-output: rating MD exported — ' + mdName);
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
            authorCount: this._state.draftTokens.length,
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
                && !this._state.includeDisputes && !this._state.includeSeniorReview;
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
        const keys = [
            'teamIds', 'projectIds', 'envKeys', 'statuses', 'contributorIds',
            'promptRatings', 'taskIssues', 'returnTypes', 'promptHistory', 'qaHelpfulness',
            'v1CreationTimeMinutes', 'qaTimeMinutes', 'disputeResolutionTimeMinutes'
        ];
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
                const url = new URL(text, DASH_FLEET_ORIGIN);
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

    _setRetrieveError(text) {
        const el = this._q('#wf-dash-retrieve-error');
        if (el) {
            el.textContent = text ? 'Error: ' + text : '';
            el.style.display = text ? 'block' : 'none';
        }
        this._syncLeftMessagesBar();
    },

    _setRetrieveButtonLoading(loading) {
        const btn = this._q('#wf-dash-retrieve-btn');
        if (btn) {
            btn.textContent = loading ? 'Loading…' : 'Retrieve';
            btn.disabled = loading;
        }
        const clearBtn = this._q('#wf-dash-retrieve-clear');
        if (clearBtn) clearBtn.disabled = loading;
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

    async _submitRetrieveTask() {
        const inputEl = this._q('#wf-dash-retrieve-input');
        const raw = inputEl ? inputEl.value : (this._state.retrieveInput || '');
        this._state.retrieveInput = String(raw || '').trim();
        const parsed = this._parseRetrieveInput(raw);
        if (!parsed) {
            this._logDashApiSkip('retrieve-task', 'invalid input');
            this._setRetrieveError('Enter a valid task ID, version ID, task key, or Fleet URL.');
            return;
        }
        this._setRetrieveError('');
        this._setSearchError('');

        const retrieveCommitted = {
            retrieveMode: true,
            retrieveLabel: parsed.value,
            includeTaskCreation: true,
            includeQa: false,
            includeDisputes: false,
            authorCount: 0,
            authorLabels: [],
            searchKinds: ['task_creation']
        };
        this._beginResultsLoad();
        this._resetSearchLoadLog();
        this._state.searchLoadPhase = 'Retrieving task…';
        this._state.committed = retrieveCommitted;
        this._setRetrieveButtonLoading(true);
        this._setSearchButtonLoading(false);
        this._updateResultsKindTabsUi();
        this._syncResultsToolbarDerivedUi();
        this._updateResultsStatus();
        this._renderResults();

        this._state.searchFetchActive = true;
        try {
            this._logDashApiClick('retrieve-task', parsed.kind + ' ' + parsed.value);
            const { row, versionOverride } = await this._fetchTaskRowForRetrieve(parsed);
            if (!row) {
                this._setRetrieveError('No task found for that identifier.');
                this._restoreResultsLoadSnapshotOnError();
                return;
            }
            const item = await this._buildRetrieveTaskItem(row, versionOverride);
            this._state.cachedItems = [item];
            this._setSearchLoadPhase('Hydrating task…', 1);
            await this._hydrateAllSearchResults([item], { skipFeedbackFetch: false });
            this._setSearchLoadPhase('Applying filters…', 1);
            Logger.log('search-output: retrieve task loaded — ' + row.id + ' (fully hydrated)');
            const additive = this._isAdditiveResultsMode()
                && Array.isArray(this._state.resultsLoadSnapshot)
                && this._state.resultsLoadSnapshot.length > 0;
            this._finalizeResultsLoad([item], {
                committed: additive ? null : retrieveCommitted
            });
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
            if (!includeTasks && !includeQa && !includeDisputes && !includeSeniorReview) {
                this._logDashApiSkip('search', 'no contributor areas enabled');
                this._setSearchError('Enable at least one contributor search area: Task Creation, QA, Disputes, or Sr Review.');
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

            const authorIds = this._state.draftTokens.map((t) => t.id);
            const authorLabels = this._state.draftTokens.map((t) => this._personDisplayLabel(t));
            const searchCommitted = {
                authorIds,
                authorCount: authorIds.length,
                authorLabels,
                includeTaskCreation: includeTasks,
                includeQa,
                includeDisputes,
                includeSeniorReview,
                afterLocal: after,
                beforeLocal: before,
                searchKinds: [
                    includeTasks ? 'task_creation' : null,
                    includeQa ? 'qa' : null,
                    includeDisputes ? 'dispute' : null,
                    includeSeniorReview ? 'senior_review' : null
                ].filter(Boolean)
            };
            this._state.committed = searchCommitted;
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
                    + ' · types: ' + [includeTasks ? 'tasks' : null, includeQa ? 'QA' : null, includeDisputes ? 'disputes' : null, includeSeniorReview ? 'Sr Review' : null].filter(Boolean).join('+')
                    + (after ? ' · after ' + after : '') + (before ? ' · before ' + before : ''));
                const searchResult = await this._fetchWorkerOutputSearch({
                    authorIds,
                    includeTaskCreation: includeTasks,
                    includeQa,
                    includeDisputes,
                    includeSeniorReview,
                    afterIso: rangeCheck.afterIso,
                    beforeIso: rangeCheck.beforeIso,
                    scope
                });
                const items = searchResult.items;
                this._state.cachedItems = items;
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
        ['#wf-dash-after', '#wf-dash-before'].forEach((sel) => { const el = this._q(sel); if (el) el.value = ''; });
        const quickRange = this._q('#wf-dash-quick-range');
        if (quickRange) quickRange.value = '';
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
        const dims = [
            ['teamIds', bounds.teamIds],
            ['projectIds', bounds.projectIds],
            ['envKeys', bounds.envKeys],
            ['statuses', bounds.statuses],
            ['contributorIds', bounds.contributorIds],
            ['promptRatings', bounds.promptRatings],
            ['taskIssues', bounds.taskIssues],
            ['returnTypes', bounds.returnTypes],
            ['promptHistory', bounds.promptHistory],
            ['qaHelpfulness', bounds.qaHelpfulness],
            ['v1CreationTimeMinutes', bounds.v1CreationTimeMinutes],
            ['qaTimeMinutes', bounds.qaTimeMinutes],
            ['disputeResolutionTimeMinutes', bounds.disputeResolutionTimeMinutes]
        ];
        for (const [key, boundIds] of dims) {
            if (!this._isDimensionUnrestricted(applied[key] || [], boundIds || [])) return true;
        }
        return (applied.regex && lib.isRegexQueryActive(applied.promptText))
            || (!applied.regex && !lib.isQueryEmpty(applied.promptText, applied.caseSensitive))
            || ((applied.manualFilters || []).length > 0);
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
        if (committed.retrieveMode) return 'task: ' + (committed.retrieveLabel || '');
        const parts = [];
        if (committed.authorLabels && committed.authorLabels.length > 0) {
            parts.push('contributors: ' + committed.authorLabels.join(', '));
        } else {
            parts.push('all contributors');
        }
        const types = [];
        if (committed.includeTaskCreation) types.push('tasks');
        if (committed.includeQa) types.push('QA');
        if (committed.includeDisputes) types.push('disputes');
        if (committed.includeSeniorReview) types.push('Sr Review');
        if (types.length > 0) parts.push('types: ' + types.join('+'));
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
    },
};


const plugin = {
    id: 'search-output-left-pane',
    name: 'Search Output left pane',
    description: 'Worker Output Search tab — left pane',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        if (state && state.registered) {
            Logger.debug('search-output-left-pane: already registered — skipping re-init');
            return;
        }
        Context.searchOutputLeftPaneMethods = searchOutputLeftPaneMethods;
        if (state) state.registered = true;
        Logger.log('search-output-left-pane: registered (Context.searchOutputLeftPaneMethods)');
    }
};
