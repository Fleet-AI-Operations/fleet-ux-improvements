// ============= dashboard-settings.js =============
// Settings tab for the Ops dashboard (AI Integration / OpenRouter).
//
// AI gating rule: OpenRouter-dependent chat UI stays visible without a key and
// shows the shared no-key gate (greyed input + centered message). Actual API
// calls still require a stored key record (enc + last4) and Ops unlock to
// decrypt via Context.aiOpenRouter.resolveApiKey().

const DASH_SETTINGS_CONTENT_MAX_WIDTH_PX = 640;
const AI_OPENROUTER_KEY_STORAGE_KEY = 'fleet-ux:ai-openrouter-key';
const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_GENERATION_CONTENT_URL = 'https://openrouter.ai/api/v1/generation/content';
const OPENROUTER_TEST_PROMPT = 'What model are you? Reply with just the model name.';
const OPENROUTER_KEY_PREFIX = 'sk-or-';
const PLUGIN_ID = 'dashboard-settings';

function dashSettingsEscHtml(value) {
    const lib = Context.dashboardLib;
    if (lib && typeof lib.escHtml === 'function') return lib.escHtml(value);
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function dashSettingsBtnClass(variant, size) {
    if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
        return Context.uiLib.btnClass(variant, size);
    }
    const loader = Context.dashboard && Context.dashboard._loader;
    if (loader && typeof loader.dashBtnClass === 'function') {
        return loader.dashBtnClass(variant, size);
    }
    return 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size;
}

function dashSettingsInputStyle() {
    const loader = Context.dashboard && Context.dashboard._loader;
    if (loader && typeof loader._inputStyle === 'function') return loader._inputStyle();
    return 'width: 100%; padding: 7px 10px; font-size: 12px; border: 1px solid var(--input, #cbd5e1); border-radius: 6px; background: var(--background, #fff); color: var(--foreground, #0f172a); box-sizing: border-box;';
}

function dashSettingsHintStyle() {
    const loader = Context.dashboard && Context.dashboard._loader;
    if (loader && typeof loader._hintStyle === 'function') return loader._hintStyle();
    return 'font-size: 11px; font-weight: 400; color: var(--muted-foreground, #64748b); letter-spacing: -0.01em;';
}

function dashSettingsLabelStyle() {
    const loader = Context.dashboard && Context.dashboard._loader;
    if (loader && typeof loader._labelStyle === 'function') return loader._labelStyle();
    return 'font-size: 11px; font-weight: 500; color: var(--muted-foreground, #64748b); letter-spacing: -0.01em;';
}

function readOpenRouterKeyRecord() {
    try {
        const raw = Storage.getData(AI_OPENROUTER_KEY_STORAGE_KEY, null);
        if (!raw) return null;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || typeof parsed !== 'object') return null;
        const enc = typeof parsed.enc === 'string' ? parsed.enc : '';
        const last4 = typeof parsed.last4 === 'string' ? parsed.last4 : '';
        if (!enc || !last4) return null;
        return { enc, last4 };
    } catch (err) {
        Logger.warn(PLUGIN_ID + ': failed to read OpenRouter key record', err);
        return null;
    }
}

function writeOpenRouterKeyRecord(record) {
    Storage.setData(AI_OPENROUTER_KEY_STORAGE_KEY, JSON.stringify(record));
}

function clearOpenRouterKeyRecord() {
    Storage.deleteData(AI_OPENROUTER_KEY_STORAGE_KEY);
}

function hasOpsPassword() {
    return !!(Context.opsTab && typeof Context.opsTab.hasStoredPassword === 'function'
        && Context.opsTab.hasStoredPassword());
}

function maskKeyLast4(last4) {
    const safe = String(last4 || '').replace(/[^a-zA-Z0-9]/g, '').slice(-4);
    return '••••••••' + (safe || '????');
}

function hasStoredOpenRouterKey() {
    return !!readOpenRouterKeyRecord();
}

async function resolveOpenRouterApiKey() {
    const record = readOpenRouterKeyRecord();
    if (!record) return null;
    if (!Context.opsTab || typeof Context.opsTab.decryptWithOpsPassword !== 'function') {
        throw new Error('Ops crypto is not available');
    }
    if (!hasOpsPassword()) {
        throw new Error('Unlock Ops to use the OpenRouter API key');
    }
    const apiKey = await Context.opsTab.decryptWithOpsPassword(record.enc);
    if (!apiKey) throw new Error('Decrypted OpenRouter key was empty');
    return apiKey;
}

function openRouterChatCompletion(apiKey, messages) {
    return new Promise((resolve, reject) => {
        if (typeof GM_xmlhttpRequest !== 'function') {
            reject(new Error('GM_xmlhttpRequest unavailable'));
            return;
        }
        GM_xmlhttpRequest({
            method: 'POST',
            url: OPENROUTER_CHAT_COMPLETIONS_URL,
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + apiKey,
                'HTTP-Referer': 'https://www.fleetai.com/',
                'X-Title': 'Fleet UX Enhancer'
            },
            data: JSON.stringify({ messages }),
            onload: (response) => {
                resolve({
                    status: response.status,
                    responseText: response.responseText || ''
                });
            },
            onerror: () => {
                reject(new Error('Network error contacting OpenRouter'));
            },
            ontimeout: () => {
                reject(new Error('OpenRouter request timed out'));
            }
        });
    });
}

/**
 * Parse a header value from GM_xmlhttpRequest responseHeaders (CRLF-separated).
 */
function openRouterHeaderValue(responseHeaders, name) {
    const raw = String(responseHeaders || '');
    if (!raw || !name) return '';
    const want = String(name).toLowerCase();
    const lines = raw.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const idx = line.indexOf(':');
        if (idx < 0) continue;
        if (line.slice(0, idx).trim().toLowerCase() !== want) continue;
        return line.slice(idx + 1).trim();
    }
    return '';
}

/**
 * Prefer OpenRouter generation ids (`gen-…`) over chat-completion-style ids.
 */
function openRouterPreferGenerationId(candidate, current) {
    const next = String(candidate || '').trim();
    if (!next) return current || '';
    const cur = String(current || '').trim();
    if (next.indexOf('gen-') === 0) return next;
    if (cur.indexOf('gen-') === 0) return cur;
    return cur || next;
}

