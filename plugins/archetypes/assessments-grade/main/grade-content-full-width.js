// ============= grade-content-full-width.js =============
// Archetype: assessments-grade (Grade Assessments at work/assessments/grade).
// Removes max-w-6xl from the main content wrapper so the grading UI can use full width.

const MAX_WIDTH_CLASS = 'max-w-6xl';
const WRAPPER_CLASSES = ['mx-auto', 'px-6', 'py-12'];

const plugin = {
    id: 'assessmentsGradeContentFullWidth',
    name: 'Grade Assessments Full Width',
    description:
        'Removes the max-w-6xl cap from grade assessments content containers (mx-auto px-6 py-12 wrappers)',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        activationLogged: false,
        totalStripped: 0
    },

    isContentWrapper(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE || el.tagName !== 'DIV') {
            return false;
        }
        const cl = el.classList;
        if (!cl.contains(MAX_WIDTH_CLASS)) {
            return false;
        }
        return WRAPPER_CLASSES.every((name) => cl.contains(name));
    },

    stripMaxWidth(state) {
        const candidates = document.querySelectorAll(
            `div.${WRAPPER_CLASSES[0]}.${MAX_WIDTH_CLASS}.${WRAPPER_CLASSES[1]}.${WRAPPER_CLASSES[2]}`
        );
        let strippedThisPass = 0;
        for (const el of candidates) {
            if (!this.isContentWrapper(el)) {
                continue;
            }
            el.classList.remove(MAX_WIDTH_CLASS);
            strippedThisPass += 1;
        }
        if (strippedThisPass === 0) {
            return;
        }
        state.totalStripped += strippedThisPass;
        if (!state.activationLogged) {
            Logger.info(
                `${this.id}: removed ${MAX_WIDTH_CLASS} from grade content wrapper(s) — full width active`
            );
            state.activationLogged = true;
        } else {
            Logger.debug(
                `${this.id}: removed ${MAX_WIDTH_CLASS} from ${strippedThisPass} wrapper(s) (total ${state.totalStripped})`
            );
        }
    },

    onMutation(state) {
        this.stripMaxWidth(state);
    }
};
