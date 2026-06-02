// ============= clipboard-event-relative-times.js =============
// Archetype: assessments-grade-detail (work/assessments/grade/*).
// Rewrites clipboard integrity event offsets (+Ns) as elapsed time (at Xm, Ys) with deltas.

const EVENT_LINE_RE =
    /^(paste|copy|cut) on (#\d+) · (\d+) chars · \+(\d+)s$/;
const plugin = {
    id: 'assessmentsGradeClipboardEventTimes',
    name: 'Grade Clipboard Event Times',
    description:
        'Shows clipboard integrity event offsets as at Xm, Ys with delta from the previous event',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        activationLogged: false,
        totalFormatted: 0
    },

    formatDuration(totalSeconds) {
        const sec = Math.max(0, Math.floor(Number(totalSeconds)) || 0);
        const minutes = Math.floor(sec / 60);
        const seconds = sec % 60;
        if (minutes === 0) {
            return `${seconds}s`;
        }
        return `${minutes}m, ${seconds}s`;
    },

    buildTimeSuffix(totalSeconds, previousSeconds) {
        const atPart = `at ${this.formatDuration(totalSeconds)}`;
        if (previousSeconds == null) {
            return atPart;
        }
        const delta = Math.max(0, totalSeconds - previousSeconds);
        return `${atPart} (${this.formatDuration(delta)} since last clipboard event)`;
    },

    isEventSummaryLine(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE || el.tagName !== 'DIV') {
            return false;
        }
        if (el.children.length > 0) {
            return false;
        }
        const text = (el.textContent || '').trim();
        return EVENT_LINE_RE.test(text);
    },

    formatEventLines(state) {
        const lines = Array.from(document.querySelectorAll('div')).filter((el) =>
            this.isEventSummaryLine(el)
        );
        if (lines.length === 0) {
            return 0;
        }

        let formattedThisPass = 0;
        let previousSeconds = null;

        for (const el of lines) {
            const text = (el.textContent || '').trim();
            const match = text.match(EVENT_LINE_RE);
            if (!match) {
                continue;
            }

            const [, kind, question, charCount, offsetStr] = match;
            const totalSeconds = parseInt(offsetStr, 10);
            const suffix = this.buildTimeSuffix(totalSeconds, previousSeconds);
            const nextText = `${kind} on ${question} · ${charCount} chars · ${suffix}`;

            if (el.textContent !== nextText) {
                el.textContent = nextText;
                formattedThisPass += 1;
            }
            previousSeconds = totalSeconds;
        }

        if (formattedThisPass > 0) {
            state.totalFormatted += formattedThisPass;
            if (!state.activationLogged) {
                Logger.info(
                    `${this.id}: formatted ${formattedThisPass} clipboard event line(s) — relative times active`
                );
                state.activationLogged = true;
            } else {
                Logger.debug(
                    `${this.id}: formatted ${formattedThisPass} clipboard event line(s) (total ${state.totalFormatted})`
                );
            }
        }

        return formattedThisPass;
    },

    onMutation(state) {
        this.formatEventLines(state);
    }
};
