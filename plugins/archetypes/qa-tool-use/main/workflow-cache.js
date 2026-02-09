// ============= workflow-cache.js =============
const plugin = {
    id: 'workflowCache',
    name: 'Workflow Cache',
    description: 'Observes workflow for tool add/delete/execute events; captures JSON snapshot on add/delete/execute',
    _version: '1.22',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false,
        observedParent: null,
        observedContainer: null,
        parentObserver: null,
        containerObservers: [],
        workflowSnapshot: null,
        applyInProgress: false,
        applyControlsAdded: false,
        toolPanelMissingLogged: false
    },

    selectors: {
        toolCard: 'div.rounded-lg.border.transition-colors',
        toolHeader: 'div.flex.items-center.gap-3.p-3.cursor-pointer.hover\\:bg-muted\\/30',
        stableParent: '.flex-1.px-16.py-4.max-w-screen-md.mx-auto',
        toolsContainer: '.space-y-3',
        workflowToolbar: '.border-b.h-9',
        toolSearchInput: 'input[placeholder="Search tools, descriptions, parameters..."]',
        toolClearButton: 'button.wf-clear-search-btn',
        toolTabList: '[role="tablist"]',
        toolTab: 'button[role="tab"]',
        toolListRoot: 'div.p-2.space-y-1',
        toolListItem: 'button.group\\/tool'
    },

    storageKeys: {
        latestSnapshot: 'workflow-cache-latest',
        devJson: 'workflow-cache-dev-json'
    },

    onMutation(state, context) {
        const panel = this.findWorkflowPanel();
        if (!panel) {
            if (!state.missingLogged) {
                Logger.debug('Workflow cache: workflow panel not found');
                state.missingLogged = true;
            }
            return;
        }

        const stableParent = this.findStableParent(panel);
        if (!stableParent) {
            if (!state.missingLogged) {
                Logger.debug('Workflow cache: stable parent not found');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;

        this.ensureApplyControls(state, panel);

        if (state.observedParent !== stableParent) {
            this.disconnectAllObservers(state);
            state.observedParent = null;
            state.observedContainer = null;
        }

        if (!state.parentObserver) {
            this.attachParentObserver(stableParent, state);
            state.observedParent = stableParent;
        }

        const toolsContainer = stableParent.querySelector(':scope > ' + this.selectors.toolsContainer);
        if (toolsContainer && toolsContainer !== state.observedContainer) {
            this.attachContainerObservers(toolsContainer, state);
            state.observedContainer = toolsContainer;
            Logger.info('Workflow cache: observing workflow');
        }
    },

    disconnectAllObservers(state) {
        if (state.parentObserver) {
            state.parentObserver.disconnect();
            state.parentObserver = null;
        }
        if (state.containerObservers && state.containerObservers.length) {
            state.containerObservers.forEach(obs => obs.disconnect());
            state.containerObservers = [];
        }
        state.observedContainer = null;
    },

    disconnectContainerObservers(state) {
        if (state.containerObservers && state.containerObservers.length) {
            state.containerObservers.forEach(obs => obs.disconnect());
            state.containerObservers = [];
        }
        state.observedContainer = null;
    },

    captureAndSaveSnapshot(state, reason) {
        if (state.applyInProgress) {
            Logger.debug('Workflow cache: snapshot skipped (apply in progress)');
            return;
        }
        Logger.info('Workflow cache: snapshot attempt (container: ' + (state.observedContainer ? 'yes' : 'no') + ')');
        if (!state.observedContainer) {
            Logger.warn('Workflow cache: snapshot skipped, no observed container');
            return;
        }
        try {
            const snapshot = this.captureSnapshot(state.observedContainer);
            this.saveSnapshot(state, snapshot, reason || 'current');
        } catch (e) {
            Logger.error('Workflow cache: snapshot failed', e);
        }
    },

    saveSnapshot(state, snapshot, reason) {
        if (!snapshot || !Array.isArray(snapshot)) {
            Logger.warn('Workflow cache: snapshot save skipped (invalid snapshot)');
            return;
        }
        state.workflowSnapshot = snapshot;
        Storage.set(this.storageKeys.latestSnapshot, JSON.stringify(snapshot));
        Logger.info('Workflow cache: snapshot saved (' + snapshot.length + ' tools, reason: ' + reason + ')');
        Logger.log(JSON.stringify(snapshot, null, 2));
    },

    savePreviousSnapshot(state, reason) {
        if (state.applyInProgress) {
            Logger.debug('Workflow cache: previous snapshot skipped (apply in progress)');
            return;
        }
        if (!state.workflowSnapshot || !Array.isArray(state.workflowSnapshot)) {
            Logger.warn('Workflow cache: no previous snapshot available for deletion');
            return;
        }
        this.saveSnapshot(state, state.workflowSnapshot, reason || 'pre-delete');
    },

    captureSnapshot(container) {
        if (!container) {
            Logger.warn('Workflow cache: captureSnapshot called with no container');
            return [];
        }
        const cards = container.querySelectorAll(this.selectors.toolCard);
        if (!cards.length) {
            Logger.warn('Workflow cache: snapshot found no tool cards in container');
            return [];
        }
        const out = [];
        cards.forEach((card, index) => {
            const name = this.getToolNameFromCard(card);
            if (!name) {
                Logger.warn('Workflow cache: tool card at index ' + index + ' has no tool name (header or span not found)');
            }
            const params = this.getParamsFromCard(card);
            const filteredParams = {};
            Object.keys(params).forEach(k => {
                const v = params[k];
                if (this.hasValue(v)) {
                    filteredParams[k] = v;
                }
            });
            const toolKey = name || '(unknown)';
            out.push({ [toolKey]: filteredParams });
        });
        if (out.length === 0) {
            Logger.warn('Workflow cache: snapshot has no tools after processing cards');
        }
        return out;
    },

    hasValue(v) {
        if (v === null || v === undefined) return false;
        if (typeof v === 'string') return v.length > 0;
        if (typeof v === 'number') return !Number.isNaN(v);
        if (typeof v === 'boolean') return v === true;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return true;
    },

    getToolNameFromCard(card) {
        const header = card.querySelector(this.selectors.toolHeader);
        if (!header) {
            Logger.warn('Workflow cache: getToolNameFromCard found no header in card');
            return '';
        }
        const span = header.querySelector('span.font-mono.text-sm.font-medium');
        if (!span) {
            Logger.warn('Workflow cache: getToolNameFromCard found no tool name span in header');
            return '';
        }
        return span.textContent.trim();
    },

    getParamsFromCard(card) {
        const params = {};
        const content = card.querySelector('div[data-state="open"] div.px-3.pb-3.space-y-3');
        if (!content) {
            Logger.warn('Workflow cache: getParamsFromCard found no open parameters content (card may be collapsed)');
            return params;
        }
        const spaceY3 = content.querySelector('div.space-y-3');
        if (!spaceY3) {
            Logger.warn('Workflow cache: getParamsFromCard found no div.space-y-3 in parameters content');
            return params;
        }
        const blocks = Array.from(spaceY3.children).filter(el => el.nodeType === Node.ELEMENT_NODE && el.matches && el.matches('div.flex.flex-col.gap-1\\.5'));
        blocks.forEach(block => {
            const name = this.getParamNameFromBlock(block);
            if (!name) return;
            const typeLabel = this.getParamTypeFromBlock(block);
            const value = this.getParamValueFromBlock(block, typeLabel);
            if (value !== undefined) params[name] = value;
        });
        return params;
    },

    getParamNameFromBlock(block) {
        const code = block.querySelector('code.text-xs.font-mono');
        if (code) return code.textContent.trim();
        const label = block.querySelector('label[for^="param-"]');
        if (label) return label.textContent.trim();
        return '';
    },

    getParamTypeFromBlock(block) {
        const typeDiv = block.querySelector('div.inline-flex.whitespace-nowrap.rounded-md.border.font-medium');
        if (!typeDiv) return '';
        return (typeDiv.textContent || '').trim().toLowerCase();
    },

    getParamValueFromBlock(block, typeLabel) {
        if (!typeLabel) {
            const inferred = this.getParamValueFromBlockInferred(block);
            if (inferred !== undefined) return inferred;
            return undefined;
        }
        if (typeLabel === 'string') {
            const input = block.querySelector('input[type="text"]');
            if (input) return input.value.trim() || undefined;
            const textarea = block.querySelector('textarea');
            if (textarea) return textarea.value.trim() || undefined;
            return undefined;
        }
        if (typeLabel === 'object') {
            const obj = this.getObjectValueFromBlock(block);
            if (obj !== undefined) return obj;
            const input = block.querySelector('input[type="text"]');
            if (input) return input.value.trim() || undefined;
            const textarea = block.querySelector('textarea');
            if (textarea) return textarea.value.trim() || undefined;
            return undefined;
        }
        if (typeLabel === 'integer' || typeLabel === 'number') {
            const input = block.querySelector('input[type="number"]');
            if (!input) return undefined;
            const s = input.value.trim();
            if (s === '') return undefined;
            const n = Number(s);
            return Number.isNaN(n) ? s : n;
        }
        if (typeLabel === 'boolean') {
            const btn = block.querySelector('button[role="checkbox"]');
            if (!btn) return undefined;
            return btn.getAttribute('data-state') === 'checked';
        }
        if (typeLabel === 'enum') {
            const btn = block.querySelector('button[role="combobox"]');
            if (!btn) return undefined;
            const span = btn.querySelector('span.flex-1.flex') || btn.querySelector('span[style*="pointer-events"]');
            const text = span ? (span.textContent || '').trim() : '';
            return text || undefined;
        }
        if (typeLabel === 'enum[]' || typeLabel.includes('enum[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1');
            if (!wrap) return undefined;
            const combos = wrap.querySelectorAll('button[role="combobox"]');
            const arr = [];
            combos.forEach(btn => {
                const span = btn.querySelector('span.flex-1.flex') || btn.querySelector('span[style*="pointer-events"]');
                const text = span ? (span.textContent || '').trim() : '';
                if (text) arr.push(text);
            });
            return arr.length ? arr : undefined;
        }
        if (typeLabel === 'string[]' || typeLabel.includes('string[]') || typeLabel === 'any[]' || typeLabel.includes('any[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1');
            if (!wrap) return undefined;
            const inputs = wrap.querySelectorAll('div.flex.items-center.gap-2 input[type="text"]');
            const arr = [];
            inputs.forEach(inp => {
                const v = inp.value.trim();
                if (v) arr.push(v);
            });
            return arr.length ? arr : undefined;
        }
        if (typeLabel === 'object[]' || typeLabel.includes('object[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1') || block;
            const items = Array.from(wrap.children).filter(el => el.nodeType === Node.ELEMENT_NODE && el.matches && el.matches('div.relative.border.rounded-md.p-3[class*="bg-muted"]'));
            if (!items.length) return undefined;
            const arr = [];
            items.forEach(item => {
                const innerBlocks = this.getNestedBlocksFromObjectItem(item);
                if (!innerBlocks.length) return;
                const obj = this.buildObjectFromBlocks(innerBlocks);
                if (this.hasValue(obj)) arr.push(obj);
            });
            return arr.length ? arr : undefined;
        }
        return undefined;
    },

    getParamValueFromBlockInferred(block) {
        const input = block.querySelector('input[type="text"]');
        if (input) return input.value.trim() || undefined;
        const textarea = block.querySelector('textarea');
        if (textarea) return textarea.value.trim() || undefined;
        const numInput = block.querySelector('input[type="number"]');
        if (numInput) {
            const s = numInput.value.trim();
            if (s === '') return undefined;
            const n = Number(s);
            return Number.isNaN(n) ? s : n;
        }
        return undefined;
    },

    async applyValueToBlockInferred(block, value) {
        const textValue = (value === null || value === undefined) ? '' : (typeof value === 'string' ? value : String(value));
        const input = block.querySelector('input[type="text"]');
        if (input) {
            this.setInputValue(input, textValue);
            return;
        }
        const textarea = block.querySelector('textarea');
        if (textarea) {
            this.setInputValue(textarea, textValue);
            return;
        }
        const numInput = block.querySelector('input[type="number"]');
        if (numInput) {
            this.setInputValue(numInput, (value === null || value === undefined) ? '' : String(value));
        }
    },

    getObjectValueFromBlock(block) {
        const innerBlocks = this.getNestedBlocksFromObjectBlock(block);
        if (!innerBlocks.length) return undefined;
        const obj = this.buildObjectFromBlocks(innerBlocks);
        return this.hasValue(obj) ? obj : undefined;
    },

    buildObjectFromBlocks(blocks) {
        const obj = {};
        blocks.forEach(innerBlock => {
            const name = this.getParamNameFromBlock(innerBlock);
            if (!name) return;
            const innerType = this.getParamTypeFromBlock(innerBlock);
            const val = this.getParamValueFromBlock(innerBlock, innerType);
            if (val !== undefined && this.hasValue(val)) obj[name] = val;
        });
        return obj;
    },

    getNestedBlocksFromObjectBlock(block) {
        const nestedContainer =
            block.querySelector('div.ml-4.pl-3.border-l-2') ||
            block.querySelector('div.ml-4.pl-3') ||
            block.querySelector('div.space-y-3');
        if (!nestedContainer) return [];
        return Array.from(nestedContainer.children).filter(el => el.nodeType === Node.ELEMENT_NODE && el.matches && el.matches('div.flex.flex-col.gap-1\\.5'));
    },

    getNestedBlocksFromObjectItem(item) {
        const innerSpace = item.querySelector('div.space-y-3');
        if (!innerSpace) return [];
        return Array.from(innerSpace.children).filter(el => el.nodeType === Node.ELEMENT_NODE && el.matches && el.matches('div.flex.flex-col.gap-1\\.5'));
    },

    ensureApplyControls(state, panel) {
        if (!panel || panel.querySelector('[data-wf-apply-cache-btn="true"]')) return;

        const positionStyle = window.getComputedStyle(panel).position;
        if (!positionStyle || positionStyle === 'static') {
            panel.style.position = 'relative';
        }

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.setAttribute('data-wf-apply-cache-btn', 'true');
        applyBtn.className = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-brand !text-white transition-colors hover:brightness-95 border border-brand-accent h-8 rounded-sm pl-3 pr-3 text-xs';
        applyBtn.textContent = 'Apply cache';
        applyBtn.style.position = 'absolute';
        applyBtn.style.right = '16px';
        applyBtn.style.bottom = '15%';
        applyBtn.style.zIndex = '50';
        applyBtn.addEventListener('click', () => {
            this.applyCachedWorkflow(state, { source: 'latest' });
        });

        const devPanel = this.createDevPanel(state);
        if (devPanel) {
            devPanel.style.position = 'absolute';
            devPanel.style.right = '16px';
            devPanel.style.bottom = 'calc(15% + 48px)';
            devPanel.style.zIndex = '50';
            panel.appendChild(devPanel);
        }

        panel.appendChild(applyBtn);
        Logger.log('✓ Workflow cache: apply controls added');
    },

    createDevPanel(state) {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-wf-apply-cache-dev', 'true');
        wrapper.className = 'flex flex-col gap-2 p-2 rounded-md border border-input bg-background shadow-sm';
        wrapper.style.width = '280px';

        const label = document.createElement('div');
        label.className = 'text-[10px] font-medium uppercase tracking-wider text-muted-foreground';
        label.textContent = 'Dev cache JSON';

        const textarea = document.createElement('textarea');
        textarea.className = 'w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand';
        textarea.rows = 5;
        textarea.placeholder = 'Paste cache JSON here...';
        textarea.value = Storage.get(this.storageKeys.devJson, '') || '';

        textarea.addEventListener('input', () => {
            Storage.set(this.storageKeys.devJson, textarea.value || '');
        });

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-7 rounded-sm px-2 text-xs';
        applyBtn.textContent = 'Apply dev JSON';
        applyBtn.addEventListener('click', () => {
            const text = textarea.value || '';
            Storage.set(this.storageKeys.devJson, text);
            this.applyCachedWorkflow(state, { source: 'dev', jsonText: text });
        });

        wrapper.appendChild(label);
        wrapper.appendChild(textarea);
        wrapper.appendChild(applyBtn);

        return wrapper;
    },

    async applyCachedWorkflow(state, options) {
        if (state.applyInProgress) {
            Logger.warn('Workflow cache: apply already in progress');
            return;
        }

        const panel = this.findWorkflowPanel();
        const stableParent = this.findStableParent(panel);
        if (!panel || !stableParent) {
            Logger.warn('Workflow cache: cannot apply cache, workflow panel not found');
            return;
        }

        const toolPanelRoot = this.findToolPanelRoot();
        if (!toolPanelRoot) {
            if (!state.toolPanelMissingLogged) {
                Logger.warn('Workflow cache: tool panel not found');
                state.toolPanelMissingLogged = true;
            }
            return;
        }
        state.toolPanelMissingLogged = false;

        const applyBtn = panel.querySelector('[data-wf-apply-cache-btn="true"]');
        if (applyBtn) applyBtn.disabled = true;

        state.applyInProgress = true;
        Logger.info('Workflow cache: apply started');

        try {
            const entries = this.getEntriesForApply(state, options);
            if (!entries || entries.length === 0) {
                Logger.warn('Workflow cache: no cache entries to apply');
                return;
            }

            this.clearToolSearch(toolPanelRoot);

            const tabInfo = await this.buildToolTabMap(toolPanelRoot);
            if (!tabInfo || Object.keys(tabInfo.toolToTab).length === 0) {
                Logger.warn('Workflow cache: no tools found in tool panel');
                return;
            }

            const toolsContainer = stableParent.querySelector(':scope > ' + this.selectors.toolsContainer);
            await this.clearWorkflowTools(panel, toolsContainer);

            for (const entry of entries) {
                if (!entry || typeof entry !== 'object') {
                    Logger.warn('Workflow cache: invalid entry (not an object)');
                    continue;
                }
                const keys = Object.keys(entry);
                if (keys.length !== 1) {
                    Logger.warn('Workflow cache: invalid entry (expected single tool key)');
                    continue;
                }
                const toolName = keys[0].trim();
                if (!toolName) continue;
                const params = entry[toolName] || {};

                const tabName = tabInfo.toolToTab[toolName];
                if (!tabName) {
                    Logger.warn(`Workflow cache: tool not found in panel: ${toolName}`);
                    continue;
                }

                await this.switchToToolTab(tabInfo, tabName, toolPanelRoot);

                const callBtn = this.findToolCallButton(toolPanelRoot, toolName);
                if (!callBtn) {
                    Logger.warn(`Workflow cache: call button not found for ${toolName}`);
                    continue;
                }

                const currentContainer = stableParent.querySelector(':scope > ' + this.selectors.toolsContainer);
                const prevCount = currentContainer ? currentContainer.querySelectorAll(this.selectors.toolCard).length : 0;
                callBtn.click();

                const newCard = await this.waitForNewToolCard(stableParent, prevCount);
                if (!newCard) {
                    Logger.warn(`Workflow cache: tool card did not appear for ${toolName}`);
                    continue;
                }

                await this.applyParamsToCard(newCard, params);
            }

            Logger.info('Workflow cache: apply finished');
        } catch (e) {
            Logger.error('Workflow cache: apply failed', e);
        } finally {
            state.applyInProgress = false;
            if (applyBtn) applyBtn.disabled = false;
        }
    },

    getEntriesForApply(state, options) {
        if (options && options.source === 'dev') {
            const text = (options.jsonText || '').trim();
            if (!text) return [];
            try {
                const parsed = JSON.parse(text);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                Logger.error('Workflow cache: dev JSON parse failed', e);
                return [];
            }
        }

        if (state.workflowSnapshot && Array.isArray(state.workflowSnapshot)) {
            return state.workflowSnapshot;
        }

        const stored = Storage.get(this.storageKeys.latestSnapshot, '');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                Logger.error('Workflow cache: stored snapshot parse failed', e);
            }
        }

        return [];
    },

    findToolPanelRoot() {
        const input = document.querySelector(this.selectors.toolSearchInput);
        if (!input) return null;
        let el = input.parentElement;
        while (el && el !== document.body) {
            if (el.querySelector(this.selectors.toolTabList) || el.querySelector(this.selectors.toolListRoot)) {
                return el;
            }
            el = el.parentElement;
        }
        return input.closest('[data-panel-id][data-panel]') || input.closest('[data-panel]') || input.parentElement;
    },

    clearToolSearch(toolPanelRoot) {
        if (!toolPanelRoot) return;
        const input = toolPanelRoot.querySelector(this.selectors.toolSearchInput);
        if (!input) return;
        const clearBtn = toolPanelRoot.querySelector(this.selectors.toolClearButton);
        if (clearBtn && clearBtn.offsetParent !== null) {
            clearBtn.click();
            return;
        }
        this.setInputValue(input, '');
    },

    async buildToolTabMap(toolPanelRoot) {
        const toolToTab = {};
        const tabButtons = {};
        const tabList = toolPanelRoot.querySelector(this.selectors.toolTabList);
        const tabs = tabList ? Array.from(tabList.querySelectorAll(this.selectors.toolTab)) : [];

        Logger.debug('Workflow cache: buildToolTabMap found ' + tabs.length + ' tab(s)');

        if (!tabs.length) {
            const tools = this.readToolList(toolPanelRoot);
            Logger.debug('Workflow cache: single-env mode, indexed ' + tools.length + ' tools');
            tools.forEach(tool => {
                toolToTab[tool.name] = '(single)';
            });
            return { toolToTab, tabButtons };
        }

        const listRoot = toolPanelRoot.querySelector(this.selectors.toolListRoot);
        for (const tab of tabs) {
            const tabName = this.getTabLabel(tab);
            if (!tabName) continue;
            tabButtons[tabName] = tab;
            const prevNames = listRoot ? this.readToolNamesFromList(listRoot) : [];
            this.activateTab(tab);
            await this.waitForTabActive(tab);
            if (listRoot) {
                await this.waitForToolListChange(listRoot, prevNames);
            } else {
                await this.waitForAnimationFrame();
            }
            const tools = this.readToolList(toolPanelRoot);
            Logger.debug('Workflow cache: tab "' + tabName + '" has ' + tools.length + ' tools');
            tools.forEach(tool => {
                toolToTab[tool.name] = tabName;
            });
        }

        Logger.debug('Workflow cache: total indexed ' + Object.keys(toolToTab).length + ' tools across ' + tabs.length + ' tab(s)');
        return { toolToTab, tabButtons };
    },

    getTabLabel(tabBtn) {
        if (!tabBtn) return '';
        const countEl = tabBtn.querySelector('div.inline-flex.items-center.whitespace-nowrap.rounded-md.border');
        const countText = countEl ? countEl.textContent.trim() : '';
        let label = tabBtn.textContent.trim();
        if (countText) label = label.replace(countText, '').trim();
        return label;
    },

    activateTab(tabBtn) {
        if (!tabBtn) return;
        tabBtn.focus();
        tabBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
        tabBtn.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
    },

    async switchToToolTab(tabInfo, tabName, toolPanelRoot) {
        if (!tabInfo || !tabInfo.tabButtons || !tabInfo.tabButtons[tabName]) return;
        const tab = tabInfo.tabButtons[tabName];
        const listRoot = toolPanelRoot ? toolPanelRoot.querySelector(this.selectors.toolListRoot) : null;
        const prevNames = listRoot ? this.readToolNamesFromList(listRoot) : [];
        this.activateTab(tab);
        await this.waitForTabActive(tab);
        if (listRoot) {
            await this.waitForToolListChange(listRoot, prevNames);
        } else {
            await this.waitForAnimationFrame();
        }
    },

    readToolList(toolPanelRoot) {
        const listRoot = toolPanelRoot.querySelector(this.selectors.toolListRoot);
        if (!listRoot) return [];
        const items = Array.from(listRoot.querySelectorAll(this.selectors.toolListItem));
        const tools = [];
        for (const item of items) {
            const name = this.getToolNameFromListItem(item);
            if (!name) continue;
            tools.push({ name, item });
        }
        return tools;
    },

    getToolNameFromListItem(item) {
        const primary = item.querySelector('span.text-xs.font-medium.text-foreground span span');
        const fallback = item.querySelector('span.text-xs.font-medium.text-foreground');
        const text = primary ? primary.textContent : (fallback ? fallback.textContent : item.textContent);
        return this.normalizeToolName(text);
    },

    findToolCallButton(toolPanelRoot, toolName) {
        const listRoot = toolPanelRoot.querySelector(this.selectors.toolListRoot);
        if (!listRoot) return null;
        const items = Array.from(listRoot.querySelectorAll(this.selectors.toolListItem));
        const target = this.normalizeToolName(toolName);
        for (const item of items) {
            const name = this.getToolNameFromListItem(item);
            if (!name || name !== target) continue;
            const btns = Array.from(item.querySelectorAll('button'));
            return btns.find(btn => btn.textContent.trim() === 'Call') || null;
        }
        return null;
    },

    normalizeToolName(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    },

    readToolNamesFromList(listRoot) {
        const items = Array.from(listRoot.querySelectorAll(this.selectors.toolListItem));
        return items.map(item => this.getToolNameFromListItem(item)).filter(Boolean);
    },

    waitForTabActive(tabBtn, timeoutMs = 50) {
        if (!tabBtn) return Promise.resolve(false);
        const isActive = () =>
            tabBtn.getAttribute('data-state') === 'active' ||
            tabBtn.getAttribute('aria-selected') === 'true';
        if (isActive()) return Promise.resolve(true);
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                if (isActive()) {
                    observer.disconnect();
                    resolve(true);
                }
            });
            observer.observe(tabBtn, { attributes: true, attributeFilter: ['data-state', 'aria-selected'] });
            setTimeout(() => {
                observer.disconnect();
                resolve(isActive());
            }, timeoutMs);
        });
    },

    waitForToolListChange(listRoot, prevNames, timeoutMs = 50) {
        if (!listRoot) return Promise.resolve(false);
        const prevKey = (prevNames || []).join('|');
        const isChanged = () => this.readToolNamesFromList(listRoot).join('|') !== prevKey;
        if (isChanged()) return Promise.resolve(true);
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                if (isChanged()) {
                    observer.disconnect();
                    resolve(true);
                }
            });
            observer.observe(listRoot, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(isChanged());
            }, timeoutMs);
        });
    },

    async clearWorkflowTools(panel, toolsContainer) {
        if (!toolsContainer) {
            Logger.debug('Workflow cache: no workflow container (empty), skip clear');
            return;
        }
        const toolbar = panel.querySelector(this.selectors.workflowToolbar);
        if (!toolbar) return;
        const clearBtn = Array.from(toolbar.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Clear');
        if (!clearBtn) return;
        clearBtn.click();
        await this.waitForContainerEmpty(toolsContainer);
        Logger.info('Workflow cache: workflow cleared');
    },

    async waitForContainerEmpty(container, timeoutMs = 50) {
        if (!container) return true;
        const existing = container.querySelectorAll(this.selectors.toolCard);
        if (existing.length === 0) return true;

        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const remaining = container.querySelectorAll(this.selectors.toolCard);
                if (remaining.length === 0) {
                    observer.disconnect();
                    resolve(true);
                }
            });
            observer.observe(container, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(false);
            }, timeoutMs);
        });
    },

    async waitForNewToolCard(stableParent, previousCount, timeoutMs = 50) {
        if (!stableParent) return null;
        const container = stableParent.querySelector(':scope > ' + this.selectors.toolsContainer);
        if (container) {
            const cards = container.querySelectorAll(this.selectors.toolCard);
            if (cards.length > previousCount) {
                return cards[cards.length - 1] || null;
            }
        }

        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const c = stableParent.querySelector(':scope > ' + this.selectors.toolsContainer);
                if (!c) return;
                const updated = c.querySelectorAll(this.selectors.toolCard);
                if (updated.length > previousCount) {
                    observer.disconnect();
                    resolve(updated[updated.length - 1] || null);
                }
            });
            observer.observe(stableParent, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeoutMs);
        });
    },

    async applyParamsToCard(card, entry) {
        if (!card || !entry) return;
        this.ensureCardExpanded(card);

        const content = card.querySelector('div[data-state="open"] div.px-3.pb-3.space-y-3');
        if (!content) return;
        const spaceY3 = content.querySelector('div.space-y-3');
        if (!spaceY3) return;

        const blocks = Array.from(spaceY3.children).filter(el => el.nodeType === Node.ELEMENT_NODE && el.matches && el.matches('div.flex.flex-col.gap-1\\.5'));
        const blockMap = {};
        for (const block of blocks) {
            const name = this.getParamNameFromBlock(block);
            if (name) blockMap[name] = block;
        }

        for (const key of Object.keys(entry)) {
            const block = blockMap[key];
            if (!block) {
                Logger.warn(`Workflow cache: parameter not found: ${key}`);
                continue;
            }
            const typeLabel = this.getParamTypeFromBlock(block);
            await this.applyValueToBlock(block, typeLabel, entry[key]);
        }
    },

    ensureCardExpanded(card) {
        const openContent = card.querySelector('div[data-state="open"]');
        if (openContent) return;
        const header = card.querySelector(this.selectors.toolHeader);
        if (header) header.click();
    },

    async applyValueToBlock(block, typeLabel, value) {
        if (!typeLabel) {
            await this.applyValueToBlockInferred(block, value);
            return;
        }

        if (typeLabel === 'object') {
            if (!value || typeof value !== 'object') return;
            const innerBlocks = this.getNestedBlocksFromObjectBlock(block);
            if (!innerBlocks.length) {
                const input = block.querySelector('input[type="text"]');
                const textarea = block.querySelector('textarea');
                const textValue = (value === null || value === undefined) ? '' : (typeof value === 'string' ? value : JSON.stringify(value));
                if (input) this.setInputValue(input, textValue);
                else if (textarea) this.setInputValue(textarea, textValue);
                return;
            }
            const innerMap = {};
            innerBlocks.forEach(innerBlock => {
                const name = this.getParamNameFromBlock(innerBlock);
                if (name) innerMap[name] = innerBlock;
            });
            for (const key of Object.keys(value)) {
                const innerBlock = innerMap[key];
                if (!innerBlock) continue;
                const innerType = this.getParamTypeFromBlock(innerBlock);
                await this.applyValueToBlock(innerBlock, innerType, value[key]);
            }
            return;
        }

        if (typeLabel === 'string') {
            const input = block.querySelector('input[type="text"]');
            const textarea = block.querySelector('textarea');
            const textValue = (value === null || value === undefined) ? '' : (typeof value === 'string' ? value : JSON.stringify(value));
            if (input) this.setInputValue(input, textValue);
            else if (textarea) this.setInputValue(textarea, textValue);
            return;
        }

        if (typeLabel === 'integer' || typeLabel === 'number') {
            const input = block.querySelector('input[type="number"]');
            if (!input) return;
            const numValue = (value === null || value === undefined) ? '' : String(value);
            this.setInputValue(input, numValue);
            return;
        }

        if (typeLabel === 'boolean') {
            const btn = block.querySelector('button[role="checkbox"]');
            if (!btn) return;
            const isChecked = btn.getAttribute('data-state') === 'checked' || btn.getAttribute('aria-checked') === 'true';
            const target = !!value;
            if (target !== isChecked) btn.click();
            return;
        }

        if (typeLabel === 'enum') {
            const btn = block.querySelector('button[role="combobox"]');
            if (!btn) return;
            await this.selectComboboxOption(btn, value);
            return;
        }

        if (typeLabel === 'enum[]' || typeLabel.includes('enum[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1');
            if (!wrap || !Array.isArray(value)) return;
            await this.ensureArrayItems(wrap, value.length);
            const combos = Array.from(wrap.querySelectorAll('button[role="combobox"]'));
            for (let i = 0; i < value.length; i++) {
                await this.selectComboboxOption(combos[i], value[i]);
            }
            return;
        }

        if (typeLabel === 'string[]' || typeLabel.includes('string[]') || typeLabel === 'any[]' || typeLabel.includes('any[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1');
            if (!wrap || !Array.isArray(value)) return;
            await this.ensureArrayItems(wrap, value.length);
            const inputs = Array.from(wrap.querySelectorAll('div.flex.items-center.gap-2 input[type="text"]'));
            for (let i = 0; i < value.length; i++) {
                if (inputs[i]) this.setInputValue(inputs[i], value[i]);
            }
            return;
        }

        if (typeLabel === 'object[]' || typeLabel.includes('object[]')) {
            const wrap = block.querySelector('div.space-y-2.mt-1') || block;
            if (!Array.isArray(value)) return;
            await this.ensureArrayItems(wrap, value.length);
            const items = Array.from(wrap.children).filter(el => el.nodeType === Node.ELEMENT_NODE && el.matches && el.matches('div.relative.border.rounded-md.p-3[class*="bg-muted"]'));
            for (let i = 0; i < value.length; i++) {
                const item = items[i];
                const obj = value[i];
                if (!item || !obj || typeof obj !== 'object') continue;
                const innerBlocks = this.getNestedBlocksFromObjectItem(item);
                const innerMap = {};
                innerBlocks.forEach(innerBlock => {
                    const name = this.getParamNameFromBlock(innerBlock);
                    if (name) innerMap[name] = innerBlock;
                });
                for (const key of Object.keys(obj)) {
                    const innerBlock = innerMap[key];
                    if (!innerBlock) continue;
                    const innerType = this.getParamTypeFromBlock(innerBlock);
                    await this.applyValueToBlock(innerBlock, innerType, obj[key]);
                }
            }
            return;
        }
    },

    async ensureArrayItems(wrap, count) {
        if (!wrap || count <= 0) return;
        const addBtn = Array.from(wrap.querySelectorAll('button')).find(btn => btn.textContent.trim().startsWith('Add '));
        if (!addBtn) return;

        const getItemCount = () => {
            const inputs = wrap.querySelectorAll('input[type="text"], button[role="combobox"], div.relative.border.rounded-md.p-3');
            return inputs.length;
        };

        let current = getItemCount();
        while (current < count) {
            addBtn.click();
            await this.waitForAnimationFrame();
            current = getItemCount();
        }
    },

    async selectComboboxOption(btn, value) {
        if (!btn || value === undefined || value === null) return;
        const desired = String(value).trim();
        if (!desired) return;
        btn.focus();
        await this.wait(10);
        await this.pressKey(btn, 'Enter');
        await this.wait(25);
        const listbox = await this.waitForListbox(btn, 500);
        if (!listbox) return;
        await this.wait(10);
        const options = Array.from(listbox.querySelectorAll('[role="option"]'));
        const norm = (s) => (s || '').trim().replace(/\s+/g, ' ');
        let targetIndex = options.findIndex(opt => norm(opt.textContent) === norm(desired));
        if (targetIndex < 0) targetIndex = options.findIndex(opt => norm(opt.textContent).toLowerCase() === norm(desired).toLowerCase());
        if (targetIndex < 0) return;
        let currentIndex = this.getHighlightedOptionIndex(listbox);
        if (currentIndex < 0) currentIndex = 0;
        let keyTarget = document.activeElement;
        const delta = targetIndex - currentIndex;
        for (let k = 0; k < Math.abs(delta); k++) {
            await this.pressKey(keyTarget, delta > 0 ? 'ArrowDown' : 'ArrowUp');
            await this.wait(10);
            keyTarget = document.activeElement;
        }
        await this.pressKey(document.activeElement, 'Enter');
    },

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    waitForListbox(dropdown, maxWaitMs = 500) {
        const id = dropdown?.getAttribute('aria-controls');
        if (!id) return Promise.resolve(null);
        const start = Date.now();
        const poll = () => {
            const el = document.getElementById(id);
            if (el) return Promise.resolve(el);
            if (Date.now() - start >= maxWaitMs) return Promise.resolve(null);
            return this.wait(5).then(poll);
        };
        return poll();
    },

    async pressKey(target, key) {
        if (!target) return;
        const code = key === 'Enter' ? 'Enter' : key === 'ArrowDown' ? 'ArrowDown' : key === 'ArrowUp' ? 'ArrowUp' : key === 'Escape' ? 'Escape' : key;
        target.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }));
        await this.wait(2);
        target.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true, cancelable: true }));
    },

    getHighlightedOptionIndex(listbox) {
        if (!listbox) return -1;
        const options = Array.from(listbox.querySelectorAll('[role="option"]'));
        const idx = options.findIndex(opt => opt.hasAttribute('data-highlighted') || opt.getAttribute('aria-selected') === 'true');
        return idx >= 0 ? idx : -1;
    },

    waitForElementById(id, timeoutMs = 50) {
        const existing = document.getElementById(id);
        if (existing) return Promise.resolve(existing);
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const el = document.getElementById(id);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeoutMs);
        });
    },

    waitForAnimationFrame() {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
    },

    setInputValue(el, value) {
        const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    },

    attachParentObserver(stableParent, state) {
        const self = this;
        const parentObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node && node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(self.selectors.toolsContainer)) {
                        if (node.parentElement === stableParent && node !== state.observedContainer) {
                            self.attachContainerObservers(node, state);
                            state.observedContainer = node;
                            Logger.info('Workflow cache: observing workflow');
                        }
                        return;
                    }
                }
                for (const node of m.removedNodes) {
                    if (node === state.observedContainer) {
                        self.disconnectContainerObservers(state);
                        Logger.info('Workflow cache: all tools removed');
                        return;
                    }
                }
            }
        });

        parentObserver.observe(stableParent, {
            childList: true,
            subtree: false
        });
        state.parentObserver = parentObserver;
    },

    attachContainerObservers(container, state) {
        this.disconnectContainerObservers(state);

        const self = this;
        const toolCardSelector = this.selectors.toolCard;

        const isToolCardOrWrapper = (node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE || !node.matches) return false;
            return node.matches(toolCardSelector) || node.querySelector(toolCardSelector);
        };

        const childListObserver = new MutationObserver((mutations) => {
            if (state.applyInProgress) return;
            let added = false;
            let removed = false;
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (isToolCardOrWrapper(node)) {
                        added = true;
                        break;
                    }
                }
                for (const node of m.removedNodes) {
                    if (isToolCardOrWrapper(node)) {
                        removed = true;
                        break;
                    }
                }
                if (added || removed) break;
            }
            if (added) {
                Logger.info('Workflow cache: tool added');
                self.captureAndSaveSnapshot(state, 'add');
            }
            if (removed) {
                Logger.info('Workflow cache: tool deleted');
                self.savePreviousSnapshot(state, 'pre-delete');
            }
        });

        childListObserver.observe(container, {
            childList: true,
            subtree: true
        });
        state.containerObservers.push(childListObserver);

        const classObserver = new MutationObserver((mutations) => {
            if (state.applyInProgress) return;
            for (const m of mutations) {
                const target = m.target;
                if (!target || target.nodeType !== Node.ELEMENT_NODE || !target.matches || !target.matches(toolCardSelector)) {
                    continue;
                }
                if (!container.contains(target)) continue;
                const hasSuccess = target.classList.contains('border-emerald-500/50');
                const hasError = target.classList.contains('border-red-500/50');
                if (hasSuccess || hasError) {
                    const outcome = hasError ? 'error' : 'success';
                    Logger.info('Workflow cache: tool executed (' + outcome + ')');
                    self.captureAndSaveSnapshot(state, 'execute');
                    break;
                }
            }
        });

        classObserver.observe(container, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
        state.containerObservers.push(classObserver);
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

        const knownPanel = document.querySelector('[id=":rs:"][data-panel]');
        if (knownPanel) {
            const toolbar = knownPanel.querySelector('.border-b.h-9');
            if (toolbar) {
                const workflowText = Array.from(toolbar.querySelectorAll('span')).find(
                    span => span.textContent.trim() === 'Workflow'
                );
                if (workflowText) {
                    return knownPanel;
                }
            }
        }

        return null;
    },

    findStableParent(panel) {
        if (!panel) return null;
        const scrollables = panel.querySelectorAll('.overflow-y-auto');
        for (const scrollable of scrollables) {
            const stable = scrollable.querySelector(this.selectors.stableParent);
            if (stable) return stable;
        }
        return null;
    }
};
