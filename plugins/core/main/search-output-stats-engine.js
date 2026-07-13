// search-output-stats-engine.js — Worker Output Search stats dashboard catalog, aggregation, persistence

const STATS_LAYOUT_STORAGE_KEY = 'fleet-ux:dash-stats-dashboard';
const STATS_LAYOUT_SCHEMA_VERSION = 7;
const STATS_MAX_DASHBOARDS = 5;

const STATS_DEFAULT_LAYOUT_JSON = '{"schemaVersion":5,"charts":[{"id":"chart-mr9if575-n0g8zx2","title":"Current Task Status","type":"pie","groupBy":"statuses","series":[{"metricId":"count","agg":"count","label":"Count"}],"height":220,"presetKey":"status","chartFilters":{"teamIds":[],"projectIds":[],"envKeys":[],"statuses":[],"contributorIds":[],"promptRatings":[],"taskIssues":[],"returnTypes":[],"promptHistory":[],"qaHelpfulness":[],"v1CreationTimeMinutes":[],"qaTimeMinutes":[],"disputeResolutionTimeMinutes":[]}},{"id":"chart-mr9l3yl0-ne9fwit","title":"Return Reasons","type":"polarArea","groupBy":"taskIssues","series":[{"metricId":"count","agg":"count","label":""}],"height":140,"presetKey":null,"chartFilters":{"teamIds":[],"projectIds":[],"envKeys":[],"statuses":[],"contributorIds":[],"promptRatings":[],"taskIssues":[],"returnTypes":[],"promptHistory":["returned"],"qaHelpfulness":[],"v1CreationTimeMinutes":[],"qaTimeMinutes":[],"disputeResolutionTimeMinutes":[]}},{"id":"chart-mr9mmfih-7eeey9y","title":"Avg # Task Versions/Workflow Time vs Environment","type":"barLine","groupBy":"envKeys","series":[{"metricId":"prompt_version_count","agg":"avg","label":"Avg Task Versions","renderAs":"bar","yAxis":"y","segmentBy":null},{"metricId":"v1_creation_time_minutes","agg":"avg","label":"Avg v1 Time (mins)","renderAs":"line","yAxis":"y1","lineStyle":"line"},{"metricId":"qa_time_minutes","agg":"avg","label":"Avg QA Time (mins)","renderAs":"line","yAxis":"y1","lineStyle":"line"}],"height":280,"presetKey":null,"barLayout":"grouped","orientation":"vertical","lineAreaLayout":"origin","categorySort":{"seriesIndex":0,"direction":"desc"},"chartFilters":{"teamIds":[],"projectIds":[],"envKeys":[],"statuses":[],"contributorIds":[],"promptRatings":[],"taskIssues":[],"returnTypes":[],"promptHistory":[],"qaHelpfulness":[],"v1CreationTimeMinutes":[],"qaTimeMinutes":[],"disputeResolutionTimeMinutes":[]}},{"id":"chart-mr9n8ud7-liveetc","title":"Count of Tasks by Env vs Current Status","type":"barLine","groupBy":"envKeys","series":[{"metricId":"count","agg":"count","label":"","renderAs":"bar","yAxis":"y","segmentBy":"statuses"}],"height":320,"presetKey":null,"barLayout":"stacked","orientation":"horizontal","lineAreaLayout":"origin","categorySort":{"seriesIndex":0,"direction":"desc"},"chartFilters":{"teamIds":[],"projectIds":[],"envKeys":[],"statuses":[],"contributorIds":[],"promptRatings":[],"taskIssues":[],"returnTypes":[],"promptHistory":[],"qaHelpfulness":[],"v1CreationTimeMinutes":[],"qaTimeMinutes":[],"disputeResolutionTimeMinutes":[]}},{"id":"chart-mr9y70g0-qrk1ewp","title":"Tasks by Week and Status vs Avg v1 Creation Time","type":"barLine","groupBy":"taskCreatedWeek","series":[{"metricId":"count","agg":"count","label":"","renderAs":"bar","yAxis":"y","segmentBy":"statuses"},{"metricId":"v1_creation_time_minutes","agg":"avg","label":"","renderAs":"line","yAxis":"y1","lineStyle":"shaded","segmentBy":null}],"height":320,"presetKey":null,"barLayout":"stacked","orientation":"vertical","lineAreaLayout":"origin","categorySort":null,"chartFilters":{"teamIds":[],"projectIds":[],"envKeys":[],"statuses":[],"contributorIds":[],"promptRatings":[],"taskIssues":[],"returnTypes":[],"promptHistory":[],"qaHelpfulness":[],"v1CreationTimeMinutes":[],"qaTimeMinutes":[],"disputeResolutionTimeMinutes":[]}}]}';

const STATS_TASK_POINT_CAP = 500;

const STATS_DIMENSION_DEFS = [
    { key: 'teamIds', optionsKey: 'teams', scopeKey: 'filter-teams', kind: 'task' },
    { key: 'projectIds', optionsKey: 'projects', scopeKey: 'filter-projects', kind: 'task' },
    { key: 'envKeys', optionsKey: 'envs', scopeKey: 'filter-envs', kind: 'task' },
    { key: 'statuses', optionsKey: 'statuses', scopeKey: 'filter-statuses', kind: 'task' },
    { key: 'contributorIds', optionsKey: 'contributors', scopeKey: 'filter-contributors', kind: 'task' },
    { key: 'promptRatings', optionsKey: 'promptRatings', scopeKey: 'filter-prompt-ratings', kind: 'task' },
    { key: 'taskIssues', optionsKey: 'taskIssues', scopeKey: 'filter-task-issues', kind: 'task' },
    { key: 'returnTypes', optionsKey: 'returnTypes', scopeKey: 'filter-return-types', kind: 'task' },
    { key: 'promptHistory', optionsKey: 'promptHistory', scopeKey: 'filter-prompt-history', kind: 'item' },
    { key: 'sessionQaOutcomes', optionsKey: 'sessionQaOutcomes', scopeKey: 'filter-session-qa-outcome', kind: 'item' },
    { key: 'disputeOutcomes', optionsKey: 'disputeOutcomes', scopeKey: 'filter-dispute-outcome', kind: 'item' },
    { key: 'srReviewOutcomes', optionsKey: 'srReviewOutcomes', scopeKey: 'filter-sr-review-outcome', kind: 'item' },
    { key: 'qaHelpfulness', optionsKey: 'qaHelpfulness', scopeKey: 'filter-qa-helpfulness', kind: 'item' },
    { key: 'v1CreationTimeMinutes', optionsKey: 'v1CreationTimeMinutes', scopeKey: 'filter-v1-creation-time', kind: 'item-bucket' },
    { key: 'qaTimeMinutes', optionsKey: 'qaTimeMinutes', scopeKey: 'filter-qa-time', kind: 'item-bucket' },
    { key: 'disputeResolutionTimeMinutes', optionsKey: 'disputeResolutionTimeMinutes', scopeKey: 'filter-dispute-resolution-time', kind: 'item-bucket' }
];

const STATS_CHART_FILTER_KEYS = STATS_DIMENSION_DEFS.map((d) => d.key);

const STATS_DYNAMIC_DIMENSION = {
    key: 'promptVersionCount',
    optionsKey: 'promptVersionCount',
    scopeKey: 'stats-prompt-version-count',
    label: 'Unique task versions'
};

const STATS_TIME_GROUP_DIMENSIONS = [
    { key: 'taskCreatedYear', granularity: 'year', label: 'Task created (year)' },
    { key: 'taskCreatedMonth', granularity: 'month', label: 'Task created (month)' },
    { key: 'taskCreatedWeek', granularity: 'week', label: 'Task created (week)' },
    { key: 'taskCreatedDay', granularity: 'day', label: 'Task created (day)' }
];

const STATS_METRIC_LABELS = {
    count: 'Count of results',
    prompt_version_count: 'Unique task versions'
};

const STATS_AGGREGATIONS = [
    { id: 'count', label: 'Count' },
    { id: 'avg', label: 'Average' },
    { id: 'sum', label: 'Sum' },
    { id: 'min', label: 'Min' },
    { id: 'max', label: 'Max' },
    { id: 'median', label: 'Median' },
    { id: 'mode', label: 'Mode' },
    { id: 'stddev', label: 'Std dev' }
];

const STATS_SCORECARD_GROUP_BY = '__scope__';
const STATS_ALL_GROUP_BY = '__all__';

const STATS_LEGACY_BAR_LINE_TYPES = new Set(['bar', 'line', 'combo']);

const STATS_CHART_TYPE_META = {
    scorecard: { id: 'scorecard', label: 'Scorecard', minSeries: 1, maxSeries: 1, allowCountAxis: true, skipGroupBy: true, defaultHeight: 120, allowsHorizontalStack: true },
    pie: { id: 'pie', label: 'Pie', minSeries: 1, maxSeries: 1, allowCountAxis: true, allowsHorizontalStack: true },
    barLine: {
        id: 'barLine',
        label: 'Bar/Line',
        minSeries: 1,
        maxSeries: 4,
        allowCountAxis: true,
        needsRenderAs: true,
        needsDualAxis: true,
        needsBarLayout: true,
        needsLineAreaLayout: true,
        needsOrientation: true
    },
    polarArea: { id: 'polarArea', label: 'Polar area', minSeries: 1, maxSeries: 1, allowCountAxis: true, allowsHorizontalStack: true },
    radar: { id: 'radar', label: 'Radar', minSeries: 1, maxSeries: 6, allowCountAxis: true, allowsHorizontalStack: true },
    scatter: { id: 'scatter', label: 'Scatter', minSeries: 2, maxSeries: 2, allowCountAxis: false, needsPointMode: true },
    bubble: { id: 'bubble', label: 'Bubble', minSeries: 2, maxSeries: 3, allowCountAxis: false, needsPointMode: true },
    histogram: {
        id: 'histogram',
        label: 'Histogram',
        minSeries: 1,
        maxSeries: 1,
        allowCountAxis: false,
        skipGroupBy: true,
        skipAggregation: true,
        defaultHeight: 220
    },
    bellCurve: {
        id: 'bellCurve',
        label: 'Bell curve',
        minSeries: 1,
        maxSeries: 1,
        allowCountAxis: false,
        skipGroupBy: true,
        skipAggregation: true,
        defaultHeight: 260
    }
};

const STATS_CHART_TYPES = Object.values(STATS_CHART_TYPE_META);

const STATS_CHART_HEIGHT_MIN = 80;
const STATS_CHART_HEIGHT_MAX = 600;
const STATS_CHART_HEIGHT_STEP = 40;
const STATS_CHART_HEIGHT_DEFAULT = 200;

