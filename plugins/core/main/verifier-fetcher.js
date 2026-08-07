// ============= verifier-fetcher.js =============
// Verifier Fetcher tab for the Ops dashboard.
//
// AI gating: Diagnose Issues and Chat stay visible without an OpenRouter key;
// Diagnose is disabled and Chat shows the shared no-key overlay until
// Context.aiOpenRouter.hasStoredKey() is true. Actual OpenRouter calls still
// require Ops unlock to decrypt the key.
//
// Chat uses Context.aiChat (plugins/libs/ai-chat.js → Deep Chat):
// - Diagnose / programmatic send: displayContent + optional displayAttachment chip;
//   bulk verifier/output goes in userContent (ai-chat paints via addMessage, not
//   submitUserMessage). Open the pane without remounting/syncing history mid-send.
// - Typed follow-ups: composer onSend → sendTurn (fromHandler / signals).
// - Toolbar layout sync must not remount AI chat (see syncVerifierOutputToolbar).

const VERIFIER_SCRATCHPAD_WIDTH_KEY = 'fleet-ux:verifier-fetcher-scratchpad-width';
const VERIFIER_SCRATCHPAD_OPEN_KEY = 'fleet-ux:verifier-fetcher-scratchpad-open';
const VERIFIER_SCRATCHPAD_LEGACY_TEXT_KEY = 'fleet-ux:verifier-fetcher-scratchpad-text';
const VERIFIER_CHAT_OPEN_KEY = 'fleet-ux:verifier-fetcher-chat-open';
const VERIFIER_SCRATCHPAD_DEFAULT_WIDTH = 320;
const VERIFIER_SCRATCHPAD_MIN_WIDTH = 200;
const VERIFIER_SCRATCHPAD_MIN_CODE_WIDTH = 240;
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
    + 'Match the certainty of what the verifier establishes: when the source and output make a '
    + 'fact certain, state it as fact — do not hedge with words like "likely", "suggests", '
    + '"might", or "appears". Reserve uncertainty language only when the code or output '
    + 'genuinely leave something undetermined. '
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
        Logger.warn('failed to write verifier output width pref', err);
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
        Logger.warn('failed to write verifier output open pref', err);
    }
}

