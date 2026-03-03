// ==UserScript==
// @name         GODMODE - Fleet UX Enhancer - (dev identifier)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Dev-only key: allows using dev builds of Fleet UX Enhancer. Install only if you are a dev.
// @icon         https://github.com/favicon.ico
// @author       Nicholas Doherty
// @match        https://www.fleetai.com/*
// @match        https://fleetai.com/*
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/Fleet-AI-Operations/fleet-ux-improvements/main/dev/fleet-godmode.user.js
// @downloadURL  https://raw.githubusercontent.com/Fleet-AI-Operations/fleet-ux-improvements/main/dev/fleet-godmode.user.js
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    if (window.top != window.self) {
        return;
    }

    try {
        const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (w && w.localStorage) {
            w.localStorage.setItem('fleet-godmode', 'GODMODE');
            console.log("[Fleet UX Enhancer - GODMODE] - GODMODE key set");
        }
    } catch (e) {
        // ignore
    }
})();