/**
 * Fetch stored prompt + completion for a generation (requires Input & Output Logging).
 * Returns { input, output } from the OpenRouter generation content payload.
 */
function openRouterGenerationContent(apiKey, generationId) {
    const id = String(generationId || '').trim();
    if (!id) return Promise.reject(new Error('Generation id is required'));
    return new Promise((resolve, reject) => {
        if (typeof GM_xmlhttpRequest !== 'function') {
            reject(new Error('GM_xmlhttpRequest unavailable'));
            return;
        }
        GM_xmlhttpRequest({
            method: 'GET',
            url: OPENROUTER_GENERATION_CONTENT_URL + '?id=' + encodeURIComponent(id),
            headers: {
                Authorization: 'Bearer ' + apiKey,
                'HTTP-Referer': 'https://www.fleetai.com/',
                'X-Title': 'Fleet UX Enhancer'
            },
            onload: (response) => {
                const status = response.status;
                const text = response.responseText || '';
                let apiMessage = '';
                try {
                    const parsedErr = JSON.parse(text);
                    apiMessage = parsedErr && parsedErr.error && parsedErr.error.message
                        ? String(parsedErr.error.message)
                        : '';
                } catch (_e) { /* ignore */ }
                if (status === 404) {
                    reject(new Error(
                        'Generation content not found for id ' + id
                        + (apiMessage ? ' — ' + apiMessage : '')
                        + '. Enable Input & Output Logging in OpenRouter Observability, then start a new chat'
                        + ' (ids captured before this fix, or before logging was on, cannot be hydrated).'
                    ));
                    return;
                }
                if (status === 401 || status === 403) {
                    reject(new Error(
                        'Key rejected by OpenRouter (HTTP ' + status + ')'
                        + (apiMessage ? ' — ' + apiMessage : '')
                        + ' for generation ' + id
                    ));
                    return;
                }
                if (status < 200 || status >= 300) {
                    reject(new Error(
                        'OpenRouter generation content error (HTTP ' + status + ')'
                        + (apiMessage ? ' — ' + apiMessage : '')
                        + ' for generation ' + id
                    ));
                    return;
                }
                let parsed;
                try {
                    parsed = JSON.parse(text);
                } catch (err) {
                    reject(new Error('OpenRouter generation content was not valid JSON'));
                    return;
                }
                const data = parsed && parsed.data != null ? parsed.data : parsed;
                if (!data || typeof data !== 'object') {
                    reject(new Error('OpenRouter generation content payload was empty'));
                    return;
                }
                resolve({
                    input: data.input != null ? data.input : null,
                    output: data.output != null ? data.output : null,
                    raw: data,
                });
            },
            onerror: () => reject(new Error('Network error contacting OpenRouter')),
            ontimeout: () => reject(new Error('OpenRouter request timed out')),
        });
    });
}

/**
 * Merge streamed tool_call deltas into an array keyed by index.
 * @param {object[]} acc
 * @param {object[]} deltas
 */
function openRouterAccumulateToolCallDeltas(acc, deltas) {
    if (!Array.isArray(deltas) || !deltas.length) return;
    for (let i = 0; i < deltas.length; i++) {
        const d = deltas[i];
        if (!d || typeof d !== 'object') continue;
        const idx = Number.isFinite(d.index) ? d.index : i;
        while (acc.length <= idx) {
            acc.push({
                id: '',
                type: 'function',
                function: { name: '', arguments: '' },
            });
        }
        const slot = acc[idx];
        if (d.id != null && String(d.id).trim()) slot.id = String(d.id).trim();
        if (d.type != null) slot.type = String(d.type);
        const fn = d.function;
        if (fn && typeof fn === 'object') {
            if (fn.name != null && String(fn.name)) {
                slot.function.name = String(fn.name);
            }
            if (fn.arguments != null) {
                slot.function.arguments += String(fn.arguments);
            }
        }
    }
}

/**
 * Normalize accumulated tool call slots into OpenAI-shaped tool_calls.
 * @param {object[]} acc
 * @returns {object[]}
 */
function openRouterFinalizeToolCalls(acc) {
    if (!Array.isArray(acc) || !acc.length) return [];
    const out = [];
    for (let i = 0; i < acc.length; i++) {
        const slot = acc[i];
        if (!slot || !slot.function) continue;
        const name = String(slot.function.name || '').trim();
        if (!name && !String(slot.function.arguments || '').trim()) continue;
        out.push({
            id: String(slot.id || ('call_' + i)).trim() || ('call_' + i),
            type: slot.type || 'function',
            function: {
                name: name || 'unknown',
                arguments: String(slot.function.arguments || ''),
            },
        });
    }
    return out;
}

/**
 * Stream an OpenRouter chat completion (SSE). Calls onDelta(textChunk) as content
 * arrives, then onDone({ fullText, toolCalls, finishReason, model, generationId }).
 * Abort via returned { abort }.
 *
 * @param {string} apiKey
 * @param {object[]} messages
 * @param {{ onDelta?: Function, onDone?: Function, onError?: Function }} callbacks
 * @param {{ tools?: object[], tool_choice?: *, model?: string, max_tokens?: number, parallel_tool_calls?: boolean }} [requestOpts]
 */
