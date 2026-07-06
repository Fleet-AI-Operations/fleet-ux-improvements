// search-output-stats-engine.js — Worker Output Search stats dashboard catalog, aggregation, persistence

const STATS_LAYOUT_STORAGE_KEY = 'fleet-ux:dash-stats-dashboard';
const STATS_LAYOUT_SCHEMA_VERSION = 1;

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

const STATS_AGGREGATIONS = [
    { id: 'count', label: 'Count' },
    { id: 'avg', label: 'Average' },
    { id: 'sum', label: 'Sum' },
    { id: 'min', label: 'Min' },
    { id: 'max', label: 'Max' }
];

const STATS_CHART_TYPES = [
    { id: 'pie', label: 'Pie' },
    { id: 'bar', label: 'Bar' },
    { id: 'line', label: 'Line' }
];

const STATS_HEIGHT_PRESETS = [
    { id: 180, label: 'Compact (180px)' },
    { id: 220, label: 'Default (220px)' },
    { id: 280, label: 'Tall (280px)' }
];

function statsNewChartId() {
    return 'chart-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function statsCloneLayout(layout) {
    return JSON.parse(JSON.stringify(layout));
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
                series: [{ metricId: 'count', agg: 'count', label: 'Count' }],
                height: 220,
                presetKey: 'status'
            },
            {
                id: statsNewChartId(),
                title: 'Avg time by environment (minutes)',
                type: 'line',
                groupBy: 'envKeys',
                series: [
                    { metricId: 'v1_creation_time_minutes', agg: 'avg', label: 'Avg v1 creation (min)' },
                    { metricId: 'qa_time_minutes', agg: 'avg', label: 'Avg QA time (min)' }
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
        .map((c) => ({
            id: String(c.id),
            title: String(c.title || 'Chart'),
            type: c.type === 'bar' || c.type === 'line' ? c.type : 'pie',
            groupBy: String(c.groupBy),
            series: c.series.map((s) => ({
                metricId: String(s.metricId || 'count'),
                agg: String(s.agg || 'count'),
                label: s.label != null ? String(s.label) : ''
            })),
            height: Number.isFinite(Number(c.height)) ? Number(c.height) : 220,
            presetKey: c.presetKey != null ? String(c.presetKey) : null
        }));
    if (charts.length === 0) return statsDefaultLayout();
    return { schemaVersion: STATS_LAYOUT_SCHEMA_VERSION, charts };
}

function statsDimensionLabel(scopeKey, resolveScopeLabel) {
    if (typeof resolveScopeLabel === 'function') {
        return resolveScopeLabel(scopeKey);
    }
    return scopeKey;
}

function statsGetDimensionValues(item, dimKey, lib, ctx) {
    const task = item && item.task;
    if (!task) return [];
    const helpfulnessUi = (ctx && ctx.helpfulnessUi) || {};
    const currentUserId = (ctx && ctx.currentUserId) || '';
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
        default:
            return [];
    }
}

function statsResolveOptionLabel(options, id) {
    const match = (options || []).find((o) => o && o.id === id);
    return (match && match.label) ? match.label : String(id);
}

function statsBuildCatalog(ctx) {
    const filterListOptions = (ctx && ctx.filterListOptions) || {};
    const items = (ctx && ctx.items) || [];
    const lib = Context.dashboardLib;
    const resolveScopeLabel = ctx && ctx.resolveScopeLabel;
    const getMetricValue = ctx && ctx.getMetricValue;
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

    const metrics = [{ id: 'count', label: 'Count', type: 'count', requiresHydration: false }];
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
            label: field.label || field.id,
            type: 'number',
            requiresHydration: Boolean(field.hydrateHint),
            sampleCount
        });
    }

    return { dimensions, dimensionByKey, metrics, aggregations: STATS_AGGREGATIONS, chartTypes: STATS_CHART_TYPES, heightPresets: STATS_HEIGHT_PRESETS };
}

function statsFindDimension(catalog, key) {
    return (catalog && catalog.dimensionByKey && catalog.dimensionByKey[key]) || null;
}

function statsFindMetric(catalog, metricId) {
    return (catalog && catalog.metrics || []).find((m) => m.id === metricId) || null;
}

function statsValidateChart(chart, catalog, items, ctx) {
    const missing = [];
    if (!chart || !catalog) {
        return { ok: false, missing: [{ id: 'chart', label: 'Chart' }] };
    }
    const dim = statsFindDimension(catalog, chart.groupBy);
    const series = chart.series || [];
    if (!dim) {
        const def = STATS_DIMENSION_DEFS.find((d) => d.key === chart.groupBy);
        const label = (ctx && typeof ctx.resolveScopeLabel === 'function' && def)
            ? ctx.resolveScopeLabel(def.scopeKey)
            : chart.groupBy;
        missing.push({ id: chart.groupBy, label });
    }
    if (chart.type === 'pie' && series.length > 1) {
        missing.push({ id: 'series', label: 'Pie chart series' });
    }
    for (const s of series) {
        if (s.metricId === 'count') continue;
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

function statsAggregateChart(chart, items, catalog, ctx) {
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
        return { label, data, metricId: s.metricId, agg: s.agg };
    });

    return { labels, datasets };
}

function statsDefaultBuilderDraft(catalog) {
    const firstDim = (catalog && catalog.dimensions && catalog.dimensions[0]) || null;
    return {
        id: null,
        title: '',
        type: 'pie',
        groupBy: firstDim ? firstDim.key : '',
        series: [{ metricId: 'count', agg: 'count', label: 'Count' }],
        height: 220,
        presetKey: null
    };
}

const plugin = {
    id: 'search-output-stats-engine',
    name: 'Search Output stats engine',
    description: 'Worker Output Search stats dashboard catalog, aggregation, and persistence',
    _version: '1.0',
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
            chartTypes: () => STATS_CHART_TYPES.slice(),
            aggregations: () => STATS_AGGREGATIONS.slice(),
            heightPresets: () => STATS_HEIGHT_PRESETS.slice()
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
