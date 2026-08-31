// ============= creation-annotator-instructions.js =============
// Injects human annotator instructions above the user story on computer-use creation.

const NETWORK_WATCHER_ID = 'creation-annotator-instructions-create-context';
const CREATE_CONTEXT_PATH_RE =
    /^\/api\/orchestrator-private\/v1\/work\/authoring\/computer-use\/targets\/[^/]+\/create-context\/?$/i;
const SCENARIO_INTRO_RE = /Write a problem inspired by the following scenario/i;
const CARD_ATTR = 'data-fleet-annotator-instructions';
const HEADING_TEXT = 'Instructions for Task Creation:';
const CARD_CLASSES = [
    'rounded-lg',
    'border',
    'border-amber-200',
    'bg-amber-50',
    'p-4',
    'dark:border-amber-800',
    'dark:bg-amber-950/30'
].join(' ');
const HEADING_CLASSES = 'mb-3 text-sm font-medium text-amber-900 dark:text-amber-100';
const BODY_CLASSES = 'text-sm text-amber-800 dark:text-amber-200';

function pageWindow() {
    if (typeof Context !== 'undefined' && typeof Context.getPageWindow === 'function') {
        return Context.getPageWindow();
    }
    return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
}

function normalizeLabel(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

const plugin = {
    id: 'creationAnnotatorInstructions',
    name: 'Creation Annotator Instructions',
    description: 'Shows annotator instructions above the user story on computer-use creation',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        subscribed: false,
        hatText: null,
        lookupDone: false,
        inflight: null,
        cardEl: null,
        renderedText: null,
        activationLogged: false,
        missingLogged: false,
        emptyLogged: false,
        fallbackAttempted: false,
        fallbackTargetId: null
    },

    onMutation(state) {
        this.ensureSubscribe(state);
        this.maybeFallbackFetch(state);
        this.syncCard(state);
    },

    ensureSubscribe(state) {
        if (state.subscribed) return;
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            return;
        }
        const self = this;
        Context.networkObserver.subscribe({
            id: NETWORK_WATCHER_ID,
            matches(meta) {
                if (!meta || meta.method !== 'GET' || !meta.urlObj) return false;
                return CREATE_CONTEXT_PATH_RE.test(meta.urlObj.pathname || '');
            },
            onResponse(meta, response) {
                if (!response || typeof response.json !== 'function') return;
                response.json().then((body) => {
                    self.applyHatFromPayload(state, body, 'intercept');
                }).catch(() => {
                    Logger.debug('create-context intercept was not JSON');
                });
            }
        });
        state.subscribed = true;
        Logger.debug('subscribed for create-context');
    },

    targetIdFromUrl() {
        try {
            const win = pageWindow();
            const params = new URLSearchParams((win && win.location && win.location.search) || '');
            return String(params.get('task_project_target_id') || '').trim();
        } catch (_e) {
            return '';
        }
    },

    createContextUrl(targetId) {
        const win = pageWindow();
        const origin = (win && win.location && win.location.origin) || '';
        return origin
            + '/api/orchestrator-private/v1/work/authoring/computer-use/targets/'
            + encodeURIComponent(targetId)
            + '/create-context';
    },

    applyHatFromPayload(state, body, source) {
        const raw = body && body.scenario && body.scenario.human_annotator_instructions;
        const text = raw != null ? String(raw).trim() : '';
        state.lookupDone = true;
        if (!text) {
            state.hatText = '';
            if (!state.emptyLogged) {
                Logger.debug('annotator instructions empty (' + source + ')');
                state.emptyLogged = true;
            }
            return;
        }
        state.emptyLogged = false;
        if (state.hatText !== text) {
            state.hatText = text;
            Logger.debug('annotator instructions from ' + source + ' (' + text.length + ' chars)');
        }
        this.syncCard(state);
    },

    maybeFallbackFetch(state) {
        const targetId = this.targetIdFromUrl();
        if (state.fallbackTargetId !== targetId) {
            state.fallbackTargetId = targetId;
            state.fallbackAttempted = false;
            if (!state.hatText) state.lookupDone = false;
        }
        if (state.lookupDone || state.inflight || state.fallbackAttempted) return;
        if (!this.findStoryBox()) return;
        if (!targetId) {
            if (!state.missingLogged) {
                Logger.debug('no task_project_target_id in URL');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;
        state.fallbackAttempted = true;
        const url = this.createContextUrl(targetId);
        const win = pageWindow();
        const requestFetch = (win && win.fetch) || fetch;
        Logger.debug('fetching create-context for target ' + targetId.slice(0, 8) + '…');
        const self = this;
        state.inflight = Promise.resolve(requestFetch.call(win, url, {
            method: 'GET',
            headers: { accept: 'application/json, text/plain, */*' },
            credentials: 'include'
        })).then((res) => {
            if (!res || !res.ok) {
                throw new Error('create-context ' + (res ? res.status : 'no response'));
            }
            return res.json();
        }).then((body) => {
            self.applyHatFromPayload(state, body, 'fallback');
        }).catch((err) => {
            state.lookupDone = false;
            Logger.warn('create-context fallback failed', err);
        }).finally(() => {
            state.inflight = null;
        });
    },

    findStoryBox() {
        const form = document.getElementById('problem-form');
        if (!form) return null;
        const intros = form.querySelectorAll('p');
        for (const intro of intros) {
            if (!SCENARIO_INTRO_RE.test(normalizeLabel(intro.textContent))) continue;
            const box = intro.closest('div.rounded-lg.border');
            if (!box) continue;
            const cls = String(box.className || '');
            if (/\bborder-blue-200\b/.test(cls) && /\bbg-blue-50\b/.test(cls)) return box;
        }
        return null;
    },

    proseAttr() {
        const md = Context.userStoryMarkdown;
        return (md && md.PROSE_ATTR) || 'data-fleet-user-story-prose';
    },

    renderBodyHtml(text) {
        const md = Context.userStoryMarkdown;
        if (md && typeof md.markdownToHtml === 'function') {
            if (typeof md.ensureProseStyles === 'function') md.ensureProseStyles();
            return md.markdownToHtml(text);
        }
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    ensureCard(state, storyBox) {
        let card = storyBox.parentElement
            && storyBox.parentElement.querySelector('[' + CARD_ATTR + '="1"]');
        if (!card) {
            card = document.createElement('div');
            card.className = CARD_CLASSES;
            card.setAttribute(CARD_ATTR, '1');
            const heading = document.createElement('p');
            heading.className = HEADING_CLASSES;
            heading.textContent = HEADING_TEXT;
            const body = document.createElement('div');
            body.className = BODY_CLASSES;
            body.setAttribute(this.proseAttr(), '');
            card.appendChild(heading);
            card.appendChild(body);
            storyBox.parentElement.insertBefore(card, storyBox);
            if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerElement) {
                CleanupRegistry.registerElement(card);
            }
        } else if (card.nextElementSibling !== storyBox) {
            storyBox.parentElement.insertBefore(card, storyBox);
        }
        return card;
    },

    syncCard(state) {
        const storyBox = this.findStoryBox();
        if (!storyBox) {
            if (state.cardEl && state.cardEl.isConnected) {
                state.cardEl.remove();
            }
            state.cardEl = null;
            state.renderedText = null;
            if (state.activationLogged) {
                Logger.debug('annotator instructions card removed');
                state.activationLogged = false;
            }
            return;
        }

        const text = state.hatText != null ? String(state.hatText).trim() : '';
        if (!text) return;

        const card = this.ensureCard(state, storyBox);
        state.cardEl = card;
        const body = card.querySelector('[' + this.proseAttr() + ']');
        if (body && state.renderedText !== text) {
            body.innerHTML = this.renderBodyHtml(text);
            state.renderedText = text;
        }

        if (!state.activationLogged) {
            Logger.log('annotator instructions shown (' + text.length + ' chars)');
            state.activationLogged = true;
        }
    }
};
