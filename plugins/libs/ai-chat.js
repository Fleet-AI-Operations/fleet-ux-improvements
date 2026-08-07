// ============= ai-chat.js (library) =============
// Shared OpenRouter chat transcript UI + streaming controller, backed by
// Deep Chat (<deep-chat>). Used by verifier-fetcher Diagnose/Chat, rating-
// explain cards, Search Chat, and the Ops dashboard Chats tab.
//
// Consumers supply feature-specific system prompts, mount markup, and
// turn callbacks. This module owns Deep Chat mounting, message sync, and
// chatCompletionStream orchestration.
//
// ## Turn modes (Context.aiChat.sendTurn)
//
// 1. Composer — user typed; Deep Chat connect sets `_wfAiChatFromHandler` and
//    streams via Deep Chat signals. Consumer `onSend` may wrap sendTurn.
// 2. Programmatic hidden (`hideInUi: true`) — bulk context (ratings overview,
//    tool intermediates). No user bubble; AI painted with addMessage/updateMessage.
// 3. Programmatic visible — short `displayContent` (+ optional `displayAttachment`
//    chip). Same direct paint path as hidden; never submitUserMessage / _pendingTurn.
//
// ## Attachments
//
// `displayAttachment` is UI metadata (chip + lazy-expanded source). Full verifier
// text for the model belongs in `userContent` / message.content, not forced into
// the shadow DOM on every row sync.
//
// ## Consumer rules
//
// - Wire the composer once; open the pane without remounting mid-send.
// - Bulk context → userContent (`hideInUi` when no bubble is needed).
// - Short label → displayContent; chips → displayAttachment.
// - Do not call renderMessages / force history sync around sendTurn.
// - Layout/toolbar helpers must not remount AI chat.

const AI_CHAT_VERSION = '7.2';
const PLUGIN_ID = 'ai-chat';
const AI_CHAT_MAX_WIDTH_PX = 900;
const AI_CHAT_TOOL_ROUND_TIMEOUT_MS = 90000;
const AI_CHAT_NO_KEY_OVERLAY_ATTR = 'data-wf-ai-chat-no-key-overlay';
const AI_CHAT_KEY_GATED_ATTR = 'data-wf-ai-chat-key-gated';
const AI_CHAT_ATTACH_SOURCE_ATTR = 'data-wf-chat-attach-source-ready';
const AI_CHAT_CALLBACK_KEYS = [
    'onSend', 'onStop', 'onExport', 'onTurnDone', 'getTurnOpts',
    'onToolActivity', 'executeTool',
];

function aiChatCopyIconSvg() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
        + ' aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>'
        + '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
}

function aiChatEnsureUiLibStyles() {
    const ui = Context.uiLib;
    if (ui && typeof ui.ensureStyles === 'function') {
        try { ui.ensureStyles(); } catch (_e) { /* ignore */ }
    }
}

/** Copy text with color-only feedback (works in deep-chat shadow via auxiliaryStyle flash CSS). */
async function aiChatCopyWithFeedback(el, text, logLabel) {
    aiChatEnsureUiLibStyles();
    const value = String(text == null ? '' : text);
    if (!String(value).trim()) {
        if (Context.buttonFeedback && typeof Context.buttonFeedback.flashFailure === 'function') {
            Context.buttonFeedback.flashFailure(el);
        } else {
            aiChatFlashCopyButton(el, false);
        }
        Logger.warn('copy skipped (empty ' + (logLabel || 'payload') + ')');
        return false;
    }
    try {
        if (Context.buttonFeedback && typeof Context.buttonFeedback.copyWithFeedback === 'function') {
            const ok = await Context.buttonFeedback.copyWithFeedback(el, value, {
                logLabel: logLabel || 'chat copy',
            });
            if (!ok) aiChatFlashCopyButton(el, false);
            else aiChatFlashCopyButton(el, true);
            return !!ok;
        }
        await navigator.clipboard.writeText(value);
        if (Context.buttonFeedback && typeof Context.buttonFeedback.flashSuccess === 'function') {
            Context.buttonFeedback.flashSuccess(el);
        }
        aiChatFlashCopyButton(el, true);
        Logger.log('copied ' + (logLabel || 'chat copy') + ' (' + value.length + ' chars)');
        return true;
    } catch (err) {
        if (Context.buttonFeedback && typeof Context.buttonFeedback.flashFailure === 'function') {
            Context.buttonFeedback.flashFailure(el);
        }
        aiChatFlashCopyButton(el, false);
        Logger.error('failed to copy ' + (logLabel || 'chat copy'), err);
        return false;
    }
}

function aiChatHasKey() {
    return !!(Context.aiOpenRouter
        && typeof Context.aiOpenRouter.hasStoredKey === 'function'
        && Context.aiOpenRouter.hasStoredKey());
}

/**
 * Shared no-key copy for Ops AI chat surfaces (red centered overlay body).
 */
function aiChatNoKeyMessageHtml() {
    return '<div style="text-align: center; font-size: 13px; line-height: 1.5;'
        + ' color: var(--destructive, #dc2626); max-width: 36em; margin: 0 auto; padding: 12px;">'
        + 'This feature needs a valid OpenRouter API key to work. Get a key at '
        + '<a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer"'
        + ' style="color: inherit; text-decoration: underline; pointer-events: auto; cursor: pointer;">'
        + 'openrouter.ai</a>,'
        + ' then paste it in the <strong>Settings</strong> tab under AI Integration.'
        + '</div>';
}

/**
 * Resolve the Deep Chat mount node from a mount element or a panel root + selector.
 */
function aiChatResolveMountNode(rootOrMount, opts) {
    if (!rootOrMount) return null;
    const o = opts || {};
    if (o.mount && o.mount.nodeType === 1) return o.mount;
    if (o.mountSelector && typeof rootOrMount.querySelector === 'function') {
        const found = rootOrMount.querySelector(o.mountSelector);
        if (found) return found;
    }
    if (rootOrMount.tagName === 'DEEP-CHAT') {
        return rootOrMount.parentElement;
    }
    if (typeof rootOrMount.querySelector === 'function'
        && rootOrMount.querySelector(':scope > deep-chat')) {
        return rootOrMount;
    }
    return rootOrMount;
}

/**
 * Show or hide the no-key overlay and grey the Deep Chat input.
 * Returns whether a stored OpenRouter key is present (after applying opts.hasKey override).
 *
 * @param {Element} rootOrMount Panel root or chat mount node
 * @param {{ mountSelector?: string, mount?: Element, hasKey?: boolean,
 *   state?: object, wireOpts?: object }} [opts]
 */
function aiChatSetKeyGate(rootOrMount, opts) {
    const o = opts || {};
    const hasKey = o.hasKey != null ? !!o.hasKey : aiChatHasKey();
    const mount = aiChatResolveMountNode(rootOrMount, o);
    if (!mount) return hasKey;

    const computed = window.getComputedStyle(mount);
    if (computed.position === 'static') {
        mount.style.position = 'relative';
    }

    let overlay = mount.querySelector('[' + AI_CHAT_NO_KEY_OVERLAY_ATTR + '="1"]');
    if (!hasKey) {
        mount.setAttribute(AI_CHAT_KEY_GATED_ATTR, '1');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.setAttribute(AI_CHAT_NO_KEY_OVERLAY_ATTR, '1');
            overlay.setAttribute('role', 'status');
            // Leave the floating input strip (~76px) visible and greyed underneath.
            overlay.style.cssText = 'position: absolute; inset: 0 0 76px 0; z-index: 4;'
                + ' display: flex; align-items: center; justify-content: center;'
                + ' pointer-events: none; box-sizing: border-box; padding: 16px;';
            overlay.innerHTML = aiChatNoKeyMessageHtml();
            mount.appendChild(overlay);
        } else {
            overlay.style.display = 'flex';
            if (!overlay.innerHTML) overlay.innerHTML = aiChatNoKeyMessageHtml();
        }
    } else {
        mount.removeAttribute(AI_CHAT_KEY_GATED_ATTR);
        if (overlay) overlay.style.display = 'none';
    }

    const state = o.state || null;
    const el = (state && state._deepChat)
        || mount.querySelector('deep-chat')
        || null;
    if (el) {
        el._wfAiChatKeyGated = !hasKey;
        const wireOpts = o.wireOpts || (state && state._wireOpts) || {};
        aiChatApplyTheme(el, aiChatResolveOpts(wireOpts));
        try {
            el.disableSubmitButton(!hasKey);
        } catch (_e) { /* ignore */ }
    }
    return hasKey;
}

function aiChatCreateState(extra) {
    return Object.assign({
        messages: [],
        streaming: false,
        streamAbort: null,
        streamGen: 0,
        stopRequested: false,
        _deepChat: null,
        _wireOpts: null,
        _pendingTurn: null,
        _mountPromise: null,
    }, extra || {});
}

function aiChatResolveOpts(opts) {
    const o = opts || {};
    return {
        mountSelector: o.mountSelector || '[data-wf-ai-chat-mount]',
        exportSelector: o.exportSelector || '[data-wf-ai-chat-export]',
        wiredAttr: o.wiredAttr || 'data-wf-ai-chat-wired',
        logTag: o.logTag || PLUGIN_ID,
        exportFilename: o.exportFilename || 'ai-chat-conversation.json',
        exportMetadata: o.exportMetadata || null,
        placeholder: o.placeholder || 'Message…',
        onSend: typeof o.onSend === 'function' ? o.onSend : null,
        onStop: typeof o.onStop === 'function' ? o.onStop : null,
        onExport: typeof o.onExport === 'function' ? o.onExport : null,
        onTurnDone: typeof o.onTurnDone === 'function' ? o.onTurnDone : null,
        getTurnOpts: typeof o.getTurnOpts === 'function' ? o.getTurnOpts : null,
        // Standard chat layout: composer floats inside the chat viewport.
        // Consumers may explicitly opt out with `floatingInput: false`.
        floatingInput: o.floatingInput !== false,
    };
}

/**
 * Merge previously wired composer options with a (possibly render-only) update.
 * Explicit new values win; callback handlers omitted from `opts` are preserved
 * so theme/history refreshes cannot erase onSend/onStop/etc.
 */
function aiChatResolveWireOpts(state, opts) {
    const prev = (state && state._wireOpts) || {};
    const next = opts || {};
    const merged = Object.assign({}, prev, next);
    for (let i = 0; i < AI_CHAT_CALLBACK_KEYS.length; i++) {
        const key = AI_CHAT_CALLBACK_KEYS[i];
        if (typeof next[key] !== 'function' && typeof prev[key] === 'function') {
            merged[key] = prev[key];
        }
    }
    return aiChatResolveOpts(merged);
}

function aiChatQuery(root, selector) {
    if (!root || !selector) return null;
    return root.querySelector(selector);
}

function aiChatNormalizeDisplayAttachment(att) {
    if (!att || typeof att !== 'object') return null;
    if (att.type !== 'verifier-source') return null;
    const source = String(att.source || '');
    const verifierId = String(att.verifierId || '').trim();
    if (!source || !verifierId) return null;
    return {
        type: 'verifier-source',
        taskId: String(att.taskId || ''),
        taskKey: String(att.taskKey || ''),
        verifierId,
        verifierKey: String(att.verifierKey || ''),
        version: att.version != null ? att.version : null,
        versionId: String(att.versionId || att.verifierVersionId || ''),
        displayVersionNo: att.displayVersionNo != null ? att.displayVersionNo : null,
        source,
    };
}

