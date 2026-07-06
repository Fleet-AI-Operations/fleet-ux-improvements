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
        const statsTab = this._state ? this._state.statsTab : 'ratings';
        const panelScroll = 'flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 14px; flex-direction: column; gap: 12px;';
        return ''
            + '<div data-wf-dash-stats-sliver aria-hidden="true"></div>'
            + '<div data-wf-dash-stats-body style="display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; overflow: hidden; ' + box + '">'
            + '<div data-wf-dash-stats-header style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0; padding: 0 8px; border-bottom: 1px solid var(--border, #e2e8f0); min-height: 36px;">'
            + '<nav style="display: flex; align-items: center; gap: 0; min-width: 0;" aria-label="Ratings and stats">'
            + '<button type="button" data-wf-dash-stats-tab="ratings" style="' + this._statsTabStyle(statsTab === 'ratings') + '">Ratings</button>'
            + '<button type="button" data-wf-dash-stats-tab="stats" style="' + this._statsTabStyle(statsTab === 'stats') + '">Stats</button>'
            + '</nav>'
            + '<div data-wf-dash-stats-header-actions style="display: flex; align-items: center; justify-content: flex-end; flex: 1; min-width: 0;"></div>'
            + '</div>'
            + '<div id="wf-dash-stats-panel-ratings" style="' + panelScroll + '; display: ' + (statsTab === 'ratings' ? 'flex' : 'none') + ';">'
            + this._ratingsAboutSectionHtml()
            + '<div id="wf-dash-ratings-warnings" style="display: none; flex-direction: column; gap: 6px;"></div>'
            + '<div id="wf-dash-ratings-cards" style="display: flex; flex-direction: column; gap: 12px;"></div>'
            + '</div>'
            + '<div id="wf-dash-stats-panel-stats" style="' + panelScroll + '; display: ' + (statsTab === 'stats' ? 'flex' : 'none') + ';">'
            + this._statsChartsPanelContentHtml()
            + '</div>'
            + '</div>';
    },

    _statsChartsPanelContentHtml() {
        return ''
            + '<div id="wf-dash-stats-warnings" style="display: none; flex-direction: column; gap: 6px; flex-shrink: 0;"></div>'
            + '<div id="wf-dash-stats-toolbar" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0; min-height: 28px;">'
            + '<div id="wf-dash-stats-scope-summary" style="font-size: 11px; color: var(--muted-foreground, #64748b); min-width: 0;"></div>'
            + '<button type="button" data-wf-dash-stats-build="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="flex-shrink: 0;">Build Chart</button>'
            + '</div>'
            + '<div id="wf-dash-stats-empty" style="display: none; font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0; flex-shrink: 0;"></div>'
            + '<div id="wf-dash-stats-dashboard" style="display: none; flex-direction: column; gap: 12px; flex: 1; min-height: 0;">'
            + '<div id="wf-dash-stats-chart-list" data-wf-dash-stats-chart-list="1" style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 24px;"></div>'
            + '</div>'
            + '<div id="wf-dash-stats-builder" style="display: none; flex-direction: column; gap: 12px; flex-shrink: 0;"></div>';
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
        this._setStatsViewMode('builder');
    },

    _closeStatsBuilder() {
        this._setStatsViewMode('dashboard');
    },

    _saveStatsBuilderDraft() {
        const engine = Context.statsEngine;
        const draft = this._state.statsBuilderDraft;
        if (!engine || !draft) return;
        const items = this._getStatsScopeItems();
        const catalog = engine.buildCatalog(this._statsCatalogCtx(items));
        const validation = engine.validateChart(draft, catalog, items, this._statsCatalogCtx(items));
        if (!validation.ok) {
            Logger.warn('search-output-stats-pane: builder save blocked — missing ' + (validation.missing[0] && validation.missing[0].label));
            this._renderStatsBuilderValidation(validation.missing);
            return;
        }
        const layout = this._ensureStatsLayout();
        const engineMeta = engine.getChartTypeMeta ? engine.getChartTypeMeta(draft.type) : null;
        const chart = {
            id: draft.id || engine.newChartId(),
            title: String(draft.title || 'Chart').trim() || 'Chart',
            type: draft.type || 'pie',
            groupBy: draft.groupBy,
            series: (draft.series || []).map((s) => {
                const entry = {
                    metricId: s.metricId,
                    agg: s.agg,
                    label: s.label || ''
                };
                if (engineMeta && engineMeta.needsRenderAs) {
                    entry.renderAs = s.renderAs === 'line' ? 'line' : 'bar';
                }
                return entry;
            }),
            height: Number(draft.height) || 220,
            presetKey: draft.presetKey || null
        };
        if (engineMeta && engineMeta.needsPointMode) {
            chart.pointMode = draft.pointMode === 'task' ? 'task' : 'bucket';
        }
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
        const tab = this._state.statsTab || 'ratings';
        const toolbar = this._q('#wf-dash-stats-toolbar');
        const buildBtn = this._q('[data-wf-dash-stats-build]');
        const dashEl = this._q('#wf-dash-stats-dashboard');
        const builderEl = this._q('#wf-dash-stats-builder');
        const mode = this._state.statsViewMode || 'dashboard';
        if (toolbar) toolbar.style.display = tab === 'stats' ? 'flex' : 'none';
        if (buildBtn) {
            buildBtn.textContent = mode === 'builder' ? 'Back to dashboard' : 'Build Chart';
        }
        if (dashEl) dashEl.style.display = (tab === 'stats' && mode === 'dashboard') ? 'flex' : 'none';
        if (builderEl) builderEl.style.display = (tab === 'stats' && mode === 'builder') ? 'flex' : 'none';
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
        const tab = this._state.statsTab || 'ratings';
        const useFiltered = this._state.statsUseFiltered !== false;
        const statsCol = this._q('[data-wf-dash-stats-column]');
        const headerActions = statsCol && statsCol.querySelector('[data-wf-dash-stats-header-actions]');
        if (!headerActions) return;
        const wrap = this._ensureStatsScopeToggle(headerActions);
        if (wrap) {
            wrap.style.display = tab === 'stats' ? 'inline-flex' : 'none';
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

    _statsChartTheme() {
        return {
            foreground: this._statsResolvedColor('--foreground', '#0f172a'),
            muted: this._statsResolvedColor('--muted-foreground', '#64748b'),
            border: this._statsResolvedColor('--border', '#e2e8f0'),
            brand: this._statsResolvedColor('--brand', '#2563eb'),
            brandAlt: this._statsResolvedColor('--primary', '#16a34a')
        };
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

    _statsChartCardHtml(chart, validation) {
        const box = this._panelBoxStyle();
        const height = Number(chart.height) || 220;
        const disabled = validation && !validation.ok;
        const missingLabel = disabled && validation.missing[0] ? validation.missing[0].label : '';
        const overlay = disabled
            ? ('<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--card, #fff) 72%, transparent); z-index: 2; padding: 12px; text-align: center;">'
                + '<span style="font-size: 11px; color: var(--muted-foreground, #64748b);">Missing parameter: ' + dashEscHtml(missingLabel) + '</span></div>')
            : '';
        const canvasOpacity = disabled ? ' opacity: 0.35; pointer-events: none;' : '';
        return '<div class="wf-dash-stats-chart-card" data-chart-id="' + dashEscHtml(chart.id) + '" style="' + box + ' padding: 10px 12px; flex-shrink: 0; position: relative;">'
            + '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">'
            + '<span data-wf-dash-stats-chart-drag="' + dashEscHtml(chart.id) + '" title="Drag to reorder" style="cursor: grab; color: var(--muted-foreground, #64748b); font-size: 14px; user-select: none; line-height: 1;">⠿</span>'
            + '<div style="flex: 1; min-width: 0; font-size: 12px; font-weight: 600; color: var(--foreground, #0f172a); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + dashEscHtml(chart.title) + '</div>'
            + '<button type="button" data-wf-dash-stats-chart-edit="' + dashEscHtml(chart.id) + '" class="' + this._dashBtnClass('basic', 'nav') + '" style="padding: 2px 8px; font-size: 10px;">Edit</button>'
            + '<button type="button" data-wf-dash-stats-chart-delete="' + dashEscHtml(chart.id) + '" title="Delete chart" aria-label="Delete chart" style="border: none; background: transparent; color: var(--muted-foreground, #64748b); cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px;">×</button>'
            + '</div>'
            + '<div style="position: relative; height: ' + height + 'px; max-width: 100%;' + canvasOpacity + '">'
            + overlay
            + '<canvas id="wf-dash-stats-canvas-' + dashEscHtml(chart.id) + '" aria-label="' + dashEscHtml(chart.title) + '"></canvas>'
            + '</div>'
            + '</div>';
    },

    _buildChartJsOptions(chart, theme) {
        const baseLegend = {
            position: 'bottom',
            labels: { color: theme.foreground, boxWidth: 12, font: { size: 10 } }
        };
        const type = chart.type;
        if (type === 'pie' || type === 'polarArea') {
            return {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: baseLegend }
            };
        }
        if (type === 'radar') {
            return {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true,
                        ticks: { color: theme.muted, font: { size: 10 }, backdropColor: 'transparent' },
                        grid: { color: theme.border },
                        pointLabels: { color: theme.foreground, font: { size: 10 } }
                    }
                },
                plugins: { legend: baseLegend }
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
            scales: {
                x: {
                    ticks: { color: theme.muted, font: { size: 10 }, maxRotation: 45, minRotation: 0 },
                    grid: { color: theme.border }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: theme.muted, font: { size: 10 } },
                    grid: { color: theme.border }
                }
            },
            plugins: { legend: baseLegend }
        };
    },

    _buildChartJsConfig(chart, aggData, theme) {
        const palette = this._statsPiePalette();
        const type = chart.type;

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
                options: this._buildChartJsOptions(chart, theme)
            };
        }

        if (type === 'pie' || type === 'polarArea') {
            const ds = (aggData.datasets || [])[0] || { label: 'Count', data: [] };
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
                options: this._buildChartJsOptions(chart, theme)
            };
        }

        if (type === 'radar') {
            const datasets = (aggData.datasets || []).map((ds, i) => {
                const color = i === 0 ? theme.brand : (i === 1 ? theme.brandAlt : palette[i % palette.length]);
                return {
                    label: ds.label,
                    data: ds.data,
                    borderColor: color,
                    backgroundColor: color + '33',
                    pointBackgroundColor: color,
                    pointBorderColor: color
                };
            });
            return {
                type: 'radar',
                data: { labels: aggData.labels, datasets },
                options: this._buildChartJsOptions(chart, theme)
            };
        }

        const chartJsType = type === 'combo' ? 'bar' : (type === 'bar' ? 'bar' : 'line');
        const datasets = (aggData.datasets || []).map((ds, i) => {
            const color = i === 0 ? theme.brand : (i === 1 ? theme.brandAlt : palette[i % palette.length]);
            const seriesEntry = (chart.series || [])[i] || {};
            const renderAs = type === 'combo'
                ? (seriesEntry.renderAs === 'line' ? 'line' : 'bar')
                : chartJsType;
            const base = {
                type: renderAs,
                label: ds.label,
                data: ds.data,
                borderColor: color,
                backgroundColor: renderAs === 'line' ? color : color
            };
            if (renderAs === 'line') {
                return Object.assign(base, { tension: 0.2, spanGaps: true, pointRadius: 3, fill: false });
            }
            return base;
        });
        return {
            type: chartJsType,
            data: { labels: aggData.labels, datasets },
            options: this._buildChartJsOptions(chart, theme)
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
        const items = this._getStatsScopeItems();
        const catalog = engine.buildCatalog(this._statsCatalogCtx(items));
        const box = this._panelBoxStyle();
        const fieldLabel = 'font-size: 11px; font-weight: 600; color: var(--foreground, #0f172a); margin-bottom: 4px;';
        const inputStyle = 'width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; background: var(--card, #fff); color: var(--foreground, #0f172a);';
        const dimOpts = catalog.dimensions.map((d) =>
            '<option value="' + dashEscHtml(d.key) + '"' + (draft.groupBy === d.key ? ' selected' : '') + '>' + dashEscHtml(d.label) + '</option>'
        ).join('');
        const typeOpts = catalog.chartTypes.map((t) =>
            '<option value="' + dashEscHtml(t.id) + '"' + (draft.type === t.id ? ' selected' : '') + '>' + dashEscHtml(t.label) + '</option>'
        ).join('');
        const heightOpts = catalog.heightPresets.map((h) =>
            '<option value="' + h.id + '"' + (Number(draft.height) === h.id ? ' selected' : '') + '>' + dashEscHtml(h.label) + '</option>'
        ).join('');
        const typeMeta = engine.getChartTypeMeta ? engine.getChartTypeMeta(draft.type) : { minSeries: 1, maxSeries: 4 };
        const aggList = engine.aggregationsForChartType
            ? engine.aggregationsForChartType(draft.type)
            : catalog.aggregations;
        const pointMode = draft.pointMode === 'task' ? 'task' : 'bucket';
        const pointModeHtml = typeMeta.needsPointMode
            ? ('<div style="flex: 1; min-width: 140px;"><div style="' + fieldLabel + '">Point mode</div>'
                + '<select data-wf-dash-stats-draft="pointMode" style="' + inputStyle + '">'
                + '<option value="bucket"' + (pointMode === 'bucket' ? ' selected' : '') + '>Per bucket</option>'
                + '<option value="task"' + (pointMode === 'task' ? ' selected' : '') + '>Per task</option>'
                + '</select></div>')
            : '';
        const series = draft.series && draft.series.length ? draft.series : [{ metricId: 'count', agg: 'count', label: '' }];
        const maxSeries = typeMeta.maxSeries || 4;
        let seriesHtml = '';
        for (let i = 0; i < Math.min(series.length, maxSeries); i += 1) {
            const s = series[i];
            const metricOpts = catalog.metrics.map((m) =>
                '<option value="' + dashEscHtml(m.id) + '"' + (s.metricId === m.id ? ' selected' : '') + '>' + dashEscHtml(m.label) + '</option>'
            ).join('');
            const aggOpts = aggList.map((a) =>
                '<option value="' + dashEscHtml(a.id) + '"' + (s.agg === a.id ? ' selected' : '') + '>' + dashEscHtml(a.label) + '</option>'
            ).join('');
            const renderAsHtml = typeMeta.needsRenderAs
                ? ('<div style="flex: 0 0 90px;"><div style="' + fieldLabel + '">Render as</div>'
                    + '<select data-wf-dash-stats-draft="series-render" data-series-idx="' + i + '" style="' + inputStyle + '">'
                    + '<option value="bar"' + (s.renderAs !== 'line' ? ' selected' : '') + '>Bar</option>'
                    + '<option value="line"' + (s.renderAs === 'line' ? ' selected' : '') + '>Line</option>'
                    + '</select></div>')
                : '';
            const showRemove = maxSeries > 1 && series.length > typeMeta.minSeries;
            seriesHtml += '<div data-wf-dash-stats-series-row="' + i + '" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; margin-bottom: 8px;">'
                + '<div style="flex: 1; min-width: 120px;"><div style="' + fieldLabel + '">Metric</div>'
                + '<select data-wf-dash-stats-draft="series-metric" data-series-idx="' + i + '" style="' + inputStyle + '">' + metricOpts + '</select></div>'
                + '<div style="flex: 0 0 100px;"><div style="' + fieldLabel + '">Aggregation</div>'
                + '<select data-wf-dash-stats-draft="series-agg" data-series-idx="' + i + '" style="' + inputStyle + '">' + aggOpts + '</select></div>'
                + '<div style="flex: 1; min-width: 120px;"><div style="' + fieldLabel + '">Series label</div>'
                + '<input type="text" data-wf-dash-stats-draft="series-label" data-series-idx="' + i + '" value="' + dashEscHtml(s.label || '') + '" style="' + inputStyle + '"></div>'
                + renderAsHtml
                + (showRemove
                    ? '<button type="button" data-wf-dash-stats-series-remove="' + i + '" class="' + this._dashBtnClass('basic', 'nav') + '" title="Remove series" aria-label="Remove series" style="flex-shrink: 0; min-width: 32px; padding: 6px 8px;">×</button>'
                    : '')
                + '</div>';
        }
        const seriesActions = maxSeries > typeMeta.minSeries && series.length < maxSeries
            ? '<button type="button" data-wf-dash-stats-series-add="1" class="' + this._dashBtnClass('basic', 'nav') + '" style="margin-top: 2px;">Add series</button>'
            : '';
        el.innerHTML = '<div style="' + box + ' padding: 12px; display: flex; flex-direction: column; gap: 10px;">'
            + '<div id="wf-dash-stats-builder-validation" style="display: none; font-size: 11px; color: #dc2626;"></div>'
            + '<div><div style="' + fieldLabel + '">Title</div>'
            + '<input type="text" data-wf-dash-stats-draft="title" value="' + dashEscHtml(draft.title || '') + '" style="' + inputStyle + '"></div>'
            + '<div style="display: flex; gap: 8px; flex-wrap: wrap;">'
            + '<div style="flex: 1; min-width: 100px;"><div style="' + fieldLabel + '">Chart type</div>'
            + '<select data-wf-dash-stats-draft="type" style="' + inputStyle + '">' + typeOpts + '</select></div>'
            + '<div style="flex: 1; min-width: 140px;"><div style="' + fieldLabel + '">Group by</div>'
            + '<select data-wf-dash-stats-draft="groupBy" style="' + inputStyle + '">' + dimOpts + '</select></div>'
            + pointModeHtml
            + '<div style="flex: 1; min-width: 120px;"><div style="' + fieldLabel + '">Height</div>'
            + '<select data-wf-dash-stats-draft="height" style="' + inputStyle + '">' + heightOpts + '</select></div>'
            + '</div>'
            + '<div><div style="' + fieldLabel + '">Series</div>' + seriesHtml + seriesActions + '</div>'
            + '<div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;">'
            + '<button type="button" data-wf-dash-stats-builder-cancel="1" class="' + this._dashBtnClass('basic', 'nav') + '">Cancel</button>'
            + '<button type="button" data-wf-dash-stats-builder-save="1" class="' + this._dashBtnClass('primary', 'nav') + '">Save chart</button>'
            + '</div>'
            + '</div>';
        this._renderStatsBuilderValidation(null);
    },

    _syncStatsBuilderDraftFromForm() {
        const draft = this._state.statsBuilderDraft;
        if (!draft) return;
        const titleEl = this._q('[data-wf-dash-stats-draft="title"]');
        const typeEl = this._q('[data-wf-dash-stats-draft="type"]');
        const groupEl = this._q('[data-wf-dash-stats-draft="groupBy"]');
        const heightEl = this._q('[data-wf-dash-stats-draft="height"]');
        const pointModeEl = this._q('[data-wf-dash-stats-draft="pointMode"]');
        if (titleEl) draft.title = titleEl.value;
        if (typeEl) draft.type = typeEl.value;
        if (groupEl) draft.groupBy = groupEl.value;
        if (heightEl) draft.height = Number(heightEl.value) || 220;
        if (pointModeEl) draft.pointMode = pointModeEl.value === 'task' ? 'task' : 'bucket';
        const series = [];
        this._modal.querySelectorAll('[data-wf-dash-stats-series-row]').forEach((row) => {
            const metricEl = row.querySelector('[data-wf-dash-stats-draft="series-metric"]');
            const aggEl = row.querySelector('[data-wf-dash-stats-draft="series-agg"]');
            const labelEl = row.querySelector('[data-wf-dash-stats-draft="series-label"]');
            const renderEl = row.querySelector('[data-wf-dash-stats-draft="series-render"]');
            if (!metricEl || !aggEl) return;
            const entry = {
                metricId: metricEl.value,
                agg: aggEl.value,
                label: labelEl ? labelEl.value : ''
            };
            if (renderEl) entry.renderAs = renderEl.value === 'line' ? 'line' : 'bar';
            series.push(entry);
        });
        if (series.length) draft.series = series;
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
                    renderAs: draft.series.length === 0 ? 'bar' : 'line'
                });
            }
            if (meta.needsRenderAs) {
                draft.series.forEach((s, i) => {
                    if (!s.renderAs) s.renderAs = i === 0 ? 'bar' : 'line';
                });
            }
            if (meta.needsPointMode && !draft.pointMode) {
                draft.pointMode = 'bucket';
            }
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
            renderAs: draft.series.length === 0 ? 'bar' : 'line'
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
                    const vals = (agg.datasets || []).map((d) => d.label + ' ' + (d.data[i] != null ? d.data[i] : 'n/a')).join(', ');
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

    async _renderStatsPanel() {
        if ((this._state.statsTab || 'ratings') !== 'stats') return;
        if ((this._state.statsViewMode || 'dashboard') === 'builder') {
            this._renderStatsBuilder();
            return;
        }

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

        if (this._state.statsRenderGen !== renderGen || (this._state.statsTab || 'ratings') !== 'stats') {
            return;
        }

        const theme = this._statsChartTheme();
        const charts = {};
        let rendered = 0;
        for (const { chart, validation } of validations) {
            if (!validation.ok) continue;
            const canvas = this._q('#wf-dash-stats-canvas-' + chart.id);
            if (!canvas) continue;
            const aggData = engine.aggregateChart(chart, items, catalog, ctx);
            const hasData = (aggData.points && aggData.points.length) || (aggData.labels && aggData.labels.length);
            if (!hasData) continue;
            const config = this._buildChartJsConfig(chart, aggData, theme);
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
        }
    },

    _syncStatsTabUi() {
        const tab = this._state.statsTab || 'ratings';
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
    },

    _applyStatsPanelLayoutOnOpen(modal) {
        const root = modal && modal.querySelector('[data-wf-dash-split-root][data-wf-dash-split-scope="dashboard"]');
        const dashApi = Context.dashboard;
        if (root && dashApi && typeof dashApi.applyStatsPanelLayout === 'function') {
            dashApi.applyStatsPanelLayout(root);
            this._syncStatsScopeToggleUi();
            return;
        }
        this._syncStatsPanelCollapseUi();
        this._syncStatsScopeToggleUi();
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
        const items = this._state.cachedItems || [];
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

    _buildRatingWorkerProfiles() {
        const committed = this._state.committed || {};
        const ids = committed.authorIds || [];
        const labels = committed.authorLabels || [];
        const tokens = this._state.draftTokens || [];
        const map = {};
        ids.forEach((id, i) => {
            const tok = tokens.find((t) => t.id === id);
            map[id] = {
                name: (tok && (tok.name || tok.label)) || labels[i] || id,
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
            + '<li>Scores use the <strong>committed search window</strong> and <strong>hydrated result cards only</strong> — sidebar filters do <strong>not</strong> change ratings.</li>'
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

    _renderRatingsPanel() {
        const cardsEl = this._q('#wf-dash-ratings-cards');
        const warnEl = this._q('#wf-dash-ratings-warnings');
        if (!cardsEl) return;

        const committed = this._state.committed || {};
        const authorCount = committed.authorCount != null ? committed.authorCount : (committed.authorIds || []).length;
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
            return;
        }

        if (authorCount === 0) {
            cardsEl.innerHTML = '<p style="font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;">Search by specific contributors to generate ratings.</p>';
            this._state.ratingsReport = null;
            return;
        }

        const engine = Context.ratingEngine;
        if (!engine || typeof engine.compute !== 'function') {
            cardsEl.innerHTML = '<p style="font-size: 12px; color: var(--destructive, #dc2626); margin: 0;">Rating engine not loaded. Reload the page and try again.</p>';
            this._state.ratingsReport = null;
            return;
        }

        const report = engine.compute({
            cachedItems: this._state.cachedItems,
            committed,
            workerProfiles: this._buildRatingWorkerProfiles()
        });
        this._state.ratingsReport = report;

        const scoreTypes = this._ratingSearchScoreTypes(committed);

        if (!report.workers || report.workers.length === 0) {
            cardsEl.innerHTML = '<p style="font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;">No contributor ratings available.</p>';
            return;
        }

        cardsEl.innerHTML = report.workers.map((w) => this._ratingWorkerCardHtml(w, scoreTypes)).join('');
        Logger.log('search-output: ratings rendered — ' + report.workers.length + ' worker card(s)');
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
    _version: '4.0',
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
