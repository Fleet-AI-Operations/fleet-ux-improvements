// ============= user-story-markdown.js (library) =============
// Hides native User Story blue bodies and injects blue-framed markdown replicas.

const USER_STORY_STYLE_ID = 'fleet-user-story-markdown-hide';
const ORIGINAL_MARKER = 'data-fleet-user-story-original';
const REPLICA_MARKER = 'data-fleet-user-story-replica';
const PROSE_ATTR = 'data-fleet-user-story-prose';
const LABEL_TEXT = 'User Story';

const MODAL_FRAME_CLASSES = [
    'mt-1',
    'rounded',
    'border',
    'border-l-4',
    'border-blue-200',
    'border-l-blue-300',
    'bg-blue-50',
    'p-3',
    'text-sm',
    'text-blue-700',
    'dark:border-blue-800',
    'dark:border-l-blue-600',
    'dark:bg-blue-950/30',
    'dark:text-blue-300'
].join(' ');

const EMBEDDED_BODY_CLASSES = [
    'mt-1',
    'text-sm',
    'text-blue-700',
    'dark:text-blue-300'
].join(' ');

const UserStoryMarkdownApi = {
    ensureHideStyles(state) {
        if (state.styleInjected || document.getElementById(USER_STORY_STYLE_ID)) {
            state.styleInjected = true;
            return;
        }
        const style = document.createElement('style');
        style.id = USER_STORY_STYLE_ID;
        style.textContent = [
            '[' + ORIGINAL_MARKER + '="true"] {',
            '  position: absolute !important;',
            '  width: 1px !important;',
            '  height: 1px !important;',
            '  overflow: hidden !important;',
            '  clip: rect(0,0,0,0) !important;',
            '  white-space: nowrap !important;',
            '  border: 0 !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  pointer-events: none !important;',
            '  user-select: none !important;',
            '}'
        ].join('\n');
        (document.head || document.documentElement).appendChild(style);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerElement) {
            CleanupRegistry.registerElement(style);
        }
        state.styleInjected = true;
    },

    ensureProseStyles() {
        if (Context.uiLib && typeof Context.uiLib.ensureUserStoryMarkdownStyles === 'function') {
            Context.uiLib.ensureUserStoryMarkdownStyles();
        }
    },

    normalizeLabelText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    },

    isUserStoryLabel(el) {
        if (!el) return false;
        return this.normalizeLabelText(el.textContent) === LABEL_TEXT;
    },

    findBodyForLabel(label) {
        if (!label) return null;
        const parent = label.parentElement;
        if (!parent) return null;

        let sibling = label.nextElementSibling;
        while (sibling) {
            if (sibling.getAttribute && sibling.getAttribute(REPLICA_MARKER) === 'true') {
                sibling = sibling.nextElementSibling;
                continue;
            }
            if (sibling.matches && sibling.matches('.whitespace-pre-wrap')) {
                return sibling;
            }
            sibling = sibling.nextElementSibling;
        }

        const nested = parent.querySelector('.whitespace-pre-wrap');
        if (nested && !nested.closest('[' + REPLICA_MARKER + '="true"]')) {
            return nested;
        }
        return null;
    },

    findBodies() {
        const labels = document.querySelectorAll('label, span');
        const bodies = [];
        const seen = new Set();
        for (const el of labels) {
            if (!this.isUserStoryLabel(el)) continue;
            const body = this.findBodyForLabel(el);
            if (!body || seen.has(body)) continue;
            seen.add(body);
            bodies.push(body);
        }
        return bodies;
    },

    isModalVariant(body) {
        const cls = body.className || '';
        return /\bborder-l-4\b/.test(cls) || /\bborder-blue-200\b/.test(cls);
    },

    escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    stripWrappingQuotes(text) {
        let s = String(text || '').trim();
        const pairs = [
            ['\u201C', '\u201D'],
            ['"', '"'],
            ['\u2018', '\u2019'],
            ["'", "'"]
        ];
        for (const [open, close] of pairs) {
            if (s.length >= 2 && s.startsWith(open) && s.endsWith(close)) {
                return s.slice(open.length, s.length - close.length).trim();
            }
        }
        return s;
    },

    processInlines(escapedLine) {
        let s = escapedLine;
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
            const safeHref = /^(https?:|mailto:|\/|#)/i.test(href) ? href : '#';
            return '<a href="' + safeHref + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
        });
        s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        return s;
    },

    markdownToHtml(md) {
        const raw = this.stripWrappingQuotes(md);
        if (!raw) return '';
        const lines = raw.split(/\r?\n/);
        const out = [];
        let inList = false;

        const closeList = () => {
            if (inList) {
                out.push('</ul>');
                inList = false;
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed === '') {
                closeList();
                continue;
            }

            const h4 = /^####\s+(.+)$/.exec(trimmed);
            const h3 = /^###\s+(.+)$/.exec(trimmed);
            const h2 = /^##\s+(.+)$/.exec(trimmed);
            const h1 = /^#\s+(.+)$/.exec(trimmed);
            const ul = /^-\s+(.+)$/.exec(trimmed);

            if (h1 || h2 || h3 || h4) {
                closeList();
                const content = this.processInlines(this.escapeHtml((h1 || h2 || h3 || h4)[1]));
                if (h1) out.push('<h1>' + content + '</h1>');
                else if (h2) out.push('<h2>' + content + '</h2>');
                else if (h3) out.push('<h3>' + content + '</h3>');
                else out.push('<h4>' + content + '</h4>');
                continue;
            }

            if (ul) {
                if (!inList) {
                    inList = true;
                    out.push('<ul>');
                }
                out.push('<li>' + this.processInlines(this.escapeHtml(ul[1])) + '</li>');
                continue;
            }

            closeList();
            out.push('<p>' + this.processInlines(this.escapeHtml(trimmed)) + '</p>');
        }
        closeList();
        return out.join('');
    },

    replicaClassName(body) {
        if (this.isModalVariant(body)) {
            return MODAL_FRAME_CLASSES;
        }
        return EMBEDDED_BODY_CLASSES;
    },

    syncReplica(original, replica) {
        if (!original || !replica) return;
        const next = original.textContent || '';
        if (replica.dataset.fleetUserStorySource === next) return;
        replica.dataset.fleetUserStorySource = next;
        replica.innerHTML = this.markdownToHtml(next);
    },

    detachObserver(entry) {
        if (entry && entry.observer) {
            entry.observer.disconnect();
            entry.observer = null;
        }
    },

    attachObserver(original, replica, entry) {
        if (entry.observer && entry.source === original) return;
        this.detachObserver(entry);
        const self = this;
        const observer = new MutationObserver(() => {
            self.syncReplica(original, replica);
        });
        observer.observe(original, {
            characterData: true,
            childList: true,
            subtree: true
        });
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerObserver) {
            CleanupRegistry.registerObserver(observer);
        }
        entry.observer = observer;
        entry.source = original;
        entry.replica = replica;
    },

    ensureReplica(body, state, logTag) {
        body.setAttribute(ORIGINAL_MARKER, 'true');

        let replica = body.nextElementSibling;
        if (!replica || replica.getAttribute(REPLICA_MARKER) !== 'true') {
            replica = document.createElement('div');
            replica.setAttribute(REPLICA_MARKER, 'true');
            replica.setAttribute(PROSE_ATTR, '');
            replica.setAttribute('data-fleet-plugin', logTag);
            body.insertAdjacentElement('afterend', replica);
        }

        replica.className = this.replicaClassName(body);
        replica.setAttribute(PROSE_ATTR, '');
        this.syncReplica(body, replica);

        let entry = state.activeByBody.get(body);
        if (!entry) {
            entry = { observer: null, source: null, replica: null };
            state.activeByBody.set(body, entry);
        }
        this.attachObserver(body, replica, entry);
    },

    teardownBody(body, entry) {
        this.detachObserver(entry);
        if (body && body.getAttribute(ORIGINAL_MARKER) === 'true') {
            body.removeAttribute(ORIGINAL_MARKER);
        }
        const replica = body && body.nextElementSibling;
        if (replica && replica.getAttribute(REPLICA_MARKER) === 'true') {
            replica.remove();
        }
    },

    teardownAll(state, logTag) {
        if (!state.activeByBody || state.activeByBody.size === 0) return;
        for (const [body, entry] of state.activeByBody.entries()) {
            this.teardownBody(body, entry);
        }
        state.activeByBody.clear();
        if (state.activationLogged) {
            Logger.debug(logTag + ': User Story markdown replicas cleared');
            state.activationLogged = false;
        }
    },

    run(state, options) {
        const logTag = (options && (options.logTag || options.pluginId)) || 'userStoryMarkdown';

        if (!state.activeByBody) {
            state.activeByBody = new Map();
        }

        const bodies = this.findBodies();
        if (bodies.length === 0) {
            if (state.activeByBody.size > 0) {
                this.teardownAll(state, logTag);
            }
            if (!state.missingLogged) {
                Logger.debug(logTag + ': User Story body not found yet');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        this.ensureHideStyles(state);
        this.ensureProseStyles();

        const live = new Set(bodies);
        for (const [body, entry] of Array.from(state.activeByBody.entries())) {
            if (!live.has(body) || !body.isConnected) {
                this.teardownBody(body, entry);
                state.activeByBody.delete(body);
            }
        }

        for (const body of bodies) {
            this.ensureReplica(body, state, logTag);
        }

        if (!state.activationLogged) {
            Logger.log(logTag + ': User Story markdown replicas active (' + bodies.length + ')');
            state.activationLogged = true;
        }
    }
};

const plugin = {
    id: 'userStoryMarkdownLib',
    name: 'User Story Markdown (library)',
    description: 'Shared API: hide native User Story bodies and show markdown replicas',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.userStoryMarkdown = {
            run: (s, options) => UserStoryMarkdownApi.run(s, options)
        };
        if (!state.registered) {
            Logger.log('userStoryMarkdownLib: module registered (Context.userStoryMarkdown)');
            state.registered = true;
        }
    }
};
