// ============= fos-iframe-autoconnect.js (library) =============
// Patch FOS env iframe src with noVNC remote-resize and autoconnect params,
// reconnect on tab visibility, and replace the native open-in-new-tab control.

const FOS_AUTOCONNECT_ENV_HOST = /\.env\.[^.]+(?:\.[^.]+)*\.fleetai\.com$/;
const FOS_AUTOCONNECT_OPEN_TAB_MARKER = 'data-fleet-fos-open-tab';
const FOS_AUTOCONNECT_OPEN_PATH_PREFIX = 'M14 4C14 3.44772';
const FOS_AUTOCONNECT_RELOAD_DEBOUNCE_MS = 300;

const FosIframeAutoconnectApi = {
    id: 'fosIframeAutoconnect',

    run(state, options) {
        const opts = options || {};
        if (opts.pluginId) {
            this.id = opts.pluginId;
        }

        this._ensureDesktopSubscription(state);
        this._ensureVisibilityListener(state);
        this._apply(state);
    },

    _apply(state) {
        const iframe = this._findEnvIframe();
        if (!iframe) {
            if (state.hadIframe) {
                Logger.debug('env iframe left DOM');
                state.hadIframe = false;
                state.patchedLogged = false;
                state.waitingFosLogged = false;
                state.waitingIframeLogged = false;
            } else if (!state.waitingIframeLogged) {
                state.waitingIframeLogged = true;
                Logger.debug('waiting for env iframe');
            }
            this._teardownOpenTab(state);
            return;
        }

        state.waitingIframeLogged = false;
        state.hadIframe = true;

        const instanceId = this._instanceIdFromIframe(iframe);
        if (!instanceId || !this._isFosDesktop(instanceId)) {
            if (!state.waitingFosLogged) {
                state.waitingFosLogged = true;
                Logger.debug('waiting for FOS identification');
            }
            this._teardownOpenTab(state);
            return;
        }

        state.waitingFosLogged = false;
        this._patchIframeSrc(state, iframe);
        this._replaceOpenTabButton(state, iframe);
    },

    _ensureDesktopSubscription(state) {
        if (state.desktopUnsub) {
            return;
        }
        const api = Context.fosEmbedded;
        if (!api || typeof api.subscribeDesktop !== 'function') {
            return;
        }
        const self = this;
        state.desktopUnsub = api.subscribeDesktop(() => {
            self._apply(state);
        });
    },

    _ensureVisibilityListener(state) {
        if (state.visibilityInstalled) {
            return;
        }
        state.visibilityInstalled = true;
        state.wasHidden = false;

        const self = this;
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                state.wasHidden = true;
                return;
            }
            if (document.visibilityState !== 'visible' || !state.wasHidden) {
                return;
            }
            state.wasHidden = false;
            if (state.reloadTimer) {
                clearTimeout(state.reloadTimer);
            }
            state.reloadTimer = setTimeout(() => {
                state.reloadTimer = null;
                self._reconnectIframe(state);
            }, FOS_AUTOCONNECT_RELOAD_DEBOUNCE_MS);
        };

        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerEventListener) {
            CleanupRegistry.registerEventListener(document, 'visibilitychange', onVisibility);
        } else {
            document.addEventListener('visibilitychange', onVisibility);
        }
    },

    _isFosDesktop(instanceId) {
        const api = Context.fosEmbedded;
        return !!(api && typeof api.isFosDesktop === 'function' && api.isFosDesktop(instanceId));
    },

    _hostnameFromSrc(raw) {
        if (!raw) {
            return '';
        }
        try {
            return new URL(raw, window.location.href).hostname;
        } catch (_e) {
            return '';
        }
    },

    _findEnvIframe() {
        const frames = document.querySelectorAll('iframe');
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            const host = this._hostnameFromSrc(frame.src || frame.getAttribute('src'));
            if (host && FOS_AUTOCONNECT_ENV_HOST.test(host)) {
                return frame;
            }
        }
        return null;
    },

    _instanceIdFromIframe(iframe) {
        const host = this._hostnameFromSrc(iframe && (iframe.src || iframe.getAttribute('src')));
        return host ? String(host).split('.')[0] || '' : '';
    },

    _withAutoconnectParams(rawUrl) {
        if (!rawUrl) {
            return null;
        }
        try {
            const url = new URL(rawUrl, window.location.href);
            if (!FOS_AUTOCONNECT_ENV_HOST.test(url.hostname)) {
                return null;
            }
            url.searchParams.set('autoconnect', 'true');
            url.searchParams.set('resize', 'remote');
            return url.toString();
        } catch (_e) {
            return null;
        }
    },

    _hasAutoconnectParams(rawUrl) {
        if (!rawUrl) {
            return false;
        }
        try {
            const url = new URL(rawUrl, window.location.href);
            return (
                url.searchParams.get('autoconnect') === 'true' &&
                url.searchParams.get('resize') === 'remote'
            );
        } catch (_e) {
            return false;
        }
    },

    _patchIframeSrc(state, iframe) {
        if (!iframe || state.patchInProgress) {
            return;
        }
        const current = iframe.getAttribute('src') || iframe.src || '';
        if (this._hasAutoconnectParams(current)) {
            return;
        }
        const next = this._withAutoconnectParams(current);
        if (!next || next === current) {
            return;
        }
        state.patchInProgress = true;
        try {
            iframe.setAttribute('src', next);
            iframe.src = next;
            if (!state.patchedLogged) {
                state.patchedLogged = true;
                Logger.log('patched FOS iframe src with autoconnect');
            } else {
                Logger.debug('re-patched FOS iframe src with autoconnect');
            }
        } finally {
            state.patchInProgress = false;
        }
    },

    _reconnectIframe(state) {
        const iframe = this._findEnvIframe();
        if (!iframe || !iframe.isConnected) {
            return;
        }
        const instanceId = this._instanceIdFromIframe(iframe);
        if (!instanceId || !this._isFosDesktop(instanceId)) {
            return;
        }
        const current = iframe.getAttribute('src') || iframe.src || '';
        const next = this._withAutoconnectParams(current);
        if (!next) {
            return;
        }
        state.patchInProgress = true;
        try {
            iframe.src = 'about:blank';
            setTimeout(() => {
                try {
                    if (!iframe.isConnected) {
                        return;
                    }
                    iframe.setAttribute('src', next);
                    iframe.src = next;
                    Logger.log('reconnected FOS iframe after tab focus');
                } finally {
                    state.patchInProgress = false;
                }
            }, 0);
        } catch (err) {
            state.patchInProgress = false;
            Logger.warn('FOS iframe reconnect failed', err);
        }
    },

    _findNativeOpenTabButton() {
        const paths = document.querySelectorAll('svg path');
        for (let i = 0; i < paths.length; i++) {
            const d = paths[i].getAttribute('d') || '';
            if (!d.startsWith(FOS_AUTOCONNECT_OPEN_PATH_PREFIX)) {
                continue;
            }
            const btn = paths[i].closest('button');
            if (btn && !btn.hasAttribute(FOS_AUTOCONNECT_OPEN_TAB_MARKER)) {
                return btn;
            }
        }
        return null;
    },

    _resolveOpenUrl(iframe) {
        if (iframe) {
            const fromIframe = this._withAutoconnectParams(
                iframe.getAttribute('src') || iframe.src || ''
            );
            if (fromIframe) {
                return fromIframe;
            }
        }
        const titled = document.querySelector('div[title^="https://"]');
        if (titled) {
            const title = titled.getAttribute('title') || '';
            if (FOS_AUTOCONNECT_ENV_HOST.test(this._hostnameFromSrc(title))) {
                return this._withAutoconnectParams(title);
            }
        }
        return null;
    },

    _replaceOpenTabButton(state, iframe) {
        const native = this._findNativeOpenTabButton();
        if (!native) {
            if (state.hadOpenBtn && !document.querySelector(`[${FOS_AUTOCONNECT_OPEN_TAB_MARKER}="1"]`)) {
                state.hadOpenBtn = false;
                state.openBtnLogged = false;
                Logger.debug('open-in-new-tab control left DOM');
            }
            return;
        }

        const existing = native.nextElementSibling;
        if (
            existing &&
            existing.getAttribute(FOS_AUTOCONNECT_OPEN_TAB_MARKER) === '1' &&
            existing.isConnected
        ) {
            native.style.display = 'none';
            native.setAttribute('aria-hidden', 'true');
            state.hadOpenBtn = true;
            return;
        }

        document.querySelectorAll(`[${FOS_AUTOCONNECT_OPEN_TAB_MARKER}="1"]`).forEach((el) => {
            el.remove();
        });

        native.style.display = 'none';
        native.setAttribute('aria-hidden', 'true');

        const clone = native.cloneNode(true);
        clone.style.display = '';
        clone.removeAttribute('aria-hidden');
        clone.setAttribute(FOS_AUTOCONNECT_OPEN_TAB_MARKER, '1');
        clone.type = 'button';
        clone.title = 'Open instance in new tab';
        clone.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const liveIframe = this._findEnvIframe();
            const url = this._resolveOpenUrl(liveIframe);
            if (!url) {
                Logger.warn('open in new tab — no FOS instance URL');
                return;
            }
            try {
                const win = window.open(url, '_blank');
                if (!win) {
                    Logger.error('open in new tab blocked by browser');
                    return;
                }
                Logger.log('opened FOS instance in new tab');
            } catch (err) {
                Logger.error('open in new tab failed', err);
            }
        });

        native.insertAdjacentElement('afterend', clone);
        state.hadOpenBtn = true;
        if (!state.openBtnLogged) {
            state.openBtnLogged = true;
            Logger.log('replaced open-in-new-tab with autoconnect URL');
        } else {
            Logger.debug('re-injected open-in-new-tab control');
        }
    },

    _teardownOpenTab(state) {
        document.querySelectorAll(`[${FOS_AUTOCONNECT_OPEN_TAB_MARKER}="1"]`).forEach((el) => {
            el.remove();
        });
        if (state.hadOpenBtn) {
            state.hadOpenBtn = false;
            state.openBtnLogged = false;
        }
    }
};

const plugin = {
    id: 'fosIframeAutoconnectLib',
    name: 'FOS Viewport Resize (library)',
    description:
        'Resizes embedded FOS environments to the viewport. Autoconnects instances and open-in-new-tab URLs; reconnects on tab focus',
    _version: '1.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.fosIframeAutoconnect = {
            run: (s, options) => {
                const impl = Object.create(FosIframeAutoconnectApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }
                return FosIframeAutoconnectApi.run.call(impl, s, options);
            }
        };
        if (!state.registered) {
            Logger.log('fosIframeAutoconnectLib: module registered (Context.fosIframeAutoconnect)');
            state.registered = true;
        }
    }
};
