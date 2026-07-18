// ============= dashboard-chats.js =============
// Ops dashboard "Chats" tab: conversation sidebar + chat window.
// Persists only generation IDs + titles (no transcripts). Hydrates from
// OpenRouter GET /generation/content and continues via message replay.
//
// Also owns Context.dashboardChats so Explain Ratings / Verifier can record turns.

const PLUGIN_ID = 'dashboard-chats';
const CHATS_INDEX_KEY = 'fleet-ux:ai-chats-index';
const CHATS_SCOPE = '[data-wf-dash-chats-panel]';
const CHATS_SOURCES = [
    { id: 'chats', label: 'Chats' },
    { id: 'explain-ratings', label: 'Explain Ratings' },
    { id: 'verifier', label: 'Verifier' },
];

/** @type {{ conversations: object[], activeId: string|null, chatState: object|null, hydrating: boolean, listeners: Set<Function> }} */
const chatsUi = {
    conversations: [],
    activeId: null,
    chatState: null,
    hydrating: false,
    listeners: new Set(),
};

function chatsEscHtml(value) {
    const lib = Context.dashboardLib;
    if (lib && typeof lib.escHtml === 'function') return lib.escHtml(value);
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function chatsBtnClass(variant, size) {
    if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
        return Context.uiLib.btnClass(variant, size);
    }
    return 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size;
}

function chatsEnsureBtnStyles() {
    if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
        Context.uiLib.ensureButtonStyles(CHATS_SCOPE);
    }
}

function chatsHasAiKey() {
    return !!(Context.aiOpenRouter
        && typeof Context.aiOpenRouter.hasStoredKey === 'function'
        && Context.aiOpenRouter.hasStoredKey());
}

function chatsUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'chat-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function chatsTitleFromHint(hint, fallback) {
    const raw = String(hint || '').replace(/\s+/g, ' ').trim();
    if (!raw) return fallback || 'Untitled chat';
    return raw.length > 48 ? (raw.slice(0, 47) + '…') : raw;
}

function chatsReadIndex() {
    try {
        const raw = Storage.getData(CHATS_INDEX_KEY, null);
        if (!raw) return { version: 1, conversations: [] };
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || typeof parsed !== 'object') return { version: 1, conversations: [] };
        const list = Array.isArray(parsed.conversations) ? parsed.conversations : [];
        return { version: 1, conversations: list.filter((c) => c && c.id) };
    } catch (err) {
        Logger.warn(PLUGIN_ID + ': failed to read chats index', err);
        return { version: 1, conversations: [] };
    }
}

function chatsWriteIndex(index) {
    const payload = {
        version: 1,
        conversations: Array.isArray(index && index.conversations) ? index.conversations : [],
    };
    Storage.setData(CHATS_INDEX_KEY, JSON.stringify(payload));
    chatsUi.conversations = payload.conversations.slice();
    for (const fn of chatsUi.listeners) {
        try { fn(payload.conversations); } catch (_e) { /* ignore */ }
    }
}

function chatsFindBySourceKey(conversations, source, conversationKey) {
    const src = String(source || '');
    const key = String(conversationKey || '');
    return conversations.find((c) => String(c.source) === src && String(c.conversationKey) === key) || null;
}

