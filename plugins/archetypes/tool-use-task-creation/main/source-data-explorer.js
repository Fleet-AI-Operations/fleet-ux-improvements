// ============= source-data-explorer.js =============
// Plugin that uses context data from other plugins

const plugin = {
    id: 'sourceDataExplorer',
    name: 'Explore GUI',
    description: 'Adds an Explore GUI control that opens the underlying environment in a new tab so you can inspect data without parsing JSON. This links to the actual instance that your tool calls are modifying. BE AWARE: if you make changes inside the instance, they will be reflected in your tool calls. Only use the tools to perform write actions, or you may run into unexpected problems when your submission is graded.',
    _version: '4.4',
    enabledByDefault: true,
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
                Logger.debug('sourceDataExplorer: Button container not found for Explore GUI button');
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
        const normalized = pathname.toLowerCase();
        return /(^|\/)mcp(\/|$)/.test(normalized);
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
        overlay.setAttribute('data-fleet-plugin', this.id);
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
        button.textContent = 'Explore GUI';

        button.addEventListener('click', () => {
            if (!context.source) {
                Logger.warn('sourceDataExplorer: Source URL not available (no MCP POST observed yet)');
                return;
            }
            this.showExploreGuiAckModal(pageWindow, context);
        });

        buttonContainer.insertBefore(button, buttonContainer.firstChild);
        Logger.log('sourceDataExplorer: ✓ Explore GUI button added');
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