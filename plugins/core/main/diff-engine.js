// diff-engine.js — Shared LCS word/char diff for Diff Viewer and Search Output rolling diff.

const DE_CHAR_DIFF_LIMIT = 15000;
const DE_WORD_DIFF_TOKEN_LIMIT = 4000;

function _deEscHtml(value) {
    const lib = Context.dashboardLib;
    if (lib && typeof lib.escHtml === 'function') return lib.escHtml(value);
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _deFormatPercent(value) {
    const lib = Context.dashboardLib;
    if (lib && typeof lib.formatPercent === 'function') return lib.formatPercent(value);
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    if (n < 1) return (Math.round(n * 100) / 100).toFixed(2);
    return String(Math.round(n));
}

let _deCachedHighlightStyles = null;
let _deCachedHighlightDark = null;
let _deFleetThemeListeners = [];
let _deUiLibThemeUnsub = null;
let _deLastFleetDark = null;

function _deUiLib() {
    return Context.uiLib || null;
}

function _deIsFleetDark() {
    const ui = _deUiLib();
    if (ui && typeof ui.isFleetDark === 'function') return !!ui.isFleetDark();
    return document.documentElement.dataset.fleetUxTheme === 'dark';
}

function _deGetFleetTheme() {
    const ui = _deUiLib();
    if (ui && typeof ui.getFleetTheme === 'function') return ui.getFleetTheme() === 'dark' ? 'dark' : 'light';
    return _deIsFleetDark() ? 'dark' : 'light';
}

function _deInvalidateHighlightStyles() {
    _deCachedHighlightStyles = null;
    _deCachedHighlightDark = null;
}

function _deNotifyFleetThemeChange() {
    const dark = _deIsFleetDark();
    if (_deLastFleetDark === dark) return;
    _deLastFleetDark = dark;
    _deInvalidateHighlightStyles();
    const payload = { theme: dark ? 'dark' : 'light', dark };
    for (const fn of _deFleetThemeListeners) {
        try {
            fn(payload);
        } catch (err) {
            Logger.warn('theme listener failed', err);
        }
    }
}

function _deEnsureFleetThemeObserver() {
    if (_deUiLibThemeUnsub) return;
    _deLastFleetDark = _deIsFleetDark();
    const ui = _deUiLib();
    if (ui && typeof ui.onThemeChange === 'function') {
        _deUiLibThemeUnsub = ui.onThemeChange(() => _deNotifyFleetThemeChange());
        return;
    }
    // ui-lib should already be loaded before ops plugins; avoid a second site-dark observer.
    Logger.debug('uiLib theme helpers unavailable — Preferred-mode sync deferred');
}

function _deOnFleetThemeChange(callback) {
    if (typeof callback !== 'function') return () => {};
    _deEnsureFleetThemeObserver();
    _deFleetThemeListeners.push(callback);
    return () => {
        _deFleetThemeListeners = _deFleetThemeListeners.filter((fn) => fn !== callback);
    };
}

function _deHighlightStyles() {
    const dark = _deIsFleetDark();
    if (_deCachedHighlightStyles && _deCachedHighlightDark === dark) return _deCachedHighlightStyles;
    const removeBg = dark ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.3)';
    const addBg = dark ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.3)';
    const equalBg = 'rgba(250,215,50,0.4)';
    const span = 'white-space:pre-wrap;border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;';
    _deCachedHighlightDark = dark;
    _deCachedHighlightStyles = {
        remove: `background-color:${removeBg};${span}`,
        add: `background-color:${addBg};${span}`,
        equal: `background-color:${equalBg};${span}`
    };
    return _deCachedHighlightStyles;
}

function _deIsWordChar(char, prevChar, nextChar) {
    if (/[\p{L}\p{N}_]/u.test(char)) return true;
    return char === '\''
        && /[\p{L}\p{N}_]/u.test(prevChar || '')
        && /[\p{L}\p{N}_]/u.test(nextChar || '');
}

/** True for tokens that are only punctuation/symbols (no letters, digits, underscore, or whitespace). */
function _deIsPunctuationToken(value) {
    const s = String(value ?? '');
    if (!s || s === '\n') return false;
    return /^[^\p{L}\p{N}_\s]+$/u.test(s);
}

function _deFilterPunctuationTokens(tokens) {
    return (tokens || []).filter((t) => !_deIsPunctuationToken(t));
}

function _deTokenize(text) {
    const tokens = [];
    const chars = [...String(text ?? '')];
    let i = 0;
    while (i < chars.length) {
        const char = chars[i];
        if (char === '\n') {
            tokens.push('\n');
            i++;
            continue;
        }
        if (char === ' ' || char === '\t') {
            let ws = char;
            i++;
            while (i < chars.length && (chars[i] === ' ' || chars[i] === '\t')) {
                ws += chars[i];
                i++;
            }
            tokens.push(ws);
            continue;
        }
        if (_deIsWordChar(char, chars[i - 1], chars[i + 1])) {
            let word = char;
            i++;
            while (i < chars.length && _deIsWordChar(chars[i], chars[i - 1], chars[i + 1])) {
                word += chars[i];
                i++;
            }
            tokens.push(word);
            continue;
        }
        tokens.push(char);
        i++;
    }
    return tokens;
}

