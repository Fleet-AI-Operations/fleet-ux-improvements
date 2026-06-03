// ============= submitted-prompt-scroll-resize.js =============
// Archetype: assessments-grade (work/assessments/grade).
// Replaces line-clamped submitted prompts with scrollable, vertically resizable boxes.

const APPLIED_ATTR = 'data-fleet-grade-prompt-scroll';
const PROMPT_HEADER = 'Submitted prompt';
const INITIAL_HEIGHT = '6rem';
const MIN_HEIGHT = '4rem';

const plugin = {
    id: 'assessmentsGradeSubmittedPromptScroll',
    name: 'Submitted Prompt Scroll Resize',
    description:
        'Replaces line-clamped submitted prompts in the grading queue with scrollable, vertically resizable boxes',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        activationLogged: false,
        missingLogged: false,
        totalApplied: 0
    },

    findSubmittedPromptColumnIndex(table) {
        const headers = table.querySelectorAll('thead th');
        for (let i = 0; i < headers.length; i += 1) {
            if ((headers[i].textContent || '').trim() === PROMPT_HEADER) {
                return i;
            }
        }
        return -1;
    },

    findPromptParagraph(box) {
        for (const el of box.querySelectorAll('p')) {
            if (el.classList.contains('break-words')) {
                return el;
            }
        }
        return box.querySelector('p');
    },

    applyScrollResize(box, paragraph) {
        paragraph.classList.remove('line-clamp-4');
        box.removeAttribute('title');

        box.style.overflowY = 'auto';
        box.style.resize = 'vertical';
        box.style.minHeight = MIN_HEIGHT;
        box.style.height = box.style.height || INITIAL_HEIGHT;
        box.style.maxWidth = box.style.maxWidth || '34rem';

        box.setAttribute(APPLIED_ATTR, '1');
    },

    onMutation(state) {
        const tables = Context.dom.queryAll('table', { context: `${this.id}.tables` });
        if (!tables.length) {
            if (!state.missingLogged) {
                Logger.debug(`${this.id}: grading queue table not found yet`);
                state.missingLogged = true;
            }
            return;
        }

        let appliedThisPass = 0;

        for (const table of tables) {
            const columnIndex = this.findSubmittedPromptColumnIndex(table);
            if (columnIndex < 0) {
                continue;
            }

            const rows = table.querySelectorAll('tbody tr');
            for (const row of rows) {
                const cells = row.querySelectorAll('td');
                const cell = cells[columnIndex];
                if (!cell) {
                    continue;
                }

                const box = cell.querySelector('div.rounded-md.border');
                if (!box || box.hasAttribute(APPLIED_ATTR)) {
                    continue;
                }

                const paragraph = this.findPromptParagraph(box);
                if (!paragraph) {
                    continue;
                }

                this.applyScrollResize(box, paragraph);
                appliedThisPass += 1;
            }
        }

        if (appliedThisPass === 0) {
            if (state.totalApplied === 0 && !state.missingLogged) {
                Logger.debug(`${this.id}: no submitted prompt cells found yet`);
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        state.totalApplied += appliedThisPass;

        if (!state.activationLogged) {
            Logger.info(
                `${this.id}: scrollable resize boxes active for ${appliedThisPass} submitted prompt(s)`
            );
            state.activationLogged = true;
        } else {
            Logger.debug(
                `${this.id}: applied scroll resize to ${appliedThisPass} prompt box(es) (total ${state.totalApplied})`
            );
        }
    }
};