function statsNormalizeChartHeight(raw, fallback) {
    const defaultFallback = Number.isFinite(Number(fallback))
        ? Number(fallback)
        : STATS_CHART_HEIGHT_DEFAULT;
    let height = Number(raw);
    if (!Number.isFinite(height)) height = defaultFallback;
    height = Math.min(STATS_CHART_HEIGHT_MAX, Math.max(STATS_CHART_HEIGHT_MIN, height));
    return Math.round(height / STATS_CHART_HEIGHT_STEP) * STATS_CHART_HEIGHT_STEP;
}

function statsNewChartId() {
    return 'chart-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function statsNewDashboardId() {
    return 'dash-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function statsLegacyChartType(type) {
    const t = type != null ? String(type) : '';
    return STATS_LEGACY_BAR_LINE_TYPES.has(t) ? t : null;
}

function statsNormalizeChartType(type) {
    if (STATS_LEGACY_BAR_LINE_TYPES.has(type)) return 'barLine';
    return STATS_CHART_TYPE_META[type] ? type : 'pie';
}

function statsGetChartTypeMeta(type) {
    return STATS_CHART_TYPE_META[statsNormalizeChartType(type)] || STATS_CHART_TYPE_META.pie;
}

function statsNormalizeBarLayout(raw) {
    return raw === 'stacked' ? 'stacked' : 'grouped';
}

function statsNormalizeLineStyle(raw) {
    return raw === 'shaded' ? 'shaded' : 'line';
}

function statsNormalizeOrientation(raw) {
    return raw === 'horizontal' ? 'horizontal' : 'vertical';
}

function statsNormalizeLineAreaLayout(raw) {
    return raw === 'stacked' ? 'stacked' : 'origin';
}

function statsNormalizeLabelFormat(raw) {
    if (raw === 'percent' || raw === 'both') return raw;
    return 'absolute';
}

function statsNormalizeLabelsAlwaysVisible(raw) {
    return raw === true || raw === 'true' || raw === 1 || raw === '1';
}

function statsNormalizeLabelsShowName(raw) {
    return raw === true || raw === 'true' || raw === 1 || raw === '1';
}

function statsNormalizeBoolFlag(raw, fallback) {
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
    return !!fallback;
}

function statsLabelFormatFromShowFlags(showAbsolute, showPercent) {
    if (showAbsolute && showPercent) return 'both';
    if (showPercent && !showAbsolute) return 'percent';
    return 'absolute';
}

function statsLabelShowFlagsFromSeries(seriesEntry, legacyChart) {
    const s = seriesEntry || {};
    const hasSeriesAbs = Object.prototype.hasOwnProperty.call(s, 'labelShowAbsolute');
    const hasSeriesPct = Object.prototype.hasOwnProperty.call(s, 'labelShowPercent');
    const hasSeriesName = Object.prototype.hasOwnProperty.call(s, 'labelsShowName');
    const hasSeriesAlways = Object.prototype.hasOwnProperty.call(s, 'labelsAlwaysVisible');
    const legacy = legacyChart ? statsLabelShowFlagsFromChart(legacyChart) : {
        showAbsolute: true,
        showPercent: false,
        showName: false
    };
    const legacyAlways = legacyChart
        ? statsNormalizeLabelsAlwaysVisible(legacyChart.labelsAlwaysVisible)
        : false;
    const format = statsNormalizeLabelFormat(s.labelFormat);
    const fromFormat = {
        showAbsolute: format === 'absolute' || format === 'both',
        showPercent: format === 'percent' || format === 'both'
    };
    const showAbsolute = hasSeriesAbs
        ? statsNormalizeBoolFlag(s.labelShowAbsolute, fromFormat.showAbsolute)
        : (Object.prototype.hasOwnProperty.call(s, 'labelFormat') ? fromFormat.showAbsolute : legacy.showAbsolute);
    const showPercent = hasSeriesPct
        ? statsNormalizeBoolFlag(s.labelShowPercent, fromFormat.showPercent)
        : (Object.prototype.hasOwnProperty.call(s, 'labelFormat') ? fromFormat.showPercent : legacy.showPercent);
    return {
        showAbsolute,
        showPercent,
        showName: hasSeriesName
            ? statsNormalizeLabelsShowName(s.labelsShowName)
            : legacy.showName,
        alwaysVisible: hasSeriesAlways
            ? statsNormalizeLabelsAlwaysVisible(s.labelsAlwaysVisible)
            : legacyAlways
    };
}

/** @deprecated Prefer statsLabelShowFlagsFromSeries; kept for legacy chart-level migration. */
function statsLabelShowFlagsFromChart(c) {
    const format = statsNormalizeLabelFormat(c && c.labelFormat);
    const fromFormat = {
        showAbsolute: format === 'absolute' || format === 'both',
        showPercent: format === 'percent' || format === 'both'
    };
    const hasAbsKey = c && Object.prototype.hasOwnProperty.call(c, 'labelShowAbsolute');
    const hasPctKey = c && Object.prototype.hasOwnProperty.call(c, 'labelShowPercent');
    return {
        showAbsolute: hasAbsKey
            ? statsNormalizeBoolFlag(c.labelShowAbsolute, fromFormat.showAbsolute)
            : fromFormat.showAbsolute,
        showPercent: hasPctKey
            ? statsNormalizeBoolFlag(c.labelShowPercent, fromFormat.showPercent)
            : fromFormat.showPercent,
        showName: statsNormalizeLabelsShowName(c && c.labelsShowName)
    };
}

function statsChartHasAnyAlwaysVisibleLabels(chart) {
    if (!chart || !statsChartSupportsLabelOptions(chart.type)) return false;
    return (chart.series || []).some((s) => s && s.labelsAlwaysVisible);
}

function statsApplySeriesLabelFlags(entry, seriesSrc, chartType, legacyChart) {
    if (!statsChartSupportsLabelOptions(chartType)) return entry;
    const flags = statsLabelShowFlagsFromSeries(seriesSrc, legacyChart);
    entry.labelShowAbsolute = flags.showAbsolute;
    entry.labelShowPercent = flags.showPercent;
    entry.labelsShowName = flags.showName;
    entry.labelsAlwaysVisible = flags.alwaysVisible;
    entry.labelFormat = statsLabelFormatFromShowFlags(flags.showAbsolute, flags.showPercent);
    return entry;
}

function statsDefaultSeriesLabelFlags() {
    return {
        labelShowAbsolute: true,
        labelShowPercent: false,
        labelsShowName: false,
        labelsAlwaysVisible: false,
        labelFormat: 'absolute'
    };
}

function statsChartSupportsLabelOptions(type) {
    const t = statsNormalizeChartType(type);
    return t === 'pie' || t === 'polarArea' || t === 'radar' || t === 'barLine' || t === 'histogram';
}

function statsNormalizeSpread(raw) {
    return raw === 'stddevBand' ? 'stddevBand' : 'none';
}

function statsSeriesSpreadAllowed(chartType, seriesEntry) {
    if (statsNormalizeChartType(chartType) !== 'barLine') return false;
    if (String(seriesEntry.agg || '') !== 'avg') return false;
    if (seriesEntry.segmentBy) return false;
    return true;
}

function statsNormalizeCategorySort(raw, seriesCount) {
    if (!raw || typeof raw !== 'object') return null;
    const seriesIndex = Number(raw.seriesIndex);
    if (!Number.isInteger(seriesIndex) || seriesIndex < 0 || seriesIndex >= seriesCount) return null;
    return {
        seriesIndex,
        direction: raw.direction === 'desc' ? 'desc' : 'asc'
    };
}

function statsNormalizeSegmentBy(raw, groupBy) {
    const v = raw != null ? String(raw).trim() : '';
    if (!v || v === groupBy) return null;
    return v;
}

function statsSeriesAllowsSegment(chartType, seriesEntry) {
    const type = statsNormalizeChartType(chartType);
    if (type !== 'barLine') return false;
    if (seriesEntry.renderAs === 'line') {
        return seriesEntry.lineStyle === 'shaded';
    }
    return true;
}

function statsSeriesSegmentBy(seriesEntry, chartType) {
    if (!statsSeriesAllowsSegment(chartType, seriesEntry)) return null;
    return statsNormalizeSegmentBy(seriesEntry.segmentBy, null);
}

function statsSegmentByDimensionLabel(dimKey) {
    const timeDef = STATS_TIME_GROUP_DIMENSIONS.find((d) => d.key === dimKey);
    if (timeDef) return timeDef.label;
    if (dimKey === STATS_DYNAMIC_DIMENSION.key) return STATS_DYNAMIC_DIMENSION.label;
    return dimKey;
}

function statsSplitRowHasData(row) {
    if (!row) return false;
    for (const vals of row.values()) {
        if (vals && vals.length) return true;
    }
    return false;
}

function statsNormalizePointMode(mode) {
    return mode === 'task' ? 'task' : 'bucket';
}

function statsNormalizeYAxis(value) {
    return value === 'y1' ? 'y1' : 'y';
}

function statsDefaultSeriesYAxis(chartType, seriesIndex, renderAs) {
    const type = statsNormalizeChartType(chartType);
    if (type === 'barLine') {
        return renderAs === 'line' ? 'y1' : 'y';
    }
    return seriesIndex === 0 ? 'y' : 'y';
}

function statsEmptyChartFilters() {
    return Object.fromEntries(STATS_CHART_FILTER_KEYS.map((key) => [key, []]));
}

function statsNormalizeChartFilters(raw, listBounds) {
    const bounds = listBounds || {};
    const out = statsEmptyChartFilters();
    const src = raw && typeof raw === 'object' ? raw : {};
    for (const key of STATS_CHART_FILTER_KEYS) {
        const boundIds = new Set(bounds[key] || []);
        const selected = Array.isArray(src[key]) ? src[key] : [];
        out[key] = selected
            .map((id) => String(id))
            .filter((id) => !boundIds.size || boundIds.has(id));
    }
    return out;
}

function statsChartFiltersActive(chartFilters, listBounds) {
    const lib = Context.dashboardLib;
    const isUnrestricted = lib && typeof lib.isDimensionUnrestricted === 'function'
        ? lib.isDimensionUnrestricted.bind(lib)
        : null;
    if (!isUnrestricted) return false;
    const filters = chartFilters || {};
    const bounds = listBounds || {};
    for (const key of STATS_CHART_FILTER_KEYS) {
        const selected = filters[key] || [];
        const optionCount = (bounds[key] || []).length;
        if (selected.length > 0 && !isUnrestricted(selected, optionCount)) {
            return true;
        }
    }
    return false;
}

function statsFilterItemsForChart(items, chart, ctx) {
    const listBounds = (ctx && ctx.listBounds) || {};
    const chartFilters = statsNormalizeChartFilters(chart && chart.chartFilters, listBounds);
    if (!statsChartFiltersActive(chartFilters, listBounds)) {
        return items || [];
    }
    const lib = Context.dashboardLib;
    if (!lib || typeof lib.applyClientWorkerOutputFilters !== 'function') {
        return items || [];
    }
    const sortContext = {
        helpfulnessUi: (ctx && ctx.helpfulnessUi) || {},
        currentUserId: (ctx && ctx.currentUserId) || '',
        sessionQaUi: (ctx && ctx.sessionQaUi) || {}
    };
    return lib.applyClientWorkerOutputFilters(items || [], chartFilters, listBounds, sortContext);
}