function _deComputeLCS(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    return dp;
}

function _deBacktrack(dp, a, b) {
    const diff = [];
    let i = a.length;
    let j = b.length;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            diff.push({ type: 'equal', value: a[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            diff.push({ type: 'add', value: b[j - 1] });
            j--;
        } else {
            diff.push({ type: 'remove', value: a[i - 1] });
            i--;
        }
    }
    diff.reverse();
    return diff;
}

function _deComputeWordDiff(oldText, newText) {
    const a = _deTokenize(oldText);
    const b = _deTokenize(newText);
    const dp = _deComputeLCS(a, b);
    return {
        diff: _deBacktrack(dp, a, b),
        lcsLength: dp[a.length][b.length],
        unitLenA: a.length,
        unitLenB: b.length
    };
}

function _deComputeCharDiff(oldText, newText) {
    const a = oldText.split('');
    const b = newText.split('');
    const dp = _deComputeLCS(a, b);
    return {
        diff: _deBacktrack(dp, a, b),
        lcsLength: dp[a.length][b.length],
        unitLenA: a.length,
        unitLenB: b.length
    };
}

function _deIsWhitespaceOnlyValues(values) {
    return values.length > 0 && values.every((v) => /^[ \t]+$/.test(v));
}

function _deIsPunctuationOnlyValues(values) {
    return values.length > 0 && values.every((v) => _deIsPunctuationToken(v));
}

/** Whitespace, or punctuation-only when absorbPunctuation (visual glue into highlights). */
function _deIsCoalesceSeparator(values, absorbPunctuation) {
    if (_deIsWhitespaceOnlyValues(values)) return true;
    return !!(absorbPunctuation && _deIsPunctuationOnlyValues(values));
}

function _deCoalesceHighlightGroups(groups, highlightType, absorbPunctuation) {
    if (!groups.length) return groups;
    const out = [];
    let i = 0;
    while (i < groups.length) {
        const group = groups[i];
        if (group.type !== highlightType) {
            out.push(group);
            i++;
            continue;
        }
        const values = group.values.slice();
        let trimTrailing = group.trimTrailing;
        i++;
        while (i < groups.length) {
            const sep = groups[i];
            if (sep.type === highlightType) break;
            if (!_deIsCoalesceSeparator(sep.values, absorbPunctuation)) break;
            values.push(...sep.values);
            trimTrailing = sep.trimTrailing;
            i++;
            if (i < groups.length && groups[i].type === highlightType) {
                values.push(...groups[i].values);
                trimTrailing = groups[i].trimTrailing;
                i++;
                continue;
            }
            break;
        }
        out.push({ type: highlightType, values, trimTrailing });
    }
    return out;
}

/**
 * Pull equal punctuation tokens that sit directly beside a highlight into that
 * highlight (e.g. quotes around a changed word, "." before a changed extension).
 */
function _deAbsorbAdjacentPunctuationIntoHighlights(groups, highlightType) {
    if (!groups.length) return groups;
    const out = groups.map((g) => ({
        type: g.type,
        values: g.values.slice(),
        trimTrailing: g.trimTrailing
    }));
    let i = 0;
    while (i < out.length) {
        if (out[i].type !== highlightType) {
            i++;
            continue;
        }
        while (i > 0 && out[i - 1].type === 'equal' && _deIsPunctuationOnlyValues(out[i - 1].values)) {
            out[i].values = out[i - 1].values.concat(out[i].values);
            out.splice(i - 1, 1);
            i--;
        }
        while (i + 1 < out.length && out[i + 1].type === 'equal' && _deIsPunctuationOnlyValues(out[i + 1].values)) {
            out[i].values = out[i].values.concat(out[i + 1].values);
            out[i].trimTrailing = out[i + 1].trimTrailing;
            out.splice(i + 1, 1);
        }
        i++;
    }
    return out;
}

function _deGroupConsecutive(diff, includeTypes, highlightType, absorbPunctuation) {
    const filtered = diff.filter((d) => includeTypes.includes(d.type));
    const groups = [];
    for (let i = 0; i < filtered.length; i++) {
        const item = filtered[i];
        const nextItem = filtered[i + 1];
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.type === item.type && item.value !== '\n' && !lastGroup.values.includes('\n')) {
            lastGroup.values.push(item.value);
            if (nextItem && nextItem.type !== item.type && item.type === highlightType) lastGroup.trimTrailing = true;
        } else {
            const group = { type: item.type, values: [item.value], trimTrailing: false };
            if (nextItem && nextItem.type !== item.type && item.type === highlightType) group.trimTrailing = true;
            groups.push(group);
        }
    }
    let out = _deCoalesceHighlightGroups(groups, highlightType, absorbPunctuation);
    if (absorbPunctuation) {
        out = _deAbsorbAdjacentPunctuationIntoHighlights(out, highlightType);
    }
    return out;
}

