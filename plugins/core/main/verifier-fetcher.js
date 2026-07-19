// ============= verifier-fetcher.js =============
// Verifier Fetcher tab for the Ops dashboard.
//
// AI gating: Diagnose Issues, Chat toggle, and the chat pane stay hidden unless
// Context.aiOpenRouter.hasStoredKey() is true. Actual OpenRouter calls still
// require Ops unlock to decrypt the key.
// Chat transcript UI / streaming uses Context.aiChat (plugins/libs/ai-chat.js → Deep Chat).

const VERIFIER_SCRATCHPAD_WIDTH_KEY = 'fleet-ux:verifier-fetcher-scratchpad-width';
const VERIFIER_SCRATCHPAD_OPEN_KEY = 'fleet-ux:verifier-fetcher-scratchpad-open';
const VERIFIER_SCRATCHPAD_TEXT_KEY = 'fleet-ux:verifier-fetcher-scratchpad-text';
const VERIFIER_CHAT_OPEN_KEY = 'fleet-ux:verifier-fetcher-chat-open';
const VERIFIER_SCRATCHPAD_DEFAULT_WIDTH = 320;
const VERIFIER_SCRATCHPAD_MIN_WIDTH = 200;
const VERIFIER_SCRATCHPAD_MIN_CODE_WIDTH = 240;
const VERIFIER_SCRATCHPAD_TEXT_SAVE_MS = 400;
const VERIFIER_MONO_FONT = 'font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);';
const VERIFIER_SETTINGS_WIDTH_PX = 640;
const VERIFIER_MAIN_MAX_WIDTH_PX = VERIFIER_SETTINGS_WIDTH_PX * 2;
const VERIFIER_CHAT_MAX_WIDTH_PX = VERIFIER_SETTINGS_WIDTH_PX;

const DECODE_SYSTEM_PROMPT =
    'You are helping a reviewer understand a task verifier result. Given the verifier\'s '
    + 'Python source and its captured output, explain in plain language what caused each '
    + 'failure, citing the specific check or function in the code responsible. Investigate the '
    + 'possibility that the verifier code itself is incorrect; if you determine such, say so '
    + 'explicitly and diagnose the root cause in the verifier. If the output references values '
    + 'a reviewer cannot know (transaction numbers, email IDs, internal keys), use the verifier '
    + 'source to explain what it was looking for so the output becomes interpretable. Be concise: '
    + 'one short paragraph or bullet per issue, stated as efficiently as possible. Related issues '
    + 'may be grouped into one bullet point for better synthesis. No restating of code. If the '
    + 'output does not match the code, simply state that there seems to be a mismatch. Do not '
    + 'acknowledge checks that passed. If there are no failures, state that there is nothing to analyze. '
    + 'In this current scenario, the only thing that the reviewer can do to attempt to fix the errors '
    + 'is to attempt the task while completing different actions. The reviewer cannot modify the verifier code. '
    + 'Therefore, do not suggest modifications to the code ever; only changes in how the task is '
    + 'attempted if it makes sense to do so. If the verifier is clearly incorrectly written, then '
    + 'advise flagging the task as bugged.';

function verifierBtnClass(variant, size) {
    if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
        return Context.uiLib.btnClass(variant, size);
    }
    const dash = Context.dashboard;
    return dash && typeof dash.dashBtnClass === 'function'
        ? dash.dashBtnClass(variant, size)
        : 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size;
}

function ensureVerifierBtnStyles() {
    if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
        Context.uiLib.ensureButtonStyles('#wf-ops-verifier-panel');
    }
}

function hasVerifierAiKey() {
    if (Context.aiChat && typeof Context.aiChat.hasAiKey === 'function') {
        return Context.aiChat.hasAiKey();
    }
    return !!(Context.aiOpenRouter
        && typeof Context.aiOpenRouter.hasStoredKey === 'function'
        && Context.aiOpenRouter.hasStoredKey());
}

function readVerifierScratchpadWidthPref() {
    try {
        const raw = Storage.getData(VERIFIER_SCRATCHPAD_WIDTH_KEY, null);
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n) || n < VERIFIER_SCRATCHPAD_MIN_WIDTH) return VERIFIER_SCRATCHPAD_DEFAULT_WIDTH;
        return n;
    } catch (_e) {
        return VERIFIER_SCRATCHPAD_DEFAULT_WIDTH;
    }
}

function writeVerifierScratchpadWidthPref(widthPx) {
    try {
        const clamped = Math.max(VERIFIER_SCRATCHPAD_MIN_WIDTH, Math.round(widthPx));
        Storage.setData(VERIFIER_SCRATCHPAD_WIDTH_KEY, String(clamped));
    } catch (err) {
        Logger.warn('verifier-fetcher: failed to write verifier output width pref', err);
    }
}