function aiChatNormalizeDisplayAttachments(atts) {
    if (Array.isArray(atts)) {
        return atts.map(aiChatNormalizeDisplayAttachment).filter(Boolean);
    }
    const one = aiChatNormalizeDisplayAttachment(atts);
    return one ? [one] : [];
}

function aiChatAttachmentTaskId(att) {
    const a = aiChatNormalizeDisplayAttachment(att);
    if (!a) return '';
    return String(a.taskId || a.taskKey || '').trim();
}

function aiChatAttachmentChipLabel(att) {
    const a = aiChatNormalizeDisplayAttachment(att);
    if (!a) return 'Verifier';
    if (a.displayVersionNo != null) return 'Verifier v' + a.displayVersionNo;
    if (a.version != null) return 'Verifier v' + a.version;
    return 'Verifier';
}

function aiChatFlashAttachIdButton(btn, ok) {
    if (!btn) return;
    btn.classList.remove('wf-chat-attach-id--ok', 'wf-chat-attach-id--fail');
    btn.classList.add(ok ? 'wf-chat-attach-id--ok' : 'wf-chat-attach-id--fail');
    const prev = btn._wfAttachIdFlashTimer;
    if (prev) clearTimeout(prev);
    btn._wfAttachIdFlashTimer = setTimeout(() => {
        btn.classList.remove('wf-chat-attach-id--ok', 'wf-chat-attach-id--fail');
        btn._wfAttachIdFlashTimer = null;
    }, 600);
}

function aiChatVisibleStateMessages(state) {
    const out = [];
    const messages = (state && state.messages) || [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg || msg.hideInUi) continue;
        if (msg.role === 'system' || msg.role === 'tool') continue;
        const hasDisplay = msg.displayContent != null && String(msg.displayContent).trim();
        const hasContent = !!(msg.content || '').trim();
        if (msg.role === 'assistant' && !hasContent && !hasDisplay) continue;
        out.push(msg);
    }
    return out;
}

function aiChatVisibleHistory(state) {
    const out = [];
    const messages = aiChatVisibleStateMessages(state);
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const role = msg.role === 'assistant' ? 'ai' : 'user';
        const text = msg.displayContent != null
            ? String(msg.displayContent)
            : String(msg.content || '');
        out.push({ role, text });
    }
    return out;
}

function aiChatApplyUserMessageExtras(userMsg, extras) {
    if (!userMsg || !extras) return userMsg;
    if (extras.displayContent != null) userMsg.displayContent = extras.displayContent;
    if (extras.hideInUi) userMsg.hideInUi = true;
    const attachments = aiChatNormalizeDisplayAttachments(
        extras.displayAttachments != null ? extras.displayAttachments : extras.displayAttachment
    );
    if (attachments.length) {
        userMsg.displayAttachments = attachments;
        userMsg.displayAttachment = attachments[0];
    }
    return userMsg;
}

function aiChatApplyTheme(el, opts) {
    if (!el) return;
    const o = opts || {};
    el.chatStyle = {
        width: '100%',
        maxWidth: 'min(100%, ' + AI_CHAT_MAX_WIDTH_PX + 'px)',
        minWidth: '0',
        margin: '0 auto',
        height: '100%',
        // Deep Chat defaults each border side separately; shorthand does not clear them.
        border: 'none',
        borderTop: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        borderLeft: 'none',
        backgroundColor: 'transparent',
        fontSize: '13px',
        boxSizing: 'border-box',
    };
    el.auxiliaryStyle = ''
        // Kill every default frame Deep Chat draws: host border/background and
        // the internal container/chat-view/messages chrome.
        + ':host {'
        + '  width: 100% !important; max-width: 100% !important; min-width: 0 !important;'
        + '  box-sizing: border-box !important; overflow-x: hidden !important;'
        + '  border: none !important; outline: none !important;'
        + '  background: transparent !important; box-shadow: none !important;'
        + '}'
        + '#container, #chat-view, #messages {'
        + '  width: 100% !important; max-width: 100% !important; min-width: 0 !important;'
        + '  box-sizing: border-box !important; overflow-x: hidden !important;'
        + '  border: none !important; background: transparent !important;'
        + '  box-shadow: none !important;'
        + '}'
        // Default scrollbars render as bright white tracks on dark themes.
        + '* { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--muted-foreground, #64748b) 40%, transparent) transparent; }'
        + '*::-webkit-scrollbar { width: 8px; height: 8px; background: transparent; }'
        + '*::-webkit-scrollbar-track { background: transparent; }'
        + '*::-webkit-scrollbar-corner { background: transparent; }'
        + '*::-webkit-scrollbar-thumb {'
        + '  background: color-mix(in srgb, var(--muted-foreground, #64748b) 40%, transparent); border-radius: 8px;'
        + '}'
        + '.deep-chat-temporary-message { display: none; }'
        + '.outer-message-container, .inner-message-container, .message-bubble {'
        + '  max-width: 100% !important; min-width: 0 !important; box-sizing: border-box !important;'
        + '}'
        + '.inner-message-container { flex-direction: column; align-items: flex-start; }'
        + '.inner-message-container:has(.user-message-text) { align-items: flex-end; }'
        + '.name {'
        + '  color: var(--muted-foreground, #64748b) !important; font-size: 11px !important; font-weight: 600 !important;'
        + '  margin: 0 10px 4px !important;'
        + '}'
        + '.outer-message-container { position: relative; }'
        + '.wf-chat-copy {'
        + '  display: inline-flex; align-items: center; justify-content: center;'
        + '  width: 28px; height: 28px; padding: 0; margin: 2px 10px 0;'
        + '  border: none; border-radius: 8px; cursor: pointer;'
        + '  background: transparent; color: var(--muted-foreground, #64748b);'
        + '  opacity: 0; transition: opacity 120ms ease, color 120ms ease, background 120ms ease;'
        + '}'
        + '.outer-message-container:hover .wf-chat-copy,'
        + '.outer-message-container:focus-within .wf-chat-copy,'
        + '.wf-chat-copy:focus-visible { opacity: 1; }'
        + '.wf-chat-copy:hover { background: color-mix(in srgb, var(--muted-foreground, #64748b) 18%, transparent); color: var(--foreground, #0f172a); }'
        + '.wf-chat-copy--ok { opacity: 1 !important; color: #16a34a !important; }'
        + '.wf-chat-copy--fail { opacity: 1 !important; color: #dc2626 !important; }'
        + '.wf-chat-attach {'
        + '  display: block; width: 100%; max-width: 100%; box-sizing: border-box;'
        + '  margin: 6px 0 0; padding: 0;'
        + '  border: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 80%, transparent);'
        + '  border-radius: 10px;'
        + '  background: color-mix(in srgb, var(--muted, #f1f5f9) 40%, transparent);'
        + '  color: var(--foreground, #0f172a);'
        + '}'
        + '.wf-chat-attach > summary {'
        + '  cursor: pointer; list-style: none; user-select: none;'
        + '  padding: 6px 8px; font-size: 11px; font-weight: 600; color: var(--muted-foreground, #64748b);'
        + '  display: flex; align-items: center; gap: 6px;'
        + '}'
        + '.wf-chat-attach > summary::-webkit-details-marker { display: none; }'
        + '.wf-chat-attach > summary::before {'
        + '  content: "▸"; display: inline-block; width: 1em; flex-shrink: 0;'
        + '}'
        + '.wf-chat-attach[open] > summary::before { content: "▾"; }'
        + '.wf-chat-attach-id {'
        + '  display: inline-block; max-width: 100%; margin: 0; padding: 3px 8px;'
        + '  border: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 80%, transparent);'
        + '  border-radius: 6px; font-size: 11px; font-weight: 500; font-family: inherit;'
        + '  color: var(--foreground, #0f172a);'
        + '  background: color-mix(in srgb, var(--muted, #f1f5f9) 55%, transparent);'
        + '  text-align: left; overflow-wrap: anywhere; cursor: pointer;'
        + '}'
        + '.wf-chat-attach-id:hover {'
        + '  background: color-mix(in srgb, var(--muted-foreground, #64748b) 18%, transparent);'
        + '}'
        + '.wf-chat-attach-id--ok { color: #16a34a !important; border-color: #16a34a !important; }'
        + '.wf-chat-attach-id--fail { color: #dc2626 !important; border-color: #dc2626 !important; }'
        + '.wf-chat-attach-id--empty {'
        + '  cursor: default; opacity: 0.65; border-style: dashed;'
        + '}'
        + '.wf-chat-attach-list{display:flex;flex-direction:column;gap:6px;}'+ '.wf-chat-attach-label{margin-right:8px;font-weight:600;}'+ '.wf-chat-attach-body {'
        + '  margin: 0; padding: 0 10px 10px; max-height: 240px; overflow: auto;'
        + '  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);'
        + '  font-size: 11px; line-height: 1.45; white-space: pre-wrap; word-break: break-word;'
        + '  color: var(--foreground, #0f172a);'
        + '}'
        // Code fences + inline code copy (markdown from remarkable)
        + '.wf-chat-codeblock {'
        + '  position: relative; display: block; margin: 8px 0; max-width: 100%;'
        + '  border: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 80%, transparent);'
        + '  border-radius: 8px;'
        + '  background: color-mix(in srgb, var(--muted, #f1f5f9) 55%, transparent);'
        + '  overflow: hidden;'
        + '}'
        + '.wf-chat-codeblock > pre {'
        + '  margin: 0 !important; padding: 10px 36px 10px 12px !important;'
        + '  max-width: 100%; overflow: auto; box-sizing: border-box;'
        + '  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);'
        + '  font-size: 11px; line-height: 1.45; white-space: pre-wrap; word-break: break-word;'
        + '  background: transparent !important; border: none !important;'
        + '}'
        + '.wf-chat-code-copy {'
        + '  position: absolute; top: 8px; right: 6px; z-index: 2;'
        + '  display: inline-flex; align-items: center; justify-content: center;'
        + '  width: 24px; height: 24px; min-width: 24px; padding: 0; margin: 0;'
        + '  border: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 80%, transparent);'
        + '  border-radius: 6px; cursor: pointer;'
        + '  background: color-mix(in srgb, var(--background, #fff) 88%, transparent);'
        + '  color: var(--muted-foreground, #64748b); line-height: 0;'
        + '}'
        + '.wf-chat-code-copy:hover {'
        + '  color: var(--foreground, #0f172a); background: color-mix(in srgb, var(--muted-foreground, #64748b) 22%, transparent);'
        + '}'
        + '.wf-chat-code-copy.wf-chat-copy--ok,'
        + '.wf-chat-code-copy.fleet-ui-flash--success { color: #16a34a !important; border-color: #16a34a !important; }'
        + '.wf-chat-code-copy.wf-chat-copy--fail,'
        + '.wf-chat-code-copy.fleet-ui-flash--failure { color: #dc2626 !important; border-color: #dc2626 !important; }'
        + '.message-bubble code.wf-chat-inline-code {'
        + '  cursor: pointer; border-radius: 4px; padding: 1px 4px;'
        + '  border: 1px solid transparent;'
        + '  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;'
        + '}'
        + '.message-bubble code.wf-chat-inline-code:hover {'
        + '  background: color-mix(in srgb, var(--muted-foreground, #64748b) 18%, transparent);'
        + '}'
        + '.message-bubble code.wf-chat-inline-code.wf-chat-copy--ok,'
        + '.message-bubble code.wf-chat-inline-code.fleet-ui-flash--success {'
        + '  color: #16a34a !important; border-color: #16a34a !important;'
        + '}'
        + '.message-bubble code.wf-chat-inline-code.wf-chat-copy--fail,'
        + '.message-bubble code.wf-chat-inline-code.fleet-ui-flash--failure {'
        + '  color: #dc2626 !important; border-color: #dc2626 !important;'
        + '}'
        // Mirror ui-lib flash keyframes inside shadow so buttonFeedback works here.
        + '@keyframes fleet-ui-flash-success {'
        + '  0% { background-color: transparent; color: inherit; border-color: inherit; }'
        + '  12% { background-color: color-mix(in srgb, #16a34a 30%, transparent);'
        + '    color: #16a34a !important; border-color: #16a34a !important; }'
        + '  100% { background-color: transparent; color: inherit; border-color: inherit; }'
        + '}'
        + '@keyframes fleet-ui-flash-failure {'
        + '  0% { background-color: transparent; color: inherit; border-color: inherit; }'
        + '  12% { background-color: color-mix(in srgb, #dc2626 30%, transparent);'
        + '    color: #dc2626 !important; border-color: #dc2626 !important; }'
        + '  100% { background-color: transparent; color: inherit; border-color: inherit; }'
        + '}'
        + '.fleet-ui-flash--success {'
        + '  animation: fleet-ui-flash-success 600ms cubic-bezier(0.22, 1, 0.36, 1) 1;'
        + '}'
        + '.fleet-ui-flash--failure {'
        + '  animation: fleet-ui-flash-failure 600ms cubic-bezier(0.22, 1, 0.36, 1) 1;'
        + '}'
        // The padded text input is taller than Deep Chat's assumed height, which
        // leaves the bottom-pinned send/stop button sitting low. Center it and
        // keep a little inset from the rounded input edge.
        + '#input .input-button {'
        + '  top: 50% !important; bottom: auto !important;'
        + '  right: 10px !important;'
        + '  transform: translateY(-50%) !important;'
        + '}'
        + (o.floatingInput
            ? '#chat-view { position: relative !important; }'
                + '#messages { height: 100% !important; padding-bottom: 76px !important;'
                + ' box-sizing: border-box !important; }'
                + '#input { position: absolute !important; inset-inline: 0 !important; bottom: 6px !important;'
                + ' z-index: 5 !important; margin: 0 auto !important; border: none !important;'
                + ' background: transparent !important; box-shadow: none !important; }'
            : '')
        + (el._wfAiChatKeyGated
            ? '#input { opacity: 0.45 !important; pointer-events: none !important;'
                + ' filter: grayscale(0.35); }'
                + '#input textarea, #input input, #input [contenteditable] {'
                + ' cursor: not-allowed !important; }'
            : '');
    el.messageStyles = {
        default: {
            shared: {
                bubble: {
                    borderRadius: '16px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    lineHeight: '1.45',
                    border: '1px solid color-mix(in srgb, var(--border, #e2e8f0) 80%, transparent)',
                }
            },
            user: {
                bubble: {
                    maxWidth: '75%',
                    backgroundColor: 'color-mix(in srgb, var(--primary, #2563eb) 12%, transparent)',
                    color: 'var(--foreground, #0f172a)',
                }
            },
            ai: {
                bubble: {
                    maxWidth: '100%',
                    width: '100%',
                    backgroundColor: 'color-mix(in srgb, var(--muted, #f1f5f9) 55%, transparent)',
                    color: 'var(--foreground, #0f172a)',
                }
            }
        }
    };
    el.inputAreaStyle = {
        backgroundColor: 'transparent',
        paddingTop: '6px',
    };
    el.textInput = {
        placeholder: { text: 'Message…' },
        styles: {
            container: {
                borderRadius: '14px',
                border: '1px solid var(--input, #cbd5e1)',
                backgroundColor: 'var(--background, #fff)',
                color: 'var(--foreground, #0f172a)',
                padding: '12px 16px',
            },
            text: {
                fontSize: '12px',
                color: 'var(--foreground, #0f172a)',
            }
        }
    };
    const nameStyle = {
        color: 'var(--muted-foreground, #64748b)',
        fontSize: '11px',
        fontWeight: '600',
    };
    el.names = {
        default: { style: nameStyle, position: 'start' },
        user: { text: 'You', style: nameStyle, position: 'start' },
        ai: { text: 'Assistant', style: nameStyle, position: 'start' },
    };
    el.submitButtonStyles = {
        submit: {
            container: {
                default: {
                    backgroundColor: 'var(--primary, #2563eb)',
                    borderRadius: '12px',
                }
            }
        },
        stop: {
            container: {
                default: {
                    backgroundColor: 'var(--muted, #f1f5f9)',
                    borderRadius: '12px',
                }
            }
        }
    };
}