function statsNormalizeSeriesEntry(s, chartType, seriesIndex, groupBy, legacySourceType, legacyChart) {
    const meta = statsGetChartTypeMeta(chartType);
    let renderAs = s.renderAs === 'line' ? 'line' : 'bar';
    if (legacySourceType === 'line') renderAs = 'line';
    else if (legacySourceType === 'bar') renderAs = 'bar';
    const entry = {
        metricId: String(s.metricId || 'count'),
        agg: String(s.agg || 'count'),
        label: s.label != null ? String(s.label) : ''
    };
    if (meta.needsRenderAs) {
        entry.renderAs = renderAs;
    }
    if (meta.needsDualAxis) {
        entry.yAxis = s.yAxis != null
            ? statsNormalizeYAxis(s.yAxis)
            : statsDefaultSeriesYAxis(chartType, seriesIndex || 0, meta.needsRenderAs ? renderAs : null);
    }
    if (renderAs === 'line' && meta.needsLineAreaLayout) {
        entry.lineStyle = statsNormalizeLineStyle(s.lineStyle);
    }
    if (statsSeriesAllowsSegment(chartType, entry)) {
        const segmentRaw = s.segmentBy != null ? s.segmentBy : s.splitBy;
        entry.segmentBy = statsNormalizeSegmentBy(segmentRaw, groupBy);
    }
    if (meta.needsRenderAs) {
        entry.spread = statsSeriesSpreadAllowed(chartType, entry)
            ? statsNormalizeSpread(s.spread)
            : 'none';
    }
    statsApplySeriesLabelFlags(entry, s, chartType, legacyChart);
    return entry;
}

function statsNormalizeChartEntry(c) {
    const legacySourceType = statsLegacyChartType(c.type);
    const type = statsNormalizeChartType(c.type);
    const meta = statsGetChartTypeMeta(type);
    const groupBy = meta.skipGroupBy ? STATS_SCORECARD_GROUP_BY : String(c.groupBy);
    const legacySegmentBy = c.splitBy != null ? statsNormalizeSegmentBy(c.splitBy, groupBy) : null;
    const legacyChartLabels = statsChartSupportsLabelOptions(type) ? c : null;
    let series = (c.series || []).map((s, i) => {
        const src = legacySegmentBy && i === 0 && !s.segmentBy && !s.splitBy
            ? Object.assign({}, s, { segmentBy: legacySegmentBy })
            : s;
        return statsNormalizeSeriesEntry(src, type, i, groupBy, legacySourceType, legacyChartLabels);
    });
    if (series.length > meta.maxSeries) series = series.slice(0, meta.maxSeries);
    if (series.length < meta.minSeries && meta.minSeries > 0) {
        while (series.length < meta.minSeries) {
            series.push(statsNormalizeSeriesEntry(
                { metricId: 'count', agg: 'count' },
                type,
                series.length,
                groupBy,
                legacySourceType,
                legacyChartLabels
            ));
        }
    }
    const chart = {
        id: String(c.id),
        title: String(c.title || 'Chart'),
        type,
        groupBy,
        series,
        height: statsNormalizeChartHeight(c.height, meta.defaultHeight || STATS_CHART_HEIGHT_DEFAULT),
        presetKey: c.presetKey != null ? String(c.presetKey) : null
    };
    if (meta.needsPointMode) {
        chart.pointMode = statsNormalizePointMode(c.pointMode);
    }
    if (meta.needsBarLayout) {
        chart.barLayout = statsNormalizeBarLayout(c.barLayout);
    }
    if (meta.needsOrientation) {
        chart.orientation = statsNormalizeOrientation(c.orientation);
    }
    if (meta.needsLineAreaLayout) {
        chart.lineAreaLayout = statsNormalizeLineAreaLayout(c.lineAreaLayout);
    }
    if (meta.needsBarLayout) {
        chart.categorySort = statsNormalizeCategorySort(c.categorySort, series.length);
    }
    if (meta.allowsHorizontalStack) {
        chart.allowHorizontalStack = c.allowHorizontalStack !== false;
    }
    // Label options live on series only (legacy chart-level fields migrated above).
    chart.chartFilters = statsNormalizeChartFilters(c.chartFilters, null);
    return chart;
}

function statsNormalizeChartsList(rawCharts) {
    if (!Array.isArray(rawCharts)) return [];
    return rawCharts
        .filter((c) => c && c.id && c.groupBy && c.type && Array.isArray(c.series) && c.series.length > 0)
        .map((c) => statsNormalizeChartEntry(c));
}

function statsDefaultCharts() {
    try {
        const parsed = JSON.parse(STATS_DEFAULT_LAYOUT_JSON);
        const charts = statsNormalizeChartsList(parsed && parsed.charts);
        return charts.length ? charts : [];
    } catch (e) {
        return [];
    }
}

function statsMakeDashboard(raw, index) {
    const idx = Number.isFinite(index) ? index : 0;
    const id = raw && raw.id != null && String(raw.id).trim()
        ? String(raw.id).trim()
        : statsNewDashboardId();
    const fallbackName = 'Dashboard ' + (idx + 1);
    const name = raw && raw.name != null && String(raw.name).trim()
        ? String(raw.name).trim().slice(0, 80)
        : fallbackName;
    return {
        id,
        name,
        charts: statsNormalizeChartsList(raw && raw.charts)
    };
}

function statsDefaultStore() {
    const dashboard = statsMakeDashboard({
        id: statsNewDashboardId(),
        name: 'Dashboard 1',
        charts: statsDefaultCharts()
    }, 0);
    return {
        schemaVersion: STATS_LAYOUT_SCHEMA_VERSION,
        activeDashboardId: dashboard.id,
        allowHorizontalStack: true,
        dashboards: [dashboard]
    };
}

function statsWrapLegacyLayout(raw) {
    const charts = statsNormalizeChartsList(raw && raw.charts);
    const dashboard = statsMakeDashboard({
        id: statsNewDashboardId(),
        name: 'Dashboard 1',
        charts: charts.length ? charts : statsDefaultCharts()
    }, 0);
    return {
        schemaVersion: STATS_LAYOUT_SCHEMA_VERSION,
        activeDashboardId: dashboard.id,
        allowHorizontalStack: true,
        dashboards: [dashboard]
    };
}

/** @deprecated Prefer statsNormalizeStore — kept for charts-only export/import helpers. */
function statsNormalizeLayout(raw) {
    if (raw && typeof raw === 'object' && Array.isArray(raw.dashboards)) {
        const active = statsGetActiveDashboard(raw);
        return {
            schemaVersion: STATS_LAYOUT_SCHEMA_VERSION,
            charts: (active && active.charts) ? active.charts.slice() : []
        };
    }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.charts)) {
        return { schemaVersion: STATS_LAYOUT_SCHEMA_VERSION, charts: statsDefaultCharts() };
    }
    const charts = statsNormalizeChartsList(raw.charts);
    return {
        schemaVersion: STATS_LAYOUT_SCHEMA_VERSION,
        charts: charts.length ? charts : statsDefaultCharts()
    };
}

function statsDefaultLayout() {
    return statsDefaultStore();
}

function statsNormalizeStore(raw) {
    if (!raw || typeof raw !== 'object') return statsDefaultStore();
    if (Array.isArray(raw.charts) && !Array.isArray(raw.dashboards)) {
        return statsWrapLegacyLayout(raw);
    }
    if (!Array.isArray(raw.dashboards) || !raw.dashboards.length) {
        return statsDefaultStore();
    }
    const dashboards = raw.dashboards
        .slice(0, STATS_MAX_DASHBOARDS)
        .map((d, i) => statsMakeDashboard(d, i))
        .filter((d) => d && d.id);
    if (!dashboards.length) return statsDefaultStore();
    let activeDashboardId = raw.activeDashboardId != null ? String(raw.activeDashboardId) : dashboards[0].id;
    if (!dashboards.some((d) => d.id === activeDashboardId)) {
        activeDashboardId = dashboards[0].id;
    }
    return {
        schemaVersion: STATS_LAYOUT_SCHEMA_VERSION,
        activeDashboardId,
        allowHorizontalStack: raw.allowHorizontalStack !== false,
        dashboards
    };
}

function statsGetActiveDashboard(store) {
    const normalized = statsNormalizeStore(store);
    return normalized.dashboards.find((d) => d.id === normalized.activeDashboardId) || normalized.dashboards[0];
}

function statsFindDashboard(store, dashboardId) {
    const normalized = statsNormalizeStore(store);
    const id = dashboardId != null ? String(dashboardId) : '';
    return normalized.dashboards.find((d) => d.id === id) || null;
}

function statsSetActiveDashboardId(store, dashboardId) {
    const normalized = statsNormalizeStore(store);
    const id = dashboardId != null ? String(dashboardId) : '';
    if (!normalized.dashboards.some((d) => d.id === id)) return normalized;
    normalized.activeDashboardId = id;
    return normalized;
}

function statsNextDashboardName(store) {
    const normalized = statsNormalizeStore(store);
    const used = new Set(normalized.dashboards.map((d) => d.name));
    for (let n = 1; n <= STATS_MAX_DASHBOARDS + 5; n += 1) {
        const name = 'Dashboard ' + n;
        if (!used.has(name)) return name;
    }
    return 'Dashboard';
}

function statsAddDashboard(store, name) {
    const normalized = statsNormalizeStore(store);
    if (normalized.dashboards.length >= STATS_MAX_DASHBOARDS) return normalized;
    const trimmed = name != null ? String(name).trim().slice(0, 80) : '';
    const dashboard = statsMakeDashboard({
        id: statsNewDashboardId(),
        name: trimmed || statsNextDashboardName(normalized),
        charts: []
    }, normalized.dashboards.length);
    normalized.dashboards.push(dashboard);
    normalized.activeDashboardId = dashboard.id;
    return normalized;
}

function statsRenameDashboard(store, dashboardId, name) {
    const normalized = statsNormalizeStore(store);
    const trimmed = name != null ? String(name).trim().slice(0, 80) : '';
    if (!trimmed) return normalized;
    const dash = normalized.dashboards.find((d) => d.id === String(dashboardId));
    if (!dash) return normalized;
    dash.name = trimmed;
    return normalized;
}

function statsDeleteDashboard(store, dashboardId) {
    const normalized = statsNormalizeStore(store);
    if (normalized.dashboards.length <= 1) return normalized;
    const id = String(dashboardId);
    const next = normalized.dashboards.filter((d) => d.id !== id);
    if (next.length === normalized.dashboards.length) return normalized;
    normalized.dashboards = next;
    if (normalized.activeDashboardId === id) {
        normalized.activeDashboardId = next[0].id;
    }
    return normalized;
}