function readVerifierScratchpadOpenPref() {
    try {
        return Storage.getData(VERIFIER_SCRATCHPAD_OPEN_KEY, null) === '1';
    } catch (_e) {
        return false;
    }
}

function writeVerifierScratchpadOpenPref(open) {
    try {
        Storage.setData(VERIFIER_SCRATCHPAD_OPEN_KEY, open ? '1' : '0');
    } catch (err) {
        Logger.warn('verifier-fetcher: failed to write verifier output open pref', err);
    }
}

function readVerifierScratchpadTextPref() {
    try {
        return Storage.getData(VERIFIER_SCRATCHPAD_TEXT_KEY, '') || '';
    } catch (_e) {
        return '';
    }
}

function writeVerifierScratchpadTextPref(text) {
    try {
        Storage.setData(VERIFIER_SCRATCHPAD_TEXT_KEY, text || '');
    } catch (err) {
        Logger.warn('verifier-fetcher: failed to write verifier output text pref', err);
    }
}

function readVerifierChatOpenPref() {
    try {
        return Storage.getData(VERIFIER_CHAT_OPEN_KEY, null) === '1';
    } catch (_e) {
        return false;
    }
}

function writeVerifierChatOpenPref(open) {
    try {
        Storage.setData(VERIFIER_CHAT_OPEN_KEY, open ? '1' : '0');
    } catch (err) {
        Logger.warn('verifier-fetcher: failed to write chat open pref', err);
    }
}

function clampVerifierScratchpadWidth(root, widthPx) {
    const rootW = root ? root.getBoundingClientRect().width : 0;
    const fallbackW = 960;
    const basis = rootW > 0 ? rootW : fallbackW;
    const handleReserve = 16;
    const max = Math.max(
        VERIFIER_SCRATCHPAD_MIN_WIDTH,
        basis - VERIFIER_SCRATCHPAD_MIN_CODE_WIDTH - handleReserve
    );
    return Math.round(Math.max(VERIFIER_SCRATCHPAD_MIN_WIDTH, Math.min(max, widthPx)));
}

function verifierChatOpts() {
    return {
        mountSelector: '#wf-ops-verifier-chat-mount',
        exportSelector: '#wf-ops-verifier-chat-export',
        wiredAttr: 'data-wf-chat-wired',
        logTag: 'verifier-fetcher',
        placeholder: 'Message…',
    };
}

function verifierChatApi() {
    return Context.aiChat || null;
}

