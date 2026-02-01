// ============= source-data-explorer.js =============
// Plugin that uses context data from other plugins

const plugin = {
    id: 'sourceDataExplorer',
    name: 'Source Data Explorer',
    description: 'Add button that opens the underlying environment in a new tab. This is meant to be used as an additional way to explore the underlying data so you can build amazing prompts without having to parse the data in JSON format. This links to the actual instance that your tool calls are modifying. BE AWARE: if you make changes inside the instance, they will be reflected in your tool calls. Only use the tools to perform write actions, or you may run into unexpected problems when your submission is graded.',
    _version: '1.3',
    enabledByDefault: false,
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
                Logger.debug('Action bar center not found for Source Data Explorer button');
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
        label.textContent = 'Source Data';
        button.appendChild(label);

        button.addEventListener('click', () => {
            if (context.source) {
                const sourceUrl = context.source.replace('/mcp', '');
                window.open(sourceUrl, '_blank');
                Logger.log('Opening source data:', sourceUrl);
            } else {
                alert('Source data URL not captured yet. Try refreshing the page.');
                Logger.warn('Source URL not available');
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

        Logger.log('✓ Source Data Explorer button added (action bar)');
        return button;
    },

    updateSourceButton(button, context) {
        const hasSource = Boolean(context.source);
        button.disabled = !hasSource;
        button.title = hasSource
            ? 'Open source data in new tab'
            : 'Waiting for source URL (trigger /mcp request, then try again)';
    }
};