function openRouterChatCompletionStream(apiKey, messages, callbacks, requestOpts) {
    const onDelta = callbacks && typeof callbacks.onDelta === 'function' ? callbacks.onDelta : null;
    const onDone = callbacks && typeof callbacks.onDone === 'function' ? callbacks.onDone : null;
    const onError = callbacks && typeof callbacks.onError === 'function' ? callbacks.onError : null;
    const reqOpts = requestOpts && typeof requestOpts === 'object' ? requestOpts : {};

    if (typeof GM_xmlhttpRequest !== 'function') {
        if (onError) onError(new Error('GM_xmlhttpRequest unavailable'));
        return { abort() {} };
    }

    let aborted = false;
    let processedLen = 0;
    let lineBuf = '';
    let rawAll = '';
    let fullText = '';
    let model = '';
    let generationId = '';
    let finishReason = null;
    const toolCallAcc = [];
    let finished = false;
    let usingReader = false;
    let streamReader = null;
    let req = null;

    const releaseRequest = () => {
        try {
            if (streamReader && typeof streamReader.cancel === 'function') {
                streamReader.cancel().catch(() => {});
            }
        } catch (_e) { /* ignore */ }
        streamReader = null;
        try {
            if (req && typeof req.abort === 'function') req.abort();
        } catch (_e) { /* ignore */ }
    };

    const finishOk = () => {
        if (finished || aborted) return;
        finished = true;
        const toolCalls = openRouterFinalizeToolCalls(toolCallAcc);
        if (onDone) {
            onDone({
                fullText,
                toolCalls,
                finishReason: finishReason || (toolCalls.length ? 'tool_calls' : 'stop'),
                model,
                generationId: generationId || null,
            });
        }
        // Release the HTTP stream so the next tool round can open a new request.
        releaseRequest();
    };

    const fail = (err) => {
        if (finished || aborted) return;
        finished = true;
        if (onError) onError(err instanceof Error ? err : new Error(String(err || 'Request failed')));
        releaseRequest();
    };

    const consumeSseBlock = (block) => {
        const lines = String(block || '').split('\n');
        for (const rawLine of lines) {
            const line = rawLine.replace(/\r$/, '');
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            if (payload === '[DONE]') {
                finishOk();
                return;
            }
            let parsed;
            try {
                parsed = JSON.parse(payload);
            } catch (_e) {
                continue;
            }
            if (parsed && parsed.id != null) {
                generationId = openRouterPreferGenerationId(parsed.id, generationId);
            }
            if (parsed && parsed.model != null && !model) model = String(parsed.model);
            const choice = parsed && parsed.choices && parsed.choices[0]
                ? parsed.choices[0]
                : null;
            const deltaObj = choice && choice.delta ? choice.delta : null;
            const delta = deltaObj && deltaObj.content != null
                ? String(deltaObj.content)
                : '';
            if (delta) {
                fullText += delta;
                if (onDelta) onDelta(delta);
            }
            if (deltaObj && Array.isArray(deltaObj.tool_calls)) {
                openRouterAccumulateToolCallDeltas(toolCallAcc, deltaObj.tool_calls);
            }
            if (choice && choice.finish_reason) {
                finishReason = String(choice.finish_reason);
                finishOk();
            }
        }
    };

    const ingestRaw = (added) => {
        if (aborted || finished || !added) return;
        rawAll += added;
        lineBuf += added;
        const parts = lineBuf.split('\n\n');
        lineBuf = parts.pop() || '';
        for (const part of parts) consumeSseBlock(part);
    };

    const ingestChunk = (text) => {
        if (aborted || finished) return;
        const raw = String(text || '');
        if (raw.length <= processedLen) return;
        const added = raw.slice(processedLen);
        processedLen = raw.length;
        ingestRaw(added);
    };

    const flushAndFinish = () => {
        if (aborted || finished) return;
        if (lineBuf.trim()) consumeSseBlock(lineBuf);
        lineBuf = '';
        if (!fullText && rawAll.trim().startsWith('{')) {
            // Non-SSE body: likely a JSON error payload from OpenRouter.
            try {
                const parsed = JSON.parse(rawAll);
                const message = parsed && parsed.error && parsed.error.message;
                if (message) {
                    fail(new Error('OpenRouter error: ' + message));
                    return;
                }
            } catch (_e) { /* fall through */ }
        }
        finishOk();
    };

    // MV3 Tampermonkey buffers responses, so onprogress never yields partial
    // responseText. responseType 'stream' exposes a ReadableStream in
    // onloadstart for true incremental delivery; onprogress remains as the
    // fallback for managers without stream support.
    const body = { messages, stream: true };
    if (Array.isArray(reqOpts.tools) && reqOpts.tools.length) {
        body.tools = reqOpts.tools;
    }
    if (reqOpts.tool_choice != null) {
        body.tool_choice = reqOpts.tool_choice;
    }
    if (reqOpts.model != null && String(reqOpts.model).trim()) {
        body.model = String(reqOpts.model).trim();
    }
    if (Number.isFinite(reqOpts.max_tokens) && reqOpts.max_tokens > 0) {
        body.max_tokens = Math.floor(reqOpts.max_tokens);
    }
    if (typeof reqOpts.parallel_tool_calls === 'boolean') {
        body.parallel_tool_calls = reqOpts.parallel_tool_calls;
    }

    req = GM_xmlhttpRequest({
        method: 'POST',
        url: OPENROUTER_CHAT_COMPLETIONS_URL,
        responseType: 'stream',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apiKey,
            'HTTP-Referer': 'https://www.fleetai.com/',
            'X-Title': 'Fleet UX Enhancer',
            Accept: 'text/event-stream'
        },
        data: JSON.stringify(body),
        onloadstart: (response) => {
            if (aborted || finished) return;
            const headerGen = openRouterHeaderValue(response && response.responseHeaders, 'X-Generation-Id');
            if (headerGen) generationId = openRouterPreferGenerationId(headerGen, generationId);
            const body = response && response.response;
            if (!body || typeof body.getReader !== 'function') return;
            usingReader = true;
            const reader = body.getReader();
            streamReader = reader;
            const decoder = new TextDecoder();
            const pump = () => {
                reader.read().then(({ done, value }) => {
                    if (aborted || finished) return;
                    if (done) {
                        ingestRaw(decoder.decode());
                        flushAndFinish();
                        return;
                    }
                    ingestRaw(decoder.decode(value, { stream: true }));
                    pump();
                }).catch((err) => {
                    if (!aborted && !finished) fail(err);
                });
            };
            pump();
        },
        onprogress: (response) => {
            if (aborted || usingReader) return;
            const headerGen = openRouterHeaderValue(response && response.responseHeaders, 'X-Generation-Id');
            if (headerGen) generationId = openRouterPreferGenerationId(headerGen, generationId);
            if (response.status && (response.status < 200 || response.status >= 300)) {
                // Wait for onload for full error body when possible.
                return;
            }
            ingestChunk(response.responseText || '');
        },
        onload: (response) => {
            if (aborted) return;
            const headerGen = openRouterHeaderValue(response && response.responseHeaders, 'X-Generation-Id');
            if (headerGen) generationId = openRouterPreferGenerationId(headerGen, generationId);
            if (response.status === 401 || response.status === 403) {
                fail(new Error('Key rejected by OpenRouter (HTTP ' + response.status + ')'));
                return;
            }
            if (response.status < 200 || response.status >= 300) {
                fail(new Error('OpenRouter error (HTTP ' + response.status + ')'));
                return;
            }
            if (usingReader) {
                // Reader path finishes via flushAndFinish; still keep header id.
                return;
            }
            ingestChunk(response.responseText || '');
            flushAndFinish();
        },
        onerror: () => fail(new Error('Network error contacting OpenRouter')),
        ontimeout: () => fail(new Error('OpenRouter request timed out')),
        onabort: () => {
            aborted = true;
            finished = true;
            streamReader = null;
        }
    });

    return {
        abort() {
            if (aborted) return;
            aborted = true;
            finished = true;
            releaseRequest();
        }
    };
}

