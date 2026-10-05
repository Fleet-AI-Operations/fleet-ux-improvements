// ============= fos-iframe-autoconnect.js =============
// Thin wrapper: shared Context.fosIframeAutoconnect library.

const plugin = {
    id: 'compUseRevisionFosIframeAutoconnect',
    name: 'FOS Viewport Resize',
    description:
        'Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL. Reloading the VM when you return to the tab is optional and off by default',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',
    subOptions: [
        {
            id: 'reconnect-on-focus',
            name: 'Reload instance when returning to this tab',
            description: 'Blanks and reloads the embedded VM. Off by default so a recording or in-progress session is not interrupted.',
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
