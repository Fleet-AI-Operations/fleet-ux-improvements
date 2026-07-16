// ============= user-story-markdown.js =============
// Shared Context.userStoryMarkdown library wrapper for the Task Scenario modal on the
// disputes list page, plus a copy button next to the Task Scenario title that copies
// the whole story with H1 sub-headers and --- separators (same format as task detail).

const MODAL_TITLE_TEXT = 'Task Scenario';
const SCENARIO_LABEL_TEXT = 'Scenario';
const USER_STORY_LABEL_TEXT = 'User Story';
const COPY_BTN_ATTR = 'data-fleet-dispute-user-story-copy';
const COPY_BTN_CLASS =
    'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground h-7 text-xs pl-2 pr-2 py-1 gap-1.5';
const COPY_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">' +
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>' +
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>' +
    '</svg>';

const plugin = {
    id: 'userStoryMarkdown',
    name: 'User Story Markdown',
    description:
        'Markdown-rendered User Story replica and full-story copy button in the Task Scenario modal',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        activationLogged: false,
        missingLogged: false,
        activeByBody: null,
        copyButtonLogged: false
    },

    onMutation(state) {
        const api = Context.userStoryMarkdown;
        if (!api || typeof api.run !== 'function') return;
        this._captureOriginalStoryWidth();
        api.run(state, {
            pluginId: this.id,
            logTag: this.id
        });
        this._applyReplicaMaxWidth();
        this._ensureModalCopyButton(state);
    },

    /**
     * Record the story blockquote's rendered width before the library hides it,
     * so the markdown replica can be capped to the same width (long markdown
     * paragraphs would otherwise stretch the dialog to its viewport max-width).
     */
    _captureOriginalStoryWidth() {
        const dialog = this._findTaskScenarioDialog();
        if (!dialog) return;
        const storyLabel = this._findSectionLabel(dialog, USER_STORY_LABEL_TEXT);
        if (!storyLabel) return;
        const body = storyLabel.nextElementSibling;
        if (!body || body.getAttribute('data-fleet-user-story-original') === 'true') return;
        if (body.dataset.fleetOriginalWidth) return;
        const width = body.getBoundingClientRect().width;
        if (width > 50) body.dataset.fleetOriginalWidth = String(Math.round(width));
    },

    _applyReplicaMaxWidth() {
        const dialog = this._findTaskScenarioDialog();
        if (!dialog) return;
        const original = dialog.querySelector('[data-fleet-user-story-original="true"][data-fleet-original-width]');
        if (!original) return;
        const replica = original.nextElementSibling;
        if (!replica || replica.getAttribute('data-fleet-user-story-replica') !== 'true') return;
        const maxWidth = original.dataset.fleetOriginalWidth + 'px';
        if (replica.style.maxWidth !== maxWidth) replica.style.maxWidth = maxWidth;
    },

    _normalizeText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    },

    _findTaskScenarioDialog() {
        const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
        for (const dialog of dialogs) {
            const heading = dialog.querySelector('h2');
            if (heading && this._normalizeText(heading.textContent) === MODAL_TITLE_TEXT) {
                return dialog;
            }
        }
        return null;
    },

    _findSectionLabel(dialog, labelText) {
        const labels = dialog.querySelectorAll(
            'div.text-sm.text-muted-foreground.font-medium, div.font-medium.text-sm.text-muted-foreground'
        );
        for (const label of labels) {
            if (this._normalizeText(label.textContent) === labelText) return label;
        }
        return null;
    },

    _sectionBodyText(label) {
        if (!label) return '';
        let sibling = label.nextElementSibling;
        while (sibling) {
            if (sibling.getAttribute && sibling.getAttribute('data-fleet-user-story-replica') === 'true') {
                sibling = sibling.nextElementSibling;
                continue;
            }
            return (sibling.textContent || '').trim();
        }
        return '';
    },

    _buildCopyText(dialog) {
        const blocks = [];
        const scenarioLabel = this._findSectionLabel(dialog, SCENARIO_LABEL_TEXT);
        const storyLabel = this._findSectionLabel(dialog, USER_STORY_LABEL_TEXT);
        const scenario = this._sectionBodyText(scenarioLabel);
        const story = this._sectionBodyText(storyLabel);
        if (scenario) blocks.push('# ' + SCENARIO_LABEL_TEXT + '\n' + scenario);
        if (story) blocks.push('# ' + USER_STORY_LABEL_TEXT + '\n' + story);
        return blocks.join('\n\n---\n\n');
    },

    async _copyTextToClipboard(text) {
        if (!text) return false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (_e) { /* fall through */ }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (_e2) {
            return false;
        }
    },

    _ensureModalCopyButton(state) {
        const dialog = this._findTaskScenarioDialog();
        if (!dialog) {
            state.copyButtonLogged = false;
            return;
        }
        if (dialog.querySelector('[' + COPY_BTN_ATTR + '="1"]')) return;

        const heading = dialog.querySelector('h2');
        if (!heading) return;

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = COPY_BTN_CLASS;
        copyBtn.setAttribute(COPY_BTN_ATTR, '1');
        copyBtn.setAttribute('data-fleet-plugin', this.id);
        copyBtn.title = 'Copy scenario and user story';
        copyBtn.setAttribute('aria-label', 'Copy scenario and user story');
        copyBtn.innerHTML = COPY_ICON_SVG;

        copyBtn.addEventListener('click', async () => {
            const text = this._buildCopyText(dialog);
            const ok = await this._copyTextToClipboard(text);
            if (ok) {
                if (Context.buttonFeedback) {
                    Context.buttonFeedback.flashSuccess(copyBtn, { restoreStyles: false });
                }
                Logger.log(this.id + ': copied scenario story (' + text.length + ' chars)');
            } else {
                if (Context.buttonFeedback) {
                    Context.buttonFeedback.flashFailure(copyBtn, { restoreStyles: false });
                }
                Logger.warn(this.id + ': scenario story copy failed');
            }
        });

        // h2 title row already uses flex items-center gap-2
        heading.appendChild(copyBtn);

        if (!state.copyButtonLogged) {
            Logger.log(this.id + ': copy button injected in Task Scenario modal');
            state.copyButtonLogged = true;
        }
    }
};