function notifyAiKeyConsumers() {
    const modal = document.getElementById('wf-dash-modal')
        || document.querySelector('[data-fleet-dash-modal="1"]')
        || document.body;

    const verifierUi = Context.verifierFetcherUi;
    if (verifierUi && typeof verifierUi.syncAiUi === 'function') {
        try {
            verifierUi.syncAiUi(modal);
        } catch (err) {
            Logger.debug(PLUGIN_ID + ': syncAiUi notify failed', err);
        }
    }

    const dash = Context.dashboard;
    const searchChat = Context.searchOutputChat;
    if (searchChat && typeof searchChat.wirePanel === 'function' && dash) {
        try {
            const panel = modal && modal.querySelector('[data-wf-dash-search-chat-panel]');
            if (panel) searchChat.wirePanel(panel, dash);
        } catch (err) {
            Logger.debug(PLUGIN_ID + ': search chat key notify failed', err);
        }
    }

    const chatsApi = Context.dashboardChats;
    if (chatsApi && typeof chatsApi.syncPanel === 'function') {
        try {
            const panel = modal && modal.querySelector('[data-wf-dash-chats-panel]');
            if (panel) chatsApi.syncPanel(panel);
        } catch (err) {
            Logger.debug(PLUGIN_ID + ': chats key notify failed', err);
        }
    }

    const explain = Context.ratingExplain;
    if (explain && typeof explain.remountOpen === 'function') {
        try {
            explain.remountOpen(modal);
        } catch (err) {
            Logger.debug(PLUGIN_ID + ': rating explain key notify failed', err);
        }
    }
}

function getAiSectionRoot(modal) {
    return modal ? modal.querySelector('#wf-dash-settings-ai-section') : null;
}

function setAiStatus(modal, message, isError) {
    const el = modal && modal.querySelector('#wf-dash-settings-ai-status');
    if (!el) return;
    const text = String(message || '').trim();
    if (!text) {
        el.style.display = 'none';
        el.textContent = '';
        el.style.color = '';
        return;
    }
    el.style.display = 'block';
    el.textContent = text;
    el.style.color = isError ? 'var(--destructive, #dc2626)' : 'var(--muted-foreground, #64748b)';
}

function setTestResult(modal, opts) {
    const box = modal && modal.querySelector('#wf-dash-settings-ai-test-result');
    if (!box) return;
    const reply = opts && opts.reply != null ? String(opts.reply) : '';
    const model = opts && opts.model != null ? String(opts.model) : '';
    const error = opts && opts.error != null ? String(opts.error) : '';
    if (!reply && !model && !error) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
    }
    box.style.display = 'flex';
    const parts = [];
    if (error) {
        parts.push(
            '<div style="color: var(--destructive, #dc2626);">'
            + dashSettingsEscHtml(error)
            + '</div>'
        );
    } else {
        if (model) {
            parts.push(
                '<div style="' + dashSettingsLabelStyle() + '">Response model</div>'
                + '<div style="font-size: 12px; color: var(--foreground, #0f172a); word-break: break-word;">'
                + dashSettingsEscHtml(model)
                + '</div>'
            );
        }
        if (reply) {
            parts.push(
                '<div style="' + dashSettingsLabelStyle() + '; margin-top: 6px;">Assistant</div>'
                + '<div style="font-size: 12px; color: var(--foreground, #0f172a); white-space: pre-wrap; word-break: break-word;">'
                + dashSettingsEscHtml(reply)
                + '</div>'
            );
        }
    }
    box.innerHTML = parts.join('');
}

