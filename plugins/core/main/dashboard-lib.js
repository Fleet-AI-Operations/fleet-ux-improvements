// dashboard-lib.js — pure dashboard helpers (no PostgREST).
// Loaded before dashboard.js; registers Context.dashboardLib.

/** Max UUIDs/keys per PostgREST `in.(…)` (and per chunked request param). */
const DASH_PG_IN_MAX = 25;

const DASH_LIB_MIN_SUBSTRING_LENGTH = 3;
const DASH_LIB_MS_PER_DAY = 86400000;

const DASH_LIB_RETURN_TYPE_LABELS = {
    accepted: 'Accepted',
    returned: 'Returned',
    escalated: 'Escalated',
    bugged: 'Flagged as Bugged'
};
const DASH_LIB_RETURN_TYPE_ORDER = ['accepted', 'returned', 'escalated', 'bugged'];
const DASH_LIB_PROMPT_RATING_ORDER = ['Top 10%', 'Average', 'Bottom 10%'];
const DASH_LIB_OUTPUT_KIND_ORDER = ['task_creation', 'qa', 'dispute', 'senior_review', 'sessions'];
const DASH_LIB_OUTPUT_KIND_LABELS = {
    task_creation: 'Task Creation',
    qa: 'QA',
    dispute: 'Disputes',
    senior_review: 'Sr Review',
    sessions: 'Sessions'
};
const DASH_LIB_PROMPT_HISTORY_ORDER = [
    'accepted', 'returned', 'notes_to_qa', 'qa_edited', 'disputed',
    'flagged', 'senior_review_flagged', 'escalated', 'session_qa_performed', 'screenshots'
];
const DASH_LIB_PROMPT_HISTORY_LABELS = {
    accepted: 'Accepted',
    returned: 'Returned',
    notes_to_qa: 'Submitted with Notes to QA',
    qa_edited: 'QA Edited',
    disputed: 'Disputed',
    flagged: 'Flagged as bugged',
    senior_review_flagged: 'Flagged for Senior Review',
    escalated: 'Escalated',
    session_qa_performed: 'Session QA Performed',
    screenshots: 'Screenshots associated with task'
};
const DASH_LIB_SESSION_QA_OUTCOME_ORDER = ['pass', 'fail', 'review_needed'];
const DASH_LIB_SESSION_QA_OUTCOME_LABELS = {
    pass: 'Pass',
    fail: 'Fail',
    review_needed: 'Review Needed'
};
const DASH_LIB_DISPUTE_OUTCOME_ORDER = [
    'pending', 'approved', 'rejected', 'approved_with_revisions', 'approved_and_accepted'
];
const DASH_LIB_DISPUTE_OUTCOME_LABELS = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    approved_with_revisions: 'Approved & Return to Writer',
    approved_and_accepted: 'Approved & Accept Task'
};
const DASH_LIB_SR_REVIEW_OUTCOME_ORDER = ['pending', 'confirmed', 'dismissed'];
const DASH_LIB_SR_REVIEW_OUTCOME_LABELS = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    dismissed: 'Dismissed'
};
const DASH_LIB_QA_HELPFULNESS_ORDER = ['helpful', 'not_helpful', 'written_review'];
const DASH_LIB_QA_HELPFULNESS_LABELS = {
    helpful: 'Helpful',
    not_helpful: 'Not helpful',
    written_review: 'Written review'
};
const DASH_LIB_V1_CREATION_TIME_BUCKET_ORDER = [
    'lt_10', '11_20', '21_40', '41_60', '61_90', '91_120', 'gt_120'
];
const DASH_LIB_V1_CREATION_TIME_BUCKET_LABELS = {
    lt_10: '<10 minutes',
    '11_20': '11-20 minutes',
    '21_40': '21-40 minutes',
    '41_60': '41-60 minutes',
    '61_90': '61-90 minutes',
    '91_120': '91-120 minutes',
    gt_120: '> 120 minutes'
};

/** Shared filter sidebar scope keys (search-output + dashboard multiselect). */
const DASH_LIB_FILTER_SCOPES = [
    { scopeKey: 'filter-contributors', optionsKey: 'contributors', draftKey: 'contributorIds' },
    { scopeKey: 'filter-statuses', optionsKey: 'statuses', draftKey: 'statuses' },
    { scopeKey: 'filter-envs', optionsKey: 'envs', draftKey: 'envKeys' },
    { scopeKey: 'filter-projects', optionsKey: 'projects', draftKey: 'projectIds' },
    { scopeKey: 'filter-prompt-ratings', optionsKey: 'promptRatings', draftKey: 'promptRatings' },
    { scopeKey: 'filter-qa-helpfulness', optionsKey: 'qaHelpfulness', draftKey: 'qaHelpfulness' },
    { scopeKey: 'filter-return-types', optionsKey: 'returnTypes', draftKey: 'returnTypes' },
    { scopeKey: 'filter-task-issues', optionsKey: 'taskIssues', draftKey: 'taskIssues' },
    { scopeKey: 'filter-prompt-history', optionsKey: 'promptHistory', draftKey: 'promptHistory' },
    { scopeKey: 'filter-session-qa-outcome', optionsKey: 'sessionQaOutcomes', draftKey: 'sessionQaOutcomes' },
    { scopeKey: 'filter-dispute-outcome', optionsKey: 'disputeOutcomes', draftKey: 'disputeOutcomes' },
    { scopeKey: 'filter-sr-review-outcome', optionsKey: 'srReviewOutcomes', draftKey: 'srReviewOutcomes' },
    { scopeKey: 'filter-v1-creation-time', optionsKey: 'v1CreationTimeMinutes', draftKey: 'v1CreationTimeMinutes' },
    { scopeKey: 'filter-qa-time', optionsKey: 'qaTimeMinutes', draftKey: 'qaTimeMinutes' },
    { scopeKey: 'filter-dispute-resolution-time', optionsKey: 'disputeResolutionTimeMinutes', draftKey: 'disputeResolutionTimeMinutes' },
    { scopeKey: 'filter-teams', optionsKey: 'teams', draftKey: 'teamIds' }
];

const DASH_LIB_SORT_DEFAULT = 'task_submitted:desc';
const DASH_LIB_SORT_METRICS = [
    { id: 'task_submitted', label: 'Task created' },
    { id: 'task_revised', label: 'Task revised' },
    { id: 'feedback_given', label: 'Feedback given' },
    { id: 'dispute_submitted', label: 'Dispute submitted' },
    { id: 'dispute_resolved', label: 'Dispute resolved' }
];
const DASH_LIB_SORT_OPTIONS = DASH_LIB_SORT_METRICS.flatMap((metric) => ([
    { value: metric.id + ':desc', label: metric.label + ' (newest first)', sortMetric: metric.id, sortOrder: 'desc' },
    { value: metric.id + ':asc', label: metric.label + ' (oldest first)', sortMetric: metric.id, sortOrder: 'asc' }
]));

/** Tab strip order when one task matches multiple output kinds. */
const DASH_LIB_OUTPUT_KIND_MERGE_ORDER = ['task_creation', 'qa', 'dispute', 'senior_review', 'sessions'];

const DASH_LIB_MANUAL_FILTER_FIELDS = [
    { id: 'prompt_word_count', label: 'Prompt Length (words)', type: 'number' },
    { id: 'qa_time_minutes', label: 'QA Time Minutes', type: 'number', hydrateHint: true },
    { id: 'dispute_resolution_time_minutes', label: 'Dispute Resolution Time Minutes', type: 'number', hydrateHint: true },
    { id: 'rejection_issue_count', label: 'Unique Task Issues', type: 'number' },
    { id: 'prompt_version_count', label: 'Unique Task Versions †', type: 'number', hydrateHint: true },
    { id: 'v1_creation_time_minutes', label: 'v1 Creation Time Minutes', type: 'number', hydrateHint: true }
];
const DASH_LIB_MANUAL_FILTER_DEFAULT_FIELD = 'prompt_version_count';
const DASH_LIB_MANUAL_FILTER_DEFAULT_COMPARATOR = 'gte';

const DASH_LIB_RESULTS_MODE_HINTS = {
    clear: 'Clears previous results and replaces with new search results.',
    add: 'Adds new search results to previous ones (deduplicated).'
};
const DASH_LIB_SUBSTRING_FILTER_HELP = 'Matches task key, prompt, QA feedback, and dispute text.';
const DASH_LIB_NONE_SELECTED_HINT = 'None selected = all.';

function dashLibDefaultManualFilterStageRows() {
    return DASH_LIB_MANUAL_FILTER_FIELDS.map((field) => ({
        field: field.id,
        comparator: DASH_LIB_MANUAL_FILTER_DEFAULT_COMPARATOR,
        value: ''
    }));
}

function dashLibManualFilterWordCount(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
}

const DASH_LIB_VERIFIER_FAILED_EVENT_TYPE = 'instance.verifier_failed';
const DASH_LIB_VERIFIER_FAILURE_BADGE = 'Verifier Generation Error';
const DASH_LIB_QA_REVISION_REQUESTED_EVENT_TYPE = 'qa.revision_requested';
const DASH_LIB_RSC_REF_RE = /^\$(\d+)$/;
const DASH_LIB_BUG_REPORT_DEDUP_MS = 2000;

const DASH_LIB_NUMERIC_COMPARATORS = [
    { id: 'gt', label: '>' },
    { id: 'gte', label: '>=' },
    { id: 'lt', label: '<' },
    { id: 'lte', label: '<=' },
    { id: 'eq', label: '=' },
    { id: 'neq', label: '≠' }
];

const DASH_LIB_DATE_COMPARATORS = [
    { id: 'gt', label: 'After' },
    { id: 'gte', label: 'On or after' },
    { id: 'lt', label: 'Before' },
    { id: 'lte', label: 'On or before' },
    { id: 'eq', label: 'On' },
    { id: 'neq', label: 'Not on' }
];

function dashLibEscHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function dashLibFormatCreatedAt(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function dashLibCopyIconHtml(text) {
    const value = String(text == null ? '' : text);
    return '<button type="button" data-wf-dash-copy="' + dashLibEscHtml(value) + '" title="Copy" aria-label="Copy" style="display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border-radius: 6px; border: none; background: transparent; color: var(--muted-foreground, #64748b); cursor: pointer;">'
        + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
        + '</button>';
}

function dashLibFormatPercent(n) {
    const pct = Number(n);
    if (!Number.isFinite(pct)) return '0';
    if (pct < 1) return String(parseFloat(pct.toFixed(2)));
    return String(Math.round(pct));
}

const DASH_LIB_FLAG_REASON_LABELS = {
    ai_generated: 'AI Generated',
    poor_feedback_from_previous_qa: 'Poor Feedback From Previous QA',
    possible_duplicate: 'Possible Duplicate',
    other: 'Other'
};

function dashLibPgInFilter(values) {
    const list = (Array.isArray(values) ? values : []).filter((v) => v != null && v !== '');
    if (list.length === 0) return null;
    if (list.length > DASH_PG_IN_MAX) {
        throw new Error('dashboard-lib: pgInFilter length ' + list.length + ' exceeds max ' + DASH_PG_IN_MAX);
    }
    if (list.length === 1) return 'eq.' + list[0];
    return 'in.(' + list.join(',') + ')';
}

function dashLibPgInChunks(values, maxSize) {
    const max = maxSize || DASH_PG_IN_MAX;
    const deduped = [...new Set((Array.isArray(values) ? values : []).filter((v) => v != null && v !== ''))];
    if (deduped.length === 0) return [];
    const chunks = [];
    for (let i = 0; i < deduped.length; i += max) {
        chunks.push(deduped.slice(i, i + max));
    }
    return chunks;
}

function dashLibPrepareText(value, caseSensitive) {
    const trimmed = (value || '').replace(/\s+/g, ' ').trim();
    return caseSensitive ? trimmed : trimmed.toLowerCase();
}

function dashLibCompileFilterRegex(pattern, caseSensitive) {
    const trimmed = String(pattern ?? '').trim();
    if (!trimmed) return { re: null };
    const flags = caseSensitive ? 'g' : 'gi';
    try {
        return { re: new RegExp(trimmed, flags) };
    } catch (err) {
        return { error: err };
    }
}

function dashLibLevenshtein(a, b, maxDistance) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
    const prev = new Array(b.length + 1);
    const curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j += 1) prev[j] = j;
    for (let i = 1; i <= a.length; i += 1) {
        curr[0] = i;
        let minRow = curr[0];
        const aChar = a.charCodeAt(i - 1);
        for (let j = 1; j <= b.length; j += 1) {
            const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
            const val = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            curr[j] = val;
            if (val < minRow) minRow = val;
        }
        if (minRow > maxDistance) return maxDistance + 1;
        for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
    }
    return prev[b.length];
}

function dashLibIsFuzzyMatch(query, candidate) {
    if (!query) return true;
    if (candidate.includes(query)) return true;
    const maxDistance = query.length <= 6 ? 1 : Math.max(2, Math.floor(query.length * 0.2));
    if (dashLibLevenshtein(query, candidate, maxDistance) <= maxDistance) return true;
    const queryWords = query.split(' ');
    const candidateWords = candidate.split(' ');
    return queryWords.every((queryWord) => {
        const wordMax = queryWord.length <= 5 ? 1 : 2;
        return candidateWords.some((candidateWord) => (
            candidateWord.includes(queryWord)
            || dashLibLevenshtein(queryWord, candidateWord, wordMax) <= wordMax
        ));
    });
}

function dashLibParseFeedbackData(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch (_e) { return {}; }
    }
    return {};
}

function dashLibMapPromptQualityRating(rating) {
    if (rating == null || rating === '') return 'Average';
    const key = String(rating).toLowerCase();
    if (key.includes('top')) return 'Top 10%';
    if (key.includes('bottom')) return 'Bottom 10%';
    return 'Average';
}

