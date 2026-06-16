// ============= network-interception.js =============
const plugin = {
    id: 'networkInterception',
    name: 'Network Interception',
    description: 'Captures MCP request URLs for the Source Data Explorer button',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'early',
    initialState: {},
    
    init(state, context) {
        const pageWindow = context.getPageWindow();
        const originalFetch = pageWindow.fetch;

        pageWindow.fetch = function(...args) {
            const [resource, config] = args;
            let url;
            try {
                url = new URL(resource, pageWindow.location.href);
            } catch (e) {
                url = { href: resource, pathname: '' };
            }

            if (url.pathname === '/mcp' && config && config.method === 'POST') {
                if (context.source === null) {
                    context.source = url.href;
                    Logger.log(`✓ Source URL captured (fetch): ${url.href}`);
                }
            }
            return originalFetch.apply(this, args);
        };

        const originalXHROpen = pageWindow.XMLHttpRequest.prototype.open;
        const originalXHRSend = pageWindow.XMLHttpRequest.prototype.send;

        pageWindow.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this._interceptedURL = url;
            this._interceptedMethod = method;
            return originalXHROpen.apply(this, [method, url, ...rest]);
        };

        pageWindow.XMLHttpRequest.prototype.send = function(body) {
            if (this._interceptedMethod === 'POST' && this._interceptedURL && this._interceptedURL.includes('/mcp')) {
                if (context.source === null) {
                    context.source = this._interceptedURL;
                    Logger.log(`✓ Source URL captured (XHR): ${this._interceptedURL}`);
                }
            }
            return originalXHRSend.apply(this, [body]);
        };

        // Expose getter globally for debugging
        pageWindow.getFleetSource = () => context.source;
        
        Logger.log('✓ Network interception installed');
    }
};