function renderAiSection(modal, options) {
    const root = getAiSectionRoot(modal);
    if (!root) return;
    const forceEntry = !!(options && options.forceEntry);
    const record = readOpenRouterKeyRecord();
    const opsReady = hasOpsPassword();
    const hintStyle = dashSettingsHintStyle();
    const labelStyle = dashSettingsLabelStyle();
    const inputStyle = dashSettingsInputStyle();
    const spinnerHtml = Context.uiLib && typeof Context.uiLib.spinnerHtml === 'function'
        ? Context.uiLib.spinnerHtml(14)
        : '';

    if (!opsReady) {
        root.innerHTML = ''
            + '<p style="' + hintStyle + ' margin: 0; line-height: 1.45;">'
            + 'Unlock Ops with your password before saving an OpenRouter API key.'
            + '</p>';
        return;
    }

    const showEntry = forceEntry || !record;
    let body = '';
    if (showEntry) {
        body += ''
            + '<label for="wf-dash-settings-ai-key-input" style="' + labelStyle + ' display: block; margin-bottom: 6px;">'
            + 'OpenRouter API key'
            + '</label>'
            + '<div style="display: flex; gap: 8px; align-items: stretch;">'
            + '<input type="password" id="wf-dash-settings-ai-key-input" autocomplete="off" '
            + 'placeholder="sk-or-…" style="' + inputStyle + ' flex: 1; min-width: 0;">'
            + '<button type="button" id="wf-dash-settings-ai-key-save" class="'
            + dashSettingsBtnClass('primary', 'regular') + '" style="flex-shrink: 0;">Save</button>'
            + (record
                ? '<button type="button" id="wf-dash-settings-ai-key-cancel" class="'
                    + dashSettingsBtnClass('basic', 'regular') + '" style="flex-shrink: 0;">Cancel</button>'
                : '')
            + '</div>'
            + '<p style="' + hintStyle + ' margin: 8px 0 0 0; line-height: 1.45;">'
            + 'Stored encrypted with your Ops password. Only the last 4 characters are shown after save.'
            + '</p>';
    } else {
        body += ''
            + '<div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">'
            + '<div style="font-size: 12px; color: var(--foreground, #0f172a); font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);">'
            + 'Key: ' + dashSettingsEscHtml(maskKeyLast4(record.last4))
            + '</div>'
            + '<button type="button" id="wf-dash-settings-ai-key-replace" class="'
            + dashSettingsBtnClass('basic', 'compact') + '">Replace</button>'
            + '<button type="button" id="wf-dash-settings-ai-key-remove" class="'
            + dashSettingsBtnClass('basic', 'compact') + '">Remove</button>'
            + '</div>';
    }

    body += ''
        + '<div style="margin-top: 16px; padding-top: 14px; '
        + 'display: flex; flex-direction: column; gap: 8px;">'
        + '<div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">'
        + '<button type="button" id="wf-dash-settings-ai-test-btn" class="'
        + dashSettingsBtnClass('secondary', 'regular') + '"'
        + (record && !showEntry ? '' : ' disabled')
        + '>Test connection</button>'
        + '<span id="wf-dash-settings-ai-test-spinner" style="display: none; align-items: center;">'
        + spinnerHtml
        + '</span>'
        + '</div>'
        + '<p style="' + hintStyle + ' margin: 0; line-height: 1.45;">'
        + 'Sends a short hello-world prompt asking the model to identify itself. Uses your OpenRouter account default model.'
        + '</p>'
        + '<div id="wf-dash-settings-ai-test-result" style="display: none; flex-direction: column; gap: 2px; '
        + 'padding: 10px 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 8px; '
        + 'background: var(--muted, #f8fafc);"></div>'
        + '</div>'
        + '<div id="wf-dash-settings-ai-status" style="display: none; margin-top: 10px; '
        + hintStyle + ' line-height: 1.45;"></div>';

    if (Context.searchOutputChat
        && typeof Context.searchOutputChat.settingsFieldsHtml === 'function') {
        body += Context.searchOutputChat.settingsFieldsHtml(
            Context.searchOutputChat.getSettings()
        );
    }

    root.innerHTML = body;
}

async function saveOpenRouterKey(modal) {
    const input = modal.querySelector('#wf-dash-settings-ai-key-input');
    const saveBtn = modal.querySelector('#wf-dash-settings-ai-key-save');
    if (!input) return;
    const key = String(input.value || '').trim();
    if (!key) {
        setAiStatus(modal, 'Enter an OpenRouter API key.', true);
        if (Context.buttonFeedback && saveBtn) Context.buttonFeedback.flashFailure(saveBtn);
        return;
    }
    if (!key.startsWith(OPENROUTER_KEY_PREFIX) || key.length < OPENROUTER_KEY_PREFIX.length + 8) {
        setAiStatus(modal, 'Key should start with sk-or- and look like an OpenRouter key.', true);
        if (Context.buttonFeedback && saveBtn) Context.buttonFeedback.flashFailure(saveBtn);
        return;
    }
    if (!Context.opsTab || typeof Context.opsTab.encryptWithOpsPassword !== 'function') {
        setAiStatus(modal, 'Ops crypto is not available.', true);
        if (Context.buttonFeedback && saveBtn) Context.buttonFeedback.flashFailure(saveBtn);
        return;
    }
    try {
        const enc = await Context.opsTab.encryptWithOpsPassword(key);
        const last4 = key.slice(-4);
        writeOpenRouterKeyRecord({ enc, last4 });
        input.value = '';
        renderAiSection(modal);
        setAiStatus(modal, 'API key saved.', false);
        Logger.log(PLUGIN_ID + ': OpenRouter API key saved (encrypted)');
        notifyAiKeyConsumers();
        const testBtn = modal.querySelector('#wf-dash-settings-ai-test-btn');
        if (Context.buttonFeedback && testBtn) Context.buttonFeedback.flashSuccess(testBtn);
    } catch (err) {
        Logger.error(PLUGIN_ID + ': failed to encrypt/save OpenRouter key', err);
        setAiStatus(modal, 'Could not encrypt key — is Ops unlocked?', true);
        if (Context.buttonFeedback && saveBtn) Context.buttonFeedback.flashFailure(saveBtn);
    }
}

function removeOpenRouterKey(modal) {
    clearOpenRouterKeyRecord();
    renderAiSection(modal);
    setAiStatus(modal, 'API key removed.', false);
    Logger.log(PLUGIN_ID + ': OpenRouter API key removed');
    notifyAiKeyConsumers();
}