function dashLibNormalizeNewlines(text) {
    return String(text).replace(/\\n/g, '\n');
}

function dashLibNormalizeScreenshotKeys(...sources) {
    const out = [];
    const seen = new Set();
    for (const src of sources) {
        if (!Array.isArray(src)) continue;
        for (const k of src) {
            const key = String(k || '').trim();
            if (key && !seen.has(key)) {
                seen.add(key);
                out.push(key);
            }
        }
    }
    return out;
}

function dashLibIsQaEscalatedForFleetReview(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.is_escalation === true) return true;
    if (data.environment_feedback || data.grading_feedback) return true;
    const sources = Array.isArray(data.issue_sources)
        ? data.issue_sources.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
        : [];
    if (sources.length === 0) return false;
    const taskOnly = new Set(['task', 'task feedback']);
    return sources.some((s) => !taskOnly.has(s));
}

function dashLibParseRscFlightStringTable(flightText) {
    const table = new Map();
    const text = String(flightText || '');
    if (!text) return table;
    for (const line of text.split('\n')) {
        const m = line.match(/^(\d+):T[^,]*,(.*)$/);
        if (!m) continue;
        const id = Number(m[1]);
        if (!Number.isInteger(id)) continue;
        table.set(id, m[2]);
    }
    return table;
}

function dashLibResolveRscFlightRef(value, table) {
    const raw = String(value ?? '');
    const m = raw.match(DASH_LIB_RSC_REF_RE);
    if (!m || !table) return raw;
    const resolved = table.get(Number(m[1]));
    return resolved != null ? String(resolved) : raw;
}

function dashLibResolveRscRefsInValue(value, table) {
    if (value == null) return value;
    if (typeof value === 'string') return dashLibResolveRscFlightRef(value, table);
    if (Array.isArray(value)) return value.map((v) => dashLibResolveRscRefsInValue(v, table));
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = dashLibResolveRscRefsInValue(v, table);
        }
        return out;
    }
    return value;
}

function dashLibExtractEventsFromRscFlight(flightText) {
    const text = String(flightText || '');
    if (!text) return [];
    for (const line of text.split('\n')) {
        const colon = line.indexOf(':');
        if (colon < 1) continue;
        const body = line.slice(colon + 1);
        if (!body.includes('"events"')) continue;
        try {
            const parsed = JSON.parse(body);
            if (parsed && Array.isArray(parsed.events)) return parsed.events;
        } catch (_e) {
            /* try next line */
        }
    }
    return [];
}

function dashLibPayloadHasUnresolvedRscRefs(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const data = payload.feedback_data;
    if (!data || typeof data !== 'object') return false;
    for (const v of Object.values(data)) {
        if (typeof v === 'string' && DASH_LIB_RSC_REF_RE.test(v.trim())) return true;
    }
    if (typeof payload.feedback_content === 'string' && DASH_LIB_RSC_REF_RE.test(payload.feedback_content.trim())) {
        return true;
    }
    return false;
}

function dashLibResolveTaskEventPayload(event, table) {
    if (!event || typeof event !== 'object' || !table || table.size === 0) return event;
    const payload = event.payload;
    if (!payload || typeof payload !== 'object') return event;
    return {
        ...event,
        payload: dashLibResolveRscRefsInValue(payload, table)
    };
}

function dashLibResolveTaskEventsWithFlightTable(events, table) {
    if (!table || table.size === 0) return events || [];
    return (events || []).map((e) => dashLibResolveTaskEventPayload(e, table));
}

function dashLibIsQaFlaggedAsBugged(data, feedbackContent) {
    if (data && typeof data === 'object') {
        if (data.bug_reason || data.bug_description) return true;
        if (data.attempted_actions
            && !data.task_feedback && !data.general_feedback
            && !data.environment_feedback && !data.grading_feedback) {
            return true;
        }
    }
    const content = String(feedbackContent || '').trim();
    if (content && /flagged as bugged/i.test(content)) return true;
    return false;
}

