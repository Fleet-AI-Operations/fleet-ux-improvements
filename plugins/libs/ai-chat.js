// ============= ai-chat.js (library) =============
// Shared OpenRouter chat transcript UI + streaming controller.
// Used by verifier-fetcher Diagnose/Chat and rating-explain cards.
//
// Consumers supply feature-specific system prompts, panel markup, and
// initial payloads. This module owns message rendering, composer wiring,
// and chatCompletionStream orchestration.

const AI_CHAT_VERSION = '1.3';
const PLUGIN_ID = 'ai-chat';

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
    }, extra || {});
}

function aiChatResolveOpts(opts) {
    const o = opts || {};
    return {
        messagesSelector: o.messagesSelector || '[data-wf-ai-chat-messages]',
        sendSelector: o.sendSelector || '[data-wf-ai-chat-send]',
        stopSelector: o.stopSelector || '[data-wf-ai-chat-stop]',
        exportSelector: o.exportSelector || '[data-wf-ai-chat-export]',
        inputSelector: o.inputSelector || '[data-wf-ai-chat-input]',
        wiredAttr: o.wiredAttr || 'data-wf-ai-chat-wired',
        logTag: o.logTag || PLUGIN_ID,
        exportFilename: o.exportFilename || 'ai-chat-conversation.json',
        exportMetadata: o.exportMetadata || null,
        onSend: o.onSend,
        onStop: o.onStop,
        onExport: o.onExport,
        onTurnDone: typeof o.onTurnDone === 'function' ? o.onTurnDone : null,
    };
}

function aiChatQuery(root, selector) {
    if (!root || !selector) return null;
    return root.querySelector(selector);
}

function aiChatRenderMessages(root, state, opts) {
    const o = aiChatResolveOpts(opts);
    const list = aiChatQuery(root, o.messagesSelector);
    if (!list || !state) return;
    const md = Context.userStoryMarkdown;
    if (md && typeof md.ensureProseStyles === 'function') md.ensureProseStyles();
    list.innerHTML = '';
    (state.messages || []).forEach((msg, idx) => {
        if (msg && msg.hideInUi) return;
        if (msg && msg.role === 'system') return;
        // Do not show an empty assistant bubble while waiting for first token.
        if (msg.role === 'assistant' && !(msg.content || '').trim()) return;
        const row = document.createElement('div');
        row.setAttribute('data-wf-chat-role', msg.role);
        row.style.cssText = 'display:flex;flex-direction:column;gap:4px;'
            + (msg.role === 'user' ? 'align-items:flex-end;' : 'align-items:flex-start;');
        const label = document.createElement('div');
        label.textContent = msg.role === 'user' ? 'You' : 'Assistant';
        label.style.cssText = 'font-size:11px;font-weight:600;opacity:0.65;';
        const bubble = document.createElement('div');
        bubble.setAttribute('data-wf-chat-bubble', String(idx));
        bubble.style.cssText = 'max-width:100%;padding:8px 10px;border-radius:8px;font-size:13px;'
            + 'line-height:1.45;border:1px solid color-mix(in srgb,var(--border,#e2e8f0) 80%,transparent);'
            + (msg.role === 'user'
                ? 'background:color-mix(in srgb,var(--primary,#2563eb) 12%,transparent);white-space:pre-wrap;word-break:break-word;'
                : 'background:color-mix(in srgb,var(--muted,#f1f5f9) 55%,transparent);width:100%;');
        if (msg.role === 'assistant' && md && typeof md.markdownToHtml === 'function') {
            bubble.innerHTML = md.markdownToHtml(msg.content || '');
            if (md.PROSE_ATTR) bubble.setAttribute(md.PROSE_ATTR, '');
        } else {
            bubble.textContent = msg.displayContent != null ? String(msg.displayContent) : (msg.content || '');
        }
        if (msg.streaming) bubble.setAttribute('data-wf-streaming', '1');
        row.appendChild(label);
        row.appendChild(bubble);
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.innerHTML = aiChatCopyIconSvg();
        copyBtn.title = 'Copy message as Markdown';
        copyBtn.setAttribute('aria-label', 'Copy message as Markdown');
        copyBtn.className = Context.uiLib && typeof Context.uiLib.btnClass === 'function'
            ? Context.uiLib.btnClass('basic', 'icon')
            : 'wf-dash-btn wf-dash-btn--basic wf-dash-btn--icon';
        copyBtn.addEventListener('click', async () => {
            const markdown = String(msg.content || '');
            try {
                if (!markdown) throw new Error('Message is empty');
                await navigator.clipboard.writeText(markdown);
                if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(copyBtn);
                Logger.log(o.logTag + ': copied chat message (' + markdown.length + ' chars)');
            } catch (err) {
                if (Context.buttonFeedback) Context.buttonFeedback.flashFailure(copyBtn);
                Logger.error(o.logTag + ': failed to copy chat message', err);
            }
        });
        row.appendChild(copyBtn);
        list.appendChild(row);
    });
    list.scrollTop = list.scrollHeight;
}

