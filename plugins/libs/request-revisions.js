// ============= request-revisions.js (library) =============
// Shared Request Revisions modal improvements: guideline/copy buttons, prompt-quality
// restore, task-only issue selection, and screenshot drag-drop/paste upload.

const FLEET_GUIDELINES = {
    general: 'https://www.fleetai.com/work/guidelines?doc=c007bc70-5202-4bfd-95bb-4f1699d8b9f3',
    toolUse: 'https://www.fleetai.com/work/guidelines?doc=1d4e376a-04e5-4636-93b9-faeeca44f80b',
    qa: 'https://www.fleetai.com/work/guidelines?doc=171f1c3e-3ba9-4531-a5e2-30a8f301ea43',
    timeSubmission: 'https://www.fleetai.com/work/guidelines?doc=f2536177-34a9-4a34-967e-0b8c374c203c'
};

const GUIDELINE_BUTTON_SPECS = [
    { group: 'general', subOptionId: 'copy-link-general-guidelines', title: 'General Guidelines', url: FLEET_GUIDELINES.general },
    { group: 'tool-use', subOptionId: 'copy-link-tool-use-guidelines', title: 'Tool Use Guidelines', url: FLEET_GUIDELINES.toolUse },
    { group: 'qa-guidelines', subOptionId: 'copy-link-qa-guidelines', title: 'QA Guidelines', url: FLEET_GUIDELINES.qa },
    { group: 'time-submission', subOptionId: 'copy-link-time-submission-guidelines', title: 'Time Submission Guidelines', url: FLEET_GUIDELINES.timeSubmission }
];

const GUIDELINE_COPY_WRAPPER_MARKER = 'data-fleet-guideline-copy-links';
const COPY_PROMPT_MARKER = 'data-fleet-revisions-copy-prompt';
const COPY_PROMPT_SUBOPTION_ID = 'copy-prompt-button';
const COPY_VERIFIER_OUTPUT_MARKER = 'data-fleet-revisions-copy-verifier';
const COPY_VERIFIER_SUBOPTION_ID = 'copy-verifier-output-button';
const TASK_ONLY_SUBOPTION_ID = 'task-only-issues';
const SCREENSHOT_SUBOPTION_ID = 'screenshot-upload-improvement';

const PROMPT_QUALITY_VALUES = ['Top 10%', 'Average', 'Bottom 10%'];
const PROMPT_QUALITY_LISTENER_MARKER = 'data-fleet-prompt-quality-listener';

const TASK_ONLY_STYLE_ID = 'fleet-request-revisions-task-only-style';
const TASK_ONLY_DIALOG_ATTR = 'data-fleet-rr-task-only';
const TASK_ONLY_HIDDEN_ATTR = 'data-fleet-rr-issue-hidden';

const SCREENSHOT_STYLE_ID = 'fleet-request-revisions-screenshot-upload-improvement-style';
const CONTROLS_WRAP_ATTR = 'data-fleet-request-revisions-screenshot-controls';
const UPLOAD_CONTROL_ATTR = 'data-fleet-request-revisions-screenshot-upload';
const PASTE_BUTTON_ATTR = 'data-fleet-request-revisions-paste-image';
const NATIVE_LABEL_ATTR = 'data-fleet-request-revisions-native-label';
const FILE_INPUT_ATTR = 'data-fleet-request-revisions-forward-input';
const ZONE_WRAP_ATTR = 'data-fleet-request-revisions-screenshot-zone';

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;

const UPLOAD_CONTROL_CLASS =
    'flex flex-1 min-w-0 items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-border ' +
    'hover:border-brand/50 hover:bg-muted/50 cursor-pointer transition-colors';
const PASTE_BUTTON_CLASS =
    'inline-flex shrink-0 items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-border ' +
    'hover:border-brand/50 hover:bg-muted/50 cursor-pointer transition-colors text-sm';
const DRAG_OVER_CLASSES = ['ring-2', 'ring-brand/50'];

function imageFilesFromFileList(list) {
    if (!list || !list.length) return [];
    return Array.from(list).filter(f => f.type && f.type.startsWith('image/'));
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
    const inp = el.closest('input');
    if (!inp) return false;
    const type = (inp.getAttribute('type') || 'text').toLowerCase();
    const passthrough = new Set(['file', 'button', 'submit', 'reset', 'checkbox', 'radio', 'hidden']);
    return !passthrough.has(type);
}

