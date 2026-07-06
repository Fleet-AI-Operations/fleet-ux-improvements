// search-output-stats-engine.js — Worker Output Search stats dashboard catalog, aggregation, persistence

const STATS_LAYOUT_STORAGE_KEY = 'fleet-ux:dash-stats-dashboard';
const STATS_LAYOUT_SCHEMA_VERSION = 3;

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

const STATS_METRIC_LABELS = {
    count: 'Count of results',
    prompt_version_count: 'Unique task versions'
};

const STATS_AGGREGATIONS = [
    { id: 'count', label: 'Count' },
    { id: 'avg', label: 'Average' },
    { id: 'sum', label: 'Sum' },
    { id: 'min', label: 'Min' },
    { id: 'max', label: 'Max' }
];

const STATS_SCORECARD_GROUP_BY = '__scope__';

const STATS_CHART_TYPE_META = {
    scorecard: { id: 'scorecard', label: 'Scorecard', minSeries: 1, maxSeries: 1, allowCountAxis: true, skipGroupBy: true, defaultHeight: 140 },
    pie: { id: 'pie', label: 'Pie', minSeries: 1, maxSeries: 1, allowCountAxis: true },
    bar: { id: 'bar', label: 'Bar', minSeries: 1, maxSeries: 4, allowCountAxis: true, needsDualAxis: true },
    line: { id: 'line', label: 'Line', minSeries: 1, maxSeries: 4, allowCountAxis: true, needsDualAxis: true },
    polarArea: { id: 'polarArea', label: 'Polar area', minSeries: 1, maxSeries: 1, allowCountAxis: true },
    radar: { id: 'radar', label: 'Radar', minSeries: 1, maxSeries: 6, allowCountAxis: true },
    combo: { id: 'combo', label: 'Bar + line', minSeries: 2, maxSeries: 4, allowCountAxis: true, needsRenderAs: true, needsDualAxis: true },
    scatter: { id: 'scatter', label: 'Scatter', minSeries: 2, maxSeries: 2, allowCountAxis: false, needsPointMode: true },
    bubble: { id: 'bubble', label: 'Bubble', minSeries: 2, maxSeries: 3, allowCountAxis: false, needsPointMode: true }
};

const STATS_CHART_TYPES = Object.values(STATS_CHART_TYPE_META);

const STATS_HEIGHT_PRESETS = [
    { id: 140, label: 'Scorecard (140px)' },
    { id: 180, label: 'Compact (180px)' },
    { id: 220, label: 'Default (220px)' },
    { id: 280, label: 'Tall (280px)' }
];

function statsNewChartId() {
    return 'chart-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function statsNormalizeChartType(type) {
    return STATS_CHART_TYPE_META[type] ? type : 'pie';
}

function statsGetChartTypeMeta(type) {
    return STATS_CHART_TYPE_META[statsNormalizeChartType(type)] || STATS_CHART_TYPE_META.pie;
}

function statsNormalizePointMode(mode) {
    return mode === 'task' ? 'task' : 'bucket';
}

function statsNormalizeYAxis(value) {
    return value === 'y1' ? 'y1' : 'y';
}

function statsDefaultSeriesYAxis(chartType, seriesIndex, renderAs) {
    if (chartType === 'combo') {
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
        currentUserId: (ctx && ctx.currentUserId) || ''
    };
    return lib.applyClientWorkerOutputFilters(items || [], chartFilters, listBounds, sortContext);
}

function statsNormalizeSeriesEntry(s, chartType, seriesIndex) {
    const meta = statsGetChartTypeMeta(chartType);
    const renderAs = s.renderAs === 'line' ? 'line' : 'bar';
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
    return entry;
}

function statsNormalizeChartEntry(c) {
    const type = statsNormalizeChartType(c.type);
    const meta = statsGetChartTypeMeta(type);
    let series = (c.series || []).map((s, i) => statsNormalizeSeriesEntry(s, type, i));
    if (series.length > meta.maxSeries) series = series.slice(0, meta.maxSeries);
    if (series.length < meta.minSeries && meta.minSeries > 0) {
        while (series.length < meta.minSeries) {
            series.push(statsNormalizeSeriesEntry({ metricId: 'count', agg: 'count' }, type, series.length));
        }
    }
    const chart = {
        id: String(c.id),
        title: String(c.title || 'Chart'),
        type,
        groupBy: meta.skipGroupBy ? STATS_SCORECARD_GROUP_BY : String(c.groupBy),
        series,
        height: Number.isFinite(Number(c.height))
            ? Number(c.height)
            : (meta.defaultHeight || 220),
        presetKey: c.presetKey != null ? String(c.presetKey) : null
    };
    if (meta.needsPointMode) {
        chart.pointMode = statsNormalizePointMode(c.pointMode);
    }
    chart.chartFilters = statsNormalizeChartFilters(c.chartFilters, null);
    return chart;
}