function _deTrimTrailing(str) { return str.replace(/[ \t]+$/, ''); }

function _deSplitWordHighlightEdges(text) {
    const source = String(text == null ? '' : text);
    if (!source) return { lead: '', core: '', trail: '' };
    const leadMatch = source.match(/^[ \t]+/);
    const lead = leadMatch ? leadMatch[0] : '';
    let rest = source.slice(lead.length);
    const trailMatch = rest.match(/[ \t]+$/);
    const trail = trailMatch ? trailMatch[0] : '';
    const core = rest.slice(0, rest.length - trail.length);
    return { lead, core, trail };
}

function _deSectionUnitLength(group, granularity, ignorePunctuation) {
    let values = group.values || [];
    if (ignorePunctuation) values = values.filter((v) => !_deIsPunctuationToken(v));
    if (granularity === 'line') {
        // Line-mode tokens are already whole lines (no embedded newlines).
        return values.filter((v) => String(v).trim().length > 0).length;
    }
    if (granularity === 'char') {
        return values.join('').replace(/[\s\n\r\t]/g, '').length;
    }
    return values.filter((v) => v !== '\n' && !/^[ \t]+$/.test(v)).length;
}

function _deHighlightTypes(highlightModality) {
    const similarities = highlightModality === 'similarities';
    return {
        baseHighlight: similarities ? 'equal' : 'remove',
        compareHighlight: similarities ? 'equal' : 'add'
    };
}

function _deComputeDiff(baseText, compareText, granularity, _punctuationMode) {
    const isChar = granularity === 'char';
    const isLine = granularity === 'line';
    let diff;
    let effectiveGranularity;
    let lcsLength = 0;
    let unitLenA = 0;
    let unitLenB = 0;
    if (isChar && (baseText.length + compareText.length > DE_CHAR_DIFF_LIMIT)) {
        Logger.warn('texts too large for char diff (' + (baseText.length + compareText.length) + ' chars), falling back to word diff');
        const word = _deComputeWordDiff(baseText, compareText);
        diff = word.diff;
        lcsLength = word.lcsLength;
        unitLenA = word.unitLenA;
        unitLenB = word.unitLenB;
        effectiveGranularity = 'word';
    } else if (isChar) {
        const ch = _deComputeCharDiff(baseText, compareText);
        diff = ch.diff;
        lcsLength = ch.lcsLength;
        unitLenA = ch.unitLenA;
        unitLenB = ch.unitLenB;
        effectiveGranularity = 'char';
    } else if (isLine) {
        const units = _deDiffUnits(baseText, compareText, 'line');
        const dp = _deComputeLCS(units.a, units.b);
        diff = _deBacktrack(dp, units.a, units.b);
        lcsLength = dp[units.a.length][units.b.length];
        unitLenA = units.a.length;
        unitLenB = units.b.length;
        effectiveGranularity = 'line';
    } else {
        _deDiffUnits(baseText, compareText, 'word'); // debug warn only when oversized
        const word = _deComputeWordDiff(baseText, compareText);
        diff = word.diff;
        lcsLength = word.lcsLength;
        unitLenA = word.unitLenA;
        unitLenB = word.unitLenB;
        effectiveGranularity = 'word';
    }
    // Ignore mode must NOT demote side-only punctuation add/remove to equal — that
    // paints characters onto the opposite pane. Ignore is handled at highlight /
    // similarity time (skip punct-only highlights; filter punct from scoring).
    return { diff, effectiveGranularity, lcsLength, unitLenA, unitLenB };
}

function _deSimilarityMetrics(baseText, compareText, granularity, punctuationMode, reuse) {
    const base = baseText || '';
    const compare = compareText || '';
    if (base === compare) {
        const gran = (reuse && reuse.effectiveGranularity)
            || (granularity === 'char' ? 'char' : (granularity === 'line' ? 'line' : 'word'));
        return { percent: 100, noDifference: true, effectiveGranularity: gran };
    }
    // Highlight punctuation: reuse the same LCS as the rendered diff.
    if (punctuationMode !== 'ignore' && reuse
        && typeof reuse.lcsLength === 'number'
        && typeof reuse.unitLenA === 'number'
        && typeof reuse.unitLenB === 'number') {
        const denom = reuse.unitLenA + reuse.unitLenB;
        if (denom === 0) {
            return { percent: 100, noDifference: true, effectiveGranularity: reuse.effectiveGranularity };
        }
        const percent = (2 * reuse.lcsLength / denom) * 100;
        const noDifference = reuse.lcsLength === reuse.unitLenA && reuse.unitLenA === reuse.unitLenB;
        return { percent, noDifference, effectiveGranularity: reuse.effectiveGranularity };
    }
    let { a, b, effectiveGranularity } = _deDiffUnits(base, compare, granularity);
    if (reuse && reuse.effectiveGranularity) effectiveGranularity = reuse.effectiveGranularity;
    if (punctuationMode === 'ignore') {
        a = _deFilterPunctuationTokens(a);
        b = _deFilterPunctuationTokens(b);
    }
    if (punctuationMode === 'ignore' && a.length === b.length && a.every((t, i) => t === b[i])) {
        return { percent: 100, noDifference: true, effectiveGranularity };
    }
    if (a.length === 0 && b.length === 0) {
        return { percent: 100, noDifference: true, effectiveGranularity };
    }
    const dp = _deComputeLCS(a, b);
    const lcs = dp[a.length][b.length];
    const percent = (2 * lcs / (a.length + b.length)) * 100;
    return { percent, noDifference: false, effectiveGranularity };
}

