// ============= toggle-tool-parameters.js =============
const plugin = {
    id: 'disputeDetailToggleToolParameters',
    name: 'Toggle Tool Parameters',
    description: 'Adds a toggle to each tool header to hide/show its parameters section',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { panelId: null, missingLogged: false, envWaitingLogged: false },

    subOptions: [
        {
            id: 'auto-collapse-on-execute',
            name: 'Auto-collapse parameters on execute',
            description: 'When a tool is executed, collapse its parameters section if it is open',
            enabledByDefault: true
        }
    ],

    paramSectionBtnClass: 'wf-param-section-btn inline-flex items-center gap-1 justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground rounded-sm text-xs py-1.5 pl-2 pr-2',

    selectors: {
        workflowPanel: '[data-ui="workflow-panel"]',
        workflowStepsContainer: '[data-ui="workflow-steps-container"]',
        workflowStep: '[data-ui="workflow-step"]',
        stepHeader: '[data-ui="step-header"]',
        stepParameters: '[data-ui="step-parameters"]',
        toolHeaderFallback: 'div.flex.items-center.gap-3.p-3.cursor-pointer.hover\\:bg-muted\\/30',
        toolCardFallback: 'div.rounded-lg.border.transition-colors'
    },

    onMutation(state) {
        if (!this.isToolEnvReady()) {
            if (!state.envWaitingLogged) {
                Logger.debug('Toggle-tool-parameters: waiting for tool environment');
                state.envWaitingLogged = true;
            }
            return;
        }
        state.envWaitingLogged = false;

        const panel = this.findWorkflowPanel();
        if (!panel) {
            if (!state.missingLogged) {
                Logger.log('⚠ Workflow panel not found for toggle-tool-parameters');
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
        if (!toolsContainer) return;
        this.ensureExecuteClickDelegate(toolsContainer);

        let toolCards = Context.dom.queryAll(this.selectors.workflowStep, { root: toolsContainer, context: `${this.id}.toolCards` });
        if (!toolCards.length) toolCards = Context.dom.queryAll(this.selectors.toolCardFallback, { root: toolsContainer, context: `${this.id}.toolCards` });

        toolCards.forEach(card => {
            const collapsibleRoot = Context.dom.query('div[data-state]', { root: card, context: `${this.id}.collapsibleRoot` });
            if (!collapsibleRoot) return;

            const header = Context.dom.query(this.selectors.stepHeader, { root: card, context: `${this.id}.toolHeader` })
                || Context.dom.query(this.selectors.toolHeaderFallback, { root: card, context: `${this.id}.toolHeader` });
            if (!header) return;

            const buttonContainer = Context.dom.query('div.flex.items-center.gap-1', { root: header, context: `${this.id}.buttonContainer` });
            if (!buttonContainer) return;

            let toggleBtn = Context.dom.query('.wf-param-toggle-btn', { root: buttonContainer, context: `${this.id}.toggleBtn` });
            const isCollapsed = collapsibleRoot.getAttribute('data-state') === 'closed';

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
                const execBtn = buttonContainer.querySelector('.wf-execute-to-current-btn');
                buttonContainer.insertBefore(toggleBtn, execBtn || buttonContainer.firstChild);
            }

            toggleBtn.style.display = 'none';

            const paramsDiv = this.findParametersDiv(card);
            if (!paramsDiv) return;

            let expandLink = card.querySelector('.wf-param-expand-link');
            if (!expandLink) {
                expandLink = document.createElement('button');
                expandLink.className = 'wf-param-expand-link ' + this.paramSectionBtnClass;
                expandLink.type = 'button';
                expandLink.textContent = 'Show Parameters';
                expandLink.title = 'Show parameters';
                expandLink.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this.handleToggle(card, toggleBtn);
                });
                paramsDiv.parentNode.insertBefore(expandLink, paramsDiv.nextSibling);
            }
            expandLink.style.display = (!isCollapsed && toggleBtn.dataset.paramVisible === 'false') ? 'inline-flex' : 'none';

            const labelEl = paramsDiv.firstElementChild;
            if (labelEl && !labelEl.hasAttribute('data-wf-param-label')) {
                const labelText = labelEl.textContent.trim();
                if (labelText === 'Parameters' || labelText === 'PARAMETERS') {
                    labelEl.setAttribute('data-wf-param-label', '1');
                    labelEl.className = this.paramSectionBtnClass;
                    labelEl.textContent = 'Hide Parameters';
                    labelEl.setAttribute('role', 'button');
                    labelEl.setAttribute('tabindex', '0');
                    labelEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        this.handleToggle(card, toggleBtn);
                    });
                }
            }
        });
    },

    renderSwitch(isOn) {
        const trackColor = isOn ? 'var(--brand, #6366f1)' : 'var(--muted-foreground, #6b7280)';
        const thumbPos = isOn ? '12px' : '1px';
        return `<div class="wf-toggle-track" style="width:22px;height:11px;border-radius:5.5px;background-color:${trackColor};transition:background-color 0.15s;position:relative;"><div class="wf-toggle-thumb" style="width:9px;height:9px;border-radius:50%;background:white;position:absolute;top:1px;left:${thumbPos};transition:left 0.15s;box-shadow:0 0.5px 1.5px rgba(0,0,0,0.25);"></div></div>`;
    },

    handleToggle(card, toggleBtn) {
        const nowVisible = toggleBtn.dataset.paramVisible === 'false';
        toggleBtn.dataset.paramVisible = nowVisible ? 'true' : 'false';
        const paramsDiv = this.findParametersDiv(card);
        if (paramsDiv) paramsDiv.style.display = nowVisible ? '' : 'none';
        const expandLink = card.querySelector('.wf-param-expand-link');
        if (expandLink) expandLink.style.display = nowVisible ? 'none' : 'inline-flex';
    },

    findParametersDiv(card) {
        const byDataUi = card.querySelector(this.selectors.stepParameters);
        if (byDataUi) return byDataUi;
        const candidates = card.querySelectorAll('div.space-y-3');
        for (const div of candidates) {
            const firstChild = div.firstElementChild;
            if (!firstChild) continue;
            if (firstChild.textContent.trim() === 'Parameters' || firstChild.getAttribute('data-wf-param-label') === '1') return div;
        }
        return null;
    },

    findWorkflowPanel() {
        return document.querySelector(this.selectors.workflowPanel);
    },

    findToolsArea(panel) {
        if (!panel) return null;
        const container = panel.querySelector(this.selectors.workflowStepsContainer);
        if (container) {
            const spaceY3 = container.querySelector(':scope > .space-y-3');
            return spaceY3 || container;
        }
        return null;
    },

    ensureExecuteClickDelegate(toolsContainer) {
        if (toolsContainer.dataset.wfAutoCollapseDelegate === '1') return;
        toolsContainer.dataset.wfAutoCollapseDelegate = '1';
        toolsContainer.addEventListener('click', (e) => {
            const btn = e.target?.closest?.('button');
            if (!btn) return;
            const text = btn.textContent?.trim?.();
            if (text !== 'Execute' && text !== 'Re-execute') return;
            const card = btn.closest(this.selectors.workflowStep) || btn.closest(this.selectors.toolCardFallback);
            if (!card || !toolsContainer.contains(card)) return;
            if (!Storage.getSubOptionEnabled(this.id, 'auto-collapse-on-execute', true)) return;
            const toggleBtn = card.querySelector('.wf-param-toggle-btn');
            if (!toggleBtn || toggleBtn.dataset.paramVisible !== 'true') return;
            this.handleToggle(card, toggleBtn);
            Logger.debug('Auto-collapsed parameters after execute');
        });
    },

    isToolEnvReady() {
        return document.documentElement.getAttribute('data-fleet-dispute-tool-env-ready') === '1';
    }
};
