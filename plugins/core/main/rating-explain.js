// ============= rating-explain.js =============
// Inline "Explain Ratings" chat for Worker Output Search rating cards.
//
// AI gating: the Explain Ratings button stays hidden unless
// Context.aiOpenRouter.hasStoredKey() is true. Actual OpenRouter calls still
// require Ops unlock to decrypt the key.
//
// Keep RATING_EXPLAIN_ABOUT in sync with _ratingsAboutSectionHtml /
// local/tw-qa-ratings/about-section.md when the About copy changes.

const PLUGIN_ID = 'rating-explain';
const RATING_EXPLAIN_SCOPE = '[data-wf-dash-rating-explain-panel]';

// Compact methodology summary sent as system context (not the full About HTML).
const RATING_EXPLAIN_ABOUT = [
    '# Ratings methodology (compact)',
    '',
    'Two scores on a 0–100 scale:',
    '- **TWQS** (Task Writer Quality Score) — quality of work the person authored (WPS v1.2).',
    '- **QAQS** (QA Quality Score) — quality of reviews the person performed (QPS v2.1).',
    '',
    'Cards show a **population tier** (Poor / Below average / Typical / Above average / Top tier) plus a muted **estimated percentile** (e.g. ~62nd). Raw 0–100 is the internal composite; axis bars still use raw axis sub-scores.',
    '',
    '## Dual weighting',
    '- **Recency** (default): half-life decay exp(−ln(2)·age/30) inside the search window.',
    '- **Flat**: all in-scope events weigh equally.',
    'The payload\'s `weighting` field matches the card toggle.',
    '',
    '## TWQS axes',
    '- Outcome Quality 40% — terminal + closure blend (production/discarded/dismissed; closure ignores bugged/flagged).',
    '- Positive Feedback Rate 20% — share of human feedback that is positive.',
    '- Task Rating Quality 15% — mean of Bottom=0 / Average=0.5 / Top=1 labels.',
    '- First-Pass Acceptance 15% — accepted by first human reviewer without a prior return.',
    '- Dispute Loss Avoidance 10% — only rejected writer disputes reduce the score.',
    '',
    '## QAQS axes',
    '- Return Effectiveness 40% — returned tasks reach production next attempt.',
    '- Return Actionability 25% — author responds positively after their return.',
    '- Dispute Loss Avoidance 20% — sole-negative reviews: writer-approved disputes reduce the score.',
    '- Label Discrimination 15% — how well score labels differentiate quality (omitted below 10 feedback rows).',
    '',
    '## Confidence',
    '- TWQS: Provisional <10 terminals; Standard 10–49; High ≥50.',
    '- QAQS: Provisional <25 feedback rows; Standard 25–99; High ≥100.',
    '',
    '## Cohort blend & priors',
    'When encrypted baselines are unlocked, the final score is ~50% main + team/env/month channels. Slices shrink toward a subset prior only when that baseline was shipped; otherwise global prior. Axis scores use empirical Bayes shrinkage toward the prior.',
].join('\n');

const RATING_EXPLAIN_SYSTEM_PROMPT = [
    'You are explaining contributor quality ratings from Fleet\'s Worker Output Search to an operations reviewer. You will receive a methodology summary and a JSON payload containing one contributor\'s computed ratings: composite scores, population tiers, estimated percentiles, confidence, per-axis sub-scores with the underlying counts (the "evidence"), and team/environment/month breakdowns.',
    '',
    'Your first reply must be a brief overview: one short paragraph per score (TWQS = task writing, QAQS = QA reviewing) stating the tier and estimated percentile and what mainly drives it, then call out only axes or cohort slices that are exceptionally strong or weak, citing the specific evidence numbers (e.g. "9 of 41 tasks were returned on first review"). If volume is low or confidence is provisional, say the rating is based on thin evidence. Do not enumerate every axis, do not restate the methodology, and do not explain formulas, shrinkage, priors, or calibration unless the reviewer explicitly asks. Ground every claim in the payload; if something is not in the data, say you don\'t have it rather than guessing. Keep answers compact and plain-spoken; percentiles are estimates, so phrase them as approximate.',
].join('\n');

