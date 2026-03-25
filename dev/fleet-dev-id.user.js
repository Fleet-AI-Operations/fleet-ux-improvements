// ==UserScript==
// @name         DEV-ID - Fleet UX Enhancer - (dev identifier)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Dev-only branch identifier for Fleet UX Enhancer dev builds.
// @icon         https://github.com/favicon.ico
// @author       Nicholas Doherty
// @match        https://www.fleetai.com/*
// @match        https://fleetai.com/*
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/Fleet-AI-Operations/fleet-ux-improvements/main/dev/fleet-dev-id.user.js
// @downloadURL  https://raw.githubusercontent.com/Fleet-AI-Operations/fleet-ux-improvements/main/dev/fleet-dev-id.user.js
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    if (window.top != window.self) {
        return;
    }

    const DEV_ID_STORAGE_KEY = 'fleet-dev-branch-id';
    const BRANCH_NAME = 'main';

    try {
        const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (w && w.localStorage) {
            w.localStorage.setItem(DEV_ID_STORAGE_KEY, BRANCH_NAME);
            console.log(`[Fleet UX Enhancer - DEV-ID] - Branch dev ID key set for "${BRANCH_NAME}"`);
        }
    } catch (e) {
        // ignore
    }
})();