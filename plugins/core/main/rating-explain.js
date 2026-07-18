// ============= rating-explain.js =============
// Inline "Explain Ratings" chat for Worker Output Search rating cards.
//
// AI gating: the Explain Ratings button stays hidden unless
// Context.aiOpenRouter.hasStoredKey() is true. Actual OpenRouter calls still
// require Ops unlock to decrypt the key.
//
// Chat UI/streaming comes from Context.aiChat (plugins/libs/ai-chat.js).
// Keep RATING_EXPLAIN_ABOUT in sync with _ratingsAboutSectionHtml /
// local/tw-qa-ratings/about-section.md when the About copy changes.

const PLUGIN_ID = 'rating-explain';
const RATING_EXPLAIN_SCOPE = '[data-wf-dash-rating-explain-panel]';

const RATING_EXPLAIN_ABOUT = [
    '# Ratings methodology (compact)',
    '',
    'Two scores on a 0–100 scale:',
    '- **TWQS** (Task Writer Quality Score) — quality of work the person authored (WPS v1.2).',
    '- **QAQS** (QA Quality Score) — quality of reviews the person performed (QPS v2.1).',
    '',
    'Cards (and this payload\'s headline fields) show the **cohort-blended** population tier plus muted estimated percentile. Raw 0–100 is the internal composite.',
    '',
    '## Dual weighting',
    '- **Recency** (default): half-life decay exp(−ln(2)·age/30) inside the search window.',
    '- **Flat**: all in-scope events weigh equally.',
    'The payload\'s `weighting` field matches the card toggle.',
    '',
    '## Payload fields to trust',
    '- Headline `tier` / `estimatedPercentile` / `score` match the card.',
    '- `axisScorePct` is recency-weighted (when weighting is recency) and prior-shrunk — not a raw observed ratio.',
    '- Cite integer `observedCounts` for event totals (tasks, feedback, labels, disputes). Never treat weighted decimals as counts.',
    '- `neutralNoEvidence: true` on dispute-loss axes means zero resolved disputes — prior-derived high scores are **not** strengths.',
    '- `tierGate` when present means an extreme tier was volume-demoted; when null, do not speculate about gating.',
    '- `slices` are compact team/env/month summaries (tier, percentile delta, volume, strongest/weakest axis). Prefer meaningful volume; for thin slices say “limited data suggests…”.',
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
    '## Confidence & volume gates',
    '- TWQS confidence: Provisional <10 terminals; Standard 10–49; High ≥50.',
    '- QAQS confidence: Provisional <25 feedback rows; Standard 25–99; High ≥100.',
    '- Extreme tiers soft-gated: Poor needs TWQS ≥25 / QAQS ≥50; Top tier needs TWQS ≥50 / QAQS ≥100. Gate changes the tier label only, never the percentile.',
    '',
    '## Cohort blend & priors',
    'When encrypted baselines are unlocked, the displayed score blends ~50% main + team/env/month channels. Slices shrink toward a subset prior only when that baseline was shipped; otherwise global prior.',
].join('\n');

const RATING_EXPLAIN_SYSTEM_PROMPT = [
    'You are explaining contributor quality ratings from Fleet\'s Worker Output Search to an operations reviewer. You receive a compact methodology summary and a JSON payload for one contributor. Headline score fields already match the UI card (cohort-blended tier, estimated percentile, and composite). Axis rows are the main-score drivers; slices are compact team/environment/month contrasts.',
    '',
    'First reply structure:',
    '1. Holistic overview — one short paragraph per available score (TWQS = task writing, QAQS = QA reviewing) using the exact displayed tier and approximate percentile. Say what mainly drives the standing.',
    '2. Material strengths and struggles only — call out axes that clearly help or hurt. Never describe a dispute-loss axis with neutralNoEvidence (or zero resolved disputes) as a strength, even if axisScorePct is ~100.',
    '3. Notable slice contrasts — compare team/environment/month slices when volume and percentileDeltaFromOverall make the contrast meaningful. Prioritize higher-volume slices. For thin/provisional slices, use “limited data suggests…”, not definitive claims.',
    '',
    'Evidence rules: cite integer observedCounts (e.g. “7 of 26 positive feedback events”). Never call weighted event equivalents task/feedback counts, and never imply the observed ratio must equal axisScorePct. When tierGate is present, explicitly say the score-qualified extreme tier was volume-gated to the displayed tier and cite current/required volume; when tierGate is null/absent, do not mention gating.',
    '',
    'Do not enumerate every axis, restate methodology, or explain formulas/shrinkage/priors/calibration unless asked. Ground every claim in the payload; if something is missing, say so. Keep answers compact and plain-spoken.',
].join('\n');

const RATING_EXPLAIN_INITIAL_USER_PREFIX = [
    'Here is the ratings data for this contributor. Produce the initial overview as specified.',
    '',
    '```json',
].join('\n');

const RATING_EXPLAIN_INITIAL_USER_SUFFIX = '\n```';

/** @type {Map<string, object>} */
const ratingExplainByWorker = new Map();

function ratingExplainChat() {
    return Context.aiChat || null;
}

