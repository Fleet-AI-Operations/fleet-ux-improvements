// ============= user-story-markdown.js =============
// Shared Context.userStoryMarkdown library wrapper for the Scenario / User Story
// collapsible on the dispute detail page, plus a copy control next to the section
// header that copies the whole story with H1 sub-headers and --- separators.

const SECTION_HEADER_TEXT = 'Scenario / User Story';
const SCENARIO_LABEL_TEXT = 'Scenario';
const USER_STORY_LABEL_TEXT = 'User Story';
const ANNOTATOR_LABEL_TEXT = 'Annotator Instructions';
const COPY_BTN_ATTR = 'data-fleet-dispute-detail-user-story-copy';
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
        'Markdown-rendered Scenario / User Story collapsible and full-story copy control on dispute detail',
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
        this._ensureCopyControl(state);
    },

    _normalizeText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    },

    _findCollapsibleRoot() {
        const buttons = document.querySelectorAll('button[data-slot="button"]');
        for (const btn of buttons) {
            const span = btn.querySelector('span.text-sm.font-medium');
            if (!span) continue;
            if (this._normalizeText(span.textContent) !== SECTION_HEADER_TEXT) continue;
            const controlsId = btn.getAttribute('aria-controls');
            if (!controlsId) continue;
            const panel = document.getElementById(controlsId);
            if (!panel) continue;
            return { toggleBtn: btn, headerSpan: span, panel };
        }
        return null;
    },

    _findSectionLabel(root, labelText) {
        if (!root) return null;
        const labels = root.querySelectorAll(
            'div.text-sm.text-muted-foreground.font-medium, div.font-medium.text-sm.text-muted-foreground'
        );
        for (const label of labels) {
            if (this._normalizeText(label.textContent) === labelText) return label;
        }
        return null;
    },

    /**
     * Record the story blockquote's rendered width before the library hides it,
     * so the markdown replica can be capped to the same width.
     */
    _captureBodyWidth(label) {
        if (!label) return;
        const body = label.nextElementSibling;
        if (!body || body.getAttribute('data-fleet-user-story-original') === 'true') return;
        if (body.dataset.fleetOriginalWidth) return;
        const width = body.getBoundingClientRect().width;
        if (width > 50) body.dataset.fleetOriginalWidth = String(Math.round(width));
    },

    _captureOriginalStoryWidth() {
        const root = this._findCollapsibleRoot();
        if (!root) return;
        this._captureBodyWidth(this._findSectionLabel(root.panel, USER_STORY_LABEL_TEXT));
        this._captureBodyWidth(this._findSectionLabel(root.panel, ANNOTATOR_LABEL_TEXT));
    },

    _applyReplicaMaxWidth() {
        const root = this._findCollapsibleRoot();
        if (!root) return;
        const originals = root.panel.querySelectorAll(
            '[data-fleet-user-story-original="true"][data-fleet-original-width]'
        );
        for (const original of originals) {
            const replica = original.nextElementSibling;
            if (!replica || replica.getAttribute('data-fleet-user-story-replica') !== 'true') continue;
            const maxWidth = original.dataset.fleetOriginalWidth + 'px';
            if (replica.style.maxWidth !== maxWidth) replica.style.maxWidth = maxWidth;
        }
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

    _buildCopyText(panel) {
        const blocks = [];
        const fieldDefs = [
            { label: SCENARIO_LABEL_TEXT },
            { label: USER_STORY_LABEL_TEXT },
            { label: ANNOTATOR_LABEL_TEXT }
        ];
        for (const { label } of fieldDefs) {
            const el = this._findSectionLabel(panel, label);
            const value = this._sectionBodyText(el);
            if (value) blocks.push('# ' + label + '\n' + value);
        }
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

    _ensureCopyControl(state) {
        const root = this._findCollapsibleRoot();
        if (!root) {
            state.copyButtonLogged = false;
            return;
        }
        if (root.toggleBtn.querySelector('[' + COPY_BTN_ATTR + '="1"]')) return;

        // Nested <button> inside the collapsible toggle is invalid HTML and would
        // also toggle the panel — use a span[role="button"] with stopPropagation.
        const copyBtn = document.createElement('span');
        copyBtn.setAttribute('role', 'button');
        copyBtn.tabIndex = 0;
        copyBtn.className = COPY_BTN_CLASS;
        copyBtn.setAttribute(COPY_BTN_ATTR, '1');
        copyBtn.setAttribute('data-fleet-plugin', this.id);
        copyBtn.title = 'Copy scenario, user story, and annotator instructions';
        copyBtn.setAttribute('aria-label', 'Copy scenario, user story, and annotator instructions');
        copyBtn.innerHTML = COPY_ICON_SVG;

        const doCopy = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const text = this._buildCopyText(root.panel);
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
        };

        copyBtn.addEventListener('click', (event) => {
            void doCopy(event);
        });
        copyBtn.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            void doCopy(event);
        });

        // Insert after the "Scenario / User Story" title span inside the toggle button.
        root.headerSpan.insertAdjacentElement('afterend', copyBtn);

        if (!state.copyButtonLogged) {
            Logger.log(this.id + ': copy control injected in Scenario / User Story header');
            state.copyButtonLogged = true;
        }
    }
};
