// highlight-js.js
// Lazy-loads highlight.js (Python) from jsDelivr for read-only code blocks.

const HLJS_VERSION = '11.11.1';
const HLJS_BASE = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@' + HLJS_VERSION + '/build';
const HLJS_CORE_URL = HLJS_BASE + '/highlight.min.js';
const HLJS_PYTHON_URL = HLJS_BASE + '/languages/python.min.js';
const HLJS_THEME_URL = HLJS_BASE + '/styles/github.min.css';
const HLJS_STYLE_ID = 'wf-fleet-hljs-theme';

function gmFetchText(url) {
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
    id: 'highlight-js',
    name: 'Highlight.js Loader',
    description: 'Lazy-loads highlight.js from jsDelivr for Python syntax highlighting',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,

    _hljs: null,
    _loadPromise: null,
    _loadFailed: false,
    _styleInjected: false,

    init() {
        const self = this;
        Context.highlightJs = {
            isReady: () => !!self._hljs,
            ensureLoaded: () => self._ensureHighlightJsLoaded(),
            highlightCodeElement: (codeEl, options) => self._highlightCodeElement(codeEl, options),
            setPlainCode: (codeEl, text) => self._setPlainCode(codeEl, text)
        };
        Logger.log('highlight-js: module registered (Context.highlightJs)');
    },

    async _ensureHighlightJsLoaded() {
        if (this._hljs) return this._hljs;
        if (this._loadFailed) {
            throw new Error('highlight-js: previous load failed');
        }
        if (this._loadPromise) return this._loadPromise;

        this._loadPromise = (async () => {
            try {
                Logger.debug('highlight-js: fetching core + python from jsDelivr');
                const [coreJs, pythonJs, themeCss] = await Promise.all([
                    gmFetchText(HLJS_CORE_URL),
                    gmFetchText(HLJS_PYTHON_URL),
                    gmFetchText(HLJS_THEME_URL)
                ]);
                const loadHljs = new Function(
                    coreJs + '\n' + pythonJs + '\nreturn typeof hljs !== "undefined" ? hljs : null;'
                );
                const instance = loadHljs();
                if (!instance) {
                    throw new Error('highlight-js: hljs global missing after load');
                }
                this._injectThemeStylesheet(themeCss);
                this._hljs = instance;
                Logger.info('highlight-js: loaded v' + HLJS_VERSION);
                return this._hljs;
            } catch (err) {
                this._loadFailed = true;
                Logger.warn('highlight-js: load failed — code blocks will use plain text', err);
                throw err;
            } finally {
                this._loadPromise = null;
            }
        })();

        return this._loadPromise;
    },

    _injectThemeStylesheet(cssText) {
        if (this._styleInjected || !cssText) return;
        if (document.getElementById(HLJS_STYLE_ID)) {
            this._styleInjected = true;
            return;
        }
        const style = document.createElement('style');
        style.id = HLJS_STYLE_ID;
        style.textContent = cssText;
        document.head.appendChild(style);
        this._styleInjected = true;
        CleanupRegistry.registerElement(style);
    },

    _setPlainCode(codeEl, text) {
        if (!codeEl) return;
        codeEl.textContent = text || '';
        codeEl.className = 'language-plaintext';
        codeEl.removeAttribute('data-highlighted');
    },

    async _highlightCodeElement(codeEl, options) {
        const text = options && options.text != null ? options.text : (codeEl ? codeEl.textContent : '');
        const language = (options && options.language) || 'python';
        if (!codeEl) return false;

        this._setPlainCode(codeEl, text);
        if (!text) return true;

        try {
            const hljs = await this._ensureHighlightJsLoaded();
            codeEl.className = 'language-' + language;
            codeEl.removeAttribute('data-highlighted');
            hljs.highlightElement(codeEl);
            return true;
        } catch (err) {
            this._setPlainCode(codeEl, text);
            Logger.warn('highlight-js: highlight failed — showing plain text', err);
            return false;
        }
    }
};
