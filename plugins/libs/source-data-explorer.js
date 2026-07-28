// ============= source-data-explorer.js (library) =============
// Shared Explore GUI: mcp-proxy capture, ack modal, button chrome. Placement lives in archetype wrappers.

const SourceDataExplorerApi = {
    PLUGIN_ID: 'sourceDataExplorer',

    /**
     * @param {object} state
     * @param {object} context
     * @param {object} options
     * @param {string} [options.pluginId]
     * @param {string} [options.logTag]
     * @param {Element} options.buttonContainer — found by the archetype module
     * @param {function(HTMLElement, Element): void} options.mountButton — archetype inserts the new button
     */
    run(state, context, options) {
        const opts = options || {};
        const logTag = opts.logTag || this.PLUGIN_ID;
        const pluginId = opts.pluginId || this.PLUGIN_ID;
        const buttonContainer = opts.buttonContainer;
        const mountButton = opts.mountButton;

        const impl = Object.create(this);
        impl.id = pluginId;
        impl._logTag = logTag;

        if (!state.interceptionInstalled) {
            impl.installNetworkInterception(context, state);
        }

        if (!buttonContainer || typeof mountButton !== 'function') {
            if (!state.missingLogged) {
                Logger.debug(logTag + ': Button container not found for Explore GUI button');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;

        const button = impl.ensureSourceButton(buttonContainer, context, { mountButton, logTag });
        if (button) {
            impl.updateSourceButton(button, context);
        }
    },

    /**
     * True when pathname is Fleet's same-origin MCP proxy (not a direct env /mcp URL).
     */
    _isMcpProxyPathname(pathname) {
        if (!pathname || typeof pathname !== 'string') return false;
        const normalized = pathname.toLowerCase();
        return normalized === '/api/mcp-proxy' || normalized.endsWith('/mcp-proxy');
    },

    /**
     * True when pathname targets a direct env MCP endpoint (legacy). Excludes /mcp-proxy.
     */
    _isMcpPathname(pathname) {
        if (!pathname || typeof pathname !== 'string') return false;
        const normalized = pathname.toLowerCase();
        if (this._isMcpProxyPathname(normalized)) return false;
        return /(^|\/)mcp(\/|$)/.test(normalized);
    },

    _parseJsonBody(raw) {
        if (raw == null) return null;
        if (typeof raw === 'object' && !(typeof Blob !== 'undefined' && raw instanceof Blob)) {
            return raw;
        }
        if (typeof raw !== 'string') return null;
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    },

    _instanceRootFromSubdomain(subdomain) {
        if (!subdomain || typeof subdomain !== 'string') return null;
        let host = subdomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        if (!host) return null;
        // mcp-proxy subdomain is the env label only; public host appends .fleetai.com
        if (!/\.fleetai\.com$/i.test(host)) {
            host = `${host}.fleetai.com`;
        }
        return `https://${host}/`;
    },

    _setCapturedSource(context, href, via) {
        if (!href) return;
        const previousSource = context.source;
        if (previousSource === null) {
            context.source = href;
            Logger.log(`sourceDataExplorer: ✓ Source URL captured (${via}): ${href}`);
        } else if (previousSource !== href) {
            context.source = href;
            Logger.log(`sourceDataExplorer: ✓ Source URL updated (${via}): ${previousSource} → ${href}`);
        }
    },

    /**
     * Capture instance root from mcp-proxy POST body.subdomain, or legacy direct /mcp URL.
     * Never stores the /api/mcp-proxy URL itself.
     */
    _captureFromRequest(context, { method, pathname, href, body }, via) {
        if ((method || '').toUpperCase() !== 'POST') return;

        if (this._isMcpProxyPathname(pathname) || (typeof href === 'string' && href.toLowerCase().includes('/mcp-proxy'))) {
            const payload = this._parseJsonBody(body);
            const root = payload && this._instanceRootFromSubdomain(payload.subdomain);
            if (root) {
                this._setCapturedSource(context, root, via);
            }
            return;
        }

        const pathMatches =
            this._isMcpPathname(pathname) ||
            (typeof href === 'string' &&
                href.toLowerCase().includes('/mcp') &&
                !href.toLowerCase().includes('/mcp-proxy'));
        if (pathMatches && href) {
            this._setCapturedSource(context, href, via);
        }
    },

    _instanceRootFromHref(href, context) {
        const pageWindow = context.getPageWindow();
        const u = new URL(href, pageWindow.location.href);
        return `${u.origin}/`;
    },

    /** Open only the instance root domain regardless of endpoint-specific paths. */
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
                let body = init && init.body;

                const Req = pageWindow.Request;
                if (Req && resource instanceof Req) {
                    try {
                        url = new URL(resource.url, pageWindow.location.href);
                    } catch (e) {
                        url = { href: resource.url, pathname: '' };
                    }
                    method = ((init && init.method) || resource.method || 'GET').toUpperCase();
                    if (body == null) {
                        try {
                            body = resource.body;
                        } catch (e) {
                            /* Request body may already be consumed */
                        }
                    }
                } else {
                    try {
                        url = new URL(resource, pageWindow.location.href);
                    } catch (e) {
                        url = { href: resource, pathname: '' };
                    }
                    method = ((init && init.method) || 'GET').toUpperCase();
                }

                const href = typeof url.href === 'string' ? url.href : String(resource);
                pluginSelf._captureFromRequest(
                    context,
                    { method, pathname: url.pathname || '', href, body },
                    'fetch'
                );
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
            let pathname = '';
            let href = typeof reqUrl === 'string' ? reqUrl : '';
            try {
                const parsed = new URL(reqUrl, pageWindow.location.href);
                pathname = parsed.pathname;
                href = parsed.href;
            } catch (e) {
                /* keep raw reqUrl */
            }

            pluginSelf._captureFromRequest(
                context,
                { method: m, pathname, href, body },
                'XHR'
            );
            return originalXHRSend.apply(this, [body]);
        };

        pageWindow.getFleetSource = () => context.source;

        state.interceptionInstalled = true;
        Logger.log('sourceDataExplorer: ✓ Network interception installed (fetch + XHR)');
    },

    /** @param {Window} pageWindow */
    showExploreGuiAckModal(pageWindow, context) {
        const OVERLAY_ID = 'fleet-explore-gui-ack-overlay';
        if (document.getElementById(OVERLAY_ID)) {
            return;
        }

        const openInstance = () => {
            if (!context.source) {
                Logger.warn('sourceDataExplorer: Source URL not available (no MCP POST observed yet)');
                return;
            }
            const sourceUrl = this.sourceHrefToOpenUrl(context.source, context);
            pageWindow.open(sourceUrl, '_blank');
            Logger.log('sourceDataExplorer: Opening Explore GUI after acknowledgment:', sourceUrl);
        };

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.setAttribute('data-fleet-plugin', this.id || this.PLUGIN_ID);
        overlay.setAttribute('data-slot', 'explore-gui-ack-modal');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            position: relative;
            background: var(--background, white);
            border: 1px solid var(--border, #e5e5e5);
            border-radius: 12px;
            padding: 24px;
            width: 100%;
            max-width: 520px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        `;

        modal.innerHTML = `
            <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.5; color: var(--foreground, #333);">
                Please check each box to acknowledge that you understand the following information:
            </p>
            <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
                <label style="display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.45; cursor: pointer; color: var(--foreground, #333);">
                    <input id="fleet-explore-gui-ack-cb1" type="checkbox" style="margin-top: 3px; flex-shrink: 0;" />
                    <span>The GUI interface is meant to be used as a tool to enable more efficient exploration of the data.</span>
                </label>
                <label style="display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.45; cursor: pointer; color: var(--foreground, #333);">
                    <input id="fleet-explore-gui-ack-cb2" type="checkbox" style="margin-top: 3px; flex-shrink: 0;" />
                    <span>The tool calls are the source of truth. If you can't find specific GUI data with tool calls, it does not exist and cannot be referenced in the prompt.</span>
                </label>
                <label style="display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.45; cursor: pointer; color: var(--foreground, #333);">
                    <input id="fleet-explore-gui-ack-cb3" type="checkbox" style="margin-top: 3px; flex-shrink: 0;" />
                    <span>Your tool use workflow must contain all of the search tool calls necessary to find any information you find in the GUI.</span>
                </label>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end;">
                <button type="button" id="fleet-explore-gui-ack-cancel"
                    style="padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border, #e5e5e5); background: var(--background, white); color: var(--foreground, #333); font-size: 13px; font-weight: 500; cursor: pointer;">
                    Cancel
                </button>
                <button type="button" id="fleet-explore-gui-ack-continue" disabled
                    style="padding: 8px 16px; border-radius: 6px; border: none; background: #171717; color: #fafafa; font-size: 13px; font-weight: 500; cursor: not-allowed; opacity: 0.5;">
                    Acknowledge and continue
                </button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const cb1 = modal.querySelector('#fleet-explore-gui-ack-cb1');
        const cb2 = modal.querySelector('#fleet-explore-gui-ack-cb2');
        const cb3 = modal.querySelector('#fleet-explore-gui-ack-cb3');
        const continueBtn = modal.querySelector('#fleet-explore-gui-ack-continue');
        const cancelBtn = modal.querySelector('#fleet-explore-gui-ack-cancel');

        const syncContinue = () => {
            const allChecked = Boolean(cb1.checked && cb2.checked && cb3.checked);
            continueBtn.disabled = !allChecked;
            continueBtn.style.cursor = allChecked ? 'pointer' : 'not-allowed';
            continueBtn.style.opacity = allChecked ? '1' : '0.5';
        };

        const closeModal = (reason) => {
            overlay.remove();
            if (reason) {
                Logger.log(`sourceDataExplorer: Explore GUI acknowledgment modal closed (${reason})`);
            }
        };

        [cb1, cb2, cb3].forEach((cb) => cb.addEventListener('change', syncContinue));

        continueBtn.addEventListener('click', () => {
            if (continueBtn.disabled) return;
            closeModal(null);
            openInstance();
        });

        cancelBtn.addEventListener('click', () => closeModal('cancel'));

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal('backdrop');
            }
        });

        Logger.log('sourceDataExplorer: Explore GUI acknowledgment modal shown');
    },

    ensureSourceButton(buttonContainer, context, options) {
        const pluginId = this.id || this.PLUGIN_ID;
        const mountButton = options && options.mountButton;
        const logTag = (options && options.logTag) || pluginId;
        const existing = buttonContainer.querySelector(
            '[data-fleet-plugin="sourceDataExplorer"][data-slot="source-data-button"]'
        );
        if (existing) {
            return existing;
        }

        const pageWindow = context.getPageWindow();
        const button = document.createElement('button');
        button.setAttribute('data-fleet-plugin', pluginId);
        button.setAttribute('data-slot', 'source-data-button');
        button.className =
            'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 gap-2 text-xs relative border-amber-300 dark:border-amber-700';
        button.type = 'button';
        button.textContent = 'Explore GUI';

        const self = this;
        button.addEventListener('click', () => {
            if (!context.source) {
                Logger.warn('sourceDataExplorer: Source URL not available (no MCP POST observed yet)');
                return;
            }
            self.showExploreGuiAckModal(pageWindow, context);
        });

        if (typeof mountButton === 'function') {
            mountButton(button, buttonContainer);
        } else {
            buttonContainer.insertBefore(button, buttonContainer.firstChild);
        }
        Logger.log(logTag + ': ✓ Explore GUI button added');
        return button;
    },

    updateSourceButton(button, context) {
        const hasSource = Boolean(context.source);
        button.disabled = !hasSource;
        button.title = hasSource
            ? 'Open environment root (origin only)'
            : 'Waiting for MCP proxy/POST; opens env root, not a specific app path';
    }
};

const plugin = {
    id: 'sourceDataExplorerLib',
    name: 'Explore GUI (library)',
    description: 'Shared Explore GUI API: mcp-proxy capture, acknowledgment modal, and button chrome (archetype modules supply placement)',
    _version: '6.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.sourceDataExplorer = {
            run: (s, ctx, options) => SourceDataExplorerApi.run(s, ctx, options),
            installNetworkInterception: (ctx, s) =>
                SourceDataExplorerApi.installNetworkInterception(ctx, s),
            ensureSourceButton: (container, ctx, options) =>
                SourceDataExplorerApi.ensureSourceButton(container, ctx, options),
            updateSourceButton: (button, ctx) =>
                SourceDataExplorerApi.updateSourceButton(button, ctx)
        };
        if (!state.registered) {
            Logger.log('sourceDataExplorerLib: module registered (Context.sourceDataExplorer)');
            state.registered = true;
        }
    }
};

try {
    SourceDataExplorerApi.installNetworkInterception(Context, { interceptionInstalled: false });
    Logger.debug('sourceDataExplorer: early interception bootstrap attempted at library load');
} catch (e) {
    Logger.warn('sourceDataExplorer: early interception bootstrap failed; will retry during mutation phase', e);
}
