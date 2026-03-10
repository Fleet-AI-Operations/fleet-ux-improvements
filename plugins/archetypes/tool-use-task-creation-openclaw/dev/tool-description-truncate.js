// ============= tool-description-truncate.js =============
// CSS-only: limits tool picker descriptions when collapsed; full when expanded.
// Injects a style block; no DOM changes to the tool list (keeps React in sync).
//
// Important: expanded tool-item contains a button (summary row) plus sibling blocks
// (e.g. div.pl-8 with Parameters). Parameter help uses p.text-xs.text-muted-foreground.
// The summary line is only inside the button: p.text-[11px].text-muted-foreground.font-normal.whitespace-normal.
// A broad [data-ui="tool-item"] p.text-muted-foreground selector also matched expanded
// paragraphs, so truncation/hide applied there too. Scope to > button and the header
// class combo so expanded descriptions wrap/expand normally.

const STYLE_ID = 'fleet-style-tool-description-truncate';

function getStyleContent(hideWhenCollapsed) {
    // Header description only: inside the row button, matches task-creation + tool-panel HTML.
    const selectorDataUi =
        '[data-ui="tools-list"] [data-ui="tool-item"] > button p.text-muted-foreground.font-normal.whitespace-normal';
    // Legacy: same scoping — tool-item wrapper may be div.w-full.space-y-3 without data-ui on parent
    const selectorLegacy =
        'div.w-full.space-y-3[data-ui="tool-item"] > button p.text-muted-foreground.font-normal.whitespace-normal, ' +
        'div.p-2.space-y-1 div.w-full.space-y-3 > button.group\\/tool p.text-muted-foreground.font-normal.whitespace-normal';
    const selectors = selectorDataUi + ', ' + selectorLegacy;
    const rule = hideWhenCollapsed
        ? `${selectors}{display:none !important;}`
        : `${selectors}{max-width:100ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`;
    return rule;
}

const plugin = {
    id: 'toolDescriptionTruncate',
    name: 'Tool Description Truncation',
    description: 'Limits the length tool descriptions to make the tool picker more manageable',
    _version: '2.1',
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