function aiChatUpdateStreamingBubble(root, state, content, opts) {
    const o = aiChatResolveOpts(opts);
    if (!state || !state.messages || !state.messages.length) return;
    const idx = state.messages.length - 1;
    const msg = state.messages[idx];
    if (!msg || msg.role !== 'assistant') return;
    msg.content = content;
    const bubble = root && root.querySelector('[data-wf-chat-bubble="' + idx + '"]');
    if (!bubble) {
        aiChatRenderMessages(root, state, o);
        return;
    }
    const md = Context.userStoryMarkdown;
    if (md && typeof md.markdownToHtml === 'function') {
        bubble.innerHTML = md.markdownToHtml(content || '');
        if (md.PROSE_ATTR) bubble.setAttribute(md.PROSE_ATTR, '');
    } else {
        bubble.textContent = content || '';
    }
    const list = aiChatQuery(root, o.messagesSelector);
    if (list) list.scrollTop = list.scrollHeight;
}

function aiChatSetStreamingUi(root, state, streaming, opts) {
    const o = aiChatResolveOpts(opts);
    if (state) state.streaming = !!streaming;
    const sendBtn = aiChatQuery(root, o.sendSelector);
    const stopBtn = aiChatQuery(root, o.stopSelector);
    const input = aiChatQuery(root, o.inputSelector);
    if (sendBtn) sendBtn.disabled = !!streaming;
    if (stopBtn) stopBtn.style.display = streaming ? '' : 'none';
    if (input) input.disabled = !!streaming;
}

function aiChatStopStream(state, opts) {
    const o = aiChatResolveOpts(opts);
    if (!state) return;
    state.streamGen += 1;
    if (state.streamAbort && typeof state.streamAbort.abort === 'function') {
        try { state.streamAbort.abort(); } catch (_e) { /* ignore */ }
    }
    state.streamAbort = null;
    const last = state.messages && state.messages[state.messages.length - 1];
    if (last && last.role === 'assistant' && last.streaming) {
        last.streaming = false;
        if (!last.content) last.content = '(stopped)';
    }
    Logger.log(o.logTag + ': chat stream stopped');
}

/**
 * Stream an OpenRouter completion into the last assistant bubble.
 * Returns the full assistant text.
 */
function aiChatRunStream(root, state, apiMessages, opts) {
    const o = aiChatResolveOpts(opts);
    const ai = Context.aiOpenRouter;
    if (!ai || typeof ai.chatCompletionStream !== 'function') {
        return Promise.reject(new Error('AI OpenRouter API is not available'));
    }
    if (!state) return Promise.reject(new Error('Chat state is missing'));

    state.streamGen += 1;
    const gen = state.streamGen;
    aiChatSetStreamingUi(root, state, true, o);
    let assembled = '';
    let doneMeta = { generationId: null, model: null };

    return new Promise((resolve, reject) => {
        let settled = false;
        const settleOk = (text) => {
            if (settled) return;
            settled = true;
            state.streamAbort = null;
            if (gen === state.streamGen) aiChatSetStreamingUi(root, state, false, o);
            resolve({ text, generationId: doneMeta.generationId, model: doneMeta.model });
        };
        const settleErr = (err) => {
            if (settled) return;
            settled = true;
            state.streamAbort = null;
            if (gen === state.streamGen) aiChatSetStreamingUi(root, state, false, o);
            reject(err);
        };

        Promise.resolve(ai.chatCompletionStream({
            messages: apiMessages,
            onDelta: (delta) => {
                if (gen !== state.streamGen) return;
                assembled += String(delta || '');
                aiChatUpdateStreamingBubble(root, state, assembled, o);
            },
            onDone: (result) => {
                if (result && result.generationId) doneMeta.generationId = String(result.generationId);
                if (result && result.model) doneMeta.model = String(result.model);
                if (gen !== state.streamGen) {
                    settleOk(assembled);
                    return;
                }
                const full = result && result.fullText != null ? String(result.fullText) : assembled;
                assembled = full;
                aiChatUpdateStreamingBubble(root, state, assembled, o);
                settleOk(assembled);
            },
            onError: (err) => {
                settleErr(err instanceof Error ? err : new Error(String(err || 'Stream failed')));
            }
        })).then((handle) => {
            state.streamAbort = handle;
        }).catch((err) => {
            settleErr(err instanceof Error ? err : new Error(String(err || 'Stream failed')));
        });
    });
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
            // Prefer explicit systemContent when provided; skip stored system rows then.
            if (m.role === 'system' && o.systemContent) continue;
            api.push({ role: m.role, content: m.content || '' });
        }
    }
    return api;
}

