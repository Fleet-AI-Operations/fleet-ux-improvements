// rating-engine.js — TWQS / QAQS computation for Worker Output Search Ratings tab.

const RE_VERSION = '1.2';
const RE_MS_PER_DAY = 86400000;
const RE_HALFLIFE_DAYS = 90;
const RE_TRAILING_WEEKS = 26;
const RE_TRAILING_WEEKS_MS = RE_TRAILING_WEEKS * 7 * RE_MS_PER_DAY;
const RE_CONFIDENCE_WINDOW_MS = 90 * RE_MS_PER_DAY;
const RE_DIAG_SAMPLE_ROWS = 5;

const RE_SEVERITY_SCORES = {
    accepted: 1.0,
    returned: 0.7,
    escalated: 0.3,
    bugged: 0.0
};

const RE_WRITER_FLAG_REASONS = new Set(['ai_generated', 'possible_duplicate']);
const RE_QA_FLAG_REASON = 'poor_feedback_from_previous_qa';
const RE_PRODUCTION_STATUS_MATCH = 'production';

const RE_TWQS_PILLARS = [
    { id: 'acceptanceSeverity', label: 'Acceptance / Outcome Severity', weight: 0.35 },
    { id: 'revisionEfficiency', label: 'Revision Efficiency', weight: 0.15 },
    { id: 'srReviewIntegrity', label: 'Sr-Review Integrity', weight: 0.20 },
    { id: 'disputeOutcomes', label: 'Dispute Outcomes', weight: 0.15 },
    { id: 'consistency', label: 'Consistency', weight: 0.15 }
];

const RE_QAQS_PILLARS = [
    { id: 'feedbackResolution', label: 'Feedback Resolution Efficiency', weight: 0.50 },
    { id: 'reviewCallAccuracy', label: 'Review-Call Accuracy (Dispute Defense)', weight: 0.20 },
    { id: 'srReviewIntegrity', label: 'Sr-Review Integrity', weight: 0.25 },
    { id: 'consistency', label: 'Consistency', weight: 0.05 }
];

const RE_BANDS = [
    { min: 88, label: 'Excellent' },
    { min: 72, label: 'Good' },
    { min: 55, label: 'Average' },
    { min: 38, label: 'Needs attention' },
    { min: 0, label: 'Concerning' }
];

function reLib() {
    return Context.dashboardLib || null;
}

function reFeedbackTimestamp(entry) {
    return String((entry && (entry.feedbackAt || entry.created_at)) || '').trim();
}

function reTaskTimestamp(task, item) {
    return String((task && (task.createdAt || task.created_at)) || (item && item.sortAt) || '').trim();
}

function reIdsEqual(a, b) {
    return String(a || '').trim() === String(b || '').trim();
}

function reIsProductionTask(task) {
    return String((task && task.status) || '').toLowerCase().includes(RE_PRODUCTION_STATUS_MATCH);
}

function reResolveFeedbackId(id, remap) {
    const key = String(id || '').trim();
    if (!key) return '';
    return String((remap && remap[key]) || key);
}

function reReturnTypeOf(entry) {
    const lib = reLib();
    if (lib && typeof lib.returnTypeOf === 'function') return lib.returnTypeOf(entry);
    if (entry.isVerifierFailure || (entry.display && entry.display.isVerifierFailure)) return null;
    if (entry.isSystemFeedback || (entry.display && entry.display.isSystemFeedback)) return null;
    if (entry.isPositive) return 'accepted';
    if (entry.isEscalated) return 'escalated';
    if (entry.isFlaggedAsBugged) return 'bugged';
    return 'returned';
}

function reIsHumanFeedback(entry) {
    if (!entry) return false;
    if (entry.isVerifierFailure || entry.isSystemFeedback) return false;
    if (entry.display && (entry.display.isVerifierFailure || entry.display.isSystemFeedback)) return false;
    return true;
}

function reIsoWeekKey(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utc - yearStart) / RE_MS_PER_DAY) + 1) / 7);
    return utc.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

function reShrunkRate(k, n, C) {
    const prior = 0.5;
    return (k + C * prior) / (n + C);
}

function reBandLabel(score) {
    const n = Number(score);
    if (!Number.isFinite(n)) return '—';
    for (const band of RE_BANDS) {
        if (n >= band.min) return band.label;
    }
    return RE_BANDS[RE_BANDS.length - 1].label;
}

function reConfidenceBadge(count90d) {
    const n = Number(count90d) || 0;
    if (n < 10) return { tier: 'provisional', label: 'Provisional' };
    if (n < 50) return { tier: 'standard', label: 'Standard' };
    return { tier: 'high', label: 'High confidence' };
}