function statsDefaultLayout() {
    return {
        schemaVersion: STATS_LAYOUT_SCHEMA_VERSION,
        charts: [
            {
                id: statsNewChartId(),
                title: 'Task status',
                type: 'pie',
                groupBy: 'statuses',
                series: [{ metricId: 'count', agg: 'count', label: '' }],
                height: 220,
                presetKey: 'status'
            },
            {
                id: statsNewChartId(),
                title: 'Avg time by environment (minutes)',
                type: 'line',
                groupBy: 'envKeys',
                series: [
                    { metricId: 'v1_creation_time_minutes', agg: 'avg', label: 'Avg v1 creation (min)', yAxis: 'y' },
                    { metricId: 'qa_time_minutes', agg: 'avg', label: 'Avg QA time (min)', yAxis: 'y1' }
                ],
                height: 240,
                presetKey: 'env-timing'
            }
        ]
    };
}

function statsNormalizeLayout(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.charts)) {
        return statsDefaultLayout();
    }
    const charts = raw.charts
        .filter((c) => c && c.id && c.groupBy && c.type && Array.isArray(c.series) && c.series.length > 0)
        .map((c) => statsNormalizeChartEntry(c));
    if (charts.length === 0) return statsDefaultLayout();
    return { schemaVersion: STATS_LAYOUT_SCHEMA_VERSION, charts };
}