function chatsRecordTurn(opts) {
    const o = opts || {};
    const source = String(o.source || '').trim();
    const conversationKey = String(o.conversationKey || '').trim();
    const generationId = o.generationId != null ? String(o.generationId).trim() : '';
    const model = o.model != null ? String(o.model).trim() : '';
    const titleHint = o.titleHint != null ? String(o.titleHint) : '';

    if (!source || !conversationKey) {
        Logger.warn(PLUGIN_ID + ': recordTurn skipped — missing source/conversationKey');
        return null;
    }
    if (!generationId) {
        const level = source === 'chats' ? 'error' : 'warn';
        Logger[level](PLUGIN_ID + ': recordTurn missing generationId — source=' + source
            + ' key=' + conversationKey);
        if (source === 'chats') return null;
    }

    const index = chatsReadIndex();
    let conv = chatsFindBySourceKey(index.conversations, source, conversationKey);
    const now = new Date().toISOString();
    if (!conv) {
        conv = {
            id: chatsUuid(),
            source,
            conversationKey,
            title: chatsTitleFromHint(titleHint, source === 'chats' ? 'New chat' : source),
            createdAt: now,
            updatedAt: now,
            model: model || null,
            generationIds: [],
        };
        index.conversations.push(conv);
        Logger.log(PLUGIN_ID + ': created conversation — ' + source + ' · ' + conv.id);
    }
    if (generationId) {
        const last = conv.generationIds[conv.generationIds.length - 1];
        if (last !== generationId) conv.generationIds.push(generationId);
    }
    if (model) conv.model = model;
    // Auto-title from the first usable hint until the user renames.
    if (titleHint && !conv.titleUserSet && conv.generationIds.length <= 1) {
        conv.title = chatsTitleFromHint(titleHint, conv.title);
    }
    conv.updatedAt = now;
    chatsWriteIndex(index);
    Logger.log(PLUGIN_ID + ': recorded turn — ' + source + ' · ' + conv.id
        + (generationId ? ' · gen ' + generationId : ''));
    return conv;
}

function chatsListConversations(source) {
    const index = chatsReadIndex();
    let list = index.conversations.slice();
    if (source) list = list.filter((c) => String(c.source) === String(source));
    list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return list;
}

function chatsGetConversation(id) {
    const want = String(id || '');
    return chatsReadIndex().conversations.find((c) => String(c.id) === want) || null;
}

function chatsRenameConversation(id, title) {
    const index = chatsReadIndex();
    const conv = index.conversations.find((c) => String(c.id) === String(id));
    if (!conv) return false;
    const next = String(title || '').trim();
    if (!next) return false;
    conv.title = next.slice(0, 80);
    conv.titleUserSet = true;
    conv.updatedAt = new Date().toISOString();
    chatsWriteIndex(index);
    Logger.log(PLUGIN_ID + ': renamed conversation — ' + conv.id);
    return true;
}

function chatsDeleteConversation(id) {
    const index = chatsReadIndex();
    const before = index.conversations.length;
    index.conversations = index.conversations.filter((c) => String(c.id) !== String(id));
    if (index.conversations.length === before) return false;
    chatsWriteIndex(index);
    if (chatsUi.activeId === String(id)) {
        chatsUi.activeId = null;
        chatsUi.chatState = null;
    }
    Logger.log(PLUGIN_ID + ': deleted conversation — ' + id);
    return true;
}

function chatsOnIndexChange(fn) {
    if (typeof fn !== 'function') return () => {};
    chatsUi.listeners.add(fn);
    return () => chatsUi.listeners.delete(fn);
}

function chatsMessagesFromGenerationContent(data) {
    const out = [];
    const input = data && data.input;
    if (input && Array.isArray(input.messages)) {
        for (const m of input.messages) {
            if (!m || !m.role) continue;
            const role = String(m.role);
            if (role !== 'system' && role !== 'user' && role !== 'assistant') continue;
            out.push({ role, content: String(m.content || '') });
        }
    } else if (input && typeof input.prompt === 'string' && input.prompt.trim()) {
        out.push({ role: 'user', content: String(input.prompt) });
    }
    const completion = data && data.output && data.output.completion != null
        ? String(data.output.completion)
        : '';
    if (completion) {
        const last = out[out.length - 1];
        if (last && last.role === 'assistant') {
            last.content = completion;
        } else {
            out.push({ role: 'assistant', content: completion });
        }
    }
    return out;
}

async function chatsFetchMessagesForConversation(conv) {
    const ai = Context.aiOpenRouter;
    if (!ai || typeof ai.generationContent !== 'function') {
        throw new Error('OpenRouter generationContent API is not available');
    }
    const ids = Array.isArray(conv.generationIds) ? conv.generationIds.slice() : [];
    if (!ids.length) throw new Error('This conversation has no generation ids yet');

    let lastErr = null;
    for (let i = ids.length - 1; i >= 0; i--) {
        const genId = ids[i];
        try {
            const data = await ai.generationContent(genId);
            const messages = chatsMessagesFromGenerationContent(data);
            if (!messages.length) {
                lastErr = new Error('Generation ' + genId + ' had no recoverable messages');
                continue;
            }
            Logger.log(PLUGIN_ID + ': hydrated conversation — ' + conv.id + ' · gen ' + genId
                + ' · ' + messages.length + ' message(s)');
            return { messages, generationId: genId };
        } catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err));
            Logger.warn(PLUGIN_ID + ': hydrate failed for gen ' + genId + ' — '
                + lastErr.message);
        }
    }
    throw lastErr || new Error('Could not hydrate conversation');
}