function statsCopyChartToDashboard(store, chartId, fromDashboardId, toDashboardId) {
    const normalized = statsNormalizeStore(store);
    const fromId = String(fromDashboardId || '');
    const toId = String(toDashboardId || '');
    if (!chartId || !toId || fromId === toId) return { store: normalized, chart: null };
    const fromDash = normalized.dashboards.find((d) => d.id === fromId)
        || (fromId ? null : statsGetActiveDashboard(normalized));
    const toDash = normalized.dashboards.find((d) => d.id === toId);
    if (!fromDash || !toDash) return { store: normalized, chart: null };
    const source = fromDash.charts.find((c) => c.id === String(chartId));
    if (!source) return { store: normalized, chart: null };
    const clone = statsNormalizeChartEntry(Object.assign({}, JSON.parse(JSON.stringify(source)), {
        id: statsNewChartId()
    }));
    toDash.charts.push(clone);
    return { store: normalized, chart: clone };
}

function statsSetAllowHorizontalStack(store, allowed) {
    const normalized = statsNormalizeStore(store);
    normalized.allowHorizontalStack = allowed !== false;
    return normalized;
}

function statsResetDashboardCharts(store, dashboardId) {
    const normalized = statsNormalizeStore(store);
    const dash = normalized.dashboards.find((d) => d.id === String(dashboardId || normalized.activeDashboardId));
    if (!dash) return normalized;
    dash.charts = statsDefaultCharts().map((c) => statsNormalizeChartEntry(Object.assign({}, JSON.parse(JSON.stringify(c)), {
        id: statsNewChartId()
    })));
    return normalized;
}

function statsIsImportableChartShape(c) {
    return Boolean(
        c && typeof c === 'object' && c.type && Array.isArray(c.series) && c.series.length > 0
        && c.groupBy != null && String(c.groupBy)
    );
}

function statsParseImportPayload(parsed) {
    if (!parsed || typeof parsed !== 'object') return null;
    if (Array.isArray(parsed.charts)) {
        const charts = parsed.charts.filter(statsIsImportableChartShape);
        if (!charts.length) return null;
        return { kind: 'dashboard', charts };
    }
    if (statsIsImportableChartShape(parsed)) {
        return { kind: 'chart', charts: [parsed] };
    }
    return null;
}

function statsPrepareImportedChart(raw) {
    if (!statsIsImportableChartShape(raw)) return null;
    return statsNormalizeChartEntry(Object.assign({}, raw, { id: statsNewChartId() }));
}

function statsExportLayoutObject(layoutOrStore) {
    let charts = [];
    if (layoutOrStore && Array.isArray(layoutOrStore.dashboards)) {
        const active = statsGetActiveDashboard(layoutOrStore);
        charts = (active && active.charts) || [];
    } else if (layoutOrStore && Array.isArray(layoutOrStore.charts)) {
        charts = statsNormalizeChartsList(layoutOrStore.charts);
    }
    return {
        schemaVersion: STATS_LAYOUT_SCHEMA_VERSION,
        charts: charts.map((chart) => JSON.parse(JSON.stringify(chart)))
    };
}

function statsExportChartObject(chart) {
    const normalized = statsNormalizeChartEntry(Object.assign({}, chart, { id: chart && chart.id ? chart.id : statsNewChartId() }));
    return JSON.parse(JSON.stringify(normalized));
}

function statsSanitizeExportSlug(text) {
    const slug = String(text || 'chart').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || 'chart';
}

function statsExportDateSlug() {
    return new Date().toISOString().slice(0, 10);
}

function statsDimensionLabel(scopeKey, resolveScopeLabel) {
    if (typeof resolveScopeLabel === 'function') {
        return resolveScopeLabel(scopeKey);
    }
    return scopeKey;
}

function statsItemTaskCreatedMs(item) {
    const task = item && item.task;
    if (!task || !task.createdAt) return null;
    const ms = Date.parse(String(task.createdAt));
    return Number.isFinite(ms) ? ms : null;
}

function statsUtcDateParts(ms) {
    const d = new Date(ms);
    return {
        y: d.getUTCFullYear(),
        m: d.getUTCMonth() + 1,
        d: d.getUTCDate()
    };
}

function statsTimeBucketId(granularity, ms) {
    const { y, m, d } = statsUtcDateParts(ms);
    if (granularity === 'year') return String(y);
    if (granularity === 'month') return y + '-' + String(m).padStart(2, '0');
    if (granularity === 'day') {
        return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
    if (granularity === 'week') {
        const tmp = new Date(Date.UTC(y, m - 1, d));
        const dow = tmp.getUTCDay() || 7;
        tmp.setUTCDate(tmp.getUTCDate() + 4 - dow);
        const weekYear = tmp.getUTCFullYear();
        const yearStart = new Date(Date.UTC(weekYear, 0, 1));
        const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
        return weekYear + '-W' + String(weekNo).padStart(2, '0');
    }
    return '';
}

function statsTimeBucketLabel(granularity, bucketId) {
    if (!bucketId) return bucketId;
    if (granularity === 'year') return bucketId;
    if (granularity === 'month') {
        const parts = bucketId.split('-');
        const year = Number(parts[0]);
        const month = Number(parts[1]);
        return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC'
        });
    }
    if (granularity === 'day') {
        const parts = bucketId.split('-').map(Number);
        return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC'
        });
    }
    if (granularity === 'week') {
        const match = /^(\d{4})-W(\d{2})$/.exec(bucketId);
        if (!match) return bucketId;
        const weekYear = Number(match[1]);
        const weekNo = Number(match[2]);
        const jan4 = new Date(Date.UTC(weekYear, 0, 4));
        const jan4Dow = jan4.getUTCDay() || 7;
        const monday = new Date(jan4);
        monday.setUTCDate(jan4.getUTCDate() - jan4Dow + 1 + (weekNo - 1) * 7);
        const monLabel = monday.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC'
        });
        return 'Week of ' + monLabel;
    }
    return bucketId;
}

function statsBuildTimeDimensionOptions(items, granularity) {
    const ids = new Set();
    for (const item of items || []) {
        const ms = statsItemTaskCreatedMs(item);
        if (ms == null) continue;
        const id = statsTimeBucketId(granularity, ms);
        if (id) ids.add(id);
    }
    return [...ids].sort().map((id) => ({
        id,
        label: statsTimeBucketLabel(granularity, id)
    }));
}

function statsTimeGroupGranularity(dimKey) {
    const def = STATS_TIME_GROUP_DIMENSIONS.find((d) => d.key === dimKey);
    return def ? def.granularity : null;
}

function statsBuildPromptVersionCountOptions(items, getVersionCount) {
    const counts = new Set();
    if (typeof getVersionCount === 'function') {
        for (const item of items || []) {
            if (!item || !item.hydrated) continue;
            const n = getVersionCount(item);
            if (n != null && Number.isFinite(n) && n > 0) counts.add(Math.round(n));
        }
    }
    return [...counts].sort((a, b) => a - b).map((n) => ({
        id: String(n),
        label: n === 1 ? '1 version' : n + ' versions'
    }));
}

function statsGetDimensionValues(item, dimKey, lib, ctx) {
    const task = item && item.task;
    if (dimKey === STATS_ALL_GROUP_BY) {
        return task ? [STATS_ALL_GROUP_BY] : [];
    }
    if (!task) return [];
    const helpfulnessUi = (ctx && ctx.helpfulnessUi) || {};
    const currentUserId = (ctx && ctx.currentUserId) || '';
    const sessionQaUi = (ctx && ctx.sessionQaUi) || {};
    const getVersionCount = ctx && ctx.getVersionCount;
    switch (dimKey) {
        case 'teamIds':
            return task.teamId ? [task.teamId] : [];
        case 'projectIds':
            return task.projectId ? [task.projectId] : [];
        case 'envKeys':
            return (task.envKey || task.environment) ? [task.envKey || task.environment] : [];
        case 'statuses':
            return task.status ? [task.status] : [];
        case 'contributorIds':
            return lib && typeof lib.taskContributorIds === 'function' ? lib.taskContributorIds(task) : [];
        case 'promptRatings':
            return lib && typeof lib.taskPromptRatings === 'function' ? lib.taskPromptRatings(task) : [];
        case 'taskIssues':
            return lib && typeof lib.taskIssueLabels === 'function' ? lib.taskIssueLabels(task) : [];
        case 'returnTypes':
            return lib && typeof lib.taskReturnTypes === 'function' ? lib.taskReturnTypes(task) : [];
        case 'promptHistory':
            return lib && typeof lib.itemPromptHistory === 'function'
                ? lib.itemPromptHistory(item, sessionQaUi)
                : [];
        case 'sessionQaOutcomes':
            return lib && typeof lib.itemSessionQaOutcomes === 'function'
                ? lib.itemSessionQaOutcomes(item, sessionQaUi)
                : [];
        case 'disputeOutcomes':
            return lib && typeof lib.itemDisputeOutcomes === 'function'
                ? lib.itemDisputeOutcomes(item)
                : [];
        case 'srReviewOutcomes':
            return lib && typeof lib.itemSrReviewOutcomes === 'function'
                ? lib.itemSrReviewOutcomes(item)
                : [];
        case 'qaHelpfulness':
            return lib && typeof lib.itemQaHelpfulness === 'function'
                ? lib.itemQaHelpfulness(item, helpfulnessUi, currentUserId)
                : [];
        case 'v1CreationTimeMinutes':
            return lib && typeof lib.itemV1CreationTimeBuckets === 'function' ? lib.itemV1CreationTimeBuckets(item) : [];
        case 'qaTimeMinutes':
            return lib && typeof lib.itemQaTimeMinutesBuckets === 'function' ? lib.itemQaTimeMinutesBuckets(item) : [];
        case 'disputeResolutionTimeMinutes':
            return lib && typeof lib.itemDisputeResolutionTimeMinutesBuckets === 'function'
                ? lib.itemDisputeResolutionTimeMinutesBuckets(item)
                : [];
        case 'promptVersionCount': {
            if (!item.hydrated || typeof getVersionCount !== 'function') return [];
            const n = getVersionCount(item);
            if (n == null || !Number.isFinite(n) || n <= 0) return [];
            return [String(Math.round(n))];
        }
        default: {
            const granularity = statsTimeGroupGranularity(dimKey);
            if (!granularity) return [];
            const ms = statsItemTaskCreatedMs(item);
            if (ms == null) return [];
            const id = statsTimeBucketId(granularity, ms);
            return id ? [id] : [];
        }
    }
}

