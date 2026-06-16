// expert-feedback-tooltip.js
// Expert profile feedback hover tooltip: body text uses text-foreground on a primary
// background, which can render as white-on-white. Match the "Recent Feedback:" heading color
// and make long feedback content scrollable inside the popup.

const PLUGIN_ID = 'expert-feedback-tooltip';
const STYLE_ID = 'fleet-expert-feedback-tooltip-fix';
const FEEDBACK_FIXED_ATTR = 'data-fleet-expert-feedback-text-fixed';
const SCROLL_FIXED_ATTR = 'data-fleet-expert-feedback-scroll-fixed';
const RECENT_FEEDBACK_LABEL = 'Recent Feedback:';
const FEEDBACK_SCROLL_MAX_HEIGHT = 'min(70vh, var(--radix-tooltip-content-available-height, 70vh))';

const plugin = {
    id: PLUGIN_ID,
    name: 'Expert Feedback Tooltip Fix',
    description:
        'Fixes Recent Feedback tooltip text color and enables scrolling for long feedback on expert profile pages',
    _version: '1.2',
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

        const roots = this._findRecentFeedbackRoots();
        const sig = roots.length;
        if (sig === state.lastSig) return;
        state.lastSig = sig;

        const fixedNow = this._fixFeedbackTooltips();
        if (fixedNow > 0) {
            state.fixedCount += fixedNow;
            if (!state.activationLogged) {
                Logger.log(PLUGIN_ID + ': enhancing Recent Feedback tooltip');
                state.activationLogged = true;
            }
            Logger.debug(PLUGIN_ID + ': updated ' + fixedNow + ' feedback tooltip(s)');
        }
    },

    _findRecentFeedbackRoots() {
        const roots = [];
        document.querySelectorAll('p.font-medium').forEach((heading) => {
            if ((heading.textContent || '').trim() !== RECENT_FEEDBACK_LABEL) return;
            const root = heading.closest('.space-y-2') || heading.parentElement;
            if (root) roots.push(root);
        });
        return roots;
    },

    _findRecentFeedbackContainer(root) {
        return root.closest('.bg-primary.text-primary-foreground');
    },

    _injectFeedbackTooltipStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.setAttribute('data-fleet-plugin', PLUGIN_ID);
        style.textContent =
            '.bg-primary.text-primary-foreground p.text-foreground.whitespace-pre-line {' +
            'color: inherit;' +
            '}' +
            '.bg-primary.text-primary-foreground[' + SCROLL_FIXED_ATTR + '="1"] {' +
            'max-height: ' + FEEDBACK_SCROLL_MAX_HEIGHT + ';' +
            'overflow-x: hidden;' +
            'overflow-y: auto;' +
            'overscroll-behavior: contain;' +
            '-webkit-overflow-scrolling: touch;' +
            '}';
        document.head.appendChild(style);
        Logger.debug(PLUGIN_ID + ': injected tooltip text color stylesheet');
    },

    _fixFeedbackTooltips() {
        let count = 0;
        this._findRecentFeedbackRoots().forEach((root) => {
            const paragraphsFixed = this._fixFeedbackTooltipText(root);
            const scrollFixed = this._fixFeedbackTooltipScroll(root);
            if (paragraphsFixed > 0 || scrollFixed) count += 1;
        });
        return count;
    },

    _fixFeedbackTooltipText(root) {
        let count = 0;
        root.querySelectorAll('p.text-foreground.whitespace-pre-line').forEach((paragraph) => {
            if (paragraph.getAttribute(FEEDBACK_FIXED_ATTR) === '1') return;
            paragraph.classList.remove('text-foreground');
            paragraph.setAttribute(FEEDBACK_FIXED_ATTR, '1');
            count += 1;
        });
        return count;
    },

    _fixFeedbackTooltipScroll(root) {
        const container = this._findRecentFeedbackContainer(root);
        if (!container || container.getAttribute(SCROLL_FIXED_ATTR) === '1') return false;

        container.classList.remove('overflow-hidden');
        container.setAttribute(SCROLL_FIXED_ATTR, '1');
        return true;
    }
};