function aiChatFlashCopyButton(btn, ok) {
    if (!btn) return;
    btn.classList.remove('wf-chat-copy--ok', 'wf-chat-copy--fail');
    btn.classList.add(ok ? 'wf-chat-copy--ok' : 'wf-chat-copy--fail');
    const prev = btn._wfCopyFlashTimer;
    if (prev) clearTimeout(prev);
    btn._wfCopyFlashTimer = setTimeout(() => {
        btn.classList.remove('wf-chat-copy--ok', 'wf-chat-copy--fail');
        btn._wfCopyFlashTimer = null;
    }, 600);
}

function aiChatMessageRows(shadowRoot) {
    if (!shadowRoot) return [];
    return Array.from(shadowRoot.querySelectorAll('.outer-message-container')).filter((row) => {
        return !!(row.querySelector && row.querySelector('.message-bubble'));
    });
}

function aiChatFillAttachChip(details, att) {
    if (!details || !att) return;
    const taskId = aiChatAttachmentTaskId(att);
    const chipLabel = aiChatAttachmentChipLabel(att);
    let summary = details.querySelector('[data-wf-chat-attach-summary="1"]');
    let idBtn = details.querySelector('[data-wf-chat-attach-id="1"]');
    let labelEl = details.querySelector('[data-wf-chat-attach-label="1"]');
    if (!summary || !idBtn) {
        details.replaceChildren();
        summary = document.createElement('summary');
        summary.setAttribute('data-wf-chat-attach-summary', '1');
        labelEl = document.createElement('span');
        labelEl.setAttribute('data-wf-chat-attach-label', '1');
        labelEl.className = 'wf-chat-attach-label';
        idBtn = document.createElement('button');
        idBtn.type = 'button';
        idBtn.setAttribute('data-wf-chat-attach-id', '1');
        idBtn.className = 'wf-chat-attach-id';
        idBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const value = String(idBtn.getAttribute('data-wf-copy') || '').trim();
            if (!value) return;
            try {
                await navigator.clipboard.writeText(value);
                aiChatFlashAttachIdButton(idBtn, true);
                if (Context.buttonFeedback && typeof Context.buttonFeedback.flashSuccess === 'function') {
                    Context.buttonFeedback.flashSuccess(idBtn);
                }
                Logger.log('copied verifier task id (' + value.length + ' chars)');
            } catch (err) {
                aiChatFlashAttachIdButton(idBtn, false);
                if (Context.buttonFeedback && typeof Context.buttonFeedback.flashFailure === 'function') {
                    Context.buttonFeedback.flashFailure(idBtn);
                }
                Logger.error('failed to copy verifier task id', err);
            }
        });
        summary.appendChild(labelEl);
        summary.appendChild(idBtn);
        details.appendChild(summary);
        const body = document.createElement('pre');
        body.setAttribute('data-wf-chat-attach-body', '1');
        body.className = 'wf-chat-attach-body';
        details.appendChild(body);
        details.setAttribute(AI_CHAT_ATTACH_SOURCE_ATTR, '0');
    }
    if (!labelEl) {
        labelEl = details.querySelector('[data-wf-chat-attach-label="1"]');
    }
    if (labelEl && labelEl.textContent !== chipLabel) labelEl.textContent = chipLabel;
    const bodyEl = details.querySelector('[data-wf-chat-attach-body="1"]');
    if (idBtn) {
        if (taskId) {
            if (idBtn.textContent !== taskId) idBtn.textContent = taskId;
            if (idBtn.getAttribute('data-wf-copy') !== taskId) {
                idBtn.setAttribute('data-wf-copy', taskId);
            }
            if (idBtn.title !== 'Click to copy task ID') {
                idBtn.title = 'Click to copy task ID';
            }
            const aria = 'Copy task ID ' + taskId;
            if (idBtn.getAttribute('aria-label') !== aria) {
                idBtn.setAttribute('aria-label', aria);
            }
            if (idBtn.classList.contains('wf-chat-attach-id--empty')) {
                idBtn.classList.remove('wf-chat-attach-id--empty');
            }
            if (idBtn.disabled) idBtn.disabled = false;
        } else {
            if (idBtn.textContent !== '(no task ID)') {
                idBtn.textContent = '(no task ID)';
            }
            if (idBtn.hasAttribute('data-wf-copy')) {
                idBtn.removeAttribute('data-wf-copy');
            }
            if (idBtn.title !== 'No task ID for this verifier') {
                idBtn.title = 'No task ID for this verifier';
            }
            if (idBtn.getAttribute('aria-label') !== 'No task ID') {
                idBtn.setAttribute('aria-label', 'No task ID');
            }
            if (!idBtn.classList.contains('wf-chat-attach-id--empty')) {
                idBtn.classList.add('wf-chat-attach-id--empty');
            }
            if (!idBtn.disabled) idBtn.disabled = true;
        }
    }
    details._wfAttachSource = att.source;
    if (details.getAttribute(AI_CHAT_ATTACH_SOURCE_ATTR) !== '1') {
        details.setAttribute(AI_CHAT_ATTACH_SOURCE_ATTR, '0');
        if (bodyEl && bodyEl.textContent) bodyEl.textContent = '';
        if (!details._wfAttachToggleWired) {
            details._wfAttachToggleWired = true;
            details.addEventListener('toggle', () => {
                if (!details.open) return;
                const body = details.querySelector('[data-wf-chat-attach-body="1"]');
                const source = details._wfAttachSource != null
                    ? String(details._wfAttachSource)
                    : '';
                if (body && body.textContent !== source) body.textContent = source;
                details.setAttribute(AI_CHAT_ATTACH_SOURCE_ATTR, '1');
            });
        }
    } else if (details.open && bodyEl) {
        const source = String(att.source || '');
        if (bodyEl.textContent !== source) bodyEl.textContent = source;
    }
}

function aiChatReconcileAttachments(row, attachments) {
    if (!row) return;
    const bubble = row.querySelector('.message-bubble');
    if (!bubble) return;
    const inner = bubble.closest('.inner-message-container') || row;
    const list = aiChatNormalizeDisplayAttachments(attachments);
    let wrap = inner.querySelector('[data-wf-chat-attach-list="1"]');
    // Migrate legacy single chip into the list wrapper.
    const legacy = !wrap ? inner.querySelector('[data-wf-chat-attach="1"]') : null;
    if (!list.length) {
        if (wrap) wrap.remove();
        else if (legacy) legacy.remove();
        return;
    }
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.setAttribute('data-wf-chat-attach-list', '1');
        wrap.className = 'wf-chat-attach-list';
        const copyBtn = inner.querySelector('[data-wf-chat-copy="1"]');
        if (legacy) {
            if (legacy.parentNode === inner) {
                inner.insertBefore(wrap, legacy);
            } else if (copyBtn) {
                inner.insertBefore(wrap, copyBtn);
            } else {
                inner.appendChild(wrap);
            }
            wrap.appendChild(legacy);
        } else if (copyBtn) {
            inner.insertBefore(wrap, copyBtn);
        } else if (bubble.nextSibling) {
            inner.insertBefore(wrap, bubble.nextSibling);
        } else {
            inner.appendChild(wrap);
        }
    }
    const existing = [...wrap.querySelectorAll('[data-wf-chat-attach="1"]')];
    while (existing.length > list.length) {
        const doomed = existing.pop();
        if (doomed) doomed.remove();
    }
    for (let i = 0; i < list.length; i++) {
        let details = existing[i];
        if (!details) {
            details = document.createElement('details');
            details.setAttribute('data-wf-chat-attach', '1');
            details.className = 'wf-chat-attach';
            wrap.appendChild(details);
        }
        aiChatFillAttachChip(details, list[i]);
    }
}