function dashLibParseDateInput(dateLocal) {
    const raw = String(dateLocal || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const parts = raw.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const date = new Date(y, m, d);
    if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
    return date;
}

function dashLibStartOfLocalDay(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date;
}

function dashLibTeamNameFromCatalog(id, teamCatalog) {
    const found = (teamCatalog || []).find(([tid]) => tid === id);
    return found ? found[1] : '';
}

function dashLibProjectNameFromCatalog(id, projects) {
    const found = (projects || []).find((p) => p.id === id);
    return found ? found.name : '';
}

function dashLibProjectDisplayLabel(id, projects) {
    const name = String(dashLibProjectNameFromCatalog(id, projects) || '').trim();
    if (name) return name;
    const projectId = String(id || '').trim();
    return projectId ? projectId.slice(0, 8) : '';
}

function dashLibPersonLabel(name, email) {
    const trimmedName = String(name ?? '').trim();
    const trimmedEmail = String(email ?? '').trim();
    if (trimmedName && trimmedEmail) return `${trimmedName} (${trimmedEmail})`;
    return trimmedName || trimmedEmail || 'Unknown';
}

function dashLibIsDimensionUnrestricted(selected, optionCount) {
    if (optionCount === 0) return true;
    const sel = selected || [];
    return sel.length === 0;
}

function dashLibPassesDimension(values, selected, optionCount) {
    if (optionCount === 0) return true;
    if (dashLibIsDimensionUnrestricted(selected, optionCount)) return true;
    const set = new Set(selected);
    return values.some((value) => set.has(value));
}

function dashLibV1CreationTimeMinutes(seconds) {
    const sec = Number(seconds);
    if (!Number.isFinite(sec) || sec < 0) return null;
    return Math.round(sec / 60);
}

function dashLibV1CreationTimeBucketId(minutes) {
    if (!Number.isFinite(minutes) || minutes < 0) return null;
    if (minutes < 10) return 'lt_10';
    if (minutes <= 20) return '11_20';
    if (minutes <= 40) return '21_40';
    if (minutes <= 60) return '41_60';
    if (minutes <= 90) return '61_90';
    if (minutes <= 120) return '91_120';
    return 'gt_120';
}

/** ISO timestamp → relative "N units ago"; never emits a zero unit (minimum: 1 minute). */
function dashLibRelativeAgo(iso, options) {
    if (!iso) return '';
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return '';
    const compact = Boolean(options && options.style === 'compact');
    const diffMs = Math.max(0, Date.now() - then.getTime());
    const totalMins = Math.floor(diffMs / (1000 * 60));
    const totalHours = Math.floor(totalMins / 60);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    const dayLabel = (n) => n + ' day' + (n === 1 ? '' : 's');
    const hourLabel = (n) => compact
        ? n + (n === 1 ? ' hr' : ' hrs')
        : n + ' hour' + (n === 1 ? '' : 's');
    const minLabel = (n) => compact
        ? n + (n === 1 ? ' min' : ' mins')
        : n + ' minute' + (n === 1 ? '' : 's');

    if (days > 0) {
        let text = dayLabel(days);
        if (hours > 0) text += ', ' + hourLabel(hours);
        return text + ' ago';
    }
    if (hours > 0) {
        return hourLabel(hours) + ' ago';
    }
    return minLabel(Math.max(1, totalMins)) + ' ago';
}

const DASH_LIB_EPIC_CRITERION_LINE_RE = /^\[C\]\s+((?:\[NICE\]\s+)?.+:\s+(0\.0|1\.0)\/1\.0\s+—\s+.+)$/;
const DASH_LIB_VERIFY_SECTION_RE =
    /<<<\s*VERIFY_([A-Za-z0-9_-]+)\s*<<<([\s\S]*?)>>>\s*VERIFY_\1\s*>>>/g;
const DASH_LIB_ACCUMULATOR_IN_SECTION_RE =
    />>>\s*(SUCCESS|ERROR|FAILURE)_ACCUMULATOR\s*>>>\s*([\s\S]*?)\s*<<<\s*\1_ACCUMULATOR\s*<</g;

function dashLibCapitalizeAppLabel(appKey) {
    const key = String(appKey || '').trim();
    if (!key) return '';
    return key.charAt(0).toUpperCase() + key.slice(1);
}

function dashLibStripVerifierCheckPrefix(text) {
    return String(text || '')
        .replace(/^(?:PASS|FAIL)\s*:\s*/i, '')
        .replace(/^\[(?:C|X)\]\s*/i, '')
        .trim();
}

function dashLibExtractAccumulatorChecks(blockBody) {
    const body = String(blockBody || '');
    const checks = [];
    const pushIfCheck = (line) => {
        const raw = String(line || '').trim();
        if (!raw) return;
        if (/^\[(?:C|X)\]/i.test(raw) || /^(?:PASS|FAIL)\s*:/i.test(raw)) {
            checks.push(raw);
        }
    };
    const dq = /"((?:\\.|[^"\\])*)"/g;
    let m;
    while ((m = dq.exec(body)) !== null) {
        pushIfCheck(m[1].replace(/\\"/g, '"').replace(/\\'/g, "'"));
    }
    const sq = /'((?:\\.|[^'\\])*)'/g;
    while ((m = sq.exec(body)) !== null) {
        pushIfCheck(m[1].replace(/\\'/g, "'"));
    }
    if (checks.length > 0) return checks;
    for (const rawLine of body.split('\n')) {
        pushIfCheck(rawLine.trim().replace(/^["']|["'],?$/g, ''));
    }
    return checks;
}

function dashLibParseLoosePassFailLines(sectionBody) {
    const successes = [];
    const failures = [];
    for (const rawLine of String(sectionBody || '').split('\n')) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        if (/^>>>\s*(SUCCESS|ERROR|FAILURE)_ACCUMULATOR/i.test(trimmed)) continue;
        if (/^<<<\s*(SUCCESS|ERROR|FAILURE)_ACCUMULATOR/i.test(trimmed)) continue;
        if (/^App\s+/i.test(trimmed)) continue;
        const passMatch = trimmed.match(/^(?:PASS\s*:\s*)?(\[C\].+)$/i);
        if (passMatch) {
            successes.push(passMatch[1]);
            continue;
        }
        const failMatch = trimmed.match(/^(?:FAIL\s*:\s*)?(\[X\].+)$/i);
        if (failMatch) {
            failures.push(failMatch[1]);
        }
    }
    return { successes, failures };
}

function dashLibFormatAppSection(appKey, sectionBody) {
    const successes = [];
    const failures = [];
    const body = String(sectionBody || '');
    let m;
    const accumRe = new RegExp(DASH_LIB_ACCUMULATOR_IN_SECTION_RE.source, 'g');
    while ((m = accumRe.exec(body)) !== null) {
        const kind = String(m[1] || '').toUpperCase();
        const checks = dashLibExtractAccumulatorChecks(m[2]);
        const target = kind === 'SUCCESS' ? successes : failures;
        for (const c of checks) target.push(c);
    }
    const loose = dashLibParseLoosePassFailLines(body);
    for (const c of loose.successes) {
        if (!successes.includes(c)) successes.push(c);
    }
    for (const c of loose.failures) {
        if (!failures.includes(c)) failures.push(c);
    }
    if (successes.length === 0 && failures.length === 0) return '';
    const lines = [dashLibCapitalizeAppLabel(appKey) + ':'];
    for (const c of successes) {
        const text = dashLibStripVerifierCheckPrefix(c);
        if (text) lines.push('✅ ' + text);
    }
    for (const c of failures) {
        const text = dashLibStripVerifierCheckPrefix(c);
        if (text) lines.push('❌ ' + text);
    }
    return lines.join('\n');
}

function dashLibFormatVerifierStdoutEpicFallback(text) {
    const lines = String(text || '').split('\n');
    const formatted = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        const epic = trimmed.match(DASH_LIB_EPIC_CRITERION_LINE_RE);
        if (epic) {
            const score = epic[2];
            const emoji = score === '1.0' ? '✅' : '❌';
            return emoji + ' ' + dashLibStripVerifierCheckPrefix(trimmed);
        }
        return line;
    });
    return formatted.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Plain-text verifier stdout grouped by app (caller HTML-escapes). */
function dashLibFormatVerifierStdout(raw) {
    const text = String(raw || '');
    if (!text.trim()) return '';

    const sections = [];
    let m;
    const sectionRe = new RegExp(DASH_LIB_VERIFY_SECTION_RE.source, 'g');
    while ((m = sectionRe.exec(text)) !== null) {
        const formatted = dashLibFormatAppSection(m[1], m[2]);
        if (formatted) sections.push(formatted);
    }

    if (sections.length === 0) {
        return dashLibFormatVerifierStdoutEpicFallback(text);
    }

    const combined = text.match(/Combined result:\s*[^\n]+/i);
    let out = sections.join('\n\n');
    if (combined) {
        out += '\n\n' + combined[0].trim();
    }
    return out.trim();
}

const plugin = {
    id: 'dashboard-lib',
    name: 'Dashboard Lib',
    description: 'Pure helpers for the Worker Output Search dashboard (filters, versions, highlighting)',
    _version: '6.3',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const self = this;
        const bind = (fn) => fn.bind(self);
        Context.dashboardLib = {
            PG_IN_MAX: DASH_PG_IN_MAX,
            pgInFilter: dashLibPgInFilter,
            pgInChunks: dashLibPgInChunks,
            isDimensionUnrestricted: dashLibIsDimensionUnrestricted,

            escHtml: dashLibEscHtml,
            formatCreatedAt: dashLibFormatCreatedAt,
            copyIconHtml: dashLibCopyIconHtml,
            formatPercent: dashLibFormatPercent,
            NUMERIC_COMPARATORS: DASH_LIB_NUMERIC_COMPARATORS,
            DATE_COMPARATORS: DASH_LIB_DATE_COMPARATORS,

            MIN_SUBSTRING_LENGTH: DASH_LIB_MIN_SUBSTRING_LENGTH,
            CHECKBOX_FILTER_DIMENSIONS: self._checkboxFilterDimensions,

            isQueryEmpty: (value, caseSensitive) => dashLibPrepareText(value, caseSensitive).length === 0,
            isSubstringTooShort: (value, caseSensitive) => {
                const length = dashLibPrepareText(value, caseSensitive).length;
                return length > 0 && length < DASH_LIB_MIN_SUBSTRING_LENGTH;
            },
            isQueryActive: (value, caseSensitive) => (
                dashLibPrepareText(value, caseSensitive).length >= DASH_LIB_MIN_SUBSTRING_LENGTH
            ),
            isRegexQueryActive: (value) => String(value ?? '').trim().length > 0,
            compileFilterRegex: (pattern, caseSensitive) => dashLibCompileFilterRegex(pattern, caseSensitive),
            isPromptFilterInvalid: (promptText, caseSensitive, regex) => {
                if (regex) {
                    const trimmed = String(promptText ?? '').trim();
                    if (!trimmed) return { invalid: false, message: '' };
                    const { error } = dashLibCompileFilterRegex(trimmed, caseSensitive);
                    if (error) {
                        return {
                            invalid: true,
                            message: 'Invalid RegEx: ' + (error.message || String(error))
                        };
                    }
                    return { invalid: false, message: '' };
                }
                const length = dashLibPrepareText(promptText, caseSensitive).length;
                if (length > 0 && length < DASH_LIB_MIN_SUBSTRING_LENGTH) {
                    return {
                        invalid: true,
                        message: 'Substring must be at least ' + DASH_LIB_MIN_SUBSTRING_LENGTH + ' characters.'
                    };
                }
                return { invalid: false, message: '' };
            },
            textMatchesQuery: (text, queryText, fuzzy, caseSensitive, regex) => {
                if (regex) {
                    const { re, error } = dashLibCompileFilterRegex(queryText, caseSensitive);
                    if (error || !re) return false;
                    re.lastIndex = 0;
                    return re.test(String(text ?? ''));
                }
                const query = dashLibPrepareText(queryText, caseSensitive);
                if (!query) return false;
                const candidate = dashLibPrepareText(text, caseSensitive);
                return fuzzy ? dashLibIsFuzzyMatch(query, candidate) : candidate.includes(query);
            },

            computeDisplayVersions: bind(self._computeDisplayVersions),
            resolveVersionAtFeedback: bind(self._resolveVersionAtFeedback),
            buildHighlightSegments: bind(self._buildHighlightSegments),

            returnTypeOf: bind(self._returnTypeOf),
            taskContributorIds: bind(self._taskContributorIds),
            taskPromptRatings: bind(self._taskPromptRatings),
            taskIssueLabels: bind(self._taskIssueLabels),
            taskReturnTypes: bind(self._taskReturnTypes),
            taskPassesFilterDimensions: bind(self._taskPassesFilterDimensions),
            applyClientTaskFilters: bind(self._applyClientTaskFilters),

            applyClientWorkerOutputFilters: bind(self._applyClientWorkerOutputFilters),
            sortWorkerOutputItems: bind(self._sortWorkerOutputItems),
            buildFilterListOptions: bind(self._buildFilterListOptions),
            applyFiltersAndSort: bind(self._applyFiltersAndSort),
            emptyFilterIrrelevance: bind(self._emptyFilterIrrelevance),
            computeFilterIrrelevance: bind(self._computeFilterIrrelevance),
            emptyFilterOptionCounts: bind(self._emptyFilterOptionCounts),
            computeFilterOptionCounts: bind(self._computeFilterOptionCounts),
            computeFilterScopedTotal: bind(self._computeFilterScopedTotal),
            computeFilterScopedTotalForOrder: bind(self._computeFilterScopedTotalForOrder),

            buildQaFeedbackDisplay: bind(self._buildQaFeedbackDisplay),
            dedupeSystemFeedbackEntries: bind(self._dedupeSystemFeedbackEntries),
            buildVerifierFailureDisplayFromEvent: bind(self._buildVerifierFailureDisplayFromEvent),
            buildBugReportDisplayFromEvent: bind(self._buildBugReportDisplayFromEvent),
            feedbackEntriesFromTaskEvents: bind(self._feedbackEntriesFromTaskEvents),
            parseRscFlightStringTable: dashLibParseRscFlightStringTable,
            resolveRscFlightRef: dashLibResolveRscFlightRef,
            extractEventsFromRscFlight: dashLibExtractEventsFromRscFlight,
            payloadHasUnresolvedRscRefs: dashLibPayloadHasUnresolvedRscRefs,
            resolveTaskEventsWithFlightTable: dashLibResolveTaskEventsWithFlightTable,
            mergeTaskEventsPreferRsc: bind(self._mergeTaskEventsPreferRsc),
            buildDisputeDisplay: bind(self._buildDisputeDisplay),
            buildFlagDisplay: bind(self._buildFlagDisplay),
            flagReasonLabel: (reason) => self._flagReasonLabel(reason),

            dateLocalToIso: bind(self._dateLocalToIso),
            validateCreatedAtRange: bind(self._validateCreatedAtRange),
            quickDatePresetRange: bind(self._quickDatePresetRange),
            dateInputValue: bind(self._dateInputValue),
            relativeAgo: dashLibRelativeAgo,
            isUniversalSearchParams: bind(self._isUniversalSearchParams),
            validateUniversalSearchRange: bind(self._validateUniversalSearchRange),

            qaTextBlockLabel: bind(self._qaTextBlockLabel),
            formatVerifierStdout: dashLibFormatVerifierStdout,

            projectDisplayLabel: dashLibProjectDisplayLabel,

            filterScopes: DASH_LIB_FILTER_SCOPES,
            sortDefault: DASH_LIB_SORT_DEFAULT,
            sortMetrics: DASH_LIB_SORT_METRICS,
            sortOptions: DASH_LIB_SORT_OPTIONS,
            outputKindLabels: DASH_LIB_OUTPUT_KIND_LABELS,
            outputKindMergeOrder: DASH_LIB_OUTPUT_KIND_MERGE_ORDER,
            manualFilterFields: DASH_LIB_MANUAL_FILTER_FIELDS,
            manualFilterDefaultField: DASH_LIB_MANUAL_FILTER_DEFAULT_FIELD,
            manualFilterDefaultComparator: DASH_LIB_MANUAL_FILTER_DEFAULT_COMPARATOR,
            defaultManualFilterStageRows: dashLibDefaultManualFilterStageRows,
            manualFilterWordCount: dashLibManualFilterWordCount,
            noneSelectedHint: DASH_LIB_NONE_SELECTED_HINT,
            substringFilterHelp: DASH_LIB_SUBSTRING_FILTER_HELP,
            resultsModeHints: DASH_LIB_RESULTS_MODE_HINTS,

            QA_HELPFULNESS_ORDER: DASH_LIB_QA_HELPFULNESS_ORDER,
            QA_HELPFULNESS_LABELS: DASH_LIB_QA_HELPFULNESS_LABELS,
            SESSION_QA_OUTCOME_ORDER: DASH_LIB_SESSION_QA_OUTCOME_ORDER,
            SESSION_QA_OUTCOME_LABELS: DASH_LIB_SESSION_QA_OUTCOME_LABELS,
            DISPUTE_OUTCOME_ORDER: DASH_LIB_DISPUTE_OUTCOME_ORDER,
            DISPUTE_OUTCOME_LABELS: DASH_LIB_DISPUTE_OUTCOME_LABELS,
            SR_REVIEW_OUTCOME_ORDER: DASH_LIB_SR_REVIEW_OUTCOME_ORDER,
            SR_REVIEW_OUTCOME_LABELS: DASH_LIB_SR_REVIEW_OUTCOME_LABELS,
            V1_CREATION_TIME_BUCKET_ORDER: DASH_LIB_V1_CREATION_TIME_BUCKET_ORDER,
            V1_CREATION_TIME_BUCKET_LABELS: DASH_LIB_V1_CREATION_TIME_BUCKET_LABELS,
            v1CreationTimeMinutes: dashLibV1CreationTimeMinutes,
            v1CreationTimeBucketId: dashLibV1CreationTimeBucketId,
            itemFeedbackIdsForHelpfulness: bind(self._itemFeedbackIdsForHelpfulness),
            itemQaHelpfulness: bind(self._itemQaHelpfulness),
            itemPromptHistory: bind(self._itemPromptHistory),
            itemSessionQaOutcomes: bind(self._itemSessionQaOutcomes),
            itemDisputeOutcomes: bind(self._itemDisputeOutcomes),
            itemSrReviewOutcomes: bind(self._itemSrReviewOutcomes),
            itemV1CreationTimeMinutes: bind(self._itemV1CreationTimeMinutes),
            itemV1CreationTimeBuckets: bind(self._itemV1CreationTimeBuckets),
            itemQaTimeMinutes: bind(self._itemQaTimeMinutes),
            itemQaTimeMinutesBuckets: bind(self._itemQaTimeMinutesBuckets),
            itemDisputeResolutionTimeMinutes: bind(self._itemDisputeResolutionTimeMinutes),
            itemDisputeResolutionTimeMinutesBuckets: bind(self._itemDisputeResolutionTimeMinutesBuckets)
        };
        Logger.log('dashboard-lib: module registered (Context.dashboardLib)');
    },

    _computeDisplayVersions(rawVersions) {
        if (!rawVersions || !rawVersions.length) return [];
        const sorted = [...rawVersions].sort((a, b) => a.version_no - b.version_no);
        const result = [];
        let prevPrompt = null;
        let displayNo = 0;
        for (const v of sorted) {
            const prompt = String(v.prompt ?? '');
            const notes = String(v.resubmission_notes ?? '').trim();
            if (prompt !== prevPrompt) {
                displayNo += 1;
                result.push({
                    id: String(v.id ?? ''),
                    versionNo: v.version_no,
                    displayVersionNo: displayNo,
                    prompt,
                    envKey: String(v.env_key ?? ''),
                    createdAt: String(v.created_at ?? ''),
                    resubmissionNotes: notes
                });
                prevPrompt = prompt;
            } else if (notes && result.length) {
                const last = result[result.length - 1];
                if (!last.resubmissionNotes) {
                    last.resubmissionNotes = notes;
                } else if (last.resubmissionNotes !== notes) {
                    last.resubmissionNotes += '\n\n' + notes;
                }
            }
        }
        return result;
    },

    _resolveVersionAtFeedback(versions, feedbackCreatedAt) {
        const displayVersions = this._computeDisplayVersions(versions);
        const totalVersions = displayVersions.length;
        if (!versions || !versions.length) {
            return {
                version: null,
                versionNo: 1,
                totalVersions: 0,
                displayVersionNo: 1,
                rawVersionNo: 1
            };
        }
        const feedbackTs = Date.parse(feedbackCreatedAt);
        const sortedRaw = [...versions].sort((a, b) => a.version_no - b.version_no);
        let matchedRaw = sortedRaw[0];
        for (const version of sortedRaw) {
            const versionTs = Date.parse(version.created_at);
            if (Number.isNaN(versionTs) || versionTs <= feedbackTs) matchedRaw = version;
            else break;
        }
        let matchedDisplay = displayVersions[0] || null;
        for (const version of displayVersions) {
            const versionTs = Date.parse(version.createdAt);
            if (Number.isNaN(versionTs) || versionTs <= feedbackTs) matchedDisplay = version;
            else break;
        }
        return {
            version: matchedDisplay,
            versionNo: (matchedDisplay && matchedDisplay.displayVersionNo) || 1,
            totalVersions,
            displayVersionNo: (matchedDisplay && matchedDisplay.displayVersionNo) || 1,
            rawVersionNo: (matchedRaw && matchedRaw.version_no) || 1
        };
    },

    _mergeHighlightRanges(source, ranges) {
        if (ranges.length === 0) return [{ text: source, match: false }];
        ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const merged = [];
        for (const [start, end] of ranges) {
            const last = merged[merged.length - 1];
            if (last && start <= last[1]) last[1] = Math.max(last[1], end);
            else merged.push([start, end]);
        }
        const segments = [];
        let pos = 0;
        for (const [start, end] of merged) {
            if (start > pos) segments.push({ text: source.slice(pos, start), match: false });
            segments.push({ text: source.slice(start, end), match: true });
            pos = end;
        }
        if (pos < source.length) segments.push({ text: source.slice(pos), match: false });
        return segments;
    },

    _buildRegexHighlightSegments(text, query, options) {
        const caseSensitive = (options && options.caseSensitive) || false;
        const source = String(text ?? '');
        const trimmed = String(query ?? '').trim();
        if (!source || !trimmed) return [{ text: source, match: false }];
        const { re, error } = dashLibCompileFilterRegex(trimmed, caseSensitive);
        if (error || !re) return [{ text: source, match: false }];
        const ranges = [];
        let match;
        re.lastIndex = 0;
        while ((match = re.exec(source)) !== null) {
            if (match[0].length === 0) {
                re.lastIndex += 1;
                continue;
            }
            ranges.push([match.index, match.index + match[0].length]);
            if (!re.global) break;
        }
        return this._mergeHighlightRanges(source, ranges);
    },

    _buildHighlightSegments(text, query, options) {
        const caseSensitive = (options && options.caseSensitive) || false;
        const fuzzy = Boolean(options && options.fuzzy);
        const regex = Boolean(options && options.regex);
        if (regex) return this._buildRegexHighlightSegments(text, query, options);
        const source = String(text ?? '');
        const normalizedQuery = String(query ?? '').replace(/\s+/g, ' ').trim();
        if (!source || !normalizedQuery) return [{ text: source, match: false }];
        const needles = fuzzy
            ? [...new Set([normalizedQuery, ...normalizedQuery.split(' ')])].filter((n) => n.length >= 1)
            : [normalizedQuery];
        needles.sort((a, b) => b.length - a.length);
        const haystack = caseSensitive ? source : source.toLowerCase();
        const ranges = [];
        for (const needle of needles) {
            const target = caseSensitive ? needle : needle.toLowerCase();
            let from = 0;
            while (from <= haystack.length) {
                const idx = haystack.indexOf(target, from);
                if (idx === -1) break;
                ranges.push([idx, idx + target.length]);
                from = idx + target.length;
            }
        }
        if (ranges.length === 0) return [{ text: source, match: false }];
        return this._mergeHighlightRanges(source, ranges);
    },

    _returnTypeOf(entry) {
        if (entry.isVerifierFailure || (entry.display && entry.display.isVerifierFailure)) return null;
        if (entry.isSystemFeedback || (entry.display && entry.display.isSystemFeedback)) return null;
        if (entry.isPositive) return 'accepted';
        if (entry.isEscalated) return 'escalated';
        if (entry.isFlaggedAsBugged) return 'bugged';
        return 'returned';
    },

    _taskContributorIds(task) {
        const ids = new Set();
        if (task.author && task.author.id) ids.add(task.author.id);
        for (const entry of task.allFeedback || []) {
            if (entry.reviewer && entry.reviewer.id) ids.add(entry.reviewer.id);
        }
        return [...ids];
    },

    _taskPromptRatings(task) {
        return [...new Set((task.allFeedback || [])
            .filter((e) => e.display && !e.display.isSystemFeedback)
            .map((e) => e.display.qualityRating)
            .filter(Boolean))];
    },

    _taskIssueLabels(task) {
        const labels = new Set();
        for (const entry of task.allFeedback || []) {
            if (entry.isPositive) continue;
            const display = entry.display;
            if (!display) continue;
            for (const label of display.rejectionBadges || []) labels.add(label);
        }
        return [...labels];
    },

    _taskReturnTypes(task) {
        return [...new Set((task.allFeedback || []).map((e) => this._returnTypeOf(e)).filter(Boolean))];
    },

    _taskPassesFilterDimensions(task, draft, listBounds, excludeKey) {
        const dimensions = [
            { key: 'teamIds', values: task.teamId ? [task.teamId] : [], count: (listBounds.teamIds || []).length },
            { key: 'projectIds', values: task.projectId ? [task.projectId] : [], count: (listBounds.projectIds || []).length },
            { key: 'envKeys', values: task.envKey ? [task.envKey] : [], count: (listBounds.envKeys || []).length },
            { key: 'statuses', values: task.status ? [task.status] : [], count: (listBounds.statuses || []).length },
            { key: 'contributorIds', values: this._taskContributorIds(task), count: (listBounds.contributorIds || []).length },
            { key: 'promptRatings', values: this._taskPromptRatings(task), count: (listBounds.promptRatings || []).length },
            { key: 'taskIssues', values: this._taskIssueLabels(task), count: (listBounds.taskIssues || []).length },
            { key: 'returnTypes', values: this._taskReturnTypes(task), count: (listBounds.returnTypes || []).length }
        ];
        for (const { key, values, count } of dimensions) {
            if (key === excludeKey) continue;
            if (!dashLibPassesDimension(values, draft[key] || [], count)) return false;
        }
        return true;
    },

    _applyClientTaskFilters(tasks, filters, listBounds) {
        const f = filters || {};
        const bounds = listBounds || {};
        let result = tasks;
        const teamIds = f.teamIds || [];
        const projectIds = f.projectIds || [];
        const envKeys = f.envKeys || [];
        const statuses = f.statuses || [];
        const contributorIds = f.contributorIds || [];
        const promptRatings = f.promptRatings || [];
        const taskIssues = f.taskIssues || [];
        const returnTypes = f.returnTypes || [];

        const allTeams = bounds.teamIds || [];
        if (teamIds.length > 0 && !dashLibIsDimensionUnrestricted(teamIds, allTeams.length)) {
            const teamSet = new Set(teamIds);
            result = result.filter((task) => task.teamId && teamSet.has(task.teamId));
        }

        const allProjects = bounds.projectIds || [];
        if (projectIds.length > 0 && !dashLibIsDimensionUnrestricted(projectIds, allProjects.length)) {
            const projectSet = new Set(projectIds);
            result = result.filter((task) => task.projectId && projectSet.has(task.projectId));
        }

        const allEnvs = bounds.envKeys || [];
        if (envKeys.length > 0 && !dashLibIsDimensionUnrestricted(envKeys, allEnvs.length)) {
            const envSet = new Set(envKeys);
            result = result.filter((task) => task.envKey && envSet.has(task.envKey));
        }

        const statusCount = (bounds.statuses || []).length;
        result = result.filter((task) => dashLibPassesDimension([task.status].filter(Boolean), statuses, statusCount));
        const contributorCount = (bounds.contributorIds || []).length;
        result = result.filter((task) => dashLibPassesDimension(this._taskContributorIds(task), contributorIds, contributorCount));
        const ratingCount = (bounds.promptRatings || []).length;
        result = result.filter((task) => dashLibPassesDimension(this._taskPromptRatings(task), promptRatings, ratingCount));
        const issueCount = (bounds.taskIssues || []).length;
        result = result.filter((task) => dashLibPassesDimension(this._taskIssueLabels(task), taskIssues, issueCount));
        const returnTypeCount = (bounds.returnTypes || []).length;
        result = result.filter((task) => dashLibPassesDimension(this._taskReturnTypes(task), returnTypes, returnTypeCount));
        return result;
    },

    _versionsForItem(item) {
        const versions = item.task.promptVersions;
        if (versions && versions.length) return versions;
        return [{ displayVersionNo: 1, prompt: item.task.prompt }];
    },

    _defaultDisplayNoForItem(item) {
        const allFeedback = item.task.allFeedback || [];
        if (item.selectedFeedbackId) {
            const entry = allFeedback.find((f) => f.id === item.selectedFeedbackId);
            if (entry) return entry.linkedDisplayVersionNo;
        }
        const versions = item.task.promptVersions || [];
        return versions.length ? versions[versions.length - 1].displayVersionNo : 1;
    },

    _feedbackTextForVersion(item, displayNo) {
        const texts = [];
        for (const entry of item.task.allFeedback || []) {
            if (entry.linkedDisplayVersionNo !== displayNo) continue;
            const display = entry.display;
            if (!display) continue;
            if (display.isSystemFeedback) {
                for (const block of display.textBlocks || []) {
                    if (block.text) texts.push(block.text);
                }
                continue;
            }
            for (const block of display.textBlocks || []) texts.push(block.text);
        }
        return texts;
    },

    _disputeTextForItem(item) {
        const texts = [];
        for (const dispute of item.disputes || []) {
            if (dispute.reason) texts.push(dispute.reason);
            if (dispute.resolutionText) texts.push(dispute.resolutionText);
        }
        return texts;
    },

    _matchItemSubstring(item, query, fuzzy, caseSensitive, hidden, regex) {
        const lib = Context.dashboardLib;
        const taskKey = String((item.task && item.task.key) || '').trim();
        const taskKeyMatched = taskKey && lib.textMatchesQuery(taskKey, query, fuzzy, caseSensitive, regex);
        const versions = this._versionsForItem(item);
        const defaultNo = this._defaultDisplayNoForItem(item);
        const versionMatches = (version) => {
            if (lib.textMatchesQuery(version.prompt, query, fuzzy, caseSensitive, regex)) return true;
            if (this._feedbackTextForVersion(item, version.displayVersionNo)
                .some((text) => lib.textMatchesQuery(text, query, fuzzy, caseSensitive, regex))) return true;
            return this._disputeTextForItem(item)
                .some((text) => lib.textMatchesQuery(text, query, fuzzy, caseSensitive, regex));
        };
        if (!hidden) {
            const def = versions.find((v) => v.displayVersionNo === defaultNo) || versions[versions.length - 1];
            const versionMatched = def ? versionMatches(def) : false;
            return { matched: taskKeyMatched || versionMatched, extraVersionNos: [] };
        }
        let matched = taskKeyMatched;
        const extraVersionNos = [];
        for (const version of versions) {
            if (versionMatches(version)) {
                matched = true;
                if (version.displayVersionNo !== defaultNo) extraVersionNos.push(version.displayVersionNo);
            }
        }
        return { matched, extraVersionNos };
    },

    _annotateItem(item, extraVisibleVersionNos, highlightQuery, highlightCaseSensitive, highlightFuzzy, highlightRegex) {
        return Object.assign({}, item, {
            extraVisibleVersionNos,
            highlightQuery,
            highlightCaseSensitive,
            highlightFuzzy: Boolean(highlightFuzzy),
            highlightRegex: Boolean(highlightRegex)
        });
    },

    _itemOutputKinds(item) {
        return (item.kinds && item.kinds.length) ? item.kinds : [item.kind];
    },

    _itemPassesOutputKindFilter(item, draft, listBounds, forceIncludeId) {
        const selected = draft.outputKinds || [];
        const count = (listBounds.outputKinds || []).length;
        if (count <= 1) return true;
        let effective = selected;
        if (forceIncludeId !== undefined) {
            effective = [...new Set([...selected, forceIncludeId])];
        }
        return dashLibPassesDimension(this._itemOutputKinds(item), effective, count);
    },

    _taskHasQaEditedVersion(task) {
        const versions = task.promptVersions || [];
        if (versions.length < 2) return false;
        const maxDisplayVersionNo = Math.max(...versions.map((v) => v.displayVersionNo));
        const feedbackByDisplayNo = new Map();
        for (const entry of task.allFeedback || []) {
            const displayNo = entry.linkedDisplayVersionNo;
            if (displayNo == null) continue;
            const list = feedbackByDisplayNo.get(displayNo) || [];
            list.push(entry);
            feedbackByDisplayNo.set(displayNo, list);
        }
        for (const version of versions) {
            if (version.displayVersionNo >= maxDisplayVersionNo) continue;
            if (!(feedbackByDisplayNo.get(version.displayVersionNo) || []).length) return true;
        }
        return false;
    },

    _taskHasNotesToQa(task) {
        return (task.promptVersions || []).some((v) => String(v.resubmissionNotes || '').trim());
    },

    _itemHasAssociatedScreenshots(item) {
        if (!item) return false;
        const task = item.task;
        if (task && Array.isArray(task.allFeedback)) {
            for (const entry of task.allFeedback) {
                const keys = entry.display && entry.display.screenshotKeys;
                if (Array.isArray(keys) && keys.length > 0) return true;
            }
        }
        if (item.qaFeedback && item.qaFeedback.screenshotKeys && item.qaFeedback.screenshotKeys.length) {
            return true;
        }
        for (const dispute of item.disputes || []) {
            if (dispute.screenshotKeys && dispute.screenshotKeys.length) return true;
        }
        return false;
    },

    _itemSessionQaReviews(item, sessionQaUi) {
        if (!item || !item.id) return [];
        const ui = sessionQaUi && sessionQaUi[item.id];
        if (!ui || !Array.isArray(ui.reviews)) return [];
        return ui.reviews;
    },

    _itemPromptHistory(item, sessionQaUi) {
        const flags = new Set();
        for (const entry of item.task.allFeedback || []) {
            const rt = this._returnTypeOf(entry);
            if (rt === 'accepted') flags.add('accepted');
            else if (rt === 'returned') flags.add('returned');
            else if (rt === 'escalated') flags.add('escalated');
            else if (rt === 'bugged') flags.add('flagged');
        }
        if (item.disputes && item.disputes.length > 0) flags.add('disputed');
        if (item.flags && item.flags.length > 0) flags.add('senior_review_flagged');
        if (this._taskHasQaEditedVersion(item.task)) flags.add('qa_edited');
        if (this._taskHasNotesToQa(item.task)) flags.add('notes_to_qa');
        if (this._itemSessionQaReviews(item, sessionQaUi).length > 0) flags.add('session_qa_performed');
        if (this._itemHasAssociatedScreenshots(item)) flags.add('screenshots');
        return [...flags];
    },

    _itemSessionQaOutcomes(item, sessionQaUi) {
        const flags = new Set();
        for (const review of this._itemSessionQaReviews(item, sessionQaUi)) {
            const verdict = String((review && review.verdict) || '').trim().toLowerCase();
            if (DASH_LIB_SESSION_QA_OUTCOME_ORDER.includes(verdict)) flags.add(verdict);
        }
        return [...flags];
    },

    _itemDisputeOutcomes(item) {
        const flags = new Set();
        for (const dispute of (item && item.disputes) || []) {
            if (!dispute) continue;
            const status = String(dispute.status || '').trim().toLowerCase();
            if (!dispute.resolutionAt || status === 'pending' || !status) {
                flags.add('pending');
                continue;
            }
            if (DASH_LIB_DISPUTE_OUTCOME_ORDER.includes(status)) flags.add(status);
        }
        return [...flags];
    },

    _itemSrReviewOutcomes(item) {
        const flags = new Set();
        for (const flag of (item && item.flags) || []) {
            if (!flag) continue;
            if (flag.isPending || String(flag.status || '').toLowerCase() === 'pending' || !flag.resolutionAt) {
                flags.add('pending');
                continue;
            }
            if (flag.isConfirmed || String(flag.status || '').toLowerCase() === 'confirmed') {
                flags.add('confirmed');
            } else if (flag.isDismissed || String(flag.status || '').toLowerCase() === 'dismissed') {
                flags.add('dismissed');
            }
        }
        return [...flags];
    },

    _itemPassesPromptHistoryFilter(item, draft, listBounds, forceIncludeId, sessionQaUi) {
        const selected = draft.promptHistory || [];
        const count = (listBounds.promptHistory || []).length;
        let effective = selected;
        if (forceIncludeId !== undefined) {
            effective = [...new Set([...selected, forceIncludeId])];
        }
        return dashLibPassesDimension(this._itemPromptHistory(item, sessionQaUi), effective, count);
    },

    _itemPassesDimensionFilter(values, selected, optionCount, forceIncludeId) {
        if (optionCount === 0) return true;
        let effective = selected || [];
        if (forceIncludeId !== undefined) {
            effective = [...new Set([...effective, forceIncludeId])];
        }
        return dashLibPassesDimension(values, effective, optionCount);
    },

    _itemPassesSessionQaOutcomeFilter(item, draft, listBounds, sessionQaUi, forceIncludeId) {
        return this._itemPassesDimensionFilter(
            this._itemSessionQaOutcomes(item, sessionQaUi),
            draft.sessionQaOutcomes || [],
            (listBounds.sessionQaOutcomes || []).length,
            forceIncludeId
        );
    },

    _itemPassesDisputeOutcomeFilter(item, draft, listBounds, forceIncludeId) {
        return this._itemPassesDimensionFilter(
            this._itemDisputeOutcomes(item),
            draft.disputeOutcomes || [],
            (listBounds.disputeOutcomes || []).length,
            forceIncludeId
        );
    },

    _itemPassesSrReviewOutcomeFilter(item, draft, listBounds, forceIncludeId) {
        return this._itemPassesDimensionFilter(
            this._itemSrReviewOutcomes(item),
            draft.srReviewOutcomes || [],
            (listBounds.srReviewOutcomes || []).length,
            forceIncludeId
        );
    },

    _feedbackEligibleForHelpfulness(entry, currentUserId) {
        if (!entry || !entry.id) return false;
        const display = entry.display;
        if (display && (display.isSystemFeedback || display.isVerifierFailure)) return false;
        if (entry.isSystemFeedback || entry.isVerifierFailure) return false;
        const userId = String(currentUserId || '').trim();
        if (!userId) return true;
        const authorId = String(
            (display && display.qaReviewerId)
            || (entry.reviewer && entry.reviewer.id)
            || ''
        ).trim();
        return !(authorId && authorId === userId);
    },

    _itemFeedbackIdsForHelpfulness(item, currentUserId) {
        const task = item && item.task;
        if (!task) return [];
        if (item.selectedFeedbackId) {
            const entry = (task.allFeedback || []).find((f) => f.id === item.selectedFeedbackId);
            return entry && this._feedbackEligibleForHelpfulness(entry, currentUserId)
                ? [String(item.selectedFeedbackId)]
                : [];
        }
        const ids = [];
        for (const entry of task.allFeedback || []) {
            if (this._feedbackEligibleForHelpfulness(entry, currentUserId) && entry.id) {
                ids.push(String(entry.id));
            }
        }
        return ids;
    },

    _itemQaHelpfulness(item, helpfulnessUi, currentUserId) {
        const uiMap = helpfulnessUi || {};
        const flags = new Set();
        for (const fid of this._itemFeedbackIdsForHelpfulness(item, currentUserId)) {
            const ui = uiMap[fid];
            if (!ui) continue;
            if (ui.isHelpful === true) flags.add('helpful');
            if (ui.isHelpful === false) flags.add('not_helpful');
            const reviewText = ui.reportText != null ? String(ui.reportText).trim() : '';
            if (reviewText.length > 0) flags.add('written_review');
        }
        return [...flags];
    },

    _itemPassesQaHelpfulnessFilter(item, draft, listBounds, helpfulnessUi, forceIncludeId, currentUserId) {
        const selected = draft.qaHelpfulness || [];
        const count = (listBounds.qaHelpfulness || []).length;
        if (count === 0) return true;
        let effective = selected;
        if (forceIncludeId !== undefined) {
            effective = [...new Set([...selected, forceIncludeId])];
        }
        return dashLibPassesDimension(this._itemQaHelpfulness(item, helpfulnessUi, currentUserId), effective, count);
    },

    _itemV1CreationTimeMinutes(item) {
        const task = item && item.task;
        if (!task) return null;
        const sec = task.initialCreationTimeSeconds;
        return dashLibV1CreationTimeMinutes(sec);
    },

    _itemV1CreationTimeBuckets(item) {
        const minutes = this._itemV1CreationTimeMinutes(item);
        if (minutes == null) return [];
        const bucketId = dashLibV1CreationTimeBucketId(minutes);
        return bucketId ? [bucketId] : [];
    },

    _itemPassesV1CreationTimeFilter(item, draft, listBounds, forceIncludeId) {
        const selected = draft.v1CreationTimeMinutes || [];
        const count = (listBounds.v1CreationTimeMinutes || []).length;
        if (count === 0) return true;
        let effective = selected;
        if (forceIncludeId !== undefined) {
            effective = [...new Set([...selected, forceIncludeId])];
        }
        return dashLibPassesDimension(this._itemV1CreationTimeBuckets(item), effective, count);
    },

    _collectItemQaReviewDurationSeconds(item) {
        const seconds = [];
        const seen = new Set();
        const addDisplay = (display, feedbackId) => {
            if (!display || display.isSystemFeedback || display.isVerifierFailure) return;
            const key = feedbackId != null ? String(feedbackId) : '';
            if (key && seen.has(key)) return;
            const sec = display.reviewDurationSeconds;
            if (sec == null || !Number.isFinite(Number(sec)) || Number(sec) < 0) return;
            if (key) seen.add(key);
            seconds.push(Number(sec));
        };
        if (item && item.qaFeedback) {
            addDisplay(item.qaFeedback, item.selectedFeedbackId || item.qaFeedback.id);
        }
        const task = item && item.task;
        if (task && Array.isArray(task.allFeedback)) {
            for (const entry of task.allFeedback) {
                addDisplay(entry.display || null, entry.id);
            }
        }
        return seconds;
    },

    _itemQaTimeMinutes(item) {
        const seconds = this._collectItemQaReviewDurationSeconds(item);
        if (seconds.length === 0) return null;
        return dashLibV1CreationTimeMinutes(Math.max(...seconds));
    },

    _itemQaTimeMinutesBuckets(item) {
        const buckets = new Set();
        for (const sec of this._collectItemQaReviewDurationSeconds(item)) {
            const minutes = dashLibV1CreationTimeMinutes(sec);
            const bucketId = dashLibV1CreationTimeBucketId(minutes);
            if (bucketId) buckets.add(bucketId);
        }
        return [...buckets];
    },

    _itemPassesQaTimeFilter(item, draft, listBounds, forceIncludeId) {
        const selected = draft.qaTimeMinutes || [];
        const count = (listBounds.qaTimeMinutes || []).length;
        if (count === 0) return true;
        let effective = selected;
        if (forceIncludeId !== undefined) {
            effective = [...new Set([...selected, forceIncludeId])];
        }
        return dashLibPassesDimension(this._itemQaTimeMinutesBuckets(item), effective, count);
    },

    _collectItemDisputeResolutionDurationSeconds(item) {
        const seconds = [];
        for (const dispute of (item && item.disputes) || []) {
            if (!dispute.resolutionAt) continue;
            const sec = dispute.reviewDurationSeconds;
            if (sec == null || !Number.isFinite(Number(sec)) || Number(sec) < 0) continue;
            seconds.push(Number(sec));
        }
        return seconds;
    },

    _itemDisputeResolutionTimeMinutes(item) {
        const seconds = this._collectItemDisputeResolutionDurationSeconds(item);
        if (seconds.length === 0) return null;
        return dashLibV1CreationTimeMinutes(Math.max(...seconds));
    },

    _itemDisputeResolutionTimeMinutesBuckets(item) {
        const buckets = new Set();
        for (const sec of this._collectItemDisputeResolutionDurationSeconds(item)) {
            const minutes = dashLibV1CreationTimeMinutes(sec);
            const bucketId = dashLibV1CreationTimeBucketId(minutes);
            if (bucketId) buckets.add(bucketId);
        }
        return [...buckets];
    },

    _itemPassesDisputeResolutionTimeFilter(item, draft, listBounds, forceIncludeId) {
        const selected = draft.disputeResolutionTimeMinutes || [];
        const count = (listBounds.disputeResolutionTimeMinutes || []).length;
        if (count === 0) return true;
        let effective = selected;
        if (forceIncludeId !== undefined) {
            effective = [...new Set([...selected, forceIncludeId])];
        }
        return dashLibPassesDimension(this._itemDisputeResolutionTimeMinutesBuckets(item), effective, count);
    },

    _applyClientWorkerOutputFilters(items, filters, listBounds, sortContext) {
        const lib = Context.dashboardLib;
        const f = filters || {};
        const bounds = listBounds || {};
        const promptText = f.promptText || '';
        const fuzzy = f.fuzzy || false;
        const caseSensitive = f.caseSensitive || false;
        const regex = Boolean(f.regex);
        const tasks = items.map((item) => item.task);
        const filteredTasks = this._applyClientTaskFilters(tasks, f, bounds);
        const allowedIds = new Set(filteredTasks.map((t) => t.id));
        let passed = items.filter((item) => allowedIds.has(item.task.id));
        const helpfulnessUi = (sortContext && sortContext.helpfulnessUi) || {};
        const currentUserId = (sortContext && sortContext.currentUserId) || '';
        const sessionQaUi = (sortContext && sortContext.sessionQaUi) || {};
        const promptHistoryCount = (bounds.promptHistory || []).length;
        if (promptHistoryCount > 0) {
            passed = passed.filter((item) => dashLibPassesDimension(
                this._itemPromptHistory(item, sessionQaUi), f.promptHistory || [], promptHistoryCount
            ));
        }
        const sessionQaOutcomeCount = (bounds.sessionQaOutcomes || []).length;
        if (sessionQaOutcomeCount > 0) {
            passed = passed.filter((item) => this._itemPassesSessionQaOutcomeFilter(
                item, f, bounds, sessionQaUi
            ));
        }
        const disputeOutcomeCount = (bounds.disputeOutcomes || []).length;
        if (disputeOutcomeCount > 0) {
            passed = passed.filter((item) => this._itemPassesDisputeOutcomeFilter(item, f, bounds));
        }
        const srReviewOutcomeCount = (bounds.srReviewOutcomes || []).length;
        if (srReviewOutcomeCount > 0) {
            passed = passed.filter((item) => this._itemPassesSrReviewOutcomeFilter(item, f, bounds));
        }
        const qaHelpfulnessCount = (bounds.qaHelpfulness || []).length;
        if (qaHelpfulnessCount > 0) {
            passed = passed.filter((item) => this._itemPassesQaHelpfulnessFilter(
                item, f, bounds, helpfulnessUi, undefined, currentUserId
            ));
        }
        const v1CreationTimeCount = (bounds.v1CreationTimeMinutes || []).length;
        if (v1CreationTimeCount > 0) {
            passed = passed.filter((item) => this._itemPassesV1CreationTimeFilter(item, f, bounds));
        }
        const qaTimeCount = (bounds.qaTimeMinutes || []).length;
        if (qaTimeCount > 0) {
            passed = passed.filter((item) => this._itemPassesQaTimeFilter(item, f, bounds));
        }
        const disputeResolutionTimeCount = (bounds.disputeResolutionTimeMinutes || []).length;
        if (disputeResolutionTimeCount > 0) {
            passed = passed.filter((item) => this._itemPassesDisputeResolutionTimeFilter(item, f, bounds));
        }
        const queryActive = regex
            ? lib.isRegexQueryActive(promptText)
            : lib.isQueryActive(promptText, caseSensitive);
        if (!queryActive) {
            return passed.map((item) => this._annotateItem(item, [], '', caseSensitive, false, false));
        }
        const out = [];
        for (const item of passed) {
            const { matched, extraVersionNos } = this._matchItemSubstring(
                item, promptText, fuzzy, caseSensitive, true, regex
            );
            if (matched) {
                out.push(this._annotateItem(item, extraVersionNos, promptText, caseSensitive, fuzzy, regex));
            }
        }
        return out;
    },

    _maxIsoTimestamp(a, b) {
        const sa = String(a || '');
        const sb = String(b || '');
        if (!sa) return sb;
        if (!sb) return sa;
        return sa > sb ? sa : sb;
    },

    _itemTaskSubmittedAt(item) {
        const task = item && item.task;
        return task ? String(task.createdAt || '') : '';
    },

    _itemTaskRevisedAt(item) {
        const task = item && item.task;
        if (!task) return '';
        const versions = task.promptVersions || [];
        if (versions.length <= 1) {
            return String(task.createdAt || (versions[0] && versions[0].createdAt) || '');
        }
        let latest = '';
        for (const version of versions) {
            latest = this._maxIsoTimestamp(latest, version.createdAt);
        }
        return latest || String(task.createdAt || '');
    },

    _itemFeedbackGivenAt(item) {
        const task = item && item.task;
        if (!task) return '';
        let latest = '';
        for (const entry of task.allFeedback || []) {
            latest = this._maxIsoTimestamp(latest, entry.feedbackAt);
        }
        return latest;
    },

    _itemDisputeSubmittedAt(item, sortContext) {
        let latest = '';
        for (const dispute of (item && item.disputes) || []) {
            latest = this._maxIsoTimestamp(latest, dispute.submittedAt);
        }
        const taskId = item && item.task && item.task.id;
        if (!taskId || !sortContext) return latest;
        for (const row of (sortContext.openDisputesByTaskId && sortContext.openDisputesByTaskId.get(taskId)) || []) {
            latest = this._maxIsoTimestamp(latest, row && row.created_at);
        }
        for (const row of (sortContext.resolvedDisputesByTaskId && sortContext.resolvedDisputesByTaskId.get(taskId)) || []) {
            latest = this._maxIsoTimestamp(latest, row && row.created_at);
        }
        return latest;
    },

    _itemDisputeResolvedAt(item, sortContext) {
        let latest = '';
        for (const dispute of (item && item.disputes) || []) {
            latest = this._maxIsoTimestamp(latest, dispute.resolutionAt);
        }
        const taskId = item && item.task && item.task.id;
        if (!taskId || !sortContext) return latest;
        for (const row of (sortContext.openDisputesByTaskId && sortContext.openDisputesByTaskId.get(taskId)) || []) {
            latest = this._maxIsoTimestamp(latest, row && row.resolved_at);
        }
        for (const row of (sortContext.resolvedDisputesByTaskId && sortContext.resolvedDisputesByTaskId.get(taskId)) || []) {
            latest = this._maxIsoTimestamp(latest, row && row.resolved_at);
        }
        return latest;
    },

    _itemSortTimestamp(item, sortMetric, sortContext) {
        const metric = String(sortMetric || 'task_submitted');
        switch (metric) {
            case 'task_revised':
                return this._itemTaskRevisedAt(item);
            case 'feedback_given':
                return this._itemFeedbackGivenAt(item);
            case 'dispute_submitted':
                return this._itemDisputeSubmittedAt(item, sortContext);
            case 'dispute_resolved':
                return this._itemDisputeResolvedAt(item, sortContext);
            case 'task_submitted':
            default:
                return this._itemTaskSubmittedAt(item);
        }
    },

    _sortWorkerOutputItems(items, sortMetric, sortOrder, sortContext) {
        const metric = String(sortMetric || 'task_submitted');
        const order = sortOrder === 'asc' ? 'asc' : 'desc';
        const sorted = [...items];
        sorted.sort((a, b) => {
            const ta = this._itemSortTimestamp(a, metric, sortContext);
            const tb = this._itemSortTimestamp(b, metric, sortContext);
            const aEmpty = !ta;
            const bEmpty = !tb;
            if (aEmpty && bEmpty) return String(a.id).localeCompare(String(b.id));
            if (aEmpty) return 1;
            if (bEmpty) return -1;
            const cmp = ta < tb ? -1 : ta > tb ? 1 : 0;
            if (cmp !== 0) return order === 'asc' ? cmp : -cmp;
            return String(a.id).localeCompare(String(b.id));
        });
        return sorted;
    },

    _buildFilterListOptions(items, catalog, teamCatalog, filterCtx) {
        const sessionQaUi = (filterCtx && filterCtx.sessionQaUi) || {};
        const teamIds = new Set();
        const projectIds = new Set();
        const envKeys = new Set();
        const statuses = new Set();
        const contributors = new Map();
        const promptRatings = new Set();
        const taskIssues = new Set();
        const returnTypes = new Set();
        const promptHistoryPresent = new Set();
        const sessionQaOutcomesPresent = new Set();
        const disputeOutcomesPresent = new Set();
        const srReviewOutcomesPresent = new Set();
        for (const item of items) {
            const task = item.task;
            for (const flag of this._itemPromptHistory(item, sessionQaUi)) promptHistoryPresent.add(flag);
            for (const flag of this._itemSessionQaOutcomes(item, sessionQaUi)) sessionQaOutcomesPresent.add(flag);
            for (const flag of this._itemDisputeOutcomes(item)) disputeOutcomesPresent.add(flag);
            for (const flag of this._itemSrReviewOutcomes(item)) srReviewOutcomesPresent.add(flag);
            if (task.teamId) teamIds.add(task.teamId);
            if (task.projectId) projectIds.add(task.projectId);
            if (task.envKey) envKeys.add(task.envKey);
            if (task.status) statuses.add(task.status);
            if (task.author && task.author.id) {
                contributors.set(task.author.id, {
                    name: String(task.author.name ?? '').trim(),
                    email: String(task.author.email ?? '').trim()
                });
            }
            for (const entry of task.allFeedback || []) {
                if (entry.reviewer && entry.reviewer.id) {
                    contributors.set(entry.reviewer.id, {
                        name: String(entry.reviewer.name ?? '').trim(),
                        email: String(entry.reviewer.email ?? '').trim()
                    });
                }
                if (entry.display && (entry.display.isSystemFeedback || entry.display.isVerifierFailure)) continue;
                if (entry.display && entry.display.qualityRating) {
                    promptRatings.add(entry.display.qualityRating);
                }
                const returnType = this._returnTypeOf(entry);
                if (returnType) returnTypes.add(returnType);
                if (!entry.isPositive) {
                    const display = entry.display;
                    if (display) {
                        for (const label of display.rejectionBadges || []) taskIssues.add(label);
                    }
                }
            }
        }
        const projects = (catalog && catalog.projects) || [];
        const environments = (catalog && catalog.environments) || [];
        const catalogTeamIds = new Set((teamCatalog || []).map((pair) => pair && pair[0]).filter(Boolean));
        return {
            teams: [...teamIds]
                .filter((id) => catalogTeamIds.size === 0 || catalogTeamIds.has(id))
                .map((id) => ({
                id,
                label: dashLibTeamNameFromCatalog(id, teamCatalog) || id.slice(0, 8)
            })).sort((a, b) => a.label.localeCompare(b.label)),
            projects: [...projectIds].map((id) => ({
                id,
                label: dashLibProjectDisplayLabel(id, projects)
            })).sort((a, b) => a.label.localeCompare(b.label)),
            envs: [...envKeys].map((key) => {
                const env = environments.find((e) => e.env_key === key);
                return { id: key, label: (env && env.name) || key };
            }).sort((a, b) => a.label.localeCompare(b.label)),
            statuses: [...statuses].map((id) => ({ id, label: id }))
                .sort((a, b) => a.label.localeCompare(b.label)),
            contributors: [...contributors.entries()].map(([id, person]) => ({
                id,
                label: dashLibPersonLabel(person.name, person.email),
                name: person.name || person.email || 'Unknown',
                email: (person.name && person.email) ? person.email : ''
            })).sort((a, b) => a.label.localeCompare(b.label)),
            promptRatings: DASH_LIB_PROMPT_RATING_ORDER
                .filter((rating) => promptRatings.has(rating))
                .map((rating) => ({ id: rating, label: rating })),
            taskIssues: [...taskIssues].map((id) => ({ id, label: id }))
                .sort((a, b) => a.label.localeCompare(b.label)),
            returnTypes: DASH_LIB_RETURN_TYPE_ORDER
                .filter((type) => returnTypes.has(type))
                .map((type) => ({ id: type, label: DASH_LIB_RETURN_TYPE_LABELS[type] })),
            promptHistory: DASH_LIB_PROMPT_HISTORY_ORDER
                .filter((flag) => promptHistoryPresent.has(flag))
                .map((flag) => ({ id: flag, label: DASH_LIB_PROMPT_HISTORY_LABELS[flag] })),
            sessionQaOutcomes: DASH_LIB_SESSION_QA_OUTCOME_ORDER
                .filter((id) => sessionQaOutcomesPresent.has(id))
                .map((id) => ({ id, label: DASH_LIB_SESSION_QA_OUTCOME_LABELS[id] })),
            disputeOutcomes: DASH_LIB_DISPUTE_OUTCOME_ORDER
                .filter((id) => disputeOutcomesPresent.has(id))
                .map((id) => ({ id, label: DASH_LIB_DISPUTE_OUTCOME_LABELS[id] })),
            srReviewOutcomes: DASH_LIB_SR_REVIEW_OUTCOME_ORDER
                .filter((id) => srReviewOutcomesPresent.has(id))
                .map((id) => ({ id, label: DASH_LIB_SR_REVIEW_OUTCOME_LABELS[id] }))
        };
    },

    _applyFiltersAndSort(cachedItems, filters, listBounds, sortContext) {
        const filtered = this._applyClientWorkerOutputFilters(cachedItems, filters, listBounds, sortContext);
        const sortMetric = (filters && filters.sortMetric) || 'task_submitted';
        const sortOrder = (filters && filters.sortOrder) === 'asc' ? 'asc' : 'desc';
        return this._sortWorkerOutputItems(filtered, sortMetric, sortOrder, sortContext || null);
    },

    get _checkboxFilterDimensions() {
        const self = this;
        return [
            { draftKey: 'teamIds', optionsKey: 'teams', getValues: (task) => (task.teamId ? [task.teamId] : []) },
            { draftKey: 'projectIds', optionsKey: 'projects', getValues: (task) => (task.projectId ? [task.projectId] : []) },
            { draftKey: 'envKeys', optionsKey: 'envs', getValues: (task) => (task.envKey ? [task.envKey] : []) },
            { draftKey: 'statuses', optionsKey: 'statuses', getValues: (task) => (task.status ? [task.status] : []) },
            { draftKey: 'contributorIds', optionsKey: 'contributors', getValues: (t) => self._taskContributorIds(t) },
            { draftKey: 'promptRatings', optionsKey: 'promptRatings', getValues: (t) => self._taskPromptRatings(t) },
            { draftKey: 'taskIssues', optionsKey: 'taskIssues', getValues: (t) => self._taskIssueLabels(t) },
            { draftKey: 'returnTypes', optionsKey: 'returnTypes', getValues: (t) => self._taskReturnTypes(t) }
        ];
    },

    _emptyFilterIrrelevance() {
        const result = Object.fromEntries(
            this._checkboxFilterDimensions.map((d) => [d.draftKey, new Set()])
        );
        result.promptHistory = new Set();
        result.sessionQaOutcomes = new Set();
        result.disputeOutcomes = new Set();
        result.srReviewOutcomes = new Set();
        result.qaHelpfulness = new Set();
        result.v1CreationTimeMinutes = new Set();
        result.qaTimeMinutes = new Set();
        result.disputeResolutionTimeMinutes = new Set();
        return result;
    },

    _itemFilterPassCtx(options) {
        return {
            helpfulnessUi: (options && options.helpfulnessUi) || {},
            currentUserId: (options && options.currentUserId) || '',
            sessionQaUi: (options && options.sessionQaUi) || {}
        };
    },

    _itemPassesFilterDraft(item, draft, listBounds, ctx, exclude) {
        const task = item && item.task;
        if (!task) return false;
        const ex = exclude || {};
        const helpfulnessUi = (ctx && ctx.helpfulnessUi) || {};
        const currentUserId = (ctx && ctx.currentUserId) || '';
        const sessionQaUi = (ctx && ctx.sessionQaUi) || {};
        const itemKey = ex.itemKey || null;
        const forceId = ex.forceIncludeId;

        if (!this._taskPassesFilterDimensions(
            task, draft, listBounds, ex.taskKey != null ? ex.taskKey : null
        )) {
            return false;
        }
        if (!this._itemPassesPromptHistoryFilter(
            item, draft, listBounds, itemKey === 'promptHistory' ? forceId : undefined, sessionQaUi
        )) {
            return false;
        }
        if (!this._itemPassesSessionQaOutcomeFilter(
            item, draft, listBounds, sessionQaUi,
            itemKey === 'sessionQaOutcomes' ? forceId : undefined
        )) {
            return false;
        }
        if (!this._itemPassesDisputeOutcomeFilter(
            item, draft, listBounds, itemKey === 'disputeOutcomes' ? forceId : undefined
        )) {
            return false;
        }
        if (!this._itemPassesSrReviewOutcomeFilter(
            item, draft, listBounds, itemKey === 'srReviewOutcomes' ? forceId : undefined
        )) {
            return false;
        }
        if (!this._itemPassesQaHelpfulnessFilter(
            item, draft, listBounds, helpfulnessUi,
            itemKey === 'qaHelpfulness' ? forceId : undefined,
            currentUserId
        )) {
            return false;
        }
        if (!this._itemPassesV1CreationTimeFilter(
            item, draft, listBounds, itemKey === 'v1CreationTimeMinutes' ? forceId : undefined
        )) {
            return false;
        }
        if (!this._itemPassesQaTimeFilter(
            item, draft, listBounds, itemKey === 'qaTimeMinutes' ? forceId : undefined
        )) {
            return false;
        }
        if (!this._itemPassesDisputeResolutionTimeFilter(
            item, draft, listBounds, itemKey === 'disputeResolutionTimeMinutes' ? forceId : undefined
        )) {
            return false;
        }
        return true;
    },

    _computeFilterIrrelevance(items, draft, listBounds, options) {
        const result = this._emptyFilterIrrelevance();
        const ctx = this._itemFilterPassCtx(options);
        for (const dim of this._checkboxFilterDimensions) {
            const optionList = (options && options[dim.optionsKey]) || [];
            const irrelevant = result[dim.draftKey];
            for (const { id } of optionList) {
                const hasMatch = items.some((item) => (
                    dim.getValues(item.task).includes(id)
                    && this._itemPassesFilterDraft(item, draft, listBounds, ctx, { taskKey: dim.draftKey })
                ));
                if (!hasMatch) irrelevant.add(id);
            }
        }
        const historyOptions = (options && options.promptHistory) || [];
        const irrelevantHistory = result.promptHistory;
        for (const { id } of historyOptions) {
            const hasMatch = items.some((item) => (
                this._itemPromptHistory(item, ctx.sessionQaUi).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'promptHistory', forceIncludeId: id
                })
            ));
            if (!hasMatch) irrelevantHistory.add(id);
        }
        const sessionQaOutcomeOptions = (options && options.sessionQaOutcomes) || [];
        const irrelevantSessionQaOutcomes = result.sessionQaOutcomes;
        for (const { id } of sessionQaOutcomeOptions) {
            const hasMatch = items.some((item) => (
                this._itemSessionQaOutcomes(item, ctx.sessionQaUi).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'sessionQaOutcomes', forceIncludeId: id
                })
            ));
            if (!hasMatch) irrelevantSessionQaOutcomes.add(id);
        }
        const disputeOutcomeOptions = (options && options.disputeOutcomes) || [];
        const irrelevantDisputeOutcomes = result.disputeOutcomes;
        for (const { id } of disputeOutcomeOptions) {
            const hasMatch = items.some((item) => (
                this._itemDisputeOutcomes(item).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'disputeOutcomes', forceIncludeId: id
                })
            ));
            if (!hasMatch) irrelevantDisputeOutcomes.add(id);
        }
        const srReviewOutcomeOptions = (options && options.srReviewOutcomes) || [];
        const irrelevantSrReviewOutcomes = result.srReviewOutcomes;
        for (const { id } of srReviewOutcomeOptions) {
            const hasMatch = items.some((item) => (
                this._itemSrReviewOutcomes(item).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'srReviewOutcomes', forceIncludeId: id
                })
            ));
            if (!hasMatch) irrelevantSrReviewOutcomes.add(id);
        }
        const helpfulnessOptions = (options && options.qaHelpfulness) || [];
        const irrelevantHelpfulness = result.qaHelpfulness;
        for (const { id } of helpfulnessOptions) {
            const hasMatch = items.some((item) => (
                this._itemQaHelpfulness(item, ctx.helpfulnessUi, ctx.currentUserId).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'qaHelpfulness', forceIncludeId: id
                })
            ));
            if (!hasMatch) irrelevantHelpfulness.add(id);
        }
        const v1CreationTimeOptions = (options && options.v1CreationTimeMinutes) || [];
        const irrelevantV1CreationTime = result.v1CreationTimeMinutes;
        for (const { id } of v1CreationTimeOptions) {
            const hasMatch = items.some((item) => (
                this._itemV1CreationTimeBuckets(item).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'v1CreationTimeMinutes', forceIncludeId: id
                })
            ));
            if (!hasMatch) irrelevantV1CreationTime.add(id);
        }
        const qaTimeOptions = (options && options.qaTimeMinutes) || [];
        const irrelevantQaTime = result.qaTimeMinutes;
        for (const { id } of qaTimeOptions) {
            const hasMatch = items.some((item) => (
                this._itemQaTimeMinutesBuckets(item).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'qaTimeMinutes', forceIncludeId: id
                })
            ));
            if (!hasMatch) irrelevantQaTime.add(id);
        }
        const disputeResolutionTimeOptions = (options && options.disputeResolutionTimeMinutes) || [];
        const irrelevantDisputeResolutionTime = result.disputeResolutionTimeMinutes;
        for (const { id } of disputeResolutionTimeOptions) {
            const hasMatch = items.some((item) => (
                this._itemDisputeResolutionTimeMinutesBuckets(item).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'disputeResolutionTimeMinutes', forceIncludeId: id
                })
            ));
            if (!hasMatch) irrelevantDisputeResolutionTime.add(id);
        }
        return result;
    },

    _emptyFilterOptionCounts() {
        const result = Object.fromEntries(
            this._checkboxFilterDimensions.map((d) => [d.draftKey, new Map()])
        );
        result.promptHistory = new Map();
        result.sessionQaOutcomes = new Map();
        result.disputeOutcomes = new Map();
        result.srReviewOutcomes = new Map();
        result.qaHelpfulness = new Map();
        result.v1CreationTimeMinutes = new Map();
        result.qaTimeMinutes = new Map();
        result.disputeResolutionTimeMinutes = new Map();
        return result;
    },

    _computeFilterOptionCounts(items, draft, listBounds, options) {
        const result = this._emptyFilterOptionCounts();
        const ctx = this._itemFilterPassCtx(options);
        for (const dim of this._checkboxFilterDimensions) {
            const optionList = (options && options[dim.optionsKey]) || [];
            const counts = result[dim.draftKey];
            for (const { id } of optionList) {
                const count = items.filter((item) => (
                    dim.getValues(item.task).includes(id)
                    && this._itemPassesFilterDraft(item, draft, listBounds, ctx, { taskKey: dim.draftKey })
                )).length;
                counts.set(id, count);
            }
        }
        const historyOptions = (options && options.promptHistory) || [];
        const historyCounts = result.promptHistory;
        for (const { id } of historyOptions) {
            const count = items.filter((item) => (
                this._itemPromptHistory(item, ctx.sessionQaUi).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'promptHistory', forceIncludeId: id
                })
            )).length;
            historyCounts.set(id, count);
        }
        const sessionQaOutcomeOptions = (options && options.sessionQaOutcomes) || [];
        const sessionQaOutcomeCounts = result.sessionQaOutcomes;
        for (const { id } of sessionQaOutcomeOptions) {
            const count = items.filter((item) => (
                this._itemSessionQaOutcomes(item, ctx.sessionQaUi).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'sessionQaOutcomes', forceIncludeId: id
                })
            )).length;
            sessionQaOutcomeCounts.set(id, count);
        }
        const disputeOutcomeOptions = (options && options.disputeOutcomes) || [];
        const disputeOutcomeCounts = result.disputeOutcomes;
        for (const { id } of disputeOutcomeOptions) {
            const count = items.filter((item) => (
                this._itemDisputeOutcomes(item).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'disputeOutcomes', forceIncludeId: id
                })
            )).length;
            disputeOutcomeCounts.set(id, count);
        }
        const srReviewOutcomeOptions = (options && options.srReviewOutcomes) || [];
        const srReviewOutcomeCounts = result.srReviewOutcomes;
        for (const { id } of srReviewOutcomeOptions) {
            const count = items.filter((item) => (
                this._itemSrReviewOutcomes(item).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'srReviewOutcomes', forceIncludeId: id
                })
            )).length;
            srReviewOutcomeCounts.set(id, count);
        }
        const helpfulnessOptions = (options && options.qaHelpfulness) || [];
        const helpfulnessCounts = result.qaHelpfulness;
        for (const { id } of helpfulnessOptions) {
            const count = items.filter((item) => (
                this._itemQaHelpfulness(item, ctx.helpfulnessUi, ctx.currentUserId).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'qaHelpfulness', forceIncludeId: id
                })
            )).length;
            helpfulnessCounts.set(id, count);
        }
        const v1CreationTimeOptions = (options && options.v1CreationTimeMinutes) || [];
        const v1CreationTimeCounts = result.v1CreationTimeMinutes;
        for (const { id } of v1CreationTimeOptions) {
            const count = items.filter((item) => (
                this._itemV1CreationTimeBuckets(item).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'v1CreationTimeMinutes', forceIncludeId: id
                })
            )).length;
            v1CreationTimeCounts.set(id, count);
        }
        const qaTimeOptions = (options && options.qaTimeMinutes) || [];
        const qaTimeCounts = result.qaTimeMinutes;
        for (const { id } of qaTimeOptions) {
            const count = items.filter((item) => (
                this._itemQaTimeMinutesBuckets(item).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'qaTimeMinutes', forceIncludeId: id
                })
            )).length;
            qaTimeCounts.set(id, count);
        }
        const disputeResolutionTimeOptions = (options && options.disputeResolutionTimeMinutes) || [];
        const disputeResolutionTimeCounts = result.disputeResolutionTimeMinutes;
        for (const { id } of disputeResolutionTimeOptions) {
            const count = items.filter((item) => (
                this._itemDisputeResolutionTimeMinutesBuckets(item).includes(id)
                && this._itemPassesFilterDraft(item, draft, listBounds, ctx, {
                    itemKey: 'disputeResolutionTimeMinutes', forceIncludeId: id
                })
            )).length;
            disputeResolutionTimeCounts.set(id, count);
        }
        return result;
    },

    _computeFilterScopedTotal(items, draft, listBounds, sortContext) {
        const scoped = this._applyClientWorkerOutputFilters(items, Object.assign({}, draft || {}, {
            promptText: '',
            fuzzy: false,
            regex: false,
            caseSensitive: false
        }), listBounds, sortContext);
        return scoped.length;
    },

    _computeFilterScopedTotalForOrder(items, draft, listBounds, ctx, ancestorDraftKeys) {
        const partialDraft = {};
        for (const key of ancestorDraftKeys || []) {
            partialDraft[key] = (draft && draft[key]) || [];
        }
        return this._computeFilterScopedTotal(items, partialDraft, listBounds, ctx);
    },

    _flagReasonLabel(reason) {
        const key = String(reason || '').trim();
        if (!key) return '';
        return DASH_LIB_FLAG_REASON_LABELS[key] || key.replace(/_/g, ' ');
    },

    _embeddedPersonFields(person) {
        if (!person || typeof person !== 'object') {
            return { id: '', name: '', email: '' };
        }
        return {
            id: String(person.id || ''),
            name: String(person.full_name || ''),
            email: String(person.email || '')
        };
    },

    _buildFlagDisplay(flagRow, profilesMap) {
        const resolution = flagRow && flagRow.resolution ? String(flagRow.resolution) : '';
        const status = resolution || 'pending';
        const flagger = this._embeddedPersonFields(flagRow && flagRow.flagger);
        const resolver = this._embeddedPersonFields(flagRow && flagRow.resolver);
        const flaggerId = flagger.id || String((flagRow && flagRow.flagger_id) || '');
        const resolverId = resolver.id || String((flagRow && flagRow.resolved_by) || '');
        const flaggerProfile = flaggerId && profilesMap ? profilesMap.get(flaggerId) : null;
        const resolverProfile = resolverId && profilesMap ? profilesMap.get(resolverId) : null;
        return {
            id: String((flagRow && flagRow.id) || ''),
            taskId: String((flagRow && flagRow.task_id) || ''),
            reason: this._flagReasonLabel(flagRow && flagRow.reason),
            reasonKey: String((flagRow && flagRow.reason) || ''),
            note: dashLibNormalizeNewlines((flagRow && flagRow.note) || ''),
            status,
            createdAt: String((flagRow && flagRow.created_at) || ''),
            resolutionAt: flagRow && flagRow.resolved_at ? String(flagRow.resolved_at) : null,
            resolutionNote: dashLibNormalizeNewlines((flagRow && flagRow.resolution_note) || ''),
            resolverId,
            resolverName: resolver.name || String((resolverProfile && resolverProfile.full_name) || ''),
            resolverEmail: resolver.email || String((resolverProfile && resolverProfile.email) || ''),
            flaggerId,
            flaggerName: flagger.name || String((flaggerProfile && flaggerProfile.full_name) || ''),
            flaggerEmail: flagger.email || String((flaggerProfile && flaggerProfile.email) || ''),
            isConfirmed: status === 'confirmed',
            isDismissed: status === 'dismissed',
            isPending: status === 'pending'
        };
    },

    _buildDisputeDisplay(disputeRow, profilesMap) {
        const data = dashLibParseFeedbackData(disputeRow && disputeRow.dispute_data);
        const status = String((disputeRow && disputeRow.dispute_status) || 'pending').toLowerCase();
        const category = data && data.category ? String(data.category) : '';
        const resolvedAt = disputeRow && disputeRow.resolved_at ? String(disputeRow.resolved_at) : null;
        const resolver = this._embeddedPersonFields(disputeRow && disputeRow.resolver);
        const resolverId = resolver.id || String((disputeRow && disputeRow.resolved_by) || '');
        const resolverProfile = resolverId && profilesMap ? profilesMap.get(resolverId) : null;
        const reviewDurationRaw = Number(data && data.dispute_review_duration_seconds);
        const reviewDurationSeconds = Number.isFinite(reviewDurationRaw) && reviewDurationRaw >= 0
            ? reviewDurationRaw
            : null;
        const display = {
            id: String((disputeRow && disputeRow.id) || ''),
            submittedAt: String((disputeRow && disputeRow.created_at) || ''),
            reason: dashLibNormalizeNewlines((disputeRow && disputeRow.dispute_reason) || ''),
            category: category || null,
            status,
            feedbackId: disputeRow && disputeRow.feedback_id != null ? String(disputeRow.feedback_id) : '',
            resolutionAt: resolvedAt,
            resolutionText: resolvedAt
                ? dashLibNormalizeNewlines((disputeRow && disputeRow.resolution_reason) || '')
                : '',
            resolverId,
            resolverName: resolver.name || String((resolverProfile && resolverProfile.full_name) || ''),
            resolverEmail: resolver.email || String((resolverProfile && resolverProfile.email) || ''),
            isApproved: status === 'approved',
            isRejected: status === 'rejected',
            originalFeedbackCreatedAt: disputeRow && disputeRow.original_feedback_created_at
                ? String(disputeRow.original_feedback_created_at)
                : null
        };
        const screenshotKeys = dashLibNormalizeScreenshotKeys(
            data && data.screenshotKeys,
            data && data.resolutionScreenshotKeys
        );
        if (reviewDurationSeconds != null) display.reviewDurationSeconds = reviewDurationSeconds;
        if (screenshotKeys.length) display.screenshotKeys = screenshotKeys;
        return display;
    },

    _isVerifierFailedTaskEvent(event) {
        return String(event && event.event_type || '') === DASH_LIB_VERIFIER_FAILED_EVENT_TYPE;
    },

    _buildVerifierFailureDisplayFromEvent(event, versionInfo) {
        const payload = event && event.payload && typeof event.payload === 'object' ? event.payload : {};
        const textBlocks = [];
        const errorMessage = String(payload.error_message || '').trim();
        if (errorMessage) {
            textBlocks.push({ label: 'Error Message', text: dashLibNormalizeNewlines(errorMessage) });
        }
        if (payload.attempt_number != null && payload.attempt_number !== '') {
            textBlocks.push({ label: 'Attempt Number', text: String(payload.attempt_number) });
        }
        const runtimeVersion = String(payload.runtime_version || '').trim();
        if (runtimeVersion) {
            textBlocks.push({ label: 'Runtime Version', text: runtimeVersion });
        }
        return {
            isSystemFeedback: true,
            isVerifierFailure: true,
            isPositive: false,
            isEscalated: false,
            isFlaggedAsBugged: false,
            qualityRating: null,
            versionNo: versionInfo.displayVersionNo || versionInfo.versionNo,
            totalVersions: versionInfo.totalVersions,
            textBlocks,
            rejectionBadges: [],
            feedbackAt: String((event && event.occurred_at) || ''),
            qaReviewerId: '',
            qaReviewerName: '',
            qaReviewerEmail: ''
        };
    },

    _buildFeedbackEntryFromVerifierFailureEvent(event, rawVersions) {
        const versionInfo = this._resolveVersionAtFeedback(rawVersions, event.occurred_at);
        const display = this._buildVerifierFailureDisplayFromEvent(event, versionInfo);
        return {
            id: 'event-' + String(event.id),
            feedbackAt: String(event.occurred_at || ''),
            isPositive: false,
            isEscalated: false,
            isFlaggedAsBugged: false,
            isSystemFeedback: true,
            isVerifierFailure: true,
            reviewer: { id: '', name: 'System', email: '' },
            linkedVersionNo: versionInfo.rawVersionNo,
            linkedDisplayVersionNo: versionInfo.displayVersionNo,
            display
        };
    },

    _isBugReportTaskEvent(event) {
        if (String(event && event.event_type || '') !== DASH_LIB_QA_REVISION_REQUESTED_EVENT_TYPE) {
            return false;
        }
        const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
        return dashLibIsQaFlaggedAsBugged(payload.feedback_data, payload.feedback_content);
    },

    _reviewerFromTaskEventActor(actor) {
        if (!actor || typeof actor !== 'object') {
            return { id: '', name: '', email: '' };
        }
        return {
            id: String(actor.id || ''),
            name: String(actor.full_name || actor.name || ''),
            email: String(actor.email || '')
        };
    },

    _buildBugReportDisplayFromEvent(event, versionInfo) {
        const payload = event && event.payload && typeof event.payload === 'object' ? event.payload : {};
        const feedbackData = payload.feedback_data && typeof payload.feedback_data === 'object'
            ? payload.feedback_data
            : {};
        const pseudoRow = {
            created_at: event.occurred_at,
            is_positive_feedback: Boolean(payload.is_positive_feedback),
            is_system_feedback: false,
            feedback_content: payload.feedback_content,
            feedback_data: feedbackData
        };
        const reviewer = this._reviewerFromTaskEventActor(event.actor);
        return this._buildQaFeedbackDisplay(pseudoRow, versionInfo, reviewer);
    },

    _buildFeedbackEntryFromBugReportEvent(event, rawVersions) {
        const versionInfo = this._resolveVersionAtFeedback(rawVersions, event.occurred_at);
        const display = this._buildBugReportDisplayFromEvent(event, versionInfo);
        const reviewer = this._reviewerFromTaskEventActor(event.actor);
        return {
            id: 'event-bug-' + String(event.id),
            feedbackAt: String(event.occurred_at || ''),
            isPositive: false,
            isEscalated: display.isEscalated,
            isFlaggedAsBugged: display.isFlaggedAsBugged,
            isSystemFeedback: false,
            isVerifierFailure: false,
            reviewer,
            linkedVersionNo: versionInfo.rawVersionNo,
            linkedDisplayVersionNo: versionInfo.displayVersionNo,
            display
        };
    },

    _isDuplicateBugReportEvent(eventEntry, qaEntries) {
        const at = Date.parse(eventEntry.feedbackAt || '');
        if (!Number.isFinite(at)) return false;
        const bugReason = (eventEntry.display && eventEntry.display.rejectionBadges && eventEntry.display.rejectionBadges[0])
            ? String(eventEntry.display.rejectionBadges[0])
            : '';
        for (const qa of qaEntries || []) {
            if (!qa.isFlaggedAsBugged) continue;
            const qaAt = Date.parse(qa.feedbackAt || '');
            if (!Number.isFinite(qaAt) || Math.abs(qaAt - at) > DASH_LIB_BUG_REPORT_DEDUP_MS) continue;
            const qaReason = (qa.display && qa.display.rejectionBadges && qa.display.rejectionBadges[0])
                ? String(qa.display.rejectionBadges[0])
                : '';
            if (!bugReason || !qaReason || bugReason === qaReason) return true;
        }
        return false;
    },

    _mergeTaskEventsPreferRsc(jsonEvents, rscEvents) {
        const byId = new Map();
        for (const event of jsonEvents || []) {
            if (event && event.id != null) byId.set(event.id, event);
        }
        for (const event of rscEvents || []) {
            if (!event || event.id == null) continue;
            const prev = byId.get(event.id);
            if (prev) {
                byId.set(event.id, {
                    ...prev,
                    ...event,
                    payload: event.payload != null ? event.payload : prev.payload,
                    actor: event.actor != null ? event.actor : prev.actor
                });
            } else {
                byId.set(event.id, event);
            }
        }
        return [...byId.values()];
    },

    _feedbackEntriesFromTaskEvents(events, rawVersions, options) {
        const opts = options || {};
        const dedupeAgainst = Array.isArray(opts.dedupeAgainst) ? opts.dedupeAgainst : [];
        const entries = [];
        for (const event of events || []) {
            if (this._isVerifierFailedTaskEvent(event)) {
                entries.push(this._buildFeedbackEntryFromVerifierFailureEvent(event, rawVersions));
                continue;
            }
            if (!this._isBugReportTaskEvent(event)) continue;
            const entry = this._buildFeedbackEntryFromBugReportEvent(event, rawVersions);
            if (this._isDuplicateBugReportEvent(entry, dedupeAgainst)) continue;
            entries.push(entry);
        }
        return entries;
    },

    _dedupeSystemFeedbackEntries(entries) {
        const input = entries || [];
        const sortedOldest = [...input].sort((a, b) => {
            const aAt = String(a.feedbackAt || '');
            const bAt = String(b.feedbackAt || '');
            return aAt < bAt ? -1 : aAt > bAt ? 1 : 0;
        });
        const dropIds = new Set();
        const keptIdByVersion = new Map();
        const idRemap = {};
        for (const entry of sortedOldest) {
            const isSystem = Boolean(entry.isSystemFeedback || (entry.display && entry.display.isSystemFeedback));
            if (!isSystem || !entry.id) continue;
            const versionKey = String(entry.linkedDisplayVersionNo ?? '');
            if (keptIdByVersion.has(versionKey)) {
                dropIds.add(entry.id);
                idRemap[String(entry.id)] = keptIdByVersion.get(versionKey);
                continue;
            }
            keptIdByVersion.set(versionKey, String(entry.id));
        }
        return {
            entries: input.filter((e) => !dropIds.has(e.id)),
            idRemap
        };
    },

    _buildQaFeedbackDisplay(feedbackRow, versionInfo, qaReviewer) {
        if (feedbackRow.is_system_feedback) {
            const content = dashLibNormalizeNewlines(feedbackRow.feedback_content || '');
            const textBlocks = content
                ? [{ label: 'Feedback Content', text: content }]
                : [];
            return {
                isSystemFeedback: true,
                isPositive: false,
                isEscalated: false,
                isFlaggedAsBugged: false,
                qualityRating: null,
                versionNo: versionInfo.displayVersionNo || versionInfo.versionNo,
                totalVersions: versionInfo.totalVersions,
                textBlocks,
                rejectionBadges: [],
                feedbackAt: String(feedbackRow.created_at || ''),
                qaReviewerId: '',
                qaReviewerName: '',
                qaReviewerEmail: ''
            };
        }
        const data = dashLibParseFeedbackData(feedbackRow.feedback_data);
        const textBlocks = [];
        if (data.bug_reason) textBlocks.push({ label: 'Bug Reason', text: dashLibNormalizeNewlines(data.bug_reason) });
        if (data.bug_description) textBlocks.push({ label: 'Bug Description', text: dashLibNormalizeNewlines(data.bug_description) });
        if (data.attempted_actions) textBlocks.push({ label: 'Attempted Actions', text: dashLibNormalizeNewlines(data.attempted_actions) });
        if (data.task_feedback) textBlocks.push({ label: 'Task Feedback', text: dashLibNormalizeNewlines(data.task_feedback) });
        if (data.general_feedback) textBlocks.push({ label: 'General Feedback', text: dashLibNormalizeNewlines(data.general_feedback) });
        if (data.environment_feedback) textBlocks.push({ label: 'Environment Feedback', text: dashLibNormalizeNewlines(data.environment_feedback) });
        if (data.grading_feedback) textBlocks.push({ label: 'Grading Feedback', text: dashLibNormalizeNewlines(data.grading_feedback) });
        const labels = Array.isArray(data.rejection_reason_labels)
            ? data.rejection_reason_labels.map(String)
            : (data.rejection_reason_label ? [String(data.rejection_reason_label)] : []);
        if (data.bug_reason) labels.unshift(String(data.bug_reason));
        const isPositive = Boolean(feedbackRow.is_positive_feedback);
        const isEscalated = !isPositive && dashLibIsQaEscalatedForFleetReview(data);
        const isFlaggedAsBugged = !isPositive && !isEscalated
            && dashLibIsQaFlaggedAsBugged(data, feedbackRow.feedback_content);
        const reviewDurationRaw = Number(data.qa_review_duration_seconds);
        const reviewDurationSeconds = Number.isFinite(reviewDurationRaw) && reviewDurationRaw >= 0
            ? reviewDurationRaw
            : null;
        const rawQualityRating = data.prompt_quality_rating;
        const display = {
            isSystemFeedback: false,
            isPositive,
            isEscalated,
            isFlaggedAsBugged,
            qualityRating: dashLibMapPromptQualityRating(rawQualityRating),
            qualityRatingRaw: (rawQualityRating != null && rawQualityRating !== '')
                ? dashLibMapPromptQualityRating(rawQualityRating)
                : null,
            versionNo: versionInfo.displayVersionNo || versionInfo.versionNo,
            totalVersions: versionInfo.totalVersions,
            textBlocks,
            rejectionBadges: labels.filter(Boolean),
            feedbackAt: String(feedbackRow.created_at || ''),
            qaReviewerId: String((qaReviewer && qaReviewer.id) || feedbackRow.created_by || ''),
            qaReviewerName: String((qaReviewer && qaReviewer.name) || ''),
            qaReviewerEmail: String((qaReviewer && qaReviewer.email) || '')
        };
        const screenshotKeys = dashLibNormalizeScreenshotKeys(data.screenshots);
        if (reviewDurationSeconds != null) display.reviewDurationSeconds = reviewDurationSeconds;
        if (screenshotKeys.length) display.screenshotKeys = screenshotKeys;
        return display;
    },

    _dateInputValue(date) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    },

    _dateLocalToIso(dateLocal, bound) {
        const date = dashLibParseDateInput(dateLocal);
        if (!date) return '';
        if (bound === 'before') date.setHours(23, 59, 59, 999);
        else date.setHours(0, 0, 0, 0);
        return date.toISOString();
    },

    _validateCreatedAtRange(afterLocal, beforeLocal) {
        const afterIso = afterLocal ? this._dateLocalToIso(afterLocal, 'after') : '';
        const beforeIso = beforeLocal ? this._dateLocalToIso(beforeLocal, 'before') : '';
        if (afterLocal && !afterIso) {
            return { valid: false, error: 'After is not a valid date.', afterIso: '', beforeIso };
        }
        if (beforeLocal && !beforeIso) {
            return { valid: false, error: 'Before is not a valid date.', afterIso, beforeIso: '' };
        }
        if (afterIso && beforeIso && afterIso > beforeIso) {
            return { valid: false, error: 'After must be on or before Before.', afterIso, beforeIso };
        }
        return { valid: true, error: '', afterIso, beforeIso };
    },

    _quickDatePresetRange(preset) {
        const today = dashLibStartOfLocalDay(new Date());
        const y = today.getFullYear();
        const m = today.getMonth();
        switch (preset) {
            case 'today':
                return { after: today, before: today, label: 'Today' };
            case 'yesterday': {
                const day = new Date(today);
                day.setDate(day.getDate() - 1);
                return { after: day, before: day, label: 'Yesterday' };
            }
            case '3d': {
                const after = new Date(today);
                after.setDate(after.getDate() - 3);
                return { after, before: today, label: 'Last 3 Days' };
            }
            case '7d': {
                const after = new Date(today);
                after.setDate(after.getDate() - 7);
                return { after, before: today, label: 'Last 7 Days' };
            }
            case '30d': {
                const after = new Date(today);
                after.setDate(after.getDate() - 30);
                return { after, before: today, label: 'Last 30 Days' };
            }
            case 'last-week': {
                const thisWeekStart = new Date(today);
                thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay());
                const lastWeekEnd = new Date(thisWeekStart);
                lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
                const lastWeekStart = new Date(lastWeekEnd);
                lastWeekStart.setDate(lastWeekStart.getDate() - 6);
                return { after: lastWeekStart, before: lastWeekEnd, label: 'Last Calendar Week' };
            }
            case 'this-month':
                return { after: new Date(y, m, 1), before: today, label: 'This Month' };
            case 'last-month': {
                const after = new Date(y, m - 1, 1);
                const before = new Date(y, m, 0);
                return { after, before, label: 'Last Calendar Month' };
            }
            case 'this-year':
                return { after: new Date(y, 0, 1), before: today, label: 'This Year' };
            case 'last-year':
                return { after: new Date(y - 1, 0, 1), before: new Date(y - 1, 11, 31), label: 'Last Calendar Year' };
            case 'all-time':
                return { after: null, before: null, label: 'All Time', clear: true };
            default:
                return null;
        }
    },

    _isUniversalSearchParams(params) {
        const p = params || {};
        return (p.authorCount || 0) === 0
            && (p.searchTeamIds || []).length === 0
            && (p.searchProjectIds || []).length === 0
            && (p.searchEnvKeys || []).length === 0;
    },

    _validateUniversalSearchRange(_afterLocal, _beforeLocal) {
        return { allowed: true, message: '' };
    },

    _qaTextBlockLabel(label, isPositive) {
        if (!isPositive) return label;
        if (label === 'Task Feedback') return 'Approval Feedback';
        if (label === 'Attempted Actions') return 'Accepted Feedback';
        return label;
    },

    /**
     * Format verifier stdout for display: SUCCESS/FAILURE_ACCUMULATOR [C] lines and
     * Epic score lines get ✅ / ❌ prefixes. Returns plain text (caller escapes HTML).
     */
    _formatVerifierStdout(raw) {
        return dashLibFormatVerifierStdout(raw);
    }
};