const RequestRevisionsApi = {
    run(state, options) {
        const pluginId = (options && options.pluginId) || 'requestRevisions';

        if (state.verifierWatchEligibleAt === undefined) {
            state.verifierWatchEligibleAt = Date.now() + 1500;
        }

        const dialogs = Context.dom.queryAll('div[role="dialog"][data-state="open"]', {
            context: `${pluginId}.dialogs`
        });

        if (dialogs.length === 0) {
            this.resetTaskOnlyOnClose(state);
            if (state.lastSig !== 0) state.lastSig = 0;
            return;
        }

        const modal = this.findRequestRevisionsModal(dialogs, pluginId);
        if (!modal) {
            this.resetTaskOnlyOnClose(state);
            if (!state.missingLogged) {
                Logger.debug('Request Revisions modal not found');
                state.missingLogged = true;
            }
            const copyVerifierEnabled = Storage.getSubOptionEnabled(pluginId, COPY_VERIFIER_SUBOPTION_ID, true);
            if (
                copyVerifierEnabled &&
                state.verifierWatchEligibleAt !== undefined &&
                Date.now() >= state.verifierWatchEligibleAt
            ) {
                this.watchVerifierOutput(state);
            }
            return;
        }

        state.missingLogged = false;
        state.verifierWatchEligibleAt = Math.min(state.verifierWatchEligibleAt ?? Infinity, Date.now());

        const copyVerifierEnabled = Storage.getSubOptionEnabled(pluginId, COPY_VERIFIER_SUBOPTION_ID, true);
        if (copyVerifierEnabled && Date.now() >= state.verifierWatchEligibleAt) {
            this.watchVerifierOutput(state);
        }

        const sig = dialogs.length + '|' + dialogs.map((d) => d.outerHTML.length).join(',');
        if (sig !== state.lastSig) {
            state.lastSig = sig;
            this.injectGuidelineCopyButtons(state, modal, pluginId);
            this.capturePromptQualityRating(state, modal, pluginId);
            this.restorePromptQualityRating(state, modal);
        }

        if (Storage.getSubOptionEnabled(pluginId, TASK_ONLY_SUBOPTION_ID, true)) {
            this.applyTaskOnly(state, modal, pluginId);
        }

        if (Storage.getSubOptionEnabled(pluginId, SCREENSHOT_SUBOPTION_ID, true)) {
            this.applyScreenshotUpload(state, pluginId);
        }
    },

    findRequestRevisionsModal(dialogs, pluginId) {
        for (const dialog of dialogs) {
            const heading = Context.dom.query('h2', {
                root: dialog,
                context: `${pluginId}.heading`
            });
            if (!heading || !heading.textContent.includes('Request Revisions')) continue;
            const hasFeedbackId = dialog.querySelector(
                '#feedback-Task, #feedback-Environment, [id^="feedback-"]'
            );
            if (hasFeedbackId) return dialog;
        }
        for (const dialog of dialogs) {
            const heading = Context.dom.query('h2', {
                root: dialog,
                context: `${pluginId}.heading`
            });
            if (heading && heading.textContent.includes('Request Revisions')) {
                return dialog;
            }
        }
        return null;
    },

    // --- Prompt discovery (comp-use section first, then tool-use task panel) ---

    findPromptSection() {
        const candidates = document.querySelectorAll('div.flex.flex-col.gap-2');
        for (const candidate of candidates) {
            const label = candidate.querySelector('label');
            const span = candidate.querySelector('span.text-sm.text-muted-foreground.font-medium');
            if (label && label.textContent.trim() === 'Prompt') {
                return candidate;
            }
            if (span && span.textContent.trim() === 'Prompt') {
                return candidate;
            }
        }
        return null;
    },

    getPromptTextFromSection(promptSection) {
        const textarea = promptSection.querySelector('textarea');
        if (textarea && textarea.value !== undefined) {
            return textarea.value.trim();
        }
        const preWrap = promptSection.querySelector('div.text-sm.whitespace-pre-wrap');
        if (preWrap) {
            return preWrap.textContent.trim();
        }
        return null;
    },

    findTaskPanel() {
        const panels = document.querySelectorAll('[data-panel][data-panel-id]');
        for (const p of panels) {
            const hasPromptLabel = Array.from(p.querySelectorAll('span, label')).some(
                (el) => (el.textContent || '').trim() === 'Prompt'
            );
            const promptContent = p.querySelector('.text-sm.whitespace-pre-wrap');
            if (hasPromptLabel && promptContent) return p;
        }
        for (const p of panels) {
            const hasPromptLabel = Array.from(p.querySelectorAll('span, label')).some((el) => {
                const t = (el.textContent || '').trim();
                return t === 'Prompt' || (t.length > 0 && t.includes('Prompt'));
            });
            const promptContent =
                p.querySelector('.text-sm.whitespace-pre-wrap') ||
                p.querySelector('[class*="whitespace-pre-wrap"]');
            if (hasPromptLabel && promptContent && promptContent.textContent.trim().length > 0) {
                return p;
            }
        }
        return document.querySelector('[id=":re:"]') || document.querySelector('[data-panel-id=":re:"]');
    },

    findWhereAreTheIssuesButtonRow(modal) {
        const section = this.findWhereAreTheIssuesSection(modal);
        return section && section.buttonRow ? section.buttonRow : null;
    },

    findWhereAreTheIssuesSection(modal) {
        const labels = modal.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-3');
        for (const label of labels) {
            if (label.textContent && label.textContent.includes('Where are the issues')) {
                const buttonRow = label.nextElementSibling;
                if (
                    buttonRow &&
                    buttonRow.classList.contains('flex') &&
                    buttonRow.classList.contains('gap-3')
                ) {
                    return { label, buttonRow };
                }
                return { label, buttonRow: null };
            }
        }
        return null;
    },

    injectGuidelineCopyButtons(state, modal, pluginId) {
        const buttonRow = this.findWhereAreTheIssuesButtonRow(modal);
        if (!buttonRow) return;

        const buttonClass =
            'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';

        let wrapper = modal.querySelector(`[${GUIDELINE_COPY_WRAPPER_MARKER}="true"]`);
        if (wrapper) {
            this.removeLegacyGuidelineGroups(wrapper);
            this.syncGuidelineCopyButtons(state, wrapper, buttonClass, pluginId);
            return;
        }

        wrapper = document.createElement('div');
        wrapper.setAttribute('data-fleet-plugin', pluginId);
        wrapper.setAttribute(GUIDELINE_COPY_WRAPPER_MARKER, 'true');
        wrapper.className = 'flex flex-wrap gap-2 mt-2';

        for (const spec of GUIDELINE_BUTTON_SPECS) {
            wrapper.appendChild(
                this.createGuidelineOpenButton(buttonClass, spec.group, spec.url, spec.title, pluginId)
            );
        }

        if (this.hasResultParamsGrid()) {
            const copyResultParamsBtn = document.createElement('button');
            copyResultParamsBtn.type = 'button';
            copyResultParamsBtn.className = buttonClass;
            copyResultParamsBtn.setAttribute('data-fleet-plugin', pluginId);
            copyResultParamsBtn.textContent = 'Copy Result Params and Inputs';
            copyResultParamsBtn.title = 'Copy parameter labels and values to clipboard';
            copyResultParamsBtn.addEventListener('click', () =>
                this.handleCopyResultParamsClick(copyResultParamsBtn)
            );
            wrapper.appendChild(copyResultParamsBtn);
        }

        buttonRow.insertAdjacentElement('afterend', wrapper);
        Logger.log('Request Revisions: guideline buttons added');
        this.removeLegacyGuidelineGroups(wrapper);
        this.syncGuidelineCopyButtons(state, wrapper, buttonClass, pluginId);
    },

    removeLegacyGuidelineGroups(wrapper) {
        for (const legacy of ['kinesis', 'meridian']) {
            const n = wrapper.querySelector(`[data-guideline-group="${legacy}"]`);
            if (n) n.remove();
        }
    },

    _reorderGuidelineGroupsAfterUtilities(wrapper, orderedGroupIds) {
        let lastUtility = null;
        const v = wrapper.querySelector(`[${COPY_VERIFIER_OUTPUT_MARKER}="true"]`);
        const p = wrapper.querySelector(`[${COPY_PROMPT_MARKER}="true"]`);
        if (v) lastUtility = v;
        if (p) lastUtility = p;
        let ref = lastUtility;
        for (const gid of orderedGroupIds) {
            const node = wrapper.querySelector(`[data-guideline-group="${gid}"]`);
            if (!node || node.style.display === 'none') continue;
            if (ref) {
                if (ref.nextSibling !== node) wrapper.insertBefore(node, ref.nextSibling);
                ref = node;
            } else {
                wrapper.insertBefore(node, wrapper.firstChild);
                ref = node;
            }
        }
    },

    createGuidelineOpenButton(buttonClass, groupId, url, shortTitle, pluginId) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = buttonClass;
        btn.setAttribute('data-fleet-plugin', pluginId);
        btn.setAttribute('data-guideline-group', groupId);
        btn.textContent = shortTitle;
        btn.title = `Open ${shortTitle} in a new tab`;
        btn.addEventListener('click', () => {
            window.open(url, '_blank');
            Logger.log(`Request Revisions: opened ${shortTitle}`);
        });
        return btn;
    },

    migrateLegacyGuidelineOpenControl(wrapper, groupId, url, shortTitle, buttonClass, pluginId) {
        const el = wrapper.querySelector(`[data-guideline-group="${groupId}"]`);
        if (!el) return;
        const isLegacy = el.tagName === 'SPAN' && el.querySelector('a');
        if (!isLegacy) return;
        const btn = this.createGuidelineOpenButton(buttonClass, groupId, url, shortTitle, pluginId);
        el.replaceWith(btn);
        Logger.debug(`Request Revisions: migrated legacy ${shortTitle} control to open-only button`);
    },

    syncGuidelineCopyButtons(state, wrapper, buttonClass, pluginId) {
        this.removeLegacyGuidelineGroups(wrapper);
        for (const spec of GUIDELINE_BUTTON_SPECS) {
            this.migrateLegacyGuidelineOpenControl(
                wrapper,
                spec.group,
                spec.url,
                spec.title,
                buttonClass,
                pluginId
            );
        }
        for (const spec of GUIDELINE_BUTTON_SPECS) {
            const enabled = Storage.getSubOptionEnabled(pluginId, spec.subOptionId, true);
            let el = wrapper.querySelector(`[data-guideline-group="${spec.group}"]`);
            if (!enabled) {
                if (el) el.style.display = 'none';
                continue;
            }
            if (!el) {
                el = this.createGuidelineOpenButton(
                    buttonClass,
                    spec.group,
                    spec.url,
                    spec.title,
                    pluginId
                );
                wrapper.appendChild(el);
            } else {
                el.style.display = '';
                if (el.textContent !== spec.title) {
                    el.replaceWith(
                        this.createGuidelineOpenButton(
                            buttonClass,
                            spec.group,
                            spec.url,
                            spec.title,
                            pluginId
                        )
                    );
                }
            }
        }

        const copyVerifierEnabled = Storage.getSubOptionEnabled(pluginId, COPY_VERIFIER_SUBOPTION_ID, true);
        this.syncCopyVerifierOutputButton(state, wrapper, copyVerifierEnabled, buttonClass, pluginId);
        const copyPromptEnabled = Storage.getSubOptionEnabled(pluginId, COPY_PROMPT_SUBOPTION_ID, true);
        this.syncCopyPromptButton(state, wrapper, copyPromptEnabled, buttonClass, pluginId);
        this._reorderGuidelineGroupsAfterUtilities(
            wrapper,
            GUIDELINE_BUTTON_SPECS.map((s) => s.group)
        );

        const hasGrid = this.hasResultParamsGrid();
        const copyResultParamsBtn = Array.from(
            wrapper.querySelectorAll(`button[data-fleet-plugin="${pluginId}"]`)
        ).find((btn) => btn.textContent === 'Copy Result Params and Inputs');

        if (hasGrid) {
            if (copyResultParamsBtn) {
                copyResultParamsBtn.style.display = '';
            } else {
                const newBtn = document.createElement('button');
                newBtn.type = 'button';
                newBtn.className = buttonClass;
                newBtn.setAttribute('data-fleet-plugin', pluginId);
                newBtn.textContent = 'Copy Result Params and Inputs';
                newBtn.title = 'Copy parameter labels and values to clipboard';
                newBtn.addEventListener('click', () => this.handleCopyResultParamsClick(newBtn));
                wrapper.appendChild(newBtn);
                Logger.debug('Request Revisions: Copy Result Params button created dynamically');
            }
        } else if (copyResultParamsBtn) {
            copyResultParamsBtn.style.display = 'none';
        }

        const copyRp = Array.from(
            wrapper.querySelectorAll(`button[data-fleet-plugin="${pluginId}"]`)
        ).find((btn) => btn.textContent === 'Copy Result Params and Inputs');
        if (copyRp && copyRp.style.display !== 'none') wrapper.appendChild(copyRp);
    },

    syncCopyVerifierOutputButton(state, wrapper, copyVerifierEnabled, buttonClass, pluginId) {
        let btn = wrapper.querySelector(`[${COPY_VERIFIER_OUTPUT_MARKER}="true"]`);
        if (copyVerifierEnabled) {
            if (!btn) {
                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = buttonClass;
                btn.setAttribute('data-fleet-plugin', pluginId);
                btn.setAttribute(COPY_VERIFIER_OUTPUT_MARKER, 'true');
                btn.textContent = 'Copy Verifier Output';
                btn.title = 'Copy verifier output to clipboard';
                btn.addEventListener('click', () => this.handleCopyVerifierOutputClick(state, btn));
                wrapper.insertBefore(btn, wrapper.firstChild);
                Logger.debug('Request Revisions: Copy Verifier Output button added');
            }
            btn.style.display = '';
        } else if (btn) {
            btn.style.display = 'none';
        }
    },

    syncCopyPromptButton(state, wrapper, copyPromptEnabled, buttonClass, pluginId) {
        let btn = wrapper.querySelector(`[${COPY_PROMPT_MARKER}="true"]`);
        if (copyPromptEnabled) {
            if (!btn) {
                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = buttonClass;
                btn.setAttribute('data-fleet-plugin', pluginId);
                btn.setAttribute(COPY_PROMPT_MARKER, 'true');
                btn.textContent = 'Copy Prompt';
                btn.title = 'Copy task prompt to clipboard';
                btn.addEventListener('click', () => this.handleCopyPromptClick(state, btn));
                wrapper.insertBefore(btn, wrapper.firstChild);
                Logger.debug('Request Revisions: Copy Prompt button added');
            }
            btn.style.display = '';
        } else if (btn) {
            btn.style.display = 'none';
        }
    },

    getPromptTextForClipboard(state) {
        const section = this.findPromptSection();
        if (section) {
            const text = this.getPromptTextFromSection(section);
            if (text) {
                state.promptText = text;
                return text;
            }
        }
        const panel = this.findTaskPanel();
        if (panel) {
            const el =
                panel.querySelector('.text-sm.whitespace-pre-wrap') ||
                panel.querySelector('[class*="whitespace-pre-wrap"]');
            if (el) {
                const text = el.textContent.trim();
                if (text) {
                    state.promptText = text;
                    return text;
                }
            }
        }
        return (state.promptText && String(state.promptText).trim()) || '';
    },

    handleCopyPromptClick(state, button) {
        const text = this.getPromptTextForClipboard(state);
        if (!text) {
            Logger.warn('Request Revisions: No prompt text to copy');
            this.showCopyFailurePulse(button);
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            Logger.log(`Request Revisions: Copied prompt to clipboard (${text.length} chars)`);
            this.showCopySuccessFlash(button);
        }).catch((err) => {
            Logger.error('Request Revisions: Failed to copy prompt', err);
            this.showCopyFailurePulse(button);
        });
    },

    getVerifierTextForClipboard(state) {
        const fresh = this.tryCaptureVerifierOutput();
        if (fresh) {
            const text =
                fresh.kind === 'pre'
                    ? fresh.node.textContent.trim()
                    : (this.buildScoreVerifierMarkdown(fresh.node) || '').trim();
            if (text) return text;
        }
        return (state.verifierOutput && String(state.verifierOutput).trim()) || '';
    },

    handleCopyVerifierOutputClick(state, button) {
        const text = this.getVerifierTextForClipboard(state);
        if (!text) {
            Logger.warn('Request Revisions: No verifier output to copy');
            this.showCopyFailurePulse(button);
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            Logger.log(`Request Revisions: Copied verifier output to clipboard (${text.length} chars)`);
            this.showCopySuccessFlash(button);
        }).catch((err) => {
            Logger.error('Request Revisions: Failed to copy verifier output', err);
            this.showCopyFailurePulse(button);
        });
    },

    findYourAnswerSection(root = document) {
        const headings = root.querySelectorAll('h4');
        for (const h of headings) {
            if (h.textContent && h.textContent.trim() === 'Your Answer') {
                const blueBox = h.closest('.rounded-lg.border');
                if (
                    blueBox &&
                    (blueBox.classList.contains('border-blue-200') ||
                        blueBox.classList.contains('dark:border-blue-800'))
                ) {
                    return blueBox;
                }
                return (
                    h.closest('div.space-y-4') ||
                    h.closest('div[class*="border-blue"]') ||
                    h.parentElement?.parentElement
                );
            }
        }
        return null;
    },

    hasResultParamsGrid() {
        const section = this.findYourAnswerSection();
        if (!section) return false;
        const grid = section.querySelector('.grid.grid-cols-1.gap-4') || section.querySelector('.grid');
        if (!grid) return false;
        const rows = grid.querySelectorAll('.space-y-2');
        for (const row of rows) {
            const label = row.querySelector('label');
            const input = row.querySelector('input, textarea');
            if (label && input) return true;
        }
        return false;
    },

    getResultParamsTextFromPage() {
        const section = this.findYourAnswerSection();
        if (!section) return '';
        const grid = section.querySelector('.grid.grid-cols-1.gap-4') || section.querySelector('.grid');
        if (!grid) return '';
        const lines = [];
        const rows = grid.querySelectorAll('.space-y-2');
        for (const row of rows) {
            const label = row.querySelector('label');
            const input = row.querySelector('input, textarea');
            if (!label || !input) continue;
            const labelText = label.textContent.replace(/\s+/g, ' ').trim();
            const value =
                input.value != null && input.value !== undefined ? String(input.value).trim() : '';
            lines.push(`${labelText}: ${value}`);
        }
        return lines.join('\n');
    },

    showCopySuccessFlash(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(button, { restoreStyles: false });
    },

    showCopyFailurePulse(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.flashFailure(button, { restoreStyles: false });
    },

    handleCopyResultParamsClick(button) {
        const text = this.getResultParamsTextFromPage();
        if (!text) {
            Logger.warn('Request Revisions: No result params to copy');
            this.showCopyFailurePulse(button);
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            Logger.log(`Request Revisions: Copied result params to clipboard (${text.length} chars)`);
            this.showCopySuccessFlash(button);
        }).catch((err) => {
            Logger.error('Request Revisions: Failed to copy result params', err);
            this.showCopyFailurePulse(button);
        });
    },

    findPromptQualityRatingSection(modal) {
        const labels = modal.querySelectorAll('label');
        for (const label of labels) {
            if (label.textContent && label.textContent.includes('Prompt Quality Rating')) {
                const container = label.closest('div.flex.flex-col.gap-2') || label.parentElement;
                if (container) {
                    const buttonGroup = container.querySelector('div.flex.gap-2');
                    if (buttonGroup) return { container, buttonGroup };
                }
                break;
            }
        }
        return null;
    },

    getRatingButtons(buttonGroup) {
        const buttons = buttonGroup.querySelectorAll('button');
        const result = {};
        for (const btn of buttons) {
            const text = btn.textContent.trim();
            if (PROMPT_QUALITY_VALUES.includes(text)) result[text] = btn;
        }
        return result;
    },

    isRatingButtonSelected(button) {
        return (
            button.classList.contains('border-brand') ||
            button.classList.contains('bg-brand') ||
            button.classList.contains('bg-brand/5') ||
            button.classList.contains('bg-gray-50') ||
            (button.getAttribute('class') || '').includes('dark:bg-gray-800')
        );
    },

    capturePromptQualityRating(state, modal, pluginId) {
        const section = this.findPromptQualityRatingSection(modal);
        if (!section || section.buttonGroup.getAttribute(PROMPT_QUALITY_LISTENER_MARKER) === 'true') {
            return;
        }
        section.buttonGroup.setAttribute(PROMPT_QUALITY_LISTENER_MARKER, 'true');
        section.buttonGroup.setAttribute('data-fleet-plugin', pluginId);
        section.buttonGroup.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            const text = button.textContent.trim();
            if (PROMPT_QUALITY_VALUES.includes(text)) {
                state.promptQualityRating = text;
                Logger.debug(`Request Revisions: prompt quality rating set to "${text}"`);
            }
        });
    },

    restorePromptQualityRating(state, modal) {
        if (!state.promptQualityRating || !PROMPT_QUALITY_VALUES.includes(state.promptQualityRating)) {
            return;
        }
        const section = this.findPromptQualityRatingSection(modal);
        if (!section) return;
        const buttons = this.getRatingButtons(section.buttonGroup);
        const targetButton = buttons[state.promptQualityRating];
        if (!targetButton || this.isRatingButtonSelected(targetButton)) return;
        targetButton.click();
        Logger.debug(`Request Revisions: restored prompt quality rating to "${state.promptQualityRating}"`);
    },

    findScoreRow() {
        const candidates = document.querySelectorAll('div.flex.items-center.text-sm.mb-3');
        for (const el of candidates) {
            for (const s of el.querySelectorAll('span')) {
                if (s.textContent.trim() === 'Score:') {
                    return el;
                }
            }
        }
        return null;
    },

    findStdoutRow() {
        const candidates = document.querySelectorAll(
            'div.text-sm.text-muted-foreground.font-medium.mb-1'
        );
        for (const el of candidates) {
            if (el.textContent.trim() === 'Stdout') {
                return el;
            }
        }
        return null;
    },

    buildScoreVerifierMarkdown(container) {
        const list = container.querySelector('div.text-xs.mb-3.space-y-0\\.5');
        if (!list) {
            return null;
        }
        const rows = list.querySelectorAll(':scope > div.flex.items-start');
        const successes = [];
        const failures = [];
        for (const row of rows) {
            const svg = row.querySelector(':scope > svg');
            if (!svg) continue;
            const cls = svg.getAttribute('class') || '';
            const span = row.querySelector(':scope > span');
            const text = (span ? String(span.textContent || '').replace(/\s+/g, ' ').trim() : '')
                .replace(/^\[(?:C|X)\]\s*/i, '')
                .trim();
            if (!text) continue;
            if (cls.includes('text-emerald')) {
                successes.push(text);
            } else if (cls.includes('text-red')) {
                failures.push(text);
            }
        }
        if (successes.length === 0 && failures.length === 0) {
            return null;
        }
        const lines = ['## Verifier'];
        if (successes.length > 0) {
            lines.push('#### Successes');
            for (const t of successes) {
                lines.push(`✅ ${t}`);
            }
        }
        if (failures.length > 0) {
            lines.push('');
            lines.push('#### Failures');
            for (const t of failures) {
                lines.push(`❌ ${t}`);
            }
        }
        const body = lines.join('\n');
        let maxRun = 0;
        let run = 0;
        for (let i = 0; i < body.length; i++) {
            if (body[i] === '`') {
                run++;
                if (run > maxRun) maxRun = run;
            } else {
                run = 0;
            }
        }
        const fenceLen = Math.max(3, maxRun + 1);
        const fence = '`'.repeat(fenceLen);
        return `${fence}\n${body}\n${fence}`;
    },

    getVerifierPreFromContainer(container) {
        const pre = container.querySelector('div.overflow-x-auto.bg-background.border.rounded pre');
        return pre && pre.textContent.trim().length > 0 ? pre : null;
    },

    tryCaptureVerifierOutput() {
        const scoreRow = this.findScoreRow();
        if (scoreRow) {
            const container = scoreRow.closest('div.p-3') || scoreRow.closest('div.p-2');
            if (container) {
                const md = this.buildScoreVerifierMarkdown(container);
                if (md && md.length > 0) {
                    return { kind: 'score', node: container };
                }
            }
        }
        const stdoutRow = this.findStdoutRow();
        if (!stdoutRow) return null;
        const container = stdoutRow.closest('div.text-xs.w-full');
        if (!container) return null;
        const pre = this.getVerifierPreFromContainer(container);
        return pre ? { kind: 'pre', node: pre } : null;
    },

    watchVerifierOutput(state) {
        if (state.verifierObserver) {
            return;
        }

        const tryCaptureVerifier = () => this.tryCaptureVerifierOutput();

        const captured = tryCaptureVerifier();
        if (captured) {
            Logger.debug(`Verifier container detected`);
            this.saveVerifierOutput(state, captured);
            return;
        }

        const containerObserver = new MutationObserver(() => {
            const next = tryCaptureVerifier();
            if (next) {
                Logger.debug(`Verifier container detected`);
                containerObserver.disconnect();
                state.verifierObserver = null;
                this.saveVerifierOutput(state, next);
            }
        });

        containerObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        state.verifierObserver = containerObserver;
    },

    saveVerifierOutput(state, capture) {
        const getText = () => {
            if (capture.kind === 'pre') {
                return capture.node.textContent.trim();
            }
            return this.buildScoreVerifierMarkdown(capture.node) || '';
        };

        state.verifierOutput = getText();
        state.verifierElement = capture.node;

        Logger.debug(`Verifier output saved (${state.verifierOutput.length} chars)`);

        const changeObserver = new MutationObserver(() => {
            const newOutput = getText();
            if (newOutput !== state.verifierOutput && newOutput.length > 0) {
                state.verifierOutput = newOutput;
                Logger.debug(`Verifier output updated (${state.verifierOutput.length} chars)`);
            }
        });

        changeObserver.observe(capture.node, {
            childList: true,
            subtree: true,
            characterData: true
        });

        state.verifierChangeObserver = changeObserver;
    },

    // --- Task-only issues ---

    resetTaskOnlyOnClose(state) {
        if (state.activationLogged) {
            Logger.debug(`Request Revisions modal closed — reset`);
            state.activationLogged = false;
        }
        state.warnLogged = false;
    },

    applyTaskOnly(state, modal, pluginId) {
        this.ensureTaskOnlyStyles(state, pluginId);

        if (modal.getAttribute(TASK_ONLY_DIALOG_ATTR) === '1') return;

        const section = this.findWhereAreTheIssuesSection(modal);
        if (!section || !section.buttonRow) {
            if (!state.warnLogged) {
                Logger.warn(
                    `Request Revisions modal open but "Where are the issues?" button row missing`
                );
                state.warnLogged = true;
            }
            return;
        }
        state.warnLogged = false;

        const hidParts = [];
        let clickedTask = false;
        let taskAlreadySelected = false;

        const buttons = section.buttonRow.querySelectorAll('button[type="button"]');
        for (const btn of buttons) {
            const label = this.getIssueButtonLabel(btn);
            if (label === 'Task') {
                if (this.isIssueButtonSelected(btn)) {
                    taskAlreadySelected = true;
                } else {
                    btn.click();
                    clickedTask = true;
                }
                btn.setAttribute(TASK_ONLY_HIDDEN_ATTR, '1');
                hidParts.push('Task');
            } else if (label === 'Environment' || label === 'Grading') {
                btn.setAttribute(TASK_ONLY_HIDDEN_ATTR, '1');
                hidParts.push(label);
            }
        }

        if (section.label) {
            section.label.setAttribute(TASK_ONLY_HIDDEN_ATTR, '1');
        }
        section.buttonRow.setAttribute(TASK_ONLY_HIDDEN_ATTR, '1');

        modal.setAttribute(TASK_ONLY_DIALOG_ATTR, '1');

        const hidSummary = hidParts.length ? `hid ${hidParts.join('+')}` : 'no issue buttons to hide';
        const taskSummary = clickedTask
            ? 'auto-selected Task'
            : taskAlreadySelected
              ? 'Task already selected'
              : 'Task button not found';
        Logger.log(`${hidSummary}, ${taskSummary}`);
        state.activationLogged = true;
    },

    ensureTaskOnlyStyles(state, pluginId) {
        if (state.taskOnlyStyleReady && document.getElementById(TASK_ONLY_STYLE_ID)) return;
        let style = document.getElementById(TASK_ONLY_STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = TASK_ONLY_STYLE_ID;
            style.setAttribute('data-fleet-plugin', pluginId);
            document.head.appendChild(style);
        }
        style.textContent = `
[${TASK_ONLY_HIDDEN_ATTR}="1"] {
    display: none !important;
}
`;
        state.taskOnlyStyleReady = true;
    },

    getIssueButtonLabel(btn) {
        const span = btn.querySelector('span.text-sm.font-medium');
        const text = span && span.textContent ? span.textContent : btn.textContent || '';
        return text.trim();
    },

    isIssueButtonSelected(btn) {
        return btn.classList.contains('border-brand');
    },

    // --- Screenshot upload ---

    applyScreenshotUpload(state, pluginId) {
        this.ensureScreenshotStyles(state, pluginId);
        const found = this.findNativeScreenshotControl();
        if (!found) {
            if (!state.screenshotMissingLogged) {
                Logger.debug(
                    'Request Revisions screenshot upload improvement: native file control not found'
                );
                state.screenshotMissingLogged = true;
            }
            return;
        }
        state.screenshotMissingLogged = false;

        const { label, input } = found;
        const zone = label.parentElement;
        if (zone) {
            this.removeDuplicateImprovementControls(zone, label);
            if (zone.querySelector(`[${CONTROLS_WRAP_ATTR}]`) && zone.contains(label)) {
                this.ensurePasteListener(state);
                return;
            }
        }

        const innerWrap = zone;
        if (innerWrap && !innerWrap.hasAttribute(ZONE_WRAP_ATTR)) {
            innerWrap.setAttribute(ZONE_WRAP_ATTR, '1');
            innerWrap.classList.add('relative');
        }

        label.setAttribute(NATIVE_LABEL_ATTR, '1');
        input.setAttribute(FILE_INPUT_ATTR, '1');

        const row = document.createElement('div');
        row.setAttribute(CONTROLS_WRAP_ATTR, '1');
        row.setAttribute('data-fleet-plugin', pluginId);
        row.className = 'flex flex-row flex-wrap gap-2 w-full min-w-0';

        const uploadControl = document.createElement('button');
        uploadControl.type = 'button';
        uploadControl.setAttribute(UPLOAD_CONTROL_ATTR, '1');
        uploadControl.className = UPLOAD_CONTROL_CLASS;
        uploadControl.setAttribute(
            'aria-label',
            'Drag and drop images here or click to upload screenshots'
        );
        uploadControl.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 shrink-0" aria-hidden="true">
  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"></path>
  <line x1="16" x2="22" y1="5" y2="5"></line>
  <line x1="19" x2="19" y1="2" y2="8"></line>
  <circle cx="9" cy="9" r="2"></circle>
  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
</svg>
<span class="text-sm whitespace-nowrap">Drag &amp; Drop/Upload</span>
`;

        let dragDepth = 0;
        const onDragEnter = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepth++;
            uploadControl.classList.add(...DRAG_OVER_CLASSES);
        };
        const onDragLeave = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) uploadControl.classList.remove(...DRAG_OVER_CLASSES);
        };
        const onDragOver = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
        const onDrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepth = 0;
            uploadControl.classList.remove(...DRAG_OVER_CLASSES);
            const files = imageFilesFromFileList(e.dataTransfer && e.dataTransfer.files);
            if (files.length) {
                this.mergeIntoFileInput(input, files);
            }
        };

        uploadControl.addEventListener('click', () => {
            input.click();
        });
        uploadControl.addEventListener('dragenter', onDragEnter);
        uploadControl.addEventListener('dragleave', onDragLeave);
        uploadControl.addEventListener('dragover', onDragOver);
        uploadControl.addEventListener('drop', onDrop);

        const pasteBtn = document.createElement('button');
        pasteBtn.type = 'button';
        pasteBtn.setAttribute(PASTE_BUTTON_ATTR, '1');
        pasteBtn.className = PASTE_BUTTON_CLASS;
        pasteBtn.textContent = 'Paste Image';
        pasteBtn.setAttribute('aria-label', 'Paste image from clipboard');
        pasteBtn.addEventListener('click', () => {
            this.pasteImageFromClipboardApi(input);
        });

        row.appendChild(uploadControl);
        row.appendChild(pasteBtn);
        label.parentNode.insertBefore(row, label);

        this.ensurePasteListener(state);

        if (!state.injectedLogged) {
            Logger.log('Request Revisions screenshot upload improvement: controls row injected');
            state.injectedLogged = true;
        }
    },

    removeDuplicateImprovementControls(zone, label) {
        if (!zone.contains(label)) return;

        const wraps = zone.querySelectorAll(`[${CONTROLS_WRAP_ATTR}]`);
        for (let i = 1; i < wraps.length; i++) {
            wraps[i].remove();
        }

        const primaryWrap = zone.querySelector(`[${CONTROLS_WRAP_ATTR}]`);
        if (primaryWrap) {
            zone.querySelectorAll(`button[${UPLOAD_CONTROL_ATTR}]`).forEach((btn) => {
                if (!primaryWrap.contains(btn)) btn.remove();
            });
            zone.querySelectorAll(`button[${PASTE_BUTTON_ATTR}]`).forEach((btn) => {
                if (!primaryWrap.contains(btn)) btn.remove();
            });
            return;
        }

        zone.querySelectorAll(`button[${UPLOAD_CONTROL_ATTR}]`).forEach((btn) => btn.remove());
        zone.querySelectorAll(`button[${PASTE_BUTTON_ATTR}]`).forEach((btn) => btn.remove());
    },

    async pasteImageFromClipboardApi(input) {
        if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
            Logger.warn(
                'Request Revisions screenshot upload improvement: Clipboard read API not available in this browser'
            );
            return;
        }
        try {
            const items = await navigator.clipboard.read();
            const files = [];
            for (const item of items) {
                for (const type of item.types) {
                    if (!type.startsWith('image/')) continue;
                    const blob = await item.getType(type);
                    const sub = type.split('/')[1] || 'png';
                    const safeExt = sub.replace(/[^a-z0-9]/gi, '') || 'png';
                    files.push(
                        new File([blob], `paste-${Date.now()}.${safeExt}`, {
                            type: blob.type || type
                        })
                    );
                    break;
                }
            }
            if (!files.length) {
                Logger.debug('Request Revisions screenshot upload improvement: clipboard had no image');
                return;
            }
            this.mergeIntoFileInput(input, files);
        } catch (err) {
            Logger.error('Request Revisions screenshot upload improvement: clipboard read failed', err);
        }
    },

    ensurePasteListener(state) {
        if (state.pasteListenerAttached) return;
        state.pasteListenerAttached = true;
        const pasteHandler = (ev) => {
            const files = imageFilesFromClipboard(ev.clipboardData);
            if (!files.length) return;
            if (shouldIgnorePasteTarget(ev.target)) return;
            const input = document.querySelector(`input[${FILE_INPUT_ATTR}]`);
            if (!input || !document.contains(input)) return;
            ev.preventDefault();
            ev.stopPropagation();
            this.mergeIntoFileInput(input, files);
        };
        CleanupRegistry.registerEventListener(document, 'paste', pasteHandler, true);
        Logger.debug(
            'Request Revisions screenshot upload improvement: document paste listener attached'
        );
    },

    findNativeScreenshotControl() {
        const dialogs = document.querySelectorAll('div[role="dialog"][data-state="open"]');
        for (const dialog of dialogs) {
            const heading = dialog.querySelector('h2');
            const headingText = (heading && heading.textContent ? heading.textContent : '').trim();
            if (!headingText.includes('Request Revisions')) continue;

            const labels = dialog.querySelectorAll('label');
            for (const label of labels) {
                const input = label.querySelector('input[type="file"][accept*="image"]');
                if (!input || !input.multiple) continue;
                const span = label.querySelector('span.text-sm');
                const text = ((span && span.textContent) || '').trim().replace(/\s+/g, ' ');
                if (text.includes('Add screenshots')) {
                    return { label, input };
                }
            }
        }
        return null;
    },

    ensureScreenshotStyles(state, pluginId) {
        if (state.screenshotStyleReady && document.getElementById(SCREENSHOT_STYLE_ID)) return;
        let style = document.getElementById(SCREENSHOT_STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = SCREENSHOT_STYLE_ID;
            style.setAttribute('data-fleet-plugin', pluginId);
            document.head.appendChild(style);
        }
        style.textContent = `
label[${NATIVE_LABEL_ATTR}] {
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
        state.screenshotStyleReady = true;
    },

    mergeIntoFileInput(input, newFiles) {
        const dt = new DataTransfer();
        const existing = Array.from(input.files || []);
        for (const file of existing) {
            if (dt.items.length >= MAX_FILES) break;
            dt.items.add(file);
        }
        for (const file of newFiles) {
            if (file.size > MAX_BYTES) {
                Logger.warn(
                    `Request Revisions screenshot upload improvement: skipped "${file.name}" (over ${MAX_BYTES / (1024 * 1024)}MB)`
                );
                continue;
            }
            if (dt.items.length >= MAX_FILES) {
                Logger.warn(
                    `Request Revisions screenshot upload improvement: max ${MAX_FILES} screenshots; extra file(s) ignored`
                );
                break;
            }
            dt.items.add(file);
        }
        const beforeLen = input.files ? input.files.length : 0;
        if (dt.files.length === beforeLen) return;
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        Logger.log(
            `Request Revisions screenshot upload improvement: merged paste/upload — ${input.files.length} file(s) on native input`
        );
    }
};

const plugin = {
    id: 'requestRevisionsLib',
    name: '"Request Revisions" Modal Improvements (library)',
    description:
        'Shared API for Request Revisions guidelines, copy actions, task-only issues, and screenshot upload',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.requestRevisions = {
            run: (s, options) => RequestRevisionsApi.run(s, options)
        };
        if (!state.registered) {
            Logger.log('module registered (Context.requestRevisions)');
            state.registered = true;
        }
    }
};