function aiChatReconcileAttachment(row, attachment) {
    aiChatReconcileAttachments(row, attachment);
}

function aiChatInjectCopyButton(el, row, opts) {
    const o = aiChatResolveOpts(opts);
    if (!row || row.querySelector('[data-wf-chat-copy="1"]')) return;
    const bubble = row.querySelector('.message-bubble');
    if (!bubble) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-wf-chat-copy', '1');
    btn.className = 'wf-chat-copy';
    btn.title = 'Copy message as Markdown';
    btn.setAttribute('aria-label', 'Copy message as Markdown');
    btn.innerHTML = aiChatCopyIconSvg();
    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rows = aiChatMessageRows(el.shadowRoot);
        const index = rows.indexOf(row);
        let markdown = '';
        try {
            const stateMsgs = aiChatVisibleStateMessages(el._wfAiChatState);
            if (index >= 0 && stateMsgs[index] && stateMsgs[index].content != null) {
                markdown = String(stateMsgs[index].content);
            } else {
                const messages = typeof el.getMessages === 'function' ? el.getMessages() : [];
                if (index >= 0 && messages && messages[index] && messages[index].text != null) {
                    markdown = String(messages[index].text);
                } else {
                    markdown = String((bubble.textContent || '')).trim();
                }
            }
            if (!markdown) throw new Error('Message is empty');
            await aiChatCopyWithFeedback(btn, markdown, 'chat message');
        } catch (err) {
            aiChatFlashCopyButton(btn, false);
            Logger.error(o.logTag + ': failed to copy chat message', err);
        }
    });
    // Place inside the column container holding name + bubble so the button
    // sits directly under the bubble and inherits its left/right alignment.
    const inner = bubble.closest('.inner-message-container');
    if (inner) {
        inner.appendChild(btn);
    } else {
        row.appendChild(btn);
    }
}

function aiChatFenceText(pre) {
    if (!pre) return '';
    const code = pre.querySelector('code');
    return String((code && code.textContent != null) ? code.textContent : (pre.textContent || ''));
}

function aiChatEnhanceCodeCopy(row, opts) {
    const bubble = row && row.querySelector('.message-bubble');
    if (!bubble) return;

    const pres = bubble.querySelectorAll('pre');
    for (let i = 0; i < pres.length; i++) {
        const pre = pres[i];
        if (!pre || pre.getAttribute('data-wf-code-enhanced') === '1') continue;
        if (pre.closest('[data-wf-codeblock="1"]')) {
            pre.setAttribute('data-wf-code-enhanced', '1');
            continue;
        }
        pre.setAttribute('data-wf-code-enhanced', '1');
        const parent = pre.parentNode;
        if (!parent) continue;
        const wrap = document.createElement('div');
        wrap.className = 'wf-chat-codeblock';
        wrap.setAttribute('data-wf-codeblock', '1');
        parent.insertBefore(wrap, pre);
        wrap.appendChild(pre);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wf-chat-code-copy';
        btn.setAttribute('data-wf-chat-code-copy', '1');
        btn.title = 'Copy code block';
        btn.setAttribute('aria-label', 'Copy code block');
        btn.innerHTML = aiChatCopyIconSvg();
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const text = aiChatFenceText(pre);
            await aiChatCopyWithFeedback(btn, text, 'chat code fence');
        });
        wrap.insertBefore(btn, pre);
    }

    const codes = bubble.querySelectorAll('code');
    for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        if (!code || code.closest('pre')) continue;
        if (code.getAttribute('data-wf-inline-copy') === '1') continue;
        code.setAttribute('data-wf-inline-copy', '1');
        code.classList.add('wf-chat-inline-code');
        code.title = 'Click to copy';
        code.setAttribute('role', 'button');
        code.tabIndex = 0;
        const onCopy = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const text = String(code.textContent || '');
            await aiChatCopyWithFeedback(code, text, 'chat inline code');
        };
        code.addEventListener('click', onCopy);
        code.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') onCopy(e);
        });
    }
}

function aiChatSyncRowEnhancements(el, opts) {
    const shadow = el && el.shadowRoot;
    if (!shadow) return;
    const rows = aiChatMessageRows(shadow);
    const stateMsgs = aiChatVisibleStateMessages(el._wfAiChatState);
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const msg = stateMsgs[i] || null;
        aiChatReconcileAttachments(
            row,
            (msg && (msg.displayAttachments || msg.displayAttachment)) || null
        );
        aiChatInjectCopyButton(el, row, opts);
        aiChatEnhanceCodeCopy(row, opts);
    }
}

function aiChatSetupCopyButtons(el, opts) {
    if (!el || el._wfCopyButtonsWired === '1') return;
    const attach = () => {
        const shadow = el.shadowRoot;
        if (!shadow) return false;
        if (el._wfCopyObserver) {
            try { el._wfCopyObserver.disconnect(); } catch (_e) { /* ignore */ }
            el._wfCopyObserver = null;
        }
        const observer = new MutationObserver(() => { sync(); });
        const sync = () => {
            // Disconnect while we mutate so our own DOM writes cannot re-enter
            // sync (unconditional textContent writes used to freeze the page).
            try { observer.disconnect(); } catch (_e) { /* ignore */ }
            try {
                aiChatSyncRowEnhancements(el, opts);
            } finally {
                try {
                    observer.observe(shadow, { childList: true, subtree: true });
                } catch (_e2) { /* ignore */ }
            }
        };
        observer.observe(shadow, { childList: true, subtree: true });
        el._wfCopyObserver = observer;
        el._wfCopyButtonsWired = '1';
        sync();
        return true;
    };
    if (attach()) return;
    const prev = el.onComponentRender;
    el.onComponentRender = (ref) => {
        if (typeof prev === 'function') {
            try { prev(ref); } catch (_e) { /* ignore */ }
        }
        attach();
    };
    // Shadow root can appear shortly after mount even without the render callback.
    let tries = 0;
    const poll = () => {
        if (attach() || tries >= 20) return;
        tries += 1;
        setTimeout(poll, 50);
    };
    setTimeout(poll, 0);
}

/**
 * Whether it is safe to reset Deep Chat's `history` from state.
 * Skip while a programmatic/connect turn is in flight — assigning history
 * races the just-painted user bubble and can wipe the live stream UI.
 */
function aiChatShouldSyncHistory(root, state) {
    if (!state) return false;
    if (state.streaming) return false;
    if (state._pendingTurn) return false;
    if (root && root._wfAiChatFromHandler) return false;
    return true;
}

function aiChatSyncHistory(el, state) {
    if (!el) return;
    try {
        el.history = aiChatVisibleHistory(state);
    } catch (err) {
        Logger.warn('failed to sync deep-chat history', err);
    }
}

/**
 * If Deep Chat's viewport is empty but state still has visible messages,
 * restore the view from state (state is source of truth after programmatic turns).
 */
function aiChatHealEmptyView(el, state, opts) {
    if (!el || !state) return false;
    const visible = aiChatVisibleStateMessages(state);
    if (!visible.length) return false;
    let deepCount = -1;
    try {
        if (typeof el.getMessages === 'function') {
            const msgs = el.getMessages();
            deepCount = Array.isArray(msgs) ? msgs.length : -1;
        }
    } catch (_e) {
        deepCount = -1;
    }
    if (deepCount < 0) {
        try {
            const rows = aiChatMessageRows(el.shadowRoot);
            deepCount = rows.length;
        } catch (_e2) {
            deepCount = -1;
        }
    }
    if (deepCount > 0) return false;
    const o = aiChatResolveOpts(opts || (state && state._wireOpts) || {});
    Logger.debug(o.logTag + ': healing empty deep-chat view from state ('
        + visible.length + ' message(s))');
    aiChatSyncHistory(el, state);
    try { aiChatSyncRowEnhancements(el, o); } catch (_e3) { /* ignore */ }
    return true;
}

/**
 * Build OpenRouter message list from transcript state.
 * Supports tool_calls on assistant messages and role:'tool' results.
 * @param {object} state
 * @param {{ systemContent?: string }} [opts]
 */
function aiChatBuildApiMessages(state, opts) {
    const o = opts || {};
    const api = [];
    if (o.systemContent) {
        api.push({ role: 'system', content: String(o.systemContent) });
    }
    const messages = (state && state.messages) || [];
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m.streaming) break;
        if (m.role === 'system') {
            if (o.systemContent) continue;
            api.push({ role: 'system', content: m.content || '' });
            continue;
        }
        if (m.role === 'user') {
            api.push({ role: 'user', content: m.content || '' });
            continue;
        }
        if (m.role === 'assistant') {
            const row = { role: 'assistant' };
            if (Array.isArray(m.tool_calls) && m.tool_calls.length) {
                row.tool_calls = m.tool_calls;
                // Providers expect null (not "") when tool_calls are present.
                row.content = (m.content != null && String(m.content) !== '')
                    ? m.content
                    : null;
            } else {
                row.content = m.content != null ? m.content : '';
            }
            api.push(row);
            continue;
        }
        if (m.role === 'tool') {
            api.push({
                role: 'tool',
                tool_call_id: String(m.tool_call_id || ''),
                content: m.content != null ? String(m.content) : '',
            });
        }
    }
    return api;
}

function aiChatStopStream(state, opts) {
    const o = aiChatResolveOpts(opts || (state && state._wireOpts));
    if (!state) return;
    state.stopRequested = true;
    state.streamGen += 1;
    if (state.streamAbort && typeof state.streamAbort.abort === 'function') {
        try { state.streamAbort.abort(); } catch (_e) { /* ignore */ }
    }
    state.streamAbort = null;
    state.streaming = false;
    const last = state.messages && state.messages[state.messages.length - 1];
    if (last && last.role === 'assistant' && last.streaming) {
        last.streaming = false;
        if (!last.content) last.content = '(stopped)';
    }
    Logger.log(o.logTag + ': chat stream stopped');
    if (typeof o.onStop === 'function') {
        try { o.onStop(); } catch (_e) { /* ignore */ }
    }
}

function aiChatSetStreamingUi(_root, state, streaming, _opts) {
    if (state) state.streaming = !!streaming;
}

