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
            + '<p style="font-size: 12px; color: var(--muted-foreground, #64748b); margin: 0;">Coming Soon to Videocassette</p>'
            + '</div>'
            + '</div>';
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
            return;
        }
        this._syncStatsPanelCollapseUi();
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
    _version: '1.2',
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