function clearLegacyVerifierScratchpadText() {
    try {
        Storage.deleteData(VERIFIER_SCRATCHPAD_LEGACY_TEXT_KEY);
    } catch (err) {
        Logger.warn('failed to clear legacy verifier output text', err);
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
        Logger.warn('failed to write chat open pref', err);
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
        Logger.warn('dashboardChats unavailable — turn not indexed');
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

function getVerifierChatQueue(modal) {
    if (!modal) return [];
    if (!Array.isArray(modal._wfVerifierChatQueue)) modal._wfVerifierChatQueue = [];
    return modal._wfVerifierChatQueue;
}

function verifierQueueDedupeKey(ctx) {
    const versionId = String(ctx && (ctx.versionId || ctx.verifierVersionId) || '').trim();
    if (versionId) return 'vid:' + versionId;
    const source = String(ctx && ctx.source || '');
    if (source) return 'src:' + source.length + ':' + source.slice(0, 64);
    return '';
}

function normalizeVerifierQueueItem(ctx) {
    if (!ctx || !String(ctx.source || '').trim()) return null;
    const taskId = String(ctx.taskId || '');
    const taskKey = String(ctx.taskKey || '');
    const verifierKey = String(ctx.verifierKey || '');
    const versionId = String(ctx.versionId || ctx.verifierVersionId || '').trim();
    const verifierId = String(ctx.verifierId || '').trim()
        || (versionId ? ('version:' + versionId) : '')
        || (taskKey ? ('task:' + taskKey) : '')
        || (taskId ? ('task-id:' + taskId) : '')
        || verifierKey
        || 'verifier';
    return {
        taskId,
        taskKey,
        verifierId,
        verifierKey,
        version: ctx.version != null ? ctx.version : null,
        versionId,
        displayVersionNo: ctx.displayVersionNo != null ? ctx.displayVersionNo : null,
        source: String(ctx.source || ''),
    };
}

/** Append verifier source for the next chat send. Returns queue length. */
function queueVerifierChatAttachment(modal, ctx) {
    if (!modal) return 0;
    const item = normalizeVerifierQueueItem(ctx);
    if (!item) return getVerifierChatQueue(modal).length;
    const queue = getVerifierChatQueue(modal);
    const key = verifierQueueDedupeKey(item);
    if (key) {
        const idx = queue.findIndex((entry) => verifierQueueDedupeKey(entry) === key);
        if (idx >= 0) {
            queue[idx] = item;
            Logger.debug('chat queue updated existing verifier · ' + item.verifierId);
            return queue.length;
        }
    }
    queue.push(item);
    Logger.log('chat queue +1 · ' + item.verifierId
        + (item.displayVersionNo != null ? ' v' + item.displayVersionNo : '')
        + ' (' + queue.length + ' queued)');
    return queue.length;
}

function removeVerifierChatQueueItem(modal, dedupeKey) {
    const queue = getVerifierChatQueue(modal);
    const needle = String(dedupeKey || '');
    if (!needle) return queue.length;
    const next = queue.filter((entry) => verifierQueueDedupeKey(entry) !== needle);
    modal._wfVerifierChatQueue = next;
    Logger.log('chat queue removed · ' + needle + ' (' + next.length + ' queued)');
    return next.length;
}

function clearVerifierChatQueue(modal) {
    if (!modal) return;
    modal._wfVerifierChatQueue = [];
}

function ensureVerifierPendingTrayStyles() {
    if (document.getElementById('wf-ops-verifier-pending-tray-style')) return;
    const style = document.createElement('style');
    style.id = 'wf-ops-verifier-pending-tray-style';
    style.textContent = ''
        + '#wf-ops-verifier-pending-tray{display:none;flex-direction:column;gap:6px;flex-shrink:0;}'
        + '#wf-ops-verifier-pending-tray[data-wf-has-items="1"]{display:flex;}'
        + '#wf-ops-verifier-pending-tray .wf-ops-verifier-pending-label{'
        + 'font-size:11px;font-weight:500;color:var(--muted-foreground,#64748b);}'
        + '#wf-ops-verifier-pending-tray .wf-ops-verifier-pending-list{'
        + 'display:flex;flex-direction:column;gap:6px;}'
        + '#wf-ops-verifier-pending-tray .wf-ops-verifier-pending-chip{'
        + 'display:flex;align-items:center;gap:8px;padding:6px 8px;'
        + 'border:1px solid var(--border,#e2e8f0);border-radius:6px;'
        + 'background:var(--card,#fff);color:var(--foreground,#0f172a);'
        + 'font-size:12px;box-sizing:border-box;}'
        + '#wf-ops-verifier-pending-tray .wf-ops-verifier-pending-chip-main{'
        + 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}'
        + '#wf-ops-verifier-pending-tray .wf-ops-verifier-pending-chip-title{'
        + 'font-weight:600;}'
        + '#wf-ops-verifier-pending-tray .wf-ops-verifier-pending-chip-id{'
        + 'font-size:11px;color:var(--muted-foreground,#64748b);'
        + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
        + '#wf-ops-verifier-pending-tray .wf-ops-verifier-pending-remove{'
        + 'flex-shrink:0;}';
    document.head.appendChild(style);
}

function verifierPendingChipLabel(item) {
    if (!item) return 'Verifier';
    if (item.displayVersionNo != null) return 'Verifier v' + item.displayVersionNo;
    if (item.version != null) return 'Verifier v' + item.version;
    return 'Verifier';
}

function escapeVerifierPendingHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function syncVerifierPendingAttachTray(modal) {
    if (!modal) return;
    ensureVerifierPendingTrayStyles();
    const tray = modal.querySelector('#wf-ops-verifier-pending-tray');
    if (!tray) return;
    const queue = getVerifierChatQueue(modal);
    tray.setAttribute('data-wf-has-items', queue.length ? '1' : '0');
    if (!queue.length) {
        tray.innerHTML = '';
        return;
    }
    const btnClass = (variant, size) => {
        if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
            return Context.uiLib.btnClass(variant, size);
        }
        return 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size;
    };
    let html = '<div class="wf-ops-verifier-pending-label">Queued for next send</div>'
        + '<div class="wf-ops-verifier-pending-list">';
    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        const key = verifierQueueDedupeKey(item);
        const title = verifierPendingChipLabel(item);
        const idText = String(item.taskId || item.taskKey || item.verifierId || '').trim();
        html += '<div class="wf-ops-verifier-pending-chip" data-wf-pending-key="'
            + escapeVerifierPendingHtml(key) + '">'
            + '<div class="wf-ops-verifier-pending-chip-main">'
            + '<div class="wf-ops-verifier-pending-chip-title">'
            + escapeVerifierPendingHtml(title) + '</div>'
            + (idText
                ? ('<div class="wf-ops-verifier-pending-chip-id" title="'
                    + escapeVerifierPendingHtml(idText) + '">'
                    + escapeVerifierPendingHtml(idText) + '</div>')
                : '')
            + '</div>'
            + '<button type="button" class="wf-ops-verifier-pending-remove '
            + btnClass('basic', 'icon')
            + '" data-wf-pending-remove="' + escapeVerifierPendingHtml(key)
            + '" title="Remove from queue" aria-label="Remove from queue">&times;</button>'
            + '</div>';
    }
    html += '</div>';
    tray.innerHTML = html;
}

