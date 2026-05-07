// ============= source-data-explorer.js =============
// Plugin that uses context data from other plugins

const plugin = {
    id: 'sourceDataExplorer',
    name: 'Source Data Explorer',
    description: 'Add button that opens the underlying environment in a new tab. This is meant to be used as an additional way to explore the underlying data so you can build amazing prompts without having to parse the data in JSON format. This links to the actual instance that your tool calls are modifying. BE AWARE: if you make changes inside the instance, they will be reflected in your tool calls. Only use the tools to perform write actions, or you may run into unexpected problems when your submission is graded.',
    _version: '4.1',
    enabledByDefault: false,
    phase: 'mutation',
    initialState: { missingLogged: false, interceptionInstalled: false },
    
    onMutation(state, context) {
        if (!state.interceptionInstalled) {
            this.installNetworkInterception(context, state);
        }

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
                Logger.debug('sourceDataExplorer: Button container not found for Source Data Explorer button');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;

        const button = this.ensureSourceButton(buttonContainer, context);
        if (button) {
            this.updateSourceButton(button, context);
        }
    },

    /**
     * True when pathname targets the MCP endpoint (aligned with plugins/global/network-interception.js, plus /…/mcp suffix).
     */
    _isMcpPathname(pathname) {
        if (!pathname || typeof pathname !== 'string') return false;
        return pathname === '/mcp' || pathname.endsWith('/mcp');
    },

    /** Turn captured MCP request URL into the instance page opened in a new tab (strip trailing /mcp). */
    sourceHrefToOpenUrl(href, context) {
        const pageWindow = context.getPageWindow();
        const u = new URL(href, pageWindow.location.href);
        let p = u.pathname;
        if (p === '/mcp' || p.endsWith('/mcp')) {
            p = p.slice(0, -4) || '/';
        }
        u.pathname = p.startsWith('/') ? p : `/${p}`;
        return u.toString();
    },

    installNetworkInterception(context, state) {
        const pageWindow = context.getPageWindow();

        if (pageWindow.__fleetNetworkInterceptionInstalled) {
            state.interceptionInstalled = true;
            return;
        }

        pageWindow.__fleetNetworkInterceptionInstalled = true;

        const pluginSelf = this;
        const originalFetch = pageWindow.fetch;
        if (typeof originalFetch === 'function') {
            pageWindow.fetch = function(...args) {
                const [resource, init] = args;
                let url;
                let method = 'GET';

                const Req = pageWindow.Request;
                if (Req && resource instanceof Req) {
                    try {
                        url = new URL(resource.url, pageWindow.location.href);
                    } catch (e) {
                        url = { href: resource.url, pathname: '' };
                    }
                    method = (resource.method || 'GET').toUpperCase();
                } else {
                    try {
                        url = new URL(resource, pageWindow.location.href);
                    } catch (e) {
                        url = { href: resource, pathname: '' };
                    }
                    method = ((init && init.method) || 'GET').toUpperCase();
                }

                if (method === 'POST' && pluginSelf._isMcpPathname(url.pathname)) {
                    const previousSource = context.source;
                    const href = typeof url.href === 'string' ? url.href : String(resource);
                    if (previousSource === null) {
                        context.source = href;
                        Logger.log(`sourceDataExplorer: ✓ Source URL captured (fetch): ${href}`);
                    } else if (previousSource !== href) {
                        context.source = href;
                        Logger.log(`sourceDataExplorer: ✓ Source URL updated (fetch): ${previousSource} → ${href}`);
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
            const m = (this._interceptedMethod || '').toUpperCase();
            const reqUrl = this._interceptedURL;
            let pathMatches = false;
            try {
                pathMatches = pluginSelf._isMcpPathname(new URL(reqUrl, pageWindow.location.href).pathname);
            } catch (e) {
                pathMatches = typeof reqUrl === 'string' && reqUrl.includes('/mcp');
            }

            if (m === 'POST' && reqUrl && pathMatches) {
                const previousSource = context.source;
                if (previousSource === null) {
                    context.source = reqUrl;
                    Logger.log(`sourceDataExplorer: ✓ Source URL captured (XHR): ${reqUrl}`);
                } else if (previousSource !== reqUrl) {
                    context.source = reqUrl;
                    Logger.log(`sourceDataExplorer: ✓ Source URL updated (XHR): ${previousSource} → ${reqUrl}`);
                }
            }
            return originalXHRSend.apply(this, [body]);
        };

        pageWindow.getFleetSource = () => context.source;

        state.interceptionInstalled = true;
        Logger.log('sourceDataExplorer: ✓ Network interception installed (fetch + XHR)');
    },

    ensureSourceButton(buttonContainer, context) {
        const existing = buttonContainer.querySelector(
            '[data-fleet-plugin="sourceDataExplorer"][data-slot="source-data-button"]'
        );
        if (existing) {
            return existing;
        }

        const pageWindow = context.getPageWindow();
        const button = document.createElement('button');
        button.setAttribute('data-fleet-plugin', this.id);
        button.setAttribute('data-slot', 'source-data-button');
        button.className =
            'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 gap-2 text-xs relative border-amber-300 dark:border-amber-700';
        button.type = 'button';
        button.textContent = '📊 Source Data';

        button.addEventListener('click', () => {
            if (!context.source) {
                Logger.warn('sourceDataExplorer: Source URL not available (no MCP POST observed yet)');
                return;
            }
            const sourceUrl = this.sourceHrefToOpenUrl(context.source, context);
            pageWindow.open(sourceUrl, '_blank');
            Logger.log('sourceDataExplorer: Opening source data:', sourceUrl);
        });

        buttonContainer.insertBefore(button, buttonContainer.firstChild);
        Logger.log('sourceDataExplorer: ✓ Source Data Explorer button added');
        return button;
    },

    updateSourceButton(button, context) {
        const hasSource = Boolean(context.source);
        button.disabled = !hasSource;
        button.title = hasSource
            ? 'Open source data in new tab'
            : 'Waiting for source URL (POST to /mcp or a /.../mcp path; run the workflow, then this enables)';
    }
};