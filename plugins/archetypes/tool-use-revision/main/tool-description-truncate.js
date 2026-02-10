// ============= tool-description-truncate.js =============
// CSS-only: limits tool picker descriptions when collapsed; full when expanded.
// Injects a style block; no DOM changes to the tool list (keeps React in sync).

const STYLE_ID = 'fleet-style-tool-description-truncate';

function getStyleContent(hideWhenCollapsed) {
    const selector =
        'div.w-full.space-y-3 > button.group\\/tool:only-child p.text-muted-foreground.font-normal.whitespace-normal';
    const rule = hideWhenCollapsed
        ? `${selector}{display:none !important;}`
        : `${selector}{max-width:100ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`;
    return rule;
}

const plugin = {
    id: 'toolDescriptionTruncate',
    name: 'Tool description truncation',
    description: 'Limit tool picker descriptions when collapsed; show full when expanded.',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {},

    init(state, context) {
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
        style.textContent = getStyleContent(hideWhenCollapsed);
    },

    onMutation(state, context) {
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
                'When enabled, hide the tool description entirely in the list when the tool is collapsed (full description still shown when expanded).',
            enabledByDefault: false
        }
    ]
};
