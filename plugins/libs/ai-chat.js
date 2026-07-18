// ============= ai-chat.js (library) =============
// Shared OpenRouter chat transcript UI + streaming controller, backed by
// Deep Chat (<deep-chat>). Used by verifier-fetcher Diagnose/Chat, rating-
// explain cards, and the Ops dashboard Chats tab.
//
// Consumers supply feature-specific system prompts, mount markup, and
// turn callbacks. This module owns Deep Chat mounting, message sync, and
// chatCompletionStream orchestration.

const AI_CHAT_VERSION = '2.5';
const PLUGIN_ID = 'ai-chat';
const AI_CHAT_MAX_WIDTH_PX = 900;

function aiChatCopyIconSvg() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
        + ' aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>'
        + '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
}

function aiChatHasKey() {
    return !!(Context.aiOpenRouter
        && typeof Context.aiOpenRouter.hasStoredKey === 'function'
        && Context.aiOpenRouter.hasStoredKey());
}

function aiChatCreateState(extra) {
    return Object.assign({
        messages: [],
        streaming: false,
        streamAbort: null,
        streamGen: 0,
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
    };
}

function aiChatQuery(root, selector) {
    if (!root || !selector) return null;
    return root.querySelector(selector);
}

function aiChatVisibleHistory(state) {
    const out = [];
    const messages = (state && state.messages) || [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg || msg.hideInUi) continue;
        if (msg.role === 'system') continue;
        if (msg.role === 'assistant' && !(msg.content || '').trim() && msg.streaming) continue;
        if (msg.role === 'assistant' && !(msg.content || '').trim()) continue;
        const role = msg.role === 'assistant' ? 'ai' : 'user';
        const text = msg.displayContent != null
            ? String(msg.displayContent)
            : String(msg.content || '');
        out.push({ role, text });
    }
    return out;
}

function aiChatApplyTheme(el) {
    if (!el) return;
    el.chatStyle = {
        width: '100%',
        maxWidth: AI_CHAT_MAX_WIDTH_PX + 'px',
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
        + '.deep-chat-temporary-message { display: none; }'
        + '.inner-message-container { flex-direction: column; align-items: flex-start; }'
        + '.inner-message-container:has(.user-message-text) { align-items: flex-end; }'
        + '.name {'
        + '  color: #94a3b8 !important; font-size: 11px !important; font-weight: 600 !important;'
        + '  margin: 0 10px 4px !important;'
        + '}'
        + '.outer-message-container { position: relative; }'
        + '.wf-chat-copy {'
        + '  display: inline-flex; align-items: center; justify-content: center;'
        + '  width: 28px; height: 28px; padding: 0; margin: 2px 12px 0;'
        + '  border: none; border-radius: 8px; cursor: pointer;'
        + '  background: transparent; color: #94a3b8;'
        + '  opacity: 0; transition: opacity 120ms ease, color 120ms ease, background 120ms ease;'
        + '}'
        + '.outer-message-container:hover .wf-chat-copy,'
        + '.outer-message-container:focus-within .wf-chat-copy,'
        + '.wf-chat-copy:focus-visible { opacity: 1; }'
        + '.wf-chat-copy:hover { background: color-mix(in srgb, #94a3b8 18%, transparent); color: #e2e8f0; }'
        + '.wf-chat-copy--ok { opacity: 1 !important; color: #16a34a !important; }'
        + '.wf-chat-copy--fail { opacity: 1 !important; color: #dc2626 !important; }'
        + '.outer-message-container:has(.user-message-text) .wf-chat-copy {'
        + '  margin-inline-start: auto; margin-inline-end: 12px;'
        + '}'
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
            },
            text: {
                fontSize: '12px',
                color: 'var(--foreground, #0f172a)',
            }
        }
    };
    const nameStyle = {
        color: '#94a3b8',
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
            const messages = typeof el.getMessages === 'function' ? el.getMessages() : [];
            if (index >= 0 && messages && messages[index] && messages[index].text != null) {
                markdown = String(messages[index].text);
            } else {
                markdown = String((bubble.textContent || '')).trim();
            }
            if (!markdown) throw new Error('Message is empty');
            await navigator.clipboard.writeText(markdown);
            aiChatFlashCopyButton(btn, true);
            Logger.log(o.logTag + ': copied chat message (' + markdown.length + ' chars)');
        } catch (err) {
            aiChatFlashCopyButton(btn, false);
            Logger.error(o.logTag + ': failed to copy chat message', err);
        }
    });
    row.appendChild(btn);
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
        const sync = () => {
            const rows = aiChatMessageRows(shadow);
            for (let i = 0; i < rows.length; i++) {
                aiChatInjectCopyButton(el, rows[i], opts);
            }
        };
        const observer = new MutationObserver(() => { sync(); });
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

function aiChatSyncHistory(el, state) {
    if (!el) return;
    try {
        el.history = aiChatVisibleHistory(state);
    } catch (err) {
        Logger.warn(PLUGIN_ID + ': failed to sync deep-chat history', err);
    }
}