function getVerifierChatSessionId(modal) {
    if (!modal) return '';
    if (!modal._wfVerifierChatSessionId) {
        modal._wfVerifierChatSessionId = (typeof crypto !== 'undefined'
            && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : ('verifier-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
    }
    return modal._wfVerifierChatSessionId;
}

function verifierRecordTurn(modal, turn) {
    const api = Context.dashboardChats;
    if (!api || typeof api.recordTurn !== 'function') {
        Logger.warn('verifier-fetcher: dashboardChats unavailable — turn not indexed');
        return;
    }
    const t = turn || {};
    const titleHint = (t.userPreview && String(t.userPreview).trim())
        || 'Verifier chat';
    api.recordTurn({
        source: 'verifier',
        conversationKey: getVerifierChatSessionId(modal),
        titleHint,
        generationId: t.generationId,
        model: t.model,
    });
}

function getVerifierChatState(modal) {
    if (!modal) return null;
    if (!modal._wfVerifierChatState) {
        const chat = verifierChatApi();
        modal._wfVerifierChatState = chat && typeof chat.createState === 'function'
            ? chat.createState()
            : { messages: [], streaming: false, streamAbort: null, streamGen: 0 };
    }
    return modal._wfVerifierChatState;
}

function renderVerifierChatMessages(modal) {
    const chat = verifierChatApi();
    const state = getVerifierChatState(modal);
    if (!chat || !state) return;
    chat.renderMessages(modal, state, verifierChatOpts());
}

function setVerifierChatStreamingUi(modal, streaming) {
    const chat = verifierChatApi();
    const state = getVerifierChatState(modal);
    if (!chat || !state) return;
    chat.setStreamingUi(modal, state, streaming, verifierChatOpts());
}

function stopVerifierChatStream(modal) {
    const chat = verifierChatApi();
    const state = getVerifierChatState(modal);
    if (!chat || !state) return;
    chat.stopStream(state, verifierChatOpts());
    chat.setStreamingUi(modal, state, false, verifierChatOpts());
    chat.renderMessages(modal, state, verifierChatOpts());
}

async function sendVerifierChatMessage(modal, userText) {
    const chat = verifierChatApi();
    const state = getVerifierChatState(modal);
    const text = String(userText || '').trim();
    if (!chat || !state || !text || state.streaming) return;

    writeVerifierChatOpenPref(true);
    syncVerifierAiUi(modal);

    try {
        await chat.sendTurn(modal, state, Object.assign({}, verifierChatOpts(), {
            userText: text,
            onTurnDone: (turn) => verifierRecordTurn(modal, turn),
        }));
    } catch (_err) {
        // sendTurn already logged and finalized the error bubble
    }
}

async function decodeVerifierOutput(modal) {
    const decodeBtn = modal.querySelector('#wf-ops-verifier-decode-btn');
    const codeEl = modal.querySelector('#wf-ops-verifier-output');
    const ta = modal.querySelector('#wf-ops-verifier-scratchpad');
    const codeText = codeEl ? String(codeEl.textContent || '').trim() : '';
    const outputText = ta ? String(ta.value || '').trim() : '';

    if (!codeText) {
        Logger.warn('verifier-fetcher: Diagnose Issues blocked — empty verifier code');
        if (Context.buttonFeedback && decodeBtn) Context.buttonFeedback.flashFailure(decodeBtn);
        return;
    }
    if (!outputText) {
        Logger.warn('verifier-fetcher: Diagnose Issues blocked — empty Verifier Output');
        if (Context.buttonFeedback && decodeBtn) Context.buttonFeedback.flashFailure(decodeBtn);
        return;
    }

    const chat = verifierChatApi();
    const state = getVerifierChatState(modal);
    if (!chat || !state) {
        Logger.error('verifier-fetcher: Diagnose Issues blocked — Context.aiChat unavailable');
        return;
    }
    if (state.streaming) {
        Logger.warn('verifier-fetcher: Diagnose Issues blocked — stream in progress');
        return;
    }

    writeVerifierChatOpenPref(true);
    syncVerifierAiUi(modal);
    if (Context.buttonFeedback && decodeBtn) Context.buttonFeedback.flashSuccess(decodeBtn);

    const userPayload =
        '## Verifier source\n\n```python\n' + codeText + '\n```\n\n'
        + '## Verifier Output\n\n```\n' + outputText + '\n```';

    Logger.log('verifier-fetcher: Diagnose Issues started');
    try {
        await chat.sendTurn(modal, state, Object.assign({}, verifierChatOpts(), {
            userContent: userPayload,
            displayContent: 'Diagnose Issues',
            apiMessages: [
                { role: 'system', content: DECODE_SYSTEM_PROMPT },
                { role: 'user', content: userPayload },
            ],
            onTurnDone: (turn) => verifierRecordTurn(modal, Object.assign({}, turn, {
                userPreview: 'Diagnose Issues',
            })),
        }));
        Logger.log('verifier-fetcher: Diagnose Issues done');
    } catch (err) {
        if (Context.buttonFeedback && decodeBtn) Context.buttonFeedback.flashFailure(decodeBtn);
        Logger.error('verifier-fetcher: Diagnose Issues failed: ' + ((err && err.message) || err));
    }
}

function wireVerifierChatComposer(modal) {
    const chat = verifierChatApi();
    if (!chat || typeof chat.wireComposer !== 'function') return;
    chat.wireComposer(modal, getVerifierChatState(modal), Object.assign({}, verifierChatOpts(), {
        onSend: (value) => sendVerifierChatMessage(modal, value),
        onStop: () => stopVerifierChatStream(modal),
        onExport: () => chat.exportConversation(
            getVerifierChatState(modal),
            Object.assign({}, verifierChatOpts(), {
                exportFilename: 'verifier-chat-' + new Date().toISOString().slice(0, 10) + '.json',
                exportMetadata: { feature: 'verifier-fetcher' },
            })
        ),
    }));
}

function applyVerifierScratchpadLayout(modal, openOverride) {
    if (!modal) return;
    const outputWrap = modal.querySelector('#wf-ops-verifier-output-wrap');
    const scratchpadPane = modal.querySelector('#wf-ops-verifier-scratchpad-pane');
    const splitHandle = modal.querySelector('#wf-ops-verifier-scratchpad-split-handle');
    const toggleBtn = modal.querySelector('#wf-ops-verifier-scratchpad-toggle');
    if (!outputWrap || !scratchpadPane || !splitHandle || !toggleBtn) return;

    const open = openOverride != null ? Boolean(openOverride) : readVerifierScratchpadOpenPref();
    const width = clampVerifierScratchpadWidth(outputWrap, readVerifierScratchpadWidthPref());

    scratchpadPane.style.display = open ? 'flex' : 'none';
    splitHandle.style.display = open ? 'block' : 'none';
    if (open) {
        scratchpadPane.style.width = width + 'px';
        scratchpadPane.style.minWidth = VERIFIER_SCRATCHPAD_MIN_WIDTH + 'px';
        scratchpadPane.style.maxWidth = width + 'px';
    }

    toggleBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
    toggleBtn.textContent = open ? 'Hide Verifier Output' : 'Verifier Output';
}

function syncVerifierAiUi(modal) {
    if (!modal) return;
    ensureVerifierBtnStyles();
    const ai = hasVerifierAiKey();
    const chatOpen = ai && readVerifierChatOpenPref();
    const chatToggle = modal.querySelector('#wf-ops-verifier-chat-toggle');
    const decodeBtn = modal.querySelector('#wf-ops-verifier-decode-btn');
    const chatPane = modal.querySelector('#wf-ops-verifier-chat-pane');
    const workspace = modal.querySelector('#wf-ops-verifier-workspace');

    if (chatToggle) {
        chatToggle.style.display = ai ? '' : 'none';
        chatToggle.textContent = chatOpen ? 'Hide chat' : 'Chat';
        chatToggle.setAttribute('aria-pressed', chatOpen ? 'true' : 'false');
    }
    if (decodeBtn) decodeBtn.style.display = ai ? '' : 'none';
    if (chatPane) {
        chatPane.style.display = chatOpen ? 'flex' : 'none';
        chatPane.setAttribute('aria-hidden', chatOpen ? 'false' : 'true');
    }
    if (workspace) workspace.setAttribute('data-wf-ai-chat', chatOpen ? '1' : '0');
    if (chatOpen) {
        renderVerifierChatMessages(modal);
        setVerifierChatStreamingUi(modal, !!(getVerifierChatState(modal).streaming));
    }
    Logger.debug('verifier-fetcher: syncAiUi ai=' + ai + ' chatOpen=' + chatOpen);
}

function attachVerifierScratchpadResize(modal) {
    if (!modal || modal.dataset.wfVerifierScratchpadResizeAttached === '1') return;
    modal.dataset.wfVerifierScratchpadResizeAttached = '1';

    modal.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('#wf-ops-verifier-scratchpad-split-handle');
        if (!handle || !modal.contains(handle)) return;
        if (!readVerifierScratchpadOpenPref()) return;

        const outputWrap = modal.querySelector('#wf-ops-verifier-output-wrap');
        const scratchpadPane = modal.querySelector('#wf-ops-verifier-scratchpad-pane');
        if (!outputWrap || !scratchpadPane) return;

        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader || typeof loader._beginColResizeDrag !== 'function') return;

        const startX = e.clientX;
        const startWidth = scratchpadPane.getBoundingClientRect().width;

        loader._beginColResizeDrag(e, {
            onMove: (ev) => {
                const next = clampVerifierScratchpadWidth(outputWrap, startWidth + (startX - ev.clientX));
                scratchpadPane.style.width = next + 'px';
                scratchpadPane.style.maxWidth = next + 'px';
            },
            onUp: () => {
                const finalWidth = clampVerifierScratchpadWidth(outputWrap, scratchpadPane.getBoundingClientRect().width);
                writeVerifierScratchpadWidthPref(finalWidth);
                applyVerifierScratchpadLayout(modal, true);
                Logger.log('verifier-fetcher: verifier output width set to ' + finalWidth + 'px');
            }
        });
    });
}

