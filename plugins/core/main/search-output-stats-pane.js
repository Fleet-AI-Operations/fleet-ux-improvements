// search-output-stats-pane.js — Worker Output Search stats pane (Ratings)

const DASH_PREFETCH_KINDS = ['openDisputes', 'resolvedDisputes', 'pendingFlags', 'resolvedFlags'];

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
            + '<div id="wf-dash-stats-panel-stats" style="' + panelScroll + '; display: ' + (statsTab === 'stats' ? 'flex' : 'none') + ';">'
            + this._statsChartsPanelContentHtml()
            + '</div>'
            + '<div id="wf-dash-stats-panel-ratings" style="' + panelScroll + '; display: ' + (statsTab === 'ratings' ? 'flex' : 'none') + ';">'
            + this._ratingsAboutSectionHtml()
            + '<div id="wf-dash-ratings-warnings" style="display: none; flex-direction: column; gap: 6px;"></div>'
            + this._ratingsToolbarHtml()
            + '<div id="wf-dash-ratings-cards" style="display: flex; flex-direction: column; gap: 12px;"></div>'
            + '</div>'
            + '</div>';
    },

    _statsChartsPanelContentHtml() {
        return ''
            + '<div id="wf-dash-stats-warnings" style="display: none; flex-direction: column; gap: 6px; flex-shrink: 0;"></div>'
            + '<div id="wf-dash-stats-toolbar" style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; flex-shrink: 0;">'
            + '<div id="wf-dash-stats-scope-summary" style="font-size: 11px; color: var(--muted-foreground, #64748b); min-width: 0; padding-top: 2px;"></div>'
            + '<div style="display: flex; flex-direction: column; align-items: stretch; gap: 6px; flex-shrink: 0; min-width: 120px;">'
            + '<button type="button" data-wf-dash-stats-reset-dashboard="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="width: 100%;">Reset</button>'
            + '<button type="button" data-wf-dash-stats-export-dashboard="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="width: 100%;">Export settings</button>'
            + '<button type="button" data-wf-dash-stats-export-dashboard-image="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="width: 100%;">Export image</button>'
            + '<button type="button" data-wf-dash-stats-import-json="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="width: 100%;">Import JSON</button>'
            + '<button type="button" data-wf-dash-stats-build="1" class="' + this._dashBtnClass('secondary', 'nav') + '" style="width: 100%;">Build Chart</button>'
            + '</div>'
            + '</div>'
            + '<div id="wf-dash-stats-empty" style="display: none; font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0; flex-shrink: 0;"></div>'
            + '<div id="wf-dash-stats-dashboard" style="display: none; flex-direction: column; gap: 12px; flex: 1; min-height: 0;">'
            + '<div id="wf-dash-stats-chart-list" data-wf-dash-stats-chart-list="1" style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 24px;"></div>'
            + '</div>'
            + '<div id="wf-dash-stats-builder" style="display: none; flex: 1; min-height: 0; flex-direction: column; overflow: hidden;"></div>';
    },

    _ensureStatsLayout() {
        const engine = Context.statsEngine;
        if (!engine) return { schemaVersion: 1, charts: [] };
        if (!this._state.statsLayout) {
            this._state.statsLayout = engine.loadLayout();
        }
        return this._state.statsLayout;
    },

    _persistStatsLayout() {
        const engine = Context.statsEngine;
        if (!engine || !this._state.statsLayout) return;
        this._state.statsLayout = engine.saveLayout(this._state.statsLayout) || this._state.statsLayout;
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
            void this._renderStatsPanel();
        } else {
            void this._renderStatsBuilder();
        }
        Logger.log('search-output-stats-pane: stats view ' + next);
    },

    _openStatsBuilder(chartId) {
        const engine = Context.statsEngine;
        const layout = this._ensureStatsLayout();
        const items = this._getStatsScopeItems();
        const catalog = engine ? engine.buildCatalog(this._statsCatalogCtx(items)) : null;
        if (chartId) {
            const existing = layout.charts.find((c) => c.id === chartId);
            this._state.statsBuilderDraft = existing
                ? JSON.parse(JSON.stringify(existing))
                : (engine ? engine.defaultBuilderDraft(catalog) : null);
            this._state.statsBuilderEditId = chartId;
        } else {
            this._state.statsBuilderDraft = engine ? engine.defaultBuilderDraft(catalog) : null;
            this._state.statsBuilderEditId = null;
        }
        if (this._state.statsBuilderDraft) {
            this._ensureStatsBuilderChartFilters(this._state.statsBuilderDraft);
        }
        this._setStatsViewMode('builder');
        void this._renderStatsBuilder();
    },

    _closeStatsBuilder() {
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
            groupBy: draft.groupBy,
            series: (draft.series || []).map((s) => {
                const entry = {
                    metricId: s.metricId,
                    agg: s.agg,
                    label: s.label || ''
                };
                if (engineMeta.needsRenderAs) {
                    entry.renderAs = s.renderAs === 'line' ? 'line' : 'bar';
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
        const layout = this._ensureStatsLayout();
        chart.id = draft.id || engine.newChartId();
        chart.title = String(draft.title || 'Chart').trim() || 'Chart';
        const listBounds = this._listBoundsFromOptions(this._state.filterListOptions || {});
        chart.chartFilters = engine.normalizeChartFilters
            ? engine.normalizeChartFilters(draft.chartFilters, listBounds)
            : (draft.chartFilters || {});
        const editId = this._state.statsBuilderEditId;
        if (editId) {
            const idx = layout.charts.findIndex((c) => c.id === editId);
            if (idx >= 0) layout.charts[idx] = chart;
            else layout.charts.push(chart);
        } else {
            layout.charts.push(chart);
        }
        this._persistStatsLayout();
        Logger.log('search-output-stats-pane: chart saved — ' + chart.title);
        this._closeStatsBuilder();
    },

    _deleteStatsChart(chartId) {
        if (!chartId) return;
        const layout = this._ensureStatsLayout();
        layout.charts = layout.charts.filter((c) => c.id !== chartId);
        this._persistStatsLayout();
        Logger.log('search-output-stats-pane: chart deleted — ' + chartId);
        void this._renderStatsPanel();
    },

    _reorderStatsChart(dragId, targetId) {
        if (!dragId || !targetId || dragId === targetId) return;
        const layout = this._ensureStatsLayout();
        const from = layout.charts.findIndex((c) => c.id === dragId);
        const to = layout.charts.findIndex((c) => c.id === targetId);
        if (from < 0 || to < 0) return;
        const [moved] = layout.charts.splice(from, 1);
        layout.charts.splice(to, 0, moved);
        this._persistStatsLayout();
        Logger.log('search-output-stats-pane: charts reordered');
        void this._renderStatsPanel();
    },

    _syncStatsToolbarUi() {
        const tab = this._state.statsTab || 'stats';
        const toolbar = this._q('#wf-dash-stats-toolbar');
        const buildBtn = this._q('[data-wf-dash-stats-build]');
        const resetDashBtn = this._q('[data-wf-dash-stats-reset-dashboard]');
        const exportDashBtn = this._q('[data-wf-dash-stats-export-dashboard]');
        const exportDashImageBtn = this._q('[data-wf-dash-stats-export-dashboard-image]');
        const importJsonBtn = this._q('[data-wf-dash-stats-import-json]');
        const dashEl = this._q('#wf-dash-stats-dashboard');
        const builderEl = this._q('#wf-dash-stats-builder');
        const panelStats = this._q('#wf-dash-stats-panel-stats');
        const mode = this._state.statsViewMode || 'dashboard';
        if (toolbar) toolbar.style.display = tab === 'stats' ? 'flex' : 'none';
        if (buildBtn) {
            buildBtn.textContent = mode === 'builder' ? 'Back to dashboard' : 'Build Chart';
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
            if (mode === 'builder') {
                panelStats.style.overflowY = 'hidden';
                panelStats.style.overflowX = 'hidden';
            } else {
                panelStats.style.overflowY = 'auto';
                panelStats.style.overflowX = 'auto';
            }
        }
        const summaryEl = this._q('#wf-dash-stats-scope-summary');
        if (summaryEl && tab === 'stats' && mode === 'dashboard') {
            const items = this._getStatsScopeItems();
            const scopeLabel = this._state.statsUseFiltered !== false ? 'Filtered' : 'All';
            summaryEl.textContent = items.length + ' item' + (items.length === 1 ? '' : 's') + ' · ' + scopeLabel;
            summaryEl.style.display = this._state.hasSearched && this._state.cachedItems ? '' : 'none';
        } else if (summaryEl) {
            summaryEl.textContent = mode === 'builder' ? 'Chart builder' : '';
            summaryEl.style.display = tab === 'stats' && mode === 'builder' ? '' : 'none';
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
            headerActions.insertBefore(wrap, headerActions.firstChild);
        }
        return wrap;
    },

    _syncStatsScopeToggleUi() {
        const tab = this._state.statsTab || 'stats';
        const useFiltered = this._state.statsUseFiltered !== false;
        const statsCol = this._q('[data-wf-dash-stats-column]');
        const headerActions = statsCol && statsCol.querySelector('[data-wf-dash-stats-header-actions]');
        if (!headerActions) return;
        const wrap = this._ensureStatsScopeToggle(headerActions);
        if (wrap) {
            wrap.style.display = (tab === 'stats' || tab === 'ratings') ? 'inline-flex' : 'none';
            wrap.querySelectorAll('[data-wf-dash-stats-scope]').forEach((btn) => {
                const scope = btn.getAttribute('data-wf-dash-stats-scope');
                const active = scope === 'filtered' ? useFiltered : !useFiltered;
                btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
        }
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
            brandAlt: this._statsResolvedColor('--primary', '#16a34a')
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
        if (!this._statsChartHasRenderableData(chart, aggData)) {
            if (statusEl) {
                statusEl.style.display = '';
                statusEl.textContent = 'No data to preview for these settings.';
            }
            if (canvas) canvas.style.display = 'none';
            if (scorecardEl) scorecardEl.style.display = 'none';
            return;
        }

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
            return;
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
            const config = this._buildChartJsConfig(chart, aggData, theme, containerWidth);
            this._state.statsBuilderPreviewChart = new Chart(canvas, config);
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

    _statsChartCardHtml(chart, validation) {
        const box = this._panelBoxStyle();
        const height = this._statsResolvedChartHeight(chart);
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
            : ('<canvas id="wf-dash-stats-canvas-' + dashEscHtml(chart.id) + '" aria-label="' + dashEscHtml(chart.title) + '"></canvas>');
        return '<div class="wf-dash-stats-chart-card" data-chart-id="' + dashEscHtml(chart.id) + '" style="' + box + ' padding: 10px 12px; flex-shrink: 0; position: relative;">'
            + '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">'
            + '<span data-wf-dash-stats-chart-drag="' + dashEscHtml(chart.id) + '" title="Drag to reorder" style="cursor: grab; color: var(--muted-foreground, #64748b); font-size: 14px; user-select: none; line-height: 1;">⠿</span>'
            + '<div style="flex: 1; min-width: 0; font-size: 12px; font-weight: 600; color: var(--foreground, #0f172a); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + dashEscHtml(chart.title) + '</div>'
            + '<button type="button" data-wf-dash-stats-chart-edit="' + dashEscHtml(chart.id) + '" class="' + this._dashBtnClass('basic', 'nav') + '" style="padding: 2px 8px; font-size: 10px;">Edit</button>'
            + '<button type="button" data-wf-dash-stats-chart-export="' + dashEscHtml(chart.id) + '" class="' + this._dashBtnClass('basic', 'nav') + '" style="padding: 2px 8px; font-size: 10px;">Export settings</button>'
            + '<button type="button" data-wf-dash-stats-chart-export-image="' + dashEscHtml(chart.id) + '" class="' + this._dashBtnClass('basic', 'nav') + '" style="padding: 2px 8px; font-size: 10px;">Export image</button>'
            + '<button type="button" data-wf-dash-stats-chart-delete="' + dashEscHtml(chart.id) + '" title="Delete chart" aria-label="Delete chart" style="border: none; background: transparent; color: var(--muted-foreground, #64748b); cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px;">×</button>'
            + '</div>'
            + filterSubtitle
            + '<div style="position: relative; height: ' + height + 'px; max-width: 100%;' + canvasOpacity + '">'
            + overlay
            + bodyContent
            + '</div>'
            + '</div>';
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
        if (chart.type === 'scorecard') {
            return aggData.value != null && Number.isFinite(aggData.value);
        }
        return (aggData.points && aggData.points.length) || (aggData.labels && aggData.labels.length);
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
                label: (ctx) => {
                    const ds = ctx.dataset || {};
                    const horizontal = ctx.chart.options.indexAxis === 'y';
                    const rawVal = horizontal ? ctx.parsed.x : ctx.parsed.y;
                    let text = (ds.label || '') + ': ' + dash._formatStatsScorecardValue(rawVal);
                    const idx = ctx.dataIndex;
                    if (Array.isArray(ds.statsSpreadLow) && Array.isArray(ds.statsSpreadHigh)
                        && ds.statsSpreadLow[idx] != null && ds.statsSpreadHigh[idx] != null
                        && Number.isFinite(ds.statsSpreadLow[idx]) && Number.isFinite(ds.statsSpreadHigh[idx])) {
                        text += ' (±σ ' + dash._formatStatsScorecardValue(ds.statsSpreadLow[idx])
                            + '–' + dash._formatStatsScorecardValue(ds.statsSpreadHigh[idx]) + ')';
                    }
                    return text;
                }
            }
        };
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

    _buildChartJsConfig(chart, aggData, theme, containerWidth) {
        const palette = this._statsPiePalette();
        const type = chart.type;
        const labelCount = (aggData.labels || []).length;
        const chartJsCtx = { labelCount, containerWidth: containerWidth || 0 };

        if (type === 'scatter' || type === 'bubble') {
            const points = aggData.points || [];
            const s0 = (chart.series || [])[0] || {};
            const s1 = (chart.series || [])[1] || {};
            const dsLabel = (s0.label || s0.metricId || 'X') + ' vs ' + (s1.label || s1.metricId || 'Y');
            return {
                type: type === 'bubble' ? 'bubble' : 'scatter',
                data: {
                    datasets: [{
                        label: dsLabel,
                        data: points.map((p) => ({ x: p.x, y: p.y, r: p.r, label: p.label })),
                        backgroundColor: theme.brand,
                        borderColor: theme.brand
                    }]
                },
                options: this._buildChartJsOptions(chart, theme, chartJsCtx)
            };
        }

        if (type === 'pie' || type === 'polarArea') {
            const ds = (aggData.datasets || [])[0] || { label: 'Count of results', data: [] };
            return {
                type: type === 'polarArea' ? 'polarArea' : 'pie',
                data: {
                    labels: aggData.labels,
                    datasets: [{
                        label: ds.label,
                        data: ds.data,
                        backgroundColor: (aggData.labels || []).map((_, j) => palette[j % palette.length]),
                        borderColor: 'transparent'
                    }]
                },
                options: this._buildChartJsOptions(chart, theme, chartJsCtx)
            };
        }

        if (type === 'radar') {
            const datasets = (aggData.datasets || []).map((ds, i) => {
                const color = i === 0 ? theme.brand : (i === 1 ? theme.brandAlt : palette[i % palette.length]);
                return {
                    label: ds.label,
                    data: ds.data,
                    borderColor: color,
                    backgroundColor: this._statsColorWithAlpha(color, 0.2),
                    pointBackgroundColor: color,
                    pointBorderColor: color
                };
            });
            return {
                type: 'radar',
                data: { labels: aggData.labels, datasets },
                options: this._buildChartJsOptions(chart, theme, chartJsCtx)
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
            const base = Object.assign({
                type: renderAs,
                label: ds.label,
                data: ds.data,
                borderColor: color,
                backgroundColor: color,
                order: renderAs === 'line' ? 1 : 2
            }, axisBinding);
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
                        tension: 0.2,
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
                        stack: 'line-' + valueScale
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
                        tension: 0.2,
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
                        statsLegendHidden: true,
                        statsShadedFillLayer: true,
                        statsSeriesKey: seriesKey
                    }));
                    chartDatasets.push(Object.assign({}, base, {
                        order: 1,
                        fill: false,
                        tension: 0.2,
                        spanGaps: true,
                        pointRadius: 3,
                        borderColor: color,
                        statsSeriesKey: seriesKey
                    }));
                    return;
                }
                const lineOpts = {
                    tension: 0.2,
                    spanGaps: true,
                    pointRadius: 3,
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
        return {
            type: 'bar',
            data: { labels: aggData.labels, datasets: chartDatasets },
            options: this._buildChartJsOptions(chart, theme, chartJsCtx)
        };
    },

    _attachStatsChartReorder(listEl) {
        if (!listEl || listEl.dataset.wfStatsReorderBound === 'true') return;
        listEl.dataset.wfStatsReorderBound = 'true';
        const dash = this;
        let dragId = null;
        listEl.addEventListener('pointerdown', (e) => {
            const handle = e.target.closest('[data-wf-dash-stats-chart-drag]');
            if (!handle || !listEl.contains(handle)) return;
            dragId = handle.getAttribute('data-wf-dash-stats-chart-drag');
            handle.setPointerCapture(e.pointerId);
        });
        listEl.addEventListener('pointerup', (e) => {
            if (!dragId) return;
            const card = e.target.closest('[data-chart-id]');
            const targetId = card ? card.getAttribute('data-chart-id') : null;
            if (targetId && targetId !== dragId) {
                dash._reorderStatsChart(dragId, targetId);
            }
            dragId = null;
        });
        listEl.addEventListener('pointercancel', () => { dragId = null; });
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
        if (!engine || typeof engine.defaultLayout !== 'function') {
            Logger.warn('search-output-stats-pane: dashboard reset skipped — stats engine unavailable');
            return;
        }
        const confirmed = confirm(
            'Reset dashboard to the default layout? All custom charts will be removed. This cannot be undone.'
        );
        if (!confirmed) return;
        this._state.statsLayout = engine.defaultLayout();
        this._persistStatsLayout();
        this._state.statsPanelDirty = false;
        void this._renderStatsPanel();
        Logger.log('search-output-stats-pane: dashboard reset to default — ' + this._state.statsLayout.charts.length + ' chart(s)');
    },

    _exportStatsDashboard() {
        const engine = Context.statsEngine;
        if (!engine || typeof engine.exportLayoutObject !== 'function') {
            Logger.warn('search-output-stats-pane: dashboard export skipped — stats engine unavailable');
            return;
        }
        const layout = this._ensureStatsLayout();
        const payload = engine.exportLayoutObject(layout);
        const date = typeof engine.exportDateSlug === 'function' ? engine.exportDateSlug() : 'export';
        const filename = 'fleet-stats-dashboard-' + date + '.json';
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
        const layout = this._ensureStatsLayout();
        const chart = layout.charts.find((c) => c.id === chartId);
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

    _getStatsScorecardBodyDataUrl(chart) {
        const el = this._q('[data-wf-dash-stats-scorecard="' + chart.id + '"]');
        if (!el || !String(el.textContent || '').trim()) return null;
        const theme = this._statsChartTheme();
        const height = this._statsResolvedChartHeight(chart);
        const width = el.parentElement && el.parentElement.clientWidth > 0
            ? el.parentElement.clientWidth
            : 480;
        const scale = 2;
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

    _getStatsChartBodyDataUrl(chart) {
        if (chart.type === 'scorecard') {
            return this._getStatsScorecardBodyDataUrl(chart);
        }
        const inst = this._state.statsCharts && this._state.statsCharts[chart.id];
        if (!inst || typeof inst.toBase64Image !== 'function') return null;
        return inst.toBase64Image('image/png', 2);
    },

    async _composeStatsChartImage(chart) {
        const bodyDataUrl = this._getStatsChartBodyDataUrl(chart);
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
        const width = Math.max(bodyImg.width, 320);
        const headerHeight = topPad + titleLineHeight + (filterSummary ? 4 + filterLineHeight : 0) + gapAfterHeader;
        const height = headerHeight + bodyImg.height + topPad;
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
        const bodyX = Math.max(0, Math.floor((width - bodyImg.width) / 2));
        ctx.drawImage(bodyImg, bodyX, headerHeight);
        return canvas.toDataURL('image/png');
    },

    async _exportStatsChartImage(chartId) {
        const chartIdStr = String(chartId || '');
        const layout = this._ensureStatsLayout();
        const chart = layout.charts.find((c) => c.id === chartIdStr);
        if (!chart) {
            Logger.warn('search-output-stats-pane: chart image export skipped — chart not found ' + chartIdStr);
            return;
        }
        const dataUrl = await this._composeStatsChartImage(chart);
        if (!dataUrl) {
            Logger.warn('search-output-stats-pane: chart image export skipped — chart not rendered ' + chartIdStr);
            return;
        }
        const filename = this._statsExportImageFilename('fleet-stats-chart', chart.title || chartIdStr);
        this._downloadDataUrl(filename, dataUrl);
        Logger.log('search-output-stats-pane: chart image exported — ' + (chart.title || chartIdStr));
    },

    async _exportStatsDashboardImage() {
        const layout = this._ensureStatsLayout();
        if (!layout.charts.length) {
            Logger.warn('search-output-stats-pane: dashboard image export skipped — no charts');
            return;
        }
        const chartImages = [];
        for (const chart of layout.charts) {
            const dataUrl = await this._composeStatsChartImage(chart);
            if (dataUrl) chartImages.push(dataUrl);
        }
        if (!chartImages.length) {
            Logger.warn('search-output-stats-pane: dashboard image export skipped — no renderable charts');
            return;
        }
        let imgs;
        try {
            imgs = await Promise.all(chartImages.map((url) => this._loadStatsImage(url)));
        } catch (e) {
            Logger.warn('search-output-stats-pane: dashboard image export failed — compose error', e);
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
            const x = Math.floor((width - img.width) / 2);
            ctx.drawImage(img, x, y);
            y += img.height + gap;
        }
        const filename = this._statsExportImageFilename('fleet-stats-dashboard', 'dashboard');
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
                const layout = this._ensureStatsLayout();
                let added = 0;
                for (const raw of payload.charts) {
                    const chart = typeof engine.prepareImportedChart === 'function'
                        ? engine.prepareImportedChart(raw)
                        : null;
                    if (!chart) continue;
                    layout.charts.push(chart);
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
            inputStyle: 'width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; background: var(--card, #fff); color: var(--foreground, #0f172a);',
            inputDisabledStyle: 'width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; background: var(--card, #fff); color: var(--foreground, #0f172a); opacity: 0.55; cursor: not-allowed;',
            hintStyle: 'font-size: 10px; color: var(--muted-foreground, #64748b); margin-top: 4px; line-height: 1.35;',
            cardStyle: 'border: 1px solid var(--border, #e2e8f0); border-radius: 8px; padding: 10px; background: var(--muted, #f1f5f9);',
            grid2: 'display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;',
            grid3: 'display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;',
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
        const fieldOpacity = opts.disabled ? ' opacity: 0.65;' : '';
        const hint = opts.hint ? ('<div style="' + styles.hintStyle + '">' + opts.hint + '</div>') : '';
        return '<div style="' + spanStyle + fieldOpacity + '"><div style="' + styles.fieldLabel + '">' + label + '</div>'
            + innerHtml + hint + '</div>';
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
            '<input type="number" data-wf-dash-stats-draft="height" min="' + heightCfg.min + '" max="' + heightCfg.max + '" step="' + heightCfg.step + '" value="' + heightValue + '" style="' + styles.inputStyle + '">',
            { styles, hint: heightCfg.min + '–' + heightCfg.max + ' px in steps of ' + heightCfg.step });
        const chartSettingsCells = [chartTypeField, groupByField, heightField].filter(Boolean);
        const chartColCount = chartSettingsCells.length;
        const chartGridStyle = chartColCount === 3 ? styles.grid3 : styles.grid2;
        const chartSettingsHtml = '<div style="' + chartGridStyle + '">' + chartSettingsCells.join('') + '</div>';

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
            const layoutGridStyle = layoutCells.length >= 3 ? styles.grid3 : styles.grid2;
            layoutOptionsHtml = '<div style="' + layoutGridStyle + '">' + layoutCells.join('') + '</div>';
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

        return { chartSettingsHtml, layoutOptionsHtml, pointModeHtml };
    },

    _statsBuilderSeriesCard(i, s, ctx) {
        const { draft, catalog, typeMeta, engine, aggList, styles, seriesCount, maxSeries, minSeries } = ctx;
        const metricOpts = catalog.metrics.map((m) =>
            '<option value="' + dashEscHtml(m.id) + '"' + (s.metricId === m.id ? ' selected' : '') + '>' + dashEscHtml(m.label) + '</option>'
        ).join('');
        const aggOpts = aggList.map((a) =>
            '<option value="' + dashEscHtml(a.id) + '"' + (s.agg === a.id ? ' selected' : '') + '>' + dashEscHtml(a.label) + '</option>'
        ).join('');
        const segmentAllowed = engine.seriesAllowsSegment
            ? engine.seriesAllowsSegment(draft.type, s)
            : false;
        const showSeriesLabel = !typeMeta.skipGroupBy;
        const showRemove = maxSeries > 1 && seriesCount > minSeries;
        const headerLabel = typeMeta.skipGroupBy ? 'Metric' : ('Series ' + (i + 1));

        const metricField = this._statsBuilderField('Metric',
            '<select data-wf-dash-stats-draft="series-metric" data-series-idx="' + i + '" style="' + styles.inputStyle + '">' + metricOpts + '</select>',
            { styles });
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
                + catalog.dimensions.filter((d) => d.key !== draft.groupBy).map((d) =>
                    '<option value="' + dashEscHtml(d.key) + '"' + (segmentBy === d.key ? ' selected' : '') + '>' + dashEscHtml(d.label) + '</option>'
                ).join('')
                + '</select>',
                { styles, disabled: segmentDisabled });
            row1Html = '<div style="' + styles.grid3 + '">' + metricField + aggField + segmentField + '</div>';
        } else {
            row1Html = '<div style="' + styles.grid2 + '">' + metricField + aggField + '</div>';
        }

        let row2Html = '';
        if (showSeriesLabel) {
            row2Html = '<div style="margin-top: 8px;">'
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
            row3Html = '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px;">'
                + renderField + lineStyleField + yAxisField + spreadField + '</div>';
        }

        const removeBtn = showRemove
            ? ('<button type="button" data-wf-dash-stats-series-remove="' + i + '" class="' + this._dashBtnClass('basic', 'nav') + '" title="Remove series" aria-label="Remove series" style="flex-shrink: 0; min-width: 32px; padding: 4px 8px;">×</button>')
            : '';

        return '<div data-wf-dash-stats-series-row="' + i + '" style="' + styles.cardStyle + '">'
            + '<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">'
            + '<div style="' + styles.sectionLabel + ' margin-bottom: 0;">' + headerLabel + '</div>'
            + removeBtn
            + '</div>'
            + row1Html
            + row2Html
            + row3Html
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
        const box = this._panelBoxStyle();
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
            ? ('<div style="display: flex; flex-direction: column; gap: 10px;">' + seriesHtml + '</div>')
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
        formEl.innerHTML = '<div style="' + box + ' padding: 12px; display: flex; flex-direction: column; gap: 12px;">'
            + '<div id="wf-dash-stats-builder-validation" style="display: none; font-size: 11px; color: #dc2626;"></div>'
            + this._statsBuilderField('Title',
                '<input type="text" data-wf-dash-stats-draft="title" value="' + dashEscHtml(draft.title || '') + '" style="' + styles.inputStyle + '">',
                { styles })
            + chartSettings.chartSettingsHtml
            + chartSettings.layoutOptionsHtml
            + chartSettings.pointModeHtml
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
        const typeEl = this._q('[data-wf-dash-stats-draft="type"]');
        const groupEl = this._q('[data-wf-dash-stats-draft="groupBy"]');
        const barLayoutEl = this._q('[data-wf-dash-stats-draft="barLayout"]');
        const orientationEl = this._q('[data-wf-dash-stats-draft="orientation"]');
        const lineAreaLayoutEl = this._q('[data-wf-dash-stats-draft="lineAreaLayout"]');
        const categorySortEl = this._q('[data-wf-dash-stats-draft="categorySort"]');
        const heightEl = this._q('[data-wf-dash-stats-draft="height"]');
        const pointModeEl = this._q('[data-wf-dash-stats-draft="pointMode"]');
        if (titleEl) draft.title = titleEl.value;
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
        const series = [];
        this._modal.querySelectorAll('[data-wf-dash-stats-series-row]').forEach((row) => {
            const metricEl = row.querySelector('[data-wf-dash-stats-draft="series-metric"]');
            const aggEl = row.querySelector('[data-wf-dash-stats-draft="series-agg"]');
            const labelEl = row.querySelector('[data-wf-dash-stats-draft="series-label"]');
            const renderEl = row.querySelector('[data-wf-dash-stats-draft="series-render"]');
            const lineStyleEl = row.querySelector('[data-wf-dash-stats-draft="series-lineStyle"]');
            const yAxisEl = row.querySelector('[data-wf-dash-stats-draft="series-yaxis"]');
            const segmentEl = row.querySelector('[data-wf-dash-stats-draft="series-segment"]');
            const spreadEl = row.querySelector('[data-wf-dash-stats-draft="series-spread"]');
            if (!metricEl || !aggEl) return;
            const entry = {
                metricId: metricEl.value,
                agg: aggEl.value,
                label: labelEl ? labelEl.value : ''
            };
            if (renderEl) entry.renderAs = renderEl.value === 'line' ? 'line' : 'bar';
            if (lineStyleEl) entry.lineStyle = lineStyleEl.value === 'shaded' ? 'shaded' : 'line';
            if (yAxisEl) entry.yAxis = yAxisEl.value === 'y1' ? 'y1' : 'y';
            if (segmentEl) entry.segmentBy = segmentEl.value || null;
            if (spreadEl) entry.spread = spreadEl.value === 'stddevBand' ? 'stddevBand' : 'none';
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
                draft.series.push({
                    metricId: pick,
                    agg: 'avg',
                    label: '',
                    renderAs: draft.series.length === 0 ? 'bar' : 'line',
                    lineStyle: 'line',
                    yAxis: draft.series.length === 0 ? 'y' : 'y1'
                });
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
                if (!draft.series.length) {
                    draft.series = [{ metricId: 'count', agg: 'count', label: '' }];
                }
                const scorecardDefault = meta.defaultHeight || this._statsChartHeightConfig().default;
                if (!draft.height || draft.height > scorecardDefault + 80) {
                    draft.height = this._statsNormalizeChartHeight(scorecardDefault);
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
        draft.series.push({
            metricId: firstNumeric ? firstNumeric.id : 'count',
            agg: firstNumeric ? 'avg' : 'count',
            label: '',
            renderAs: draft.series.length === 0 ? 'bar' : 'line',
            lineStyle: 'line',
            yAxis: 'y'
        });
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
                if (agg.value != null && Number.isFinite(agg.value)) {
                    extra += '<div style="font-size: 11px; margin-top: 8px;"><strong>' + dashEscHtml(chart.title) + ':</strong> '
                        + dashEscHtml(String(agg.value)) + (agg.subtitle ? ' (' + dashEscHtml(agg.subtitle) + ')' : '')
                        + '</div>';
                }
                continue;
            }
            const pointCount = (agg.points || []).length;
            const labelCount = (agg.labels || []).length;
            if (!pointCount && !labelCount) continue;
            if (pointCount) {
                extra += '<div style="font-size: 11px; margin-top: 8px;"><strong>' + dashEscHtml(chart.title) + ':</strong> '
                    + dashEscHtml(agg.points.map((p) => (p.label || '') + ' (' + p.x + ', ' + p.y + ')').join('; '))
                    + '</div>';
                continue;
            }
            extra += '<div style="font-size: 11px; margin-top: 8px;"><strong>' + dashEscHtml(chart.title) + ':</strong> '
                + dashEscHtml(agg.labels.map((l, i) => {
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
            emptyEl.style.display = '';
            emptyEl.textContent = 'Run a search to load results.';
            dashEl.style.display = 'none';
            this._renderStatsWarnings([]);
            return;
        }

        if (this._isStatsHydrationBlocking()) {
            emptyEl.style.display = '';
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
            emptyEl.style.display = '';
            emptyEl.textContent = 'No results in this scope.';
            dashEl.style.display = 'none';
            return;
        }

        emptyEl.style.display = 'none';
        dashEl.style.display = 'flex';
        this._destroyStatsCharts();

        const engine = Context.statsEngine;
        const layout = this._ensureStatsLayout();
        const ctx = this._statsCatalogCtx(items);
        const catalog = engine ? engine.buildCatalog(ctx) : null;

        if (!engine || !catalog) {
            listEl.innerHTML = '<p style="font-size: 12px; color: var(--destructive, #dc2626); margin: 0;">Stats engine not loaded.</p>';
            return;
        }

        let cardsHtml = '';
        const validations = [];
        for (const chart of layout.charts) {
            const validation = engine.validateChart(chart, catalog, items, ctx);
            validations.push({ chart, validation });
            cardsHtml += this._statsChartCardHtml(chart, validation);
        }
        listEl.innerHTML = cardsHtml;
        this._attachStatsChartReorder(listEl);

        const renderGen = (this._state.statsRenderGen || 0) + 1;
        this._state.statsRenderGen = renderGen;

        let rendered = 0;
        for (const { chart, validation } of validations) {
            if (!validation.ok || chart.type !== 'scorecard') continue;
            const aggData = engine.aggregateChart(chart, items, catalog, ctx);
            if (!this._statsChartHasRenderableData(chart, aggData)) continue;
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
            this._renderStatsFallbackText(layout, catalog, items, ctx);
            return;
        }

        let Chart;
        try {
            Chart = await chartApi.ensureLoaded();
        } catch (e) {
            this._renderStatsWarnings([...warnings, 'Chart.js failed to load — showing text summary only.']);
            this._renderStatsFallbackText(layout, catalog, items, ctx);
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
            const config = this._buildChartJsConfig(chart, aggData, theme, containerWidth);
            charts[chart.id] = new Chart(canvas, config);
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
        if (hidden) {
            if (sliver && btn.parentElement !== sliver) sliver.appendChild(btn);
        } else if (headerActions && btn.parentElement !== headerActions) {
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
        if (!next && this._state.statsPanelDirty) {
            void this._renderStatsPanel();
        }
    },

    _applyStatsPanelLayoutOnOpen(modal) {
        const root = modal && modal.querySelector('[data-wf-dash-split-root][data-wf-dash-split-scope="dashboard"]');
        const dashApi = Context.dashboard;
        if (root && dashApi && typeof dashApi.applyStatsPanelLayout === 'function') {
            dashApi.applyStatsPanelLayout(root);
            this._syncStatsScopeToggleUi();
            if (this._isStatsPanelOpen() && this._state.statsPanelDirty) {
                void this._renderStatsPanel();
            }
            return;
        }
        this._syncStatsPanelCollapseUi();
        this._syncStatsScopeToggleUi();
        if (this._isStatsPanelOpen() && this._state.statsPanelDirty) {
            void this._renderStatsPanel();
        }
    },

    _ratingSearchScoreTypes(committed) {
        const c = committed || {};
        return {
            showTwqs: Boolean(c.includeTaskCreation),
            showQaqs: Boolean(c.includeQa)
        };
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
        const scoreTypes = this._ratingSearchScoreTypes(committed);
        const opts = [{ id: 'name-asc', label: 'Name A→Z' }];
        if (scoreTypes.showTwqs) {
            opts.push({ id: 'twqs-desc', label: 'TWQS high→low' });
            opts.push({ id: 'twqs-asc', label: 'TWQS low→high' });
        }
        if (scoreTypes.showQaqs) {
            opts.push({ id: 'qaqs-desc', label: 'QAQS high→low' });
            opts.push({ id: 'qaqs-asc', label: 'QAQS low→high' });
        }
        return opts;
    },

    _defaultRatingsSortKey(committed) {
        const c = committed || {};
        if (c.includeTaskCreation) return 'twqs-desc';
        if (c.includeQa) return 'qaqs-desc';
        return 'name-asc';
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
        if (scoreTypes.showTwqs && worker.twqs) blocks.push(worker.twqs);
        if (scoreTypes.showQaqs && worker.qaqs) blocks.push(worker.qaqs);
        return blocks;
    },

    _ratingWorkerIsProvisionalOnly(worker, scoreTypes) {
        const blocks = this._ratingVisibleScoreBlocks(worker, scoreTypes);
        if (blocks.length === 0) return true;
        return blocks.every((b) => b.confidence && b.confidence.tier === 'provisional');
    },

    _ratingWorkerSortValue(worker, sortKey) {
        if (sortKey === 'twqs-desc' || sortKey === 'twqs-asc') {
            const s = worker.twqs && worker.twqs.score;
            return Number.isFinite(s) ? s : null;
        }
        if (sortKey === 'qaqs-desc' || sortKey === 'qaqs-asc') {
            const s = worker.qaqs && worker.qaqs.score;
            return Number.isFinite(s) ? s : null;
        }
        return null;
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
        const sortKey = this._state.ratingsSortKey || 'name-asc';
        if (sortKey === 'name-asc') {
            list.sort((a, b) => String(a.name || a.workerId || '').localeCompare(String(b.name || b.workerId || '')));
        } else {
            const desc = sortKey.endsWith('-desc');
            list.sort((a, b) => {
                const va = this._ratingWorkerSortValue(a, sortKey);
                const vb = this._ratingWorkerSortValue(b, sortKey);
                const aMissing = va == null || !Number.isFinite(va);
                const bMissing = vb == null || !Number.isFinite(vb);
                if (aMissing && bMissing) {
                    return String(a.name || a.workerId || '').localeCompare(String(b.name || b.workerId || ''));
                }
                if (aMissing) return 1;
                if (bMissing) return -1;
                const cmp = va < vb ? -1 : va > vb ? 1 : 0;
                if (cmp !== 0) return desc ? -cmp : cmp;
                return String(a.name || a.workerId || '').localeCompare(String(b.name || b.workerId || ''));
            });
        }
        return list;
    },

    _computeRatingsReport(scopeItems, committed) {
        const everyoneMode = Boolean(committed.ratingsEveryone);
        let effectiveCommitted = committed;
        if (everyoneMode) {
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
    },

    _collectRatingWorkerIdsFromItems(cachedItems, committed) {
        const c = committed || {};
        const includeTw = Boolean(c.includeTaskCreation);
        const includeQa = Boolean(c.includeQa);
        const ids = new Set();
        for (const item of cachedItems || []) {
            if (!item || item.hydrated !== true) continue;
            const task = item.task;
            if (!task) continue;
            if (includeTw && task.author && task.author.id) ids.add(task.author.id);
            if (includeQa) {
                for (const entry of task.allFeedback || []) {
                    if (entry.reviewer && entry.reviewer.id) ids.add(entry.reviewer.id);
                }
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
        if (committed.ratingsEveryone) {
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
            { label: 'Task Outcomes', weight: '40%', measures: 'How far authored tasks progress in the lifecycle (production is ideal).' },
            { label: 'Revision Efficiency', weight: '25%', measures: 'How few revision rounds their tasks needed before landing.' },
            { label: 'Consistency', weight: '15%', measures: 'How steadily they worked, week to week, across the span.' },
            { label: 'Dispute Outcomes', weight: '10%', measures: 'Share of their resolved disputes decided in their favor.' },
            { label: 'Sr Review Integrity', weight: '10%', measures: 'Absence of confirmed senior-review flags on their tasks.' }
        ];
        const qaqsRows = [
            { label: 'Comprehensiveness', weight: '50%', measures: 'When they return a task, it gets fixed and accepted on the next round rather than being returned again.' },
            { label: 'Dispute Defense', weight: '20%', measures: 'Share of resolved disputes against their calls that were upheld.' },
            { label: 'Sr Review Integrity', weight: '20%', measures: 'Absence of confirmed poor-feedback flags against them, plus accuracy of flags they raised.' },
            { label: 'Consistency', weight: '10%', measures: 'How steadily they reviewed, week to week, across the span.' }
        ];
        return '<details id="wf-dash-ratings-about" style="' + box + ' padding: 10px 12px; flex-shrink: 0;">'
            + '<summary style="font-size: 11px; line-height: 1.45; cursor: pointer; list-style: none; user-select: none; ' + muted + '">'
            + '<strong style="color: var(--foreground, #0f172a);">About these ratings</strong>'
            + ' — how the scores are built and what they include.'
            + '</summary>'
            + '<div style="margin-top: 10px; font-size: 11px; line-height: 1.45; color: var(--foreground, #0f172a);">'
            + '<p style="margin: 0 0 8px;">Two independent scores per contributor, each on a <strong>0–100</strong> scale:</p>'
            + '<ul style="margin: 0 0 10px 18px; padding: 0;">'
            + '<li><strong>Task Writer Quality Score</strong> — quality of the work they <strong>authored</strong>.</li>'
            + '<li><strong>QA Quality Score</strong> — quality of the reviews they <strong>performed</strong>.</li>'
            + '</ul>'
            + '<p style="margin: 0 0 10px;">A person who does both jobs gets both scores. They are not blended into a single number.</p>'
            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">How to read a score</div>'
            + '<ul style="margin: 0 0 10px 18px; padding: 0;">'
            + '<li><strong>0–100, higher is better.</strong> Scores measure distance from an ideal benchmark, <strong>not</strong> a ranking against other people. ~80 means near-ideal, not &ldquo;above average.&rdquo;</li>'
            + '<li>Each score rolls up several <strong>weighted axes</strong>, shown highest-weight first. The bar next to each axis is its own sub-score (0–100%).</li>'
            + '<li>An axis with no qualifying activity is <strong>omitted</strong>, and its weight is spread across the others.</li>'
            + '<li>Every score carries a <strong>confidence</strong> badge based on how much recent activity it is built from.</li>'
            + '</ul>'
            + '<table style="width: 100%; border-collapse: collapse; font-size: 10px; line-height: 1.35; margin-bottom: 10px;">'
            + '<thead><tr>'
            + '<th style="padding: 4px 6px; text-align: left; font-weight: 600; border-bottom: 1px solid var(--border, #e2e8f0);">Confidence</th>'
            + '<th style="padding: 4px 6px; text-align: left; font-weight: 600; border-bottom: 1px solid var(--border, #e2e8f0);">Activity in the last 90 days</th>'
            + '</tr></thead>'
            + '<tbody>'
            + '<tr><td style="padding: 4px 6px; border-bottom: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 60%, transparent);">Provisional</td><td style="padding: 4px 6px; border-bottom: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 60%, transparent);">fewer than 10</td></tr>'
            + '<tr><td style="padding: 4px 6px; border-bottom: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 60%, transparent);">Standard</td><td style="padding: 4px 6px; border-bottom: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 60%, transparent);">10–49</td></tr>'
            + '<tr><td style="padding: 4px 6px;">High confidence</td><td style="padding: 4px 6px;">50 or more</td></tr>'
            + '</tbody></table>'
            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">What counts toward a score</div>'
            + '<ul style="margin: 0 0 10px 18px; padding: 0;">'
            + '<li>Scores use the <strong>committed search window</strong> and <strong>hydrated result cards only</strong>. Use the shared <strong>Filtered / All</strong> toggle (same as Stats): <strong>Filtered</strong> respects sidebar filters; <strong>All</strong> uses every result in the current results-kind tab.</li>'
            + '<li>With no After/Before dates, all history counts, weighted toward recent activity. With a date range set, everything inside the window counts equally and nothing outside it does.</li>'
            + '<li>Senior-review flags and disputes only move a score once they are <strong>resolved</strong>, and only in the direction the resolution supports. Pending or dismissed items stay neutral.</li>'
            + '</ul>'
            + '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">The axes</div>'
            + this._ratingsAboutAxisTableHtml('Task Writer Quality Score', twqsRows)
            + this._ratingsAboutAxisTableHtml('QA Quality Score', qaqsRows)
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
            count = display.submissionCount;
            singular = 'task';
            plural = 'tasks';
        } else if (basisKind === 'feedbacks') {
            count = display.feedbackRowCount;
            singular = 'feedback';
            plural = 'feedbacks';
        }
        if (count == null || !Number.isFinite(count)) return '';
        const label = count === 1 ? singular : plural;
        return 'Based on ' + count + ' ' + label;
    },

    _ratingScoreBlockHtml(title, block, basisKind) {
        if (!block || block.score == null) {
            return '';
        }
        const conf = block.confidence || {};
        const confStyle = conf.tier === 'provisional'
            ? 'border: 1px dashed var(--muted-foreground, #64748b);'
            : (conf.tier === 'high' ? 'font-weight: 700;' : '');
        const sortedAxes = [...(block.axes || [])].sort((a, b) => {
            const wDiff = (b.baseWeight || 0) - (a.baseWeight || 0);
            if (wDiff !== 0) return wDiff;
            return String(a.label || '').localeCompare(String(b.label || ''));
        });
        let axesHtml = '';
        const showAxisWeights = Boolean(Context.isDevBranch);
        for (const p of sortedAxes) {
            const omitted = p.defined === false || p.score == null;
            const pct = omitted ? 0 : Math.round((p.score || 0) * 100);
            const wt = p.effectiveWeight != null ? Math.round(p.effectiveWeight * 1000) / 10 : null;
            const bar = omitted
                ? '<span style="font-size: 10px; color: var(--muted-foreground, #64748b);">omitted</span>'
                : ('<div style="flex: 1; height: 6px; background: color-mix(in srgb, var(--muted-foreground, #64748b) 20%, transparent); border-radius: 3px; overflow: hidden;"><div style="width: ' + pct + '%; height: 100%; background: var(--brand, var(--primary, #2563eb));"></div></div>'
                + '<span style="font-size: 10px; min-width: 36px; text-align: right;">' + dashEscHtml(String(pct)) + '%</span>'
                + (showAxisWeights && wt != null ? '<span style="font-size: 10px; min-width: 32px; text-align: right; color: var(--muted-foreground, #64748b);">' + wt + '%</span>' : ''));
            axesHtml += '<div style="display: flex; align-items: center; gap: 8px; font-size: 11px; margin-top: 4px;">'
                + '<span style="flex: 0 0 42%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="' + dashEscHtml(p.label) + '">' + dashEscHtml(p.label) + '</span>'
                + bar
                + '</div>';
        }
        const scoreDisplay = Math.round(block.score);
        const basisLine = this._ratingScoreBasisLine(block, basisKind);
        return '<div style="margin-top: 10px;">'
            + '<div style="font-size: 12px; font-weight: 600; margin-bottom: 4px;">' + dashEscHtml(title) + '</div>'
            + '<div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">'
            + '<div style="font-size: 20px; font-weight: 700; line-height: 1.2;">' + dashEscHtml(String(scoreDisplay)) + ' <span style="font-size: 12px; font-weight: 500; color: var(--muted-foreground, #64748b);">/ 100</span></div>'
            + '<div style="font-size: 10px; flex-shrink: 0; padding: 2px 6px; border-radius: 4px; ' + confStyle + '">' + dashEscHtml(conf.label || '') + '</div>'
            + '</div>'
            + axesHtml
            + (basisLine
                ? ('<div style="font-size: 10px; color: var(--muted-foreground, #64748b); margin-top: 6px;">' + dashEscHtml(basisLine) + '</div>')
                : '')
            + '</div>';
    },

    _ratingWorkerCardHtml(worker, scoreTypes) {
        const types = scoreTypes || this._ratingSearchScoreTypes(this._state.committed);
        const name = worker.name || worker.workerId;
        const twqsHtml = types.showTwqs
            ? this._ratingScoreBlockHtml('Task Writer Quality Score', worker.twqs, 'tasks')
            : '';
        const qaqsHtml = types.showQaqs
            ? this._ratingScoreBlockHtml('QA Quality Score', worker.qaqs, 'feedbacks')
            : '';
        const diagnosticsBtnHtml = Context.isDevBranch
            ? ('<button type="button" class="' + this._dashBtnClass('basic', 'nav') + '" data-wf-dash-rating-export="diagnostics" data-wf-dash-rating-worker="' + dashEscHtml(worker.workerId) + '">Export Diagnostics</button>')
            : '';
        const box = this._panelBoxStyle();
        return '<div class="wf-dash-rating-card" data-wf-dash-rating-worker="' + dashEscHtml(worker.workerId) + '" style="' + box + ' padding: 12px;">'
            + '<div style="font-size: 13px; font-weight: 600; margin-bottom: 6px;">' + dashEscHtml(name) + '</div>'
            + (worker.email ? '<div style="font-size: 10px; color: var(--muted-foreground, #64748b); margin-bottom: 6px;">' + dashEscHtml(worker.email) + '</div>' : '')
            + twqsHtml
            + qaqsHtml
            + '<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">'
            + '<button type="button" class="' + this._dashBtnClass('basic', 'nav') + '" data-wf-dash-rating-export="json" data-wf-dash-rating-worker="' + dashEscHtml(worker.workerId) + '">Export JSON</button>'
            + '<button type="button" class="' + this._dashBtnClass('basic', 'nav') + '" data-wf-dash-rating-export="md" data-wf-dash-rating-worker="' + dashEscHtml(worker.workerId) + '">Export MD</button>'
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
        const everyoneMode = Boolean(committed.ratingsEveryone);
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

        if (!everyoneMode && authorCount === 0) {
            cardsEl.innerHTML = '<p style="font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;">Search by specific contributors, or use @everyone for bulk ratings.</p>';
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
                + (everyoneMode ? ' (@everyone)' : ''));
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
        const scoreTypes = this._ratingSearchScoreTypes(this._state.committed || {});
        const workerExport = {
            ...worker,
            twqs: scoreTypes.showTwqs ? worker.twqs : null,
            qaqs: scoreTypes.showQaqs ? worker.qaqs : null,
            computedAt: report.computedAt,
            engineVersion: report.version,
            exportDate
        };
        let scoreType = 'combined';
        if (scoreTypes.showTwqs && scoreTypes.showQaqs) {
            scoreType = (worker.twqs && worker.qaqs) ? 'combined' : (worker.twqs ? 'twqs' : 'qaqs');
        } else if (scoreTypes.showTwqs) {
            scoreType = 'twqs';
        } else if (scoreTypes.showQaqs) {
            scoreType = 'qaqs';
        }

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
    _version: '5.21',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        if (state && state.registered) {
            Logger.debug('search-output-stats-pane: already registered — skipping re-init');
            return;
        }
        Context.searchOutputStatsPaneMethods = searchOutputStatsPaneMethods;
        if (state) state.registered = true;
        Logger.log('search-output-stats-pane: registered (Context.searchOutputStatsPaneMethods)');
    }
};