function _deDiffBundle(baseText, compareText, opts) {
    const o = opts || {};
    const granularity = o.granularity || 'word';
    const showHighlights = o.showHighlights !== false;
    const highlightModality = o.highlightModality || 'differences';
    const minHighlightLength = o.minHighlightLength || 0;
    const linkSplits = !!o.linkSplits;
    const punctuationMode = o.punctuationMode === 'ignore' ? 'ignore' : 'highlight';
    const ignorePunctuation = punctuationMode === 'ignore';
    const left = baseText || '';
    const right = compareText || '';

    let diff = o.diff;
    let effectiveGranularity = o.effectiveGranularity;
    let lcsLength = o.lcsLength;
    let unitLenA = o.unitLenA;
    let unitLenB = o.unitLenB;
    if (!diff || !effectiveGranularity) {
        const computed = _deComputeDiff(left, right, granularity, punctuationMode);
        diff = computed.diff;
        effectiveGranularity = computed.effectiveGranularity;
        lcsLength = computed.lcsLength;
        unitLenA = computed.unitLenA;
        unitLenB = computed.unitLenB;
    }

    let percent = o.percent;
    let noDifference = o.noDifference;
    const includeSimilarity = o.includeSimilarity !== false;
    if (includeSimilarity && (typeof percent !== 'number' || noDifference == null)) {
        const sim = _deSimilarityMetrics(left, right, granularity, punctuationMode, {
            effectiveGranularity,
            lcsLength,
            unitLenA,
            unitLenB
        });
        percent = sim.percent;
        noDifference = sim.noDifference;
        effectiveGranularity = sim.effectiveGranularity || effectiveGranularity;
    } else if (!includeSimilarity) {
        if (typeof percent !== 'number') percent = null;
        if (noDifference == null) noDifference = null;
    }

    let baseHtml;
    let compareHtml;
    if (!showHighlights) {
        baseHtml = _deEqualSpanHtml(left);
        compareHtml = _deEqualSpanHtml(right);
    } else {
        const { baseHighlight, compareHighlight } = _deHighlightTypes(highlightModality);
        const styles = _deHighlightStyles();
        const renderOpts = {
            minHighlightLength,
            effectiveGranularity,
            linkSplits,
            ignorePunctuation
        };
        if (highlightModality === 'similarities') {
            renderOpts.qualifyingEqualIndices = _deQualifyingEqualIndexSet(
                diff, effectiveGranularity, minHighlightLength, linkSplits, ignorePunctuation
            );
        }
        baseHtml = _deRenderBaseHtml(diff, styles[baseHighlight], baseHighlight, renderOpts);
        compareHtml = _deRenderCompareHtml(diff, styles[compareHighlight], compareHighlight, renderOpts);
    }

    return {
        diff,
        effectiveGranularity,
        baseHtml,
        compareHtml,
        percent,
        noDifference,
        lcsLength,
        unitLenA,
        unitLenB
    };
}