function statsBuildCatalog(ctx) {
    const filterListOptions = (ctx && ctx.filterListOptions) || {};
    const items = (ctx && ctx.items) || [];
    const lib = Context.dashboardLib;
    const resolveScopeLabel = ctx && ctx.resolveScopeLabel;
    const getMetricValue = ctx && ctx.getMetricValue;
    const getVersionCount = ctx && ctx.getVersionCount;
    const dimensions = [];
    const dimensionByKey = {};

    for (const def of STATS_DIMENSION_DEFS) {
        const options = filterListOptions[def.optionsKey] || [];
        if (!options.length) continue;
        const label = statsDimensionLabel(def.scopeKey, resolveScopeLabel);
        const dim = {
            key: def.key,
            optionsKey: def.optionsKey,
            label,
            options: options.map((o) => ({ id: o.id, label: o.label || o.id }))
        };
        dimensions.push(dim);
        dimensionByKey[def.key] = dim;
    }

    for (const def of STATS_TIME_GROUP_DIMENSIONS) {
        const options = statsBuildTimeDimensionOptions(items, def.granularity);
        if (!options.length) continue;
        const dim = {
            key: def.key,
            label: def.label,
            options
        };
        dimensions.push(dim);
        dimensionByKey[def.key] = dim;
    }

    const versionCountOptions = statsBuildPromptVersionCountOptions(items, getVersionCount);
    if (versionCountOptions.length) {
        const dim = {
            key: STATS_DYNAMIC_DIMENSION.key,
            optionsKey: STATS_DYNAMIC_DIMENSION.optionsKey,
            label: STATS_DYNAMIC_DIMENSION.label,
            options: versionCountOptions
        };
        dimensions.push(dim);
        dimensionByKey[dim.key] = dim;
    }

    const metrics = [{
        id: 'count',
        label: STATS_METRIC_LABELS.count,
        type: 'count',
        requiresHydration: false
    }];
    const manualFields = (lib && lib.manualFilterFields) || [];
    for (const field of manualFields) {
        let sampleCount = 0;
        if (typeof getMetricValue === 'function') {
            for (const item of items) {
                const v = getMetricValue(item, field.id);
                if (v != null && Number.isFinite(v)) sampleCount += 1;
            }
        }
        metrics.push({
            id: field.id,
            label: STATS_METRIC_LABELS[field.id] || field.label || field.id,
            type: 'number',
            requiresHydration: Boolean(field.hydrateHint),
            sampleCount
        });
    }

    const allDim = {
        key: STATS_ALL_GROUP_BY,
        label: 'All',
        options: [{ id: STATS_ALL_GROUP_BY, label: 'All' }]
    };
    dimensions.unshift(allDim);
    dimensionByKey[STATS_ALL_GROUP_BY] = allDim;

    return {
        dimensions,
        dimensionByKey,
        metrics,
        aggregations: STATS_AGGREGATIONS,
        chartTypes: STATS_CHART_TYPES,
        chartTypeMeta: STATS_CHART_TYPE_META,
        chartHeight: {
            min: STATS_CHART_HEIGHT_MIN,
            max: STATS_CHART_HEIGHT_MAX,
            step: STATS_CHART_HEIGHT_STEP,
            default: STATS_CHART_HEIGHT_DEFAULT
        }
    };
}

function statsFindDimension(catalog, key) {
    return (catalog && catalog.dimensionByKey && catalog.dimensionByKey[key]) || null;
}

function statsFindMetric(catalog, metricId) {
    return (catalog && catalog.metrics || []).find((m) => m.id === metricId) || null;
}

function statsAggregationsForChartType(chartType) {
    const meta = statsGetChartTypeMeta(chartType);
    const type = statsNormalizeChartType(chartType);
    let aggs = meta.allowCountAxis ? STATS_AGGREGATIONS : STATS_AGGREGATIONS.filter((a) => a.id !== 'count');
    if (type === 'pie' || type === 'polarArea') {
        aggs = aggs.filter((a) => a.id !== 'stddev');
    }
    return aggs;
}

function statsAggDataHasFiniteValues(chart, aggData) {
    const type = statsNormalizeChartType(chart && chart.type);
    if (type === 'scorecard') {
        return aggData.value != null && Number.isFinite(aggData.value);
    }
    if (type === 'bellCurve') {
        return (aggData.bins || []).some((b) => b != null && Number.isFinite(b.y) && b.y > 0);
    }
    if ((aggData.points || []).some((p) => p != null && Number.isFinite(p.x) && Number.isFinite(p.y))) {
        return true;
    }
    return (aggData.datasets || []).some((ds) =>
        (ds.data || []).some((v) => v != null && Number.isFinite(v))
    );
}

function statsSeriesMetricValue(item, seriesEntry, getMetricValue) {
    if (!seriesEntry) return null;
    if (seriesEntry.metricId === 'count') {
        return 1;
    }
    if (typeof getMetricValue !== 'function') return null;
    const v = getMetricValue(item, seriesEntry.metricId);
    return v != null && Number.isFinite(v) ? v : null;
}

function statsValidateChart(chart, catalog, items, ctx) {
    const missing = [];
    if (!chart || !catalog) {
        return { ok: false, missing: [{ id: 'chart', label: 'Chart' }] };
    }
    const type = statsNormalizeChartType(chart.type);
    const meta = statsGetChartTypeMeta(type);
    const dim = statsFindDimension(catalog, chart.groupBy);
    const series = chart.series || [];

    if (!meta.skipGroupBy && !dim) {
        if (chart.groupBy === STATS_DYNAMIC_DIMENSION.key) {
            missing.push({ id: chart.groupBy, label: STATS_DYNAMIC_DIMENSION.label });
        } else {
            const timeDef = STATS_TIME_GROUP_DIMENSIONS.find((d) => d.key === chart.groupBy);
            const def = STATS_DIMENSION_DEFS.find((d) => d.key === chart.groupBy);
            const label = timeDef
                ? timeDef.label
                : (ctx && typeof ctx.resolveScopeLabel === 'function' && def)
                    ? ctx.resolveScopeLabel(def.scopeKey)
                    : chart.groupBy;
            missing.push({ id: chart.groupBy, label });
        }
    }

    if (series.length < meta.minSeries || series.length > meta.maxSeries) {
        missing.push({ id: 'series', label: 'Chart series' });
    }

    if ((type === 'pie' || type === 'polarArea') && series.length > 1) {
        missing.push({ id: 'series', label: 'Chart series' });
    }

    for (let i = 0; i < series.length; i += 1) {
        const s = series[i];
        const segmentBy = statsSeriesAllowsSegment(type, s)
            ? statsNormalizeSegmentBy(s.segmentBy, chart.groupBy)
            : null;
        if (!segmentBy) continue;
        if (segmentBy === chart.groupBy) {
            missing.push({ id: 'segmentBy', label: 'Segment by (must differ from group by)' });
            continue;
        }
        const segmentDim = statsFindDimension(catalog, segmentBy);
        if (!segmentDim) {
            missing.push({ id: segmentBy, label: statsSegmentByDimensionLabel(segmentBy) });
        }
    }

    if (type === 'scatter' || type === 'bubble') {
        for (const s of series) {
            if (s.metricId === 'count') {
                missing.push({ id: 'count', label: 'Numeric metric' });
                break;
            }
        }
        if (statsNormalizePointMode(chart.pointMode) === 'task' && (items || []).length > STATS_TASK_POINT_CAP) {
            missing.push({ id: 'pointMode', label: 'Scope size (use Per bucket or narrow filters)' });
        }
    }

    if (type === 'histogram' || type === 'bellCurve') {
        for (const s of series) {
            if (s.metricId === 'count') {
                missing.push({ id: 'count', label: 'Numeric metric' });
                break;
            }
        }
    }

    for (const s of series) {
        if (s.metricId === 'count') {
            if (!meta.allowCountAxis) {
                missing.push({ id: 'count', label: 'Numeric metric' });
            }
            continue;
        }
        const metric = statsFindMetric(catalog, s.metricId);
        if (!metric) {
            missing.push({ id: s.metricId, label: s.metricId });
            continue;
        }
        if (metric.requiresHydration && (metric.sampleCount || 0) === 0) {
            missing.push({ id: s.metricId, label: metric.label });
        }
    }

    if (missing.length > 0) {
        return { ok: false, missing };
    }

    const listBounds = (ctx && ctx.listBounds) || {};
    const chartFilters = statsNormalizeChartFilters(chart.chartFilters, listBounds);
    if (statsChartFiltersActive(chartFilters, listBounds)) {
        const scoped = statsFilterItemsForChart(items, Object.assign({}, chart, { chartFilters }), ctx);
        if (!scoped.length) {
            return { ok: false, missing: [{ id: 'chartFilters', label: 'No results match chart filters' }] };
        }
    }

    if (type === 'histogram' && missing.length === 0) {
        const scoped = statsFilterItemsForChart(items, chart, ctx);
        const agg = statsAggregateHistogram(chart, scoped, catalog, ctx);
        if (!agg.labels.length) {
            return { ok: false, missing: [{ id: 'histogram', label: 'No metric values to bin' }] };
        }
    }

    if (type === 'bellCurve' && missing.length === 0) {
        const scoped = statsFilterItemsForChart(items, chart, ctx);
        const agg = statsAggregateBellCurve(chart, scoped, catalog, ctx);
        if (!agg.bins || !agg.bins.length) {
            return { ok: false, missing: [{ id: 'bellCurve', label: 'No metric values to chart' }] };
        }
        const n = agg.stats && agg.stats.n;
        if (n == null || n < 2) {
            return { ok: false, missing: [{ id: 'bellCurve', label: 'Need at least 2 values for distribution' }] };
        }
        if (!agg.stats || !(agg.stats.stddev > 0)) {
            return { ok: false, missing: [{ id: 'bellCurve', label: 'Need variation in values (σ > 0)' }] };
        }
    }

    return { ok: true, missing: [] };
}

const STATS_HISTOGRAM_INTEGER_METRICS = new Set([
    'prompt_version_count',
    'rejection_issue_count'
]);

const STATS_HISTOGRAM_TIME_METRICS = new Set([
    'v1_creation_time_minutes',
    'qa_time_minutes',
    'dispute_resolution_time_minutes'
]);

function statsHistogramBinMode(metricId) {
    if (STATS_HISTOGRAM_INTEGER_METRICS.has(metricId)) return 'integer';
    if (STATS_HISTOGRAM_TIME_METRICS.has(metricId)) return 'time';
    return 'auto';
}

function statsHistogramIntegerLabel(metricId, value) {
    if (metricId === 'prompt_version_count') {
        return value === 1 ? '1 version' : value + ' versions';
    }
    return String(value);
}

function statsBuildHistogramIntegerBins(values, metricId) {
    if (!values.length) return { labels: [], counts: [], centers: [], lo: [], hi: [] };
    const intVals = values.map((v) => Math.round(v));
    const min = Math.min(...intVals);
    const max = Math.max(...intVals);
    const labels = [];
    const counts = [];
    const centers = [];
    const lo = [];
    const hi = [];
    for (let i = min; i <= max; i += 1) {
        labels.push(statsHistogramIntegerLabel(metricId, i));
        counts.push(intVals.filter((v) => v === i).length);
        centers.push(i);
        lo.push(i - 0.5);
        hi.push(i + 0.5);
    }
    return { labels, counts, centers, lo, hi };
}

