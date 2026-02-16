
// settings-ui.js
// Core plugin that provides the settings UI - persists across navigation

const plugin = {
    id: 'settings-ui',
    name: 'Settings UI',
    description: 'Provides the settings panel for managing plugins',
    _version: '5.25',
    phase: 'core', // Special phase - loaded once, never cleaned up
    enabledByDefault: true,
    
    // Internal state (not reset on navigation)
    _buttonCreated: false,
    _modalOpen: false,
    _presenceInterval: null,
    _pulseInterval: null,
    _docPaneCache: {},
    
    init(state, context) {
        this._ensureSettingsButton();
        this._ensureModalPresence();
        this._startPresenceGuard();
        this._updatePulseAnimation();
    },
    
    // No destroy method - this plugin persists
    
    _ensureSettingsButton() {
        if (!document.body) return;
        let settingsBtn = document.getElementById('wf-settings-btn');
        if (!settingsBtn) {
            settingsBtn = document.createElement('button');
            settingsBtn.id = 'wf-settings-btn';
            document.body.appendChild(settingsBtn);
            if (!this._buttonCreated) {
                Logger.log('✓ Settings UI initialized');
                this._buttonCreated = true;
            }
        }
        this._applySettingsButtonBehavior(settingsBtn);
    },

    _applySettingsButtonBehavior(settingsBtn) {
        if (!settingsBtn) return;
        settingsBtn.type = 'button';
        settingsBtn.title = 'Fleet Enhancer Settings';
        
        // Check if we should pulse before setting base styles
        const shouldPulse = Context.isOutdated || (Context.isDevBranch && this._getPulseOverrideEnabled());
        const isAlreadyPulsing = this._pulseInterval !== null;
        
        // If button is already bound and pulsing, don't reset styles that interfere with animation
        const isBound = settingsBtn.dataset.wfSettingsBound === 'true';
        
        if (!isBound || !isAlreadyPulsing) {
            const baseStyles = `
                position: fixed;
                bottom: 20px;
                left: 20px;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: var(--background, white);
                border: 1px solid #60a5fa;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 9999;
                transition: ${shouldPulse ? 'border 1s ease, box-shadow 1s ease' : 'all 0.2s'};
            `;
            
            settingsBtn.style.cssText = baseStyles;
        } else if (isAlreadyPulsing) {
            // Only update transition if pulsing, don't reset border/box-shadow
            settingsBtn.style.transition = 'border 1s ease, box-shadow 1s ease';
        }
        
        // Add pulsing animation if outdated or simulate update banner is enabled (dev branch only)
        if (shouldPulse) {
            settingsBtn.classList.add('wf-settings-outdated');
            if (!isAlreadyPulsing) {
                this._startPulseAnimation(settingsBtn);
            }
        } else {
            settingsBtn.classList.remove('wf-settings-outdated');
            this._stopPulseAnimation();
        }
        settingsBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
        `;

        if (settingsBtn.dataset.wfSettingsBound === 'true') return;
        settingsBtn.dataset.wfSettingsBound = 'true';

        settingsBtn.addEventListener('mouseenter', () => {
            settingsBtn.style.transform = 'scale(1.1)';
            settingsBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        });

        settingsBtn.addEventListener('mouseleave', () => {
            settingsBtn.style.transform = 'scale(1)';
            settingsBtn.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
        });

        settingsBtn.addEventListener('click', () => this._toggleModal());
    },
    
    _startPulseAnimation(settingsBtn) {
        if (!settingsBtn) return;
        
        // Stop existing animation if any
        if (this._pulseInterval) {
            clearInterval(this._pulseInterval);
            this._pulseInterval = null;
        }
        
        // Ensure smooth transitions
        settingsBtn.style.transition = 'border 1s ease, box-shadow 1s ease';
        
        // Set initial state (start with red outline)
        settingsBtn.style.border = '2px solid #dc2626';
        settingsBtn.style.boxShadow = '0 2px 8px rgba(220, 38, 38, 0.4)';
        
        let isOn = true; // Start with red outline (on state)
        this._pulseInterval = setInterval(() => {
            isOn = !isOn;
            if (isOn) {
                settingsBtn.style.border = '2px solid #dc2626';
                settingsBtn.style.boxShadow = '0 2px 8px rgba(220, 38, 38, 0.4)';
            } else {
                settingsBtn.style.border = '1px solid #60a5fa';
                settingsBtn.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
            }
        }, 1000); // 1 second per state
    },
    
    _stopPulseAnimation() {
        if (this._pulseInterval) {
            clearInterval(this._pulseInterval);
            this._pulseInterval = null;
        }
        const settingsBtn = document.getElementById('wf-settings-btn');
        if (settingsBtn) {
            settingsBtn.style.border = '1px solid #60a5fa';
            settingsBtn.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
        }
    },
    
    _updatePulseAnimation() {
        const settingsBtn = document.getElementById('wf-settings-btn');
        if (!settingsBtn) {
            Logger.debug('Settings button not found for pulse animation update');
            return;
        }
        
        const shouldPulse = Context.isOutdated || (Context.isDevBranch && this._getPulseOverrideEnabled());
        
        if (shouldPulse) {
            this._startPulseAnimation(settingsBtn);
        } else {
            this._stopPulseAnimation();
        }
    },
    
    _toggleModal() {
        let modal = document.getElementById('wf-settings-modal');
        
        if (this._modalOpen && modal) {
            this._closeModal();
        } else {
            // Always recreate modal content when opening to get fresh plugin list
            if (modal) modal.remove();
            modal = this._createModal();
            modal.style.display = 'block';
            this._modalOpen = true;
        }
    },

    _ensureModalPresence() {
        if (!this._modalOpen) return;
        const modal = document.getElementById('wf-settings-modal');
        if (!modal) {
            const recreated = this._createModal();
            recreated.style.display = 'block';
        }
    },
    
    _closeModal() {
        const modal = document.getElementById('wf-settings-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        const msg = document.getElementById('wf-settings-message');
        if (msg) {
            msg.style.display = 'none';
        }
        this._modalOpen = false;
    },

    _lockModalTop(modal) {
        requestAnimationFrame(() => {
            const rect = modal.getBoundingClientRect();
            modal.style.top = `${rect.top}px`;
            modal.style.transform = 'translateX(-50%)';
        });
    },

    _startPresenceGuard() {
        if (this._presenceInterval) return;
        const guard = () => {
            // Only ensure button if it doesn't exist - don't reset if it's already there and pulsing
            const existingBtn = document.getElementById('wf-settings-btn');
            if (!existingBtn) {
                this._ensureSettingsButton();
            }
            this._ensureModalPresence();
        };
        this._presenceInterval = setInterval(guard, 1000);
    },
    
    _hasActiveDevSettings() {
        if (!Context.isDevBranch) return false;
        const devPlugins = PluginManager.getDevPlugins();
        return devPlugins.length > 0;
    },
    
    _createModal() {
        const modal = document.createElement('div');
        modal.id = 'wf-settings-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--background, white);
            border: 1px solid var(--border, #e5e5e5);
            border-radius: 12px;
            padding: 24px;
            width: 520px;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 10000;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        `;
        
        // Get current state
        const archetype = Context.currentArchetype;
        const archetypeId = archetype ? archetype.id : 'global';
        const allPlugins = PluginManager.getAll();
        // Separate regular archetype plugins from dev plugins
        const archetypePlugins = allPlugins.filter(p => p.phase !== 'core' && !p._isDev);
        const devPlugins = Context.isDevBranch ? PluginManager.getDevPlugins() : [];
        const orderedPlugins = this._getOrderedPlugins(archetypePlugins, archetypeId, 'regular');
        const orderedDevPlugins = this._getOrderedPlugins(devPlugins, archetypeId, 'dev');
        const version = Context.version || 'unknown';
        this._settingsArchetypeId = archetypeId;
        this._initialSettingsSnapshot = this._getSettingsSnapshot(archetypePlugins, archetypeId);
        
        // Build plugin toggles HTML
        const submoduleLoggingEnabled = Logger.isSubmoduleLoggingEnabled();
        const globalEnabled = this._getGlobalEnabled();
        const noPluginsMsg = Context.isOutdated
            ? 'No plugins will load until you update the userscript.'
            : 'No plugins loaded for this page.';
        const pluginTogglesHTML = orderedPlugins.length > 0 
            ? orderedPlugins.map(plugin => this._createPluginToggleHTML(plugin, submoduleLoggingEnabled, globalEnabled)).join('')
            : `<p style="color: #666; font-size: 13px; font-style: italic;">${noPluginsMsg}</p>`;
        
        // Build dev plugin toggles HTML
        const devPluginTogglesHTML = orderedDevPlugins.length > 0 
            ? orderedDevPlugins.map(plugin => this._createPluginToggleHTML(plugin, submoduleLoggingEnabled, globalEnabled)).join('')
            : '<p style="color: #666; font-size: 13px; font-style: italic;">No dev plugins loaded.</p>';
        
        // Build outdated plugins warning HTML
        const outdatedPluginsHTML = Context.outdatedPlugins && Context.outdatedPlugins.length > 0
            ? this._createOutdatedPluginsHTML(Context.outdatedPlugins)
            : '';
        
        // Build script update notification HTML
        // Show if outdated OR if simulate update banner is enabled (for testing on dev branch)
        const shouldShowUpdateNotification = (Context.isOutdated && Context.latestVersion) || 
            (Context.isDevBranch && this._getPulseOverrideEnabled());
        const updateNotificationHTML = shouldShowUpdateNotification
            ? this._createUpdateNotificationHTML()
            : '';
        
        const hasDevSettings = this._hasActiveDevSettings();
        const tabs = this._getSettingsTabs();
        const tabRowHTML = this._createTabRowHTML(tabs);
        
        // Build the Dev pane content
        const devGlobalEnabled = this._getDevGlobalEnabled();
        const devPaneHTML = hasDevSettings ? `
            <div id="wf-settings-pane-dev" data-tab="dev" class="wf-settings-pane" style="display: none;">
            <!-- Dev Global Toggle -->
            <div style="margin-bottom: 20px;">
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border: 1px solid var(--border, #e5e5e5); border-radius: 8px; background: var(--card, #fafafa);">
                    <div>
                        <div style="font-size: 14px; font-weight: 600; color: var(--foreground, #333);">Enable Dev Plugins</div>
                        <div style="font-size: 12px; color: var(--muted-foreground, #666); margin-top: 4px;">
                            Disables all dev plugins on refresh when turned off.
                        </div>
                    </div>
                    ${this._createSwitchHTML('wf-dev-global-enabled', devGlobalEnabled)}
                </div>
                <div id="wf-all-dev-plugins-buttons" style="display: ${devGlobalEnabled ? 'flex' : 'none'}; gap: 8px; margin-top: 10px;">
                    <button id="wf-all-dev-plugins-on" style="
                        flex: 1;
                        padding: 8px 12px;
                        font-size: 13px;
                        font-weight: 500;
                        color: var(--foreground, #333);
                        background: var(--card, #fafafa);
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">All On</button>
                    <button id="wf-all-dev-plugins-off" style="
                        flex: 1;
                        padding: 8px 12px;
                        font-size: 13px;
                        font-weight: 500;
                        color: var(--foreground, #333);
                        background: var(--card, #fafafa);
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">All Off</button>
                </div>
            </div>

            <!-- Dev Plugins Section -->
            <div style="margin-bottom: 20px;">
                <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: var(--foreground, #333);">
                    Dev Plugins (${devPlugins.length})
                </h3>
                <div id="wf-dev-plugin-list">
                    ${devPluginTogglesHTML}
                </div>
            </div>
            
            <!-- Debug Section -->
            <div style="border-top: 1px solid var(--border, #e5e5e5); padding-top: 16px; margin-bottom: 16px;">
                <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: var(--foreground, #333);">
                    Debug Options
                </h3>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${this._createToggleHTML('wf-debug-enabled', 'Enable Debug Logging', Logger.isDebugEnabled())}
                    ${this._createToggleHTML('wf-verbose-enabled', 'Enable Verbose Logging', Logger.isVerboseEnabled())}
                    <div>
                        ${this._createToggleHTML('wf-submodule-logging-enabled', 'Enable Submodule Logging', submoduleLoggingEnabled)}
                        <div id="wf-all-module-logging-buttons" style="display: ${submoduleLoggingEnabled ? 'flex' : 'none'}; gap: 8px; margin-top: 10px;">
                            <button id="wf-all-module-logging-on" type="button" style="
                                flex: 1;
                                padding: 6px 10px;
                                font-size: 12px;
                                font-weight: 500;
                                color: var(--foreground, #333);
                                background: var(--card, #fafafa);
                                border: 1px solid var(--border, #e5e5e5);
                                border-radius: 6px;
                                cursor: pointer;
                                transition: all 0.2s;
                            ">All On</button>
                            <button id="wf-all-module-logging-off" type="button" style="
                                flex: 1;
                                padding: 6px 10px;
                                font-size: 12px;
                                font-weight: 500;
                                color: var(--foreground, #333);
                                background: var(--card, #fafafa);
                                border: 1px solid var(--border, #e5e5e5);
                                border-radius: 6px;
                                cursor: pointer;
                                transition: all 0.2s;
                            ">All Off</button>
                        </div>
                    </div>
                    ${this._createToggleHTML('wf-pulse-override-enabled', 'Simulate Update Banner', this._getPulseOverrideEnabled())}
                </div>
            </div>
            </div>
        ` : '';
        
        modal.innerHTML = `
            <!-- Sticky Header -->
            <div style="position: sticky; top: -24px; margin: -24px -24px 20px -24px; padding: 24px 24px 16px 24px; background: var(--background, white); border-bottom: 1px solid var(--border, #e5e5e5); z-index: 1;">
                <div style="display: flex; align-items: flex-start; justify-content: space-between;">
                    <div>
                        <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 4px 0;">Fleet Enhancer Settings</h2>
                        <p style="font-size: 13px; color: var(--muted-foreground, #666); margin: 0;">
                            v${version} · a${Context.archetypesVersion || '?'} · <strong>${(archetypeId.replace(/archetype/gi, '').trim() || archetypeId)}</strong>
                        </p>
                    </div>
                    <button id="wf-settings-close" style="
                        width: 28px;
                        height: 28px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 6px;
                        border: none;
                        background: transparent;
                        cursor: pointer;
                        transition: background 0.2s;
                        color: var(--foreground, #333);
                    ">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                ${updateNotificationHTML}
                ${tabRowHTML}
            </div>
            
            <div id="wf-settings-tab-panes">
            <div id="wf-settings-pane-settings" data-tab="settings" class="wf-settings-pane" style="display: block;">
            <!-- Global Toggle -->
            <div style="margin-bottom: 20px;">
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border: 1px solid var(--border, #e5e5e5); border-radius: 8px; background: var(--card, #fafafa);">
                    <div>
                        <div style="font-size: 14px; font-weight: 600; color: var(--foreground, #333);">Enable Plugins</div>
                        <div style="font-size: 12px; color: var(--muted-foreground, #666); margin-top: 4px;">
                            Disables all plugins on refresh when turned off.
                        </div>
                    </div>
                    ${this._createSwitchHTML('wf-global-enabled', globalEnabled)}
                </div>
                <div id="wf-all-plugins-buttons" style="display: ${globalEnabled ? 'flex' : 'none'}; gap: 8px; margin-top: 10px;">
                    <button id="wf-all-plugins-on" style="
                        flex: 1;
                        padding: 8px 12px;
                        font-size: 13px;
                        font-weight: 500;
                        color: var(--foreground, #333);
                        background: var(--card, #fafafa);
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">All On</button>
                    <button id="wf-all-plugins-off" style="
                        flex: 1;
                        padding: 8px 12px;
                        font-size: 13px;
                        font-weight: 500;
                        color: var(--foreground, #333);
                        background: var(--card, #fafafa);
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">All Off</button>
                </div>
            </div>

            <!-- Outdated Plugins Warning -->
            ${outdatedPluginsHTML}
            
            <!-- Plugins Section -->
            <div style="margin-bottom: 20px;">
                <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: var(--foreground, #333);">
                    Plugins (${archetypePlugins.length})
                </h3>
                <div id="wf-plugin-list">
                    ${pluginTogglesHTML}
                </div>
            </div>
            
            <!-- Footer -->
            <div style="font-size: 11px; color: var(--muted-foreground, #888); text-align: center; padding-top: 12px; border-top: 1px solid var(--border, #e5e5e5);">
                Fleet Workflow Enhancer · 
                <a href="#" id="wf-reload-plugins" style="color: var(--brand, #4f46e5); text-decoration: none;">Reload Plugins</a>
            </div>
            
            <!-- Clear Cache Button -->
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border, #e5e5e5);">
                <button id="wf-clear-cache" style="
                    width: 100%;
                    padding: 10px 16px;
                    font-size: 13px;
                    font-weight: 500;
                    color: #dc2626;
                    background: transparent;
                    border: 1px solid #dc2626;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s;
                ">Clear Cache</button>
            </div>
            </div>
            ${devPaneHTML}
            <div id="wf-settings-pane-information" data-tab="information" class="wf-settings-pane" style="display: none; overflow-y: auto; min-height: 200px;"></div>
            <div id="wf-settings-pane-features" data-tab="features" class="wf-settings-pane" style="display: none; overflow-y: auto; min-height: 200px;"></div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this._ensureMessageElement(modal);
        
        // Attach event listeners
        this._attachModalListeners(modal, orderedPlugins, orderedDevPlugins);
        this._updateSettingsMessage(modal, archetypePlugins);
        
        this._lockModalTop(modal);
        return modal;
    },

    _createPluginToggleHTML(plugin, submoduleLoggingEnabled, globalEnabled) {
        const isEnabled = PluginManager.isEnabled(plugin.id);
        const isDisabled = !globalEnabled;
        const moduleLoggingEnabled = Logger.isModuleLoggingEnabled(plugin.id);
        
        // Build sub-options HTML if plugin has them
        const subOptionsHTML = this._createSubOptionsHTML(plugin, isEnabled, isDisabled);
        
        const moduleToggleHTML = Context.isDevBranch && submoduleLoggingEnabled && isEnabled ? `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border, #e5e5e5);">
                    <label style="font-size: 12px; color: var(--muted-foreground, #666);" for="wf-plugin-log-${plugin.id}">
                        Module Logging
                    </label>
                    ${this._createSwitchHTML(`wf-plugin-log-${plugin.id}`, moduleLoggingEnabled, null, isDisabled, { size: 'small' })}
                </div>
        ` : '';
        return `
            <div class="wf-plugin-item" data-plugin-id="${plugin.id}" style="position: relative; display: flex; flex-direction: column; padding: 12px; border: 1px solid var(--border, #e5e5e5); border-radius: 8px; margin-bottom: 10px; background: var(--card, #fafafa); will-change: transform;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                        <div class="wf-drag-handle" title="Drag to reorder" style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: grab; color: var(--muted-foreground, #888); user-select: none;">
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                                <line x1="4" y1="5" x2="16" y2="5"></line>
                                <line x1="4" y1="10" x2="16" y2="10"></line>
                                <line x1="4" y1="15" x2="16" y2="15"></line>
                            </svg>
                        </div>
                        <label style="font-size: 14px; font-weight: 500; cursor: pointer; color: var(--foreground, #333); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" for="wf-plugin-${plugin.id}">
                            ${plugin.name || plugin.id}
                        </label>
                    </div>
                    ${this._createSwitchHTML(`wf-plugin-${plugin.id}`, isEnabled, plugin.id, isDisabled)}
                </div>
                <div style="font-size: 12px; color: var(--muted-foreground, #666); margin-top: 6px; line-height: 1.4;">
                    ${plugin.description || 'No description available'}
                </div>
                ${subOptionsHTML}
                ${moduleToggleHTML}
            </div>
        `;
    },
    
    _createSubOptionsHTML(plugin, pluginEnabled, globalDisabled) {
        if (!plugin.subOptions || !Array.isArray(plugin.subOptions) || plugin.subOptions.length === 0) {
            return '';
        }
        
        // Only show sub-options when the plugin is enabled
        if (!pluginEnabled) {
            return '';
        }
        
        const subOptionItems = plugin.subOptions.map(subOption => {
            const subOptionId = `wf-suboption-${plugin.id}-${subOption.id}`;
            const defaultValue = subOption.enabledByDefault !== false;
            const isSubOptionEnabled = Storage.getSubOptionEnabled(plugin.id, subOption.id, defaultValue);
            const isDisabled = globalDisabled;
            
            return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0;">
                    <div style="flex: 1; min-width: 0;">
                        <label style="font-size: 12px; color: var(--muted-foreground, #666); cursor: pointer;" for="${subOptionId}">
                            ${subOption.name || subOption.id}
                        </label>
                        ${subOption.description ? `<div style="font-size: 11px; color: var(--muted-foreground, #888); margin-top: 2px;">${subOption.description}</div>` : ''}
                    </div>
                    ${this._createSwitchHTML(subOptionId, isSubOptionEnabled, null, isDisabled, { size: 'small' })}
                </div>
            `;
        }).join('');
        
        return `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border, #e5e5e5);">
                <div style="margin-left: 12px;">
                    ${subOptionItems}
                </div>
            </div>
        `;
    },
    
    _createToggleHTML(id, label, isEnabled) {
        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1px solid var(--border, #e5e5e5); border-radius: 6px; background: var(--card, #fafafa);">
                <label style="font-size: 13px; color: var(--foreground, #333);" for="${id}">${label}</label>
                ${this._createSwitchHTML(id, isEnabled)}
            </div>
        `;
    },
    
    _createSwitchHTML(id, isEnabled, pluginId = null, isDisabled = false, opts = {}) {
        const dataAttr = pluginId ? `data-plugin-id="${pluginId}"` : '';
        const disabledAttr = isDisabled ? 'disabled' : '';
        const isSmall = opts.size === 'small';
        // Main toggles: original blue. Sub-option toggles (small): 25% lighter blue when on.
        const onColor = isSmall ? '#8986f1' : 'var(--brand, #4f46e5)';
        const sliderBg = isDisabled ? '#d1d5db' : (isEnabled ? onColor : '#ccc');
        const knobBg = isDisabled ? '#f3f4f6' : 'white';
        const knobShadow = isDisabled ? 'none' : '0 1px 3px rgba(0,0,0,0.2)';
        const w = isSmall ? 33 : 44;
        const h = isSmall ? 18 : 24;
        const knobSize = isSmall ? 13.5 : 18;
        const knobLeftOn = isSmall ? 17 : 23;
        const knobLeftOff = 3;
        const knobBottom = isSmall ? 2 : 3;
        const onColorAttr = isSmall ? ` data-wf-on-color="${onColor}" data-wf-knob-left-on="${knobLeftOn}" data-wf-knob-left-off="${knobLeftOff}" data-wf-knob-bottom="${knobBottom}"` : '';
        return `
            <label style="position: relative; display: inline-block; width: ${w}px; height: ${h}px; flex-shrink: 0; ${isDisabled ? 'opacity: 0.6; cursor: not-allowed;' : ''}">
                <input type="checkbox" id="${id}" ${dataAttr} ${isEnabled ? 'checked' : ''} ${disabledAttr} style="opacity: 0; width: 0; height: 0; position: absolute;">
                <span class="wf-toggle-slider" style="
                    position: absolute;
                    cursor: ${isDisabled ? 'not-allowed' : 'pointer'};
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-color: ${sliderBg};
                    transition: 0.2s;
                    border-radius: 24px;
                "${onColorAttr}>
                    <span style="
                        position: absolute;
                        height: ${knobSize}px;
                        width: ${knobSize}px;
                        left: ${isEnabled ? knobLeftOn + 'px' : knobLeftOff + 'px'};
                        bottom: ${knobBottom}px;
                        background-color: ${knobBg};
                        transition: 0.2s;
                        border-radius: 50%;
                        box-shadow: ${knobShadow};
                    "></span>
                </span>
            </label>
        `;
    },
    
    _attachModalListeners(modal, plugins, devPlugins = []) {
        const self = this;
        const allPlugins = [...plugins, ...devPlugins];
        
        // Close button
        const closeBtn = Context.dom.query('#wf-settings-close', {
            root: modal,
            context: `${this.id}.settingsClose`
        });
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                self._closeModal();
            });
        }

        // Update banner: show "Refresh Page with New Version" after newest-version link is clicked
        const newestLink = Context.dom.query('#wf-update-newest-link', { root: modal, context: `${this.id}.updateNewestLink` });
        const refreshRow = Context.dom.query('#wf-update-refresh-row', { root: modal, context: `${this.id}.updateRefreshRow` });
        const refreshBtn = Context.dom.query('#wf-update-refresh-btn', { root: modal, context: `${this.id}.updateRefreshBtn` });
        if (newestLink && refreshRow) {
            newestLink.addEventListener('click', () => {
                refreshRow.style.display = 'block';
            });
        }
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                window.location.reload();
            });
        }

        // Tab buttons
        this._attachTabListeners(modal);

        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape' && self._modalOpen) {
                self._closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Global toggle (regular plugins only)
        const globalToggle = Context.dom.query('#wf-global-enabled', {
            root: modal,
            context: `${this.id}.globalToggle`
        });
        if (globalToggle) {
            globalToggle.addEventListener('change', (e) => {
                this._handleToggleChange(e);
                const isEnabled = e.target.checked;
                this._setGlobalEnabled(isEnabled);
                if (!isEnabled) {
                    this._storeGlobalSnapshot(plugins);
                    plugins.forEach(plugin => {
                        PluginManager.setEnabled(plugin.id, false);
                    });
                } else {
                    this._restoreGlobalSnapshot(plugins);
                }
                this._updateAllPluginsButtonsVisibility(modal, isEnabled);
                this._renderPluginList(modal, plugins);
                this._attachPluginToggleListeners(modal, plugins);
                this._attachPluginReorderListeners(modal, plugins);
                this._updateSettingsMessage(modal, plugins);
            });
        }

        // All On / All Off buttons (regular plugins only)
        const allOnBtn = Context.dom.query('#wf-all-plugins-on', {
            root: modal,
            context: `${this.id}.allOnButton`
        });
        if (allOnBtn) {
            allOnBtn.addEventListener('click', () => {
                plugins.forEach(plugin => {
                    PluginManager.setEnabled(plugin.id, true);
                });
                this._renderPluginList(modal, plugins);
                this._attachPluginToggleListeners(modal, plugins);
                this._attachPluginReorderListeners(modal, plugins);
                this._updateSettingsMessage(modal, plugins);
            });
            allOnBtn.addEventListener('mouseenter', () => {
                allOnBtn.style.background = 'var(--hover, #f0f0f0)';
                allOnBtn.style.borderColor = 'var(--border-hover, #d1d5db)';
            });
            allOnBtn.addEventListener('mouseleave', () => {
                allOnBtn.style.background = 'var(--card, #fafafa)';
                allOnBtn.style.borderColor = 'var(--border, #e5e5e5)';
            });
        }

        const allOffBtn = Context.dom.query('#wf-all-plugins-off', {
            root: modal,
            context: `${this.id}.allOffButton`
        });
        if (allOffBtn) {
            allOffBtn.addEventListener('click', () => {
                plugins.forEach(plugin => {
                    PluginManager.setEnabled(plugin.id, false);
                });
                this._renderPluginList(modal, plugins);
                this._attachPluginToggleListeners(modal, plugins);
                this._attachPluginReorderListeners(modal, plugins);
                this._updateSettingsMessage(modal, plugins);
            });
            allOffBtn.addEventListener('mouseenter', () => {
                allOffBtn.style.background = 'var(--hover, #f0f0f0)';
                allOffBtn.style.borderColor = 'var(--border-hover, #d1d5db)';
            });
            allOffBtn.addEventListener('mouseleave', () => {
                allOffBtn.style.background = 'var(--card, #fafafa)';
                allOffBtn.style.borderColor = 'var(--border, #e5e5e5)';
            });
        }

        // Dev global toggle (dev plugins only)
        if (Context.isDevBranch && devPlugins.length > 0) {
            const devGlobalToggle = Context.dom.query('#wf-dev-global-enabled', {
                root: modal,
                context: `${this.id}.devGlobalToggle`
            });
            if (devGlobalToggle) {
                devGlobalToggle.addEventListener('change', (e) => {
                    this._handleToggleChange(e);
                    const isEnabled = e.target.checked;
                    this._setDevGlobalEnabled(isEnabled);
                    if (!isEnabled) {
                        this._storeDevGlobalSnapshot(devPlugins);
                        devPlugins.forEach(plugin => {
                            PluginManager.setEnabled(plugin.id, false);
                        });
                    } else {
                        this._restoreDevGlobalSnapshot(devPlugins);
                    }
                    this._updateDevPluginsButtonsVisibility(modal, isEnabled);
                    this._renderDevPluginList(modal, devPlugins);
                    this._attachPluginToggleListeners(modal, devPlugins, 'dev');
                    this._attachPluginReorderListeners(modal, devPlugins, 'dev');
                    this._updateSettingsMessage(modal, plugins);
                });
            }

            // Dev All On / All Off buttons (dev plugins only)
            const allDevOnBtn = Context.dom.query('#wf-all-dev-plugins-on', {
                root: modal,
                context: `${this.id}.allDevOnButton`
            });
            if (allDevOnBtn) {
                allDevOnBtn.addEventListener('click', () => {
                    devPlugins.forEach(plugin => {
                        PluginManager.setEnabled(plugin.id, true);
                    });
                    this._renderDevPluginList(modal, devPlugins);
                    this._attachPluginToggleListeners(modal, devPlugins, 'dev');
                    this._attachPluginReorderListeners(modal, devPlugins, 'dev');
                    this._updateSettingsMessage(modal, plugins);
                });
                allDevOnBtn.addEventListener('mouseenter', () => {
                    allDevOnBtn.style.background = 'var(--hover, #f0f0f0)';
                    allDevOnBtn.style.borderColor = 'var(--border-hover, #d1d5db)';
                });
                allDevOnBtn.addEventListener('mouseleave', () => {
                    allDevOnBtn.style.background = 'var(--card, #fafafa)';
                    allDevOnBtn.style.borderColor = 'var(--border, #e5e5e5)';
                });
            }

            const allDevOffBtn = Context.dom.query('#wf-all-dev-plugins-off', {
                root: modal,
                context: `${this.id}.allDevOffButton`
            });
            if (allDevOffBtn) {
                allDevOffBtn.addEventListener('click', () => {
                    devPlugins.forEach(plugin => {
                        PluginManager.setEnabled(plugin.id, false);
                    });
                    this._renderDevPluginList(modal, devPlugins);
                    this._attachPluginToggleListeners(modal, devPlugins, 'dev');
                    this._attachPluginReorderListeners(modal, devPlugins, 'dev');
                    this._updateSettingsMessage(modal, plugins);
                });
                allDevOffBtn.addEventListener('mouseenter', () => {
                    allDevOffBtn.style.background = 'var(--hover, #f0f0f0)';
                    allDevOffBtn.style.borderColor = 'var(--border-hover, #d1d5db)';
                });
                allDevOffBtn.addEventListener('mouseleave', () => {
                    allDevOffBtn.style.background = 'var(--card, #fafafa)';
                    allDevOffBtn.style.borderColor = 'var(--border, #e5e5e5)';
                });
            }
        }

        // Plugin toggles
        this._attachPluginToggleListeners(modal, plugins);
        this._attachPluginReorderListeners(modal, plugins);
        
        // Dev plugin toggles (if dev branch and dev plugins exist)
        if (Context.isDevBranch && devPlugins.length > 0) {
            this._attachPluginToggleListeners(modal, devPlugins, 'dev');
            this._attachPluginReorderListeners(modal, devPlugins, 'dev');
        }
        
        // Debug toggle
        const debugToggle = Context.dom.query('#wf-debug-enabled', {
            root: modal,
            context: `${this.id}.debugToggle`
        });
        if (debugToggle) {
            debugToggle.addEventListener('change', (e) => {
                this._handleToggleChange(e);
                Logger.setDebugEnabled(e.target.checked);
                this._updateSettingsMessage(modal, plugins);
            });
        }
        
        // Verbose toggle
        const verboseToggle = Context.dom.query('#wf-verbose-enabled', {
            root: modal,
            context: `${this.id}.verboseToggle`
        });
        if (verboseToggle) {
            verboseToggle.addEventListener('change', (e) => {
                this._handleToggleChange(e);
                Logger.setVerboseEnabled(e.target.checked);
                this._updateSettingsMessage(modal, plugins);
            });
        }

        // Submodule logging toggle
        const submoduleToggle = Context.dom.query('#wf-submodule-logging-enabled', {
            root: modal,
            context: `${this.id}.submoduleToggle`
        });
        if (submoduleToggle) {
            submoduleToggle.addEventListener('change', (e) => {
                this._handleToggleChange(e);
                Logger.setSubmoduleLoggingEnabled(e.target.checked);
                this._updateAllModuleLoggingButtonsVisibility(modal, e.target.checked);
                this._renderPluginList(modal, plugins);
                this._attachPluginToggleListeners(modal, plugins);
                this._attachPluginReorderListeners(modal, plugins);
                if (Context.isDevBranch && devPlugins.length > 0) {
                    this._renderDevPluginList(modal, devPlugins);
                    this._attachPluginToggleListeners(modal, devPlugins, 'dev');
                    this._attachPluginReorderListeners(modal, devPlugins, 'dev');
                }
                this._updateSettingsMessage(modal, plugins);
            });
        }

        // All module logging On / Off (only affect log toggles; visible when submodule logging enabled)
        const allModuleLogOnBtn = Context.dom.query('#wf-all-module-logging-on', {
            root: modal,
            context: `${this.id}.allModuleLogOnButton`
        });
        if (allModuleLogOnBtn) {
            allModuleLogOnBtn.addEventListener('click', () => {
                allPlugins.forEach(plugin => {
                    Logger.setModuleLoggingEnabled(plugin.id, true);
                });
                this._renderPluginList(modal, plugins);
                if (Context.isDevBranch && devPlugins.length > 0) {
                    this._renderDevPluginList(modal, devPlugins);
                    this._attachPluginToggleListeners(modal, devPlugins, 'dev');
                    this._attachPluginReorderListeners(modal, devPlugins, 'dev');
                }
                this._attachPluginToggleListeners(modal, plugins);
                this._updateSettingsMessage(modal, plugins);
            });
            allModuleLogOnBtn.addEventListener('mouseenter', () => {
                allModuleLogOnBtn.style.background = 'var(--hover, #f0f0f0)';
                allModuleLogOnBtn.style.borderColor = 'var(--border-hover, #d1d5db)';
            });
            allModuleLogOnBtn.addEventListener('mouseleave', () => {
                allModuleLogOnBtn.style.background = 'var(--card, #fafafa)';
                allModuleLogOnBtn.style.borderColor = 'var(--border, #e5e5e5)';
            });
        }
        const allModuleLogOffBtn = Context.dom.query('#wf-all-module-logging-off', {
            root: modal,
            context: `${this.id}.allModuleLogOffButton`
        });
        if (allModuleLogOffBtn) {
            allModuleLogOffBtn.addEventListener('click', () => {
                allPlugins.forEach(plugin => {
                    Logger.setModuleLoggingEnabled(plugin.id, false);
                });
                this._renderPluginList(modal, plugins);
                if (Context.isDevBranch && devPlugins.length > 0) {
                    this._renderDevPluginList(modal, devPlugins);
                    this._attachPluginToggleListeners(modal, devPlugins, 'dev');
                    this._attachPluginReorderListeners(modal, devPlugins, 'dev');
                }
                this._attachPluginToggleListeners(modal, plugins);
                this._updateSettingsMessage(modal, plugins);
            });
            allModuleLogOffBtn.addEventListener('mouseenter', () => {
                allModuleLogOffBtn.style.background = 'var(--hover, #f0f0f0)';
                allModuleLogOffBtn.style.borderColor = 'var(--border-hover, #d1d5db)';
            });
            allModuleLogOffBtn.addEventListener('mouseleave', () => {
                allModuleLogOffBtn.style.background = 'var(--card, #fafafa)';
                allModuleLogOffBtn.style.borderColor = 'var(--border, #e5e5e5)';
            });
        }
        
        // Simulate Update Banner toggle (dev branch only)
        if (Context.isDevBranch) {
            const pulseOverrideToggle = Context.dom.query('#wf-pulse-override-enabled', {
                root: modal,
                context: `${this.id}.pulseOverrideToggle`
            });
            if (pulseOverrideToggle) {
                pulseOverrideToggle.addEventListener('change', (e) => {
                    this._handleToggleChange(e);
                    const enabled = e.target.checked;
                    Logger.log(`Simulate Update Banner toggle changed to: ${enabled}`);
                    this._setPulseOverrideEnabled(enabled);
                    // Reapply button behavior to update styles
                    const settingsBtn = document.getElementById('wf-settings-btn');
                    if (settingsBtn) {
                        this._applySettingsButtonBehavior(settingsBtn);
                    }
                    // Recreate modal to show/hide update banner
                    this._closeModal();
                    setTimeout(() => {
                        this._toggleModal();
                    }, 100);
                });
            }
        }
        
        // Reload plugins link
        const reloadLink = Context.dom.query('#wf-reload-plugins', {
            root: modal,
            context: `${this.id}.reloadLink`
        });
        if (reloadLink) {
            reloadLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.reload();
            });
        }
        
        // Clear cache button
        const clearCacheBtn = Context.dom.query('#wf-clear-cache', {
            root: modal,
            context: `${this.id}.clearCacheButton`
        });
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                const confirmed = confirm('Are you sure? This will clear *all* settings and data stored by this userscript.');
                if (confirmed) {
                    const allPlugins = PluginManager.getAll();
                    const clearedCount = Storage.clearAll(allPlugins);
                    Logger.log(`✓ Cache cleared: ${clearedCount} keys removed`);
                    alert(`Cache cleared successfully. ${clearedCount} storage keys were removed. The page will now reload.`);
                    window.location.reload();
                }
            });
            clearCacheBtn.addEventListener('mouseenter', () => {
                clearCacheBtn.style.background = '#fee2e2';
                clearCacheBtn.style.borderColor = '#b91c1c';
            });
            clearCacheBtn.addEventListener('mouseleave', () => {
                clearCacheBtn.style.background = 'transparent';
                clearCacheBtn.style.borderColor = '#dc2626';
            });
        }
    },
    
    _handleToggleChange(e) {
        const slider = e.target.nextElementSibling;
        const knob = Context.dom.query('span', {
            root: slider,
            context: `${this.id}.toggleKnob`
        });
        const isChecked = e.target.checked;
        const onColor = slider.dataset.wfOnColor || 'var(--brand, #4f46e5)';
        const knobLeftOn = slider.dataset.wfKnobLeftOn != null ? slider.dataset.wfKnobLeftOn + 'px' : '23px';
        const knobLeftOff = slider.dataset.wfKnobLeftOff != null ? slider.dataset.wfKnobLeftOff + 'px' : '3px';
        slider.style.backgroundColor = isChecked ? onColor : '#ccc';
        if (knob) {
            knob.style.left = isChecked ? knobLeftOn : knobLeftOff;
        }
    },

    _renderPluginList(modal, plugins) {
        const container = Context.dom.query('#wf-plugin-list', {
            root: modal,
            context: `${this.id}.pluginList`
        });
        if (!container) return;
        if (!plugins || plugins.length === 0) {
            const noPluginsMsg = Context.isOutdated
                ? 'No plugins will load until you update the userscript.'
                : 'No plugins loaded for this page.';
            container.innerHTML = `<p style="color: #666; font-size: 13px; font-style: italic;">${noPluginsMsg}</p>`;
            return;
        }
        const submoduleLoggingEnabled = Logger.isSubmoduleLoggingEnabled();
        const globalEnabled = this._getGlobalEnabled();
        const orderedPlugins = this._getOrderedPlugins(plugins, this._settingsArchetypeId, 'regular');
        container.innerHTML = orderedPlugins
            .map(plugin => this._createPluginToggleHTML(plugin, submoduleLoggingEnabled, globalEnabled))
            .join('');
    },

    _renderDevPluginList(modal, devPlugins) {
        const container = Context.dom.query('#wf-dev-plugin-list', {
            root: modal,
            context: `${this.id}.devPluginList`
        });
        if (!container) return;
        if (!devPlugins || devPlugins.length === 0) {
            container.innerHTML = '<p style="color: #666; font-size: 13px; font-style: italic;">No dev plugins loaded.</p>';
            return;
        }
        const submoduleLoggingEnabled = Logger.isSubmoduleLoggingEnabled();
        const devGlobalEnabled = this._getDevGlobalEnabled();
        const orderedDevPlugins = this._getOrderedPlugins(devPlugins, this._settingsArchetypeId, 'dev');
        container.innerHTML = orderedDevPlugins
            .map(plugin => this._createPluginToggleHTML(plugin, submoduleLoggingEnabled, devGlobalEnabled))
            .join('');
    },

    _attachPluginToggleListeners(modal, plugins, listType = 'regular') {
        const listId = listType === 'dev' ? 'wf-dev-plugin-list' : 'wf-plugin-list';
        plugins.forEach(plugin => {
            const checkbox = Context.dom.query(`#wf-plugin-${plugin.id}`, {
                root: modal,
                context: `${this.id}.pluginToggle`
            });
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    this._handleToggleChange(e);
                    PluginManager.setEnabled(plugin.id, e.target.checked);
                    if (listType === 'dev') {
                        this._renderDevPluginList(modal, plugins);
                        this._attachPluginToggleListeners(modal, plugins, 'dev');
                        this._attachPluginReorderListeners(modal, plugins, 'dev');
                    } else {
                        this._renderPluginList(modal, plugins);
                        this._attachPluginToggleListeners(modal, plugins);
                        this._attachPluginReorderListeners(modal, plugins);
                    }
                    // Get all plugins (regular + dev) for settings message
                    const allArchetypePlugins = PluginManager.getAll().filter(p => p.phase !== 'core' && !p._isDev);
                    this._updateSettingsMessage(modal, allArchetypePlugins);
                });
            }
            
            // Attach sub-option toggle listeners
            if (plugin.subOptions && Array.isArray(plugin.subOptions)) {
                plugin.subOptions.forEach(subOption => {
                    const subOptionCheckbox = Context.dom.query(`#wf-suboption-${plugin.id}-${subOption.id}`, {
                        root: modal,
                        context: `${this.id}.subOptionToggle`
                    });
                    if (subOptionCheckbox) {
                        subOptionCheckbox.addEventListener('change', (e) => {
                            this._handleToggleChange(e);
                            Storage.setSubOptionEnabled(plugin.id, subOption.id, e.target.checked);
                            this._updateSettingsMessage(modal, plugins);
                        });
                    }
                });
            }
            
            const moduleCheckbox = Context.dom.query(`#wf-plugin-log-${plugin.id}`, {
                root: modal,
                context: `${this.id}.pluginLogToggle`
            });
            if (moduleCheckbox) {
                moduleCheckbox.addEventListener('change', (e) => {
                    this._handleToggleChange(e);
                    Logger.setModuleLoggingEnabled(plugin.id, e.target.checked);
                    this._updateSettingsMessage(modal, plugins);
                });
            }
        });
    },

    _attachPluginReorderListeners(modal, plugins, listType = 'regular') {
        const listId = listType === 'dev' ? 'wf-dev-plugin-list' : 'wf-plugin-list';
        const boundKey = listType === 'dev' ? 'wfDevReorderBound' : 'wfReorderBound';
        const list = Context.dom.query(`#${listId}`, {
            root: modal,
            context: `${this.id}.pluginListReorder`
        });
        if (!list || list.dataset[boundKey] === 'true') return;
        list.dataset[boundKey] = 'true';

        const dragStateKey = listType === 'dev' ? '_wfDevPointerDragState' : '_wfPointerDragState';
        this[dragStateKey] = {
            list,
            listType,
            plugins,
            draggedItem: null,
            pointerStartX: 0,
            pointerStartY: 0,
            itemsGap: 0,
            rafPending: false
        };
        const dragState = this[dragStateKey];

        const getAllItems = () => Array.from(list.querySelectorAll('.wf-plugin-item[data-plugin-id]'));
        const getIdleItems = () => getAllItems().filter(item => item !== dragState.draggedItem);
        const getPointer = (e) => {
            const t = e.touches && e.touches[0] ? e.touches[0] : null;
            return {
                x: (typeof e.clientX === 'number' ? e.clientX : (t ? t.clientX : 0)),
                y: (typeof e.clientY === 'number' ? e.clientY : (t ? t.clientY : 0))
            };
        };
        const isItemAbove = (item) => item.hasAttribute('data-wf-is-above');
        const isItemToggled = (item) => item.hasAttribute('data-wf-is-toggled');

        const setItemsGap = () => {
            const idle = getIdleItems();
            if (idle.length <= 1) {
                dragState.itemsGap = 0;
                return;
            }
            const r1 = idle[0].getBoundingClientRect();
            const r2 = idle[1].getBoundingClientRect();
            dragState.itemsGap = Math.abs(r1.bottom - r2.top);
        };

        const disablePageScroll = () => {
            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';
            document.body.style.userSelect = 'none';
        };

        const enablePageScroll = () => {
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
            document.body.style.userSelect = '';
        };

        const initItemsState = () => {
            const all = getAllItems();
            const draggedIndex = all.indexOf(dragState.draggedItem);
            getIdleItems().forEach((item, i) => {
                // mark as above if its original index is above dragged item
                const idx = all.indexOf(item);
                if (idx !== -1 && idx < draggedIndex) {
                    item.setAttribute('data-wf-is-above', '');
                } else {
                    item.removeAttribute('data-wf-is-above');
                }
                item.removeAttribute('data-wf-is-toggled');
                item.style.willChange = 'transform';
            });
        };

        const updateIdleItemsStateAndPosition = () => {
            if (!dragState.draggedItem) return;
            const draggedRect = dragState.draggedItem.getBoundingClientRect();
            const draggedY = draggedRect.top + draggedRect.height / 2;

            // Update toggled state
            getIdleItems().forEach((item) => {
                const rect = item.getBoundingClientRect();
                const itemY = rect.top + rect.height / 2;
                if (isItemAbove(item)) {
                    if (draggedY <= itemY) item.setAttribute('data-wf-is-toggled', '');
                    else item.removeAttribute('data-wf-is-toggled');
                } else {
                    if (draggedY >= itemY) item.setAttribute('data-wf-is-toggled', '');
                    else item.removeAttribute('data-wf-is-toggled');
                }
            });

            // Update positions
            getIdleItems().forEach((item) => {
                if (isItemToggled(item)) {
                    const direction = isItemAbove(item) ? 1 : -1;
                    item.style.transform = `translateY(${direction * (draggedRect.height + dragState.itemsGap)}px)`;
                    item.style.transition = 'transform 0.2s ease';
                } else {
                    item.style.transform = '';
                    item.style.transition = 'transform 0.2s ease';
                }
            });
        };

        const applyNewItemsOrder = () => {
            const all = getAllItems();
            const reordered = [];

            all.forEach((item, index) => {
                if (item === dragState.draggedItem) return;
                if (!isItemToggled(item)) {
                    reordered[index] = item;
                    return;
                }
                const newIndex = isItemAbove(item) ? index + 1 : index - 1;
                reordered[newIndex] = item;
            });

            for (let i = 0; i < all.length; i++) {
                if (typeof reordered[i] === 'undefined') reordered[i] = dragState.draggedItem;
            }

            // Clear all transforms BEFORE DOM reorder to prevent visual artifacts
            all.forEach((item) => {
                item.style.transform = '';
                item.style.transition = '';
                item.style.zIndex = '';
            });

            reordered.forEach((item) => list.appendChild(item));

            // Persist order to storage from DOM order
            const orderRaw = Array.from(list.querySelectorAll('.wf-plugin-item[data-plugin-id]'))
                .map(el => el.getAttribute('data-plugin-id'))
                .filter(Boolean);
            const seen = new Set();
            const order = [];
            for (const id of orderRaw) {
                if (seen.has(id)) continue;
                seen.add(id);
                order.push(id);
            }
            this._setStoredPluginOrder(this._settingsArchetypeId, order, listType);

            // Update settings changed banner
            const allArchetypePlugins = PluginManager.getAll().filter(p => p.phase !== 'core' && !p._isDev);
            this._updateSettingsMessage(modal, allArchetypePlugins);
        };

        const cleanup = () => {
            if (!dragState.draggedItem) return;

            dragState.draggedItem.style.transform = '';
            dragState.draggedItem.style.transition = '';
            dragState.draggedItem.style.zIndex = '';
            dragState.draggedItem.style.willChange = '';
            dragState.draggedItem = null;

            getAllItems().forEach((item) => {
                item.removeAttribute('data-wf-is-above');
                item.removeAttribute('data-wf-is-toggled');
                item.style.transform = '';
                item.style.transition = '';
                item.style.willChange = '';
            });

            enablePageScroll();

            document.removeEventListener('mousemove', onPointerMove, true);
            document.removeEventListener('mouseup', onPointerUp, true);
            document.removeEventListener('touchmove', onPointerMove, { capture: true });
            document.removeEventListener('touchend', onPointerUp, true);
        };

        const onPointerMove = (e) => {
            if (!dragState.draggedItem) return;
            // prevent scrolling while dragging
            if (e.cancelable) e.preventDefault();

            const { x, y } = getPointer(e);
            const dx = x - dragState.pointerStartX;
            const dy = y - dragState.pointerStartY;

            dragState.draggedItem.style.transform = `translate(${dx}px, ${dy}px)`;
            dragState.draggedItem.style.zIndex = '10';
            dragState.draggedItem.style.willChange = 'transform';

            // Throttle expensive layout reads to rAF
            if (!dragState.rafPending) {
                dragState.rafPending = true;
                requestAnimationFrame(() => {
                    dragState.rafPending = false;
                    updateIdleItemsStateAndPosition();
                });
            }
        };

        const onPointerUp = () => {
            if (!dragState.draggedItem) return;
            applyNewItemsOrder();
            cleanup();
        };

        const onPointerDown = (e) => {
            // Only left click
            if (e.type === 'mousedown' && e.button !== 0) return;

            const handle = Context.dom.closest(e.target, '.wf-drag-handle', {
                root: list,
                context: `${this.id}.pluginPointerDragHandle`
            });
            if (!handle || !list.contains(handle)) return;

            const item = Context.dom.closest(handle, '.wf-plugin-item[data-plugin-id]', {
                root: list,
                context: `${this.id}.pluginPointerDragItem`
            });
            if (!item) return;

            dragState.draggedItem = item;
            const { x, y } = getPointer(e);
            dragState.pointerStartX = x;
            dragState.pointerStartY = y;

            setItemsGap();
            disablePageScroll();
            initItemsState();

            // Make dragged item feel draggable
            item.style.transition = 'none';

            document.addEventListener('mousemove', onPointerMove, true);
            document.addEventListener('mouseup', onPointerUp, true);
            document.addEventListener('touchmove', onPointerMove, { passive: false, capture: true });
            document.addEventListener('touchend', onPointerUp, true);

            Logger.debug(`Started pointer drag reorder (${listType})`);
        };

        list.addEventListener('mousedown', onPointerDown);
        list.addEventListener('touchstart', onPointerDown, { passive: true });
    },

    _getOrderedPlugins(plugins, archetypeId, listType = 'regular') {
        if (!plugins || plugins.length === 0) return [];
        const order = this._getStoredPluginOrder(archetypeId, plugins, listType);
        const byId = new Map(plugins.map(plugin => [plugin.id, plugin]));
        return order.map(id => byId.get(id)).filter(Boolean);
    },

    _getPluginOrderKey(archetypeId, listType = 'regular') {
        const prefix = listType === 'dev' ? 'dev-plugin-order' : 'plugin-order';
        return `${prefix}-${archetypeId || 'global'}`;
    },

    _setStoredPluginOrder(archetypeId, order, listType = 'regular') {
        const key = this._getPluginOrderKey(archetypeId, listType);
        Storage.set(key, JSON.stringify(order || []));
    },

    _getStoredPluginOrder(archetypeId, plugins, listType = 'regular') {
        const ids = plugins.map(plugin => plugin.id);
        const key = this._getPluginOrderKey(archetypeId, listType);
        const storedRaw = Storage.get(key, null);
        let stored = null;
        if (storedRaw) {
            try {
                stored = JSON.parse(storedRaw);
            } catch (e) {
                Logger.error(`Failed to parse plugin order for ${key}:`, e);
            }
        }
        if (!stored || !Array.isArray(stored)) {
            this._setStoredPluginOrder(archetypeId, ids, listType);
            return ids;
        }
        const valid = new Set(ids);
        const filtered = stored.filter(id => valid.has(id));

        // De-dupe while preserving first occurrence (fixes historical corrupted order)
        const seen = new Set();
        const deduped = [];
        for (const id of filtered) {
            if (seen.has(id)) continue;
            seen.add(id);
            deduped.push(id);
        }

        const missing = ids.filter(id => !seen.has(id));
        const normalized = deduped.concat(missing);

        if (JSON.stringify(stored) !== JSON.stringify(normalized)) {
            this._setStoredPluginOrder(archetypeId, normalized, listType);
        }
        return normalized;
    },

    _getSettingsSnapshot(plugins, archetypeId) {
        const sortedPlugins = plugins
            .map(plugin => plugin)
            .sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        return {
            globalEnabled: this._getGlobalEnabled(),
            debug: Logger.isDebugEnabled(),
            verbose: Logger.isVerboseEnabled(),
            submoduleLogging: Logger.isSubmoduleLoggingEnabled(),
            pluginStates: sortedPlugins.map(plugin => {
                const state = {
                    id: plugin.id,
                    enabled: PluginManager.isEnabled(plugin.id),
                    moduleLogging: Logger.isModuleLoggingEnabled(plugin.id)
                };
                // Include sub-option states if plugin has them
                if (plugin.subOptions && Array.isArray(plugin.subOptions)) {
                    state.subOptions = plugin.subOptions.map(subOption => ({
                        id: subOption.id,
                        enabled: Storage.getSubOptionEnabled(plugin.id, subOption.id, subOption.enabledByDefault !== false)
                    }));
                }
                return state;
            }),
            pluginOrder: this._getStoredPluginOrder(archetypeId, plugins)
        };
    },

    _getGlobalEnabled() {
        return Storage.get('global-plugins-enabled', true);
    },

    _setGlobalEnabled(enabled) {
        Storage.set('global-plugins-enabled', enabled);
    },
    
    _getPulseOverrideEnabled() {
        return Storage.get('pulse-override-enabled', false);
    },
    
    _setPulseOverrideEnabled(enabled) {
        Storage.set('pulse-override-enabled', enabled);
    },

    _storeGlobalSnapshot(plugins) {
        if (!Array.isArray(plugins)) return;
        const snapshot = plugins.map(plugin => ({
            id: plugin.id,
            enabled: PluginManager.isEnabled(plugin.id)
        }));
        Storage.set('global-plugins-previous', JSON.stringify(snapshot));
    },

    _restoreGlobalSnapshot(plugins) {
        if (!Array.isArray(plugins)) return;
        const raw = Storage.get('global-plugins-previous', null);
        if (!raw) return;
        let snapshot = null;
        try {
            snapshot = JSON.parse(raw);
        } catch (e) {
            Logger.error('Failed to parse global plugins snapshot:', e);
            return;
        }
        if (!Array.isArray(snapshot)) return;
        const byId = new Map(snapshot.map(item => [item.id, item.enabled]));
        plugins.forEach(plugin => {
            if (byId.has(plugin.id)) {
                PluginManager.setEnabled(plugin.id, Boolean(byId.get(plugin.id)));
            }
        });
    },

    _getDevGlobalEnabled() {
        return Storage.get('dev-global-plugins-enabled', true);
    },

    _setDevGlobalEnabled(enabled) {
        Storage.set('dev-global-plugins-enabled', enabled);
    },

    _storeDevGlobalSnapshot(devPlugins) {
        if (!Array.isArray(devPlugins)) return;
        const snapshot = devPlugins.map(plugin => ({
            id: plugin.id,
            enabled: PluginManager.isEnabled(plugin.id)
        }));
        Storage.set('dev-global-plugins-previous', JSON.stringify(snapshot));
    },

    _restoreDevGlobalSnapshot(devPlugins) {
        if (!Array.isArray(devPlugins)) return;
        const raw = Storage.get('dev-global-plugins-previous', null);
        if (!raw) return;
        let snapshot = null;
        try {
            snapshot = JSON.parse(raw);
        } catch (e) {
            Logger.error('Failed to parse dev global plugins snapshot:', e);
            return;
        }
        if (!Array.isArray(snapshot)) return;
        const byId = new Map(snapshot.map(item => [item.id, item.enabled]));
        devPlugins.forEach(plugin => {
            if (byId.has(plugin.id)) {
                PluginManager.setEnabled(plugin.id, Boolean(byId.get(plugin.id)));
            }
        });
    },

    _updateDevPluginsButtonsVisibility(modal, devGlobalEnabled) {
        const buttonsContainer = Context.dom.query('#wf-all-dev-plugins-buttons', {
            root: modal,
            context: `${this.id}.allDevPluginsButtonsVisibility`
        });
        if (buttonsContainer) {
            buttonsContainer.style.display = devGlobalEnabled ? 'flex' : 'none';
        }
    },

    _ensureMessageElement(modal) {
        let msg = document.getElementById('wf-settings-message');
        if (!msg) {
            msg = document.createElement('div');
            msg.id = 'wf-settings-message';
            msg.style.cssText = `
                position: fixed;
                display: none;
                padding: 12px;
                background: #fef3c7;
                border: 1px solid #f59e0b;
                border-radius: 6px;
                font-size: 13px;
                text-align: center;
                color: #92400e;
                z-index: 10001;
            `;
            msg.innerHTML = 'Settings changed. <a href="#" id="wf-settings-refresh-link" style="color: #92400e; text-decoration: underline;">Refresh</a> the page for changes to take effect.';
            document.body.appendChild(msg);
            
            // Attach click listener for the refresh link
            const refreshLink = msg.querySelector('#wf-settings-refresh-link');
            if (refreshLink) {
                refreshLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    window.location.reload();
                });
            }
        }
        this._positionMessage(modal, msg);
        return msg;
    },

    _positionMessage(modal, msg) {
        if (!modal || !msg) return;
        const rect = modal.getBoundingClientRect();
        msg.style.left = `${rect.left}px`;
        msg.style.top = `${rect.bottom + 8}px`;
        msg.style.width = `${rect.width}px`;
    },

    _updateSettingsMessage(modal, plugins) {
        const msg = this._ensureMessageElement(modal);
        const current = this._getSettingsSnapshot(plugins, this._settingsArchetypeId);
        const changed = JSON.stringify(current) !== JSON.stringify(this._initialSettingsSnapshot);
        msg.style.display = changed ? 'block' : 'none';
        if (changed) {
            this._positionMessage(modal, msg);
        }
    },

    _updateAllPluginsButtonsVisibility(modal, globalEnabled) {
        const buttonsContainer = Context.dom.query('#wf-all-plugins-buttons', {
            root: modal,
            context: `${this.id}.allPluginsButtonsVisibility`
        });
        
        if (buttonsContainer) {
            buttonsContainer.style.display = globalEnabled ? 'flex' : 'none';
        }
    },

    _updateAllModuleLoggingButtonsVisibility(modal, submoduleLoggingEnabled) {
        const buttonsContainer = Context.dom.query('#wf-all-module-logging-buttons', {
            root: modal,
            context: `${this.id}.allModuleLoggingButtonsVisibility`
        });
        if (buttonsContainer) {
            buttonsContainer.style.display = submoduleLoggingEnabled ? 'flex' : 'none';
        }
    },
    
    _getSettingsTabs() {
        const tabs = [
            { id: 'settings', label: 'Settings' },
        ];
        if (this._hasActiveDevSettings()) {
            tabs.push({ id: 'dev', label: 'Dev' });
        }
        tabs.push(
            { id: 'information', label: 'Information', doc: 'information-tab.md' },
            { id: 'features', label: 'Features', doc: 'features-tab.md' }
        );
        return tabs;
    },

    _createTabRowHTML(tabs) {
        const activeTab = 'settings';
        const buttons = tabs.map(t => {
            const isActive = t.id === activeTab;
            return `<button type="button" class="wf-settings-tab" data-tab="${t.id}" style="
                padding: 6px 14px;
                font-size: 13px;
                font-weight: 500;
                color: ${isActive ? 'var(--foreground, #333)' : 'var(--muted-foreground, #666)'};
                background: ${isActive ? 'var(--card, #fafafa)' : 'transparent'};
                border: 1px solid ${isActive ? 'var(--border, #e5e5e5)' : 'transparent'};
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
            ">${t.label}</button>`;
        }).join('');
        return `<div id="wf-settings-tab-row" style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">${buttons}</div>`;
    },

    _attachTabListeners(modal) {
        const tabRow = Context.dom.query('#wf-settings-tab-row', {
            root: modal,
            context: `${this.id}.tabRow`
        });
        if (!tabRow) return;
        const tabs = this._getSettingsTabs();
        tabRow.querySelectorAll('.wf-settings-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');
                this._switchSettingsTab(modal, tabId);
            });
        });
    },

    _switchSettingsTab(modal, tabId) {
        const tabs = this._getSettingsTabs();
        const tabRow = Context.dom.query('#wf-settings-tab-row', { root: modal, context: `${this.id}.tabRowSwitch` });
        if (tabRow) {
            tabRow.querySelectorAll('.wf-settings-tab').forEach(btn => {
                const id = btn.getAttribute('data-tab');
                const isActive = id === tabId;
                btn.style.color = isActive ? 'var(--foreground, #333)' : 'var(--muted-foreground, #666)';
                btn.style.background = isActive ? 'var(--card, #fafafa)' : 'transparent';
                btn.style.border = isActive ? '1px solid var(--border, #e5e5e5)' : '1px solid transparent';
            });
        }
        modal.querySelectorAll('.wf-settings-pane').forEach(pane => {
            const id = pane.getAttribute('data-tab');
            pane.style.display = id === tabId ? 'block' : 'none';
        });
        const tabDef = tabs.find(t => t.id === tabId);
        if (tabDef && tabDef.doc) {
            const pane = Context.dom.query(`#wf-settings-pane-${tabId}`, { root: modal, context: `${this.id}.pane${tabId}` });
            if (pane && !pane.dataset.wfDocLoaded) {
                this._loadAndRenderDocTab(modal, tabId, tabDef.doc, pane);
            }
        }
    },

    _markdownToHtml(md) {
        if (!md || typeof md !== 'string') return '';
        const lines = md.trim().split(/\r?\n/);
        const out = [];
        let inList = false;
        const escape = (s) => String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
        const replaceLinks = (s) => escape(s).replace(linkRe, (_, text, href) => `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer" style="color: var(--brand, #4f46e5); text-decoration: none;">${escape(text)}</a>`);
        const replaceBold = (s) => s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        const processInlines = (s) => replaceBold(replaceLinks(s));
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (inList && trimmed !== '' && !/^\s*-\s+/.test(line)) {
                inList = false;
                out.push('</ul>');
            }
            if (trimmed === '') {
                out.push('<br>');
                continue;
            }
            const h4 = /^####\s+(.+)$/.exec(trimmed);
            const h3 = /^###\s+(.+)$/.exec(trimmed);
            const h2 = /^##\s+(.+)$/.exec(trimmed);
            const h1 = /^#\s+(.+)$/.exec(trimmed);
            const ul = /^-\s+(.+)$/.exec(trimmed);
            if (h4) { out.push(`<h5 style="font-size: 13px; font-weight: 600; margin: 8px 0 4px 0; color: var(--foreground, #333);">${processInlines(h4[1])}</h5>`); continue; }
            if (h3) { out.push(`<h4 style="font-size: 14px; font-weight: 600; margin: 8px 0 4px 0; color: var(--foreground, #333);">${processInlines(h3[1])}</h4>`); continue; }
            if (h2) { out.push(`<h3 style="font-size: 15px; font-weight: 600; margin: 10px 0 6px 0; color: var(--foreground, #333);">${processInlines(h2[1])}</h3>`); continue; }
            if (h1) { out.push(`<h2 style="font-size: 16px; font-weight: 600; margin: 12px 0 6px 0; color: var(--foreground, #333);">${processInlines(h1[1])}</h2>`); continue; }
            if (ul) {
                if (!inList) { inList = true; out.push('<ul style="margin: 6px 0; padding-left: 24px; list-style-type: disc;">'); }
                out.push(`<li style="margin: 2px 0; display: list-item;">${processInlines(ul[1])}</li>`);
                continue;
            }
            out.push(`<p style="margin: 6px 0; font-size: 13px; line-height: 1.5;">${processInlines(trimmed)}</p>`);
        }
        if (inList) out.push('</ul>');
        return out.join('');
    },

    _loadAndRenderDocTab(modal, tabId, docFilename, pane) {
        const cacheKey = tabId;
        if (this._docPaneCache[cacheKey]) {
            pane.innerHTML = this._docPaneCache[cacheKey];
            pane.dataset.wfDocLoaded = 'true';
            return;
        }
        if (!Context.settingsModalDocs || !Context.settingsModalDocs[docFilename]) {
            pane.innerHTML = '<p style="font-size: 13px; color: var(--muted-foreground, #666);">Could not load content.</p>';
            pane.dataset.wfDocLoaded = 'true';
            return;
        }
        const raw = Context.settingsModalDocs[docFilename].raw;
        const firstNewline = raw.indexOf('\n');
        const body = firstNewline >= 0 ? raw.slice(firstNewline + 1).trim() : raw.trim();
        const html = this._markdownToHtml(body);
        const docStyles = `<style>.wf-settings-doc-content h2{font-size:16px !important}.wf-settings-doc-content h3{font-size:15px !important;margin-top:12px !important}.wf-settings-doc-content h4{font-size:14px !important;margin-top:12px !important}.wf-settings-doc-content h5{font-size:13px !important;margin-top:12px !important}.wf-settings-doc-content ul{list-style-type:disc !important;padding-left:24px !important}.wf-settings-doc-content li{display:list-item !important}.wf-settings-doc-content strong{color:var(--foreground,#333) !important}</style>`;
        const wrapped = `${docStyles}<div class="wf-settings-doc-content" style="font-size: 13px; color: var(--muted-foreground, #666); padding: 4px 0;">${html}</div>`;
        this._docPaneCache[cacheKey] = wrapped;
        pane.innerHTML = wrapped;
        pane.dataset.wfDocLoaded = 'true';
    },

    _createOutdatedPluginsHTML(outdatedPlugins) {
        const pluginsList = outdatedPlugins.map(p => {
            let versionInfo = '';
            if (p.fetchedVersion) {
                versionInfo = `cached v${p.cachedVersion || 'none'}, fetched v${p.fetchedVersion}, required v${p.requiredVersion}`;
            } else if (p.nonJsResponse) {
                versionInfo = `cached v${p.cachedVersion}, server returned non-JS (CDN/network?), required v${p.requiredVersion}`;
            } else if (p.parseError) {
                const errHint = p.parseErrorMessage ? ` (${p.parseErrorMessage})` : '';
                versionInfo = `cached v${p.cachedVersion}, parse error during verification${errHint}, required v${p.requiredVersion}`;
            } else {
                versionInfo = `cached v${p.cachedVersion || 'none'}, required v${p.requiredVersion}`;
            }
            return `<li style="margin: 4px 0;"><strong>${p.filename}</strong>: ${versionInfo}</li>`;
        }).join('');
        
        return `
            <div style="
                margin-bottom: 20px;
                padding: 12px;
                background: #fef3c7;
                border: 1px solid #f59e0b;
                border-radius: 6px;
            ">
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px; color: #f59e0b;">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <h3 style="font-size: 14px; font-weight: 600; margin: 0; color: #92400e;">
                        Outdated Plugins (${outdatedPlugins.length})
                    </h3>
                </div>
                <p style="font-size: 12px; color: #92400e; margin: 8px 0 0 0; line-height: 1.5;">
                    The following plugins could not be updated to the required version. 
                    This may happen if you're offline, the server is unavailable, or GitHub's CDN 
                    hasn't updated yet (can take up to 5 minutes after a change).
                </p>
                <ul style="font-size: 12px; color: #92400e; margin: 8px 0 0 0; padding-left: 20px;">
                    ${pluginsList}
                </ul>
            </div>
        `;
    },
    
    _createUpdateNotificationHTML() {
        const currentVersion = Context.version || 'unknown';
        // If simulate update banner is enabled, simulate update by using current version + 0.1 as latest
        const isOverrideMode = Context.isDevBranch && this._getPulseOverrideEnabled() && !Context.isOutdated;
        let latestVersion = Context.latestVersion;
        
        if (isOverrideMode) {
            // Simulate update by making latest version slightly higher
            // Parse version and increment patch version
            const versionParts = currentVersion.split('.');
            if (versionParts.length >= 3) {
                const patch = parseInt(versionParts[2]) || 0;
                versionParts[2] = (patch + 1).toString();
                latestVersion = versionParts.join('.');
            } else {
                latestVersion = currentVersion;
            }
        } else {
            latestVersion = Context.latestVersion || 'unknown';
        }
        
        return `
            <div id="wf-update-notification-banner" style="
                margin-bottom: 20px;
                padding: 14px;
                padding-top: 20px;
                background: #fee2e2;
                border: 2px solid #dc2626;
                border-radius: 8px;
            ">
                <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 10px; color: #dc2626; flex-shrink: 0; margin-top: 2px;">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <div style="flex: 1;">
                        <h3 style="font-size: 15px; font-weight: 600; margin: 0 0 8px 0; color: #991b1b;">
                            Extension Update Available
                        </h3>
                        <p style="font-size: 13px; color: #991b1b; margin: 0 0 10px 0; line-height: 1.5;">
                            Your current version of this extension (<strong>${currentVersion}</strong>) is outdated. Please update to the <a id="wf-update-newest-link" href="https://raw.githubusercontent.com/${Context.githubOwner || 'adastra1826'}/${Context.githubRepo || 'fleet-ux-improvements'}/${Context.githubBranch || 'main'}/fleet.user.js" target="_blank" rel="noopener noreferrer" style="color: #991b1b; text-decoration: underline; font-weight: 600;">newest version</a> (<strong>${latestVersion}</strong>).
                        </p>
                    </div>
                </div>
                <div id="wf-update-refresh-row" style="display: none; margin-top: 12px; padding-top: 10px; border-top: 1px solid #fecaca;">
                    <button type="button" id="wf-update-refresh-btn" style="
                        padding: 8px 14px;
                        font-size: 13px;
                        font-weight: 600;
                        color: #991b1b;
                        background: #fef2f2;
                        border: 1px solid #dc2626;
                        border-radius: 6px;
                        cursor: pointer;
                    ">Refresh Page with New Version</button>
                </div>
            </div>
        `;
    }
};
