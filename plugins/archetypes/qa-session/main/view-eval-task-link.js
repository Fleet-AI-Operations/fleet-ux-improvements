// ============= view-eval-task-link.js =============
// Session Trace Review: capture eval_task from the same GET /rest/v1/sessions?... request the app
// makes, then show a "View Task" link in the top bar (right of Skip).

const VIEW_LINK_ATTR = 'data-fleet-session-view-eval-task';

const plugin = {
    id: 'sessionTraceViewEvalTask',
    name: 'Session Trace View Task link',
    description:
        'Adds a View Task link (eval task) in the top bar from the sessions API response (network capture)',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        interceptionInstalled: false,
        evalTaskId: '',
        sessionIdFromUrl: '',
        missingLogged: false,
        linkLogged: false
    },

    getSessionIdFromLocation() {
        const m = String(location.pathname || '').match(
            /\/work\/problems\/qa-session\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
        );
        return m ? m[1] : '';
    },

    matchesSessionsDetailRequest(urlStr, sessionId) {
        if (!sessionId) return false;
        try {
            const u = new URL(urlStr);
            if (u.hostname !== 'api.fleetai.com') return false;
            if (!u.pathname.includes('/rest/v1/sessions')) return false;
            return u.search.includes(`id=eq.${sessionId}`);
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
            pageWindow.requestAnimationFrame(() => {
                try {
                    self.ensureViewTaskLink(state);
                } catch (e) {
                    Logger.error('session-trace-view-eval-task: ensure link after capture failed', e);
                }
            });
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

    onMutation(state, context) {
        const sid = this.getSessionIdFromLocation();
        if (sid !== state.sessionIdFromUrl) {
            if (state.sessionIdFromUrl) {
                state.evalTaskId = '';
                state.linkLogged = false;
                const old = document.querySelector(`a[${VIEW_LINK_ATTR}]`);
                if (old) old.remove();
            }
            state.sessionIdFromUrl = sid;
        }

        this.installInterception(context, state);
        this.ensureViewTaskLink(state);
    }
};