/**
 * Build OpenRouter message list from transcript state.
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
        if (m.role === 'system' || m.role === 'user' || m.role === 'assistant') {
            if (m.role === 'system' && o.systemContent) continue;
            api.push({ role: m.role, content: m.content || '' });
        }
    }
    return api;
}

function aiChatStopStream(state, opts) {
    const o = aiChatResolveOpts(opts || (state && state._wireOpts));
    if (!state) return;
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
    let doneMeta = { generationId: null, model: null };
    let settled = false;
    // Serialize Deep Chat onResponse promises so rapid SSE deltas cannot race.
    let responseChain = Promise.resolve();

    try { signals.onOpen(); } catch (_e) { /* ignore */ }

    signals.stopClicked.listener = () => {
        aiChatStopStream(state, o);
        try { signals.onClose(); } catch (_e) { /* ignore */ }
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
        state.streamAbort = null;
        state.streaming = false;
        try { signals.onClose(); } catch (_e) { /* ignore */ }
        return text;
    };
    const settleErr = (err) => {
        if (settled) return;
        settled = true;
        state.streamAbort = null;
        state.streaming = false;
        const message = (err && err.message) || String(err || 'Stream failed');
        try { signals.onResponse({ error: message }); } catch (_e) { /* ignore */ }
        try { signals.onClose(); } catch (_e) { /* ignore */ }
        throw (err instanceof Error ? err : new Error(message));
    };

    return new Promise((resolve, reject) => {
        Promise.resolve(ai.chatCompletionStream({
            messages: apiMessages,
            onDelta: (delta) => {
                if (gen !== state.streamGen) return;
                const chunk = String(delta || '');
                if (!chunk) return;
                assembled += chunk;
                aiChatUpdateStreamingBubble(null, state, assembled, o);
                // Stream mode appends each text chunk; do not overwrite full text.
                void enqueueResponse({ text: chunk });
            },
            onDone: (result) => {
                if (result && result.generationId) doneMeta.generationId = String(result.generationId);
                if (result && result.model) doneMeta.model = String(result.model);
                const streamed = assembled;
                const full = result && result.fullText != null ? String(result.fullText) : streamed;
                assembled = full;
                aiChatUpdateStreamingBubble(null, state, assembled, o);
                void responseChain.then(() => {
                    if (gen !== state.streamGen) {
                        resolve({
                            text: assembled || '',
                            generationId: doneMeta.generationId,
                            model: doneMeta.model,
                        });
                        return;
                    }
                    const syncFinal = (full && full !== streamed)
                        ? enqueueResponse({ text: full, overwrite: true })
                        : Promise.resolve();
                    return syncFinal.then(() => {
                        try {
                            resolve({
                                text: settleOk(assembled) || '',
                                generationId: doneMeta.generationId,
                                model: doneMeta.model,
                            });
                        } catch (err) {
                            reject(err);
                        }
                    });
                }).catch((err) => {
                    try {
                        settleErr(err);
                    } catch (e) {
                        reject(e);
                    }
                });
            },
            onError: (err) => {
                void responseChain.finally(() => {
                    try {
                        settleErr(err);
                    } catch (e) {
                        reject(e);
                    }
                });
            }
        })).then((handle) => {
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
        const userMsg = { role: 'user', content: userContent };
        if (displayContent != null) userMsg.displayContent = displayContent;
        if (hideInUi) userMsg.hideInUi = true;
        state.messages.push(userMsg);
    }
    state.messages.push({ role: 'assistant', content: '', streaming: true });

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
    aiChatApplyTheme(el);
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
}

async function aiChatEnsureMounted(root, state, opts) {
    const o = aiChatResolveOpts(opts);
    if (!root || !state) return null;
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
        mount.innerHTML = '';
        mount.appendChild(el);
        Logger.log(o.logTag + ': deep-chat mounted');
    }
    el.style.cssText = 'display:block;width:100%;max-width:' + AI_CHAT_MAX_WIDTH_PX
        + 'px;margin:0 auto;height:100%;border:none;background:transparent;box-sizing:border-box;';
    state._deepChat = el;
    mount.style.minHeight = mount.style.minHeight || '180px';
    if (!mount.style.flex && !mount.style.height) {
        mount.style.flex = '1 1 auto';
        mount.style.minHeight = mount.style.minHeight || '180px';
        mount.style.display = 'flex';
        mount.style.flexDirection = 'column';
    }
    aiChatBindElement(el, root, state, o);
    return el;
}

function aiChatRenderMessages(root, state, opts) {
    const o = aiChatResolveOpts(opts || (state && state._wireOpts));
    if (!root || !state) return;
    state._wireOpts = o;
    const run = async () => {
        try {
            const el = await aiChatEnsureMounted(root, state, o);
            if (!state.streaming) aiChatSyncHistory(el, state);
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
        if (el) aiChatSyncHistory(el, state);
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
            .filter((msg) => msg && !msg.streaming && (msg.role === 'user' || msg.role === 'assistant'))
            .map((msg) => ({
                role: msg.role,
                content: String(msg.content || ''),
                hiddenInUi: msg.hideInUi ? true : undefined,
            })),
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
 * Push user + streaming assistant, run stream, finalize last bubble.
 * When invoked from Deep Chat's connect handler (via onSend), reuses the
 * active signals. Otherwise submits through Deep Chat or streams directly.
 */
async function aiChatSendTurn(root, state, opts) {
    const o = aiChatResolveOpts(Object.assign({}, state && state._wireOpts, opts));
    if (!state) return null;
    if (state.streaming) return null;

    const userText = opts && opts.userText != null ? String(opts.userText) : '';
    const userContent = opts && opts.userContent != null ? String(opts.userContent) : userText;
    const displayContent = opts && opts.displayContent != null ? opts.displayContent : null;
    const hideInUi = !!(opts && opts.hideInUi);
    const fromHandler = !!(root && root._wfAiChatFromHandler);
    const signals = root && root._wfAiChatSignals;

    if (fromHandler && signals) {
        // Deep Chat already rendered the user bubble; stream into signals.
        if (userContent) {
            const userMsg = { role: 'user', content: userContent };
            if (displayContent != null) userMsg.displayContent = displayContent;
            if (hideInUi) userMsg.hideInUi = true;
            state.messages.push(userMsg);
        }
        state.messages.push({ role: 'assistant', content: '', streaming: true });
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
            return full || '';
        } catch (err) {
            const last = state.messages[state.messages.length - 1];
            if (last && last.role === 'assistant') {
                last.content = 'Error: ' + ((err && err.message) || String(err));
                last.streaming = false;
            }
            Logger.error(o.logTag + ': chat failed: ' + ((err && err.message) || err));
            throw err;
        }
    }

    // Programmatic send
    const el = await aiChatEnsureMounted(root, state, o);
    const systemContent = opts && opts.systemContent != null ? opts.systemContent : null;
    const apiMessagesOverride = opts && opts.apiMessages;

    // Hidden machine payloads: stream without a visible user bubble (matches prior UX).
    if (hideInUi) {
        if (userContent) {
            const userMsg = { role: 'user', content: userContent, hideInUi: true };
            if (displayContent != null) userMsg.displayContent = displayContent;
            state.messages.push(userMsg);
        }
        state.messages.push({ role: 'assistant', content: '', streaming: true });
        const apiMessages = apiMessagesOverride
            || aiChatBuildApiMessages(state, { systemContent });
        let assembled = '';
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
            assembled = full;
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
                const userPreview = displayContent != null
                    ? String(displayContent).trim()
                    : '';
                try {
                    o.onTurnDone({ generationId, model, userPreview, fullText: full || '' });
                } catch (cbErr) {
                    Logger.warn(o.logTag + ': onTurnDone failed', cbErr);
                }
            }
            return assembled || '';
        } catch (err) {
            const last = state.messages[state.messages.length - 1];
            if (last && last.role === 'assistant') {
                last.content = 'Error: ' + ((err && err.message) || String(err));
                last.streaming = false;
            }
            Logger.error(o.logTag + ': chat failed: ' + ((err && err.message) || err));
            throw err;
        }
    }

    const display = displayContent != null
        ? String(displayContent)
        : (userText || userContent);
    if (!String(display || '').trim() && !apiMessagesOverride) return null;

    let resolvePending;
    let rejectPending;
    const pendingResult = new Promise((resolve, reject) => {
        resolvePending = resolve;
        rejectPending = reject;
    });
    state._pendingTurn = {
        userText,
        userContent,
        displayContent,
        hideInUi: false,
        systemContent,
        apiMessages: apiMessagesOverride,
        onTurnDone: o.onTurnDone,
        _resolve: resolvePending,
        _reject: rejectPending,
    };
    try {
        el.submitUserMessage({ text: String(display) });
    } catch (err) {
        state._pendingTurn = null;
        Logger.error(o.logTag + ': submitUserMessage failed', err);
        rejectPending(err instanceof Error ? err : new Error(String(err)));
        throw err;
    }
    return pendingResult;
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

const AiChatApi = {
    VERSION: AI_CHAT_VERSION,
    hasAiKey: aiChatHasKey,
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
};

const plugin = {
    id: 'aiChatLib',
    name: 'AI Chat (library)',
    description: 'Shared OpenRouter chat transcript UI (Deep Chat) and streaming controller',
    _version: '2.5',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.aiChat = AiChatApi;
        if (!state.registered) {
            Logger.log(PLUGIN_ID + ': module registered (Context.aiChat) v' + AI_CHAT_VERSION
                + ' · deep-chat UI');
            state.registered = true;
        }
    }
};