/**
 * Wire Send / Stop / Enter-to-send on a chat panel.
 * onSend(text) and onStop() are provided by the consumer.
 */
function aiChatWireComposer(root, opts) {
    const o = aiChatResolveOpts(opts);
    const input = aiChatQuery(root, o.inputSelector);
    if (!input || input.getAttribute(o.wiredAttr) === '1') return;
    input.setAttribute(o.wiredAttr, '1');

    const sendBtn = aiChatQuery(root, o.sendSelector);
    const stopBtn = aiChatQuery(root, o.stopSelector);
    const exportBtn = aiChatQuery(root, o.exportSelector);
    const onSend = typeof o.onSend === 'function' ? o.onSend : null;
    const onStop = typeof o.onStop === 'function' ? o.onStop : null;
    const onExport = typeof o.onExport === 'function' ? o.onExport : null;

    if (sendBtn && onSend) {
        sendBtn.addEventListener('click', () => {
            const value = input.value;
            input.value = '';
            void onSend(value);
        });
    }
    if (stopBtn && onStop) {
        stopBtn.addEventListener('click', () => onStop());
        stopBtn.style.display = 'none';
    }
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (onExport) onExport();
            else Logger.warn(o.logTag + ': conversation export handler missing');
        });
    }
    if (onSend) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const value = input.value;
                input.value = '';
                void onSend(value);
            }
        });
    }
}

function aiChatExportConversation(state, opts) {
    const o = aiChatResolveOpts(opts);
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
 * apiMessages may be a full list (including system) or omitted to use buildApiMessages.
 */
async function aiChatSendTurn(root, state, opts) {
    const o = aiChatResolveOpts(opts);
    const userText = opts && opts.userText != null ? String(opts.userText) : '';
    const userContent = opts && opts.userContent != null ? String(opts.userContent) : userText;
    const displayContent = opts && opts.displayContent != null ? opts.displayContent : null;
    const hideInUi = !!(opts && opts.hideInUi);
    const systemContent = opts && opts.systemContent != null ? opts.systemContent : null;
    const apiMessagesOverride = opts && opts.apiMessages;

    if (state.streaming) return null;
    if (!userContent.trim() && !apiMessagesOverride) return null;

    if (userContent) {
        const userMsg = { role: 'user', content: userContent };
        if (displayContent != null) userMsg.displayContent = displayContent;
        if (hideInUi) userMsg.hideInUi = true;
        state.messages.push(userMsg);
    }
    state.messages.push({ role: 'assistant', content: '', streaming: true });
    aiChatRenderMessages(root, state, o);

    const apiMessages = apiMessagesOverride
        || aiChatBuildApiMessages(state, { systemContent });

    try {
        const result = await aiChatRunStream(root, state, apiMessages, o);
        const full = result && typeof result === 'object' ? (result.text || '') : String(result || '');
        const generationId = result && typeof result === 'object' ? (result.generationId || null) : null;
        const model = result && typeof result === 'object' ? (result.model || null) : null;
        state.lastGenerationId = generationId;
        state.lastModel = model;
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === 'assistant') {
            last.content = full || '';
            last.streaming = false;
        }
        aiChatRenderMessages(root, state, o);
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
        aiChatRenderMessages(root, state, o);
        Logger.error(o.logTag + ': chat failed: ' + ((err && err.message) || err));
        throw err;
    }
}

const AiChatApi = {
    VERSION: AI_CHAT_VERSION,
    hasAiKey: aiChatHasKey,
    createState: aiChatCreateState,
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
    description: 'Shared OpenRouter chat transcript UI and streaming controller',
    _version: '1.3',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.aiChat = AiChatApi;
        if (!state.registered) {
            Logger.log(PLUGIN_ID + ': module registered (Context.aiChat) v' + AI_CHAT_VERSION);
            state.registered = true;
        }
    }
};