async function showVerifierQueuedInChat(modal) {
    if (!modal) return;
    ensureVerifierChatPaneOpen(modal);
    const chat = verifierChatApi();
    const state = getVerifierChatState(modal);
    if (chat && state && typeof chat.ensureMounted === 'function') {
        try {
            await chat.ensureMounted(modal, state, verifierChatOpts());
        } catch (err) {
            Logger.warn('chat mount before pending tray failed', err);
        }
    }
    wireVerifierChatComposer(modal);
    syncVerifierPendingAttachTray(modal);
}

/** Queue + paint pending chips in the chat pane (no send). Returns queue length. */
function queueVerifierChatAttachmentAndShow(modal, ctx) {
    const count = queueVerifierChatAttachment(modal, ctx);
    void showVerifierQueuedInChat(modal);
    return count;
}

function setVerifierChatFetchContext(modal, ctx) {
    // Backward-compatible: replace queue with a single pending item (or clear).
    if (!modal) return;
    clearVerifierChatQueue(modal);
    if (!ctx || !String(ctx.source || '').trim()) {
        syncVerifierPendingAttachTray(modal);
        Logger.debug('chat queue cleared');
        return;
    }
    queueVerifierChatAttachmentAndShow(modal, ctx);
}

function verifierMessageAttachments(msg) {
    if (!msg) return [];
    if (Array.isArray(msg.displayAttachments) && msg.displayAttachments.length) {
        return msg.displayAttachments;
    }
    if (msg.displayAttachment) return [msg.displayAttachment];
    return [];
}

function verifierChatHasAttachedKey(state, key) {
    const needle = String(key || '').trim();
    if (!needle || !state || !Array.isArray(state.messages)) return false;
    for (let i = 0; i < state.messages.length; i++) {
        const atts = verifierMessageAttachments(state.messages[i]);
        for (let j = 0; j < atts.length; j++) {
            const att = atts[j];
            if (!att || att.type !== 'verifier-source') continue;
            if (verifierQueueDedupeKey(att) === needle) return true;
            if (String(att.verifierId || '').trim() === needle) return true;
        }
    }
    return false;
}