function chatsChatOpts() {
    return {
        messagesSelector: '[data-wf-dash-chats-messages]',
        sendSelector: '[data-wf-dash-chats-send]',
        stopSelector: '[data-wf-dash-chats-stop]',
        exportSelector: '[data-wf-dash-chats-export]',
        inputSelector: '[data-wf-dash-chats-input]',
        wiredAttr: 'data-wf-dash-chats-wired',
        logTag: PLUGIN_ID,
    };
}

function chatsActiveConversation() {
    return chatsUi.activeId ? chatsGetConversation(chatsUi.activeId) : null;
}

function chatsEnsureChatState() {
    const chat = Context.aiChat;
    if (!chatsUi.chatState) {
        chatsUi.chatState = chat && typeof chat.createState === 'function'
            ? chat.createState()
            : { messages: [], streaming: false, streamAbort: null, streamGen: 0 };
    }
    return chatsUi.chatState;
}

function chatsSetStatus(panel, message, isError) {
    const el = panel && panel.querySelector('[data-wf-dash-chats-status]');
    if (!el) return;
    const text = String(message || '').trim();
    if (!text) {
        el.style.display = 'none';
        el.textContent = '';
        return;
    }
    el.style.display = '';
    el.textContent = text;
    el.style.color = isError ? 'var(--destructive, #b91c1c)' : 'var(--muted-foreground, #64748b)';
}

function chatsPanelHtml() {
    const btn = chatsBtnClass('basic', 'compact');
    const btnPrimary = chatsBtnClass('primary', 'compact');
    const inputStyle = 'width: 100%; padding: 7px 10px; font-size: 12px; border: 1px solid var(--input, #cbd5e1);'
        + ' border-radius: 6px; background: var(--background, #fff); color: var(--foreground, #0f172a);'
        + ' box-sizing: border-box; resize: vertical; min-height: 56px;';
    return '<div data-wf-dash-chats-panel="1" style="display: flex; flex-direction: column; gap: 10px;'
        + ' height: 100%; min-height: 420px; box-sizing: border-box;">'
        + '<div data-wf-dash-chats-no-key style="display: none; font-size: 12px; line-height: 1.45;'
        + ' color: var(--muted-foreground, #64748b); padding: 12px;'
        + ' border: 1px dashed var(--border, #e2e8f0); border-radius: 8px;">'
        + 'Add an OpenRouter API key in the <strong>Settings</strong> tab to use Chats.'
        + ' Conversations require Input &amp; Output Logging enabled in your OpenRouter Observability settings'
        + ' so transcripts can be fetched by generation id.</div>'
        + '<div data-wf-dash-chats-body style="display: none; flex: 1 1 auto; min-height: 0;">'
        + '<div style="display: flex; gap: 10px; height: 100%; min-height: 0;">'
        + '<aside data-wf-dash-chats-sidebar style="width: 260px; flex-shrink: 0; display: flex;'
        + ' flex-direction: column; gap: 8px; min-height: 0; border: 1px solid var(--border, #e2e8f0);'
        + ' border-radius: 8px; padding: 8px; background: color-mix(in srgb, var(--muted, #f1f5f9) 40%, transparent);'
        + ' overflow: hidden;">'
        + '<button type="button" data-wf-dash-chats-new class="' + btnPrimary + '" style="width: 100%;">New Chat</button>'
        + '<div data-wf-dash-chats-list style="flex: 1 1 auto; overflow: auto; display: flex;'
        + ' flex-direction: column; gap: 10px;"></div>'
        + '</aside>'
        + '<section style="flex: 1 1 auto; min-width: 0; min-height: 0; display: flex;'
        + ' flex-direction: column; gap: 8px; border: 1px solid var(--border, #e2e8f0);'
        + ' border-radius: 8px; padding: 10px;">'
        + '<div data-wf-dash-chats-title style="font-size: 13px; font-weight: 600;">New chat</div>'
        + '<div data-wf-dash-chats-status style="display: none; font-size: 11px;"></div>'
        + '<div data-wf-dash-chats-messages style="flex: 1 1 auto; min-height: 180px; overflow: auto;'
        + ' display: flex; flex-direction: column; gap: 10px; padding: 4px 2px;"></div>'
        + '<div style="display: flex; flex-direction: column; gap: 6px;">'
        + '<textarea data-wf-dash-chats-input rows="2" placeholder="Message…" style="' + inputStyle + '"></textarea>'
        + '<div style="display: flex; gap: 6px; justify-content: flex-end;">'
        + '<button type="button" data-wf-dash-chats-export class="' + btn + '">Export</button>'
        + '<button type="button" data-wf-dash-chats-stop class="' + btn + '" style="display: none;">Stop</button>'
        + '<button type="button" data-wf-dash-chats-send class="' + btnPrimary + '">Send</button>'
        + '</div></div></section></div></div></div>';
}

