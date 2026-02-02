
// ============= toggle-tool-parameters.js =============
const plugin = {
    id: 'toggleToolParameters',
    name: 'Toggle Tool Parameters',
    description: 'Adds a toggle to each tool header to hide/show its parameters section',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { panelId: null, missingLogged: false },

    selectors: {
        toolHeader: 'div.flex.items-center.gap-3.p-3.cursor-pointer.hover\\:bg-muted\\/30'
    },

    onMutation(state, context) {
        const panel = this.findWorkflowPanel();
        if (!panel) {
            if (!state.missingLogged) {
                Logger.log('⚠ Workflow panel not found for toggle-tool-parameters');
                state.missingLogged = true;
            }
            return;
        }

        const currentPanelId = panel.getAttribute('data-panel-id');
        if (state.panelId === currentPanelId) {
            // Same panel, continue to check for new tools
        } else {
            state.panelId = currentPanelId;
            state.missingLogged = false;
        }

        const toolsContainer = this.findToolsArea(panel);
        if (!toolsContainer) {
            if (!state.missingLogged) {
                Logger.log('⚠ Tools container not found for toggle-tool-parameters');
                state.missingLogged = true;
            }
            return;
        }

        const toolCards = Context.dom.queryAll('div.rounded-lg.border.transition-colors', {
            root: toolsContainer,
            context: `${this.id}.toolCards`
        });

        let togglesAdded = 0;

        toolCards.forEach(card => {
            const collapsibleRoot = Context.dom.query('div[data-state]', {
                root: card,
                context: `${this.id}.collapsibleRoot`
            });
            if (!collapsibleRoot) return;

            const header = Context.dom.query(this.selectors.toolHeader, {
                root: card,
                context: `${this.id}.toolHeader`
            });
            if (!header) return;

            const buttonContainer = Context.dom.query('div.flex.items-center.gap-1', {
                root: header,
                context: `${this.id}.buttonContainer`
            });
            if (!buttonContainer) return;

            // Check for existing toggle
            let toggleBtn = Context.dom.query('.wf-param-toggle-btn', {
                root: buttonContainer,
                context: `${this.id}.toggleBtn`
            });

            if (!toggleBtn) {
                toggleBtn = document.createElement('button');
                toggleBtn.className = 'wf-param-toggle-btn inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 transition-colors hover:bg-accent hover:text-accent-foreground rounded-sm size-7 h-7 w-7';
                toggleBtn.title = 'Hide parameters';
                toggleBtn.dataset.paramVisible = 'true';
                toggleBtn.innerHTML = this.renderSwitch(true);

                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this.handleToggle(card, toggleBtn);
                });

                // Insert before the execute-to-current button if present, otherwise first in container
                const execBtn = buttonContainer.querySelector('.wf-execute-to-current-btn');
                buttonContainer.insertBefore(toggleBtn, execBtn || buttonContainer.firstChild);

                togglesAdded++;
            }

            // Re-enforce hidden state on each mutation to survive React re-renders
            // of collapsible content. The toggle button lives in the header (never
            // unmounted), so its dataset is the source of truth.
            if (toggleBtn.dataset.paramVisible === 'false') {
                const paramsDiv = this.findParametersDiv(card);
                if (paramsDiv && paramsDiv.style.display !== 'none') {
                    paramsDiv.style.display = 'none';
                }
            }
        });

        if (togglesAdded > 0) {
            Logger.log(`✓ Added ${togglesAdded} parameter toggle(s)`);
        }
    },

    renderSwitch(isOn) {
        const trackColor = isOn ? 'var(--brand, #6366f1)' : 'var(--muted-foreground, #6b7280)';
        const thumbPos = isOn ? '12px' : '1px';
        return `<div class="wf-toggle-track" style="width:22px;height:11px;border-radius:5.5px;background-color:${trackColor};transition:background-color 0.15s;position:relative;">` +
               `<div class="wf-toggle-thumb" style="width:9px;height:9px;border-radius:50%;background:white;position:absolute;top:1px;left:${thumbPos};transition:left 0.15s;box-shadow:0 0.5px 1.5px rgba(0,0,0,0.25);"></div></div>`;
    },

    handleToggle(card, toggleBtn) {
        const nowVisible = toggleBtn.dataset.paramVisible === 'false';

        // Flip state
        toggleBtn.dataset.paramVisible = nowVisible ? 'true' : 'false';
        toggleBtn.title = nowVisible ? 'Hide parameters' : 'Show parameters';

        // Animate switch
        const track = toggleBtn.querySelector('.wf-toggle-track');
        const thumb = toggleBtn.querySelector('.wf-toggle-thumb');
        if (track) track.style.backgroundColor = nowVisible ? 'var(--brand, #6366f1)' : 'var(--muted-foreground, #6b7280)';
        if (thumb) thumb.style.left = nowVisible ? '12px' : '1px';

        // Apply visibility to the parameters div
        const paramsDiv = this.findParametersDiv(card);
        if (paramsDiv) {
            paramsDiv.style.display = nowVisible ? '' : 'none';
            Logger.log(`Parameters ${nowVisible ? 'shown' : 'hidden'}`);
        }
    },

    findParametersDiv(card) {
        // Target: the div.space-y-3 whose first child element contains the text "Parameters".
        // This is the inner wrapper around the parameter inputs, sibling to the Execute button,
        // so hiding it leaves Execute in place and the card collapses naturally.
        const candidates = card.querySelectorAll('div.space-y-3');
        for (const div of candidates) {
            const firstChild = div.firstElementChild;
            if (firstChild && firstChild.textContent.trim() === 'Parameters') {
                return div;
            }
        }
        return null;
    },

    findWorkflowPanel() {
        const panels = Context.dom.queryAll('[data-panel-id][data-panel]', {
            context: `${this.id}.panels`
        });

        for (const candidate of panels) {
            const toolbar = candidate.querySelector('.border-b.h-9');
            if (toolbar) {
                const workflowText = Array.from(toolbar.querySelectorAll('span')).find(
                    span => span.textContent.trim() === 'Workflow'
                );
                if (workflowText) {
                    return candidate;
                }
            }
        }

        return null;
    },

    findToolsArea(panel) {
        if (!panel) return null;
        const scrollable = panel.querySelector('.overflow-y-auto');
        if (!scrollable) return null;
        return scrollable.querySelector('.space-y-3');
    }
};
