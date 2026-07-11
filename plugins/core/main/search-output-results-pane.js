// search-output-results-pane.js — Worker Output Search results pane

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
const DASH_TASKS_PAGE_SIZE = 250;
const DASH_QA_PAGE_SIZE = 250;
const DASH_DISPUTES_PAGE_SIZE = 250;
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
    },
    sessions: {
        label: 'Sessions',
        tabBg: '#0891b2',
        toggleActive: 'border: 2px solid #0891b2; color: #0e7490; background: transparent;',
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
function dashFleetQaSessionUrl(sessionId) {
    const id = String(sessionId || '').trim();
    return id ? `${DASH_FLEET_ORIGIN}/work/problems/qa-session/${encodeURIComponent(id)}` : '';
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



const searchOutputResultsPaneMethods = {
    _resultsPanelHtml() {
        const box = this._panelBoxStyle();
        const label = this._labelStyle();
        const input = this._inputStyle();
        const sortDefault = dashSortDefault();
        return `
                <div style="flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; ${box}">
                    <div style="${this._resultsHeaderBarStyle()}">
                        <div style="${this._resultsHeaderRowStyle()}">
                            <div style="display: flex; align-items: baseline; gap: 10px; min-width: 0; flex: 1 1 200px; flex-wrap: wrap;">
                                <span style="font-size: 13px; font-weight: 600; color: var(--foreground, #0f172a); flex-shrink: 0;">Results</span>
                                <span id="wf-dash-results-status" style="${label} margin: 0; min-width: 0;">Set search parameters on the left, then press Search.</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 0; flex-wrap: wrap; justify-content: flex-end;">
                                <div id="wf-dash-results-hydrate-banner" style="display: none; flex: 0 1 auto;"></div>
                                <button type="button" id="wf-dash-bulk-hydrate" class="${this._dashBtnClass('secondary', 'nav')}" style="display: none;">Hydrate results</button>
                                <button type="button" id="wf-dash-diff-included" title="Add included results to Diff Viewer in view order (up to stash limit)" class="${this._dashBtnClass('basic', 'nav')}" style="display: none;">Diff Included Results</button>
                                <button type="button" id="wf-dash-drop-included" title="May be helpful for performance" class="${this._dashBtnClass('basic', 'nav')}" style="display: none;">Drop Included Results</button>
                                <button type="button" id="wf-dash-drop-excluded" title="May be helpful for performance" class="${this._dashBtnClass('basic', 'nav')}" style="display: none;">Drop Excluded Results</button>
                                <button type="button" id="wf-dash-export-tasks-json" title="Export filtered task cards as JSON (dev builds only)" class="${this._dashBtnClass('basic', 'nav')}" style="display: none;">Export JSON</button>
                                <button type="button" id="wf-dash-clear-results" class="${this._dashBtnClass('basic', 'nav')}">Clear Results</button>
                                <div data-wf-dash-results-header-actions style="display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;"></div>
                            </div>
                        </div>
                        <div id="wf-dash-results-toolbar-row2" style="${this._resultsToolbarRow2Style()}">
                            <div id="wf-dash-results-pager-slot-kind" style="flex: 1 1 100%; min-width: 0; display: flex; justify-content: flex-end; flex-wrap: wrap;">
                                <div id="wf-dash-results-pager" style="display: none; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; max-width: 100%;">
                                    <label id="wf-dash-version-mode-wrap" style="${label} display: none; align-items: center; gap: 6px; margin: 0; flex: 0 1 auto; flex-wrap: wrap;">
                                        <span>Version</span>
                                        <select id="wf-dash-version-mode" style="${input} width: auto; min-width: 8.5rem; max-width: 100%; padding: 4px 8px; font-size: 11px; cursor: pointer;">
                                            <option value="contributor_match">Contributor match</option>
                                            <option value="all_v1">All v1s</option>
                                            <option value="all_final">All final versions</option>
                                        </select>
                                    </label>
                                    <label style="${label} display: inline-flex; align-items: center; gap: 6px; margin: 0; flex: 0 1 auto; flex-wrap: wrap;">
                                        <span>Sort</span>
                                        <select id="wf-dash-sort" style="${input} width: auto; min-width: 13rem; max-width: 100%; padding: 4px 8px; font-size: 11px; cursor: pointer;">
                                            ${this._dashSortSelectOptionsHtml(dashSortDefault())}
                                        </select>
                                    </label>
                                    <label style="${label} display: inline-flex; align-items: center; gap: 6px; margin: 0; flex: 0 1 auto; flex-wrap: wrap;">
                                        <span>Show</span>
                                        <select id="wf-dash-results-page-size" style="${input} width: auto; max-width: 100%; padding: 4px 8px; font-size: 11px; cursor: pointer;">
                                            <option value="10">10</option>
                                            <option value="25">25</option>
                                            <option value="50">50</option>
                                            <option value="100">100</option>
                                            <option value="all">All</option>
                                        </select>
                                    </label>
                                    <span id="wf-dash-results-range-count" style="${label} white-space: nowrap;"></span>
                                    <button type="button" id="wf-dash-results-prev" aria-label="Previous page" title="Previous page" class="${this._dashBtnClass('basic', 'icon')}">${this._pagerChevronSvg('prev')}</button>
                                    <button type="button" id="wf-dash-results-next" aria-label="Next page" title="Next page" class="${this._dashBtnClass('basic', 'icon')}">${this._pagerChevronSvg('next')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="wf-dash-results" style="flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 24px;"></div>
                </div>`;
    },

    _ensureResultsToggleButton() {
        const root = this._q('[data-wf-dash-split-root][data-wf-dash-split-scope="dashboard"]');
        let btn = root ? root.querySelector('[data-wf-dash-results-toggle]') : null;
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-wf-dash-results-toggle', 'true');
            btn.className = this._dashBtnClass('basic', 'nav');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleResultsPanelHidden();
            });
        }
        return btn;
    },

    _syncResultsPanelCollapseUi() {
        const root = this._q('[data-wf-dash-split-root][data-wf-dash-split-scope="dashboard"]');
        if (!root) return;
        const dashApi = Context.dashboard;
        const hidden = dashApi && typeof dashApi.readResultsPanelHiddenPref === 'function'
            ? dashApi.readResultsPanelHiddenPref()
            : false;
        const btn = this._ensureResultsToggleButton();
        const headerActions = root.querySelector('[data-wf-dash-results-header-actions]');
        const sliver = root.querySelector('[data-wf-dash-results-collapse-sliver]');
        btn.textContent = hidden ? 'Unhide' : 'Hide';
        btn.title = hidden ? 'Show the results panel' : 'Hide the results panel';
        if (hidden) {
            if (sliver && btn.parentElement !== sliver) sliver.appendChild(btn);
        } else if (headerActions && btn.parentElement !== headerActions) {
            headerActions.appendChild(btn);
        }
    },

    _toggleResultsPanelHidden() {
        const dashApi = Context.dashboard;
        if (!dashApi || typeof dashApi.readResultsPanelHiddenPref !== 'function') return;
        const next = !dashApi.readResultsPanelHiddenPref();
        dashApi.writeResultsPanelHiddenPref(next);
        Logger.log('search-output-results-pane: results panel ' + (next ? 'hidden' : 'shown'));
        const root = this._q('[data-wf-dash-split-root][data-wf-dash-split-scope="dashboard"]');
        if (root && typeof dashApi.applyResultsPanelLayout === 'function') {
            dashApi.applyResultsPanelLayout(root);
        } else {
            this._syncResultsPanelCollapseUi();
        }
        if (typeof dashApi.scheduleSplitLayoutSync === 'function') {
            dashApi.scheduleSplitLayoutSync();
        }
    },

    _applyResultsPanelLayoutOnOpen(modal) {
        const root = modal && modal.querySelector('[data-wf-dash-split-root][data-wf-dash-split-scope="dashboard"]');
        const dashApi = Context.dashboard;
        if (root && dashApi && typeof dashApi.applyResultsPanelLayout === 'function') {
            dashApi.applyResultsPanelLayout(root);
            return;
        }
        this._syncResultsPanelCollapseUi();
    },

    _patchCardsForDisputeId(disputeId) {
        const did = String(disputeId || '').trim();
        if (!did) return;
        const seen = new Set();
        const lists = [this._state.filteredItems, this._state.cachedItems];
        for (const list of lists) {
            for (const item of list || []) {
                if (!item || !item.id || seen.has(item.id)) continue;
                if (!(item.disputes || []).some((d) => String(d.id || '').trim() === did)) continue;
                seen.add(item.id);
                this._patchTaskCard(item.id);
            }
        }
    },

    _shouldShowHelpfulness(qa, feedbackId) {
        if (!feedbackId || !qa) return false;
        if (qa.isSystemFeedback || qa.isVerifierFailure) return false;
        const userId = this._dashGetCurrentUserId();
        const reviewerId = String(qa.qaReviewerId || '').trim();
        if (userId && reviewerId && userId === reviewerId) return false;
        return true;
    },

    _helpfulnessFeedbackIdInFilter(ids) {
        const numeric = (ids || [])
            .map((id) => Number(String(id).trim()))
            .filter((n) => Number.isFinite(n) && n > 0);
        if (numeric.length === 0) return '';
        return 'in.(' + numeric.join(',') + ')';
    },

    _getHelpfulnessUi(feedbackId) {
        const id = String(feedbackId || '').trim();
        if (!id) {
            return {
                isHelpful: null,
                reportText: null,
                localText: '',
                loaded: false,
                submitting: false,
                confirmingRemove: false,
                dirty: false
            };
        }
        if (!this._state.helpfulnessUi[id]) {
            this._state.helpfulnessUi[id] = {
                isHelpful: null,
                reportText: null,
                localText: '',
                loaded: false,
                submitting: false,
                confirmingRemove: false,
                dirty: false
            };
        }
        return this._state.helpfulnessUi[id];
    },

    _helpfulnessThumbSvg(direction) {
        if (direction === 'up') {
            return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; flex-shrink: 0;"><path d="M7 10v12"></path><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"></path></svg>';
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; flex-shrink: 0;"><path d="M17 14V2"></path><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"></path></svg>';
    },

    _helpfulnessThumbBtnStyle(direction, active) {
        const base = 'display: inline-flex; align-items: center; justify-content: center; padding: 4px 8px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: opacity 0.15s;';
        if (direction === 'up' && active) {
            return base + ' border: 1px solid #10b981; background: color-mix(in srgb, #10b981 8%, var(--card, #ffffff)); color: #047857;';
        }
        if (direction === 'down' && active) {
            return base + ' border: 1px solid #ef4444; background: color-mix(in srgb, #ef4444 8%, var(--card, #ffffff)); color: #b91c1c;';
        }
        return base + ' border: 1px solid var(--border, #e2e8f0); background: var(--card, #ffffff); color: var(--muted-foreground, #64748b);';
    },

    _helpfulnessBlockHtml(feedbackId) {
        const fid = String(feedbackId || '').trim();
        const ui = this._getHelpfulnessUi(fid);
        const escId = dashEscHtml(fid);
        const upActive = ui.isHelpful === true;
        const downActive = ui.isHelpful === false;
        const submittedText = ui.reportText != null ? String(ui.reportText) : '';
        const localText = ui.localText != null ? String(ui.localText) : '';
        const hasSubmitted = ui.reportText != null;
        const submitLabel = hasSubmitted ? 'Update' : 'Submit';
        const canSubmit = localText.trim().length > 0 && localText !== submittedText && !ui.submitting;
        const submitClass = this._dashBtnClass('primary', 'compact');
        const basicClass = this._dashBtnClass('basic', 'compact');
        const submitDisabled = !canSubmit ? ' disabled' : '';
        const submitStyle = !canSubmit ? ' opacity: 0.45; cursor: not-allowed;' : '';
        const textareaStyle = this._inputStyle()
            + ' flex: 1; min-width: 120px; height: 28px; min-height: 28px; max-height: 200px; resize: vertical; overflow-y: auto; padding: 4px 8px; font-size: 12px; line-height: 1.4;';

        let removeHtml = '';
        if (ui.confirmingRemove) {
            removeHtml = `<span style="font-size: 11px; color: var(--muted-foreground, #64748b); white-space: nowrap; flex-shrink: 0;">Are you sure?</span>
                <button type="button" data-wf-dash-qa-review-confirm="1" data-wf-dash-feedback-id="${escId}" class="${basicClass}" style="flex-shrink: 0; white-space: nowrap;"${ui.submitting ? ' disabled' : ''}>Confirm</button>
                <button type="button" data-wf-dash-qa-review-cancel="1" data-wf-dash-feedback-id="${escId}" class="${basicClass}" style="flex-shrink: 0; white-space: nowrap;"${ui.submitting ? ' disabled' : ''}>Cancel</button>`;
        } else if (hasSubmitted) {
            removeHtml = `<button type="button" data-wf-dash-qa-review-remove="1" data-wf-dash-feedback-id="${escId}" class="${basicClass}" style="flex-shrink: 0; white-space: nowrap;"${ui.submitting ? ' disabled' : ''}>Remove Review</button>`;
        }

        return `
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
                <span style="font-weight: 600; color: var(--foreground, #0f172a); flex-shrink: 0;">Helpfulness</span>
                <div style="display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;">
                    <button type="button" data-wf-dash-thumb="up" data-wf-dash-feedback-id="${escId}" title="Helpful" style="${this._helpfulnessThumbBtnStyle('up', upActive)}"${ui.submitting ? ' disabled' : ''}>${this._helpfulnessThumbSvg('up')}</button>
                    <button type="button" data-wf-dash-thumb="down" data-wf-dash-feedback-id="${escId}" title="Not Helpful" style="${this._helpfulnessThumbBtnStyle('down', downActive)}"${ui.submitting ? ' disabled' : ''}>${this._helpfulnessThumbSvg('down')}</button>
                </div>
                <textarea data-wf-dash-qa-review-input="1" data-wf-dash-feedback-id="${escId}" rows="1" placeholder="Write a review…" style="${textareaStyle}"${ui.submitting ? ' disabled' : ''}>${dashEscHtml(localText)}</textarea>
                <button type="button" data-wf-dash-qa-review-submit="1" data-wf-dash-feedback-id="${escId}" class="${submitClass}" style="flex-shrink: 0;${submitStyle}"${submitDisabled}>${dashEscHtml(submitLabel)}</button>
                ${removeHtml}
            </div>`;
    },

    _patchHelpfulnessBlock(feedbackId) {
        const fid = String(feedbackId || '').trim();
        if (!fid || !this._modal) return;
        let wrap = null;
        for (const el of this._modal.querySelectorAll('[data-wf-dash-helpfulness]')) {
            if (el.getAttribute('data-wf-dash-helpfulness') === fid) {
                wrap = el;
                break;
            }
        }
        if (!wrap) return;
        const ta = wrap.querySelector('[data-wf-dash-qa-review-input]');
        const hadFocus = ta && this._pageWindow().document.activeElement === ta;
        const selStart = hadFocus ? ta.selectionStart : null;
        const selEnd = hadFocus ? ta.selectionEnd : null;
        wrap.innerHTML = this._helpfulnessBlockHtml(fid);
        if (hadFocus) {
            const newTa = wrap.querySelector('[data-wf-dash-qa-review-input]');
            if (newTa) {
                newTa.focus();
                try {
                    if (selStart != null && selEnd != null) newTa.setSelectionRange(selStart, selEnd);
                } catch (_e) { /* ignore */ }
            }
        }
    },

    async _fetchHelpfulnessRatingsBatch(feedbackIds) {
        const userId = this._dashGetCurrentUserId();
        if (!userId) {
            Logger.warn('search-output: helpfulness batch skipped — no user id');
            return;
        }
        const unique = [...new Set((feedbackIds || []).map((id) => String(id).trim()).filter(Boolean))];
        if (unique.length === 0) return;

        const rowsByFeedbackId = new Map();
        for (let i = 0; i < unique.length; i += DASH_HELPFULNESS_BATCH_CHUNK) {
            const chunk = unique.slice(i, i + DASH_HELPFULNESS_BATCH_CHUNK);
            const inFilter = this._helpfulnessFeedbackIdInFilter(chunk);
            if (!inFilter) continue;
            const rows = await this._dashPostgrestListGet('feedback_helpfulness_ratings', {
                select: 'feedback_id,is_helpful,report_text',
                feedback_id: inFilter,
                user_id: 'eq.' + userId
            });
            for (const row of rows) {
                if (row && row.feedback_id != null) {
                    rowsByFeedbackId.set(String(row.feedback_id), row);
                }
            }
        }

        for (const fid of unique) {
            const ui = this._getHelpfulnessUi(fid);
            const row = rowsByFeedbackId.get(fid);
            ui.loaded = true;
            if (row) {
                ui.isHelpful = row.is_helpful === true ? true : (row.is_helpful === false ? false : null);
                ui.reportText = row.report_text != null ? String(row.report_text) : null;
                if (!ui.dirty) {
                    ui.localText = ui.reportText != null ? String(ui.reportText) : '';
                }
            } else {
                ui.isHelpful = null;
                ui.reportText = null;
                if (!ui.dirty) ui.localText = '';
            }
        }
        Logger.debug('search-output: helpfulness batch loaded for ' + unique.length + ' feedback row(s)');
    },

    _helpfulnessUpsertBody(feedbackId, fields) {
        const userId = this._dashGetCurrentUserId();
        if (!userId) throw new Error('Fleet user id unavailable. Open Fleet while logged in.');
        const feedbackNum = Number(String(feedbackId).trim());
        if (!Number.isFinite(feedbackNum) || feedbackNum <= 0) {
            throw new Error('Invalid feedback id');
        }
        return Object.assign({
            feedback_id: feedbackNum,
            user_id: userId
        }, fields || {});
    },

    async _handleThumbClick(feedbackId, direction) {
        const fid = String(feedbackId || '').trim();
        if (!fid || (direction !== 'up' && direction !== 'down')) {
            this._logDashApiSkip('helpfulness-thumb', 'invalid feedback or direction');
            return;
        }
        const ui = this._getHelpfulnessUi(fid);
        if (ui.submitting) {
            this._logDashApiSkip('helpfulness-thumb', 'already submitting', fid);
            return;
        }

        const wantHelpful = direction === 'up';
        const prev = ui.isHelpful;
        let next;
        if (prev === wantHelpful) next = null;
        else next = wantHelpful;

        this._logDashApiClick('helpfulness-thumb', 'feedback ' + fid + ' → ' + (next === true ? 'up' : next === false ? 'down' : 'clear'));
        ui.isHelpful = next;
        ui.submitting = true;
        this._patchHelpfulnessBlock(fid);
        try {
            await this._dashPostgrestUpsert(
                'feedback_helpfulness_ratings',
                'feedback_id,user_id',
                this._helpfulnessUpsertBody(fid, { is_helpful: next })
            );
            Logger.log('search-output: helpfulness ' + (next === true ? 'up' : next === false ? 'down' : 'cleared') + ' — feedback ' + fid);
        } catch (e) {
            ui.isHelpful = prev;
            Logger.warn('search-output: helpfulness update failed — feedback ' + fid, e);
        } finally {
            ui.submitting = false;
            this._patchHelpfulnessBlock(fid);
            this._refreshHelpfulnessFilterUi();
        }
    },

    _handleQaReviewInput(feedbackId, value) {
        const fid = String(feedbackId || '').trim();
        if (!fid) return;
        const ui = this._getHelpfulnessUi(fid);
        ui.localText = String(value || '');
        ui.dirty = true;
        this._patchHelpfulnessBlock(fid);
    },

    async _handleQaReviewSubmit(feedbackId) {
        const fid = String(feedbackId || '').trim();
        if (!fid) {
            this._logDashApiSkip('qa-review-submit', 'missing feedback id');
            return;
        }
        const ui = this._getHelpfulnessUi(fid);
        const text = this._readQaReviewTextFromDom(fid);
        ui.localText = text;
        const submittedText = ui.reportText != null ? String(ui.reportText) : '';
        if (!text) {
            this._logDashApiSkip('qa-review-submit', 'empty review text', fid);
            return;
        }
        if (text === submittedText) {
            this._logDashApiSkip('qa-review-submit', 'unchanged review text', fid);
            return;
        }
        if (ui.submitting) {
            this._logDashApiSkip('qa-review-submit', 'already submitting', fid);
            return;
        }

        this._logDashApiClick('qa-review-submit', 'feedback ' + fid + ' (' + text.length + ' chars)');
        ui.submitting = true;
        this._patchHelpfulnessBlock(fid);
        try {
            await this._dashPostgrestUpsert(
                'feedback_helpfulness_ratings',
                'feedback_id,user_id',
                this._helpfulnessUpsertBody(fid, {
                    is_helpful: ui.isHelpful,
                    report_text: text
                })
            );
            ui.reportText = text;
            ui.dirty = false;
            Logger.log('search-output: QA review submitted — feedback ' + fid + ' (' + text.length + ' chars)');
        } catch (e) {
            Logger.warn('search-output: QA review submit failed — feedback ' + fid, e);
        } finally {
            ui.submitting = false;
            this._patchHelpfulnessBlock(fid);
            this._refreshHelpfulnessFilterUi();
        }
    },

    _handleQaReviewRemovePrompt(feedbackId) {
        const fid = String(feedbackId || '').trim();
        if (!fid) return;
        const ui = this._getHelpfulnessUi(fid);
        if (ui.submitting || ui.reportText == null) return;
        ui.confirmingRemove = true;
        this._patchHelpfulnessBlock(fid);
    },

    _handleQaReviewRemoveCancel(feedbackId) {
        const fid = String(feedbackId || '').trim();
        if (!fid) return;
        const ui = this._getHelpfulnessUi(fid);
        ui.confirmingRemove = false;
        this._patchHelpfulnessBlock(fid);
    },

    async _handleQaReviewRemoveConfirm(feedbackId) {
        const fid = String(feedbackId || '').trim();
        if (!fid) {
            this._logDashApiSkip('qa-review-remove', 'missing feedback id');
            return;
        }
        const ui = this._getHelpfulnessUi(fid);
        if (ui.submitting) {
            this._logDashApiSkip('qa-review-remove', 'already submitting', fid);
            return;
        }

        this._logDashApiClick('qa-review-remove', 'feedback ' + fid);
        ui.submitting = true;
        this._patchHelpfulnessBlock(fid);
        try {
            await this._dashPostgrestUpsert(
                'feedback_helpfulness_ratings',
                'feedback_id,user_id',
                this._helpfulnessUpsertBody(fid, { report_text: null })
            );
            ui.reportText = null;
            ui.localText = '';
            ui.dirty = false;
            ui.confirmingRemove = false;
            Logger.log('search-output: QA review removed — feedback ' + fid);
        } catch (e) {
            Logger.warn('search-output: QA review remove failed — feedback ' + fid, e);
        } finally {
            ui.submitting = false;
            this._patchHelpfulnessBlock(fid);
            this._refreshHelpfulnessFilterUi();
        }
    },

    _getFlagResolutionUi(flagId) {
        const id = String(flagId || '').trim();
        if (!id) {
            return { localNote: '', submitting: false };
        }
        if (!this._state.flagResolutionUi[id]) {
            this._state.flagResolutionUi[id] = {
                localNote: '',
                submitting: false
            };
        }
        return this._state.flagResolutionUi[id];
    },

    _flagResolutionBlockHtml(flagId, itemId) {
        const fid = String(flagId || '').trim();
        const escFlagId = dashEscHtml(fid);
        const escItemId = dashEscHtml(String(itemId || '').trim());
        const ui = this._getFlagResolutionUi(fid);
        const localNote = ui.localNote != null ? String(ui.localNote) : '';
        const confirmClass = this._dashBtnClass('primary', 'compact');
        const dismissClass = this._dashBtnClass('basic', 'compact');
        const disabled = ui.submitting ? ' disabled' : '';
        const textareaStyle = this._autoGrowTextareaStyle();
        return `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <span style="font-weight: 600; color: var(--foreground, #0f172a);">Resolution</span>
                <textarea ${DASH_AUTO_GROW_TEXTAREA_ATTR}="1" data-wf-dash-flag-resolution-input="1" data-wf-dash-flag-id="${escFlagId}" data-item-id="${escItemId}" rows="2" placeholder="Resolution note…" style="${textareaStyle}"${disabled}>${dashEscHtml(localNote)}</textarea>
                <div style="display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px;">
                    <button type="button" data-wf-dash-flag-confirm="1" data-wf-dash-flag-id="${escFlagId}" data-item-id="${escItemId}" class="${confirmClass}" style="flex-shrink: 0; white-space: nowrap;"${disabled}>Confirm</button>
                    <button type="button" data-wf-dash-flag-dismiss="1" data-wf-dash-flag-id="${escFlagId}" data-item-id="${escItemId}" class="${dismissClass}" style="flex-shrink: 0; white-space: nowrap;"${disabled}>Dismiss</button>
                </div>
            </div>`;
    },

    _patchFlagResolutionBlock(flagId) {
        const fid = String(flagId || '').trim();
        if (!fid || !this._modal) return;
        let wrap = null;
        for (const el of this._modal.querySelectorAll('[data-wf-dash-flag-resolution]')) {
            if (el.getAttribute('data-wf-dash-flag-resolution') === fid) {
                wrap = el;
                break;
            }
        }
        if (!wrap) return;
        const itemId = wrap.getAttribute('data-wf-dash-item-id') || '';
        const focus = this._textareaFocusSnapshot(wrap, '[data-wf-dash-flag-resolution-input]');
        wrap.innerHTML = this._flagResolutionBlockHtml(fid, itemId);
        this._restoreTextareaFocus(wrap, '[data-wf-dash-flag-resolution-input]', focus);
    },

    _handleFlagResolutionInput(flagId, value) {
        const fid = String(flagId || '').trim();
        if (!fid) return;
        const ui = this._getFlagResolutionUi(fid);
        ui.localNote = String(value || '');
        this._patchFlagResolutionBlock(fid);
    },

    _isCurrentUserTaskAuthor(task) {
        const userId = this._dashGetCurrentUserId();
        const authorId = String((task && task.author && task.author.id) || '').trim();
        if (!userId || !authorId) return false;
        return userId === authorId
            || this._dashNormProfileId(userId) === this._dashNormProfileId(authorId);
    },

    _shouldShowFlagCreateBtn(task) {
        const authorId = String((task && task.author && task.author.id) || '').trim();
        if (!authorId) return true;
        return !this._isCurrentUserTaskAuthor(task);
    },

    _dashFleetQaReferer(taskId) {
        return DASH_FLEET_ORIGIN + '/work/problems/qa/' + encodeURIComponent(String(taskId || '').trim());
    },

    _getFlagCreateUi(itemId) {
        const id = String(itemId || '').trim();
        if (!id) {
            return { open: false, reason: '', note: '', submitting: false };
        }
        if (!this._state.flagCreateUi[id]) {
            this._state.flagCreateUi[id] = {
                open: false,
                reason: '',
                note: '',
                submitting: false
            };
        }
        return this._state.flagCreateUi[id];
    },

    _toggleFlagCreatePanel(itemId, open) {
        const iid = String(itemId || '').trim();
        if (!iid) return;
        const ui = this._getFlagCreateUi(iid);
        ui.open = Boolean(open);
        if (!ui.open) {
            ui.note = '';
            ui.reason = '';
            ui.submitting = false;
        }
        Logger.log('search-output: flag create panel ' + (ui.open ? 'opened' : 'closed') + ' — ' + iid);
        this._patchTaskCard(iid);
    },

    _flagCreateReasonOptionsHtml(selectedReason) {
        const lib = dashLib();
        const selected = String(selectedReason || '').trim();
        const hasReason = DASH_FLAG_CREATE_REASON_KEYS.includes(selected);
        const placeholderSel = hasReason ? '' : ' selected';
        let html = `<option value="" disabled${placeholderSel}>Select a flag reason...</option>`;
        for (const key of DASH_FLAG_CREATE_REASON_KEYS) {
            const sel = key === selected ? ' selected' : '';
            html += `<option value="${dashEscHtml(key)}"${sel}>${dashEscHtml(lib.flagReasonLabel(key))}</option>`;
        }
        return html;
    },

    _flagCreateFormInnerHtml(itemId, taskId) {
        const iid = String(itemId || '').trim();
        const tid = String(taskId || '').trim();
        const escItemId = dashEscHtml(iid);
        const escTaskId = dashEscHtml(tid);
        const ui = this._getFlagCreateUi(iid);
        const reason = String(ui.reason || '').trim();
        const note = ui.note != null ? String(ui.note) : '';
        const disabled = ui.submitting ? ' disabled' : '';
        const canSubmit = reason && DASH_FLAG_CREATE_REASON_KEYS.includes(reason) && !ui.submitting;
        const submitDisabled = !canSubmit ? ' disabled' : '';
        const submitStyle = !canSubmit ? ' opacity: 0.45; cursor: not-allowed;' : '';
        const cancelClass = this._dashBtnClass('basic', 'compact');
        const submitClass = this._dashBtnClass('primary', 'compact');
        const selectStyle = this._compactSelectStyle();
        const textareaStyle = this._autoGrowTextareaStyle();
        return `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <span style="font-weight: 600; color: var(--foreground, #0f172a);">Flag for Senior Review</span>
                <textarea ${DASH_AUTO_GROW_TEXTAREA_ATTR}="1" data-wf-dash-flag-create-note="1" data-item-id="${escItemId}" data-task-id="${escTaskId}" rows="2" placeholder="Explain why this task should be reviewed…" style="${textareaStyle}"${disabled}>${dashEscHtml(note)}</textarea>
                <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;">
                    <select data-wf-dash-flag-create-reason="1" data-item-id="${escItemId}" data-task-id="${escTaskId}" style="${selectStyle}"${disabled}>${this._flagCreateReasonOptionsHtml(reason)}</select>
                    <div style="display: inline-flex; align-items: center; gap: 8px; margin-left: auto;">
                        <button type="button" data-wf-dash-flag-create-cancel="1" data-item-id="${escItemId}" class="${cancelClass}" style="flex-shrink: 0; white-space: nowrap;"${disabled}>Cancel</button>
                        <button type="button" data-wf-dash-flag-create-submit="1" data-item-id="${escItemId}" class="${submitClass}" style="flex-shrink: 0; white-space: nowrap;${submitStyle}"${submitDisabled}${disabled}>Submit</button>
                    </div>
                </div>
            </div>`;
    },

    _flagCreatePanelHtml(itemId, taskId) {
        const iid = String(itemId || '').trim();
        const tid = String(taskId || '').trim();
        if (!iid || !tid) return '';
        const ui = this._getFlagCreateUi(iid);
        if (!ui.open) return '';
        const escItemId = dashEscHtml(iid);
        const escTaskId = dashEscHtml(tid);
        return `<div data-wf-dash-flag-create-panel="1" data-item-id="${escItemId}" data-task-id="${escTaskId}" style="padding: 8px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">${this._flagCreateFormInnerHtml(iid, tid)}</div>`;
    },

    _patchFlagCreatePanel(itemId, taskId) {
        const iid = String(itemId || '').trim();
        if (!iid || !this._modal) return;
        const ui = this._getFlagCreateUi(iid);
        if (!ui.open) return;
        let wrap = null;
        for (const el of this._modal.querySelectorAll('[data-wf-dash-flag-create-panel]')) {
            if (el.getAttribute('data-item-id') === iid) {
                wrap = el;
                break;
            }
        }
        if (!wrap) return;
        const tid = taskId || wrap.getAttribute('data-task-id') || '';
        const focus = this._textareaFocusSnapshot(wrap, '[data-wf-dash-flag-create-note]');
        wrap.innerHTML = this._flagCreateFormInnerHtml(iid, tid);
        this._restoreTextareaFocus(wrap, '[data-wf-dash-flag-create-note]', focus);
    },

    _readFlagCreateFormFromDom(itemId) {
        const iid = String(itemId || '').trim();
        if (!iid || !this._modal) {
            const ui = this._getFlagCreateUi(iid);
            return {
                reason: String(ui.reason || '').trim(),
                note: String(ui.note || '')
            };
        }
        let wrap = null;
        for (const el of this._modal.querySelectorAll('[data-wf-dash-flag-create-panel]')) {
            if (el.getAttribute('data-item-id') === iid) {
                wrap = el;
                break;
            }
        }
        if (!wrap) {
            const ui = this._getFlagCreateUi(iid);
            return {
                reason: String(ui.reason || '').trim(),
                note: String(ui.note || '')
            };
        }
        const sel = wrap.querySelector('[data-wf-dash-flag-create-reason]');
        const ta = wrap.querySelector('[data-wf-dash-flag-create-note]');
        return {
            reason: String(sel ? sel.value : '').trim(),
            note: String(ta ? ta.value : '')
        };
    },

    _readQaReviewTextFromDom(feedbackId) {
        const fid = String(feedbackId || '').trim();
        if (!fid || !this._modal) {
            return String(this._getHelpfulnessUi(fid).localText || '').trim();
        }
        for (const el of this._modal.querySelectorAll('[data-wf-dash-helpfulness]')) {
            if (el.getAttribute('data-wf-dash-helpfulness') === fid) {
                const ta = el.querySelector('[data-wf-dash-qa-review-input]');
                return String(ta ? ta.value : '').trim();
            }
        }
        return String(this._getHelpfulnessUi(fid).localText || '').trim();
    },

    _handleFlagCreateInput(itemId, patch) {
        const iid = String(itemId || '').trim();
        if (!iid) return;
        const ui = this._getFlagCreateUi(iid);
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'reason')) {
            ui.reason = String(patch.reason || 'other').trim();
        }
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'note')) {
            ui.note = String(patch.note || '');
        }
        const item = this._findCachedItem(iid) || this._findResultItem(iid);
        const taskId = item && item.task ? item.task.id : '';
        this._patchFlagCreatePanel(iid, taskId);
    },

    async _handleFlagCreateSubmit(itemId) {
        const iid = String(itemId || '').trim();
        if (!iid) {
            this._logDashApiSkip('flag-create', 'missing item id');
            return;
        }
        const item = this._findCachedItem(iid) || this._findResultItem(iid);
        if (!item || !item.task || !item.task.id) {
            this._logDashApiSkip('flag-create', 'task not found', iid);
            return;
        }
        if (this._isCurrentUserTaskAuthor(item.task)) {
            this._logDashApiSkip('flag-create', 'cannot flag own task', iid);
            return;
        }
        const ui = this._getFlagCreateUi(iid);
        if (ui.submitting) {
            this._logDashApiSkip('flag-create', 'already submitting', iid);
            return;
        }
        const form = this._readFlagCreateFormFromDom(iid);
        ui.reason = form.reason;
        ui.note = form.note;
        const reason = form.reason;
        if (!reason || !DASH_FLAG_CREATE_REASON_KEYS.includes(reason)) {
            this._logDashApiSkip('flag-create', 'no reason selected', iid);
            return;
        }
        const taskId = String(item.task.id).trim();
        this._logDashApiClick('flag-create', 'task ' + taskId.slice(0, 8) + '… reason ' + reason);
        ui.submitting = true;
        this._patchFlagCreatePanel(iid, taskId);
        try {
            await this._fleetWebPost(DASH_FLEET_FLAGS_PATH, {
                body: {
                    task_id: taskId,
                    reason,
                    note: String(form.note || '').trim()
                },
                referer: this._dashFleetQaReferer(taskId)
            });
            Logger.log('search-output: flag created — task ' + taskId.slice(0, 8));
            delete this._state.flagCreateUi[iid];
            await this._refreshFlagPrefetchCaches();
            await this._rehydrateCard(iid);
        } catch (e) {
            Logger.warn('search-output: flag create failed — task ' + taskId.slice(0, 8), e);
            ui.submitting = false;
            this._patchFlagCreatePanel(iid, taskId);
        }
    },

    async _handleFlagResolution(flagId, itemId, resolution) {
        const fid = String(flagId || '').trim();
        const iid = String(itemId || '').trim();
        if (!fid || !iid || (resolution !== 'confirmed' && resolution !== 'dismissed')) {
            this._logDashApiSkip('flag-resolve', 'invalid flag, item, or resolution');
            return;
        }
        const ui = this._getFlagResolutionUi(fid);
        if (ui.submitting) {
            this._logDashApiSkip('flag-resolve', 'already submitting', fid);
            return;
        }

        this._logDashApiClick('flag-resolve', resolution + ' — flag ' + fid);
        ui.submitting = true;
        this._patchFlagResolutionBlock(fid);
        try {
            await this._fleetWebPost(this._flagResolveApiPath(fid), {
                body: {
                    resolution,
                    note: String(ui.localNote || '').trim()
                },
                referer: DASH_FLEET_SENIOR_REVIEW_REFERER
            });
            Logger.log('search-output: flag ' + resolution + ' — flag ' + fid);
            delete this._state.flagResolutionUi[fid];
            await this._refreshFlagPrefetchCaches();
            await this._rehydrateCard(iid);
        } catch (e) {
            Logger.warn('search-output: flag resolution failed — flag ' + fid, e);
        } finally {
            if (this._state.flagResolutionUi[fid]) {
                ui.submitting = false;
                this._patchFlagResolutionBlock(fid);
            }
        }
    },

    _getTaskOpenUi(taskId) {
        const id = String(taskId || '').trim();
        if (!id) return { status: 'idle' };
        if (!this._state.taskOpenUi[id]) {
            this._state.taskOpenUi[id] = { status: 'idle' };
        }
        return this._state.taskOpenUi[id];
    },

    async _openTaskInFleet(taskId, teamId, itemId) {
        const id = String(taskId || '').trim();
        const url = dashFleetTaskUrl(id);
        if (!url) {
            this._logDashApiSkip('open-task', 'invalid task url', id);
            return;
        }
        const ui = this._getTaskOpenUi(id);
        if (ui.status === 'switching') {
            this._logDashApiSkip('open-task', 'team switch in progress', id.slice(0, 8) + '…');
            return;
        }

        const targetTeamId = String(teamId || '').trim();
        const currentTeamId = this._dashGetCookie('current-team-id');
        if (!targetTeamId || targetTeamId === currentTeamId) {
            this._pageWindow().open(url, '_blank', 'noopener,noreferrer');
            Logger.log('dashboard: opened task ' + id.slice(0, 8) + '… in Fleet');
            return;
        }

        this._logDashApiClick('open-task', 'switch team then open ' + id.slice(0, 8) + '…');
        ui.status = 'switching';
        this._patchTaskCard(itemId);
        try {
            await this._switchFleetTeam(targetTeamId);
            this._pageWindow().open(url, '_blank', 'noopener,noreferrer');
            Logger.log('dashboard: switched team and opened task ' + id.slice(0, 8) + '…');
        } catch (e) {
            Logger.warn('dashboard: team switch failed before opening task ' + id.slice(0, 8) + '…', e);
        } finally {
            ui.status = 'idle';
            this._patchTaskCard(itemId);
        }
    },

    _resultsKindTabsMeta(committed) {
        const kinds = this._committedSearchKinds(committed);
        if (kinds.length === 0) return [];
        if (kinds.length === 1) {
            const kind = kinds[0];
            const singleLabels = {
                task_creation: 'All/Task Creation',
                qa: 'All/QA',
                dispute: 'All/Disputes',
                senior_review: 'All/Sr Review'
            };
            return [{ id: 'all', label: singleLabels[kind] || 'All' }];
        }
        const tabs = [{ id: 'all', label: 'All' }];
        for (const kind of dashKindMergeOrder()) {
            if (kinds.includes(kind)) {
                const cfg = DASH_OUTPUT_KIND_CONFIG[kind];
                tabs.push({ id: kind, label: (cfg && cfg.label) || kind });
            }
        }
        return tabs;
    },

    _itemHasOutputKind(item, kind) {
        return ((item.kinds && item.kinds.length) ? item.kinds : [item.kind]).includes(kind);
    },

    _countItemsByResultsKindTab(items, committed) {
        const counts = {};
        const kinds = this._committedSearchKinds(committed);
        const list = items || [];
        if (kinds.length <= 1) return counts;
        counts.all = list.length;
        for (const kind of kinds) {
            counts[kind] = list.filter((it) => this._itemHasOutputKind(it, kind)).length;
        }
        return counts;
    },

    _kindsWithResults(counts, kinds) {
        return kinds.filter((k) => (counts[k] || 0) > 0);
    },

    _isResultsKindTabDisabled(tabId, counts, committed) {
        const kinds = this._committedSearchKinds(committed);
        if (kinds.length <= 1) return false;
        if (tabId === 'all') {
            return this._kindsWithResults(counts, kinds).length <= 1;
        }
        return (counts[tabId] || 0) === 0;
    },

    _firstEnabledResultsKindTab(tabs, counts, committed) {
        for (const tab of tabs) {
            if (!this._isResultsKindTabDisabled(tab.id, counts, committed)) return tab.id;
        }
        return tabs[0] ? tabs[0].id : 'all';
    },

    _ensureValidResultsKindTab() {
        const committed = this._state.committed;
        const tabs = this._resultsKindTabsMeta(committed);
        if (tabs.length <= 1 || !this._state.cachedItems) return false;
        const counts = this._countItemsByResultsKindTab(this._state.cachedItems, committed);
        const current = this._state.resultsKindTab || 'all';
        if (!this._isResultsKindTabDisabled(current, counts, committed)) return false;
        const next = this._firstEnabledResultsKindTab(tabs, counts, committed);
        if (next === current) return false;
        this._state.resultsKindTab = next;
        Logger.log('dashboard: results kind tab — defaulted to ' + next);
        return true;
    },

    _filterItemsByResultsKindTab(items) {
        const committed = this._state.committed;
        const kinds = this._committedSearchKinds(committed);
        if (!items || kinds.length <= 1) return items || [];
        const tab = this._state.resultsKindTab || 'all';
        if (tab === 'all') return items;
        return items.filter((item) => this._itemHasOutputKind(item, tab));
    },

    _getViewItems() {
        // filteredItems is always tab-scoped + sidebar-filtered (see _refreshResultsView).
        return this._state.filteredItems;
    },

    _syncResultsToolbarDerivedUi() {
        this._syncResultsRangeCountUi();
        this._syncBulkHydrateUi();
        this._syncDiffIncludedUi();
        this._syncDropExcludedUi();
        this._syncTaskExportUi();
        this._syncVersionModeDropdownUi();
    },

    _dashExportDateSlug() {
        const engine = Context.statsEngine;
        if (engine && typeof engine.exportDateSlug === 'function') return engine.exportDateSlug();
        return new Date().toISOString().slice(0, 10);
    },

    _cloneJsonSafe(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            Logger.error('search-output-results-pane: JSON clone failed', e);
            return null;
        }
    },

    _buildTaskCardsExportPayload(items) {
        const committed = this._state.committed || {};
        const applied = this._state.appliedFilters || null;
        const clonedItems = (items || [])
            .map((item) => this._cloneJsonSafe(item))
            .filter(Boolean);
        return {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            search: {
                authorCount: committed.authorCount,
                authorLabels: committed.authorLabels,
                ratingsEveryone: committed.ratingsEveryone,
                includeTaskCreation: committed.includeTaskCreation,
                includeQa: committed.includeQa,
                includeDisputes: committed.includeDisputes,
                includeSeniorReview: committed.includeSeniorReview,
                includeSessions: committed.includeSessions,
                searchLimit: committed.searchLimit,
                afterLocal: committed.afterLocal,
                beforeLocal: committed.beforeLocal,
                searchKinds: committed.searchKinds,
                retrieveMode: committed.retrieveMode,
                retrieveLabel: committed.retrieveLabel
            },
            view: {
                resultsKindTab: this._state.resultsKindTab || 'all',
                versionMode: this._state.versionMode,
                sortMetric: applied && applied.sortMetric,
                sortOrder: applied && applied.sortOrder,
                manualFilters: applied && applied.manualFilters,
                manualAndOr: applied && applied.manualAndOr,
                filteredCount: clonedItems.length,
                cachedCount: (this._state.cachedItems || []).length,
                scopeCount: this._getFilterScopeItems().length
            },
            items: clonedItems
        };
    },

    _syncTaskExportUi() {
        const btn = this._q('#wf-dash-export-tasks-json');
        if (!btn) return;
        if (!Context.isDevBranch) {
            btn.style.display = 'none';
            return;
        }
        const viewItems = this._getViewItems();
        const show = Boolean(this._state.hasSearched)
            && this._state.cachedItems !== null
            && viewItems
            && viewItems.length > 0
            && !this._state.loading;
        btn.style.display = show ? '' : 'none';
        btn.disabled = !show;
    },

    _exportFilteredTasksJson() {
        if (!Context.isDevBranch) {
            Logger.warn('search-output-results-pane: task export skipped — not a dev build');
            return;
        }
        const items = this._getViewItems();
        if (!items || items.length === 0) {
            Logger.warn('search-output-results-pane: task export skipped — no filtered items');
            return;
        }
        const payload = this._buildTaskCardsExportPayload(items);
        const filename = 'fleet-task-cards-' + this._dashExportDateSlug() + '.json';
        const json = JSON.stringify(payload, null, 2);
        if (typeof this._downloadTextFile === 'function') {
            this._downloadTextFile(filename, json, 'application/json;charset=utf-8');
        } else {
            Logger.error('search-output-results-pane: task export failed — download helper unavailable');
            return;
        }
        Logger.log('search-output-results-pane: task cards exported — ' + payload.items.length + ' item(s) · ' + filename);
    },

    _syncDiffIncludedUi() {
        const viewItems = this._getViewItems();
        const show = viewItems && viewItems.length > 0
            && this._state.cachedItems !== null
            && Context.diffViewer && typeof Context.diffViewer.addTasks === 'function';
        const btn = this._q('#wf-dash-diff-included');
        if (btn) btn.style.display = show ? '' : 'none';
    },

    _syncVersionModeDropdownUi() {
        const wrap = this._q('#wf-dash-version-mode-wrap');
        const sel = this._q('#wf-dash-version-mode');
        if (!wrap || !sel) return;
        const authorIds = this._state.activeSearchAuthorIds || [];
        const hasContributors = authorIds.length > 0;
        const hasResults = this._state.cachedItems !== null && this._state.hasSearched;
        const show = hasResults && !this._isTasksHydratingActive();
        wrap.style.display = show ? 'inline-flex' : 'none';
        if (!show) return;
        let mode = this._state.versionMode || DASH_VERSION_MODE_FINAL;
        if (!hasContributors && mode === DASH_VERSION_MODE_CONTRIBUTOR) {
            mode = DASH_VERSION_MODE_FINAL;
            this._state.versionMode = mode;
        }
        sel.innerHTML = this._dashVersionModeSelectOptionsHtml(hasContributors, mode);
    },

    _dashVersionModeSelectOptionsHtml(includeContributorMatch, selectedValue) {
        const selected = String(selectedValue || DASH_VERSION_MODE_FINAL);
        let html = '';
        if (includeContributorMatch) {
            html += `<option value="${DASH_VERSION_MODE_CONTRIBUTOR}"${selected === DASH_VERSION_MODE_CONTRIBUTOR ? ' selected' : ''}>Contributor match</option>`;
        }
        html += `<option value="${DASH_VERSION_MODE_V1}"${selected === DASH_VERSION_MODE_V1 ? ' selected' : ''}>All v1s</option>`;
        html += `<option value="${DASH_VERSION_MODE_FINAL}"${selected === DASH_VERSION_MODE_FINAL ? ' selected' : ''}>All final versions</option>`;
        return html;
    },

    _isTasksHydratingActive() {
        return Boolean(this._state.hydrateBulkActive || this._state.autoHydrateActive);
    },

    _syncResultsHydrateBannerUi() {
        const el = this._q('#wf-dash-results-hydrate-banner');
        if (!el) return;
        if (!this._isTasksHydratingActive()) {
            el.style.display = 'none';
            el.innerHTML = '';
            this._syncVersionModeDropdownUi();
            this._renderRatingsPanel();
            if ((this._state.statsTab || 'stats') === 'stats') {
                void this._renderStatsPanel();
            }
            return;
        }
        const label = this._labelStyle();
        el.style.display = 'inline-flex';
        if (el.querySelector('[data-wf-dash-load-mark]')) {
            this._syncVersionModeDropdownUi();
            return;
        }
        el.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 8px; ${label}">`
            + this._loadingSpinnerHtml(14).replace('<span class="fleet-ui-spinner"', '<span data-wf-dash-load-mark="1" class="fleet-ui-spinner"')
            + '<span>Hydrating tasks</span></span>';
        this._syncVersionModeDropdownUi();
        this._renderRatingsPanel();
    },

    _syncDropExcludedUi() {
        const cached = this._state.cachedItems;
        const filtered = this._state.filteredItems;
        const filtersReady = !this._state.loading
            && cached !== null && filtered !== null
            && this._hasActiveFilters();
        const dropExcluded = this._q('#wf-dash-drop-excluded');
        if (dropExcluded) {
            const showExcluded = filtersReady && filtered.length < cached.length;
            dropExcluded.style.display = showExcluded ? '' : 'none';
        }
        const dropIncluded = this._q('#wf-dash-drop-included');
        if (dropIncluded) {
            const showIncluded = filtersReady && filtered.length > 0;
            dropIncluded.style.display = showIncluded ? '' : 'none';
        }
    },

    _dropIncludedResults() {
        const filtered = this._state.filteredItems;
        const cached = this._state.cachedItems;
        if (!filtered || !cached || filtered.length === 0) return;
        const includedIds = new Set(filtered.map((it) => it.id));
        const kept = cached.filter((it) => !includedIds.has(it.id));
        const dropped = filtered.length;
        this._state.cachedItems = kept;
        const newHydrateUi = {};
        for (const id of Object.keys(this._state.hydrateUi || {})) {
            if (!includedIds.has(id)) newHydrateUi[id] = this._state.hydrateUi[id];
        }
        this._state.hydrateUi = newHydrateUi;
        const newUserStoryUi = {};
        for (const id of Object.keys(this._state.userStoryUi || {})) {
            if (!includedIds.has(id)) newUserStoryUi[id] = this._state.userStoryUi[id];
        }
        this._state.userStoryUi = newUserStoryUi;
        const newSessionQaUi = {};
        for (const id of Object.keys(this._state.sessionQaUi || {})) {
            if (!includedIds.has(id)) newSessionQaUi[id] = this._state.sessionQaUi[id];
        }
        this._state.sessionQaUi = newSessionQaUi;
        const newVerifierOutputUi = {};
        for (const id of Object.keys(this._state.verifierOutputUi || {})) {
            if (!includedIds.has(id)) newVerifierOutputUi[id] = this._state.verifierOutputUi[id];
        }
        this._state.verifierOutputUi = newVerifierOutputUi;
        this._refreshResultsView({ resetPage: true, reindexFilters: true, filterSource: 'search-defaults' });
        Logger.log('search-output: dropped ' + dropped + ' included result(s) from cache — '
            + kept.length + ' remaining');
    },

    _dropExcludedResults() {
        const filtered = this._state.filteredItems;
        const cached = this._state.cachedItems;
        if (!filtered || !cached || filtered.length >= cached.length) return;
        const dropped = cached.length - filtered.length;
        const keptIds = new Set(filtered.map((it) => it.id));
        this._state.cachedItems = filtered.slice();
        const newHydrateUi = {};
        for (const id of Object.keys(this._state.hydrateUi || {})) {
            if (keptIds.has(id)) newHydrateUi[id] = this._state.hydrateUi[id];
        }
        this._state.hydrateUi = newHydrateUi;
        const newUserStoryUi = {};
        for (const id of Object.keys(this._state.userStoryUi || {})) {
            if (keptIds.has(id)) newUserStoryUi[id] = this._state.userStoryUi[id];
        }
        this._state.userStoryUi = newUserStoryUi;
        const newSessionQaUi = {};
        for (const id of Object.keys(this._state.sessionQaUi || {})) {
            if (keptIds.has(id)) newSessionQaUi[id] = this._state.sessionQaUi[id];
        }
        this._state.sessionQaUi = newSessionQaUi;
        const newVerifierOutputUi = {};
        for (const id of Object.keys(this._state.verifierOutputUi || {})) {
            if (keptIds.has(id)) newVerifierOutputUi[id] = this._state.verifierOutputUi[id];
        }
        this._state.verifierOutputUi = newVerifierOutputUi;
        this._refreshResultsView({ resetPage: true, reindexFilters: true, filterSource: 'search-defaults' });
        Logger.log('search-output: dropped ' + dropped + ' excluded result(s) from cache — '
            + filtered.length + ' remaining');
    },

    _dropResultFromSearch(itemId) {
        const id = String(itemId || '').trim();
        if (!id) return;
        const cached = this._state.cachedItems;
        if (!cached) return;
        const item = cached.find((it) => it.id === id);
        if (!item) return;
        this._state.cachedItems = cached.filter((it) => it.id !== id);
        if (this._state.hydrateUi) delete this._state.hydrateUi[id];
        if (this._state.cardRehydrating) delete this._state.cardRehydrating[id];
        if (this._state.cardRescuing) delete this._state.cardRescuing[id];
        if (this._state.userStoryUi) delete this._state.userStoryUi[id];
        if (this._state.sessionQaUi) delete this._state.sessionQaUi[id];
        if (this._state.verifierOutputUi) delete this._state.verifierOutputUi[id];
        const taskId = item.task && item.task.id;
        if (taskId && this._state.cardUi) {
            const stillHasTask = this._state.cachedItems.some((it) => it.task && it.task.id === taskId);
            if (!stillHasTask) delete this._state.cardUi[taskId];
        }
        this._refreshResultsView({ reindexFilters: true, filterSource: 'results-mutate' });
        Logger.log('search-output: removed result from search — ' + id);
    },

    _syncResultsListDerivedUi({ reindexFilters } = {}) {
        if (reindexFilters && this._state.cachedItems) {
            this._reindexFilterListsFromScope(false);
        }
    },

    _resultsToolbarReady() {
        const committed = this._state.committed;
        const resultsReady = this._state.filteredItems !== null && this._state.cachedItems !== null;
        return Boolean(this._state.hasSearched && committed && !this._state.loading && resultsReady);
    },

    _onResultsKindTabChanged() {
        this._refreshResultsView({ resetPage: true, reindexFilters: true, filterSource: 'tab-reset' });
    },

    _readResultsPageSizePref() {
        try {
            const v = Storage.getData(DASH_RESULTS_PAGE_SIZE_KEY, null);
            if (v === '10' || v === '25' || v === '50' || v === '100' || v === 'all') return v;
        } catch (_e) { /* ignore */ }
        return null;
    },

    _persistResultsPageSizePref(value) {
        try {
            const v = String(value || DASH_RESULTS_PAGE_SIZE_DEFAULT);
            Storage.setData(DASH_RESULTS_PAGE_SIZE_KEY, v);
        } catch (e) {
            Logger.debug('dashboard: could not persist results page size', e);
        }
    },

    _getEffectiveResultsPageSize() {
        const ps = this._state.resultsPageSize;
        if (ps === 'all') return Infinity;
        const n = Number(ps);
        return Number.isFinite(n) && n > 0 ? n : DASH_RESULTS_PAGE_SIZE_DEFAULT;
    },

    _applyResultsPageSizeForNewSearch() {
        const pref = this._readResultsPageSizePref();
        if (pref === 'all') {
            this._state.resultsPageSize = DASH_RESULTS_PAGE_SIZE_DEFAULT;
        } else if (pref) {
            this._state.resultsPageSize = Number(pref) || DASH_RESULTS_PAGE_SIZE_DEFAULT;
        } else {
            this._state.resultsPageSize = DASH_RESULTS_PAGE_SIZE_DEFAULT;
        }
        this._state.resultsPage = 0;
        this._syncResultsPageSizeUi();
    },

    _syncResultsPageSizeUi() {
        const sel = this._q('#wf-dash-results-page-size');
        if (!sel) return;
        const ps = this._state.resultsPageSize;
        if (ps === 'all') {
            sel.value = 'all';
        } else {
            sel.value = String(ps);
        }
    },

    _getPaginatedViewItems() {
        const viewItems = this._getViewItems();
        if (!viewItems || viewItems.length === 0) return [];
        const size = this._getEffectiveResultsPageSize();
        if (size === Infinity) return viewItems;
        const totalPages = Math.max(1, Math.ceil(viewItems.length / size));
        let page = this._state.resultsPage || 0;
        if (page >= totalPages) page = totalPages - 1;
        this._state.resultsPage = page;
        const start = page * size;
        return viewItems.slice(start, start + size);
    },

    _getResultsPaginationMeta() {
        const viewItems = this._getViewItems() || [];
        const pageHolder = { page: this._state.resultsPage || 0 };
        const meta = this._paginationMeta(
            viewItems.length,
            this._getEffectiveResultsPageSize(),
            pageHolder
        );
        this._state.resultsPage = pageHolder.page;
        return meta;
    },

    _getResultsRangeLabel() {
        return this._rangeLabel(this._getResultsPaginationMeta(), {
            singular: 'result',
            plural: 'results'
        });
    },

    _goResultsPage(delta) {
        const meta = this._getResultsPaginationMeta();
        if (!meta.showNav) return;
        const next = meta.page + delta;
        if (next < 0 || next >= meta.totalPages) return;
        this._state.resultsPage = next;
        Logger.log('dashboard: results page — ' + (next + 1) + ' / ' + meta.totalPages);
        this._renderResults();
        this._syncResultsPagerUi();
    },

    _syncResultsPagerUi() {
        const showPager = this._resultsToolbarReady();
        const meta = showPager ? this._getResultsPaginationMeta() : null;
        const pager = this._q('#wf-dash-results-pager');
        const kindSlot = this._q('#wf-dash-results-pager-slot-kind');
        if (showPager && pager && kindSlot && pager.parentElement !== kindSlot) {
            kindSlot.appendChild(pager);
        }
        this._syncPagerNavUi({
            show: showPager,
            rowEl: this._q('#wf-dash-results-toolbar-row2'),
            rowDisplay: 'flex',
            pagerEl: pager,
            pagerDisplay: 'flex',
            rangeEl: this._q('#wf-dash-results-range-count'),
            rangeLabel: meta ? this._getResultsRangeLabel() : '',
            prevBtn: this._q('#wf-dash-results-prev'),
            nextBtn: this._q('#wf-dash-results-next'),
            meta
        });
    },

    _syncResultsRangeCountUi() {
        this._syncResultsPagerUi();
    },

    _applySortAndRender() {
        const lib = dashLib();
        const applied = this._state.appliedFilters;
        if (this._state.cachedItems === null || !applied) return;
        const { sortMetric, sortOrder, label } = this._readDashSortFromUi();
        if (applied.sortMetric === sortMetric && applied.sortOrder === sortOrder) return;
        const filters = Object.assign({}, applied, { sortMetric, sortOrder });
        this._state.resultsPage = 0;
        const bounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        const scopeItems = this._getFilterScopeItems();
        const checkboxResult = lib.applyFiltersAndSort(scopeItems, filters, bounds, this._dashSortContext());
        const manualRows = filters.manualFilters || [];
        const manualAndOr = filters.manualAndOr || 'and';
        const result = this._applyManualFiltersToResult(checkboxResult, manualRows, manualAndOr);
        this._state.filteredItems = result;
        this._state.appliedFilters = filters;
        Logger.log('dashboard: sort applied — ' + (label || (sortMetric + ' ' + sortOrder)));
        this._updateResultsStatus();
        this._syncResultsListDerivedUi();
        this._renderResults();
        this._updateApplyFiltersUi();
    },

    _applyVersionModeChange(mode) {
        const next = String(mode || DASH_VERSION_MODE_FINAL);
        if (this._state.versionMode === next) return;
        this._state.versionMode = next;
        for (const ui of Object.values(this._state.cardUi || {})) {
            if (!ui.expanded) ui.selectedDisplayNo = null;
        }
        this._renderResults();
        Logger.log('search-output: version mode → ' + next);
    },

    _contributorMatchDisplayNo(item, versions) {
        const authorIds = this._state.activeSearchAuthorIds || [];
        const contributorSet = authorIds.length > 0
            ? this._contributorSetFromAuthorIds(authorIds)
            : null;
        const matchingNos = [];
        const allFeedback = (item.task && item.task.allFeedback) || [];
        if (contributorSet) {
            for (const entry of allFeedback) {
                const reviewerId = entry.reviewer && entry.reviewer.id
                    ? String(entry.reviewer.id).trim()
                    : '';
                if (reviewerId && this._profileIdMatchesContributorSet(reviewerId, contributorSet)
                    && entry.linkedDisplayVersionNo != null) {
                    matchingNos.push(entry.linkedDisplayVersionNo);
                }
            }
        }
        if (matchingNos.length > 0) {
            return Math.max(...matchingNos);
        }
        if (item.selectedFeedbackId) {
            const entry = allFeedback.find((f) => f.id === item.selectedFeedbackId);
            if (entry && entry.linkedDisplayVersionNo != null) {
                return entry.linkedDisplayVersionNo;
            }
        }
        return versions[versions.length - 1].displayVersionNo;
    },

    _getUserStoryUi(itemId) {
        const id = String(itemId || '');
        if (!id) {
            return {
                status: 'idle',
                visible: false,
                scenarioTitle: null,
                humanAnnotatorInstructions: null,
                userStory: null,
                message: null
            };
        }
        if (!this._state.userStoryUi) this._state.userStoryUi = {};
        if (!this._state.userStoryUi[id]) {
            this._state.userStoryUi[id] = {
                status: 'idle',
                visible: false,
                scenarioTitle: null,
                humanAnnotatorInstructions: null,
                userStory: null,
                message: null
            };
        }
        return this._state.userStoryUi[id];
    },

    _getSessionQaUi(itemId) {
        const id = String(itemId || '');
        if (!id) {
            return {
                status: 'idle',
                visible: false,
                reviews: [],
                message: null
            };
        }
        if (!this._state.sessionQaUi) this._state.sessionQaUi = {};
        if (!this._state.sessionQaUi[id]) {
            this._state.sessionQaUi[id] = {
                status: 'idle',
                visible: false,
                reviews: [],
                message: null
            };
        }
        return this._state.sessionQaUi[id];
    },

    _getVerifierOutputUi(itemId) {
        const id = String(itemId || '');
        if (!id) {
            return {
                status: 'idle',
                visible: false,
                executions: [],
                message: null
            };
        }
        if (!this._state.verifierOutputUi) this._state.verifierOutputUi = {};
        if (!this._state.verifierOutputUi[id]) {
            this._state.verifierOutputUi[id] = {
                status: 'idle',
                visible: false,
                executions: [],
                message: null
            };
        }
        return this._state.verifierOutputUi[id];
    },

    _screenshotUiKey(kind, id) {
        return String(kind || '') + ':' + String(id || '');
    },

    _getScreenshotUi(key) {
        if (!this._state.screenshotUi) this._state.screenshotUi = {};
        if (!this._state.screenshotUi[key]) {
            this._state.screenshotUi[key] = { status: 'idle', urls: [], message: null };
        }
        return this._state.screenshotUi[key];
    },

    _qaScreenshotViewUrlsPath() {
        try {
            const path = this._dashFleetWebPath('qa_feedback_screenshot_view_urls');
            if (path) return path.startsWith('/') ? path : '/' + path;
        } catch (e) {
            Logger.debug('search-output: qa_feedback_screenshot_view_urls path fallback', e);
        }
        return DASH_QA_SCREENSHOT_VIEW_URLS_PATH;
    },

    _taskViewReferer(taskId) {
        const tid = String(taskId || '').trim();
        return DASH_FLEET_ORIGIN + '/work/problems/view-task/' + encodeURIComponent(tid);
    },

    async _fetchScreenshotViewUrls(taskId, s3Keys) {
        const keys = (Array.isArray(s3Keys) ? s3Keys : []).filter(Boolean);
        if (keys.length === 0) throw new Error('No screenshot keys');
        const json = await this._fleetWebPost(this._qaScreenshotViewUrlsPath(), {
            body: { s3_keys: keys },
            referer: this._taskViewReferer(taskId)
        });
        const urls = json && Array.isArray(json.urls) ? json.urls : [];
        if (urls.length !== keys.length) {
            throw new Error('Screenshot URL count mismatch');
        }
        return urls;
    },

    _findScreenshotKeys(kind, entityId, itemId) {
        const item = this._findCachedItem(itemId) || this._findResultItem(itemId);
        if (!item) return [];
        if (kind === 'qa') {
            const fid = String(entityId || '');
            for (const entry of (item.task && item.task.allFeedback) || []) {
                if (String(entry.id) === fid && entry.display && entry.display.screenshotKeys) {
                    return entry.display.screenshotKeys;
                }
            }
            if (item.qaFeedback && String(item.selectedFeedbackId) === fid && item.qaFeedback.screenshotKeys) {
                return item.qaFeedback.screenshotKeys;
            }
            return [];
        }
        if (kind === 'dispute') {
            const did = String(entityId || '');
            for (const d of item.disputes || []) {
                if (String(d.id) === did && d.screenshotKeys) return d.screenshotKeys;
            }
        }
        return [];
    },

    _screenshotBlockHtml(kind, entityId, itemId, screenshotKeys) {
        if (!Array.isArray(screenshotKeys) || screenshotKeys.length === 0) return '';
        const uiKey = this._screenshotUiKey(kind, entityId);
        const ui = this._getScreenshotUi(uiKey);
        const escKey = dashEscHtml(uiKey);
        const escKind = dashEscHtml(String(kind || ''));
        const escId = dashEscHtml(String(entityId || ''));
        const escItemId = dashEscHtml(String(itemId || ''));
        const btnClass = this._dashBtnClass('secondary', 'nav');

        let buttonHtml = '';
        if (ui.status !== 'loaded') {
            const disabled = ui.status === 'loading' ? ' disabled aria-busy="true"' : '';
            const label = ui.status === 'loading' ? 'Loading…' : 'Load Screenshots';
            const spinner = ui.status === 'loading' ? this._loadingSpinnerHtml(14) + ' ' : '';
            buttonHtml = `<button type="button" class="${btnClass}" data-wf-dash-load-screenshots="1" data-screenshot-kind="${escKind}" data-screenshot-id="${escId}" data-item-id="${escItemId}"${disabled}>${spinner}${dashEscHtml(label)}</button>`;
        }

        let galleryHtml = '';
        if (ui.status === 'loaded' && ui.urls && ui.urls.length) {
            galleryHtml = `<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: ${buttonHtml ? '8px' : '0'};">`
                + ui.urls.map((url, i) => {
                    const escUrl = dashEscHtml(url);
                    return `<button type="button" data-wf-dash-screenshot-thumb="1" data-screenshot-url="${escUrl}" title="View screenshot ${i + 1}" style="padding: 0; border: none; background: none; cursor: pointer;">`
                        + `<img src="${escUrl}" alt="Screenshot ${i + 1}" loading="lazy" style="max-height: 120px; max-width: 180px; object-fit: contain; border-radius: 4px; border: 1px solid var(--border, #e2e8f0); display: block;">`
                        + '</button>';
                }).join('')
                + '</div>';
        }

        let errorHtml = '';
        if (ui.status === 'error' && ui.message) {
            errorHtml = `<p style="margin: 6px 0 0; font-size: 11px; color: #b91c1c;">${dashEscHtml(ui.message)}</p>`;
        }

        return `<div data-wf-dash-screenshots="${escKey}" data-item-id="${escItemId}" style="margin-top: 8px;">${buttonHtml}${galleryHtml}${errorHtml}</div>`;
    },

    _patchScreenshotBlock(kind, entityId, itemId, screenshotKeys) {
        if (!this._modal) return false;
        const uiKey = this._screenshotUiKey(kind, entityId);
        for (const el of this._modal.querySelectorAll('[data-wf-dash-screenshots]')) {
            if (el.getAttribute('data-wf-dash-screenshots') !== uiKey) continue;
            const newHtml = this._screenshotBlockHtml(kind, entityId, itemId, screenshotKeys);
            const tmp = document.createElement('div');
            tmp.innerHTML = newHtml;
            const newEl = tmp.firstElementChild;
            if (newEl) el.replaceWith(newEl);
            return true;
        }
        return false;
    },

    _closeScreenshotLightbox() {
        if (this._screenshotLightboxEl && this._screenshotLightboxEl.parentNode) {
            this._screenshotLightboxEl.parentNode.removeChild(this._screenshotLightboxEl);
        }
        this._screenshotLightboxEl = null;
        if (this._screenshotLightboxKeyHandler) {
            document.removeEventListener('keydown', this._screenshotLightboxKeyHandler);
            this._screenshotLightboxKeyHandler = null;
        }
    },

    _openScreenshotLightbox(url, alt) {
        this._closeScreenshotLightbox();
        const modal = this._modal;
        const imageUrl = String(url || '').trim();
        if (!modal || !imageUrl) return;
        const overlay = document.createElement('div');
        overlay.setAttribute('data-wf-dash-screenshot-lightbox', '1');
        overlay.style.cssText = 'position: fixed; inset: 0; z-index: 100000; background: rgba(0, 0, 0, 0.85); display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box;';
        const escUrl = dashEscHtml(imageUrl);
        const escAlt = dashEscHtml(String(alt || 'Screenshot'));
        overlay.innerHTML = `<button type="button" data-wf-dash-screenshot-lightbox-close="1" aria-label="Close" style="position: absolute; top: 16px; right: 16px; padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.35); background: rgba(0,0,0,0.45); color: #fff; font-size: 12px; cursor: pointer;">Close</button>`
            + `<img src="${escUrl}" alt="${escAlt}" style="max-width: 95vw; max-height: 90vh; object-fit: contain; border-radius: 4px;">`;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.closest('[data-wf-dash-screenshot-lightbox-close]')) {
                this._closeScreenshotLightbox();
            }
        });
        this._screenshotLightboxKeyHandler = (e) => {
            if (e.key === 'Escape') this._closeScreenshotLightbox();
        };
        document.addEventListener('keydown', this._screenshotLightboxKeyHandler);
        modal.appendChild(overlay);
        this._screenshotLightboxEl = overlay;
    },

    async _handleLoadScreenshots(kind, entityId, itemId) {
        const uiKey = this._screenshotUiKey(kind, entityId);
        const ui = this._getScreenshotUi(uiKey);
        if (ui.status === 'loading' || ui.status === 'loaded') return;

        const keys = this._findScreenshotKeys(kind, entityId, itemId);
        if (keys.length === 0) {
            Logger.warn('search-output: load screenshots skipped — no keys for ' + uiKey);
            return;
        }
        const item = this._findCachedItem(itemId) || this._findResultItem(itemId);
        const taskId = item && item.task && item.task.id;
        if (!taskId) {
            Logger.warn('search-output: load screenshots skipped — no task id for ' + uiKey);
            return;
        }

        this._logDashApiClick('load-screenshots', uiKey);
        ui.status = 'loading';
        ui.message = null;
        if (!this._patchScreenshotBlock(kind, entityId, itemId, keys)) this._patchTaskCard(itemId);

        try {
            const urls = await this._fetchScreenshotViewUrls(taskId, keys);
            ui.urls = urls;
            ui.status = 'loaded';
            ui.message = null;
            Logger.log('search-output: loaded ' + urls.length + ' screenshot(s) — ' + uiKey);
        } catch (err) {
            ui.status = 'error';
            ui.urls = [];
            ui.message = this._isDashSessionRefreshError(err)
                ? 'Session expired — refresh Fleet and unlock Ops, then reload.'
                : 'Could not load screenshots.';
            Logger.warn('search-output: screenshot load failed — ' + uiKey, err);
        }
        if (!this._patchScreenshotBlock(kind, entityId, itemId, keys)) this._patchTaskCard(itemId);
    },

    _userStoryEmptyMessage(reason) {
        if (reason === 'no_scenario_id') return 'No scenario linked to this task.';
        if (reason === 'scenario_not_found') return 'Scenario not found.';
        if (reason === 'task_not_found') return 'Task not found.';
        return 'No user story for this task.';
    },

    _userStoryHasContent(ui) {
        return ['scenarioTitle', 'humanAnnotatorInstructions', 'userStory']
            .some((key) => ui[key] != null && String(ui[key]).trim().length > 0);
    },

    _userStoryIsAbsent(ui) {
        return (ui.status === 'loaded' || ui.status === 'error') && !this._userStoryHasContent(ui);
    },

    _userStoryEmptyHtml(ui) {
        const text = ui.message || 'No user story for this task.';
        return `<p class="wf-dash-user-story-empty">${dashEscHtml(text)}</p>`;
    },

    _userStoryPanelBodyHtml(ui) {
        const fields = [
            { key: 'scenarioTitle', label: 'Scenario Title' },
            { key: 'humanAnnotatorInstructions', label: 'Annotator Instructions' },
            { key: 'userStory', label: 'User Story' }
        ];
        const parts = [];
        for (const { key, label } of fields) {
            const text = this._dashQuotedText(ui[key]);
            if (!text) continue;
            parts.push(this._quotedFieldBlockHtml(label, dashEscHtml(text), text, {
                shellClass: 'wf-dash-user-story-field',
                headerClass: 'wf-dash-user-story-field-header',
                bodyClass: 'wf-dash-user-story-field-body'
            }));
        }
        if (parts.length === 0) {
            return this._userStoryEmptyHtml(ui);
        }
        return '<div class="wf-dash-user-story-block">' + parts.join('') + '</div>';
    },

    _userStoryBtnLabel(ui) {
        if (ui.status === 'loading') return 'Fetching user story…';
        if (ui.status === 'loaded' || ui.status === 'error') {
            return ui.visible ? 'Hide User Story' : 'Show User Story';
        }
        return 'Fetch User Story';
    },

    _sessionQaHasReviews(ui) {
        return Array.isArray(ui.reviews) && ui.reviews.length > 0;
    },

    _sessionQaBtnLabel(ui) {
        if (ui.status === 'loading') return 'Fetching Session QA…';
        if (this._sessionQaHasReviews(ui) && (ui.status === 'loaded' || ui.status === 'error')) {
            return ui.visible ? 'Hide Session QA' : 'Show Session QA';
        }
        return 'Fetch Session QA';
    },

    _sessionQaInlineMessageHtml(ui) {
        const text = ui && ui.message ? String(ui.message).trim() : '';
        if (!text) return '';
        return `<span class="wf-dash-session-qa-inline-msg" data-wf-dash-session-qa-message="1">${dashEscHtml(text)}</span>`;
    },

    _verifierOutputHasExecutions(ui) {
        return Array.isArray(ui.executions) && ui.executions.length > 0;
    },

    _verifierOutputBtnLabel(ui) {
        if (ui.status === 'loading') return 'Fetching Verifier Output…';
        if (this._verifierOutputHasExecutions(ui) && (ui.status === 'loaded' || ui.status === 'error')) {
            return ui.visible ? 'Hide Verifier Output' : 'Show Verifier Output';
        }
        return 'Fetch Verifier Output';
    },

    _verifierOutputInlineMessageHtml(ui) {
        const text = ui && ui.message ? String(ui.message).trim() : '';
        if (!text) return '';
        return `<span class="wf-dash-verifier-output-inline-msg" data-wf-dash-verifier-output-message="1">${dashEscHtml(text)}</span>`;
    },

    _userStoryControlsHtml(itemId) {
        const ui = this._getUserStoryUi(itemId);
        if (this._userStoryIsAbsent(ui)) {
            return `<div data-wf-dash-user-story-controls="1" data-wf-dash-user-story-absent="1">${this._userStoryEmptyHtml(ui)}</div>`;
        }
        const btnLabel = this._userStoryBtnLabel(ui);
        const btnDisabled = ui.status === 'loading';
        return `<div data-wf-dash-user-story-controls="1">`
            + `<button type="button" class="wf-dash-user-story-btn ${this._dashBtnClass('basic', 'nav')}" data-wf-dash-user-story="1" data-item-id="${dashEscHtml(itemId)}"${btnDisabled ? ' disabled aria-busy="true"' : ''}>${dashEscHtml(btnLabel)}</button>`
            + `</div>`;
    },

    _sessionQaControlsHtml(itemId) {
        const ui = this._getSessionQaUi(itemId);
        const btnLabel = this._sessionQaBtnLabel(ui);
        const btnDisabled = ui.status === 'loading';
        return `<div data-wf-dash-session-qa-controls="1" style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px;">`
            + `<button type="button" class="wf-dash-session-qa-btn ${this._dashBtnClass('basic', 'nav')}" data-wf-dash-session-qa="1" data-item-id="${dashEscHtml(itemId)}"${btnDisabled ? ' disabled aria-busy="true"' : ''}>${dashEscHtml(btnLabel)}</button>`
            + this._sessionQaInlineMessageHtml(ui)
            + `</div>`;
    },

    _verifierOutputControlsHtml(itemId) {
        const ui = this._getVerifierOutputUi(itemId);
        const btnLabel = this._verifierOutputBtnLabel(ui);
        const btnDisabled = ui.status === 'loading';
        return `<div data-wf-dash-verifier-output-controls="1" style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px;">`
            + `<button type="button" class="wf-dash-verifier-output-btn ${this._dashBtnClass('basic', 'nav')}" data-wf-dash-verifier-output="1" data-item-id="${dashEscHtml(itemId)}"${btnDisabled ? ' disabled aria-busy="true"' : ''}>${dashEscHtml(btnLabel)}</button>`
            + this._verifierOutputInlineMessageHtml(ui)
            + `</div>`;
    },

    _userStoryPanelHtml(itemId) {
        const ui = this._getUserStoryUi(itemId);
        const hasPanel = this._userStoryHasContent(ui) && (ui.status === 'loaded' || ui.status === 'error');
        if (!hasPanel) return '';
        const panelOpen = ui.visible && !ui.animateOpen;
        return `<div data-wf-dash-user-story-panel data-open="${panelOpen ? '1' : '0'}" aria-hidden="${panelOpen ? 'false' : 'true'}">`
            + `<div data-wf-dash-user-story-inner">${this._userStoryPanelBodyHtml(ui)}</div>`
            + '</div>';
    },

    _verifierOutputPanelHtml(itemId) {
        const ui = this._getVerifierOutputUi(itemId);
        const hasPanel = this._verifierOutputHasExecutions(ui) && (ui.status === 'loaded' || ui.status === 'error');
        if (!hasPanel) return '';
        const panelOpen = ui.visible && !ui.animateOpen;
        return `<div data-wf-dash-verifier-output-panel data-open="${panelOpen ? '1' : '0'}" aria-hidden="${panelOpen ? 'false' : 'true'}">`
            + `<div data-wf-dash-verifier-output-inner">${this._verifierOutputPanelBodyHtml(itemId, ui)}</div>`
            + '</div>';
    },

    _sessionQaPanelHtml(itemId) {
        const ui = this._getSessionQaUi(itemId);
        const hasPanel = this._sessionQaHasReviews(ui) && (ui.status === 'loaded' || ui.status === 'error');
        if (!hasPanel) return '';
        const panelOpen = ui.visible && !ui.animateOpen;
        return `<div data-wf-dash-session-qa-panel data-open="${panelOpen ? '1' : '0'}" aria-hidden="${panelOpen ? 'false' : 'true'}">`
            + `<div data-wf-dash-session-qa-inner">${this._sessionQaPanelBodyHtml(itemId, ui)}</div>`
            + '</div>';
    },

    _supplementalSectionHtml(itemId) {
        return `
            <div style="padding: 8px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;" data-wf-dash-supplemental-section data-wf-dash-user-story-section data-item-id="${dashEscHtml(itemId)}">
                <div data-wf-dash-supplemental-controls style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
                    ${this._userStoryControlsHtml(itemId)}
                    ${this._sessionQaControlsHtml(itemId)}
                    ${this._verifierOutputControlsHtml(itemId)}
                </div>
                ${this._userStoryPanelHtml(itemId)}
                ${this._verifierOutputPanelHtml(itemId)}
                ${this._sessionQaPanelHtml(itemId)}
            </div>`;
    },

    _findSupplementalSection(itemId) {
        const wrap = this._q('#wf-dash-results');
        if (!wrap || !itemId) return null;
        for (const card of wrap.querySelectorAll('[data-wf-dash-task-card]')) {
            if (card.getAttribute('data-item-id') !== itemId) continue;
            return card.querySelector('[data-wf-dash-supplemental-section]');
        }
        return null;
    },

    _findUserStorySection(itemId) {
        return this._findSupplementalSection(itemId);
    },

    _animateSupplementalPanelOpen(itemId, panelSelector, getVisible) {
        if (!getVisible()) return;
        const section = this._findSupplementalSection(itemId);
        const panel = section ? section.querySelector(panelSelector) : null;
        if (!panel) return;
        panel.setAttribute('data-open', '0');
        panel.setAttribute('aria-hidden', 'true');
        const win = this._pageWindow();
        win.requestAnimationFrame(() => {
            if (!getVisible()) return;
            win.requestAnimationFrame(() => {
                if (!getVisible()) return;
                panel.setAttribute('data-open', '1');
                panel.setAttribute('aria-hidden', 'false');
            });
        });
    },

    _animateUserStoryOpen(itemId) {
        this._animateSupplementalPanelOpen(
            itemId,
            '[data-wf-dash-user-story-panel]',
            () => this._getUserStoryUi(itemId).visible
        );
    },

    _animateSessionQaOpen(itemId) {
        this._animateSupplementalPanelOpen(
            itemId,
            '[data-wf-dash-session-qa-panel]',
            () => this._getSessionQaUi(itemId).visible
        );
    },

    _animateVerifierOutputOpen(itemId) {
        this._animateSupplementalPanelOpen(
            itemId,
            '[data-wf-dash-verifier-output-panel]',
            () => this._getVerifierOutputUi(itemId).visible
        );
    },

    _syncSupplementalPanelOpen(itemId, panelSelector, visible) {
        const section = this._findSupplementalSection(itemId);
        const panel = section ? section.querySelector(panelSelector) : null;
        if (!panel) return;
        panel.setAttribute('data-open', visible ? '1' : '0');
        panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
    },

    _syncUserStoryPanelOpen(itemId, visible) {
        this._syncSupplementalPanelOpen(itemId, '[data-wf-dash-user-story-panel]', visible);
    },

    _syncSessionQaPanelOpen(itemId, visible) {
        this._syncSupplementalPanelOpen(itemId, '[data-wf-dash-session-qa-panel]', visible);
    },

    _syncVerifierOutputPanelOpen(itemId, visible) {
        this._syncSupplementalPanelOpen(itemId, '[data-wf-dash-verifier-output-panel]', visible);
    },

    _patchUserStoryVisibility(itemId) {
        this._ensureUserStoryStyles();
        const section = this._findSupplementalSection(itemId);
        if (!section) return false;
        const ui = this._getUserStoryUi(itemId);
        const btn = section.querySelector('[data-wf-dash-user-story]');
        if (btn) btn.textContent = this._userStoryBtnLabel(ui);
        this._syncUserStoryPanelOpen(itemId, ui.visible);
        return true;
    },

    _patchSessionQaVisibility(itemId) {
        this._ensureUserStoryStyles();
        const section = this._findSupplementalSection(itemId);
        if (!section) return false;
        const ui = this._getSessionQaUi(itemId);
        const btn = section.querySelector('[data-wf-dash-session-qa]');
        if (btn) btn.textContent = this._sessionQaBtnLabel(ui);
        this._syncSessionQaPanelOpen(itemId, ui.visible);
        return true;
    },

    _patchVerifierOutputVisibility(itemId) {
        this._ensureUserStoryStyles();
        const section = this._findSupplementalSection(itemId);
        if (!section) return false;
        const ui = this._getVerifierOutputUi(itemId);
        const btn = section.querySelector('[data-wf-dash-verifier-output]');
        if (btn) btn.textContent = this._verifierOutputBtnLabel(ui);
        this._syncVerifierOutputPanelOpen(itemId, ui.visible);
        return true;
    },

    _patchUserStoryControls(section, itemId) {
        const ui = this._getUserStoryUi(itemId);
        let controls = section.querySelector('[data-wf-dash-user-story-controls]');
        const controlsParent = section.querySelector('[data-wf-dash-supplemental-controls]');
        if (!controlsParent) return;
        if (!controls) {
            controlsParent.insertAdjacentHTML('afterbegin', this._userStoryControlsHtml(itemId));
            return;
        }
        if (this._userStoryIsAbsent(ui)) {
            controls.setAttribute('data-wf-dash-user-story-absent', '1');
            controls.innerHTML = this._userStoryEmptyHtml(ui);
            return;
        }
        controls.removeAttribute('data-wf-dash-user-story-absent');
        let btn = controls.querySelector('[data-wf-dash-user-story]');
        if (!btn) {
            controls.innerHTML = `<button type="button" class="wf-dash-user-story-btn ${this._dashBtnClass('basic', 'nav')}" data-wf-dash-user-story="1" data-item-id="${dashEscHtml(itemId)}"></button>`;
            btn = controls.querySelector('[data-wf-dash-user-story]');
        }
        if (!btn) return;
        btn.textContent = this._userStoryBtnLabel(ui);
        if (ui.status === 'loading') {
            btn.disabled = true;
            btn.setAttribute('aria-busy', 'true');
        } else {
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
        }
    },

    _patchSessionQaControls(section, itemId) {
        const ui = this._getSessionQaUi(itemId);
        let controls = section.querySelector('[data-wf-dash-session-qa-controls]');
        const controlsParent = section.querySelector('[data-wf-dash-supplemental-controls]');
        if (!controlsParent) return;
        if (!controls) {
            controlsParent.insertAdjacentHTML('beforeend', this._sessionQaControlsHtml(itemId));
            controls = section.querySelector('[data-wf-dash-session-qa-controls]');
        }
        if (!controls) return;
        let btn = controls.querySelector('[data-wf-dash-session-qa]');
        if (!btn) {
            controls.innerHTML = `<button type="button" class="wf-dash-session-qa-btn ${this._dashBtnClass('basic', 'nav')}" data-wf-dash-session-qa="1" data-item-id="${dashEscHtml(itemId)}"></button>`;
            btn = controls.querySelector('[data-wf-dash-session-qa]');
        }
        if (btn) {
            btn.textContent = this._sessionQaBtnLabel(ui);
            if (ui.status === 'loading') {
                btn.disabled = true;
                btn.setAttribute('aria-busy', 'true');
            } else {
                btn.disabled = false;
                btn.removeAttribute('aria-busy');
            }
        }
        let msg = controls.querySelector('[data-wf-dash-session-qa-message]');
        const msgHtml = this._sessionQaInlineMessageHtml(ui);
        if (!msgHtml) {
            if (msg) msg.remove();
            return;
        }
        if (!msg) {
            controls.insertAdjacentHTML('beforeend', msgHtml);
        } else {
            msg.textContent = String(ui.message || '').trim();
        }
    },

    _patchVerifierOutputControls(section, itemId) {
        const ui = this._getVerifierOutputUi(itemId);
        let controls = section.querySelector('[data-wf-dash-verifier-output-controls]');
        const controlsParent = section.querySelector('[data-wf-dash-supplemental-controls]');
        if (!controlsParent) return;
        if (!controls) {
            controlsParent.insertAdjacentHTML('beforeend', this._verifierOutputControlsHtml(itemId));
            controls = section.querySelector('[data-wf-dash-verifier-output-controls]');
        }
        if (!controls) return;
        let btn = controls.querySelector('[data-wf-dash-verifier-output]');
        if (!btn) {
            controls.innerHTML = `<button type="button" class="wf-dash-verifier-output-btn ${this._dashBtnClass('basic', 'nav')}" data-wf-dash-verifier-output="1" data-item-id="${dashEscHtml(itemId)}"></button>`;
            btn = controls.querySelector('[data-wf-dash-verifier-output]');
        }
        if (btn) {
            btn.textContent = this._verifierOutputBtnLabel(ui);
            if (ui.status === 'loading') {
                btn.disabled = true;
                btn.setAttribute('aria-busy', 'true');
            } else {
                btn.disabled = false;
                btn.removeAttribute('aria-busy');
            }
        }
        let msg = controls.querySelector('[data-wf-dash-verifier-output-message]');
        const msgHtml = this._verifierOutputInlineMessageHtml(ui);
        if (!msgHtml) {
            if (msg) msg.remove();
            return;
        }
        if (!msg) {
            controls.insertAdjacentHTML('beforeend', msgHtml);
        } else {
            msg.textContent = String(ui.message || '').trim();
        }
    },

    _patchUserStoryPanel(section, itemId) {
        const ui = this._getUserStoryUi(itemId);
        const hasPanel = this._userStoryHasContent(ui) && (ui.status === 'loaded' || ui.status === 'error');
        let panel = section.querySelector('[data-wf-dash-user-story-panel]');
        if (!hasPanel) {
            if (panel) panel.remove();
            return;
        }
        const bodyHtml = this._userStoryPanelBodyHtml(ui);
        if (!panel) {
            const verifierPanel = section.querySelector('[data-wf-dash-verifier-output-panel]');
            const sessionPanel = section.querySelector('[data-wf-dash-session-qa-panel]');
            const insertBefore = verifierPanel || sessionPanel;
            const panelMarkup = `<div data-wf-dash-user-story-panel data-open="0" aria-hidden="true">`
                + `<div data-wf-dash-user-story-inner">${bodyHtml}</div>`
                + '</div>';
            if (insertBefore) insertBefore.insertAdjacentHTML('beforebegin', panelMarkup);
            else section.insertAdjacentHTML('beforeend', panelMarkup);
            panel = section.querySelector('[data-wf-dash-user-story-panel]');
        } else {
            const inner = panel.querySelector('[data-wf-dash-user-story-inner]');
            if (inner) inner.innerHTML = bodyHtml;
        }
        if (panel) this._syncUserStoryPanelOpen(itemId, ui.visible);
    },

    _patchVerifierOutputPanel(section, itemId) {
        const ui = this._getVerifierOutputUi(itemId);
        const hasPanel = this._verifierOutputHasExecutions(ui) && (ui.status === 'loaded' || ui.status === 'error');
        let panel = section.querySelector('[data-wf-dash-verifier-output-panel]');
        if (!hasPanel) {
            if (panel) panel.remove();
            return;
        }
        const bodyHtml = this._verifierOutputPanelBodyHtml(itemId, ui);
        if (!panel) {
            const sessionPanel = section.querySelector('[data-wf-dash-session-qa-panel]');
            const panelMarkup = `<div data-wf-dash-verifier-output-panel data-open="0" aria-hidden="true">`
                + `<div data-wf-dash-verifier-output-inner">${bodyHtml}</div>`
                + '</div>';
            if (sessionPanel) sessionPanel.insertAdjacentHTML('beforebegin', panelMarkup);
            else section.insertAdjacentHTML('beforeend', panelMarkup);
            panel = section.querySelector('[data-wf-dash-verifier-output-panel]');
        } else {
            const inner = panel.querySelector('[data-wf-dash-verifier-output-inner]');
            if (inner) inner.innerHTML = bodyHtml;
        }
        if (panel) this._syncVerifierOutputPanelOpen(itemId, ui.visible);
    },

    _patchSessionQaPanel(section, itemId) {
        const ui = this._getSessionQaUi(itemId);
        const hasPanel = this._sessionQaHasReviews(ui) && (ui.status === 'loaded' || ui.status === 'error');
        let panel = section.querySelector('[data-wf-dash-session-qa-panel]');
        if (!hasPanel) {
            if (panel) panel.remove();
            return;
        }
        const bodyHtml = this._sessionQaPanelBodyHtml(itemId, ui);
        if (!panel) {
            section.insertAdjacentHTML('beforeend',
                `<div data-wf-dash-session-qa-panel data-open="0" aria-hidden="true">`
                + `<div data-wf-dash-session-qa-inner">${bodyHtml}</div>`
                + '</div>');
            panel = section.querySelector('[data-wf-dash-session-qa-panel]');
        } else {
            const inner = panel.querySelector('[data-wf-dash-session-qa-inner]');
            if (inner) inner.innerHTML = bodyHtml;
        }
        if (panel) this._syncSessionQaPanelOpen(itemId, ui.visible);
    },

    _patchUserStorySection(itemId) {
        this._ensureUserStoryStyles();
        const section = this._findSupplementalSection(itemId);
        if (!section) return false;
        this._patchUserStoryControls(section, itemId);
        this._patchUserStoryPanel(section, itemId);
        return true;
    },

    _patchSessionQaSection(itemId) {
        this._ensureUserStoryStyles();
        const section = this._findSupplementalSection(itemId);
        if (!section) return false;
        this._patchSessionQaControls(section, itemId);
        this._patchSessionQaPanel(section, itemId);
        return true;
    },

    _patchVerifierOutputSection(itemId) {
        this._ensureUserStoryStyles();
        const section = this._findSupplementalSection(itemId);
        if (!section) return false;
        this._patchVerifierOutputControls(section, itemId);
        this._patchVerifierOutputPanel(section, itemId);
        return true;
    },

    _sessionQaVerdictMeta(verdict) {
        const key = String(verdict || '').trim().toLowerCase();
        if (key === 'pass') {
            return {
                label: 'Pass',
                badgeStyle: this._qaAcceptedBadgeStyle(),
                blockStyle: this._qaAcceptedBlockStyle()
            };
        }
        if (key === 'fail') {
            return {
                label: 'Fail',
                badgeStyle: this._qaReturnedBadgeStyle(),
                blockStyle: this._qaReturnedBlockStyle()
            };
        }
        return {
            label: key === 'review_needed' ? 'Review Needed' : (String(verdict || '').trim() || 'Unknown'),
            badgeStyle: this._qaAlertBadgeStyle(),
            blockStyle: this._qaOtherBlockStyle()
        };
    },

    _sessionQaReviewBlockHtml(review, itemId) {
        if (!review || !review.id) return '';
        const meta = this._sessionQaVerdictMeta(review.verdict);
        const border = meta.blockStyle.border;
        const bg = meta.blockStyle.background;
        const statusLabel = `<span style="${meta.badgeStyle}">${dashEscHtml(meta.label)}</span>`;
        const submittedHtml = review.createdAt
            ? dashTimestampWithDurationHtml(review.createdAt, null)
            : '';
        const difficulty = review.difficulty != null ? String(review.difficulty).trim() : '';
        const difficultyHtml = difficulty
            ? `<div style="display: inline-flex; align-items: center; gap: 6px;">${this._labelSpan('Difficulty')}<span style="${this._qaAlertIssueBadgeStyle()}">${dashEscHtml(difficulty)}</span></div>`
            : '';
        const reviewerName = review.reviewerName || (review.reviewerId ? String(review.reviewerId).slice(0, 8) + '…' : '');
        const reviewerHtml = review.reviewerId
            ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">${this._personChipsHtml(reviewerName, review.reviewerEmail || '', review.reviewerId, 'Open reviewer in Fleet', 'qa')}</div>`
            : '';
        const sessionUrl = dashFleetQaSessionUrl(review.sessionId);
        const sessionLink = sessionUrl
            ? `<div style="display: inline-flex; align-items: center; gap: 6px;">${this._labelSpan('Session')}${this._extLinkHtml(sessionUrl, 'Open QA session in Fleet')}</div>`
            : '';
        const notesText = this._dashQuotedText(review.notes);
        const notesHtml = notesText
            ? `<div>
                <div style="display: flex; align-items: center; gap: 6px;">${this._labelSpan('Notes')}${this._copyIconHtml(notesText)}</div>
                <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${dashEscHtml(notesText)}</p>
            </div>`
            : '';
        const blockId = 'session-qa:' + review.id;
        const leftHeader = `<span style="font-weight: 600; color: var(--foreground, #0f172a);">Session QA</span>`
            + submittedHtml
            + difficultyHtml
            + sessionLink;
        const headerRow = this._actionBlockHeaderRowHtml(blockId, leftHeader, statusLabel);
        const bodyHtml = reviewerHtml + notesHtml;
        return this._actionBlockShellHtml(
            blockId,
            itemId,
            'margin-top: 12px; padding: 10px 12px; border: ' + border + '; border-radius: 8px; background: ' + bg + '; display: flex; flex-direction: column; gap: 8px;',
            headerRow,
            bodyHtml
        );
    },

    _sessionQaPanelBodyHtml(itemId, ui) {
        const reviews = Array.isArray(ui.reviews) ? ui.reviews : [];
        if (reviews.length === 0) return '';
        return '<div class="wf-dash-session-qa-block">'
            + reviews.map((review) => this._sessionQaReviewBlockHtml(review, itemId)).join('')
            + '</div>';
    },

    _formatVerifierStdoutText(raw) {
        const lib = typeof dashLib === 'function' ? dashLib() : (Context.dashboardLib || null);
        if (lib && typeof lib.formatVerifierStdout === 'function') {
            return lib.formatVerifierStdout(raw);
        }
        return String(raw || '');
    },

    _verifierOutputBlockHtml(execution, itemId) {
        if (!execution || !execution.id) return '';
        // Pass/fail is the numeric score (1 / 1.0). `success` only means the verifier process ran.
        const passed = Number(execution.score) === 1;
        const blockStyle = passed ? this._qaAcceptedBlockStyle() : this._qaReturnedBlockStyle();
        const badgeStyle = passed ? this._qaAcceptedBadgeStyle() : this._qaReturnedBadgeStyle();
        const statusLabel = `<span style="${badgeStyle}">${passed ? 'Pass' : 'Fail'}</span>`;
        const submittedHtml = execution.createdAt
            ? dashTimestampWithDurationHtml(execution.createdAt, null)
            : '';
        const scoreText = execution.score != null && execution.score !== ''
            ? String(execution.score)
            : '';
        const scoreHtml = scoreText
            ? `<div style="display: inline-flex; align-items: center; gap: 6px;">${this._labelSpan('Score')}<span>${dashEscHtml(scoreText)}</span></div>`
            : '';
        const timingText = execution.executionTimeMs != null && Number.isFinite(Number(execution.executionTimeMs))
            ? String(Math.round(Number(execution.executionTimeMs))) + ' ms'
            : '';
        const timingHtml = timingText
            ? `<div style="display: inline-flex; align-items: center; gap: 6px;">${this._labelSpan('Time')}<span>${dashEscHtml(timingText)}</span></div>`
            : '';
        const sessionUrl = dashFleetQaSessionUrl(execution.sessionId);
        const sessionLink = sessionUrl
            ? `<div style="display: inline-flex; align-items: center; gap: 6px;">${this._labelSpan('Session')}${this._extLinkHtml(sessionUrl, 'Open session in Fleet')}</div>`
            : '';
        const formatted = this._formatVerifierStdoutText(execution.stdout);
        const stdoutHtml = formatted
            ? `<div>
                <div style="display: flex; align-items: center; gap: 6px;">${this._labelSpan('Stdout')}${this._copyIconHtml(formatted)}</div>
                <pre style="margin: 4px 0 0 0; padding: 8px 10px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.45; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: var(--foreground, #0f172a);">${dashEscHtml(formatted)}</pre>
            </div>`
            : '';
        const blockId = 'verifier-output:' + execution.id;
        this._ensureActionBlockCollapseDefault(blockId, true);
        const leftHeader = `<span style="font-weight: 600; color: var(--foreground, #0f172a);">Verifier Output</span>`
            + submittedHtml
            + scoreHtml
            + timingHtml
            + sessionLink;
        const headerRow = this._actionBlockHeaderRowHtml(blockId, leftHeader, statusLabel);
        const bodyHtml = stdoutHtml;
        return this._actionBlockShellHtml(
            blockId,
            itemId,
            'margin-top: 12px; padding: 10px 12px; border: ' + blockStyle.border + '; border-radius: 8px; background: ' + blockStyle.background + '; display: flex; flex-direction: column; gap: 8px;',
            headerRow,
            bodyHtml
        );
    },

    _verifierOutputPanelBodyHtml(itemId, ui) {
        const executions = Array.isArray(ui.executions) ? ui.executions : [];
        if (executions.length === 0) return '';
        return '<div class="wf-dash-verifier-output-block">'
            + executions.map((execution) => this._verifierOutputBlockHtml(execution, itemId)).join('')
            + '</div>';
    },

    _normalizeVerifierExecutionId(value) {
        if (value == null) return '';
        if (typeof value === 'object') {
            if (value.id != null) return String(value.id).trim();
            return '';
        }
        return String(value).trim();
    },

    async _fetchVerifierOutputsForTask(taskId) {
        const id = String(taskId || '').trim();
        if (!id) {
            return { executions: [], message: 'No sessions found for this task.', reason: 'missing_task_id' };
        }
        const sessionRows = await this._pgQuery('sessions.select_slim', {
            eval_task: 'eq.' + id,
            order: 'created_at.desc',
            limit: '1000'
        }, 'ondemand');
        const sessions = Array.isArray(sessionRows) ? sessionRows : [];
        if (sessions.length === 0) {
            return { executions: [], message: 'No sessions found for this task.', reason: 'no_sessions' };
        }

        const execIds = [];
        const sessionByExecId = new Map();
        const instanceFallbacks = [];
        for (const row of sessions) {
            const sessionId = row && row.id != null ? String(row.id).trim() : '';
            const execId = this._normalizeVerifierExecutionId(row && row.verifier_execution);
            if (execId && DASH_UUID_RE.test(execId)) {
                if (!sessionByExecId.has(execId)) {
                    execIds.push(execId);
                    sessionByExecId.set(execId, sessionId);
                }
                continue;
            }
            const instance = row && row.instance != null ? String(row.instance).trim() : '';
            if (instance) {
                instanceFallbacks.push({ sessionId, instance });
            }
        }

        const byId = new Map();
        for (const chunk of dashPgInChunks(execIds)) {
            const rows = await this._pgQuery('verifier_executions.select_output', {
                id: dashPgInFilter(chunk),
                order: 'created_at.desc',
                limit: '1000'
            }, 'ondemand');
            for (const row of (Array.isArray(rows) ? rows : [])) {
                const rid = row && row.id != null ? String(row.id).trim() : '';
                if (!rid || byId.has(rid)) continue;
                byId.set(rid, {
                    id: rid,
                    sessionId: sessionByExecId.get(rid) || '',
                    createdAt: row.created_at != null ? String(row.created_at) : '',
                    score: row.score,
                    success: row.success === true,
                    stdout: row.stdout != null ? String(row.stdout) : '',
                    executionTimeMs: row.execution_time_ms,
                    verifierId: row.verifier_id != null ? String(row.verifier_id) : ''
                });
            }
        }

        for (const fb of instanceFallbacks) {
            const rows = await this._pgQuery('verifier_executions.select_output', {
                environment_id: 'eq.' + fb.instance,
                order: 'created_at.desc',
                limit: '1'
            }, 'ondemand');
            const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
            if (!row) continue;
            const rid = row.id != null ? String(row.id).trim() : '';
            if (!rid || byId.has(rid)) continue;
            byId.set(rid, {
                id: rid,
                sessionId: fb.sessionId || '',
                createdAt: row.created_at != null ? String(row.created_at) : '',
                score: row.score,
                success: row.success === true,
                stdout: row.stdout != null ? String(row.stdout) : '',
                executionTimeMs: row.execution_time_ms,
                verifierId: row.verifier_id != null ? String(row.verifier_id) : ''
            });
        }

        const executions = [...byId.values()];
        executions.sort((a, b) => {
            const aTs = Date.parse(a.createdAt || '') || 0;
            const bTs = Date.parse(b.createdAt || '') || 0;
            if (bTs !== aTs) return bTs - aTs;
            return String(b.id).localeCompare(String(a.id));
        });

        if (executions.length === 0) {
            return {
                executions: [],
                message: 'No verifier runs found for this task.',
                reason: 'no_executions'
            };
        }
        return { executions, message: null, reason: null };
    },

    async _fetchSessionQaReviewsForTask(taskId) {
        const id = String(taskId || '').trim();
        if (!id) {
            return { reviews: [], message: 'No sessions found for this task.', reason: 'missing_task_id' };
        }
        const sessionRows = await this._pgQuery('sessions.select_slim', {
            eval_task: 'eq.' + id,
            order: 'created_at.desc',
            limit: '1000'
        }, 'ondemand');
        const sessions = Array.isArray(sessionRows) ? sessionRows : [];
        const sessionIds = [...new Set(sessions.map((row) => row && row.id).filter(Boolean).map(String))];
        if (sessionIds.length === 0) {
            return { reviews: [], message: 'No sessions found for this task.', reason: 'no_sessions' };
        }

        const reviewRows = [];
        for (const chunk of dashPgInChunks(sessionIds)) {
            const rows = await this._pgQuery('qa_session_results.select_slim', {
                session_id: dashPgInFilter(chunk),
                order: 'created_at.desc',
                limit: '1000'
            }, 'ondemand');
            reviewRows.push(...(Array.isArray(rows) ? rows : []));
        }
        if (reviewRows.length === 0) {
            return {
                reviews: [],
                message: 'No Session QA reviews found for this task.',
                reason: 'no_reviews'
            };
        }

        const reviewerIds = [...new Set(reviewRows.map((row) => row && row.reviewer_id).filter(Boolean).map(String))];
        const profileRows = reviewerIds.length > 0
            ? await this._fetchProfilesByIds(reviewerIds, 'ondemand')
            : [];
        const profilesMap = this._buildProfilesMap(profileRows);

        const reviews = reviewRows.map((row) => {
            const reviewerId = row.reviewer_id != null ? String(row.reviewer_id).trim() : '';
            const profile = reviewerId ? profilesMap.get(reviewerId) : null;
            return {
                id: String(row.id || ''),
                sessionId: row.session_id != null ? String(row.session_id) : '',
                reviewerId,
                reviewerName: profile
                    ? (this._personChipName
                        ? this._personChipName(profile, reviewerId)
                        : (profile.full_name || ''))
                    : '',
                reviewerEmail: (profile && profile.email) || '',
                verdict: row.verdict != null ? String(row.verdict) : '',
                difficulty: row.difficulty != null && String(row.difficulty).trim()
                    ? String(row.difficulty).trim()
                    : null,
                notes: row.notes != null ? String(row.notes) : '',
                createdAt: row.created_at != null ? String(row.created_at) : ''
            };
        }).filter((review) => review.id);

        reviews.sort((a, b) => {
            const aTs = Date.parse(a.createdAt || '') || 0;
            const bTs = Date.parse(b.createdAt || '') || 0;
            if (bTs !== aTs) return bTs - aTs;
            return String(b.id).localeCompare(String(a.id));
        });

        return { reviews, message: null, reason: null };
    },

    async _getVerifierFromCard(itemId) {
        const id = String(itemId || '').trim();
        if (!id) {
            this._logDashApiSkip('get-verifier', 'missing item id');
            return;
        }
        const item = this._findCachedItem(id) || this._findResultItem(id);
        if (!item || !item.task) {
            this._logDashApiSkip('get-verifier', 'no task on card', id);
            return;
        }
        const taskKey = String(item.task.key || '').trim();
        const taskId = String(item.task.id || '').trim();
        const inputValue = taskKey || taskId;
        if (!inputValue) {
            this._logDashApiSkip('get-verifier', 'missing task key/id', id);
            return;
        }
        const opsTab = Context.opsTab;
        if (!opsTab || typeof opsTab.handleVerifierFetch !== 'function') {
            this._logDashApiSkip('get-verifier', 'ops module missing');
            return;
        }
        this._logDashApiClick('get-verifier', taskKey || taskId.slice(0, 8) + '…');
        this._setActiveTab('verifier-fetcher');
        const input = this._q('#wf-ops-verifier-input');
        if (input) input.value = inputValue;
        await opsTab.handleVerifierFetch(this._modal);
    },

    async _toggleUserStory(itemId) {
        const id = String(itemId || '').trim();
        if (!id) return;
        const item = this._findCachedItem(id) || this._findResultItem(id);
        if (!item || !item.task) return;
        const ui = this._getUserStoryUi(id);

        if (ui.status === 'loaded' || ui.status === 'error') {
            if (!this._userStoryHasContent(ui)) return;
            ui.visible = !ui.visible;
            delete ui.animateOpen;
            Logger.log('dashboard: user story ' + (ui.visible ? 'shown' : 'hidden') + ' — ' + id);
            if (!this._patchUserStoryVisibility(id)) {
                this._patchTaskCard(id);
            }
            return;
        }
        if (ui.status === 'loading') {
            this._logDashApiSkip('user-story-fetch', 'already loading', id);
            return;
        }

        const opsTab = Context.opsTab;
        if (!opsTab || typeof opsTab.fetchTaskUserStory !== 'function') {
            ui.status = 'error';
            ui.message = 'User story unavailable (ops module not loaded).';
            ui.visible = false;
            this._logDashApiSkip('user-story-fetch', 'ops module missing', id);
            this._patchTaskCard(id);
            return;
        }

        const taskKey = String(item.task.key || '').trim();
        const taskId = String(item.task.id || '').trim();
        this._logDashApiClick('user-story-fetch', taskKey || taskId.slice(0, 8) + '…');
        ui.status = 'loading';
        if (!this._patchUserStorySection(id)) this._patchTaskCard(id);

        try {
            const result = await opsTab.fetchTaskUserStory({ taskKey, taskId });
            ui.scenarioTitle = result && result.scenarioTitle != null
                ? String(result.scenarioTitle).trim() || null
                : null;
            ui.humanAnnotatorInstructions = result && result.humanAnnotatorInstructions != null
                ? String(result.humanAnnotatorInstructions).trim() || null
                : null;
            ui.userStory = result && result.userStory != null
                ? String(result.userStory).trim() || null
                : null;
            if (!this._userStoryHasContent(ui)) {
                const reason = result && result.reason ? result.reason : 'empty';
                ui.scenarioTitle = null;
                ui.humanAnnotatorInstructions = null;
                ui.userStory = null;
                ui.message = this._userStoryEmptyMessage(reason);
                Logger.warn('dashboard: user story empty — ' + id + ' (' + reason + ')');
            } else {
                ui.message = null;
                const summary = [
                    ui.scenarioTitle ? 'title ' + ui.scenarioTitle.length + ' chars' : null,
                    ui.humanAnnotatorInstructions ? 'instructions ' + ui.humanAnnotatorInstructions.length + ' chars' : null,
                    ui.userStory ? 'story ' + ui.userStory.length + ' chars' : null
                ].filter(Boolean).join(', ');
                Logger.log('dashboard: user story fetched — ' + id + ' (' + summary + ')');
            }
            ui.status = 'loaded';
            ui.visible = this._userStoryHasContent(ui);
            if (ui.visible) ui.animateOpen = true;
        } catch (err) {
            ui.status = 'error';
            ui.scenarioTitle = null;
            ui.humanAnnotatorInstructions = null;
            ui.userStory = null;
            ui.message = this._isDashSessionRefreshError(err)
                ? 'Session expired — refresh Fleet and unlock Ops, then reload.'
                : 'Could not load user story.';
            ui.visible = false;
            Logger.warn('dashboard: user story fetch failed — ' + id, err);
        }
        if (!this._patchUserStorySection(id)) this._patchTaskCard(id);
        if (ui.animateOpen && ui.visible) {
            delete ui.animateOpen;
            this._animateUserStoryOpen(id);
        } else {
            delete ui.animateOpen;
            this._syncUserStoryPanelOpen(id, ui.visible);
        }
    },

    async _toggleSessionQa(itemId) {
        const id = String(itemId || '').trim();
        if (!id) return;
        const item = this._findCachedItem(id) || this._findResultItem(id);
        if (!item || !item.task) return;
        const ui = this._getSessionQaUi(id);

        if (this._sessionQaHasReviews(ui) && (ui.status === 'loaded' || ui.status === 'error')) {
            ui.visible = !ui.visible;
            delete ui.animateOpen;
            Logger.log('dashboard: session QA ' + (ui.visible ? 'shown' : 'hidden') + ' — ' + id);
            if (!this._patchSessionQaVisibility(id)) {
                this._patchTaskCard(id);
            }
            return;
        }
        if (ui.status === 'loading') {
            this._logDashApiSkip('session-qa-fetch', 'already loading', id);
            return;
        }

        const taskId = String(item.task.id || '').trim();
        if (!taskId) {
            ui.status = 'error';
            ui.reviews = [];
            ui.message = 'No sessions found for this task.';
            ui.visible = false;
            this._logDashApiSkip('session-qa-fetch', 'missing task id', id);
            if (!this._patchSessionQaSection(id)) this._patchTaskCard(id);
            return;
        }

        this._logDashApiClick('session-qa-fetch', taskId.slice(0, 8) + '…');
        ui.status = 'loading';
        ui.message = null;
        if (!this._patchSessionQaSection(id)) this._patchTaskCard(id);

        try {
            const result = await this._fetchSessionQaReviewsForTask(taskId);
            ui.reviews = Array.isArray(result.reviews) ? result.reviews : [];
            ui.message = result.message || null;
            ui.status = 'loaded';
            ui.visible = this._sessionQaHasReviews(ui);
            if (ui.visible) ui.animateOpen = true;
            if (ui.reviews.length > 0) {
                Logger.log('dashboard: session QA fetched — ' + id + ' (' + ui.reviews.length + ' review(s))');
            } else {
                Logger.log('dashboard: session QA empty — ' + id + ' (' + (result.reason || 'empty') + ')');
            }
        } catch (err) {
            ui.status = 'error';
            ui.reviews = [];
            ui.message = this._isDashSessionRefreshError(err)
                ? 'Session expired — refresh Fleet and unlock Ops, then reload.'
                : 'Could not load Session QA.';
            ui.visible = false;
            Logger.warn('dashboard: session QA fetch failed — ' + id, err);
        }
        if (!this._patchSessionQaSection(id)) this._patchTaskCard(id);
        if (ui.animateOpen && ui.visible) {
            delete ui.animateOpen;
            this._animateSessionQaOpen(id);
        } else {
            delete ui.animateOpen;
            this._syncSessionQaPanelOpen(id, ui.visible);
        }
        if (typeof this._refreshSessionQaFilterUi === 'function') {
            this._refreshSessionQaFilterUi();
        }
    },

    async _toggleVerifierOutput(itemId) {
        const id = String(itemId || '').trim();
        if (!id) return;
        const item = this._findCachedItem(id) || this._findResultItem(id);
        if (!item || !item.task) return;
        const ui = this._getVerifierOutputUi(id);

        if (this._verifierOutputHasExecutions(ui) && (ui.status === 'loaded' || ui.status === 'error')) {
            ui.visible = !ui.visible;
            delete ui.animateOpen;
            Logger.log('dashboard: verifier output ' + (ui.visible ? 'shown' : 'hidden') + ' — ' + id);
            if (!this._patchVerifierOutputVisibility(id)) {
                this._patchTaskCard(id);
            }
            return;
        }
        if (ui.status === 'loading') {
            this._logDashApiSkip('verifier-output-fetch', 'already loading', id);
            return;
        }

        const taskId = String(item.task.id || '').trim();
        if (!taskId) {
            ui.status = 'error';
            ui.executions = [];
            ui.message = 'No sessions found for this task.';
            ui.visible = false;
            this._logDashApiSkip('verifier-output-fetch', 'missing task id', id);
            if (!this._patchVerifierOutputSection(id)) this._patchTaskCard(id);
            return;
        }

        this._logDashApiClick('verifier-output-fetch', taskId.slice(0, 8) + '…');
        ui.status = 'loading';
        ui.message = null;
        if (!this._patchVerifierOutputSection(id)) this._patchTaskCard(id);

        try {
            const result = await this._fetchVerifierOutputsForTask(taskId);
            ui.executions = Array.isArray(result.executions) ? result.executions : [];
            ui.message = result.message || null;
            ui.status = 'loaded';
            ui.visible = this._verifierOutputHasExecutions(ui);
            if (ui.visible) ui.animateOpen = true;
            if (ui.executions.length > 0) {
                Logger.log('dashboard: verifier output fetched — ' + id + ' (' + ui.executions.length + ' run(s))');
            } else {
                Logger.log('dashboard: verifier output empty — ' + id + ' (' + (result.reason || 'empty') + ')');
            }
        } catch (err) {
            ui.status = 'error';
            ui.executions = [];
            ui.message = this._isDashSessionRefreshError(err)
                ? 'Session expired — refresh Fleet and unlock Ops, then reload.'
                : 'Could not load Verifier Output.';
            ui.visible = false;
            Logger.warn('dashboard: verifier output fetch failed — ' + id, err);
        }
        if (!this._patchVerifierOutputSection(id)) this._patchTaskCard(id);
        if (ui.animateOpen && ui.visible) {
            delete ui.animateOpen;
            this._animateVerifierOutputOpen(id);
        } else {
            delete ui.animateOpen;
            this._syncVerifierOutputPanelOpen(id, ui.visible);
        }
    },

    _getUnhydratedInView() {
        return (this._getViewItems() || []).filter((it) => !it.hydrated);
    },

    _getUnhydratedOnPage() {
        return this._getPaginatedViewItems().filter((it) => !it.hydrated);
    },

    _getInitialHydrateBatch() {
        return (this._getViewItems() || [])
            .slice(0, DASH_INITIAL_HYDRATE_CAP)
            .filter((it) => it && !it.hydrated);
    },

    _needsManualHydrateForRemainder() {
        const view = this._getViewItems() || [];
        return view.length > DASH_INITIAL_HYDRATE_CAP && this._getUnhydratedInView().length > 0;
    },

    _autoHydrateContextKey() {
        const tab = this._state.resultsKindTab || 'all';
        const pass = this._state.autoHydratePassId || 0;
        const page = this._state.resultsPage || 0;
        return pass + '|' + tab + '|' + page;
    },

    _schedulePageHydrate() {
        if (this._state.pageHydrateScheduled || this._state.autoHydrateActive || this._state.hydrateBulkActive) return;
        if (this._state.loading) return;
        if (!this._bulkHydrateShowable()) {
            this._state.pageHydratePending = false;
            return;
        }
        const onPage = this._getUnhydratedOnPage();
        if (onPage.length === 0) {
            this._state.pageHydratePending = false;
            return;
        }
        if (this._state.committed && this._state.committed.retrieveMode) return;
        if (!Context.dashboardData || typeof Context.dashboardData.enrichTasksWithHistory !== 'function') {
            this._state.pageHydratePending = true;
            return;
        }
        this._state.pageHydratePending = false;
        this._state.pageHydrateScheduled = true;
        queueMicrotask(() => {
            this._state.pageHydrateScheduled = false;
            void this._hydrateCurrentPage();
        });
    },

    _bulkHydrateShowable() {
        const committed = this._state.committed;
        const resultsReady = this._state.filteredItems !== null && this._state.cachedItems !== null;
        return Boolean(
            committed
            && !committed.retrieveMode
            && this._state.hasSearched
            && !this._state.loading
            && resultsReady
        );
    },

    _kindLabelForHydrate(tab, kinds) {
        if (kinds.length === 1) {
            if (kinds[0] === 'task_creation') return 'task creation';
            if (kinds[0] === 'qa') return 'QA';
            return 'disputes';
        }
        if (tab === 'all') return 'all';
        if (tab === 'task_creation') return 'task creation';
        if (tab === 'qa') return 'QA';
        return 'disputes';
    },

    _bulkHydrateBaseLabel() {
        if (!this._bulkHydrateShowable()) return null;
        const committed = this._state.committed;
        const kinds = this._committedSearchKinds(committed);
        const tab = this._state.resultsKindTab || 'all';
        const kindPart = this._kindLabelForHydrate(tab, kinds);
        return 'Hydrate ' + kindPart + ' results';
    },

    _bulkHydrateLabel() {
        const base = this._bulkHydrateBaseLabel();
        if (!base) return null;
        const unhydrated = this._getUnhydratedInView();
        if (unhydrated.length > 0) {
            return base + ' (' + unhydrated.length + ' remaining)';
        }
        return base;
    },

    _syncBulkHydrateUi() {
        const btn = this._q('#wf-dash-bulk-hydrate');
        if (btn) {
            const committed = this._state.committed;
            const canLabel = Boolean(
                committed
                && !committed.retrieveMode
                && this._state.filteredItems !== null
                && this._state.cachedItems !== null
            );
            if (canLabel) {
                const label = this._bulkHydrateLabel();
                if (label) btn.textContent = label;
            }
            if (!this._bulkHydrateShowable()) {
                btn.style.display = 'none';
            } else {
                const unhydratedCount = this._getUnhydratedInView().length;
                if (unhydratedCount === 0 || !this._needsManualHydrateForRemainder()) {
                    btn.style.display = 'none';
                } else {
                    btn.style.display = '';
                    btn.disabled = this._state.hydrateBulkActive || this._state.autoHydrateActive;
                }
            }
        }
        this._syncResultsHydrateBannerUi();
    },

    _setBulkHydrateProgress(done, total) {
        const btn = this._q('#wf-dash-bulk-hydrate');
        if (!btn || !this._state.hydrateBulkActive) return;
        const base = this._bulkHydrateBaseLabel() || 'Hydrate results';
        btn.textContent = total > 0 ? base + ' (' + done + '/' + total + ')' : base;
    },

    _updateResultsKindTabsUi() {
        const wrap = this._q('#wf-dash-filter-kind-tab-wrap');
        const buttonsWrap = this._q('#wf-dash-filter-kind-tab-buttons');
        if (!wrap || !buttonsWrap) return;
        if (!this._resultsToolbarReady()) {
            wrap.style.display = 'none';
            buttonsWrap.innerHTML = '';
            this._syncResultsRangeCountUi();
            return;
        }
        const committed = this._state.committed;
        const tabs = this._resultsKindTabsMeta(committed);
        if (tabs.length <= 1) {
            wrap.style.display = 'none';
            buttonsWrap.innerHTML = '';
        } else {
            wrap.style.display = 'block';
            const counts = this._countItemsByResultsKindTab(this._state.cachedItems, committed);
            const activeTab = this._state.resultsKindTab || 'all';
            const tabButtons = tabs.map((tab) => {
                const active = tab.id === activeTab;
                const disabled = this._isResultsKindTabDisabled(tab.id, counts, committed);
                const style = this._btnResultsKindTabStyle(active, tab.id, disabled);
                const disabledAttr = disabled ? ' disabled' : '';
                return `<button type="button" data-wf-dash-results-kind-tab="${dashEscHtml(tab.id)}"${disabledAttr} style="${style}">${dashEscHtml(tab.label)}</button>`;
            }).join('');
            buttonsWrap.innerHTML = tabButtons;
            buttonsWrap.querySelectorAll('[data-wf-dash-results-kind-tab]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    if (btn.disabled) return;
                    this._state.resultsKindTab = btn.getAttribute('data-wf-dash-results-kind-tab') || 'all';
                    Logger.log('dashboard: results kind tab — ' + this._state.resultsKindTab);
                    this._updateResultsKindTabsUi();
                    this._onResultsKindTabChanged();
                });
            });
        }
        this._syncResultsRangeCountUi();
    },

    async _bulkHydrateVisible() {
        if (!this._bulkHydrateShowable() || this._state.hydrateBulkActive || this._state.autoHydrateActive) {
            this._logDashApiSkip('bulk-hydrate', 'not available or already active');
            return;
        }
        if (!Context.dashboardData || typeof Context.dashboardData.enrichTasksWithHistory !== 'function') {
            this._logDashApiSkip('bulk-hydrate', 'dashboardData not loaded');
            return;
        }
        const toHydrate = this._getUnhydratedInView();
        if (toHydrate.length === 0) {
            this._logDashApiSkip('bulk-hydrate', 'nothing to hydrate');
            return;
        }

        this._logDashApiClick('bulk-hydrate', toHydrate.length + ' card(s)');
        this._state.hydrateBulkActive = true;
        this._state.loading = true;
        this._resetSearchLoadLog();
        this._setSearchLoadPhase('Hydrating results…', toHydrate.length);
        this._syncSearchLoadPhaseUi();
        this._syncBulkHydrateUi();
        const loadEntryId = this._beginSearchLoadEntry('Hydrating results');
        let hydratedTotal = 0;
        try {
            hydratedTotal = await this._hydrateItemsInBulkBatches(toHydrate, {
                onProgress: (done, total) => {
                    this._setSearchLoadPhase('Hydrating results…', done, total);
                    if (loadEntryId != null) {
                        this._updateSearchLoadEntry(
                            loadEntryId,
                            this._searchLoadMessage('Hydrating results', done, total)
                        );
                    }
                }
            });
            if (loadEntryId != null) {
                this._resolveSearchLoadEntry(
                    loadEntryId,
                    this._searchLoadMessage('Hydrating results', hydratedTotal, toHydrate.length)
                );
            }
            this._onScopeDataEnriched();
            const meta = this._getResultsPaginationMeta();
            if (meta && meta.page >= meta.totalPages) {
                this._state.resultsPage = 0;
            }
            Logger.log('dashboard: bulk hydrate complete — ' + hydratedTotal + ' card(s) in tab');
        } catch (err) {
            if (loadEntryId != null) {
                this._resolveSearchLoadEntry(loadEntryId, 'Hydrating results — failed');
            }
            if (!this._handleDashSessionRefreshError(err)) {
                Logger.warn('dashboard: bulk hydrate failed', err);
            }
        } finally {
            this._state.hydrateBulkActive = false;
            this._state.loading = false;
            this._state.searchLoadPhase = '';
            this._resetSearchLoadLog();
            this._syncBulkHydrateUi();
            this._syncResultsRangeCountUi();
            this._renderResults();
        }
    },

    _btnResultsKindTabStyle(active, tabId, disabled) {
        const base = 'padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 6px;';
        if (disabled) {
            return base + ' border: 2px solid var(--border, #e2e8f0); color: var(--muted-foreground, #64748b); background: transparent; opacity: 0.35; cursor: not-allowed;';
        }
        const interactive = base + ' cursor: pointer;';
        if (active) {
            if (tabId === 'all') {
                return interactive + ' border: 2px solid #ca8a04; color: #a16207; background: transparent;';
            }
            const cfg = DASH_OUTPUT_KIND_CONFIG[tabId];
            return interactive + ' ' + (cfg ? cfg.toggleActive : DASH_TOGGLE_INACTIVE);
        }
        return interactive + ' ' + DASH_TOGGLE_INACTIVE;
    },

    _taskInitialCreatedAt(task) {
        if (!task) return '';
        const versions = task.promptVersions || [];
        if (versions.length) {
            const first = [...versions].sort((a, b) => a.displayVersionNo - b.displayVersionNo)[0];
            if (first && first.createdAt) return first.createdAt;
        }
        return task.createdAt || '';
    },

    _cardTabShellBase(options) {
        const opts = options || {};
        const hPad = opts.noHorizontalPadding ? '0' : '8px';
        const flexShrink = opts.shrinkable ? '1' : '0';
        let base = 'height: ' + DASH_CARD_TAB_HEIGHT
            + '; flex-shrink: ' + flexShrink + ';'
            + ' border-radius: 6px 6px 0 0; display: inline-flex; align-items: center; justify-content: center;'
            + ' font-size: 10px; font-weight: 600; padding: 0 ' + hPad + '; box-sizing: border-box; overflow: hidden; white-space: nowrap;';
        if (opts.shrinkable) base += ' min-width: 0;';
        return base;
    },

    _cardSurfaceTabHtml(innerHtml, title, options) {
        const opts = options || {};
        const shell = this._cardTabShellBase(opts)
            + ' background: var(--card, #ffffff); font-weight: 400;'
            + ' border: ' + DASH_CARD_TAB_BORDER + '; border-bottom: none;';
        const label = String(title || '');
        const cls = opts.shellClass ? ' class="' + dashEscHtml(opts.shellClass) + '"' : '';
        return '<div' + cls + ' style="' + shell + '"'
            + (label ? ' title="' + dashEscHtml(label) + '" aria-label="' + dashEscHtml(label) + '"' : '')
            + '>' + innerHtml + '</div>';
    },

    _cardCreatedTabHtml(task) {
        const iso = this._taskInitialCreatedAt(task);
        const creationSec = task && task.initialCreationTimeSeconds;
        const durationSec = (creationSec != null && Number.isFinite(Number(creationSec)))
            ? Number(creationSec)
            : null;
        const inner = `<span style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: nowrap;">`
            + `<span style="${this._labelStyle()}">Created</span>`
            + dashTimestampWithDurationHtml(iso, durationSec)
            + '</span>';
        const label = dashLabeledTimestampWithDurationPlainText('Created', iso, durationSec);
        return this._cardSurfaceTabHtml(inner, label);
    },

    _cardKeyCopyHtml(text, highlight) {
        const value = String(text == null ? '' : text).trim();
        if (!value) {
            return '<span class="wf-dash-card-key-copy wf-dash-card-key-copy--empty">—</span>';
        }
        const inner = this._dashCopyInnerHtml(value, highlight);
        return '<button type="button" class="wf-dash-card-key-copy" dir="rtl" data-wf-dash-copy="' + dashEscHtml(value) + '"'
            + ' title="Click to copy: ' + dashEscHtml(value) + '" aria-label="Task key: ' + dashEscHtml(value) + '">'
            + '<span class="wf-dash-card-key-copy-text" dir="ltr">' + inner + '</span></button>';
    },

    _cardKeyTabHtml(task, itemId, highlightOpts) {
        const key = String(task && task.key || '').trim();
        const inner = '<span class="wf-dash-card-key-tab-inner">'
            + this._cardKeyCopyHtml(key, highlightOpts || {})
            + this._taskOpenLinkHtml(task, itemId, { flushHorizontal: true })
            + '</span>';
        return this._cardSurfaceTabHtml(inner, key ? ('Task key: ' + key) : 'Task key', {
            noHorizontalPadding: true,
            shellClass: 'wf-dash-card-key-tab'
        });
    },

    _cardStatusTabHtml(task) {
        const meta = this._statusDisplayMeta(task.status);
        const shell = this._cardTabShellBase() + ' background: ' + meta.bg + '; color: ' + meta.color + ';';
        return '<div style="' + shell + '" title="' + dashEscHtml(meta.label) + '" aria-label="' + dashEscHtml(meta.label) + '">' + dashEscHtml(meta.label) + '</div>';
    },

    _cardActionAreaHtml(itemId) {
        const item = this._findCachedItem(itemId) || this._findResultItem(itemId);
        const showRescue = this._taskEligibleForRescue(item && item.task);
        const rehydrating = Boolean(this._state.cardRehydrating && this._state.cardRehydrating[itemId]);
        const rescuing = Boolean(this._state.cardRescuing && this._state.cardRescuing[itemId]);
        const rehydrateDisabled = (rehydrating || rescuing) ? ' disabled aria-busy="true"' : '';
        const rescueDisabled = rescuing ? ' disabled aria-busy="true"' : '';
        const rehydrateTitle = rehydrating ? 'Rehydrating…' : 'Throw away and fully rehydrate this card';
        const rescueTitle = rescuing
            ? 'Rescuing…'
            : 'Lease and discard this escalated task back to the writer (Other)';
        const rescueBtn = showRescue
            ? `<button type="button" class="wf-dash-card-action wf-dash-card-action--rescue" data-wf-dash-rescue="1" data-item-id="${dashEscHtml(itemId)}" title="${dashEscHtml(rescueTitle)}" aria-label="${dashEscHtml(rescueTitle)}"${rescueDisabled}>
                <span class="wf-dash-card-action-inner">
                    <span class="wf-dash-card-action-label">${rescuing ? 'Rescuing…' : 'Rescue'}</span>
                </span>
            </button>`
            : '';
        return `<div class="wf-dash-card-action-area" aria-label="Card actions">
            <button type="button" class="wf-dash-card-action wf-dash-card-action--add-to-diff" data-wf-dash-add-to-diff="1" data-item-id="${dashEscHtml(itemId)}" title="Add to Diff Viewer" aria-label="Add to Diff Viewer">
                <span class="wf-dash-card-action-inner">
                    <span class="wf-dash-card-action-label">Diff</span>
                </span>
            </button>
            <button type="button" class="wf-dash-card-action wf-dash-card-action--get-verifier" data-wf-dash-get-verifier="1" data-item-id="${dashEscHtml(itemId)}" title="Get verifier" aria-label="Get verifier">
                <span class="wf-dash-card-action-inner">
                    <span class="wf-dash-card-action-label">Get Verifier</span>
                </span>
            </button>
            <button type="button" class="wf-dash-card-action wf-dash-card-action--rehydrate" data-wf-dash-rehydrate="1" data-item-id="${dashEscHtml(itemId)}" title="${dashEscHtml(rehydrateTitle)}" aria-label="${dashEscHtml(rehydrateTitle)}"${rehydrateDisabled}>
                <span class="wf-dash-card-action-inner">
                    <span class="wf-dash-card-action-label">${rehydrating ? 'Rehydrating…' : 'Rehydrate'}</span>
                </span>
            </button>
            ${rescueBtn}
            <button type="button" class="wf-dash-card-action wf-dash-card-action--remove" data-wf-dash-remove-result="1" data-item-id="${dashEscHtml(itemId)}" title="Completely remove result from search" aria-label="Completely remove result from search">
                <span class="wf-dash-card-action-inner">
                    <span class="wf-dash-card-action-icon" aria-hidden="true">×</span>
                </span>
            </button>
        </div>`;
    },

    _mostRecentHumanQaFeedback(task) {
        if (!task || !Array.isArray(task.allFeedback)) return null;
        for (const entry of task.allFeedback) {
            if (!entry) continue;
            if (entry.isSystemFeedback || (entry.display && entry.display.isSystemFeedback)) continue;
            if (entry.isVerifierFailure || (entry.display && entry.display.isVerifierFailure)) continue;
            return entry;
        }
        return null;
    },

    _taskEligibleForRescue(task) {
        const latest = this._mostRecentHumanQaFeedback(task);
        if (!latest) return false;
        return Boolean(latest.isEscalated || (latest.display && latest.display.isEscalated));
    },

    async _attemptRescueFromCard(itemId) {
        const iid = String(itemId || '').trim();
        if (!iid) {
            this._logDashApiSkip('rescue', 'missing item id');
            return;
        }
        const item = this._findCachedItem(iid) || this._findResultItem(iid);
        if (!item || !item.task || !item.task.id) {
            this._logDashApiSkip('rescue', 'task not found', iid);
            return;
        }
        if (!this._taskEligibleForRescue(item.task)) {
            this._logDashApiSkip('rescue', 'latest QA feedback is not escalated', iid);
            return;
        }
        if (!this._state.cardRescuing) this._state.cardRescuing = {};
        if (this._state.cardRescuing[iid]) {
            this._logDashApiSkip('rescue', 'already in progress', iid);
            return;
        }
        const taskId = String(item.task.id).trim();
        this._logDashApiClick('rescue', taskId.slice(0, 8) + '…');
        this._state.cardRescuing[iid] = true;
        this._patchTaskCard(iid);
        try {
            await this._leaseEvalTaskForRescue(taskId);
            await this._discardEvalTaskForRescue(taskId);
            try {
                await this._refreshFlagPrefetchCaches();
            } catch (prefetchErr) {
                Logger.debug('search-output: rescue flag prefetch refresh failed — ' + iid, prefetchErr);
            }
            await this._rehydrateCard(iid);
            Logger.log('search-output: rescue complete — ' + taskId.slice(0, 8));
        } catch (e) {
            Logger.warn('search-output: rescue failed — ' + taskId.slice(0, 8), e);
        } finally {
            delete this._state.cardRescuing[iid];
            this._patchTaskCard(iid);
        }
    },

    async _rehydrateCardFromButton(itemId) {
        const iid = String(itemId || '').trim();
        if (!iid) {
            this._logDashApiSkip('card-rehydrate', 'missing item id');
            return;
        }
        this._logDashApiClick('card-rehydrate', iid);
        try {
            await this._refreshFlagPrefetchCaches();
        } catch (e) {
            Logger.debug('search-output: card rehydrate flag prefetch refresh failed — ' + iid, e);
        }
        await this._rehydrateCard(iid);
    },

    _addToDiffFromCard(itemId) {
        const item = this._findCachedItem(itemId);
        if (!item || !item.task) {
            Logger.warn('search-output: Add to Diff — item not found: ' + itemId);
            return;
        }
        if (!Context.diffViewer || typeof Context.diffViewer.addTask !== 'function') {
            Logger.warn('search-output: Add to Diff — Context.diffViewer not ready');
            return;
        }
        const seed = this._diffSeedFromItem(item);
        Context.diffViewer.addTask(seed);
        Logger.log('search-output: added task to diff viewer — ' + (seed.key || seed.taskId));
    },

    _diffSeedFromItem(item) {
        return {
            taskId: item.task.id,
            key: item.task.key || '',
            authorName: (item.task.author && item.task.author.name) || '',
            authorEmail: (item.task.author && item.task.author.email) || '',
            createdAt: item.task.createdAt || '',
            versionCount: (item.task.promptVersions || []).length
        };
    },

    _diffIncludedResults() {
        const items = this._getViewItems() || [];
        if (!items.length) return;
        if (!Context.diffViewer || typeof Context.diffViewer.addTasks !== 'function') {
            Logger.warn('search-output: Diff Included Results — Context.diffViewer not ready');
            return;
        }
        const seeds = [];
        for (const item of items) {
            if (!item || !item.task || !item.task.id) continue;
            seeds.push(this._diffSeedFromItem(item));
        }
        if (!seeds.length) {
            Logger.warn('search-output: Diff Included Results — no tasks in view');
            return;
        }
        const result = Context.diffViewer.addTasks(seeds);
        Logger.log('search-output: Diff Included Results — ' + result.added + '/' + seeds.length + ' added'
            + (result.slotted ? ', ' + result.slotted + ' slotted' : '')
            + (result.stashedOnly ? ', ' + result.stashedOnly + ' stash-only' : '')
            + (result.skipped ? ', ' + result.skipped + ' skipped (stash full)' : ''));
    },

    _autoGrowTextareaStyle() {
        return this._inputStyle()
            + ' display: block; width: 100%; box-sizing: border-box; min-height: '
            + DASH_AUTO_GROW_TEXTAREA_MIN_PX + 'px; overflow-y: hidden; resize: none; padding: 4px 8px; font-size: 12px; line-height: 1.4;';
    },

    _compactSelectStyle() {
        return this._inputStyle() + ' width: auto; max-width: 280px; padding: 4px 8px; font-size: 12px;';
    },

    _iconMicroBtnStyle() {
        return 'display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border-radius: 6px; color: var(--muted-foreground, #64748b); border: none; background: transparent; padding: 0; cursor: pointer; font-size: 14px; line-height: 1;';
    },

    _segmentBtnStyle(active, variant) {
        const base = 'flex: 1; padding: 7px 14px; font-size: 12px; font-weight: 600; cursor: pointer; border-radius: 6px;';
        if (variant === 'depth') {
            if (active) {
                return base + ' border: 2px solid #ca8a04; color: #a16207; background: transparent;';
            }
            return base + ' ' + DASH_TOGGLE_INACTIVE;
        }
        return base;
    },

    _textareaFocusSnapshot(wrap, selector) {
        const ta = wrap && wrap.querySelector(selector);
        const hadFocus = ta && this._pageWindow().document.activeElement === ta;
        return {
            hadFocus,
            selStart: hadFocus && ta ? ta.selectionStart : null,
            selEnd: hadFocus && ta ? ta.selectionEnd : null
        };
    },

    _restoreTextareaFocus(wrap, selector, snapshot) {
        if (!wrap) return;
        const ta = wrap.querySelector(selector);
        if (!ta) return;
        this._syncAutoGrowTextarea(ta, DASH_AUTO_GROW_TEXTAREA_MIN_PX);
        if (snapshot && snapshot.hadFocus) {
            ta.focus();
            try {
                if (snapshot.selStart != null && snapshot.selEnd != null) {
                    ta.setSelectionRange(snapshot.selStart, snapshot.selEnd);
                }
            } catch (_e) { /* ignore */ }
        }
    },

    _quotedFieldBodyLayoutStyle() {
        return 'margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5;';
    },

    _mutedQuotedFieldBodyStyle() {
        return this._quotedFieldBodyLayoutStyle() + ' color: var(--muted-foreground, #64748b);';
    },

    _quotedFieldBlockHtml(label, bodyHtml, copyText, options) {
        const opts = options || {};
        const shellClass = opts.shellClass ? ' class="' + dashEscHtml(opts.shellClass) + '"' : '';
        const headerClass = opts.headerClass ? ' class="' + dashEscHtml(opts.headerClass) + '"' : '';
        const bodyClass = opts.bodyClass ? ' class="' + dashEscHtml(opts.bodyClass) + '"' : '';
        const copyHtml = copyText != null && String(copyText).trim()
            ? this._copyIconHtml(copyText)
            : '';
        const headerInner = opts.headerInner
            || ('<div style="display: flex; align-items: center; gap: 6px;">' + this._labelSpan(label) + copyHtml + '</div>');
        const bodyTag = opts.bodyTag || 'p';
        const layout = this._quotedFieldBodyLayoutStyle();
        const bodyStyle = opts.bodyStyle != null
            ? opts.bodyStyle
            : (opts.bodyClass
                ? layout
                : layout + ' color: var(--foreground, #0f172a);');
        const styleAttr = bodyStyle ? ' style="' + bodyStyle + '"' : '';
        return '<div' + shellClass + '>'
            + '<div' + headerClass + '>' + headerInner + '</div>'
            + '<' + bodyTag + bodyClass + styleAttr + '>' + bodyHtml + '</' + bodyTag + '>'
            + '</div>';
    },

    _resolutionStatusBadgeHtml(kind, label) {
        const k = String(kind || '').toLowerCase();
        let style;
        if (k === 'approved' || k === 'confirmed') {
            style = 'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #15803d; background: color-mix(in srgb, #16a34a 14%, transparent);';
        } else if (k === 'rejected' || k === 'dismissed') {
            style = 'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #b91c1c; background: color-mix(in srgb, #dc2626 14%, transparent);';
        } else {
            style = 'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: var(--muted-foreground, #64748b); background: color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent);';
        }
        return '<span style="' + style + '">' + dashEscHtml(label) + '</span>';
    },

    _resolutionBlockColors(kind) {
        const k = String(kind || '').toLowerCase();
        if (k === 'approved' || k === 'confirmed') {
            return {
                border: 'color-mix(in srgb, #16a34a 35%, transparent)',
                background: 'color-mix(in srgb, #16a34a 8%, transparent)'
            };
        }
        if (k === 'rejected' || k === 'dismissed') {
            return {
                border: 'color-mix(in srgb, #dc2626 40%, transparent)',
                background: 'color-mix(in srgb, #dc2626 8%, transparent)'
            };
        }
        return {
            border: 'color-mix(in srgb, var(--muted-foreground, #64748b) 35%, transparent)',
            background: 'color-mix(in srgb, var(--muted-foreground, #64748b) 8%, transparent)'
        };
    },

    _resolvedActionSubBlockHtml(opts) {
        const options = opts || {};
        const blockId = options.blockId;
        const itemId = options.itemId;
        const kind = options.kind;
        const statusLabel = options.statusLabel || 'Resolved';
        const leftHeaderExtra = options.leftHeaderExtra || '';
        const resolverHtml = options.resolverHtml || '';
        const noteLabel = options.noteLabel || 'Reason';
        const noteBodyHtml = options.noteBodyHtml || '—';
        const copyText = options.copyText;
        const colors = this._resolutionBlockColors(kind);
        const statusBadge = this._resolutionStatusBadgeHtml(kind, statusLabel);
        const resLeftHeader = '<span style="font-weight: 600; color: var(--foreground, #0f172a);">Resolution</span>' + leftHeaderExtra;
        const resHeaderRow = this._actionBlockHeaderRowHtml(blockId, resLeftHeader, statusBadge);
        const resBodyHtml = resolverHtml + this._quotedFieldBlockHtml(noteLabel, noteBodyHtml, copyText);
        return '<div style="margin-top: 8px; border-radius: 6px; background: var(--card, #ffffff);">'
            + this._actionBlockShellHtml(
                blockId,
                itemId,
                'padding: 8px 10px; border: 1px solid ' + colors.border + '; border-radius: 6px; background: ' + colors.background + '; display: flex; flex-direction: column; gap: 6px;',
                resHeaderRow,
                resBodyHtml
            )
            + '</div>';
    },

    _resultsHeaderBarStyle() {
        return 'padding: 0 8px 8px; border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0;';
    },

    _resultsHeaderRowStyle() {
        return 'display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; width: 100%; padding: 8px 0 0;';
    },

    _resultsToolbarRow2Style() {
        return 'display: none; padding: 4px 0 0; align-items: center; justify-content: flex-end; gap: 8px; width: 100%; flex-wrap: wrap;';
    },

    _getCardUi(taskId) {
        if (!this._state.cardUi[taskId]) {
            this._state.cardUi[taskId] = {
                expanded: false,
                timelineNewestFirst: false,
                selectedDisplayNo: null,
                rollingUi: {
                    rollingLeft: 0,
                    showHighlights: false,
                    highlightModality: 'differences',
                    feedbackBulkCollapsed: false,
                    activationLogged: false,
                    initialized: false
                }
            };
        }
        if (!this._state.cardUi[taskId].rollingUi) {
            this._state.cardUi[taskId].rollingUi = {
                rollingLeft: 0,
                showHighlights: false,
                highlightModality: 'differences',
                feedbackBulkCollapsed: false,
                activationLogged: false,
                initialized: false
            };
        }
        return this._state.cardUi[taskId];
    },

    _getRollingUi(taskId) {
        return this._getCardUi(taskId).rollingUi;
    },

    _ensureRollingUiOnExpand(taskId, versionCount) {
        const rollingUi = this._getRollingUi(taskId);
        if (!rollingUi.initialized) {
            rollingUi.rollingLeft = 0;
            rollingUi.initialized = true;
        }
        this._clampCardRollingLeft(rollingUi, versionCount);
        if (versionCount >= 2 && !rollingUi.activationLogged) {
            rollingUi.activationLogged = true;
            Logger.log('search-output: all versions expanded for task ' + taskId);
        }
    },

    _clampCardRollingLeft(rollingUi, versionCount) {
        const max = Math.max(0, versionCount - 2);
        rollingUi.rollingLeft = Math.max(0, Math.min(rollingUi.rollingLeft, max));
    },

    _rollingSegBtn(attrName, value, label, active, divider) {
        const divCls = divider ? ' dv-seg-btn--divider' : '';
        return `<button type="button" ${attrName}="${value}" class="dv-seg-btn${divCls}" aria-pressed="${active ? 'true' : 'false'}">${dashEscHtml(label)}</button>`;
    },

    _rollingSimilarityLabelHtml(leftText, rightText, rollingUi) {
        const eng = Context.diffEngine;
        if (!eng) return '';
        return eng.similarityLabelHtml({
            leftText,
            rightText,
            granularity: 'word',
            highlightModality: rollingUi.highlightModality,
            showHighlights: rollingUi.showHighlights
        });
    },

    _rollingSimilarityBadgeHtml(leftText, rightText, rollingUi) {
        const inner = this._rollingSimilarityLabelHtml(leftText, rightText, rollingUi);
        if (!inner) return '';
        return `<span class="so-rolling-sim-badge">${inner}</span>`;
    },

    _expandedRollingFeedbackBtnHtml(itemId, taskId, rollingUi) {
        if (rollingUi.showHighlights) return '';
        const feedbackLabel = rollingUi.feedbackBulkCollapsed ? 'Expand Feedback' : 'Collapse Feedback';
        return `<button type="button" data-wf-dash-feedback-bulk="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(taskId)}" class="${this._dashBtnClass('basic', 'compact')}">${dashEscHtml(feedbackLabel)}</button>`;
    },

    _expandedRollingDiffToolbarHtml(rollingUi) {
        const modality = rollingUi.highlightModality;
        const showHighlights = rollingUi.showHighlights;
        return `<div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-left: auto;">
            ${this._labelSpan('Diff Viewer')}
            <div class="dv-seg-group" role="group" aria-label="Diff highlights">
                ${this._rollingSegBtn('data-wf-dash-rolling-highlights', 'on', 'On', showHighlights, true)}
                ${this._rollingSegBtn('data-wf-dash-rolling-highlights', 'off', 'Off', !showHighlights, false)}
            </div>
            <div class="dv-seg-group" role="group" aria-label="Diff modality">
                ${this._rollingSegBtn('data-wf-dash-rolling-modality', 'differences', 'Differences', modality === 'differences', true)}
                ${this._rollingSegBtn('data-wf-dash-rolling-modality', 'similarities', 'Similarities', modality === 'similarities', false)}
            </div>
        </div>`;
    },

    _collectFeedbackBlockIdsForItem(item) {
        const ids = [];
        const task = item.task || {};
        for (const entry of task.allFeedback || []) {
            if (entry.id) ids.push('qa:' + entry.id);
        }
        if (!ids.length && item.qaFeedback) {
            ids.push('qa:fallback:' + item.id);
        }
        for (const d of item.disputes || []) {
            if (d.id) {
                ids.push('dispute:' + d.id);
                ids.push('dispute-res:' + d.id);
            }
        }
        for (const f of item.flags || []) {
            if (f.id) {
                ids.push('flag:' + f.id);
                ids.push('flag-res:' + f.id);
            }
        }
        return ids;
    },

    _setFeedbackBulkCollapsed(item, collapsed) {
        const rollingUi = this._getRollingUi(item.task.id);
        rollingUi.feedbackBulkCollapsed = collapsed;
        if (!this._state.actionBlockUi) this._state.actionBlockUi = {};
        for (const blockId of this._collectFeedbackBlockIdsForItem(item)) {
            if (!this._state.actionBlockUi[blockId]) {
                this._state.actionBlockUi[blockId] = { collapsed: false };
            }
            this._state.actionBlockUi[blockId].collapsed = collapsed;
        }
        Logger.log('search-output: feedback bulk ' + (collapsed ? 'collapsed' : 'expanded') + ' — task ' + item.task.id);
    },

    _rollingPromptBodyHtml(version, versionIdx, renderedVersions, rollingUi) {
        const text = this._dashQuotedText(version.prompt);
        if (!text) return '—';
        const eng = Context.diffEngine;
        const leftIdx = rollingUi.rollingLeft;
        const rightIdx = leftIdx + 1;
        if (!eng || !rollingUi.showHighlights) {
            return dashEscHtml(text);
        }
        if (versionIdx < leftIdx || versionIdx > rightIdx) {
            return dashEscHtml(text);
        }
        const leftVersion = renderedVersions[leftIdx];
        const rightVersion = renderedVersions[rightIdx];
        const leftText = this._dashQuotedText(leftVersion && leftVersion.prompt);
        const rightText = this._dashQuotedText(rightVersion && rightVersion.prompt);
        const pair = eng.diffPair(leftText, rightText, {
            granularity: 'word',
            showHighlights: rollingUi.showHighlights,
            highlightModality: rollingUi.highlightModality
        });
        if (versionIdx === leftIdx) return pair.baseHtml;
        return pair.compareHtml;
    },

    _ensureRollingDiffStyles() {
        if (!this._modal) return;
        let style = this._modal.querySelector('#wf-dash-rolling-diff-styles');
        if (!style) {
            style = this._pageWindow().document.createElement('style');
            style.id = 'wf-dash-rolling-diff-styles';
            this._modal.appendChild(style);
        }
        style.textContent = [
            '#wf-dash-modal .so-versions-rolling-area {',
            '  position: relative;',
            '  overflow: visible;',
            '}',
            '#wf-dash-modal .so-rolling-overlay {',
            '  position: absolute;',
            '  pointer-events: none;',
            '  border: 2px solid var(--brand, #2563eb);',
            '  border-radius: 10px;',
            '  z-index: 2;',
            '  box-sizing: border-box;',
            '  transition: top 0.25s cubic-bezier(0.37, 0, 0.63, 1),',
            '              height 0.25s cubic-bezier(0.37, 0, 0.63, 1),',
            '              left 0.25s cubic-bezier(0.37, 0, 0.63, 1),',
            '              width 0.25s cubic-bezier(0.37, 0, 0.63, 1);',
            '}',
            '#wf-dash-modal .so-rolling-sim-badge {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  padding: 2px 8px;',
            '  border-radius: 6px;',
            '  font-size: 10px;',
            '  font-weight: 700;',
            '  white-space: nowrap;',
            '  background: #f1f5f9;',
            '  color: #0f172a;',
            '}',
            '#wf-dash-modal .so-rolling-sim-badge .dv-slot-above-label-sim,',
            '#wf-dash-modal .so-rolling-sim-badge .dv-slot-above-label-nodiff {',
            '  font-size: inherit;',
            '  font-weight: inherit;',
            '  color: inherit;',
            '}',
            '#wf-dash-modal .so-rolling-diff-on .so-rolling-muted-feedback [data-wf-dash-action-block-header] span,',
            '#wf-dash-modal .so-rolling-diff-on .so-rolling-muted-feedback [data-wf-dash-action-block-header] div,',
            '#wf-dash-modal .so-rolling-diff-on .so-rolling-muted-feedback [data-wf-dash-action-block-body] p,',
            '#wf-dash-modal .so-rolling-diff-on .so-rolling-muted-feedback [data-wf-dash-action-block-body] div,',
            '#wf-dash-modal .so-rolling-diff-on .so-rolling-muted-feedback [data-wf-dash-action-block-body] span,',
            '#wf-dash-modal .so-rolling-diff-on .so-rolling-muted-feedback [data-wf-dash-action-block-body] a,',
            '#wf-dash-modal .so-rolling-diff-on .so-rolling-muted-feedback [data-wf-dash-action-block-body] mark {',
            '  color: var(--muted-foreground, #64748b) !important;',
            '}',
            '#wf-dash-modal .so-rolling-diff-on .so-rolling-muted-feedback [data-wf-dash-action-block-header] span[style*="background"],',
            '#wf-dash-modal .so-rolling-diff-on .so-rolling-muted-feedback [data-wf-dash-action-block-body] span[style*="background"],',
            '#wf-dash-modal .so-rolling-diff-on .so-rolling-muted-feedback [data-wf-dash-action-block-body] a[style*="background"] {',
            '  color: unset !important;',
            '}',
            '#wf-dash-modal .dv-slot-above-label-sim,',
            '#wf-dash-modal .dv-slot-above-label-nodiff {',
            '  font-size: 11px;',
            '  font-weight: 600;',
            '  color: var(--muted-foreground, #64748b);',
            '}'
        ].join('\n');
    },

    _detachCardRollingListeners(cardEl) {
        if (!cardEl || !cardEl._soRollingCleanup) return;
        cardEl._soRollingCleanup();
        cardEl._soRollingCleanup = null;
        cardEl.removeAttribute('data-wf-dash-rolling-attached');
    },

    _removeCardRollingOverlay(cardEl) {
        if (!cardEl) return;
        const area = cardEl.querySelector('[data-wf-dash-versions-area]');
        if (!area) return;
        const overlay = area.querySelector('.so-rolling-overlay');
        if (overlay) overlay.remove();
    },

    _updateCardRollingOverlay(cardEl) {
        if (!cardEl) return;
        const area = cardEl.querySelector('[data-wf-dash-versions-area]');
        if (!area) return;
        const itemId = area.getAttribute('data-item-id');
        const taskId = area.getAttribute('data-task-id');
        const item = itemId ? (this._findCachedItem(itemId) || this._findResultItem(itemId)) : null;
        if (!item) {
            this._removeCardRollingOverlay(cardEl);
            return;
        }
        const rollingUi = this._getRollingUi(taskId);
        const versionBlocks = area.querySelectorAll('[data-wf-dash-version-idx]');
        const versionCount = versionBlocks.length;
        if (versionCount < 2 || !rollingUi.showHighlights) {
            this._removeCardRollingOverlay(cardEl);
            return;
        }
        this._clampCardRollingLeft(rollingUi, versionCount);
        const leftEl = area.querySelector('[data-wf-dash-version-idx="' + rollingUi.rollingLeft + '"]');
        const rightEl = area.querySelector('[data-wf-dash-version-idx="' + (rollingUi.rollingLeft + 1) + '"]');
        if (!leftEl || !rightEl) {
            this._removeCardRollingOverlay(cardEl);
            return;
        }
        const areaRect = area.getBoundingClientRect();
        const leftRect = leftEl.getBoundingClientRect();
        const rightRect = rightEl.getBoundingClientRect();
        const padWrap = area.parentElement;
        const padRect = padWrap ? padWrap.getBoundingClientRect() : areaRect;
        const overlayTopVp = Math.min(leftRect.top, rightRect.top);
        const overlayBottomVp = Math.max(leftRect.bottom, rightRect.bottom);
        const overlayLeftVp = Math.min(leftRect.left, rightRect.left);
        const overlayRightVp = Math.max(leftRect.right, rightRect.right);
        const outset = SO_ROLLING_OVERLAY_OUTSET;
        let outLeftVp = overlayLeftVp - outset;
        let outTopVp = overlayTopVp - outset;
        let outRightVp = overlayRightVp + outset;
        let outBottomVp = overlayBottomVp + outset;
        outLeftVp = Math.max(padRect.left, outLeftVp);
        outTopVp = Math.max(padRect.top, outTopVp);
        outRightVp = Math.min(padRect.right, outRightVp);
        outBottomVp = Math.min(padRect.bottom, outBottomVp);
        const left = outLeftVp - areaRect.left + area.scrollLeft;
        const top = outTopVp - areaRect.top + area.scrollTop;
        const width = Math.max(0, outRightVp - outLeftVp);
        const height = Math.max(0, outBottomVp - outTopVp);
        let overlay = area.querySelector('.so-rolling-overlay');
        if (!overlay) {
            overlay = this._pageWindow().document.createElement('div');
            overlay.className = 'so-rolling-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            area.appendChild(overlay);
        }
        overlay.style.left = left + 'px';
        overlay.style.top = top + 'px';
        overlay.style.width = width + 'px';
        overlay.style.height = height + 'px';
    },

    _attachCardRollingListeners(cardEl, itemId, taskId) {
        if (!cardEl || cardEl.getAttribute('data-wf-dash-rolling-attached') === '1') return;
        const item = this._findCachedItem(itemId) || this._findResultItem(itemId);
        if (!item) return;
        const versions = item.task.promptVersions || [];
        if (versions.length < 2) return;

        cardEl.setAttribute('data-wf-dash-rolling-attached', '1');
        this._ensureRollingDiffStyles();

        const area = cardEl.querySelector('[data-wf-dash-versions-area]');
        const resultsWrap = this._q('#wf-dash-results');
        const cleanups = [];

        const onScroll = () => this._updateCardRollingOverlay(cardEl);
        if (area) area.addEventListener('scroll', onScroll, { passive: true });
        if (resultsWrap) resultsWrap.addEventListener('scroll', onScroll, { passive: true });
        cleanups.push(() => {
            if (area) area.removeEventListener('scroll', onScroll);
            if (resultsWrap) resultsWrap.removeEventListener('scroll', onScroll);
        });

        if (typeof ResizeObserver !== 'undefined' && area) {
            const ro = new ResizeObserver(onScroll);
            ro.observe(area);
            cleanups.push(() => ro.disconnect());
        }

        const onMouseOver = (e) => {
            const block = e.target.closest('[data-wf-dash-version-idx]');
            if (!block || !cardEl.contains(block)) return;
            const related = e.relatedTarget;
            if (related instanceof Node && block.contains(related)) return;
            const idx = parseInt(block.getAttribute('data-wf-dash-version-idx'), 10);
            if (!Number.isFinite(idx)) return;
            this._shiftCardRollingPair(taskId, itemId, idx, versions.length);
        };
        cardEl.addEventListener('mouseover', onMouseOver);
        cleanups.push(() => cardEl.removeEventListener('mouseover', onMouseOver));

        cardEl._soRollingCleanup = () => {
            for (const fn of cleanups) fn();
            this._removeCardRollingOverlay(cardEl);
        };

        requestAnimationFrame(() => this._updateCardRollingOverlay(cardEl));
    },

    _renderedVersionsForItem(item) {
        const task = item.task;
        const ui = this._getCardUi(task.id);
        const versions = task.promptVersions && task.promptVersions.length
            ? task.promptVersions
            : [{ id: '', displayVersionNo: 1, prompt: task.prompt, envKey: task.envKey, createdAt: task.createdAt }];
        return [...versions].sort((a, b) => (
            ui.timelineNewestFirst
                ? b.displayVersionNo - a.displayVersionNo
                : a.displayVersionNo - b.displayVersionNo
        ));
    },

    _versionRollingHeaderRightHtml(version, versionIdx, renderedVersions, rollingUi, feedbackEntries, hasSubsequentVersions) {
        const inActivePair = rollingUi.showHighlights
            && versionIdx >= rollingUi.rollingLeft
            && versionIdx <= rollingUi.rollingLeft + 1;
        let rightHeader = '';
        if (inActivePair) {
            const leftVersion = renderedVersions[rollingUi.rollingLeft];
            const rightVersion = renderedVersions[rollingUi.rollingLeft + 1];
            const simBadge = this._rollingSimilarityBadgeHtml(
                (leftVersion && leftVersion.prompt) || '',
                (rightVersion && rightVersion.prompt) || '',
                rollingUi
            );
            if (simBadge) rightHeader += simBadge;
        }
        if (rollingUi.showHighlights) return rightHeader;
        const orderedFeedback = this._feedbackEntriesOldestFirst(feedbackEntries);
        const versionActionEntry = orderedFeedback.length ? orderedFeedback[orderedFeedback.length - 1] : null;
        let versionActionBadge = this._feedbackActionBadgeHtml(versionActionEntry);
        if (!versionActionBadge && hasSubsequentVersions) {
            versionActionBadge = this._qaEditedBadgeHtml();
        }
        if (versionActionBadge) rightHeader += versionActionBadge;
        return rightHeader;
    },

    _updateRollingPairInCard(cardEl, itemId) {
        const item = this._findCachedItem(itemId) || this._findResultItem(itemId);
        if (!item || !cardEl) return;
        const task = item.task;
        const rollingUi = this._getRollingUi(task.id);
        const area = cardEl.querySelector('[data-wf-dash-versions-area]');
        if (!area) return;
        const renderedVersions = this._renderedVersionsForItem(item);
        const maxDisplayVersionNo = Math.max(...renderedVersions.map((v) => v.displayVersionNo));
        const allFeedback = task.allFeedback || [];
        const feedbackByDisplayNo = new Map();
        for (const entry of allFeedback) {
            const list = feedbackByDisplayNo.get(entry.linkedDisplayVersionNo) || [];
            list.push(entry);
            feedbackByDisplayNo.set(entry.linkedDisplayVersionNo, list);
        }
        const blocks = area.querySelectorAll('[data-wf-dash-version-idx]');
        for (const block of blocks) {
            const versionIdx = parseInt(block.getAttribute('data-wf-dash-version-idx'), 10);
            if (!Number.isFinite(versionIdx)) continue;
            const version = renderedVersions[versionIdx];
            if (!version) continue;
            const feedbackEntries = feedbackByDisplayNo.get(version.displayVersionNo) || [];
            const hasSubsequentVersions = version.displayVersionNo < maxDisplayVersionNo;
            const inActivePair = rollingUi.showHighlights
                && versionIdx >= rollingUi.rollingLeft
                && versionIdx <= rollingUi.rollingLeft + 1;
            block.classList.toggle('so-rolling-diff-on', inActivePair);
            const promptP = block.querySelector(':scope > [data-wf-dash-action-block-body] > p');
            if (promptP) {
                promptP.innerHTML = this._rollingPromptBodyHtml(version, versionIdx, renderedVersions, rollingUi);
            }
            const submittedEl = block.querySelector('[data-wf-dash-version-submitted]');
            if (submittedEl) {
                submittedEl.innerHTML = this._fieldGroupHtml(
                    'Submitted',
                    this._plainTimestampHtml(version.createdAt, null, { muted: inActivePair })
                );
            }
            const headerRight = block.querySelector('[data-wf-dash-version-header-right]');
            if (headerRight) {
                headerRight.innerHTML = this._versionRollingHeaderRightHtml(
                    version, versionIdx, renderedVersions, rollingUi, feedbackEntries, hasSubsequentVersions
                );
            }
        }
    },

    _shiftCardRollingPair(taskId, itemId, idx, versionCount) {
        const rollingUi = this._getRollingUi(taskId);
        const rollingRight = rollingUi.rollingLeft + 1;
        if (idx >= rollingUi.rollingLeft && idx <= rollingRight) return;
        const prevLeft = rollingUi.rollingLeft;
        if (idx < rollingUi.rollingLeft) rollingUi.rollingLeft = idx;
        else if (idx > rollingRight) rollingUi.rollingLeft = idx - 1;
        this._clampCardRollingLeft(rollingUi, versionCount);
        if (rollingUi.rollingLeft === prevLeft) return;
        Logger.debug('search-output: rolling pair → versions ' + rollingUi.rollingLeft + '–' + (rollingUi.rollingLeft + 1));
        const wrap = this._q('#wf-dash-results');
        let cardEl = null;
        if (wrap) {
            for (const el of wrap.querySelectorAll('[data-wf-dash-task-card]')) {
                if (el.getAttribute('data-item-id') === itemId) {
                    cardEl = el;
                    break;
                }
            }
        }
        if (cardEl) {
            this._updateRollingPairInCard(cardEl, itemId);
            this._updateCardRollingOverlay(cardEl);
        } else {
            this._patchTaskCard(itemId);
        }
    },

    _findResultItem(itemId) {
        const items = this._state.filteredItems || [];
        return items.find((it) => it.id === itemId) || null;
    },

    _getDisputeClaimUi(disputeId) {
        const id = String(disputeId || '').trim();
        if (!id) {
            return {
                status: 'idle',
                resolutionReason: '',
                resolutionKey: '',
                bugCategoryKey: '',
                claimedAt: null,
                submitting: false
            };
        }
        if (!this._state.disputeClaimUi[id]) {
            this._state.disputeClaimUi[id] = {
                status: 'idle',
                resolutionReason: '',
                resolutionKey: '',
                bugCategoryKey: '',
                claimedAt: null,
                submitting: false
            };
        }
        if (this._state.disputeClaimUi[id].bugCategoryKey == null) {
            this._state.disputeClaimUi[id].bugCategoryKey = '';
        }
        return this._state.disputeClaimUi[id];
    },

    _disputeResolutionOptionByKey(key) {
        const k = String(key || '').trim();
        return DASH_DISPUTE_RESOLUTION_OPTIONS.find((opt) => opt.key === k) || null;
    },

    _disputeResolutionIsFlagAsBugged(option) {
        return Boolean(option && option.flagAsBugged);
    },

    _disputeResolutionOptionsHtml(selectedKey) {
        const sel = String(selectedKey || '').trim();
        return DASH_DISPUTE_RESOLUTION_OPTIONS.map((opt) => {
            const selected = opt.key === sel ? ' selected' : '';
            return `<option value="${dashEscHtml(opt.key)}"${selected}>${dashEscHtml(opt.label)}</option>`;
        }).join('');
    },

    _disputeBugCategoryByKey(key) {
        const k = String(key || '').trim();
        return DASH_DISPUTE_BUG_CATEGORIES.find((cat) => cat.key === k) || null;
    },

    _disputeBugCategoryOptionsHtml(selectedKey) {
        const sel = String(selectedKey || '').trim();
        const placeholder = `<option value=""${sel ? '' : ' selected'} disabled hidden>Select bug category</option>`;
        const options = DASH_DISPUTE_BUG_CATEGORIES.map((cat) => {
            const selected = cat.key === sel ? ' selected' : '';
            return `<option value="${dashEscHtml(cat.key)}"${selected}>${dashEscHtml(cat.label)}</option>`;
        }).join('');
        return placeholder + options;
    },

    _buildDisputeResolveRequestBody(ui, option, reasonText) {
        const seconds = ui.claimedAt
            ? Math.max(0, Math.round((Date.now() - ui.claimedAt) / 1000))
            : 0;
        let resolutionReason = String(reasonText || '').trim();
        if (this._disputeResolutionIsFlagAsBugged(option)) {
            const cat = this._disputeBugCategoryByKey(ui.bugCategoryKey);
            if (cat && cat.label) {
                resolutionReason = 'Flagged as product bug: [' + cat.label + '] ' + resolutionReason;
            }
        }
        const body = {
            status: option.status,
            resolutionReason,
            disputeReviewDurationSeconds: seconds
        };
        if (option.skipWorkflowSignal) body.skipWorkflowSignal = true;
        return body;
    },

    _buildFlagBuggedRequestBody(ui, reasonText) {
        const cat = this._disputeBugCategoryByKey(ui.bugCategoryKey);
        return {
            reason: cat.label,
            description: String(reasonText || '').trim()
        };
    },

    _disputeResolutionReasonLength(reason) {
        return String(reason || '').trim().length;
    },

    _disputeResolutionPanelHtml(display, itemId) {
        const disputeId = String(display.id || '').trim();
        if (!disputeId) return '';
        const ui = this._getDisputeClaimUi(disputeId);
        if (ui.status !== 'claimed') return '';

        const escDisputeId = dashEscHtml(disputeId);
        const escItemId = dashEscHtml(itemId);
        const url = dashFleetDisputeUrl(disputeId);
        const disabled = ui.submitting ? ' disabled' : '';
        const secondaryClass = this._dashBtnClass('secondary', 'compact');
        const basicClass = this._dashBtnClass('basic', 'compact');
        const reason = ui.resolutionReason != null ? String(ui.resolutionReason) : '';
        const resolutionKey = ui.resolutionKey != null ? String(ui.resolutionKey) : '';
        const bugCategoryKey = ui.bugCategoryKey != null ? String(ui.bugCategoryKey) : '';
        const resolutionOption = this._disputeResolutionOptionByKey(resolutionKey);
        const flagAsBug = this._disputeResolutionIsFlagAsBugged(resolutionOption);
        const reasonLen = this._disputeResolutionReasonLength(reason);
        const reasonMeetsMin = reasonLen >= DASH_DISPUTE_RESOLUTION_REASON_MIN_CHARS;
        const bugCategorySelected = !flagAsBug || Boolean(this._disputeBugCategoryByKey(bugCategoryKey));
        const canResolve = reasonMeetsMin && resolutionKey && bugCategorySelected && !ui.submitting;
        const resolveDisabled = !canResolve ? ' disabled' : '';
        const resolveStyle = !canResolve ? ' opacity: 0.45; cursor: not-allowed;' : '';
        const resolveLabel = !ui.submitting && !reasonMeetsMin
            ? (reasonLen + '/' + DASH_DISPUTE_RESOLUTION_REASON_MIN_CHARS + ' chars')
            : 'Resolve';
        const resolveBtnHtml = `<button type="button" data-wf-dash-dispute-resolve="1" data-dispute-id="${escDisputeId}" data-item-id="${escItemId}" class="${secondaryClass}" style="flex-shrink: 0; white-space: nowrap;${resolveStyle}"${resolveDisabled}${disabled}>${dashEscHtml(resolveLabel)}</button>`;
        const selectStyle = this._compactSelectStyle();
        const textareaStyle = this._autoGrowTextareaStyle();

        let releaseHtml = `<button type="button" data-wf-dash-dispute-release="1" data-dispute-id="${escDisputeId}" data-item-id="${escItemId}" class="${basicClass}" style="flex-shrink: 0; white-space: nowrap;"${disabled}>Release</button>`;

        const envBtnStyle = 'flex-shrink: 0; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px;';
        const envBtn = url
            ? `<button type="button" data-wf-dash-dispute-open-env="1" data-dispute-id="${escDisputeId}" class="${basicClass}" style="${envBtnStyle}"${disabled}>Resolve with Environment${this._extLinkIconSvg(true)}</button>`
            : '';

        const bugCategorySelect = flagAsBug
            ? `<select data-wf-dash-dispute-bug-category="1" data-dispute-id="${escDisputeId}" data-item-id="${escItemId}" style="${selectStyle}" aria-label="Bug category"${disabled}>`
                + this._disputeBugCategoryOptionsHtml(bugCategoryKey)
                + '</select>'
            : '';

        return `<div data-wf-dash-dispute-resolution="${escDisputeId}" data-item-id="${escItemId}" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 80%, transparent); display: flex; flex-direction: column; gap: 8px;">`
            + `<textarea ${DASH_AUTO_GROW_TEXTAREA_ATTR}="1" data-wf-dash-dispute-resolution-input="1" data-dispute-id="${escDisputeId}" data-item-id="${escItemId}" rows="2" placeholder="Resolution reason…" style="${textareaStyle}"${disabled}>${dashEscHtml(reason)}</textarea>`
            + `<div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;">`
            + `<div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0;">`
            + `<select data-wf-dash-dispute-resolution-status="1" data-dispute-id="${escDisputeId}" data-item-id="${escItemId}" style="${selectStyle}"${disabled}>`
            + `<option value=""${resolutionKey ? '' : ' selected'} disabled hidden>Select resolution</option>`
            + this._disputeResolutionOptionsHtml(resolutionKey)
            + `</select>`
            + bugCategorySelect
            + `</div>`
            + `<div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto;">`
            + envBtn
            + releaseHtml
            + resolveBtnHtml
            + `</div></div></div>`;
    },

    _patchDisputeResolutionPanel(disputeId, itemId) {
        const id = String(disputeId || '').trim();
        const iid = String(itemId || '').trim();
        if (!id || !iid || !this._modal) return false;
        const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
        const wrap = this._modal.querySelector('[data-wf-dash-dispute-resolution="' + esc + '"]');
        if (!wrap) return false;
        const item = this._findCachedItem(iid) || this._findResultItem(iid);
        if (!item) return false;
        const disputes = item.disputes || [];
        const display = disputes.find((d) => String(d.id || '').trim() === id);
        if (!display) return false;

        const focus = this._textareaFocusSnapshot(wrap, '[data-wf-dash-dispute-resolution-input]');

        wrap.outerHTML = this._disputeResolutionPanelHtml(display, iid);
        const newWrap = this._modal.querySelector('[data-wf-dash-dispute-resolution="' + esc + '"]');
        this._restoreTextareaFocus(newWrap, '[data-wf-dash-dispute-resolution-input]', focus);
        return true;
    },

    _handleDisputeResolutionInput(disputeId, itemId, value) {
        const id = String(disputeId || '').trim();
        if (!id) return;
        const ui = this._getDisputeClaimUi(id);
        ui.resolutionReason = String(value || '');
        if (!this._patchDisputeResolutionPanel(id, itemId)) {
            this._patchTaskCard(itemId);
        }
    },

    _handleDisputeResolutionStatusChange(disputeId, itemId, key) {
        const id = String(disputeId || '').trim();
        if (!id) return;
        const ui = this._getDisputeClaimUi(id);
        const nextKey = String(key || '').trim();
        ui.resolutionKey = nextKey;
        const nextOption = this._disputeResolutionOptionByKey(nextKey);
        if (!this._disputeResolutionIsFlagAsBugged(nextOption)) {
            ui.bugCategoryKey = '';
        }
        if (!this._patchDisputeResolutionPanel(id, itemId)) {
            this._patchTaskCard(itemId);
        }
    },

    _handleDisputeBugCategoryChange(disputeId, itemId, key) {
        const id = String(disputeId || '').trim();
        if (!id) return;
        const ui = this._getDisputeClaimUi(id);
        ui.bugCategoryKey = String(key || '').trim();
        if (!this._patchDisputeResolutionPanel(id, itemId)) {
            this._patchTaskCard(itemId);
        }
    },

    async _handleDisputeRelease(disputeId, itemId) {
        const id = String(disputeId || '').trim();
        if (!id || !itemId) {
            this._logDashApiSkip('dispute-release', 'missing dispute or item id');
            return;
        }
        const ui = this._getDisputeClaimUi(id);
        if (ui.submitting || ui.status !== 'claimed') {
            this._logDashApiSkip('dispute-release', ui.submitting ? 'already submitting' : 'not claimed', id);
            return;
        }

        this._logDashApiClick('dispute-release', id);
        ui.submitting = true;
        this._patchTaskCard(itemId);
        try {
            await this._fleetWebPost(this._disputeReleaseApiPath(id), {
                referer: this._disputeResolveReferer(id)
            });
            delete this._state.disputeClaimUi[id];
            Logger.log('search-output: dispute released — ' + id);
            await this._rehydrateCard(itemId);
        } catch (e) {
            ui.submitting = false;
            Logger.warn('search-output: dispute release failed — ' + id, e);
            this._patchTaskCard(itemId);
        }
    },

    async _handleDisputeResolve(disputeId, itemId) {
        const id = String(disputeId || '').trim();
        if (!id || !itemId) {
            this._logDashApiSkip('dispute-resolve', 'missing dispute or item id');
            return;
        }
        const ui = this._getDisputeClaimUi(id);
        const reason = String(ui.resolutionReason || '').trim();
        const option = this._disputeResolutionOptionByKey(ui.resolutionKey);
        if (!option) {
            this._logDashApiSkip('dispute-resolve', 'missing resolution', id);
            return;
        }
        if (this._disputeResolutionIsFlagAsBugged(option) && !this._disputeBugCategoryByKey(ui.bugCategoryKey)) {
            this._logDashApiSkip('dispute-resolve', 'missing bug category', id);
            return;
        }
        if (reason.length < DASH_DISPUTE_RESOLUTION_REASON_MIN_CHARS) {
            this._logDashApiSkip('dispute-resolve', 'reason under '
                + DASH_DISPUTE_RESOLUTION_REASON_MIN_CHARS + ' chars', id);
            return;
        }
        if (ui.submitting) {
            this._logDashApiSkip('dispute-resolve', 'already submitting', id);
            return;
        }

        let evalTaskId = '';
        if (this._disputeResolutionIsFlagAsBugged(option)) {
            const item = this._findCachedItem(itemId) || this._findResultItem(itemId);
            if (!item || !item.task || !item.task.id) {
                this._logDashApiSkip('dispute-resolve', 'missing eval task id', id);
                return;
            }
            evalTaskId = String(item.task.id).trim();
        }

        this._logDashApiClick('dispute-resolve', id + ' — ' + option.key);
        ui.submitting = true;
        this._patchTaskCard(itemId);
        try {
            if (this._disputeResolutionIsFlagAsBugged(option)) {
                await this._fleetWebPost(this._flagBuggedApiPath(evalTaskId), {
                    body: this._buildFlagBuggedRequestBody(ui, reason),
                    referer: this._disputeResolveReferer(id)
                });
                Logger.log('search-output: task flagged bugged — ' + evalTaskId.slice(0, 8)
                    + ' (dispute ' + id + ', ' + option.status + ')');
            }
            await this._fleetWebPost(this._disputeResolveApiPath(id), {
                body: this._buildDisputeResolveRequestBody(ui, option, reason),
                referer: this._disputeResolveReferer(id)
            });
            delete this._state.disputeClaimUi[id];
            Logger.log('search-output: dispute resolved — ' + id + ' (' + option.key + ')');
            await this._syncDashboardDisputeResolvePrefetch(id, itemId, { option, reason, ui });
            await this._rehydrateCard(itemId);
        } catch (e) {
            ui.submitting = false;
            Logger.warn('search-output: dispute resolve failed — ' + id, e);
            this._patchTaskCard(itemId);
        }
    },

    _getActionBlockCollapseUi(blockId) {
        const id = String(blockId || '').trim();
        if (!id) return { collapsed: false };
        if (!this._state.actionBlockUi) this._state.actionBlockUi = {};
        if (!this._state.actionBlockUi[id]) {
            this._state.actionBlockUi[id] = { collapsed: false };
        }
        return this._state.actionBlockUi[id];
    },

    _ensureActionBlockCollapseDefault(blockId, collapsed) {
        const id = String(blockId || '').trim();
        if (!id) return;
        if (!this._state.actionBlockUi) this._state.actionBlockUi = {};
        if (!this._state.actionBlockUi[id]) {
            this._state.actionBlockUi[id] = { collapsed: !!collapsed };
        }
    },

    _actionBlockBodyHiddenStyle(blockId) {
        return this._getActionBlockCollapseUi(blockId).collapsed ? 'display: none;' : '';
    },

    _actionBlockHeaderRowHtml(blockId, leftHtml, rightHtml, opts) {
        const forceRight = opts && opts.forceRightSection;
        const rightSection = (rightHtml || forceRight)
            ? `<div${forceRight ? ' data-wf-dash-version-header-right="1"' : ''} style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; flex: 0 0 auto; flex-shrink: 0;">${rightHtml || ''}</div>`
            : '';
        return `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-height: 24px; width: 100%;" data-wf-dash-action-block-header="1">`
            + `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-width: 0; flex: 0 1 auto; max-width: 100%;">${leftHtml}</div>`
            + `<div data-wf-dash-action-block-toggle="${dashEscHtml(blockId)}" title="Expand or collapse" style="flex: 1 1 24px; min-width: 24px; min-height: 24px; align-self: stretch; cursor: pointer;"></div>`
            + rightSection
            + `</div>`;
    },

    _actionBlockShellHtml(blockId, itemId, shellStyle, headerRowHtml, bodyHtml, blockExtraAttrs, shellClass) {
        const bodyHidden = this._actionBlockBodyHiddenStyle(blockId);
        const escBlockId = dashEscHtml(blockId);
        const itemAttr = itemId ? ` data-wf-dash-item-id="${dashEscHtml(itemId)}"` : '';
        const extra = blockExtraAttrs || '';
        const classAttr = shellClass ? ` class="${dashEscHtml(shellClass.trim())}"` : '';
        return `<div data-wf-dash-action-block="${escBlockId}"${itemAttr}${extra}${classAttr} style="${shellStyle}">`
            + headerRowHtml
            + `<div data-wf-dash-action-block-body="1" style="display: flex; flex-direction: column; gap: 8px; ${bodyHidden}">${bodyHtml}</div>`
            + `</div>`;
    },

    _patchActionBlock(blockId) {
        const id = String(blockId || '').trim();
        if (!id || !this._modal) return false;
        const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
        const block = this._modal.querySelector('[data-wf-dash-action-block="' + esc + '"]');
        if (!block) return false;
        const body = block.querySelector('[data-wf-dash-action-block-body]');
        if (!body) return false;
        body.style.display = this._getActionBlockCollapseUi(id).collapsed ? 'none' : 'flex';
        return true;
    },

    _toggleActionBlockCollapse(blockId) {
        const id = String(blockId || '').trim();
        if (!id) return;
        const ui = this._getActionBlockCollapseUi(id);
        ui.collapsed = !ui.collapsed;
        if (!this._patchActionBlock(id)) {
            const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
            const block = this._modal && this._modal.querySelector('[data-wf-dash-action-block="' + esc + '"]');
            const itemId = block && block.getAttribute('data-wf-dash-item-id');
            if (itemId) this._patchTaskCard(itemId);
        }
    },

    async _claimDispute(disputeId, itemId) {
        const id = String(disputeId || '').trim();
        if (!id || !itemId) {
            this._logDashApiSkip('dispute-claim', 'missing dispute or item id');
            return;
        }
        const ui = this._getDisputeClaimUi(id);
        if (ui.status === 'claiming' || ui.status === 'claimed') {
            this._logDashApiSkip('dispute-claim', 'already ' + ui.status, id);
            return;
        }
        this._logDashApiClick('dispute-claim', id);
        ui.status = 'claiming';
        this._patchTaskCard(itemId);

        const attemptClaim = async (retriedAfterRelease) => {
            try {
                await this._fleetWebPost(this._disputeClaimApiPath(id));
                ui.status = 'claimed';
                ui.claimedAt = Date.now();
                ui.resolutionReason = '';
                ui.resolutionKey = '';
                ui.bugCategoryKey = '';
                ui.submitting = false;
                Logger.log('search-output: dispute claimed — ' + id
                    + (retriedAfterRelease ? ' (after releasing prior lease)' : ''));
                return;
            } catch (e) {
                if (!retriedAfterRelease) {
                    const body = this._parseFleetWebPostErrorBody(e);
                    const activeId = body && body.activeDisputeId != null
                        ? String(body.activeDisputeId).trim()
                        : '';
                    const errMsg = body && body.error != null ? String(body.error) : '';
                    if (activeId && activeId !== id && /active dispute claimed/i.test(errMsg)) {
                        Logger.log('search-output: dispute claim blocked by active lease '
                            + activeId + ' — releasing and retrying ' + id);
                        try {
                            await this._fleetWebPost(this._disputeReleaseApiPath(activeId), {
                                referer: this._disputeResolveReferer(activeId)
                            });
                            delete this._state.disputeClaimUi[activeId];
                            this._patchCardsForDisputeId(activeId);
                            await attemptClaim(true);
                            return;
                        } catch (releaseErr) {
                            Logger.warn('search-output: release active dispute ' + activeId
                                + ' failed before reclaim — ' + id, releaseErr);
                        }
                    }
                }
                ui.status = 'idle';
                Logger.warn('search-output: dispute claim failed — ' + id, e);
            }
        };

        try {
            await attemptClaim(false);
            if (this._getDisputeClaimUi(id).status === 'claimed') {
                await this._rehydrateCard(itemId);
            } else {
                this._patchTaskCard(itemId);
            }
        } catch (_e) {
            this._patchTaskCard(itemId);
        }
    },

    _patchTaskCard(itemId) {
        if (this._state.loading) return;
        const wrap = this._q('#wf-dash-results');
        if (!wrap || !itemId) return;
        const item = this._findCachedItem(itemId) || this._findResultItem(itemId);
        if (!item) return;
        const cards = wrap.querySelectorAll('[data-wf-dash-task-card]');
        let existing = null;
        for (const el of cards) {
            if (el.getAttribute('data-item-id') === itemId) {
                existing = el;
                break;
            }
        }
        const html = this._resultCardHtml(item);
        const doc = this._pageWindow().document;
        const temp = doc.createElement('div');
        temp.innerHTML = html;
        const newCard = temp.firstElementChild;
        if (!newCard) return;
        if (existing) {
            this._detachCardRollingListeners(existing);
            existing.replaceWith(newCard);
        } else {
            wrap.appendChild(newCard);
        }
        const item2 = this._findCachedItem(itemId) || this._findResultItem(itemId);
        if (item2) {
            const ui = this._getCardUi(item2.task.id);
            const versionCount = (item2.task.promptVersions && item2.task.promptVersions.length) || 0;
            if (ui.expanded && versionCount >= 2) {
                this._attachCardRollingListeners(newCard, itemId, item2.task.id);
            } else {
                this._detachCardRollingListeners(newCard);
            }
        }
        this._syncAutoGrowTextareasIn(newCard);
        this._syncResultsHydrateBannerUi();
    },

    _syncAutoGrowTextarea(ta, minHeightPx) {
        if (!ta || String(ta.tagName || '').toUpperCase() !== 'TEXTAREA') return;
        const minH = minHeightPx != null ? Number(minHeightPx) : DASH_AUTO_GROW_TEXTAREA_MIN_PX;
        ta.style.height = 'auto';
        ta.style.height = Math.max(minH, ta.scrollHeight) + 'px';
    },

    _syncAutoGrowTextareasIn(rootEl) {
        const root = rootEl || this._modal;
        if (!root || !root.querySelectorAll) return;
        root.querySelectorAll('[' + DASH_AUTO_GROW_TEXTAREA_ATTR + ']').forEach((ta) => {
            this._syncAutoGrowTextarea(ta, DASH_AUTO_GROW_TEXTAREA_MIN_PX);
        });
    },

    _searchLoadMessage(base, count, total) {
        const label = String(base || '').trim().replace(/\s*\(\d+(?:\/\d+)?\)\s*$/, '');
        if (count == null || Number.isNaN(Number(count))) return label;
        const n = Number(count);
        if (total != null && !Number.isNaN(Number(total)) && Number(total) !== n) {
            return label + ' (' + n + '/' + total + ')';
        }
        return label + ' (' + n + ')';
    },

    _trackSearchLoadPromise(message, promiseOrFn) {
        const base = String(message || '').trim();
        const id = this._beginSearchLoadEntry(base);
        const tracker = {
            setCount: (count, total) => {
                this._updateSearchLoadEntry(id, this._searchLoadMessage(base, count, total));
            },
            setMessage: (text) => {
                this._updateSearchLoadEntry(id, String(text || '').trim());
            },
            resolve: (count, total) => {
                this._resolveSearchLoadEntry(
                    id,
                    count != null ? this._searchLoadMessage(base, count, total) : undefined
                );
            }
        };
        const run = typeof promiseOrFn === 'function' ? promiseOrFn(tracker) : promiseOrFn;
        return Promise.resolve(run).then(
            (value) => {
                const log = this._state.searchLoadLog;
                const entry = Array.isArray(log) ? log.find((e) => e.id === id) : null;
                if (!entry || entry.resolved) return value;
                if (Array.isArray(value)) {
                    tracker.resolve(value.length);
                } else if (value instanceof Map) {
                    tracker.resolve(value.size);
                } else if (typeof value === 'number' && !Number.isNaN(value)) {
                    tracker.resolve(value);
                } else if (value && typeof value === 'object') {
                    if (Array.isArray(value.rows)) {
                        tracker.resolve(value.rows.length);
                    } else if (value.openDisputesByTaskId instanceof Map) {
                        let rowCount = 0;
                        for (const rows of value.openDisputesByTaskId.values()) rowCount += rows.length;
                        tracker.resolve(rowCount);
                    } else if (value.resolverDisputeTaskIds instanceof Set) {
                        tracker.resolve(value.resolverDisputeTaskIds.size);
                    } else {
                        tracker.resolve();
                    }
                } else {
                    tracker.resolve();
                }
                return value;
            },
            (err) => {
                this._resolveSearchLoadEntry(id, base + ' — failed');
                throw err;
            }
        );
    },

    _visibleSearchLoadLogEntries() {
        const log = Array.isArray(this._state.searchLoadLog) ? this._state.searchLoadLog : [];
        const unresolvedEntries = log.filter((e) => !e.resolved);
        const resolvedEntries = log.filter((e) => e.resolved);
        const cap = Math.max(unresolvedEntries.length, 5);
        return [...unresolvedEntries, ...resolvedEntries].slice(0, cap);
    },

    _searchLoadLogRowStyle(e) {
        const failed = e.resolved && String(e.message || '').endsWith('— failed');
        const textStyle = e.resolved
            ? (failed ? 'color: var(--destructive, #dc2626);' : 'color: var(--success, #16a34a);')
            : 'color: var(--muted-foreground, #64748b);';
        return 'display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 400;'
            + ' line-height: 1.5; min-width: 0;' + textStyle;
    },

    _searchLoadLogMarkHtml(e) {
        if (e.resolved) {
            return '<span data-wf-dash-load-mark="1" aria-hidden="true" style="flex-shrink: 0; width: 12px; text-align: center;">✅</span>';
        }
        return this._loadingSpinnerHtml(12).replace(
            '<span class="fleet-ui-spinner"',
            '<span data-wf-dash-load-mark="1" class="fleet-ui-spinner"'
        );
    },

    _searchLoadLogRowHtml(e) {
        return `<div data-wf-dash-results-load-log-line="${e.id}" data-wf-dash-load-state="${this._searchLoadLogStateKey(e)}" style="${this._searchLoadLogRowStyle(e)}">`
            + this._searchLoadLogMarkHtml(e)
            + `<span data-wf-dash-load-text="1" style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${dashEscHtml(e.message)}</span></div>`;
    },

    _searchLoadLogStateKey(e) {
        if (!e.resolved) return 'pending';
        return String(e.message || '').endsWith('— failed') ? 'failed' : 'ok';
    },

    _searchLoadPhaseDisplayText(phase) {
        return String(phase || '').trim()
            .replace(/\s*\(\d+(?:\/\d+)?\)\s*$/, '')
            .replace(/[….]+\s*$/, '')
            .replace(/\.\s*$/, '');
    },

    _applySearchLoadPhaseDom(phaseEl, phase) {
        const display = this._searchLoadPhaseDisplayText(phase);
        if (!display) {
            phaseEl.textContent = '';
            phaseEl.style.display = 'none';
            phaseEl.removeAttribute('data-wf-dash-dots');
            return;
        }
        phaseEl.textContent = display;
        phaseEl.style.display = '';
        phaseEl.setAttribute('data-wf-dash-dots', '1');
    },

    _searchLoadOverlayStyle() {
        return 'display: flex; align-items: flex-start; width: 100%; box-sizing: border-box;'
            + ' padding: 48px 16px; min-height: 120px;';
    },

    _searchLoadOverlayAnchorStyle() {
        return 'flex: 0 0 33%; min-width: 0; align-self: stretch;';
    },

    _reorderSearchLoadLogRows(logEl, entries) {
        for (let i = 0; i < entries.length; i++) {
            const row = logEl.querySelector(`[data-wf-dash-results-load-log-line="${entries[i].id}"]`);
            if (!row) continue;
            const desiredBefore = logEl.children[i];
            if (desiredBefore !== row) {
                logEl.insertBefore(row, desiredBefore || null);
            }
        }
    },

    _patchSearchLoadLogDom(colEl) {
        if (!colEl) return;
        const entries = this._visibleSearchLoadLogEntries();
        let logEl = colEl.querySelector('[data-wf-dash-results-load-log]');
        if (entries.length === 0) {
            if (logEl) logEl.remove();
            return;
        }
        if (!logEl) {
            colEl.insertAdjacentHTML('beforeend',
                '<div data-wf-dash-results-load-log style="margin-top: 8px; max-height: 160px; overflow-y: auto;'
                + ' display: flex; flex-direction: column; gap: 2px;"></div>');
            logEl = colEl.querySelector('[data-wf-dash-results-load-log]');
        }
        const visibleIds = new Set(entries.map((entry) => entry.id));
        logEl.querySelectorAll('[data-wf-dash-results-load-log-line]').forEach((row) => {
            const id = Number(row.getAttribute('data-wf-dash-results-load-log-line'));
            if (!visibleIds.has(id)) row.remove();
        });
        const doc = this._pageWindow().document;
        for (const entry of entries) {
            let row = logEl.querySelector(`[data-wf-dash-results-load-log-line="${entry.id}"]`);
            if (!row) {
                const wrapper = doc.createElement('div');
                wrapper.innerHTML = this._searchLoadLogRowHtml(entry);
                row = wrapper.firstElementChild;
                logEl.appendChild(row);
                continue;
            }
            const stateKey = this._searchLoadLogStateKey(entry);
            if (row.getAttribute('data-wf-dash-load-state') !== stateKey) {
                row.setAttribute('data-wf-dash-load-state', stateKey);
                row.style.cssText = this._searchLoadLogRowStyle(entry);
                if (entry.resolved) {
                    const markEl = row.querySelector('[data-wf-dash-load-mark]');
                    if (markEl) {
                        markEl.outerHTML = '<span data-wf-dash-load-mark="1" aria-hidden="true" style="flex-shrink: 0; width: 12px; text-align: center;">✅</span>';
                    }
                }
            }
            const textSpan = row.querySelector('[data-wf-dash-load-text]');
            if (textSpan && textSpan.textContent !== entry.message) {
                textSpan.textContent = entry.message;
            }
        }
        this._reorderSearchLoadLogRows(logEl, entries);
    },

    _searchLoadLogHtml() {
        const entries = this._visibleSearchLoadLogEntries();
        if (entries.length === 0) return '';
        const lines = entries.map((e) => this._searchLoadLogRowHtml(e)).join('');
        return `<div data-wf-dash-results-load-log style="margin-top: 8px; max-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px;">${lines}</div>`;
    },

    _syncSearchLoadPhaseUi() {
        const wrap = this._q('#wf-dash-results');
        if (!wrap || !this._state || !this._state.loading) return;
        wrap.querySelectorAll('[data-wf-dash-task-card]').forEach((el) => el.remove());
        const phase = String(this._state.searchLoadPhase || '').trim();
        const phaseStyle = 'font-size: 13px; font-weight: 500; color: var(--foreground, #0f172a); line-height: 1.45;';
        const colStyle = 'display: flex; flex-direction: column; align-items: flex-start; flex: 1; min-width: 0; max-width: min(420px, 100%);';
        const overlayStyle = this._searchLoadOverlayStyle();
        const anchorStyle = this._searchLoadOverlayAnchorStyle();
        const stopBtnHtml = this._stopSearchButtonHtml();
        const logHtml = this._searchLoadLogHtml();
        let loadingEl = wrap.querySelector('[data-wf-dash-results-loading]');
        if (!loadingEl) {
            const phaseDisplay = this._searchLoadPhaseDisplayText(phase);
            wrap.innerHTML = `<div data-wf-dash-results-loading="1" style="${overlayStyle}">
                <div data-wf-dash-results-load-anchor aria-hidden="true" style="${anchorStyle}"></div>
                <div data-wf-dash-results-load-col style="${colStyle}">
                    ${stopBtnHtml}
                    <span data-wf-dash-results-load-phase style="${phaseStyle}${phaseDisplay ? '' : ' display: none;'}"${phaseDisplay ? ' data-wf-dash-dots="1"' : ''}>${dashEscHtml(phaseDisplay)}</span>
                    ${logHtml}
                </div>
            </div>`;
            return;
        }
        loadingEl.style.cssText = overlayStyle;
        let anchorEl = loadingEl.querySelector('[data-wf-dash-results-load-anchor]');
        if (!anchorEl) {
            loadingEl.insertAdjacentHTML('afterbegin',
                `<div data-wf-dash-results-load-anchor aria-hidden="true" style="${anchorStyle}"></div>`);
            anchorEl = loadingEl.querySelector('[data-wf-dash-results-load-anchor]');
        } else {
            anchorEl.style.cssText = anchorStyle;
        }
        loadingEl.querySelectorAll(':scope > [aria-hidden="true"]:not([data-wf-dash-results-load-anchor])').forEach((el) => el.remove());
        const colEl = loadingEl.querySelector('[data-wf-dash-results-load-col]');
        if (colEl) colEl.style.cssText = colStyle;
        let stopBtn = colEl ? colEl.querySelector('[data-wf-dash-stop-search]') : null;
        if (stopBtnHtml) {
            if (!stopBtn && colEl) {
                colEl.insertAdjacentHTML('afterbegin', stopBtnHtml);
            }
        } else if (stopBtn) {
            stopBtn.remove();
        }
        const phaseEl = loadingEl.querySelector('[data-wf-dash-results-load-phase]');
        if (phaseEl) {
            this._applySearchLoadPhaseDom(phaseEl, phase);
        }
        this._patchSearchLoadLogDom(colEl);
    },

    _setSearchLoadPhase(message, count, total) {
        if (!this._state || !this._state.loading) return;
        this._state.searchLoadPhase = this._searchLoadMessage(String(message || '').trim(), count, total);
        this._syncSearchLoadPhaseUi();
    },

    _searchFetchSourcesLabel({ includeTaskCreation, includeQa, includeDisputes, includeSeniorReview, includeSessions }) {
        const parts = [];
        if (includeTaskCreation) parts.push('task creations');
        if (includeQa) parts.push('QA feedback');
        if (includeDisputes) parts.push('disputes');
        if (includeSeniorReview) parts.push('Sr Review flags');
        if (includeSessions) parts.push('sessions');
        if (parts.length === 0) return 'Fetching data…';
        if (parts.length === 1) return 'Fetching ' + parts[0] + '…';
        if (parts.length === 2) return 'Fetching ' + parts[0] + ' and ' + parts[1] + '…';
        if (parts.length === 3) {
            return 'Fetching ' + parts[0] + ', ' + parts[1] + ', and ' + parts[2] + '…';
        }
        return 'Fetching ' + parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1] + '…';
    },

    _updateResultsStatus() {
        const el = this._q('#wf-dash-results-status');
        if (!el) return;
        const s = this._state;
        const label = this._labelStyle();

        if (s.loading) {
            const committed = s.committed;
            const retrieving = committed && committed.retrieveMode;
            const detail = retrieving
                ? ('task: ' + (committed.retrieveLabel || ''))
                : this._searchStatusDetail(committed);
            const verb = retrieving ? 'Retrieving' : 'Searching';
            el.innerHTML = detail
                ? `<span style="${label}">${verb} — ${dashEscHtml(detail)}</span>`
                : `<span style="${label}">${verb}…</span>`;
            return;
        }
        if (s.searchError && !s.cachedItems) {
            el.textContent = '';
            return;
        }
        if (!s.hasSearched) {
            el.textContent = 'Set search parameters on the left, then press Search.';
            return;
        }
        if (s.filteredItems !== null && s.cachedItems !== null && s.committed) {
            const committed = s.committed;
            if (committed.accumulatedResults) {
                const scopeTotal = this._getFilterScopeItems().length;
                const tabs = this._resultsKindTabsMeta(committed);
                const activeTab = s.resultsKindTab || 'all';
                let tabNote = '';
                if (tabs.length > 1 && activeTab !== 'all') {
                    const activeMeta = tabs.find((t) => t.id === activeTab);
                    if (activeMeta) tabNote = ' in ' + activeMeta.label;
                }
                const countLabel = s.filteredItems.length === scopeTotal
                    ? s.filteredItems.length + ' result(s)' + tabNote
                    : s.filteredItems.length + ' of ' + scopeTotal + ' result(s)' + tabNote;
                el.innerHTML = `<span style="${label}">${dashEscHtml(countLabel)} — accumulated results</span>`;
                return;
            }
            if (committed.retrieveMode) {
                const scopeTotal = this._getFilterScopeItems().length;
                const countLabel = s.filteredItems.length === scopeTotal
                    ? s.filteredItems.length + ' result(s)'
                    : s.filteredItems.length + ' of ' + scopeTotal + ' result(s)';
                el.innerHTML = `<span style="${label}">${dashEscHtml(countLabel)} — retrieved task ${dashEscHtml(committed.retrieveLabel || '')} · fully hydrated</span>`;
                return;
            }
            const authorLabel = committed.ratingsEveryone
                ? '@everyone'
                : (committed.authorLabels && committed.authorLabels.length > 0
                    ? committed.authorLabels.join(', ')
                    : (committed.authorCount > 0 ? committed.authorCount + ' contributor(s)' : 'all contributors'));
            const scopeTotal = this._getFilterScopeItems().length;
            const tabs = this._resultsKindTabsMeta(committed);
            const activeTab = s.resultsKindTab || 'all';
            let tabNote = '';
            if (tabs.length > 1 && activeTab !== 'all') {
                const activeMeta = tabs.find((t) => t.id === activeTab);
                if (activeMeta) tabNote = ' in ' + activeMeta.label;
            }
            const countLabel = s.filteredItems.length === scopeTotal
                ? s.filteredItems.length + ' result(s)' + tabNote
                : s.filteredItems.length + ' of ' + scopeTotal + ' result(s)' + tabNote;
            const modes = [];
            if (committed.includeTaskCreation) modes.push({ kind: 'task_creation', label: 'tasks' });
            if (committed.includeQa) modes.push({ kind: 'qa', label: 'QA' });
            if (committed.includeDisputes) modes.push({ kind: 'dispute', label: 'disputes' });
            if (committed.includeSeniorReview) modes.push({ kind: 'senior_review', label: 'Sr Review' });
            if (committed.includeSessions) modes.push({ kind: 'sessions', label: 'sessions' });
            const modeHtml = modes.map((mode, index) => {
                const cfg = DASH_OUTPUT_KIND_CONFIG[mode.kind];
                const hl = cfg ? cfg.textHighlight : '';
                return (index > 0 ? ' + ' : '') + `<span style="${hl}">${dashEscHtml(mode.label)}</span>`;
            }).join('');
            const disputesNote = s.disputesBulkIncomplete
                ? ' · disputes list may be incomplete (narrow date range)'
                : '';
            const flagsNote = s.flagsBulkIncomplete
                ? ' · Sr Review list may be incomplete (narrow date range)'
                : '';
            const prefetchLoadingNote = this._prefetchLoadingActive()
                ? ' · loading prefetch caches…'
                : '';
            el.innerHTML = `<span style="${label}">${dashEscHtml(countLabel)} — ${dashEscHtml(authorLabel)} · ${modeHtml}${dashEscHtml(disputesNote)}${dashEscHtml(flagsNote)}${dashEscHtml(prefetchLoadingNote)}</span>`;
            return;
        }
        el.textContent = '';
    },

    _renderResults() {
        const wrap = this._q('#wf-dash-results');
        if (!wrap) return;
        const s = this._state;
        const muted = 'font-size: 12px; color: var(--muted-foreground, #64748b);';

        if (s.loading) {
            this._syncSearchLoadPhaseUi();
            return;
        }
        if (s.searchError && !s.cachedItems) {
            wrap.innerHTML = '';
            return;
        }
        if (!s.hasSearched) {
            wrap.innerHTML = `<p style="${muted}">Results will appear here after you run a search.</p>`;
            return;
        }
        if (s.filteredItems === null) {
            wrap.innerHTML = '';
            return;
        }
        const viewItems = this._getViewItems();
        if (!viewItems || viewItems.length === 0) {
            const scopeTotal = this._getFilterScopeItems().length;
            const msg = (s.cachedItems && s.cachedItems.length === 0)
                ? 'No results matched this search.'
                : scopeTotal === 0
                    ? 'No results in this tab.'
                    : 'No results match the current filters.';
            wrap.innerHTML = `<p style="font-size: 12px; color: var(--muted-foreground, #64748b);">${msg}</p>`;
            this._syncResultsToolbarDerivedUi();
            return;
        }
        const pageItems = this._getPaginatedViewItems();
        wrap.innerHTML = pageItems.map((item) => this._resultCardHtml(item)).join('');
        this._syncResultsToolbarDerivedUi();
        this._animateSeededSessionQaPanels(pageItems);
        this._schedulePageHydrate();
    },

    _applySessionQaSearchSeed(seedMap) {
        if (!seedMap || typeof seedMap !== 'object') return;
        if (!this._state.sessionQaUi) this._state.sessionQaUi = {};
        let seeded = 0;
        for (const [itemId, seed] of Object.entries(seedMap)) {
            if (!itemId || !seed) continue;
            const ui = this._getSessionQaUi(itemId);
            ui.status = seed.status || 'loaded';
            ui.reviews = Array.isArray(seed.reviews) ? seed.reviews.slice() : [];
            ui.message = seed.message != null ? seed.message : null;
            ui.visible = seed.visible === true;
            if (seed.animateOpen && ui.visible) ui.animateOpen = true;
            else delete ui.animateOpen;
            seeded += 1;
        }
        if (seeded > 0) {
            Logger.log('dashboard: session QA pre-seeded for ' + seeded + ' card(s)');
        }
    },

    _animateSeededSessionQaPanels(items) {
        const list = Array.isArray(items) ? items : [];
        for (const item of list) {
            if (!item || !item.id || !item.sessionSourced) continue;
            const ui = this._getSessionQaUi(item.id);
            if (!ui.visible || !this._sessionQaHasReviews(ui)) continue;
            if (ui.animateOpen) {
                delete ui.animateOpen;
                this._animateSessionQaOpen(item.id);
            } else {
                this._syncSessionQaPanelOpen(item.id, true);
            }
        }
    },

    _dashCopyInnerHtml(value, highlight) {
        if (highlight && highlight.query) {
            return this._dashHighlightedHtml(
                value,
                highlight.query,
                highlight.caseSensitive,
                highlight.fuzzy,
                highlight.regex
            );
        }
        return dashEscHtml(value);
    },

    _copyChipHtml(text, highlight) {
        const value = String(text == null ? '' : text).trim();
        if (!value) {
            return '<span style="display: inline-block; padding: 3px 8px; border: none; border-radius: 6px; font-size: 11px; color: var(--muted-foreground, #64748b); opacity: 0.6;">—</span>';
        }
        const inner = this._dashCopyInnerHtml(value, highlight);
        return '<button type="button" data-wf-dash-copy="' + dashEscHtml(value) + '" title="Click to copy" style="display: inline-block; max-width: 100%; padding: 3px 8px; border: none; border-radius: 6px; font-size: 11px; color: var(--foreground, #0f172a); background: transparent; text-align: left; overflow-wrap: anywhere; cursor: pointer;">' + inner + '</button>';
    },

    _copyIconHtml(text) {
        const lib = dashLib();
        return lib && lib.copyIconHtml ? lib.copyIconHtml(text) : '';
    },

    _extLinkIconSvg(active) {
        const stroke = active ? 'currentColor' : 'var(--muted-foreground, #94a3b8)';
        const opacity = active ? '1' : '0.45';
        return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: ${opacity}; flex-shrink: 0;"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>`;
    },

    _extLinkHtml(href, title) {
        const url = String(href || '').trim();
        if (!url) return '';
        return `<a href="${dashEscHtml(url)}" target="_blank" rel="noopener noreferrer" title="${dashEscHtml(title)}" aria-label="${dashEscHtml(title)}" style="display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border-radius: 6px; color: var(--muted-foreground, #64748b); text-decoration: none;">
            ${this._extLinkIconSvg(true)}
        </a>`;
    },

    _extLinkButtonStyle() {
        return 'display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; color: var(--muted-foreground, #64748b); border: none; background: transparent; padding: 0; cursor: pointer;';
    },

    _taskOpenLinkHtml(task, itemId, options) {
        const opts = options || {};
        const taskId = String(task && task.id || '').trim();
        if (!taskId) return '';
        const teamId = String(task.teamId || '').trim();
        const ui = this._getTaskOpenUi(taskId);
        const title = 'Open task in Fleet';
        const flushStyle = opts.flushHorizontal
            ? ' border-radius: 0 6px 0 0; width: ' + DASH_CARD_TAB_HEIGHT + '; height: ' + DASH_CARD_TAB_HEIGHT + ';'
            : '';
        if (ui.status === 'switching') {
            const teamLabel = this._teamName(teamId) || 'team';
            return `<button type="button" disabled aria-busy="true" title="${dashEscHtml(title)}" style="${this._extLinkButtonStyle()} gap: 6px; width: auto; max-width: 100%; padding: 2px 8px; cursor: wait; opacity: 0.9;">`
                + `${this._loadingSpinnerHtml(14)}`
                + `<span style="font-size: 11px; font-weight: 500; white-space: nowrap;">Switching to ${dashEscHtml(teamLabel)}</span>`
                + `</button>`;
        }
        return `<button type="button" data-wf-dash-open-task="1" data-task-id="${dashEscHtml(taskId)}" data-team-id="${dashEscHtml(teamId)}" data-item-id="${dashEscHtml(itemId)}" title="${dashEscHtml(title)}" aria-label="${dashEscHtml(title)}" class="${this._dashBtnClass('basic', 'icon')}" style="${flushStyle}">`
            + `${this._extLinkIconSvg(true)}`
            + `</button>`;
    },

    _labelSpan(text) {
        return `<span style="${this._labelStyle()}">${dashEscHtml(text)}</span>`;
    },

    _promptVersionCountHtml(versionNo, totalVersions) {
        const labelStyle = this._labelStyle();
        return `<span style="${labelStyle}">${dashEscHtml(' ' + versionNo + ' of ' + totalVersions)}</span>`;
    },

    _collapsedVersionPickerHtml(itemId, taskId, versions, selectedDisplayNo, totalVersions) {
        const versionOptions = [...versions]
            .sort((a, b) => a.displayVersionNo - b.displayVersionNo)
            .map((v) => `<option value="${v.displayVersionNo}"${v.displayVersionNo === selectedDisplayNo ? ' selected' : ''}>v${v.displayVersionNo} of ${totalVersions}</option>`)
            .join('');
        return `<span style="display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <select data-wf-dash-card-version-select="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(taskId)}" style="${this._inputStyle()} width: auto; padding: 2px 8px; font-size: 11px; cursor: pointer;" aria-label="Select prompt version">${versionOptions}</select>
            <button type="button" data-wf-dash-card-show-all="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(taskId)}" class="${this._dashBtnClass('basic', 'compact')}">Show All</button>
        </span>`;
    },

    _expandedVersionHeaderHtml(itemId, taskId, displayVersionNo, totalVersions) {
        return `<span style="display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${this._promptVersionCountHtml(displayVersionNo, totalVersions)}
            <button type="button" data-wf-dash-card-collapse="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(taskId)}" data-display-no="${displayVersionNo}" class="${this._dashBtnClass('basic', 'compact')}">Collapse</button>
        </span>`;
    },

    _fieldGroupHtml(label, valueHtml, opts) {
        const options = opts || {};
        const nowrap = Boolean(options.nowrap);
        const groupStyle = nowrap
            ? 'display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; flex-shrink: 0; white-space: nowrap;'
            : 'display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex: 0 1 auto; max-width: 100%; min-width: 0;';
        const valueStyle = nowrap
            ? 'display: inline-flex; align-items: center; gap: 4px; flex-wrap: nowrap; flex-shrink: 0;'
            : 'min-width: 0; max-width: 100%; display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap;';
        return `<div style="${groupStyle}">${this._labelSpan(label)}<span style="${valueStyle}">${valueHtml}</span></div>`;
    },

    _notesToQaSectionHtml(notes, highlightQuery, caseSensitive, highlightFuzzy, highlightRegex) {
        const text = this._dashQuotedText(notes);
        if (!text) return '';
        const body = this._dashQuotedHighlightedHtml(notes, highlightQuery || '', Boolean(caseSensitive), Boolean(highlightFuzzy), Boolean(highlightRegex));
        return '<div data-wf-dash-notes-to-qa="1" style="margin: 8px 0 0 0;">'
            + this._quotedFieldBlockHtml('Notes to QA', body, text, { bodyStyle: this._mutedQuotedFieldBodyStyle() })
            + '</div>';
    },

    _plainTimestampHtml(iso, prefixLabel, opts) {
        const formatted = dashFormatCreatedAt(iso);
        const ago = dashLib().relativeAgo(iso, { style: 'detailed' });
        const muted = Boolean(opts && opts.muted);
        const dateColor = muted
            ? 'color: var(--muted-foreground, #64748b);'
            : 'color: var(--foreground, #0f172a);';
        const parts = [];
        if (prefixLabel) {
            parts.push(`<span style="${this._labelStyle()}">${dashEscHtml(prefixLabel)}</span>`);
        }
        parts.push(`<span style="${dateColor}">${dashEscHtml(formatted)}</span>`);
        if (ago) {
            parts.push(`<span style="font-size: 11px; color: var(--muted-foreground, #64748b);">(${dashEscHtml(ago)})</span>`);
        }
        return `<span style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">${parts.join('')}</span>`;
    },

    _dashHighlightSegmentsHtml(text, query, caseSensitive, fuzzy, regex) {
        const segments = dashLib().buildHighlightSegments(text, query, {
            caseSensitive,
            fuzzy: Boolean(fuzzy),
            regex: Boolean(regex)
        });
        return segments.map((seg) => (
            seg.match
                ? `<mark style="background: color-mix(in srgb, #facc15 45%, transparent); color: inherit; padding: 0 1px; border-radius: 2px;">${dashEscHtml(seg.text)}</mark>`
                : dashEscHtml(seg.text)
        )).join('');
    },

    _dashSplitMarkdownLinkParts(text) {
        const source = String(text ?? '');
        const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
        const parts = [];
        let lastIndex = 0;
        let match;
        while ((match = re.exec(source)) !== null) {
            if (match.index > lastIndex) {
                parts.push({ type: 'text', value: source.slice(lastIndex, match.index) });
            }
            parts.push({ type: 'link', label: match[1], url: match[2] });
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < source.length) {
            parts.push({ type: 'text', value: source.slice(lastIndex) });
        }
        if (parts.length === 0) {
            parts.push({ type: 'text', value: source });
        }
        return parts;
    },

    _dashHighlightedHtml(text, query, caseSensitive, fuzzy, regex) {
        const linkStyle = 'color: var(--brand, var(--primary, #2563eb)); text-decoration: underline;';
        return this._dashSplitMarkdownLinkParts(text).map((part) => {
            if (part.type === 'link') {
                const labelHtml = this._dashHighlightSegmentsHtml(part.label, query, caseSensitive, fuzzy, regex);
                return `<a href="${dashEscHtml(part.url)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">${labelHtml}</a>`;
            }
            return this._dashHighlightSegmentsHtml(part.value, query, caseSensitive, fuzzy, regex);
        }).join('');
    },

    _dashQuotedText(text) {
        return String(text ?? '').trim();
    },

    _dashQuotedHighlightedHtml(text, query, caseSensitive, fuzzy, regex) {
        return this._dashHighlightedHtml(this._dashQuotedText(text), query, caseSensitive, fuzzy, regex);
    },

    _cardHeaderMetaRowHtml(task, itemId) {
        const projectLink = task.projectId
            ? this._extLinkHtml(dashFleetProjectUrl(task.projectId), 'Open project in Fleet')
            : '';
        const flagBtn = this._flagForSeniorReviewBtnHtml(task, itemId);
        return `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 10px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">
                    <div style="flex: 1 1 220px; min-width: 0; overflow: hidden;">
                        <div style="display: flex; flex-wrap: nowrap; align-items: center; overflow-x: auto; min-width: 0; max-width: 100%; -webkit-overflow-scrolling: touch;">
                            ${this._fieldGroupHtml('Author', this._personChipsHtml(task.author.name, task.author.email, task.author.id, 'Open author in Fleet', 'task_creation', flagBtn, { nowrap: true }), { nowrap: true })}
                        </div>
                    </div>
                    <div style="flex: 1 1 220px; min-width: 0; overflow: hidden;">
                        <div style="display: flex; flex-wrap: nowrap; align-items: center; gap: 8px 16px; overflow-x: auto; min-width: 0; max-width: 100%; -webkit-overflow-scrolling: touch;">
                            ${this._fieldGroupHtml('Environment', this._copyChipHtml(task.environment), { nowrap: true })}
                            ${this._fieldGroupHtml('Team', this._copyChipHtml(task.team), { nowrap: true })}
                            ${this._fieldGroupHtml('Project', this._copyChipHtml(task.project || this._projectName(task.projectId)) + projectLink, { nowrap: true })}
                        </div>
                    </div>
                </div>`;
    },

    _dismissedBadgeHtml() {
        return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #7c3aed; background: color-mix(in srgb, #7c3aed 12%, transparent); letter-spacing: 0.04em;">DISMISSED FROM FLEET</span>`;
    },

    _contributorDeepDiveTitle(historyKind) {
        const label = dashKindLabels()[historyKind] || historyKind;
        return 'Deep dive ' + label + ' history';
    },

    _contributorDeepDiveBtnHtml(name, email, id, historyKind) {
        const personId = String(id || '').trim();
        if (!personId || !historyKind || !dashKindLabels()[historyKind]) return '';
        const title = this._contributorDeepDiveTitle(historyKind);
        return `<button type="button" data-wf-dash-contributor-deep-dive="1" data-wf-dash-history-kind="${dashEscHtml(historyKind)}" data-wf-dash-person-id="${dashEscHtml(personId)}" data-wf-dash-person-name="${dashEscHtml(String(name || ''))}" data-wf-dash-person-email="${dashEscHtml(String(email || ''))}" title="${dashEscHtml(title)}" aria-label="${dashEscHtml(title)}" style="${this._iconMicroBtnStyle()}">🔦</button>`;
    },

    _flagForSeniorReviewBtnHtml(task, itemId) {
        if (!this._shouldShowFlagCreateBtn(task)) return '';
        const escItemId = dashEscHtml(String(itemId || '').trim());
        return `<button type="button" data-wf-dash-flag-create-toggle="1" data-item-id="${escItemId}" title="Flag for Senior Review" aria-label="Flag for Senior Review" style="${this._iconMicroBtnStyle()}">🚩</button>`;
    },

    _personChipsHtml(name, email, id, linkTitle, historyKind, extraAfterDeepDive, opts) {
        if (!name && !email) return this._dismissedBadgeHtml() + (extraAfterDeepDive || '');
        const nowrap = Boolean((opts || {}).nowrap);
        const nameChip = name ? this._copyChipHtml(name) : '';
        const emailChip = email ? this._copyChipHtml(email) : '';
        const deepDive = this._contributorDeepDiveBtnHtml(name, email, id, historyKind);
        const link = this._extLinkHtml(dashFleetExpertUrl(id), linkTitle);
        const wrapStyle = nowrap ? 'flex-wrap: nowrap; flex-shrink: 0;' : 'flex-wrap: wrap; max-width: 100%; min-width: 0;';
        return `<span style="display: inline-flex; align-items: center; gap: 4px; ${wrapStyle}">${nameChip}${emailChip}${deepDive}${extraAfterDeepDive || ''}${link}</span>`;
    },

    _statusDisplayMeta(status) {
        const key = (status || 'unknown').toLowerCase();
        let color = 'var(--muted-foreground, #64748b)';
        let bg = 'color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent)';
        let label = status || '—';
        if (key.includes('production')) { color = '#15803d'; bg = 'color-mix(in srgb, #16a34a 14%, transparent)'; }
        else if (key === 'bugged') { color = DASH_FLAGGED_COLOR; bg = DASH_FLAGGED_BG; label = 'Bugged'; }
        else if (key.includes('review')) { color = '#b45309'; bg = 'color-mix(in srgb, #d97706 14%, transparent)'; }
        return { color, bg, label };
    },

    _qaAlertBadgeStyle() {
        return 'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #fff7ed; background: #9a3412; border: 1px solid #7c2d12;';
    },

    _qaEditedBadgeHtml(compact) {
        let style = this._qaAlertBadgeStyle();
        if (compact) {
            style = style.replace('padding: 2px 8px', 'padding: 1px 6px').replace('border-radius: 6px', 'border-radius: 4px');
        }
        return `<span style="${style}">QA Edited</span>`;
    },

    _qaAlertIssueBadgeStyle() {
        return this._qaAlertBadgeStyle().replace('font-weight: 700', 'font-weight: 600');
    },

    _qaAcceptedBadgeStyle(compact) {
        let style = 'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #15803d; background: color-mix(in srgb, #16a34a 14%, transparent);';
        if (compact) style = style.replace('padding: 2px 8px', 'padding: 1px 6px').replace('border-radius: 6px', 'border-radius: 4px');
        return style;
    },

    _qaReturnedBadgeStyle(compact) {
        let style = 'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #b91c1c; background: color-mix(in srgb, #dc2626 14%, transparent);';
        if (compact) style = style.replace('padding: 2px 8px', 'padding: 1px 6px').replace('border-radius: 6px', 'border-radius: 4px');
        return style;
    },

    _qaPromptRatingBadgeStyle(rating) {
        const label = String(rating || '');
        if (label === 'Top 10%') return this._qaAcceptedBadgeStyle();
        if (label === 'Bottom 10%') return this._qaReturnedBadgeStyle();
        return 'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: var(--muted-foreground, #64748b); background: color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent);';
    },

    _qaAcceptedBlockStyle() {
        return {
            border: '1px solid color-mix(in srgb, #16a34a 35%, transparent)',
            background: 'color-mix(in srgb, #16a34a 8%, transparent)'
        };
    },

    _qaReturnedBlockStyle() {
        return {
            border: '1px solid color-mix(in srgb, #dc2626 40%, transparent)',
            background: 'color-mix(in srgb, #dc2626 8%, transparent)'
        };
    },

    _qaOtherBlockStyle() {
        return {
            border: '1px solid color-mix(in srgb, #c2410c 45%, transparent)',
            background: 'color-mix(in srgb, #c2410c 32%, var(--card, #ffffff))'
        };
    },

    _disputeBlockStyle() {
        return {
            border: '1px solid #7c3aed',
            background: 'color-mix(in srgb, #7c3aed 24%, var(--card, #ffffff))'
        };
    },

    _disputeCategoryBadgeHtml(category) {
        const label = String(category || '').trim();
        if (!label) return '';
        return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; color: #3b0764; background: color-mix(in srgb, #ffffff 78%, #ede9fe); border: 1px solid #6d28d9;">${dashEscHtml(label)}</span>`;
    },

    _qaBlockHtml(qa, highlightQuery, caseSensitive, highlightFuzzy, highlightRegex, feedbackId, itemId) {
        const positive = qa.isPositive;
        const isVerifierFailure = Boolean(qa.isVerifierFailure);
        const isSystem = Boolean(qa.isSystemFeedback);
        const isFlagged = Boolean(qa.isFlaggedAsBugged);
        const isOther = isSystem || isVerifierFailure || qa.isEscalated || isFlagged;
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        let blockStyle;
        if (positive && !isOther) {
            blockStyle = this._qaAcceptedBlockStyle();
        } else if (!positive && !isOther) {
            blockStyle = this._qaReturnedBlockStyle();
        } else {
            blockStyle = this._qaOtherBlockStyle();
        }
        const border = blockStyle.border;
        const bg = blockStyle.background;
        const alertBadge = this._qaAlertBadgeStyle();
        const statusLabel = isVerifierFailure
            ? `<span style="${alertBadge}">Verifier Generation Error</span>`
            : (isSystem
            ? ''
            : (positive
                ? `<span style="${this._qaAcceptedBadgeStyle()}">Accepted</span>`
                : (qa.isEscalated
                    ? `<span style="${alertBadge}">Escalated for Fleet Review</span>`
                    : (isFlagged
                        ? `<span style="${alertBadge}">Flagged as Bugged</span>`
                        : `<span style="${this._qaReturnedBadgeStyle()}">Returned for Revision</span>`))));
        const issueBadgeStyle = isOther
            ? this._qaAlertIssueBadgeStyle()
            : 'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; color: #b45309; background: color-mix(in srgb, #d97706 14%, transparent);';
        const rejectionBadges = qa.rejectionBadges || [];
        const badges = rejectionBadges.length > 0
            ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Issues')}${rejectionBadges.map((l) => `<span style="${issueBadgeStyle}">${dashEscHtml(l)}</span>`).join('')}</div>`
            : '';
        const blocks = (qa.textBlocks || []).map((b) => {
            const blockLabel = (isSystem || isVerifierFailure) ? b.label : dashQaTextBlockLabel(b.label, positive);
            const quotedText = this._dashQuotedText(b.text);
            const body = quotedText
                ? this._dashQuotedHighlightedHtml(b.text, hq, cs, fz, rx)
                : '—';
            return `
            <div>
                <div style="display: flex; align-items: center; gap: 6px;">${this._labelSpan(blockLabel)}${this._copyIconHtml(quotedText)}</div>
                <p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${body}</p>
            </div>`;
        }).join('');
        const submittedHtml = qa.feedbackAt
            ? dashTimestampWithDurationHtml(qa.feedbackAt, qa.reviewDurationSeconds)
            : '';
        const promptRatingHtml = (!isSystem && qa.qualityRating)
            ? `<div style="display: inline-flex; align-items: center; gap: 6px;">${this._labelSpan('Rating')}<span style="${this._qaPromptRatingBadgeStyle(qa.qualityRating)}">${dashEscHtml(qa.qualityRating)}</span></div>`
            : '';
        const blockTitle = isSystem ? 'System Feedback' : 'QA Feedback';
        const reviewerHtml = (!isSystem && qa.qaReviewerId)
            ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">${this._personChipsHtml(qa.qaReviewerName, qa.qaReviewerEmail, qa.qaReviewerId, 'Open reviewer in Fleet', 'qa')}</div>`
            : '';
        const helpfulnessHtml = this._shouldShowHelpfulness(qa, feedbackId)
            ? `<div style="margin-top: 8px; border-radius: 6px; background: var(--card, #ffffff);">
                <div style="padding: 8px 10px; background: var(--card, #ffffff); border-radius: 6px; display: flex; flex-direction: column; gap: 6px;" data-wf-dash-helpfulness="${dashEscHtml(String(feedbackId))}">
                    ${this._helpfulnessBlockHtml(String(feedbackId))}
                </div>
            </div>`
            : '';
        const screenshotHtml = feedbackId && qa.screenshotKeys && qa.screenshotKeys.length
            ? this._screenshotBlockHtml('qa', feedbackId, itemId, qa.screenshotKeys)
            : '';
        const blockId = feedbackId
            ? ('qa:' + feedbackId)
            : (itemId ? ('qa:fallback:' + itemId) : 'qa:unknown');
        const leftHeader = `<span style="font-weight: 600; color: var(--foreground, #0f172a);">${dashEscHtml(blockTitle)}</span>`
            + submittedHtml
            + promptRatingHtml;
        const headerRow = this._actionBlockHeaderRowHtml(blockId, leftHeader, statusLabel || '');
        const bodyHtml = `${reviewerHtml}`
            + (badges ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 16px;">${badges}</div>` : '')
            + blocks
            + screenshotHtml
            + helpfulnessHtml;
        return this._actionBlockShellHtml(
            blockId,
            itemId,
            'margin-top: 12px; padding: 10px 12px; border: ' + border + '; border-radius: 8px; background: ' + bg + '; display: flex; flex-direction: column; gap: 8px;',
            headerRow,
            bodyHtml
        );
    },

    _feedbackActionBadgeHtml(entry, compact) {
        if (!entry) return '';
        const isVerifierFailure = Boolean(entry.isVerifierFailure || (entry.display && entry.display.isVerifierFailure));
        const isSystem = Boolean(entry.isSystemFeedback || (entry.display && entry.display.isSystemFeedback))
            || isVerifierFailure;
        let label = 'Returned';
        if (isSystem) label = 'System';
        else if (entry.isPositive) label = 'Accepted';
        else if (entry.isEscalated) label = 'Escalated';
        else if (entry.isFlaggedAsBugged) label = 'Flagged';

        if (isSystem || entry.isEscalated || entry.isFlaggedAsBugged) {
            let style = this._qaAlertBadgeStyle();
            if (compact) {
                style = style.replace('padding: 2px 8px', 'padding: 1px 6px').replace('border-radius: 6px', 'border-radius: 4px');
            }
            return `<span style="${style}">${dashEscHtml(label)}</span>`;
        }
        const style = entry.isPositive
            ? this._qaAcceptedBadgeStyle(compact)
            : this._qaReturnedBadgeStyle(compact);
        return `<span style="${style}">${dashEscHtml(label)}</span>`;
    },

    _reviewerBadgeHtml(entry, active, taskId, itemId) {
        const isVerifierFailure = Boolean(entry.isVerifierFailure || (entry.display && entry.display.isVerifierFailure));
        const isSystem = Boolean(entry.isSystemFeedback || (entry.display && entry.display.isSystemFeedback))
            || isVerifierFailure;
        const name = isSystem ? 'System' : (entry.reviewer.name || entry.reviewer.email || 'Reviewer');
        const actionBadge = this._feedbackActionBadgeHtml(entry, true);
        const border = active ? 'border: 1px solid color-mix(in srgb, var(--foreground, #0f172a) 25%, transparent); background: var(--accent, #f1f5f9);' : 'border: 1px solid var(--border, #e2e8f0); background: transparent;';
        if (isSystem) {
            return `<button type="button" data-wf-dash-reviewer-badge="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(taskId)}" data-display-no="${entry.linkedDisplayVersionNo}" title="Show version ${entry.linkedDisplayVersionNo}" style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; cursor: pointer; ${border}">
                ${actionBadge}
            </button>`;
        }
        return `<button type="button" data-wf-dash-reviewer-badge="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(taskId)}" data-display-no="${entry.linkedDisplayVersionNo}" title="Show version ${entry.linkedDisplayVersionNo}" style="display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 6px; font-size: 10px; cursor: pointer; ${border}">
            <span style="font-weight: 600; color: var(--foreground, #0f172a);">${dashEscHtml(name)}</span>
            ${actionBadge}
        </button>`;
    },

    _disputeClaimControlHtml(display, itemId) {
        if (display.resolutionAt) return '';
        const disputeId = String(display.id || '').trim();
        if (!disputeId) return '';
        const ui = this._getDisputeClaimUi(disputeId);
        const baseClass = this._dashBtnClass('secondary', 'nav');
        const baseStyle = ' padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;';
        if (ui.status === 'claimed') return '';
        if (ui.status === 'claiming') {
            return `<button type="button" disabled aria-busy="true" class="${baseClass}" style="${baseStyle} cursor: wait;">`
                + `${this._loadingSpinnerHtml(14)}`
                + `<span>Claiming…</span>`
                + `</button>`;
        }
        return `<button type="button" data-wf-dash-dispute-claim="1" data-dispute-id="${dashEscHtml(disputeId)}" data-item-id="${dashEscHtml(itemId)}" title="Claim this dispute" class="${baseClass}" style="${baseStyle}">`
            + `<span>Claim</span></button>`;
    },

    _disputeBlockHtml(display, highlightQuery, caseSensitive, highlightFuzzy, itemId, highlightRegex) {
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        const purple = this._disputeBlockStyle();
        const border = purple.border;
        const bg = purple.background;
        const reasonBody = display.reason
            ? this._dashQuotedHighlightedHtml(display.reason, hq, cs, fz, rx)
            : '—';
        const submittedHtml = display.submittedAt
            ? this._plainTimestampHtml(display.submittedAt)
            : '';
        const categoryHtml = display.category ? this._disputeCategoryBadgeHtml(display.category) : '';
        let resolutionHtml = '';
        if (display.resolutionAt) {
            const resolutionKind = display.isApproved ? 'approved' : (display.isRejected ? 'rejected' : 'other');
            const statusText = display.isApproved ? 'Approved' : (display.isRejected ? 'Rejected' : (display.status || 'Resolved'));
            const resolutionBody = display.resolutionText
                ? this._dashQuotedHighlightedHtml(display.resolutionText, hq, cs, fz, rx)
                : '—';
            const resolvedHtml = this._fieldGroupHtml(
                'Resolved',
                dashTimestampWithDurationHtml(display.resolutionAt, display.reviewDurationSeconds)
            );
            const resolverHtml = display.resolverId
                ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">${this._personChipsHtml(display.resolverName, display.resolverEmail, display.resolverId, 'Open resolver in Fleet', 'dispute')}</div>`
                : '';
            const resBlockId = display.id ? ('dispute-res:' + display.id) : ('dispute-res:unknown:' + itemId);
            resolutionHtml = this._resolvedActionSubBlockHtml({
                blockId: resBlockId,
                itemId,
                kind: resolutionKind,
                statusLabel: statusText,
                leftHeaderExtra: resolvedHtml,
                resolverHtml,
                noteLabel: 'Reason',
                noteBodyHtml: resolutionBody,
                copyText: this._dashQuotedText(display.resolutionText)
            });
        }
        const claimControlHtml = this._disputeClaimControlHtml(display, itemId);
        const disputeRightHtml = (categoryHtml || claimControlHtml)
            ? `${categoryHtml}${claimControlHtml}`
            : '';
        const blockId = display.id ? ('dispute:' + display.id) : ('dispute:unknown:' + itemId);
        const leftHeader = `<span style="font-weight: 600; color: var(--foreground, #0f172a);">Dispute</span>${submittedHtml}`;
        const headerRow = this._actionBlockHeaderRowHtml(blockId, leftHeader, disputeRightHtml);
        const resolutionPanelHtml = !display.resolutionAt
            ? this._disputeResolutionPanelHtml(display, itemId)
            : '';
        const screenshotHtml = display.id && display.screenshotKeys && display.screenshotKeys.length
            ? this._screenshotBlockHtml('dispute', display.id, itemId, display.screenshotKeys)
            : '';
        const reasonHtml = this._quotedFieldBlockHtml('Reason', reasonBody, this._dashQuotedText(display.reason));
        const bodyHtml = display.resolutionAt
            ? `${reasonHtml}${screenshotHtml}${resolutionHtml}`
            : `${reasonHtml}${screenshotHtml}${resolutionPanelHtml}`;
        return this._actionBlockShellHtml(
            blockId,
            itemId,
            'margin-top: 8px; padding: 10px 12px; border: ' + border + '; border-radius: 8px; background: ' + bg + '; display: flex; flex-direction: column; gap: 8px;',
            headerRow,
            bodyHtml
        );
    },

    _noneProvidedBadgeHtml() {
        return '<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: var(--muted-foreground, #64748b); background: color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent); letter-spacing: 0.04em;">NONE PROVIDED</span>';
    },

    _flagBlockHtml(display, highlightQuery, caseSensitive, highlightFuzzy, highlightRegex, itemId) {
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        const blockStyle = this._qaOtherBlockStyle();
        const alertBadge = this._qaAlertBadgeStyle();
        const issueBadgeStyle = this._qaAlertIssueBadgeStyle();
        const border = blockStyle.border;
        const bg = blockStyle.background;
        const submittedHtml = display.createdAt
            ? this._plainTimestampHtml(display.createdAt)
            : '';
        const reasonLabel = display.reason || display.reasonKey || 'Unknown';
        const flaggerHtml = (display.flaggerId || display.flaggerName || display.flaggerEmail)
            ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">${this._personChipsHtml(display.flaggerName, display.flaggerEmail, display.flaggerId, 'Open flagger in Fleet', 'senior_review')}</div>`
            : '';
        const issuesHtml = `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Issues')}<span style="${issueBadgeStyle}">${dashEscHtml(reasonLabel)}</span></div>`;
        const noteText = this._dashQuotedText(display.note);
        const reviewerNoteHtml = noteText
            ? this._quotedFieldBlockHtml(
                'Reviewer Note',
                this._dashQuotedHighlightedHtml(display.note, hq, cs, fz, rx),
                noteText
            )
            : `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Reviewer Note')}${this._noneProvidedBadgeHtml()}</div>`;
        let resolutionHtml = '';
        if (display.resolutionAt) {
            const resolutionKind = display.isConfirmed ? 'confirmed' : (display.isDismissed ? 'dismissed' : 'other');
            const statusText = display.isConfirmed ? 'Confirmed' : (display.isDismissed ? 'Dismissed' : (display.status || 'Resolved'));
            const resolutionBody = display.resolutionNote
                ? this._dashQuotedHighlightedHtml(display.resolutionNote, hq, cs, fz, rx)
                : '—';
            const resolvedHtml = this._fieldGroupHtml('Resolved', this._plainTimestampHtml(display.resolutionAt));
            const resolverHtml = display.resolverId
                ? `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">${this._personChipsHtml(display.resolverName, display.resolverEmail, display.resolverId, 'Open resolver in Fleet', 'senior_review')}</div>`
                : '';
            const resBlockId = display.id ? ('flag-res:' + display.id) : ('flag-res:unknown:' + itemId);
            resolutionHtml = this._resolvedActionSubBlockHtml({
                blockId: resBlockId,
                itemId,
                kind: resolutionKind,
                statusLabel: statusText,
                leftHeaderExtra: resolvedHtml,
                resolverHtml,
                noteLabel: 'Resolution Note',
                noteBodyHtml: resolutionBody,
                copyText: this._dashQuotedText(display.resolutionNote)
            });
        }
        const flagResolutionInputHtml = (display.isPending && itemId)
            ? `<div style="margin-top: 8px; border-radius: 6px; background: var(--card, #ffffff);">
                <div style="padding: 8px 10px; background: var(--card, #ffffff); border-radius: 6px; display: flex; flex-direction: column; gap: 6px;" data-wf-dash-flag-resolution="${dashEscHtml(String(display.id || ''))}" data-wf-dash-item-id="${dashEscHtml(String(itemId))}">
                    ${this._flagResolutionBlockHtml(display.id, itemId)}
                </div>
            </div>`
            : '';
        const blockId = display.id ? ('flag:' + display.id) : ('flag:unknown:' + itemId);
        const leftHeader = `<span style="font-weight: 600; color: var(--foreground, #0f172a);">Senior Review Flag</span>${submittedHtml}`;
        const headerRow = this._actionBlockHeaderRowHtml(blockId, leftHeader, `<span style="${alertBadge}">Flagged for Review</span>`);
        const bodyHtml = `${flaggerHtml}
                ${issuesHtml}
                ${reviewerNoteHtml}
                ${resolutionHtml}
                ${flagResolutionInputHtml}`;
        return this._actionBlockShellHtml(
            blockId,
            itemId,
            'margin-top: 8px; padding: 10px 12px; border: ' + border + '; border-radius: 8px; background: ' + bg + '; display: flex; flex-direction: column; gap: 8px;',
            headerRow,
            bodyHtml
        );
    },

    _promptVersionsRawLike(promptVersions) {
        return (promptVersions || []).map((v) => ({
            id: v.id,
            version_no: v.versionNo,
            created_at: v.createdAt,
            prompt: v.prompt,
            env_key: v.envKey
        }));
    },

    _orphanDisputesByDisplayNo(disputes, allFeedback, promptVersions) {
        const lib = dashLib();
        const feedbackIds = new Set(allFeedback.map((f) => String(f.id)));
        const orphans = (disputes || []).filter((d) => !d.feedbackId || !feedbackIds.has(d.feedbackId));
        const byDisplayNo = new Map();
        if (orphans.length === 0) return byDisplayNo;
        const rawLike = this._promptVersionsRawLike(promptVersions);
        const firstNegative = allFeedback.find((f) => !f.isPositive && !f.isSystemFeedback && !f.isVerifierFailure);
        const fallbackNo = firstNegative
            ? firstNegative.linkedDisplayVersionNo
            : (promptVersions.length ? promptVersions[promptVersions.length - 1].displayVersionNo : 1);
        for (const dispute of orphans) {
            let displayNo = fallbackNo;
            if (dispute.originalFeedbackCreatedAt && rawLike.length) {
                const versionInfo = lib.resolveVersionAtFeedback(rawLike, dispute.originalFeedbackCreatedAt);
                if (versionInfo && versionInfo.displayVersionNo) displayNo = versionInfo.displayVersionNo;
            }
            const list = byDisplayNo.get(displayNo) || [];
            list.push(dispute);
            byDisplayNo.set(displayNo, list);
        }
        return byDisplayNo;
    },

    _orphanFlagsByDisplayNo(flags, promptVersions) {
        const lib = dashLib();
        const byDisplayNo = new Map();
        const vers = promptVersions || [];
        if (!flags || flags.length === 0) return byDisplayNo;
        const rawLike = this._promptVersionsRawLike(vers);
        const fallbackNo = vers.length ? vers[vers.length - 1].displayVersionNo : 1;
        for (const flag of flags) {
            let displayNo = fallbackNo;
            if (flag.createdAt && rawLike.length) {
                const versionInfo = lib.resolveVersionAtFeedback(rawLike, flag.createdAt);
                if (versionInfo && versionInfo.displayVersionNo) displayNo = versionInfo.displayVersionNo;
            }
            const list = byDisplayNo.get(displayNo) || [];
            list.push(flag);
            byDisplayNo.set(displayNo, list);
        }
        return byDisplayNo;
    },

    _feedbackEntryAt(entry) {
        return String(entry.feedbackAt || (entry.display && entry.display.feedbackAt) || '');
    },

    _feedbackEntriesOldestFirst(entries) {
        return [...(entries || [])].sort((a, b) => {
            const aAt = this._feedbackEntryAt(a);
            const bAt = this._feedbackEntryAt(b);
            return aAt < bAt ? -1 : aAt > bAt ? 1 : 0;
        });
    },

    _sortTaskActionBlocksByDate(blocks) {
        return [...(blocks || [])].sort((a, b) => {
            const aAt = String(a.sortAt || '');
            const bAt = String(b.sortAt || '');
            return aAt < bAt ? -1 : aAt > bAt ? 1 : 0;
        });
    },

    _versionTaskActionsHtml(feedbackEntries, fallbackFeedback, orphanDisputes, orphanFlags, highlightQuery, caseSensitive, highlightFuzzy, highlightRegex, itemId) {
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        const blocks = [];
        const orderedFeedback = this._feedbackEntriesOldestFirst(feedbackEntries);
        for (const entry of orderedFeedback) {
            if (entry.display) {
                blocks.push({
                    sortAt: this._feedbackEntryAt(entry),
                    html: this._qaBlockHtml(entry.display, hq, cs, fz, rx, entry.id, itemId)
                });
            }
            for (const dispute of entry.disputes || []) {
                blocks.push({
                    sortAt: String(dispute.submittedAt || ''),
                    html: this._disputeBlockHtml(dispute, hq, cs, fz, itemId, rx)
                });
            }
        }
        if (fallbackFeedback) {
            blocks.push({
                sortAt: String(fallbackFeedback.feedbackAt || ''),
                html: this._qaBlockHtml(fallbackFeedback, hq, cs, fz, rx, null, itemId)
            });
        }
        for (const dispute of orphanDisputes || []) {
            blocks.push({
                sortAt: String(dispute.submittedAt || ''),
                html: this._disputeBlockHtml(dispute, hq, cs, fz, itemId, rx)
            });
        }
        for (const flag of orphanFlags || []) {
            blocks.push({
                sortAt: String(flag.createdAt || ''),
                html: this._flagBlockHtml(flag, hq, cs, fz, rx, itemId)
            });
        }
        return this._sortTaskActionBlocksByDate(blocks).map((block) => block.html).join('');
    },

    _quickTaskActionsHtml(item, highlightQuery, caseSensitive, highlightFuzzy, highlightRegex) {
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        const itemId = item.id;
        const blocks = [];
        if (item.qaFeedback) {
            blocks.push({
                sortAt: String(item.qaFeedback.feedbackAt || ''),
                html: this._qaBlockHtml(item.qaFeedback, hq, cs, fz, rx, item.selectedFeedbackId || null, itemId)
            });
        }
        for (const dispute of item.disputes || []) {
            blocks.push({
                sortAt: String(dispute.submittedAt || ''),
                html: this._disputeBlockHtml(dispute, hq, cs, fz, itemId, rx)
            });
        }
        for (const flag of item.flags || []) {
            blocks.push({
                sortAt: String(flag.createdAt || ''),
                html: this._flagBlockHtml(flag, hq, cs, fz, rx, itemId)
            });
        }
        return this._sortTaskActionBlocksByDate(blocks).map((block) => block.html).join('');
    },

    _versionSectionHtml(taskId, version, totalVersions, feedbackEntries, highlightQuery, caseSensitive, highlightFuzzy, showVersionLabel, fallbackFeedback, orphanDisputes, orphanFlags, itemId, highlightRegex, versionHeaderControls, hasSubsequentVersions, rollingOpts) {
        const hq = highlightQuery || '';
        const cs = Boolean(caseSensitive);
        const fz = Boolean(highlightFuzzy);
        const rx = Boolean(highlightRegex);
        const orderedFeedback = this._feedbackEntriesOldestFirst(feedbackEntries);
        let promptBody;
        if (rollingOpts && rollingOpts.active) {
            promptBody = this._rollingPromptBodyHtml(
                version,
                rollingOpts.versionIdx,
                rollingOpts.renderedVersions,
                rollingOpts.rollingUi
            );
        } else if (version.prompt) {
            promptBody = this._dashQuotedHighlightedHtml(version.prompt, hq, cs, fz, rx);
        } else {
            promptBody = '—';
        }
        let promptLabel;
        if (versionHeaderControls) {
            promptLabel = versionHeaderControls;
        } else if (showVersionLabel) {
            promptLabel = this._promptVersionCountHtml(version.displayVersionNo, totalVersions);
        } else {
            promptLabel = this._labelSpan('Prompt');
        }
        const versionActionEntry = orderedFeedback.length ? orderedFeedback[orderedFeedback.length - 1] : null;
        let versionActionBadge = this._feedbackActionBadgeHtml(versionActionEntry);
        if (!versionActionBadge && hasSubsequentVersions) {
            versionActionBadge = this._qaEditedBadgeHtml();
        }
        const taskActionsHtml = this._versionTaskActionsHtml(
            feedbackEntries, fallbackFeedback, orphanDisputes, orphanFlags,
            hq, cs, fz, rx, itemId
        );
        const rollingUi = rollingOpts && rollingOpts.rollingUi;
        const diffMode = rollingOpts && rollingOpts.active && rollingUi && rollingUi.showHighlights;
        const inActivePair = rollingOpts && rollingOpts.active && rollingUi && rollingUi.showHighlights
            && rollingOpts.versionIdx >= rollingUi.rollingLeft
            && rollingOpts.versionIdx <= rollingUi.rollingLeft + 1;
        const submittedHtml = `<span data-wf-dash-version-submitted="1">${this._fieldGroupHtml(
            'Submitted',
            this._plainTimestampHtml(version.createdAt, null, { muted: inActivePair })
        )}</span>`;
        const blockId = 'version:' + itemId + ':' + version.displayVersionNo;
        const leftHeader = `${promptLabel}${this._copyIconHtml(this._dashQuotedText(version.prompt))}${submittedHtml}`;
        let rightHeader = '';
        if (inActivePair) {
            const leftVersion = rollingOpts.renderedVersions[rollingUi.rollingLeft];
            const rightVersion = rollingOpts.renderedVersions[rollingUi.rollingLeft + 1];
            const simBadge = this._rollingSimilarityBadgeHtml(
                (leftVersion && leftVersion.prompt) || '',
                (rightVersion && rightVersion.prompt) || '',
                rollingUi
            );
            if (simBadge) rightHeader += simBadge;
        }
        if (!diffMode && versionActionBadge) rightHeader += versionActionBadge;
        const headerRow = this._actionBlockHeaderRowHtml(blockId, leftHeader, rightHeader, {
            forceRightSection: !!(rollingOpts && rollingOpts.active)
        });
        const promptColor = 'color: var(--foreground, #0f172a);';
        const notesToQaHtml = diffMode
            ? ''
            : this._notesToQaSectionHtml(version.resubmissionNotes, hq, cs, fz, rx);
        const taskActionsPart = diffMode ? '' : taskActionsHtml;
        const bodyHtml = `<p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; ${promptColor}">${promptBody}</p>`
            + notesToQaHtml
            + taskActionsPart;
        const versionIdxAttr = (rollingOpts && rollingOpts.active)
            ? ` data-wf-dash-version-idx="${rollingOpts.versionIdx}"`
            : '';
        const shellClass = inActivePair ? 'so-rolling-diff-on' : '';
        return this._actionBlockShellHtml(
            blockId,
            itemId,
            'display: flex; flex-direction: column; gap: 8px;',
            headerRow,
            bodyHtml,
            versionIdxAttr,
            shellClass
        );
    },

    _resultCardHtml(item) {
        if (!item) return '';
        if (item.hydrated === false) return this._quickResultCardHtml(item);
        return this._taskCardHtml(item);
    },

    _quickResultCardHtml(item) {
        const task = item.task;
        const itemId = item.id;
        const hq = item.highlightQuery || '';
        const cs = Boolean(item.highlightCaseSensitive);
        const fz = Boolean(item.highlightFuzzy);
        const rx = Boolean(item.highlightRegex);
        const promptText = this._dashQuotedText(task.prompt);
        const promptBody = promptText
            ? this._dashQuotedHighlightedHtml(task.prompt, hq, cs, fz, rx)
            : '—';
        const taskActionsHtml = this._quickTaskActionsHtml(item, hq, cs, fz, rx);
        const blockId = 'version:' + itemId + ':quick';
        const leftHeader = `${this._labelSpan('Prompt')}${this._copyIconHtml(promptText)}`;
        const rightHeader = this._fieldGroupHtml('Submitted', this._plainTimestampHtml(task.createdAt));
        const headerRow = this._actionBlockHeaderRowHtml(blockId, leftHeader, rightHeader);
        let promptSectionHtml = this._actionBlockShellHtml(
            blockId,
            itemId,
            'display: flex; flex-direction: column; gap: 8px;',
            headerRow,
            `<p style="margin: 4px 0 0 0; padding: 6px 0 2px 12px; border-left: 3px solid var(--border, #e2e8f0); white-space: pre-wrap; line-height: 1.5; color: var(--foreground, #0f172a);">${promptBody}</p>`
        );
        let bodyHtml;
        if (item.qaFeedback) {
            bodyHtml = taskActionsHtml;
        } else {
            bodyHtml = promptSectionHtml + taskActionsHtml;
        }
        const cardHtml = `
            <article class="wf-dash-task-card-article" style="position: relative; border: ${DASH_CARD_BORDER}; border-radius: 10px; background: ${DASH_TASK_CARD_BG}; overflow: hidden;">
                ${this._cardHeaderMetaRowHtml(task, itemId)}
                ${this._flagCreatePanelHtml(itemId, task.id)}
                ${this._supplementalSectionHtml(itemId)}
                <div style="padding: 12px 14px; font-size: 12px;">${bodyHtml}</div>
            </article>`;
        return this._resultCardOuterWrap(item, cardHtml);
    },

    _resultCardOuterWrap(item, cardHtml) {
        this._ensureCardActionStyles();
        const itemId = item.id;
        const createdTabHtml = this._cardCreatedTabHtml(item.task);
        const statusTabHtml = this._cardStatusTabHtml(item.task);
        const keyTabHtml = this._cardKeyTabHtml(item.task, itemId, {
            query: item.highlightQuery || '',
            caseSensitive: Boolean(item.highlightCaseSensitive),
            fuzzy: Boolean(item.highlightFuzzy),
            regex: Boolean(item.highlightRegex)
        });
        const tabsRow = '<div class="wf-dash-card-tabs-row">'
                + '<div class="wf-dash-card-tabs-left">' + statusTabHtml + createdTabHtml + keyTabHtml + '</div>'
                + '</div>';
        const actionRow = `<div class="wf-dash-card-action-row">${this._cardActionAreaHtml(itemId)}</div>`;
        return `
            <div data-wf-dash-task-card="1" data-item-id="${dashEscHtml(itemId)}" style="display: flex; flex-direction: column;">
                ${tabsRow}
                <div class="wf-dash-card-shell">
                    ${actionRow}
                    ${cardHtml}
                </div>
            </div>`;
    },

    _taskCardHtml(item) {
        const task = item.task;
        const itemId = item.id;
        const allFeedback = task.allFeedback || [];
        const highlightQuery = item.highlightQuery || '';
        const caseSensitive = Boolean(item.highlightCaseSensitive);
        const highlightFuzzy = Boolean(item.highlightFuzzy);
        const highlightRegex = Boolean(item.highlightRegex);
        const extraVisibleVersionNos = item.extraVisibleVersionNos || [];

        let versions = task.promptVersions && task.promptVersions.length
            ? task.promptVersions
            : [{ id: '', displayVersionNo: 1, prompt: task.prompt, envKey: task.envKey, createdAt: task.createdAt }];
        const totalVersions = versions.length;
        const hasTimeline = totalVersions > 1;

        const versionMode = this._state.versionMode || DASH_VERSION_MODE_FINAL;
        const hasContributors = (this._state.activeSearchAuthorIds || []).length > 0;

        let defaultDisplayNo;
        if (versionMode === DASH_VERSION_MODE_V1) {
            const sorted = [...versions].sort((a, b) => a.displayVersionNo - b.displayVersionNo);
            defaultDisplayNo = sorted[0].displayVersionNo;
        } else if (versionMode === DASH_VERSION_MODE_CONTRIBUTOR && hasContributors) {
            defaultDisplayNo = this._contributorMatchDisplayNo(item, versions);
        } else {
            defaultDisplayNo = versions[versions.length - 1].displayVersionNo;
        }

        const ui = this._getCardUi(task.id);
        const expanded = ui.expanded;
        const selectedDisplayNo = ui.selectedDisplayNo != null ? ui.selectedDisplayNo : defaultDisplayNo;

        const versionByDisplayNo = new Map(versions.map((v) => [v.displayVersionNo, v]));
        const feedbackByDisplayNo = new Map();
        const disputes = item.disputes || [];
        const attachedDisputeIds = new Set();
        for (const entry of allFeedback) {
            const linked = disputes.filter((d) => d.feedbackId && d.feedbackId === String(entry.id));
            for (const d of linked) attachedDisputeIds.add(d.id);
            const list = feedbackByDisplayNo.get(entry.linkedDisplayVersionNo) || [];
            list.push(Object.assign({}, entry, { disputes: linked }));
            feedbackByDisplayNo.set(entry.linkedDisplayVersionNo, list);
        }
        const orphanDisputesByDisplayNo = this._orphanDisputesByDisplayNo(
            disputes.filter((d) => !attachedDisputeIds.has(d.id)),
            allFeedback,
            task.promptVersions || versions
        );
        const orphanFlagsByDisplayNo = this._orphanFlagsByDisplayNo(item.flags || [], task.promptVersions || versions);

        let renderedVersions;
        if (expanded) {
            renderedVersions = [...versions].sort((a, b) => (
                ui.timelineNewestFirst
                    ? b.displayVersionNo - a.displayVersionNo
                    : a.displayVersionNo - b.displayVersionNo
            ));
        } else {
            const extras = [...new Set(extraVisibleVersionNos)]
                .filter((n) => n !== selectedDisplayNo)
                .sort((a, b) => b - a);
            const nos = [selectedDisplayNo, ...extras];
            renderedVersions = nos.map((n) => versionByDisplayNo.get(n)).filter(Boolean);
        }

        const reviewerBadges = allFeedback.length > 0
            ? `<div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px;">${this._labelSpan('Reviewers')}${[...allFeedback].reverse().map((entry) => this._reviewerBadgeHtml(entry, !expanded && entry.linkedDisplayVersionNo === selectedDisplayNo, task.id, itemId)).join('')}</div>`
            : '';

        const rollingUi = expanded && hasTimeline && totalVersions >= 2 ? this._getRollingUi(task.id) : null;
        const diffMode = rollingUi && rollingUi.showHighlights;

        let row3Html = '';
        if (expanded) {
            const rollingActive = hasTimeline && totalVersions >= 2;
            if (rollingActive && rollingUi) this._clampCardRollingLeft(rollingUi, renderedVersions.length);
            const feedbackBtn = rollingActive && rollingUi
                ? this._expandedRollingFeedbackBtnHtml(itemId, task.id, rollingUi)
                : '';
            const diffToolbar = rollingActive && rollingUi
                ? this._expandedRollingDiffToolbarHtml(rollingUi)
                : '';
            row3Html = `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 8px 14px; font-size: 12px;">
                    <button type="button" data-wf-dash-timeline-order="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(task.id)}" class="${this._dashBtnClass('basic', 'compact')}">${ui.timelineNewestFirst ? 'Newest first' : 'Oldest first'}</button>
                    ${feedbackBtn}
                    ${diffToolbar}
                </div>`;
        }

        const maxDisplayVersionNo = hasTimeline
            ? Math.max(...versions.map((v) => v.displayVersionNo))
            : 0;
        const versionSections = renderedVersions.map((version, versionIdx) => {
            const feedbackEntries = feedbackByDisplayNo.get(version.displayVersionNo) || [];
            const fallback = !hasTimeline && allFeedback.length === 0 ? item.qaFeedback : null;
            const orphanDisputes = orphanDisputesByDisplayNo.get(version.displayVersionNo) || [];
            const orphanFlagsForVersion = orphanFlagsByDisplayNo.get(version.displayVersionNo) || [];
            const hasSubsequentVersions = hasTimeline && version.displayVersionNo < maxDisplayVersionNo;
            let versionHeaderControls = '';
            if (hasTimeline && !expanded && version.displayVersionNo === selectedDisplayNo) {
                versionHeaderControls = this._collapsedVersionPickerHtml(itemId, task.id, versions, selectedDisplayNo, totalVersions);
            } else if (hasTimeline && expanded) {
                versionHeaderControls = this._expandedVersionHeaderHtml(itemId, task.id, version.displayVersionNo, totalVersions);
            }
            const rollingOpts = rollingUi
                ? { active: true, versionIdx, renderedVersions, rollingUi }
                : null;
            return this._versionSectionHtml(
                task.id, version, totalVersions, feedbackEntries,
                highlightQuery, caseSensitive, highlightFuzzy, hasTimeline, fallback,
                orphanDisputes, orphanFlagsForVersion, itemId, highlightRegex, versionHeaderControls,
                hasSubsequentVersions,
                rollingOpts
            );
        }).join('');

        const row2Html = !diffMode && reviewerBadges
            ? `<div style="display: flex; flex-wrap: wrap; align-items: start; justify-content: flex-start; gap: 8px 24px; padding: 8px 14px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 12px;">
                    ${reviewerBadges}
                </div>`
            : '';

        const versionsInnerHtml = expanded && hasTimeline && totalVersions >= 2
            ? `<div class="so-versions-rolling-area" data-wf-dash-versions-area="1" data-item-id="${dashEscHtml(itemId)}" data-task-id="${dashEscHtml(task.id)}" style="display: flex; flex-direction: column; gap: 12px;">${versionSections}</div>`
            : versionSections;

        const cardHtml = `
            <article class="wf-dash-task-card-article" style="position: relative; border: ${DASH_CARD_BORDER}; border-radius: 10px; background: ${DASH_TASK_CARD_BG}; overflow: hidden;">
                ${this._cardHeaderMetaRowHtml(task, itemId)}
                ${this._flagCreatePanelHtml(itemId, task.id)}
                ${row2Html}
                ${this._supplementalSectionHtml(itemId)}
                ${row3Html}
                <div style="display: flex; flex-direction: column; gap: 12px; padding: 12px 14px; font-size: 12px;">
                    ${versionsInnerHtml}
                </div>
            </article>`;

        return this._resultCardOuterWrap(item, cardHtml);
    },

    async _copyText(text) {
        if (!text) return false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (_e) { /* fall through to execCommand */ }
        try {
            const doc = this._pageWindow().document;
            const ta = doc.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            doc.body.appendChild(ta);
            ta.select();
            const ok = doc.execCommand('copy');
            doc.body.removeChild(ta);
            return ok;
        } catch (_e2) {
            return false;
        }
    },

    async _copyWithFeedback(el, text) {
        if (Context.uiLib && typeof Context.uiLib.copyWithFeedback === 'function') {
            return Context.uiLib.copyWithFeedback(el, text, { logLabel: 'value' });
        }
        const value = String(text == null ? '' : text).trim();
        if (!value) { Logger.warn('dashboard: copy skipped (empty value)'); return false; }
        const ok = await this._copyText(value);
        if (ok) Logger.log('dashboard: copied ' + value.length + ' chars');
        else Logger.warn('dashboard: copy failed');
        return ok;
    }
};


const plugin = {
    id: 'search-output-results-pane',
    name: 'Search Output results pane',
    description: 'Worker Output Search tab — results pane',
    _version: '5.6',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        if (state && state.registered) {
            Logger.debug('search-output-results-pane: already registered — skipping re-init');
            return;
        }
        Context.searchOutputResultsPaneMethods = searchOutputResultsPaneMethods;
        if (state) state.registered = true;
        Logger.log('search-output-results-pane: registered (Context.searchOutputResultsPaneMethods)');
    }
};