function statsBuildHistogramTimeBins(values, lib) {
    const order = (lib && lib.V1_CREATION_TIME_BUCKET_ORDER) || [];
    const labelMap = (lib && lib.V1_CREATION_TIME_BUCKET_LABELS) || {};
    const bucketFn = lib && lib.v1CreationTimeBucketId;
    if (!order.length || typeof bucketFn !== 'function') {
        return { labels: [], counts: [] };
    }
    const countsById = new Map(order.map((id) => [id, 0]));
    for (const v of values) {
        const id = bucketFn(v);
        if (id && countsById.has(id)) {
            countsById.set(id, countsById.get(id) + 1);
        }
    }
    const labels = [];
    const counts = [];
    for (const id of order) {
        labels.push(labelMap[id] || id);
        counts.push(countsById.get(id) || 0);
    }
    return { labels, counts };
}

function statsBuildHistogramAutoBins(values) {
    if (!values.length) return { labels: [], counts: [], centers: [], lo: [], hi: [] };
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
        const rounded = Math.round(min);
        const pad = 0.5;
        return {
            labels: [String(rounded)],
            counts: [values.length],
            centers: [min],
            lo: [min - pad],
            hi: [min + pad]
        };
    }
    const n = values.length;
    const binCount = Math.min(12, Math.max(2, Math.ceil(Math.log2(n) + 1)));
    const range = max - min;
    const width = range / binCount;
    const labels = [];
    const counts = new Array(binCount).fill(0);
    const centers = [];
    const lo = [];
    const hi = [];
    for (let b = 0; b < binCount; b += 1) {
        const binLo = min + b * width;
        const binHi = b === binCount - 1 ? max : min + (b + 1) * width;
        const loR = Math.floor(binLo);
        const hiR = b === binCount - 1 ? Math.ceil(max) : Math.floor(binHi) - 1;
        labels.push(loR + '–' + (hiR < loR ? loR : hiR));
        centers.push((binLo + binHi) / 2);
        lo.push(binLo);
        hi.push(binHi);
    }
    for (const v of values) {
        let idx = Math.floor((v - min) / width);
        if (idx >= binCount) idx = binCount - 1;
        if (idx < 0) idx = 0;
        counts[idx] += 1;
    }
    return { labels, counts, centers, lo, hi };
}

function statsAggregateHistogram(chart, items, catalog, ctx) {
    const s = (chart.series || [])[0];
    if (!s) return { labels: [], datasets: [] };
    const getMetricValue = ctx && ctx.getMetricValue;
    const metric = statsFindMetric(catalog, s.metricId);
    const metricLabel = s.label || (metric && metric.label) || s.metricId;
    const values = [];
    for (const item of items || []) {
        const v = statsSeriesMetricValue(item, s, getMetricValue);
        if (v != null && Number.isFinite(v)) values.push(v);
    }
    if (!values.length) return { labels: [], datasets: [] };

    const lib = Context.dashboardLib;
    const mode = statsHistogramBinMode(s.metricId);
    let binResult;
    if (mode === 'integer') {
        binResult = statsBuildHistogramIntegerBins(values, s.metricId);
    } else if (mode === 'time') {
        binResult = statsBuildHistogramTimeBins(values, lib);
    } else {
        binResult = statsBuildHistogramAutoBins(values);
    }

    return {
        labels: binResult.labels,
        datasets: [{
            label: metricLabel,
            data: binResult.counts,
            metricId: s.metricId,
            seriesIndex: 0
        }]
    };
}

function statsComputeSampleMeanStddev(values) {
    const nums = (values || []).filter((v) => v != null && Number.isFinite(v));
    if (!nums.length) return { n: 0, mean: null, stddev: null };
    const n = nums.length;
    const mean = nums.reduce((a, b) => a + b, 0) / n;
    if (n < 2) {
        return { n, mean: Math.round(mean * 10) / 10, stddev: null };
    }
    const variance = nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
    const stddev = Math.sqrt(variance);
    return {
        n,
        mean: Math.round(mean * 10) / 10,
        stddev: Math.round(stddev * 10) / 10
    };
}

function statsNormalPdf(x, mean, stddev) {
    if (!(stddev > 0)) return 0;
    const z = (x - mean) / stddev;
    return Math.exp(-0.5 * z * z) / (stddev * Math.sqrt(2 * Math.PI));
}

function statsBuildBellCurvePoints(mean, stddev, scale, spanSigma, steps) {
    if (!(stddev > 0) || !(scale > 0)) return [];
    const lo = mean - spanSigma * stddev;
    const hi = mean + spanSigma * stddev;
    const count = Math.max(2, steps || 80);
    const points = [];
    for (let i = 0; i <= count; i += 1) {
        const x = lo + (hi - lo) * (i / count);
        points.push({ x, y: statsNormalPdf(x, mean, stddev) * scale });
    }
    return points;
}

function statsBuildBellSigmaBandPoints(mean, stddev, scale, sigmaLevel, steps) {
    if (!(stddev > 0) || !(scale > 0)) return [];
    const lo = mean - sigmaLevel * stddev;
    const hi = mean + sigmaLevel * stddev;
    const count = Math.max(2, steps || 40);
    const points = [];
    for (let i = 0; i <= count; i += 1) {
        const x = lo + (hi - lo) * (i / count);
        points.push({ x, y: statsNormalPdf(x, mean, stddev) * scale });
    }
    return points;
}

function statsAggregateBellCurve(chart, items, catalog, ctx) {
    const s = (chart.series || [])[0];
    if (!s) {
        return { bins: [], curve: [], sigmaBands: [], stats: { n: 0, mean: null, stddev: null }, metricLabel: '' };
    }
    const getMetricValue = ctx && ctx.getMetricValue;
    const metric = statsFindMetric(catalog, s.metricId);
    const metricLabel = s.label || (metric && metric.label) || s.metricId;
    const values = [];
    for (const item of items || []) {
        const v = statsSeriesMetricValue(item, s, getMetricValue);
        if (v != null && Number.isFinite(v)) values.push(v);
    }
    if (!values.length) {
        return { bins: [], curve: [], sigmaBands: [], stats: { n: 0, mean: null, stddev: null }, metricLabel };
    }

    const mode = statsHistogramBinMode(s.metricId);
    let binResult;
    if (mode === 'integer') {
        binResult = statsBuildHistogramIntegerBins(values, s.metricId);
    } else {
        binResult = statsBuildHistogramAutoBins(values);
    }

    const bins = (binResult.labels || []).map((label, i) => ({
        x: binResult.centers[i],
        lo: binResult.lo && binResult.lo[i] != null ? binResult.lo[i] : binResult.centers[i],
        hi: binResult.hi && binResult.hi[i] != null ? binResult.hi[i] : binResult.centers[i],
        y: binResult.counts[i],
        label
    }));

    const sampleStats = statsComputeSampleMeanStddev(values);
    const { n, mean, stddev } = sampleStats;
    if (n < 2 || !(stddev > 0)) {
        return { bins, curve: [], sigmaBands: [], stats: sampleStats, metricLabel };
    }

    const maxCount = Math.max(...binResult.counts);
    let maxPdf = 0;
    const pdfProbe = statsBuildBellCurvePoints(mean, stddev, 1, 3.5, 80);
    for (const pt of pdfProbe) {
        if (pt.y > maxPdf) maxPdf = pt.y;
    }
    const scale = maxPdf > 0 ? maxCount / maxPdf : 0;
    const curve = statsBuildBellCurvePoints(mean, stddev, scale, 3.5, 80);
    const sigmaBands = [
        { level: 3, pct: 99.7, points: statsBuildBellSigmaBandPoints(mean, stddev, scale, 3, 40) },
        { level: 2, pct: 95, points: statsBuildBellSigmaBandPoints(mean, stddev, scale, 2, 32) },
        { level: 1, pct: 68, points: statsBuildBellSigmaBandPoints(mean, stddev, scale, 1, 24) }
    ];

    return {
        bins,
        curve,
        sigmaBands,
        stats: sampleStats,
        metricLabel,
        xMin: mean - 3.5 * stddev,
        xMax: mean + 3.5 * stddev
    };
}

function statsApplyAgg(values, agg) {
    if (!values.length) return null;
    if (agg === 'count') return values.length;
    const nums = values.filter((v) => v != null && Number.isFinite(v));
    if (!nums.length) return null;
    if (agg === 'sum') return nums.reduce((a, b) => a + b, 0);
    if (agg === 'avg') return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
    if (agg === 'min') return Math.min(...nums);
    if (agg === 'max') return Math.max(...nums);
    if (agg === 'median') {
        const sorted = nums.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 1) return sorted[mid];
        return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
    }
    if (agg === 'mode') {
        const freq = new Map();
        let bestVal = nums[0];
        let bestCount = 0;
        for (const n of nums) {
            const c = (freq.get(n) || 0) + 1;
            freq.set(n, c);
            if (c > bestCount || (c === bestCount && n < bestVal)) {
                bestCount = c;
                bestVal = n;
            }
        }
        return bestVal;
    }
    if (agg === 'stddev') {
        if (nums.length < 2) return null;
        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        const variance = nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (nums.length - 1);
        return Math.round(Math.sqrt(variance) * 10) / 10;
    }
    return nums.length;
}

function statsComputeSpreadBand(values) {
    const nums = (values || []).filter((v) => v != null && Number.isFinite(v));
    if (nums.length < 2) return { low: null, high: null };
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance = nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (nums.length - 1);
    const stddev = Math.sqrt(variance);
    return {
        low: Math.round((mean - stddev) * 10) / 10,
        high: Math.round((mean + stddev) * 10) / 10
    };
}

function statsPushSeriesValue(bucket, seriesEntry, item, getMetricValue) {
    if (seriesEntry.metricId === 'count') {
        bucket.push(1);
        return;
    }
    if (typeof getMetricValue === 'function') {
        const v = getMetricValue(item, seriesEntry.metricId);
        if (v != null && Number.isFinite(v)) bucket.push(v);
    }
}