function restoreVerifierScratchpadState(modal) {
    if (!modal) return;
    const textarea = modal.querySelector('#wf-ops-verifier-scratchpad');
    if (textarea && !textarea.dataset.wfScratchpadRestored) {
        textarea.value = readVerifierScratchpadTextPref();
        textarea.dataset.wfScratchpadRestored = '1';
    }
    applyVerifierScratchpadLayout(modal);
    syncVerifierAiUi(modal);
}

function syncVerifierOutputToolbar(modal) {
    if (!modal) return;
    applyVerifierScratchpadLayout(modal);
    syncVerifierAiUi(modal);
}

function captureVerifierScratchpadTabState(modal) {
    if (!modal) return null;
    const textarea = modal.querySelector('#wf-ops-verifier-scratchpad');
    return {
        open: readVerifierScratchpadOpenPref(),
        text: textarea ? textarea.value : readVerifierScratchpadTextPref(),
        chatOpen: readVerifierChatOpenPref()
    };
}

function restoreVerifierScratchpadTabState(modal, state) {
    if (!modal) return;
    const textarea = modal.querySelector('#wf-ops-verifier-scratchpad');
    if (state && state.open != null) {
        writeVerifierScratchpadOpenPref(Boolean(state.open));
    }
    if (state && state.chatOpen != null) {
        writeVerifierChatOpenPref(Boolean(state.chatOpen));
    }
    if (textarea) {
        const text = state && state.text != null ? String(state.text) : readVerifierScratchpadTextPref();
        textarea.value = text;
        textarea.dataset.wfScratchpadRestored = '1';
        writeVerifierScratchpadTextPref(text);
    }
    applyVerifierScratchpadLayout(modal);
    syncVerifierAiUi(modal);
}

