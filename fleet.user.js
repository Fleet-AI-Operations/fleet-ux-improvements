
// ==UserScript==
// @name         [dev] Fleet Workflow Builder UX Enhancer
// @namespace    http://tampermonkey.net/
// @version      3.9.1
// @description  UX improvements for workflow builder tool with archetype-based plugin loading
// @author       Nicholas Doherty
// @match        https://www.fleetai.com/*
// @match        https://fleetai.com/*
// @icon         https://www.fleetai.com/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/adastra1826/fleet-ux-improvements/dev/fleet.user.js
// @updateURL    https://raw.githubusercontent.com/adastra1826/fleet-ux-improvements/dev/fleet.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Exit immediately if inside an iframe.
    if (window.top != window.self) {
        console.warn("[Fleet UX Enhancer] - iframe detected. Terminating duplicate script instance. This is normal.");
        return;
    }

    // ============= CORE CONFIGURATION =============
    const VERSION = '3.9.1';
    const STORAGE_PREFIX = 'wf-enhancer-';
    const SHARED_STORAGE_KEYS = {
        favoriteTools: 'favorite-tools'
    };
    const LOG_PREFIX = '[Fleet UX Enhancer]';
    
    // Base URL that matches the @match pattern (without trailing wildcard)
    const BASE_URL = 'https://www.fleetai.com/';
    
    // GitHub repository configuration
    const GITHUB_CONFIG = {
        owner: 'adastra1826',
        repo: 'fleet-ux-improvements',
        branch: 'dev',
        pluginsPath: 'plugins',
        corePath: 'core',
        devPath: 'dev',
        archetypesPath: 'archetypes.json'
    };
    const DEV_SCRIPTS_ENABLED = GITHUB_CONFIG.branch !== 'main';
    
    // ============= SHARED CONTEXT =============
    const Context = {
        version: VERSION,
        source: null,
        initialized: false,
        currentArchetype: null,
        currentPath: null,
        outdatedPlugins: [],
        isOutdated: false,
        latestVersion: null,
        isDevBranch: DEV_SCRIPTS_ENABLED,
        githubBranch: GITHUB_CONFIG.branch,
        githubOwner: GITHUB_CONFIG.owner,
        githubRepo: GITHUB_CONFIG.repo,
        logPrefix: LOG_PREFIX,
        getPageWindow: () => typeof unsafeWindow !== 'undefined' ? unsafeWindow : window,
        storageKeys: SHARED_STORAGE_KEYS,
        settingsModalDocs: {},
    };

    // ============= CLEANUP REGISTRY =============
    const CleanupRegistry = {
        _items: {
            intervals: [],
            timeouts: [],
            observers: [],
            eventListeners: [],
            elements: [],
        },
        
        registerInterval(id) {
            this._items.intervals.push(id);
            return id;
        },
        
        registerTimeout(id) {
            this._items.timeouts.push(id);
            return id;
        },
        
        registerObserver(observer) {
            this._items.observers.push(observer);
            return observer;
        },
        
        registerEventListener(target, event, handler, options) {
            this._items.eventListeners.push({ target, event, handler, options });
            target.addEventListener(event, handler, options);
        },
        
        registerElement(element) {
            this._items.elements.push(element);
            return element;
        },
        
        cleanup() {
            Logger.debug('Running cleanup...');
            
            this._items.intervals.forEach(id => clearInterval(id));
            this._items.intervals = [];
            
            this._items.timeouts.forEach(id => clearTimeout(id));
            this._items.timeouts = [];
            
            this._items.observers.forEach(obs => obs.disconnect());
            this._items.observers = [];
            
            this._items.eventListeners.forEach(({ target, event, handler, options }) => {
                target.removeEventListener(event, handler, options);
            });
            this._items.eventListeners = [];
            
            this._items.elements.forEach(el => {
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
            this._items.elements = [];
            
            Logger.debug('Cleanup complete');
        }
    };

    // ============= URL PATTERN MATCHER =============
    const UrlMatcher = {
        /**
         * Normalize URL by removing www subdomain for consistent matching
         * @param {string} url - The URL to normalize
         * @returns {string} - Normalized URL without www
         */
        _normalizeUrl(url) {
            return url.replace(/^https:\/\/www\./, 'https://');
        },
        
        /**
         * Extract the path portion after the base URL
         * Works with both www and non-www URLs
         * @param {string} fullUrl - The complete URL
         * @returns {string} - The path after BASE_URL
         */
        getPathFromUrl(fullUrl) {
            // Normalize both URLs to handle www/non-www variations
            const normalizedBase = this._normalizeUrl(BASE_URL);
            const normalizedUrl = this._normalizeUrl(fullUrl);
            
            if (normalizedUrl.startsWith(normalizedBase)) {
                // Remove base URL and any query string/hash
                let path = normalizedUrl.slice(normalizedBase.length);
                path = path.split('?')[0].split('#')[0];
                // Remove trailing slash for consistent matching
                if (path.endsWith('/') && path.length > 1) {
                    path = path.slice(0, -1);
                }
                return path;
            }
            return '';
        },
        
        /**
         * Convert a URL pattern to a regex
         * Supports:
         *   - Exact match: "dashboard" matches only "dashboard"
         *   - Wildcard segment: "tasks/*" matches "tasks/123" but not "tasks/123/edit"
         *   - Wildcard suffix: "tasks*" matches "tasks", "tasks123", "tasks/anything"
         *   - Combined: "tasks/*\/review" matches "tasks/123/review"
         * 
         * @param {string} pattern - The URL pattern
         * @returns {RegExp} - Compiled regex
         */
        patternToRegex(pattern) {
            // Escape special regex characters (including '*', which we re-expand below)
            let regexStr = pattern
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Handle wildcards:
            // /* at segment boundaries = match one segment (no slashes)
            // * at end or mid-word = match anything including slashes
            
            // First, handle /*/  (wildcard segment in middle)
            regexStr = regexStr.replace(/\/\\\*\//g, '/[^/]+/');
            
            // Handle /* at end (wildcard segment at end, must have content)
            regexStr = regexStr.replace(/\/\\\*$/g, '/[^/]+');
            
            // Handle trailing * (match anything including empty)
            regexStr = regexStr.replace(/\\\*$/g, '.*');
            
            // Handle remaining * (mid-pattern wildcards)
            regexStr = regexStr.replace(/\\\*/g, '.*');
            
            // Anchor the pattern
            return new RegExp(`^${regexStr}$`);
        },
        
        /**
         * Test if a path matches a pattern
         * @param {string} path - The current path
         * @param {string} pattern - The URL pattern to test
         * @returns {boolean}
         */
        matches(path, pattern) {
            const regex = this.patternToRegex(pattern);
            const result = regex.test(path);
            Logger.debug(`URL match test: "${path}" vs "${pattern}" (${regex}) = ${result}`);
            return result;
        },
        
        /**
         * Calculate specificity score for a pattern (more specific = higher score)
         * Used to determine which archetype takes precedence
         * @param {string} pattern - The URL pattern
         * @returns {number}
         */
        getSpecificity(pattern) {
            let score = 0;
            
            // More segments = more specific
            const segments = pattern.split('/').filter(s => s.length > 0);
            score += segments.length * 10;
            
            // Literal segments are more specific than wildcards
            segments.forEach(seg => {
                if (seg === '*') {
                    score += 1; // Wildcard segment
                } else if (seg.includes('*')) {
                    score += 3; // Partial wildcard
                } else {
                    score += 5; // Literal segment
                }
            });
            
            // Patterns ending in * are less specific
            if (pattern.endsWith('*')) {
                score -= 2;
            }
            
            return score;
        }
    };

    // ============= NAVIGATION MANAGER =============
    const NavigationManager = {
        _lastUrl: window.location.href,
        _initialized: false,
        _onNavigateCallbacks: [],
        
        init() {
            if (this._initialized) return;
            this._initialized = true;
            
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;
            const self = this;
            
            history.pushState = function(state, title, url) {
                originalPushState.apply(this, arguments);
                self._handleNavigation('pushState', url);
            };
            
            history.replaceState = function(state, title, url) {
                originalReplaceState.apply(this, arguments);
                self._handleNavigation('replaceState', url);
            };
            
            window.addEventListener('popstate', () => {
                this._handleNavigation('popstate');
            });
            
            Logger.log('✓ Navigation monitoring initialized');
        },
        
        _handleNavigation(method, url) {
            const newUrl = window.location.href;
            
            if (newUrl === this._lastUrl) {
                Logger.debug(`Navigation method called (${method}) but URL unchanged`);
                return;
            }
            
            const previousUrl = this._lastUrl;
            this._lastUrl = newUrl;
            
            Logger.log(`Navigation detected [${method}]: ${previousUrl} → ${newUrl}`);
            
            this._onNavigateCallbacks.forEach(callback => {
                try {
                    callback(newUrl, previousUrl);
                } catch (e) {
                    Logger.error('Error in navigation callback:', e);
                }
            });
        },
        
        onNavigate(callback) {
            this._onNavigateCallbacks.push(callback);
        },
        
        getCurrentUrl() {
            return this._lastUrl;
        }
    };

    // ============= STORAGE MANAGER =============
    const Storage = {
        get(key, defaultValue) {
            return GM_getValue(STORAGE_PREFIX + key, defaultValue);
        },
        set(key, value) {
            GM_setValue(STORAGE_PREFIX + key, value);
        },
        getPluginEnabled(pluginId) {
            const plugin = PluginManager.get(pluginId);
            const defaultValue = plugin ? (plugin.enabledByDefault !== false) : true;
            return this.get(`plugin-${pluginId}-enabled`, defaultValue);
        },
        setPluginEnabled(pluginId, enabled) {
            this.set(`plugin-${pluginId}-enabled`, enabled);
        },
        // Plugin versioning storage
        getCachedPlugin(pluginKey) {
            const cached = this.get(`plugin-cache-${pluginKey}`, null);
            if (cached) {
                try {
                    return JSON.parse(cached);
                } catch (e) {
                    Logger.error(`Failed to parse cached plugin ${pluginKey}:`, e);
                    return null;
                }
            }
            return null;
        },
        setCachedPlugin(pluginKey, code, version) {
            const cacheData = {
                code: code,
                version: version,
                cachedAt: Date.now()
            };
            this.set(`plugin-cache-${pluginKey}`, JSON.stringify(cacheData));
        },
        getPluginKey(filename, sourcePath) {
            // Create a unique key for the plugin based on its path
            return sourcePath || filename;
        },
        // Settings modal doc cache (versioned, same pattern as plugin cache)
        getCachedSettingsDoc(name) {
            const cached = this.get(`settings-doc-cache-${name}`, null);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    return { raw: parsed.raw, version: parsed.version };
                } catch (e) {
                    Logger.error(`Failed to parse cached settings doc ${name}:`, e);
                    return null;
                }
            }
            return null;
        },
        setCachedSettingsDoc(name, raw, version) {
            const cacheData = { raw, version, cachedAt: Date.now() };
            this.set(`settings-doc-cache-${name}`, JSON.stringify(cacheData));
        },
        getSubmoduleLoggingEnabled() {
            return this.get('submodule-logging', false);
        },
        setSubmoduleLoggingEnabled(enabled) {
            this.set('submodule-logging', enabled);
        },
        getModuleLoggingEnabled(moduleId) {
            return this.get(`module-logging-${moduleId}`, false);
        },
        setModuleLoggingEnabled(moduleId, enabled) {
            this.set(`module-logging-${moduleId}`, enabled);
        },
        // Sub-option storage
        getSubOptionEnabled(pluginId, subOptionId, defaultValue = true) {
            return this.get(`suboption-${pluginId}-${subOptionId}`, defaultValue);
        },
        setSubOptionEnabled(pluginId, subOptionId, enabled) {
            this.set(`suboption-${pluginId}-${subOptionId}`, enabled);
        },
        // Delete a key
        delete(key) {
            try {
                GM_deleteValue(STORAGE_PREFIX + key);
            } catch (e) {
                Logger.error(`Failed to delete storage key ${key}:`, e);
            }
        },
        // Clear all storage
        clearAll(plugins = null) {
            Logger.log('Clearing all storage and cache...');
            let clearedCount = 0;
            
            // Clear all plugin-related storage
            const allPlugins = plugins || (typeof PluginManager !== 'undefined' ? PluginManager.getAll() : []);
            allPlugins.forEach(plugin => {
                // Clear plugin enabled state
                this.delete(`plugin-${plugin.id}-enabled`);
                clearedCount++;
                
                // Clear module logging
                this.delete(`module-logging-${plugin.id}`);
                clearedCount++;
                
                // Clear sub-options
                if (plugin.subOptions && Array.isArray(plugin.subOptions)) {
                    plugin.subOptions.forEach(subOption => {
                        this.delete(`suboption-${plugin.id}-${subOption.id}`);
                        clearedCount++;
                    });
                }
                
                // Clear plugin cache (try common patterns)
                // Note: We can't enumerate all cache keys, so we clear known patterns
                const pluginKey = this.getPluginKey(plugin.id, null);
                if (pluginKey) {
                    this.delete(`plugin-cache-${pluginKey}`);
                    clearedCount++;
                }
            });
            
            // Clear global settings
            const globalKeys = [
                'global-plugins-enabled',
                'global-plugins-previous',
                'debug',
                'verbose',
                'submodule-logging'
            ];
            globalKeys.forEach(key => {
                this.delete(key);
                clearedCount++;
            });
            
            // Clear shared cross-archetype storage keys
            Object.values(SHARED_STORAGE_KEYS).forEach(key => {
                this.delete(key);
                clearedCount++;
            });
            
            // Clear plugin order for all known archetypes
            // We'll try common archetype IDs
            const commonArchetypeIds = ['global', 'qa-tool-use', 'qa-comp-use', 'tool-use-task-creation'];
            commonArchetypeIds.forEach(archetypeId => {
                this.delete(`plugin-order-${archetypeId}`);
                clearedCount++;
                
                // Also clear dev plugin order
                this.delete(`dev-plugin-order-${archetypeId}`);
                clearedCount++;
                
                // Clear plugin cache registry for this archetype
                this.delete(`plugin-cache-registry-${archetypeId}`);
                clearedCount++;
            });
            
            // Also clear global and dev registries (in case they exist)
            this.delete('plugin-cache-registry-global');
            clearedCount++;
            this.delete('plugin-cache-registry-dev');
            clearedCount++;
            
            // Clear dev logger panel storage if it exists
            const devLoggerKeys = [
                'dev-logger-position-left',
                'dev-logger-position-top',
                'dev-logger-width',
                'dev-logger-height',
                'dev-logger-is-visible'
            ];
            devLoggerKeys.forEach(key => {
                this.delete(key);
                clearedCount++;
            });
            
            Logger.log(`✓ Cleared ${clearedCount} storage keys`);
            return clearedCount;
        },
        // Cache registry tracking methods
        getCachedPluginsForArchetype(archetypeId) {
            if (!archetypeId) return [];
            const registryKey = `plugin-cache-registry-${archetypeId}`;
            const registry = this.get(registryKey, null);
            if (registry) {
                try {
                    return JSON.parse(registry);
                } catch (e) {
                    Logger.error(`Failed to parse cache registry for ${archetypeId}:`, e);
                    return [];
                }
            }
            return [];
        },
        registerCachedPlugin(archetypeId, filename) {
            if (!archetypeId || !filename) return;
            const registryKey = `plugin-cache-registry-${archetypeId}`;
            const plugins = this.getCachedPluginsForArchetype(archetypeId);
            if (!plugins.includes(filename)) {
                plugins.push(filename);
                this.set(registryKey, JSON.stringify(plugins));
                Logger.debug(`Registered cached plugin: ${filename} (archetype: ${archetypeId})`);
            }
        },
        unregisterCachedPlugin(archetypeId, filename) {
            if (!archetypeId || !filename) return;
            const registryKey = `plugin-cache-registry-${archetypeId}`;
            const plugins = this.getCachedPluginsForArchetype(archetypeId);
            const index = plugins.indexOf(filename);
            if (index !== -1) {
                plugins.splice(index, 1);
                this.set(registryKey, JSON.stringify(plugins));
                Logger.debug(`Unregistered cached plugin: ${filename} (archetype: ${archetypeId})`);
            }
        },
        clearCachedPluginsForArchetype(archetypeId) {
            if (!archetypeId) return;
            const registryKey = `plugin-cache-registry-${archetypeId}`;
            this.delete(registryKey);
            Logger.debug(`Cleared cache registry for archetype: ${archetypeId}`);
        }
    };

    // ============= LOGGING =============
    const Logger = {
        _debugEnabled: null,
        _verboseEnabled: null,
        _submoduleEnabled: null,
        _moduleLogEnabled: {},
        _listeners: new Set(),
        
        isDebugEnabled() {
            if (this._debugEnabled === null) {
                this._debugEnabled = Storage.get('debug', true);
            }
            return this._debugEnabled;
        },
        
        isVerboseEnabled() {
            if (this._verboseEnabled === null) {
                this._verboseEnabled = Storage.get('verbose', false);
            }
            return this._verboseEnabled;
        },

        isSubmoduleLoggingEnabled() {
            if (this._submoduleEnabled === null) {
                this._submoduleEnabled = Storage.getSubmoduleLoggingEnabled();
            }
            return this._submoduleEnabled;
        },

        isModuleLoggingEnabled(moduleId) {
            if (!moduleId) return false;
            if (typeof this._moduleLogEnabled[moduleId] === 'undefined') {
                this._moduleLogEnabled[moduleId] = Storage.getModuleLoggingEnabled(moduleId);
            }
            return this._moduleLogEnabled[moduleId];
        },
        
        setDebugEnabled(enabled) {
            this._debugEnabled = enabled;
            Storage.set('debug', enabled);
        },
        
        setVerboseEnabled(enabled) {
            this._verboseEnabled = enabled;
            Storage.set('verbose', enabled);
        },

        setSubmoduleLoggingEnabled(enabled) {
            this._submoduleEnabled = enabled;
            Storage.setSubmoduleLoggingEnabled(enabled);
        },

        setModuleLoggingEnabled(moduleId, enabled) {
            if (!moduleId) return;
            this._moduleLogEnabled[moduleId] = enabled;
            Storage.setModuleLoggingEnabled(moduleId, enabled);
        },

        onLog(listener) {
            this._listeners.add(listener);
            return () => this._listeners.delete(listener);
        },

        _emit(level, args) {
            if (!this._listeners.size) return;
            this._listeners.forEach((listener) => {
                try {
                    listener(level, args);
                } catch (e) {
                    // Ignore listener errors to keep logging stable
                }
            });
        },

        _getModulePrefix(moduleId) {
            const safeId = moduleId || 'unknown';
            return `${LOG_PREFIX} [${safeId}]`;
        },

        _shouldLogModule(moduleId) {
            return this.isSubmoduleLoggingEnabled() && this.isModuleLoggingEnabled(moduleId);
        },

        _logModule(level, msg, moduleId, ...args) {
            if (!this._shouldLogModule(moduleId)) return;
            const prefix = this._getModulePrefix(moduleId);
            let payload;
            if (level === 'debug') {
                payload = [`${prefix} 🔍 ${msg}`, ...args];
            } else if (level === 'warn') {
                payload = [`${prefix} ⚠️ ${msg}`, ...args];
            } else if (level === 'error') {
                payload = [`${prefix} ❌ ${msg}`, ...args];
            } else {
                payload = [`${prefix} ${msg}`, ...args];
            }
            console[level](...payload);
            this._emit(level, payload);
        },

        createModuleLogger(moduleIdSource) {
            const resolveModuleId = typeof moduleIdSource === 'function'
                ? moduleIdSource
                : () => moduleIdSource;
            return {
                log: (msg, ...args) => this._logModule('log', msg, resolveModuleId(), ...args),
                debug: (msg, ...args) => this._logModule('debug', msg, resolveModuleId(), ...args),
                warn: (msg, ...args) => this._logModule('warn', msg, resolveModuleId(), ...args),
                error: (msg, ...args) => this._logModule('error', msg, resolveModuleId(), ...args),
                isVerboseEnabled: () => this._shouldLogModule(resolveModuleId()),
                isDebugEnabled: () => this._shouldLogModule(resolveModuleId())
            };
        },
        
        log(msg, ...args) {
            if (this.isDebugEnabled()) {
                const payload = [`${LOG_PREFIX} ${msg}`, ...args];
                console.log(...payload);
                this._emit('log', payload);
            }
        },
        
        debug(msg, ...args) {
            if (this.isVerboseEnabled()) {
                const payload = [`${LOG_PREFIX} 🔍 ${msg}`, ...args];
                console.debug(...payload);
                this._emit('debug', payload);
            }
        },
        
        warn(msg, ...args) {
            const payload = [`${LOG_PREFIX} ⚠️ ${msg}`, ...args];
            console.warn(...payload);
            this._emit('warn', payload);
        },
        
        error(msg, ...args) {
            const payload = [`${LOG_PREFIX} ❌ ${msg}`, ...args];
            console.error(...payload);
            this._emit('error', payload);
        }
    };

    // ============= DOM SELECTORS (SAFE) =============
    const DomUtils = {
        _invalidSelectorLog: new Set(),
        
        _resolveRoot(options) {
            return (options && options.root) ? options.root : document;
        },
        
        _logInvalidSelector(selector, error, contextLabel) {
            const key = `${contextLabel || 'unknown'}::${selector}`;
            if (this._invalidSelectorLog.has(key)) return;
            this._invalidSelectorLog.add(key);
            const contextSuffix = contextLabel ? ` (${contextLabel})` : '';
            Logger.error(`Invalid selector${contextSuffix}: "${selector}"`, error);
        },
        
        query(selector, options = {}) {
            if (!selector) return null;
            const root = this._resolveRoot(options);
            if (!root || !root.querySelector) return null;
            try {
                return root.querySelector(selector);
            } catch (error) {
                this._logInvalidSelector(selector, error, options.context);
                return null;
            }
        },
        
        queryAll(selector, options = {}) {
            if (!selector) return [];
            const root = this._resolveRoot(options);
            if (!root || !root.querySelectorAll) return [];
            try {
                return Array.from(root.querySelectorAll(selector));
            } catch (error) {
                this._logInvalidSelector(selector, error, options.context);
                return [];
            }
        },
        
        closest(element, selector, options = {}) {
            if (!element || !selector || !element.closest) return null;
            try {
                return element.closest(selector);
            } catch (error) {
                this._logInvalidSelector(selector, error, options.context);
                return null;
            }
        }
    };
    
    Context.dom = DomUtils;

    // ============= ARCHETYPE MANAGER =============
    const ArchetypeManager = {
        archetypes: [],
        devArchetypes: [],
        corePlugins: [],
        devPlugins: [],
        currentArchetype: null,
        currentDevArchetype: null,
        
        async loadArchetypes() {
            // Always fetch archetypes on every page load - never cache
            // Add cache-busting timestamp to prevent browser-level caching
            const timestamp = Date.now();
            const url = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.archetypesPath}?t=${timestamp}`;
            
            Logger.debug(`🔍 Fetching archetypes from branch: ${GITHUB_CONFIG.branch} (${url})`);
            
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: {
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    },
                    onload: (response) => {
                        if (response.status === 200) {
                            try {
                                const config = JSON.parse(response.responseText);
                                this.archetypes = config.archetypes || [];
                                this.devArchetypes = config.devArchetypes || [];
                                this.corePlugins = config.corePlugins || [];
                                this.devPlugins = config.devPlugins || [];
                                this.settingsModalDocs = config.settingsModalDocs || [];
                                
                                // Check if script version is outdated
                                if (config.version) {
                                    const latestVersion = config.version;
                                    Context.latestVersion = latestVersion;
                                    // Simple version comparison: if versions don't match, consider outdated
                                    // This handles semantic versioning (e.g., "3.4.0" vs "3.4.1")
                                    Context.isOutdated = this._compareVersions(VERSION, latestVersion) < 0;
                                    if (Context.isOutdated) {
                                        Logger.warn(`⚠ Script version ${VERSION} is outdated. Latest version is ${latestVersion}`);
                                    }
                                } else {
                                    // No version in config, assume up to date
                                    Context.isOutdated = false;
                                    Context.latestVersion = VERSION;
                                }
                                
                                // Always log archetypes version (cannot be disabled)
                                console.log(`${LOG_PREFIX} archetypes v${config.archetypesVersion || 'unknown'}`);
                                
                                Logger.log(`✓ Loaded ${this.archetypes.length} archetypes from branch: ${GITHUB_CONFIG.branch}`);
                                resolve(config);
                            } catch (e) {
                                Logger.error('Failed to parse archetypes config:', e);
                                reject(e);
                            }
                        } else {
                            Logger.error(`Failed to load archetypes: ${response.status}`);
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    onerror: (error) => {
                        Logger.error('Network error loading archetypes:', error);
                        reject(error);
                    }
                });
            });
        },

        getCorePlugins() {
            return this.corePlugins || [];
        },

        getDevPlugins() {
            return this.devPlugins || [];
        },

        getSettingsModalDocs() {
            return this.settingsModalDocs || [];
        },
        
        /**
         * Compare two version strings (e.g., "3.4.0" vs "3.4.1")
         * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
         */
        _compareVersions(v1, v2) {
            const parts1 = v1.split('.').map(Number);
            const parts2 = v2.split('.').map(Number);
            const maxLength = Math.max(parts1.length, parts2.length);
            
            for (let i = 0; i < maxLength; i++) {
                const part1 = parts1[i] || 0;
                const part2 = parts2[i] || 0;
                if (part1 < part2) return -1;
                if (part1 > part2) return 1;
            }
            return 0;
        },
        
        /**
         * Detect archetype based on URL pattern, with optional selector disambiguation
         */
        detectArchetype() {
            return new Promise((resolve) => {
                const currentUrl = window.location.href;
                const currentPath = UrlMatcher.getPathFromUrl(currentUrl);
                Context.currentPath = currentPath;
                
                Logger.log(`Detecting archetype for path: "${currentPath}"`);
                
                // Step 1: Find all archetypes whose URL pattern matches
                const urlMatches = this.archetypes.filter(archetype => {
                    if (!archetype.urlPattern) {
                        Logger.debug(`Archetype ${archetype.id} has no urlPattern, skipping`);
                        return false;
                    }
                    return UrlMatcher.matches(currentPath, archetype.urlPattern);
                });
                
                Logger.debug(`URL pattern matches: ${urlMatches.map(a => a.id).join(', ') || 'none'}`);
                
                if (urlMatches.length === 0) {
                    Logger.warn('No archetype matched the current URL');
                    this.currentArchetype = null;
                    Context.currentArchetype = null;
                    resolve(null);
                    return;
                }
                
                // Step 2: If only one match, use it (no disambiguation needed)
                if (urlMatches.length === 1) {
                    const archetype = urlMatches[0];
                    Logger.log(`✓ Single URL match: ${archetype.id} - ${archetype.name}`);
                    this.currentArchetype = archetype;
                    Context.currentArchetype = archetype;
                    resolve(archetype);
                    return;
                }
                
                // Step 3: Multiple matches - sort by specificity first
                urlMatches.sort((a, b) => {
                    const specA = UrlMatcher.getSpecificity(a.urlPattern);
                    const specB = UrlMatcher.getSpecificity(b.urlPattern);
                    return specB - specA; // Higher specificity first
                });
                
                Logger.debug(`Sorted by specificity: ${urlMatches.map(a => `${a.id}(${UrlMatcher.getSpecificity(a.urlPattern)})`).join(', ')}`);
                
                // Step 4: Check if disambiguation is needed
                // If highest specificity archetype has no disambiguation selectors, use it
                // Otherwise, try to disambiguate using selectors
                const needsDisambiguation = urlMatches.some(a => 
                    a.disambiguationSelectors && a.disambiguationSelectors.length > 0
                );
                
                if (!needsDisambiguation) {
                    // Use the most specific URL match
                    const archetype = urlMatches[0];
                    Logger.log(`✓ Most specific URL match: ${archetype.id} - ${archetype.name}`);
                    this.currentArchetype = archetype;
                    Context.currentArchetype = archetype;
                    resolve(archetype);
                    return;
                }
                
                // Step 5: Disambiguation needed - wait for DOM and check selectors
                Logger.debug('Multiple URL matches with disambiguation selectors, waiting for DOM...');
                this._disambiguateWithSelectors(urlMatches, resolve);
            });
        },
        
        /**
         * Disambiguate between archetypes using DOM selectors
         */
        _disambiguateWithSelectors(candidates, resolve) {
            let attempts = 0;
            const maxAttempts = 20;
            const checkInterval = 250;
            
            const checkSelectors = () => {
                attempts++;
                
                // Check each candidate's disambiguation selectors
                for (const archetype of candidates) {
                    const selectors = archetype.disambiguationSelectors || [];
                    
                    // If no selectors, this archetype can't be confirmed via DOM
                    if (selectors.length === 0) {
                        continue;
                    }
                    
                    // Check if ALL disambiguation selectors are present
                    const allPresent = selectors.every(selector => {
                        const exists = Context.dom.query(selector, {
                            context: `archetype:${archetype.id}`
                        }) !== null;
                        Logger.debug(`  [${archetype.id}] Selector "${selector}": ${exists ? '✓' : '✗'}`);
                        return exists;
                    });
                    
                    if (allPresent) {
                        Logger.log(`✓ Disambiguated to: ${archetype.id} - ${archetype.name}`);
                        this.currentArchetype = archetype;
                        Context.currentArchetype = archetype;
                        resolve(archetype);
                        return;
                    }
                }
                
                // No disambiguation match yet
                if (attempts < maxAttempts) {
                    Logger.debug(`Disambiguation attempt ${attempts}/${maxAttempts}, retrying...`);
                    setTimeout(checkSelectors, checkInterval);
                } else {
                    // Fallback to most specific URL match
                    const fallback = candidates[0];
                    Logger.warn(`Disambiguation failed after ${maxAttempts} attempts, falling back to: ${fallback.id}`);
                    this.currentArchetype = fallback;
                    Context.currentArchetype = fallback;
                    resolve(fallback);
                }
            };
            
            // Start checking
            checkSelectors();
        },
        
        getPluginsForCurrentArchetype() {
            if (!this.currentArchetype) {
                return [];
            }
            return this.currentArchetype.plugins || [];
        },
        
        /**
         * Detect dev archetype based on URL pattern, with optional selector disambiguation
         * Same logic as detectArchetype() but uses devArchetypes array
         */
        detectDevArchetype() {
            return new Promise((resolve) => {
                const currentUrl = window.location.href;
                const currentPath = UrlMatcher.getPathFromUrl(currentUrl);
                
                Logger.log(`Detecting dev archetype for path: "${currentPath}"`);
                
                // Step 1: Find all dev archetypes whose URL pattern matches
                const urlMatches = this.devArchetypes.filter(archetype => {
                    if (!archetype.urlPattern) {
                        Logger.debug(`Dev archetype ${archetype.id} has no urlPattern, skipping`);
                        return false;
                    }
                    return UrlMatcher.matches(currentPath, archetype.urlPattern);
                });
                
                Logger.debug(`Dev archetype URL pattern matches: ${urlMatches.map(a => a.id).join(', ') || 'none'}`);
                
                if (urlMatches.length === 0) {
                    Logger.debug('No dev archetype matched the current URL');
                    this.currentDevArchetype = null;
                    resolve(null);
                    return;
                }
                
                // Step 2: If only one match, use it (no disambiguation needed)
                if (urlMatches.length === 1) {
                    const archetype = urlMatches[0];
                    Logger.log(`✓ Single dev archetype URL match: ${archetype.id} - ${archetype.name}`);
                    this.currentDevArchetype = archetype;
                    resolve(archetype);
                    return;
                }
                
                // Step 3: Multiple matches - sort by specificity first
                urlMatches.sort((a, b) => {
                    const specA = UrlMatcher.getSpecificity(a.urlPattern);
                    const specB = UrlMatcher.getSpecificity(b.urlPattern);
                    return specB - specA; // Higher specificity first
                });
                
                Logger.debug(`Sorted dev archetypes by specificity: ${urlMatches.map(a => `${a.id}(${UrlMatcher.getSpecificity(a.urlPattern)})`).join(', ')}`);
                
                // Step 4: Check if disambiguation is needed
                const needsDisambiguation = urlMatches.some(a => 
                    a.disambiguationSelectors && a.disambiguationSelectors.length > 0
                );
                
                if (!needsDisambiguation) {
                    // Use the most specific URL match
                    const archetype = urlMatches[0];
                    Logger.log(`✓ Most specific dev archetype URL match: ${archetype.id} - ${archetype.name}`);
                    this.currentDevArchetype = archetype;
                    resolve(archetype);
                    return;
                }
                
                // Step 5: Disambiguation needed - wait for DOM and check selectors
                Logger.debug('Multiple dev archetype URL matches with disambiguation selectors, waiting for DOM...');
                this._disambiguateDevArchetypeWithSelectors(urlMatches, resolve);
            });
        },
        
        /**
         * Disambiguate between dev archetypes using DOM selectors
         */
        _disambiguateDevArchetypeWithSelectors(candidates, resolve) {
            let attempts = 0;
            const maxAttempts = 20;
            const checkInterval = 250;
            
            const checkSelectors = () => {
                attempts++;
                
                // Check each candidate's disambiguation selectors
                for (const archetype of candidates) {
                    const selectors = archetype.disambiguationSelectors || [];
                    
                    // If no selectors, this archetype can't be confirmed via DOM
                    if (selectors.length === 0) {
                        continue;
                    }
                    
                    // Check if ALL disambiguation selectors are present
                    const allPresent = selectors.every(selector => {
                        const exists = Context.dom.query(selector, {
                            context: `devArchetype:${archetype.id}`
                        }) !== null;
                        Logger.debug(`  [dev:${archetype.id}] Selector "${selector}": ${exists ? '✓' : '✗'}`);
                        return exists;
                    });
                    
                    if (allPresent) {
                        Logger.log(`✓ Disambiguated to dev archetype: ${archetype.id} - ${archetype.name}`);
                        this.currentDevArchetype = archetype;
                        resolve(archetype);
                        return;
                    }
                }
                
                // No disambiguation match yet
                if (attempts < maxAttempts) {
                    Logger.debug(`Dev archetype disambiguation attempt ${attempts}/${maxAttempts}, retrying...`);
                    setTimeout(checkSelectors, checkInterval);
                } else {
                    // Fallback to most specific URL match
                    const fallback = candidates[0];
                    Logger.warn(`Dev archetype disambiguation failed after ${maxAttempts} attempts, falling back to: ${fallback.id}`);
                    this.currentDevArchetype = fallback;
                    resolve(fallback);
                }
            };
            
            // Start checking
            checkSelectors();
        },
        
        getPluginsForCurrentDevArchetype() {
            if (!this.currentDevArchetype) {
                return [];
            }
            return this.currentDevArchetype.plugins || [];
        }
    };

    // ============= PLUGIN LOADER =============
    const PluginLoader = {
        _loadedPluginFiles: new Set(),
        
        /**
         * Load plugin code from URL (but don't cache yet - version verification happens first)
         * @param {string} url - URL to fetch plugin from
         * @param {string} filename - Plugin filename
         * @param {string} sourcePath - Full path for caching (e.g., "qa-tool-use/plugin.js")
         * @param {string} version - Expected version (for logging only - actual verification happens later)
         * @returns {Promise<{code: string, version: string}>}
         */
        async loadPluginFromUrl(url, filename, sourcePath, version) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    onload: (response) => {
                        if (response.status === 200) {
                            const code = response.responseText;
                            // Don't cache here - version verification happens in loadPluginCode
                            // Cache will be set after verification passes
                            resolve({ code, version });
                        } else {
                            Logger.error(`Failed to load plugin ${filename}: ${response.status}`);
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    onerror: (error) => {
                        Logger.error(`Network error loading plugin ${filename}:`, error);
                        reject(error);
                    }
                });
            });
        },
        
        /**
         * Cache plugin code with version (called after version verification)
         * @param {string} filename - Plugin filename
         * @param {string} sourcePath - Full path for caching
         * @param {string} code - Plugin code
         * @param {string} version - Version to cache with
         */
        cachePluginCode(filename, sourcePath, code, version) {
            const pluginKey = Storage.getPluginKey(filename, sourcePath);
            Storage.setCachedPlugin(pluginKey, code, version);
            Logger.debug(`Cached plugin ${filename} v${version}`);
            
            // Register in cache registry for archetype plugins (not core/dev)
            // sourcePath format: "archetypes/archetypeId/main/filename" or "archetypes/archetypeId/dev/filename" or "core/main/filename" or "core/dev/filename"
            if (sourcePath && sourcePath.startsWith('archetypes/')) {
                const pathParts = sourcePath.split('/');
                // Format: archetypes/archetypeId/main/filename or archetypes/archetypeId/dev/filename
                if (pathParts.length >= 3) {
                    const archetypeId = pathParts[1];
                    Storage.registerCachedPlugin(archetypeId, filename);
                }
            }
        },
        
        /**
         * Load plugin code from cache or URL, with version verification
         * @param {string} filename - Plugin filename
         * @param {string} sourcePath - Full path for caching
         * @param {string} version - Required version
         * @param {string} url - URL to fetch from if not cached
         * @returns {Promise<string>} - Plugin code
         */
        async loadPluginCode(filename, sourcePath, version, url) {
            const pluginKey = Storage.getPluginKey(filename, sourcePath);
            const cached = Storage.getCachedPlugin(pluginKey);
            
            // Check if we have a cached version that matches
            if (cached && cached.version === version) {
                Logger.debug(`Using cached plugin ${filename} v${version}`);
                // Register in cache registry for archetype plugins (not core/dev)
                if (sourcePath && sourcePath.startsWith('archetypes/')) {
                    const pathParts = sourcePath.split('/');
                    // Format: archetypes/archetypeId/main/filename or archetypes/archetypeId/dev/filename
                    if (pathParts.length >= 3) {
                        const archetypeId = pathParts[1];
                        Storage.registerCachedPlugin(archetypeId, filename);
                    }
                }
                return cached.code;
            }
            
            // Version mismatch or not cached - try to fetch
            Logger.log(`Fetching plugin ${filename} v${version}${cached ? ` (cached: v${cached.version})` : ''}`);
            
            try {
                const result = await this.loadPluginFromUrl(url, filename, sourcePath, version);
                const fetchedCode = result.code;
                const trimmed = fetchedCode.trim();

                // If response looks like HTML (error page), don't attempt to parse as JS
                if (trimmed.startsWith('<')) {
                    Logger.warn(`Fetched content for ${filename} does not look like JavaScript (may be HTML error page). First 150 chars: ${trimmed.slice(0, 150).replace(/\s+/g, ' ')}`);
                    if (cached) {
                        Logger.warn(`Using cached v${cached.version} due to non-JS response`);
                        Context.outdatedPlugins.push({
                            filename: filename,
                            sourcePath: sourcePath,
                            cachedVersion: cached.version,
                            requiredVersion: version,
                            nonJsResponse: true
                        });
                        return cached.code;
                    }
                    throw new Error(`Server returned non-JS content for ${filename} (possible CDN/network issue). Try again later.`);
                }

                // Verify the fetched version by parsing the plugin
                // This protects against GitHub CDN cache delays
                try {
                    const parsedPlugin = this.parsePluginCode(fetchedCode, filename);
                    const fetchedVersion = parsedPlugin._version || parsedPlugin.version || null;
                    
                    if (fetchedVersion && fetchedVersion !== version) {
                        // Compare versions to determine if fetched is newer or older
                        const versionComparison = this._compareVersions(fetchedVersion, version);
                        
                        if (versionComparison > 0) {
                            // Fetched version is NEWER than required - this is good, not outdated
                            Logger.log(`✓ Fetched ${filename} has newer version v${fetchedVersion} (required v${version}). Using newer version.`);
                            // Cache with the newer fetched version
                            this.cachePluginCode(filename, sourcePath, fetchedCode, fetchedVersion);
                            Logger.debug(`Verified and cached ${filename} v${fetchedVersion} (newer than required v${version})`);
                            return fetchedCode;
                        } else {
                            // Fetched version is OLDER than required - GitHub CDN might be stale
                            Logger.warn(`⚠ Fetched ${filename} has version v${fetchedVersion}, expected v${version}. GitHub CDN may be stale.`);
                            
                            // Don't cache the wrong version - use old cache if available
                            if (cached) {
                                Logger.warn(`Using cached v${cached.version} instead of stale fetched version`);
                                Context.outdatedPlugins.push({
                                    filename: filename,
                                    sourcePath: sourcePath,
                                    cachedVersion: cached.version,
                                    requiredVersion: version,
                                    fetchedVersion: fetchedVersion
                                });
                                return cached.code;
                            } else {
                                // No cache available, but version is wrong - use it anyway with warning
                                Logger.warn(`No cache available, using fetched version v${fetchedVersion} (expected v${version})`);
                                Context.outdatedPlugins.push({
                                    filename: filename,
                                    sourcePath: sourcePath,
                                    cachedVersion: null,
                                    requiredVersion: version,
                                    fetchedVersion: fetchedVersion
                                });
                                // Don't cache the wrong version
                                return fetchedCode;
                            }
                        }
                    }
                    
                    // Version matches (or plugin doesn't declare version) - cache it
                    this.cachePluginCode(filename, sourcePath, fetchedCode, version);
                    Logger.debug(`Verified and cached ${filename} v${version}`);
                    return fetchedCode;
                    
                } catch (parseError) {
                    // Failed to parse - use old cache and surface the actual error for debugging
                    Logger.error(`Failed to parse fetched plugin ${filename} for version verification:`, parseError);
                    if (cached) {
                        Logger.warn(`Using cached v${cached.version} due to parse error`);
                        Context.outdatedPlugins.push({
                            filename: filename,
                            sourcePath: sourcePath,
                            cachedVersion: cached.version,
                            requiredVersion: version,
                            parseError: true,
                            parseErrorMessage: parseError && parseError.message ? parseError.message : String(parseError)
                        });
                        return cached.code;
                    }
                    // No cache, but can't parse - rethrow
                    throw parseError;
                }
                
            } catch (error) {
                // Fetch failed - use cached version if available (with warning)
                if (cached) {
                    Logger.warn(`⚠ Failed to fetch ${filename} v${version}, using cached v${cached.version}`);
                    Context.outdatedPlugins.push({
                        filename: filename,
                        sourcePath: sourcePath,
                        cachedVersion: cached.version,
                        requiredVersion: version
                    });
                    return cached.code;
                }
                // No cache available, rethrow error
                throw error;
            }
        },
        
        /**
         * Parse and execute plugin code
         * @param {string} code - Plugin code
         * @param {string} filename - Plugin filename
         * @returns {Object} - Plugin object
         */
        parsePluginCode(code, filename, options = {}) {
            try {
                const useModuleLogger = options.useModuleLogger === true;
                const moduleIdHint = options.moduleIdHint || filename;
                let resolvedModuleId = moduleIdHint;
                const moduleLogger = useModuleLogger
                    ? Logger.createModuleLogger(() => resolvedModuleId)
                    : Logger;
                const pluginFactory = new Function(
                    'PluginManager',
                    'Storage',
                    'Logger',
                    'Context',
                    'CleanupRegistry',
                    code + '\n\n// Return the plugin for registration\nreturn plugin;'
                );

                const plugin = pluginFactory(
                    PluginManager,
                    Storage,
                    moduleLogger,
                    Context,
                    CleanupRegistry
                );
                if (useModuleLogger && plugin && plugin.id) {
                    resolvedModuleId = plugin.id;
                }
                return plugin;
            } catch (e) {
                Logger.error(`Failed to parse plugin ${filename}:`, e);
                throw e;
            }
        },
        
        /**
         * Load a core plugin with versioning support
         * @param {string} filename - Plugin filename
         * @param {string} version - Required version
         * @returns {Promise<Object>} - Plugin object
         */
        async loadCorePlugin(filename, version) {
            const sourcePath = `core/main/${filename}`;
            const url = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.pluginsPath}/${sourcePath}`;
            
            // Load plugin code with versioning
            const code = await this.loadPluginCode(filename, sourcePath, version, url);
            const plugin = this.parsePluginCode(code, filename, { useModuleLogger: false });
            this._loadedPluginFiles.add(sourcePath);
            Logger.debug(`Loaded core plugin ${filename} v${version}`);
            return plugin;
        },

        /**
         * Load a dev plugin with versioning support
         * @param {string} filename - Plugin filename
         * @param {string} version - Required version
         * @returns {Promise<Object>} - Plugin object
         */
        async loadDevPlugin(filename, version) {
            const sourcePath = `core/dev/${filename}`;
            const url = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.pluginsPath}/${sourcePath}`;

            const code = await this.loadPluginCode(filename, sourcePath, version, url);
            const plugin = this.parsePluginCode(code, filename, { useModuleLogger: false });
            this._loadedPluginFiles.add(sourcePath);
            Logger.debug(`Loaded dev plugin ${filename} v${version}`);
            return plugin;
        },
        
        /**
         * Load an archetype plugin with versioning support
         * @param {string} filename - The plugin filename (e.g., "source-data-explorer.js")
         * @param {string} version - Required version (e.g., "1.0")
         * @param {string} archetypeId - The archetype ID (e.g., "k-taskCreation")
         * @returns {Promise} - Resolves with the plugin object
         */
        async loadArchetypePlugin(filename, version, archetypeId) {
            // Archetype plugins must always live under: plugins/archetypes/<archetypeId>/main/<filename>
            if (filename.includes('/')) {
                throw new Error(
                    `Invalid archetype plugin name "${filename}". Plugin names must be filenames only (no folder paths).`
                );
            }

            const sourcePath = `archetypes/${archetypeId}/main/${filename}`;
            const url = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.pluginsPath}/${sourcePath}`;

            const code = await this.loadPluginCode(filename, sourcePath, version, url);
            const plugin = this.parsePluginCode(code, filename, { useModuleLogger: true });
            this._loadedPluginFiles.add(sourcePath);
            Logger.debug(`Loaded ${filename} v${version} from ${sourcePath}`);
            return plugin;
        },
        
        /**
         * Load a dev archetype plugin with versioning support
         * Dev archetype plugins live under: plugins/archetypes/<archetypeId>/dev/<filename>
         * @param {string} filename - The plugin filename (e.g., "source-data-explorer.js")
         * @param {string} version - Required version (e.g., "1.0")
         * @param {string} archetypeId - The archetype ID (e.g., "qa-tool-use")
         * @returns {Promise} - Resolves with the plugin object
         */
        async loadDevArchetypePlugin(filename, version, archetypeId) {
            // Dev archetype plugins must always live under: plugins/archetypes/<archetypeId>/dev/<filename>
            if (filename.includes('/')) {
                throw new Error(
                    `Invalid dev archetype plugin name "${filename}". Plugin names must be filenames only (no folder paths).`
                );
            }

            const sourcePath = `archetypes/${archetypeId}/dev/${filename}`;
            const url = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.pluginsPath}/${sourcePath}`;

            const code = await this.loadPluginCode(filename, sourcePath, version, url);
            const plugin = this.parsePluginCode(code, filename, { useModuleLogger: true });
            this._loadedPluginFiles.add(sourcePath);
            Logger.debug(`Loaded dev archetype plugin ${filename} v${version} from ${sourcePath}`);
            return plugin;
        },

        /**
         * Load a single settings modal doc (markdown) from cache or URL
         * @param {string} filename - Doc filename (e.g. "information-tab.md")
         * @param {string} version - Required version from archetypes.json
         * @returns {Promise<void>}
         */
        async loadSettingsModalDoc(filename, version) {
            Context.settingsModalDocs = Context.settingsModalDocs || {};
            const cached = Storage.getCachedSettingsDoc(filename);
            if (cached && cached.version === version) {
                Logger.debug(`Using cached settings doc ${filename} v${version}`);
                Context.settingsModalDocs[filename] = { raw: cached.raw, version };
                return;
            }
            const url = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/docs/settings-modal/${filename}`;
            Logger.log(`Fetching settings doc ${filename} v${version}${cached ? ` (cached: v${cached.version})` : ''}`);
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    onload: (response) => {
                        if (response.status === 200) {
                            const raw = response.responseText || '';
                            Storage.setCachedSettingsDoc(filename, raw, version);
                            Context.settingsModalDocs[filename] = { raw, version };
                            Logger.debug(`Loaded settings doc ${filename} v${version}`);
                        } else {
                            Logger.warn(`Settings doc ${filename} failed: HTTP ${response.status}`);
                        }
                        resolve();
                    },
                    onerror: (err) => {
                        Logger.warn(`Settings doc ${filename} network error:`, err);
                        resolve();
                    }
                });
            });
        },

        /**
         * Load all settings modal docs from archetypes config (on page load)
         * @param {Array<{name: string, version: string}>} docsList - From ArchetypeManager.getSettingsModalDocs()
         */
        async loadSettingsModalDocs(docsList) {
            if (!docsList || docsList.length === 0) return;
            Context.settingsModalDocs = Context.settingsModalDocs || {};
            for (const doc of docsList) {
                const name = doc.name;
                const version = doc.version;
                if (!name || !version) continue;
                await this.loadSettingsModalDoc(name, version);
            }
        },
        
        async loadPluginsFromConfig(pluginList, type) {
            if (!pluginList || pluginList.length === 0) {
                Logger.debug(`No ${type} plugins configured`);
                return;
            }

            const normalizedType = type === 'dev' ? 'dev' : 'core';
            Logger.log(`Loading ${pluginList.length} ${normalizedType} plugin(s)...`);

            const loader = normalizedType === 'dev'
                ? this.loadDevPlugin.bind(this)
                : this.loadCorePlugin.bind(this);

            for (const pluginDef of pluginList) {
                // Support both old format (string) and new format (object with name and version)
                let filename, version;
                if (typeof pluginDef === 'string') {
                    // Backward compatibility: if just a string, default to version 1.0
                    filename = pluginDef;
                    version = '1.0';
                } else if (pluginDef && pluginDef.name && pluginDef.version) {
                    filename = pluginDef.name;
                    version = pluginDef.version;
                } else {
                    Logger.error(`Invalid ${normalizedType} plugin definition:`, pluginDef);
                    continue;
                }
                
                Logger.debug(`🔍 archetypes.json requests ${normalizedType} plugin ${filename} v${version}`);
                
                try {
                    const plugin = await loader(filename, version);
                    const loadedVersion = plugin._version || plugin.version || version;
                    plugin._sourceFile = filename;
                    plugin._version = loadedVersion;
                    plugin._isCore = true;
                    if (normalizedType === 'dev') {
                        plugin._isDev = true;
                    }
                    PluginManager.register(plugin);
                    Logger.log(`✓ Loaded ${normalizedType} plugin: ${filename} v${loadedVersion}`);
                } catch (err) {
                    Logger.error(`✗ Failed to load ${normalizedType} plugin: ${filename} v${version}`, err);
                }
            }
        },
        
        async loadPluginsForArchetype(pluginList, archetypeId) {
            if (!pluginList || pluginList.length === 0) {
                Logger.log('No plugins to load for this archetype');
                return;
            }
            
            if (!archetypeId) {
                Logger.error('Archetype ID required to load plugins');
                return;
            }
            
            Logger.log(`Loading ${pluginList.length} archetype plugin(s) for ${archetypeId}...`);
            const loadPromises = [];
            
            for (const pluginDef of pluginList) {
                // Support both old format (string) and new format (object with name and version)
                let filename, version;
                if (typeof pluginDef === 'string') {
                    // Backward compatibility: if just a string, default to version 1.0
                    filename = pluginDef;
                    version = '1.0';
                } else if (pluginDef && pluginDef.name && pluginDef.version) {
                    filename = pluginDef.name;
                    version = pluginDef.version;
                } else {
                    Logger.error('Invalid plugin definition:', pluginDef);
                    continue;
                }

                Logger.debug(`🔍 archetypes.json requests archetype plugin ${filename} v${version} for ${archetypeId}`);

                if (filename.includes('/')) {
                    Logger.error(
                        `Invalid archetype plugin name "${filename}". Plugin names must be filenames only (no folder paths).`
                    );
                    continue;
                }
                
                // Check if already loaded
                const existingPlugins = PluginManager.getAll();
                const alreadyLoadedByFile = existingPlugins.some(p => p._sourceFile === filename);
                
                const sourcePath = `archetypes/${archetypeId}/main/${filename}`;
                const alreadyLoadedByPath = this._loadedPluginFiles.has(sourcePath);
                
                if (alreadyLoadedByFile || alreadyLoadedByPath) {
                    Logger.debug(`Plugin ${filename} already loaded, skipping fetch`);
                    continue;
                }
                
                loadPromises.push(
                    this.loadArchetypePlugin(filename, version, archetypeId)
                        .then(plugin => {
                            const loadedVersion = plugin._version || plugin.version || version;
                            plugin._sourceFile = filename;
                            plugin._version = loadedVersion;
                            plugin._isCore = false;
                            PluginManager.register(plugin);
                            Logger.log(`✓ Loaded plugin: ${filename} v${loadedVersion}`);
                        })
                        .catch(err => {
                            Logger.error(`✗ Failed to load plugin: ${filename} v${version}`, err);
                        })
                );
            }
            
            await Promise.allSettled(loadPromises);
            
            // Log warnings about outdated plugins
            if (Context.outdatedPlugins.length > 0) {
                Logger.warn(`⚠ ${Context.outdatedPlugins.length} plugin(s) are using outdated cached versions:`);
                Context.outdatedPlugins.forEach(p => {
                    Logger.warn(`  - ${p.filename}: cached v${p.cachedVersion}, required v${p.requiredVersion}`);
                });
            }
            
            // Clean up deprecated cached plugins for this archetype
            this.cleanupDeprecatedCache(pluginList, archetypeId);
            
            Logger.log('Archetype plugin loading complete');
        },
        
        /**
         * Load dev archetype plugins (similar to loadPluginsForArchetype but uses dev path)
         * @param {Array} pluginList - List of dev archetype plugins
         * @param {string} archetypeId - The dev archetype ID
         */
        async loadPluginsForDevArchetype(pluginList, archetypeId) {
            if (!pluginList || pluginList.length === 0) {
                Logger.log('No dev archetype plugins to load');
                return;
            }
            
            if (!archetypeId) {
                Logger.error('Dev archetype ID required to load plugins');
                return;
            }
            
            Logger.log(`Loading ${pluginList.length} dev archetype plugin(s) for ${archetypeId}...`);
            const loadPromises = [];
            
            for (const pluginDef of pluginList) {
                // Support both old format (string) and new format (object with name and version)
                let filename, version;
                if (typeof pluginDef === 'string') {
                    // Backward compatibility: if just a string, default to version 1.0
                    filename = pluginDef;
                    version = '1.0';
                } else if (pluginDef && pluginDef.name && pluginDef.version) {
                    filename = pluginDef.name;
                    version = pluginDef.version;
                } else {
                    Logger.error('Invalid dev archetype plugin definition:', pluginDef);
                    continue;
                }

                Logger.debug(`🔍 archetypes.json requests dev archetype plugin ${filename} v${version} for ${archetypeId}`);

                if (filename.includes('/')) {
                    Logger.error(
                        `Invalid dev archetype plugin name "${filename}". Plugin names must be filenames only (no folder paths).`
                    );
                    continue;
                }
                
                // Check if already loaded
                const existingPlugins = PluginManager.getAll();
                const alreadyLoadedByFile = existingPlugins.some(p => p._sourceFile === filename && p._isDev);
                
                const sourcePath = `archetypes/${archetypeId}/dev/${filename}`;
                const alreadyLoadedByPath = this._loadedPluginFiles.has(sourcePath);
                
                if (alreadyLoadedByFile || alreadyLoadedByPath) {
                    Logger.debug(`Dev archetype plugin ${filename} already loaded, skipping fetch`);
                    continue;
                }
                
                loadPromises.push(
                    this.loadDevArchetypePlugin(filename, version, archetypeId)
                        .then(plugin => {
                            const loadedVersion = plugin._version || plugin.version || version;
                            plugin._sourceFile = filename;
                            plugin._version = loadedVersion;
                            plugin._isCore = false;
                            plugin._isDev = true;
                            PluginManager.register(plugin);
                            Logger.log(`✓ Loaded dev archetype plugin: ${filename} v${loadedVersion}`);
                        })
                        .catch(err => {
                            Logger.error(`✗ Failed to load dev archetype plugin: ${filename} v${version}`, err);
                        })
                );
            }
            
            await Promise.allSettled(loadPromises);
            
            // Log warnings about outdated plugins
            if (Context.outdatedPlugins.length > 0) {
                Logger.warn(`⚠ ${Context.outdatedPlugins.length} dev archetype plugin(s) are using outdated cached versions:`);
                Context.outdatedPlugins.forEach(p => {
                    Logger.warn(`  - ${p.filename}: cached v${p.cachedVersion}, required v${p.requiredVersion}`);
                });
            }
            
            // Clean up deprecated cached plugins for this dev archetype
            this.cleanupDeprecatedCache(pluginList, archetypeId);
            
            Logger.log('Dev archetype plugin loading complete');
        },
        
        /**
         * Clean up deprecated cached plugins for an archetype
         * Compares cached plugins against expected plugins from archetypes.json
         * and deletes any cached entries that are no longer listed
         * @param {Array} pluginList - List of expected plugins from archetypes.json
         * @param {string} archetypeId - The archetype ID
         */
        cleanupDeprecatedCache(pluginList, archetypeId) {
            if (!archetypeId) {
                Logger.debug('Skipping deprecated cache cleanup: no archetype ID');
                return;
            }
            
            if (!pluginList || !Array.isArray(pluginList)) {
                Logger.debug('Skipping deprecated cache cleanup: invalid plugin list');
                return;
            }
            
            // Extract expected plugin filenames from pluginList
            const expectedFilenames = new Set();
            pluginList.forEach(pluginDef => {
                let filename;
                if (typeof pluginDef === 'string') {
                    filename = pluginDef;
                } else if (pluginDef && pluginDef.name) {
                    filename = pluginDef.name;
                }
                if (filename) {
                    expectedFilenames.add(filename);
                }
            });
            
            // Get cached plugins for this archetype
            const cachedPlugins = Storage.getCachedPluginsForArchetype(archetypeId);
            
            if (cachedPlugins.length === 0) {
                Logger.debug(`No cached plugins found for archetype: ${archetypeId}`);
                return;
            }
            
            // Find deprecated plugins (cached but not in expected list)
            const deprecatedPlugins = cachedPlugins.filter(filename => !expectedFilenames.has(filename));
            
            if (deprecatedPlugins.length === 0) {
                Logger.debug(`No deprecated cached plugins found for archetype: ${archetypeId}`);
                return;
            }
            
            // Delete deprecated cache entries
            // Try both old format (archetypeId/filename) and new format (archetypes/archetypeId/main/filename and archetypes/archetypeId/dev/filename)
            let deletedCount = 0;
            deprecatedPlugins.forEach(filename => {
                // Try old format first (for backward compatibility)
                const oldPluginKey = `${archetypeId}/${filename}`;
                const oldCacheKey = `plugin-cache-${oldPluginKey}`;
                
                // Try new format for main plugins
                const newMainPluginKey = `archetypes/${archetypeId}/main/${filename}`;
                const newMainCacheKey = `plugin-cache-${newMainPluginKey}`;
                
                // Try new format for dev plugins
                const newDevPluginKey = `archetypes/${archetypeId}/dev/${filename}`;
                const newDevCacheKey = `plugin-cache-${newDevPluginKey}`;
                
                // Check all possible cache key formats
                const cacheKeys = [
                    { key: oldCacheKey, format: 'old' },
                    { key: newMainCacheKey, format: 'new-main' },
                    { key: newDevCacheKey, format: 'new-dev' }
                ];
                
                let deleted = false;
                for (const { key, format } of cacheKeys) {
                    const cacheExists = Storage.get(key, null) !== null;
                    if (cacheExists) {
                        try {
                            Storage.delete(key);
                            deleted = true;
                            Logger.log(`Deleted deprecated cached plugin: ${filename} (archetype: ${archetypeId}, format: ${format})`);
                            break; // Only delete once
                        } catch (e) {
                            Logger.error(`Failed to delete deprecated cache entry for ${filename} (archetype: ${archetypeId}, format: ${format}):`, e);
                        }
                    }
                }
                
                if (deleted) {
                    deletedCount++;
                }
                
                // Always clean up the registry entry
                try {
                    Storage.unregisterCachedPlugin(archetypeId, filename);
                    if (!deleted) {
                        Logger.debug(`Cleaned up orphaned registry entry for ${filename} (archetype: ${archetypeId})`);
                    }
                } catch (e) {
                    Logger.error(`Failed to unregister cache entry for ${filename} (archetype: ${archetypeId}):`, e);
                }
            });
            
            if (deletedCount > 0) {
                Logger.log(`✓ Cleaned up ${deletedCount} deprecated cached plugin(s) for archetype: ${archetypeId}`);
            }
        }
    };

    // ============= PLUGIN MANAGER =============
    const PluginManager = {
        plugins: {},
        
        register(plugin) {
            if (!plugin.id) {
                Logger.error('Plugin must have an id');
                return;
            }
            this.plugins[plugin.id] = {
                ...plugin,
                state: plugin.initialState ? { ...plugin.initialState } : {},
            };
            Logger.debug(`Registered plugin: ${plugin.id}`);
        },
        
        get(id) {
            return this.plugins[id];
        },
        
        getAll() {
            return Object.values(this.plugins);
        },
        
        getCorePlugins() {
            return this.getAll().filter(p => p._isCore === true);
        },
        
        getArchetypePlugins() {
            return this.getAll().filter(p => p._isCore !== true);
        },
        
        getDevPlugins() {
            return this.getAll().filter(p => p._isDev === true);
        },
        
        isEnabled(id) {
            return Storage.getPluginEnabled(id);
        },
        
        setEnabled(id, enabled) {
            Storage.setPluginEnabled(id, enabled);
        },
        
        cleanupArchetypePlugins() {
            this.getArchetypePlugins().forEach(plugin => {
                try {
                    if (plugin.destroy) {
                        plugin.destroy(plugin.state, Context);
                        Logger.debug(`✓ Destroyed plugin: ${plugin.id}`);
                    }
                    plugin.state = plugin.initialState ? { ...plugin.initialState } : {};
                } catch (e) {
                    Logger.error(`Error destroying plugin ${plugin.id}:`, e);
                }
            });
        },
        
        clearArchetypePlugins() {
            this.cleanupArchetypePlugins();
            const archetypePluginIds = this.getArchetypePlugins().map(p => p.id);
            archetypePluginIds.forEach(id => {
                delete this.plugins[id];
            });
        },
        
        runCorePlugins() {
            this.getCorePlugins()
                .filter(p => this.isEnabled(p.id))
                .forEach(plugin => {
                    try {
                        if (plugin.init) plugin.init(plugin.state, Context);
                        Logger.log(`✓ Core plugin initialized: ${plugin.id}`);
                    } catch (e) {
                        Logger.error(`Error in core plugin ${plugin.id}:`, e);
                    }
                });
        },
        
        runEarlyPlugins() {
            this.getArchetypePlugins()
                .filter(p => p.phase === 'early' && this.isEnabled(p.id))
                .forEach(plugin => {
                    try {
                        if (plugin.init) plugin.init(plugin.state, Context);
                        Logger.log(`✓ Early plugin initialized: ${plugin.id}`);
                    } catch (e) {
                        Logger.error(`Error in early plugin ${plugin.id}:`, e);
                    }
                });
        },
        
        runInitPlugins() {
            this.getArchetypePlugins()
                .filter(p => p.phase === 'init' && this.isEnabled(p.id))
                .forEach(plugin => {
                    try {
                        if (plugin.init) plugin.init(plugin.state, Context);
                        Logger.log(`✓ Init plugin initialized: ${plugin.id}`);
                    } catch (e) {
                        Logger.error(`Error in init plugin ${plugin.id}:`, e);
                    }
                });
        },
        
        runMutationPlugins() {
            this.getArchetypePlugins()
                .filter(p => p.phase === 'mutation' && this.isEnabled(p.id))
                .forEach(plugin => {
                    try {
                        if (plugin.onMutation) plugin.onMutation(plugin.state, Context);
                    } catch (e) {
                        Logger.error(`Error in mutation plugin ${plugin.id}:`, e);
                    }
                });
        }
    };

    // ============= MAIN INITIALIZATION =============
    let mainObserver = null;
    let mutationRafId = null;
    let corePluginsLoaded = false;
    
    async function initializeCorePlugins() {
        if (corePluginsLoaded) {
            Logger.debug('Core plugins already loaded');
            return;
        }

        await ArchetypeManager.loadArchetypes();
        const settingsDocs = ArchetypeManager.getSettingsModalDocs();
        if (settingsDocs.length > 0) {
            await PluginLoader.loadSettingsModalDocs(settingsDocs);
        }
        // Load dev plugins first (e.g. logger-panel) so they are available before core plugins.
        if (DEV_SCRIPTS_ENABLED) {
            const devPlugins = ArchetypeManager.getDevPlugins();
            await PluginLoader.loadPluginsFromConfig(devPlugins, 'dev');
        }
        const corePlugins = ArchetypeManager.getCorePlugins();
        await PluginLoader.loadPluginsFromConfig(corePlugins, 'core');
        corePluginsLoaded = true;
        
        await waitForBody();
        PluginManager.runCorePlugins();
    }
    
    async function initializeForPage() {
        Logger.log('Initializing for current page...');
        
        try {
            // Load archetype definitions (cached after first load)
            await ArchetypeManager.loadArchetypes();
            
            // Wait for DOM
            await waitForBody();
            
            // Detect archetype using URL + optional disambiguation
            const archetype = await ArchetypeManager.detectArchetype();
            
            if (!archetype) {
                Logger.warn('No matching archetype found. No archetype plugins will load.');
                return;
            }
            
            // Load archetype-specific plugins
            const pluginsToLoad = ArchetypeManager.getPluginsForCurrentArchetype();
            await PluginLoader.loadPluginsForArchetype(pluginsToLoad, archetype.id);
            
            // Load dev archetype plugins (if dev scripts enabled)
            if (DEV_SCRIPTS_ENABLED) {
                const devArchetype = await ArchetypeManager.detectDevArchetype();
                if (devArchetype) {
                    const devPluginsToLoad = ArchetypeManager.getPluginsForCurrentDevArchetype();
                    await PluginLoader.loadPluginsForDevArchetype(devPluginsToLoad, devArchetype.id);
                }
            }
            
            // Run early plugins
            PluginManager.runEarlyPlugins();
            
            // Set up DOM observer with rAF coalescing so rapid mutations (e.g. partial load)
            // trigger one plugin run per frame instead of one per batch
            mainObserver = new MutationObserver(() => {
                if (!Context.initialized) return;
                if (mutationRafId !== null) return;
                mutationRafId = requestAnimationFrame(() => {
                    mutationRafId = null;
                    PluginManager.runMutationPlugins();
                });
            });
            CleanupRegistry.registerObserver(mainObserver);
            
            // Run init plugins and start observing
            Context.initialized = true;
            PluginManager.runInitPlugins();
            
            mainObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class']
            });
            
            // Run mutation plugins once for initial state
            PluginManager.runMutationPlugins();
            
            Logger.log(`✓ Initialized for archetype: ${archetype.name} (path: "${Context.currentPath}")`);
        } catch (error) {
            Logger.error('Failed to initialize:', error);
        }
    }
    
    /**
     * Extract a specific query parameter from a URL
     * @param {string} url - The full URL
     * @param {string} param - The parameter name to extract
     * @returns {string|null} - The parameter value or null if not found
     */
    function getQueryParam(url, param) {
        try {
            const urlObj = new URL(url);
            return urlObj.searchParams.get(param);
        } catch (e) {
            return null;
        }
    }
    
    async function handleNavigation(newUrl, previousUrl) {
        Logger.log('Handling navigation, checking URL diff...');

        if (newUrl === previousUrl) {
            Logger.log('URL is the same, skipping...');
            return;
        }
        
        // Check if task_project_target_id matches - if so, don't reload
        // This prevents reload when only instance_id changes (e.g., backend reset)
        const previousProjectId = getQueryParam(previousUrl, 'task_project_target_id');
        const newProjectId = getQueryParam(newUrl, 'task_project_target_id');
        
        if (previousProjectId && newProjectId && previousProjectId === newProjectId) {
            Logger.log(`Navigation has same task_project_target_id (${newProjectId}), skipping reload...`);
            return;
        }

        Logger.log('Handling navigation, checking archetype match...');
        
        try {
            await ArchetypeManager.loadArchetypes();
            
            const newPath = UrlMatcher.getPathFromUrl(newUrl);
            const matchesArchetype = ArchetypeManager.archetypes.some(archetype => {
                if (!archetype.urlPattern) {
                    return false;
                }
                return UrlMatcher.matches(newPath, archetype.urlPattern);
            });
            
            if (matchesArchetype) {
                Logger.log('Navigation target matches archetype; refreshing page...');
                location.reload();
                return;
            }
        } catch (error) {
            Logger.error('Failed to check archetype match on navigation:', error);
        }
        
        Logger.log('Handling navigation, reinitializing...');
        
        // Clean up archetype plugins and resources
        Context.initialized = false;
        Context.outdatedPlugins = []; // Clear outdated plugins list on navigation
        if (mutationRafId !== null) {
            cancelAnimationFrame(mutationRafId);
            mutationRafId = null;
        }
        PluginManager.cleanupArchetypePlugins();
        CleanupRegistry.cleanup();
        
        // Clear archetype plugins
        PluginManager.clearArchetypePlugins();
        PluginLoader._loadedPluginFiles.clear();
        
        // Small delay to let SPA finish its DOM updates
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Reinitialize for the new page
        await initializeForPage();
    }
    
    function waitForBody() {
        return new Promise((resolve) => {
            if (document.body) {
                resolve();
            } else {
                const observer = new MutationObserver(() => {
                    if (document.body) {
                        observer.disconnect();
                        resolve();
                    }
                });
                observer.observe(document.documentElement, { childList: true, subtree: true });
            }
        });
    }
    
    // ============= STARTUP =============
    async function startup() {
        // Always log script version (cannot be disabled)
        console.log(`${LOG_PREFIX} v${VERSION}`);
        Logger.log('Starting...');
        
        // Initialize navigation monitoring FIRST
        NavigationManager.init();
        NavigationManager.onNavigate(handleNavigation);
        
        // Wait for body
        await waitForBody();
        
        // Load and initialize core plugins
        await initializeCorePlugins();
        
        // Initialize archetype-specific plugins
        await initializeForPage();
    }
    
    // Start!
    startup();
})();
