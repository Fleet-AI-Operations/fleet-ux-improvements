javascript:(function () {
  /* Floating clipboard UI + noVNC bridge: ⌘C/⌘V, Ctrl+Shift+C (Extract), Ctrl+Shift+F (Overwrite). Bookmark bar: one-line javascript: URL. */
  var ROOT_ID = "fleet-novnc-clipboard-floater";
  var Z = "2147483646";

  if (window._v) {
    document.removeEventListener("keydown", window._v, true);
  }

  function clipEl() {
    return document.getElementById("noVNC_clipboard_text");
  }
  function getRfb() {
    return (
      window.rfb ||
      window._rfb ||
      (window.UI && window.UI.rfb) ||
      (window.APP && window.APP.rfb) ||
      (window.noVNC && window.noVNC.rfb) ||
      null
    );
  }
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  function focusVncTarget() {
    var rfb = getRfb();
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
  /** Truncation for button toasts; empty becomes “(empty)”. */
  function truncPreview(t) {
    if (t == null || String(t).length === 0) {
      return "(empty)";
    }
    t = String(t);
    return t.length > 40 ? t.slice(0, 40) + "\u2026" : t;
  }
  /** Truncation for Cmd+C / Cmd+V bridge toasts; empty stays blank. */
  function truncKey(t) {
    t = t == null ? "" : String(t);
    if (!t.length) {
      return "";
    }
    return t.length > 40 ? t.slice(0, 40) + "\u2026" : t;
  }
  function fireKey(t, y, o) {
    t.dispatchEvent(
      new KeyboardEvent(
        y,
        Object.assign({ bubbles: true, cancelable: true, composed: true }, o)
      )
    );
  }
  function sendCtrlDom(k) {
    var t =
      document.activeElement ||
      document.querySelector("canvas") ||
      document.body ||
      document.documentElement;
    fireKey(t, "keydown", { key: "Control", code: "ControlLeft", ctrlKey: true });
    fireKey(t, "keydown", {
      key: k,
      code: "Key" + k.toUpperCase(),
      ctrlKey: true,
    });
    fireKey(t, "keyup", {
      key: k,
      code: "Key" + k.toUpperCase(),
      ctrlKey: true,
    });
    fireKey(t, "keyup", { key: "Control", code: "ControlLeft" });
  }
  function sendCtrlRfb(k) {
    var rf = getRfb();
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
  function toast(m) {
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
  async function readClipboardText() {
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

  async function syncRemoteClipboard(el, merged, caret, editingClipboard) {
    if (editingClipboard) {
      try {
        el.focus();
      } catch (eFocus) {}
    }
    var rf = getRfb();
    if (rf && typeof rf.clipboardPasteFrom === "function") {
      el.value = merged;
      if (editingClipboard && typeof el.setSelectionRange === "function") {
        try {
          el.setSelectionRange(caret, caret);
        } catch (eSel) {}
      }
      rf.clipboardPasteFrom("");
      await sleep(12);
      rf.clipboardPasteFrom(merged);
      return;
    }
    el.value = "";
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(12);
    el.value = merged;
    if (editingClipboard && typeof el.setSelectionRange === "function") {
      try {
        el.setSelectionRange(caret, caret);
      } catch (eSel2) {}
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function runPasteFromClipboard() {
    var elSnap = clipEl();
    var editingClipboard = !!(elSnap && document.activeElement === elSnap);
    var text = "";
    try {
      text = await readClipboardText();
    } catch (err) {
      toast("PASTE fail (clipboard)");
      focusVncTarget();
      return;
    }
    var el = clipEl();
    if (!el) {
      toast("PASTE fail (noVNC el)");
      focusVncTarget();
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
    await syncRemoteClipboard(el, merged, caret, editingClipboard);
    await sleep(75);
    var ok = sendCtrlRfb("v");
    if (!ok) {
      sendCtrlDom("v");
    }
    toast((ok ? "PASTE " : "PASTE? ") + "\u2192 " + truncKey(merged));
    focusVncTarget();
  }

  /** Serialize paste, overwrite, and extract so clipboard I/O does not interleave. */
  var clipQueue = Promise.resolve();

  async function runOverwriteFromShortcut() {
    try {
      var t = await readClipboardText();
      await pushOsTextToVmClipboard(typeof t === "string" ? t : "");
    } catch (eOw) {
      toast("Overwrite failed: could not read system clipboard.");
      focusVncTarget();
    }
  }

  async function runCopyVmToHost() {
    if (!sendCtrlRfb("c")) {
      sendCtrlDom("c");
    }
    await sleep(150);
    var el = clipEl();
    var val = el ? el.value || "" : "";
    if (val) {
      try {
        await navigator.clipboard.writeText(val);
      } catch (eW) {
        toast("COPY fail (could not write system clipboard)");
        focusVncTarget();
        return;
      }
    }
    toast("COPY \u2192 " + truncKey(val));
    focusVncTarget();
  }

  /** Push plain text to the virtual machine via noVNC (no Ctrl+V — updates remote clipboard only). */
  async function pushOsTextToVmClipboard(text) {
    var el = clipEl();
    if (!el) {
      toast("Overwrite failed: noVNC clipboard field (#noVNC_clipboard_text) not found.");
      focusVncTarget();
      return;
    }
    var merged = text;
    var rfb = getRfb();
    el.value = merged;
    if (rfb && typeof rfb.clipboardPasteFrom === "function") {
      rfb.clipboardPasteFrom("");
      await sleep(12);
      rfb.clipboardPasteFrom(merged);
    } else {
      el.value = "";
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(12);
      el.value = merged;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    focusVncTarget();
    toast(
      "Virtual machine clipboard updated from this computer.\n\u2192 " +
        truncPreview(merged)
    );
  }

  async function extractVmTextToOs() {
    var el = clipEl();
    if (!el) {
      toast("Extract failed: noVNC clipboard field not found.");
      focusVncTarget();
      return;
    }
    var v = el.value || "";
    if (!v) {
      toast(
        "Nothing to extract yet. Copy inside the virtual machine first, then try again."
      );
      focusVncTarget();
      return;
    }
    try {
      await navigator.clipboard.writeText(v);
      toast(
        "Copied virtual machine clipboard to this computer.\n\u2192 " +
          truncPreview(v)
      );
      focusVncTarget();
    } catch (e3) {
      toast("Extract failed: could not write to system clipboard.");
      focusVncTarget();
    }
  }

  var old = document.getElementById(ROOT_ID);
  if (old) {
    if (window.__fleetClipFloaterTeardown) {
      try {
        window.__fleetClipFloaterTeardown();
      } catch (e4) {}
    }
    old.remove();
  }

  var root = document.createElement("div");
  root.id = ROOT_ID;
  root.style.cssText =
    "position:fixed;left:16px;top:120px;width:280px;z-index:" +
    Z +
    ";font:13px/1.45 system-ui,Segoe UI,sans-serif;color:#e8e8e8;background:linear-gradient(160deg,#1e1e24 0%,#121218 100%);border:1px solid rgba(255,255,255,0.12);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.55);overflow:hidden;user-select:none;";

  var header = document.createElement("div");
  header.textContent = "Clipboard bridge";
  header.style.cssText =
    "cursor:grab;padding:10px 12px;font-weight:600;font-size:12px;letter-spacing:0.02em;color:#fff;background:rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.08);";

  var body = document.createElement("div");
  body.style.cssText = "padding:12px;user-select:text;";
  body.style.userSelect = "text";

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

  var bExtract = btn("Extract VM Clipboard");
  var bOverwrite = btn("Overwrite VM Clipboard");

  var details = document.createElement("details");
  details.style.cssText =
    "margin:4px 0 0 0;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;";
  var summary = document.createElement("summary");
  summary.textContent = "How this works";
  summary.style.cssText =
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
      "copies the text noVNC currently holds for the virtual machine into this computer’s system clipboard. Use the virtual machine’s normal copy first so that buffer fills, then click Extract."
    )
  );
  help.appendChild(
    pBlock(
      "Overwrite Clipboard",
      "takes plain text from this computer’s clipboard and pushes it into noVNC’s virtual machine clipboard buffer. Then use the virtual machine’s normal paste."
    )
  );
  help.appendChild(
    pBlock(
      "Keyboard",
      "⌘+C sends Ctrl+C to the virtual machine, then copies noVNC’s buffer to this computer. ⌘+V pushes this computer’s clipboard into the virtual machine and sends Ctrl+V. Ctrl+Shift+F is the same as Overwrite VM Clipboard. Ctrl+Shift+C is the same as Extract VM Clipboard."
    )
  );
  var p3 = document.createElement("p");
  p3.style.margin = "0";
  p3.textContent =
    "Always combine these controls with the virtual machine’s native copy/paste: copy in the virtual machine → Extract (or Ctrl+Shift+C) to the host; copy on the host → Overwrite (or Ctrl+Shift+F) → paste in the virtual machine (or ⌘+V).";
  help.appendChild(p3);

  details.appendChild(summary);
  details.appendChild(help);

  body.appendChild(bExtract);
  body.appendChild(bOverwrite);
  body.appendChild(details);

  root.appendChild(header);
  root.appendChild(body);
  document.body.appendChild(root);

  bExtract.addEventListener("click", function () {
    clipQueue = clipQueue.then(function () {
      return extractVmTextToOs();
    }).catch(function () {});
  });
  bOverwrite.addEventListener("click", function () {
    clipQueue = clipQueue
      .then(runOverwriteFromShortcut)
      .catch(function () {});
  });

  var drag = false;
  var ox = 0;
  var oy = 0;
  function onMove(ev) {
    if (!drag) {
      return;
    }
    var x = ev.clientX - ox;
    var y = ev.clientY - oy;
    root.style.left = Math.max(0, x) + "px";
    root.style.top = Math.max(0, y) + "px";
  }
  function onUp() {
    drag = false;
    header.style.cursor = "grab";
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mouseup", onUp, true);
  }
  header.addEventListener("mousedown", function (ev) {
    if (ev.button !== 0) {
      return;
    }
    drag = true;
    header.style.cursor = "grabbing";
    var r = root.getBoundingClientRect();
    ox = ev.clientX - r.left;
    oy = ev.clientY - r.top;
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    ev.preventDefault();
  });

  window._v = async function (e) {
    var key = (e.key || "").toLowerCase();
    if (e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.code === "KeyF") {
      if (e.repeat) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      clipQueue = clipQueue.then(runOverwriteFromShortcut).catch(function () {});
      return;
    }
    if (e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.code === "KeyC") {
      if (e.repeat) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      clipQueue = clipQueue
        .then(function () {
          return extractVmTextToOs();
        })
        .catch(function () {});
      return;
    }
    if (e.metaKey && !e.ctrlKey && !e.altKey && key === "c") {
      e.preventDefault();
      e.stopPropagation();
      clipQueue = clipQueue.then(runCopyVmToHost).catch(function () {});
      return;
    }
    if (e.metaKey && !e.ctrlKey && !e.altKey && key === "v") {
      e.preventDefault();
      e.stopPropagation();
      clipQueue = clipQueue.then(runPasteFromClipboard).catch(function () {});
      return;
    }
  };
  document.addEventListener("keydown", window._v, true);

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

  toast(
    "Clipboard bridge ready — drag the title bar. ⌘C/⌘V, Ctrl+Shift+C/F."
  );
})();
