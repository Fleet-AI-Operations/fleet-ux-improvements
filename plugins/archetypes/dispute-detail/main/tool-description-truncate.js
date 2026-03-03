// ============= tool-description-truncate.js =============

const STYLE_ID = 'fleet-style-dispute-tool-description-truncate';

function getStyleContent(hideWhenCollapsed) {
    const selector =
        'div.w-full.space-y-3 > button.group\\/tool:only-child p.text-muted-foreground.font-normal.whitespace-normal';
    const rule = hideWhenCollapsed
        ? `${selector}{display:none !important;}`
        : `${selector}{max-width:100ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`;
    return rule;
}

const plugin = {
    id: 'disputeDetailToolDescriptionTruncate',
    name: 'Tool Description Truncation',
    description: 'Limits the length tool descriptions to make the tool picker more manageable',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { envWaitingLogged: false },

    onMutation(state) {
        if (!this.isToolEnvReady()) {
            if (!state.envWaitingLogged) {
                Logger.debug('Tool-description-truncate: waiting for tool environment');
                state.envWaitingLogged = true;
            }
            return;
        }
        state.envWaitingLogged = false;

        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            style.setAttribute('data-fleet-plugin', this.id);
            document.head.appendChild(style);
            Logger.log('Tool description truncate styles injected');
        }
        const hideWhenCollapsed = Storage.getSubOptionEnabled(
            this.id,
            'hide-description-when-collapsed',
            false
        );
        const css = getStyleContent(hideWhenCollapsed);
        if (style.textContent !== css) {
            style.textContent = css;
        }
    },

    subOptions: [
        {
            id: 'hide-description-when-collapsed',
            name: 'Hide description when collapsed',
            description:
                'When enabled, hide the tool description entirely in the list when the tool is collapsed.',
            enabledByDefault: false
        }
    ],

    isToolEnvReady() {
        return document.documentElement.getAttribute('data-fleet-dispute-tool-env-ready') === '1';
    }
};