function _deSimilarityLabelHtml(opts) {
    const showHighlights = opts && opts.showHighlights !== false;
    if (!showHighlights) return '';
    const leftText = (opts && opts.leftText) || '';
    const rightText = (opts && opts.rightText) || '';
    if (!leftText && !rightText) return '';
    const granularity = (opts && opts.granularity) || 'word';
    const highlightModality = (opts && opts.highlightModality) || 'differences';
    const minHighlightLength = (opts && opts.minHighlightLength) || 0;
    const linkSplits = !!(opts && opts.linkSplits);
    const punctuationMode = (opts && opts.punctuationMode) === 'ignore' ? 'ignore' : 'highlight';
    const ignorePunctuation = punctuationMode === 'ignore';
    const lengthRange = (opts && opts.lengthRange) || null;
    const bundle = (opts && opts.bundle) || null;

    let percent;
    let noDifference;
    let effectiveGranularity;
    let diff = opts && opts.diff;
    if (bundle) {
        percent = bundle.percent;
        noDifference = bundle.noDifference;
        effectiveGranularity = bundle.effectiveGranularity;
        if (!diff) diff = bundle.diff;
    } else if (typeof (opts && opts.percent) === 'number' && opts.noDifference != null && opts.effectiveGranularity) {
        percent = opts.percent;
        noDifference = opts.noDifference;
        effectiveGranularity = opts.effectiveGranularity;
    } else {
        const sim = _deSimilarityMetrics(leftText, rightText, granularity, punctuationMode, null);
        percent = sim.percent;
        noDifference = sim.noDifference;
        effectiveGranularity = sim.effectiveGranularity;
    }

    const granLabel = effectiveGranularity === 'char' ? 'char' : (effectiveGranularity === 'line' ? 'line' : 'word');
    if (noDifference) {
        return '<span class="dv-slot-above-label-nodiff">NO DIFFERENCE</span>';
    }
    const displayPercent = highlightModality === 'similarities' ? percent : (100 - percent);
    const formatted = _deFormatPercent(displayPercent);
    const metricWord = highlightModality === 'similarities' ? 'similarity' : 'difference';
    let html = '<span class="dv-slot-above-label-sim">' + formatted + '% ' + granLabel + ' ' + metricWord;
    const rangeMin = lengthRange ? lengthRange.min : 0;
    const subsetActive = minHighlightLength > 0 && lengthRange && minHighlightLength > rangeMin;
    if (subsetActive) {
        if (!diff) {
            diff = _deComputeDiff(leftText, rightText, granularity, punctuationMode).diff;
        }
        const { baseSubset, compareSubset } = _deJoinQualifyingSubsetTexts(
            diff, highlightModality, effectiveGranularity, minHighlightLength, linkSplits, ignorePunctuation
        );
        if (baseSubset || compareSubset) {
            const subsetResult = _deSimilarityMetrics(
                baseSubset, compareSubset, granularity, punctuationMode, null
            );
            const subsetDisplay = highlightModality === 'similarities'
                ? subsetResult.percent
                : (100 - subsetResult.percent);
            html += ' (' + _deFormatPercent(subsetDisplay) + '% subset ' + granLabel + ' ' + metricWord + ')';
        }
    }
    html += '</span>';
    return html;
}

/** Maximal consecutive equal-token runs in the full (unfiltered) diff. */
function _deCollectEqualRuns(diff) {
    const runs = [];
    let i = 0;
    while (i < diff.length) {
        if (diff[i].type !== 'equal') {
            i++;
            continue;
        }
        const startIdx = i;
        const values = [];
        while (i < diff.length && diff[i].type === 'equal') {
            values.push(diff[i].value);
            i++;
        }
        runs.push({ startIdx, endIdx: i, values });
    }
    return runs;
}

/**
 * True when separator between two equal runs is one-sided only (all remove or all add),
 * so the matches are contiguous on the other pane.
 */
function _deCanBridgeEqualRuns(diff, leftRun, rightRun) {
    if (leftRun.endIdx >= rightRun.startIdx) return false;
    let sawRemove = false;
    let sawAdd = false;
    for (let i = leftRun.endIdx; i < rightRun.startIdx; i++) {
        const t = diff[i].type;
        if (t === 'equal') return false;
        if (t === 'remove') sawRemove = true;
        else if (t === 'add') sawAdd = true;
    }
    return (sawRemove || sawAdd) && !(sawRemove && sawAdd);
}

function _deBuildCorrespondenceUnits(diff, linkSplits) {
    const runs = _deCollectEqualRuns(diff);
    if (!runs.length) return [];
    if (!linkSplits) {
        return runs.map((run) => ({
            values: run.values.slice(),
            indices: _deRangeIndices(run.startIdx, run.endIdx)
        }));
    }
    const units = [];
    let cluster = [runs[0]];
    for (let r = 1; r < runs.length; r++) {
        if (_deCanBridgeEqualRuns(diff, cluster[cluster.length - 1], runs[r])) {
            cluster.push(runs[r]);
        } else {
            units.push(_deClusterToUnit(cluster));
            cluster = [runs[r]];
        }
    }
    units.push(_deClusterToUnit(cluster));
    return units;
}

function _deRangeIndices(startIdx, endIdx) {
    const indices = [];
    for (let i = startIdx; i < endIdx; i++) indices.push(i);
    return indices;
}

function _deClusterToUnit(cluster) {
    const values = [];
    const indices = [];
    for (const run of cluster) {
        values.push(...run.values);
        for (let i = run.startIdx; i < run.endIdx; i++) indices.push(i);
    }
    return { values, indices };
}

function _deUnitPassesMinLength(unit, effectiveGranularity, minHighlightLength, ignorePunctuation) {
    const len = _deSectionUnitLength({ values: unit.values }, effectiveGranularity, ignorePunctuation);
    if (len <= 0) return false;
    if (!minHighlightLength) return true;
    return len >= minHighlightLength;
}

/** Diff indices of equal tokens that should highlight (shared across both panes). */
function _deQualifyingEqualIndexSet(diff, effectiveGranularity, minHighlightLength, linkSplits, ignorePunctuation) {
    const set = new Set();
    const units = _deBuildCorrespondenceUnits(diff, !!linkSplits);
    for (const unit of units) {
        if (!_deUnitPassesMinLength(unit, effectiveGranularity, minHighlightLength, ignorePunctuation)) continue;
        for (const idx of unit.indices) set.add(idx);
    }
    if (!ignorePunctuation) {
        // Include equal punctuation touching a qualifying match (mirrors difference absorb).
        const seed = [...set];
        for (const idx of seed) {
            let j = idx - 1;
            while (j >= 0 && diff[j].type === 'equal' && _deIsPunctuationToken(diff[j].value)) {
                set.add(j);
                j--;
            }
            j = idx + 1;
            while (j < diff.length && diff[j].type === 'equal' && _deIsPunctuationToken(diff[j].value)) {
                set.add(j);
                j++;
            }
        }
    }
    return set;
}