function chatsRenderSidebar(panel) {
    const list = panel && panel.querySelector('[data-wf-dash-chats-list]');
    if (!list) return;
    const all = chatsListConversations();
    chatsUi.conversations = all;
    let html = '';
    for (const section of CHATS_SOURCES) {
        const rows = all.filter((c) => String(c.source) === section.id);
        html += '<div data-wf-dash-chats-section="' + chatsEscHtml(section.id) + '">'
            + '<div style="font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;'
            + ' color: var(--muted-foreground, #64748b); margin: 0 0 4px;">'
            + chatsEscHtml(section.label)
            + (rows.length ? ' (' + rows.length + ')' : '')
            + '</div>';
        if (!rows.length) {
            html += '<div style="font-size: 11px; color: var(--muted-foreground, #64748b);'
                + ' margin-bottom: 4px;">None yet</div>';
        } else {
            for (const conv of rows) {
                const active = String(conv.id) === String(chatsUi.activeId);
                html += '<div data-wf-dash-chats-item="' + chatsEscHtml(conv.id) + '"'
                    + ' style="display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">'
                    + '<button type="button" data-wf-dash-chats-open="' + chatsEscHtml(conv.id) + '"'
                    + ' class="' + chatsBtnClass('basic', 'compact') + '" style="flex: 1 1 auto; min-width: 0;'
                    + ' justify-content: flex-start; text-align: left;'
                    + (active ? ' outline: 1px solid var(--primary, #2563eb);' : '') + '">'
                    + '<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'
                    + ' display: block;">' + chatsEscHtml(conv.title || 'Untitled') + '</span>'
                    + '</button>'
                    + '<button type="button" data-wf-dash-chats-rename="' + chatsEscHtml(conv.id) + '"'
                    + ' class="' + chatsBtnClass('basic', 'icon') + '" title="Rename" aria-label="Rename">✎</button>'
                    + '<button type="button" data-wf-dash-chats-delete="' + chatsEscHtml(conv.id) + '"'
                    + ' class="' + chatsBtnClass('basic', 'icon') + '" title="Delete" aria-label="Delete">✕</button>'
                    + '</div>';
            }
        }
        html += '</div>';
    }
    list.innerHTML = html;
}

function chatsUpdateTitle(panel) {
    const el = panel && panel.querySelector('[data-wf-dash-chats-title]');
    if (!el) return;
    const conv = chatsActiveConversation();
    if (!conv) {
        el.textContent = 'New chat';
        return;
    }
    const src = CHATS_SOURCES.find((s) => s.id === conv.source);
    el.textContent = (src ? src.label + ' · ' : '') + (conv.title || 'Untitled');
}

function chatsStartNewChat(panel) {
    const chat = Context.aiChat;
    if (!chat) return;
    chatsUi.activeId = null;
    chatsUi.chatState = chat.createState({
        source: 'chats',
        conversationKey: chatsUuid(),
    });
    chatsSetStatus(panel, '', false);
    chatsUpdateTitle(panel);
    chatsRenderSidebar(panel);
    chat.renderMessages(panel, chatsUi.chatState, chatsChatOpts());
    const input = panel.querySelector('[data-wf-dash-chats-input]');
    if (input) input.focus();
    Logger.log(PLUGIN_ID + ': new chat started');
}

