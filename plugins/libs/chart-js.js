// chart-js.js
// Lazy-loads Chart.js from jsDelivr for dashboard stats charts.

const CHART_JS_VERSION = '4.4.9';
const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js@' + CHART_JS_VERSION + '/dist/chart.umd.min.js';

function chartJsGmFetchText(url) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url,
            onload(response) {
                if (response.status === 200) {
                    resolve(response.responseText);
                } else {
                    reject(new Error('HTTP ' + response.status + ' for ' + url));
                }
            },
            onerror(error) {
                reject(error || new Error('Network error for ' + url));
            }
        });
    });
}

const plugin = {
    id: 'chart-js',
    name: 'Chart.js Loader',
    description: 'Lazy-loads Chart.js from jsDelivr for Worker Output Search stats charts',
    _version: '2.0',
    phase: 'core',
    enabledByDefault: true,

    _chartJs: null,
    _loadPromise: null,
    _loadFailed: false,

    init() {
        const self = this;
        Context.chartJs = {
            isReady: () => !!self._chartJs,
            ensureLoaded: () => self._ensureChartJsLoaded()
        };
        Logger.log('chart-js: module registered (Context.chartJs)');
    },

    async _ensureChartJsLoaded() {
        if (this._chartJs) return this._chartJs;
        if (this._loadFailed) {
            throw new Error('chart-js: previous load failed');
        }
        if (this._loadPromise) return this._loadPromise;

        this._loadPromise = (async () => {
            try {
                Logger.debug('chart-js: fetching Chart.js v' + CHART_JS_VERSION + ' from jsDelivr');
                const chartJs = await chartJsGmFetchText(CHART_JS_URL);
                const loadChart = new Function(
                    chartJs + '\nreturn typeof Chart !== "undefined" ? Chart : null;'
                );
                const instance = loadChart();
                if (!instance) {
                    throw new Error('chart-js: Chart global missing after load');
                }
                this._chartJs = instance;
                Logger.info('chart-js: loaded v' + CHART_JS_VERSION);
                return this._chartJs;
            } catch (err) {
                this._loadFailed = true;
                Logger.warn('chart-js: load failed — stats charts unavailable', err);
                throw err;
            } finally {
                this._loadPromise = null;
            }
        })();

        return this._loadPromise;
    }
};
