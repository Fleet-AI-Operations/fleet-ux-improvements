
// ============= tool-results-resize-handle.js =============
// Adds a drag-to-resize handle to the bottom of tool result boxes.

const plugin = {
    id: 'toolResultsResizeHandle',
    name: 'Tool Results Resize Handle',
    description: 'Adds a resize handle to tool result boxes so their height can be adjusted by dragging',
    _version: '2.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { panelId: null, missingLogged: false },

    selectors: {
        workflowPanel: '[data-ui="workflow-panel"]',
        workflowStepsContainer: '[data-ui="workflow-steps-container"]',
        workflowStep: '[data-ui="workflow-step"]',
        stepResult: '[data-ui="step-result"]',
        toolCardFallback: 'div.rounded-lg.border.transition-colors',
        resultScrollable: 'div.p-3.rounded-md.border.text-xs.font-mono.whitespace-pre-wrap.overflow-auto'
    },

    onMutation(state, context) {
        const panel = this.findWorkflowPanel();
        if (!panel) {
            if (!state.missingLogged) {
                Logger.warn(`${this.id}: workflow panel not found`);
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
                Logger.warn(`${this.id}: tools container not found`);
                state.missingLogged = true;
            }
            return;
        }

        let toolCards = Context.dom.queryAll(this.selectors.workflowStep, { root: toolsContainer, context: `${this.id}.toolCards` });
        if (!toolCards.length) toolCards = Context.dom.queryAll(this.selectors.toolCardFallback, { root: toolsContainer, context: `${this.id}.toolCards` });

        let handlesAdded = 0;

        toolCards.forEach(card => {
            const resultDiv = this.findResultDiv(card);
            if (!resultDiv) return;

            // Check if handle already attached and still in DOM
            if (resultDiv.dataset.wfResultResizeAttached === '1') {
                const nextEl = resultDiv.nextElementSibling;
                if (nextEl && nextEl.classList.contains('wf-result-resize-handle')) {
                    this.ensureResetButton(card, resultDiv);
                    return; // Handle present, nothing to do
                }
                // Handle was removed (e.g. React re-render), reset flag
                delete resultDiv.dataset.wfResultResizeAttached;
            }

            this.attachResizeHandle(resultDiv);
            resultDiv.dataset.wfResultResizeAttached = '1';
            this.ensureResetButton(card, resultDiv);
            handlesAdded++;
        });

        if (handlesAdded > 0) {
            Logger.log(`✓ Added ${handlesAdded} result resize handle(s)`);
        }
    },

    findResultDiv(card) {
        const stepResult = card.querySelector(this.selectors.stepResult);
        if (stepResult) {
            const scrollable = stepResult.querySelector(this.selectors.resultScrollable);
            if (scrollable) return scrollable;
        }
        const sections = card.querySelectorAll('div.space-y-2');
        for (const section of sections) {
            const header = section.querySelector('div.text-xs.font-medium.text-muted-foreground.uppercase');
            if (header && header.textContent.trim() === 'Result') {
                const el = section.querySelector(this.selectors.resultScrollable);
                if (el) return el;
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
        let lastClientY = 0;
        let accumulatedScrollDelta = 0;
        let animFrameId = null;
        const scrollContainer = resultDiv.closest('.overflow-y-auto');
        const edgeThreshold = 50;
        const maxScrollSpeed = 15;

        const autoScroll = () => {
            if (!isResizing || !scrollContainer) return;

            const distFromBottom = window.innerHeight - lastClientY;
            const distFromTop = lastClientY;
            let scrollAmount = 0;

            if (distFromBottom < edgeThreshold) {
                scrollAmount = Math.ceil(maxScrollSpeed * (1 - distFromBottom / edgeThreshold));
            } else if (distFromTop < edgeThreshold) {
                scrollAmount = -Math.ceil(maxScrollSpeed * (1 - distFromTop / edgeThreshold));
            }

            if (scrollAmount !== 0) {
                scrollContainer.scrollTop += scrollAmount;
                accumulatedScrollDelta += scrollAmount;

                const totalDelta = (lastClientY - startY) + accumulatedScrollDelta;
                const newHeight = Math.max(minHeight, startHeight + totalDelta);
                resultDiv.style.maxHeight = `${newHeight}px`;
            }

            animFrameId = requestAnimationFrame(autoScroll);
        };

        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = resultDiv.offsetHeight;
            lastClientY = e.clientY;
            accumulatedScrollDelta = 0;

            e.preventDefault();
            e.stopPropagation();

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';

            animFrameId = requestAnimationFrame(autoScroll);
        };

        const handleMouseMove = (e) => {
            if (!isResizing) return;

            lastClientY = e.clientY;
            const totalDelta = (e.clientY - startY) + accumulatedScrollDelta;
            const newHeight = Math.max(minHeight, startHeight + totalDelta);
            resultDiv.style.maxHeight = `${newHeight}px`;
        };

        const handleMouseUp = () => {
            if (!isResizing) return;
            const endH = resultDiv.offsetHeight;
            if (endH !== startHeight) {
                Logger.debug(`${this.id}: user finished resizing result box`, { fromPx: startHeight, toPx: endH });
            }
            isResizing = false;

            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }

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

        // Check if button already exists
        if (buttonContainer.querySelector('.wf-result-reset-btn')) return;

        const resetBtn = document.createElement('button');
        resetBtn.className = 'wf-result-reset-btn inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        resetBtn.title = 'Reset result box size';
        // Inward-pointing arrows icon (each arrow from the expand icon rotated 180°)
        resetBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="fill-current h-3 w-3 text-muted-foreground"><path fill-rule="evenodd" clip-rule="evenodd" d="M19 9C19.5523 9 20 9.44772 20 10C20 10.5523 19.5523 11 19 11H14C13.4477 11 13 10.5523 13 10V5C13 4.44772 13.4477 4 14 4C14.5523 4 15 4.44772 15 5V7.58579L19.2929 3.2929C19.6834 2.9024 20.3166 2.9024 20.7071 3.2929C21.0976 3.6834 21.0976 4.31658 20.7071 4.70711L16.4142 9H19ZM4.70711 20.7071C4.31658 21.0976 3.6834 21.0976 3.2929 20.7071C2.9024 20.3166 2.9024 19.6834 3.2929 19.2929L7.58579 15H5C4.44772 15 4 14.5523 4 14C4 13.4477 4.44772 13 5 13H10C10.5523 13 11 13.4477 11 14V19C11 19.5523 10.5523 20 10 20C9.44772 20 9 19.5523 9 19V16.4142L4.70711 20.7071Z"/></svg>';

        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            resultDiv.style.maxHeight = '';
            Logger.log(`${this.id}: user reset result box height to default`);
        });

        // Insert after the divider in the result toolbar
        const divider = buttonContainer.querySelector('.w-px.h-4.bg-border.mx-1');
        if (divider) {
            divider.insertAdjacentElement('afterend', resetBtn);
        } else {
            buttonContainer.appendChild(resetBtn);
        }
    },

    findResultButtonContainer(card) {
        const stepResult = card.querySelector(this.selectors.stepResult);
        if (stepResult) {
            const divider = stepResult.querySelector('.w-px.h-4.bg-border.mx-1');
            if (divider) return divider.parentElement;
        }
        const sections = card.querySelectorAll('div.space-y-2');
        for (const section of sections) {
            const header = section.querySelector('div.text-xs.font-medium.text-muted-foreground.uppercase');
            if (header && header.textContent.trim() === 'Result') {
                const divider = section.querySelector('.w-px.h-4.bg-border.mx-1');
                if (divider) return divider.parentElement;
            }
        }
        return null;
    },

    findWorkflowPanel() {
        const byDataUi = document.querySelector(this.selectors.workflowPanel);
        if (byDataUi) return byDataUi;
        const panels = Context.dom.queryAll('[data-panel-id][data-panel]', { context: `${this.id}.panels` });
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
        const container = panel.querySelector(this.selectors.workflowStepsContainer);
        if (container) {
            const spaceY3 = container.querySelector(':scope > .space-y-3');
            return spaceY3 || container;
        }
        const scrollable = panel.querySelector('.overflow-y-auto');
        if (!scrollable) return null;
        return scrollable.querySelector('.space-y-3');
    }
};