function ratingExplainChatOpts() {
    return {
        messagesSelector: '[data-wf-dash-rating-explain-messages]',
        sendSelector: '[data-wf-dash-rating-explain-send]',
        stopSelector: '[data-wf-dash-rating-explain-stop]',
        exportSelector: '[data-wf-dash-rating-explain-export]',
        inputSelector: '[data-wf-dash-rating-explain-input]',
        wiredAttr: 'data-wf-explain-wired',
        logTag: PLUGIN_ID,
    };
}

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
    const chat = ratingExplainChat();
    if (chat && typeof chat.hasAiKey === 'function') return chat.hasAiKey();
    return !!(Context.aiOpenRouter
        && typeof Context.aiOpenRouter.hasStoredKey === 'function'
        && Context.aiOpenRouter.hasStoredKey());
}

function getRatingExplainState(workerId) {
    const id = String(workerId || '').trim();
    if (!id) return null;
    if (!ratingExplainByWorker.has(id)) {
        const chat = ratingExplainChat();
        const base = chat && typeof chat.createState === 'function'
            ? chat.createState({ open: false, overviewStarted: false })
            : {
                open: false,
                overviewStarted: false,
                messages: [],
                streaming: false,
                streamAbort: null,
                streamGen: 0,
            };
        ratingExplainByWorker.set(id, base);
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
    const chat = ratingExplainChat();
    if (!chat || typeof chat.sendTurn !== 'function') {
        Logger.error(PLUGIN_ID + ': Context.aiChat unavailable');
        return;
    }
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
        chat.renderMessages(panel, state, ratingExplainChatOpts());
        Logger.error(PLUGIN_ID + ': overview payload failed — ' + workerId, err);
        return;
    }

    const userContent = RATING_EXPLAIN_INITIAL_USER_PREFIX + json + RATING_EXPLAIN_INITIAL_USER_SUFFIX;
    Logger.log(PLUGIN_ID + ': overview request — ' + workerId + ' · ' + userContent.length + ' chars');
    try {
        await chat.sendTurn(panel, state, Object.assign({}, ratingExplainChatOpts(), {
            userContent,
            hideInUi: true,
            displayContent: 'Generate overview from this card\'s ratings data.',
            systemContent: RATING_EXPLAIN_SYSTEM_PROMPT + '\n\n' + RATING_EXPLAIN_ABOUT,
        }));
        Logger.log(PLUGIN_ID + ': overview done — ' + workerId);
    } catch (err) {
        Logger.error(PLUGIN_ID + ': overview stream failed — ' + workerId, err);
    }
}

async function sendRatingExplainFollowUp(panel, workerId, state, userText) {
    const chat = ratingExplainChat();
    if (!chat || typeof chat.sendTurn !== 'function') return;
    const text = String(userText || '').trim();
    if (!text || state.streaming) return;
    Logger.log(PLUGIN_ID + ': follow-up — ' + workerId + ' · ' + text.length + ' chars');
    try {
        await chat.sendTurn(panel, state, Object.assign({}, ratingExplainChatOpts(), {
            userText: text,
            systemContent: RATING_EXPLAIN_SYSTEM_PROMPT + '\n\n' + RATING_EXPLAIN_ABOUT,
        }));
    } catch (err) {
        Logger.error(PLUGIN_ID + ': follow-up stream failed — ' + workerId, err);
    }
}

function wireRatingExplainPanel(panel, workerId, state) {
    const chat = ratingExplainChat();
    if (!chat || typeof chat.wireComposer !== 'function') return;
    chat.wireComposer(panel, Object.assign({}, ratingExplainChatOpts(), {
        onSend: (text) => sendRatingExplainFollowUp(panel, workerId, state, text),
        onStop: () => {
            chat.stopStream(state, ratingExplainChatOpts());
            chat.setStreamingUi(panel, state, false, ratingExplainChatOpts());
            chat.renderMessages(panel, state, ratingExplainChatOpts());
        },
        onExport: () => {
            const safeWorker = String(workerId || 'worker')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 48) || 'worker';
            chat.exportConversation(state, Object.assign({}, ratingExplainChatOpts(), {
                exportFilename: 'rating-' + safeWorker + '-conversation-'
                    + new Date().toISOString().slice(0, 10) + '.json',
                exportMetadata: { feature: 'explain-ratings', workerId: String(workerId || '') },
            }));
        },
    }));
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
        + '<textarea data-wf-dash-rating-explain-input="1" rows="2" placeholder="Ask a follow-up…" style="' + inputStyle + '"></textarea>'
        + '<div style="display: flex; justify-content: flex-end; gap: 6px;">'
        + '<button type="button" class="' + btnStop + '" data-wf-dash-rating-explain-stop="1" style="display: none;">Stop</button>'
        + '<button type="button" class="' + btnStop + '" data-wf-dash-rating-explain-export="1">Export Conversation</button>'
        + '<button type="button" class="' + btnSend + '" data-wf-dash-rating-explain-send="1">Send</button>'
        + '</div></div></div>';
}

function mountRatingExplainPanel(root, workerId) {
    const chat = ratingExplainChat();
    const state = getRatingExplainState(workerId);
    const card = findRatingCard(root, workerId);
    const panel = findExplainPanel(card);
    if (!state || !panel) return;
    ensureRatingExplainBtnStyles();
    panel.style.display = state.open ? 'flex' : 'none';
    panel.setAttribute('aria-hidden', state.open ? 'false' : 'true');
    wireRatingExplainPanel(panel, workerId, state);
    if (chat) {
        chat.renderMessages(panel, state, ratingExplainChatOpts());
        chat.setStreamingUi(panel, state, !!state.streaming, ratingExplainChatOpts());
    }
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
    _version: '1.3',
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
        Logger.log(PLUGIN_ID + ': module registered (Context.ratingExplain) v1.2');
    }
};
