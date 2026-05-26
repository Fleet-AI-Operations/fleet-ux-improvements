// expert-feedback-tooltip.js
// Expert profile feedback hover tooltip: body text uses text-foreground on a primary
// background, which can render as white-on-white. Match the "Recent Feedback:" heading color.

const PLUGIN_ID = 'expert-feedback-tooltip';
const STYLE_ID = 'fleet-expert-feedback-tooltip-fix';
const FEEDBACK_FIXED_ATTR = 'data-fleet-expert-feedback-text-fixed';
const RECENT_FEEDBACK_LABEL = 'Recent Feedback:';

const plugin = {
    id: PLUGIN_ID,
    name: 'Expert Feedback Tooltip Fix',
    description:
        'Fixes Recent Feedback tooltip body text color on expert profile pages so it matches the heading',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        stylesInjected: false,
        activationLogged: false,
        fixedCount: 0
    },

    onMutation(state) {
        if (!state.stylesInjected) {
            this._injectFeedbackTooltipStyles();
            state.stylesInjected = true;
        }

        const fixedNow = this._fixFeedbackTooltipText();
        if (fixedNow > 0) {
            state.fixedCount += fixedNow;
            if (!state.activationLogged) {
                Logger.log(PLUGIN_ID + ': fixing Recent Feedback tooltip text color');
                state.activationLogged = true;
            }
            Logger.debug(PLUGIN_ID + ': fixed ' + fixedNow + ' feedback paragraph(s)');
        }
    },

    _injectFeedbackTooltipStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.setAttribute('data-fleet-plugin', PLUGIN_ID);
        style.textContent =
            '.bg-primary.text-primary-foreground p.text-foreground.whitespace-pre-line {' +
            'color: inherit;' +
            '}';
        document.head.appendChild(style);
        Logger.debug(PLUGIN_ID + ': injected tooltip text color stylesheet');
    },

    _fixFeedbackTooltipText() {
        let count = 0;
        document.querySelectorAll('p.font-medium').forEach((heading) => {
            if ((heading.textContent || '').trim() !== RECENT_FEEDBACK_LABEL) return;

            const root = heading.closest('.space-y-2') || heading.parentElement;
            if (!root) return;

            root.querySelectorAll('p.text-foreground.whitespace-pre-line').forEach((paragraph) => {
                if (paragraph.getAttribute(FEEDBACK_FIXED_ATTR) === '1') return;
                paragraph.classList.remove('text-foreground');
                paragraph.setAttribute(FEEDBACK_FIXED_ATTR, '1');
                count += 1;
            });
        });
        return count;
    }
};