const RATING_EXPLAIN_INITIAL_USER_PREFIX = [
    'Here is the ratings data for this contributor. Produce the initial overview as specified.',
    '',
    '```json',
].join('\n');

const RATING_EXPLAIN_INITIAL_USER_SUFFIX = '\n```';

/** @type {Map<string, { open: boolean, messages: Array, streaming: boolean, streamAbort: any, streamGen: number, overviewStarted: boolean }>} */
const ratingExplainByWorker = new Map();

function ratingExplainBtnClass(variant, size) {
    if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
        return Context.uiLib.btnClass(variant, size);
    }
    return 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size;
}

function ensureRatingExplainBtnStyles() {
    if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
        Context.uiLib.ensureButtonStyles(RATING_EXPLAIN_SCOPE);
        Context.uiLib.ensureButtonStyles('.wf-dash-rating-card');
    }
}

function hasRatingExplainAiKey() {
    return !!(Context.aiOpenRouter
        && typeof Context.aiOpenRouter.hasStoredKey === 'function'
        && Context.aiOpenRouter.hasStoredKey());
}

function getRatingExplainState(workerId) {
    const id = String(workerId || '').trim();
    if (!id) return null;
    if (!ratingExplainByWorker.has(id)) {
        ratingExplainByWorker.set(id, {
            open: false,
            messages: [],
            streaming: false,
            streamAbort: null,
            streamGen: 0,
            overviewStarted: false,
        });
    }
    return ratingExplainByWorker.get(id);
}

function clearRatingExplainTranscripts() {
    for (const [, state] of ratingExplainByWorker) {
        if (state.streamAbort && typeof state.streamAbort.abort === 'function') {
            try { state.streamAbort.abort(); } catch (_e) { /* ignore */ }
        }
    }
    ratingExplainByWorker.clear();
    Logger.log(PLUGIN_ID + ': cleared explain transcripts (ratings recomputed)');
}

function findRatingCard(root, workerId) {
    const id = String(workerId || '').trim();
    if (!root || !id) return null;
    const cards = root.querySelectorAll
        ? root.querySelectorAll('.wf-dash-rating-card[data-wf-dash-rating-worker]')
        : [];
    for (let i = 0; i < cards.length; i++) {
        if (String(cards[i].getAttribute('data-wf-dash-rating-worker') || '') === id) {
            return cards[i];
        }
    }
    return null;
}

function findExplainPanel(card) {
    return card ? card.querySelector('[data-wf-dash-rating-explain-panel]') : null;
}

function renderRatingExplainMessages(panel, state) {
    const list = panel && panel.querySelector('[data-wf-dash-rating-explain-messages]');
    if (!list || !state) return;
    const md = Context.userStoryMarkdown;
    if (md && typeof md.ensureProseStyles === 'function') md.ensureProseStyles();
    list.innerHTML = '';
    (state.messages || []).forEach((msg, idx) => {
        // Hide the synthetic initial user payload from the visible transcript.
        if (msg.hideInUi) return;
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
        list.appendChild(row);
    });
    list.scrollTop = list.scrollHeight;
}

function updateRatingExplainStreamingBubble(panel, state, content) {
    const idx = state.messages.length - 1;
    const msg = state.messages[idx];
    if (!msg || msg.role !== 'assistant') return;
    msg.content = content;
    const bubble = panel.querySelector('[data-wf-chat-bubble="' + idx + '"]');
    if (!bubble) {
        renderRatingExplainMessages(panel, state);
        return;
    }
    const md = Context.userStoryMarkdown;
    if (md && typeof md.markdownToHtml === 'function') {
        bubble.innerHTML = md.markdownToHtml(content || '');
        if (md.PROSE_ATTR) bubble.setAttribute(md.PROSE_ATTR, '');
    } else {
        bubble.textContent = content || '';
    }
    const list = panel.querySelector('[data-wf-dash-rating-explain-messages]');
    if (list) list.scrollTop = list.scrollHeight;
}

function setRatingExplainStreamingUi(panel, state, streaming) {
    state.streaming = !!streaming;
    const sendBtn = panel.querySelector('[data-wf-dash-rating-explain-send]');
    const stopBtn = panel.querySelector('[data-wf-dash-rating-explain-stop]');
    const input = panel.querySelector('[data-wf-dash-rating-explain-input]');
    if (sendBtn) sendBtn.disabled = !!streaming;
    if (stopBtn) stopBtn.style.display = streaming ? '' : 'none';
    if (input) input.disabled = !!streaming;
}

