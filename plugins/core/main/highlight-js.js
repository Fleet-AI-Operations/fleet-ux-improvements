// highlight-js.js
// Lazy-loads highlight.js (Python) from jsDelivr for read-only code blocks.

const HLJS_VERSION = '11.11.1';
const HLJS_BASE = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@' + HLJS_VERSION + '/build';
const HLJS_CORE_URL = HLJS_BASE + '/highlight.min.js';
const HLJS_PYTHON_URL = HLJS_BASE + '/languages/python.min.js';
// Theme: pick any valid hljs styles/ filename. Options include 'github.min.css' (light),
// 'github-dark.min.css' (dark), 'atom-one-dark.min.css', 'monokai.min.css', etc.
const HLJS_THEME = 'github-dark.min.css';
const HLJS_THEME_URL = HLJS_BASE + '/styles/' + HLJS_THEME;
/**
 * Scope selector prepended to every injected theme rule. This bumps specificity above any
 * page-level hljs stylesheet the host app may load, preventing colour bleed-through.
 */
const HLJS_CSS_SCOPE = '#wf-dash-modal';
const HLJS_STYLE_ID = 'wf-fleet-hljs-theme';
/** Appended after theme CSS so code blocks inherit the host surface background. */
const HLJS_THEME_OVERRIDES =
    '\n' + HLJS_CSS_SCOPE + ' .hljs{background:transparent!important}' +
    '\n' + HLJS_CSS_SCOPE + ' pre code.hljs{padding:0;background:transparent!important}';

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

/**
 * Known SHA-256 hashes (hex) for HLJS_VERSION = '11.11.1'. Update when bumping HLJS_VERSION.
 * If empty string, verification is skipped for that asset (warns once in console).
 */
const HLJS_EXPECTED_HASHES = {
    [HLJS_CORE_URL]: '',
    [HLJS_PYTHON_URL]: '',
    [HLJS_THEME_URL]: '', // update hash here when bumping HLJS_THEME or HLJS_VERSION
};

async function sha256hex(text) {
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
        return null;
    }
}

async function gmFetchTextVerified(url) {
    const text = await gmFetchText(url);
    const expected = HLJS_EXPECTED_HASHES[url];
    if (expected === undefined) return text;
    const actual = await sha256hex(text);
    if (!expected) {
        if (actual) Logger.debug('highlight-js: unverified asset ' + url + ' (sha256=' + actual + ')');
        return text;
    }
    if (actual !== expected) {
        throw new Error('highlight-js: integrity check failed for ' + url + ' (expected ' + expected + ', got ' + actual + ')');
    }
    return text;
}

const plugin = {
    id: 'highlight-js',
    name: 'Highlight.js Loader',
    description: 'Lazy-loads highlight.js from jsDelivr for Python syntax highlighting',
    _version: '1.4',
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
                    gmFetchTextVerified(HLJS_CORE_URL),
                    gmFetchTextVerified(HLJS_PYTHON_URL),
                    gmFetchTextVerified(HLJS_THEME_URL)
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

    /**
     * Prefixes every CSS selector in `css` with `scope` so our theme rules have
     * higher specificity than any page-level hljs stylesheet. Skips @-rules.
     */
    _scopeHljsCss(css, scope) {
        return css.replace(/([^{}]+?)\{([^{}]*)\}/g, (_match, rawSel, body) => {
            const trimmed = rawSel.trim();
            if (!trimmed || trimmed.startsWith('@')) return trimmed + '{' + body + '}';
            const prefixed = trimmed.split(',')
                .map(s => { const t = s.trim(); return t ? scope + ' ' + t : t; })
                .join(',');
            return prefixed + '{' + body + '}';
        });
    },

    _injectThemeStylesheet(cssText) {
        if (this._styleInjected || !cssText) return;
        if (document.getElementById(HLJS_STYLE_ID)) {
            this._styleInjected = true;
            return;
        }
        const style = document.createElement('style');
        style.id = HLJS_STYLE_ID;
        style.textContent = this._scopeHljsCss(cssText, HLJS_CSS_SCOPE) + HLJS_THEME_OVERRIDES;
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
            // Strip language-* class so page-level Prism.js or other auto-highlighters
            // do not re-process this element and overwrite the token colours.
            codeEl.className = (codeEl.className || '').replace(/\blanguage-\S+/g, '').trim() || 'hljs';
            return true;
        } catch (err) {
            this._setPlainCode(codeEl, text);
            Logger.warn('highlight-js: highlight failed — showing plain text', err);
            return false;
        }
    }
};