function statsBuildSegmentedSeriesDatasets(seriesEntry, segmentBy, segmentDim, keysOut, items, chart, lib, ctx, catalog) {
    const splitOrder = segmentDim.options.map((o) => o.id);
    const splitLabelById = new Map(segmentDim.options.map((o) => [o.id, o.label]));
    const unknownKey = '__unknown__';
    const matrix = new Map();
    const getMetricValue = ctx && ctx.getMetricValue;

    const ensureCell = (pk, sk) => {
        if (!matrix.has(pk)) matrix.set(pk, new Map());
        const row = matrix.get(pk);
        if (!row.has(sk)) row.set(sk, []);
        return row.get(sk);
    };

    for (const item of items || []) {
        const pKeys = statsGetDimensionValues(item, chart.groupBy, lib, ctx);
        const sKeys = statsGetDimensionValues(item, segmentBy, lib, ctx);
        const pkList = pKeys.length ? pKeys : [unknownKey];
        const skList = sKeys.length ? sKeys : [unknownKey];
        for (const pk of pkList) {
            for (const sk of skList) {
                const cell = ensureCell(pk, sk);
                statsPushSeriesValue(cell, seriesEntry, item, getMetricValue);
            }
        }
    }

    const splitKeysSeen = new Set();
    for (const pk of keysOut) {
        const row = matrix.get(pk);
        if (!row) continue;
        for (const [sk, vals] of row.entries()) {
            if (vals && vals.length) splitKeysSeen.add(sk);
        }
    }

    const metric = statsFindMetric(catalog, seriesEntry.metricId);
    const seriesLabel = seriesEntry.label || (metric && metric.label) || seriesEntry.metricId;
    const datasets = [];
    const pushSegmentDataset = (sk, segmentLabel) => {
        if (!splitKeysSeen.has(sk)) return;
        const data = keysOut.map((pk) => {
            const row = matrix.get(pk);
            const cell = row && row.get(sk);
            if (!cell || !cell.length) {
                return seriesEntry.metricId === 'count' && seriesEntry.agg === 'count' ? 0 : null;
            }
            return statsApplyAgg(cell, seriesEntry.agg);
        });
        const label = seriesEntry.label
            ? seriesLabel + ' · ' + (segmentLabel || sk)
            : (segmentLabel || sk);
        datasets.push({
            label,
            data,
            metricId: seriesEntry.metricId,
            agg: seriesEntry.agg,
            renderAs: seriesEntry.renderAs,
            lineStyle: seriesEntry.lineStyle,
            yAxis: seriesEntry.yAxis,
            segmentSeries: true,
            seriesIndex: seriesEntry._seriesIndex != null ? seriesEntry._seriesIndex : 0
        });
    };

    for (const sk of splitOrder) {
        pushSegmentDataset(sk, splitLabelById.get(sk) || sk);
    }
    if (splitKeysSeen.has(unknownKey)) {
        pushSegmentDataset(unknownKey, '(unknown)');
    }
    return datasets;
}

function statsBucketSeriesValue(bucket, seriesEntry, seriesIndex) {
    if (!bucket) return null;
    if (seriesEntry.metricId === 'count' && seriesEntry.agg === 'count') {
        return bucket.counts.length;
    }
    const seriesValues = seriesEntry.metricId === 'count' && !(bucket.series[seriesIndex] || []).length
        ? bucket.counts
        : bucket.series[seriesIndex];
    const v = statsApplyAgg(seriesValues || [], seriesEntry.agg);
    return v != null && Number.isFinite(v) ? v : null;
}

function statsApplyCategorySort(labels, keysOut, datasets, chart, buckets, seriesList) {
    if (statsNormalizeChartType(chart.type) !== 'barLine') {
        return { labels, datasets };
    }
    const categorySort = statsNormalizeCategorySort(chart.categorySort, seriesList.length);
    if (!categorySort) {
        return { labels, datasets };
    }
    const seriesEntry = seriesList[categorySort.seriesIndex];
    if (!seriesEntry) {
        return { labels, datasets };
    }
    const indexed = keysOut.map((key, originalIndex) => ({
        key,
        originalIndex,
        label: labels[originalIndex],
        value: statsBucketSeriesValue(buckets.get(key), seriesEntry, categorySort.seriesIndex)
    }));
    indexed.sort((a, b) => {
        const aValid = a.value != null && Number.isFinite(a.value);
        const bValid = b.value != null && Number.isFinite(b.value);
        if (!aValid && !bValid) return a.originalIndex - b.originalIndex;
        if (!aValid) return 1;
        if (!bValid) return -1;
        if (a.value !== b.value) {
            return categorySort.direction === 'desc' ? b.value - a.value : a.value - b.value;
        }
        return a.originalIndex - b.originalIndex;
    });
    const orderMap = indexed.map((x) => x.originalIndex);
    return {
        labels: indexed.map((x) => x.label),
        datasets: datasets.map((ds) => {
            const next = Object.assign({}, ds, {
                data: orderMap.map((oldIdx) => ds.data[oldIdx])
            });
            if (Array.isArray(ds.spreadLow)) {
                next.spreadLow = orderMap.map((oldIdx) => ds.spreadLow[oldIdx]);
                next.spreadHigh = orderMap.map((oldIdx) => ds.spreadHigh[oldIdx]);
            }
            return next;
        })
    };
}

function statsAggregateCategorical(chart, items, catalog, ctx) {
    const lib = Context.dashboardLib;
    const dim = statsFindDimension(catalog, chart.groupBy);
    if (!dim) return { labels: [], datasets: [] };

    const optionOrder = dim.options.map((o) => o.id);
    const labelById = new Map(dim.options.map((o) => [o.id, o.label]));
    const seriesList = chart.series || [];
    const buckets = new Map();
    for (const id of optionOrder) {
        buckets.set(id, { counts: [], series: seriesList.map(() => []) });
    }
    const unknownKey = '__unknown__';
    buckets.set(unknownKey, { counts: [], series: seriesList.map(() => []) });

    const getMetricValue = ctx && ctx.getMetricValue;
    for (const item of items || []) {
        const values = statsGetDimensionValues(item, chart.groupBy, lib, ctx);
        const keys = values.length ? values : [unknownKey];
        for (const key of keys) {
            if (!buckets.has(key)) {
                buckets.set(key, { counts: [], series: seriesList.map(() => []) });
            }
            const bucket = buckets.get(key);
            bucket.counts.push(1);
            seriesList.forEach((s, i) => {
                statsPushSeriesValue(bucket.series[i], s, item, getMetricValue);
            });
        }
    }

    const labels = [];
    const keysOut = [];
    for (const id of optionOrder) {
        const b = buckets.get(id);
        if (!b || b.counts.length === 0) continue;
        labels.push(labelById.get(id) || id);
        keysOut.push(id);
    }
    if (buckets.get(unknownKey).counts.length > 0) {
        labels.push('(unknown)');
        keysOut.push(unknownKey);
    }

    const datasets = [];
    const chartType = statsNormalizeChartType(chart.type);
    for (let si = 0; si < seriesList.length; si += 1) {
        const s = seriesList[si];
        const segmentBy = statsSeriesAllowsSegment(chartType, s)
            ? statsNormalizeSegmentBy(s.segmentBy, chart.groupBy)
            : null;
        if (segmentBy) {
            const segmentDim = statsFindDimension(catalog, segmentBy);
            if (segmentDim) {
                const seriesForSegment = Object.assign({}, s, { _seriesIndex: si });
                const segmentDatasets = statsBuildSegmentedSeriesDatasets(
                    seriesForSegment, segmentBy, segmentDim, keysOut, items, chart, lib, ctx, catalog
                );
                if (s.lineStyle === 'shaded') {
                    segmentDatasets.forEach((ds) => {
                        ds.segmentFillOnly = true;
                        ds.seriesIndex = si;
                    });
                    const metric = statsFindMetric(catalog, s.metricId);
                    const seriesLabel = s.label || (metric && metric.label) || s.metricId;
                    const outlineData = keysOut.map((key) => {
                        const bucket = buckets.get(key);
                        if (!bucket) return null;
                        if (s.metricId === 'count' && s.agg === 'count') {
                            return bucket.counts.length;
                        }
                        return statsApplyAgg(bucket.series[si], s.agg);
                    });
                    datasets.push(...segmentDatasets);
                    datasets.push({
                        label: seriesLabel,
                        data: outlineData,
                        metricId: s.metricId,
                        agg: s.agg,
                        renderAs: 'line',
                        lineStyle: 'line',
                        yAxis: s.yAxis,
                        segmentOutline: true,
                        segmentSeries: true,
                        seriesIndex: si
                    });
                } else {
                    segmentDatasets.forEach((ds) => { ds.seriesIndex = si; });
                    datasets.push(...segmentDatasets);
                }
            }
            continue;
        }
        const data = keysOut.map((key) => {
            const bucket = buckets.get(key);
            if (!bucket) return null;
            if (s.metricId === 'count' && s.agg === 'count') {
                return bucket.counts.length;
            }
            return statsApplyAgg(bucket.series[si], s.agg);
        });
        const spreadEnabled = s.spread === 'stddevBand' && s.agg === 'avg';
        let spreadLow = null;
        let spreadHigh = null;
        if (spreadEnabled) {
            spreadLow = keysOut.map((key) => {
                const bucket = buckets.get(key);
                if (!bucket) return null;
                return statsComputeSpreadBand(bucket.series[si]).low;
            });
            spreadHigh = keysOut.map((key) => {
                const bucket = buckets.get(key);
                if (!bucket) return null;
                return statsComputeSpreadBand(bucket.series[si]).high;
            });
        }
        const metric = statsFindMetric(catalog, s.metricId);
        const label = s.label || (metric && metric.label) || s.metricId;
        const datasetEntry = {
            label,
            data,
            metricId: s.metricId,
            agg: s.agg,
            renderAs: s.renderAs,
            lineStyle: s.lineStyle,
            yAxis: s.yAxis,
            seriesIndex: si
        };
        if (spreadEnabled) {
            datasetEntry.spread = 'stddevBand';
            datasetEntry.spreadLow = spreadLow;
            datasetEntry.spreadHigh = spreadHigh;
        }
        datasets.push(datasetEntry);
    }

    const sorted = statsApplyCategorySort(labels, keysOut, datasets, chart, buckets, seriesList);
    return { labels: sorted.labels, datasets: sorted.datasets };
}

function statsCountBarDatasets(chart, catalog) {
    const type = statsNormalizeChartType(chart.type);
    if (type !== 'barLine') return 0;
    let count = 0;
    for (const s of chart.series || []) {
        if (s.renderAs === 'line') continue;
        const segmentBy = statsSeriesAllowsSegment(type, s)
            ? statsNormalizeSegmentBy(s.segmentBy, chart.groupBy)
            : null;
        if (!segmentBy) {
            count += 1;
            continue;
        }
        const segmentDim = statsFindDimension(catalog, segmentBy);
        count += segmentDim && segmentDim.options.length ? segmentDim.options.length : 1;
    }
    return count;
}

function statsCountShadedLineDatasets(chart, catalog) {
    const type = statsNormalizeChartType(chart.type);
    if (type !== 'barLine') return 0;
    let count = 0;
    for (const s of chart.series || []) {
        if (s.renderAs !== 'line' || s.lineStyle !== 'shaded') continue;
        const segmentBy = statsSeriesAllowsSegment(type, s)
            ? statsNormalizeSegmentBy(s.segmentBy, chart.groupBy)
            : null;
        if (!segmentBy) {
            count += 1;
            continue;
        }
        const segmentDim = statsFindDimension(catalog, segmentBy);
        count += segmentDim && segmentDim.options.length ? segmentDim.options.length : 1;
    }
    return count;
}