async function runOpenRouterTest(modal) {
    const testBtn = modal.querySelector('#wf-dash-settings-ai-test-btn');
    const spinner = modal.querySelector('#wf-dash-settings-ai-test-spinner');
    const record = readOpenRouterKeyRecord();
    if (!record) {
        setAiStatus(modal, 'Save an OpenRouter API key first.', true);
        if (Context.buttonFeedback && testBtn) Context.buttonFeedback.flashFailure(testBtn);
        return;
    }
    if (!Context.opsTab || typeof Context.opsTab.decryptWithOpsPassword !== 'function') {
        setAiStatus(modal, 'Ops crypto is not available.', true);
        if (Context.buttonFeedback && testBtn) Context.buttonFeedback.flashFailure(testBtn);
        return;
    }

    let apiKey = '';
    try {
        apiKey = await Context.opsTab.decryptWithOpsPassword(record.enc);
    } catch (err) {
        Logger.warn(PLUGIN_ID + ': OpenRouter key decrypt failed — clearing stored record');
        clearOpenRouterKeyRecord();
        renderAiSection(modal, { forceEntry: true });
        setAiStatus(modal, 'Stored key could not be decrypted. Enter the key again.', true);
        return;
    }

    if (!apiKey) {
        clearOpenRouterKeyRecord();
        renderAiSection(modal, { forceEntry: true });
        setAiStatus(modal, 'Decrypted key was empty. Enter the key again.', true);
        return;
    }

    if (testBtn) testBtn.disabled = true;
    if (spinner) spinner.style.display = 'inline-flex';
    setAiStatus(modal, 'Contacting OpenRouter…', false);
    setTestResult(modal, null);

    try {
        const response = await openRouterChatCompletion(apiKey, [
            { role: 'user', content: OPENROUTER_TEST_PROMPT }
        ]);
        apiKey = '';
        if (response.status === 401 || response.status === 403) {
            setTestResult(modal, { error: 'Key rejected by OpenRouter (HTTP ' + response.status + ').' });
            setAiStatus(modal, '', false);
            if (Context.buttonFeedback && testBtn) Context.buttonFeedback.flashFailure(testBtn);
            Logger.log(PLUGIN_ID + ': OpenRouter test failed — key rejected (' + response.status + ')');
            return;
        }
        if (response.status < 200 || response.status >= 300) {
            setTestResult(modal, { error: 'OpenRouter error (HTTP ' + response.status + ').' });
            setAiStatus(modal, '', false);
            if (Context.buttonFeedback && testBtn) Context.buttonFeedback.flashFailure(testBtn);
            Logger.log(PLUGIN_ID + ': OpenRouter test failed — HTTP ' + response.status);
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(response.responseText);
        } catch (_e) {
            setTestResult(modal, { error: 'OpenRouter returned non-JSON response.' });
            setAiStatus(modal, '', false);
            if (Context.buttonFeedback && testBtn) Context.buttonFeedback.flashFailure(testBtn);
            Logger.log(PLUGIN_ID + ': OpenRouter test failed — non-JSON response');
            return;
        }
        const reply = parsed
            && parsed.choices
            && parsed.choices[0]
            && parsed.choices[0].message
            && parsed.choices[0].message.content != null
            ? String(parsed.choices[0].message.content).trim()
            : '';
        const model = parsed && parsed.model != null ? String(parsed.model) : '';
        if (!reply) {
            setTestResult(modal, { error: 'OpenRouter response had no assistant content.', model });
            setAiStatus(modal, '', false);
            if (Context.buttonFeedback && testBtn) Context.buttonFeedback.flashFailure(testBtn);
            Logger.log(PLUGIN_ID + ': OpenRouter test failed — empty assistant content');
            return;
        }
        setTestResult(modal, { reply, model });
        setAiStatus(modal, 'Test succeeded.', false);
        if (Context.buttonFeedback && testBtn) Context.buttonFeedback.flashSuccess(testBtn);
        Logger.log(PLUGIN_ID + ': OpenRouter test succeeded'
            + (model ? ' (model reported)' : ''));
    } catch (err) {
        apiKey = '';
        Logger.error(PLUGIN_ID + ': OpenRouter test request failed', err);
        setTestResult(modal, { error: (err && err.message) || 'Request failed.' });
        setAiStatus(modal, '', false);
        if (Context.buttonFeedback && testBtn) Context.buttonFeedback.flashFailure(testBtn);
    } finally {
        apiKey = '';
        if (spinner) spinner.style.display = 'none';
        if (testBtn) {
            const stillHasKey = !!readOpenRouterKeyRecord();
            testBtn.disabled = !stillHasKey;
        }
    }
}

function dashboardSettingsPanelHtml() {
    const panelScroll = 'flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 14px; '
        + 'display: flex; flex-direction: column; gap: 12px;';
    const hintStyle = dashSettingsHintStyle();
    const dividerHtml = '<hr style="width: 100%; margin: 0; border: none; '
        + 'border-top: 1px solid var(--border, #e2e8f0);">';
    return ''
        + '<div id="wf-dash-settings-panel" style="' + panelScroll + '" data-fleet-dash-settings="1">'
        + '<div id="wf-dash-settings-content" style="display: flex; flex-direction: column; gap: 16px; '
        + 'width: 100%; max-width: ' + DASH_SETTINGS_CONTENT_MAX_WIDTH_PX + 'px; margin: 0 auto; box-sizing: border-box;">'
        + '<section aria-labelledby="wf-dash-settings-tabs-heading" style="display: flex; flex-direction: column; gap: 10px;">'
        + '<h3 id="wf-dash-settings-tabs-heading" style="font-size: 14px; font-weight: 600; margin: 0; color: var(--foreground, #0f172a);">'
        + 'Dashboard Tabs'
        + '</h3>'
        + '<p style="' + hintStyle + ' margin: 0; line-height: 1.45;">'
        + 'Choose the order of tabs in the dashboard header.'
        + '</p>'
        + '<div id="wf-dash-settings-tab-order"></div>'
        + '</section>'
        + dividerHtml
        + '<section aria-labelledby="wf-dash-settings-search-output-heading" style="display: flex; flex-direction: column; gap: 10px;">'
        + '<h3 id="wf-dash-settings-search-output-heading" style="font-size: 14px; font-weight: 600; margin: 0; color: var(--foreground, #0f172a);">'
        + 'Search Output'
        + '</h3>'
        + '<p style="' + hintStyle + ' margin: 0; line-height: 1.45;">'
        + 'Choose which right sidebar pane opens by default.'
        + '</p>'
        + '<div id="wf-dash-settings-default-stats-tab"></div>'
        + '</section>'
        + dividerHtml
        + '<section aria-labelledby="wf-dash-settings-ai-heading" style="display: flex; flex-direction: column; gap: 10px;">'
        + '<h3 id="wf-dash-settings-ai-heading" style="font-size: 14px; font-weight: 600; margin: 0; color: var(--foreground, #0f172a);">'
        + 'AI Integration'
        + '</h3>'
        + '<p style="' + hintStyle + ' margin: 0; line-height: 1.45;">'
        + 'Connect your own OpenRouter API key. Requests go directly to OpenRouter. '
        + '<a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer" '
        + 'data-wf-dash-openrouter-link style="color: var(--primary, #2563eb);">Visit OpenRouter</a>.'
        + '</p>'
        + '<p style="' + hintStyle + ' margin: 0; line-height: 1.45;">'
        + 'To retrieve and show previous chats in the Chats pane, prompt logging must be enabled '
        + 'in your OpenRouter account. You can toggle it in '
        + '<a href="https://openrouter.ai/workspaces/default/observability" target="_blank" rel="noopener noreferrer" '
        + 'data-wf-dash-openrouter-link style="color: var(--primary, #2563eb);">OpenRouter observability settings</a>.'
        + '</p>'
        + '<div id="wf-dash-settings-ai-section"></div>'
        + '</section>'
        + '</div>'
        + '</div>';
}

