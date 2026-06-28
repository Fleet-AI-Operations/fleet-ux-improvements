// highlight-js.js
// Lazy-loads highlight.js (Python) from jsDelivr for read-only code blocks.

const HLJS_VERSION = '11.11.1';
const HLJS_BASE = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@' + HLJS_VERSION + '/build';
const HLJS_CORE_URL = HLJS_BASE + '/highlight.min.js';
const HLJS_PYTHON_URL = HLJS_BASE + '/languages/python.min.js';
const HLJS_THEMES = {
    light: HLJS_BASE + '/styles/github.min.css',
    dark: HLJS_BASE + '/styles/github-dark.min.css'
};
const HLJS_THEME_PREF_KEY = 'fleet-ux:hljs-theme';
const HLJS_ROOT_CLASS = 'wf-hljs-root';
const HLJS_THEME_ATTR = 'data-wf-hljs-theme';
const HLJS_STYLE_ID = 'wf-fleet-hljs-theme';
/** Appended after theme CSS so code blocks inherit the host surface background. */
const HLJS_THEME_OVERRIDES =
    '\nhtml[' + HLJS_THEME_ATTR + '] code.' + HLJS_ROOT_CLASS + '.hljs{background:transparent!important}' +
    '\nhtml[' + HLJS_THEME_ATTR + '] pre code.' + HLJS_ROOT_CLASS + '.hljs{padding:0;background:transparent!important}';

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
    [HLJS_THEMES.light]: '',
    [HLJS_THEMES.dark]: ''
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