function aiChatUpdateStreamingBubble(_root, state, content, _opts) {
    if (!state || !state.messages || !state.messages.length) return;
    const last = state.messages[state.messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    last.content = content;
}

function aiChatRunStreamWithSignals(state, apiMessages, signals, opts) {
    const o = aiChatResolveOpts(opts);
    const ai = Context.aiOpenRouter;
    if (!ai || typeof ai.chatCompletionStream !== 'function') {
        signals.onResponse({ error: 'AI OpenRouter API is not available' });
        return Promise.reject(new Error('AI OpenRouter API is not available'));
    }

    state.streamGen += 1;
    const gen = state.streamGen;
    state.streaming = true;
    let assembled = '';
    let doneMeta = {
        generationId: null,
        model: null,
        toolCalls: [],
        finishReason: null,
    };
    let settled = false;
    // Serialize Deep Chat onResponse promises so rapid SSE deltas cannot race.
    let responseChain = Promise.resolve();
    const suppressText = !!(opts && opts.suppressTextDeltas);

    Logger.debug(o.logTag + ': chat stream start ('
        + ((apiMessages && apiMessages.length) || 0) + ' msg'
        + (suppressText ? ', suppressText' : '') + ')');

    try { signals.onOpen(); } catch (_e) { /* ignore */ }

    signals.stopClicked.listener = () => {
        Logger.debug(o.logTag + ': stream cancel requested');
        aiChatStopStream(state, o);
        // keepStreamingFlag tool turns close Deep Chat once when the loop exits.
        if (!(opts && opts.keepStreamingFlag)) {
            try { signals.onClose(); } catch (_e) { /* ignore */ }
        }
    };

    const enqueueResponse = (payload) => {
        responseChain = responseChain.then(async () => {
            if (gen !== state.streamGen || settled) return;
            try {
                await Promise.resolve(signals.onResponse(payload));
            } catch (_e) { /* ignore */ }
        });
        return responseChain;
    };

    const settleOk = (text) => {
        if (settled) return text;
        settled = true;
        // Keep streamAbort until caller aborts/replaces; clearing without abort
        // left GM streams open between tool rounds.
        // Tool turns keep Deep Chat in "streaming" until the full loop ends.
        if (!(opts && opts.keepStreamingFlag)) {
            try { signals.onClose(); } catch (_e) { /* ignore */ }
        }
        if (!opts || !opts.keepStreamingFlag) {
            state.streaming = false;
        }
        return text;
    };
    const settleErr = (err) => {
        if (settled) return;
        settled = true;
        state.streaming = false;
        const message = (err && err.message) || String(err || 'Stream failed');
        try { signals.onResponse({ error: message }); } catch (_e) { /* ignore */ }
        try { signals.onClose(); } catch (_e) { /* ignore */ }
        throw (err instanceof Error ? err : new Error(message));
    };

    const streamOpts = {
        messages: apiMessages,
        onDelta: (delta) => {
            if (gen !== state.streamGen) return;
            const chunk = String(delta || '');
            if (!chunk) return;
            assembled += chunk;
            if (suppressText) return;
            aiChatUpdateStreamingBubble(null, state, assembled, o);
            // Stream mode appends each text chunk; do not overwrite full text.
            void enqueueResponse({ text: chunk });
        },
        onDone: (result) => {
            if (result && result.generationId) doneMeta.generationId = String(result.generationId);
            if (result && result.model) doneMeta.model = String(result.model);
            if (result && Array.isArray(result.toolCalls)) doneMeta.toolCalls = result.toolCalls;
            if (result && result.finishReason) doneMeta.finishReason = String(result.finishReason);
            const streamed = assembled;
            const full = result && result.fullText != null ? String(result.fullText) : streamed;
            assembled = full;
            if (!suppressText) {
                aiChatUpdateStreamingBubble(null, state, assembled, o);
            }
            void responseChain.then(() => {
                if (gen !== state.streamGen) {
                    resolvePayload({
                        text: assembled || '',
                        generationId: doneMeta.generationId,
                        model: doneMeta.model,
                        toolCalls: doneMeta.toolCalls,
                        finishReason: doneMeta.finishReason,
                    });
                    return;
                }
                const syncFinal = (!suppressText && full && full !== streamed)
                    ? enqueueResponse({ text: full, overwrite: true })
                    : Promise.resolve();
                return syncFinal.then(() => {
                    try {
                        resolvePayload({
                            text: settleOk(assembled) || '',
                            generationId: doneMeta.generationId,
                            model: doneMeta.model,
                            toolCalls: doneMeta.toolCalls,
                            finishReason: doneMeta.finishReason,
                        });
                    } catch (err) {
                        rejectPayload(err);
                    }
                });
            }).catch((err) => {
                try {
                    settleErr(err);
                } catch (e) {
                    rejectPayload(e);
                }
            });
        },
        onError: (err) => {
            void responseChain.finally(() => {
                try {
                    settleErr(err);
                } catch (e) {
                    rejectPayload(e);
                }
            });
        },
    };
    if (opts && Array.isArray(opts.tools)) streamOpts.tools = opts.tools;
    if (opts && opts.tool_choice != null) streamOpts.tool_choice = opts.tool_choice;
    if (opts && opts.model != null) streamOpts.model = opts.model;
    if (opts && Number.isFinite(opts.max_tokens)) streamOpts.max_tokens = opts.max_tokens;
    if (opts && typeof opts.parallel_tool_calls === 'boolean') {
        streamOpts.parallel_tool_calls = opts.parallel_tool_calls;
    }

    let resolvePayload;
    let rejectPayload;
    return new Promise((resolve, reject) => {
        resolvePayload = resolve;
        rejectPayload = reject;
        Promise.resolve(ai.chatCompletionStream(streamOpts)).then((handle) => {
            state.streamAbort = handle;
        }).catch((err) => {
            try {
                settleErr(err);
            } catch (e) {
                reject(e);
            }
        });
    });
}

async function aiChatHandleConnect(root, state, body, signals) {
    const wire = aiChatResolveOpts(state._wireOpts || {});
    const pending = state._pendingTurn;
    state._pendingTurn = null;

    if (!aiChatHasKey()) {
        try {
            signals.onResponse({ error: 'OpenRouter API key required.' });
        } catch (_e) { /* ignore */ }
        try { signals.onClose(); } catch (_e2) { /* ignore */ }
        Logger.warn(wire.logTag + ': send blocked — no OpenRouter key stored');
        return;
    }

    const turnExtras = pending
        || (wire.getTurnOpts ? (wire.getTurnOpts() || {}) : {})
        || {};
    const latest = body && Array.isArray(body.messages) && body.messages.length
        ? body.messages[body.messages.length - 1]
        : null;
    const uiText = latest && latest.text != null ? String(latest.text) : '';

    // Prefer consumer onSend for UI-originated turns (keeps existing wrappers).
    if (!pending && wire.onSend) {
        root._wfAiChatSignals = signals;
        root._wfAiChatFromHandler = true;
        try {
            await wire.onSend(uiText);
            return;
        } finally {
            root._wfAiChatFromHandler = false;
            root._wfAiChatSignals = null;
        }
    }

    const userText = turnExtras.userText != null ? String(turnExtras.userText) : uiText;
    const userContent = turnExtras.userContent != null ? String(turnExtras.userContent) : userText;
    const displayContent = turnExtras.displayContent != null ? turnExtras.displayContent : null;
    const displayAttachments = aiChatNormalizeDisplayAttachments(
        turnExtras.displayAttachments != null ? turnExtras.displayAttachments : turnExtras.displayAttachment
    );
    const displayAttachment = displayAttachments[0] || null;
    const hideInUi = !!(turnExtras.hideInUi);
    const systemContent = turnExtras.systemContent != null ? turnExtras.systemContent : null;
    const apiMessagesOverride = turnExtras.apiMessages;
    const onTurnDone = typeof turnExtras.onTurnDone === 'function'
        ? turnExtras.onTurnDone
        : wire.onTurnDone;

    if (state.streaming) {
        signals.onResponse({ error: 'A response is already in progress' });
        return;
    }
    if (!userContent.trim() && !apiMessagesOverride) {
        signals.onResponse({ error: 'Empty message' });
        return;
    }

    if (userContent) {
        const userMsg = aiChatApplyUserMessageExtras(
            { role: 'user', content: userContent },
            { displayContent, displayAttachments, displayAttachment, hideInUi }
        );
        state.messages.push(userMsg);
    }
    state.messages.push({ role: 'assistant', content: '', streaming: true });
    try { aiChatSyncRowEnhancements(state._deepChat, wire); } catch (_e) { /* ignore */ }

    const apiMessages = apiMessagesOverride
        || aiChatBuildApiMessages(state, { systemContent });

    const pendingResolve = pending && typeof pending._resolve === 'function' ? pending._resolve : null;
    const pendingReject = pending && typeof pending._reject === 'function' ? pending._reject : null;

    try {
        const result = await aiChatRunStreamWithSignals(state, apiMessages, signals, wire);
        const full = result && result.text != null ? String(result.text) : '';
        const generationId = result && result.generationId ? result.generationId : null;
        const model = result && result.model ? result.model : null;
        state.lastGenerationId = generationId;
        state.lastModel = model;
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === 'assistant') {
            last.content = full || '';
            last.streaming = false;
        }
        Logger.log(wire.logTag + ': chat reply done (' + (full || '').length + ' chars'
            + (generationId ? ' · gen ' + generationId : '') + ')');
        if (onTurnDone) {
            let userPreview = '';
            for (let i = state.messages.length - 1; i >= 0; i--) {
                const m = state.messages[i];
                if (m && m.role === 'user') {
                    userPreview = String(m.displayContent != null ? m.displayContent : (m.content || '')).trim();
                    break;
                }
            }
            try {
                onTurnDone({ generationId, model, userPreview, fullText: full || '' });
            } catch (cbErr) {
                Logger.warn(wire.logTag + ': onTurnDone failed', cbErr);
            }
        }
        try { aiChatSyncRowEnhancements(state._deepChat, wire); } catch (_e) { /* ignore */ }
        if (pendingResolve) pendingResolve(full || '');
    } catch (err) {
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === 'assistant') {
            last.content = 'Error: ' + ((err && err.message) || String(err));
            last.streaming = false;
        }
        Logger.error(wire.logTag + ': chat failed: ' + ((err && err.message) || err));
        if (pendingReject) pendingReject(err instanceof Error ? err : new Error(String(err)));
    }
}

function aiChatBindElement(el, root, state, opts) {
    const o = aiChatResolveOpts(opts);
    el._wfAiChatRoot = root;
    el._wfAiChatState = state;
    // Re-applying theme/connect mid-turn clears Deep Chat's viewport while
    // state.messages stay intact (follow-up wipe). Bind chrome once per element.
    if (el._wfAiChatBound === true) return;
    aiChatApplyTheme(el, o);
    if (o.placeholder) {
        el.textInput = Object.assign({}, el.textInput || {}, {
            placeholder: { text: o.placeholder },
        });
    }
    el.connect = {
        stream: true,
        handler: (body, signals) => {
            const activeState = el._wfAiChatState || state;
            const activeRoot = el._wfAiChatRoot || root;
            return aiChatHandleConnect(activeRoot, activeState, body, signals);
        }
    };
    aiChatSetupCopyButtons(el, o);
    el._wfAiChatBound = true;
}