function stopRatingExplainStream(workerId) {
    const state = getRatingExplainState(workerId);
    if (!state) return;
    if (state.streamAbort && typeof state.streamAbort.abort === 'function') {
        try { state.streamAbort.abort(); } catch (_e) { /* ignore */ }
    }
    state.streamAbort = null;
    state.streamGen += 1;
    const last = state.messages[state.messages.length - 1];
    if (last && last.role === 'assistant' && last.streaming) {
        last.streaming = false;
        if (!last.content) last.content = '(stopped)';
    }
    Logger.log(PLUGIN_ID + ': chat stream stopped — ' + workerId);
}

async function runRatingExplainStream(panel, state, apiMessages) {
    const ai = Context.aiOpenRouter;
    if (!ai || typeof ai.chatCompletionStream !== 'function') {
        throw new Error('AI OpenRouter API is not available');
    }
    state.streamGen += 1;
    const gen = state.streamGen;
    setRatingExplainStreamingUi(panel, state, true);
    let assembled = '';

    return new Promise((resolve, reject) => {
        let settled = false;
        const settleOk = (text) => {
            if (settled) return;
            settled = true;
            state.streamAbort = null;
            if (gen === state.streamGen) setRatingExplainStreamingUi(panel, state, false);
            resolve(text);
        };
        const settleErr = (err) => {
            if (settled) return;
            settled = true;
            state.streamAbort = null;
            if (gen === state.streamGen) setRatingExplainStreamingUi(panel, state, false);
            reject(err);
        };

        Promise.resolve(ai.chatCompletionStream({
            messages: apiMessages,
            onDelta: (delta) => {
                if (gen !== state.streamGen) return;
                assembled += String(delta || '');
                updateRatingExplainStreamingBubble(panel, state, assembled);
            },
            onDone: (result) => {
                if (gen !== state.streamGen) {
                    settleOk(assembled);
                    return;
                }
                const full = result && result.fullText != null ? String(result.fullText) : assembled;
                assembled = full;
                updateRatingExplainStreamingBubble(panel, state, assembled);
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

function buildRatingExplainApiMessages(state) {
    const api = [
        { role: 'system', content: RATING_EXPLAIN_SYSTEM_PROMPT + '\n\n' + RATING_EXPLAIN_ABOUT },
    ];
    for (let i = 0; i < state.messages.length; i++) {
        const m = state.messages[i];
        if (m.streaming) break;
        if (m.role === 'user' || m.role === 'assistant') {
            api.push({ role: m.role, content: m.content || '' });
        }
    }
    return api;
}

function buildExplainPayloadJson(workerId) {
    const dash = Context.dashboard && Context.dashboard._loader;
    const engine = Context.ratingEngine;
    if (!dash || !engine || typeof engine.buildLlmExplainData !== 'function') {
        throw new Error('Rating explain data is not available');
    }
    const report = dash._state && dash._state.ratingsReport;
    const workers = (report && report.workers) || [];
    const worker = workers.find((w) => String(w.workerId) === String(workerId));
    if (!worker) throw new Error('Worker rating not found');
    const weighting = (typeof dash._ratingWorkerWeighting === 'function')
        ? dash._ratingWorkerWeighting(workerId)
        : 'recency';
    const payload = engine.buildLlmExplainData(worker, report, weighting);
    return JSON.stringify(payload, null, 2);
}

async function startRatingExplainOverview(panel, workerId, state) {
    if (state.overviewStarted || state.streaming) return;
    state.overviewStarted = true;
    let json;
    try {
        json = buildExplainPayloadJson(workerId);
    } catch (err) {
        state.overviewStarted = false;
        state.messages.push({
            role: 'assistant',
            content: 'Could not build ratings data: ' + (err && err.message ? err.message : String(err)),
        });
        renderRatingExplainMessages(panel, state);
        Logger.error(PLUGIN_ID + ': overview payload failed — ' + workerId, err);
        return;
    }

    const userContent = RATING_EXPLAIN_INITIAL_USER_PREFIX + json + RATING_EXPLAIN_INITIAL_USER_SUFFIX;
    state.messages.push({
        role: 'user',
        content: userContent,
        hideInUi: true,
        displayContent: 'Generate overview from this card\'s ratings data.',
    });
    state.messages.push({ role: 'assistant', content: '', streaming: true });
    renderRatingExplainMessages(panel, state);
    Logger.log(PLUGIN_ID + ': overview request — ' + workerId + ' · ' + userContent.length + ' chars');

    try {
        const full = await runRatingExplainStream(panel, state, buildRatingExplainApiMessages(state));
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === 'assistant') {
            last.content = full || '';
            last.streaming = false;
        }
        renderRatingExplainMessages(panel, state);
        Logger.log(PLUGIN_ID + ': overview done — ' + workerId + ' · ' + (full || '').length + ' chars');
    } catch (err) {
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === 'assistant') {
            last.content = 'Error: ' + (err && err.message ? err.message : String(err));
            last.streaming = false;
        }
        renderRatingExplainMessages(panel, state);
        setRatingExplainStreamingUi(panel, state, false);
        Logger.error(PLUGIN_ID + ': overview stream failed — ' + workerId, err);
    }
}

async function sendRatingExplainFollowUp(panel, workerId, state, userText) {
    const text = String(userText || '').trim();
    if (!text || state.streaming) return;
    state.messages.push({ role: 'user', content: text });
    state.messages.push({ role: 'assistant', content: '', streaming: true });
    renderRatingExplainMessages(panel, state);
    Logger.log(PLUGIN_ID + ': follow-up — ' + workerId + ' · ' + text.length + ' chars');

    try {
        const full = await runRatingExplainStream(panel, state, buildRatingExplainApiMessages(state));
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === 'assistant') {
            last.content = full || '';
            last.streaming = false;
        }
        renderRatingExplainMessages(panel, state);
        Logger.log(PLUGIN_ID + ': follow-up done — ' + workerId + ' · ' + (full || '').length + ' chars');
    } catch (err) {
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === 'assistant') {
            last.content = 'Error: ' + (err && err.message ? err.message : String(err));
            last.streaming = false;
        }
        renderRatingExplainMessages(panel, state);
        setRatingExplainStreamingUi(panel, state, false);
        Logger.error(PLUGIN_ID + ': follow-up stream failed — ' + workerId, err);
    }
}

function wireRatingExplainPanel(panel, workerId, state) {
    if (!panel || panel.getAttribute('data-wf-explain-wired') === '1') return;
    panel.setAttribute('data-wf-explain-wired', '1');
    const sendBtn = panel.querySelector('[data-wf-dash-rating-explain-send]');
    const stopBtn = panel.querySelector('[data-wf-dash-rating-explain-stop]');
    const input = panel.querySelector('[data-wf-dash-rating-explain-input]');

    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            const text = input ? input.value : '';
            if (input) input.value = '';
            sendRatingExplainFollowUp(panel, workerId, state, text);
        });
    }
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            stopRatingExplainStream(workerId);
            setRatingExplainStreamingUi(panel, state, false);
            renderRatingExplainMessages(panel, state);
        });
    }
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = input.value;
                input.value = '';
                sendRatingExplainFollowUp(panel, workerId, state, text);
            }
        });
    }
}

function ratingExplainEscHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function ratingExplainPanelHtml(workerId) {
    const btnSend = ratingExplainBtnClass('primary', 'compact');
    const btnStop = ratingExplainBtnClass('basic', 'compact');
    const safeId = ratingExplainEscHtml(workerId);
    const inputStyle = 'width: 100%; padding: 7px 10px; font-size: 12px; border: 1px solid var(--input, #cbd5e1);'
        + ' border-radius: 6px; background: var(--background, #fff); color: var(--foreground, #0f172a);'
        + ' box-sizing: border-box; resize: vertical; min-height: 56px;';
    return '<div data-wf-dash-rating-explain-panel="1" data-wf-dash-rating-worker="' + safeId + '"'
        + ' role="region" aria-label="Explain ratings chat" style="display: none; flex-direction: column; gap: 8px;'
        + ' margin-top: 12px; padding: 10px; border-radius: 8px;'
        + ' border: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 80%, transparent);'
        + ' background: color-mix(in srgb, var(--muted-foreground, #64748b) 6%, var(--card, #fff));">'
        + '<div style="font-size: 11px; font-weight: 600;">Explain Ratings</div>'
        + '<div data-wf-dash-rating-explain-messages="1" style="display: flex; flex-direction: column; gap: 10px;'
        + ' max-height: 320px; overflow: auto; padding: 4px 2px;"></div>'
        + '<div style="display: flex; flex-direction: column; gap: 6px;">'
        + '<textarea data-wf-dash-rating-explain-input="1" rows="2" placeholder="Ask a follow-up… (Enter to send, Shift+Enter for newline)" style="' + inputStyle + '"></textarea>'
        + '<div style="display: flex; justify-content: flex-end; gap: 6px;">'
        + '<button type="button" class="' + btnStop + '" data-wf-dash-rating-explain-stop="1" style="display: none;">Stop</button>'
        + '<button type="button" class="' + btnSend + '" data-wf-dash-rating-explain-send="1">Send</button>'
        + '</div></div></div>';
}

