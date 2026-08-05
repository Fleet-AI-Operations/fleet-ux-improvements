// ============= fos-vm-clipboard-bar.js (library) =============
// Shared VM Clipboard Extract/Overwrite chrome for Action Counter bars.
// Archetype wrappers supply find/mount; readiness comes from Context.fosEmbedded.

const FOS_VM_CLIP_BAR_MARKER = 'data-fleet-fos-vm-clipboard-bar';
const FOS_VM_CLIP_BAR_SCOPE = '[data-fleet-fos-vm-clipboard-bar="true"]';

const FosVmClipboardBarApi = {
    id: 'fosVmClipboardBar',
    BAR_MARKER: FOS_VM_CLIP_BAR_MARKER,

    /**
     * @param {object} state
     * @param {object} options
     * @param {string} [options.pluginId]
     * @param {string} [options.logTag]
     * @param {function(): boolean} options.alreadyMounted
     * @param {function(HTMLElement): void} options.mountGroup
     * @param {string} [options.activationDetail]
     */
    run(state, options) {
        const opts = options || {};
        const logTag = opts.logTag || this.id;
        const pluginId = opts.pluginId || this.id;
        const alreadyMounted = opts.alreadyMounted;
        const mountGroup = opts.mountGroup;

        if (typeof alreadyMounted !== 'function' || typeof mountGroup !== 'function') {
            return;
        }

        if (alreadyMounted()) {
            this._ensureSubscription(state, logTag);
            this._syncVisibility(state, logTag);
            return;
        }

        document.querySelectorAll(`[${FOS_VM_CLIP_BAR_MARKER}="true"]`).forEach((el) => el.remove());
        const group = this.buildGroup(state, { pluginId, logTag });
        mountGroup(group);

        if (!state.activationLogged) {
            const detail = opts.activationDetail || 'VM Clipboard bar injected';
            Logger.log(`${logTag}: ${detail}`);
            state.activationLogged = true;
        }

        this._ensureSubscription(state, logTag);
        this._syncVisibility(state, logTag);
    },

    _primaryInstanceId() {
        const api = Context.fosEmbedded;
        if (!api || typeof api.getReadyInstances !== 'function') {
            return null;
        }
        const list = api.getReadyInstances();
        if (!list || !list.length) {
            return null;
        }
        return list[0].instanceId || null;
    },

    _flash(btn, ok) {
        if (!btn) {
            return;
        }
        if (Context.buttonFeedback) {
            if (ok && typeof Context.buttonFeedback.flashSuccess === 'function') {
                Context.buttonFeedback.flashSuccess(btn);
                return;
            }
            if (!ok && typeof Context.buttonFeedback.flashFailure === 'function') {
                Context.buttonFeedback.flashFailure(btn);
                return;
            }
        }
    },

    _ensureSubscription(state, logTag) {
        const api = Context.fosEmbedded;
        if (!api || typeof api.subscribe !== 'function') {
            if (!state.apiMissingLogged) {
                state.apiMissingLogged = true;
                Logger.warn(`${logTag}: Context.fosEmbedded unavailable`);
            }
            return;
        }
        state.apiMissingLogged = false;
        if (state.unsubscribe) {
            return;
        }
        state.unsubscribe = api.subscribe((evt) => {
            this._syncVisibility(state, logTag);
            if (evt && evt.ready) {
                if (!state.readyShownLogged) {
                    state.readyShownLogged = true;
                    state.readyHiddenLogged = false;
                    Logger.log(`${logTag}: VM Clipboard shown (instance ${evt.instanceId})`);
                }
            } else if (evt && !evt.ready) {
                const stillReady = this._primaryInstanceId();
                if (!stillReady && !state.readyHiddenLogged) {
                    state.readyHiddenLogged = true;
                    state.readyShownLogged = false;
                    Logger.log(`${logTag}: VM Clipboard hidden (no ready instance)`);
                }
            }
        });
    },

    _syncVisibility(state, logTag) {
        const root =
            (state.groupEl && state.groupEl.isConnected && state.groupEl) ||
            document.querySelector(`[${FOS_VM_CLIP_BAR_MARKER}="true"]`);
        if (!root) {
            return;
        }
        state.groupEl = root;
        const readyId = this._primaryInstanceId();
        const show = !!readyId;
        const nextDisplay = show ? 'inline-flex' : 'none';
        if (root.style.display !== nextDisplay) {
            root.style.display = nextDisplay;
            if (show && !state.readyShownLogged) {
                state.readyShownLogged = true;
                state.readyHiddenLogged = false;
                Logger.log(`${logTag}: VM Clipboard shown (instance ${readyId})`);
            } else if (!show && !state.readyHiddenLogged && state.activationLogged) {
                state.readyHiddenLogged = true;
                state.readyShownLogged = false;
                Logger.debug(`${logTag}: VM Clipboard hidden (waiting for FOS)`);
            }
        }
    },

    buildGroup(state, options) {
        const opts = options || {};
        const pluginId = opts.pluginId || this.id;
        const logTag = opts.logTag || pluginId;

        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles(FOS_VM_CLIP_BAR_SCOPE);
        }

        const root = document.createElement('div');
        root.setAttribute(FOS_VM_CLIP_BAR_MARKER, 'true');
        root.setAttribute('data-fleet-plugin', pluginId);
        root.style.cssText =
            'display:none;align-items:center;gap:6px;margin-left:8px;flex-shrink:0;';

        const label = document.createElement('span');
        label.textContent = 'VM Clipboard';
        label.style.cssText =
            'font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.02em;white-space:nowrap;';

        const btnClass =
            Context.uiLib && typeof Context.uiLib.btnClass === 'function'
                ? (variant) => Context.uiLib.btnClass(variant, 'compact')
                : () => '';

        const bExtract = document.createElement('button');
        bExtract.type = 'button';
        bExtract.textContent = 'Extract';
        bExtract.className = btnClass('basic');

        const bOverwrite = document.createElement('button');
        bOverwrite.type = 'button';
        bOverwrite.textContent = 'Overwrite';
        bOverwrite.className = btnClass('secondary');

        bExtract.addEventListener('click', () => {
            const api = Context.fosEmbedded;
            const instanceId = this._primaryInstanceId();
            if (!api || !instanceId || typeof api.extract !== 'function') {
                this._flash(bExtract, false);
                Logger.warn(`${logTag}: extract failed — no ready FOS instance`);
                return;
            }
            api.extract(instanceId).then((ok) => {
                this._flash(bExtract, !!ok);
                if (ok) {
                    Logger.log(`${logTag}: extract ok`);
                } else {
                    Logger.warn(`${logTag}: extract failed`);
                }
            });
        });

        bOverwrite.addEventListener('click', () => {
            const api = Context.fosEmbedded;
            const instanceId = this._primaryInstanceId();
            if (!api || !instanceId || typeof api.overwrite !== 'function') {
                this._flash(bOverwrite, false);
                Logger.warn(`${logTag}: overwrite failed — no ready FOS instance`);
                return;
            }
            api.overwrite(instanceId).then((ok) => {
                this._flash(bOverwrite, !!ok);
                if (ok) {
                    Logger.log(`${logTag}: overwrite ok`);
                } else {
                    Logger.warn(`${logTag}: overwrite failed`);
                }
            });
        });

        root.append(label, bExtract, bOverwrite);
        state.groupEl = root;
        return root;
    }
};

const plugin = {
    id: 'fosVmClipboardBarLib',
    name: 'FOS VM Clipboard Bar (library)',
    description:
        'Shared VM Clipboard Extract/Overwrite bar chrome (archetype modules supply find/mount)',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.fosVmClipboardBar = {
            BAR_MARKER: FOS_VM_CLIP_BAR_MARKER,
            run: (s, options) => FosVmClipboardBarApi.run(s, options),
            buildGroup: (s, options) => FosVmClipboardBarApi.buildGroup(s, options)
        };
        if (!state.registered) {
            Logger.log('fosVmClipboardBarLib: module registered (Context.fosVmClipboardBar)');
            state.registered = true;
        }
    }
};