async function aiChatEnsureMounted(root, state, opts) {
    if (!root || !state) return null;
    const o = aiChatResolveWireOpts(state, opts);
    state._wireOpts = o;

    const deep = Context.deepChat;
    if (!deep || typeof deep.ensureLoaded !== 'function') {
        throw new Error('Deep Chat loader is not available');
    }
    await deep.ensureLoaded();

    const mount = aiChatQuery(root, o.mountSelector);
    if (!mount) {
        throw new Error('Chat mount not found: ' + o.mountSelector);
    }

    let el = state._deepChat;
    if (el && !mount.contains(el)) {
        el = null;
        state._deepChat = null;
    }
    if (!el) {
        el = mount.querySelector('deep-chat');
    }
    if (!el) {
        el = document.createElement('deep-chat');
        // Keep the no-key overlay if present; only clear other mount children.
        Array.from(mount.childNodes).forEach((child) => {
            if (child.nodeType === 1
                && child.getAttribute
                && child.getAttribute(AI_CHAT_NO_KEY_OVERLAY_ATTR) === '1') {
                return;
            }
            child.remove();
        });
        mount.insertBefore(el, mount.firstChild);
        Logger.log(o.logTag + ': deep-chat mounted');
    }
    el.style.cssText = 'display:block;width:100%;max-width:min(100%,' + AI_CHAT_MAX_WIDTH_PX
        + 'px);min-width:0;margin:0 auto;height:100%;border:none !important;outline:none !important;'
        + 'background:transparent !important;box-shadow:none !important;box-sizing:border-box;';
    state._deepChat = el;
    mount.style.width = '100%';
    mount.style.maxWidth = '100%';
    mount.style.minWidth = '0';
    mount.style.boxSizing = 'border-box';
    mount.style.overflowX = 'hidden';
    mount.style.minHeight = mount.style.minHeight || '180px';
    if (!mount.style.flex && !mount.style.height) {
        mount.style.flex = '1 1 auto';
        mount.style.minHeight = mount.style.minHeight || '180px';
        mount.style.display = 'flex';
        mount.style.flexDirection = 'column';
    }
    aiChatBindElement(el, root, state, o);
    aiChatSetKeyGate(root, {
        mountSelector: o.mountSelector,
        state,
        wireOpts: o,
    });
    return el;
}

function aiChatRenderMessages(root, state, opts) {
    if (!root || !state) return;
    const o = aiChatResolveWireOpts(state, opts || state._wireOpts);
    state._wireOpts = o;
    const run = async () => {
        try {
            const el = await aiChatEnsureMounted(root, state, o);
            if (aiChatShouldSyncHistory(root, state)) {
                aiChatSyncHistory(el, state);
            }
            aiChatSetKeyGate(root, {
                mountSelector: o.mountSelector,
                state,
                wireOpts: o,
            });
        } catch (err) {
            Logger.error(o.logTag + ': renderMessages failed', err);
            const mount = aiChatQuery(root, o.mountSelector);
            if (mount && !mount.querySelector('deep-chat')) {
                mount.textContent = 'Chat UI failed to load: '
                    + ((err && err.message) || String(err));
            }
        }
    };
    void run();
}

function aiChatWireComposer(root, stateOrOpts, maybeOpts) {
    // Support wireComposer(root, opts) and wireComposer(root, state, opts).
    let state = null;
    let opts = null;
    if (maybeOpts != null) {
        state = stateOrOpts;
        opts = maybeOpts;
    } else {
        opts = stateOrOpts;
    }
    const o = aiChatResolveOpts(opts);
    if (!root) return;

    if (!state) {
        // Legacy callers without state: resolve later via element binding updates.
        state = root._wfAiChatState || aiChatCreateState();
        root._wfAiChatState = state;
    }
    state._wireOpts = o;
    root._wfAiChatState = state;

    const exportBtn = aiChatQuery(root, o.exportSelector);
    if (exportBtn && exportBtn.getAttribute(o.wiredAttr) !== '1') {
        exportBtn.setAttribute(o.wiredAttr, '1');
        exportBtn.addEventListener('click', () => {
            if (o.onExport) o.onExport();
            else Logger.warn(o.logTag + ': conversation export handler missing');
        });
    }

    void aiChatEnsureMounted(root, state, o).then((el) => {
        if (el && aiChatShouldSyncHistory(root, state)) {
            aiChatSyncHistory(el, state);
        }
        aiChatSetKeyGate(root, {
            mountSelector: o.mountSelector,
            state,
            wireOpts: o,
        });
    }).catch((err) => {
        Logger.error(o.logTag + ': wireComposer mount failed', err);
    });
}

function aiChatExportConversation(state, opts) {
    const o = aiChatResolveOpts(opts || (state && state._wireOpts));
    if (!state) {
        Logger.warn(o.logTag + ': conversation export skipped — state missing');
        return;
    }
    const payload = {
        exportedAt: new Date().toISOString(),
        metadata: o.exportMetadata || undefined,
        messages: (state.messages || [])
            .filter((msg) => {
                if (!msg || msg.streaming) return false;
                if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'tool') return true;
                return false;
            })
            .map((msg) => {
                const out = {
                    role: msg.role,
                    hiddenInUi: msg.hideInUi ? true : undefined,
                };
                if (msg.role === 'tool') {
                    out.tool_call_id = msg.tool_call_id != null ? String(msg.tool_call_id) : '';
                    out.content = msg.content != null ? String(msg.content) : '';
                    return out;
                }
                if (msg.content != null && msg.content !== '') {
                    out.content = String(msg.content);
                } else if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
                    out.content = null;
                } else {
                    out.content = String(msg.content || '');
                }
                if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
                    out.tool_calls = msg.tool_calls.map((tc) => ({
                        id: tc && tc.id != null ? String(tc.id) : '',
                        type: (tc && tc.type) || 'function',
                        function: {
                            name: tc && tc.function ? String(tc.function.name || '') : '',
                            arguments: tc && tc.function
                                ? String(tc.function.arguments != null ? tc.function.arguments : '')
                                : '',
                        },
                    }));
                }
                if (msg.displayContent != null) out.displayContent = String(msg.displayContent);
                const attachments = aiChatNormalizeDisplayAttachments(
                    msg.displayAttachments != null ? msg.displayAttachments : msg.displayAttachment
                );
                if (attachments.length) {
                    out.displayAttachments = attachments;
                    out.displayAttachment = attachments[0];
                }
                return out;
            }),
    };
    try {
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: 'application/json;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = o.exportFilename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        Logger.log(o.logTag + ': conversation exported — ' + o.exportFilename);
    } catch (err) {
        Logger.error(o.logTag + ': conversation export failed', err);
    }
}

/**
 * Programmatic turn via direct Deep Chat paint (ratings-style), not submitUserMessage.
 * hideInUi skips the user bubble; otherwise paints display text + attachment chips.
 */
async function aiChatProgrammaticPaintAndStream(el, state, opts) {
    const o = opts.wireOpts;
    const userContent = opts.userContent;
    const displayContent = opts.displayContent;
    const displayAttachments = aiChatNormalizeDisplayAttachments(
        opts.displayAttachments != null ? opts.displayAttachments : opts.displayAttachment
    );
    const displayAttachment = displayAttachments[0] || null;
    const hideInUi = !!opts.hideInUi;
    const systemContent = opts.systemContent;
    const apiMessagesOverride = opts.apiMessagesOverride;
    const display = opts.display;

    if (userContent) {
        const userMsg = aiChatApplyUserMessageExtras(
            { role: 'user', content: userContent, hideInUi: hideInUi || undefined },
            { displayContent, displayAttachments, displayAttachment, hideInUi }
        );
        state.messages.push(userMsg);
    }
    state.messages.push({ role: 'assistant', content: '', streaming: true });

    if (!hideInUi && display) {
        try {
            el.addMessage({ role: 'user', text: String(display) });
        } catch (err) {
            Logger.warn(o.logTag + ': programmatic user bubble failed', err);
        }
        try { aiChatSyncRowEnhancements(el, o); } catch (_e) { /* ignore */ }
    }

    const apiMessages = apiMessagesOverride
        || aiChatBuildApiMessages(state, { systemContent });
    let uiText = '';
    let aiIndex = -1;
    const signals = {
        onOpen() {
            try { el.disableSubmitButton(true); } catch (_e) { /* ignore */ }
        },
        onClose() {
            try { el.disableSubmitButton(false); } catch (_e) { /* ignore */ }
        },
        onResponse(response) {
            if (!response) return;
            if (response.error) {
                try { el.addMessage({ error: String(response.error) }); } catch (_e) { /* ignore */ }
                return;
            }
            const text = response.text != null ? String(response.text) : '';
            uiText = response.overwrite ? text : (uiText + text);
            try {
                if (aiIndex < 0) {
                    el.addMessage({ role: 'ai', text: uiText });
                    const all = typeof el.getMessages === 'function' ? el.getMessages() : [];
                    aiIndex = Array.isArray(all) ? all.length - 1 : 0;
                } else {
                    el.updateMessage({ role: 'ai', text: uiText }, aiIndex);
                }
            } catch (_e) { /* ignore */ }
        },
        stopClicked: { listener: null },
    };

    try {
        const result = await aiChatRunStreamWithSignals(state, apiMessages, signals, o);
        const full = result && result.text != null ? String(result.text) : '';
        const generationId = result && result.generationId ? result.generationId : null;
        const model = result && result.model ? result.model : null;
        state.lastGenerationId = generationId;
        state.lastModel = model;
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === 'assistant') {
            last.content = full || '';
            last.streaming = false;
        }
        Logger.log(o.logTag + ': chat reply done (' + (full || '').length + ' chars'
            + (generationId ? ' · gen ' + generationId : '') + ')');
        if (o.onTurnDone) {
            let userPreview = '';
            if (displayContent != null) {
                userPreview = String(displayContent).trim();
            } else {
                for (let i = state.messages.length - 1; i >= 0; i--) {
                    const m = state.messages[i];
                    if (m && m.role === 'user') {
                        userPreview = String(
                            m.displayContent != null ? m.displayContent : (m.content || '')
                        ).trim();
                        break;
                    }
                }
            }
            try {
                o.onTurnDone({ generationId, model, userPreview, fullText: full || '' });
            } catch (cbErr) {
                Logger.warn(o.logTag + ': onTurnDone failed', cbErr);
            }
        }
        try { aiChatSyncRowEnhancements(el, o); } catch (_e) { /* ignore */ }
        aiChatHealEmptyView(el, state, o);
        return full || '';
    } catch (err) {
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === 'assistant') {
            last.content = 'Error: ' + ((err && err.message) || String(err));
            last.streaming = false;
        }
        Logger.error(o.logTag + ': chat failed: ' + ((err && err.message) || err));
        try { aiChatHealEmptyView(el, state, o); } catch (_e2) { /* ignore */ }
        throw err;
    }
}

/**
 * Push user + streaming assistant, run stream, finalize last bubble.
 * Composer path reuses Deep Chat connect signals; programmatic paths paint
 * via addMessage (ratings-style) and never submitUserMessage.
 */
