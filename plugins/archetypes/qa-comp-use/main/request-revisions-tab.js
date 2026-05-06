// ============= request-revisions-tab.js =============
// Request Revisions tab that uses short-lived native modal transactions.
//
// Default data-flow (single in-memory mirror: `state.rrData`; exceptions may be added later):
// 1) Treat the most recently opened / focused RR surface as authoritative while it is active.
// 2) Leaving the custom tab runs a hidden native export so the native RR form mirrors the tab;
//    opening the custom tab runs a hidden import so the tab mirrors native. Both directions
//    skip screenshots — pending screenshots are only pushed to native via the action buttons.
// 3) If the native RR dialog opens while the custom tab is active, tab state is exported into
//    the dialog first (text + checkboxes only, never screenshots); edits in the dialog stream
//    into `state.rrData` while it stays open. When the dialog closes, we run one final
//    native→tab snapshot read (when the DOM node is still readable) so the tab stays a mirror
//    even if the last edit did not emit an event.
//
// Screenshots:
// - Adding a screenshot to the custom tab keeps it as `pending` in `state.rrData.screenshots`;
//   it is NOT uploaded to the native modal until the worker clicks an action button. The tab
//   caps the pending+uploaded count at RR_MAX_SCREENSHOTS (= 5).
// - When the native RR dialog closes, we recount uploaded screenshots from native and reflect
//   that count in the tab counter (preserving any still-pending tab screenshots, capped at 5).
// - Action buttons (Simulate R&NA, Silent Request, Request and Notify Author) all run a
//   stepped sync inside a hidden native modal. A status modal in the page iterates over each
//   sync step (QA Checklist → Prompt Quality → Rejection reasons → each textbox →
//   Screenshots) and verifies the native form before clicking the corresponding native submit
//   button. If any step fails to verify, the hidden native modal is revealed so the worker can
//   complete it manually. "Simulate R&NA" runs the same stepped sync but never clicks submit.

const RR_TAB_MARKER = 'data-fleet-rr-tab';
const RR_PANEL_MARKER = 'data-fleet-rr-tab-panel';
const RR_MANAGED_MODAL_MARKER = 'data-fleet-rr-tab-transaction-modal';
const RR_CUSTOM_REASON_MARKER = 'data-fleet-rr-reason';
const RR_REASON_OTHER_LABEL = 'Other (please explain)';
const RR_CUSTOM_QA_MARKER = 'data-fleet-rr-qa-item';
const RR_CUSTOM_PROMPT_MARKER = 'data-fleet-rr-prompt-rating';
const RR_CUSTOM_SS_PREVIEW = 'data-fleet-rr-ss-preview';
const RR_CUSTOM_SS_REMOVE = 'data-fleet-rr-ss-remove';
const RR_NATIVE_SS_CONTROLS_ATTR = 'data-fleet-rr-native-screenshot-controls';
const RR_NATIVE_SS_UPLOAD_ATTR = 'data-fleet-rr-native-screenshot-upload';
const RR_NATIVE_SS_PASTE_ATTR = 'data-fleet-rr-native-screenshot-paste';
const RR_NATIVE_SS_LABEL_ATTR = 'data-fleet-rr-native-screenshot-label';
const RR_NATIVE_SS_INPUT_ATTR = 'data-fleet-rr-native-screenshot-input';
const RR_REJECTION_REASONS = [
    'Prompt is unclear or ambiguous',
    'Prompt is too simple or trivial',
    'Prompt is unrealistic or overly contrived',
    'Doesn\'t follow user story/scenario',
    'Prompt contains factual errors',
    'Task cannot be completed as described',
    'Verifier doesn\'t correctly validate the task',
    'Environment is broken or misconfigured',
    'Duplicate of existing task',
    RR_REASON_OTHER_LABEL
];
const RR_QA_CHECKLIST_ITEMS = [
    'Is the task achievable as specified with a functioning verifier?',
    'Is there only one clear, obvious correct solution to the task? Make sure there is no room for ambiguity with e.g. other entries in the environment.',
    'Is the task well-specified and phrased in a way that is not confusing?'
];
const RR_PROMPT_QUALITY_OPTIONS = ['Top 10%', 'Average', 'Bottom 10%'];
// Per-option button styling that mirrors the native Request Revisions modal
// (see local/context/comp-use/qa/quality-buttons-selected.html and rr-quality-ratings.html).
// NOTE: the native "Average" option has IDENTICAL classes selected vs. unselected, so it is
// impossible to detect Average's selection from classes alone — the click handler in
// `bindNativePromptQuality` writes `state.rrData.promptQualityRating` directly so we can
// still reflect Average selections in the tab without reading them back from native.
const RR_PROMPT_QUALITY_BASE_CLASS = 'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500';
const RR_PROMPT_QUALITY_STYLES = {
    'Top 10%': {
        selected: 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        unselected: 'border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400',
        iconPaths: [
            'M7 10v12',
            'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z'
        ]
    },
    'Average': {
        selected: 'border-gray-300 bg-gray-50 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
        unselected: 'border-gray-300 bg-gray-50 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
        iconPaths: ['M5 12h14']
    },
    'Bottom 10%': {
        selected: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
        unselected: 'border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400',
        iconPaths: [
            'M17 14V2',
            'M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z'
        ]
    }
};
const RR_MAX_SCREENSHOTS = 5;
const RR_MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const RR_DELETE_FLUSH_DELAY_MS = 200;

function createDefaultRejectionReasons() {
    return RR_REJECTION_REASONS.reduce((acc, label) => {
        acc[label] = false;
        return acc;
    }, {});
}

function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
}

function createDefaultQaChecklist() {
    return RR_QA_CHECKLIST_ITEMS.reduce((acc, label) => {
        acc[label] = false;
        return acc;
    }, {});
}

function imageFilesFromFileList(list) {
    if (!list || !list.length) return [];
    return Array.from(list).filter((file) => file?.type?.startsWith('image/'));
}

function imageFilesFromClipboard(clipboardData) {
    if (!clipboardData) return [];
    const fromFiles = imageFilesFromFileList(clipboardData.files);
    if (fromFiles.length) return fromFiles;
    const items = clipboardData.items;
    if (!items) return [];
    const out = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (file && file.type.startsWith('image/')) out.push(file);
    }
    return out;
}

function shouldIgnorePasteTarget(target) {
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return false;
    const el = target;
    if (el.closest('textarea, select, [contenteditable="true"]')) return true;
    const input = el.closest('input');
    if (!input) return false;
    const type = (input.getAttribute('type') || 'text').toLowerCase();
    return !new Set(['file', 'button', 'submit', 'reset', 'checkbox', 'radio', 'hidden']).has(type);
}

function screenshotKeyFromUrl(url) {
    if (!url) return '';
    try {
        return new URL(url, window.location.href).pathname;
    } catch (_error) {
        return String(url).split('?')[0];
    }
}

function formatBoolMap(map) {
    if (!map) return '';
    return Object.keys(map)
        .filter((key) => map[key])
        .map((key) => key.replace(/\s+/g, ' ').slice(0, 48))
        .join('|');
}

