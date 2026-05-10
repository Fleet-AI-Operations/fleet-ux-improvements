// ============= source-data-explorer.js =============
// Plugin that uses context data from other plugins

const plugin = {
    id: 'sourceDataExplorer',
    name: 'Explore GUI',
    description: 'Adds an Explore GUI button that opens the underlying environment in a new tab so you can inspect data without parsing JSON. This links to the actual instance that your tool calls are modifying. BE AWARE: if you make changes inside the instance, they will be reflected in your tool calls. Only use the tools to perform write actions, or you may run into unexpected problems when your submission is graded.',
    _version: '1.6',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, interceptionInstalled: false },
    
    // Plugin-specific selectors
    selectors: {
        actionBarCenter:
            'body > div.group\\/sidebar-wrapper.flex.min-h-svh.w-full.has-\\[\\[data-variant\\=inset\\]\\]\\:bg-sidebar > main > div > div > div.h-full.w-full.flex.flex-col.overflow-hidden > div.flex-shrink-0.px-1.py-1\\.5 > div > div.flex-1.flex.items-center.justify-center.gap-1.mx-auto'
    },
    
    onMutation(state, context) {
        if (!state.interceptionInstalled) {
            this.installNetworkInterception(context, state);
        }

        const center = Context.dom.query(this.selectors.actionBarCenter, {
            context: `${this.id}.actionBarCenter`
        });

        if (!center) {
            if (!state.missingLogged) {
                Logger.debug('Action bar center not found for Explore GUI button');
                state.missingLogged = true;
            }
            return;
        }

        // Reset missing log once the element appears (helps debugging transient UI)
        state.missingLogged = false;

        const button = this.ensureSourceButton(center, context);
        if (button) {
            this.updateSourceButton(button, context);
        }
    },

    _isMcpPathname(pathname) {
        if (!pathname || typeof pathname !== 'string') return false;
        const normalized = pathname.toLowerCase();
        return /(^|\/)mcp(\/|$)/.test(normalized);
    },

    _instanceRootFromHref(href, context) {
        const pageWindow = context.getPageWindow();
        const u = new URL(href, pageWindow.location.href);
        return `${u.origin}/`;
    },

    sourceHrefToOpenUrl(href, context) {
        return this._instanceRootFromHref(href, context);
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
                    method = ((init && init.method) || resource.method || 'GET').toUpperCase();
                } else {
                    try {
                        url = new URL(resource, pageWindow.location.href);
                    } catch (e) {
                        url = { href: resource, pathname: '' };
                    }
                    method = ((init && init.method) || 'GET').toUpperCase();
                }

                const href = typeof url.href === 'string' ? url.href : String(resource);
                const pathMatches = pluginSelf._isMcpPathname(url.pathname) || href.toLowerCase().includes('/mcp');
                if (method === 'POST' && pathMatches) {
                    const previousSource = context.source;
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

        // Expose getter globally for debugging
        pageWindow.getFleetSource = () => context.source;

        state.interceptionInstalled = true;
        Logger.log('sourceDataExplorer: ✓ Network interception installed (fetch + XHR)');
    },
    
    ensureSourceButton(centerContainer, context) {
        const existing = centerContainer.querySelector('[data-fleet-plugin="sourceDataExplorer"][data-slot="source-data-button"]');
        if (existing) return existing;

        const button = document.createElement('button');
        button.setAttribute('data-fleet-plugin', this.id);
        button.setAttribute('data-slot', 'source-data-button');
        button.className =
            'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-secondary transition-colors hover:bg-secondary/80 h-8 rounded-sm pl-3 text-xs pr-3 text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 border border-amber-300 dark:border-amber-700';

        const label = document.createElement('span');
        label.className = 'whitespace-nowrap text-md font-medium';
        label.textContent = 'Explore GUI';
        button.appendChild(label);

        button.addEventListener('click', () => {
            if (context.source) {
                const sourceUrl = this.sourceHrefToOpenUrl(context.source, context);
                window.open(sourceUrl, '_blank');
                Logger.log('sourceDataExplorer: Opening Explore GUI (instance root):', sourceUrl);
            } else {
                Logger.warn('sourceDataExplorer: Source URL not available (no MCP POST observed yet)');
            }
        });

        // Insert immediately after "Reset Instance" (and thus as the last child)
        const resetButton = Array.from(centerContainer.querySelectorAll('button')).find(b =>
            (b.textContent || '').includes('Reset Instance')
        );

        if (resetButton) {
            const insertionTarget = resetButton.parentElement === centerContainer
                ? resetButton
                : Array.from(centerContainer.children).find(child => child.contains(resetButton));
            if (insertionTarget && insertionTarget.parentElement === centerContainer) {
                insertionTarget.insertAdjacentElement('afterend', button);
            } else {
                centerContainer.appendChild(button);
            }
        } else {
            centerContainer.appendChild(button);
        }

        Logger.log('sourceDataExplorer: ✓ Explore GUI button added (action bar)');
        return button;
    },

    updateSourceButton(button, context) {
        const hasSource = Boolean(context.source);
        button.disabled = !hasSource;
        button.title = hasSource
            ? 'Open environment root (origin only)'
            : 'Waiting for MCP POST; opens env root, not a specific app path';
    }
};

try {
    plugin.installNetworkInterception(Context, { interceptionInstalled: false });
    Logger.debug('sourceDataExplorer: early interception bootstrap attempted at plugin load');
} catch (e) {
    Logger.warn('sourceDataExplorer: early interception bootstrap failed; will retry during mutation phase', e);
}