function buildVerifierSourceApiBlock(ctx) {
    const taskId = String(ctx.taskId || '').trim() || '(none)';
    const verifierId = String(ctx.verifierId || '').trim() || '(none)';
    const versionLabel = ctx.displayVersionNo != null
        ? ctx.displayVersionNo
        : (ctx.version != null ? ctx.version : null);
    const versionLine = versionLabel != null ? '- Version: ' + versionLabel + '\n' : '';
    return '## Verifier context\n\n'
        + '- Task ID: ' + taskId + '\n'
        + '- Verifier ID: ' + verifierId + '\n'
        + versionLine
        + '\n```python\n' + String(ctx.source || '') + '\n```';
}

function buildVerifierSourcesApiBlock(attachments) {
    const list = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
    if (!list.length) return '';
    return list.map(buildVerifierSourceApiBlock).join('\n\n');
}

function buildVerifierDisplayAttachment(ctx) {
    const item = normalizeVerifierQueueItem(ctx);
    if (!item) return null;
    return {
        type: 'verifier-source',
        taskId: item.taskId,
        taskKey: item.taskKey,
        verifierId: item.verifierId,
        verifierKey: item.verifierKey,
        version: item.version,
        versionId: item.versionId,
        displayVersionNo: item.displayVersionNo,
        source: item.source,
    };
}

/**
 * Consume the entire pending queue for the next chat turn.
 * Skips items already present in the transcript (by version id / verifier id).
 */
function takeVerifierAttachmentsForTurn(modal, state) {
    const queue = getVerifierChatQueue(modal).slice();
    clearVerifierChatQueue(modal);
    syncVerifierPendingAttachTray(modal);
    if (!queue.length) return [];
    const out = [];
    for (let i = 0; i < queue.length; i++) {
        const ctx = queue[i];
        if (!ctx || !String(ctx.source || '').trim()) continue;
        const key = verifierQueueDedupeKey(ctx) || ctx.verifierId;
        if (verifierChatHasAttachedKey(state, key)) {
            Logger.debug('skip verifier attach — already in chat · ' + key);
            continue;
        }
        const att = buildVerifierDisplayAttachment(ctx);
        if (att) out.push(att);
    }
    if (out.length) {
        Logger.log('attaching ' + out.length + ' verifier'
            + (out.length === 1 ? '' : 's') + ' to chat turn');
    }
    return out;
}

/** @deprecated Prefer takeVerifierAttachmentsForTurn */
function takeVerifierAttachmentForTurn(modal, state) {
    const list = takeVerifierAttachmentsForTurn(modal, state);
    return list.length ? list[0] : null;
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
    if (!hasVerifierAiKey()) {
        Logger.warn('send blocked — no OpenRouter key stored');
        return;
    }

    ensureVerifierChatPaneOpen(modal);
    // Already inside Deep Chat connect: remounting/rebinding clears the viewport.
    // Match ratings follow-ups — only ensureMounted on cold programmatic sends.
    if (!modal._wfAiChatFromHandler && typeof chat.ensureMounted === 'function') {
        try {
            await chat.ensureMounted(modal, state, verifierChatOpts());
        } catch (err) {
            Logger.error('chat mount failed before send', err);
            return;
        }
    }

    const attachments = takeVerifierAttachmentsForTurn(modal, state);
    const apiBlock = buildVerifierSourcesApiBlock(attachments);
    const userContent = apiBlock ? (apiBlock + '\n\n' + text) : text;

    try {
        await chat.sendTurn(modal, state, Object.assign({}, verifierChatOpts(), {
            userText: text,
            userContent,
            displayContent: text,
            displayAttachments: attachments,
            displayAttachment: attachments[0] || null,
            systemContent: DECODE_SYSTEM_PROMPT,
            onTurnDone: (turn) => verifierRecordTurn(modal, turn),
        }));

    } catch (_err) {
        // sendTurn already logged and finalized the error bubble
    }
}