function statsChartUsesSecondaryY(chart) {
    return (chart.series || []).some((s) => s.yAxis === 'y1');
}

function statsAggregatePointChart(chart, items, catalog, ctx) {
    const lib = Context.dashboardLib;
    const getMetricValue = ctx && ctx.getMetricValue;
    const series = chart.series || [];
    const pointMode = statsNormalizePointMode(chart.pointMode);
    const points = [];

    if (pointMode === 'task') {
        for (const item of items || []) {
            if (!item || !item.hydrated) continue;
            const values = series.map((s) => statsSeriesMetricValue(item, s, getMetricValue));
            if (values.some((v) => v == null)) continue;
            const task = item.task || {};
            const label = task.key || task.id || item.id || '';
            const point = { x: values[0], y: values[1], label };
            if (chart.type === 'bubble') {
                point.r = values[2] != null ? Math.max(3, Math.min(30, values[2])) : 8;
            }
            points.push(point);
        }
        return { labels: [], datasets: [], points };
    }

    const aggData = statsAggregateCategorical(chart, items, catalog, ctx);
    const keysOut = aggData.labels || [];
    for (let i = 0; i < keysOut.length; i += 1) {
        const x = aggData.datasets[0] && aggData.datasets[0].data[i];
        const y = aggData.datasets[1] && aggData.datasets[1].data[i];
        if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
        const point = { x, y, label: keysOut[i] };
        if (chart.type === 'bubble') {
            if (aggData.datasets[2]) {
                const r = aggData.datasets[2].data[i];
                point.r = r != null && Number.isFinite(r) ? Math.max(3, Math.min(30, r)) : 8;
            } else {
                point.r = 8;
            }
        }
        points.push(point);
    }
    return { labels: [], datasets: [], points };
}

function statsAggregateScorecard(chart, items, catalog, ctx) {
    const s = (chart.series || [])[0];
    if (!s) return { value: null, label: '', subtitle: '', labels: [], datasets: [] };
    const getMetricValue = ctx && ctx.getMetricValue;
    const aggDef = STATS_AGGREGATIONS.find((a) => a.id === s.agg);
    const metric = statsFindMetric(catalog, s.metricId);
    const metricLabel = s.label || (metric && metric.label) || s.metricId;
    const subtitle = (aggDef && aggDef.label ? aggDef.label : s.agg) + ' · ' + metricLabel;

    if (s.metricId === 'count' && s.agg === 'count') {
        return {
            value: (items || []).length,
            label: metricLabel,
            subtitle: 'Count of results',
            labels: [],
            datasets: []
        };
    }

    const values = [];
    for (const item of items || []) {
        const v = statsSeriesMetricValue(item, s, getMetricValue);
        if (v != null && Number.isFinite(v)) values.push(v);
    }
    return {
        value: statsApplyAgg(values, s.agg),
        label: metricLabel,
        subtitle,
        labels: [],
        datasets: []
    };
}

function statsAggregateChart(chart, items, catalog, ctx) {
    const scopedItems = statsFilterItemsForChart(items, chart, ctx);
    const type = statsNormalizeChartType(chart.type);
    if (type === 'scorecard') {
        return statsAggregateScorecard(chart, scopedItems, catalog, ctx);
    }
    if (type === 'histogram') {
        return statsAggregateHistogram(chart, scopedItems, catalog, ctx);
    }
    if (type === 'bellCurve') {
        return statsAggregateBellCurve(chart, scopedItems, catalog, ctx);
    }
    if (type === 'scatter' || type === 'bubble') {
        return statsAggregatePointChart(chart, scopedItems, catalog, ctx);
    }
    return statsAggregateCategorical(chart, scopedItems, catalog, ctx);
}

function statsDefaultBuilderDraft(catalog) {
    const firstDim = (catalog && catalog.dimensions && catalog.dimensions[0]) || null;
    const labelDefaults = statsDefaultSeriesLabelFlags();
    return {
        id: null,
        title: '',
        type: 'pie',
        groupBy: firstDim ? firstDim.key : '',
        series: [Object.assign({ metricId: 'count', agg: 'count', label: '' }, labelDefaults)],
        height: STATS_CHART_HEIGHT_DEFAULT,
        pointMode: 'bucket',
        barLayout: 'grouped',
        orientation: 'vertical',
        lineAreaLayout: 'origin',
        categorySort: null,
        presetKey: null,
        allowHorizontalStack: true,
        chartFilters: statsEmptyChartFilters()
    };
}

const plugin = {
    id: 'search-output-stats-engine',
    name: 'Search Output stats engine',
    description: 'Worker Output Search stats dashboard catalog, aggregation, and persistence',
    _version: '8.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        if (state && state.registered) {
            Logger.debug('search-output-stats-engine: already registered — skipping re-init');
            return;
        }
        const self = this;
        Context.statsEngine = {
            storageKey: STATS_LAYOUT_STORAGE_KEY,
            maxDashboards: STATS_MAX_DASHBOARDS,
            loadLayout: () => self._loadLayout(),
            saveLayout: (layout) => self._saveLayout(layout),
            defaultLayout: () => statsDefaultStore(),
            defaultStore: () => statsDefaultStore(),
            defaultCharts: () => statsDefaultCharts(),
            normalizeLayout: (raw) => statsNormalizeLayout(raw),
            normalizeStore: (raw) => statsNormalizeStore(raw),
            newChartId: () => statsNewChartId(),
            newDashboardId: () => statsNewDashboardId(),
            getActiveDashboard: (store) => statsGetActiveDashboard(store),
            findDashboard: (store, dashboardId) => statsFindDashboard(store, dashboardId),
            setActiveDashboardId: (store, dashboardId) => statsSetActiveDashboardId(store, dashboardId),
            addDashboard: (store, name) => statsAddDashboard(store, name),
            renameDashboard: (store, dashboardId, name) => statsRenameDashboard(store, dashboardId, name),
            deleteDashboard: (store, dashboardId) => statsDeleteDashboard(store, dashboardId),
            setAllowHorizontalStack: (store, allowed) => statsSetAllowHorizontalStack(store, allowed),
            copyChartToDashboard: (store, chartId, fromDashboardId, toDashboardId) => (
                statsCopyChartToDashboard(store, chartId, fromDashboardId, toDashboardId)
            ),
            resetDashboardCharts: (store, dashboardId) => statsResetDashboardCharts(store, dashboardId),
            buildCatalog: (ctx) => statsBuildCatalog(ctx),
            validateChart: (chart, catalog, items, ctx) => statsValidateChart(chart, catalog, items, ctx),
            aggregateChart: (chart, items, catalog, ctx) => statsAggregateChart(chart, items, catalog, ctx),
            defaultBuilderDraft: (catalog) => statsDefaultBuilderDraft(catalog),
            emptyChartFilters: () => statsEmptyChartFilters(),
            normalizeChartFilters: (raw, listBounds) => statsNormalizeChartFilters(raw, listBounds),
            chartFiltersActive: (chartFilters, listBounds) => statsChartFiltersActive(chartFilters, listBounds),
            getChartTypeMeta: (type) => statsGetChartTypeMeta(type),
            aggregationsForChartType: (type) => statsAggregationsForChartType(type),
            aggDataHasFiniteValues: (chart, aggData) => statsAggDataHasFiniteValues(chart, aggData),
            chartTypes: () => STATS_CHART_TYPES.slice(),
            aggregations: () => STATS_AGGREGATIONS.slice(),
            chartHeightMin: () => STATS_CHART_HEIGHT_MIN,
            chartHeightMax: () => STATS_CHART_HEIGHT_MAX,
            chartHeightStep: () => STATS_CHART_HEIGHT_STEP,
            chartHeightDefault: () => STATS_CHART_HEIGHT_DEFAULT,
            normalizeChartHeight: (raw, fallback) => statsNormalizeChartHeight(raw, fallback),
            taskPointCap: STATS_TASK_POINT_CAP,
            parseImportPayload: (parsed) => statsParseImportPayload(parsed),
            prepareImportedChart: (raw) => statsPrepareImportedChart(raw),
            exportLayoutObject: (layout) => statsExportLayoutObject(layout),
            exportChartObject: (chart) => statsExportChartObject(chart),
            sanitizeExportSlug: (text) => statsSanitizeExportSlug(text),
            exportDateSlug: () => statsExportDateSlug(),
            countBarDatasets: (chart, catalog) => statsCountBarDatasets(chart, catalog),
            countShadedLineDatasets: (chart, catalog) => statsCountShadedLineDatasets(chart, catalog),
            seriesAllowsSegment: (chartType, seriesEntry) => statsSeriesAllowsSegment(chartType, seriesEntry),
            normalizeCategorySort: (raw, seriesCount) => statsNormalizeCategorySort(raw, seriesCount),
            normalizeLabelFormat: (raw) => statsNormalizeLabelFormat(raw),
            normalizeLabelsShowName: (raw) => statsNormalizeLabelsShowName(raw),
            labelFormatFromShowFlags: (showAbsolute, showPercent) =>
                statsLabelFormatFromShowFlags(showAbsolute, showPercent),
            labelShowFlagsFromSeries: (series) => statsLabelShowFlagsFromSeries(series, null),
            labelShowFlagsFromChart: (chart) => statsLabelShowFlagsFromChart(chart),
            chartHasAnyAlwaysVisibleLabels: (chart) => statsChartHasAnyAlwaysVisibleLabels(chart),
            defaultSeriesLabelFlags: () => statsDefaultSeriesLabelFlags(),
            chartSupportsLabelOptions: (type) => statsChartSupportsLabelOptions(type),
        };
        if (state) state.registered = true;
        Logger.log('search-output-stats-engine: registered (Context.statsEngine)');
    },

    _loadLayout() {
        try {
            const raw = Storage.getData(STATS_LAYOUT_STORAGE_KEY, null);
            if (!raw) return statsDefaultStore();
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return statsNormalizeStore(parsed);
        } catch (e) {
            Logger.warn('search-output-stats-engine: loadLayout failed — using defaults', e);
            return statsDefaultStore();
        }
    },

    _saveLayout(layout) {
        try {
            const normalized = statsNormalizeStore(layout);
            Storage.setData(STATS_LAYOUT_STORAGE_KEY, JSON.stringify(normalized));
            const active = statsGetActiveDashboard(normalized);
            Logger.log(
                'search-output-stats-engine: layout saved — '
                + normalized.dashboards.length + ' dashboard(s), active "'
                + (active && active.name ? active.name : '') + '" has '
                + ((active && active.charts) ? active.charts.length : 0) + ' chart(s)'
            );
            return normalized;
        } catch (e) {
            Logger.error('search-output-stats-engine: saveLayout failed', e);
            return null;
        }
    }
};
