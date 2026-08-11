// ============= verifier-source-tab.js (dispute-detail) =============
// Placement: Environment | Verifier on the instance status-bar button row.
// Shared library: Context.verifierSourceTab. Hides only the iframe stack.
// Task / verifier pins: View Task link + dispute page RSC evalTask
// (verifier_version_id) — see local/api/apis/fleet-web-api/endpoints/disputes.md
// "Dispute review page HTML / RSC".

const VIEW_TASK_HREF_RE = /\/work\/problems\/view-task\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_CAPTURE = '([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})';
const EVAL_TASK_SLICE_CHARS = 12000;

const plugin = {
    id: 'disputeVerifierSourceTab',
    name: 'Environment Verifier Tab',
    description:
        'Adds Environment | Verifier tabs on the dispute instance status bar and shows searchable verifier source',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {},

    init(state) {
        const api = Context.verifierSourceTab;
        if (api && typeof api.createInitialState === 'function') {
            Object.assign(state, api.createInitialState());
        }
        state.evalTaskHintsLogged = false;
        state.evalTaskWaitingLogged = false;
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

    /**
     * Match `"key":"uuid"` or RSC-escaped `\"key\":\"uuid\"` inside __next_f string literals.
     * @param {string} field
     * @returns {RegExp}
     */
    _evalTaskUuidFieldRe(field) {
        return new RegExp(
            '\\\\?"' + field + '\\\\?"\\s*:\\s*\\\\?"' + UUID_CAPTURE + '\\\\?"',
            'i'
        );
    },

    /**
     * Pins from DisputeReviewClient RSC (`result.data.evalTask`).
     * Page may stream after CSR bailout — call on every mutation until found.
     */
    scrapeEvalTaskHints() {
        const scripts = document.querySelectorAll('script');
        let blob = '';
        for (let i = 0; i < scripts.length; i++) {
            const text = scripts[i].textContent || '';
            if (
                text.indexOf('verifier_version_id') === -1 &&
                text.indexOf('evalTask') === -1
            ) {
                continue;
            }
            blob += text;
            if (blob.length > 500000) break;
        }
        if (!blob) return null;

        const evalIdx = blob.indexOf('evalTask');
        const slice =
            evalIdx >= 0
                ? blob.slice(evalIdx, evalIdx + EVAL_TASK_SLICE_CHARS)
                : blob;

        const versionMatch = slice.match(this._evalTaskUuidFieldRe('verifier_version_id'));
        const versionId = versionMatch && versionMatch[1] ? versionMatch[1] : '';
        if (!versionId || !UUID_RE.test(versionId)) return null;

        const verifierMatch = slice.match(this._evalTaskUuidFieldRe('verifier_id'));
        const teamMatch = slice.match(this._evalTaskUuidFieldRe('team_id'));
        const idMatch = slice.match(this._evalTaskUuidFieldRe('id'));

        return {
            versionId,
            verifierId: verifierMatch && UUID_RE.test(verifierMatch[1]) ? verifierMatch[1] : '',
            teamId: teamMatch && UUID_RE.test(teamMatch[1]) ? teamMatch[1] : '',
            taskId: idMatch && UUID_RE.test(idMatch[1]) ? idMatch[1] : ''
        };
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

    buildHints(state) {
        const fromPage = this.scrapeEvalTaskHints();
        const viewTaskId = this.findViewTaskId();
        if (fromPage && fromPage.versionId) {
            if (!state.evalTaskHintsLogged) {
                Logger.debug(
                    'evalTask pin versionId=' +
                        fromPage.versionId.slice(0, 8) +
                        '…' +
                        (fromPage.taskId ? ' task=' + fromPage.taskId.slice(0, 8) + '…' : '')
                );
                state.evalTaskHintsLogged = true;
                state.evalTaskWaitingLogged = false;
            }
            return {
                taskId: fromPage.taskId || viewTaskId || '',
                verifierId: fromPage.verifierId || '',
                versionId: fromPage.versionId,
                teamId: fromPage.teamId || ''
            };
        }
        if (viewTaskId) {
            if (!state.evalTaskWaitingLogged) {
                Logger.debug('waiting for evalTask verifier_version_id in page RSC');
                state.evalTaskWaitingLogged = true;
            }
            return { taskId: viewTaskId };
        }
        return null;
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
            state.evalTaskHintsLogged = false;
            state.evalTaskWaitingLogged = false;
        }

        const placement = this.findPlacement();
        const hints = this.buildHints(state);
        if (!hints || !hints.taskId) {
            if (!state.viewTaskMissingLogged) {
                Logger.debug('View Task link / evalTask not found yet');
                state.viewTaskMissingLogged = true;
            }
        } else {
            state.viewTaskMissingLogged = false;
        }

        api.run(state, {
            pluginId: this.id,
            primaryTabLabel: 'Environment',
            compactTabs: true,
            tabHost: placement && placement.tabHost,
            primaryContent: placement && placement.primaryContent,
            contentParent: placement && placement.contentParent,
            chromeToHide: [],
            hints,
            mountTabs: (host, primaryTab, verifierTab) => this.mountTabs(host, primaryTab, verifierTab)
        });
    }
};
