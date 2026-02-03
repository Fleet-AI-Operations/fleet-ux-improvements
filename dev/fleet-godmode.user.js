// ==UserScript==
// @name         Fleet UX Enhancer - GODMODE (dev identifier)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Dev-only key: allows using dev build of Fleet UX Enhancer. Install only if you are a dev.
// @author       Nicholas Doherty
// @match        https://www.fleetai.com/*
// @match        https://fleetai.com/*
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
