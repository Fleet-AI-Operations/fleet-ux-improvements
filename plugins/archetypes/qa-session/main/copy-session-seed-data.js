// ============= copy-session-seed-data.js =============
// Session Trace Review: capture instance_join from GET /rest/v1/sessions?... (same as the app),
// then show "Copy Seed Data" (pretty-printed JSON) in the top bar next to Skip / View Task.
//
// Phase "early" wraps fetch/XHR before most page requests. If the session request already finished,
// a one-shot fallback fetch runs (captured apikey/auth headers or localStorage).

const COPY_SEED_ATTR = 'data-fleet-session-copy-seed-data';

const plugin = {
    id: 'sessionTraceCopySeedData',
    name: 'Session Trace Copy Seed Data',
    description:
        'Adds Copy Seed Data (instance_join JSON) in the top bar from the sessions API (network capture + optional fallback)',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'early',

    initialState: {
        interceptionInstalled: false,
        instanceJoin: null,
        instanceJoinSerialized: '',
        sessionIdFromUrl: '',
        missingLogged: false,
        copySeedLogged: false,
        seedCopyFeedbackTimeoutId: null,
        fallbackStarted: false,
        fallbackDone: false,
        diagLogged: false,
        domObserver: null,
        popstateBound: false
    },

    getSessionIdFromLocation() {
        const m = String(location.pathname || '').match(
            /\/work\/problems\/qa-session\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
        );
        return m ? m[1].toLowerCase() : '';
    },

    searchHasSessionIdEq(search, sessionId) {
        const s = String(search || '').toLowerCase();
        const id = String(sessionId || '').toLowerCase();
        return s.includes(`id=eq.${id}`);
    },

    matchesSessionsDetailRequest(urlStr, sessionId) {
        if (!sessionId) return false;
        try {
            const u = new URL(urlStr);
            if (u.hostname !== 'api.fleetai.com') return false;
            if (!u.pathname.includes('/rest/v1/sessions')) return false;
            return this.searchHasSessionIdEq(u.search, sessionId);
        } catch (e) {
            return false;
        }
    },

    extractInstanceJoin(payload) {
        if (!payload || typeof payload !== 'object') return null;
        const j = payload.instance_join;
        if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
        return j;
    },

    getSupabaseAccessToken(pageWindow) {
        try {
            const ls = pageWindow.localStorage;
            for (let i = 0; i < ls.length; i++) {
                const k = ls.key(i);
                if (!k || !k.startsWith('sb-') || !k.includes('auth-token')) continue;
                const raw = ls.getItem(k);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                const tok =
                    parsed?.access_token ||
                    parsed?.currentSession?.access_token ||
                    parsed?.session?.access_token;
                if (typeof tok === 'string' && tok.length > 0) return tok;
            }
        } catch (e) {
            Logger.debug('session-trace-copy-seed: localStorage token read failed', e);
        }
        return '';
    },

    captureFetchAuth(pageWindow, config) {
        if (!config || !config.headers) return;
        try {
            const H = pageWindow.Headers;
            let h;
            if (config.headers instanceof H) {
                h = config.headers;
            } else if (typeof config.headers === 'object') {
                h = new H();
                for (const [k, v] of Object.entries(config.headers)) {
                    if (v != null) h.set(k, String(v));
                }
            } else {
                return;
            }
            const apikey = h.get('apikey');
            if (apikey && !pageWindow.__fleetSessionTraceCapturedApikey) {
                pageWindow.__fleetSessionTraceCapturedApikey = apikey;
            }
            const auth = h.get('authorization');
            if (auth && !pageWindow.__fleetSessionTraceCapturedAuth) {
                pageWindow.__fleetSessionTraceCapturedAuth = auth;
            }
        } catch (e) {
            Logger.debug('session-trace-copy-seed: header capture failed', e);
        }
    },

    maybeDiagSessionsUrl(state, urlStr, sessionId) {
        if (state.diagLogged) return;
        try {
            const u = new URL(urlStr);
            if (u.hostname !== 'api.fleetai.com') return;
            if (!u.pathname.includes('/rest/v1/sessions')) return;
            if (!sessionId) return;
            if (this.matchesSessionsDetailRequest(urlStr, sessionId)) return;
            state.diagLogged = true;
            Logger.debug(
                `session-trace-copy-seed: saw sessions request with different filter (expected id=eq.${sessionId}); sample URL logged once`,
                u.href
            );
        } catch (e) {
            /* ignore */
        }
    },

    onInstanceJoinReady(state, pageWindow) {
        const self = this;
        const tick = () => {
            try {
                self.ensureCopySeedButton(state);
            } catch (e) {
                Logger.error('session-trace-copy-seed: ensure copy button failed', e);
            }
        };
        pageWindow.requestAnimationFrame(tick);
    },

    applySessionPayload(state, pageWindow, payload) {
        const sid = this.getSessionIdFromLocation();
        if (!sid) return;

        const inst = this.extractInstanceJoin(payload);
        if (!inst) return;

        const serialized = JSON.stringify(inst);
        if (state.instanceJoinSerialized === serialized) return;

        state.instanceJoin = inst;
        state.instanceJoinSerialized = serialized;
        Logger.log('session-trace-copy-seed: captured instance_join for seed data');
        this.onInstanceJoinReady(state, pageWindow);
    },

    installInterception(context, state) {
        const pageWindow = context.getPageWindow();
        if (pageWindow.__fleetSessionTraceCopySeedInterceptionInstalled) {
            state.interceptionInstalled = true;
            return;
        }
        pageWindow.__fleetSessionTraceCopySeedInterceptionInstalled = true;

        const self = this;

        const tryParseResponse = async (response, urlStr, method) => {
            const sid = self.getSessionIdFromLocation();
            if (!sid || !self.matchesSessionsDetailRequest(urlStr, sid)) return;
            if (String(method || 'GET').toUpperCase() !== 'GET') return;
            if (!response || !response.ok) return;
            try {
                const clone = response.clone();
                const data = await clone.json();
                self.applySessionPayload(state, pageWindow, data);
            } catch (e) {
                Logger.debug('session-trace-copy-seed: failed to parse sessions JSON (fetch)', e);
            }
        };

        const originalFetch = pageWindow.fetch;
        if (typeof originalFetch === 'function') {
            pageWindow.fetch = function (...args) {
                const [resource, config] = args;
                let url;
                try {
                    url = new URL(resource, pageWindow.location.href);
                } catch (e) {
                    url = { href: String(resource), pathname: '' };
                }
                const method = config && config.method ? String(config.method) : 'GET';
                self.captureFetchAuth(pageWindow, config);
                if (
                    url.hostname === 'api.fleetai.com' &&
                    url.pathname.includes('/rest/v1/sessions') &&
                    self.getSessionIdFromLocation()
                ) {
                    self.maybeDiagSessionsUrl(state, url.href, self.getSessionIdFromLocation());
                }
                const out = originalFetch.apply(this, args);
                if (self.matchesSessionsDetailRequest(url.href, self.getSessionIdFromLocation())) {
                    return out.then((response) => {
                        tryParseResponse(response, url.href, method);
                        return response;
                    });
                }
                return out;
            };
        }

        const originalXHROpen = pageWindow.XMLHttpRequest.prototype.open;
        const originalXHRSend = pageWindow.XMLHttpRequest.prototype.send;
        pageWindow.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this._fleetSessionTraceCopySeedURL = url;
            this._fleetSessionTraceCopySeedMethod = method;
            return originalXHROpen.apply(this, [method, url, ...rest]);
        };
        pageWindow.XMLHttpRequest.prototype.send = function (body) {
            const url = this._fleetSessionTraceCopySeedURL;
            const method = this._fleetSessionTraceCopySeedMethod || 'GET';
            const sid = self.getSessionIdFromLocation();
            if (sid && self.matchesSessionsDetailRequest(url, sid) && String(method).toUpperCase() === 'GET') {
                this.addEventListener('load', function () {
                    try {
                        const text = this.responseText;
                        if (!text) return;
                        const data = JSON.parse(text);
                        self.applySessionPayload(state, pageWindow, data);
                    } catch (e) {
                        Logger.debug('session-trace-copy-seed: failed to parse sessions XHR', e);
                    }
                });
            }
            return originalXHRSend.apply(this, [body]);
        };

        state.interceptionInstalled = true;
        Logger.log('session-trace-copy-seed: sessions API interception installed');
    },

    async tryFallbackFetch(state, pageWindow) {
        if (state.fallbackDone) return;
        const sessionId = this.getSessionIdFromLocation();
        if (!sessionId) return;

        if (state.instanceJoin) return;

        state.fallbackDone = true;

        const select =
            'instance_join:instances!sessions_instance_fkey(instance_id,env_key,version,data_key,data_version,env_variables)';
        const url = `https://api.fleetai.com/rest/v1/sessions?select=${encodeURIComponent(select)}&id=eq.${sessionId}`;
        const headers = {
            accept: 'application/vnd.pgrst.object+json',
            'accept-profile': 'public',
            'x-client-info': 'fleet-ux-sessionTraceCopySeedData/1.0'
        };
        const apikey = pageWindow.__fleetSessionTraceCapturedApikey;
        const auth = pageWindow.__fleetSessionTraceCapturedAuth;
        const token = !auth ? this.getSupabaseAccessToken(pageWindow) : '';
        if (apikey) headers.apikey = apikey;
        if (auth) {
            headers.authorization = auth;
        } else if (token) {
            headers.authorization = `Bearer ${token}`;
        }

        if (!apikey && !auth && !token) {
            Logger.warn(
                'session-trace-copy-seed: no captured API headers or localStorage token; cannot fallback-fetch session row (interception may still work on next navigation)'
            );
            return;
        }

        try {
            const res = await pageWindow.fetch(url, { method: 'GET', headers, credentials: 'omit' });
            if (!res.ok) {
                Logger.debug(`session-trace-copy-seed: fallback fetch HTTP ${res.status}`, url);
                return;
            }
            const data = await res.json();
            this.applySessionPayload(state, pageWindow, data);
        } catch (e) {
            Logger.debug('session-trace-copy-seed: fallback fetch failed', e);
        }
    },

    scheduleFallbackFetch(state, context) {
        if (state.fallbackStarted) return;
        state.fallbackStarted = true;
        const pageWindow = context.getPageWindow();
        const self = this;
        pageWindow.setTimeout(() => {
            self.tryFallbackFetch(state, pageWindow);
        }, 100);
    },

    observeDomForButton(state, context) {
        const pageWindow = context.getPageWindow();
        if (state.domObserver) {
            try {
                state.domObserver.disconnect();
            } catch (e) {
                /* ignore */
            }
            state.domObserver = null;
        }
        const self = this;
        const obs = new MutationObserver(() => {
            if (!state.instanceJoin) return;
            self.ensureCopySeedButton(state);
        });
        obs.observe(pageWindow.document.documentElement, { childList: true, subtree: true });
        state.domObserver = obs;
    },

    bindPopstate(state, context) {
        const pageWindow = context.getPageWindow();
        if (state.popstateBound) return;
        state.popstateBound = true;
        const self = this;
        pageWindow.addEventListener('popstate', () => {
            const sid = self.getSessionIdFromLocation();
            if (sid !== state.sessionIdFromUrl) {
                if (state.sessionIdFromUrl) {
                    state.instanceJoin = null;
                    state.instanceJoinSerialized = '';
                    state.copySeedLogged = false;
                    state.fallbackDone = false;
                    state.fallbackStarted = false;
                    state.diagLogged = false;
                    const oldSeed = pageWindow.document.querySelector(`button[${COPY_SEED_ATTR}]`);
                    if (oldSeed) oldSeed.remove();
                }
                state.sessionIdFromUrl = sid;
            }
        });
    },

    findSkipButton() {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const span = btn.querySelector('span');
            if (span && span.textContent.trim() === 'Skip') {
                return btn;
            }
        }
        return null;
    },

    pulseSeedCopyFailure(button, state) {
        if (state.seedCopyFeedbackTimeoutId) clearTimeout(state.seedCopyFeedbackTimeoutId);
        const prevT = button.style.transition;
        button.style.transition = 'none';
        button.style.backgroundColor = 'rgb(239, 68, 68)';
        button.style.color = '#ffffff';
        void button.offsetHeight;
        button.style.transition = 'background-color 500ms ease-out, color 500ms ease-out';
        button.style.backgroundColor = '';
        button.style.color = '';
        state.seedCopyFeedbackTimeoutId = setTimeout(() => {
            button.style.transition = prevT || '';
            state.seedCopyFeedbackTimeoutId = null;
        }, 500);
    },

    ensureCopySeedButton(state) {
        if (!state.instanceJoin) return;

        const skipBtn = this.findSkipButton();
        if (!skipBtn) {
            if (!state.missingLogged) {
                Logger.debug('session-trace-copy-seed: Skip button not found in top bar');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const container = skipBtn.parentElement;
        if (!container) return;

        const viewEvalLink = container.querySelector('a[data-fleet-session-view-eval-task]');
        const anchorAfter = viewEvalLink || skipBtn;

        let copyBtn = container.querySelector(`button[${COPY_SEED_ATTR}]`);

        if (!copyBtn) {
            copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.setAttribute(COPY_SEED_ATTR, 'true');
            copyBtn.setAttribute('data-fleet-plugin', this.id);
            copyBtn.className =
                'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm px-3 text-xs shrink-0';
            copyBtn.textContent = 'Copy Seed Data';
            copyBtn.title = 'Copy instance_join JSON to clipboard';
            copyBtn.setAttribute('aria-label', 'Copy instance join seed data');

            const self = this;
            copyBtn.addEventListener('click', () => {
                const payload = JSON.stringify(state.instanceJoin, null, 2);
                navigator.clipboard.writeText(payload).then(
                    () => {
                        Logger.log('session-trace-copy-seed: copied instance_join to clipboard');
                        if (state.seedCopyFeedbackTimeoutId) clearTimeout(state.seedCopyFeedbackTimeoutId);
                        copyBtn.style.transition = '';
                        copyBtn.style.backgroundColor = 'rgb(34, 197, 94)';
                        copyBtn.style.color = 'white';
                        state.seedCopyFeedbackTimeoutId = setTimeout(() => {
                            copyBtn.style.backgroundColor = '';
                            copyBtn.style.color = '';
                            state.seedCopyFeedbackTimeoutId = null;
                        }, 1000);
                    },
                    (err) => {
                        Logger.error('session-trace-copy-seed: clipboard copy failed', err);
                        self.pulseSeedCopyFailure(copyBtn, state);
                    }
                );
            });
            container.insertBefore(copyBtn, anchorAfter.nextSibling);
            if (!state.copySeedLogged) {
                Logger.log('session-trace-copy-seed: Copy Seed Data button added to top bar');
                state.copySeedLogged = true;
            }
        } else if (copyBtn.previousElementSibling !== anchorAfter) {
            container.insertBefore(copyBtn, anchorAfter.nextSibling);
        }
    },

    init(state, context) {
        const sid = this.getSessionIdFromLocation();
        state.sessionIdFromUrl = sid;

        this.installInterception(context, state);
        this.observeDomForButton(state, context);
        this.bindPopstate(state, context);
        this.scheduleFallbackFetch(state, context);
    }
};