function mountRatingExplainPanel(root, workerId) {
    const state = getRatingExplainState(workerId);
    const card = findRatingCard(root, workerId);
    const panel = findExplainPanel(card);
    if (!state || !panel) return;
    ensureRatingExplainBtnStyles();
    panel.style.display = state.open ? 'flex' : 'none';
    panel.setAttribute('aria-hidden', state.open ? 'false' : 'true');
    wireRatingExplainPanel(panel, workerId, state);
    renderRatingExplainMessages(panel, state);
    setRatingExplainStreamingUi(panel, state, !!state.streaming);
    if (state.open && !state.overviewStarted) {
        startRatingExplainOverview(panel, workerId, state);
    }
}

function remountOpenRatingExplainPanels(root) {
    if (!root || !hasRatingExplainAiKey()) return;
    ensureRatingExplainBtnStyles();
    for (const [workerId, state] of ratingExplainByWorker) {
        if (!state.open) continue;
        mountRatingExplainPanel(root, workerId);
    }
}

function toggleRatingExplain(root, workerId) {
    if (!hasRatingExplainAiKey()) {
        Logger.warn(PLUGIN_ID + ': explain skipped — no OpenRouter key stored');
        return;
    }
    const state = getRatingExplainState(workerId);
    if (!state) return;
    state.open = !state.open;
    Logger.log(PLUGIN_ID + ': explain ' + (state.open ? 'opened' : 'closed') + ' — ' + workerId);
    const card = findRatingCard(root, workerId);
    const btn = card && card.querySelector('[data-wf-dash-rating-explain]');
    if (btn) {
        btn.setAttribute('aria-pressed', state.open ? 'true' : 'false');
        btn.textContent = state.open ? 'Hide Explanation' : 'Explain Ratings';
    }
    mountRatingExplainPanel(root, workerId);
}

function isRatingExplainOpen(workerId) {
    const id = String(workerId || '').trim();
    const state = ratingExplainByWorker.get(id);
    return !!(state && state.open);
}

const RatingExplain = {
    hasAiKey: hasRatingExplainAiKey,
    isOpen: isRatingExplainOpen,
    panelHtml: ratingExplainPanelHtml,
    toggle: toggleRatingExplain,
    remountOpen: remountOpenRatingExplainPanels,
    clearTranscripts: clearRatingExplainTranscripts,
    ABOUT: RATING_EXPLAIN_ABOUT,
    SYSTEM_PROMPT: RATING_EXPLAIN_SYSTEM_PROMPT,
};

const plugin = {
    id: PLUGIN_ID,
    name: 'Rating Explain',
    description: 'AI chat to explain Worker Output Search rating cards via OpenRouter',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        if (state && state.registered) {
            Logger.debug(PLUGIN_ID + ': already registered — skipping re-init');
            return;
        }
        Context.ratingExplain = RatingExplain;
        if (state) state.registered = true;
        Logger.log(PLUGIN_ID + ': module registered (Context.ratingExplain) v1.0');
    }
};
