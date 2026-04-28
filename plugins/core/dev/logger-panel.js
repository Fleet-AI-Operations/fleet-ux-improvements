// logger-panel.js
// Floating panel that shows only script logs

const plugin = {
    id: 'dev-logger-panel',
    name: 'Dev Logger Panel',
    description: 'Floating panel to view Fleet UX Enhancer logs',
    _version: '2.10',
    enabledByDefault: true,
    phase: 'core',

    storageKeys: {
        positionLeft: 'dev-logger-position-left',
        positionTop: 'dev-logger-position-top',
        width: 'dev-logger-width',
        height: 'dev-logger-height',
        isVisible: 'dev-logger-is-visible'
    },

    initialState: {
        initialized: false,
        logs: [],
        maxLogs: 500,
        isVisible: true,
        isDragging: false,
        isResizing: false,
        dragOffsetX: 0,
        dragOffsetY: 0,
        resizeStartX: 0,
        resizeStartY: 0,
        resizeStartWidth: 0,
        resizeStartHeight: 0,
        searchQuery: '',
        originalConsole: null,
        unsubscribe: null,
        guardInterval: null,
        ui: null,
        handlers: null,
        newLogCount: 0,
        isAtBottom: true
    },

    init(state, context) {
        if (!state.initialized) {
            state.initialized = true;
            // Load saved visibility state
            state.isVisible = Storage.get(this.storageKeys.isVisible, true);
            this._setupLogging(state, context);
            Logger.log('✓ Dev logger panel initialized');
        }

        this._ensureUI(state, context);
        this._startPresenceGuard(state, context);
    },

    _startPresenceGuard(state, context) {
        if (state.guardInterval) return;
        state.guardInterval = setInterval(() => {
            this._ensureUI(state, context);
        }, 1000);
    },

    _ensureUI(state, context) {
        if (!document.body) return;
        const rootPresent = state.ui && state.ui.root && document.body.contains(state.ui.root);
        const togglePresent = state.ui && state.ui.toggleButton && document.body.contains(state.ui.toggleButton);
        if (rootPresent && togglePresent) return;

        this._teardownUI(state);
        state.ui = this._buildUI(state, context);
        this._ensureHandlers(state);
        this._bindUI(state);
        this._renderLogs(state);
        this._updateVisibility(state, state.isVisible);
    },

    _buildUI(state, context) {
        // Load saved position, size, and visibility
        const savedLeft = Storage.get(this.storageKeys.positionLeft, null);
        const savedTop = Storage.get(this.storageKeys.positionTop, null);
        const savedWidth = Storage.get(this.storageKeys.width, 360);
        const savedHeight = Storage.get(this.storageKeys.height, 240);

        const root = document.createElement('div');
        root.id = 'wf-dev-log-panel';
        root.style.position = 'fixed';
        
        // Apply saved position or default to right/bottom
        if (savedLeft !== null && savedTop !== null) {
            root.style.left = `${savedLeft}px`;
            root.style.top = `${savedTop}px`;
            root.style.right = 'auto';
            root.style.bottom = 'auto';
        } else {
            root.style.right = '24px';
            root.style.bottom = '80px';
        }
        
        root.style.width = `${savedWidth}px`;
        root.style.height = `${savedHeight}px`;
        root.style.background = 'rgba(16, 18, 24, 0.95)';
        root.style.color = '#e5e7eb';
        root.style.border = '1px solid rgba(255,255,255,0.12)';
        root.style.borderRadius = '10px';
        root.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
        root.style.display = 'flex';
        root.style.flexDirection = 'column';
        root.style.zIndex = '2147483646';
        root.style.resize = 'none';
        root.style.overflow = 'auto';
        root.style.minWidth = '240px';
        root.style.minHeight = '140px';

        const header = document.createElement('div');
        header.id = 'wf-dev-log-panel-header';
        header.style.flex = '0 0 auto';
        header.style.padding = '6px 10px';
        header.style.fontSize = '12px';
        header.style.fontWeight = '600';
        header.style.background = 'rgba(255,255,255,0.06)';
        header.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        header.style.cursor = 'move';
        header.style.userSelect = 'none';
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';

        const headerTitle = document.createElement('span');
        headerTitle.textContent = 'Fleet UX Logs';

        const headerActions = document.createElement('div');
        headerActions.style.display = 'flex';
        headerActions.style.gap = '6px';

        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.textContent = 'Clear';
        clearButton.style.fontSize = '11px';
        clearButton.style.padding = '2px 6px';
        clearButton.style.borderRadius = '6px';
        clearButton.style.border = '1px solid rgba(255,255,255,0.2)';
        clearButton.style.background = 'transparent';
        clearButton.style.color = 'inherit';
        clearButton.style.cursor = 'pointer';

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.textContent = 'Copy';
        copyButton.style.fontSize = '11px';
        copyButton.style.padding = '2px 6px';
        copyButton.style.borderRadius = '6px';
        copyButton.style.border = '1px solid rgba(255,255,255,0.2)';
        copyButton.style.background = 'transparent';
        copyButton.style.color = 'inherit';
        copyButton.style.cursor = 'pointer';

        const refreshButton = document.createElement('button');
        refreshButton.type = 'button';
        refreshButton.textContent = 'Refresh';
        refreshButton.title = 'Reload the page';
        refreshButton.style.fontSize = '11px';
        refreshButton.style.padding = '2px 6px';
        refreshButton.style.borderRadius = '6px';
        refreshButton.style.border = '1px solid rgba(255,255,255,0.2)';
        refreshButton.style.background = 'transparent';
        refreshButton.style.color = 'inherit';
        refreshButton.style.cursor = 'pointer';

        const minimizeButton = document.createElement('button');
        minimizeButton.type = 'button';
        minimizeButton.textContent = 'Minimize';
        minimizeButton.style.fontSize = '11px';
        minimizeButton.style.padding = '2px 6px';
        minimizeButton.style.borderRadius = '6px';
        minimizeButton.style.border = '1px solid rgba(255,255,255,0.2)';
        minimizeButton.style.background = 'transparent';
        minimizeButton.style.color = 'inherit';
        minimizeButton.style.cursor = 'pointer';

        const searchWrap = document.createElement('div');
        searchWrap.style.flex = '0 0 auto';
        searchWrap.style.padding = '6px 10px';
        searchWrap.style.borderBottom = '1px solid rgba(255,255,255,0.08)';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search logs...';
        searchInput.style.width = '100%';
        searchInput.style.fontSize = '11px';
        searchInput.style.padding = '6px 8px';
        searchInput.style.borderRadius = '6px';
        searchInput.style.border = '1px solid rgba(255,255,255,0.2)';
        searchInput.style.background = 'rgba(15, 23, 42, 0.6)';
        searchInput.style.color = '#e5e7eb';
        searchInput.style.outline = 'none';

        searchWrap.appendChild(searchInput);

        const bodyWrapper = document.createElement('div');
        bodyWrapper.id = 'wf-dev-log-panel-body-wrapper';
        bodyWrapper.style.flex = '1 1 auto';
        bodyWrapper.style.minHeight = '0';
        bodyWrapper.style.display = 'flex';
        bodyWrapper.style.flexDirection = 'column';
        bodyWrapper.style.overflow = 'hidden';

        const body = document.createElement('div');
        body.id = 'wf-dev-log-panel-body';
        body.style.flex = '1 1 auto';
        body.style.minHeight = '0';
        body.style.overflow = 'auto';
        body.style.padding = '8px';
        body.style.fontSize = '11px';
        body.style.lineHeight = '1.4';
        body.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

        const newLogIndicator = document.createElement('div');
        newLogIndicator.id = 'wf-dev-log-new-indicator';
        newLogIndicator.style.flex = '0 0 auto';
        newLogIndicator.style.background = 'rgba(59, 130, 246, 0.9)';
        newLogIndicator.style.color = '#ffffff';
        newLogIndicator.style.padding = '6px 10px';
        newLogIndicator.style.borderRadius = '0 0 10px 10px';
        newLogIndicator.style.fontSize = '11px';
        newLogIndicator.style.fontWeight = '500';
        newLogIndicator.style.cursor = 'pointer';
        newLogIndicator.style.boxShadow = '0 -2px 8px rgba(0,0,0,0.2)';
        newLogIndicator.style.alignItems = 'center';
        newLogIndicator.style.justifyContent = 'space-between';
        newLogIndicator.style.gap = '8px';
        newLogIndicator.style.display = 'none';

        const newLogText = document.createElement('span');
        newLogText.id = 'wf-dev-log-new-text';
        newLogText.textContent = '0 new';

        const scrollToBottomButton = document.createElement('button');
        scrollToBottomButton.type = 'button';
        scrollToBottomButton.textContent = '↓ Scroll to bottom';
        scrollToBottomButton.style.fontSize = '10px';
        scrollToBottomButton.style.padding = '4px 8px';
        scrollToBottomButton.style.borderRadius = '4px';
        scrollToBottomButton.style.border = '1px solid rgba(255,255,255,0.3)';
        scrollToBottomButton.style.background = 'rgba(255,255,255,0.2)';
        scrollToBottomButton.style.color = '#ffffff';
        scrollToBottomButton.style.cursor = 'pointer';
        scrollToBottomButton.style.fontWeight = '500';

        newLogIndicator.appendChild(newLogText);
        newLogIndicator.appendChild(scrollToBottomButton);
        bodyWrapper.appendChild(body);
        bodyWrapper.appendChild(newLogIndicator);

        const toggleButton = document.createElement('button');
        toggleButton.id = 'wf-dev-log-toggle';
        toggleButton.type = 'button';
        toggleButton.textContent = 'Hide Logs';
        toggleButton.style.position = 'fixed';
        toggleButton.style.left = '20px';
        toggleButton.style.bottom = '78px';
        toggleButton.style.zIndex = '2147483646';
        toggleButton.style.padding = '6px 10px';
        toggleButton.style.fontSize = '12px';
        toggleButton.style.borderRadius = '10px';
        toggleButton.style.border = '1px solid rgba(0,0,0,0.2)';
        toggleButton.style.background = '#111827';
        toggleButton.style.color = '#f9fafb';
        toggleButton.style.cursor = 'pointer';
        toggleButton.style.boxShadow = '0 6px 18px rgba(0,0,0,0.35)';

        const resizeHandle = document.createElement('div');
        resizeHandle.style.position = 'absolute';
        resizeHandle.style.right = '2px';
        resizeHandle.style.bottom = '2px';
        resizeHandle.style.width = '14px';
        resizeHandle.style.height = '14px';
        resizeHandle.style.cursor = 'se-resize';
        resizeHandle.style.background = 'transparent';
        resizeHandle.style.borderRight = '2px solid rgba(255,255,255,0.25)';
        resizeHandle.style.borderBottom = '2px solid rgba(255,255,255,0.25)';
        resizeHandle.style.borderRadius = '0 0 8px 0';

        headerActions.appendChild(clearButton);
        headerActions.appendChild(copyButton);
        headerActions.appendChild(refreshButton);
        headerActions.appendChild(minimizeButton);
        header.appendChild(headerTitle);
        header.appendChild(headerActions);
        root.appendChild(header);
        root.appendChild(searchWrap);
        root.appendChild(bodyWrapper);
        root.appendChild(resizeHandle);

        document.body.appendChild(root);
        document.body.appendChild(toggleButton);

        // If we don't have saved position, convert right/bottom to left/top after first render
        if (savedLeft === null || savedTop === null) {
            requestAnimationFrame(() => {
                const rect = root.getBoundingClientRect();
                root.style.left = `${rect.left}px`;
                root.style.top = `${rect.top}px`;
                root.style.right = 'auto';
                root.style.bottom = 'auto';
                // Save the converted position
                Storage.set(this.storageKeys.positionLeft, rect.left);
                Storage.set(this.storageKeys.positionTop, rect.top);
            });
        }

        return {
            root,
            header,
            headerActions,
            clearButton,
            copyButton,
            refreshButton,
            minimizeButton,
            searchInput,
            bodyWrapper,
            body,
            toggleButton,
            resizeHandle,
            newLogIndicator,
            newLogText,
            scrollToBottomButton
        };
    },

    _ensureHandlers(state) {
        if (state.handlers) return;
        state.handlers = {
            onMouseDown: (event) => {
                const ui = state.ui;
                if (!ui) return;
                if (event.button !== 0) return;
                if (event.target === ui.clearButton || ui.headerActions.contains(event.target)) return;
                if (event.target !== ui.header && !ui.header.contains(event.target)) return;
                state.isDragging = true;
                const rect = ui.root.getBoundingClientRect();
                state.dragOffsetX = event.clientX - rect.left;
                state.dragOffsetY = event.clientY - rect.top;
            },
            onMouseMove: (event) => {
                if (!state.isDragging) return;
                const ui = state.ui;
                if (!ui) return;
                const nextLeft = Math.max(8, event.clientX - state.dragOffsetX);
                const nextTop = Math.max(8, event.clientY - state.dragOffsetY);
                ui.root.style.left = `${nextLeft}px`;
                ui.root.style.top = `${nextTop}px`;
                ui.root.style.right = 'auto';
                ui.root.style.bottom = 'auto';
            },
            onMouseUp: () => {
                const ui = state.ui;
                if (state.isDragging && ui) {
                    // Save position when dragging ends
                    const rect = ui.root.getBoundingClientRect();
                    Storage.set(this.storageKeys.positionLeft, rect.left);
                    Storage.set(this.storageKeys.positionTop, rect.top);
                    Logger.log(`✓ Dev logger position saved: left=${rect.left}, top=${rect.top}`);
                }
                if (state.isResizing && ui) {
                    // Save size when resizing ends
                    const rect = ui.root.getBoundingClientRect();
                    Storage.set(this.storageKeys.width, rect.width);
                    Storage.set(this.storageKeys.height, rect.height);
                    Logger.log(`✓ Dev logger size saved: width=${rect.width}, height=${rect.height}`);
                }
                state.isDragging = false;
                state.isResizing = false;
                if (document.body) {
                    document.body.style.userSelect = '';
                }
            },
            onResizeMove: (event) => {
                if (!state.isResizing) return;
                const ui = state.ui;
                if (!ui) return;
                const nextWidth = Math.max(240, state.resizeStartWidth + (event.clientX - state.resizeStartX));
                const nextHeight = Math.max(140, state.resizeStartHeight + (event.clientY - state.resizeStartY));
                ui.root.style.width = `${nextWidth}px`;
                ui.root.style.height = `${nextHeight}px`;
            },
            onToggle: () => this._updateVisibility(state, !state.isVisible),
            onClear: () => this._clearLogs(state),
            onCopyAll: () => {
                void this._copyAll(state);
            },
            onMinimize: () => this._updateVisibility(state, false),
            onRefresh: () => {
                Logger.log('✓ Dev logger: refresh page requested');
                window.location.reload();
            },
            onSearch: (event) => {
                state.searchQuery = event.target.value.trim().toLowerCase();
                this._applySearchFilter(state);
            },
            onResizeStart: (event) => {
                const ui = state.ui;
                if (!ui) return;
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                state.isResizing = true;
                const rect = ui.root.getBoundingClientRect();
                state.resizeStartX = event.clientX;
                state.resizeStartY = event.clientY;
                state.resizeStartWidth = rect.width;
                state.resizeStartHeight = rect.height;
                if (document.body) {
                    document.body.style.userSelect = 'none';
                }
            },
            onScroll: () => {
                this._checkScrollPosition(state);
            },
            onScrollToBottom: (event) => {
                if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                this._scrollToBottom(state);
            }
        };

        document.addEventListener('mousemove', state.handlers.onMouseMove);
        document.addEventListener('mousemove', state.handlers.onResizeMove);
        document.addEventListener('mouseup', state.handlers.onMouseUp);
    },

    _bindUI(state) {
        const ui = state.ui;
        if (!ui || !state.handlers) return;
        ui.header.addEventListener('mousedown', state.handlers.onMouseDown);
        ui.toggleButton.addEventListener('click', state.handlers.onToggle);
        ui.clearButton.addEventListener('click', state.handlers.onClear);
        ui.copyButton.addEventListener('click', state.handlers.onCopyAll);
        ui.refreshButton.addEventListener('click', state.handlers.onRefresh);
        ui.minimizeButton.addEventListener('click', state.handlers.onMinimize);
        ui.searchInput.addEventListener('input', state.handlers.onSearch);
        ui.resizeHandle.addEventListener('mousedown', state.handlers.onResizeStart);
        ui.body.addEventListener('scroll', state.handlers.onScroll);
        ui.scrollToBottomButton.addEventListener('click', state.handlers.onScrollToBottom);
        ui.newLogIndicator.addEventListener('click', state.handlers.onScrollToBottom);
    },

    _teardownUI(state) {
        if (!state.ui) return;
        if (state.ui.root && state.ui.root.parentNode) {
            state.ui.root.parentNode.removeChild(state.ui.root);
        }
        if (state.ui.toggleButton && state.ui.toggleButton.parentNode) {
            state.ui.toggleButton.parentNode.removeChild(state.ui.toggleButton);
        }
        state.ui = null;
    },

    _updateVisibility(state, visible) {
        state.isVisible = visible;
        Storage.set(this.storageKeys.isVisible, visible);
        const ui = state.ui;
        if (!ui) return;
        ui.root.style.display = visible ? 'flex' : 'none';
        ui.toggleButton.textContent = visible ? 'Hide Logs' : 'Show Logs';
        Logger.log(`✓ Dev logger visibility ${visible ? 'shown' : 'hidden'}`);
    },

    _applySearchFilter(state) {
        state.logs.forEach((log) => {
            if (!log.node) return;
            const matches = !state.searchQuery || log.text.toLowerCase().includes(state.searchQuery);
            log.node.style.display = matches ? 'block' : 'none';
        });
    },

    _renderLogs(state) {
        const ui = state.ui;
        if (!ui) return;
        const wasAtBottom = this._isAtBottom(state);
        ui.body.innerHTML = '';

        state.logs.forEach((log) => {
            const level = log.level || 'log';
            const entry = this._createLogNode(level, log.text);
            log.node = entry;
            ui.body.appendChild(entry);
        });
        this._applySearchFilter(state);

        // Only auto-scroll if already at bottom
        if (wasAtBottom) {
            ui.body.scrollTop = ui.body.scrollHeight;
            state.isAtBottom = true;
        } else {
            state.isAtBottom = false;
        }
        this._updateNewLogIndicator(state);
    },

    _createLogNode(level, message) {
        const entry = document.createElement('div');
        entry.style.marginBottom = '4px';
        entry.style.whiteSpace = 'pre-wrap';
        entry.style.wordBreak = 'break-word';

        if (level === 'error') entry.style.color = '#fca5a5';
        if (level === 'warn') entry.style.color = '#facc15';
        if (level === 'debug') entry.style.color = '#93c5fd';
        if (level === 'info') entry.style.color = '#6ee7b7';

        entry.textContent = message;
        entry.style.borderRadius = '6px';
        entry.style.padding = '2px 4px';
        entry.style.cursor = 'pointer';

        entry.addEventListener('mouseenter', () => {
            entry.style.background = 'rgba(255,255,255,0.08)';
        });
        entry.addEventListener('mouseleave', () => {
            entry.style.background = 'transparent';
        });
        entry.addEventListener('click', () => {
            void (async () => {
                const ok = await this._copyToClipboard(message);
                this._flashDevLoggerCopyFeedback(entry, ok);
            })();
        });

        return entry;
    },

    _appendLogEntry(state, level, message) {
        const logRecord = { text: message, level: level };
        state.logs.push(logRecord);
        if (state.logs.length > state.maxLogs) {
            const old = state.logs.shift();
            if (old && old.node && old.node.parentNode) {
                old.node.parentNode.removeChild(old.node);
            }
        }

        const ui = state.ui;
        if (!ui) return;
        const entry = this._createLogNode(level, message);
        logRecord.node = entry;
        ui.body.appendChild(entry);

        if (state.searchQuery) {
            const matches = logRecord.text.toLowerCase().includes(state.searchQuery);
            entry.style.display = matches ? 'block' : 'none';
        }

        // Only auto-scroll if we are in auto-scroll mode (set true initially; flipped by user scroll)
        if (state.isAtBottom) {
            ui.body.scrollTop = ui.body.scrollHeight;
            state.isAtBottom = true;
            state.newLogCount = 0;
        } else {
            state.newLogCount++;
            state.isAtBottom = false;
        }
        this._updateNewLogIndicator(state);
    },

    _isAtBottom(state) {
        const ui = state.ui;
        if (!ui || !ui.body) return true;
        const body = ui.body;
        const threshold = 5; // pixels threshold for "at bottom"
        return body.scrollHeight - body.scrollTop - body.clientHeight <= threshold;
    },

    _checkScrollPosition(state) {
        const wasAtBottom = state.isAtBottom;
        state.isAtBottom = this._isAtBottom(state);
        
        // If user scrolled to bottom, clear new log count
        if (state.isAtBottom && !wasAtBottom) {
            state.newLogCount = 0;
            this._updateNewLogIndicator(state);
        }
    },

    _scrollToBottom(state) {
        const ui = state.ui;
        if (!ui || !ui.body) return;
        ui.body.scrollTop = ui.body.scrollHeight;
        state.isAtBottom = true;
        state.newLogCount = 0;
        this._updateNewLogIndicator(state);
    },

    _updateNewLogIndicator(state) {
        const ui = state.ui;
        if (!ui || !ui.newLogIndicator || !ui.newLogText) return;
        
        if (state.newLogCount > 0 && !state.isAtBottom) {
            ui.newLogText.textContent = `${state.newLogCount} new`;
            ui.newLogIndicator.style.display = 'flex';
        } else {
            ui.newLogIndicator.style.display = 'none';
        }
    },

    _clearLogs(state) {
        state.logs.forEach((log) => {
            if (log.node && log.node.parentNode) {
                log.node.parentNode.removeChild(log.node);
            }
        });
        state.logs = [];
        state.newLogCount = 0;
        this._updateNewLogIndicator(state);
    },

    async _copyAll(state) {
        const visibleLogs = state.logs.filter(
            (log) => log.node && log.node.style.display !== 'none'
        );
        const text = visibleLogs.map((log) => log.text).join('\n');
        const ui = state.ui;
        const btn = ui && ui.copyButton;
        const ok = await this._copyToClipboard(text);
        if (btn) {
            this._flashDevLoggerCopyFeedback(btn, ok);
        }
        if (!text && state.logs.length > 0) {
            Logger.warn('Dev logger: copy skipped (no visible logs for current filter)');
        } else if (!ok && text) {
            Logger.warn('Dev logger: copy all to clipboard failed');
        }
    },

    _flashDevLoggerCopyFeedback(targetEl, success) {
        if (targetEl._fleetLoggerCopyT) clearTimeout(targetEl._fleetLoggerCopyT);
        const prevBackgroundColor = targetEl.style.backgroundColor;
        const prevColor = targetEl.style.color;
        const prevTransition = targetEl.style.transition;
        if (success) {
            targetEl.style.transition = '';
            targetEl.style.backgroundColor = 'rgb(34, 197, 94)';
            targetEl.style.color = '#ffffff';
            targetEl._fleetLoggerCopyT = setTimeout(() => {
                targetEl.style.backgroundColor = prevBackgroundColor;
                targetEl.style.color = prevColor;
                targetEl.style.transition = prevTransition;
                targetEl._fleetLoggerCopyT = null;
            }, 1000);
        } else {
            targetEl.style.transition = 'none';
            targetEl.style.backgroundColor = 'rgb(239, 68, 68)';
            targetEl.style.color = '#ffffff';
            void targetEl.offsetHeight;
            targetEl.style.transition = 'background-color 500ms ease-out, color 500ms ease-out';
            targetEl.style.backgroundColor = prevBackgroundColor;
            targetEl.style.color = prevColor;
            targetEl._fleetLoggerCopyT = setTimeout(() => {
                targetEl.style.transition = prevTransition;
                targetEl._fleetLoggerCopyT = null;
            }, 500);
        }
    },

    async _copyToClipboard(text) {
        if (!text) return false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) {
            // Fall back below
        }

        const temp = document.createElement('textarea');
        temp.value = text;
        temp.style.position = 'fixed';
        temp.style.top = '-1000px';
        document.body.appendChild(temp);
        temp.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch (e) {
            ok = false;
        }
        document.body.removeChild(temp);
        return ok;
    },

    _setupLogging(state, context) {
        const logPrefix = context.logPrefix || '';
        const formatArgs = (args) => {
            return args.map((arg) => {
                if (typeof arg === 'string') return arg;
                if (arg instanceof Error) return arg.stack || arg.message || String(arg);
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return String(arg);
                }
            }).join(' ');
        };

        const stripPrefix = (text) => {
            if (!logPrefix || typeof text !== 'string') return text;
            if (text.startsWith(logPrefix)) {
                const trimmed = text.slice(logPrefix.length);
                return trimmed.startsWith(' ') ? trimmed.slice(1) : trimmed;
            }
            return text;
        };

        const handleConsoleCall = (level, args) => {
            if (!args || args.length === 0) return;
            const first = args[0];
            if (typeof first !== 'string' || !first.startsWith(logPrefix)) return;

            const normalizedArgs = [...args];
            normalizedArgs[0] = stripPrefix(normalizedArgs[0]);
            this._appendLogEntry(state, level, formatArgs(normalizedArgs));
        };

        const wrapConsole = (methodName, level) => {
            const original = console[methodName].bind(console);
            state.originalConsole[methodName] = original;
            console[methodName] = (...args) => {
                original(...args);
                try {
                    handleConsoleCall(level, args);
                } catch (e) {
                    original('Logger panel failed to capture log', e);
                }
            };
        };

        if (typeof Logger !== 'undefined' && typeof Logger.onLog === 'function') {
            state.unsubscribe = Logger.onLog((level, args) => {
                handleConsoleCall(level, args);
            });
        } else {
            state.originalConsole = {};
            wrapConsole('log', 'log');
            wrapConsole('info', 'info');
            wrapConsole('warn', 'warn');
            wrapConsole('error', 'error');
            wrapConsole('debug', 'debug');
        }
    },

    destroy(state) {
        if (state.guardInterval) {
            clearInterval(state.guardInterval);
            state.guardInterval = null;
        }
        if (state.handlers) {
            const ui = state.ui;
            if (ui && ui.body) {
                ui.body.removeEventListener('scroll', state.handlers.onScroll);
            }
            if (ui && ui.scrollToBottomButton) {
                ui.scrollToBottomButton.removeEventListener('click', state.handlers.onScrollToBottom);
            }
            if (ui && ui.newLogIndicator) {
                ui.newLogIndicator.removeEventListener('click', state.handlers.onScrollToBottom);
            }
            document.removeEventListener('mousemove', state.handlers.onMouseMove);
            document.removeEventListener('mousemove', state.handlers.onResizeMove);
            document.removeEventListener('mouseup', state.handlers.onMouseUp);
            state.handlers = null;
        }
        this._teardownUI(state);
        if (state.unsubscribe) {
            state.unsubscribe();
            state.unsubscribe = null;
        }
        if (state.originalConsole) {
            ['log', 'info', 'warn', 'error', 'debug'].forEach((method) => {
                if (state.originalConsole[method]) {
                    console[method] = state.originalConsole[method];
                }
            });
        }
    }
};