async function chatsOpenConversation(panel, conversationId) {
    const chat = Context.aiChat;
    const conv = chatsGetConversation(conversationId);
    if (!chat || !conv) {
        Logger.warn(PLUGIN_ID + ': open skipped — conversation not found');
        return;
    }
    chatsUi.activeId = conv.id;
    chatsUi.hydrating = true;
    chatsSetStatus(panel, 'Loading conversation from OpenRouter…', false);
    chatsUpdateTitle(panel);
    chatsRenderSidebar(panel);
    const state = chat.createState({
        source: conv.source,
        conversationKey: conv.conversationKey,
    });
    chatsUi.chatState = state;
    chat.renderMessages(panel, state, chatsChatOpts());
    try {
        const hydrated = await chatsFetchMessagesForConversation(conv);
        state.messages = hydrated.messages;
        state.lastGenerationId = hydrated.generationId;
        chat.renderMessages(panel, state, chatsChatOpts());
        chatsSetStatus(panel, '', false);
        Logger.log(PLUGIN_ID + ': opened conversation — ' + conv.id);
    } catch (err) {
        chatsSetStatus(panel, (err && err.message) || String(err), true);
        Logger.error(PLUGIN_ID + ': open failed — ' + conv.id, err);
    } finally {
        chatsUi.hydrating = false;
        chatsRenderSidebar(panel);
    }
}

async function chatsSendMessage(panel, userText) {
    const chat = Context.aiChat;
    const state = chatsEnsureChatState();
    const text = String(userText || '').trim();
    if (!chat || !state || !text || state.streaming || chatsUi.hydrating) return;

    const isNew = !chatsUi.activeId;
    const conversationKey = state.conversationKey || chatsUuid();
    state.conversationKey = conversationKey;
    state.source = state.source || 'chats';

    try {
        await chat.sendTurn(panel, state, Object.assign({}, chatsChatOpts(), {
            userText: text,
            onTurnDone: ({ generationId, model, userPreview }) => {
                const source = state.source || 'chats';
                const recorded = chatsRecordTurn({
                    source,
                    conversationKey,
                    titleHint: userPreview || text,
                    generationId,
                    model,
                });
                if (source === 'chats' && !generationId) {
                    chatsSetStatus(panel, 'Turn completed but no generation id was returned — conversation was not saved.', true);
                }
                if (recorded) {
                    chatsUi.activeId = recorded.id;
                    chatsUpdateTitle(panel);
                    chatsRenderSidebar(panel);
                }
            },
        }));
        if (isNew && chatsUi.activeId) {
            Logger.log(PLUGIN_ID + ': first turn saved — ' + chatsUi.activeId);
        }
    } catch (_err) {
        // sendTurn already logged
    }
}