function dashboardTabOrderHtml() {
    const dashboard = Context.dashboard;
    const tabs = dashboard && typeof dashboard.getTabs === 'function' ? dashboard.getTabs() : [];
    const defaultTabId = dashboard && typeof dashboard.getDefaultTabId === 'function'
        ? dashboard.getDefaultTabId()
        : 'search-output';
    const moveBtnClass = dashSettingsBtnClass('basic', 'nav');
    const rows = tabs.map((tab, index) => {
        const id = dashSettingsEscHtml(tab.id);
        const label = dashSettingsEscHtml(tab.label || tab.id);
        return ''
            + '<div style="display: flex; align-items: center; gap: 8px; padding: 5px 0;">'
            + '<span role="group" aria-label="Reorder ' + label + '" style="display: inline-flex; gap: 4px;">'
            + '<button type="button" data-wf-dash-tab-move-up="' + id + '" class="' + moveBtnClass
            + '" title="Move up" aria-label="Move ' + label + ' up"'
            + (index > 0 ? '' : ' disabled') + '>↑</button>'
            + '<button type="button" data-wf-dash-tab-move-down="' + id + '" class="' + moveBtnClass
            + '" title="Move down" aria-label="Move ' + label + ' down"'
            + (index < tabs.length - 1 ? '' : ' disabled') + '>↓</button>'
            + '</span>'
            + '<span style="font-size: 12px; color: var(--foreground, #0f172a);">' + label + '</span>'
            + '<label style="display: inline-flex; align-items: center; gap: 6px; margin-left: auto; '
            + 'font-size: 11px; color: var(--muted-foreground, #64748b); cursor: pointer;">'
            + '<input type="checkbox" data-wf-dash-default-tab="' + id + '"'
            + (tab.id === defaultTabId ? ' checked' : '') + '>'
            + '<span>Default</span>'
            + '</label>'
            + '</div>';
    }).join('');
    return ''
        + '<div style="display: flex; flex-direction: column;">' + rows + '</div>'
        + '<div style="margin-top: 8px;">'
        + '<button type="button" data-wf-dash-tab-order-reset class="' + dashSettingsBtnClass('basic', 'compact') + '">'
        + 'Reset tab order'
        + '</button>'
        + '</div>';
}

function renderDashboardTabOrder(modal) {
    const root = modal && modal.querySelector('#wf-dash-settings-tab-order');
    if (root) root.innerHTML = dashboardTabOrderHtml();
}

function defaultStatsTabOptions() {
    return [
        { id: 'stats', label: 'Stats' },
        { id: 'ratings', label: 'Ratings' },
        { id: 'chat', label: 'Chat' },
    ];
}

function dashboardDefaultStatsTabHtml() {
    const dashboard = Context.dashboard;
    const selected = dashboard && typeof dashboard.getDefaultStatsTabId === 'function'
        ? dashboard.getDefaultStatsTabId()
        : 'stats';
    const inputStyle = dashSettingsInputStyle();
    const options = defaultStatsTabOptions().map((opt) => {
        const id = dashSettingsEscHtml(opt.id);
        const label = dashSettingsEscHtml(opt.label);
        return '<option value="' + id + '"' + (opt.id === selected ? ' selected' : '') + '>'
            + label + '</option>';
    }).join('');
    return ''
        + '<label style="' + dashSettingsLabelStyle() + ' display: flex; flex-direction: column; gap: 6px;">'
        + '<span>Default right sidebar pane</span>'
        + '<select id="wf-dash-settings-default-stats-tab-select" data-wf-dash-default-stats-tab '
        + 'style="' + inputStyle + ' max-width: 280px;">'
        + options
        + '</select>'
        + '</label>';
}

function renderDefaultStatsTab(modal) {
    const root = modal && modal.querySelector('#wf-dash-settings-default-stats-tab');
    if (root) root.innerHTML = dashboardDefaultStatsTabHtml();
}