const plugin = {
    id: 'requestRevisionsTab',
    name: 'Request Revisions Tab',
    description: 'Adds a Request Revisions tab that imports, exports, and submits through short-lived native modal transactions',
    _version: '2.2',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        tabInjected: false,
        tabButton: null,
        contentPanel: null,
        taskIssuesTextarea: null,
        attemptedActionsTextarea: null,
        generalFeedbackTextarea: null,
        otherReasonTextarea: null,
        otherReasonWrap: null,
        screenshotPreviewWrap: null,
        screenshotUploadButton: null,
        screenshotPasteButton: null,
        screenshotCountLabel: null,
        tabActive: false,
        rrData: {
            taskIssues: '',
            attemptedActions: '',
            generalRevisionFeedback: '',
            otherReasonExplanation: '',
            rejectionReasons: createDefaultRejectionReasons(),
            qaChecklist: createDefaultQaChecklist(),
            promptQualityRating: '',
            screenshots: [],
            deletedScreenshotUrls: []
        },
        transactionInProgress: false,
        transactionModal: null,
        transactionBackdrop: null,
        nativeSyncBindings: [],
        nativeToCustomHandler: null,
        nativeSyncObserver: null,
        nativeSyncModal: null,
        syncingToNative: false,
        syncingFromNative: false,
        nativeScreenshotStylesReady: false,
        nativeScreenshotControlsLogged: false,
        previewUrls: [],
        pasteListenerAttached: false,
        originalBodyPointerEvents: null,
        originalHtmlPointerEvents: null,
        pointerLockReleased: false,
        missingLogged: false,
        lastRrDebugDigest: '',
        rrTextLogTimer: null,
        rrTextLogPending: null,
        rrNativeTextLogTimer: null,
        rrNativeTextLogPending: null,
        lastNativeTextDebugSig: '',
        lastCustomTextDebugSig: '',
        promptQualitySource: '',
        nativePromptQualityClickAt: 0,
        lastScreenshotSyncResult: null,
        deleteFlushTimer: null,
        promptQualityRatingLastSyncedToNative: ''
    },

    buildRrStateDigest(state) {
        const d = state.rrData || {};
        const shots = d.screenshots || [];
        const uploadedKeys = shots
            .filter((entry) => entry.type === 'uploaded' && entry.url)
            .map((entry) => screenshotKeyFromUrl(entry.url));
        const pendingMeta = shots
            .filter((entry) => entry.type === 'pending' && entry.file)
            .map((entry) => `${entry.file.name}:${entry.file.size}`);
        const del = (d.deletedScreenshotUrls || []).join('|');
        return [
            `rej:${formatBoolMap(d.rejectionReasons)}`,
            `qa:${formatBoolMap(d.qaChecklist)}`,
            `pq:${d.promptQualityRating || ''}`,
            `ssU:${uploadedKeys.join(',')}`,
            `ssP:${pendingMeta.join(',')}`,
            `ssD:${del}`
        ].join('§');
    },

    debugLogRrDigestIfChanged(state, label) {
        const digest = this.buildRrStateDigest(state);
        if (digest === state.lastRrDebugDigest) return;
        state.lastRrDebugDigest = digest;
        const d = state.rrData || {};
        const activeReasons = Object.keys(d.rejectionReasons || {}).filter((k) => d.rejectionReasons[k]);
        const activeQa = Object.keys(d.qaChecklist || {}).filter((k) => d.qaChecklist[k]);
        const uploaded = (d.screenshots || []).filter((e) => e.type === 'uploaded').length;
        const pending = (d.screenshots || []).filter((e) => e.type === 'pending').length;
        const reasonSummary = activeReasons.length
            ? activeReasons.map((r) => r.slice(0, 40)).join('; ')
            : 'none';
        Logger.debug(
            `requestRevisionsTab: ${label} — ` +
            `promptQuality="${d.promptQualityRating || 'none'}", ` +
            `reasons=[${reasonSummary}], ` +
            `qaChecklist=${activeQa.length}/${RR_QA_CHECKLIST_ITEMS.length} checked, ` +
            `screenshots(uploaded=${uploaded} pending=${pending} deleteQueue=${(d.deletedScreenshotUrls || []).length})`
        );
    },

    scheduleCustomTextFieldDebug(state, field, value) {
        if (state.syncingFromNative) return;
        state.rrTextLogPending = { field, value };
        if (state.rrTextLogTimer) clearTimeout(state.rrTextLogTimer);
        state.rrTextLogTimer = setTimeout(() => {
            state.rrTextLogTimer = null;
            const pending = state.rrTextLogPending;
            state.rrTextLogPending = null;
            if (!pending) return;
            const sig = `custom:${pending.field}:${pending.value || ''}`;
            if (sig === state.lastCustomTextDebugSig) return;
            state.lastCustomTextDebugSig = sig;
            const text = pending.value || '';
            const len = text.length;
            const head = text.slice(0, 120).replace(/\s+/g, ' ');
            Logger.debug(
                `requestRevisionsTab: custom textarea settled field=${pending.field} len=${len} head="${head}"`
            );
        }, 350);
    },

    scheduleNativeModalTextDebug(state, snapshot) {
        if (!snapshot) return;
        state.rrNativeTextLogPending = { snapshot };
        if (state.rrNativeTextLogTimer) clearTimeout(state.rrNativeTextLogTimer);
        state.rrNativeTextLogTimer = setTimeout(() => {
            state.rrNativeTextLogTimer = null;
            const pending = state.rrNativeTextLogPending;
            state.rrNativeTextLogPending = null;
            if (!pending?.snapshot) return;
            const snap = pending.snapshot;
            const parts = [];
            if (snap.hasTaskIssues) {
                const t = snap.taskIssues || '';
                parts.push(`taskIssues len=${t.length} head="${t.slice(0, 120).replace(/\s+/g, ' ')}"`);
            }
            if (snap.hasAttemptedActions) {
                const t = snap.attemptedActions || '';
                parts.push(`attemptedActions len=${t.length} head="${t.slice(0, 120).replace(/\s+/g, ' ')}"`);
            }
            if (snap.hasGeneralRevisionFeedback) {
                const t = snap.generalRevisionFeedback || '';
                parts.push(`generalFeedback len=${t.length} head="${t.slice(0, 120).replace(/\s+/g, ' ')}"`);
            }
            if (snap.hasOtherReasonExplanation) {
                const t = snap.otherReasonExplanation || '';
                parts.push(`otherExplanation len=${t.length} head="${t.slice(0, 120).replace(/\s+/g, ' ')}"`);
            }
            if (!parts.length) return;
            const sig = [
                snap.hasTaskIssues ? snap.taskIssues || '' : '',
                snap.hasAttemptedActions ? snap.attemptedActions || '' : '',
                snap.hasGeneralRevisionFeedback ? snap.generalRevisionFeedback || '' : '',
                snap.hasOtherReasonExplanation ? snap.otherReasonExplanation || '' : ''
            ].join('§');
            if (sig === state.lastNativeTextDebugSig) return;
            state.lastNativeTextDebugSig = sig;
            Logger.debug(`requestRevisionsTab: native textarea settled ${parts.join(' | ')}`);
        }, 350);
    },

    onMutation(state) {
        const tabList = this.findTabList();
        const contentHost = this.findContentHost();
        if (!tabList || !contentHost) {
            if (!state.missingLogged) {
                Logger.debug('Request Revisions Tab: tab list or content host not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        if (!state.tabInjected || !document.querySelector(`[${RR_TAB_MARKER}="true"]`)) {
            this.injectTab(state, tabList, contentHost);
        }

        this.ensurePasteListener(state);
        this.syncTabVisibility(state);
        this.bindDirectNativeModalSync(state);
        this.ensureNativeScreenshotUploadControls(state);
    },

    findTabList() {
        const instanceTab = document.querySelector('[data-ui="qa-instance-tab"]');
        return instanceTab?.closest('[role="tablist"]') || instanceTab?.parentElement || null;
    },

    findContentHost() {
        const instanceContent = document.querySelector('[data-ui="qa-instance-content"]');
        return instanceContent?.parentElement || null;
    },

    findNativeRequestRevisionsButton() {
        return document.querySelector('[data-ui="request-revisions"]');
    },

    isNativeRequestRevisionsAvailable() {
        const button = this.findNativeRequestRevisionsButton();
        if (!button || button.disabled) return false;
        const style = window.getComputedStyle(button);
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            button.getClientRects().length > 0;
    },

    syncTabVisibility(state) {
        if (!state.tabButton) return;
        const available = this.isNativeRequestRevisionsAvailable();
        state.tabButton.style.display = available ? '' : 'none';
        if (!available && state.tabActive) {
            Logger.info('Request Revisions Tab: native Request Revisions button unavailable, deactivating tab');
            this.deactivateRRTab(state);
        }
    },

    injectTab(state, tabList, contentHost) {
        const existingTab = tabList.querySelector(`[${RR_TAB_MARKER}="true"]`);
        const existingPanel = contentHost.querySelector(`[${RR_PANEL_MARKER}="true"]`);
        if (existingTab && existingPanel) {
            state.tabButton = existingTab;
            state.contentPanel = existingPanel;
            this.bindCustomControls(state, existingPanel);
            state.tabInjected = true;
            return;
        }

        const instanceTab = document.querySelector('[data-ui="qa-instance-tab"]');
        const tabButton = document.createElement('button');
        tabButton.type = 'button';
        tabButton.setAttribute('role', 'tab');
        tabButton.setAttribute('aria-selected', 'false');
        tabButton.setAttribute('aria-controls', 'fleet-rr-tab-content');
        tabButton.setAttribute('data-state', 'inactive');
        tabButton.setAttribute('data-orientation', 'horizontal');
        tabButton.setAttribute(RR_TAB_MARKER, 'true');
        tabButton.setAttribute('data-fleet-plugin', this.id);
        tabButton.style.display = this.isNativeRequestRevisionsAvailable() ? '' : 'none';
        tabButton.className = instanceTab?.className ||
            'justify-center whitespace-nowrap font-medium transition-all disabled:pointer-events-none text-muted-foreground px-3 bg-transparent ring-0 outline-none shadow-none rounded-none m-0 pt-1.5 pb-2.5 relative isolate before:absolute before:bottom-0 before:left-0 before:right-0 before:h-0.5 before:bg-transparent hover:before:bg-border data-[state=active]:before:bg-primary data-[state=active]:text-primary before:z-10 after:absolute after:inset-x-0.5 after:top-0.5 after:bottom-2.5 after:rounded-md after:bg-transparent hover:after:bg-accent after:-z-[1] after:transition-colors text-xs w-full flex items-center gap-1.5';
        tabButton.appendChild(this.createWarningIcon());
        tabButton.appendChild(document.createTextNode('Request Revisions'));
        tabButton.addEventListener('click', (event) => {
            event.preventDefault();
            this.activateRRTab(state);
        });
        tabList.appendChild(tabButton);

        const panel = this.createContentPanel(state);
        if (!contentHost.style.position) {
            contentHost.style.position = 'relative';
        }
        contentHost.appendChild(panel);

        for (const nativeTab of document.querySelectorAll('[data-ui="qa-instance-tab"], [data-ui="qa-verifier-tab"]')) {
            if (nativeTab.getAttribute('data-fleet-rr-native-listener') === 'true') continue;
            nativeTab.setAttribute('data-fleet-rr-native-listener', 'true');
            nativeTab.addEventListener('click', () => this.deactivateRRTab(state));
        }

        state.tabButton = tabButton;
        state.contentPanel = panel;
        this.bindCustomControls(state, panel);
        state.tabInjected = true;
        Logger.log('Request Revisions Tab: tab injected');
    },

    createWarningIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('class', 'size-4 text-red-600');
        const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path1.setAttribute('d', 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z');
        const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('d', 'M12 9v4');
        const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path3.setAttribute('d', 'M12 17h.01');
        svg.appendChild(path1);
        svg.appendChild(path2);
        svg.appendChild(path3);
        return svg;
    },

    createContentPanel(state) {
        const panel = document.createElement('div');
        panel.id = 'fleet-rr-tab-content';
        panel.setAttribute(RR_PANEL_MARKER, 'true');
        panel.setAttribute('data-fleet-plugin', this.id);
        panel.className = 'absolute inset-0 z-40 hidden bg-background overflow-y-auto p-4';

        const wrap = document.createElement('div');
        wrap.className = 'max-w-3xl mx-auto space-y-4';

        wrap.appendChild(this.createQaChecklistSection(state));
        wrap.appendChild(this.createPromptQualitySection(state));
        wrap.appendChild(this.createReasonCheckboxesSection(state));
        wrap.appendChild(this.createOtherExplanationSection(state));
        wrap.appendChild(this.createTextareaSection(state, {
            title: 'What did you try?',
            placeholder: 'Describe all the things you tried to complete this task...',
            minHeightClass: 'min-h-[100px]',
            field: 'attemptedActions',
            optional: false
        }));
        wrap.appendChild(this.createTextareaSection(state, {
            title: 'Task Issues',
            placeholder: 'Describe the specific issues with the task...',
            minHeightClass: 'min-h-[160px]',
            field: 'taskIssues',
            optional: false
        }));
        wrap.appendChild(this.createScreenshotSection(state));
        wrap.appendChild(this.createTextareaSection(state, {
            title: 'General revision feedback',
            placeholder: 'Optional: Add any additional general feedback about the task...',
            minHeightClass: 'min-h-[120px]',
            field: 'generalRevisionFeedback',
            optional: true
        }));

        const buttonRow = document.createElement('div');
        buttonRow.className = 'flex flex-wrap items-center justify-end gap-2 pt-2';
        const simulateButton = this.createActionButton('Simulate R&NA', () => {
            void this.runSteppedSubmit(state, { mode: 'simulate' });
        });
        simulateButton.title = 'Dev/debug: run the full sync flow against the hidden native modal without clicking the real submit button';
        buttonRow.appendChild(simulateButton);
        buttonRow.appendChild(this.createActionButton('Silent Request', () => {
            void this.runSteppedSubmit(state, { mode: 'submit-silent' });
        }));
        buttonRow.appendChild(this.createActionButton('Request and Notify Author', () => {
            void this.runSteppedSubmit(state, { mode: 'submit-notify' });
        }, true));

        wrap.appendChild(buttonRow);
        panel.appendChild(wrap);
        return panel;
    },

    createQaChecklistSection(state) {
        const section = document.createElement('div');
        section.className = 'space-y-2';
        const title = document.createElement('div');
        title.className = 'text-sm text-muted-foreground font-medium';
        title.textContent = 'QA Checklist';
        const list = document.createElement('div');
        list.className = 'space-y-2.5 pl-1';

        for (const labelText of RR_QA_CHECKLIST_ITEMS) {
            const row = document.createElement('label');
            row.className = 'flex items-start gap-3 cursor-pointer';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.setAttribute(RR_CUSTOM_QA_MARKER, labelText);
            input.className = 'mt-0.5 size-4 rounded-sm border-input';
            input.addEventListener('change', () => {
                this.setQaChecklistItemFromCustom(state, labelText, input.checked);
            });
            const text = document.createElement('span');
            text.className = 'text-sm leading-relaxed';
            text.textContent = labelText;
            row.appendChild(input);
            row.appendChild(text);
            list.appendChild(row);
        }

        section.appendChild(title);
        section.appendChild(list);
        return section;
    },

    createPromptQualitySection(state) {
        const section = document.createElement('div');
        section.className = 'border-t pt-4';
        const title = document.createElement('div');
        title.className = 'text-xs font-medium text-muted-foreground';
        title.textContent = 'Prompt Quality Rating';
        const row = document.createElement('div');
        row.className = 'flex gap-2 mt-2';

        for (const option of RR_PROMPT_QUALITY_OPTIONS) {
            const styles = RR_PROMPT_QUALITY_STYLES[option];
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute(RR_CUSTOM_PROMPT_MARKER, option);
            button.className = `${RR_PROMPT_QUALITY_BASE_CLASS} ${styles.unselected}`;
            button.appendChild(this.createPromptQualityIcon(styles.iconPaths));
            button.appendChild(document.createTextNode(option));
            button.addEventListener('click', () => this.setPromptQualityFromCustom(state, option));
            row.appendChild(button);
        }

        const divider = document.createElement('span');
        divider.className = 'self-stretch w-px bg-border mx-0.5 shrink-0';
        divider.setAttribute('aria-hidden', 'true');
        row.appendChild(divider);

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.setAttribute('data-fleet-rr-pq-clear', 'true');
        clearBtn.className = 'flex items-center px-2 py-1.5 text-xs text-muted-foreground rounded-md border border-transparent hover:border-input hover:bg-accent hover:text-accent-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => {
            if (state.syncingFromNative) return;
            state.rrData.promptQualityRating = '';
            this.syncCustomControlsFromState(state);
            Logger.debug('requestRevisionsTab: custom prompt quality cleared');
        });
        row.appendChild(clearBtn);

        section.appendChild(title);
        section.appendChild(row);
        return section;
    },

    /**
     * Creates the SVG icon used in each prompt-quality button (matches the icons rendered
     * by the native Request Revisions modal — see context HTML files in
     * local/context/comp-use/qa/).
     */
    createPromptQualityIcon(paths) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('class', 'h-3.5 w-3.5');
        for (const d of paths) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            svg.appendChild(path);
        }
        return svg;
    },

    createScreenshotSection(state) {
        const section = document.createElement('div');
        section.className = 'space-y-2';

        const titleRow = document.createElement('div');
        titleRow.className = 'flex items-center justify-between gap-2';
        const title = document.createElement('div');
        title.className = 'text-sm text-muted-foreground font-medium';
        title.textContent = 'Screenshots (optional)';
        const counter = document.createElement('span');
        counter.className = 'text-xs text-muted-foreground tabular-nums';
        counter.setAttribute('data-fleet-rr-ss-counter', 'true');
        counter.textContent = `0/${RR_MAX_SCREENSHOTS}`;
        titleRow.appendChild(title);
        titleRow.appendChild(counter);

        const subtitle = document.createElement('p');
        subtitle.className = 'text-xs text-muted-foreground';
        subtitle.textContent = `Attach up to ${RR_MAX_SCREENSHOTS} screenshots to document visual issues (max 5MB each). Uploads happen when you click an action button.`;

        const controls = document.createElement('div');
        controls.className = 'flex flex-row flex-wrap gap-2 w-full min-w-0';

        const uploadButton = document.createElement('button');
        uploadButton.type = 'button';
        uploadButton.className = 'flex flex-1 min-w-0 items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-border hover:border-brand/50 hover:bg-muted/50 cursor-pointer transition-colors';
        uploadButton.innerHTML = '<span class="text-sm whitespace-nowrap">Drag & Drop/Upload</span>';
        uploadButton.addEventListener('click', () => this.openScreenshotPicker(state));
        this.bindCustomScreenshotDragAndDrop(state, uploadButton);

        const pasteButton = document.createElement('button');
        pasteButton.type = 'button';
        pasteButton.className = 'inline-flex shrink-0 items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-border hover:border-brand/50 hover:bg-muted/50 cursor-pointer transition-colors text-sm';
        pasteButton.textContent = 'Paste Image';
        pasteButton.addEventListener('click', () => this.pasteScreenshotFromClipboard(state));

        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'file';
        hiddenInput.accept = 'image/*';
        hiddenInput.multiple = true;
        hiddenInput.className = 'hidden';
        hiddenInput.setAttribute('data-fleet-rr-custom-ss-picker', 'true');
        hiddenInput.addEventListener('change', () => {
            this.mergeCustomScreenshots(state, imageFilesFromFileList(hiddenInput.files));
            hiddenInput.value = '';
        });

        const previewWrap = document.createElement('div');
        previewWrap.className = 'grid grid-cols-2 md:grid-cols-3 gap-2';
        previewWrap.setAttribute(RR_CUSTOM_SS_PREVIEW, 'true');

        controls.appendChild(uploadButton);
        controls.appendChild(pasteButton);
        controls.appendChild(hiddenInput);
        section.appendChild(titleRow);
        section.appendChild(subtitle);
        section.appendChild(controls);
        section.appendChild(previewWrap);
        return section;
    },

    createReasonCheckboxesSection(state) {
        const section = document.createElement('div');
        section.className = 'space-y-2';
        const label = document.createElement('div');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Reason(s) for rejection';
        const list = document.createElement('div');
        list.className = 'rounded-md border p-2 space-y-1 border-input';

        for (const reason of RR_REJECTION_REASONS) {
            const row = document.createElement('label');
            row.className = 'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.setAttribute(RR_CUSTOM_REASON_MARKER, reason);
            input.className = 'size-4 rounded-sm border-input';
            input.addEventListener('change', () => {
                this.setRejectionReasonFromCustom(state, reason, input.checked);
            });
            const text = document.createElement('span');
            text.textContent = reason;
            row.appendChild(input);
            row.appendChild(text);
            list.appendChild(row);
        }

        section.appendChild(label);
        section.appendChild(list);
        return section;
    },

    createOtherExplanationSection(state) {
        const section = document.createElement('div');
        section.className = 'space-y-2 hidden';
        section.setAttribute('data-fleet-rr-custom-other-wrap', 'true');

        const label = document.createElement('label');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Please explain';

        const textarea = document.createElement('textarea');
        textarea.className =
            'flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y';
        textarea.placeholder = 'Explain why you are rejecting this task...';
        textarea.setAttribute('data-fleet-rr-custom-field', 'otherReasonExplanation');
        textarea.addEventListener('input', () => {
            this.updateOtherReasonExplanationFromCustom(state, textarea.value);
        });

        section.appendChild(label);
        section.appendChild(textarea);
        return section;
    },

    createTextareaSection(state, config) {
        const section = document.createElement('div');
        section.className = 'space-y-2';
        const label = document.createElement('label');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = config.optional ? `${config.title} (optional)` : config.title;

        const textarea = document.createElement('textarea');
        textarea.className =
            `flex ${config.minHeightClass} w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y`;
        textarea.placeholder = config.placeholder;
        textarea.setAttribute('data-fleet-rr-custom-field', config.field);
        textarea.addEventListener('input', () => this.updateCustomFieldFromInput(state, config.field, textarea.value));

        section.appendChild(label);
        section.appendChild(textarea);
        return section;
    },

    createActionButton(label, onClick, primary = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = primary
            ? 'inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:text-destructive-foreground transition-colors hover:bg-destructive h-9 pl-4 pr-4 py-2'
            : 'inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-9 pl-4 pr-4 py-2';
        button.textContent = label;
        button.addEventListener('click', onClick);
        return button;
    },

    activateRRTab(state) {
        if (!state.contentPanel || !state.tabButton) return;
        if (!this.isNativeRequestRevisionsAvailable()) {
            Logger.warn('Request Revisions Tab: native Request Revisions button is not available');
            return;
        }
        state.tabActive = true;
        state.contentPanel.classList.remove('hidden');
        this.syncTabState(state, true);
        this.syncCustomControlsFromState(state);
        Logger.info('Request Revisions Tab: activated');
        this.runNativeModalTransaction(state, { mode: 'import', hidden: true });
    },

    deactivateRRTab(state) {
        if (!state.tabActive) return;
        state.tabActive = false;
        if (state.contentPanel) {
            state.contentPanel.classList.add('hidden');
        }
        this.syncTabState(state, false);
        this.runNativeModalTransaction(state, { mode: 'export', hidden: true, skipScreenshots: true });
        Logger.info('Request Revisions Tab: deactivated');
    },

    syncTabState(state, active) {
        const rrTab = state.tabButton;
        if (rrTab) {
            rrTab.setAttribute('aria-selected', active ? 'true' : 'false');
            rrTab.setAttribute('data-state', active ? 'active' : 'inactive');
        }

        for (const nativeTab of document.querySelectorAll('[data-ui="qa-instance-tab"], [data-ui="qa-verifier-tab"]')) {
            if (active) {
                nativeTab.setAttribute('aria-selected', 'false');
                nativeTab.setAttribute('data-state', 'inactive');
            }
        }
    },

    bindCustomControls(state, panel) {
        state.taskIssuesTextarea = panel.querySelector('[data-fleet-rr-custom-field="taskIssues"]');
        state.attemptedActionsTextarea = panel.querySelector('[data-fleet-rr-custom-field="attemptedActions"]');
        state.generalFeedbackTextarea = panel.querySelector('[data-fleet-rr-custom-field="generalRevisionFeedback"]');
        state.otherReasonTextarea = panel.querySelector('[data-fleet-rr-custom-field="otherReasonExplanation"]');
        state.otherReasonWrap = panel.querySelector('[data-fleet-rr-custom-other-wrap="true"]');
        state.screenshotPreviewWrap = panel.querySelector(`[${RR_CUSTOM_SS_PREVIEW}]`);
        const picker = panel.querySelector('[data-fleet-rr-custom-ss-picker]');
        const controlsRow = picker?.parentElement;
        state.screenshotUploadButton = controlsRow?.querySelector('button:nth-of-type(1)') || null;
        state.screenshotPasteButton = controlsRow?.querySelector('button:nth-of-type(2)') || null;
        state.screenshotCountLabel = panel.querySelector('[data-fleet-rr-ss-counter="true"]');
    },

    updateCustomFieldFromInput(state, field, value) {
        if (state.syncingFromNative) return;
        if (field === 'taskIssues') state.rrData.taskIssues = value || '';
        if (field === 'attemptedActions') state.rrData.attemptedActions = value || '';
        if (field === 'generalRevisionFeedback') state.rrData.generalRevisionFeedback = value || '';
        if (field === 'otherReasonExplanation') state.rrData.otherReasonExplanation = value || '';
        this.scheduleCustomTextFieldDebug(state, field, value);
    },

    setQaChecklistItemFromCustom(state, label, checked) {
        if (state.syncingFromNative) return;
        state.rrData.qaChecklist[label] = Boolean(checked);
        Logger.debug(`requestRevisionsTab: custom QA checklist "${label}" → ${Boolean(checked)}`);
    },

    setPromptQualityFromCustom(state, option) {
        if (state.syncingFromNative) return;
        state.promptQualitySource = 'custom';
        state.rrData.promptQualityRating = option;
        this.syncCustomControlsFromState(state);
        Logger.debug(`requestRevisionsTab: custom prompt quality → "${option}"`);
    },

    bindCustomScreenshotDragAndDrop(state, target) {
        let depth = 0;
        const classes = ['ring-2', 'ring-brand/50'];
        target.addEventListener('dragenter', (event) => {
            event.preventDefault();
            depth += 1;
            target.classList.add(...classes);
        });
        target.addEventListener('dragleave', (event) => {
            event.preventDefault();
            depth = Math.max(0, depth - 1);
            if (depth === 0) target.classList.remove(...classes);
        });
        target.addEventListener('dragover', (event) => event.preventDefault());
        target.addEventListener('drop', (event) => {
            event.preventDefault();
            depth = 0;
            target.classList.remove(...classes);
            this.mergeCustomScreenshots(state, imageFilesFromFileList(event.dataTransfer?.files));
        });
    },

    openScreenshotPicker(state) {
        const input = state.contentPanel?.querySelector('[data-fleet-rr-custom-ss-picker]');
        if (input) input.click();
    },

    async pasteScreenshotFromClipboard(state) {
        if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
            Logger.warn('requestRevisionsTab: Clipboard read API unavailable for screenshot paste');
            return;
        }
        try {
            const items = await navigator.clipboard.read();
            const files = [];
            for (const item of items) {
                for (const type of item.types) {
                    if (!type.startsWith('image/')) continue;
                    const blob = await item.getType(type);
                    const ext = (type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
                    files.push(new File([blob], `paste-${Date.now()}.${ext}`, { type: blob.type || type }));
                    break;
                }
            }
            if (!files.length) {
                Logger.info('requestRevisionsTab: clipboard contained no image');
                return;
            }
            this.mergeCustomScreenshots(state, files);
        } catch (error) {
            Logger.error('requestRevisionsTab: failed to read clipboard image', error);
        }
    },

    mergeCustomScreenshots(state, files) {
        if (!files?.length) return;
        const next = [...(state.rrData.screenshots || [])];
        const beforeCount = next.length;
        const added = [];
        const droppedAtCap = [];
        const droppedNonImage = [];
        const droppedOversized = [];
        for (const file of files) {
            if (next.length >= RR_MAX_SCREENSHOTS) {
                droppedAtCap.push(file);
                continue;
            }
            if (!file.type?.startsWith('image/')) {
                droppedNonImage.push(file);
                continue;
            }
            if (file.size > RR_MAX_SCREENSHOT_BYTES) {
                droppedOversized.push(file);
                continue;
            }
            next.push({
                type: 'pending',
                file,
                localUrl: URL.createObjectURL(file)
            });
            added.push(file);
        }
        state.rrData.screenshots = next;
        this.syncCustomControlsFromState(state);
        for (const file of added) {
            Logger.log(
                `Request Revisions Tab: screenshot added to tab name=${file.name} bytes=${file.size} total=${state.rrData.screenshots.length}/${RR_MAX_SCREENSHOTS} (will upload to native on action button click)`
            );
        }
        if (droppedAtCap.length) {
            Logger.warn(
                `Request Revisions Tab: ${droppedAtCap.length} screenshot(s) ignored — tab is at cap (${beforeCount}/${RR_MAX_SCREENSHOTS}); remove one before adding more`
            );
        }
        if (droppedNonImage.length) {
            Logger.warn(`Request Revisions Tab: ${droppedNonImage.length} non-image file(s) ignored`);
        }
        if (droppedOversized.length) {
            const names = droppedOversized.map((f) => f.name).join(', ');
            Logger.warn(`Request Revisions Tab: ${droppedOversized.length} screenshot(s) over 5MB ignored (${names})`);
        }
        if (!added.length && !droppedAtCap.length && !droppedNonImage.length && !droppedOversized.length) {
            Logger.debug('requestRevisionsTab: custom screenshot merge skipped (no candidates)');
        }
    },

    removeCustomScreenshotAt(state, index) {
        const entry = state.rrData.screenshots?.[index];
        if (!entry) return;
        const kind = entry.type;
        const urlKey = entry.type === 'uploaded' ? screenshotKeyFromUrl(entry.url) : '';
        const meta =
            kind === 'pending'
                ? `file=${entry.file?.name || '?'}`
                : `urlKey=${urlKey}`;
        if (entry.type === 'pending' && entry.localUrl) {
            URL.revokeObjectURL(entry.localUrl);
        }
        if (entry.type === 'uploaded') {
            const visible = this.findRequestRevisionsModal();
            const visibleNative = visible && !visible.hasAttribute(RR_MANAGED_MODAL_MARKER) && this.isNativeModalOpen(visible);
            const removeButton = visibleNative ? this.findNativeScreenshotRemoveButton(visible, entry.url) : null;
            if (removeButton) {
                Logger.log(`Request Revisions Tab: clicking remove on visible native modal urlKey=${urlKey}`);
                removeButton.click();
            } else {
                this.queueScreenshotDeleteToNative(state, urlKey);
            }
        }
        state.rrData.screenshots = (state.rrData.screenshots || []).filter((_, idx) => idx !== index);
        this.syncCustomControlsFromState(state);
        Logger.log(
            `Request Revisions Tab: screenshot removed from tab idx=${index} type=${kind} ${meta} total=${state.rrData.screenshots.length}/${RR_MAX_SCREENSHOTS}`
        );
    },

    /**
     * Queues a previously-uploaded screenshot URL for deletion in the native modal and
     * schedules a single hidden-modal flush pass shortly after (debounced so a burst of
     * X-clicks in the tab translates into ONE open/delete-many/close cycle, not many).
     * Used when no native dialog is visible at the moment of the tab delete.
     */
    queueScreenshotDeleteToNative(state, urlKey) {
        if (!urlKey) return;
        const queue = state.rrData.deletedScreenshotUrls || [];
        if (!queue.includes(urlKey)) {
            state.rrData.deletedScreenshotUrls = [...queue, urlKey];
        }
        Logger.log(
            `Request Revisions Tab: queued native screenshot delete urlKey=${urlKey} queueDepth=${state.rrData.deletedScreenshotUrls.length}`
        );
        if (state.deleteFlushTimer) clearTimeout(state.deleteFlushTimer);
        state.deleteFlushTimer = setTimeout(() => {
            state.deleteFlushTimer = null;
            void this.flushPendingScreenshotDeletes(state);
        }, RR_DELETE_FLUSH_DELAY_MS);
    },

    /**
     * Opens the native modal hidden, clicks the X on each queued (already-uploaded) URL,
     * and closes the modal. Skips itself silently if a transaction is already in
     * progress (the action button's stepped submit also processes the delete queue) and
     * reschedules so the deletes still get applied once the in-flight transaction ends.
     */
    async flushPendingScreenshotDeletes(state) {
        const queue = (state.rrData.deletedScreenshotUrls || []).slice();
        if (!queue.length) return;
        if (state.transactionInProgress) {
            Logger.debug(`requestRevisionsTab: deferring native screenshot delete flush — transaction in progress (queueDepth=${queue.length})`);
            if (state.deleteFlushTimer) clearTimeout(state.deleteFlushTimer);
            state.deleteFlushTimer = setTimeout(() => {
                state.deleteFlushTimer = null;
                void this.flushPendingScreenshotDeletes(state);
            }, RR_DELETE_FLUSH_DELAY_MS * 2);
            return;
        }

        state.transactionInProgress = true;
        let modal = null;
        const startedAt = Date.now();
        Logger.log(`Request Revisions Tab: native screenshot delete flush START queueDepth=${queue.length}`);
        try {
            modal = await this.openNativeModal(state, { hidden: true });
            if (!modal) {
                Logger.warn('Request Revisions Tab: native screenshot delete flush could not open hidden modal');
                return;
            }
            const remaining = [];
            let removed = 0;
            for (const urlKey of queue) {
                const removeButton = this.findNativeScreenshotRemoveButton(modal, urlKey);
                if (!removeButton) {
                    Logger.debug(`requestRevisionsTab: native screenshot to delete not found in modal urlKey=${urlKey} (already gone?)`);
                    continue;
                }
                removeButton.click();
                await this.waitForNativeScreenshotRemoved(modal, urlKey, 3000);
                if (this.findNativeScreenshotRemoveButton(modal, urlKey)) {
                    Logger.warn(`Request Revisions Tab: native screenshot still present after click urlKey=${urlKey}`);
                    remaining.push(urlKey);
                } else {
                    removed += 1;
                }
            }
            state.rrData.deletedScreenshotUrls = remaining;
            Logger.log(
                `Request Revisions Tab: native screenshot delete flush FINISH removed=${removed}/${queue.length} took=${Date.now() - startedAt}ms`
            );
        } catch (err) {
            Logger.error('Request Revisions Tab: native screenshot delete flush threw', err);
        } finally {
            if (modal && document.body.contains(modal)) {
                this.closeNativeModal(modal);
            }
            this.cleanupTransactionStyles(state);
            state.transactionModal = null;
            state.transactionBackdrop = null;
            state.transactionInProgress = false;
            state.nativeSyncModal = null;
        }
    },

    /**
     * Returns total tab screenshots = uploaded + pending. Used for the visible counter
     * and to enforce RR_MAX_SCREENSHOTS on the upload/paste buttons.
     */
    countTabScreenshots(state) {
        return (state.rrData.screenshots || []).length;
    },

    /**
     * Disables the tab's upload/paste buttons when the tab is at RR_MAX_SCREENSHOTS so
     * workers cannot add more (the native modal still enforces its own limit). Updates the
     * "X/RR_MAX_SCREENSHOTS" counter shown next to the section title.
     */
    updateScreenshotControlsAvailability(state) {
        const total = this.countTabScreenshots(state);
        const atCap = total >= RR_MAX_SCREENSHOTS;
        if (state.screenshotCountLabel) {
            state.screenshotCountLabel.textContent = `${total}/${RR_MAX_SCREENSHOTS}`;
            state.screenshotCountLabel.classList.toggle('text-red-600', atCap);
        }
        for (const btn of [state.screenshotUploadButton, state.screenshotPasteButton]) {
            if (!btn) continue;
            btn.disabled = atCap;
            btn.classList.toggle('opacity-50', atCap);
            btn.classList.toggle('cursor-not-allowed', atCap);
            btn.title = atCap ? `At cap of ${RR_MAX_SCREENSHOTS} screenshots — remove one to add more` : '';
        }
    },

    renderCustomScreenshotPreviews(state) {
        if (!state.screenshotPreviewWrap) return;
        const activeLocalUrls = new Set(
            (state.rrData.screenshots || [])
                .filter((entry) => entry.type === 'pending' && entry.localUrl)
                .map((entry) => entry.localUrl)
        );
        for (const url of state.previewUrls || []) {
            if (!activeLocalUrls.has(url)) URL.revokeObjectURL(url);
        }
        state.previewUrls = Array.from(activeLocalUrls);
        state.screenshotPreviewWrap.innerHTML = '';

        (state.rrData.screenshots || []).forEach((entry, index) => {
            const card = document.createElement('div');
            card.className = 'group relative rounded-md border border-input overflow-hidden bg-muted/20';
            const img = document.createElement('img');
            img.className = 'w-full h-24 object-cover';
            img.alt = entry.alt || entry.file?.name || `Screenshot ${index + 1}`;
            img.src = entry.type === 'uploaded' ? entry.url : entry.localUrl;

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.setAttribute(RR_CUSTOM_SS_REMOVE, String(index));
            remove.className = 'absolute top-1 right-1 h-6 w-6 rounded-full bg-red-600 text-white text-sm leading-none opacity-0 group-hover:opacity-100 transition-opacity';
            remove.textContent = 'x';
            remove.addEventListener('click', () => this.removeCustomScreenshotAt(state, index));

            card.appendChild(img);
            card.appendChild(remove);
            state.screenshotPreviewWrap.appendChild(card);
        });
    },

    ensurePasteListener(state) {
        if (state.pasteListenerAttached) return;
        state.pasteListenerAttached = true;
        document.addEventListener(
            'paste',
            (event) => {
                const files = imageFilesFromClipboard(event.clipboardData);
                if (!files.length) return;
                if (shouldIgnorePasteTarget(event.target)) return;
                const nativeInput = document.querySelector(`input[${RR_NATIVE_SS_INPUT_ATTR}]`);
                if (nativeInput && document.contains(nativeInput)) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.mergeIntoNativeScreenshotInput(nativeInput, files);
                    return;
                }
                if (!state.tabActive) return;
                event.preventDefault();
                event.stopPropagation();
                this.mergeCustomScreenshots(state, files);
            },
            true
        );
    },

    ensureNativeScreenshotUploadControls(state) {
        this.ensureNativeScreenshotStyles(state);
        const modal = this.findRequestRevisionsModal();
        if (!modal || modal.hasAttribute(RR_MANAGED_MODAL_MARKER) || !this.isNativeModalOpen(modal)) return;
        const input = this.findNativeScreenshotInput(modal);
        const label = input?.closest('label');
        if (!input || !label) return;

        const zone = label.parentElement;
        if (!zone) return;
        this.removeDuplicateNativeScreenshotControls(zone, label);
        if (zone.querySelector(`[${RR_NATIVE_SS_CONTROLS_ATTR}]`)) return;

        label.setAttribute(RR_NATIVE_SS_LABEL_ATTR, 'true');
        input.setAttribute(RR_NATIVE_SS_INPUT_ATTR, 'true');

        const row = document.createElement('div');
        row.setAttribute(RR_NATIVE_SS_CONTROLS_ATTR, 'true');
        row.setAttribute('data-fleet-plugin', this.id);
        row.className = 'flex flex-row flex-wrap gap-2 w-full min-w-0';

        const upload = document.createElement('button');
        upload.type = 'button';
        upload.setAttribute(RR_NATIVE_SS_UPLOAD_ATTR, 'true');
        upload.className = 'flex flex-1 min-w-0 items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-border hover:border-brand/50 hover:bg-muted/50 cursor-pointer transition-colors';
        upload.setAttribute('aria-label', 'Drag and drop images here or click to upload screenshots');
        upload.innerHTML = '<span class="text-sm whitespace-nowrap">Drag &amp; Drop/Upload</span>';
        upload.addEventListener('click', () => input.click());
        this.bindNativeScreenshotDragAndDrop(upload, input);

        const paste = document.createElement('button');
        paste.type = 'button';
        paste.setAttribute(RR_NATIVE_SS_PASTE_ATTR, 'true');
        paste.className = 'inline-flex shrink-0 items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-border hover:border-brand/50 hover:bg-muted/50 cursor-pointer transition-colors text-sm';
        paste.textContent = 'Paste Image';
        paste.setAttribute('aria-label', 'Paste image from clipboard');
        paste.addEventListener('click', () => this.pasteImageIntoNativeInput(input));

        row.appendChild(upload);
        row.appendChild(paste);
        label.parentNode.insertBefore(row, label);

        if (!state.nativeScreenshotControlsLogged) {
            Logger.log('requestRevisionsTab: native screenshot upload controls injected');
            state.nativeScreenshotControlsLogged = true;
        }
    },

    ensureNativeScreenshotStyles(state) {
        const styleId = 'fleet-request-revisions-tab-native-screenshot-style';
        if (state.nativeScreenshotStylesReady && document.getElementById(styleId)) return;
        let style = document.getElementById(styleId);
        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            style.setAttribute('data-fleet-plugin', this.id);
            document.head.appendChild(style);
        }
        style.textContent = `
label[${RR_NATIVE_SS_LABEL_ATTR}] {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    clip-path: inset(50%) !important;
    white-space: nowrap !important;
    border: 0 !important;
}
`;
        state.nativeScreenshotStylesReady = true;
    },

    removeDuplicateNativeScreenshotControls(zone, label) {
        if (!zone.contains(label)) return;
        const rows = zone.querySelectorAll(`[${RR_NATIVE_SS_CONTROLS_ATTR}]`);
        for (let i = 1; i < rows.length; i++) rows[i].remove();
    },

    bindNativeScreenshotDragAndDrop(target, input) {
        let depth = 0;
        const classes = ['ring-2', 'ring-brand/50'];
        target.addEventListener('dragenter', (event) => {
            event.preventDefault();
            event.stopPropagation();
            depth += 1;
            target.classList.add(...classes);
        });
        target.addEventListener('dragleave', (event) => {
            event.preventDefault();
            event.stopPropagation();
            depth = Math.max(0, depth - 1);
            if (depth === 0) target.classList.remove(...classes);
        });
        target.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        target.addEventListener('drop', (event) => {
            event.preventDefault();
            event.stopPropagation();
            depth = 0;
            target.classList.remove(...classes);
            this.mergeIntoNativeScreenshotInput(input, imageFilesFromFileList(event.dataTransfer?.files));
        });
    },

    async pasteImageIntoNativeInput(input) {
        if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
            Logger.warn('requestRevisionsTab: Clipboard read API unavailable for native screenshot paste');
            return;
        }
        try {
            const items = await navigator.clipboard.read();
            const files = [];
            for (const item of items) {
                for (const type of item.types) {
                    if (!type.startsWith('image/')) continue;
                    const blob = await item.getType(type);
                    const ext = (type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
                    files.push(new File([blob], `paste-${Date.now()}.${ext}`, { type: blob.type || type }));
                    break;
                }
            }
            if (!files.length) {
                Logger.info('requestRevisionsTab: clipboard contained no native screenshot image');
                return;
            }
            this.mergeIntoNativeScreenshotInput(input, files);
        } catch (error) {
            Logger.error('requestRevisionsTab: failed to paste native screenshot image', error);
        }
    },

    mergeIntoNativeScreenshotInput(input, files) {
        if (!input || !files?.length) return;
        const before = input.files?.length || 0;
        const dt = new DataTransfer();
        const existing = Array.from(input.files || []);
        for (const file of existing) {
            if (dt.items.length >= RR_MAX_SCREENSHOTS) break;
            dt.items.add(file);
        }
        const accepted = [];
        for (const file of files) {
            if (dt.items.length >= RR_MAX_SCREENSHOTS) break;
            if (!file.type?.startsWith('image/')) continue;
            if (file.size > RR_MAX_SCREENSHOT_BYTES) continue;
            dt.items.add(file);
            accepted.push(file);
        }
        if (dt.files.length === before) {
            Logger.debug('requestRevisionsTab: native screenshot input merge no-op (unchanged or none accepted)');
            return;
        }
        const names = accepted.map((f) => `${f.name}:${f.size}`).join(', ');
        Logger.log(
            `Request Revisions Tab: native screenshot upload START (direct-to-native) files=+${accepted.length} (${names}) totalFiles=${dt.files.length}`
        );
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    },

    updateTaskIssuesFromCustom(state, value) {
        this.updateCustomFieldFromInput(state, 'taskIssues', value);
    },

    updateOtherReasonExplanationFromCustom(state, value) {
        this.updateCustomFieldFromInput(state, 'otherReasonExplanation', value);
    },

    setRejectionReasonFromCustom(state, label, checked) {
        if (state.syncingFromNative) return;
        state.rrData.rejectionReasons[label] = Boolean(checked);
        if (label === RR_REASON_OTHER_LABEL && !checked) {
            state.rrData.otherReasonExplanation = '';
        }
        this.syncCustomControlsFromState(state);
        Logger.debug(`requestRevisionsTab: custom rejection reason "${label}" → ${Boolean(checked)}`);
    },

    updateTaskIssuesFromNative(state, value) {
        state.rrData.taskIssues = value || '';
    },

    /**
     * Merge a native-modal snapshot into `state.rrData`.
     * `options.screenshotMergeMode`:
     *   - 'preserve-pending' (default): tab pending screenshots are kept; total = uploaded
     *     from native + tab pending, capped at RR_MAX_SCREENSHOTS. Used after manual native
     *     close and during live native↔tab sync.
     *   - 'replace-with-uploaded': drop all tab pending and use exactly native's uploaded
     *     list. Used after the stepped action button has just uploaded everything via the
     *     hidden modal — pending entries have all become uploaded server-side.
     */
    updateFromNativeModalSnapshot(state, snapshot, options = {}) {
        const screenshotMergeMode = options.screenshotMergeMode || 'preserve-pending';
        if (snapshot.hasTaskIssues) state.rrData.taskIssues = snapshot.taskIssues || '';
        if (snapshot.hasAttemptedActions) state.rrData.attemptedActions = snapshot.attemptedActions || '';
        if (snapshot.hasGeneralRevisionFeedback) {
            state.rrData.generalRevisionFeedback = snapshot.generalRevisionFeedback || '';
        }
        if (snapshot.hasRejectionReasons) {
            state.rrData.rejectionReasons = {
                ...createDefaultRejectionReasons(),
                ...(snapshot.rejectionReasons || {})
            };
        }
        if (snapshot.hasQaChecklist) {
            state.rrData.qaChecklist = {
                ...createDefaultQaChecklist(),
                ...(snapshot.qaChecklist || {})
            };
        }
        if (snapshot.hasPromptQualityRating) {
            if (snapshot.promptQualityRating) {
                state.rrData.promptQualityRating = snapshot.promptQualityRating;
            }
        }
        if (snapshot.hasScreenshots) {
            const deleted = new Set(state.rrData.deletedScreenshotUrls || []);
            const uploaded = (snapshot.screenshots || [])
                .filter((entry) => !deleted.has(screenshotKeyFromUrl(entry.url)));
            if (screenshotMergeMode === 'replace-with-uploaded') {
                state.rrData.screenshots = uploaded.slice(0, RR_MAX_SCREENSHOTS);
            } else {
                const pending = (state.rrData.screenshots || [])
                    .filter((entry) => entry.type === 'pending');
                state.rrData.screenshots = [
                    ...uploaded,
                    ...pending
                ].slice(0, RR_MAX_SCREENSHOTS);
            }
        }
        if (snapshot.hasOtherReasonExplanation) {
            state.rrData.otherReasonExplanation = snapshot.otherReasonExplanation || '';
        } else if (snapshot.hasRejectionReasons && !snapshot.rejectionReasons?.[RR_REASON_OTHER_LABEL]) {
            state.rrData.otherReasonExplanation = '';
        }
        this.syncCustomControlsFromState(state);
    },

    syncCustomControlsFromState(state) {
        if (!state.taskIssuesTextarea) return;
        state.syncingFromNative = true;
        try {
            this.setTextareaValueSilently(state.taskIssuesTextarea, state.rrData.taskIssues || '');
            this.setTextareaValueSilently(state.attemptedActionsTextarea, state.rrData.attemptedActions || '');
            this.setTextareaValueSilently(state.generalFeedbackTextarea, state.rrData.generalRevisionFeedback || '');

            const reasonInputs = state.contentPanel?.querySelectorAll(`input[type="checkbox"][${RR_CUSTOM_REASON_MARKER}]`) || [];
            for (const input of reasonInputs) {
                const reason = input.getAttribute(RR_CUSTOM_REASON_MARKER);
                input.checked = Boolean(state.rrData.rejectionReasons?.[reason]);
            }

            const showOther = Boolean(state.rrData.rejectionReasons?.[RR_REASON_OTHER_LABEL]);
            if (state.otherReasonWrap) state.otherReasonWrap.classList.toggle('hidden', !showOther);
            if (state.otherReasonTextarea) {
                this.setTextareaValueSilently(
                    state.otherReasonTextarea,
                    showOther ? (state.rrData.otherReasonExplanation || '') : ''
                );
            }

            const qaInputs = state.contentPanel?.querySelectorAll(`input[type="checkbox"][${RR_CUSTOM_QA_MARKER}]`) || [];
            for (const input of qaInputs) {
                const label = input.getAttribute(RR_CUSTOM_QA_MARKER);
                input.checked = Boolean(state.rrData.qaChecklist?.[label]);
            }

            const promptButtons = state.contentPanel?.querySelectorAll(`button[${RR_CUSTOM_PROMPT_MARKER}]`) || [];
            for (const button of promptButtons) {
                const option = button.getAttribute(RR_CUSTOM_PROMPT_MARKER);
                const styles = RR_PROMPT_QUALITY_STYLES[option];
                if (!styles) continue;
                const selected = option === state.rrData.promptQualityRating;
                const variant = selected ? styles.selected : styles.unselected;
                button.className = `${RR_PROMPT_QUALITY_BASE_CLASS} ${variant}`;
            }

            this.renderCustomScreenshotPreviews(state);
            this.updateScreenshotControlsAvailability(state);
        } finally {
            state.syncingFromNative = false;
        }
    },

    async runNativeModalTransaction(state, options) {
        if (state.transactionInProgress) {
            Logger.warn('RequestRevisionsTab: native modal transaction already in progress');
            return false;
        }
        state.transactionInProgress = true;
        const hidden = options.hidden !== false;
        let modal = null;
        let closeWhenDone = hidden || options.mode !== 'export';
        Logger.debug(
            `requestRevisionsTab: transaction start mode=${options.mode} hidden=${hidden} closeWhenDone=${closeWhenDone}`
        );
        try {
            modal = await this.openNativeModal(state, { hidden });
            if (!modal) {
                Logger.warn(`requestRevisionsTab: transaction "${options.mode}" could not open native modal`);
                return false;
            }

            if (options.mode === 'import') {
                await this.importFromNativeModal(state, modal);
                Logger.info('Request Revisions Tab: imported native modal state');
                this.debugLogRrDigestIfChanged(state, 'after import transaction');
                Logger.debug('requestRevisionsTab: transaction end mode=import ok=true');
                return true;
            }

            await this.exportToNativeModal(state, modal, { skipScreenshots: options.skipScreenshots === true });
            if (options.mode === 'export') {
                Logger.info(hidden
                    ? 'Request Revisions Tab: saved custom state into hidden native modal'
                    : 'Request Revisions Tab: copied custom state into visible native modal');
                this.debugLogRrDigestIfChanged(state, 'after export transaction');
                Logger.debug(`requestRevisionsTab: transaction end mode=export hidden=${hidden} ok=true`);
                closeWhenDone = hidden;
                return true;
            }

            const verified = await this.verifyNativeModalCopy(state, modal);
            if (!verified) {
                Logger.error('Request Revisions Tab: native modal copy verification failed; submit cancelled');
                Logger.debug('requestRevisionsTab: transaction end mode=submit verifyFailed=true');
                return false;
            }

            const buttonLabel = options.mode === 'submit-silent' ? 'Silent Request' : 'Request and Notify Author';
            const submitButton = this.findButtonByText(modal, buttonLabel);
            if (!submitButton) {
                Logger.error(`Request Revisions Tab: native submit button not found: ${buttonLabel}`);
                Logger.debug(`requestRevisionsTab: transaction end mode=${options.mode} missingSubmit=true`);
                return false;
            }
            submitButton.click();
            closeWhenDone = false;
            Logger.info(`Request Revisions Tab: clicked native "${buttonLabel}"`);
            Logger.debug(`requestRevisionsTab: transaction end mode=${options.mode} submitted=true`);
            return true;
        } catch (error) {
            Logger.error(`Request Revisions Tab: native modal transaction failed (${options.mode})`, error);
            Logger.debug(`requestRevisionsTab: transaction end mode=${options.mode} threw=true`);
            return false;
        } finally {
            if (closeWhenDone && modal && document.body.contains(modal)) {
                Logger.debug('requestRevisionsTab: transaction closing native modal');
                this.closeNativeModal(modal);
            }
            this.cleanupTransactionStyles(state);
            state.transactionModal = null;
            state.transactionBackdrop = null;
            state.transactionInProgress = false;
            state.nativeSyncModal = null;
            Logger.debug('requestRevisionsTab: transaction cleanup complete');
        }
    },

    /**
     * Stepped submit: opens a hidden native modal, shows an in-page status modal that
     * iterates over each sync step (QA Checklist → Prompt Quality → Rejection reasons →
     * Task Issues → Attempted Actions → General feedback → Other reason → Screenshots),
     * verifies each step, and then either clicks the matching native submit button (for
     * 'submit-silent' / 'submit-notify') or just closes the hidden modal (for 'simulate').
     *
     * If any step fails verification, the hidden native modal is revealed so the worker
     * can complete it manually. The status modal stays open with details about which step
     * failed; the worker can dismiss it via the Close button.
     */
    async runSteppedSubmit(state, { mode }) {
        if (state.transactionInProgress) {
            Logger.warn('Request Revisions Tab: stepped submit ignored — another transaction is in progress');
            return false;
        }
        const buttonLabelByMode = {
            'simulate': 'Simulate R&NA',
            'submit-silent': 'Silent Request',
            'submit-notify': 'Request and Notify Author'
        };
        const friendly = buttonLabelByMode[mode] || mode;
        const stepDefs = this.buildStepDefs(state);
        const status = this.openSyncStatusModal({
            title: `Sync to native — ${friendly}`,
            steps: stepDefs.map((s) => ({ id: s.id, label: s.label }))
        });
        for (const step of stepDefs) {
            if (step.addRows) step.addRows(status);
        }

        state.transactionInProgress = true;
        let modal = null;
        let revealedOnFail = false;
        let success = false;
        Logger.log(`Request Revisions Tab: stepped submit START mode=${mode}`);

        try {
            modal = await this.openNativeModal(state, { hidden: true });
            if (status.isCancelled()) return false;
            if (!modal) {
                status.failHard('Native Request Revisions modal could not be opened');
                Logger.error('Request Revisions Tab: stepped submit could not open native modal');
                return false;
            }
            const taskTextarea = await this.ensureTaskSelected(modal);
            if (status.isCancelled()) return false;
            if (!taskTextarea) {
                status.failHard('Could not select the Task issue lane in the native modal');
                this.revealNativeModal(state, modal);
                revealedOnFail = true;
                return false;
            }

            state.syncingToNative = true;
            try {
                for (const step of stepDefs) {
                    if (status.isCancelled()) return false;
                    if (step.skip && step.skip()) {
                        status.skip(step.id);
                        continue;
                    }
                    status.start(step.id);
                    try {
                        await step.run(modal, taskTextarea, status);
                        if (status.isCancelled()) return false;
                        await this.waitForAnimationFrame();
                        const verdict = await step.verify(modal, taskTextarea);
                        if (status.isCancelled()) return false;
                        if (verdict === true) {
                            status.ok(step.id);
                        } else {
                            const reason = typeof verdict === 'string' && verdict
                                ? verdict
                                : 'Native form did not reflect tab state after sync';
                            status.fail(step.id, reason);
                            Logger.error(`Request Revisions Tab: stepped submit FAIL step=${step.id} reason=${reason}`);
                            this.revealNativeModal(state, modal);
                            revealedOnFail = true;
                            return false;
                        }
                    } catch (stepError) {
                        const msg = stepError?.message || String(stepError);
                        status.fail(step.id, msg);
                        Logger.error(`Request Revisions Tab: stepped submit threw step=${step.id}`, stepError);
                        this.revealNativeModal(state, modal);
                        revealedOnFail = true;
                        return false;
                    }
                }
            } finally {
                state.syncingToNative = false;
            }

            if (status.isCancelled()) return false;
            if (mode === 'simulate') {
                success = true;
                status.complete('All fields synced. (Simulate mode — no submission performed.)');
                Logger.log('Request Revisions Tab: stepped submit OK mode=simulate (no native submit clicked)');
                return true;
            }

            const submitLabel = mode === 'submit-silent' ? 'Silent Request' : 'Request and Notify Author';
            const submitButton = this.findButtonByText(modal, submitLabel);
            if (!submitButton) {
                status.failHard(`Native "${submitLabel}" button not found after sync`);
                Logger.error(`Request Revisions Tab: stepped submit missing native button "${submitLabel}"`);
                this.revealNativeModal(state, modal);
                revealedOnFail = true;
                return false;
            }
            submitButton.click();
            success = true;
            status.complete(`Submitted via native "${submitLabel}".`);
            Logger.log(`Request Revisions Tab: stepped submit OK clicked native "${submitLabel}"`);
            return true;
        } catch (error) {
            Logger.error(`Request Revisions Tab: stepped submit failed unexpectedly (${mode})`, error);
            status.failHard(error?.message || String(error));
            if (modal) {
                this.revealNativeModal(state, modal);
                revealedOnFail = true;
            }
            return false;
        } finally {
            if (modal && document.body.contains(modal) && !revealedOnFail) {
                if (mode === 'simulate' && success) {
                    Logger.debug('requestRevisionsTab: stepped submit closing hidden modal (simulate success)');
                    this.closeNativeModal(modal);
                } else if (!success) {
                    this.closeNativeModal(modal);
                }
            }
            this.cleanupTransactionStyles(state);
            state.transactionModal = null;
            state.transactionBackdrop = null;
            state.transactionInProgress = false;
            state.nativeSyncModal = null;
            if (success) status.scheduleAutoClose(2500);
            Logger.debug(`requestRevisionsTab: stepped submit cleanup complete success=${success} revealed=${revealedOnFail}`);
        }
    },

    /**
     * Builds the ordered list of sync steps the status modal iterates over.
     * Each step has: id, label, optional skip() (returns true to skip),
     * run(modal, taskTextarea) to perform the sync, verify(modal, taskTextarea) to
     * confirm the native form matches tab state (returns true or a string reason).
     */
    buildStepDefs(state) {
        const defs = [
            {
                id: 'qa-checklist',
                label: 'QA Checklist',
                run: async (modal) => { await this.syncNativeQaChecklist(state, modal); },
                verify: (modal) => {
                    const read = this.readNativeQaChecklist(modal);
                    if (!read.complete) return 'Native QA Checklist controls missing';
                    for (const item of RR_QA_CHECKLIST_ITEMS) {
                        const want = Boolean(state.rrData.qaChecklist?.[item]);
                        if (Boolean(read.items[item]) !== want) {
                            return `QA item "${item.slice(0, 60)}…" did not match (want=${want})`;
                        }
                    }
                    return true;
                }
            },
            {
                id: 'prompt-quality',
                label: 'Prompt Quality Rating',
                run: async (modal) => { await this.syncNativePromptQuality(state, modal); },
                verify: (modal) => {
                    const read = this.readNativePromptQuality(modal);
                    if (!read.complete) return 'Native Prompt Quality controls missing';
                    if (!state.rrData.promptQualityRating) {
                        // Average cannot be detected from classes; only fail if a colour-coded
                        // option is still showing selected after we tried to clear it.
                        if (read.selected) return `want="(cleared)" got="${read.selected}"`;
                        return true;
                    }
                    if (read.selected !== state.rrData.promptQualityRating) {
                        return `want="${state.rrData.promptQualityRating}" got="${read.selected || '(none)'}"`;
                    }
                    return true;
                }
            },
            {
                id: 'rejection-reasons',
                label: 'Rejection reasons',
                run: async (modal) => { await this.syncNativeRejectionCheckboxes(state, modal); },
                verify: (modal) => {
                    const read = this.readNativeRejectionReasons(modal);
                    if (!read.complete) return 'Native rejection reason controls missing';
                    for (const reason of RR_REJECTION_REASONS) {
                        const want = Boolean(state.rrData.rejectionReasons?.[reason]);
                        if (Boolean(read.reasons[reason]) !== want) {
                            return `reason "${reason}" did not match (want=${want})`;
                        }
                    }
                    return true;
                }
            },
            {
                id: 'task-issues',
                label: 'Task Issues textarea',
                run: async (_modal, taskTextarea) => {
                    this.setInputValue(taskTextarea, state.rrData.taskIssues || '');
                },
                verify: (_modal, taskTextarea) => {
                    if ((taskTextarea?.value || '') !== (state.rrData.taskIssues || '')) {
                        return 'Native Task textarea value mismatch';
                    }
                    return true;
                }
            },
            {
                id: 'attempted-actions',
                label: 'Attempted Actions textarea',
                run: async (modal) => {
                    const attempted = modal.querySelector('textarea[id^="attempted-actions-"]');
                    if (!attempted) return;
                    this.setInputValue(attempted, state.rrData.attemptedActions || '');
                },
                verify: (modal) => {
                    const attempted = modal.querySelector('textarea[id^="attempted-actions-"]');
                    if (!attempted) return 'Native Attempted Actions textarea missing';
                    if ((attempted.value || '') !== (state.rrData.attemptedActions || '')) {
                        return 'Native Attempted Actions value mismatch';
                    }
                    return true;
                }
            },
            {
                id: 'general-feedback',
                label: 'General revision feedback textarea',
                run: async (modal) => {
                    const general = modal.querySelector('textarea#discard-reason');
                    if (!general) return;
                    this.setInputValue(general, state.rrData.generalRevisionFeedback || '');
                },
                verify: (modal) => {
                    const general = modal.querySelector('textarea#discard-reason');
                    if (!general) return 'Native General feedback textarea missing';
                    if ((general.value || '') !== (state.rrData.generalRevisionFeedback || '')) {
                        return 'Native General feedback value mismatch';
                    }
                    return true;
                }
            },
            {
                id: 'other-reason',
                label: 'Other reason explanation',
                skip: () => !state.rrData.rejectionReasons?.[RR_REASON_OTHER_LABEL],
                run: async (modal) => {
                    const other = await this.waitForOtherReasonTextarea(modal, 2000);
                    if (other) this.setInputValue(other, state.rrData.otherReasonExplanation || '');
                },
                verify: (modal) => {
                    const other = modal.querySelector('textarea#other-reason-explanation');
                    if (!other) return 'Native Other-reason textarea missing';
                    if ((other.value || '') !== (state.rrData.otherReasonExplanation || '')) {
                        return 'Native Other-reason value mismatch';
                    }
                    return true;
                }
            },
            {
                id: 'screenshots',
                label: 'Screenshots',
                addRows: (statusApi) => {
                    const pending = (state.rrData.screenshots || [])
                        .filter((e) => e.type === 'pending' && e.file);
                    for (let i = 0; i < pending.length; i++) {
                        const name = pending[i].file.name;
                        const displayName = name.length > 36 ? `${name.slice(0, 36)}…` : name;
                        statusApi.addRow(`screenshot-${i}`, `↳ ${displayName}`);
                    }
                },
                run: async (modal, _taskTextarea, statusApi) => {
                    const progress = statusApi
                        ? (id, phase, reason) => {
                            if (phase === 'start') statusApi.start(id);
                            else if (phase === 'ok') statusApi.ok(id);
                            else statusApi.fail(id, reason || 'Upload failed');
                        }
                        : null;
                    const result = await this.syncNativeScreenshots(state, modal, progress);
                    state.lastScreenshotSyncResult = result;
                },
                verify: (modal) => {
                    const result = state.lastScreenshotSyncResult || { uploaded: 0, expected: 0, strictOk: true };
                    if (!result.strictOk || result.uploaded < result.expected) {
                        return `Uploaded ${result.uploaded}/${result.expected} screenshots — ${result.newlyUploaded ?? 0}/${result.requiredNewUploads ?? 0} new uploads succeeded`;
                    }
                    this.updateFromNativeModalSnapshot(state, this.readNativeModalSnapshot(modal), {
                        screenshotMergeMode: 'replace-with-uploaded'
                    });
                    return true;
                }
            }
        ];
        return defs;
    },

    /**
     * Removes the inline styles + marker that hide the native modal during a transaction
     * so the worker can finish the request manually after a stepped sync failure.
     */
    revealNativeModal(state, modal) {
        if (!modal) return;
        modal.removeAttribute(RR_MANAGED_MODAL_MARKER);
        modal.style.opacity = '';
        modal.style.pointerEvents = '';
        modal.style.left = '';
        modal.style.top = '';
        const backdrop = state.transactionBackdrop || this.findBackdropForModal(modal);
        if (backdrop) {
            backdrop.style.opacity = '';
            backdrop.style.pointerEvents = '';
        }
        Logger.info('Request Revisions Tab: revealed hidden native modal due to sync failure — complete manually');
    },

    /**
     * Renders a top-most in-page status overlay listing each sync step with live status
     * (pending → running → ok / failed / skipped). Has an X cancel button that aborts the
     * in-flight stepped submit at the next safe boundary. Returns a controller with
     * start/ok/fail/skip/complete/failHard/scheduleAutoClose/close/isCancelled methods.
     *
     * Notes:
     * - Forces position:fixed + z-index 2147483647 inline so it always floats above the
     *   RR tab (which sits in a z-40 absolute container with its own stacking context).
     * - Uses a darker backdrop (bg-black/55) and disables clicks behind it so the worker
     *   cannot accidentally interact with the page during the sync.
     */
    openSyncStatusModal({ title, steps }) {
        const overlay = document.createElement('div');
        overlay.className = 'flex items-center justify-center bg-black/55';
        overlay.setAttribute('data-fleet-rr-status-overlay', 'true');
        overlay.setAttribute('data-fleet-plugin', this.id);
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.left = '0';
        overlay.style.zIndex = '2147483647';
        overlay.style.pointerEvents = 'auto';

        const card = document.createElement('div');
        card.className = 'relative w-[min(28rem,90vw)] max-h-[85vh] overflow-y-auto rounded-lg border border-input bg-background shadow-2xl p-4 pr-10 space-y-3';

        const titleEl = document.createElement('div');
        titleEl.className = 'text-sm font-semibold text-foreground pr-4';
        titleEl.textContent = title;
        card.appendChild(titleEl);

        const xButton = document.createElement('button');
        xButton.type = 'button';
        xButton.setAttribute('aria-label', 'Cancel sync');
        xButton.className = 'absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground text-lg leading-none';
        xButton.innerHTML = '&times;';
        card.appendChild(xButton);

        const list = document.createElement('ul');
        list.className = 'space-y-1.5';
        const itemEls = new Map();
        for (const step of steps) {
            const li = document.createElement('li');
            li.className = 'flex items-start gap-2 text-sm';
            const icon = document.createElement('span');
            icon.className = 'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground tabular-nums';
            icon.textContent = '•';
            const label = document.createElement('span');
            label.className = 'flex-1 text-foreground';
            label.textContent = step.label;
            const reason = document.createElement('span');
            reason.className = 'block text-xs text-red-600 mt-0.5 hidden';
            li.appendChild(icon);
            const labelWrap = document.createElement('div');
            labelWrap.className = 'flex-1';
            labelWrap.appendChild(label);
            labelWrap.appendChild(reason);
            li.appendChild(labelWrap);
            list.appendChild(li);
            itemEls.set(step.id, { icon, label, reason, li });
        }
        card.appendChild(list);

        const banner = document.createElement('div');
        banner.className = 'text-sm font-medium hidden';
        card.appendChild(banner);

        const footer = document.createElement('div');
        footer.className = 'flex items-center justify-end pt-1';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'inline-flex items-center justify-center rounded-sm text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', () => api.close());
        footer.appendChild(closeBtn);
        card.appendChild(footer);

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        let autoCloseTimer = null;
        let cancelled = false;
        const setIcon = (id, char, classes) => {
            const node = itemEls.get(id);
            if (!node) return;
            node.icon.textContent = char;
            node.icon.className = `mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center tabular-nums ${classes}`;
        };
        const setReason = (id, text) => {
            const node = itemEls.get(id);
            if (!node || !text) return;
            node.reason.textContent = text;
            node.reason.classList.remove('hidden');
        };

        xButton.addEventListener('click', () => {
            cancelled = true;
            Logger.warn('Request Revisions Tab: status modal cancel (X) clicked — aborting stepped submit at next boundary');
            api.close();
        });

        const makeRowInList = (id, label) => {
            const li = document.createElement('li');
            li.className = 'flex items-start gap-2 text-sm';
            const icon = document.createElement('span');
            icon.className = 'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground tabular-nums';
            icon.textContent = '•';
            const labelEl = document.createElement('span');
            labelEl.className = 'flex-1 text-foreground';
            labelEl.textContent = label;
            const reason = document.createElement('span');
            reason.className = 'block text-xs text-red-600 mt-0.5 hidden';
            const labelWrap = document.createElement('div');
            labelWrap.className = 'flex-1';
            labelWrap.appendChild(labelEl);
            labelWrap.appendChild(reason);
            li.appendChild(icon);
            li.appendChild(labelWrap);
            list.appendChild(li);
            itemEls.set(id, { icon, label: labelEl, reason, li });
        };

        const api = {
            addRow(id, label) {
                if (!itemEls.has(id)) makeRowInList(id, label);
            },
            start(id) {
                setIcon(id, '…', 'text-blue-600 animate-spin');
            },
            ok(id) {
                setIcon(id, '✓', 'text-green-600');
            },
            fail(id, reason) {
                setIcon(id, '✗', 'text-red-600');
                setReason(id, reason);
            },
            skip(id) {
                setIcon(id, '–', 'text-muted-foreground');
                const node = itemEls.get(id);
                if (node) node.label.classList.add('text-muted-foreground');
            },
            complete(message) {
                banner.textContent = message;
                banner.className = 'text-sm font-medium text-green-700 dark:text-green-400';
            },
            failHard(message) {
                banner.textContent = message;
                banner.className = 'text-sm font-medium text-red-600';
            },
            scheduleAutoClose(ms) {
                if (autoCloseTimer) clearTimeout(autoCloseTimer);
                autoCloseTimer = setTimeout(() => api.close(), ms);
            },
            isCancelled() {
                return cancelled;
            },
            close() {
                if (autoCloseTimer) clearTimeout(autoCloseTimer);
                autoCloseTimer = null;
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }
        };
        return api;
    },

    async openNativeModal(state, options) {
        const existing = this.findRequestRevisionsModal();
        if (existing) {
            state.transactionModal = existing;
            state.transactionBackdrop = this.findBackdropForModal(existing);
            if (options.hidden) this.applyHiddenTransactionStyles(state, existing, state.transactionBackdrop);
            Logger.debug(`requestRevisionsTab: openNativeModal reusedExisting=true hidden=${options.hidden}`);
            return existing;
        }

        const nativeButton = this.findNativeRequestRevisionsButton();
        if (!nativeButton) {
            Logger.warn('Request Revisions Tab: native Request Revisions button not found');
            return null;
        }

        let preHideObserver = null;
        if (options.hidden) {
            preHideObserver = new MutationObserver(() => {
                const modal = this.findRequestRevisionsModal();
                if (!modal) return;
                this.applyHiddenTransactionStyles(state, modal, this.findBackdropForModal(modal));
            });
            preHideObserver.observe(document.body, { childList: true, subtree: true });
        }

        nativeButton.click();
        const modal = await this.waitForModal();
        if (preHideObserver) preHideObserver.disconnect();
        if (!modal) return null;

        state.transactionModal = modal;
        state.transactionBackdrop = this.findBackdropForModal(modal);
        if (options.hidden) {
            this.applyHiddenTransactionStyles(state, modal, state.transactionBackdrop);
        }
        Logger.debug(`requestRevisionsTab: openNativeModal openedNew=true hidden=${options.hidden}`);
        return modal;
    },

    waitForModal(timeoutMs = 3000) {
        const existing = this.findRequestRevisionsModal();
        if (existing) return Promise.resolve(existing);

        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const modal = this.findRequestRevisionsModal();
                if (!modal) return;
                observer.disconnect();
                resolve(modal);
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(this.findRequestRevisionsModal());
            }, timeoutMs);
        });
    },

    findRequestRevisionsModal() {
        const dialogs = document.querySelectorAll('div[role="dialog"][data-state="open"]');
        for (const dialog of dialogs) {
            const heading = dialog.querySelector('h2');
            if (heading && heading.textContent.includes('Request Revisions')) {
                return dialog;
            }
        }
        return null;
    },

    findBackdropForModal(modal) {
        let previous = modal?.previousElementSibling || null;
        while (previous) {
            if (
                previous.getAttribute?.('data-state') === 'open' &&
                previous.getAttribute?.('data-aria-hidden') === 'true' &&
                (previous.getAttribute('class') || '').includes('bg-black')
            ) {
                return previous;
            }
            previous = previous.previousElementSibling;
        }
        return document.querySelector('div[data-aria-hidden="true"][data-state="open"][class*="bg-black"]');
    },

    applyHiddenTransactionStyles(state, modal, backdrop) {
        state.transactionModal = modal;
        state.transactionBackdrop = backdrop;
        if (modal) {
            modal.setAttribute(RR_MANAGED_MODAL_MARKER, 'true');
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';
            modal.style.left = '-9999px';
            modal.style.top = '0';
        }
        if (backdrop) {
            backdrop.style.opacity = '0';
            backdrop.style.pointerEvents = 'none';
        }
        this.releasePageInteractionLock(state);
    },

    cleanupTransactionStyles(state) {
        this.restorePageInteractionLock(state);
    },

    releasePageInteractionLock(state) {
        if (!state.pointerLockReleased) {
            state.originalBodyPointerEvents = document.body.style.pointerEvents || '';
            state.originalHtmlPointerEvents = document.documentElement.style.pointerEvents || '';
            state.pointerLockReleased = true;
        }
        document.body.style.pointerEvents = '';
        document.documentElement.style.pointerEvents = '';
    },

    restorePageInteractionLock(state) {
        if (!state.pointerLockReleased) return;
        document.body.style.pointerEvents = state.originalBodyPointerEvents || '';
        document.documentElement.style.pointerEvents = state.originalHtmlPointerEvents || '';
        state.originalBodyPointerEvents = null;
        state.originalHtmlPointerEvents = null;
        state.pointerLockReleased = false;
    },

    closeNativeModal(modal) {
        const closeButton = this.findModalCloseButton(modal);
        if (closeButton) {
            closeButton.click();
            return true;
        }
        Logger.warn('Request Revisions Tab: modal close button not found');
        return false;
    },

    findModalCloseButton(modal) {
        const srClose = Array.from(modal.querySelectorAll('button')).find((button) => {
            const srOnly = button.querySelector('.sr-only');
            return srOnly && srOnly.textContent.trim() === 'Close';
        });
        if (srClose) return srClose;
        return Array.from(modal.querySelectorAll('button')).find((button) =>
            button.textContent.trim() === 'Cancel'
        ) || null;
    },

    async importFromNativeModal(state, modal) {
        Logger.debug('requestRevisionsTab: importFromNativeModal start');
        const taskTextarea = await this.ensureTaskSelected(modal);
        if (!taskTextarea) {
            Logger.warn('Request Revisions Tab: native Task textarea not found during import');
            return;
        }
        const snapshot = this.readNativeModalSnapshot(modal);
        snapshot.taskIssues = taskTextarea.value || '';
        this.updateFromNativeModalSnapshot(state, snapshot);
        Logger.debug('requestRevisionsTab: importFromNativeModal applied snapshot');
    },

    async exportToNativeModal(state, modal, options = {}) {
        const skipScreenshots = options.skipScreenshots === true;
        Logger.debug(`requestRevisionsTab: exportToNativeModal start skipScreenshots=${skipScreenshots}`);
        const taskTextarea = await this.ensureTaskSelected(modal);
        if (!taskTextarea) {
            Logger.warn('Request Revisions Tab: native Task textarea not found during export');
            return false;
        }
        state.syncingToNative = true;
        try {
            this.setInputValue(taskTextarea, state.rrData.taskIssues || '');
            const attempted = modal.querySelector('textarea[id^="attempted-actions-"]');
            const general = modal.querySelector('textarea#discard-reason');
            if (attempted) this.setInputValue(attempted, state.rrData.attemptedActions || '');
            if (general) this.setInputValue(general, state.rrData.generalRevisionFeedback || '');

            await this.syncNativeQaChecklist(state, modal);
            await this.syncNativePromptQuality(state, modal);
            await this.syncNativeRejectionCheckboxes(state, modal);
            if (state.rrData.rejectionReasons?.[RR_REASON_OTHER_LABEL]) {
                const other = await this.waitForOtherReasonTextarea(modal, 2000);
                if (other) this.setInputValue(other, state.rrData.otherReasonExplanation || '');
            }
            if (!skipScreenshots) {
                await this.syncNativeScreenshots(state, modal);
            }
        } finally {
            state.syncingToNative = false;
        }
        Logger.debug('requestRevisionsTab: exportToNativeModal complete');
        return true;
    },

    async verifyNativeModalCopy(state, modal) {
        Logger.debug('requestRevisionsTab: verifyNativeModalCopy pass1');
        if (this.nativeModalMatchesState(state, modal)) {
            return true;
        }
        await this.waitForAnimationFrame();
        Logger.debug('requestRevisionsTab: verifyNativeModalCopy pass2');
        if (this.nativeModalMatchesState(state, modal)) {
            return true;
        }
        Logger.debug('requestRevisionsTab: verifyNativeModalCopy re-export');
        await this.exportToNativeModal(state, modal);
        await this.waitForAnimationFrame();
        Logger.debug('requestRevisionsTab: verifyNativeModalCopy pass3');
        if (this.nativeModalMatchesState(state, modal)) return true;
        return false;
    },

    async ensureTaskSelected(modal) {
        const taskButton = this.findIssueButton(modal, 'Task');
        if (!taskButton) {
            Logger.warn('Request Revisions Tab: Task issue button not found');
            return null;
        }
        if (!this.isIssueButtonSelected(taskButton)) {
            taskButton.click();
            Logger.debug('requestRevisionsTab: native "Task" issue lane selected');
            await this.waitForAnimationFrame();
        }
        return this.waitForTaskTextarea(modal, 3000);
    },

    waitForTaskTextarea(modal, timeoutMs = 3000) {
        const existing = modal.querySelector('textarea#feedback-Task');
        if (existing) return Promise.resolve(existing);
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const textarea = modal.querySelector('textarea#feedback-Task');
                if (!textarea) return;
                observer.disconnect();
                resolve(textarea);
            });
            observer.observe(modal, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(modal.querySelector('textarea#feedback-Task'));
            }, timeoutMs);
        });
    },

    waitForOtherReasonTextarea(modal, timeoutMs = 2000) {
        const existing = modal.querySelector('textarea#other-reason-explanation');
        if (existing) return Promise.resolve(existing);
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const textarea = modal.querySelector('textarea#other-reason-explanation');
                if (!textarea) return;
                observer.disconnect();
                resolve(textarea);
            });
            observer.observe(modal, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(modal.querySelector('textarea#other-reason-explanation'));
            }, timeoutMs);
        });
    },

    readNativeModalSnapshot(modal) {
        const taskIssuesEl = modal.querySelector('textarea#feedback-Task');
        const attemptedEl = modal.querySelector('textarea[id^="attempted-actions-"]');
        const generalEl = modal.querySelector('textarea#discard-reason');
        const otherEl = modal.querySelector('textarea#other-reason-explanation');
        const rejectionRead = this.readNativeRejectionReasons(modal);
        const qaRead = this.readNativeQaChecklist(modal);
        const promptRead = this.readNativePromptQuality(modal);
        const nativeScreenshotInput = this.findNativeScreenshotInput(modal);
        const nativeScreenshots = this.findNativeScreenshotPreviewImgs(modal).map((img) => ({
            type: 'uploaded',
            url: img.src,
            alt: img.alt || ''
        }));
        const hasOtherSelected = Boolean(rejectionRead.reasons?.[RR_REASON_OTHER_LABEL]);

        return {
            hasTaskIssues: Boolean(taskIssuesEl),
            taskIssues: taskIssuesEl?.value || '',
            hasAttemptedActions: Boolean(attemptedEl),
            attemptedActions: attemptedEl?.value || '',
            hasGeneralRevisionFeedback: Boolean(generalEl),
            generalRevisionFeedback: generalEl?.value || '',
            hasRejectionReasons: rejectionRead.complete,
            rejectionReasons: rejectionRead.reasons,
            hasOtherReasonExplanation: hasOtherSelected ? Boolean(otherEl) : true,
            otherReasonExplanation: hasOtherSelected ? (otherEl?.value || '') : '',
            hasQaChecklist: qaRead.complete,
            qaChecklist: qaRead.items,
            hasPromptQualityRating: promptRead.complete,
            promptQualityRating: promptRead.selected,
            hasScreenshots: Boolean(nativeScreenshotInput),
            screenshots: nativeScreenshots
        };
    },

    nativeModalMatchesState(state, modal) {
        const snapshot = this.readNativeModalSnapshot(modal);
        if (!snapshot.hasTaskIssues || !snapshot.hasAttemptedActions || !snapshot.hasGeneralRevisionFeedback) return false;
        if (!snapshot.hasRejectionReasons) return false;
        if (!snapshot.hasQaChecklist || !snapshot.hasPromptQualityRating || !snapshot.hasScreenshots) return false;
        if (Boolean(state.rrData.rejectionReasons[RR_REASON_OTHER_LABEL]) && !snapshot.hasOtherReasonExplanation) {
            return false;
        }
        if ((snapshot.taskIssues || '') !== (state.rrData.taskIssues || '')) return false;
        if ((snapshot.attemptedActions || '') !== (state.rrData.attemptedActions || '')) return false;
        if ((snapshot.generalRevisionFeedback || '') !== (state.rrData.generalRevisionFeedback || '')) return false;
        for (const reason of RR_REJECTION_REASONS) {
            if (Boolean(snapshot.rejectionReasons[reason]) !== Boolean(state.rrData.rejectionReasons[reason])) {
                return false;
            }
        }
        for (const item of RR_QA_CHECKLIST_ITEMS) {
            if (Boolean(snapshot.qaChecklist[item]) !== Boolean(state.rrData.qaChecklist[item])) return false;
        }
        if ((snapshot.promptQualityRating || '') !== (state.rrData.promptQualityRating || '')) return false;
        if (!this.areScreenshotListsEqual(snapshot.screenshots || [], state.rrData.screenshots || [])) return false;
        if (Boolean(state.rrData.rejectionReasons[RR_REASON_OTHER_LABEL])) {
            if ((snapshot.otherReasonExplanation || '') !== (state.rrData.otherReasonExplanation || '')) return false;
        }
        return true;
    },

    findNativeRejectionContainer(modal) {
        const headings = modal.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-2');
        for (const heading of headings) {
            if (normalizeText(heading.textContent).includes('Reason(s) for rejection')) {
                return heading.nextElementSibling;
            }
        }
        return null;
    },

    findNativeRejectionButton(modal, reasonLabel) {
        const container = this.findNativeRejectionContainer(modal);
        if (!container) return null;
        for (const label of container.querySelectorAll('label')) {
            const text = normalizeText(label.textContent);
            if (text !== reasonLabel) continue;
            return label.querySelector('button[role="checkbox"]');
        }
        return null;
    },

    isNativeCheckboxChecked(button) {
        if (!button) return false;
        return button.getAttribute('aria-checked') === 'true' || button.getAttribute('data-state') === 'checked';
    },

    readNativeRejectionReasons(modal) {
        const reasons = createDefaultRejectionReasons();
        let foundCount = 0;
        for (const label of RR_REJECTION_REASONS) {
            const button = this.findNativeRejectionButton(modal, label);
            if (button) foundCount += 1;
            reasons[label] = this.isNativeCheckboxChecked(button);
        }
        return {
            complete: foundCount === RR_REJECTION_REASONS.length,
            reasons
        };
    },

    async syncNativeRejectionCheckboxes(state, modal) {
        for (const label of RR_REJECTION_REASONS) {
            const button = this.findNativeRejectionButton(modal, label);
            if (!button) continue;
            const desired = Boolean(state.rrData.rejectionReasons?.[label]);
            if (this.isNativeCheckboxChecked(button) === desired) continue;
            Logger.debug(`requestRevisionsTab: native rejection sync click "${label}" → ${desired}`);
            button.click();
            if (label === RR_REASON_OTHER_LABEL && desired) {
                await this.waitForOtherReasonTextarea(modal, 2000);
            }
        }
    },

    findNativeQaChecklistContainer(modal) {
        const labels = modal.querySelectorAll('div.text-sm.text-muted-foreground.font-medium');
        for (const label of labels) {
            if (normalizeText(label.textContent).includes('QA Checklist')) {
                return label.nextElementSibling;
            }
        }
        return null;
    },

    findNativeQaChecklistButton(modal, itemLabel) {
        const container = this.findNativeQaChecklistContainer(modal);
        if (!container) return null;
        for (const row of container.querySelectorAll('div.flex.items-start.gap-3')) {
            const label = row.querySelector('label');
            if (!label) continue;
            if (normalizeText(label.textContent) !== normalizeText(itemLabel)) continue;
            return row.querySelector('button[role="checkbox"]');
        }
        return null;
    },

    readNativeQaChecklist(modal) {
        const items = createDefaultQaChecklist();
        let foundCount = 0;
        for (const item of RR_QA_CHECKLIST_ITEMS) {
            const button = this.findNativeQaChecklistButton(modal, item);
            if (button) foundCount += 1;
            items[item] = this.isNativeCheckboxChecked(button);
        }
        return {
            complete: foundCount === RR_QA_CHECKLIST_ITEMS.length,
            items
        };
    },

    async syncNativeQaChecklist(state, modal) {
        for (const item of RR_QA_CHECKLIST_ITEMS) {
            const button = this.findNativeQaChecklistButton(modal, item);
            if (!button) continue;
            const desired = Boolean(state.rrData.qaChecklist?.[item]);
            if (this.isNativeCheckboxChecked(button) === desired) continue;
            const short = item.length > 80 ? `${item.slice(0, 80)}…` : item;
            Logger.debug(`requestRevisionsTab: native QA checklist sync click "${short}" → ${desired}`);
            button.click();
        }
    },

    findNativePromptQualityButtons(modal) {
        const out = {};
        const labels = modal.querySelectorAll('div.text-xs.font-medium.text-muted-foreground, label.text-xs.font-medium.text-muted-foreground, div.text-sm.text-muted-foreground.font-medium');
        let container = null;
        for (const label of labels) {
            if (!normalizeText(label.textContent).includes('Prompt Quality Rating')) continue;
            container = label.parentElement?.querySelector('div.flex.gap-2') || label.nextElementSibling;
            if (container) break;
        }
        if (!container) return out;
        for (const button of container.querySelectorAll('button')) {
            const text = normalizeText(button.textContent);
            if (RR_PROMPT_QUALITY_OPTIONS.includes(text)) out[text] = button;
        }
        if (Object.keys(out).length < RR_PROMPT_QUALITY_OPTIONS.length) {
            Logger.warn(`requestRevisionsTab: native Prompt Quality buttons incomplete (${Object.keys(out).length}/${RR_PROMPT_QUALITY_OPTIONS.length})`);
        }
        return out;
    },

    /**
     * Detect whether a native prompt-quality button is currently selected.
     *
     * IMPORTANT: the native modal styles "Average" identically in selected and unselected
     * states (see local/context/comp-use/qa/quality-buttons-selected.html), so this returns
     * `false` for Average regardless of state. The promptHandler in
     * `bindNativeModalControls` writes `state.rrData.promptQualityRating` directly when the
     * user clicks any native prompt-quality button, so we don't need to read Average back.
     */
    isNativePromptOptionSelected(button, option) {
        if (!button) return false;
        const classes = new Set((button.getAttribute('class') || '').split(/\s+/));
        if (option === 'Top 10%') {
            return classes.has('border-emerald-500')
                || classes.has('bg-emerald-50')
                || classes.has('text-emerald-700');
        }
        if (option === 'Bottom 10%') {
            return classes.has('border-red-500')
                || classes.has('bg-red-50')
                || classes.has('text-red-700');
        }
        return false;
    },

    readNativePromptQuality(modal) {
        const map = this.findNativePromptQualityButtons(modal);
        const keys = Object.keys(map);
        let selected = '';
        for (const option of RR_PROMPT_QUALITY_OPTIONS) {
            if (this.isNativePromptOptionSelected(map[option], option)) {
                selected = option;
                break;
            }
        }
        return {
            complete: keys.length === RR_PROMPT_QUALITY_OPTIONS.length,
            selected
        };
    },

    async syncNativePromptQuality(state, modal) {
        const desired = state.rrData.promptQualityRating || '';
        const map = this.findNativePromptQualityButtons(modal);

        if (!desired) {
            // Deselect any colour-coded option (Top 10% / Bottom 10%) that is visibly selected.
            // Average cannot be detected from classes, but if it was the last value we synced
            // to native we click it once to toggle it off.
            let deselected = false;
            for (const opt of ['Top 10%', 'Bottom 10%']) {
                const btn = map[opt];
                if (btn && this.isNativePromptOptionSelected(btn, opt)) {
                    Logger.debug(`requestRevisionsTab: native prompt quality clear — deselecting "${opt}"`);
                    btn.click();
                    deselected = true;
                    break;
                }
            }
            if (!deselected && state.promptQualityRatingLastSyncedToNative === 'Average' && map['Average']) {
                Logger.debug('requestRevisionsTab: native prompt quality clear — deselecting "Average" (was last synced)');
                map['Average'].click();
            }
            state.promptQualityRatingLastSyncedToNative = '';
            return;
        }

        const button = map[desired];
        if (!button) return;
        if (this.isNativePromptOptionSelected(button, desired)) {
            state.promptQualityRatingLastSyncedToNative = desired;
            return;
        }
        Logger.debug(`requestRevisionsTab: native prompt quality sync click → "${desired}"`);
        button.click();
        state.promptQualityRatingLastSyncedToNative = desired;
    },

    findNativeScreenshotInput(modal) {
        return modal.querySelector('label input[type="file"][accept*="image"]');
    },

    findNativeScreenshotPreviewImgs(modal) {
        const input = this.findNativeScreenshotInput(modal);
        const section = input?.closest('div');
        if (!section) return [];
        const imgs = [];
        for (const img of section.querySelectorAll('div.relative.group img')) {
            if (!img.src) continue;
            imgs.push(img);
        }
        return imgs;
    },

    findNativeScreenshotRemoveButton(modal, url) {
        const targetKey = screenshotKeyFromUrl(url);
        for (const img of this.findNativeScreenshotPreviewImgs(modal)) {
            if (screenshotKeyFromUrl(img.src) !== targetKey) continue;
            return img.closest('div.relative.group')?.querySelector('button[type="button"]') || null;
        }
        return null;
    },

    /**
     * Pushes pending screenshots from `state.rrData.screenshots` into the native modal's
     * `<input type="file">`, processes any queued deletes, and waits for the native React
     * component to render preview images for each new upload (signal that the upload
     * round-trip finished). Returns `{ uploaded, expected }` so callers can verify count.
     */
    async syncNativeScreenshots(state, modal, progressCallback = null) {
        const input = this.findNativeScreenshotInput(modal);
        if (!input) return { uploaded: 0, expected: 0, newlyUploaded: 0, requiredNewUploads: 0, strictOk: true };

        const deleteKeys = state.rrData.deletedScreenshotUrls || [];
        if (deleteKeys.length) {
            Logger.debug(`requestRevisionsTab: native screenshot delete queue keys=${deleteKeys.length}`);
        }

        const remainingDeletes = [];
        for (const key of state.rrData.deletedScreenshotUrls || []) {
            const removeButton = this.findNativeScreenshotRemoveButton(modal, key);
            if (removeButton) {
                Logger.log(`Request Revisions Tab: removing uploaded screenshot in native key=${key}`);
                removeButton.click();
                await this.waitForNativeScreenshotRemoved(modal, key);
            } else {
                remainingDeletes.push(key);
            }
        }
        state.rrData.deletedScreenshotUrls = remainingDeletes;

        const dt = new DataTransfer();
        const pendingEntries = (state.rrData.screenshots || [])
            .filter((entry) => entry.type === 'pending' && entry.file)
            .slice(0, RR_MAX_SCREENSHOTS);
        for (const entry of pendingEntries) {
            if (dt.items.length >= RR_MAX_SCREENSHOTS) break;
            dt.items.add(entry.file);
        }
        const previousUploadedCount = this.findNativeScreenshotPreviewImgs(modal).length;
        const requiredNewUploads = pendingEntries.length;
        if (!dt.files.length) {
            if (deleteKeys.length) {
                Logger.debug('requestRevisionsTab: native screenshot sync (deletes only, no pending upload batch)');
            }
            return { uploaded: previousUploadedCount, expected: previousUploadedCount, newlyUploaded: 0, requiredNewUploads: 0, strictOk: true };
        }

        const names = pendingEntries.map((e) => e.file.name).join(', ');
        const expected = Math.min(RR_MAX_SCREENSHOTS, previousUploadedCount + requiredNewUploads);
        Logger.log(
            `Request Revisions Tab: screenshot upload START — ${requiredNewUploads} file(s): ${names} (${previousUploadedCount} already uploaded, expecting ${expected} total)`
        );
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // Track each image individually so the status modal can show per-image progress.
        // All files were dispatched at once; we poll for each successive count milestone.
        let newlyUploaded = 0;
        const maxToTrack = Math.min(requiredNewUploads, RR_MAX_SCREENSHOTS - previousUploadedCount);
        for (let i = 0; i < maxToTrack; i++) {
            const stepId = `screenshot-${i}`;
            if (progressCallback) progressCallback(stepId, 'start');
            const targetCount = previousUploadedCount + i + 1;
            const appeared = await this.waitForNativeScreenshotCount(modal, targetCount, 8000);
            const actualCount = this.findNativeScreenshotPreviewImgs(modal).length;
            if (appeared && actualCount >= targetCount) {
                if (progressCallback) progressCallback(stepId, 'ok');
                newlyUploaded++;
            } else {
                if (progressCallback) progressCallback(stepId, 'fail', `Upload timed out (${actualCount}/${targetCount})`);
            }
        }

        const finalCount = this.findNativeScreenshotPreviewImgs(modal).length;
        const strictOk = newlyUploaded >= requiredNewUploads;
        if (strictOk) {
            Logger.log(
                `Request Revisions Tab: screenshot upload done — all ${newlyUploaded}/${requiredNewUploads} new uploads succeeded (total: ${finalCount})`
            );
        } else {
            Logger.warn(
                `Request Revisions Tab: screenshot upload partial — ${newlyUploaded}/${requiredNewUploads} new uploads succeeded (total: ${finalCount}/${expected})`
            );
        }
        return { uploaded: finalCount, expected, newlyUploaded, requiredNewUploads, strictOk };
    },

    waitForNativeScreenshotCount(modal, expectedCount, timeoutMs = 5000) {
        if (this.findNativeScreenshotPreviewImgs(modal).length >= expectedCount) {
            return Promise.resolve(true);
        }
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                if (this.findNativeScreenshotPreviewImgs(modal).length < expectedCount) return;
                observer.disconnect();
                resolve(true);
            });
            observer.observe(modal, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(this.findNativeScreenshotPreviewImgs(modal).length >= expectedCount);
            }, timeoutMs);
        });
    },

    waitForNativeScreenshotRemoved(modal, key, timeoutMs = 2000) {
        if (!this.findNativeScreenshotRemoveButton(modal, key)) return Promise.resolve(true);
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                if (this.findNativeScreenshotRemoveButton(modal, key)) return;
                observer.disconnect();
                resolve(true);
            });
            observer.observe(modal, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(!this.findNativeScreenshotRemoveButton(modal, key));
            }, timeoutMs);
        });
    },

    areScreenshotListsEqual(left, right) {
        const leftUploaded = (left || []).filter((entry) => entry.type === 'uploaded').map((entry) => screenshotKeyFromUrl(entry.url));
        const rightUploaded = (right || []).filter((entry) => entry.type === 'uploaded').map((entry) => screenshotKeyFromUrl(entry.url));
        if (leftUploaded.length !== rightUploaded.length) return false;
        for (let i = 0; i < leftUploaded.length; i++) {
            if (leftUploaded[i] !== rightUploaded[i]) return false;
        }
        return true;
    },

    findIssueButton(modal, labelText) {
        const labels = modal.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-3');
        for (const label of labels) {
            if (!label.textContent.includes('Where are the issues')) continue;
            const row = label.nextElementSibling;
            if (!row) return null;
            for (const button of row.querySelectorAll('button')) {
                const span = button.querySelector('span.text-sm.font-medium');
                if (span && span.textContent.trim() === labelText) {
                    return button;
                }
            }
        }
        return null;
    },

    isIssueButtonSelected(button) {
        const classes = new Set((button.getAttribute('class') || '').split(/\s+/));
        return classes.has('border-brand') || classes.has('text-brand');
    },

    findButtonByText(root, labelText) {
        return Array.from(root.querySelectorAll('button')).find((button) =>
            button.textContent.replace(/\s+/g, ' ').trim() === labelText
        ) || null;
    },

    /**
     * When the native RR dialog is no longer open but we were syncing it, pull a final snapshot
     * into `state.rrData` so the custom tab mirrors native after close (see file header data-flow).
     */
    syncNativeModalIntoTabBeforeUnbind(state) {
        if (state.transactionInProgress) return;
        const modalEl = state.nativeSyncModal;
        if (!modalEl || !state.tabActive) return;
        if (!document.body.contains(modalEl)) return;
        try {
            state.syncingFromNative = true;
            const snapshot = this.readNativeModalSnapshot(modalEl);
            const uploadedCount = (snapshot.screenshots || []).length;
            this.updateFromNativeModalSnapshot(state, snapshot);
            const totalAfter = (state.rrData.screenshots || []).length;
            Logger.log(
                `Request Revisions Tab: mirrored native dialog into custom tab on close (uploadedFromNative=${uploadedCount}, totalAfter=${totalAfter}/${RR_MAX_SCREENSHOTS})`
            );
        } catch (error) {
            Logger.warn('Request Revisions Tab: native→tab mirror on dialog close failed', error);
        } finally {
            state.syncingFromNative = false;
        }
        this.debugLogRrDigestIfChanged(state, 'native→tab after dialog close');
    },

    bindDirectNativeModalSync(state) {
        const modal = this.findRequestRevisionsModal();
        if (!modal || modal === state.transactionModal || modal.hasAttribute(RR_MANAGED_MODAL_MARKER)) {
            if (!modal) {
                this.syncNativeModalIntoTabBeforeUnbind(state);
                this.unbindNativeTaskIssuesSync(state);
            }
            return;
        }

        if (state.tabActive && state.nativeSyncModal !== modal) {
            state.nativeSyncModal = modal;
            Logger.debug('requestRevisionsTab: direct native sync tab became active; exporting tab→native (skipScreenshots)');
            this.exportToNativeModal(state, modal, { skipScreenshots: true }).then(() => {
                this.bindDirectNativeModalSync(state);
            });
            return;
        }

        if (state.nativeSyncModal !== modal || !state.nativeToCustomHandler) {
            this.unbindNativeTaskIssuesSync(state);
            this.bindNativeModalControls(state, modal);
            Logger.debug('requestRevisionsTab: direct native modal sync bound');
        }
    },

    bindNativeModalControls(state, modal) {
        if (state.nativeSyncBindings?.length || state.nativeSyncObserver) {
            // DOM mutations (e.g. prompt-quality button class swaps) intentionally re-run bind;
            // do not log this as losing sync—it is teardown before refreshing element refs.
            this.unbindNativeTaskIssuesSync(state, { silentRebind: true });
        }
        state.nativeSyncModal = modal;
        state.nativeToCustomHandler = () => {
            requestAnimationFrame(() => this.syncNativeModalToCustom(state));
        };
        const handler = state.nativeToCustomHandler;
        state.nativeSyncBindings = [];

        const bind = (element, eventName) => {
            if (!element) return;
            element.addEventListener(eventName, handler);
            state.nativeSyncBindings.push({ element, eventName });
        };
        const bindNativePromptQuality = (button, option) => {
            if (!button) return;
            const promptHandler = () => {
                state.promptQualitySource = 'native';
                state.nativePromptQualityClickAt = Date.now();
                // Authoritatively mirror the native click into tab state. Class-based
                // detection cannot tell whether "Average" is selected (its classes are
                // identical in both states), so without this we'd lose selections to
                // Average and fail to detect any change away from a previous tab choice.
                state.rrData.promptQualityRating = option;
                Logger.log(`Request Revisions Tab: native Prompt Quality click → "${option}" (mirrored to tab)`);
                requestAnimationFrame(() => {
                    state.syncingFromNative = true;
                    try {
                        this.syncCustomControlsFromState(state);
                    } finally {
                        state.syncingFromNative = false;
                    }
                    this.debugLogRrDigestIfChanged(state, 'native prompt-quality click');
                });
            };
            button.addEventListener('click', promptHandler);
            state.nativeSyncBindings.push({ element: button, eventName: 'click', handler: promptHandler });
        };

        bind(modal.querySelector('textarea#feedback-Task'), 'input');
        bind(modal.querySelector('textarea#feedback-Task'), 'change');
        bind(modal.querySelector('textarea[id^="attempted-actions-"]'), 'input');
        bind(modal.querySelector('textarea[id^="attempted-actions-"]'), 'change');
        bind(modal.querySelector('textarea#discard-reason'), 'input');
        bind(modal.querySelector('textarea#discard-reason'), 'change');
        bind(modal.querySelector('textarea#other-reason-explanation'), 'input');
        bind(modal.querySelector('textarea#other-reason-explanation'), 'change');
        bind(this.findNativeScreenshotInput(modal), 'change');

        for (const reason of RR_REJECTION_REASONS) {
            bind(this.findNativeRejectionButton(modal, reason), 'click');
        }
        for (const item of RR_QA_CHECKLIST_ITEMS) {
            bind(this.findNativeQaChecklistButton(modal, item), 'click');
        }
        const promptButtons = this.findNativePromptQualityButtons(modal);
        for (const option of RR_PROMPT_QUALITY_OPTIONS) {
            bindNativePromptQuality(promptButtons[option], option);
        }

        state.nativeSyncObserver = new MutationObserver(() => {
            if (!state.tabActive || state.syncingToNative) return;
            if (!this.isNativeModalOpen(modal)) return;
            this.bindNativeModalControls(state, modal);
            this.syncNativeModalToCustom(state);
        });
        state.nativeSyncObserver.observe(modal, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'data-state', 'aria-checked']
        });
        this.syncNativeModalToCustom(state);
        const nativePromptRead = this.readNativePromptQuality(modal);
        const nativeClickRecent = Date.now() - (state.nativePromptQualityClickAt || 0) < 750;
        if (
            state.rrData.promptQualityRating &&
            !nativePromptRead.selected &&
            state.promptQualitySource !== 'native' &&
            !nativeClickRecent
        ) {
            void this.syncNativePromptQuality(state, modal);
        }
    },

    unbindNativeTaskIssuesSync(state, options = {}) {
        if (state.nativeSyncModal && !options.silentRebind) {
            Logger.debug('requestRevisionsTab: direct native modal sync unbound');
        }
        if (state.nativeSyncBindings?.length && state.nativeToCustomHandler) {
            for (const binding of state.nativeSyncBindings) {
                binding.element?.removeEventListener(
                    binding.eventName,
                    binding.handler || state.nativeToCustomHandler
                );
            }
        }
        state.nativeSyncObserver?.disconnect();
        state.nativeSyncBindings = [];
        state.nativeToCustomHandler = null;
        state.nativeSyncObserver = null;
        state.nativeSyncModal = null;
    },

    isNativeModalOpen(modal) {
        return Boolean(modal) &&
            document.body.contains(modal) &&
            modal.getAttribute('data-state') === 'open';
    },

    syncNativeModalToCustom(state) {
        if (state.syncingToNative || !state.nativeSyncModal) return;
        if (!this.isNativeModalOpen(state.nativeSyncModal)) return;
        state.syncingFromNative = true;
        try {
            const snapshot = this.readNativeModalSnapshot(state.nativeSyncModal);
            const prevPQ = state.rrData.promptQualityRating || '';
            if (
                snapshot.hasPromptQualityRating &&
                snapshot.promptQualityRating &&
                snapshot.promptQualityRating !== prevPQ
            ) {
                state.promptQualitySource = 'native';
                Logger.debug(
                    `requestRevisionsTab: native Prompt Quality read → "${snapshot.promptQualityRating}" (was "${prevPQ || '(none)'}")`
                );
            }
            this.updateFromNativeModalSnapshot(state, snapshot);
            this.scheduleNativeModalTextDebug(state, snapshot);
        } finally {
            state.syncingFromNative = false;
        }
        this.debugLogRrDigestIfChanged(state, 'native→tab');
    },

    setTextareaValueSilently(el, value) {
        if (!el) return;
        if (el.value === value) return;
        const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
    },

    setInputValue(el, value) {
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    },

    waitForAnimationFrame() {
        return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
};
