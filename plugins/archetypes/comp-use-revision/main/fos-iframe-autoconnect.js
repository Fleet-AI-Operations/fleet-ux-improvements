// ============= fos-iframe-autoconnect.js =============
// Thin wrapper: shared Context.fosIframeAutoconnect library.

const plugin = {
    id: 'compUseRevisionFosIframeAutoconnect',
    name: 'FOS Viewport Resize',
    description:
        'Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
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
        reloadTimer: null
    },

    onMutation(state) {
        const api = Context.fosIframeAutoconnect;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id });
    }
};
