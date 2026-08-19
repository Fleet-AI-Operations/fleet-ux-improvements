// ============= prefetch-output-tabs.js =============
// Ops Dashboard tabs: Disputes and Sr Review inventories from session prefetch.

const plugin = {
    id: 'prefetch-output-tabs',
    name: 'Prefetch Output Tabs',
    description: 'Disputes and Sr Review inventory tabs',
    _version: '1.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        if (state && state.registered) {
            Logger.debug('tabs already registered — skipping re-init');
            return;
        }
        const dashApi = Context.dashboard;
        const loader = dashApi && dashApi._loader;
        if (!loader) {
            const err = new Error('prefetch-output-tabs: dashboard loader not registered');
            Logger.error(err.message);
            throw err;
        }
        if (typeof loader._activatePrefetchInventoryTab !== 'function'
            || typeof loader._searchPanelHtml !== 'function') {
            const err = new Error('prefetch-output-tabs: search-output inventory API missing');
            Logger.error(err.message);
            throw err;
        }

        const registerInventoryTab = (id, label, emptyStatus) => {
            Context.dashboard.registerTab({
                id,
                label,
                panelHtml(dash) {
                    return dash._searchPanelHtml({
                        wsId: id,
                        hideSearch: true,
                        statsTabs: ['chat'],
                        splitScope: id,
                        emptyStatus
                    });
                },
                attachListeners(_modal, _dash) {
                    // Shared Search Output listeners cover inventory panels.
                },
                onBuilt(modal, dash) {
                    dash._withOutputWs(id, () => {
                        dash._state.leftTab = 'filters';
                        dash._state.statsTab = 'chat';
                        dash._syncLeftTabUi();
                        dash._syncStatsTabUi();
                        dash._updateResultsStatus();
                        const pagePref = dash._readResultsPageSizePref();
                        dash._state.resultsPageSize = pagePref === 'all'
                            ? 'all'
                            : (Number(pagePref) || 100);
                        dash._state.resultsPage = 0;
                        dash._syncResultsPageSizeUi();
                        dash._syncResultsPagerUi();
                        if (typeof dash._applyStatsPanelLayoutOnOpen === 'function') {
                            dash._applyStatsPanelLayoutOnOpen(modal);
                        }
                        if (typeof dash._applyResultsPanelLayoutOnOpen === 'function') {
                            dash._applyResultsPanelLayoutOnOpen(modal);
                        }
                    });
                },
                onActivate(modal, dash) {
                    void dash._activatePrefetchInventoryTab(id);
                },
                onOpen(dash) {
                    void dash._activatePrefetchInventoryTab(id);
                }
            });
            Logger.log('tab registered — ' + id);
        };

        registerInventoryTab('disputes', 'Disputes', 'Waiting for dispute prefetch…');
        registerInventoryTab('sr-review', 'Sr Review', 'Waiting for Sr Review flag prefetch…');

        if (state) state.registered = true;
        Logger.log('prefetch inventory tabs registered');
    }
};
