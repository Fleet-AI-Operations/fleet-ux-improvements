// ============= deep-chat-lib.js (library) =============
// Lazy-loads the Deep Chat Web Component from jsDelivr (same GM fetch +
// eval pattern as chart-js.js). Strips the ESM export so the IIFE-style
// bundle can run under new Function in the Tampermonkey host.

const DEEP_CHAT_VERSION = '2.4.2';
const DEEP_CHAT_URL = 'https://cdn.jsdelivr.net/npm/deep-chat@'
    + DEEP_CHAT_VERSION + '/dist/deepChat.bundle.js';
const PLUGIN_ID = 'deep-chat-lib';

function deepChatGmFetchText(url) {
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

function deepChatStripEsmExport(source) {
    return String(source || '').replace(/;?\s*export\{[^}]+\};?\s*$/, '');
}

const plugin = {
    id: 'deepChatLib',
    name: 'Deep Chat (library)',
    description: 'Lazy-loads the Deep Chat Web Component for shared AI chat UI',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,

    _ready: false,
    _loadPromise: null,
    _loadFailed: false,

    init() {
        const self = this;
        Context.deepChat = {
            VERSION: DEEP_CHAT_VERSION,
            isReady: () => !!self._ready && !!customElements.get('deep-chat'),
            ensureLoaded: () => self._ensureLoaded()
        };
        Logger.log(PLUGIN_ID + ': module registered (Context.deepChat) v1.0'
            + ' · deep-chat@' + DEEP_CHAT_VERSION);
    },

    async _ensureLoaded() {
        if (this._ready && customElements.get('deep-chat')) return true;
        if (this._loadFailed) {
            throw new Error(PLUGIN_ID + ': previous load failed');
        }
        if (this._loadPromise) return this._loadPromise;

        this._loadPromise = (async () => {
            try {
                if (customElements.get('deep-chat')) {
                    this._ready = true;
                    Logger.debug(PLUGIN_ID + ': custom element already defined');
                    return true;
                }
                Logger.debug(PLUGIN_ID + ': fetching deep-chat@' + DEEP_CHAT_VERSION);
                const source = await deepChatGmFetchText(DEEP_CHAT_URL);
                const cleaned = deepChatStripEsmExport(source);
                if (!cleaned || cleaned.indexOf('customElements.define("deep-chat"') === -1) {
                    throw new Error(PLUGIN_ID + ': unexpected deep-chat bundle contents');
                }
                // eslint-disable-next-line no-new-func
                new Function(cleaned)();
                if (!customElements.get('deep-chat')) {
                    throw new Error(PLUGIN_ID + ': deep-chat custom element missing after load');
                }
                this._ready = true;
                Logger.info(PLUGIN_ID + ': loaded deep-chat@' + DEEP_CHAT_VERSION);
                return true;
            } catch (err) {
                this._loadFailed = true;
                Logger.error(PLUGIN_ID + ': load failed', err);
                throw err;
            } finally {
                this._loadPromise = null;
            }
        })();

        return this._loadPromise;
    }
};