function attachDashboardSettingsListeners(modal) {
    if (!modal || modal.dataset.wfDashSettingsListeners === '1') return;
    modal.dataset.wfDashSettingsListeners = '1';

    if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
        Context.uiLib.ensureButtonStyles('[data-fleet-dash-settings="1"]', modal);
    }
    if (Context.uiLib && typeof Context.uiLib.ensureStyles === 'function') {
        Context.uiLib.ensureStyles();
    }

    modal.addEventListener('click', (e) => {
        const panel = modal.querySelector('[data-wf-dash-panel="dash-settings"]');
        if (!panel || !panel.contains(e.target)) return;

        const openRouterLink = e.target.closest('[data-wf-dash-openrouter-link]');
        if (openRouterLink) {
            Logger.log(PLUGIN_ID + ': OpenRouter website opened');
            return;
        }
        const defaultTabCheckbox = e.target.closest('[data-wf-dash-default-tab]');
        if (defaultTabCheckbox) {
            const tabId = defaultTabCheckbox.getAttribute('data-wf-dash-default-tab');
            if (defaultTabCheckbox.checked
                && Context.dashboard
                && typeof Context.dashboard.setDefaultTab === 'function') {
                Context.dashboard.setDefaultTab(tabId);
            }
            renderDashboardTabOrder(modal);
            return;
        }
        const moveUpBtn = e.target.closest('[data-wf-dash-tab-move-up]');
        const moveDownBtn = e.target.closest('[data-wf-dash-tab-move-down]');
        if (moveUpBtn || moveDownBtn) {
            e.preventDefault();
            const btn = moveUpBtn || moveDownBtn;
            const tabId = btn.getAttribute(moveUpBtn ? 'data-wf-dash-tab-move-up' : 'data-wf-dash-tab-move-down');
            const moved = Context.dashboard && typeof Context.dashboard.moveTab === 'function'
                ? Context.dashboard.moveTab(tabId, moveUpBtn ? -1 : 1)
                : false;
            if (moved) renderDashboardTabOrder(modal);
            return;
        }
        const resetOrderBtn = e.target.closest('[data-wf-dash-tab-order-reset]');
        if (resetOrderBtn) {
            e.preventDefault();
            if (Context.dashboard && typeof Context.dashboard.resetTabOrder === 'function') {
                Context.dashboard.resetTabOrder();
                renderDashboardTabOrder(modal);
            }
            return;
        }
        const saveBtn = e.target.closest('#wf-dash-settings-ai-key-save');
        if (saveBtn) {
            e.preventDefault();
            void saveOpenRouterKey(modal);
            return;
        }
        const cancelBtn = e.target.closest('#wf-dash-settings-ai-key-cancel');
        if (cancelBtn) {
            e.preventDefault();
            renderAiSection(modal);
            setAiStatus(modal, '', false);
            return;
        }
        const replaceBtn = e.target.closest('#wf-dash-settings-ai-key-replace');
        if (replaceBtn) {
            e.preventDefault();
            renderAiSection(modal, { forceEntry: true });
            setAiStatus(modal, '', false);
            return;
        }
        const removeBtn = e.target.closest('#wf-dash-settings-ai-key-remove');
        if (removeBtn) {
            e.preventDefault();
            removeOpenRouterKey(modal);
            return;
        }
        const testBtn = e.target.closest('#wf-dash-settings-ai-test-btn');
        if (testBtn) {
            e.preventDefault();
            void runOpenRouterTest(modal);
            return;
        }
        const chatSave = e.target.closest('[data-wf-dash-search-chat-settings-save]');
        if (chatSave && Context.searchOutputChat) {
            e.preventDefault();
            const api = Context.searchOutputChat;
            const raw = api.readSettingsFromModal(modal);
            if (!raw) return;
            try {
                api.saveSettings(raw);
                if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(chatSave);
                Logger.log(PLUGIN_ID + ': search chat settings saved');
                renderAiSection(modal);
                api.setSettingsStatus(modal, 'Search Chat limits saved.', false);
            } catch (err) {
                api.setSettingsStatus(modal, (err && err.message) || String(err), true);
                if (Context.buttonFeedback) Context.buttonFeedback.flashFailure(chatSave);
                Logger.warn(PLUGIN_ID + ': search chat settings save failed', err);
            }
            return;
        }
        const chatReset = e.target.closest('[data-wf-dash-search-chat-settings-reset]');
        if (chatReset && Context.searchOutputChat) {
            e.preventDefault();
            const api = Context.searchOutputChat;
            try {
                api.saveSettings(api.defaultSettings());
                if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(chatReset);
                Logger.log(PLUGIN_ID + ': search chat settings reset');
                renderAiSection(modal);
                api.setSettingsStatus(modal, 'Search Chat limits reset to defaults.', false);
            } catch (err) {
                api.setSettingsStatus(modal, (err && err.message) || String(err), true);
                if (Context.buttonFeedback) Context.buttonFeedback.flashFailure(chatReset);
            }
        }
    });

    modal.addEventListener('change', (e) => {
        const panel = modal.querySelector('[data-wf-dash-panel="dash-settings"]');
        if (!panel || !panel.contains(e.target)) return;
        const statsTabSelect = e.target.closest('[data-wf-dash-default-stats-tab]');
        if (!statsTabSelect) return;
        const tabId = String(statsTabSelect.value || '').trim();
        if (Context.dashboard && typeof Context.dashboard.setDefaultStatsTab === 'function') {
            Context.dashboard.setDefaultStatsTab(tabId);
            renderDefaultStatsTab(modal);
        }
    });

    modal.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const panel = modal.querySelector('[data-wf-dash-panel="dash-settings"]');
        if (!panel || !panel.contains(e.target)) return;
        if (e.target && e.target.id === 'wf-dash-settings-ai-key-input') {
            e.preventDefault();
            void saveOpenRouterKey(modal);
        }
    });
}

const plugin = {
    id: PLUGIN_ID,
    name: 'Dashboard Settings',
    description: 'Settings tab for dashboard tab order, Search Output defaults, AI Integration / OpenRouter, and Search Chat limits',
    _version: '1.16',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            Logger.error(PLUGIN_ID + ': dashboard loader not registered');
            return;
        }
        Context.aiOpenRouter = {
            contentMaxWidthPx: DASH_SETTINGS_CONTENT_MAX_WIDTH_PX,
            hasStoredKey: () => hasStoredOpenRouterKey(),
            resolveApiKey: () => resolveOpenRouterApiKey(),
            async chatCompletion(messages) {
                const apiKey = await resolveOpenRouterApiKey();
                if (!apiKey) throw new Error('OpenRouter API key is not available');
                return openRouterChatCompletion(apiKey, messages);
            },
            async chatCompletionStream(opts) {
                const messages = opts && opts.messages;
                const onDelta = opts && opts.onDelta;
                const onDone = opts && opts.onDone;
                const onError = opts && opts.onError;
                const requestOpts = {
                    tools: opts && opts.tools,
                    tool_choice: opts && opts.tool_choice,
                    model: opts && opts.model,
                    max_tokens: opts && opts.max_tokens,
                    parallel_tool_calls: opts && opts.parallel_tool_calls,
                };
                let apiKey;
                try {
                    apiKey = await resolveOpenRouterApiKey();
                } catch (err) {
                    if (typeof onError === 'function') onError(err);
                    throw err;
                }
                if (!apiKey) {
                    const err = new Error('OpenRouter API key is not available');
                    if (typeof onError === 'function') onError(err);
                    throw err;
                }
                return openRouterChatCompletionStream(
                    apiKey,
                    messages,
                    { onDelta, onDone, onError },
                    requestOpts
                );
            },
            async generationContent(generationId) {
                const apiKey = await resolveOpenRouterApiKey();
                if (!apiKey) throw new Error('OpenRouter API key is not available');
                return openRouterGenerationContent(apiKey, generationId);
            },
        };
        Context.dashboard.registerTab({
            id: 'dash-settings',
            label: 'Settings',
            panelHtml() { return dashboardSettingsPanelHtml(); },
            attachListeners(modal) { attachDashboardSettingsListeners(modal); },
            onActivate(modal) {
                renderDashboardTabOrder(modal);
                renderDefaultStatsTab(modal);
                renderAiSection(modal);
                setAiStatus(modal, '', false);
                setTestResult(modal, null);
                Logger.debug(PLUGIN_ID + ': Settings tab activated');
            }
        });
        Logger.log(PLUGIN_ID + ': tab registered (Context.aiOpenRouter)');
    }
};
