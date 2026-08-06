// ============= verifier-source-tab.js (dispute-detail) =============
// Placement: Environment | Verifier on the instance status-bar button row.
// Shared library: Context.verifierSourceTab. Hides only the iframe stack.
// Task identity: View Task link (/work/problems/view-task/<uuid>).

const VIEW_TASK_HREF_RE = /\/work\/problems\/view-task\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

const plugin = {
    id: 'disputeVerifierSourceTab',
    name: 'Environment Verifier Tab',
    description:
        'Adds Environment | Verifier tabs on the dispute instance status bar and shows searchable verifier source',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {},

    init(state) {
        const api = Context.verifierSourceTab;
        if (api && typeof api.createInitialState === 'function') {
            Object.assign(state, api.createInitialState());
        }
    },

    normalizeLabel(el) {
        return String((el && el.textContent) || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    },

    /** Task UUID from the header "View Task" link. */
    findViewTaskId() {
        const links = document.querySelectorAll('a[href*="/work/problems/view-task/"]');
        for (let i = 0; i < links.length; i++) {
            const a = links[i];
            const href = a.getAttribute('href') || '';
            const match = href.match(VIEW_TASK_HREF_RE);
            if (!match) continue;
            const label = this.normalizeLabel(a);
            if (label.includes('view task') || label.includes('viewtask')) {
                return match[1];
            }
        }
        for (let i = 0; i < links.length; i++) {
            const href = links[i].getAttribute('href') || '';
            const match = href.match(VIEW_TASK_HREF_RE);
            if (match) return match[1];
        }
        return '';
    },

    findInstanceIframe() {
        return document.querySelector('iframe[title="Instance Environment"]');
    },

    /** Card wrapping status bar + iframe content. */
    findInstanceCard(iframe) {
        if (!iframe) return null;
        let el = iframe.parentElement;
        while (el && el !== document.body) {
            if (
                el.classList.contains('w-full') &&
                el.classList.contains('h-full') &&
                el.classList.contains('bg-background') &&
                el.classList.contains('flex') &&
                el.classList.contains('flex-col')
            ) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    },

    findColumnRoot(card) {
        if (!card) return null;
        const nested = card.querySelector(':scope > div > div.flex.h-full.flex-col');
        if (nested) return nested;
        return (
            card.querySelector('div.flex.h-full.flex-col') ||
            card.querySelector(':scope > div.flex-1') ||
            null
        );
    },

    findStatusBar(columnRoot) {
        if (!columnRoot) return null;
        return (
            Array.from(columnRoot.children).find(
                (el) =>
                    el.classList.contains('flex-shrink-0') && el.classList.contains('border-b')
            ) || null
        );
    },

    /** Right cluster: Start Recording / Reset / Run Verifier / Hide Verifier. */
    findActionButtonRow(statusBar) {
        if (!statusBar) return null;
        const row = statusBar.querySelector(':scope > div.flex.items-center.justify-between');
        if (!row) return null;
        const children = Array.from(row.children);
        for (let i = 0; i < children.length; i++) {
            const el = children[i];
            if (!el.classList.contains('flex') || !el.classList.contains('items-center')) continue;
            const text = this.normalizeLabel(el);
            if (
                text.includes('start recording') ||
                text.includes('run verifier') ||
                text.includes('reset')
            ) {
                return el;
            }
        }
        // Fallback: last flex child of justify-between row
        for (let i = children.length - 1; i >= 0; i--) {
            const el = children[i];
            if (el.classList.contains('flex') && el.classList.contains('items-center')) {
                return el;
            }
        }
        return null;
    },

    /** Primary content: flex-1 overflow-hidden sibling under status (URL bar + iframe). */
    findPrimaryContent(columnRoot, statusBar) {
        if (!columnRoot) return null;
        const kids = Array.from(columnRoot.children);
        for (let i = 0; i < kids.length; i++) {
            const el = kids[i];
            if (el === statusBar) continue;
            if (el.getAttribute('data-fleet-verifier-panel') === 'true') continue;
            if (el.classList.contains('flex-1') && el.classList.contains('overflow-hidden')) {
                return el;
            }
        }
        const iframe = this.findInstanceIframe();
        if (!iframe) return null;
        let el = iframe.parentElement;
        while (el && el.parentElement !== columnRoot) {
            el = el.parentElement;
        }
        return el && el !== statusBar ? el : null;
    },

    findPlacement() {
        const iframe = this.findInstanceIframe();
        if (!iframe) return null;
        const card = this.findInstanceCard(iframe);
        const columnRoot = this.findColumnRoot(card);
        if (!columnRoot) return null;
        const statusBar = this.findStatusBar(columnRoot);
        const tabHost = this.findActionButtonRow(statusBar);
        const primaryContent = this.findPrimaryContent(columnRoot, statusBar);
        if (!tabHost || !primaryContent) return null;
        return {
            tabHost,
            primaryContent,
            contentParent: columnRoot,
            chromeToHide: []
        };
    },

    mountTabs(host, primaryTab, verifierTab) {
        // Prepend — do not clear Start Recording / Reset / Run Verifier / Hide Verifier.
        let wrap = host.querySelector('[data-fleet-verifier-source-tabs="true"]');
        if (wrap) {
            wrap.innerHTML = '';
            wrap.appendChild(primaryTab);
            wrap.appendChild(verifierTab);
            return;
        }
        wrap = document.createElement('div');
        wrap.setAttribute('data-fleet-verifier-source-tabs', 'true');
        wrap.style.display = 'inline-flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '4px';
        wrap.style.marginRight = '6px';
        wrap.style.flexShrink = '0';
        wrap.appendChild(primaryTab);
        wrap.appendChild(verifierTab);
        host.insertBefore(wrap, host.firstChild);
    },

    onMutation(state) {
        const api = Context.verifierSourceTab;
        if (!api || typeof api.run !== 'function') {
            if (!state.apiMissingLogged) {
                Logger.debug('Context.verifierSourceTab missing');
                state.apiMissingLogged = true;
            }
            return;
        }
        state.apiMissingLogged = false;

        if (!state.cache) {
            Object.assign(state, api.createInitialState());
        }

        const placement = this.findPlacement();
        const taskId = this.findViewTaskId();
        if (!taskId && !state.viewTaskMissingLogged) {
            Logger.debug('View Task link not found yet');
            state.viewTaskMissingLogged = true;
        }
        if (taskId) state.viewTaskMissingLogged = false;

        api.run(state, {
            pluginId: this.id,
            primaryTabLabel: 'Environment',
            compactTabs: true,
            tabHost: placement && placement.tabHost,
            primaryContent: placement && placement.primaryContent,
            contentParent: placement && placement.contentParent,
            chromeToHide: [],
            hints: taskId ? { taskId } : null,
            mountTabs: (host, primaryTab, verifierTab) => this.mountTabs(host, primaryTab, verifierTab)
        });
    }
};