function statsDimensionLabel(scopeKey, resolveScopeLabel) {
    if (typeof resolveScopeLabel === 'function') {
        return resolveScopeLabel(scopeKey);
    }
    return scopeKey;
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
    if (!task) return [];
    const helpfulnessUi = (ctx && ctx.helpfulnessUi) || {};
    const currentUserId = (ctx && ctx.currentUserId) || '';
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
            return lib && typeof lib.itemPromptHistory === 'function' ? lib.itemPromptHistory(item) : [];
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
        default:
            return [];
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

    return {
        dimensions,
        dimensionByKey,
        metrics,
        aggregations: STATS_AGGREGATIONS,
        chartTypes: STATS_CHART_TYPES,
        chartTypeMeta: STATS_CHART_TYPE_META,
        heightPresets: STATS_HEIGHT_PRESETS
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
    if (meta.allowCountAxis) return STATS_AGGREGATIONS;
    return STATS_AGGREGATIONS.filter((a) => a.id !== 'count');
}

function statsSeriesMetricValue(item, seriesEntry, getMetricValue) {
    if (!seriesEntry || typeof getMetricValue !== 'function') return null;
    if (seriesEntry.metricId === 'count') {
        return seriesEntry.agg === 'count' ? 1 : null;
    }
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
            const def = STATS_DIMENSION_DEFS.find((d) => d.key === chart.groupBy);
            const label = (ctx && typeof ctx.resolveScopeLabel === 'function' && def)
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

    if (type === 'combo' && series.length >= 2) {
        const hasBar = series.some((s) => s.renderAs !== 'line');
        const hasLine = series.some((s) => s.renderAs === 'line');
        if (!hasBar || !hasLine) {
            missing.push({ id: 'renderAs', label: 'Bar and line series' });
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

    for (const s of series) {
        if (s.metricId === 'count') {
            if (!meta.allowCountAxis && s.agg === 'count') {
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

    return { ok: true, missing: [] };
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
    return nums.length;
}

function statsAggregateCategorical(chart, items, catalog, ctx) {
    const lib = Context.dashboardLib;
    const dim = statsFindDimension(catalog, chart.groupBy);
    if (!dim) return { labels: [], datasets: [] };

    const optionOrder = dim.options.map((o) => o.id);
    const labelById = new Map(dim.options.map((o) => [o.id, o.label]));
    const buckets = new Map();
    for (const id of optionOrder) {
        buckets.set(id, { counts: [], series: (chart.series || []).map(() => []) });
    }
    const unknownKey = '__unknown__';
    buckets.set(unknownKey, { counts: [], series: (chart.series || []).map(() => []) });

    const getMetricValue = ctx && ctx.getMetricValue;
    for (const item of items || []) {
        const values = statsGetDimensionValues(item, chart.groupBy, lib, ctx);
        const keys = values.length ? values : [unknownKey];
        for (const key of keys) {
            if (!buckets.has(key)) {
                buckets.set(key, { counts: [], series: (chart.series || []).map(() => []) });
            }
            const bucket = buckets.get(key);
            bucket.counts.push(1);
            (chart.series || []).forEach((s, i) => {
                if (s.metricId === 'count' && s.agg === 'count') {
                    bucket.series[i].push(1);
                } else if (typeof getMetricValue === 'function') {
                    const v = getMetricValue(item, s.metricId);
                    if (v != null && Number.isFinite(v)) bucket.series[i].push(v);
                }
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

    const datasets = (chart.series || []).map((s, si) => {
        const data = keysOut.map((key) => {
            const bucket = buckets.get(key);
            if (!bucket) return null;
            if (s.metricId === 'count' && s.agg === 'count') {
                return bucket.counts.length;
            }
            return statsApplyAgg(bucket.series[si], s.agg);
        });
        const metric = statsFindMetric(catalog, s.metricId);
        const label = s.label || (metric && metric.label) || s.metricId;
        return {
            label,
            data,
            metricId: s.metricId,
            agg: s.agg,
            renderAs: s.renderAs
        };
    });

    return { labels, datasets };
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
    if (type === 'scatter' || type === 'bubble') {
        return statsAggregatePointChart(chart, scopedItems, catalog, ctx);
    }
    return statsAggregateCategorical(chart, scopedItems, catalog, ctx);
}

function statsDefaultBuilderDraft(catalog) {
    const firstDim = (catalog && catalog.dimensions && catalog.dimensions[0]) || null;
    return {
        id: null,
        title: '',
        type: 'pie',
        groupBy: firstDim ? firstDim.key : '',
        series: [{ metricId: 'count', agg: 'count', label: '' }],
        height: 220,
        pointMode: 'bucket',
        presetKey: null,
        chartFilters: statsEmptyChartFilters()
    };
}

const plugin = {
    id: 'search-output-stats-engine',
    name: 'Search Output stats engine',
    description: 'Worker Output Search stats dashboard catalog, aggregation, and persistence',
    _version: '3.0',
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
            loadLayout: () => self._loadLayout(),
            saveLayout: (layout) => self._saveLayout(layout),
            defaultLayout: () => statsDefaultLayout(),
            normalizeLayout: (raw) => statsNormalizeLayout(raw),
            newChartId: () => statsNewChartId(),
            buildCatalog: (ctx) => statsBuildCatalog(ctx),
            validateChart: (chart, catalog, items, ctx) => statsValidateChart(chart, catalog, items, ctx),
            aggregateChart: (chart, items, catalog, ctx) => statsAggregateChart(chart, items, catalog, ctx),
            defaultBuilderDraft: (catalog) => statsDefaultBuilderDraft(catalog),
            emptyChartFilters: () => statsEmptyChartFilters(),
            normalizeChartFilters: (raw, listBounds) => statsNormalizeChartFilters(raw, listBounds),
            chartFiltersActive: (chartFilters, listBounds) => statsChartFiltersActive(chartFilters, listBounds),
            getChartTypeMeta: (type) => statsGetChartTypeMeta(type),
            aggregationsForChartType: (type) => statsAggregationsForChartType(type),
            chartTypes: () => STATS_CHART_TYPES.slice(),
            aggregations: () => STATS_AGGREGATIONS.slice(),
            heightPresets: () => STATS_HEIGHT_PRESETS.slice(),
            taskPointCap: STATS_TASK_POINT_CAP
        };
        if (state) state.registered = true;
        Logger.log('search-output-stats-engine: registered (Context.statsEngine)');
    },

    _loadLayout() {
        try {
            const raw = Storage.getData(STATS_LAYOUT_STORAGE_KEY, null);
            if (!raw) return statsDefaultLayout();
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return statsNormalizeLayout(parsed);
        } catch (e) {
            Logger.warn('search-output-stats-engine: loadLayout failed — using defaults', e);
            return statsDefaultLayout();
        }
    },

    _saveLayout(layout) {
        try {
            const normalized = statsNormalizeLayout(layout);
            Storage.setData(STATS_LAYOUT_STORAGE_KEY, JSON.stringify(normalized));
            Logger.log('search-output-stats-engine: layout saved — ' + normalized.charts.length + ' chart(s)');
            return normalized;
        } catch (e) {
            Logger.error('search-output-stats-engine: saveLayout failed', e);
            return null;
        }
    }
};