function _deCollectHighlightSectionLengths(diff, highlightModality, effectiveGranularity, linkSplits, ignorePunctuation) {
    // Always glue punctuation into highlight spans for display continuity; Ignore only
    // affects whether punctuation-only diffs count / get their own highlight.
    const absorbPunctuation = true;
    if (highlightModality === 'similarities') {
        const lengths = [];
        const units = _deBuildCorrespondenceUnits(diff, !!linkSplits);
        for (const unit of units) {
            const len = _deSectionUnitLength({ values: unit.values }, effectiveGranularity, ignorePunctuation);
            if (len > 0) lengths.push(len);
        }
        if (!lengths.length) return { min: 0, max: 0, lengths: [] };
        return { min: Math.min(...lengths), max: Math.max(...lengths), lengths };
    }
    const { baseHighlight, compareHighlight } = _deHighlightTypes(highlightModality);
    const lengths = [];
    const baseGroups = _deGroupConsecutive(diff, ['equal', 'remove'], baseHighlight, absorbPunctuation);
    const compareGroups = _deGroupConsecutive(diff, ['equal', 'add'], compareHighlight, absorbPunctuation);
    for (const group of baseGroups) {
        if (group.type !== baseHighlight) continue;
        const len = _deSectionUnitLength(group, effectiveGranularity, ignorePunctuation);
        if (len > 0) lengths.push(len);
    }
    for (const group of compareGroups) {
        if (group.type !== compareHighlight) continue;
        const len = _deSectionUnitLength(group, effectiveGranularity, ignorePunctuation);
        if (len > 0) lengths.push(len);
    }
    if (!lengths.length) return { min: 0, max: 0, lengths: [] };
    return { min: Math.min(...lengths), max: Math.max(...lengths), lengths };
}

function _deShouldHighlightGroup(group, highlightType, effectiveGranularity, minHighlightLength, ignorePunctuation) {
    if (group.type !== highlightType) return false;
    // Punctuation Highlight: always show punctuation-only difference spans (min length is about words).
    if (!ignorePunctuation && _deIsPunctuationOnlyValues(group.values || [])) return true;
    const len = _deSectionUnitLength(group, effectiveGranularity, ignorePunctuation);
    if (len <= 0) return false;
    if (!minHighlightLength) return true;
    return len >= minHighlightLength;
}

function _deJoinQualifyingSubsetTexts(diff, highlightModality, effectiveGranularity, minHighlightLength, linkSplits, ignorePunctuation) {
    const absorbPunctuation = true;
    if (highlightModality === 'similarities') {
        const parts = [];
        const units = _deBuildCorrespondenceUnits(diff, !!linkSplits);
        for (const unit of units) {
            if (_deUnitPassesMinLength(unit, effectiveGranularity, minHighlightLength, ignorePunctuation)) {
                parts.push(unit.values.join(''));
            }
        }
        const subset = parts.join('');
        return { baseSubset: subset, compareSubset: subset };
    }
    const { baseHighlight, compareHighlight } = _deHighlightTypes(highlightModality);
    const baseGroups = _deGroupConsecutive(diff, ['equal', 'remove'], baseHighlight, absorbPunctuation);
    const compareGroups = _deGroupConsecutive(diff, ['equal', 'add'], compareHighlight, absorbPunctuation);
    const baseParts = [];
    const compareParts = [];
    for (const group of baseGroups) {
        if (_deShouldHighlightGroup(group, baseHighlight, effectiveGranularity, minHighlightLength, ignorePunctuation)) {
            baseParts.push(group.values.join(''));
        }
    }
    for (const group of compareGroups) {
        if (_deShouldHighlightGroup(group, compareHighlight, effectiveGranularity, minHighlightLength, ignorePunctuation)) {
            compareParts.push(group.values.join(''));
        }
    }
    return { baseSubset: baseParts.join(''), compareSubset: compareParts.join('') };
}

function _deEqualSpanHtml(text) {
    return `<span class="dv-diff-equal" style="white-space:pre-wrap;">${_deEscHtml(text)}</span>`;
}

function _deJoinGroupValues(values, effectiveGranularity) {
    if (effectiveGranularity === 'line') return values.join('\n');
    return values.join('');
}

