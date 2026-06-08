// dashboard-lib.js — pure dashboard helpers (no PostgREST).
// Loaded before dashboard.js; registers Context.dashboardLib.

/** Max UUIDs/keys per PostgREST `in.(…)` (and per chunked request param). */
const DASH_PG_IN_MAX = 25;

const DASH_LIB_MIN_SUBSTRING_LENGTH = 3;
const DASH_LIB_MS_PER_DAY = 86400000;
const DASH_LIB_UNIVERSAL_SEARCH_MAX_DAYS = 7;
const DASH_LIB_UNIVERSAL_SEARCH_RANGE_MESSAGE =
    'Blank searches must be constrained to a max 7 day period to prevent overload';

const DASH_LIB_RETURN_TYPE_LABELS = {
    accepted: 'Accepted',
    returned: 'Returned',
    escalated: 'Escalated',
    bugged: 'Flagged as Bugged'
};
const DASH_LIB_RETURN_TYPE_ORDER = ['accepted', 'returned', 'escalated', 'bugged'];
const DASH_LIB_PROMPT_RATING_ORDER = ['Top 10%', 'Average', 'Bottom 10%'];
const DASH_LIB_OUTPUT_KIND_ORDER = ['task_creation', 'qa', 'dispute'];
const DASH_LIB_OUTPUT_KIND_LABELS = {
    task_creation: 'Task Creation',
    qa: 'QA',
    dispute: 'Disputes'
};
const DASH_LIB_PROMPT_HISTORY_ORDER = ['accepted', 'returned', 'disputed', 'flagged', 'escalated'];
const DASH_LIB_PROMPT_HISTORY_LABELS = {
    accepted: 'Accepted',
    returned: 'Returned',
    disputed: 'Disputed',
    flagged: 'Flagged',
    escalated: 'Escalated'
};

const DASH_LIB_VERIFIER_FAILED_EVENT_TYPE = 'instance.verifier_failed';
const DASH_LIB_VERIFIER_FAILURE_BADGE = 'Verifier Generation Error';
const DASH_LIB_QA_REVISION_REQUESTED_EVENT_TYPE = 'qa.revision_requested';
const DASH_LIB_RSC_REF_RE = /^\$(\d+)$/;
const DASH_LIB_BUG_REPORT_DEDUP_MS = 2000;

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

function dashLibPersonLabel(name, email) {
    const trimmedName = String(name ?? '').trim();
    const trimmedEmail = String(email ?? '').trim();
    if (trimmedName && trimmedEmail) return `${trimmedName} (${trimmedEmail})`;
    return trimmedName || trimmedEmail || 'Unknown';
}

function dashLibPassesDimension(values, selected, optionCount) {
    if (optionCount === 0) return true;
    if (selected.length === 0) return false;
    if (selected.length >= optionCount) return true;
    const set = new Set(selected);
    return values.some((value) => set.has(value));
}

