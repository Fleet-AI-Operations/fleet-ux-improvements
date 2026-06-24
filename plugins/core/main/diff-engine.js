// diff-engine.js — Shared LCS word/char diff for Diff Viewer and Search Output rolling diff.

const DE_CHAR_DIFF_LIMIT = 15000;
const DE_WORD_DIFF_TOKEN_LIMIT = 4000;

function _deEscHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _dePushTokenStr(tokens, token) {
    if (!token) return;
    if (token === '\n') {
        tokens.push('\n');
        return;
    }
    if (/^[ \t]+$/.test(token)) {
        tokens.push(token);
        return;
    }
    const trailingMatch = token.match(/^(.+?)([ \t]+)$/);
    if (trailingMatch) {
        tokens.push(trailingMatch[1]);
        tokens.push(trailingMatch[2]);
        return;
    }
    tokens.push(token);
}

function _deTokenize(text) {
    const tokens = [];
    let current = '';
    for (const char of text) {
        if (char === '\n') {
            if (current) _dePushTokenStr(tokens, current);
            tokens.push('\n');
            current = '';
        } else if (char === ' ' || char === '\t') {
            current += char;
        } else {
            if (current && (current.endsWith(' ') || current.endsWith('\t'))) {
                _dePushTokenStr(tokens, current);
                current = '';
            }
            current += char;
        }
    }
    if (current) _dePushTokenStr(tokens, current);
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
            diff.unshift({ type: 'equal', value: a[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            diff.unshift({ type: 'add', value: b[j - 1] });
            j--;
        } else {
            diff.unshift({ type: 'remove', value: a[i - 1] });
            i--;
        }
    }
    return diff;
}

function _deComputeWordDiff(oldText, newText) {
    const a = _deTokenize(oldText);
    const b = _deTokenize(newText);
    return _deBacktrack(_deComputeLCS(a, b), a, b);
}

function _deComputeCharDiff(oldText, newText) {
    const a = oldText.split('');
    const b = newText.split('');
    return _deBacktrack(_deComputeLCS(a, b), a, b);
}

function _deIsWhitespaceOnlyValues(values) {
    return values.length > 0 && values.every((v) => /^[ \t]+$/.test(v));
}

function _deCoalesceHighlightGroups(groups, highlightType) {
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
            if (!_deIsWhitespaceOnlyValues(sep.values)) break;
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

function _deGroupConsecutive(diff, includeTypes, highlightType) {
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
    return _deCoalesceHighlightGroups(groups, highlightType);
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

function _deSectionUnitLength(group, granularity) {
    const values = group.values || [];
    if (granularity === 'line') {
        return values.join('').split('\n').filter((line) => line.trim().length > 0).length;
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

function _deComputeDiff(baseText, compareText, granularity) {
    const isChar = granularity === 'char';
    if (isChar && (baseText.length + compareText.length > DE_CHAR_DIFF_LIMIT)) {
        Logger.warn('diff-engine: texts too large for char diff (' + (baseText.length + compareText.length) + ' chars), falling back to word diff');
        return { diff: _deComputeWordDiff(baseText, compareText), effectiveGranularity: 'word' };
    }
    if (isChar) {
        return { diff: _deComputeCharDiff(baseText, compareText), effectiveGranularity: 'char' };
    }
    const { a, b, effectiveGranularity } = _deDiffUnits(baseText, compareText, granularity);
    if (effectiveGranularity === 'line') {
        return { diff: _deBacktrack(_deComputeLCS(a, b), a, b), effectiveGranularity: 'line' };
    }
    return { diff: _deComputeWordDiff(baseText, compareText), effectiveGranularity: effectiveGranularity };
}

function _deCollectHighlightSectionLengths(diff, highlightModality, effectiveGranularity) {
    const { baseHighlight, compareHighlight } = _deHighlightTypes(highlightModality);
    const lengths = [];
    const baseGroups = _deGroupConsecutive(diff, ['equal', 'remove'], baseHighlight);
    const compareGroups = _deGroupConsecutive(diff, ['equal', 'add'], compareHighlight);
    for (const group of baseGroups) {
        if (group.type !== baseHighlight) continue;
        const len = _deSectionUnitLength(group, effectiveGranularity);
        if (len > 0) lengths.push(len);
    }
    for (const group of compareGroups) {
        if (group.type !== compareHighlight) continue;
        const len = _deSectionUnitLength(group, effectiveGranularity);
        if (len > 0) lengths.push(len);
    }
    if (!lengths.length) return { min: 0, max: 0, lengths: [] };
    return { min: Math.min(...lengths), max: Math.max(...lengths), lengths };
}

function _deShouldHighlightGroup(group, highlightType, effectiveGranularity, minHighlightLength) {
    if (group.type !== highlightType) return false;
    if (!minHighlightLength) return true;
    const len = _deSectionUnitLength(group, effectiveGranularity);
    return len > 0 && len >= minHighlightLength;
}

function _deJoinQualifyingSubsetTexts(diff, highlightModality, effectiveGranularity, minHighlightLength) {
    const { baseHighlight, compareHighlight } = _deHighlightTypes(highlightModality);
    const baseGroups = _deGroupConsecutive(diff, ['equal', 'remove'], baseHighlight);
    const compareGroups = _deGroupConsecutive(diff, ['equal', 'add'], compareHighlight);
    const baseParts = [];
    const compareParts = [];
    for (const group of baseGroups) {
        if (_deShouldHighlightGroup(group, baseHighlight, effectiveGranularity, minHighlightLength)) {
            baseParts.push(group.values.join(''));
        }
    }
    for (const group of compareGroups) {
        if (_deShouldHighlightGroup(group, compareHighlight, effectiveGranularity, minHighlightLength)) {
            compareParts.push(group.values.join(''));
        }
    }
    return { baseSubset: baseParts.join(''), compareSubset: compareParts.join('') };
}

function _deEqualSpanHtml(text) {
    return `<span class="dv-diff-equal">${_deEscHtml(text)}</span>`;
}

function _deHighlightStyles() {
    const dark = document.documentElement.classList.contains('dark');
    const removeBg = dark ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.3)';
    const addBg = dark ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.3)';
    const equalBg = 'rgba(250,215,50,0.4)';
    const span = 'border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;';
    return {
        remove: `background-color:${removeBg};${span}`,
        add: `background-color:${addBg};${span}`,
        equal: `background-color:${equalBg};${span}`
    };
}

function _deRenderHighlightGroupHtml(group, highlightStyle, text, effectiveGranularity) {
    if (text === '\n') {
        return `<span style="${highlightStyle}">↵</span>\n`;
    }
    if (effectiveGranularity === 'word') {
        const { lead, core, trail } = _deSplitWordHighlightEdges(text);
        if (!core) return _deEqualSpanHtml(text);
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

function _deRenderBaseHtml(diff, highlightStyle, highlightType, renderOpts) {
    const minHighlightLength = (renderOpts && renderOpts.minHighlightLength) || 0;
    const effectiveGranularity = (renderOpts && renderOpts.effectiveGranularity) || 'word';
    const groups = _deGroupConsecutive(diff, ['equal', 'remove'], highlightType);
    let html = '';
    groups.forEach((group) => {
        const text = group.values.join('');
        if (_deShouldHighlightGroup(group, highlightType, effectiveGranularity, minHighlightLength)) {
            html += _deRenderHighlightGroupHtml(group, highlightStyle, text, effectiveGranularity);
        } else {
            html += _deEqualSpanHtml(text);
        }
    });
    return html;
}

function _deRenderCompareHtml(diff, highlightStyle, highlightType, renderOpts) {
    const minHighlightLength = (renderOpts && renderOpts.minHighlightLength) || 0;
    const effectiveGranularity = (renderOpts && renderOpts.effectiveGranularity) || 'word';
    const groups = _deGroupConsecutive(diff, ['equal', 'add'], highlightType);
    let html = '';
    groups.forEach((group) => {
        const text = group.values.join('');
        if (_deShouldHighlightGroup(group, highlightType, effectiveGranularity, minHighlightLength)) {
            html += _deRenderHighlightGroupHtml(group, highlightStyle, text, effectiveGranularity);
        } else {
            html += _deEqualSpanHtml(text);
        }
    });
    return html;
}

function _deFormatPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    if (n < 1) return (Math.round(n * 100) / 100).toFixed(2);
    return String(Math.round(n));
}

function _deDiffUnits(baseText, compareText, granularity) {
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
        Logger.debug('diff-engine: word token count ' + (a.length + b.length) + ' > ' + DE_WORD_DIFF_TOKEN_LIMIT + '; falling back to line diff');
        const aLines = baseText.split('\n');
        const bLines = compareText.split('\n');
        return { a: aLines, b: bLines, effectiveGranularity: 'line' };
    }
    return { a, b, effectiveGranularity: 'word' };
}

const plugin = {
    id: 'diff-engine',
    name: 'Diff Engine',
    description: 'Shared LCS diff math and HTML rendering for dashboard diff features',
    _version: '2.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        Context.diffEngine = {
            plainPromptHtml(text) {
                return _deEqualSpanHtml(text || '');
            },

            similarityPercent(baseText, compareText, opts) {
                const granularity = (opts && opts.granularity) || 'word';
                const { a, b, effectiveGranularity } = _deDiffUnits(baseText, compareText, granularity);
                if (baseText === compareText) {
                    return { percent: 100, noDifference: true, effectiveGranularity };
                }
                if (a.length === 0 && b.length === 0) {
                    return { percent: 100, noDifference: true, effectiveGranularity };
                }
                const dp = _deComputeLCS(a, b);
                const lcs = dp[a.length][b.length];
                const percent = (2 * lcs / (a.length + b.length)) * 100;
                return { percent, noDifference: false, effectiveGranularity };
            },

            highlightSectionLengthRange(baseText, compareText, opts) {
                const granularity = (opts && opts.granularity) || 'word';
                const highlightModality = (opts && opts.highlightModality) || 'differences';
                if (!baseText && !compareText) return { min: 0, max: 0, lengths: [] };
                const { diff, effectiveGranularity } = _deComputeDiff(baseText || '', compareText || '', granularity);
                return _deCollectHighlightSectionLengths(diff, highlightModality, effectiveGranularity);
            },

            diffPair(baseText, compareText, opts) {
                const granularity = (opts && opts.granularity) || 'word';
                const showHighlights = opts && opts.showHighlights !== false;
                const highlightModality = (opts && opts.highlightModality) || 'differences';
                const minHighlightLength = (opts && opts.minHighlightLength) || 0;
                if (!showHighlights) {
                    return {
                        baseHtml: _deEqualSpanHtml(baseText || ''),
                        compareHtml: _deEqualSpanHtml(compareText || '')
                    };
                }
                const { baseHighlight, compareHighlight } = _deHighlightTypes(highlightModality);
                const styles = _deHighlightStyles();
                const { diff, effectiveGranularity } = _deComputeDiff(baseText || '', compareText || '', granularity);
                const renderOpts = { minHighlightLength, effectiveGranularity };
                return {
                    baseHtml: _deRenderBaseHtml(diff, styles[baseHighlight], baseHighlight, renderOpts),
                    compareHtml: _deRenderCompareHtml(diff, styles[compareHighlight], compareHighlight, renderOpts)
                };
            },

            similarityLabelHtml(opts) {
                const showHighlights = opts && opts.showHighlights !== false;
                if (!showHighlights) return '';
                const leftText = (opts && opts.leftText) || '';
                const rightText = (opts && opts.rightText) || '';
                if (!leftText && !rightText) return '';
                const granularity = (opts && opts.granularity) || 'word';
                const highlightModality = (opts && opts.highlightModality) || 'differences';
                const minHighlightLength = (opts && opts.minHighlightLength) || 0;
                const lengthRange = (opts && opts.lengthRange) || null;
                const { percent, noDifference, effectiveGranularity } = this.similarityPercent(leftText, rightText, { granularity });
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
                    const { diff } = _deComputeDiff(leftText, rightText, granularity);
                    const { baseSubset, compareSubset } = _deJoinQualifyingSubsetTexts(
                        diff, highlightModality, effectiveGranularity, minHighlightLength
                    );
                    if (baseSubset || compareSubset) {
                        const subsetResult = this.similarityPercent(baseSubset, compareSubset, { granularity });
                        const subsetDisplay = highlightModality === 'similarities'
                            ? subsetResult.percent
                            : (100 - subsetResult.percent);
                        html += ' (' + _deFormatPercent(subsetDisplay) + '% subset ' + granLabel + ' ' + metricWord + ')';
                    }
                }
                html += '</span>';
                return html;
            }
        };
        Logger.log('diff-engine: module registered (Context.diffEngine)');
    }
};