async function decodeVerifierOutput(modal) {
    const decodeBtn = modal.querySelector('#wf-ops-verifier-decode-btn');
    if (!hasVerifierAiKey()) {
        Logger.warn('Diagnose Issues blocked — no OpenRouter key stored');
        return;
    }
    const codeEl = modal.querySelector('#wf-ops-verifier-output');
    const ta = modal.querySelector('#wf-ops-verifier-scratchpad');
    const codeText = codeEl ? String(codeEl.textContent || '').trim() : '';
    const outputText = ta ? String(ta.value || '').trim() : '';

    if (!codeText) {
        Logger.warn('Diagnose Issues blocked — empty verifier code');
        if (Context.buttonFeedback && decodeBtn) Context.buttonFeedback.flashFailure(decodeBtn);
        return;
    }
    if (!outputText) {
        Logger.warn('Diagnose Issues blocked — empty Verifier Output');
        if (Context.buttonFeedback && decodeBtn) Context.buttonFeedback.flashFailure(decodeBtn);
        return;
    }

    const chat = verifierChatApi();
    const state = getVerifierChatState(modal);
    if (!chat || !state) {
        Logger.error('Diagnose Issues blocked — Context.aiChat unavailable');
        return;
    }
    if (state.streaming) {
        Logger.warn('Diagnose Issues blocked — stream in progress');
        return;
    }

    ensureVerifierChatPaneOpen(modal);
    if (typeof chat.ensureMounted === 'function') {
        try {
            await chat.ensureMounted(modal, state, verifierChatOpts());
        } catch (err) {
            Logger.error('chat mount failed before Diagnose', err);
            if (Context.buttonFeedback && decodeBtn) Context.buttonFeedback.flashFailure(decodeBtn);
            return;
        }
    }
    if (Context.buttonFeedback && decodeBtn) Context.buttonFeedback.flashSuccess(decodeBtn);

    const attachments = takeVerifierAttachmentsForTurn(modal, state);
    const parts = [];
    const apiBlock = buildVerifierSourcesApiBlock(attachments);
    if (apiBlock) parts.push(apiBlock);
    parts.push('## Verifier Output\n\n```\n' + outputText + '\n```');
    const userPayload = parts.join('\n\n');

    Logger.debug('Diagnose Issues started'
        + (attachments.length
            ? (' · with ' + attachments.length + ' verifier attach' + (attachments.length === 1 ? '' : 'es'))
            : ' · without new verifier attach'));
    try {
        await chat.sendTurn(modal, state, Object.assign({}, verifierChatOpts(), {
            userContent: userPayload,
            displayContent: 'Diagnose Issues',
            displayAttachments: attachments,
            displayAttachment: attachments[0] || null,
            systemContent: DECODE_SYSTEM_PROMPT,
            onTurnDone: (turn) => verifierRecordTurn(modal, Object.assign({}, turn, {
                userPreview: 'Diagnose Issues',
            })),
        }));
        Logger.log('Diagnose Issues done');
    } catch (err) {
        if (Context.buttonFeedback && decodeBtn) Context.buttonFeedback.flashFailure(decodeBtn);
        Logger.error('Diagnose Issues failed: ' + ((err && err.message) || err));
    }
}

