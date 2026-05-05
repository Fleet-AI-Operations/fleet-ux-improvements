// ============= request-revisions-tab.js =============
// Request Revisions tab that uses short-lived native modal transactions.

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
const RR_MAX_SCREENSHOTS = 5;
const RR_MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

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
    _version: '1.14',
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
        lastCustomTextDebugSig: ''
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
        Logger.debug(`requestRevisionsTab: ${label} rrSelectionDigest=${digest}`);
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
        buttonRow.appendChild(this.createActionButton('Copy Information to Native Modal', () => {
            this.runNativeModalTransaction(state, { mode: 'export', hidden: false });
        }));
        buttonRow.appendChild(this.createActionButton('Silent Request', () => {
            this.runNativeModalTransaction(state, { mode: 'submit-silent', hidden: true });
        }));
        buttonRow.appendChild(this.createActionButton('Request and Notify Author', () => {
            this.runNativeModalTransaction(state, { mode: 'submit-notify', hidden: true });
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
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute(RR_CUSTOM_PROMPT_MARKER, option);
            button.className = 'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-all border-input bg-background text-muted-foreground hover:opacity-90';
            button.textContent = option;
            button.addEventListener('click', () => this.setPromptQualityFromCustom(state, option));
            row.appendChild(button);
        }

        section.appendChild(title);
        section.appendChild(row);
        return section;
    },

    createScreenshotSection(state) {
        const section = document.createElement('div');
        section.className = 'space-y-2';
        const title = document.createElement('div');
        title.className = 'text-sm text-muted-foreground font-medium';
        title.textContent = 'Screenshots (optional)';
        const subtitle = document.createElement('p');
        subtitle.className = 'text-xs text-muted-foreground';
        subtitle.textContent = 'Attach up to 5 screenshots to document visual issues (max 5MB each)';

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
        section.appendChild(title);
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
        this.runNativeModalTransaction(state, { mode: 'export', hidden: true });
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
        state.screenshotUploadButton = panel.querySelector('[data-fleet-rr-custom-ss-picker]')?.previousElementSibling || null;
        state.screenshotPasteButton = panel.querySelector('[data-fleet-rr-custom-ss-picker]')?.previousElementSibling?.nextElementSibling || null;
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
        const added = [];
        for (const file of files) {
            if (next.length >= RR_MAX_SCREENSHOTS) break;
            if (!file.type?.startsWith('image/')) continue;
            if (file.size > RR_MAX_SCREENSHOT_BYTES) continue;
            next.push({
                type: 'pending',
                file,
                localUrl: URL.createObjectURL(file)
            });
            added.push(file);
        }
        state.rrData.screenshots = next;
        this.syncCustomControlsFromState(state);
        this.pushPendingScreenshotsToNative(state);
        for (const file of added) {
            Logger.debug(
                `requestRevisionsTab: custom screenshot queued name=${file.name} bytes=${file.size} total=${state.rrData.screenshots.length}`
            );
        }
        if (!added.length) {
            Logger.debug('requestRevisionsTab: custom screenshot merge skipped (none accepted; likely at cap or non-image)');
        }
    },

    removeCustomScreenshotAt(state, index) {
        const entry = state.rrData.screenshots?.[index];
        if (!entry) return;
        const kind = entry.type;
        const meta =
            kind === 'pending'
                ? `file=${entry.file?.name || '?'}`
                : `urlKey=${screenshotKeyFromUrl(entry.url)}`;
        if (entry.type === 'pending' && entry.localUrl) {
            URL.revokeObjectURL(entry.localUrl);
        }
        if (entry.type === 'uploaded') {
            const modal = this.findRequestRevisionsModal();
            const removeButton = modal ? this.findNativeScreenshotRemoveButton(modal, entry.url) : null;
            if (removeButton) {
                removeButton.click();
            } else {
                state.rrData.deletedScreenshotUrls = [
                    ...(state.rrData.deletedScreenshotUrls || []),
                    screenshotKeyFromUrl(entry.url)
                ];
            }
        }
        state.rrData.screenshots = (state.rrData.screenshots || []).filter((_, idx) => idx !== index);
        this.rebuildNativePendingScreenshotInput(state);
        this.pushPendingScreenshotsToNative(state);
        this.syncCustomControlsFromState(state);
        Logger.debug(`requestRevisionsTab: custom screenshot removed idx=${index} type=${kind} ${meta}`);
    },

    pushPendingScreenshotsToNative(state) {
        const pending = (state.rrData.screenshots || []).filter((entry) => entry.type === 'pending' && entry.file);
        const deleteQueued = (state.rrData.deletedScreenshotUrls || []).length > 0;
        if (!pending.length && !deleteQueued) return;
        const modal = this.findRequestRevisionsModal();
        if (modal && this.isNativeModalOpen(modal)) {
            Logger.debug(
                `requestRevisionsTab: screenshot sync to open native modal pending=${pending.length} deleteQueued=${deleteQueued}`
            );
            void this.syncNativeScreenshots(state, modal);
            return;
        }
        if (!state.transactionInProgress) {
            Logger.debug(
                `requestRevisionsTab: screenshot sync via hidden native export pending=${pending.length} deleteQueued=${deleteQueued}`
            );
            this.runNativeModalTransaction(state, { mode: 'export', hidden: true });
        }
    },

    rebuildNativePendingScreenshotInput(state) {
        const modal = this.findRequestRevisionsModal();
        if (!modal || !this.isNativeModalOpen(modal)) return;
        const input = this.findNativeScreenshotInput(modal);
        if (!input) return;
        const dt = new DataTransfer();
        for (const entry of state.rrData.screenshots || []) {
            if (entry.type !== 'pending' || !entry.file) continue;
            if (dt.items.length >= RR_MAX_SCREENSHOTS) break;
            dt.items.add(entry.file);
        }
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
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
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        const names = accepted.map((f) => `${f.name}:${f.size}`).join(', ');
        Logger.debug(
            `requestRevisionsTab: native screenshot input merged +${accepted.length} (${names}) totalFiles=${input.files.length}`
        );
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

    updateFromNativeModalSnapshot(state, snapshot) {
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
            const previousUploadedCount = (state.rrData.screenshots || [])
                .filter((entry) => entry.type === 'uploaded').length;
            const confirmedPendingCount = Math.max(0, uploaded.length - previousUploadedCount);
            const pending = (state.rrData.screenshots || [])
                .filter((entry) => entry.type === 'pending')
                .slice(confirmedPendingCount);
            state.rrData.screenshots = [
                ...uploaded,
                ...pending
            ].slice(0, RR_MAX_SCREENSHOTS);
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
                const selected = option === state.rrData.promptQualityRating;
                button.classList.toggle('border-blue-500', selected);
                button.classList.toggle('text-blue-700', selected);
                button.classList.toggle('bg-blue-50', selected);
                button.classList.toggle('dark:bg-blue-950/40', selected);
            }

            this.renderCustomScreenshotPreviews(state);
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

            await this.exportToNativeModal(state, modal);
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

    async exportToNativeModal(state, modal) {
        Logger.debug('requestRevisionsTab: exportToNativeModal start');
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
            await this.syncNativeScreenshots(state, modal);
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
        const labels = modal.querySelectorAll('div.text-xs.font-medium.text-muted-foreground, div.text-sm.text-muted-foreground.font-medium');
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
        return out;
    },

    isNativePromptOptionSelected(button) {
        if (!button) return false;
        const classes = new Set((button.getAttribute('class') || '').split(/\s+/));
        return classes.has('border-gray-300') ||
            classes.has('bg-gray-50') ||
            classes.has('text-gray-600') ||
            classes.has('dark:bg-gray-800/50');
    },

    readNativePromptQuality(modal) {
        const map = this.findNativePromptQualityButtons(modal);
        const keys = Object.keys(map);
        let selected = '';
        for (const option of RR_PROMPT_QUALITY_OPTIONS) {
            if (this.isNativePromptOptionSelected(map[option])) {
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
        if (!desired) return;
        const map = this.findNativePromptQualityButtons(modal);
        const button = map[desired];
        if (!button) return;
        if (this.isNativePromptOptionSelected(button)) return;
        Logger.debug(`requestRevisionsTab: native prompt quality sync click → "${desired}"`);
        button.click();
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

    async syncNativeScreenshots(state, modal) {
        const input = this.findNativeScreenshotInput(modal);
        if (!input) return;

        const deleteKeys = state.rrData.deletedScreenshotUrls || [];
        if (deleteKeys.length) {
            Logger.debug(`requestRevisionsTab: native screenshot delete queue keys=${deleteKeys.length}`);
        }

        const remainingDeletes = [];
        for (const key of state.rrData.deletedScreenshotUrls || []) {
            const removeButton = this.findNativeScreenshotRemoveButton(modal, key);
            if (removeButton) {
                Logger.debug(`requestRevisionsTab: native screenshot remove click key=${key}`);
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
        for (const entry of state.rrData.screenshots || []) {
            if (dt.items.length >= RR_MAX_SCREENSHOTS) break;
            if (entry.type !== 'pending' || !entry.file) continue;
            dt.items.add(entry.file);
        }
        if (!dt.files.length) {
            if (deleteKeys.length) {
                Logger.debug('requestRevisionsTab: native screenshot sync (deletes only, no pending upload batch)');
            }
            return;
        }
        const names = pendingEntries.map((e) => `${e.file.name}:${e.file.size}`).join(', ');
        Logger.debug(
            `requestRevisionsTab: native screenshot upload batch files=${dt.files.length} pendingMeta=${names}`
        );
        const previousUploadedCount = this.findNativeScreenshotPreviewImgs(modal).length;
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await this.waitForNativeScreenshotCount(
            modal,
            Math.min(RR_MAX_SCREENSHOTS, previousUploadedCount + pendingEntries.length),
            5000
        );
        this.updateFromNativeModalSnapshot(state, this.readNativeModalSnapshot(modal));
        Logger.debug('requestRevisionsTab: native screenshot sync refreshed snapshot into tab state');
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

    bindDirectNativeModalSync(state) {
        const modal = this.findRequestRevisionsModal();
        if (!modal || modal === state.transactionModal || modal.hasAttribute(RR_MANAGED_MODAL_MARKER)) {
            if (!modal) this.unbindNativeTaskIssuesSync(state);
            return;
        }

        if (state.tabActive && state.nativeSyncModal !== modal) {
            state.nativeSyncModal = modal;
            Logger.debug('requestRevisionsTab: direct native sync tab became active; exporting tab→native');
            this.exportToNativeModal(state, modal).then(() => {
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
            bind(promptButtons[option], 'click');
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
        if (state.rrData.promptQualityRating && !this.readNativePromptQuality(modal).selected) {
            void this.syncNativePromptQuality(state, modal);
        }
    },

    unbindNativeTaskIssuesSync(state, options = {}) {
        if (state.nativeSyncModal && !options.silentRebind) {
            Logger.debug('requestRevisionsTab: direct native modal sync unbound');
        }
        if (state.nativeSyncBindings?.length && state.nativeToCustomHandler) {
            for (const binding of state.nativeSyncBindings) {
                binding.element?.removeEventListener(binding.eventName, state.nativeToCustomHandler);
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