function readHljsThemePref() {
    try {
        const stored = Storage.getData(HLJS_THEME_PREF_KEY, null);
        if (stored === 'light' || stored === 'dark') return stored;
    } catch (_e) { /* ignore */ }
    try {
        if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch (_e) { /* ignore */ }
    return 'light';
}

function writeHljsThemePref(theme) {
    try {
        Storage.setData(HLJS_THEME_PREF_KEY, theme);
    } catch (err) {
        Logger.warn('highlight-js: failed to write theme pref', err);
    }
}

const plugin = {
    id: 'highlight-js',
    name: 'Highlight.js Loader',
    description: 'Lazy-loads highlight.js from jsDelivr for Python syntax highlighting',
    _version: '1.5',
    phase: 'core',
    enabledByDefault: true,

    _hljs: null,
    _loadPromise: null,
    _loadFailed: false,
    _styleInjected: false,
    _activeTheme: null,

    init() {
        const self = this;
        this._applyThemeToDocument(readHljsThemePref());
        Context.highlightJs = {
            isReady: () => !!self._hljs,
            getTheme: () => self._activeTheme || readHljsThemePref(),
            setTheme: (theme) => self._setTheme(theme),
            ensureLoaded: () => self._ensureHighlightJsLoaded(),
            highlightCodeElement: (codeEl, options) => self._highlightCodeElement(codeEl, options),
            setPlainCode: (codeEl, text) => self._setPlainCode(codeEl, text)
        };
        Logger.log('highlight-js: module registered (Context.highlightJs)');
    },

    _applyThemeToDocument(theme) {
        const next = theme === 'dark' ? 'dark' : 'light';
        this._activeTheme = next;
        try {
            document.documentElement.setAttribute(HLJS_THEME_ATTR, next);
        } catch (err) {
            Logger.warn('highlight-js: failed to apply theme attribute', err);
        }
    },

    async _setTheme(theme) {
        const next = theme === 'dark' ? 'dark' : 'light';
        if (next === this._activeTheme) return next;
        this._applyThemeToDocument(next);
        writeHljsThemePref(next);
        Logger.log('highlight-js: theme set to ' + next);
        await this._refreshAllHighlighted();
        return next;
    },

    async _refreshAllHighlighted() {
        const nodes = document.querySelectorAll('code.' + HLJS_ROOT_CLASS);
        for (const el of nodes) {
            const text = el.textContent || '';
            const language = el.getAttribute('data-wf-hljs-lang') || 'python';
            await this._highlightCodeElement(el, { text, language });
        }
        const modal = document.getElementById('wf-dash-modal');
        const ops = Context.opsTab;
        if (modal && ops && typeof ops._refreshVerifierOutputDisplay === 'function') {
            await ops._refreshVerifierOutputDisplay(modal);
        }
    },

    async _ensureHighlightJsLoaded() {
        if (this._hljs) return this._hljs;
        if (this._loadFailed) {
            throw new Error('highlight-js: previous load failed');
        }
        if (this._loadPromise) return this._loadPromise;

        this._loadPromise = (async () => {
            try {
                Logger.debug('highlight-js: fetching core + python + themes from jsDelivr');
                const [coreJs, pythonJs, lightCss, darkCss] = await Promise.all([
                    gmFetchTextVerified(HLJS_CORE_URL),
                    gmFetchTextVerified(HLJS_PYTHON_URL),
                    gmFetchTextVerified(HLJS_THEMES.light),
                    gmFetchTextVerified(HLJS_THEMES.dark)
                ]);
                const loadHljs = new Function(
                    coreJs + '\n' + pythonJs + '\nreturn typeof hljs !== "undefined" ? hljs : null;'
                );
                const instance = loadHljs();
                if (!instance) {
                    throw new Error('highlight-js: hljs global missing after load');
                }
                this._injectThemeStylesheets({ light: lightCss, dark: darkCss });
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

    _stripCssComments(css) {
        return css.replace(/\/\*[\s\S]*?\*\//g, '');
    },

    /**
     * Maps a hljs theme selector onto our scoped root so token colours win over page stylesheets.
     */
    _scopeHljsSelector(scopeBase, selector) {
        return selector.split(',').map((part) => {
            const sel = part.trim();
            if (!sel) return sel;
            if (/^pre\s+code\.hljs\b/.test(sel) || /^code\.hljs\b/.test(sel) || sel === '.hljs') {
                return scopeBase + '.hljs';
            }
            if (sel.startsWith('.hljs')) {
                return scopeBase + ' ' + sel;
            }
            return scopeBase + ' ' + sel;
        }).join(', ');
    },

    _scopeHljsCss(css, scopeBase) {
        const stripped = this._stripCssComments(css);
        return stripped.replace(/([^{}]+)\{([^{}]*)\}/g, (_match, rawSel, body) => {
            const trimmed = rawSel.trim();
            if (!trimmed || trimmed.startsWith('@')) return trimmed + '{' + body + '}';
            return this._scopeHljsSelector(scopeBase, trimmed) + '{' + body + '}';
        });
    },

    _injectThemeStylesheets(themeCssByName) {
        if (this._styleInjected || !themeCssByName) return;
        if (document.getElementById(HLJS_STYLE_ID)) {
            this._styleInjected = true;
            return;
        }
        const chunks = [];
        for (const themeName of ['light', 'dark']) {
            const cssText = themeCssByName[themeName];
            if (!cssText) continue;
            const scopeBase = 'html[' + HLJS_THEME_ATTR + '="' + themeName + '"] code.' + HLJS_ROOT_CLASS;
            chunks.push(this._scopeHljsCss(cssText, scopeBase));
        }
        const style = document.createElement('style');
        style.id = HLJS_STYLE_ID;
        style.textContent = chunks.join('') + HLJS_THEME_OVERRIDES;
        document.head.appendChild(style);
        this._styleInjected = true;
        CleanupRegistry.registerElement(style);
    },

    _setPlainCode(codeEl, text) {
        if (!codeEl) return;
        codeEl.textContent = text || '';
        codeEl.className = HLJS_ROOT_CLASS + ' language-plaintext';
        codeEl.removeAttribute('data-highlighted');
        codeEl.removeAttribute('data-wf-hljs-lang');
    },

    async _highlightCodeElement(codeEl, options) {
        const text = options && options.text != null ? options.text : (codeEl ? codeEl.textContent : '');
        const language = (options && options.language) || 'python';
        if (!codeEl) return false;

        this._applyThemeToDocument(readHljsThemePref());
        this._setPlainCode(codeEl, text);
        if (!text) return true;

        try {
            const hljs = await this._ensureHighlightJsLoaded();
            codeEl.className = HLJS_ROOT_CLASS + ' language-' + language;
            codeEl.setAttribute('data-wf-hljs-lang', language);
            codeEl.removeAttribute('data-highlighted');
            hljs.highlightElement(codeEl);
            // Strip language-* class so page-level Prism.js or other auto-highlighters
            // do not re-process this element and overwrite the token colours.
            codeEl.className = (codeEl.className || '')
                .replace(/\blanguage-\S+/g, '')
                .trim() || (HLJS_ROOT_CLASS + ' hljs');
            if (!codeEl.classList.contains(HLJS_ROOT_CLASS)) {
                codeEl.classList.add(HLJS_ROOT_CLASS);
            }
            return true;
        } catch (err) {
            this._setPlainCode(codeEl, text);
            Logger.warn('highlight-js: highlight failed — showing plain text', err);
            return false;
        }
    }
};
