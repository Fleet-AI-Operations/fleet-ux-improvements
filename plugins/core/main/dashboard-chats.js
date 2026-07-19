// ============= dashboard-chats.js =============
// Ops dashboard "Chats" tab: conversation sidebar + chat window.
// Persists only generation IDs + titles (no transcripts). Hydrates from
// OpenRouter GET /generation/content and continues via message replay.
//
// Also owns Context.dashboardChats so Explain Ratings / Verifier can record turns.

const PLUGIN_ID = 'dashboard-chats';
const CHATS_INDEX_KEY = 'fleet-ux:ai-chats-index';
const CHATS_SIDEBAR_WIDTH_KEY = 'fleet-ux:dashboard-chats-sidebar-width';
const CHATS_SIDEBAR_DEFAULT_WIDTH = 260;
const CHATS_SIDEBAR_MIN_WIDTH = 180;
const CHATS_MAIN_MIN_WIDTH = 320;
const CHATS_SCOPE = '[data-wf-dash-chats-panel]';
const CHATS_SOURCES = [
    { id: 'chats', label: 'Chats' },
    { id: 'explain-ratings', label: 'Explain Ratings' },
    { id: 'verifier', label: 'Verifier' },
    { id: 'search-chat', label: 'Search Chat' },
];

/** @type {{ conversations: object[], activeId: string|null, chatState: object|null, hydrating: boolean, listeners: Set<Function> }} */
const chatsUi = {
    conversations: [],
    activeId: null,
    chatState: null,
    hydrating: false,
    listeners: new Set(),
};
let chatsRatingRendererMissingLogged = false;

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

function chatsReadSidebarWidth() {
    try {
        const width = parseInt(Storage.getData(CHATS_SIDEBAR_WIDTH_KEY, null), 10);
        return Number.isFinite(width) && width >= CHATS_SIDEBAR_MIN_WIDTH
            ? width
            : CHATS_SIDEBAR_DEFAULT_WIDTH;
    } catch (_e) {
        return CHATS_SIDEBAR_DEFAULT_WIDTH;
    }
}

function chatsClampSidebarWidth(body, width) {
    const available = body ? body.getBoundingClientRect().width : 0;
    const max = available > 0
        ? Math.max(CHATS_SIDEBAR_MIN_WIDTH, available - CHATS_MAIN_MIN_WIDTH - 18)
        : CHATS_SIDEBAR_DEFAULT_WIDTH;
    return Math.round(Math.max(CHATS_SIDEBAR_MIN_WIDTH, Math.min(max, width)));
}

function chatsWriteSidebarWidth(width) {
    try {
        Storage.setData(CHATS_SIDEBAR_WIDTH_KEY, String(Math.round(width)));
    } catch (err) {
        Logger.warn(PLUGIN_ID + ': failed to save sidebar width', err);
    }
}

