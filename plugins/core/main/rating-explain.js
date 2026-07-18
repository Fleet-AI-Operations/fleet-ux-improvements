// ============= rating-explain.js =============
// Inline "Explain Ratings" chat for Worker Output Search rating cards.
//
// AI gating: the Explain Ratings button stays hidden unless
// Context.aiOpenRouter.hasStoredKey() is true. Actual OpenRouter calls still
// require Ops unlock to decrypt the key.
//
// Chat UI/streaming comes from Context.aiChat (plugins/libs/ai-chat.js → Deep Chat).
// Keep RATING_EXPLAIN_ABOUT in sync with _ratingsAboutSectionHtml /
// local/tw-qa-ratings/about-section.md when the About copy changes.

const PLUGIN_ID = 'rating-explain';
const RATING_EXPLAIN_SCOPE = '[data-wf-dash-rating-explain-panel]';

// Full Markdown mirror of the user-visible "About these ratings" section.
// Model-only payload guidance is appended; user-visible methodology is never removed.
const RATING_EXPLAIN_ABOUT = [
    '# About these ratings',
    '',
    'Up to two scores per contributor, each on a **0–100** scale:',
    '',
    '- **Task Writer Quality Score (TWQS)** — quality of the work they **authored**. Based on the WPS v1.2 model.',
    '- **QA Quality Score (QAQS)** — quality of the reviews they **performed**. Based on the QPS v2.1 model.',
    '',
    '## Dual weighting — Recency vs Flat',
    '',
    'Each card computes **two variants** of every score simultaneously. The card can toggle between them:',
    '',
    '- **Recency (default)** — applies half-life decay `exp(−ln(2)·age/30)` to activity inside the window, so recent events weigh more.',
    '- **Flat** — all in-scope events count equally.',
    '',
    'JSON export always includes **both** weighting variants. The card toggle only changes what is displayed. The payload\'s `weighting` field identifies the displayed variant.',
    '',
    '## Population tier',
    '',
    'The **primary display** is a population tier label (Poor, Below average, Typical, Above average, Top tier), with an **estimated percentile** shown beside it (for example, ~62nd). Team, environment, and month subset rows use the same tier + percentile pattern.',
    '',
    'Tiers use empirical cutoffs from the scored population (~10% / 20% / 40% / 20% / remainder): scores below p10 are Poor; p10–p30 Below average; p30–p70 Typical; p70 up to the top peg Above average; at/above the top peg Top tier.',
    '',
    '| TWQS tier | Flat score | Recency score |',
    '| --- | ---: | ---: |',
    '| Poor | < 55.725 | < 60 |',
    '| Below average | 55.725–61.41 | 60–64.23 |',
    '| Typical | 61.41–68.44 | 64.23–67.48 |',
    '| Above average | 68.44–80 | 67.48–80 |',
    '| Top tier | ≥ 80 | ≥ 80 |',
    '',
    '| QAQS tier | Flat score | Recency score |',
    '| --- | ---: | ---: |',
    '| Poor | < 49.14 | < 49.146 |',
    '| Below average | 49.14–54.526 | 49.146–54.602 |',
    '| Typical | 54.526–60.76 | 54.602–60.206 |',
    '| Above average | 60.76–70 | 60.206–70 |',
    '| Top tier | ≥ 70 | ≥ 70 |',
    '',
    'Top score pegs are absolute: **TWQS ≥ 80** and **QAQS ≥ 70**.',
    '',
    'Panel color follows the tier on a four-stop red→yellow→green ramp; Above average and Top tier share the top green. The raw 0–100 composite remains the internal score and export field; axis bars use raw axis sub-scores.',
    '',
    '## How to read a score',
    '',
    '- **Tier first, estimated percentile second.** The tier places the composite in the scored population; the percentile is a margin-clamped normal-model estimate of standing. The underlying 0–100 score uses empirical Bayes shrinkage toward the cohort prior and remains available in exports. Low-volume scores are valid estimates, but less certain.',
    '- Each score rolls up several **weighted axes**, shown highest-weight first. Where encrypted cohort baselines are available, the final score is 50% main score plus team, environment, and month channels. Provisional channels contribute half weight and transfer the remainder to main. Click a score panel to expand its team, environment, and month breakdown.',
    '- Team, environment, and month slice scores shrink toward a **subset prior** only when that baseline was shipped (TWQS: ≥ 500 tasks and ≥ 20 writers; QAQS: ≥ 500 feedback rows and ≥ 20 reviewers at generation time). Unshipped slices fall back to the global prior.',
    '- Every score carries a **confidence** badge — TWQS based on terminal task count, QAQS based on feedback row count.',
    '',
    '| Confidence | TWQS: terminal tasks in scope | QAQS: feedback rows in scope |',
    '| --- | ---: | ---: |',
    '| Provisional | < 10 | < 25 |',
    '| Standard | 10–49 | 25–99 |',
    '| High confidence | ≥ 50 | ≥ 100 |',
    '',
    '## What counts toward a score',
    '',
    '- Scores cover the **committed search window** and **hydrated result cards only**, regardless of which search toggles (tasks, QA, sessions, disputes, and so on) produced those results.',
    '- The **Filtered / All** scope toggle applies: Filtered respects sidebar filters; All uses every card in the current results tab.',
    '- With no date range, all history is eligible. With After/Before set, only events inside that window count — Recency applies within the window; Flat treats them equally.',
    '- Outcome Quality blends the current terminal calculation with a flat closure sub-score over production, discarded, and dismissed. The closure sub-score ignores bugged/flagged paths and has no recency decay. Disputes move a score only once **resolved**.',
    '- Self-reviews are excluded from all feedback axes.',
    '',
    '## The axes',
    '',
    '### Task Writer Quality Score (TWQS)',
    '',
    '| Axis | Weight | What it measures |',
    '| --- | ---: | --- |',
    '| Outcome Quality | 40% | Blend of current terminal quality and flat closure quality: production 1.0, discarded 0.5, dismissed 0.0. Closure excludes bugged/flagged paths. |',
    '| Positive Feedback Rate | 20% | Share of human feedback on their tasks that was positive (upvote or score ≥ Satisfactory). |',
    '| Task Rating Quality | 15% | Mean of explicit prompt-quality labels on their tasks: Bottom 10% = 0, Average = 0.5, Top 10% = 1. Unscored feedback is excluded. |',
    '| First-Pass Acceptance | 15% | Share of tasks accepted by the first human reviewer without a prior return. |',
    '| Dispute Loss Avoidance | 10% | Resolved dispute losses only. No disputes and dispute wins are neutral; only rejected writer disputes reduce the score. |',
    '',
    '### QA Quality Score (QAQS)',
    '',
    '| Axis | Weight | What it measures |',
    '| --- | ---: | --- |',
    '| Return Effectiveness | 40% | When they return a task, it reaches production on the next attempt rather than being returned again. |',
    '| Return Actionability | 25% | The task author responds positively to their return (the next human feedback is positive). |',
    '| Dispute Loss Avoidance | 20% | For sole-negative reviews, only disputes approved for the writer reduce the score. QA wins are neutral. |',
    '| Label Discrimination | 15% | How well explicit score labels (for example, Excellent / Unsatisfactory) differentiate task quality. Omitted when fewer than 10 feedback rows are in scope. |',
    '',
    '## Additional model-only payload guidance',
    '',
    '- Headline `tier`, `estimatedPercentile`, and `score` match the card.',
    '- `axisScorePct` is recency-weighted (when weighting is recency) and prior-shrunk; it is not a raw observed ratio.',
    '- Cite integer `observedCounts` for event totals. Never treat weighted decimals as counts.',
    '- `neutralNoEvidence: true` on a dispute-loss axis means zero resolved disputes; a prior-derived high score is **not** a strength.',
    '- `slices` are compact team/environment/month summaries. Prefer meaningful volume; for thin slices say “limited data suggests…”.',
].join('\n');

