// search-output-stats-pane.js — Worker Output Search stats pane (Ratings)

const DASH_PREFETCH_KINDS = ['openDisputes', 'resolvedDisputes', 'pendingFlags', 'resolvedFlags'];
const STATS_SCORECARD_ROW_MIN_WIDTH_PX = 180;
const STATS_CIRCULAR_ROW_MIN_WIDTH_PX = 240;
const STATS_SCORECARD_ROW_GAP_PX = 12;
const STATS_SCORECARD_ROW_MAX = 3;
const STATS_CIRCULAR_ROW_MAX = 2;
const STATS_CIRCULAR_CHART_TYPES = new Set(['pie', 'polarArea', 'radar']);
const STATS_CHART_CARD_STYLE_ID = 'wf-dash-stats-chart-card-styles';
const STATS_LINE_BORDER_WIDTH = 2.25;
const STATS_LINE_TENSION = 0.2;
/** Max content width for Ratings tab (cards stay readable when the pane is wide). */
const RATINGS_CONTENT_MAX_WIDTH_PX = 640;

function dashEscHtml(value) {
    const lib = Context.dashboardLib;
    if (lib && typeof lib.escHtml === 'function') return lib.escHtml(value);
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const searchOutputStatsPaneMethods = {
    _statsPanelHtml() {
        const box = this._panelBoxStyle();
        const statsTab = this._state ? (this._state.statsTab || 'stats') : 'stats';
        const panelScroll = 'flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 14px; flex-direction: column; gap: 12px;';
        const statsPanel = 'flex: 1; min-height: 0; overflow: hidden; padding: 14px; flex-direction: column; gap: 12px;';
        return ''
            + '<div data-wf-dash-stats-sliver aria-hidden="true"></div>'
            + '<div data-wf-dash-stats-body style="display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; overflow: hidden; ' + box + '">'
            + '<div data-wf-dash-stats-header style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0; padding: 0 8px; border-bottom: 1px solid var(--border, #e2e8f0); min-height: 36px;">'
            + '<nav style="display: flex; align-items: center; gap: 0; min-width: 0;" aria-label="Stats and ratings">'
            + '<button type="button" data-wf-dash-stats-tab="stats" style="' + this._statsTabStyle(statsTab === 'stats') + '">Stats</button>'
            + '<button type="button" data-wf-dash-stats-tab="ratings" style="' + this._statsTabStyle(statsTab === 'ratings') + '">Ratings</button>'
            + '</nav>'
            + '<div data-wf-dash-stats-header-actions style="display: flex; align-items: center; justify-content: flex-end; flex: 1; min-width: 0;"></div>'
            + '</div>'
            + '<div id="wf-dash-stats-panel-stats" style="' + statsPanel + '; display: ' + (statsTab === 'stats' ? 'flex' : 'none') + ';">'
            + this._statsChartsPanelContentHtml()
            + '</div>'
            + '<div id="wf-dash-stats-panel-ratings" style="' + panelScroll + '; display: ' + (statsTab === 'ratings' ? 'flex' : 'none') + ';">'
            + '<div id="wf-dash-ratings-content" style="display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: ' + RATINGS_CONTENT_MAX_WIDTH_PX + 'px; margin: 0 auto; box-sizing: border-box;">'
            + this._ratingsAboutSectionHtml()
            + '<div id="wf-dash-ratings-warnings" style="display: none; flex-direction: column; gap: 6px;"></div>'
            + this._ratingsToolbarHtml()
            + '<div id="wf-dash-ratings-cards" style="display: flex; flex-direction: column; gap: 12px;"></div>'
            + '</div>'
            + '</div>'
            + '</div>';
    },

    _statsChartsPanelContentHtml() {
        const btnStyle = 'padding: 2px 8px; font-size: 10px;';
        return ''
            + '<div id="wf-dash-stats-warnings" style="display: none; flex-direction: column; gap: 6px; flex-shrink: 0;"></div>'
            + '<div id="wf-dash-stats-toolbar" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0;">'
            + '<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; flex: 1 1 auto;">'
            + '<div id="wf-dash-stats-scope-summary" style="font-size: 11px; color: var(--muted-foreground, #64748b); min-width: 0; flex: 0 1 auto;"></div>'
            + '<div id="wf-dash-stats-dashboard-switcher" style="display: none; align-items: center; gap: 6px; flex: 0 1 auto; min-width: 0;">'
            + '<select id="wf-dash-stats-dashboard-select" data-wf-dash-stats-dashboard-select="1" aria-label="Dashboard" style="max-width: 160px; min-width: 100px; box-sizing: border-box; padding: 2px 6px; font-size: 11px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; background: var(--card, #fff); color: var(--foreground, #0f172a);"></select>'
            + '<button type="button" data-wf-dash-stats-dashboard-rename="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="' + btnStyle + '" title="Rename dashboard">Rename</button>'
            + '<button type="button" data-wf-dash-stats-dashboard-add="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="' + btnStyle + '" title="Add dashboard">Add</button>'
            + '<button type="button" data-wf-dash-stats-dashboard-delete="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="' + btnStyle + '" title="Delete dashboard">Delete</button>'
            + '</div>'
            + '</div>'
            + '<div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; flex: 1 1 auto; min-width: 0;">'
            + '<button type="button" data-wf-dash-stats-horizontal-stack="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="flex-shrink: 0;" title="Allow scorecards and circular charts to share a row">Stack horizontally: On</button>'
            + '<button type="button" data-wf-dash-stats-reset-dashboard="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="flex-shrink: 0;">Reset</button>'
            + '<button type="button" data-wf-dash-stats-export-dashboard="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="flex-shrink: 0;">Export settings</button>'
            + '<button type="button" data-wf-dash-stats-export-dashboard-image="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="flex-shrink: 0;">Export image</button>'
            + '<button type="button" data-wf-dash-stats-import-json="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="flex-shrink: 0;">Import JSON</button>'
            + '<button type="button" data-wf-dash-stats-build="1" class="' + this._dashBtnClass('secondary', 'nav') + '" style="flex-shrink: 0;">Build Chart</button>'
            + '</div>'
            + '</div>'
            + '<div id="wf-dash-stats-empty" style="display: none; flex: 1; min-height: 0; align-items: center; justify-content: center; text-align: center; font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;"></div>'
            + '<div id="wf-dash-stats-dashboard" style="display: none; flex-direction: column; gap: 12px; flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto;">'
            + '<div id="wf-dash-stats-chart-list" data-wf-dash-stats-chart-list="1" style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 24px;"></div>'
            + '</div>'
            + '<div id="wf-dash-stats-builder" style="display: none; flex: 1; min-height: 0; flex-direction: column; overflow: hidden;"></div>';
    },

    _ensureStatsLayout() {
        const engine = Context.statsEngine;
        if (!engine) {
            return { schemaVersion: 7, activeDashboardId: '', allowHorizontalStack: true, dashboards: [] };
        }
        if (!this._state.statsLayout) {
            this._state.statsLayout = typeof engine.normalizeStore === 'function'
                ? engine.normalizeStore(engine.loadLayout())
                : engine.loadLayout();
        }
        return this._state.statsLayout;
    },

    _persistStatsLayout() {
        const engine = Context.statsEngine;
        if (!engine || !this._state.statsLayout) return;
        this._state.statsLayout = engine.saveLayout(this._state.statsLayout) || this._state.statsLayout;
    },

    _activeStatsDashboard() {
        const store = this._ensureStatsLayout();
        const dashboards = (store && store.dashboards) || [];
        return dashboards.find((d) => d.id === store.activeDashboardId) || dashboards[0] || {
            id: '',
            name: 'Dashboard 1',
            charts: []
        };
    },

    _statsDashboardOptionsHtml(selectedId) {
        const store = this._ensureStatsLayout();
        const selected = selectedId != null ? String(selectedId) : String(store.activeDashboardId || '');
        return ((store && store.dashboards) || []).map((d) =>
            '<option value="' + dashEscHtml(d.id) + '"' + (d.id === selected ? ' selected' : '') + '>'
            + dashEscHtml(d.name) + '</option>'
        ).join('');
    },

    _setActiveStatsDashboard(dashboardId) {
        const engine = Context.statsEngine;
        if (!engine || typeof engine.setActiveDashboardId !== 'function') return;
        const next = engine.setActiveDashboardId(this._ensureStatsLayout(), dashboardId);
        this._state.statsLayout = next;
        this._persistStatsLayout();
        Logger.log('search-output-stats-pane: active dashboard set — ' + dashboardId);
        void this._renderStatsPanel();
    },

    _renameActiveStatsDashboard() {
        const engine = Context.statsEngine;
        const active = this._activeStatsDashboard();
        if (!engine || !active || typeof engine.renameDashboard !== 'function') return;
        const nextName = window.prompt('Rename dashboard', active.name || '');
        if (nextName == null) return;
        const trimmed = String(nextName).trim();
        if (!trimmed) {
            Logger.warn('search-output-stats-pane: dashboard rename skipped — empty name');
            return;
        }
        this._state.statsLayout = engine.renameDashboard(this._ensureStatsLayout(), active.id, trimmed);
        this._persistStatsLayout();
        Logger.log('search-output-stats-pane: dashboard renamed — ' + trimmed);
        this._syncStatsToolbarUi();
        void this._renderStatsPanel();
    },

    _addStatsDashboard() {
        const engine = Context.statsEngine;
        if (!engine || typeof engine.addDashboard !== 'function') return;
        const store = this._ensureStatsLayout();
        const max = engine.maxDashboards || 5;
        if ((store.dashboards || []).length >= max) {
            Logger.warn('search-output-stats-pane: add dashboard blocked — at limit ' + max);
            return;
        }
        this._state.statsLayout = engine.addDashboard(store);
        this._persistStatsLayout();
        const active = this._activeStatsDashboard();
        Logger.log('search-output-stats-pane: dashboard added — ' + (active && active.name));
        void this._renderStatsPanel();
    },

    _deleteActiveStatsDashboard() {
        const engine = Context.statsEngine;
        const store = this._ensureStatsLayout();
        const active = this._activeStatsDashboard();
        if (!engine || !active || typeof engine.deleteDashboard !== 'function') return;
        if ((store.dashboards || []).length <= 1) {
            Logger.warn('search-output-stats-pane: delete dashboard blocked — last remaining');
            return;
        }
        const confirmed = confirm(
            'Delete dashboard "' + (active.name || 'Dashboard') + '"? Its charts will be removed. This cannot be undone.'
        );
        if (!confirmed) return;
        this._state.statsLayout = engine.deleteDashboard(store, active.id);
        this._persistStatsLayout();
        Logger.log('search-output-stats-pane: dashboard deleted — ' + active.id);
        void this._renderStatsPanel();
    },

    _copyStatsChartToDashboard(chartId, toDashboardId) {
        const engine = Context.statsEngine;
        if (!engine || !chartId || !toDashboardId || typeof engine.copyChartToDashboard !== 'function') return;
        const active = this._activeStatsDashboard();
        const result = engine.copyChartToDashboard(
            this._ensureStatsLayout(),
            chartId,
            active && active.id,
            toDashboardId
        );
        if (!result || !result.chart) {
            Logger.warn('search-output-stats-pane: copy chart failed — ' + chartId + ' → ' + toDashboardId);
            return;
        }
        this._state.statsLayout = result.store;
        this._persistStatsLayout();
        const target = engine.findDashboard
            ? engine.findDashboard(result.store, toDashboardId)
            : null;
        Logger.log(
            'search-output-stats-pane: chart copied — '
            + (result.chart.title || chartId)
            + ' → '
            + (target && target.name ? target.name : toDashboardId)
        );
    },

    _statsCatalogCtx(items) {
        const lib = Context.dashboardLib;
        const hydrateHintIds = new Set(
            ((lib && lib.manualFilterFields) || [])
                .filter((f) => f.hydrateHint)
                .map((f) => f.id)
        );
        const dash = this;
        return {
            filterListOptions: this._state.filterListOptions || {},
            listBounds: this._listBoundsFromOptions(this._state.filterListOptions || {}),
            items: items || [],
            helpfulnessUi: this._state.helpfulnessUi || {},
            currentUserId: typeof this._dashGetCurrentUserId === 'function' ? this._dashGetCurrentUserId() : '',
            sessionQaUi: this._state.sessionQaUi || {},
            resolveScopeLabel: (scopeKey) => (
                typeof this._filterScopeLabel === 'function' ? this._filterScopeLabel(scopeKey) : scopeKey
            ),
            getMetricValue: (item, fieldId) => {
                if (hydrateHintIds.has(fieldId) && (!item || !item.hydrated)) return null;
                return dash._searchOutputManualFilterValue(item, fieldId);
            },
            getVersionCount: (item) => {
                if (!item || !item.hydrated || !item.task) return null;
                return dash._displayPromptVersionCount(item.task);
            }
        };
    },

    _setStatsViewMode(mode) {
        const next = mode === 'builder' ? 'builder' : 'dashboard';
        if (this._state.statsViewMode === next) return;
        this._state.statsViewMode = next;
        this._syncStatsToolbarUi();
        if (next === 'dashboard') {
            this._destroyStatsBuilderPreview();
            this._state.statsBuilderDraft = null;
            this._state.statsBuilderEditId = null;
            this._state.statsBuilderDashboardId = null;
            void this._renderStatsPanel();
        } else {
            void this._renderStatsBuilder();
        }
        Logger.log('search-output-stats-pane: stats view ' + next);
    },

    _openStatsBuilder(chartId) {
        const engine = Context.statsEngine;
        const active = this._activeStatsDashboard();
        const store = this._ensureStatsLayout();
        const items = this._getStatsScopeItems();
        const catalog = engine ? engine.buildCatalog(this._statsCatalogCtx(items)) : null;
        if (chartId) {
            let existing = null;
            let sourceDashboardId = active && active.id;
            for (const dash of (store.dashboards || [])) {
                const found = (dash.charts || []).find((c) => c.id === chartId);
                if (found) {
                    existing = found;
                    sourceDashboardId = dash.id;
                    break;
                }
            }
            this._state.statsBuilderDraft = existing
                ? JSON.parse(JSON.stringify(existing))
                : (engine ? engine.defaultBuilderDraft(catalog) : null);
            this._state.statsBuilderEditId = chartId;
            this._state.statsBuilderDashboardId = sourceDashboardId;
        } else {
            this._state.statsBuilderDraft = engine ? engine.defaultBuilderDraft(catalog) : null;
            this._state.statsBuilderEditId = null;
            this._state.statsBuilderDashboardId = active && active.id;
        }
        if (this._state.statsBuilderDraft) {
            this._ensureStatsBuilderChartFilters(this._state.statsBuilderDraft);
            if (this._state.statsBuilderDashboardId) {
                this._state.statsBuilderDraft.dashboardId = this._state.statsBuilderDashboardId;
            }
        }
        this._setStatsViewMode('builder');
        void this._renderStatsBuilder();
    },

    _closeStatsBuilder() {
        this._state.statsBuilderDashboardId = null;
        this._setStatsViewMode('dashboard');
    },

    _statsNormalizeChartType(type) {
        if (type === 'bar' || type === 'line' || type === 'combo') return 'barLine';
        return type;
    },

    _statsIsBarLineChart(chart) {
        return this._statsNormalizeChartType(chart && chart.type) === 'barLine';
    },

    _statsValueAxisId(chart, yAxis) {
        const valueScale = yAxis === 'y1' ? 'y1' : 'y';
        if (chart.orientation === 'horizontal') {
            return valueScale === 'y1' ? 'x1' : 'x';
        }
        return valueScale;
    },

    _draftToChartObject(draft, engine) {
        const engineMeta = engine.getChartTypeMeta(draft.type);
        const chart = {
            id: draft.id || '__preview__',
            title: String(draft.title || 'Preview').trim() || 'Preview',
            type: draft.type || 'pie',
            groupBy: engineMeta.skipGroupBy ? '__scope__' : draft.groupBy,
            series: (draft.series || []).map((s) => {
                const entry = {
                    metricId: s.metricId,
                    agg: s.agg,
                    label: s.label || ''
                };
                if (engineMeta.needsRenderAs) {
                    entry.renderAs = s.renderAs === 'line' ? 'line' : 'bar';
                    if (s.spread === 'stddevBand') entry.spread = 'stddevBand';
                }
                if (engineMeta.needsDualAxis) {
                    entry.yAxis = s.yAxis === 'y1' ? 'y1' : 'y';
                }
                if (entry.renderAs === 'line' && engineMeta.needsLineAreaLayout) {
                    entry.lineStyle = s.lineStyle === 'shaded' ? 'shaded' : 'line';
                }
                if (engine.seriesAllowsSegment && engine.seriesAllowsSegment(draft.type, entry)) {
                    if (s.segmentBy) entry.segmentBy = s.segmentBy;
                }
                if (engine.chartSupportsLabelOptions && engine.chartSupportsLabelOptions(draft.type)) {
                    const abs = s.labelShowAbsolute != null ? !!s.labelShowAbsolute : true;
                    const pct = !!s.labelShowPercent;
                    entry.labelShowAbsolute = abs;
                    entry.labelShowPercent = pct;
                    entry.labelsShowName = !!s.labelsShowName;
                    entry.labelsAlwaysVisible = !!s.labelsAlwaysVisible;
                    entry.labelFormat = engine.labelFormatFromShowFlags
                        ? engine.labelFormatFromShowFlags(abs, pct)
                        : (abs && pct ? 'both' : (pct ? 'percent' : 'absolute'));
                }
                return entry;
            }),
            height: this._statsResolvedChartHeight(draft),
            presetKey: draft.presetKey || null,
            chartFilters: draft.chartFilters || {}
        };
        if (engineMeta.needsPointMode) {
            chart.pointMode = draft.pointMode === 'task' ? 'task' : 'bucket';
        }
        if (engineMeta.needsBarLayout) {
            chart.barLayout = draft.barLayout === 'stacked' ? 'stacked' : 'grouped';
        }
        if (engineMeta.needsOrientation) {
            chart.orientation = draft.orientation === 'horizontal' ? 'horizontal' : 'vertical';
        }
        if (engineMeta.needsLineAreaLayout) {
            chart.lineAreaLayout = draft.lineAreaLayout === 'stacked' ? 'stacked' : 'origin';
        }
        if (engineMeta.needsBarLayout && engine.normalizeCategorySort) {
            chart.categorySort = engine.normalizeCategorySort(draft.categorySort, chart.series.length);
        }
        if (engineMeta.allowsHorizontalStack) {
            chart.allowHorizontalStack = draft.allowHorizontalStack !== false;
        }
        return chart;
    },

    _saveStatsBuilderDraft() {
        const engine = Context.statsEngine;
        const draft = this._state.statsBuilderDraft;
        if (!engine || !draft) return;
        this._syncStatsBuilderDraftFromForm();
        const items = this._getStatsScopeItems();
        const catalog = engine.buildCatalog(this._statsCatalogCtx(items));
        const chart = this._draftToChartObject(draft, engine);
        const validation = engine.validateChart(chart, catalog, items, this._statsCatalogCtx(items));
        if (!validation.ok) {
            Logger.warn('search-output-stats-pane: builder save blocked — missing ' + (validation.missing[0] && validation.missing[0].label));
            this._renderStatsBuilderValidation(validation.missing);
            return;
        }
        const store = this._ensureStatsLayout();
        const active = this._activeStatsDashboard();
        const targetId = String(draft.dashboardId || this._state.statsBuilderDashboardId || (active && active.id) || '');
        const targetDash = (store.dashboards || []).find((d) => d.id === targetId)
            || active;
        if (!targetDash) {
            Logger.warn('search-output-stats-pane: builder save blocked — no target dashboard');
            return;
        }
        chart.id = draft.id || engine.newChartId();
        chart.title = String(draft.title || 'Chart').trim() || 'Chart';
        const listBounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        chart.chartFilters = engine.normalizeChartFilters
            ? engine.normalizeChartFilters(draft.chartFilters, listBounds)
            : (draft.chartFilters || {});
        const editId = this._state.statsBuilderEditId;
        if (editId) {
            let sourceDash = null;
            let sourceIdx = -1;
            for (const dash of store.dashboards || []) {
                const idx = (dash.charts || []).findIndex((c) => c.id === editId);
                if (idx >= 0) {
                    sourceDash = dash;
                    sourceIdx = idx;
                    break;
                }
            }
            if (sourceDash && sourceDash.id === targetDash.id && sourceIdx >= 0) {
                targetDash.charts[sourceIdx] = chart;
            } else if (sourceDash && sourceIdx >= 0) {
                sourceDash.charts.splice(sourceIdx, 1);
                targetDash.charts.push(chart);
            } else {
                targetDash.charts.push(chart);
                Logger.debug('search-output-stats-pane: edited chart id not found — appended to target');
            }
        } else {
            targetDash.charts.push(chart);
        }
        if (typeof engine.setActiveDashboardId === 'function') {
            this._state.statsLayout = engine.setActiveDashboardId(store, targetDash.id);
        } else {
            store.activeDashboardId = targetDash.id;
            this._state.statsLayout = store;
        }
        this._persistStatsLayout();
        Logger.log('search-output-stats-pane: chart saved — ' + chart.title + ' → ' + targetDash.name);
        this._closeStatsBuilder();
    },

    _deleteStatsChart(chartId) {
        if (!chartId) return;
        const dash = this._activeStatsDashboard();
        if (!dash) return;
        dash.charts = (dash.charts || []).filter((c) => c.id !== chartId);
        this._persistStatsLayout();
        Logger.log('search-output-stats-pane: chart deleted — ' + chartId);
        void this._renderStatsPanel();
    },

    _moveStatsChart(chartId, delta) {
        const step = delta === -1 || delta === 1 ? delta : 0;
        if (!chartId || !step) return;
        const dash = this._activeStatsDashboard();
        if (!dash || !dash.charts || dash.charts.length < 2) return;
        const from = dash.charts.findIndex((c) => c.id === chartId);
        if (from < 0) return;
        const to = from + step;
        if (to < 0 || to >= dash.charts.length) return;
        const [moved] = dash.charts.splice(from, 1);
        dash.charts.splice(to, 0, moved);
        this._persistStatsLayout();
        Logger.log(
            'search-output-stats-pane: chart moved '
            + (step < 0 ? 'up' : 'down')
            + ' — '
            + (moved.title || chartId)
        );
        void this._renderStatsPanel();
    },

    _statsDashboardHasChartData() {
        if (!this._state.hasSearched || !this._state.cachedItems) return false;
        if (this._isStatsHydrationBlocking()) return false;
        return this._getStatsScopeItems().length > 0;
    },

    _syncStatsToolbarUi() {
        const tab = this._state.statsTab || 'stats';
        const toolbar = this._q('#wf-dash-stats-toolbar');
        const buildBtn = this._q('[data-wf-dash-stats-build]');
        const resetDashBtn = this._q('[data-wf-dash-stats-reset-dashboard]');
        const stackBtn = this._q('[data-wf-dash-stats-horizontal-stack]');
        const exportDashBtn = this._q('[data-wf-dash-stats-export-dashboard]');
        const exportDashImageBtn = this._q('[data-wf-dash-stats-export-dashboard-image]');
        const importJsonBtn = this._q('[data-wf-dash-stats-import-json]');
        const dashEl = this._q('#wf-dash-stats-dashboard');
        const builderEl = this._q('#wf-dash-stats-builder');
        const panelStats = this._q('#wf-dash-stats-panel-stats');
        const mode = this._state.statsViewMode || 'dashboard';
        const showDashboardToolbar = tab === 'stats' && mode === 'dashboard' && this._statsDashboardHasChartData();
        if (toolbar) {
            toolbar.style.display = (tab === 'stats' && (mode === 'builder' || showDashboardToolbar)) ? 'flex' : 'none';
        }
        if (buildBtn) {
            buildBtn.textContent = mode === 'builder' ? 'Back to dashboard' : 'Build Chart';
        }
        if (stackBtn) {
            const stackOn = this._statsAllowHorizontalStack();
            stackBtn.style.display = (tab === 'stats' && mode === 'dashboard') ? '' : 'none';
            stackBtn.textContent = 'Stack horizontally: ' + (stackOn ? 'On' : 'Off');
            stackBtn.title = stackOn
                ? 'Scorecards and circular charts may share a row'
                : 'Each chart uses full width';
            stackBtn.setAttribute('aria-pressed', stackOn ? 'true' : 'false');
        }
        if (resetDashBtn) {
            resetDashBtn.style.display = (tab === 'stats' && mode === 'dashboard') ? '' : 'none';
        }
        if (exportDashBtn) {
            exportDashBtn.style.display = (tab === 'stats' && mode === 'dashboard') ? '' : 'none';
        }
        if (exportDashImageBtn) {
            exportDashImageBtn.style.display = (tab === 'stats' && mode === 'dashboard') ? '' : 'none';
        }
        if (importJsonBtn) {
            importJsonBtn.style.display = (tab === 'stats' && mode === 'builder') ? '' : 'none';
        }
        if (dashEl) dashEl.style.display = (tab === 'stats' && mode === 'dashboard') ? 'flex' : 'none';
        if (builderEl) {
            builderEl.style.display = (tab === 'stats' && mode === 'builder') ? 'flex' : 'none';
        }
        if (panelStats && tab === 'stats') {
            panelStats.style.overflowY = 'hidden';
            panelStats.style.overflowX = 'hidden';
        }
        const summaryEl = this._q('#wf-dash-stats-scope-summary');
        const switcherEl = this._q('#wf-dash-stats-dashboard-switcher');
        const selectEl = this._q('#wf-dash-stats-dashboard-select');
        const renameBtn = this._q('[data-wf-dash-stats-dashboard-rename]');
        const addBtn = this._q('[data-wf-dash-stats-dashboard-add]');
        const deleteBtn = this._q('[data-wf-dash-stats-dashboard-delete]');
        if (summaryEl && tab === 'stats' && mode === 'dashboard') {
            const items = this._getStatsScopeItems();
            const scopeLabel = this._state.statsUseFiltered !== false ? 'Filtered' : 'All';
            summaryEl.textContent = items.length + ' item' + (items.length === 1 ? '' : 's') + ' · ' + scopeLabel;
            summaryEl.style.display = this._state.hasSearched && this._state.cachedItems ? '' : 'none';
        } else if (summaryEl) {
            summaryEl.textContent = mode === 'builder' ? 'Chart builder' : '';
            summaryEl.style.display = tab === 'stats' && mode === 'builder' ? '' : 'none';
        }
        const showSwitcher = tab === 'stats' && mode === 'dashboard' && this._state.hasSearched && this._state.cachedItems;
        if (switcherEl) {
            switcherEl.style.display = showSwitcher ? 'inline-flex' : 'none';
        }
        if (showSwitcher) {
            const store = this._ensureStatsLayout();
            const engine = Context.statsEngine;
            const max = (engine && engine.maxDashboards) || 5;
            const count = (store.dashboards || []).length;
            if (selectEl) {
                selectEl.innerHTML = this._statsDashboardOptionsHtml(store.activeDashboardId);
            }
            if (addBtn) addBtn.disabled = count >= max;
            if (deleteBtn) deleteBtn.disabled = count <= 1;
            if (renameBtn) renameBtn.disabled = count < 1;
        }
    },

    _statsScopeSegBtn(scope, label, active, divider) {
        const divCls = divider ? ' dv-seg-btn--divider' : '';
        return '<button type="button" data-wf-dash-stats-scope="' + dashEscHtml(scope) + '" class="dv-seg-btn' + divCls + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + dashEscHtml(label) + '</button>';
    },

    _ensureStatsScopeToggle(headerActions) {
        if (!headerActions) return null;
        let wrap = headerActions.querySelector('[data-wf-dash-stats-scope-wrap]');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.setAttribute('data-wf-dash-stats-scope-wrap', 'true');
            wrap.className = 'dv-seg-group';
            wrap.style.cssText = 'margin-right: 8px;';
            wrap.innerHTML = this._statsScopeSegBtn('filtered', 'Filtered', true, true)
                + this._statsScopeSegBtn('all', 'All', false, false);
            const genBtn = headerActions.querySelector('[data-wf-dash-ratings-generate]');
            headerActions.insertBefore(wrap, genBtn ? genBtn.nextSibling : headerActions.firstChild);
        }
        return wrap;
    },

    _ensureRatingsGenerateButton(headerActions) {
        if (!headerActions) return null;
        let btn = headerActions.querySelector('[data-wf-dash-ratings-generate]');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-wf-dash-ratings-generate', '1');
            btn.className = this._dashBtnClass('secondary', 'nav');
            btn.style.marginRight = '8px';
            btn.textContent = 'Generate cards';
            btn.title = 'Generate ratings cards for everyone in the current results';
            const scopeWrap = headerActions.querySelector('[data-wf-dash-stats-scope-wrap]');
            headerActions.insertBefore(btn, scopeWrap || headerActions.firstChild);
        } else {
            const scopeWrap = headerActions.querySelector('[data-wf-dash-stats-scope-wrap]');
            if (scopeWrap && btn.nextSibling !== scopeWrap) {
                headerActions.insertBefore(btn, scopeWrap);
            }
        }
        return btn;
    },

    _syncRatingsGenerateButtonUi() {
        const tab = this._state.statsTab || 'stats';
        const statsCol = this._q('[data-wf-dash-stats-column]');
        const headerActions = statsCol && statsCol.querySelector('[data-wf-dash-stats-header-actions]');
        if (!headerActions) return;
        const btn = this._ensureRatingsGenerateButton(headerActions);
        if (!btn) return;
        const show = tab === 'ratings';
        btn.style.display = show ? '' : 'none';
        const canGenerate = show
            && this._state.hasSearched
            && Array.isArray(this._state.cachedItems)
            && this._state.cachedItems.length > 0;
        btn.disabled = !canGenerate;
    },

    _syncStatsScopeToggleUi() {
        const tab = this._state.statsTab || 'stats';
        const useFiltered = this._state.statsUseFiltered !== false;
        const statsCol = this._q('[data-wf-dash-stats-column]');
        const headerActions = statsCol && statsCol.querySelector('[data-wf-dash-stats-header-actions]');
        if (!headerActions) return;
        this._ensureRatingsGenerateButton(headerActions);
        const wrap = this._ensureStatsScopeToggle(headerActions);
        if (wrap) {
            wrap.style.display = (tab === 'stats' || tab === 'ratings') ? 'inline-flex' : 'none';
            wrap.querySelectorAll('[data-wf-dash-stats-scope]').forEach((btn) => {
                const scope = btn.getAttribute('data-wf-dash-stats-scope');
                const active = scope === 'filtered' ? useFiltered : !useFiltered;
                btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
        }
        this._syncRatingsGenerateButtonUi();
        const summaryEl = this._q('#wf-dash-stats-scope-summary');
        if (summaryEl && tab === 'stats') {
            this._syncStatsToolbarUi();
        }
    },

    _setStatsScope(useFiltered) {
        const next = Boolean(useFiltered);
        if (this._state.statsUseFiltered === next) return;
        this._state.statsUseFiltered = next;
        Logger.log('search-output-stats-pane: stats scope ' + (next ? 'filtered' : 'all'));
        this._syncStatsScopeToggleUi();
        void this._renderStatsPanel();
        if ((this._state.statsTab || 'stats') === 'ratings') {
            this._renderRatingsPanel();
        }
    },

    _isStatsHydrationBlocking() {
        if (typeof this._isTasksHydratingActive === 'function' && this._isTasksHydratingActive()) {
            return true;
        }
        if (this._state.hydrateFetchActive) return true;
        if (this._state.pageHydrateScheduled || this._state.pageHydratePending) return true;
        const phase = String(this._state.searchLoadPhase || '').toLowerCase();
        return phase.includes('hydrat');
    },

    _getStatsScopeItems() {
        if (!this._state.cachedItems) return [];
        if (this._state.statsUseFiltered !== false) {
            return this._state.filteredItems || [];
        }
        return this._getFilterScopeItems();
    },

    _getStatsHydrationWarnings(items) {
        const list = items || [];
        if (list.length === 0) return [];
        const unhydratedCount = list.filter((item) => item && item.hydrated !== true).length;
        const warnings = [];
        if (unhydratedCount > 0) {
            warnings.push(unhydratedCount + ' of ' + list.length + ' result cards not fully hydrated — timing chart uses hydrated cards only');
        }
        if (this._state.hydrateFetchActive) {
            warnings.push('Per-card deep hydrate in progress — timing chart may update when complete');
        }
        return warnings;
    },

    _statsResolvedColor(cssVar, fallback) {
        const host = this._q('[data-wf-dash-stats-body]') || document.documentElement;
        const span = document.createElement('span');
        span.style.color = 'var(' + cssVar + ', ' + fallback + ')';
        host.appendChild(span);
        const color = getComputedStyle(span).color;
        span.remove();
        return color || fallback;
    },

    _statsColorWithAlpha(color, alpha) {
        const a = Number.isFinite(Number(alpha)) ? Math.max(0, Math.min(1, Number(alpha))) : 0.25;
        const c = color != null ? String(color).trim() : '';
        if (!c) return 'rgba(100, 116, 139, ' + a + ')';
        const rgbMatch = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
        if (rgbMatch) {
            return 'rgba(' + rgbMatch[1] + ', ' + rgbMatch[2] + ', ' + rgbMatch[3] + ', ' + a + ')';
        }
        if (/^#[0-9a-f]{8}$/i.test(c)) return c;
        if (/^#[0-9a-f]{6}$/i.test(c)) {
            const hexAlpha = Math.round(a * 255).toString(16).padStart(2, '0');
            return c + hexAlpha;
        }
        if (/^#[0-9a-f]{3}$/i.test(c)) {
            const hexAlpha = Math.round(a * 255).toString(16).padStart(2, '0');
            return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] + hexAlpha;
        }
        return c;
    },

    _statsChartTheme() {
        return {
            foreground: this._statsResolvedColor('--foreground', '#0f172a'),
            muted: this._statsResolvedColor('--muted-foreground', '#64748b'),
            border: this._statsResolvedColor('--border', '#e2e8f0'),
            brand: this._statsResolvedColor('--brand', '#2563eb'),
            brandAlt: this._statsResolvedColor('--primary', '#16a34a'),
            card: this._statsResolvedColor('--card', '#ffffff')
        };
    },

    _statsChartHeightConfig() {
        const engine = Context.statsEngine;
        return {
            min: engine && typeof engine.chartHeightMin === 'function' ? engine.chartHeightMin() : 80,
            max: engine && typeof engine.chartHeightMax === 'function' ? engine.chartHeightMax() : 600,
            step: engine && typeof engine.chartHeightStep === 'function' ? engine.chartHeightStep() : 40,
            default: engine && typeof engine.chartHeightDefault === 'function' ? engine.chartHeightDefault() : 200
        };
    },

    _statsNormalizeChartHeight(raw, fallback) {
        const engine = Context.statsEngine;
        if (engine && typeof engine.normalizeChartHeight === 'function') {
            return engine.normalizeChartHeight(raw, fallback);
        }
        const cfg = this._statsChartHeightConfig();
        let height = Number(raw);
        if (!Number.isFinite(height)) height = Number(fallback);
        if (!Number.isFinite(height)) height = cfg.default;
        height = Math.min(cfg.max, Math.max(cfg.min, height));
        return Math.round(height / cfg.step) * cfg.step;
    },

    _statsResolvedChartHeight(chartOrDraft, fallback) {
        return this._statsNormalizeChartHeight(chartOrDraft && chartOrDraft.height, fallback);
    },

    _statsPiePalette() {
        return ['#2563eb', '#16a34a', '#dc2626', '#ca8a04', '#7c3aed', '#0891b2', '#db2777', '#64748b', '#ea580c', '#4f46e5'];
    },

    _destroyStatsCharts() {
        const charts = this._state.statsCharts;
        if (!charts) return;
        for (const key of Object.keys(charts)) {
            try {
                if (charts[key]) charts[key].destroy();
            } catch (_e) { /* ignore */ }
        }
        this._state.statsCharts = null;
    },

    _destroyStatsBuilderPreview() {
        const ch = this._state.statsBuilderPreviewChart;
        if (ch) {
            try {
                ch.destroy();
            } catch (_e) { /* ignore */ }
            this._state.statsBuilderPreviewChart = null;
        }
        const scorecardEl = this._q('#wf-dash-stats-builder-preview-scorecard');
        if (scorecardEl) scorecardEl.innerHTML = '';
    },

    _scheduleStatsBuilderPreview() {
        if (this._state.statsBuilderPreviewTimer) {
            clearTimeout(this._state.statsBuilderPreviewTimer);
        }
        this._state.statsBuilderPreviewTimer = setTimeout(() => {
            this._state.statsBuilderPreviewTimer = null;
            void this._renderStatsBuilderPreview();
        }, 0);
    },

    _debounceStatsBuilderPreview() {
        if (this._state.statsBuilderPreviewDebounce) {
            clearTimeout(this._state.statsBuilderPreviewDebounce);
        }
        this._state.statsBuilderPreviewDebounce = setTimeout(() => {
            this._state.statsBuilderPreviewDebounce = null;
            void this._renderStatsBuilderPreview();
        }, 300);
    },

    async _renderStatsBuilderPreview() {
        const gen = (this._state.statsBuilderPreviewGen || 0) + 1;
        this._state.statsBuilderPreviewGen = gen;

        const statusEl = this._q('#wf-dash-stats-builder-preview-status');
        const wrapEl = this._q('#wf-dash-stats-builder-preview-wrap');
        const canvas = this._q('#wf-dash-stats-builder-preview-canvas');
        const scorecardEl = this._q('#wf-dash-stats-builder-preview-scorecard');
        if (!wrapEl) return;

        this._destroyStatsBuilderPreview();

        const draft = this._state.statsBuilderDraft;
        const engine = Context.statsEngine;
        if (!draft || !engine) {
            if (statusEl) {
                statusEl.style.display = '';
                statusEl.textContent = 'Stats engine not loaded.';
            }
            return;
        }

        if (!this._state.hasSearched || !this._state.cachedItems) {
            if (statusEl) {
                statusEl.style.display = '';
                statusEl.textContent = 'Run a search to preview charts.';
            }
            return;
        }
        if (this._isStatsHydrationBlocking()) {
            if (statusEl) {
                statusEl.style.display = '';
                statusEl.textContent = 'Preview will load once hydration is complete.';
            }
            return;
        }

        this._syncStatsBuilderDraftFromForm();

        const items = this._getStatsScopeItems();
        if (!items.length) {
            if (statusEl) {
                statusEl.style.display = '';
                statusEl.textContent = 'No results in this scope.';
            }
            return;
        }

        const ctx = this._statsCatalogCtx(items);
        const catalog = engine.buildCatalog(ctx);
        const chart = this._draftToChartObject(draft, engine);
        const validation = engine.validateChart(chart, catalog, items, ctx);

        const previewHeight = this._statsResolvedChartHeight(draft);
        wrapEl.style.height = previewHeight + 'px';

        if (statusEl) {
            if (validation.ok) {
                statusEl.textContent = '';
                statusEl.style.display = 'none';
            } else {
                statusEl.style.display = '';
                statusEl.textContent = 'Preview issue: ' + (validation.missing[0] && (validation.missing[0].label || validation.missing[0].id));
            }
        }

        if (!validation.ok) {
            if (canvas) canvas.style.display = 'none';
            if (scorecardEl) scorecardEl.style.display = 'none';
            return;
        }
        if (this._state.statsBuilderPreviewGen !== gen) return;

        const aggData = engine.aggregateChart(chart, items, catalog, ctx);

        if (chart.type === 'scorecard') {
            if (canvas) canvas.style.display = 'none';
            if (scorecardEl) {
                const theme = this._statsChartTheme();
                const valueText = this._formatStatsScorecardValue(aggData.value);
                const subtitle = aggData.subtitle || aggData.label || '';
                scorecardEl.style.display = 'flex';
                scorecardEl.style.flexDirection = 'column';
                scorecardEl.style.alignItems = 'center';
                scorecardEl.style.justifyContent = 'center';
                scorecardEl.style.height = '100%';
                scorecardEl.innerHTML = '<div style="font-size: 32px; font-weight: 700; line-height: 1.1; color: ' + theme.foreground + '; letter-spacing: -0.02em;">'
                    + dashEscHtml(valueText)
                    + '</div>'
                    + (subtitle
                        ? '<div style="font-size: 11px; color: ' + theme.muted + '; margin-top: 6px; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">'
                            + dashEscHtml(subtitle) + '</div>'
                        : '');
            }
            if (statusEl && !this._statsChartHasRenderableData(chart, aggData)) {
                statusEl.style.display = '';
                statusEl.textContent = this._statsChartEmptyMessage(chart, aggData, catalog);
            }
            return;
        }

        if (!this._statsChartHasRenderableData(chart, aggData)) {
            if (statusEl) {
                statusEl.style.display = '';
                statusEl.textContent = this._statsChartEmptyMessage(chart, aggData, catalog);
            }
            if (canvas) canvas.style.display = 'none';
            if (scorecardEl) scorecardEl.style.display = 'none';
            return;
        }

        if (statusEl) {
            statusEl.textContent = '';
            statusEl.style.display = 'none';
        }

        if (scorecardEl) scorecardEl.style.display = 'none';
        if (canvas) canvas.style.display = 'block';

        const chartApi = Context.chartJs;
        if (!chartApi || typeof chartApi.ensureLoaded !== 'function') {
            if (statusEl) {
                statusEl.style.display = '';
                statusEl.textContent = 'Chart.js not available.';
            }
            return;
        }

        try {
            const Chart = await chartApi.ensureLoaded();
            if (this._state.statsBuilderPreviewGen !== gen
                || (this._state.statsViewMode || 'dashboard') !== 'builder') {
                return;
            }
            const theme = this._statsChartTheme();
            const containerWidth = wrapEl.clientWidth || 0;
            const config = this._statsFinalizeChartJsConfig(
                this._buildChartJsConfig(chart, aggData, theme, containerWidth, catalog),
                chart,
                theme
            );
            this._state.statsBuilderPreviewChart = new Chart(canvas, config);
            if (chart.type === 'bellCurve') {
                this._renderBellCurveStatsSubtitle('builder', aggData);
            } else {
                const subEl = this._q('#wf-dash-stats-builder-preview-subtitle');
                if (subEl) {
                    subEl.textContent = '';
                    subEl.style.display = 'none';
                }
            }
        } catch (e) {
            Logger.warn('search-output-stats-pane: builder preview failed', e);
            if (statusEl) {
                statusEl.style.display = '';
                statusEl.textContent = 'Preview failed to render.';
            }
        }
    },

    _ensureStatsBuilderShell() {
        const el = this._q('#wf-dash-stats-builder');
        if (!el) return null;
        if (!el.querySelector('#wf-dash-stats-builder-scroll')) {
            el.innerHTML = '<div id="wf-dash-stats-builder-scroll" style="flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding-bottom: 4px;">'
                + '<div id="wf-dash-stats-builder-form"></div>'
                + '</div>'
                + '<div id="wf-dash-stats-builder-preview" style="flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; padding: 12px 0 0; border-top: 1px solid var(--border, #e2e8f0); background: var(--card, #fff);">'
                + '<div style="font-size: 11px; font-weight: 600; color: var(--foreground, #0f172a);">Preview</div>'
                + '<div id="wf-dash-stats-builder-preview-status" style="display: none; font-size: 11px; color: var(--muted-foreground, #64748b);"></div>'
                + '<div id="wf-dash-stats-builder-preview-wrap" style="position: relative; width: 100%; border: 1px solid var(--border, #e2e8f0); border-radius: 8px; background: var(--card, #fff); padding: 8px; box-sizing: border-box;">'
                + '<div id="wf-dash-stats-builder-preview-scorecard" style="display: none; height: 100%;"></div>'
                + '<canvas id="wf-dash-stats-builder-preview-canvas" style="display: block; width: 100%; height: 100%;"></canvas>'
                + '</div>'
                + '<div id="wf-dash-stats-builder-preview-subtitle" style="display: none; font-size: 10px; color: var(--muted-foreground, #64748b); text-align: center; line-height: 1.35;"></div>'
                + '</div>';
        }
        return el.querySelector('#wf-dash-stats-builder-form');
    },

    _statsChartFilterScopeKey(draftKey) {
        return 'stats-chart-filter-' + draftKey;
    },

    _statsChartFilterDraftKey(scopeKey) {
        return String(scopeKey || '').replace(/^stats-chart-filter-/, '');
    },

    _ensureStatsBuilderChartFilters(draft) {
        const engine = Context.statsEngine;
        const listBounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        if (engine && typeof engine.normalizeChartFilters === 'function') {
            draft.chartFilters = engine.normalizeChartFilters(draft.chartFilters, listBounds);
        } else if (!draft.chartFilters) {
            draft.chartFilters = engine && typeof engine.emptyChartFilters === 'function'
                ? engine.emptyChartFilters()
                : {};
        }
        return draft.chartFilters;
    },

    _syncStatsChartFiltersFromForm() {
        const draft = this._state.statsBuilderDraft;
        if (!draft) return;
        const lib = Context.dashboardLib;
        const scopes = (lib && lib.filterScopes) || [];
        const chartFilters = this._ensureStatsBuilderChartFilters(draft);
        for (const { draftKey } of scopes) {
            const scopeKey = this._statsChartFilterScopeKey(draftKey);
            chartFilters[draftKey] = this._selectedFromList(scopeKey);
        }
    },

    _renderStatsChartFilterLists(draft) {
        const engine = Context.statsEngine;
        const lib = Context.dashboardLib;
        const scopes = (lib && lib.filterScopes) || [];
        const options = this._state.filterListOptions || {};
        const chartFilters = this._ensureStatsBuilderChartFilters(draft);
        for (const { scopeKey, optionsKey, draftKey } of scopes) {
            const chartScopeKey = this._statsChartFilterScopeKey(draftKey);
            const itemsEl = this._msItemsEl(chartScopeKey);
            const wrap = this._filterScopeWrapEl(chartScopeKey) || this._msWrapEl(chartScopeKey);
            if (!itemsEl) continue;
            const optionItems = options[optionsKey] || [];
            if (optionItems.length === 0) {
                if (wrap) wrap.style.display = 'none';
                continue;
            }
            if (wrap) wrap.style.display = '';
            const scopeLabel = typeof this._filterScopeLabel === 'function'
                ? this._filterScopeLabel(scopeKey)
                : draftKey;
            const emptyHint = 'No ' + scopeLabel.toLowerCase() + ' in scope';
            itemsEl.innerHTML = this._multiSelectItemsHtml(
                chartScopeKey, optionItems, emptyHint, false, false
            );
            const selected = new Set(chartFilters[draftKey] || []);
            itemsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                cb.checked = selected.has(cb.value);
            });
            this._updateMsCount(chartScopeKey);
            this._syncMsDropdown(chartScopeKey);
        }
    },

    _onStatsChartFilterMsChange(scopeKey) {
        if ((this._state.statsViewMode || 'dashboard') !== 'builder') return;
        this._syncStatsChartFiltersFromForm();
        this._updateMsCount(scopeKey);
        this._syncMsDropdown(scopeKey);
        this._scheduleStatsBuilderPreview();
    },

    _statsChartFilterSummary(chart) {
        const engine = Context.statsEngine;
        const lib = Context.dashboardLib;
        const listBounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        const chartFilters = engine && typeof engine.normalizeChartFilters === 'function'
            ? engine.normalizeChartFilters(chart && chart.chartFilters, listBounds)
            : ((chart && chart.chartFilters) || {});
        if (!engine || typeof engine.chartFiltersActive !== 'function'
            || !engine.chartFiltersActive(chartFilters, listBounds)) {
            return '';
        }
        const options = this._state.filterListOptions || {};
        const scopes = (lib && lib.filterScopes) || [];
        const parts = [];
        for (const { scopeKey, optionsKey, draftKey } of scopes) {
            const selected = chartFilters[draftKey] || [];
            if (!selected.length) continue;
            const optionList = options[optionsKey] || [];
            const labelById = new Map(optionList.map((o) => [o.id, o.label || o.id]));
            const scopeLabel = typeof this._filterScopeLabel === 'function'
                ? this._filterScopeLabel(scopeKey)
                : draftKey;
            const valueLabels = selected.map((id) => labelById.get(id) || id);
            parts.push(scopeLabel + ': ' + valueLabels.join(', '));
        }
        return parts.join(' · ');
    },

    _statsChartStackKind(chart) {
        if (!chart || chart.allowHorizontalStack === false) return null;
        if (chart.type === 'scorecard') return 'scorecard-row';
        if (STATS_CIRCULAR_CHART_TYPES.has(chart.type)) return 'circular-row';
        return null;
    },

    _statsStackRowMinWidth(kind) {
        return kind === 'circular-row' ? STATS_CIRCULAR_ROW_MIN_WIDTH_PX : STATS_SCORECARD_ROW_MIN_WIDTH_PX;
    },

    _statsChartCardHeaderHtml(chart, moveState) {
        const btnStyle = 'padding: 2px 8px; font-size: 10px;';
        const moveBtnStyle = 'padding: 0 4px; min-width: 20px; font-size: 11px; line-height: 1.2;';
        const canMoveUp = !!(moveState && moveState.canMoveUp);
        const canMoveDown = !!(moveState && moveState.canMoveDown);
        return ''
            + '<div class="wf-dash-stats-chart-header">'
            + '<div class="wf-dash-stats-chart-header-title">'
            + '<span class="wf-dash-stats-chart-move" role="group" aria-label="Reorder chart">'
            + '<button type="button" data-wf-dash-stats-chart-move-up="' + dashEscHtml(chart.id) + '" class="'
            + this._dashBtnClass('basic', 'nav') + '" style="' + moveBtnStyle + '" title="Move up" aria-label="Move chart up"'
            + (canMoveUp ? '' : ' disabled') + '>↑</button>'
            + '<button type="button" data-wf-dash-stats-chart-move-down="' + dashEscHtml(chart.id) + '" class="'
            + this._dashBtnClass('basic', 'nav') + '" style="' + moveBtnStyle + '" title="Move down" aria-label="Move chart down"'
            + (canMoveDown ? '' : ' disabled') + '>↓</button>'
            + '</span>'
            + '<div class="wf-dash-stats-chart-header-text">' + dashEscHtml(chart.title) + '</div>'
            + '</div>'
            + '<div class="wf-dash-stats-chart-header-actions">'
            + '<button type="button" data-wf-dash-stats-chart-edit="' + dashEscHtml(chart.id) + '" class="' + this._dashBtnClass('basic', 'nav') + '" style="' + btnStyle + '">Edit</button>'
            + '<button type="button" data-wf-dash-stats-chart-delete="' + dashEscHtml(chart.id) + '" class="wf-dash-stats-chart-delete" title="Delete chart" aria-label="Delete chart">×</button>'
            + '</div>'
            + '</div>';
    },

    _statsChartCardFooterHtml(chart) {
        const btnStyle = 'padding: 2px 8px; font-size: 10px;';
        const store = this._ensureStatsLayout();
        const active = this._activeStatsDashboard();
        const otherDashboards = ((store && store.dashboards) || []).filter((d) => d.id !== (active && active.id));
        const copySelect = otherDashboards.length
            ? ('<select data-wf-dash-stats-chart-copy-to="' + dashEscHtml(chart.id) + '" class="wf-dash-stats-chart-copy-select" title="Copy chart to another dashboard" aria-label="Copy chart to another dashboard" style="' + btnStyle + ' max-width: 140px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; background: var(--card, #fff); color: var(--foreground, #0f172a);">'
                + '<option value="">Copy to…</option>'
                + otherDashboards.map((d) =>
                    '<option value="' + dashEscHtml(d.id) + '">' + dashEscHtml(d.name) + '</option>'
                ).join('')
                + '</select>')
            : '';
        return ''
            + '<div class="wf-dash-stats-chart-footer">'
            + copySelect
            + '<button type="button" data-wf-dash-stats-chart-export="' + dashEscHtml(chart.id) + '" class="' + this._dashBtnClass('basic', 'nav') + '" style="' + btnStyle + '">Export settings</button>'
            + '<button type="button" data-wf-dash-stats-chart-export-image="' + dashEscHtml(chart.id) + '" class="' + this._dashBtnClass('basic', 'nav') + '" style="' + btnStyle + '">Export image</button>'
            + '</div>';
    },

    _statsChartCardHtml(chart, validation, inStackRow, stackMinWidth, moveState, visualHeightPx) {
        const box = this._panelBoxStyle();
        const height = visualHeightPx != null && Number.isFinite(visualHeightPx)
            ? this._statsNormalizeChartHeight(visualHeightPx)
            : this._statsResolvedChartHeight(chart);
        const disabled = validation && !validation.ok;
        const missingEntry = disabled && validation.missing[0] ? validation.missing[0] : null;
        const missingLabel = missingEntry ? missingEntry.label : '';
        const overlayMessage = missingEntry && missingEntry.id === 'chartFilters'
            ? dashEscHtml(missingLabel)
            : ('Missing parameter: ' + dashEscHtml(missingLabel));
        const overlay = disabled
            ? ('<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--card, #fff) 72%, transparent); z-index: 2; padding: 12px; text-align: center;">'
                + '<span style="font-size: 11px; color: var(--muted-foreground, #64748b);">' + overlayMessage + '</span></div>')
            : '';
        const canvasOpacity = disabled ? ' opacity: 0.35; pointer-events: none;' : '';
        const isScorecard = chart.type === 'scorecard';
        const filterSummary = this._statsChartFilterSummary(chart);
        const filterSubtitle = filterSummary
            ? ('<div style="font-size: 10px; color: var(--muted-foreground, #64748b); margin: -4px 0 8px 22px; line-height: 1.35;">'
                + dashEscHtml(filterSummary) + '</div>')
            : '';
        const bodyContent = isScorecard
            ? ('<div data-wf-dash-stats-scorecard="' + dashEscHtml(chart.id) + '" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 60px; padding: 8px 12px; box-sizing: border-box;"></div>')
            : ('<canvas id="wf-dash-stats-canvas-' + dashEscHtml(chart.id) + '" aria-label="' + dashEscHtml(chart.title) + '" style="display: block; width: 100%; height: 100%;"></canvas>');
        const bellSubtitle = chart.type === 'bellCurve'
            ? ('<div data-wf-dash-stats-chart-subtitle="' + dashEscHtml(chart.id) + '" style="display: none; font-size: 10px; color: var(--muted-foreground, #64748b); margin-top: 6px; text-align: center; line-height: 1.35;"></div>')
            : '';
        const minWidth = stackMinWidth || STATS_SCORECARD_ROW_MIN_WIDTH_PX;
        const cardLayout = inStackRow
            ? ('flex: 1 1 ' + minWidth + 'px; min-width: min(' + minWidth + 'px, 100%); max-width: 100%; box-sizing: border-box;')
            : 'flex-shrink: 0; width: 100%; box-sizing: border-box;';
        return '<div class="wf-dash-stats-chart-card" data-chart-id="' + dashEscHtml(chart.id) + '" data-chart-type="' + dashEscHtml(chart.type) + '" style="' + box + ' padding: 10px 12px; ' + cardLayout + ' position: relative; display: flex; flex-direction: column;">'
            + this._statsChartCardHeaderHtml(chart, moveState)
            + filterSubtitle
            + '<div style="position: relative; height: ' + height + 'px; max-width: 100%;' + canvasOpacity + '">'
            + overlay
            + bodyContent
            + '</div>'
            + bellSubtitle
            + this._statsChartCardFooterHtml(chart)
            + '</div>';
    },

    _statsAllowHorizontalStack() {
        const store = this._ensureStatsLayout();
        return store.allowHorizontalStack !== false;
    },

    _toggleStatsHorizontalStack() {
        const engine = Context.statsEngine;
        const store = this._ensureStatsLayout();
        const next = !this._statsAllowHorizontalStack();
        this._state.statsLayout = engine && typeof engine.setAllowHorizontalStack === 'function'
            ? engine.setAllowHorizontalStack(store, next)
            : Object.assign({}, store, { allowHorizontalStack: next });
        this._persistStatsLayout();
        Logger.log('search-output-stats-pane: horizontal stacking ' + (next ? 'enabled' : 'disabled'));
        void this._renderStatsPanel();
    },

    _statsStackRowMax(kind) {
        return kind === 'circular-row' ? STATS_CIRCULAR_ROW_MAX : STATS_SCORECARD_ROW_MAX;
    },

    _statsChartLayoutGroups(charts) {
        const groups = [];
        let stackKind = null;
        let stackCharts = null;
        const allowStack = this._statsAllowHorizontalStack();
        for (const chart of charts || []) {
            const kind = allowStack ? this._statsChartStackKind(chart) : null;
            if (kind) {
                const maxPerRow = this._statsStackRowMax(kind);
                if (stackKind !== kind || !stackCharts || stackCharts.length >= maxPerRow) {
                    stackKind = kind;
                    stackCharts = [];
                    groups.push({ kind, charts: stackCharts });
                }
                stackCharts.push(chart);
            } else {
                stackKind = null;
                stackCharts = null;
                groups.push({ kind: 'chart', charts: [chart] });
            }
        }
        return groups;
    },

    _statsBuildChartListHtml(validations) {
        const byId = new Map(validations.map((entry) => [entry.chart.id, entry]));
        const dash = this._activeStatsDashboard();
        const charts = dash.charts || [];
        const moveStateFor = (chartId) => {
            const idx = charts.findIndex((c) => c.id === chartId);
            return {
                canMoveUp: idx > 0,
                canMoveDown: idx >= 0 && idx < charts.length - 1
            };
        };
        let html = '';
        for (const group of this._statsChartLayoutGroups(charts)) {
            if (group.kind === 'scorecard-row' || group.kind === 'circular-row') {
                const minWidth = this._statsStackRowMinWidth(group.kind);
                const rowClass = group.kind === 'circular-row'
                    ? 'wf-dash-stats-circular-row'
                    : 'wf-dash-stats-scorecard-row';
                const rowAttr = group.kind === 'circular-row'
                    ? 'data-wf-dash-stats-circular-row="1"'
                    : 'data-wf-dash-stats-scorecard-row="1"';
                const rowVisualHeight = group.charts.length > 1
                    ? Math.max(...group.charts.map((c) => this._statsResolvedChartHeight(c)))
                    : null;
                html += '<div class="' + rowClass + '" ' + rowAttr + ' style="display: flex; flex-wrap: wrap; gap: '
                    + STATS_SCORECARD_ROW_GAP_PX + 'px; width: 100%; align-items: stretch; box-sizing: border-box;">';
                for (const chart of group.charts) {
                    const entry = byId.get(chart.id);
                    if (entry) {
                        html += this._statsChartCardHtml(
                            entry.chart,
                            entry.validation,
                            true,
                            minWidth,
                            moveStateFor(chart.id),
                            rowVisualHeight
                        );
                    }
                }
                html += '</div>';
                continue;
            }
            const entry = byId.get(group.charts[0].id);
            if (entry) {
                html += this._statsChartCardHtml(
                    entry.chart,
                    entry.validation,
                    false,
                    null,
                    moveStateFor(entry.chart.id)
                );
            }
        }
        return html;
    },

    _statsResolveSeriesLabel(s, catalog) {
        if (!s) return '';
        const custom = s.label != null ? String(s.label).trim() : '';
        if (custom) return custom;
        const metric = (catalog && catalog.metrics || []).find((m) => m.id === s.metricId);
        return (metric && metric.label) || s.metricId || '';
    },

    _statsScaleTitle(text, theme) {
        const label = text != null ? String(text).trim() : '';
        if (!label) return undefined;
        return {
            display: true,
            text: label,
            color: theme.muted,
            font: { size: 10 }
        };
    },

    _statsChartEmptyMessage(chart, aggData, catalog) {
        const engine = Context.statsEngine;
        if (engine && typeof engine.aggDataHasFiniteValues === 'function'
            && engine.aggDataHasFiniteValues(chart, aggData)) {
            return '';
        }
        const series = (chart.series || [])[0];
        if (series && series.agg === 'stddev') {
            return 'Std dev needs at least 2 values per group (or in scope for scorecard).';
        }
        if (chart.type === 'bellCurve') {
            return 'Need at least 2 metric values in scope to show a distribution.';
        }
        if (series && catalog && catalog.metrics) {
            const metric = catalog.metrics.find((m) => m.id === series.metricId);
            if (metric && metric.requiresHydration && (metric.sampleCount || 0) === 0) {
                return 'Metric needs hydrated cards — run deep hydrate or narrow scope.';
            }
        }
        return 'No data to preview for these settings.';
    },

    _formatBellCurveStatsSubtitle(stats) {
        if (!stats || stats.n == null || stats.mean == null || stats.stddev == null) return '';
        const mu = this._formatStatsScorecardValue(stats.mean);
        const sigma = this._formatStatsScorecardValue(stats.stddev);
        const lo = this._formatStatsScorecardValue(stats.mean - stats.stddev);
        const hi = this._formatStatsScorecardValue(stats.mean + stats.stddev);
        return 'n = ' + stats.n + ' · μ = ' + mu + ' · σ = ' + sigma + ' · ±1σ = ' + lo + '–' + hi;
    },

    _statsBellBandFill(color, opacity) {
        const pct = Math.round(Math.min(100, Math.max(8, opacity * 100)));
        return 'color-mix(in srgb, ' + color + ' ' + pct + '%, transparent)';
    },

    _renderBellCurveStatsSubtitle(chartId, aggData) {
        const text = this._formatBellCurveStatsSubtitle(aggData && aggData.stats);
        const el = this._q('[data-wf-dash-stats-chart-subtitle="' + chartId + '"]')
            || this._q('#wf-dash-stats-builder-preview-subtitle');
        if (!el) return;
        if (text) {
            el.textContent = text;
            el.style.display = '';
        } else {
            el.textContent = '';
            el.style.display = 'none';
        }
    },

    _statsPickHistogramMetric(catalog) {
        const numeric = (catalog.metrics || []).filter((m) => m.id !== 'count');
        const withSamples = numeric.find((m) => (m.sampleCount || 0) > 0);
        if (withSamples) return withSamples.id;
        const timeIds = ['v1_creation_time_minutes', 'qa_time_minutes', 'dispute_resolution_time_minutes'];
        const timePick = numeric.find((m) => timeIds.includes(m.id));
        if (timePick) return timePick.id;
        return (numeric[0] && numeric[0].id) || 'prompt_version_count';
    },

    _formatStatsScorecardValue(value) {
        if (value == null || !Number.isFinite(value)) return '—';
        if (Math.abs(value - Math.round(value)) < 0.05) {
            return Math.round(value).toLocaleString();
        }
        return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    },

    _renderStatsScorecardEl(chart, aggData) {
        const el = this._q('[data-wf-dash-stats-scorecard="' + chart.id + '"]');
        if (!el) return;
        const theme = this._statsChartTheme();
        const valueText = this._formatStatsScorecardValue(aggData.value);
        const subtitle = aggData.subtitle || aggData.label || '';
        el.innerHTML = '<div style="font-size: 32px; font-weight: 700; line-height: 1.1; color: ' + theme.foreground + '; letter-spacing: -0.02em;">'
            + dashEscHtml(valueText)
            + '</div>'
            + (subtitle
                ? '<div style="font-size: 11px; color: ' + theme.muted + '; margin-top: 6px; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">'
                    + dashEscHtml(subtitle) + '</div>'
                : '');
    },

    _statsChartHasRenderableData(chart, aggData) {
        const engine = Context.statsEngine;
        if (engine && typeof engine.aggDataHasFiniteValues === 'function') {
            return engine.aggDataHasFiniteValues(chart, aggData);
        }
        if (chart.type === 'scorecard') {
            return aggData.value != null && Number.isFinite(aggData.value);
        }
        return (aggData.points && aggData.points.length)
            || (aggData.labels && aggData.labels.length)
            || (aggData.bins && aggData.bins.length);
    },

    _statsCircularLegendPosition(width, labelCount) {
        const w = Number(width) || 0;
        const n = Number(labelCount) || 0;
        return w >= 280 && n >= 3 ? 'right' : 'bottom';
    },

    _statsCircularChartLegend(theme, labelCount, containerWidth) {
        const position = this._statsCircularLegendPosition(containerWidth, labelCount);
        return {
            position,
            align: position === 'right' ? 'start' : 'center',
            labels: { color: theme.foreground, boxWidth: 12, font: { size: 10 } }
        };
    },

    _statsLegendValueFormat(flags) {
        const f = flags || {};
        if (f.showAbsolute && f.showPercent) return 'both';
        if (f.showPercent) return 'percent';
        return 'absolute';
    },

    _statsGenerateLegendLabels(chartJs, chartModel) {
        const dash = this;
        const chartType = chartJs && chartJs.config && chartJs.config.type;
        const data = (chartJs && chartJs.data) || {};
        const labels = data.labels || [];
        const datasets = data.datasets || [];
        const theme = dash._statsChartTheme();
        const labelsOpt = chartJs && chartJs.options && chartJs.options.plugins
            && chartJs.options.plugins.legend && chartJs.options.plugins.legend.labels;
        const legendColor = (labelsOpt && typeof labelsOpt.color === 'string' && labelsOpt.color)
            || theme.foreground
            || '#e2e8f0';

        if (chartType === 'pie' || chartType === 'polarArea' || chartType === 'doughnut') {
            const ds = datasets[0] || {};
            if (!labels.length) return [];
            const total = dash._statsDatasetNumericTotal(ds.data);
            const series = ((chartModel && chartModel.series) || [])[0] || {};
            const flags = ds.statsLabelFlags || dash._statsLabelShowFlagsFromSeries(series);
            const format = dash._statsLegendValueFormat(flags);
            const meta = typeof chartJs.getDatasetMeta === 'function' ? chartJs.getDatasetMeta(0) : null;
            return labels.map((label, i) => {
                const raw = ds.data && ds.data[i];
                const value = typeof raw === 'number' ? raw : Number(raw);
                const valueText = Number.isFinite(value)
                    ? dash._statsFormatChartDatumLabel(value, total, format)
                    : '';
                const text = valueText
                    ? (String(label == null ? '' : label) + ' · ' + valueText)
                    : String(label == null ? '' : label);
                let fillStyle = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : ds.backgroundColor;
                let strokeStyle = Array.isArray(ds.borderColor) ? ds.borderColor[i] : ds.borderColor;
                try {
                    const style = meta && meta.controller && meta.controller.getStyle(i);
                    if (style) {
                        if (style.backgroundColor) fillStyle = style.backgroundColor;
                        if (style.borderColor) strokeStyle = style.borderColor;
                    }
                } catch (_) { /* style lookup optional */ }
                const hidden = typeof chartJs.getDataVisibility === 'function'
                    ? !chartJs.getDataVisibility(i)
                    : Boolean(meta && meta.data && meta.data[i] && meta.data[i].hidden);
                return {
                    text,
                    fillStyle: fillStyle || '#94a3b8',
                    strokeStyle: strokeStyle || fillStyle || '#94a3b8',
                    fontColor: legendColor,
                    color: legendColor,
                    lineWidth: 1,
                    hidden,
                    index: i,
                    datasetIndex: 0
                };
            });
        }

        return datasets.map((ds, i) => {
            if (!ds || ds.statsLegendHidden || ds.statsSpreadBand || ds.statsShadedFillLayer || ds.statsBellBand) {
                return null;
            }
            const meta = typeof chartJs.getDatasetMeta === 'function' ? chartJs.getDatasetMeta(i) : null;
            const total = dash._statsDatasetNumericTotal(ds.data);
            const seriesIdx = ds.statsSeriesIndex != null
                ? ds.statsSeriesIndex
                : (ds.seriesIndex != null ? ds.seriesIndex : 0);
            const series = ((chartModel && chartModel.series) || [])[seriesIdx] || {};
            const flags = ds.statsLabelFlags || dash._statsLabelShowFlagsFromSeries(series);
            // Dataset legends: absolute series total when absolute labels are on (skip % of self).
            let suffix = '';
            if (flags.showAbsolute || (!flags.showAbsolute && !flags.showPercent)) {
                suffix = total > 0
                    ? dash._statsFormatChartDatumLabel(total, total, 'absolute')
                    : '';
            }
            const baseLabel = ds.label != null ? String(ds.label) : ('Series ' + (i + 1));
            const text = suffix ? (baseLabel + ' · ' + suffix) : baseLabel;
            let fillStyle = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[0] : ds.backgroundColor;
            let strokeStyle = Array.isArray(ds.borderColor) ? ds.borderColor[0] : ds.borderColor;
            try {
                const style = meta && meta.controller && meta.controller.getStyle(0);
                if (style) {
                    if (style.backgroundColor) fillStyle = style.backgroundColor;
                    if (style.borderColor) strokeStyle = style.borderColor;
                }
            } catch (_) { /* style lookup optional */ }
            return {
                text,
                fillStyle: fillStyle || strokeStyle || '#94a3b8',
                strokeStyle: strokeStyle || fillStyle || '#94a3b8',
                fontColor: legendColor,
                color: legendColor,
                lineWidth: ds.borderWidth != null ? ds.borderWidth : 1,
                hidden: Boolean(meta && meta.hidden),
                datasetIndex: i
            };
        }).filter(Boolean);
    },

    _statsApplyCircularLegendPosition(chart, width) {
        if (!chart || !chart.options || !chart.options.plugins) return;
        const legend = chart.options.plugins.legend;
        if (!legend) return;
        const labelCount = (chart.data && chart.data.labels) ? chart.data.labels.length : 0;
        const next = this._statsCircularLegendPosition(width, labelCount);
        if (legend.position === next) return;
        legend.position = next;
        legend.align = next === 'right' ? 'start' : 'center';
        chart.update('none');
    },

    _statsRadialScale(theme) {
        return {
            beginAtZero: true,
            ticks: {
                color: theme.foreground,
                font: { size: 10 },
                showLabelBackdrop: false,
                backdropColor: 'transparent',
                z: 1
            },
            grid: {
                color: theme.border,
                circular: true,
                lineWidth: 1,
                z: -1
            },
            angleLines: {
                color: theme.border,
                lineWidth: 1
            },
            pointLabels: {
                color: theme.foreground,
                font: { size: 10 }
            }
        };
    },

    _statsBarLineLegendOptions(baseLegend) {
        return Object.assign({}, baseLegend, {
            onClick: (e, legendItem, legend) => {
                const chart = legend.chart;
                const index = legendItem.datasetIndex;
                if (index == null || index < 0) return;
                const visible = chart.isDatasetVisible(index);
                chart.setDatasetVisibility(index, !visible);
                const ds = chart.data.datasets[index];
                if (ds && ds.statsSeriesKey) {
                    chart.data.datasets.forEach((d, i) => {
                        if (i !== index && d.statsShadedFillLayer && d.statsSeriesKey === ds.statsSeriesKey) {
                            chart.setDatasetVisibility(i, !visible);
                        }
                    });
                }
                chart.update();
            }
        });
    },

    _buildChartJsOptions(chart, theme, chartJsCtx) {
        const dash = this;
        const labelCount = (chartJsCtx && chartJsCtx.labelCount) || 0;
        const containerWidth = (chartJsCtx && chartJsCtx.containerWidth) || 0;
        const baseLegend = {
            position: 'bottom',
            labels: {
                color: theme.foreground,
                boxWidth: 12,
                font: { size: 10 },
                filter: (item, chartData) => {
                    const ds = chartData.datasets[item.datasetIndex];
                    return !(ds && ds.statsLegendHidden);
                }
            }
        };
        const circularLegend = this._statsCircularChartLegend(theme, labelCount, containerWidth);
        const circularOnResize = (chart, size) => {
            dash._statsApplyCircularLegendPosition(chart, size.width);
        };
        const type = chart.type;
        if (type === 'pie') {
            return {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: circularLegend },
                onResize: circularOnResize
            };
        }
        if (type === 'polarArea') {
            return {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: this._statsRadialScale(theme)
                },
                plugins: { legend: circularLegend },
                onResize: circularOnResize
            };
        }
        if (type === 'radar') {
            return {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: this._statsRadialScale(theme)
                },
                plugins: { legend: circularLegend },
                onResize: circularOnResize
            };
        }
        if (type === 'scatter' || type === 'bubble') {
            return {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear',
                        beginAtZero: true,
                        ticks: { color: theme.muted, font: { size: 10 } },
                        grid: { color: theme.border }
                    },
                    y: {
                        type: 'linear',
                        beginAtZero: true,
                        ticks: { color: theme.muted, font: { size: 10 } },
                        grid: { color: theme.border }
                    }
                },
                plugins: {
                    legend: baseLegend,
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const pt = ctx.raw || {};
                                const name = pt.label ? pt.label + ': ' : '';
                                const rPart = pt.r != null ? ', r=' + Math.round(pt.r) : '';
                                return name + '(' + ctx.parsed.x + ', ' + ctx.parsed.y + rPart + ')';
                            }
                        }
                    }
                }
            };
        }
        return {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: this._statsIsBarLineChart(chart) && chart.orientation === 'horizontal' ? 'y' : 'x',
            scales: this._statsCartesianScales(chart, theme),
            plugins: {
                legend: this._statsIsBarLineChart(chart)
                    ? this._statsBarLineLegendOptions(baseLegend)
                    : baseLegend,
                tooltip: this._statsIsBarLineChart(chart)
                    ? this._statsBarLineTooltipOptions()
                    : undefined
            }
        };
    },

    _statsBarLineTooltipOptions() {
        const dash = this;
        return {
            callbacks: {
                filter: (item) => {
                    const ds = item.chart.data.datasets[item.datasetIndex];
                    return !(ds && ds.statsSpreadBand);
                },
                label: (ctx) => dash._statsTooltipLabelText(ctx.chart.$statsChartModel || null, ctx)
            }
        };
    },

    _statsChartSupportsLabelOptions(chart) {
        const engine = Context.statsEngine;
        if (engine && typeof engine.chartSupportsLabelOptions === 'function') {
            return engine.chartSupportsLabelOptions(chart && chart.type);
        }
        const type = this._statsNormalizeChartType(chart && chart.type);
        return type === 'pie' || type === 'polarArea' || type === 'radar'
            || type === 'barLine' || type === 'histogram';
    },

    _statsNormalizeLabelFormat(raw) {
        const engine = Context.statsEngine;
        if (engine && typeof engine.normalizeLabelFormat === 'function') {
            return engine.normalizeLabelFormat(raw);
        }
        if (raw === 'percent' || raw === 'both') return raw;
        return 'absolute';
    },

    _statsLabelShowFlagsFromSeries(seriesEntry) {
        const engine = Context.statsEngine;
        if (engine && typeof engine.labelShowFlagsFromSeries === 'function') {
            return engine.labelShowFlagsFromSeries(seriesEntry || {});
        }
        const s = seriesEntry || {};
        const format = this._statsNormalizeLabelFormat(s.labelFormat);
        return {
            showAbsolute: s.labelShowAbsolute != null
                ? !!s.labelShowAbsolute
                : (format === 'absolute' || format === 'both'),
            showPercent: s.labelShowPercent != null
                ? !!s.labelShowPercent
                : (format === 'percent' || format === 'both'),
            showName: !!s.labelsShowName,
            alwaysVisible: !!s.labelsAlwaysVisible
        };
    },

    _statsChartHasAlwaysVisibleLabels(chart) {
        const engine = Context.statsEngine;
        if (engine && typeof engine.chartHasAnyAlwaysVisibleLabels === 'function') {
            return engine.chartHasAnyAlwaysVisibleLabels(chart);
        }
        return (chart && chart.series || []).some((s) => s && s.labelsAlwaysVisible);
    },

    _statsStampDatasetLabelMeta(jsDataset, chart, seriesIndex) {
        if (!jsDataset) return jsDataset;
        const idx = seriesIndex != null && Number.isFinite(seriesIndex) ? seriesIndex : 0;
        const series = ((chart && chart.series) || [])[idx] || ((chart && chart.series) || [])[0] || {};
        jsDataset.statsSeriesIndex = idx;
        jsDataset.statsLabelFlags = this._statsLabelShowFlagsFromSeries(series);
        return jsDataset;
    },

    _statsFormatChartDatumLabel(value, total, format) {
        const abs = this._formatStatsScorecardValue(value);
        const pct = total > 0 && Number.isFinite(value)
            ? (Math.round((value / total) * 1000) / 10).toFixed(1).replace(/\.0$/, '') + '%'
            : '0%';
        const mode = this._statsNormalizeLabelFormat(format);
        if (mode === 'percent') return pct;
        if (mode === 'both') return abs + ' (' + pct + ')';
        return abs;
    },

    _statsComposeOnChartLabelLines(value, total, categoryName, flags) {
        const f = flags || {};
        const lines = [];
        const name = categoryName != null ? String(categoryName).trim() : '';
        if (f.showName && name) lines.push(name);
        let valueText = '';
        if (f.showAbsolute && f.showPercent) {
            valueText = this._statsFormatChartDatumLabel(value, total, 'both');
        } else if (f.showPercent) {
            valueText = this._statsFormatChartDatumLabel(value, total, 'percent');
        } else if (f.showAbsolute) {
            valueText = this._statsFormatChartDatumLabel(value, total, 'absolute');
        } else if (!f.showName) {
            valueText = this._statsFormatChartDatumLabel(value, total, 'absolute');
        }
        if (valueText) lines.push(valueText);
        return lines;
    },

    _statsCategoryLabelForPoint(chart, dataset, index) {
        const labels = chart && chart.data && chart.data.labels;
        if (Array.isArray(labels) && labels[index] != null && String(labels[index]).trim()) {
            return String(labels[index]);
        }
        if (dataset && dataset.label) return String(dataset.label);
        return '';
    },

    _statsDatasetNumericTotal(data) {
        let sum = 0;
        for (const v of data || []) {
            const n = typeof v === 'number' ? v : Number(v);
            if (Number.isFinite(n)) sum += n;
        }
        return sum;
    },

    _statsTooltipParsedValue(ctx) {
        if (!ctx) return null;
        const chartType = ctx.chart && ctx.chart.config && ctx.chart.config.type;
        if (chartType === 'pie' || chartType === 'polarArea' || chartType === 'doughnut') {
            const n = typeof ctx.parsed === 'number' ? ctx.parsed : Number(ctx.raw);
            return Number.isFinite(n) ? n : null;
        }
        if (chartType === 'radar') {
            const n = ctx.parsed && typeof ctx.parsed.r === 'number' ? ctx.parsed.r : Number(ctx.raw);
            return Number.isFinite(n) ? n : null;
        }
        const horizontal = ctx.chart && ctx.chart.options && ctx.chart.options.indexAxis === 'y';
        const n = horizontal
            ? (ctx.parsed && ctx.parsed.x)
            : (ctx.parsed && ctx.parsed.y);
        return n != null && Number.isFinite(n) ? n : null;
    },

    _statsTooltipLabelText(chartModel, ctx) {
        const dash = this;
        const ds = ctx.dataset || {};
        if (ds.statsSpreadBand || ds.statsLegendHidden || ds.statsBellBand) return '';
        const value = dash._statsTooltipParsedValue(ctx);
        if (value == null) return '';
        const total = dash._statsDatasetNumericTotal(ds.data);
        const seriesIdx = ds.statsSeriesIndex != null
            ? ds.statsSeriesIndex
            : (ds.seriesIndex != null ? ds.seriesIndex : 0);
        const series = ((chartModel && chartModel.series) || [])[seriesIdx] || {};
        const flags = ds.statsLabelFlags || dash._statsLabelShowFlagsFromSeries(series);
        const format = flags.showAbsolute && flags.showPercent
            ? 'both'
            : (flags.showPercent ? 'percent' : 'absolute');
        const formatted = dash._statsFormatChartDatumLabel(value, total, format);
        const chartType = ctx.chart && ctx.chart.config && ctx.chart.config.type;
        if (chartType === 'pie' || chartType === 'polarArea' || chartType === 'doughnut') {
            const name = ctx.label || ds.label || '';
            return name ? name + ': ' + formatted : formatted;
        }
        if (chartModel && chartModel.type === 'histogram') {
            if (format === 'percent') return formatted;
            if (format === 'both') {
                const abs = dash._formatStatsScorecardValue(value);
                const tasks = value === 1 ? '1 task' : abs + ' tasks';
                return tasks + ' (' + dash._statsFormatChartDatumLabel(value, total, 'percent') + ')';
            }
            return value === 1 ? '1 task' : dash._formatStatsScorecardValue(value) + ' tasks';
        }
        const seriesLabel = ds.label || '';
        let text = seriesLabel ? seriesLabel + ': ' + formatted : formatted;
        const idx = ctx.dataIndex;
        if (Array.isArray(ds.statsSpreadLow) && Array.isArray(ds.statsSpreadHigh)
            && ds.statsSpreadLow[idx] != null && ds.statsSpreadHigh[idx] != null
            && Number.isFinite(ds.statsSpreadLow[idx]) && Number.isFinite(ds.statsSpreadHigh[idx])) {
            text += ' (±σ ' + dash._formatStatsScorecardValue(ds.statsSpreadLow[idx])
                + '–' + dash._formatStatsScorecardValue(ds.statsSpreadHigh[idx]) + ')';
        }
        return text;
    },

    _statsValueLabelsPlugin(chartModel, theme) {
        const dash = this;
        const labelFont = '600 10px system-ui, -apple-system, sans-serif';
        const padX = 4;
        const lineH = 12;
        const fill = theme && theme.card ? theme.card : 'rgba(255,255,255,0.85)';
        const stroke = theme && theme.border ? theme.border : 'rgba(0,0,0,0.12)';
        const fg = theme && theme.foreground ? theme.foreground : '#0f172a';
        const leaderStroke = theme && theme.muted ? theme.muted : 'rgba(100,116,139,0.85)';

        const measureLines = (ctx, lines) => {
            ctx.font = labelFont;
            let maxW = 0;
            for (const line of lines) {
                maxW = Math.max(maxW, ctx.measureText(line).width);
            }
            return {
                boxW: maxW + padX * 2,
                boxH: lines.length * lineH + 4
            };
        };

        const drawPill = (ctx, label) => {
            const { x, y, boxW, boxH, lines, align } = label;
            const left = align === 'left' ? x : (align === 'right' ? x - boxW : x - boxW / 2);
            ctx.save();
            ctx.font = labelFont;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(left, y - boxH / 2, boxW, boxH, 3);
            } else {
                ctx.rect(left, y - boxH / 2, boxW, boxH);
            }
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = fg;
            const startY = y - ((lines.length - 1) * lineH) / 2;
            lines.forEach((line, i) => {
                ctx.fillText(line, left + padX, startY + i * lineH);
            });
            ctx.restore();
        };

        const drawLeader = (ctx, ax, ay, bx, by, cx, cy) => {
            ctx.save();
            ctx.strokeStyle = leaderStroke;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            if (cx != null && cy != null) {
                ctx.lineTo(bx, by);
                ctx.lineTo(cx, cy);
            } else {
                ctx.lineTo(bx, by);
            }
            ctx.stroke();
            ctx.restore();
        };

        const collectCandidates = (chart, ctx) => {
            const out = [];
            chart.data.datasets.forEach((dataset, datasetIndex) => {
                if (!dataset || dataset.statsSpreadBand || dataset.statsLegendHidden
                    || dataset.statsBellBand || dataset.statsShadedFillLayer
                    || dataset.segmentFillOnly) {
                    return;
                }
                const flags = dataset.statsLabelFlags
                    || dash._statsLabelShowFlagsFromSeries(
                        ((chartModel.series || [])[
                            dataset.statsSeriesIndex != null
                                ? dataset.statsSeriesIndex
                                : (dataset.seriesIndex != null ? dataset.seriesIndex : 0)
                        ]) || {}
                    );
                if (!flags.alwaysVisible) return;
                if (!chart.isDatasetVisible(datasetIndex)) return;
                const meta = chart.getDatasetMeta(datasetIndex);
                if (!meta || !meta.data) return;
                const total = dash._statsDatasetNumericTotal(dataset.data);
                meta.data.forEach((el, index) => {
                    if (!el || el.skip || el.hidden) return;
                    const raw = dataset.data[index];
                    const value = typeof raw === 'number' ? raw : Number(raw);
                    if (!Number.isFinite(value)) return;
                    const lines = dash._statsComposeOnChartLabelLines(
                        value,
                        total,
                        dash._statsCategoryLabelForPoint(chart, dataset, index),
                        flags
                    );
                    if (!lines.length) return;
                    const size = measureLines(ctx, lines);
                    out.push({
                        el,
                        lines,
                        value,
                        boxW: size.boxW,
                        boxH: size.boxH,
                        datasetIndex,
                        index
                    });
                });
            });
            return out;
        };

        const boxesOverlapY = (a, b, minGap) => {
            const aTop = a.y - a.boxH / 2;
            const aBot = a.y + a.boxH / 2;
            const bTop = b.y - b.boxH / 2;
            const bBot = b.y + b.boxH / 2;
            return aTop < bBot + minGap && aBot + minGap > bTop;
        };

        const packSideLanes = (items, side, canvasW, canvasH) => {
            if (!items.length) return [];
            const minGap = 4;
            const laneGap = 10;
            const margin = 4;
            const top = margin;
            const bottom = canvasH - margin;
            const sorted = items.slice().sort((a, b) => a.y - b.y);
            const maxW = Math.max(...sorted.map((p) => p.boxW), 40);
            const step = maxW + laneGap;
            const baseInner = side === 'right'
                ? Math.max(...sorted.map((p) => p.elbowX + 10))
                : Math.min(...sorted.map((p) => p.elbowX - 10));
            const maxLanes = side === 'right'
                ? Math.max(1, Math.floor((canvasW - margin - baseInner) / step) + 1)
                : Math.max(1, Math.floor((baseInner - margin) / step) + 1);

            const lanes = [];
            const unplaced = [];

            const tryFitY = (lane, item) => {
                let y = Math.max(top + item.boxH / 2, Math.min(bottom - item.boxH / 2, item.y));
                const ordered = lane.slice().sort((a, b) => a.y - b.y);
                for (let n = 0; n < ordered.length + 1; n += 1) {
                    const conflict = ordered.find((p) => boxesOverlapY({ y, boxH: item.boxH }, p, minGap));
                    if (!conflict) {
                        if (y - item.boxH / 2 >= top - 0.5 && y + item.boxH / 2 <= bottom + 0.5) {
                            return y;
                        }
                        return null;
                    }
                    y = conflict.y + conflict.boxH / 2 + minGap + item.boxH / 2;
                    if (y + item.boxH / 2 > bottom + 0.5) return null;
                }
                return null;
            };

            for (const item of sorted) {
                let assigned = false;
                for (let k = 0; k < lanes.length; k += 1) {
                    const y = tryFitY(lanes[k], item);
                    if (y == null) continue;
                    item.y = y;
                    item.lane = k;
                    lanes[k].push(item);
                    assigned = true;
                    break;
                }
                if (assigned) continue;
                if (lanes.length >= maxLanes) {
                    unplaced.push(item);
                    continue;
                }
                let y = Math.max(top + item.boxH / 2, Math.min(bottom - item.boxH / 2, item.y));
                if (y - item.boxH / 2 < top - 0.5 || y + item.boxH / 2 > bottom + 0.5) {
                    unplaced.push(item);
                    continue;
                }
                item.y = y;
                item.lane = lanes.length;
                lanes.push([item]);
            }

            const placed = [];
            for (const lane of lanes) {
                for (const item of lane) {
                    const k = item.lane || 0;
                    if (side === 'right') {
                        item.align = 'left';
                        item.x = baseInner + k * step;
                        if (item.x + item.boxW > canvasW - margin) {
                            unplaced.push(item);
                            continue;
                        }
                    } else {
                        item.align = 'right';
                        item.x = baseInner - k * step;
                        if (item.x - item.boxW < margin) {
                            unplaced.push(item);
                            continue;
                        }
                    }
                    placed.push(item);
                }
            }

            // Drop remaining collisions (prefer smaller values), then any still-unplaced.
            const kept = [];
            const ranked = placed.slice().sort((a, b) => {
                if (b.value !== a.value) return b.value - a.value;
                return (a.y - b.y);
            });
            for (const cand of ranked) {
                const hit = kept.some((v) => {
                    const sameSideOverlapX = side === 'right'
                        ? !(cand.x + cand.boxW <= v.x || v.x + v.boxW <= cand.x)
                        : !(cand.x <= v.x - v.boxW || v.x <= cand.x - cand.boxW);
                    return sameSideOverlapX && boxesOverlapY(cand, v, minGap);
                });
                if (hit) {
                    unplaced.push(cand);
                    continue;
                }
                kept.push(cand);
            }

            if (unplaced.length) {
                Logger.debug(
                    'search-output-stats-pane: outlabels dropped '
                    + unplaced.length
                    + ' on '
                    + side
                    + ' (no room after lane stagger)'
                );
            }
            return kept;
        };

        const layoutCircular = (chart, ctx, candidates) => {
            const area = chart.chartArea || {};
            const canvasW = chart.width || ((area.right || 0) + 4);
            const canvasH = chart.height || ((area.bottom || 0) + 4);
            const placed = [];
            for (const cand of candidates) {
                const el = cand.el;
                let cx;
                let cy;
                let angle;
                let rimR;
                if (typeof el.startAngle === 'number' && typeof el.endAngle === 'number') {
                    cx = el.x;
                    cy = el.y;
                    angle = (el.startAngle + el.endAngle) / 2;
                    rimR = el.outerRadius != null ? el.outerRadius : 40;
                } else {
                    const rScale = chart.scales && chart.scales.r;
                    cx = rScale && Number.isFinite(rScale.xCenter)
                        ? rScale.xCenter
                        : ((area.left + area.right) / 2);
                    cy = rScale && Number.isFinite(rScale.yCenter)
                        ? rScale.yCenter
                        : ((area.top + area.bottom) / 2);
                    const pos = typeof el.tooltipPosition === 'function'
                        ? el.tooltipPosition()
                        : { x: el.x, y: el.y };
                    angle = Math.atan2(pos.y - cy, pos.x - cx);
                    rimR = Math.hypot(pos.x - cx, pos.y - cy) || 40;
                }
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const anchorX = cx + rimR * cos;
                const anchorY = cy + rimR * sin;
                const gap = 14;
                const elbowR = rimR + gap;
                const elbowX = cx + elbowR * cos;
                const elbowY = cy + elbowR * sin;
                const side = cos >= 0 ? 'right' : 'left';
                const labelR = rimR + gap + 10;
                let labelX = cx + labelR * cos;
                let labelY = cy + labelR * sin;
                if (side === 'right') {
                    labelX = Math.max(labelX, elbowX + 8);
                } else {
                    labelX = Math.min(labelX, elbowX - 8);
                }
                placed.push(Object.assign({}, cand, {
                    anchorX,
                    anchorY,
                    elbowX,
                    elbowY,
                    x: labelX,
                    y: labelY,
                    side,
                    align: side === 'right' ? 'left' : 'right'
                }));
            }
            const left = packSideLanes(
                placed.filter((p) => p.side === 'left'),
                'left',
                canvasW,
                canvasH
            );
            const right = packSideLanes(
                placed.filter((p) => p.side === 'right'),
                'right',
                canvasW,
                canvasH
            );
            return left.concat(right);
        };

        const layoutCartesian = (chart, ctx, candidates) => {
            const horizontal = !!(chart.options && chart.options.indexAxis === 'y');
            const placed = candidates.map((cand) => {
                const el = cand.el;
                const pos = typeof el.tooltipPosition === 'function'
                    ? el.tooltipPosition()
                    : { x: el.x, y: el.y };
                const anchorX = pos.x;
                const anchorY = pos.y;
                let x = anchorX;
                let y = anchorY;
                if (horizontal) {
                    x = anchorX + cand.boxW / 2 + 8;
                } else {
                    y = anchorY - cand.boxH / 2 - 6;
                }
                return Object.assign({}, cand, {
                    anchorX,
                    anchorY,
                    x,
                    y,
                    align: 'center',
                    side: horizontal ? 'right' : 'top'
                });
            });
            placed.sort((a, b) => (horizontal ? a.y - b.y : a.x - b.x));
            const minGap = 3;
            for (let i = 1; i < placed.length; i += 1) {
                const prev = placed[i - 1];
                const cur = placed[i];
                if (horizontal) {
                    const minY = prev.y + prev.boxH / 2 + minGap + cur.boxH / 2;
                    if (cur.y < minY) cur.y = minY;
                } else {
                    const overlapsX = Math.abs(cur.x - prev.x) < (cur.boxW + prev.boxW) / 2;
                    const overlapsY = Math.abs(cur.y - prev.y) < (cur.boxH + prev.boxH) / 2;
                    if (overlapsX && overlapsY) {
                        cur.y = prev.y - prev.boxH / 2 - minGap - cur.boxH / 2;
                    }
                }
            }
            return placed;
        };

        return {
            id: 'wfStatsValueLabels',
            afterDatasetsDraw(chart) {
                if (!chartModel || !dash._statsChartSupportsLabelOptions(chartModel)) return;
                if (!dash._statsChartHasAlwaysVisibleLabels(chartModel)) return;
                const ctx = chart.ctx;
                if (!ctx) return;
                const candidates = collectCandidates(chart, ctx);
                if (!candidates.length) return;
                const chartType = chart.config && chart.config.type;
                const modelType = chartModel.type;
                const circular = chartType === 'pie' || chartType === 'polarArea' || chartType === 'doughnut'
                    || chartType === 'radar' || modelType === 'pie' || modelType === 'polarArea'
                    || modelType === 'radar';
                const placed = circular
                    ? layoutCircular(chart, ctx, candidates)
                    : layoutCartesian(chart, ctx, candidates);
                for (const label of placed) {
                    const edgeX = label.align === 'left'
                        ? label.x
                        : (label.align === 'right' ? label.x : label.x);
                    const edgeY = label.y;
                    const labelEdgeX = label.align === 'left'
                        ? label.x
                        : (label.align === 'right' ? label.x - label.boxW : label.x);
                    const connectX = label.align === 'center'
                        ? label.x
                        : (label.align === 'left' ? label.x : label.x);
                    // Leader: rim → elbow → label edge
                    if (circular) {
                        const lx = label.align === 'left' ? label.x : label.x;
                        // For left align, label.x is left edge of pill; for right align, label.x is right edge.
                        const pillEdgeX = label.align === 'left' ? label.x : label.x;
                        drawLeader(
                            ctx,
                            label.anchorX,
                            label.anchorY,
                            label.elbowX,
                            label.elbowY,
                            pillEdgeX,
                            label.y
                        );
                    } else {
                        const dist = Math.hypot(label.x - label.anchorX, label.y - label.anchorY);
                        if (dist > 10) {
                            drawLeader(ctx, label.anchorX, label.anchorY, label.x, label.y, null, null);
                        }
                    }
                    drawPill(ctx, label);
                }
            }
        };
    },

    _statsFinalizeChartJsConfig(config, chart, theme) {
        if (!config || !chart) return config;
        config.$statsChartModel = chart;
        if (config.options) {
            config.options.$statsChartModel = chart;
        }
        if (!this._statsChartSupportsLabelOptions(chart)) return config;
        if (!config.options) config.options = {};
        if (!config.options.plugins) config.options.plugins = {};
        const existingTooltip = config.options.plugins.tooltip || {};
        const existingCallbacks = existingTooltip.callbacks || {};
        const dash = this;
        config.options.plugins.tooltip = Object.assign({}, existingTooltip, {
            callbacks: Object.assign({}, existingCallbacks, {
                label: (ctx) => dash._statsTooltipLabelText(chart, ctx)
            })
        });
        const existingLegend = config.options.plugins.legend;
        if (existingLegend && existingLegend.display !== false) {
            const prevLabels = existingLegend.labels || {};
            config.options.plugins.legend = Object.assign({}, existingLegend, {
                labels: Object.assign({}, prevLabels, {
                    generateLabels: (chartJs) => dash._statsGenerateLegendLabels(chartJs, chart)
                })
            });
        }
        if (this._statsChartHasAlwaysVisibleLabels(chart)) {
            const circular = chart.type === 'pie' || chart.type === 'polarArea' || chart.type === 'radar';
            if (circular) {
                // Side-biased padding: keep horizontal room for leader-line labels without
                // crushing vertical space (pies are constrained by the smaller axis).
                const sidePad = { top: 16, right: 60, bottom: 16, left: 60 };
                const prev = config.options.layout && config.options.layout.padding;
                config.options.layout = Object.assign({}, config.options.layout, {
                    padding: typeof prev === 'object' && prev
                        ? Object.assign({}, sidePad, prev)
                        : sidePad
                });
                // Out-labels carry name/value already; the bottom legend is redundant and
                // collides with placed labels, so suppress it.
                if (config.options.plugins.legend) {
                    config.options.plugins.legend = Object.assign({}, config.options.plugins.legend, { display: false });
                } else {
                    config.options.plugins.legend = { display: false };
                }
            }
            const plugin = this._statsValueLabelsPlugin(chart, theme || this._statsChartTheme());
            config.plugins = (config.plugins || []).concat([plugin]);
        }
        return config;
    },

    _statsCartesianScales(chart, theme) {
        if (this._statsIsBarLineChart(chart)) {
            const horizontal = chart.orientation === 'horizontal';
            const hasBarDatasets = (chart.series || []).some((s) => s.renderAs !== 'line');
            const hasSegmentedShaded = (chart.series || []).some((s) =>
                s.renderAs === 'line' && s.lineStyle === 'shaded' && s.segmentBy);
            const hasMultiSeriesShaded = (chart.series || []).some((s) =>
                s.renderAs === 'line' && s.lineStyle === 'shaded' && !s.segmentBy);
            const barStacked = chart.barLayout === 'stacked' && hasBarDatasets;
            const lineStacked = hasSegmentedShaded
                || (chart.lineAreaLayout === 'stacked' && hasMultiSeriesShaded);
            const stacked = barStacked || lineStacked;
            const useY1 = (chart.series || []).some((s) => s.yAxis === 'y1');
            if (horizontal) {
                const scales = {
                    y: {
                        stacked,
                        ticks: { color: theme.muted, font: { size: 10 } },
                        grid: { color: theme.border }
                    },
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        beginAtZero: true,
                        stacked,
                        ticks: { color: theme.muted, font: { size: 10 } },
                        grid: { color: theme.border }
                    }
                };
                if (useY1) {
                    scales.x1 = {
                        type: 'linear',
                        position: 'top',
                        beginAtZero: true,
                        ticks: { color: theme.brandAlt, font: { size: 10 } },
                        grid: { drawOnChartArea: false }
                    };
                }
                return scales;
            }
            const scales = {
                x: {
                    stacked,
                    ticks: { color: theme.muted, font: { size: 10 }, maxRotation: 45, minRotation: 0 },
                    grid: { color: theme.border }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    stacked,
                    ticks: { color: theme.muted, font: { size: 10 } },
                    grid: { color: theme.border }
                }
            };
            if (useY1) {
                scales.y1 = {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    ticks: { color: theme.brandAlt, font: { size: 10 } },
                    grid: { drawOnChartArea: false }
                };
            }
            return scales;
        }
        const useY1 = (chart.series || []).some((s) => s.yAxis === 'y1');
        const scales = {
            x: {
                type: 'linear',
                beginAtZero: true,
                ticks: { color: theme.muted, font: { size: 10 } },
                grid: { color: theme.border }
            },
            y: {
                type: 'linear',
                beginAtZero: true,
                ticks: { color: theme.muted, font: { size: 10 } },
                grid: { color: theme.border }
            }
        };
        if (useY1) {
            scales.y1 = {
                type: 'linear',
                position: 'right',
                beginAtZero: true,
                ticks: { color: theme.brandAlt, font: { size: 10 } },
                grid: { drawOnChartArea: false }
            };
        }
        return scales;
    },

    _statsBarLineAxisTitles(chart, catalog) {
        const dim = catalog && catalog.dimensionByKey && catalog.dimensionByKey[chart.groupBy];
        const categoryTitle = (dim && dim.label) || '';
        const series = chart.series || [];
        const ySeries = series.find((s) => s.yAxis !== 'y1') || series[0];
        const y1Series = series.find((s) => s.yAxis === 'y1');
        const engine = Context.statsEngine;
        const aggDefs = engine && typeof engine.aggregations === 'function' ? engine.aggregations() : [];
        const aggLabel = (id) => {
            const a = aggDefs.find((x) => x.id === id);
            return a ? a.label : id;
        };
        const valueLabel = (s) => {
            if (!s) return '';
            const base = this._statsResolveSeriesLabel(s, catalog);
            const agg = aggLabel(s.agg);
            return agg && agg !== 'Count' ? agg + ' · ' + base : base;
        };
        return {
            categoryTitle,
            primaryTitle: valueLabel(ySeries),
            secondaryTitle: y1Series ? valueLabel(y1Series) : ''
        };
    },

    _buildChartJsConfig(chart, aggData, theme, containerWidth, catalog) {
        const dash = this;
        const palette = this._statsPiePalette();
        const type = chart.type;
        const labelCount = (aggData.labels || []).length;
        const chartJsCtx = { labelCount, containerWidth: containerWidth || 0 };

        if (type === 'scatter' || type === 'bubble') {
            const points = aggData.points || [];
            const s0 = (chart.series || [])[0] || {};
            const s1 = (chart.series || [])[1] || {};
            const s2 = (chart.series || [])[2] || {};
            const xLabel = this._statsResolveSeriesLabel(s0, catalog);
            const yLabel = this._statsResolveSeriesLabel(s1, catalog);
            const rLabel = type === 'bubble' ? this._statsResolveSeriesLabel(s2, catalog) : '';
            return {
                type: type === 'bubble' ? 'bubble' : 'scatter',
                data: {
                    datasets: [{
                        label: xLabel + ' vs ' + yLabel,
                        data: points.map((p) => ({ x: p.x, y: p.y, r: p.r, label: p.label })),
                        backgroundColor: theme.brand,
                        borderColor: theme.brand
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'linear',
                            beginAtZero: true,
                            title: this._statsScaleTitle(xLabel, theme),
                            ticks: { color: theme.muted, font: { size: 10 } },
                            grid: { color: theme.border }
                        },
                        y: {
                            type: 'linear',
                            beginAtZero: true,
                            title: this._statsScaleTitle(yLabel, theme),
                            ticks: { color: theme.muted, font: { size: 10 } },
                            grid: { color: theme.border }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title: (items) => {
                                    const pt = items[0] && items[0].raw;
                                    return (pt && pt.label) ? pt.label : '';
                                },
                                label: (ctx) => {
                                    const pt = ctx.raw || {};
                                    const x = dash._formatStatsScorecardValue(ctx.parsed.x);
                                    const y = dash._formatStatsScorecardValue(ctx.parsed.y);
                                    let text = xLabel + ': ' + x + ', ' + yLabel + ': ' + y;
                                    if (type === 'bubble' && pt.r != null) {
                                        text += ', ' + (rLabel || 'Size') + ': ' + Math.round(pt.r);
                                    }
                                    return text;
                                }
                            }
                        }
                    }
                }
            };
        }

        if (type === 'pie' || type === 'polarArea') {
            const ds = (aggData.datasets || [])[0] || { label: 'Count of results', data: [] };
            const pieDs = this._statsStampDatasetLabelMeta({
                label: ds.label,
                data: ds.data,
                backgroundColor: (aggData.labels || []).map((_, j) => palette[j % palette.length]),
                borderColor: 'transparent',
                seriesIndex: ds.seriesIndex != null ? ds.seriesIndex : 0
            }, chart, ds.seriesIndex != null ? ds.seriesIndex : 0);
            return {
                type: type === 'polarArea' ? 'polarArea' : 'pie',
                data: {
                    labels: aggData.labels,
                    datasets: [pieDs]
                },
                options: this._buildChartJsOptions(chart, theme, chartJsCtx)
            };
        }

        if (type === 'histogram') {
            const ds = (aggData.datasets || [])[0] || { label: '', data: [] };
            const histLabelCount = (aggData.labels || []).length;
            const metricLabel = ds.label || this._statsResolveSeriesLabel((chart.series || [])[0], catalog);
            const histDs = this._statsStampDatasetLabelMeta({
                label: ds.label,
                data: ds.data,
                backgroundColor: theme.brand,
                borderColor: theme.brand,
                seriesIndex: 0
            }, chart, 0);
            return {
                type: 'bar',
                data: {
                    labels: aggData.labels,
                    datasets: [histDs]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            title: this._statsScaleTitle(metricLabel, theme),
                            ticks: {
                                color: theme.muted,
                                font: { size: 10 },
                                maxRotation: histLabelCount > 6 ? 45 : 0,
                                minRotation: 0
                            },
                            grid: { color: theme.border }
                        },
                        y: {
                            beginAtZero: true,
                            title: this._statsScaleTitle('Task count', theme),
                            ticks: {
                                color: theme.muted,
                                font: { size: 10 },
                                precision: 0
                            },
                            grid: { color: theme.border }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title: (items) => (items[0] && items[0].label) || '',
                                label: (ctx) => {
                                    const count = ctx.parsed.y;
                                    if (count == null || !Number.isFinite(count)) return '';
                                    return count === 1 ? '1 task' : count + ' tasks';
                                }
                            }
                        }
                    }
                }
            };
        }

        if (type === 'bellCurve') {
            const dash = this;
            const metricLabel = aggData.metricLabel
                || this._statsResolveSeriesLabel((chart.series || [])[0], catalog);
            const bins = (aggData.bins || [])
                .filter((b) => b != null && Number.isFinite(b.y) && b.y > 0)
                .slice()
                .sort((a, b) => a.x - b.x);
            const curve = aggData.curve || [];
            const sigmaBands = aggData.sigmaBands || [];
            const bandColor = theme.brandAlt || theme.brand;
            const barColor = theme.brand;
            const bandOpacities = [0.2, 0.3, 0.42];
            const datasets = [];
            sigmaBands.forEach((band, i) => {
                datasets.push({
                    type: 'line',
                    label: '±' + band.level + 'σ (' + band.pct + '%)',
                    data: band.points || [],
                    borderColor: 'transparent',
                    backgroundColor: this._statsBellBandFill(bandColor, bandOpacities[i] || 0.25),
                    fill: 'origin',
                    pointRadius: 0,
                    tension: 0.35,
                    order: 30 - i,
                    statsBellBand: true
                });
            });
            datasets.push({
                type: 'bar',
                label: metricLabel,
                grouped: false,
                data: bins.map((b) => ({
                    x: b.x,
                    y: b.y,
                    label: b.label
                })),
                backgroundColor: barColor,
                borderColor: barColor,
                borderWidth: 1,
                order: 15,
                maxBarThickness: 28,
                categoryPercentage: 1,
                barPercentage: 1
            });
            datasets.push({
                type: 'line',
                label: 'Normal fit',
                data: curve,
                borderColor: barColor,
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.35,
                fill: false,
                order: 1
            });
            const xMin = aggData.xMin;
            const xMax = aggData.xMax;
            return {
                type: 'bar',
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'linear',
                            offset: false,
                            min: Number.isFinite(xMin) ? xMin : undefined,
                            max: Number.isFinite(xMax) ? xMax : undefined,
                            title: this._statsScaleTitle(metricLabel, theme),
                            ticks: {
                                color: theme.muted,
                                font: { size: 10 },
                                maxTicksLimit: 8
                            },
                            grid: { color: theme.border }
                        },
                        y: {
                            type: 'linear',
                            beginAtZero: true,
                            title: this._statsScaleTitle('Task count', theme),
                            ticks: {
                                color: theme.muted,
                                font: { size: 10 },
                                precision: 0
                            },
                            grid: { color: theme.border }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            filter: (item) => !item.dataset.statsBellBand,
                            callbacks: {
                                title: (items) => {
                                    const raw = items[0] && items[0].raw;
                                    if (raw && raw.label) return raw.label;
                                    const x = items[0] && items[0].parsed && items[0].parsed.x;
                                    return x != null && Number.isFinite(x)
                                        ? dash._formatStatsScorecardValue(x)
                                        : '';
                                },
                                label: (ctx) => {
                                    const y = ctx.parsed.y;
                                    if (y == null || !Number.isFinite(y)) return '';
                                    if (ctx.dataset.type === 'bar') {
                                        return y === 1 ? '1 task' : y + ' tasks';
                                    }
                                    return 'Density ' + dash._formatStatsScorecardValue(y);
                                }
                            }
                        }
                    }
                }
            };
        }

        if (type === 'radar') {
            const datasets = (aggData.datasets || []).map((ds, i) => {
                const color = i === 0 ? theme.brand : (i === 1 ? theme.brandAlt : palette[i % palette.length]);
                const seriesIndex = ds.seriesIndex != null ? ds.seriesIndex : i;
                return this._statsStampDatasetLabelMeta({
                    label: ds.label,
                    data: ds.data,
                    borderColor: color,
                    backgroundColor: this._statsColorWithAlpha(color, 0.2),
                    pointBackgroundColor: color,
                    pointBorderColor: color,
                    seriesIndex
                }, chart, seriesIndex);
            });
            const circularLegend = this._statsCircularChartLegend(theme, labelCount, containerWidth || 0);
            return {
                type: 'radar',
                data: { labels: aggData.labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        r: this._statsRadialScale(theme)
                    },
                    plugins: {
                        legend: datasets.length > 1 ? circularLegend : { display: false }
                    },
                    onResize: (chartInst, size) => {
                        this._statsApplyCircularLegendPosition(chartInst, size.width);
                    }
                }
            };
        }

        if (!this._statsIsBarLineChart(chart)) {
            return {
                type: 'line',
                data: { labels: aggData.labels, datasets: [] },
                options: this._buildChartJsOptions(chart, theme, chartJsCtx)
            };
        }

        const horizontal = chart.orientation === 'horizontal';
        const hasBarDatasets = (aggData.datasets || []).some((ds) => ds.renderAs !== 'line');
        const hasShadedLineDatasets = (aggData.datasets || []).some((ds) =>
            ds.renderAs === 'line' && ds.lineStyle === 'shaded' && !ds.segmentFillOnly);
        const barStacked = chart.barLayout === 'stacked' && hasBarDatasets;
        const lineStacked = chart.lineAreaLayout === 'stacked' && hasShadedLineDatasets;
        const chartDatasets = [];
        (aggData.datasets || []).forEach((ds, i) => {
            const color = i === 0 ? theme.brand : (i === 1 ? theme.brandAlt : palette[i % palette.length]);
            const renderAs = ds.renderAs === 'line' ? 'line' : 'bar';
            const valueScale = ds.yAxis === 'y1' ? 'y1' : 'y';
            const valueAxisID = this._statsValueAxisId(chart, ds.yAxis);
            const axisBinding = horizontal ? { xAxisID: valueAxisID } : { yAxisID: valueScale };
            const seriesIndex = ds.seriesIndex != null ? ds.seriesIndex : i;
            const base = Object.assign({
                type: renderAs,
                label: ds.label,
                data: ds.data,
                borderColor: color,
                backgroundColor: color,
                order: renderAs === 'line' ? 1 : 2,
                seriesIndex
            }, axisBinding);
            this._statsStampDatasetLabelMeta(base, chart, seriesIndex);
            const hasSpreadBand = ds.spread === 'stddevBand'
                && Array.isArray(ds.spreadLow)
                && Array.isArray(ds.spreadHigh);
            const spreadKey = 'spread-' + i;

            if (renderAs === 'bar' && hasSpreadBand) {
                const bandData = ds.spreadLow.map((lo, idx) => {
                    const hi = ds.spreadHigh[idx];
                    if (lo == null || hi == null || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
                    return [lo, hi];
                });
                chartDatasets.push(Object.assign({}, base, {
                    type: 'bar',
                    data: bandData,
                    backgroundColor: this._statsColorWithAlpha(color, 0.2),
                    borderColor: this._statsColorWithAlpha(color, 0.35),
                    borderWidth: 1,
                    order: 3,
                    statsLegendHidden: true,
                    statsSpreadBand: true,
                    statsSeriesKey: spreadKey
                }));
                chartDatasets.push(Object.assign({}, base, {
                    statsSpreadLow: ds.spreadLow,
                    statsSpreadHigh: ds.spreadHigh
                }));
                return;
            }

            if (renderAs === 'bar' && barStacked) {
                base.stack = 'bar-' + valueScale;
            }
            if (renderAs === 'line') {
                if (hasSpreadBand) {
                    chartDatasets.push(Object.assign({}, base, {
                        type: 'line',
                        data: ds.spreadLow,
                        borderWidth: 0,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        spanGaps: true,
                        order: 4,
                        statsLegendHidden: true,
                        statsSpreadBand: true,
                        statsSpreadLowLayer: true,
                        statsSeriesKey: spreadKey
                    }));
                    chartDatasets.push(Object.assign({}, base, {
                        type: 'line',
                        data: ds.spreadHigh,
                        fill: '-1',
                        backgroundColor: this._statsColorWithAlpha(color, 0.2),
                        borderWidth: 0,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        spanGaps: true,
                        order: 3,
                        statsLegendHidden: true,
                        statsSpreadBand: true,
                        statsSeriesKey: spreadKey
                    }));
                    chartDatasets.push(Object.assign({}, base, {
                        type: 'line',
                        tension: STATS_LINE_TENSION,
                        spanGaps: true,
                        pointRadius: 3,
                        fill: false,
                        order: 1,
                        statsSpreadLow: ds.spreadLow,
                        statsSpreadHigh: ds.spreadHigh
                    }));
                    return;
                }
                if (ds.segmentFillOnly) {
                    chartDatasets.push(Object.assign({}, base, {
                        order: 3,
                        fill: true,
                        backgroundColor: color,
                        borderWidth: 0,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        tension: STATS_LINE_TENSION,
                        spanGaps: true,
                        stack: 'line-' + valueScale,
                        statsLegendHidden: true
                    }));
                    return;
                }
                if (ds.segmentOutline) {
                    const outlineColor = theme.foreground;
                    chartDatasets.push(Object.assign({}, base, {
                        order: 1,
                        fill: false,
                        borderColor: outlineColor,
                        backgroundColor: outlineColor,
                        borderWidth: STATS_LINE_BORDER_WIDTH,
                        tension: STATS_LINE_TENSION,
                        spanGaps: true,
                        pointRadius: 3
                    }));
                    return;
                }
                const shaded = ds.lineStyle === 'shaded';
                if (shaded && !lineStacked) {
                    const seriesKey = 'shaded-' + i;
                    chartDatasets.push(Object.assign({}, base, {
                        order: 3,
                        fill: true,
                        backgroundColor: this._statsColorWithAlpha(color, 0.25),
                        borderWidth: 0,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        tension: STATS_LINE_TENSION,
                        spanGaps: true,
                        statsLegendHidden: true,
                        statsShadedFillLayer: true,
                        statsSeriesKey: seriesKey
                    }));
                    chartDatasets.push(Object.assign({}, base, {
                        order: 1,
                        fill: false,
                        tension: STATS_LINE_TENSION,
                        spanGaps: true,
                        pointRadius: 3,
                        borderWidth: STATS_LINE_BORDER_WIDTH,
                        borderColor: color,
                        statsSeriesKey: seriesKey
                    }));
                    return;
                }
                const lineOpts = {
                    tension: STATS_LINE_TENSION,
                    spanGaps: true,
                    pointRadius: 3,
                    borderWidth: STATS_LINE_BORDER_WIDTH,
                    fill: shaded,
                    borderColor: color
                };
                if (shaded) {
                    lineOpts.backgroundColor = color;
                } else {
                    lineOpts.fill = false;
                }
                if (shaded && lineStacked) {
                    lineOpts.stack = 'line-' + valueScale;
                }
                chartDatasets.push(Object.assign({}, base, lineOpts));
                return;
            }
            chartDatasets.push(base);
        });
        const barConfig = {
            type: 'bar',
            data: { labels: aggData.labels, datasets: chartDatasets },
            options: this._buildChartJsOptions(chart, theme, chartJsCtx)
        };
        const axisTitles = this._statsBarLineAxisTitles(chart, catalog);
        const barHorizontal = chart.orientation === 'horizontal';
        const barScales = barConfig.options && barConfig.options.scales;
        if (barScales) {
            if (barHorizontal) {
                if (barScales.y && axisTitles.categoryTitle) {
                    barScales.y.title = this._statsScaleTitle(axisTitles.categoryTitle, theme);
                }
                if (barScales.x && axisTitles.primaryTitle) {
                    barScales.x.title = this._statsScaleTitle(axisTitles.primaryTitle, theme);
                }
            } else {
                if (barScales.x && axisTitles.categoryTitle) {
                    barScales.x.title = this._statsScaleTitle(axisTitles.categoryTitle, theme);
                }
                if (barScales.y && axisTitles.primaryTitle) {
                    barScales.y.title = this._statsScaleTitle(axisTitles.primaryTitle, theme);
                }
                if (barScales.y1 && axisTitles.secondaryTitle) {
                    barScales.y1.title = this._statsScaleTitle(axisTitles.secondaryTitle, theme);
                }
            }
        }
        return barConfig;
    },

    _ensureStatsChartCardStyles() {
        if (typeof document === 'undefined') return;
        let style = document.getElementById(STATS_CHART_CARD_STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STATS_CHART_CARD_STYLE_ID;
            document.head.appendChild(style);
        }
        style.textContent = ''
            + '.wf-dash-stats-chart-card { display: flex; flex-direction: column; }'
            + '.wf-dash-stats-chart-header { display: flex; flex-wrap: wrap; align-items: center; column-gap: 8px; row-gap: 6px; margin-bottom: 8px; }'
            + '.wf-dash-stats-chart-header-title { display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 0; max-width: 100%; }'
            + '.wf-dash-stats-chart-header-text { font-size: 12px; font-weight: 600; color: var(--foreground, #0f172a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1 1 auto; }'
            + '.wf-dash-stats-chart-move { display: inline-flex; flex-direction: row; align-items: center; gap: 2px; flex-shrink: 0; }'
            + '.wf-dash-stats-chart-move button:disabled { opacity: 0.35; cursor: not-allowed; }'
            + '.wf-dash-stats-chart-header-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: flex-end; flex: 0 0 auto; margin-left: auto; max-width: 100%; }'
            + '.wf-dash-stats-chart-footer { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: flex-end; margin-top: auto; max-width: 100%;'
            + ' position: sticky; bottom: 0; z-index: 3; padding: 8px 0 2px; background: var(--card, #fff); }'
            + '.wf-dash-stats-chart-copy-select { cursor: pointer; }'
            + '.wf-dash-stats-chart-delete { border: none; background: transparent; color: var(--muted-foreground, #64748b); cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px; flex-shrink: 0; }'
            + '.wf-dash-stats-chart-header.wf-dash-stats-chart-header--actions-wrap .wf-dash-stats-chart-header-title { flex: 1 1 100%; }'
            + '.wf-dash-stats-chart-header.wf-dash-stats-chart-header--actions-wrap .wf-dash-stats-chart-header-actions { flex: 1 1 100%; margin-left: 0; justify-content: flex-end; }';
    },

    _syncStatsChartCardHeader(card) {
        const header = card && card.querySelector('.wf-dash-stats-chart-header');
        const titleRow = card && card.querySelector('.wf-dash-stats-chart-header-title');
        const actions = card && card.querySelector('.wf-dash-stats-chart-header-actions');
        if (!header || !titleRow || !actions) return;
        header.classList.remove('wf-dash-stats-chart-header--actions-wrap', 'wf-dash-stats-chart-header--actions-stack');
        let actionsNaturalWidth = 0;
        actions.querySelectorAll('button').forEach((btn, index) => {
            actionsNaturalWidth += btn.offsetWidth + (index > 0 ? 6 : 0);
        });
        const needsWrap = titleRow.scrollWidth + actionsNaturalWidth + 8 > header.clientWidth + 1;
        if (needsWrap) {
            header.classList.add('wf-dash-stats-chart-header--actions-wrap');
        }
    },

    _syncAllStatsChartCardHeaders(listEl) {
        if (!listEl) return;
        listEl.querySelectorAll('.wf-dash-stats-chart-card').forEach((card) => {
            this._syncStatsChartCardHeader(card);
        });
    },

    _teardownStatsChartHeaderLayout() {
        const ro = this._state && this._state.statsChartHeaderRo;
        if (!ro) return;
        ro.disconnect();
        this._state.statsChartHeaderRo = null;
    },

    _attachStatsChartHeaderLayout(listEl) {
        this._ensureStatsChartCardStyles();
        this._teardownStatsChartHeaderLayout();
        if (!listEl) return;
        const dash = this;
        const sync = () => dash._syncAllStatsChartCardHeaders(listEl);
        sync();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => sync());
        this._state.statsChartHeaderRo = ro;
        ro.observe(listEl);
        listEl.querySelectorAll('.wf-dash-stats-chart-card').forEach((card) => ro.observe(card));
    },

    _renderStatsBuilderValidation(missing) {
        const el = this._q('#wf-dash-stats-builder-validation');
        if (!el) return;
        if (missing && missing.length) {
            el.style.display = '';
            el.textContent = 'Missing parameter: ' + (missing[0].label || missing[0].id);
        } else {
            el.style.display = 'none';
            el.textContent = '';
        }
    },

    _showStatsBuilderImportError(message) {
        const el = this._q('#wf-dash-stats-builder-validation');
        if (!el) return;
        el.style.display = '';
        el.textContent = message;
    },

    _ensureStatsImportFileInput() {
        if (!this._modal) return null;
        let input = this._q('#wf-dash-stats-import-file');
        if (!input) {
            input = document.createElement('input');
            input.type = 'file';
            input.id = 'wf-dash-stats-import-file';
            input.accept = 'application/json,.json';
            input.style.display = 'none';
            input.addEventListener('change', (e) => {
                this._handleStatsImportFile(e);
            });
            this._modal.appendChild(input);
        }
        return input;
    },

    _resetStatsDashboard() {
        const engine = Context.statsEngine;
        if (!engine || typeof engine.resetDashboardCharts !== 'function') {
            Logger.warn('search-output-stats-pane: dashboard reset skipped — stats engine unavailable');
            return;
        }
        const active = this._activeStatsDashboard();
        const confirmed = confirm(
            'Reset dashboard "' + ((active && active.name) || 'Dashboard')
            + '" to the default chart set? Custom charts on this dashboard will be removed. This cannot be undone.'
        );
        if (!confirmed) return;
        this._state.statsLayout = engine.resetDashboardCharts(this._ensureStatsLayout(), active && active.id);
        this._persistStatsLayout();
        this._state.statsPanelDirty = false;
        void this._renderStatsPanel();
        const next = this._activeStatsDashboard();
        Logger.log(
            'search-output-stats-pane: dashboard reset to default — '
            + ((next && next.charts) ? next.charts.length : 0) + ' chart(s)'
        );
    },

    _exportStatsDashboard() {
        const engine = Context.statsEngine;
        if (!engine || typeof engine.exportLayoutObject !== 'function') {
            Logger.warn('search-output-stats-pane: dashboard export skipped — stats engine unavailable');
            return;
        }
        const store = this._ensureStatsLayout();
        const active = this._activeStatsDashboard();
        const payload = engine.exportLayoutObject(store);
        const date = typeof engine.exportDateSlug === 'function' ? engine.exportDateSlug() : 'export';
        const slug = typeof engine.sanitizeExportSlug === 'function'
            ? engine.sanitizeExportSlug(active && active.name)
            : 'dashboard';
        const filename = 'fleet-stats-dashboard-' + slug + '-' + date + '.json';
        const json = JSON.stringify(payload, null, 2);
        this._downloadTextFile(filename, json, 'application/json;charset=utf-8');
        Logger.log('search-output-stats-pane: dashboard exported — ' + payload.charts.length + ' chart(s)');
    },

    _exportStatsChart(chartId) {
        const engine = Context.statsEngine;
        if (!engine || !chartId || typeof engine.exportChartObject !== 'function') {
            Logger.warn('search-output-stats-pane: chart export skipped — missing chart or engine');
            return;
        }
        const dash = this._activeStatsDashboard();
        const chart = (dash.charts || []).find((c) => c.id === chartId);
        if (!chart) {
            Logger.warn('search-output-stats-pane: chart export skipped — chart not found ' + chartId);
            return;
        }
        const payload = engine.exportChartObject(chart);
        const slug = typeof engine.sanitizeExportSlug === 'function'
            ? engine.sanitizeExportSlug(chart.title)
            : 'chart';
        const date = typeof engine.exportDateSlug === 'function' ? engine.exportDateSlug() : 'export';
        const filename = 'fleet-stats-chart-' + slug + '-' + date + '.json';
        const json = JSON.stringify(payload, null, 2);
        this._downloadTextFile(filename, json, 'application/json;charset=utf-8');
        Logger.log('search-output-stats-pane: chart exported — ' + (chart.title || chartId));
    },

    _statsExportImageFilename(prefix, slug) {
        const engine = Context.statsEngine;
        const safeSlug = engine && typeof engine.sanitizeExportSlug === 'function'
            ? engine.sanitizeExportSlug(slug)
            : 'export';
        const date = engine && typeof engine.exportDateSlug === 'function' ? engine.exportDateSlug() : 'export';
        return prefix + '-' + safeSlug + '-' + date + '.png';
    },

    _statsExportPixelRatio() {
        return 2;
    },

    _statsChartBodyContainer(chart) {
        const card = this._q('.wf-dash-stats-chart-card[data-chart-id="' + chart.id + '"]');
        if (!card) return null;
        const scorecard = card.querySelector('[data-wf-dash-stats-scorecard="' + chart.id + '"]');
        if (scorecard && scorecard.parentElement) return scorecard.parentElement;
        const canvas = card.querySelector('#wf-dash-stats-canvas-' + chart.id);
        if (canvas && canvas.parentElement) return canvas.parentElement;
        return null;
    },

    _statsChartBodyCssWidth(chart) {
        const container = this._statsChartBodyContainer(chart);
        return container && container.clientWidth > 0 ? container.clientWidth : 0;
    },

    _statsDashboardExportCssWidth() {
        const list = this._q('#wf-dash-stats-chart-list');
        if (list && list.clientWidth > 0) return Math.max(320, list.clientWidth);
        const dash = this._activeStatsDashboard();
        let max = 0;
        for (const chart of (dash.charts || [])) {
            const width = this._statsChartBodyCssWidth(chart);
            if (width > max) max = width;
        }
        if (max > 0) return max;
        return 480;
    },

    _downloadDataUrl(filename, dataUrl) {
        try {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            Logger.error('search-output-stats-pane: image export download failed', e);
        }
    },

    _loadStatsImage(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('stats image load failed'));
            img.src = dataUrl;
        });
    },

    _getStatsScorecardBodyDataUrl(chart, exportCssWidth) {
        const el = this._q('[data-wf-dash-stats-scorecard="' + chart.id + '"]');
        if (!el || !String(el.textContent || '').trim()) return null;
        const theme = this._statsChartTheme();
        const height = this._statsResolvedChartHeight(chart);
        const width = exportCssWidth
            || this._statsChartBodyCssWidth(chart)
            || 480;
        const scale = this._statsExportPixelRatio();
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.scale(scale, scale);
        ctx.fillStyle = this._statsResolvedColor('--card', '#ffffff');
        ctx.fillRect(0, 0, width, height);
        const valueDiv = el.children[0];
        const subtitleDiv = el.children[1];
        const valueText = valueDiv ? valueDiv.textContent : '—';
        ctx.fillStyle = theme.foreground;
        ctx.font = '700 32px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(valueText, width / 2, height / 2 - (subtitleDiv ? 10 : 0));
        if (subtitleDiv && subtitleDiv.textContent) {
            ctx.fillStyle = theme.muted;
            ctx.font = '11px system-ui, -apple-system, sans-serif';
            ctx.fillText(subtitleDiv.textContent, width / 2, height / 2 + 24);
        }
        return canvas.toDataURL('image/png');
    },

    _getStatsChartBodyDataUrl(chart, exportCssWidth) {
        if (chart.type === 'scorecard') {
            return this._getStatsScorecardBodyDataUrl(chart, exportCssWidth);
        }
        const inst = this._state.statsCharts && this._state.statsCharts[chart.id];
        if (!inst || typeof inst.toBase64Image !== 'function') return null;
        // Capture the live chart at its on-screen size; compose scales the bitmap for export.
        // Never call inst.resize() here — it mutates the visible dashboard canvas.
        return inst.toBase64Image('image/png', this._statsExportPixelRatio());
    },

    async _composeStatsChartImage(chart, exportCssWidth) {
        const bodyCssWidth = exportCssWidth || this._statsChartBodyCssWidth(chart) || 480;
        const bodyDataUrl = this._getStatsChartBodyDataUrl(chart, bodyCssWidth);
        if (!bodyDataUrl) return null;
        let bodyImg;
        try {
            bodyImg = await this._loadStatsImage(bodyDataUrl);
        } catch (e) {
            Logger.warn('search-output-stats-pane: chart image compose failed — body load error', e);
            return null;
        }
        const theme = this._statsChartTheme();
        const horizontalPad = 12;
        const topPad = 10;
        const titleLineHeight = 18;
        const filterSummary = this._statsChartFilterSummary(chart);
        const filterLineHeight = filterSummary ? 16 : 0;
        const gapAfterHeader = 8;
        const pixelRatio = this._statsExportPixelRatio();
        const targetBodyWidth = Math.max(Math.round(bodyCssWidth * pixelRatio), 320 * pixelRatio);
        const bodyDrawHeight = bodyImg.width > 0
            ? Math.max(1, Math.round(bodyImg.height * (targetBodyWidth / bodyImg.width)))
            : bodyImg.height;
        const width = targetBodyWidth;
        const headerHeight = topPad + titleLineHeight + (filterSummary ? 4 + filterLineHeight : 0) + gapAfterHeader;
        const height = headerHeight + bodyDrawHeight + topPad;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = this._statsResolvedColor('--card', '#ffffff');
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = theme.border;
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
        ctx.fillStyle = theme.foreground;
        ctx.font = '600 12px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(chart.title || 'Chart', horizontalPad, topPad);
        if (filterSummary) {
            ctx.fillStyle = theme.muted;
            ctx.font = '10px system-ui, -apple-system, sans-serif';
            ctx.fillText(filterSummary, horizontalPad + 10, topPad + titleLineHeight + 4, width - horizontalPad * 2 - 10);
        }
        ctx.drawImage(bodyImg, 0, headerHeight, targetBodyWidth, bodyDrawHeight);
        return canvas.toDataURL('image/png');
    },

    _composeStatsImageRow(imgs, gapCss) {
        if (!imgs.length) return null;
        const gapPx = Math.round(gapCss * this._statsExportPixelRatio());
        const width = imgs.reduce((sum, img, index) => sum + img.width + (index > 0 ? gapPx : 0), 0);
        const height = Math.max(...imgs.map((img) => img.height));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = this._statsResolvedColor('--background', '#f8fafc');
        ctx.fillRect(0, 0, width, height);
        let x = 0;
        for (const img of imgs) {
            ctx.drawImage(img, x, 0);
            x += img.width + gapPx;
        }
        return canvas.toDataURL('image/png');
    },

    async _composeStatsDashboardExportImages(dashboard, exportCssWidth) {
        const groups = this._statsChartLayoutGroups((dashboard && dashboard.charts) || []);
        const images = [];
        for (const group of groups) {
            if ((group.kind === 'scorecard-row' || group.kind === 'circular-row') && group.charts.length > 1) {
                const rowMinWidth = this._statsStackRowMinWidth(group.kind);
                const cardWidth = Math.max(
                    rowMinWidth,
                    Math.floor((exportCssWidth - STATS_SCORECARD_ROW_GAP_PX * (group.charts.length - 1)) / group.charts.length)
                );
                const rowImgs = [];
                for (const chart of group.charts) {
                    const dataUrl = await this._composeStatsChartImage(chart, cardWidth);
                    if (!dataUrl) continue;
                    try {
                        rowImgs.push(await this._loadStatsImage(dataUrl));
                    } catch (e) {
                        Logger.warn('search-output-stats-pane: dashboard image export row compose failed — chart load error', e);
                    }
                }
                if (!rowImgs.length) continue;
                if (rowImgs.length === 1) {
                    images.push(rowImgs[0]);
                } else {
                    const rowDataUrl = this._composeStatsImageRow(rowImgs, STATS_SCORECARD_ROW_GAP_PX);
                    if (rowDataUrl) {
                        images.push(await this._loadStatsImage(rowDataUrl));
                    }
                }
                continue;
            }
            for (const chart of group.charts) {
                const dataUrl = await this._composeStatsChartImage(chart, exportCssWidth);
                if (!dataUrl) continue;
                try {
                    images.push(await this._loadStatsImage(dataUrl));
                } catch (e) {
                    Logger.warn('search-output-stats-pane: dashboard image export compose failed — chart load error', e);
                }
            }
        }
        return images;
    },

    async _exportStatsChartImage(chartId) {
        const chartIdStr = String(chartId || '');
        const dash = this._activeStatsDashboard();
        const chart = (dash.charts || []).find((c) => c.id === chartIdStr);
        if (!chart) {
            Logger.warn('search-output-stats-pane: chart image export skipped — chart not found ' + chartIdStr);
            return;
        }
        const dataUrl = await this._composeStatsChartImage(chart, this._statsChartBodyCssWidth(chart) || undefined);
        if (!dataUrl) {
            Logger.warn('search-output-stats-pane: chart image export skipped — chart not rendered ' + chartIdStr);
            return;
        }
        const filename = this._statsExportImageFilename('fleet-stats-chart', chart.title || chartIdStr);
        this._downloadDataUrl(filename, dataUrl);
        Logger.log('search-output-stats-pane: chart image exported — ' + (chart.title || chartIdStr));
    },

    async _exportStatsDashboardImage() {
        const dash = this._activeStatsDashboard();
        if (!(dash.charts || []).length) {
            Logger.warn('search-output-stats-pane: dashboard image export skipped — no charts');
            return;
        }
        const exportCssWidth = this._statsDashboardExportCssWidth();
        let imgs;
        try {
            imgs = await this._composeStatsDashboardExportImages(dash, exportCssWidth);
        } catch (e) {
            Logger.warn('search-output-stats-pane: dashboard image export failed — compose error', e);
            return;
        }
        if (!imgs.length) {
            Logger.warn('search-output-stats-pane: dashboard image export skipped — no renderable charts');
            return;
        }
        const gap = 12;
        const width = Math.max(...imgs.map((img) => img.width));
        const height = imgs.reduce((sum, img) => sum + img.height, 0) + gap * Math.max(0, imgs.length - 1);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            Logger.warn('search-output-stats-pane: dashboard image export failed — canvas unavailable');
            return;
        }
        ctx.fillStyle = this._statsResolvedColor('--background', '#f8fafc');
        ctx.fillRect(0, 0, width, height);
        let y = 0;
        for (const img of imgs) {
            ctx.drawImage(img, 0, y);
            y += img.height + gap;
        }
        const filename = this._statsExportImageFilename('fleet-stats-dashboard', (dash && dash.name) || 'dashboard');
        this._downloadDataUrl(filename, canvas.toDataURL('image/png'));
        Logger.log('search-output-stats-pane: dashboard image exported — ' + imgs.length + ' chart(s)');
    },

    _triggerStatsImportJson() {
        const input = this._ensureStatsImportFileInput();
        if (!input) return;
        input.value = '';
        input.click();
    },

    _handleStatsImportFile(event) {
        const engine = Context.statsEngine;
        const file = event && event.target && event.target.files && event.target.files[0];
        if (!file || !engine || typeof engine.parseImportPayload !== 'function') return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result || ''));
                const payload = engine.parseImportPayload(parsed);
                if (!payload || !payload.charts || !payload.charts.length) {
                    this._showStatsBuilderImportError('Import failed — expected a chart object or dashboard with a charts array');
                    Logger.warn('search-output-stats-pane: stats import rejected — invalid payload');
                    return;
                }
                const dash = this._activeStatsDashboard();
                let added = 0;
                for (const raw of payload.charts) {
                    const chart = typeof engine.prepareImportedChart === 'function'
                        ? engine.prepareImportedChart(raw)
                        : null;
                    if (!chart) continue;
                    dash.charts.push(chart);
                    added += 1;
                }
                if (!added) {
                    this._showStatsBuilderImportError('Import failed — no valid charts found in JSON');
                    Logger.warn('search-output-stats-pane: stats import rejected — no valid charts');
                    return;
                }
                this._persistStatsLayout();
                this._renderStatsBuilderValidation(null);
                Logger.log('search-output-stats-pane: imported ' + added + ' chart(s) from ' + payload.kind);
                this._closeStatsBuilder();
            } catch (e) {
                this._showStatsBuilderImportError('Import failed — invalid JSON');
                Logger.warn('search-output-stats-pane: stats import parse failed', e);
            }
        };
        reader.onerror = () => {
            this._showStatsBuilderImportError('Import failed — could not read file');
            Logger.warn('search-output-stats-pane: stats import file read failed');
        };
        reader.readAsText(file);
    },

    _statsCategorySortSelectValue(categorySort) {
        if (!categorySort) return '';
        return categorySort.seriesIndex + ':' + categorySort.direction;
    },

    _statsParseCategorySortSelectValue(value) {
        if (!value) return null;
        const parts = String(value).split(':');
        if (parts.length !== 2) return null;
        const seriesIndex = parseInt(parts[0], 10);
        if (!Number.isFinite(seriesIndex)) return null;
        return {
            seriesIndex,
            direction: parts[1] === 'desc' ? 'desc' : 'asc'
        };
    },

    _statsSeriesSortLabel(s, seriesIndex, catalog) {
        if (s.label) return s.label;
        const metric = (catalog.metrics || []).find((m) => m.id === s.metricId);
        return (metric && metric.label) || s.metricId || ('Series ' + (seriesIndex + 1));
    },

    _statsBuilderFieldStyles() {
        return {
            fieldLabel: 'font-size: 11px; font-weight: 600; color: var(--foreground, #0f172a); margin-bottom: 4px;',
            inputStyle: 'width: 100%; max-width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; background: var(--card, #fff); color: var(--foreground, #0f172a);',
            inputCompactStyle: 'width: 100%; max-width: 180px; box-sizing: border-box; padding: 6px 8px; font-size: 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; background: var(--card, #fff); color: var(--foreground, #0f172a);',
            inputDisabledStyle: 'width: 100%; max-width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; background: var(--card, #fff); color: var(--foreground, #0f172a); opacity: 0.55; cursor: not-allowed;',
            hintStyle: 'font-size: 10px; color: var(--muted-foreground, #64748b); margin-top: 4px; line-height: 1.35;',
            cardStyle: 'border: 1px solid var(--border, #e2e8f0); border-radius: 8px; padding: 8px; background: var(--muted, #f1f5f9);',
            gridAuto: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; align-items: start;',
            grid2: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; align-items: start;',
            grid3: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; align-items: start;',
            titleRow: 'display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end;',
            titleField: 'flex: 1 1 180px; min-width: 0;',
            dashboardField: 'flex: 0 1 180px; min-width: 140px; max-width: 200px;',
            sectionLabel: 'font-size: 11px; font-weight: 600; color: var(--foreground, #0f172a); margin-bottom: 6px;'
        };
    },

    _statsBuilderControlState(disabled) {
        const styles = this._statsBuilderFieldStyles();
        return {
            attr: disabled ? ' disabled' : '',
            style: disabled ? styles.inputDisabledStyle : styles.inputStyle,
            fieldOpacity: disabled ? ' opacity: 0.65;' : ''
        };
    },

    _statsBuilderField(label, innerHtml, opts) {
        opts = opts || {};
        const styles = opts.styles || this._statsBuilderFieldStyles();
        const spanStyle = opts.span ? ('grid-column: span ' + opts.span + ';') : '';
        const widthStyle = opts.maxWidth ? ('max-width: ' + opts.maxWidth + ';') : '';
        const fieldOpacity = opts.disabled ? ' opacity: 0.65;' : '';
        const hint = opts.hint ? ('<div style="' + styles.hintStyle + '">' + opts.hint + '</div>') : '';
        return '<div style="' + spanStyle + widthStyle + fieldOpacity + '"><div style="' + styles.fieldLabel + '">' + label + '</div>'
            + innerHtml + hint + '</div>';
    },

    _statsBuilderHeightOptions(draft, catalog) {
        const height = Number(draft.height) || 260;
        const presets = catalog.heightPresets || [];
        const presetIds = new Set(presets.map((h) => h.id));
        let opts = '';
        if (!presetIds.has(height)) {
            opts += '<option value="' + height + '" selected>' + height + '</option>';
        }
        opts += presets.map((h) =>
            '<option value="' + h.id + '"' + (height === h.id ? ' selected' : '') + '>' + dashEscHtml(h.label) + '</option>'
        ).join('');
        return opts;
    },

    _statsBuilderChartSettingsRows(draft, catalog, typeMeta, engine, styles) {
        const dimOpts = catalog.dimensions.map((d) =>
            '<option value="' + dashEscHtml(d.key) + '"' + (draft.groupBy === d.key ? ' selected' : '') + '>' + dashEscHtml(d.label) + '</option>'
        ).join('');
        const typeOpts = catalog.chartTypes.map((t) =>
            '<option value="' + dashEscHtml(t.id) + '"' + (draft.type === t.id ? ' selected' : '') + '>' + dashEscHtml(t.label) + '</option>'
        ).join('');
        const chartTypeField = this._statsBuilderField('Chart type',
            '<select data-wf-dash-stats-draft="type" style="' + styles.inputStyle + '">' + typeOpts + '</select>',
            { styles });
        const groupByField = typeMeta.skipGroupBy
            ? ''
            : this._statsBuilderField('Group by',
                '<select data-wf-dash-stats-draft="groupBy" style="' + styles.inputStyle + '">' + dimOpts + '</select>',
                { styles });
        const heightCfg = catalog.chartHeight || this._statsChartHeightConfig();
        const heightValue = this._statsNormalizeChartHeight(draft.height, heightCfg.default);
        const heightField = this._statsBuilderField('Height (px)',
            '<input type="number" data-wf-dash-stats-draft="height" min="' + heightCfg.min + '" max="' + heightCfg.max + '" step="' + heightCfg.step + '" value="' + heightValue + '" style="' + styles.inputCompactStyle + '">',
            { styles, hint: heightCfg.min + '–' + heightCfg.max + ' px in steps of ' + heightCfg.step, maxWidth: '180px' });
        const stackOn = draft.allowHorizontalStack !== false;
        const stackCheckStyle = 'display: inline-flex; align-items: center; gap: 8px; margin: 0; font-size: 12px; color: var(--foreground, #0f172a);';
        const horizontalStackField = typeMeta.allowsHorizontalStack
            ? this._statsBuilderField('Layout',
                '<label style="' + stackCheckStyle + '">'
                + '<input type="checkbox" data-wf-dash-stats-draft="allowHorizontalStack"'
                + (stackOn ? ' checked' : '') + '>'
                + 'Allow horizontal stacking</label>',
                { styles, hint: 'When on, this chart may share a row with adjacent scorecards or circular charts (also needs the dashboard Stack horizontally toggle).' })
            : '';
        const chartSettingsCells = [chartTypeField, groupByField, heightField, horizontalStackField].filter(Boolean);
        const chartSettingsHtml = '<div style="' + styles.gridAuto + '">' + chartSettingsCells.join('') + '</div>';

        const barLayout = draft.barLayout === 'stacked' ? 'stacked' : 'grouped';
        const barDatasetCount = engine.countBarDatasets ? engine.countBarDatasets(draft, catalog) : 0;
        const orientation = draft.orientation === 'horizontal' ? 'horizontal' : 'vertical';
        const shadedLineCount = engine.countShadedLineDatasets ? engine.countShadedLineDatasets(draft, catalog) : 0;
        const lineAreaLayout = draft.lineAreaLayout === 'stacked' ? 'stacked' : 'origin';

        const orientationField = typeMeta.needsOrientation
            ? this._statsBuilderField('Orientation',
                '<select data-wf-dash-stats-draft="orientation" style="' + styles.inputStyle + '">'
                + '<option value="vertical"' + (orientation !== 'horizontal' ? ' selected' : '') + '>Vertical</option>'
                + '<option value="horizontal"' + (orientation === 'horizontal' ? ' selected' : '') + '>Horizontal</option>'
                + '</select>',
                { styles })
            : '';
        const barLayoutDisabled = barDatasetCount < 2;
        const barLayoutCtl = this._statsBuilderControlState(barLayoutDisabled);
        const barLayoutField = typeMeta.needsBarLayout
            ? this._statsBuilderField('Bar layout',
                '<select data-wf-dash-stats-draft="barLayout" style="' + barLayoutCtl.style + '"' + barLayoutCtl.attr + '>'
                + '<option value="grouped"' + (barLayout !== 'stacked' ? ' selected' : '') + '>Grouped (side by side)</option>'
                + '<option value="stacked"' + (barLayout === 'stacked' ? ' selected' : '') + '>Stacked</option>'
                + '</select>',
                { styles, disabled: barLayoutDisabled })
            : '';
        const lineAreaLayoutDisabled = shadedLineCount < 2;
        const lineAreaLayoutCtl = this._statsBuilderControlState(lineAreaLayoutDisabled);
        const lineAreaLayoutField = typeMeta.needsLineAreaLayout
            ? this._statsBuilderField('Shaded area layout',
                '<select data-wf-dash-stats-draft="lineAreaLayout" style="' + lineAreaLayoutCtl.style + '"' + lineAreaLayoutCtl.attr + '>'
                + '<option value="origin"' + (lineAreaLayout !== 'stacked' ? ' selected' : '') + '>Fill to origin</option>'
                + '<option value="stacked"' + (lineAreaLayout === 'stacked' ? ' selected' : '') + '>Stacked (no overlap)</option>'
                + '</select>',
                { styles, disabled: lineAreaLayoutDisabled })
            : '';
        const categorySortValue = this._statsCategorySortSelectValue(draft.categorySort);
        let categorySortOpts = '<option value="">Group by order</option>';
        if (typeMeta.needsBarLayout) {
            const seriesList = draft.series && draft.series.length ? draft.series : [];
            for (let si = 0; si < seriesList.length; si += 1) {
                const seriesLabel = this._statsSeriesSortLabel(seriesList[si], si, catalog);
                const ascVal = si + ':asc';
                const descVal = si + ':desc';
                categorySortOpts += '<option value="' + ascVal + '"' + (categorySortValue === ascVal ? ' selected' : '') + '>'
                    + dashEscHtml(seriesLabel) + ' (asc)</option>';
                categorySortOpts += '<option value="' + descVal + '"' + (categorySortValue === descVal ? ' selected' : '') + '>'
                    + dashEscHtml(seriesLabel) + ' (desc)</option>';
            }
        }
        const categorySortField = typeMeta.needsBarLayout
            ? this._statsBuilderField('Category sort',
                '<select data-wf-dash-stats-draft="categorySort" style="' + styles.inputStyle + '">' + categorySortOpts + '</select>',
                { styles })
            : '';
        const layoutCells = [orientationField, barLayoutField, lineAreaLayoutField, categorySortField].filter(Boolean);
        let layoutOptionsHtml = '';
        if (layoutCells.length) {
            layoutOptionsHtml = '<div style="' + styles.gridAuto + '">' + layoutCells.join('') + '</div>';
        }

        const pointMode = draft.pointMode === 'task' ? 'task' : 'bucket';
        const pointModeHtml = typeMeta.needsPointMode
            ? this._statsBuilderField('Point mode',
                '<select data-wf-dash-stats-draft="pointMode" style="' + styles.inputStyle + '">'
                + '<option value="bucket"' + (pointMode === 'bucket' ? ' selected' : '') + '>Per bucket</option>'
                + '<option value="task"' + (pointMode === 'task' ? ' selected' : '') + '>Per task</option>'
                + '</select>',
                { styles })
            : '';

        return { chartSettingsHtml, layoutOptionsHtml, pointModeHtml, labelOptionsHtml: '' };
    },

    _statsBuilderSeriesLabelOptionsHtml(i, s, styles) {
        const flags = this._statsLabelShowFlagsFromSeries(s);
        const labelCheckStyle = 'display: inline-flex; align-items: center; gap: 8px; margin: 0; font-size: 12px; color: var(--foreground, #0f172a);';
        return this._statsBuilderField('Labels',
            '<div style="display: flex; flex-wrap: wrap; gap: 10px 16px;">'
            + '<label style="' + labelCheckStyle + '">'
            + '<input type="checkbox" data-wf-dash-stats-draft="series-labelShowAbsolute" data-series-idx="' + i + '"'
            + (flags.showAbsolute ? ' checked' : '') + '>'
            + 'Absolute</label>'
            + '<label style="' + labelCheckStyle + '">'
            + '<input type="checkbox" data-wf-dash-stats-draft="series-labelShowPercent" data-series-idx="' + i + '"'
            + (flags.showPercent ? ' checked' : '') + '>'
            + 'Percent of total</label>'
            + '<label style="' + labelCheckStyle + '">'
            + '<input type="checkbox" data-wf-dash-stats-draft="series-labelsShowName" data-series-idx="' + i + '"'
            + (flags.showName ? ' checked' : '') + '>'
            + 'Category name</label>'
            + '<label style="' + labelCheckStyle + '">'
            + '<input type="checkbox" data-wf-dash-stats-draft="series-labelsAlwaysVisible" data-series-idx="' + i + '"'
            + (flags.alwaysVisible ? ' checked' : '') + '>'
            + 'Show on chart</label>'
            + '</div>',
            { styles, hint: 'Percent is of that series’ total. Category name is the group label (e.g. slice name), shown on its own line.' });
    },

    _statsBuilderSeriesCard(i, s, ctx) {
        const { draft, catalog, typeMeta, engine, aggList, styles, seriesCount, maxSeries, minSeries } = ctx;
        const metricList = typeMeta.skipAggregation
            ? catalog.metrics.filter((m) => m.id !== 'count')
            : catalog.metrics;
        const metricOpts = metricList.map((m) =>
            '<option value="' + dashEscHtml(m.id) + '"' + (s.metricId === m.id ? ' selected' : '') + '>' + dashEscHtml(m.label) + '</option>'
        ).join('');
        const aggListForSeries = aggList;
        const aggOpts = aggListForSeries.map((a) =>
            '<option value="' + dashEscHtml(a.id) + '"' + (s.agg === a.id ? ' selected' : '') + '>' + dashEscHtml(a.label) + '</option>'
        ).join('');
        const segmentAllowed = engine.seriesAllowsSegment
            ? engine.seriesAllowsSegment(draft.type, s)
            : false;
        const showSeriesLabel = !typeMeta.skipGroupBy;
        const showRemove = maxSeries > 1 && seriesCount > minSeries;
        const showCardHeader = !typeMeta.skipGroupBy;
        const headerLabel = 'Series ' + (i + 1);

        const metricSelect = '<select data-wf-dash-stats-draft="series-metric" data-series-idx="' + i + '" style="' + styles.inputStyle + '">' + metricOpts + '</select>';
        const metricField = typeMeta.skipAggregation
            ? metricSelect
            : this._statsBuilderField('Metric', metricSelect, { styles });
        const aggField = this._statsBuilderField('Aggregation',
            '<select data-wf-dash-stats-draft="series-agg" data-series-idx="' + i + '" style="' + styles.inputStyle + '">' + aggOpts + '</select>',
            { styles });

        let row1Html = '';
        if (typeMeta.needsRenderAs) {
            const segmentBy = s.segmentBy || '';
            const segmentDisabled = !segmentAllowed;
            const segmentCtl = this._statsBuilderControlState(segmentDisabled);
            const segmentField = this._statsBuilderField('Segment by',
                '<select data-wf-dash-stats-draft="series-segment" data-series-idx="' + i + '" style="' + segmentCtl.style + '"' + segmentCtl.attr + '>'
                + '<option value="">None</option>'
                + catalog.dimensions.filter((d) => d.key !== draft.groupBy && d.key !== '__all__').map((d) =>
                    '<option value="' + dashEscHtml(d.key) + '"' + (segmentBy === d.key ? ' selected' : '') + '>' + dashEscHtml(d.label) + '</option>'
                ).join('')
                + '</select>',
                { styles, disabled: segmentDisabled });
            row1Html = '<div style="' + styles.gridAuto + '">' + metricField + aggField + segmentField + '</div>';
        } else if (typeMeta.skipAggregation) {
            row1Html = '<div style="' + styles.gridAuto + '">' + metricField + '</div>';
        } else {
            row1Html = '<div style="' + styles.gridAuto + '">' + metricField + aggField + '</div>';
        }

        let row2Html = '';
        if (showSeriesLabel) {
            row2Html = '<div style="margin-top: 8px; max-width: 280px;">'
                + this._statsBuilderField('Series label',
                    '<input type="text" data-wf-dash-stats-draft="series-label" data-series-idx="' + i + '" value="' + dashEscHtml(s.label || '') + '" style="' + styles.inputStyle + '">',
                    { styles })
                + '</div>';
        }

        let row3Html = '';
        if (typeMeta.needsRenderAs) {
            const lineStyle = s.lineStyle === 'shaded' ? 'shaded' : 'line';
            const yAxis = s.yAxis === 'y1' ? 'y1' : 'y';
            const lineStyleDisabled = s.renderAs !== 'line';
            const lineStyleCtl = this._statsBuilderControlState(lineStyleDisabled);
            const renderField = this._statsBuilderField('Render as',
                '<select data-wf-dash-stats-draft="series-render" data-series-idx="' + i + '" style="' + styles.inputStyle + '">'
                + '<option value="bar"' + (s.renderAs !== 'line' ? ' selected' : '') + '>Bar</option>'
                + '<option value="line"' + (s.renderAs === 'line' ? ' selected' : '') + '>Line</option>'
                + '</select>',
                { styles });
            const lineStyleField = this._statsBuilderField('Line style',
                '<select data-wf-dash-stats-draft="series-lineStyle" data-series-idx="' + i + '" style="' + lineStyleCtl.style + '"' + lineStyleCtl.attr + '>'
                + '<option value="line"' + (lineStyle !== 'shaded' ? ' selected' : '') + '>Line</option>'
                + '<option value="shaded"' + (lineStyle === 'shaded' ? ' selected' : '') + '>Shaded</option>'
                + '</select>',
                { styles, disabled: lineStyleDisabled });
            const yAxisField = this._statsBuilderField('Y axis',
                '<select data-wf-dash-stats-draft="series-yaxis" data-series-idx="' + i + '" style="' + styles.inputStyle + '">'
                + '<option value="y"' + (yAxis === 'y' ? ' selected' : '') + '>Left</option>'
                + '<option value="y1"' + (yAxis === 'y1' ? ' selected' : '') + '>Right</option>'
                + '</select>',
                { styles });
            const spread = s.spread === 'stddevBand' ? 'stddevBand' : 'none';
            const spreadDisabled = s.agg !== 'avg' || !!(s.segmentBy);
            const spreadCtl = this._statsBuilderControlState(spreadDisabled);
            const spreadField = this._statsBuilderField('Spread',
                '<select data-wf-dash-stats-draft="series-spread" data-series-idx="' + i + '" style="' + spreadCtl.style + '"' + spreadCtl.attr + '>'
                + '<option value="none"' + (spread === 'none' ? ' selected' : '') + '>None</option>'
                + '<option value="stddevBand"' + (spread === 'stddevBand' ? ' selected' : '') + '>±1 std dev</option>'
                + '</select>',
                {
                    styles,
                    disabled: spreadDisabled,
                    hint: 'Shows mean ± 1 sample std dev per category. Requires Average aggregation.'
                });
            row3Html = '<div style="' + styles.gridAuto + '; margin-top: 8px;">'
                + renderField + lineStyleField + yAxisField + spreadField + '</div>';
        }

        const supportsLabels = this._statsChartSupportsLabelOptions(draft);
        const labelRowHtml = supportsLabels
            ? ('<div style="margin-top: 8px;">' + this._statsBuilderSeriesLabelOptionsHtml(i, s, styles) + '</div>')
            : '';

        const removeBtn = showRemove
            ? ('<button type="button" data-wf-dash-stats-series-remove="' + i + '" class="' + this._dashBtnClass('basic', 'nav') + '" title="Remove series" aria-label="Remove series" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px;">×</button>')
            : '';

        return '<div data-wf-dash-stats-series-row="' + i + '" style="' + styles.cardStyle + '">'
            + (showCardHeader
                ? ('<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">'
                    + '<div style="' + styles.sectionLabel + ' margin-bottom: 0;">' + headerLabel + '</div>'
                    + removeBtn
                    + '</div>')
                : (showRemove
                    ? ('<div style="display: flex; justify-content: flex-end; margin-bottom: 8px;">' + removeBtn + '</div>')
                    : ''))
            + row1Html
            + row2Html
            + row3Html
            + labelRowHtml
            + '</div>';
    },

    _renderStatsBuilder() {
        const el = this._q('#wf-dash-stats-builder');
        if (!el) return;
        this._syncStatsToolbarUi();
        const engine = Context.statsEngine;
        const draft = this._state.statsBuilderDraft || (engine ? engine.defaultBuilderDraft(null) : null);
        if (!draft) {
            el.innerHTML = '<p style="font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;">Stats engine not loaded.</p>';
            return;
        }
        if (this._isStatsHydrationBlocking()) {
            el.innerHTML = '<p style="font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;">Charts will load once hydration is complete</p>';
            return;
        }
        const formEl = this._ensureStatsBuilderShell();
        if (!formEl) return;
        const items = this._getStatsScopeItems();
        const catalog = engine.buildCatalog(this._statsCatalogCtx(items));
        const box = typeof this._taskCardBoxStyle === 'function'
            ? this._taskCardBoxStyle()
            : this._panelBoxStyle();
        const styles = this._statsBuilderFieldStyles();
        const typeMeta = engine.getChartTypeMeta ? engine.getChartTypeMeta(draft.type) : { minSeries: 1, maxSeries: 4 };
        const aggList = engine.aggregationsForChartType
            ? engine.aggregationsForChartType(draft.type)
            : catalog.aggregations;
        const chartSettings = this._statsBuilderChartSettingsRows(draft, catalog, typeMeta, engine, styles);
        const series = draft.series && draft.series.length ? draft.series : [{ metricId: 'count', agg: 'count', label: '' }];
        const maxSeries = typeMeta.maxSeries || 4;
        const seriesCtx = {
            draft,
            catalog,
            typeMeta,
            engine,
            aggList,
            styles,
            seriesCount: series.length,
            maxSeries,
            minSeries: typeMeta.minSeries || 1
        };
        let seriesHtml = '';
        for (let i = 0; i < Math.min(series.length, maxSeries); i += 1) {
            seriesHtml += this._statsBuilderSeriesCard(i, series[i], seriesCtx);
        }
        const seriesStackHtml = seriesHtml
            ? ('<div style="display: flex; flex-direction: column; gap: 8px;">' + seriesHtml + '</div>')
            : '';
        const seriesActions = maxSeries > typeMeta.minSeries && series.length < maxSeries
            ? '<button type="button" data-wf-dash-stats-series-add="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="margin-top: 8px;">Add series</button>'
            : '';
        const lib = Context.dashboardLib;
        const filterScopes = (lib && lib.filterScopes) || [];
        let chartFiltersHtml = '';
        for (const { scopeKey, draftKey } of filterScopes) {
            const chartScopeKey = this._statsChartFilterScopeKey(draftKey);
            const label = typeof this._filterScopeLabel === 'function'
                ? this._filterScopeLabel(scopeKey)
                : draftKey;
            chartFiltersHtml += this._multiSelectHtml(chartScopeKey, label, 'No options in scope', false);
        }
        const seriesSectionLabel = typeMeta.skipGroupBy ? 'Metric' : 'Series';
        const selectedDashboardId = draft.dashboardId
            || this._state.statsBuilderDashboardId
            || (this._activeStatsDashboard() && this._activeStatsDashboard().id)
            || '';
        const titleField = this._statsBuilderField('Title',
            '<input type="text" data-wf-dash-stats-draft="title" value="' + dashEscHtml(draft.title || '') + '" style="' + styles.inputStyle + '">',
            { styles });
        const dashboardField = this._statsBuilderField('Dashboard',
            '<select data-wf-dash-stats-draft="dashboardId" style="' + styles.inputStyle + '">'
            + this._statsDashboardOptionsHtml(selectedDashboardId)
            + '</select>',
            { styles });
        formEl.innerHTML = '<div style="' + box + ' padding: 12px; display: flex; flex-direction: column; gap: 8px;">'
            + '<div id="wf-dash-stats-builder-validation" style="display: none; font-size: 11px; color: #dc2626;"></div>'
            + '<div style="' + styles.titleRow + '">'
            + '<div style="' + styles.titleField + '">' + titleField + '</div>'
            + '<div style="' + styles.dashboardField + '">' + dashboardField + '</div>'
            + '</div>'
            + chartSettings.chartSettingsHtml
            + chartSettings.layoutOptionsHtml
            + chartSettings.pointModeHtml
            + (chartSettings.labelOptionsHtml || '')
            + '<div><div style="' + styles.sectionLabel + '">' + seriesSectionLabel + '</div>'
            + seriesStackHtml + seriesActions + '</div>'
            + '<details style="margin-top: 2px;">'
            + '<summary style="font-size: 11px; font-weight: 600; color: var(--foreground, #0f172a); cursor: pointer; user-select: none;">Result filters (optional)</summary>'
            + '<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">' + chartFiltersHtml + '</div>'
            + '</details>'
            + '<div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;">'
            + '<button type="button" data-wf-dash-stats-builder-cancel="1" class="' + this._dashBtnClass('basic', 'nav') + '">Cancel</button>'
            + '<button type="button" data-wf-dash-stats-builder-save="1" class="' + this._dashBtnClass('primary', 'nav') + '">Save chart</button>'
            + '</div>'
            + '</div>';
        this._ensureStatsBuilderChartFilters(draft);
        this._renderStatsChartFilterLists(draft);
        this._renderStatsBuilderValidation(null);
        this._scheduleStatsBuilderPreview();
    },

    _syncStatsBuilderDraftFromForm() {
        const draft = this._state.statsBuilderDraft;
        if (!draft) return;
        const titleEl = this._q('[data-wf-dash-stats-draft="title"]');
        const dashboardEl = this._q('[data-wf-dash-stats-draft="dashboardId"]');
        const typeEl = this._q('[data-wf-dash-stats-draft="type"]');
        const groupEl = this._q('[data-wf-dash-stats-draft="groupBy"]');
        const barLayoutEl = this._q('[data-wf-dash-stats-draft="barLayout"]');
        const orientationEl = this._q('[data-wf-dash-stats-draft="orientation"]');
        const lineAreaLayoutEl = this._q('[data-wf-dash-stats-draft="lineAreaLayout"]');
        const categorySortEl = this._q('[data-wf-dash-stats-draft="categorySort"]');
        const heightEl = this._q('[data-wf-dash-stats-draft="height"]');
        const pointModeEl = this._q('[data-wf-dash-stats-draft="pointMode"]');
        const allowHorizontalStackEl = this._q('[data-wf-dash-stats-draft="allowHorizontalStack"]');
        if (titleEl) draft.title = titleEl.value;
        if (dashboardEl) {
            draft.dashboardId = dashboardEl.value;
            this._state.statsBuilderDashboardId = dashboardEl.value;
        }
        if (typeEl) draft.type = typeEl.value;
        if (groupEl) draft.groupBy = groupEl.value;
        if (barLayoutEl) draft.barLayout = barLayoutEl.value === 'stacked' ? 'stacked' : 'grouped';
        else if (this._statsNormalizeChartType(draft.type) !== 'barLine') draft.barLayout = 'grouped';
        if (orientationEl) draft.orientation = orientationEl.value === 'horizontal' ? 'horizontal' : 'vertical';
        else if (this._statsNormalizeChartType(draft.type) !== 'barLine') draft.orientation = 'vertical';
        if (lineAreaLayoutEl) draft.lineAreaLayout = lineAreaLayoutEl.value === 'stacked' ? 'stacked' : 'origin';
        else if (this._statsNormalizeChartType(draft.type) !== 'barLine') draft.lineAreaLayout = 'origin';
        if (categorySortEl) {
            draft.categorySort = this._statsParseCategorySortSelectValue(categorySortEl.value);
        } else if (this._statsNormalizeChartType(draft.type) !== 'barLine') {
            draft.categorySort = null;
        }
        if (heightEl) {
            draft.height = this._statsNormalizeChartHeight(heightEl.value, draft.height);
            heightEl.value = String(draft.height);
        }
        if (pointModeEl) draft.pointMode = pointModeEl.value === 'task' ? 'task' : 'bucket';
        const engine = Context.statsEngine;
        const typeMeta = engine && engine.getChartTypeMeta
            ? engine.getChartTypeMeta(draft.type)
            : null;
        if (typeMeta && typeMeta.allowsHorizontalStack) {
            draft.allowHorizontalStack = allowHorizontalStackEl
                ? !!allowHorizontalStackEl.checked
                : (draft.allowHorizontalStack !== false);
        } else {
            delete draft.allowHorizontalStack;
        }
        delete draft.labelFormat;
        delete draft.labelShowAbsolute;
        delete draft.labelShowPercent;
        delete draft.labelsShowName;
        delete draft.labelsAlwaysVisible;
        const series = [];
        const draftSeries = draft.series || [];
        this._modal.querySelectorAll('[data-wf-dash-stats-series-row]').forEach((row) => {
            const metricEl = row.querySelector('[data-wf-dash-stats-draft="series-metric"]');
            const aggEl = row.querySelector('[data-wf-dash-stats-draft="series-agg"]');
            const labelEl = row.querySelector('[data-wf-dash-stats-draft="series-label"]');
            const renderEl = row.querySelector('[data-wf-dash-stats-draft="series-render"]');
            const lineStyleEl = row.querySelector('[data-wf-dash-stats-draft="series-lineStyle"]');
            const yAxisEl = row.querySelector('[data-wf-dash-stats-draft="series-yaxis"]');
            const segmentEl = row.querySelector('[data-wf-dash-stats-draft="series-segment"]');
            const spreadEl = row.querySelector('[data-wf-dash-stats-draft="series-spread"]');
            const labelAbsEl = row.querySelector('[data-wf-dash-stats-draft="series-labelShowAbsolute"]');
            const labelPctEl = row.querySelector('[data-wf-dash-stats-draft="series-labelShowPercent"]');
            const labelNameEl = row.querySelector('[data-wf-dash-stats-draft="series-labelsShowName"]');
            const labelAlwaysEl = row.querySelector('[data-wf-dash-stats-draft="series-labelsAlwaysVisible"]');
            if (!metricEl) return;
            const rowIdx = Number(row.getAttribute('data-wf-dash-stats-series-row'));
            const prev = Number.isInteger(rowIdx) && rowIdx >= 0 ? draftSeries[rowIdx] : null;
            const entry = {
                metricId: metricEl.value,
                agg: aggEl ? aggEl.value : ((prev && prev.agg) || 'count'),
                label: labelEl ? labelEl.value : ''
            };
            if (renderEl) entry.renderAs = renderEl.value === 'line' ? 'line' : 'bar';
            if (lineStyleEl) entry.lineStyle = lineStyleEl.value === 'shaded' ? 'shaded' : 'line';
            if (yAxisEl) entry.yAxis = yAxisEl.value === 'y1' ? 'y1' : 'y';
            if (segmentEl) entry.segmentBy = segmentEl.value || null;
            if (spreadEl) entry.spread = spreadEl.value === 'stddevBand' ? 'stddevBand' : 'none';
            if (labelAbsEl || labelPctEl || labelNameEl || labelAlwaysEl) {
                const abs = !!(labelAbsEl && labelAbsEl.checked);
                const pct = !!(labelPctEl && labelPctEl.checked);
                entry.labelShowAbsolute = abs;
                entry.labelShowPercent = pct;
                entry.labelsShowName = !!(labelNameEl && labelNameEl.checked);
                entry.labelsAlwaysVisible = !!(labelAlwaysEl && labelAlwaysEl.checked);
                const eng = Context.statsEngine;
                entry.labelFormat = eng && typeof eng.labelFormatFromShowFlags === 'function'
                    ? eng.labelFormatFromShowFlags(abs, pct)
                    : (abs && pct ? 'both' : (pct ? 'percent' : 'absolute'));
            } else if (prev) {
                entry.labelShowAbsolute = prev.labelShowAbsolute;
                entry.labelShowPercent = prev.labelShowPercent;
                entry.labelsShowName = prev.labelsShowName;
                entry.labelsAlwaysVisible = prev.labelsAlwaysVisible;
                entry.labelFormat = prev.labelFormat;
            }
            series.push(entry);
        });
        if (series.length) draft.series = series;
        this._syncStatsChartFiltersFromForm();
    },

    _onStatsBuilderTypeChange() {
        const draft = this._state.statsBuilderDraft;
        const engine = Context.statsEngine;
        if (!draft || !engine) return;
        const meta = engine.getChartTypeMeta(draft.type);
        const items = this._getStatsScopeItems();
        const catalog = engine.buildCatalog(this._statsCatalogCtx(items));
        if (meta && draft.series) {
            if (draft.series.length > meta.maxSeries) {
                draft.series = draft.series.slice(0, meta.maxSeries);
            }
            if (!meta.allowCountAxis) {
                const numeric = (catalog.metrics || []).filter((m) => m.id !== 'count');
                const pickMetric = (i) => (numeric[i] && numeric[i].id) || (numeric[0] && numeric[0].id) || 'prompt_version_count';
                draft.series = draft.series.map((s, i) => ({
                    metricId: s.metricId === 'count' ? pickMetric(i) : s.metricId,
                    agg: s.metricId === 'count' ? 'avg' : s.agg,
                    label: s.label || ''
                }));
            }
            while (draft.series.length < meta.minSeries) {
                const numeric = (catalog.metrics || []).filter((m) => m.id !== 'count');
                const pick = (numeric[draft.series.length] && numeric[draft.series.length].id)
                    || (numeric[0] && numeric[0].id)
                    || 'prompt_version_count';
                draft.series.push(Object.assign({
                    metricId: pick,
                    agg: 'avg',
                    label: '',
                    renderAs: draft.series.length === 0 ? 'bar' : 'line',
                    lineStyle: 'line',
                    yAxis: draft.series.length === 0 ? 'y' : 'y1'
                }, (engine.defaultSeriesLabelFlags && engine.defaultSeriesLabelFlags()) || {
                    labelShowAbsolute: true,
                    labelShowPercent: false,
                    labelsShowName: false,
                    labelsAlwaysVisible: false,
                    labelFormat: 'absolute'
                }));
            }
            if (meta.needsRenderAs) {
                draft.series.forEach((s, i) => {
                    if (!s.renderAs) s.renderAs = i === 0 ? 'bar' : 'line';
                    if (s.renderAs === 'line' && !s.lineStyle) s.lineStyle = 'line';
                    if (s.renderAs !== 'line') s.lineStyle = 'line';
                    if (meta.needsDualAxis && s.yAxis == null) {
                        s.yAxis = s.renderAs === 'line' ? 'y1' : 'y';
                    }
                });
            } else if (meta.needsDualAxis) {
                draft.series.forEach((s, i) => {
                    if (s.yAxis == null) s.yAxis = i === 0 ? 'y' : 'y';
                });
            }
            if (meta.needsPointMode && !draft.pointMode) {
                draft.pointMode = 'bucket';
            }
            if (meta.skipGroupBy) {
                draft.groupBy = '__scope__';
                draft.series = (draft.series || []).slice(0, 1);
                if (draft.type === 'histogram' || draft.type === 'bellCurve') {
                    const pick = this._statsPickHistogramMetric(catalog);
                    if (!draft.series.length) {
                        draft.series = [{ metricId: pick, agg: 'count', label: '' }];
                    } else if (draft.series[0].metricId === 'count') {
                        draft.series[0].metricId = pick;
                        draft.series[0].agg = 'count';
                    } else {
                        const metric = catalog.metrics.find((m) => m.id === draft.series[0].metricId);
                        if (!metric || (metric.requiresHydration && (metric.sampleCount || 0) === 0)) {
                            draft.series[0].metricId = pick;
                        }
                    }
                } else if (!draft.series.length) {
                    draft.series = [{ metricId: 'count', agg: 'count', label: '' }];
                }
                const skipGroupDefault = meta.defaultHeight || this._statsChartHeightConfig().default;
                if (!draft.height || (draft.type === 'scorecard' && draft.height > skipGroupDefault + 80)) {
                    draft.height = this._statsNormalizeChartHeight(skipGroupDefault);
                }
            }
            if (draft.series && engine.seriesAllowsSegment) {
                draft.series.forEach((s) => {
                    if (!engine.seriesAllowsSegment(draft.type, s)) {
                        s.segmentBy = null;
                    }
                    if (s.agg !== 'avg' || s.segmentBy) {
                        s.spread = 'none';
                    }
                });
            }
            if (!meta.needsBarLayout) {
                draft.barLayout = 'grouped';
            }
            if (!meta.needsOrientation) {
                draft.orientation = 'vertical';
            }
            if (!meta.needsLineAreaLayout) {
                draft.lineAreaLayout = 'origin';
            }
            if (!meta.needsBarLayout) {
                draft.categorySort = null;
            } else if (draft.categorySort && engine.normalizeCategorySort) {
                draft.categorySort = engine.normalizeCategorySort(
                    draft.categorySort,
                    (draft.series && draft.series.length) || 0
                );
            }
            if (meta.allowsHorizontalStack) {
                if (draft.allowHorizontalStack == null) draft.allowHorizontalStack = true;
            } else {
                delete draft.allowHorizontalStack;
            }
        }
        void this._renderStatsBuilder();
    },

    _onStatsBuilderDimensionChange() {
        const draft = this._state.statsBuilderDraft;
        if (!draft) return;
        this._syncStatsBuilderDraftFromForm();
        if (draft.series) {
            draft.series.forEach((s) => {
                if (s.segmentBy && s.segmentBy === draft.groupBy) {
                    s.segmentBy = null;
                }
            });
        }
        void this._renderStatsBuilder();
    },

    _addStatsBuilderSeriesRow() {
        this._syncStatsBuilderDraftFromForm();
        const draft = this._state.statsBuilderDraft;
        const engine = Context.statsEngine;
        if (!draft || !engine) return;
        const meta = engine.getChartTypeMeta(draft.type);
        const maxSeries = meta.maxSeries || 4;
        if (!draft.series || !draft.series.length) {
            draft.series = [{ metricId: 'count', agg: 'count', label: '' }];
        }
        if (draft.series.length >= maxSeries) return;
        const items = this._getStatsScopeItems();
        const catalog = engine.buildCatalog(this._statsCatalogCtx(items));
        const firstNumeric = (catalog.metrics || []).find((m) => m.id !== 'count');
        draft.series.push(Object.assign({
            metricId: firstNumeric ? firstNumeric.id : 'count',
            agg: firstNumeric ? 'avg' : 'count',
            label: '',
            renderAs: draft.series.length === 0 ? 'bar' : 'line',
            lineStyle: 'line',
            yAxis: 'y'
        }, (engine.defaultSeriesLabelFlags && engine.defaultSeriesLabelFlags()) || {
            labelShowAbsolute: true,
            labelShowPercent: false,
            labelsShowName: false,
            labelsAlwaysVisible: false,
            labelFormat: 'absolute'
        }));
        void this._renderStatsBuilder();
    },

    _removeStatsBuilderSeriesRow(idx) {
        this._syncStatsBuilderDraftFromForm();
        const draft = this._state.statsBuilderDraft;
        if (!draft || !draft.series || draft.series.length <= 1) return;
        const i = Number(idx);
        if (!Number.isFinite(i) || i < 0 || i >= draft.series.length) return;
        draft.series.splice(i, 1);
        const engine = Context.statsEngine;
        if (draft.categorySort) {
            if (draft.categorySort.seriesIndex === i) {
                draft.categorySort = null;
            } else if (draft.categorySort.seriesIndex > i) {
                draft.categorySort = {
                    seriesIndex: draft.categorySort.seriesIndex - 1,
                    direction: draft.categorySort.direction
                };
            }
            if (engine && engine.normalizeCategorySort) {
                draft.categorySort = engine.normalizeCategorySort(draft.categorySort, draft.series.length);
            }
        }
        void this._renderStatsBuilder();
    },

    _onStatsBuilderSeriesRenderChange() {
        this._syncStatsBuilderDraftFromForm();
        const draft = this._state.statsBuilderDraft;
        if (!draft || this._statsNormalizeChartType(draft.type) !== 'barLine') return;
        draft.series.forEach((s) => {
            s.yAxis = s.renderAs === 'line' ? 'y1' : 'y';
            if (s.renderAs === 'line') {
                if (!s.lineStyle) s.lineStyle = 'line';
                if (s.lineStyle !== 'shaded') s.segmentBy = null;
            } else {
                s.lineStyle = 'line';
            }
        });
        void this._renderStatsBuilder();
    },

    _onStatsBuilderLineStyleChange() {
        this._syncStatsBuilderDraftFromForm();
        const draft = this._state.statsBuilderDraft;
        if (!draft) return;
        draft.series.forEach((s) => {
            if (s.renderAs === 'line' && s.lineStyle !== 'shaded') {
                s.segmentBy = null;
            }
        });
        void this._renderStatsBuilder();
    },

    _renderStatsWarnings(warnings) {
        const warnEl = this._q('#wf-dash-stats-warnings');
        if (!warnEl) return;
        if (warnings.length) {
            warnEl.style.display = 'flex';
            warnEl.innerHTML = warnings.map((w) =>
                '<div style="font-size: 11px; padding: 8px 10px; border-radius: 6px; background: color-mix(in srgb, #f59e0b 12%, var(--card, #fff)); color: var(--foreground, #0f172a); border: 1px solid color-mix(in srgb, #f59e0b 35%, var(--border, #e2e8f0));">' + dashEscHtml(w) + '</div>'
            ).join('');
        } else {
            warnEl.style.display = 'none';
            warnEl.innerHTML = '';
        }
    },

    _renderStatsFallbackText(layout, catalog, items, ctx) {
        const engine = Context.statsEngine;
        const listEl = this._q('#wf-dash-stats-chart-list');
        if (!listEl || !engine) return;
        let extra = '';
        for (const chart of (layout && layout.charts) || []) {
            const agg = engine.aggregateChart(chart, items, catalog, ctx);
            if (chart.type === 'scorecard') {
                extra += '<div style="font-size: 11px; margin-top: 8px;"><strong>' + dashEscHtml(chart.title) + ':</strong> '
                    + dashEscHtml(this._formatStatsScorecardValue(agg.value))
                    + (agg.subtitle ? ' (' + dashEscHtml(agg.subtitle) + ')' : '')
                    + '</div>';
                continue;
            }
            if (!this._statsChartHasRenderableData(chart, agg)) {
                const hint = this._statsChartEmptyMessage(chart, agg, catalog);
                if (hint) {
                    extra += '<div style="font-size: 11px; margin-top: 8px;"><strong>' + dashEscHtml(chart.title) + ':</strong> '
                        + dashEscHtml(hint) + '</div>';
                }
                continue;
            }
            if (chart.type === 'bellCurve' && (agg.bins || []).length) {
                const statsLine = this._formatBellCurveStatsSubtitle(agg.stats);
                extra += '<div style="font-size: 11px; margin-top: 8px;"><strong>' + dashEscHtml(chart.title) + ':</strong> '
                    + dashEscHtml(agg.bins.map((b) => b.label + ' (' + (b.y != null ? b.y : 'n/a') + ')').join('; '))
                    + (statsLine ? ' — ' + dashEscHtml(statsLine) : '')
                    + '</div>';
                continue;
            }
            const pointCount = (agg.points || []).length;
            const labelCount = (agg.labels || []).length;
            if (!pointCount && !labelCount) continue;
            if (pointCount) {
                const s0 = (chart.series || [])[0] || {};
                const s1 = (chart.series || [])[1] || {};
                const xLabel = this._statsResolveSeriesLabel(s0, catalog);
                const yLabel = this._statsResolveSeriesLabel(s1, catalog);
                extra += '<div style="font-size: 11px; margin-top: 8px;"><strong>' + dashEscHtml(chart.title) + ':</strong> '
                    + dashEscHtml(agg.points.map((p) => {
                        const name = p.label ? p.label + ' ' : '';
                        return name + '(' + xLabel + ' ' + this._formatStatsScorecardValue(p.x)
                            + ', ' + yLabel + ' ' + this._formatStatsScorecardValue(p.y) + ')';
                    }).join('; '))
                    + '</div>';
                continue;
            }
            extra += '<div style="font-size: 11px; margin-top: 8px;"><strong>' + dashEscHtml(chart.title) + ':</strong> '
                + dashEscHtml(agg.labels.map((l, i) => {
                    const count = (agg.datasets || [])[0] && agg.datasets[0].data[i];
                    if (chart.type === 'histogram') {
                        return l + ' (' + (count != null ? count : 'n/a') + ')';
                    }
                    const vals = (agg.datasets || []).map((d) => {
                        const v = d.data[i] != null ? d.data[i] : 'n/a';
                        let text = d.label + ' ' + v;
                        if (d.spread === 'stddevBand'
                            && Array.isArray(d.spreadLow) && Array.isArray(d.spreadHigh)
                            && d.spreadLow[i] != null && d.spreadHigh[i] != null) {
                            text += ' (±σ ' + d.spreadLow[i] + '–' + d.spreadHigh[i] + ')';
                        }
                        return text;
                    }).join(', ');
                    return l + ' (' + vals + ')';
                }).join('; '))
                + '</div>';
        }
        const existing = listEl.querySelector('[data-wf-dash-stats-fallback]');
        if (existing) existing.remove();
        if (extra) {
            const div = document.createElement('div');
            div.setAttribute('data-wf-dash-stats-fallback', 'true');
            div.style.cssText = 'font-size: 11px; color: var(--muted-foreground, #64748b);';
            div.innerHTML = extra;
            listEl.appendChild(div);
        }
    },

    _isStatsPanelOpen() {
        if ((this._state.statsViewMode || 'dashboard') === 'builder') return true;
        if ((this._state.statsTab || 'stats') !== 'stats') return false;
        const dashApi = Context.dashboard;
        if (dashApi && typeof dashApi.readStatsPanelHiddenPref === 'function') {
            return !dashApi.readStatsPanelHiddenPref();
        }
        return true;
    },

    async _renderStatsPanel() {
        if ((this._state.statsTab || 'stats') !== 'stats') return;
        if ((this._state.statsViewMode || 'dashboard') === 'builder') {
            this._renderStatsBuilder();
            return;
        }
        if (!this._isStatsPanelOpen()) {
            this._state.statsPanelDirty = true;
            return;
        }
        this._state.statsPanelDirty = false;

        const emptyEl = this._q('#wf-dash-stats-empty');
        const dashEl = this._q('#wf-dash-stats-dashboard');
        const listEl = this._q('#wf-dash-stats-chart-list');
        if (!emptyEl || !dashEl || !listEl) return;

        this._syncStatsScopeToggleUi();
        this._syncStatsToolbarUi();

        if (!this._state.hasSearched || !this._state.cachedItems) {
            this._destroyStatsCharts();
            emptyEl.style.display = 'flex';
            emptyEl.textContent = 'Run a search to load results.';
            dashEl.style.display = 'none';
            this._renderStatsWarnings([]);
            return;
        }

        if (this._isStatsHydrationBlocking()) {
            emptyEl.style.display = 'flex';
            emptyEl.textContent = 'Charts will load once hydration is complete';
            dashEl.style.display = 'none';
            this._renderStatsWarnings([]);
            return;
        }

        const items = this._getStatsScopeItems();
        const warnings = this._getStatsHydrationWarnings(items);
        this._renderStatsWarnings(warnings);

        if (items.length === 0) {
            this._destroyStatsCharts();
            emptyEl.style.display = 'flex';
            emptyEl.textContent = 'No results in this scope.';
            dashEl.style.display = 'none';
            return;
        }

        emptyEl.style.display = 'none';
        dashEl.style.display = 'flex';
        this._destroyStatsCharts();

        const engine = Context.statsEngine;
        const dash = this._activeStatsDashboard();
        const ctx = this._statsCatalogCtx(items);
        const catalog = engine ? engine.buildCatalog(ctx) : null;

        if (!engine || !catalog) {
            listEl.innerHTML = '<p style="font-size: 12px; color: var(--destructive, #dc2626); margin: 0;">Stats engine not loaded.</p>';
            return;
        }

        let cardsHtml = '';
        const validations = [];
        for (const chart of (dash.charts || [])) {
            const validation = engine.validateChart(chart, catalog, items, ctx);
            validations.push({ chart, validation });
        }
        listEl.innerHTML = this._statsBuildChartListHtml(validations);
        this._attachStatsChartHeaderLayout(listEl);

        const renderGen = (this._state.statsRenderGen || 0) + 1;
        this._state.statsRenderGen = renderGen;

        let rendered = 0;
        for (const { chart, validation } of validations) {
            if (!validation.ok || chart.type !== 'scorecard') continue;
            const aggData = engine.aggregateChart(chart, items, catalog, ctx);
            this._renderStatsScorecardEl(chart, aggData);
            rendered += 1;
        }

        const canvasCharts = validations.filter(({ chart, validation }) => validation.ok && chart.type !== 'scorecard');
        if (!canvasCharts.length) {
            this._state.statsCharts = {};
            if (rendered > 0) {
                Logger.log('search-output-stats-pane: stats dashboard rendered — ' + items.length + ' item(s), ' + rendered + ' chart(s)');
            }
            return;
        }

        const chartApi = Context.chartJs;
        if (!chartApi || typeof chartApi.ensureLoaded !== 'function') {
            this._renderStatsWarnings([...warnings, 'Chart.js loader not available. Reload the page and try again.']);
            this._renderStatsFallbackText(dash, catalog, items, ctx);
            return;
        }

        let Chart;
        try {
            Chart = await chartApi.ensureLoaded();
        } catch (e) {
            this._renderStatsWarnings([...warnings, 'Chart.js failed to load — showing text summary only.']);
            this._renderStatsFallbackText(dash, catalog, items, ctx);
            Logger.warn('search-output-stats-pane: Chart.js load failed', e);
            return;
        }

        if (this._state.statsRenderGen !== renderGen || (this._state.statsTab || 'stats') !== 'stats') {
            return;
        }

        const theme = this._statsChartTheme();
        const charts = {};
        for (const { chart, validation } of canvasCharts) {
            const canvas = this._q('#wf-dash-stats-canvas-' + chart.id);
            if (!canvas) continue;
            const aggData = engine.aggregateChart(chart, items, catalog, ctx);
            if (!this._statsChartHasRenderableData(chart, aggData)) continue;
            const containerWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 0;
            const config = this._statsFinalizeChartJsConfig(
                this._buildChartJsConfig(chart, aggData, theme, containerWidth, catalog),
                chart,
                theme
            );
            charts[chart.id] = new Chart(canvas, config);
            if (chart.type === 'bellCurve') {
                this._renderBellCurveStatsSubtitle(chart.id, aggData);
            }
            rendered += 1;
        }
        this._state.statsCharts = charts;
        Logger.log('search-output-stats-pane: stats dashboard rendered — ' + items.length + ' item(s), ' + rendered + ' chart(s)');
    },

    _statsTabStyle(active) {
        const base = 'padding: 8px 12px; font-size: 12px; font-weight: 600; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; background: transparent;';
        return active
            ? base + ' color: var(--foreground, #0f172a); border-bottom-color: var(--brand, var(--primary, #2563eb));'
            : base + ' color: var(--muted-foreground, #64748b);';
    },

    _setStatsTab(tab) {
        this._state.statsTab = tab;
        this._syncStatsTabUi();
        Logger.log('search-output-stats-pane: stats tab ' + tab);
        if (tab === 'stats') {
            void this._renderStatsPanel();
        } else if (tab === 'ratings') {
            this._renderRatingsPanel();
        }
    },

    _syncStatsTabUi() {
        const tab = this._state.statsTab || 'stats';
        const ratingsPanel = this._q('#wf-dash-stats-panel-ratings');
        const statsPanel = this._q('#wf-dash-stats-panel-stats');
        if (ratingsPanel) ratingsPanel.style.display = tab === 'ratings' ? 'flex' : 'none';
        if (statsPanel) statsPanel.style.display = tab === 'stats' ? 'flex' : 'none';
        if (this._modal) {
            this._modal.querySelectorAll('[data-wf-dash-stats-tab]').forEach((btn) => {
                const active = btn.getAttribute('data-wf-dash-stats-tab') === tab;
                btn.style.cssText = this._statsTabStyle(active);
            });
        }
        this._syncStatsScopeToggleUi();
    },

    _ensureStatsToggleButton(statsCol) {
        let btn = statsCol.querySelector('[data-wf-dash-stats-toggle]');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-wf-dash-stats-toggle', 'true');
            btn.className = this._dashBtnClass('basic', 'nav');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleStatsPanelHidden();
            });
        }
        return btn;
    },

    _resetStatsPanelScroll() {
        const dashEl = this._q('#wf-dash-stats-dashboard');
        if (dashEl) dashEl.scrollTop = 0;
        const ratingsEl = this._q('#wf-dash-stats-panel-ratings');
        if (ratingsEl) ratingsEl.scrollTop = 0;
    },

    _syncStatsPanelCollapseUi() {
        const statsCol = this._q('[data-wf-dash-stats-column]');
        if (!statsCol) return;
        const dashApi = Context.dashboard;
        const hidden = dashApi && typeof dashApi.readStatsPanelHiddenPref === 'function'
            ? dashApi.readStatsPanelHiddenPref()
            : false;
        const btn = this._ensureStatsToggleButton(statsCol);
        const headerActions = statsCol.querySelector('[data-wf-dash-stats-header-actions]');
        const sliver = statsCol.querySelector('[data-wf-dash-stats-sliver]');
        btn.textContent = hidden ? 'Unhide' : 'Hide';
        btn.title = hidden ? 'Show the ratings panel' : 'Hide the ratings panel';
        const movingToSliver = hidden && sliver && btn.parentElement !== sliver;
        const movingToHeader = !hidden && headerActions && btn.parentElement !== headerActions;
        if ((movingToSliver || movingToHeader) && typeof btn.blur === 'function') {
            btn.blur();
        }
        if (movingToSliver) {
            sliver.appendChild(btn);
        } else if (movingToHeader) {
            headerActions.appendChild(btn);
        }
    },

    _toggleStatsPanelHidden() {
        const dashApi = Context.dashboard;
        if (!dashApi || typeof dashApi.readStatsPanelHiddenPref !== 'function') return;
        const next = !dashApi.readStatsPanelHiddenPref();
        dashApi.writeStatsPanelHiddenPref(next);
        Logger.log('search-output-stats-pane: ratings panel ' + (next ? 'hidden' : 'shown'));
        const root = this._q('[data-wf-dash-split-root][data-wf-dash-split-scope="dashboard"]');
        if (root && typeof dashApi.applyStatsPanelLayout === 'function') {
            dashApi.applyStatsPanelLayout(root);
        } else {
            this._syncStatsPanelCollapseUi();
        }
        if (typeof dashApi.scheduleSplitLayoutSync === 'function') {
            dashApi.scheduleSplitLayoutSync();
        }
        if (!next) {
            this._resetStatsPanelScroll();
            if (this._state.statsPanelDirty) {
                void this._renderStatsPanel();
            }
        }
    },

    _applyStatsPanelLayoutOnOpen(modal) {
        const root = modal && modal.querySelector('[data-wf-dash-split-root][data-wf-dash-split-scope="dashboard"]');
        const dashApi = Context.dashboard;
        if (root && dashApi && typeof dashApi.applyStatsPanelLayout === 'function') {
            dashApi.applyStatsPanelLayout(root);
            this._syncStatsScopeToggleUi();
            if (this._isStatsPanelOpen()) {
                this._resetStatsPanelScroll();
                if (this._state.statsPanelDirty) {
                    void this._renderStatsPanel();
                }
            }
            return;
        }
        this._syncStatsPanelCollapseUi();
        this._syncStatsScopeToggleUi();
        if (this._isStatsPanelOpen()) {
            this._resetStatsPanelScroll();
            if (this._state.statsPanelDirty) {
                void this._renderStatsPanel();
            }
        }
    },

    _ratingSearchScoreTypes(committed) {
        // Score-type visibility is derived from data present on hydrated cards,
        // not from search-type flags — so sessions-only and other search types
        // can still generate ratings for whoever appears in results.
        return { showTwqs: true, showQaqs: true };
    },

    _isPrefetchInProgress(kind) {
        this._ensurePrefetchState();
        const slot = this._getPrefetchSlot(kind);
        if (!slot) return false;
        if (slot.status === 'loading') return true;
        return Boolean(slot.promise) && slot.status !== 'done' && slot.status !== 'error';
    },

    _getRatingsPrefetchWarnings() {
        const labels = {
            openDisputes: 'Open disputes',
            resolvedDisputes: 'Resolved disputes',
            pendingFlags: 'Pending sr-review flags',
            resolvedFlags: 'Resolved sr-review flags'
        };
        const loading = DASH_PREFETCH_KINDS.filter((kind) => this._isPrefetchInProgress(kind));
        if (loading.length === 0) return [];
        const names = loading.map((k) => labels[k] || k).join(', ');
        return ['Dispute/flag prefetch still loading (' + names + ') — scores may update when complete'];
    },

    _getRatingsHydrationWarnings() {
        const items = this._getRatingsScopeItems();
        if (items.length === 0) return [];
        const unhydratedCount = items.filter((item) => item && item.hydrated !== true).length;
        const warnings = [];
        if (unhydratedCount > 0) {
            warnings.push(unhydratedCount + ' of ' + items.length + ' result cards not fully hydrated — ratings use hydrated cards only');
        }
        if (this._state.hydrateFetchActive) {
            warnings.push('Per-card deep hydrate in progress — ratings may update when complete');
        }
        return warnings;
    },

    _getRatingsScopeItems() {
        return this._getStatsScopeItems();
    },

    _ratingsScopeLabel() {
        return this._state.statsUseFiltered !== false ? 'Filtered' : 'All';
    },

    _ratingsSortOptions(committed) {
        return [
            { id: 'confidence-desc', label: 'Confidence high→low' },
            { id: 'twqs-desc',       label: 'TWQS high→low' },
            { id: 'twqs-asc',        label: 'TWQS low→high' },
            { id: 'qaqs-desc',       label: 'QAQS high→low' },
            { id: 'qaqs-asc',        label: 'QAQS low→high' },
            { id: 'name-asc',        label: 'Name A→Z' },
        ];
    },

    _defaultRatingsSortKey(committed) {
        return 'confidence-desc';
    },

    _ratingsBulkWorkerMode(committed) {
        return Boolean(committed && committed.ratingsEveryone) || Boolean(this._state.ratingsFromResults);
    },

    _generateRatingsFromResults() {
        if (!this._state.hasSearched || !this._state.cachedItems || this._state.cachedItems.length === 0) {
            Logger.warn('search-output-stats-pane: generate ratings skipped — no search results');
            return;
        }
        this._state.ratingsFromResults = true;
        this._state.ratingsSortKey = 'confidence-desc';
        const scopeItems = this._getRatingsScopeItems();
        const derivedIds = this._collectRatingWorkerIdsFromItems(scopeItems, this._state.committed || {});
        Logger.log('search-output-stats-pane: ratings generated from results — ' + derivedIds.length + ' worker(s) · '
            + this._ratingsScopeLabel());
        this._renderRatingsPanel({ recompute: true });
    },

    _ratingConfidenceTierRank(tier) {
        if (tier === 'high') return 3;
        if (tier === 'standard') return 2;
        if (tier === 'provisional') return 1;
        return 0;
    },

    // Returns the selected weighting variant ('flat' or 'recency') for a worker card.
    _ratingWorkerWeighting(workerId) {
        const stored = this._state.ratingsWeightingByWorker
            && this._state.ratingsWeightingByWorker[String(workerId || '').trim()];
        return stored === 'flat' ? 'flat' : 'recency';
    },

    // Returns the score block for a given weighting variant (twqs or qaqs).
    // When a cohort blend exists, keep axis detail from the main score but
    // surface the blended score/band.
    _ratingBlockForWeighting(worker, scoreKey) {
        if (!worker || (scoreKey !== 'twqs' && scoreKey !== 'qaqs')) return null;
        const weighting = this._ratingWorkerWeighting(worker.workerId);
        const entry = worker[scoreKey];
        const main = !entry
            ? null
            : (typeof entry === 'object' && ('flat' in entry || 'recency' in entry)
                ? (entry[weighting] || null)
                : entry);
        const cohortEntry = worker.cohort
            && worker.cohort[weighting]
            && worker.cohort[weighting][scoreKey];
        if (!main) return null;
        if (!cohortEntry || cohortEntry.score == null) return main;
        return Object.assign({}, main, {
            score: cohortEntry.score,
            band: cohortEntry.band || main.band,
            tierId: cohortEntry.tierId || main.tierId,
            cohortBlend: cohortEntry,
        });
    },

    _ratingWorkerConfidenceSortValue(worker, scoreTypes) {
        const blocks = this._ratingVisibleScoreBlocks(worker, scoreTypes);
        let bestTier = 0;
        let bestCount = 0;
        for (const block of blocks) {
            const tier = block.confidence && block.confidence.tier;
            const rank = this._ratingConfidenceTierRank(tier);
            const display = block.display || {};
            const count = Math.max(
                Number(display.terminalTaskCount) || 0,
                Number(display.inScopeFeedbackCount) || 0,
                Number(display.trailing90dSubmissions) || 0,
                Number(display.trailing90dFeedbackRows) || 0
            );
            if (rank > bestTier || (rank === bestTier && count > bestCount)) {
                bestTier = rank;
                bestCount = count;
            }
        }
        return bestTier * 100000 + bestCount;
    },

    /** Red (0) → yellow (~0.5) → green (1) tint used by axis bars and tier panels. */
    _ratingRampFillColor(t) {
        if (t == null || !Number.isFinite(Number(t))) return null;
        const x = Math.max(0, Math.min(1, Number(t)));
        let r; let g; let b;
        if (x <= 0.5) {
            const u = x / 0.5;
            r = Math.round(239 + (234 - 239) * u);
            g = Math.round(68 + (179 - 68) * u);
            b = Math.round(68 + (8 - 68) * u);
        } else {
            const u = (x - 0.5) / 0.5;
            r = Math.round(234 + (34 - 234) * u);
            g = Math.round(179 + (197 - 179) * u);
            b = Math.round(8 + (94 - 8) * u);
        }
        return 'rgb(' + r + ', ' + g + ', ' + b + ')';
    },

    /** Legacy helper: map 0–100 value onto the shared ramp (axis bars). */
    _ratingPercentileFillColor(percentile) {
        if (percentile == null || !Number.isFinite(Number(percentile))) return null;
        return this._ratingRampFillColor(Math.max(0, Math.min(100, Number(percentile))) / 100);
    },

    /**
     * Four-stop ramp for population tiers (Poor / Below / Typical / Above+Top).
     * Above average and Top tier share the top green.
     */
    _ratingTierFillColor(tierId) {
        const stops = {
            poor: 0,
            below_average: 1 / 3,
            typical: 2 / 3,
            above_average: 1,
            top_tier: 1,
        };
        if (!tierId || !(tierId in stops)) return null;
        return this._ratingRampFillColor(stops[tierId]);
    },

    _ratingTierPanelStyle(tierId) {
        const fill = this._ratingTierFillColor(tierId);
        if (!fill) {
            return 'margin-top: 10px; padding: 8px 10px; border-radius: 6px;'
                + ' background: color-mix(in srgb, var(--muted-foreground, #64748b) 8%, var(--card, #fff));';
        }
        return 'margin-top: 10px; padding: 8px 10px; border-radius: 6px;'
            + ' background: color-mix(in srgb, ' + fill + ' 22%, var(--card, #fff));'
            + ' border: 1px solid color-mix(in srgb, ' + fill + ' 45%, var(--border, #e2e8f0));';
    },

    _ratingPercentilePanelStyle(percentile) {
        const fill = this._ratingPercentileFillColor(percentile);
        if (!fill) {
            return 'margin-top: 10px; padding: 8px 10px; border-radius: 6px;'
                + ' background: color-mix(in srgb, var(--muted-foreground, #64748b) 8%, var(--card, #fff));';
        }
        return 'margin-top: 10px; padding: 8px 10px; border-radius: 6px;'
            + ' background: color-mix(in srgb, ' + fill + ' 22%, var(--card, #fff));'
            + ' border: 1px solid color-mix(in srgb, ' + fill + ' 45%, var(--border, #e2e8f0));';
    },

    _ensureRatingsSortKey(committed) {
        const options = this._ratingsSortOptions(committed);
        const validIds = new Set(options.map((o) => o.id));
        if (!this._state.ratingsSortKey || !validIds.has(this._state.ratingsSortKey)) {
            this._state.ratingsSortKey = this._defaultRatingsSortKey(committed);
        }
    },

    _ratingVisibleScoreBlocks(worker, scoreTypes) {
        const blocks = [];
        const twqsBlock = this._ratingBlockForWeighting(worker, 'twqs');
        const qaqsBlock = this._ratingBlockForWeighting(worker, 'qaqs');
        if (scoreTypes.showTwqs && twqsBlock) blocks.push(twqsBlock);
        if (scoreTypes.showQaqs && qaqsBlock) blocks.push(qaqsBlock);
        return blocks;
    },

    _ratingWorkerIsProvisionalOnly(worker, scoreTypes) {
        const blocks = this._ratingVisibleScoreBlocks(worker, scoreTypes);
        if (blocks.length === 0) return true;
        return blocks.every((b) => b.confidence && b.confidence.tier === 'provisional');
    },

    _ratingWorkerSortValue(worker, sortKey, scoreTypes) {
        if (sortKey === 'confidence-desc' || sortKey === 'confidence-asc') {
            return this._ratingWorkerConfidenceSortValue(worker, scoreTypes);
        }
        if (sortKey === 'twqs-desc' || sortKey === 'twqs-asc') {
            const block = this._ratingBlockForWeighting(worker, 'twqs');
            const s = block && block.score;
            return Number.isFinite(s) ? s : null;
        }
        if (sortKey === 'qaqs-desc' || sortKey === 'qaqs-asc') {
            const block = this._ratingBlockForWeighting(worker, 'qaqs');
            const s = block && block.score;
            return Number.isFinite(s) ? s : null;
        }
        return null;
    },

    _ratingWorkerSortName(a, b) {
        return String(a.name || a.workerId || '').localeCompare(String(b.name || b.workerId || ''));
    },

    _applyRatingsViewFilters(workers, scoreTypes) {
        let list = [...(workers || [])];
        if (this._state.ratingsHideProvisional) {
            list = list.filter((w) => !this._ratingWorkerIsProvisionalOnly(w, scoreTypes));
        }
        const nameQ = String(this._state.ratingsNameFilter || '').trim().toLowerCase();
        if (nameQ) {
            list = list.filter((w) => {
                const hay = ((w.name || '') + ' ' + (w.email || '')).toLowerCase();
                return hay.includes(nameQ);
            });
        }
        const sortKey = this._state.ratingsSortKey || 'confidence-desc';
        if (sortKey === 'name-asc') {
            list.sort((a, b) => this._ratingWorkerSortName(a, b));
        } else {
            const desc = sortKey.endsWith('-desc');
            list.sort((a, b) => {
                const va = this._ratingWorkerSortValue(a, sortKey, scoreTypes);
                const vb = this._ratingWorkerSortValue(b, sortKey, scoreTypes);
                const aMissing = va == null || !Number.isFinite(va);
                const bMissing = vb == null || !Number.isFinite(vb);
                if (aMissing && bMissing) return this._ratingWorkerSortName(a, b);
                if (aMissing) return 1;
                if (bMissing) return -1;
                const cmp = va < vb ? -1 : va > vb ? 1 : 0;
                if (cmp !== 0) return desc ? -cmp : cmp;
                return this._ratingWorkerSortName(a, b);
            });
        }
        return list;
    },

    _computeRatingsReport(scopeItems, committed) {
        const bulkMode = this._ratingsBulkWorkerMode(committed);
        let effectiveCommitted = committed;
        if (bulkMode) {
            const derivedIds = this._collectRatingWorkerIdsFromItems(scopeItems, committed);
            effectiveCommitted = {
                ...committed,
                authorIds: derivedIds,
                authorCount: derivedIds.length
            };
        }
        const engine = Context.ratingEngine;
        return engine.compute({
            cachedItems: scopeItems,
            committed: effectiveCommitted,
            workerProfiles: this._buildRatingWorkerProfiles(effectiveCommitted.authorIds, scopeItems)
        });
    },

    _ratingsToolbarHtml() {
        const inputStyle = this._inputStyle() + ' font-size: 11px; padding: 4px 8px; min-width: 0;';
        const devExportBtn = Context.isDevBranch
            ? ('<button type="button" data-wf-dash-ratings-export-bulk="json" class="' + this._dashBtnClass('basic', 'nav') + '" style="flex-shrink: 0;">Export JSON</button>')
            : '';
        return '<div id="wf-dash-ratings-toolbar" style="display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;">'
            + '<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">'
            + '<label style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer; white-space: nowrap;">'
            + '<input type="checkbox" data-wf-dash-ratings-hide-provisional="1" style="margin: 0;">'
            + 'Hide provisional</label>'
            + '<label style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; white-space: nowrap;">'
            + 'Sort <select data-wf-dash-ratings-sort="1" style="' + inputStyle + ' cursor: pointer;"></select></label>'
            + '<label style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; flex: 1; min-width: 140px;">'
            + 'Name <input type="text" data-wf-dash-ratings-name-filter="1" placeholder="Filter by name…" autocomplete="off" style="' + inputStyle + ' flex: 1; min-width: 100px;"></label>'
            + devExportBtn
            + '</div>'
            + '<div id="wf-dash-ratings-summary" style="font-size: 11px; color: var(--muted-foreground, #64748b);"></div>'
            + '</div>';
    },

    _syncRatingsToolbarUi(visibleCount, totalCount) {
        const toolbar = this._q('#wf-dash-ratings-toolbar');
        if (!toolbar) return;
        const committed = this._state.committed || {};
        const hasReport = totalCount > 0;
        this._ensureRatingsSortKey(committed);
        const hideCb = toolbar.querySelector('[data-wf-dash-ratings-hide-provisional]');
        if (hideCb) {
            hideCb.checked = Boolean(this._state.ratingsHideProvisional);
            hideCb.disabled = !hasReport;
        }
        const sortSel = toolbar.querySelector('[data-wf-dash-ratings-sort]');
        if (sortSel) {
            const options = this._ratingsSortOptions(committed);
            const current = this._state.ratingsSortKey;
            sortSel.innerHTML = options.map((o) =>
                '<option value="' + dashEscHtml(o.id) + '"' + (o.id === current ? ' selected' : '') + '>' + dashEscHtml(o.label) + '</option>'
            ).join('');
            sortSel.disabled = !hasReport;
        }
        const nameInput = toolbar.querySelector('[data-wf-dash-ratings-name-filter]');
        if (nameInput) {
            if (nameInput !== document.activeElement) {
                nameInput.value = this._state.ratingsNameFilter || '';
            }
            nameInput.disabled = !hasReport;
        }
        const bulkExportBtn = toolbar.querySelector('[data-wf-dash-ratings-export-bulk]');
        if (bulkExportBtn) {
            bulkExportBtn.disabled = !hasReport || visibleCount === 0;
        }
        const summary = this._q('#wf-dash-ratings-summary');
        if (summary) {
            summary.textContent = hasReport
                ? ('Showing ' + visibleCount + ' of ' + totalCount + ' · ' + this._ratingsScopeLabel())
                : '';
        }
        this._syncRatingsGenerateButtonUi();
    },

    _collectRatingWorkerIdsFromItems(cachedItems, committed) {
        // Collect worker IDs from any hydrated card — not gated on search-type flags.
        // This ensures sessions-only (and other non-task/non-QA) searches can still
        // generate ratings for contributors visible in the current results scope.
        const ids = new Set();
        for (const item of cachedItems || []) {
            if (!item || item.hydrated !== true) continue;
            const task = item.task;
            if (!task) continue;
            if (task.author && task.author.id) ids.add(task.author.id);
            for (const entry of task.allFeedback || []) {
                if (entry.reviewer && entry.reviewer.id) ids.add(entry.reviewer.id);
            }
        }
        return [...ids].sort();
    },

    _buildRatingWorkerProfiles(authorIds, scopeItems) {
        const committed = this._state.committed || {};
        const ids = authorIds || committed.authorIds || [];
        const labels = committed.authorLabels || [];
        const tokens = (this._state.draftTokens || []).filter((t) => String(t.id || '') !== '__everyone__');
        const itemSource = scopeItems || this._getRatingsScopeItems() || this._state.cachedItems || [];
        const map = {};
        if (this._ratingsBulkWorkerMode(committed)) {
            const contributors = (this._state.filterListOptions || {}).contributors || [];
            for (const c of contributors) {
                if (c && c.id) {
                    map[c.id] = {
                        name: c.name || c.label || c.id,
                        email: c.email || ''
                    };
                }
            }
            for (const item of itemSource) {
                if (!item || item.hydrated !== true) continue;
                const task = item.task;
                if (!task) continue;
                if (task.author && task.author.id && !map[task.author.id]) {
                    map[task.author.id] = {
                        name: String(task.author.name || '').trim() || task.author.id,
                        email: String(task.author.email || '').trim()
                    };
                }
                for (const entry of task.allFeedback || []) {
                    const reviewer = entry.reviewer;
                    if (reviewer && reviewer.id && !map[reviewer.id]) {
                        map[reviewer.id] = {
                            name: String(reviewer.name || '').trim() || reviewer.id,
                            email: String(reviewer.email || '').trim()
                        };
                    }
                }
            }
        }
        ids.forEach((id, i) => {
            if (map[id]) return;
            const tok = tokens.find((t) => t.id === id);
            map[id] = {
                name: (tok && (tok.full_name || tok.name || tok.label)) || labels[i] || id,
                email: (tok && tok.email) || ''
            };
        });
        return map;
    },

    _ratingsAboutAxisTableHtml(title, rows) {
        const th = 'padding: 4px 6px; text-align: left; font-weight: 600; border-bottom: 1px solid var(--border, #e2e8f0);';
        const td = 'padding: 4px 6px; vertical-align: top; border-bottom: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 60%, transparent);';
        let body = '';
        for (const row of rows) {
            body += '<tr>'
                + '<td style="' + td + '">' + dashEscHtml(row.label) + '</td>'
                + '<td style="' + td + ' white-space: nowrap;">' + dashEscHtml(row.weight) + '</td>'
                + '<td style="' + td + '">' + dashEscHtml(row.measures) + '</td>'
                + '</tr>';
        }
        return '<div style="margin-top: 10px;">'
            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">' + dashEscHtml(title) + '</div>'
            + '<table style="width: 100%; border-collapse: collapse; font-size: 10px; line-height: 1.35;">'
            + '<thead><tr>'
            + '<th style="' + th + '">Axis</th>'
            + '<th style="' + th + '">Weight</th>'
            + '<th style="' + th + '">Measures</th>'
            + '</tr></thead>'
            + '<tbody>' + body + '</tbody>'
            + '</table>'
            + '</div>';
    },

    _ratingsAboutSectionHtml() {
        const box = this._panelBoxStyle();
        const muted = 'color: var(--muted-foreground, #64748b);';
        const twqsRows = [
            { label: 'Outcome Quality',        weight: '40%', measures: 'Blend of current terminal quality and flat closure quality: production 1.0, discarded 0.5, dismissed 0.0. Closure excludes bugged/flagged paths.' },
            { label: 'Positive Feedback Rate', weight: '20%', measures: 'Share of human feedback on their tasks that was positive (upvote or score ≥ Satisfactory).' },
            { label: 'Non-Bottom Score Rate',  weight: '15%', measures: 'Share of explicitly scored feedback that was not the lowest possible rating.' },
            { label: 'First-Pass Acceptance',  weight: '15%', measures: 'Share of tasks accepted by the first human reviewer without a prior return.' },
            { label: 'Dispute Loss Avoidance', weight: '10%', measures: 'Resolved dispute losses only. No disputes and dispute wins are neutral; only rejected writer disputes reduce the score.' },
        ];
        const qaqsRows = [
            { label: 'Return Effectiveness',  weight: '30%', measures: 'When they return a task it reaches production on the next attempt rather than being returned again.' },
            { label: 'Return Actionability',  weight: '25%', measures: 'The task author responds positively to their return (next human feedback is positive).' },
            { label: 'Label Discrimination',  weight: '25%', measures: 'How well their explicit score labels (e.g. Excellent / Unsatisfactory) differentiate task quality.' },
            { label: 'Dispute Loss Avoidance',weight: '20%', measures: 'For sole-negative reviews, only disputes approved for the writer reduce the score. QA wins are neutral.' },
        ];
        const td = 'padding: 4px 6px; border-bottom: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 60%, transparent);';
        return '<details id="wf-dash-ratings-about" style="' + box + ' padding: 10px 12px; flex-shrink: 0;">'
            + '<summary style="font-size: 11px; line-height: 1.45; cursor: pointer; list-style: none; user-select: none; ' + muted + '">'
            + '<strong style="color: var(--foreground, #0f172a);">About these ratings</strong>'
            + ' — how the scores are built and what they include.'
            + '</summary>'
            + '<div style="margin-top: 10px; font-size: 11px; line-height: 1.45; color: var(--foreground, #0f172a);">'
            + '<p style="margin: 0 0 8px;">Up to two scores per contributor, each on a <strong>0–100</strong> scale:</p>'
            + '<ul style="margin: 0 0 10px 18px; padding: 0;">'
            + '<li><strong>Task Writer Quality Score (TWQS)</strong> — quality of the work they <strong>authored</strong>. Based on the WPS v1.2 model.</li>'
            + '<li><strong>QA Quality Score (QAQS)</strong> — quality of the reviews they <strong>performed</strong>. Based on the QPS v2.1 model.</li>'
            + '</ul>'

            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">Dual weighting — Recency vs Flat</div>'
            + '<p style="margin: 0 0 8px;">Each card computes <strong>two variants</strong> of every score simultaneously. Toggle between them per card:</p>'
            + '<ul style="margin: 0 0 10px 18px; padding: 0;">'
            + '<li><strong>Recency (default)</strong> — applies half-life decay exp(−ln(2)·age/30) to activity inside the window, so recent events weigh more. Matches the <code>--recency 30</code> local ranker run.</li>'
            + '<li><strong>Flat</strong> — all in-scope events count equally. Matches the baseline (no-recency) local ranker run.</li>'
            + '</ul>'
            + '<p style="margin: 0 0 8px;">JSON export always includes <strong>both</strong> weighting variants. The card toggle only changes what is displayed.</p>'

            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">Population tier</div>'
            + '<p style="margin: 0 0 10px;">The <strong>primary display</strong> is a <em>population tier</em> label (Poor, Below average, Typical, Above average, Top tier), with the raw 0–100 score shown muted beside it. Tiers use empirical cutoffs from the current dive.db scored population (~10% / 20% / 40% / 20% / remainder): scores below p10 are Poor; p10–p30 Below average; p30–p70 Typical; p70 up to the top peg Above average; at/above the top peg Top tier. Top pegs are absolute: <strong>TWQS ≥ 80</strong>, <strong>QAQS ≥ 70</strong>. Panel color follows the tier on a four-stop red→yellow→green ramp (Above average and Top tier share the top green). Estimated percentiles remain available in exports only — they are not shown on cards.</p>'

            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">How to read a score</div>'
            + '<ul style="margin: 0 0 10px 18px; padding: 0;">'
            + '<li><strong>Tier first, raw second.</strong> Raw scores use a 0–100 scale with empirical Bayes shrinkage to pull low-volume contributors toward the cohort prior. Low-volume scores are valid estimates, but less certain. The tier places that score in the current dive.db population.</li>'
            + '<li>Each score rolls up several <strong>weighted axes</strong>, shown highest-weight first. Where cohort baselines are supplied, the final score is 50% main score plus team, environment, and month channels; provisional channels contribute half weight and transfer the remainder to main. Click a score panel to expand that score&rsquo;s team / environment / month breakdown.</li>'
            + '<li>Every score carries a <strong>confidence</strong> badge — TWQS based on terminal task count, QAQS based on feedback row count.</li>'
            + '</ul>'
            + '<table style="width: 100%; border-collapse: collapse; font-size: 10px; line-height: 1.35; margin-bottom: 10px;">'
            + '<thead><tr>'
            + '<th style="padding: 4px 6px; text-align: left; font-weight: 600; border-bottom: 1px solid var(--border, #e2e8f0);">Confidence</th>'
            + '<th style="padding: 4px 6px; text-align: left; font-weight: 600; border-bottom: 1px solid var(--border, #e2e8f0);">TWQS: terminal tasks in scope</th>'
            + '<th style="padding: 4px 6px; text-align: left; font-weight: 600; border-bottom: 1px solid var(--border, #e2e8f0);">QAQS: feedback rows in scope</th>'
            + '</tr></thead>'
            + '<tbody>'
            + '<tr><td style="' + td + '">Provisional</td><td style="' + td + '">&lt; 10</td><td style="' + td + '">&lt; 25</td></tr>'
            + '<tr><td style="' + td + '">Standard</td><td style="' + td + '">10 – 49</td><td style="' + td + '">25 – 99</td></tr>'
            + '<tr><td style="padding: 4px 6px;">High confidence</td><td style="padding: 4px 6px;">≥ 50</td><td style="padding: 4px 6px;">≥ 100</td></tr>'
            + '</tbody></table>'

            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">What counts toward a score</div>'
            + '<ul style="margin: 0 0 10px 18px; padding: 0;">'
            + '<li>Scores cover the <strong>committed search window</strong> and <strong>hydrated result cards only</strong>, regardless of which search toggles (tasks, QA, sessions, disputes, etc.) produced those results.</li>'
            + '<li>The <strong>Filtered / All</strong> scope toggle applies: Filtered respects sidebar filters; All uses every card in the current results tab.</li>'
            + '<li>With no date range, all history is eligible. With After/Before set, only events inside that window count — Recency applies within the window; Flat treats them equally.</li>'
            + '<li>Outcome Quality blends the current terminal calculation with a flat closure sub-score over production, discarded, and dismissed. The closure sub-score ignores bugged/flagged paths and has no recency decay. Disputes move a score only once <strong>resolved</strong>.</li>'
            + '<li>Self-reviews are excluded from all feedback axes.</li>'
            + '</ul>'

            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">The axes</div>'
            + this._ratingsAboutAxisTableHtml('Task Writer Quality Score (TWQS)', twqsRows)
            + this._ratingsAboutAxisTableHtml('QA Quality Score (QAQS)', qaqsRows)
            + '</div>'
            + '</details>';
    },

    _ratingScoreBasisLine(block, basisKind) {
        const display = block && block.display;
        if (!display) return '';
        let count = null;
        let singular = '';
        let plural = '';
        if (basisKind === 'tasks') {
            count = display.terminalTaskCount != null ? display.terminalTaskCount : display.submissionCount;
            singular = 'terminal task';
            plural = 'terminal tasks';
        } else if (basisKind === 'feedbacks') {
            count = display.inScopeFeedbackCount != null ? display.inScopeFeedbackCount : display.feedbackRowCount;
            singular = 'feedback row';
            plural = 'feedback rows';
        }
        if (count == null || !Number.isFinite(count)) return '';
        const label = count === 1 ? singular : plural;
        return 'Based on ' + count + ' ' + label;
    },

    _ensureRatingsExpandedScores() {
        if (!this._state.ratingsExpandedScores) {
            this._state.ratingsExpandedScores = new Set();
        }
        return this._state.ratingsExpandedScores;
    },

    _ratingScoreExpandKey(workerId, scoreKind) {
        return String(workerId || '').trim() + '\u001f' + String(scoreKind || '').trim();
    },

    _ensureRatingsCohortSliceExpanded() {
        if (!this._state.ratingsCohortSliceExpanded) {
            this._state.ratingsCohortSliceExpanded = new Set();
        }
        return this._state.ratingsCohortSliceExpanded;
    },

    _ratingCohortSliceExpandKey(workerId, scoreKind, dimension, sliceKey) {
        return [
            String(workerId || '').trim(),
            String(scoreKind || '').trim(),
            String(dimension || '').trim(),
            String(sliceKey || '').trim(),
        ].join('\u001f');
    },

    _isRatingCohortSliceExpanded(workerId, scoreKind, dimension, sliceKey) {
        return this._ensureRatingsCohortSliceExpanded().has(
            this._ratingCohortSliceExpandKey(workerId, scoreKind, dimension, sliceKey)
        );
    },

    _isRatingScoreExpanded(workerId, scoreKind) {
        return this._ensureRatingsExpandedScores().has(
            this._ratingScoreExpandKey(workerId, scoreKind)
        );
    },

    _ratingPctOneDecimal(fraction) {
        if (fraction == null || !Number.isFinite(fraction)) return null;
        return Math.round(fraction * 1000) / 10;
    },

    _ratingSortedAxes(block) {
        return [...((block && block.axes) || [])].sort((a, b) => {
            const wDiff = (b.baseWeight || 0) - (a.baseWeight || 0);
            if (wDiff !== 0) return wDiff;
            return String(a.label || '').localeCompare(String(b.label || ''));
        });
    },

    _ratingAxisOmitReason(axis) {
        if (!axis || axis.defined !== false) return null;
        switch (axis.id) {
            // TWQS (WPS) axes
            case 'outcomeQuality':
                return 'No terminal tasks in scope';
            case 'positiveFeedbackRate':
                return 'No human feedback on authored tasks in scope';
            case 'nonBottomScoreRate':
                return 'No explicitly scored feedback in scope';
            case 'firstPassAcceptance':
                return 'No authored tasks with human feedback in scope';
            case 'disputeWinRate':
                return 'No resolved disputes in scope';
            // QAQS (QPS) axes
            case 'returnEffectiveness':
                return 'No terminal tasks returned by this reviewer in scope';
            case 'returnActionability':
                return 'No return feedback episodes in scope';
            case 'labelDiscrimination':
                return 'No explicit score labels by this reviewer in scope';
            case 'disputeDefense':
                return 'No resolved sole-negative-reviewer disputes in scope';
            // Legacy / fallback
            case 'feedbackResolution':
                return 'No return episodes by this QA in scope';
            case 'reviewCallAccuracy':
            case 'disputeOutcomes':
                return 'No resolved disputes in scope';
            case 'consistency':
                return 'Fewer than 2 active calendar weeks of activity in scope';
            default:
                return 'Axis omitted';
        }
    },

    _ratingFormatStatusCounts(statusCounts, maxItems) {
        if (!statusCounts || typeof statusCounts !== 'object') return '';
        const cap = maxItems == null ? 4 : maxItems;
        const entries = Object.entries(statusCounts)
            .filter(([, n]) => Number(n) > 0)
            .sort((a, b) => b[1] - a[1]);
        if (!entries.length) return '';
        const shown = entries.slice(0, cap).map(([k, n]) => k + ' ' + n);
        const rest = entries.length - cap;
        return shown.join(', ') + (rest > 0 ? ', +' + rest + ' more' : '');
    },

    _ratingAxisBreakdownLines(axis) {
        if (!axis) return [];
        if (axis.defined === false || axis.score == null) {
            const reason = this._ratingAxisOmitReason(axis);
            return reason ? [reason] : ['Axis omitted'];
        }
        const raw = axis.raw || {};
        const lines = [];
        switch (axis.id) {
            // TWQS (WPS) axes
            case 'outcomeQuality': {
                if (raw.nTerminal != null) lines.push(raw.nTerminal + ' terminal task(s)');
                if (raw.sumQuality != null && raw.nTerminal != null && raw.nTerminal > 0) {
                    const meanPct = this._ratingPctOneDecimal(raw.sumQuality / raw.nTerminal);
                    if (meanPct != null) lines.push('Mean quality ' + meanPct + '%');
                }
                const statusSummary = this._ratingFormatStatusCounts(raw.statusCounts);
                if (statusSummary) lines.push(statusSummary);
                break;
            }
            case 'positiveFeedbackRate': {
                if (raw.positive != null && raw.total != null && raw.total > 0) {
                    const positivePct = this._ratingPctOneDecimal(raw.positive / raw.total);
                    lines.push('Positive ' + (positivePct != null ? positivePct + '%' : '') + ' (' + Math.round(raw.positive * 10) / 10 + ' / ' + Math.round(raw.total * 10) / 10 + ')');
                }
                break;
            }
            case 'nonBottomScoreRate': {
                if (raw.nonBottom != null && raw.total != null && raw.total > 0) {
                    const nbPct = this._ratingPctOneDecimal(raw.nonBottom / raw.total);
                    lines.push('Non-bottom ' + (nbPct != null ? nbPct + '%' : '') + ' (' + Math.round(raw.nonBottom * 10) / 10 + ' / ' + Math.round(raw.total * 10) / 10 + ')');
                }
                break;
            }
            case 'firstPassAcceptance': {
                if (raw.firstPass != null && raw.total != null && raw.total > 0) {
                    const fpPct = this._ratingPctOneDecimal(raw.firstPass / raw.total);
                    lines.push('First-pass ' + (fpPct != null ? fpPct + '%' : '') + ' (' + Math.round(raw.firstPass * 10) / 10 + ' / ' + Math.round(raw.total * 10) / 10 + ')');
                }
                break;
            }
            case 'disputeWinRate': {
                if (raw.approved != null && raw.resolved != null && raw.resolved > 0) {
                    const winPct = this._ratingPctOneDecimal(raw.approved / raw.resolved);
                    lines.push('Won ' + (winPct != null ? winPct + '%' : '') + ' (' + raw.approved + ' / ' + raw.resolved + ' resolved)');
                } else if (raw.resolved != null) {
                    lines.push(raw.resolved + ' resolved dispute(s)');
                }
                break;
            }
            // QAQS (QPS) axes
            case 'returnEffectiveness': {
                if (raw.effective != null && raw.total != null && raw.total > 0) {
                    const effPct = this._ratingPctOneDecimal(raw.effective / raw.total);
                    lines.push('Effective ' + (effPct != null ? effPct + '%' : '') + ' (' + Math.round(raw.effective * 10) / 10 + ' / ' + Math.round(raw.total * 10) / 10 + ')');
                }
                break;
            }
            case 'returnActionability': {
                if (raw.actionable != null && raw.total != null && raw.total > 0) {
                    const aPct = this._ratingPctOneDecimal(raw.actionable / raw.total);
                    lines.push('Actionable ' + (aPct != null ? aPct + '%' : '') + ' (' + Math.round(raw.actionable * 10) / 10 + ' / ' + Math.round(raw.total * 10) / 10 + ')');
                }
                break;
            }
            case 'labelDiscrimination': {
                if (raw.labelCorrelation != null) {
                    const ldPct = this._ratingPctOneDecimal(raw.labelCorrelation);
                    if (ldPct != null) lines.push('Label–outcome correlation ' + ldPct + '%');
                }
                if (raw.total != null) lines.push(raw.total + ' labeled feedback row(s)');
                break;
            }
            case 'disputeDefense': {
                if (raw.upheld != null && raw.resolved != null && raw.resolved > 0) {
                    const defPct = this._ratingPctOneDecimal(raw.upheld / raw.resolved);
                    lines.push('Upheld ' + (defPct != null ? defPct + '%' : '') + ' (' + raw.upheld + ' / ' + raw.resolved + ' as sole negative reviewer)');
                }
                break;
            }
            // Legacy axes (backwards compat)
            case 'disputeOutcomes':
            case 'reviewCallAccuracy': {
                const good = raw.approvedWeight != null ? raw.approvedWeight : raw.upheldWeight;
                const denom = raw.resolvedWeight;
                if (good != null && denom != null && denom > 0) {
                    const goodPct = this._ratingPctOneDecimal(good / denom);
                    lines.push('Favorable ' + (goodPct != null ? goodPct + '%' : good) + ' of resolved weight');
                } else if (denom != null) {
                    lines.push('Resolved dispute weight ' + Math.round(denom * 10) / 10);
                }
                break;
            }
            case 'feedbackResolution': {
                if (raw.returnEpisodeCount != null) lines.push(raw.returnEpisodeCount + ' return episode(s)');
                break;
            }
            case 'consistency': {
                if (raw.activeWeeks != null && raw.totalWeeks != null) {
                    lines.push(raw.activeWeeks + ' active week(s) of ' + raw.totalWeeks);
                }
                break;
            }
            default:
                break;
        }
        return lines;
    },

    _ratingAxisBarHtml(axis, showDetail) {
        if (!axis) return '';
        const omitted = axis.defined === false || axis.score == null;
        const label = axis.label || axis.id || '';
        if (omitted) {
            const reason = this._ratingAxisOmitReason(axis) || 'omitted';
            return '<div style="margin-top: 6px;">'
                + '<div style="font-size: 10px; color: var(--muted-foreground, #64748b);">'
                + dashEscHtml(label) + ' — ' + dashEscHtml(reason)
                + '</div></div>';
        }
        const subPct = this._ratingPctOneDecimal(axis.score);
        const fillPct = Math.max(0, Math.min(100, subPct != null ? subPct : 0));
        const barFill = this._ratingPercentileFillColor(fillPct) || 'var(--brand, #3b82f6)';
        const trackStyle = 'flex: 1; min-width: 48px; height: 6px; border-radius: 3px;'
            + ' background: color-mix(in srgb, var(--muted-foreground, #64748b) 22%, transparent); overflow: hidden;';
        const fillStyle = 'height: 100%; width: ' + fillPct + '%; border-radius: 3px;'
            + ' background: color-mix(in srgb, ' + barFill + ' 78%, transparent);';
        let html = '<div style="margin-top: 6px;">'
            + '<div style="display: flex; align-items: center; gap: 8px; font-size: 10px;">'
            + '<span style="flex: 0 0 34%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">'
            + dashEscHtml(label) + '</span>'
            + '<div style="' + trackStyle + '"><div style="' + fillStyle + '"></div></div>'
            + '<span style="flex: 0 0 36px; text-align: right; font-variant-numeric: tabular-nums;">'
            + dashEscHtml(String(subPct) + '%') + '</span>'
            + '</div>';
        if (showDetail) {
            const breakdownLines = this._ratingAxisBreakdownLines(axis);
            html += breakdownLines.map((line) =>
                '<div style="font-size: 10px; color: var(--muted-foreground, #64748b); margin-top: 2px; padding-left: 2px;">'
                + dashEscHtml(line) + '</div>'
            ).join('');
        }
        html += '</div>';
        return html;
    },

    _ratingFormatPercentile(n) {
        const engine = Context.ratingEngine;
        if (engine && typeof engine.formatPercentile === 'function') {
            return engine.formatPercentile(n);
        }
        if (n == null || !Number.isFinite(Number(n))) return '';
        const v = Math.round(Number(n));
        const mod100 = Math.abs(v) % 100;
        let suffix = 'th';
        if (mod100 < 11 || mod100 > 13) {
            const mod10 = Math.abs(v) % 10;
            if (mod10 === 1) suffix = 'st';
            else if (mod10 === 2) suffix = 'nd';
            else if (mod10 === 3) suffix = 'rd';
        }
        return String(v) + suffix;
    },

    _ratingScoreBlockCompactHtml(title, block, basisKind, opts) {
        if (!block || block.score == null) {
            return '';
        }
        const options = opts || {};
        const workerId = String(options.workerId || '').trim();
        const scoreKind = String(options.scoreKind || '').trim();
        const expanded = !!(workerId && scoreKind && this._isRatingScoreExpanded(workerId, scoreKind));
        const conf = block.confidence || {};
        const confStyle = conf.tier === 'provisional'
            ? 'border: 1px dashed var(--muted-foreground, #64748b);'
            : (conf.tier === 'high' ? 'font-weight: 700;' : '');
        const scoreDisplay = Math.round(block.score);
        const tierLabel = String(block.band || '').trim();
        const tierId = block.tierId || null;
        const hasTier = !!(tierLabel && tierLabel !== '—');
        const primaryHtml = hasTier
            ? dashEscHtml(tierLabel)
            : dashEscHtml(String(scoreDisplay));
        const secondaryHtml = hasTier
            ? (' <span style="font-size: 12px; font-weight: 500; color: var(--muted-foreground, #64748b);">'
                + dashEscHtml(String(scoreDisplay)) + ' / 100</span>')
            : (' <span style="font-size: 12px; font-weight: 500; color: var(--muted-foreground, #64748b);">/ 100</span>');
        const basisLine = this._ratingScoreBasisLine(block, basisKind);
        const cohortBlend = block.cohortBlend || null;
        const canExpand = !!(workerId && scoreKind && (cohortBlend || this._ratingSortedAxes(block).length));
        let bodyHtml = '';
        if (expanded) {
            // Top-level: overall weighted axis bars (main blend or raw score axes).
            const mainAxes = (cohortBlend && cohortBlend.main && cohortBlend.main.axes)
                ? cohortBlend.main.axes
                : this._ratingSortedAxes(block);
            const mainAxesHtml = this._ratingSortedAxes({ axes: mainAxes })
                .map((axis) => this._ratingAxisBarHtml(axis, true))
                .join('');
            const topBars = mainAxesHtml
                ? ('<div style="margin-top: 8px;">' + mainAxesHtml + '</div>')
                : '';
            // Below: per team / env / month (or non-cohort weight table).
            const detailHtml = this._ratingScoreBlockDetailHtml(title, block, cohortBlend, workerId, scoreKind, {
                nestInScoreCard: true,
                omitMainAxes: true,
            });
            bodyHtml = topBars + detailHtml;
        } else if (!cohortBlend) {
            // Non-cohort: keep sub-axis bars visible even when collapsed.
            const axesHtml = this._ratingSortedAxes(block)
                .map((axis) => this._ratingAxisBarHtml(axis, false))
                .join('');
            if (axesHtml) bodyHtml = '<div style="margin-top: 4px;">' + axesHtml + '</div>';
        }
        const chevron = canExpand
            ? ('<span style="display: inline-block; width: 10px; color: var(--muted-foreground, #64748b); transform: rotate('
                + (expanded ? '90deg' : '0deg') + '); transition: transform 120ms ease;">▸</span> ')
            : '';
        const headerAttrs = canExpand
            ? (' role="button" tabindex="0" aria-expanded="' + (expanded ? 'true' : 'false') + '"'
                + ' data-wf-dash-rating-score-expand="1"'
                + ' data-wf-dash-rating-worker="' + dashEscHtml(workerId) + '"'
                + ' data-wf-dash-rating-score-kind="' + dashEscHtml(scoreKind) + '"'
                + ' style="cursor: pointer; user-select: none;"')
            : '';
        return '<div style="' + this._ratingTierPanelStyle(tierId) + '">'
            + '<div' + headerAttrs + '>'
            + '<div style="font-size: 12px; font-weight: 600; margin-bottom: 4px;">'
            + chevron + dashEscHtml(title) + '</div>'
            + '<div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">'
            + '<div style="font-size: 20px; font-weight: 700; line-height: 1.2;">' + primaryHtml + secondaryHtml + '</div>'
            + '<div style="font-size: 10px; flex-shrink: 0; padding: 2px 6px; border-radius: 4px; ' + confStyle + '">' + dashEscHtml(conf.label || '') + '</div>'
            + '</div>'
            + (basisLine
                ? ('<div style="font-size: 10px; color: var(--muted-foreground, #64748b); margin-top: 6px;">' + dashEscHtml(basisLine) + '</div>')
                : '')
            + '</div>'
            + bodyHtml
            + '</div>';
    },

    _ratingCohortSectionHtml(opts) {
        const o = opts || {};
        const title = o.title || '';
        const scoreDisplay = o.scoreDisplay;
        const weightOrMeta = o.weightOrMeta || '';
        const meta = o.meta || '';
        const axes = o.axes || [];
        const expanded = !!o.expanded;
        const workerId = String(o.workerId || '').trim();
        const scoreKind = String(o.scoreKind || '').trim();
        const dimension = String(o.dimension || '').trim();
        const sliceKey = String(o.sliceKey || '').trim();
        const canExpand = !!(workerId && scoreKind && dimension && sliceKey && axes.length);
        const axesList = [...axes].sort((a, b) => (b.baseWeight || 0) - (a.baseWeight || 0));
        const axesHtml = (expanded && axesList.length)
            ? ('<div style="margin-top: 6px; padding-left: 12px; border-left: 2px solid color-mix(in srgb, var(--border, #e2e8f0) 70%, transparent);">'
                + axesList.map((axis) => this._ratingAxisBarHtml(axis, true)).join('')
                + '</div>')
            : '';
        const chevron = canExpand
            ? ('<span style="display: inline-block; width: 10px; color: var(--muted-foreground, #64748b); transform: rotate('
                + (expanded ? '90deg' : '0deg') + '); transition: transform 120ms ease;">▸</span> ')
            : '';
        const headerAttrs = canExpand
            ? (' role="button" tabindex="0" aria-expanded="' + (expanded ? 'true' : 'false') + '"'
                + ' data-wf-dash-rating-cohort-slice="1"'
                + ' data-wf-dash-rating-worker="' + dashEscHtml(workerId) + '"'
                + ' data-wf-dash-rating-score-kind="' + dashEscHtml(scoreKind) + '"'
                + ' data-wf-dash-rating-cohort-dim="' + dashEscHtml(dimension) + '"'
                + ' data-wf-dash-rating-cohort-key="' + dashEscHtml(sliceKey) + '"'
                + ' style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; cursor: pointer; user-select: none;"')
            : ' style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;"';
        return '<div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 55%, transparent);">'
            + '<div' + headerAttrs + '>'
            + '<div style="font-size: 11px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis;">'
            + chevron + dashEscHtml(title) + '</div>'
            + '<div style="font-size: 10px; flex-shrink: 0; font-variant-numeric: tabular-nums; color: var(--muted-foreground, #64748b);">'
            + (scoreDisplay != null ? dashEscHtml(String(scoreDisplay)) : '—')
            + (weightOrMeta ? ' · ' + dashEscHtml(String(weightOrMeta)) : '')
            + '</div>'
            + '</div>'
            + (meta
                ? ('<div style="font-size: 9px; color: var(--muted-foreground, #64748b); margin-top: 2px;'
                    + (canExpand ? ' padding-left: 14px;' : '') + '">'
                    + dashEscHtml(meta) + '</div>')
                : '')
            + axesHtml
            + '</div>';
    },

    _ratingCohortBreakdownHtml(title, blend, workerId, scoreKind, opts) {
        if (!blend || !blend.main || blend.main.score == null) return '';
        const nestInScoreCard = !!(opts && opts.nestInScoreCard);
        let sectionsHtml = '';
        // Main is the card headline / overall score — only render per-team / env / month slices.

        const dimMeta = [
            { id: 'team', label: 'Team' },
            { id: 'env', label: 'Environment' },
            { id: 'month', label: 'Month' },
        ];
        for (const dim of dimMeta) {
            const channel = blend.channels && blend.channels[dim.id];
            const slices = (channel && Array.isArray(channel.slices)) ? channel.slices : [];
            if (!slices.length) continue;
            sectionsHtml += '<div style="margin-top: 12px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; color: var(--muted-foreground, #64748b); text-transform: uppercase;">'
                + dashEscHtml(dim.label) + '</div>';
            for (const slice of slices) {
                if (!slice || slice.score == null) continue;
                const key = String(slice.key || '—');
                const weighting = this._ratingWorkerWeighting(workerId);
                const engine = Context.ratingEngine;
                let scoreDisplay = Math.round(slice.score * 10) / 10;
                if (engine && typeof engine.populationTier === 'function') {
                    const tier = engine.populationTier(slice.score, scoreKind, weighting);
                    if (tier && tier.label && tier.label !== '—') scoreDisplay = tier.label;
                }
                const vol = (slice.volume != null && Number.isFinite(slice.volume) && slice.volume > 0)
                    ? (Math.round(slice.volume * 10) / 10) + ' vol'
                    : '';
                sectionsHtml += this._ratingCohortSectionHtml({
                    title: key,
                    scoreDisplay,
                    weightOrMeta: vol,
                    axes: slice.axes,
                    expanded: this._isRatingCohortSliceExpanded(workerId, scoreKind, dim.id, key),
                    workerId,
                    scoreKind,
                    dimension: dim.id,
                    sliceKey: key,
                });
            }
        }
        if (!sectionsHtml) return '';
        if (nestInScoreCard) {
            return '<div style="margin-top: 8px;">' + sectionsHtml + '</div>';
        }
        return '<div style="margin-top: 12px;">'
            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 2px;">'
            + dashEscHtml(title) + ' · by team / env / month</div>'
            + sectionsHtml
            + '</div>';
    },

    _ratingScoreBlockDetailHtml(title, block, cohortBlend, workerId, scoreKind, opts) {
        const nestInScoreCard = !!(opts && opts.nestInScoreCard);
        const blend = cohortBlend || (block && block.cohortBlend) || null;
        if (blend) {
            return this._ratingCohortBreakdownHtml(title, blend, workerId, scoreKind, opts);
        }
        // Nested score cards already render overall axis bars above; skip the weight table.
        if (nestInScoreCard && opts && opts.omitMainAxes) {
            return '';
        }
        if (!block || block.score == null) {
            return '';
        }
        const sortedAxes = this._ratingSortedAxes(block);
        const thStyle = 'padding: 4px 6px; text-align: left; font-weight: 600; border-bottom: 1px solid var(--border, #e2e8f0);';
        const tdStyle = 'padding: 4px 6px; vertical-align: top; border-bottom: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 50%, transparent);';
        const tdNum = tdStyle + ' text-align: right; white-space: nowrap;';
        let rowsHtml = '';
        const compositeTerms = [];
        let compositeSum = 0;
        for (const axis of sortedAxes) {
            const omitted = axis.defined === false || axis.score == null;
            if (omitted) continue;
            const subPct = this._ratingPctOneDecimal(axis.score);
            const basePct = this._ratingPctOneDecimal(axis.baseWeight);
            const effPct = this._ratingPctOneDecimal(axis.effectiveWeight);
            if (subPct != null && effPct != null) {
                compositeTerms.push(subPct + '×' + effPct + '%');
                compositeSum += (axis.score || 0) * (axis.effectiveWeight || 0);
            }
            const effDisplay = String(effPct) + '%'
                + (basePct != null && effPct != null && Math.abs(effPct - basePct) >= 0.05
                    ? ' <span style="color: var(--muted-foreground, #64748b);">(base ' + basePct + '%)</span>'
                    : '');
            const axisCellHtml = this._ratingAxisBarHtml(axis, true);
            rowsHtml += '<tr>'
                + '<td style="' + tdStyle + '">' + axisCellHtml + '</td>'
                + '<td style="' + tdNum + '">' + dashEscHtml(String(subPct) + '%') + '</td>'
                + '<td style="' + tdNum + '">' + (basePct != null ? dashEscHtml(String(basePct) + '%') : '—') + '</td>'
                + '<td style="' + tdNum + '">' + effDisplay + '</td>'
                + '</tr>';
        }
        const compositeRounded = Math.round(compositeSum * 1000) / 10;
        const compositeLine = compositeTerms.length
            ? (dashEscHtml(String(compositeRounded)) + ' ≈ ' + dashEscHtml(compositeTerms.join(' + ')))
            : '';
        const display = block.display || {};
        let contextLine = '';
        if (display.terminalTaskCount != null) {
            contextLine = display.terminalTaskCount + ' terminal task(s)';
        } else if (display.inScopeFeedbackCount != null) {
            contextLine = display.inScopeFeedbackCount + ' feedback row(s)';
        } else if (display.trailing90dSubmissions != null) {
            contextLine = 'Trailing 90d: ' + display.trailing90dSubmissions + ' submission(s)';
        } else if (display.trailing90dFeedbackRows != null) {
            contextLine = 'Trailing 90d: ' + display.trailing90dFeedbackRows + ' feedback row(s)';
        }
        if (display.tenureDays != null && Number.isFinite(display.tenureDays)) {
            contextLine = (contextLine ? contextLine + ' · ' : '') + 'Tenure ' + display.tenureDays + ' day(s)';
        }
        const pct = block.estimatedPercentile;
        // Prefer tier label context; keep muted raw score note when expanding.
        if (block.band && block.band !== '—') {
            contextLine = (contextLine ? contextLine + ' · ' : '')
                + block.band + ' · ' + Math.round(block.score) + ' / 100';
        } else if (pct != null) {
            contextLine = (contextLine ? contextLine + ' · ' : '')
                + 'raw ' + Math.round(block.score) + ' / 100';
        }
        return '<div style="margin-top: ' + (nestInScoreCard ? '8' : '12') + 'px;">'
            + (nestInScoreCard
                ? ''
                : ('<div style="font-size: 11px; font-weight: 600; margin-bottom: 6px;">' + dashEscHtml(title) + ' breakdown</div>'))
            + '<table style="width: 100%; border-collapse: collapse; font-size: 10px;">'
            + '<thead><tr>'
            + '<th style="' + thStyle + '">Axis</th>'
            + '<th style="' + thStyle + ' text-align: right;">Sub-score</th>'
            + '<th style="' + thStyle + ' text-align: right;">Base wt</th>'
            + '<th style="' + thStyle + ' text-align: right;">Effective wt</th>'
            + '</tr></thead>'
            + '<tbody>' + rowsHtml + '</tbody>'
            + '</table>'
            + (compositeLine
                ? ('<div style="font-size: 10px; margin-top: 6px; color: var(--foreground, #0f172a);">' + compositeLine + '</div>')
                : '')
            + (contextLine
                ? ('<div style="font-size: 10px; margin-top: 4px; color: var(--muted-foreground, #64748b);">' + dashEscHtml(contextLine) + '</div>')
                : '')
            + '</div>';
    },

    _ratingScoreBlockHtml(title, block, basisKind, opts) {
        return this._ratingScoreBlockCompactHtml(title, block, basisKind, opts);
    },

    _ratingCopyChipHtml(text, styleExtras) {
        const value = String(text == null ? '' : text).trim();
        if (!value) return '';
        const style = 'display: inline-block; max-width: 100%; padding: 0; margin: 0; border: none; border-radius: 4px;'
            + ' background: transparent; text-align: left; overflow-wrap: anywhere; cursor: pointer;'
            + (styleExtras ? (' ' + styleExtras) : '');
        return '<button type="button" data-wf-dash-copy="' + dashEscHtml(value) + '" title="Click to copy"'
            + ' aria-label="Copy ' + dashEscHtml(value) + '"'
            + ' style="' + style + '">' + dashEscHtml(value) + '</button>';
    },

    _ratingWorkerCardHtml(worker, scoreTypes) {
        const types = scoreTypes || this._ratingSearchScoreTypes(this._state.committed);
        const name = worker.name || worker.workerId;
        const workerId = String(worker.workerId || '').trim();
        const weighting = this._ratingWorkerWeighting(workerId);
        const isRecency = weighting === 'recency';

        const twqsBlock = this._ratingBlockForWeighting(worker, 'twqs');
        const qaqsBlock = this._ratingBlockForWeighting(worker, 'qaqs');
        const hasTwqs = !!(types.showTwqs && twqsBlock && twqsBlock.score != null);
        const hasQaqs = !!(types.showQaqs && qaqsBlock && qaqsBlock.score != null);
        const twqsHtml = hasTwqs
            ? this._ratingScoreBlockCompactHtml('Task Writer Quality Score', twqsBlock, 'tasks', {
                workerId,
                scoreKind: 'twqs',
            })
            : '';
        const qaqsHtml = hasQaqs
            ? this._ratingScoreBlockCompactHtml('QA Quality Score', qaqsBlock, 'feedbacks', {
                workerId,
                scoreKind: 'qaqs',
            })
            : '';

        const btnCls = this._dashBtnClass('basic', 'nav');
        const diagnosticsBtnHtml = Context.isDevBranch
            ? ('<button type="button" class="' + btnCls + '" data-wf-dash-rating-export="diagnostics" data-wf-dash-rating-worker="' + dashEscHtml(workerId) + '">Export Diagnostics</button>')
            : '';
        const box = this._panelBoxStyle();

        const toggleHtml = '<div class="dv-seg-group" style="flex-shrink: 0;">'
            + '<button type="button" class="dv-seg-btn dv-seg-btn--divider" data-wf-dash-rating-weighting="recency" data-wf-dash-rating-worker="' + dashEscHtml(workerId) + '" aria-pressed="' + (isRecency ? 'true' : 'false') + '">Recency</button>'
            + '<button type="button" class="dv-seg-btn" data-wf-dash-rating-weighting="flat" data-wf-dash-rating-worker="' + dashEscHtml(workerId) + '" aria-pressed="' + (isRecency ? 'false' : 'true') + '">Flat</button>'
            + '</div>';

        const nameHtml = this._ratingCopyChipHtml(name, 'font-size: 13px; font-weight: 600; color: var(--foreground, #0f172a);');
        const emailHtml = worker.email
            ? ('<div style="margin-top: 2px;">'
                + this._ratingCopyChipHtml(worker.email, 'font-size: 10px; font-weight: 500; color: var(--muted-foreground, #64748b);')
                + '</div>')
            : '';

        return '<div class="wf-dash-rating-card" data-wf-dash-rating-worker="' + dashEscHtml(workerId) + '" style="' + box + ' padding: 12px;">'
            + '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">'
            + '<div style="min-width: 0;">'
            + '<div>' + nameHtml + '</div>'
            + emailHtml
            + '</div>'
            + toggleHtml
            + '</div>'
            + twqsHtml
            + qaqsHtml
            + '<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">'
            + '<button type="button" class="' + btnCls + '" data-wf-dash-rating-export="json" data-wf-dash-rating-worker="' + dashEscHtml(workerId) + '">Export JSON</button>'
            + '<button type="button" class="' + btnCls + '" data-wf-dash-rating-export="md" data-wf-dash-rating-worker="' + dashEscHtml(workerId) + '">Export MD</button>'
            + diagnosticsBtnHtml
            + '</div>'
            + '</div>';
    },

    _renderRatingsPanel(options) {
        const opts = options || {};
        const recompute = opts.recompute !== false;
        const cardsEl = this._q('#wf-dash-ratings-cards');
        const warnEl = this._q('#wf-dash-ratings-warnings');
        if (!cardsEl) return;

        const committed = this._state.committed || {};
        const authorCount = committed.authorCount != null ? committed.authorCount : (committed.authorIds || []).length;
        const bulkMode = this._ratingsBulkWorkerMode(committed);
        const warnings = [...this._getRatingsPrefetchWarnings(), ...this._getRatingsHydrationWarnings()];

        if (warnEl) {
            if (warnings.length) {
                warnEl.style.display = 'flex';
                warnEl.innerHTML = warnings.map((w) =>
                    '<div style="font-size: 11px; padding: 8px 10px; border-radius: 6px; background: color-mix(in srgb, #f59e0b 12%, var(--card, #fff)); color: var(--foreground, #0f172a); border: 1px solid color-mix(in srgb, #f59e0b 35%, var(--border, #e2e8f0));">' + dashEscHtml(w) + '</div>'
                ).join('');
            } else {
                warnEl.style.display = 'none';
                warnEl.innerHTML = '';
            }
        }

        if (!this._state.hasSearched || !this._state.cachedItems) {
            cardsEl.innerHTML = '<p style="font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;">Run a search to load results.</p>';
            this._state.ratingsReport = null;
            this._syncRatingsToolbarUi(0, 0);
            return;
        }

        if (!bulkMode && authorCount === 0) {
            cardsEl.innerHTML = '<p style="font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;">Search by specific contributors, use @everyone, or click <strong>Generate cards</strong> for everyone in the current results.</p>';
            this._state.ratingsReport = null;
            this._syncRatingsToolbarUi(0, 0);
            return;
        }

        const engine = Context.ratingEngine;
        if (!engine || typeof engine.compute !== 'function') {
            cardsEl.innerHTML = '<p style="font-size: 12px; color: var(--destructive, #dc2626); margin: 0;">Rating engine not loaded. Reload the page and try again.</p>';
            this._state.ratingsReport = null;
            this._syncRatingsToolbarUi(0, 0);
            return;
        }

        const scoreTypes = this._ratingSearchScoreTypes(committed);
        this._ensureRatingsSortKey(committed);

        if (recompute || !this._state.ratingsReport) {
            const scopeItems = this._getRatingsScopeItems();
            const report = this._computeRatingsReport(scopeItems, committed);
            this._state.ratingsReport = report;
            const scopeLabel = this._ratingsScopeLabel();
            const workerCount = (report.workers || []).length;
            Logger.log('search-output: ratings computed — ' + workerCount + ' worker(s) · ' + scopeLabel
                + (committed.ratingsEveryone ? ' (@everyone)' : '')
                + (this._state.ratingsFromResults && !committed.ratingsEveryone ? ' (from results)' : ''));
        }

        const report = this._state.ratingsReport;
        const allWorkers = (report && report.workers) || [];

        if (allWorkers.length === 0) {
            cardsEl.innerHTML = '<p style="font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;">No contributor ratings available.</p>';
            this._syncRatingsToolbarUi(0, 0);
            return;
        }

        const visibleWorkers = this._applyRatingsViewFilters(allWorkers, scoreTypes);
        this._syncRatingsToolbarUi(visibleWorkers.length, allWorkers.length);

        if (visibleWorkers.length === 0) {
            cardsEl.innerHTML = '<p style="font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;">No ratings match the current filters.</p>';
            Logger.log('search-output: ratings view — showing 0 of ' + allWorkers.length);
            return;
        }

        cardsEl.innerHTML = visibleWorkers.map((w) => this._ratingWorkerCardHtml(w, scoreTypes)).join('');
        Logger.log('search-output: ratings view — showing ' + visibleWorkers.length + ' of ' + allWorkers.length);
    },

    _downloadTextFile(filename, content, mime) {
        try {
            const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            Logger.error('search-output: rating export download failed', e);
        }
    },

    _buildRatingsBulkExportPayload(visibleWorkers) {
        const engine = Context.ratingEngine;
        const report = this._state.ratingsReport;
        const committed = this._state.committed || {};
        const scoreTypes = this._ratingSearchScoreTypes(committed);
        const exportDate = new Date().toISOString().slice(0, 10);
        const workers = (visibleWorkers || []).map((worker) => {
            const workerExport = {
                ...worker,
                twqs: scoreTypes.showTwqs ? worker.twqs : null,
                qaqs: scoreTypes.showQaqs ? worker.qaqs : null,
                computedAt: report.computedAt,
                engineVersion: report.version,
                exportDate
            };
            if (engine && typeof engine.serializeJson === 'function') {
                return JSON.parse(engine.serializeJson(workerExport));
            }
            return workerExport;
        });
        return {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            computedAt: report.computedAt,
            engineVersion: report.version,
            mode: report.mode,
            window: report.window || {},
            scope: {
                label: this._ratingsScopeLabel(),
                hideProvisional: Boolean(this._state.ratingsHideProvisional),
                nameFilter: this._state.ratingsNameFilter || '',
                sortKey: this._state.ratingsSortKey,
                visibleCount: workers.length,
                totalCount: (report.workers || []).length
            },
            workers
        };
    },

    _exportFilteredRatingsJson() {
        if (!Context.isDevBranch) {
            Logger.warn('search-output-stats-pane: ratings bulk export skipped — not a dev build');
            return;
        }
        const report = this._state.ratingsReport;
        if (!report || !report.workers) {
            Logger.warn('search-output-stats-pane: ratings bulk export skipped — no report');
            return;
        }
        const committed = this._state.committed || {};
        const scoreTypes = this._ratingSearchScoreTypes(committed);
        const visibleWorkers = this._applyRatingsViewFilters(report.workers, scoreTypes);
        if (visibleWorkers.length === 0) {
            Logger.warn('search-output-stats-pane: ratings bulk export skipped — no visible workers');
            return;
        }
        const payload = this._buildRatingsBulkExportPayload(visibleWorkers);
        const engine = Context.statsEngine;
        const date = engine && typeof engine.exportDateSlug === 'function'
            ? engine.exportDateSlug()
            : new Date().toISOString().slice(0, 10);
        const filename = 'fleet-ratings-' + date + '.json';
        const json = JSON.stringify(payload, null, 2);
        this._downloadTextFile(filename, json, 'application/json;charset=utf-8');
        Logger.log('search-output-stats-pane: ratings bulk exported — ' + payload.workers.length + ' worker(s) · ' + filename);
    },

    _handleRatingExport(workerId, format) {
        const engine = Context.ratingEngine;
        const report = this._state.ratingsReport;
        if (!engine || !report || !report.workers) {
            Logger.warn('search-output: rating export skipped — no report');
            return;
        }
        const worker = report.workers.find((w) => w.workerId === workerId);
        if (!worker) {
            Logger.warn('search-output: rating export skipped — worker not found ' + workerId);
            return;
        }
        const exportDate = new Date().toISOString().slice(0, 10);
        // Always export both weighting variants (plan §5); score-type visibility
        // flags are all-true now, so we pass the worker as-is.
        const workerExport = {
            ...worker,
            computedAt: report.computedAt,
            engineVersion: report.version,
            exportDate
        };
        // Derive a scoreType label for the filename from what is present.
        const hasTwqs = worker.twqs && (worker.twqs.flat || worker.twqs.recency || worker.twqs.score != null);
        const hasQaqs = worker.qaqs && (worker.qaqs.flat || worker.qaqs.recency || worker.qaqs.score != null);
        let scoreType = 'scores';
        if (hasTwqs && hasQaqs) scoreType = 'twqs-qaqs';
        else if (hasTwqs) scoreType = 'twqs';
        else if (hasQaqs) scoreType = 'qaqs';

        if (format === 'diagnostics') {
            if (typeof engine.buildDiagnosticsReport !== 'function') {
                Logger.warn('search-output: diagnostics export skipped — engine method missing');
                return;
            }
            const warnings = [...this._getRatingsPrefetchWarnings(), ...this._getRatingsHydrationWarnings()];
            const cachedItems = this._state.cachedItems || [];
            const diagnostics = engine.buildDiagnosticsReport(workerExport, {
                cachedItems,
                committed: this._state.committed || {},
                warnings,
                unhydratedCount: cachedItems.filter((item) => item && item.hydrated !== true).length
            });
            const json = engine.serializeDiagnosticsJson(diagnostics);
            const filename = engine.buildDiagnosticsFilename(workerExport);
            this._downloadTextFile(filename, json, 'application/json;charset=utf-8');
            Logger.log('search-output: rating diagnostics exported — ' + filename);
            return;
        }

        if (format === 'json') {
            const json = engine.serializeJson(workerExport);
            const filename = engine.buildExportFilename(worker, scoreType, 'json');
            this._downloadTextFile(filename, json, 'application/json;charset=utf-8');
            Logger.log('search-output: rating JSON exported — ' + filename);
            return;
        }
        const md = engine.serializeMarkdown(workerExport);
        const mdName = engine.buildExportFilename(worker, scoreType, 'md');
        this._downloadTextFile(mdName, md, 'text/markdown;charset=utf-8');
        Logger.log('search-output: rating MD exported — ' + mdName);
    },
};

const plugin = {
    id: 'search-output-stats-pane',
    name: 'Search Output stats pane',
    description: 'Worker Output Search tab — stats pane (Ratings)',
    _version: '11.2',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        if (state && state.registered) {
            Logger.debug('search-output-stats-pane: already registered — skipping re-init');
            return;
        }
        Context.searchOutputStatsPaneMethods = searchOutputStatsPaneMethods;
        searchOutputStatsPaneMethods._ensureStatsChartCardStyles();
        if (state) state.registered = true;
        Logger.log('search-output-stats-pane: registered (Context.searchOutputStatsPaneMethods)');
    }
};
