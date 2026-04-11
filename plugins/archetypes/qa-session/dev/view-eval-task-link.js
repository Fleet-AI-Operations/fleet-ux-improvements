// ============= view-eval-task-link.js =============
// Session Trace Review: capture eval_task from GET /rest/v1/sessions?... (same as the app),
// then show a "View Task" link in the top bar (right of Skip).
//
// Uses phase "early" so fetch is wrapped before most page requests. If the session request
// already finished, a one-shot fallback fetch runs (captured apikey/auth headers or localStorage).

const VIEW_LINK_ATTR = 'data-fleet-session-view-eval-task';

const plugin = {
    id: 'sessionTraceViewEvalTask',
    name: 'Session Trace View Task link',
    description:
        'Adds a View Task link (eval task) in the top bar from the sessions API response (network capture + optional fallback)',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'early',

    initialState: {
        interceptionInstalled: false,
        evalTaskId: '',
        sessionIdFromUrl: '',
        missingLogged: false,
        linkLogged: false,
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

    /** PostgREST filter may appear with mixed case in the query string */
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

    extractEvalTaskId(payload) {
        if (!payload || typeof payload !== 'object') return '';
        const id = payload.eval_task;
        if (typeof id === 'string' && id.length > 0) return id;
        return '';
    },

    viewTaskHref(evalId) {
        return `https://www.fleetai.com/work/problems/view-task/${evalId}`;
    },

    /** First Supabase-style access_token from localStorage (best-effort). */
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
            Logger.debug('session-trace-view-eval-task: localStorage token read failed', e);
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
            Logger.debug('session-trace-view-eval-task: header capture failed', e);
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
                `session-trace-view-eval-task: saw sessions request with different filter (expected id=eq.${sessionId}); sample URL logged once`,
                u.href
            );
        } catch (e) {
            /* ignore */
        }
    },

    onEvalTaskReady(state, pageWindow) {
        const self = this;
        const tick = () => {
            try {
                self.ensureViewTaskLink(state);
            } catch (e) {
                Logger.error('session-trace-view-eval-task: ensure link failed', e);
            }
        };
        pageWindow.requestAnimationFrame(tick);
    },

    installInterception(context, state) {
        const pageWindow = context.getPageWindow();
        if (pageWindow.__fleetSessionTraceEvalTaskInterceptionInstalled) {
            state.interceptionInstalled = true;
            return;
        }
        pageWindow.__fleetSessionTraceEvalTaskInterceptionInstalled = true;

        const self = this;

        const onSessionPayload = (payload) => {
            const sid = self.getSessionIdFromLocation();
            if (!sid) return;
            const evalId = self.extractEvalTaskId(payload);
            if (!evalId) return;
            if (state.evalTaskId === evalId) return;
            state.evalTaskId = evalId;
            Logger.log(`session-trace-view-eval-task: captured eval_task ${evalId}`);
            self.onEvalTaskReady(state, pageWindow);
        };

        const tryParseResponse = async (response, urlStr, method) => {
            const sid = self.getSessionIdFromLocation();
            if (!sid || !self.matchesSessionsDetailRequest(urlStr, sid)) return;
            if (String(method || 'GET').toUpperCase() !== 'GET') return;
            if (!response || !response.ok) return;
            try {
                const clone = response.clone();
                const data = await clone.json();
                onSessionPayload(data);
            } catch (e) {
                Logger.debug('session-trace-view-eval-task: failed to parse sessions JSON (fetch)', e);
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
            this._fleetSessionTraceURL = url;
            this._fleetSessionTraceMethod = method;
            return originalXHROpen.apply(this, [method, url, ...rest]);
        };
        pageWindow.XMLHttpRequest.prototype.send = function (body) {
            const url = this._fleetSessionTraceURL;
            const method = this._fleetSessionTraceMethod || 'GET';
            const sid = self.getSessionIdFromLocation();
            if (sid && self.matchesSessionsDetailRequest(url, sid) && String(method).toUpperCase() === 'GET') {
                this.addEventListener('load', function () {
                    try {
                        const text = this.responseText;
                        if (!text) return;
                        const data = JSON.parse(text);
                        onSessionPayload(data);
                    } catch (e) {
                        Logger.debug('session-trace-view-eval-task: failed to parse sessions XHR', e);
                    }
                });
            }
            return originalXHRSend.apply(this, [body]);
        };

        state.interceptionInstalled = true;
        Logger.log('session-trace-view-eval-task: sessions API interception installed');
    },

    async tryFallbackFetch(state, pageWindow) {
        if (state.fallbackDone || state.evalTaskId) return;
        const sessionId = this.getSessionIdFromLocation();
        if (!sessionId) return;

        state.fallbackDone = true;

        const url = `https://api.fleetai.com/rest/v1/sessions?select=eval_task&id=eq.${sessionId}`;
        const headers = {
            accept: 'application/vnd.pgrst.object+json',
            'accept-profile': 'public',
            'x-client-info': 'fleet-ux-sessionTraceViewEvalTask/1.1'
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
                'session-trace-view-eval-task: no captured API headers or localStorage token; cannot fallback-fetch eval_task (interception may still work on next navigation)'
            );
            return;
        }

        try {
            const res = await pageWindow.fetch(url, { method: 'GET', headers, credentials: 'omit' });
            if (!res.ok) {
                Logger.debug(
                    `session-trace-view-eval-task: fallback fetch HTTP ${res.status}`,
                    url
                );
                return;
            }
            const data = await res.json();
            const evalId = this.extractEvalTaskId(data);
            if (!evalId) {
                Logger.debug('session-trace-view-eval-task: fallback response had no eval_task');
                return;
            }
            if (state.evalTaskId === evalId) return;
            state.evalTaskId = evalId;
            Logger.log(`session-trace-view-eval-task: eval_task from fallback fetch ${evalId}`);
            this.onEvalTaskReady(state, pageWindow);
        } catch (e) {
            Logger.debug('session-trace-view-eval-task: fallback fetch failed', e);
        }
    },

    scheduleFallbackFetch(state, context) {
        if (state.fallbackStarted) return;
        state.fallbackStarted = true;
        const pageWindow = context.getPageWindow();
        const self = this;
        // Defer so another in-flight fetch can populate captured apikey/auth headers first.
        pageWindow.setTimeout(() => {
            self.tryFallbackFetch(state, pageWindow);
        }, 100);
    },

    observeDomForLink(state, context) {
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
            if (!state.evalTaskId) return;
            self.ensureViewTaskLink(state);
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
                    state.evalTaskId = '';
                    state.linkLogged = false;
                    state.fallbackDone = false;
                    state.fallbackStarted = false;
                    state.diagLogged = false;
                    const old = pageWindow.document.querySelector(`a[${VIEW_LINK_ATTR}]`);
                    if (old) old.remove();
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

    ensureViewTaskLink(state) {
        if (!state.evalTaskId) return;

        const skipBtn = this.findSkipButton();
        if (!skipBtn) {
            if (!state.missingLogged) {
                Logger.debug('session-trace-view-eval-task: Skip button not found in top bar');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const container = skipBtn.parentElement;
        if (!container) return;

        let link = container.querySelector(`a[${VIEW_LINK_ATTR}]`);
        const href = this.viewTaskHref(state.evalTaskId);

        if (!link) {
            link = document.createElement('a');
            link.setAttribute(VIEW_LINK_ATTR, 'true');
            link.setAttribute('data-fleet-plugin', this.id);
            link.className =
                'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm px-3 text-xs shrink-0';
            link.textContent = 'View Task';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.href = href;
            container.insertBefore(link, skipBtn.nextSibling);
            if (!state.linkLogged) {
                Logger.log('session-trace-view-eval-task: View Task link added to top bar');
                state.linkLogged = true;
            }
        } else {
            link.href = href;
        }
    },

    init(state, context) {
        const sid = this.getSessionIdFromLocation();
        state.sessionIdFromUrl = sid;

        this.installInterception(context, state);
        this.observeDomForLink(state, context);
        this.bindPopstate(state, context);
        this.scheduleFallbackFetch(state, context);
    }
};