function wireVerifierChatComposer(modal) {
    const chat = verifierChatApi();
    if (!chat || typeof chat.wireComposer !== 'function') return;
    chat.wireComposer(modal, getVerifierChatState(modal), Object.assign({}, verifierChatOpts(), {
        onSend: (value) => sendVerifierChatMessage(modal, value),
        onStop: () => stopVerifierChatStream(modal),
        onExport: () => {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            chat.exportConversation(
                getVerifierChatState(modal),
                Object.assign({}, verifierChatOpts(), {
                    exportFilename: 'verifier-chat-' + stamp + '.json',
                    exportMetadata: { feature: 'verifier-fetcher' },
                })
            );
        },

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

/**
 * Show the chat pane without remounting/syncing Deep Chat history.
 * Used on the send path so an async history refresh cannot race the live turn.
 */
function ensureVerifierChatPaneOpen(modal) {
    if (!modal) return;
    ensureVerifierBtnStyles();
    writeVerifierChatOpenPref(true);
    const chatToggle = modal.querySelector('#wf-ops-verifier-chat-toggle');
    const decodeBtn = modal.querySelector('#wf-ops-verifier-decode-btn');
    const chatPane = modal.querySelector('#wf-ops-verifier-chat-pane');
    const workspace = modal.querySelector('#wf-ops-verifier-workspace');
    const ai = hasVerifierAiKey();

    if (chatToggle) {
        chatToggle.style.display = '';
        chatToggle.textContent = 'Hide chat';
        chatToggle.setAttribute('aria-pressed', 'true');
    }
    if (decodeBtn) {
        decodeBtn.style.display = '';
        decodeBtn.disabled = !ai;
        decodeBtn.style.opacity = ai ? '' : '0.5';
        decodeBtn.title = ai
            ? ''
            : 'Requires an OpenRouter API key in Settings';
    }
    if (chatPane) {
        chatPane.style.display = 'flex';
        chatPane.setAttribute('aria-hidden', 'false');
    }
    if (workspace) workspace.setAttribute('data-wf-ai-chat', '1');
}

function syncVerifierAiUi(modal) {
    if (!modal) return;
    ensureVerifierBtnStyles();
    const ai = hasVerifierAiKey();
    const chatOpen = readVerifierChatOpenPref();
    const chatToggle = modal.querySelector('#wf-ops-verifier-chat-toggle');
    const decodeBtn = modal.querySelector('#wf-ops-verifier-decode-btn');
    const chatPane = modal.querySelector('#wf-ops-verifier-chat-pane');
    const workspace = modal.querySelector('#wf-ops-verifier-workspace');

    if (chatToggle) {
        chatToggle.style.display = '';
        chatToggle.textContent = chatOpen ? 'Hide chat' : 'Chat';
        chatToggle.setAttribute('aria-pressed', chatOpen ? 'true' : 'false');
    }
    if (decodeBtn) {
        decodeBtn.style.display = '';
        decodeBtn.disabled = !ai;
        decodeBtn.style.opacity = ai ? '' : '0.5';
        decodeBtn.title = ai
            ? ''
            : 'Requires an OpenRouter API key in Settings';
    }
    if (chatPane) {
        chatPane.style.display = chatOpen ? 'flex' : 'none';
        chatPane.setAttribute('aria-hidden', chatOpen ? 'false' : 'true');
    }
    if (workspace) workspace.setAttribute('data-wf-ai-chat', chatOpen ? '1' : '0');
    if (chatOpen) {
        wireVerifierChatComposer(modal);
        renderVerifierChatMessages(modal);
        setVerifierChatStreamingUi(modal, !!(getVerifierChatState(modal).streaming));
        syncVerifierPendingAttachTray(modal);
        const chat = verifierChatApi();
        if (chat && typeof chat.setKeyGate === 'function') {
            chat.setKeyGate(modal, {
                mountSelector: '#wf-ops-verifier-chat-mount',
                state: getVerifierChatState(modal),
                wireOpts: verifierChatOpts(),
            });
        }
    }
    Logger.debug('syncAiUi ai=' + ai + ' chatOpen=' + chatOpen);
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
                Logger.log('verifier output width set to ' + finalWidth + 'px');
            }
        });
    });
}

function restoreVerifierScratchpadState(modal) {
    if (!modal) return;
    const textarea = modal.querySelector('#wf-ops-verifier-scratchpad');
    if (textarea && !textarea.dataset.wfScratchpadRestored) {
        textarea.dataset.wfScratchpadRestored = '1';
    }
    applyVerifierScratchpadLayout(modal);
    syncVerifierAiUi(modal);
}

function syncVerifierOutputToolbar(modal) {
    if (!modal) return;
    // Layout only — do not remount/sync AI chat here. Ops calls this after every
    // content-search UI refresh (including late highlight after Fetch), which
    // would race Diagnose/send and wipe the live Deep Chat turn.
    applyVerifierScratchpadLayout(modal);
}