async function aiChatSendTurn(root, state, opts) {
    const o = aiChatResolveOpts(Object.assign({}, state && state._wireOpts, opts));
    if (!state) return null;
    if (state.streaming) return null;

    const userText = opts && opts.userText != null ? String(opts.userText) : '';
    const userContent = opts && opts.userContent != null ? String(opts.userContent) : userText;
    const displayContent = opts && opts.displayContent != null ? opts.displayContent : null;
    const displayAttachments = aiChatNormalizeDisplayAttachments(
        opts && (opts.displayAttachments != null ? opts.displayAttachments : opts.displayAttachment)
    );
    const displayAttachment = displayAttachments[0] || null;
    const hideInUi = !!(opts && opts.hideInUi);
    const fromHandler = !!(root && root._wfAiChatFromHandler);
    const signals = root && root._wfAiChatSignals;

    if (fromHandler && signals) {
        // Deep Chat already rendered the user bubble; stream into signals.
        if (userContent) {
            const userMsg = aiChatApplyUserMessageExtras(
                { role: 'user', content: userContent },
                { displayContent, displayAttachments, displayAttachment, hideInUi }
            );
            state.messages.push(userMsg);
        }
        state.messages.push({ role: 'assistant', content: '', streaming: true });
        try { aiChatSyncRowEnhancements(state._deepChat, o); } catch (_e) { /* ignore */ }
        const systemContent = opts && opts.systemContent != null ? opts.systemContent : null;
        const apiMessages = (opts && opts.apiMessages)
            || aiChatBuildApiMessages(state, { systemContent });
        try {
            const result = await aiChatRunStreamWithSignals(state, apiMessages, signals, o);
            const full = result && result.text != null ? String(result.text) : '';
            const generationId = result && result.generationId ? result.generationId : null;
            const model = result && result.model ? result.model : null;
            state.lastGenerationId = generationId;
            state.lastModel = model;
            const last = state.messages[state.messages.length - 1];
            if (last && last.role === 'assistant') {
                last.content = full || '';
                last.streaming = false;
            }
            Logger.log(o.logTag + ': chat reply done (' + (full || '').length + ' chars'
                + (generationId ? ' · gen ' + generationId : '') + ')');
            if (o.onTurnDone) {
                let userPreview = '';
                for (let i = state.messages.length - 1; i >= 0; i--) {
                    const m = state.messages[i];
                    if (m && m.role === 'user') {
                        userPreview = String(m.displayContent != null ? m.displayContent : (m.content || '')).trim();
                        break;
                    }
                }
                try {
                    o.onTurnDone({ generationId, model, userPreview, fullText: full || '' });
                } catch (cbErr) {
                    Logger.warn(o.logTag + ': onTurnDone failed', cbErr);
                }
            }
            try { aiChatSyncRowEnhancements(state._deepChat, o); } catch (_e) { /* ignore */ }
            aiChatHealEmptyView(state._deepChat, state, o);
            return full || '';
        } catch (err) {
            const last = state.messages[state.messages.length - 1];
            if (last && last.role === 'assistant') {
                last.content = 'Error: ' + ((err && err.message) || String(err));
                last.streaming = false;
            }
            Logger.error(o.logTag + ': chat failed: ' + ((err && err.message) || err));
            try { aiChatHealEmptyView(state._deepChat, state, o); } catch (_e2) { /* ignore */ }
            throw err;
        }
    }

    // Programmatic send (hidden or visible): direct paint, no submitUserMessage.
    const el = await aiChatEnsureMounted(root, state, o);
    const systemContent = opts && opts.systemContent != null ? opts.systemContent : null;
    const apiMessagesOverride = opts && opts.apiMessages;
    const display = displayContent != null
        ? String(displayContent)
        : (userText || userContent);

    if (hideInUi) {
        return aiChatProgrammaticPaintAndStream(el, state, {
            wireOpts: o,
            userContent,
            displayContent,
            displayAttachments,
            displayAttachment,
            hideInUi: true,
            systemContent,
            apiMessagesOverride,
            display,
        });
    }

    if (!String(display || '').trim() && !apiMessagesOverride) return null;

    return aiChatProgrammaticPaintAndStream(el, state, {
        wireOpts: o,
        userContent,
        displayContent,
        displayAttachments,
        displayAttachment,
        hideInUi: false,
        systemContent,
        apiMessagesOverride,
        display,
    });
}

function aiChatRunStream(root, state, apiMessages, opts) {
    // Compatibility shim: prefer sendTurn. Direct run without Deep Chat signals
    // updates state only.
    const o = aiChatResolveOpts(opts);
    const fakeSignals = {
        onOpen() {},
        onClose() {},
        onResponse() {},
        stopClicked: { listener: null },
    };
    return aiChatRunStreamWithSignals(state, apiMessages, fakeSignals, o);
}

/**
 * Parse tool call arguments JSON; returns {} on failure.
 * @param {object} toolCall
 */
function aiChatParseToolArgs(toolCall) {
    const raw = toolCall
        && toolCall.function
        && toolCall.function.arguments != null
        ? String(toolCall.function.arguments)
        : '{}';
    try {
        const parsed = JSON.parse(raw || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_e) {
        return { _parseError: true, _raw: raw };
    }
}

/**
 * Race a promise against a timeout; on timeout run onTimeout then reject.
 */
function aiChatWithTimeout(promise, ms, onTimeout, message) {
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            try {
                if (typeof onTimeout === 'function') onTimeout();
            } catch (_e) { /* ignore */ }
            reject(new Error(message || ('Timed out after ' + ms + 'ms')));
        }, ms);
    });
    return Promise.race([
        Promise.resolve(promise).finally(() => {
            if (timer) clearTimeout(timer);
        }),
        timeoutPromise,
    ]);
}

/**
 * Multi-round tool loop. Intermediate assistant/tool messages stay hideInUi.
 * Only the finalize tool (default `respond`) produces a visible assistant bubble.
 *
 * opts:
 * - userText / userContent
 * - systemContent
 * - tools (OpenAI tool defs)
 * - executeTool(name, args, toolCall) => Promise<string|object> | string|object
 * - finalizeToolName (default 'respond')
 * - maxToolRounds (default 8)
 * - roundTimeoutMs (default 90000)
 * - model, max_tokens, parallel_tool_calls, tool_choice
 * - onToolActivity({ round, name, argsSummary, resultBytes, error? })
 * - onTurnDone
 */