function _deRenderHighlightGroupHtml(group, highlightStyle, text, effectiveGranularity) {
    if (text === '\n') {
        return `<span style="${highlightStyle}">↵</span>\n`;
    }
    if (effectiveGranularity === 'word') {
        const { lead, core, trail } = _deSplitWordHighlightEdges(text);
        // Whitespace-only (or empty-core) diffs still affect LCS % — paint them.
        if (!core) {
            if (!text) return '';
            return `<span style="${highlightStyle}">${_deEscHtml(text)}</span>`;
        }
        let html = '';
        if (lead) html += _deEqualSpanHtml(lead);
        html += `<span style="${highlightStyle}">${_deEscHtml(core)}</span>`;
        if (trail) html += _deEqualSpanHtml(trail);
        return html;
    }
    const trimmed = group.trimTrailing ? _deTrimTrailing(text) : text;
    const trail = group.trimTrailing ? text.slice(trimmed.length) : '';
    return `<span style="${highlightStyle}">${_deEscHtml(trimmed)}</span>${trail ? _deEqualSpanHtml(trail) : ''}`;
}

function _deRenderSideHtml(diff, includeTypes, highlightStyle, highlightType, renderOpts) {
    const minHighlightLength = (renderOpts && renderOpts.minHighlightLength) || 0;
    const effectiveGranularity = (renderOpts && renderOpts.effectiveGranularity) || 'word';
    const ignorePunctuation = !!(renderOpts && renderOpts.ignorePunctuation);
    // Glue punctuation into neighboring highlights for contiguous spans; side-only
    // punct stays add/remove so it never leaks to the opposite pane.
    const groups = _deGroupConsecutive(diff, includeTypes, highlightType, true);
    let html = '';
    groups.forEach((group, gi) => {
        if (gi > 0 && effectiveGranularity === 'line') html += '\n';
        const text = _deJoinGroupValues(group.values, effectiveGranularity);
        if (_deShouldHighlightGroup(group, highlightType, effectiveGranularity, minHighlightLength, ignorePunctuation)) {
            html += _deRenderHighlightGroupHtml(group, highlightStyle, text, effectiveGranularity);
        } else {
            html += _deEqualSpanHtml(text);
        }
    });
    return html;
}

/**
 * Similarities render: highlight only equal tokens in the shared qualifying index set,
 * preserving full-diff run boundaries (no side-filter glue).
 */
function _deRenderSimilaritiesSideHtml(diff, includeTypes, highlightStyle, renderOpts) {
    const effectiveGranularity = (renderOpts && renderOpts.effectiveGranularity) || 'word';
    const ignorePunctuation = !!(renderOpts && renderOpts.ignorePunctuation);
    const qualifying = (renderOpts && renderOpts.qualifyingEqualIndices)
        || _deQualifyingEqualIndexSet(
            diff,
            effectiveGranularity,
            (renderOpts && renderOpts.minHighlightLength) || 0,
            !!(renderOpts && renderOpts.linkSplits),
            ignorePunctuation
        );
    let html = '';
    let pendingValues = [];
    let pendingHighlight = null;
    let emittedGroup = false;

    const flush = () => {
        if (!pendingValues.length || pendingHighlight == null) return;
        if (emittedGroup && effectiveGranularity === 'line') html += '\n';
        const group = { type: 'equal', values: pendingValues, trimTrailing: false };
        const text = _deJoinGroupValues(pendingValues, effectiveGranularity);
        if (pendingHighlight) {
            html += _deRenderHighlightGroupHtml(group, highlightStyle, text, effectiveGranularity);
        } else {
            html += _deEqualSpanHtml(text);
        }
        pendingValues = [];
        pendingHighlight = null;
        emittedGroup = true;
    };

    for (let i = 0; i < diff.length; i++) {
        const item = diff[i];
        if (!includeTypes.includes(item.type)) {
            // Opposite-side-only tokens still bound equal runs — do not glue across them.
            flush();
            continue;
        }
        const shouldHighlight = item.type === 'equal' && qualifying.has(i);
        const isNewline = item.value === '\n';
        if (isNewline) {
            flush();
            if (shouldHighlight) {
                html += _deRenderHighlightGroupHtml(
                    { type: 'equal', values: ['\n'], trimTrailing: false },
                    highlightStyle,
                    '\n',
                    effectiveGranularity
                );
            } else {
                html += _deEqualSpanHtml('\n');
            }
            emittedGroup = true;
            continue;
        }
        if (pendingHighlight === null) {
            pendingHighlight = shouldHighlight;
            pendingValues = [item.value];
            continue;
        }
        if (pendingHighlight === shouldHighlight) {
            pendingValues.push(item.value);
            continue;
        }
        flush();
        pendingHighlight = shouldHighlight;
        pendingValues = [item.value];
    }
    flush();
    return html;
}

function _deRenderBaseHtml(diff, highlightStyle, highlightType, renderOpts) {
    if (highlightType === 'equal') {
        return _deRenderSimilaritiesSideHtml(diff, ['equal', 'remove'], highlightStyle, renderOpts);
    }
    return _deRenderSideHtml(diff, ['equal', 'remove'], highlightStyle, highlightType, renderOpts);
}

function _deRenderCompareHtml(diff, highlightStyle, highlightType, renderOpts) {
    if (highlightType === 'equal') {
        return _deRenderSimilaritiesSideHtml(diff, ['equal', 'add'], highlightStyle, renderOpts);
    }
    return _deRenderSideHtml(diff, ['equal', 'add'], highlightStyle, highlightType, renderOpts);
}