function captureVerifierScratchpadTabState(modal) {
    if (!modal) return null;
    const textarea = modal.querySelector('#wf-ops-verifier-scratchpad');
    return {
        open: readVerifierScratchpadOpenPref(),
        text: textarea ? textarea.value : '',
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
        const text = state && state.text != null ? String(state.text) : '';
        textarea.value = text;
        textarea.dataset.wfScratchpadRestored = '1';
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
                                <input type="text" id="wf-ops-verifier-input" placeholder="Paste here" autocomplete="off" style="${monoInputStyle} flex: 1 1 auto; min-width: 0; max-width: none;">
                                <select id="wf-ops-verifier-version" aria-label="Task version" title="Task version" style="display: none; flex: 0 0 7.5rem; width: 7.5rem; max-width: 7.5rem; ${monoInputStyle}"></select>
                                <button type="button" id="wf-ops-fetch-verifier" class="${btnClass('primary', 'regular')}" style="flex-shrink: 0;">Fetch</button>
                            </div>
                            <div id="wf-ops-verifier-status-row" style="display: none; margin-top: 8px;">
                                <div id="wf-ops-verifier-status" style="${hintStyle} line-height: 1.45;"></div>
                            </div>
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
                                <button type="button" id="wf-ops-verifier-add-diff" class="${btnClass('secondary', 'nav')}" style="display: none; flex-shrink: 0;">Add to Diff</button>
                                <button type="button" id="wf-ops-verifier-add-chat" class="${btnClass('secondary', 'nav')}" style="display: none; flex-shrink: 0;">Add to Chat</button>
                                <button type="button" id="wf-ops-verifier-scratchpad-toggle" class="${btnClass('basic', 'nav')}" aria-pressed="false" style="flex-shrink: 0;">Verifier Output</button>
                                <button type="button" id="wf-ops-verifier-chat-toggle" class="${btnClass('basic', 'nav')}" aria-pressed="false" style="flex-shrink: 0;">Chat</button>
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
                                    <button type="button" id="wf-ops-verifier-decode-btn" class="${btnClass('secondary', 'compact')}">Diagnose Issues</button>
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
                        <div id="wf-ops-verifier-pending-tray" data-wf-has-items="0" aria-label="Queued verifiers"></div>
                        <div id="wf-ops-verifier-chat-mount" style="
                            flex: 1;
                            min-height: 120px;
                            display: flex;
                            flex-direction: column;
                            position: relative;
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
    ensureVerifierPendingTrayStyles();
    if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
        Context.uiLib.ensureButtonStyles('#wf-ops-verifier-pending-tray');
    }

    const verifierFetchBtn = modal.querySelector('#wf-ops-fetch-verifier');
    const verifierCopyBtn = modal.querySelector('#wf-ops-copy-verifier');
    const verifierAddDiffBtn = modal.querySelector('#wf-ops-verifier-add-diff');
    const verifierAddChatBtn = modal.querySelector('#wf-ops-verifier-add-chat');
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
            Logger.log('verifier output ' + (nextOpen ? 'shown' : 'hidden'));
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
    }

    if (chatToggle) {
        chatToggle.addEventListener('click', () => {
            const nextOpen = !readVerifierChatOpenPref();
            writeVerifierChatOpenPref(nextOpen);
            syncVerifierAiUi(modal);
            Logger.log('chat ' + (nextOpen ? 'shown' : 'hidden'));
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
    }

    if (decodeBtn) {
        decodeBtn.addEventListener('click', () => {
            if (!hasVerifierAiKey()) {
                Logger.warn('Diagnose Issues blocked — no OpenRouter key stored');
                return;
            }
            void decodeVerifierOutput(modal);
        });
    }

    if (scratchpadTextarea) {
        scratchpadTextarea.addEventListener('input', () => {
            if (typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
        });
    }

    if (verifierFetchBtn && typeof ops.handleVerifierFetch === 'function') {
        verifierFetchBtn.addEventListener('click', () => { void ops.handleVerifierFetch(modal); });
    }
    if (verifierInput && typeof ops.handleVerifierFetch === 'function') {
        let hydrateTimer = null;
        const scheduleHydrate = () => {
            if (typeof ops.hydrateVerifierTaskVersionOptions !== 'function') return;
            if (hydrateTimer) clearTimeout(hydrateTimer);
            hydrateTimer = setTimeout(() => {
                hydrateTimer = null;
                void ops.hydrateVerifierTaskVersionOptions(modal, {});
            }, 250);
        };
        verifierInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); void ops.handleVerifierFetch(modal); }
        });
        const onVerifierInput = () => {
            if (typeof ops.setVerifierStatus === 'function') ops.setVerifierStatus(modal, '');
            scheduleHydrate();
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
    if (verifierAddDiffBtn && typeof ops.addVerifierToDiff === 'function') {
        verifierAddDiffBtn.addEventListener('click', () => { ops.addVerifierToDiff(modal); });
    }
    if (verifierAddChatBtn && typeof ops.queueVerifierToChat === 'function') {
        verifierAddChatBtn.addEventListener('click', () => { ops.queueVerifierToChat(modal); });
    }
    modal.addEventListener('click', (e) => {
        const removeBtn = e.target && e.target.closest
            ? e.target.closest('[data-wf-pending-remove]')
            : null;
        if (!removeBtn || !modal.contains(removeBtn)) return;
        e.preventDefault();
        e.stopPropagation();
        const key = removeBtn.getAttribute('data-wf-pending-remove') || '';
        removeVerifierChatQueueItem(modal, key);
        syncVerifierPendingAttachTray(modal);
        const opsTab = Context.opsTab;
        if (opsTab && typeof opsTab.setVerifierStatus === 'function') {
            const n = getVerifierChatQueue(modal).length;
            opsTab.setVerifierStatus(
                modal,
                n === 0 ? '' : (n === 1 ? '1 verifier queued' : (n + ' verifiers queued'))
            );
        }
    });
    if (typeof ops.restoreVerifierTabState === 'function') ops.restoreVerifierTabState(modal);
    syncVerifierAiUi(modal);
    syncVerifierPendingAttachTray(modal);
}

