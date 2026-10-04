// ============= fos-iframe-autoconnect.js =============
// Thin wrapper: shared Context.fosIframeAutoconnect library.

const plugin = {
    id: 'compUseRevisionFosIframeAutoconnect',
    name: 'FOS Viewport Resize',
    description:
        'Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; can optionally reload it when you return to the tab',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',
    subOptions: [
        {
            id: 'reconnect-on-tab-focus',
            name: 'Reload the instance when returning to the tab',
            description: 'Reconnects the embedded environment each time you come back to this tab. Off by default because it interrupts whatever is running in the instance',
            enabledByDefault: false
        }
    ],
    initialState: {
        waitingIframeLogged: false,
        waitingFosLogged: false,
        patchedLogged: false,
        openBtnLogged: false,
        hadIframe: false,
        hadOpenBtn: false,
        patchInProgress: false,
        visibilityInstalled: false,
        wasHidden: false,
        desktopUnsub: null,
        reloadTimer: null,
        pendingFocusReconnect: false
    },

    onMutation(state) {
        const api = Context.fosIframeAutoconnect;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id });
    }
};