function _deSplitLines(text) {
    return String(text ?? '').split(/\r\n|\r|\n/);
}

function _deDiffUnits(baseText, compareText, granularity) {
    if (granularity === 'line') {
        return {
            a: _deSplitLines(baseText),
            b: _deSplitLines(compareText),
            effectiveGranularity: 'line'
        };
    }
    const isChar = granularity === 'char';
    if (isChar && (baseText.length + compareText.length > DE_CHAR_DIFF_LIMIT)) {
        return { a: _deTokenize(baseText), b: _deTokenize(compareText), effectiveGranularity: 'word' };
    }
    if (isChar) {
        return { a: baseText.split(''), b: compareText.split(''), effectiveGranularity: 'char' };
    }
    const a = _deTokenize(baseText);
    const b = _deTokenize(compareText);
    if (a.length + b.length > DE_WORD_DIFF_TOKEN_LIMIT) {
        Logger.debug('word token count ' + (a.length + b.length) + ' > ' + DE_WORD_DIFF_TOKEN_LIMIT
            + '; keeping word granularity (Line is an explicit choice)');
    }
    return { a, b, effectiveGranularity: 'word' };
}

const plugin = {
    id: 'diff-engine',
    name: 'Diff Engine',
    description: 'Shared LCS diff math and HTML rendering for dashboard diff features',
    _version: '4.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        _deEnsureFleetThemeObserver();
        Context.diffEngine = {
            isFleetDark: _deIsFleetDark,
            getFleetTheme: _deGetFleetTheme,
            onFleetThemeChange: _deOnFleetThemeChange,

            plainPromptHtml(text) {
                return _deEqualSpanHtml(text || '');
            },

            similarityPercent(baseText, compareText, opts) {
                const granularity = (opts && opts.granularity) || 'word';
                const punctuationMode = (opts && opts.punctuationMode) === 'ignore' ? 'ignore' : 'highlight';
                if (opts && opts.bundle) {
                    return {
                        percent: opts.bundle.percent,
                        noDifference: opts.bundle.noDifference,
                        effectiveGranularity: opts.bundle.effectiveGranularity
                    };
                }
                if (opts && typeof opts.percent === 'number' && opts.noDifference != null && opts.effectiveGranularity) {
                    return {
                        percent: opts.percent,
                        noDifference: opts.noDifference,
                        effectiveGranularity: opts.effectiveGranularity
                    };
                }
                const reuse = (opts && opts.diff && opts.effectiveGranularity)
                    ? {
                        effectiveGranularity: opts.effectiveGranularity,
                        lcsLength: opts.lcsLength,
                        unitLenA: opts.unitLenA,
                        unitLenB: opts.unitLenB
                    }
                    : null;
                return _deSimilarityMetrics(
                    baseText || '', compareText || '', granularity, punctuationMode, reuse
                );
            },

            highlightSectionLengthRange(baseText, compareText, opts) {
                const granularity = (opts && opts.granularity) || 'word';
                const highlightModality = (opts && opts.highlightModality) || 'differences';
                const linkSplits = !!(opts && opts.linkSplits);
                const punctuationMode = (opts && opts.punctuationMode) === 'ignore' ? 'ignore' : 'highlight';
                const ignorePunctuation = punctuationMode === 'ignore';
                if (!baseText && !compareText) return { min: 0, max: 0, lengths: [] };
                let diff;
                let effectiveGranularity;
                if (opts && opts.diff && opts.effectiveGranularity) {
                    diff = opts.diff;
                    effectiveGranularity = opts.effectiveGranularity;
                } else if (opts && opts.bundle) {
                    diff = opts.bundle.diff;
                    effectiveGranularity = opts.bundle.effectiveGranularity;
                } else {
                    const computed = _deComputeDiff(
                        baseText || '', compareText || '', granularity, punctuationMode
                    );
                    diff = computed.diff;
                    effectiveGranularity = computed.effectiveGranularity;
                }
                return _deCollectHighlightSectionLengths(
                    diff, highlightModality, effectiveGranularity, linkSplits, ignorePunctuation
                );
            },

            diffBundle(baseText, compareText, opts) {
                return _deDiffBundle(baseText || '', compareText || '', opts || {});
            },

            diffPair(baseText, compareText, opts) {
                const bundle = _deDiffBundle(baseText || '', compareText || '', opts || {});
                return {
                    baseHtml: bundle.baseHtml,
                    compareHtml: bundle.compareHtml,
                    diff: bundle.diff,
                    effectiveGranularity: bundle.effectiveGranularity,
                    percent: bundle.percent,
                    noDifference: bundle.noDifference,
                    lcsLength: bundle.lcsLength,
                    unitLenA: bundle.unitLenA,
                    unitLenB: bundle.unitLenB
                };
            },

            similarityLabelHtml(opts) {
                return _deSimilarityLabelHtml(opts || {});
            }
        };
        Logger.log('module registered (Context.diffEngine)');
    }
};