async function aiChatSendToolTurn(root, state, opts) {
    const o = aiChatResolveOpts(Object.assign({}, state && state._wireOpts, opts));
    if (!state) return null;
    if (state.streaming) return null;

    const tools = opts && Array.isArray(opts.tools) ? opts.tools : null;
    const executeTool = opts && typeof opts.executeTool === 'function' ? opts.executeTool : null;
    if (!tools || !tools.length || !executeTool) {
        throw new Error('sendToolTurn requires tools and executeTool');
    }

    const finalizeName = String(
        (opts && opts.finalizeToolName) || 'respond'
    ).trim() || 'respond';
    const maxRounds = Math.max(
        1,
        Math.min(
            20,
            Number.isFinite(opts && opts.maxToolRounds) ? Math.floor(opts.maxToolRounds) : 8
        )
    );
    const roundTimeoutMs = Math.max(
        10000,
        Number.isFinite(opts && opts.roundTimeoutMs)
            ? Math.floor(opts.roundTimeoutMs)
            : AI_CHAT_TOOL_ROUND_TIMEOUT_MS
    );
    const userText = opts && opts.userText != null ? String(opts.userText) : '';
    const userContent = opts && opts.userContent != null ? String(opts.userContent) : userText;
    const systemContent = opts && opts.systemContent != null ? opts.systemContent : null;
    const fromHandler = !!(root && root._wfAiChatFromHandler);
    const signals = root && root._wfAiChatSignals;

    if (!String(userContent || '').trim()) return null;

    if (userContent) {
        state.messages.push({
            role: 'user',
            content: userContent,
            displayContent: opts && opts.displayContent != null ? opts.displayContent : null,
        });
    }

    state.stopRequested = false;
    state.streaming = true;
    const useLiveSignals = !!(fromHandler && signals);

    const quietSignals = signals || {
        onOpen() {},
        onClose() {},
        onResponse() {},
        stopClicked: { listener: null },
    };

    let lastGenerationId = null;
    let lastModel = null;
    let round = 0;
    let forceFinalize = false;
    let forcedFinalizeAttempts = 0;
    const maxForcedFinalizeAttempts = 2;
    let cumulativeToolResultBytes = 0;
    let lastNonFinalToolNames = [];
    let liveClosed = false;

    const closeLiveSignals = () => {
        if (!useLiveSignals || liveClosed || !signals) return;
        liveClosed = true;
        try { signals.onClose(); } catch (_e) { /* ignore */ }
    };

    if (useLiveSignals && signals) {
        try { signals.onOpen(); } catch (_e) { /* ignore */ }
    }

    const notifyActivity = (payload) => {
        const enriched = Object.assign({
            maxRounds,
            remainingRounds: Math.max(0, maxRounds - round),
            cumulativeToolResultBytes,
        }, payload || {});
        if (typeof o.onToolActivity === 'function') {
            try { o.onToolActivity(enriched); } catch (_e) { /* ignore */ }
        }
        if (typeof opts.onToolActivity === 'function' && opts.onToolActivity !== o.onToolActivity) {
            try { opts.onToolActivity(enriched); } catch (_e) { /* ignore */ }
        }
    };

    const injectBudgetHint = (roundsUsed) => {
        const remaining = Math.max(0, maxRounds - roundsUsed);
        state.messages.push({
            role: 'user',
            content: '[Budget] Tool rounds used: ' + roundsUsed + '/' + maxRounds
                + '. Remaining: ' + remaining
                + '. Parallel tool calls in one model response share one round.'
                + (remaining === 0
                    ? ' No rounds left after this — call ' + finalizeName
                        + '({ markdown }) NOW. If the analysis is incomplete, say so explicitly;'
                        + ' do NOT invent exhaustive zero/none conclusions from partial samples.'
                    : remaining <= 2
                        ? ' Low budget. If remaining rounds cannot finish exhaustively, call '
                            + finalizeName + ' now stating incompleteness and what remains'
                            + ' (do not claim “none” from partial samples).'
                        : ' If you will need more than ' + remaining
                            + ' rounds to finish, call ' + finalizeName
                            + ' now and ask the operator to raise Max tool rounds.'),
            hideInUi: true,
        });
    };

    const syncWorking = (label) => {
        if (useLiveSignals) {
            try {
                void Promise.resolve(signals.onResponse({ text: label, overwrite: true }));
            } catch (_e) { /* ignore */ }
        }
    };

    const abortPriorStream = () => {
        if (state.streamAbort && typeof state.streamAbort.abort === 'function') {
            try { state.streamAbort.abort(); } catch (_e) { /* ignore */ }
        }
        state.streamAbort = null;
    };

    const deliverFinalAnswer = async (markdown, viaLabel) => {
        const text = String(markdown || '').trim();
        state.messages.push({
            role: 'assistant',
            content: text,
        });
        state.lastGenerationId = lastGenerationId;
        state.lastModel = lastModel;
        state.streaming = false;
        try {
            if (useLiveSignals) {
                await Promise.resolve(signals.onResponse({
                    text: text,
                    overwrite: true,
                }));
                closeLiveSignals();
            } else if (state._deepChat) {
                aiChatSyncHistory(state._deepChat, state);
            }
        } catch (_e) { /* ignore */ }
        Logger.log(o.logTag + ': tool turn done via ' + viaLabel
            + ' (' + text.length + ' chars'
            + (lastGenerationId ? ' · gen ' + lastGenerationId : '') + ')');
        if (o.onTurnDone || (opts && opts.onTurnDone)) {
            const cb = opts && opts.onTurnDone ? opts.onTurnDone : o.onTurnDone;
            try {
                cb({
                    generationId: lastGenerationId,
                    model: lastModel,
                    userPreview: String(userText || userContent).trim(),
                    fullText: text,
                });
            } catch (cbErr) {
                Logger.warn(o.logTag + ': onTurnDone failed', cbErr);
            }
        }
        try { aiChatSyncRowEnhancements(state._deepChat, o); } catch (_e) { /* ignore */ }
        return text;
    };

    const deliverStopped = async () => {
        abortPriorStream();
        state.streaming = false;
        Logger.log(o.logTag + ': tool turn stopped by operator');
        return await deliverFinalAnswer('(stopped)', 'stopped');
    };

    const queueForcedFinalize = (reason) => {
        if (forcedFinalizeAttempts >= maxForcedFinalizeAttempts) return false;
        forcedFinalizeAttempts += 1;
        forceFinalize = true;
        state.messages.push({
            role: 'user',
            content: 'You must call ' + finalizeName
                + '({ markdown }) now with the complete operator-facing answer. '
                + 'Do not reply with plain text. Reason: ' + reason,
            hideInUi: true,
        });
        Logger.debug(o.logTag + ': forcing ' + finalizeName + ' — ' + reason
            + ' (attempt ' + forcedFinalizeAttempts + '/' + maxForcedFinalizeAttempts + ')');
        return true;
    };

    try {
        while (round < maxRounds + maxForcedFinalizeAttempts) {
            if (state.stopRequested) {
                return await deliverStopped();
            }
            round += 1;
            syncWorking('Working… (round ' + round + ')');
            state.streaming = true;
            abortPriorStream();

            const apiMessages = aiChatBuildApiMessages(state, { systemContent });
            let roundError = null;
            const choice = forceFinalize
                ? { type: 'function', function: { name: finalizeName } }
                : ((opts && opts.tool_choice != null) ? opts.tool_choice : 'auto');

            const streamOpts = Object.assign({}, o, {
                tools,
                tool_choice: choice,
                model: opts && opts.model,
                max_tokens: opts && opts.max_tokens,
                parallel_tool_calls: opts && opts.parallel_tool_calls,
                suppressTextDeltas: true,
                keepStreamingFlag: true,
            });

            Logger.debug(o.logTag + ': tool round ' + round + '/' + maxRounds
                + (forceFinalize ? ' (force ' + finalizeName + ')' : '')
                + ' — requesting completion (' + apiMessages.length + ' msg)');

            let result;
            try {
                result = await aiChatWithTimeout(
                    aiChatRunStreamWithSignals(
                        state,
                        apiMessages,
                        {
                            onOpen() {},
                            onClose() {},
                            onResponse(response) {
                                if (response && response.error) {
                                    roundError = String(response.error);
                                }
                            },
                            stopClicked: quietSignals.stopClicked || { listener: null },
                        },
                        streamOpts
                    ),
                    roundTimeoutMs,
                    () => abortPriorStream(),
                    'OpenRouter tool round timed out after ' + roundTimeoutMs + 'ms'
                );
            } catch (streamErr) {
                abortPriorStream();
                if (state.stopRequested) {
                    return await deliverStopped();
                }
                throw streamErr;
            }

            if (state.stopRequested) {
                return await deliverStopped();
            }

            if (roundError) {
                abortPriorStream();
                if (state.stopRequested) {
                    return await deliverStopped();
                }
                throw new Error(roundError);
            }

            if (result && result.generationId) lastGenerationId = result.generationId;
            if (result && result.model) lastModel = result.model;

            const toolCalls = (result && Array.isArray(result.toolCalls))
                ? result.toolCalls
                : [];
            const finishReason = result && result.finishReason
                ? String(result.finishReason)
                : '';
            const salvageText = String(result && result.text != null ? result.text : '').trim();
            const toolNames = toolCalls.map((tc) =>
                (tc && tc.function && tc.function.name) ? String(tc.function.name) : '?'
            ).join(', ');
            Logger.debug(o.logTag + ': tool round ' + round + ' done — finish_reason='
                + (finishReason || 'unknown')
                + (toolNames ? ' · tools=[' + toolNames + ']' : ' · no tools')
                + (salvageText && !toolCalls.length ? ' · salvageText=' + salvageText.length + 'c' : ''));

            abortPriorStream();

            if (!toolCalls.length) {
                if (salvageText) {
                    Logger.warn(o.logTag + ': model skipped ' + finalizeName
                        + ' — accepting plain completion as final answer');
                    notifyActivity({
                        round,
                        name: finalizeName,
                        argsSummary: 'salvaged plain text ' + salvageText.length + ' chars',
                        resultBytes: salvageText.length,
                    });
                    return await deliverFinalAnswer(salvageText, finalizeName + ' (salvaged)');
                }
                if (queueForcedFinalize(
                    finishReason === 'stop'
                        ? 'finished with stop and no tool calls'
                        : 'no tool calls (finish_reason=' + (finishReason || 'unknown') + ')'
                )) {
                    state.streaming = true;
                    continue;
                }
                Logger.warn(o.logTag + ': no tool calls and salvage/force exhausted — soft fallback');
                return await deliverFinalAnswer(
                    'I could not produce a final answer for that turn. Please try again.',
                    'soft-fallback'
                );
            }

            forceFinalize = false;

            const respondCall = toolCalls.find((tc) =>
                tc
                && tc.function
                && String(tc.function.name || '').trim() === finalizeName
            );

            state.messages.push({
                role: 'assistant',
                content: null,
                tool_calls: toolCalls,
                hideInUi: true,
            });

            if (respondCall) {
                const args = aiChatParseToolArgs(respondCall);
                const markdown = args && args.markdown != null
                    ? String(args.markdown)
                    : (args && args._parseError ? '' : '');
                if (!String(markdown || '').trim()) {
                    state.messages.push({
                        role: 'tool',
                        tool_call_id: respondCall.id,
                        content: JSON.stringify({ error: finalizeName + ' requires non-empty markdown' }),
                        hideInUi: true,
                    });
                    if (queueForcedFinalize(finalizeName + ' called without markdown')) {
                        state.streaming = true;
                        continue;
                    }
                    return await deliverFinalAnswer(
                        'I could not produce a final answer for that turn. Please try again.',
                        'soft-fallback'
                    );
                }
                state.messages.push({
                    role: 'tool',
                    tool_call_id: respondCall.id,
                    content: JSON.stringify({ ok: true }),
                    hideInUi: true,
                });
                notifyActivity({
                    round,
                    name: finalizeName,
                    argsSummary: 'markdown ' + markdown.length + ' chars',
                    resultBytes: markdown.length,
                });
                return await deliverFinalAnswer(markdown, finalizeName);
            }

            for (let ti = 0; ti < toolCalls.length; ti++) {
                if (state.stopRequested) {
                    return await deliverStopped();
                }
                const tc = toolCalls[ti];
                const name = tc && tc.function
                    ? String(tc.function.name || '').trim()
                    : '';
                const args = aiChatParseToolArgs(tc);
                let resultPayload;
                let resultStr;
                let errMsg = null;
                try {
                    resultPayload = await Promise.resolve(executeTool(name, args, tc));
                    resultStr = typeof resultPayload === 'string'
                        ? resultPayload
                        : JSON.stringify(resultPayload == null ? null : resultPayload);
                } catch (execErr) {
                    errMsg = (execErr && execErr.message) || String(execErr);
                    resultStr = JSON.stringify({ error: errMsg });
                }
                const bytes = resultStr ? resultStr.length : 0;
                cumulativeToolResultBytes += bytes;
                notifyActivity({
                    round,
                    name: name || 'unknown',
                    argsSummary: aiChatToolArgsSummary(args),
                    resultBytes: bytes,
                    error: errMsg || undefined,
                });
                state.messages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: resultStr,
                    hideInUi: true,
                });
            }
            if (state.stopRequested) {
                return await deliverStopped();
            }
            lastNonFinalToolNames = toolCalls.map((tc) =>
                (tc && tc.function && tc.function.name) ? String(tc.function.name) : '?'
            );
            state.streaming = true;
            if (round >= maxRounds) {
                if (!queueForcedFinalize(
                    'exceeded max tool rounds (' + maxRounds
                        + ') without ' + finalizeName
                        + '; last tools=[' + lastNonFinalToolNames.join(', ') + ']'
                        + '. Call ' + finalizeName
                        + ' with an INCOMPLETE-status answer — do not invent zero/none from partial work.'
                )) {
                    break;
                }
            } else {
                injectBudgetHint(round);
            }
        }

        Logger.warn(o.logTag + ': tool loop ended without ' + finalizeName + ' — soft fallback');
        return await deliverFinalAnswer(
            'I reached the tool-round limit (' + maxRounds
                + ' rounds) before finishing an exhaustive answer.'
                + (lastNonFinalToolNames.length
                    ? ' Last tools: ' + lastNonFinalToolNames.join(', ') + '.'
                    : '')
                + ' Partial tool activity is listed in the Tool activity panel.'
                + ' I am **not** claiming a complete zero/none result — raise Max tool rounds'
                + ' or narrow the question and try again.',
            'soft-fallback'
        );
    } catch (err) {
        abortPriorStream();
        state.streaming = false;
        if (state.stopRequested) {
            try {
                return await deliverStopped();
            } catch (_e) {
                closeLiveSignals();
                throw err;
            }
        }
        const msg = (err && err.message) || String(err);
        const last = state.messages[state.messages.length - 1];
        if (!last || last.role !== 'assistant' || !String(last.content || '').startsWith('Error:')) {
            state.messages.push({
                role: 'assistant',
                content: 'Error: ' + msg,
            });
        }
        try {
            if (useLiveSignals && signals) {
                await Promise.resolve(signals.onResponse({ error: msg }));
                closeLiveSignals();
            } else if (state._deepChat) {
                aiChatSyncHistory(state._deepChat, state);
            }
        } catch (_e) { /* ignore */ }
        Logger.error(o.logTag + ': tool turn failed: ' + msg);
        throw err;
    } finally {
        closeLiveSignals();
        if (fromHandler && root) {
            root._wfAiChatFromHandler = false;
            root._wfAiChatSignals = null;
        }
    }
}

function aiChatToolArgsSummary(args) {
    if (!args || typeof args !== 'object') return '';
    try {
        const keys = Object.keys(args).filter((k) => k.charAt(0) !== '_');
        if (!keys.length) return '{}';
        const parts = keys.slice(0, 4).map((k) => {
            let v = args[k];
            if (typeof v === 'string' && v.length > 40) v = v.slice(0, 37) + '…';
            return k + '=' + JSON.stringify(v);
        });
        return parts.join(', ') + (keys.length > 4 ? '…' : '');
    } catch (_e) {
        return '';
    }
}

const AiChatApi = {
    VERSION: AI_CHAT_VERSION,
    hasAiKey: aiChatHasKey,
    noKeyMessageHtml: aiChatNoKeyMessageHtml,
    setKeyGate: aiChatSetKeyGate,
    createState: aiChatCreateState,
    ensureMounted: aiChatEnsureMounted,
    renderMessages: aiChatRenderMessages,
    updateStreamingBubble: aiChatUpdateStreamingBubble,
    setStreamingUi: aiChatSetStreamingUi,
    stopStream: aiChatStopStream,
    runStream: aiChatRunStream,
    buildApiMessages: aiChatBuildApiMessages,
    wireComposer: aiChatWireComposer,
    exportConversation: aiChatExportConversation,
    sendTurn: aiChatSendTurn,
    sendToolTurn: aiChatSendToolTurn,
};

const plugin = {
    id: 'aiChatLib',
    name: 'AI Chat (library)',
    description: 'Shared OpenRouter chat transcript UI (Deep Chat) and streaming controller',
    _version: '8.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.aiChat = AiChatApi;
        if (!state.registered) {
            Logger.log('module registered (Context.aiChat) v' + AI_CHAT_VERSION
                + ' · deep-chat UI');
            state.registered = true;
        }
    }
};