function chatsWirePanel(panel) {
    if (!panel || panel.getAttribute('data-wf-dash-chats-bound') === '1') return;
    panel.setAttribute('data-wf-dash-chats-bound', '1');
    chatsEnsureBtnStyles();

    panel.addEventListener('click', (e) => {
        const newBtn = e.target.closest('[data-wf-dash-chats-new]');
        if (newBtn && panel.contains(newBtn)) {
            chatsStartNewChat(panel);
            return;
        }
        const openBtn = e.target.closest('[data-wf-dash-chats-open]');
        if (openBtn && panel.contains(openBtn)) {
            void chatsOpenConversation(panel, openBtn.getAttribute('data-wf-dash-chats-open'));
            return;
        }
        const renameBtn = e.target.closest('[data-wf-dash-chats-rename]');
        if (renameBtn && panel.contains(renameBtn)) {
            const id = renameBtn.getAttribute('data-wf-dash-chats-rename');
            const conv = chatsGetConversation(id);
            const next = window.prompt('Rename conversation', conv && conv.title ? conv.title : '');
            if (next != null && String(next).trim()) {
                chatsRenameConversation(id, next);
                chatsUpdateTitle(panel);
                chatsRenderSidebar(panel);
            }
            return;
        }
        const deleteBtn = e.target.closest('[data-wf-dash-chats-delete]');
        if (deleteBtn && panel.contains(deleteBtn)) {
            const id = deleteBtn.getAttribute('data-wf-dash-chats-delete');
            if (window.confirm('Delete this conversation from the local index? (OpenRouter logs are unchanged.)')) {
                const wasActive = String(chatsUi.activeId) === String(id);
                chatsDeleteConversation(id);
                if (wasActive) chatsStartNewChat(panel);
                else chatsRenderSidebar(panel);
            }
        }
    });

    const chat = Context.aiChat;
    if (chat && typeof chat.wireComposer === 'function') {
        chat.wireComposer(panel, Object.assign({}, chatsChatOpts(), {
            onSend: (value) => void chatsSendMessage(panel, value),
            onStop: () => {
                const state = chatsUi.chatState;
                if (!state) return;
                chat.stopStream(state, chatsChatOpts());
                chat.setStreamingUi(panel, state, false, chatsChatOpts());
                chat.renderMessages(panel, state, chatsChatOpts());
            },
            onExport: () => {
                const state = chatsUi.chatState;
                if (!state) return;
                const conv = chatsActiveConversation();
                const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                const slug = String((conv && conv.title) || 'chat')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .slice(0, 48) || 'chat';
                chat.exportConversation(state, Object.assign({}, chatsChatOpts(), {
                    exportFilename: 'conversation-' + slug + '-' + stamp + '.json',
                    exportMetadata: {
                        feature: 'dashboard-chats',
                        conversationId: conv && conv.id,
                        source: conv && conv.source,
                    },
                }));
            },
        }));
    }

    chatsOnIndexChange(() => {
        if (panel.isConnected) chatsRenderSidebar(panel);
    });
}

function chatsSyncPanel(panel) {
    if (!panel) return;
    chatsEnsureBtnStyles();
    const noKey = panel.querySelector('[data-wf-dash-chats-no-key]');
    const body = panel.querySelector('[data-wf-dash-chats-body]');
    const hasKey = chatsHasAiKey();
    if (noKey) noKey.style.display = hasKey ? 'none' : '';
    if (body) {
        body.style.display = hasKey ? 'flex' : 'none';
        body.style.flex = '1 1 auto';
        body.style.minHeight = '0';
        body.style.flexDirection = 'column';
    }
    if (!hasKey) return;
    chatsWirePanel(panel);
    if (!chatsUi.chatState) chatsStartNewChat(panel);
    else {
        chatsRenderSidebar(panel);
        chatsUpdateTitle(panel);
        const chat = Context.aiChat;
        if (chat && chatsUi.chatState) {
            chat.renderMessages(panel, chatsUi.chatState, chatsChatOpts());
        }
    }
}

const DashboardChatsApi = {
    recordTurn: chatsRecordTurn,
    listConversations: chatsListConversations,
    getConversation: chatsGetConversation,
    renameConversation: chatsRenameConversation,
    deleteConversation: chatsDeleteConversation,
    onIndexChange: chatsOnIndexChange,
};

const plugin = {
    id: PLUGIN_ID,
    name: 'Dashboard Chats',
    description: 'Ops dashboard Chats tab — OpenRouter conversations by generation id',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            Logger.error(PLUGIN_ID + ': dashboard loader not registered');
            return;
        }
        Context.dashboardChats = DashboardChatsApi;
        Context.dashboard.registerTab({
            id: 'dash-chats',
            label: 'Chats',
            panelHtml() { return chatsPanelHtml(); },
            attachListeners(modal) {
                const panel = modal && modal.querySelector(CHATS_SCOPE);
                if (panel) chatsWirePanel(panel);
            },
            onActivate(modal) {
                const panel = modal && modal.querySelector(CHATS_SCOPE);
                chatsSyncPanel(panel);
                Logger.debug(PLUGIN_ID + ': tab activated');
            },
        });
        if (!state.registered) {
            Logger.log(PLUGIN_ID + ': tab registered (Context.dashboardChats) v1.0');
            state.registered = true;
        }
    },
};