function reCoefficientOfVariation(values) {
    if (!values.length) return 1;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean <= 0) return 1;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return Math.min(1, Math.sqrt(variance) / mean);
}

function reConsistencyFromWeekly(weeklyScores) {
    if (!weeklyScores || weeklyScores.length < 2) {
        return { defined: false, score: null, activeWeeks: weeklyScores ? weeklyScores.length : 0 };
    }
    const stability = 1 - reCoefficientOfVariation(weeklyScores);
    const floorScore = Math.min(...weeklyScores);
    return {
        defined: true,
        score: Math.max(0, Math.min(1, 0.6 * stability + 0.4 * floorScore)),
        activeWeeks: weeklyScores.length
    };
}

function reResolveWeightingMode(committed) {
    const after = String((committed && committed.afterLocal) || '').trim();
    const before = String((committed && committed.beforeLocal) || '').trim();
    return (!after && !before) ? 'A' : 'B';
}

function reResolveWindow(committed) {
    const lib = reLib();
    const afterLocal = String((committed && committed.afterLocal) || '').trim();
    const beforeLocal = String((committed && committed.beforeLocal) || '').trim();
    let afterIso = '';
    let beforeIso = '';
    if (lib && typeof lib.validateCreatedAtRange === 'function') {
        const check = lib.validateCreatedAtRange(afterLocal, beforeLocal);
        if (check && check.valid) {
            afterIso = check.afterIso || '';
            beforeIso = check.beforeIso || '';
        }
    }
    return { afterLocal, beforeLocal, afterIso, beforeIso };
}

function reEventWeight(isoTs, mode, nowMs, window) {
    const ts = Date.parse(isoTs);
    if (Number.isNaN(ts)) return 0;
    if (mode === 'B') {
        if (window.afterIso && isoTs < window.afterIso) return 0;
        if (window.beforeIso && isoTs > window.beforeIso) return 0;
        return 1;
    }
    const ageDays = Math.max(0, (nowMs - ts) / RE_MS_PER_DAY);
    return Math.exp(-ageDays / RE_HALFLIFE_DAYS);
}

function reInTrailingWeeks(isoTs, nowMs) {
    const ts = Date.parse(isoTs);
    if (Number.isNaN(ts)) return false;
    return (nowMs - ts) <= RE_TRAILING_WEEKS_MS;
}

function reWeightedMean(pairs) {
    let wSum = 0;
    let total = 0;
    for (const { value, weight } of pairs) {
        if (!weight || weight <= 0) continue;
        wSum += weight;
        total += value * weight;
    }
    if (wSum <= 0) return null;
    return total / wSum;
}

function reCombinePillars(pillarDefs) {
    const defined = pillarDefs.filter((p) => p.defined !== false && p.score != null && Number.isFinite(p.score));
    if (defined.length === 0) {
        return { score: null, band: '—', pillars: pillarDefs };
    }
    const baseSum = defined.reduce((s, p) => s + p.baseWeight, 0);
    let composite = 0;
    for (const p of pillarDefs) {
        if (p.defined === false || p.score == null || !Number.isFinite(p.score)) {
            p.effectiveWeight = 0;
            continue;
        }
        p.effectiveWeight = p.baseWeight / baseSum;
        composite += p.score * p.effectiveWeight;
    }
    const score = Math.round(composite * 1000) / 10;
    return { score, band: reBandLabel(score), pillars: pillarDefs };
}

function reHumanFeedbackChronological(task) {
    return (task.allFeedback || [])
        .filter(reIsHumanFeedback)
        .sort((a, b) => reFeedbackTimestamp(a).localeCompare(reFeedbackTimestamp(b)));
}

function reTaskSeverityScore(task) {
    const feedback = reHumanFeedbackChronological(task);
    if (!feedback.length) return 0.5;
    let worst = 1.0;
    for (const entry of feedback) {
        const rt = reReturnTypeOf(entry);
        if (!rt) continue;
        const s = RE_SEVERITY_SCORES[rt];
        if (s != null && s < worst) worst = s;
    }
    return worst;
}

function reFinalDisplayVersionNo(task) {
    const versions = (task && task.promptVersions) || [];
    if (!versions.length) return 1;
    if (versions[0].displayVersionNo != null) {
        return versions[versions.length - 1].displayVersionNo || 1;
    }
    const lib = reLib();
    if (lib && typeof lib.computeDisplayVersions === 'function') {
        const display = lib.computeDisplayVersions(versions);
        if (display.length) return display[display.length - 1].displayVersionNo || 1;
    }
    return Math.max(...versions.map((v) => Number(v.version_no || v.versionNo || 1)));
}

