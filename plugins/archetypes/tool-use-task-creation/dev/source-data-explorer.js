// ============= source-data-explorer.js =============
// Plugin that uses context data from other plugins

const plugin = {
    id: 'sourceDataExplorer',
    name: 'Source Data Explorer',
    description: 'Add button that opens the underlying environment in a new tab. This is meant to be used as an additional way to explore the underlying data so you can build amazing prompts without having to parse the data in JSON format. This links to the actual instance that your tool calls are modifying. BE AWARE: if you make changes inside the instance, they will be reflected in your tool calls. Only use the tools to perform write actions, or you may run into unexpected problems when your submission is graded.',
    _version: '4.0',
    enabledByDefault: false,
    phase: 'mutation',
    initialState: { buttonAdded: false, missingLogged: false, interceptionInstalled: false },
    
    onMutation(state, context) {
        if (!state.interceptionInstalled) {
            this.installNetworkInterception(context, state);
        }

        if (state.buttonAdded) return;
        
        let buttonContainer = null;
        const workflowEditor = document.querySelector('[data-ui="workflow-editor"]');
        const headerScope = workflowEditor?.previousElementSibling || document;

        const candidates = headerScope.querySelectorAll('div.flex.gap-1.ml-auto.items-center');
        buttonContainer = Array.from(candidates).find(el => 
            el.classList.contains('mr-0') || 
            (el.classList.contains('flex') && 
             el.classList.contains('gap-1') && 
             el.classList.contains('items-center') &&
             getComputedStyle(el).marginLeft === 'auto')
        );
        
        if (!buttonContainer) {
            const buttons = Array.from(headerScope.querySelectorAll('button'));
            const resetBtn = buttons.find(btn => {
                const text = btn.textContent.trim();
                return text === 'Reset Instance' || text.includes('Reset Instance');
            });
            if (resetBtn) {
                buttonContainer = resetBtn.closest('div.flex.gap-1');
            }
        }
        
        if (!buttonContainer) {
            const buttons = Array.from(headerScope.querySelectorAll('button'));
            const saveBtn = buttons.find(btn => {
                const text = btn.textContent.trim();
                return text === 'Save';
            });
            if (saveBtn) {
                const parent = saveBtn.parentElement;
                if (parent && parent.classList.contains('flex') && parent.classList.contains('gap-1')) {
                    buttonContainer = parent;
                }
            }
        }
        
        if (!buttonContainer) {
            if (!state.missingLogged) {
                Logger.debug('Button container not found for Source Data Explorer button');
                state.missingLogged = true;
            }
            return;
        }

        if (!context.source) {
            return;
        }

        this.addSourceButton(buttonContainer, context);
        state.buttonAdded = true;
    },

    installNetworkInterception(context, state) {
        const pageWindow = context.getPageWindow();

        if (pageWindow.__fleetNetworkInterceptionInstalled) {
            state.interceptionInstalled = true;
            return;
        }

        pageWindow.__fleetNetworkInterceptionInstalled = true;

        const originalFetch = pageWindow.fetch;
        if (typeof originalFetch === 'function') {
            pageWindow.fetch = function(...args) {
                const [resource, config] = args;
                let url;
                try {
                    url = new URL(resource, pageWindow.location.href);
                } catch (e) {
                    url = { href: resource, pathname: '' };
                }

                if (url.pathname === '/mcp' && config && config.method === 'POST') {
                    const previousSource = context.source;
                    if (previousSource === null) {
                        context.source = url.href;
                        Logger.log(`✓ Source URL captured (fetch): ${url.href}`);
                    } else if (previousSource !== url.href) {
                        context.source = url.href;
                        Logger.log(`✓ Source URL updated (fetch): ${previousSource} → ${url.href}`);
                    }
                }
                return originalFetch.apply(this, args);
            };
        }

        const originalXHROpen = pageWindow.XMLHttpRequest.prototype.open;
        const originalXHRSend = pageWindow.XMLHttpRequest.prototype.send;

        pageWindow.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this._interceptedURL = url;
            this._interceptedMethod = method;
            return originalXHROpen.apply(this, [method, url, ...rest]);
        };

        pageWindow.XMLHttpRequest.prototype.send = function(body) {
            if (this._interceptedMethod === 'POST' && this._interceptedURL && this._interceptedURL.includes('/mcp')) {
                const previousSource = context.source;
                if (previousSource === null) {
                    context.source = this._interceptedURL;
                    Logger.log(`✓ Source URL captured (XHR): ${this._interceptedURL}`);
                } else if (previousSource !== this._interceptedURL) {
                    context.source = this._interceptedURL;
                    Logger.log(`✓ Source URL updated (XHR): ${previousSource} → ${this._interceptedURL}`);
                }
            }
            return originalXHRSend.apply(this, [body]);
        };

        // Expose getter globally for debugging
        pageWindow.getFleetSource = () => context.source;

        state.interceptionInstalled = true;
        Logger.log('✓ Network interception installed');
    },
    
    addSourceButton(buttonContainer, context) {
        const button = document.createElement('button');
        button.className = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 gap-2 text-xs relative border-amber-300 dark:border-amber-700';
        button.textContent = '📊 Source Data';
        button.title = 'Open source data in new tab';
        
        button.onclick = () => {
            if (context.source) {
                const sourceUrl = context.source.replace('/mcp', '');
                window.open(sourceUrl, '_blank');
                Logger.log('Opening source data:', sourceUrl);
            } else {
                alert('Source data URL not captured yet. Try refreshing the page.');
                Logger.warn('Source URL not available');
            }
        };
        
        // Insert as first child of the button container
        buttonContainer.insertBefore(button, buttonContainer.firstChild);
        Logger.log('✓ Source Data Explorer button added');
    }
};