function verifierFetcherPanelHtml() {
    const dash = Context.dashboard;
    const loader = dash && dash._loader;
    const btnClass = (variant, size) => verifierBtnClass(variant, size);
    const inputStyle = loader && typeof loader._inputStyle === 'function'
        ? loader._inputStyle()
        : 'width: 100%; padding: 7px 10px; font-size: 12px; border: 1px solid var(--input, #cbd5e1); border-radius: 6px; background: var(--background, #fff); color: var(--foreground, #0f172a); box-sizing: border-box;';
    const hintStyle = loader && typeof loader._hintStyle === 'function'
        ? loader._hintStyle()
        : 'font-size: 11px; font-weight: 400; color: var(--muted-foreground, #64748b); letter-spacing: -0.01em;';
    const labelStyle = loader && typeof loader._labelStyle === 'function'
        ? loader._labelStyle()
        : 'font-size: 11px; font-weight: 500; color: var(--muted-foreground, #64748b); letter-spacing: -0.01em;';
    const clearBtnStyle = loader && typeof loader._inputClearBtnStyle === 'function'
        ? loader._inputClearBtnStyle()
        : 'flex-shrink: 0; width: 32px; height: 32px; padding: 0; font-size: 17px; line-height: 1; font-weight: 600; border-radius: 6px; cursor: pointer; border: 1px solid var(--border, #e2e8f0); background: var(--background, #fff); color: var(--muted-foreground, #64748b);';
    const monoInputStyle = inputStyle + ' ' + VERIFIER_MONO_FONT;
    const compactInputStyle = inputStyle + ' padding: 6px 10px; ' + VERIFIER_MONO_FONT;
    const mainMax = (Context.aiOpenRouter && Context.aiOpenRouter.contentMaxWidthPx)
        ? Context.aiOpenRouter.contentMaxWidthPx * 2
        : VERIFIER_MAIN_MAX_WIDTH_PX;
    const chatMax = (Context.aiOpenRouter && Context.aiOpenRouter.contentMaxWidthPx)
        ? Context.aiOpenRouter.contentMaxWidthPx
        : VERIFIER_CHAT_MAX_WIDTH_PX;

    return `
            <div id="wf-ops-verifier-panel" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;">
                <div id="wf-ops-verifier-workspace" data-wf-ai-chat="0" style="
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                    flex: 1;
                    min-height: 0;
                    width: 100%;
                    align-items: stretch;
                    box-sizing: border-box;
                ">
                    <div id="wf-ops-verifier-main" style="
                        display: flex;
                        flex-direction: column;
                        flex: 1 1 auto;
                        max-width: ${mainMax}px;
                        width: 100%;
                        min-width: 0;
                        min-height: 0;
                        box-sizing: border-box;
                    ">
                        <div style="flex-shrink: 0;">
                            <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: var(--foreground, #0f172a);">
                                Verifier Code Fetcher
                            </h3>
                            <p style="${hintStyle} margin: 0 0 10px 0; line-height: 1.45;">
                                Paste a task key, task URL, verifier key, verifier ID, or copied seed data. Press Enter to fetch.
                            </p>
                            <div style="display: flex; gap: 8px; align-items: stretch;">
                                <input type="text" id="wf-ops-verifier-input" placeholder="Paste here" autocomplete="off" style="${monoInputStyle} flex: 1; min-width: 0;">
                                <button type="button" id="wf-ops-fetch-verifier" class="${btnClass('primary', 'regular')}" style="flex-shrink: 0;">Fetch</button>
                            </div>
                            <div id="wf-ops-verifier-status-row" style="display: none; margin-top: 8px;">
                                <div id="wf-ops-verifier-status" style="${hintStyle} line-height: 1.45;"></div>
                            </div>
                            <select id="wf-ops-verifier-version" aria-label="Verifier version" style="display: none; width: 100%; margin-top: 8px; ${monoInputStyle}"></select>
                        </div>
                        <div id="wf-ops-verifier-output-toolbar" style="
                            display: none;
                            width: 100%;
                            margin-top: 8px;
                            flex-shrink: 0;
                            align-items: flex-start;
                            justify-content: space-between;
                            gap: 8px;
                            flex-wrap: nowrap;
                            box-sizing: border-box;
                        ">
                            <div id="wf-ops-verifier-content-search-wrap" style="
                                display: flex;
                                flex-shrink: 0;
                                align-self: flex-start;
                                width: 30%;
                                max-width: 30%;
                                min-width: 12rem;
                                gap: 6px;
                                align-items: center;
                                flex-wrap: wrap;
                                flex-direction: row;
                                justify-content: flex-start;
                                box-sizing: border-box;
                            ">
                                <label for="wf-ops-verifier-content-search" style="${labelStyle} white-space: nowrap; flex-shrink: 0;">Search in code:</label>
                                <span style="display: flex; flex: 1 1 8rem; min-width: 0; gap: 4px; align-items: center;">
                                    <input type="text" id="wf-ops-verifier-content-search" placeholder="Find in verifier…" autocomplete="off" style="${compactInputStyle} flex: 1; min-width: 0; width: 100%;">
                                    <button type="button" id="wf-ops-verifier-content-search-clear" title="Clear search" aria-label="Clear search" class="${btnClass('basic', 'icon')}" style="${clearBtnStyle} display: none;">&times;</button>
                                </span>
                                <span id="wf-ops-verifier-content-match-count" style="${labelStyle} white-space: nowrap; flex-shrink: 0;"></span>
                                <button type="button" id="wf-ops-verifier-content-prev" class="${btnClass('basic', 'nav')}" style="flex-shrink: 0;">Prev</button>
                                <button type="button" id="wf-ops-verifier-content-next" class="${btnClass('basic', 'nav')}" style="flex-shrink: 0;">Next</button>
                                <button type="button" id="wf-ops-copy-verifier" class="${btnClass('secondary', 'nav')}" style="display: none; flex-shrink: 0;">Copy</button>
                            </div>
                            <div style="display: flex; gap: 6px; flex-shrink: 0; align-items: center;">
                                <button type="button" id="wf-ops-verifier-scratchpad-toggle" class="${btnClass('basic', 'nav')}" aria-pressed="false" style="flex-shrink: 0;">Verifier Output</button>
                                <button type="button" id="wf-ops-verifier-chat-toggle" class="${btnClass('basic', 'nav')}" aria-pressed="false" style="display: none; flex-shrink: 0;">Chat</button>
                            </div>
                        </div>
                        <div id="wf-ops-verifier-output-wrap" style="
                            display: none;
                            flex: 1;
                            min-height: 0;
                            width: 100%;
                            margin-top: 8px;
                            flex-direction: row;
                            overflow: hidden;
                            box-sizing: border-box;
                        ">
                            <div id="wf-ops-verifier-code-pane" style="
                                flex: 1;
                                min-width: 0;
                                min-height: 0;
                                display: flex;
                                flex-direction: column;
                                overflow: hidden;
                            ">
                                <pre style="
                                    flex: 1;
                                    min-height: 0;
                                    width: 100%;
                                    margin: 0;
                                    padding: 8px 12px;
                                    font-size: 12px;
                                    border: 1px solid var(--border, #e5e5e5);
                                    border-radius: 6px;
                                    background: transparent;
                                    color: var(--foreground, #333);
                                    box-sizing: border-box;
                                    overflow: auto;
                                    overflow-x: auto;
                                    white-space: pre;
                                    word-break: normal;
                                    ${VERIFIER_MONO_FONT}
                                "><code id="wf-ops-verifier-output" class="language-python"></code></pre>
                            </div>
                            <div id="wf-ops-verifier-scratchpad-split-handle" data-wf-dash-split-handle role="separator" aria-orientation="vertical" aria-label="Resize Verifier Output" tabindex="0" title="Drag to resize Verifier Output" style="
                                display: none;
                                flex-shrink: 0;
                                width: 8px;
                                margin: 0 4px;
                                align-self: stretch;
                                cursor: col-resize;
                                border-radius: 4px;
                                background: transparent;
                                touch-action: none;
                                box-sizing: border-box;
                            "></div>
                            <aside id="wf-ops-verifier-scratchpad-pane" style="
                                display: none;
                                flex-shrink: 0;
                                min-height: 0;
                                flex-direction: column;
                                overflow: hidden;
                                box-sizing: border-box;
                                border: 1px solid var(--border, #e5e5e5);
                                border-radius: 6px;
                                background: transparent;
                            ">
                                <div style="
                                    flex-shrink: 0;
                                    padding: 6px 10px;
                                    ${labelStyle}
                                    border-bottom: 1px solid var(--border, #e5e5e5);
                                ">Verifier Output</div>
                                <textarea id="wf-ops-verifier-scratchpad" placeholder="Paste verifier output / notes…" autocomplete="off" spellcheck="true" style="
                                    flex: 1;
                                    min-height: 0;
                                    width: 100%;
                                    margin: 0;
                                    padding: 8px 10px;
                                    font-size: 12px;
                                    border: none;
                                    border-radius: 0;
                                    background: transparent;
                                    color: var(--foreground, #333);
                                    resize: none;
                                    box-sizing: border-box;
                                    ${VERIFIER_MONO_FONT}
                                    outline: none;
                                "></textarea>
                                <div style="
                                    flex-shrink: 0;
                                    display: flex;
                                    justify-content: flex-end;
                                    padding: 6px 8px;
                                    border-top: 1px solid var(--border, #e5e5e5);
                                ">
                                    <button type="button" id="wf-ops-verifier-decode-btn" class="${btnClass('secondary', 'compact')}" style="display: none;">Diagnose Issues</button>
                                </div>
                            </aside>
                        </div>
                    </div>
                    <div id="wf-ops-verifier-chat-pane" role="region" aria-label="AI chat" aria-hidden="true" style="
                        display: none;
                        flex: 0 1 ${chatMax}px;
                        max-width: ${chatMax}px;
                        width: 100%;
                        min-width: 0;
                        min-height: 0;
                        flex-direction: column;
                        gap: 8px;
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 6px;
                        padding: 8px;
                        box-sizing: border-box;
                        background: transparent;
                    ">
                        <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                            <div style="${labelStyle}">Chat</div>
                            <button type="button" id="wf-ops-verifier-chat-export" class="${btnClass('basic', 'compact')}">Export</button>
                        </div>
                        <div id="wf-ops-verifier-chat-mount" style="
                            flex: 1;
                            min-height: 120px;
                            display: flex;
                            flex-direction: column;
                            box-sizing: border-box;
                        "></div>
                    </div>
                </div>
            </div>`;
}