function chatsApplySidebarWidth(panel, widthOverride) {
    const body = panel && panel.querySelector('[data-wf-dash-chats-body-row]');
    const sidebar = panel && panel.querySelector('[data-wf-dash-chats-sidebar]');
    const handle = panel && panel.querySelector('[data-wf-dash-chats-resize-handle]');
    if (!body || !sidebar) return 0;
    const width = chatsClampSidebarWidth(body, widthOverride || chatsReadSidebarWidth());
    sidebar.style.width = width + 'px';
    sidebar.style.flexBasis = width + 'px';
    sidebar.style.maxWidth = width + 'px';
    if (handle) handle.setAttribute('aria-valuenow', String(width));
    return width;
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

function chatsDisplayTitle(conv) {
    const title = String((conv && conv.title) || 'Untitled');
    const iso = conv && (conv.createdAt || conv.updatedAt);
    if (!iso) return title;
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return title;
    const stamp = date.toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
    return title + ' · ' + stamp;
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
    if (generationId && generationId.indexOf('gen-') !== 0) {
        Logger.warn(PLUGIN_ID + ': generation id does not look like an OpenRouter gen- id — '
            + generationId + ' (hydrate may 404; prefer X-Generation-Id)');
    }
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

function chatsParseRatingPayload(message) {
    if (!message || message.role !== 'user') return null;
    const content = String(message.content || '');
    if (!content.includes('Here is the ratings data for this contributor.')) return null;
    const fenced = content.match(/```json\s*([\s\S]*?)```/i);
    if (!fenced || !fenced[1]) return null;
    try {
        const payload = JSON.parse(fenced[1]);
        if (!payload || !payload.worker || !payload.scores
            || (!payload.scores.twqs && !payload.scores.qaqs)) {
            return null;
        }
        return payload;
    } catch (err) {
        Logger.warn(PLUGIN_ID + ': archived rating payload could not be parsed', err);
        return null;
    }
}

function chatsPrepareArchivedRatingCard(conv, state) {
    if (!state) return;
    state._archivedRatingPayload = null;
    if (!conv || conv.source !== 'explain-ratings') return;
    const messages = Array.isArray(state.messages) ? state.messages : [];
    for (const message of messages) {
        const payload = chatsParseRatingPayload(message);
        if (!payload) continue;
        message.hideInUi = true;
        state._archivedRatingPayload = payload;
        Logger.log(PLUGIN_ID + ': reconstructed archived rating payload — '
            + String((payload.worker && payload.worker.name) || 'unknown contributor'));
        return;
    }
}

function chatsRatingConfidenceTier(label) {
    const value = String(label || '').trim().toLowerCase();
    if (value === 'provisional') return 'provisional';
    if (value === 'high') return 'high';
    return 'standard';
}

function chatsRatingTierId(tier, existingId) {
    if (existingId) return String(existingId);
    const value = String(tier || '').trim().toLowerCase();
    const ids = {
        'poor': 'poor',
        'below average': 'below_average',
        'typical': 'typical',
        'above average': 'above_average',
        'top tier': 'top_tier',
    };
    return ids[value] || null;
}

function chatsRatingBlockFromPayload(score, scoreKind) {
    if (!score || score.score == null) return null;
    const volume = score.volume || {};
    const display = scoreKind === 'qaqs'
        ? {
            inScopeFeedbackCount: volume.feedbackRows,
            tenureDays: volume.tenureDays,
        }
        : {
            terminalTaskCount: volume.terminalTasks,
            tenureDays: volume.tenureDays,
        };
    return {
        score: Number(score.score),
        band: score.tier || null,
        tierId: chatsRatingTierId(score.tier, score.tierId),
        estimatedPercentile: score.estimatedPercentile,
        confidence: {
            label: score.confidence || '',
            tier: chatsRatingConfidenceTier(score.confidence),
        },
        display,
        axes: (Array.isArray(score.axes) ? score.axes : []).map((axis) => ({
            id: axis.id,
            label: axis.label,
            baseWeight: axis.weightPct != null && Number.isFinite(Number(axis.weightPct))
                ? Number(axis.weightPct) / 100
                : 0,
            score: axis.axisScorePct != null && Number.isFinite(Number(axis.axisScorePct))
                ? Number(axis.axisScorePct) / 100
                : null,
            defined: axis.defined !== false,
        })),
    };
}

function chatsArchivedRatingSlicesHtml(score, scoreKind, label, loader) {
    if (!score || !score.slices || !loader
        || typeof loader._ratingCohortSectionHtml !== 'function') {
        return '';
    }
    const axesById = new Map((Array.isArray(score.axes) ? score.axes : []).map((axis) => [
        String(axis.id || ''),
        axis,
    ]));
    const dimensions = [
        { id: 'team', label: 'Team' },
        { id: 'env', label: 'Environment' },
        { id: 'month', label: 'Month' },
    ];
    let sectionsHtml = '';
    let sliceCount = 0;
    for (const dimension of dimensions) {
        const slices = Array.isArray(score.slices[dimension.id])
            ? score.slices[dimension.id]
            : [];
        if (!slices.length) continue;
        sectionsHtml += '<div style="margin-top: 12px; font-size: 10px; font-weight: 700;'
            + ' letter-spacing: 0.02em; color: var(--muted-foreground, #64748b);'
            + ' text-transform: uppercase;">' + chatsEscHtml(dimension.label) + '</div>';
        for (const slice of slices) {
            if (!slice) continue;
            sliceCount += 1;
            const percentile = typeof loader._ratingFormatEstimatedPercentile === 'function'
                ? loader._ratingFormatEstimatedPercentile(slice.estimatedPercentile)
                : '';
            const scoreDisplay = [slice.tier || '', percentile].filter(Boolean).join(' · ') || '—';
            const volume = slice.volume != null ? String(slice.volume) + ' vol' : '';
            const sample = slice.sampleStatus ? String(slice.sampleStatus) + ' sample' : '';
            const prior = slice.priorSource ? String(slice.priorSource) + ' prior' : '';
            const hasDelta = slice.percentileDeltaFromOverall != null;
            const deltaValue = hasDelta ? Number(slice.percentileDeltaFromOverall) : null;
            const delta = hasDelta && Number.isFinite(deltaValue)
                ? 'Δ ' + (deltaValue > 0 ? '+' : '') + deltaValue + ' pct'
                : '';
            const seenAxes = new Set();
            const axes = [slice.strongestAxis, slice.weakestAxis]
                .filter((axis) => {
                    const id = String((axis && axis.id) || '');
                    if (!id || seenAxes.has(id)) return false;
                    seenAxes.add(id);
                    return true;
                })
                .map((axis) => {
                    const overall = axesById.get(String(axis.id || '')) || {};
                    return {
                        id: axis.id,
                        label: overall.label || axis.id,
                        baseWeight: overall.weightPct != null
                            ? Number(overall.weightPct) / 100
                            : 0,
                        score: axis.axisScorePct != null
                            ? Number(axis.axisScorePct) / 100
                            : null,
                        defined: axis.axisScorePct != null,
                    };
                });
            sectionsHtml += loader._ratingCohortSectionHtml({
                title: String(slice.key || '—'),
                scoreDisplay,
                weightOrMeta: [volume, sample, prior, delta].filter(Boolean).join(' · '),
                volume: slice.volume,
                provisional: slice.sampleStatus === 'provisional',
                tierId: chatsRatingTierId(slice.tier, slice.tierId),
                axes,
                expanded: true,
                scoreKind,
            });
        }
    }
    if (!sectionsHtml) return '';
    return '<details style="margin-top: 10px;">'
        + '<summary style="cursor: pointer; font-size: 11px; font-weight: 600;'
        + ' color: var(--foreground, #0f172a);">'
        + chatsEscHtml(label) + ' slice breakdown (' + sliceCount + ')</summary>'
        + '<div style="padding: 0 2px 4px;">' + sectionsHtml + '</div>'
        + '</details>';
}

function chatsArchivedRatingCardHtml(payload) {
    const loader = Context.dashboard && Context.dashboard._loader;
    if (!loader || typeof loader._ratingScoreBlockCompactHtml !== 'function') {
        if (!chatsRatingRendererMissingLogged) {
            Logger.warn(PLUGIN_ID + ': rating card renderer unavailable for archived conversation');
            chatsRatingRendererMissingLogged = true;
        }
        return '';
    }
    chatsRatingRendererMissingLogged = false;
    const scores = payload.scores || {};
    const twqs = chatsRatingBlockFromPayload(scores.twqs, 'twqs');
    const qaqs = chatsRatingBlockFromPayload(scores.qaqs, 'qaqs');
    const scoreHtml = (twqs
        ? loader._ratingScoreBlockCompactHtml('Task Writer Quality Score', twqs, 'tasks', {})
            + chatsArchivedRatingSlicesHtml(scores.twqs, 'twqs', 'TWQS', loader)
        : '')
        + (qaqs
            ? loader._ratingScoreBlockCompactHtml('QA Quality Score', qaqs, 'feedbacks', {})
                + chatsArchivedRatingSlicesHtml(scores.qaqs, 'qaqs', 'QAQS', loader)
            : '');
    if (!scoreHtml) return '';
    const box = typeof loader._panelBoxStyle === 'function' ? loader._panelBoxStyle() : '';
    const name = String((payload.worker && payload.worker.name) || 'Contributor');
    const weighting = String(payload.weighting || 'recency');
    const weightingLabel = weighting.charAt(0).toUpperCase() + weighting.slice(1);
    return '<div class="wf-dash-rating-summary" style="' + box + ' padding: 12px; width: 100%;'
        + ' min-width: 0; box-sizing: border-box;">'
        + '<div style="display: flex; justify-content: space-between; align-items: flex-start;'
        + ' gap: 8px; margin-bottom: 6px;">'
        + '<div style="font-size: 13px; font-weight: 600; color: var(--foreground, #0f172a);'
        + ' min-width: 0; overflow-wrap: anywhere;">' + chatsEscHtml(name) + '</div>'
        + '<div style="flex-shrink: 0; font-size: 10px; color: var(--muted-foreground, #64748b);">'
        + chatsEscHtml(weightingLabel) + ' weighting</div>'
        + '</div>'
        + scoreHtml
        + '</div>';
}

function chatsArchivedRatingFingerprint(payload) {
    if (!payload) return '';
    return [
        payload.engineVersion || '',
        payload.computedAt || '',
        payload.worker && payload.worker.name || '',
        payload.weighting || '',
    ].join('|');
}

function chatsSyncArchivedRatingCard(panel, state) {
    const host = panel && panel.querySelector('[data-wf-dash-chats-archived-rating]');
    if (!host) return;
    const payload = state && state._archivedRatingPayload ? state._archivedRatingPayload : null;
    if (!payload) {
        host.innerHTML = '';
        host.style.display = 'none';
        host.removeAttribute('data-wf-chats-rating-fingerprint');
        return;
    }
    const fingerprint = chatsArchivedRatingFingerprint(payload);
    if (host.getAttribute('data-wf-chats-rating-fingerprint') === fingerprint
        && host.innerHTML) {
        host.style.display = '';
        return;
    }
    const html = chatsArchivedRatingCardHtml(payload);
    if (!html) {
        host.innerHTML = '';
        host.style.display = 'none';
        host.removeAttribute('data-wf-chats-rating-fingerprint');
        return;
    }
    host.setAttribute('data-wf-chats-rating-fingerprint', fingerprint);
    host.setAttribute('aria-label', 'Archived rating card');
    host.style.cssText = 'display: block; width: min(100%, 640px); max-width: 100%;'
        + ' min-width: 0; margin: 0 auto; flex: 0 0 auto; box-sizing: border-box;'
        + ' color: var(--foreground, #0f172a); overflow: auto; max-height: 100%;';
    host.innerHTML = html;
}

function chatsRenderMessages(panel, state) {
    const chat = Context.aiChat;
    if (!chat || !state) return;
    chat.renderMessages(panel, state, chatsChatOpts());
    chatsSyncArchivedRatingCard(panel, state);
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
            Logger.debug(PLUGIN_ID + ': hydrating via generation id — ' + genId);
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
    const tried = ids.slice().reverse().join(', ');
    throw lastErr || new Error('Could not hydrate conversation (tried: ' + tried + ')');
}

function chatsChatOpts() {
    return {
        mountSelector: '[data-wf-dash-chats-mount]',
        exportSelector: '[data-wf-dash-chats-export]',
        wiredAttr: 'data-wf-dash-chats-wired',
        logTag: PLUGIN_ID,
        placeholder: 'Message…',
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
    const loader = Context.dashboard && Context.dashboard._loader;
    const handleStyle = loader && typeof loader._splitPanelHandleStyle === 'function'
        ? loader._splitPanelHandleStyle()
        : 'flex-shrink: 0; width: 10px; margin: 0 4px; align-self: stretch; cursor: col-resize;';
    const handleGrip = loader && typeof loader._splitPanelHandleGripHtml === 'function'
        ? loader._splitPanelHandleGripHtml()
        : '';
    return '<div data-wf-dash-chats-panel="1" style="display: flex; flex-direction: column; gap: 10px;'
        + ' height: 100%; min-height: 420px; box-sizing: border-box;">'
        + '<div data-wf-dash-chats-no-key style="display: none; font-size: 12px; line-height: 1.45;'
        + ' color: var(--muted-foreground, #64748b); padding: 12px;'
        + ' border: 1px dashed var(--border, #e2e8f0); border-radius: 8px;">'
        + 'Add an OpenRouter API key in the <strong>Settings</strong> tab to use Chats.'
        + ' Conversations require Input &amp; Output Logging enabled in your OpenRouter Observability settings'
        + ' so transcripts can be fetched by generation id.</div>'
        + '<div data-wf-dash-chats-body style="display: none; flex: 1 1 auto; min-height: 0;">'
        + '<div data-wf-dash-chats-body-row style="display: flex; gap: 0; height: 100%; min-height: 0; min-width: 0;">'
        + '<aside data-wf-dash-chats-sidebar style="width: 260px; flex-shrink: 0; display: flex;'
        + ' flex-direction: column; gap: 8px; min-height: 0; border: 1px solid var(--border, #e2e8f0);'
        + ' border-radius: 8px; padding: 8px; background: color-mix(in srgb, var(--muted, #f1f5f9) 40%, transparent);'
        + ' overflow: hidden;">'
        + '<button type="button" data-wf-dash-chats-new class="' + btnPrimary + '" style="width: 100%;">New Chat</button>'
        + '<div data-wf-dash-chats-list style="flex: 1 1 auto; overflow: auto; display: flex;'
        + ' flex-direction: column; gap: 10px;"></div>'
        + '</aside>'
        + '<div data-wf-dash-chats-resize-handle role="separator" aria-orientation="vertical"'
        + ' aria-label="Resize chats sidebar" aria-valuemin="' + CHATS_SIDEBAR_MIN_WIDTH + '"'
        + ' tabindex="0" title="Drag to resize chats sidebar" style="' + handleStyle + '">'
        + handleGrip + '</div>'
        + '<section style="flex: 1 1 auto; min-width: 0; min-height: 0; display: flex;'
        + ' flex-direction: column; gap: 8px; border: 1px solid var(--border, #e2e8f0);'
        + ' border-radius: 8px; padding: 10px;">'
        + '<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">'
        + '<div data-wf-dash-chats-title style="font-size: 13px; font-weight: 600;">New chat</div>'
        + '<button type="button" data-wf-dash-chats-export class="' + btn + '">Export</button>'
        + '</div>'
        + '<div data-wf-dash-chats-status style="display: none; font-size: 11px;"></div>'
        + '<div data-wf-dash-chats-content style="flex: 1 1 auto; min-width: 0; min-height: 0;'
        + ' width: 100%; max-width: 1564px; margin: 0 auto; display: grid;'
        + ' grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr));'
        + ' gap: 12px; align-items: stretch;">'
        + '<div data-wf-dash-chats-archived-rating style="display: none;"></div>'
        + '<div data-wf-dash-chats-chat-column style="width: 100%; max-width: 900px; min-width: 0;'
        + ' min-height: 280px; margin: 0 auto; display: flex; flex-direction: column;">'
        + '<div data-wf-dash-chats-mount style="flex: 1 1 auto; width: 100%; max-width: 100%;'
        + ' min-width: 0; min-height: 280px; display: flex; flex-direction: column;"></div>'
        + '</div></div>'
        + '</section></div></div></div>';
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
                    + ' display: block;">' + chatsEscHtml(chatsDisplayTitle(conv)) + '</span>'
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
    el.textContent = (src ? src.label + ' · ' : '') + chatsDisplayTitle(conv);
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
    chat.wireComposer(panel, chatsUi.chatState, Object.assign({}, chatsChatOpts(), chatsComposerHandlers(panel)));
    chatsRenderMessages(panel, chatsUi.chatState);
    Logger.log(PLUGIN_ID + ': new chat started');
}

function chatsComposerHandlers(panel) {
    const chat = Context.aiChat;
    return {
        onSend: (value) => void chatsSendMessage(panel, value),
        onStop: () => {
            const state = chatsUi.chatState;
            if (!state || !chat) return;
            chat.stopStream(state, chatsChatOpts());
            chat.setStreamingUi(panel, state, false, chatsChatOpts());
            chatsRenderMessages(panel, state);
        },
        onExport: () => {
            const state = chatsUi.chatState;
            if (!state || !chat) return;
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
    };
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
    chat.wireComposer(panel, state, Object.assign({}, chatsChatOpts(), chatsComposerHandlers(panel)));
    chatsRenderMessages(panel, state);
    try {
        const hydrated = await chatsFetchMessagesForConversation(conv);
        state.messages = hydrated.messages;
        state.lastGenerationId = hydrated.generationId;
        chatsPrepareArchivedRatingCard(conv, state);
        chatsRenderMessages(panel, state);
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

function chatsAttachSidebarResize(panel) {
    if (!panel || panel.dataset.wfChatsResizeAttached === '1') return;
    panel.dataset.wfChatsResizeAttached = '1';

    panel.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('[data-wf-dash-chats-resize-handle]');
        if (!handle || !panel.contains(handle)) return;
        const sidebar = panel.querySelector('[data-wf-dash-chats-sidebar]');
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!sidebar || !loader || typeof loader._beginColResizeDrag !== 'function') return;
        const startX = e.clientX;
        const startWidth = sidebar.getBoundingClientRect().width;
        loader._beginColResizeDrag(e, {
            onMove: (ev) => {
                chatsApplySidebarWidth(panel, startWidth + (ev.clientX - startX));
            },
            onUp: () => {
                const finalWidth = chatsApplySidebarWidth(panel, sidebar.getBoundingClientRect().width);
                chatsWriteSidebarWidth(finalWidth);
                Logger.log(PLUGIN_ID + ': sidebar resized — ' + Math.round(startWidth) + 'px→' + finalWidth + 'px');
            },
        });
    });

    panel.addEventListener('keydown', (e) => {
        const handle = e.target.closest('[data-wf-dash-chats-resize-handle]');
        if (!handle || !panel.contains(handle) || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        e.preventDefault();
        const previous = chatsApplySidebarWidth(panel);
        const next = chatsApplySidebarWidth(panel, previous + (e.key === 'ArrowLeft' ? -20 : 20));
        chatsWriteSidebarWidth(next);
        Logger.log(PLUGIN_ID + ': sidebar resized — ' + previous + 'px→' + next + 'px');
    });
}

function chatsWirePanel(panel) {
    if (!panel || panel.getAttribute('data-wf-dash-chats-bound') === '1') return;
    panel.setAttribute('data-wf-dash-chats-bound', '1');
    chatsEnsureBtnStyles();
    chatsAttachSidebarResize(panel);

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
        chat.wireComposer(
            panel,
            chatsEnsureChatState(),
            Object.assign({}, chatsChatOpts(), chatsComposerHandlers(panel))
        );
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
    chatsApplySidebarWidth(panel);
    chatsWirePanel(panel);
    if (!chatsUi.chatState) chatsStartNewChat(panel);
    else {
        chatsRenderSidebar(panel);
        chatsUpdateTitle(panel);
        const chat = Context.aiChat;
        if (chat && chatsUi.chatState) {
            chatsRenderMessages(panel, chatsUi.chatState);
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
    _version: '3.4',
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
            Logger.log(PLUGIN_ID + ': tab registered (Context.dashboardChats) v3.3');
            state.registered = true;
        }
    },
};