const RATING_EXPLAIN_SYSTEM_PROMPT = [
    'You are explaining contributor quality ratings from Fleet\'s Worker Output Search to an operations reviewer. You receive a compact methodology summary and a JSON payload for one contributor. Headline score fields already match the UI card (cohort-blended tier, estimated percentile, and composite). Axis rows are the main-score drivers; slices are compact team/environment/month contrasts.',
    '',
    'First reply structure:',
    '1. Holistic overview — one short paragraph per available score (TWQS = task writing, QAQS = QA reviewing) using the exact displayed tier and approximate percentile. Say what mainly drives the standing.',
    '2. Material strengths and struggles only — call out axes that clearly help or hurt. Never describe a dispute-loss axis with neutralNoEvidence (or zero resolved disputes) as a strength, even if axisScorePct is ~100.',
    '3. Notable slice contrasts — compare team/environment/month slices when volume and percentileDeltaFromOverall make the contrast meaningful. Prioritize higher-volume slices. For thin/provisional slices, use “limited data suggests…”, not definitive claims.',
    '',
    'Format every response as readable Markdown. Use descriptive `##`/`###` headings, short paragraphs, bullet lists, and **bold** labels or key findings to break up the response. Avoid dense walls of text. Do not force a table when bullets communicate the result more clearly.',
    '',
    'Evidence rules: cite integer observedCounts (e.g. “7 of 26 positive feedback events”). Never call weighted event equivalents task/feedback counts, and never imply the observed ratio must equal axisScorePct.',
    '',
    'When a user reports that visible result cards or manually counted events differ from the engine payload, first verify that their comparison is scoped to this contributor and the relevant rating role. TWQS counts work authored by the contributor; QAQS counts reviews performed by the contributor. Search results may include cards authored or reviewed by other people, and some axes count feedback rows rather than distinct cards. Explain these scope and unit differences before suggesting that data is missing.',
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
        mountSelector: '[data-wf-dash-rating-explain-mount]',
        exportSelector: '[data-wf-dash-rating-explain-export]',
        wiredAttr: 'data-wf-explain-wired',
        logTag: PLUGIN_ID,
        placeholder: 'Ask a follow-up…',
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

function ratingExplainExportIdentity(workerId) {
    const dash = Context.dashboard && Context.dashboard._loader;
    const report = dash && dash._state && dash._state.ratingsReport;
    const worker = ((report && report.workers) || [])
        .find((entry) => String(entry.workerId) === String(workerId));
    const name = String((worker && worker.name) || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    const id = String(workerId || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return [name, id].filter((part, index, parts) => part && parts.indexOf(part) === index).join('-') || 'worker';
}

function ratingExplainExportTimestampSlug(iso) {
    return String(iso || new Date().toISOString()).replace(/[:.]/g, '-');
}

function ratingExplainWorkerTitleHint(workerId) {
    const dash = Context.dashboard && Context.dashboard._loader;
    const report = dash && dash._state && dash._state.ratingsReport;
    const worker = ((report && report.workers) || [])
        .find((entry) => String(entry.workerId) === String(workerId));
    if (worker && worker.name) return String(worker.name);
    const short = String(workerId || '').slice(0, 8);
    return short ? ('Explain: ' + short) : 'Explain Ratings';
}

function ratingExplainRecordTurn(workerId, turn) {
    const api = Context.dashboardChats;
    if (!api || typeof api.recordTurn !== 'function') {
        Logger.warn(PLUGIN_ID + ': dashboardChats unavailable — turn not indexed');
        return;
    }
    const t = turn || {};
    api.recordTurn({
        source: 'explain-ratings',
        conversationKey: String(workerId || ''),
        titleHint: ratingExplainWorkerTitleHint(workerId),
        generationId: t.generationId,
        model: t.model,
    });
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
            onTurnDone: (turn) => ratingExplainRecordTurn(workerId, turn),
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
            onTurnDone: (turn) => ratingExplainRecordTurn(workerId, turn),
        }));
    } catch (err) {
        Logger.error(PLUGIN_ID + ': follow-up stream failed — ' + workerId, err);
    }
}