function attachVerifierFetcherListeners(modal) {
    const ops = Context.opsTab;
    if (!ops) return;
    if (modal.dataset.wfVerifierFetcherListenersAttached === '1') {
        restoreVerifierScratchpadState(modal);
        syncVerifierOutputToolbar(modal);
        if (typeof ops.restoreVerifierTabState === 'function') ops.restoreVerifierTabState(modal);
        return;
    }
    modal.dataset.wfVerifierFetcherListenersAttached = '1';
    if (typeof ops.injectSpinnerStyle === 'function') ops.injectSpinnerStyle();
    ensureVerifierBtnStyles();

    const verifierFetchBtn = modal.querySelector('#wf-ops-fetch-verifier');
    const verifierCopyBtn = modal.querySelector('#wf-ops-copy-verifier');
    const verifierInput = modal.querySelector('#wf-ops-verifier-input');
    const verifierVersionSelect = modal.querySelector('#wf-ops-verifier-version');
    const verifierContentSearch = modal.querySelector('#wf-ops-verifier-content-search');
    const verifierContentClear = modal.querySelector('#wf-ops-verifier-content-search-clear');
    const verifierContentPrev = modal.querySelector('#wf-ops-verifier-content-prev');
    const verifierContentNext = modal.querySelector('#wf-ops-verifier-content-next');
    const scratchpadToggle = modal.querySelector('#wf-ops-verifier-scratchpad-toggle');
    const scratchpadTextarea = modal.querySelector('#wf-ops-verifier-scratchpad');
    const chatToggle = modal.querySelector('#wf-ops-verifier-chat-toggle');
    const decodeBtn = modal.querySelector('#wf-ops-verifier-decode-btn');

    attachVerifierScratchpadResize(modal);
    wireVerifierChatComposer(modal);
    restoreVerifierScratchpadState(modal);

    if (scratchpadToggle) {
        scratchpadToggle.addEventListener('click', () => {
            const nextOpen = !readVerifierScratchpadOpenPref();
            writeVerifierScratchpadOpenPref(nextOpen);
            applyVerifierScratchpadLayout(modal, nextOpen);
            Logger.log('verifier-fetcher: verifier output ' + (nextOpen ? 'shown' : 'hidden'));
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
    }

    if (chatToggle) {
        chatToggle.addEventListener('click', () => {
            if (!hasVerifierAiKey()) return;
            const nextOpen = !readVerifierChatOpenPref();
            writeVerifierChatOpenPref(nextOpen);
            syncVerifierAiUi(modal);
            Logger.log('verifier-fetcher: chat ' + (nextOpen ? 'shown' : 'hidden'));
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
    }

    if (decodeBtn) {
        decodeBtn.addEventListener('click', () => { void decodeVerifierOutput(modal); });
    }

    if (scratchpadTextarea) {
        let saveTimer = null;
        scratchpadTextarea.addEventListener('input', () => {
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                writeVerifierScratchpadTextPref(scratchpadTextarea.value);
                if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
            }, VERIFIER_SCRATCHPAD_TEXT_SAVE_MS);
        });
    }

    if (verifierFetchBtn && typeof ops.handleVerifierFetch === 'function') {
        verifierFetchBtn.addEventListener('click', () => { void ops.handleVerifierFetch(modal); });
    }
    if (verifierInput && typeof ops.handleVerifierFetch === 'function') {
        verifierInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); void ops.handleVerifierFetch(modal); }
        });
        const onVerifierInput = () => {
            if (typeof ops.setVerifierStatus === 'function') ops.setVerifierStatus(modal, '');
            if (typeof ops.clearVerifierVersionPicker === 'function') ops.clearVerifierVersionPicker(modal);
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        };
        verifierInput.addEventListener('paste', () => requestAnimationFrame(onVerifierInput));
        verifierInput.addEventListener('input', onVerifierInput);
    }
    if (verifierContentClear && typeof ops.clearVerifierContentSearch === 'function') {
        verifierContentClear.addEventListener('click', () => ops.clearVerifierContentSearch(modal));
    }
    if (verifierContentSearch && typeof ops.applyVerifierContentSearch === 'function') {
        verifierContentSearch.addEventListener('input', () => {
            ops.applyVerifierContentSearch(modal, verifierContentSearch.value);
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
        verifierContentSearch.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (typeof ops.stepVerifierContentMatch === 'function') ops.stepVerifierContentMatch(modal, e.shiftKey ? -1 : 1);
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
    }
    if (verifierContentPrev && typeof ops.stepVerifierContentMatch === 'function') {
        verifierContentPrev.addEventListener('click', () => {
            ops.stepVerifierContentMatch(modal, -1);
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
    }
    if (verifierContentNext && typeof ops.stepVerifierContentMatch === 'function') {
        verifierContentNext.addEventListener('click', () => {
            ops.stepVerifierContentMatch(modal, 1);
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
    }
    if (verifierVersionSelect && typeof ops.handleVerifierVersionChange === 'function') {
        verifierVersionSelect.addEventListener('change', () => { void ops.handleVerifierVersionChange(modal); });
    }
    if (verifierCopyBtn && typeof ops.copyVerifierCode === 'function') {
        verifierCopyBtn.addEventListener('click', () => { void ops.copyVerifierCode(modal, verifierCopyBtn); });
    }
    if (typeof ops.restoreVerifierTabState === 'function') ops.restoreVerifierTabState(modal);
    syncVerifierAiUi(modal);
}

const plugin = {
    id: 'verifier-fetcher',
    name: 'Verifier Fetcher',
    description: 'Verifier code fetch tab for the Ops dashboard (Verifier Output + optional AI Decode/chat)',
    _version: '5.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            Logger.error('verifier-fetcher: dashboard loader not registered');
            return;
        }
        Context.verifierFetcherUi = {
            syncOutputToolbar: (modal) => syncVerifierOutputToolbar(modal),
            syncAiUi: (modal) => syncVerifierAiUi(modal),
            captureScratchpadTabState: (modal) => captureVerifierScratchpadTabState(modal),
            restoreScratchpadTabState: (modal, state) => restoreVerifierScratchpadTabState(modal, state)
        };
        Context.dashboard.registerTab({
            id: 'verifier-fetcher',
            label: 'Verifier Fetcher',
            panelHtml() { return verifierFetcherPanelHtml(); },
            attachListeners(modal) { attachVerifierFetcherListeners(modal); },
            onActivate(modal) {
                syncVerifierOutputToolbar(modal);
                syncVerifierAiUi(modal);
                Logger.debug('verifier-fetcher: tab activated');
            },
            captureState(modal, dash) {
                const ops = Context.opsTab;
                if (ops && typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
            }
        });
        Logger.log('verifier-fetcher: tab registered v5.0');
    }
};
