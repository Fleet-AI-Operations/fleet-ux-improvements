
// ============= tool-results-resize-handle.js =============
// Adds a drag-to-resize handle to the bottom of tool result boxes.

const plugin = {
    id: 'toolResultsResizeHandle',
    name: 'Tool Results Resize Handle',
    description: 'Adds a resize handle to tool result boxes so their height can be adjusted by dragging',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { panelId: null, missingLogged: false },

    onMutation(state, context) {
        const panel = this.findWorkflowPanel();
        if (!panel) {
            if (!state.missingLogged) {
                Logger.log('⚠ Workflow panel not found for tool-results-resize-handle');
                state.missingLogged = true;
            }
            return;
        }

        const currentPanelId = panel.getAttribute('data-panel-id');
        if (state.panelId !== currentPanelId) {
            state.panelId = currentPanelId;
            state.missingLogged = false;
        }

        const toolsContainer = this.findToolsArea(panel);
        if (!toolsContainer) {
            if (!state.missingLogged) {
                Logger.log('⚠ Tools container not found for tool-results-resize-handle');
                state.missingLogged = true;
            }
            return;
        }

        const toolCards = Context.dom.queryAll('div.rounded-lg.border.transition-colors', {
            root: toolsContainer,
            context: `${this.id}.toolCards`
        });

        let handlesAdded = 0;

        toolCards.forEach(card => {
            const resultDiv = this.findResultDiv(card);
            if (!resultDiv) return;

            // Check if handle already attached and still in DOM
            if (resultDiv.dataset.wfResultResizeAttached === '1') {
                const nextEl = resultDiv.nextElementSibling;
                if (nextEl && nextEl.classList.contains('wf-result-resize-handle')) {
                    return; // Handle present, nothing to do
                }
                // Handle was removed (e.g. React re-render), reset flag
                delete resultDiv.dataset.wfResultResizeAttached;
            }

            this.attachResizeHandle(resultDiv);
            resultDiv.dataset.wfResultResizeAttached = '1';
            handlesAdded++;
        });

        if (handlesAdded > 0) {
            Logger.log(`✓ Added ${handlesAdded} result resize handle(s)`);
        }
    },

    findResultDiv(card) {
        // Target: the scrollable result content box inside the "Result" section.
        // Structure: div.space-y-2 > [ Result header, div.p-3.rounded-md.border...overflow-auto ]
        const sections = card.querySelectorAll('div.space-y-2');
        for (const section of sections) {
            const header = section.querySelector('div.text-xs.font-medium.text-muted-foreground.uppercase');
            if (header && header.textContent.trim() === 'Result') {
                return section.querySelector(
                    'div.p-3.rounded-md.border.text-xs.font-mono.whitespace-pre-wrap.overflow-auto'
                );
            }
        }
        return null;
    },

    attachResizeHandle(resultDiv) {
        // --- Build handle element ---
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'wf-result-resize-handle';
        Object.assign(resizeHandle.style, {
            height: '8px',
            cursor: 'ns-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: '0',
            transition: 'opacity 0.15s',
            userSelect: 'none'
        });

        const handleBar = document.createElement('div');
        Object.assign(handleBar.style, {
            width: '40px',
            height: '3px',
            borderRadius: '1.5px',
            backgroundColor: 'currentColor',
            opacity: '0.3'
        });
        resizeHandle.appendChild(handleBar);

        // --- Hover behaviour: show on result-div or handle hover ---
        resultDiv.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        resultDiv.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resizeHandle.contains(e.relatedTarget)) {
                resizeHandle.style.opacity = '0';
            }
        });
        resizeHandle.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        resizeHandle.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resultDiv.contains(e.relatedTarget)) {
                resizeHandle.style.opacity = '0';
            }
        });

        // Insert handle right after result div
        resultDiv.insertAdjacentElement('afterend', resizeHandle);

        // --- Drag-to-resize logic ---
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const minHeight = 40;

        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = resultDiv.offsetHeight;

            e.preventDefault();
            e.stopPropagation();

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        };

        const handleMouseMove = (e) => {
            if (!isResizing) return;

            const deltaY = e.clientY - startY;
            const newHeight = Math.max(minHeight, startHeight + deltaY);
            resultDiv.style.maxHeight = `${newHeight}px`;
        };

        const handleMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        resizeHandle.addEventListener('mousedown', handleMouseDown);
        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);
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
                if (workflowText) return candidate;
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