const plugin = {
    id: 'verifier-fetcher',
    name: 'Verifier Fetcher',
    description: 'Verifier code fetch tab for the Ops dashboard (Verifier Output + optional AI Decode/chat)',
    _version: '8.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        clearLegacyVerifierScratchpadText();
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            Logger.error('dashboard loader not registered');
            return;
        }
        Context.verifierFetcherUi = {
            syncOutputToolbar: (modal) => syncVerifierOutputToolbar(modal),
            syncAiUi: (modal) => syncVerifierAiUi(modal),
            captureScratchpadTabState: (modal) => captureVerifierScratchpadTabState(modal),
            restoreScratchpadTabState: (modal, state) => restoreVerifierScratchpadTabState(modal, state),
            setChatFetchContext: (modal, ctx) => setVerifierChatFetchContext(modal, ctx),
            queueChatAttachment: (modal, ctx) => queueVerifierChatAttachmentAndShow(modal, ctx),
            getChatQueueLength: (modal) => getVerifierChatQueue(modal).length,
            clearChatQueue: (modal) => {
                clearVerifierChatQueue(modal);
                syncVerifierPendingAttachTray(modal);
            },
            syncPendingAttachTray: (modal) => syncVerifierPendingAttachTray(modal),
        };
        Context.dashboard.registerTab({
            id: 'verifier-fetcher',
            label: 'Verifier Fetcher',
            panelHtml() { return verifierFetcherPanelHtml(); },
            attachListeners(modal) { attachVerifierFetcherListeners(modal); },
            onActivate(modal) {
                syncVerifierOutputToolbar(modal);
                syncVerifierAiUi(modal);
                syncVerifierPendingAttachTray(modal);
                Logger.debug('tab activated');
            },
            captureState(modal, dash) {
                const ops = Context.opsTab;
                if (ops && typeof ops.captureVerifierTabState === 'function') ops.captureVerifierTabState(modal);
            }
        });
        Logger.log('tab registered');
    }
};
