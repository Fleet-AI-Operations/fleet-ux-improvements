// ============= submitted-prompt-scroll-resize.js =============
// Archetype: assessments-grade (work/assessments/grade).
// Expands line-clamped submitted prompts so the full text is visible (no scroll or resize).

const STYLE_ID = 'fleet-assessments-grade-prompt-expand-style';
const APPLIED_ATTR = 'data-fleet-grade-prompt-expand';
const QUEUE_PATH = 'work/assessments/grade';

const plugin = {
    id: 'assessmentsGradeSubmittedPromptScroll',
    name: 'Submitted Prompt Full Text',
    description:
        'Expands submitted prompts in the grading queue so the full text is visible instead of line-clamped',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        stylesInjected: false,
        activationLogged: false,
        missingLogged: false,
        totalApplied: 0
    },

    isGradeQueuePage() {
        const path = (Context.currentPath || '').replace(/^\/+/, '');
        return path === QUEUE_PATH;
    },

    ensureStyles(state) {
        if (state.stylesInjected || document.getElementById(STYLE_ID)) {
            state.stylesInjected = true;
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            [${APPLIED_ATTR}] {
                overflow: visible !important;
                height: auto !important;
                max-height: none !important;
            }
            [${APPLIED_ATTR}] > p {
                display: block !important;
                overflow: visible !important;
                -webkit-box-orient: unset !important;
                -webkit-line-clamp: unset !important;
                line-clamp: unset !important;
            }
        `;
        document.head.appendChild(style);
        state.stylesInjected = true;
    },

    clearLineClamp(paragraph) {
        for (const className of [...paragraph.classList]) {
            if (className.startsWith('line-clamp-')) {
                paragraph.classList.remove(className);
            }
        }
        paragraph.style.display = 'block';
        paragraph.style.overflow = 'visible';
        paragraph.style.webkitBoxOrient = 'unset';
        paragraph.style.webkitLineClamp = 'unset';
    },

    findPromptBoxes() {
        const boxes = [];
        const paragraphs = document.querySelectorAll('table tbody td p.break-words');
        for (const paragraph of paragraphs) {
            const box = paragraph.closest('div.rounded-md.border');
            if (!box || box.querySelector(':scope > p') !== paragraph) {
                continue;
            }
            boxes.push({ box, paragraph });
        }
        return boxes;
    },

    needsApply(box, paragraph) {
        if (!box.hasAttribute(APPLIED_ATTR)) {
            return true;
        }
        for (const className of paragraph.classList) {
            if (className.startsWith('line-clamp-')) {
                return true;
            }
        }
        return false;
    },

    expandPromptBox(box, paragraph) {
        this.clearLineClamp(paragraph);
        box.removeAttribute('title');
        box.style.overflow = 'visible';
        box.style.height = 'auto';
        box.style.maxHeight = 'none';
        box.setAttribute(APPLIED_ATTR, '1');
    },

    onMutation(state) {
        if (!this.isGradeQueuePage()) {
            return;
        }

        this.ensureStyles(state);

        const promptBoxes = this.findPromptBoxes();
        if (!promptBoxes.length) {
            if (!state.missingLogged) {
                Logger.debug(`${this.id}: submitted prompt cells not found yet`);
                state.missingLogged = true;
            }
            return;
        }

        let appliedThisPass = 0;
        for (const { box, paragraph } of promptBoxes) {
            if (!this.needsApply(box, paragraph)) {
                continue;
            }
            this.expandPromptBox(box, paragraph);
            appliedThisPass += 1;
        }

        if (appliedThisPass === 0) {
            return;
        }

        state.missingLogged = false;
        state.totalApplied += appliedThisPass;

        if (!state.activationLogged) {
            Logger.info(
                `${this.id}: full prompt text active for ${appliedThisPass} submitted prompt(s)`
            );
            state.activationLogged = true;
        } else {
            Logger.debug(
                `${this.id}: expanded ${appliedThisPass} prompt box(es) (total ${state.totalApplied})`
            );
        }
    }
};
