// ============= request-revisions-task-only.js =============
// On Request Revisions modal: hide Environment/Grading issue buttons via CSS tags,
// and auto-select Task once per modal open.

const STYLE_ID = 'fleet-request-revisions-task-only-style';
const DIALOG_ATTR = 'data-fleet-rr-task-only';
const HIDDEN_ATTR = 'data-fleet-rr-issue-hidden';

const RequestRevisionsTaskOnlyApi = {
    id: 'requestRevisionsTaskOnly',
    name: 'Request Revisions Task-Only Issues',
    description:
        'Hides Environment and Grading issue buttons on Request Revisions and auto-selects Task',

    run(state, options) {
        const pluginId = (options && options.pluginId) || this.id;
        const logTag = (options && options.logTag) || pluginId;
        this.ensureStyles(state, pluginId);

        const modal = this.findRequestRevisionsModal();
        if (!modal) {
            if (state.activationLogged) {
                Logger.debug(`${logTag}: Request Revisions modal closed — reset`);
                state.activationLogged = false;
            }
            state.missingLogged = false;
            state.warnLogged = false;
            return;
        }

        if (modal.getAttribute(DIALOG_ATTR) === '1') return;

        const buttonRow = this.findWhereAreTheIssuesButtonRow(modal);
        if (!buttonRow) {
            if (!state.warnLogged) {
                Logger.warn(`${logTag}: Request Revisions modal open but "Where are the issues?" button row missing`);
                state.warnLogged = true;
            }
            return;
        }
        state.warnLogged = false;

        let hidEnvironment = false;
        let hidGrading = false;
        let clickedTask = false;
        let taskAlreadySelected = false;

        const buttons = buttonRow.querySelectorAll('button[type="button"]');
        for (const btn of buttons) {
            const label = this.getIssueButtonLabel(btn);
            if (label === 'Environment' || label === 'Grading') {
                btn.setAttribute(HIDDEN_ATTR, '1');
                if (label === 'Environment') hidEnvironment = true;
                if (label === 'Grading') hidGrading = true;
            } else if (label === 'Task') {
                if (this.isIssueButtonSelected(btn)) {
                    taskAlreadySelected = true;
                } else {
                    btn.click();
                    clickedTask = true;
                }
            }
        }

        modal.setAttribute(DIALOG_ATTR, '1');

        const hidParts = [];
        if (hidEnvironment) hidParts.push('Environment');
        if (hidGrading) hidParts.push('Grading');
        const hidSummary = hidParts.length ? `hid ${hidParts.join('+')}` : 'no issue buttons to hide';
        const taskSummary = clickedTask
            ? 'auto-selected Task'
            : taskAlreadySelected
              ? 'Task already selected'
              : 'Task button not found';
        Logger.log(`${logTag}: ${hidSummary}, ${taskSummary}`);
        state.activationLogged = true;
        state.missingLogged = false;
    },

    ensureStyles(state, pluginId) {
        if (state.styleReady && document.getElementById(STYLE_ID)) return;
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            style.setAttribute('data-fleet-plugin', pluginId || this.id);
            document.head.appendChild(style);
        }
        style.textContent = `
button[${HIDDEN_ATTR}="1"] {
    display: none !important;
}
`;
        state.styleReady = true;
    },

    findRequestRevisionsModal() {
        const dialogs = document.querySelectorAll('div[role="dialog"][data-state="open"]');
        for (const dialog of dialogs) {
            const heading = dialog.querySelector('h2');
            if (!heading || !heading.textContent || !heading.textContent.includes('Request Revisions')) {
                continue;
            }
            const hasFeedbackId = dialog.querySelector(
                '#feedback-Task, #feedback-Environment, [id^="feedback-"]'
            );
            if (hasFeedbackId) return dialog;
        }
        for (const dialog of dialogs) {
            const heading = dialog.querySelector('h2');
            if (heading && heading.textContent && heading.textContent.includes('Request Revisions')) {
                return dialog;
            }
        }
        return null;
    },

    findWhereAreTheIssuesButtonRow(modal) {
        const labels = modal.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-3');
        for (const label of labels) {
            if (label.textContent && label.textContent.includes('Where are the issues')) {
                const buttonRow = label.nextElementSibling;
                if (
                    buttonRow &&
                    buttonRow.classList.contains('flex') &&
                    buttonRow.classList.contains('gap-3')
                ) {
                    return buttonRow;
                }
                return null;
            }
        }
        return null;
    },

    getIssueButtonLabel(btn) {
        const span = btn.querySelector('span.text-sm.font-medium');
        const text = span && span.textContent ? span.textContent : btn.textContent || '';
        return text.trim();
    },

    isIssueButtonSelected(btn) {
        return btn.classList.contains('border-brand');
    }
};

const plugin = {
    id: 'requestRevisionsTaskOnlyLib',
    name: 'Request Revisions Task-Only Issues (library)',
    description:
        'Shared API to hide Environment/Grading and auto-select Task on Request Revisions',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.requestRevisionsTaskOnly = {
            run: (s, options) => RequestRevisionsTaskOnlyApi.run(s, options)
        };
        if (!state.registered) {
            Logger.log(
                'requestRevisionsTaskOnlyLib: module registered (Context.requestRevisionsTaskOnly)'
            );
            state.registered = true;
        }
    }
};