const plugin = {
    id: 'dashboard-lib',
    name: 'Dashboard Lib',
    description: 'Pure helpers for the Worker Output Search dashboard (filters, versions, highlighting)',
    _version: '2.2',
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

            MIN_SUBSTRING_LENGTH: DASH_LIB_MIN_SUBSTRING_LENGTH,
            UNIVERSAL_SEARCH_MAX_DAYS: DASH_LIB_UNIVERSAL_SEARCH_MAX_DAYS,
            UNIVERSAL_SEARCH_RANGE_MESSAGE: DASH_LIB_UNIVERSAL_SEARCH_RANGE_MESSAGE,
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

            buildQaFeedbackDisplay: bind(self._buildQaFeedbackDisplay),
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

            dateLocalToIso: bind(self._dateLocalToIso),
            validateCreatedAtRange: bind(self._validateCreatedAtRange),
            quickDatePresetRange: bind(self._quickDatePresetRange),
            dateInputValue: bind(self._dateInputValue),
            isUniversalSearchParams: bind(self._isUniversalSearchParams),
            validateUniversalSearchRange: bind(self._validateUniversalSearchRange),

            qaTextBlockLabel: bind(self._qaTextBlockLabel)
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
            if (prompt !== prevPrompt) {
                displayNo += 1;
                result.push({
                    id: String(v.id ?? ''),
                    versionNo: v.version_no,
                    displayVersionNo: displayNo,
                    prompt,
                    envKey: String(v.env_key ?? ''),
                    createdAt: String(v.created_at ?? '')
                });
                prevPrompt = prompt;
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
            .filter((e) => !(e.display && e.display.isSystemFeedback))
            .map((e) => e.display.qualityRating)
            .filter(Boolean))];
    },

    _taskIssueLabels(task) {
        const labels = new Set();
        for (const entry of task.allFeedback || []) {
            if (entry.isPositive) continue;
            for (const label of entry.display.rejectionBadges || []) labels.add(label);
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
        if (teamIds.length > 0) {
            const teamSet = new Set(teamIds);
            result = result.filter((task) => task.teamId && teamSet.has(task.teamId));
        } else if (allTeams.length > 0) result = [];

        const allProjects = bounds.projectIds || [];
        if (projectIds.length > 0) {
            const projectSet = new Set(projectIds);
            result = result.filter((task) => task.projectId && projectSet.has(task.projectId));
        } else if (allProjects.length > 0) result = [];

        const allEnvs = bounds.envKeys || [];
        if (envKeys.length > 0) {
            const envSet = new Set(envKeys);
            result = result.filter((task) => task.envKey && envSet.has(task.envKey));
        } else if (allEnvs.length > 0) result = [];

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
            if (entry.display && entry.display.isSystemFeedback) {
                for (const block of entry.display.textBlocks || []) {
                    if (block.text) texts.push(block.text);
                }
                continue;
            }
            for (const block of entry.display.textBlocks || []) texts.push(block.text);
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

    _itemPromptHistory(item) {
        const flags = new Set();
        for (const entry of item.task.allFeedback || []) {
            const rt = this._returnTypeOf(entry);
            if (rt === 'accepted') flags.add('accepted');
            else if (rt === 'returned') flags.add('returned');
            else if (rt === 'escalated') flags.add('escalated');
            else if (rt === 'bugged') flags.add('flagged');
        }
        if (item.disputes && item.disputes.length > 0) flags.add('disputed');
        return [...flags];
    },

    _itemPassesPromptHistoryFilter(item, draft, listBounds, forceIncludeId) {
        const selected = draft.promptHistory || [];
        const count = (listBounds.promptHistory || []).length;
        let effective = selected;
        if (forceIncludeId !== undefined) {
            effective = [...new Set([...selected, forceIncludeId])];
        }
        return dashLibPassesDimension(this._itemPromptHistory(item), effective, count);
    },

    _applyClientWorkerOutputFilters(items, filters, listBounds) {
        const lib = Context.dashboardLib;
        const f = filters || {};
        const bounds = listBounds || {};
        const promptText = f.promptText || '';
        const fuzzy = f.fuzzy || false;
        const caseSensitive = f.caseSensitive || false;
        const regex = Boolean(f.regex);
        const searchHiddenVersions = f.searchHiddenVersions || false;
        const tasks = items.map((item) => item.task);
        const filteredTasks = this._applyClientTaskFilters(tasks, f, bounds);
        const allowedIds = new Set(filteredTasks.map((t) => t.id));
        let passed = items.filter((item) => allowedIds.has(item.task.id));
        const promptHistoryCount = (bounds.promptHistory || []).length;
        if (promptHistoryCount > 0) {
            passed = passed.filter((item) => dashLibPassesDimension(
                this._itemPromptHistory(item), f.promptHistory || [], promptHistoryCount
            ));
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
                item, promptText, fuzzy, caseSensitive, searchHiddenVersions, regex
            );
            if (matched) {
                out.push(this._annotateItem(item, extraVersionNos, promptText, caseSensitive, fuzzy, regex));
            }
        }
        return out;
    },

    _sortWorkerOutputItems(items, sortOrder) {
        const sorted = [...items];
        sorted.sort((a, b) => {
            const cmp = a.sortAt < b.sortAt ? -1 : a.sortAt > b.sortAt ? 1 : 0;
            return sortOrder === 'asc' ? cmp : -cmp;
        });
        return sorted;
    },

    _buildFilterListOptions(items, catalog, teamCatalog) {
        const teamIds = new Set();
        const projectIds = new Set();
        const envKeys = new Set();
        const statuses = new Set();
        const contributors = new Map();
        const promptRatings = new Set();
        const taskIssues = new Set();
        const returnTypes = new Set();
        const promptHistoryPresent = new Set();
        for (const item of items) {
            const task = item.task;
            for (const flag of this._itemPromptHistory(item)) promptHistoryPresent.add(flag);
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
                    for (const label of entry.display.rejectionBadges || []) taskIssues.add(label);
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
                label: dashLibProjectNameFromCatalog(id, projects) || id.slice(0, 8)
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
                .map((flag) => ({ id: flag, label: DASH_LIB_PROMPT_HISTORY_LABELS[flag] }))
        };
    },

    _applyFiltersAndSort(cachedItems, filters, listBounds, sortOrder) {
        const filtered = this._applyClientWorkerOutputFilters(cachedItems, filters, listBounds);
        return this._sortWorkerOutputItems(filtered, sortOrder);
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
        return result;
    },

    _computeFilterIrrelevance(items, draft, listBounds, options) {
        const result = this._emptyFilterIrrelevance();
        for (const dim of this._checkboxFilterDimensions) {
            const optionList = (options && options[dim.optionsKey]) || [];
            const irrelevant = result[dim.draftKey];
            for (const { id } of optionList) {
                const hasMatch = items.some(({ task }) => (
                    dim.getValues(task).includes(id)
                    && this._taskPassesFilterDimensions(task, draft, listBounds, dim.draftKey)
                ));
                if (!hasMatch) irrelevant.add(id);
            }
        }
        const historyOptions = (options && options.promptHistory) || [];
        const irrelevantHistory = result.promptHistory;
        for (const { id } of historyOptions) {
            const hasMatch = items.some((item) => (
                this._itemPromptHistory(item).includes(id)
                && this._taskPassesFilterDimensions(item.task, draft, listBounds, null)
                && this._itemPassesPromptHistoryFilter(item, draft, listBounds, id)
            ));
            if (!hasMatch) irrelevantHistory.add(id);
        }
        return result;
    },

    _emptyFilterOptionCounts() {
        const result = Object.fromEntries(
            this._checkboxFilterDimensions.map((d) => [d.draftKey, new Map()])
        );
        result.promptHistory = new Map();
        return result;
    },

    _effectiveDraftForOptionCounts(draft, listBounds) {
        if (!draft) return draft;
        const bounds = listBounds || {};
        const effective = { ...draft };
        for (const dim of this._checkboxFilterDimensions) {
            const all = bounds[dim.draftKey] || [];
            const selected = effective[dim.draftKey] || [];
            if (all.length > 0 && selected.length === 0) {
                effective[dim.draftKey] = [...all];
            }
        }
        const allHistory = bounds.promptHistory || [];
        const selectedHistory = effective.promptHistory || [];
        if (allHistory.length > 0 && selectedHistory.length === 0) {
            effective.promptHistory = [...allHistory];
        }
        return effective;
    },

    _computeFilterOptionCounts(items, draft, listBounds, options) {
        const result = this._emptyFilterOptionCounts();
        const effectiveDraft = this._effectiveDraftForOptionCounts(draft, listBounds);
        for (const dim of this._checkboxFilterDimensions) {
            const optionList = (options && options[dim.optionsKey]) || [];
            const counts = result[dim.draftKey];
            for (const { id } of optionList) {
                const count = items.filter(({ task }) => (
                    dim.getValues(task).includes(id)
                    && this._taskPassesFilterDimensions(task, effectiveDraft, listBounds, dim.draftKey)
                )).length;
                counts.set(id, count);
            }
        }
        const historyOptions = (options && options.promptHistory) || [];
        const historyCounts = result.promptHistory;
        for (const { id } of historyOptions) {
            const count = items.filter((item) => (
                this._itemPromptHistory(item).includes(id)
                && this._taskPassesFilterDimensions(item.task, effectiveDraft, listBounds, null)
                && this._itemPassesPromptHistoryFilter(item, effectiveDraft, listBounds, id)
            )).length;
            historyCounts.set(id, count);
        }
        return result;
    },

    _buildDisputeDisplay(disputeRow, profilesMap) {
        const data = dashLibParseFeedbackData(disputeRow && disputeRow.dispute_data);
        const status = String((disputeRow && disputeRow.dispute_status) || 'pending').toLowerCase();
        const category = data && data.category ? String(data.category) : '';
        const resolvedAt = disputeRow && disputeRow.resolved_at ? String(disputeRow.resolved_at) : null;
        const resolverId = disputeRow && disputeRow.resolved_by ? String(disputeRow.resolved_by) : '';
        const resolverProfile = resolverId && profilesMap ? profilesMap.get(resolverId) : null;
        return {
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
            resolverName: String((resolverProfile && resolverProfile.full_name) || ''),
            resolverEmail: String((resolverProfile && resolverProfile.email) || ''),
            isApproved: status === 'approved',
            isRejected: status === 'rejected',
            originalFeedbackCreatedAt: disputeRow && disputeRow.original_feedback_created_at
                ? String(disputeRow.original_feedback_created_at)
                : null
        };
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
        return {
            isSystemFeedback: false,
            isPositive,
            isEscalated,
            isFlaggedAsBugged,
            qualityRating: dashLibMapPromptQualityRating(data.prompt_quality_rating),
            versionNo: versionInfo.displayVersionNo || versionInfo.versionNo,
            totalVersions: versionInfo.totalVersions,
            textBlocks,
            rejectionBadges: labels.filter(Boolean),
            feedbackAt: String(feedbackRow.created_at || ''),
            qaReviewerId: String((qaReviewer && qaReviewer.id) || feedbackRow.created_by || ''),
            qaReviewerName: String((qaReviewer && qaReviewer.name) || ''),
            qaReviewerEmail: String((qaReviewer && qaReviewer.email) || '')
        };
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

    _validateUniversalSearchRange(afterLocal, beforeLocal) {
        if (!afterLocal || !beforeLocal) {
            return { allowed: false, message: DASH_LIB_UNIVERSAL_SEARCH_RANGE_MESSAGE };
        }
        const after = dashLibParseDateInput(afterLocal);
        const before = dashLibParseDateInput(beforeLocal);
        if (!after || !before) {
            return { allowed: false, message: DASH_LIB_UNIVERSAL_SEARCH_RANGE_MESSAGE };
        }
        const spanDays = Math.round((dashLibStartOfLocalDay(before) - dashLibStartOfLocalDay(after)) / DASH_LIB_MS_PER_DAY);
        if (spanDays > DASH_LIB_UNIVERSAL_SEARCH_MAX_DAYS) {
            return { allowed: false, message: DASH_LIB_UNIVERSAL_SEARCH_RANGE_MESSAGE };
        }
        return { allowed: true, message: '' };
    },

    _qaTextBlockLabel(label, isPositive) {
        if (!isPositive) return label;
        if (label === 'Task Feedback') return 'Approval Feedback';
        if (label === 'Attempted Actions') return 'Accepted Feedback';
        return label;
    }
};
