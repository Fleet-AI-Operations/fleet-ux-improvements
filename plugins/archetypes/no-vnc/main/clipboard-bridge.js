// clipboard-bridge.js — noVNC clipboard bridge: floating UI + ⌘C/⌘V + Ctrl+Shift+C/F
// Converted from bookmarklet-clipboard-floater.js for auto-loading on no-vnc archetype pages.

var ROOT_ID = "fleet-novnc-clipboard-floater";
var Z = "2147483646";

function _clipEl() {
  return document.getElementById("noVNC_clipboard_text");
}
function _getRfb() {
  return (
    window.rfb ||
    window._rfb ||
    (window.UI && window.UI.rfb) ||
    (window.APP && window.APP.rfb) ||
    (window.noVNC && window.noVNC.rfb) ||
    null
  );
}
function _sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}
function _focusVncTarget() {
  var rfb = _getRfb();
  if (rfb && typeof rfb.focus === "function") {
    try {
      rfb.focus();
      return;
    } catch (e0) {}
  }
  var c = document.querySelector("canvas");
  if (c && typeof c.focus === "function") {
    try {
      c.focus();
    } catch (e1) {}
  }
}
/** Truncation for button toasts; empty becomes "(empty)". */
function _truncPreview(t) {
  if (t == null || String(t).length === 0) {
    return "(empty)";
  }
  t = String(t);
  return t.length > 40 ? t.slice(0, 40) + "\u2026" : t;
}
/** Truncation for Cmd+C / Cmd+V bridge toasts; empty stays blank. */
function _truncKey(t) {
  t = t == null ? "" : String(t);
  if (!t.length) {
    return "";
  }
  return t.length > 40 ? t.slice(0, 40) + "\u2026" : t;
}
function _fireKey(t, y, o) {
  t.dispatchEvent(
    new KeyboardEvent(
      y,
      Object.assign({ bubbles: true, cancelable: true, composed: true }, o)
    )
  );
}
function _sendCtrlDom(k) {
  var t =
    document.activeElement ||
    document.querySelector("canvas") ||
    document.body ||
    document.documentElement;
  _fireKey(t, "keydown", { key: "Control", code: "ControlLeft", ctrlKey: true });
  _fireKey(t, "keydown", { key: k, code: "Key" + k.toUpperCase(), ctrlKey: true });
  _fireKey(t, "keyup",   { key: k, code: "Key" + k.toUpperCase(), ctrlKey: true });
  _fireKey(t, "keyup",   { key: "Control", code: "ControlLeft" });
}
function _sendCtrlRfb(k) {
  var rf = _getRfb();
  if (!rf || typeof rf.sendKey !== "function") {
    return false;
  }
  var ctrl = 0xffe3;
  var ch = k.toLowerCase().charCodeAt(0);
  rf.sendKey(ctrl, "ControlLeft", true);
  rf.sendKey(ch, "Key" + k.toUpperCase(), true);
  rf.sendKey(ch, "Key" + k.toUpperCase(), false);
  rf.sendKey(ctrl, "ControlLeft", false);
  return true;
}
function _toast(m) {
  var d = document.createElement("div");
  d.textContent = m;
  d.style.cssText =
    "position:fixed;top:12px;right:12px;z-index:" +
    Z +
    ";background:rgba(0,0,0,0.88);color:#fff;font:12px/1.4 system-ui,Segoe UI,sans-serif;padding:10px 12px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.35);max-width:min(420px,92vw);word-break:break-word;white-space:pre-wrap;";
  document.body.appendChild(d);
  setTimeout(function () {
    d.remove();
  }, 2200);
}

/** Prefer text/plain blob (tabs/line breaks); used for Cmd+V and Overwrite. */
async function _readClipboardText() {
  try {
    var items = await navigator.clipboard.read();
    for (var i = 0; i < items.length; i++) {
      var types = items[i].types || [];
      for (var j = 0; j < types.length; j++) {
        if (types[j] === "text/plain") {
          var blob = await items[i].getType("text/plain");
          return await blob.text();
        }
      }
    }
  } catch (e2) {}
  return await navigator.clipboard.readText();
}

