// ============= tool-results-resize-handle.js =============
// Adds a drag-to-resize handle to the bottom of tool result boxes.

const plugin = {
    id: 'disputeDetailToolResultsResizeHandle',
    name: 'Tool Results Resize Handle',
    description: 'Adds a resize handle to tool result boxes so their height can be adjusted by dragging',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { panelId: null, missingLogged: false, envWaitingLogged: false },

    selectors: {
        toolCard: '[data-ui="workflow-step"]',
        toolCardFallback: 'div.rounded-lg.border.transition-colors',
        stepResult: '[data-ui="step-result"]'
    },

    onMutation(state) {
        if (!this.isToolEnvReady()) {
            if (!state.envWaitingLogged) {
                Logger.debug(`${this.id}: waiting for tool environment gate`);
                state.envWaitingLogged = true;
            }
            return;
        }
        state.envWaitingLogged = false;

        const panel = this.findWorkflowPanel();
        if (!panel) return;

        const currentPanelId = panel.getAttribute('data-panel-id');
        if (state.panelId !== currentPanelId) {
            state.panelId = currentPanelId;
            state.missingLogged = false;
        }

        const toolsContainer = this.findToolsArea(panel);
        if (!toolsContainer) return;

        const toolCardsByDataUi = toolsContainer.querySelectorAll(this.selectors.toolCard);
        const toolCards = toolCardsByDataUi.length ? Array.from(toolCardsByDataUi) : Context.dom.queryAll(this.selectors.toolCardFallback, { root: toolsContainer, context: `${this.id}.toolCards` });

        toolCards.forEach(card => {
            const resultDiv = this.findResultDiv(card);
            if (!resultDiv) return;
            if (resultDiv.dataset.wfResultResizeAttached === '1') {
                const nextEl = resultDiv.nextElementSibling;
                if (nextEl && nextEl.classList.contains('wf-result-resize-handle')) {
                    this.ensureResetButton(card, resultDiv);
                    return;
                }
                delete resultDiv.dataset.wfResultResizeAttached;
            }
            this.attachResizeHandle(resultDiv);
            resultDiv.dataset.wfResultResizeAttached = '1';
            this.ensureResetButton(card, resultDiv);
        });
    },

    findResultDiv(card) {
        const stepResult = card.querySelector(this.selectors.stepResult);
        if (stepResult) {
            const box = stepResult.querySelector('div.p-3.rounded-md.border.text-xs.font-mono.whitespace-pre-wrap.overflow-auto');
            if (box) return box;
        }
        return null;
    },

    attachResizeHandle(resultDiv) {
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

        resultDiv.addEventListener('mouseenter', () => { resizeHandle.style.opacity = '1'; });
        resultDiv.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resizeHandle.contains(e.relatedTarget)) resizeHandle.style.opacity = '0';
        });
        resizeHandle.addEventListener('mouseenter', () => { resizeHandle.style.opacity = '1'; });
        resizeHandle.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resultDiv.contains(e.relatedTarget)) resizeHandle.style.opacity = '0';
        });

        resultDiv.insertAdjacentElement('afterend', resizeHandle);

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
            const delta = e.clientY - startY;
            const newHeight = Math.max(minHeight, startHeight + delta);
            resultDiv.style.maxHeight = `${newHeight}px`;
        };
        const handleMouseUp = () => {
            if (!isResizing) return;
            const endH = resultDiv.offsetHeight;
            if (endH !== startHeight) {
                Logger.debug(`${this.id}: user finished resizing result box`, { fromPx: startHeight, toPx: endH });
            }
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        resizeHandle.addEventListener('mousedown', handleMouseDown);
        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);
    },

    ensureResetButton(card, resultDiv) {
        const buttonContainer = this.findResultButtonContainer(card);
        if (!buttonContainer) return;
        if (buttonContainer.querySelector('.wf-result-reset-btn')) return;

        const resetBtn = document.createElement('button');
        resetBtn.className = 'wf-result-reset-btn inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        resetBtn.title = 'Reset result box size';
        resetBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="fill-current h-3 w-3 text-muted-foreground"><path fill-rule="evenodd" clip-rule="evenodd" d="M19 9C19.5523 9 20 9.44772 20 10C20 10.5523 19.5523 11 19 11H14C13.4477 11 13 10.5523 13 10V5C13 4.44772 13.4477 4 14 4C14.5523 4 15 4.44772 15 5V7.58579L19.2929 3.2929C19.6834 2.9024 20.3166 2.9024 20.7071 3.2929C21.0976 3.6834 21.0976 4.31658 20.7071 4.70711L16.4142 9H19ZM4.70711 20.7071C4.31658 21.0976 3.6834 21.0976 3.2929 20.7071C2.9024 20.3166 2.9024 19.6834 3.2929 19.2929L7.58579 15H5C4.44772 15 4 14.5523 4 14C4 13.4477 4.44772 13 5 13H10C10.5523 13 11 13.4477 11 14V19C11 19.5523 10.5523 20 10 20C9.44772 20 9 19.5523 9 19V16.4142L4.70711 20.7071Z"/></svg>';
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            resultDiv.style.maxHeight = '';
            Logger.log(`${this.id}: user reset result box height to default`);
        });
        buttonContainer.appendChild(resetBtn);
    },

    findResultButtonContainer(card) {
        const stepResult = card.querySelector(this.selectors.stepResult);
        if (!stepResult) return null;
        return stepResult.querySelector('.flex.items-center.justify-between.gap-2');
    },

    findWorkflowPanel() {
        return document.querySelector('[data-ui="workflow-panel"]');
    },

    findToolsArea(panel) {
        if (!panel) return null;
        return panel.querySelector('[data-ui="workflow-steps-container"]');
    },

    isToolEnvReady() {
        return document.documentElement.getAttribute('data-fleet-dispute-tool-env-ready') === '1';
    }
};