function reCollectQaqsFeedbackRows(workerId, hydratedItems) {
    const feedbackById = new Map();
    for (const item of hydratedItems) {
        const task = item.task;
        if (!task) continue;
        for (const entry of task.allFeedback || []) {
            if (!reIsHumanFeedback(entry)) continue;
            const reviewerId = entry.reviewer && entry.reviewer.id;
            if (!reIdsEqual(reviewerId, workerId)) continue;
            feedbackById.set(String(entry.id), { entry, task, item });
        }
    }
    return [...feedbackById.values()];
}

function reComputeReturnEpisode(entry, task, mode, window, nowMs) {
    const createdAt = reFeedbackTimestamp(entry);
    const w = reEventWeight(createdAt, mode, nowMs, window);
    const rt = reReturnTypeOf(entry);
    if (rt !== 'returned') {
        return { createdAt, weight: w, returnType: rt, episodeScore: null, rounds: null, subsequentReviewerIds: [] };
    }
    const allFb = reHumanFeedbackChronological(task);
    const returnIdx = allFb.findIndex((e) => String(e.id) === String(entry.id));
    let episodeScore = 0;
    let rounds = null;
    const subsequentReviewerIds = [];
    if (returnIdx >= 0) {
        rounds = 0;
        let accepted = false;
        for (let i = returnIdx + 1; i < allFb.length; i++) {
            rounds += 1;
            const next = allFb[i];
            if (next.reviewer && next.reviewer.id) {
                subsequentReviewerIds.push(String(next.reviewer.id));
            }
            const nextRt = reReturnTypeOf(next);
            if (nextRt === 'accepted') {
                accepted = true;
                episodeScore = 1 / rounds;
                break;
            }
            if (nextRt === 'bugged' || nextRt === 'escalated') break;
        }
        if (!accepted && rounds > 0) episodeScore = 0;
    }
    return { createdAt, weight: w, returnType: rt, episodeScore, rounds, subsequentReviewerIds };
}

function rePillarOmitReason(pillar) {
    if (!pillar || pillar.defined !== false) return null;
    switch (pillar.id) {
        case 'feedbackResolution':
            return 'No return episodes by this QA in scope';
        case 'reviewCallAccuracy':
        case 'disputeOutcomes':
            return 'No resolved disputes in scope';
        case 'consistency':
            return 'Fewer than 2 active calendar weeks in trailing window';
        default:
            return 'Pillar undefined';
    }
}