async function _syncRemoteClipboard(el, merged, caret, editingClipboard) {
  if (editingClipboard) {
    try {
      el.focus();
    } catch (eFocus) {}
  }
  var rf = _getRfb();
  if (rf && typeof rf.clipboardPasteFrom === "function") {
    el.value = merged;
    if (editingClipboard && typeof el.setSelectionRange === "function") {
      try {
        el.setSelectionRange(caret, caret);
      } catch (eSel) {}
    }
    rf.clipboardPasteFrom("");
    await _sleep(12);
    rf.clipboardPasteFrom(merged);
    return;
  }
  el.value = "";
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  await _sleep(12);
  el.value = merged;
  if (editingClipboard && typeof el.setSelectionRange === "function") {
    try {
      el.setSelectionRange(caret, caret);
    } catch (eSel2) {}
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function _runPasteFromClipboard() {
  var elSnap = _clipEl();
  var editingClipboard = !!(elSnap && document.activeElement === elSnap);
  var text = "";
  try {
    text = await _readClipboardText();
  } catch (err) {
    _toast("PASTE fail (clipboard)");
    _focusVncTarget();
    return;
  }
  var el = _clipEl();
  if (!el) {
    _toast("PASTE fail (noVNC el)");
    _focusVncTarget();
    return;
  }
  var cur = el.value || "";
  var merged;
  var caret;
  if (editingClipboard) {
    var start =
      typeof el.selectionStart === "number" ? el.selectionStart : cur.length;
    var end =
      typeof el.selectionEnd === "number" ? el.selectionEnd : cur.length;
    if (start > end) {
      var swap = start;
      start = end;
      end = swap;
    }
    merged = cur.slice(0, start) + text + cur.slice(end);
    caret = start + text.length;
  } else {
    merged = text;
    caret = text.length;
  }
  await _syncRemoteClipboard(el, merged, caret, editingClipboard);
  await _sleep(75);
  var ok = _sendCtrlRfb("v");
  if (!ok) {
    _sendCtrlDom("v");
  }
  _toast((ok ? "PASTE " : "PASTE? ") + "\u2192 " + _truncKey(merged));
  _focusVncTarget();
}

async function _runOverwriteFromShortcut() {
  try {
    var t = await _readClipboardText();
    await _pushOsTextToVmClipboard(typeof t === "string" ? t : "");
  } catch (eOw) {
    _toast("Overwrite failed: could not read system clipboard.");
    _focusVncTarget();
  }
}

async function _runCopyVmToHost() {
  if (!_sendCtrlRfb("c")) {
    _sendCtrlDom("c");
  }
  await _sleep(150);
  var el = _clipEl();
  var val = el ? el.value || "" : "";
  if (val) {
    try {
      await navigator.clipboard.writeText(val);
    } catch (eW) {
      _toast("COPY fail (could not write system clipboard)");
      _focusVncTarget();
      return;
    }
  }
  _toast("COPY \u2192 " + _truncKey(val));
  _focusVncTarget();
}

/** Push plain text to the virtual machine via noVNC (no Ctrl+V — updates remote clipboard only). */
async function _pushOsTextToVmClipboard(text) {
  var el = _clipEl();
  if (!el) {
    _toast("Overwrite failed: noVNC clipboard field (#noVNC_clipboard_text) not found.");
    _focusVncTarget();
    return;
  }
  var merged = text;
  var rfb = _getRfb();
  el.value = merged;
  if (rfb && typeof rfb.clipboardPasteFrom === "function") {
    rfb.clipboardPasteFrom("");
    await _sleep(12);
    rfb.clipboardPasteFrom(merged);
  } else {
    el.value = "";
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await _sleep(12);
    el.value = merged;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  _focusVncTarget();
  _toast(
    "Virtual machine clipboard updated from this computer.\n\u2192 " +
      _truncPreview(merged)
  );
}

async function _extractVmTextToOs() {
  var el = _clipEl();
  if (!el) {
    _toast("Extract failed: noVNC clipboard field not found.");
    _focusVncTarget();
    return;
  }
  var v = el.value || "";
  if (!v) {
    _toast(
      "Nothing to extract yet. Copy inside the virtual machine first, then try again."
    );
    _focusVncTarget();
    return;
  }
  try {
    await navigator.clipboard.writeText(v);
    _toast(
      "Copied virtual machine clipboard to this computer.\n\u2192 " +
        _truncPreview(v)
    );
    _focusVncTarget();
  } catch (e3) {
    _toast("Extract failed: could not write to system clipboard.");
    _focusVncTarget();
  }
}

function _initClipboardBridge() {
  // Remove any pre-existing instance (e.g. from a prior page load or bookmarklet run).
  var old = document.getElementById(ROOT_ID);
  if (old) {
    if (window.__fleetClipFloaterTeardown) {
      try {
        window.__fleetClipFloaterTeardown();
      } catch (e4) {}
    }
    old.remove();
  }
  if (window._v) {
    document.removeEventListener("keydown", window._v, true);
  }

  /** Serialize paste, overwrite, and extract so clipboard I/O does not interleave. */
  var clipQueue = Promise.resolve();

  // ---- Floating panel ----
  var root = document.createElement("div");
  root.id = ROOT_ID;
  root.style.cssText =
    "position:fixed;left:16px;top:120px;width:280px;z-index:" +
    Z +
    ";font:13px/1.45 system-ui,Segoe UI,sans-serif;color:#e8e8e8;background:linear-gradient(160deg,#1e1e24 0%,#121218 100%);border:1px solid rgba(255,255,255,0.12);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.55);overflow:hidden;user-select:none;";

  var headerEl = document.createElement("div");
  headerEl.textContent = "Clipboard bridge";
  headerEl.style.cssText =
    "cursor:grab;padding:10px 12px;font-weight:600;font-size:12px;letter-spacing:0.02em;color:#fff;background:rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.08);";

  var bodyEl = document.createElement("div");
  bodyEl.style.cssText = "padding:12px;user-select:text;";
  bodyEl.style.userSelect = "text";

  function btn(label) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText =
      "display:block;width:100%;margin:0 0 8px 0;padding:9px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#f2f2f2;font:inherit;font-weight:500;cursor:pointer;";
    b.onmouseenter = function () {
      b.style.background = "rgba(255,255,255,0.14)";
    };
    b.onmouseleave = function () {
      b.style.background = "rgba(255,255,255,0.08)";
    };
    return b;
  }

  var bExtract  = btn("Extract VM Clipboard");
  var bOverwrite = btn("Overwrite VM Clipboard");

  var details = document.createElement("details");
  details.style.cssText =
    "margin:4px 0 0 0;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;";
  var summaryEl = document.createElement("summary");
  summaryEl.textContent = "How this works";
  summaryEl.style.cssText =
    "cursor:pointer;font-size:12px;color:#b0b0b8;outline:none;user-select:none;";
  var help = document.createElement("div");
  help.style.cssText =
    "margin-top:10px;font-size:11px;color:#a5a5ad;line-height:1.55;user-select:text;";

  function pBlock(strongLabel, rest) {
    var p = document.createElement("p");
    p.style.margin = "0 0 8px 0";
    var s = document.createElement("strong");
    s.style.color = "#ddd";
    s.textContent = strongLabel;
    p.appendChild(s);
    p.appendChild(document.createTextNode(" " + rest));
    return p;
  }
  help.appendChild(
    pBlock(
      "Extract Clipboard",
      "copies the text noVNC currently holds for the virtual machine into this computer\u2019s system clipboard. Use the virtual machine\u2019s normal copy first so that buffer fills, then click Extract."
    )
  );
  help.appendChild(
    pBlock(
      "Overwrite Clipboard",
      "takes plain text from this computer\u2019s clipboard and pushes it into noVNC\u2019s virtual machine clipboard buffer. Then use the virtual machine\u2019s normal paste."
    )
  );
  help.appendChild(
    pBlock(
      "Keyboard",
      "\u2318+C sends Ctrl+C to the virtual machine, then copies noVNC\u2019s buffer to this computer. \u2318+V pushes this computer\u2019s clipboard into the virtual machine and sends Ctrl+V. Ctrl+Shift+F is the same as Overwrite VM Clipboard. Ctrl+Shift+C is the same as Extract VM Clipboard."
    )
  );
  var p3 = document.createElement("p");
  p3.style.margin = "0";
  p3.textContent =
    "Always combine these controls with the virtual machine\u2019s native copy/paste: copy in the virtual machine \u2192 Extract (or Ctrl+Shift+C) to the host; copy on the host \u2192 Overwrite (or Ctrl+Shift+F) \u2192 paste in the virtual machine (or \u2318+V).";
  help.appendChild(p3);

  details.appendChild(summaryEl);
  details.appendChild(help);
  bodyEl.appendChild(bExtract);
  bodyEl.appendChild(bOverwrite);
  bodyEl.appendChild(details);
  root.appendChild(headerEl);
  root.appendChild(bodyEl);
  document.body.appendChild(root);

  // ---- Button listeners ----
  bExtract.addEventListener("click", function () {
    clipQueue = clipQueue
      .then(function () { return _extractVmTextToOs(); })
      .catch(function () {});
  });
  bOverwrite.addEventListener("click", function () {
    clipQueue = clipQueue
      .then(_runOverwriteFromShortcut)
      .catch(function () {});
  });

  // ---- Drag ----
  var drag = false;
  var ox = 0;
  var oy = 0;
  function onMove(ev) {
    if (!drag) { return; }
    root.style.left = Math.max(0, ev.clientX - ox) + "px";
    root.style.top  = Math.max(0, ev.clientY - oy) + "px";
  }
  function onUp() {
    drag = false;
    headerEl.style.cursor = "grab";
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mouseup", onUp, true);
  }
  headerEl.addEventListener("mousedown", function (ev) {
    if (ev.button !== 0) { return; }
    drag = true;
    headerEl.style.cursor = "grabbing";
    var r = root.getBoundingClientRect();
    ox = ev.clientX - r.left;
    oy = ev.clientY - r.top;
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    ev.preventDefault();
  });

  // ---- Keyboard shortcuts ----
  window._v = async function (e) {
    var key = (e.key || "").toLowerCase();
    if (e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.code === "KeyF") {
      if (e.repeat) { return; }
      e.preventDefault();
      e.stopPropagation();
      clipQueue = clipQueue.then(_runOverwriteFromShortcut).catch(function () {});
      return;
    }
    if (e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.code === "KeyC") {
      if (e.repeat) { return; }
      e.preventDefault();
      e.stopPropagation();
      clipQueue = clipQueue
        .then(function () { return _extractVmTextToOs(); })
        .catch(function () {});
      return;
    }
    if (e.metaKey && !e.ctrlKey && !e.altKey && key === "c") {
      e.preventDefault();
      e.stopPropagation();
      clipQueue = clipQueue.then(_runCopyVmToHost).catch(function () {});
      return;
    }
    if (e.metaKey && !e.ctrlKey && !e.altKey && key === "v") {
      e.preventDefault();
      e.stopPropagation();
      clipQueue = clipQueue.then(_runPasteFromClipboard).catch(function () {});
      return;
    }
  };
  document.addEventListener("keydown", window._v, true);

  // ---- Teardown ----
  window.__fleetClipFloaterTeardown = function () {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mouseup", onUp, true);
    if (window._v) {
      document.removeEventListener("keydown", window._v, true);
      window._v = null;
    }
    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }
  };

  Logger.log("clipboard-bridge: floating panel and keyboard shortcuts active");
  _toast("Clipboard bridge ready \u2014 drag the title bar. \u2318C/\u2318V, Ctrl+Shift+C/F.");
}

const plugin = {
  id: "clipboard-bridge",
  name: "noVNC Clipboard Bridge",
  description:
    "Floating clipboard bridge panel with ⌘C/⌘V and Ctrl+Shift+C/F shortcuts for noVNC sessions",
  _version: "1.0",
  enabledByDefault: true,
  phase: "mutation",
  initialState: { ready: false },

  onMutation(state) {
    if (state.ready) { return; }
    if (!document.getElementById("noVNC_clipboard_text")) { return; }
    state.ready = true;
    Logger.log("clipboard-bridge: noVNC clipboard element detected, initialising bridge");
    _initClipboardBridge();
  },
};