function wireRatingExplainPanel(panel, workerId, state) {
    const chat = ratingExplainChat();
    if (!chat || typeof chat.wireComposer !== 'function') return;
    chat.wireComposer(panel, state, Object.assign({}, ratingExplainChatOpts(), {
        onSend: (text) => sendRatingExplainFollowUp(panel, workerId, state, text),
        onStop: () => {
            chat.stopStream(state, ratingExplainChatOpts());
            chat.setStreamingUi(panel, state, false, ratingExplainChatOpts());
            chat.renderMessages(panel, state, ratingExplainChatOpts());
        },
        onExport: () => {
            const exportedAt = new Date().toISOString();
            chat.exportConversation(state, Object.assign({}, ratingExplainChatOpts(), {
                exportFilename: 'conversation-' + ratingExplainExportIdentity(workerId) + '-'
                    + ratingExplainExportTimestampSlug(exportedAt) + '.json',
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
    const btnStop = ratingExplainBtnClass('basic', 'compact');
    const safeId = ratingExplainEscHtml(workerId);
    return '<div data-wf-dash-rating-explain-panel="1" data-wf-dash-rating-worker="' + safeId + '"'
        + ' role="region" aria-label="Explain ratings chat" style="display: none; flex-direction: column; gap: 8px;'
        + ' margin-top: 12px; padding: 10px; border-radius: 8px;'
        + ' border: 1px solid color-mix(in srgb, var(--border, #e2e8f0) 80%, transparent);'
        + ' background: color-mix(in srgb, var(--muted-foreground, #64748b) 6%, var(--card, #fff));">'
        + '<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">'
        + '<div style="font-size: 11px; font-weight: 600;">Explain Ratings</div>'
        + '<button type="button" class="' + btnStop + '" data-wf-dash-rating-explain-export="1">Export</button>'
        + '</div>'
        + '<div data-wf-dash-rating-explain-mount="1" style="display: flex; flex-direction: column;'
        + ' min-height: 280px; height: 320px;"></div>'
        + '</div>';
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
    _version: '2.0',
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
        Logger.log(PLUGIN_ID + ': module registered (Context.ratingExplain) v2.0');
    }
};
