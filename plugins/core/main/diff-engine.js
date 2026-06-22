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
    return groups;
}

function _deTrimTrailing(str) { return str.replace(/[ \t]+$/, ''); }

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

function _deRenderBaseHtml(diff, highlightStyle, highlightType) {
    const groups = _deGroupConsecutive(diff, ['equal', 'remove'], highlightType);
    let html = '';
    groups.forEach((group) => {
        const text = group.values.join('');
        if (group.type === highlightType) {
            if (text === '\n') {
                html += `<span style="${highlightStyle}">↵</span>\n`;
            } else {
                const trimmed = group.trimTrailing ? _deTrimTrailing(text) : text;
                const trail = group.trimTrailing ? text.slice(trimmed.length) : '';
                html += `<span style="${highlightStyle}">${_deEscHtml(trimmed)}</span>${trail ? _deEqualSpanHtml(trail) : ''}`;
            }
        } else {
            html += _deEqualSpanHtml(text);
        }
    });
    return html;
}

function _deRenderCompareHtml(diff, highlightStyle, highlightType) {
    const groups = _deGroupConsecutive(diff, ['equal', 'add'], highlightType);
    let html = '';
    groups.forEach((group) => {
        const text = group.values.join('');
        if (group.type === highlightType) {
            if (text === '\n') {
                html += `<span style="${highlightStyle}">↵</span>\n`;
            } else {
                const trimmed = group.trimTrailing ? _deTrimTrailing(text) : text;
                const trail = group.trimTrailing ? text.slice(trimmed.length) : '';
                html += `<span style="${highlightStyle}">${_deEscHtml(trimmed)}</span>${trail ? _deEqualSpanHtml(trail) : ''}`;
            }
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
    _version: '1.2',
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

            diffPair(baseText, compareText, opts) {
                const granularity = (opts && opts.granularity) || 'word';
                const showHighlights = opts && opts.showHighlights !== false;
                const highlightModality = (opts && opts.highlightModality) || 'differences';
                if (!showHighlights) {
                    return {
                        baseHtml: _deEqualSpanHtml(baseText || ''),
                        compareHtml: _deEqualSpanHtml(compareText || '')
                    };
                }
                const similarities = highlightModality === 'similarities';
                const baseHighlight = similarities ? 'equal' : 'remove';
                const compareHighlight = similarities ? 'equal' : 'add';
                const styles = _deHighlightStyles();
                const isChar = granularity === 'char';
                if (isChar && (baseText.length + compareText.length > DE_CHAR_DIFF_LIMIT)) {
                    Logger.warn('diff-engine: texts too large for char diff (' + (baseText.length + compareText.length) + ' chars), falling back to word diff');
                    const diff = _deComputeWordDiff(baseText, compareText);
                    return {
                        baseHtml: _deRenderBaseHtml(diff, styles[baseHighlight], baseHighlight),
                        compareHtml: _deRenderCompareHtml(diff, styles[compareHighlight], compareHighlight)
                    };
                }
                const diff = isChar ? _deComputeCharDiff(baseText, compareText) : _deComputeWordDiff(baseText, compareText);
                return {
                    baseHtml: _deRenderBaseHtml(diff, styles[baseHighlight], baseHighlight),
                    compareHtml: _deRenderCompareHtml(diff, styles[compareHighlight], compareHighlight)
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
                const { percent, noDifference, effectiveGranularity } = this.similarityPercent(leftText, rightText, { granularity });
                const granLabel = effectiveGranularity === 'char' ? 'char' : 'word';
                if (noDifference) {
                    return '<span class="dv-slot-above-label-nodiff">NO DIFFERENCE</span>';
                }
                const displayPercent = highlightModality === 'similarities' ? percent : (100 - percent);
                const formatted = _deFormatPercent(displayPercent);
                if (highlightModality === 'similarities') {
                    return '<span class="dv-slot-above-label-sim">' + formatted + '% ' + granLabel + ' similarity</span>';
                }
                return '<span class="dv-slot-above-label-sim">' + formatted + '% ' + granLabel + ' difference</span>';
            }
        };
        Logger.log('diff-engine: module registered (Context.diffEngine)');
    }
};
