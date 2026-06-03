// ============= submitted-prompt-scroll-resize.js =============
// Archetype: assessments-grade (work/assessments/grade).
// Replaces line-clamped submitted prompts with scrollable, vertically resizable boxes.

const STYLE_ID = 'fleet-assessments-grade-prompt-scroll-style';
const APPLIED_ATTR = 'data-fleet-grade-prompt-scroll';
const QUEUE_PATH = 'work/assessments/grade';
const INITIAL_HEIGHT = '6rem';
const MIN_HEIGHT = '4rem';

const plugin = {
    id: 'assessmentsGradeSubmittedPromptScroll',
    name: 'Submitted Prompt Scroll Resize',
    description:
        'Replaces line-clamped submitted prompts in the grading queue with scrollable, vertically resizable boxes',
    _version: '1.1',
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
                overflow-y: auto !important;
                resize: vertical;
                min-height: ${MIN_HEIGHT};
                height: ${INITIAL_HEIGHT};
                max-width: 34rem;
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

    applyScrollResize(box, paragraph) {
        this.clearLineClamp(paragraph);
        box.removeAttribute('title');
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
            this.applyScrollResize(box, paragraph);
            appliedThisPass += 1;
        }

        if (appliedThisPass === 0) {
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
                `${this.id}: refreshed ${appliedThisPass} prompt box(es) (total ${state.totalApplied})`
            );
        }
    }
};