function reMedian(values) {
    const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (!nums.length) return null;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function reSlugify(text) {
    return String(text || 'worker')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'worker';
}

function reFormatPct(score) {
    const lib = reLib();
    if (lib && typeof lib.formatPercent === 'function') return lib.formatPercent(score * 100);
    return (Math.round(score * 1000) / 10).toFixed(1);
}

function reFieldAuditRow(entry, task, workerId) {
    const ts = reFeedbackTimestamp(entry);
    const allFb = reHumanFeedbackChronological(task);
    const chronoIdx = allFb.findIndex((e) => String(e.id) === String(entry.id));
    return {
        feedbackId: String(entry.id || ''),
        taskId: String((task && task.id) || ''),
        feedbackAt: ts || null,
        created_at_legacy: String((entry && entry.created_at) || '') || null,
        reviewerId: String((entry.reviewer && entry.reviewer.id) || ''),
        returnType: reReturnTypeOf(entry),
        chronologicalIndex: chronoIdx,
        totalHumanFeedbackOnTask: allFb.length,
        isFirstQaOnTask: chronoIdx === 0,
        timestampResolvable: Boolean(ts)
    };
}

const RatingEngine = {
    VERSION: RE_VERSION,

    compute(options) {
        const opts = options || {};
        const cachedItems = opts.cachedItems || [];
        const committed = opts.committed || {};
        const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
        const authorIds = [...new Set((committed.authorIds || []).filter(Boolean))];
        const hydratedItems = cachedItems.filter((item) => item && item.hydrated === true);
        const unhydratedCount = cachedItems.length - hydratedItems.length;
        const mode = reResolveWeightingMode(committed);
        const window = reResolveWindow(committed);
        const profiles = opts.workerProfiles || {};

        const workers = authorIds.map((workerId) => {
            const profile = profiles[workerId] || {};
            const twqs = this._computeTwqs(workerId, hydratedItems, mode, window, nowMs);
            const qaqs = this._computeQaqs(workerId, hydratedItems, mode, window, nowMs);
            return {
                workerId,
                name: profile.name || profile.label || workerId,
                email: profile.email || '',
                mode,
                window,
                twqs,
                qaqs,
                meta: {
                    hydratedCount: hydratedItems.length,
                    unhydratedCount,
                    scoredItemIds: hydratedItems.map((it) => it.id)
                }
            };
        });

        return {
            version: RE_VERSION,
            computedAt: new Date(nowMs).toISOString(),
            mode,
            window,
            workers,
            meta: {
                hydratedCount: hydratedItems.length,
                unhydratedCount,
                totalCount: cachedItems.length,
                workerCount: workers.length
            }
        };
    },

    _writerItems(workerId, hydratedItems) {
        return hydratedItems.filter((item) => {
            const authorId = item.task && item.task.author && item.task.author.id;
            return reIdsEqual(authorId, workerId);
        });
    },

    _computeTwqs(workerId, hydratedItems, mode, window, nowMs) {
        const writerItems = this._writerItems(workerId, hydratedItems);
        if (writerItems.length === 0) return null;

        const severityEvents = [];
        const revisionEvents = [];
        let flagBad = 0;
        let flagDenom = 0;
        let disputeGood = 0;
        let disputeDenom = 0;
        const weeklySeverity = new Map();
        let count90d = 0;
        let earliestTs = null;
        const outcomeCounts = { accepted: 0, returned: 0, escalated: 0, bugged: 0 };

        for (const item of writerItems) {
            const task = item.task;
            const createdAt = reTaskTimestamp(task, item);
            const w = reEventWeight(createdAt, mode, nowMs, window);
            if (w <= 0) continue;

            const severity = reTaskSeverityScore(task);
            severityEvents.push({ value: severity, weight: w, iso: createdAt });
            if (reInTrailingWeeks(createdAt, nowMs)) {
                const wk = reIsoWeekKey(createdAt);
                if (wk) {
                    if (!weeklySeverity.has(wk)) weeklySeverity.set(wk, []);
                    weeklySeverity.get(wk).push({ value: severity, weight: w });
                }
            }

            const vFinal = reFinalDisplayVersionNo(task);
            revisionEvents.push({ value: 1 / Math.max(1, vFinal), weight: w, iso: createdAt });

            const ts = Date.parse(createdAt);
            if (!Number.isNaN(ts)) {
                if (earliestTs == null || ts < earliestTs) earliestTs = ts;
                if ((nowMs - ts) <= RE_CONFIDENCE_WINDOW_MS) count90d += 1;
            }

            for (const entry of reHumanFeedbackChronological(task)) {
                const rt = reReturnTypeOf(entry);
                if (rt && outcomeCounts[rt] != null) outcomeCounts[rt] += 1;
            }

            flagDenom += w;
            for (const flag of item.flags || []) {
                if (!flag.isConfirmed) continue;
                if (!RE_WRITER_FLAG_REASONS.has(flag.reasonKey)) continue;
                const flagTs = flag.resolutionAt || flag.createdAt || createdAt;
                const fw = reEventWeight(flagTs, mode, nowMs, window);
                if (fw > 0) flagBad += fw;
            }

            for (const dispute of item.disputes || []) {
                if (!dispute.resolutionAt) continue;
                const dw = reEventWeight(dispute.resolutionAt, mode, nowMs, window);
                if (dw <= 0) continue;
                disputeDenom += dw;
                if (dispute.isApproved) disputeGood += dw;
            }
        }

        const wSumSeverity = severityEvents.reduce((s, e) => s + e.weight, 0);
        const severityMean = reWeightedMean(severityEvents);
        const acceptanceScore = severityMean != null && wSumSeverity > 0
            ? (severityMean * wSumSeverity + 8 * 0.5) / (wSumSeverity + 8)
            : 0.5;

        const revisionScore = reWeightedMean(revisionEvents);
        const revisionPillar = revisionScore != null ? revisionScore : 0.5;

        const srScore = flagDenom > 0
            ? 1 - reShrunkRate(flagBad, flagDenom, 20)
            : reShrunkRate(0, 0, 20);

        let disputeScore = null;
        let disputeDefined = false;
        if (disputeDenom > 0) {
            disputeDefined = true;
            disputeScore = reShrunkRate(disputeGood, disputeDenom, 15);
        }

        const weeklySeverityMeans = [];
        for (const [, entries] of weeklySeverity) {
            const mean = reWeightedMean(entries);
            if (mean != null) weeklySeverityMeans.push(mean);
        }
        const consistencyResult = reConsistencyFromWeekly(weeklySeverityMeans);

        const pillars = RE_TWQS_PILLARS.map((def) => {
            let score = null;
            let defined = true;
            let raw = {};
            switch (def.id) {
                case 'acceptanceSeverity':
                    score = acceptanceScore;
                    raw = { severityMean, eventCount: severityEvents.length, outcomeCounts };
                    break;
                case 'revisionEfficiency':
                    score = revisionPillar;
                    raw = { revisionEventCount: revisionEvents.length };
                    break;
                case 'srReviewIntegrity':
                    score = srScore;
                    raw = { confirmedNegativeFlags: flagBad, submissionWeight: flagDenom };
                    break;
                case 'disputeOutcomes':
                    defined = disputeDefined;
                    score = disputeDefined ? disputeScore : null;
                    raw = { approvedWeight: disputeGood, resolvedWeight: disputeDenom };
                    break;
                case 'consistency':
                    defined = consistencyResult.defined;
                    score = consistencyResult.defined ? consistencyResult.score : null;
                    raw = { activeWeeks: consistencyResult.activeWeeks };
                    break;
                default:
                    break;
            }
            return {
                id: def.id,
                label: def.label,
                baseWeight: def.weight,
                score,
                defined,
                raw
            };
        });

        const combined = reCombinePillars(pillars);
        const tenureDays = earliestTs != null
            ? Math.max(0, Math.round((nowMs - earliestTs) / RE_MS_PER_DAY))
            : null;

        return {
            ...combined,
            confidence: reConfidenceBadge(count90d),
            display: {
                submissionCount: writerItems.length,
                trailing90dSubmissions: count90d,
                tenureDays,
                outcomeCounts
            },
            raw: {
                severityEvents: severityEvents.length,
                revisionEvents: revisionEvents.length,
                flagBad,
                flagDenom,
                disputeGood,
                disputeDenom
            }
        };
    },

    _computeQaqs(workerId, hydratedItems, mode, window, nowMs) {
        const feedbackRows = reCollectQaqsFeedbackRows(workerId, hydratedItems);
        if (feedbackRows.length === 0) return null;

        const feedbackIds = new Set(feedbackRows.map((r) => String(r.entry.id)));
        const returnEpisodes = [];
        let flagBad = 0;
        let flagDenom = 0;
        let disputeGood = 0;
        let disputeDenom = 0;
        const weeklyResolution = new Map();
        let count90d = 0;
        let earliestTs = null;

        for (const { entry, task } of feedbackRows) {
            const createdAt = reFeedbackTimestamp(entry);
            const w = reEventWeight(createdAt, mode, nowMs, window);
            if (w <= 0) continue;

            flagDenom += w;
            const ts = Date.parse(createdAt);
            if (!Number.isNaN(ts)) {
                if (earliestTs == null || ts < earliestTs) earliestTs = ts;
                if ((nowMs - ts) <= RE_CONFIDENCE_WINDOW_MS) count90d += 1;
            }

            const episode = reComputeReturnEpisode(entry, task, mode, window, nowMs);
            if (episode.returnType === 'returned' && reIsProductionTask(task)) {
                returnEpisodes.push({
                    value: episode.episodeScore,
                    weight: w,
                    iso: createdAt,
                    rounds: episode.rounds
                });
                if (reInTrailingWeeks(createdAt, nowMs)) {
                    const wk = reIsoWeekKey(createdAt);
                    if (wk) {
                        if (!weeklyResolution.has(wk)) weeklyResolution.set(wk, []);
                        weeklyResolution.get(wk).push({ value: episode.episodeScore, weight: w });
                    }
                }
            }
        }

        for (const item of hydratedItems) {
            const task = item.task;
            if (!task) continue;
            const remap = task.systemFeedbackIdRemap || {};

            for (const flag of item.flags || []) {
                if (!flag.isConfirmed || flag.reasonKey !== RE_QA_FLAG_REASON) continue;
                const hasQaFeedback = (task.allFeedback || []).some((e) => {
                    return reIsHumanFeedback(e) && reIdsEqual(e.reviewer && e.reviewer.id, workerId);
                });
                if (!hasQaFeedback) continue;
                const flagTs = flag.resolutionAt || flag.createdAt || item.sortAt || '';
                const fw = reEventWeight(flagTs, mode, nowMs, window);
                if (fw > 0) flagBad += fw;
            }

            for (const dispute of item.disputes || []) {
                if (!dispute.resolutionAt) continue;
                const fid = reResolveFeedbackId(dispute.feedbackId, remap);
                if (!fid || !feedbackIds.has(fid)) continue;
                const dw = reEventWeight(dispute.resolutionAt, mode, nowMs, window);
                if (dw <= 0) continue;
                disputeDenom += dw;
                if (dispute.isRejected) disputeGood += dw;
            }
        }

        let resolutionScore = null;
        let resolutionDefined = false;
        if (returnEpisodes.length > 0) {
            resolutionDefined = true;
            const mean = reWeightedMean(returnEpisodes);
            const n = returnEpisodes.length;
            resolutionScore = mean != null ? (mean * n + 8 * 1.0) / (n + 8) : null;
        }

        let disputeScore = null;
        let disputeDefined = false;
        if (disputeDenom > 0) {
            disputeDefined = true;
            disputeScore = reShrunkRate(disputeGood, disputeDenom, 15);
        }

        const srScore = flagDenom > 0
            ? 1 - reShrunkRate(flagBad, flagDenom, 20)
            : reShrunkRate(0, 0, 20);

        const weeklyResolutionMeans = [];
        for (const [, entries] of weeklyResolution) {
            const mean = reWeightedMean(entries);
            if (mean != null) weeklyResolutionMeans.push(mean);
        }
        const consistencyResult = reConsistencyFromWeekly(weeklyResolutionMeans);

        const roundsList = returnEpisodes.map((e) => e.rounds).filter((r) => r != null && r > 0);
        const oneRoundCount = returnEpisodes.filter((e) => e.rounds === 1).length;

        const pillars = RE_QAQS_PILLARS.map((def) => {
            let score = null;
            let defined = true;
            let raw = {};
            switch (def.id) {
                case 'feedbackResolution':
                    defined = resolutionDefined;
                    score = resolutionDefined ? resolutionScore : null;
                    raw = { returnEpisodeCount: returnEpisodes.length };
                    break;
                case 'reviewCallAccuracy':
                    defined = disputeDefined;
                    score = disputeDefined ? disputeScore : null;
                    raw = { upheldWeight: disputeGood, resolvedWeight: disputeDenom };
                    break;
                case 'srReviewIntegrity':
                    score = srScore;
                    raw = { confirmedFlags: flagBad, feedbackWeight: flagDenom };
                    break;
                case 'consistency':
                    defined = consistencyResult.defined;
                    score = consistencyResult.defined ? consistencyResult.score : null;
                    raw = { activeWeeks: consistencyResult.activeWeeks };
                    break;
                default:
                    break;
            }
            return {
                id: def.id,
                label: def.label,
                baseWeight: def.weight,
                score,
                defined,
                raw
            };
        });

        const combined = reCombinePillars(pillars);
        const tenureDays = earliestTs != null
            ? Math.max(0, Math.round((nowMs - earliestTs) / RE_MS_PER_DAY))
            : null;

        return {
            ...combined,
            confidence: reConfidenceBadge(count90d),
            display: {
                feedbackRowCount: feedbackRows.length,
                trailing90dFeedbackRows: count90d,
                tenureDays,
                returnEpisodeCount: returnEpisodes.length,
                medianRoundsToAccept: reMedian(roundsList),
                oneRoundPct: returnEpisodes.length
                    ? Math.round((oneRoundCount / returnEpisodes.length) * 1000) / 10
                    : null
            },
            raw: {
                returnEpisodes: returnEpisodes.length,
                flagBad,
                flagDenom,
                disputeGood,
                disputeDenom
            }
        };
    },

    buildDiagnosticsReport(workerReport, context) {
        const ctx = context || {};
        const cachedItems = (ctx.cachedItems || []).filter((item) => item && item.hydrated === true);
        const workerId = workerReport.workerId;
        const mode = workerReport.mode || reResolveWeightingMode(ctx.committed);
        const window = workerReport.window || reResolveWindow(ctx.committed);
        const nowMs = Date.parse(workerReport.computedAt) || Date.now();

        const feedbackRows = reCollectQaqsFeedbackRows(workerId, cachedItems);
        const feedbackRowsRaw = [];
        let feedbackRowsBeforeDedupe = 0;
        for (const item of cachedItems) {
            const task = item.task;
            if (!task) continue;
            for (const entry of task.allFeedback || []) {
                if (!reIsHumanFeedback(entry)) continue;
                if (!reIdsEqual(entry.reviewer && entry.reviewer.id, workerId)) continue;
                feedbackRowsBeforeDedupe += 1;
            }
        }

        const returnTypeCounts = { accepted: 0, returned: 0, escalated: 0, bugged: 0, other: 0 };
        let timestampMissingCount = 0;
        let weightedFeedbackRows = 0;
        const returnEpisodeDetails = [];
        const fieldAuditSamples = [];
        const seenAuditIds = new Set();

        for (const { entry, task } of feedbackRows) {
            const ts = reFeedbackTimestamp(entry);
            if (!ts) timestampMissingCount += 1;
            const w = reEventWeight(ts, mode, nowMs, window);
            if (w > 0) weightedFeedbackRows += 1;

            const rt = reReturnTypeOf(entry) || 'other';
            if (returnTypeCounts[rt] != null) returnTypeCounts[rt] += 1;
            else returnTypeCounts.other += 1;

            const audit = reFieldAuditRow(entry, task, workerId);
            const isAnomalous = !audit.timestampResolvable || rt === 'returned';
            if (fieldAuditSamples.length < RE_DIAG_SAMPLE_ROWS || isAnomalous) {
                if (!seenAuditIds.has(audit.feedbackId)) {
                    seenAuditIds.add(audit.feedbackId);
                    fieldAuditSamples.push(audit);
                }
            }

            const episode = reComputeReturnEpisode(entry, task, mode, window, nowMs);
            if (episode.returnType === 'returned') {
                returnEpisodeDetails.push({
                    feedbackId: String(entry.id),
                    taskId: String(task.id),
                    feedbackAt: episode.createdAt || null,
                    roundsToAccept: episode.rounds,
                    episodeScore: episode.episodeScore,
                    subsequentReviewerIds: episode.subsequentReviewerIds,
                    taskStatus: String((task && task.status) || '') || null,
                    countedInResolution: reIsProductionTask(task)
                });
            }
        }

        const feedbackIds = new Set(feedbackRows.map((r) => String(r.entry.id)));
        const disputesInScope = [];
        const flagsInScope = [];

        for (const item of cachedItems) {
            const task = item.task;
            if (!task) continue;
            const remap = task.systemFeedbackIdRemap || {};
            const hasQaOnTask = (task.allFeedback || []).some((e) => {
                return reIsHumanFeedback(e) && reIdsEqual(e.reviewer && e.reviewer.id, workerId);
            });
            if (!hasQaOnTask) continue;

            for (const dispute of item.disputes || []) {
                const rawFid = String(dispute.feedbackId || '').trim();
                const resolvedFid = reResolveFeedbackId(dispute.feedbackId, remap);
                const matchesWorker = resolvedFid && feedbackIds.has(resolvedFid);
                disputesInScope.push({
                    disputeId: String(dispute.id || ''),
                    feedbackId: rawFid,
                    resolvedFeedbackId: resolvedFid,
                    matchesWorker,
                    status: dispute.status || null,
                    resolutionAt: dispute.resolutionAt || null,
                    isRejected: Boolean(dispute.isRejected),
                    isApproved: Boolean(dispute.isApproved)
                });
            }

            for (const flag of item.flags || []) {
                if (flag.reasonKey !== RE_QA_FLAG_REASON) continue;
                const hasQa = (task.allFeedback || []).some((e) => {
                    return reIsHumanFeedback(e) && reIdsEqual(e.reviewer && e.reviewer.id, workerId);
                });
                if (!hasQa) continue;
                flagsInScope.push({
                    flagId: String(flag.id || ''),
                    taskId: String(task.id || ''),
                    reasonKey: flag.reasonKey,
                    status: flag.status || null,
                    isConfirmed: Boolean(flag.isConfirmed),
                    resolutionAt: flag.resolutionAt || null
                });
            }
        }

        const qaqsPillarDebug = (workerReport.qaqs && workerReport.qaqs.pillars || []).map((p) => ({
            id: p.id,
            label: p.label,
            defined: p.defined !== false,
            whyOmitted: rePillarOmitReason(p),
            score: p.score,
            raw: p.raw || {}
        }));

        const twqsPillarDebug = (workerReport.twqs && workerReport.twqs.pillars || []).map((p) => ({
            id: p.id,
            label: p.label,
            defined: p.defined !== false,
            whyOmitted: rePillarOmitReason(p),
            score: p.score,
            raw: p.raw || {}
        }));

        return {
            meta: {
                engineVersion: RE_VERSION,
                computedAt: workerReport.computedAt || new Date(nowMs).toISOString(),
                workerId,
                name: workerReport.name || workerId,
                email: workerReport.email || '',
                mode,
                window,
                hydratedCount: cachedItems.length,
                unhydratedCount: ctx.unhydratedCount != null
                    ? ctx.unhydratedCount
                    : Math.max(0, (ctx.cachedItems || []).length - cachedItems.length)
            },
            warnings: ctx.warnings || [],
            fieldAudit: {
                accessorNotes: {
                    feedbackTimestamp: 'Uses entry.feedbackAt with fallback to entry.created_at',
                    taskTimestamp: 'Uses task.createdAt with fallback to item.sortAt',
                    disputeFeedbackId: 'Applies task.systemFeedbackIdRemap before matching QA feedback rows'
                },
                samples: fieldAuditSamples
            },
            qaqs: {
                feedbackRowsBeforeDedupe,
                feedbackRowsDeduped: feedbackRows.length,
                timestampMissingCount,
                weightedFeedbackRows,
                returnTypeCounts,
                returnEpisodes: returnEpisodeDetails,
                disputesInScope,
                flagsInScope,
                pillarDebug: qaqsPillarDebug
            },
            twqs: workerReport.twqs ? {
                writerItemCount: this._writerItems(workerId, cachedItems).length,
                pillarDebug: twqsPillarDebug
            } : null,
            scores: {
                twqs: workerReport.twqs ? {
                    score: workerReport.twqs.score,
                    band: workerReport.twqs.band
                } : null,
                qaqs: workerReport.qaqs ? {
                    score: workerReport.qaqs.score,
                    band: workerReport.qaqs.band
                } : null
            }
        };
    },

    buildExportFilename(workerReport, scoreType, ext) {
        const name = reSlugify(workerReport.name || workerReport.workerId);
        const mode = workerReport.mode === 'B' ? 'window' : 'lifetime';
        const date = (workerReport.exportDate || new Date().toISOString().slice(0, 10));
        return 'rating-' + name + '-' + scoreType + '-' + mode + '-' + date + '.' + ext;
    },

    buildDiagnosticsFilename(workerReport) {
        const name = reSlugify(workerReport.name || workerReport.workerId);
        const mode = workerReport.mode === 'B' ? 'window' : 'lifetime';
        const date = (workerReport.exportDate || new Date().toISOString().slice(0, 10));
        return 'rating-' + name + '-diagnostics-' + mode + '-' + date + '.json';
    },

    serializeJson(report) {
        return JSON.stringify(report, null, 2);
    },

    serializeDiagnosticsJson(report) {
        return JSON.stringify(report, null, 2);
    },

    serializeMarkdown(workerReport) {
        const lines = [];
        lines.push('# Worker Rating Report');
        lines.push('');
        lines.push('- **Worker:** ' + (workerReport.name || workerReport.workerId));
        if (workerReport.email) lines.push('- **Email:** ' + workerReport.email);
        lines.push('- **Computed:** ' + (workerReport.computedAt || new Date().toISOString()));
        lines.push('- **Weighting mode:** ' + (workerReport.mode === 'B' ? 'Mode B (flat window)' : 'Mode A (recency decay)'));
        const win = workerReport.window || {};
        if (win.afterLocal || win.beforeLocal) {
            lines.push('- **Window:** ' + (win.afterLocal || '…') + ' → ' + (win.beforeLocal || '…'));
        } else {
            lines.push('- **Window:** All time');
        }
        lines.push('- **Engine version:** ' + (workerReport.engineVersion || RE_VERSION));
        lines.push('');

        const renderScoreBlock = (title, block) => {
            if (!block) return;
            lines.push('## ' + title);
            lines.push('');
            lines.push('**Score:** ' + block.score + ' / 100 · ' + block.band);
            lines.push('**Confidence:** ' + (block.confidence && block.confidence.label));
            lines.push('');
            lines.push('| Pillar | Sub-score | Weight |');
            lines.push('| --- | ---: | ---: |');
            for (const p of block.pillars || []) {
                const wt = p.effectiveWeight != null
                    ? (Math.round(p.effectiveWeight * 1000) / 10) + '%'
                    : '—';
                const sc = p.defined === false ? 'omitted' : reFormatPct(p.score || 0);
                lines.push('| ' + p.label + ' | ' + sc + ' | ' + wt + ' |');
            }
            lines.push('');
            if (block.display) {
                lines.push('### Display stats');
                for (const [k, v] of Object.entries(block.display)) {
                    lines.push('- **' + k + ':** ' + JSON.stringify(v));
                }
                lines.push('');
            }
            if (block.raw) {
                lines.push('### Raw inputs');
                lines.push('```json');
                lines.push(JSON.stringify(block.raw, null, 2));
                lines.push('```');
                lines.push('');
            }
        };

        renderScoreBlock('Task Writer Quality Score (TWQS)', workerReport.twqs);
        renderScoreBlock('QA Quality Score (QAQS)', workerReport.qaqs);

        if (workerReport.meta) {
            lines.push('## Meta');
            lines.push('- Hydrated items used: ' + workerReport.meta.hydratedCount);
            lines.push('- Unhydrated items excluded: ' + workerReport.meta.unhydratedCount);
        }

        return lines.join('\n');
    }
};

const plugin = {
    id: 'rating-engine',
    name: 'Rating Engine',
    description: 'TWQS and QAQS computation for Worker Output Search ratings',
    _version: '1.2',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        if (state && state.registered) {
            Logger.debug('rating-engine: already registered — skipping re-init');
            return;
        }
        Context.ratingEngine = RatingEngine;
        if (state) state.registered = true;
        Logger.log('rating-engine: module registered (Context.ratingEngine)');
    }
};
